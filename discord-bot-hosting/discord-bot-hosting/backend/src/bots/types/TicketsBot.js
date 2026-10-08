/**
 * Bot de Tickets
 * Commands: !ticket, !configticket, !configbot
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder
} = require('discord.js');

class TicketsBot {
  constructor({ token, config, botId, name, sendMessage }) {
    this.token = token;
    this.config = config;
    this.botId = botId;
    this.name = name;
    this.send = sendMessage;
    this.client = null;
    this.guildId = null;
    this.guildName = null;
    this.tickets = new Map(); // channelId -> { userId, assignee, subject }
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
      this.send({ type: 'ready', guildId: this.guildId, guildName: this.guildName });
      this.log('info', `TicketsBot online as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', (msg) => this.handleMessage(msg));
    this.client.on('interactionCreate', (i) => this.handleInteraction(i));

    await this.client.login(this.token);
  }

  async stop() {
    if (this.client) this.client.destroy();
  }

  reloadConfig(config) {
    this.config = config;
  }

  log(level, message) {
    this.send({ type: 'log', level, message });
  }

  color() {
    return this.config.sidebarColor || '#5865F2';
  }

  hasPermission(member) {
    if (!this.config.authorizedRoleId) return member.permissions.has(PermissionFlagsBits.Administrator);
    return member.roles.cache.has(this.config.authorizedRoleId) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
  }

  isStaff(member) {
    if (this.config.staffRoleId && member.roles.cache.has(this.config.staffRoleId)) return true;
    return this.hasPermission(member);
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    // !ticket - show panel
    if (content === '!ticket') {
      const categories = this.config.categories || [{ name: 'Suporte', id: 'support' }];

      const embed = new EmbedBuilder()
        .setTitle(this.config.title || 'Central de Tickets')
        .setDescription(this.config.message || 'Selecione uma categoria para abrir um ticket.')
        .setColor(this.color())
        .setFooter({ text: this.config.footer || 'Sistema de Tickets' });

      if (this.config.banner) {
        embed.setImage(this.config.banner);
      }

      const options = categories.map((c, i) => ({
        label: c.name,
        value: c.id || `cat_${i}`,
        description: `Abrir ticket: ${c.name}`
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_select_category')
          .setPlaceholder('Selecione a categoria...')
          .addOptions(options)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }

    // !configticket
    if (content.startsWith('!configticket')) {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Sem permissão.');
      }

      const args = content.slice(13).trim().split(/\s+/);
      const sub = args[0];

      if (sub === 'title' && args.slice(1).length) {
        this.config.title = args.slice(1).join(' ');
        await message.reply(`✅ Título: ${this.config.title}`);
      } else if (sub === 'message' && args.slice(1).length) {
        this.config.message = args.slice(1).join(' ');
        await message.reply('✅ Mensagem atualizada.');
      } else if (sub === 'footer' && args.slice(1).length) {
        this.config.footer = args.slice(1).join(' ');
        await message.reply(`✅ Footer: ${this.config.footer}`);
      } else if (sub === 'color' && args[1]) {
        this.config.sidebarColor = args[1];
        await message.reply(`✅ Cor: ${this.config.sidebarColor}`);
      } else if (sub === 'category' && args[1]) {
        this.config.ticketCategoryId = args[1].replace(/[<#>]/g, '');
        await message.reply(`✅ Categoria de tickets: ${this.config.ticketCategoryId}`);
      } else if (sub === 'staff' && args[1]) {
        this.config.staffRoleId = args[1].replace(/[<@&>]/g, '');
        await message.reply(`✅ Cargo da equipe: <@&${this.config.staffRoleId}>`);
      } else if (sub === 'addcat' && args.slice(1).length) {
        if (!this.config.categories) this.config.categories = [];
        const name = args.slice(1).join(' ');
        this.config.categories.push({ name, id: name.toLowerCase().replace(/\s+/g, '_') });
        await message.reply(`✅ Categoria adicionada: ${name}`);
      } else {
        await message.reply(
          '**!configticket title <texto>**\n' +
          '**!configticket message <texto>**\n' +
          '**!configticket footer <texto>**\n' +
          '**!configticket color #hex**\n' +
          '**!configticket category <id>**\n' +
          '**!configticket staff @cargo**\n' +
          '**!configticket addcat <nome>**'
        );
      }
    }

    // !configbot
    if (content.startsWith('!configbot')) {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Sem permissão.');
      }
      const args = content.slice(10).trim().split(/\s+/);
      if (args[0] === 'role' && args[1]) {
        this.config.authorizedRoleId = args[1].replace(/[<@&>]/g, '');
        await message.reply(`✅ Cargo autorizado: <@&${this.config.authorizedRoleId}>`);
      } else if (args[0] === 'logs' && args[1]) {
        this.config.logChannelId = args[1].replace(/[<#>]/g, '');
        await message.reply(`✅ Canal de logs: <#${this.config.logChannelId}>`);
      } else {
        await message.reply('**!configbot role @cargo** | **!configbot logs #canal**');
      }
    }
  }

  async handleInteraction(interaction) {
    // Category select → ask reason modal
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const categoryId = interaction.values[0];
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      const modal = new ModalBuilder()
        .setCustomId(`ticket_reason_${categoryId}`)
        .setTitle(`Ticket: ${category.name}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Por que você abriu este ticket?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000)
        )
      );

      return interaction.showModal(modal);
    }

    // Reason modal → create ticket
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_reason_')) {
      const categoryId = interaction.customId.replace('ticket_reason_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      if (!this.config.ticketCategoryId) {
        return interaction.reply({ content: '❌ Categoria de tickets não configurada no servidor.', ephemeral: true });
      }

      try {
        const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
        const channel = await interaction.guild.channels.create({
          name: `ticket-${safeName}`,
          type: ChannelType.GuildText,
          parent: this.config.ticketCategoryId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            ...(this.config.staffRoleId ? [{
              id: this.config.staffRoleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            }] : [])
          ]
        });

        this.tickets.set(channel.id, {
          userId: interaction.user.id,
          assignee: null,
          subject: reason,
          category: category.name
        });

        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 TICKET ABERTO POR')
          .setDescription(
            `${interaction.user}\n\n` +
            `"Seja bem-vindo ao ticket do nosso servidor. Aguarde que nossa equipe já está ciente do seu ticket e irá te responder em breve!"\n\n` +
            `**Responsável do ticket**\n_Nenhum_\n\n` +
            `**Assunto do ticket**\n${reason}`
          )
          .setColor(this.color())
          .setFooter({ text: this.config.footer || 'Sistema de Tickets' })
          .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🟥'),
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Assumir Ticket').setStyle(ButtonStyle.Success).setEmoji('🟩'),
          new ButtonBuilder().setCustomId('ticket_add').setLabel('Adicionar Membro').setStyle(ButtonStyle.Primary).setEmoji('🟦'),
          new ButtonBuilder().setCustomId('ticket_remove').setLabel('Remover Membro').setStyle(ButtonStyle.Secondary).setEmoji('🟨'),
          new ButtonBuilder().setCustomId('ticket_notify').setLabel('Avisar Membro').setStyle(ButtonStyle.Secondary).setEmoji('🟪')
        );

        await channel.send({
          content: `${interaction.user}${this.config.staffRoleId ? ` | <@&${this.config.staffRoleId}>` : ''}`,
          embeds: [ticketEmbed],
          components: [buttons]
        });

        await interaction.reply({ content: `✅ Ticket criado: ${channel}`, ephemeral: true });
        this.log('info', `Ticket opened by ${interaction.user.tag}: ${category.name}`);
        this._sendLog(interaction.guild, `🎫 Ticket aberto por ${interaction.user} — ${category.name}`);
      } catch (err) {
        await interaction.reply({ content: `❌ Erro: ${err.message}`, ephemeral: true });
      }
    }

    // Ticket buttons
    if (interaction.isButton()) {
      const ticketData = this.tickets.get(interaction.channel.id);

      if (interaction.customId === 'ticket_close') {
        if (!this.isStaff(interaction.member) && ticketData?.userId !== interaction.user.id) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        await interaction.reply('🔒 Ticket será fechado em 5 segundos...');
        this._sendLog(interaction.guild, `🔒 Ticket fechado por ${interaction.user} — #${interaction.channel.name}`);
        this.tickets.delete(interaction.channel.id);
        setTimeout(async () => {
          try { await interaction.channel.delete(); } catch (e) {}
        }, 5000);
      }

      if (interaction.customId === 'ticket_claim') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Apenas a equipe pode assumir tickets.', ephemeral: true });
        }
        if (ticketData) {
          ticketData.assignee = interaction.user.id;
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        const desc = embed.data.description || '';
        const newDesc = desc.replace(
          /\*\*Responsável do ticket\*\*\n.+/m,
          `**Responsável do ticket**\n${interaction.user}`
        );
        embed.setDescription(newDesc);

        await interaction.update({ embeds: [embed] });
        this._sendLog(interaction.guild, `🟩 Ticket assumido por ${interaction.user}`);
      }

      if (interaction.customId === 'ticket_add') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('ticket_add_modal').setTitle('Adicionar Membro');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('user_id').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'ticket_remove') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('ticket_remove_modal').setTitle('Remover Membro');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('user_id').setLabel('ID do Usuário').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'ticket_notify') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        if (ticketData?.userId) {
          try {
            const user = await this.client.users.fetch(ticketData.userId);
            await user.send(
              `📬 Seu ticket em **${interaction.guild.name}** recebeu uma resposta!\n` +
              `Acesse: ${interaction.channel}`
            );
            await interaction.reply({ content: '✅ Membro avisado via DM.', ephemeral: true });
            this._sendLog(interaction.guild, `🟪 Aviso enviado para <@${ticketData.userId}> por ${interaction.user}`);
          } catch (e) {
            await interaction.reply({ content: '❌ Não foi possível enviar DM.', ephemeral: true });
          }
        }
      }
    }

    // Add/Remove member modals
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'ticket_add_modal') {
        const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
        try {
          await interaction.channel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          await interaction.reply(`✅ <@${userId}> adicionado ao ticket.`);
          this._sendLog(interaction.guild, `🟦 Membro <@${userId}> adicionado por ${interaction.user}`);
        } catch (e) {
          await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
        }
      }
      if (interaction.customId === 'ticket_remove_modal') {
        const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
        try {
          await interaction.channel.permissionOverwrites.delete(userId);
          await interaction.reply(`✅ <@${userId}> removido do ticket.`);
          this._sendLog(interaction.guild, `🟨 Membro <@${userId}> removido por ${interaction.user}`);
        } catch (e) {
          await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
        }
      }
    }
  }

  _sendLog(guild, message) {
    if (!this.config.logChannelId) return;
    const ch = guild.channels.cache.get(this.config.logChannelId);
    if (ch) ch.send(message).catch(() => {});
  }
}

module.exports = TicketsBot;
