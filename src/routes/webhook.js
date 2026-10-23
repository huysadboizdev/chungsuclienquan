const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { db } = require('../database');
const { extractOrderCode } = require('../services/vietqr');
const { notifyPaidOrder } = require('../services/telegram');

/**
 * Xác thực chữ ký HMAC-SHA256 của SePay trên raw request body.
 */
function verifyWebhookAuth(req, res, next) {
  try {
    const secret = process.env.SEPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('SEPAY_WEBHOOK_SECRET chưa được cấu hình');
      return res.status(503).json({ success: false, message: 'Webhook authentication is not configured' });
    }

    const rawBody = req.body;
    const timestamp = req.get('x-sepay-timestamp') || '';
    const signature = (req.get('x-sepay-signature') || '').toLowerCase();
    const timestampSeconds = Number(timestamp);

    if (!Buffer.isBuffer(rawBody) || !/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds)) {
      return res.status(401).json({ success: false, message: 'Missing or invalid webhook signature headers' });
    }

    if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
      return res.status(401).json({ success: false, message: 'Webhook timestamp expired' });
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex')}`;
    const receivedBytes = Buffer.from(signature, 'ascii');
    const expectedBytes = Buffer.from(expectedSignature, 'ascii');

    if (!/^sha256=[a-f0-9]{64}$/.test(signature) || receivedBytes.length !== expectedBytes.length ||
        !crypto.timingSafeEqual(receivedBytes, expectedBytes)) {
      console.warn('Webhook signature verification failed:', req.ip);
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    next();
  } catch (err) {
    console.error('Lỗi verifyWebhookAuth:', err);
    return res.status(500).json({ success: false, message: 'Server auth error' });
  }
}

/**
 * Xử lý 1 bản ghi giao dịch đơn lẻ
 */
async function processTransactionItem(item) {
  // Lấy nội dung giao dịch từ payload SePay.
  const content = item.content || item.description || item.subAccount || item.remarks || '';
  const amount = Number(item.transferAmount || item.amount || item.amountIn || 0);
  const refCode = item.referenceCode || item.tid || item.id || 'WEBHOOK';

  const paymentCode = extractOrderCode(content);
  if (!paymentCode) {
    return { processed: false, reason: 'Không tìm thấy mã đơn trong nội dung: ' + content };
  }

  // Hỗ trợ cả mã thanh toán mới và mã đơn cũ trong các webhook đang chờ xử lý.
  const order = await db.get(
    `SELECT * FROM orders WHERE payment_code = ? OR order_code = ?`,
    [paymentCode, paymentCode]
  );
  if (!order) {
    return { processed: false, reason: `Đơn hàng với mã ${paymentCode} không tồn tại` };
  }

  if (order.status !== 'pending') {
    return { processed: false, reason: `Đơn hàng ${order.order_code} đã ở trạng thái ${order.status}` };
  }

  // Kiểm tra số tiền (chấp nhận nếu chuyển đủ hoặc nhiều hơn)
  if (amount > 0 && amount < order.amount) {
    console.warn(`Đơn ${order.order_code} chuyển thiếu tiền: Cần ${order.amount}, nhận ${amount}`);
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

  return { processed: true, order_code: order.order_code, amount: order.amount };
}

/**
 * POST /api/webhook/payment
 * Endpoint tiếp nhận webhook SePay đã ký HMAC-SHA256.
 */
router.post('/payment', verifyWebhookAuth, async (req, res) => {
  try {
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid JSON webhook payload' });
    }
    const results = [];
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
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
