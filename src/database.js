const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'database.sqlite');

let dbDriver = null;

// Kiểm tra xem Node.js hiện tại có hỗ trợ node:sqlite chuẩn không (Node 22+)
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
  // Fallback sang sqlite3 cho Node 18/20
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

// Khởi tạo bảng và dữ liệu mẫu
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

  // Seed default packages if empty
  const packageCount = await db.get(`SELECT COUNT(*) as count FROM packages`);
  if (!packageCount || packageCount.count === 0) {
    const defaultPackages = [
      {
        name: 'Gói Cơ Bản (5 Lượt)',
        price: 10000,
        description: 'Hỗ trợ 5 lượt bấm mã chung sức sự kiện',
        badge: 'Cơ bản',
        sort_order: 1
      },
      {
        name: 'Gói Tiết Kiệm (15 Lượt)',
        price: 25000,
        description: 'Hỗ trợ 15 lượt bấm mã + Tốc độ xử lý ưu tiên',
        badge: 'Phổ biến',
        sort_order: 2
      },
      {
        name: 'Gói Siêu Tốc (Full Rương Quà)',
        price: 50000,
        description: 'Hỗ trợ max điểm sự kiện, cam kết hoàn thành 100%',
        badge: 'Khuyên dùng',
        sort_order: 3
      }
    ];

    for (const pkg of defaultPackages) {
      await db.run(
        `INSERT INTO packages (name, price, description, badge, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        [pkg.name, pkg.price, pkg.description, pkg.badge, pkg.sort_order]
      );
    }
  }

  // Seed default settings if not exists
  const defaultSettings = {
    admin_password: process.env.ADMIN_PASSWORD || 'admin123456',
    bank_id: process.env.BANK_ID || 'MB',
    bank_account_no: process.env.BANK_ACCOUNT_NO || '0987654321',
    bank_account_name: process.env.BANK_ACCOUNT_NAME || 'NGUYEN VAN A',
    vietqr_template: 'compact2',
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
    telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '',
    telegram_notify_enabled: '1',
    webhook_api_key: process.env.WEBHOOK_API_KEY || 'sepay_webhook_secret_key',
    site_notice: 'Hệ thống hỗ trợ buff chung sức Liên Quân Mobile tự động 24/7. Vui lòng chuyển khoản đúng cú pháp mã đơn hàng để được kích hoạt ngay!'
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
