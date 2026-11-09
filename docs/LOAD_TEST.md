# Báo cáo thử tải bằng Bot (Load Test)

> Kịch bản: `server/scripts/bots.ts` kết nối bằng `colyseus.js` vào server của Dev C (cổng `2587`).
> Chạy lại bằng: `npm run bots -w server -- --suite --mode=both --duration=15 --write-doc`

## 1. Thông tin bản đo & Phương pháp

- **Commit đã đo:** `1096ff8` (chưa có #57, #59)
- **Thời lượng đo mỗi mức:** 15 giây ổn định (sau 2 giây khởi động để toàn bộ bot đi ra khỏi khu an toàn Lạc Hà Trấn).
- **Hai kịch bản hành vi bot (đều chạy ở nhịp `TICK_MS = 50` ms = 20 lần/giây):**
  1. **Thực tế (`--mode=realistic`):** giống hệt `WorldScene.fixedStep()` của client thật và `bench.ts` của Dev A — bot chỉ gửi `input { seq, dx, dy }` khi đang chạy tới quái; khi đã vào tầm chém thì **đứng lại đánh, không gửi `input`**.
  2. **Trường hợp xấu nhất (`--mode=worst`):** cả 100% bot di chuyển liên tục mỗi tick (20 `input`/giây/bot, kể cả khi đã áp sát quái vẫn lượn vòng quanh), làm `x, y, lastSeq` của mọi người chơi đổi ở tất cả các tick và phải phát cho mọi client.
- **Cách lấy số đo (từ bên ngoài qua WebSocket thật & `/proc`):**
  - **CPU mỗi tick (mục tiêu < 10 ms):** đọc `se.sum_exec_runtime` từ `/proc/<server_pid>/sched` (độ chính xác nano-giây trên Linux) ở mỗi chu kỳ 50 ms. Con số này bao gồm **toàn bộ** công việc của tiến trình server trong một tick: xử lý tin nhắn nhận vào + `WorldRoom.update()` + mã hoá bản vá `@colyseus/schema` + gửi khung WebSocket qua mạng cho 50–100 kết nối.
  - **Băng thông mỗi bot nhận vào (RX) & gửi đi (TX):** đo trực tiếp số byte qua socket của từng bot; tách riêng **Tổng RX** (gồm cả tin nhắn broadcast `fx`, `dmg`, `chat`) và **Riêng state patch RX** (mã gói `Protocol.ROOM_STATE_PATCH = 15`).
  - **Nhịp nhận patch (`Δt`) & Độ trễ `input → lastSeq`:** đo trên từng client `colyseus.js` bằng `performance.now()`.
  - **Số quái còn sống lúc đo:** lấy mẫu `room.state.monsters.size` mỗi tick trong suốt kỳ đo (bot giết quái nhanh hơn chu kỳ hồi 10 giây, ảnh hưởng trực tiếp tới kích thước patch và số gói `fx`/`dmg`).

## 2. Bảng kết quả (Trước tối ưu — chưa có #57, #59)

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` (mục tiêu ~50 ms) | Độ trễ `input → lastSeq` | Số quái còn sống lúc đo |
|---|---:|---|---|---|---|---|---|---|
| Thực tế (vào tầm đứng chém) | **50** | 50/50 (4429: 0) | TB **1.55 ms** / p95 2.95 ms / max 5.07 ms | Tổng **24.83 KB/s** (patch: 23.51 KB/s) | **0.32 KB/s** (8 gói/s) | TB 50.11 ms (p95: 51.17 ms) | TB 94.02 ms (min: 85.77 ms, p95: 99.82 ms) | TB 58 (đầu 82 → cuối 53, thấp nhất 53) |
| Thực tế (vào tầm đứng chém) | **100** | 100/100 (4429: 0) | TB **2.12 ms** / p95 3.22 ms / max 5.13 ms | Tổng **20.72 KB/s** (patch: 20.37 KB/s) | **0.2 KB/s** (4.9 gói/s) | TB 50.09 ms (p95: 51.21 ms) | TB 95.5 ms (min: 87.88 ms, p95: 99.44 ms) | TB 57 (đầu 57 → cuối 56, thấp nhất 56) |
| Xấu nhất (100% đi liên tục) | **50** | 50/50 (4429: 0) | TB **1.9 ms** / p95 2.98 ms / max 3.91 ms | Tổng **33.42 KB/s** (patch: 30.1 KB/s) | **0.81 KB/s** (20.2 gói/s) | TB 50.12 ms (p95: 51.14 ms) | TB 90.62 ms (min: 82.45 ms, p95: 97.9 ms) | TB 52 (đầu 81 → cuối 43, thấp nhất 43) |
| Xấu nhất (100% đi liên tục) | **100** | 100/100 (4429: 0) | TB **2.93 ms** / p95 4.67 ms / max 9.51 ms | Tổng **44.84 KB/s** (patch: 42.46 KB/s) | **0.8 KB/s** (19.9 gói/s) | TB 50.22 ms (p95: 51.6 ms) | TB 93.04 ms (min: 85.61 ms, p95: 97.76 ms) | TB 45 (đầu 51 → cuối 40, thấp nhất 40) |

## 3. Đối chiếu với Benchmark nội bộ (`npm run bench -w server`) & Nhận xét

1. **Nguyên nhân chênh lệch băng thông giữa kịch bản Xấu nhất (~42 KB/s) và Benchmark nội bộ (~25–26.6 KB/s):**
   - Benchmark không qua mạng của Dev A (`npm run bench -w server`) đo trên code `main` (trước #59) cho kết quả **~26.6 KB/s mỗi client** ở 100 người, và sau #59 giảm ~5% về **~25 KB/s**.
   - Sự khác biệt giữa con số **~42.5 KB/s** (kịch bản Xấu nhất của `bots.ts`) và **~26.6 KB/s** của `bench.ts` **không phải** do `takeWhole`, mà do **kịch bản di chuyển**:
     - Ở kịch bản **Xấu nhất (`--mode=worst`)**, cả 100 bot đều gửi 20 `input`/giây liên tục không nghỉ, khiến `x, y, lastSeq` của cả 100 nhân vật thay đổi ở mọi tick và được phát cho toàn bộ 100 client. Sau #59, kịch bản xấu nhất này dự kiến chỉ giảm vài KB/s (không về ~25 KB/s).
     - Ở kịch bản **Thực tế (`--mode=realistic`)**, khi bot vào tầm đánh quái thì đứng lại chém và không gửi `input` (giống `WorldScene.fixedStep` và `bench.ts`), băng thông gửi đi (TX) và băng thông state patch nhận về (RX) thấp hơn rõ rệt và sát với `bench.ts` (cộng thêm chi phí gói tin broadcast `fx`/`dmg` và khung WebSocket).
2. **CPU mỗi tick (< 10 ms):**
   - Trong `bench.ts` (chỉ chạy logic `tickWorld` + `encoder.encode()` một lần trong bộ nhớ), thời gian thuần logic là **~0.2 ms/tick**.
   - Khi chạy server thật với **50–100 kết nối WebSocket**, tiến trình Node.js gánh thêm chi phí đọc/giải mã các gói `input`+`attack`/giây từ socket và đẩy hàng nghìn gói `patch`+`fx`+`dmg`/giây qua tầng TCP/WebSocket của hệ điều hành, nhưng tổng CPU tiến trình vẫn chỉ **~1.5–3.0 ms/tick trung bình (p95 < 5 ms, cao nhất < 10 ms)** — đạt mục tiêu **< 10 ms/tick**.
3. **Ghi nhận trên nhánh chưa có #59:**
   - Khi nối từ bot thứ ~85 tới 100 trên bản chưa có #59, `@colyseus/schema` in cảnh báo `buffer overflow. Encoded state is higher than default BUFFER_SIZE` (do bộ đệm mặc định nhỏ hơn state đầy đủ của 100 người + quái). PR #59 nâng `Encoder.BUFFER_SIZE = 32 * 1024` sẽ giải quyết triệt để cảnh báo này.
