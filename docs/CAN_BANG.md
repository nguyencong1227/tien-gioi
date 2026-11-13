# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ `server/src/balance/simulate.ts`. Sửa số liệu trong `shared/` rồi chạy
> `npm run can-bang -w server` để cập nhật. Test `server/src/balance/simulate.test.ts` giữ đường cong trong mục tiêu.

## Kết quả

- Hết Luyện Khí (sẵn sàng Trúc Cơ): **53 phút** (mục tiêu ~1 giờ)
- Hết Trúc Cơ (sẵn sàng Kim Đan): **2 giờ 52 phút** (mục tiêu ~3 giờ)

| Bậc | Thanh tu vi | Săn gì | Số quái | Phút ở bậc này | Cộng dồn |
|---|---:|---|---:|---:|---:|
| Phàm Nhân | 40 | tho | 10 | 1.4 | 9 phút |
| Luyện Khí Tầng 1 | 280 | lang | 19 | 4.5 | 14 phút |
| Luyện Khí Tầng 2 | 308 | lang | 22 | 4.8 | 19 phút |
| Luyện Khí Tầng 3 | 339 | lang | 25 | 5.1 | 24 phút |
| Luyện Khí Tầng 4 | 373 | lang | 29 | 5.5 | 29 phút |
| Luyện Khí Tầng 5 | 410 | lang | 33 | 5.9 | 35 phút |
| Luyện Khí Tầng 6 | 451 | ho | 10 | 4.3 | 40 phút |
| Luyện Khí Tầng 7 | 496 | ho | 11 | 4.1 | 44 phút |
| Luyện Khí Tầng 8 | 546 | ho | 13 | 4.3 | 48 phút |
| Luyện Khí Tầng 9 | 600 | ho | 16 | 4.9 | 53 phút |
| Trúc Cơ Sơ kỳ | 4400 | ho | 118 | 31.6 | 1 giờ 24 phút |
| Trúc Cơ Trung kỳ | 5060 | ho | 136 | 35.2 | 2 giờ 0 phút |
| Trúc Cơ Hậu kỳ | 5819 | ho | 209 | 52.1 | 2 giờ 52 phút |

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×1.08), quái đánh trúng 80% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá 50% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: tho 6s, lang 8s, ho 12s, mang 90s, suong_ho 10s, thach_quy 12s, doc_thiem 14s, hac_giao 90s.
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
| Hắc Hổ (`ho`) | 7 | 600 | 11.20 | 8.10 | **19.30** | Da hổ (9 LT), Đan hồi phục (6 LT), Tụ khí đan (45 LT) |
| Xích Mãng (`mang`) | 12 | 4000 | 225.00 | 208.50 | **433.50** | Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT) |

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
| Luyện Khí Tầng 6 | Hắc Hổ | 133 | 1,492 | 1,079 | **2,571** | 107.1 |
| Luyện Khí Tầng 7 | Linh Thố | 566 | 679 | 696 | **1,375** | 57.3 |
| Luyện Khí Tầng 7 | Hôi Lang | 376 | 1,054 | 960 | **2,014** | 83.9 |
| Luyện Khí Tầng 7 | Hắc Hổ | 168 | 1,883 | 1,362 | **3,246** | 135.2 |
| Luyện Khí Tầng 8 | Linh Thố | 570 | 683 | 701 | **1,384** | 57.7 |
| Luyện Khí Tầng 8 | Hôi Lang | 385 | 1,077 | 981 | **2,057** | 85.7 |
| Luyện Khí Tầng 8 | Hắc Hổ | 180 | 2,018 | 1,460 | **3,478** | 144.9 |
| Luyện Khí Tầng 9 | Linh Thố | 573 | 688 | 705 | **1,393** | 58.1 |
| Luyện Khí Tầng 9 | Hôi Lang | 393 | 1,101 | 1,002 | **2,103** | 87.6 |
| Luyện Khí Tầng 9 | Hắc Hổ | 193 | 2,167 | 1,567 | **3,734** | 155.6 |
| Trúc Cơ Sơ kỳ | Linh Thố | 581 | 697 | 715 | **1,412** | 58.8 |
| Trúc Cơ Sơ kỳ | Hôi Lang | 410 | 1,149 | 1,046 | **2,195** | 91.5 |
| Trúc Cơ Sơ kỳ | Hắc Hổ | 223 | 2,499 | 1,807 | **4,305** | 179.4 |
| Trúc Cơ Trung kỳ | Linh Thố | 583 | 700 | 718 | **1,418** | 59.1 |
| Trúc Cơ Trung kỳ | Hôi Lang | 415 | 1,163 | 1,059 | **2,222** | 92.6 |
| Trúc Cơ Trung kỳ | Hắc Hổ | 232 | 2,603 | 1,882 | **4,485** | 186.9 |
| Trúc Cơ Hậu kỳ | Linh Thố | 586 | 703 | 720 | **1,423** | 59.3 |
| Trúc Cơ Hậu kỳ | Hôi Lang | 420 | 1,176 | 1,071 | **2,247** | 93.6 |
| Trúc Cơ Hậu kỳ | Hắc Hổ | 241 | 2,699 | 1,952 | **4,651** | 193.8 |

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
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới 433.5 LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
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
| Luyện Khí tầng 5 | 29 | 11 | 22.5 | 17 | **34.8** |
| Luyện Khí tầng 9 | 48 | 21 | 26.3 | 27 | **33.9** |
| Trúc Cơ sơ kỳ | 53 | 23 | 26.2 | 29 | **33.0** |
| Trúc Cơ trung kỳ | 84 | 39 | 27.7 | 45 | **32.0** |
| Trúc Cơ hậu kỳ | 120 | 55 | 27.6 | 61 | **30.6** |
| Hết Trúc Cơ (thanh đầy) | 172 | 69 | 24.1 | 78 | **27.3** |

Đọc bảng: Tính từ Luyện Khí tầng 5 trở đi (bỏ qua giai đoạn mới vào game), Duyên / giờ (0 trùm) nhỏ nhất là **22.5** (Luyện Khí tầng 5), lớn nhất là **27.7** (Trúc Cơ trung kỳ), tỷ lệ lớn / nhỏ là **1.23×**. Đỉnh Duyên / giờ rơi vào Trúc Cơ trung kỳ (~27.7 Duyên/h, gấp ~1.15× so với cày hết Trúc Cơ).

### 2. Tiến trình luân hồi qua chuỗi kiếp (1..N) khi mở dần "Dư âm tu hành"

Giả định người chơi kiếp nào cũng cày trọn vẹn đến hết Trúc Cơ (hạ 2 trùm) và dồn Duyên nâng cấp `du_am` (+10% đến +100%):

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 3 | +30% | 2 giờ 52 phút | +75 | 19 | **26.2** | 1.00× | Lên nấc 3 (+30%) |
| 2 | Nấc 5 | +50% | 2 giờ 14 phút | +74 | 0 | **33.2** | 1.26× | Lên nấc 5 (+50%) |
| 3 | Nấc 5 | +50% | 1 giờ 57 phút | +73 | 73 | **37.4** | 1.43× | Chờ đủ 80 Duyên |
| 4 | Nấc 6 | +60% | 1 giờ 57 phút | +73 | 66 | **37.4** | 1.43× | Lên nấc 6 (+60%) |
| 5 | Nấc 7 | +70% | 1 giờ 50 phút | +72 | 23 | **39.2** | 1.49× | Lên nấc 7 (+70%) |
| 6 | Nấc 7 | +70% | 1 giờ 44 phút | +71 | 94 | **40.9** | 1.56× | Chờ đủ 165 Duyên |
| 7 | Nấc 8 | +80% | 1 giờ 44 phút | +71 | 0 | **40.9** | 1.56× | Lên nấc 8 (+80%) |
| 8 | Nấc 8 | +80% | 1 giờ 39 phút | +70 | 70 | **42.5** | 1.62× | Chờ đủ 235 Duyên |
| 9 | Nấc 8 | +80% | 1 giờ 39 phút | +70 | 140 | **42.5** | 1.62× | Chờ đủ 235 Duyên |
| 10 | Nấc 8 | +80% | 1 giờ 39 phút | +70 | 210 | **42.5** | 1.62× | Chờ đủ 235 Duyên |
| 11 | Nấc 9 | +90% | 1 giờ 39 phút | +70 | 45 | **42.5** | 1.62× | Lên nấc 9 (+90%) |
| 12 | Nấc 9 | +90% | 1 giờ 34 phút | +70 | 115 | **44.6** | 1.70× | Chờ đủ 335 Duyên |
| 13 | Nấc 9 | +90% | 1 giờ 34 phút | +70 | 185 | **44.6** | 1.70× | Chờ đủ 335 Duyên |
| 14 | Nấc 9 | +90% | 1 giờ 34 phút | +70 | 255 | **44.6** | 1.70× | Chờ đủ 335 Duyên |
| 15 | Nấc 9 | +90% | 1 giờ 34 phút | +70 | 325 | **44.6** | 1.70× | Chờ đủ 335 Duyên |
| 16 | Nấc 10 | +100% | 1 giờ 34 phút | +70 | 60 | **44.6** | 1.70× | Lên nấc 10 (+100%) |
| 17 | Nấc 10 | +100% | 1 giờ 30 phút | +69 | 129 | **46.1** | 1.76× | Đã đạt tối đa (+100%) |

### 3. Nhận xét & Đánh giá cân bằng luân hồi

- **Tính chất ngang bằng giữa các cách chơi (chết ở bậc nào):**
  - Người chơi cày chay chết ở Luyện Khí tầng 5 (29 phút): **22.5 Duyên/h** (0 trùm) / **34.8 Duyên/h** (hạ trùm).
  - Người chơi cày tới Trúc Cơ sơ kỳ (53 phút): đạt đỉnh **26.2 Duyên/h** (0 trùm) / **33.0 Duyên/h** (hạ trùm).
  - Người chơi cày hết Trúc Cơ (172 phút): **24.1 Duyên/h** (0 trùm) / **27.3 Duyên/h** (hạ trùm).
  - **Đánh giá:** Mục tiêu thiết kế ("mọi cách chơi tương đương", mục 5 của docs/THIET_KE_LUAN_HOI.md) **đạt**: từ Luyện Khí tầng 5 trở đi mọi mốc nằm trong 22.5–27.7 Duyên/h (chênh 1.23×, ngưỡng 1.3×), không có bậc nào đáng để cố ý chết sớm; chết ở Luyện Khí tầng 1 (9 phút) chỉ nhận 1 Duyên.
- **Tiến trình tăng trưởng qua các kiếp (Progression pacing):**
  - Cần **16 kiếp** trọn vẹn để đạt tối đa nấc 10 Dư âm tu hành (+100% tốc độ tu luyện). Tổng thời gian chơi khoảng **~29 giờ**.
  - Tốc độ Duyên mỗi giờ tăng từ **26.2 Duyên/h** (kiếp 1) lên **46.1 Duyên/h** (khi max Dư âm tu hành), tương đương tỷ lệ **1.76×**.
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
| Nguyên Anh tầng 1 (bậc 16) | 33.6 | 32.4 - 35.2 |
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

Mục tiêu: không bãi nào cho tu vi / giờ vượt ~1,5x bãi mới tốt nhất cùng bậc, Linh thạch / giờ không vượt ~2x. Quái mới KHÔNG an toàn cho người Trúc Cơ hậu kỳ (mất > 50% khí huyết / trận) nên quái mới không làm đổi nhịp Luyện Khí / Trúc Cơ (hết Luyện Khí 53 phút, hết Trúc Cơ 2 giờ 52 phút cộng dồn).

| Bậc | Loài | Tu vi / giờ | Linh thạch / giờ | Con / giờ | Khí huyết mất |
|---|---|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Xích Mãng | 33,407 | 14,483 | 33 | 45% |
| Kim Đan Sơ kỳ | Sương Hồ | 21,863 | 9,413 | 187 | 31% |
| Kim Đan Sơ kỳ | Thạch Quy | 23,449 | 9,319 | 106 | 32% |
| Kim Đan Sơ kỳ | Độc Thiềm | không an toàn solo (64% khí huyết / trận) | – | – | – |
| Kim Đan Trung kỳ | Xích Mãng | 34,502 | 14,983 | 35 | 32% |
| Kim Đan Trung kỳ | Sương Hồ | 24,203 | 10,525 | 209 | 22% |
| Kim Đan Trung kỳ | Thạch Quy | 26,393 | 10,547 | 119 | 23% |
| Kim Đan Trung kỳ | Độc Thiềm | 31,728 | 15,672 | 131 | 46% |
| Kim Đan Hậu kỳ | Xích Mãng | 35,378 | 15,384 | 35 | 24% |
| Kim Đan Hậu kỳ | Sương Hồ | 26,313 | 11,535 | 229 | 16% |
| Kim Đan Hậu kỳ | Thạch Quy | 29,274 | 11,750 | 133 | 17% |
| Kim Đan Hậu kỳ | Độc Thiềm | 35,222 | 17,539 | 147 | 34% |

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
| Kim Đan Sơ kỳ | 48,000 | Xích Mãng | 89.6 | Thạch Quy | 116.2 |
| Kim Đan Trung kỳ | 55,200 | Độc Thiềm | 99.5 | Độc Thiềm | 99.5 |
| Kim Đan Hậu kỳ | 63,480 | Độc Thiềm | 124.4 | Độc Thiềm | 124.4 |

### 4. Luân hồi khi cày tới hết Kim Đan (#406)

Cùng mô hình với mục "Luân hồi & Điểm Duyên" (Duyên theo `calcDuyen`, thời gian là nhịp ở mục 3, bãi tốt nhất, hạ 2 trùm; mốc "hết" hạ 3 trùm). `duyenPerStep(3)` được hạ từ **60 xuống 40** (PR shared riêng): ở 60, Duyên / giờ (0 trùm) ở Kim Đan hậu kỳ lên 31.4 (gấp ~1.4x Luyện Khí tầng 5, vượt ngưỡng 1.3x); thanh Kim Đan dài ~5 giờ chứ không 5 lần Trúc Cơ (~2 giờ) nên 12 x 5 trả quá tay.

| Chết ngay khi vừa đạt | Phút | Duyên (0 trùm) | Duyên / giờ (0 trùm) | Duyên (hạ trùm) | Duyên / giờ (hạ trùm) |
|---|---:|---:|---:|---:|---:|
| Luyện Khí tầng 5 | 29 | 11 | 22.5 | 17 | **34.8** |
| Luyện Khí tầng 9 | 48 | 21 | 26.3 | 27 | **33.9** |
| Trúc Cơ sơ kỳ | 53 | 23 | 26.2 | 29 | **33.0** |
| Trúc Cơ trung kỳ | 84 | 39 | 27.7 | 45 | **32.0** |
| Trúc Cơ hậu kỳ | 120 | 55 | 27.6 | 61 | **30.6** |
| Hết Trúc Cơ (thanh đầy) | 172 | 69 | 24.1 | 78 | **27.3** |
| Kim Đan sơ kỳ | 172 | 69 | 24.1 | 75 | **26.2** |
| Kim Đan trung kỳ | 261 | 109 | 25.0 | 115 | **26.4** |
| Kim Đan hậu kỳ | 361 | 149 | 24.8 | 155 | **25.8** |
| Hết Kim Đan (thanh đầy) | 485 | 189 | 23.4 | 198 | **24.5** |

Từ Luyện Khí tầng 5 tới hết Kim Đan, Duyên / giờ (0 trùm) nhỏ nhất **22.5** (Luyện Khí tầng 5), lớn nhất **27.7** (Trúc Cơ trung kỳ): tỉ lệ **1.23x** (ngưỡng 1.3x, đạt). Mọi mốc Kim Đan nằm trong dải của Luyện Khí / Trúc Cơ nên không có điểm dừng nào đáng cố ý chết.

Tiến trình qua kiếp khi KIẾP NÀO CŨNG cày trọn tới hết Kim Đan (hạ 2 trùm) và dồn Duyên vào Dư âm tu hành:

| Kiếp | Dư âm tu hành | Tốc độ tu luyện | Thời gian chơi (phút) | Duyên nhận | Duyên còn lại | Duyên / giờ | So với kiếp 1 | Hành động tại Tam Sinh Thạch |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Nấc 5 | +50% | 485 | +195 | 46 | **24.1** | 1.00x | Lên nấc 5 (+50%) |
| 2 | Nấc 7 | +70% | 326 | +195 | 46 | **35.9** | 1.49x | Lên nấc 7 (+70%) |
| 3 | Nấc 8 | +80% | 289 | +195 | 76 | **40.5** | 1.68x | Lên nấc 8 (+80%) |
| 4 | Nấc 9 | +90% | 273 | +195 | 36 | **42.8** | 1.78x | Lên nấc 9 (+90%) |
| 5 | Nấc 9 | +90% | 259 | +195 | 231 | **45.1** | 1.87x | Chờ đủ 335 Duyên |
| 6 | Nấc 10 | +100% | 259 | +195 | 91 | **45.1** | 1.87x | Lên nấc 10 (+100%) |
| 7 | Nấc 10 | +100% | 247 | +195 | 286 | **47.4** | 1.97x | Đã đạt tối đa (+100%) |

Duyên / giờ tăng từ **24.1** (kiếp 1) lên **47.4** khi đạt tối đa: **1.97x** (ngưỡng ~2.0x, đạt). Một kiếp tới hết Kim Đan nhận 195 Duyên (so với 75 khi chỉ tới hết Trúc Cơ) vì dài 2.8 lần: cùng Duyên / giờ. Mô hình BỎ QUA nhiệm vụ lặp và phí rèn (không đổi Duyên). Giữ nguyên luật luân hồi đã chốt.

### 5. Đi theo đội ở Kim Đan (#406; KHÔNG đổi quy tắc chia tu vi)

Cùng mô hình với mục "Đi theo đội" (tu vi / giờ MỖI thành viên so với săn solo tốt nhất; trong ngoặc là quái tốt nhất mà đội đủ an toàn đánh, kể cả trùm Hắc Giao).

| Bậc | Một mình săn | Đội 2 | Đội 3 | Đội 4 |
|---|---|---:|---:|---:|
| Kim Đan Sơ kỳ | Xích Mãng | 0.80x (Độc Thiềm) | 0.69x (Độc Thiềm) | 1.08x (Hắc Giao) |
| Kim Đan Trung kỳ | Độc Thiềm | 0.82x (Độc Thiềm) | 1.18x (Hắc Giao) | 1.09x (Hắc Giao) |
| Kim Đan Hậu kỳ | Độc Thiềm | 0.77x (Độc Thiềm) | 1.12x (Hắc Giao) | 1.02x (Hắc Giao) |

Cao nhất **1.18x**, thấp nhất **0.69x**: ở Kim Đan đội 3-4 hạ Hắc Giao được ~1.0-1.2x săn solo (dưới ngưỡng 1.5x của #74, khác Trúc Cơ tới 2.5x), còn đội 2 chậm hơn solo (~0.8x: chưa đủ người hạ trùm, chia tu vi, thời gian tìm quái không rút ngắn). Đây là số đo, câu hỏi chia tu vi của người dùng vẫn chờ; test khoá cận dưới ~0.65x (đội nhỏ chậm hơn solo ở Sơ kỳ là hiện trạng, giống Luyện Khí bậc 6-9, không được xấu thêm).

### 6. Kinh tế Kim Đan: chỗ tiêu Linh thạch so với thu nhập (#406)

Thu nhập theo nhịp "bãi mới" ở mục 3 (săn solo, mỗi bậc một loài tốt nhất): tiền rơi cộng bán đồ rơi, TRỪ nguyên liệu của ba bộ (người chơi giữ lại để rèn). Chi: phí rèn `RecipeDef.coin` (mỗi bộ rèn được từ bậc ghi ở cột đầu, tiền trả khi rèn). Cột "Cộng dồn / Phí cộng dồn" so sánh tiền kiếm được tới hết bậc với phí cộng dồn của các bộ mặc được tới bậc kế; bộ III chỉ mặc được ở Hậu kỳ nên phí của nó tính vào cuối Hậu kỳ. Săn trùm theo đội lấy Giao Lân kiếm ít tiền hơn solo (tiền rơi của trùm chia 4 người: ~3,044 Linh thạch / giờ mỗi người): phần hụt đã trừ vào thu nhập Hậu kỳ.

| Bậc | Nguồn | Phút | Linh thạch / giờ (khả dụng) | Kiếm trong bậc | Cộng dồn | Phí rèn cộng dồn | Dư / thiếu |
|---|---|---:|---:|---:|---:|---:|---:|
| Kim Đan Sơ kỳ | Thạch Quy | 116 | 6,944 | 13,445 | 13,445 | 9,500 | +3,945 |
| Kim Đan Trung kỳ | Độc Thiềm | 99 | 11,687 | 19,376 | 32,821 | 31,500 | +1,321 |
| Kim Đan Hậu kỳ | Độc Thiềm | 124 | 13,080 | 18,882 | 51,702 | 78,500 | -26,798 |

Chi cho từng bộ (nguyên liệu tính MỖI NGƯỜI; trùm đi theo đội 4 người, mỗi mảnh rơi chung nên cả đội cần 4 lần số lượng):

| Bộ | Món | Phí rèn | Nguyên liệu | Phút cày solo | Phút săn trùm theo đội | So với thời gian ở bậc |
|---|---:|---:|---|---:|---:|---:|
| Bộ I (từ Sơ kỳ) | 3 | 9,500 | 42 Sương mao, 20 Quy giáp | 33.1 | 0.0 | 29% |
| Bộ II (từ Trung kỳ) | 3 | 22,000 | 48 Quy giáp, 20 Độc nang | 45.7 | 0.0 | 46% |
| Bộ III (từ Hậu kỳ) | 3 | 47,000 | 19 Giao lân, 30 Độc nang | 18.2 | 49.3 | 54% |

Tổng phí rèn ba bộ **78,500** Linh thạch so với **51,702** kiếm được trong cả Kim Đan: thiếu 26,798 (~2.0 giờ săn Hậu kỳ sau khi hết Kim Đan). Bộ I mua đủ trong Sơ kỳ (dư 3,945 cuối bậc) và bộ II trong Trung kỳ (dư 1,321); bộ III (47,000, 60% tổng phí) là mục tiêu cuối game: người chơi KHÔNG dư hàng vạn Linh thạch không có chỗ tiêu như cảnh báo cũ của mục "Kinh tế Linh thạch", và cũng không bị chặn (thiếu chừng 2.0 giờ). Cột cuối: cày nguyên liệu chiếm tối đa 54% thời gian bậc và các giờ đó vẫn kiếm tu vi, nên nguyên liệu không phải nút cổ chai, tiền mới là.
Đan cấp 2 (`dai_hoi_huyet_dan` / `dai_hoi_linh_dan`, 120 Linh thạch / viên ở Lái buôn Vọng Sương) là chỗ xả TUỲ CHỌN thêm vào: mô hình không tính vì không giả định người chơi uống đan (đả tọa hồi khí huyết). Mô hình cũng bỏ qua nhiệm vụ lặp và phí rèn ở nhịp tu luyện (mục 3), phần Linh thạch / đồ thưởng của nhiệm vụ.

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
