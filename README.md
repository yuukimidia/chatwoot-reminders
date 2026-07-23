# Lembretes de Consulta — Chatwoot + n8n + Postgres + Vercel

Sistema de agendamento de mensagens de lembrete (ex: "consulta amanhã") integrado
diretamente na interface do Chatwoot, para os 3 clientes/WhatsApp atendidos.

## Como funciona

1. O agente abre uma conversa no Chatwoot e vê, na sidebar, o **Dashboard App**
   (um iframe hospedado na Vercel) com um formulário de "Agendar lembrete".
2. Ao salvar, o app chama uma API interna (Next.js) que repassa para um
   **webhook do n8n**, que grava o registro no **Postgres**.
3. Um **workflow n8n com Cron** roda a cada 15 minutos, busca lembretes
   pendentes cujo horário de envio já chegou, e dispara a mensagem via
   **API do Chatwoot** (`POST /api/v1/accounts/:id/conversations/:id/messages`).
   Como o envio passa pela API do Chatwoot, ele sai pelo WhatsApp certo
   (Evolution API/Baileys) automaticamente, sem o n8n precisar saber qual
   instância usar — e a mensagem fica registrada no histórico da conversa.

```
Chatwoot (iframe) → Vercel (Next.js, API proxy) → n8n (webhooks + cron) → Postgres
                                                          ↓
                                                  API do Chatwoot → WhatsApp
```

## Estrutura

- `db/schema.sql` — schema do Postgres (tabela `scheduled_messages`)
- `dashboard-app/` — app Next.js que roda como Dashboard App do Chatwoot (deploy na Vercel)
- `n8n/workflows/*.json` — 4 workflows importáveis no n8n

## 1. Banco de dados

Crie um Postgres **separado do banco interno do Chatwoot** (pode ser um novo
database na mesma instância Postgres da VPS, ou um serviço gerenciado tipo
Neon/Supabase). Rode:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## 2. n8n

1. Em **Settings → Variables** (ou variáveis de ambiente do container n8n),
   configure:
   - `WEBHOOK_SHARED_SECRET` — string aleatória (`openssl rand -hex 32`), usada
     para autenticar as chamadas vindas do Dashboard App.
   - `CHATWOOT_BASE_URL` — ex: `https://seu-chatwoot.suaempresa.com.br`
   - `CHATWOOT_API_TOKEN` — access token de um **agente** do Chatwoot com
     acesso às contas dos 3 clientes (Perfil → Configurações de acesso à API).
     Se os 3 clientes forem contas separadas no Chatwoot, esse agente precisa
     estar adicionado nas 3 contas.
2. Importe os 4 workflows de `n8n/workflows/` (**Import from File**).
3. Em cada node Postgres, aponte a credencial `Postgres - Reminders` para o
   banco criado no passo 1.
4. Ative os 4 workflows. Anote as URLs geradas pelos nodes **Webhook**:
   - `POST {n8n}/webhook/schedule-reminder`
   - `GET {n8n}/webhook/list-reminders`
   - `PATCH {n8n}/webhook/cancel-reminder`
   - (o cron não expõe URL, roda sozinho)

> Os workflows já validam o header `X-Webhook-Secret` contra
> `WEBHOOK_SHARED_SECRET` antes de tocar no banco — sem isso, qualquer pessoa
> que descobrisse a URL do webhook conseguiria ler/escrever lembretes dos 3
> clientes.

## 3. Dashboard App (Vercel)

```bash
cd dashboard-app
npm install
```

Configure as variáveis de ambiente (local: copie `.env.example` para
`.env.local`; na Vercel: Project Settings → Environment Variables):

- `N8N_BASE_URL` — URL base do seu n8n
- `N8N_WEBHOOK_SECRET` — o mesmo valor de `WEBHOOK_SHARED_SECRET` do n8n
- `CHATWOOT_BASE_URL` — URL do seu Chatwoot (usada na CSP `frame-ancestors`,
  pra só ele conseguir carregar o iframe)

Teste localmente:

```bash
npm run dev
```

Deploy:

```bash
npx vercel deploy --prod
```

## 4. Registrar o Dashboard App no Chatwoot

Em **cada uma das 3 contas** do Chatwoot:

1. Vá em **Settings → Integrations → Dashboard Apps**.
2. Clique em **Add new Dashboard App**.
3. Nome: `Lembretes de Consulta`. URL: a URL publicada na Vercel
   (ex: `https://chatwoot-reminders.vercel.app`).
4. Salve. O app passa a aparecer como uma aba na sidebar de toda conversa.

## Fluxo de uso

1. Agente abre a conversa do contato que marcou consulta.
2. Na aba do Dashboard App, preenche data/hora da consulta (padrão: lembrete
   1 dia antes, 09:00 — ambos editáveis) e a mensagem.
3. Clica em "Agendar lembrete" — fica listado como `pending`.
4. No horário configurado, o cron do n8n envia a mensagem pela conversa e
   marca como `sent`. Se falhar (ex: número inválido, instância caiu), marca
   como `failed` com o motivo em `failure_reason`.
5. É possível cancelar um lembrete `pending` a qualquer momento pela mesma tela.

## Pontos em aberto / decisões a confirmar

- **Multi-conta vs. multi-inbox**: os workflows já isolam por `account_id`,
  então funcionam nos dois cenários. Se os 3 clientes forem contas separadas,
  confirme que o token do agente em `CHATWOOT_API_TOKEN` tem acesso às 3.
- **Frequência do cron**: 15 minutos é um bom equilíbrio para lembretes de
  "1 dia antes". Ajuste no node `Every 15 min` se quiser granularidade maior.
- **Múltiplos agentes API**: se preferir isolar por cliente (um token por
  conta), dá pra trocar o node HTTP Request por um `Switch` que escolhe a
  credencial/token com base no `account_id`.
