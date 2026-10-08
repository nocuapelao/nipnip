import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, Square, RotateCcw, RefreshCw } from 'lucide-react';
import { botsAPI } from '../services/api';

const TYPE_LABELS = {
  webhook: 'Webhook',
  facs: 'FACs',
  tickets: 'Tickets',
  discord: 'Discord'
};

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusBadge({ status }) {
  const map = {
    online: { cls: 'badge-online', label: 'Online' },
    offline: { cls: 'badge-offline', label: 'Offline' },
    error: { cls: 'badge-error', label: 'Erro' },
    restarting: { cls: 'badge-restarting', label: 'Reiniciando' }
  };
  const s = map[status] || map.offline;
  return (
    <span className={`badge ${s.cls}`}>
      <span className={`status-dot ${status}`} />
      {s.label}
    </span>
  );
}

export default function BotDetails() {
  const { id } = useParams();
  const [bot, setBot] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [showTokenForm, setShowTokenForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [botRes, logsRes] = await Promise.all([
        botsAPI.get(id),
        botsAPI.logs(id, 100)
      ]);
      setBot(botRes.data.bot);
      setLogs(logsRes.data.logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      if (action === 'start') await botsAPI.start(id);
      else if (action === 'stop') await botsAPI.stop(id);
      else if (action === 'restart') await botsAPI.restart(id);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro na acao');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTokenUpdate = async (e) => {
    e.preventDefault();
    if (!newToken.trim()) return;
    setActionLoading(true);
    try {
      await botsAPI.updateToken(id, newToken.trim());
      setNewToken('');
      setShowTokenForm(false);
      alert('Token atualizado. Inicie o bot novamente.');
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar token');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="text-muted">Carregando...</div>;
  if (!bot) return <div className="text-muted">Bot nao encontrado. <Link to="/bots">Voltar</Link></div>;

  return (
    <div>
      <div className="flex-between mb-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/bots" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{bot.name}</h1>
            <p className="text-sm text-muted">{TYPE_LABELS[bot.type]} · ID: {bot.id.slice(0, 8)}...</p>
          </div>
        </div>
        <StatusBadge status={bot.status} />
      </div>

      <div className="grid-3 mb-2">
        <div className="stat-card">
          <div className="stat-label">Uptime</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{formatUptime(bot.uptime)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Memoria</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{bot.memory != null ? `${bot.memory} MB` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reinicializacoes</div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>{bot.restart_count || 0}</div>
        </div>
      </div>

      <div className="grid-2 mb-2">
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '1rem' }}>Informacoes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.875rem' }}>
            <div className="flex-between">
              <span className="text-muted">Servidor</span>
              <span>{bot.guild_name || '—'}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Guild ID</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{bot.guild_id || '—'}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Ultimo restart</span>
              <span>{bot.last_restart ? new Date(bot.last_restart + 'Z').toLocaleString('pt-BR') : '—'}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Criado em</span>
              <span>{bot.created_at ? new Date(bot.created_at + 'Z').toLocaleString('pt-BR') : '—'}</span>
            </div>
            {bot.last_error && (
              <div style={{ marginTop: '0.5rem', padding: '0.6rem', background: 'var(--danger-bg)', borderRadius: 8, color: 'var(--danger)', fontSize: '0.8rem' }}>
                <strong>Ultimo erro:</strong> {bot.last_error}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            {bot.status !== 'online' && bot.status !== 'restarting' && (
              <button className="btn btn-success btn-sm" disabled={actionLoading} onClick={() => handleAction('start')}>
                <Play size={14} /> Iniciar
              </button>
            )}
            {bot.status === 'online' && (
              <button className="btn btn-danger btn-sm" disabled={actionLoading} onClick={() => handleAction('stop')}>
                <Square size={14} /> Parar
              </button>
            )}
            <button className="btn btn-warning btn-sm" disabled={actionLoading} onClick={() => handleAction('restart')}>
              <RotateCcw size={14} /> Reiniciar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTokenForm(!showTokenForm)}>
              Atualizar Token
            </button>
          </div>

          {showTokenForm && (
            <form onSubmit={handleTokenUpdate} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Novo Token</label>
                <input className="form-input" type="password" value={newToken} onChange={(e) => setNewToken(e.target.value)} placeholder="Cole o novo token" required />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={actionLoading}>Salvar Token</button>
            </form>
          )}
        </div>

        <div className="card">
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700 }}>Comandos do Bot</h3>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {bot.type === 'webhook' && (
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li><code>!webhook</code> — Configurar e enviar mensagem via webhook</li>
                <li><code>!configbot role @cargo</code> — Cargo autorizado</li>
                <li><code>!configbot logs #canal</code> — Canal de logs</li>
              </ul>
            )}
            {bot.type === 'facs' && (
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li><code>/config</code> — Painel de configuracao</li>
                <li><code>!hierarquia</code> — Mostrar hierarquia</li>
                <li><code>!set</code> — Embed de registro</li>
                <li><code>!farm</code> — Sistema de farm</li>
                <li><code>!configbot</code> — Configs administrativas</li>
              </ul>
            )}
            {bot.type === 'tickets' && (
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li><code>!ticket</code> — Painel de tickets</li>
                <li><code>!configticket</code> — Configurar painel</li>
                <li><code>!configbot</code> — Configs administrativas</li>
              </ul>
            )}
            {bot.type === 'discord' && (
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.8 }}>
                <li><code>!discord</code> — Painel de administracao</li>
                <li><code>!configdiscord</code> — Configuracoes</li>
                <li><code>!ban / !kick / !timeout / !clear</code> — Moderacao</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontWeight: 700 }}>Logs</h3>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Atualizar</button>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>Nenhum log ainda</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-entry">
                <span className="log-time">{new Date(log.created_at + 'Z').toLocaleTimeString('pt-BR')}</span>
                <span className={`log-level ${log.level}`}>{log.level}</span>
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
