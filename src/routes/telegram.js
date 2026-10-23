const express = require('express');
const router = express.Router();
const { db } = require('../database');
const {
  answerCallbackQuery,
  editTelegramMessage,
  getTelegramConfig
} = require('../services/telegram');

/**
 * POST /api/telegram/webhook
 * Endpoint nhận sự kiện người dùng bấm nút trên Telegram
 */
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    // Xử lý sự kiện Callback Query (khi Admin bấm nút trên Telegram)
    if (update && update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data || '';
      const message = cb.message;
      const chatId = message?.chat?.id;
      const messageId = message?.message_id;

      // Xác thực bảo mật: Kiểm tra xem Chat ID có đúng là Admin đã cài đặt không
      const config = await getTelegramConfig();
      if (config.chatId && String(chatId) !== String(config.chatId)) {
        await answerCallbackQuery(cb.id, '⛔ Bạn không có quyền quản trị đơn này!', true);
        return res.json({ ok: true });
      }

      // Xử lý nút Hoàn Thành: "complete:CSLK-XXXXXX"
      if (data.startsWith('complete:')) {
        const orderCode = data.split(':')[1]?.trim();
        const order = await db.get(`SELECT * FROM orders WHERE order_code = ?`, [orderCode]);

        if (!order) {
          await answerCallbackQuery(cb.id, `❌ Đơn hàng ${orderCode} không tồn tại!`, true);
          return res.json({ ok: true });
        }

        if (order.status === 'completed') {
          await answerCallbackQuery(cb.id, `Đơn hàng ${orderCode} đã hoàn thành trước đó rồi!`, false);
          return res.json({ ok: true });
        }

        // Cập nhật CSDL trạng thái Hoàn Thành
        await db.run(
          `UPDATE orders 
           SET status = 'completed', admin_note = 'Admin bấm hoàn thành trực tiếp trên Telegram', updated_at = datetime('now', 'localtime') 
           WHERE id = ?`,
          [order.id]
        );

        // Phản hồi popup lên màn hình Telegram của Admin
        await answerCallbackQuery(
          cb.id,
          `🎉 Tuyệt vời! Đã cập nhật đơn ${orderCode} sang HOÀN THÀNH trên Web!`,
          true
        );

        // Cập nhật nội dung tin nhắn và nút bấm trên Telegram
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const updatedText = `
${message.text || ''}

━━━━━━━━━━━━━━━━━━
✅ <b>ĐÃ HOÀN THÀNH 100%</b>
<i>(Admin xác nhận qua Telegram lúc ${nowStr})</i>
        `.trim();

        const disabledMarkup = {
          inline_keyboard: [
            [
              { text: `✅ Đã Hoàn Thành (${nowStr})`, callback_data: 'done' }
            ]
          ]
        };

        await editTelegramMessage(chatId, messageId, updatedText, disabledMarkup);
      }

      // Xử lý nút Duyệt Tiền (Đang xử lý): "process:CSLK-XXXXXX"
      else if (data.startsWith('process:')) {
        const orderCode = data.split(':')[1]?.trim();
        const order = await db.get(`SELECT * FROM orders WHERE order_code = ?`, [orderCode]);

        if (!order) {
          await answerCallbackQuery(cb.id, `❌ Đơn hàng ${orderCode} không tồn tại!`, true);
          return res.json({ ok: true });
        }

        await db.run(
          `UPDATE orders 
           SET status = 'processing', admin_note = 'Admin duyệt tiền qua Telegram', updated_at = datetime('now', 'localtime') 
           WHERE id = ?`,
          [order.id]
        );

        await answerCallbackQuery(cb.id, `⚡ Đã đổi đơn ${orderCode} sang ĐANG XỬ LÝ!`, false);

        // Đổi nút bấm sang nút Hoàn Thành
        const nextMarkup = {
          inline_keyboard: [
            [
              { text: '✅ BẤM ĐÃ BUFF XONG (HOÀN THÀNH)', callback_data: `complete:${order.order_code}` }
            ]
          ]
        };

        const updatedText = `
${message.text || ''}

🔄 <i>(Admin đã duyệt tiền sang Đang Xử Lý)</i>
        `.trim();

        await editTelegramMessage(chatId, messageId, updatedText, nextMarkup);
      } else {
        await answerCallbackQuery(cb.id, 'Đã ghi nhận thao tác', false);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Lỗi Telegram webhook:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
