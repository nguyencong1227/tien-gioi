# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ `server/src/balance/simulate.ts`. Sửa số liệu trong `shared/` rồi chạy
> `npm run can-bang -w server` để cập nhật. Test `server/src/balance/simulate.test.ts` giữ đường cong trong mục tiêu.

## Kết quả

- Hết Luyện Khí (sẵn sàng Trúc Cơ): **51 phút** (mục tiêu ~1 giờ)
- Hết Trúc Cơ (sẵn sàng Kim Đan): **2 giờ 50 phút** (mục tiêu ~3 giờ)
- Cả Kim Đan (sau nội dung M6, bảng ở mục "Kim Đan sau nội dung"): **5.7 giờ** săn bãi mới, **5.2 giờ** tối ưu (mục tiêu 5-7 giờ); kinh tế, trang bị và PK ở mục 6-8 của mục đó

| Bậc | Thanh tu vi | Săn gì | Số quái | Phút ở bậc này | Cộng dồn |
|---|---:|---|---:|---:|---:|
| Phàm Nhân | 40 | tho | 10 | 1.4 | 9 phút |
| Luyện Khí Tầng 1 | 280 | lang | 19 | 4.3 | 14 phút |
| Luyện Khí Tầng 2 | 308 | lang | 21 | 4.6 | 18 phút |
| Luyện Khí Tầng 3 | 339 | lang | 25 | 5.0 | 23 phút |
| Luyện Khí Tầng 4 | 373 | lang | 28 | 5.3 | 29 phút |
| Luyện Khí Tầng 5 | 410 | lang | 32 | 5.7 | 34 phút |
| Luyện Khí Tầng 6 | 451 | ho | 9 | 4.2 | 38 phút |
| Luyện Khí Tầng 7 | 496 | ho | 11 | 4.0 | 42 phút |
| Luyện Khí Tầng 8 | 546 | ho | 13 | 4.2 | 47 phút |
| Luyện Khí Tầng 9 | 600 | ho | 16 | 4.8 | 51 phút |
| Trúc Cơ Sơ kỳ | 4400 | ho | 118 | 31.6 | 1 giờ 23 phút |
| Trúc Cơ Trung kỳ | 5060 | ho | 136 | 35.2 | 1 giờ 58 phút |
| Trúc Cơ Hậu kỳ | 5819 | ho | 209 | 52.1 | 2 giờ 50 phút |

Bảng trên dừng ở hết Trúc Cơ (quái và đồ gốc: Linh Thố, Hôi Lang, Hắc Hổ, Xích Mãng). Cảnh giới Kim Đan (ba bậc, ba quái mới, trùm Hắc Giao, ba bộ trang bị, phí rèn) ở mục "Kim Đan sau nội dung (M6)" cuối tệp: săn solo, trùm theo đội, nhịp, luân hồi, tổ đội, kinh tế, trang bị, PK và bí cảnh. Cảnh giới Nguyên Anh (bốn quái Hàn Vân, trùm Thiên Hàn Vương, bộ IV, phí rèn) ở mục "Nguyên Anh sau nội dung (M7.5 / M7.9)".

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×1.08), quái đánh trúng 80% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá 50% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: tho 6s, lang 8s, ho 12s, mang 90s, suong_ho 10s, thach_quy 12s, doc_thiem 14s, hac_giao 90s, han_lang 10s, phong_nha 10s, cot_tuong 12s, doc_tuoc 14s, thien_han_vuong 90s.
- Thưởng tu vi của chuỗi nhiệm vụ chính chia đều cho các bậc của cảnh giới tương ứng; đi lại + nói chuyện cả chuỗi: 8 phút.
- Đột phá thất bại mất 30% thanh tu vi, tính theo số lần thất bại kỳ vọng.
- Trang bị: mặc món tốt nhất đủ cảnh giới ở mỗi ô (giả định đã rèn kịp; nguyên liệu rơi trong lúc săn, không tính thời gian đi rèn). Không mặc gì thì chậm hơn khoảng 10%.
- Chưa tính: nhiệm vụ lặp, đan dược, thời gian chết. Đánh theo đội: xem mục "Đi theo đội" bên dưới.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).

## Đi theo đội (tổ đội, #74)

Tu vi mỗi giờ của **mỗi thành viên** khi đi theo đội so với đánh một mình (1.00× = bằng nhau). Mỗi bên chọn loại quái
tốt nhất mà đủ an toàn (trong ngoặc là quái đội chọn). Mô hình (`huntRate(..., party)` trong `simulate.ts`): `n` người cùng cảnh giới
đánh chung, sát thương cộng dồn nên trận ngắn `n` lần, quái chỉ đánh một mục tiêu nên mỗi người chịu 1/`n` sát thương (đội đánh được quái
mà một người không dám), thời gian tìm quái không đổi, tu vi mỗi con nhân `partyExpShare(n)` (chia đều, thưởng 15% mỗi người thêm).
Không tính: nhiều đội tranh cùng một con trùm (số quái có hạn và chờ hồi sinh), thời gian tập hợp đội, người cầm đầu mạnh hơn.

| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |
|---|---|---:|---:|---:|
| Phàm Nhân bậc 1 | tho | 0.95× (lang) | 0.83× (lang) | 1.15× (ho) |
| Luyện Khí bậc 1 | lang | 1.10× (ho) | 1.04× (ho) | 0.98× (ho) |
| Luyện Khí bậc 2 | lang | 1.13× (ho) | 1.04× (ho) | 0.96× (ho) |
| Luyện Khí bậc 3 | lang | 1.15× (ho) | 1.03× (ho) | 0.94× (ho) |
| Luyện Khí bậc 4 | lang | 1.17× (ho) | 1.03× (ho) | 0.93× (ho) |
| Luyện Khí bậc 5 | lang | 1.19× (ho) | 1.03× (ho) | 0.91× (ho) |
| Luyện Khí bậc 6 | ho | 0.83× (ho) | 0.70× (ho) | 0.62× (ho) |
| Luyện Khí bậc 7 | ho | 0.75× (ho) | 0.62× (ho) | 1.79× (mang) |
| Luyện Khí bậc 8 | ho | 0.73× (ho) | 1.96× (mang) | 1.72× (mang) |
| Luyện Khí bậc 9 | ho | 0.71× (ho) | 1.89× (mang) | 1.65× (mang) |
| Trúc Cơ bậc 1 | ho | 2.22× (mang) | 1.78× (mang) | 1.53× (mang) |
| Trúc Cơ bậc 2 | ho | 2.19× (mang) | 1.73× (mang) | 1.48× (mang) |
| Trúc Cơ bậc 3 | ho | 2.51× (mang) | 1.97× (mang) | 1.68× (mang) |

Đọc bảng: lớn hơn 1.5× thường là bậc mà đội đánh được Xích Mãng (trùm) còn một người chưa dám; nhỏ hơn 1× là bậc mà chia tu vi
làm đội chậm hơn đánh một mình (thời gian tìm quái không rút ngắn được). Cao nhất: **2.51×** (Trúc Cơ bậc 3, đội 2); thấp nhất:
**0.62×** (Luyện Khí bậc 6, đội 4); **13/39** ô vượt 1.5×. Đây là số đo của mô hình, **chưa phải quyết định cân bằng**:
mục tiêu "không quá ~1.5×" của #74 chưa đạt ở những ô trên. Xem câu hỏi trong `~/TT/orchestra/questions.md` (thưởng tu vi của đội).

## Kinh tế Linh thạch (Sprint 5, #102)

Mô hình kinh tế dựa trên hợp đồng `shared/src/currency.ts`: tiền rơi trực tiếp (`COIN_DROPS`), tiền bán đồ rơi (`DROP_TABLES` × `sellPrice`), và giá mua đan hồi phục tại cửa hàng Lão dược sư (`buyPrice("hoi_huyet_dan") = 24` Linh thạch).

### 1. Kỳ vọng Linh thạch từ mỗi con quái

| Quái | Cấp | Máu | Tiền rơi TB | Bán đồ rơi TB | Tổng LT / con | Đồ bán có giá |
|---|---:|---:|---:|---:|---:|---|
| Linh Thố (`tho`) | 0 | 40 | 1.20 | 1.23 | **2.43** | Lông thỏ (1 LT), Hồi huyết đan (6 LT) |
| Hôi Lang (`lang`) | 1 | 140 | 2.80 | 2.55 | **5.35** | Nanh sói (2 LT), Hồi huyết đan (6 LT), Hồi linh đan (6 LT) |
| Hắc Hổ (`ho`) | 7 | 600 | 11.20 | 8.52 | **19.72** | Da hổ (9 LT), Đan hồi phục (6 LT), Tụ khí đan (45 LT) |
| Xích Mãng (`mang`) | 12 | 4000 | 225.00 | 246.00 | **471.00** | Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT) |

### 2. Thu nhập Linh thạch mỗi giờ khi săn một loại quái

Giả định người chơi đánh đơn lẻ (solo), dùng Kiếm chém, đả tọa hồi phục khí huyết sau trận, mặc trang bị tốt nhất theo bậc (`bestGear`). Chỉ hiển thị những loại quái đủ an toàn để săn đơn (mất ≤ 50% HP mỗi trận). Cột "Hồi huyết đan / giờ" tính theo giá mua ở Dược sư (24 LT/viên).

| Bậc | Quái săn | Diệt / giờ | Tiền rơi / giờ | Bán đồ / giờ | Tổng LT / giờ | Hồi huyết đan / giờ |
|---|---|---:|---:|---:|---:|---:|
| Phàm Nhân | Linh Thố | 442 | 531 | 544 | **1,075** | 44.8 |
| Luyện Khí Tầng 1 | Linh Thố | 508 | 609 | 624 | **1,234** | 51.4 |
| Luyện Khí Tầng 1 | Hôi Lang | 257 | 720 | 656 | **1,377** | 57.4 |
| Luyện Khí Tầng 2 | Linh Thố | 521 | 626 | 641 | **1,267** | 52.8 |
| Luyện Khí Tầng 2 | Hôi Lang | 281 | 788 | 718 | **1,506** | 62.7 |
| Luyện Khí Tầng 3 | Linh Thố | 529 | 635 | 651 | **1,286** | 53.6 |
| Luyện Khí Tầng 3 | Hôi Lang | 297 | 833 | 758 | **1,591** | 66.3 |
| Luyện Khí Tầng 4 | Linh Thố | 540 | 648 | 664 | **1,312** | 54.7 |
| Luyện Khí Tầng 4 | Hôi Lang | 319 | 894 | 814 | **1,707** | 71.1 |
| Luyện Khí Tầng 5 | Linh Thố | 547 | 656 | 672 | **1,328** | 55.3 |
| Luyện Khí Tầng 5 | Hôi Lang | 334 | 934 | 851 | **1,785** | 74.4 |
| Luyện Khí Tầng 6 | Linh Thố | 553 | 664 | 681 | **1,345** | 56.0 |
| Luyện Khí Tầng 6 | Hôi Lang | 348 | 976 | 888 | **1,864** | 77.7 |
| Luyện Khí Tầng 6 | Hắc Hổ | 133 | 1,492 | 1,135 | **2,627** | 109.5 |
| Luyện Khí Tầng 7 | Linh Thố | 566 | 679 | 696 | **1,375** | 57.3 |
| Luyện Khí Tầng 7 | Hôi Lang | 376 | 1,054 | 960 | **2,014** | 83.9 |
| Luyện Khí Tầng 7 | Hắc Hổ | 168 | 1,883 | 1,433 | **3,316** | 138.2 |
| Luyện Khí Tầng 8 | Linh Thố | 570 | 683 | 701 | **1,384** | 57.7 |
| Luyện Khí Tầng 8 | Hôi Lang | 385 | 1,077 | 981 | **2,057** | 85.7 |
| Luyện Khí Tầng 8 | Hắc Hổ | 180 | 2,018 | 1,535 | **3,554** | 148.1 |
| Luyện Khí Tầng 9 | Linh Thố | 573 | 688 | 705 | **1,393** | 58.1 |
| Luyện Khí Tầng 9 | Hôi Lang | 393 | 1,101 | 1,002 | **2,103** | 87.6 |
| Luyện Khí Tầng 9 | Hắc Hổ | 193 | 2,167 | 1,648 | **3,815** | 159.0 |
| Trúc Cơ Sơ kỳ | Linh Thố | 581 | 697 | 715 | **1,412** | 58.8 |
| Trúc Cơ Sơ kỳ | Hôi Lang | 410 | 1,149 | 1,046 | **2,195** | 91.5 |
| Trúc Cơ Sơ kỳ | Hắc Hổ | 223 | 2,499 | 1,901 | **4,399** | 183.3 |
| Trúc Cơ Trung kỳ | Linh Thố | 583 | 700 | 718 | **1,418** | 59.1 |
| Trúc Cơ Trung kỳ | Hôi Lang | 415 | 1,163 | 1,059 | **2,222** | 92.6 |
| Trúc Cơ Trung kỳ | Hắc Hổ | 232 | 2,603 | 1,980 | **4,583** | 191.0 |
| Trúc Cơ Hậu kỳ | Linh Thố | 586 | 703 | 720 | **1,423** | 59.3 |
| Trúc Cơ Hậu kỳ | Hôi Lang | 420 | 1,176 | 1,071 | **2,247** | 93.6 |
| Trúc Cơ Hậu kỳ | Hắc Hổ | 241 | 2,699 | 2,053 | **4,752** | 198.0 |

### 3. Nhận xét & phân tích cân bằng kinh tế

- **So sánh các bãi quái cùng cấp (Linh Thố vs Hôi Lang - khu vực khởi đầu ngoài trấn):**
  - Cả Thỏ (level 0) và Sói (level 1) đều là quái săn ở giai đoạn đầu game. Hôi Lang cho **5.35 LT/con** (gấp ~2.2× so với Thỏ 2.43 LT/con), nhưng đánh lâu hơn và mất máu nhiều hơn.
  - Tỷ lệ thu nhập Linh thạch mỗi giờ giữa Sói và Thỏ dao động từ **1.12×** (Luyện Khí Tầng 1: Sói 1,377 vs Thỏ 1,234 LT/h) đến **1.58×** (Trúc Cơ Hậu kỳ: Sói 2,247 vs Thỏ 1,423 LT/h).
  - **Đánh giá:** Không có bãi nào lệch quá 2× (> ~2×) so với bãi cùng cấp. Mức chênh 1.12× – 1.58× là hợp lý: vừa đủ để khuyến khích người chơi tiến sang bãi Sói khi đủ mạnh, vừa không làm bãi Thỏ bị phế bỏ.
- **Đường mua đan bằng tiền vs Đổi nguyên liệu (`TRADES`):**
  - Đổi nguyên liệu tại Lão dược sư: 5 Lông thỏ (`long_tho`) lấy 1 Hồi Huyết Đan. Lông thỏ rơi 50% số lượng 1–2 (kỳ vọng 0.75 lông/con), cần hạ trung bình **~6.7 con thỏ** để đổi được 1 viên đan.
  - Mua đan bằng tiền: Giá mua là **24 Linh thạch**. Mỗi con thỏ cho trung bình **2.43 LT** (gồm 1.20 LT tiền rơi + 1.23 LT bán đồ). Cần hạ trung bình **~9.9 con thỏ** (hoặc ~12.3 con nếu không bán viên đan nhặt được) để đủ tiền mua 1 viên đan.
  - **Đánh giá:** Đường đổi nguyên liệu (6.7 con thỏ) **rẻ hơn đáng kể** (~1.5× – 1.8×) so với mua thẳng bằng tiền (10–12 con thỏ). Đây là thiết kế cố ý: đổi đồ là đường rẻ nhất cho người mới bắt đầu và người chịu khó gom nguyên liệu; cửa hàng tiền tệ đóng vai trò tiện lợi, xả tiền tích lũy khi không muốn gom nguyên liệu.
- **Quái cấp cao & Thiếu hụt chỗ tiêu tiền (Linh thạch sink):**
  - Hắc Hổ (cấp 2, an toàn từ Luyện Khí Tầng 6): thu nhập tăng mạnh từ ~2,570 LT/h lên ~4,650 LT/h ở Trúc Cơ.
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới 471.0 LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
  - **Lưu ý cân bằng:** Hiện tại cửa hàng Lão dược sư chỉ bán 2 loại đan hồi phục cơ bản (24 LT/viên), trang bị chỉ rèn qua nguyên liệu rơi mà không tốn tiền. Người chơi từ Luyện Khí hậu kỳ đến Trúc Cơ sẽ nhanh chóng tích lũy hàng ngàn đến hàng vạn Linh thạch mà **gần như không có chỗ tiêu** từ giữa game. Cần bổ sung các chỗ xả tiền lớn (mua bí kíp, phí nâng cấp/rèn trang bị cao cấp, phí dịch chuyển, vào bí cảnh hoặc đấu giá) trong các sprint tiếp theo của M3.


## Luân hồi & Điểm Duyên (M3.2, #151)

Mô phỏng cân bằng hệ thống Luân hồi theo thiết kế tại `docs/THIET_KE_LUAN_HOI.md` (mục 5 & 6) và hợp đồng `shared/src/reincarnation.ts`:
- Điểm Duyên tính theo: `calcDuyen = floor(stepPts + timePts + bossPts)`.
- Mở khóa vĩnh viễn tại Tam Sinh Thạch: Dư âm tu hành (`du_am`, 10 nấc: +10% đến +100% tốc độ tu luyện).

### 1. Duyên nhận được và tốc độ Duyên / giờ theo mốc kết thúc (Kiếp 1)

Ước tính theo mốc thời gian săn quái đơn lẻ hiệu quả nhất (thanh tu vi bậc đó còn 0%):

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |
|---|---:|---:|---:|---:|---:|
| Luyện Khí tầng 1 | 9 | 1 | 6.4 | 7 | **44.7** |
| Luyện Khí tầng 5 | 29 | 11 | 23.1 | 17 | **35.8** |
| Luyện Khí tầng 9 | 47 | 21 | 27.0 | 27 | **34.8** |
| Trúc Cơ sơ kỳ | 51 | 23 | 26.8 | 29 | **33.8** |
| Trúc Cơ trung kỳ | 83 | 39 | 28.2 | 45 | **32.5** |
| Trúc Cơ hậu kỳ | 118 | 55 | 27.9 | 61 | **30.9** |
| Hết Trúc Cơ (thanh đầy) | 170 | 69 | 24.3 | 78 | **27.5** |

Đọc bảng: Tính từ Luyện Khí tầng 5 trở đi (bỏ qua giai đoạn mới vào game), Duyên / giờ (0 trùm) nhỏ nhất là **23.1** (Luyện Khí tầng 5), lớn nhất là **28.2** (Trúc Cơ trung kỳ), tỷ lệ lớn / nhỏ là **1.22×**. Đỉnh Duyên / giờ rơi vào Trúc Cơ trung kỳ (~28.2 Duyên/h, gấp ~1.16× so với cày hết Trúc Cơ).

### 2. Tiến trình luân hồi qua chuỗi kiếp (1..N) khi mở dần "Dư âm tu hành"

Giả định người chơi kiếp nào cũng cày trọn vẹn đến hết Trúc Cơ (hạ 2 trùm) và dồn Duyên nâng cấp `du_am` (+10% đến +100%):

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 3 | +30% | 2 giờ 50 phút | +75 | 19 | **26.4** | 1.00× | Lên nấc 3 (+30%) |
| 2 | Nấc 5 | +50% | 2 giờ 13 phút | +74 | 0 | **33.4** | 1.26× | Lên nấc 5 (+50%) |
| 3 | Nấc 5 | +50% | 1 giờ 56 phút | +72 | 72 | **37.2** | 1.41× | Chờ đủ 80 Duyên |
| 4 | Nấc 6 | +60% | 1 giờ 56 phút | +72 | 64 | **37.2** | 1.41× | Lên nấc 6 (+60%) |
| 5 | Nấc 7 | +70% | 1 giờ 49 phút | +72 | 21 | **39.5** | 1.49× | Lên nấc 7 (+70%) |
| 6 | Nấc 7 | +70% | 1 giờ 44 phút | +71 | 92 | **41.2** | 1.56× | Chờ đủ 165 Duyên |
| 7 | Nấc 7 | +70% | 1 giờ 44 phút | +71 | 163 | **41.2** | 1.56× | Chờ đủ 165 Duyên |
| 8 | Nấc 8 | +80% | 1 giờ 44 phút | +71 | 69 | **41.2** | 1.56× | Lên nấc 8 (+80%) |
| 9 | Nấc 8 | +80% | 1 giờ 38 phút | +70 | 139 | **42.8** | 1.62× | Chờ đủ 235 Duyên |
| 10 | Nấc 8 | +80% | 1 giờ 38 phút | +70 | 209 | **42.8** | 1.62× | Chờ đủ 235 Duyên |
| 11 | Nấc 9 | +90% | 1 giờ 38 phút | +70 | 44 | **42.8** | 1.62× | Lên nấc 9 (+90%) |
| 12 | Nấc 9 | +90% | 1 giờ 33 phút | +70 | 114 | **44.9** | 1.70× | Chờ đủ 335 Duyên |
| 13 | Nấc 9 | +90% | 1 giờ 33 phút | +70 | 184 | **44.9** | 1.70× | Chờ đủ 335 Duyên |
| 14 | Nấc 9 | +90% | 1 giờ 33 phút | +70 | 254 | **44.9** | 1.70× | Chờ đủ 335 Duyên |
| 15 | Nấc 9 | +90% | 1 giờ 33 phút | +70 | 324 | **44.9** | 1.70× | Chờ đủ 335 Duyên |
| 16 | Nấc 10 | +100% | 1 giờ 33 phút | +70 | 59 | **44.9** | 1.70× | Lên nấc 10 (+100%) |
| 17 | Nấc 10 | +100% | 1 giờ 29 phút | +69 | 128 | **46.4** | 1.76× | Đã đạt tối đa (+100%) |

### 3. Nhận xét & Đánh giá cân bằng luân hồi

- **Tính chất ngang bằng giữa các cách chơi (chết ở bậc nào):**
  - Người chơi cày chay chết ở Luyện Khí tầng 5 (29 phút): **23.1 Duyên/h** (0 trùm) / **35.8 Duyên/h** (hạ trùm).
  - Người chơi cày tới Trúc Cơ sơ kỳ (51 phút): đạt đỉnh **26.8 Duyên/h** (0 trùm) / **33.8 Duyên/h** (hạ trùm).
  - Người chơi cày hết Trúc Cơ (170 phút): **24.3 Duyên/h** (0 trùm) / **27.5 Duyên/h** (hạ trùm).
  - **Đánh giá:** Mục tiêu thiết kế ("mọi cách chơi tương đương", mục 5 của docs/THIET_KE_LUAN_HOI.md) **đạt**: từ Luyện Khí tầng 5 trở đi mọi mốc nằm trong 23.1–28.2 Duyên/h (chênh 1.22×, ngưỡng 1.3×), không có bậc nào đáng để cố ý chết sớm; chết ở Luyện Khí tầng 1 (9 phút) chỉ nhận 1 Duyên.
- **Tiến trình tăng trưởng qua các kiếp (Progression pacing):**
  - Cần **16 kiếp** trọn vẹn để đạt tối đa nấc 10 Dư âm tu hành (+100% tốc độ tu luyện). Tổng thời gian chơi khoảng **~29 giờ**.
  - Tốc độ Duyên mỗi giờ tăng từ **26.4 Duyên/h** (kiếp 1) lên **46.4 Duyên/h** (khi max Dư âm tu hành), tương đương tỷ lệ **1.76×**.
  - **Đánh giá:** Tỷ lệ tăng trưởng **1.76×** nằm trong mục tiêu thiết kế (không vượt quá ~2.0× so với kiếp đầu), đem lại cảm giác nhân vật chuyển kiếp ngày càng mạnh mẽ và tu luyện thần tốc, nhưng kiểm soát tốt không gây lạm phát hay phá vỡ chiều sâu lối chơi.


## Bí cảnh Linh Hư (M3.4, 4c-2, #203)

Mô phỏng ở `server/src/balance/dungeon.ts`; test `dungeon.test.ts` giữ các mục tiêu bên dưới. **Số liệu đang dùng:** trùm `yeu_vuong`
100000 máu, đòn 16 mỗi 1.5 giây, 4500 tu vi; thưởng hoàn thành 700 Linh thạch + đồ;
ngưỡng bậc 9 (Luyện Khí tầng 9), trần bậc 12 (hết Trúc Cơ; Kim Đan trở lên quá dễ, xem mục Kim Đan trước M6); giới hạn 12 phút; đội 2-4 người.

**Mục tiêu (thiết kế):** đội 3 người ở đúng ngưỡng hạ trùm trong 5-8 phút và không ai chết; đội 2 người không kịp giờ; một người không
hạ nổi; một lượt thưởng bằng khoảng 15-20 phút săn quái tốt nhất cùng bậc. Trùm là một **bao máu**: đòn nhẹ nhưng trận dài, nên cần đan
và đồng đội (chết trong bí cảnh là mất kiếp, nên chọn số liệu để ca khó nhất cũng không ai chết).

### 1. Trận đánh trùm (mô phỏng bằng chính mã server)

`fightBoss` dựng một thế giới thật, đặt trùm ở tâm hang, người chơi đứng cạnh đánh thường liên tục (`slash`), uống Hồi Huyết Đan khi khí huyết
dưới 50% (`useItem`, hồi chiêu 8 giây), mỗi người mang 8 viên; AI quái, sát thương, bạo kích đều là mã thật (hạt giống cố
định). **Ca khó:** đứng yên, không né, trùm trúng 100% đòn. Người chơi thật né được nhưng mất thời gian đánh theo cùng tỉ lệ nên xác suất
sống không đổi; thời gian thật = thời gian mô phỏng / 0.6 (giả định `bossUptime`, chưa kiểm bằng người chơi thật). Cả lượt = đi 30
giây + dọn quái nhỏ (3 giây tìm mỗi con, đánh 80% thời gian) + trùm. Bậc cả đội: ngưỡng, trang bị tốt nhất đủ bậc. 20 trận mỗi dòng.

| Đội | Hạ được trùm | Trùm (giây mô phỏng) | Trùm (phút thật) | Cả lượt (phút) | Người chết / trận |
|---|---:|---:|---:|---:|---:|
| 1 người | 0% | – | – | – | 1.00 |
| 2 người | 100% | 407 | 11.3 | 13.4 ⚠️ quá giờ | 1.00 |
| 3 người | 100% | 216 | 6.0 | 8.0 | 0.00 |
| 4 người | 100% | 162 | 4.5 | 6.4 | 0.00 |

### 2. Một lượt thưởng đáng bao nhiêu phút săn

Linh thạch ròng = thưởng hoàn thành + giá bán đồ thưởng kỳ vọng + phần chia từ tiền / đồ trùm rơi và quái nhỏ − 8 đan (8 × giá mua). Tu vi = trùm + quái nhỏ theo
`partyExpShare`. So với săn quái tốt nhất cùng bậc (mục tiêu 17.5 phút).

| Đội | Linh thạch ròng / người | = phút săn | Tu vi / người | = phút săn |
|---|---:|---:|---:|---:|
| 2 người | 1248 | 19.6 | 2816 | 23.4 |
| 3 người | 1076 | 16.9 | 2122 | 17.7 |
| 4 người | 990 | 15.6 | 1776 | 14.8 |

Tối đa 3 lượt thưởng mỗi ngày (`DUNGEON_DAILY_REWARDS`) nên bí cảnh là một lựa chọn thêm chứ không thay được việc săn quái.


## PK thách đấu (M3.5, 5c, #217)

Mô phỏng ở `server/src/balance/pk.ts`; test `pk.test.ts` giữ mục tiêu. **Số liệu đang dùng:** `PK_DAMAGE_MULT` 0.125 (sát thương người lên người = `atk` × hệ số kỹ năng × hệ số này).

**Mục tiêu (thiết kế):** hai người **cùng bậc** đánh thường liên tục hết khí huyết nhau trong 25-45 giây (đủ để có cảm giác đấu, không kéo lê), không đan, không đả tọa (bị khoá trong trận).

### 1. Hai người cùng bậc

`duelOnce` dựng một `World` thật, hai người nhận / thách bằng chính `duelChallenge` / `duelAnswer`, rồi đứng cạnh nhau đánh thường (`slash`) mỗi lần hồi chiêu cho tới khi trận kết thúc; sát thương, bạo kích, đếm ngược và `tickDuels` là mã server thật, `Math.random` có hạt giống. Trang bị tốt nhất đủ bậc. **Ca liên tục:** không né, đánh 100% thời gian; người chơi thật không đánh liên tục nên trận thật dài hơn. 20 trận mỗi dòng; test kiểm mọi bậc (tầng đầu, giữa, cuối của từng cảnh giới); bảng chỉ hiện tầng đầu mỗi cảnh giới và bậc cuối cùng.

| Bậc | Giây đánh (trung vị) | Nhỏ nhất - lớn nhất |
|---|---:|---:|
| Phàm Nhân tầng 1 (bậc 0) | 35.6 | 34.4 - 37.6 |
| Luyện Khí tầng 1 (bậc 1) | 31.6 | 30.0 - 33.2 |
| Trúc Cơ tầng 1 (bậc 10) | 32.0 | 30.8 - 33.6 |
| Kim Đan tầng 1 (bậc 13) | 32.8 | 31.2 - 34.4 |
| Nguyên Anh tầng 1 (bậc 16) | 34.0 | 32.4 - 35.2 |
| Hóa Thần tầng 1 (bậc 19) | 34.4 | 33.2 - 35.6 |
| Luyện Hư tầng 1 (bậc 22) | 35.2 | 34.4 - 36.8 |
| Hợp Thể tầng 1 (bậc 25) | 36.0 | 34.8 - 37.6 |
| Đại Thừa tầng 1 (bậc 28) | 37.2 | 35.6 - 38.4 |
| Độ Kiếp tầng 1 (bậc 31) | 38.0 | 36.8 - 39.2 |
| Độ Kiếp tầng 3 (bậc 33) | 38.8 | 37.2 - 40.0 |

`atk` và `maxHp` tăng gần cùng tỉ lệ theo bậc nên **một hệ số chung** đủ cho mọi bậc (chậm dần nhẹ vì `maxHp` tăng nhỉnh hơn).

### 2. Chênh bậc (không hiệu chỉnh)

| Chênh | Bên mạnh hơn thắng | Giây đánh (trung vị) |
|---|---:|---:|
| cùng bậc (Luyện Khí tầng 5) | 60% (bên đánh trước) | 30.4 |
| 1 tầng | 100% | 27.2 |
| 2 tầng | 100% | 20.0 |
| 3 tầng | 100% | 17.6 |

Không có hiệu chỉnh chênh lệch: bên mạnh hơn hầu như luôn thắng và nhanh hơn (trận này không có né / đan / kỹ năng nên ít bất ngờ); người yếu hơn có quyền từ chối lời thách. Hai người cùng bậc: bên **đánh trước** trong cùng một tick thắng thường hơn (đòn hạ khí huyết về 0 kết thúc trận ngay), nên tỉ lệ thắng của người thứ nhất ở dòng "cùng bậc" trên 50% là hiệu ứng thứ tự xử lý, không phải lợi thế bậc. Nếu muốn trận công bằng giữa người chênh bậc thì cần chuẩn hoá chỉ số về bậc thấp hơn: việc riêng, chờ người dùng quyết (câu hỏi 4 ở `questions.md`).


## Kim Đan trước M6 (#402)

Số đo bằng đúng mô hình và mã server ở trên, với **nội dung hiện có** (Linh Thố, Hôi Lang, Hắc Hổ, Xích Mãng; chưa có quái / đồ / nhiệm vụ cho Kim Đan).
Ảnh chụp cố định ở `server/src/balance/kim-dan-truoc.json` (sinh bằng `npm run can-bang:kim-dan-truoc -w server`): không đổi khi M6 thêm nội dung,
để #406 so "trước / sau". Giả định thời gian tìm Xích Mãng 90 giây là của mô hình (bản đồ chỉ có 2 con); Hắc Phong Cốc có 6 con.

### 1. Cả cảnh giới: đúng mục tiêu nhưng hình dạng sai

Theo `simulate()` (có chuỗi nhiệm vụ, có đột phá thất bại), Kim Đan mất **6.4 giờ**. Con số này nằm trong mục tiêu đề xuất (5-7 giờ) **chỉ nhờ một đường tắt**:

| Bậc | Thanh | Săn tốt nhất (solo, an toàn) | Tu vi / giờ |
|---|---:|---|---:|
| Kim Đan Sơ kỳ | 26,400 | Hắc Hổ | 6,424 |
| Kim Đan Trung kỳ | 30,360 | Xích Mãng | 30,510 |
| Kim Đan Hậu kỳ | 34,914 | Xích Mãng | 31,364 |

Sơ kỳ phải cày Hắc Hổ rất lâu; từ Kim Đan Trung kỳ Xích Mãng (cấp 12, 4000 máu) thành an toàn khi solo (mô hình: mất ≤ 50% khí huyết mỗi trận) và cho **30,510 tu vi / giờ, gấp 6.1 lần Hắc Hổ** (5,014): mục tiêu "tu vi / giờ không quá ~1,5× bãi đúng bậc" bị vượt xa. `KILL_EXP_FREE_GAP` chưa trừ gì vì Xích Mãng chỉ thấp hơn người chơi 1-3 bậc. **Độ nhạy:** "an toàn" dựa trên giả định người chơi né được một phần đòn; nếu mọi đòn của Xích Mãng đều trúng thì Kim Đan Trung kỳ sát ngưỡng (không còn an toàn solo) và đường tắt chỉ bắt đầu từ Kim Đan Hậu kỳ.

### 2. Mỗi loài (solo)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ |
|---|---|---:|---:|---:|
| Kim Đan Sơ kỳ | Linh Thố | 590 | 1,430 | 588 |
| Kim Đan Sơ kỳ | Hôi Lang | 1,293 | 2,280 | 426 |
| Kim Đan Sơ kỳ | Hắc Hổ | 6,424 | 4,887 | 253 |
| Kim Đan Sơ kỳ | Xích Mãng | không an toàn solo | – | – |
| Kim Đan Trung kỳ | Linh Thố | 591 | 1,434 | 590 |
| Kim Đan Trung kỳ | Hôi Lang | 1,301 | 2,297 | 429 |
| Kim Đan Trung kỳ | Hắc Hổ | 5,014 | 5,007 | 259 |
| Kim Đan Trung kỳ | Xích Mãng | 30,510 | 15,510 | 34 |
| Kim Đan Hậu kỳ | Linh Thố | 592 | 1,437 | 591 |
| Kim Đan Hậu kỳ | Hôi Lang | 1,308 | 2,312 | 432 |
| Kim Đan Hậu kỳ | Hắc Hổ | 3,783 | 5,113 | 265 |
| Kim Đan Hậu kỳ | Xích Mãng | 31,364 | 15,958 | 35 |

### 3. Đường tắt Tụ Khí Đan

Tụ Khí Đan cộng **5% `expMax`** mỗi viên (hồi chiêu 60 giây = tối đa 60 viên / giờ). Ở Kim Đan, mỗi viên đáng 1,320-1,746 tu vi, trong khi Xích Mãng cho 900 tu vi và rơi 60% x 1-2 viên. Cột "nguồn cung / dùng" là số viên mỗi giờ (rơi / thực dùng sau giới hạn hồi chiêu); cột cuối là thời gian đầy MỘT thanh nếu chỉ săn loài đó.

| Bậc | Loài săn | Con / giờ | Đan: nguồn cung / dùng | Tu vi / viên | Tu vi / giờ (săn + đan) | Một thanh (không đan → có đan) |
|---|---|---:|---|---:|---:|---|
| Kim Đan Sơ kỳ | Hắc Hổ | 253 | 2.5 / 2.5 | 1,320 | 9,767 | 4.1 giờ → 2.7 giờ |
| Kim Đan Trung kỳ | Xích Mãng (tìm 90 s) | 34 | 30.3 / 30.3 | 1,518 | 76,525 | 60 phút → 24 phút |
| Kim Đan Trung kỳ | Xích Mãng (tìm 30 s) | 77 | 69.1 / 60.0 | 1,518 | 160,635 | 26 phút → 11 phút |
| Kim Đan Hậu kỳ | Xích Mãng (tìm 90 s) | 35 | 31.2 / 31.2 | 1,746 | 85,810 | 67 phút → 24 phút |
| Kim Đan Hậu kỳ | Xích Mãng (tìm 30 s) | 82 | 73.8 / 60.0 | 1,746 | 178,988 | 28 phút → 12 phút |

Mô hình chưa tính: thời gian tập hợp, chết, Xích Mãng bị người khác hạ trước (một bản đồ nhiều người tranh 2-6 con). Nhưng chiều hướng rõ: đan không phải phần thưởng hiếm ở Kim Đan mà là nguồn tu vi chính.

### 4. Bí cảnh Linh Hư (ngưỡng bậc 9; TRƯỚC M6 chưa có trần bậc, nay trần bậc 12) với đội Kim Đan

Mô phỏng bằng mã server thật (`fightBoss`, ca khó: đứng yên, không né), 20 trận mỗi dòng. Mục tiêu thiết kế ở bậc ngưỡng: một người không hạ nổi; đội 2 người không kịp giờ (12 phút); đội 3 người 5-8 phút.

| Bậc | Đội | Hạ được trùm | Phút thật | Người chết / trận |
|---|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | 1 | 100% | 7.9 | 0.0 |
| Kim Đan Sơ kỳ | 2 | 100% | 4.0 | 0.0 |
| Kim Đan Sơ kỳ | 3 | 100% | 2.6 | 0.0 |
| Kim Đan Sơ kỳ | 4 | 100% | 2.0 | 0.0 |
| Kim Đan Trung kỳ | 1 | 100% | 6.9 | 0.0 |
| Kim Đan Trung kỳ | 2 | 100% | 3.5 | 0.0 |
| Kim Đan Trung kỳ | 3 | 100% | 2.3 | 0.0 |
| Kim Đan Trung kỳ | 4 | 100% | 1.7 | 0.0 |
| Kim Đan Hậu kỳ | 1 | 100% | 6.0 | 0.0 |
| Kim Đan Hậu kỳ | 2 | 100% | 3.0 | 0.0 |
| Kim Đan Hậu kỳ | 3 | 100% | 2.0 | 0.0 |
| Kim Đan Hậu kỳ | 4 | 100% | 1.5 | 0.0 |

Đội nhỏ nhất mở được (2 người) hạ trùm 100% số trận trong 3.0-4.0 phút, 0.0 người chết: mục tiêu "đội 2 người không kịp giờ" bị phá ở mọi bậc Kim Đan (và một người Kim Đan cũng thắng, chỉ bị luật cỡ đội chặn). Phần Linh thạch của một lượt thưởng (700) chỉ bằng ~2.7 phút săn Xích Mãng ở Kim Đan Trung kỳ, nhưng lượt thưởng còn 2 Tụ Khí Đan chắc chắn (mục 3).

### 5. Kết luận và hướng xử lý (đề xuất, chốt ở #403 / #405 / #406)

1. **Nhịp tổng đúng nhưng hình dạng sai:** Sơ kỳ rất chậm, rồi Xích Mãng + Tụ Khí Đan làm hai bậc sau trôi qua trong vài chục phút. Nội dung Kim Đan mới (Sương Hồ / Thạch Quy / Độc Thiềm / Hắc Giao) phải tạo bãi đúng bậc cho CẢ ba bậc và làm Xích Mãng hết là đường tắt.
2. **Tụ Khí Đan tính theo % thanh là bẫy khi thanh nhảy ×6:** cách xử lý ứng viên (đo ở #406): (a) bảng rơi quái cũ (nhất là Xích Mãng 60%) giảm mạnh hoặc bỏ `tu_khi_dan`; (b) đan cộng một lượng cố định theo cảnh giới của đan (đan mới cho Kim Đan, đan cũ chỉ cộng % thanh của bậc Luyện Khí / Trúc Cơ); (c) hạ `pct` còn ~1%. Cần ghi rõ lý do trong PR hợp đồng #403.
3. **Bí cảnh Linh Hư cần trần bậc (`maxStep`, tuỳ chọn trong `DungeonDef`) hoặc chỉ số trùm theo bậc đội:** nếu không, người Kim Đan quay lại hạ trùm trong vài phút (3 lượt thưởng / ngày). Chốt ở #405 (PR `shared/` riêng, B review).
4. Số trên là mô hình (chưa kiểm bằng người chơi thật): bot của C (#410) kiểm lại hai đường tắt bằng đo thật.


## Kim Đan sau nội dung (M6, #403)

Tính SỐNG từ `shared/` bằng mô hình ở trên (khác mục "Kim Đan trước M6": đó là ảnh chụp cố định). Quái mới: Sương Hồ (cấp 13, nhanh, đàn), Thạch Quy (cấp 14, dày, đòn nhẹ), Độc Thiềm (cấp 15, đòn nặng, máu thấp), trùm Hắc Giao (cấp 18, đội 3-4 người).
Trang bị mỗi bộ ~29% chỉ số gốc ở bậc đầu mặc được. **Thanh Kim Đan 48000 / 55200 / 63480** (trước M6: 26400 / 30360 / 34914). **Tụ Khí Đan có trần 300 tu vi mỗi viên** và Xích Mãng rơi 0.3 x 1 (trước: 0.6 x 1-2): ba thay đổi này thay cho "đường tắt" ở "Kim Đan trước M6" (mục 3 và 5).

### 1. Săn solo (tu vi / giờ kể cả đan rơi, Linh thạch / giờ, con / giờ, khí huyết mất / trận)

Mục tiêu: không bãi nào cho tu vi / giờ vượt ~1,5x bãi mới tốt nhất cùng bậc, Linh thạch / giờ không vượt ~2x. Quái mới KHÔNG an toàn cho người Trúc Cơ hậu kỳ (mất > 50% khí huyết / trận) nên quái mới không làm đổi nhịp Luyện Khí / Trúc Cơ (hết Luyện Khí 51 phút, hết Trúc Cơ 2 giờ 50 phút cộng dồn).

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Xích Mãng | 33,407 | 15,735 | 33 | 45% |
| Kim Đan Sơ kỳ | Sương Hồ | 21,863 | 9,683 | 187 | 31% |
| Kim Đan Sơ kỳ | Thạch Quy | 23,449 | 9,477 | 106 | 32% |
| Kim Đan Sơ kỳ | Độc Thiềm | không an toàn solo (64% khí huyết / trận) | – | – | – |
| Kim Đan Trung kỳ | Xích Mãng | 34,502 | 16,279 | 35 | 32% |
| Kim Đan Trung kỳ | Sương Hồ | 24,203 | 10,826 | 209 | 22% |
| Kim Đan Trung kỳ | Thạch Quy | 26,393 | 10,726 | 119 | 23% |
| Kim Đan Trung kỳ | Độc Thiềm | 31,728 | 15,966 | 131 | 46% |
| Kim Đan Hậu kỳ | Xích Mãng | 35,378 | 16,715 | 35 | 24% |
| Kim Đan Hậu kỳ | Sương Hồ | 26,313 | 11,865 | 229 | 16% |
| Kim Đan Hậu kỳ | Thạch Quy | 29,274 | 11,949 | 133 | 17% |
| Kim Đan Hậu kỳ | Độc Thiềm | 35,222 | 17,868 | 147 | 34% |

### 2. Trùm Hắc Giao theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 | Đội 3 so với săn solo tốt nhất |
|---|---:|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | không an toàn (600%) | không an toàn (150%) | không an toàn (67%) | 32,757 (38%) | – |
| Kim Đan Trung kỳ | không an toàn (433%) | không an toàn (108%) | 37,430 (48%) | 34,459 (27%) | 1.2x |
| Kim Đan Hậu kỳ | không an toàn (315%) | không an toàn (79%) | 39,545 (35%) | 35,937 (20%) | 1.1x |

### 3. Nhịp cả cảnh giới Kim Đan (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

"Tối ưu" = người chơi săn bãi tốt nhất kể cả Xích Mãng; "bãi mới" = không đụng Xích Mãng. Tổng: **5.2 giờ** (tối ưu), **5.7 giờ** (bãi mới); mục tiêu 5-7 giờ. Trước M6: 6.4 giờ nhưng nhờ đường tắt (Sơ kỳ 4,1 giờ rồi hai bậc sau ~2,3 giờ).

| Bậc | Thanh | Tối ưu: nguồn | phút | Bãi mới: nguồn | phút |
|---|---:|---|---:|---|---:|
| Kim Đan Sơ kỳ | 48,000 | Xích Mãng | 89.3 | Thạch Quy | 115.7 |
| Kim Đan Trung kỳ | 55,200 | Độc Thiềm | 99.2 | Độc Thiềm | 99.2 |
| Kim Đan Hậu kỳ | 63,480 | Độc Thiềm | 124.2 | Độc Thiềm | 124.2 |

### 4. Luân hồi khi cày tới hết Kim Đan (#406)

Cùng mô hình với mục "Luân hồi & Điểm Duyên" (Duyên theo `calcDuyen`, thời gian là nhịp ở mục 3, bãi tốt nhất, hạ 2 trùm; mốc "hết" hạ 3 trùm). `duyenPerStep(3)` được hạ từ **60 xuống 40** (PR shared riêng): ở 60, Duyên / giờ (0 trùm) ở Kim Đan hậu kỳ lên 31.4 (gấp ~1.4x Luyện Khí tầng 5, vượt ngưỡng 1.3x); thanh Kim Đan dài ~5 giờ chứ không 5 lần Trúc Cơ (~2 giờ) nên 12 x 5 trả quá tay.

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |
|---|---:|---:|---:|---:|---:|
| Luyện Khí tầng 5 | 29 | 11 | 23.1 | 17 | **35.8** |
| Luyện Khí tầng 9 | 47 | 21 | 27.0 | 27 | **34.8** |
| Trúc Cơ sơ kỳ | 51 | 23 | 26.8 | 29 | **33.8** |
| Trúc Cơ trung kỳ | 83 | 39 | 28.2 | 45 | **32.5** |
| Trúc Cơ hậu kỳ | 118 | 55 | 27.9 | 61 | **30.9** |
| Hết Trúc Cơ (thanh đầy) | 170 | 69 | 24.3 | 78 | **27.5** |
| Kim Đan sơ kỳ | 170 | 69 | 24.3 | 75 | **26.4** |
| Kim Đan trung kỳ | 260 | 109 | 25.2 | 115 | **26.6** |
| Kim Đan hậu kỳ | 359 | 149 | 24.9 | 155 | **25.9** |
| Hết Kim Đan (thanh đầy) | 483 | 189 | 23.5 | 198 | **24.6** |

Từ Luyện Khí tầng 5 tới hết Kim Đan, Duyên / giờ (0 trùm) nhỏ nhất **23.1** (Luyện Khí tầng 5), lớn nhất **28.2** (Trúc Cơ trung kỳ): tỉ lệ **1.22x** (ngưỡng 1.3x, đạt). Mọi mốc Kim Đan nằm trong dải của Luyện Khí / Trúc Cơ nên không có điểm dừng nào đáng cố ý chết.

Tiến trình qua kiếp khi KIẾP NÀO CŨNG cày trọn tới hết Kim Đan (hạ 2 trùm) và dồn Duyên vào Dư âm tu hành:

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi (phút) | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 5 | +50% | 483 | +195 | 46 | **24.2** | 1.00x | Lên nấc 5 (+50%) |
| 2 | Nấc 7 | +70% | 325 | +195 | 46 | **36.0** | 1.49x | Lên nấc 7 (+70%) |
| 3 | Nấc 8 | +80% | 287 | +195 | 76 | **40.7** | 1.68x | Lên nấc 8 (+80%) |
| 4 | Nấc 9 | +90% | 272 | +195 | 36 | **43.0** | 1.78x | Lên nấc 9 (+90%) |
| 5 | Nấc 9 | +90% | 258 | +195 | 231 | **45.4** | 1.87x | Chờ đủ 335 Duyên |
| 6 | Nấc 10 | +100% | 258 | +195 | 91 | **45.4** | 1.87x | Lên nấc 10 (+100%) |
| 7 | Nấc 10 | +100% | 245 | +195 | 286 | **47.7** | 1.97x | Đã đạt tối đa (+100%) |

Duyên / giờ tăng từ **24.2** (kiếp 1) lên **47.7** khi đạt tối đa: **1.97x** (ngưỡng ~2.0x, đạt). Một kiếp tới hết Kim Đan nhận 195 Duyên (so với 75 khi chỉ tới hết Trúc Cơ) vì dài 2.8 lần: cùng Duyên / giờ. Mô hình BỎ QUA nhiệm vụ lặp và phí rèn (không đổi Duyên). Giữ nguyên luật luân hồi đã chốt.

### 5. Đi theo đội ở Kim Đan (#406; KHÔNG đổi quy tắc chia tu vi)

Cùng mô hình với mục "Đi theo đội" (tu vi / giờ MỖI thành viên so với săn solo tốt nhất; trong ngoặc là quái tốt nhất mà đội đủ an toàn đánh, kể cả trùm Hắc Giao).

| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |
|---|---|---:|---:|---:|
| Kim Đan Sơ kỳ | Xích Mãng | 0.80x (Độc Thiềm) | 0.69x (Độc Thiềm) | 1.08x (Hắc Giao) |
| Kim Đan Trung kỳ | Độc Thiềm | 0.82x (Độc Thiềm) | 1.18x (Hắc Giao) | 1.09x (Hắc Giao) |
| Kim Đan Hậu kỳ | Độc Thiềm | 0.77x (Độc Thiềm) | 1.12x (Hắc Giao) | 1.02x (Hắc Giao) |

Cao nhất **1.18x**, thấp nhất **0.69x**: ở Kim Đan đội 3-4 hạ Hắc Giao được ~1.0-1.2x săn solo (dưới ngưỡng 1.5x của #74, khác Trúc Cơ tới 2.5x), còn đội 2 chậm hơn solo (~0.8x: chưa đủ người hạ trùm, chia tu vi, thời gian tìm quái không rút ngắn). Mô hình này KHÔNG tính đan: mục 9 (mã server thật, có Đại Hồi Huyết Đan) cho thấy đội 2 và cả một người ở Hậu kỳ cũng hạ được trùm. Đây là số đo, câu hỏi chia tu vi của người dùng vẫn chờ; test khoá cận dưới ~0.65x (đội nhỏ chậm hơn solo ở Sơ kỳ là hiện trạng, giống Luyện Khí bậc 6-9, không được xấu thêm).

### 6. Kinh tế Kim Đan: chỗ tiêu Linh thạch so với thu nhập (#406)

Thu nhập theo nhịp "bãi mới" ở mục 3 (săn solo, mỗi bậc một loài tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu của ba bộ (người chơi giữ lại để rèn). Chi: phí rèn `RecipeDef.coin` (mỗi bộ rèn được từ bậc ghi ở cột đầu, tiền trả khi rèn). Cột "Cộng dồn / Phí cộng dồn" so sánh tiền có được tới hết bậc với phí cộng dồn của các bộ mặc được tới bậc kế; tiền có được gồm cả **10,782** Linh thạch kiếm ở Luyện Khí / Trúc Cơ CÙNG kiếp (ví chỉ đặt lại lúc đầu thai và ở đó gần như không có chỗ tiêu); bộ III chỉ mặc được ở Hậu kỳ nên phí của nó tính vào cuối Hậu kỳ. Săn trùm theo đội lấy Giao Lân kiếm ít tiền hơn solo (tiền rơi của trùm chia 4 người: ~3,044 Linh thạch / giờ mỗi người): phần hụt đã trừ vào thu nhập Hậu kỳ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Thạch Quy | 116 | 7,102 | 13,701 | 24,483 | 9,500 | +14,983 |
| Kim Đan Trung kỳ | Độc Thiềm | 99 | 11,981 | 19,800 | 44,283 | 31,500 | +12,783 |
| Kim Đan Hậu kỳ | Độc Thiềm | 124 | 13,409 | 19,230 | 63,513 | 78,500 | -14,987 |

Chi cho từng bộ (nguyên liệu tính MỖI NGƯỜI; trùm đi theo đội 4 người, mỗi mảnh rơi chung nên cả đội cần 4 lần số lượng):

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
| Bộ I (từ Sơ kỳ) | 3 | 9,500 | 42 Sương mao, 20 Quy giáp | 33.1 | 0.0 | 29% |
| Bộ II (từ Trung kỳ) | 3 | 22,000 | 48 Quy giáp, 20 Độc nang | 45.7 | 0.0 | 46% |
| Bộ III (từ Hậu kỳ) | 3 | 47,000 | 19 Giao lân, 30 Độc nang | 18.2 | 49.3 | 54% |

Tổng phí rèn ba bộ **78,500** Linh thạch so với **63,513** có được từ đầu kiếp tới hết Kim Đan: thiếu 14,987 (~1.1 giờ săn Hậu kỳ sau khi hết Kim Đan). Bộ I mua đủ trong Sơ kỳ (dư 14,983 cuối bậc) và bộ II trong Trung kỳ (dư 12,783); bộ III (47,000, 60% tổng phí) là mục tiêu cuối game: người chơi KHÔNG dư hàng vạn Linh thạch không có chỗ tiêu như cảnh báo cũ của mục "Kinh tế Linh thạch", và cũng không bị chặn (thiếu chừng 1.1 giờ). Cột cuối: cày nguyên liệu chiếm tối đa 54% thời gian bậc và các giờ đó vẫn kiếm tu vi, nên nguyên liệu không phải nút cổ chai, tiền mới là.
Đan cấp 2 (`dai_hoi_huyet_dan` / `dai_hoi_linh_dan`, 120 Linh thạch / viên ở Lái buôn Vọng Sương) là chỗ xả TUỲ CHỌN thêm vào: mô hình không tính vì không giả định người chơi uống đan (đả tọa hồi khí huyết). Mô hình cũng bỏ qua nhiệm vụ lặp và phí rèn ở nhịp tu luyện (mục 3), phần Linh thạch / đồ thưởng của nhiệm vụ.

**Qua kiếp.** Bảng trên là kiếp 1 (không Dư âm tu hành). Khi kiếp nào cũng cày tới hết Kim Đan và nâng Dư âm tu hành (mục 4), bậc ngắn lại theo hệ số tốc độ nhưng Linh thạch theo số quái hạ nên KHÔNG tăng, còn `applyRebirth` đưa ví về tối đa `coinCarryCap` (400 khi đủ Kim nang) và túi rỗng:

| Kiếp | Dư âm tu hành | Phút cả kiếp | Linh thạch có được | Rèn đủ phí | Cày nguyên liệu bộ III so với Hậu kỳ |
|---|---:|---:|---:|---|---:|
| 1 | Nấc 5 | 483 | 63,513 | bộ I + II | 54% |
| 2 | Nấc 7 | 325 | 39,503 | bộ I + II | 82% |
| 3 | Nấc 8 | 287 | 33,853 | bộ I + II | 92% |
| 4 | Nấc 9 | 272 | 31,499 | bộ I | 98% |
| 5 | Nấc 9 | 258 | 29,393 | bộ I | 103% |
| 6 | Nấc 10 | 258 | 29,393 | bộ I | 103% |
| 7 | Nấc 10 | 245 | 27,498 | bộ I | 109% |

Không kiếp nào trả đủ cả ba bộ (kiếp 1 chỉ tới bộ I + II); từ kiếp 4 trở đi chỉ trả đủ bộ I (kiếp 7: 27,498 Linh thạch, cày nguyên liệu bộ III chiếm 109% Hậu kỳ nên không kịp trong bậc). Đây là CHỦ Ý hay không là câu hỏi cho người dùng (ghi ở `questions.md`): đường giữ đồ là **Ký vật** (3 nấc, tổng 225 Duyên ~ 1.2 kiếp Kim Đan; nấc 3 giữ lại cả ba món đang mặc), nên bộ rèn ở kiếp trước đi theo sang kiếp sau và Linh thạch chỉ cần cho phần còn thiếu; Linh thạch KHÔNG tích lũy qua kiếp (ví về tối đa 400) nên "dư hàng vạn" ở kiếp sau không thành vấn đề tích tụ. Mô hình chưa tính người chơi kiếp sau rèn lại từ đầu (không Ký vật).

### 7. Trang bị: ba bộ tăng sức mạnh đều, không bộ nào bắt buộc hay vô dụng (#406)

Sức mạnh gốc mỗi bộ (kiếm +công, bào +khí huyết, phù +linh lực / tốc): bộ I: công 32, khí huyết 360; bộ II: công 38, khí huyết 425; bộ III: công 44, khí huyết 500. Bảng dưới: tu vi / giờ solo tốt nhất và khí huyết mất mỗi trận khi solo Độc Thiềm (loài đòn nặng nhất) nếu người chơi chỉ có trang bị tới từng bộ.

| Bậc | Trang bị | Tu vi / giờ (loài tốt nhất) | Khí huyết mất / trận (Độc Thiềm) |
|---|---|---:|---:|
| Sơ kỳ | không bộ Kim Đan nào | 21,689 (Thạch Quy) | 79% |
| Sơ kỳ | tới bộ I | 30,400 (Xích Mãng) | 64% |
| Trung kỳ | không bộ Kim Đan nào | 30,672 (Xích Mãng) | 60% |
| Trung kỳ | tới bộ I | 31,197 (Xích Mãng) | 50% |
| Trung kỳ | tới bộ II | 31,728 (Độc Thiềm) | 46% |
| Hậu kỳ | không bộ Kim Đan nào | 32,275 (Độc Thiềm) | 45% |
| Hậu kỳ | tới bộ I | 33,922 (Độc Thiềm) | 38% |
| Hậu kỳ | tới bộ II | 34,570 (Độc Thiềm) | 36% |
| Hậu kỳ | tới bộ III | 35,222 (Độc Thiềm) | 34% |

Đọc bảng: tỉ lệ tu vi / giờ giữa không có bộ nào và đủ bộ mặc được là 71% ở Sơ kỳ (92% nếu chỉ săn bãi mới), 97% ở Trung kỳ (76% nếu chỉ săn bãi mới), 92% ở Hậu kỳ (92% nếu chỉ săn bãi mới): không bộ nào BẮT BUỘC cho nhịp (luôn còn loài an toàn, thấp nhất 71%: một số loài chỉ an toàn khi đã có bộ đầu, Xích Mãng ở Sơ kỳ và Độc Thiềm ở Trung kỳ), nhưng mỗi bộ đều làm nhanh hơn và bớt nguy hiểm (khí huyết mất / trận giảm ở mọi hàng): không bộ nào VÔ DỤNG. Ở Hậu kỳ đủ ba bộ nhanh hơn không có bộ nào **9.1%** và bớt ~11 điểm phần trăm khí huyết mất. Bộ III đắt nhất (60% tổng phí) nhưng chỉ thêm ~1.9% tu vi / giờ so với bộ II: giá trị của nó nằm ở sức mạnh (công 44 so với 38, PK và trùm), cố ý là chỗ xả Linh thạch cuối game. Công / khí huyết gốc tăng đều giữa các bộ (+19% / +16% công, +18% / +18% khí huyết).

### 8. PK và bí cảnh ở Kim Đan (#406)

**PK.** Cùng mô hình với mục "PK thách đấu" (`duelOnce`: mã server thật, đánh thường liên tục, 20 trận mỗi dòng). Hai người CÙNG bậc Kim Đan mặc CÙNG bộ trang bị: trận đều nằm trong mục tiêu 25-45 giây ở mọi bậc và mọi bộ.

| Bậc | Trang bị (cả hai) | Giây đánh (trung vị) | Nhỏ nhất - lớn nhất |
|---|---|---:|---:|
| Kim Đan Sơ kỳ | không bộ Kim Đan nào | 32.4 | 31.2 - 34.0 |
| Kim Đan Sơ kỳ | bộ I | 32.8 | 31.2 - 34.4 |
| Kim Đan Trung kỳ | không bộ Kim Đan nào | 32.8 | 31.6 - 34.4 |
| Kim Đan Trung kỳ | bộ I | 32.8 | 31.6 - 34.4 |
| Kim Đan Trung kỳ | bộ II | 32.8 | 31.6 - 34.4 |
| Kim Đan Hậu kỳ | không bộ Kim Đan nào | 33.2 | 32.0 - 34.8 |
| Kim Đan Hậu kỳ | bộ I | 33.2 | 32.0 - 34.8 |
| Kim Đan Hậu kỳ | bộ II | 33.2 | 32.0 - 34.8 |
| Kim Đan Hậu kỳ | bộ III | 33.2 | 32.0 - 34.8 |

Cùng bậc nhưng KHÁC bộ: bên mặc bộ cao hơn thắng 100% số trận (như chênh một tầng ở mục "Chênh bậc"), trận ngắn hơn một chút. Linh thạch (phí rèn bộ III ~47.000, mục 6) mua được lợi thế PK quyết định so với người cùng bậc chưa rèn; PK là thách đấu hai bên đồng ý (người yếu hơn từ chối được), và câu hỏi chuẩn hoá chỉ số về bậc / bộ thấp hơn vẫn chờ người dùng (câu hỏi 4 ở `questions.md`).

| Bậc | Trận | Bên mạnh thắng | Giây đánh (trung vị) |
|---|---|---:|---:|
| Kim Đan Sơ kỳ | bộ I thách không bộ Kim Đan nào | 100% | 29.6 |
| Kim Đan Trung kỳ | bộ II thách bộ I | 100% | 32.0 |
| Kim Đan Trung kỳ | bộ II thách không bộ Kim Đan nào | 100% | 29.2 |
| Kim Đan Hậu kỳ | bộ III thách bộ II | 100% | 32.4 |
| Kim Đan Hậu kỳ | bộ III thách không bộ Kim Đan nào | 100% | 28.8 |

**Bí cảnh Linh Hư.** Không bị nội dung M6 làm đổi: bí cảnh có trần bậc 12 (hết Trúc Cơ, PR #428) và người Kim Đan bắt đầu từ bậc 13 nên KHÔNG vào được (`member_high`); bảng "Bí cảnh Linh Hư" ở trên (bậc 9-12) vẫn đúng nguyên. Phân tích đội Kim Đan phá bí cảnh (trước khi có trần) ở mục "Kim Đan trước M6", phần 4.

### 9. Đối chiếu mô hình với mã server thật (#406 mục 7)

Độc lập với số đo bằng bot của C (#410): dựng `World` thật (`hunt-check.ts`), người chơi mặc trang bị tốt nhất đứng cạnh quái, đánh thường mỗi lần hồi chiêu, quái dùng AI thật; **không né, không di chuyển** (ca khó, như mục "PK" và "Bí cảnh"). Thời gian tìm quái đo riêng ở mục 10 (`search-check.ts`); không kiểm người chơi thật (cần bot).

**Săn quái thường (solo, 12 trận mỗi dòng).** Thời gian trận theo mô hình = máu / (công x hệ số chém x bạo kích trung bình / hồi chiêu); khí huyết mất theo mô hình đã nhân tỉ lệ trúng 0.8 (giả định người chơi né ~20%), nên cột cuối so mã thật (không né) với mô hình chia 0.8.

| Bậc | Quái | Giây (mô hình) | Giây (thật) | Tỉ lệ | Khí huyết mất (mô hình) | Khí huyết mất (thật, không né) | Thật / mô hình không né |
|---|---|---:|---:|---:|---:|---:|---:|
| Luyện Khí Tầng 5 | Hôi Lang | 1.8 | 1.7 | 0.92x | 18 | 28 (9%) | 1.23x |
| Trúc Cơ Hậu kỳ | Hắc Hổ | 2.1 | 2.1 | 0.96x | 55 | 83 (7%) | 1.20x |
| Kim Đan Sơ kỳ | Xích Mãng | 10.3 | 10.1 | 0.98x | 720 | 999 (62%) | 1.11x |
| Kim Đan Sơ kỳ | Sương Hồ | 4.1 | 4.0 | 0.98x | 494 | 600 (37%) | 0.97x |
| Kim Đan Sơ kỳ | Thạch Quy | 16.7 | 16.5 | 0.98x | 520 | 707 (44%) | 1.09x |
| Kim Đan Sơ kỳ | Độc Thiềm | 6.7 | 6.8 | 1.02x | 1,034 | 1,589 (99%) | 1.23x |
| Kim Đan Trung kỳ | Xích Mãng | 8.8 | 8.8 | 1.01x | 614 | 855 (45%) | 1.11x |
| Kim Đan Trung kỳ | Sương Hồ | 3.5 | 3.2 | 0.93x | 421 | 600 (32%) | 1.14x |
| Kim Đan Trung kỳ | Thạch Quy | 14.2 | 14.1 | 0.99x | 443 | 587 (31%) | 1.06x |
| Kim Đan Trung kỳ | Độc Thiềm | 5.7 | 5.6 | 0.99x | 881 | 1,276 (67%) | 1.16x |
| Kim Đan Hậu kỳ | Xích Mãng | 7.5 | 7.6 | 1.02x | 526 | 722 (32%) | 1.10x |
| Kim Đan Hậu kỳ | Sương Hồ | 3.0 | 2.8 | 0.95x | 361 | 450 (20%) | 1.00x |
| Kim Đan Hậu kỳ | Thạch Quy | 12.2 | 12.1 | 0.99x | 380 | 493 (22%) | 1.04x |
| Kim Đan Hậu kỳ | Độc Thiềm | 4.9 | 4.8 | 0.99x | 756 | 1,252 (56%) | 1.32x |
| Nguyên Anh Sơ kỳ | Hàn Lang | 4.2 | 4.0 | 0.95x | 897 | 1,247 (43%) | 1.11x |
| Nguyên Anh Sơ kỳ | Phong Nha | 4.1 | 4.0 | 0.99x | 1,013 | 1,236 (42%) | 0.98x |
| Nguyên Anh Sơ kỳ | Cốt Tượng | 17.3 | 17.3 | 1.00x | 1,059 | 1,585 (54%) | 1.20x |
| Nguyên Anh Sơ kỳ | Độc Tước | 6.9 | 6.8 | 1.00x | 1,879 | 2,805 (96%) | 1.19x |
| Nguyên Anh Trung kỳ | Hàn Lang | 3.7 | 3.6 | 0.98x | 790 | 1,077 (32%) | 1.09x |
| Nguyên Anh Trung kỳ | Phong Nha | 3.6 | 3.6 | 1.01x | 893 | 1,236 (37%) | 1.11x |
| Nguyên Anh Trung kỳ | Cốt Tượng | 15.2 | 15.3 | 1.00x | 909 | 1,235 (37%) | 1.09x |
| Nguyên Anh Trung kỳ | Độc Tước | 6.1 | 6.0 | 1.00x | 1,656 | 2,252 (68%) | 1.09x |
| Nguyên Anh Hậu kỳ | Hàn Lang | 3.3 | 3.2 | 0.99x | 696 | 1,022 (27%) | 1.17x |
| Nguyên Anh Hậu kỳ | Phong Nha | 3.2 | 3.2 | 1.02x | 786 | 1,236 (33%) | 1.26x |
| Nguyên Anh Hậu kỳ | Cốt Tượng | 13.4 | 13.7 | 1.02x | 809 | 1,198 (32%) | 1.18x |
| Nguyên Anh Hậu kỳ | Độc Tước | 5.3 | 5.2 | 0.98x | 1,458 | 2,252 (59%) | 1.24x |

Thời gian hạ quái khớp mô hình trong **0.92x - 1.02x** (mục tiêu lệch <= ~25%): tốc độ tu vi / giờ và Linh thạch / giờ của mục 1 (phụ thuộc thời gian trận) đáng tin ở phần này. Khí huyết mất của mã thật bằng **0.97x - 1.32x** mô hình không né (mô hình giả định né 20%, nên mã thật không né mất nhiều hơn mô hình 21-66%; phần dư ngoài hệ số né là làm tròn: quái đánh phát đầu ngay khi vào tầm nên số đòn là làm tròn LÊN, rõ nhất ở trận ngắn). Hệ quả: tiêu chí "an toàn" (mất <= 50% khí huyết mỗi trận) dựa trên giả định né; người KHÔNG né mất nhiều hơn số ở mục 1, vd Kim Đan Hậu kỳ Độc Thiềm: **56%** thay vì 34%; vẫn sống (đả tọa / đan hồi giữa các trận) nhưng sát ngưỡng khi gặp hai con cùng lúc.

**Trùm Hắc Giao theo đội, mã thật.** Mô hình mục 2 chia sát thương đều cho cả đội (`/ n`); mã thật thì trùm CHỈ đánh một mục tiêu (người nó đã nhắm), nên người bị nhắm chịu gần hết sát thương (cột "Không đan": có người chết ở đội 3 - 4); Đại Hồi Huyết Đan (hồi 70%, hồi chiêu 10 giây, 120 Linh thạch) cứu được. Chính sách như `dungeon.ts` (`ASSUME_DUNGEON`): đứng đánh liên tục, uống đan khi khí huyết dưới 50%. Hai cột đan: mang 8 viên (chính sách của bí cảnh) và đủ đan (30 viên, không còn là giới hạn). 6 trận mỗi ô.

| Bậc | Đội | Không đan | 8 viên / người | Đủ đan (30 viên / người) |
|---|---:|---|---|---|
| Sơ kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 128 giây, 0.0 chết / trận, 12.7 đan |
| Sơ kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 64 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 64 giây, 0.0 chết / trận, 6.0 đan |
| Sơ kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 42 giây, 0.0 chết / trận, 4.0 đan | 100% hạ, 42 giây, 0.0 chết / trận, 4.0 đan |
| Sơ kỳ | 4 | 100% hạ, 40 giây, 2.0 chết / trận | 100% hạ, 32 giây, 0.0 chết / trận, 3.0 đan | 100% hạ, 32 giây, 0.0 chết / trận, 3.0 đan |
| Trung kỳ | 1 | không hạ được (1.0 chết / trận) | 17% hạ, 109 giây, 0.8 chết / trận, 8.0 đan | 100% hạ, 109 giây, 0.0 chết / trận, 9.3 đan |
| Trung kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 55 giây, 0.0 chết / trận, 4.8 đan | 100% hạ, 55 giây, 0.0 chết / trận, 4.8 đan |
| Trung kỳ | 3 | 100% hạ, 49 giây, 2.0 chết / trận | 100% hạ, 36 giây, 0.0 chết / trận, 3.0 đan | 100% hạ, 36 giây, 0.0 chết / trận, 3.0 đan |
| Trung kỳ | 4 | 100% hạ, 30 giây, 1.0 chết / trận | 100% hạ, 27 giây, 0.0 chết / trận, 2.0 đan | 100% hạ, 27 giây, 0.0 chết / trận, 2.0 đan |
| Hậu kỳ | 1 | không hạ được (1.0 chết / trận) | 100% hạ, 94 giây, 0.0 chết / trận, 7.0 đan | 100% hạ, 94 giây, 0.0 chết / trận, 7.0 đan |
| Hậu kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 47 giây, 0.0 chết / trận, 3.0 đan | 100% hạ, 47 giây, 0.0 chết / trận, 3.0 đan |
| Hậu kỳ | 3 | 100% hạ, 35 giây, 1.0 chết / trận | 100% hạ, 31 giây, 0.0 chết / trận, 2.0 đan | 100% hạ, 31 giây, 0.0 chết / trận, 2.0 đan |
| Hậu kỳ | 4 | 100% hạ, 24 giây, 0.8 chết / trận | 100% hạ, 23 giây, 0.0 chết / trận, 1.0 đan | 100% hạ, 23 giây, 0.0 chết / trận, 1.0 đan |

**Trùm Thiên Hàn Vương theo đội, mã thật (Nguyên Anh, M7.9).** Cùng cách đo như Hắc Giao: đội cùng bậc đứng cạnh trùm đánh thường liên tục (KHÔNG né: trùm lao và đập đất vòng 140 px đều trúng), uống Thượng Hồi Huyết Đan (hồi 90 %) khi khí huyết dưới 50%, ca khó. Kết quả cùng dạng với Hắc Giao: KHÔNG đan thì Sơ kỳ không đội nào hạ được, Trung / Hậu kỳ chỉ đội 4 (và đội 3 Hậu kỳ một nửa số trận) hạ được mà còn người chết, tức cần đan; với 8 viên đội 2 trở lên hạ được, không ai chết ở cả ba bậc; một người cần đủ đan ở Sơ kỳ (Trung / Hậu kỳ hạ được cả với 8 viên, giống Hắc Giao). Số cuối do M7.9 hiệu chỉnh khi có bot thật (C).

| Bậc | Đội | Không đan | 8 viên / người | Đủ đan (30 viên / người) |
|---|---:|---|---|---|
| Sơ kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 120 giây, 0.0 chết / trận, 9.8 đan |
| Sơ kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 60 giây, 0.0 chết / trận, 7.0 đan | 100% hạ, 60 giây, 0.0 chết / trận, 7.0 đan |
| Sơ kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 40 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 40 giây, 0.0 chết / trận, 5.0 đan |
| Sơ kỳ | 4 | 83% hạ, 36 giây, 2.8 chết / trận | 100% hạ, 30 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 30 giây, 0.0 chết / trận, 5.0 đan |
| Trung kỳ | 1 | không hạ được (1.0 chết / trận) | 100% hạ, 106 giây, 0.0 chết / trận, 8.0 đan | 100% hạ, 106 giây, 0.0 chết / trận, 8.5 đan |
| Trung kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 53 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 53 giây, 0.0 chết / trận, 5.0 đan |
| Trung kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 35 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 35 giây, 0.0 chết / trận, 5.0 đan |
| Trung kỳ | 4 | 100% hạ, 28 giây, 1.0 chết / trận | 100% hạ, 26 giây, 0.0 chết / trận, 4.0 đan | 100% hạ, 26 giây, 0.0 chết / trận, 4.0 đan |
| Hậu kỳ | 1 | không hạ được (1.0 chết / trận) | 100% hạ, 93 giây, 0.0 chết / trận, 7.0 đan | 100% hạ, 93 giây, 0.0 chết / trận, 7.0 đan |
| Hậu kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 46 giây, 0.0 chết / trận, 4.0 đan | 100% hạ, 46 giây, 0.0 chết / trận, 4.0 đan |
| Hậu kỳ | 3 | 100% hạ, 35 giây, 1.0 chết / trận | 100% hạ, 31 giây, 0.0 chết / trận, 2.0 đan | 100% hạ, 31 giây, 0.0 chết / trận, 2.0 đan |
| Hậu kỳ | 4 | 100% hạ, 23 giây, 0.8 chết / trận | 100% hạ, 23 giây, 0.0 chết / trận, 1.2 đan | 100% hạ, 23 giây, 0.0 chết / trận, 1.2 đan |

**Vì sao một người hạ được.** Sát thương trùm lên MỘT người (trúng 100%, không né) là **5.8% / 4.9% / 4.2%** khí huyết mỗi giây ở Sơ / Trung / Hậu kỳ, còn đan hồi **7.0%** mỗi giây: ở CẢ BA bậc sát thương < tốc độ hồi nên một người bền vững nếu đủ đan. Trần 8 viên chỉ là giới hạn mang, không phải của luật: ở cột "8 viên" solo Sơ kỳ không hạ được và Trung kỳ hạ được ít, nhưng đủ đan thì hạ được 100%, 0 chết ở mọi bậc.

**Chi phí MỖI NGƯỜI để có 19 Giao Lân (một bộ III).** Đồ rơi của trùm là MỘT chủ (cùng giả định mục 6), nên cả đội cần `số người x 19`, mỗi trận rơi trung bình 3: số trận tăng theo cỡ đội và mỗi trận ngắn lại tương ứng nên **thời gian mỗi người gần như KHÔNG đổi theo cỡ đội**; cái đổi là **số đan** (đủ đan, mỗi người mang theo):

| Bậc | Đội | Giây / trận | Số trận cả đội | Phút mỗi người | Đan mỗi người |
|---|---:|---:|---:|---:|---:|
| Sơ kỳ | 1 | 128 | 6.3 | 13.6 | 80.2 (9,627 Linh thạch) |
| Sơ kỳ | 2 | 64 | 12.7 | 13.5 | 38.0 (4,560 Linh thạch) |
| Sơ kỳ | 3 | 42 | 19.0 | 13.4 | 25.3 (3,040 Linh thạch) |
| Sơ kỳ | 4 | 32 | 25.3 | 13.5 | 19.0 (2,280 Linh thạch) |
| Trung kỳ | 1 | 109 | 6.3 | 11.5 | 59.1 (7,093 Linh thạch) |
| Trung kỳ | 2 | 55 | 12.7 | 11.6 | 30.6 (3,673 Linh thạch) |
| Trung kỳ | 3 | 36 | 19.0 | 11.4 | 19.0 (2,280 Linh thạch) |
| Trung kỳ | 4 | 27 | 25.3 | 11.5 | 12.7 (1,520 Linh thạch) |
| Hậu kỳ | 1 | 94 | 6.3 | 9.9 | 44.3 (5,320 Linh thạch) |
| Hậu kỳ | 2 | 47 | 12.7 | 9.9 | 19.0 (2,280 Linh thạch) |
| Hậu kỳ | 3 | 31 | 19.0 | 9.8 | 12.7 (1,520 Linh thạch) |
| Hậu kỳ | 4 | 23 | 25.3 | 9.8 | 6.3 (760 Linh thạch) |

**Hệ số công trùm: không có hệ số chung nào vừa chặn solo vừa giữ đội an toàn.** Nhân công trùm (đủ đan, 4 trận mỗi ô) để bắt buộc đội:

| Công trùm | Hậu kỳ, một người | Hậu kỳ, đội 3 | Hậu kỳ, đội 4 | Sơ kỳ, đội 4 |
|---|---|---|---|---|
| x1 (150) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết |
| x1.4 (210) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết |
| x1.7 (255) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 1.0 chết |
| x2 (300) | 0% (1.0 chết) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 3.0 chết |
| x2.5 (375) | 0% (1.0 chết) | 75%, 2.0 chết | 100%, 1.0 chết | 0% (4.0 chết) |

**Nhận định.** Mục tiêu M6 "đội 3-4 người hạ được, không ai chết; một người không hạ nổi" (`PHAN_CONG_M6.md` mục 4): đội 3-4 hạ được và không ai chết khi có đan (đạt); "một người không hạ nổi" **không đạt**: một người hạ được ở mọi bậc nếu đủ đan (Hậu kỳ solo 44 đan ~ 5,320 Linh thạch cho 19 Giao Lân). Đội KHÔNG nhanh hơn theo người (9.9 phút solo so với 9.8 phút đội 4 ở Hậu kỳ); lợi thế của đội là **ít đan hơn ~7.0 lần** (6 so với 44 viên mỗi người), tức 4,560 Linh thạch chênh mỗi bộ III. Tăng công trùm KHÔNG giải được: hệ số đủ chặn solo Hậu kỳ thì đội 4 Sơ kỳ đã có người chết (bảng trên). Chốt cho người dùng (`questions.md` câu 3): giữ nguyên (đội là cách RẺ đan, không phải cách duy nhất), hoặc giảm hiệu lực / kéo dài hồi chiêu Đại Hồi Huyết Đan (đụng cả bí cảnh và PK), hoặc công trùm theo cỡ đội (cần mã mới).

### 10. Thời gian tìm quái (#406 mục 7)

Phần mục 9 không kiểm. `ASSUME.searchSec` (giây từ lúc hạ con này tới lúc chạm con kế tiếp) quyết định tu vi / giờ của MỌI bãi, nhưng trước đây chỉ là con số đoán. Đây là số đo bằng mã server thật (`search-check.ts`): dựng `World` của từng bản đồ (quái sinh bằng `spawnInitial`, hồi sinh bằng `topUpMonsters` mỗi 10 giây, AI quái thật gồm phát hiện + đuổi), một thợ săn bất tử săn đúng một loài: tới con GẦN NHẤT THEO ĐƯỜNG ĐI (Dijkstra trên lưới ô, tránh tường và nước), tới tầm thì đánh `slash` thật. Thời gian tìm = các giây không có con nào trong tầm đánh, tính từ lúc hạ con trước (bỏ 2 lần hạ đầu: đi từ trấn ra bãi). Loài thường: 3 cách rải quái (hạt giống) x 12 lần hạ. Trùm (Xích Mãng, Hắc Giao: chỉ 2-6 con cả bản đồ nên thời gian tìm phụ thuộc mạnh vào chỗ chúng được rải): 12 hạt giống x 6 lần hạ (với 3 hạt giống số Xích Mãng nhiễu: review của B ở #459).

Bốn mức hiểu biết của thợ săn (đo càng thật thì càng chậm): **biết hết bản đồ** (cận dưới tuyệt đối: vị trí mọi con luôn hiện ra) và ba cỡ màn hình thật theo luật `fitZoom` của client (`client/src/gfx/scale.ts`, vùng nhìn CHỮ NHẬT quanh người chơi): **máy tính 1280x720** (1138x640 px), **điện thoại ngang 844x390** (1125x520 px: nhìn rộng gần bằng máy tính, thấp hơn) và **điện thoại dọc 390x844** (508x1100 px: hẹp nhất). Chỉ thấy con trong vùng nhìn; không thấy con nào thì QUÉT: đi (theo đường ngắn nhất) tới ô thô 256 px gần nhất thuộc vùng loài đó sinh ra (độ nguy hiểm đủ, ngoài khu an toàn: người chơi biết quái ở vùng nào) mà chưa nhìn tới trong lượt quét này (nhìn hết một vòng thì quét lại). Lần đầu bản đồ được đo bằng đi ngẫu nhiên (#459): đuôi dài làm số đo nhiễu (một lần lạc 500 giây kéo cả trung bình), nên đổi thành quét có trí nhớ; không còn tung ngẫu nhiên nào ngoài chỗ quái được rải. Mỗi ô: trung bình giây (trung vị).

| Bản đồ | Loài | Số con | Giả định (s) | Biết hết bản đồ | Máy tính 1280x720 (nhìn 1138x640 px) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | Điện thoại dọc 390x844 (nhìn 508x1100 px) |
|---|---|---:|---:|---:|---:|---:|---:|
| Lạc Hà Trấn | Linh Thố | 40 | 6 | 0.7 (0.4) | 0.8 (0.6) | 0.8 (0.6) | 0.9 (0.5) |
| Lạc Hà Trấn | Hôi Lang | 30 | 8 | 3.0 (2.4) | 2.7 (2.3) | 2.2 (1.7) | 2.8 (1.9) |
| Lạc Hà Trấn | Hắc Hổ | 16 | 12 | 2.3 (1.7) | 3.2 (1.6) | 3.2 (1.5) | 4.0 (1.8) |
| Lạc Hà Trấn | Xích Mãng | 2 | 90 | 10.7 (13.0) | 18.7 (17.0) | 20.9 (14.5) | 26.0 (21.3) |
| Hắc Phong Cốc | Hôi Lang | 20 | 8 | 4.0 (3.6) | 4.5 (3.6) | 7.2 (4.3) | 4.0 (3.4) |
| Hắc Phong Cốc | Hắc Hổ | 36 | 12 | 1.7 (1.4) | 2.8 (1.9) | 3.0 (2.4) | 3.7 (2.0) |
| Hắc Phong Cốc | Xích Mãng | 6 | 90 | 5.3 (3.9) | 6.2 (3.9) | 8.4 (5.9) | 8.3 (5.6) |
| Âm Sương Trạch | Sương Hồ | 24 | 10 | 3.1 (2.8) | 4.3 (3.4) | 7.2 (2.7) | 5.0 (3.4) |
| Âm Sương Trạch | Thạch Quy | 18 | 12 | 3.8 (2.3) | 6.5 (1.9) | 7.1 (2.4) | 6.3 (2.4) |
| Âm Sương Trạch | Độc Thiềm | 18 | 14 | 3.1 (2.1) | 6.2 (2.0) | 6.3 (3.7) | 5.7 (2.0) |
| Âm Sương Trạch | Hắc Giao | 2 | 90 | 11.4 (10.6) | 33.8 (26.5) | 32.7 (27.8) | 31.1 (24.5) |
| Hàn Vân Lĩnh | Hàn Lang | 20 | 10 | 4.3 (4.6) | 4.4 (3.2) | 5.2 (3.8) | 5.7 (4.7) |
| Hàn Vân Lĩnh | Phong Nha | 16 | 10 | 3.7 (2.9) | 5.0 (3.5) | 5.0 (4.7) | 6.7 (2.8) |
| Hàn Vân Lĩnh | Cốt Tượng | 12 | 12 | 3.6 (3.3) | 5.2 (2.7) | 6.4 (3.2) | 5.4 (3.6) |
| Hàn Vân Lĩnh | Độc Tước | 12 | 14 | 4.1 (3.4) | 4.4 (2.6) | 5.8 (3.9) | 4.2 (2.3) |
| Hàn Vân Lĩnh | Thiên Hàn Vương | 2 | 90 | 11.0 (10.3) | 24.8 (19.0) | 33.8 (24.1) | 28.4 (22.1) |

- **Mô hình KHÔNG lạc quan:** thợ săn biết hết bản đồ (cận dưới) đo tối đa **0.51x** giả định (ngưỡng #406: mô hình lạc quan nếu > 1.25x). `search-check.test.ts` giữ điều này: ai hạ `ASSUME.searchSec` xuống dưới cận dưới thì test đỏ.
- **Loài thường: giả định nằm trên cận dưới và quanh các mức nhìn thật.** Đo / giả định: 0.13x - 0.56x ở máy tính 1280x720; 0.13x - 0.89x ở điện thoại ngang 844x390; 0.15x - 0.67x ở điện thoại dọc 390x844 (quét theo vùng sinh: người thật có thể khéo hơn nhờ nhớ chỗ quái hay đứng, hoặc vụng hơn vì do dự). Không sửa số nào.
- **Xích Mãng (giả định 90 giây) và Hắc Giao (90 giây) là chỗ nhạy:** Xích Mãng đo 6 - 19 giây ở máy tính 1280x720; 8 - 21 giây ở điện thoại ngang 844x390; 8 - 26 giây ở điện thoại dọc 390x844 (quái thưa: 2 con ở Lạc Hà Trấn, 6 con ở Hắc Phong Cốc); Hắc Giao (2 con) 34 giây ở máy tính 1280x720; 33 giây ở điện thoại ngang 844x390; 31 giây ở điện thoại dọc 390x844.

**Nhịp tu luyện nhạy với giả định này.** Cùng `simulate(3)` như mục "Kim Đan sau nội dung" (một người, quái an toàn nhanh nhất mỗi bậc; "tối ưu" kể cả Xích Mãng, "bãi mới" không đụng Xích Mãng), thay `ASSUME.searchSec` bằng số đo từng mức nhìn (loài ở nhiều bản đồ: lấy bản đồ chậm hơn). Phút cộng dồn tới hết Luyện Khí và Trúc Cơ, rồi phút RIÊNG cảnh giới Kim Đan (mục tiêu: 5-7 giờ):

| Giả định tìm quái | Hết Luyện Khí (cộng dồn) | Hết Trúc Cơ (cộng dồn) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Nguồn nhanh nhất ở Kim Đan (tối ưu) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---:|---:|---:|---:|---|---:|
| Mô hình (giả định hiện tại) | 51 | 170 | 313 (5.2 giờ) | 339 (5.7 giờ) | Xích Mãng, Độc Thiềm | 1.42 / 1.09 / 1.00 |
| Biết hết bản đồ | 27 | 70 | 77 (1.3 giờ) | 208 (3.5 giờ) | Xích Mãng | 3.71 / 2.75 / 2.56 |
| Máy tính 1280x720 (nhìn 1138x640 px) | 28 | 78 | 102 (1.7 giờ) | 243 (4.1 giờ) | Xích Mãng | 3.18 / 2.47 / 2.31 |
| Điện thoại ngang 844x390 (nhìn 1125x520 px) | 28 | 79 | 109 (1.8 giờ) | 256 (4.3 giờ) | Xích Mãng | 3.40 / 2.33 / 2.17 |
| Điện thoại dọc 390x844 (nhìn 508x1100 px) | 29 | 86 | 125 (2.1 giờ) | 243 (4.0 giờ) | Xích Mãng | 2.78 / 1.97 / 1.80 |

Tiêu chí #406 mục 1 ("không nguồn nào vượt ~1,5x bãi mới tốt nhất cùng bậc", cột cuối): mô hình ĐẠT (tối đa 1.42x); biết hết bản đồ KHÔNG ĐẠT (tối đa 3.71x); máy tính 1280x720 KHÔNG ĐẠT (tối đa 3.18x); điện thoại ngang 844x390 KHÔNG ĐẠT (tối đa 3.40x); điện thoại dọc 390x844 KHÔNG ĐẠT (tối đa 2.78x).

**So công bằng: hiệu chỉnh theo độ vụng của loài thường.** Thợ săn là thuật toán (biết loài sống ở vùng nào, đường đi hoàn hảo, không bao giờ dừng), nên mọi số đo ở trên đều nhanh hơn giả định của mô hình; mô hình đã chừa cho người chơi thật một khoảng thời gian tìm quái lớn hơn thợ săn (do dự, đả tọa, nhặt đồ, tranh quái). So Xích Mãng / Hắc Giao với số đo THÔ là so không công bằng (mô hình cho chúng 90 giây, không chừa khoảng ấy). Bảng dưới giữ giả định mô hình cho loài thường và đặt Xích Mãng / Hắc Giao = số đo (bản đồ chậm hơn) cộng độ vụng. Độ vụng chỉ ước lượng được từ các loài thường (trung vị trên 36 dòng: 8 loài x 3 cỡ màn hình, 3 hạt giống) và **dạng của nó là giả thuyết chưa kiểm chứng**, nên cho hai dạng: NHÂN (người chậm gấp k lần thợ săn ở mọi nơi) và CỘNG (người mất thêm b giây cố định mỗi lần tìm). Một hệ số CHUNG cho cả ba cỡ màn hình, vì số đo thô của trùm gần y hệt giữa ba cỡ (Xích Mãng Lạc Hà 18.7 / 20.9 / 26.0 giây) nên hệ số riêng từng cỡ chỉ thêm nhiễu của loài thường. Thật nằm đâu đó giữa hai dạng; **số đo của bot / người (#410) mới phân xử được**.

| Giả thuyết độ vụng | Mức nhìn | Xích Mãng (s, giả định 90) | Hắc Giao (s, giả định 90) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---|---:|---:|---:|---:|---:|
| Nhân (người chậm gấp 2.3x) | Máy tính 1280x720 (nhìn 1138x640 px) | 43 | 78 | 179 (3.0 giờ) | 339 (5.7 giờ) | 2.52 / 1.97 / 1.86 |
| Nhân (người chậm gấp 2.3x) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | 48 | 76 | 195 (3.2 giờ) | 339 (5.7 giờ) | 2.33 / 1.82 / 1.71 |
| Nhân (người chậm gấp 2.3x) | Điện thoại dọc 390x844 (nhìn 508x1100 px) | 60 | 72 | 232 (3.9 giờ) | 339 (5.7 giờ) | 1.97 / 1.53 / 1.43 |
| Cộng (người mất thêm 6 giây) | Máy tính 1280x720 (nhìn 1138x640 px) | 24 | 39 | 120 (2.0 giờ) | 339 (5.7 giờ) | 3.65 / 2.95 / 2.85 |
| Cộng (người mất thêm 6 giây) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | 26 | 38 | 126 (2.1 giờ) | 339 (5.7 giờ) | 3.47 / 2.79 / 2.69 |
| Cộng (người mất thêm 6 giây) | Điện thoại dọc 390x844 (nhìn 508x1100 px) | 32 | 37 | 142 (2.4 giờ) | 339 (5.7 giờ) | 3.11 / 2.48 / 2.37 |

Tiêu chí #406 mục 1 sau hiệu chỉnh (tối đa của ba bậc; ĐẠT khi <= 1,5x), nhân: máy tính 1280x720 2.52x KHÔNG ĐẠT; điện thoại ngang 844x390 2.33x KHÔNG ĐẠT; điện thoại dọc 390x844 1.97x KHÔNG ĐẠT. Cộng: máy tính 1280x720 3.65x KHÔNG ĐẠT; điện thoại ngang 844x390 3.47x KHÔNG ĐẠT; điện thoại dọc 390x844 3.11x KHÔNG ĐẠT. Xích Mãng tìm mỗi 43-60 giây (nhân) hoặc 24-32 giây (cộng) chứ không phải 90; nhịp Kim Đan "tối ưu" ra 3.0-3.9 giờ (nhân) hoặc 2.0-2.4 giờ (cộng), mục tiêu 5-7. Cả hai giả thuyết ở cả 3 cỡ màn hình đều KHÔNG ĐẠT (ít nhất một bậc vượt 1,5x; từng bậc ở cột cuối của bảng). Lấy bản đồ CHẬM hơn của Xích Mãng (Lạc Hà Trấn, 2 con) là cách nghiêng về phía mô hình: người chơi chọn Hắc Phong Cốc (6 con) sẽ tìm nhanh hơn (số đo thô 6.2-8.4 giây so với 18.7-26.0 giây).

**Ngưỡng hoà vốn cho #410.** Chạy `simulate` với `ASSUME.searchSec.mang` = T (thời gian TÌM: từ lúc hạ con trước tới lúc chạm con kế, KHÔNG gồm trận và đả tọa hồi sức), tiêu chí #406 mục 1 đạt khi T >= **85 giây** (mô hình hiện tại: 90 giây, tối đa 1.42x). Trận + đả tọa hồi sức của Xích Mãng theo mô hình thêm 17.8 / 14.2 / 11.4 giây mỗi con (Sơ / Trung / Hậu kỳ), nên nếu bot đo từ lúc hạ tới lúc hạ con kế (kill-to-kill) thì phải trừ khoảng đó trước khi so với ngưỡng (khoảng 102 / 99 / 96 giây kill-to-kill ở ba bậc). Bot (#410) là thuật toán như thợ săn ở đây, nên so số đo THỜI GIAN TÌM của bot với ngưỡng đó phải trừ độ vụng: bot đo NGẮN hơn ~37 giây (giả thuyết nhân) hoặc ~79 giây (giả thuyết cộng) thì Xích Mãng nhanh quá mức tiêu chí; dài hơn thì đạt.

Đọc bảng: nhịp Kim Đan là hàm của giả định tìm quái. Mô hình ra 5.2 giờ (tối ưu) / 5.7 giờ (bãi mới); thợ săn máy tính 1280x720 1.7 / 4.1 giờ, điện thoại ngang 844x390 1.8 / 4.3 giờ, điện thoại dọc 390x844 2.1 / 4.0 giờ; biết hết bản đồ 1.3 / 3.5 giờ. Phần lớn chênh lệch tới từ Xích Mãng (nguồn nhanh nhất của cả ba bậc ở kịch bản tối ưu: Xích Mãng, Độc Thiềm): giả định 90 giây cho nó là một con số đoán và là cái quyết định nhịp "tối ưu". **Kết luận (chốt trước phát hành 0.2.0, #406 mục 7): GIỮ NGUYÊN `ASSUME.searchSec`, mật độ và EXP Xích Mãng; chấp nhận đường tắt Xích Mãng và theo dõi bằng số liệu thật.** Lý do: (1) số đo là thợ săn thuật toán, không phải người, nên chỉ là cận dưới (mô hình không lạc quan); người chơi chậm hơn bao nhiêu thì không ai biết: hai giả thuyết hiệu chỉnh ở trên cho thời gian TÌM Xích Mãng 43-60 giây (nhân) và 24-32 giây (cộng), cả hai dưới ngưỡng hoà vốn, tức tiêu chí 1,5x CHƯA đạt ở bãi Xích Mãng và nhịp Kim Đan "tối ưu" ngắn hơn mục tiêu (cột "Riêng Kim Đan (tối ưu)" ở bảng hiệu chỉnh); nhưng nhịp "bãi mới" (người không cày Xích Mãng) vẫn 5.7 giờ, trong mục tiêu 5-7 giờ. (2) Chỉnh mật độ hay EXP Xích Mãng bây giờ là căn theo MỘT trong hai giả thuyết trái nhau, kéo theo chạy lại mô phỏng luân hồi, nhiệm vụ và trang bị ngay trước phát hành: rủi ro cao hơn lợi ích. Bot (`bots.ts`) cũng không phân xử được vì cũng là thuật toán, nên phần "bot săn Kim Đan" của #410 được thay bằng chính phép đo này (thợ săn trong `World` thật, vùng nhìn chữ nhật như client) cùng `hunt-check` (mục 9). (3) Đường tắt đã biết và đã chặn bớt (Tụ Khí Đan trần 300 tu vi mỗi viên, Xích Mãng rơi ít hơn, #403 / #425; ca "tìm nhanh" 30 giây có trong `kim-dan.ts`). **Sau phát hành:** tệp lưu ghi `life.playMs` cùng cảnh giới / bậc; nếu trung vị người chơi hết Kim Đan trong dưới ~4 giờ thì chỉnh ở bản 0.2.x theo thứ tự (a) giảm mật độ / kéo dài hồi sinh Xích Mãng (`shared/`, PR riêng, B review), (b) chỉnh EXP; KHÔNG sửa `ASSUME.searchSec` cho tới khi có số đo người thật. Số hạt giống nhiều hơn (12 cho trùm) và thợ săn khoá mục tiêu / quét vòng đã loại các lần kẹt hàng nghìn giây mô phỏng của bản đầu (#459).

## Nguyên Anh sau nội dung (M7.5 / M7.9)

Tính SỐNG từ `shared/` bằng mô hình ở trên. Quái mới ở Hàn Vân: Hàn Lang (cấp 16, gồng lao), Phong Nha (17, bắn đạn), Cốt Tượng (17, dày, đập đất), Độc Tước (18, đòn nặng + độc), trùm Thiên Hàn Vương (21, đội 3-4 người). Thanh Nguyên Anh 288,000 / 331,200 / 380,880. Thời gian tìm quái lấy theo loài Kim Đan cùng vai (`ASSUME.searchSec`): Hàn Vân thưa hơn Âm Sương nên là cận lạc quan, `search-check.ts` chưa đo Hàn Vân. Mô hình KHÔNG tính chiêu / hệ / trạng thái (chỉ Kiếm chém, như mọi mục trên) và không tính đồ ba ô riêng (`ASSUME.useOwnerGear` tắt; độ nhạy ở mục 5).

### 1. Săn solo (tu vi / giờ, Linh thạch / giờ gồm bán đồ rơi, con / giờ, khí huyết mất / trận)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | Hàn Lang | 123,879 | 28,802 | 186 | 31% |
| Nguyên Anh Sơ kỳ | Phong Nha | 138,885 | 33,434 | 181 | 35% |
| Nguyên Anh Sơ kỳ | Cốt Tượng | 134,655 | 33,095 | 104 | 32% |
| Nguyên Anh Sơ kỳ | Độc Tước | không an toàn solo (65% khí huyết / trận) | – | – | – |
| Nguyên Anh Trung kỳ | Hàn Lang | 135,379 | 31,511 | 203 | 24% |
| Nguyên Anh Trung kỳ | Phong Nha | 152,527 | 36,760 | 199 | 27% |
| Nguyên Anh Trung kỳ | Cốt Tượng | 148,589 | 36,542 | 115 | 25% |
| Nguyên Anh Trung kỳ | Độc Tước | 176,642 | 50,837 | 127 | 50% |
| Nguyên Anh Hậu kỳ | Hàn Lang | 146,522 | 34,141 | 220 | 18% |
| Nguyên Anh Hậu kỳ | Phong Nha | 165,820 | 40,005 | 216 | 21% |
| Nguyên Anh Hậu kỳ | Cốt Tượng | 162,966 | 40,101 | 126 | 19% |
| Nguyên Anh Hậu kỳ | Độc Tước | 194,599 | 56,065 | 140 | 38% |

### 2. Trùm Thiên Hàn Vương theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 |
|---|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | không an toàn (495%) | không an toàn (124%) | không an toàn (55%) | 200,382 (31%) |
| Nguyên Anh Trung kỳ | không an toàn (383%) | không an toàn (96%) | 226,586 (43%) | 208,217 (24%) |
| Nguyên Anh Hậu kỳ | không an toàn (294%) | không an toàn (74%) | 237,040 (33%) | 215,506 (18%) |

### 3. Nhịp cả cảnh giới Nguyên Anh (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

Tổng: **6.0 giờ** solo; mục tiêu 6-9 giờ (`docs/PHAN_CONG_M7.md` mục 10). Mô hình bỏ qua nhiệm vụ lặp và thời gian đi lại ngoài `ASSUME.questOverheadSec`.

| Bậc | Thanh | Nguồn tốt nhất | Phút |
|---|---:|---|---:|
| Nguyên Anh Sơ kỳ | 288,000 | Phong Nha | 114.5 |
| Nguyên Anh Trung kỳ | 331,200 | Độc Tước | 104.7 |
| Nguyên Anh Hậu kỳ | 380,880 | Độc Tước | 141.6 |

### 4. Kinh tế Nguyên Anh: thu nhập so với phí rèn bộ IV

Thu nhập theo nhịp mục 3 (săn solo, mỗi bậc nguồn tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu bộ IV (người chơi giữ lại để rèn). Ví mang vào Nguyên Anh = phần dư cuối Kim Đan (**0** Linh thạch; thiếu thì ví về 0). Cả năm món bộ IV mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu. Săn trùm theo đội lấy Thiên Hàn Châu (vũ khí cần 2) kiếm ít hơn solo (tiền rơi trùm chia 4 người: ~8,521 / 8,855 / 9,166 Linh thạch / giờ mỗi người ở Sơ / Trung / Hậu kỳ): phần hụt đã trừ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | Phong Nha | 115 | 21,223 | 39,333 | 39,333 | 43,500 | -4,167 |
| Nguyên Anh Trung kỳ | Độc Tước | 105 | 39,280 | 68,557 | 107,890 | 43,500 | +64,390 |
| Nguyên Anh Hậu kỳ | Độc Tước | 142 | 43,319 | 102,246 | 210,136 | 43,500 | +166,636 |

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
| Bộ IV (từ Sơ kỳ) | 5 | 43,500 | 38 Hàn Lang mao, 2 Thiên Hàn châu, 22 Tượng cốt, 18 Phong Nha vũ, 6 Độc tước nang | 45.5 | 5.6 | 45% |

Tổng phí rèn bộ IV **43,500** Linh thạch = **2.0 giờ** thu nhập Sơ kỳ (so với Kim Đan: bộ III một mình 47,000 Linh thạch ~ 3.5 giờ thu nhập Hậu kỳ, ba bộ 78,500 ~ 5.9 giờ). Có được 210,136 tới hết Nguyên Anh: dư 166,636. Đan cấp 3 (`thuong_hoi_huyet_dan`, 360 Linh thạch / viên) là chỗ xả TUỲ CHỌN: 59 viên / giờ thu nhập Sơ kỳ.

**Đọc bảng.** Bộ IV trả đủ từ Nguyên Anh Trung kỳ (dư 64,390 cuối bậc; cuối Sơ kỳ còn thiếu 4,167); cày nguyên liệu chiếm tối đa 45% thời gian bậc nên nguyên liệu không phải nút cổ chai, tiền mới là. **CHƯA CHỐT (câu hỏi ở `questions.md`):** vì cả năm món cùng mặc được từ Sơ kỳ (khác Kim Đan: ba bộ rải ba bậc), sau khi rèn xong Linh thạch còn dư **166,636** (3.8x phí bộ IV) tới hết cảnh giới mà chỉ có đan cấp 3 (463 viên) và kho tông môn làm chỗ tiêu: đúng cảnh báo "dư hàng vạn Linh thạch không có chỗ tiêu" của mục "Kinh tế Linh thạch" (Kim Đan thì thiếu 14,987 cuối cảnh giới). Hướng đề xuất: tách bộ IV thành ba bậc (Sơ / Trung / Hậu kỳ, phí tăng dần như Kim Đan) hoặc nâng phí; chưa đổi vì đụng `shared/` (công thức, món đồ, `reqTier`) và phải chờ số đo bot thật của C.

### 5. Độ nhạy với đồ ba ô riêng (`ASSUME.useOwnerGear`)

Mọi mục trên đo với `useOwnerGear = false`: người chơi chỉ mặc ba ô công khai (vũ khí, bào, phù), KHÔNG tính hài, ngọc bội, pháp bảo (M7.4; `OWNER_EQUIP_SLOTS`: hài thêm tốc độ + `guard` giảm sát thương nhận, ngọc bội thêm khí huyết / linh lực / giảm hồi chiêu). Đó là giả định BẢO THỦ (người mới chưa rèn kịp) và là lý do mọi chốt cân bằng cũ vẫn đúng; bật cờ lên làm vài ca "một người không hạ nổi trùm" lệch. Bảng dưới đo SỐNG cả hai cấu hình (mô hình, không tính chiêu / hệ / trạng thái) để thấy mức lệch trước khi quyết có chỉnh số trùm / thanh tu vi hay giữ cờ tắt:

| Chỉ số | Không đồ ô riêng (mặc định) | Có đồ ô riêng |
|---|---:|---:|
| Hết Trúc Cơ (phút cộng dồn; mục tiêu ~180) | 170 | 170 |
| Riêng Kim Đan, bãi mới (giờ; mục tiêu 5-7) | 5.7 | 5.5 |
| Riêng Nguyên Anh (giờ; mục tiêu 6-9) | 6.0 | 5.8 |
| Đội nhỏ nhất đánh Hắc Giao an toàn (Sơ / Trung / Hậu kỳ Kim Đan) | 4 / 3 / 3 | 4 / 3 / 3 |
| Đội nhỏ nhất đánh Thiên Hàn Vương an toàn (Sơ / Trung / Hậu kỳ Nguyên Anh) | 4 / 3 / 3 | 3 / 3 / 3 |
| Khí huyết mất / trận, solo Độc Thiềm Hậu kỳ Kim Đan (%) | 34 | 28 |
| Khí huyết mất / trận, solo Độc Tước Hậu kỳ Nguyên Anh (%) | 38 | 33 |

Đọc bảng: có đồ ô riêng thì nhịp nhanh hơn 1 phút (Trúc Cơ), 0.2 giờ (Kim Đan), 0.2 giờ (Nguyên Anh) và solo bớt 6 / 5 điểm phần trăm khí huyết: mô hình lệch NHỎ. Độ lệch nằm ở các ngưỡng cứng. **Thử bật cờ (A, 15/11/2026): 10 ca đỏ**, chia ba nhóm: (1) mô hình: nhịp Nguyên Anh xuống dưới 6 giờ, Thiên Hàn Vương Sơ kỳ đội 3 đã hạ được (test ghim đội 4), Trúc Cơ cộng dồn lệch 1 phút so với số ghim; (2) mã server thật: bí cảnh (một người hạ được trùm ở bậc 11, thêm đan thì đỡ hơn mức test ghim), `hunt-check` trùm theo đội (Hắc Giao, Thiên Hàn Vương); (3) `search-check`: thợ săn seed 2 không hạ được con nào ở Âm Sương khi tốc độ đổi (thợ săn nhạy với tốc độ, chưa phải lỗi của đồ). Vì vậy giữ cờ **TẮT** (giả định bảo thủ: người mới chưa rèn kịp hài / ngọc bội / pháp bảo); bật thì phải chỉnh cùng lúc số trùm (công / máu), dải bậc bí cảnh và ngưỡng nhịp, chưa làm vì cần số đo bot thật của C để biết người chơi thật mặc bao nhiêu đồ ô riêng ở từng bậc.

## Tinh anh (M7.3, `systems/elite.ts`)

Mỗi lần sinh quái thường hiếu chiến (không trùm, không Linh Thố hiền) ở bản đồ thường có 4% là tinh anh, tối đa 3 con cùng lúc mỗi bản đồ: khí huyết x2.5, công x1.5 (trận dài ~3.8x sát thương nhận), tu vi x2, tiền rơi x2, tung bảng rơi đồ thêm một lần. Bảng dưới là CẬN TRÊN theo mô hình (đứng yên chém, không né, không đan, quái trúng 80% số đòn): thời gian hạ (giây, thường / tinh anh) và khí huyết mất mỗi trận (thường / tinh anh) ở bậc chuẩn của từng loài.

| Loài | Bậc chuẩn | Giây hạ (thường / tinh anh) | Khí huyết mất (thường / tinh anh) | Nhận xét |
|---|---|---:|---:|---|
| Hôi Lang | Luyện Khí Tầng 9 | 0.9 / 2.3 | 1% / 6% | an toàn |
| Hắc Hổ | Trúc Cơ Sơ kỳ | 2.8 / 6.9 | 8% / 31% | an toàn |
| Sương Hồ | Kim Đan Sơ kỳ | 4.1 / 10.3 | 31% / 115% | giết người đứng yên |
| Thạch Quy | Kim Đan Sơ kỳ | 16.7 / 41.8 | 32% / 121% | giết người đứng yên |
| Độc Thiềm | Kim Đan Trung kỳ | 5.7 / 14.2 | 46% / 174% | giết người đứng yên |
| Hàn Lang | Nguyên Anh Sơ kỳ | 4.2 / 10.6 | 31% / 116% | giết người đứng yên |
| Phong Nha | Nguyên Anh Sơ kỳ | 4.1 / 10.2 | 35% / 131% | giết người đứng yên |
| Cốt Tượng | Nguyên Anh Sơ kỳ | 17.3 / 43.2 | 32% / 122% | giết người đứng yên |
| Độc Tước | Nguyên Anh Trung kỳ | 6.1 / 15.2 | 50% / 187% | giết người đứng yên |

Đọc bảng: 7 / 9 loài có tinh anh làm người ĐỨNG YÊN solo mất hơn 100% khí huyết (Kim Đan và Nguyên Anh), nên tinh anh là mini-trùm: phải né báo trước đòn (loài gốc đã có), uống đan hoặc đi theo đội; chạy về khu an toàn là cách thoát. Luyện Khí / Trúc Cơ chỉ nhích nhẹ. Chết do quái là mất kiếp (Hoàng Tuyền) nên đây là rủi ro thật. Hệ số (khí huyết x2.5, công x1.5, xác suất 4%) ban đầu theo `docs/PHAN_CONG_M7.md` mục 6; bot thật của C và quyết định của người dùng bên dưới.

**Quyết định (QUYET_DINH_M3 mục 22.2, người dùng chốt 16/11/2026): GIỮ NGUYÊN độ mạnh của tinh anh, KHÔNG giảm hệ số.** Số đo bot thật đánh tinh anh Hàn Vân Lĩnh (Nguyên Anh Hậu kỳ, phản xạ 200 ms, né báo trước đòn, uống đan khi khí huyết dưới 50 %, cùng cấu hình cho mọi loài):

- **Hàn Lang / Phong Nha / Cốt Tượng:** solo SỐNG 6/6 (đáy khí huyết ~53-61 %, tốn 1 đan).
- **Độc Tước:** solo CHẾT 6/6 kể cả mặc đủ 6 món đồ ô riêng hoặc mang 8 đan (tử vong ~11 giây: sát thương độc dồn dập nhanh hơn hồi chiêu 12 giây của đan dược, chỉ kịp dùng 1 viên trước khi hết máu); đi ĐỘI 2 người thì sống an toàn 6/6 (đáy máu 66 %, hạ trong 6,4 giây).

Giữ nguyên vì: (1) tinh anh là mini-trùm — sao vàng + vầng cam dưới chân báo rõ từ xa (`client/src/elite.ts`), chạy về trấn / khu an toàn là thoát, rủi ro mất kiếp là cốt lõi thiết kế; (2) 3/4 loài solo có né + đan vẫn sống, chỉ Độc Tước (độc + đạn tầm xa) quá gắt khi một mình, nên GỢI Ý trong game thay vì hạ số: thông báo MỘT LẦN "★ Độc Tước tinh anh: nên đi đội." khi gặp (`client/src/elite.ts`, PR #750), không dán chữ lên đầu mọi tinh anh; (3) khuyến khích đi đội đúng tinh thần game. **Xem lại nếu** số liệu chơi thật sau này cho thấy người chơi bỏ Hàn Vân Lĩnh vì sợ Độc Tước tinh anh (tỉ lệ vào bản đồ / sống sót bất thường): khi đó cân nhắc giảm `ELITE_ATK_MULT` hoặc loại `doc_tuoc` khỏi `canBeElite` (mỗi bên một dòng ở `server/src/systems/elite.ts`).

### 6. Thực nghiệm bot THẬT Nguyên Anh (M7.10 Refs #511, #510)

Đo bằng bot THẬT điều khiển như người chơi trong `World` Hàn Vân Lĩnh:
- **Độ trễ phản xạ:** 200 ms (sau khi quái bắt đầu gồng đòn báo trước 200 ms bot mới nhận biết và bắt đầu chạy né).
- **Hành vi né đòn:** né xuyên tâm ra ngoài vòng đập đất `slam` (Cốt Tượng r=90px, Thiên Hàn Vương r=140px); né vuông góc với đường lao `charger` (Hàn Lang khi ở xa).
- **Chiến đấu:** áp sát chém thường Kiếm (`slash`), KHÔNG dùng chiêu thức võ công (giữ nguyên quy ước mô hình); uống `thuong_hoi_huyet_dan` (hồi 90% HP, cd 12s) khi khí huyết sụt dưới 50%.
- **Số đo thực nghiệm (Nguyên Anh Hậu kỳ):**

| Loài | Mô hình (s) | Đứng yên 3M (s) | Bot né 3M (s) | Sai số tgian (né) | ST đứng yên | ST bot né | Đáy khí huyết (3M) | Bot 6M (đồ ô riêng) | Đáy khí huyết (6M) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Hàn Lang** | 3.3 | 3.2 | 3.2 | 1.4% | 1,022 | 1,022 | 27% | 3.2s | 22% |
| **Phong Nha** | 3.2 | 3.2 | 3.2 | 2.2% | 1,236 | 1,236 | 33% | 3.2s | 26% |
| **Cốt Tượng** | 13.4 | 13.7 | 27.0 | 101.4% | 1,198 | 763 (-36%) | 20% | 21.6s | 16% |
| **Độc Tước** | 5.3 | 5.2 | 5.2 | 1.7% | 3,459 | 3,459 | 58% | 5.2s | 48% |

*Giải thích sai số thời gian ở Cốt Tượng (101%):* Trong mô hình, người chơi được giả định đứng yên chém liên tục (13.4s, rất sát với số đo 'Đứng yên 3M' 13.7s). Khi bật hành vi né đòn (`evade: true`), bot thật phải dừng chém và chạy xuyên tâm ra ngoài vòng đập đất r=90px của Cốt Tượng rồi mới áp sát lại chém tiếp, khiến thời gian hạ quái kéo dài lên 27.0s (+101%). Đổi lại, việc né đòn giúp giảm mạnh sát thương nhận vào từ 1,198 xuống 763 (-36% sát thương ở Hậu kỳ, giảm tới 59% ở Sơ kỳ), bảo toàn sinh mạng an toàn tuyệt đối.

**Trùm Thiên Hàn Vương theo cỡ đội (Nguyên Anh Hậu kỳ):**

| Cỡ đội | Hạ trùm (3 món công khai) | Đan / người (3 món) | Tử vong (3 món) | Hạ trùm (6 món đủ đồ ô riêng) | Đan / người (6 món) | Tử vong (6 món) |
|---|---:|---:|---:|---:|---:|---:|
| **Đội 4 người** | 30.8s | 0.3 viên | 0/6 trận | 29.6s | 0.3 viên | 0/6 trận |
| **Đội 3 người** | 42.7s | 0.3 viên | 0/6 trận | 45.8s | 0.0 viên | 0/6 trận |

**Thực nghiệm bot thật đánh TINH ANH Hàn Vân Lĩnh (Nguyên Anh Hậu kỳ, M7.10 Refs #511, #510):**

| Loài Tinh Anh | Solo 3M (s / đan) | Tử vong (solo 3M) | Đáy máu (solo 3M) | Solo 6M (đồ ô riêng) | Tử vong (solo 6M) | Đội 2 người (s / đan) | Tử vong (đội 2) | Nhận xét thực nghiệm |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Hàn Lang (Tinh Anh)** | 8.0s (1.0 đan) | 0/6 | 54% | 8.0s (52% máu) | 0/6 | 4.0s (0.5 đan) | 0/6 | Solo an toàn (1.0 đan); đội 2 rất an toàn (4.0s) |
| **Phong Nha (Tinh Anh)** | 8.0s (1.0 đan) | 0/6 | 61% | 8.0s (59% máu) | 0/6 | 4.0s (0.0 đan) | 0/6 | Solo an toàn (1.0 đan); đội 2 rất an toàn (4.0s) |
| **Cốt Tượng (Tinh Anh)** | 79.4s (1.0 đan) | 0/6 | 53% | 74.9s (53% máu) | 0/6 | 21.0s (0.0 đan) | 0/6 | Solo né đập đất liên tục (79.4s); đội 2 rút ngắn còn 21.0s |
| **Độc Tước (Tinh Anh)** | 10.8s (1.0 đan) | 6/6 | 92% | 12.3s (94% máu) | 6/6 | 6.4s (0.5 đan) | 0/6 | Solo tử vong 6/6 (độc dồn nhanh hơn cd đan 12s, mang 8 đan vẫn chết); đội 2 sống sót 100% |

**Đọc bảng & Kết luận thực nghiệm:**
1. **Né đòn cứu mạng rất rõ rệt:** Ở Cốt Tượng và Thiên Hàn Vương, đòn đập đất hình tròn gây lượng sát thương cực lớn. Nhìn vào đối chiếu cột 'ST đứng yên' và 'ST bot né', bot thật né thoát vòng đập đất giúp giảm 36% sát thương nhận vào từ Cốt Tượng và bảo toàn 100% mạng sống của toàn đội khi đánh Thiên Hàn Vương (0/6 trận có người chết ở cả đội 3 và đội 4 người).
2. **Độ nhạy đồ ô riêng (`useOwnerGear`):** Hài (thêm tốc độ chạy + `guard` giảm sát thương), ngọc bội (tăng maxHp, maxMp) và pháp bảo (tăng công, bạo kích) giúp:
   - Giảm 6% đến 39% sát thương nhận vào mỗi trận.
   - Nâng đáy khí huyết an toàn thêm 5 đến 24 điểm phần trăm.
   - Với trùm Thiên Hàn Vương: đội 4 người mặc đủ 6 món thậm chí **không cần dùng viên đan nào** (0.0 viên/người).
3. **A chọn giữ `useOwnerGear = false` cho mô hình cơ sở:** Vì đảm bảo người mới chưa kịp rèn đồ ô riêng vẫn đủ an toàn theo đúng mục tiêu nhịp; đồ ô riêng là phần thưởng thực tế giúp người chơi tối ưu hóa tốc độ cày và chinh phục nội dung khó hơn.
4. **Thực nghiệm bot thật đánh TINH ANH (đối chiếu cận trên mục 'Tinh anh'):**
   - Mô hình lý thuyết ở mục 'Tinh anh' (cận trên đứng yên không né không đan) cho thấy 7/9 loài làm người chơi mất >100% máu và có nguy cơ tử vong.
   - Số đo thực nghiệm bot thật:
     + **3/4 loài (Hàn Lang, Phong Nha, Cốt Tượng):** người chơi solo **CÓ NÉ + UỐNG ĐAN sống sót an toàn (0/6 tử vong)**, đáy khí huyết an toàn ~53% và tiêu tốn 1 viên đan hồi phục.
     + **Độc Tước Tinh Anh:** người chơi solo tử vong 6/6 trận (kể cả mặc đủ 6 món hoặc mang 8 đan: tử vong ở ~11s với 6/6 trận chết vì sát thương độc dồn dập nhanh hơn hồi chiêu 12s của đan dược, chỉ kịp dùng 1 viên trước khi hết máu).
     + **Lập đội 2 người:** Độc Tước Tinh Anh bị hạ gục an toàn trong 6.4s mà không có bất kỳ ai tử vong (0/6 trận, đáy máu 66%). Cốt Tượng Tinh Anh rút ngắn thời gian từ 79.4s xuống 21.0s và hoàn toàn không tốn viên đan nào.
   - **Ghi nhận:** Bộ hệ số tinh anh (x2.5 khí huyết, x1.5 công, xác suất 4%) của M7.3 là số đo thực nghiệm; rủi ro Độc Tước tinh anh solo chết 100% đã được **người dùng chốt GIỮ NGUYÊN** (QUYET_DINH_M3 mục 22.2, 16/11/2026): tinh anh là mini-trùm nhìn rõ (sao vàng + vầng cam), chạy về trấn là thoát, gợi ý "nên đi đội" trong game (`client/src/elite.ts`, PR #750) thay vì hạ số; xem lại nếu số liệu chơi thật cho thấy người chơi bỏ Hàn Vân vì sợ Độc Tước (chi tiết ở mục "Tinh anh").


## Tông môn có chiều sâu trên BẢNG THẬT (M8.7, #844)

> Phần này sinh từ `server/src/balance/tong-mon.ts`, tính SỐNG từ `SECT_LEVELS`, `SECT_QUEST_CH`, `SECT_SHOP` (28 món) và hàm giá của `shared/src/currency.ts`; phân tích bằng giấy (số trong thiết kế) ở `docs/M8_TONG_MON_MO_PHONG.md`.
> Bất biến giữ bằng `sectBalanceViolations` (test `tong-mon.test.ts`): không vòng lời, sức mua / ngày <= 1 giờ săn bậc thấp nhất, buff <= 5%.

### 1. Ngày lên cấp tông theo số thành viên tích cực

Điểm tông = tổng cống hiến MỌI thành viên từng kiếm (chỉ tăng). Trần mỗi người 140 cống hiến / ngày; ba nhiệm vụ / ngày = 90 (độ khó 20 + 30 + 40).

**Cả trần (140 / người / ngày: nhiệm vụ + góp kho + bí cảnh), số NGÀY tới từng cấp:**

| Tích cực | điểm / ngày | Cấp 2 (1.000) | Cấp 3 (4.000) | Cấp 4 (12.000) | Cấp 5 (30.000) |
|:-:|--:|--:|--:|--:|--:|
| 1 | 140 | 7,1 | 28,6 | 85,7 | 214,3 |
| 2 | 280 | 3,6 | 14,3 | 42,9 | 107,1 |
| 3 | 420 | 2,4 | 9,5 | 28,6 | 71,4 |
| 5 | 700 | 1,4 | 5,7 | 17,1 | 42,9 |
| 10 | 1.400 | 0,7 | 2,9 | 8,6 | 21,4 |

**Chỉ làm nhiệm vụ (90 / người / ngày):**

| Tích cực | điểm / ngày | Cấp 2 (1.000) | Cấp 3 (4.000) | Cấp 4 (12.000) | Cấp 5 (30.000) |
|:-:|--:|--:|--:|--:|--:|
| 1 | 90 | 11,1 | 44,4 | 133,3 | 333,3 |
| 2 | 180 | 5,6 | 22,2 | 66,7 | 166,7 |
| 3 | 270 | 3,7 | 14,8 | 44,4 | 111,1 |
| 5 | 450 | 2,2 | 8,9 | 26,7 | 66,7 |
| 10 | 900 | 1,1 | 4,4 | 13,3 | 33,3 |

Lên cấp là chuyện của TUẦN, không phải GIỜ: tông 3 người tích cực đạt cấp 5 sau 10,2 tuần (cả trần) tới 15,9 tuần (chỉ nhiệm vụ).

### 2. Sức mua mỗi ngày của cửa hàng thật

Cận trên giá trị (Linh thạch theo GIÁ MUA NPC) một người mua trong một ngày với 140 cống hiến (knapsack phân số theo sức mua mỗi cống hiến, tới hạn mức `limitDay` của từng món). Cột còn lại: sức mua đó bằng bao nhiêu GIỜ săn solo của cảnh giới (loại quái tốt nhất ở bậc đầu, `monsterEconomy`).

| Cấp tông | món đã mở | sức mua tối đa / ngày (LT) | giờ săn Phàm Nhân (1.075 LT/h) | giờ săn Luyện Khí (1.377 LT/h) | giờ săn Trúc Cơ (4.399 LT/h) | giờ săn Kim Đan (15.735 LT/h) |
|:-:|--:|--:|--:|--:|--:|--:|
| 1 (Sơ Lập) | 5 | 660 | 0,61 | 0,48 | 0,15 | 0,04 |
| 2 (Tiểu Thành) | 13 | 687 | 0,64 | 0,50 | 0,16 | 0,04 |
| 3 (Trung Hưng) | 16 | 759 | 0,71 | 0,55 | 0,17 | 0,05 |
| 4 (Hưng Vượng) | 23 | 760 | 0,71 | 0,55 | 0,17 | 0,05 |
| 5 (Đỉnh Thịnh) | 28 | 760 | 0,71 | 0,55 | 0,17 | 0,05 |

- Mốc bất biến: bậc thu nhập thấp nhất là **Phàm Nhân** (1.075 LT/h); sức mua tối đa ở cấp 5 = **0,71 giờ** (<= 1). Cửa hàng là tiện lợi / phần thưởng tham gia, không phải chỗ kiếm tiền.
- Sức mua cao nhất mỗi cống hiến: **6,00 LT / cống hiến** (Tụ Khí Đan); neo thiết kế là 5. Chỉ món NPC KHÔNG bán (Tụ Khí Đan, rẻ hơn công thức chủ ý) có thể vượt neo; mọi món NPC có bán bị `sectShopViolations` giữ <= 5.

### 3. Vòng Linh thạch -> cống hiến -> hàng -> bán lại

Một món mua bằng `cost` cống hiến rồi bán lại NPC (`sellPrice`). Vốn tính hai cách: (a) cống hiến kiếm bằng nhiệm vụ coi như đáng 5 LT (neo); (b) cống hiến có được bằng GÓP KHO, 100 LT giá trị = 1 cống hiến (Linh thạch thật). Vòng có lời khi bán lại / vốn >= 1.

| Cách quy vốn | bán lại / vốn LỚN NHẤT trên 28 món có giá bán | món |
|---|--:|---|
| (a) neo 5 LT / cống hiến | 0,30 | Tụ Khí Đan (cost 30, bán 45 LT) |
| (b) góp kho 100 LT / cống hiến | 0,02 | Tụ Khí Đan (cost 30, bán 45 LT) |

**Không có vòng lời** (mọi tỉ lệ < 1); hàng mua bằng cống hiến không rửa Linh thạch.

### 4. Buff cấp tông

Buff gắn vào tu vi cá nhân / rơi đồ / hồi phục, KHÔNG gắn vào điểm tông nên không tạo vòng tăng tốc lên cấp. Ngân sách thiết kế: nhịp lên cảnh giới nhanh hơn <= 5%, rơi đồ <= +5%; trần cứng x1.1 / x1.1.

| Cấp tông | buff tu vi | nhịp lên cảnh giới nhanh hơn | buff rơi đồ | rơi đồ |
|:-:|--:|--:|--:|--:|
| 1 (Sơ Lập) | x1.00 | 0% | x1.00 | +0% |
| 2 (Tiểu Thành) | x1.02 | 2% | x1.00 | +0% |
| 3 (Trung Hưng) | x1.03 | 2,9% | x1.03 | +3% |
| 4 (Hưng Vượng) | x1.04 | 3,8% | x1.05 | +5% |
| 5 (Đỉnh Thịnh) | x1.05 | 4,8% | x1.05 | +5% |

### 5. Đường tắt Tụ Khí Đan mua bằng cống hiến

Tụ Khí Đan (cấp tông 3, 30 cống hiến, tối đa 2 viên / ngày) cộng 5% thanh tu vi, tối đa 300 tu vi mỗi viên. Mua đủ hạn mức mỗi ngày tốn 60 / 140 cống hiến của ngày. Thời gian tiết kiệm theo nhịp bậc (mô hình `simulate`, có chuỗi nhiệm vụ):

| Bậc | thanh tu vi | tu vi / viên | tu vi / ngày | tiết kiệm / ngày |
|---|--:|--:|--:|---|
| Luyện Khí Tầng 5 | 410 | 21 | 41 | 0,6 phút (10% thanh) |
| Luyện Khí Tầng 9 | 600 | 30 | 60 | 0,5 phút (10% thanh) |
| Trúc Cơ Trung kỳ | 5.060 | 253 | 506 | 3,5 phút (10% thanh) |


## Cân bằng chiêu thức, ngũ hành và trạng thái (M7, #510)

> Dựa trên `shared/src/skills.ts` (18 chiêu: 12 đợt 1 + 6 chiêu Nguyên Anh đợt 2, #654) và `server/src/systems/status-rules.ts`. Mọi chiêu thức được mô phỏng theo chu kỳ thi triển đều đặn theo hồi chiêu, kết hợp đan xen Kiếm chém thường (`SKILLS.slash`).

### 1. Bảng 18 chiêu thức và tỉ lệ tăng DPS
| Chiêu | Hệ | Hồi chiêu | Linh lực | Mult | Hiệu ứng trạng thái | DPS đơn (bình thường) | DPS đơn (khắc hệ 1,3×) | DPS đơn (bị khắc 0,8×) |
|---|---|---:|---:|---:|---|---:|---:|---:|
| **Hỏa Vân Kiếm** | hoa | 3.0s | 26 | 1.6× | burn (12%, 3.0s, 40%) | 1.11× | 1.18× | 1.06× |
| **Bôn Thạch Quyền** | tho | 3.5s | 26 | 1.9× | – | 1.10× | 1.17× | 1.06× |
| **Ưng Trảo** | kim | 2.5s | 19 | 1.3× | bleed (15%, 3.0s, 40%) | 1.08× | 1.15× | 1.03× |
| **Trọng Nhạc Trảm** | tho | 3.0s | 26 | 1.6× | bleed (12%, 3.0s, 30%) | 1.10× | 1.17× | 1.06× |
| **Huyền Băng Chỉ** | bang | 2.5s | 23 | 1.5× | – | 1.08× | 1.15× | 1.03× |
| **Kim Chung Tráo** | kim | 9.0s | 38 | – | shield (20%, 5.3s, 100%) | 0.96× | 0.96× | 0.96× |
| **Hồi Xuân** | thuy | 8.0s | 57 | – | regen (6%, 4.0s, 100%) | 0.95× | 0.95× | 0.95× |
| **Phiêu Phong Bộ** | phong | 3.0s | 16 | – | – | 0.87× | 0.87× | 0.87× |
| **Thanh Tùng Phi Châm** | moc | 3.0s | 32 | 1.5× | poison (20%, 3.0s, 60%) | 1.14× | 1.22× | 1.08× |
| **Lạc Tuyết Phân Phi (5 tia)** | bang | 3.5s | 32 | 0.7×5 | chill (30%, 3.0s, 50%) | 1.29× | 1.41× | 1.21× |
| **Cửu Cung Khốn Sát** | tho | 7.0s | 45 | 1.4× | stun (0%, 1.1s, 70%), sunder (10%, 3.0s, 50%) | 1.04× | 1.07× | 1.03× |
| **Mê Tung Bộ** | phong | 8.0s | 32 | – | haste (35%, 3.0s, 100%) | 0.95× | 0.95× | 0.95× |
| **Hàn Quang Tiễn** | bang | 3.0s | 35 | 2.4× | chill (30%, 3.0s, 55%) | 1.19× | 1.28× | 1.12× |
| **Bạch Kim Trảo** | kim | 3.2s | 38 | 2.2× | bleed (18%, 4.5s, 55%) | 1.24× | 1.35× | 1.16× |
| **Vân Thạch Trận** | tho | 7.0s | 51 | 2.0× | stun (0%, 1.1s, 70%), sunder (12%, 3.0s, 55%) | 1.09× | 1.12× | 1.06× |
| **Băng Hoa Loạn (5 tia)** | bang | 3.8s | 42 | 0.8×5 | chill (30%, 3.0s, 50%) | 1.34× | 1.48× | 1.25× |
| **Liệt Hỏa Kiếm** | hoa | 3.5s | 45 | 2.6× | burn (20%, 4.5s, 60%) | 1.31× | 1.43× | 1.22× |
| **Vân Hành Bộ** | phong | 8.0s | 38 | – | haste (40%, 3.0s, 100%) | 0.95× | 0.95× | 0.95× |
| *Lạc Tuyết Phân Phi (1 tia xa)* | bang | 3.5s | 32 | 0.7× | tê cóng | 0.97× | 0.99× | 0.95× |

### 2. Vòng chiêu mẫu theo cảnh giới (Build Rotation)
| Cảnh giới | Số ô chiêu | Chiêu trang bị | Sức mạnh tổng (vô sắc) | Sức mạnh tổng (khắc hệ) | Tiêu hao linh lực | Duy trì giao tranh |
|---|---:|---|---:|---:|---:|---:|
| Luyện Khí | 1 | Hỏa Vân Kiếm | 1.11× | 1.18× | 8.7 MP/s | Vô hạn |
| Trúc Cơ | 2 | Hỏa Vân + Trọng Nhạc | 1.21× | 1.29× | 17.3 MP/s | 39s |
| Kim Đan | 3 | Hỏa Vân + Cửu Cung + Huyền Băng | 1.24× | 1.31× | 24.3 MP/s | 21s |

### 3. Đánh giá tiêu chuẩn mục 10
- **Trần sức mạnh chiêu**: Chiêu mạnh nhất đạt tối đa **1.48×** (kể cả chiêu quạt Lạc Tuyết Phân Phi 5 tia sát người khi khắc hệ, ngưỡng an toàn < **2,0×**).
- **Sức mạnh chuỗi chiêu khi khắc hệ đúng**: Đạt **1.31×** (nằm đúng trong dải mục tiêu **1,3 – 1,65×**).
- **Kinh tế linh lực**: Duy trì **> 21 giây** trước khi cần nghỉ, vượt xa thời lượng trận đấu thông thường (6-15 giây).
