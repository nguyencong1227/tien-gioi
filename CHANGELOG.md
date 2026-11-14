# Nhật ký thay đổi

Định dạng theo từng bản phát hành (thẻ `vX.Y.Z`). Số `#` là PR / issue trên GitHub.

## [Chưa phát hành]: bản vá chơi hoàn toàn bằng bàn phím

Người dùng chơi thử v0.1.2 thấy "thao tác trên bàn phím chưa hợp lý, phải dùng cả chuột". Bản vá làm cho máy tính chơi được TOÀN BỘ chỉ bằng bàn phím, chuột là tuỳ chọn (#463). **Không đổi luật chơi, dữ liệu nhân vật hay giao thức** (`PROTOCOL_VERSION` giữ 1, server không đổi). Cảm ứng / điện thoại giữ nguyên (nhãn phím và dòng mở màn Phím tắt chỉ hiện khi dùng chuột / bàn phím).

### Thêm
- **Bảng phím đổi được** (`client/src/keybinds.ts`, lưu ở `localStorage` khoá `tg_keymap`) và **màn "Phím tắt"** trong Cài đặt: liệt kê mọi phím, đổi phím chỉ bằng bàn phím (bấm "Đổi phím" rồi bấm phím mới, Esc huỷ, lấy phím của hành động khác thì hai bên đổi chỗ), khôi phục mặc định. Nhãn phím hiện trên nút kỹ năng / HUD (máy tính) và chữ hướng dẫn trong game đọc từ bảng phím nên không lệch khi đổi (#465, #469).
- **Chọn mục tiêu không cần chuột:** Tab chọn mục tiêu gần nhất rồi đi xa dần, Shift+Tab ngược lại, Esc bỏ chọn; Cách (chém) và Kiếm khí tự khoá quái gần nhất đang thấy trên màn hình (#465, #468).
- **Mũi tên + Enter trong mọi bảng** (túi đồ, nhân vật, cửa hàng, lò rèn, nhiệm vụ, tông môn, cài đặt, menu người chơi): mũi tên chuyển giữa các nút theo vị trí, Enter bấm, Esc đóng tầng trên cùng; vẽ lại bảng không làm mất vị trí đang chọn. Hộp thoại NPC chọn dòng bằng phím số 1-9 (#468).
- **Y nhận / X từ chối lời mời** (tổ đội, bí cảnh, thách đấu, tông môn), **R** mở xác nhận rời bí cảnh / đầu hàng quyết đấu (Y xác nhận, X huỷ), **P** mở menu đồng đạo gần nhất (mời đội, thách đấu, mời tông môn); tấm kết quả bí cảnh / quyết đấu nhận focus (#470, #471).
- **Màn Hoàng Tuyền chơi được bằng phím:** mũi tên + Enter chọn xuất thân, tích ký vật, mở Tam Sinh Thạch, đầu thai. Màn nhận focus ở khung (không ở nút nào) nên đang nhấn Cách / Enter lúc vừa gục không mua hay đầu thai nhầm; Esc không đóng màn (#471).

### Đổi
- Phím mặc định: Cách = chém (trước đây J cũng chém), **J = Sổ nhiệm vụ** (Q vẫn dùng được), 3 = Kiếm khí, 4 = Đả tọa (K / L vẫn dùng được), 1 / 2 vẫn là đan dược. Khi bảng hoặc hộp thoại đang mở, phím của thế giới (chém, kỹ năng, mục tiêu...) và WASD / mũi tên không điều khiển nhân vật (mũi tên dành cho điều hướng bảng); cần điều khiển ảo của cảm ứng không bị chặn (#465, #468).

### Sửa
- Thanh trượt âm lượng ở đầu Cài đặt không còn nuốt mũi tên Lên / Xuống (trước đó chỉ còn Tab để đi tiếp) (#469).
- Bấm nút trong menu người chơi (mời đội, thách đấu, mời tông môn, ✕) bằng chuột không còn làm WASD và phím thế giới ngừng chạy cho tới khi bấm Esc (#471).
- Y / X bỏ qua nút đang bị vô hiệu thay vì nuốt phím (#471).

### Công cụ
- E2E thật `npm run e2e:ban-phim -w server` (Chrome + server Colyseus thật, phím gửi bằng CDP, KHÔNG click chuột, hai người chơi cho mục mời đội / thách đấu): đổi phím, Tab / Shift+Tab / Esc, chém, kỹ năng, mở / đóng bảng, chat, túi, hội thoại NPC, cửa hàng, lò rèn, nhặt đồ, lời mời, rời bí cảnh, menu đồng đạo, Hoàng Tuyền, qua cổng. Mỗi PR có đột biến (vô hiệu một chức năng thì script đỏ). Thiết kế: `docs/THIET_KE_BAN_PHIM.md`.

## [0.1.2] — 13/11/2026: bản vá, bỏ chữ Hán khỏi giao diện

Người dùng thấy chữ Hán trong game; bản vá đổi hết sang tiếng Việt hoặc biểu tượng vẽ. **Không đổi luật chơi, dữ liệu lưu hay giao thức** (`PROTOCOL_VERSION` giữ 1; `shared/src` không đổi logic).

### Sửa
- Nút HUD và nút hành động (Nhân vật, Túi, Nhiệm vụ, Tông môn, Nhặt, Nói chuyện, Qua cổng, Mục tiêu, Đột phá, Đả tọa, Kiếm khí, Chém): thay chữ Hán bằng 12 biểu tượng vẽ bằng SVG (nét đơn, co giãn theo cỡ chữ), giữ nhãn tiếng Việt bên dưới, vẫn >= 44 px (#421).
- Ấn màn đăng nhập và màn "có bản mới": "Tiên". Ấn kết quả bí cảnh: "Thắng" / "Bại". Ấn Hoàng Tuyền: "Luân Hồi" (#421).
- Tên trấn trên bản đồ: "Lạc Hà Trấn" (lấy từ dữ liệu bản đồ, không chép cứng) (#421).
- Bảng Tông môn và bảng Tổ đội hiện TÊN bản đồ ("Hắc Phong Cốc") thay vì mã thô ("hac_phong"); bản đồ lạ hiện "vùng lạ" (#415).
- `icon.svg` (favicon): bỏ lớp chữ Hán mờ; các ảnh PNG, icon Android, atlas, tileset, ảnh vật phẩm đã kiểm bằng mắt: đều là hình vẽ, không có chữ Hán.

### Công cụ
- CI chặn chữ Hán tái diễn: `server/scripts/no-cjk.test.ts` quét `client/`, `shared/`, `server/`, `app/` (chạy trong `npm test` và `release.yml`) (#421).
- CI `Docker Build`: bước chạy thử ảnh không còn dùng `curl | grep -q` (curl thoát mã 23 khi trang lớn hơn; lộ ra khi `index.html` thêm biểu tượng SVG) (#422).
- Android `versionCode` 3, `versionName` 0.1.2.

### Cần biết
- Biểu tượng nút là hình mới; muốn đổi kiểu thì sửa từng dòng trong khối `<symbol>` ở đầu `client/index.html`.
- Chưa thử trên điện thoại thật (như 0.1.1). Quay về bản cũ: `~/TT/tien-gioi-prod/prod.sh rollback` (về 0.1.1); dữ liệu không đổi định dạng.

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
