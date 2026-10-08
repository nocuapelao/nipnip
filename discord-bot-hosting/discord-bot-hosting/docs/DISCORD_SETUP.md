# Configuração do Bot no Discord Developer Portal

Para cada bot que você criar na plataforma, é necessário:

## 1. Criar Application

1. Acesse https://discord.com/developers/applications
2. Clique em **New Application**
3. Dê um nome e confirme

## 2. Criar o Bot

1. No menu lateral, vá em **Bot**
2. Clique em **Add Bot** / **Reset Token**
3. Copie o **Token** (você vai colar na plataforma)
4. Ative as opções:
   - **Presence Intent** (opcional)
   - **Server Members Intent** (obrigatório para FACs, Tickets, Discord)
   - **Message Content Intent** (obrigatório para todos)

## 3. Convidar o Bot

1. Vá em **OAuth2 → URL Generator**
2. Scopes: `bot` + `applications.commands`
3. Bot Permissions (recomendado):
   - Manage Channels
   - Manage Roles
   - Kick Members
   - Ban Members
   - Moderate Members
   - Send Messages
   - Manage Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Slash Commands
4. Copie a URL e abra no navegador para adicionar ao servidor

## 4. Colar o Token na Plataforma

No painel BotHost → Criar Bot → cole o token.
O token é criptografado e nunca é exibido novamente.
