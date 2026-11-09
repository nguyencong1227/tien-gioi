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
- Chưa tính: nhiệm vụ lặp, đan dược, đánh theo nhóm, thời gian chết.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).
