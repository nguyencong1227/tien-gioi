# Nhật ký thay đổi

Định dạng theo từng bản phát hành (thẻ `vX.Y.Z`). Số `#` là PR / issue trên GitHub.

## [Chưa phát hành] — M6: Kim Đan + Âm Sương Trạch (nội dung và cân bằng)

**Chưa phát hành, chưa gắn thẻ.** Số phiên bản và ngày do Dev A chốt lúc phát hành (`QUYET_DINH_M3.md` mục 10); mục này tổng hợp các PR đã vào `main` sau `v0.1.2` và sẽ được đổi tên thành một bản có số khi phát hành. Kế hoạch: `docs/PHAN_CONG_M6.md`.

### Nội dung mới
- **Cảnh giới Kim Đan trọn vẹn (bậc 13-15):** thanh tu vi 48000 / 55200 / 63480 (trước: 26400 / 30360 / 34914); Tụ Khí Đan có trần 300 tu vi mỗi viên và Xích Mãng rơi ít hơn (0,3 x 1, trước 0,6 x 1-2) để hết "đường tắt" (#403, #425).
- **Bản đồ thứ ba "Âm Sương Trạch"** (`am_suong`, 128x112 ô, đầm lầy sương) với trạm an toàn **Vọng Sương Trạm**; nối từ Hắc Phong Cốc (cổng Vọng Trạch Quan <-> Hồi Phong Quan), chuỗi Lạc Hà - Hắc Phong - Âm Sương (#404, #426, #429).
- **Bốn loài quái mới:** Sương Hồ, Thạch Quy, Độc Thiềm (số lượng 24 / 18 / 18) và **trùm Hắc Giao** (2 con, bãi của đội 3-4 người).
- **Vật phẩm:** bốn nguyên liệu (Sương mao, Quy giáp, Độc nang, Giao lân), **chín trang bị Kim Đan** (ba bộ sơ / trung / hậu kỳ: kiếm - bào - phù), đan cấp 2 (Đại Hồi Huyết Đan, Đại Hồi Linh Đan) bán ở lái buôn Vọng Sương.
- **Rèn có phí Linh thạch:** chín công thức Kim Đan ở thợ rèn Hồ Thiết (Vọng Sương Trạm), tổng phí 78.500 Linh thạch (~5 giờ thu nhập solo): chỗ xả tiền của người chơi Kim Đan (#427, #433).
- **Ba NPC mới** (Tống Vân Hạc trạm trưởng, Phó Quang lái buôn, Hồ Thiết thợ rèn) và **chuỗi nhiệm vụ:** nay 23 nhiệm vụ (17 chính tuyến + 6 lặp), gồm các nhiệm vụ nối Trúc Cơ sang Kim Đan.
- Bí cảnh Linh Hư có **trần bậc 12**: từ Kim Đan trở lên quá dễ, không vào được (#428).

### Giao thức và dữ liệu lưu
- **`PROTOCOL_VERSION` 1 -> 2:** client cũ không biết bản đồ và loài quái mới. `MIN_PROTOCOL_VERSION` KHÔNG đổi trong M6; có nâng nó trên bản chạy thật hay không là quyết định lúc phát hành.
- Tệp lưu cũ vẫn nạp được. Test Colyseus thật ba bản đồ: khứ hồi Lạc Hà - Hắc Phong - Âm Sương kiểm tu vi và túi đồ ở cuối vòng (#429, #435); và kiểm tu vi, Linh thạch, túi đồ, sổ nhiệm vụ, cảnh giới, đồ đang mặc, mã kiếp SAU MỖI lần qua cổng, rớt mạng rồi nối lại, hai tab đua nhau, tệp lưu cũ (#454).

### Cân bằng (`docs/CAN_BANG.md`, mô phỏng bằng mã server thật)
- Nhịp cả Kim Đan: **5,7 giờ** (săn bãi mới) / **5,2 giờ** (tối ưu), trong mục tiêu 5-7 giờ; hết Trúc Cơ ở 2 giờ 52 phút.
- Trùm Hắc Giao, đo bằng `fightBoss` của mã server thật (`CAN_BANG.md` mục 9): **không mang đan** thì đội 4 hạ được từ Sơ kỳ và đội 3 từ Trung kỳ (còn chết 1-2 người mỗi trận; có đan thì không ai chết); đội 3 ở Trung / Hậu kỳ cho ~1,1-1,2x tu vi / giờ của săn solo tốt nhất. **Mục tiêu "một người không hạ nổi" KHÔNG đạt:** sát thương trùm lên một người là 4,2-5,8 % khí huyết / giây, nhỏ hơn đan hồi 7,0 % / giây, nên một người mang đủ đan hạ được ở mọi bậc (nhưng cần ~80 đan ở Sơ kỳ cho một bộ III, đội 4 chỉ ~19; thời gian mỗi người gần như không đổi theo cỡ đội, số đan thì giảm mạnh); chưa đổi mã, hướng xử lý ghi ở `CAN_BANG.md`.
- Luân hồi, kinh tế, trang bị, PK được cân lại cho Kim Đan (#416, #436, #437, #439, #440, #442, #446).
- Thời gian tìm quái đo bằng thợ săn trong `World` thật, vùng nhìn chữ nhật theo `fitZoom` của client (`CAN_BANG.md` mục 10, #459, #460): mô hình không lạc quan (cận dưới 0,39x giả định). **Chưa kết luận:** Xích Mãng là nguồn nhạy; tiêu chí "không nguồn nào vượt ~1,5x bãi mới tốt nhất" chỉ đạt khi thời gian TÌM Xích Mãng (từ lúc hạ con trước tới lúc chạm con kế, không gồm trận và hồi sức) >= ~85 giây (mô hình giả định 90, sát ngưỡng), và thợ săn hiệu chỉnh theo độ vụng của loài thường cho 27-69 giây; chờ số đo bot (#410).

### Giao diện và đồ hoạ
- **Giao diện gọn, không che màn chơi (bước 1/3, QUYET_DINH_M3 mục 15):** thẻ nhân vật chỉ còn tên, huy hiệu Kiếp, cảnh giới, ba thanh mảnh và một dòng chip (Linh thạch, đạo hữu trực tuyến) không bao giờ xuống dòng (cao 110 px thay vì 215 trên máy tính, 129 thay vì 350 trên điện thoại dọc). Sáu nút Nhân vật / Túi / Nhiệm vụ / Tông môn / Âm thanh / Cài đặt thành MỘT hàng biểu tượng cùng cỡ dưới bản đồ nhỏ (chú thích khi rê chuột, nhãn phím như cũ); màn dưới 480 px gộp vào nút ☰. `docs/THIET_KE_GIAO_DIEN_GON.md`, `npm run shot:layout` / `npm run e2e:giao-dien -w server`.
- Thị giác Âm Sương Trạch: bảng màu lục xám, sương dày nhất ba bản đồ, ma trơi, nước; chuyển cảnh Hắc Phong <-> Âm Sương; nước / đá / cây đọc ra được ở cả ba bậc chất lượng (#414, #447).
- Quái và NPC mới có hoạt ảnh đầy đủ (đứng, đi, đánh, bị đánh, gục), 15 biểu tượng đồ mới, atlas 337 khung (#431).
- **Hiệu ứng trùm:** đòn thường lên trùm nổi hơn (`boss-hit`), trùm gục nổ lớn (`boss-vanish`); màu hạt riêng từng loài Kim Đan; KHÔNG tăng trần hạt / emitter (#450).
- Mũi tên chỉ đường nhiệm vụ biết sang bản đồ khác (chỉ tới cổng kế tiếp, #430); nhãn nút ngữ cảnh cố định (#443); nút Qua cổng không bị che (#438); chữ hồi sinh theo tên trấn (#424).
- Bảng Lò Rèn hiện phí Linh thạch, tắt nút Rèn khi thiếu tiền (#432, #434); Sổ nhiệm vụ gọn khi chuỗi dài (tab "Đã hoàn thành" mỗi nhiệm vụ một hàng, #449).

### Đo và kiểm
- `perf:mobile` có kịch bản Âm Sương Trạch ba bậc, Hắc Phong và Lạc Hà (sương + thời tiết + nước BẬT) và đánh trùm; `leak:test` qua ba bản đồ; ảnh năm khung nhìn `capture-viewports --maps` (#448, #453).
- **Số đo FPS:** đo bằng Chrome headless (SwiftShader) nên **không chặn trên FPS**; Âm Sương Thấp / Vừa / Cao JS p95 0,7 / 1,1 / 1,4 ms, draw call 3 / 5 / 5, không nặng hơn Hắc Phong và Lạc Hà ở cùng bậc. **"Android tầm trung >= 50 FPS" CHƯA đo trên máy thật** (đo máy thật M5.4 còn mở).
- Kiểm tự động thêm: `e2e:doc-duoc` (ô chặn đọc ra được trên ba bản đồ, #447), `check-quest-log`, `check-forge-shop`, `check-combat-fx` mục trùm (#449, #450, #451, #452), cổng trống do hệ điều hành cấp cho các script Chrome (#455), `docs/RA_SOAT_TAI_SAN.md` cập nhật tài sản M6 (#456).
- Sửa kèm: `bindTap` bỏ qua mọi `click` trong 300 ms đầu sau khi tải trang (#449).

### Cần biết khi phát hành
- Client `v0.1.2` không biết bản đồ mới: trên bản chạy thật cần `MIN_PROTOCOL_VERSION=2` để client cũ nhận thông báo "có bản mới" thay vì vào nhầm; sao lưu dữ liệu (`prod.sh backup`) trước khi `up`; APK cần dựng lại (`docs/PHAN_CONG_M6.md` mục 6). Việc phát hành do người dùng quyết, không tự động.
- Chưa thử trên điện thoại thật (như 0.1.1 và 0.1.2).

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

### App Android và vận hành (sau 0.1.0)
- Dự án Capacitor Android (phím Back, vòng đời nền / tiền cảnh, màn "có bản mới" khi gặp 426, trang quyền riêng tư) và workflow dựng APK trên Actions (#312, #314, #315). Android `versionCode` 2, `versionName` 0.1.1.
- Gói vận hành bản chạy thật `deploy/` + `docs/VAN_HANH.md` (#311); lệnh xoá dữ liệu người chơi theo yêu cầu `prod.sh xoa-tai-khoan` (#320, #337; lớp lưu trữ chỉ thêm thao tác xoá).
- Trang quyền riêng tư `privacy.html` có kênh liên hệ (trang Facebook của nhà phát triển) và yêu cầu xoá dữ liệu (#413).

### Cần biết
- **Chưa thử trên điện thoại thật** (người dùng chấp nhận rủi ro, sửa theo phản hồi). Kịch bản kiểm: `docs/KIEM_THU_MAY_THAT.md`, `docs/KIEM_THU_GIAO_DIEN_M5.md`.
- Quay về bản cũ: `~/TT/tien-gioi-prod/prod.sh rollback` (về 0.1.0). Dữ liệu không đổi định dạng nên quay về an toàn.

## [0.1.0] — 11/11/2026: bản chạy thật đầu tiên

Nền tảng M1-M4: đánh quái thời gian thực, tu vi / cảnh giới, túi đồ, nhiệm vụ, tiền Linh thạch, tổ đội, nhiều bản đồ (Lạc Hà Trấn, Hắc Phong Cốc), luân hồi, tài khoản + PostgreSQL, bí cảnh Linh Hư, PK thách đấu, tông môn, chống gian lận (audit log, red team), triển khai Docker + Cloudflare Tunnel.
