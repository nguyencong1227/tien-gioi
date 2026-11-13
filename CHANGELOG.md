# Nhật ký thay đổi

Định dạng theo từng bản phát hành (thẻ `vX.Y.Z`). Số `#` là PR / issue trên GitHub.

## [0.1.1] — 13/11/2026: M5 (giao diện đa thiết bị + đồ hoạ) lên bản chạy thật

Bản này đưa toàn bộ M5 lên `https://tiengioi.hethongtm.site`: giao diện chạy được trên điện thoại, máy tính bảng, máy tính và đồ hoạ nhiều hiệu ứng hơn. **Không đổi luật chơi, không đổi dữ liệu lưu, không đổi giao thức** (`PROTOCOL_VERSION` giữ 1: APK và client cũ vẫn vào được; `shared/src` không đổi so với 0.1.0). Chưa có nội dung game mới (bản đồ / quái / cảnh giới mới thuộc M6, sau bản này).

### Giao diện đa thiết bị
- Scale Manager + DPR (chữ và hình sắc nét trên màn hình mật độ cao, vùng an toàn, không lật hướng khi bàn phím ảo mở) (#335, #339, #342).
- Tấm chung `.sheet` cho Túi đồ, Nhân vật, Cài đặt, Bản đồ lớn, Sổ nhiệm vụ, Cửa hàng, Lò rèn, Tông môn và các hộp thoại; vuốt tiêu đề xuống / sang phải để đóng trên điện thoại (#336, #343, #375, #377, #384, #389).
- Cỡ chữ theo thiết bị (Nhỏ / Vừa / Lớn), nút HUD >= 44 px, HUD gọn ở điện thoại ngang / dọc thấp, hộp thoại NPC dock đáy cuộn trong hộp (#376, #381, #386, #387, #391).
- Điều khiển cảm ứng: joystick theo `data-input`, D-pad cố định, nút khoá mục tiêu, joystick nổi không bị bảng HUD nuốt chạm (#341, #344, #374, #379).
- Phông Noto Serif tự lưu, bỏ Google Fonts (#388).

### Đồ hoạ và hiệu ứng (Phaser)
- Lõi hiệu ứng `gfx/fx` (hạt, chữ bay) và các công thức: chiến đấu, tu luyện, thế giới (rơi đồ theo độ hiếm, cổng xoáy), công pháp (kiếm khí, vệt chém), luân hồi (Hoàng Tuyền, Tam Sinh Thạch, đầu thai); chuyển cảnh mống mắt khi đổi bản đồ (#345, #349, #352, #353, #356, #358, #361, #363).
- Hoạt ảnh yêu thú và người chơi (đánh, bị đánh, gục), tween nhẹ, giảm chi tiết thực thể ở xa (#340, #346, #366, #368, #373).
- Trang trí bản đồ theo từng bản đồ: ánh sáng môi trường, vignette, thời tiết bằng hạt, sương trôi, mặt nước lấp lánh (#347, #351, #357, #359, #362, #367).
- Cài đặt chất lượng đồ hoạ Thấp / Vừa / Cao (tự chọn theo thiết bị) và tôn trọng "giảm chuyển động" (#338).
- Sửa: số sát thương bay đang vô hình ở WebGL (#348), quái rời vùng nhìn không còn tan như quái gục (#354).

### Hiệu năng và công cụ đo
- Harness đo ma trận khung nhìn, `perf-budget.json`, kiểm rò rỉ, đo draw call thật và hiệu ứng thật; bench hằng đêm chạy `perf:mobile` + `leak:test` (#334, #350, #390, #398, #401). Ngân sách mạng giữ nguyên (hiệu ứng chỉ ở client).

### App Android và vận hành (từ 0.1.0)
- Dự án Capacitor Android (phím Back, vòng đời nền / tiền cảnh, màn "có bản mới" khi gặp 426, trang quyền riêng tư) và workflow dựng APK trên Actions (#312, #314, #315). Android `versionCode` 2, `versionName` 0.1.1.
- Gói vận hành bản chạy thật `deploy/` + `docs/VAN_HANH.md` (#311); lệnh xoá dữ liệu người chơi theo yêu cầu `prod.sh xoa-tai-khoan` (#320, #337; lớp lưu trữ chỉ thêm thao tác xoá).
- Trang quyền riêng tư `privacy.html` có kênh liên hệ (trang Facebook của nhà phát triển) và yêu cầu xoá dữ liệu (#413).

### Cần biết
- **Chưa thử trên điện thoại thật** (người dùng chấp nhận rủi ro, sửa theo phản hồi). Kịch bản kiểm: `docs/KIEM_THU_MAY_THAT.md`, `docs/KIEM_THU_GIAO_DIEN_M5.md`.
- Quay về bản cũ: `~/TT/tien-gioi-prod/prod.sh rollback` (về 0.1.0). Dữ liệu không đổi định dạng nên quay về an toàn.

## [0.1.0] — 11/11/2026: bản chạy thật đầu tiên

Nền tảng M1-M4: đánh quái thời gian thực, tu vi / cảnh giới, túi đồ, nhiệm vụ, tiền Linh thạch, tổ đội, nhiều bản đồ (Lạc Hà Trấn, Hắc Phong Cốc), luân hồi, tài khoản + PostgreSQL, bí cảnh Linh Hư, PK thách đấu, tông môn, chống gian lận (audit log, red team), triển khai Docker + Cloudflare Tunnel.
