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

## 4. "Trôi như liệt phím" (mục 41 QUYET_DINH_M3, v0.3.2)
**Triệu chứng (người dùng, v0.3.1):** nhả phím rồi nhân vật vẫn đi tiếp một lúc (tới vài giây), như phím bị liệt.

**Nguyên nhân (đọc mã + mô phỏng):** mạng nhà đứng rồi xả dồn (mục 18.5) làm hàng đợi input (`c.inputs`) đầy input CŨ. Hàng đợi tới 60 input (3 giây) và máy chủ áp MỌI input theo token bucket thời gian thật (1 bước / 50 ms): nên sau khi gói dồn tới, máy chủ còn đi tiếp cả quãng đường đã đoán mà người chơi đã nhả phím từ lâu, tới ~3 giây. Client đối chiếu theo `lastSeq` nên kéo nhân vật đi theo.

**Số đo (mô phỏng đồng hồ ảo, cùng kịch bản trước / sau; `systems/movement-drift.test.ts`):** máy chủ đứng yên hẳn sau khi gói dồn tới bao lâu, và đi thêm bao nhiêu px:
| kịch bản | trước (v0.3.1) | sau |
|---|---|---|
| mạng đứng 2 s, client cũ (không input dừng) | 1,5 s / 300 px | 0,25 s / 113 px |
| mạng đứng 2 s, client mới (3 input dừng) | 1,5 s / 300 px | 0 s / 15 px |
| mạng đứng 3 s, client cũ | 2,5 s / 450 px | 0,25 s / 113 px |
| mạng đứng 3 s, client mới | 2,5 s / 450 px | 0 s / 15 px |
| mạng đứng 0,4 s, client mới | 0 s / 60 px | 0 s / 15 px |

**Sửa (`systems/movement.ts`):**
1. **Backlog <= `MAX_INPUT_BACKLOG` = 5 input (0,25 giây):** trước khi áp, input CŨ NHẤT vượt (số bước áp được tick này theo ngân sách + 5) bị BỎ (giữ thứ tự `seq`); `applyInputs` trả số đã bỏ, `tickWorld` cộng vào `World.inputStats.dropped`. `INPUT_BACKLOG_WARN` 6 -> 4 (backlog sau áp nay <= 5). Chặn cứng 64 lúc nhận (bỏ input CŨ NHẤT, trước đây bỏ input MỚI).
2. **Input dừng cắt hàng đợi:** input có hướng gần 0 (`dx = dy = 0`, ngưỡng 0,05 như `applyInputs`) cắt hàng đợi còn `STOP_KEEP_INPUTS` = 2 input cũ nhất rồi xếp vào: nhả phím thì dừng trong <= 3 tick dù hàng đợi đang đầy; sau khi áp `lastSeq` = seq của input dừng nên client bỏ hết pending cũ. Giữ lại 1-2 input cũ nhất vì ở mạng tốt luôn có 1-2 input "đang bay" mà client đã đoán trước: xoá sạch thì MỖI lần dừng nhân vật bị kéo giật lùi 1-2 bước (7-15 px).
3. **Chống chạy nhanh giữ nguyên:** `MAX_MOVE_BUDGET` 10 bước, tốc độ bền vững 1 bước / 50 ms thật; input dừng không cho thêm bước (còn mất input); test 1000 cặp (đi, dừng) trong một nhịp.

**Hợp đồng với client (B, PR `b/di-chuyen-dung-muot`):** khi hết phím, client gửi NGAY một input `{ seq: ++seq, dx: 0, dy: 0 }` (không chờ nhịp 20 Hz), lặp thêm 2 lần ở hai bước 50 ms kế tiếp (seq liên tiếp tăng dần, huỷ lặp nếu đi lại). Máy chủ cũ coi nó là bước không di chuyển nên tương thích ngược; client cũ không gửi input dừng vẫn được cắt backlog <= 0,25 giây. Không đổi `shared/` hay `PROTOCOL_VERSION`.

**Cái giá (người dùng đã chọn):** một lần mạng đứng LÂU hơn (ngân sách 0,5 giây + backlog 0,25 giây) làm nhân vật bị kéo lại một đoạn (client hấp thụ: nội suy nếu nhỏ, dịch tức thời nếu lệch lớn) thay vì trôi tiếp. Backlog đứng yên <= 5 input sau một đợt dồn vẫn còn (token bucket không xả nhanh hơn thời gian thật), nên vị trí máy chủ có thể tụt sau client tới 0,25 giây cho tới khi người chơi dừng.

**Theo dõi bản chạy thật:** `/metrics` `tiengioi_room_input_dropped_total` (nay gồm cả input cũ bị bỏ và bị input dừng cắt: sẽ TĂNG so với v0.3.1, bình thường) và `tiengioi_room_input_backlog_ticks_total` (số lượt backlog sau áp >= 4: nên gần 0 khi mạng tốt). Ghi số TRƯỚC khi nâng cấp để so.

**Phát hiện lúc làm phòng thật (rate limiter):** tin `input` có giới hạn tần suất (`MESSAGE_LIMITS.input`, token bucket). Burst cũ 40 làm đợt xả dồn sau mạng đứng > 2 giây bị bỏ đúng PHẦN ĐUÔI của đợt (chính các tin DỪNG nằm cuối, vì TCP giao đúng thứ tự), nên nhả phím mà máy chủ không bao giờ thấy tin dừng. Nâng `burst` lên **100** (= 5 giây ở 20 Hz; nhịp tim ứng dụng coi là chết sau 8 giây); spam bền vững trên 30 tin / giây vẫn bị bỏ rồi ngắt. Test phòng thật `rooms/WorldRoom.movement.test.ts` (client đệm 60-100 tin rồi xả dồn + 3 tin dừng): đột biến "burst về 40" làm 4 ca ĐỎ.

## 5. Mục 41 (di chuyển "trôi" trên v0.3.1): phần CLIENT (Dev B)
Mạng đứng rồi xả dồn làm hàng input của máy chủ đầy input CŨ; máy chủ tiếp tục đẩy nhân vật đi sau khi người chơi đã nhả phím, và client kéo vị trí theo lúc đối chiếu. Người dùng yêu cầu (`QUYET_DINH_M3.md` mục 41): máy chủ giới hạn độ trễ hàng đợi (~0,25 giây) và xoá input di chuyển tồn khi nhận tin dừng (Dev A); client gửi tin dừng ngay và đối chiếu mượt (Dev B, phần dưới).

**Tin dừng** (`client/src/move-stop.ts`, `StopBurst`): khi hết ý định đi (nhả phím / cần điều khiển, bị choáng, mở bảng chặn phím) SAU khi đã gửi input di chuyển, `WorldScene.stepMoveStop` (mỗi KHUNG VẼ, không chờ `fixedStep` 50 ms) gửi ngay `input { seq: ++seq, dx: 0, dy: 0 }`, rồi `fixedStep` lặp thêm hai tin ở hai bước kế tiếp (`STOP_REPEATS = 3`, `seq` liên tiếp; đi lại thì huỷ phần lặp; reset khi nối lại / Hoàng Tuyền / gục / đổi phòng). Tin dừng không vào `pending` (không di chuyển nên không cần chạy lại khi đối chiếu). Máy chủ cũ (v0.3.1): `len < 0,05` nên không di chuyển nhưng vẫn `p.lastSeq = seq`, tương thích. Hợp đồng với máy chủ mới: nhận tin dừng thì xoá input di chuyển đang đợi và đặt `lastSeq` = `seq` của tin dừng (client bỏ hết `pending` cũ). `input` giới hạn 30 / giây (burst 40) nên bộ ba tin dừng + 20 input / giây khi đi không vượt.

**Đối chiếu mượt** (`client/src/move-smooth.ts`): vị trí VẼ = `pred` + `corr`. Khi `reconcile` làm `pred` nhảy `j`, `corr -= j` (vị trí vẽ giữ nguyên lúc nhảy) rồi `corr` tan mũ với hằng thời gian `CORR_TAU_MS = 120` ms; độ lệch tích luỹ từ `CORR_SNAP_PX = 48` px (~8 bước đi) thì `corr = 0` và nhân vật dịch chuyển tức thì (`snapMe`). Nhân vật vẽ vẫn bám `pred + corr` bằng hằng thời gian ~33 ms như cũ, nên lúc đi bình thường không trễ thêm. Chỉ việc VẼ (nhân vật, camera) dùng `corr`; nhắm, nhặt, chạm cổng, đoán trước vẫn dùng `pred` thật.

**Số đo** (Chrome thật, chế độ mock, `node client/scripts/check-move-stop.mjs`, hai khung 1280x720 và 844x390):

| | TRƯỚC (`main` v0.3.1) | SAU |
|---|---|---|
| tin dừng sau khi nhả phím | 0 tin (chỉ ngừng gửi) | 3 tin `dx = dy = 0`, `seq` liên tiếp |
| độ trễ keyup -> tin dừng đầu tiên | không có (máy chủ chỉ biết sau khi hàng đợi cạn) | trung vị 6-13 ms, lớn nhất ~17 ms (1 khung vẽ) |
| `pred` lùi 20 px: về trong 2 px | 83 ms (giật gần như tức thì) | ~316 ms, không khung nào dịch quá 1,7 px (8 % độ lệch) |
| `pred` lệch 200 px | trượt 167 ms (lao ngang màn hình) | 17 ms (dịch chuyển tức thì, 1 khung) |

Đột biến của kiểm Chrome: bỏ tin dừng ở khung vẽ (4 mục ĐỎ); luôn dịch chuyển tức thì (3 mục ĐỎ); hằng thời gian 20 ms (1 mục ĐỎ). Test đơn vị: `move-stop.test.ts` (8), `move-smooth.test.ts` (11). Phần còn lại cần Dev A: giới hạn hàng đợi ~0,25 giây + xoá input tồn khi có tin dừng + test giả lập mạng đứng 2 giây rồi xả dồn (mục 41.5), số đo `/metrics` `dropped` / `backlogTicks` trước và sau trên bản chạy thật.
