/**
 * Bot de Tickets
 * Commands: !ticket, !configticket, !configbot
 * Painel de config: so quem digitou o comando ve (ephemeral)
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
    this.tickets = new Map();
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
    if (!this.config.authorizedRoleId) {
      return member.permissions.has(PermissionFlagsBits.Administrator);
    }
    return member.roles.cache.has(this.config.authorizedRoleId) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
  }

  isStaff(member) {
    if (this.config.staffRoleId && member.roles.cache.has(this.config.staffRoleId)) return true;
    return this.hasPermission(member);
  }

  buildConfigPanel() {
    const cats = (this.config.categories || []).map(c => c.name).join(', ') || 'Nenhuma';

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Painel de Configuração — Tickets')
      .setDescription('Só você está vendo este painel. Use os botões abaixo para customizar.')
      .setColor(this.color())
      .addFields(
        { name: '📋 Título', value: this.config.title || 'Central de Tickets', inline: true },
        { name: '📝 Mensagem', value: (this.config.message || 'Selecione uma categoria...').slice(0, 100), inline: true },
        { name: '📌 Footer', value: this.config.footer || 'Sistema de Tickets', inline: true },
        { name: '🎨 Cor Sidebar', value: this.color(), inline: true },
        { name: '🖼️ Banner', value: this.config.banner ? 'Configurado' : 'Não definido', inline: true },
        { name: '📂 Categorias', value: cats, inline: true },
        { name: '📁 Categoria Discord', value: this.config.ticketCategoryId ? `<#${this.config.ticketCategoryId}>` : 'Não definida', inline: true },
        { name: '📜 Canal de Logs', value: this.config.logChannelId ? `<#${this.config.logChannelId}>` : 'Não definido', inline: true },
        { name: '👮 Cargo Equipe', value: this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : 'Não definido', inline: true },
        { name: '🔐 Cargo Admin', value: this.config.authorizedRoleId ? `<@&${this.config.authorizedRoleId}>` : 'Administradores', inline: true }
      )
      .setFooter({ text: 'Configuração privada • apenas você vê' })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_title').setLabel('Título').setStyle(ButtonStyle.Primary).setEmoji('📋'),
      new ButtonBuilder().setCustomId('tcfg_message').setLabel('Mensagem').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('tcfg_footer').setLabel('Footer').setStyle(ButtonStyle.Primary).setEmoji('📌'),
      new ButtonBuilder().setCustomId('tcfg_color').setLabel('Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
      new ButtonBuilder().setCustomId('tcfg_banner').setLabel('Banner').setStyle(ButtonStyle.Secondary).setEmoji('🖼️')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_addcat').setLabel('Add Categoria').setStyle(ButtonStyle.Success).setEmoji('➕'),
      new ButtonBuilder().setCustomId('tcfg_remcat').setLabel('Rem Categoria').setStyle(ButtonStyle.Danger).setEmoji('➖'),
      new ButtonBuilder().setCustomId('tcfg_category').setLabel('Cat. Discord').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
      new ButtonBuilder().setCustomId('tcfg_logs').setLabel('Canal Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
      new ButtonBuilder().setCustomId('tcfg_staff').setLabel('Cargo Equipe').setStyle(ButtonStyle.Secondary).setEmoji('👮')
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_admin').setLabel('Cargo Admin').setStyle(ButtonStyle.Secondary).setEmoji('🔐'),
      new ButtonBuilder().setCustomId('tcfg_preview').setLabel('Preview Painel').setStyle(ButtonStyle.Primary).setEmoji('👁️'),
      new ButtonBuilder().setCustomId('tcfg_refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );

    return { embeds: [embed], components: [row1, row2, row3], ephemeral: true };
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    if (content === '!ticket') {
      const categories = this.config.categories || [{ name: 'Suporte', id: 'support' }];

      const embed = new EmbedBuilder()
        .setTitle(this.config.title || 'Central de Tickets')
        .setDescription(this.config.message || 'Selecione uma categoria para abrir um ticket.')
        .setColor(this.color())
        .setFooter({ text: this.config.footer || 'Sistema de Tickets' });

      if (this.config.banner) embed.setImage(this.config.banner);

      const options = categories.slice(0, 25).map((c, i) => ({
        label: c.name.slice(0, 100),
        value: c.id || `cat_${i}`,
        description: `Abrir ticket: ${c.name}`.slice(0, 100)
      }));

      if (options.length === 0) {
        return message.reply('❌ Nenhuma categoria configurada. Use `!configticket` para adicionar.');
      }

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_select_category')
          .setPlaceholder('Selecione a categoria...')
          .addOptions(options)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }

    if (content === '!configticket' || content.startsWith('!configbot')) {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Você não tem permissão para configurar o bot.');
      }

      try { await message.delete(); } catch (_) {}

      const intro = new EmbedBuilder()
        .setTitle('⚙️ Configuração de Tickets')
        .setDescription(`${message.author}, clique no botão abaixo para abrir o **painel privado** de configuração.\n\nApenas você conseguirá ver o painel.`)
        .setColor(this.color());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tcfg_open_${message.author.id}`)
          .setLabel('Abrir Painel de Configuração')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚙️')
      );

      const sent = await message.channel.send({ embeds: [intro], components: [row] });
      setTimeout(() => sent.delete().catch(() => {}), 60000);
    }
  }

  async handleInteraction(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('tcfg_open_')) {
      const ownerId = interaction.customId.replace('tcfg_open_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Este botão não é para você.', ephemeral: true });
      }
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      return interaction.reply(this.buildConfigPanel());
    }

    if (interaction.isButton() && interaction.customId.startsWith('tcfg_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const id = interaction.customId;

      if (id === 'tcfg_refresh') {
        return interaction.update(this.buildConfigPanel());
      }

      if (id === 'tcfg_preview') {
        const embed = new EmbedBuilder()
          .setTitle(this.config.title || 'Central de Tickets')
          .setDescription(this.config.message || 'Selecione uma categoria...')
          .setColor(this.color())
          .setFooter({ text: this.config.footer || 'Sistema de Tickets' });
        if (this.config.banner) embed.setImage(this.config.banner);

        return interaction.reply({
          content: '👁️ **Preview** do painel público de tickets:',
          embeds: [embed],
          ephemeral: true
        });
      }

      const modals = {
        tcfg_title: { title: 'Título do Embed', label: 'Título', style: TextInputStyle.Short, current: this.config.title },
        tcfg_message: { title: 'Mensagem do Embed', label: 'Mensagem', style: TextInputStyle.Paragraph, current: this.config.message },
        tcfg_footer: { title: 'Footer do Embed', label: 'Footer', style: TextInputStyle.Short, current: this.config.footer },
        tcfg_color: { title: 'Cor da Sidebar', label: 'Cor Hex (ex: #5865F2)', style: TextInputStyle.Short, current: this.color() },
        tcfg_banner: { title: 'Banner (URL da imagem)', label: 'URL da imagem', style: TextInputStyle.Short, current: this.config.banner || '' },
        tcfg_addcat: { title: 'Adicionar Categoria', label: 'Nome da categoria', style: TextInputStyle.Short, current: '' },
        tcfg_remcat: { title: 'Remover Categoria', label: 'Nome exato da categoria', style: TextInputStyle.Short, current: '' },
        tcfg_category: { title: 'Categoria do Discord', label: 'ID da categoria onde tickets são criados', style: TextInputStyle.Short, current: this.config.ticketCategoryId || '' },
        tcfg_logs: { title: 'Canal de Logs', label: 'ID do canal de logs', style: TextInputStyle.Short, current: this.config.logChannelId || '' },
        tcfg_staff: { title: 'Cargo da Equipe', label: 'ID do cargo da equipe', style: TextInputStyle.Short, current: this.config.staffRoleId || '' },
        tcfg_admin: { title: 'Cargo Admin', label: 'ID do cargo autorizado a configurar', style: TextInputStyle.Short, current: this.config.authorizedRoleId || '' }
      };

      const m = modals[id];
      if (!m) return;

      const modal = new ModalBuilder()
        .setCustomId(`tmodal_${id}`)
        .setTitle(m.title);

      const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(m.label)
        .setStyle(m.style)
        .setRequired(true)
        .setMaxLength(m.style === TextInputStyle.Paragraph ? 1000 : 200);

      if (m.current) input.setValue(String(m.current).slice(0, 200));

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('tmodal_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const key = interaction.customId.replace('tmodal_', '');
      const value = interaction.fields.getTextInputValue('value').trim();

      switch (key) {
        case 'tcfg_title':
          this.config.title = value;
          break;
        case 'tcfg_message':
          this.config.message = value;
          break;
        case 'tcfg_footer':
          this.config.footer = value;
          break;
        case 'tcfg_color':
          this.config.sidebarColor = value.startsWith('#') ? value : `#${value}`;
          break;
        case 'tcfg_banner':
          this.config.banner = value || null;
          break;
        case 'tcfg_addcat': {
          if (!this.config.categories) this.config.categories = [];
          const catId = value.toLowerCase().replace(/\s+/g, '_').slice(0, 50);
          if (this.config.categories.some(c => c.name.toLowerCase() === value.toLowerCase())) {
            return interaction.reply({ content: '❌ Essa categoria já existe.', ephemeral: true });
          }
          this.config.categories.push({ name: value, id: catId });
          break;
        }
        case 'tcfg_remcat': {
          if (!this.config.categories) this.config.categories = [];
          const before = this.config.categories.length;
          this.config.categories = this.config.categories.filter(
            c => c.name.toLowerCase() !== value.toLowerCase()
          );
          if (this.config.categories.length === before) {
            return interaction.reply({ content: '❌ Categoria não encontrada.', ephemeral: true });
          }
          break;
        }
        case 'tcfg_category':
          this.config.ticketCategoryId = value.replace(/[<#>]/g, '');
          break;
        case 'tcfg_logs':
          this.config.logChannelId = value.replace(/[<#>]/g, '');
          break;
        case 'tcfg_staff':
          this.config.staffRoleId = value.replace(/[<@&>]/g, '');
          break;
        case 'tcfg_admin':
          this.config.authorizedRoleId = value.replace(/[<@&>]/g, '');
          break;
        default:
          return interaction.reply({ content: '❌ Ação desconhecida.', ephemeral: true });
      }

      this.log('info', `Config updated by ${interaction.user.tag}: ${key}`);
      this._sendLog(interaction.guild, `⚙️ Config alterada por ${interaction.user}: \`${key}\``);

      try {
        await interaction.update(this.buildConfigPanel());
      } catch {
        await interaction.reply({
          content: '✅ Configuração salva! Use **Atualizar** no painel ou digite `!configticket` de novo.',
          ephemeral: true
        });
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const categoryId = interaction.values[0];
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      const modal = new ModalBuilder()
        .setCustomId(`ticket_reason_${categoryId}`)
        .setTitle(`Ticket: ${category.name}`.slice(0, 45));

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

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_reason_')) {
      const categoryId = interaction.customId.replace('ticket_reason_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      if (!this.config.ticketCategoryId) {
        return interaction.reply({
          content: '❌ Categoria de tickets não configurada. Um admin precisa usar `!configticket`.',
          ephemeral: true
        });
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

    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
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
        if (ticketData) ticketData.assignee = interaction.user.id;

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
