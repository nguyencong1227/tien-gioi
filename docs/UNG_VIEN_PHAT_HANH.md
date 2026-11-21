# Hồ Sơ Ứng Viên Phát Hành (Dự Kiến v0.6.0)

> **Lưu ý:** Tài liệu này CHỈ phục vụ chuẩn bị bằng chứng và rà soát kỹ thuật trước phát hành cho người dùng và nhóm phát triển (Refs #1290). **KHÔNG** tự ý gắn thẻ git tag (`v*`), **KHÔNG** kích hoạt `release.yml`, **KHÔNG** tự động triển khai hay can thiệp vào môi trường production (`~/TT/tien-gioi-prod/`, cổng 2567).

---

## 1. Thông Tin Tổng Quan

- **Mốc so sánh:** Thẻ phát hành `v0.5.2` (commit `79c6b40e`) $\rightarrow$ Đầu nhánh `main` hiện tại (commit `b007b456`).
- **Khối lượng tích luỹ:** **346 commit** sau `v0.5.2`.
- **Hợp đồng `shared/src`:** Thay đổi **21 tệp** (`+4.134` dòng, `-58` dòng), chủ yếu mở rộng khung chiêu thức, hợp đồng tài nguyên riêng, đấu trường solo và xã hội.
- **Phiên bản giao thức (`shared/src/protocol.ts`):**
  - `PROTOCOL_VERSION`: **`6`** (giữ nguyên từ `v0.5.2`, không đổi).
  - `MIN_PROTOCOL_VERSION`: **`0`** (giữ nguyên, máy chủ tiếp tục chấp nhận client cũ).
- **Trạng thái lưu trữ:** `server/src/{store,soul,sect-store,account-store}.ts` không đổi kiến trúc lưu trữ cốt lõi; các trường mới trong hồ sơ người chơi (`ambushDaily`, `ambushUntil`, `ambushReturnAt`, `SkillBook.mastery`) đều có bộ kẹp làm sạch (`sanitize`) tương thích ngược hoàn toàn.

---

## 2. Danh Mục Thay Đổi Theo Góc Nhìn

### (a) Người chơi thấy gì (User-Facing Changes)

1. **Bộ chiêu thức mới:**
   - **6 chiêu hệ Kim & Thổ mới:** Thanh Vân Kiếm Khí (Kim, Trúc Cơ), Bàn Thạch Hộ Thể (Thổ, khiên, Trúc Cơ), Thu Thủy Kiếm Ảnh (Kim, Kim Đan), Liệt Địa Nhất Quyền (Thổ, tự tăng sát thương, Kim Đan), Phân Nhạc Trảm (Thổ, Kim Đan), Vạn Kiếm Quy Tông (Kim, 5 tia, Nguyên Anh, Địa phẩm).
   - **Kinh quyển rơi từ quái:** Tỉ lệ rơi kiểm soát chặt chẽ (1% quái Trúc Cơ, 1,2% quái Kim Đan, 0,8% Phong Nha).
   - **6 biểu tượng chiêu mới** trên atlas (`client/public/assets/atlas.png`).
   - **Khung hình học chiêu thức mở rộng:** Hỗ trợ hiển thị hiệu ứng đạn bay (`pbolt`), tia sét lan (`chain`), vật thể bền (`zone`/`trap`/`totem`/`aura`), vận khí tụ lực (`windup`) và thanh luyện chiêu (`mastery`) theo phẩm Hoàng/Huyền/Địa/Thiên.
2. **Cân bằng bản đồ cấp cao (Âm Sương Trạch & Hàn Vân Lĩnh):**
   - Quái thường và tinh anh tăng Khí huyết x1,5, Tu vi x2; Hắc Giao tăng lên 6 con sinh cách nhau $\ge 700\text{ px}$.
   - Tối đa 6 trùm sinh sẵn mỗi bản đồ.
   - Nhịp độ tu luyện cảnh giới Kim Đan và Nguyên Anh rút ngắn còn ~4,2 giờ. Các boss và quái lớn yêu cầu tổ đội 2-4 người phối hợp chặt chẽ.
3. **Bảng Xã hội (Shift + G) bật mặc định:**
   - Người chơi có thể mở xem trực tiếp 4 bảng xếp hạng (Tu vi, Linh hồn, Tông môn, Thách đấu), Sổ Thành tựu & Danh hiệu, và Tab Sự kiện trùm thế giới.
   - Danh hiệu hiển thị bên cạnh tên trên đầu nhân vật và trong các kênh chat (chung, đội `/p`, tông môn `/s`).
4. **Cảnh báo an toàn trong hộp thoại Chặn đường:**
   - Khi gặp chặn đường, hộp thoại chủ động kiểm tra túi đồ và hiển thị dòng nhắc cảnh báo: *"Túi không có đan hồi huyết: nên mang ít nhất 2"* hoặc *"Túi chỉ còn 1 đan hồi huyết: nên mang ít nhất 2"* (nhắc nhở người chơi tránh chết thật oan uổng nếu chọn Chiến mà thiếu đan hồi phục).
5. **Điều khoản sử dụng & Bản quyền mới (`terms.html`):**
   - Liên kết điều khoản và chính sách được tích hợp tại màn hình đăng nhập và trong Cài đặt ("Giới thiệu và ghi công").
6. **Tối ưu tải trang client:**
   - Client được đóng gói với bộ nén `terser`, tối ưu dung lượng tải ban đầu nhanh hơn ~3,4%. Dữ liệu bản đồ được tách trần ngân sách độc lập (48 KB) giúp dung lượng mã chính giữ an toàn dưới ngân sách.

---

### (b) Vận hành cần làm gì khi nâng cấp (Ops & Environment Changes)

Đối chiếu với `deploy/prod.sh` và `docs/TRIEN_KHAI.md`, trên môi trường chạy thật (`~/TT/tien-gioi-prod/`):

1. **Cơ chế chống dùng ké & bảo vệ nguồn gốc (`ORIGIN_CHECK` & `ALLOWED_ORIGINS`):**
   - `ORIGIN_CHECK`: Mặc định **BẬT** trong mã nguồn. Tự động kiểm tra tiêu đề `Origin` trên HTTP, WebSocket và `/matchmake/*`. Trả về lỗi 403 nếu đến từ nguồn lạ.
   - `ALLOWED_ORIGINS`: Mặc định đã cấu hình sẵn nguồn công khai `https://tiengioi.hethongtm.site` và các nguồn trong `CORS_ORIGINS`.
   - **Hành động vận hành:** **KHÔNG cần sửa `.env.production`** nếu máy chủ chạy với tên miền chính thức hiện tại. Nếu có nhu cầu mở thêm domain phụ hoặc trang vệ tinh thì mới cần bổ sung vào `ALLOWED_ORIGINS`.
2. **Tính năng Gặp Chặn Đường (`AMBUSH` & `AMBUSH_MIN_POTIONS`):**
   - Mặc định trong mã nguồn: **TẮT** (`AMBUSH=off`).
   - **Hành động vận hành:** Giữ nguyên trạng thái TẮT cho tới khi người dùng duyệt 5 câu hỏi phát hành ở issue #1070. Khi người dùng đồng ý bật:
     - Thêm `AMBUSH=on` vào `.env.production`.
     - **Khuyến nghị bắt buộc:** Bổ sung `AMBUSH_MIN_POTIONS=2` (lọc bỏ người chơi mang dưới 2 đan hồi khí huyết để tránh chết thật do thiếu đan theo khuyến cáo của Dev A và số đo cân bằng).
3. **Tính năng Trùm Thế Giới Theo Giờ (`WORLD_BOSS`):**
   - Mặc định trong mã nguồn: **TẮT** (`WORLD_BOSS=off`) và lịch `WORLD_BOSS_SCHEDULE` đang rỗng.
   - **Hành động vận hành:** Giữ nguyên TẮT. Khi Dev E hoàn tất nhập lịch dữ liệu và người dùng quyết định bật, thêm `WORLD_BOSS=on` vào `.env.production`.
4. **Tính năng Thành Tựu & Cấp Bù Duyên (`ACHIEVEMENTS`):**
   - Mặc định trong mã nguồn: **TẮT** (`ACHIEVEMENTS=off`).
   - **Hành động vận hành:** Giữ nguyên TẮT. Việc bật `ACHIEVEMENTS=on` sẽ kích hoạt cấp bù Duyên vĩnh viễn cho toàn bộ người chơi cũ (tối đa 121 Duyên). Chỉ bật khi người dùng đã duyệt quyết định này.
5. **Gói tài nguyên riêng (`ASSETS_PRIVATE_DIR`):**
   - Mặc định: Rỗng (tính năng tắt, client tự lùi về hình thay thế an toàn).
   - **Hành động vận hành:** Chỉ cấu hình khi người dùng đã tự tải gói tài nguyên hợp lệ vào `/mnt/data/assets-private/dist` và gắn mount volume read-only (`:ro`) vào container theo `docs/TRIEN_KHAI.md`.
6. **Các tính năng mặc định BẬT khác:**
   - Tông môn (`SECTS=on`), Bảng xếp hạng (`LEADERBOARD=on`): Đều đã ổn định và không cần can thiệp.

---

### (c) Phân tích rủi ro & Phương án quay lui (Risk & Rollback Strategy)

1. **Kiểm tra tính sẵn sàng của bản phát hành trước (`0.5.2`):**
   - Đã kiểm tra trực tiếp qua `docker manifest inspect ghcr.io/nguyencong1227/tien-gioi:0.5.2`:
     - Image manifest: `sha256:3fc14d1245cb1213f6cfb6f6ac86e793bfca916694115eb933bd29839c1cf2a1` (nền tảng `linux/amd64`).
     - **Khẳng định:** Ảnh Docker của phiên bản `0.5.2` vẫn tồn tại nguyên vẹn trên GHCR, sẵn sàng kéo về phục vụ rollback tức thì nếu có sự cố.
2. **Kịch bản và quy trình quay lui (Rollback):**
   - Nếu bản nâng cấp gặp sự cố nghiêm trọng sau khi triển khai:
     ```bash
     cd ~/TT/tien-gioi-prod
     ./prod.sh up 0.5.2
     # hoặc cập nhật TIEN_GIOI_TAG=0.5.2 và chạy docker compose up -d
     ```
   - Thời gian gián đoạn dự kiến: Dưới 15 giây.
3. **Khả năng tương thích dữ liệu khi lùi bản (Data Backward Compatibility):**
   - Cấu trúc cơ sở dữ liệu PostgreSQL không có migration nào phá huỷ cột hay bảng cũ từ mốc `v0.5.2`.
   - Các trường JSON mới trong hồ sơ người chơi (như `ambushDaily`, `ambushUntil`) sẽ được phiên bản `v0.5.2` bỏ qua một cách an toàn nhờ cơ chế `sanitizePlayer` tự lọc thuộc tính lạ.
   - Không gây mất mát dữ liệu cốt lõi (Linh thạch, Tu vi, Cảnh giới, Túi đồ, Trang bị).

---

### (d) Đề xuất số phiên bản (Version Number Recommendation)

Căn cứ vào `docs/TRIEN_KHAI.md` mục 10.1 (Quy tắc Semantic Versioning của Tiên Giới):
- **Quy tắc:**
  - Tăng `PATCH`: Chỉ dành cho sửa lỗi hiển thị, sửa logic nhiệm vụ, cân bằng nhỏ, không thay đổi hợp đồng `shared/`.
  - Tăng `MINOR`: Bắt buộc khi có thay đổi hợp đồng `shared/`, mở rộng giao thức hoặc tính năng gameplay quy mô lớn.
- **Thực tế tích luỹ:**
  - `main` có **346 commit** mới so với `v0.5.2`.
  - Hợp đồng `shared/src` thay đổi trên 21 tệp (+4.134 dòng): bổ sung toàn bộ khung chiêu thức dạng mới (hình học, vận khí, phẩm, luyện chiêu), hợp đồng chặn đường đấu trường solo (`ambush.ts`), hợp đồng tài nguyên riêng (`private-pack.ts`), hợp đồng xã hội (`social.ts`, `social-soul.ts`).
  - Mặc dù `PROTOCOL_VERSION = 6` được giữ nguyên (đảm bảo tính tương thích ngược cho client hiện tại), nhưng khối lượng tính năng, cân bằng và mở rộng hợp đồng vượt xa phạm vi của một bản `PATCH`.
- **Đề xuất:**
  - **`v0.6.0`** (Không dùng `v0.5.3`).
  - Đánh số `v0.6.0` phản ánh chính xác bước tiến lớn về tính năng (hạ tầng Chặn đường, Chiêu thức mở rộng, Khung tài nguyên riêng, Cân bằng Âm Sương - Hàn Vân, Xã hội bật mặc định) của dự án.
