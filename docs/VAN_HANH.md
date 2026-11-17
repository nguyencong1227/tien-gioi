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
| `.env.production` | `600` | Bí mật vận hành: `POSTGRES_PASSWORD`, `DATABASE_URL`, `METRICS_TOKEN`, `TIEN_GIOI_TAG`, `CORS_ORIGINS=https://localhost` (cho app Android) |
| `.current-tag` | `644` | Thẻ phiên bản đang chạy (vd: `0.1.0`) |
| `.last-tag` | `644` | Thẻ phiên bản chạy trước đó (dùng khi cần `rollback`) |
| `data/pg/` | `700` | Dữ liệu gốc của PostgreSQL (bind-mount vào container db) |
| `backups/` | `700` | Chứa tối đa 14 bản sao lưu nén `tiengioi-YYYYmmdd-HHMMSS.sql.gz` |
| `backups/restore-test.log` | `644` | Nhật ký các lần khôi phục thử nghiệm định kỳ |
| `backups/LAST_RESTORE_OK` | `644` | Mốc thời gian ISO của lần khôi phục thử thành công gần nhất |
| `audit-xoa-tai-khoan.log` | `600` | Nhật ký kiểm toán lưu vết các lần xoá tài khoản (`account.deleted`) |

> [!CAUTION]
> Tuyệt đối **KHÔNG COMMIT** hoặc chia sẻ tệp `.env.production`. Mật khẩu và token phải được bảo vệ nghiêm ngặt.

---

## 3. Quản trị Bản chạy thật với `prod.sh`

Mọi thao tác hàng ngày được thực hiện thông qua script `deploy/prod.sh` (hoặc bản chép tại `~/TT/tien-gioi-prod/prod.sh`). Cập nhật script trong repo thì chạy lại `./deploy/prod.sh init` để chép bản mới (giữ nguyên bí mật cũ).

| Lệnh | Tác động người chơi | Mục đích |
|---|---|---|
| `./deploy/prod.sh init` | Không (chỉ đọc/tạo thiếu) | Khởi tạo thư mục chạy thật, chép `docker-compose.yml` / `prod.sh` / `restore-test.sh`, sinh bí mật nếu chưa có |
| `./deploy/prod.sh up <thẻ>` | Có (khởi động lại game) | Kéo ảnh GHCR, ghi nhận `.last-tag` / `.current-tag` và khởi chạy phiên bản mới |
| `./deploy/prod.sh check` | **Không (chỉ đọc)** | Kiểm tra sau triển khai: `docker ps` health (db + game), `/health` (giao thức), `/metrics` (401/200), log 3 phút (`TEST_EXP_MULT`, `BOSS_MOVES`, `[CẢNH BÁO]`, lỗi) |
| `./deploy/prod.sh status` | Không (chỉ đọc) | Xem trạng thái các container và phiên bản đang chạy |
| `./deploy/prod.sh logs [args]` | Không (chỉ đọc) | Xem nhật ký container (vd: `logs -f game`, `logs --since 3m game`) |
| `./deploy/prod.sh backup` | Không | Sao lưu PostgreSQL ra `backups/tiengioi-YYYYmmdd-HHMMSS.sql.gz` (giữ 14 bản mới nhất) |
| `./deploy/prod.sh restore <tệp>` | Có (dừng game lúc nạp) | Khôi phục cơ sở dữ liệu từ tệp sao lưu |
| `./deploy/prod.sh rollback` | Có (khởi động lại game) | Quay lại phiên bản ổn định trước đó trong `.last-tag` |
| `./deploy/prod.sh smoke` | **Có (dừng/bật lại game)** | Kiểm tra khói kèm bài thử tắt êm `docker stop < 25s` (chỉ chạy khi vắng người chơi) |
| `./deploy/prod.sh stop` | Có (dừng hẳn dịch vụ) | Dừng toàn bộ dịch vụ (`docker compose down`) |
| `./deploy/prod.sh xoa-tai-khoan` | Không (dry-run) / Có (`--yes`) | Kiểm tra hoặc xoá vĩnh viễn dữ liệu tài khoản theo yêu cầu người chơi |

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

### 3.4. Kiểm tra sức khoẻ sau cập nhật (`check` và `smoke`)

#### A. Kiểm tra sau triển khai KHÔNG làm gián đoạn người chơi (`check` — khuyên dùng sau mọi lần `up`)
Ngay sau mỗi lần `./deploy/prod.sh up <thẻ>`, chạy lệnh kiểm tra **chỉ đọc** (không dừng hay khởi động lại container):
```bash
./deploy/prod.sh check
```
Lệnh thực hiện 5 bước kiểm tra an toàn:
1. **`docker ps` health (`db` + `game`):** Xác nhận cả hai container `tien-gioi-db` và `tien-gioi` đang `Up` và `healthy`.
2. **Endpoint `/health`:** Kiểm tra HTTP 200 kèm `"ok":true`, `"authMode":"account"`, và đối chiếu `protocol` / `minProtocol` với `shared/src/protocol.ts` (hoặc `MIN_PROTOCOL_VERSION` trong `.env.production`).
3. **Endpoint `/metrics`:** Xác nhận truy cập ẩn danh bị từ chối (HTTP 401) và truy cập kèm `METRICS_TOKEN` thành công (HTTP 200, tuyệt đối không in lộ token).
4. **Phân tích nhật ký 3 phút gần nhất (`--since 3m`):** In ra các dòng cờ cấu hình quan trọng nếu có (`TEST_EXP_MULT`, `BOSS_MOVES`, cảnh báo `[CẢNH BÁO]`) và đếm số dòng lỗi (`error` / `lỗi` / `exception` / `unhandled`).
5. **Kết luận bằng mã thoát:**
   - `ĐẠT` (mã thoát `0`): Mọi mục xanh, 0 lỗi, 0 cảnh báo.
   - `CÓ CẢNH BÁO` (mã thoát `2`): Không có lỗi thất bại nhưng có cảnh báo (vd: dòng `[CẢNH BÁO]` trong log hoặc healthcheck đang `starting`).
   - `THẤT BẠI` (mã thoát `1`): Container ngừng chạy / `unhealthy`, `/health` hoặc `/metrics` lỗi, lệch `protocol`, hoặc có dòng lỗi trong nhật ký.

#### B. Kiểm tra khói kèm bài thử tắt êm (`smoke` — chỉ chạy khi vắng người chơi)
Khi cần kiểm chứng thêm cơ chế tắt êm (`SIGTERM` < 25s):
```bash
./deploy/prod.sh smoke
```
> [!WARNING]
> Bước 3 của `smoke` **dừng rồi bật lại container game** (`docker stop -t 30 tien-gioi`), làm người chơi đang kết nối bị rớt vài giây rồi tự nối lại. Không chạy `smoke` ngay sau khi vừa `up` nếu đang có người chơi; hãy dùng `./deploy/prod.sh check`.
Lệnh `smoke` kiểm tra 4 bước:
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

### 6.1. Ý nghĩa các Số đo và Cảnh báo Giám sát (/metrics)

Hệ thống giám sát vận hành thu thập số đo từ mọi phòng thế giới Colyseus, hàng đợi ghi cơ sở dữ liệu và tài nguyên hệ thống (M4 3.3, M7.10, Issue #276):

| Số đo (Prometheus Metric) | Kiểu | Ý nghĩa & Ngưỡng cảnh báo |
|---|:---:|---|
| `tiengioi_uptime_seconds` | Gauge | Thời gian tiến trình máy chủ game đã hoạt động liên tục (giây) |
| `tiengioi_store_info{kind="..."}` | Gauge | Backend lưu trữ đang kích hoạt (`pg` cho cơ sở dữ liệu hoặc `file`) |
| `tiengioi_process_rss_bytes` | Gauge | Dung lượng RAM thực tế (Resident Set Size) tiến trình đang chiếm dụng |
| `tiengioi_process_heap_used_bytes` | Gauge | Dung lượng heap V8 đang dùng |
| `tiengioi_event_loop_lag_p99_ms` | Gauge | Độ trễ p99 của vòng lặp sự kiện Node.js trong 10 giây qua. Cảnh báo nghẽn khi `> 100 ms` |
| `tiengioi_players_online` | Gauge | Tổng số người chơi trực tuyến trên toàn bộ máy chủ (bao gồm cả nhân vật đang chờ nối lại) |
| `tiengioi_rooms` | Gauge | Tổng số phòng đang hoạt động (phòng bản đồ thế giới và phòng bí cảnh tạm) |
| `tiengioi_room_players{room, map}` | Gauge | Số người chơi đang có mặt trong từng phòng/bản đồ cụ thể (`lac_ha`, `hac_phong`, `am_suong`, `han_van`) |
| `tiengioi_room_ghosts{room, map}` | Gauge | Số nhân vật đang chờ nối lại (`ghosts`) trong phòng (chờ tối đa 20s khi rớt mạng bất thường) |
| `tiengioi_room_monsters{room, map}` | Gauge | Số lượng quái vật hiện hữu trong phòng |
| `tiengioi_tick_p95_worst_ms` | Gauge | p95 thời gian xử lý tick của phòng chậm nhất (cửa sổ ~60s). Cảnh báo khi vượt `TICK_WARN_MS` (mặc định `25 ms`, nhịp chuẩn 50 ms) |
| `tiengioi_room_tick_ms{room, map, quantile}` | Gauge | Phân vị thời gian xử lý tick (`quantile="0.5"`, `"0.95"`, `"1"`) của từng phòng |
| `tiengioi_room_tick_overrun_total{room, map}` | Counter | Số tick chạy quá thời gian nhịp chuẩn (> 50 ms) từ khi phòng khởi tạo |
| `tiengioi_room_input_dropped_total{room, map}` | Counter | Số input di chuyển bị BỎ vì hàng đợi của người chơi đầy (60 input = 3 giây): mỗi lần bỏ là nhân vật bị kéo giật lùi ở client. Phải đứng yên ở 0; tăng nghĩa là mạng giữ gói rồi dồn quá 3 giây hoặc client gửi quá nhanh (mục 25, `docs/THIET_KE_DI_CHUYEN.md`) |
| `tiengioi_room_input_backlog_ticks_total{room, map}` | Counter | Số lượt (người chơi x tick) mà hàng đợi input còn từ 6 input trở lên SAU khi xử lý (máy chủ tụt hậu từ 0,3 giây so với client). Bình thường gần như đứng yên; tăng đều là máy chủ xử lý chậm hơn client gửi (nhịp tick) hoặc mạng dồn gói |
| `tiengioi_room_net_silent_total{room, map}` | Counter | Số lần người chơi (client có khai nhịp) IM LẶNG quá 3 giây và thành "hồn lìa xác" dù socket còn mở (mạng đứng, tab nền, hoặc CỐ Ý ngắt gói để thoát trận). Tăng dồn dập ở MỘT người thì xem nhật ký kiểm toán `net.silent` (`docs/THIET_KE_MAT_KET_NOI.md` mục 7) |
| `tiengioi_room_net_spared_total{room, map}` | Counter | Số lần THA CHẾT do mạng (bị hạ khi client đã im lặng từ 2 giây: không Hoàng Tuyền, không mất kiếp). Nhật ký `net.spared` |
| `tiengioi_room_net_spare_denied_total{room, map}` | Counter | Số lần KHÔNG tha chết vì nhân vật đã được tha 3 lần trong 10 phút (chết thật như thường). Hiếm với mạng chập chờn thật; tăng ở MỘT người thì nghi client sửa nhịp tim (gói thưa ~2,5 giây để không bao giờ chết). Nhật ký `net.spare_denied` (`docs/THIET_KE_MAT_KET_NOI.md` mục 7) |
| `tiengioi_writes_inflight` | Gauge | Số yêu cầu ghi hồ sơ nhân vật đang xếp hàng/đang xử lý. Cảnh báo khi vượt `WRITE_WARN_PENDING` (mặc định `200`) |
| `tiengioi_writes_oldest_age_seconds` | Gauge | Thời gian chờ của yêu cầu ghi lâu nhất trong hàng đợi. Cảnh báo khi vượt `WRITE_WARN_AGE_S` (mặc định `30s`) |
| `tiengioi_writes_started_total` | Counter | Tổng số lượt ghi hồ sơ nhân vật bắt đầu thực hiện |
| `tiengioi_writes_failed_total` | Counter | Tổng số lượt ghi hồ sơ nhân vật thất bại |

**Cảnh báo tự động trong nhật ký (Logs):**
- Tiến trình tự động kiểm tra định kỳ mỗi 10 giây. Khi có chỉ số vi phạm ngưỡng (`tick`, `writes_pending`, `writes_age`, `loop_lag`), máy chủ sẽ in dòng cảnh báo với tiền tố `[CẢNH BÁO]` và nhắc lại mỗi phút cho đến khi trở lại bình thường (`[ĐÃ ỔN]`).
- Các biến môi trường tùy chỉnh ngưỡng: `TICK_WARN_MS` (mặc định 25), `WRITE_WARN_PENDING` (mặc định 200), `WRITE_WARN_AGE_S` (mặc định 30). Token giám sát `METRICS_TOKEN` bắt buộc phải có độ dài từ 16 ký tự trở lên để kích hoạt endpoint.

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

---

## 8. Xoá Dữ liệu Người chơi theo Yêu cầu (Privacy / GDPR)

Trang chính sách quyền riêng tư (`client/public/privacy.html`, #314) cam kết hỗ trợ xoá tài khoản và toàn bộ dữ liệu nhân vật theo yêu cầu của người chơi (yêu cầu bắt buộc trước khi đưa ứng dụng lên Google Play Store).

> [!CAUTION]
> **THAO TÁC KHÔNG THỂ HOÀN TÁC.**
> Trợ lý AI **tuyệt đối KHÔNG tự ý chạy công cụ này trên bản chạy thật** khi không có yêu cầu cụ thể từ người dùng. Thao tác này chỉ do Dev A hoặc Người dùng trực tiếp thực hiện.

> [!NOTE]
> Công cụ xoá (`scripts/tai-khoan.ts xoa`) nằm trong ảnh Docker từ `0.1.1` (bản chạy thật đã ở `0.1.1` từ 13/11/2026). Nhưng lệnh `xoa-tai-khoan` của `prod.sh` chỉ có trong bản `deploy/prod.sh` của repo; bản `~/TT/tien-gioi-prod/prod.sh` do `init` chép lúc dựng bản chạy thật (11/11/2026) CHƯA có. Muốn dùng: chạy `./deploy/prod.sh init` từ repo (chép lại `prod.sh` / `restore-test.sh` / compose, giữ nguyên bí mật và dữ liệu), rồi mới gọi `~/TT/tien-gioi-prod/prod.sh xoa-tai-khoan`. Đây là thay đổi cấu hình bản chạy thật nên do người vận hành quyết.

### 8.1. Quy trình thực hiện qua `prod.sh`
Toàn bộ quy trình an toàn đã được tích hợp trong lệnh `~/TT/tien-gioi-prod/prod.sh xoa-tai-khoan`:

1. **Lưu ý về các bản sao lưu cũ:**
   Các bản sao lưu nén tự động lưu trữ tại `~/TT/tien-gioi-prod/backups/` được lưu giữ tối đa 14 bản (tối đa 14 ngày). Dữ liệu tài khoản đã xoá vẫn sẽ tồn tại trong các file sao lưu lịch sử này cho đến khi các bản sao lưu bị xoay vòng và dọn dẹp hoàn toàn sau 14 ngày.

2. **Chạy thử trước (Dry-Run):**
   Luôn chạy thử trước để kiểm tra danh sách bản ghi và các ràng buộc an toàn (Tông chủ, kho Linh thạch). Chạy thử chạy trong một container dùng một lần (`compose run --no-deps`), dịch vụ game vẫn hoạt động bình thường, không gián đoạn người chơi khác:
   ```bash
   ~/TT/tien-gioi-prod/prod.sh xoa-tai-khoan <tên-đăng-nhập>
   ```
   Kết quả in ra chi tiết tài khoản, ID chân linh, hồ sơ nhân vật, phiên đăng nhập, và tông môn (sẽ giải tán hoặc gỡ khỏi danh sách) mà **không thay đổi bất kỳ dữ liệu nào** trên máy chủ.

3. **Thực hiện xoá thật (`--yes`):**
   Khi đã xác nhận đầy đủ thông tin:
   ```bash
   ~/TT/tien-gioi-prod/prod.sh xoa-tai-khoan <tên-đăng-nhập> --yes
   ```
   Lệnh sẽ tự động thực hiện quy trình bảo vệ 4 bước khép kín:
   - **Tự động sao lưu cơ sở dữ liệu** (`cmd_backup`) vào `backups/tiengioi-YYYYMMDD-HHMMSS.sql.gz` phòng hờ sự cố.
   - **Tạm dừng dịch vụ game** (`compose stop game`) để đảm bảo người chơi không thể trực tuyến trong lúc xoá, triệt tiêu nguy cơ dữ liệu nhân vật trong RAM của WorldRoom sống lại ở lần lưu định kỳ.
   - **Chạy công cụ xoá** trong container dùng một lần với cờ `--yes`:
     - Thu hồi và xoá toàn bộ phiên (`sessions`).
     - Gỡ thành viên khỏi tông môn (hoặc giải tán tông môn nếu là Tông chủ một mình và kho 0 Linh thạch).
     - Xoá hồ sơ nhân vật (`characters`).
     - Xoá chân linh (`souls`).
     - Xoá tài khoản (`accounts`), giải phóng tên đăng nhập để người khác có thể đăng ký lại.
     - Tự động ghi MỘT sự kiện kiểm toán `account.deleted` vào tệp `$PROD_DIR/audit-xoa-tai-khoan.log` (phân quyền `chmod 600`, gồm `id`, `userDigest`, `character`, `sessions`) để lưu vết vĩnh viễn.
   - **LUÔN LUÔN khởi động lại dịch vụ game** (`compose up -d game`) sau đó, bất kể lệnh xoá thành công hay gặp lỗi.

### 8.2. Các trường hợp bị từ chối an toàn
Công cụ sẽ từ chối thao tác (mã thoát `1` hoặc `2`) trong các trường hợp:
- **Tên đăng nhập không hợp lệ:** Phải khớp định dạng `^[a-z0-9_]{3,20}$` (được kiểm tra trước mọi lệnh Docker để chống chèn lệnh).
- **Tên đăng nhập không tồn tại.**
- **Dịch vụ game chưa dừng khi xoá thật:** Lệnh `xoa --yes` bắt buộc game phải dừng (trừ khi có `--force`) để ngăn chặn dữ liệu trong bộ nhớ sống lại.
- **Tài khoản đang trực tuyến:** Không xoá khi người chơi đang ở trong phòng game.
- **Tông chủ còn thành viên khác:** Phải chuyển giao chức Tông chủ cho người khác hoặc giải tán tông môn trước khi xoá tài khoản.
- **Tông môn còn Linh thạch trong kho:** Nếu Tông chủ một mình nhưng kho còn > 0 Linh thạch, phải rút hết Linh thạch ra để tránh làm mồ côi ngân sách tông môn.

---

## 9. Theo dõi Tiến độ Người chơi & Cân bằng Kim Đan (#406, M6.12)

Theo quyết định chốt trước phát hành v0.2.0 (`CAN_BANG.md` mục 10, PR #473), đội ngũ phát triển giữ nguyên thông số Xích Mãng và theo dõi tiến độ của người chơi thật qua thời gian chơi tích luỹ của kiếp (`life.playMs`).

> [!NOTE]
> `life.playMs` là thời gian chơi tích luỹ của cả kiếp hiện tại (đã bao gồm Phàm Nhân, Luyện Khí ~53 phút, Trúc Cơ ~2 giờ 52 phút, và thời gian nán lại/đả tọa). Do đó, đây là **cận trên** của thời gian cần thiết để đạt tới bậc đó.

Công cụ `server/scripts/thong-ke-tien-do.ts` (`npm run thong-ke-tien-do -w server`) tự động tính toán mô hình tối ưu `simulate(3)` từ `server/src/balance/simulate.ts` (mốc tới Kim Đan Hậu kỳ ~6.0 giờ, mốc hoàn thành Kim Đan ~8.3 giờ) và đối chiếu trung vị giờ chơi tích luỹ thực tế.

### 9.1. An toàn & Bảo mật Dữ liệu
- **Chỉ đọc trực tiếp từ tệp sao lưu:** Công cụ giải nén luồng bộ nhớ (in-memory stream) từ tệp `tiengioi-*.sql.gz` của `prod.sh backup`, giải mã escape format của khối `COPY public.characters`, **tuyệt đối không kết nối cơ sở dữ liệu production**, không chạy qua cổng 2567, không ghi tệp tạm ra đĩa.
- **Bảo vệ quyền riêng tư tuyệt đối:** Báo cáo **không bao giờ in tên nhân vật, đạo hiệu hay mã bí mật**. Dữ liệu được nhóm ẩn danh theo `(cảnh giới, bậc)`.

### 9.2. Cách chạy trên bản sao lưu mới nhất
```bash
# Tìm bản sao lưu mới nhất trong thư mục backups
LATEST_BACKUP=$(ls -t ~/TT/tien-gioi-prod/backups/tiengioi-*.sql.gz | head -1)

# Chạy thống kê và in bảng Markdown
npm run thong-ke-tien-do -w server -- --backup="$LATEST_BACKUP"

# Tuỳ chọn: Xuất định dạng JSON cho hệ thống giám sát
npm run thong-ke-tien-do -w server -- --backup="$LATEST_BACKUP" --json
```

Khi chạy trên môi trường phát triển (dữ liệu file JSON cục bộ):
```bash
npm run thong-ke-tien-do -w server -- --dir=server/data/players
```

### 9.3. Tiêu chí Đánh giá Cân bằng
Báo cáo tự động đối chiếu trung vị giờ chơi tích luỹ (`medianHours`) của người chơi Kim Đan Hậu kỳ hoặc nhóm vượt qua Kim Đan (Nguyên Anh trở lên) với mô hình tối ưu `simulate(3)`:
- **Cảnh báo QUÁ NHANH:**
  - *Nhóm vượt qua Kim Đan:* Giờ chơi tích luỹ < `hết Trúc Cơ mô hình + 4.0 giờ` (~6.86 giờ với mô hình hiện tại), tương ứng thời gian ở riêng trong Kim Đan < 4.0 giờ theo tiêu chí #406 / CAN_BANG mục 10.
  - *Nhóm Kim Đan Hậu kỳ:* Giờ chơi tích luỹ < `hết Trúc Cơ mô hình + 70% thời gian mô hình tới Hậu kỳ` (~5.08 giờ với mô hình hiện tại, nhanh hơn thiết kế > 30%).
  - Kích hoạt quy trình xem xét và điều chỉnh mật độ hoặc thời gian hồi sinh của quái Xích Mãng ở bản vá kế tiếp khi có từ 5 mẫu trở lên.
- **Chưa thấy dấu hiệu quá nhanh (cận trên, với >= 5 mẫu):** Tiến độ chưa ghi nhận dấu hiệu đường tắt bất thường. Do giờ chơi tích luỹ là cận trên (người chơi nán lại hoặc đả tọa cũng làm tăng số đo), hệ thống không kết luận "đạt mục tiêu" tuyệt đối.
- **Tham khảo (chưa đủ mẫu, < 5 mẫu):** Dán cờ tham khảo, tiếp tục thu thập thêm dữ liệu từ các bản sao lưu kế tiếp.

### 9.4. Thống kê Chiêu thức & Công pháp (M7.10, Issue #511)
Công cụ `thong-ke-tien-do` theo dõi tỉ lệ người chơi tiếp cận hệ thống võ học tu tiên M7 (chiêu thức, công pháp, ô kỹ năng):
- **Cột `Chiêu / Ô TB`:** Thể hiện số chiêu thức đã học trung bình và số ô chiêu đã gắn trung bình của từng nhóm cảnh giới.
- **Tỉ lệ có chiêu (`percentWithSkills`):** Tỉ lệ phần trăm nhân vật đã học ít nhất 1 chiêu thức võ học.
- **Phân bố số lượng chiêu:** Phân nhóm nhân vật đã học 0, 1, 2, 3–4 hoặc 5+ chiêu thức.
- **Phân bố số ô chiêu đã gắn (ô 2–5):** Phân nhóm số lượng ô chiêu đã kích hoạt (ô 1 mặc định là đánh thường cố định).
- **Bảo vệ quyền riêng tư & bí mật chiến thuật:** Công cụ chỉ thống kê số lượng, tổng số tầng lĩnh ngộ và số ô trang bị; **tuyệt đối không in tên chiêu thức, ID chiêu hay build võ học cụ thể** của người chơi.

### 9.5. Ảnh hưởng của Khắc Chân Linh & Luân Hồi qua các Kiếp
- **Cơ chế thời gian chơi kiếp (`life.playMs`):** Thời gian chơi tích luỹ được tính riêng cho **kiếp hiện tại** (được làm mới về 0 khi luân hồi chuyển kiếp).
- **Phân biệt Dư âm tu hành và Khắc chân linh:**
  - **Dư âm tu hành (`du_am`):** Nâng cấp bằng Duyên tại Tam Sinh Thạch (10 nấc, mỗi nấc +10% tốc độ tu luyện từ quái và đả toạ, tối đa +100% ở nấc 10 theo `THIET_KE_LUAN_HOI.md` mục 6).
  - **Khắc chân linh (`khac`):** Mở nấc bằng Duyên tại Tam Sinh Thạch (3 nấc 40 / 100 / 220 Duyên) để giữ lại 1–3 chiêu thức qua kiếp.
  - **Trạng thái chiêu khắc ở kiếp mới:** Chiêu thức truyền kiếp được giữ ở **tầng 1** và ở trạng thái **chưa gắn ô** (báo "Cần đạt Luyện Khí" cho tới khi nhân vật đột phá lên Luyện Khí tầng 1 mới mở ô để gắn). Do đó, việc nhân vật ở Phàm Nhân kiếp >= 2 có chiêu đã học nhưng số ô gắn = 0 (`Chiêu / Ô TB` có dạng `1.0 / 0.0`) là **hoàn toàn bình thường**.
- **Đánh giá cân bằng đối với kiếp >= 2:**
  - Khi dồn Duyên vào Dư âm tu hành, thời gian từ đầu kiếp tới hết Kim Đan rút ngắn có lộ trình rõ ràng: từ 484 phút (~8.1 giờ ở kiếp 1) xuống 326 phút (~5.4 giờ ở kiếp 2), 288 phút (~4.8 giờ ở kiếp 3) và 273 phút (~4.55 giờ ở kiếp 4) theo bảng tính `CAN_BANG.md` mục 4.
  - **Đây là cơ chế thiết kế có chủ đích** của hệ thống Luân Hồi Chân Linh nhằm tạo cảm giác tiến bộ qua các kiếp, **không phải lỗi cày cuốc hay bất thường cân bằng quái**.
  - Khi xem xét cảnh báo cân bằng từ báo cáo `thong-ke-tien-do`, người vận hành cần lưu ý tách biệt các trường hợp kiếp >= 2 trước khi quyết định điều chỉnh thông số quái vật hay bãi luyện.

---

## 10. Bộ Chạy Toàn Diện E2E (`e2e:all`) & Giám sát Tự động (#694, M7.16)

Hệ thống kiểm thử E2E (End-to-End) của Tiên Giới sử dụng trình duyệt Google Chrome thật kết nối WebSocket đến máy chủ Colyseus thật, bao quát toàn bộ các luồng chơi, giao diện, mạng và cơ chế game.

### 10.1. Chạy Toàn Bộ Kiểm Thử E2E Một Lệnh
```bash
# Chạy toàn bộ các kịch bản E2E tuần tự (tự động thử lại 1 lần nếu gặp lỗi thoáng qua)
npm run e2e:all -w server

# Chạy có tự động build client trước nếu có thay đổi
npm run e2e:all -w server -- --build

# Chỉ chạy một số kịch bản cụ thể (--only hoặc -o; ưu tiên khớp chính xác trước khi rơi về chuỗi con)
npm run e2e:all -w server -- --only noi-lai,chat-luong

# Bỏ qua một số kịch bản (--skip hoặc -s)
npm run e2e:all -w server -- --skip map,dpr

# Tắt cơ chế thử lại (thất bại là kết luận ĐỎ ngay)
npm run e2e:all -w server -- --no-retry

# Xem trước danh sách kịch bản sẽ chạy mà không thực thi và không tạo thư mục log
npm run e2e:all -w server -- --dry-run

# Tùy chỉnh timeout (giây) và thư mục lưu nhật ký (mặc định là $TMPDIR/tien-gioi-e2e-<thời-gian>/)
npm run e2e:all -w server -- --timeout 180 --logs /tmp/e2e-run
```

Toàn bộ nhật ký chi tiết từng kịch bản và bảng tổng kết Markdown được tự động ghi vào tệp `REPORT.md` bên trong thư mục nhật ký.

### 10.2. Cơ chế Thử lại & Phân loại Kết quả
- **XANH (PASS):** Script hoàn thành thành công 100% ngay ở lần chạy đầu tiên.
- **FLAKY:** Script thất bại ở lần chạy 1 nhưng vượt qua ở lần chạy thử lại thứ 2. Không làm gián đoạn mã thoát (exit code 0), nhưng được ghi nhận rõ ràng trong bảng báo cáo để theo dõi và gia cố độ ổn định.
- **ĐỎ (FAIL):** Script thất bại cả 2 lần (hoặc quá thời gian timeout). Tiến trình sẽ in 3–5 dòng cuối cùng của nhật ký lỗi và thoát với mã `1`.

### 10.3. Quy trình Chạy Hằng Đêm trên GitHub Actions (`.github/workflows/e2e.yml`)
- **Tần suất & Kích hoạt:** Tự động kích hoạt lúc 03:00 AM (giờ Việt Nam, tức `20:00 UTC`) hằng đêm hoặc kích hoạt thủ công qua `workflow_dispatch` (hỗ trợ các tham số `only`, `skip`, `timeout`, `no_retry`).
- **Không chặn PR:** Workflow chạy độc lập theo lịch định kỳ, không nằm trong luồng kiểm tra của pull request để tiết kiệm thời gian và tài nguyên CI.
- **Môi trường & GPU:** Chạy trên runner `ubuntu-latest`. Cả 22 kịch bản E2E đều dùng `getChromeGpuFlags()` (`server/scripts/e2e-kit.ts`), tự động lùi về `--disable-gpu` (phần mềm rasterization SwiftShader của Chrome) khi phát hiện biến môi trường `CI=true`. Không cần thiết bị GPU vật lý và không kịch bản nào bị bỏ qua theo mặc định.
- **Báo cáo & Nhật ký:** Bảng tổng kết kết quả Markdown tự động được xuất ra GitHub Step Summary; toàn bộ file log chi tiết của từng kịch bản được lưu trữ dưới dạng artifact trong vòng 30 ngày.
- **Dọn dẹp tài nguyên:** Runner tự động tiêu diệt triệt để cây tiến trình Chrome detached và cô lập môi trường tạm riêng cho mỗi lần chạy qua biến môi trường `TMPDIR` (tự động xoá sạch thư mục tạm riêng sau khi kịch bản kết thúc), đảm bảo không để lại tiến trình mồ côi hay rác đĩa, đồng thời không bao giờ xoá nhầm tài nguyên tạm của tiến trình/dev khác trên máy dùng chung.
- **Tái hiện "runner chậm" ở máy dev (đã dùng để tìm hai lỗi thật, #694):** runner 2 nhân chạy WebGL phần mềm (SwiftShader) nên Phaser chỉ ~5-6 FPS; ở máy dev dùng `CI=true taskset -c 0 npm run e2e:<tên> -w server` (một nhân, `--disable-gpu`) để có cùng điều kiện. (Giới hạn CPU của CDP KHÔNG tái hiện: B thử 20 lần.) Hai bài học: (1) **ca kiểm KHÔNG được phụ thuộc đồng hồ thật khi đo thứ ngắn hạn**: chữ bay sống 800 ms và mờ rất nhanh, nên `e2e:fx` sinh chữ và xin `snapshotArea` CÙNG một khung (sự kiện `update` của cảnh), và gộp các phép đo ngân sách vào MỘT lần đánh giá (đồng hồ khung đứng yên trong một tác vụ JS); (2) **đừng chèn thao tác chậm (ảnh chụp CDP) vào trước vòng đo**. Muốn biết vì sao một ca đỏ trên runner: chạy tay `gh workflow run e2e.yml --ref <nhánh> -f only=<tên> -f no_retry=true` (chạy được trên nhánh chưa merge), tải artifact `e2e-logs-<sha>`; `e2e:nhip-tim` Ca 4 in thêm "sổ proxy" (kết nối mới + dòng yêu cầu) khi đỏ.





---

## 11. Hệ số tu vi THỬ NGHIỆM cho một nhân vật (`TEST_EXP_MULT`, `QUYET_DINH_M3.md` mục 34)

Để chính người dùng thử game (vd nhân vật `Han` tu vi x5) mà KHÔNG đụng người chơi khác. Chỉ nhân **tu vi**; không đổi rơi đồ, Linh thạch, sát thương.

- **Cấu hình:** biến môi trường `TEST_EXP_MULT` = `đạo_hiệu:hệ_số`, nhiều mục cách nhau dấu phẩy, vd `TEST_EXP_MULT=Han:5` hoặc `TEST_EXP_MULT=Han:5,Linh Nhi:2`. Mặc định rỗng = **TẮT**.
- **Luật:** đạo hiệu khớp KHÔNG phân biệt hoa thường (cùng chuẩn hoá với khoá chân linh); hệ số là **số nguyên từ 1 đến 10** (1 = không nhân). Mục sai (thiếu `:`, tên rỗng, hệ số ngoài 1-10 hoặc không nguyên) bị **bỏ kèm cảnh báo** lúc khởi động, không bao giờ kẹp lặng lẽ (gõ nhầm `Han:50` không thành x10).
- **Nhân những gì:** MỌI nguồn tu vi của nhân vật đó (hạ quái kể cả trong bí cảnh, đả tọa, đan tu vi, thưởng nhiệm vụ), áp SAU các hệ số khác (Dư âm tu hành, tinh anh, chênh bậc). Bậc cuối của cảnh giới vẫn dừng ở đầy, chờ Đột phá. Mã: `server/src/test-exp.ts` (đọc cấu hình), `gainExp` ở `server/src/systems/progression.ts` (chỗ nhân duy nhất), `WorldRoom.onJoin` (tra một lần lúc vào phòng).
- **Minh bạch (hai chỗ; người dùng bỏ nhãn ở client, mục 36):** (1) lúc khởi động máy chủ in một dòng `[CẢNH BÁO] TEST_EXP_MULT đang BẬT (chỉ để thử nghiệm): nhân tu vi của Han x5...`; (2) mỗi lần nhân vật vào phòng ghi audit `{"ev":"test.exp_mult","name":"Han","mult":5,"map":"lac_ha",...}`. Hệ số chỉ nằm phía máy chủ (`PlayerCtrl.testExpMult`), KHÔNG vào state và không gửi client nào.

### 11.1. Bật trên bản chạy thật
```bash
cd ~/TT/tien-gioi-prod
echo 'TEST_EXP_MULT=Han:5' >> .env.production          # hoặc sửa dòng đã có
cat .current-tag                                        # thẻ đang chạy, vd 0.3.1
./prod.sh up "$(cat .current-tag)"                      # nạp lại cấu hình (khởi động lại game, ~30 giây lưu hồ sơ trước khi tắt)
./prod.sh logs game 2>&1 | grep -E "TEST_EXP_MULT" | tail -3   # phải thấy dòng CẢNH BÁO "đang BẬT ... Han x5"
```
Rồi cho nhân vật `Han` vào game: log có `"ev":"test.exp_mult"` (`./prod.sh logs game | grep test.exp_mult`) và tu vi nhận được gấp đúng hệ số (so với người thường cùng điều kiện).

Nhiều nhân vật: ngăn cách bằng dấu phẩy, ghi ĐÚNG đạo hiệu như trong CSDL (có dấu, có khoảng trắng), vd `TEST_EXP_MULT=Han:5,Hàn Tuyết:3`; không có khớp gần đúng tự động (tránh trúng người khác tên na ná). Nên đặt trong dấu nháy kép khi có khoảng trắng (compose đọc đúng): `TEST_EXP_MULT="Han:5,Hàn Tuyết:3"`; kiểm dòng cảnh báo khởi động phải in đúng tên không dính nháy.

### 11.2. Tắt
```bash
cd ~/TT/tien-gioi-prod
sed -i '/^TEST_EXP_MULT=/d' .env.production             # xoá dòng
./prod.sh up "$(cat .current-tag)"
./prod.sh logs --since 2m game 2>&1 | grep -c TEST_EXP_MULT   # log của lần khởi động mới (2 phút gần nhất): phải ra 0
```
Tu vi đã tích luỹ KHÔNG bị trừ lại khi tắt (đã là tu vi thật của nhân vật). Muốn trả về thì sửa hồ sơ nhân vật thủ công (ngoài phạm vi mục này).

### 11.3. Lưu ý
- Chỉ nên dùng cho nhân vật của người vận hành tự thử game; mỗi lần bật / tắt phải khởi động lại máy chủ (biến môi trường đọc một lần lúc khởi động).
- Nhiều tiến trình / nhiều phòng: mỗi lần vào BẤT KỲ phòng nào (kể cả qua cổng, bí cảnh) đều tra lại và ghi một dòng audit.
- Máy chủ chạy dev (`npm run dev`) đặt qua `.env.local` ở gốc repo như các biến khác.

## 12. Bộ chiêu trùm nhiều chiêu (`BOSS_MOVES`, `QUYET_DINH_M3.md` mục 42, `THIET_KE_TRUM.md`)

- **Bật / tắt:** biến môi trường `BOSS_MOVES` (`on`, `1`, `true`, `yes`; không phân biệt hoa thường). Mặc định **TẮT**: khi tắt, trùm chạy đúng như cũ (đánh thường, Thiên Hàn Vương còn đập đất và lao). Giá trị lạ (gõ nhầm) coi là TẮT, không bao giờ bật ngầm. Đọc MỘT lần lúc dựng phòng; đổi phải khởi động lại máy chủ.
- **Khi bật:** trùm có bộ chiêu trong `BOSSES` (`shared/src/bosses.ts`) dùng bộ thực thi `server/src/systems/boss.ts`: mọi đòn có báo trước >= 800 ms (`fx` `warn`), chuyển giai đoạn theo khí huyết, triệu hồi quái con (không rơi đồ / tu vi), cuồng nộ ở bí cảnh, reset khi hết mục tiêu. Bộ chiêu thay hẳn đập đất / lao của loài đó.
- **Dữ liệu (từ #872 / v0.4.0):** bộ chiêu THẬT của bốn trùm (Xích Mãng, Hắc Giao, Thiên Hàn Vương, Linh Hư Yêu Vương), qua ba cổng công bằng (`bossViolations`, bot né hoàn hảo `boss-data-dodge.test.ts`, `bossBalanceViolations`); số đo ở `docs/CAN_BANG.md` mục "Trùm nhiều chiêu". **Bản chạy thật v0.4.0 bật `BOSS_MOVES=on`** (quyết định lúc phát hành, ghi ở `questions.md`); tắt = xoá dòng `BOSS_MOVES` khỏi `.env` rồi `./prod.sh up` lại (trùm về đánh thường như cũ).
- **Kiểm đã bật thật sau khi triển khai:** `./prod.sh logs --since 2m game 2>&1 | grep BOSS_MOVES` phải ra dòng `Trùm nhiều chiêu: BẬT (BOSS_MOVES): ...`; nếu ra `[CẢNH BÁO] BOSS_MOVES='...' không hợp lệ` thì giá trị trong `.env.production` bị gõ sai (chỉ `on` / `1` / `true` / `yes` mới bật) và trùm đang chạy như cũ; không ra dòng nào thì cờ chưa tới container (kiểm `.env.production`, rồi `./prod.sh up` lại).
- **Bí cảnh Linh Hư khi bật:** Linh Hư Yêu Vương có bộ chiêu (vòng nổ, truy kích người xa nhất, dịch chuyển chớp, phân thân): đội 4 người đứng yên vẫn hạ được (~4,6 phút), đội 3 người cần né. Theo dõi `/metrics` và log kiểm toán (`dungeon`) sau khi bật; thấy tỉ lệ thua bí cảnh tăng bất thường thì tắt cờ (mục trên).
