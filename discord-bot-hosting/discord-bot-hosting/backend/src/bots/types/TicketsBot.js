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
    this.tickets = new Map(); // channelId -> data
    this.userTickets = new Map(); // userId -> channelId (impede ticket duplicado)
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

    this.client.once('ready', async () => {
      const guild = this.client.guilds.cache.first();
      this.guildId = guild?.id || null;
      this.guildName = guild?.name || null;

      try {
        const { REST, Routes, SlashCommandBuilder } = require('discord.js');
        const rest = new REST({ version: '10' }).setToken(this.token);
        await rest.put(Routes.applicationCommands(this.client.user.id), {
          body: [
            new SlashCommandBuilder()
              .setName('configticket')
              .setDescription('Abrir painel privado de configuração dos tickets')
              .toJSON()
          ]
        });
        this.log('info', 'Slash /configticket registrado');
      } catch (e) {
        this.log('error', `Falha ao registrar slash: ${e.message}`);
      }

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

  // Select menu sempre "limpo" (sem valor selecionado)
  buildTicketSelectRow() {
    const categories = this.config.categories || [{ name: 'Suporte', id: 'support' }];
    const options = categories.slice(0, 25).map((c, i) => {
      const opt = {
        label: c.name.slice(0, 100),
        value: c.id || `cat_${i}`,
        description: `Abrir ticket: ${c.name}`.slice(0, 100)
      };
      const raw = (c.emoji || '📩').trim();
      const custom = raw.match(/^<?(a?):([a-zA-Z0-9_]+):(\d+)>?$/);
      if (custom) {
        opt.emoji = { animated: custom[1] === 'a', name: custom[2], id: custom[3] };
      } else {
        // unicode — pega só o primeiro emoji se colarem texto junto
        const uni = raw.match(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u);
        opt.emoji = uni ? uni[0] : '📩';
      }
      return opt;
    });

    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_select_category')
        .setPlaceholder('📩 Selecione a categoria de atendimento.')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options)
    );
  }

  buildTicketPanelEmbed() {
    const embed = new EmbedBuilder()
      .setTitle(this.config.title || '🎫 Central de Tickets')
      .setDescription(this.config.message || 'Selecione uma categoria abaixo para abrir um ticket com a nossa equipe.')
      .setColor(this.color())
      .setFooter({ text: this.config.footer || 'Sistema de Tickets' });
    // Canto superior direito (imagem ou GIF)
    if (this.config.thumbnail) embed.setThumbnail(this.config.thumbnail);
    // Imagem grande embaixo
    if (this.config.banner) embed.setImage(this.config.banner);
    return embed;
  }

  // Reseta o select da mensagem original (resolve o bug de categoria travada)
  async resetSelectMenu(message) {
    try {
      await message.edit({
        embeds: [this.buildTicketPanelEmbed()],
        components: [this.buildTicketSelectRow()]
      });
    } catch (_) {}
  }

  buildConfigPanel() {
    const cats = (this.config.categories || []).map(c => `${c.emoji || '📩'} ${c.name}`).join(', ') || 'Nenhuma';

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
        { name: '📌 Thumbnail', value: this.config.thumbnail ? 'Configurado' : 'Não definido', inline: true },
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
      new ButtonBuilder().setCustomId('tcfg_color').setLabel('Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
    );

    const rowImg = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_banner').setLabel('Banner (baixo)').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
      new ButtonBuilder().setCustomId('tcfg_thumbnail').setLabel('Thumbnail (canto)').setStyle(ButtonStyle.Secondary).setEmoji('📌')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_addcat').setLabel('Add Categoria').setStyle(ButtonStyle.Success).setEmoji('➕'),
      new ButtonBuilder().setCustomId('tcfg_editemoji').setLabel('Emoji Categoria').setStyle(ButtonStyle.Primary).setEmoji('😀'),
      new ButtonBuilder().setCustomId('tcfg_remcat').setLabel('Rem Categoria').setStyle(ButtonStyle.Danger).setEmoji('➖'),
      new ButtonBuilder().setCustomId('tcfg_category').setLabel('Cat. Discord').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
      new ButtonBuilder().setCustomId('tcfg_logs').setLabel('Canal Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜')
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tcfg_staff').setLabel('Cargo Equipe').setStyle(ButtonStyle.Secondary).setEmoji('👮'),
      new ButtonBuilder().setCustomId('tcfg_admin').setLabel('Cargo Admin').setStyle(ButtonStyle.Secondary).setEmoji('🔐'),
      new ButtonBuilder().setCustomId('tcfg_preview').setLabel('Preview Painel').setStyle(ButtonStyle.Primary).setEmoji('👁️'),
      new ButtonBuilder().setCustomId('tcfg_refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );

    return { embeds: [embed], components: [row1, rowImg, row2, row3], ephemeral: true };
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    if (content === '!ticket') {
      const categories = this.config.categories || [{ name: 'Suporte', id: 'support' }];
      if (categories.length === 0) {
        return message.reply('❌ Nenhuma categoria configurada. Use `!configticket` para adicionar.');
      }

      await message.channel.send({
        embeds: [this.buildTicketPanelEmbed()],
        components: [this.buildTicketSelectRow()]
      });
    }

    if (content === '!configticket' || content.startsWith('!configbot')) {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Você não tem permissão para configurar o bot.');
      }

      try { await message.delete(); } catch (_) {}

      // Mensagem curta com botão — ao clicar abre painel EFÊMERO ("Só pode ver esta mensagem")
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`tcfg_open_${message.author.id}`)
          .setLabel('Abrir painel (só você vê)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚙️')
      );

      const sent = await message.channel.send({
        content: `${message.author} clique para abrir a configuração:`,
        components: [row]
      });
      // some em 30s se ninguém clicar
      setTimeout(() => sent.delete().catch(() => {}), 30000);
    }
  }

  async handleInteraction(interaction) {
    // ── Slash /configticket → painel 100% privado ──
    if (interaction.isChatInputCommand() && interaction.commandName === 'configticket') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      return interaction.reply(this.buildConfigPanel());
    }

    // ── Abrir painel config ──
    if (interaction.isButton() && interaction.customId.startsWith('tcfg_open_')) {
      const ownerId = interaction.customId.replace('tcfg_open_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Este botão não é para você.', ephemeral: true });
      }
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      // Painel com "Só pode ver esta mensagem"
      await interaction.reply(this.buildConfigPanel());
      try { await interaction.message.delete(); } catch (_) {}
      return;
    }

    // ── Botões do painel config ──
    if (interaction.isButton() && interaction.customId.startsWith('tcfg_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const id = interaction.customId;

      if (id === 'tcfg_refresh') {
        return interaction.update(this.buildConfigPanel());
      }

      if (id === 'tcfg_preview') {
        const embed = this.buildTicketPanelEmbed();
        return interaction.reply({
          content: '👁️ **Preview** do painel público de tickets:',
          embeds: [embed],
          ephemeral: true
        });
      }

      // Add categoria com nome + emoji
      if (id === 'tcfg_addcat') {
        const modal = new ModalBuilder()
          .setCustomId('tmodal_tcfg_addcat')
          .setTitle('Adicionar Categoria');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('cat_name')
              .setLabel('Nome da categoria')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(80)
              .setPlaceholder('Ex: Dúvidas')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('cat_emoji')
              .setLabel('Emoji (unicode ou :nome:id)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(80)
              .setPlaceholder('📩 ou <:nome:123456789>')
              .setValue('📩')
          )
        );
        return interaction.showModal(modal);
      }

      // Editar emoji — escolhe a categoria no select
      if (id === 'tcfg_editemoji') {
        const categories = this.config.categories || [];
        if (categories.length === 0) {
          return interaction.reply({ content: '❌ Nenhuma categoria cadastrada.', ephemeral: true });
        }
        const options = categories.slice(0, 25).map((c, i) => {
          const opt = {
            label: c.name.slice(0, 100),
            value: c.id || `cat_${i}`,
            description: `Emoji atual: ${c.emoji || '📩'}`.slice(0, 100)
          };
          const raw = (c.emoji || '📩').trim();
          const custom = raw.match(/^<?(a?):([a-zA-Z0-9_]+):(\d+)>?$/);
          if (custom) opt.emoji = { animated: custom[1] === 'a', name: custom[2], id: custom[3] };
          else opt.emoji = raw;
          return opt;
        });
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('tcfg_pick_cat_emoji')
            .setPlaceholder('Escolha a categoria para trocar o emoji')
            .addOptions(options)
        );
        return interaction.reply({
          content: '😀 Selecione a categoria que deseja alterar o emoji:',
          components: [row],
          ephemeral: true
        });
      }

      const modals = {
        tcfg_title: { title: 'Título do Embed', label: 'Título', style: TextInputStyle.Short, current: this.config.title },
        tcfg_message: { title: 'Mensagem do Embed', label: 'Mensagem', style: TextInputStyle.Paragraph, current: this.config.message },
        tcfg_footer: { title: 'Footer do Embed', label: 'Footer', style: TextInputStyle.Short, current: this.config.footer },
        tcfg_color: { title: 'Cor da Sidebar', label: 'Cor Hex (ex: #5865F2)', style: TextInputStyle.Short, current: this.color() },
        tcfg_banner: { title: 'Banner (URL da imagem)', label: 'URL da imagem grande (embaixo)', style: TextInputStyle.Short, current: this.config.banner || '' },
        tcfg_thumbnail: { title: 'Thumbnail (canto superior direito)', label: 'URL da imagem ou GIF', style: TextInputStyle.Short, current: this.config.thumbnail || '' },
        tcfg_addcat: { title: 'Adicionar Categoria', label: 'Nome da categoria', style: TextInputStyle.Short, current: '' },
        tcfg_remcat: { title: 'Remover Categoria', label: 'Nome exato da categoria', style: TextInputStyle.Short, current: '' },
        tcfg_category: { title: 'Categoria do Discord', label: 'ID da categoria onde tickets são criados', style: TextInputStyle.Short, current: this.config.ticketCategoryId || '' },
        tcfg_logs: { title: 'Canal de Logs', label: 'ID do canal de logs', style: TextInputStyle.Short, current: this.config.logChannelId || '' },
        tcfg_staff: { title: 'Cargo da Equipe', label: 'ID do cargo da equipe', style: TextInputStyle.Short, current: this.config.staffRoleId || '' },
        tcfg_admin: { title: 'Cargo Admin', label: 'ID do cargo autorizado a configurar', style: TextInputStyle.Short, current: this.config.authorizedRoleId || '' }
      };

      const m = modals[id];
      if (!m) return;

      const modal = new ModalBuilder().setCustomId(`tmodal_${id}`).setTitle(m.title);
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

    // ── Submit config ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith('tmodal_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const key = interaction.customId.replace('tmodal_', '');

      // Add categoria (nome + emoji)
      if (key === 'tcfg_addcat') {
        const name = interaction.fields.getTextInputValue('cat_name').trim();
        let emoji = '';
        try { emoji = interaction.fields.getTextInputValue('cat_emoji').trim(); } catch (_) {}
        if (!this.config.categories) this.config.categories = [];
        const catId = name.toLowerCase().replace(/\s+/g, '_').slice(0, 50);
        if (this.config.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
          return interaction.reply({ content: '❌ Essa categoria já existe.', ephemeral: true });
        }
        this.config.categories.push({ name, id: catId, emoji: emoji || '📩' });
        this.log('info', `Categoria adicionada: ${name} (${emoji || '📩'})`);
        try {
          await interaction.update(this.buildConfigPanel());
        } catch {
          await interaction.reply({ content: `✅ Categoria **${name}** adicionada com emoji ${emoji || '📩'}`, ephemeral: true });
        }
        return;
      }

      // Editar emoji (customId: tcfg_editemoji_<catId>)
      if (key.startsWith('tcfg_editemoji')) {
        const catValue = key.replace('tcfg_editemoji_', '').replace('tcfg_editemoji', '');
        const emoji = interaction.fields.getTextInputValue('cat_emoji').trim();
        if (!this.config.categories) this.config.categories = [];
        let cat = null;
        if (catValue) {
          cat = this.config.categories.find((c, i) => (c.id || `cat_${i}`) === catValue);
        }
        if (!cat) {
          return interaction.reply({ content: '❌ Categoria não encontrada.', ephemeral: true });
        }
        cat.emoji = emoji || '📩';
        this.log('info', `Emoji da categoria ${cat.name} → ${cat.emoji}`);
        await interaction.reply({
          content: `✅ Emoji de **${cat.name}** atualizado para ${cat.emoji}\n\n⚠️ Rode \`!ticket\` de novo no canal para o painel público atualizar.`,
          ephemeral: true
        });
        return;
      }

      const value = interaction.fields.getTextInputValue('value').trim();

      switch (key) {
        case 'tcfg_title': this.config.title = value; break;
        case 'tcfg_message': this.config.message = value; break;
        case 'tcfg_footer': this.config.footer = value; break;
        case 'tcfg_color':
          this.config.sidebarColor = value.startsWith('#') ? value : `#${value}`;
          break;
        case 'tcfg_banner': this.config.banner = value || null; break;
        case 'tcfg_thumbnail': this.config.thumbnail = value || null; break;
        case 'tcfg_addcat': {
          // fallback (não deve chegar aqui)
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


    // Escolheu categoria para editar emoji
    if (interaction.isStringSelectMenu() && interaction.customId === 'tcfg_pick_cat_emoji') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      const catValue = interaction.values[0];
      const cat = (this.config.categories || []).find(
        (c, i) => (c.id || `cat_${i}`) === catValue
      );
      if (!cat) {
        return interaction.reply({ content: '❌ Categoria não encontrada.', ephemeral: true });
      }
      const modal = new ModalBuilder()
        .setCustomId(`tmodal_tcfg_editemoji_${catValue}`)
        .setTitle(`Emoji: ${cat.name}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('cat_emoji')
            .setLabel('Novo emoji')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80)
            .setPlaceholder('Ex: ❓ 💰 📩 ou <:nome:ID>')
            .setValue((cat.emoji || '📩').slice(0, 80))
        )
      );
      return interaction.showModal(modal);
    }

    // ── Select categoria (CORREÇÃO DO BUG) ──
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const categoryId = interaction.values[0];
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId, id: categoryId };

      // Impede abrir 2 tickets ao mesmo tempo
      const existingId = this.userTickets.get(interaction.user.id);
      if (existingId) {
        const existing = interaction.guild.channels.cache.get(existingId);
        if (existing) {
          // Reseta o select imediatamente
          await this.resetSelectMenu(interaction.message);
          return interaction.reply({
            content: `❌ Você já possui um ticket aberto: ${existing}\nFeche-o antes de abrir outro.`,
            ephemeral: true
          });
        } else {
          this.userTickets.delete(interaction.user.id);
        }
      }

      // IMPORTANTE: resetar o select ANTES do modal
      // Assim a categoria não fica "travada" na interface
      await this.resetSelectMenu(interaction.message);

      const modal = new ModalBuilder()
        .setCustomId(`ticket_reason_${categoryId}`)
        .setTitle(`Ticket: ${String(category.name).slice(0, 40)}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Por que você abriu este ticket?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(1000)
            .setPlaceholder('Descreva o motivo com o máximo de detalhes...')
        )
      );

      return interaction.showModal(modal);
    }

    // ── Criar ticket ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_reason_')) {
      const categoryId = interaction.customId.replace('ticket_reason_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      // Checagem extra de ticket duplicado
      const existingId = this.userTickets.get(interaction.user.id);
      if (existingId) {
        const existing = interaction.guild.channels.cache.get(existingId);
        if (existing) {
          return interaction.reply({
            content: `❌ Você já possui um ticket aberto: ${existing}`,
            ephemeral: true
          });
        }
        this.userTickets.delete(interaction.user.id);
      }

      if (!this.config.ticketCategoryId) {
        return interaction.reply({
          content: '❌ Categoria de tickets não configurada. Um admin precisa usar `!configticket`.',
          ephemeral: true
        });
      }

      try {
        await interaction.deferReply({ ephemeral: true });

        // Nome do canal: (emoji da categoria)・(nome do Discord)
        const displayName = (interaction.member?.displayName || interaction.user.globalName || interaction.user.username || 'user');
        const safeName = displayName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 20) || 'user';

        let catEmoji = '📩';
        const rawEmoji = (category.emoji || '📩').trim();
        const customMatch = rawEmoji.match(/^<?(a?):([a-zA-Z0-9_]+):(\d+)>?$/);
        if (!customMatch) {
          const uni = rawEmoji.match(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u);
          if (uni) catEmoji = uni[0];
          else if (rawEmoji.length <= 4) catEmoji = rawEmoji;
        }
        // emoji custom do servidor não entra no nome do canal — usa 📩
        const channelName = `${catEmoji}・${safeName}`.slice(0, 100);

        const channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: this.config.ticketCategoryId,
          topic: `Ticket de ${interaction.user.tag} | Categoria: ${category.name} | ID: ${interaction.user.id}`,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            ...(this.config.staffRoleId ? [{
              id: this.config.staffRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles
              ]
            }] : [])
          ]
        });

        this.tickets.set(channel.id, {
          userId: interaction.user.id,
          assignee: null,
          subject: reason,
          category: category.name,
          createdAt: Date.now()
        });
        this.userTickets.set(interaction.user.id, channel.id);

        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 Ticket Aberto')
          .setDescription(
            `Olá ${interaction.user}! Seja bem-vindo ao suporte.\n` +
            `Nossa equipe já foi notificada e irá te atender em breve.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 **Aberto por**\n${interaction.user}\n\n` +
            `📁 **Categoria**\n${category.name}\n\n` +
            `📝 **Assunto**\n>>> ${reason}\n\n` +
            `👮 **Responsável**\n_Aguardando a equipe assumir_\n` +
            `━━━━━━━━━━━━━━━━━━━━`
          )
          .setColor(this.color())
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
          .setFooter({ text: `${this.config.footer || 'Sistema de Tickets'} • ID: ${interaction.user.id}` })
          .setTimestamp();

        const buttons1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Assumir').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('ticket_rename').setLabel('Renomear Ticket').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
          new ButtonBuilder().setCustomId('ticket_notify').setLabel('Avisar').setStyle(ButtonStyle.Primary).setEmoji('🔔')
        );
        const buttons2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_add').setLabel('Add Membro').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
          new ButtonBuilder().setCustomId('ticket_remove').setLabel('Rem Membro').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({
          content: `${interaction.user}${this.config.staffRoleId ? `\n<@&${this.config.staffRoleId}>` : ''}`,
          embeds: [ticketEmbed],
          components: [buttons1, buttons2]
        });

        await interaction.editReply({
          content: `✅ Seu ticket foi criado: ${channel}`
        });

        this.log('info', `Ticket opened by ${interaction.user.tag}: ${category.name}`);
        this._sendLog(
          interaction.guild,
          `🎫 **Ticket aberto**\nUsuário: ${interaction.user}\nCategoria: **${category.name}**\nCanal: ${channel}`
        );
      } catch (err) {
        const msg = { content: `❌ Erro ao criar ticket: ${err.message}` };
        if (interaction.deferred) {
          await interaction.editReply(msg).catch(() => {});
        } else {
          await interaction.reply({ ...msg, ephemeral: true }).catch(() => {});
        }
      }
    }

    // ── Botões do ticket ──
    if (interaction.isButton() && ['ticket_close', 'ticket_claim', 'ticket_add', 'ticket_remove', 'ticket_notify', 'ticket_rename'].includes(interaction.customId)) {
      const ticketData = this.tickets.get(interaction.channel.id);

      // Fechar
      if (interaction.customId === 'ticket_close') {
        if (!this.isStaff(interaction.member) && ticketData?.userId !== interaction.user.id) {
          return interaction.reply({ content: '❌ Sem permissão para fechar este ticket.', ephemeral: true });
        }

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('Confirmar fechamento').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: '⚠️ Tem certeza que deseja **fechar** este ticket? O canal será excluído.',
          components: [confirmRow],
          ephemeral: true
        });
      }

      // Assumir
      if (interaction.customId === 'ticket_claim') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Apenas a equipe pode assumir tickets.', ephemeral: true });
        }

        if (ticketData) {
          if (ticketData.assignee && ticketData.assignee !== interaction.user.id) {
            return interaction.reply({
              content: `⚠️ Este ticket já foi assumido por <@${ticketData.assignee}>.`,
              ephemeral: true
            });
          }
          ticketData.assignee = interaction.user.id;
        }

        try {
          const embed = EmbedBuilder.from(interaction.message.embeds[0]);
          const desc = embed.data.description || '';
          const newDesc = desc.replace(
            /\*\*Responsável\*\*\n.+/m,
            `**Responsável**\n${interaction.user}`
          );
          embed.setDescription(newDesc);
          embed.setColor('#3ba55d');
          await interaction.update({ embeds: [embed] });
        } catch {
          await interaction.reply({ content: `✅ Ticket assumido por ${interaction.user}`, ephemeral: true });
        }

        this._sendLog(interaction.guild, `✅ Ticket **assumido** por ${interaction.user} — #${interaction.channel.name}`);
      }


      // Renomear Ticket
      if (interaction.customId === 'ticket_rename') {
        if (!this.isStaff(interaction.member) && ticketData?.userId !== interaction.user.id) {
          return interaction.reply({ content: '❌ Sem permissão para renomear este ticket.', ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId('ticket_rename_modal')
          .setTitle('Renomear Ticket');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('new_name')
            .setLabel('Novo nome do canal')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(50)
            .setPlaceholder('ex: pagamento-joao')
            .setValue(interaction.channel.name.replace(/^.*?・/, '').slice(0, 50))
        ));
        return interaction.showModal(modal);
      }

      // Add membro
      if (interaction.customId === 'ticket_add') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('ticket_add_modal').setTitle('Adicionar Membro');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_id')
            .setLabel('ID do Usuário ou @menção')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('123456789012345678')
        ));
        return interaction.showModal(modal);
      }

      // Rem membro
      if (interaction.customId === 'ticket_remove') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('ticket_remove_modal').setTitle('Remover Membro');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_id')
            .setLabel('ID do Usuário ou @menção')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      // Avisar
      if (interaction.customId === 'ticket_notify') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        if (!ticketData?.userId) {
          return interaction.reply({ content: '❌ Não foi possível identificar o dono do ticket.', ephemeral: true });
        }
        try {
          const user = await this.client.users.fetch(ticketData.userId);
          await user.send(
            `🔔 **Atualização no seu ticket**\n\n` +
            `Servidor: **${interaction.guild.name}**\n` +
            `Canal: ${interaction.channel}\n` +
            `A equipe respondeu no seu ticket. Clique no canal para ver.`
          );
          await interaction.reply({ content: `✅ Aviso enviado para <@${ticketData.userId}>.`, ephemeral: true });
          this._sendLog(interaction.guild, `🔔 Aviso enviado para <@${ticketData.userId}> por ${interaction.user}`);
        } catch {
          await interaction.reply({ content: '❌ Não foi possível enviar DM (usuário com DMs fechadas).', ephemeral: true });
        }
      }
    }

    // Confirmar / cancelar fechamento
    if (interaction.isButton() && interaction.customId === 'ticket_close_confirm') {
      const ticketData = this.tickets.get(interaction.channel.id);
      if (!this.isStaff(interaction.member) && ticketData?.userId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      await interaction.update({
        content: '🔒 Fechando ticket... gerando transcript e enviando no PV.',
        components: []
      });

      // Transcript no PV de quem abriu (antes de apagar o canal)
      await this.sendTranscriptToOpener(interaction.channel, ticketData);

      if (ticketData?.userId) this.userTickets.delete(ticketData.userId);
      this.tickets.delete(interaction.channel.id);

      this._sendLog(interaction.guild, `🔒 Ticket **fechado** por ${interaction.user} — #${interaction.channel.name} (transcript enviado)`);

      try {
        await interaction.channel.send('🔒 Ticket fechado. Canal será excluído em 5 segundos...');
      } catch (_) {}

      setTimeout(async () => {
        try { await interaction.channel.delete('Ticket fechado'); } catch (_) {}
      }, 5000);
    }

    if (interaction.isButton() && interaction.customId === 'ticket_close_cancel') {
      return interaction.update({ content: '✅ Fechamento cancelado.', components: [] });
    }

    // Modais add/remove

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_rename_modal') {
      const ticketData = this.tickets.get(interaction.channel.id);
      if (!this.isStaff(interaction.member) && ticketData?.userId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      let newName = interaction.fields.getTextInputValue('new_name').trim()
        .replace(/\s+/g, '-')
        .slice(0, 90);
      if (!newName) {
        return interaction.reply({ content: '❌ Nome inválido.', ephemeral: true });
      }
      // Mantém formato emoji・nome se o usuário não colocar emoji
      const finalName = (newName.includes('・') ? newName : `📩・${newName}`).slice(0, 100);
      try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(finalName);
        await interaction.reply({ content: `✅ Ticket renomeado:\n\`${oldName}\` → \`${finalName}\``, ephemeral: true });
        this._sendLog(interaction.guild, `✏️ Ticket renomeado por ${interaction.user}: \`${oldName}\` → \`${finalName}\``);
        try {
          await interaction.channel.send({
            embeds: [
              new EmbedBuilder()
                .setDescription(`✏️ Canal renomeado por ${interaction.user}\n\`${oldName}\` → \`${finalName}\``)
                .setColor(this.color())
                .setTimestamp()
            ]
          });
        } catch (_) {}
      } catch (e) {
        await interaction.reply({ content: `❌ Erro ao renomear: ${e.message}`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_add_modal') {
      const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
      try {
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
        await interaction.reply(`✅ <@${userId}> adicionado ao ticket.`);
        this._sendLog(interaction.guild, `➕ Membro <@${userId}> adicionado por ${interaction.user}`);
      } catch (e) {
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_remove_modal') {
      const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
      try {
        await interaction.channel.permissionOverwrites.delete(userId);
        await interaction.reply(`✅ <@${userId}> removido do ticket.`);
        this._sendLog(interaction.guild, `➖ Membro <@${userId}> removido por ${interaction.user}`);
      } catch (e) {
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
      }
    }
  }


  async buildTranscript(channel, ticketData) {
    const lines = [];
    lines.push(`📋 TRANSCRIPT DO TICKET`);
    lines.push(`Servidor: ${channel.guild.name}`);
    lines.push(`Canal: #${channel.name}`);
    lines.push(`Categoria: ${ticketData?.category || '—'}`);
    lines.push(`Assunto: ${ticketData?.subject || '—'}`);
    lines.push(`Aberto por: ${ticketData?.userId ? `<@${ticketData.userId}>` : '—'}`);
    if (ticketData?.assignee) lines.push(`Responsável: <@${ticketData.assignee}>`);
    lines.push(`Fechado em: ${new Date().toLocaleString('pt-BR')}`);
    lines.push(`${'─'.repeat(40)}`);
    lines.push('');

    try {
      let lastId = undefined;
      const all = [];
      // busca até ~500 msgs (5 páginas)
      for (let i = 0; i < 5; i++) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts);
        if (!batch.size) break;
        all.push(...batch.values());
        lastId = batch.last().id;
        if (batch.size < 100) break;
      }
      all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const msg of all) {
        if (msg.author.bot && !msg.content && msg.embeds.length) {
          const e = msg.embeds[0];
          const title = e.title || '';
          const desc = (e.description || '').replace(/\n/g, ' ').slice(0, 200);
          lines.push(`[BOT] ${title} ${desc}`.trim());
          continue;
        }
        const time = new Date(msg.createdTimestamp).toLocaleString('pt-BR');
        const author = msg.member?.displayName || msg.author.username;
        let content = msg.content || '';
        if (msg.attachments.size) {
          content += (content ? ' ' : '') + [...msg.attachments.values()].map(a => a.url).join(' ');
        }
        if (!content && msg.embeds.length) content = '[embed]';
        if (!content) continue;
        lines.push(`[${time}] ${author}: ${content}`);
      }
    } catch (e) {
      lines.push(`(Erro ao coletar mensagens: ${e.message})`);
    }

    lines.push('');
    lines.push(`${'─'.repeat(40)}`);
    lines.push('Fim do transcript.');
    return lines.join('\n');
  }

  async sendTranscriptToOpener(channel, ticketData) {
    if (!ticketData?.userId) return;
    try {
      const user = await this.client.users.fetch(ticketData.userId);
      const transcript = await this.buildTranscript(channel, ticketData);

      const embed = new EmbedBuilder()
        .setTitle('📋 Transcript do Ticket')
        .setDescription(
          `Seu ticket em **${channel.guild.name}** foi fechado.\n\n` +
          `**Canal:** #${channel.name}\n` +
          `**Categoria:** ${ticketData.category || '—'}\n` +
          `**Assunto:** ${(ticketData.subject || '—').slice(0, 200)}`
        )
        .setColor(this.color())
        .setFooter({ text: this.config.footer || 'Sistema de Tickets' })
        .setTimestamp();

      // Discord DM: arquivo se transcript for longo
      if (transcript.length > 1800) {
        const { AttachmentBuilder } = require('discord.js');
        const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
          name: `transcript-${channel.name.replace(/[^a-z0-9-]/gi, '')}.txt`
        });
        await user.send({ embeds: [embed], files: [file] });
      } else {
        await user.send({
          embeds: [embed],
          content: '```\n' + transcript.slice(0, 1900) + '\n```'
        });
      }
      this.log('info', `Transcript enviado para ${user.tag}`);
    } catch (e) {
      this.log('error', `Falha ao enviar transcript: ${e.message}`);
    }
  }

  _sendLog(guild, message) {
    if (!this.config.logChannelId) return;
    const ch = guild.channels.cache.get(this.config.logChannelId);
    if (ch) ch.send(message).catch(() => {});
  }
}

module.exports = TicketsBot;
