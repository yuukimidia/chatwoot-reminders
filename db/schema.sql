-- Schema para o sistema de agendamento de lembretes via WhatsApp/Chatwoot
-- Recomendado: usar um banco Postgres separado do banco interno do Chatwoot
-- (ex: um novo database no mesmo Postgres da VPS, ou um Postgres gerenciado).

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id              BIGSERIAL PRIMARY KEY,

    -- Identificação no Chatwoot (isola dados entre os 3 clientes)
    account_id      INTEGER NOT NULL,
    inbox_id        INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    contact_id      INTEGER NOT NULL,
    contact_name    TEXT,
    contact_phone   TEXT,

    -- Dados do agendamento
    appointment_at  TIMESTAMPTZ NOT NULL,   -- data/hora da consulta
    reminder_message TEXT NOT NULL,          -- texto que será enviado
    send_at         TIMESTAMPTZ NOT NULL,    -- quando o lembrete deve ser disparado

    -- Controle de envio
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'canceled', 'failed')),
    sent_at         TIMESTAMPTZ,
    failure_reason  TEXT,

    created_by      TEXT,                   -- nome/e-mail do agente que agendou
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para as duas consultas mais frequentes:
-- 1) o cron do n8n buscando o que está pendente e vencido
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending_due
    ON scheduled_messages (status, send_at)
    WHERE status = 'pending';

-- 2) o Dashboard App listando os lembretes de uma conversa específica
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation
    ON scheduled_messages (account_id, conversation_id);

-- Mantém updated_at em dia
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_messages_updated_at ON scheduled_messages;
CREATE TRIGGER trg_scheduled_messages_updated_at
    BEFORE UPDATE ON scheduled_messages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();


-- =====================================================================
-- Régua de follow-up para leads de anúncio que pararam de responder
-- =====================================================================
-- Uma linha por conversa. "watch_message_id" ancora o período de silêncio
-- atual: é o id da mensagem (do agente) que iniciou a espera. Sempre que o
-- scan encontra uma mensagem nova nesse campo que NÃO é uma das que a
-- própria automação enviou (step1_message_id / step2_message_id), reinicia
-- o relógio — presume-se reengajamento manual do agente.
CREATE TABLE IF NOT EXISTS followup_state (
    id                     BIGSERIAL PRIMARY KEY,

    account_id             INTEGER NOT NULL,
    inbox_id               INTEGER NOT NULL,
    conversation_id        INTEGER NOT NULL,
    contact_id             INTEGER,
    contact_name           TEXT,
    contact_phone          TEXT,

    is_ad_lead             BOOLEAN,             -- NULL = ainda não verificado

    watch_message_id       BIGINT NOT NULL,     -- mensagem que iniciou o silêncio atual
    last_agent_message_at  TIMESTAMPTZ NOT NULL,

    step1_sent_at          TIMESTAMPTZ,
    step1_message_id       BIGINT,

    step2_sent_at          TIMESTAMPTZ,
    step2_message_id       BIGINT,

    status                 TEXT NOT NULL DEFAULT 'watching'
                           CHECK (status IN ('watching', 'step1_sent', 'step2_sent', 'stopped', 'excluded')),

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (account_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_followup_state_active
    ON followup_state (status)
    WHERE status IN ('watching', 'step1_sent');

DROP TRIGGER IF EXISTS trg_followup_state_updated_at ON followup_state;
CREATE TRIGGER trg_followup_state_updated_at
    BEFORE UPDATE ON followup_state
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Mapeia inbox -> instância/token da Uazapi (usado só pelo passo 2, que
-- envia direto pela Uazapi em vez de pelo Chatwoot). Preencha os tokens
-- reais rodando os comandos do README — não deixe valores reais aqui
-- neste arquivo versionado no git.
CREATE TABLE IF NOT EXISTS whatsapp_instances (
    inbox_id        INTEGER PRIMARY KEY,
    instance_name   TEXT NOT NULL,
    uazapi_token    TEXT NOT NULL
);

-- Configuração editável da régua de follow-up (linha única, id sempre 1).
-- Controlada pela tela /followup do Dashboard App — permite ligar/desligar
-- a automação inteira e trocar o texto/foto sem mexer no workflow do n8n.
CREATE TABLE IF NOT EXISTS followup_config (
    id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    step1_message_template  TEXT NOT NULL DEFAULT '{{name}}?',
    step2_photo_url         TEXT NOT NULL DEFAULT 'https://chatwoot-reminders.vercel.app/followup-photo.jpg',
    step2_caption           TEXT NOT NULL DEFAULT '',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO followup_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_followup_config_updated_at ON followup_config;
CREATE TRIGGER trg_followup_config_updated_at
    BEFORE UPDATE ON followup_config
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
