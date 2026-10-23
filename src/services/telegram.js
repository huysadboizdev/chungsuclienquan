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
 * Gửi tin nhắn đến Telegram Bot (Hỗ trợ Inline Keyboard Buttons)
 */
async function sendTelegramMessage(htmlMessage, replyMarkup = null) {
  const config = await getTelegramConfig();
  if (!config.enabled || !config.token || !config.chatId) {
    return { success: false, reason: 'Telegram chưa cấu hình hoặc đang tắt' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.token}/sendMessage`;
    const payload = {
      chat_id: config.chatId,
      text: htmlMessage,
      parse_mode: 'HTML'
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API error:', data.description);
      return { success: false, error: data.description };
    }

    return { success: true, result: data.result };
  } catch (err) {
    console.error('Lỗi gửi tin Telegram:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Trả lời Callback Query khi người dùng bấm nút trên Telegram
 */
async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  const config = await getTelegramConfig();
  if (!config.token) return { success: false };

  try {
    const url = `https://api.telegram.org/bot${config.token}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
      })
    });
    return { success: true };
  } catch (err) {
    console.error('Lỗi answerCallbackQuery:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Chỉnh sửa tin nhắn cũ sau khi bấm nút (Cập nhật trạng thái tin nhắn và đổi nút)
 */
async function editTelegramMessage(chatId, messageId, newHtmlText, newReplyMarkup = null) {
  const config = await getTelegramConfig();
  if (!config.token) return { success: false };

  try {
    const url = `https://api.telegram.org/bot${config.token}/editMessageText`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: newHtmlText,
      parse_mode: 'HTML'
    };

    if (newReplyMarkup) {
      payload.reply_markup = newReplyMarkup;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return { success: data.ok };
  } catch (err) {
    console.error('Lỗi editTelegramMessage:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Cài đặt Webhook cho Telegram Bot
 */
async function setTelegramWebhook(webhookUrl) {
  const config = await getTelegramConfig();
  if (!config.token) {
    return { success: false, message: 'Chưa cấu hình Telegram Bot Token' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      return { success: false, message: data.description };
    }

    return { success: true, message: data.description || 'Cài đặt webhook thành công' };
  } catch (err) {
    return { success: false, message: err.message };
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
⏳ <b>Trạng thái:</b> <i>Chờ khách chuyển khoản...</i>
━━━━━━━━━━━━━━━━━━
<i>Hệ thống tự động Chung Sức Liên Quân</i>
  `.trim();

  // Nút bấm duyệt đơn ngay trên Telegram
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '⚡ Duyệt Tiền (Đang Xử Lý)', callback_data: `process:${order.order_code}` },
        { text: '✅ Hoàn Thành Đơn', callback_data: `complete:${order.order_code}` }
      ]
    ]
  };

  return sendTelegramMessage(message, replyMarkup);
}

/**
 * Thông báo khi Webhook nhận tiền thành công (Kèm nút Hoàn Thành trực tiếp trên Telegram)
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
👉 <i>Admin hãy sao chép mã CS trên dán vào game buff, sau đó bấm nút bên dưới:</i>
  `.trim();

  // Nút bấm tương tác trực tiếp trên Telegram
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ BẤM ĐÃ BUFF XONG (HOÀN THÀNH)', callback_data: `complete:${order.order_code}` }
      ]
    ]
  };

  return sendTelegramMessage(message, replyMarkup);
}

/**
 * Thông báo khi đơn hoàn thành
 */
async function notifyCompletedOrder(order) {
  const message = `
🎉 <b>ĐƠN HÀNG ĐÃ HOÀN THÀNH!</b>
━━━━━━━━━━━━━━━━━━
📦 <b>Mã đơn:</b> <code>${order.order_code}</code>
🎮 <b>Mã CS Liên Quân:</b> <code>${order.invite_code}</code>
💎 <b>Gói:</b> ${order.package_name}
✅ <b>Trạng thái:</b> Đã buff hoàn tất 100%!
━━━━━━━━━━━━━━━━━━
<i>Đơn hàng đã được cập nhật hoàn thành trên Website!</i>
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
  answerCallbackQuery,
  editTelegramMessage,
  setTelegramWebhook,
  notifyNewOrder,
  notifyPaidOrder,
  notifyCompletedOrder,
  notifyCancelledOrder
};
