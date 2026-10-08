# BotHost — Plataforma de Hospedagem de Bots Discord

Plataforma completa para hospedar, configurar e gerenciar bots Discord com KeepAlive automático.

## Tipos de Bots

| Tipo | Descrição |
|------|-----------|
| **Webhook** | Envio de mensagens via Webhooks com embeds |
| **FACs** | Hierarquia, registro e farm para clãs GTA/FiveM |
| **Tickets** | Sistema completo de atendimento |
| **Discord** | Administração completa do servidor |

Cada categoria permite até **50 bots**.

## Stack

- **Backend:** Node.js + Express + better-sqlite3 + discord.js
- **Frontend:** React + Vite
- **KeepAlive:** Processos filhos isolados com auto-restart
- **Auth:** JWT + bcrypt
- **Tokens:** Criptografados (AES-256-GCM)

## Deploy no Render

### Opção 1 — Serviço único (recomendado)

1. Faça push deste repositório para o GitHub
2. No [Render](https://render.com), crie um **Web Service**
3. Conecte o repositório
4. Configure:
   - **Build Command:** `cd frontend && npm install && npm run build && cd ../backend && npm install`
   - **Start Command:** `cd backend && node src/server.js`
   - **Environment:** Node
5. Adicione as variáveis de ambiente (veja `.env.example` no backend):

```
PORT=10000
NODE_ENV=production
JWT_SECRET=<gere_um_segredo_longo_aleatorio>
FRONTEND_URL=https://seu-app.onrender.com
DEFAULT_ADMIN_EMAIL=admin@seudominio.com
DEFAULT_ADMIN_PASSWORD=<senha_forte>
MAX_BOTS_PER_CATEGORY=50
```

6. Deploy!

### Opção 2 — render.yaml

O arquivo `render.yaml` na raiz já está configurado. Use **Blueprint** no Render.

## Instalação Local

```bash
# 1. Instalar dependências
cd backend && npm install
cd ../frontend && npm install

# 2. Configurar ambiente
cp backend/.env.example backend/.env
# Edite backend/.env com seus valores

# 3. Rodar em desenvolvimento
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Acesse: http://localhost:5173

**Login padrão:** `admin@platform.com` / `Admin@123456`

## Estrutura do Projeto

```
discord-bot-hosting/
├── backend/
│   ├── src/
│   │   ├── bots/           # Runner + tipos de bots
│   │   │   ├── runner.js
│   │   │   └── types/      # WebhookBot, FacsBot, TicketsBot, DiscordBot
│   │   ├── routes/         # API routes
│   │   ├── services/       # KeepAliveService
│   │   ├── middleware/     # Auth JWT
│   │   ├── utils/          # DB, crypto, logger
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/          # Dashboard, Bots, Create, Details
│   │   ├── components/     # Layout
│   │   ├── hooks/          # useAuth
│   │   ├── services/       # API client
│   │   └── styles/
│   └── package.json
├── data/                   # SQLite DB + logs (gerado em runtime)
├── render.yaml
└── README.md
```

## KeepAlive

- Cada bot roda em processo filho isolado (`fork`)
- Monitoramento contínuo a cada 30s
- Auto-restart em caso de crash
- Status: Online / Offline / Reiniciando / Erro
- Uptime, memória, contagem de restarts e último erro no painel

## Segurança

- Tokens nunca armazenados em texto puro
- Tokens nunca retornados pela API
- JWT com expiração
- Rate limiting
- Helmet + CORS
- Confirmação para exclusão
- Isolamento entre processos de bots

## Comandos por Tipo de Bot

### Webhook
- `!webhook` — Abrir painel de configuração de mensagem
- `!configbot role @cargo` / `!configbot logs #canal`

### FACs
- `/config` — Painel completo de configuração
- `!hierarquia` — Exibir hierarquia
- `!set` — Embed de registro
- `!farm` — Sistema de farm
- `!configbot` — Configs admin

### Tickets
- `!ticket` — Painel de tickets
- `!configticket` — Configurar painel
- `!configbot` — Configs admin

### Discord
- `!discord` — Painel de administração
- `!configdiscord` — Configurações
- `!ban` / `!kick` / `!timeout` / `!clear`

## Licença

MIT
