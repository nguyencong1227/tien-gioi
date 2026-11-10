# Phân công M4 (BẢN ĐỀ XUẤT của Dev A, chờ người dùng chốt, chưa bắt đầu làm)

> Dựa trên `GDD.md` (M4: chống gian lận, deploy, build app Android / iOS) và trạng thái thực tế sau M3 (bước 1-6 xong trừ công cụ thử tải tông môn #231). **Chỉ có ba issue "M4-sớm" (việc không phụ thuộc các câu hỏi ở mục 6): #251 (B, PWA + đo hiệu năng di động), #252 (C, red team tin nhắn), #253 (A, property test kinh tế)**; các việc còn lại chưa có issue. Các câu hỏi cần người dùng ở cuối file. Khi người dùng chốt hướng đi, A tạo issue theo bảng ở mục 5.

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
2. **Bất biến kinh tế bằng thử nghiệm thuộc tính (property / fuzz test)** (A): chuỗi thao tác ngẫu nhiên (mua / bán / nhặt / vứt / đổi đồ / góp / rút / lập tông môn / chết / đầu thai / qua cổng) với hạt giống cố định; sau mỗi bước kiểm: Linh thạch tổng của hệ thống không tăng ngoài nguồn hợp lệ (rơi từ quái, thưởng, bán), số đồ không âm / không vượt trần, không đồ nhân đôi. Mở rộng test bảo toàn tiền đã có ở `systems/sect.test.ts`. **Giai đoạn 1 xong (#253):** `systems/economy-fuzz.test.ts` (16 hạt x 700 bước mặc định, ~6 s; chạy sâu `FUZZ_SEEDS=400 FUZZ_STEPS=2000 npx vitest run server/src/systems/economy-fuzz.test.ts`) kiểm sau MỖI bước mua / bán / vứt / nhặt / mặc / tháo / dùng đan / đổi / rèn / nhiệm vụ (thưởng một lần) / đồ rơi hết hạn / lưu - nạp / chết - đầu thai: độ lệch Linh thạch + vật phẩm (túi + trang bị + đất) đúng công thức của thao tác, cộng bất biến cấu trúc; kèm kiểm dữ liệu giá (không có vòng mua - đổi - bán có lãi) và `splitCoin` / `addCoin`. 400 hạt x 2000 bước (~800 nghìn thao tác) không tìm ra lỗi; 12 đột biến đều đỏ. **Giai đoạn 2 (một phần):** `systems/kill-share-fuzz.test.ts` gọi `killMonster` THẬT trên thế giới ngẫu nhiên (người lẻ, đội 2-4, người ở xa, người ngã, người rời phòng còn trong sổ sát thương): tổng Linh thạch cả phòng tăng đúng bằng số quái đã tung (lập đội không sinh thêm tiền, không mất đồng lẻ), từng người nhận đúng trọng số (sai số < 1 đồng), người không đủ điều kiện nhận 0, đồ rơi đúng bảng / số lượng, chủ đồ đúng mô hình (20 000 hạt không có lỗi; 7 đột biến đều đỏ). Còn lại: tông môn trong cùng chuỗi ngẫu nhiên (đã có `sect-crash.test.ts`), qua cổng / rớt mạng nhiều phòng.
3. **Kiểm tốc độ / dịch chuyển phía server** (A): đo vận tốc hiệu dụng theo thời gian thật (không chỉ theo số input), cờ khi vượt ngưỡng liên tục (gửi input vượt 20 / giây kéo dài, `seq` nhảy, `lastSeq` lùi); chỉ ghi nhận / cảnh báo ở bản đầu, chưa ngắt (tránh tay lỡ phạt oan).
4. **Nhật ký kiểm toán (audit log) có cấu trúc** (A): mỗi sự kiện nhạy cảm một dòng JSON (đăng nhập thất bại nhiều lần, ngắt kết nối vì spam, thay đổi Linh thạch lớn, lập / giải tán tông môn, rút kho, đầu thai, cờ tốc độ) kèm `soulKey` băm một chiều, không chứa mật khẩu / token / chuỗi kết nối; xoay vòng tệp. Công cụ `kiem-save` / `tai-khoan` đọc được.
5. **Kiểm thử đối xử với client lỗi thời** (B + A): `PROTOCOL_VERSION` trong `shared/` gửi lúc vào phòng, server từ chối client quá cũ bằng thông báo thân thiện (không treo).

## 3. Deploy
1. **Phát hành tự động** (C): workflow `release.yml` khi gắn thẻ phiên bản: build + test + đẩy ảnh Docker (kho ảnh do người dùng chọn), kèm `CHANGELOG` sinh từ tiêu đề PR.
2. **Cấu hình và bí mật** (C + A): danh sách biến môi trường chính thức (`docs/TRIEN_KHAI.md` đã có một phần), kiểm khi khởi động (`startupWarnings`), mẫu `.env.production.example`; không bao giờ commit bí mật.
3. **Giám sát** (A + C): `/health` mở rộng (số phòng, người chơi, tick p95, kích thước hàng đợi ghi), có thể `/metrics` dạng văn bản đơn giản; cảnh báo khi tick > ngưỡng hoặc hàng đợi ghi đầy; xoay vòng log.
4. **Sao lưu và khôi phục có kiểm chứng** (C): lịch `backup`, thử khôi phục định kỳ trong CI (đã có `backup.test.ts`), tài liệu "khi sập" cho cả `STORE=file` và `STORE=pg` (kể cả di chuyển tệp -> PostgreSQL bằng `chuyen-du-lieu`).
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
