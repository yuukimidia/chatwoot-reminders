import { NextRequest, NextResponse } from 'next/server';
import { callN8nWebhook } from '@/lib/n8n';
import type { FollowupQueueItem } from '@/lib/types';

// POST /api/followup/pause
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id?: number };

  if (!body.id) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
  }

  try {
    const updated = await callN8nWebhook<FollowupQueueItem>('/webhook/followup-pause', {
      method: 'POST',
      body: { id: body.id },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao pausar' }, { status: 502 });
  }
}
