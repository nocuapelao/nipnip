import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Activity, Server, Cpu, HardDrive, Plus } from 'lucide-react';
import { dashboardAPI, botsAPI } from '../services/api';

function formatUptime(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [dash, cnt] = await Promise.all([dashboardAPI.get(), botsAPI.counts()]);
      setData(dash.data);
      setCounts(cnt.data.counts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-muted">Carregando dashboard...</div>;
  }

  const bots = data?.bots || {};
  const system = data?.system || {};

  return (
    <div>
      <div className="flex-between mb-2">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>
          <p className="text-sm text-muted">Visão geral da plataforma</p>
        </div>
        <Link to="/bots/create" className="btn btn-primary">
          <Plus size={16} /> Criar Bot
        </Link>
      </div>

      <div className="grid-4 mb-2">
        <div className="stat-card">
          <div className="stat-label">Total de Bots</div>
          <div className="stat-value">{bots.total || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Online</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{bots.online || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Offline</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{bots.offline || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Erro / Reiniciando</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>
            {(bots.error || 0) + (bots.restarting || 0)}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-2">
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bot size={18} /> Bots por Categoria
          </h3>
          {counts && Object.entries(counts).map(([type, val]) => (
            <div key={type} style={{ marginBottom: '0.75rem' }}>
              <div className="flex-between" style={{ marginBottom: '0.3rem' }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 500, fontSize: '0.875rem' }}>
                  {type === 'facs' ? 'FACs' : type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
                <span className="text-sm text-muted">{val.current}/{val.max}</span>
              </div>
              <div style={{
                height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${(val.current / val.max) * 100}%`,
                  background: val.current >= val.max ? 'var(--danger)' : 'var(--accent)',
                  borderRadius: 3,
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={18} /> Sistema
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="flex-between">
              <span className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={14} /> Uptime
              </span>
              <span className="text-sm font-bold">{formatUptime(system.uptime)}</span>
            </div>
            <div className="flex-between">
              <span className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <HardDrive size={14} /> RAM (processo)
              </span>
              <span className="text-sm font-bold">
                {system.memory?.process?.rss || 0} MB
              </span>
            </div>
            <div className="flex-between">
              <span className="text-sm text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Cpu size={14} /> KeepAlive
              </span>
              <span className="badge badge-online">
                <span className="status-dot online" />
                {system.keepAlive?.activeProcesses || 0} processos
              </span>
            </div>
            <div className="flex-between">
              <span className="text-sm text-muted">RAM Sistema</span>
              <span className="text-sm">
                {system.memory?.system?.used || 0} / {system.memory?.system?.total || 0} MB
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
