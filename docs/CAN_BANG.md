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
