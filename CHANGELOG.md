# Nhật ký thay đổi

Định dạng theo từng bản phát hành (thẻ `vX.Y.Z`). Số `#` là PR / issue trên GitHub.

## [Chưa phát hành] — M7 (Chiều sâu chiến đấu + Nguyên Anh)

### Giao diện
- **Bảng Công pháp (M7.6 bước 3, #507):** phím **Shift+K** hoặc nút "Công pháp" ở menu HUD mở bảng liệt kê chiêu ĐÃ học (tầng, hệ, kiểu đánh) với số thật máy chủ tính (sát thương theo tầng, linh lực theo linh lực tối đa, hồi chiêu, tầm, hiệu ứng kèm theo, kinh quyển, mô tả; "Cần đạt ..." nếu chưa đủ cảnh giới để dùng). Mỗi chiêu có hàng nút Ô 2 / 3 / 4 / 5 để gắn và nút Gỡ; ô chưa mở ghi cảnh giới mở. Dùng được trọn vẹn bằng bàn phím (mũi tên đi giữa các ô và hàng, Enter gắn, Delete gỡ, Esc đóng) và cảm ứng (nút >= 44 px, không tràn ngang ở 360x640). Chưa học chiêu nào thì có nút "Mở Túi đồ". Client không đoán trước kết quả: máy chủ gửi lại sổ chiêu đúng (hoặc báo lỗi) sau mỗi lần gắn.
- **Cụm chiêu cảm ứng (M7.6 bước 2, #507):** trên điện thoại / máy tính bảng bốn ô chiêu hiện thành một khối nút 56 px CHỈ cho chiêu đã gắn (ô khoá / trống không có nút), dính mép phải ngay trên nút Mục tiêu: 1 chiêu = một nút, 2 = một hàng, 3-4 = khối 2 x 2, ô 2 sát nút Mục tiêu; biểu tượng + chấm tầng + vòng quét hồi chiêu + số giây, trạng thái như bản máy tính (xám khi choáng, tối khi thiếu linh lực...), chạm bằng `pointerdown` gửi `cast` chỉ khi ô sẵn sàng. Điện thoại NGANG: khối nằm bên trái cột nút cổng / nói chuyện / nhặt và trên thanh đan dược; kiểu điều khiển D-pad dọc: lùi sang trái cột nút ngữ cảnh. Đo ở 360x640, 390x844, 844x390, 768x1024 với 1 / 2 / 4 chiêu và cả ba nút ngữ cảnh hiện cùng lúc: không nút nào chồng hay cách nhau dưới 8 px (`client/scripts/check-skill-touch.mjs`, cả hai kiểu điều khiển).
- **Thanh chiêu L U I O sống theo sổ chiêu của máy chủ (M7.6 bước 1, #507):** bốn ô vẽ từ tin `skills` (chiêu, tầng, hồi chiêu, linh lực) và `status` (choáng) với **bảy trạng thái** theo thứ tự ưu tiên: khoá (ghi cảnh giới mở) / trống / thiếu cảnh giới (`skillReqMet` của shared) / choáng / hồi chiêu (vòng quét + số giây làm tròn lên) / thiếu linh lực (`skillMpCost`) / sẵn sàng; ô vuông bo góc 58 px có biểu tượng vẽ bằng mã (hình theo kiểu đánh, màu theo hệ; ảnh nguồn thay ở #509), tên viết tắt và chấm tầng. Bấm phím hoặc chuột chỉ gửi `cast` khi ô SẴN SÀNG; ca chắc chắn bị từ chối thì báo lý do tại chỗ ("chưa mở: Mở ở Kim Đan", "còn trống", "Linh lực không đủ") và rung nhẹ ô, không gửi gì. Hướng đánh theo hình chiêu (A xác nhận ở #536): bộ pháp lao theo hướng ĐANG DI CHUYỂN, vòng nổ / hộ thể theo hướng nhìn, còn lại về phía con trỏ khi có chuột trong canvas, không thì khoá / quái gần / hướng nhìn. Máy chủ giả `?skills=mock&n=0|1|2|4[&realm=N]` để làm giao diện và chụp ảnh không cần máy chủ. Cảm ứng (cụm chiêu) và bảng Công pháp làm ở các bước sau.
- **Mức đồ hoạ "Rất cao" (M7.15, #516; QUYET_DINH_M3 mục 21):** thêm bậc `Rất cao` CHỈ cho máy tính mạnh (không di động, không dựng hình bằng phần mềm, >= 8 lõi, RAM >= 8 GB hoặc không rõ, GPU rời / mạnh): hạt ~1000, emitter ~40, chữ sát thương ~40, canvas tới ~8,4 triệu điểm ảnh, bộ nhớ texture 512 MB (Cao nâng 128 -> 256 MB). **Điện thoại và máy tính bảng không bao giờ tự lên và không có lựa chọn này** (giá trị `Rất cao` đã lưu bị bỏ nếu máy không đủ điều kiện). Chế độ Tự động khởi đầu ở Rất cao trên máy đủ điều kiện; bộ điều tốc hạ khi khung quá chậm và KHÔNG nâng lại trong phiên. Ngân sách theo gói tải ở `client/perf-budget.json` (`packs`); bộ nạp gói `ensurePack` làm ở bước sau.
- **Giới thiệu và ghi công ở Cài đặt (M7.16, #517):** khối cuối bảng Cài đặt nêu số phiên bản (lấy từ `package.json` gốc lúc dựng), câu ghi công **"Một phần nội dung, hình ảnh và âm thanh trong Tiên Giới lấy từ Vạn Kiếp Tu Tiên (tác giả Hải Quân · Bắc Team), dùng với sự cho phép của tác giả"** (đúng câu đã chốt ở `docs/NGUON_NOI_DUNG.md` mục 1; `credits-ui.test.ts` giữ hai nơi khớp nhau và không chữ Hán) và phông Noto Serif (OFL); đọc được ở máy tính, điện thoại dọc và ngang.

## [0.2.1] — 14/11/2026: bản vá giao diện (phím cụm J K L U I O + bản đồ làm lại, QUYET_DINH_M3 mục 17)

**Bản vá chỉ phía client** (không đổi `shared/`, không đổi máy chủ đang chạy, `PROTOCOL_VERSION` vẫn 2): người chơi dùng bản web chỉ cần tải lại trang; **APK `v0.2.0` nhận thông báo "có bản mới" và nên cài lại** (`release.yml` dựng `tien-gioi-v0.2.1-debug.apk` khi gắn thẻ). Dữ liệu nhân vật không đổi. Quay lại bản trước bằng `prod.sh rollback` (không phải đổi `MIN_PROTOCOL_VERSION`). Đã kiểm trước khi phát hành: toàn bộ test, `check-map-zoom.mjs` (Chrome thật, gồm qua cổng đổi bản đồ), `e2e:ban-phim`, `e2e:tro-nang`, `leak:test` (heap +1,2%), `perf:mobile --quick` (ĐẠT).

### Giao diện
- **Phím đánh / chiêu ở cụm J K L U I O (mục 17.1, #495):** J = Kiếm chém (Cách vẫn là phím phụ), K = Kiếm khí (3 vẫn là phím phụ), L / U / I / O = bốn ô chiêu thức 2-5 để sẵn cho chiêu M7 (hiện mờ ở HUD máy tính, bấm chỉ báo "ô còn trống"; cảm ứng không hiện). Các phím bị chiếm được dời: **Túi đồ I -> B**, **Sổ nhiệm vụ J -> N** (Q vẫn mở), **Đả tọa L -> Z** (4 vẫn là phím phụ). Ba hành động còn lại mất phím cũ nên được đặt phím mới (đổi được ở màn Phím tắt): **Đột phá B -> V**, **Cài đặt O -> E**, **Bật / tắt âm thanh N -> 0**. Mọi chữ, nhãn trên nút, bảng chỉ dẫn người mới, câu chào đầu game và dòng gợi ý đầu màn hình đọc từ cùng bảng phím nên đổi theo.
- **Người đã tự đổi phím được giữ nguyên:** phím người chơi đã chọn luôn thắng phím mặc định mới của hành động khác (trước đây hành động đứng trước trong bảng luôn thắng). Hành động bị lấy mất phím mặc định (ví dụ người đã gán Túi = I thì ô chiêu 4 hết I) hiện **"chưa gán phím"** ở màn Phím tắt, không im lặng.
- **Bản đồ nhỏ và bản đồ lớn vẽ lại, bước 2/3 (mục 17.2, #496):** địa hình thật (nước, đá / núi, cây, đường đất, nền trấn, tương phản rõ) dựng một lần mỗi bản đồ từ `map-overview.ts` thay cho nền phẳng một màu; **cổng ghi cả nơi đến** ("Bắc Môn Quan → Hắc Phong Cốc"), tên NPC kèm dấu nhiệm vụ "!" / "?", **khu yêu thú theo cấp** (xanh nhẹ → đỏ nặng, tên loài mạnh nhất + cảnh giới) lấy từ quy tắc sinh quái thật của máy chủ; mình là mũi tên chỉ hướng đang nhìn. Canvas ở độ phân giải thật (CSS x `devicePixelRatio`) nên chữ luôn >= 12 px và không mờ; nhãn không chồng nhau (cổng > trấn > nhiệm vụ > NPC > khu quái), canvas hẹp thì gọn nhãn; bản đồ lớn theo tỉ lệ bản đồ và rộng hơn trên máy tính; chú giải thêm cổng và khu yêu thú; phụ đề không còn hứa "chạm để đặt hướng chỉ đường" (chưa có). Ba bản đồ, sơ đồ nối, chú giải và ghim nhiệm vụ: xem bước 3b bên dưới.
- **Bản đồ lớn phóng to / thu nhỏ / kéo (bước 3a, #496):** lăn chuột (quanh con trỏ; đang bám theo mình thì quanh MÌNH, ở giữa), nhấp đúp, kéo chuột; cảm ứng: kéo một ngón, chụm hai ngón; bàn phím: `+` / `-`, mũi tên kéo khung nhìn, `Home` về chỗ mình; ba nút `−`, `+`, "Về chỗ mình" (>= 44 px). Phóng tối đa 8 lần, khi phóng thì vẽ ô thật (ranh giới sắc) và hiện thêm nhãn (tên NPC, khu quái) kể cả trên điện thoại ngang. Mở bản đồ luôn bắt đầu ở zoom 1 và bám theo mình (đã phóng thì mình ở giữa); kéo tay thì thôi bám. Nhãn nền không còn đè lên mũi tên của mình, đồng đội và đích nhiệm vụ.
- **Bật / tắt bản đồ nhỏ:** phím **Shift+M** (không đụng chữ cái nào; M vẫn mở bản đồ lớn) hoặc công tắc trong Cài đặt, nhớ lựa chọn; tắt thì thu thành nhãn tên khu cao 44 px (vẫn bấm để mở bản đồ lớn, vì cảm ứng không có phím M).
- **Xem cả ba bản đồ, sơ đồ nối, chú giải, ghim nhiệm vụ (bước 3b, #496):** sơ đồ nối các bản đồ dựng từ `MAPS[].portals` (Bắc ở trên: Âm Sương - Hắc Phong - Lạc Hà), mỗi nút là một bản đồ (>= 44 px, đánh dấu bản đồ đang đứng), nhãn giữa hai nút ghi cặp cổng nối ("Bắc Môn Quan ⇄ Nam Môn Quan"); chọn nút để XEM bản đồ khác (địa hình, cổng ghi nơi đến, NPC, khu quái, và đồng đội đang đứng ở đó): trên máy tính sơ đồ nằm cột trái, điện thoại dọc nằm trên bản đồ, điện thoại ngang thành một hàng nút. "Về chỗ mình" khi đang xem bản đồ khác thì quay về bản đồ đạo hữu đứng. Chú giải bấm mở / đóng (nhớ lựa chọn; mặc định mở ở màn rộng, đóng ở màn hẹp nên điện thoại ngang không phải cuộn), thêm mục "Đích nhiệm vụ". Đích nhiệm vụ đang theo dõi có GHIM kim cương vàng kèm tên nhiệm vụ (đích ở bản đồ khác: ghim ở cổng kế tiếp, "Qua <cổng>").

## [0.2.0] — 14/11/2026: M6, Kim Đan + Âm Sương Trạch (nội dung và cân bằng) + giao diện gọn

Bản phát hành M6 (`QUYET_DINH_M3.md` mục 10, 14: người dùng đồng ý phát hành khi #406 / #410 / #411 xong, sau v0.1.3): cảnh giới Kim Đan trọn vẹn, bản đồ thứ ba Âm Sương Trạch, bốn loài quái mới và trùm Hắc Giao, chín trang bị Kim Đan, rèn có phí, chuỗi nhiệm vụ nối Trúc Cơ sang Kim Đan, cân bằng lại, cùng giao diện gọn không che màn chơi (mục 15: thẻ nhân vật gọn, thanh menu riêng, Tổ đội / Nhiệm vụ / Chat thu gọn được, phím H ẩn toàn bộ giao diện). **`PROTOCOL_VERSION` 1 -> 2: client / APK `v0.1.x` KHÔNG vào được bản chạy thật nữa, sẽ nhận thông báo "có bản mới" (xem "Cần biết khi phát hành").** Kế hoạch: `docs/PHAN_CONG_M6.md`.

### Nội dung mới
- **Cảnh giới Kim Đan trọn vẹn (bậc 13-15):** thanh tu vi 48000 / 55200 / 63480 (trước: 26400 / 30360 / 34914); Tụ Khí Đan có trần 300 tu vi mỗi viên và Xích Mãng rơi ít hơn (0,3 x 1, trước 0,6 x 1-2) để hết "đường tắt" (#403, #425).
- **Bản đồ thứ ba "Âm Sương Trạch"** (`am_suong`, 128x112 ô, đầm lầy sương) với trạm an toàn **Vọng Sương Trạm**; nối từ Hắc Phong Cốc (cổng Vọng Trạch Quan <-> Hồi Phong Quan), chuỗi Lạc Hà - Hắc Phong - Âm Sương (#404, #426, #429).
- **Bốn loài quái mới:** Sương Hồ, Thạch Quy, Độc Thiềm (số lượng 24 / 18 / 18) và **trùm Hắc Giao** (2 con, bãi của đội 3-4 người).
- **Vật phẩm:** bốn nguyên liệu (Sương mao, Quy giáp, Độc nang, Giao lân), **chín trang bị Kim Đan** (ba bộ sơ / trung / hậu kỳ: kiếm - bào - phù), đan cấp 2 (Đại Hồi Huyết Đan, Đại Hồi Linh Đan) bán ở lái buôn Vọng Sương.
- **Rèn có phí Linh thạch:** chín công thức Kim Đan ở thợ rèn Hồ Thiết (Vọng Sương Trạm), tổng phí 78.500 Linh thạch (~5 giờ thu nhập solo): chỗ xả tiền của người chơi Kim Đan (#427, #433).
- **Ba NPC mới** (Tống Vân Hạc trạm trưởng, Phó Quang lái buôn, Hồ Thiết thợ rèn) và **chuỗi nhiệm vụ:** nay 23 nhiệm vụ (17 chính tuyến + 6 lặp), gồm các nhiệm vụ nối Trúc Cơ sang Kim Đan.
- Bí cảnh Linh Hư có **trần bậc 12**: từ Kim Đan trở lên quá dễ, không vào được (#428).

### Giao thức và dữ liệu lưu
- **`PROTOCOL_VERSION` 1 -> 2:** client cũ không biết bản đồ và loài quái mới. `shared/` giữ `MIN_PROTOCOL_VERSION` mặc định; trên bản chạy thật đặt `MIN_PROTOCOL_VERSION=2` bằng biến môi trường (`.env.production`) lúc phát hành, nên client / APK `v0.1.x` bị từ chối với mã 426 và hiện thông báo "có bản mới" thay vì vào nhầm và thấy bản đồ / quái lạ.
- Tệp lưu cũ vẫn nạp được. Test Colyseus thật ba bản đồ: khứ hồi Lạc Hà - Hắc Phong - Âm Sương kiểm tu vi và túi đồ ở cuối vòng (#429, #435); và kiểm tu vi, Linh thạch, túi đồ, sổ nhiệm vụ, cảnh giới, đồ đang mặc, mã kiếp SAU MỖI lần qua cổng, rớt mạng rồi nối lại, hai tab đua nhau, tệp lưu cũ (#454).

### Cân bằng (`docs/CAN_BANG.md`, mô phỏng bằng mã server thật)
- Nhịp cả Kim Đan: **5,7 giờ** (săn bãi mới) / **5,2 giờ** (tối ưu), trong mục tiêu 5-7 giờ; hết Trúc Cơ ở 2 giờ 52 phút.
- Trùm Hắc Giao, đo bằng `fightBoss` của mã server thật (`CAN_BANG.md` mục 9): **không mang đan** thì đội 4 hạ được từ Sơ kỳ và đội 3 từ Trung kỳ (còn chết 1-2 người mỗi trận; có đan thì không ai chết); đội 3 ở Trung / Hậu kỳ cho ~1,1-1,2x tu vi / giờ của săn solo tốt nhất. **Mục tiêu "một người không hạ nổi" KHÔNG đạt:** sát thương trùm lên một người là 4,2-5,8 % khí huyết / giây, nhỏ hơn đan hồi 7,0 % / giây, nên một người mang đủ đan hạ được ở mọi bậc (nhưng cần ~80 đan ở Sơ kỳ cho một bộ III, đội 4 chỉ ~19; thời gian mỗi người gần như không đổi theo cỡ đội, số đan thì giảm mạnh); chưa đổi mã, hướng xử lý ghi ở `CAN_BANG.md`.
- Luân hồi, kinh tế, trang bị, PK được cân lại cho Kim Đan (#416, #436, #437, #439, #440, #442, #446).
- Thời gian tìm quái đo bằng thợ săn trong `World` thật, vùng nhìn chữ nhật theo `fitZoom` của client (`CAN_BANG.md` mục 10, #459, #460): mô hình không lạc quan (cận dưới 0,39x giả định). **Kết luận (chốt trước phát hành, #406):** Xích Mãng là nguồn nhạy; tiêu chí "không nguồn nào vượt ~1,5x bãi mới tốt nhất" chỉ đạt khi thời gian TÌM Xích Mãng (từ lúc hạ con trước tới lúc chạm con kế, không gồm trận và hồi sức) >= ~85 giây (mô hình giả định 90), còn thợ săn hiệu chỉnh theo độ vụng của loài thường cho 27-69 giây, tức tiêu chí CHƯA đạt ở bãi Xích Mãng và người cày Xích Mãng có thể hết Kim Đan trong ~2,2-4,4 giờ (mục tiêu 5-7); người săn bãi mới vẫn 5,7 giờ. GIỮ NGUYÊN số (chỉnh theo một trong hai giả thuyết về độ vụng là đoán, kéo theo chạy lại cả mô hình luân hồi / nhiệm vụ / trang bị) và theo dõi số liệu người chơi thật sau phát hành; nếu trung vị hết Kim Đan dưới ~4 giờ thì chỉnh mật độ / hồi sinh Xích Mãng ở bản 0.2.x.

### Giao diện và đồ hoạ
- **Giao diện gọn, không che màn chơi (bước 1/3, QUYET_DINH_M3 mục 15):** thẻ nhân vật chỉ còn tên, huy hiệu Kiếp, cảnh giới, ba thanh mảnh và một dòng chip (Linh thạch, đạo hữu trực tuyến) không bao giờ xuống dòng (cao 110 px thay vì 215 trên máy tính, 129 thay vì 350 trên điện thoại dọc). Sáu nút Nhân vật / Túi / Nhiệm vụ / Tông môn / Âm thanh / Cài đặt thành MỘT hàng biểu tượng cùng cỡ dưới bản đồ nhỏ (chú thích khi rê chuột, nhãn phím như cũ); màn dưới 480 px gộp vào nút ☰. `docs/THIET_KE_GIAO_DIEN_GON.md`, `npm run shot:layout` / `npm run e2e:giao-dien -w server`.
- **Giao diện gọn, không che màn chơi (bước 2/3):** Tổ đội, Nhiệm vụ và Chat thu gọn được (bấm tiêu đề / nút 💬), nhớ lựa chọn, MẶC ĐỊNH thu gọn trên mọi điện thoại và cửa sổ hẹp (< 700 px; trước đây điện thoại dọc cao vẫn xếp ba bảng chồng nhau). Chat thu gọn còn một dòng tin mới nhất, Enter mở ô nhập, tự mờ sau 6 giây không dùng; nhiệm vụ trống chỉ còn một dòng; hàng thành viên tổ đội một dòng, nút trục xuất là biểu tượng nhỏ. Cột trái chiếm 23% chiều cao ở cửa sổ 550x900 (trước 84%). `docs/THIET_KE_GIAO_DIEN_GON.md` mục 5.
- **Giao diện gọn, không che màn chơi (bước 3/3):** phím **H** ẩn / hiện TOÀN BỘ giao diện để có màn chơi sạch (bảng đang mở, hộp thoại, lời mời và thông báo vẫn hiện; đổi phím được ở màn Phím tắt). Chat cũng hiện (thu gọn một dòng, giữa mép trên) ở điện thoại ngang, nơi trước đây bị ẩn hẳn. Hoàn tất mục 15 của người dùng. `docs/THIET_KE_GIAO_DIEN_GON.md` mục 6.
- Thị giác Âm Sương Trạch: bảng màu lục xám, sương dày nhất ba bản đồ, ma trơi, nước; chuyển cảnh Hắc Phong <-> Âm Sương; nước / đá / cây đọc ra được ở cả ba bậc chất lượng (#414, #447).
- Quái và NPC mới có hoạt ảnh đầy đủ (đứng, đi, đánh, bị đánh, gục), 15 biểu tượng đồ mới, atlas 337 khung (#431).
- **Hiệu ứng trùm:** đòn thường lên trùm nổi hơn (`boss-hit`), trùm gục nổ lớn (`boss-vanish`); màu hạt riêng từng loài Kim Đan; KHÔNG tăng trần hạt / emitter (#450).
- Mũi tên chỉ đường nhiệm vụ biết sang bản đồ khác (chỉ tới cổng kế tiếp, #430); nhãn nút ngữ cảnh cố định (#443); nút Qua cổng không bị che (#438); chữ hồi sinh theo tên trấn (#424).
- Bảng Lò Rèn hiện phí Linh thạch, tắt nút Rèn khi thiếu tiền (#432, #434); Sổ nhiệm vụ gọn khi chuỗi dài (tab "Đã hoàn thành" mỗi nhiệm vụ một hàng, #449).
- Nút Nhặt / Nói chuyện / Qua cổng hiện lại nhãn phím **F** ở góc nút trên máy tính (nhãn chữ trong nút chỉ còn tên ngắn từ M6, nên phím nằm ở chip `.keycap` như các nút kỹ năng; cảm ứng không hiện; đổi phím ở màn Phím tắt thì nhãn đổi theo).

### Đo và kiểm
- **Ba bản đồ cùng một tiến trình** (`docs/LOAD_TEST.md` mục 23, #481): bench 150 người trên ba bản đồ tick TB 1,5 ms, p95 2,6 ms (ngân sách < 10 ms); **soak 30 phút 100 bot PASS** (RSS +1,35 MB, dốc +0,059 MB / phút, tick p95 3,06 ms, 0 nhịp quá hạn, 0 lỗi, `kiem-save` sạch, bảo toàn Linh thạch đạt, 1585 / 790 / 800 lượt qua cổng Hắc Phong / Âm Sương / Lạc Hà). Lộ và sửa lỗi cũ của soak: bot vai "Cổng" chưa từng qua cổng nào.
- **Bot Kim Đan đo thật** (`docs/LOAD_TEST.md` mục 22, #474): thời gian tìm Xích Mãng ở Hắc Phong trung vị 5,2 s (5 mẫu), Sương Hồ ở Âm Sương 2,6 s, đội 3 hạ Hắc Giao 44,4 s (1 người gục); ô chưa đo ghi rõ "chưa đo". Chrome headless dùng GPU khi có (tự lùi về phần mềm ở CI, #478).
- `perf:mobile` có kịch bản Âm Sương Trạch ba bậc, Hắc Phong và Lạc Hà (sương + thời tiết + nước BẬT) và đánh trùm; `leak:test` qua ba bản đồ; ảnh năm khung nhìn `capture-viewports --maps` (#448, #453).
- **Số đo FPS:** đo bằng Chrome headless (SwiftShader) nên **không chặn trên FPS**; Âm Sương Thấp / Vừa / Cao JS p95 0,7 / 1,1 / 1,4 ms, draw call 3 / 5 / 5, không nặng hơn Hắc Phong và Lạc Hà ở cùng bậc. **"Android tầm trung >= 50 FPS" CHƯA đo trên máy thật** (đo máy thật M5.4 còn mở).
- Kiểm tự động thêm: `e2e:doc-duoc` (ô chặn đọc ra được trên ba bản đồ, #447), `check-quest-log`, `check-forge-shop`, `check-combat-fx` mục trùm (#449, #450, #451, #452), cổng trống do hệ điều hành cấp cho các script Chrome (#455), `docs/RA_SOAT_TAI_SAN.md` cập nhật tài sản M6 (#456).
- Sửa kèm: `bindTap` bỏ qua mọi `click` trong 300 ms đầu sau khi tải trang (#449).

### Cần biết khi phát hành
- Người chơi dùng bản web chỉ cần tải lại trang. **APK `v0.1.x` phải cài lại:** `release.yml` dựng APK debug `tien-gioi-v0.2.0-debug.apk` khi gắn thẻ (đính kèm ở GitHub Release); APK cũ nhận thông báo "có bản mới" cho tới khi cài bản này. Dữ liệu nhân vật cũ vẫn nạp được (đã kiểm `kiem-save` trên bản sao lưu bản chạy thật 14/11, 7 nhân vật, 0 lỗi); sao lưu (`prod.sh backup`) trước khi `up`; quay lại bản trước bằng `prod.sh rollback` (bỏ `MIN_PROTOCOL_VERSION` nếu quay về `v0.1.3`).
- Chưa thử trên điện thoại thật (như 0.1.1 và 0.1.2).

## [0.1.3] — 14/11/2026: bản vá, chơi hoàn toàn bằng bàn phím

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
- Android `versionCode` 4, `versionName` 0.1.3.

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
