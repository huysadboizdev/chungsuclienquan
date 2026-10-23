/**
 * Client Payment Script - Chung Sức Liên Quân
 */

let orderCode = null;
let pollInterval = null;
let countdownInterval = null;
let currentOrderData = null;

// Toast helper
function showToast(text, isError = false) {
  const toast = document.getElementById('toast-message');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');

  if (!toast || !toastText) return;

  toastText.textContent = text;
  toast.style.borderColor = isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.2)';
  toastIcon.style.color = isError ? '#ef4444' : '#10b981';

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Copy to clipboard helper
async function copyToClipboard(text, label) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    showToast(`Đã sao chép ${label}: ${text}`);
  } catch (err) {
    showToast(`Không thể tự động chép, hãy chọn và chép thủ công!`, true);
  }
}

// Start 15-minute countdown
function startCountdown(durationMinutes = 15) {
  const timerEl = document.getElementById('countdown-timer');
  const badgeEl = document.getElementById('timer-badge');
  if (!timerEl) return;

  let timeLeft = durationMinutes * 60;

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    timeLeft--;

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      timerEl.textContent = '00:00 (Hết hạn)';
      if (badgeEl) badgeEl.classList.add('expired');
      showToast('Đơn hàng đã hết thời gian giữ chỗ!', true);
      return;
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

// Load order status & payment details
async function fetchOrderStatus(showToastOnError = false) {
  if (!orderCode) return;

  try {
    const res = await fetch(`/api/orders/status/${orderCode}`);
    const data = await res.json();

    if (!data.success) {
      if (showToastOnError) showToast(data.message || 'Không tìm thấy đơn hàng', true);
      return;
    }

    const order = data.order;
    currentOrderData = order;

    // Update UI
    document.getElementById('order-code-badge').textContent = `Mã đơn: ${order.order_code}`;

    // If order is no longer pending, update view & redirect
    if (order.status !== 'pending') {
      handlePaidSuccess(order);
      return;
    }

    // Render bank info
    if (order.bank) {
      document.getElementById('bank-name').textContent = order.bank.bank_id;
      document.getElementById('account-no').textContent = order.bank.account_no;
      document.getElementById('account-name').textContent = order.bank.account_name;
      document.getElementById('amount-text').textContent = `${Number(order.amount).toLocaleString('vi-VN')} đ`;
      document.getElementById('transfer-content').textContent = order.bank.transfer_content;
    }

    // Render QR Code
    if (order.qr_url) {
      const qrImg = document.getElementById('qr-image');
      if (qrImg.src !== order.qr_url) {
        qrImg.src = order.qr_url;
      }
    }
  } catch (err) {
    console.error('Lỗi fetchOrderStatus:', err);
    if (showToastOnError) showToast('Lỗi kết nối kiểm tra đơn', true);
  }
}

// Handle transition when payment is confirmed
function handlePaidSuccess(order) {
  if (pollInterval) clearInterval(pollInterval);
  if (countdownInterval) clearInterval(countdownInterval);

  const statusBox = document.getElementById('payment-status-box');
  const title = document.getElementById('status-title');
  const subtitle = document.getElementById('status-subtitle');

  if (statusBox) {
    statusBox.className = 'status-banner completed';
    title.innerHTML = '🎉 ĐÃ NHẬN THANH TOÁN THÀNH CÔNG!';
    subtitle.innerHTML = 'Hệ thống đang chuyển bạn đến trang theo dõi tiến trình đơn...';
  }

  showToast('Thanh toán thành công! Đang chuyển hướng...');

  setTimeout(() => {
    window.location.href = `/order?code=${order.order_code}`;
  }, 1500);
}

// Copy event listeners setup
function setupCopyButtons() {
  document.getElementById('copy-acc')?.addEventListener('click', () => {
    if (currentOrderData?.bank?.account_no) {
      copyToClipboard(currentOrderData.bank.account_no, 'Số tài khoản');
    }
  });

  document.getElementById('copy-amount')?.addEventListener('click', () => {
    if (currentOrderData?.amount) {
      copyToClipboard(currentOrderData.amount, 'Số tiền');
    }
  });

  document.getElementById('copy-content')?.addEventListener('click', () => {
    if (currentOrderData?.bank?.transfer_content) {
      copyToClipboard(currentOrderData.bank.transfer_content, 'Nội dung chuyển khoản');
    }
  });

  // Manual check button
  document.getElementById('btn-check-now')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-now');
    btn.disabled = true;
    btn.textContent = 'ĐANG KIỂM TRA HỆ THỐNG...';
    await fetchOrderStatus(true);
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        TÔI ĐÃ CHUYỂN KHOẢN (KIỂM TRA NGAY)
      `;
    }, 1500);
  });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  orderCode = urlParams.get('order') || urlParams.get('code');

  if (!orderCode) {
    alert('Không tìm thấy mã đơn hàng!');
    window.location.href = '/';
    return;
  }

  setupCopyButtons();
  startCountdown(15);

  // Initial fetch
  fetchOrderStatus(true);

  // Start polling every 3.5 seconds
  pollInterval = setInterval(() => {
    fetchOrderStatus(false);
  }, 3500);
});
