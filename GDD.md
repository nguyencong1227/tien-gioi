# Tiên Giới: bản thiết kế (v0.1)

MMORPG 2D tu tiên, chiến đấu thời gian thực, chơi trên web và app (Android/iOS qua Capacitor).

## Trụ cột
1. **Tu luyện có cảm giác tiến bộ:** tu vi tăng từ đánh quái và đả tọa. Lên cảnh giới lớn phải đột phá, có rủi ro thất bại.
2. **Chiến đấu thời gian thực đơn giản, hợp điện thoại:** joystick + 2–3 nút kỹ năng, không cần thao tác phức tạp.
3. **Thế giới chung:** thấy người khác tu luyện, đánh quái, chat; về sau có tổ đội, tông môn, bí cảnh.
4. **Luân hồi:** chết là hết một kiếp, nhưng *linh hồn* (tài khoản) giữ lại thành tựu để kiếp sau mạnh hơn (xem mục "Luân hồi").

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

- **Chết = luân hồi** (quyết định 10/11/2026, thay luật cũ "hồi sinh ở trấn sau 5 giây, mất 10% tu vi"): xem mục "Luân hồi". Đã vào mã nguồn từ #162: chết do quái đưa nhân vật vào Hoàng Tuyền (màn hình phía client: #150, đang làm). Nhánh hồi sinh cũ chỉ còn cho chết không mất kiếp (PK, bước 5 của M3) và cho bench / test đơn vị.

## Luân hồi
Tham khảo cơ chế của thể loại (chỉ lấy ý tưởng, mọi tên gọi, con số và chữ đều tự đặt cho Tiên Giới).
- **Linh hồn** (vĩnh viễn, thuộc về tài khoản) tách khỏi **nhân vật của kiếp này** (mất khi chết).
- **Chết thật:** nhân vật của kiếp đó mất hẳn (cảnh giới, đồ, Linh thạch về 0), đầu thai sang kiếp mới, chơi lại từ đầu.
- **Điểm luân hồi:** nhận theo thành tựu của kiếp vừa rồi (cảnh giới cao nhất, thời gian sống, trùm đã hạ...). Công thức: `docs/CAN_BANG.md`.
- **Bảng mở khóa vĩnh viễn:** tiêu điểm luân hồi để mở, bản đầu 4–5 mục: dư âm tu hành (+% tốc độ tu luyện, tối đa +100%), khắc chân linh (giữ một công pháp / nghề qua kiếp), chọn xuất thân kiếp mới, đồ khởi đầu, giữ lại một món đồ; Linh thạch chỉ mang theo phần nào được mở khóa.
- **Không chết oan:** rớt mạng không bị giết (nhân vật được giữ `RECONNECT_GRACE_S` giây và bất tử trong lúc chờ). Chết vì PK (thách đấu hai bên đồng ý) **không** mất kiếp.
- Thiết kế chi tiết (dữ liệu linh hồn, công thức, bảng mở khóa, màn hình chết → đầu thai): `docs/THIET_KE_LUAN_HOI.md`.

## Kỹ thuật
- **Client:** Phaser 3 + Vite + TypeScript. Bản đồ tile, ảnh tạm vẽ bằng code (sau thay asset CC0). Joystick cảm ứng và bàn phím.
- **Server:** Node.js + Colyseus 0.16, chạy 20 tick/giây. Client gửi input, server tính di chuyển, va chạm, sát thương, AI quái. Client tự đoán trước vị trí của mình rồi chỉnh theo server, nội suy vị trí người khác.
- **Shared:** cảnh giới, hằng số, sinh bản đồ (cùng seed nên client và server ra cùng một bản đồ), va chạm.
- **Lưu trữ (bản thử):** file JSON cho mỗi nhân vật. Tên nhân vật được giữ bằng mã bí mật lưu trong máy. Linh hồn cũng bắt đầu bằng file JSON (bước 2 của M3), rồi chuyển sang PostgreSQL và tài khoản thật ở bước 3 của M3.
- **Nhiều bản đồ:** mỗi bản đồ là một phòng Colyseus (một người ở một phòng một lúc, cổng chuyển bản đồ ở rìa, file lưu có `mapId`); chat toàn server và tổ đội khác bản đồ đi qua kênh chung giữa các phòng. Chi tiết: `docs/THIET_KE_NHIEU_BAN_DO.md`.
- **App:** đóng gói client bằng Capacitor (mốc sau).

## Lộ trình
1. **M1 (bản này):** vào game bằng tên, một bản đồ, thấy nhau di chuyển, chat, đánh quái thời gian thực, tu vi/cảnh giới, lưu nhân vật.
2. **M2:** túi đồ, rơi đồ, đan dược, NPC và nhiệm vụ, asset thật.
3. **M3** (thứ tự chốt ngày 10/11/2026; chi tiết và người làm: `docs/PHAN_CONG_M3.md`). Đã xong: tổ đội, tiền tệ, cửa hàng, nối lại khi rớt mạng, bản đồ là tham số; phía server đã xong cả bản đồ thứ hai (trừ nội dung quái riêng của Hắc Phong Cốc) và luân hồi (chân linh, Hoàng Tuyền, đầu thai). Còn lại, theo thứ tự:
   1. Bản đồ thứ hai (phương án A: mỗi bản đồ một phòng Colyseus).
   2. Luân hồi bản đầu (linh hồn lưu file, điểm luân hồi, bảng mở khóa).
   3. Tài khoản thật + PostgreSQL, để lưu linh hồn tách khỏi nhân vật.
   4. Bí cảnh (phòng tạm theo đội).
   5. PK: chỉ khi hai bên đồng ý (thách đấu); chết vì PK không mất kiếp.
   6. Tông môn, gắn với linh hồn (không gắn với nhân vật của từng kiếp).
4. **M4:** chống gian lận, deploy, build app Android/iOS (tài khoản thật + PostgreSQL đã kéo lên M3).
