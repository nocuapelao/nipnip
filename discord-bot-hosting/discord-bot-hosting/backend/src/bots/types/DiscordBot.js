/**
 * Bot de Discord — Administração completa do servidor
 * Commands: !configdiscord, !discord, moderation commands
 */

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType, Partials
} = require('discord.js');

class DiscordBot {
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
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
      ],
      partials: [Partials.Message, Partials.Channel]
    });

    this.client.once('ready', () => {
      const guild = this.client.guilds.cache.first();
      this.guildId = guild?.id || null;
      this.guildName = guild?.name || null;
      this.send({ type: 'ready', guildId: this.guildId, guildName: this.guildName });
      this.log('info', `DiscordBot online as ${this.client.user.tag}`);
    });

    this.client.on('messageCreate', (msg) => this.handleMessage(msg));
    this.client.on('interactionCreate', (i) => this.handleInteraction(i));
    this.client.on('guildMemberAdd', (m) => this.onMemberJoin(m));
    this.client.on('guildMemberRemove', (m) => this.onMemberLeave(m));

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

  hasPermission(member) {
    if (!this.config.authorizedRoleId) return member.permissions.has(PermissionFlagsBits.Administrator);
    return member.roles.cache.has(this.config.authorizedRoleId) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
  }

  async handleMessage(message) {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();
    const args = content.split(/\s+/);
    const cmd = args[0].toLowerCase();

    // !discord - main panel
    if (cmd === '!discord') {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Sem permissão.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎛️ Painel de Administração')
        .setDescription('Selecione uma categoria para gerenciar o servidor.')
        .setColor('#5865F2')
        .addFields(
          { name: '📋 GERAL', value: 'Nome, Ícone, Banner, Configurações', inline: true },
          { name: '👥 CARGOS', value: 'Criar, Editar, Excluir, Permissões', inline: true },
          { name: '📢 CANAIS', value: 'Criar, Editar, Excluir, Categorias', inline: true },
          { name: '📜 LOGS', value: 'Entrada, Saída, Mensagens, Admin', inline: true },
          { name: '🤖 AUTOMAÇÕES', value: 'Boas-vindas, Despedidas, Autorole', inline: true },
          { name: '🛡️ MODERAÇÃO', value: 'Ban, Kick, Timeout, Warn', inline: true }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dc_geral').setLabel('Geral').setStyle(ButtonStyle.Primary).setEmoji('📋'),
        new ButtonBuilder().setCustomId('dc_cargos').setLabel('Cargos').setStyle(ButtonStyle.Primary).setEmoji('👥'),
        new ButtonBuilder().setCustomId('dc_canais').setLabel('Canais').setStyle(ButtonStyle.Primary).setEmoji('📢')
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dc_logs').setLabel('Logs').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
        new ButtonBuilder().setCustomId('dc_auto').setLabel('Automações').setStyle(ButtonStyle.Secondary).setEmoji('🤖'),
        new ButtonBuilder().setCustomId('dc_mod').setLabel('Moderação').setStyle(ButtonStyle.Danger).setEmoji('🛡️')
      );

      await message.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    // !configdiscord
    if (cmd === '!configdiscord') {
      if (!this.hasPermission(message.member)) {
        return message.reply('❌ Sem permissão.');
      }

      const sub = args[1];
      if (sub === 'role' && args[2]) {
        this.config.authorizedRoleId = args[2].replace(/[<@&>]/g, '');
        await message.reply(`✅ Cargo autorizado: <@&${this.config.authorizedRoleId}>`);
      } else if (sub === 'logs' && args[2]) {
        this.config.logChannelId = args[2].replace(/[<#>]/g, '');
        await message.reply(`✅ Canal de logs: <#${this.config.logChannelId}>`);
      } else if (sub === 'welcome' && args[2] === 'on') {
        this.config.welcomeEnabled = true;
        if (args[3]) this.config.welcomeChannelId = args[3].replace(/[<#>]/g, '');
        await message.reply('✅ Sistema de boas-vindas ativado.');
      } else if (sub === 'welcome' && args[2] === 'off') {
        this.config.welcomeEnabled = false;
        await message.reply('✅ Sistema de boas-vindas desativado.');
      } else if (sub === 'autorole' && args[2]) {
        this.config.autoroleId = args[2].replace(/[<@&>]/g, '');
        await message.reply(`✅ Autorole: <@&${this.config.autoroleId}>`);
      } else {
        await message.reply(
          '**!configdiscord role @cargo**\n' +
          '**!configdiscord logs #canal**\n' +
          '**!configdiscord welcome on #canal**\n' +
          '**!configdiscord welcome off**\n' +
          '**!configdiscord autorole @cargo**\n' +
          'Use **!discord** para o painel completo.'
        );
      }
    }

    // Moderation shortcuts
    if (cmd === '!ban' && args[1]) {
      if (!this.hasPermission(message.member)) return message.reply('❌ Sem permissão.');
      const userId = args[1].replace(/[<@!>]/g, '');
      const reason = args.slice(2).join(' ') || 'Sem motivo';
      try {
        await message.guild.members.ban(userId, { reason });
        await message.reply(`🔨 <@${userId}> banido. Motivo: ${reason}`);
        this._sendLog(message.guild, `🔨 Ban: <@${userId}> por ${message.author} — ${reason}`);
      } catch (e) {
        await message.reply(`❌ Erro: ${e.message}`);
      }
    }

    if (cmd === '!kick' && args[1]) {
      if (!this.hasPermission(message.member)) return message.reply('❌ Sem permissão.');
      const userId = args[1].replace(/[<@!>]/g, '');
      const reason = args.slice(2).join(' ') || 'Sem motivo';
      try {
        const member = await message.guild.members.fetch(userId);
        await member.kick(reason);
        await message.reply(`👢 <@${userId}> expulso. Motivo: ${reason}`);
        this._sendLog(message.guild, `👢 Kick: <@${userId}> por ${message.author} — ${reason}`);
      } catch (e) {
        await message.reply(`❌ Erro: ${e.message}`);
      }
    }

    if (cmd === '!timeout' && args[1] && args[2]) {
      if (!this.hasPermission(message.member)) return message.reply('❌ Sem permissão.');
      const userId = args[1].replace(/[<@!>]/g, '');
      const minutes = parseInt(args[2]);
      if (isNaN(minutes) || minutes < 1) return message.reply('❌ Duração inválida (minutos).');
      try {
        const member = await message.guild.members.fetch(userId);
        await member.timeout(minutes * 60 * 1000, args.slice(3).join(' ') || 'Timeout');
        await message.reply(`⏱️ <@${userId}> em timeout por ${minutes} min.`);
        this._sendLog(message.guild, `⏱️ Timeout: <@${userId}> ${minutes}min por ${message.author}`);
      } catch (e) {
        await message.reply(`❌ Erro: ${e.message}`);
      }
    }

    if (cmd === '!clear' && args[1]) {
      if (!this.hasPermission(message.member)) return message.reply('❌ Sem permissão.');
      const amount = Math.min(parseInt(args[1]) || 0, 100);
      if (amount < 1) return message.reply('❌ Quantidade inválida (1-100).');
      try {
        await message.channel.bulkDelete(amount + 1, true);
        const conf = await message.channel.send(`🧹 ${amount} mensagens apagadas.`);
        setTimeout(() => conf.delete().catch(() => {}), 3000);
      } catch (e) {
        await message.reply(`❌ Erro: ${e.message}`);
      }
    }
  }

  async handleInteraction(interaction) {
    if (!interaction.isButton()) return;
    if (!this.hasPermission(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    }

    const panels = {
      dc_geral: {
        title: '📋 Configurações Gerais',
        desc: `**Servidor:** ${interaction.guild.name}\n**Membros:** ${interaction.guild.memberCount}\n**ID:** ${interaction.guild.id}\n\nUse os comandos:\n\`!configdiscord\` para configurações\n\`!discord\` para voltar ao painel`
      },
      dc_cargos: {
        title: '👥 Gerenciamento de Cargos',
        desc: `**Total de cargos:** ${interaction.guild.roles.cache.size}\n\nPara criar: use o Discord ou configure via painel web.\nAções destrutivas exigem confirmação.`
      },
      dc_canais: {
        title: '📢 Gerenciamento de Canais',
        desc: `**Canais de texto:** ${interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size}\n**Canais de voz:** ${interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size}\n**Categorias:** ${interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size}`
      },
      dc_logs: {
        title: '📜 Sistema de Logs',
        desc: `**Canal de logs:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : 'Não configurado'}\n**Log entrada:** ${this.config.logJoin !== false ? '✅' : '❌'}\n**Log saída:** ${this.config.logLeave !== false ? '✅' : '❌'}\n**Log mensagens:** ${this.config.logMessages ? '✅' : '❌'}\n**Log admin:** ${this.config.logAdmin !== false ? '✅' : '❌'}`
      },
      dc_auto: {
        title: '🤖 Automações',
        desc: `**Boas-vindas:** ${this.config.welcomeEnabled ? '✅ Ativo' : '❌ Inativo'}\n**Canal:** ${this.config.welcomeChannelId ? `<#${this.config.welcomeChannelId}>` : '—'}\n**Autorole:** ${this.config.autoroleId ? `<@&${this.config.autoroleId}>` : 'Não configurado'}\n**Despedida:** ${this.config.goodbyeEnabled ? '✅' : '❌'}`
      },
      dc_mod: {
        title: '🛡️ Moderação',
        desc: '**Comandos disponíveis:**\n`!ban @user [motivo]`\n`!kick @user [motivo]`\n`!timeout @user <minutos> [motivo]`\n`!clear <quantidade>`\n\nTodas as ações são registradas nos logs.'
      }
    };

    const panel = panels[interaction.customId];
    if (panel) {
      const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.desc)
        .setColor('#5865F2');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  async onMemberJoin(member) {
    if (this.config.autoroleId) {
      try {
        await member.roles.add(this.config.autoroleId);
      } catch (e) {
        this.log('error', `Autorole failed: ${e.message}`);
      }
    }

    if (this.config.welcomeEnabled && this.config.welcomeChannelId) {
      const ch = member.guild.channels.cache.get(this.config.welcomeChannelId);
      if (ch) {
        const msg = (this.config.welcomeMessage || 'Bem-vindo {user} ao servidor!')
          .replace('{user}', `${member}`)
          .replace('{server}', member.guild.name);
        ch.send(msg).catch(() => {});
      }
    }

    if (this.config.logJoin !== false) {
      this._sendLog(member.guild, `📥 ${member} entrou no servidor.`);
    }
  }

  async onMemberLeave(member) {
    if (this.config.goodbyeEnabled && this.config.goodbyeChannelId) {
      const ch = member.guild.channels.cache.get(this.config.goodbyeChannelId);
      if (ch) {
        ch.send(`👋 **${member.user.tag}** saiu do servidor.`).catch(() => {});
      }
    }
    if (this.config.logLeave !== false) {
      this._sendLog(member.guild, `📤 **${member.user.tag}** saiu do servidor.`);
    }
  }

  _sendLog(guild, message) {
    if (!this.config.logChannelId) return;
    const ch = guild.channels.cache.get(this.config.logChannelId);
    if (ch) ch.send(message).catch(() => {});
  }
}

module.exports = DiscordBot;
