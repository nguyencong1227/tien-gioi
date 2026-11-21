# Hồ Sơ Ứng Viên Phát Hành (Dự Kiến v0.5.3 / v0.6.0)

> **Lưu ý:** Tài liệu này CHỈ phục vụ chuẩn bị bằng chứng và rà soát kỹ thuật trước phát hành cho người dùng và nhóm phát triển (Refs #1290). **KHÔNG** tự ý gắn thẻ git tag (`v*`), **KHÔNG** kích hoạt `release.yml`, **KHÔNG** tự động triển khai hay can thiệp vào môi trường production (`~/TT/tien-gioi-prod/`, cổng 2567).

---

## Tóm Tắt Cho Người Dùng (Executive Summary)

- **Bản chất gói phát hành:** Gói này **KHÔNG BẬT MẶC ĐỊNH BẤT KỲ TÍNH NĂNG GAMEPLAY MỚI NÀO** (chặn đường `AMBUSH` vẫn TẮT, trùm thế giới `WORLD_BOSS` mặc định TẮT, gói tài nguyên riêng `ASSETS_PRIVATE_DIR` tắt; không thêm chiêu thức, vật phẩm, quái vật hay cảnh giới mới; `PROTOCOL_VERSION` giữ nguyên 6).
- **Người chơi THỰC SỰ THẤY:** 3 nhiệm vụ phụ mới tại Âm Sương Trạch (cảnh giới Kim Đan, #756) và trang Điều khoản sử dụng & Bản quyền mới (`terms.html`).
- **Người chơi KHÔNG THẤY:** Chuyển đổi kiến trúc bản đồ Tiled tĩnh (khớp từng byte với bản đồ seed cũ), cơ chế hồi vị trí lưu rơi vào vật cản, hạ tầng gói tài nguyên riêng, đấu trường solo.
- **Những việc cần NGƯỜI DÙNG quyết định trước khi phát hành:**
  1. *Kiểm tra Origin app Android:* Xác nhận tệp `.env.production` thật đã có `https://localhost` trong `CORS_ORIGINS` chưa (tránh bị bộ lọc Origin Guard mới từ chối kết nối 403).
  2. *Quyết định Trùm Thế Giới:* Có bật `WORLD_BOSS=on` hay không (đã có lịch thật: Thiên Hàn Vương ở Hàn Vân Lĩnh lúc 12:00, Hắc Giao ở Âm Sương Trạch lúc 21:00; lưu ý trùm sinh ở bản đồ thường, bị hạ là chết thật).
  3. *Quyết định Chặn Đường:* Có bật `AMBUSH=on` (kèm khuyến nghị `AMBUSH_MIN_POTIONS=2`) hay không (chờ trả lời 5 câu hỏi tại issue #1070).
  4. *Chọn số phiên bản:* `v0.5.3` (tuân thủ chặt chẽ định nghĩa 10.1 do không đổi giao thức) hay `v0.6.0` (đánh dấu mốc lớn 346 commits & kiến trúc Tiled).

---

## 1. Thông Tin Tổng Quan

- **Mốc so sánh:** Thẻ phát hành `v0.5.2` (commit `e4c1d717`, đối tượng thẻ `79c6b40e`) -> Đầu nhánh `main` hiện tại (commit `b007b456`).
- **Khối lượng tích luỹ:** **346 commit** (`git rev-list --count v0.5.2..origin/main`).
- **Hợp đồng `shared/src`:** Thay đổi **21 tệp** (`+4.134` dòng, `-58` dòng), trong đó:
  - Khoảng **2.000 dòng là kiểm thử** (`shared/src/*.test.ts`).
  - Phần mã nguồn thực tế (+2.134 dòng) gồm: hệ thống bản đồ Tiled / autotile / bake / map-files (~1.060 dòng), hợp đồng gói tài nguyên riêng `private-pack.ts` (246 dòng), dữ liệu kẻ chặn đường `ambush-data.ts` (506 dòng), nhiệm vụ phụ Âm Sương Trạch `quests.ts` (+71 dòng), lịch thật trùm thế giới `social.ts` (+52 dòng), cùng các mở rộng nhỏ ở `map.ts` và `ambush.ts`.
  - **Không có chiêu thức, vật phẩm, quái vật hay cảnh giới mới nào thêm từ v0.5.2:** `skills-*.ts` giữ nguyên 38 dòng `reqRealm`; `items.ts`, `game.ts`, `realms.ts` có `git diff` rỗng.
- **Phiên bản giao thức (`shared/src/protocol.ts`):**
  - `PROTOCOL_VERSION`: **`6`** (giữ nguyên từ `v0.5.2`).
  - `MIN_PROTOCOL_VERSION`: **`0`** (giữ nguyên, máy chủ tiếp tục chấp nhận client cũ).
- **Trạng thái lưu trữ:** Khuôn tệp lưu trữ dữ liệu nhân vật, chân linh, tông môn, tài khoản và cơ sở dữ liệu PostgreSQL hoàn toàn **không đổi** từ `v0.5.2` (`git diff v0.5.2..origin/main -- server/src/store.ts server/src/soul.ts server/src/sect-store.ts server/src/account-store.ts server/src/pg` RỖNG).

---

## 2. Danh Mục Thay Đổi Theo Góc Nhìn

### (a) Người chơi thấy gì (User-Facing Changes sau v0.5.2)

1. **Thực tế người chơi nhìn thấy:**
   - **Thêm 3 nhiệm vụ phụ tại Âm Sương Trạch (Kim Đan, #756):** `shared/src/quests.ts` (+71 dòng), giao bởi các NPC tại Âm Sương Trạch, mở rộng nội dung trải nghiệm cho cảnh giới Kim Đan.
   - **Trang Điều khoản sử dụng & Bản quyền mới trong game (`terms.html`):** Bổ sung trang pháp lý `terms.html` (chống sao chép, quy định dùng máy chủ, điều khoản tài khoản); tích hợp liên kết tại chân trang màn hình đăng nhập và trong bảng Cài đặt ("Giới thiệu và ghi công").
2. **Thay đổi kiến trúc hạ tầng (Người chơi KHÔNG thấy đổi gì về hình ảnh hay gameplay):**
   - **Chuyển đổi hệ thống bản đồ sang Tiled (S1 / S2 / S3a / S5):** Bốn bản đồ thường (`lac_ha`, `hac_phong`, `am_suong`, `han_van`) nay là tệp JSON tĩnh do máy chủ đọc và client nạp qua chunk `map-files-*.js`, khớp từng byte với bản đồ sinh theo seed cũ (0 spawnZone). `DEFAULT_MAP` chuyển sang đánh dấu `@deprecated` tại `shared/src/map.ts:776` và cấm import trực tiếp ngoài `shared/`; lưới tiếp cận va chạm `walk-reach` được dựng độc lập lúc tạo phòng.
   - **Cơ chế phục hồi vị trí lưu rơi vào ô vật cản (#1213, #1220):** Nếu vị trí lưu của nhân vật rơi vào ô bị chặn (ví dụ do chỉnh sửa địa hình bản đồ), máy chủ tự động đặt nhân vật vào vị trí di chuyển hợp lệ gần nhất trong bán kính an toàn thay vì kéo giật lùi về điểm sinh ngẫu nhiên trong khu an toàn / trấn của chính bản đồ đó.
3. **Chỉ xuất hiện khi bật cờ tính năng (Bản chạy thật đang TẮT nên người chơi chưa thấy):**
   - **Cảnh báo túi đan trong hộp thoại Chặn đường (CHỈ KHI `AMBUSH=on`):** Hộp thoại chủ động nhắc: *Túi không có đan hồi huyết: nên mang ít nhất 2.* hoặc *Túi chỉ còn 1 đan hồi huyết: nên mang ít nhất 2.*
   - **Khung ghi công tài nguyên riêng (CHỈ KHI CÓ GÓI):** Nằm trong mục "Giới thiệu và ghi công" của bảng Cài đặt (`client/src/private-credits.ts`), tự động ẩn khi máy chủ chưa cấu hình gói tài nguyên riêng.

---

### (b) Vận hành cần làm gì khi nâng cấp (Ops & Environment Changes)

Đối chiếu với `deploy/prod.sh`, `deploy/docker-compose.prod.yml` và `docs/TRIEN_KHAI.md`:

1. **RỦI RO LỚN NHẤT — Chống dùng ké & Bảo vệ nguồn gốc (`ORIGIN_CHECK` & `CORS_ORIGINS`):**
   - Tính năng mới hoàn toàn (`server/src/origin-guard.ts`), mặc định **BẬT** trong mã nguồn. Chặn mã lỗi 403 đối với HTTP, WebSocket và `/matchmake/*` nếu tiêu đề `Origin` không thuộc danh sách cho phép.
   - `ALLOWED_ORIGINS` mặc định đã có `https://tiengioi.hethongtm.site`.
   - **HÀNH ĐỘNG CẦN XÁC NHẬN:** Cần Người Dùng (người duy nhất có quyền xem `.env.production` thật) xác nhận xem biến `CORS_ORIGINS` trên bản chạy thật đã khai báo `https://localhost` (cho app Android WebView) hay chưa. Nếu thiếu, người chơi truy cập qua app Android có nguy cơ bị từ chối kết nối 403.
2. **Trùm Thế Giới Theo Giờ (`WORLD_BOSS`):**
   - ĐÃ CÓ LỊCH THẬT 2 khung giờ trong `shared/src/social.ts:270`:
     - **12:00 - 12:30 (UTC+7):** Thiên Hàn Vương tại Hàn Vân Lĩnh (`han_van`).
     - **21:00 - 21:30 (UTC+7):** Hắc Giao tại Âm Sương Trạch (`am_suong`).
     - *Cảnh báo vận hành (`server/src/systems/world-boss-config.ts`):* Trùm thế giới sinh ở bản đồ thường, người chơi bị hạ trong sự kiện là chết thật (qua luân hồi).
   - **Mặc định đổi chiều:** Trên `v0.5.2`, mã nguồn mặc định BẬT (`WORLD_BOSS !== "off"`, nhưng lúc đó lịch rỗng nên trùm không sinh); trên `main`, mã nguồn mặc định **TẮT** (chỉ kích hoạt khi có cờ `WORLD_BOSS=on`).
   - **Hành động:** Người Dùng kiểm tra `.env.production` thật: nếu đang có `WORLD_BOSS=on`, trùm thế giới sẽ xuất hiện thật vào 2 khung giờ trên ngay sau khi nâng cấp. Nếu chưa muốn kích hoạt, đảm bảo không đặt `WORLD_BOSS=on`.
3. **Thành Tựu & Danh Hiệu (`ACHIEVEMENTS`):**
   - Mặc định mã nguồn: TẮT (`ACHIEVEMENTS=off`), không đổi so với `v0.5.2`.
   - Bản chạy thật có thể ĐÃ ĐƯỢC BẬT theo quyết định M3 mục 57 khoản 2 (cấp bù Duyên cho người chơi cũ). Người Dùng kiểm tra `.env.production`: giữ nguyên cấu hình hiện tại của bản production, không tự ý tắt nếu đã bật.
4. **Gặp Chặn Đường (`AMBUSH` & `AMBUSH_MIN_POTIONS`):**
   - Mặc định: TẮT (`AMBUSH=off`). Giữ nguyên trạng thái TẮT chờ Người Dùng duyệt 5 câu hỏi phát hành ở issue #1070.
   - Nếu Người Dùng quyết định bật: thêm `AMBUSH=on`, khuyến nghị kèm `AMBUSH_MIN_POTIONS=2` (mặc định mã nguồn là 0; câu hỏi về việc có chặn người chơi thiếu đan hay không vẫn đang mở tại `questions.md`).
5. **Cập nhật mẫu Docker Compose (`deploy/docker-compose.prod.yml`):**
   - Tệp mẫu compose có thêm cấu hình:
     - Biến môi trường: `ASSETS_PRIVATE_DIR=/assets-private`
     - Volume mount: `${ASSETS_PRIVATE_DIST:-/mnt/data/assets-private/dist}:/assets-private:ro`
   - **Lưu ý quy trình:** Lệnh `./prod.sh up <tag>` KHÔNG làm tươi tệp compose thật (chỉ chạy `docker compose up` với compose hiện có). Việc chép compose mẫu chỉ nằm trong lệnh `cmd_init` (chép đè compose mẫu). Do đó, nếu muốn áp dụng cấu hình gói tài nguyên riêng, Người Dùng cần tự thêm tay 2 dòng này vào `~/TT/tien-gioi-prod/docker-compose.yml`.

---

### (c) Phân tích rủi ro & Phương án quay lui (Risk & Rollback Strategy)

1. **Khẳng định tính sẵn sàng của bản phát hành trước (`0.5.2`):**
   - Kiểm tra trực tiếp qua `docker manifest inspect ghcr.io/nguyencong1227/tien-gioi:0.5.2`:
     - Manifest ảnh chính (linux/amd64): `sha256:3fc14d1245cb1213f6cfb6f6ac86e793bfca916694115eb933bd29839c1cf2a1` (size 2953).
     - Manifest chứng thực buildx (unknown/unknown): `sha256:a195d6f726d54d97dadbe22fe099c447d0453c7a14d8d584e7ddd23bf39ab3df` (size 838).
   - Ảnh Docker `0.5.2` vẫn tồn tại đầy đủ và an toàn trên GHCR.
2. **Quy trình quay lui (Rollback):**
   - Khi phát sinh sự cố sau triển khai, sử dụng lệnh quay lui chuẩn của script vận hành:
     ```bash
     cd ~/TT/tien-gioi-prod
     ./prod.sh rollback
     # hoặc: ./prod.sh up 0.5.2
     ```
3. **Tính tương thích dữ liệu khi nâng cấp và lùi bản (Upgrade & Rollback Compatibility):**
   - **Thực nghiệm nâng cấp v0.5.2 -> main (Mục 2, Refs #1290, comment 7070961872 trên PR #1291):** Đã kiểm chứng độc lập trên dữ liệu thật sinh từ `v0.5.2` (30 bot, 30 chân linh, 2 tông môn) nạp trên `main`: 30/30 bot đăng nhập thành công, nạp và ghi lưu an toàn, `kiem-save` 100% sạch (30 nhân vật, 30 chân linh, 2 tông môn), 0 tệp `*.hong-*`, bảo toàn ví (10.971 = 10.971)/tu vi/túi/trang bị/chiêu thức (Dev A xác nhận số đo thô tại comment 7071057361 trên PR #1291).
   - **Thực nghiệm lùi bản main -> v0.5.2 (Mục 2b, Refs #1290, comment 7071033214 trên PR #1291):** Khởi động máy chủ `v0.5.2` trên BẢN SAO dữ liệu đã được `main` ghi lại: 30/30 bot đăng nhập thành công vào `v0.5.2`, ghi lưu an toàn; công cụ `audit-saves.ts` của `v0.5.2` đạt 30/30 nhân vật sạch, 30/30 chân linh sạch, 2/2 tông môn sạch, 0 tệp `*.hong-*`; 30/30 tệp nhân vật chỉ khác đúng `updatedAt` và `life.playMs` (toàn bộ thuộc tính, tu vi, ví tiền, trang bị, chiêu thức, chân linh, tông môn đều khớp nguyên vẹn - Dev A đối chiếu độc lập từ dữ liệu thô xác nhận tại comment 7071057361 trên PR #1291).
   - **Cơ sở cấu trúc:** Do khuôn tệp lưu trữ không thêm trường mới nào từ `v0.5.2` (`git diff` rỗng ở `store.ts`, `soul.ts`, `sect-store.ts`, `account-store.ts`, `pg/`), việc lùi bản từ `main` về `v0.5.2` không làm bản cũ ghi đè hay làm mất các trường dữ liệu cốt lõi.
   - **Công cụ tự động hoá:** Việc đóng gói kịch bản kiểm tra nâng cấp / lùi bản thành công cụ tự động chạy bằng script độc lập sẽ được xem xét và gửi trong PR riêng sau khi rà soát độ an toàn của việc dọn dẹp thư mục tạm.

4. **6 Giới hạn cần nhớ khi đọc số đo thực nghiệm:**
   1. *Hiệu lực commit:* Kết quả thực nghiệm chỉ có hiệu lực với đúng đầu commit `b007b456`; khi nhánh `main` có commit mới phải thực hiện lại quy trình kiểm tra nâng cấp.
   2. *Chân linh & Tông môn:* Thư mục `souls/` và `sects/` có thời gian sửa đổi (mtime) giữ nguyên mốc sao chép vì kịch bản đăng nhập ngắn chỉ đọc mà không ghi lại chúng (chưa có luân hồi hay giao dịch kho trong kịch bản).
   3. *Origin Guard:* Thử nghiệm chạy với `ORIGIN_CHECK=off` nên lớp chặn Origin chưa được thử dưới tải đăng nhập thực tế.
   4. *Backend lưu trữ:* Thử nghiệm thực hiện trên kho tệp JSON (`STORE=file`), không phải PostgreSQL (`STORE=pg`), mặc dù mã migration PG không đổi từ `v0.5.2`.
   5. *Biến động tu vi:* Điểm tu vi không đổi ở cả 30 nhân vật do bot chỉ đả tọa ngắn 100-150ms.
   6. *Bản chất bài test:* 30 bot đăng nhập trong 30 giây là bài kiểm tra tính tương thích nạp/lưu và cấu trúc dữ liệu hai chiều, KHÔNG PHẢI là bài thử tải dài (soak test).

---

## 3. Đề Xuất Số Phiên Bản (Version Number Recommendation)

Trích dẫn nguyên văn quy tắc đánh số phiên bản tại `docs/TRIEN_KHAI.md` mục 10.1:
> - **Sửa lỗi / Tối ưu nhỏ (tăng `PATCH`):** Khi sửa lỗi hiển thị, sửa logic nhiệm vụ, cân bằng quái vật hoặc tối ưu hiệu năng mà **không** làm thay đổi cấu trúc gói tin `shared/` (ví dụ: `v0.1.0` -> `v0.1.1`).
> - **Thay đổi giao thức / Hợp đồng `shared/` (tăng `MINOR`):** Bắt buộc phải tăng `MINOR` (ví dụ: `v0.1.0` -> `v0.2.0`), đồng thời tăng hằng số `PROTOCOL_VERSION` trong `shared/src/protocol.ts` (xem mục 2.5). Client quá cũ sẽ nhận lỗi 426 và hướng dẫn người chơi tải lại trang.

### Đánh giá hai phương án:

1. **Phương án A: `v0.5.3` (Theo nguyên văn quy tắc 10.1)**
   - *Lập luận:* Hằng số `PROTOCOL_VERSION` giữ nguyên `6` (`shared/src/protocol.ts`), `MIN_PROTOCOL_VERSION` giữ nguyên `0`. Mọi thay đổi trong `shared/` (Tiled, private-pack, quests) đều được thiết kế tương thích ngược để client cũ không bị từ chối 426. Chiểu đúng câu chữ của mục 10.1, bản này không tăng `PROTOCOL_VERSION` nên thuộc diện `PATCH` (`v0.5.3`).
2. **Phương án B: `v0.6.0` (Phán đoán theo quy mô kỹ thuật & tính năng)**
   - *Lập luận:* Sau `v0.5.2` đã tích luỹ tới 346 commits. Hệ thống có bước chuyển đổi kiến trúc lớn (chuyển 4 bản đồ sang Tiled đọc từ tệp tĩnh, tích hợp lớp bảo vệ Origin Guard chống dùng ké, bổ sung hạ tầng gói tài nguyên riêng, tích hợp lịch thật trùm thế giới). Đánh số `v0.6.0` giúp đánh dấu rõ ràng mốc hoàn thành đợt nâng cấp Tiled và an toàn hệ thống.

**Kết luận:** Đề xuất Người Dùng cân nhắc lựa chọn giữa sự tuân thủ chặt chẽ định nghĩa 10.1 (`v0.5.3`) hoặc phản ánh quy mô cột mốc phát triển (`v0.6.0`).
