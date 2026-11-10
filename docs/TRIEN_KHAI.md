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
| `STORE` | Nơi lưu nhân vật, chân linh, tài khoản, phiên: `file` (tệp JSON ở `DATA_DIR`, một máy một tiến trình) hoặc `pg` (PostgreSQL, cần `DATABASE_URL`). Server chạy migration chưa áp dụng lúc khởi động; thiếu `DATABASE_URL` hoặc không kết nối được thì **không khởi động** (thoát mã 1, thông báo không chứa mật khẩu) | Mặc định: `file`; khi mở thật khuyến nghị `pg` |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL, vd `postgres://người_dùng:mật_khẩu@máy:5432/tiengioi` (chỉ dùng khi `STORE=pg`). **Là bí mật**: không ghi vào log, không commit | Không có |
| `AUTH_MODE` | `legacy`: vào bằng đạo hiệu + mã bí mật lưu ở trình duyệt (dev, test, bot). `account`: đăng ký / đăng nhập bằng tài khoản (mục 4.1 của `docs/THIET_KE_TAI_KHOAN.md`) | Mặc định: `legacy`; khi mở thật nên dùng `account` (xem lưu ý bên dưới) |
| `TRUST_PROXY` | Số tầng reverse proxy tin cậy (vd `1` khi chạy sau Caddy), hoặc danh sách mạng con (`loopback`, `10.0.0.0/8`). **Không nhận `true` / `*`.** | Mặc định: không tin proxy (dùng IP của kết nối) |
| `MIN_PROTOCOL_VERSION` | Phiên bản giao thức thấp nhất server còn nhận khi vào phòng (số nguyên không âm; `shared/src/protocol.ts`). Client cũ hơn (kể cả không gửi `v`, coi là 0) bị từ chối bằng lỗi 426 `client_outdated:<số>` TRƯỚC khi xác thực; client hiện màn hình "Có bản mới, hãy tải lại". **Chỉ nâng khi đã triển khai client mới cho người chơi** (PWA / app cần thời gian cập nhật); bot / công cụ phải gửi `v: PROTOCOL_VERSION`. Cao hơn phiên bản của bản server này thì bị kẹp (kèm cảnh báo). `/health` báo `protocol` và `minProtocol` hiện hành | Mặc định: `0` (nhận mọi client) |

> [!IMPORTANT]
> **Tài khoản (`AUTH_MODE=account`) và proxy:** chỉ ở chế độ `account` server mới mở `/api/auth/*` (đăng ký, đăng nhập, phiên, khôi phục mật khẩu); `legacy` không mở API nào. Giới hạn tần suất đăng nhập tính **theo IP của khách** (10 lần sai / 10 phút, 5 lần đăng ký / giờ). Khi chạy sau reverse proxy (mục 4) mà không đặt `TRUST_PROXY=1`, mọi người chơi trông như cùng một IP (của proxy) và **dùng chung** hạn mức đó cho cả server; ngược lại, đặt `TRUST_PROXY` khi KHÔNG có proxy ghi đè `X-Forwarded-For` thì kẻ xấu tự đặt IP để qua mặt giới hạn. Mật khẩu đi qua mạng: chỉ mở thật qua HTTPS (mục 4). Server khởi động sẽ in cảnh báo nếu cấu hình production còn `legacy`, hoặc `account` mà chưa đặt `TRUST_PROXY`. Dữ liệu tài khoản nằm trong `DATA_DIR/accounts` và `DATA_DIR/sessions` (chỉ có băm; `npm run backup` đã gồm).

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

### 3.4. Chạy với PostgreSQL (`docker-compose.pg.yml`)
Mặc định server lưu bằng tệp JSON (`STORE=file`, mục trên). Để dùng PostgreSQL, ghép thêm tệp `docker-compose.pg.yml` (thêm dịch vụ `db` = `postgres:16` với volume `tien-gioi-pg`, đặt `STORE=pg` + `DATABASE_URL` cho dịch vụ `game`, game chỉ khởi động khi DB đã sẵn sàng; **cổng DB không mở ra ngoài**):

```bash
# Tạo tệp .env cạnh docker-compose.yml (KHÔNG commit). Chỉ chữ và số: mật khẩu nằm trong DATABASE_URL.
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d --build
```
Server tự chạy migration lúc khởi động (log `[pg] đã áp dụng migration: ...`); không kết nối được DB hoặc migration lỗi thì server **không khởi động** (xem `docker compose logs game`).

**Chuyển dữ liệu từ tệp sang PostgreSQL** (đã có người chơi trên `STORE=file`). Công cụ `npm run chuyen-du-lieu` chuyển **nhân vật** (`*.json`), **chân linh** (`souls/*.json`) và **tông môn** (`sects/*.json`); tệp hỏng bị báo chứ không chuyển; chạy lại không nhân đôi; **không bao giờ xoá hay sửa tệp nguồn**. Tài khoản **không** chuyển được (giao diện kho tạo id mới nên không giữ được id mà chân linh của tài khoản khoá theo); người chơi nhận nhân vật cũ về tài khoản mới bằng "Tôi đã có nhân vật cũ" (tên + mã bí mật).
```bash
# 1. Sao lưu volume dữ liệu cũ (mục 3, Bước 3) và DỪNG game để tệp nguồn không đổi nữa:
docker compose stop game
# 2. Bật DB, chạy thử (chỉ đếm và báo lỗi, không ghi gì):
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d db
docker compose -f docker-compose.yml -f docker-compose.pg.yml run --rm game npm run chuyen-du-lieu -w server -- --thu
# 3. Chuyển thật (mã thoát 0 xong; 3 = có tệp hỏng/ghi lỗi, phần còn lại vẫn được chuyển):
docker compose -f docker-compose.yml -f docker-compose.pg.yml run --rm game npm run chuyen-du-lieu -w server
# 4. Bật game với PostgreSQL:
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d
```
`--ghi-de` ghi đè cả những nhân vật / chân linh đã có trong DB (mặc định bỏ qua). Giữ volume `tien-gioi-data` làm bản lưu trữ cho tới khi chắc chắn.

**Sao lưu / khôi phục PostgreSQL** (thay cho `npm run backup`, chỉ dành cho `STORE=file`):
```bash
docker compose -f docker-compose.yml -f docker-compose.pg.yml exec -T db pg_dump -U tiengioi tiengioi | gzip > tiengioi-$(date +%Y%m%d-%H%M%S).sql.gz
# Khôi phục vào DB TRỐNG (dừng game trước):
docker compose -f docker-compose.yml -f docker-compose.pg.yml stop game
gunzip -c tiengioi-YYYYMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.yml -f docker-compose.pg.yml exec -T db psql -U tiengioi tiengioi
docker compose -f docker-compose.yml -f docker-compose.pg.yml start game
```
`npm run kiem-save` hiện chỉ kiểm tệp (`STORE=file`); với PostgreSQL dùng ràng buộc của DB và `chuyen-du-lieu --thu` để rà dữ liệu cũ. `npm run tai-khoan` dùng cùng `STORE` / `DATABASE_URL` và **không cần tắt server** khi `STORE=pg`.

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
# Trả về: {"ok":true,"authMode":"legacy"} (hoặc "account") với HTTP status 200
```
Có thể dùng endpoint này cho Uptime Kuma, AWS Target Group Health Check, hoặc Docker `HEALTHCHECK`.

---

## 6. Tắt máy an toàn (Graceful Shutdown)

Khi cập nhật phiên bản hoặc khởi động lại máy chủ, gửi tín hiệu `SIGTERM` hoặc `SIGINT` đến tiến trình Node.js:
```bash
kill -TERM <server_pid>
```
Tiến trình sẽ đóng nhận kết nối mới, lưu toàn bộ trạng thái nhân vật còn trong phòng chơi xuống đĩa cứng (`DATA_DIR`), ngắt kết nối client với mã phòng hợp lệ, rồi mới thoát hoàn toàn.

> [!NOTE]
> **Xử lý người chơi đang trong trạng thái chờ nối lại (20 giây grace period) (#116):**
> Từ phiên bản có tính năng giữ nhân vật khi rớt mạng, người chơi rớt mạng bất thường sẽ được server giữ lại tối đa `RECONNECT_GRACE_S = 20` giây để chờ kết nối lại. Khi người vận hành tắt server (gửi `SIGTERM`), hàm `onDispose()` của `WorldRoom` sẽ tự động huỷ bỏ các phiên chờ nối lại (`ghosts`) và lưu trọn vẹn toàn bộ dữ liệu nhân vật đang chờ xuống đĩa cứng trước khi phòng giải phóng, bảo đảm tuyệt đối không bị mất dữ liệu hay rollback của bất kỳ ai. Docker Compose được cấu hình `stop_grace_period: 30s` để đảm bảo đủ thời gian cho quá trình lưu này hoàn tất.

---

## 7. Sao lưu & Khôi phục dữ liệu nhân vật

### 7.1. Dữ liệu cần bảo vệ (`DATA_DIR`)
Thư mục `DATA_DIR` (mặc định `server/data/players`) lưu trữ toàn bộ hồ sơ nhân vật dạng JSON (`<sha1_hash>.json`), bao gồm:
- Cảnh giới, tu vi, vị trí toạ độ.
- Túi đồ, trang bị đang mặc.
- Tiến độ nhiệm vụ (sổ nhiệm vụ, nhiệm vụ hàng ngày).
- Bản đồ đang ở, định danh kiếp và bộ đếm thành tựu của kiếp (luân hồi).
- Thư mục con **`souls/`** (chân linh: Duyên đã nhận, mở khóa vĩnh viễn, lịch sử các kiếp): nằm **trong** `DATA_DIR` nên cùng volume Docker và cùng bản sao lưu; **mất `souls/` là mất toàn bộ tiến độ luân hồi của người chơi**. Có thể đặt chỗ khác bằng biến môi trường `SOULS_DIR`. File chân linh hỏng được đổi tên thành `*.hong-<giờ>-<mã>` (không bị ghi đè) để khôi phục thủ công.
- Thư mục con **`sects/`** (tông môn: thành viên theo linh hồn, chức vụ, kho chung Linh thạch, sổ kho; mỗi tông môn một tệp `<id>.json`): nằm **trong** `DATA_DIR` nên cùng volume Docker và cùng bản sao lưu; **mất `sects/` là mất toàn bộ tông môn và Linh thạch trong kho chung**. Có thể đặt chỗ khác bằng `SECTS_DIR`. Tệp hỏng, tên tệp lệch `id`, hoặc trùng tên / biệt hiệu / thành viên với tông môn cũ hơn được đổi tên thành `*.hong-<giờ>-<mã>` (không xoá) để khôi phục thủ công. Với `STORE=pg` dữ liệu nằm ở bảng `sects` / `sect_members` (migration `0002_tong_mon.sql`).

### 7.2. Tạo bản sao lưu (`npm run backup`)
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

### 7.3. Khôi phục dữ liệu từ bản sao lưu
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

---

## 8. Kiểm tra dữ liệu nhân vật (`npm run kiem-save`)

Công cụ kiểm tra tính toàn vẹn (audit) file lưu nhân vật giúp người vận hành phát hiện sớm các file hỏng, file bị can thiệp trái phép, hoặc dữ liệu lệch chuẩn so với phiên bản game hiện tại. Công cụ hoạt động ở chế độ **CHỈ ĐỌC** (không ghi, không sửa, không xoá bất kỳ file nào và tuyệt đối không làm lộ `secretHash`).

### 8.1. Khi nào cần chạy?
- **Sau khi khôi phục bản sao lưu:** Trước khi khởi động server, đảm bảo các file giải nén ra hoàn chỉnh và không bị lỗi cú pháp.
- **Sau khi chép dữ liệu giữa các máy chủ / môi trường:** Tránh file bị cắt cụt do truyền tải mạng hoặc lệch cấu hình phiên bản game.
- **Trước các đợt thử tải lớn hoặc phát hành bản cập nhật mới:** Xác nhận dữ liệu người chơi tương thích 100% với các bảng dữ liệu của server (`items`, `quests`, `realms`, `currency`).

### 8.2. Lệnh kiểm tra

```bash
# Kiểm tra thư mục dữ liệu mặc định (DATA_DIR hoặc server/data/players):
npm run kiem-save -w server

# Kiểm tra thư mục chỉ định:
npm run kiem-save -w server -- --dir=/var/lib/tien-gioi/players

# Xuất kết quả dạng JSON phục vụ giám sát tự động / CI / script:
npm run kiem-save -w server -- --json
```

### 8.3. Ý nghĩa mã thoát (Exit code)
- **`0`**: Hoàn toàn sạch. Toàn bộ file lưu đều hợp lệ và tương thích.
- **`1`**: Phát hiện ít nhất một file vi phạm hoặc hỏng cấu trúc dữ liệu. Chi tiết lỗi của tối đa 10 file đầu tiên được in ra màn hình (kèm tên file và mã lỗi).
- **`2`**: Lỗi I/O nghiêm trọng (thư mục không tồn tại, đường dẫn không phải thư mục, hoặc số file vượt quá giới hạn an toàn 100.000 file).

### 8.4. Ý nghĩa các mã lỗi thường gặp

| Mã lỗi | Nguyên nhân & Hành động xử lý |
|---|---|
| `read_error` | Không thể đọc file do lỗi phân quyền I/O hoặc đĩa cứng. |
| `not_regular_file` | File không phải file thông thường (symlink, FIFO, socket, thư mục) có nguy cơ gây treo tiến trình. |
| `file_too_large` | Kích thước file vượt ngưỡng an toàn 1 MB (bảo vệ chống cạn kiệt bộ nhớ). |
| `invalid_json` | File bị cắt cụt hoặc hỏng cú pháp JSON. Thường do quá trình sao chép đĩa bị gián đoạn. |
| `not_an_object` | Dữ liệu gốc trong JSON không phải Object (ví dụ: mảng, null, số, chuỗi). |
| `invalid_name` | Tên nhân vật không khớp quy chuẩn (`cleanName`, độ dài 2–16 ký tự hợp lệ). |
| `invalid_secret_hash` | Chuỗi mã băm bí mật không phải SHA-256 (64 ký tự hex). |
| `invalid_realm` / `invalid_tier` | Cảnh giới hoặc tầng bậc vượt ngoài khoảng định nghĩa trong game. |
| `invalid_exp` | Điểm tu vi bị âm, NaN hoặc Infinity. |
| `coin_out_of_range` | Số lượng Linh thạch bị âm, chứa số lẻ (float) hoặc vượt trần `COIN_CAP` (999.999.999). |
| `pos_out_of_bounds` / `pos_blocked` | Toạ độ nhân vật nằm ngoài bản đồ hoặc rơi vào ô vật cản không thể di chuyển (núi đá, nước sâu). |
| `inv_not_array` | Trường `inventory` không phải là một mảng. |
| `inv_too_many_slots` | Túi đồ có số ô vượt quá giới hạn tối đa `INVENTORY_SLOTS` ô (hiện tại là 24 ô). |
| `inv_slot_invalid` | Ô đồ trong túi không phải đối tượng hợp lệ. |
| `unknown_item` | Ô đồ chứa `itemId` lạ không tồn tại trong bảng `ITEM_BY_ID`, hoặc dính khoá prototype (`constructor`). |
| `qty_out_of_range` | Số lượng vật phẩm trong ô <= 0, số lẻ hoặc vượt quá giới hạn cộng dồn `stack`. |
| `equip_not_object` | Trường `equipment` không phải là một Object. |
| `unknown_equip_slot` | Ô trang bị lạ không tồn tại trong game. |
| `unknown_equip_item` | Ô trang bị chứa giá trị không phải chuỗi hoặc chứa `itemId` không tồn tại. |
| `invalid_equip_slot` | Vật phẩm đeo vào không phải là trang bị phù hợp với ô đó. |
| `quests_not_object` | Trường `quests` không phải là một Object. |
| `unknown_quest` | Sổ nhiệm vụ chứa `questId` lạ không tồn tại trong game. |
| `duplicate_quest_done` | Danh sách nhiệm vụ đã xong (`done`) chứa `questId` bị trùng lặp. |
| `invalid_daily_key` | Nhiệm vụ hàng ngày không hợp lệ hoặc giá trị ngày không đúng chuẩn ISO. |

---

## 9. Quản trị tài khoản (`npm run tai-khoan`)

Chỉ có ý nghĩa khi chạy `AUTH_MODE=account` (mục 2). Công cụ chạy **trên máy chủ, không qua mạng**; người chơi không tự đổi mật khẩu được, chỉ quên mật khẩu bằng mã khôi phục (mục 4.4 của `docs/THIET_KE_TAI_KHOAN.md`). Khi họ mất cả mật khẩu lẫn mã, quản trị viên đặt lại tay:

```bash
npm run tai-khoan -w server -- list                          # liệt kê tài khoản (không có băm / token)
npm run tai-khoan -w server -- show <tên đăng nhập>          # chi tiết một tài khoản
npm run tai-khoan -w server -- reset-password <tên đăng nhập> # mật khẩu tạm ngẫu nhiên + mã khôi phục MỚI (hiện MỘT lần)
npm run tai-khoan -w server -- reset-recovery <tên đăng nhập> # chỉ đặt mã khôi phục MỚI
npm run tai-khoan -w server -- disable <tên đăng nhập>       # khoá + đăng xuất mọi thiết bị
npm run tai-khoan -w server -- enable <tên đăng nhập>
npm run tai-khoan -w server -- logout-all <tên đăng nhập>
```

- **Với `STORE=file` phải TẮT server trước khi chạy lệnh ghi** (`reset-*`, `disable`, `enable`, `logout-all`): bản file giữ chỉ mục tài khoản trong bộ nhớ của server, sửa tệp lúc đó sẽ bị server ghi đè ở lần lưu kế. Công cụ hỏi `/health` (cổng `PORT`, mặc định 2567) và **từ chối với mã thoát `2`** nếu server còn trả lời; `--force` bỏ qua kiểm tra (chỉ khi chắc chắn). `list` / `show` chỉ đọc nên chạy được cả khi server đang chạy.
- `reset-password` in mật khẩu tạm (20 ký tự ngẫu nhiên) và mã khôi phục mới **đúng một lần**, xoá mọi phiên cũ; gửi cho người chơi qua kênh an toàn và nhắc họ lưu mã khôi phục (họ vào được bằng mật khẩu tạm, hoặc đặt mật khẩu của riêng mình qua "Quên mật khẩu" với mã mới).
- Mã thoát: `0` xong; `1` sai cách dùng hoặc không có tài khoản; `2` server đang chạy.
- Dùng cùng thư mục dữ liệu với server: `DATA_DIR` (và `ACCOUNTS_DIR` / `SESSIONS_DIR` nếu đã đặt riêng); trên máy dev tự đọc `.env.local`. Công cụ dùng cùng `STORE` / `DATABASE_URL` với server (qua `createStores`): với `STORE=pg` mọi thay đổi đi qua DB nên **không cần tắt server** (công cụ không hỏi `/health`).
