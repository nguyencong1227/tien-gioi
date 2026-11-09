# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ `server/src/balance/simulate.ts`. Sửa số liệu trong `shared/` rồi chạy
> `npm run can-bang -w server` để cập nhật. Test `server/src/balance/simulate.test.ts` giữ đường cong trong mục tiêu.

## Kết quả

- Hết Luyện Khí (sẵn sàng Trúc Cơ): **53 phút** (mục tiêu ~1 giờ)
- Hết Trúc Cơ (sẵn sàng Kim Đan): **2 giờ 55 phút** (mục tiêu ~3 giờ)

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
| Trúc Cơ Sơ kỳ | 4400 | ho | 122 | 32.9 | 1 giờ 26 phút |
| Trúc Cơ Trung kỳ | 5060 | ho | 141 | 36.4 | 2 giờ 2 phút |
| Trúc Cơ Hậu kỳ | 5819 | ho | 215 | 53.4 | 2 giờ 55 phút |

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×1.08), quái đánh trúng 80% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá 50% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: tho 6s, lang 8s, ho 12s, mang 90s.
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
| Xích Mãng (`mang`) | 12 | 4000 | 225.00 | 235.50 | **460.50** | Vảy mãng (60 LT), Tụ khí đan (45 LT), Hồi huyết đan (6 LT) |

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
- **Quái cấp cao (Hắc Hổ, Xích Mãng):**
  - Hắc Hổ (cấp 2, an toàn từ Luyện Khí Tầng 6): thu nhập tăng mạnh từ ~2,570 LT/h lên ~4,650 LT/h ở Trúc Cơ.
  - Xích Mãng (trùm cấp 3): cho kỳ vọng tới 460.5 LT/con nhưng không an toàn khi solo trước Kim Đan; thích hợp đi săn theo tổ đội (xem mục "Đi theo đội" ở trên).
