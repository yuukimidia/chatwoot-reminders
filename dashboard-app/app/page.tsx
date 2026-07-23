'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { ChatwootAppContext, ScheduledMessage } from '@/lib/types';

function defaultMessage(contactName: string): string {
  return `Olá ${contactName || ''}, passando para lembrar da sua consulta amanhã. Qualquer dúvida, estamos à disposição!`.trim();
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function Page() {
  const [context, setContext] = useState<ChatwootAppContext | null>(null);
  const [reminders, setReminders] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appointmentAt, setAppointmentAt] = useState('');
  const [daysBefore, setDaysBefore] = useState(1);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [message, setMessage] = useState('');

  // Recebe o contexto (conversation/contact/account) que o Chatwoot injeta no iframe.
  // Ref: https://www.chatwoot.com/docs/product/others/dashboard-apps
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.event === 'appContext') {
        const data = event.data.data as ChatwootAppContext;
        setContext(data);
        if (!message) {
          setMessage(defaultMessage(data.contact?.name));
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!context) return;
    void loadReminders(context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.conversation?.id]);

  async function loadReminders(ctx: ChatwootAppContext) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reminders?accountId=${ctx.account.id}&conversationId=${ctx.conversation.id}`
      );
      if (!res.ok) throw new Error('Falha ao carregar lembretes');
      setReminders(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const computedSendAt = useMemo(() => {
    if (!appointmentAt) return null;
    const appointment = new Date(appointmentAt);
    const sendDate = new Date(appointment);
    sendDate.setDate(sendDate.getDate() - daysBefore);
    const [hours, minutes] = reminderTime.split(':').map(Number);
    sendDate.setHours(hours, minutes, 0, 0);
    return sendDate;
  }, [appointmentAt, daysBefore, reminderTime]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!context || !computedSendAt || !appointmentAt) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: context.account.id,
          inbox_id: context.conversation.inbox_id,
          conversation_id: context.conversation.id,
          contact_id: context.contact.id,
          contact_name: context.contact.name,
          contact_phone: context.contact.phone_number,
          appointment_at: new Date(appointmentAt).toISOString(),
          reminder_message: message,
          send_at: computedSendAt.toISOString(),
          created_by: context.currentAgent?.email ?? null,
        }),
      });
      if (!res.ok) throw new Error('Falha ao agendar lembrete');
      setAppointmentAt('');
      setMessage(defaultMessage(context.contact.name));
      await loadReminders(context);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    if (!context) return;
    setError(null);
    try {
      const res = await fetch(`/api/reminders/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: context.account.id }),
      });
      if (!res.ok) throw new Error('Falha ao cancelar lembrete');
      await loadReminders(context);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!context) {
    return (
      <div className="container">
        <p className="empty-state">Carregando contexto do Chatwoot…</p>
      </div>
    );
  }

  return (
    <div className="container">
      {error && <div className="error-banner">{error}</div>}

      <h2>Agendar lembrete</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="appointmentAt">Data/hora da consulta</label>
        <input
          id="appointmentAt"
          type="datetime-local"
          value={appointmentAt}
          onChange={(e) => setAppointmentAt(e.target.value)}
          min={toDatetimeLocalValue(new Date())}
          required
        />

        <label htmlFor="daysBefore">Enviar quantos dias antes</label>
        <input
          id="daysBefore"
          type="number"
          min={0}
          max={30}
          value={daysBefore}
          onChange={(e) => setDaysBefore(Number(e.target.value))}
          required
        />

        <label htmlFor="reminderTime">Horário de envio</label>
        <input
          id="reminderTime"
          type="time"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
          required
        />

        <label htmlFor="message">Mensagem</label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />

        {computedSendAt && (
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Será enviado em {computedSendAt.toLocaleString('pt-BR')}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Agendando…' : 'Agendar lembrete'}
        </button>
      </form>

      <div className="divider" />

      <h2>Lembretes desta conversa</h2>
      {loading && <p className="empty-state">Carregando…</p>}
      {!loading && reminders.length === 0 && (
        <p className="empty-state">Nenhum lembrete agendado.</p>
      )}
      {reminders.map((reminder) => (
        <div className="reminder-item" key={reminder.id}>
          <div className="meta">
            <span className={`badge ${reminder.status}`}>{reminder.status}</span>
            <span>{new Date(reminder.send_at).toLocaleString('pt-BR')}</span>
          </div>
          <div>{reminder.reminder_message}</div>
          {reminder.status === 'pending' && (
            <button className="secondary" style={{ marginTop: 6 }} onClick={() => handleCancel(reminder.id)}>
              Cancelar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
