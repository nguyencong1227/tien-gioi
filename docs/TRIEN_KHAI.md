# Hướng dẫn triển khai Tiên Giới (Production)

Tài liệu này hướng dẫn cài đặt và vận hành máy chủ Tiên Giới trên môi trường thực tế (production).

---

## 1. Yêu cầu hệ thống

- **Hệ điều hành:** Linux (Ubuntu 22.04 LTS / Debian 12 khuyến nghị) hoặc macOS.
- **Node.js:** Phiên bản 22.x LTS (xem file [.nvmrc](file:///.nvmrc)).
- **Công cụ:** `tar` (sao lưu dữ liệu), `npm`.
- **Cổng mạng:** Cổng HTTP/WebSocket của game server (mặc định production: `2567`).

---

## 2. Triển khai trực tiếp (không dùng Docker)

### Bước 1: Cài đặt mã nguồn và thư viện
```bash
git clone https://github.com/nguyencong1227/tien-gioi.git
cd tien-gioi
npm ci
```

### Bước 2: Build client
Client Phaser được đóng gói vào thư mục `client/dist`. Server Express sẽ tự động phục vụ các file tĩnh này khi phát hiện `client/dist` tồn tại:
```bash
npm run build
```

### Bước 3: Chạy server production
> **Lưu ý về cấu hình:** File `.env.local` chỉ dùng khi phát triển trên máy dev (để chia cổng riêng cho Dev A, B, C) và **không** được commit. Trên production, cấu hình hoàn toàn qua **biến môi trường**:

| Biến môi trường | Ý nghĩa | Mặc định |
|---|---|---|
| `NODE_ENV` | Môi trường chạy | `production` |
| `PORT` | Cổng HTTP / WebSocket mà server lắng nghe | `2567` |
| `DATA_DIR` | Thư mục lưu trữ dữ liệu nhân vật (`*.json`) | `server/data/players` |

Chạy ứng dụng:
```bash
export NODE_ENV=production
export PORT=2567
export DATA_DIR=/var/lib/tien-gioi/players

npm start
```
*(Khuyến nghị dùng `systemd` hoặc `pm2` để quản lý tiến trình nền và tự khởi động lại khi gặp sự cố).*

---

## 3. Reverse Proxy & HTTPS (Khuyến nghị Caddy)

### Vì sao bắt buộc cần HTTPS?
1. **PWA (Progressive Web App):** Service Worker ([client/public/sw.js](file:///client/public/sw.js)) và Web App Manifest chỉ hoạt động trên kết nối an toàn `https://` (hoặc `localhost`).
2. **WebSocket bảo mật (`wss://`):** Tránh bị nhà mạng hoặc firewall chặn kết nối WebSocket không mã hoá (`ws://`).

### Cấu hình bằng Caddy (Tự động cấp chứng chỉ SSL Let's Encrypt)
Caddy tự động xử lý WebSocket proxy và HTTP/2. Tạo file `Caddyfile`:

```caddy
tiengioi.example.com {
    reverse_proxy localhost:2567
}
```

Chạy Caddy:
```bash
caddy run --config Caddyfile
```

---

## 4. Kiểm tra sức khoẻ (Health Check) & Giám sát

Server cung cấp endpoint kiểm tra tình trạng hoạt động tại `/health`:
```bash
curl -f http://localhost:2567/health
# Trả về: {"ok":true} với HTTP status 200
```
Có thể dùng endpoint này cho Uptime Kuma, AWS Target Group Health Check, hoặc Docker `HEALTHCHECK`.

---

## 5. Tắt máy an toàn (Graceful Shutdown)

Khi cập nhật phiên bản hoặc khởi động lại máy chủ, gửi tín hiệu `SIGTERM` hoặc `SIGINT` đến tiến trình Node.js:
```bash
kill -TERM <server_pid>
```
Tiến trình sẽ đóng nhận kết nối mới, lưu toàn bộ trạng thái nhân vật còn trong phòng chơi xuống đĩa cứng (`DATA_DIR`), ngắt kết nối client với mã phòng hợp lệ, rồi mới thoát hoàn toàn.

---

## 6. Sao lưu & Khôi phục dữ liệu nhân vật

### 6.1. Dữ liệu cần bảo vệ (`DATA_DIR`)
Thư mục `DATA_DIR` (mặc định `server/data/players`) lưu trữ toàn bộ hồ sơ nhân vật dạng JSON (`<sha1_hash>.json`), bao gồm:
- Cảnh giới, tu vi, vị trí toạ độ.
- Túi đồ, trang bị đang mặc.
- Tiến độ nhiệm vụ (sổ nhiệm vụ, nhiệm vụ hàng ngày).

### 6.2. Tạo bản sao lưu (`npm run backup`)
Tiên Giới có sẵn kịch bản sao lưu nén bằng `tar` và tự động dọn dẹp các bản cũ:
```bash
# Nén dữ liệu vào thư mục backups/ (mặc định giữ 14 bản mới nhất)
npm run backup -w server

# Tuỳ chỉnh số bản giữ lại hoặc chỉ định thư mục:
npm run backup -w server -- --keep=30 --dir=/var/lib/tien-gioi/players --out=/mnt/backups
```

File nén được tạo theo định dạng: `backups/players-YYYYMMDD-HHMMSS.tar.gz`.

**Thiết lập Cron tự động sao lưu hàng ngày (03:00 sáng):**
```cron
0 3 * * * cd /opt/tien-gioi && npm run backup -w server >> /var/log/tien-gioi-backup.log 2>&1
```

### 6.3. Khôi phục dữ liệu từ bản sao lưu
Khi cần khôi phục lại dữ liệu nhân vật:
1. Dừng tiến trình server:
   ```bash
   kill -TERM <server_pid>
   ```
2. Giải nén bản sao lưu vào thư mục `DATA_DIR`:
   ```bash
   # Giả sử DATA_DIR là server/data/players
   tar -xzf backups/players-20261110-020000.tar.gz -C server/data/
   ```
3. Khởi động lại server:
   ```bash
   npm start
   ```
