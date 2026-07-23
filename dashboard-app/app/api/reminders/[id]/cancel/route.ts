import { NextRequest, NextResponse } from 'next/server';
import { callN8nWebhook } from '@/lib/n8n';
import type { ScheduledMessage } from '@/lib/types';

// PATCH /api/reminders/:id/cancel
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { accountId } = (await request.json().catch(() => ({}))) as { accountId?: number };

  if (!accountId) {
    return NextResponse.json({ error: 'accountId é obrigatório' }, { status: 400 });
  }

  try {
    const updated = await callN8nWebhook<ScheduledMessage>('/webhook/cancel-reminder', {
      method: 'PATCH',
      body: { id: Number(params.id), account_id: accountId },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao cancelar lembrete' }, { status: 502 });
  }
}
