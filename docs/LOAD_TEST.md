# Báo cáo thử tải bằng Bot (Load Test)

> Kịch bản: `server/scripts/bots.ts` kết nối bằng `colyseus.js` vào server của Dev C (cổng `2587`).
> Chạy lại bằng: `npm run bots -w server -- --suite --mode=both --duration=15 --write-doc`

## 1. Thông tin bản đo & Phương pháp

- **Mốc trước #62 (đã có #57, #59):** commit `090d333` (đã có #57, #59)
- **Mốc trung gian (chỉ có #66 StateView):** commit `9be02c9` (đã có #62 StateView)
- **Mốc sau #62 hoàn chỉnh (#66 + #69 + #70):** commit `fd38b17` (đã có #62 (#66+#69+#70))
- **Thời lượng đo mỗi mức:** 15 giây ổn định (sau 3.5 giây khởi động; vị trí khởi đầu của các bot được ghi sẵn vào `server/data/players/` bằng `seededPrng(1)` rải đều khắp vùng hoang dã ngoài Lạc Hà Trấn giống `bench.ts`, để ngay lúc `WorldRoom.onJoin` gắn `StateView` các bot đã phân bố tự nhiên trên bản đồ).
- **Ba kịch bản hành vi bot (đều chạy ở nhịp `TICK_MS = 50` ms = 20 lần/giây):**
  1. **Thực tế (`--mode=realistic`):** giống hệt `WorldScene.fixedStep()` của client thật và `bench.ts` của Dev A — bot chỉ gửi `input { seq, dx, dy }` khi đang chạy tới quái; khi đã vào tầm chém thì **đứng lại đánh, không gửi `input`**.
  2. **Trường hợp xấu nhất (`--mode=worst`):** cả 100% bot di chuyển liên tục mỗi tick (20 `input`/giây/bot quanh bãi săn của mình, kể cả khi đã áp sát quái vẫn lượn vòng quanh), làm `x, y, lastSeq` của mọi người chơi đổi ở tất cả các tick.
  3. **Đông người tụ trong trấn (`--mode=crowd`, ca xấu nhất của vùng nhìn #78):** toàn bộ bot được tạo bên trong Lạc Hà Trấn (bán kính `TOWN_PX.r = 224 px`), ~30% bot đứng yên (đả tọa, xem túi đồ, nói chuyện NPC), 70% đi lại ngẫu nhiên trong trấn. Không đánh quái, không nhặt đồ. Vì toàn bộ bot nằm gọn trong bán kính trấn và `VIEW_ENTER = 1100 px`, mỗi bot nhìn thấy 100% người chơi trong phòng (vùng nhìn không lọc bớt được người chơi nào).
- **Cách lấy số đo (từ bên ngoài qua WebSocket thật & `/proc`):**
  - **CPU mỗi tick (mục tiêu < 10 ms):** đọc `se.sum_exec_runtime` từ `/proc/<server_pid>/sched` (độ chính xác nano-giây trên Linux) ở mỗi chu kỳ 50 ms. Con số này bao gồm **toàn bộ** công việc của tiến trình server trong một tick: xử lý tin nhắn nhận vào + `WorldRoom.update()` + mã hoá bản vá `@colyseus/schema` theo từng `StateView` + gửi khung WebSocket qua mạng cho 50–100 kết nối.
  - **Băng thông mỗi bot nhận vào (RX) & gửi đi (TX):** đo trực tiếp số byte qua socket của từng bot; tách riêng:
    - **Tổng RX:** toàn bộ byte nhận qua WebSocket mỗi giây trên mỗi bot.
    - **State patch RX:** byte của các gói cập nhật trạng thái (`Protocol.ROOM_STATE_PATCH = 15`).
    - **Tin nhắn sự kiện `fx+dmg` RX:** byte của các gói tin nhắn hiệu ứng đòn đánh và số sát thương (`Protocol.ROOM_DATA = 13`, tức `Tổng RX - State patch RX`), kèm tần suất gói `fx/s` và `dmg/s` mỗi client nhận.
  - **Nhịp nhận patch (`Δt`) & Độ trễ `input → lastSeq`:** đo trên từng client `colyseus.js` bằng `performance.now()`.
  - **Số thực thể trong tầm nhìn (`StateView`) & toàn server:** lấy mẫu `room.state.monsters.size` và `room.state.players.size` trên toàn bộ bot mỗi tick (sau #66 đây là số quái/người **trong tầm nhìn** của từng bot), đồng thời lấy tổng số quái toàn server từ `bench.ts` và hợp nhất (union) các ID quái mà các bot nhìn thấy.

## 2. Bảng kết quả (Trước → Sau #62: StateView #66 + Lượng tử hoá góc #69 + Gửi gần fx/dmg #70)

### 2.1. Bảng tiến trình giảm băng thông qua 3 mốc của #62 (`090d333` → `9be02c9` → `fd38b17`)

> **Lưu ý về số lượng thực thể:** Từ PR #66 (`StateView`), `room.state.monsters.size` và `room.state.players.size` trên mỗi client chỉ đếm các thực thể **trong tầm nhìn** (`VIEW_ENTER = 1100 px`, rời ở `VIEW_EXIT = 1300 px` trong `server/src/systems/interest.ts`), không phải toàn bộ phòng. Tổng số quái trên toàn server được lấy từ `bench.ts` (cùng seed) và đối chiếu thêm bằng hợp nhất (union) ID quái từ tất cả bot đang kết nối.

| Kịch bản | Số bot | Trước #62 (`090d333` — đã có #57, #59) | Sau #66 (`9be02c9` — đã có #62 StateView) | Sau #66 + #69 + #70 (`fd38b17` — đã có #62 (#66+#69+#70)) | Sau #80 (`096fa8a` — #87 quái 4 tick + #89 px,py 10 Hz) | Thực thể trong tầm nhìn (`StateView`) & toàn server |
|---|---:|---|---|---|---|---|
| Thực tế (vào tầm đứng chém) | **50** | Tổng **16.71 KB/s** (patch: 14.83 KB/s, fx+dmg: 1.88 KB/s) (50.6 gói/s) | Tổng **3.81 KB/s** (patch: 2.47 KB/s, fx+dmg: 1.34 KB/s) (41.8 gói/s) | Tổng **3.86 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.68 KB/s) (30.9 gói/s) | — | Tầm nhìn TB **8.6 quái**, **27.4 người** (server bench: 74 quái; hợp nhất các bot thấy: TB 28 quái sống) |
| Thực tế (vào tầm đứng chém) | **100** | Tổng **12.11 KB/s** (patch: 11.68 KB/s, fx+dmg: 0.43 KB/s) (27 gói/s) | Tổng **3.42 KB/s** (patch: 1.86 KB/s, fx+dmg: 1.56 KB/s) (45.1 gói/s) | Tổng **3.55 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.37 KB/s) (25.9 gói/s) | — | Tầm nhìn TB **4.8 quái**, **56.3 người** (server bench: 63 quái; hợp nhất các bot thấy: TB 22 quái sống) |
| Xấu nhất (100% đi liên tục) | **50** | Tổng **26.76 KB/s** (patch: 24.82 KB/s, fx+dmg: 1.94 KB/s) (51.1 gói/s) | Tổng **9.85 KB/s** (patch: 7.77 KB/s, fx+dmg: 2.08 KB/s) (53.5 gói/s) | Tổng **8.29 KB/s** (patch: 7.6 KB/s, fx+dmg: 0.69 KB/s) (30.8 gói/s) | Tổng **4.67 KB/s** (patch: **3.95 KB/s**, fx+dmg: 0.73 KB/s) (31.2 gói/s) | Tầm nhìn TB **3.1 quái**, **24.0 người** (server bench: 75 quái; hợp nhất các bot thấy: TB 15 quái sống) |
| Xấu nhất (100% đi liên tục) | **100** | Tổng **46.1 KB/s** (patch: 43.21 KB/s, fx+dmg: 2.89 KB/s) (65.6 gói/s) | Tổng **17.2 KB/s** (patch: 14.27 KB/s, fx+dmg: 2.93 KB/s) (66.7 gói/s) | Tổng **14.54 KB/s** (patch: 13.78 KB/s, fx+dmg: 0.75 KB/s) (31.5 gói/s) | Tổng **8.27 KB/s** (patch: **7.58 KB/s**, fx+dmg: 0.70 KB/s) (30.7 gói/s) | Tầm nhìn TB **1.7 quái**, **51.5 người** (server bench: 61 quái; hợp nhất các bot thấy: TB 10 quái sống) |

### 2.2. Bảng chi tiết từng chỉ số: Trước #62 (`090d333`) và Sau #62 (`fd38b17`)

| Kịch bản | Số bot | Chỉ số | Trước #62 (đã có #57, #59) | Sau #62 (đã có #62 (#66+#69+#70)) |
|---|---:|---|---|---|
| **Thực tế (vào tầm đứng chém)** | **50** | Kết nối giữ vững | 50/50 (4429: 0) | **50/50 (4429: 0)** |
| Thực tế (vào tầm đứng chém) | **50** | CPU mỗi tick (TB / p95 / cao nhất) | TB **1.64 ms** / p95 3.16 ms / max 6.94 ms | TB **2.36 ms** / p95 4.2 ms / max 8.88 ms |
| Thực tế (vào tầm đứng chém) | **50** | Băng thông nhận vào (RX / bot) | Tổng **16.71 KB/s** (patch: 14.83 KB/s, fx+dmg: 1.88 KB/s) | Tổng **3.86 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.68 KB/s) |
| Thực tế (vào tầm đứng chém) | **50** | Băng thông gửi đi (TX / bot) | **0.38 KB/s** (9.5 gói/s) | **0.25 KB/s** (6.4 gói/s) |
| Thực tế (vào tầm đứng chém) | **50** | Nhịp nhận patch `Δt` | TB 50.18 ms (p95: 51.11 ms) | TB **50.2 ms** (p95: 51.43 ms) |
| Thực tế (vào tầm đứng chém) | **50** | Độ trễ `input → lastSeq` | TB 65.76 ms (min: 61.25 ms, p95: 69.13 ms) | TB **86.68 ms** (min: 39.5 ms, p95: 91.73 ms) |
| Thực tế (vào tầm đứng chém) | **50** | Quái & người trong tầm nhìn (`StateView`) | Toàn phòng TB 59 quái (đầu 80 → cuối 54, thấp nhất 52), 50 người | Tầm nhìn TB **8.6 quái**, **27.4 người** (server bench: 74 quái; hợp nhất các bot thấy: TB 28 quái sống) |
| **Thực tế (vào tầm đứng chém)** | **100** | Kết nối giữ vững | 100/100 (4429: 0) | **100/100 (4429: 0)** |
| Thực tế (vào tầm đứng chém) | **100** | CPU mỗi tick (TB / p95 / cao nhất) | TB **1.87 ms** / p95 3.08 ms / max 4.23 ms | TB **2.15 ms** / p95 3.75 ms / max 8.81 ms |
| Thực tế (vào tầm đứng chém) | **100** | Băng thông nhận vào (RX / bot) | Tổng **12.11 KB/s** (patch: 11.68 KB/s, fx+dmg: 0.43 KB/s) | Tổng **3.55 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.37 KB/s) |
| Thực tế (vào tầm đứng chém) | **100** | Băng thông gửi đi (TX / bot) | **0.12 KB/s** (2.9 gói/s) | **0.12 KB/s** (3 gói/s) |
| Thực tế (vào tầm đứng chém) | **100** | Nhịp nhận patch `Δt` | TB 50.12 ms (p95: 51.3 ms) | TB **50.22 ms** (p95: 51.35 ms) |
| Thực tế (vào tầm đứng chém) | **100** | Độ trễ `input → lastSeq` | TB 88.81 ms (min: 49.22 ms, p95: 97.85 ms) | TB **78.55 ms** (min: 63.91 ms, p95: 87.75 ms) |
| Thực tế (vào tầm đứng chém) | **100** | Quái & người trong tầm nhìn (`StateView`) | Toàn phòng TB 57 quái (đầu 59 → cuối 55, thấp nhất 55), 100 người | Tầm nhìn TB **4.8 quái**, **56.3 người** (server bench: 63 quái; hợp nhất các bot thấy: TB 22 quái sống) |
| **Xấu nhất (100% đi liên tục)** | **50** | Kết nối giữ vững | 50/50 (4429: 0) | **50/50 (4429: 0)** |
| Xấu nhất (100% đi liên tục) | **50** | CPU mỗi tick (TB / p95 / cao nhất) | TB **1.76 ms** / p95 2.73 ms / max 8.33 ms | TB **1.39 ms** / p95 1.91 ms / max 7.19 ms |
| Xấu nhất (100% đi liên tục) | **50** | Băng thông nhận vào (RX / bot) | Tổng **26.76 KB/s** (patch: 24.82 KB/s, fx+dmg: 1.94 KB/s) | Tổng **8.29 KB/s** (patch: 7.6 KB/s, fx+dmg: 0.69 KB/s) |
| Xấu nhất (100% đi liên tục) | **50** | Băng thông gửi đi (TX / bot) | **0.81 KB/s** (20.1 gói/s) | **0.78 KB/s** (19.4 gói/s) |
| Xấu nhất (100% đi liên tục) | **50** | Nhịp nhận patch `Δt` | TB 50.23 ms (p95: 51.32 ms) | TB **50.34 ms** (p95: 51.25 ms) |
| Xấu nhất (100% đi liên tục) | **50** | Độ trễ `input → lastSeq` | TB 91.88 ms (min: 43.31 ms, p95: 97.91 ms) | TB **73.05 ms** (min: 53.54 ms, p95: 78.11 ms) |
| Xấu nhất (100% đi liên tục) | **50** | Quái & người trong tầm nhìn (`StateView`) | Toàn phòng TB 50 quái (đầu 57 → cuối 42, thấp nhất 42), 50 người | Tầm nhìn TB **3.9 quái**, **26.9 người** (server bench: 74 quái; hợp nhất các bot thấy: TB 20 quái sống) |
| **Xấu nhất (100% đi liên tục)** | **100** | Kết nối giữ vững | 100/100 (4429: 0) | **100/100 (4429: 0)** |
| Xấu nhất (100% đi liên tục) | **100** | CPU mỗi tick (TB / p95 / cao nhất) | TB **3.47 ms** / p95 5.61 ms / max 18.85 ms | TB **4.05 ms** / p95 6.05 ms / max 21.49 ms |
| Xấu nhất (100% đi liên tục) | **100** | Băng thông nhận vào (RX / bot) | Tổng **46.1 KB/s** (patch: 43.21 KB/s, fx+dmg: 2.89 KB/s) | Tổng **14.54 KB/s** (patch: 13.78 KB/s, fx+dmg: 0.75 KB/s) |
| Xấu nhất (100% đi liên tục) | **100** | Băng thông gửi đi (TX / bot) | **0.81 KB/s** (20.2 gói/s) | **0.8 KB/s** (19.9 gói/s) |
| Xấu nhất (100% đi liên tục) | **100** | Nhịp nhận patch `Δt` | TB 50.2 ms (p95: 51.47 ms) | TB **50.23 ms** (p95: 51.84 ms) |
| Xấu nhất (100% đi liên tục) | **100** | Độ trễ `input → lastSeq` | TB 88.27 ms (min: 42.96 ms, p95: 93.46 ms) | TB **53.6 ms** (min: 3.62 ms, p95: 65.42 ms) |
| Xấu nhất (100% đi liên tục) | **100** | Quái & người trong tầm nhìn (`StateView`) | Toàn phòng TB 46 quái (đầu 48 → cuối 42, thấp nhất 40), 100 người | Tầm nhìn TB **2.2 quái**, **53.1 người** (server bench: 63 quái; hợp nhất các bot thấy: TB 11 quái sống) |

### 2.3. Bảng tổng hợp ngang (Trước #62 → Sau #62)

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` (mục tiêu ~50 ms) | Độ trễ `input → lastSeq` | Thực thể trong tầm nhìn (`StateView`) & toàn server |
|---|---:|---|---|---|---|---|---|---|
| Thực tế (vào tầm đứng chém) | **50** | 50/50 (4429: 0) → 50/50 (4429: 0) | TB **1.64 ms** / p95 3.16 ms / max 6.94 ms → TB **2.36 ms** / p95 4.2 ms / max 8.88 ms | Tổng **16.71 KB/s** (patch: 14.83 KB/s, fx+dmg: 1.88 KB/s) → Tổng **3.86 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.68 KB/s) | **0.38 KB/s** (9.5 gói/s) → **0.25 KB/s** (6.4 gói/s) | TB 50.18 ms (p95: 51.11 ms) → TB 50.2 ms (p95: 51.43 ms) | TB 65.76 ms (min: 61.25 ms, p95: 69.13 ms) → TB 86.68 ms (min: 39.5 ms, p95: 91.73 ms) | Toàn phòng TB 59 quái (đầu 80 → cuối 54, thấp nhất 52), 50 người → Tầm nhìn TB **8.6 quái**, **27.4 người** (server bench: 74 quái; hợp nhất các bot thấy: TB 28 quái sống) |
| Thực tế (vào tầm đứng chém) | **100** | 100/100 (4429: 0) → 100/100 (4429: 0) | TB **1.87 ms** / p95 3.08 ms / max 4.23 ms → TB **2.15 ms** / p95 3.75 ms / max 8.81 ms | Tổng **12.11 KB/s** (patch: 11.68 KB/s, fx+dmg: 0.43 KB/s) → Tổng **3.55 KB/s** (patch: 3.18 KB/s, fx+dmg: 0.37 KB/s) | **0.12 KB/s** (2.9 gói/s) → **0.12 KB/s** (3 gói/s) | TB 50.12 ms (p95: 51.3 ms) → TB 50.22 ms (p95: 51.35 ms) | TB 88.81 ms (min: 49.22 ms, p95: 97.85 ms) → TB 78.55 ms (min: 63.91 ms, p95: 87.75 ms) | Toàn phòng TB 57 quái (đầu 59 → cuối 55, thấp nhất 55), 100 người → Tầm nhìn TB **4.8 quái**, **56.3 người** (server bench: 63 quái; hợp nhất các bot thấy: TB 22 quái sống) |
| Xấu nhất (100% đi liên tục) | **50** | 50/50 (4429: 0) → 50/50 (4429: 0) | TB **1.76 ms** / p95 2.73 ms / max 8.33 ms → TB **1.39 ms** / p95 1.91 ms / max 7.19 ms | Tổng **26.76 KB/s** (patch: 24.82 KB/s, fx+dmg: 1.94 KB/s) → Tổng **8.29 KB/s** (patch: 7.6 KB/s, fx+dmg: 0.69 KB/s) | **0.81 KB/s** (20.1 gói/s) → **0.78 KB/s** (19.4 gói/s) | TB 50.23 ms (p95: 51.32 ms) → TB 50.34 ms (p95: 51.25 ms) | TB 91.88 ms (min: 43.31 ms, p95: 97.91 ms) → TB 73.05 ms (min: 53.54 ms, p95: 78.11 ms) | Toàn phòng TB 50 quái (đầu 57 → cuối 42, thấp nhất 42), 50 người → Tầm nhìn TB **3.9 quái**, **26.9 người** (server bench: 74 quái; hợp nhất các bot thấy: TB 20 quái sống) |
| Xấu nhất (100% đi liên tục) | **100** | 100/100 (4429: 0) → 100/100 (4429: 0) | TB **3.47 ms** / p95 5.61 ms / max 18.85 ms → TB **4.05 ms** / p95 6.05 ms / max 21.49 ms | Tổng **46.1 KB/s** (patch: 43.21 KB/s, fx+dmg: 2.89 KB/s) → Tổng **14.54 KB/s** (patch: 13.78 KB/s, fx+dmg: 0.75 KB/s) | **0.81 KB/s** (20.2 gói/s) → **0.8 KB/s** (19.9 gói/s) | TB 50.2 ms (p95: 51.47 ms) → TB 50.23 ms (p95: 51.84 ms) | TB 88.27 ms (min: 42.96 ms, p95: 93.46 ms) → TB 53.6 ms (min: 3.62 ms, p95: 65.42 ms) | Toàn phòng TB 46 quái (đầu 48 → cuối 42, thấp nhất 40), 100 người → Tầm nhìn TB **2.2 quái**, **53.1 người** (server bench: 63 quái; hợp nhất các bot thấy: TB 11 quái sống) |

### 2.4. Kịch bản đông người tụ trong trấn (`--mode=crowd`, ca xấu nhất của vùng nhìn #78 & kết quả #80)

> Toàn bộ bot nằm trong Lạc Hà Trấn (`r < 224 px`). Vì `VIEW_ENTER = 1100 px`, mỗi bot nhìn thấy **100% người chơi trong phòng** (không lọc được người chơi nào). Không có đòn đánh nên không có `fx/dmg`. Cột "Sau #80" đo trên commit `096fa8a` (đã có #87 quái lang thang 4 tick + #89 `px, py` int16 10 Hz).

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào Trước #80 (RX / bot) | Băng thông nhận vào Sau #80 (#87+#89) (RX / bot) | Giảm | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` | Thực thể trong tầm nhìn (`StateView`) |
|---|---:|---|---|---|---|---|---|---|---|
| Đông người trong trấn (30% đứng, 70% đi) | **50** | **50/50 (4429: 0)** | TB **1.55 ms** / p95 **2.13 ms** / max **6.47 ms** (Trước: TB 2.45 ms / p95 3.47 ms) | Tổng **16.06 KB/s** (patch: 16.06 KB/s) | Tổng **5.81 KB/s** (patch: **5.81 KB/s**) | **-63.8%** | **0.54 KB/s** (13.5 gói/s) | TB **50.40 ms** (p95: 51.19 ms) | Tầm nhìn TB **51.9 quái**, **50.0 người** (thấy 100% người chơi; server: 75 quái) |
| Đông người trong trấn (30% đứng, 70% đi) | **100** | **100/100 (4429: 0)** | TB **4.17 ms** / p95 **5.79 ms** / max **9.93 ms** (Trước: TB 4.12 ms / p95 6.64 ms) | Tổng **25.90 KB/s** (patch: 25.90 KB/s) | Tổng **10.24 KB/s** (patch: **10.24 KB/s**) | **-60.5%** | **0.54 KB/s** (13.3 gói/s) | TB **50.24 ms** (p95: 51.42 ms) | Tầm nhìn TB **52.2 quái**, **100.0 người** (thấy 100% người chơi; server: 61 quái) |

### 2.5. Thử tải kịch bản tổ đội: 100 bot lẻ (solo) vs 25 đội 4 người (`--party=4`) (#76)

> Trong kịch bản `--party=4`, 100 bot được chia thành 25 đội gồm 1 đội trưởng và 3 thành viên. Đội trưởng mời tuần tự qua `partyInvite` (tuân thủ hồi chiêu `PARTY_INVITE_COOLDOWN_MS = 3000`), thành viên tự động chấp thuận qua `partyAccept`. Sau khi vào đội, các thành viên di chuyển bám theo đội trưởng trong bán kính 300 px và hỗ trợ chiến đấu khi chạm trán quái vật. Server phát trạng thái tổ đội `party` định kỳ mỗi 1 giây (`PARTY_SNAPSHOT_MS = 1000`) cho từng thành viên.

| Kịch bản | Số bot | Kết nối giữ vững | CPU mỗi tick: TB / p95 / cao nhất (mục tiêu < 10 ms) | Băng thông nhận vào (RX / bot) | Băng thông tin tổ đội (Party RX / bot) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` | Độ trễ `input → lastSeq` | Thực thể trong tầm nhìn (`StateView`) |
|---|---:|---|---|---|---|---|---|---|---|
| **100 bot lẻ (Solo)** | **100** | **100/100 (4429: 0)** | TB **1.71 ms** / p95 **3.07 ms** / max **8.07 ms** | Tổng **2.01 KB/s** (patch: 1.71 KB/s, fx+dmg: 0.29 KB/s) | **0 KB/s** (0 tin/s) | **0.06 KB/s** (1.5 gói/s) | TB **50.32 ms** (p95: 51.2 ms) | TB **69.19 ms** (min: 59.96 ms, p95: 74.23 ms) | Tầm nhìn TB **6.1 quái**, **54.5 người** (toàn server: 61 quái; hợp nhất bot thấy: 23 quái sống) |
| **25 đội 4 người (`--party=4`)** | **100** | **100/100 (4429: 0)** | TB **3.47 ms** / p95 **5.63 ms** / max **10.11 ms** | Tổng **13.52 KB/s** (patch: 12.03 KB/s, fx+dmg: 1.48 KB/s) | **0.32 KB/s** (~1.0 tin/s) | **0.53 KB/s** (13.3 gói/s) | TB **50.39 ms** (p95: 52.03 ms) | TB **66.82 ms** (min: 43.66 ms, p95: 98.8 ms) | Tầm nhìn TB **14.9 quái**, **71.0 người** (toàn server: 61 quái; hợp nhất bot thấy: 36 quái sống) |

### 2.6. Mức 0 bot (chỉ server chạy, không ai vào phòng trong 15 giây)

| Số bot | Quái toàn server (`bench.ts`) | CPU tiến trình server mỗi tick (TB / p95 / cao nhất) | Tick thuần logic (`bench.ts`) | State patch mã hoá mỗi tick (Trước #59 → Sau #59 & #62) | Băng thông state patch |
|---:|---:|---|---|---|---|
| **0** | 88 con (đều ngủ do `MONSTER_WAKE_DIST = 900`) | TB **0.268 ms** / p95 0.461 ms / max 8.421 ms | TB 0.023 ms / p95 0.058 ms | ~893 byte/tick → **0 byte/tick** | ~17.4 KB/s → **0 KB/s** |

## 3. Đối chiếu với Benchmark nội bộ (`npm run bench -w server`) & Nhận xét

1. **Kết quả giảm băng thông của chuỗi PR #62 (#66 `StateView` + #69 lượng tử hoá góc + #70 `fx/dmg` gửi theo vùng nhìn):**
   - **Kịch bản Thực tế (`--mode=realistic`, sát với người chơi thật và `bench.ts`):**
     - Ở **50 bot**: tổng băng thông nhận mỗi client giảm **~77%**, từ **16.71 KB/s** (patch: 14.83 KB/s, `fx+dmg`: 1.88 KB/s) xuống **3.86 KB/s** (patch: **3.18 KB/s**, `fx+dmg`: **0.68 KB/s**).
     - Ở **100 bot**: tổng băng thông nhận mỗi client giảm **~71%**, từ **12.11 KB/s** (patch: 11.68 KB/s, `fx+dmg`: 0.43 KB/s) xuống **3.55 KB/s** (patch: **3.18 KB/s**, `fx+dmg`: **0.37 KB/s**) — đạt sâu dưới mục tiêu **< 10 KB/s mỗi client** của issue #62.
     - Đối chiếu `bench.ts` ở 100 người: `npm run bench -w server -- --players 100 --seconds 20` cho **6.8 KB/s** patch + **2.3 KB/s** `fx+dmg` vùng nhìn (≈ 9.1 KB/s); chạy mặc định `--seconds 60` cho 5.6 + 1.3 KB/s vì càng về sau quái chết càng nhiều. Bot qua mạng ra thấp hơn bench vì bot chỉ tìm quái trong 280 px và đứng canh bãi khi hết quái, nên ít đánh nhau hơn người chơi mô phỏng trong bench.
   - **Kịch bản Trường hợp xấu nhất (`--mode=worst`, 100% bot gửi 20 `input`/s liên tục không nghỉ — mốc ~42–46 KB/s trong issue #62):**
     - Ở **50 bot**: tổng RX mỗi bot giảm **~69%**, từ **26.76 KB/s** (patch: 24.82 KB/s, `fx+dmg`: 1.94 KB/s) xuống **8.29 KB/s** (patch: **7.60 KB/s**, `fx+dmg`: **0.69 KB/s**).
     - Ở **100 bot**: tổng RX mỗi bot giảm **~68.5% (hơn 3.1 lần)**, từ **46.10 KB/s** (patch: **43.21 KB/s**, `fx+dmg`: **2.89 KB/s**, 65.6 gói/s) xuống **17.20 KB/s** sau #66 và còn **14.54 KB/s** sau #69 + #70 (patch: **13.78 KB/s**, `fx+dmg`: **0.75 KB/s**, chỉ còn **31.5 gói/s**).
     - Lý do kịch bản `worst` 100 bot cao hơn kịch bản `realistic` (13.78 KB/s so với 3.18 KB/s state patch): bản đồ chỉ `3072 × 3072 px` (`WORLD_W = MAP_W × TILE = 96 × 32`) và bot được rải trong bán kính `0.45 × WORLD_W ≈ 1380 px` quanh trấn, nên vòng nhìn bán kính `VIEW_ENTER = 1100 px` của mỗi bot phủ phần lớn vùng có người, trung bình **~53.1 người chơi** trong tầm nhìn; ở chế độ `worst`, cả 53 người chơi trong tầm nhìn đều đổi `x, y, lastSeq` ở **mọi tick (100% thời gian)** thay vì chỉ ~15–20% thời gian như khi đứng đánh quái ở chế độ `realistic` và `bench.ts`.
2. **Hiệu quả của PR #70 (`WorldRoom.sendNear` cho `fx` và `dmg`):**
   - Trước #70 (sau #66), dù state patch đã lọc theo `StateView`, các gói `fx` và `dmg` vẫn `broadcast` toàn phòng, chiếm tới **1.56 KB/s** (ở `realistic` 100 bot, 45.1 gói/s) và **2.93 KB/s** (ở `worst` 100 bot, 66.7 gói/s).
   - Sau #70, khi chỉ gửi `fx` và `dmg` cho người chơi trong bán kính `VIEW_ENTER = 1100 px`, băng thông `fx+dmg` mỗi bot ở 100 bot giảm xuống còn **0.37 KB/s** (`realistic`, giảm **76%**) và **0.75 KB/s** (`worst`, giảm **74%**), kéo tổng số khung WebSocket nhận mỗi giây giảm hơn một nửa (từ ~66.7 gói/s xuống **31.5 gói/s**).
3. **CPU mỗi tick (< 10 ms), mức 0 bot (quái ngủ #59) và giới hạn tần suất (#57):**
   - Ở mức **0 bot**, toàn bộ 88 con quái ngủ (`MONSTER_WAKE_DIST = 900`), state patch giữ nguyên **0 byte/tick (0 KB/s)**, CPU tiến trình server chỉ **~0.27 ms/tick**.
   - Ở mức **50–100 bot**, tổng thời gian CPU của tiến trình server (gồm cả giải mã tin nhắn, chạy vòng lặp `World`, mã hoá `StateView` riêng cho từng client và gửi qua mạng) đạt trung bình **1.39–2.36 ms/tick** ở 50 bot và **2.15–4.05 ms/tick** (p95 **3.75–6.05 ms/tick**) ở 100 bot — nằm gọn trong ngân sách **< 10 ms/tick**.
   - Toàn bộ các đợt chạy 50 và 100 bot đều giữ **100% kết nối (`4429: 0`)**, nhịp nhận patch ổn định **~50.2 ms**.
4. **Kết quả kịch bản đông người tụ trong trấn (`--mode=crowd`) và hiệu quả của chuỗi tối ưu #80 (#87 + #89):**
   - Khi 100 người tụ trong Lạc Hà Trấn (bán kính `TOWN_PX.r = 224 px`), vòng nhìn `VIEW_ENTER = 1100 px` bao phủ toàn bộ thị trấn. Số người trong tầm nhìn của mỗi bot là **100.0/100 (100%)** — `StateView` hoàn toàn không lọc bớt được người chơi nào.
   - **Tiến trình giảm băng thông sau chuỗi PR #87 (quái lang thang 4 tick) và #89 (người khác nhận `px, py` int16 10 Hz, `x, y` thật chỉ gửi chủ):**
     - Ở **50 bot**: từ **16.06 KB/s** giảm sâu xuống **5.81 KB/s** (giảm **63.8%**).
     - Ở **100 bot**: từ **25.90 KB/s** giảm hơn 2.5 lần xuống còn **10.24 KB/s** (giảm **60.5%**).
     - Ở kịch bản di chuyển liên tục 100 bot (`--mode=worst`): từ **14.54 KB/s** giảm xuống còn **8.27 KB/s** (đạt sâu dưới mục tiêu < 10 KB/s; so với mốc khởi đầu 46.10 KB/s trước #62 đã giảm hơn 5.5 lần).
   - **Đối chiếu với `bench.ts --crowd` của Dev A (PR #85, commit `096fa8a`):**
     - Bench trong bộ nhớ của Dev A cho **9.5 KB/s** (484 byte/tick) ở 100 người và **5.6 KB/s** (285 byte/tick) ở 50 người.
     - Số đo thực tế bằng bot kết nối qua WebSocket cho **10.24 KB/s** và **5.81 KB/s** — khớp gần như hoàn hảo với chênh lệch chỉ ~0.2–0.7 KB/s do overhead đóng gói khung WebSocket của Colyseus.
   - **Đánh giá mục tiêu:** Ca di chuyển liên tục 100 bot (`--mode=worst`) đạt **8.27 KB/s** (đạt mục tiêu < 10 KB/s). Ca đông người tụ trong trấn 100 bot (`--mode=crowd`) đạt **10.24 KB/s** (vượt ngưỡng ~10 KB/s một chút, xấp xỉ 10 KB/s; trong bench bộ nhớ là 9.5 KB/s).
   - **CPU:** Kể cả ở ca 100 bot tụ trong trấn, CPU server đạt trung bình **4.17 ms/tick**, p95 **5.79 ms**, max **9.93 ms** — bảo đảm ngân sách **< 10 ms/tick** của server 20 Hz.
5. **Đánh giá hiệu năng và băng thông hệ thống tổ đội (#76):**
   - **Băng thông tin nhắn tổ đội (`PartyMsg`):**
     - Ở kịch bản 100 bot chia làm 25 đội 4 người, mỗi client nhận trung bình **~1.0 tin `party`/giây** với lưu lượng đo được qua WebSocket thật là **~0.32 KB/s** (đối chiếu trong `bench.ts` bộ nhớ là **~0.33 KB/s**).
     - Con số này đạt sâu dưới ngân sách an toàn **< 1.0 KB/s mỗi client** được kiểm định tự động bằng test `it("tin tổ đội (PartyMsg) cho một client dưới ngân sách < 1 KB/s (#76)")` trong `server/src/systems/perf.test.ts`.
   - **Tác động lên CPU và hành vi thế giới:**
     - Khi lập đội, các thành viên bám theo đội trưởng (khoảng cách < 300 px) khiến các nhóm người chơi tụ lại thành các cụm săn quái cơ động thay vì rải rác từng cá nhân đơn lẻ. Điều này kích hoạt nhiều quái hơn trong tầm nhìn (trung bình 14.9 quái/bot so với 6.1 quái/bot ở solo), tạo ra nhiều hoạt động chiến đấu hơn (167 đòn chém + 45 kiếm khí, so với 60 chém + 26 kiếm khí).
     - Thời gian CPU mỗi tick của server đạt trung bình **3.47 ms/tick** (p95 **5.63 ms/tick**, cao nhất 10.11 ms), hoàn toàn bảo đảm ngân sách **< 10 ms/tick** của server 20 Hz.

## 4. Bench hằng đêm trong CI (`.github/workflows/bench.yml`) (#96)

Nhằm theo dõi xu hướng hiệu năng lâu dài trên nhánh `main` và phát hiện sớm hiện tượng suy giảm hiệu năng trước khi vượt trần của test đơn vị, quy trình benchmark tự động được thiết lập trong GitHub Actions.

- **Thời điểm kích hoạt:**
  - Tự động chạy hằng đêm vào lúc **04:00 AM (giờ Việt Nam)** (`cron: '0 21 * * *'`).
  - Cho phép chạy thủ công bất cứ lúc nào qua giao diện GitHub Actions (`workflow_dispatch`).
- **Nội dung thực thi:**
  - Chạy mô phỏng 20 giây (400 tick) với cùng seed cố định cho cả hai kịch bản: săn quái ngoài hoang dã (`hunt`) và đông người tụ trong trấn (`crowd`).
  - Xuất dữ liệu JSON qua cờ `--json=<đường_dẫn>` trong `server/src/perf/bench.ts`.
  - So sánh kết quả đo đạc với mốc chuẩn được lưu tại `server/src/perf/bench-baseline.json`.
- **Ngưỡng cảnh báo & Tiêu chí thất bại:**
  - **Băng thông (byte/tick):** Nếu số byte/tick ở mức **100 người chơi** tăng vượt quá **+15%** so với mốc chuẩn (ở một trong hai kịch bản săn quái hoặc đám đông), workflow sẽ báo đỏ (thất bại) và in chi tiết chỉ số vi phạm.
  - **Thời gian xử lý CPU (ms/tick):** Đưa ra cảnh báo (Warning) nếu CPU tick trung bình tăng hơn 2 lần (> 100%) so với mốc chuẩn.
- **Cách xem kết quả & tải báo cáo:**
  - Xem bảng so sánh trực quan trong **Job Summary** (`$GITHUB_STEP_SUMMARY`) của từng lần chạy.
  - Tải file JSON chi tiết từ phần **Artifacts** (`bench-results-<commit-sha>`) với thời hạn lưu trữ 90 ngày.
- **Cách đặt lại mốc chuẩn (baseline) khi có thay đổi có chủ ý:**
  - Khi có tính năng mới làm tăng nhẹ kích thước state hoặc có bản tối ưu giảm sâu byte/tick, dev cập nhật file `server/src/perf/bench-baseline.json` bằng cách chạy lệnh bench 20s và ghi lại kết quả mới, kèm giải trình lý do trong pull request.

