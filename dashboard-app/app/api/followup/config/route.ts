import { NextRequest, NextResponse } from 'next/server';
import { callN8nWebhook } from '@/lib/n8n';
import type { FollowupConfig } from '@/lib/types';

// POST /api/followup/config
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<FollowupConfig>;

  if (
    typeof body.enabled !== 'boolean' ||
    typeof body.step1_message_template !== 'string' ||
    typeof body.step2_photo_url !== 'string' ||
    typeof body.step2_caption !== 'string'
  ) {
    return NextResponse.json({ error: 'Campos inválidos' }, { status: 400 });
  }

  try {
    const updated = await callN8nWebhook<FollowupConfig>('/webhook/followup-update-config', {
      method: 'POST',
      body,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao salvar configuração' }, { status: 502 });
  }
}
