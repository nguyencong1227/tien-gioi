# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ `server/src/balance/simulate.ts`. Sửa số liệu trong `shared/` rồi chạy
> `npm run can-bang -w server` để cập nhật. Test `server/src/balance/simulate.test.ts` giữ đường cong trong mục tiêu.

## Kết quả

- Hết Luyện Khí (sẵn sàng Trúc Cơ): **51 phút** (mục tiêu ~1 giờ)
- Hết Trúc Cơ (sẵn sàng Kim Đan): **2 giờ 47 phút** (mục tiêu ~3 giờ)
- Cả Kim Đan (sau nội dung M6, bảng ở mục "Kim Đan sau nội dung"): **3.9 giờ** săn bãi mới, **3.9 giờ** tối ưu (mục tiêu M6 5-7 giờ; QUYET_DINH_M3 mục 30 chủ ý rút còn ~4 giờ: tu vi x2, máu x1,5); kinh tế, trang bị và PK ở mục 6-8 của mục đó

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
| Trúc Cơ Sơ kỳ | 4400 | ho | 113 | 30.5 | 1 giờ 22 phút |
| Trúc Cơ Trung kỳ | 5060 | ho | 132 | 34.1 | 1 giờ 56 phút |
| Trúc Cơ Hậu kỳ | 5819 | ho | 204 | 50.9 | 2 giờ 47 phút |

Bảng trên dừng ở hết Trúc Cơ (quái và đồ gốc: Linh Thố, Hôi Lang, Hắc Hổ, Xích Mãng). Cảnh giới Kim Đan (ba bậc, ba quái mới, trùm Hắc Giao, ba bộ trang bị, phí rèn) ở mục "Kim Đan sau nội dung (M6)" cuối tệp: săn solo, trùm theo đội, nhịp, luân hồi, tổ đội, kinh tế, trang bị, PK và bí cảnh. Cảnh giới Nguyên Anh (bốn quái Hàn Vân, trùm Thiên Hàn Vương, bộ IV, phí rèn) ở mục "Nguyên Anh sau nội dung (M7.5 / M7.9)".

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×1.08), quái đánh trúng 80% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá 50% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: tho 6s, lang 8s, ho 12s, mang 90s, suong_ho 10s, thach_quy 12s, doc_thiem 14s, hac_giao 90s, han_lang 10s, phong_nha 10s, cot_tuong 12s, doc_tuoc 14s, thien_han_vuong 90s, da_lang 10s, hac_phong_lang 10s, huyet_nguyet_lang 12s, xich_diem_lang 12s, thuong_nguyet_lang 14s, ngan_nguyet_lang 14s, luyen_huyet_de_tu 10s, nga_quy 10s, cuong_thi 12s, huyet_mi 12s, huyet_anh 14s, huyet_sat_chan_truyen 14s, lang_vuong 90s, thien_lang_vuong 90s.
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
| Hắc Hổ (`ho`) | 7 | 600 | 11.20 | 11.37 | **22.57** | Da hổ (9 LT), Đan hồi phục (6 LT), Tụ khí đan (45 LT) |
| Xích Mãng (`mang`) | 12 | 4000 | 225.00 | 250.47 | **475.47** | Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT) |

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
| Luyện Khí Tầng 6 | Hắc Hổ | 133 | 1,492 | 1,515 | **3,007** | 125.3 |
| Luyện Khí Tầng 7 | Linh Thố | 566 | 679 | 696 | **1,375** | 57.3 |
| Luyện Khí Tầng 7 | Hôi Lang | 376 | 1,054 | 960 | **2,014** | 83.9 |
| Luyện Khí Tầng 7 | Hắc Hổ | 168 | 1,883 | 1,912 | **3,796** | 158.2 |
| Luyện Khí Tầng 8 | Linh Thố | 570 | 683 | 701 | **1,384** | 57.7 |
| Luyện Khí Tầng 8 | Hôi Lang | 385 | 1,077 | 981 | **2,057** | 85.7 |
| Luyện Khí Tầng 8 | Hắc Hổ | 180 | 2,018 | 2,049 | **4,068** | 169.5 |
| Luyện Khí Tầng 9 | Linh Thố | 573 | 688 | 705 | **1,393** | 58.1 |
| Luyện Khí Tầng 9 | Hôi Lang | 393 | 1,101 | 1,002 | **2,103** | 87.6 |
| Luyện Khí Tầng 9 | Hắc Hổ | 193 | 2,167 | 2,200 | **4,367** | 182.0 |
| Trúc Cơ Sơ kỳ | Linh Thố | 581 | 697 | 715 | **1,412** | 58.8 |
| Trúc Cơ Sơ kỳ | Hôi Lang | 410 | 1,149 | 1,046 | **2,195** | 91.5 |
| Trúc Cơ Sơ kỳ | Hắc Hổ | 223 | 2,499 | 2,537 | **5,036** | 209.8 |
| Trúc Cơ Trung kỳ | Linh Thố | 583 | 700 | 718 | **1,418** | 59.1 |
| Trúc Cơ Trung kỳ | Hôi Lang | 415 | 1,163 | 1,059 | **2,222** | 92.6 |
| Trúc Cơ Trung kỳ | Hắc Hổ | 232 | 2,603 | 2,643 | **5,246** | 218.6 |
| Trúc Cơ Hậu kỳ | Linh Thố | 586 | 703 | 720 | **1,423** | 59.3 |
| Trúc Cơ Hậu kỳ | Hôi Lang | 420 | 1,176 | 1,071 | **2,247** | 93.6 |
| Trúc Cơ Hậu kỳ | Hắc Hổ | 241 | 2,699 | 2,741 | **5,439** | 226.6 |

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
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới 475.5 LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
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
| Trúc Cơ trung kỳ | 82 | 39 | 28.5 | 45 | **32.9** |
| Trúc Cơ hậu kỳ | 116 | 54 | 27.9 | 60 | **31.0** |
| Hết Trúc Cơ (thanh đầy) | 167 | 69 | 24.8 | 78 | **28.0** |

Đọc bảng: Tính từ Luyện Khí tầng 5 trở đi (bỏ qua giai đoạn mới vào game), Duyên / giờ (0 trùm) nhỏ nhất là **23.1** (Luyện Khí tầng 5), lớn nhất là **28.5** (Trúc Cơ trung kỳ), tỷ lệ lớn / nhỏ là **1.23×**. Đỉnh Duyên / giờ rơi vào Trúc Cơ trung kỳ (~28.5 Duyên/h, gấp ~1.15× so với cày hết Trúc Cơ).

### 2. Tiến trình luân hồi qua chuỗi kiếp (1..N) khi mở dần "Dư âm tu hành"

Giả định người chơi kiếp nào cũng cày trọn vẹn đến hết Trúc Cơ (hạ 2 trùm) và dồn Duyên nâng cấp `du_am` (+10% đến +100%):

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 3 | +30% | 2 giờ 47 phút | +75 | 19 | **27.0** | 1.00× | Lên nấc 3 (+30%) |
| 2 | Nấc 5 | +50% | 2 giờ 10 phút | +74 | 0 | **34.1** | 1.26× | Lên nấc 5 (+50%) |
| 3 | Nấc 5 | +50% | 1 giờ 54 phút | +72 | 72 | **37.9** | 1.41× | Chờ đủ 80 Duyên |
| 4 | Nấc 6 | +60% | 1 giờ 54 phút | +72 | 64 | **37.9** | 1.41× | Lên nấc 6 (+60%) |
| 5 | Nấc 7 | +70% | 1 giờ 47 phút | +71 | 20 | **39.7** | 1.47× | Lên nấc 7 (+70%) |
| 6 | Nấc 7 | +70% | 1 giờ 42 phút | +71 | 91 | **42.0** | 1.56× | Chờ đủ 165 Duyên |
| 7 | Nấc 7 | +70% | 1 giờ 42 phút | +71 | 162 | **42.0** | 1.56× | Chờ đủ 165 Duyên |
| 8 | Nấc 8 | +80% | 1 giờ 42 phút | +71 | 68 | **42.0** | 1.56× | Lên nấc 8 (+80%) |
| 9 | Nấc 8 | +80% | 1 giờ 36 phút | +70 | 138 | **43.6** | 1.62× | Chờ đủ 235 Duyên |
| 10 | Nấc 8 | +80% | 1 giờ 36 phút | +70 | 208 | **43.6** | 1.62× | Chờ đủ 235 Duyên |
| 11 | Nấc 9 | +90% | 1 giờ 36 phút | +70 | 43 | **43.6** | 1.62× | Lên nấc 9 (+90%) |
| 12 | Nấc 9 | +90% | 1 giờ 32 phút | +70 | 113 | **45.8** | 1.70× | Chờ đủ 335 Duyên |
| 13 | Nấc 9 | +90% | 1 giờ 32 phút | +70 | 183 | **45.8** | 1.70× | Chờ đủ 335 Duyên |
| 14 | Nấc 9 | +90% | 1 giờ 32 phút | +70 | 253 | **45.8** | 1.70× | Chờ đủ 335 Duyên |
| 15 | Nấc 9 | +90% | 1 giờ 32 phút | +70 | 323 | **45.8** | 1.70× | Chờ đủ 335 Duyên |
| 16 | Nấc 10 | +100% | 1 giờ 32 phút | +70 | 58 | **45.8** | 1.70× | Lên nấc 10 (+100%) |
| 17 | Nấc 10 | +100% | 1 giờ 27 phút | +69 | 127 | **47.3** | 1.76× | Đã đạt tối đa (+100%) |

### 3. Nhận xét & Đánh giá cân bằng luân hồi

- **Tính chất ngang bằng giữa các cách chơi (chết ở bậc nào):**
  - Người chơi cày chay chết ở Luyện Khí tầng 5 (29 phút): **23.1 Duyên/h** (0 trùm) / **35.8 Duyên/h** (hạ trùm).
  - Người chơi cày tới Trúc Cơ sơ kỳ (51 phút): đạt đỉnh **26.8 Duyên/h** (0 trùm) / **33.8 Duyên/h** (hạ trùm).
  - Người chơi cày hết Trúc Cơ (167 phút): **24.8 Duyên/h** (0 trùm) / **28.0 Duyên/h** (hạ trùm).
  - **Đánh giá:** Mục tiêu thiết kế ("mọi cách chơi tương đương", mục 5 của docs/THIET_KE_LUAN_HOI.md) **đạt**: từ Luyện Khí tầng 5 trở đi mọi mốc nằm trong 23.1–28.5 Duyên/h (chênh 1.23×, ngưỡng 1.3×), không có bậc nào đáng để cố ý chết sớm; chết ở Luyện Khí tầng 1 (9 phút) chỉ nhận 1 Duyên.
- **Tiến trình tăng trưởng qua các kiếp (Progression pacing):**
  - Cần **16 kiếp** trọn vẹn để đạt tối đa nấc 10 Dư âm tu hành (+100% tốc độ tu luyện). Tổng thời gian chơi khoảng **~28 giờ**.
  - Tốc độ Duyên mỗi giờ tăng từ **27.0 Duyên/h** (kiếp 1) lên **47.3 Duyên/h** (khi max Dư âm tu hành), tương đương tỷ lệ **1.76×**.
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
| 2 người | 1235 | 19.8 | 2816 | 23.4 |
| 3 người | 1067 | 17.1 | 2122 | 17.7 |
| 4 người | 983 | 15.8 | 1776 | 14.8 |

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
| Hóa Thần tầng 1 (bậc 19) | 34.4 | 33.6 - 36.0 |
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


## Thưởng tu vi nhiệm vụ một lần (M66.4, #1333)

Nhiệm vụ **chính** (chuỗi `next`) và **việc phụ** (không bắt buộc) thưởng tu vi MỘT LẦN. Bảng dưới so **trước / sau** bước 2 (#1362): mỗi nhiệm vụ chính
nâng lên sàn 5 % thanh bậc nhận, việc phụ 2 %; trần nới 10 % (chuỗi chính) / 4 % (việc phụ) mỗi cảnh giới (ngưỡng ở `shared/src/kim-dan-world.test.ts`).
"Tổng thanh" = tổng `expToNext` qua 3 bậc của cảnh giới. Nhiệm vụ lặp hằng ngày (`daily`, Bảng cáo thị — dòng thu nhập lặp mỗi ngày) KHÔNG tính ở đây.

| Cảnh giới | Tổng thanh | Chuỗi chính TRƯỚC | Chuỗi chính SAU | Việc phụ TRƯỚC | Việc phụ SAU | Tổng 1-lần SAU |
|---|---:|---:|---:|---:|---:|---:|
| Trúc Cơ | 15,279 | 1.31% (200) | 2.23% (340) | 1.96% (300) | 3.99% (609) | **6.21%** |
| Kim Đan | 166,680 | 3.48% (5,800) | 8.40% (14,000) | 2.40% (4,000) | 3.60% (6,000) | **12.00%** |
| Nguyên Anh | 1,000,080 | 4.92% (49,200) | 9.47% (94,700) | 1.95% (19,500) | 2.07% (20,700) | **11.54%** |

**Hoàn thành MỌI nhiệm vụ một lần** (chuỗi chính + việc phụ) thưởng thêm **Trúc Cơ 6.21% / Kim Đan 12.00% / Nguyên Anh 11.54%** tổng thanh — tức phần tu vi bonus rút ngắn cảnh giới đó chừng ấy %
(nghĩa đen về phía tu vi; thời gian thật rút ngắn ÍT HƠN vì còn thời gian đi lại, nói chuyện và chính việc săn quái trong nhiệm vụ — A đo Kim Đan ~4,2 → 3,9 giờ,
~7 %). Trước #1362 các cảnh giới chỉ thưởng 1-lần 3.27 / 5.88 / 6.87% (Trúc Cơ / Kim Đan / Nguyên Anh).

> Lưu ý cân bằng: thưởng 1-lần sau #1362 đạt **12.00%** tổng thanh ở Kim Đan — sát ngưỡng ~12 % A đặt (comment #1333: trên ~12 %
> thì báo trước khi chốt). Đây là hệ quả của dữ liệu #1362 đã merge, KHÔNG đổi ở đây; `daily` giữ nguyên nên không thành đường tắt cày tu vi lặp.


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

Mục tiêu: không bãi nào cho tu vi / giờ vượt ~1,5x bãi mới tốt nhất cùng bậc, Linh thạch / giờ không vượt ~2x. Quái mới KHÔNG an toàn cho người Trúc Cơ hậu kỳ (mất > 50% khí huyết / trận) nên quái mới không làm đổi nhịp Luyện Khí / Trúc Cơ (hết Luyện Khí 51 phút, hết Trúc Cơ 2 giờ 47 phút cộng dồn).

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Xích Mãng | 33,407 | 15,885 | 33 | 45% |
| Kim Đan Sơ kỳ | Sương Hồ | 34,746 | 8,592 | 151 | 46% |
| Kim Đan Sơ kỳ | Thạch Quy | 35,131 | 7,617 | 80 | 49% |
| Kim Đan Sơ kỳ | Độc Thiềm | không an toàn solo (97% khí huyết / trận) | – | – | – |
| Kim Đan Trung kỳ | Xích Mãng | 34,502 | 16,433 | 35 | 32% |
| Kim Đan Trung kỳ | Sương Hồ | 39,534 | 9,851 | 173 | 33% |
| Kim Đan Trung kỳ | Thạch Quy | 40,301 | 8,774 | 92 | 35% |
| Kim Đan Trung kỳ | Độc Thiềm | không an toàn solo (70% khí huyết / trận) | – | – | – |
| Kim Đan Hậu kỳ | Xích Mãng | 35,378 | 16,873 | 35 | 24% |
| Kim Đan Hậu kỳ | Sương Hồ | 44,081 | 11,051 | 194 | 24% |
| Kim Đan Hậu kỳ | Thạch Quy | 45,544 | 9,949 | 104 | 26% |
| Kim Đan Hậu kỳ | Độc Thiềm | không an toàn solo (51% khí huyết / trận) | – | – | – |

### 2. Trùm Hắc Giao theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 | Đội 3 so với săn solo tốt nhất |
|---|---:|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | không an toàn (900%) | không an toàn (225%) | không an toàn (100%) | không an toàn (56%) | – |
| Kim Đan Trung kỳ | không an toàn (650%) | không an toàn (163%) | không an toàn (72%) | 60,853 (41%) | – |
| Kim Đan Hậu kỳ | không an toàn (473%) | không an toàn (118%) | không an toàn (53%) | 64,399 (30%) | – |

### 3. Nhịp cả cảnh giới Kim Đan (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

"Tối ưu" = người chơi săn bãi tốt nhất kể cả Xích Mãng; "bãi mới" = không đụng Xích Mãng. Tổng: **3.9 giờ** (tối ưu), **3.9 giờ** (bãi mới); mục tiêu M6 5-7 giờ (QUYET_DINH_M3 mục 30 chủ ý rút còn ~4 giờ: tu vi x2, máu x1,5). Trước M6: 6.4 giờ nhưng nhờ đường tắt (Sơ kỳ 4,1 giờ rồi hai bậc sau ~2,3 giờ).

| Bậc | Thanh | Tối ưu: nguồn | phút | Bãi mới: nguồn | phút |
|---|---:|---|---:|---|---:|
| Kim Đan Sơ kỳ | 48,000 | Thạch Quy | 70.6 | Thạch Quy | 70.6 |
| Kim Đan Trung kỳ | 55,200 | Thạch Quy | 72.3 | Thạch Quy | 72.3 |
| Kim Đan Hậu kỳ | 63,480 | Thạch Quy | 90.9 | Thạch Quy | 90.9 |

### 4. Luân hồi khi cày tới hết Kim Đan (#406)

Cùng mô hình với mục "Luân hồi & Điểm Duyên" (Duyên theo `calcDuyen`, thời gian là nhịp ở mục 3, bãi tốt nhất, hạ 2 trùm; mốc "hết" hạ 3 trùm). `duyenPerStep(3)` được hạ từ **60 xuống 40** (PR shared riêng): ở 60, Duyên / giờ (0 trùm) ở Kim Đan hậu kỳ lên 31.4 (gấp ~1.4x Luyện Khí tầng 5, vượt ngưỡng 1.3x); thanh Kim Đan dài ~5 giờ chứ không 5 lần Trúc Cơ (~2 giờ) nên 12 x 5 trả quá tay.

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |
|---|---:|---:|---:|---:|---:|
| Luyện Khí tầng 5 | 29 | 11 | 23.1 | 17 | **35.8** |
| Luyện Khí tầng 9 | 47 | 21 | 27.0 | 27 | **34.8** |
| Trúc Cơ sơ kỳ | 51 | 23 | 26.8 | 29 | **33.8** |
| Trúc Cơ trung kỳ | 82 | 39 | 28.5 | 45 | **32.9** |
| Trúc Cơ hậu kỳ | 116 | 54 | 27.9 | 60 | **31.0** |
| Hết Trúc Cơ (thanh đầy) | 167 | 69 | 24.8 | 78 | **28.0** |
| Kim Đan sơ kỳ | 167 | 69 | 24.8 | 75 | **27.0** |
| Kim Đan trung kỳ | 238 | 109 | 27.5 | 115 | **29.0** |
| Kim Đan hậu kỳ | 310 | 149 | 28.9 | 155 | **30.0** |
| Hết Kim Đan (thanh đầy) | 401 | 189 | 28.3 | 198 | **29.6** |

Từ Luyện Khí tầng 5 tới hết Kim Đan, Duyên / giờ (0 trùm) nhỏ nhất **23.1** (Luyện Khí tầng 5), lớn nhất **28.9** (Kim Đan hậu kỳ): tỉ lệ **1.25x** (ngưỡng 1.3x, đạt). Mọi mốc Kim Đan nằm trong dải của Luyện Khí / Trúc Cơ nên không có điểm dừng nào đáng cố ý chết.

Tiến trình qua kiếp khi KIẾP NÀO CŨNG cày trọn tới hết Kim Đan (hạ 2 trùm) và dồn Duyên vào Dư âm tu hành:

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi (phút) | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 5 | +50% | 401 | +195 | 46 | **29.2** | 1.00x | Lên nấc 5 (+50%) |
| 2 | Nấc 7 | +70% | 270 | +195 | 46 | **43.4** | 1.49x | Lên nấc 7 (+70%) |
| 3 | Nấc 8 | +80% | 239 | +195 | 76 | **49.0** | 1.68x | Lên nấc 8 (+80%) |
| 4 | Nấc 9 | +90% | 226 | +195 | 36 | **51.7** | 1.77x | Lên nấc 9 (+90%) |
| 5 | Nấc 9 | +90% | 215 | +195 | 231 | **54.5** | 1.87x | Chờ đủ 335 Duyên |
| 6 | Nấc 10 | +100% | 215 | +195 | 91 | **54.5** | 1.87x | Lên nấc 10 (+100%) |
| 7 | Nấc 10 | +100% | 204 | +195 | 286 | **57.3** | 1.96x | Đã đạt tối đa (+100%) |

Duyên / giờ tăng từ **29.2** (kiếp 1) lên **57.3** khi đạt tối đa: **1.96x** (ngưỡng ~2.0x, đạt). Một kiếp tới hết Kim Đan nhận 195 Duyên (so với 75 khi chỉ tới hết Trúc Cơ) vì dài 2.4 lần: cùng Duyên / giờ. Mô hình BỎ QUA nhiệm vụ lặp và phí rèn (không đổi Duyên). Giữ nguyên luật luân hồi đã chốt.

### 5. Đi theo đội ở Kim Đan (#406; KHÔNG đổi quy tắc chia tu vi)

Cùng mô hình với mục "Đi theo đội" (tu vi / giờ MỖI thành viên so với săn solo tốt nhất; trong ngoặc là quái tốt nhất mà đội đủ an toàn đánh, kể cả trùm Hắc Giao).

| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |
|---|---|---:|---:|---:|
| Kim Đan Sơ kỳ | Thạch Quy | 1.20x (Độc Thiềm) | 1.08x (Độc Thiềm) | 0.98x (Độc Thiềm) |
| Kim Đan Trung kỳ | Thạch Quy | 1.13x (Độc Thiềm) | 0.99x (Độc Thiềm) | 1.51x (Hắc Giao) |
| Kim Đan Hậu kỳ | Thạch Quy | 1.07x (Độc Thiềm) | 0.91x (Độc Thiềm) | 1.41x (Hắc Giao) |

Cao nhất **1.51x**, thấp nhất **0.91x**: ở Kim Đan đội 3-4 hạ Hắc Giao được ~1.0-1.2x săn solo (dưới ngưỡng 1.5x của #74, khác Trúc Cơ tới 2.5x), còn đội 2 chậm hơn solo (~0.8x: chưa đủ người hạ trùm, chia tu vi, thời gian tìm quái không rút ngắn). Mô hình này KHÔNG tính đan: mục 9 (mã server thật, có Đại Hồi Huyết Đan) cho thấy đội 2 và cả một người ở Hậu kỳ cũng hạ được trùm. Đây là số đo, câu hỏi chia tu vi của người dùng vẫn chờ; test khoá cận dưới ~0.65x (đội nhỏ chậm hơn solo ở Sơ kỳ là hiện trạng, giống Luyện Khí bậc 6-9, không được xấu thêm).

### 6. Kinh tế Kim Đan: chỗ tiêu Linh thạch so với thu nhập (#406)

Thu nhập theo nhịp "bãi mới" ở mục 3 (săn solo, mỗi bậc một loài tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu của ba bộ (người chơi giữ lại để rèn). Chi: phí rèn `RecipeDef.coin` (mỗi bộ rèn được từ bậc ghi ở cột đầu, tiền trả khi rèn). Cột "Cộng dồn / Phí cộng dồn" so sánh tiền có được tới hết bậc với phí cộng dồn của các bộ mặc được tới bậc kế; tiền có được gồm cả **11,944** Linh thạch kiếm ở Luyện Khí / Trúc Cơ CÙNG kiếp (ví chỉ đặt lại lúc đầu thai và ở đó gần như không có chỗ tiêu); bộ III chỉ mặc được ở Hậu kỳ nên phí của nó tính vào cuối Hậu kỳ. Săn trùm theo đội lấy Giao Lân kiếm ít tiền hơn solo (tiền rơi của trùm chia 4 người: ~2,731 Linh thạch / giờ mỗi người): phần hụt đã trừ vào thu nhập Hậu kỳ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Thạch Quy | 71 | 5,823 | 6,851 | 18,795 | 9,500 | +9,295 |
| Kim Đan Trung kỳ | Thạch Quy | 72 | 6,708 | 8,078 | 26,874 | 31,500 | -4,626 |
| Kim Đan Hậu kỳ | Thạch Quy | 91 | 7,606 | 7,056 | 33,929 | 78,500 | -44,571 |

Chi cho từng bộ (nguyên liệu tính MỖI NGƯỜI; trùm đi theo đội 4 người, mỗi mảnh rơi chung nên cả đội cần 4 lần số lượng):

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
| Bộ I (từ Sơ kỳ) | 3 | 9,500 | 42 Sương mao, 20 Quy giáp | 42.3 | 0.0 | 60% |
| Bộ II (từ Trung kỳ) | 3 | 22,000 | 48 Quy giáp, 20 Độc nang | 51.6 | 0.0 | 71% |
| Bộ III (từ Hậu kỳ) | 3 | 47,000 | 19 Giao lân, 30 Độc nang | 14.7 | 55.0 | 77% |

Tổng phí rèn ba bộ **78,500** Linh thạch so với **33,929** có được từ đầu kiếp tới hết Kim Đan: thiếu 44,571 (~5.9 giờ săn Hậu kỳ sau khi hết Kim Đan). Bộ I mua đủ trong Sơ kỳ (dư 9,295 cuối bậc) và bộ II trong Trung kỳ (thiếu 4,626); bộ III (47,000, 60% tổng phí) là mục tiêu cuối game: người chơi KHÔNG dư hàng vạn Linh thạch không có chỗ tiêu như cảnh báo cũ của mục "Kinh tế Linh thạch", và cũng không bị chặn (thiếu chừng 5.9 giờ). Cột cuối: cày nguyên liệu chiếm tối đa 77% thời gian bậc và các giờ đó vẫn kiếm tu vi, nên nguyên liệu không phải nút cổ chai, tiền mới là.
Đan cấp 2 (`dai_hoi_huyet_dan` / `dai_hoi_linh_dan`, 120 Linh thạch / viên ở Lái buôn Vọng Sương) là chỗ xả TUỲ CHỌN thêm vào: mô hình không tính vì không giả định người chơi uống đan (đả tọa hồi khí huyết). Mô hình cũng bỏ qua nhiệm vụ lặp và phí rèn ở nhịp tu luyện (mục 3), phần Linh thạch / đồ thưởng của nhiệm vụ.

**Qua kiếp.** Bảng trên là kiếp 1 (không Dư âm tu hành). Khi kiếp nào cũng cày tới hết Kim Đan và nâng Dư âm tu hành (mục 4), bậc ngắn lại theo hệ số tốc độ nhưng Linh thạch theo số quái hạ nên KHÔNG tăng, còn `applyRebirth` đưa ví về tối đa `coinCarryCap` (400 khi đủ Kim nang) và túi rỗng:

| Kiếp | Dư âm tu hành | Phút cả kiếp | Linh thạch có được | Rèn đủ phí | Cày nguyên liệu bộ III so với Hậu kỳ |
|---|---:|---:|---:|---|---:|
| 1 | Nấc 5 | 401 | 33,929 | bộ I + II | 77% |
| 2 | Nấc 7 | 270 | 21,131 | bộ I | 115% |
| 3 | Nấc 8 | 239 | 18,241 | bộ I | 130% |
| 4 | Nấc 9 | 226 | 17,228 | bộ I | 138% |
| 5 | Nấc 9 | 215 | 16,321 | bộ I | 146% |
| 6 | Nấc 10 | 215 | 16,321 | bộ I | 146% |
| 7 | Nấc 10 | 204 | 15,505 | bộ I | 153% |

Không kiếp nào trả đủ cả ba bộ (kiếp 1 chỉ tới bộ I + II); từ kiếp 2 trở đi chỉ trả đủ bộ I (kiếp 7: 15,505 Linh thạch, cày nguyên liệu bộ III chiếm 153% Hậu kỳ nên không kịp trong bậc). Đây là CHỦ Ý hay không là câu hỏi cho người dùng (ghi ở `questions.md`): đường giữ đồ là **Ký vật** (3 nấc, tổng 225 Duyên ~ 1.2 kiếp Kim Đan; nấc 3 giữ lại cả ba món đang mặc), nên bộ rèn ở kiếp trước đi theo sang kiếp sau và Linh thạch chỉ cần cho phần còn thiếu; Linh thạch KHÔNG tích lũy qua kiếp (ví về tối đa 400) nên "dư hàng vạn" ở kiếp sau không thành vấn đề tích tụ. Mô hình chưa tính người chơi kiếp sau rèn lại từ đầu (không Ký vật).

### 7. Trang bị: ba bộ tăng sức mạnh đều, không bộ nào bắt buộc hay vô dụng (#406)

Sức mạnh gốc mỗi bộ (kiếm +công, bào +khí huyết, phù +linh lực / tốc): bộ I: công 32, khí huyết 360; bộ II: công 38, khí huyết 425; bộ III: công 44, khí huyết 500. Bảng dưới: tu vi / giờ solo tốt nhất và khí huyết mất mỗi trận khi solo Độc Thiềm (loài đòn nặng nhất) nếu người chơi chỉ có trang bị tới từng bộ.

| Bậc | Trang bị | Tu vi / giờ (loài tốt nhất) | Khí huyết mất / trận (Độc Thiềm) |
|---|---|---:|---:|
| Sơ kỳ | không bộ Kim Đan nào | 6,502 (Hắc Hổ) | 119% |
| Sơ kỳ | tới bộ I | 35,131 (Thạch Quy) | 97% |
| Trung kỳ | không bộ Kim Đan nào | 36,327 (Thạch Quy) | 90% |
| Trung kỳ | tới bộ I | 39,147 (Thạch Quy) | 75% |
| Trung kỳ | tới bộ II | 40,301 (Thạch Quy) | 70% |
| Hậu kỳ | không bộ Kim Đan nào | 40,850 (Thạch Quy) | 67% |
| Hậu kỳ | tới bộ I | 43,431 (Thạch Quy) | 58% |
| Hậu kỳ | tới bộ II | 44,489 (Thạch Quy) | 54% |
| Hậu kỳ | tới bộ III | 45,544 (Thạch Quy) | 51% |

Đọc bảng: tỉ lệ tu vi / giờ giữa không có bộ nào và đủ bộ mặc được là 19% ở Sơ kỳ (19% nếu chỉ săn bãi mới), 90% ở Trung kỳ (90% nếu chỉ săn bãi mới), 90% ở Hậu kỳ (90% nếu chỉ săn bãi mới): không bộ nào BẮT BUỘC cho nhịp (luôn còn loài an toàn, thấp nhất 19%: một số loài chỉ an toàn khi đã có bộ đầu, Xích Mãng ở Sơ kỳ và Độc Thiềm ở Trung kỳ), nhưng mỗi bộ đều làm nhanh hơn và bớt nguy hiểm (khí huyết mất / trận giảm ở mọi hàng): không bộ nào VÔ DỤNG. Ở Hậu kỳ đủ ba bộ nhanh hơn không có bộ nào **11.5%** và bớt ~17 điểm phần trăm khí huyết mất. Bộ III đắt nhất (60% tổng phí) nhưng chỉ thêm ~2.4% tu vi / giờ so với bộ II: giá trị của nó nằm ở sức mạnh (công 44 so với 38, PK và trùm), cố ý là chỗ xả Linh thạch cuối game. Công / khí huyết gốc tăng đều giữa các bộ (+19% / +16% công, +18% / +18% khí huyết).

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
| Kim Đan Sơ kỳ | Sương Hồ | 6.2 | 6.0 | 0.98x | 741 | 900 (56%) | 0.97x |
| Kim Đan Sơ kỳ | Thạch Quy | 25.1 | 24.9 | 0.99x | 780 | 998 (62%) | 1.02x |
| Kim Đan Trung kỳ | Xích Mãng | 8.8 | 8.8 | 1.01x | 614 | 855 (45%) | 1.11x |
| Kim Đan Trung kỳ | Sương Hồ | 5.3 | 5.2 | 1.00x | 631 | 900 (47%) | 1.14x |
| Kim Đan Trung kỳ | Thạch Quy | 21.4 | 21.3 | 0.99x | 665 | 860 (45%) | 1.03x |
| Kim Đan Hậu kỳ | Xích Mãng | 7.5 | 7.6 | 1.02x | 526 | 722 (32%) | 1.10x |
| Kim Đan Hậu kỳ | Sương Hồ | 4.5 | 4.4 | 0.99x | 541 | 750 (34%) | 1.11x |
| Kim Đan Hậu kỳ | Thạch Quy | 18.3 | 18.5 | 1.01x | 570 | 771 (34%) | 1.08x |
| Nguyên Anh Sơ kỳ | Hàn Lang | 6.4 | 6.0 | 0.95x | 1,345 | 1,799 (62%) | 1.07x |
| Nguyên Anh Sơ kỳ | Cốt Tượng | 25.9 | 26.1 | 1.01x | 1,570 | 2,333 (80%) | 1.19x |
| Nguyên Anh Trung kỳ | Hàn Lang | 5.6 | 5.6 | 1.01x | 1,186 | 1,566 (47%) | 1.06x |
| Nguyên Anh Trung kỳ | Phong Nha | 5.4 | 5.2 | 0.97x | 1,340 | 1,854 (56%) | 1.11x |
| Nguyên Anh Trung kỳ | Cốt Tượng | 22.8 | 22.9 | 1.00x | 1,402 | 2,082 (63%) | 1.19x |
| Nguyên Anh Hậu kỳ | Hàn Lang | 4.9 | 4.8 | 0.98x | 1,044 | 1,346 (35%) | 1.03x |
| Nguyên Anh Hậu kỳ | Phong Nha | 4.8 | 4.8 | 1.02x | 1,180 | 1,545 (41%) | 1.05x |
| Nguyên Anh Hậu kỳ | Cốt Tượng | 20.1 | 20.1 | 1.00x | 1,214 | 1,727 (45%) | 1.14x |

**Không đối chiếu 7 ca** mà mô hình coi là KHÔNG an toàn solo (mất > 50% khí huyết mỗi trận; QUYET_DINH_M3 mục 30, máu x1,5): Độc Thiềm (Kim Đan Sơ kỳ), Độc Thiềm (Kim Đan Trung kỳ), Độc Thiềm (Kim Đan Hậu kỳ), Phong Nha (Nguyên Anh Sơ kỳ), Độc Tước (Nguyên Anh Sơ kỳ), Độc Tước (Nguyên Anh Trung kỳ), Độc Tước (Nguyên Anh Hậu kỳ) — người chơi thật đứng đánh một mình ở các ca này là chết, nên "hạ được quái" không còn là phép thử có nghĩa (cần đội).

Thời gian hạ quái khớp mô hình trong **0.92x - 1.02x** (mục tiêu lệch <= ~25%): tốc độ tu vi / giờ và Linh thạch / giờ của mục 1 (phụ thuộc thời gian trận) đáng tin ở phần này. Khí huyết mất của mã thật bằng **0.97x - 1.23x** mô hình không né (mô hình giả định né 20%, nên mã thật không né mất nhiều hơn mô hình 22-54%; phần dư ngoài hệ số né là làm tròn: quái đánh phát đầu ngay khi vào tầm nên số đòn là làm tròn LÊN, rõ nhất ở trận ngắn). Hệ quả: tiêu chí "an toàn" (mất <= 50% khí huyết mỗi trận) dựa trên giả định né; người KHÔNG né mất nhiều hơn số ở mục 1, vd Kim Đan Hậu kỳ Thạch Quy: **34%** thay vì 26%; vẫn sống (đả tọa / đan hồi giữa các trận) nhưng sát ngưỡng khi gặp hai con cùng lúc.

**Trùm Hắc Giao theo đội, mã thật.** Mô hình mục 2 chia sát thương đều cho cả đội (`/ n`); mã thật thì trùm CHỈ đánh một mục tiêu (người nó đã nhắm), nên người bị nhắm chịu gần hết sát thương (cột "Không đan": có người chết ở đội 3 - 4); Đại Hồi Huyết Đan (hồi 70%, hồi chiêu 10 giây, 120 Linh thạch) cứu được. Chính sách như `dungeon.ts` (`ASSUME_DUNGEON`): đứng đánh liên tục, uống đan khi khí huyết dưới 50%. Hai cột đan: mang 8 viên (chính sách của bí cảnh) và đủ đan (30 viên, không còn là giới hạn). 6 trận mỗi ô.

| Bậc | Đội | Không đan | 8 viên / người | Đủ đan (30 viên / người) |
|---|---:|---|---|---|
| Sơ kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 193 giây, 0.0 chết / trận, 19.0 đan |
| Sơ kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 98 giây, 0.8 chết / trận, 8.0 đan | 100% hạ, 96 giây, 0.0 chết / trận, 9.0 đan |
| Sơ kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 64 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 64 giây, 0.0 chết / trận, 6.0 đan |
| Sơ kỳ | 4 | không hạ được (4.0 chết / trận) | 100% hạ, 48 giây, 0.0 chết / trận, 4.3 đan | 100% hạ, 48 giây, 0.0 chết / trận, 4.3 đan |
| Trung kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 164 giây, 0.0 chết / trận, 14.3 đan |
| Trung kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 82 giây, 0.0 chết / trận, 7.0 đan | 100% hạ, 82 giây, 0.0 chết / trận, 7.0 đan |
| Trung kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 54 giây, 0.0 chết / trận, 4.8 đan | 100% hạ, 54 giây, 0.0 chết / trận, 4.8 đan |
| Trung kỳ | 4 | 100% hạ, 52 giây, 2.0 chết / trận | 100% hạ, 40 giây, 0.0 chết / trận, 3.0 đan | 100% hạ, 40 giây, 0.0 chết / trận, 3.0 đan |
| Hậu kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 140 giây, 0.0 chết / trận, 10.7 đan |
| Hậu kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 70 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 70 giây, 0.0 chết / trận, 5.0 đan |
| Hậu kỳ | 3 | 33% hạ, 70 giây, 2.7 chết / trận | 100% hạ, 47 giây, 0.0 chết / trận, 3.0 đan | 100% hạ, 47 giây, 0.0 chết / trận, 3.0 đan |
| Hậu kỳ | 4 | 100% hạ, 39 giây, 1.0 chết / trận | 100% hạ, 35 giây, 0.0 chết / trận, 2.0 đan | 100% hạ, 35 giây, 0.0 chết / trận, 2.0 đan |

**Trùm Thiên Hàn Vương theo đội, mã thật (Nguyên Anh, M7.9).** Cùng cách đo như Hắc Giao: đội cùng bậc đứng cạnh trùm đánh thường liên tục (KHÔNG né: trùm lao và đập đất vòng 140 px đều trúng), uống Thượng Hồi Huyết Đan (hồi 90 %) khi khí huyết dưới 50%, ca khó. Kết quả cùng dạng với Hắc Giao: KHÔNG đan thì Sơ kỳ không đội nào hạ được, Trung / Hậu kỳ chỉ đội 4 (và đội 3 Hậu kỳ một nửa số trận) hạ được mà còn người chết, tức cần đan; với 8 viên đội 2 trở lên hạ được, không ai chết ở cả ba bậc; một người cần đủ đan ở Sơ kỳ (Trung / Hậu kỳ hạ được cả với 8 viên, giống Hắc Giao). Số cuối do M7.9 hiệu chỉnh khi có bot thật (C).

| Bậc | Đội | Không đan | 8 viên / người | Đủ đan (30 viên / người) |
|---|---:|---|---|---|
| Sơ kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 181 giây, 0.0 chết / trận, 14.8 đan |
| Sơ kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 90 giây, 0.0 chết / trận, 9.0 đan | 100% hạ, 90 giây, 0.0 chết / trận, 9.0 đan |
| Sơ kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 59 giây, 0.0 chết / trận, 8.7 đan | 100% hạ, 59 giây, 0.0 chết / trận, 8.7 đan |
| Sơ kỳ | 4 | không hạ được (4.0 chết / trận) | 100% hạ, 44 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 44 giây, 0.0 chết / trận, 6.0 đan |
| Trung kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 159 giây, 0.0 chết / trận, 13.0 đan |
| Trung kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 79 giây, 0.0 chết / trận, 8.0 đan | 100% hạ, 79 giây, 0.0 chết / trận, 8.0 đan |
| Trung kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 52 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 52 giây, 0.0 chết / trận, 6.0 đan |
| Trung kỳ | 4 | không hạ được (4.0 chết / trận) | 100% hạ, 40 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 40 giây, 0.0 chết / trận, 6.0 đan |
| Hậu kỳ | 1 | không hạ được (1.0 chết / trận) | không hạ được (1.0 chết / trận) | 100% hạ, 140 giây, 0.0 chết / trận, 11.0 đan |
| Hậu kỳ | 2 | không hạ được (2.0 chết / trận) | 100% hạ, 70 giây, 0.0 chết / trận, 6.0 đan | 100% hạ, 70 giây, 0.0 chết / trận, 6.0 đan |
| Hậu kỳ | 3 | không hạ được (3.0 chết / trận) | 100% hạ, 46 giây, 0.0 chết / trận, 5.0 đan | 100% hạ, 46 giây, 0.0 chết / trận, 5.0 đan |
| Hậu kỳ | 4 | 100% hạ, 39 giây, 1.8 chết / trận | 100% hạ, 35 giây, 0.0 chết / trận, 4.0 đan | 100% hạ, 35 giây, 0.0 chết / trận, 4.0 đan |

**Vì sao một người hạ được.** Sát thương trùm lên MỘT người (trúng 100%, không né) là **5.8% / 4.9% / 4.2%** khí huyết mỗi giây ở Sơ / Trung / Hậu kỳ, còn đan hồi **7.0%** mỗi giây: ở CẢ BA bậc sát thương < tốc độ hồi nên một người bền vững nếu đủ đan. Trần 8 viên chỉ là giới hạn mang, không phải của luật: ở cột "8 viên" solo Sơ kỳ không hạ được và Trung kỳ hạ được ít, nhưng đủ đan thì hạ được 100%, 0 chết ở mọi bậc.

**Chi phí MỖI NGƯỜI để có 19 Giao Lân (một bộ III).** Đồ rơi của trùm là MỘT chủ (cùng giả định mục 6), nên cả đội cần `số người x 19`, mỗi trận rơi trung bình 3: số trận tăng theo cỡ đội và mỗi trận ngắn lại tương ứng nên **thời gian mỗi người gần như KHÔNG đổi theo cỡ đội**; cái đổi là **số đan** (đủ đan, mỗi người mang theo):

| Bậc | Đội | Giây / trận | Số trận cả đội | Phút mỗi người | Đan mỗi người |
|---|---:|---:|---:|---:|---:|
| Sơ kỳ | 1 | 193 | 6.3 | 20.4 | 120.3 (14,440 Linh thạch) |
| Sơ kỳ | 2 | 96 | 12.7 | 20.4 | 57.0 (6,840 Linh thạch) |
| Sơ kỳ | 3 | 64 | 19.0 | 20.2 | 38.0 (4,560 Linh thạch) |
| Sơ kỳ | 4 | 48 | 25.3 | 20.1 | 27.4 (3,293 Linh thạch) |
| Trung kỳ | 1 | 164 | 6.3 | 17.3 | 90.8 (10,893 Linh thạch) |
| Trung kỳ | 2 | 82 | 12.7 | 17.3 | 44.3 (5,320 Linh thạch) |
| Trung kỳ | 3 | 54 | 19.0 | 17.2 | 30.6 (3,673 Linh thạch) |
| Trung kỳ | 4 | 40 | 25.3 | 17.1 | 19.0 (2,280 Linh thạch) |
| Hậu kỳ | 1 | 140 | 6.3 | 14.8 | 67.6 (8,107 Linh thạch) |
| Hậu kỳ | 2 | 70 | 12.7 | 14.9 | 31.7 (3,800 Linh thạch) |
| Hậu kỳ | 3 | 47 | 19.0 | 14.8 | 19.0 (2,280 Linh thạch) |
| Hậu kỳ | 4 | 35 | 25.3 | 14.7 | 12.7 (1,520 Linh thạch) |

**Hệ số công trùm: không có hệ số chung nào vừa chặn solo vừa giữ đội an toàn.** Nhân công trùm (đủ đan, 4 trận mỗi ô) để bắt buộc đội:

| Công trùm | Hậu kỳ, một người | Hậu kỳ, đội 3 | Hậu kỳ, đội 4 | Sơ kỳ, đội 4 |
|---|---|---|---|---|
| x1 (150) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết |
| x1.4 (210) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 1.0 chết |
| x1.7 (255) | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 0.0 chết | 100%, 2.3 chết |
| x2 (300) | 0% (1.0 chết) | 100%, 1.0 chết | 100%, 0.5 chết | 0% (4.0 chết) |
| x2.5 (375) | 0% (1.0 chết) | 0% (3.0 chết) | 100%, 2.5 chết | 0% (4.0 chết) |

**Nhận định.** Mục tiêu M6 "đội 3-4 người hạ được, không ai chết; một người không hạ nổi" (`PHAN_CONG_M6.md` mục 4): đội 3-4 hạ được và không ai chết khi có đan (đạt); "một người không hạ nổi" **không đạt**: một người hạ được ở mọi bậc nếu đủ đan (Hậu kỳ solo 68 đan ~ 8,107 Linh thạch cho 19 Giao Lân). Đội KHÔNG nhanh hơn theo người (14.8 phút solo so với 14.7 phút đội 4 ở Hậu kỳ); lợi thế của đội là **ít đan hơn ~5.3 lần** (13 so với 68 viên mỗi người), tức 6,587 Linh thạch chênh mỗi bộ III. Tăng công trùm KHÔNG giải được: hệ số đủ chặn solo Hậu kỳ thì đội 4 Sơ kỳ đã có người chết (bảng trên). Chốt cho người dùng (`questions.md` câu 3): giữ nguyên (đội là cách RẺ đan, không phải cách duy nhất), hoặc giảm hiệu lực / kéo dài hồi chiêu Đại Hồi Huyết Đan (đụng cả bí cảnh và PK), hoặc công trùm theo cỡ đội (cần mã mới).

### 10. Thời gian tìm quái (#406 mục 7)

Phần mục 9 không kiểm. `ASSUME.searchSec` (giây từ lúc hạ con này tới lúc chạm con kế tiếp) quyết định tu vi / giờ của MỌI bãi, nhưng trước đây chỉ là con số đoán. Đây là số đo bằng mã server thật (`search-check.ts`): dựng `World` của từng bản đồ (quái sinh bằng `spawnInitial`, hồi sinh bằng `topUpMonsters` mỗi 10 giây, AI quái thật gồm phát hiện + đuổi), một thợ săn bất tử săn đúng một loài: tới con GẦN NHẤT THEO ĐƯỜNG ĐI (Dijkstra trên lưới ô, tránh tường và nước), tới tầm thì đánh `slash` thật. Thời gian tìm = các giây không có con nào trong tầm đánh, tính từ lúc hạ con trước (bỏ 2 lần hạ đầu: đi từ trấn ra bãi). Loài thường: 3 cách rải quái (hạt giống) x 12 lần hạ. Trùm (Xích Mãng, Hắc Giao: chỉ 2-6 con cả bản đồ nên thời gian tìm phụ thuộc mạnh vào chỗ chúng được rải): 12 hạt giống x 6 lần hạ (với 3 hạt giống số Xích Mãng nhiễu: review của B ở #459).

Bốn mức hiểu biết của thợ săn (đo càng thật thì càng chậm): **biết hết bản đồ** (cận dưới tuyệt đối: vị trí mọi con luôn hiện ra) và ba cỡ màn hình thật theo luật `fitZoom` của client (`client/src/gfx/scale.ts`, vùng nhìn CHỮ NHẬT quanh người chơi): **máy tính 1280x720** (1138x640 px), **điện thoại ngang 844x390** (1125x520 px: nhìn rộng gần bằng máy tính, thấp hơn) và **điện thoại dọc 390x844** (508x1100 px: hẹp nhất). Chỉ thấy con trong vùng nhìn; không thấy con nào thì QUÉT: đi (theo đường ngắn nhất) tới ô thô 256 px gần nhất thuộc vùng loài đó sinh ra (độ nguy hiểm đủ, ngoài khu an toàn: người chơi biết quái ở vùng nào) mà chưa nhìn tới trong lượt quét này (nhìn hết một vòng thì quét lại). Lần đầu bản đồ được đo bằng đi ngẫu nhiên (#459): đuôi dài làm số đo nhiễu (một lần lạc 500 giây kéo cả trung bình), nên đổi thành quét có trí nhớ; không còn tung ngẫu nhiên nào ngoài chỗ quái được rải. Mỗi ô: trung bình giây (trung vị).

| Bản đồ | Loài | Số con | Giả định (s) | Biết hết bản đồ | Máy tính 1280x720 (nhìn 1138x640 px) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | Điện thoại dọc 390x844 (nhìn 508x1100 px) |
|---|---|---:|---:|---:|---:|---:|---:|
| Lạc Hà Trấn | Linh Thố | 40 | 6 | 0.8 (0.5) | 0.8 (0.6) | 0.8 (0.6) | 0.9 (0.4) |
| Lạc Hà Trấn | Hôi Lang | 30 | 8 | 2.6 (2.1) | 2.7 (2.0) | 2.3 (1.6) | 2.9 (2.5) |
| Lạc Hà Trấn | Hắc Hổ | 16 | 12 | 2.4 (1.5) | 3.2 (1.9) | 3.5 (1.9) | 4.1 (1.7) |
| Lạc Hà Trấn | Xích Mãng | 2 | 90 | 10.5 (11.5) | 23.1 (17.8) | 23.5 (16.9) | 23.4 (16.4) |
| Hắc Phong Cốc | Hôi Lang | 20 | 8 | 3.8 (3.7) | 4.8 (3.0) | 6.1 (4.5) | 4.5 (3.4) |
| Hắc Phong Cốc | Hắc Hổ | 36 | 12 | 1.9 (1.7) | 2.8 (1.8) | 2.9 (2.1) | 3.3 (1.7) |
| Hắc Phong Cốc | Xích Mãng | 6 | 90 | 3.3 (2.7) | 4.8 (3.3) | 4.7 (3.1) | 5.8 (2.3) |
| Âm Sương Trạch | Sương Hồ | 24 | 10 | 3.6 (2.3) | 3.7 (2.8) | 4.6 (3.9) | 5.2 (3.2) |
| Âm Sương Trạch | Thạch Quy | 18 | 12 | 3.9 (2.4) | 7.2 (2.6) | 6.8 (2.6) | 6.7 (3.0) |
| Âm Sương Trạch | Độc Thiềm | 18 | 14 | 3.2 (2.2) | 5.6 (2.3) | 5.7 (2.3) | 7.8 (4.9) |
| Âm Sương Trạch | Hắc Giao | 6 | 90 | 4.5 (4.2) | 6.1 (4.8) | 7.5 (5.6) | 8.3 (6.3) |
| Hàn Vân Lĩnh | Hàn Lang | 20 | 10 | 3.6 (3.6) | 4.3 (3.2) | 5.9 (4.9) | 5.3 (3.8) |
| Hàn Vân Lĩnh | Phong Nha | 16 | 10 | 4.6 (4.3) | 4.7 (4.8) | 5.4 (5.1) | 6.2 (4.0) |
| Hàn Vân Lĩnh | Cốt Tượng | 12 | 12 | 3.5 (3.3) | 4.9 (4.0) | 5.5 (2.9) | 6.4 (3.2) |
| Hàn Vân Lĩnh | Độc Tước | 12 | 14 | 3.3 (3.1) | 4.1 (2.7) | 5.6 (3.8) | 5.4 (2.9) |
| Hàn Vân Lĩnh | Thiên Hàn Vương | 2 | 90 | 9.6 (9.1) | 26.1 (20.9) | 27.1 (22.1) | 32.2 (26.3) |

- **Mô hình KHÔNG lạc quan:** thợ săn biết hết bản đồ (cận dưới) đo tối đa **0.47x** giả định (ngưỡng #406: mô hình lạc quan nếu > 1.25x). `search-check.test.ts` giữ điều này: ai hạ `ASSUME.searchSec` xuống dưới cận dưới thì test đỏ.
- **Loài thường: giả định nằm trên cận dưới và quanh các mức nhìn thật.** Đo / giả định: 0.14x - 0.60x ở máy tính 1280x720; 0.14x - 0.76x ở điện thoại ngang 844x390; 0.15x - 0.62x ở điện thoại dọc 390x844 (quét theo vùng sinh: người thật có thể khéo hơn nhờ nhớ chỗ quái hay đứng, hoặc vụng hơn vì do dự). Không sửa số nào.
- **Xích Mãng (giả định 90 giây) và Hắc Giao (90 giây) là chỗ nhạy:** Xích Mãng đo 5 - 23 giây ở máy tính 1280x720; 5 - 24 giây ở điện thoại ngang 844x390; 6 - 23 giây ở điện thoại dọc 390x844 (quái thưa: 2 con ở Lạc Hà Trấn, 6 con ở Hắc Phong Cốc); Hắc Giao (6 con) 6 giây ở máy tính 1280x720; 7 giây ở điện thoại ngang 844x390; 8 giây ở điện thoại dọc 390x844.

**Nhịp tu luyện nhạy với giả định này.** Cùng `simulate(3)` như mục "Kim Đan sau nội dung" (một người, quái an toàn nhanh nhất mỗi bậc; "tối ưu" kể cả Xích Mãng, "bãi mới" không đụng Xích Mãng), thay `ASSUME.searchSec` bằng số đo từng mức nhìn (loài ở nhiều bản đồ: lấy bản đồ chậm hơn). Phút cộng dồn tới hết Luyện Khí và Trúc Cơ, rồi phút RIÊNG cảnh giới Kim Đan (mục tiêu: 5-7 giờ):

| Giả định tìm quái | Hết Luyện Khí (cộng dồn) | Hết Trúc Cơ (cộng dồn) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Nguồn nhanh nhất ở Kim Đan (tối ưu) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---:|---:|---:|---:|---|---:|
| Mô hình (giả định hiện tại) | 51 | 167 | 234 (3.9 giờ) | 234 (3.9 giờ) | Thạch Quy | 0.95 / 0.86 / 0.78 |
| Biết hết bản đồ | 27 | 71 | 71 (1.2 giờ) | 165 (2.7 giờ) | Xích Mãng | 2.68 / 2.55 / 2.43 |
| Máy tính 1280x720 (nhìn 1138x640 px) | 28 | 78 | 108 (1.8 giờ) | 165 (2.8 giờ) | Xích Mãng | 1.86 / 1.70 / 1.55 |
| Điện thoại ngang 844x390 (nhìn 1125x520 px) | 28 | 80 | 109 (1.8 giờ) | 177 (2.9 giờ) | Xích Mãng | 1.94 / 1.79 / 1.65 |
| Điện thoại dọc 390x844 (nhìn 508x1100 px) | 29 | 85 | 109 (1.8 giờ) | 183 (3.1 giờ) | Xích Mãng | 2.01 / 1.86 / 1.73 |

Tiêu chí #406 mục 1 ("không nguồn nào vượt ~1,5x bãi mới tốt nhất cùng bậc", cột cuối): mô hình ĐẠT (tối đa 0.95x); biết hết bản đồ KHÔNG ĐẠT (tối đa 2.68x); máy tính 1280x720 KHÔNG ĐẠT (tối đa 1.86x); điện thoại ngang 844x390 KHÔNG ĐẠT (tối đa 1.94x); điện thoại dọc 390x844 KHÔNG ĐẠT (tối đa 2.01x).

**So công bằng: hiệu chỉnh theo độ vụng của loài thường.** Thợ săn là thuật toán (biết loài sống ở vùng nào, đường đi hoàn hảo, không bao giờ dừng), nên mọi số đo ở trên đều nhanh hơn giả định của mô hình; mô hình đã chừa cho người chơi thật một khoảng thời gian tìm quái lớn hơn thợ săn (do dự, đả tọa, nhặt đồ, tranh quái). So Xích Mãng / Hắc Giao với số đo THÔ là so không công bằng (mô hình cho chúng 90 giây, không chừa khoảng ấy). Bảng dưới giữ giả định mô hình cho loài thường và đặt Xích Mãng / Hắc Giao = số đo (bản đồ chậm hơn) cộng độ vụng. Độ vụng chỉ ước lượng được từ các loài thường (trung vị trên 36 dòng: 8 loài x 3 cỡ màn hình, 3 hạt giống) và **dạng của nó là giả thuyết chưa kiểm chứng**, nên cho hai dạng: NHÂN (người chậm gấp k lần thợ săn ở mọi nơi) và CỘNG (người mất thêm b giây cố định mỗi lần tìm). Một hệ số CHUNG cho cả ba cỡ màn hình, vì số đo thô của trùm gần y hệt giữa ba cỡ (Xích Mãng Lạc Hà 23.1 / 23.5 / 23.4 giây) nên hệ số riêng từng cỡ chỉ thêm nhiễu của loài thường. Thật nằm đâu đó giữa hai dạng; **số đo của bot / người (#410) mới phân xử được**.

| Giả thuyết độ vụng | Mức nhìn | Xích Mãng (s, giả định 90) | Hắc Giao (s, giả định 90) | Riêng Kim Đan (tối ưu) | Riêng Kim Đan (bãi mới) | Xích Mãng / bãi mới tốt nhất (Sơ / Trung / Hậu) |
|---|---|---:|---:|---:|---:|---:|
| Nhân (người chậm gấp 2.5x) | Máy tính 1280x720 (nhìn 1138x640 px) | 57 | 15 | 206 (3.4 giờ) | 234 (3.9 giờ) | 1.37 / 1.26 / 1.16 |
| Nhân (người chậm gấp 2.5x) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | 58 | 18 | 209 (3.5 giờ) | 234 (3.9 giờ) | 1.35 / 1.24 / 1.14 |
| Nhân (người chậm gấp 2.5x) | Điện thoại dọc 390x844 (nhìn 508x1100 px) | 58 | 21 | 209 (3.5 giờ) | 234 (3.9 giờ) | 1.36 / 1.24 / 1.14 |
| Cộng (người mất thêm 6 giây) | Máy tính 1280x720 (nhìn 1138x640 px) | 29 | 12 | 124 (2.1 giờ) | 234 (3.9 giờ) | 2.21 / 2.08 / 1.96 |
| Cộng (người mất thêm 6 giây) | Điện thoại ngang 844x390 (nhìn 1125x520 px) | 29 | 13 | 126 (2.1 giờ) | 234 (3.9 giờ) | 2.18 / 2.06 / 1.94 |
| Cộng (người mất thêm 6 giây) | Điện thoại dọc 390x844 (nhìn 508x1100 px) | 29 | 14 | 125 (2.1 giờ) | 234 (3.9 giờ) | 2.19 / 2.06 / 1.95 |

Tiêu chí #406 mục 1 sau hiệu chỉnh (tối đa của ba bậc; ĐẠT khi <= 1,5x), nhân: máy tính 1280x720 1.37x ĐẠT; điện thoại ngang 844x390 1.35x ĐẠT; điện thoại dọc 390x844 1.36x ĐẠT. Cộng: máy tính 1280x720 2.21x KHÔNG ĐẠT; điện thoại ngang 844x390 2.18x KHÔNG ĐẠT; điện thoại dọc 390x844 2.19x KHÔNG ĐẠT. Xích Mãng tìm mỗi 57-58 giây (nhân) hoặc 29 giây (cộng) chứ không phải 90; nhịp Kim Đan "tối ưu" ra 3.4-3.5 giờ (nhân) hoặc 2.1 giờ (cộng), mục tiêu 5-7. Có dòng ĐẠT, có dòng KHÔNG ĐẠT: xem từng dòng ở cột cuối. Lấy bản đồ CHẬM hơn của Xích Mãng (Lạc Hà Trấn, 2 con) là cách nghiêng về phía mô hình: người chơi chọn Hắc Phong Cốc (6 con) sẽ tìm nhanh hơn (số đo thô 4.7-5.8 giây so với 23.1-23.5 giây).

**Ngưỡng hoà vốn cho #410.** Chạy `simulate` với `ASSUME.searchSec.mang` = T (thời gian TÌM: từ lúc hạ con trước tới lúc chạm con kế, KHÔNG gồm trận và đả tọa hồi sức), tiêu chí #406 mục 1 đạt khi T >= **51 giây** (mô hình hiện tại: 90 giây, tối đa 0.95x). Trận + đả tọa hồi sức của Xích Mãng theo mô hình thêm 17.8 / 14.2 / 11.4 giây mỗi con (Sơ / Trung / Hậu kỳ), nên nếu bot đo từ lúc hạ tới lúc hạ con kế (kill-to-kill) thì phải trừ khoảng đó trước khi so với ngưỡng (khoảng 68 / 65 / 62 giây kill-to-kill ở ba bậc). Bot (#410) là thuật toán như thợ săn ở đây, nên so số đo THỜI GIAN TÌM của bot với ngưỡng đó phải trừ độ vụng: bot đo NGẮN hơn ~21 giây (giả thuyết nhân) hoặc ~45 giây (giả thuyết cộng) thì Xích Mãng nhanh quá mức tiêu chí; dài hơn thì đạt.

Đọc bảng: nhịp Kim Đan là hàm của giả định tìm quái. Mô hình ra 3.9 giờ (tối ưu) / 3.9 giờ (bãi mới); thợ săn máy tính 1280x720 1.8 / 2.8 giờ, điện thoại ngang 844x390 1.8 / 2.9 giờ, điện thoại dọc 390x844 1.8 / 3.1 giờ; biết hết bản đồ 1.2 / 2.7 giờ. Phần lớn chênh lệch tới từ Xích Mãng (nguồn nhanh nhất của cả ba bậc ở kịch bản tối ưu: Thạch Quy): giả định 90 giây cho nó là một con số đoán và là cái quyết định nhịp "tối ưu". **Kết luận (chốt trước phát hành 0.2.0, #406 mục 7): GIỮ NGUYÊN `ASSUME.searchSec`, mật độ và EXP Xích Mãng; chấp nhận đường tắt Xích Mãng và theo dõi bằng số liệu thật.** Lý do: (1) số đo là thợ săn thuật toán, không phải người, nên chỉ là cận dưới (mô hình không lạc quan); người chơi chậm hơn bao nhiêu thì không ai biết: hai giả thuyết hiệu chỉnh ở trên cho thời gian TÌM Xích Mãng 57-58 giây (nhân) và 29 giây (cộng), cả hai dưới ngưỡng hoà vốn, tức tiêu chí 1,5x CHƯA đạt ở bãi Xích Mãng và nhịp Kim Đan "tối ưu" ngắn hơn mục tiêu (cột "Riêng Kim Đan (tối ưu)" ở bảng hiệu chỉnh); nhưng nhịp "bãi mới" (người không cày Xích Mãng) vẫn 3.9 giờ, trong mục tiêu 5-7 giờ. (2) Chỉnh mật độ hay EXP Xích Mãng bây giờ là căn theo MỘT trong hai giả thuyết trái nhau, kéo theo chạy lại mô phỏng luân hồi, nhiệm vụ và trang bị ngay trước phát hành: rủi ro cao hơn lợi ích. Bot (`bots.ts`) cũng không phân xử được vì cũng là thuật toán, nên phần "bot săn Kim Đan" của #410 được thay bằng chính phép đo này (thợ săn trong `World` thật, vùng nhìn chữ nhật như client) cùng `hunt-check` (mục 9). (3) Đường tắt đã biết và đã chặn bớt (Tụ Khí Đan trần 300 tu vi mỗi viên, Xích Mãng rơi ít hơn, #403 / #425; ca "tìm nhanh" 30 giây có trong `kim-dan.ts`). **Sau phát hành:** tệp lưu ghi `life.playMs` cùng cảnh giới / bậc; nếu trung vị người chơi hết Kim Đan trong dưới ~4 giờ thì chỉnh ở bản 0.2.x theo thứ tự (a) giảm mật độ / kéo dài hồi sinh Xích Mãng (`shared/`, PR riêng, B review), (b) chỉnh EXP; KHÔNG sửa `ASSUME.searchSec` cho tới khi có số đo người thật. Số hạt giống nhiều hơn (12 cho trùm) và thợ săn khoá mục tiêu / quét vòng đã loại các lần kẹt hàng nghìn giây mô phỏng của bản đầu (#459).

## Nguyên Anh sau nội dung (M7.5 / M7.9)

Tính SỐNG từ `shared/` bằng mô hình ở trên. Quái mới ở Hàn Vân: Hàn Lang (cấp 16, gồng lao), Phong Nha (17, bắn đạn), Cốt Tượng (17, dày, đập đất), Độc Tước (18, đòn nặng + độc), trùm Thiên Hàn Vương (21, đội 3-4 người). Thanh Nguyên Anh 288,000 / 331,200 / 380,880. Thời gian tìm quái lấy theo loài Kim Đan cùng vai (`ASSUME.searchSec`): Hàn Vân thưa hơn Âm Sương nên là cận lạc quan, `search-check.ts` chưa đo Hàn Vân. Mô hình KHÔNG tính chiêu / hệ / trạng thái (chỉ Kiếm chém, như mọi mục trên) và không tính đồ ba ô riêng (`ASSUME.useOwnerGear` tắt; độ nhạy ở mục 5).

### 1. Săn solo (tu vi / giờ, Linh thạch / giờ gồm bán đồ rơi, con / giờ, khí huyết mất / trận)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | Hàn Lang | 198,974 | 23,776 | 150 | 46% |
| Nguyên Anh Sơ kỳ | Phong Nha | không an toàn solo (52% khí huyết / trận) | – | – | – |
| Nguyên Anh Sơ kỳ | Cốt Tượng | 202,666 | 25,045 | 78 | 49% |
| Nguyên Anh Sơ kỳ | Độc Tước | không an toàn solo (97% khí huyết / trận) | – | – | – |
| Nguyên Anh Trung kỳ | Hàn Lang | 221,840 | 26,531 | 167 | 36% |
| Nguyên Anh Trung kỳ | Phong Nha | 248,718 | 32,047 | 163 | 40% |
| Nguyên Anh Trung kỳ | Cốt Tượng | 226,751 | 28,035 | 88 | 38% |
| Nguyên Anh Trung kỳ | Độc Tước | không an toàn solo (75% khí huyết / trận) | – | – | – |
| Nguyên Anh Hậu kỳ | Hàn Lang | 244,902 | 29,313 | 184 | 27% |
| Nguyên Anh Hậu kỳ | Phong Nha | 275,963 | 35,585 | 180 | 31% |
| Nguyên Anh Hậu kỳ | Cốt Tượng | 252,311 | 31,208 | 97 | 29% |
| Nguyên Anh Hậu kỳ | Độc Tước | không an toàn solo (58% khí huyết / trận) | – | – | – |

### 2. Trùm Thiên Hàn Vương theo cỡ đội (tu vi / giờ MỖI người, trong ngoặc khí huyết mất / trận)

| Bậc | 1 người | Đội 2 | Đội 3 | Đội 4 |
|---|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | không an toàn (742%) | không an toàn (186%) | không an toàn (82%) | 351,314 (46%) |
| Nguyên Anh Trung kỳ | không an toàn (574%) | không an toàn (144%) | không an toàn (64%) | 369,631 (36%) |
| Nguyên Anh Hậu kỳ | không an toàn (442%) | không an toàn (110%) | 414,184 (49%) | 387,088 (28%) |

### 3. Nhịp cả cảnh giới Nguyên Anh (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

Tổng: **4.0 giờ** solo; mục tiêu 6-9 giờ (`docs/PHAN_CONG_M7.md` mục 10; QUYET_DINH_M3 mục 30 chủ ý rút còn ~4 giờ: tu vi x2, máu x1,5). Mô hình bỏ qua nhiệm vụ lặp và thời gian đi lại ngoài `ASSUME.questOverheadSec`.

| Bậc | Thanh | Nguồn tốt nhất | Phút |
|---|---:|---|---:|
| Nguyên Anh Sơ kỳ | 288,000 | Cốt Tượng | 73.9 |
| Nguyên Anh Trung kỳ | 331,200 | Phong Nha | 70.6 |
| Nguyên Anh Hậu kỳ | 380,880 | Phong Nha | 96.5 |

### 4. Kinh tế Nguyên Anh: thu nhập so với phí rèn bộ IV

Thu nhập theo nhịp mục 3 (săn solo, mỗi bậc nguồn tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu bộ IV (người chơi giữ lại để rèn). Ví mang vào Nguyên Anh = phần dư cuối Kim Đan (**0** Linh thạch; thiếu thì ví về 0). Cả năm món bộ IV mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu. Săn trùm theo đội lấy Thiên Hàn Châu (vũ khí cần 2) kiếm ít hơn solo (tiền rơi trùm chia 4 người: ~7,471 / 7,861 / 8,233 Linh thạch / giờ mỗi người ở Sơ / Trung / Hậu kỳ): phần hụt đã trừ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Nguyên Anh Sơ kỳ | Cốt Tượng | 74 | 19,765 | 23,036 | 23,036 | 43,500 | -20,464 |
| Nguyên Anh Trung kỳ | Phong Nha | 71 | 21,076 | 24,806 | 47,842 | 43,500 | +4,342 |
| Nguyên Anh Hậu kỳ | Phong Nha | 96 | 23,403 | 37,632 | 85,474 | 43,500 | +41,974 |

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
| Bộ IV (từ Sơ kỳ) | 5 | 43,500 | 38 Hàn Lang mao, 2 Thiên Hàn châu, 22 Tượng cốt, 18 Phong Nha vũ, 6 Độc tước nang | 54.7 | 6.3 | 83% |

Tổng phí rèn bộ IV **43,500** Linh thạch = **2.2 giờ** thu nhập Sơ kỳ (so với Kim Đan: bộ III một mình 47,000 Linh thạch ~ 6.2 giờ thu nhập Hậu kỳ, ba bộ 78,500 ~ 10.3 giờ). Có được 85,474 tới hết Nguyên Anh: dư 41,974. Đan cấp 3 (`thuong_hoi_huyet_dan`, 360 Linh thạch / viên) là chỗ xả TUỲ CHỌN: 55 viên / giờ thu nhập Sơ kỳ.

**Đọc bảng.** Bộ IV trả đủ từ Nguyên Anh Trung kỳ (dư 4,342 cuối bậc; cuối Sơ kỳ còn thiếu 20,464); cày nguyên liệu chiếm tối đa 83% thời gian bậc nên nguyên liệu không phải nút cổ chai, tiền mới là. **CHƯA CHỐT (câu hỏi ở `questions.md`):** vì cả năm món cùng mặc được từ Sơ kỳ (khác Kim Đan: ba bộ rải ba bậc), sau khi rèn xong Linh thạch còn dư **41,974** (1.0x phí bộ IV) tới hết cảnh giới mà chỉ có đan cấp 3 (117 viên) và kho tông môn làm chỗ tiêu: đúng cảnh báo "dư hàng vạn Linh thạch không có chỗ tiêu" của mục "Kinh tế Linh thạch" (Kim Đan thì thiếu 44,571 cuối cảnh giới). Hướng đề xuất: tách bộ IV thành ba bậc (Sơ / Trung / Hậu kỳ, phí tăng dần như Kim Đan) hoặc nâng phí; chưa đổi vì đụng `shared/` (công thức, món đồ, `reqTier`) và phải chờ số đo bot thật của C.

### 5. Độ nhạy với đồ ba ô riêng (`ASSUME.useOwnerGear`)

Mọi mục trên đo với `useOwnerGear = false`: người chơi chỉ mặc ba ô công khai (vũ khí, bào, phù), KHÔNG tính hài, ngọc bội, pháp bảo (M7.4; `OWNER_EQUIP_SLOTS`: hài thêm tốc độ + `guard` giảm sát thương nhận, ngọc bội thêm khí huyết / linh lực / giảm hồi chiêu). Đó là giả định BẢO THỦ (người mới chưa rèn kịp) và là lý do mọi chốt cân bằng cũ vẫn đúng; bật cờ lên làm vài ca "một người không hạ nổi trùm" lệch. Bảng dưới đo SỐNG cả hai cấu hình (mô hình, không tính chiêu / hệ / trạng thái) để thấy mức lệch trước khi quyết có chỉnh số trùm / thanh tu vi hay giữ cờ tắt:

| Chỉ số | Không đồ ô riêng (mặc định) | Có đồ ô riêng |
|---|---:|---:|
| Hết Trúc Cơ (phút cộng dồn; mục tiêu ~180) | 167 | 166 |
| Riêng Kim Đan, bãi mới (giờ; mục tiêu 5-7) | 3.9 | 3.4 |
| Riêng Nguyên Anh (giờ; mục tiêu 6-9) | 4.0 | 3.5 |
| Đội nhỏ nhất đánh Hắc Giao an toàn (Sơ / Trung / Hậu kỳ Kim Đan) | 5 / 4 / 4 | 4 / 4 / 3 |
| Đội nhỏ nhất đánh Thiên Hàn Vương an toàn (Sơ / Trung / Hậu kỳ Nguyên Anh) | 4 / 4 / 3 | 4 / 4 / 3 |
| Khí huyết mất / trận, solo Độc Thiềm Hậu kỳ Kim Đan (%) | 51 | 42 |
| Khí huyết mất / trận, solo Độc Tước Hậu kỳ Nguyên Anh (%) | 58 | 50 |

Đọc bảng: có đồ ô riêng thì nhịp nhanh hơn 1 phút (Trúc Cơ), 0.4 giờ (Kim Đan), 0.5 giờ (Nguyên Anh) và solo bớt 9 / 8 điểm phần trăm khí huyết: mô hình lệch NHỎ. Độ lệch nằm ở các ngưỡng cứng. **Thử bật cờ (A, 15/11/2026): 10 ca đỏ**, chia ba nhóm: (1) mô hình: nhịp Nguyên Anh xuống dưới 6 giờ, Thiên Hàn Vương Sơ kỳ đội 3 đã hạ được (test ghim đội 4), Trúc Cơ cộng dồn lệch 1 phút so với số ghim; (2) mã server thật: bí cảnh (một người hạ được trùm ở bậc 11, thêm đan thì đỡ hơn mức test ghim), `hunt-check` trùm theo đội (Hắc Giao, Thiên Hàn Vương); (3) `search-check`: thợ săn seed 2 không hạ được con nào ở Âm Sương khi tốc độ đổi (thợ săn nhạy với tốc độ, chưa phải lỗi của đồ). Vì vậy giữ cờ **TẮT** (giả định bảo thủ: người mới chưa rèn kịp hài / ngọc bội / pháp bảo); bật thì phải chỉnh cùng lúc số trùm (công / máu), dải bậc bí cảnh và ngưỡng nhịp, chưa làm vì cần số đo bot thật của C để biết người chơi thật mặc bao nhiêu đồ ô riêng ở từng bậc.


## Hóa Thần sau nội dung (D1 #1466 lát A3)

Tính SỐNG từ `shared/` bằng mô hình ở trên. Sáu sói Lang Hoang (`docs/QUAI_HOA_THAN_DE_XUAT.md` mục 3): Dã Lang (cấp 19, gồng lao), Hắc Phong Lang (20, bắn đạn), Huyết Nguyệt Lang (21, gồng lao nhanh), Xích Diễm Lang (21, đòn nặng), Thương Nguyệt Lang (20, dày, đập đất), Ngân Nguyệt Lang (21, đòn nặng nhất). Người chơi mặc bộ V (kiếm / bào / phù, `docs/KHUNG_HOA_THAN.md` mục 4.2). Chưa có trùm (lát B) nên chưa có mục trùm theo đội.

### 1. Săn solo (tu vi / giờ, Linh thạch / giờ gồm bán đồ rơi, con / giờ, khí huyết mất / trận)

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Hóa Thần Sơ kỳ | Dã Lang | 1,149,414 | 79,886 | 171 | 33% |
| Hóa Thần Sơ kỳ | Hắc Phong Lang | 1,309,500 | 71,714 | 151 | 47% |
| Hóa Thần Sơ kỳ | Huyết Nguyệt Lang | không an toàn solo (56% khí huyết / trận) | – | – | – |
| Hóa Thần Sơ kỳ | Xích Diễm Lang | không an toàn solo (78% khí huyết / trận) | – | – | – |
| Hóa Thần Sơ kỳ | Thương Nguyệt Lang | 1,146,341 | 78,335 | 74 | 49% |
| Hóa Thần Sơ kỳ | Ngân Nguyệt Lang | không an toàn solo (126% khí huyết / trận) | – | – | – |
| Hóa Thần Trung kỳ | Dã Lang | 1,262,105 | 87,729 | 187 | 26% |
| Hóa Thần Trung kỳ | Hắc Phong Lang | 1,459,450 | 79,936 | 168 | 37% |
| Hóa Thần Trung kỳ | Huyết Nguyệt Lang | 1,227,633 | 70,219 | 141 | 43% |
| Hóa Thần Trung kỳ | Xích Diễm Lang | không an toàn solo (61% khí huyết / trận) | – | – | – |
| Hóa Thần Trung kỳ | Thương Nguyệt Lang | 1,274,152 | 87,076 | 82 | 38% |
| Hóa Thần Trung kỳ | Ngân Nguyệt Lang | không an toàn solo (97% khí huyết / trận) | – | – | – |
| Hóa Thần Hậu kỳ | Dã Lang | 1,376,112 | 95,664 | 204 | 20% |
| Hóa Thần Hậu kỳ | Hắc Phong Lang | 1,614,371 | 88,432 | 186 | 28% |
| Hóa Thần Hậu kỳ | Huyết Nguyệt Lang | 1,357,198 | 77,642 | 156 | 33% |
| Hóa Thần Hậu kỳ | Xích Diễm Lang | 1,975,264 | 83,961 | 132 | 47% |
| Hóa Thần Hậu kỳ | Thương Nguyệt Lang | 1,412,767 | 96,556 | 91 | 29% |
| Hóa Thần Hậu kỳ | Ngân Nguyệt Lang | không an toàn solo (75% khí huyết / trận) | – | – | – |

### 2. Nhịp cả cảnh giới Hóa Thần (phút; có chuỗi nhiệm vụ hiện có, có đột phá thất bại)

Tổng: **4.0 giờ** solo; mục tiêu ~4,6 giờ theo mô hình khung (`docs/KHUNG_HOA_THAN.md` mục 3), ~4 giờ theo QUYET_DINH_M3 mục 30 (tu vi x2, máu x1,5). Mô hình bỏ qua nhiệm vụ lặp và thời gian đi lại.

| Bậc | Thanh | Nguồn tốt nhất | Phút |
|---|---:|---|---:|
| Hóa Thần Sơ kỳ | 1,728,000 | Hắc Phong Lang | 73.5 |
| Hóa Thần Trung kỳ | 1,987,200 | Hắc Phong Lang | 76.6 |
| Hóa Thần Hậu kỳ | 2,285,280 | Xích Diễm Lang | 91.1 |

### 3. Kinh tế Hóa Thần: thu nhập so với phí rèn bộ V

Thu nhập theo nhịp mục 2 (săn solo, mỗi bậc nguồn tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu bộ V (người chơi giữ lại để rèn). Ví mang vào Hóa Thần = phần dư cuối Nguyên Anh (**41,974** Linh thạch). Cả ba món bộ V mặc được từ Sơ kỳ nên toàn bộ phí đáo hạn ở bậc đầu.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Hóa Thần Sơ kỳ | Hắc Phong Lang | 74 | 52,353 | 64,140 | 106,115 | 79,800 | +26,315 |
| Hóa Thần Trung kỳ | Hắc Phong Lang | 77 | 58,355 | 74,512 | 180,627 | 79,800 | +100,827 |
| Hóa Thần Hậu kỳ | Xích Diễm Lang | 91 | 66,980 | 101,713 | 282,340 | 79,800 | +202,540 |

| Nguyên liệu bộ V | Cần | Cày ở | Phút cày solo |
|---|---:|---|---:|
| Nanh Trăng | 24 | Huyết Nguyệt Lang | 13.6 |
| Hồn Tinh Thiên Lang | 2 | Thương Nguyệt Lang | 16.2 |
| Da Lang Hoang | 18 | Dã Lang | 8.4 |
| Cốt Lang Vương | 14 | Thương Nguyệt Lang | 15.1 |

Tổng phí rèn bộ V **79,800** Linh thạch = **1.5 giờ** thu nhập Sơ kỳ; cày đủ nguyên liệu mất **53.4 phút** solo (**73%** thời gian Sơ kỳ).

**Đọc bảng.** Bộ V trả đủ từ Hóa Thần Sơ kỳ (dư 26,315 cuối bậc). Số khởi đầu: lát B (trùm) và đo lại bằng bot / người chơi thật sẽ chỉnh tiếp.

## Tinh anh (M7.3, `systems/elite.ts`)

Mỗi lần sinh quái thường hiếu chiến (không trùm, không Linh Thố hiền) ở bản đồ thường có 4% là tinh anh, tối đa 3 con cùng lúc mỗi bản đồ: khí huyết x2.5, công x1.5 (trận dài ~3.8x sát thương nhận), tu vi x2, tiền rơi x2, tung bảng rơi đồ thêm một lần. Bảng dưới là CẬN TRÊN theo mô hình (đứng yên chém, không né, không đan, quái trúng 80% số đòn): thời gian hạ (giây, thường / tinh anh) và khí huyết mất mỗi trận (thường / tinh anh) ở bậc chuẩn của từng loài.

| Loài | Bậc chuẩn | Giây hạ (thường / tinh anh) | Khí huyết mất (thường / tinh anh) | Nhận xét |
|---|---|---:|---:|---|
| Hôi Lang | Luyện Khí Tầng 9 | 0.9 / 2.3 | 1% / 6% | an toàn |
| Hắc Hổ | Trúc Cơ Sơ kỳ | 2.8 / 6.9 | 8% / 31% | an toàn |
| Sương Hồ | Kim Đan Sơ kỳ | 6.2 / 15.4 | 46% / 173% | giết người đứng yên |
| Thạch Quy | Kim Đan Sơ kỳ | 25.1 / 62.7 | 49% / 182% | giết người đứng yên |
| Độc Thiềm | Kim Đan Trung kỳ | 8.5 / 21.4 | 70% / 261% | giết người đứng yên |
| Hàn Lang | Nguyên Anh Sơ kỳ | 6.4 / 15.9 | 46% / 173% | giết người đứng yên |
| Phong Nha | Nguyên Anh Sơ kỳ | 6.1 / 15.4 | 52% / 196% | giết người đứng yên |
| Cốt Tượng | Nguyên Anh Sơ kỳ | 25.9 / 64.8 | 49% / 183% | giết người đứng yên |
| Độc Tước | Nguyên Anh Trung kỳ | 9.1 / 22.7 | 75% / 281% | giết người đứng yên |

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
| **Hàn Lang** | 4.9 | 4.8 | 4.8 | 1.9% | 1,371 | 1,371 | 36% | 4.8s | 29% |
| **Phong Nha** | 4.8 | 4.8 | 4.8 | 1.6% | 1,545 | 1,545 | 41% | 4.8s | 33% |
| **Cốt Tượng** | 20.1 | 20.1 | 43.7 | 117.3% | 1,718 | 1,113 (-35%) | 29% | 38.1s | 24% |
| **Độc Tước** | 8.0 | 8.0 | 8.0 | 0.5% | 4,565 | 4,565 | 58% | 8.0s | 60% |

*Giải thích sai số thời gian ở Cốt Tượng (101%):* Trong mô hình, người chơi được giả định đứng yên chém liên tục (20.1s, rất sát với số đo 'Đứng yên 3M' 20.1s). Khi bật hành vi né đòn (`evade: true`), bot thật phải dừng chém và chạy xuyên tâm ra ngoài vòng đập đất r=90px của Cốt Tượng rồi mới áp sát lại chém tiếp, khiến thời gian hạ quái kéo dài lên 43.7s (+101%). Đổi lại, việc né đòn giúp giảm mạnh sát thương nhận vào từ 1,718 xuống 1,113 (-35% sát thương ở Hậu kỳ, giảm tới 59% ở Sơ kỳ), bảo toàn sinh mạng an toàn tuyệt đối.

**Trùm Thiên Hàn Vương theo cỡ đội (Nguyên Anh Hậu kỳ):**

| Cỡ đội | Hạ trùm (3 món công khai) | Đan / người (3 món) | Tử vong (3 món) | Hạ trùm (6 món đủ đồ ô riêng) | Đan / người (6 món) | Tử vong (6 món) |
|---|---:|---:|---:|---:|---:|---:|
| **Đội 4 người** | 45.1s | 0.3 viên | 0/6 trận | 43.6s | 0.3 viên | 0/6 trận |
| **Đội 3 người** | 59.5s | 0.7 viên | 0/6 trận | 62.1s | 0.7 viên | 0/6 trận |

**Thực nghiệm bot thật đánh TINH ANH Hàn Vân Lĩnh (Nguyên Anh Hậu kỳ, M7.10 Refs #511, #510):**

| Loài Tinh Anh | Solo 3M (s / đan) | Tử vong (solo 3M) | Đáy máu (solo 3M) | Solo 6M (đồ ô riêng) | Tử vong (solo 6M) | Đội 2 người (s / đan) | Tử vong (đội 2) | Nhận xét thực nghiệm |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Hàn Lang (Tinh Anh)** | 12.1s (1.0 đan) | 0/6 | 78% | 12.1s (58% máu) | 0/6 | 5.6s (0.5 đan) | 0/6 | Solo an toàn (1.0 đan); đội 2 rất an toàn (5.6s) |
| **Phong Nha (Tinh Anh)** | 12.1s (1.0 đan) | 0/6 | 86% | 12.1s (59% máu) | 0/6 | 6.0s (0.5 đan) | 0/6 | Solo an toàn (1.0 đan); đội 2 rất an toàn (6.0s) |
| **Cốt Tượng (Tinh Anh)** | 173.7s (2.0 đan) | 0/6 | 55% | 132.4s (53% máu) | 0/6 | 36.5s (0.0 đan) | 0/6 | Solo né đập đất liên tục (173.7s); đội 2 rút ngắn còn 36.5s |
| **Độc Tước (Tinh Anh)** | 10.8s (1.0 đan) | 6/6 | 92% | 12.3s (94% máu) | 6/6 | 10.1s (1.0 đan) | 0/6 | Solo tử vong 6/6 (độc dồn nhanh hơn cd đan 12s, mang 8 đan vẫn chết); đội 2 sống sót 100% |

**Đọc bảng & Kết luận thực nghiệm:**
1. **Né đòn cứu mạng rất rõ rệt:** Ở Cốt Tượng và Thiên Hàn Vương, đòn đập đất hình tròn gây lượng sát thương cực lớn. Nhìn vào đối chiếu cột 'ST đứng yên' và 'ST bot né', bot thật né thoát vòng đập đất giúp giảm 35% sát thương nhận vào từ Cốt Tượng và bảo toàn 100% mạng sống của toàn đội khi đánh Thiên Hàn Vương (0/6 trận có người chết ở cả đội 3 và đội 4 người).
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

| Cấp tông | món đã mở | sức mua tối đa / ngày (LT) | giờ săn Phàm Nhân (1.075 LT/h) | giờ săn Luyện Khí (1.377 LT/h) | giờ săn Trúc Cơ (5.036 LT/h) | giờ săn Kim Đan (15.885 LT/h) |
|:-:|--:|--:|--:|--:|--:|--:|
| 1 (Sơ Lập) | 5 | 660 | 0,61 | 0,48 | 0,13 | 0,04 |
| 2 (Tiểu Thành) | 13 | 687 | 0,64 | 0,50 | 0,14 | 0,04 |
| 3 (Trung Hưng) | 16 | 759 | 0,71 | 0,55 | 0,15 | 0,05 |
| 4 (Hưng Vượng) | 23 | 760 | 0,71 | 0,55 | 0,15 | 0,05 |
| 5 (Đỉnh Thịnh) | 28 | 760 | 0,71 | 0,55 | 0,15 | 0,05 |

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
| Trúc Cơ Trung kỳ | 5.060 | 253 | 506 | 3,4 phút (10% thanh) |


## Trùm nhiều chiêu trên DỮ LIỆU THẬT (mục 42, T5 #874)

> Phần này sinh từ `server/src/balance/trum.ts`: chạy bộ thực thi thật (`systems/boss.ts` qua `tickMonsters`) trên `BOSSES` thật nên thêm / sửa trùm là báo cáo đổi theo (chạy lại `npm run can-bang -w server`).
> Mỗi trùm ở bậc "đúng bậc" (`stepOf` = `level` của loài), người chơi mặc đồ tốt nhất, 8 trận (hạt giống 1..8) mỗi cỡ đội. Số liệu là ĐỀ XUẤT; đây chỉ ĐO. Bất biến giữ bằng `bossBalanceViolations` (test `trum.test.ts`).

### 1. Thời gian hạ trùm (đứng yên đánh thường, KHÔNG né: ca khó)

Thời gian thật = giây mô phỏng / 0.6 (né làm đánh chậm đi; `ASSUME_DUNGEON.bossUptime`). Mỗi người mang 8 Hồi Huyết Đan, uống khi khí huyết < 50%. "chiêu" là số chiêu trùm vận trung bình mỗi trận thắng (trận quá ngắn thì bộ chiêu chưa kịp có ý nghĩa); "chết" là số người chết trung bình mỗi trận khi không né.

| Trùm | Bậc người chơi | 1 người | 2 người | 3 người | 4 người |
|---|---|---|---|---|---|
| Xích Mãng | bậc 12 (khí huyết 1.147) | không hạ nổi | 0,2 phút, 2 chiêu (100% thắng, 0 chết) | 0,1 phút, 1,3 chiêu (100% thắng, 0 chết) | 0,1 phút, 0,9 chiêu (100% thắng, 0 chết) |
| Hắc Giao | bậc 15 (khí huyết 2.236) | không hạ nổi | không hạ nổi | 1,6 phút, 14 chiêu (13% thắng, 2,8 chết) | 1,1 phút, 10 chiêu (100% thắng, 1,9 chết) |
| Thiên Hàn Vương | bậc 18 (khí huyết 3.798) | không hạ nổi | không hạ nổi | 1,5 phút, 12,3 chiêu (100% thắng, 0,8 chết) | 1,2 phút, 10 chiêu (100% thắng, 1 chết) |
| Linh Hư Yêu Vương | bậc 9 (khí huyết 620) | không hạ nổi | không hạ nổi | không hạ nổi | 4,6 phút, 46,5 chiêu (100% thắng, 1 chết) |
| Thanh Xà | bậc 7 (khí huyết 476) | 0,6 phút, 3 chiêu (100% thắng, 0 chết) | 0,3 phút, 2 chiêu (100% thắng, 0 chết) | 0,2 phút, 1 chiêu (100% thắng, 0 chết) | 0,1 phút, 1 chiêu (100% thắng, 0 chết) |
| Lang Vương | bậc 22 (khí huyết 8.415) | 1,5 phút, 11 chiêu (100% thắng, 0 chết) | 0,7 phút, 6 chiêu (100% thắng, 0 chết) | 0,5 phút, 4 chiêu (100% thắng, 0 chết) | 0,4 phút, 3 chiêu (100% thắng, 0 chết) |
| Thiên Lang Vương | bậc 24 (khí huyết 11.259) | không hạ nổi | 1,3 phút, 12,4 chiêu (100% thắng, 0 chết) | 0,9 phút, 9,3 chiêu (100% thắng, 0 chết) | 0,7 phút, 6,3 chiêu (100% thắng, 0 chết) |

### 2. Sát thương mỗi đòn và cuồng nộ

Mỗi đòn / khí huyết tối đa của người đúng bậc, hệ số công lớn nhất trong mọi giai đoạn (và cuồng nộ). Thiết kế: <= 55%.

| Trùm | Bộ chiêu | chiêu có sát thương | đòn nặng nhất (sát thương) | cuồng nộ | trận có tới cuồng nộ (1 / 2 / 3 / 4 người) |
|---|---|--:|---|---|---|
| Xích Mãng | 4 chiêu / 2 giai đoạn | 3 | cuon_minh 29% (336) | không có | 0% / 0% / 0% / 0% |
| Hắc Giao | 3 chiêu / 2 giai đoạn | 2 | vuc_xoay 32% (720) | không có | 0% / 0% / 0% / 0% |
| Thiên Hàn Vương | 6 chiêu / 3 giai đoạn | 5 | doi_lao 27% (1.037) | không có | 0% / 0% / 0% / 0% |
| Linh Hư Yêu Vương | 4 chiêu / 3 giai đoạn | 3 | truy_kich 20% (124) | 5 phút (công x1.5) | 0% / 0% / 0% / 0% |
| Thanh Xà | 2 chiêu / 1 giai đoạn | 2 | xau_xa 11% (52) | không có | 0% / 0% / 0% / 0% |
| Lang Vương | 3 chiêu / 1 giai đoạn | 3 | lao_toi 12% (1.026) | 5 phút (công x1.5) | 0% / 0% / 0% / 0% |
| Thiên Lang Vương | 6 chiêu / 3 giai đoạn | 5 | phe_nguyet 26% (2.886) | 5 phút (công x1.5) | 0% / 0% / 0% / 0% |

### 3. Tỉ lệ trúng: bot né hoàn hảo vs bot đứng yên

Bot né: phản xạ 400 ms rồi chạy 150 px/giây (`boss-dodge-bot.ts`, lời hứa công bằng); bot đứng yên ở chỗ XẤU NHẤT của vùng (đối chứng: chiêu phải có ý nghĩa). 4 hạt giống x 30 giây x mọi giai đoạn.

| Trùm | đòn đã đáp (bot né) | trúng bot NÉ (phải 0) | đòn đã đáp (bot đứng yên) | trúng bot ĐỨNG YÊN |
|---|--:|--:|--:|--:|
| Xích Mãng | 59 | 0 | 59 | 59 (100%) |
| Hắc Giao | 46 | 0 | 46 | 46 (100%) |
| Thiên Hàn Vương | 175 | 0 | 176 | 176 (100%) |
| Linh Hư Yêu Vương | 91 | 0 | 92 | 92 (100%) |
| Thanh Xà | 19 | 0 | 19 | 19 (100%) |
| Lang Vương | 27 | 0 | 27 | 27 (100%) |
| Thiên Lang Vương | 141 | 0 | 152 | 152 (100%) |

**Không vi phạm bất biến nào** (mọi đòn <= ngưỡng, bot né hoàn hảo không bị trúng, bot đứng yên bị trúng).


## Trùm thế giới: máu nhân `hpMult` (M9.10 #1029, mục 59)

> Phần này sinh từ `server/src/balance/trum-the-gioi.ts` (chạy bộ thực thi trùm thật `fightBossMoves`, máu = `worldBossHpOf`). Hai cận cho cùng một khung giờ: **né hoàn hảo** (không ai chết; thời gian = máu thật / (số người x DPS mỗi người x 0.6)) và **không né** (đứng đánh thường, uống đan, trùm trúng mọi đòn; chết là chết THẬT ở bản đồ thường). Người chơi thật nằm giữa. DPS mỗi người đo từ đội 5 người hạ trùm ở máu gốc (8 trận đạt). Thưởng (`WorldBossReward` là MỘT quỹ chia theo tỉ lệ đóng góp) quy ra phút săn quái tốt nhất cùng bậc cho một người trong đội 10 người (mục tiêu 12-25; bí cảnh 15-20). Mục tiêu: số người tối thiểu hạ được trong thời lượng là 4-8 (cộng đồng nhỏ vẫn hạ được, không một mình), đội 50 người không dưới 3 phút.

| Khung | Trùm (máu thật) | Bản đồ | Giờ / thời lượng | DPS mỗi người | **Người tối thiểu** | Thưởng một người (đội 10): quỹ -> phút săn (tu vi / Linh thạch) | Né hoàn hảo: 5 / 20 / 50 người | Không né: 5 / 20 / 50 người (thắng, thời gian thật, chết) |
|---|---|---|---|--:|--:|---|---|---|
| han_van_trua | Thiên Hàn Vương x38 (4.674.000 máu) | han_van | 12:00 / 30 ph | 456 | **6** | 69.000 + 51.000 -> 17,4 / 17,2 ph | 34,2 ph / 8,5 ph / 3,4 ph | 0%, 5 chết / 0%, 20 chết / 75% 3,9 ph, 36,5 chết |
| am_suong_toi | Hắc Giao x40 (3.000.000 máu) | am_suong | 21:00 / 30 ph | 290 | **6** | 94.000 + 49.000 -> 17,5 / 17,4 ph | 34,4 ph / 8,6 ph / 3,4 ph | 0%, 5 chết / 0%, 20 chết / 0%, 50 chết |

**Không vi phạm mục tiêu nào.**


## Chặn đường: tỉ lệ chết khi chọn Chiến (mục 52 / 59, CD6 #1066)

> Phần này sinh từ `server/src/balance/chan-duong.ts`: chạy ĐẤU TRƯỜNG THẬT (`createArena` + `tickWorld`, thưởng `payRewards`) trên `AMBUSH_FOES` thật, nên thêm / sửa bầy là báo cáo đổi theo (chạy lại `npm run can-bang -w server`).
> Người chơi đúng bậc `minStep` của bầy (ca khó nhất bầy có thể gặp), mặc đồ tốt nhất đủ bậc, 8 Hồi Huyết Đan (uống khi khí huyết < 50%), đánh thường vào con gần nhất (tiến sát khi ngoài tầm chém; quái tầm xa lùi khi bị áp sát), KHÔNG né, KHÔNG dùng chiêu (ca khó, như bí cảnh); 8 trận (hạt giống 1..8) mỗi bầy. Thời gian thật = giây mô phỏng / uptime (thường và tinh anh 0.8, kẻ cầm đầu 0.6); hết giờ trận 120 giây thật.
> **Thua = chết thật** (mục 53), nên đây là số quyết định có bật `AMBUSH=on` hay không (mục 59). Hai cách chơi đo trên CÙNG một trận: **tới cùng** (không bao giờ bỏ chạy: cận trên tỉ lệ chết) và **biết bỏ chạy** (bấm khi khí huyết < 25%, vận 1 giây không bất khả xâm phạm rồi thoát, trả giá).

### 1. Tỉ lệ chết theo cảnh giới và mức (trung bình các bầy)

| Cảnh giới | Mức | Số bầy | Thắng (tới cùng) | **Chết (tới cùng)** | Thắng / thoát / **chết** (biết bỏ chạy) | Trận thật | Bầy tệ nhất |
|---|---|--:|--:|--:|---|--:|---|
| Phàm Nhân | thường | 1 | 100% | **0%** | 100% / 0% / **0%** | 7 s | lac_ha_soi_le (chết 0%) |
| Luyện Khí | thường | 4 | 100% | **0%** | 100% / 0% / **0%** | 10 s | lac_ha_soi_bay (chết 0%) |
| Luyện Khí | tinh anh | 2 | 100% | **0%** | 100% / 0% / **0%** | 15 s | lac_ha_soi_tinh_anh (chết 0%) |
| Luyện Khí | kẻ cầm đầu | 1 | 100% | **0%** | 100% / 0% / **0%** | 36 s | lac_ha_thanh_xa_chan_loi (chết 0%) |
| Trúc Cơ | thường | 2 | 100% | **0%** | 100% / 0% / **0%** | 9 s | hac_phong_ho_doi (chết 0%) |
| Trúc Cơ | tinh anh | 1 | 100% | **0%** | 100% / 0% / **0%** | 20 s | hac_phong_ho_tinh_anh (chết 0%) |
| Trúc Cơ | kẻ cầm đầu | 1 | 100% | **0%** | 0% / 100% / **0%** | 28 s | hac_phong_yeu_vuong (chết 0%) |
| Kim Đan | thường | 4 | 100% | **0%** | 100% / 0% / **0%** | 23 s | hac_phong_quy_chan (chết 0%) |
| Kim Đan | tinh anh | 2 | 100% | **0%** | 100% / 0% / **0%** | 26 s | hac_phong_ho_tinh_anh_doi (chết 0%) |
| Kim Đan | kẻ cầm đầu | 1 | 100% | **0%** | 100% / 0% / **0%** | 18 s | am_suong_yeu_vuong (chết 0%) |
| Nguyên Anh | thường | 4 | 100% | **0%** | 100% / 0% / **0%** | 16 s | han_van_lang_le (chết 0%) |
| Nguyên Anh | tinh anh | 1 | 100% | **0%** | 100% / 0% / **0%** | 8 s | han_van_soi_tuyet (chết 0%) |
| Nguyên Anh | kẻ cầm đầu | 1 | 100% | **0%** | 100% / 0% / **0%** | 10 s | han_van_yeu_vuong (chết 0%) |

### 2. Từng bầy (ở bậc `minStep`)

"Thắng / chết / hết giờ" là cách tới cùng; "thắng / thoát / chết" là cách biết bỏ chạy. Thưởng = tu vi (`ambushRewardExp`: phút săn của bậc x mức, CD6b) + Linh thạch (`ambushRewardCoin`: cùng khuôn phút săn, CD6b PR2) MỖI trận thắng; giá bỏ chạy giữa trận = tu vi + Linh thạch khi tu vi đang 50% thanh; "ph" là phút săn quái tương đương của thưởng trừ thời gian đánh.

| Bầy | Bản đồ | Bậc | Mức | Kẻ địch | Thắng / chết / hết giờ | Thắng / thoát / chết | Trận thật | Thưởng thắng | Giá bỏ chạy | Tương đương |
|---|---|--:|---|---|---|---|--:|---|---|--:|
| lac_ha_soi_le | lac_ha | 0 | thường | Hôi Lang x1 | 100% / 0% / 0% | 100% / 0% / 0% | 7 s | 120 + 72 | 20 + 54 | 3,8 ph |
| lac_ha_soi_bay | lac_ha | 1 | thường | Hôi Lang x2 | 100% / 0% / 0% | 100% / 0% / 0% | 10 s | 192 + 92 | 140 + 69 | 3,9 ph |
| lac_ha_soi_dan | lac_ha | 3 | thường | Hôi Lang x3 | 100% / 0% / 0% | 100% / 0% / 0% | 11 s | 216 + 108 | 162 + 81 | 3,9 ph |
| lac_ha_ho_le | lac_ha | 5 | thường | Hắc Hổ x1 | 100% / 0% / 0% | 100% / 0% / 0% | 10 s | 236 + 120 | 177 + 90 | 3,8 ph |
| lac_ha_ho_doi | lac_ha | 8 | thường | Hắc Hổ x2 | 100% / 0% / 0% | 100% / 0% / 0% | 8 s | 452 + 272 | 273 + 204 | 3,9 ph |
| lac_ha_soi_tinh_anh | lac_ha | 6 | tinh anh | Hôi Lang x1 | 100% / 0% / 0% | 100% / 0% / 0% | 12 s | 534 + 300 | 225 + 150 | 5,8 ph |
| lac_ha_soi_tinh_anh_doi | lac_ha | 8 | tinh anh | Hôi Lang x2 | 100% / 0% / 0% | 100% / 0% / 0% | 17 s | 678 + 408 | 273 + 204 | 5,7 ph |
| lac_ha_thanh_xa_chan_loi | lac_ha | 7 | kẻ cầm đầu | Thanh Xà x1 | 100% / 0% / 0% | 100% / 0% / 0% | 36 s | 1.070 + 630 | 248 + 189 | 9,4 ph |
| hac_phong_ho_doi | hac_phong | 10 | thường | Hắc Hổ x2 | 100% / 0% / 0% | 100% / 0% / 0% | 9 s | 536 + 336 | 402 + 252 | 3,8 ph |
| hac_phong_ho_ba | hac_phong | 11 | thường | Hắc Hổ x3 | 100% / 0% / 0% | 100% / 0% / 0% | 8 s | 556 + 348 | 417 + 261 | 3,9 ph |
| hac_phong_quy_chan | hac_phong | 13 | thường | Thạch Quy x1 | 100% / 0% / 0% | 100% / 0% / 0% | 32 s | 2.028 + 1.060 | 1.521 + 795 | 3,5 ph |
| hac_phong_ho_tinh_anh | hac_phong | 11 | tinh anh | Hắc Hổ x1 | 100% / 0% / 0% | 100% / 0% / 0% | 20 s | 834 + 522 | 417 + 261 | 5,7 ph |
| hac_phong_ho_tinh_anh_doi | hac_phong | 14 | tinh anh | Hắc Hổ x2 | 100% / 0% / 0% | 100% / 0% / 0% | 28 s | 3.138 + 1.644 | 1.569 + 822 | 5,5 ph |
| hac_phong_yeu_vuong | hac_phong | 11 | kẻ cầm đầu | Xích Mãng x1 | 100% / 0% / 0% | 0% / 100% / 0% | 28 s | 1.390 + 870 | 417 + 261 | -3,5 ph |
| am_suong_ho_suong | am_suong | 13 | thường | Sương Hồ x1 | 100% / 0% / 0% | 100% / 0% / 0% | 12 s | 2.028 + 1.060 | 1.521 + 795 | 3,8 ph |
| am_suong_quy_le | am_suong | 13 | thường | Thạch Quy x1 | 100% / 0% / 0% | 100% / 0% / 0% | 32 s | 2.028 + 1.060 | 1.521 + 795 | 3,5 ph |
| am_suong_thiem_doc | am_suong | 15 | thường | Độc Thiềm x1 | 100% / 0% / 0% | 100% / 0% / 0% | 15 s | 2.144 + 1.124 | 1.608 + 843 | 3,8 ph |
| am_suong_ho_tinh_anh | am_suong | 14 | tinh anh | Hắc Hổ x2 | 100% / 0% / 0% | 100% / 0% / 0% | 23 s | 3.138 + 1.644 | 1.569 + 822 | 5,6 ph |
| am_suong_yeu_vuong | am_suong | 13 | kẻ cầm đầu | Xích Mãng x1 | 100% / 0% / 0% | 100% / 0% / 0% | 18 s | 5.070 + 2.650 | 1.521 + 795 | 9,7 ph |
| han_van_lang_le | han_van | 16 | thường | Hàn Lang x1 | 100% / 0% / 0% | 100% / 0% / 0% | 8 s | 2.208 + 1.164 | 1.656 + 873 | 3,9 ph |
| han_van_lang_doi | han_van | 18 | thường | Hàn Lang x2 | 100% / 0% / 0% | 100% / 0% / 0% | 14 s | 1.584 + 1.188 | 1.188 + 891 | 3,8 ph |
| han_van_tuong_xuong | han_van | 17 | thường | Cốt Tượng x1 | 100% / 0% / 0% | 100% / 0% / 0% | 29 s | 1.900 + 1.176 | 1.425 + 882 | 3,5 ph |
| han_van_nha_gio | han_van | 16 | thường | Phong Nha x1 | 100% / 0% / 0% | 100% / 0% / 0% | 12 s | 2.208 + 1.164 | 1.656 + 873 | 3,8 ph |
| han_van_soi_tuyet | han_van | 16 | tinh anh | Hôi Lang x3 | 100% / 0% / 0% | 100% / 0% / 0% | 8 s | 3.312 + 1.746 | 1.656 + 873 | 5,9 ph |
| han_van_yeu_vuong | han_van | 16 | kẻ cầm đầu | Xích Mãng x1 | 100% / 0% / 0% | 100% / 0% / 0% | 10 s | 5.520 + 2.910 | 1.656 + 873 | 9,8 ph |

### 3. Tu vi / phút so với săn quái

Khoảng giữa hai lần bị chặn ước tính 14,7 phút (hồi tối thiểu 8 phút + quãng đi bộ tới lần tung trúng kế, 50% thời gian đi bộ). Tu vi / phút tăng thêm so với chỉ săn quái, trộn theo `AMBUSH_TIER_WEIGHTS` (thường 70 / tinh anh 25 / kẻ cầm đầu 5): **29%** (mục tiêu 20%-40%, không hơn bí cảnh). Chưa tính đồ rơi và sách chiêu (chưa có: `AMBUSH_LOOT`).

Theo từng cảnh giới (thưởng và giá tính bằng phút săn của bậc, nên các hàng gần nhau; lệch nhiều là do bầy / tỉ lệ thắng của cảnh giới đó):

| Cảnh giới | Thường | Tinh anh | Kẻ cầm đầu | **Trộn** |
|---|--:|--:|--:|--:|
| Phàm Nhân | 26% | - | - | **26%** |
| Luyện Khí | 26% | 38% | 62% | **31%** |
| Trúc Cơ | 26% | 38% | -23% | **26%** |
| Kim Đan | 24% | 37% | 65% | **29%** |
| Nguyên Anh | 25% | 40% | 66% | **31%** |

Giá bỏ chạy bằng tu vi: 2 phút (hộp thoại) / 3 phút (giữa trận); thưởng tu vi thắng: thường 4 phút / tinh anh 6 phút / kẻ cầm đầu 10 phút (phút săn của bậc người chơi; bảng tu vi / phút săn `AMBUSH_HUNT_EXP_PER_MIN` sinh từ mô phỏng). Giá bị kẹp bởi tu vi đang có trong thanh (không bao giờ rớt cảnh giới).

### 4. Độ nhạy theo giả định (Hồi Huyết Đan, đồ)

Bảng 1-3 đo ở giả định CHUẨN (8 đan + đồ tốt nhất đủ bậc). Người chơi thật thường mang ít đan hơn hoặc chưa lên đồ, nên bảng này đo lại CÙNG 25 bầy (ở bậc `minStep`, mỗi bầy 48 trận, hạt giống 1..48: ít nhiễu hơn bảng 1-3 vốn 8 trận) với từng tổ hợp số đan x có đồ hay không. "Chết / lần" là tỉ lệ chết MỖI lần bị chặn, trộn theo `AMBUSH_TIER_WEIGHTS` (thường 70 / tinh anh 25 / kẻ cầm đầu 5); "chết >= 1 lần / ngày" là xác suất chết ít nhất một lần trong 12 lần chặn (mức tối đa mỗi ngày, các lần độc lập: 1 - (1 - p)^12), tới cùng / biết bỏ chạy. Cách "tới cùng" là cận TRÊN của tỉ lệ chết; cách "biết bỏ chạy" của mô hình bấm Bỏ chạy ĐÚNG lúc khí huyết < 25% rồi sống qua giây vận nên là cận DƯỚI (người chơi thật nằm giữa: bấm trễ hoặc không bấm); cái giá của cận dưới là cột "Thoát / lần" (mỗi lần thoát trả tu vi hoặc Linh thạch). Thua = chết thật nên con số "chết >= 1 lần / ngày" đáng chú ý hơn tỉ lệ từng lần.

| Đồ | Hồi Huyết Đan | Chết / lần (tới cùng) | Chết / lần (biết bỏ chạy) | Thoát / lần (biết bỏ chạy) | Chết >= 1 lần / ngày (tới cùng / biết bỏ chạy) | Bầy thắng dưới mục tiêu | Bầy chết nhiều nhất (tới cùng) |
|---|--:|--:|--:|--:|---|--:|---|
| đồ tốt nhất đủ bậc | 8 (chuẩn) | 0% | 0% | 1,4% | 0% / 0% | 0 / 25 | lac_ha_soi_le (chết 0%) |
| đồ tốt nhất đủ bậc | 2 (thận trọng) | 0% | 0% | 1,4% | 0% / 0% | 0 / 25 | lac_ha_soi_le (chết 0%) |
| đồ tốt nhất đủ bậc | 0 | 15,9% | 0% | 31,8% | 87% / 0% | 5 / 25 | hac_phong_yeu_vuong (chết 100%) |
| KHÔNG đồ | 8 | 13,6% | 0% | 28,7% | 83% / 0% | 4 / 25 | hac_phong_yeu_vuong (chết 100%) |
| KHÔNG đồ | 2 | 13,6% | 0% | 28,7% | 83% / 0% | 4 / 25 | hac_phong_yeu_vuong (chết 100%) |
| KHÔNG đồ | 0 | 45,2% | 0% | 63% | 100% / 0% | 13 / 25 | lac_ha_soi_tinh_anh_doi (chết 100%) |

Giả định thận trọng (2 đan + đồ đúng bậc) LÀ chuẩn để quyết bật `AMBUSH` (A chốt 22/11): **không bầy nào vi phạm** (chết <= 5%, thắng >= mục tiêu của mức).

**Không vi phạm bất biến nào** (mọi bầy thắng >= 90% thường / 80% tinh anh / 60% kẻ cầm đầu, giá bỏ chạy và thời gian trận xem cảnh báo bên dưới).

Cảnh báo (không chặn):

- bầy lac_ha_soi_le: trận 7 giây (khung 30-70 giây)
- bầy lac_ha_soi_bay: trận 10 giây (khung 30-70 giây)
- bầy lac_ha_soi_dan: trận 11 giây (khung 30-70 giây)
- bầy lac_ha_ho_le: trận 10 giây (khung 30-70 giây)
- bầy lac_ha_ho_doi: trận 8 giây (khung 30-70 giây)
- bầy lac_ha_soi_tinh_anh: trận 12 giây (khung 30-70 giây)
- bầy lac_ha_soi_tinh_anh_doi: trận 17 giây (khung 30-70 giây)
- bầy hac_phong_ho_doi: trận 9 giây (khung 30-70 giây)
- bầy hac_phong_ho_ba: trận 8 giây (khung 30-70 giây)
- bầy hac_phong_ho_tinh_anh: trận 20 giây (khung 30-70 giây)
- bầy hac_phong_ho_tinh_anh_doi: trận 28 giây (khung 30-70 giây)
- bầy hac_phong_yeu_vuong: trận 28 giây (khung 30-70 giây)
- bầy am_suong_ho_suong: trận 12 giây (khung 30-70 giây)
- bầy am_suong_thiem_doc: trận 15 giây (khung 30-70 giây)
- bầy am_suong_ho_tinh_anh: trận 23 giây (khung 30-70 giây)
- bầy am_suong_yeu_vuong: trận 18 giây (khung 30-70 giây)
- bầy han_van_lang_le: trận 8 giây (khung 30-70 giây)
- bầy han_van_lang_doi: trận 14 giây (khung 30-70 giây)
- bầy han_van_tuong_xuong: trận 29 giây (khung 30-70 giây)
- bầy han_van_nha_gio: trận 12 giây (khung 30-70 giây)
- bầy han_van_soi_tuyet: trận 8 giây (khung 30-70 giây)
- bầy han_van_yeu_vuong: trận 10 giây (khung 30-70 giây)


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


## DPS thật của mọi chiêu học được (CT10, #1055)

> Chạy trong `World` thật (`cast` + `tickWorld`: bẫy / vùng / tượng / đạn bay / chiêu vận đúng như máy chủ), 30 giây mỗi lần đo, người chơi đúng cảnh giới yêu cầu của chiêu, linh lực hồi 20/giây, bù nhìn "lang" đứng yên cách 40 px (một, hoặc ba dàn hàng ngang cách 40 px). **Tỉ lệ** = sát thương bù nhìn mất khi luân phiên chiêu so với CHỈ chém thường cùng bố trí (chiêu thủ / hồi / tăng ích ~1 hoặc thấp hơn vì mất lượt chém). Số có hạt giống, ổn định. Mã: `server/src/balance/skills-dps.ts`.

### Luyện Khí (20 chiêu)
| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |
|---|---|---|---|---:|---:|---:|---:|
| **Hỏa Vân Kiếm** | hoa | cone | sát thương | 3.0s | 0.027 | 1.25× | 1.26× |
| **Bôn Thạch Quyền** | tho | cone | sát thương | 3.5s | 0.023 | 1.23× | 1.24× |
| **Ưng Trảo** | kim | cone | sát thương | 2.5s | 0.024 | 1.20× | 1.25× |
| **Trọng Nhạc Trảm** | tho | cone | sát thương | 3.0s | 0.027 | 1.22× | 1.25× |
| **Huyền Băng Chỉ** | bang | line | sát thương | 2.5s | 0.028 | 1.23× | 1.26× |
| **Kim Chung Tráo** | kim | self | thủ | 9.0s | 0.013 | 0.96× | 1.04× |
| **Hồi Xuân** | thuy | self | hồi | 8.0s | 0.022 | 0.96× | 1.04× |
| **Phiêu Phong Bộ** | phong | dash | thủ | 3.0s | 0.017 | 0.96× | 1.04× |
| **Kim Thoa Xuyên Tâm** | kim | bolt | sát thương | 3.0s | 0.020 | 1.17× | 1.20× |
| **Thiết Sa Chưởng** | tho | cone | sát thương | 3.0s | 0.020 | 1.25× | 1.24× |
| **Hủ Thủy Kình** | thuy | cone | sát thương | 3.0s | 0.020 | 1.25× | 1.27× |
| **Triền Xà Tỏa Hầu** | moc | cone | sát thương | 3.0s | 0.020 | 1.16× | 1.19× |
| **Liệt Diễm Chưởng** | hoa | cone | sát thương | 3.0s | 0.020 | 1.25× | 1.22× |
| **Xích Viêm** | hoa | cone | sát thương | 3.0s | 0.020 | 1.22× | 1.24× |
| **Chúc Ảnh Dao Hồng** | hoa | cone | khống chế | 4.0s | 0.018 | 1.15× | 1.29× |
| **Hỏa Dược Nổ** | hoa | cone | sát thương | 3.0s | 0.017 | 1.15× | 1.14× |
| **Quỷ Hỏa Phệ Hồn** | hoa | cone | sát thương | 3.0s | 0.020 | 1.20× | 1.18× |
| **Huyết Ảnh Xuyên Tâm** | none | line | sát thương | 3.0s | 0.020 | 1.22× | 1.25× |
| **Thực Hồn Nhất Chỉ** | am | cone | sát thương | 3.0s | 0.020 | 1.20× | 1.17× |
| **Quỷ Ảnh Mê Tung** | phong | self | thủ | 3.0s | 0.020 | 0.96× | 1.04× |

Chiêu gây sát thương: trung vị **1.22×**, cao nhất **1.25×** (1 mục tiêu).

### Trúc Cơ (22 chiêu)
| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |
|---|---|---|---|---:|---:|---:|---:|
| **Thanh Tùng Phi Châm** | moc | line | sát thương | 3.0s | 0.033 | 1.26× | 1.24× |
| **Lạc Tuyết Phân Phi** | bang | fan | khống chế | 3.5s | 0.029 | 1.24× | 1.25× |
| **Cửu Cung Khốn Sát** | tho | ground | khống chế | 7.0s | 0.020 | 1.11× | 1.28× |
| **Mê Tung Bộ** | phong | self | thủ | 8.0s | 0.013 | 0.95× | 1.04× |
| **Thanh Vân Kiếm Khí** | kim | line | sát thương | 3.0s | 0.023 | 1.27× | 1.25× |
| **Bàn Thạch Hộ Thể** | tho | self | thủ | 9.0s | 0.013 | 0.95× | 1.04× |
| **Thực Giáp Phi Tán** | kim | cone | sát thương | 3.5s | 0.029 | 1.25× | 1.28× |
| **Hắc Sa Chưởng** | moc | cone | sát thương | 3.0s | 0.023 | 1.24× | 1.26× |
| **Âm Thi Độc Chưởng** | thuy | cone | sát thương | 3.0s | 0.023 | 1.31× | 1.30× |
| **Thiềm Tô Liệu Thương** | moc | self | hồi | 5.0s | 0.014 | 0.95× | 1.04× |
| **Mê Hồn Hương** | moc | cone | khống chế | 5.0s | 0.020 | 1.14× | 1.14× |
| **Thái Hoa Bổ Nguyên** | thuy | self | hồi | 7.0s | 0.014 | 0.95× | 1.04× |
| **Ma Trảo Phệ Huyết** | hoa | cone | sát thương | 3.0s | 0.033 | 1.26× | 1.28× |
| **Hàn Băng Nhất Chưởng** | bang | cone | khống chế | 3.0s | 0.023 | 1.21× | 1.23× |
| **Minh Ảnh Phúc Chưởng** | am | cone | khống chế | 3.0s | 0.023 | 1.21× | 1.23× |
| **Sư Tử Hống** | none | cone | khống chế | 4.5s | 0.018 | 1.14× | 1.35× |
| **Cầm Long Khấu** | none | cone | khống chế | 5.0s | 0.016 | 1.14× | 1.17× |
| **Lôi Hỏa Chưởng** | loi | cone | sát thương | 3.0s | 0.020 | 1.26× | 1.28× |
| **Tịch Dạ Phân Ảnh** | am | fan | sát thương | 3.0s | 0.033 | 1.17× | 1.20× |
| **Hàn Giao Tiễn** | bang | bolt | khống chế | 3.0s | 0.020 | 1.19× | 1.21× |
| **Lôi Âm** | loi | ground | sát thương | 5.0s | 0.012 | 1.13× | 1.14× |
| **Độc Đằng Phục** | moc | trap | sát thương | 8.0s | 0.013 | 1.19× | 1.22× |

Chiêu gây sát thương: trung vị **1.21×**, cao nhất **1.31×** (1 mục tiêu).

### Kim Đan (20 chiêu)
| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |
|---|---|---|---|---:|---:|---:|---:|
| **Thu Thủy Kiếm Ảnh** | kim | cone | sát thương | 5.0s | 0.020 | 1.14× | 1.21× |
| **Liệt Địa Nhất Quyền** | tho | ground | sát thương | 5.0s | 0.020 | 1.15× | 1.13× |
| **Phân Nhạc Trảm** | tho | cone | sát thương | 5.0s | 0.020 | 1.12× | 1.16× |
| **Đoạn Trường Chỉ** | moc | line | sát thương | 5.0s | 0.020 | 1.16× | 1.26× |
| **Khô Mộc Phùng Xuân** | moc | self | hồi | 7.0s | 0.014 | 0.95× | 1.04× |
| **Cổ Nhập Huyết Mạch** | thuy | line | sát thương | 5.0s | 0.040 | 1.14× | 1.16× |
| **Tỏa Long Cầm Nã** | thuy | cone | khống chế | 5.0s | 0.020 | 1.10× | 1.16× |
| **Xích Tước Phù** | hoa | cone | sát thương | 5.0s | 0.020 | 1.11× | 1.19× |
| **Huyết Trảo Phá Mạch** | none | cone | sát thương | 5.0s | 0.020 | 1.16× | 1.25× |
| **Phật Hỏa Hàng Ma** | hoa | cone | sát thương | 5.0s | 0.030 | 1.13× | 1.19× |
| **Lôi Đình Nhất Miết** | loi | line | sát thương | 5.0s | 0.018 | 1.12× | 1.15× |
| **Hồi Phong Liên Chưởng** | phong | cone | sát thương | 3.0s | 0.033 | 1.20× | 1.18× |
| **Hóa Huyết Phệ Nguyên** | none | cone | sát thương | 5.0s | 0.020 | 1.16× | 1.27× |
| **Thực Phách Âm Trảo** | am | cone | sát thương | 5.0s | 0.020 | 1.13× | 1.11× |
| **Âm Phong Quyển Hồn** | phong | fan | khống chế | 7.0s | 0.017 | 1.11× | 0.95× |
| **Hàn Sương Phong Mạch** | bang | trap | khống chế | 9.0s | 0.017 | 1.12× | 1.15× |
| **Tử Điện Xuyên Vân** | loi | bolt | sát thương | 5.0s | 0.036 | 1.11× | 1.15× |
| **Phi Kiếm Tam Liên** | kim | bolt | sát thương | 5.5s | 0.024 | 1.17× | 1.24× |
| **Liệt Diễm Trận** | hoa | zone | sát thương | 8.0s | 0.020 | 1.13× | 1.18× |
| **Liên Châu Lôi** | loi | chain | khống chế | 4.5s | 0.031 | 1.13× | 1.12× |

Chiêu gây sát thương: trung vị **1.13×**, cao nhất **1.20×** (1 mục tiêu).

### Nguyên Anh (25 chiêu)
| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |
|---|---|---|---|---:|---:|---:|---:|
| **Hàn Quang Tiễn** | bang | line | khống chế | 3.0s | 0.037 | 1.33× | 1.31× |
| **Bạch Kim Trảo** | kim | cone | sát thương | 3.2s | 0.037 | 1.40× | 1.43× |
| **Vân Thạch Trận** | tho | ground | khống chế | 7.0s | 0.023 | 1.16× | 1.34× |
| **Băng Hoa Loạn** | bang | fan | khống chế | 3.8s | 0.034 | 1.25× | 1.28× |
| **Liệt Hỏa Kiếm** | hoa | cone | sát thương | 3.5s | 0.040 | 1.37× | 1.51× |
| **Vân Hành Bộ** | phong | self | tăng ích | 8.0s | 0.015 | 0.95× | 1.04× |
| **Vạn Kiếm Quy Tông** | kim | fan | sát thương | 5.0s | 0.034 | 1.19× | 1.25× |
| **Chướng Vụ Phong Lâm** | tho | cone | sát thương | 5.5s | 0.036 | 1.11× | 1.29× |
| **Mạn Đà Hoa Vũ** | moc | cone | sát thương | 7.0s | 0.029 | 1.18× | 1.19× |
| **Huyết Ti Phược Thân** | thuy | cone | khống chế | 7.0s | 0.021 | 1.11× | 1.16× |
| **Nộ Đào Bài Không** | thuy | cone | sát thương | 5.0s | 0.030 | 1.13× | 1.11× |
| **Phượng Minh Cầu Hoàng** | hoa | cone | khống chế | 7.0s | 0.021 | 1.14× | 1.34× |
| **Bạch Cốt Hồng Nhan** | none | cone | khống chế | 9.0s | 0.014 | 1.17× | 1.19× |
| **Nhiếp Hồn Đoạt Phách** | none | cone | khống chế | 9.0s | 0.016 | 1.11× | 1.15× |
| **Huyết Mang Phá Giáp** | hoa | cone | sát thương | 5.0s | 0.032 | 1.14× | 1.23× |
| **Thiên La Lôi Cấm** | loi | ground | sát thương | 4.5s | 0.036 | 1.17× | 1.20× |
| **Chưởng Tâm Lôi Bạo** | loi | cone | sát thương | 5.0s | 0.034 | 1.17× | 1.15× |
| **Bách Thú Khiếu Phong** | phong | self | hồi | 7.0s | 0.023 | 0.95× | 1.04× |
| **Minh Vũ Lạc Hồn** | am | fan | sát thương | 5.0s | 0.032 | 1.21× | 1.27× |
| **Long Tượng Hộ Thể** | none | self | thủ | 7.0s | 0.023 | 0.95× | 1.04× |
| **Âm Lôi Chấn Hồn** | loi | fan | sát thương | 5.0s | 0.028 | 1.12× | 1.18× |
| **Khô Mạch Đoạn Lưu** | am | cone | sát thương | 5.0s | 0.030 | 1.11× | 1.22× |
| **Băng Phách Xuyên Tâm** | bang | bolt | khống chế | 5.0s | 0.040 | 1.12× | 1.16× |
| **Hồn Phiên Tượng** | am | totem | khống chế | 12.0s | 0.017 | 1.13× | 1.18× |
| **Phá Sơn Nhất Kích** | tho | ground | khống chế | 9.0s | 0.022 | 1.17× | 1.51× |

Chiêu gây sát thương: trung vị **1.17×**, cao nhất **1.40×** (1 mục tiêu).

### Hóa Thần (3 chiêu)
| Chiêu | Hệ | Hình | Vai | Hồi chiêu | Linh lực / giây | Tỉ lệ (1 mục tiêu) | Tỉ lệ (3 mục tiêu) |
|---|---|---|---|---:|---:|---:|---:|
| **Xích Luyện Đoạn Hồn** | hoa | cone | sát thương | 5.5s | 0.025 | 1.24× | 1.49× |
| **Tâm Kiếm Vô Hình** | kim | line | sát thương | 4.5s | 0.027 | 1.32× | 1.31× |
| **Thái Sơn Áp Đỉnh** | tho | ground | khống chế | 7.5s | 0.020 | 1.16× | 1.19× |

Chiêu gây sát thương: trung vị **1.24×**, cao nhất **1.32×** (1 mục tiêu).
