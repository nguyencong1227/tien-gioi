# Tiên Giới: bản thiết kế (v0.1)

MMORPG 2D tu tiên, chiến đấu thời gian thực, chơi trên web và app (Android/iOS qua Capacitor).

## Trụ cột
1. **Tu luyện có cảm giác tiến bộ:** tu vi tăng từ đánh quái và đả tọa. Lên cảnh giới lớn phải đột phá, có rủi ro thất bại.
2. **Chiến đấu thời gian thực đơn giản, hợp điện thoại:** joystick + 2–3 nút kỹ năng, không cần thao tác phức tạp.
3. **Thế giới chung:** thấy người khác tu luyện, đánh quái, chat; về sau có tổ đội, tông môn, bí cảnh.

## Hệ cảnh giới (thang chuẩn của thể loại tu tiên)
| Cảnh giới | Bậc nhỏ |
|---|---|
| Phàm Nhân | 1 |
| Luyện Khí | Tầng 1–9 |
| Trúc Cơ | Sơ / Trung / Hậu kỳ |
| Kim Đan | Sơ / Trung / Hậu kỳ |
| Nguyên Anh | Sơ / Trung / Hậu kỳ |
| Hóa Thần | Sơ / Trung / Hậu kỳ |
| Luyện Hư → Hợp Thể → Đại Thừa → Độ Kiếp | Sơ / Trung / Hậu kỳ |

- Đủ tu vi thì bậc nhỏ tự lên.
- Muốn qua cảnh giới lớn phải bấm **Đột phá**. Xác suất thành công giảm dần theo cảnh giới. Thất bại thì mất 30% tu vi.
- Chỉ số (khí huyết, linh lực, công kích) tăng theo từng bậc.

## Thế giới (riêng của Tiên Giới)
- **Lạc Hà Trấn:** thị trấn khởi đầu ở giữa bản đồ, khu an toàn, quái không vào được.
- Đi càng xa trấn, quái càng mạnh: Linh Thố (thỏ linh) → Hôi Lang (sói xám) → Hắc Hổ → Xích Mãng (trùm).
- Địa hình: đồng cỏ, rừng, sông hồ, núi đá (chặn đường).

## Chiến đấu (server quyết định mọi kết quả)
| Nút | Phím | Tác dụng |
|---|---|---|
| Kiếm chém | J / Space | Chém hình quạt trước mặt, hồi 0,4 giây |
| Kiếm khí | K | Phóng luồng kiếm khí đường thẳng, tốn linh lực, hồi 1,5 giây |
| Đả tọa | L | Ngồi tu luyện: hồi khí huyết/linh lực, tăng tu vi chậm, di chuyển thì dừng |
| Đột phá | B | Thử đột phá cảnh giới lớn |

- Chết: hồi sinh ở Lạc Hà Trấn sau 5 giây, mất 10% tu vi.

## Kỹ thuật
- **Client:** Phaser 3 + Vite + TypeScript. Bản đồ tile, ảnh tạm vẽ bằng code (sau thay asset CC0). Joystick cảm ứng và bàn phím.
- **Server:** Node.js + Colyseus 0.16, chạy 20 tick/giây. Client gửi input, server tính di chuyển, va chạm, sát thương, AI quái. Client tự đoán trước vị trí của mình rồi chỉnh theo server, nội suy vị trí người khác.
- **Shared:** cảnh giới, hằng số, sinh bản đồ (cùng seed nên client và server ra cùng một bản đồ), va chạm.
- **Lưu trữ (bản thử):** file JSON cho mỗi nhân vật. Tên nhân vật được giữ bằng mã bí mật lưu trong máy. Sau này chuyển sang PostgreSQL và tài khoản thật.
- **App:** đóng gói client bằng Capacitor (mốc sau).

## Lộ trình
1. **M1 (bản này):** vào game bằng tên, một bản đồ, thấy nhau di chuyển, chat, đánh quái thời gian thực, tu vi/cảnh giới, lưu nhân vật.
2. **M2:** túi đồ, rơi đồ, đan dược, NPC và nhiệm vụ, asset thật.
3. **M3:** tổ đội, tông môn, PK có điều kiện, nhiều bản đồ, bí cảnh.
4. **M4:** tài khoản thật, PostgreSQL, chống gian lận, deploy, build app Android/iOS.
