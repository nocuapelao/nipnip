const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');
const KeepAliveService = require('../services/KeepAliveService');
const logger = require('../utils/logger');

const router = express.Router();
const MAX_BOTS = parseInt(process.env.MAX_BOTS_PER_CATEGORY) || 50;
const VALID_TYPES = ['webhook', 'facs', 'tickets', 'discord', 'vendas'];
const LIMITS = { webhook: 50, facs: 50, tickets: 50, discord: 50, vendas: 3 };

router.use(authenticate);

// List all bots for user
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { type, status, search } = req.query;
    
    let query = 'SELECT id, name, type, status, guild_id, guild_name, config, uptime_start, last_restart, last_error, restart_count, created_at, updated_at FROM bots WHERE user_id = ?';
    const params = [req.user.id];

    if (type && VALID_TYPES.includes(type)) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (name LIKE ? OR guild_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';
    const bots = db.prepare(query).all(...params);

    // Enrich with live process info
    const enriched = bots.map(bot => {
      const live = KeepAliveService.getBotStatus(bot.id);
      return {
        ...bot,
        config: JSON.parse(bot.config || '{}'),
        live: live || null,
        uptime: live?.uptime || null,
        memory: live?.memory || null,
        cpu: live?.cpu || null
      };
    });

    res.json({ bots: enriched });
  } catch (err) {
    logger.error('List bots error:', err);
    res.status(500).json({ error: 'Erro ao listar bots' });
  }
});

// Counts per category
router.get('/counts', (req, res) => {
  try {
    const db = getDb();
    const counts = {};
    for (const type of VALID_TYPES) {
      const row = db.prepare('SELECT COUNT(*) as count FROM bots WHERE user_id = ? AND type = ?')
        .get(req.user.id, type);
      const max = LIMITS[type] || MAX_BOTS;
      counts[type] = { current: row.count, max };
    }
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter contagens' });
  }
});

// Get single bot
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare(`
      SELECT id, name, type, status, guild_id, guild_name, config, uptime_start, last_restart, last_error, restart_count, created_at, updated_at
      FROM bots WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    const live = KeepAliveService.getBotStatus(bot.id);
    res.json({
      bot: {
        ...bot,
        config: JSON.parse(bot.config || '{}'),
        live,
        uptime: live?.uptime || null,
        memory: live?.memory || null,
        cpu: live?.cpu || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar bot' });
  }
});

// Create bot
router.post('/', async (req, res) => {
  try {
    const { name, type, token, config } = req.body;

    if (!name || !type || !token) {
      return res.status(400).json({ error: 'Nome, tipo e token são obrigatórios' });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de bot inválido' });
    }

    if (token.length < 50) {
      return res.status(400).json({ error: 'Token do Discord inválido' });
    }

    const db = getDb();
    
    // Check limit
    const count = db.prepare('SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND type = ?')
      .get(req.user.id, type);
    
    const typeLimit = LIMITS[type] || MAX_BOTS;
    if (count.c >= typeLimit) {
      return res.status(403).json({
        error: `Limite de ${typeLimit} bots do tipo "${type}" atingido`
      });
    }

    const id = uuidv4();
    const encryptedToken = encrypt(token);
    const defaultConfig = getDefaultConfig(type);
    const finalConfig = { ...defaultConfig, ...(config || {}) };

    db.prepare(`
      INSERT INTO bots (id, user_id, name, type, token_encrypted, status, config)
      VALUES (?, ?, ?, ?, ?, 'offline', ?)
    `).run(id, req.user.id, name.trim(), type, encryptedToken, JSON.stringify(finalConfig));

    db.prepare(`
      INSERT INTO platform_logs (user_id, action, details, ip)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'bot_create', JSON.stringify({ botId: id, type, name }), req.ip);

    logger.info(`Bot created: ${id} (${type}) by user ${req.user.id}`);

    res.status(201).json({
      bot: {
        id,
        name: name.trim(),
        type,
        status: 'offline',
        config: finalConfig
      }
    });
  } catch (err) {
    logger.error('Create bot error:', err);
    res.status(500).json({ error: 'Erro ao criar bot' });
  }
});

// Update bot config
router.patch('/:id', (req, res) => {
  try {
    const { name, config } = req.body;
    const db = getDb();
    
    const bot = db.prepare('SELECT id, config FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (config) {
      const current = JSON.parse(bot.config || '{}');
      const merged = { ...current, ...config };
      updates.push('config = ?');
      params.push(JSON.stringify(merged));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id, req.user.id);

    db.prepare(`UPDATE bots SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
      .run(...params);

    // If bot is online, signal config reload
    KeepAliveService.reloadConfig(req.params.id);

    res.json({ success: true });
  } catch (err) {
    logger.error('Update bot error:', err);
    res.status(500).json({ error: 'Erro ao atualizar bot' });
  }
});

// Update token
router.patch('/:id/token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token || token.length < 50) {
      return res.status(400).json({ error: 'Token inválido' });
    }

    const db = getDb();
    const bot = db.prepare('SELECT id, status FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    // Stop if running
    if (bot.status === 'online' || bot.status === 'restarting') {
      KeepAliveService.stopBot(req.params.id);
    }

    const encrypted = encrypt(token);
    db.prepare(`UPDATE bots SET token_encrypted = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(encrypted, req.params.id);

    res.json({ success: true, message: 'Token atualizado. Inicie o bot novamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar token' });
  }
});

// Start bot
router.post('/:id/start', async (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    if (bot.status === 'online') {
      return res.status(400).json({ error: 'Bot já está online' });
    }

    const result = await KeepAliveService.startBot(bot);
    res.json(result);
  } catch (err) {
    logger.error('Start bot error:', err);
    res.status(500).json({ error: err.message || 'Erro ao iniciar bot' });
  }
});

// Stop bot
router.post('/:id/stop', async (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    await KeepAliveService.stopBot(req.params.id);
    res.json({ success: true, status: 'offline' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao parar bot' });
  }
});

// Restart bot
router.post('/:id/restart', async (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    await KeepAliveService.restartBot(bot);
    res.json({ success: true, status: 'restarting' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reiniciar bot' });
  }
});

// Delete bot
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare('SELECT id, status FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    // Stop if running
    if (bot.status !== 'offline') {
      await KeepAliveService.stopBot(req.params.id);
    }

    db.prepare('DELETE FROM bots WHERE id = ?').run(req.params.id);
    
    db.prepare(`
      INSERT INTO platform_logs (user_id, action, details, ip)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, 'bot_delete', JSON.stringify({ botId: req.params.id }), req.ip);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir bot' });
  }
});

// Bot logs
router.get('/:id/logs', (req, res) => {
  try {
    const db = getDb();
    const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    
    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = db.prepare(`
      SELECT id, level, message, metadata, created_at
      FROM bot_logs WHERE bot_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.params.id, limit);

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

function getDefaultConfig(type) {
  const defaults = {
    webhook: {
      authorizedRoleId: null,
      logChannelId: null,
      defaultColor: '#5865F2'
    },
    facs: {
      serverName: '',
      hierarchy: [],
      sidebarColor: '#5865F2',
      farmCategoryId: null,
      logChannelId: null,
      authorizedRoleId: null,
      registerTitle: 'Registro',
      registerMessage: 'Clique no botão abaixo para se registrar.',
      registerFooter: 'Sistema de Registro',
      farmTitle: 'Sistema de Farm',
      farmMessage: 'Clique para abrir um canal de farm.',
      farmFooter: 'Sistema de Farm'
    },
    tickets: {
      title: 'Central de Tickets',
      message: 'Selecione uma categoria para abrir um ticket.',
      footer: 'Sistema de Tickets',
      banner: null,
      sidebarColor: '#5865F2',
      categories: [{ name: 'Suporte', id: 'support' }],
      ticketCategoryId: null,
      logChannelId: null,
      staffRoleId: null,
      authorizedRoleId: null
    },
    vendas: {
      title: 'Central de Vendas',
      message: 'Selecione uma categoria para abrir uma venda.',
      footer: 'Sistema de Vendas',
      banner: null,
      thumbnail: null,
      sidebarColor: '#3ba55d',
      categories: [{ name: 'Produto', id: 'produto', emoji: '🛒' }],
      ticketCategoryId: null,
      logChannelId: null,
      staffRoleId: null,
      authorizedRoleId: null
    },
    discord: {
      authorizedRoleId: null,
      logChannelId: null,
      welcomeEnabled: false,
      welcomeChannelId: null,
      welcomeMessage: 'Bem-vindo {user} ao servidor!',
      goodbyeEnabled: false,
      goodbyeChannelId: null,
      autoroleId: null,
      logJoin: true,
      logLeave: true,
      logMessages: false,
      logAdmin: true
    }
  };
  return defaults[type] || {};
}

module.exports = router;
