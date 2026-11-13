# Phân công M4: KẾ HOẠCH ĐÃ CHỐT (người dùng chốt 11/11/2026)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục 6-7. Dựa trên `GDD.md` (M4: chống gian lận, deploy, build app) và trạng thái sau M3. Việc "M4-sớm" đã làm: #251, #252, #253, #257, #263, #269, #276, #279-#297 (xem bảng). Các việc còn lại đã có issue (bảng mục 5).

## Quyết định đã chốt
| Câu hỏi | Quyết định |
|---|---|
| Máy chủ chạy thật | **Tại máy nhà `nguyencong` (chính máy dev)**, nghe `127.0.0.1:2567`; tên miền **`https://tiengioi.hethongtm.site`** qua **Cloudflare Tunnel** (`cloudflared-tiengioi.service`, do người dùng quản; agent KHÔNG đụng). Không Caddy, không mở cổng router. `TRUST_PROXY=1` |
| Kho ảnh Docker | **`ghcr.io/nguyencong1227/tien-gioi`** (gói riêng tư; mục 3.1) |
| Dữ liệu | **PostgreSQL** (`STORE=pg`), kèm sao lưu định kỳ và thử khôi phục |
| Tách biệt với dev | Thư mục `~/TT/tien-gioi-prod/`, cổng **2567 chỉ của bản chạy thật**, dữ liệu riêng; dev / test / bot KHÔNG đụng (hàng rào ở mục 3.6) |
| App | **Android trước** (Capacitor), iOS để sau; `applicationId` **`site.hethongtm.tiengioi`** |
| Phạt gian lận bản đầu | **Chỉ ghi nhận (audit log) và cảnh báo**; KHÔNG tự khoá tài khoản |
| Câu nhỏ từ M3 | Giữ nguyên: phí lập tông môn 1000 Linh thạch; gục trong bí cảnh về Lạc Hà đầy khí huyết |

Việc người dùng phải tự làm (cần `sudo` / tài khoản): `~/TT/orchestra/questions.md`, mục "M4: bước người dùng phải tự làm".

## 0. Trạng thái (cập nhật 11/11/2026 ~18:10, `main` `48550b3` trở đi)
| Mục | Trạng thái | Bằng chứng / việc còn lại |
|---|---|---|
| 2.1 red team tin nhắn | **Xong** | `npm run red-team -w server` (#265): 49 loại tin (từ M4.2b có thêm `ping`) x nhiều biến thể payload x 2 người gửi (nghèo / giàu) = 2744 đòn, bắt `[lỗi]`, bất biến SỐNG, tự phát hiện loại tin; A đã thử 3 đột biến thật vào `WorldRoom.ts`, đều đỏ |
| 2.2 fuzz bất biến kinh tế | **Xong** | `economy-fuzz` (gđ 1), `kill-share-fuzz`, `sect-life-fuzz` (#271: tìm và sửa lỗi MẤT Linh thạch khi rút kho ở Hoàng Tuyền), `sect-crash` |
| 2.3 kiểm tốc độ / dịch chuyển | **Kết luận: đủ bằng cấu trúc** | không làm cờ riêng (xem mục 2.3) |
| 2.4 audit log | **Xong lát 1 + 2 + 3** (#266, #268, lát 3 PR #307) | thêm đầu thai (`soul.*`), PK (`duel.*`), bí cảnh (`dungeon.*`) và **cảnh báo lặp lại** (`alert.*`, in `[CẢNH BÁO]`; người dùng chốt: chỉ ghi nhận + cảnh báo); danh sách đầy đủ ở `docs/TRIEN_KHAI.md` mục 5.3 |
| 2.5 `PROTOCOL_VERSION` | **Xong** | shared #258, server #261, client #264, sửa modal #270, E2E #267 + #272 |
| 3.1 release workflow → ghcr | **Xong** (#298, #306) | thẻ `v*` -> ảnh `ghcr.io/nguyencong1227/tien-gioi:<thẻ không chữ v>`; `v0.1.0` đã phát hành, `v0.1.1-rc.1` thử luồng thẻ + APK; `release.yml` kiểm thẻ nằm trên `main`, chống chèn lệnh |
| 3.2 cấu hình / bí mật; 3.4 sao lưu + khôi phục | **Xong** (#279, issue #276) | `npm run check:env`, `npm run khoi-phuc-thu`, `docs/TRIEN_KHAI.md` mục 7.3 / 7.4 |
| 3.3 giám sát (`/metrics`, cảnh báo log, xoay vòng log) | **Xong** (PR của nhánh `a/health-mo-rong`) | `server/src/metrics.ts`: `GET /metrics` (Bearer `METRICS_TOKEN`, mặc định tắt) với tick p50 / p95 / max theo phòng, hàng đợi ghi nhân vật, phòng / người, RSS, độ trễ vòng lặp; `[CẢNH BÁO]` / `[ĐÃ ỔN]` trong log; `docker-compose.yml` xoay vòng log; `/health` giữ nguyên; `docs/TRIEN_KHAI.md` mục 5.1 |
| 3.5 thử tải dài | **Xong** (#291) | `npm run soak -w server`; số liệu thật 100 bot / 30 phút (RSS +0,37 MB, tick p95 thật 2,5 ms, 0 lỗi) ở `docs/LOAD_TEST.md` mục 20; lộ và sửa `BUFFER_SIZE` 512 KB (#297) |
| 3.6 bản chạy thật | **Xong, ĐANG CHẠY** (#299, #305, #309, #311) | 11/11/2026 17:15 chạy ảnh `0.1.0`; **13/11/2026 ~10:15 nâng lên `0.1.1` (M5)**: `https://tiengioi.hethongtm.site` chạy ảnh `0.1.1` + PostgreSQL trong Docker (`~/TT/tien-gioi-prod/`, `prod.sh`, `docs/VAN_HANH.md`); đã thử đăng ký / vào phòng qua `wss`, khởi động lại giữ dữ liệu, sao lưu + khôi phục thử. Timer sao lưu / khôi phục thử đã bật (người dùng, 13/11). **Còn lại của người dùng:** Cloudflare Bot Fight Mode (Bước 4 `questions.md`) |
| 4.1 PWA | **Xong** (#251) | `npm run check:pwa` |
| 4.2 Capacitor Android | **M4.2a-c xong; M4.2d chờ thiết bị** | M4.2a #300 / #312, M4.2b #301 / #314 (Back, xuống nền, 426, `privacy.html`; sửa lỗi bridge không tự điền `Capacitor.Plugins.App`), M4.2c #302 / #315 (`android.yml`: thẻ `v*` -> APK debug + sha256 đính vào bản phát hành; ký release khi đủ 4 bí mật `ANDROID_*`). Đã chạy thật trên Actions (APK debug + release ký bằng keystore thử). **M4.2d (máy Android thật):** người dùng cài APK từ Releases; việc của người dùng: tạo keystore + 4 bí mật, thông tin liên hệ cho `privacy.html` |
| 4.3 hiệu năng di động + trợ năng | **Xong** | đo + tài liệu (#251, `docs/HIEU_NANG_DI_DONG.md`); trợ năng (#269): lát 1 #274 (Esc theo tầng, focus, ARIA), lát 2 #277 (giảm chuyển động theo OS / cài đặt, tương phản AA, bảng chỉ dẫn người mới); A đo giảm chuyển động THẬT bằng giả lập `prefers-reduced-motion` |
| 4.4 tài sản / giấy phép | **Xong** (#259) | `npm run check:credits` |

**Công cụ kiểm thử thật đã có (chạy cục bộ và trong CI):** E2E hai tab Chrome thật `e2e:tai-khoan`, `e2e:bi-canh`, `e2e:bi-canh-nga`, `e2e:pk`, `e2e:tong-mon`, `e2e:phien-ban`, `e2e:tro-nang` (phím thật qua CDP); quy ước kiểm "hiện ra" bằng `shown(id)` ở `server/scripts/e2e-kit.ts` (`docs/LOAD_TEST.md` cuối mục 13); `red-team`; bench / thử tải (`docs/LOAD_TEST.md`). Bài học đã thấm: lỗi nằm ở chỗ giao hai thành phần (Phaser + DOM, client + server, hidden của phần tử cha) thường không bị test thuần bắt, cần E2E thật + đột biến.

## 1. Đã có (không làm lại)
- **Server quyết định mọi kết quả**: sát thương, rơi đồ, tu vi, nhiệm vụ, ví, kho tông môn; client chỉ gửi ý định (`AGENTS.md` "Quy tắc bắt buộc").
- **Chống spam / lạm dụng tin nhắn**: `RateLimiter` theo loại tin + ngắt kết nối khi gửi tin lạ quá nhiều (`rate-limit.ts`); ngân sách di chuyển `MAX_MOVE_BUDGET` mỗi tick (`systems/movement.ts`: một input = đúng một bước 50 ms, không tăng tốc được bằng cách gửi dồn); giới hạn tần suất đăng nhập / đăng ký (`auth-limits.ts`); kiểm kiểu, hữu hạn, khoảng cách, hồi chiêu ở từng system; bảng tra bằng `byId` (không bị `constructor`).
- **Tài khoản**: scrypt, token phiên băm, mã khôi phục, khoá tần suất (`docs/THIET_KE_TAI_KHOAN.md`); không bao giờ ghi log mật khẩu / token.
- **Toàn vẹn dữ liệu**: `kiem-save` (nhân vật, chân linh, tài khoản, phiên, bí cảnh, tông môn), tệp hỏng cách ly `*.hong-*`, ghi tệp tạm + `rename`, hàng đợi ghi theo khoá, kiểm tiền theo thứ tự "chỉ mất, không tăng" (kho tông môn, lập tông môn).
- **Triển khai**: `Dockerfile`, `docker-compose.yml` / `docker-compose.pg.yml`, CI (`ci.yml`: typecheck, lint, prettier, test, Docker build, PostgreSQL thật), bench hằng đêm (`bench.yml`), `backup`, `chuyen-du-lieu`, HTTPS bằng Caddy, `/health`, tắt máy an toàn (`docs/TRIEN_KHAI.md`).
- **PWA bước đệm**: `manifest.webmanifest`, icon, `sw.js` (`client/public/`).
- **E2E thật** hai tab Chrome cho bí cảnh, PK, tông môn, gục bí cảnh, tài khoản (`server/scripts/e2e-*.ts`); bot thử tải (`bots.ts`: tổ đội, bí cảnh, PK, qua cổng, bão đăng nhập...).

## 2. Chống gian lận (còn thiếu, đề xuất)
Mục tiêu: không ai có lợi thế bằng cách sửa client hoặc gửi tin lạ; phát hiện và truy vết được khi có chuyện.
1. **Rà soát đối kháng (red team) từng tin nhắn** (C, công cụ + A, sửa): bộ test gửi mọi tin `this.on(...)` với dữ liệu xấu (kiểu sai, NaN / Infinity, số khổng lồ, chuỗi dài, mảng lồng, thuộc tính `__proto__`, tin đúng lúc người đã chết / ở Hoàng Tuyền / đang qua cổng / trong trận) và kiểm bất biến: không ném, không đổi ví / túi / tu vi ngoài ý muốn, không treo hẹn giờ. Nhiều ca đã có rải rác (bí cảnh, PK, tông môn); cần một bộ chung sinh từ danh sách tin.
2. **Bất biến kinh tế bằng thử nghiệm thuộc tính (property / fuzz test)** (A): chuỗi thao tác ngẫu nhiên (mua / bán / nhặt / vứt / đổi đồ / góp / rút / lập tông môn / chết / đầu thai / qua cổng) với hạt giống cố định; sau mỗi bước kiểm: Linh thạch tổng của hệ thống không tăng ngoài nguồn hợp lệ (rơi từ quái, thưởng, bán), số đồ không âm / không vượt trần, không đồ nhân đôi. Mở rộng test bảo toàn tiền đã có ở `systems/sect.test.ts`. **Giai đoạn 1 xong (#253):** `systems/economy-fuzz.test.ts` (16 hạt x 700 bước mặc định, ~6 s; chạy sâu `FUZZ_SEEDS=400 FUZZ_STEPS=2000 npx vitest run server/src/systems/economy-fuzz.test.ts`) kiểm sau MỖI bước mua / bán / vứt / nhặt / mặc / tháo / dùng đan / đổi / rèn / nhiệm vụ (thưởng một lần) / đồ rơi hết hạn / lưu - nạp / chết - đầu thai: độ lệch Linh thạch + vật phẩm (túi + trang bị + đất) đúng công thức của thao tác, cộng bất biến cấu trúc; kèm kiểm dữ liệu giá (không có vòng mua - đổi - bán có lãi) và `splitCoin` / `addCoin`. 400 hạt x 2000 bước (~800 nghìn thao tác) không tìm ra lỗi; 12 đột biến đều đỏ. **Giai đoạn 2 (một phần):** `systems/kill-share-fuzz.test.ts` gọi `killMonster` THẬT trên thế giới ngẫu nhiên (người lẻ, đội 2-4, người ở xa, người ngã, người rời phòng còn trong sổ sát thương): tổng Linh thạch cả phòng tăng đúng bằng số quái đã tung (lập đội không sinh thêm tiền, không mất đồng lẻ), từng người nhận đúng trọng số (sai số < 1 đồng), người không đủ điều kiện nhận 0, đồ rơi đúng bảng / số lượng, chủ đồ đúng mô hình (20 000 hạt không có lỗi; 7 đột biến đều đỏ). **Giai đoạn 2 (tông môn + vòng đời, xong):** `systems/sect-life-fuzz.test.ts` đua ngẫu nhiên (hạt cố định, hai phòng, nhiều thao tác cùng lúc, có và không có sự cố lưu hồ sơ / kho tệp / qua cổng) lập / mời / nhận / rời / mời ra / nhường / chức vụ / góp / rút / giải tán tông môn XEN VỚI chết và đầu thai; sổ cái T = Σ ví (kể cả Linh thạch mang theo của người ở Hoàng Tuyền) + Σ kho: mọi lúc quan sát T <= ban đầu - phí lập - phần mất khi đầu thai, và khi yên T bằng đúng con số đó (không sự cố), cộng bất biến cấu trúc của kho tông môn (tên / biệt hiệu duy nhất, một linh hồn một tông môn, một Tông chủ). **Lỗi tìm ra và đã sửa:** Tông chủ RÚT kho khi đang ở Hoàng Tuyền (hoặc chết đúng giữa lúc rút) thì Linh thạch cộng vào ví của kiếp đã mất, lúc đầu thai `applyRebirth` ghi đè ví nên số đó biến mất (kho đã trừ): nay `sectWithdraw` từ chối từ đầu khi `limbo`, và không cộng vào ví đã mất sau `await` (phần chưa cộng được góp lại kho). 400 hạt x 100 vòng (~30 nghìn lần quan sát sổ cái) không còn lỗi; 4 đột biến đều đỏ. Rớt mạng giữa góp / rút đã có ở `sect-crash.test.ts`. Chạy sâu: `FUZZ_SEEDS=400 FUZZ_ROUNDS=100 npx vitest run server/src/systems/sect-life-fuzz.test.ts`.
3. **Kiểm tốc độ / dịch chuyển phía server: ĐÃ ĐỦ BẰNG CẤU TRÚC, không làm cờ riêng** (A, 11/11/2026). Client không dịch chuyển được vì server mô phỏng vị trí (`applyInputs`, `moveWithCollision`); token bucket `MAX_MOVE_BUDGET` cho đúng 1 bước mỗi tick bền vững (20 bước/s) nên gửi dồn không nhanh hơn; limiter `input` 30/s (burst 40) bỏ tin thừa và ngưỡng ABUSE ngắt kết nối 4429, mỗi lần ngắt đã có audit `room.spam_kick` (#266). Cờ "vận tốc hiệu dụng" chỉ thêm tiếng ồn; sẽ mở lại nếu có đường dịch chuyển do client quyết định (hiện không có).
4. **Nhật ký kiểm toán (audit log) có cấu trúc** (A): mỗi sự kiện nhạy cảm một dòng JSON (đăng nhập thất bại nhiều lần, ngắt kết nối vì spam, thay đổi Linh thạch lớn, lập / giải tán tông môn, rút kho, đầu thai, cờ tốc độ) kèm `soulKey` băm một chiều, không chứa mật khẩu / token / chuỗi kết nối; xoay vòng tệp. Công cụ `kiem-save` / `tai-khoan` đọc được. **Lát 1 xong (#266), lát 2 trong PR kế:** ghi ra stdout (Docker / systemd gom và xoay vòng log, không tự xoay tệp), `AUDIT_LOG` / `AUDIT_COIN_THRESHOLD` (`docs/TRIEN_KHAI.md`); sự kiện: đăng ký / đăng nhập / đăng nhập sai / khôi phục mật khẩu / chặn tần suất, vào phòng bị từ chối, ngắt vì spam, đổi ví lớn, tông môn (lập, góp, rút, mời ra, nhường, giải tán). Còn lại: đầu thai, PK, thưởng bí cảnh lớn (khi cần).
5. **Kiểm thử đối xử với client lỗi thời** (B + A): `PROTOCOL_VERSION` trong `shared/` gửi lúc vào phòng, server từ chối client quá cũ bằng thông báo thân thiện (không treo).

## 3. Deploy
1. **Phát hành tự động** (C, #298): workflow `release.yml` khi gắn thẻ phiên bản `vX.Y.Z`: cổng chất lượng, rồi đẩy ảnh lên **`ghcr.io/nguyencong1227/tien-gioi`** (thẻ `X.Y.Z`, `X.Y`, `latest`, `sha-…`), kèm ghi chú phát hành sinh từ tiêu đề PR. Chỉ chạy khi có thẻ (hạn mức phút Actions từng cạn). Người đẩy thẻ đầu tiên là A.
2. **Cấu hình và bí mật** (C + A): danh sách biến môi trường chính thức (`docs/TRIEN_KHAI.md`), kiểm khi khởi động (`startupWarnings`), mẫu `.env.production.example`; không bao giờ commit bí mật. **Xong (#276):** bảng 15 biến chính thức trong `docs/TRIEN_KHAI.md`, script/test `check:env` quét `server/src` chống hồi quy / phát hiện biến chưa khai báo (đột biến đỏ), file `.env.production.example` chuẩn cho Docker Compose.
3. **Giám sát** (A + C): `/health` mở rộng (số phòng, người chơi, tick p95, kích thước hàng đợi ghi), có thể `/metrics` dạng văn bản đơn giản; cảnh báo khi tick > ngưỡng hoặc hàng đợi ghi đầy; xoay vòng log.
4. **Sao lưu và khôi phục có kiểm chứng** (C): lịch `backup`, thử khôi phục định kỳ trong CI (đã có `backup.test.ts`), tài liệu "khi sập" cho cả `STORE=file` và `STORE=pg` (kể cả di chuyển tệp -> PostgreSQL bằng `chuyen-du-lieu`). **Xong (#276):** `npm run khoi-phuc-thu` (`server/scripts/verify-restore.ts`), test tích hợp trong `backup.test.ts` (0 lỗi `kiem-save`, SHA-256 100% khớp, 2 đột biến thiếu `souls/` hoặc `sects/` đều đỏ), tài liệu mục 7.3 & 7.4 `docs/TRIEN_KHAI.md` (chuẩn hoá lệnh giải nén cụ thể + `pg_dump`/`pg_restore`).
5. **Thử tải dài** (C, **xong #291**): 100 bot / 30 phút, `/metrics` thật, kiem-save sau soak.
6. **Bản chạy thật tại máy này** (MỚI; C, #299; A: hàng rào cổng #303): gói `deploy/` (compose riêng `127.0.0.1:2567`, `prod.sh`, sao lưu `pg_dump` hằng ngày + thử khôi phục hằng tuần, `docs/VAN_HANH.md`), thư mục `~/TT/tien-gioi-prod/` tách khỏi dev, bí mật sinh ngẫu nhiên (`600`, không vào git / log). Máy **chưa có Docker / PostgreSQL / JDK** và agent không dùng `sudo`: phần chạy thật chờ người dùng cài Docker (`questions.md`) và ảnh `v0.1.0`. Ổ đĩa còn ~16 GB (92% đầy): tính cỡ sao lưu. Cloudflare Tunnel: xem `docs/TRIEN_KHAI.md` mục 4.1.

## 4. App Android / iOS (Capacitor)
1. **PWA hoàn chỉnh** (B): kiểm Lighthouse (cài được, ngoại tuyến cho vỏ ứng dụng, biểu tượng đủ cỡ, `theme_color`), cập nhật `sw.js` an toàn (không giữ bản client cũ).
2. **Dự án Capacitor** (B, **M4.2a #300 và M4.2b #301**; C: **M4.2c #302** dựng APK trên Actions vì máy này không có JDK / Android SDK): thư mục `app/` (gói riêng, ngoài `workspaces`), `applicationId` `site.hethongtm.tiengioi`, build từ `client/dist` với cờ `VITE_NATIVE` (không service worker), kết nối `wss://tiengioi.hethongtm.site`; vòng đời nền / tiền cảnh dùng nhịp tim ứng dụng (#293), phím Back, vùng an toàn, trang quyền riêng tư. Kênh phát hành bản đầu: **APK cài trực tiếp** (Releases); Google Play để sau (cần tài khoản + trang quyền riêng tư + Data safety).
3. **Hiệu năng di động** (B): đo FPS / bộ nhớ trên máy tầm trung; giảm hiệu ứng khi yếu; âm thanh theo luật tự phát của trình duyệt / WebView.
4. **Tài sản và giấy phép** (B + A): rà `CREDITS.md` (chỉ CC0 / CC-BY, không dùng chữ / hình / âm của game khác), ảnh cửa hàng ứng dụng do người dùng cung cấp (ngoài phạm vi tự động).
5. **iOS**: để sau (cần macOS + tài khoản nhà phát triển trả phí).

## 5. Chia việc (đã tạo issue)
| Nhóm | Việc | Ai | Issue |
|---|---|---|---|
| Chống gian lận | 2.1 red team; 2.2 fuzz kinh tế; 2.3 (đủ bằng cấu trúc); 2.4 audit log; 2.5 `PROTOCOL_VERSION` | C / A | xong (còn #263: ghi nhận thêm đầu thai, PK, thưởng bí cảnh lớn khi cần) |
| Deploy | 3.1 release → ghcr | C | #298 |
| Deploy | 3.2 cấu hình / bí mật; 3.3 giám sát; 3.4 sao lưu + khôi phục; 3.5 thử tải dài | C / A | xong (#279, #286, #291) |
| Deploy | 3.6 bản chạy thật + gói `deploy/` + `VAN_HANH.md` | C | #299 |
| Deploy | hàng rào cổng 2567 + ghi nhận Cloudflare Tunnel | A | #303 |
| App | nhịp tim ứng dụng (cả PWA) | A (shared + server, xong) / B (client + E2E) | #293 |
| App | M4.2a dự án Capacitor | B | #300 |
| App | M4.2b Back, xuống nền native, 426, quyền riêng tư | B | #301 |
| App | M4.2c dựng APK trên Actions | C | #302 |
| App | M4.2d thử máy Android thật | người dùng + B + C | tạo sau khi có APK |

Thứ tự: B: #293 → #300 → #301. C: #298 → #299 (phần tĩnh) → #302 (sau #300) → #299 phần chạy thật (sau khi có Docker + ảnh). A: merge #295, #303, review, đẩy thẻ `v0.1.0` sau khi #298 vào, #263.

## 6. Quyết định của người dùng (đã trả lời 11/11/2026)
Xem bảng "Quyết định đã chốt" ở đầu tài liệu. Các bước cần tay người dùng (cài Docker, đăng nhập `ghcr.io`, keystore Android...) nằm ở `~/TT/orchestra/questions.md`.
