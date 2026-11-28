# Từ điển Tiên Giới

> Nguồn chung máy đọc được về thuật ngữ, địa danh và tên chính của Tiên Giới, làm
> chuẩn nhất quán cho mọi người viết nội dung (nhiệm vụ / NPC / hội thoại / vật
> phẩm / chiêu thức...) và cho công cụ kiểm (`npm run check:content`, do Dev F xây,
> mục 61.2). Dữ liệu gốc là hợp đồng `shared/src/glossary.ts` (`GLOSSARY` +
> `glossaryViolations`) — **bảng dưới đây sinh từ đó, viết tay khớp**; thêm thuật
> ngữ thì thêm dòng trong `glossary.ts` rồi cập nhật bảng này. Issue #1198.

## Cách đọc bảng

- **Thuật ngữ chuẩn**: cách viết ĐÚNG (đúng hoa / thường) — luôn dùng cái này.
- **Biến thể sai**: cách viết hay nhầm bị công cụ bắt (thiếu dấu, sai hoa / thường).
  Công cụ khớp **CHÍNH XÁC** — **từ** (ranh giới chữ hai bên) + **phân biệt dấu
  thanh** + **phân biệt hoa / thường**. Nên: "Trúc Cơ" đúng KHÔNG bị báo, "trúc cơ"
  viết thường thì báo, "Truc Co" thiếu dấu thì báo (vì được **liệt kê tường minh**
  trong `wrong`, KHÔNG phải do bỏ qua dấu). Dạng đủ dấu nhưng khác dấu thanh (vd
  "Móc" so với hệ "Moc") KHÔNG bị báo oan.
- **Ghi chú**: lưu ý dễ lẫn (vd "Đại Thừa" — "Thừa" KHÔNG phải "Thăng").
- Vì khớp CHÍNH XÁC (không bóc dấu) nên KHÔNG nhập nhằng: "Lối" (con đường) ≠ "Lôi"
  (hệ), "Móc" ≠ "Moc" — đây là lý do có thể thêm đủ các hệ còn lại. Hỏa / Thổ / Băng
  / Âm / Lôi **sẽ thêm các lượt sau**: mỗi hệ cần quét chữ hiển thị thật để chắc biến
  thể thiếu dấu của nó KHÔNG bám vào chữ trần hợp lệ đang có (vd wrong "Hoa" của Hỏa
  sẽ bám "Hoa" trong "Băng Hoa Loạn"). Hoa / thường của mọi hệ để Dev G chốt ở #1199.

---

## Thuật ngữ chuẩn

### Cảnh giới (và tầng)

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Phàm Nhân | Pham Nhan, pham nhan | |
| Luyện Khí | Luyen Khi, luyen khi | |
| Trúc Cơ | Truc Co, truc co | |
| Kim Đan | Kim Dan, kim dan | |
| Nguyên Anh | Nguyen Anh, nguyen anh | |
| Hóa Thần | Hoa Than, hoa than | |
| Luyện Hư | Luyen Hu, luyen hu | |
| Hợp Thể | Hop The, hop the | |
| Đại Thừa | Dai Thua, dai thua | "Thừa" KHÔNG phải "Thăng". |
| Độ Kiếp | Do Kiep, do kiep | |

### Hệ (ngũ hành mở rộng)

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Mộc | Moc | |
| Thủy | Thuy | |
| Vô sắc | Vo sac | Hệ id `none` (không khắc / không bị khắc); KHÔNG phải chữ "vô sắc" thường. |

> Hỏa / Thổ / Băng / Âm / Lôi chưa đưa vào — sẽ thêm các lượt sau khi quét chữ hiển
> thị thật (xem phần "Cách đọc bảng": khớp CHÍNH XÁC nên không còn nhập nhằng do bóc
> dấu, nhưng biến thể thiếu dấu vẫn phải tránh bám chữ trần hợp lệ). Kim / Phong
> không dấu nên không có biến thể thiếu dấu.

### Phẩm cấp

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Phàm phẩm | Pham pham | |
| Linh phẩm | Linh pham | |
| Bảo phẩm | Bao pham | |
| Tiên phẩm | Tien pham | |
| Thần phẩm | Than pham | |

### Tiền tệ

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Linh thạch | linh thạch, Linh Thạch, LINH THẠCH, Linh thach, linh thach | Chỉ chữ cái đầu "L" hoa, "thạch" thường. Viết thường hết / hoa cả hai / in hoa hết / thiếu dấu đều sai. |

### Khái niệm

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Hoàng Tuyền | Hoang Tuyen, hoang tuyen | Chết thật (mất kiếp); KHÔNG thiếu dấu ("hoang tuyen") hay dính chữ "Hoànguyền". |
| Tam Sinh Thạch | Tam Sinh Thach, tam sinh thach | Bảng mở khóa lợi ích vĩnh viễn của luân hồi. |
| chân linh | chan linh | Linh hồn đầu thai qua kiếp; viết thường, KHÔNG thiếu dấu. (Chưa thêm "Duyên": "cơ duyên" dễ báo oan — để khi có cơ chế khử nhập nhằng.) |
| Thiên Môn | Thien Mon, thien mon | Cửa trời ngăn Nhân giới và Linh giới (mục 75, `docs/COT_TRUYEN.md`). |
| Đoạn Thiên | Doan Thien, doan thien | Ngày Ngũ Tổ chém Yêu Hoàng rồi phong Thiên Môn; chiến trường Kiếm Trạch. |
| Tầm Thiên Hội | Tam Thien Hoi, tam thien hoi | Hội kín muốn mở lại Thiên Môn (phe phản diện). |
| Vong Xuyên | Vong Xuyen, vong xuyen | Bến đò Hoàng Tuyền (nơi Lão Đò chở hồn). |

---

## Địa danh

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Lạc Hà Trấn | Lac Ha Tran, lac ha tran | Trấn trung tâm, bản đồ mặc định. |
| Hắc Phong Cốc | Hac Phong Coc, hac phong coc | |
| Âm Sương Trạch | Am Suong Trach, am suong trach | |
| Hàn Vân Lĩnh | Han Van Linh, han van linh | |
| Vĩnh Triều Hải | Vinh Trieu Hai, vinh trieu hai | Biển có triều rút lộ Triều Khư (chương 7). |
| Lang Hoang |  | Bản đồ chương 5 (Hóa Thần), lãnh địa Lang tộc; không dấu nên không có biến thể sai. |
| Uy Vân Kinh | Uy Van Kinh, uy van kinh | Kinh đô Lương Quốc, bản đồ chương 6. |
| Tuyết Đao Quan | Tuyet Dao Quan, tuyet dao quan | Cửa ải trước Lang Hoang (Lương Quốc). |
| Triều Khư | Trieu Khu, trieu khu | Đáy Vĩnh Triều Hải lộ ra khi triều rút, bản đồ chương 7. |
| U Hồn Điện | U Hon Dien, u hon dien | Di tích sa mạc Hạt tộc, bản đồ chương 8. |
| Vọng Quan | Vong Quan, vong quan | Trạm ở U Hồn Điện (chương 8); KHÔNG lẫn bến 'Vong Xuyên'. |
| Kiếm Trạch | Kiem Trach, kiem trach | Chiến trường Đoạn Thiên, bản đồ chương 9. |
| Tiểu Phong Quan | Tieu Phong Quan, tieu phong quan | Trạm ở Kiếm Trạch (chương 9). |
| Thiên Môn Hạ | Thien Mon Ha, thien mon ha | Dưới chân cửa trời, bản đồ chương 10. |
| Đại Ung | Dai Ung, dai ung | Nước trung nguyên, phía nam (quốc gia, mục 75). |
| Bắc Minh | Bac Minh, bac minh | Nước phía bắc và giữa (quốc gia, mục 75); KHÔNG lẫn chữ 'minh' riêng lẻ. |
| Lương Quốc | Luong Quoc, luong quoc | Nước phía tây, vùng biên ải (quốc gia, mục 75). |
| Viêm Quốc | Viem Quoc, viem quoc | Nước đông nam (quốc gia, mục 75). |
| Thịnh Quốc | Thinh Quoc, thinh quoc | Nước buôn phía đông (quốc gia, mục 75). |

---

## Tên chính

Tên trùm (boss-level, có chữ "Vương") và nhân vật / nhóm nhân vật của mạch truyện mục 75
(Ngũ Tổ, Yêu Hoàng, Lão Đò) — hiện chỉ phủ các tên chính; quái thường và NPC để bổ sung sau.

| Thuật ngữ chuẩn | Biến thể sai | Ghi chú |
|---|---|---|
| Thiên Hàn Vương | Thien Han Vuong, thien han vuong | Trùm Nguyên Anh, rơi Thiên Hàn châu. |
| Linh Hư Yêu Vương | Linh Hu Yeu Vuong, linh hu yeu vuong | Trùm bí cảnh Linh Hư. |
| Phân Thân Yêu Vương | Phan Than Yeu Vuong, phan than yeu vuong | |
| Ngũ Tổ | Ngu To | Năm vị tổ sư nhân tộc; CHỈ biến thể 'Ngu To' hoa chữ đầu (thường 'ngu to' có thể là 'ngu' + 'to' hợp lệ). |
| Yêu Hoàng | Yeu Hoang, yeu hoang | Vua yêu bị Ngũ Tổ chém ngày Đoạn Thiên. |
| Lão Đò | Lao Do | Người dẫn hồn ở bến Vong Xuyên; CHỈ biến thể 'Lao Do' hoa chữ đầu (thường 'lao do' dễ trùng chữ hợp lệ). |

---

## Quy ước đặt tên

> Lấy mẫu từ dữ liệu hiện có (`shared/src/items.ts`, `skills-*.ts`, `game.ts` quái,
> `npcs.ts`); quy tắc dưới là cái mọi người **đang theo**, KHÔNG bịa. Thêm loại tên
> mới thì thêm mục ở đây. Issue #1199.

### Hoa / thường

- **Thuật ngữ, chiêu, đan, phù, trang bị, quái, NPC, địa danh** — viết hoa chữ cái
  đầu MỌI từ (title case): "Hồi Huyết Đan", "Liệt Diễm Chưởng", "Xích Mãng Kiếm",
  "Hắc Hổ", "Lâm Thanh Tùng", "Hắc Phong Cốc".
- **Nguyên liệu (vật liệu thường)** — danh từ chung, chữ đầu **thường**, chỉ chữ chỉ
  loài đôi khi hoa: "Lông thỏ", "Nanh sói", "Da hổ", "Vảy mãng", "Sương mao",
  "Quy giáp", "Độc nang". (Khác đan: đan luôn title case vì là danh từ riêng của
  một loại thuốc.)
- **`id` luôn `snake_case` roman hoá KHÔNG dấu** — `hoi_huyet_dan`, `nanh_soi`,
  `liet_diem_chuong`. `id` KHÔNG hiển thị, nhưng giữ nhất quán để tra bảng dễ.

### Hậu tố chiêu thức (theo phong cách võ học)

Tên chiêu = [biểu tượng / nguyên tố] + [dáng] + **hậu tố chỉ loại hình**. Dùng đúng
một hậu tố chuẩn, đừng mô tả dài thay thế. Các hậu tố đã có trong dữ liệu:

> Bảng 2 cột (KHÔNG quét bởi test đồng bộ GLOSSARY — chỉ quét bảng 3 cột thuật
> ngữ): hậu tố ghi kèm nghĩa trong ngoặc.

| Hậu tố (nghĩa) | Ví dụ |
|---|---|
| Kiếm (kiếm) | Thanh Vân Kiếm Khí, Thu Thủy Kiếm Ảnh, Vạn Kiếm Quy Tông |
| Quyền (đấm) | Liệt Địa Nhất Quyền |
| Chưởng (bàn tay) | Liệt Diễm Chưởng, Thiết Sa Chưởng, Hàn Băng Nhất Chưởng, Hồi Phong Liên Chưởng |
| Chỉ (ngón tay) | Huyết Ảnh Chỉ, Đoạn Trường Chỉ Pháp |
| Ấn (triệu hồi / áp) | Hộ Thân Ấn, Xích Diễm Ấn, Hàn Băng Ấn (thường là pháp bảo) |
| Phù (phù) | Xích Tước Phù, Hỏa Đạn Phù |
| Thuật (thuật) | Phi Thoa Thuật |
| Tán (vũ khí nhỏ) | Thực Giáp Tán |
| Công (khẩu quyết) | Bàn Thạch Hộ Thể Công, Ngũ Chướng Huyền Công, Huyết Trảo Công |
| Quyết (kinh quyển) | Thanh Vân Kiếm Quyết, Điện Mâu Quyết, Phượng Cầu Hoàng Quyết |
| Lục (sách ghi) | Xích Tước Phù Lục |
| Pháp (phương pháp) | Nhiếp Hồn Đại Pháp, Hóa Huyết Đại Pháp, Chấn Hồn Lôi Pháp |
| Kinh (sách) | Độc Đằng Phục Kinh, Liên Châu Lôi Kinh |
| Đồ (biểu đồ) | Liệt Diễm Trận Đồ |
| Trận (thành trận) | Liệt Diễm Trận, Thiên La Lôi Trận |
| Hống (tiếng kêu) | Sư Tử Hống |
| Thủ (tay pháp) | Cầm Long Thủ, Triền Xà Thủ |
| Kình (lực đấm) | Hủ Thủy Kình |
| Kích (đòn đánh) | Phá Sơn Nhất Kích |
| Trảm (chém) | Phân Nhạc Trảm |

> **Kinh quyển (`bookName`)** thường = tên chiêu + hậu tố `Kinh / Quyết / Công /
> Pháp / Lục / Đồ` (vd chiêu "Xích Tước Phù" → quyển "Xích Tước Phù Lục"; chiêu
> "Phá Sơn Nhất Kích" → quyển "Phá Sơn Quyền Kinh").

### Quái

2–4 từ, [đặc điểm màu / loại] + [loài]: "Linh Thố", "Hôi Lang", "Hắc Hổ", "Xích
Mãng", "Sương Hồ", "Thạch Quy", "Độc Thiềm", "Hắc Giao", "Hàn Lang", "Phong Nha",
"Cốt Tượng", "Độc Tước". **Trùm** thêm danh xưng "Vương": "Thiên Hàn Vương",
"Linh Hư Yêu Vương", "Phân Thân Yêu Vương".

### Độ dài hiển thị tối đa (đo từ dữ liệu thật)

Số chữ hiển thị (đã trừ dấu thanh). Đây là hướng dẫn **mềm** theo bố cục hiện tại
(thanh chiêu, tooltip túi, tag quái, danh xưng NPC) — CHƯA có test bắt cứng:

| Loại | Độ dài (dài nhất hiện có; nên giữ) |
|---|---|
| Đan / phù / trang bị (túi, tooltip) | dài nhất 20 ("Thượng Hồi Huyết Đan"); giữ ≤ ~20 |
| Chiêu (thanh chiêu, tooltip) | dài nhất 21 ("Phượng Minh Cầu Hoàng", "Hồi Phong Liên Chưởng"); ≤ ~24, ưu tiên ≤ 20 |
| Kinh quyển (`bookName`) | dài nhất 24; ≤ ~24 |
| Tên / danh xưng NPC | dài nhất 22 ("Trạm trưởng Vọng Sương"); ≤ ~22 |
| Quái (tag trên đầu, tooltip) | dài nhất 19 ("Phân Thân Yêu Vương"); ≤ ~20 |

> Vượt ~24 thì rút gọn (bỏ tính từ thừa) thay vì để tràn tooltip.

### Ví dụ đúng / sai

| Loại | Đúng | Sai | Vì sao |
|---|---|---|---|
| Đan | Hồi Huyết Đan | hồi huyết đan | đan là thuật ngữ, title case |
| Nguyên liệu | Nanh sói | Nanh Sói | vật liệu là danh từ chung, chữ đầu thường |
| `id` đan | `hoi_huyet_dan` | `HồiHuyetDan` / `hoi_huyết_đan` | `id` snake_case KHÔNG dấu, KHÔNG hiển thị |
| Chiêu | Liệt Diễm Chưởng | Liệt Diễm chiêu lửa | dùng hậu tố chuẩn "Chưởng", KHÔNG mô tả dài |
| Chiêu `id` | `liet_diem_chuong` | `LiệtDiemChuong` | snake_case KHÔNG dấu |
| Quái | Xích Mãng | xích mãng | quái viết title case |
| Trùm | Thiên Hàn Vương | Thiên Hàn vua | "Vương" là danh xưng cố định, KHÔNG dịch |

---

## Văn phong

> Giọng chung: văn mạch tu tiên kinh điển — gọn, hàm súc, KHÔNG hiện đại, KHÔNG
> hoa mỹ rườm rà. Lời thoại NPC ngắn (mỗi NPC ~5 dòng), mỗi câu một ý. Mô tả sự
> kiện (dữ liệu `ambush-data.ts`) ngôi ba, có chữ "ngươi", KHÔNG đặt tên nhân vật
> phụ. Issue #1199.

### Xưng hô theo loại nhân vật

| Loại nhân vật | Tự xưng | Gọi người chơi | Giọng | Ví dụ (thật / viết mới hợp phong cách) |
|---|---|---|---|---|
| **Trưởng trấn / Trạm trưởng / Trưởng lão** (người đứng đầu, giữ gìn) | "ta" (già thì "lão phu") | "đạo hữu" (tôn trọng) hoặc "ngươi" (khi dặn việc) | điềm tĩnh, che chở | *"Có việc gì cứ tới tìm ta."* (Trưởng trấn Lâm Thanh Tùng) — *"Kim Đan mới dám đi sâu... Có việc thì nói với ta."* (Trạm trưởng Vọng Sương) |
| **Lão dược sư / Lão đan sư / Lão phù sư** (thợ cả, hiền) | "lão phu" / "ta" | "ngươi" (bề trên dạy dỗ) xen "đạo hữu" | từ tốn, nhắc nhở | *"Mang da lông yêu thú tới, lão phu luyện cho ngươi vài viên."* (Dược sư) — *"Mang nguyên liệu yêu thú tới, ta sẽ nấu cho ngươi viên hộ đạo đúng cảnh giới của mình."* (Lão đan sư Mộc Diên) |
| **Thợ rèn** | "ta" | "ngươi" | cứng cỏi, thực dụng | *"Lò đã đỏ lửa. Mang nanh, da, vảy yêu thú tới đây, ta rèn cho ngươi món ra hồn."* (Thiết Ngưu) |
| **Lái buôn** | "ta" | "ngươi" / "đạo hữu" | tính toán, trả giá; nhắc đối thủ bằng "hắn / hắn ta" | *"Thu được gì cứ bán cho ta... ta trả giá công bằng."* (Phó Quang) — *"Xuống Âm Sương thì tìm Phó Quang, hắn mua bán dưới đầm giỏi không kém ta."* |
| **Đệ tử** (tu sĩ trẻ, tông môn) | "ta" / "tiểu hữu" / "tại hạ" | "trưởng lão" / "đạo hữu" | kính cẩn, xông pha | *"Trưởng lão giao tiểu hữu ra trừ hổ, tiểu hữu dám nhận."* (viết mới — danh vị Tông chủ / Trưởng lão / Đệ tử, `sect.ts`) |
| **Tán tu** (tu sĩ lang thang) | "ta" | "đạo hữu" | tự do, từng trải | *"Gặp đạo hữu giữa đường là duyên, lấy hết đan dược ta còn lại chia đôi đi."* (viết mới) |
| **Tà tu / Ma tu** (phản diện) | "ta" (kẻ khác gọi "hắn") | "đồng đạo" (giả tạo) hoặc "ngươi" (khinh thường) | đe doạ, tàn nhẫn, mỉa mai | *"Đồng đạo cứ chọn một đứa, coi như quà gặp mặt."* (Ma tu tế huyết trì) — *"Đường này qua lại phải nộp mạng, hoặc nộp tiền."* (Trại chủ sơn trại) — *"Qua ải nộp hai mươi linh thạch. Không có thì ở lại giữ tường một đêm."* (thủ ải) |
| **Yêu thú biết nói** (quái cổ xưa) | "ta" / không xưng | "kẻ sống" / "ngươi" | giọng cũ, ngắn, lạnh | *"Dưới này là mộ, kẻ sống không được qua."* (Giao thủ mộ, `ambush-data.ts`) |

### Giọng mô tả vật phẩm (`desc`)

Gọn, chức năng, nêu rõ **tác dụng + số**; KHÔNG kể chuyện, KHÔNG hoa mỹ.

- Đan / phù / trang bị: *"Hồi 40% khí huyết."*, *"Hồi 50% linh lực."*, *"Tăng 5%
  thanh tu vi của bậc hiện tại (tối đa 300 tu vi mỗi viên)."*
- Nguyên liệu: một câu nêu nguồn / gốc: *"Lông mềm của Linh Thố."*

### Ví dụ đúng / sai (văn phong)

| Sai | Đúng — và vì sao |
|---|---|
| "Ok đạo hữu, ta cho ngươi đồ tốt nè!" | "Đồ tốt ta có sẵn, đạo hữu cần thì nói." — "ok" là từ hiện đại (xem Từ cấm), giọng điềm tĩnh |
| "Item này level cao lắm bro" | "Đồ này bảo phẩm, cảnh giới cao mới dùng được." — KHÔNG "item" / "level" / "bro"; dùng "phẩm cấp" / "cảnh giới" |
| "Ta là boss ở đây đấy" | "Ta giữ trạm này bao năm." — KHÔNG gọi mình là "boss"; xưng "ta" + chức danh |
| "Mang đồ tới ta cho ngươi rất nhiều kinh nghiệm wow" | "Mang nguyên liệu yêu thú tới, ta luyện cho ngươi đan." — KHÔNG "wow" / cảm thán hiện đại; gọn, nêu rõ trao đổi |

## Từ cấm

> Khác ba bảng trên (thuật ngữ **chuẩn** cần viết ĐÚNG): đây là danh sách chữ **cấm tuyệt đối**
> trong NỘI DUNG GAME — KHÔNG có dạng viết nào hợp lệ. Máy đọc được ở `shared/src/glossary-banned.ts`
> (`BANNED_TERMS` + `bannedViolations(text)`); bảng dưới viết tay khớp, thêm chữ cấm thì thêm dòng trong
> module đó rồi cập nhật bảng này. Issue #1199.

**Phạm vi áp dụng (quan trọng — tránh dương tính giả):** CHỈ áp cho NỘI DUNG GAME (hội thoại NPC, tên
vật phẩm / chiêu / quái / NPC / trùm, mô tả, lời nhiệm vụ...). **KHÔNG** áp cho chú thích tác quyền,
`CREDITS.md`, `docs/NGUON_NOI_DUNG.md`, hay chính các tệp test (nơi nêu tên cấm để cấm / kiểm chúng —
ví dụ `no-foreign-names.test.ts` và `glossary-banned.test.ts` được loại khỏi bộ quét tên ngoại lai).
Dev F nối `bannedViolations` vào `npm run check:content` (Phần 3 #1200) chỉ quét chữ hiển thị game theo phạm vi này.

### Tên riêng của truyện / game khác (cấm)

> Thế giới Tiên Giới giữ nguyên; KHÔNG mượn nhân vật, tông phái, quốc gia của truyện / game KHÁC làm của
> Tiên Giới (AGENTS.md "Asset nguồn 3"). **Từ 25/11/2026 (QUYET_DINH_M3 mục 75, #1462) tên của Vạn Kiếp Tu Tiên
> (Thanh Vân Môn, Bắc Minh, Huyền Vũ Môn, Kim Đạo Tự, Đan Hà Cốc... cùng cốt truyện, địa danh, nhân vật, quốc gia)
> ĐƯỢC dùng và KHÔNG còn nằm trong bảng cấm**; chúng có mặt ở các bảng thuật ngữ chuẩn phía trên khi đã vào mạch
> truyện (`docs/COT_TRUYEN.md`). Vẫn cấm tên của game / truyện KHÁC: ví dụ người dùng trong issue #1199 và danh sách
> `FOREIGN_NAMES` ở `client/src/no-foreign-names.test.ts`.

| Chữ cấm | Lý do |
|---|---|
| Hàn Lập | nhân vật của tiên hiệp khác (Phàm Nhân Tu Tiên) |

> CHƯA phủ hết — gặp rò rỉ mới (tên nhân vật / tông phái truyện khác) thì THÊM dòng vào `BANNED_TERMS`,
> đừng bịa danh sách rộng không có bằng chứng. Matcher KHÔNG phân biệt hoa / thường nên mọi cách viết đều bị bắt.

> **Chiêu thức giữ lối nói trung tính:** bộ chiêu ở `skills-*.ts` không dùng tên riêng của Vạn Kiếp (test
> `skills-kim-tho.test.ts` canh bằng `VKTT_PROPER`, KHÔNG sửa theo mục 75). Chiêu `thanh_van_kiem_khi` (`Thanh Vân Kiếm Khí` /
> `Thanh Vân Kiếm Quyết` / `Thanh Vân Vạn Kiếm Quyết`, đã vào hồ sơ lưu) giữ nguyên tên hiển thị; đổi chỉ khi người
> dùng yêu cầu (Dev A, PR #1408).

### Từ hiện đại lạc văn phong (cấm, nhất là trong lời thoại)

| Chữ cấm | Nên dùng thay |
|---|---|
| ok | được / vâng / phải vậy |
| level | cấp / cảnh giới |
| boss | trùm |

> Matcher khớp ranh giới từ nên KHÔNG báo oan chữ hợp lệ chứa chuỗi con (vd "ok" KHÔNG bám "book";
> "hàn" / "lập" riêng lẻ KHÔNG bám "Hàn Lập").

**Chữ Hán / CJK KHÔNG liệt kê ở đây:** đã bị `ngon-ngu.test.ts` (quy tắc a) chặn trên TẤT CẢ chữ hiển thị
game — nối trùng chỉ dư thừa. Bộ từ cấm này chỉ lo tên riêng Latinh + từ hiện đại.
