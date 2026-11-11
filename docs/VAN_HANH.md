# Sổ tay Vận hành Bản chạy thật Tiên Giới (Ops Runbook)

Tài liệu hướng dẫn quản trị và vận hành bản chạy thật (Production) của game Tiên Giới tại `~/TT/tien-gioi-prod/` (M4 3.6, Issue #299). Mọi thao tác đều có thể dán lệnh chạy trực tiếp từ terminal.

---

## 1. Sơ đồ Kiến trúc & Luồng Dữ liệu

```
Người chơi trên Internet (Trình duyệt web / PWA / Android)
       │
       ▼  HTTPS / WSS (Cổng 443, SSL/TLS tự động)
┌────────────────────────────────────────────────────────┐
│ Cloudflare Edge (Tên miền: tiengioi.hethongtm.site)   │
│ - Tự động nén Brotli / Gzip                            │
│ - Bảo vệ chống DDoS Lớp 7                              │
│ - Nối IP thật của người chơi vào cuối X-Forwarded-For  │
└──────────────────────────┬─────────────────────────────┘
                           │ Đường hầm mã hoá an toàn (Cloudflare Tunnel)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Máy chủ nội bộ (Ubuntu 24.04 LTS)                     │
│                                                        │
│ 1. Dịch vụ systemd người dùng:                          │
│    cloudflared-tiengioi.service (KHÔNG SỬA / KHÔNG TẮT)│
│    Chuyển tiếp lưu lượng tới HTTP 127.0.0.1:2567       │
│                                                        │
│ 2. Thư mục vận hành riêng: ~/TT/tien-gioi-prod/       │
│    - Dịch vụ game (Container tien-gioi):               │
│      * Cổng: 127.0.0.1:2567:2567 (Chỉ loopback)        │
│      * Biến: NODE_ENV=production, STORE=pg             │
│      * TRUST_PROXY=1, TIEN_GIOI_PROD=1                 │
│      * Dừng êm ái: stop_grace_period 30s               │
│    - Dịch vụ db (Container tien-gioi-db):              │
│      * PostgreSQL 16, dữ liệu tại ./data/pg     │
│      * KHÔNG mở cổng ra ngoài host / Internet          │
│                                                        │
│ 3. Bản sao lưu tự động (backups/):                     │
│    - tien-gioi-backup.timer (Chạy lúc 04:00 hàng ngày) │
│    - tien-gioi-restore-test.timer (CN 05:00, khôi phục │
│      thử bản mới nhất vào container tạm)               │
└────────────────────────────────────────────────────────┘
```

---

## 2. Thư mục Vận hành `~/TT/tien-gioi-prod/`

Bản chạy thật hoàn toàn tách biệt với thư mục phát triển của các dev (`tien-gioi-a`, `tien-gioi-b`, `tien-gioi-c`). Thư mục `~/TT/tien-gioi-prod/` chứa:

| Tệp / Thư mục | Quyền | Mục đích |
|---|---|---|
| `docker-compose.yml` | `644` | Khai báo dịch vụ `db` (PostgreSQL 16) và `game` (ghcr.io) |
| `prod.sh`, `restore-test.sh` | `755` | Bản chép của `deploy/prod.sh` và `deploy/restore-test.sh` do `init` đặt vào đây (bộ hẹn giờ systemd gọi các bản này) |
| `.env.production` | `600` | Bí mật vận hành: `POSTGRES_PASSWORD`, `DATABASE_URL`, `METRICS_TOKEN`, `TIEN_GIOI_TAG` |
| `.current-tag` | `644` | Thẻ phiên bản đang chạy (vd: `0.1.0`) |
| `.last-tag` | `644` | Thẻ phiên bản chạy trước đó (dùng khi cần `rollback`) |
| `data/pg/` | `700` | Dữ liệu gốc của PostgreSQL (bind-mount vào container db) |
| `backups/` | `700` | Chứa tối đa 14 bản sao lưu nén `tiengioi-YYYYmmdd-HHMMSS.sql.gz` |
| `backups/restore-test.log` | `644` | Nhật ký các lần khôi phục thử nghiệm định kỳ |
| `backups/LAST_RESTORE_OK` | `644` | Mốc thời gian ISO của lần khôi phục thử thành công gần nhất |

> [!CAUTION]
> Tuyệt đối **KHÔNG COMMIT** hoặc chia sẻ tệp `.env.production`. Mật khẩu và token phải được bảo vệ nghiêm ngặt.

---

## 3. Quản trị Bản chạy thật với `prod.sh`

Mọi thao tác hàng ngày được thực hiện thông qua script `deploy/prod.sh` (hoặc bản chép tại `~/TT/tien-gioi-prod/prod.sh`). Cập nhật script trong repo thì chạy lại `./deploy/prod.sh init` để chép bản mới (giữ nguyên bí mật cũ).

### 3.1. Khởi tạo ban đầu (chỉ chạy 1 lần)
```bash
./deploy/prod.sh init
```
- Tạo cấu trúc thư mục tại `~/TT/tien-gioi-prod/`, chép `docker-compose.yml`, `prod.sh`, `restore-test.sh` vào đó.
- Tự động sinh `POSTGRES_PASSWORD` và `METRICS_TOKEN` ngẫu nhiên bảo mật cao bằng `openssl rand -hex 24`.
- Phân quyền `chmod 600` cho `.env.production`.

### 3.2. Cập nhật / Triển khai phiên bản mới
Script nhận cả dạng `vX.Y.Z` hoặc `X.Y.Z` và tự chuẩn hoá bỏ tiền tố `v`:
```bash
./deploy/prod.sh up v0.1.0
# hoặc:
./deploy/prod.sh up 0.1.0
```
Lệnh sẽ tự động:
1. Kéo ảnh từ GitHub Container Registry: `ghcr.io/nguyencong1227/tien-gioi:<tag>` (cần đã `docker login ghcr.io`). **Kéo hỏng thì dừng ở đây, không đổi gì**: bản đang chạy, `.env.production`, `.current-tag`, `.last-tag` giữ nguyên.
2. Ghi nhận phiên bản hiện tại vào `.last-tag`.
3. Cập nhật `TIEN_GIOI_TAG` trong `.env.production` và `.current-tag`.
4. Khởi động lại dịch vụ với `docker compose up -d --remove-orphans`.

Mọi lệnh `docker compose` của script đều truyền `--env-file .env.production` (compose không tự đọc tệp này để nội suy `${POSTGRES_PASSWORD}` / `${TIEN_GIOI_TAG}`). Chạy `docker compose` tay trong thư mục chạy thật thì phải thêm cờ này.

### 3.3. Kiểm tra trạng thái & Nhật ký (Logs)
```bash
# Xem trạng thái containers và phiên bản đang chạy
./deploy/prod.sh status

# Xem log thời gian thực của game
./deploy/prod.sh logs -f game

# Xem log của cơ sở dữ liệu
./deploy/prod.sh logs -f db
```

### 3.4. Kiểm tra sức khoẻ sau cập nhật (Smoke Test)
Sau mỗi lần cập nhật, luôn chạy lệnh kiểm tra nhanh:
```bash
./deploy/prod.sh smoke
```
> [!NOTE]
> Bước 3 của `smoke` **dừng rồi bật lại container game** (người chơi đang nối bị rớt vài giây rồi tự nối lại). Game luôn được bật lại trước khi `smoke` kết luận, kể cả khi bước tắt êm đỏ. Chạy lúc ít người chơi.
Lệnh kiểm tra toàn diện 4 bước:
1. Endpoint `http://127.0.0.1:2567/health` trả về HTTP 200 kèm `{"ok":true,"authMode":"account"}`.
2. Endpoint `/metrics` từ chối truy cập ẩn danh (HTTP 401) và chấp nhận truy cập kèm `Authorization: Bearer <METRICS_TOKEN>` (HTTP 200).
3. **Tắt êm ái (Graceful Shutdown):** `docker stop -t 30 tien-gioi` phải kết thúc < 25 giây với mã thoát 0 (chứng minh tiến trình server nhận được `SIGTERM`, lưu trữ trạng thái người chơi an toàn vào cơ sở dữ liệu thay vì bị ép dừng).
4. Khởi động lại dịch vụ game và xác nhận `/health` phản hồi sẵn sàng trở lại.

---

## 4. Quay lại phiên bản cũ (Rollback)

Nếu phiên bản mới gặp lỗi nghiêm trọng sau khi triển khai:
```bash
./deploy/prod.sh rollback
```
Script sẽ đọc thẻ từ `.last-tag` và kích hoạt lại phiên bản ổn định trước đó.

---

## 5. Sao lưu và Khôi phục Cơ sở dữ liệu

### 5.1. Sao lưu thủ công ngay lập tức
```bash
./deploy/prod.sh backup
```
- Bản sao lưu là `pg_dump --clean --if-exists --no-owner` nén `gzip`, lưu tại `~/TT/tien-gioi-prod/backups/tiengioi-YYYYmmdd-HHMMSS.sql.gz`. Ghi ra tệp `.partial` rồi mới đổi tên sau khi `gzip -t` đạt: sao lưu lỗi giữa chừng không để lại tệp hỏng.
- Script tự động giữ lại **14 bản mới nhất** và dọn dẹp các bản cũ hơn.
- Tự động cảnh báo nếu dung lượng đĩa khả dụng của máy chủ còn dưới 3 GB.

### 5.2. Khôi phục từ tệp sao lưu
```bash
# Cú pháp: ./deploy/prod.sh restore <đường-dẫn-tệp> [--yes]
./deploy/prod.sh restore ~/TT/tien-gioi-prod/backups/tiengioi-20261111-040000.sql.gz
```
> [!WARNING]
> Thao tác khôi phục sẽ ghi đè toàn bộ dữ liệu hiện tại trong cơ sở dữ liệu! Script sẽ yêu cầu gõ `dong y` để xác nhận (trừ khi có cờ `--yes`).

Thứ tự: kiểm `gzip -t` -> **dừng game** -> nạp bằng `psql -v ON_ERROR_STOP=1 --single-transaction` -> bật lại game. Tệp hỏng / cụt thì giao dịch bị HOÀN TÁC, cơ sở dữ liệu giữ nguyên như trước (game vẫn được bật lại và script báo lỗi). Dữ liệu ghi SAU thời điểm sao lưu bị mất: đó là bản chất của khôi phục, hãy chọn đúng tệp.

### 5.3. Cài đặt lịch sao lưu tự động hàng ngày (Systemd Timer)
Để máy chủ tự động sao lưu lúc 04:00 sáng hàng ngày:
```bash
mkdir -p ~/.config/systemd/user
cp deploy/tien-gioi-backup.service ~/.config/systemd/user/
cp deploy/tien-gioi-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now tien-gioi-backup.timer
```
Kiểm tra lịch hẹn giờ:
```bash
systemctl --user list-timers | grep tien-gioi
```

Cài thêm bộ hẹn giờ kiểm tra khôi phục hằng tuần (Chủ nhật 05:00, sau bản sao lưu 04:00):
```bash
cp deploy/tien-gioi-restore-test.service deploy/tien-gioi-restore-test.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now tien-gioi-restore-test.timer
```

### 5.4. Kiểm tra khôi phục định kỳ (restore-test.sh)
Chạy tay (hoặc để bộ hẹn giờ ở 5.3 chạy):
```bash
~/TT/tien-gioi-prod/restore-test.sh
```
Script sẽ:
1. Kiểm `gzip -t` bản sao lưu mới nhất, dựng container tạm `tien-gioi-restore-test-db` (postgres:16, không mở cổng).
2. Nạp bản sao lưu vào bằng `ON_ERROR_STOP=1 --single-transaction`.
3. Đếm số hàng của MỌI bảng game: `schema_migrations`, `accounts`, `sessions`, `characters`, `souls`, `sects`, `sect_members` (test tĩnh giữ danh sách này khớp `server/migrations/*.sql`). Bảng thiếu hoặc truy vấn lỗi = script thoát khác 0.
4. Chỉ khi mọi bước đạt: ghi kết quả vào `backups/restore-test.log` và cập nhật mốc `backups/LAST_RESTORE_OK`.
5. Dọn dẹp và xoá container tạm (kể cả khi lỗi).

Kiểm tra mốc: `cat ~/TT/tien-gioi-prod/backups/LAST_RESTORE_OK` (nếu cũ hơn ~8 ngày thì bộ hẹn giờ không chạy hoặc đang đỏ: xem `journalctl --user -u tien-gioi-restore-test`).

---

## 6. Đọc Số đo Giám sát (/metrics) An toàn

Endpoint `/metrics` yêu cầu xác thực bằng `METRICS_TOKEN` (M4 3.3, Issue #276).
Để đọc số đo mà **không in lộ bí mật ra terminal hay lịch sử bash**:

```bash
# Đọc số đo Prometheus an toàn:
(
  set -a
  source ~/TT/tien-gioi-prod/.env.production
  curl -sS -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:2567/metrics
)

# Đọc số đo định dạng JSON (dễ parse bằng jq):
(
  set -a
  source ~/TT/tien-gioi-prod/.env.production
  curl -sS -H "Authorization: Bearer $METRICS_TOKEN" "http://127.0.0.1:2567/metrics?format=json" | jq .
)
```

---

## 7. Xử lý Sự cố Vận hành (Troubleshooting / Runbook)

### 7.1. Khi người chơi không vào được trang web (`tiengioi.hethongtm.site`)
1. **Kiểm tra Cloudflare Tunnel**:
   ```bash
   systemctl --user status cloudflared-tiengioi.service
   ```
   Nếu bị tắt: nhờ người dùng bật lại (agent không tự khởi động lại cloudflared).
2. **Kiểm tra game server nội bộ**:
   ```bash
   curl -sI http://127.0.0.1:2567/health
   ```
   Nếu không phản hồi: kiểm tra container game `docker compose ps` và `prod.sh logs -f game`.

### 7.2. Khi container Game liên tục khởi động lại (CrashLoop)
1. Kiểm tra log lỗi:
   ```bash
   ./deploy/prod.sh logs --tail=100 game
   ```
2. Các nguyên nhân thường gặp:
   - Cơ sở dữ liệu chưa sẵn sàng hoặc sai mật khẩu: kiểm tra `DATABASE_URL` trong `.env.production`.
   - Cổng 2567 bị chiếm bởi tiến trình lạ: chạy `ss -tulpn | grep 2567` (cổng 2567 chỉ dành riêng cho bản chạy thật).
   - Thiếu biến môi trường `TIEN_GIOI_PROD=1`.

### 7.3. Khi ổ đĩa đầy (Disk Full)
Kiểm tra dung lượng ổ đĩa:
```bash
df -h /
```
Nếu dung lượng còn dưới 2 GB:
1. Dọn dẹp ảnh Docker cũ không dùng:
   ```bash
   docker image prune -f
   ```
2. Dọn bớt các bản sao lưu cũ trong `~/TT/tien-gioi-prod/backups/`.
3. Kiểm tra log Docker: `docker system df`.
