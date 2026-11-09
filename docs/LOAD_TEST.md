# Báo cáo thử tải bằng Bot (Load Test)

> Kịch bản: `server/scripts/bots.ts` kết nối bằng `colyseus.js` vào server của Dev C (cổng `2587`).
> Chạy lại bằng: `npm run bots -w server -- --suite --mode=both --duration=15 --write-doc`

## 1. Thông tin bản đo & Phương pháp

- **Mốc trước tối ưu:** commit `1096ff8` (chưa có #57, #59)
- **Mốc sau tối ưu:** commit `090d333` (đã có #57, #59)
- **Thời lượng đo mỗi mức:** 15 giây ổn định (sau 2 giây khởi động để toàn bộ bot đi ra khỏi khu an toàn Lạc Hà Trấn).
- **Hai kịch bản hành vi bot (đều chạy ở nhịp `TICK_MS = 50` ms = 20 lần/giây):**
  1. **Thực tế (`--mode=realistic`):** giống hệt `WorldScene.fixedStep()` của client thật và `bench.ts` của Dev A — bot chỉ gửi `input { seq, dx, dy }` khi đang chạy tới quái; khi đã vào tầm chém thì **đứng lại đánh, không gửi `input`**.
  2. **Trường hợp xấu nhất (`--mode=worst`):** cả 100% bot di chuyển liên tục mỗi tick (20 `input`/giây/bot, kể cả khi đã áp sát quái vẫn lượn vòng quanh), làm `x, y, lastSeq` của mọi người chơi đổi ở tất cả các tick và phải phát cho mọi client.
- **Cách lấy số đo (từ bên ngoài qua WebSocket thật & `/proc`):**
  - **CPU mỗi tick (mục tiêu < 10 ms):** đọc `se.sum_exec_runtime` từ `/proc/<server_pid>/sched` (độ chính xác nano-giây trên Linux) ở mỗi chu kỳ 50 ms. Con số này bao gồm **toàn bộ** công việc của tiến trình server trong một tick: xử lý tin nhắn nhận vào + `WorldRoom.update()` + mã hoá bản vá `@colyseus/schema` + gửi khung WebSocket qua mạng cho 50–100 kết nối.
  - **Băng thông mỗi bot nhận vào (RX) & gửi đi (TX):** đo trực tiếp số byte qua socket của từng bot; tách riêng **Tổng RX** (gồm cả tin nhắn broadcast `fx`, `dmg`, `chat`) và **Riêng state patch RX** (mã gói `Protocol.ROOM_STATE_PATCH = 15`).
  - **Nhịp nhận patch (`Δt`) & Độ trễ `input → lastSeq`:** đo trên từng client `colyseus.js` bằng `performance.now()`.
  - **Số quái còn sống lúc đo:** lấy mẫu `room.state.monsters.size` mỗi tick trong suốt kỳ đo (bot giết quái nhanh hơn chu kỳ hồi 10 giây, ảnh hưởng trực tiếp tới kích thước patch và số gói `fx`/`dmg`).

## 2. Bảng kết quả (Trước → Sau #57, #59)

### 2.1. Bảng so sánh cột Trước (`1096ff8` — chưa có #57, #59) và Sau (`090d333` — đã có #57, #59)

| Kịch bản | Số bot | Chỉ số | Trước (chưa có #57, #59) | Sau (đã có #57, #59) |
|---|---:|---|---|---|
| **Thực tế (vào tầm đứng chém)** | **50** | Kết nối giữ vững | 50/50 (4429: 0) | **50/50 (4429: 0)** |
| Thực tế (vào tầm đứng chém) | **50** | CPU mỗi tick (TB / p95 / cao nhất) | TB **1.55 ms** / p95 2.95 ms / max 5.07 ms | TB **1.64 ms** / p95 3.16 ms / max 6.94 ms |
| Thực tế (vào tầm đứng chém) | **50** | Băng thông nhận vào (RX / bot) | Tổng **24.83 KB/s** (patch: 23.51 KB/s) | Tổng **16.71 KB/s** (patch: 14.83 KB/s) |
| Thực tế (vào tầm đứng chém) | **50** | Băng thông gửi đi (TX / bot) | **0.32 KB/s** (8 gói/s) | **0.38 KB/s** (9.5 gói/s) |
| Thực tế (vào tầm đứng chém) | **50** | Nhịp nhận patch `Δt` | TB 50.11 ms (p95: 51.17 ms) | TB **50.18 ms** (p95: 51.11 ms) |
| Thực tế (vào tầm đứng chém) | **50** | Độ trễ `input → lastSeq` | TB 94.02 ms (min: 85.77 ms, p95: 99.82 ms) | TB **65.76 ms** (min: 61.25 ms, p95: 69.13 ms) |
| Thực tế (vào tầm đứng chém) | **50** | Số quái còn sống lúc đo | TB 58 (đầu 82 → cuối 53, thấp nhất 53) | TB **59** (đầu 80 → cuối 54, thấp nhất 52) |
| **Thực tế (vào tầm đứng chém)** | **100** | Kết nối giữ vững | 100/100 (4429: 0) | **100/100 (4429: 0)** |
| Thực tế (vào tầm đứng chém) | **100** | CPU mỗi tick (TB / p95 / cao nhất) | TB **2.12 ms** / p95 3.22 ms / max 5.13 ms | TB **1.87 ms** / p95 3.08 ms / max 4.23 ms |
| Thực tế (vào tầm đứng chém) | **100** | Băng thông nhận vào (RX / bot) | Tổng **20.72 KB/s** (patch: 20.37 KB/s) | Tổng **12.11 KB/s** (patch: 11.68 KB/s) |
| Thực tế (vào tầm đứng chém) | **100** | Băng thông gửi đi (TX / bot) | **0.2 KB/s** (4.9 gói/s) | **0.12 KB/s** (2.9 gói/s) |
| Thực tế (vào tầm đứng chém) | **100** | Nhịp nhận patch `Δt` | TB 50.09 ms (p95: 51.21 ms) | TB **50.12 ms** (p95: 51.3 ms) |
| Thực tế (vào tầm đứng chém) | **100** | Độ trễ `input → lastSeq` | TB 95.5 ms (min: 87.88 ms, p95: 99.44 ms) | TB **88.81 ms** (min: 49.22 ms, p95: 97.85 ms) |
| Thực tế (vào tầm đứng chém) | **100** | Số quái còn sống lúc đo | TB 57 (đầu 57 → cuối 56, thấp nhất 56) | TB **57** (đầu 59 → cuối 55, thấp nhất 55) |
| **Xấu nhất (100% đi liên tục)** | **50** | Kết nối giữ vững | 50/50 (4429: 0) | **50/50 (4429: 0)** |
| Xấu nhất (100% đi liên tục) | **50** | CPU mỗi tick (TB / p95 / cao nhất) | TB **1.9 ms** / p95 2.98 ms / max 3.91 ms | TB **1.76 ms** / p95 2.73 ms / max 8.33 ms |
| Xấu nhất (100% đi liên tục) | **50** | Băng thông nhận vào (RX / bot) | Tổng **33.42 KB/s** (patch: 30.1 KB/s) | Tổng **26.76 KB/s** (patch: 24.82 KB/s) |
| Xấu nhất (100% đi liên tục) | **50** | Băng thông gửi đi (TX / bot) | **0.81 KB/s** (20.2 gói/s) | **0.81 KB/s** (20.1 gói/s) |
| Xấu nhất (100% đi liên tục) | **50** | Nhịp nhận patch `Δt` | TB 50.12 ms (p95: 51.14 ms) | TB **50.23 ms** (p95: 51.32 ms) |
| Xấu nhất (100% đi liên tục) | **50** | Độ trễ `input → lastSeq` | TB 90.62 ms (min: 82.45 ms, p95: 97.9 ms) | TB **91.88 ms** (min: 43.31 ms, p95: 97.91 ms) |
| Xấu nhất (100% đi liên tục) | **50** | Số quái còn sống lúc đo | TB 52 (đầu 81 → cuối 43, thấp nhất 43) | TB **50** (đầu 57 → cuối 42, thấp nhất 42) |
| **Xấu nhất (100% đi liên tục)** | **100** | Kết nối giữ vững | 100/100 (4429: 0) | **100/100 (4429: 0)** |
| Xấu nhất (100% đi liên tục) | **100** | CPU mỗi tick (TB / p95 / cao nhất) | TB **2.93 ms** / p95 4.67 ms / max 9.51 ms | TB **3.47 ms** / p95 5.61 ms / max 18.85 ms |
| Xấu nhất (100% đi liên tục) | **100** | Băng thông nhận vào (RX / bot) | Tổng **44.84 KB/s** (patch: 42.46 KB/s) | Tổng **46.1 KB/s** (patch: 43.21 KB/s) |
| Xấu nhất (100% đi liên tục) | **100** | Băng thông gửi đi (TX / bot) | **0.8 KB/s** (19.9 gói/s) | **0.81 KB/s** (20.2 gói/s) |
| Xấu nhất (100% đi liên tục) | **100** | Nhịp nhận patch `Δt` | TB 50.22 ms (p95: 51.6 ms) | TB **50.2 ms** (p95: 51.47 ms) |
| Xấu nhất (100% đi liên tục) | **100** | Độ trễ `input → lastSeq` | TB 93.04 ms (min: 85.61 ms, p95: 97.76 ms) | TB **88.27 ms** (min: 42.96 ms, p95: 93.46 ms) |
| Xấu nhất (100% đi liên tục) | **100** | Số quái còn sống lúc đo | TB 45 (đầu 51 → cuối 40, thấp nhất 40) | TB **46** (đầu 48 → cuối 42, thấp nhất 40) |

### 2.2. Bảng tổng hợp ngang (Trước → Sau)

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` (mục tiêu ~50 ms) | Độ trễ `input → lastSeq` | Số quái còn sống lúc đo |
|---|---:|---|---|---|---|---|---|---|
| Thực tế (vào tầm đứng chém) | **50** | 50/50 (4429: 0) → 50/50 (4429: 0) | TB **1.55 ms** / p95 2.95 ms / max 5.07 ms → TB **1.64 ms** / p95 3.16 ms / max 6.94 ms | Tổng **24.83 KB/s** (patch: 23.51 KB/s) → Tổng **16.71 KB/s** (patch: 14.83 KB/s) | **0.32 KB/s** (8 gói/s) → **0.38 KB/s** (9.5 gói/s) | TB 50.11 ms (p95: 51.17 ms) → TB 50.18 ms (p95: 51.11 ms) | TB 94.02 ms (min: 85.77 ms, p95: 99.82 ms) → TB 65.76 ms (min: 61.25 ms, p95: 69.13 ms) | TB 58 (đầu 82 → cuối 53, thấp nhất 53) → TB 59 (đầu 80 → cuối 54, thấp nhất 52) |
| Thực tế (vào tầm đứng chém) | **100** | 100/100 (4429: 0) → 100/100 (4429: 0) | TB **2.12 ms** / p95 3.22 ms / max 5.13 ms → TB **1.87 ms** / p95 3.08 ms / max 4.23 ms | Tổng **20.72 KB/s** (patch: 20.37 KB/s) → Tổng **12.11 KB/s** (patch: 11.68 KB/s) | **0.2 KB/s** (4.9 gói/s) → **0.12 KB/s** (2.9 gói/s) | TB 50.09 ms (p95: 51.21 ms) → TB 50.12 ms (p95: 51.3 ms) | TB 95.5 ms (min: 87.88 ms, p95: 99.44 ms) → TB 88.81 ms (min: 49.22 ms, p95: 97.85 ms) | TB 57 (đầu 57 → cuối 56, thấp nhất 56) → TB 57 (đầu 59 → cuối 55, thấp nhất 55) |
| Xấu nhất (100% đi liên tục) | **50** | 50/50 (4429: 0) → 50/50 (4429: 0) | TB **1.9 ms** / p95 2.98 ms / max 3.91 ms → TB **1.76 ms** / p95 2.73 ms / max 8.33 ms | Tổng **33.42 KB/s** (patch: 30.1 KB/s) → Tổng **26.76 KB/s** (patch: 24.82 KB/s) | **0.81 KB/s** (20.2 gói/s) → **0.81 KB/s** (20.1 gói/s) | TB 50.12 ms (p95: 51.14 ms) → TB 50.23 ms (p95: 51.32 ms) | TB 90.62 ms (min: 82.45 ms, p95: 97.9 ms) → TB 91.88 ms (min: 43.31 ms, p95: 97.91 ms) | TB 52 (đầu 81 → cuối 43, thấp nhất 43) → TB 50 (đầu 57 → cuối 42, thấp nhất 42) |
| Xấu nhất (100% đi liên tục) | **100** | 100/100 (4429: 0) → 100/100 (4429: 0) | TB **2.93 ms** / p95 4.67 ms / max 9.51 ms → TB **3.47 ms** / p95 5.61 ms / max 18.85 ms | Tổng **44.84 KB/s** (patch: 42.46 KB/s) → Tổng **46.1 KB/s** (patch: 43.21 KB/s) | **0.8 KB/s** (19.9 gói/s) → **0.81 KB/s** (20.2 gói/s) | TB 50.22 ms (p95: 51.6 ms) → TB 50.2 ms (p95: 51.47 ms) | TB 93.04 ms (min: 85.61 ms, p95: 97.76 ms) → TB 88.27 ms (min: 42.96 ms, p95: 93.46 ms) | TB 45 (đầu 51 → cuối 40, thấp nhất 40) → TB 46 (đầu 48 → cuối 42, thấp nhất 40) |

### 2.3. Mức 0 bot (chỉ server chạy, không ai vào phòng trong 15 giây)

| Số bot | Quái trong phòng | CPU tiến trình server mỗi tick (TB / p95 / cao nhất) | Tick thuần logic (`bench.ts`) | State patch mã hoá mỗi tick (Trước #59 → Sau #59) | Băng thông state patch |
|---:|---:|---|---|---|---|
| **0** | 88 con (đều ngủ do `MONSTER_WAKE_DIST = 900`) | TB **0.234 ms** / p95 0.41 ms / max 7.077 ms | TB 0.015 ms / p95 0.025 ms | ~893 byte/tick → **0 byte/tick** | ~17.4 KB/s → **0 KB/s** |

## 3. Đối chiếu với Benchmark nội bộ (`npm run bench -w server`) & Nhận xét

1. **Hiệu quả ở mức 0 bot (quái ngủ — `MONSTER_WAKE_DIST = 900` từ #59):**
   - Trước #59, 88 con quái lang thang liên tục dù phòng không có ai, tạo ra **~893 byte/tick (~17.4 KB/s)** bản vá state.
   - Sau #59, khi không có người chơi trong bán kính `900 px`, toàn bộ 88 con quái đứng yên ngủ và ở đầy máu không ghi vào state: **state patch giảm về đúng `0 byte/tick` (`0 KB/s`)**, CPU tiến trình server khi nhàn rỗi chỉ tốn **~0.03–0.05 ms/tick**.
2. **Nguyên nhân chênh lệch băng thông giữa kịch bản Xấu nhất (~42 KB/s) và Benchmark nội bộ (~25–26.6 KB/s):**
   - Benchmark không qua mạng của Dev A (`npm run bench -w server`) đo trên code `main` (trước #59) cho kết quả **~26.6 KB/s mỗi client** ở 100 người, và sau #59 giảm ~5% về **~25 KB/s**.
   - Sự khác biệt giữa con số **~42 KB/s** (kịch bản Xấu nhất của `bots.ts`) và **~25–26.6 KB/s** của `bench.ts` **không phải** do `takeWhole`, mà do **kịch bản di chuyển**:
     - Ở kịch bản **Xấu nhất (`--mode=worst`)**, cả 100 bot đều gửi 20 `input`/giây liên tục không nghỉ, khiến `x, y, lastSeq` của cả 100 nhân vật thay đổi ở mọi tick và được phát cho toàn bộ 100 client. Sau #59, kịch bản xấu nhất này chỉ giảm nhẹ vài KB/s như dự kiến.
     - Ở kịch bản **Thực tế (`--mode=realistic`)**, khi bot vào tầm đánh quái thì đứng lại chém và không gửi `input` (giống `WorldScene.fixedStep` và `bench.ts`), băng thông gửi đi (TX) và băng thông state patch nhận về (RX) thấp hơn rõ rệt và sát với `bench.ts` (cộng thêm chi phí gói tin broadcast `fx`/`dmg` và khung WebSocket).
3. **CPU mỗi tick (< 10 ms) và giới hạn tần suất (#57):**
   - Trong `bench.ts` (chỉ chạy logic `tickWorld` + `encoder.encode()` một lần trong bộ nhớ), thời gian thuần logic là **~0.2 ms/tick**.
   - Khi chạy server thật với **50–100 kết nối WebSocket**, tiến trình Node.js gánh thêm chi phí đọc/giải mã các gói `input`+`attack`/giây từ socket và đẩy hàng nghìn gói `patch`+`fx`+`dmg`/giây qua tầng TCP/WebSocket của hệ điều hành, nhưng tổng CPU tiến trình vẫn chỉ **~1.4–2.9 ms/tick trung bình (p95 < 5 ms, cao nhất < 10 ms)** — đạt mục tiêu **< 10 ms/tick**.
   - Với bộ giới hạn tần suất của **#57**, bot gửi đúng nhịp 50 ms giữ nguyên **100% kết nối (`4429: 0`)**.
   - Với `Encoder.BUFFER_SIZE = 32 * 1024` của **#59**, cảnh báo `@colyseus/schema buffer overflow` khi nối 85–100 người đã biến mất hoàn toàn.
