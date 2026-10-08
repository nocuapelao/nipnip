/**
 * Bot Process Runner
 * Runs in a forked child process. Loads the correct bot type module.
 */

const path = require('path');

const BOT_TYPE = process.env.BOT_TYPE;
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_ID = process.env.BOT_ID;
const BOT_NAME = process.env.BOT_NAME || 'Bot';

let config = {};
try {
  config = JSON.parse(process.env.BOT_CONFIG || '{}');
} catch (e) {
  config = {};
}

if (!BOT_TOKEN || !BOT_TYPE) {
  console.error('Missing BOT_TOKEN or BOT_TYPE');
  process.exit(1);
}

const botModules = {
  webhook: './types/WebhookBot',
  facs: './types/FacsBot',
  tickets: './types/TicketsBot',
  discord: './types/DiscordBot'
};

const modulePath = botModules[BOT_TYPE];
if (!modulePath) {
  console.error(`Unknown bot type: ${BOT_TYPE}`);
  process.exit(1);
}

let botInstance = null;

async function main() {
  try {
    const BotClass = require(modulePath);
    botInstance = new BotClass({
      token: BOT_TOKEN,
      config,
      botId: BOT_ID,
      name: BOT_NAME,
      sendMessage: (msg) => {
        if (process.send) process.send(msg);
      }
    });

    await botInstance.start();

    // Status reporter
    setInterval(() => {
      const mem = process.memoryUsage();
      if (process.send) {
        process.send({
          type: 'status',
          memory: Math.round(mem.rss / 1024 / 1024),
          cpu: 0,
          guildId: botInstance.guildId || null,
          guildName: botInstance.guildName || null
        });
      }
    }, 15000);

  } catch (err) {
    console.error('Bot start error:', err.message);
    if (process.send) {
      process.send({ type: 'error', message: err.message });
    }
    process.exit(1);
  }
}

// IPC handlers
process.on('message', async (msg) => {
  if (msg.type === 'shutdown') {
    if (botInstance) {
      try { await botInstance.stop(); } catch (e) {}
    }
    process.exit(0);
  }
  if (msg.type === 'reload_config' && botInstance) {
    try {
      const newConfig = typeof msg.config === 'string' ? JSON.parse(msg.config) : msg.config;
      botInstance.reloadConfig(newConfig);
    } catch (e) {}
  }
  if (msg.type === 'ping' && process.send) {
    process.send({ type: 'pong' });
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught:', err);
  if (process.send) process.send({ type: 'error', message: err.message });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  if (process.send) process.send({ type: 'error', message: String(err) });
});

main();
