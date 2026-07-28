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

- `db/schema.sql` — schema do Postgres (`scheduled_messages`, `followup_state`, `whatsapp_instances`)
- `dashboard-app/` — app Next.js que roda como Dashboard App do Chatwoot (deploy na Vercel)
- `n8n/workflows/*.json` — workflows importáveis no n8n (agendamento + follow-up automático)

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

## 5. Follow-up automático de leads de anúncio

Além do agendamento manual, existe uma segunda automação totalmente
automática: para contatos que vieram de anúncio (Click-to-WhatsApp) e
pararam de responder depois que o agente falou algo, o sistema manda:

- **15 min de silêncio** → `"{Primeiro nome}?"` pela API do Chatwoot (fica
  registrado normalmente na conversa).
- **1 dia de silêncio** (contado do mesmo ponto, não do passo de 15 min) →
  a foto configurada, em **visualização única**, enviada **direto pela
  Uazapi** (não pelo Chatwoot — a API do Chatwoot não expõe esse recurso
  específico do WhatsApp).

Não precisa de nenhuma ação manual: o workflow `Followup - Scan and Send`
varre sozinho as conversas abertas dos 3 inboxes a cada 15 minutos.

### Como identifica quem é lead de anúncio

A primeira mensagem da conversa é comparada com o padrão de texto que o
próprio anúncio pré-preenche (`[PROTOCOLO ####]` ou "vim dos anúncios").
Esse resultado fica guardado (`is_ad_lead`) e não é reconsultado depois —
se a convenção de texto dos seus anúncios mudar, ajuste o regex no node
**Check Ad Pattern** do workflow.

### Como evita duplicar/repetir mensagens

O workflow rastreia o **id da mensagem** que abriu o período de silêncio
(`watch_message_id`). Quando ele mesmo manda o "Nome?" ou a foto, isso não
é confundido com uma nova mensagem do agente — o relógio só reinicia se
aparecer uma mensagem *diferente* das que a própria automação gerou (sinal
de que o agente voltou a falar manualmente).

### Quando para

- Contato respondeu → marca `stopped`, nunca mais manda nada nessa janela
  de silêncio.
- Contato já tem consulta agendada no sistema de lembretes → é ignorado
  em qualquer etapa.
- Depois do passo 2 (foto), a conversa fica travada em `step2_sent`
  (estado final) — não reinicia sozinha, mesmo que o agente mande outra
  mensagem depois.

### Configuração

1. Rode de novo o `db/schema.sql` (é idempotente, só cria o que ainda não
   existe) para criar as tabelas `followup_state` e `whatsapp_instances`.
2. Preencha `whatsapp_instances` com os tokens reais da Uazapi (não deixe
   isso no `schema.sql`, rode como um comando à parte):
   ```sql
   INSERT INTO whatsapp_instances (inbox_id, instance_name, uazapi_token) VALUES
     (6, 'dr-sergio', 'TOKEN_DR_SERGIO'),
     (5, 'drmoises', 'TOKEN_DRMOISES'),
     (7, 'dra-letycia', 'TOKEN_DRA_LETYCIA')
   ON CONFLICT (inbox_id) DO UPDATE SET
     instance_name = EXCLUDED.instance_name,
     uazapi_token = EXCLUDED.uazapi_token;
   ```
3. Adicione a variável de ambiente `UAZAPI_BASE_URL` (ex:
   `https://sua-instancia.uazapi.com`) nos serviços `n8n_n8n_worker` e
   `n8n_n8n_editor`, do mesmo jeito que as outras (`docker service update
   --env-add ...`).
4. Importe `n8n/workflows/followup-scan.json`. Ele tem **7 nodes de
   Postgres** — aponte todos para a credencial `Postgres - Reminders`:
   Stop If Watching, Upsert Watch, Save Ad Check, Compute Action, Get
   Uazapi Token, Save Step1, Save Step2.
5. A foto usada no passo 2 é `dashboard-app/public/followup-photo.jpg`,
   servida pela URL pública da Vercel — para trocar, basta substituir o
   arquivo e fazer o deploy de novo.
6. Ative o workflow.

> Este workflow assume `account_id = 1` fixo (todos os 3 clientes são
> inboxes dentro da mesma conta do Chatwoot). Se isso não for verdade no
> seu caso, ajuste as queries e a URL da API do Chatwoot que usam `/accounts/1/`.

## Pontos em aberto / decisões a confirmar

- **Multi-conta vs. multi-inbox**: os workflows já isolam por `account_id`,
  então funcionam nos dois cenários. Se os 3 clientes forem contas separadas,
  confirme que o token do agente em `CHATWOOT_API_TOKEN` tem acesso às 3.
- **Frequência do cron**: 15 minutos é um bom equilíbrio para lembretes de
  "1 dia antes". Ajuste no node `Every 15 min` se quiser granularidade maior.
- **Múltiplos agentes API**: se preferir isolar por cliente (um token por
  conta), dá pra trocar o node HTTP Request por um `Switch` que escolhe a
  credencial/token com base no `account_id`.
