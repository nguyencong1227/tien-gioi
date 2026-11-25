# Cốt truyện và bản đồ mở rộng của Tiên Giới

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục **75** (25/11/2026): người dùng muốn **cốt truyện và bản đồ theo Vạn Kiếp Tu Tiên**.
> Mở rộng mục 19-20: ĐƯỢC dùng cốt truyện, sự kiện, địa danh, nhân vật, quốc gia, tông phái của Vạn Kiếp Tu Tiên (người phát triển đã cho phép theo người dùng), vẫn ghi nguồn ở `docs/NGUON_NOI_DUNG.md` mục 3.
> Tài liệu này do Dev A viết; Dev E / G / D (nội dung), B (bản đồ Tiled), F / H (test) làm theo. Trạng thái: **bản 1, chờ người dùng xem** (mục 10 có các câu hỏi mở).

## 1. Cách dùng tài liệu và quy tắc nguồn

- **Nguồn duy nhất:** bản sao trên máy `~/TT/van-kiep-tu-tien-clone` (chỉ đọc). Dữ liệu tiếng Việt nằm ở `site/assets/content-ClG6Ha-i.json` (khoá dạng `/content/world/lore.yaml`, `/content/npc/...`, `/content/encounters/...`, `/content/enemies/...`) và địa lý ở `site/data/dia-danh.json` (2210 địa danh, mỗi mục có `the_luc`, `loai`, toạ độ trên bản đồ thế giới 2000 x 1000 và `cap_nen`), `site/data/quoc-gia.json`, `site/data/khu.json`. **KHÔNG dùng** `content-zh-*.json` và trường `ten_han` (chữ Hán).
- **Cách nhập:** lời thoại và mô tả dùng nguyên văn (đã là tiếng Việt), chỉnh số cho cân bằng Tiên Giới, đổi từ ngữ không hợp văn phong; mỗi mục một dòng ở `docs/NGUON_NOI_DUNG.md` mục 3: sự kiện / mạch truyện ghi loại `su_kien`, địa danh và nhân vật ghi `du_lieu`, cột Nguồn ghi khoá + id.
- **Việc đã đổi ở mục 75** (PR này): `AGENTS.md` (Asset nguồn 3) và `docs/NGUON_NOI_DUNG.md` không còn cấm nhân vật / cốt truyện / quốc gia / tông phái của Vạn Kiếp. Còn lại: tông phái của game đó dùng làm NPC / địa danh được nhưng **không thay tên tông môn do người chơi lập**; tên của truyện / game KHÁC (vd Hàn Lập) vẫn cấm; chiêu thức giữ lối nói trung tính đã làm.
- **Ba lớp sự thật** (nguồn đánh dấu mỗi mẩu lore bằng `lop`): `chinh_thong` (chính sử mà trẻ con năm nước đều thuộc), `da_su` (truyền miệng của từng tộc, mâu thuẫn chính sử), `chan_tuong` (điều thật sự đã xảy ra). Tiên Giới dùng đúng ba lớp này làm **nhịp mở truyện**: chương đầu chỉ nghe chính sử, giữa truyện nghe dã sử, cuối truyện mới chạm chân tướng.
- **Không tự bịa tên riêng của nhân vật chính / phản diện lớn** mà nguồn không có: chỗ nào tài liệu ghi "nhân vật gốc Tiên Giới" thì người viết (Dev E) đặt tên theo Từ điển (`docs/TU_DIEN_TIEN_GIOI.md`) và ghi rõ là nhân vật gốc.

## 2. Thế giới trong một trang

**Khung:** Nhân giới và Linh giới ngăn bởi **Thiên Môn**. Ba nghìn năm trước, ngày **Đoạn Thiên**, năm vị tổ sư nhân tộc liên thủ chém **Yêu Hoàng** trên Trung Châu rồi phong cửa trời. Đại địa vỡ đôi, Trung Châu chìm thành **Vĩnh Triều Hải**; người sống sót chạy ra hai bờ, tổ sư dựng tông môn trước, đệ tử dựng triều đình sau, nên tông môn vẫn đứng trên vua. Lời sấm không rõ ai nói trước: _"Ba nghìn năm phong thiên, cửa trời tự hiện."_ **Năm nay là kỳ hạn.**

- **Chính sử:** Ngũ Tổ chém Yêu Hoàng vì Yêu Hoàng muốn đoạt Thiên Môn cho riêng yêu tộc.
- **Dã sử:** mưa kiếm Đoạn Thiên (kiếm nào cũng gãy ở mũi, như đâm vào thứ cứng hơn trời); Bằng già nói Yêu Hoàng chết vì nói thật; Hạt tộc dựng bia "Hoàng không cướp cửa. Hoàng chặn cửa."
- **Chân tướng:** Thiên Môn không tự đóng. Năm tổ sư phong nó vì Linh giới đang hút cạn linh khí Nhân giới qua cửa, và vì cửa đóng rồi thì không còn ai đứng trên họ. Yêu Hoàng chắn trước cửa nên bị chém và gánh tội. Phong ấn rạn đúng dưới chân cửa: Trung Châu chìm từ đó. Phong ấn cũng khoá đường hồn lên trên: hồn mạnh quay vòng trong Nhân giới (đó là **luân hồi** của Tiên Giới). Trong năm người chỉ **Thích Không** hối hận; ông xuống **bến Vong Xuyên** cầm sào chở những hồn do chính tay mình khoá. Người chơi gọi ông là **Lão Đò**.

**Nối với cơ chế đã có của Tiên Giới (không đổi luật):** Hoàng Tuyền (chết thật = mất kiếp) chính là bến Vong Xuyên; chân linh là hồn quay vòng; Tam Sinh Thạch là thứ Lão Đò đổi cho hồn mang nhớ về kiếp sau. Nhân vật người chơi không có tên truyện: họ là **một chân linh** đang sống một kiếp trong năm kỳ hạn.

**Thế lực (nguồn: `/content/world/quoc_gia.yaml`, `toc_yeu.yaml`, `dia-danh.json`):**

| Thế lực | Vị trí (bản đồ thế giới) | Nét chính cho truyện |
| --- | --- | --- |
| **Đại Ung** | trung nguyên, nam | trọng lễ và đạo môn; Ngũ Tổ Từ (bài vị Thích Không để trống lư, "Ngài dặn đừng thắp, người còn đang làm việc"); tự coi là chính thống của Ngũ Tổ |
| **Bắc Minh** | bắc và giữa | đất đọng trên mai Huyền Vũ; tông môn đứng đầu nước; đá xếp trước miếu là lời nhắc "còn có người nhớ" |
| **Lương Quốc** | tây | vùng biên ải, thú triều; **Huyết Lương chi biến** (Uy Vân Kinh, Lang Lĩnh); Huyết Sát Tông gần kinh đô; Lang tộc ở phía tây bắc |
| **Viêm Quốc** | đông nam | Phượng (chết rồi sống lại sau năm trăm năm, miếu thần không tắt đèn); Xà tộc, Kim Cương Tự |
| **Thịnh Quốc** | đông | nước buôn: trạm thuế đầu đường, đan rẻ nhưng mua gì cũng mất phí phường thị ("cái gì cũng có giá") |
| **Yêu tộc** | rải khắp | Lang, Hồ, Xà, Bằng (Tuyết Bằng), Hạt (canh U Hồn Điện), Hùng, Hổ, Quy, Giao (canh mộ rồng dưới Vĩnh Triều Hải): chia lãnh địa riêng; có tộc làm "cửa vào yêu tộc cho người chơi" |
| **Tầm Thiên Hội** | không sơn môn, chỉ có người | tin cửa trời mở thì linh khí lại chảy, hồn được lên trên; biết rằng cửa mở thì linh khí Nhân giới chảy theo nhưng không nhắc trước người mới |

## 3. Nhân vật

Tất cả lấy từ `/content/npc/*.yaml` và `/content/world/lore.yaml` (tên, tính cách, điều muốn, bí mật có trong nguồn; viết lại lời thoại bằng tiếng Việt Tiên Giới). "Chương" là chương dự kiến xuất hiện (mục 5).

| Nhân vật | Vai trong truyện | Nguồn (ghi ở `NGUON_NOI_DUNG`) | Chương |
| --- | --- | --- | --- |
| **Lão Đò** (Thích Không) | người dẫn; hiện ở Hoàng Tuyền ngay kiếp đầu; chân tướng: một trong Ngũ Tổ | `npc/xuyen_kiep.yaml`, `lore.ngu_to`, `lore.lao_do_*` | 1 → 10 |
| **Ninh Tam Sinh** | cô gái nhớ mọi kiếp của mình và nhớ người chơi; muốn thoát luân hồi dù phải mở Thiên Môn; vừa là bạn đồng hành vừa là cám dỗ | `npc/xuyen_kiep.yaml` | 2 → 10 |
| **Mộ Dung Triệt** | thiên kiêu Đại Ung (kiếm), kiêu ngạo chính trực; đối thủ cùng bậc đầu truyện | `npc/thien_kieu.yaml` | 2 - 5 |
| **Ôn Như Ngọc** | đan sư, không bao giờ bội khế ước; đang luyện Diên Thọ Đan cho lão tổ Bắc Minh | `npc/thien_kieu.yaml` | 3 - 6 |
| **Minh Độ** | tăng nhân hiền, lớn lên ở miếu Xà Nương, còn giữ vảy rắn; nghiêng về độ hóa | `npc/thien_kieu.yaml` | 3 - 7 |
| **Thác Bạt Sương** | nữ người Bắc Minh, thể Huyền Vũ, kinh mạch có tật, cần cơ duyên Trung Châu | `npc/thien_kieu.yaml` | 4 - 7 |
| **Cố Tẫn** | thanh niên lầm lì ở biên ải Lương, mơ thấy mặt trời cháy: chuyển thế của một tông chủ Liệt Dương Tông tử chiến ở Huyết Lương chi biến | `npc/thien_kieu.yaml`, `lore.huyet_luong_*` | 5 - 6 |
| **Yến Bắc Quy** | kiếm tu sáng chói, tham vọng; thật ra là người của Tầm Thiên Hội (nằm vùng ở tông môn Bắc Minh) | `npc/thien_kieu.yaml` | 4 - 10 |
| **Bằng Thất** | thanh niên Bằng tộc muốn thống nhất yêu tộc và báo thù Đoạn Thiên; hồn Yêu Hoàng đang nhập dần vào hắn | `npc/thien_kieu.yaml`, `lore.doan_thien_*` | 4 - 10 |
| **Đỗ Thập Tam Nương** | tán tu lém lỉnh, người duy nhất không mang bí mật nào; nhân vật nhẹ nhõm xuyên suốt, giao việc phụ | `npc/thien_kieu.yaml` | 1 - 5 |
| **Lạc Thanh Sơn** | lão tiều phu, tán tu Hóa Thần đại viên mãn ở Tam Mộc Thôn; ghét kẻ cậy mạnh hiếp yếu | `npc/cao_nhan.yaml` | 5 |
| **Đoan Mộc Thu** | người xem cờ trên đỉnh Tàn Phong; ba trăm năm trước ra tay một lần, cứu nhầm kẻ thành ma đầu, từ đó chỉ xem | `npc/cao_nhan.yaml` | 5 - 6 |
| **Nhân vật gốc Tiên Giới (Dev E đặt tên)** | lãnh tụ ngoài sáng của Tầm Thiên Hội (kẻ thuyết phục: "mở cửa cho hồn lên trên"); phản diện chính | không có trong nguồn | 4 - 10 |
| **Nhân vật gốc Tiên Giới (Dev E đặt tên)** | "Phong chủ" ký sổ huyết trận ở Uy Vân Kinh (lore: sổ trận khắc trước thú triều ba tháng, ba nghìn người tế, không ai mặc áo Huyết Sát) | gợi từ `lore.huyet_luong_tran_khac_truoc` | 6 |

**Nhân vật gốc đã có của Tiên Giới (giữ nguyên, thêm móc truyện):** Hà lão, Lâm Thanh Tùng, Thiết Ngưu, Mạc Thông, Lôi Báo, Tống Vân Hạc, Phó Quang, Hồ Thiết, Thôi Tuyết Phong, Kỳ Thiên Lộc, Lô Băng Thiết, Huyền Cơ, Mộc Diên, Tô Linh Ấn (`shared/src/npcs.ts`).

Các **thiên kiêu** là "Thiên Kiêu Bảng" trong nguồn: mỗi người có "mệnh độ" (các mốc đời theo năm); Tiên Giới dùng chúng làm **đối thủ / bạn đồng hành có mốc theo CHƯƠNG** (không theo năm), mỗi chương gặp lại một lần ở bậc cao hơn.

## 4. Bản đồ hiện có đặt vào thế giới

Bốn bản đồ giữ nguyên tên, seed, cổng, quái (đã có test); chỉ **đặt vào địa lý** và thêm móc truyện. Hành lang đi về phía bắc từ nam Đại Ung lên rìa tây Bắc Minh:

| Bản đồ (id) | Cảnh giới | Đặt vào thế giới | Móc truyện chương này |
| --- | --- | --- | --- |
| **Lạc Hà Trấn** (`lac_ha`) | Phàm Nhân - Luyện Khí | trấn nhỏ phía nam Đại Ung, ven sông Hà Thủy, rìa Cửu Hổ Lâm Hải | bia Vô Tự đếm năm; lời đồn lời sấm; giấc mơ về bến sông (Lão Đò) |
| **Hắc Phong Cốc** (`hac_phong`) | Trúc Cơ | thung lũng gió phía bắc Đại Ung (vùng Ma Dã) | **mũi kiếm gãy** nhặt từ xác Xích Mãng (manh mối đầu tiên về Đoạn Thiên); Mộ Dung Triệt ở Thanh Lộ Trạm |
| **Âm Sương Trạch** (`am_suong`) | Kim Đan | đầm lầy giáp biển, nơi dân chài kể "đêm triều rút" | Hắc Giao canh mộ rồng (Giao tộc); Minh Độ và chiếc vảy rắn; Ôn Như Ngọc hái thuốc |
| **Hàn Vân Lĩnh** (`han_van`) | Nguyên Anh | băng nguyên rìa tây Bắc Minh (vùng Băng Bình Nguyên) | Thiên Hàn Vương; Tuyết Bằng tộc và "bằng già chờ người nhà quay lại"; gặp Bằng Thất, Thác Bạt Sương, Yến Bắc Quy |
| **Linh Hư Bí Cảnh** (`bi_canh_linh_hu`) | bí cảnh theo đội | không đổi | không đổi |

Cổng bắc của Hàn Vân Lĩnh hiện **chưa có** (bản đồ cuối chuỗi). Mục 6 đặt cổng đó dẫn sang bản đồ mới đầu tiên.

## 5. Mạch chính theo chương

Một chương = một cảnh giới (hoặc một bản đồ). Mỗi chương có: chuỗi nhiệm vụ **chính** nhiều bước có lời thoại, nhiệm vụ **phụ**, một **trùm chương**, và **một lớp sự thật** mở ra. Thưởng truyện (danh hiệu, mảnh vật phẩm cốt truyện) do Dev E đề xuất theo khung thành tựu / danh hiệu hiện có.

| Chương | Tên | Bản đồ | Cảnh giới | Lớp sự thật | Mốc truyện | Trùm chương |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nhập thế | Lạc Hà Trấn | Phàm Nhân - Luyện Khí 9 | chính sử | đến trấn, gặp Hà lão, nghe lời sấm; chết kiếp đầu thấy bến sông và ông lái đò | Hắc Hổ (đã có) |
| 2 | Mãng hoạn | Hắc Phong Cốc | Trúc Cơ | chính sử | nhặt mũi kiếm gãy mũi; Mộ Dung Triệt thách tỉ thí; Đỗ Thập Tam Nương rủ đi hái thuốc | Xích Mãng (đã có) |
| 3 | Đêm triều rút | Âm Sương Trạch | Kim Đan | dã sử (Giao, Quy) | dân chài kể Triều Khư; mộ rồng; Minh Độ và Ôn Như Ngọc; Ninh Tam Sinh xuất hiện lần đầu | Hắc Giao (đã có) |
| 4 | Hàn Vân | Hàn Vân Lĩnh | Nguyên Anh | dã sử (Bằng, bia Hạt) | Bằng Thất; Thác Bạt Sương; Yến Bắc Quy; lần đầu nghe tên **Tầm Thiên Hội** | Thiên Hàn Vương (đã có) |
| 5 | Lang Hoang | **Lang Hoang** (mới) | Hóa Thần | dã sử (Lang) | đàn lang con mất tích; Đoan Mộc Thu; Lạc Thanh Sơn; thú triều bắt đầu từ đâu | Thiên Lang Vương |
| 6 | Huyết Lương | **Uy Vân Kinh** (mới) | Hóa Thần hậu kỳ | chân tướng (một phần) | sổ huyết trận khắc trước thú triều; Cố Tẫn thức tỉnh; "Phong chủ" | Huyết Ma Hộ Pháp / tàn hồn tông chủ Liệt Dương Tông |
| 7 | Triều Khư | **Triều Khư** (mới) | Luyện Hư | dã sử → chân tướng (mộ rồng, phong ấn thở) | đêm triều rút lộ phố cổ dưới đáy; Lão Đò hiện hình ở bến thật; phong ấn "thở" | Giao Hoàng |
| 8 | Hoàng chặn cửa | **U Hồn Điện** (mới) | Hợp Thể | chân tướng (Yêu Hoàng chặn cửa) | sa mạc Hạt tộc; bia "Hoàng không cướp cửa. Hoàng chặn cửa."; Bằng Thất bị hồn Yêu Hoàng chiếm | Hạt Hoàng (thủ lăng) |
| 9 | Đoạn Thiên | **Kiếm Trạch** (mới) | Đại Thừa | chân tướng (năm người khoá cửa) | chiến trường Đoạn Thiên; kiếm gãy mũi khớp với mũi kiếm ở chương 2; Ngũ Tổ tàn trận | Ngũ Tổ Tàn Trận / Vạn Kiếm Oán Hồn |
| 10 | Thiên Môn | **Thiên Môn Hạ** (mới) | Độ Kiếp | chân tướng đầy đủ | dưới chân cửa trời; Tầm Thiên Hội ra mặt; Lão Đò kể trọn; **ba lựa chọn** (mục 8) | Tàn hồn Yêu Hoàng |

Ghi chú:

- Chương 1-4 **đã có nội dung** (bốn bản đồ, chuỗi chính Nhập thế → Thiên Hàn hoạn): việc là **gắn móc truyện** (sửa lời thoại hiện có, thêm vài việc phụ), không viết lại.
- Chương 5-10 là **sáu bản đồ mới** (mục 6). Hóa Thần có hai bản đồ vì Hóa Thần là cảnh giới mới đầu tiên sau Nguyên Anh và là chỗ truyện đổi giọng (từ "đi săn" sang "điều tra").
- Vô Nhai Uyên (tháp bí cảnh có sẵn trong nguồn: `/content/world/vo_nhai_uyen.yaml`, bảng trùm theo cảnh giới) là **đường phụ** cuối trò (mục 7), không thuộc mạch chính.

## 6. Bản đồ mới

**Khung chung cho mọi bản đồ mới** (mục 56 và mục 67 của quyết định người dùng, khuôn của bốn bản đồ hiện có):

- Mỗi bản đồ một phòng, tên phòng `roomNameOf(mapId)`; dựng từ tệp Tiled (`shared/maps/<id>.json` + `<id>.logic.json`), cảnh theo bộ đã duyệt (Ninja Adventure, #1330); mỗi bản đồ có **trạm an toàn** phía nam ở khuôn `town` (r = 5), tên trạm (`townName`) lấy từ địa danh của nguồn, tên vùng hoang (`wildName`) cũng vậy.
- **Trùm sinh sẵn tối đa 6 mỗi bản đồ** (mục 56, `MapDef.validate()`); tổng quái dưới ~70 để tick < 10 ms (`perf.test.ts`); vùng sinh theo `minDanger` của từng loài (nguy hiểm tăng dần về phía bắc).
- Cổng bắc và cổng nam nối thành chuỗi; mỗi bản đồ một đấu trường chặn đường tự dựng theo `arenaMapIdOf`.
- **Quái thường 5-6 loài + 1-2 trùm sinh sẵn** là mặc định; trùm chương (mục 5) có thể là trùm sinh sẵn hoặc trùm cốt truyện chỉ xuất hiện theo nhiệm vụ (dùng bộ chiêu trùm `bosses.ts`, mục 42).
- Mọi tên quái, địa danh, nhân vật ghi bên dưới là **tên trong nguồn**; số liệu quái (máu, công, tốc độ, rơi) do Dev D soạn theo khung cân bằng sau khi Dev A xong tiền đề kỹ thuật (mục 9, A1).

### 6.1. Lang Hoang (chương 5, Hóa Thần)

- **Vị trí:** rìa tây bắc, sau cửa ải **Tuyết Đao Quan** (nguồn: `quan_ai`, Lương Quốc); lãnh địa Lang tộc quanh Lang Hoang, Lang Sào, Huyết Lang Động. Cổng nam nối cổng bắc Hàn Vân Lĩnh.
- **Trạm / vùng hoang:** `townName` **Tuyết Đao Quan**, `wildName` **Lang Hoang**.
- **Nền (mục 67):** thảo nguyên khô, đá tảng, tuyết thưa; sương lạnh.
- **Quái thường:** Dã Lang, Xích Diễm Lang, Hắc Phong Lang, Huyết Nguyệt Lang, Ngân Nguyệt Lang, Thương Nguyệt Lang (`/content/enemies/yeu_thu/tay_tho.yaml`, `canh_gioi_cao.yaml`).
- **Trùm sinh sẵn:** Lang Vương, Thiên Lang Vương (chương); thêm 1-2 trùm nhỏ theo `bosses.ts` nếu cần cho đủ nhịp.
- **Nhiệm vụ chính (~10 bước):** nghe tin lang con mất tích ở Tuyết Đao Quan; theo mùi máu lên Huyết Lang Động; gặp Đoan Mộc Thu (người xem cờ); Lạc Thanh Sơn dạy "gánh thử một lần"; lần theo đường máu về phía quan ải; kết chương: biết đường máu dẫn tới cổng **Liệt Dương Tông**, không phải Uy Vân Kinh, mở cổng sang 6.2.
- **Nhiệm vụ phụ (6-8):** theo khuôn việc phụ hiện có (săn quái, nộp nguyên liệu, hộ tống); lấy từ `encounters` (Tán tu giữ mạch, Phí qua ải, Hàng lậu qua ải...).
- **NPC:** Đoan Mộc Thu, Lạc Thanh Sơn, Đỗ Thập Tam Nương, lính ải Tuyết Đao, thương nhân qua ải, thợ săn lạc rừng.
- **Chặn đường:** cảnh mới theo `/content/encounters/treo_thuong` và `dia_diem/quan_ai` (mã tặc, ma tu hút máu, tán tu tham lam).

### 6.2. Uy Vân Kinh (chương 6, Hóa Thần hậu kỳ)

- **Vị trí:** kinh đô Lương Quốc bị huyết trận bao quanh; cổng bắc của Lang Hoang dẫn vào. Trạm `townName` **Uy Vân Kinh** (khu an toàn do huyết trận giữ, chính là điều mâu thuẫn của truyện), `wildName` **Huyết Trận Uy Vân**.
- **Nền:** đá đỏ, cờ huyết, dòng nước đục; ban đêm.
- **Quái thường:** Luyện Huyết Đệ Tử, Huyết Sát Chân Truyền, Huyết Ảnh, Huyết Mị, Ngạ Quỷ, Cương Thi (`tu_si/ta_tong.yaml`, `ta_vat/chung.yaml`).
- **Trùm sinh sẵn:** Huyết Ma Hộ Pháp, Huyết Hải Lão Ma (`tu_si/canh_gioi_cao.yaml`); trùm chương: Huyết Ma Hộ Pháp hoặc tàn hồn tông chủ Liệt Dương Tông (nhân vật gắn với Cố Tẫn).
- **Nhiệm vụ chính (~10 bước):** vào thành (lính giữ cổng); đọc sổ huyết trận (ba nghìn người tế, không ai mặc áo Huyết Sát); tìm "Phong chủ"; Cố Tẫn thức tỉnh ký ức Liệt Dương; chọn: phá trận (đồng nghĩa mở đường cho thú triều chiếm kinh?) hay giữ trận: **lựa chọn nhỏ đầu tiên**, chỉ đổi lời thoại và phần thưởng truyện, không khoá nội dung.
- **Nhiệm vụ phụ, NPC, chặn đường:** như 6.1; thêm NPC dân kinh đô, lính giữ ải, đạo cô dò tin (`ta_phai/dac_trung.yaml`).

### 6.3. Triều Khư (chương 7, Luyện Hư)

- **Vị trí:** đáy Vĩnh Triều Hải lộ ra khi triều rút; chỉ là bản đồ thường (không phải bí cảnh). Cổng vào ở bến sông (Lão Đò chở). Trạm `townName` **Bến Vong Xuyên** (trạm an toàn là bến đò, tên đã có trong Hoàng Tuyền), `wildName` **Triều Khư**.
- **Nền:** bãi ngập, đá rêu, mái điện chìm, sương mặn.
- **Quái thường:** Hàn Giao Ấu, Huyền Băng Giao, Hàn Giao Hộ Vệ, Thủy Thi, Nịch Hồn, Hải U Linh (`tay_tho.yaml`, `ta_vat/chung.yaml`).
- **Trùm sinh sẵn:** Trầm Uyên Lão Giao, Long Huyết Giao Vương, Giao Hoàng (trùm chương, `thu_bao/chung.yaml`).
- **Nhiệm vụ chính (~10 bước):** nghe đêm triều rút từ dân chài; theo Minh Độ xuống bia dưới đáy ("khoảng cách giữa các lần rút mỗi lần ngắn hơn, con số cuối rơi vào năm ba nghìn"); gặp Quy tộc nhớ ngày đất sụp ("rạn từ giữa ra, đúng chỗ dưới cánh cửa treo trên trời"); thấy mộ rồng (Giao canh mộ rồng); kết chương: Lão Đò thừa nhận mình là người đã khoá cửa.
- **Cơ chế gợi ý (tuỳ Dev A):** "đêm triều rút" là sự kiện theo giờ (khuôn trùm thế giới `world-boss.ts`) mở thêm vùng; chỉ làm khi chương này đã chạy ổn.

### 6.4. U Hồn Điện (chương 8, Hợp Thể)

- **Vị trí:** sa mạc Hạt tộc quanh **U Hồn Điện** (nguồn: di tích, lãnh thổ yêu, bờ nam Vĩnh Triều Hải, sát Viêm Quốc); trạm `townName` **Vọng Quan** (nguồn: `quan_ai` của Viêm Quốc, ngay cạnh U Hồn Điện), `wildName` **U Hồn Điện**.
- **Nền:** cát vàng, điện đổ, sao đêm.
- **Quái thường:** Sa Hạt, Thiết Giáp Hạt, Mê Hạt Vệ, Huyết Vĩ Hạt, Cửu Tiết Hạt, Thiên Độc Hạt (`yeu_thu/dong_tho.yaml`, `canh_gioi_cao.yaml`).
- **Trùm sinh sẵn:** Tử Sa Hạt Vương; trùm chương **Hạt Hoàng Thủ Lăng** (`thu_bao/chung.yaml`).
- **Nhiệm vụ chính (~10 bước):** bia "Hoàng không cướp cửa. Hoàng chặn cửa."; kẻ trộm mộ bị Hạt tộc truy; Bằng Thất bị hồn Yêu Hoàng nhập; chân tướng thứ nhất: Yêu Hoàng chắn cửa chứ không cướp.

### 6.5. Kiếm Trạch (chương 9, Đại Thừa)

- **Vị trí:** chiến trường Đoạn Thiên nơi kiếm của liên quân rơi (nguồn: Kiếm Trạch, Kiếm Mạc; lore: "Kiếm Đài, Kiếm Trạch là chỗ kiếm rơi lên bờ"); trạm `townName` **Tiểu Phong Quan** (nguồn: `quan_ai` của Bắc Minh, sát Kiếm Trạch), `wildName` **Kiếm Trạch**.
- **Nền:** đất xám, kiếm cắm thành rừng, mưa tro.
- **Quái thường:** Kiếm Linh, Cổ Chiến Khôi Binh, Cổ Chiến Khôi Lỗi, Âm Binh, Âm Tướng, Thiết Giáp Âm Binh (`tu_si/khoi_loi.yaml`, `ta_vat/chung.yaml`, `tinh_quai/chung.yaml`).
- **Trùm sinh sẵn:** Cổ Chiến Khôi Tướng; trùm chương **Vạn Kiếm Oán Hồn** và **Ngũ Tổ Tàn Trận** (`thu_bao/chung.yaml`; Ngũ Tổ Tàn Trận là trận chiến cơ chế nhiều pha, dùng bộ chiêu trùm).
- **Nhiệm vụ chính (~10 bước):** nhặt kiếm gãy (khớp mũi kiếm chương 2); đọc tàn bia; chân tướng thứ hai: năm người khoá cửa, vì sao.

### 6.6. Thiên Môn Hạ (chương 10, Độ Kiếp)

- **Vị trí:** dưới chân cánh cửa treo trên trời, giữa Vĩnh Triều Hải; trạm `townName` **Bến Cuối** (chỗ cuối của Lão Đò), `wildName` **Thiên Môn Hạ**.
- **Nền:** băng trắng, hào quang, dây xích của phong ấn.
- **Quái thường:** gom từ các bản đồ trước ở dạng "tàn ảnh" (Giao, Hạt, Lang, âm binh) cho nhẹ việc, thêm 1-2 loài mới do Dev D đặt tên theo Từ điển.
- **Trùm:** trùm chương **Tàn hồn Yêu Hoàng** (nhân vật gốc nguồn nhắc, Dev E viết thoại); thêm ≤ 5 trùm cho đủ 6.
- **Nhiệm vụ chính (~10 bước):** Tầm Thiên Hội ra mặt; Ninh Tam Sinh và Lão Đò nói nốt phần của mình; **ba lựa chọn** (mục 8).

## 7. Đường phụ (sau đợt 3)

- **Vô Nhai Uyên:** tháp bí cảnh nhiều tầng theo bảng trùm theo cảnh giới của nguồn (`/content/world/vo_nhai_uyen.yaml`); dùng hệ thống bí cảnh có sẵn (`dungeon`, phòng tạm theo đội, lượt ngày). Cần thiết kế riêng (Dev A) trước khi giao nội dung.
- **Thêm bản đồ theo tộc yêu (Hồ, Xà, Hùng...):** mỗi tộc một bản đồ ngoài mạch chính; làm sau khi mạch chính xong.
- **Tông môn nguồn làm địa danh:** Huyền Vũ Môn, Thanh Vân Kiếm Tông, Ngân Hạc Kiếm Tông, Huyết Sát Tông, Liệt Dương Tông, Kim Cương Tự... dùng làm điểm đến / NPC trong truyện; **không** thành tông môn người chơi lập được.

## 8. Ba lựa chọn cuối truyện

Lời sấm: đến kỳ, "người đời sau phải chọn lại: phong tiếp, mở ra, hay đứng nhìn kẻ khác chọn." Tiên Giới là game nhiều người, nên lựa chọn **không khoá nội dung và không đổi thế giới chung**:

- Mỗi chân linh chọn **một** trong ba ở cuối chương 10; lưu vào chân linh (`SoulStore`), kèm danh hiệu và phần thưởng truyện khác nhau, đổi được ở kiếp sau (mỗi kiếp một lần chọn).
- Lời thoại của NPC (Lão Đò, Ninh Tam Sinh, Yến Bắc Quy...) phản ứng theo lựa chọn của chân linh.
- Nếu sau này người dùng muốn lựa chọn đổi **thế giới chung** (vd sự kiện toàn máy chủ) thì ghi riêng vào `questions.md`; mặc định KHÔNG làm.

## 9. Việc kỹ thuật và dữ liệu dùng chung

| Mã | Việc | Ai | Ghi chú |
| --- | --- | --- | --- |
| A1 | **Tiền đề kỹ thuật Hóa Thần trở lên:** `REALM_EXP_BASE` mới chỉ có tới Kim Đan (từ Nguyên Anh dùng nhân 6 đặt tạm), `MONSTER_REALM` / `reqRealm` / độ hiếm sách mới tới bậc 4, đường cong chỉ số `statsFor`, đo `can-bang`, ngân sách `perf` / `bench` | A | chặn mọi việc số liệu của D / E |
| A2 | Đăng ký bản đồ mới: tệp Tiled vào `adoptTiledMaps`, danh sách `MAPS`, cổng bắc Hàn Vân Lĩnh, `validate()` | A (+ B) | sau khi B có tệp |
| A3 | Thiết kế Vô Nhai Uyên (bí cảnh nhiều tầng) | A | đợt sau |
| G1 | **Gỡ từ cấm Vạn Kiếp:** `shared/src/glossary-banned.ts` (+ test, `TU_DIEN_TIEN_GIOI.md` mục từ cấm) chỉ còn cấm tên của game / truyện KHÁC; thêm địa danh và nhân vật mới vào Từ điển | G (PR riêng `shared/`, thêm một dev xem) | chặn `check:content` cho nội dung mới |
| G2 | Sổ lore chọn lọc theo chương: bảng địa danh / nhân vật / sự kiện từ nguồn, mỗi mục kèm khoá nguồn, để E / D lấy | G | tài liệu |
| E1 | Gắn móc truyện vào chương 1-4 | E | dữ liệu + test |
| E2 | Chương 5-6 (Lang Hoang, Uy Vân Kinh): kịch bản, nhiệm vụ chính + phụ, NPC, hội thoại | E | kịch bản trước (tài liệu), dữ liệu sau khi có map + quái |
| D1 | Quái + trùm + vật phẩm + sách chiêu Hóa Thần (Lang Hoang, Uy Vân Kinh) | D | sau A1 |
| B1 | Bản đồ Tiled Lang Hoang và Uy Vân Kinh (+ cổng) | B | sau #1330 / cây (mục 73) |
| F1 / H1 | Test chuỗi chính (check:content sâu, e2e chơi thử) và chơi thử AI từng chương | F / H | song song |
| C1 | Bot / thử tải trên bản đồ mới, cập nhật hướng dẫn người chơi | C | sau B1 |

**Thứ tự:** đợt 1 = chương 1-4 gắn móc truyện (E1) + chương 5-6 (A1 → D1, B1, E2) + G1, G2; đợt 2 = chương 7-8; đợt 3 = chương 9-10 và lựa chọn cuối; Vô Nhai Uyên và bản đồ theo tộc yêu để sau. Mỗi đợt là một gói để hỏi người dùng có phát hành không (mục 75).

**Tiêu chí xong chung cho mỗi bản đồ mới:** tệp Tiled + `logic.json` hợp lệ (test `tiled-maps`), `MapDef.validate()` xanh (≤ 6 trùm, tổng quái), chuỗi nhiệm vụ chính nối từ chương trước, `npm run check:content` xanh, `npm test` + typecheck + lint + prettier + `can-bang` xanh, bench không vượt ngân sách (byte / tick, tick < 10 ms), mỗi mục lấy từ nguồn có một dòng ở `NGUON_NOI_DUNG.md`, một lượt chơi thử AI từ cổng vào tới trùm chương.

## 10. Câu hỏi mở cho người dùng

1. **Phạm vi chương 5-10:** sáu bản đồ mới (một kinh đô, ba bản đồ chiến trường, một vùng yêu tộc, một bến cuối) có đúng ý chưa, hay muốn thêm bản đồ theo tộc yêu ngay đợt 1 (Hồ Lâm Hải, Xà tộc...)? Mặc định: chỉ sáu bản đồ trên.
2. **Tông môn người chơi lập có được trùng tên tông phái trong truyện không** (vd Huyền Vũ Môn)? Mặc định: KHÔNG chặn (người chơi tự đặt tên, hệ thống tông môn giữ nguyên).
3. **Lựa chọn cuối truyện** chỉ lưu vào chân linh và đổi lời thoại / thưởng (mặc định) hay muốn đổi cả thế giới chung (sự kiện toàn máy chủ)?
4. **Tên nhân vật gốc Tiên Giới** (lãnh tụ Tầm Thiên Hội, "Phong chủ"): để Dev E đặt theo Từ điển (mặc định) hay người dùng muốn tự đặt?
5. **Hình ảnh / âm thanh** của Vạn Kiếp cho bản đồ mới: mặc định chỉ dùng cảnh đã duyệt (Ninja Adventure); hình nhân vật / quái từ nguồn chỉ khi bảng duyệt (mục 74) có tick.
