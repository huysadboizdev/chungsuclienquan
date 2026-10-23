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
  const cleanBank = encodeURIComponent(bankId.trim());
  const cleanAccount = encodeURIComponent(accountNo.trim());
  const cleanTemplate = encodeURIComponent(template.trim() || 'compact2');
  const cleanAmount = parseInt(amount, 10) || 0;
  const cleanInfo = encodeURIComponent(orderCode.trim());
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

  // If it's a simple alphanumeric code (e.g. 6-16 characters without spaces)
  if (/^[A-Za-z0-9_-]{4,20}$/.test(trimmed)) {
    return trimmed;
  }

  // If user pasted a URL with code parameter, e.g., ?code=XXXX or /share/XXXX
  const urlParamMatch = trimmed.match(/[?&](?:code|invite|c)=([A-Za-z0-9_-]+)/i);
  if (urlParamMatch) {
    return urlParamMatch[1];
  }

  // Look for standalone uppercase code pattern in text
  const codeMatch = trimmed.match(/([A-Za-z0-9]{6,16})/);
  if (codeMatch) {
    return codeMatch[1];
  }

  return trimmed;
}

module.exports = {
  generateVietQRUrl,
  extractOrderCode,
  cleanInviteCode
};
