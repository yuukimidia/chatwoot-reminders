// Helper server-side para chamar os webhooks do n8n.
// Roda só no backend (API routes), então o segredo nunca chega ao navegador.

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

if (!N8N_BASE_URL || !N8N_WEBHOOK_SECRET) {
  // Falha alto e cedo em vez de silenciosamente chamar URLs inválidas.
  console.warn(
    'N8N_BASE_URL ou N8N_WEBHOOK_SECRET não configurados. Configure-os no .env.local / Vercel.'
  );
}

export async function callN8nWebhook<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; searchParams?: Record<string, string> }
): Promise<T> {
  const url = new URL(path, N8N_BASE_URL);
  if (init.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': N8N_WEBHOOK_SECRET ?? '',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`n8n webhook ${path} falhou (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}
