require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { initDatabase } = require('./database');

const apiRoutes = require('./routes/api');
const webhookRoutes = require('./routes/webhook');
const adminRoutes = require('./routes/admin');
const telegramRoutes = require('./routes/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Phục vụ thư mục tĩnh
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/telegram', telegramRoutes);

// Điều hướng trang thân thiện (Clean URLs)
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(publicDir, 'payment.html'));
});

app.get('/order', (req, res) => {
  res.sendFile(path.join(publicDir, 'order.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Xử lý 404 cho API
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint không tồn tại' });
});

// Fallback về trang chủ nếu không khớp file tĩnh
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Đã xảy ra lỗi máy chủ' : err.message
  });
});

// Khởi động server
async function startServer() {
  try {
    await initDatabase();
    console.log('📦 Cơ sở dữ liệu SQLite đã sẵn sàng.');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Máy chủ Chung Sức Liên Quân đang chạy tại: http://localhost:${PORT}`);
      console.log(`👉 Trang Khách Hàng: http://localhost:${PORT}/`);
      console.log(`👉 Trang Thanh Toán: http://localhost:${PORT}/payment`);
      console.log(`👉 Trang Tra Cứu: http://localhost:${PORT}/order`);
      console.log(`👉 Trang Quản Trị: http://localhost:${PORT}/admin`);
    });
  } catch (err) {
    console.error('Không thể khởi động server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
