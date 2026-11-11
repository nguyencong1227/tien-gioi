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
> **Lưu ý về cấu hình:** File `.env.local` chỉ dùng khi phát triển trên máy dev (để chia cổng riêng cho Dev A, B, C) và **không** được commit. Trên production, cấu hình hoàn toàn qua **biến môi trường** (hoặc dùng `.env.production` sao chép từ `.env.production.example` kết hợp Docker Compose >= 2.24: `docker compose up -d --build` tự động nạp `.env.production` qua khai báo `env_file` của container `game`; khi dùng PostgreSQL, thêm `--env-file .env.production` để nội suy `${POSTGRES_PASSWORD}`):

### Bảng biến môi trường chính thức (Production)

| Biến môi trường | Mặc định | Tác dụng | Bí mật? | Khuyến nghị production | Nơi dùng |
|---|---|---|:---:|---|---|
| `NODE_ENV` | `undefined` (dev) | Xác định môi trường thực thi; vô hiệu hoá hoàn toàn lệnh chat quản trị `/give` khi bằng `production` | Không | **Bắt buộc: `production`** | `server/src/systems/inventory.ts`, `server/src/startup.ts` |
| `PORT` | `2567` | Cổng HTTP / WebSocket mà server lắng nghe | Không | `2567` (hoặc theo quy hoạch mạng) | `server/src/index.ts` |
| `TIEN_GIOI_PROD` | Không có | Cờ "đây là bản chạy thật": `1` mới cho server khởi động ở cổng **2567** (cổng dành riêng cho bản chạy thật). Thiếu cờ mà `PORT` là 2567 (kể cả không đặt `PORT`) thì server từ chối khởi động (mã 1) để dev / test / bot không chiếm cổng của bản thật | Không | **`1`** trên bản chạy thật; KHÔNG đặt ở máy dev | `server/src/startup.ts`, `server/src/index.ts` |
| `DATA_DIR` | `server/data/players` (hoặc `data/players`) | Thư mục gốc lưu trữ dữ liệu tệp JSON khi `STORE=file` (nhân vật, chân linh, tông môn, tài khoản, phiên) | Không | Trỏ tới mount volume bền vững (vd `/app/data/players` hoặc `/var/lib/tien-gioi/players`) | `server/src/store.ts`, `server/src/soul.ts`, `server/src/sect-store.ts`, `server/src/account-store.ts` |
| `SOULS_DIR` | `<DATA_DIR>/souls` | Thư mục lưu dữ liệu chân linh (tiến trình luân hồi, Duyên). Ghi đè thư mục con mặc định trong `DATA_DIR` | Không | Để mặc định theo `DATA_DIR` để cùng sao lưu một volume | `server/src/soul.ts` |
| `SECTS_DIR` | `<DATA_DIR>/sects` | Thư mục lưu dữ liệu tông môn (thành viên, kho chung, sổ kho). Ghi đè thư mục con mặc định trong `DATA_DIR` | Không | Để mặc định theo `DATA_DIR` để cùng sao lưu một volume | `server/src/sect-store.ts` |
| `ACCOUNTS_DIR` | `<DATA_DIR>/accounts` | Thư mục lưu trữ tài khoản người chơi (băm mật khẩu scrypt, mã khôi phục) khi `STORE=file` | Không | Để mặc định theo `DATA_DIR` | `server/src/account-store.ts` |
| `SESSIONS_DIR` | `<DATA_DIR>/sessions` | Thư mục lưu trữ phiên đăng nhập (băm token phiên) khi `STORE=file` | Không | Để mặc định theo `DATA_DIR` | `server/src/account-store.ts` |
| `STORE` | `file` | Backend lưu trữ: `file` (tệp JSON ở `DATA_DIR`, một máy một tiến trình) hoặc `pg` (PostgreSQL qua `DATABASE_URL`). Server tự chạy migrations lúc khởi động | Không | `pg` khi mở cụm server thật; `file` cho máy chủ đơn | `server/src/stores.ts`, `server/src/startup.ts` |
| `DATABASE_URL` | Không có (chỉ dùng khi `STORE=pg`) | Chuỗi kết nối PostgreSQL (vd `postgres://tiengioi:matkhau@db:5432/tiengioi`). Không in ra log, không commit | **CÓ** | Bắt buộc khi `STORE=pg`. Cung cấp chuỗi kết nối an toàn | `server/src/stores.ts`, `server/src/startup.ts` |
| `POSTGRES_PASSWORD` | Không có | Mật khẩu cơ sở dữ liệu PostgreSQL, được Docker Compose dùng để khởi tạo service `db` và nội suy vào `DATABASE_URL` của service `game` khi chạy `docker-compose.pg.yml`. Không đọc trực tiếp bởi server Node.js | **CÓ** | Chuỗi ngẫu nhiên chỉ gồm chữ và số (vd `openssl rand -hex 24`), tránh ký tự đặc biệt | `docker-compose.pg.yml` (chỉ dùng cho Docker Compose) |
| `AUTH_MODE` | `legacy` | Cơ chế xác thực: `legacy` (đạo hiệu + secretHash lưu trình duyệt) hoặc `account` (tài khoản mật khẩu scrypt + phiên + mã khôi phục, mở `/api/auth/*`) | Không | **`account`** khi mở cho người chơi thật | `server/src/auth-http.ts`, `server/src/startup.ts` |
| `TRUST_PROXY` | Không tin proxy (dùng IP kết nối) | Số tầng reverse proxy tin cậy (vd `1` sau Caddy/Nginx) hoặc danh sách mạng con (`loopback`, `10.0.0.0/8`). Không nhận `true` / `*` | Không | `1` khi chạy sau 1 tầng reverse proxy để giới hạn tần suất theo đúng IP khách | `server/src/auth-http.ts`, `server/src/startup.ts` |
| `SECTS` | Bật tính năng | Kiểm soát tính năng tông môn; đặt `SECTS=off` để gỡ bỏ hoàn toàn tính năng tông môn (bảo trì khẩn cấp) | Không | Để trống (mặc định bật) | `server/src/rooms/WorldRoom.ts` |
| `AUDIT_LOG` | Bật (stdout) | Nhật ký kiểm toán có cấu trúc M4 2.4: mỗi sự kiện nhạy cảm 1 dòng JSON ra stdout. Đặt `AUDIT_LOG=off` để tắt | Không | Để trống / bật | `server/src/audit.ts`, `server/src/index.ts` |
| `AUDIT_COIN_THRESHOLD` | `5000` | Ngưỡng biến động Linh thạch trong 1 giao dịch để ghi sự kiện `wallet.big` vào nhật ký kiểm toán. Số nguyên dương | Không | `5000` (hoặc tuỳ chỉnh theo kinh tế game) | `server/src/audit.ts`, `server/src/rooms/WorldRoom.ts` |
| `MIN_PROTOCOL_VERSION` | `0` (nhận mọi client) | Phiên bản giao thức thấp nhất server chấp nhận khi vào phòng. Client cũ hơn bị từ chối bằng lỗi 426 trước khi xác thực | Không | Nâng khi phát hành bản cập nhật client bắt buộc mới | `server/src/protocol.ts`, `server/src/startup.ts`, `server/src/index.ts` |
| `METRICS_TOKEN` | Không có (`/metrics` TẮT) | Bật `GET /metrics` (số đo vận hành, mục 5): đòi tiêu đề `Authorization: Bearer <token>`. Ngắn hơn 16 ký tự bị coi là chưa đặt (kèm cảnh báo khi khởi động) | **CÓ** | Chuỗi ngẫu nhiên dài (`openssl rand -hex 24`), chỉ đưa cho hệ thống giám sát | `server/src/metrics.ts`, `server/src/startup.ts`, `server/src/index.ts` |
| `TICK_WARN_MS` | `25` | Ngưỡng cảnh báo `[CẢNH BÁO]` trong log khi p95 thời gian tick của phòng tệ nhất (cửa sổ ~60 giây) vượt quá số ms này; nhịp tick là 50 ms, ngân sách thiết kế < 10 ms | Không | Mặc định; hạ xuống nếu muốn báo sớm | `server/src/metrics.ts` |
| `WRITE_WARN_PENDING` | `200` | Cảnh báo khi số lần ghi hồ sơ nhân vật đang chờ vượt quá số này (kho lưu trữ chậm) | Không | Mặc định | `server/src/metrics.ts` |
| `WRITE_WARN_AGE_S` | `30` | Cảnh báo khi lần ghi hồ sơ chờ lâu nhất quá số giây này (kho lưu trữ có thể đã kẹt) | Không | Mặc định | `server/src/metrics.ts` |
| `CORS_ORIGINS` | Không có (TẮT) | Danh sách nguồn (phẩy ngăn cách) được đọc `/health` và `/api/*` từ trình duyệt khác nguồn, vd `https://localhost,capacitor://localhost` cho app đóng gói (mục 5.2). Chỉ nhận dạng `lược đồ://máy[:cổng]`; `*`, đường dẫn, dấu `/` cuối bị bỏ kèm cảnh báo | Không | Để trống cho web cùng nguồn; chỉ đặt khi có client đóng gói / đặt khác nguồn | `server/src/cors.ts`, `server/src/startup.ts`, `server/src/index.ts` |

> [!IMPORTANT]
> **Tài khoản (`AUTH_MODE=account`) và proxy:** chỉ ở chế độ `account` server mới mở `/api/auth/*` (đăng ký, đăng nhập, phiên, khôi phục mật khẩu); `legacy` không mở API nào. Giới hạn tần suất đăng nhập tính **theo IP của khách** (10 lần sai / 10 phút, 5 lần đăng ký / giờ). Khi chạy sau reverse proxy (mục 4) mà không đặt `TRUST_PROXY=1`, mọi người chơi trông như cùng một IP (của proxy) và **dùng chung** hạn mức đó cho cả server; ngược lại, đặt `TRUST_PROXY` khi KHÔNG có proxy ghi đè `X-Forwarded-For` thì kẻ xấu tự đặt IP để qua mặt giới hạn. Mật khẩu đi qua mạng: chỉ mở thật qua HTTPS (mục 4). Server khởi động sẽ in cảnh báo nếu cấu hình production còn `legacy`, hoặc `account` mà chưa đặt `TRUST_PROXY`. Dữ liệu tài khoản nằm trong `DATA_DIR/accounts` và `DATA_DIR/sessions` (chỉ có băm; `npm run backup` đã gồm).

> [!CAUTION]
> **Bắt buộc phải đặt `NODE_ENV=production` khi mở cho người chơi thật:**
> Lệnh chat quản trị `/give` (tự cấp mọi loại đan dược, vũ khí, pháp bảo thử nghiệm) chỉ bị vô hiệu hoá khi `NODE_ENV === "production"` đúng chữ (`server/src/systems/inventory.ts`). Nếu quên đặt biến này, bất kỳ người chơi nào cũng có thể gõ `/give` để tự nhận vật phẩm cấp cao.

Chạy ứng dụng:
```bash
export NODE_ENV=production
export PORT=2567
export TIEN_GIOI_PROD=1   # bắt buộc ở cổng 2567: cổng dành riêng cho bản chạy thật
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

# 2. Giải nén bản sao lưu vào volume (luôn chỉ định tên file cụ thể, tránh dùng wildcard *):
docker run --rm -v tien-gioi-data:/data -v "$PWD":/backup busybox sh -c "tar xzf /backup/players-20261110-020000.tar.gz -C /data"

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
> docker run -d --name tien-gioi --init --stop-timeout 30 -e TIEN_GIOI_PROD=1 -p 127.0.0.1:2567:2567 -v tien-gioi-data:/app/data/players tien-gioi
> ```

---

## 4. HTTPS: Cloudflare Tunnel (bản chạy thật hiện tại) hoặc Caddy

### Vì sao bắt buộc cần HTTPS?
1. **PWA (Progressive Web App):** Service Worker ([client/public/sw.js](../client/public/sw.js)) và Web App Manifest chỉ hoạt động trên kết nối an toàn `https://` (hoặc `localhost`).
2. **WebSocket bảo mật (`wss://`):** Tránh bị nhà mạng hoặc firewall chặn kết nối WebSocket không mã hoá (`ws://`).

### 4.1. Phương án đang dùng cho bản chạy thật: Cloudflare Tunnel
Bản chạy thật đặt tại máy nhà, `https://tiengioi.hethongtm.site` đi qua **Cloudflare Tunnel** (người dùng dựng và quản; agent KHÔNG sửa, dừng hay khởi động lại, không đụng `~/.cloudflared/`):

```
Người chơi --HTTPS / WSS--> Cloudflare --đường hầm--> cloudflared (dịch vụ systemd người dùng) --HTTP--> 127.0.0.1:2567 --> server (container game) --> PostgreSQL
```
- **Server chỉ nghe `127.0.0.1:2567`** (compose `127.0.0.1:2567:2567`). Không Caddy, không mở cổng 80 / 443, không sửa router; chứng chỉ HTTPS và WebSocket do Cloudflare lo. Cổng **2567 dành riêng cho bản chạy thật** (dev dùng cổng trong `.env.local`; xem `AGENTS.md`).
- **`TRUST_PROXY=1`** (một tầng proxy tin cậy là `cloudflared`). **Không cần đọc `CF-Connecting-IP`:** Cloudflare nối IP thật của khách vào CUỐI `X-Forwarded-For`; `cloudflared` nối vào server từ `127.0.0.1`; Express với 1 tầng tin cậy bỏ tầng socket (`127.0.0.1`) rồi lấy mục PHẢI NHẤT của `X-Forwarded-For` (IP thật do Cloudflare nối), còn mục khách tự gửi nằm bên TRÁI nên không qua mặt được giới hạn tần suất (test `auth-http.test.ts`: "TRUST_PROXY=1 ... giả nhiều tầng vẫn chỉ lấy tầng cuối của proxy"). **Điều kiện:** KHÔNG bao giờ mở cổng 2567 ra `0.0.0.0` / Internet (ai gọi thẳng được cổng đó thì tự đặt `X-Forwarded-For` tuỳ ý).
- **Client web cùng nguồn** nên không cần `VITE_SERVER_URL` / CORS; app Android (Capacitor) chạy ở nguồn WebView riêng: đặt `CORS_ORIGINS` (mục 5.2) và build với `VITE_SERVER_URL=wss://tiengioi.hethongtm.site`.
- **WebSocket qua Cloudflare:** kết nối không bao giờ nhàn rỗi (client gửi `input` 20 lần / giây, server ping khung mỗi 3 giây, thêm nhịp tim ứng dụng #293). Khi `cloudflared` khởi động lại (Cloudflare bảo trì), người chơi rớt mạng và vòng nối lại / nhịp tim lo trong 20 giây grace.
- **Bản cũ sau khi phát hành:** `express.static` gửi `ETag` + `Cache-Control: public, max-age=0`; nếu vẫn thấy client cũ, kiểm `curl -sI https://tiengioi.hethongtm.site/ | grep -i cf-cache-status` và nhờ người dùng "Purge Cache" ở Cloudflare (agent không có quyền vào Cloudflare).
- **Khi sự cố:** domain báo lỗi 1033 / 502 mà `curl http://127.0.0.1:2567/health` vẫn `ok` thì lỗi ở tunnel (`systemctl --user status cloudflared-tiengioi`: chỉ ĐỌC, báo người dùng); `curl` cổng nội bộ cũng lỗi thì lỗi ở server / container (`docs/VAN_HANH.md`).

### 4.2. Cấu hình bằng Caddy (Tự động cấp chứng chỉ SSL Let's Encrypt)
Dùng khi máy có IP công khai và mở được cổng 80 / 443 (không phải bản chạy thật hiện tại).

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
Có thể dùng endpoint này cho Uptime Kuma, AWS Target Group Health Check, hoặc Docker `HEALTHCHECK`. `/health` công khai và chỉ cho biết tiến trình còn trả lời (kèm `authMode`, `protocol`, `minProtocol`): số đo vận hành nằm ở `/metrics` bên dưới.

### 5.1. Số đo vận hành `/metrics` (M4 3.3)
`/metrics` **tắt** cho tới khi đặt `METRICS_TOKEN` (chuỗi ngẫu nhiên từ 16 ký tự). Khi bật, mọi lời gọi phải có tiêu đề `Authorization: Bearer <token>` (token trên URL KHÔNG được nhận vì URL đi vào log của proxy); thiếu / sai là `401`, chưa bật là `404`.
```bash
curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:2567/metrics            # văn bản kiểu Prometheus
curl -s -H "Authorization: Bearer $METRICS_TOKEN" 'http://localhost:2567/metrics?format=json' # cùng số đo dạng JSON
```
Số đo chính (tiền tố `tiengioi_`):

| Số đo | Ý nghĩa | Khi nào đáng lo |
|---|---|---|
| `room_tick_ms{quantile="0.5\|0.95\|1"}`, `tick_p95_worst_ms` | Thời gian xử lý **mô phỏng** một tick của từng phòng, cửa sổ trượt ~60 giây (1200 tick). **Chưa gồm** mã hoá patch state của Colyseus (đo bằng `npm run bench`) | p95 > 25 ms (nửa nhịp 50 ms) kéo dài |
| `room_tick_overrun_total` | Số tick chạy lâu hơn một nhịp (50 ms) từ lúc phòng mở | tăng đều |
| `event_loop_lag_p99_ms` | Độ trễ p99 của vòng lặp sự kiện trong cửa sổ 10 giây, tính cả mã hoá patch, ghi đĩa, HTTP | > 100 ms |
| `writes_inflight`, `writes_oldest_age_seconds`, `writes_failed_total` | Hàng đợi ghi **hồ sơ nhân vật** (đúng cho cả `STORE=file` và `pg`). Kho chân linh / tông môn chưa được đo riêng | `oldest_age` tăng mãi = kho lưu trữ kẹt; `failed_total` tăng |
| `players_online`, `rooms`, `room_players`, `room_ghosts`, `room_monsters` | Số người (kể cả đang chờ nối lại), số phòng, người / quái từng phòng (phòng bí cảnh tạm cũng hiện) | tăng không dừng khi không có người mới |
| `process_rss_bytes`, `process_heap_used_bytes`, `uptime_seconds`, `store_info{kind}` | Bộ nhớ, thời gian chạy, backend lưu trữ | RSS dốc lên đều (thử tải dài: `docs/LOAD_TEST.md`) |

**Cảnh báo trong log** (không cần dịch vụ ngoài): mỗi 10 giây server kiểm ngưỡng và in `[CẢNH BÁO] ...` một lần khi vi phạm, nhắc lại mỗi phút nếu còn kéo dài, rồi in `[ĐÃ ỔN] ...` khi hết. Ngưỡng đổi bằng `TICK_WARN_MS`, `WRITE_WARN_PENDING`, `WRITE_WARN_AGE_S`; độ trễ vòng lặp cố định 100 ms. Đặt cảnh báo trên chuỗi `[CẢNH BÁO]` trong log của container (Uptime Kuma có thể theo dõi từ khoá, hoặc `docker logs tien-gioi | grep CẢNH`).

> [!IMPORTANT]
> **Không để `/metrics` ra Internet nếu không cần:** cổng mặc định trong `docker-compose.yml` chỉ mở trên `127.0.0.1`, nên hệ thống giám sát trên cùng máy gọi thẳng `localhost:2567`. Nếu Caddy proxy cả máy ra ngoài và giám sát chạy cùng máy, chặn đường này ở Caddy:
> ```caddy
> tiengioi.example.com {
>     @metrics path /metrics
>     respond @metrics 404
>     reverse_proxy localhost:2567
> }
> ```
> Token vẫn là lớp bảo vệ cuối (so sánh thời gian hằng, không in token vào log), nhưng đừng dựa vào nó một mình.

### 5.2. CORS cho client khác nguồn (app đóng gói, M4.2a-1)
Web phục vụ client và server cùng một địa chỉ nên không cần CORS và **mặc định server không gửi tiêu đề CORS nào** (`CORS_ORIGINS` không đặt = hành vi y như trước). App đóng gói (Capacitor) chạy ở nguồn riêng (`https://localhost`, `http://localhost`, `capacitor://localhost`) và gọi HTTP sang server nên cần được cho phép:
```bash
CORS_ORIGINS=https://localhost,capacitor://localhost   # khớp CHÍNH XÁC từng nguồn, không ký tự đại diện
```
- Chỉ áp cho `/health` và `/api/*` (đăng ký / đăng nhập / phiên). **Không** áp cho `/metrics` (dành cho máy giám sát, không cho trình duyệt).
- Nguồn trong danh sách nhận `Access-Control-Allow-Origin: <đúng nguồn đó>` (không bao giờ `*`), preflight trả 204 với phương thức `GET, POST, OPTIONS` và tiêu đề `Content-Type, Authorization`; **không** `Allow-Credentials` (API dùng `Authorization: Bearer`, không cookie). Nguồn lạ không nhận tiêu đề nào, preflight bị 403.
- Đây KHÔNG phải rào chắn CSRF: yêu cầu từ nguồn lạ vẫn được xử lý như trước (chỉ trình duyệt của nguồn lạ không đọc được phản hồi). Lớp bảo vệ thật là kiểu nội dung `application/json` và token trong tiêu đề.
- Mục sai (`*`, `https://x/`, `https://x/app`, thiếu lược đồ) bị bỏ kèm cảnh báo `[CẢNH BÁO]` lúc khởi động; tối đa 20 nguồn.
- Đường `/matchmake/*` (vào phòng) do Colyseus tự xử lý CORS: mặc định phản chiếu mọi nguồn và KHÔNG đổi bởi biến này (Vite dev ở cổng 5173 cần nó). Đã kiểm bằng Chrome thật: không đặt biến thì trang khác nguồn không đọc được `/health` hay `/api/auth/*`; đặt biến thì đọc được cả hai (kể cả POST JSON kèm `Authorization`).

**Xoay vòng log:** `docker-compose.yml` giới hạn log của container (`json-file`, 10 MB x 5 tệp) để log không ăn đầy đĩa; log cũ hơn bị Docker xoá, nên nếu cần lưu lâu thì chuyển log sang nơi khác (hoặc đổi `logging.driver`). Nhật ký kiểm toán (`AUDIT_LOG`) cùng đi qua đường này.

---

## 6. Tắt máy an toàn (Graceful Shutdown)

> [!IMPORTANT]
> **Trong Docker, ảnh phải chạy `node` trực tiếp** (`CMD ["node", "--import", "tsx", "src/index.ts"]`, cwd `server/`), KHÔNG qua `npm start`: `npm` không chuyển SIGTERM cho tiến trình con nên `docker stop` giết npm ngay (mã 143, vài ms) và server bị giết mà không lưu nhân vật (mất tới 30 giây tiến trình của mọi người mỗi lần cập nhật). Lỗi này đã có trong ảnh cũ và được CI bắt (bước "Chạy thử ảnh" của job `Docker Build`: nối một người đả tọa rồi `docker stop`, tu vi trên đĩa phải > 0, mã thoát 0).

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
   > [!WARNING]
   > Luôn chỉ định **đúng tên file sao lưu cụ thể**, không dùng wildcard `players-*.tar.gz` khi có nhiều bản sao lưu trong thư mục vì `tar` sẽ xem các file sau là tên tệp cần trích xuất và báo lỗi.

4. Kiểm tra danh sách file sau khi giải nén:
   ```bash
   ls -la /var/lib/tien-gioi/players/
   ```
5. Chạy kiểm tra tính toàn vẹn trước khi khởi động:
   ```bash
   DATA_DIR=/var/lib/tien-gioi/players npm run kiem-save -w server
   ```
6. Khởi động lại server:
   ```bash
   npm start
   ```
7. Sau khi xác nhận mọi nhân vật đăng nhập bình thường, có thể xoá thư mục dự phòng `players.cu`.

**Khôi phục thử nghiệm có kiểm chứng (`npm run khoi-phuc-thu`):**
Tiên Giới cung cấp script tự động kiểm chứng toàn bộ chu trình khôi phục:
```bash
npm run khoi-phuc-thu -w server
```
Quy trình: Tự động sinh dữ liệu mẫu đầy đủ (nhân vật, chân linh, tông môn, tài khoản, phiên) -> Tính SHA-256 từng file -> Nén sao lưu bằng `performBackup` -> Xoá sạch thư mục -> Giải nén bằng lệnh `tar -xzf` ở mục 7.3 -> Chạy `kiem-save` kiểm tra toàn vẹn (phải 0 lỗi) -> Đối chiếu khớp 100% SHA-256 từng file.

### 7.4. Sao lưu & Khôi phục với PostgreSQL (`STORE=pg`)
Khi triển khai với PostgreSQL (`docker-compose.pg.yml` hoặc dịch vụ Postgres bên ngoài):
> [!IMPORTANT]
> Mọi lệnh `docker compose` ở mục này (kể cả `exec`, `stop`, `start`) cần `--env-file .env.production`, hoặc đặt `POSTGRES_PASSWORD` trong tệp `.env` cạnh `docker-compose.yml`: `docker-compose.pg.yml` yêu cầu `${POSTGRES_PASSWORD:?...}` mỗi lần Compose đọc cấu hình, nên thiếu biến thì Compose báo lỗi ngay cả khi chỉ dừng / bật lại dịch vụ.

- **Tạo bản sao lưu cơ sở dữ liệu (`pg_dump`):**
  Dùng cờ `--clean --if-exists --no-owner` để bản sao lưu chứa lệnh tự dọn dẹp các bảng cũ trước khi nạp lại, tránh lỗi trùng khoá hoặc "already exists" khi khôi phục vào cơ sở dữ liệu đang có dữ liệu:
  ```bash
  # Với Docker Compose (dịch vụ db của docker-compose.pg.yml ghép cùng docker-compose.yml):
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.pg.yml exec -T db pg_dump -U tiengioi --clean --if-exists --no-owner tiengioi | gzip > backups/tiengioi-pg-$(date +%Y%m%d-%H%M%S).sql.gz

  # Với máy chủ PostgreSQL thông thường:
  pg_dump -d "$DATABASE_URL" --clean --if-exists --no-owner | gzip > backups/tiengioi-pg-$(date +%Y%m%d-%H%M%S).sql.gz
  ```
- **Khôi phục dữ liệu cơ sở dữ liệu (`psql`):**
  1. Dừng container game server trước để ngắt các kết nối ghi:
     ```bash
     docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.pg.yml stop game
     ```
  2. Nạp lại bản sao lưu vào database (chỉ định file sao lưu cụ thể; cờ `--clean --if-exists` ở bước sao lưu giúp dọn bảng cũ sạch sẽ trước khi tạo lại):
     ```bash
     # Với Docker Compose:
     gunzip -c backups/tiengioi-pg-20261110-020000.sql.gz | docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.pg.yml exec -T db psql -U tiengioi tiengioi

     # Với máy chủ PostgreSQL thông thường:
     gunzip -c backups/tiengioi-pg-20261110-020000.sql.gz | psql -d "$DATABASE_URL"
     ```
  3. Khởi động lại game server:
     ```bash
     docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.pg.yml start game
     ```

> [!NOTE]
> Các lệnh trên dành cho PostgreSQL chưa chạy thử nghiệm trong môi trường CI tự động; người vận hành cần kiểm tra trên bản sao trước khi áp dụng vào môi trường production thật.

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

---

## 10. Quy trình phát hành phiên bản (Release Workflow, M4 3.1)

Hệ thống phát hành tự động qua GitHub Actions (`.github/workflows/release.yml`) đẩy ảnh Docker lên **GitHub Container Registry (GHCR)**: `ghcr.io/nguyencong1227/tien-gioi`.

### 10.1. Quy tắc đánh số phiên bản (Semantic Versioning)
Phiên bản tuân theo chuẩn `vMAJOR.MINOR.PATCH`:
- **Bản phát hành đầu tiên:** `v0.1.0`.
- **Sửa lỗi / Tối ưu nhỏ (tăng `PATCH`):** Khi sửa lỗi hiển thị, sửa logic nhiệm vụ, cân bằng quái vật hoặc tối ưu hiệu năng mà **không** làm thay đổi cấu trúc gói tin `shared/` (ví dụ: `v0.1.0` -> `v0.1.1`).
- **Thay đổi giao thức / Hợp đồng `shared/` (tăng `MINOR`):** Bắt buộc phải tăng `MINOR` (ví dụ: `v0.1.0` -> `v0.2.0`), đồng thời tăng hằng số `PROTOCOL_VERSION` trong `shared/src/protocol.ts` (xem mục 2.5). Client quá cũ sẽ nhận lỗi 426 và hướng dẫn người chơi tải lại trang.
- **Bản phát hành chính thức lớn (tăng `MAJOR`):** Khi hệ thống bước vào giai đoạn phát hành rộng rãi toàn diện (`v1.0.0`).

### 10.2. Cách thức phát hành bản mới
Quy trình phát hành chỉ được kích hoạt khi đẩy một thẻ git tag hợp lệ (`vX.Y.Z`).

1. **Kiểm tra chất lượng trước khi gắn thẻ:**
   ```bash
   npm run typecheck
   npm run lint
   npx prettier --check .
   npm test
   npm run build
   ```
2. **Gắn thẻ phiên bản và đẩy lên GitHub:**
   ```bash
   # Gắn thẻ (người phụ trách Dev A thực hiện theo kế hoạch):
   git tag -a v0.1.0 -m "Phát hành Tiên Giới v0.1.0"
   git push origin v0.1.0
   ```
3. **Quy trình tự động của GitHub Actions (`release.yml`):**
   - Kiểm thẻ đúng dạng `vX.Y.Z[-hậu-tố]`, checkout ĐÚNG thẻ, và **chỉ phát hành mã đã nằm trên `main`** (thẻ gắn vào commit của nhánh chưa merge bị chặn).
   - Tự động chạy toàn bộ cổng chất lượng (typecheck, lint, prettier, vitest, build client).
   - Thiết lập Docker Buildx và biên dịch ảnh một nền tảng `linux/amd64` (tối ưu cho máy chủ production x86_64).
   - Đăng nhập GHCR bằng `GITHUB_TOKEN` (chỉ cấp 2 quyền tối thiểu `contents: write` và `packages: write`, không dùng PAT).
   - Gắn nhãn OCI tiêu chuẩn và các thẻ ảnh:
     - `ghcr.io/nguyencong1227/tien-gioi:0.1.0`
     - `ghcr.io/nguyencong1227/tien-gioi:0.1`
     - `ghcr.io/nguyencong1227/tien-gioi:latest` (chỉ kích hoạt với bản chính thức, không có hậu tố `-rc`/`-beta`)
     - `ghcr.io/nguyencong1227/tien-gioi:sha-<commit>`
   - Tự động tạo bản phát hành `GitHub Release` kèm nhật ký thay đổi (`CHANGELOG`) sinh tự động từ tiêu đề PR.
   - Hỗ trợ `workflow_dispatch` (nhập `tag`, vd `v0.1.0`) để phát hành lại thủ công khi một thẻ bị lỗi hạ tầng: workflow checkout đúng thẻ đó (không phải nhánh đang chọn), đẩy lại ảnh, giữ nguyên bản phát hành nếu đã có.
   - **Thẻ ảnh KHÔNG có chữ `v`** (quy ước của Docker): thẻ git `v0.1.0` cho ảnh `...:0.1.0`.

### 10.3. Quyền riêng tư của ảnh Docker trên GHCR
- **Mặc định riêng tư (Private):** Do mã nguồn máy chủ chứa logic trò chơi và TypeScript của server, package `ghcr.io/nguyencong1227/tien-gioi` được đặt ở chế độ **Private**, không công khai ra Internet.
- **Đăng nhập trên máy chủ chạy thật:** Quản trị viên tạo một GitHub Personal Access Token (Classic) với phạm vi duy nhất là **`read:packages`** (token chỉ đọc, an toàn, không có quyền sửa code) và lưu vào biến môi trường máy chủ:
  ```bash
  echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
  ```

### 10.4. Kéo ảnh và Triển khai trên máy chủ thật
1. **Kéo ảnh phiên bản mới:**
   ```bash
   docker pull ghcr.io/nguyencong1227/tien-gioi:0.1.0
   ```
2. **Chạy qua Docker Compose:**
   Bản chạy thật dùng `deploy/docker-compose.prod.yml` (issue #299) với biến `TIEN_GIOI_TAG=0.1.0`. Cách thủ công: cập nhật trường `image`:
   ```yaml
   services:
     game:
       image: ghcr.io/nguyencong1227/tien-gioi:0.1.0
   ```
   Khởi động lại container dịch vụ:
   ```bash
   docker compose up -d
   ```

### 10.5. Quy trình quay lại bản trước (Rollback khi gặp sự cố)
Nếu bản phát hành mới phát sinh lỗi nghiêm trọng sau khi đưa lên production:
1. Xác định phiên bản ổn định gần nhất (ví dụ: `v0.1.0`).
2. Sửa lại thẻ ảnh (`TIEN_GIOI_TAG` hoặc trường `image`):
   ```yaml
   image: ghcr.io/nguyencong1227/tien-gioi:0.1.0
   ```
3. Ra lệnh Docker Compose nạp lại phiên bản cũ:
   ```bash
   docker compose up -d
   ```
   Hệ thống sẽ thay thế container ngay lập tức trong vài giây mà không làm gián đoạn cơ sở dữ liệu PostgreSQL gắn ngoài.

