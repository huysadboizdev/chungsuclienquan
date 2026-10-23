const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'database.sqlite');

let hasNodeSqlite = false;
try {
  const sqlite = require('node:sqlite');
  if (sqlite && sqlite.DatabaseSync) {
    hasNodeSqlite = true;
  }
} catch (e) {
  hasNodeSqlite = false;
}

let db = null;

if (hasNodeSqlite) {
  const { DatabaseSync } = require('node:sqlite');
  const syncDb = new DatabaseSync(dbPath);

  db = {
    raw: syncDb,
    async get(sql, params = []) {
      const stmt = syncDb.prepare(sql);
      const row = Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
      return row ? { ...row } : undefined;
    },
    async all(sql, params = []) {
      const stmt = syncDb.prepare(sql);
      const rows = Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
      return rows.map((r) => ({ ...r }));
    },
    async run(sql, params = []) {
      const stmt = syncDb.prepare(sql);
      const info = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
      return {
        lastID: Number(info.lastInsertRowid),
        changes: info.changes
      };
    },
    async exec(sql) {
      syncDb.exec(sql);
    }
  };
} else {
  const sqlite3 = require('sqlite3').verbose();
  const rawDb = new sqlite3.Database(dbPath);

  db = {
    raw: rawDb,
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        rawDb.get(sql, params, (err, row) => {
          if (err) return reject(err);
          resolve(row ? { ...row } : undefined);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        rawDb.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve((rows || []).map((r) => ({ ...r })));
        });
      });
    },
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        rawDb.run(sql, params, function (err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    exec(sql) {
      return new Promise((resolve, reject) => {
        rawDb.exec(sql, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  };
}

// Khởi tạo bảng cơ sở dữ liệu (KHÔNG tạo dữ liệu giả/mock)
async function initDatabase() {
  await db.exec(`PRAGMA journal_mode = WAL;`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT,
      badge TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE NOT NULL,
      payment_code TEXT UNIQUE,
      invite_code TEXT NOT NULL,
      package_id INTEGER NOT NULL,
      package_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      contact_info TEXT,
      payment_ref TEXT,
      admin_note TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Add payment_code to existing installations without disturbing existing orders.
  const orderColumns = await db.all(`PRAGMA table_info(orders)`);
  if (!orderColumns.some((column) => column.name === 'payment_code')) {
    await db.exec(`ALTER TABLE orders ADD COLUMN payment_code TEXT`);
  }
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_code ON orders(payment_code)`);
  await db.run(`DELETE FROM settings WHERE key = 'webhook_api_key'`);

  // Cấu hình ban đầu sạch (Không mock tên người hay STK giả)
  const defaultSettings = {
    admin_password: process.env.ADMIN_PASSWORD || 'admin123456',
    app_url: process.env.APP_URL || '',
    bank_id: process.env.BANK_ID || '',
    bank_account_no: process.env.BANK_ACCOUNT_NO || '',
    bank_account_name: process.env.BANK_ACCOUNT_NAME || '',
    vietqr_template: 'compact2',
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
    telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
    telegram_notify_enabled: '1',
    site_notice: 'Hệ thống Chung Sức Liên Quân Huy Dev hỗ trợ buff sự kiện tự động 24/7. Vui lòng chuyển khoản đúng cú pháp mã đơn hàng!'
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = await db.get(`SELECT key FROM settings WHERE key = ?`, [key]);
    if (!existing) {
      await db.run(`INSERT INTO settings (key, value) VALUES (?, ?)`, [key, value]);
    }
  }

  return db;
}

module.exports = {
  db,
  initDatabase
};
