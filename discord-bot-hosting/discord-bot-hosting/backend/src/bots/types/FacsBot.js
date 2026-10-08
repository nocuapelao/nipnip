/**
 * Bot de FACs (GTA/FiveM Clans)
 * Commands: /config, !hierarquia, !set, !farm, !configbot
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType,
  SlashCommandBuilder, REST, Routes
} = require('discord.js');

class FacsBot {
  constructor({ token, config, botId, name, sendMessage }) {
    this.token = token;
    this.config = config;
    this.botId = botId;
    this.name = name;
    this.send = sendMessage;
    this.client = null;
    this.guildId = null;
    this.guildName = null;
    this.activeFarms = new Map(); // userId -> channelId
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

      // Register slash command /config
      try {
        const rest = new REST({ version: '10' }).setToken(this.token);
        await rest.put(
          Routes.applicationCommands(this.client.user.id),
          {
            body: [
              new SlashCommandBuilder()
                .setName('config')
                .setDescription('Painel de configuração do Bot de FACs')
                .toJSON()
            ]
          }
        );
      } catch (e) {
        this.log('error', `Slash command register failed: ${e.message}`);
      }

      this.send({ type: 'ready', guildId: this.guildId, guildName: this.guildName });
      this.log('info', `FacsBot online as ${this.client.user.tag}`);
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
    this.log('info', 'Config reloaded');
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

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    // !hierarquia
    if (content === '!hierarquia') {
      const hierarchy = this.config.hierarchy || [];
      if (hierarchy.length === 0) {
        return message.reply('❌ Hierarquia não configurada. Use `/config`.');
      }

      const embeds = [];
      for (const rank of hierarchy) {
        const role = message.guild.roles.cache.get(rank.roleId);
        const members = role
          ? role.members.map(m => `👤 ${m}`).join('\n') || '_Nenhum membro_'
          : '_Cargo não encontrado_';

        const embed = new EmbedBuilder()
          .setTitle(rank.name || role?.name || 'Cargo')
          .setDescription(`${rank.description || ''}\n\n${members}`)
          .setColor(this.color());
        embeds.push(embed);
      }

      // Discord limit 10 embeds
      for (let i = 0; i < embeds.length; i += 10) {
        await message.channel.send({ embeds: embeds.slice(i, i + 10) });
      }
    }

    // !set - Registro
    if (content === '!set') {
      const embed = new EmbedBuilder()
        .setTitle(this.config.registerTitle || 'Registro')
        .setDescription(this.config.registerMessage || 'Clique no botão abaixo para se registrar.')
        .setColor(this.color())
        .setFooter({ text: this.config.registerFooter || 'Sistema de Registro' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('facs_register')
          .setLabel('Registro')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📝')
      );

      await message.channel.send({ embeds: [embed], components: [row] });
    }

    // !farm
    if (content === '!farm') {
      const embed = new EmbedBuilder()
        .setTitle(this.config.farmTitle || 'Sistema de Farm')
        .setDescription(this.config.farmMessage || 'Clique para abrir um canal de farm.')
        .setColor(this.color())
        .setFooter({ text: this.config.farmFooter || 'Sistema de Farm' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('facs_open_farm')
          .setLabel('Abrir Farm')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🌾')
      );

      await message.channel.send({ embeds: [embed], components: [row] });
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
        await message.reply(
          '**!configbot role @cargo** — cargo autorizado\n' +
          '**!configbot logs #canal** — canal de logs\n' +
          'Use **/config** para o painel completo.'
        );
      }
    }
  }

  async handleInteraction(interaction) {
    // /config slash
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      if (!this.hasPermission(interaction.member)) {
        return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Configuração — Bot de FACs')
        .setDescription(
          `**Servidor:** ${this.config.serverName || interaction.guild.name}\n` +
          `**Cor Sidebar:** ${this.color()}\n` +
          `**Cargos hierarquia:** ${(this.config.hierarchy || []).length}\n` +
          `**Categoria Farm:** ${this.config.farmCategoryId ? `<#${this.config.farmCategoryId}>` : 'Não configurada'}\n` +
          `**Canal Logs:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : 'Não configurado'}\n\n` +
          'Use os botões abaixo para configurar.'
        )
        .setColor(this.color());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('facs_cfg_name').setLabel('Nome do Servidor').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('facs_cfg_hierarchy').setLabel('Hierarquia').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('facs_cfg_color').setLabel('Cor Sidebar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('facs_cfg_farm').setLabel('Categoria Farm').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Config modals
    if (interaction.isButton()) {
      if (interaction.customId === 'facs_cfg_name') {
        const modal = new ModalBuilder().setCustomId('facs_modal_name').setTitle('Nome do Servidor');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('server_name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)
            .setValue(this.config.serverName || '')
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'facs_cfg_color') {
        const modal = new ModalBuilder().setCustomId('facs_modal_color').setTitle('Cor da Sidebar');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('color').setLabel('Cor Hex (ex: #FF0000)').setStyle(TextInputStyle.Short).setRequired(true)
            .setValue(this.color())
        ));
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'facs_cfg_hierarchy') {
        const modal = new ModalBuilder().setCustomId('facs_modal_hierarchy').setTitle('Adicionar Cargo à Hierarquia');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('ID do Cargo').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('rank_name').setLabel('Nome do Rank').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false)
          )
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'facs_cfg_farm') {
        const modal = new ModalBuilder().setCustomId('facs_modal_farm_cat').setTitle('Categoria de Farm');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('category_id').setLabel('ID da Categoria').setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return interaction.showModal(modal);
      }

      // Register button
      if (interaction.customId === 'facs_register') {
        const modal = new ModalBuilder().setCustomId('facs_register_modal').setTitle('Registro');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('player_name').setLabel('Nome').setStyle(TextInputStyle.Short)
              .setRequired(true).setMinLength(5)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('player_id').setLabel('ID').setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        return interaction.showModal(modal);
      }

      // Farm button
      if (interaction.customId === 'facs_open_farm') {
        if (this.activeFarms.has(interaction.user.id)) {
          return interaction.reply({ content: '❌ Você já possui um canal de farm aberto.', ephemeral: true });
        }

        if (!this.config.farmCategoryId) {
          return interaction.reply({ content: '❌ Categoria de farm não configurada.', ephemeral: true });
        }

        const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const channelName = `${safeName}-farm-${interaction.user.id.slice(-4)}`;

        try {
          const channel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: this.config.farmCategoryId,
            permissionOverwrites: [
              { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
              ...(this.config.authorizedRoleId ? [{
                id: this.config.authorizedRoleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
              }] : [])
            ]
          });

          this.activeFarms.set(interaction.user.id, channel.id);

          const farmEmbed = new EmbedBuilder()
            .setTitle(this.config.farmTitle || 'Farm')
            .setDescription(this.config.farmMessage || `Farm de ${interaction.user}`)
            .setColor(this.color())
            .setFooter({ text: this.config.farmFooter || 'Sistema de Farm' });

          const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`facs_close_farm_${interaction.user.id}`)
              .setLabel('Encerrar Farm')
              .setStyle(ButtonStyle.Danger)
          );

          await channel.send({ content: `${interaction.user}`, embeds: [farmEmbed], components: [closeRow] });
          await interaction.reply({ content: `✅ Canal criado: ${channel}`, ephemeral: true });
          
          this.log('info', `Farm opened by ${interaction.user.tag}`);
          this._sendLog(interaction.guild, `🌾 Farm aberto por ${interaction.user} → ${channel}`);
        } catch (err) {
          await interaction.reply({ content: `❌ Erro: ${err.message}`, ephemeral: true });
        }
      }

      // Close farm
      if (interaction.customId.startsWith('facs_close_farm_')) {
        const userId = interaction.customId.replace('facs_close_farm_', '');
        if (interaction.user.id !== userId && !this.hasPermission(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }

        this.activeFarms.delete(userId);
        await interaction.reply({ content: '🔒 Farm encerrado. Canal será excluído em 5s...' });
        this._sendLog(interaction.guild, `🔒 Farm fechado por ${interaction.user}`);
        
        setTimeout(async () => {
          try { await interaction.channel.delete(); } catch (e) {}
        }, 5000);
      }

      // Approve / Reject register
      if (interaction.customId.startsWith('facs_approve_') || interaction.customId.startsWith('facs_reject_')) {
        if (!this.hasPermission(interaction.member)) {
          return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }

        const isApprove = interaction.customId.startsWith('facs_approve_');
        const userId = interaction.customId.replace(isApprove ? 'facs_approve_' : 'facs_reject_', '');
        
        try {
          const user = await this.client.users.fetch(userId);
          const serverName = this.config.serverName || interaction.guild.name;

          if (isApprove) {
            await user.send(
              `✅ Seu registro foi aprovado por **${interaction.user.username}**.\n` +
              `Seja bem-vindo ao **${serverName}**!`
            ).catch(() => {});
            await interaction.update({
              content: `🟢 Registro de <@${userId}> **aprovado** por ${interaction.user}`,
              embeds: interaction.message.embeds,
              components: []
            });
            this._sendLog(interaction.guild, `🟢 Registro aprovado: <@${userId}> por ${interaction.user}`);
          } else {
            await user.send(
              `🔴 Seu registro foi recusado por **${interaction.user.username}**.\n` +
              `Tente novamente ou peça para um responsável te aprovar!`
            ).catch(() => {});
            await interaction.update({
              content: `🔴 Registro de <@${userId}> **recusado** por ${interaction.user}`,
              embeds: interaction.message.embeds,
              components: []
            });
            this._sendLog(interaction.guild, `🔴 Registro recusado: <@${userId}> por ${interaction.user}`);
          }
        } catch (err) {
          await interaction.reply({ content: `Erro: ${err.message}`, ephemeral: true });
        }
      }
    }

    // Modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'facs_modal_name') {
        this.config.serverName = interaction.fields.getTextInputValue('server_name');
        await interaction.reply({ content: `✅ Nome do servidor: **${this.config.serverName}**`, ephemeral: true });
      }
      if (interaction.customId === 'facs_modal_color') {
        this.config.sidebarColor = interaction.fields.getTextInputValue('color');
        await interaction.reply({ content: `✅ Cor: ${this.config.sidebarColor}`, ephemeral: true });
      }
      if (interaction.customId === 'facs_modal_hierarchy') {
        if (!this.config.hierarchy) this.config.hierarchy = [];
        this.config.hierarchy.push({
          roleId: interaction.fields.getTextInputValue('role_id'),
          name: interaction.fields.getTextInputValue('rank_name'),
          description: interaction.fields.getTextInputValue('description') || ''
        });
        await interaction.reply({ content: '✅ Cargo adicionado à hierarquia!', ephemeral: true });
      }
      if (interaction.customId === 'facs_modal_farm_cat') {
        this.config.farmCategoryId = interaction.fields.getTextInputValue('category_id');
        await interaction.reply({ content: '✅ Categoria de farm configurada!', ephemeral: true });
      }

      // Register submit
      if (interaction.customId === 'facs_register_modal') {
        const playerName = interaction.fields.getTextInputValue('player_name');
        const playerId = interaction.fields.getTextInputValue('player_id');

        const embed = new EmbedBuilder()
          .setTitle('📋 Novo Registro')
          .setDescription(
            `**Jogador:** ${interaction.user}\n` +
            `**Nome:** ${playerName}\n` +
            `**ID:** ${playerId}`
          )
          .setColor(this.color())
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`facs_approve_${interaction.user.id}`)
            .setLabel('Aprovar')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🟢'),
          new ButtonBuilder()
            .setCustomId(`facs_reject_${interaction.user.id}`)
            .setLabel('Recusar')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔴')
        );

        const targetChannel = this.config.logChannelId
          ? interaction.guild.channels.cache.get(this.config.logChannelId)
          : interaction.channel;

        if (targetChannel) {
          await targetChannel.send({ embeds: [embed], components: [row] });
        }

        await interaction.reply({ content: '✅ Registro enviado para aprovação!', ephemeral: true });
        this.log('info', `Register submitted by ${interaction.user.tag}: ${playerName}`);
      }
    }
  }

  _sendLog(guild, message) {
    if (!this.config.logChannelId) return;
    const ch = guild.channels.cache.get(this.config.logChannelId);
    if (ch) ch.send(message).catch(() => {});
  }
}

module.exports = FacsBot;
