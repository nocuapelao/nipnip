const express = require('express');
const os = require('os');
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');
const KeepAliveService = require('../services/KeepAliveService');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    
    const total = db.prepare('SELECT COUNT(*) as c FROM bots WHERE user_id = ?').get(req.user.id).c;
    const online = db.prepare("SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND status = 'online'").get(req.user.id).c;
    const offline = db.prepare("SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND status = 'offline'").get(req.user.id).c;
    const error = db.prepare("SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND status = 'error'").get(req.user.id).c;
    const restarting = db.prepare("SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND status = 'restarting'").get(req.user.id).c;

    const byType = {};
    for (const type of ['webhook', 'facs', 'tickets', 'discord']) {
      byType[type] = db.prepare('SELECT COUNT(*) as c FROM bots WHERE user_id = ? AND type = ?')
        .get(req.user.id, type).c;
    }

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    res.json({
      bots: {
        total,
        online,
        offline,
        error,
        restarting,
        byType
      },
      system: {
        uptime: process.uptime(),
        platformUptime: os.uptime(),
        cpu: os.loadavg(),
        memory: {
          process: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
          },
          system: {
            total: Math.round(totalMem / 1024 / 1024),
            free: Math.round(freeMem / 1024 / 1024),
            used: Math.round((totalMem - freeMem) / 1024 / 1024)
          }
        },
        keepAlive: KeepAliveService.getGlobalStatus()
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

module.exports = router;
