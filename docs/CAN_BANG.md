# Cân bằng tu luyện (bảng tính)

> File này sinh tự động từ `server/src/balance/simulate.ts`. Sửa số liệu trong `shared/` rồi chạy
> `npm run can-bang -w server` để cập nhật. Test `server/src/balance/simulate.test.ts` giữ đường cong trong mục tiêu.

## Kết quả

- Hết Luyện Khí (sẵn sàng Trúc Cơ): **59 phút** (mục tiêu ~1 giờ)
- Hết Trúc Cơ (sẵn sàng Kim Đan): **3 giờ 9 phút** (mục tiêu ~3 giờ)

| Bậc | Thanh tu vi | Săn gì | Số quái | Phút ở bậc này | Cộng dồn |
|---|---:|---|---:|---:|---:|
| Phàm Nhân | 40 | tho | 10 | 1.4 | 9 phút |
| Luyện Khí Tầng 1 | 280 | lang | 18 | 5.1 | 15 phút |
| Luyện Khí Tầng 2 | 308 | lang | 21 | 5.2 | 20 phút |
| Luyện Khí Tầng 3 | 339 | lang | 25 | 5.5 | 25 phút |
| Luyện Khí Tầng 4 | 373 | lang | 28 | 5.7 | 31 phút |
| Luyện Khí Tầng 5 | 410 | lang | 32 | 6.1 | 37 phút |
| Luyện Khí Tầng 6 | 451 | lang | 40 | 7.2 | 44 phút |
| Luyện Khí Tầng 7 | 496 | ho | 11 | 4.6 | 49 phút |
| Luyện Khí Tầng 8 | 546 | ho | 12 | 4.7 | 54 phút |
| Luyện Khí Tầng 9 | 600 | ho | 15 | 5.3 | 59 phút |
| Trúc Cơ Sơ kỳ | 4400 | ho | 120 | 35.7 | 1 giờ 35 phút |
| Trúc Cơ Trung kỳ | 5060 | ho | 139 | 38.7 | 2 giờ 13 phút |
| Trúc Cơ Hậu kỳ | 5819 | ho | 212 | 55.7 | 3 giờ 9 phút |

## Giả định

- Mỗi bậc, người chơi chọn nguồn tu vi nhanh nhất mà an toàn: săn một loại quái, hoặc chỉ đả tọa.
- Săn quái: chỉ dùng Kiếm chém (có tính bạo kích trung bình ×1.08), quái đánh trúng 80% số đòn,
  bỏ qua loại quái mà mỗi trận mất quá 50% khí huyết. Sau mỗi trận đả tọa hồi khí huyết (vẫn được tu vi đả tọa).
- Thời gian tìm quái kế tiếp: tho 6s, lang 8s, ho 12s, mang 90s.
- Thưởng tu vi của chuỗi nhiệm vụ chính chia đều cho các bậc của cảnh giới tương ứng; đi lại + nói chuyện cả chuỗi: 8 phút.
- Đột phá thất bại mất 30% thanh tu vi, tính theo số lần thất bại kỳ vọng.
- Chưa tính: nhiệm vụ lặp, đan dược, đánh theo nhóm, thời gian chết.
- Tụ Khí Đan (+5% thanh) cố ý hiếm: rơi 1% từ Hắc Hổ, thưởng nhiệm vụ, không đổi được ở Lão dược sư.
  Ước khoảng 11 viên trong 3 giờ đầu, cộng lại chừng nửa thanh Trúc Cơ (rút ngắn khoảng 20 phút).
