# Di chuyển: input, dự đoán, đối chiếu (mục 25 `QUYET_DINH_M3.md`)

Người dùng báo trên v0.3.0: di chuyển bằng bàn phím "không thanh thoát, nhiều lúc không đi được, như liệt nút". Tài liệu này ghi PHẦN MÁY CHỦ / DỰ ĐOÁN (Dev A); phần bàn phím, tiêu điểm, bộ gõ là của Dev B (client).

## 1. Đường đi của một bước
1. Client (`WorldScene.fixedStep`, bộ cộng dồn `acc` theo khung vẽ) gửi `input {seq, dx, dy}` mỗi `TICK_MS` (50 ms) **chỉ khi đang giữ phím** và tự đi trước đúng một bước (`moveWithCollision`, hàm dùng chung ở `shared/`), đẩy input vào `pending`.
2. Máy chủ (`systems/movement.ts`): `queueInput` xếp vào hàng đợi (tối đa `MAX_QUEUED_INPUTS`); `applyInputs` mỗi tick áp từng input = đúng một bước `TICK_MS`, ghi `lastSeq`.
3. Client (`reconcile`, mỗi lần state đổi): lấy `x, y, lastSeq` của máy chủ, bỏ `pending` có `seq <= lastSeq`, chạy lại phần còn lại. Nhân vật của mình vẽ theo `predX, predY` (nội suy mũ nhẹ).

Chống chạy nhanh bằng **ngân sách bước** (token bucket): máy chủ chỉ cho đi tối đa 1 bước / `TICK_MS` THỜI GIAN THẬT bền vững, cộng một lượng dồn tối đa `MAX_MOVE_BUDGET`.

## 2. Lỗi đo được: hàng đợi tụt hậu rồi bỏ input (đã sửa)
Cũ: mỗi tick cộng ĐÚNG 1 bước (tối đa 4). Nhưng `setInterval(50)` của Node chạy thật ~19,9 Hz (đo 600 tick: 50,2 ms, 19,92 Hz, lúc bận còn chậm hơn) trong khi client gửi đúng 20,00 Hz. Hệ quả:
- máy chủ xử lý chậm hơn client gửi ~0,4 %: hàng đợi tăng thêm ~1 input / 12 giây đi liên tục, **đầy (20) sau ~4 phút** rồi BỎ input mới;
- client đã đoán trước các bước bị bỏ nên bị **kéo giật lùi** mỗi lần bỏ; trước lúc đầy, vị trí MÁY CHỦ tụt sau client tới 1 giây (nhặt đồ, nói chuyện NPC, đánh thường dùng vị trí máy chủ);
- mỗi lần tick bị trễ (GC, lưu hồ sơ, máy bận) cũng mất luôn phần ngân sách của tick đó, thành tụt hậu vĩnh viễn.

Đo (`npm run input-lag -w server -- --seconds 150`, máy chủ Colyseus thật trong tiến trình, client gửi theo lịch tuyệt đối 50,000 ms):

| thời điểm | trước: chưa xử lý / hàng đợi | sau: chưa xử lý / hàng đợi |
|---|---|---|
| 15 s | 2 / 0 | 2 / 0 |
| 60 s | 5 / 3 | 2 / 0 |
| 105 s | 9 / 8 | 1 / 0 |
| 135 s | 12 / 11 | 2 / 0 |
| cuối | không bỏ (mới 150 s) | không bỏ |

Sửa: `applyInputs(map, p, c, dtMs)` cộng `dtMs / TICK_MS` (đồng hồ phòng, `tickWorld` truyền `dtMs`) thay vì 1; tick trễ thì bù ở tick sau. `MAX_MOVE_BUDGET` 4 -> 10 (0,5 giây bù trễ mạng), `MAX_QUEUED_INPUTS` 20 -> 60 (3 giây; mạng đứt lâu hơn thì nhịp tim ứng dụng coi là chết sau 8 giây và nối lại). Test đồng hồ ảo: `server/src/systems/movement-clock.test.ts`.

**Đánh đổi chống gian lận:** tốc độ bền vững KHÔNG đổi (1 bước / 50 ms thời gian thật, test riêng). Cái mất là mức "nhảy cóc": client đứng im 0,5 giây rồi gửi dồn có thể đi 10 bước cùng một tick (trước: 4). Tối đa ~70 px mỗi lần đứng im 0,5 giây, đo bằng test "đứng im rồi gửi dồn". Chấp nhận: vẫn nằm trong khung ~70 px, và đổi lại không còn bỏ input / giật lùi khi mạng chập chờn tới 0,5 giây. Nếu thấy lạm dụng trong thách đấu thì hạ trần ngân sách riêng cho người đang thách đấu (`w.duels`).

## 3. Còn lại của mục 25 (kế hoạch)
- **A:** (xong, #783) hàng đợi theo thời gian thật; (xong) số đo `/metrics`: `tiengioi_room_input_dropped_total`, `tiengioi_room_input_backlog_ticks_total` (`docs/VAN_HANH.md`) để thấy lỗi mạng của người dùng trên bản chạy thật; (tiếp, chỉ làm nếu số đo thật cho thấy cần) client giữ lại một bước khi `pending` dài dai dẳng.
- **B (client, #784 đã vào `main`):** bàn phím theo `event.code` (`move-keys.ts`; bộ gõ Telex / VNI làm Phaser mất phím: `key = Process`, `keyCode = 229`), quên phím khi `blur` / `pagehide` / `contextmenu` / ẩn tab / vào ô chat, chỉ ô NHẬP CHỮ chặn đi bộ, tự gỡ mục sót trong ngăn xếp bảng; còn lại: báo mất kết nối / lag sớm hơn ngưỡng nhịp tim 8 giây.
