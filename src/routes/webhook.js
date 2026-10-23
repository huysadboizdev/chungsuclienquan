const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { extractOrderCode } = require('../services/vietqr');
const { notifyPaidOrder } = require('../services/telegram');

/**
 * Middleware xác thực Webhook API Key
 */
async function verifyWebhookAuth(req, res, next) {
  try {
    const keyRow = await db.get(`SELECT value FROM settings WHERE key = 'webhook_api_key'`);
    const expectedKey = keyRow?.value?.trim();

    // Nếu trong CSDL chưa đặt key thì cho phép (hoặc cảnh báo)
    if (!expectedKey) {
      return next();
    }

    // Kiểm tra header Authorization hoặc x-api-key hoặc query apiKey
    const authHeader = req.headers['authorization'] || '';
    const xApiKey = req.headers['x-api-key'] || '';
    const queryKey = req.query.apiKey || req.query.token || '';

    let receivedKey = '';
    if (authHeader.startsWith('Apikey ') || authHeader.startsWith('Bearer ')) {
      receivedKey = authHeader.split(' ')[1].trim();
    } else if (authHeader) {
      receivedKey = authHeader.trim();
    } else if (xApiKey) {
      receivedKey = xApiKey.trim();
    } else if (queryKey) {
      receivedKey = queryKey.trim();
    }

    if (receivedKey !== expectedKey) {
      console.warn('Webhook unauthorized access attempt:', req.ip);
      return res.status(401).json({ success: false, message: 'Unauthorized webhook key' });
    }

    next();
  } catch (err) {
    console.error('Lỗi verifyWebhookAuth:', err);
    res.status(500).json({ success: false, message: 'Server auth error' });
  }
}

/**
 * Xử lý 1 bản ghi giao dịch đơn lẻ
 */
async function processTransactionItem(item) {
  // Lấy nội dung giao dịch từ các biến thể phổ biến của SePay / Casso / MBBank
  const content = item.content || item.description || item.subAccount || item.remarks || '';
  const amount = Number(item.transferAmount || item.amount || item.amountIn || 0);
  const refCode = item.referenceCode || item.tid || item.id || 'WEBHOOK';

  const orderCode = extractOrderCode(content);
  if (!orderCode) {
    return { processed: false, reason: 'Không tìm thấy mã đơn trong nội dung: ' + content };
  }

  // Tra cứu đơn hàng trong CSDL
  const order = await db.get(`SELECT * FROM orders WHERE order_code = ?`, [orderCode]);
  if (!order) {
    return { processed: false, reason: `Đơn hàng ${orderCode} không tồn tại` };
  }

  if (order.status !== 'pending') {
    return { processed: false, reason: `Đơn hàng ${orderCode} đã ở trạng thái ${order.status}` };
  }

  // Kiểm tra số tiền (chấp nhận nếu chuyển đủ hoặc nhiều hơn)
  if (amount > 0 && amount < order.amount) {
    console.warn(`Đơn ${orderCode} chuyển thiếu tiền: Cần ${order.amount}, nhận ${amount}`);
    // Vẫn ghi chú lại
    await db.run(
      `UPDATE orders SET admin_note = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [`Chuyển thiếu tiền: Nhận ${amount}/${order.amount}đ. Ref: ${refCode}`, order.id]
    );
    return { processed: false, reason: `Chuyển thiếu tiền (${amount}/${order.amount})` };
  }

  // Cập nhật trạng thái sang 'processing' (Đang xử lý)
  await db.run(
    `UPDATE orders 
     SET status = 'processing', payment_ref = ?, updated_at = datetime('now', 'localtime') 
     WHERE id = ?`,
    [String(refCode), order.id]
  );

  // Bắn thông báo Telegram
  const updatedOrder = { ...order, status: 'processing', payment_ref: String(refCode) };
  notifyPaidOrder(updatedOrder).catch((err) =>
    console.error('Lỗi gửi Telegram khi webhook thanh toán thành công:', err.message)
  );

  return { processed: true, order_code: orderCode, amount: order.amount };
}

/**
 * POST /api/webhook/payment
 * Endpoint tiếp nhận Webhook ngân hàng / SePay / Casso
 */
router.post('/payment', verifyWebhookAuth, async (req, res) => {
  try {
    const payload = req.body;
    const results = [];

    // Nếu là Casso: { error: 0, data: [ ... ] }
    if (payload && Array.isArray(payload.data)) {
      for (const item of payload.data) {
        const result = await processTransactionItem(item);
        results.push(result);
      }
    } else if (payload && typeof payload === 'object') {
      // Nếu là SePay hoặc Webhook đơn lẻ
      const result = await processTransactionItem(payload);
      results.push(result);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
      results
    });
  } catch (err) {
    console.error('Lỗi POST /api/webhook/payment:', err);
    res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
});

module.exports = router;
