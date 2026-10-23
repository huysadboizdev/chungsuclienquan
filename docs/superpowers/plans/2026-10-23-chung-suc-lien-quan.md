# Chung Sức Liên Quân Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống web dịch vụ Chung Sức Liên Quân Mobile fullstack (Node.js + Express + SQLite) với luồng người dùng tối giản chuẩn Mobile-first: gửi mã -> thanh toán VietQR động -> theo dõi trạng thái đơn hàng thời gian thực; kèm thông báo Telegram Bot tức thì và trang Quản trị Admin tùy biến gói dịch vụ.

**Architecture:** Sử dụng kiến trúc Node.js/Express REST API gọn nhẹ với cơ sở dữ liệu SQLite cục bộ (chế độ WAL). Frontend sử dụng HTML5/CSS3/Vanilla JS theo chuẩn Mobile-First Responsive, toàn bộ biểu tượng là SVG đơn sắc tinh tế, không màu mè. Tích hợp Webhook SePay/Ngân hàng để tự động xác nhận giao dịch và Telegram Bot API gửi thông báo thời gian thực cho Admin.

**Tech Stack:** Node.js (v18+), Express, better-sqlite3 / sqlite3, dotenv, cookie-parser, Modern Vanilla JS & CSS3, VietQR API, Telegram Bot API.

---

### File Structure Map
- `package.json`: Khai báo dependencies (`express`, `sqlite3`, `dotenv`, `cookie-parser`, `cors`) và scripts.
- `.env.example`: File mẫu biến môi trường cấu hình cổng port, secret key, tài khoản admin mặc định.
- `src/database.js`: Khởi tạo SQLite, tạo bảng `orders`, `packages`, `settings`, seed dữ liệu mặc định.
- `src/services/vietqr.js`: Module tạo URL mã VietQR động chuẩn NAPAS247 và trích xuất mã đơn hàng.
- `src/services/telegram.js`: Module gửi tin nhắn thông báo Telegram với định dạng Markdown.
- `src/routes/api.js`: Router API công khai (lấy cấu hình web, danh sách gói buff, tạo đơn hàng mới, tra cứu trạng thái đơn).
- `src/routes/webhook.js`: Router xử lý webhook thanh toán (SePay/Casso/Ngân hàng) tự động đổi trạng thái đơn sang `processing`.
- `src/routes/admin.js`: Router quản trị (đăng nhập admin, thống kê dashboard, CRUD gói dịch vụ, quản lý đơn hàng & đổi trạng thái, cài đặt hệ thống).
- `src/server.js`: Khởi động Express server, gắn middleware, static files và routing.
- `public/css/style.css`: Hệ thống CSS Design System tối giản, Dark Mode hiện đại, responsive 100% trên mọi thiết bị, không màu mè.
- `public/css/admin.css`: Giao diện trang Admin tinh tế, tối ưu quản lý cả trên di động và PC.
- `public/index.html`: Trang chủ gửi mã chung sức, chọn gói buff, nút dán nhanh clipboard.
- `public/payment.html`: Trang thanh toán VietQR động, đếm ngược thời gian, nút sao chép STK/nội dung, tự động chuyển trang khi hoàn thành.
- `public/order.html`: Trang tra cứu & theo dõi tiến trình đơn hàng (Chờ thanh toán -> Đang xử lý -> Hoàn thành).
- `public/admin.html`: Trang quản trị (Đăng nhập, danh sách đơn, nút 1-chạm copy mã chung sức, quản lý gói dịch vụ, cài đặt).
- `public/js/app.js`: Xử lý giao diện trang chủ, tải gói dịch vụ từ API, validation mã chung sức.
- `public/js/payment.js`: Quản lý đếm ngược thời gian thanh toán, nút copy, cơ chế polling kiểm tra thanh toán thành công.
- `public/js/order.js`: Tra cứu và hiển thị tiến trình trạng thái đơn hàng.
- `public/js/admin.js`: Xử lý đăng nhập, quản lý đơn hàng, thao tác 1-chạm sao chép, CRUD gói và cấu hình.
- `tests/test-flow.js`: Script kiểm thử tự động toàn diện luồng: Khởi tạo CSDL -> Tạo đơn -> Sinh VietQR -> Webhook kích hoạt -> Tra cứu đơn -> Admin đổi trạng thái.
- `ecosystem.config.js`: File cấu hình PM2 chuẩn chạy bền bỉ 24/7 trên VPS Ubuntu.

---

### Task 1: Khởi Tạo Dự Án & Cấu Trúc Cơ Bản

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.env`
- Create: `.gitignore`

- [ ] **Step 1: Tạo file `package.json` với các thư viện cần thiết**
```json
{
  "name": "chung-suc-lien-quan",
  "version": "1.0.0",
  "description": "Hệ thống web dịch vụ Chung Sức Liên Quân Mobile chuyên nghiệp",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node tests/test-flow.js"
  },
  "dependencies": {
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "sqlite3": "^5.1.7"
  }
}
```

- [ ] **Step 2: Tạo `.env.example` và `.gitignore`**
File `.env.example`:
```env
PORT=3000
NODE_ENV=production
ADMIN_SECRET_KEY=cslk_super_secret_jwt_key_2026
ADMIN_PASSWORD=admin123456
WEBHOOK_API_KEY=sepay_webhook_secret_key
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
BANK_ID=MB
BANK_ACCOUNT_NO=0987654321
BANK_ACCOUNT_NAME=NGUYEN VAN A
```
File `.gitignore`:
```
node_modules/
.env
data/
*.sqlite
*.sqlite-journal
```

- [ ] **Step 3: Chạy cài đặt dependencies**
Run: `npm install`
Expected: Cài đặt thành công, thư mục `node_modules` và file `package-lock.json` được tạo.

---

### Task 2: Thiết Lập Cơ Sở Dữ Liệu SQLite & Dữ Liệu Khởi Tạo (Database Layer)

**Files:**
- Create: `src/database.js`

- [ ] **Step 1: Viết module SQLite với các bảng `orders`, `packages`, `settings`**
Module `src/database.js` chịu trách nhiệm:
- Tự động tạo thư mục `data/` nếu chưa có.
- Mở kết nối SQLite và bật chế độ `PRAGMA journal_mode = WAL;`.
- Tự động khởi tạo schema:
  * Bảng `orders`: Quản lý các đơn hàng (`order_code`, `invite_code`, `package_id`, `package_name`, `amount`, `status`, `contact_info`, `payment_ref`, `admin_note`, `created_at`, `updated_at`).
  * Bảng `packages`: Các gói buff dịch vụ (`id`, `name`, `price`, `description`, `badge`, `sort_order`, `is_active`).
  * Bảng `settings`: Lưu trữ key-value cấu hình (thông tin ngân hàng, token Telegram, webhook key, thông báo web).
- Tự động seed dữ liệu mẫu ban đầu: 3 gói dịch vụ mẫu (Gói Trải Nghiệm 10k, Gói Tiết Kiệm 25k, Gói Siêu Tốc Full Rương 50k) và các cấu hình mặc định nếu bảng trống.
- Xuất các hàm tiện ích dạng Promise: `db.get()`, `db.all()`, `db.run()`.

- [ ] **Step 2: Viết script kiểm tra kết nối CSDL**
Tạo file kiểm tra nhanh `tests/db-check.js` để verify bảng và seed data hoạt động chuẩn.
Run: `node tests/db-check.js`
Expected: "Database initialized successfully! Seed packages: 3".

---

### Task 3: Xây Dựng Services: VietQR & Telegram Bot

**Files:**
- Create: `src/services/vietqr.js`
- Create: `src/services/telegram.js`

- [ ] **Step 1: Viết service `src/services/vietqr.js`**
- Hàm `generateVietQRUrl({ bankId, accountNo, template, amount, orderCode, accountName })`:
  * Sinh URL mã QR chuẩn VietQR (ví dụ qua `https://img.vietqr.io/image/<bankId>-<accountNo>-<template>.png?amount=<amount>&addInfo=<orderCode>&accountName=<accountName>`).
- Hàm `extractOrderCode(text)`:
  * Sử dụng Regex tìm kiếm mã đơn `CSLK-[A-Z0-9]{6}` từ nội dung tin nhắn chuyển khoản của ngân hàng/SePay.

- [ ] **Step 2: Viết service `src/services/telegram.js`**
- Hàm `sendTelegramMessage(text)`:
  * Đọc `telegram_bot_token` và `telegram_chat_id` từ CSDL bảng `settings`.
  * Nếu chưa cấu hình, ghi log cảnh báo và không làm crash hệ thống.
  * Nếu đã cấu hình, gọi API `https://api.telegram.org/bot<token>/sendMessage` với `parse_mode: 'HTML'`.
- Hàm `notifyNewOrder(order)`: Gửi thông báo đơn mới kèm định dạng rõ ràng (Mã đơn, Tên gói, Số tiền, Mã CS).
- Hàm `notifyPaidOrder(order)`: Gửi thông báo khi Webhook ghi nhận thanh toán thành công.
- Hàm `notifyCompletedOrder(order)`: Gửi thông báo khi đơn được admin hoàn thành.

- [ ] **Step 3: Kiểm thử độc lập module VietQR**
Run: `node -e "const { generateVietQRUrl, extractOrderCode } = require('./src/services/vietqr'); console.log(generateVietQRUrl({ bankId: 'MB', accountNo: '123', amount: 30000, orderCode: 'CSLK-883921' })); console.log(extractOrderCode('Chuyen tien CSLK-883921 thanh toan'));"`
Expected: Trả về URL VietQR hợp lệ và extract đúng mã `CSLK-883921`.

---

### Task 4: Xây Dựng REST API Cho Khách Hàng (Client Routes)

**Files:**
- Create: `src/routes/api.js`

- [ ] **Step 1: Viết API lấy thông tin công khai `GET /api/public/config`**
- Trả về: Danh sách gói dịch vụ đang hoạt động (`is_active = 1`) sắp xếp theo `sort_order`, thông tin ngân hàng hiển thị (Bank ID, STK, Tên chủ TK), và thông báo đầu trang (`site_notice`).

- [ ] **Step 2: Viết API tạo đơn hàng `POST /api/orders/create`**
- Input body: `{ invite_code: string, package_id: number, contact_info?: string }`
- Validate:
  * `invite_code` không được để trống, độ dài hợp lệ (tự động loại bỏ khoảng trắng và trích xuất chuỗi nếu người dùng dán cả đoạn văn).
  * `package_id` phải tồn tại trong CSDL và đang active.
- Xử lý:
  * Sinh mã đơn duy nhất ngẫu nhiên: `CSLK-` + 6 ký tự ngẫu nhiên (ví dụ `CSLK-739281`).
  * Lưu vào bảng `orders` với trạng thái `pending`.
  * Tạo link VietQR động chứa số tiền của gói và nội dung là mã đơn hàng.
  * Bắn thông báo Telegram cho Admin: Có khách vừa tạo đơn mới!
- Output: Trả về thông tin đơn hàng và thông tin thanh toán đầy đủ.

- [ ] **Step 3: Viết API kiểm tra trạng thái đơn hàng `GET /api/orders/status/:order_code`**
- Input: `order_code` (URL param).
- Xử lý: Tra cứu trong bảng `orders`.
- Output: Trả về trạng thái hiện tại (`status`: `pending`, `processing`, `completed`, `cancelled`), thời gian tạo, tên gói, mã chung sức, và ghi chú nếu có.

---

### Task 5: Xây Dựng Webhook Thanh Toán Tự Động (Payment Webhook Route)

**Files:**
- Create: `src/routes/webhook.js`

- [ ] **Step 1: Viết route nhận Webhook `POST /api/webhook/payment`**
- Hỗ trợ payload linh hoạt từ SePay / Casso / MBBank Webhook (các trường `content`, `description`, `amountIn`, `transferAmount`, `referenceCode`...).
- Xác thực bảo mật:
  * Kiểm tra API Key từ Header `Authorization: Apikey <KEY>` hoặc URL param `?apiKey=<KEY>` đối chiếu với `webhook_api_key` trong CSDL.
- Xử lý đối soát:
  * Tìm mã đơn `CSLK-XXXXXX` trong nội dung chuyển khoản.
  * Nếu tìm thấy đơn hàng trong CSDL và đơn hàng đang ở trạng thái `pending`:
    - So khớp số tiền chuyển vào >= số tiền của đơn hàng.
    - Cập nhật trạng thái đơn sang `processing` (Đang xử lý).
    - Lưu mã giao dịch ngân hàng vào `payment_ref`.
    - Gọi Telegram Bot báo ngay cho Admin: *"💰 TIỀN ĐÃ VỀ! Đơn #CSLK-XXXXXX đã thanh toán... Đang tiến hành xử lý!"*.
- Output: Trả về `{ success: true, message: 'Webhook processed' }`.

---

### Task 6: Xây Dựng API Trang Quản Trị Admin (Admin Routes & Auth)

**Files:**
- Create: `src/routes/admin.js`

- [ ] **Step 1: Xây dựng cơ chế xác thực Admin**
- API `POST /api/admin/login`:
  * Nhận mật khẩu admin, kiểm tra với mật khẩu đã lưu trong CSDL.
  * Nếu đúng, cấp session token bảo mật lưu trong cookie (hoặc Bearer token).
- Middleware `requireAdmin`:
  * Bảo vệ toàn bộ endpoint admin bên dưới.
- API `POST /api/admin/logout`: Xóa session cookie.

- [ ] **Step 2: API Thống kê Dashboard & Quản lý đơn hàng**
- `GET /api/admin/dashboard`: Trả về tổng doanh thu, doanh thu hôm nay, số đơn chờ, số đơn đang xử lý, số đơn hoàn thành.
- `GET /api/admin/orders`: Danh sách đơn hàng có phân trang, bộ lọc trạng thái (`status`), tìm kiếm theo mã đơn hoặc mã chung sức.
- `PATCH /api/admin/orders/:id/status`: Đổi trạng thái đơn (`processing`, `completed`, `cancelled`), cập nhật ghi chú admin. Nếu đổi sang `completed`, tự động gửi thông báo Telegram xác nhận đơn đã hoàn thành.

- [ ] **Step 3: API CRUD Gói dịch vụ**
- `GET /api/admin/packages`: Lấy toàn bộ danh sách gói.
- `POST /api/admin/packages`: Thêm gói mới (tên, giá, mô tả, badge, sort_order).
- `PUT /api/admin/packages/:id`: Cập nhật gói.
- `DELETE /api/admin/packages/:id`: Xóa gói.

- [ ] **Step 4: API Cấu hình hệ thống & Test Telegram**
- `GET /api/admin/settings`: Lấy các cấu hình (ẩn mật khẩu hash).
- `POST /api/admin/settings`: Cập nhật thông tin ngân hàng, Telegram Bot Token/Chat ID, Webhook API Key, Thông báo web, Đổi mật khẩu admin.
- `POST /api/admin/test-telegram`: Gửi 1 tin nhắn test thử nghiệm ngay lên Telegram để admin kiểm tra kết nối.

---

### Task 7: Lắp Ráp Máy Chủ Server Express Chính

**Files:**
- Create: `src/server.js`

- [ ] **Step 1: Viết `src/server.js` tích hợp toàn bộ các routes và middleware**
- Cấu hình middleware: `express.json()`, `express.urlencoded()`, `cors()`, `cookie-parser()`.
- Phục vụ thư mục tĩnh `public/`.
- Gắn các routes:
  * `/api` -> `src/routes/api.js`
  * `/api/webhook` -> `src/routes/webhook.js`
  * `/api/admin` -> `src/routes/admin.js`
- Xử lý các đường dẫn điều hướng trang (SPA/Multi-page fallback):
  * `/` -> `public/index.html`
  * `/payment` -> `public/payment.html`
  * `/order` -> `public/order.html`
  * `/admin` -> `public/admin.html`
- Xử lý Error Handler chung (bảo mật, không leak stack trace trong production).

- [ ] **Step 2: Chạy thử nghiệm khởi động server**
Run: `node src/server.js`
Expected: Server khởi động trên cổng 3000, in thông báo sẵn sàng nhận request.

---

### Task 8: Xây Dựng Hệ Thống Design System & SVG Icons Đơn Sắc (CSS & UI Foundation)

**Files:**
- Create: `public/css/style.css`
- Create: `public/css/admin.css`

- [ ] **Step 1: Viết `public/css/style.css` chuẩn Mobile-First & Dark/Light Mode hiện đại**
- Bảng màu: Đơn sắc, tương phản sắc nét, nền tối sâu thanh lịch (`#090d16` / `#0f172a`), thẻ card viền mờ (`border: 1px solid rgba(255,255,255,0.08)`), màu nhấn thanh toán xanh công nghệ (`#2563eb` / `#3b82f6`).
- Typography: Font không chân hiện đại (Inter / Plus Jakarta Sans / system font), cỡ chữ và khoảng cách dòng chuẩn tỉ lệ vàng trên mobile.
- Thư viện SVG đơn sắc (Monochrome Icons):
  * Icon Copy (2 trang giấy chồng)
  * Icon Check (dấu tích tròn)
  * Icon Clock / Pending (đồng hồ cát/xoay)
  * Icon QR Code
  * Icon Search (kính lúp)
  * Icon Shield / Security (khiên bảo vệ)
  * Icon Arrow Right / Back
- Hiệu ứng phản hồi: Hover, Active, Focus, Toast thông báo nhẹ nhàng nổi góc màn hình khi bấm Sao chép.
- Responsive toàn diện: Tự động vừa vặn màn hình từ 320px (iPhone SE) đến 1920px (PC Desktop).

- [ ] **Step 2: Viết `public/css/admin.css` cho Trang Quản Trị**
- Bố cục Dashboard dạng thẻ thống kê nhanh, bảng dữ liệu linh hoạt (tự chuyển sang dạng thẻ khi xem trên điện thoại để admin quản lý đơn bằng điện thoại cực dễ).
- Nút bấm to rõ, nút 1-chạm "Copy Mã CS" màu sắc tương phản rõ nét để thao tác cực nhanh.

---

### Task 9: Xây Dựng Giao Diện Người Dùng: Trang Chủ & Gửi Mã Chung Sức

**Files:**
- Create: `public/index.html`
- Create: `public/js/app.js`

- [ ] **Step 1: Xây dựng cấu trúc HTML `public/index.html`**
- Header: Tên dịch vụ "CHUNG SỨC LIÊN QUÂN", huy hiệu trạng thái xanh "Hệ thống tự động 24/7", liên kết chuyển nhanh "Tra cứu đơn".
- Banner thông báo tối giản do Admin cài đặt.
- Khung nhập Mã Chung Sức:
  * Input lớn, hiển thị chữ in hoa rõ nét.
  * Nút "Dán nhanh" (tự động đọc clipboard và lọc chuỗi mã nếu khách copy nguyên đoạn chia sẻ từ game Liên Quân).
- Khung chọn Gói Buff:
  * Tự động hiển thị danh sách gói động từ API `GET /api/public/config`.
  * Mỗi gói có: Tên gói, Giá tiền (VNĐ), Mô tả chi tiết, Badge nổi bật ("HOT", "Khuyên dùng").
  * Người dùng bấm chọn trực quan.
- Ô nhập thông tin liên hệ / Zalo (tùy chọn) để hỗ trợ.
- Nút bấm CTA chính: "TẠO ĐƠN & THANH TOÁN VIETQR".
- Footer: Cam kết uy tín, bảo mật thông tin, icon SVG đơn sắc cam kết hỗ trợ.

- [ ] **Step 2: Viết `public/js/app.js` xử lý tương tác**
- Tự động gọi API lấy cấu hình và gói dịch vụ khi mở trang.
- Xử lý nút "Dán nhanh" (Clipboard API) kèm regex lọc mã chung sức tự động.
- Validate dữ liệu đầu vào.
- Khi người dùng bấm tạo đơn: Gọi `POST /api/orders/create`, nhận về mã đơn và tự động chuyển hướng sang trang thanh toán `/payment?order=CSLK-XXXXXX`.

---

### Task 10: Xây Dựng Giao Diện Thanh Toán VietQR Động

**Files:**
- Create: `public/payment.html`
- Create: `public/js/payment.js`

- [ ] **Step 1: Xây dựng giao diện `public/payment.html`**
- Thẻ thông tin đơn hàng: Mã đơn `CSLK-XXXXXX`, Tên gói, Mã Chung Sức đã gửi.
- Vùng mã VietQR động chuẩn NAPAS:
  * Ảnh QR Code to rõ, sắc nét, có logo VietQR chính thống.
  * Đồng hồ đếm ngược 15 phút thời gian giữ đơn.
- Bảng thông tin chuyển khoản kèm nút "Sao chép" 1-chạm riêng biệt cho từng dòng:
  * Ngân hàng thụ hưởng.
  * Số tài khoản.
  * Tên người nhận.
  * Số tiền (VNĐ).
  * Nội dung chuyển khoản (bắt buộc đúng mã đơn để hệ thống tự động kích hoạt).
- Khung trạng thái thanh toán thời gian thực:
  * Biểu tượng xoay chờ thanh toán: *"Đang đợi tiền vào tài khoản..."*
  * Nút phụ: *"Tôi đã chuyển khoản"* hoặc *"Kiểm tra thanh toán ngay"*.
  * Nút quay lại hoặc tra cứu đơn.

- [ ] **Step 2: Viết `public/js/payment.js`**
- Đọc tham số `?order=...` từ URL.
- Gọi API lấy thông tin chi tiết đơn và hiển thị.
- Khởi động đồng hồ đếm ngược 15 phút.
- Xử lý các nút Sao chép (sử dụng Clipboard API kèm toast thông báo nhẹ nhàng).
- Thiết lập cơ chế Polling (kiểm tra trạng thái đơn mỗi 3 giây).
- Khi trạng thái chuyển sang `processing` hoặc `completed`: Hiển thị hiệu ứng thành công và tự động chuyển sang trang theo dõi đơn `/order?code=CSLK-XXXXXX`.

---

### Task 11: Xây Dựng Giao Diện Tra Cứu & Trạng Thái Đơn Hàng

**Files:**
- Create: `public/order.html`
- Create: `public/js/order.js`

- [ ] **Step 1: Xây dựng giao diện `public/order.html`**
- Thanh tra cứu nhanh: Ô nhập mã đơn hàng (ví dụ `CSLK-883921`) + nút tìm kiếm (SVG kính lúp).
- Khung tiến trình trạng thái trực quan 4 bước (Timeline Stepper):
  1. `Đã Tạo Đơn` (Hoàn thành)
  2. `Đã Thanh Toán` (Đã nhận tiền qua VietQR)
  3. `Đang Buff Chung Sức` (Admin hoặc bot đang tiến hành nhập mã hỗ trợ)
  4. `Hoàn Thành` (Đã hoàn tất hỗ trợ sự kiện thành công)
- Bảng chi tiết đơn hàng: Mã Chung Sức, Gói dịch vụ, Số tiền, Thời gian tạo, Thời gian cập nhật.
- Nút "Tạo đơn mới" hoặc "Liên hệ hỗ trợ".

- [ ] **Step 2: Viết `public/js/order.js`**
- Tự động tra cứu nếu URL có `?code=...`.
- Xử lý form tìm kiếm mã đơn.
- Hiển thị badge trạng thái màu sắc chuẩn mực (Xanh lá: Hoàn thành, Xanh dương: Đang xử lý, Vàng cam: Chờ thanh toán, Đỏ: Thất bại).

---

### Task 12: Xây Dựng Giao Diện Trang Quản Trị Admin

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`

- [ ] **Step 1: Xây dựng giao diện `public/admin.html`**
- Màn hình Đăng nhập Admin (nếu chưa đăng nhập): Form nhập mật khẩu gọn gàng, an toàn.
- Màn hình Quản trị chính (khi đã đăng nhập):
  * Thanh tiêu đề Admin + Nút Đăng xuất.
  * Hàng thẻ thống kê: Doanh thu hôm nay, Tổng doanh thu, Đơn đang chờ xử lý, Đơn hoàn thành.
  * Tab điều hướng: **[📦 Đơn Hàng]** - **[⚙️ Gói Dịch Vụ]** - **[🔧 Cài Đặt Hệ Thống]**.
  * **Tab Đơn Hàng:**
    - Thanh lọc theo trạng thái và tìm kiếm.
    - Bảng danh sách đơn hàng.
    - Cột Mã Chung Sức có nút **"Copy Mã"** 1-chạm (rất thuận tiện cho admin mở game và dán ngay).
    - Cột Hành động: Nút chuyển sang "Đang xử lý", "Hoàn thành", "Hủy".
  * **Tab Gói Dịch Vụ:**
    - Nút "Thêm gói mới".
    - Bảng danh sách gói: Tên, Giá, Mô tả, Badge, Thứ tự, Trạng thái (Bật/Tắt), Nút Sửa / Xóa.
    - Modal popup thêm/sửa gói.
  * **Tab Cài Đặt:**
    - Form cấu hình Ngân hàng (Mã ngân hàng, STK, Tên chủ TK).
    - Form cấu hình Telegram Bot (Bot Token, Chat ID, nút "Bấm để Test gửi tin nhắn").
    - Form cấu hình Webhook SePay (Webhook API Key, hiển thị sẵn Webhook URL để copy dán vào SePay).
    - Form đổi mật khẩu Admin.
    - Form sửa thông báo đầu trang web.

- [ ] **Step 2: Viết `public/js/admin.js`**
- Quản lý phiên đăng nhập (Token/Cookie).
- Xử lý tải dữ liệu Dashboard, Orders, Packages, Settings.
- Xử lý 1-click Copy mã chung sức có toast thông báo.
- Xử lý đổi trạng thái đơn hàng tức thì và reload dữ liệu.
- Xử lý thêm, sửa, xóa gói dịch vụ.
- Xử lý lưu cài đặt và gửi test Telegram.

---

### Task 13: Viết Bộ Script Kiểm Thử Toàn Diện (End-to-End Verification)

**Files:**
- Create: `tests/test-flow.js`

- [ ] **Step 1: Viết script kiểm thử tự động toàn diện `tests/test-flow.js`**
Script thực hiện tự động các bước:
1. Khởi động server ảo hoặc gọi trực tiếp API handlers.
2. Kiểm tra API `GET /api/public/config` trả về đúng danh sách gói.
3. Giả lập khách hàng tạo đơn hàng qua `POST /api/orders/create` với mã chung sức `LQ_TEST_CODE_999`.
4. Xác nhận đơn hàng được tạo với trạng thái `pending` và có mã đơn dạng `CSLK-XXXXXX`.
5. Giả lập SePay gửi Webhook `POST /api/webhook/payment` đúng mã đơn và số tiền.
6. Xác nhận trạng thái đơn chuyển sang `processing`.
7. Giả lập Admin đăng nhập và đổi trạng thái đơn sang `completed`.
8. Kiểm tra API tra cứu `GET /api/orders/status/:code` xác nhận trạng thái là `completed`.
9. Thử nghiệm thêm 1 gói dịch vụ mới qua API Admin và xác nhận hiển thị ở public API.

- [ ] **Step 2: Chạy kiểm thử tự động**
Run: `npm test`
Expected: Toàn bộ kịch bản kiểm thử PASS 100%.

---

### Task 14: Tối Ưu Hóa & Đóng Gói Triển Khai VPS Ubuntu (2-2-30)

**Files:**
- Create: `ecosystem.config.js`
- Create: `nginx.conf.example`
- Create: `README.md`

- [ ] **Step 1: Tạo file cấu hình PM2 `ecosystem.config.js`**
```javascript
module.exports = {
  apps: [{
    name: 'chungsuclienquan',
    script: 'src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

- [ ] **Step 2: Tạo file mẫu Nginx Reverse Proxy `nginx.conf.example`**
- Hướng dẫn cấu hình Nginx chuyển tiếp port 80/443 về port 3000 của Node.js, bật nén Gzip, cache static file (css, js, svg).

- [ ] **Step 3: Viết tài liệu `README.md`**
- Hướng dẫn chi tiết từng bước:
  1. Cài Node.js 18+ và PM2 trên VPS Ubuntu.
  2. Tải mã nguồn về thư mục `/var/www/chungsuclienquan`.
  3. Cài đặt dependencies `npm install --omit=dev`.
  4. Cấu hình file `.env` (Mật khẩu admin, STK ngân hàng, Telegram Bot).
  5. Chạy ứng dụng bằng lệnh: `pm2 start ecosystem.config.js` và `pm2 save`.
  6. Hướng dẫn tích hợp SePay Webhook chỉ với 2 click.

---

### Task 15: Kiểm Thử Thực Tế Trực Quan (Browser / UI Smoke Test)

**Files:**
- Test trên trình duyệt (Kiểm tra responsive trên Mobile và Desktop).

- [ ] **Step 1: Khởi động server ở môi trường dev/local**
- [ ] **Step 2: Kiểm tra trực quan giao diện trang chủ, trang thanh toán, trang tra cứu đơn, trang admin**
- [ ] **Step 3: Xác nhận không có lỗi console, không có icon màu mè, hiển thị hoàn hảo trên giao diện di động.**
