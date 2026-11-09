# Hướng dẫn triển khai Tiên Giới (Production)

Tài liệu này hướng dẫn cài đặt và vận hành máy chủ Tiên Giới trên môi trường thực tế (production).

---

## 1. Yêu cầu hệ thống

- **Hệ điều hành:** Linux (Ubuntu 22.04 LTS / Debian 12 khuyến nghị) hoặc macOS.
- **Node.js:** Phiên bản 22.x LTS (xem file [.nvmrc](../.nvmrc)).
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

| Biến môi trường | Ý nghĩa | Bắt buộc / Mặc định |
|---|---|---|
| `NODE_ENV` | Môi trường chạy | **Bắt buộc: `production`** |
| `PORT` | Cổng HTTP / WebSocket mà server lắng nghe | Mặc định: `2567` |
| `DATA_DIR` | Thư mục lưu trữ dữ liệu nhân vật (`*.json`) | Mặc định: `server/data/players` |

> [!CAUTION]
> **Bắt buộc phải đặt `NODE_ENV=production` khi mở cho người chơi thật:**
> Lệnh chat quản trị `/give` (tự cấp mọi loại đan dược, vũ khí, pháp bảo thử nghiệm) chỉ bị vô hiệu hoá khi `NODE_ENV === "production"` đúng chữ (`server/src/systems/inventory.ts`). Nếu quên đặt biến này, bất kỳ người chơi nào cũng có thể gõ `/give` để tự nhận vật phẩm cấp cao.

Chạy ứng dụng:
```bash
export NODE_ENV=production
export PORT=2567
export DATA_DIR=/var/lib/tien-gioi/players

npm start
```
*(Khuyến nghị dùng `systemd` hoặc `pm2` để quản lý tiến trình nền và tự khởi động lại khi gặp sự cố).*

---

## 3. Triển khai bằng Docker & Docker Compose (Khuyến nghị cho Production)

Dự án cung cấp sẵn `Dockerfile` đa tầng (multi-stage build) và `docker-compose.yml` tối ưu hoá cho môi trường production:
- Chạy với tài khoản non-root `node` (bảo mật).
- Tích hợp sẵn `HEALTHCHECK` kiểm tra `/health` định kỳ 30 giây.
- Dùng `init: true` (tini) và `stop_grace_period: 30s` để đảm bảo tín hiệu tắt máy `SIGTERM` được chuyển tiếp đầy đủ và server có đủ thời gian lưu toàn bộ dữ liệu nhân vật xuống đĩa.

### Bước 1: Khởi động container
```bash
# Xây dựng image và chạy container ở chế độ nền:
docker compose up -d --build
```

### Bước 2: Kiểm tra trạng thái
```bash
docker compose ps
# Kiểm tra log nếu cần:
docker compose logs -f
```

### Bước 3: Sao lưu và khôi phục dữ liệu từ Docker Volume
Dữ liệu nhân vật được lưu tại Docker named volume `tien-gioi-data` (gắn vào `/app/data/players`).

**Tạo bản sao lưu từ volume:**
```bash
docker run --rm -v tien-gioi-data:/data -v "$PWD":/out busybox tar czf /out/players-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

**Khôi phục dữ liệu vào volume:**
```bash
# 1. Dừng container game trước khi khôi phục:
docker compose stop

# 2. Giải nén bản sao lưu vào volume:
docker run --rm -v tien-gioi-data:/data -v "$PWD":/backup busybox sh -c "tar xzf /backup/players-*.tar.gz -C /data"

# 3. Khởi động lại container game:
docker compose start
```

> [!NOTE]
> Nếu chạy trực tiếp bằng lệnh `docker run`, hãy luôn kèm cờ `--init` và `--stop-timeout 30`:
> ```bash
> docker run -d --name tien-gioi --init --stop-timeout 30 -p 127.0.0.1:2567:2567 -v tien-gioi-data:/app/data/players tien-gioi
> ```

---

## 4. Reverse Proxy & HTTPS (Khuyến nghị Caddy)

### Vì sao bắt buộc cần HTTPS?
1. **PWA (Progressive Web App):** Service Worker ([client/public/sw.js](../client/public/sw.js)) và Web App Manifest chỉ hoạt động trên kết nối an toàn `https://` (hoặc `localhost`).
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

## 5. Kiểm tra sức khoẻ (Health Check) & Giám sát

Server cung cấp endpoint kiểm tra tình trạng hoạt động tại `/health`:
```bash
curl -f http://localhost:2567/health
# Trả về: {"ok":true} với HTTP status 200
```
Có thể dùng endpoint này cho Uptime Kuma, AWS Target Group Health Check, hoặc Docker `HEALTHCHECK`.

---

## 6. Tắt máy an toàn (Graceful Shutdown)

Khi cập nhật phiên bản hoặc khởi động lại máy chủ, gửi tín hiệu `SIGTERM` hoặc `SIGINT` đến tiến trình Node.js:
```bash
kill -TERM <server_pid>
```
Tiến trình sẽ đóng nhận kết nối mới, lưu toàn bộ trạng thái nhân vật còn trong phòng chơi xuống đĩa cứng (`DATA_DIR`), ngắt kết nối client với mã phòng hợp lệ, rồi mới thoát hoàn toàn.

---

## 7. Sao lưu & Khôi phục dữ liệu nhân vật

### 6.1. Dữ liệu cần bảo vệ (`DATA_DIR`)
Thư mục `DATA_DIR` (mặc định `server/data/players`) lưu trữ toàn bộ hồ sơ nhân vật dạng JSON (`<sha1_hash>.json`), bao gồm:
- Cảnh giới, tu vi, vị trí toạ độ.
- Túi đồ, trang bị đang mặc.
- Tiến độ nhiệm vụ (sổ nhiệm vụ, nhiệm vụ hàng ngày).

### 6.2. Tạo bản sao lưu (`npm run backup`)
Tiên Giới có sẵn kịch bản sao lưu nén bằng `tar` và tự động dọn dẹp các bản cũ theo chính sách giữ lại `keep` bản mới nhất:
```bash
# Nén dữ liệu vào thư mục backups/ (mặc định giữ 14 bản mới nhất)
npm run backup -w server

# Tuỳ chỉnh số bản giữ lại hoặc chỉ định thư mục:
npm run backup -w server -- --keep=30 --dir=/var/lib/tien-gioi/players --out=/mnt/backups
```

File nén được tạo theo định dạng: `backups/players-YYYYMMDD-HHMMSS.tar.gz`.

> [!NOTE]
> **Sao lưu an toàn khi server đang chạy:**
> Tiến trình server ghi dữ liệu nhân vật theo cơ chế **nguyên tử** (`writeFile` vào file tạm `.json.tmp` rồi mới đổi tên `rename` đè lên file `.json` trong `server/src/store.ts`). Vì vậy lệnh `tar` không bao giờ gặp tình trạng file bị cắt ngang hay đọc dở dang, có thể sao lưu định kỳ mà không cần dừng máy chủ. Nếu file `.json.tmp` có bị nén vào bản sao lưu thì cũng hoàn toàn vô hại vì server chỉ nạp các file kết thúc bằng `.json`.

**Thiết lập Cron tự động sao lưu hàng ngày (03:00 sáng):**
> [!IMPORTANT]
> Luôn truyền biến môi trường `DATA_DIR` hoặc cờ `--dir=` chỉ đúng vào thư mục dữ liệu thật của server production. Nếu thư mục không tồn tại, script sẽ lập tức báo lỗi và dừng (không tạo file rỗng).

```cron
# Chú ý: trỏ đúng DATA_DIR nơi server đang lưu dữ liệu
0 3 * * * cd /opt/tien-gioi && DATA_DIR=/var/lib/tien-gioi/players npm run backup -w server -- --out=/mnt/backups >> /var/log/tien-gioi-backup.log 2>&1
```

*Sau khi thiết lập cron hoặc chạy lần đầu, hãy kiểm tra danh sách file bên trong bản nén bằng lệnh:*
```bash
tar -tzf /mnt/backups/players-*.tar.gz | head -n 10
```

### 6.3. Khôi phục dữ liệu từ bản sao lưu
Khi cần khôi phục lại dữ liệu nhân vật:
1. Dừng tiến trình server:
   ```bash
   kill -TERM <server_pid>
   ```
2. Đổi tên thư mục dữ liệu hiện tại để dự phòng (tránh giải nén chồng đè khiến file rác cũ vẫn sót lại):
   ```bash
   mv /var/lib/tien-gioi/players /var/lib/tien-gioi/players.cu
   ```
3. Giải nén bản sao lưu vào thư mục cha:
   ```bash
   # Bản sao lưu chứa thư mục 'players/', nên giải nén vào thư mục cha /var/lib/tien-gioi/
   tar -xzf /mnt/backups/players-20261110-020000.tar.gz -C /var/lib/tien-gioi/
   ```
4. Kiểm tra danh sách file sau khi giải nén:
   ```bash
   ls -la /var/lib/tien-gioi/players/
   ```
5. Khởi động lại server:
   ```bash
   npm start
   ```
6. Sau khi xác nhận mọi nhân vật đăng nhập bình thường, có thể xoá thư mục dự phòng `players.cu`.
