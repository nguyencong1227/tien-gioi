# Phân công M4 (các việc "M4-sớm" đã làm; phần còn lại là ĐỀ XUẤT của Dev A, chờ người dùng chốt)

> Dựa trên `GDD.md` (M4: chống gian lận, deploy, build app Android / iOS) và trạng thái thực tế sau M3 (bước 1-6 xong: tổng kết ở `docs/PHAN_CONG_M3.md`). Các việc "M4-sớm" (không phụ thuộc các câu hỏi ở mục 6) đã được giao và làm: #251 (B, PWA + hiệu năng di động), #252 (C, red team), #253 (A, fuzz kinh tế), #257 (B + A, `PROTOCOL_VERSION` và rà tài sản), #263 (A, audit log), #269 (B, trợ năng; **xong**), #276 (C, cấu hình + khôi phục). Các việc còn lại (release, Capacitor, giám sát, thử tải dài) chưa có issue và cần người dùng trả lời các câu hỏi ở mục 6. Bảng trạng thái ngay dưới đây.

## 0. Trạng thái (cập nhật 11/11/2026, `main` `a28de68` trở đi)
| Mục | Trạng thái | Bằng chứng / việc còn lại |
|---|---|---|
| 2.1 red team tin nhắn | **Xong** | `npm run red-team -w server` (#265): 48 loại tin x nhiều biến thể payload x 2 người gửi (nghèo / giàu) = 2688 đòn, bắt `[lỗi]`, bất biến SỐNG, tự phát hiện loại tin; A đã thử 3 đột biến thật vào `WorldRoom.ts`, đều đỏ |
| 2.2 fuzz bất biến kinh tế | **Xong** | `economy-fuzz` (gđ 1), `kill-share-fuzz`, `sect-life-fuzz` (#271: tìm và sửa lỗi MẤT Linh thạch khi rút kho ở Hoàng Tuyền), `sect-crash` |
| 2.3 kiểm tốc độ / dịch chuyển | **Kết luận: đủ bằng cấu trúc** | không làm cờ riêng (xem mục 2.3) |
| 2.4 audit log | **Xong lát 1 + 2** (#266, #268) | còn (khi cần): đầu thai, PK, thưởng bí cảnh lớn (issue #263 còn mở) |
| 2.5 `PROTOCOL_VERSION` | **Xong** | shared #258, server #261, client #264, sửa modal #270, E2E #267 + #272 |
| 3.1 release workflow | Chưa | chờ người dùng (kho ảnh Docker) |
| 3.2 cấu hình / bí mật; 3.4 sao lưu + khôi phục | **Xong** (#279, issue #276) | `npm run check:env`, `npm run khoi-phuc-thu`, `docs/TRIEN_KHAI.md` mục 7.3 / 7.4 |
| 3.3 giám sát (`/metrics`, cảnh báo log, xoay vòng log) | **Xong** (PR của nhánh `a/health-mo-rong`) | `server/src/metrics.ts`: `GET /metrics` (Bearer `METRICS_TOKEN`, mặc định tắt) với tick p50 / p95 / max theo phòng, hàng đợi ghi nhân vật, phòng / người, RSS, độ trễ vòng lặp; `[CẢNH BÁO]` / `[ĐÃ ỔN]` trong log; `docker-compose.yml` xoay vòng log; `/health` giữ nguyên; `docs/TRIEN_KHAI.md` mục 5.1 |
| 3.5 thử tải dài | **Đang làm** (C) | issue #282 (`npm run soak`) |
| 4.1 PWA | **Xong** (#251) | `npm run check:pwa` |
| 4.2 Capacitor Android | **Có thiết kế** (#283, issue #280) | `docs/THIET_KE_APP_ANDROID.md`; chờ người dùng chốt hướng (Capacitor hay TWA, kênh phát hành, tên miền / `applicationId`) rồi A tạo issue M4.2a-1 (CORS, bắt buộc trước) và M4.2a-e |
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
1. **Phát hành tự động** (C): workflow `release.yml` khi gắn thẻ phiên bản: build + test + đẩy ảnh Docker (kho ảnh do người dùng chọn), kèm `CHANGELOG` sinh từ tiêu đề PR.
2. **Cấu hình và bí mật** (C + A): danh sách biến môi trường chính thức (`docs/TRIEN_KHAI.md`), kiểm khi khởi động (`startupWarnings`), mẫu `.env.production.example`; không bao giờ commit bí mật. **Xong (#276):** bảng 15 biến chính thức trong `docs/TRIEN_KHAI.md`, script/test `check:env` quét `server/src` chống hồi quy / phát hiện biến chưa khai báo (đột biến đỏ), file `.env.production.example` chuẩn cho Docker Compose.
3. **Giám sát** (A + C): `/health` mở rộng (số phòng, người chơi, tick p95, kích thước hàng đợi ghi), có thể `/metrics` dạng văn bản đơn giản; cảnh báo khi tick > ngưỡng hoặc hàng đợi ghi đầy; xoay vòng log.
4. **Sao lưu và khôi phục có kiểm chứng** (C): lịch `backup`, thử khôi phục định kỳ trong CI (đã có `backup.test.ts`), tài liệu "khi sập" cho cả `STORE=file` và `STORE=pg` (kể cả di chuyển tệp -> PostgreSQL bằng `chuyen-du-lieu`). **Xong (#276):** `npm run khoi-phuc-thu` (`server/scripts/verify-restore.ts`), test tích hợp trong `backup.test.ts` (0 lỗi `kiem-save`, SHA-256 100% khớp, 2 đột biến thiếu `souls/` hoặc `sects/` đều đỏ), tài liệu mục 7.3 & 7.4 `docs/TRIEN_KHAI.md` (chuẩn hoá lệnh giải nén cụ thể + `pg_dump`/`pg_restore`).
5. **Thử tải dài** (C): 100+ người 1-2 giờ (bot), đo rò rỉ bộ nhớ (`VmRSS`), tick p95, byte/tick; hồi quy so với mốc `bench-baseline.json`.

## 4. App Android / iOS (Capacitor)
1. **PWA hoàn chỉnh** (B): kiểm Lighthouse (cài được, ngoại tuyến cho vỏ ứng dụng, biểu tượng đủ cỡ, `theme_color`), cập nhật `sw.js` an toàn (không giữ bản client cũ).
2. **Dự án Capacitor** (B): thư mục `app/` (cấu hình, nền tảng Android trước), build từ `client/dist`; kết nối tới server qua HTTPS + WSS (địa chỉ cấu hình được); xử lý vòng đời ứng dụng (nền / tiền cảnh = rớt mạng và nối lại), thanh trạng thái, tai thỏ, phím quay lại.
3. **Hiệu năng di động** (B): đo FPS / bộ nhớ trên máy tầm trung; giảm hiệu ứng khi yếu; âm thanh theo luật tự phát của trình duyệt / WebView.
4. **Tài sản và giấy phép** (B + A): rà `CREDITS.md` (chỉ CC0 / CC-BY, không dùng chữ / hình / âm của game khác), ảnh cửa hàng ứng dụng do người dùng cung cấp (ngoài phạm vi tự động).
5. **iOS**: cần máy macOS và tài khoản nhà phát triển: người dùng quyết định (xem câu hỏi).

## 5. Đề xuất chia việc (A tạo issue sau khi người dùng chốt)
| Nhóm | Việc | Ai |
|---|---|---|
| Chống gian lận | 2.1 red team tin nhắn (công cụ) / sửa lỗi tìm ra | C / A |
| Chống gian lận | 2.2 property test bất biến kinh tế; 2.3 cờ tốc độ; 2.4 audit log; 2.5 `PROTOCOL_VERSION` | A (2.5: A + B) |
| Deploy | 3.1 release workflow; 3.2 cấu hình / bí mật; 3.4 sao lưu + khôi phục; 3.5 thử tải dài | C |
| Deploy | 3.3 giám sát (`/health` mở rộng, `/metrics`) | A + C |
| App | 4.1 PWA hoàn chỉnh; 4.2 Capacitor Android; 4.3 hiệu năng di động; 4.4 giấy phép | B (4.4: B + A) |

Thứ tự gợi ý: 2.1 và 2.2 trước (rẻ, tìm lỗi thật), 2.4 và 3.3 (cần cho vận hành), rồi 3.x, 4.x song song.

## 6. Câu hỏi cho người dùng (không chặn M3, cần trả lời trước khi bắt đầu M4)
1. **Máy chủ chạy thật ở đâu** (VPS tự quản, nhà cung cấp đám mây, máy tại nhà) và **kho ảnh Docker** nào (GitHub Container Registry?), tên miền? Quyết định này định hình `release.yml`, HTTPS và giám sát.
2. **PostgreSQL thật** hay giữ `STORE=file` cho bản đầu? (Đã sẵn cả hai; PostgreSQL cần dịch vụ và sao lưu riêng.)
3. **Android trước, iOS sau?** iOS cần macOS + tài khoản nhà phát triển trả phí (ngoài khả năng tự động hoá ban đêm).
4. **Mức phạt khi phát hiện gian lận** ở bản đầu: chỉ ghi nhận / cảnh báo (đề xuất), hay ngắt kết nối / khoá tài khoản?
5. Các câu còn mở từ M3 (không chặn): phí lập tông môn 1000 Linh thạch; người gục trong bí cảnh đến Lạc Hà đầy khí huyết (không lưu khí huyết trong hồ sơ).
