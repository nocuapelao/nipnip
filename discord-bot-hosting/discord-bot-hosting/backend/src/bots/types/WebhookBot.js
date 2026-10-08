/**
 * Bot de Webhook
 * Commands: !webhook, !configbot
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits
} = require('discord.js');

class WebhookBot {
  constructor({ token, config, botId, name, sendMessage }) {
    this.token = token;
    this.config = config;
    this.botId = botId;
    this.name = name;
    this.send = sendMessage;
    this.client = null;
    this.guildId = null;
    this.guildName = null;
  }

  async start() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.client.once('ready', () => {
      const guild = this.client.guilds.cache.first();
      this.guildId = guild?.id || null;
      this.guildName = guild?.name || null;
      
      this.send({
        type: 'ready',
        guildId: this.guildId,
        guildName: this.guildName
      });
      
      this.log('info', `WebhookBot online as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', (msg) => this.handleMessage(msg));
    this.client.on('interactionCreate', (i) => this.handleInteraction(i));

    await this.client.login(this.token);
  }

  async stop() {
    if (this.client) {
      this.client.destroy();
    }
  }

  reloadConfig(config) {
    this.config = config;
    this.log('info', 'Config reloaded');
  }

  log(level, message) {
    this.send({ type: 'log', level, message });
  }

  hasPermission(member) {
    if (!this.config.authorizedRoleId) return member.permissions.has(PermissionFlagsBits.Administrator);
    return member.roles.cache.has(this.config.authorizedRoleId) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    if (content === '!webhook') {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Você não tem permissão para usar este comando.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🔧 Configurar Webhook')
        .setDescription('Clique no botão abaixo para configurar e enviar uma mensagem via Webhook.')
        .setColor(this.config.defaultColor || '#5865F2')
        .setFooter({ text: 'Bot de Webhook' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('webhook_open_modal')
          .setLabel('Configurar Mensagem')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝')
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }

    if (content.startsWith('!configbot')) {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Você não tem permissão.');
      }

      const args = content.slice(10).trim().split(/\s+/);
      const sub = args[0];

      if (sub === 'role' && args[1]) {
        const roleId = args[1].replace(/[<@&>]/g, '');
        this.config.authorizedRoleId = roleId;
        await message.reply(`✅ Cargo autorizado configurado: <@&${roleId}>`);
        this.log('info', `Authorized role set to ${roleId}`);
      } else if (sub === 'logs' && args[1]) {
        const channelId = args[1].replace(/[<#>]/g, '');
        this.config.logChannelId = channelId;
        await message.reply(`✅ Canal de logs configurado: <#${channelId}>`);
      } else {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ Configuração do Bot')
          .setDescription(
            '**Comandos disponíveis:**\n' +
            '`!configbot role @cargo` - Define cargo autorizado\n' +
            '`!configbot logs #canal` - Define canal de logs\n\n' +
            `**Cargo atual:** ${this.config.authorizedRoleId ? `<@&${this.config.authorizedRoleId}>` : 'Administradores'}\n` +
            `**Canal de logs:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : 'Não configurado'}`
          )
          .setColor(this.config.defaultColor || '#5865F2');
        await message.channel.send({ embeds: [embed] });
      }
    }
  }

  async handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId === 'webhook_open_modal') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('webhook_modal')
        .setTitle('Configurar Webhook');

      const fields = [
        { id: 'webhook_url', label: 'Link do Webhook', style: TextInputStyle.Short, required: true },
        { id: 'title', label: 'Título', style: TextInputStyle.Short, required: true },
        { id: 'description', label: 'Mensagem / Descrição', style: TextInputStyle.Paragraph, required: true },
        { id: 'footer', label: 'Footer', style: TextInputStyle.Short, required: false },
        { id: 'color', label: 'Cor (hex, ex: #5865F2)', style: TextInputStyle.Short, required: false }
      ];

      for (const f of fields) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(f.id)
              .setLabel(f.label)
              .setStyle(f.style)
              .setRequired(f.required)
          )
        );
      }

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'webhook_modal') {
      const webhookUrl = interaction.fields.getTextInputValue('webhook_url');
      const title = interaction.fields.getTextInputValue('title');
      const description = interaction.fields.getTextInputValue('description');
      const footer = interaction.fields.getTextInputValue('footer') || '';
      const color = interaction.fields.getTextInputValue('color') || this.config.defaultColor || '#5865F2';

      try {
        const { WebhookClient } = require('discord.js');
        const webhook = new WebhookClient({ url: webhookUrl });

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(color);
        
        if (footer) embed.setFooter({ text: footer });

        await webhook.send({ embeds: [embed] });
        await interaction.reply({ content: '✅ Mensagem enviada via Webhook com sucesso!', ephemeral: true });
        
        this.log('info', `Webhook message sent by ${interaction.user.tag}`);
        
        if (this.config.logChannelId) {
          const logCh = interaction.guild.channels.cache.get(this.config.logChannelId);
          if (logCh) {
            logCh.send(`📝 Webhook enviado por ${interaction.user} - Título: **${title}**`);
          }
        }
      } catch (err) {
        await interaction.reply({ content: `❌ Erro ao enviar: ${err.message}`, ephemeral: true });
        this.log('error', `Webhook error: ${err.message}`);
      }
    }
  }
}

module.exports = WebhookBot;
