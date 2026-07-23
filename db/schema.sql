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
