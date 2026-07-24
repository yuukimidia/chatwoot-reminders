import { NextRequest, NextResponse } from 'next/server';
import { callN8nWebhook } from '@/lib/n8n';
import type { CreateReminderInput, ScheduledMessage } from '@/lib/types';

// GET /api/reminders?accountId=1&conversationId=42
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId');
  const conversationId = request.nextUrl.searchParams.get('conversationId');

  if (!accountId || !conversationId) {
    return NextResponse.json(
      { error: 'accountId e conversationId são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const reminders = await callN8nWebhook<ScheduledMessage[]>('/webhook/list-reminders', {
      method: 'GET',
      searchParams: { accountId, conversationId },
    });
    return NextResponse.json(reminders);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Falha ao buscar lembretes', debug: (error as Error).message },
      { status: 502 }
    );
  }
}

// POST /api/reminders
export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreateReminderInput;

  const requiredFields: (keyof CreateReminderInput)[] = [
    'account_id',
    'inbox_id',
    'conversation_id',
    'contact_id',
    'appointment_at',
    'reminder_message',
    'send_at',
  ];
  const missing = requiredFields.filter((field) => !body[field] && body[field] !== 0);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Campos obrigatórios faltando: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const created = await callN8nWebhook<ScheduledMessage>('/webhook/schedule-reminder', {
      method: 'POST',
      body,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao agendar lembrete' }, { status: 502 });
  }
}
