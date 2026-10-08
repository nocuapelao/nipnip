const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');
const logger = require('./logger');

async function setupDefaultAdmin() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (!existing) {
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@platform.com';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123456';
    const hash = await bcrypt.hash(password, 12);
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), email, hash, 'Administrator', 'admin');
    
    logger.info(`Default admin created: ${email}`);
    logger.warn('⚠️  Change the default password after first login!');
  }
}

module.exports = { setupDefaultAdmin };
