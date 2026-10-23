/**
 * Admin Panel Script - Chung Sức Liên Quân
 */

let currentPage = 1;
let currentLimit = 20;

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
async function copyToClipboard(text, label = 'nội dung') {
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
    showToast(`Đã chép ${label}: ${text}`);
  } catch (err) {
    showToast('Lỗi sao chép', true);
  }
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Auth Check
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/check-auth');
    const data = await res.json();

    if (data.success && data.authenticated) {
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('dashboard-section').style.display = 'block';
      loadDashboard();
      loadOrders();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('dashboard-section').style.display = 'none';
}

// Load Dashboard Overview Stats
async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard');
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;
    document.getElementById('stat-revenue-today').textContent = `${Number(s.revenue_today).toLocaleString('vi-VN')} đ`;
    document.getElementById('stat-revenue-total').textContent = `${Number(s.revenue_total).toLocaleString('vi-VN')} đ`;
    document.getElementById('stat-processing-count').textContent = s.orders_processing;
    document.getElementById('stat-completed-count').textContent = s.orders_completed;
    document.getElementById('tab-orders-badge').textContent = s.orders_processing;
  } catch (err) {
    console.error('Lỗi loadDashboard:', err);
  }
}

// Load Orders List
async function loadOrders(page = 1) {
  currentPage = page;
  const status = document.getElementById('filter-status').value;
  const search = document.getElementById('admin-search-input').value.trim();

  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        Đang tải dữ liệu đơn hàng...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: currentLimit,
      status: status,
      search: search
    });

    const res = await fetch(`/api/admin/orders?${params.toString()}`);
    const data = await res.json();

    if (!data.success) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">${escapeHtml(data.message)}</td></tr>`;
      return;
    }

    const orders = data.orders || [];
    const p = data.pagination;

    // Update pagination info
    document.getElementById('orders-pagination-info').textContent = `Hiển thị trang ${p.page} / ${p.totalPages || 1} (Tổng cộng: ${p.total} đơn)`;
    document.getElementById('btn-page-prev').disabled = p.page <= 1;
    document.getElementById('btn-page-next').disabled = p.page >= p.totalPages;

    if (orders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            Không có đơn hàng nào khớp với điều kiện lọc.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = orders
      .map((ord) => {
        let statusBadge = '';
        if (ord.status === 'pending') statusBadge = '<span class="badge pending">Chờ TT</span>';
        else if (ord.status === 'processing') statusBadge = '<span class="badge processing">Đang xử lý</span>';
        else if (ord.status === 'completed') statusBadge = '<span class="badge completed">Hoàn thành</span>';
        else if (ord.status === 'cancelled') statusBadge = '<span class="badge cancelled">Đã hủy</span>';

        const dateStr = new Date(ord.created_at).toLocaleString('vi-VN');

        return `
          <tr>
            <td>
              <b style="font-family: var(--font-mono); color: #60a5fa;">${escapeHtml(ord.order_code)}</b>
            </td>
            <td style="font-size: 0.775rem; color: var(--text-muted);">${dateStr}</td>
            <td>
              <!-- 1-Click Copy Code Button -->
              <button type="button" class="btn-copy-code" onclick="copyToClipboard('${escapeHtml(ord.invite_code)}', 'Mã CS')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                ${escapeHtml(ord.invite_code)}
              </button>
            </td>
            <td>
              <div style="font-weight: 600;">${escapeHtml(ord.package_name)}</div>
              <div style="font-family: var(--font-mono); color: #38bdf8; font-size: 0.8rem;">${Number(ord.amount).toLocaleString('vi-VN')} đ</div>
            </td>
            <td>
              <span style="font-size: 0.8rem;">${escapeHtml(ord.contact_info || '-')}</span>
            </td>
            <td>${statusBadge}</td>
            <td>
              <select class="action-select" onchange="changeOrderStatus(${ord.id}, this.value)">
                <option value="" disabled selected>Đổi trạng thái...</option>
                <option value="processing" ${ord.status === 'processing' ? 'disabled' : ''}>⚡ Đang xử lý</option>
                <option value="completed" ${ord.status === 'completed' ? 'disabled' : ''}>✅ Hoàn thành</option>
                <option value="pending" ${ord.status === 'pending' ? 'disabled' : ''}>⏳ Chờ TT</option>
                <option value="cancelled" ${ord.status === 'cancelled' ? 'disabled' : ''}>❌ Hủy đơn</option>
              </select>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Lỗi loadOrders:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 16px;">Lỗi tải dữ liệu đơn hàng</td></tr>`;
  }
}

// Change Order Status
async function changeOrderStatus(orderId, newStatus) {
  if (!newStatus) return;

  let adminNote = undefined;
  if (newStatus === 'cancelled') {
    const reason = prompt('Nhập lý do hủy đơn (sẽ hiển thị cho khách và Telegram):', 'Mã không hợp lệ hoặc sự kiện hết lượt');
    if (reason === null) {
      loadOrders(currentPage);
      return;
    }
    adminNote = reason;
  }

  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, admin_note: adminNote })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Lỗi cập nhật trạng thái', true);
      return;
    }

    showToast('Cập nhật trạng thái đơn thành công!');
    loadDashboard();
    loadOrders(currentPage);
  } catch (err) {
    console.error('Lỗi changeOrderStatus:', err);
    showToast('Lỗi cập nhật', true);
  }
}

// Load Packages List
async function loadPackages() {
  const tbody = document.getElementById('packages-tbody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Đang tải gói dịch vụ...</td></tr>`;

  try {
    const res = await fetch('/api/admin/packages');
    const data = await res.json();
    if (!data.success) return;

    const packages = data.packages || [];
    tbody.innerHTML = packages
      .map(
        (pkg) => `
        <tr>
          <td><span class="info-value mono">#${pkg.id}</span></td>
          <td><b>${escapeHtml(pkg.name)}</b></td>
          <td><span style="font-family: var(--font-mono); color: #38bdf8; font-weight: 700;">${Number(pkg.price).toLocaleString('vi-VN')} đ</span></td>
          <td><span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(pkg.description || '-')}</span></td>
          <td>${pkg.badge ? `<span class="package-badge">${escapeHtml(pkg.badge)}</span>` : '-'}</td>
          <td>${pkg.sort_order}</td>
          <td>${pkg.is_active ? '<span class="badge completed">Đang bán</span>' : '<span class="badge cancelled">Tạm ẩn</span>'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-secondary" style="height: 30px; padding: 0 10px; font-size: 0.75rem;" onclick='openEditPackage(${JSON.stringify(pkg)})'>Sửa</button>
              <button type="button" class="btn-secondary" style="height: 30px; padding: 0 10px; font-size: 0.75rem; color: var(--danger);" onclick="deletePackage(${pkg.id})">Xóa</button>
            </div>
          </td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error('Lỗi loadPackages:', err);
  }
}

// Add/Edit Package Modal
function openAddPackage() {
  document.getElementById('modal-package-title').textContent = 'Thêm Gói Dịch Vụ Mới';
  document.getElementById('pkg_id').value = '';
  document.getElementById('pkg_name').value = '';
  document.getElementById('pkg_price').value = '';
  document.getElementById('pkg_description').value = '';
  document.getElementById('pkg_badge').value = '';
  document.getElementById('pkg_sort_order').value = '1';
  document.getElementById('pkg_is_active').value = '1';

  document.getElementById('package-modal').classList.add('show');
}

function openEditPackage(pkg) {
  document.getElementById('modal-package-title').textContent = `Sửa Gói #${pkg.id}`;
  document.getElementById('pkg_id').value = pkg.id;
  document.getElementById('pkg_name').value = pkg.name;
  document.getElementById('pkg_price').value = pkg.price;
  document.getElementById('pkg_description').value = pkg.description || '';
  document.getElementById('pkg_badge').value = pkg.badge || '';
  document.getElementById('pkg_sort_order').value = pkg.sort_order || 0;
  document.getElementById('pkg_is_active').value = pkg.is_active ? '1' : '0';

  document.getElementById('package-modal').classList.add('show');
}

function closePackageModal() {
  document.getElementById('package-modal').classList.remove('show');
}

// Delete Package
async function deletePackage(id) {
  if (!confirm(`Bạn có chắc muốn xóa gói dịch vụ #${id}?`)) return;

  try {
    const res = await fetch(`/api/admin/packages/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa gói dịch vụ!');
      loadPackages();
    } else {
      showToast(data.message || 'Lỗi xóa gói', true);
    }
  } catch (err) {
    showToast('Lỗi xóa gói', true);
  }
}

// Load Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (!data.success) return;

    const s = data.settings;
    const effectiveAppUrl = (s.app_url || window.location.origin).replace(/\/+$/, '');

    const appUrlEl = document.getElementById('set_app_url');
    if (appUrlEl) {
      appUrlEl.value = s.app_url || '';
    }

    document.getElementById('set_bank_id').value = s.bank_id || 'MB';
    document.getElementById('set_bank_account_no').value = s.bank_account_no || '';
    document.getElementById('set_bank_account_name').value = s.bank_account_name || '';
    document.getElementById('set_telegram_bot_token').value = s.telegram_bot_token || '';
    document.getElementById('set_telegram_chat_id').value = s.telegram_chat_id || '';
    document.getElementById('set_telegram_notify_enabled').value = s.telegram_notify_enabled || '1';
    document.getElementById('set_webhook_api_key').value = s.webhook_api_key || '';
    document.getElementById('set_site_notice').value = s.site_notice || '';

    // Webhook URLs (Ưu tiên cấu hình từ server qua .env/DB)
    const webhookUrl = s.payment_webhook_url || `${effectiveAppUrl}/api/webhook/payment`;
    const whInput = document.getElementById('webhook-url-display');
    if (whInput) whInput.value = webhookUrl;

    const tgWebhookUrl = s.telegram_webhook_url || `${effectiveAppUrl}/api/telegram/webhook`;
    const tgEl = document.getElementById('telegram-webhook-url-display');
    if (tgEl) tgEl.value = tgWebhookUrl;
  } catch (err) {
    console.error('Lỗi loadSettings:', err);
  }
}

// Event Listeners setup
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Login form
  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('admin-password').value;
    const btn = document.getElementById('btn-login-submit');

    btn.disabled = true;
    btn.textContent = 'ĐANG ĐĂNG NHẬP...';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Sai mật khẩu');
      }

      showToast('Đăng nhập thành công!');
      checkAuth();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'ĐĂNG NHẬP VÀO BẢNG ĐIỀU KHIỂN';
    }
  });

  // Logout
  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showToast('Đã đăng xuất');
    showLogin();
  });

  // Tab switching
  const tabButtons = document.querySelectorAll('.admin-tab-btn[data-tab]');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach((tc) => (tc.style.display = 'none'));
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.style.display = 'block';

      if (targetId === 'tab-orders') loadOrders(1);
      if (targetId === 'tab-packages') loadPackages();
      if (targetId === 'tab-settings') loadSettings();
    });
  });

  // Orders filters
  document.getElementById('filter-status')?.addEventListener('change', () => loadOrders(1));
  document.getElementById('btn-refresh-orders')?.addEventListener('click', () => {
    loadDashboard();
    loadOrders(currentPage);
    showToast('Đã làm mới dữ liệu!');
  });

  document.getElementById('admin-search-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadOrders(1);
  });

  document.getElementById('btn-page-prev')?.addEventListener('click', () => {
    if (currentPage > 1) loadOrders(currentPage - 1);
  });

  document.getElementById('btn-page-next')?.addEventListener('click', () => {
    loadOrders(currentPage + 1);
  });

  // Package modal events
  document.getElementById('btn-open-add-package')?.addEventListener('click', openAddPackage);
  document.getElementById('btn-close-package-modal')?.addEventListener('click', closePackageModal);
  document.getElementById('btn-cancel-package')?.addEventListener('click', closePackageModal);

  document.getElementById('package-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pkgId = document.getElementById('pkg_id').value;
    const body = {
      name: document.getElementById('pkg_name').value.trim(),
      price: document.getElementById('pkg_price').value,
      description: document.getElementById('pkg_description').value.trim(),
      badge: document.getElementById('pkg_badge').value.trim(),
      sort_order: document.getElementById('pkg_sort_order').value,
      is_active: document.getElementById('pkg_is_active').value === '1'
    };

    try {
      const url = pkgId ? `/api/admin/packages/${pkgId}` : '/api/admin/packages';
      const method = pkgId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Lỗi lưu gói', true);
        return;
      }

      showToast('Đã lưu gói dịch vụ thành công!');
      closePackageModal();
      loadPackages();
    } catch (err) {
      showToast('Lỗi gửi dữ liệu', true);
    }
  });

  // Live update webhook URLs when editing APP_URL
  document.getElementById('set_app_url')?.addEventListener('input', (e) => {
    const base = (e.target.value.trim() || window.location.origin).replace(/\/+$/, '');
    const whEl = document.getElementById('webhook-url-display');
    const tgEl = document.getElementById('telegram-webhook-url-display');
    if (whEl) whEl.value = `${base}/api/webhook/payment`;
    if (tgEl) tgEl.value = `${base}/api/telegram/webhook`;
  });

  // Settings form
  document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      app_url: document.getElementById('set_app_url')?.value.trim() || '',
      bank_id: document.getElementById('set_bank_id').value.trim(),
      bank_account_no: document.getElementById('set_bank_account_no').value.trim(),
      bank_account_name: document.getElementById('set_bank_account_name').value.trim(),
      telegram_bot_token: document.getElementById('set_telegram_bot_token').value.trim(),
      telegram_chat_id: document.getElementById('set_telegram_chat_id').value.trim(),
      telegram_notify_enabled: document.getElementById('set_telegram_notify_enabled').value,
      webhook_api_key: document.getElementById('set_webhook_api_key').value.trim(),
      site_notice: document.getElementById('set_site_notice').value.trim(),
      new_password: document.getElementById('set_new_password').value.trim()
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Lỗi lưu cấu hình', true);
        return;
      }

      showToast('Lưu toàn bộ cài đặt thành công!');
      document.getElementById('set_new_password').value = '';
      loadSettings();
    } catch (err) {
      showToast('Lỗi lưu cài đặt', true);
    }
  });

  // Test Telegram button
  document.getElementById('btn-test-telegram')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-telegram');
    btn.disabled = true;
    btn.textContent = 'ĐANG GỬI TIN NHẮN THỬ...';

    try {
      const res = await fetch('/api/admin/test-telegram', { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Không thể gửi tin thử đến Telegram', true);
      } else {
        showToast('Đã gửi tin nhắn test đến Telegram thành công!');
      }
    } catch (err) {
      showToast('Lỗi kết nối test Telegram', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Bấm để kiểm tra gửi tin nhắn thử lên Telegram';
    }
  });

  // Copy App URL button
  document.getElementById('btn-copy-app-url')?.addEventListener('click', () => {
    const url = document.getElementById('set_app_url').value;
    copyToClipboard(url, 'Tên miền website APP_URL');
  });

  // Copy Webhook URL button
  document.getElementById('btn-copy-webhook-url')?.addEventListener('click', () => {
    const url = document.getElementById('webhook-url-display').value;
    copyToClipboard(url, 'Đường dẫn Webhook');
  });

  // Copy Telegram Webhook URL
  document.getElementById('btn-copy-telegram-webhook')?.addEventListener('click', () => {
    const url = document.getElementById('telegram-webhook-url-display').value;
    copyToClipboard(url, 'Đường dẫn Telegram Webhook');
  });

  // Register Telegram Webhook Button
  document.getElementById('btn-register-telegram-webhook')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-register-telegram-webhook');
    const url = document.getElementById('telegram-webhook-url-display').value;

    if (!url.startsWith('https://')) {
      alert('Lưu ý: Telegram yêu cầu đường dẫn Webhook phải có HTTPS (khi bạn triển khai lên VPS có SSL tên miền). Nếu đang chạy localhost HTTP, Telegram sẽ không nhận kết nối trực tiếp được.');
    }

    btn.disabled = true;
    btn.textContent = 'ĐANG KÍCH HOẠT...';

    try {
      const res = await fetch('/api/admin/set-telegram-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: url })
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message || 'Không thể kích hoạt webhook telegram', true);
      } else {
        showToast('Kích hoạt Webhook Telegram thành công! Bây giờ bạn có thể bấm nút trên Telegram.');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Bấm để Kích Hoạt Nút Bấm Telegram';
    }
  });
});
