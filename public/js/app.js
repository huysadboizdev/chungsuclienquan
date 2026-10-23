/**
 * Client Main Script - Chung Sức Liên Quân
 */

let selectedPackageId = null;
let currentPackages = [];

// Toast notification helper
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
  }, 2800);
}

// Client-side invite code cleaner
function cleanInviteCodeClient(input) {
  if (!input) return '';
  const trimmed = input.trim();

  // If already clean code
  if (/^[A-Za-z0-9_-]{4,20}$/.test(trimmed)) {
    return trimmed;
  }

  // URL param match
  const urlParamMatch = trimmed.match(/[?&](?:code|invite|c)=([A-Za-z0-9_-]+)/i);
  if (urlParamMatch) {
    return urlParamMatch[1];
  }

  // Standalone uppercase code pattern
  const codeMatch = trimmed.match(/([A-Za-z0-9]{6,16})/);
  if (codeMatch) {
    return codeMatch[1];
  }

  return trimmed;
}

// Fetch public config & packages
async function loadConfig() {
  try {
    const res = await fetch('/api/public/config');
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.message || 'Không thể tải cấu hình');
    }

    // Update site notice
    const noticeEl = document.getElementById('site-notice-text');
    if (noticeEl && data.data.site_notice) {
      noticeEl.textContent = data.data.site_notice;
    }

    // Render packages
    currentPackages = data.data.packages || [];
    renderPackages(currentPackages);
  } catch (err) {
    console.error('Lỗi loadConfig:', err);
    showToast('Không thể kết nối đến máy chủ, vui lòng thử lại!', true);
  }
}

// Render packages list
function renderPackages(packages) {
  const container = document.getElementById('packages-list');
  if (!container) return;

  if (packages.length === 0) {
    selectedPackageId = null;
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem; background: var(--bg-input); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">
        <p style="margin-bottom: 6px; font-weight: 600; color: var(--text-main);">Hiện chưa có gói dịch vụ nào</p>
        <p>Chủ website vui lòng đăng nhập vào trang <a href="/admin" target="_blank" style="color: #60a5fa; text-decoration: underline; font-weight: 600;">Quản Trị</a> để thêm các gói buff dịch vụ thực tế.</p>
      </div>
    `;
    return;
  }

  // Default select first or marked package
  selectedPackageId = packages[0].id;

  container.innerHTML = packages
    .map((pkg, idx) => {
      const isSelected = pkg.id === selectedPackageId;
      const badgeHtml = pkg.badge
        ? `<span class="package-badge">${escapeHtml(pkg.badge)}</span>`
        : '';

      return `
        <div class="package-item ${isSelected ? 'selected' : ''}" data-id="${pkg.id}" onclick="selectPackage(${pkg.id})">
          <div class="package-left">
            <div class="package-radio">
              <div class="package-radio-dot"></div>
            </div>
            <div class="package-info">
              <h3>${escapeHtml(pkg.name)} ${badgeHtml}</h3>
              <p>${escapeHtml(pkg.description || '')}</p>
            </div>
          </div>
          <div class="package-price">
            <span class="amount">${Number(pkg.price).toLocaleString('vi-VN')}</span>
            <span class="currency">đ</span>
          </div>
        </div>
      `;
    })
    .join('');
}

// Select package
function selectPackage(id) {
  selectedPackageId = id;
  const items = document.querySelectorAll('.package-item');
  items.forEach((item) => {
    if (parseInt(item.dataset.id, 10) === id) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

// Escape HTML helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();

  const inviteInput = document.getElementById('invite_code');
  const pasteBtn = document.getElementById('btn-paste');
  const orderForm = document.getElementById('order-form');
  const submitBtn = document.getElementById('btn-submit');

  // Paste from clipboard button
  if (pasteBtn && inviteInput) {
    pasteBtn.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard) {
          showToast('Trình duyệt không cho phép đọc bộ nhớ tạm', true);
          return;
        }
        const text = await navigator.clipboard.readText();
        if (text) {
          const cleaned = cleanInviteCodeClient(text);
          inviteInput.value = cleaned;
          showToast('Đã dán và tự động lọc mã chung sức!');
        } else {
          showToast('Bộ nhớ tạm đang trống!', true);
        }
      } catch (err) {
        showToast('Vui lòng cấp quyền dán hoặc gõ mã trực tiếp', true);
      }
    });

    // Auto-clean on manual paste
    inviteInput.addEventListener('paste', (e) => {
      setTimeout(() => {
        inviteInput.value = cleanInviteCodeClient(inviteInput.value);
      }, 50);
    });
  }

  // Handle form submission
  if (orderForm) {
    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const inviteCode = inviteInput.value.trim();
      const cleaned = cleanInviteCodeClient(inviteCode);
      const contactInfo = document.getElementById('contact_info').value.trim();

      if (!cleaned || cleaned.length < 4) {
        showToast('Vui lòng nhập mã chung sức hợp lệ!', true);
        inviteInput.focus();
        return;
      }

      if (!selectedPackageId) {
        showToast('Vui lòng chọn 1 gói dịch vụ!', true);
        return;
      }

      // Disable button
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        ĐANG KHỞI TẠO ĐƠN HÀNG...
      `;

      try {
        const response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invite_code: cleaned,
            package_id: selectedPackageId,
            contact_info: contactInfo
          })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || 'Không thể tạo đơn hàng');
        }

        showToast('Tạo đơn thành công! Đang chuyển đến thanh toán...');
        setTimeout(() => {
          window.location.href = `/payment?order=${result.order.order_code}`;
        }, 800);
      } catch (err) {
        console.error('Lỗi submit đơn:', err);
        showToast(err.message || 'Lỗi kết nối, vui lòng thử lại!', true);
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          TIẾP TỤC THANH TOÁN VIETQR
        `;
      }
    });
  }
});
