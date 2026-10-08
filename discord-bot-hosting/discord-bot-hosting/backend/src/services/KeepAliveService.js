/**
 * KeepAlive Service
 * Manages bot processes independently, auto-restarts on crash,
 * monitors status, prevents multiple instances.
 */

const { fork } = require('child_process');
const path = require('path');
const { getDb } = require('../utils/database');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const BOT_RUNNER = path.join(__dirname, '../bots/runner.js');
const CHECK_INTERVAL = parseInt(process.env.KEEPALIVE_CHECK_INTERVAL) || 30000;

class KeepAliveService {
  constructor() {
    this.processes = new Map(); // botId -> { process, startTime, restarts, lastError }
    this.interval = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.interval = setInterval(() => this.healthCheck(), CHECK_INTERVAL);
    logger.info('KeepAlive service started');
  }

  stopAll() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    
    for (const [botId] of this.processes) {
      this._killProcess(botId);
    }
    this.processes.clear();
    logger.info('KeepAlive: all processes stopped');
  }

  async restoreBots() {
    const db = getDb();
    // Only restore bots that were marked online (e.g. after server restart)
    // In production you may want a "should_run" flag instead
    const bots = db.prepare("SELECT * FROM bots WHERE status IN ('online', 'restarting')").all();
    
    for (const bot of bots) {
      try {
        logger.info(`Restoring bot ${bot.id} (${bot.name})`);
        await this.startBot(bot);
      } catch (err) {
        logger.error(`Failed to restore bot ${bot.id}:`, err.message);
        this._updateStatus(bot.id, 'error', err.message);
      }
    }
  }

  async startBot(bot) {
    if (this.processes.has(bot.id)) {
      throw new Error('Bot já possui um processo em execução');
    }

    this._updateStatus(bot.id, 'restarting');

    let token;
    try {
      token = decrypt(bot.token_encrypted);
    } catch (err) {
      this._updateStatus(bot.id, 'error', 'Falha ao descriptografar token');
      throw new Error('Token inválido ou corrompido');
    }

    return new Promise((resolve, reject) => {
      const child = fork(BOT_RUNNER, [], {
        env: {
          ...process.env,
          BOT_ID: bot.id,
          BOT_TYPE: bot.type,
          BOT_TOKEN: token,
          BOT_CONFIG: bot.config || '{}',
          BOT_NAME: bot.name
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        silent: false
      });

      const entry = {
        process: child,
        startTime: Date.now(),
        restarts: 0,
        lastError: null,
        memory: 0,
        cpu: 0,
        guildId: null,
        guildName: null,
        ready: false
      };

      this.processes.set(bot.id, entry);

      // Timeout for ready
      const readyTimeout = setTimeout(() => {
        if (!entry.ready) {
          this._killProcess(bot.id);
          this._updateStatus(bot.id, 'error', 'Timeout ao iniciar bot (token inválido?)');
          this._logBot(bot.id, 'error', 'Timeout ao iniciar - verifique o token');
          reject(new Error('Timeout ao iniciar bot. Verifique se o token é válido.'));
        }
      }, 30000);

      child.on('message', (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(readyTimeout);
          entry.ready = true;
          entry.guildId = msg.guildId || null;
          entry.guildName = msg.guildName || null;
          
          const db = getDb();
          db.prepare(`
            UPDATE bots SET status = 'online', uptime_start = datetime('now'),
            guild_id = ?, guild_name = ?, last_error = NULL, updated_at = datetime('now')
            WHERE id = ?
          `).run(msg.guildId || null, msg.guildName || null, bot.id);

          this._logBot(bot.id, 'info', `Bot online - ${msg.guildName || 'sem servidor'}`);
          resolve({ success: true, status: 'online', guildName: msg.guildName });
        }

        if (msg.type === 'status') {
          entry.memory = msg.memory || 0;
          entry.cpu = msg.cpu || 0;
          if (msg.guildId) entry.guildId = msg.guildId;
          if (msg.guildName) entry.guildName = msg.guildName;
        }

        if (msg.type === 'log') {
          this._logBot(bot.id, msg.level || 'info', msg.message, msg.metadata);
        }

        if (msg.type === 'error') {
          entry.lastError = msg.message;
          this._logBot(bot.id, 'error', msg.message);
        }
      });

      child.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this._logBot(bot.id, 'info', text);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) this._logBot(bot.id, 'error', text);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(readyTimeout);
        const wasReady = entry.ready;
        this.processes.delete(bot.id);

        if (code !== 0 && code !== null) {
          const reason = `Processo finalizado com código ${code}${signal ? ` (signal: ${signal})` : ''}`;
          this._logBot(bot.id, 'error', reason);
          
          // Auto-restart if was previously online
          if (wasReady && this.running) {
            logger.warn(`Auto-restarting bot ${bot.id} after crash`);
            this._updateStatus(bot.id, 'restarting', reason);
            
            setTimeout(async () => {
              try {
                const db = getDb();
                const freshBot = db.prepare('SELECT * FROM bots WHERE id = ?').get(bot.id);
                if (freshBot) {
                  db.prepare('UPDATE bots SET restart_count = restart_count + 1, last_restart = datetime(\'now\') WHERE id = ?')
                    .run(bot.id);
                  await this.startBot(freshBot);
                }
              } catch (err) {
                this._updateStatus(bot.id, 'error', err.message);
              }
            }, 3000);
          } else {
            this._updateStatus(bot.id, 'error', reason);
          }
        } else {
          this._updateStatus(bot.id, 'offline');
          this._logBot(bot.id, 'info', 'Bot parado');
        }
      });

      child.on('error', (err) => {
        clearTimeout(readyTimeout);
        this.processes.delete(bot.id);
        this._updateStatus(bot.id, 'error', err.message);
        this._logBot(bot.id, 'error', err.message);
        reject(err);
      });
    });
  }

  async stopBot(botId) {
    this._killProcess(botId);
    this._updateStatus(botId, 'offline');
    this._logBot(botId, 'info', 'Bot parado pelo usuário');
  }

  async restartBot(bot) {
    await this.stopBot(bot.id);
    
    // Wait a bit for clean shutdown
    await new Promise(r => setTimeout(r, 1500));
    
    const db = getDb();
    db.prepare(`
      UPDATE bots SET restart_count = restart_count + 1, last_restart = datetime('now')
      WHERE id = ?
    `).run(bot.id);

    // Re-fetch for fresh token/config
    const fresh = db.prepare('SELECT * FROM bots WHERE id = ?').get(bot.id);
    return this.startBot(fresh);
  }

  reloadConfig(botId) {
    const entry = this.processes.get(botId);
    if (entry?.process) {
      const db = getDb();
      const bot = db.prepare('SELECT config FROM bots WHERE id = ?').get(botId);
      if (bot) {
        entry.process.send({ type: 'reload_config', config: bot.config });
      }
    }
  }

  getBotStatus(botId) {
    const entry = this.processes.get(botId);
    if (!entry) return null;

    return {
      uptime: Math.floor((Date.now() - entry.startTime) / 1000),
      memory: entry.memory,
      cpu: entry.cpu,
      restarts: entry.restarts,
      lastError: entry.lastError,
      guildId: entry.guildId,
      guildName: entry.guildName
    };
  }

  getGlobalStatus() {
    return {
      activeProcesses: this.processes.size,
      running: this.running,
      checkInterval: CHECK_INTERVAL
    };
  }

  healthCheck() {
    for (const [botId, entry] of this.processes) {
      if (entry.process.killed || !entry.process.connected) {
        logger.warn(`Health check: dead process for bot ${botId}`);
        this.processes.delete(botId);
        this._updateStatus(botId, 'error', 'Processo morto detectado pelo health check');
      } else {
        // Request status update
        try {
          entry.process.send({ type: 'ping' });
        } catch (e) {
          // ignore
        }
      }
    }
  }

  _killProcess(botId) {
    const entry = this.processes.get(botId);
    if (entry?.process) {
      try {
        entry.process.send({ type: 'shutdown' });
        setTimeout(() => {
          if (!entry.process.killed) {
            entry.process.kill('SIGTERM');
          }
        }, 2000);
      } catch (e) {
        try { entry.process.kill('SIGKILL'); } catch (_) {}
      }
    }
    this.processes.delete(botId);
  }

  _updateStatus(botId, status, error = null) {
    try {
      const db = getDb();
      if (error) {
        db.prepare(`
          UPDATE bots SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?
        `).run(status, error, botId);
      } else {
        db.prepare(`
          UPDATE bots SET status = ?, updated_at = datetime('now') WHERE id = ?
        `).run(status, botId);
      }
    } catch (err) {
      logger.error('Failed to update bot status:', err);
    }
  }

  _logBot(botId, level, message, metadata = null) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO bot_logs (bot_id, level, message, metadata)
        VALUES (?, ?, ?, ?)
      `).run(botId, level, String(message).slice(0, 2000), metadata ? JSON.stringify(metadata) : null);
    } catch (err) {
      // avoid recursive logging issues
    }
  }
}

module.exports = new KeepAliveService();
