const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../database');
const {
  sendTelegramMessage,
  notifyCompletedOrder,
  notifyCancelledOrder,
  setTelegramWebhook
} = require('../services/telegram');

const SECRET_SALT = process.env.ADMIN_SECRET_KEY || 'cslk_super_secret_jwt_key_2026';

/**
 * Sinh token bảo mật cho Admin session
 */
function createAuthToken(password) {
  const dateStr = new Date().toISOString().slice(0, 10); // Hạn token theo ngày
  return crypto
    .createHmac('sha256', SECRET_SALT)
    .update(`${password}_${dateStr}`)
    .digest('hex');
}

/**
 * Middleware bảo vệ các API quản trị
 */
async function requireAdminAuth(req, res, next) {
  try {
    const passwordRow = await db.get(`SELECT value FROM settings WHERE key = 'admin_password'`);
    const currentPass = passwordRow?.value || 'admin123456';
    const expectedToken = createAuthToken(currentPass);

    const tokenFromCookie = req.cookies?.admin_token;
    const tokenFromHeader = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const clientToken = tokenFromCookie || tokenFromHeader;

    if (!clientToken || clientToken !== expectedToken) {
      return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập Admin' });
    }

    next();
  } catch (err) {
    console.error('Lỗi auth admin:', err);
    res.status(500).json({ success: false, message: 'Lỗi xác thực hệ thống' });
  }
}

/**
 * POST /api/admin/login
 * Đăng nhập Admin
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const passwordRow = await db.get(`SELECT value FROM settings WHERE key = 'admin_password'`);
    const currentPass = passwordRow?.value || 'admin123456';

    if (!password || password !== currentPass) {
      return res.status(401).json({ success: false, message: 'Mật khẩu quản trị không chính xác!' });
    }

    const token = createAuthToken(currentPass);
    res.cookie('admin_token', token, {
      httpOnly: false, // Để client JS có thể đọc nếu cần
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
      sameSite: 'lax',
      path: '/'
    });

    res.json({ success: true, message: 'Đăng nhập thành công!', token });
  } catch (err) {
    console.error('Lỗi login admin:', err);
    res.status(500).json({ success: false, message: 'Lỗi đăng nhập' });
  }
});

/**
 * POST /api/admin/logout
 * Đăng xuất Admin
 */
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token', { path: '/' });
  res.json({ success: true, message: 'Đã đăng xuất' });
});

/**
 * GET /api/admin/check-auth
 * Kiểm tra phiên đăng nhập
 */
router.get('/check-auth', requireAdminAuth, (req, res) => {
  res.json({ success: true, authenticated: true });
});

/**
 * GET /api/admin/dashboard
 * Thống kê tổng quan
 */
router.get('/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const totalRevRow = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status != 'cancelled'`
    );
    const todayRevRow = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total FROM orders 
       WHERE status != 'cancelled' AND date(created_at) = date('now', 'localtime')`
    );

    const totalOrdersRow = await db.get(`SELECT COUNT(*) as count FROM orders`);
    const pendingOrdersRow = await db.get(`SELECT COUNT(*) as count FROM orders WHERE status = 'pending'`);
    const processingOrdersRow = await db.get(`SELECT COUNT(*) as count FROM orders WHERE status = 'processing'`);
    const completedOrdersRow = await db.get(`SELECT COUNT(*) as count FROM orders WHERE status = 'completed'`);

    res.json({
      success: true,
      stats: {
        revenue_total: totalRevRow.total,
        revenue_today: todayRevRow.total,
        orders_total: totalOrdersRow.count,
        orders_pending: pendingOrdersRow.count,
        orders_processing: processingOrdersRow.count,
        orders_completed: completedOrdersRow.count
      }
    });
  } catch (err) {
    console.error('Lỗi GET /api/admin/dashboard:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy thống kê' });
  }
});

/**
 * GET /api/admin/orders
 * Lấy danh sách đơn hàng có phân trang & tìm kiếm
 */
router.get('/orders', requireAdminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [];
    const params = [];

    if (status && status !== 'all') {
      whereClauses.push(`status = ?`);
      params.push(status);
    }

    if (search && search.trim()) {
      whereClauses.push(`(order_code LIKE ? OR invite_code LIKE ? OR contact_info LIKE ?)`);
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await db.get(`SELECT COUNT(*) as total FROM orders ${whereSql}`, params);
    const total = countRow.total;

    const orders = await db.all(
      `SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Lỗi GET /api/admin/orders:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách đơn hàng' });
  }
});

/**
 * PATCH /api/admin/orders/:id/status
 * Đổi trạng thái đơn hàng
 */
router.patch('/orders/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, admin_note } = req.body;

    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const order = await db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const note = admin_note !== undefined ? admin_note : order.admin_note;

    await db.run(
      `UPDATE orders 
       SET status = ?, admin_note = ?, updated_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [status, note, orderId]
    );

    const updatedOrder = { ...order, status, admin_note: note };

    // Bắn thông báo Telegram khi hoàn thành hoặc hủy
    if (status === 'completed' && order.status !== 'completed') {
      notifyCompletedOrder(updatedOrder).catch((err) =>
        console.error('Lỗi Telegram notifyCompletedOrder:', err.message)
      );
    } else if (status === 'cancelled' && order.status !== 'cancelled') {
      notifyCancelledOrder(updatedOrder, note).catch((err) =>
        console.error('Lỗi Telegram notifyCancelledOrder:', err.message)
      );
    }

    res.json({ success: true, message: 'Cập nhật trạng thái thành công!', order: updatedOrder });
  } catch (err) {
    console.error('Lỗi PATCH /api/admin/orders/status:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái' });
  }
});

/**
 * DELETE /api/admin/orders/:id
 * Xóa đơn hàng
 */
router.delete('/orders/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.run(`DELETE FROM orders WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa đơn hàng' });
  } catch (err) {
    console.error('Lỗi DELETE /api/admin/orders:', err);
    res.status(500).json({ success: false, message: 'Lỗi xóa đơn hàng' });
  }
});

/**
 * GET /api/admin/packages
 * Danh sách toàn bộ gói
 */
router.get('/packages', requireAdminAuth, async (req, res) => {
  try {
    const packages = await db.all(`SELECT * FROM packages ORDER BY sort_order ASC, id ASC`);
    res.json({ success: true, packages });
  } catch (err) {
    console.error('Lỗi GET /api/admin/packages:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách gói' });
  }
});

/**
 * POST /api/admin/packages
 * Thêm gói mới
 */
router.post('/packages', requireAdminAuth, async (req, res) => {
  try {
    const { name, price, description, badge, sort_order, is_active } = req.body;
    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên và giá gói!' });
    }

    const result = await db.run(
      `INSERT INTO packages (name, price, description, badge, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        parseInt(price, 10),
        (description || '').trim(),
        (badge || '').trim(),
        parseInt(sort_order, 10) || 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]
    );

    res.json({
      success: true,
      message: 'Thêm gói dịch vụ thành công!',
      id: result.lastID
    });
  } catch (err) {
    console.error('Lỗi POST /api/admin/packages:', err);
    res.status(500).json({ success: false, message: 'Lỗi thêm gói' });
  }
});

/**
 * PUT /api/admin/packages/:id
 * Sửa gói
 */
router.put('/packages/:id', requireAdminAuth, async (req, res) => {
  try {
    const { name, price, description, badge, sort_order, is_active } = req.body;
    await db.run(
      `UPDATE packages 
       SET name = ?, price = ?, description = ?, badge = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        name.trim(),
        parseInt(price, 10),
        (description || '').trim(),
        (badge || '').trim(),
        parseInt(sort_order, 10) || 0,
        is_active ? 1 : 0,
        req.params.id
      ]
    );

    res.json({ success: true, message: 'Cập nhật gói thành công!' });
  } catch (err) {
    console.error('Lỗi PUT /api/admin/packages:', err);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật gói' });
  }
});

/**
 * DELETE /api/admin/packages/:id
 * Xóa gói
 */
router.delete('/packages/:id', requireAdminAuth, async (req, res) => {
  try {
    await db.run(`DELETE FROM packages WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa gói dịch vụ!' });
  } catch (err) {
    console.error('Lỗi DELETE /api/admin/packages:', err);
    res.status(500).json({ success: false, message: 'Lỗi xóa gói' });
  }
});

/**
 * GET /api/admin/settings
 * Lấy cấu hình hệ thống
 */
router.get('/settings', requireAdminAuth, async (req, res) => {
  try {
    const rows = await db.all(`SELECT key, value FROM settings`);
    const settings = {};
    for (const r of rows) {
      if (r.key === 'admin_password') {
        settings[r.key] = '******'; // Ẩn mật khẩu
      } else {
        settings[r.key] = r.value;
      }
    }
    // Xác định APP_URL: ưu tiên biến môi trường process.env.APP_URL (từ file .env), nếu không có thì lấy từ DB
    const effectiveAppUrl = (process.env.APP_URL || settings.app_url || '').trim().replace(/\/+$/, '');
    settings.app_url = effectiveAppUrl;
    settings.env_app_url = process.env.APP_URL || '';

    // Đường dẫn webhook linh hoạt từ biến môi trường hoặc tự động ghép theo APP_URL
    settings.payment_webhook_url =
      process.env.PAYMENT_WEBHOOK_URL ||
      (effectiveAppUrl ? `${effectiveAppUrl}/api/webhook/payment` : '');
    settings.telegram_webhook_url =
      process.env.TELEGRAM_WEBHOOK_URL ||
      (effectiveAppUrl ? `${effectiveAppUrl}/api/telegram/webhook` : '');

    res.json({ success: true, settings });
  } catch (err) {
    console.error('Lỗi GET /api/admin/settings:', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy cài đặt' });
  }
});

/**
 * POST /api/admin/settings
 * Cập nhật cấu hình hệ thống
 */
router.post('/settings', requireAdminAuth, async (req, res) => {
  try {
    const allowedKeys = [
      'app_url',
      'bank_id',
      'bank_account_no',
      'bank_account_name',
      'vietqr_template',
      'telegram_bot_token',
      'telegram_chat_id',
      'telegram_notify_enabled',
      'webhook_api_key',
      'site_notice'
    ];

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        await db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?) 
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, String(req.body[key]).trim()]
        );
      }
    }

    // Đổi mật khẩu nếu có truyền new_password
    if (req.body.new_password && req.body.new_password.trim().length >= 6) {
      await db.run(
        `INSERT INTO settings (key, value) VALUES ('admin_password', ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [req.body.new_password.trim()]
      );

      // Cập nhật lại cookie với token mới
      const newToken = createAuthToken(req.body.new_password.trim());
      res.cookie('admin_token', newToken, {
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
      });
    }

    res.json({ success: true, message: 'Lưu cài đặt thành công!' });
  } catch (err) {
    console.error('Lỗi POST /api/admin/settings:', err);
    res.status(500).json({ success: false, message: 'Lỗi lưu cài đặt' });
  }
});

/**
 * POST /api/admin/test-telegram
 * Gửi tin nhắn test Telegram
 */
router.post('/test-telegram', requireAdminAuth, async (req, res) => {
  try {
    const testMsg = `
🔔 <b>KIỂM TRA KẾT NỐI TELEGRAM BOT THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━
Hệ thống <b>Chung Sức Liên Quân</b> đã kết nối thành công với Telegram của bạn.
Thời gian: <code>${new Date().toLocaleString('vi-VN')}</code>
    `.trim();

    const result = await sendTelegramMessage(testMsg);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || result.reason || 'Không thể gửi tin nhắn Telegram'
      });
    }

    res.json({ success: true, message: 'Đã gửi tin nhắn test đến Telegram thành công!' });
  } catch (err) {
    console.error('Lỗi test-telegram:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/admin/set-telegram-webhook
 * Kích hoạt Webhook Telegram Bot để nhận sự kiện bấm nút
 */
router.post('/set-telegram-webhook', requireAdminAuth, async (req, res) => {
  try {
    const { webhook_url } = req.body;
    if (!webhook_url) {
      return res.status(400).json({ success: false, message: 'Thiếu đường dẫn webhook' });
    }

    const result = await setTelegramWebhook(webhook_url);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({ success: true, message: 'Kích hoạt Webhook Telegram thành công!' });
  } catch (err) {
    console.error('Lỗi set-telegram-webhook:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
