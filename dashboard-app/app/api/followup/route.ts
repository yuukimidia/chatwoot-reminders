import { NextResponse } from 'next/server';
import { callN8nWebhook } from '@/lib/n8n';
import type { FollowupOverview } from '@/lib/types';

// GET /api/followup
export async function GET() {
  try {
    const overview = await callN8nWebhook<FollowupOverview>('/webhook/followup-overview', {
      method: 'GET',
    });
    return NextResponse.json(overview);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Falha ao buscar dados do follow-up' }, { status: 502 });
  }
}
