# Hồ Sơ Phát Hành v0.5.3 (Cắt từ main)

> **Lưu ý:** Tài liệu này phục vụ hồ sơ kỹ thuật và đối chiếu trước phát hành cho nhóm phát triển và người dùng (Refs #1290). Việc gắn thẻ git tag (`v0.5.3`), kích hoạt `release.yml`, và triển khai production (`~/TT/tien-gioi-prod/`, cổng 2567) tuân thủ chặt chẽ quyết định tại `~/TT/orchestra/QUYET_DINH_M3.md` mục 65.

---

## Tóm Tắt Quyết Định Phát Hành (Executive Summary)

Theo quyết định chính thức của Người Dùng (`~/TT/orchestra/QUYET_DINH_M3.md` mục 65, 22/11/2026 ~10:10):
- **Số phiên bản:** **`v0.5.3`** (tuân thủ quy tắc 10.1 của `docs/TRIEN_KHAI.md` do `PROTOCOL_VERSION` giữ nguyên `6`).
- **Điểm cắt phát hành:** Cắt từ **đầu nhánh `main`** (bao gồm #1293, #1299 +4 chiêu Kim/Thổ). **Thời điểm cắt:** Cắt **SAU KHI** bộ kiểm thử định kỳ hàng đêm gồm nightly e2e (03:00 giờ VN) và bench (04:00 giờ VN) đạt kết quả **XANH trên ĐÚNG đầu commit đó**; nếu đỏ thì sửa/chạy lại, tuyệt đối không cắt từ đầu commit đỏ.
- **Bản chất gói phát hành:** Gói này **KHÔNG BẬT MẶC ĐỊNH BẤT KỲ TÍNH NĂNG GAMEPLAY MỚI NÀO**:
  - `AMBUSH`: **CHƯA BẬT** ở bản này (`AMBUSH=off`). Nếu sau này bật, giữ nguyên mặc định mã nguồn `AMBUSH_MIN_POTIONS=0` (mục 64: người không có đan VẪN bị chặn, hộp thoại cảnh báo rõ "Ngươi không mang Hồi Huyết Đan — nên bỏ chạy", kẻ cầm đầu mạnh cảnh báo khi < 2 đan; KHÔNG đặt 2).
  - `WORLD_BOSS`: **CHƯA BẬT** ở bản này (`WORLD_BOSS=off`). Nếu sau này bật, quy tắc giữ nguyên: bị hạ khi đánh trùm thế giới = CHẾT THẬT (mất kiếp) như bản đồ thường (mục 64).
  - `ASSETS_PRIVATE_DIR`: TẮT (chưa nạp gói tài nguyên riêng).
  - Không thêm cảnh giới hay quái vật mới; `PROTOCOL_VERSION` giữ nguyên `6`.
- **Người chơi THỰC SỰ THẤY:**
  - 3 nhiệm vụ phụ mới tại Âm Sương Trạch (cảnh giới Kim Đan, #756).
  - 4 chiêu thức mới thuộc hệ Kim & Thổ (#1187, #1299: 53 -> 57 chiêu học được): *Kim Thoa Xuyên Tâm* (Luyện Khí), *Thực Giáp Phi Tán* (Trúc Cơ), *Thiết Sa Chưởng* (Luyện Khí), *Chướng Vũ Phong Lâm* (Nguyên Anh) cùng 4 kinh quyển tương ứng (2 quyển bán ở shop Luyện Khí, 2 quyển rơi hiếm từ Xích Mãng 1% và Phong Nha 0,8%).
  - Trang Điều khoản sử dụng & Bản quyền mới (`terms.html`).
- **Người chơi KHÔNG THẤY:** Chuyển đổi kiến trúc bản đồ Tiled tĩnh (khớp từng byte với bản đồ seed cũ), cơ chế phục hồi vị trí lưu rơi vào vật cản, hạ tầng gói tài nguyên riêng (đấu trường solo đã có từ v0.5.0, vẫn tắt).
- **Trạng thái môi trường Production:**
  - `.env.production` thật đã có `CORS_ORIGINS=https://localhost` (cho app Android WebView; Claude điều phối đã kiểm tra).
  - Không tạo gói APK ở bản này (mục 37).
  - Giữ nguyên mọi cờ cấu hình khác trong `.env.production` (`TEST_EXP_MULT=Han:3,Hàn Tuyết:3`, `BOSS_MOVES=on`, `ACHIEVEMENTS=on`, `CORS_ORIGINS`).
  - Quyền thực hiện: Dev A (hoặc C) được phép gắn thẻ `v0.5.3`, kích hoạt `release.yml`, chạy `prod.sh backup`, `prod.sh up v0.5.3`, `prod.sh rollback` theo mục 35, 49, 54, 65.

---

## 1. Thông Tin Tổng Quan & Số Liệu Đo Bằng Lệnh

Các số liệu được đo trực tiếp từ git (ghi kèm lệnh kiểm tra để người cắt phát hành có thể đối chiếu lại tại thời điểm cắt):

| Hạng mục | Mốc `66aef6aa` (trước #1299) | Đầu `main` hiện tại (`93bbe7fa` sau #1307) | Lệnh kiểm tra |
|---|---:|---:|---|
| **Tổng số commit sau `v0.5.2`** | 354 commit | **379 commit** (tại `575a3887`: 377) | `git rev-list --count v0.5.2..<commit>` |
| **Commit first-parent (PR merge)** | 79 commit | **87 commit** (tại `575a3887`: 86) | `git rev-list --first-parent --count v0.5.2..<commit>` |
| **Biến động `shared/src`** | 21 tệp (+4.134 / -58) | **24 tệp (+4.243 / -62)** | `git diff --shortstat v0.5.2..<commit> -- shared/src` |
| **Quái vật và cảnh giới mới** | 0 | **0** | `git diff v0.5.2..<commit> -- shared/src/game.ts shared/src/realms.ts` (RỖNG) |
| **Khuôn lưu trữ dữ liệu** | Không đổi | **Không đổi** | `git diff v0.5.2..<commit> -- server/src/store.ts server/src/soul.ts server/src/sect-store.ts server/src/account-store.ts server/src/pg` (RỖNG) |
| **Phiên bản giao thức** | `v: 6` (min: `0`) | **`v: 6` (min: `0`)** | `git diff v0.5.2..<commit> -- shared/src/protocol.ts` (RỖNG) |

**Chi tiết biến động trong `shared/src` (24 tệp, +4.243 / -62 dòng tại `575a3887`):**
- Khoảng **2.000 dòng là kiểm thử** (`shared/src/*.test.ts`).
- Hệ thống bản đồ Tiled tĩnh: ~1.060 dòng.
- Hợp đồng gói tài nguyên riêng: `private-pack.ts` (246 dòng).
- Dữ liệu kẻ chặn đường: `ambush-data.ts` (506 dòng).
- Nhiệm vụ phụ Âm Sương Trạch: `quests.ts` (+71 dòng).
- Lịch thật trùm thế giới: `social.ts` (+52 dòng).
- 4 chiêu Kim & Thổ mới: `skills-kim-tho.ts` (+93 dòng, tăng từ 53 lên 57 chiêu học được; #1299).
- Bảng rơi kinh quyển hiếm: `items.ts` (+5 dòng).
- Mở rộng nhỏ tại `map.ts` và `ambush.ts`.

---

## 2. Danh Mục Thay Đổi Theo Góc Nhìn

### (a) Người chơi thấy gì (User-Facing Changes sau v0.5.2)

1. **Thực tế người chơi nhìn thấy:**
   - **4 chiêu thức mới thuộc hệ Kim & Thổ (#1187, #1299):** *Kim Thoa Xuyên Tâm* (Luyện Khí), *Thực Giáp Phi Tán* (Trúc Cơ), *Thiết Sa Chưởng* (Luyện Khí), *Chướng Vũ Phong Lâm* (Nguyên Anh) cùng 4 kinh quyển tương ứng. Tổng số chiêu học được trong game tăng từ 53 lên 57.
   - **3 nhiệm vụ phụ tại Âm Sương Trạch (Kim Đan, #756):** `shared/src/quests.ts` (+71 dòng), giao bởi các NPC tại Âm Sương Trạch, mở rộng nội dung trải nghiệm cho cảnh giới Kim Đan.
   - **Trang Điều khoản sử dụng & Bản quyền mới trong game (`terms.html`):** Bổ sung trang pháp lý `terms.html` (chống sao chép, quy định dùng máy chủ, điều khoản tài khoản); tích hợp liên kết tại chân trang màn hình đăng nhập và trong bảng Cài đặt ("Giới thiệu và ghi công").
2. **Thay đổi kiến trúc hạ tầng (Người chơi KHÔNG thấy đổi gì về hình ảnh hay gameplay):**
   - **Chuyển đổi hệ thống bản đồ sang Tiled (S1 / S2 / S3a / S5):** Bốn bản đồ thường (`lac_ha`, `hac_phong`, `am_suong`, `han_van`) nay là tệp JSON tĩnh do máy chủ đọc và client nạp qua chunk `map-files-*.js`, khớp từng byte với bản đồ sinh theo seed cũ (0 spawnZone). `DEFAULT_MAP` chuyển sang đánh dấu `@deprecated` tại `shared/src/map.ts:776`; lưới tiếp cận va chạm `walk-reach` được dựng độc lập lúc tạo phòng.
   - **Cơ chế phục hồi vị trí lưu rơi vào ô vật cản (#1213, #1220):** Nếu vị trí lưu của nhân vật rơi vào ô bị chặn (ví dụ do chỉnh sửa địa hình bản đồ), máy chủ tự động đặt nhân vật vào vị trí di chuyển hợp lệ gần nhất trong bán kính an toàn thay vì kéo giật lùi về điểm sinh ngẫu nhiên trong khu an toàn / trấn của chính bản đồ đó.
3. **Chỉ xuất hiện khi bật cờ tính năng (Bản chạy thật đang TẮT nên người chơi chưa thấy):**
   - **Cảnh báo túi đan trong hộp thoại Chặn đường (CHỈ KHI `AMBUSH=on`):** Hộp thoại chủ động nhắc: *Túi không có đan hồi huyết: nên bỏ chạy.* hoặc cảnh báo khi mang dưới 2 đan đối với kẻ cầm đầu mạnh.
   - **Khung ghi công tài nguyên riêng (CHỈ KHI CÓ GÓI):** Nằm trong mục "Giới thiệu và ghi công" của bảng Cài đặt (`client/src/private-credits.ts`), tự động ẩn khi máy chủ chưa cấu hình gói tài nguyên riêng.

---

### (b) Vận hành cần làm gì khi nâng cấp (Ops & Environment Changes)

Đối chiếu với `deploy/prod.sh`, `deploy/docker-compose.prod.yml` và `docs/TRIEN_KHAI.md`:

1. **Chống dùng ké & Bảo vệ nguồn gốc (`ORIGIN_CHECK` & `CORS_ORIGINS`):**
   - Tính năng mới (`server/src/origin-guard.ts`), mặc định **BẬT** trong mã nguồn. Chặn mã lỗi 403 đối với HTTP, WebSocket và `/matchmake/*` nếu tiêu đề `Origin` không thuộc danh sách cho phép.
   - `ALLOWED_ORIGINS` mặc định đã có `https://tiengioi.hethongtm.site`.
   - **Trạng thái:** Biến `CORS_ORIGINS=https://localhost` ĐÃ CÓ trong `.env.production` thật (cho app Android WebView; Claude điều phối đã kiểm tra theo mục 65).
2. **Trùm Thế Giới Theo Giờ (`WORLD_BOSS`):**
   - ĐÃ CÓ LỊCH THẬT 2 khung giờ trong `shared/src/social.ts:270` (12:00 Thiên Hàn Vương tại Hàn Vân Lĩnh, 21:00 Hắc Giao tại Âm Sương Trạch). Bị hạ khi đánh trùm thế giới là chết thật qua luân hồi (mục 64).
   - **Mặc định:** Mã nguồn mặc định **TẮT** (`WORLD_BOSS=off`). Người dùng đã quyết định: **CHƯA BẬT** ở bản `v0.5.3` này (mục 65). Đảm bảo `.env.production` không có `WORLD_BOSS=on`.
3. **Thành Tựu & Danh Hiệu (`ACHIEVEMENTS`):**
   - Mặc định mã nguồn: TẮT (`ACHIEVEMENTS=off`).
   - Bản chạy thật đã bật theo quyết định M3 mục 57 khoản 2 (cấp bù Duyên cho người chơi cũ). Giữ nguyên cấu hình hiện tại trong `.env.production`.
4. **Gặp Chặn Đường (`AMBUSH` & `AMBUSH_MIN_POTIONS`):**
   - **Mặc định:** TẮT (`AMBUSH=off`). Người dùng đã quyết định: **CHƯA BẬT** ở bản `v0.5.3` này (mục 65).
   - Quyết định mục 64 đã chốt: Nếu sau này bật `AMBUSH=on`, giữ nguyên mặc định mã nguồn `AMBUSH_MIN_POTIONS=0`, người không có đan vẫn bị chặn và hộp thoại cảnh báo "nên bỏ chạy" (KHÔNG đặt biến môi trường này thành 2).
5. **Cập nhật mẫu Docker Compose (`deploy/docker-compose.prod.yml`):**
   - Tệp mẫu compose có thêm cấu hình:
     - Biến môi trường: `ASSETS_PRIVATE_DIR=/assets-private`
     - Volume mount: `${ASSETS_PRIVATE_DIST:-/mnt/data/assets-private/dist}:/assets-private:ro`
   - Bản `v0.5.3` chưa dùng gói tài nguyên riêng nên không cần can thiệp tệp compose thật.

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
   - **Thực nghiệm nâng cấp v0.5.2 -> main (Refs #1290, comment 7070961872 và 7070986258):** Đã kiểm chứng độc lập trên dữ liệu thật sinh từ `v0.5.2` (30 bot, 30 chân linh, 2 tông môn) nạp trên `main`: 30/30 bot đăng nhập thành công, nạp và ghi lưu an toàn, `kiem-save` 100% sạch (30 nhân vật, 30 chân linh, 2 tông môn), 0 tệp `*.hong-*`, bảo toàn ví (`10.971 = 10.971`), tu vi, túi, trang bị, chiêu thức.
   - **Thực nghiệm lùi bản main -> v0.5.2 (Refs #1290, comment 7071033214 và 7071057361):** Khởi động máy chủ `v0.5.2` trên BẢN SAO dữ liệu đã được `main` ghi lại: 30/30 bot đăng nhập thành công vào `v0.5.2`, ghi lưu an toàn; `audit-saves.ts` của `v0.5.2` đạt 30/30 nhân vật sạch, 30/30 chân linh sạch, 2/2 tông môn sạch, 0 tệp `*.hong-*`; 30/30 tệp nhân vật chỉ khác đúng `updatedAt` và `life.playMs` (toàn bộ thuộc tính, tu vi, ví tiền, trang bị, chiêu thức, chân linh, tông môn đều khớp nguyên vẹn).
   - **Cơ sở cấu trúc:** Do khuôn tệp lưu trữ không thêm trường mới nào từ `v0.5.2` (`git diff` rỗng ở `store.ts`, `soul.ts`, `sect-store.ts`, `account-store.ts`, `pg/`), việc lùi bản từ `main` về `v0.5.2` không làm bản cũ ghi đè hay làm mất các trường dữ liệu cốt lõi.

4. **6 Giới hạn cần nhớ khi đọc số đo thực nghiệm:**
   1. *Hiệu lực commit:* Kết quả thực nghiệm kiểm tra tính tương thích nạp/lưu với đầu commit kiểm thử; khi nhánh `main` có commit mới, các bài kiểm thử tự động của CI/nightly sẽ bảo đảm an toàn.
   2. *Chân linh & Tông môn:* Thư mục `souls/` và `sects/` có thời gian sửa đổi (mtime) giữ nguyên mốc sao chép vì kịch bản đăng nhập ngắn chỉ đọc mà không ghi lại chúng (chưa có luân hồi hay giao dịch kho trong kịch bản).
   3. *Origin Guard:* Thử nghiệm chạy với `ORIGIN_CHECK=off` nên lớp chặn Origin chưa được thử dưới tải đăng nhập thực tế.
   4. *Backend lưu trữ:* Thử nghiệm thực hiện trên kho tệp JSON (`STORE=file`), không phải PostgreSQL (`STORE=pg`), mặc dù mã migration PG không đổi từ `v0.5.2`.
   5. *Biến động tu vi:* Điểm tu vi không đổi ở cả 30 nhân vật do bot chỉ đả tọa ngắn 100-150ms.
   6. *Bản chất bài test:* 30 bot đăng nhập trong 30 giây là bài kiểm tra tính tương thích nạp/lưu và cấu trúc dữ liệu hai chiều, KHÔNG PHẢI là bài thử tải dài (soak test).

---

## 3. Quyết Định Số Phiên Bản: v0.5.3

Theo quy tắc đánh số phiên bản tại `docs/TRIEN_KHAI.md` mục 10.1 và quyết định của Người Dùng (`QUYET_DINH_M3.md` mục 65):
- Hằng số `PROTOCOL_VERSION` giữ nguyên `6` (`shared/src/protocol.ts`), `MIN_PROTOCOL_VERSION` giữ nguyên `0`. Mọi thay đổi trong `shared/` (Tiled, private-pack, quests, 4 chiêu Kim/Thổ #1299) đều tương thích ngược để client cũ không bị từ chối 426.
- Chiểu đúng câu chữ của mục 10.1, bản phát hành này thuộc diện `PATCH`: **`v0.5.3`**.
- Điểm cắt phát hành được chốt cắt từ `main` sau khi nightly e2e (03:00) + bench (04:00) đêm nay xanh.
