'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { FollowupConfig, FollowupOverview, FollowupQueueItem } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  watching: 'Aguardando',
  step1_sent: 'Aguardando (após "Nome?")',
};

const ACTION_LABELS: Record<string, string> = {
  nudge: '"Nome?"',
  photo: 'Foto (visualização única)',
};

export default function FollowupPage() {
  const [config, setConfig] = useState<FollowupConfig | null>(null);
  const [queue, setQueue] = useState<FollowupQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/followup');
      if (!res.ok) throw new Error('Falha ao carregar');
      const data: FollowupOverview = await res.json();
      setConfig(data.config);
      setQueue(data.queue);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/followup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          step1_message_template: config.step1_message_template,
          step2_photo_url: config.step2_photo_url,
          step2_caption: config.step2_caption,
        }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setSavedAt(Date.now());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePause(id: number) {
    setError(null);
    try {
      const res = await fetch('/api/followup/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Falha ao pausar');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading && !config) {
    return (
      <div className="container">
        <p className="empty-state">Carregando…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container">
        <div className="error-banner">{error || 'Não foi possível carregar a configuração.'}</div>
      </div>
    );
  }

  return (
    <div className="container">
      {error && <div className="error-banner">{error}</div>}

      <h2>Follow-up automático (leads de anúncio)</h2>
      <form onSubmit={handleSave}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Automação ativa
        </label>

        <label htmlFor="step1">Mensagem do passo 1 (15 min de silêncio)</label>
        <input
          id="step1"
          type="text"
          value={config.step1_message_template}
          onChange={(e) => setConfig({ ...config, step1_message_template: e.target.value })}
          placeholder="{{name}}?"
        />
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          Use <code>{'{{name}}'}</code> para o primeiro nome do contato.
        </p>

        <label htmlFor="photoUrl">URL da foto do passo 2 (1 dia de silêncio)</label>
        <input
          id="photoUrl"
          type="text"
          value={config.step2_photo_url}
          onChange={(e) => setConfig({ ...config, step2_photo_url: e.target.value })}
        />

        <label htmlFor="caption">Legenda da foto (opcional)</label>
        <input
          id="caption"
          type="text"
          value={config.step2_caption}
          onChange={(e) => setConfig({ ...config, step2_caption: e.target.value })}
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <p style={{ fontSize: 11, color: '#059669', marginTop: 6 }}>Salvo!</p>
        )}
      </form>

      <div className="divider" />

      <h2>Fila atual ({queue.length})</h2>
      {queue.length === 0 && <p className="empty-state">Ninguém na fila agora.</p>}
      {queue.map((item) => (
        <div className="reminder-item" key={item.id}>
          <div className="meta">
            <span className={`badge ${item.status === 'watching' ? 'pending' : 'sent'}`}>
              {STATUS_LABELS[item.status] || item.status}
            </span>
            <span>
              {item.next_action_at ? new Date(item.next_action_at).toLocaleString('pt-BR') : '—'}
            </span>
          </div>
          <div>
            {(item.contact_name || '').replace(/^~/, '')} — próxima:{' '}
            {item.next_action ? ACTION_LABELS[item.next_action] : '—'}
          </div>
          <button className="secondary" style={{ marginTop: 6 }} onClick={() => handlePause(item.id)}>
            Pausar
          </button>
        </div>
      ))}
    </div>
  );
}
