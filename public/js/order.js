/**
 * Client Order Tracking Script - Chung Sức Liên Quân
 */

let currentOrder = null;

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

// Copy helper
async function copyText(text, label) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    showToast(`Đã sao chép ${label}: ${text}`);
  } catch (err) {
    showToast('Lỗi sao chép', true);
  }
}

// Search and render order
async function lookupOrder(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    showToast('Vui lòng nhập mã đơn hàng!', true);
    return;
  }

  const resultCard = document.getElementById('order-result-card');
  const emptyState = document.getElementById('empty-state');

  try {
    const res = await fetch(`/api/orders/status/${cleanCode}`);
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Không tìm thấy đơn hàng!', true);
      return;
    }

    currentOrder = data.order;
    renderOrderView(currentOrder);

    resultCard.style.display = 'block';
    emptyState.style.display = 'none';

    // Update browser URL without reload
    const newUrl = `${window.location.pathname}?code=${cleanCode}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  } catch (err) {
    console.error('Lỗi lookupOrder:', err);
    showToast('Lỗi kết nối tra cứu đơn hàng', true);
  }
}

// Render order data
function renderOrderView(order) {
  // Update details
  document.getElementById('detail-order-code').textContent = order.order_code;
  document.getElementById('detail-invite-code').textContent = order.invite_code;
  document.getElementById('detail-package-name').textContent = order.package_name;
  document.getElementById('detail-amount').textContent = `${Number(order.amount).toLocaleString('vi-VN')} đ`;
  document.getElementById('detail-created-at').textContent = new Date(order.created_at).toLocaleString('vi-VN');

  // Admin note
  const adminNoteRow = document.getElementById('admin-note-row');
  const adminNoteText = document.getElementById('detail-admin-note');
  if (order.admin_note) {
    adminNoteRow.style.display = 'flex';
    adminNoteText.textContent = order.admin_note;
  } else {
    adminNoteRow.style.display = 'none';
  }

  // Update Status Banner & Timeline
  const banner = document.getElementById('order-status-banner');
  const icon = document.getElementById('order-status-icon');
  const title = document.getElementById('order-status-title');
  const desc = document.getElementById('order-status-desc');

  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');
  const step4 = document.getElementById('step-4');

  const pendingAction = document.getElementById('pending-action-wrap');
  const payLink = document.getElementById('btn-pay-link');

  // Reset steps
  [step1, step2, step3, step4].forEach((s) => (s.className = 'timeline-step'));
  step1.classList.add('done');

  if (order.status === 'pending') {
    banner.className = 'status-banner pending';
    title.textContent = 'CHỜ THANH TOÁN VIETQR';
    desc.textContent = 'Đơn hàng đang chờ bạn quét mã QR để thanh toán.';
    icon.innerHTML = `
      <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    `;

    step2.classList.add('active');
    document.getElementById('step-desc-2').textContent = 'Đang chờ bạn quét VietQR chuyển khoản...';

    pendingAction.style.display = 'block';
    payLink.href = `/payment?order=${order.order_code}`;
  } else if (order.status === 'processing') {
    banner.className = 'status-banner processing';
    title.textContent = 'ĐÃ THANH TOÁN - ĐANG BUFF CHUNG SỨC';
    desc.textContent = 'Tiền đã vào tài khoản. Hệ thống đang tiến hành nhập mã hỗ trợ vào game.';
    icon.innerHTML = `
      <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    `;

    step2.classList.add('done');
    step3.classList.add('active');
    document.getElementById('step-desc-2').textContent = 'Đã nhận thanh toán thành công';
    document.getElementById('step-desc-3').textContent = 'Đang thực hiện buff mã vào sự kiện game...';

    pendingAction.style.display = 'none';
  } else if (order.status === 'completed') {
    banner.className = 'status-banner completed';
    title.textContent = 'ĐÃ HOÀN THÀNH 100%';
    desc.textContent = 'Mã chung sức của bạn đã được hỗ trợ thành công trọn vẹn.';
    icon.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;

    step2.classList.add('done');
    step3.classList.add('done');
    step4.classList.add('done');
    document.getElementById('step-desc-2').textContent = 'Đã thanh toán thành công';
    document.getElementById('step-desc-3').textContent = 'Đã nhập mã buff thành công';
    document.getElementById('step-desc-4').textContent = 'Hoàn tất đơn hàng!';

    pendingAction.style.display = 'none';
  } else if (order.status === 'cancelled') {
    banner.className = 'status-banner cancelled';
    title.textContent = 'ĐƠN HÀNG ĐÃ BỊ HỦY';
    desc.textContent = order.admin_note || 'Đơn hàng đã bị hủy hoặc không hợp lệ.';
    icon.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    pendingAction.style.display = 'none';
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search_code');

  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    lookupOrder(searchInput.value);
  });

  // Copy buttons
  document.getElementById('btn-copy-order')?.addEventListener('click', () => {
    if (currentOrder?.order_code) copyText(currentOrder.order_code, 'Mã đơn');
  });

  document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
    if (currentOrder?.invite_code) copyText(currentOrder.invite_code, 'Mã chung sức');
  });

  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code') || urlParams.get('order');
  if (code) {
    if (searchInput) searchInput.value = code;
    lookupOrder(code);
  }
});
