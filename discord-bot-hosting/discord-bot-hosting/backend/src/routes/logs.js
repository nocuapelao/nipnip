const express = require('express');
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/platform', (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    
    const logs = db.prepare(`
      SELECT id, action, details, ip, created_at
      FROM platform_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.user.id, limit);

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

module.exports = router;
