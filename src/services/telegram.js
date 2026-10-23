const { db } = require('../database');

/**
 * Lấy cấu hình Telegram từ bảng settings
 */
async function getTelegramConfig() {
  try {
    const tokenRow = await db.get(`SELECT value FROM settings WHERE key = 'telegram_bot_token'`);
    const chatIdRow = await db.get(`SELECT value FROM settings WHERE key = 'telegram_chat_id'`);
    const enabledRow = await db.get(`SELECT value FROM settings WHERE key = 'telegram_notify_enabled'`);

    return {
      token: tokenRow?.value?.trim() || '',
      chatId: chatIdRow?.value?.trim() || '',
      enabled: enabledRow?.value === '1'
    };
  } catch (err) {
    console.error('Lỗi lấy cấu hình Telegram:', err.message);
    return { token: '', chatId: '', enabled: false };
  }
}

/**
 * Gửi tin nhắn đến Telegram Bot
 */
async function sendTelegramMessage(htmlMessage) {
  const config = await getTelegramConfig();
  if (!config.enabled || !config.token || !config.chatId) {
    return { success: false, reason: 'Telegram chưa cấu hình hoặc đang tắt' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: htmlMessage,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      return { success: false, error: data.description };
    }

    return { success: true };
  } catch (err) {
    console.error('Lỗi gửi tin Telegram:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Thông báo khi có đơn mới tạo (Chờ thanh toán)
 */
async function notifyNewOrder(order) {
  const message = `
🔔 <b>CÓ ĐƠN HÀNG MỚI TẠO!</b>
━━━━━━━━━━━━━━━━━━
📦 <b>Mã đơn:</b> <code>${order.order_code}</code>
🎮 <b>Mã CS Liên Quân:</b> <code>${order.invite_code}</code>
💎 <b>Gói dịch vụ:</b> ${order.package_name}
💰 <b>Số tiền:</b> ${Number(order.amount).toLocaleString('vi-VN')} đ
📞 <b>Liên hệ:</b> ${order.contact_info || 'Không có'}
⏳ <b>Trạng thái:</b> <i>Chờ thanh toán VietQR...</i>
━━━━━━━━━━━━━━━━━━
<i>Hệ thống tự động Chung Sức Liên Quân</i>
  `.trim();

  return sendTelegramMessage(message);
}

/**
 * Thông báo khi Webhook nhận tiền thành công
 */
async function notifyPaidOrder(order) {
  const message = `
💰 <b>TIỀN ĐÃ VỀ TÀI KHOẢN!</b>
━━━━━━━━━━━━━━━━━━
📦 <b>Mã đơn:</b> <code>${order.order_code}</code>
✅ <b>Đã thanh toán:</b> ${Number(order.amount).toLocaleString('vi-VN')} đ
🎮 <b>Mã CS Liên Quân:</b> <code>${order.invite_code}</code>
💎 <b>Gói dịch vụ:</b> ${order.package_name}
🔄 <b>Trạng thái:</b> <b>ĐANG XỬ LÝ (Cần buff mã)</b>
━━━━━━━━━━━━━━━━━━
👉 <i>Admin hãy mở game sao chép mã CS trên để hỗ trợ khách!</i>
  `.trim();

  return sendTelegramMessage(message);
}

/**
 * Thông báo khi Admin hoàn thành đơn
 */
async function notifyCompletedOrder(order) {
  const message = `
🎉 <b>ĐƠN HÀNG ĐÃ HOÀN THÀNH!</b>
━━━━━━━━━━━━━━━━━━
📦 <b>Mã đơn:</b> <code>${order.order_code}</code>
🎮 <b>Mã CS Liên Quân:</b> <code>${order.invite_code}</code>
💎 <b>Gói:</b> ${order.package_name}
✅ <b>Trạng thái:</b> Đã buff hoàn tất thành công!
━━━━━━━━━━━━━━━━━━
<i>Cảm ơn khách hàng đã sử dụng dịch vụ!</i>
  `.trim();

  return sendTelegramMessage(message);
}

/**
 * Thông báo khi đơn bị hủy
 */
async function notifyCancelledOrder(order, reason) {
  const message = `
⚠️ <b>ĐƠN HÀNG ĐÃ BỊ HỦY!</b>
━━━━━━━━━━━━━━━━━━
📦 <b>Mã đơn:</b> <code>${order.order_code}</code>
🎮 <b>Mã CS Liên Quân:</b> <code>${order.invite_code}</code>
❌ <b>Lý do:</b> ${reason || 'Không xác định'}
━━━━━━━━━━━━━━━━━━
  `.trim();

  return sendTelegramMessage(message);
}

module.exports = {
  getTelegramConfig,
  sendTelegramMessage,
  notifyNewOrder,
  notifyPaidOrder,
  notifyCompletedOrder,
  notifyCancelledOrder
};
