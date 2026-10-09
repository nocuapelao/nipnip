  /**
 * Bot de Vendas
 * Commands: !vendas, !configvendas, !configvendas
 * Painel de config: so quem digitou o comando ve (ephemeral)
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder
} = require('discord.js');

class VendasBot {
  constructor({ token, config, botId, name, sendMessage }) {
    this.token = token;
    this.config = config;
    this.botId = botId;
    this.name = name;
    this.send = sendMessage;
    this.client = null;
    this.guildId = null;
    this.guildName = null;
    this.vendas = new Map(); // channelId -> data
    this.userVendas = new Map(); // userId -> channelId (impede venda duplicada)
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
        const cmds = [
          new SlashCommandBuilder()
            .setName('configvendas')
            .setDescription('Abrir painel privado de configuração das vendas')
            .toJSON(),
          new SlashCommandBuilder()
            .setName('configpix')
            .setDescription('Configurar chave PIX global (vendas)')
            .toJSON()
        ];
        // Global (pode demorar até 1h)
        await rest.put(Routes.applicationCommands(this.client.user.id), { body: cmds });
        // Por servidor = aparece na hora
        for (const [gid, guild] of this.client.guilds.cache) {
          try {
            await rest.put(Routes.applicationGuildCommands(this.client.user.id, gid), { body: cmds });
            this.log('info', `Slash registrados em ${guild.name}`);
          } catch (ge) {
            this.log('error', `Slash guild ${gid}: ${ge.message}`);
          }
        }
        this.log('info', 'Slash /configvendas e /configpix registrados');
      } catch (e) {
        this.log('error', `Falha ao registrar slash: ${e.message}`);
      }

      this.send({ type: 'ready', guildId: this.guildId, guildName: this.guildName });
      this.log('info', `VendasBot online as ${this.client.user.tag}`);
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

  // ── Painéis por canal (máximo 10) ──
  ensurePanels() {
    if (!this.config.panels || typeof this.config.panels !== 'object' || Array.isArray(this.config.panels)) {
      this.config.panels = {};
    }
    return this.config.panels;
  }

  panelCount() {
    return Object.keys(this.ensurePanels()).length;
  }

  getPanel(channelId) {
    return this.ensurePanels()[channelId] || null;
  }

  getOrCreatePanel(channelId) {
    const panels = this.ensurePanels();
    if (panels[channelId]) return panels[channelId];
    if (Object.keys(panels).length >= 10) return null;
    panels[channelId] = {
      title: '🛒 Central de Vendas',
      message: 'Selecione uma categoria para abrir uma venda.',
      footer: 'Sistema de Vendas',
      sidebarColor: '#3ba55d',
      banner: null,
      thumbnail: null,
      categories: [{ name: 'Produto', id: 'produto', emoji: '🛒' }],
      ticketCategoryId: null,
      logChannelId: null,
      staffRoleId: null,
      authorizedRoleId: null
    };
    return panels[channelId];
  }

  usePanel(channelId) {
    let p = this.getPanel(channelId);
    if (!p) {
      p = this.getOrCreatePanel(channelId);
      if (!p) return false;
    }
    this.config.title = p.title;
    this.config.message = p.message;
    this.config.footer = p.footer;
    this.config.sidebarColor = p.sidebarColor || '#3ba55d';
    this.config.banner = p.banner;
    this.config.thumbnail = p.thumbnail;
    this.config.categories = p.categories || [];
    this.config.ticketCategoryId = p.ticketCategoryId;
    this.config.logChannelId = p.logChannelId;
    this.config.staffRoleId = p.staffRoleId;
    this.config.authorizedRoleId = p.authorizedRoleId;
    this._activePanelChannelId = channelId;
    return true;
  }

  saveActivePanel() {
    if (!this._activePanelChannelId) return;
    this.ensurePanels()[this._activePanelChannelId] = {
      title: this.config.title,
      message: this.config.message,
      footer: this.config.footer,
      sidebarColor: this.config.sidebarColor,
      banner: this.config.banner,
      thumbnail: this.config.thumbnail,
      categories: this.config.categories,
      ticketCategoryId: this.config.ticketCategoryId,
      logChannelId: this.config.logChannelId,
      staffRoleId: this.config.staffRoleId,
      authorizedRoleId: this.config.authorizedRoleId
    };
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
  buildVendaSelectRow() {
    const categories = this.config.categories || [{ name: 'Suporte', id: 'support' }];
    const options = categories.slice(0, 25).map((c, i) => {
      const opt = {
        label: c.name.slice(0, 100),
        value: c.id || `cat_${i}`,
        description: `Abrir venda: ${c.name}`.slice(0, 100)
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
        .setCustomId('venda_select_category')
        .setPlaceholder('📩 Selecione a categoria de venda.')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options)
    );
  }

  buildVendaPanelEmbed() {
    const embed = new EmbedBuilder()
      .setTitle(this.config.title || '🛒 Central de Vendas')
      .setDescription(this.config.message || 'Selecione uma categoria abaixo para abrir uma venda com a nossa equipe.')
      .setColor(this.color())
      .setFooter({ text: this.config.footer || 'Sistema de Vendas' });
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
        embeds: [this.buildVendaPanelEmbed()],
        components: [this.buildVendaSelectRow()]
      });
    } catch (_) {}
  }

  buildConfigPanel() {
    const cats = (this.config.categories || []).map(c => `${c.emoji || '📩'} ${c.name}`).join(', ') || 'Nenhuma';

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Painel de Configuração — Vendas')
      .setDescription(`Só você está vendo este painel.\n📌 Canal: <#${this._activePanelChannelId || '?'}>\n📊 Painéis: **${this.panelCount()}/10**\n\nUse os botões para customizar **este canal**.`)
      .setColor(this.color())
      .addFields(
        { name: '📋 Título', value: this.config.title || 'Central de Vendas', inline: true },
        { name: '📝 Mensagem', value: (this.config.message || 'Selecione uma categoria...').slice(0, 100), inline: true },
        { name: '📌 Footer', value: this.config.footer || 'Sistema de Vendas', inline: true },
        { name: '🎨 Cor Sidebar', value: this.color(), inline: true },
        { name: '🖼️ Banner', value: this.config.banner ? 'Configurado' : 'Não definido', inline: true },
        { name: '📌 Thumbnail', value: this.config.thumbnail ? 'Configurado' : 'Não definido', inline: true },
        { name: '📂 Categorias', value: cats, inline: true },
        { name: '📁 Categoria Discord', value: this.config.vendaCategoryId ? `<#${this.config.vendaCategoryId}>` : 'Não definida', inline: true },
        { name: '📜 Canal de Logs', value: this.config.logChannelId ? `<#${this.config.logChannelId}>` : 'Não definido', inline: true },
        { name: '👮 Cargo Equipe', value: this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : 'Não definido', inline: true },
        { name: '🔐 Cargo Admin', value: this.config.authorizedRoleId ? `<@&${this.config.authorizedRoleId}>` : 'Administradores', inline: true }
      )
      .setFooter({ text: 'Configuração privada • apenas você vê' })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vcfg_title').setLabel('Título').setStyle(ButtonStyle.Primary).setEmoji('📋'),
      new ButtonBuilder().setCustomId('vcfg_message').setLabel('Mensagem').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('vcfg_footer').setLabel('Footer').setStyle(ButtonStyle.Primary).setEmoji('📌'),
      new ButtonBuilder().setCustomId('vcfg_color').setLabel('Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨')
    );

    const rowImg = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vcfg_banner').setLabel('Banner (baixo)').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
      new ButtonBuilder().setCustomId('vcfg_thumbnail').setLabel('Thumbnail (canto)').setStyle(ButtonStyle.Secondary).setEmoji('📌')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vcfg_addcat').setLabel('Add Categoria').setStyle(ButtonStyle.Success).setEmoji('➕'),
      new ButtonBuilder().setCustomId('vcfg_editemoji').setLabel('Emoji Categoria').setStyle(ButtonStyle.Primary).setEmoji('😀'),
      new ButtonBuilder().setCustomId('vcfg_remcat').setLabel('Rem Categoria').setStyle(ButtonStyle.Danger).setEmoji('➖'),
      new ButtonBuilder().setCustomId('vcfg_category').setLabel('Cat. Discord').setStyle(ButtonStyle.Secondary).setEmoji('📁'),
      new ButtonBuilder().setCustomId('vcfg_logs').setLabel('Canal Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜')
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vcfg_staff').setLabel('Cargo Equipe').setStyle(ButtonStyle.Secondary).setEmoji('👮'),
      new ButtonBuilder().setCustomId('vcfg_admin').setLabel('Cargo Admin').setStyle(ButtonStyle.Secondary).setEmoji('🔐'),
      new ButtonBuilder().setCustomId('vcfg_preview').setLabel('Preview Painel').setStyle(ButtonStyle.Primary).setEmoji('👁️'),
      new ButtonBuilder().setCustomId('vcfg_refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );

    return { embeds: [embed], components: [row1, rowImg, row2, row3], ephemeral: true };
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    if (content === '!vendas') {
      if (!this.getPanel(message.channel.id)) {
        if (this.panelCount() >= 10) {
          return message.reply('❌ Limite de **10 canais** de vendas atingido. Configure em um canal já existente ou remova um painel.');
        }
        if (!this.hasPermission(message.member)) {
          return message.reply('❌ Este canal ainda não tem painel de vendas. Peça a um admin para usar `!configvendas` aqui.');
        }
        this.getOrCreatePanel(message.channel.id);
      }
      if (!this.usePanel(message.channel.id)) {
        return message.reply('❌ Não foi possível carregar o painel deste canal.');
      }
      const categories = this.config.categories || [];
      if (categories.length === 0) {
        return message.reply('❌ Nenhuma categoria neste canal. Use `!configvendas` para adicionar.');
      }
      await message.channel.send({
        embeds: [this.buildVendaPanelEmbed()],
        components: [this.buildVendaSelectRow()]
      });
    }

    // !configpix — alternativa ao slash (abre modal via botão)
    if (content === '!configpix') {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Sem permissão.');
      }
      try { await message.delete(); } catch (_) {}
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vpix_open_${message.author.id}`)
          .setLabel('Configurar PIX')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💳')
      );
      const sent = await message.channel.send({
        content: `${message.author} clique para configurar o PIX (só você vê o formulário):`,
        components: [row]
      });
      setTimeout(() => sent.delete().catch(() => {}), 30000);
      return;
    }

    if (content === '!configvendas') {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Você não tem permissão para configurar o bot.');
      }

      // Painel deste canal (cria se ainda não existe e houver vaga)
      if (!this.getPanel(message.channel.id)) {
        if (this.panelCount() >= 10) {
          return message.reply(`❌ Limite de **10 canais** atingido (${this.panelCount()}/10).`);
        }
        this.getOrCreatePanel(message.channel.id);
      }
      this.usePanel(message.channel.id);

      try { await message.delete(); } catch (_) {}

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vcfg_open_${message.author.id}_${message.channel.id}`)
          .setLabel('Abrir painel (só você vê)')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚙️')
      );

      const sent = await message.channel.send({
        content: `${message.author} configurar vendas neste canal (**${this.panelCount()}/10**):`,
        components: [row]
      });
      setTimeout(() => sent.delete().catch(() => {}), 30000);
    }


    // !pix — só QR Code no canal da venda; apaga o comando na hora
    if (content === '!pix') {
      try { await message.delete(); } catch (_) {}

      // Só funciona dentro de um canal de venda aberto
      const vendaData = this.vendas.get(message.channel.id);
      if (!vendaData) {
        try {
          const warn = await message.channel.send('❌ Use `!pix` apenas dentro de um canal de **venda** aberta.');
          setTimeout(() => warn.delete().catch(() => {}), 4000);
        } catch (_) {}
        return;
      }

      const payload = this.buildPixPayload();
      if (!payload) {
        try {
          const warn = await message.channel.send('❌ PIX ainda não configurado. Um admin deve usar `/configpix`.');
          setTimeout(() => warn.delete().catch(() => {}), 5000);
        } catch (_) {}
        return;
      }

      const pix = this.getPixConfig();
      const qrUrl = this.pixQrUrl(payload);
      const embed = new EmbedBuilder()
        .setColor(pix.color || '#3ba55d')
        .setImage(qrUrl)
        .setFooter({ text: pix.footer || 'Pagamento via PIX' });

      await message.channel.send({ embeds: [embed] });
      this.log('info', `PIX QR enviado em #${message.channel.name} por ${message.author.tag}`);
      return;
    }

  }

  async handleInteraction(interaction) {
    // ── Slash /configvendas → painel 100% privado ──
    // /configpix — 1 chave para todas as vendas
    if (interaction.isChatInputCommand() && interaction.commandName === 'configpix') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão. Precisa ser Administrador ou ter o cargo autorizado.', ephemeral: true });
      }
      try {
        await this.showPixPanel(interaction);
      } catch (e) {
        this.log('error', `configpix modal: ${e.message}`);
        return interaction.reply({ content: `❌ Erro ao abrir config PIX: ${e.message}`, ephemeral: true }).catch(() => {});
      }
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'configvendas') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      if (!interaction.channel) {
        return interaction.reply({ content: '❌ Use este comando em um canal de texto.', ephemeral: true });
      }
      if (!this.getPanel(interaction.channel.id)) {
        if (this.panelCount() >= 10) {
          return interaction.reply({ content: `❌ Limite de **10 canais** atingido (${this.panelCount()}/10).`, ephemeral: true });
        }
        this.getOrCreatePanel(interaction.channel.id);
      }
      this.usePanel(interaction.channel.id);
      return interaction.reply(this.buildConfigPanel());
    }

    // ── Abrir painel config ──

    // ── Botões do painel PIX ──
    if (interaction.isButton() && interaction.customId.startsWith('pixcfg_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      const id = interaction.customId;
      const pix = this.getPixConfig();

      if (id === 'pixcfg_refresh') {
        return interaction.update(this.buildPixConfigPanel());
      }

      if (id === 'pixcfg_preview') {
        const payload = this.buildPixPayload();
        if (!payload) {
          return interaction.reply({ content: '❌ Configure a chave PIX primeiro.', ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setColor(pix.color || '#3ba55d')
          .setImage(this.pixQrUrl(payload))
          .setFooter({ text: pix.footer || 'Pagamento via PIX' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const fields = {
        pixcfg_key: { title: 'Chave PIX', label: 'Chave PIX', max: 100, current: pix.key },
        pixcfg_name: { title: 'Nome do vendedor', label: 'Nome do vendedor', max: 25, current: pix.name },
        pixcfg_city: { title: 'Cidade', label: 'Cidade', max: 15, current: pix.city },
        pixcfg_color: { title: 'Cor da Sidebar', label: 'Cor Hex (ex: #3ba55d)', max: 7, current: pix.color || '#3ba55d' },
        pixcfg_footer: { title: 'Footer do Embed', label: 'Texto do footer', max: 100, current: pix.footer || 'Pagamento via PIX' }
      };
      const f = fields[id];
      if (!f) return;

      const modal = new ModalBuilder().setCustomId(`vmodal_${id}`).setTitle(f.title);
      const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(f.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(f.max);
      if (f.current) input.setValue(String(f.current).slice(0, f.max));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId.startsWith('vpix_open_')) {
      const ownerId = interaction.customId.replace('vpix_open_', '');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Este botão não é para você.', ephemeral: true });
      }
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      try {
        await this.showPixPanel(interaction);
        try { await interaction.message.delete(); } catch (_) {}
      } catch (e) {
        this.log('error', `vpix_open: ${e.message}`);
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true }).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('vcfg_open_')) {
      const parts = interaction.customId.split('_');
      // vcfg_open_<userId> or vcfg_open_<userId>_<channelId>
      const ownerId = parts[2];
      const channelId = parts[3] || interaction.channel?.id;
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Este botão não é para você.', ephemeral: true });
      }
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      if (channelId) this.usePanel(channelId);
      await interaction.reply(this.buildConfigPanel());
      try { await interaction.message.delete(); } catch (_) {}
      return;
    }

    // ── Botões do painel config ──
    if (interaction.isButton() && interaction.customId.startsWith('vcfg_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }
      if (interaction.channel?.id) this.usePanel(interaction.channel.id);

      const id = interaction.customId;

      if (id === 'vcfg_refresh') {
        return interaction.update(this.buildConfigPanel());
      }

      if (id === 'vcfg_preview') {
        const embed = this.buildVendaPanelEmbed();
        return interaction.reply({
          content: '👁️ **Preview** do painel público de vendas:',
          embeds: [embed],
          ephemeral: true
        });
      }

      // Add categoria com nome + emoji
      if (id === 'vcfg_addcat') {
        const modal = new ModalBuilder()
          .setCustomId('vmodal_vcfg_addcat')
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
      if (id === 'vcfg_editemoji') {
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
            .setCustomId('vcfg_pick_cat_emoji')
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
        vcfg_title: { title: 'Título do Embed', label: 'Título', style: TextInputStyle.Short, current: this.config.title },
        vcfg_message: { title: 'Mensagem do Embed', label: 'Mensagem', style: TextInputStyle.Paragraph, current: this.config.message },
        vcfg_footer: { title: 'Footer do Embed', label: 'Footer', style: TextInputStyle.Short, current: this.config.footer },
        vcfg_color: { title: 'Cor da Sidebar', label: 'Cor Hex (ex: #5865F2)', style: TextInputStyle.Short, current: this.color() },
        vcfg_banner: { title: 'Banner (URL da imagem)', label: 'URL da imagem grande (embaixo)', style: TextInputStyle.Short, current: this.config.banner || '' },
        vcfg_thumbnail: { title: 'Thumbnail (canto superior direito)', label: 'URL da imagem ou GIF', style: TextInputStyle.Short, current: this.config.thumbnail || '' },
        vcfg_addcat: { title: 'Adicionar Categoria', label: 'Nome da categoria', style: TextInputStyle.Short, current: '' },
        vcfg_remcat: { title: 'Remover Categoria', label: 'Nome exato da categoria', style: TextInputStyle.Short, current: '' },
        vcfg_category: { title: 'Categoria do Discord', label: 'ID da categoria onde vendas são criados', style: TextInputStyle.Short, current: this.config.vendaCategoryId || '' },
        vcfg_logs: { title: 'Canal de Logs', label: 'ID do canal de logs', style: TextInputStyle.Short, current: this.config.logChannelId || '' },
        vcfg_staff: { title: 'Cargo da Equipe', label: 'ID do cargo da equipe', style: TextInputStyle.Short, current: this.config.staffRoleId || '' },
        vcfg_admin: { title: 'Cargo Admin', label: 'ID do cargo autorizado a configurar', style: TextInputStyle.Short, current: this.config.authorizedRoleId || '' }
      };

      const m = modals[id];
      if (!m) return;

      const modal = new ModalBuilder().setCustomId(`vmodal_${id}`).setTitle(m.title);
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
    if (interaction.isModalSubmit() && interaction.customId.startsWith('vmodal_')) {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      // Salvar campos do painel PIX
      if (interaction.customId.startsWith('vmodal_pixcfg_')) {
        const field = interaction.customId.replace('vmodal_pixcfg_', '');
        const value = interaction.fields.getTextInputValue('value').trim();
        const pix = this.getPixConfig();
        if (field === 'key') pix.key = value;
        else if (field === 'name') pix.name = value;
        else if (field === 'city') pix.city = value;
        else if (field === 'color') pix.color = value.startsWith('#') ? value : `#${value}`;
        else if (field === 'footer') pix.footer = value;
        this.config.pix = pix;
        this.log('info', `PIX ${field} atualizado por ${interaction.user.tag}`);
        try {
          await interaction.update(this.buildPixConfigPanel());
        } catch {
          await interaction.reply({ content: '✅ PIX atualizado!', ephemeral: true });
        }
        return;
      }


      const key = interaction.customId.replace('vmodal_', '');

      // Add categoria (nome + emoji)
      if (key === 'vcfg_addcat') {
        const name = interaction.fields.getTextInputValue('cat_name').trim();
        let emoji = '';
        try { emoji = interaction.fields.getTextInputValue('cat_emoji').trim(); } catch (_) {}
        if (!this.config.categories) this.config.categories = [];
        const catId = name.toLowerCase().replace(/\s+/g, '_').slice(0, 50);
        if (this.config.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
          return interaction.reply({ content: '❌ Essa categoria já existe.', ephemeral: true });
        }
        this.config.categories.push({ name, id: catId, emoji: emoji || '📩' });
        this.saveActivePanel();
        this.log('info', `Categoria adicionada: ${name} (${emoji || '📩'})`);
        try {
          await interaction.update(this.buildConfigPanel());
        } catch {
          await interaction.reply({ content: `✅ Categoria **${name}** adicionada com emoji ${emoji || '📩'}`, ephemeral: true });
        }
        return;
      }

      // Editar emoji (customId: vcfg_editemoji_<catId>)
      if (key.startsWith('vcfg_editemoji')) {
        const catValue = key.replace('vcfg_editemoji_', '').replace('vcfg_editemoji', '');
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
        this.saveActivePanel();
        this.log('info', `Emoji da categoria ${cat.name} → ${cat.emoji}`);
        await interaction.reply({
          content: `✅ Emoji de **${cat.name}** atualizado para ${cat.emoji}\n\n⚠️ Rode \`!vendas\` de novo neste canal para o painel atualizar.`,
          ephemeral: true
        });
        return;
      }

      const value = interaction.fields.getTextInputValue('value').trim();

      switch (key) {
        case 'vcfg_title': this.config.title = value; break;
        case 'vcfg_message': this.config.message = value; break;
        case 'vcfg_footer': this.config.footer = value; break;
        case 'vcfg_color':
          this.config.sidebarColor = value.startsWith('#') ? value : `#${value}`;
          break;
        case 'vcfg_banner': this.config.banner = value || null; break;
        case 'vcfg_thumbnail': this.config.thumbnail = value || null; break;
        case 'vcfg_addcat': {
          // fallback (não deve chegar aqui)
          break;
        }
        case 'vcfg_remcat': {
          if (!this.config.categories) this.config.categories = [];
          const before = this.config.categories.length;
          this.config.categories = this.config.categories.filter(
            c => c.name.toLowerCase() !== value.toLowerCase()
          );
          if (this.config.categories.length === before) {
            return interaction.reply({ content: '❌ Categoria não encontrada.', ephemeral: true });
          }
          this.saveActivePanel();
          break;
        }
        case 'vcfg_category':
          this.config.vendaCategoryId = value.replace(/[<#>]/g, '');
          break;
        case 'vcfg_logs':
          this.config.logChannelId = value.replace(/[<#>]/g, '');
          break;
        case 'vcfg_staff':
          this.config.staffRoleId = value.replace(/[<@&>]/g, '');
          break;
        case 'vcfg_admin':
          this.config.authorizedRoleId = value.replace(/[<@&>]/g, '');
          break;
        default:
          return interaction.reply({ content: '❌ Ação desconhecida.', ephemeral: true });
      }

      this.saveActivePanel();
      this.log('info', `Config updated by ${interaction.user.tag}: ${key} (canal ${this._activePanelChannelId})`);
      this._sendLog(interaction.guild, `⚙️ Config de vendas alterada por ${interaction.user}: \`${key}\` em <#${this._activePanelChannelId}>`);

      try {
        await interaction.update(this.buildConfigPanel());
      } catch {
        await interaction.reply({
          content: '✅ Configuração salva neste canal! Use **Atualizar** ou `!configvendas` de novo.',
          ephemeral: true
        });
      }
    }


    // Escolheu categoria para editar emoji
    if (interaction.isStringSelectMenu() && interaction.customId === 'vcfg_pick_cat_emoji') {
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
        .setCustomId(`vmodal_vcfg_editemoji_${catValue}`)
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
    if (interaction.isStringSelectMenu() && interaction.customId === 'venda_select_category') {
      if (!this.usePanel(interaction.channel.id)) {
        return interaction.reply({ content: '❌ Painel deste canal não configurado.', ephemeral: true });
      }
      const categoryId = interaction.values[0];
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId, id: categoryId };

      // Impede abrir 2 vendas ao mesmo tempo
      const existingId = this.userVendas.get(interaction.user.id);
      if (existingId) {
        const existing = interaction.guild.channels.cache.get(existingId);
        if (existing) {
          // Reseta o select imediatamente
          await this.resetSelectMenu(interaction.message);
          return interaction.reply({
            content: `❌ Você já possui uma venda aberto: ${existing}\nFeche-o antes de abrir outro.`,
            ephemeral: true
          });
        } else {
          this.userVendas.delete(interaction.user.id);
        }
      }

      // IMPORTANTE: resetar o select ANTES do modal
      // Assim a categoria não fica "travada" na interface
      await this.resetSelectMenu(interaction.message);

      const modal = new ModalBuilder()
        .setCustomId(`venda_reason_${categoryId}`)
        .setTitle(`Venda: ${String(category.name).slice(0, 40)}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Por que você abriu esta venda?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(1000)
            .setPlaceholder('Descreva o motivo com o máximo de detalhes...')
        )
      );

      return interaction.showModal(modal);
    }

    // ── Criar venda ──
    if (interaction.isModalSubmit() && interaction.customId.startsWith('venda_reason_')) {
      const categoryId = interaction.customId.replace('venda_reason_', '');
      const reason = interaction.fields.getTextInputValue('reason');
      const category = (this.config.categories || []).find(c => (c.id || c.name) === categoryId) ||
                       { name: categoryId };

      // Checagem extra de venda duplicado
      const existingId = this.userVendas.get(interaction.user.id);
      if (existingId) {
        const existing = interaction.guild.channels.cache.get(existingId);
        if (existing) {
          return interaction.reply({
            content: `❌ Você já possui uma venda aberto: ${existing}`,
            ephemeral: true
          });
        }
        this.userVendas.delete(interaction.user.id);
      }

      if (!this.config.vendaCategoryId) {
        return interaction.reply({
          content: '❌ Categoria de vendas não configurada. Um admin precisa usar `!configvendas`.',
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
          parent: this.config.vendaCategoryId,
          topic: `Venda de ${interaction.user.tag} | Categoria: ${category.name} | ID: ${interaction.user.id}`,
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

        this.vendas.set(channel.id, {
          userId: interaction.user.id,
          assignee: null,
          subject: reason,
          category: category.name,
          createdAt: Date.now()
        });
        this.userVendas.set(interaction.user.id, channel.id);

        const vendaEmbed = new EmbedBuilder()
          .setTitle('🎫 Venda Aberta')
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
          .setFooter({ text: `${this.config.footer || 'Sistema de Vendas'} • ID: ${interaction.user.id}` })
          .setTimestamp();

        const buttons1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('venda_claim').setLabel('Assumir').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('venda_rename').setLabel('Renomear Venda').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
          new ButtonBuilder().setCustomId('venda_notify').setLabel('Avisar').setStyle(ButtonStyle.Primary).setEmoji('🔔')
        );
        const buttons2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('venda_add').setLabel('Add Membro').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
          new ButtonBuilder().setCustomId('venda_remove').setLabel('Rem Membro').setStyle(ButtonStyle.Secondary).setEmoji('➖'),
          new ButtonBuilder().setCustomId('venda_close').setLabel('Fechar').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await channel.send({
          content: `${interaction.user}${this.config.staffRoleId ? `\n<@&${this.config.staffRoleId}>` : ''}`,
          embeds: [vendaEmbed],
          components: [buttons1, buttons2]
        });

        await interaction.editReply({
          content: `✅ Sua venda foi criado: ${channel}`
        });

        this.log('info', `Venda opened by ${interaction.user.tag}: ${category.name}`);
        this._sendLog(
          interaction.guild,
          `🎫 **Venda aberta**\nUsuário: ${interaction.user}\nCategoria: **${category.name}**\nCanal: ${channel}`
        );
      } catch (err) {
        const msg = { content: `❌ Erro ao criar venda: ${err.message}` };
        if (interaction.deferred) {
          await interaction.editReply(msg).catch(() => {});
        } else {
          await interaction.reply({ ...msg, ephemeral: true }).catch(() => {});
        }
      }
    }

    // ── Botões da venda ──
    if (interaction.isButton() && ['venda_close', 'venda_claim', 'venda_add', 'venda_remove', 'venda_notify', 'venda_rename'].includes(interaction.customId)) {
      const vendaData = this.vendas.get(interaction.channel.id);

      // Fechar
      if (interaction.customId === 'venda_close') {
        if (!this.isStaff(interaction.member) && vendaData?.userId !== interaction.user.id) {
          return interaction.reply({ content: '❌ Sem permissão para fechar esta venda.', ephemeral: true });
        }

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('venda_close_confirm').setLabel('Confirmar fechamento').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
          new ButtonBuilder().setCustomId('venda_close_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: '⚠️ Tem certeza que deseja **fechar** esta venda? O canal será excluído.',
          components: [confirmRow],
          ephemeral: true
        });
      }

      // Assumir
      if (interaction.customId === 'venda_claim') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Apenas a equipe pode assumir vendas.', ephemeral: true });
        }

        if (vendaData) {
          if (vendaData.assignee && vendaData.assignee !== interaction.user.id) {
            return interaction.reply({
              content: `⚠️ Esta venda já foi assumida por <@${vendaData.assignee}>.`,
              ephemeral: true
            });
          }
          vendaData.assignee = interaction.user.id;
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
          await interaction.reply({ content: `✅ Venda assumido por ${interaction.user}`, ephemeral: true });
        }

        this._sendLog(interaction.guild, `✅ Venda **assumido** por ${interaction.user} — #${interaction.channel.name}`);
      }


      // Renomear Venda
      if (interaction.customId === 'venda_rename') {
        if (!this.isStaff(interaction.member) && vendaData?.userId !== interaction.user.id) {
          return interaction.reply({ content: '❌ Sem permissão para renomear esta venda.', ephemeral: true });
        }
        const modal = new ModalBuilder()
          .setCustomId('venda_rename_modal')
          .setTitle('Renomear Venda');
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
      if (interaction.customId === 'venda_add') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('venda_add_modal').setTitle('Adicionar Membro');
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
      if (interaction.customId === 'venda_remove') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('venda_remove_modal').setTitle('Remover Membro');
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
      if (interaction.customId === 'venda_notify') {
        if (!this.isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        if (!vendaData?.userId) {
          return interaction.reply({ content: '❌ Não foi possível identificar o dono da venda.', ephemeral: true });
        }
        try {
          const user = await this.client.users.fetch(vendaData.userId);
          await user.send(
            `🔔 **Atualização no sua venda**\n\n` +
            `Servidor: **${interaction.guild.name}**\n` +
            `Canal: ${interaction.channel}\n` +
            `A equipe respondeu no sua venda. Clique no canal para ver.`
          );
          await interaction.reply({ content: `✅ Aviso enviado para <@${vendaData.userId}>.`, ephemeral: true });
          this._sendLog(interaction.guild, `🔔 Aviso enviado para <@${vendaData.userId}> por ${interaction.user}`);
        } catch {
          await interaction.reply({ content: '❌ Não foi possível enviar DM (usuário com DMs fechadas).', ephemeral: true });
        }
      }
    }

    // Confirmar / cancelar fechamento
    if (interaction.isButton() && interaction.customId === 'venda_close_confirm') {
      const vendaData = this.vendas.get(interaction.channel.id);
      if (!this.isStaff(interaction.member) && vendaData?.userId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      await interaction.update({
        content: '🔒 Fechanda venda... gerando transcript e enviando no PV.',
        components: []
      });

      // Transcript no PV de quem abriu (antes de apagar o canal)
      await this.sendTranscriptToOpener(interaction.channel, vendaData);

      if (vendaData?.userId) this.userVendas.delete(vendaData.userId);
      this.vendas.delete(interaction.channel.id);

      this._sendLog(interaction.guild, `🔒 Venda **fechado** por ${interaction.user} — #${interaction.channel.name} (transcript enviado)`);

      try {
        await interaction.channel.send('🔒 Venda fechado. Canal será excluído em 5 segundos...');
      } catch (_) {}

      setTimeout(async () => {
        try { await interaction.channel.delete('Venda fechado'); } catch (_) {}
      }, 5000);
    }

    if (interaction.isButton() && interaction.customId === 'venda_close_cancel') {
      return interaction.update({ content: '✅ Fechamento cancelado.', components: [] });
    }

    // Modais add/remove

    if (interaction.isModalSubmit() && interaction.customId === 'venda_rename_modal') {
      const vendaData = this.vendas.get(interaction.channel.id);
      if (!this.isStaff(interaction.member) && vendaData?.userId !== interaction.user.id) {
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
        await interaction.reply({ content: `✅ Venda renomeado:\n\`${oldName}\` → \`${finalName}\``, ephemeral: true });
        this._sendLog(interaction.guild, `✏️ Venda renomeado por ${interaction.user}: \`${oldName}\` → \`${finalName}\``);
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

    if (interaction.isModalSubmit() && interaction.customId === 'venda_add_modal') {
      const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
      try {
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true
        });
        await interaction.reply(`✅ <@${userId}> adicionado aa venda.`);
        this._sendLog(interaction.guild, `➕ Membro <@${userId}> adicionado por ${interaction.user}`);
      } catch (e) {
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'venda_remove_modal') {
      const userId = interaction.fields.getTextInputValue('user_id').replace(/[<@!>]/g, '');
      try {
        await interaction.channel.permissionOverwrites.delete(userId);
        await interaction.reply(`✅ <@${userId}> removido da venda.`);
        this._sendLog(interaction.guild, `➖ Membro <@${userId}> removido por ${interaction.user}`);
      } catch (e) {
        await interaction.reply({ content: `❌ Erro: ${e.message}`, ephemeral: true });
      }
    }
  }


  async buildTranscript(channel, vendaData) {
    const lines = [];
    lines.push(`📋 TRANSCRIPT DO TICKET`);
    lines.push(`Servidor: ${channel.guild.name}`);
    lines.push(`Canal: #${channel.name}`);
    lines.push(`Categoria: ${vendaData?.category || '—'}`);
    lines.push(`Assunto: ${vendaData?.subject || '—'}`);
    lines.push(`Aberto por: ${vendaData?.userId ? `<@${vendaData.userId}>` : '—'}`);
    if (vendaData?.assignee) lines.push(`Responsável: <@${vendaData.assignee}>`);
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

  async sendTranscriptToOpener(channel, vendaData) {
    if (!vendaData?.userId) return;
    try {
      const user = await this.client.users.fetch(vendaData.userId);
      const transcript = await this.buildTranscript(channel, vendaData);

      const embed = new EmbedBuilder()
        .setTitle('📋 Transcript do Venda')
        .setDescription(
          `Sua venda em **${channel.guild.name}** foi fechado.\n\n` +
          `**Canal:** #${channel.name}\n` +
          `**Categoria:** ${vendaData.category || '—'}\n` +
          `**Assunto:** ${(vendaData.subject || '—').slice(0, 200)}`
        )
        .setColor(this.color())
        .setFooter({ text: this.config.footer || 'Sistema de Vendas' })
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


  // ── PIX (1 chave global para todas as vendas) ──
  getPixConfig() {
    if (!this.config.pix || typeof this.config.pix !== 'object') {
      this.config.pix = {
        key: '',
        name: '',
        city: '',
        color: '#3ba55d',
        footer: 'Pagamento via PIX'
      };
    }
    if (!this.config.pix.color) this.config.pix.color = '#3ba55d';
    if (this.config.pix.footer == null || this.config.pix.footer === '') {
      this.config.pix.footer = 'Pagamento via PIX';
    }
    return this.config.pix;
  }

  buildPixConfigPanel() {
    const pix = this.getPixConfig();
    const keyPreview = pix.key
      ? (pix.key.length > 24 ? pix.key.slice(0, 10) + '...' + pix.key.slice(-8) : pix.key)
      : '_Não configurada_';

    const embed = new EmbedBuilder()
      .setTitle('💳 Painel de Configuração — PIX')
      .setDescription(
        'Só você está vendo este painel.\n' +
        'A chave PIX é **única** para todas as vendas.\n\n' +
        'Use os botões para customizar.'
      )
      .setColor(pix.color || '#3ba55d')
      .addFields(
        { name: '🔑 Chave PIX', value: keyPreview, inline: true },
        { name: '👤 Nome do vendedor', value: pix.name || '_Não definido_', inline: true },
        { name: '🏙️ Cidade', value: pix.city || '_Não definida_', inline: true },
        { name: '🎨 Cor da Sidebar', value: pix.color || '#3ba55d', inline: true },
        { name: '📌 Footer do Embed', value: (pix.footer || 'Pagamento via PIX').slice(0, 100), inline: true }
      )
      .setFooter({ text: pix.footer || 'Pagamento via PIX' })
      .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pixcfg_key').setLabel('Chave PIX').setStyle(ButtonStyle.Primary).setEmoji('🔑'),
      new ButtonBuilder().setCustomId('pixcfg_name').setLabel('Nome').setStyle(ButtonStyle.Primary).setEmoji('👤'),
      new ButtonBuilder().setCustomId('pixcfg_city').setLabel('Cidade').setStyle(ButtonStyle.Primary).setEmoji('🏙️')
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pixcfg_color').setLabel('Cor Sidebar').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
      new ButtonBuilder().setCustomId('pixcfg_footer').setLabel('Footer').setStyle(ButtonStyle.Secondary).setEmoji('📌'),
      new ButtonBuilder().setCustomId('pixcfg_preview').setLabel('Preview').setStyle(ButtonStyle.Success).setEmoji('👁️'),
      new ButtonBuilder().setCustomId('pixcfg_refresh').setLabel('Atualizar').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
    );

    return { embeds: [embed], components: [row1, row2], ephemeral: true };
  }

  async showPixPanel(interaction) {
    return interaction.reply(this.buildPixConfigPanel());
  }

  // CRC16-CCITT (0x1021) para payload PIX
  crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
        else crc <<= 1;
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  emv(id, value) {
    const v = String(value);
    const len = String(v.length).padStart(2, '0');
    return `${id}${len}${v}`;
  }

  buildPixPayload() {
    const pix = this.getPixConfig();
    const key = (pix.key || '').trim();
    const name = (pix.name || 'VENDEDOR').trim().substring(0, 25).toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '') || 'VENDEDOR';
    const city = (pix.city || 'SAO PAULO').trim().substring(0, 15).toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '') || 'SAO PAULO';

    if (!key) return null;

    // Merchant Account Information (GUI + key)
    const gui = this.emv('00', 'br.gov.bcb.pix');
    const chave = this.emv('01', key);
    const merchantAccount = this.emv('26', gui + chave);

    let payload = '';
    payload += this.emv('00', '01');           // Payload Format Indicator
    payload += this.emv('01', '11');           // Point of Initiation - static
    payload += merchantAccount;
    payload += this.emv('52', '0000');         // MCC
    payload += this.emv('53', '986');          // BRL
    payload += this.emv('58', 'BR');
    payload += this.emv('59', name);
    payload += this.emv('60', city);
    payload += this.emv('62', this.emv('05', '***')); // txid
    payload += '6304';                         // CRC placeholder
    payload += this.crc16(payload);
    return payload;
  }

  pixQrUrl(payload) {
    const data = encodeURIComponent(payload);
    return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${data}`;
  }

  _sendLog(guild, message) {
    if (!this.config.logChannelId) return;
    const ch = guild.channels.cache.get(this.config.logChannelId);
    if (ch) ch.send(message).catch(() => {});
  }
}

module.exports = VendasBot;
