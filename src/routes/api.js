const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../database');
const { generateVietQRUrl, cleanInviteCode } = require('../services/vietqr');
const { notifyNewOrder } = require('../services/telegram');

/**
 * Sinh mã đơn hàng ngẫu nhiên dạng CSLK-XXXXXX
 */
function generateOrderCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // loại bỏ ký tự dễ nhầm 0, O, 1, I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CSLK-${code}`;
}

/**
 * GET /api/public/config
 * Lấy cấu hình công khai và danh sách gói dịch vụ đang bán
 */
router.get('/public/config', async (req, res) => {
  try {
    const packages = await db.all(
      `SELECT id, name, price, description, badge, sort_order 
       FROM packages 
       WHERE is_active = 1 
       ORDER BY sort_order ASC, id ASC`
    );

    const settingsRows = await db.all(
      `SELECT key, value FROM settings WHERE key IN (
        'bank_id', 'bank_account_no', 'bank_account_name', 
        'vietqr_template', 'site_notice'
      )`
    );

    const settings = {};
    for (const row of settingsRows) {
      settings[row.key] = row.value;
    }

    res.json({
      success: true,
      data: {
        packages,
        bank: {
          bank_id: settings.bank_id || 'MB',
          bank_account_no: settings.bank_account_no || '',
          bank_account_name: settings.bank_account_name || '',
          vietqr_template: settings.vietqr_template || 'compact2'
        },
        site_notice: settings.site_notice || ''
      }
    });
  } catch (err) {
    console.error('Lỗi GET /api/public/config:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
  }
});

/**
 * POST /api/orders/create
 * Tạo đơn hàng mới
 */
router.post('/orders/create', async (req, res) => {
  try {
    const { invite_code, package_id, contact_info } = req.body;

    // Validate invite_code
    const cleanedCode = cleanInviteCode(invite_code);
    if (!cleanedCode || cleanedCode.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Mã chung sức không hợp lệ. Vui lòng kiểm tra lại!'
      });
    }

    // Validate package
    const pkg = await db.get(
      `SELECT * FROM packages WHERE id = ? AND is_active = 1`,
      [package_id]
    );
    if (!pkg) {
      return res.status(400).json({
        success: false,
        message: 'Gói dịch vụ không tồn tại hoặc đã tạm dừng!'
      });
    }

    // Sinh mã đơn không trùng lặp
    let orderCode = generateOrderCode();
    let existing = await db.get(`SELECT id FROM orders WHERE order_code = ?`, [orderCode]);
    while (existing) {
      orderCode = generateOrderCode();
      existing = await db.get(`SELECT id FROM orders WHERE order_code = ?`, [orderCode]);
    }

    // Lưu vào database
    const result = await db.run(
      `INSERT INTO orders (
        order_code, invite_code, package_id, package_name, 
        amount, status, contact_info
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        orderCode,
        cleanedCode,
        pkg.id,
        pkg.name,
        pkg.price,
        (contact_info || '').trim()
      ]
    );

    // Lấy thông tin ngân hàng để sinh mã VietQR
    const settingsRows = await db.all(
      `SELECT key, value FROM settings WHERE key IN (
        'bank_id', 'bank_account_no', 'bank_account_name', 'vietqr_template'
      )`
    );
    const settings = {};
    for (const row of settingsRows) {
      settings[row.key] = row.value;
    }

    const qrUrl = generateVietQRUrl({
      bankId: settings.bank_id || 'MB',
      accountNo: settings.bank_account_no || '',
      template: settings.vietqr_template || 'compact2',
      amount: pkg.price,
      orderCode: orderCode,
      accountName: settings.bank_account_name || ''
    });

    const newOrder = {
      id: result.lastID,
      order_code: orderCode,
      invite_code: cleanedCode,
      package_name: pkg.name,
      amount: pkg.price,
      status: 'pending',
      contact_info: (contact_info || '').trim(),
      qr_url: qrUrl,
      bank: {
        bank_id: settings.bank_id || 'MB',
        account_no: settings.bank_account_no || '',
        account_name: settings.bank_account_name || '',
        transfer_content: orderCode
      },
      expires_in_minutes: 15
    };

    // Bắn thông báo Telegram bất đồng bộ (không chặn response)
    notifyNewOrder(newOrder).catch((err) =>
      console.error('Lỗi bắn Telegram đơn mới:', err.message)
    );

    res.json({
      success: true,
      message: 'Tạo đơn hàng thành công!',
      order: newOrder
    });
  } catch (err) {
    console.error('Lỗi POST /api/orders/create:', err);
    res.status(500).json({ success: false, message: 'Lỗi tạo đơn hàng!' });
  }
});

/**
 * GET /api/orders/status/:order_code
 * Tra cứu trạng thái đơn hàng
 */
router.get('/orders/status/:order_code', async (req, res) => {
  try {
    const orderCode = (req.params.order_code || '').trim().toUpperCase();
    if (!orderCode) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã đơn hàng!' });
    }

    const order = await db.get(
      `SELECT id, order_code, invite_code, package_name, amount, status, contact_info, admin_note, created_at, updated_at
       FROM orders 
       WHERE order_code = ?`,
      [orderCode]
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy đơn hàng với mã "${orderCode}"`
      });
    }

    // Lấy thông tin thanh toán nếu đơn còn đang pending
    let bankInfo = null;
    let qrUrl = null;
    if (order.status === 'pending') {
      const settingsRows = await db.all(
        `SELECT key, value FROM settings WHERE key IN (
          'bank_id', 'bank_account_no', 'bank_account_name', 'vietqr_template'
        )`
      );
      const settings = {};
      for (const row of settingsRows) {
        settings[row.key] = row.value;
      }

      qrUrl = generateVietQRUrl({
        bankId: settings.bank_id || 'MB',
        accountNo: settings.bank_account_no || '',
        template: settings.vietqr_template || 'compact2',
        amount: order.amount,
        orderCode: order.order_code,
        accountName: settings.bank_account_name || ''
      });

      bankInfo = {
        bank_id: settings.bank_id || 'MB',
        account_no: settings.bank_account_no || '',
        account_name: settings.bank_account_name || '',
        transfer_content: order.order_code
      };
    }

    res.json({
      success: true,
      order: {
        ...order,
        qr_url: qrUrl,
        bank: bankInfo
      }
    });
  } catch (err) {
    console.error('Lỗi GET /api/orders/status:', err);
    res.status(500).json({ success: false, message: 'Lỗi tra cứu đơn hàng' });
  }
});

module.exports = router;
