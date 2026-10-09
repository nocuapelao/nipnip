import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Play, Square, RotateCcw, Settings, Trash2, Bot } from 'lucide-react';
import { botsAPI } from '../services/api';

const TYPE_LABELS = {
  webhook: 'Webhook',
  facs: 'FACs',
  tickets: 'Tickets',
  discord: 'Discord',
  vendas: 'Vendas'
};

function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

export default function Bots() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const load = useCallback(async () => {
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await botsAPI.list(params);
      setBots(res.data.bots);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, search]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAction = async (id, action) => {
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      if (action === 'start') await botsAPI.start(id);
      else if (action === 'stop') await botsAPI.stop(id);
      else if (action === 'restart') await botsAPI.restart(id);
      else if (action === 'delete') {
        if (!confirm('Tem certeza que deseja excluir este bot?')) return;
        await botsAPI.remove(id);
      }
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro na ação');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div>
      <div className="flex-between mb-2">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Meus Bots</h1>
          <p className="text-sm text-muted">{bots.length} bot(s) encontrado(s)</p>
        </div>
        <Link to="/bots/create" className="btn btn-primary">
          <Plus size={16} /> Criar Bot
        </Link>
      </div>

      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={16} />
          <input
            className="search-input form-input"
            placeholder="Buscar bots..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.4rem' }}
          />
        </div>
        <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="webhook">Webhook</option>
          <option value="facs">FACs</option>
          <option value="tickets">Tickets</option>
          <option value="discord">Discord</option>
          <option value="vendas">Vendas</option>
        </select>
        <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Erro</option>
          <option value="restarting">Reiniciando</option>
        </select>
      </div>

      {loading ? (
        <div className="text-muted">Carregando...</div>
      ) : bots.length === 0 ? (
        <div className="empty-state card">
          <Bot />
          <p>Nenhum bot encontrado</p>
          <Link to="/bots/create" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            <Plus size={16} /> Criar primeiro bot
          </Link>
        </div>
      ) : (
        <div className="grid-2">
          {bots.map((bot) => (
            <div key={bot.id} className="bot-card">
              <div className="bot-card-header">
                <div>
                  <div className="bot-card-name">{bot.name}</div>
                  <div className="bot-card-type">{TYPE_LABELS[bot.type] || bot.type}</div>
                </div>
                <StatusBadge status={bot.status} />
              </div>

              <div className="bot-card-meta">
                {bot.guild_name && <span>📡 {bot.guild_name}</span>}
                {bot.uptime != null && <span>⏱ {formatUptime(bot.uptime)}</span>}
                {bot.memory != null && <span>💾 {bot.memory} MB</span>}
                {bot.restart_count > 0 && <span>🔄 {bot.restart_count} restarts</span>}
              </div>

              {bot.last_error && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger)', background: 'var(--danger-bg)', padding: '0.4rem 0.6rem', borderRadius: 6 }}>
                  {bot.last_error.slice(0, 120)}
                </div>
              )}

              <div className="bot-card-actions">
                {bot.status !== 'online' && bot.status !== 'restarting' && (
                  <button className="btn btn-success btn-sm" disabled={actionLoading[bot.id]} onClick={() => handleAction(bot.id, 'start')}>
                    <Play size={14} /> Iniciar
                  </button>
                )}
                {bot.status === 'online' && (
                  <button className="btn btn-danger btn-sm" disabled={actionLoading[bot.id]} onClick={() => handleAction(bot.id, 'stop')}>
                    <Square size={14} /> Parar
                  </button>
                )}
                <button className="btn btn-warning btn-sm" disabled={actionLoading[bot.id]} onClick={() => handleAction(bot.id, 'restart')}>
                  <RotateCcw size={14} /> Reiniciar
                </button>
                <Link to={`/bots/${bot.id}`} className="btn btn-ghost btn-sm">
                  <Settings size={14} /> Detalhes
                </Link>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={actionLoading[bot.id]} onClick={() => handleAction(bot.id, 'delete')}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
