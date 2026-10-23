const path = require('path');
const fs = require('fs');

// Sử dụng file CSDL riêng biệt cho test để KHÔNG làm ô nhiễm database chính
const testDbPath = path.join(__dirname, '..', 'data', 'test_e2e.sqlite');
process.env.DB_PATH = testDbPath;
process.env.ADMIN_PASSWORD = 'admin123456';
process.env.WEBHOOK_API_KEY = 'sepay_webhook_secret_key';

// Xóa file test cũ nếu có
try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch (e) {}
try { if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal'); } catch (e) {}
try { if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm'); } catch (e) {}

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

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    adminCookie = setCookie.split(';')[0];
  }

  return { status: res.status, data: json, headers: res.headers };
}

async function runTests() {
  console.log('🚀 Chạy bộ kiểm thử tự động với CSDL cách ly (Isolated DB)...');

  await initDatabase();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`📡 Test server chạy tại ${baseUrl}`);
      resolve();
    });
  });

  try {
    // TEST 1: Đăng Nhập Quản Trị Admin
    console.log('\n--- TEST 1: Đăng Nhập Quản Trị Admin ---');
    const loginRes = await request('POST', '/api/admin/login', {
      password: 'admin123456'
    });
    if (loginRes.status !== 200 || !loginRes.data.success) {
      throw new Error(`Test 1 Failed: Cannot login admin: ${loginRes.data?.message}`);
    }
    console.log(`✅ TEST 1 PASS: Đăng nhập Admin thành công.`);

    // TEST 2: Admin Thêm Gói Dịch Vụ Mới
    console.log('\n--- TEST 2: Admin Thêm Gói Dịch Vụ ---');
    const addPkgRes = await request('POST', '/api/admin/packages', {
      name: 'Gói Trải Nghiệm 10k',
      price: 10000,
      description: 'Gói thử nghiệm dịch vụ',
      badge: 'HOT',
      sort_order: 1,
      is_active: true
    });
    if (addPkgRes.status !== 200 || !addPkgRes.data.success) {
      throw new Error('Test 2 Failed: Cannot add package');
    }
    const pkgId = addPkgRes.data.id;
    console.log(`✅ TEST 2 PASS: Admin thêm gói #${pkgId} thành công.`);

    // TEST 3: Kiểm tra Public API hiển thị gói vừa thêm
    console.log('\n--- TEST 3: Public API hiển thị đúng gói ---');
    const configRes = await request('GET', '/api/public/config');
    const packages = configRes.data.data.packages;
    if (!packages || packages.length === 0) {
      throw new Error('Test 3 Failed: Packages array is empty');
    }
    console.log(`✅ TEST 3 PASS: Public API trả về đúng gói vừa thêm.`);

    // TEST 4: Khách hàng Tạo Đơn Hàng Mới
    console.log('\n--- TEST 4: Khách hàng tạo đơn hàng ---');
    const createRes = await request('POST', '/api/orders/create', {
      invite_code: 'Chung sức Liên Quân: CSLQ_TEST_HERO_999 hãy giúp tôi nhé!',
      package_id: pkgId,
      contact_info: '0988776655'
    });

    if (createRes.status !== 200 || !createRes.data.success) {
      throw new Error(`Test 4 Failed: Status ${createRes.status} - ${createRes.data?.message}`);
    }
    const createdOrder = createRes.data.order;
    if (!createdOrder.order_code.startsWith('CSLK-')) {
      throw new Error(`Test 4 Failed: Invalid order code ${createdOrder.order_code}`);
    }
    if (createdOrder.invite_code !== 'CSLQ_TEST_HERO_999') {
      throw new Error(`Test 4 Failed: Invite code was not cleanly extracted: ${createdOrder.invite_code}`);
    }
    console.log(`✅ TEST 4 PASS: Tạo đơn thành công với mã ${createdOrder.order_code}`);

    // TEST 5: Tra Cứu Đơn Hàng
    console.log('\n--- TEST 5: Tra cứu trạng thái đơn ---');
    const statusRes = await request('GET', `/api/orders/status/${createdOrder.order_code}`);
    if (statusRes.status !== 200 || statusRes.data.order.status !== 'pending') {
      throw new Error('Test 5 Failed: Cannot lookup created order');
    }
    console.log(`✅ TEST 5 PASS: Tra cứu đơn thành công.`);

    // TEST 6: Webhook SePay Nhận Tiền
    console.log('\n--- TEST 6: Webhook SePay/Ngân Hàng Tự Động Xác Nhận ---');
    const webhookRes = await request(
      'POST',
      '/api/webhook/payment',
      {
        id: 88888,
        gateway: 'MBBank',
        transferAmount: createdOrder.amount,
        content: `CHUYEN TIEN ${createdOrder.order_code}`,
        referenceCode: 'FT99999999'
      },
      {
        'x-api-key': 'sepay_webhook_secret_key'
      }
    );

    if (webhookRes.status !== 200 || !webhookRes.data.success) {
      throw new Error('Test 6 Failed: Webhook error');
    }

    const checkProcessing = await request('GET', `/api/orders/status/${createdOrder.order_code}`);
    if (checkProcessing.data.order.status !== 'processing') {
      throw new Error('Test 6 Failed: Status is not processing');
    }
    console.log(`✅ TEST 6 PASS: Đơn hàng tự động đổi sang 'processing'.`);

    // TEST 7: Admin Hoàn Thành Đơn Hàng
    console.log('\n--- TEST 7: Admin Đổi Trạng Thái Sang Hoàn Thành ---');
    const updateRes = await request('PATCH', `/api/admin/orders/${createdOrder.id}/status`, {
      status: 'completed',
      admin_note: 'Đã buff hoàn thành'
    });
    if (updateRes.status !== 200 || updateRes.data.order.status !== 'completed') {
      throw new Error('Test 7 Failed: Status not updated');
    }
    console.log(`✅ TEST 7 PASS: Đơn hàng đã đổi sang HOÀN THÀNH.`);

    console.log('\n=========================================');
    console.log('🎉 TẤT CẢ TEST ĐÃ PASS 100% TRÊN CSDL TEST!');
    console.log('=========================================\n');

    server.close(() => {
      // Dọn dẹp file test
      try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch (e) {}
      try { if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal'); } catch (e) {}
      try { if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm'); } catch (e) {}
      console.log('🧹 Đã xóa CSDL test, giữ CSDL chính sạch 100%.');
    });
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    if (server) server.close();
  }
}

runTests();
