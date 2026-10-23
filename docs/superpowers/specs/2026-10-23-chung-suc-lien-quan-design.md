# Tài Liệu Thiết Kế Kỹ Thuật (Design Specification)
## Hệ Thống Dịch Vụ Chung Sức Liên Quân Mobile (Web + Admin + VietQR + Telegram Bot)

* **Ngày lập:** 2026-10-23
* **Trạng thái:** Đã thống nhất thiết kế với người dùng
* **Môi trường mục tiêu:** VPS Ubuntu (2 CPU, 2GB RAM, 30GB SSD)

---

## 1. Mục Tiêu & Yêu Cầu Cốt Lõi

1. **Giao diện người dùng (Client):**
   - Đơn giản, tinh tế, hiện đại, tối ưu 100% chuẩn Mobile-First (thao tác 1 tay).
   - Không sử dụng icon màu mè hay banner nhấp nháy; 100% sử dụng icon đơn sắc SVG (Monochrome Vector Icons).
   - Nhập mã Chung Sức Liên Quân (hỗ trợ tự trích xuất mã nếu người dùng copy nguyên đoạn text thông báo từ game).
   - Chọn gói buff dịch vụ động (được cấu hình linh hoạt từ Admin).
   - Thanh toán qua VietQR động tự động sinh mã QR chuẩn NAPAS (có sẵn số tiền + nội dung mã đơn hàng dạng `CSLK-XXXXXX`).
   - Tích hợp Webhook tự động (SePay / Casso / MBBank) để tự động chuyển trạng thái sang `Đang xử lý` khi tiền vào tài khoản.
   - Trang theo dõi và tra cứu trạng thái đơn hàng theo thời gian thực (Polling / API check).

2. **Thông báo Telegram Bot:**
   - Báo tức thì khi có đơn mới đặt.
   - Báo tức thì khi tiền về tài khoản (Webhook kích hoạt thành công).
   - Báo khi admin hoàn thành đơn hoặc hủy đơn.

3. **Trang Quản Trị (Admin Panel):**
   - Đăng nhập bảo mật (Session / JWT Token).
   - Quản lý danh sách đơn hàng (Bộ lọc trạng thái, tìm kiếm, nút 1-click Copy mã Chung Sức để admin dán vào game buff).
   - Nút đổi trạng thái đơn: *Chờ thanh toán* -> *Đang xử lý* -> *Hoàn thành* / *Hủy đơn*.
   - Quản lý gói dịch vụ (Thêm, sửa, xóa, định giá, bật/tắt gói).
   - Cài đặt hệ thống (Cấu hình STK ngân hàng VietQR, cấu hình Telegram Bot Token & Chat ID, cấu hình Webhook API Key).
   - Thống kê doanh thu nhanh: Doanh thu hôm nay, tổng doanh thu, tổng đơn.

4. **Hiệu năng & Tài nguyên:**
   - Chạy trên nền tảng Node.js + Express + SQLite.
   - Mức tiêu thụ RAM < 60MB, khởi động tức thì, hoạt động 24/7 bền bỉ qua PM2 hoặc Systemd, không lo tràn RAM (OOM) trên VPS 2GB RAM.

---

## 2. Kiến Trúc Hệ Thống (Architecture)

```
[Khách Hàng (Mobile / Web)]
       │
       ├── 1. Gửi Mã CS & Chọn Gói ───► [ Express REST API ]
       │                                     │
       │                                     ├──► [ SQLite DB (orders, packages, settings) ]
       │                                     │
       ├── 2. Nhận VietQR Động ◄─────────────┤
       │                                     │
       └── 3. Tra cứu Đơn Hàng ◄─────────────┤
                                             │
[ Ngân Hàng / SePay Webhook ] ──► [ Webhook Endpoint ]
                                             │
                                             ├──► Tự động cập nhật: Đã Thanh Toán / Đang Xử Lý
                                             │
                                             └──► [ Telegram Bot API ] ──► [ Admin Telegram Channel / Group ]
                                             ▲
[ Admin Dashboard (Web/Mobile) ] ────────────┘ (Duyệt đơn / Đổi trạng thái / Thêm gói)
```

---

## 3. Mô Hình Dữ Liệu (SQLite Database Schema)

### Bảng `orders` (Quản lý đơn hàng)
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | ID đơn hàng nội bộ |
| `order_code` | TEXT UNIQUE NOT NULL | Mã đơn hàng hiển thị (ví dụ: `CSLK-883921`) |
| `invite_code` | TEXT NOT NULL | Mã Chung Sức Liên Quân của khách |
| `package_id` | INTEGER NOT NULL | ID gói dịch vụ đã chọn |
| `package_name` | TEXT NOT NULL | Tên gói dịch vụ tại thời điểm tạo đơn |
| `amount` | INTEGER NOT NULL | Số tiền thanh toán (VNĐ) |
| `status` | TEXT NOT NULL DEFAULT 'pending' | `pending` (chờ TT), `processing` (đang xử lý), `completed` (hoàn thành), `cancelled` (hủy) |
| `contact_info` | TEXT | Số điện thoại / Zalo / Ghi chú của khách (tùy chọn) |
| `payment_ref` | TEXT | Mã giao dịch ngân hàng / SePay (nếu có) |
| `admin_note` | TEXT | Ghi chú của admin (lý do hủy, v.v.) |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Thời gian tạo đơn |
| `updated_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Thời gian cập nhật cuối |

### Bảng `packages` (Gói dịch vụ buff do Admin tự chỉnh)
| Trường | Kiểu dữ liệu | Mô tả |
| :--- | :--- | :--- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | ID gói |
| `name` | TEXT NOT NULL | Tên gói (ví dụ: `Gói Nhanh 5 Lượt`) |
| `price` | INTEGER NOT NULL | Giá tiền (VNĐ) |
| `description` | TEXT | Mô tả ngắn / quyền lợi |
| `badge` | TEXT | Huy hiệu nổi bật (ví dụ: `Phổ biến`, `Khuyên dùng`, `VIP`) |
| `sort_order` | INTEGER DEFAULT 0 | Thứ tự sắp xếp hiển thị |
| `is_active` | INTEGER DEFAULT 1 | 1 = Đang bán, 0 = Ẩn |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

### Bảng `settings` (Cấu hình hệ thống dạng Key-Value)
- `admin_password_hash`: Mật khẩu đăng nhập Admin (được băm bcrypt/crypto)
- `bank_id`: Mã ngân hàng (ví dụ: `MB`, `ICB`, `VCB`, `TCB`...)
- `bank_account_no`: Số tài khoản ngân hàng nhận tiền
- `bank_account_name`: Tên chủ tài khoản ngân hàng
- `vietqr_template`: Template VietQR (`compact2` hoặc `qr_only`)
- `telegram_bot_token`: Token bot Telegram
- `telegram_chat_id`: Chat ID / Channel ID nhận thông báo
- `telegram_notify_enabled`: Bật/tắt thông báo Telegram (1/0)
- `webhook_api_key`: Khóa bí mật để xác thực Webhook SePay/Ngân hàng
- `site_notice`: Thông báo nổi bật hiển thị trên đầu web (ví dụ: "Thời gian buff sự kiện từ 8h - 23h hàng ngày")

---

## 4. Đặc Tả API & Webhook (Endpoints)

### Client Endpoints
- `GET /api/public/config`: Lấy thông tin công khai (Ngân hàng, Thông báo đầu trang, Danh sách gói đang mở bán).
- `POST /api/orders/create`:
  - Body: `{ invite_code: string, package_id: number, contact_info?: string }`
  - Response: `{ success: true, order: { order_code, invite_code, amount, qr_url, bank_info, expires_at } }`
  - Đồng thời gửi thông báo Telegram cho Admin về đơn mới.
- `GET /api/orders/status/:order_code`:
  - Trả về trạng thái chi tiết của đơn hàng để client cập nhật màn hình thời gian thực.

### Webhook Endpoint (Tự động xác nhận tiền về)
- `POST /api/webhook/payment`:
  - Hỗ trợ format chuẩn của SePay / Casso / Webhook ngân hàng.
  - Xác thực qua header `Authorization: Apikey <webhook_api_key>` hoặc URL query key.
  - Parser tự động trích xuất mã `CSLK-XXXXXX` trong nội dung giao dịch (`content` / `description`).
  - Đối chiếu số tiền chuyển vào >= số tiền đơn hàng:
    * Chuyển trạng thái đơn sang `processing` (Đang xử lý).
    * Gửi thông báo Telegram: *"💰 ĐÃ THANH TOÁN THÀNH CÔNG đơn #CSLK-XXXXXX..."*

### Admin Endpoints (Yêu cầu Authentication Cookie/Token)
- `POST /api/admin/login`: Đăng nhập admin.
- `POST /api/admin/logout`: Đăng xuất.
- `GET /api/admin/dashboard`: Thống kê doanh thu, số đơn theo trạng thái.
- `GET /api/admin/orders`: Lấy danh sách đơn (phân trang, lọc theo status, search).
- `PATCH /api/admin/orders/:id/status`: Đổi trạng thái (`processing`, `completed`, `cancelled`).
- `GET /api/admin/packages`: Danh sách gói.
- `POST /api/admin/packages`: Thêm gói mới.
- `PUT /api/admin/packages/:id`: Sửa gói.
- `DELETE /api/admin/packages/:id`: Xóa gói.
- `GET /api/admin/settings`: Lấy cấu hình hệ thống.
- `POST /api/admin/settings`: Lưu cấu hình hệ thống.
- `POST /api/admin/test-telegram`: Gửi tin nhắn test qua Telegram.

---

## 5. Đặc Tả Giao Diện Người Dùng & Phong Cách Thiết Kế

### 1. Nguyên Tắc Thiết Kế:
- **Tối giản - Chuyên nghiệp - Chuẩn xác:** Không sử dụng hình ảnh hoạt hình, không icon màu mè xanh đỏ tím vàng lòe loẹt.
- **Biểu tượng (Icons):** 100% SVG đơn sắc (Monochrome Stroke 1.5px/2px), sắc nét trên mọi mật độ điểm ảnh (Retina / OLED).
- **Responsive Mobile-First:**
  * Toàn bộ form và các bước thanh toán nằm gọn gàng trong tầm với của ngón tay cái trên màn hình điện thoại (Thumb Zone).
  * Nút "Dán mã nhanh" (Paste Clipboard) tiện lợi.
  * Nút "Sao chép" (Copy) kèm phản hồi xúc giác Toast thông báo nhẹ nhàng.
  * Tự động làm sạch mã chung sức: Nếu người dùng copy chuỗi dài từ game (ví dụ: `Hãy nhấn vào link để giúp tôi: ABCD1234EF`), hệ thống tự động lọc ra chuỗi mã hợp lệ.

### 2. Các Màn Hình Chính:
1. **Trang Chủ / Đặt Đơn (Màn hình chính):**
   - Header: Tên dịch vụ + Nút chuyển sang "Tra cứu đơn hàng" + Trạng thái hoạt động (Chấm xanh "Hệ thống đang hoạt động").
   - Banner thông báo tối giản: Quy định gửi mã hoặc thời gian xử lý.
   - Thẻ nhập mã Chung Sức Liên Quân (input lớn, font monospace dễ nhìn, nút dán nhanh).
   - Danh sách thẻ Gói Buff (Card chọn dạng lưới, có radio button hoặc viền active rõ ràng, hiển thị giá rõ ràng).
   - Nút hành động chính (CTA Button): "Xác Nhận & Tạo Đơn Thanh Toán".
2. **Màn Hình Thanh Toán VietQR:**
   - Mã đơn hàng nổi bật: `CSLK-883921`.
   - Ảnh mã QR chuẩn VietQR sinh trực tiếp từ API VietQR (đã gắn sẵn STK, Tên ngân hàng, Số tiền, Nội dung).
   - Bảng thông tin thanh toán chi tiết từng dòng kèm nút Copy riêng:
     * Ngân hàng thụ hưởng.
     * Số tài khoản.
     * Chủ tài khoản.
     * Số tiền (VNĐ).
     * Nội dung chuyển khoản (bắt buộc đúng mã đơn để hệ thống tự duyệt).
   - Khung trạng thái động: Vòng xoay chờ thanh toán + đồng hồ đếm ngược 15 phút.
   - Tự động nhảy sang trang hoàn thành khi Webhook báo tiền vào (hoặc có nút "Kiểm tra thanh toán").
3. **Màn Hình Tra Cứu / Trạng Thái Đơn:**
   - Thanh tìm kiếm mã đơn nhanh.
   - Timeline trạng thái đơn hàng 4 bước: Tạo đơn -> Đã thanh toán -> Đang buff mã -> Hoàn thành.
   - Thông tin chi tiết mã chung sức, gói dịch vụ, thời gian xử lý.
4. **Trang Quản Trị Admin (`/admin`):**
   - Đăng nhập bảo mật.
   - 3 Tab chính trực quan:
     * **Đơn Hàng:** Bảng đơn hàng có nút Copy Mã CS 1-chạm, nút chuyển trạng thái nhanh sang Hoàn Thành.
     * **Gói Dịch Vụ:** Thêm/sửa/xóa gói dịch vụ.
     * **Cài Đặt:** Đổi mật khẩu, cài đặt tài khoản ngân hàng, cài đặt Telegram Bot & SePay Webhook.

---

## 6. Chiến Lược Triển Khai & Vận Hành Trên VPS Ubuntu (2-2-30)

- Chạy bằng tiến trình **PM2** (Process Manager 2) để tự động khởi động lại nếu máy chủ reboot.
- SQLite được cấu hình chế độ WAL (Write-Ahead Logging) để tăng tốc độ ghi/đọc đồng thời và chống khóa cơ sở dữ liệu.
- Kèm file mẫu cấu hình Nginx Reverse Proxy (hỗ trợ SSL HTTPS miễn phí Let's Encrypt qua Certbot).
- File `.env` bảo mật lưu các tham số nhạy cảm.

---

## 7. Kế Hoạch Kiểm Thử (Verification Plan)
1. **Kiểm tra luồng tạo đơn:** Nhập mã test, chọn gói -> đơn hàng được tạo và lưu vào SQLite thành công.
2. **Kiểm tra VietQR sinh mã:** QR hiển thị đúng số tiền, STK và cú pháp mã đơn.
3. **Kiểm tra Webhook SePay/Ngân hàng:** Giả lập gửi payload webhook -> hệ thống tự chuyển trạng thái đơn sang `processing` trong SQLite.
4. **Kiểm tra Telegram Bot:** Gửi thông báo test qua bot thành công khi có đơn mới & khi thanh toán.
5. **Kiểm tra Admin Panel:** Đăng nhập, đổi trạng thái đơn, thêm sửa xóa gói dịch vụ, chỉnh cấu hình hệ thống.
6. **Kiểm tra Responsive:** Thử nghiệm trên kích thước màn hình Mobile (375px, 412px), Tablet (768px), Desktop (1280px+).
