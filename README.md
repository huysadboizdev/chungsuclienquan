# Dịch Vụ Chung Sức Liên Quân Mobile (Web Fullstack)

Hệ thống web chuyên nghiệp, tối giản, chuẩn Mobile-first hỗ trợ dịch vụ buff mã Chung Sức Liên Quân Mobile:
- **Khách hàng:** Dán mã chung sức (tự động làm sạch mã) -> Chọn gói dịch vụ -> Quét mã VietQR động -> Theo dõi tiến trình đơn hàng thời gian thực.
- **Thanh toán:** Nhận giao dịch qua webhook SePay xác thực HMAC-SHA256; mỗi đơn có nội dung chuyển khoản riêng để tự động đối chiếu.
- **Thông báo:** Telegram Bot gửi tin nhắn tự động khi có đơn mới & khi khách thanh toán thành công.
- **Admin Panel:** Đăng nhập bảo mật, thống kê doanh thu, quản lý đơn hàng với nút 1-chạm sao chép mã chung sức, CRUD gói dịch vụ tùy biến và cài đặt hệ thống.
- **Thiết kế:** 100% SVG đơn sắc tinh gọn, không màu mè, tối ưu hóa cho màn hình điện thoại và máy tính.

---

## 1. Cấu Trúc Dự Án

```
d:\chungsuclienquan/
├── package.json
├── .env.example
├── ecosystem.config.js       # File cấu hình PM2 chạy ngầm trên VPS
├── nginx.conf.example        # Cấu hình Nginx Reverse Proxy
├── src/
│   ├── server.js             # Máy chủ Express chính
│   ├── database.js           # CSDL SQLite (chế độ WAL siêu nhẹ < 60MB RAM)
│   ├── routes/
│   │   ├── api.js            # API cho khách hàng (tạo đơn, tra cứu)
│   │   ├── webhook.js        # Webhook SePay nhận tiền tự động
│   │   └── admin.js          # API Quản trị Admin
│   └── services/
│       ├── vietqr.js         # Sinh VietQR động chuẩn NAPAS & lọc mã CS
│       └── telegram.js       # Telegram Bot thông báo tức thì
├── public/
│   ├── index.html            # Trang chủ gửi mã chung sức
│   ├── payment.html          # Trang thanh toán VietQR động
│   ├── order.html            # Trang tra cứu & trạng thái đơn hàng
│   ├── admin.html            # Bảng điều khiển quản trị Admin
│   ├── css/
│   │   ├── style.css         # Design System tối giản, Dark Mode
│   │   └── admin.css         # Giao diện Admin
│   └── js/
│       ├── app.js            # Xử lý trang chủ
│       ├── payment.js        # Xử lý thanh toán, đếm ngược & polling
│       ├── order.js          # Xử lý tra cứu tiến trình đơn
│       └── admin.js          # Xử lý Admin Dashboard
└── tests/
    └── test-flow.js          # Bộ kiểm thử E2E tự động 9/9 kịch bản
```

---

## 2. Hướng Dẫn Chạy Cục Bộ (Local)

1. Cài đặt thư viện:
   ```bash
   npm install
   ```

2. Tạo file cấu hình `.env`:
   ```bash
   cp .env.example .env
   ```

3. Chạy kiểm thử tự động:
   ```bash
   npm test
   ```

4. Khởi động server:
   ```bash
   npm start
   ```
   Truy cập:
   - **Khách hàng:** `http://localhost:3000/`
   - **Thanh toán:** `http://localhost:3000/payment`
   - **Tra cứu:** `http://localhost:3000/order`
   - **Quản trị Admin:** `http://localhost:3000/admin` (Mật khẩu mặc định: `admin123456`)

---

## 3. Hướng Dẫn Triển Khai Lên VPS Ubuntu (2 CPU, 2GB RAM, 30GB SSD)

Hệ thống được tối ưu hóa đặc biệt cho cấu hình VPS Ubuntu 2GB RAM, tiêu thụ chưa tới **60MB RAM**, khởi động tức thì và không lo bị OOM.

### Bước 1: Cài đặt Node.js & PM2 trên Ubuntu
```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js 20 hoặc 22 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# Cài đặt PM2 để chạy ngầm và tự khởi động lại khi reboot
sudo npm install -g pm2
```

### Bước 2: Tải mã nguồn lên VPS
```bash
sudo mkdir -p /var/www/chungsuclienquan
sudo chown -R $USER:$USER /var/www/chungsuclienquan
cd /var/www/chungsuclienquan

# Copy toàn bộ code vào đây hoặc git clone
npm install --omit=dev
```

### Bước 3: Cấu hình biến môi trường
Tạo file `/var/www/chungsuclienquan/.env`:
```env
PORT=3000
NODE_ENV=production
ADMIN_SECRET_KEY=khoa_bao_mat_jwt_ngau_nhien_123456
ADMIN_PASSWORD=mat_khau_admin_cua_ban
SEPAY_WEBHOOK_SECRET=secret_key_hmac_lay_tu_sepay
BANK_ID=MB
BANK_ACCOUNT_NO=0987654321
BANK_ACCOUNT_NAME=NGUYEN VAN A
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### Bước 4: Khởi chạy bằng PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Tự động triển khai từ GitHub

Workflow `.github/workflows/deploy-vps.yml` chạy sau mỗi lần push lên `main`. Trong GitHub, vào **Settings → Secrets and variables → Actions → New repository secret** và thêm:

- `VPS_HOST`: IP hoặc hostname của VPS.
- `VPS_USER`: tài khoản SSH dùng để triển khai.
- `VPS_SSH_PRIVATE_KEY`: private key SSH; public key tương ứng phải có trong `~/.ssh/authorized_keys` trên VPS.
- `VPS_KNOWN_HOSTS`: host key của VPS, lấy bằng `ssh-keyscan -H <IP_VPS>` rồi lưu nguyên kết quả.

Workflow kết nối vào `/var/www/chungsuclienquan`, kéo `main`, chạy `npm ci --omit=dev` và khởi động lại PM2. VPS cần có bản clone của repo tại đường dẫn này; nếu repo private, tài khoản triển khai trên VPS cũng cần quyền đọc repo để `git pull` thành công. Có thể chạy workflow thủ công trong tab **Actions**.

### Bước 5: Cấu hình Nginx & SSL HTTPS (Miễn Phí)
1. Tạo file cấu hình Nginx:
   ```bash
   sudo cp nginx.conf.example /etc/nginx/sites-available/chungsuclienquan.conf
   sudo nano /etc/nginx/sites-available/chungsuclienquan.conf # Đổi server_name thành tên miền của bạn
   sudo ln -s /etc/nginx/sites-available/chungsuclienquan.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

2. Cài SSL HTTPS miễn phí với Certbot:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

---

## 4. Hướng Dẫn Tích Hợp Webhook SePay (Tự Động Nhận Tiền)

1. Đăng ký tài khoản tại [SePay.vn](https://sepay.vn).
2. Thêm tài khoản ngân hàng của bạn vào SePay.
3. Vào mục **Cài đặt Webhook**:
   - **URL Webhook:** `https://yourdomain.com/api/webhook/payment`
   - **Phương thức:** `POST`
   - **Kiểu dữ liệu:** `JSON`
   - **Phương thức xác thực:** `HMAC-SHA256`
   - Tạo Secret Key trong SePay và đặt cùng giá trị vào `SEPAY_WEBHOOK_SECRET` trong `.env` trên máy chủ. Không đưa secret vào mã nguồn hoặc trang Admin.
4. Mỗi đơn tạo nội dung chuyển khoản `CHUNGSUCHUYDEV` kèm 10 chữ số ngẫu nhiên. SePay ký webhook bằng HMAC-SHA256; server xác minh chữ ký và timestamp trước khi đối chiếu giao dịch, chuyển đơn sang **Đang xử lý** và gửi thông báo Telegram.

---

## 5. Hướng Dẫn Cấu Hình Telegram Bot Thông Báo

1. Nhắn tin cho [@BotFather](https://t.me/BotFather) trên Telegram -> Gõ `/newbot` -> Đặt tên bot -> Nhận **Bot Token**.
2. Nhắn tin cho bot vừa tạo hoặc thêm bot vào nhóm chat.
3. Nhắn cho [@userinfobot](https://t.me/userinfobot) để lấy **Chat ID** của bạn.
4. Truy cập trang Quản Trị `/admin` -> Tab **Cài Đặt** -> Dán Token và Chat ID -> Bấm nút **"Kiểm tra gửi tin nhắn thử"** để xác nhận thành công!
