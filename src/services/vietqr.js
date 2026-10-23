/**
 * VietQR & Invite Code Utility Service
 */

/**
 * Sinh link hình ảnh mã VietQR chuẩn NAPAS
 */
function generateVietQRUrl({
  bankId = 'MB',
  accountNo = '',
  template = 'compact2',
  amount = 0,
  orderCode = '',
  accountName = ''
}) {
  const cleanBank = encodeURIComponent((bankId || 'MB').trim());
  const cleanAccount = encodeURIComponent((accountNo || '').trim());
  const cleanTemplate = encodeURIComponent((template || 'compact2').trim());
  const cleanAmount = parseInt(amount, 10) || 0;
  const cleanInfo = encodeURIComponent((orderCode || '').trim());
  const cleanName = encodeURIComponent((accountName || '').trim());

  return `https://img.vietqr.io/image/${cleanBank}-${cleanAccount}-${cleanTemplate}.png?amount=${cleanAmount}&addInfo=${cleanInfo}&accountName=${cleanName}`;
}

/**
 * Trích xuất mã đơn hàng dạng CSLK-XXXXXX từ nội dung chuyển khoản ngân hàng
 */
function extractOrderCode(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/CSLK-[A-Z0-9]{4,10}/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Làm sạch mã chung sức Liên Quân (lọc nếu người dùng copy nguyên đoạn chat/link sự kiện)
 */
function cleanInviteCode(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim();

  // 1. Nếu người dùng chỉ nhập đúng mã (4-20 ký tự chữ số/gạch dưới)
  if (/^[A-Za-z0-9_-]{4,20}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Nếu là đường dẫn URL có query param ?code=... hoặc ?c=... hoặc /share/...
  const urlParamMatch = trimmed.match(/[?&](?:code|invite|c|token)=([A-Za-z0-9_-]+)/i);
  if (urlParamMatch) {
    return urlParamMatch[1];
  }

  // 3. Nếu chuỗi có định dạng sau dấu hai chấm (ví dụ: "Mã: ABCD1234EF")
  const colonMatch = trimmed.match(/:\s*([A-Za-z0-9_-]{5,20})/);
  if (colonMatch) {
    return colonMatch[1];
  }

  // 4. Tìm chuỗi chữ hoa/số độ dài 6-20 ký tự trong đoạn văn bản
  const tokenMatch = trimmed.match(/\b([A-Za-z0-9_-]{6,20})\b/);
  if (tokenMatch) {
    return tokenMatch[1];
  }

  return trimmed;
}

module.exports = {
  generateVietQRUrl,
  extractOrderCode,
  cleanInviteCode
};
