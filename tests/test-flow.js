require('dotenv').config();
const http = require('http');
const { app } = require('../src/server');
const { initDatabase, db } = require('../src/database');

let server;
let baseUrl;
let adminCookie = '';

async function request(method, path, body = null, headers = {}) {
  const url = `${baseUrl}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (adminCookie) {
    options.headers['Cookie'] = adminCookie;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);

  // Capture cookie if any
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    adminCookie = setCookie.split(';')[0];
  }

  return { status: res.status, data: json, headers: res.headers };
}

async function runTests() {
  console.log('🚀 Bắt đầu chạy bộ kiểm thử tự động toàn diện (E2E Test Flow)...');

  // 1. Khởi tạo DB
  await initDatabase();

  // 2. Mở cổng test server ngẫu nhiên
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`📡 Test server đang chạy tại ${baseUrl}`);
      resolve();
    });
  });

  try {
    // TEST 1: Public Config API
    console.log('\n--- TEST 1: Kiểm tra API Public Config ---');
    const configRes = await request('GET', '/api/public/config');
    if (configRes.status !== 200 || !configRes.data.success) {
      throw new Error(`Test 1 Failed: Status ${configRes.status}`);
    }
    const packages = configRes.data.data.packages;
    if (!packages || packages.length === 0) {
      throw new Error('Test 1 Failed: Packages array is empty');
    }
    console.log(`✅ TEST 1 PASS: Lấy được ${packages.length} gói dịch vụ.`);

    // TEST 2: Tạo Đơn Hàng Mới
    console.log('\n--- TEST 2: Kiểm tra Tạo Đơn Hàng Mới ---');
    const createRes = await request('POST', '/api/orders/create', {
      invite_code: 'SỰ KIỆN LIÊN QUÂN: CSLQ_TEST_HERO_999 HÃY VÀO GIÚP MÌNH NHÉ!',
      package_id: packages[0].id,
      contact_info: '0988776655'
    });

    if (createRes.status !== 200 || !createRes.data.success) {
      throw new Error(`Test 2 Failed: Status ${createRes.status} - ${createRes.data?.message}`);
    }
    const createdOrder = createRes.data.order;
    if (!createdOrder.order_code.startsWith('CSLK-')) {
      throw new Error(`Test 2 Failed: Invalid order code format ${createdOrder.order_code}`);
    }
    if (createdOrder.invite_code !== 'CSLQ_TEST_HERO_999') {
      throw new Error(`Test 2 Failed: Invite code was not cleanly extracted: ${createdOrder.invite_code}`);
    }
    if (createdOrder.status !== 'pending') {
      throw new Error(`Test 2 Failed: Initial status is not pending: ${createdOrder.status}`);
    }
    if (!createdOrder.qr_url.includes('vietqr.io')) {
      throw new Error(`Test 2 Failed: Invalid VietQR URL: ${createdOrder.qr_url}`);
    }
    console.log(`✅ TEST 2 PASS: Tạo đơn thành công với mã ${createdOrder.order_code}, mã CS sạch: ${createdOrder.invite_code}`);

    // TEST 3: Tra Cứu Đơn Hàng (Status API)
    console.log('\n--- TEST 3: Kiểm tra Tra Cứu Trạng Thái Đơn Hàng ---');
    const statusRes = await request('GET', `/api/orders/status/${createdOrder.order_code}`);
    if (statusRes.status !== 200 || statusRes.data.order.status !== 'pending') {
      throw new Error('Test 3 Failed: Cannot lookup created order');
    }
    console.log(`✅ TEST 3 PASS: Tra cứu đơn ${createdOrder.order_code} thành công.`);

    // TEST 4: Kích Hoạt Webhook SePay Nhận Tiền
    console.log('\n--- TEST 4: Kiểm tra Webhook SePay/Ngân Hàng Tự Động Nhận Tiền ---');
    const webhookRes = await request(
      'POST',
      '/api/webhook/payment',
      {
        id: 999988,
        gateway: 'MBBank',
        transferAmount: createdOrder.amount,
        content: `CHUYEN TIEN CHUNG SUC ${createdOrder.order_code} THANH TOAN`,
        referenceCode: 'FT260000001'
      },
      {
        'x-api-key': 'sepay_webhook_secret_key'
      }
    );

    if (webhookRes.status !== 200 || !webhookRes.data.success) {
      throw new Error(`Test 4 Failed: Webhook returned error: ${webhookRes.status}`);
    }
    console.log(`✅ TEST 4 PASS: Webhook tiếp nhận thành công payload chuyển khoản.`);

    // TEST 5: Xác nhận Trạng thái Đơn Chuyển Sang 'processing'
    console.log('\n--- TEST 5: Xác nhận Đơn Hàng Chuyển Sang ĐANG XỬ LÝ (processing) ---');
    const statusAfterWebhook = await request('GET', `/api/orders/status/${createdOrder.order_code}`);
    if (statusAfterWebhook.data.order.status !== 'processing') {
      throw new Error(`Test 5 Failed: Expected status 'processing', got: ${statusAfterWebhook.data.order.status}`);
    }
    console.log(`✅ TEST 5 PASS: Đơn ${createdOrder.order_code} đã tự động đổi trạng thái sang 'processing'.`);

    // TEST 6: Đăng Nhập Quản Trị Admin
    console.log('\n--- TEST 6: Kiểm tra Đăng Nhập Admin ---');
    const loginRes = await request('POST', '/api/admin/login', {
      password: 'admin123456'
    });
    if (loginRes.status !== 200 || !loginRes.data.success) {
      throw new Error(`Test 6 Failed: Cannot login admin: ${loginRes.data?.message}`);
    }
    console.log(`✅ TEST 6 PASS: Đăng nhập Admin thành công.`);

    // TEST 7: Thống kê Dashboard & Lấy danh sách đơn
    console.log('\n--- TEST 7: Kiểm tra Dashboard & Danh Sách Đơn Hàng ---');
    const dashRes = await request('GET', '/api/admin/dashboard');
    if (dashRes.status !== 200 || !dashRes.data.success) {
      throw new Error('Test 7 Failed: Dashboard error');
    }
    console.log(`✅ TEST 7 PASS: Doanh thu ghi nhận: ${dashRes.data.stats.revenue_total}đ, Số đơn: ${dashRes.data.stats.orders_total}`);

    // TEST 8: Admin Hoàn Thành Đơn Hàng
    console.log('\n--- TEST 8: Admin Đổi Trạng Thái Đơn Sang HOÀN THÀNH ---');
    const orderId = createdOrder.id || statusAfterWebhook.data.order.id;
    const updateRes = await request('PATCH', `/api/admin/orders/${orderId}/status`, {
      status: 'completed',
      admin_note: 'Đã buff hoàn thành 100%'
    });
    if (updateRes.status !== 200 || updateRes.data.order.status !== 'completed') {
      throw new Error(`Test 8 Failed: Status not updated to completed`);
    }

    const finalCheck = await request('GET', `/api/orders/status/${createdOrder.order_code}`);
    if (finalCheck.data.order.status !== 'completed') {
      throw new Error('Test 8 Failed: Public status check is not completed');
    }
    console.log(`✅ TEST 8 PASS: Đơn hàng ${createdOrder.order_code} đã được đánh dấu HOÀN THÀNH.`);

    // TEST 9: Admin CRUD Gói Dịch Vụ
    console.log('\n--- TEST 9: Kiểm tra Thêm & Xóa Gói Dịch Vụ Mới ---');
    const addPkgRes = await request('POST', '/api/admin/packages', {
      name: 'Gói Thử Nghiệm Đặc Biệt',
      price: 99000,
      description: 'Gói thử nghiệm hệ thống tự động',
      badge: 'TEST',
      sort_order: 99,
      is_active: true
    });
    if (addPkgRes.status !== 200 || !addPkgRes.data.success) {
      throw new Error('Test 9 Failed: Cannot add package');
    }
    const newPkgId = addPkgRes.data.id;

    // Check it appears in public config
    const verifyPublic = await request('GET', '/api/public/config');
    const found = verifyPublic.data.data.packages.find((p) => p.id === newPkgId);
    if (!found) {
      throw new Error('Test 9 Failed: New package not found in public config');
    }

    // Delete test package
    const delPkgRes = await request('DELETE', `/api/admin/packages/${newPkgId}`);
    if (delPkgRes.status !== 200 || !delPkgRes.data.success) {
      throw new Error('Test 9 Failed: Cannot delete package');
    }
    console.log(`✅ TEST 9 PASS: Thêm, hiển thị và xóa gói dịch vụ thành công.`);

    console.log('\n=========================================');
    console.log('🎉 TẤT CẢ 9/9 BÀI KIỂM THỬ ĐÃ PASS 100%!');
    console.log('=========================================\n');

    server.close(() => {
      console.log('Quá trình kiểm thử kết thúc tốt đẹp.');
    });
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    if (server) {
      server.close();
    }
  }
}

runTests();
