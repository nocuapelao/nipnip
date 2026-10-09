import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Webhook, Users, Ticket, Shield, ArrowLeft } from 'lucide-react';
import { botsAPI } from '../services/api';

const BOT_TYPES = [
  {
    type: 'webhook',
    label: 'Bot de Webhook',
    icon: Webhook,
    description: 'Envie mensagens automaticas via Webhooks do Discord com embeds personalizados.',
    color: '#5865F2'
  },
  {
    type: 'facs',
    label: 'Bot de FACs',
    icon: Users,
    description: 'Hierarquia, registro e sistema de farm para clas e organizacoes GTA/FiveM.',
    color: '#3ba55d'
  },
  {
    type: 'tickets',
    label: 'Bot de Tickets',
    icon: Ticket,
    description: 'Sistema completo de atendimento com categorias, claim e gerenciamento.',
    color: '#faa61a'
  },
  {
    type: 'discord',
    label: 'Bot de Discord',
    icon: Shield,
    description: 'Administracao completa do servidor: moderacao, logs, autorole e automacoes.',
    color: '#ed4245'
  },
  {
    type: 'vendas',
    label: 'Bot de Vendas',
    icon: Ticket,
    description: 'Sistema de vendas com categorias, painel e atendimento (limite 3 bots).',
    color: '#3ba55d'
  }
];

const TYPE_LABELS = {
  webhook: 'Webhook',
  facs: 'FACs',
  tickets: 'Tickets',
  discord: 'Discord',
  vendas: 'Vendas'
};

export default function CreateBot() {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState(null);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    botsAPI.counts().then((res) => setCounts(res.data.counts)).catch(() => {});
  }, []);

  const handleSelect = (type) => {
    if (counts?.[type]?.current >= counts?.[type]?.max) {
      setError(`Limite de ${counts[type].max} bots do tipo "${type}" atingido.`);
      return;
    }
    setError('');
    setSelectedType(type);
    setStep(2);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !token.trim()) {
      setError('Nome e token sao obrigatorios');
      return;
    }
    setLoading(true);
    try {
      const res = await botsAPI.create({ name: name.trim(), type: selectedType, token: token.trim() });
      navigate(`/bots/${res.data.bot.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar bot');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex-between mb-2">
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Criar Bot</h1>
          <p className="text-sm text-muted">
            {step === 1 ? 'Selecione o tipo de bot' : 'Configure o bot'}
          </p>
        </div>
        {step === 2 && (
          <button className="btn btn-ghost" onClick={() => setStep(1)}>
            <ArrowLeft size={16} /> Voltar
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg)', color: 'var(--danger)',
          padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
          marginBottom: '1rem', fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="grid-2">
          {BOT_TYPES.map((bt) => {
            const Icon = bt.icon;
            const count = counts?.[bt.type];
            const full = count && count.current >= count.max;
            return (
              <button
                key={bt.type}
                className="card"
                onClick={() => handleSelect(bt.type)}
                disabled={full}
                style={{
                  textAlign: 'left', cursor: full ? 'not-allowed' : 'pointer',
                  opacity: full ? 0.5 : 1, borderColor: 'var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${bt.color}22`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: bt.color
                  }}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{bt.label}</div>
                    {count && (
                      <div className="text-sm text-muted">{count.current}/{count.max} bots</div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted">{bt.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && selectedType && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <span className="badge badge-online" style={{ textTransform: 'capitalize' }}>
              {TYPE_LABELS[selectedType]}
            </span>
          </div>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Nome do Bot</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Meu Bot de Tickets"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Token do Discord Bot</label>
              <input
                className="form-input"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Token do bot (nunca compartilhe)"
                required
              />
              <p className="text-sm text-muted mt-1">
                O token e criptografado e nunca exibido novamente. Obtenha em{' '}
                <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
                  Discord Developer Portal
                </a>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar Bot'}
              </button>
              <Link to="/bots" className="btn btn-ghost">Cancelar</Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
