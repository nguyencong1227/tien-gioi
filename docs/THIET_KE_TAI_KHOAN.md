# Thiết kế tài khoản thật + PostgreSQL (M3 bước 3)

> Tài liệu thiết kế do Dev A soạn cho B và C review, trước khi viết mã. Quyết định gốc của người dùng (10/11/2026): "Tài khoản thật + PostgreSQL, lưu LINH HỒN tách khỏi NHÂN VẬT (kéo từ M4 lên)". Đây là bước 3 trong thứ tự M3 (sau bản đồ thứ hai và luân hồi, trước bí cảnh, PK, tông môn). Hợp đồng `shared/` ở mục 9; chia PR ở mục 10; những chỗ A tự chọn hướng an toàn ở mục 11 (người dùng đổi nếu muốn).

## 1. Mục tiêu và phạm vi
- Người chơi **đăng ký / đăng nhập** bằng tên đăng nhập + mật khẩu, vào lại từ máy khác (hiện tại danh tính nằm trong `localStorage` của một trình duyệt: mất trình duyệt là mất nhân vật).
- **Linh hồn thuộc về tài khoản** (khoá theo `accountId`, không theo tên nhân vật); nhân vật của kiếp này vẫn là một bản ghi riêng. Chuẩn bị chỗ cho tông môn (bước 6) gắn với linh hồn.
- **PostgreSQL** là nơi lưu tài khoản, linh hồn, nhân vật khi chạy thật. File JSON vẫn là backend mặc định cho dev và test (không bắt dev cài Postgres).
- Không đổi luật chơi, không đổi giao thức gameplay. Không thu thập email (không có dịch vụ gửi thư; xem mục 4.4).
- Ngoài phạm vi: đăng nhập bằng bên thứ ba (Google...: gửi dữ liệu ra ngoài), nhiều nhân vật một tài khoản, đổi tên đạo hiệu, thanh toán, nhiều tiến trình server (vẫn một tiến trình, `Hub` trong bộ nhớ).

## 2. Hiện trạng (đã đọc mã)
- Danh tính = `JoinOptions { name, secret }`: `name` 2-16 ký tự (`cleanName`), `secret` là chuỗi ngẫu nhiên client tự sinh và giữ ở `localStorage` (`client/src/main.ts`), server lưu `sha256(secret)` trong file nhân vật (`hashSecret`, `store.ts`). Sha256 trơn **chỉ an toàn vì secret có entropy cao**; không dùng được cho mật khẩu người đặt.
- Nhân vật: `server/data/players/<sha1(tên NFC viết thường)>.json` (`loadPlayer` / `savePlayer`, ghi xếp hàng theo tệp). Linh hồn: `<DATA_DIR>/souls/<sha1(soulId)>.json` (`SoulStore` / `FileSoulStore`, `soulIdOf(name)`), `soulId` hiện **là tên nhân vật**.
- `WorldRoom.onAuth` kiểm tên + secret, tải file, kiểm `mapId` (`wrong_map`). Server HTTP chỉ có `/health` và file tĩnh (`server/src/index.ts`, express); chưa có API nào.
- `loadPlayer` / `savePlayer` là hàm module gọi thẳng từ `WorldRoom` (không có giao diện để thay backend). `SoulStore` đã là giao diện (làm sẵn từ #159 cho bước này).

## 3. Mô hình dữ liệu
```
accounts   (id uuid PK, username text UNIQUE [chữ thường], pass_hash text, recovery_hash text,
            created_at, last_login_at, disabled bool)
sessions   (token_hash text PK, account_id FK, created_at, expires_at, last_seen_at)
souls      (account_id PK/FK, data jsonb   -- đúng dạng `Soul` của shared/src/reincarnation.ts, qua sanitizeSoul)
characters (account_id PK/FK, name text UNIQUE [NFC, chữ thường], data jsonb  -- đúng dạng SavedPlayer, qua các hàm sanitize*)
```
- **Một tài khoản = một linh hồn = một nhân vật hiện tại** (đạo hiệu chọn một lần, lúc tạo nhân vật; đầu thai vẫn giữ đạo hiệu và ghi đè `data`). Nhiều nhân vật / đổi đạo hiệu để sau, cột `account_id` đã đủ chỗ (đổi PK của `characters` thành `(account_id, slot)`).
- Đạo hiệu (`name`) **khác** tên đăng nhập: tên đăng nhập không bao giờ hiện cho người chơi khác (giảm lộ thông tin để dò mật khẩu). Đạo hiệu duy nhất toàn server, không phân biệt hoa thường, giữ luật `cleanName`.
- Giữ `jsonb` cho `data` (không chuẩn hoá từng cột): mọi `sanitize*` của server đã làm việc trên JSON, `kiem-save` kiểm trên JSON; chuẩn hoá thêm khi cần truy vấn (tông môn, bảng xếp hạng) bằng migration riêng.
- Id linh hồn trong mã đổi từ `soulIdOf(name)` sang `soulKeyOf(identity)`: ở chế độ tài khoản là `accountId`; ở chế độ cũ (mục 5) vẫn là tên. Không đổi `Soul`.

## 4. Xác thực
### 4.1 Đăng ký / đăng nhập (HTTP, không qua WebSocket)
- `POST /api/auth/register { username, password }` -> `{ token, recoveryCode }`; `POST /api/auth/login { username, password }` -> `{ token }`; `POST /api/auth/logout` (token trong header `Authorization: Bearer`); `GET /api/auth/me` -> `{ username, hasCharacter, name? }`.
- Tên đăng nhập 3-20 ký tự `[a-z0-9_]` (chuẩn hoá chữ thường). Mật khẩu 8-128 ký tự (độ dài, không áp luật ký tự; chặn danh sách mật khẩu hay gặp ngắn gọn, tối thiểu `username` và 20 mật khẩu phổ biến nhất). Lỗi trả mã ổn định (`username_taken`, `bad_credentials`, `rate_limited`...), **cùng một câu cho sai tên và sai mật khẩu** (không lộ tên nào tồn tại).
- Băm mật khẩu bằng **`crypto.scrypt` bất đồng bộ của Node** (không thêm thư viện): muối 16 byte ngẫu nhiên, `N = 2^15, r = 8, p = 1`, khoá 64 byte, lưu dạng `scrypt$N$r$p$muối$băm`, so sánh bằng `timingSafeEqual`, tham số nằm trong chuỗi nên đổi được về sau và băm lại lúc đăng nhập. **Phải truyền `maxmem: 64 * 1024 * 1024`**: với `N = 2^15, r = 8` Node (mặc định 32 MiB) ném `RangeError: memory limit exceeded` ngay lúc gọi, A đã thử. A đo trên máy này: ~80 ms một lần (một mình), 8 lần song song xong trong ~160 ms (threadpool 4 luồng, ~50 đăng nhập/giây khi bão hoà). Bất đồng bộ nên **không chặn vòng tick**, nhưng threadpool dùng chung với `fs` (ghi nhân vật): phải giới hạn tần suất (4.3) và C đo (mục 10).
### 4.2 Phiên
- Token phiên: 32 byte ngẫu nhiên (`randomBytes`), gửi cho client dạng base64url; server **chỉ lưu `sha256(token)`**. Hạn 30 ngày, trượt (làm mới khi dùng, tối đa mỗi ngày một lần ghi). Đăng xuất / đổi mật khẩu / dùng mã khôi phục thì xoá phiên.
- Client giữ token ở `localStorage` (khác cổng nên không dùng cookie ở môi trường dev; production cùng nguồn). Token gửi qua header cho API HTTP và qua `JoinOptions.token` khi vào phòng.
### 4.3 Giới hạn tần suất và chống dò
- Theo IP: 10 lần đăng nhập thất bại / 10 phút, 5 lần đăng ký / giờ. Theo tên đăng nhập: 5 lần thất bại liên tiếp thì khoá mềm tăng dần (1 phút, 5, 30). Dùng cùng kiểu `RateLimiter` của `rate-limit.ts`, bộ đếm trong bộ nhớ (một tiến trình). Đăng nhập luôn tốn một lần `scrypt` cả khi tên không tồn tại (băm giả) để thời gian không lộ tên.
- Giới hạn kích thước thân yêu cầu (`express.json({ limit: "2kb" })`), chỉ nhận `application/json`, `Cache-Control: no-store`, không ghi mật khẩu / token / mã khôi phục vào log.
### 4.4 Quên mật khẩu
Không có email, nên khi đăng ký server sinh **mã khôi phục** (ví dụ 4 nhóm chữ số / chữ dễ đọc, ~80 bit), hiện một lần và lưu `scrypt` của nó. `POST /api/auth/recover { username, recoveryCode, newPassword }` đặt lại mật khẩu, **sinh mã khôi phục mới**, xoá mọi phiên. Mất cả mật khẩu và mã thì mất tài khoản: ghi rõ trên màn hình đăng ký (bắt người chơi tick "đã lưu mã"). Quản trị viên đặt lại tay bằng một công cụ dòng lệnh (`npm run tai-khoan -w server`), không qua mạng.

## 5. Đường vào game và tương thích
- `AUTH_MODE=legacy|account` (biến môi trường). **`legacy` (mặc định cho dev, test, bot, bench)**: giữ nguyên `JoinOptions { name, secret }` như bây giờ; danh tính tạo từ tên, `soulKey` = tên. **`account`**: `JoinOptions { token }`; `onAuth` tra phiên -> tài khoản -> nhân vật (chưa có nhân vật thì trả lỗi `need_character`, client gọi `POST /api/character { name }` tạo đạo hiệu rồi vào lại). Production bắt buộc `account` (cảnh báo khởi động như `/give`, `startup.ts`).
- Mọi chỗ sau `onAuth` chỉ thấy một `Identity { accountId?: string; name: string; soulKey: string }`; `WorldRoom` không biết backend. Bot, test tích hợp, bench tiếp tục chạy ở `legacy`; thêm một nhóm test cho `account`.
- Một tài khoản chỉ ở một phòng một lúc: khoá theo `accountId` thay cho khoá theo tên hiện nay (cùng cơ chế `wrong_map` / huỷ `ghost`); đăng nhập lần hai từ thiết bị khác khi phiên cũ còn kết nối thì **từ chối** (`already_online`) trừ khi phiên cũ đang là `ghost` (đã có luồng huỷ chờ).

## 6. PostgreSQL
- **Giao diện lưu** (server, không đụng `shared/`): `AccountStore`, `SessionStore`, `PlayerStore` (thay `loadPlayer` / `savePlayer` module-level; cùng hợp đồng xếp hàng theo khoá, lỗi không chặn lần sau), `SoulStore` (có sẵn). Hai bản cài: `File*` (hiện tại, thêm `FileAccountStore` / `FileSessionStore` cho dev và test) và `Pg*`. Chọn bằng `STORE=file|pg` (mặc định `file`) và `DATABASE_URL`.
- Thư viện: **`pg` 8.x** (node-postgres) là phụ thuộc mới duy nhất (+ `@types/pg`); không ORM. Migration là các tệp SQL đánh số `server/migrations/0001_*.sql` chạy tuần tự trong một bảng `schema_migrations`, bởi một bộ chạy ~60 dòng (không thêm công cụ). Mọi truy vấn dùng tham số `$1`, không ghép chuỗi.
- **Ghi an toàn**: giữ đúng thứ tự đã có (ghi hồ sơ Hoàng Tuyền TRƯỚC, cộng Duyên idempotent theo `lastCreditedLife`): `SoulStore.update` trong Postgres là `SELECT ... FOR UPDATE` + ghi trong một giao dịch (thay cho hàng đợi theo tệp); `PlayerStore.save` là một `UPSERT`. Mất kết nối DB: lưu thất bại như lưu file thất bại hôm nay (ghi log, thử lại ở lần lưu định kỳ kế tiếp), người chơi không bị ngắt.
- **Test:** unit cho store dùng `pg-mem` (devDependency, Postgres trong bộ nhớ, chạy trong `npm test`, không cần dịch vụ ngoài); bộ test "hợp đồng store" chạy **cùng một bộ ca** cho `File*` và `Pg*`. CI thêm một job với `services: postgres` và `TEST_DATABASE_URL` chạy lại bộ hợp đồng với Postgres thật. Máy dev không có Postgres / Docker cũng chạy được toàn bộ `npm test` (job Postgres thật chỉ chạy trên CI).
- **Triển khai:** `docker-compose.yml` thêm dịch vụ `db` (`postgres:16`, volume riêng) và biến `DATABASE_URL`; `docs/TRIEN_KHAI.md` thêm sao lưu bằng `pg_dump` thay cho tar thư mục (`backup.ts` giữ cho backend `file`).

## 7. Di chuyển dữ liệu
- **Nhân vật và linh hồn cũ** (tên + secret): công cụ một lần `npm run chuyen-du-lieu -w server` đọc `players/*.json` + `souls/*.json` (qua đúng các hàm `sanitize*`) và nạp vào Postgres cho các tài khoản **do người chơi nhận** (xem dưới). Idempotent (chạy lại không nhân đôi), có `--thu` (dry-run) in số lượng và lỗi, không xoá file nguồn.
- **Nhận lại nhân vật cũ** (`POST /api/character/claim { name, secret }`, chỉ khi tài khoản chưa có nhân vật): kiểm `sha256(secret)` với `secretHash` của nhân vật cũ rồi gán nhân vật + linh hồn cũ cho tài khoản. Chưa nhận thì nhân vật cũ vẫn nằm yên (đạo hiệu giữ chỗ, không ai khác tạo trùng). Màn hình đăng ký có mục "Tôi đã có nhân vật cũ".
- Nhân vật chưa nhận sau một thời hạn do chủ server quyết (không tự xoá trong mã).

## 8. Bảo mật và rủi ro
| Rủi ro | Cách giữ |
|---|---|
| Dò mật khẩu / nhồi thông tin đăng nhập | scrypt, giới hạn theo IP và theo tên, thông báo lỗi thống nhất, băm giả khi không có tên, tên đăng nhập không hiện cho người khác |
| Lộ cơ sở dữ liệu | chỉ lưu băm (mật khẩu, mã khôi phục, `sha256(token)`); token phiên không dùng lại được từ DB |
| Cướp phiên | token ngẫu nhiên 256 bit, hạn trượt, xoá khi đổi mật khẩu; HTTPS là việc của lớp ngoài (`TRIEN_KHAI`: bắt buộc khi mở thật, không đưa mật khẩu qua HTTP thường) |
| Đăng ký hàng loạt (rác) | giới hạn theo IP; đạo hiệu và tài khoản không tự xoá |
| Đua đăng ký / đạo hiệu trùng | ràng buộc `UNIQUE` ở DB (không dựa vào kiểm trước), lỗi `username_taken` / `name_taken` |
| `scrypt` làm đói threadpool (cơn bão đăng nhập) | giới hạn tần suất; C đo `login storm` (mục 10) và tick vẫn < ngân sách |
| Một tài khoản vào hai phòng | khoá theo `accountId` (mục 5) |
| Mất dữ liệu khi đổi backend | công cụ chuyển có `--thu`, không xoá nguồn; bộ test hợp đồng chạy cho cả hai backend |
- Quy tắc đã có vẫn giữ: server không tin client, kiểm kiểu và độ dài mọi trường, `byId` khi tra bảng bằng id ngoài, số liệu từ DB cũng qua `sanitize*`.

## 9. Hợp đồng `shared/` (PR 3a, chỉ sửa `shared/`, B và C review)
- `JoinOptions`: thêm `token?: string` (và giữ `name`, `secret` tuỳ chọn cho `legacy`). Hằng: `USERNAME_RE`, `PASSWORD_MIN/MAX`, `DAO_HIEU` dùng chung `cleanName` quy tắc (đưa luật tên về `shared/` để client kiểm cùng luật: hiện `cleanName` nằm ở `server/store.ts`).
- Kiểu API: `RegisterReq/Res`, `LoginReq/Res`, `MeRes`, `CharacterReq`, `ClaimReq`, `RecoverReq`, `AuthError { code }` với `AUTH_ERRORS` (`bad_credentials`, `username_taken`, `name_taken`, `rate_limited`, `need_character`, `already_online`, `invalid`, `weak_password`); `JOIN_NEED_CHARACTER` (mã join) và `parseAuthError` giống `parseWrongMap`.
- Hàm thuần có test: `validateUsername`, `validatePassword`, `cleanName` (chuyển từ server sang shared, server import lại).

## 10. Chia PR và phân công
| PR | Nội dung | Người |
|---|---|---|
| 3a | `shared/`: hợp đồng mục 9, `cleanName` về shared | A |
| 3b | Server: tách `PlayerStore` / `AccountStore` / `SessionStore` (File*), `Identity`, `soulKey`; **không đổi hành vi**; bench 0.0% | A |
| 3c | Server: `auth.ts` (scrypt, phiên, mã khôi phục, giới hạn tần suất), API HTTP, `AUTH_MODE=account` ở `onAuth`, khoá theo `accountId`, công cụ `tai-khoan`; test (đột biến: bỏ giới hạn, bỏ băm giả, so sánh không hằng thời gian) | A |
| 3d | Client: màn hình đăng ký / đăng nhập / tạo đạo hiệu / mã khôi phục / "đã có nhân vật cũ" / đăng xuất, giữ token, hiện lỗi; ảnh 1280x720 và 390x844; chế độ `legacy` vẫn dùng được khi chạy dev | B |
| 3e | Server: `Pg*` + migrations + `STORE=pg`, `chuyen-du-lieu`, `docker-compose` `db`, `TRIEN_KHAI` | A |
| 3f | Công cụ: bộ test hợp đồng store cho File* và Pg*, job CI Postgres, `kiem-save` đọc được Postgres (hoặc xuất ra file để kiểm), `backup` / `pg_dump`, **thử tải** `login storm` (100-300 đăng nhập đồng thời: p95, tick, threadpool), bot `--account`, đo kích thước phản hồi | C |
- Thứ tự: 3a -> 3b -> (3c song song 3d sau khi 3a vào) -> 3e -> 3f (C chuẩn bị bộ test hợp đồng ngay sau 3b). Mỗi PR một nhánh, `Refs`/`Closes`, B và C review chéo theo quy ước.
- **Hiệu năng:** API HTTP không nằm trong vòng tick; không thêm trường vào state chung; `onAuth` thêm một lần tra phiên (DB hoặc file) ở lúc vào phòng, không mỗi tick; bench một bản đồ giữ 0.0%.

## 11. Câu hỏi mở (A chọn hướng an toàn, người dùng đổi nếu muốn)
1. **Đăng nhập bằng email hoặc bên thứ ba**: không làm (cần gửi dữ liệu ra ngoài / dịch vụ ngoài); thay bằng mã khôi phục (mục 4.4). Nếu muốn email thật thì cần quyết định dịch vụ gửi thư.
2. **Một tài khoản một nhân vật** ở bản đầu; nhiều nhân vật / đổi đạo hiệu để sau.
3. **Postgres là backend production, file là mặc định dev**; không bắt dev cài Postgres. Việc cài đặt Postgres thật trên máy chủ chạy là việc của người triển khai (không làm được trong môi trường này: không có quyền cài gói hệ thống).
4. **Mật khẩu tối thiểu 8 ký tự, không áp luật ký tự** (theo khuyến nghị hiện hành: dài hơn quan trọng hơn phức tạp).

## 12. Quyết định khi cài đặt 3c (ghi lại để B, C và người triển khai khỏi đoán)
- **Phát hiện chế độ:** `GET /health` -> `{ "ok": true, "authMode": "legacy" | "account" }`. Client: thiếu `authMode` hoặc `fetch` lỗi thì coi là `legacy` (ô đạo hiệu cũ). `/api/auth/*` **chỉ được gắn khi `AUTH_MODE=account`**; ở `legacy` các đường này là 404 (không thêm bề mặt tấn công cho dev, test, bot).
- **Cùng nguồn, không CORS:** client gọi `/api/...` bằng đường dẫn tương đối (production cùng server; dev qua `server.proxy` / `preview.proxy` của Vite). Server KHÔNG bật CORS cho API có mật khẩu. Token ở tiêu đề `Authorization: Bearer <43 ký tự base64url>` (không cookie, nên không có CSRF); chỉ nhận `application/json`, thân tối đa 2 KB (413 nếu quá); `Cache-Control: no-store`.
- **Phản hồi:** `register` / `login` / `recover` / `me` trả 200 + JSON; `logout` luôn 204 (token sai cũng vậy); lỗi `{ "error": <mã AUTH_ERRORS>, "retryAfterS"? }` với mã HTTP theo `AUTH_STATUS` (`server/src/auth-service.ts`), 429 kèm tiêu đề `Retry-After`; lỗi nội bộ 500 `{ "error": "server_error" }` (log chỉ có tên lỗi). Không ghi thân yêu cầu / mật khẩu / token vào log.
- **IP khách:** `TRUST_PROXY` (số tầng hoặc mạng con, không nhận `true` / `*`); IPv6 gộp theo /64 khi đếm hạn mức.
- **Lệch với mục 5:** biến chọn chế độ là `AUTH_MODE=legacy|account` (không phải `accounts`). Các đường `/api/character` và `/api/character/claim` vào cùng bước `onAuth` (3c-4), vì cần kho nhân vật và kiểm tra đang trực tuyến.
