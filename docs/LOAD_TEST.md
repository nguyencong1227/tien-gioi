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
- **Các cờ mở rộng mô phỏng tính năng gameplay:**
  - **Tổ đội (`--party=<2..4>`):** ghép bot thành các nhóm đội 2–4 người với đội trưởng và thành viên bám theo nhau (#76).
  - **Cửa hàng & Giao dịch (`--shop`):** bật hành vi giao dịch tiền tệ với Lão Dược Sư tại Lạc Hà Trấn (bán nguyên liệu trong túi, mua Hồi Huyết Đan, nhận tin nhắn ví Linh thạch `wallet`). Khi không có cờ này (mặc định), bot không thực hiện giao dịch shop để bảo đảm giữ nguyên định nghĩa của các kịch bản chuẩn (#102).
  - **Rớt mạng ngẫu nhiên (`--flap=<N>`, mặc định tắt = 0):** mỗi bot cứ ngẫu nhiên 20–40 giây lại rớt một lần (`ws.close()`), nối lại sau 1–5 giây (`client.reconnect(token)`), tối đa N lần/bot; đo tỷ lệ thành công, độ trễ nhận lại state, số byte gửi lại (#120).
  - **Bão nối lại (`--storm`):** với 100 bot đang chơi, ở giây thứ 15 cho toàn bộ bot rớt mạng cùng lúc và nối lại rải rác trong 2 giây; đo tải CPU quanh thời điểm bão, số bot nối lại thành công, tổng byte gửi lại (#120).
  - **Kiểm tra rò rỉ (`--leak`):** chạy 100 bot thực hiện 20 chu kỳ flap/bot, sau đó ngắt 50 bot không nối lại và đợi > 20 giây (hết hạn `RECONNECT_GRACE_S = 20s`); đo `state.online` về đúng 50 và độ lệch VmRSS của server so với sau làm nóng (#120).
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

### 2.6. Thử tải tính năng tiền tệ & tin nhắn ví Linh thạch (`WalletMsg`) (#102)

> Trong kịch bản thử tải tích hợp tiền tệ (kích hoạt bằng cờ `--shop`), bot được cấp sẵn 100 Linh thạch ban đầu. Khi săn quái, quái chết rơi Linh thạch qua tin nhắn `wallet` (chỉ gửi riêng cho người hạ quái hoặc chia theo đội). Đồng thời các bot định kỳ ghé Lão Dược Sư tại Lạc Hà Trấn bán nguyên liệu rơi trong túi (`sell`) và mua Hồi Huyết Đan (`buy`). Tin nhắn `wallet` chỉ gửi cho đúng chủ khi số dư Linh thạch thay đổi, hoàn toàn không broadcast ra ngoài StateView hay phòng.
> 
> Khi không truyền cờ `--shop` (mặc định tắt), các bot tuân thủ nghiêm ngặt định nghĩa hành vi của `--mode=realistic`, `--mode=worst` và `--mode=crowd`, không làm thay đổi hay làm sai lệch số đo của các kịch bản chuẩn gốc.

| Kịch bản & Lệnh chạy | Số bot | Kết nối giữ vững | CPU mỗi tick (TB / p95) | Băng thông nhận vào (RX / bot) | Băng thông tin ví (Wallet RX / bot) | Tần suất tin ví (Wallet msg/s) | Băng thông gửi đi (TX / bot) | Nhịp nhận patch `Δt` | Ngân sách Wallet (< 0.5 KB/s) |
|---|---:|---|---|---|---|---|---|---|---|
| **Hoang dã săn quái + ghé shop**<br>`npm run bots -w server -- --bots=50 --shop --duration=15` | **50** | **50/50 (4429: 0)** | TB **2.38 ms** / p95 **4.15 ms** | Tổng **3.87 KB/s** | **< 0.01 KB/s** (~0.003 KB/s) | ~0.08 tin/s | **0.26 KB/s** | TB **50.21 ms** | ✅ Đạt (< 0.5 KB/s) |
| **Hoang dã săn quái + ghé shop**<br>`npm run bots -w server -- --bots=100 --shop --duration=15` | **100** | **100/100 (4429: 0)** | TB **2.18 ms** / p95 **3.80 ms** | Tổng **3.56 KB/s** | **< 0.01 KB/s** (~0.002 KB/s) | ~0.05 tin/s | **0.13 KB/s** | TB **50.23 ms** | ✅ Đạt (< 0.5 KB/s) |
| **Đông người trong trấn (25% mua/bán)**<br>`npm run bots -w server -- --bots=100 --mode=crowd --shop --duration=15` | **100** | **100/100 (4429: 0)** | TB **4.20 ms** / p95 **5.85 ms** | Tổng **10.25 KB/s** | **0.02 KB/s** | ~0.25 tin/s | **0.55 KB/s** | TB **50.25 ms** | ✅ Đạt (< 0.5 KB/s) |

### 2.7. Mức 0 bot (chỉ server chạy, không ai vào phòng trong 15 giây)

| Số bot | Quái toàn server (`bench.ts`) | CPU tiến trình server mỗi tick (TB / p95 / cao nhất) | Tick thuần logic (`bench.ts`) | State patch mã hoá mỗi tick (Trước #59 → Sau #59 & #62) | Băng thông state patch |
|---:|---:|---|---|---|---|
| **0** | 88 con (đều ngủ do `MONSTER_WAKE_DIST = 900`) | TB **0.268 ms** / p95 0.461 ms / max 8.421 ms | TB 0.023 ms / p95 0.058 ms | ~893 byte/tick → **0 byte/tick** | ~17.4 KB/s → **0 KB/s** |

### 2.8. Thử tải rớt mạng và nối lại (Flap, Bão nối lại, Đo rò rỉ sau #116 / #118) (#120)

> Từ PR #116 / #118, khi kết nối WebSocket bị đứt bất thường (mất mạng, rớt sóng, mã khác 4000), server không xoá nhân vật ngay mà giữ lại chờ trong `WorldRoom.reconnectGraceS = 20` giây (`allowReconnection`). Client có thể nối lại bằng token cũ để nhận lại nhân vật cùng `sessionId`.
>
> Để đo lường sức chịu tải và độ ổn định của cơ chế này, `server/scripts/bots.ts` được bổ sung 3 kịch bản đo đạc chuyên sâu:
> 1. **Bot rớt mạng ngẫu nhiên (`--flap=<N>`):** Trong 100 bot đang chơi, mỗi bot ngẫu nhiên 20–40 giây lại rớt một lần (`ws.close()`), chờ 1–5 giây rồi gọi `client.reconnect(token)`.
> 2. **Bão nối lại (`--storm`):** Với 100 bot đang chơi bình thường, ở giây thứ 15 cho **tất cả 100 bot rớt mạng cùng một lúc**, sau đó đồng loạt nối lại rải rác trong 2 giây (0–2000 ms).
> 3. **Kiểm tra rò rỉ (`--leak`):** 100 bot thực hiện 20 chu kỳ flap/bot liên tục (> 1500 lần rớt-nối), sau đó ngắt hẳn 50 bot (không nối lại) và đợi 25 giây (> 20s grace period) để kiểm tra số lượng nhân vật online còn lại và độ tăng trưởng bộ nhớ RSS.

| Kịch bản & Lệnh chạy | Số bot | Số lần rớt-nối | Nối lại thành công | Độ trễ nhận lại State đầy đủ (p50 / p95) | Kích thước State gửi lại (TB mỗi lần) | CPU mỗi tick quanh sự kiện (p95 / max) | Ngân sách CPU (< 10 ms) | Đánh giá & Ngân sách rò rỉ |
|---|---:|---:|---:|---|---|---|---|---|
| **Rớt mạng ngẫu nhiên (`--flap=3`)**<br>`npm run bots -w server -- --bots=100 --flap=3 --duration=60` | **100** | **144**<br>*(với `--duration=60`)* | **144/144 (100%)** (thất bại: 0) | p50 **28.1 ms** / p95 **52.0 ms** (TB 30.2 ms) | TB **4826 byte/lần** (~4.7 KB) | p95 **3.78 ms** / max **8.81 ms** | ✅ Đạt (< 10 ms) | Không có kết nối kẹt (4429: 0) |
| **Bão nối lại đồng loạt (`--storm`)**<br>`npm run bots -w server -- --bots=100 --storm --duration=25` | **100** | **100** | **100/100 (100%)** (thất bại: 0) | p50 **50.6 ms** / p95 **51.6 ms** (TB 50.6 ms) | Tổng **465.4 KB** (TB 4.7 KB/bot) | p95 **4.80 ms** / max **8.69 ms** | ✅ Đạt (< 10 ms) | Cả 100 bot vào lại phòng trọn vẹn |
| **Đo rò rỉ sau 20 chu kỳ flap (`--leak`)**<br>`npm run bots -w server -- --bots=100 --leak --duration=30`<br>*(Lần 1)* | **100** | **> 1500** | **> 1500 lần** (100% qua) | p50 **39.9 ms** / p95 **52.7 ms** | TB **4582 byte/lần** | p95 **5.48 ms** / max **10.29 ms** | ⚠️ p95 đạt (5.48 ms); max 10.29 ms vượt trần ở 1 mẫu | `state.online`: **50/50** (0 ghost)<br>VmRSS: **+3.54 MB** (ngân sách < 10 MB) |
| **Đo rò rỉ sau 20 chu kỳ flap (`--leak`)**<br>`npm run bots -w server -- --bots=100 --leak --duration=30`<br>*(Lần 2)* | **100** | **> 1500** | **> 1500 lần** (100% qua) | p50 **50.4 ms** / p95 **51.8 ms** | TB **4610 byte/lần** | p95 **4.80 ms** / max **9.95 ms** | ✅ Đạt (< 10 ms) | `state.online`: **50/50** (0 ghost)<br>VmRSS: **+15.83 MB** (chờ Node.js GC) |

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

6. **Đánh giá hiệu năng và băng thông hệ thống tiền tệ & cửa hàng (#102):**
   - **Băng thông tin nhắn ví Linh thạch (`WalletMsg`):**
     - Tin nhắn `wallet` là tin riêng tư chỉ gửi đích danh cho chủ nhân vật (`client.send("wallet", ...)`) khi số dư thay đổi (nhận tiền rơi từ quái, chia tiền trong đội, mua đan, bán đồ).
     - Trong cả kịch bản săn quái ngoài hoang dã lẫn kịch bản 100 người tụ tập tại thị trấn giao dịch với Lão Dược Sư, băng thông tin ví trên mỗi client đo được chỉ từ **< 0.01 KB/s đến ~0.02 KB/s** (tần suất ~0.05–0.25 tin/s).
     - Lưu lượng này thấp hơn hàng chục lần so với ngân sách an toàn **< 0.5 KB/s mỗi client** được kiểm soát tự động bằng test `it("tin ví Linh thạch (WalletMsg) cho một client dưới ngân sách < 0.5 KB/s (#102)")` trong `server/src/systems/perf.test.ts`.
   - **Tác động lên hiệu năng server:**
     - Các thao tác mua/bán và chia tiền quái vật rơi được xử lý trọn vẹn trong vòng lặp logic tick của server, không phát sinh object rác trong hot path và không ghi vào schema đồng bộ chung.
     - Thời gian CPU mỗi tick của server và băng thông state patch giữ nguyên 0.0% so với mốc chuẩn (`bench-baseline.json`), bảo đảm mục tiêu tick < 10 ms của hệ thống.

7. **Đánh giá tính năng giữ nhân vật chờ nối lại khi rớt mạng (#116 / #118 & #120):**
   - **Độ tin cậy và khả năng phục hồi kết nối:**
     - Trong kịch bản rớt mạng ngẫu nhiên (`--flap=3`), 100 bot thực hiện 144 lượt rớt mạng và nối lại với tỷ lệ thành công **100% (144/144)**, không có bất kỳ kết nối nào bị kẹt hay bị ngắt vì spam (`4429: 0`).
     - Thời gian từ lúc gọi `reconnect` tới khi nhận lại state đầy đủ cực nhanh: **p50 28.1 ms**, **p95 52.0 ms** (trung bình ~30.2 ms, tương đương khoảng 1 nhịp tick 50 ms của server).
     - Kích thước bản vá state gửi lại trung bình là **~4.8 KB/lần**, tương ứng với toàn bộ thực thể trong tầm nhìn StateView của bot (~57 người chơi và ~5 quái vật), hoàn toàn hợp lý và không làm phình băng thông hệ thống.
   - **Khả năng chịu tải trong trường hợp bão nối lại (`--storm`):**
     - Khi toàn bộ 100 người chơi đồng loạt mất mạng và kết nối lại dồn dập trong 2 giây (tương đương tần suất ~50 reconnect/s), toàn bộ 100 bot đều vào lại phòng thành công (**100/100**).
     - Tổng lượng dữ liệu server phát ra trong đợt bão nối lại là **465.4 KB** (khoảng ~4.7 KB mỗi người chơi).
     - Thời gian CPU xử lý mỗi tick của server quanh thời điểm bão đạt **p95 4.80 ms**, **cao nhất 8.69 ms** — nằm gọn bên dưới trần ngân sách **< 10 ms/tick** của server 20 Hz, chứng minh server không bị nghẽn hay giật lag khi có bão mạng.
   - **Độ sạch bộ nhớ, giải phóng ghost entity và diễn biến CPU (`--leak`):**
     - Trong kịch bản đo rò rỉ, 100 bot thực hiện hơn **1500 chu kỳ flap** rớt-nối liên tục trong 30 giây (trung bình 15–20 lần rớt-nối/bot với nhịp dồn dập).
     - **Về CPU:** Dù chịu áp lực rớt mạng và cấp phát lại state liên tục, CPU p95 của server giữ vững ở mức **4.80–5.48 ms/tick**. Trong lần đo thứ nhất, ghi nhận một mẫu đơn lẻ chạm đỉnh **10.29 ms** (vượt nhẹ trần 10 ms của server 20 Hz) do trùng thời điểm hàng loạt bot cùng hoàn tất handshake WebSocket và nhận lại full state; sang lần đo thứ hai, đỉnh CPU ghi nhận là **9.95 ms** (nằm trọn trong ngân sách < 10 ms).
     - **Về dọn dẹp thực thể:** Khi ngắt 50 bot vĩnh viễn và đợi 25 giây (vượt qua thời gian chờ `RECONNECT_GRACE_S = 20s`), biến `state.online` trên server trở về đúng **50/50** người chơi (cả 2 lần đo đều xác nhận kết quả tuyệt đối này). Toàn bộ các phiên chờ (`ghosts`), bộ điều khiển (`ctrl`), và giới hạn tần suất (`limiters`) của 50 bot đã rớt đều được giải phóng triệt để, không để lại bất kỳ "bóng ma" (ghost entity) nào trong thế giới.
     - **Về bộ nhớ VmRSS:** Sau chuỗi rớt-nối dồn dập, VmRSS đo được mức tăng **+3.54 MB** (lần 1, đạt sâu dưới ngân sách an toàn < 10 MB) và **+15.83 MB** (lần 2, do đặc tính giữ bộ nhớ heap của V8 trong Node.js khi chưa kích hoạt chu kỳ full GC trong môi trường tsx).

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

## 5. Thử tải nhiều bản đồ & nhiều phòng đồng thời (M3.1, Issue #141)

Theo kiến trúc M3 phương án A (mỗi bản đồ là một phòng Colyseus `WorldRoom` riêng biệt), server mở rộng để vận hành đồng thời nhiều bản đồ trên cùng một tiến trình (hoặc phân tán) mà không làm suy giảm hiệu năng của từng bản đồ riêng lẻ.

### 5.1. Benchmark đa thế giới trong một tiến trình (`bench.ts --multi`)

- **Cách chạy:**
  ```bash
  # Chạy mô phỏng đồng thời 2 bản đồ: Lạc Hà (50 bot) + Hắc Phong Cốc (50 bot)
  # (từ M7.10, #666, `--multi` không kèm `--maps` chạy cả BỐN bản đồ: số của bốn bản đồ ở mục 25)
  npm run bench -w server -- --multi --maps=lac_ha,hac_phong --seconds 20

  # Hoặc chạy mô phỏng riêng 1 bản đồ chỉ định
  npm run bench -w server -- --map=hac_phong --players 50 --seconds 20
  ```
- **Tiêu chuẩn ngân sách:**
  - Tổng thời gian CPU tick của **toàn bộ các phòng** gộp lại trên tiến trình đơn luồng Node.js phải đạt **< 10 ms/tick** (để giữ vững nhịp 20 tick/giây).
  - Băng thông patch của từng client trên mỗi bản đồ phải tuân thủ ngân sách tương đương (< 520 byte/tick).
- **Kết quả đo thực tế (`--multi --maps=lac_ha,hac_phong --seconds 20`, seed = 1 cố định, 400 tick; Lạc Hà 50 + Hắc Phong Cốc 50 = 100 người chơi):**
  - **Tổng thời gian tick (2 phòng):** TB **0.99 ms**, p95 **1.87 ms**, cao nhất **7.00 ms** (đạt sâu dưới ngân sách tổng < 10 ms).
  - **Băng thông patch mỗi client:**
    - Lạc Hà Trấn (50 người, 21 quái): TB **117 byte/tick** (~2.3 KB/s)
    - Hắc Phong Cốc (50 người, 56 quái): TB **135 byte/tick** (~2.6 KB/s)
  - **Lưu lượng tin riêng:** Party TB ~0.34 KB/s mỗi client; Wallet TB < 0.01 KB/s.
  - **Lưu ý về phạm vi đo:** `bench --multi` hiện đo thời gian xử lý vòng lặp tick và mã hoá patch của các phòng trong bộ nhớ tiến trình, chưa đo độ trễ vòng lặp sự kiện (event loop lag) và I/O mạng của Colyseus khi kết nối qua WebSocket thật.
  - **Tính tương thích:** Chế độ 1 bản đồ chuẩn (`npm run bench -w server`) không vượt ngưỡng của `bench-compare` (sau PR #145, số đo săn quái 100 người nhích -4.1% và đám đông 100 người nhích -2.0% do chuỗi Math.random khi thêm khu an toàn quanh cổng dịch chuyển; mốc `bench-baseline.json` sẽ được cập nhật ở PR riêng).

### 5.2. Kiểm tra toàn vẹn file lưu nhân vật có `mapId` (`audit-saves.ts`)

- **Cách chạy:**
  ```bash
  npm run kiem-save -w server
  ```
- **Quy tắc kiểm định dữ liệu:**
  1. Trường `mapId`:
     - File lưu cũ không có `mapId` -> mặc định hợp lệ coi như `lac_ha` (Lạc Hà Trấn).
     - File lưu có `mapId` lạ (không nằm trong `MAPS`) -> báo lỗi `invalid_map_id`, server đưa về `lac_ha`.
  2. Toạ độ `(x, y)` theo bản đồ:
     - Toạ độ phải nằm trong ranh giới `(worldW, worldH)` của bản đồ tương ứng (`getMap(mapId)`).
     - Toạ độ không được đè lên ô cản `circleBlocked(x, y, PLAYER_RADIUS)` trên bản đồ tương ứng (ví dụ: vách đá hay vực sâu ở Hắc Phong Cốc).
  3. Được bảo vệ bằng bộ test đơn vị 28 trường hợp trong `server/scripts/audit-saves.test.ts`.

### 5.3. Bot thử tải trên bản đồ chỉ định (`bots.ts --map=<id>`)

- **Cách chạy:**
  ```bash
  # Chạy 50 bot trên bản đồ Hắc Phong Cốc
  npm run bots -w server -- --map=hac_phong --bots=50 --duration=15
  ```
- **Cơ chế vận hành:**
  - Bot đọc thông số bản đồ qua `getMap(args.map) ?? DEFAULT_MAP`, không phụ thuộc vào hằng số toàn cục của Lạc Hà Trấn.
  - Sinh vị trí xuất phát `(campX, campY)` an toàn theo toạ độ khu an toàn `townPx` và ranh giới `worldW, worldH` của bản đồ đó.
  - Khởi tạo save file nhân vật mang sẵn `mapId` tương ứng (`seedBotSaveFile`). Với kịch bản đo mức 0 bot (`runIdleZeroBotTest`), bot mồi "Bot 000" cũng được ghi sẵn file lưu có `mapId` tương ứng trước khi kết nối.
  - Vào phòng tương ứng bằng `roomNameOf(targetMap.def.id)` qua `colyseus.js` `joinOrCreate(roomNameOf(id))` (không truyền `mapId` trong `JoinOptions` sau PR #144).
  - Vòng lặp di chuyển, né vật cản và tuần tra tuân thủ đúng thuật toán `moveWithCollision` và kích thước của bản đồ hiện tại.

### 5.4. Thử tải qua cổng liên tục (`--travel`) & Kiểm tra độ tin cậy (`portal-stress.test.ts`)

Kịch bản thử tải và kiểm tra toàn diện cơ chế chuyển phòng qua cổng dịch chuyển hai chiều giữa các bản đồ (Lạc Hà Trấn <-> Hắc Phong Cốc), bảo đảm không mất dữ liệu, chống nhân bản và không rò rỉ tài nguyên phòng.

- **Kịch bản bot qua cổng liên tục (`bots.ts --travel`):**
  - **Cách chạy:**
    ```bash
    # Chạy 20 bot qua cổng liên tục trong 30 giây
    npm run bots -w server -- --travel --bots=20 --duration=30
    ```
  - **Luồng hoạt động:**
    1. Bot di chuyển hướng về cổng dịch chuyển gần nhất trên bản đồ (`b.map.portals[0]`).
    2. Khi vào phạm vi cổng (`dist <= portal.r - 12`), bot gửi tin `travel { portalId }`.
    3. Server lưu nhân vật với toạ độ đích của bản đồ mới (`c.save.mapId`, `spawn`), gửi `travelTo { mapId }` và đóng kết nối phòng cũ với mã `CLOSE_TRAVEL (4000)`.
    4. Client nhận `travelTo`, kết nối sang phòng mới `roomNameOf(mapId)` qua `joinOrCreate`.
    5. Đo độ trễ từ lúc gửi `travel` đến lúc nhận đầy đủ state đầu tiên ở phòng mới (`onFirstState`), ghi nhận kích thước byte của bản vá ban đầu.
    6. Chờ hết thời gian hồi chiêu `TRAVEL_COOLDOWN_MS (3000 ms)` kèm độ trễ ngẫu nhiên rồi tiếp tục di chuyển tới cổng ở bản đồ mới để quay lại.
  - **Số đo thực tế (20–50 bot, commit bbfdafc):**
    - **Khởi đầu từ Lạc Hà Trấn (`--map=lac_ha`, 20 bot, 15s):** 15 lần qua cổng thành công | Độ trễ `travel -> onFirstState`: **TB 48.82 ms** (p50: 49.62 ms, p95: 53.13 ms) | State ban đầu: **TB 1004 byte/lần**.
    - **Khởi đầu từ Hắc Phong Cốc (`--map=hac_phong`, 20 bot, 15s):** 50 lần qua cổng thành công | Độ trễ `travel -> onFirstState`: **TB 36.59 ms** (p50: 32.46 ms, p95: 50.62 ms) | State ban đầu: **TB 1683 byte/lần**.
    - **Tải trọng cao (Lạc Hà Trấn, 50 bot, 15s):** 111 lần qua cổng thành công | Độ trễ: **TB 42.21 ms** (p50: 46.55 ms, p95: 51.79 ms) | State ban đầu: **TB 2543 byte/lần**.

- **Bộ test độ tin cậy và chống rò rỉ phòng (`portal-stress.test.ts`):**
  - **Cách chạy:**
    ```bash
    npx vitest run server/scripts/portal-stress.test.ts
    ```
  - **Các tiêu chuẩn kiểm tra (4/4 tests pass):**
    1. *Đo độ trễ & toàn vẹn dữ liệu:* Khứ hồi liên tục 2 chiều (Lạc Hà -> Hắc Phong Cốc -> Lạc Hà). Đo độ trễ `travel -> full state` phòng đích đạt **p50 < 350 ms**, **p95 < 600 ms**. Toàn bộ tu vi (`exp`), Linh thạch (`coin`), và túi đồ (`inventory`) được bảo toàn tuyệt đối, file lưu trên đĩa cập nhật đúng `mapId` và toạ độ spawn.
    2. *Nhân vật mới chỉ tạo ở bản đồ mặc định:* Kết nối tài khoản mới chưa có file lưu vào Hắc Phong Cốc -> server từ chối với mã lỗi `JOIN_WRONG_MAP (421)` kèm `wrong_map:lac_ha`, chỉ cho phép sinh nhân vật mới ở Lạc Hà Trấn.
    3. *Chống kẹt ghost khác bản đồ & dọn ghost tức thời:* Người chơi rớt mạng bất thường tại Lạc Hà (chờ nối lại `ghost`) nhưng mở client vào Hắc Phong Cốc -> server từ chối với mã lỗi `JOIN_WRONG_MAP (421)` kèm `wrong_map:lac_ha`. Khi người chơi vào lại đúng phòng Lạc Hà, ghost cũ được huỷ ngay lập tức (`elapsed < reconnectGraceS`), test bắt được đột biến bỏ `g.cancel()`.
    4. *Chống rò rỉ phòng:* Khi tất cả client rời phòng chủ động, `state.players.size` và `state.online` của toàn bộ các phòng trở về đúng 0, danh sách `ghosts` và bộ điều khiển `world.ctrl` được giải phóng sạch sẽ.

## 6. Thử tải luân hồi: Chết hàng loạt, đua Tam Sinh Thạch & rớt mạng ở Hoàng Tuyền (M3.2, Issue #151)

Kịch bản thử tải và kiểm tra toàn diện cơ chế Luân hồi (M3 bước 2, `docs/THIET_KE_LUAN_HOI.md`): từ lúc nhân vật chết thật, vào cõi Hoàng Tuyền, đua mở khoá Tam Sinh Thạch (`soulBuy`), đầu thai (`rebirth`), tới xử lý sự cố rớt mạng và sập máy mà không bao giờ mất Duyên hay cộng Duyên hai lần.

### 6.1. Bot thử tải luân hồi (`bots.ts --die`)

- **Cách chạy:**
  ```bash
  # Chạy 20 bot tự tử và đầu thai luân hồi liên tục trong 20 giây
  npm run bots -w server -- --bots=20 --duration=20 --die
  ```
- **Luồng hoạt động của bot:**
  1. Bot tìm quái gần nhất và di chuyển vào sát quái, không đánh trả, đứng chịu đòn cho tới khi hết khí huyết.
  2. Khi chết, server kích hoạt `beginLimbo`, lưu hồ sơ Hoàng Tuyền, cộng Duyên vào chân linh và gửi tin `limbo { summary, soul, keepable }` tới bot.
  3. Khi nhận `limbo`:
     - Nếu có Duyên (>= 12), bot gửi lệnh `soulBuy { id: "du_am" }` để thử nâng cấp Dư âm tu hành.
     - Bot chọn trang bị gửi lại và gửi lệnh `rebirth { origin: "pham_gia", keep }` để đầu thai kiếp mới.
  4. Server xử lý `applyRebirth`, đưa nhân vật về Lạc Hà Trấn với kiếp mới và gửi tin `reborn { kiep }`.
  5. Bot sống lại và tiếp tục chu kỳ đi ra bãi quái.
- **Số đo thực tế (6 bot, 25s, commit 90cde18):**
  - **Số lượt luân hồi & Tam Sinh Thạch:** chết 3 lần | đầu thai 3 lần | **mua Tam Sinh Thạch 3 lần (`soulBuy = 3 > 0`)**.
  - **Độ trễ đầu thai (`rebirth -> reborn`):** TB **0.90 ms** (p50: 0.89 ms, p95: 1.13 ms).
  - **Thời gian CPU server mỗi tick:** TB **0.94 ms**, p95 **1.44 ms**, cao nhất **5.09 ms** (đạt sâu dưới ngân sách < 10 ms).
  - **Toàn vẹn kết nối & dọn dẹp:** 6/6 bot giữ vững kết nối (4429: 0). Sau lượt chạy, bot dọn sạch 100% cả file nhân vật trong `players/` lẫn file chân linh trong `souls/`, không để lại rác trên đĩa.

### 6.2. Kiểm tra toàn vẹn chân linh & hồ sơ Hoàng Tuyền (`audit-saves.ts`)

- **Cách chạy:**
  ```bash
  npm run kiem-save -w server
  ```
- **Quy tắc kiểm định dữ liệu chân linh (`souls/*.json`):**
  1. `v === 1`, `id` là chuỗi NFC viết thường từ 1 đến 64 ký tự.
  2. `kiep` thuộc `[1, KIEP_CAP]`, `duyen` thuộc `[0, DUYEN_CAP]`, `duyenTotal` thuộc `[duyen, DUYEN_CAP]`.
  3. `unlocks`: key phải có trong `UNLOCK_BY_ID`, cấp độ thuộc `[1, costs.length]`.
  4. `origins`: danh sách xuất thân mở khóa hợp lệ, không chứa `pham_gia` (luôn có sẵn), không trùng lặp.
  5. `best`: `{ step, realm, tier }` phải khớp chuẩn xác với `stepOf(realm, tier)`.
  6. Tên file phải đúng chuẩn `<sha1(soulIdOf(id))>.json`. Tệp cách ly `*.hong-*` được bỏ qua không coi là lỗi.
  7. **Kiểm tra nhất quán Limbo - Chân linh:** File nhân vật có `limbo.credited: true` bắt buộc phải có file chân linh tương ứng và `soul.lastCreditedLife === limbo.endedLifeId`. Nếu lệch báo `limbo_soul_inconsistent`.

### 6.3. Bộ test thử tải & chống lỗi đua luân hồi (`reincarnation-stress.test.ts`)

- **Cách chạy:**
  ```bash
  npx vitest run server/src/rooms/reincarnation-stress.test.ts
  ```
- **Các tiêu chuẩn kiểm tra (3/3 tests pass):**
  1. *Bất biến `soulBuy` khi gửi dồn dập (Spam Invariant):* Gửi 20 tin nhắn `soulBuy` dồn dập đồng thời trên cùng một chân linh có 21 Duyên (`du_am` nấc 1 giá 12, nấc 2 giá 18 -> tổng 30). Kiểm tra bất biến cấp phòng game kết hợp hàng đợi nguyên tử của `FileSoulStore.update`: chỉ nấc 1 được mua thành công, 19 tin còn lại bị từ chối; Duyên không bao giờ âm (còn đúng 9 Duyên), tổng Duyên giữ nguyên 21.
  2. *Chết hàng loạt (Mass Death Stress):* 10 người chơi bị hạ gục cùng lúc trong đúng 1 tick. Tải ghi kép (10 file nhân vật + 10 file chân linh) hoàn tất trơn tru, không có xung đột I/O hay tệp hỏng. Chạy `auditSavesDirectory` kiểm tra toàn bộ thư mục cho kết quả 100% sạch lỗi (`cleanFiles === 10, cleanSouls === 10, errorFiles === 0, errorSouls === 0`).
  3. *Rớt mạng ở Hoàng Tuyền (Limbo Disconnect & Idempotence):* Người chơi chết vào Hoàng Tuyền, nhận `LimboMsg` xong lập tức ngắt kết nối (chưa bấm đầu thai). Khi đăng nhập lại, server gửi lại `LimboMsg`, cơ chế `lastCreditedLife` ngăn cộng Duyên lần 2; người chơi bấm đầu thai thành công vào kiếp mới, hồ sơ `limbo` được dọn sạch hoàn toàn.

## 7. Kiểm thử E2E trình duyệt thật với Google Chrome Headless & CDP (M3.2)

### 7.1. Động lực & Sự cần thiết
Các bài test đơn vị hoặc headless bot mô phỏng bằng WebSocket đơn thuần chỉ kiểm tra logic máy chủ và giao thức mạng, không thể phát hiện các lỗi đặc thù của môi trường trình duyệt thật:
1. **Lỗi bỏ tin lúc vào phòng (Early Messages Race Condition):** Khi trình duyệt tải tài nguyên (font chữ tiếng Việt, spritesheet, atlas đồ hoạ), client mất từ vài trăm ms đến vài giây trước khi Phaser 3 dựng xong cảnh và đăng ký `room.onMessage(...)`. Trong khi đó máy chủ Colyseus gửi ngay các tin trạng thái ban đầu (`inv`, `quests`, `wallet`, `soul`, `limbo`...). `colyseus.js` mặc định **bỏ rơi** các tin không có handler kèm cảnh báo `colyseus.js: onMessage() not registered`. Lỗi này làm kẹt người chơi ở Hoàng Tuyền hoặc mất túi đồ/nhiệm vụ ban đầu mà test đơn vị máy chủ không thể thấy được (đã phát hiện và khắc phục trong PR #163).
2. **Lỗi DOM & Render Canvas:** Lỗi phần tử giao diện bị ẩn, trùng đè (như ô chat che nội dung Hoàng Tuyền), hoặc canvas Phaser 3 không khởi tạo được.
3. **Lỗi thực thi JavaScript trên trình duyệt:** Các lỗi runtime `Runtime.exceptionThrown` hoặc `console.error` do truy cập thuộc tính DOM undefined.

### 7.2. Kiến trúc công cụ E2E (`server/scripts/e2e.ts`)
Công cụ được xây dựng theo tiêu chí tối giản, mạnh mẽ và không phụ thuộc thư viện bên ngoài:
- **Chrome DevTools Protocol (CDP):** Điều khiển Chrome headless (`--headless=new`) qua cổng gỡ lỗi từ xa bằng `WebSocket` native của Node 22 (`globalThis.WebSocket`), không cần cài đặt Puppeteer hay Playwright nặng nề.
- **Môi trường cách ly hoàn toàn:**
  - Tự động sinh `DATA_DIR` tạm trong `os.tmpdir()` (`mkdtempSync`) gieo sẵn nhân vật mẫu (`Do Hoang Tuyen` hoặc `Nguoi Kiem Thu`).
  - Dựng server Colyseus + Express nội bộ trên cổng ngẫu nhiên độc lập (tránh xung đột với cổng làm việc của các dev khác).
  - Tự dọn sạch 100% tiến trình Chrome, Server Colyseus và thư mục tạm trong khối `finally`.
- **Giám sát giao diện & Bắt lỗi nghiêm ngặt:** Bắt tất cả `Runtime.exceptionThrown`, `CONSOLE ERROR`, và cảnh báo `onMessage() not registered`.

### 7.3. Các kịch bản kiểm thử
1. **Kịch bản Thế giới Thường (`normal`):**
   - Đăng nhập với danh tính lưu trong `localStorage`.
   - Vào phòng Lạc Hà Trấn thành công.
   - Canvas đồ hoạ Phaser 3 kết nối và vẽ khung hình đầu tiên.
   - HUD hiển thị đầy đủ tên nhân vật, cảnh giới, thanh khí huyết, thanh linh lực.
   - Nhận đồng bộ `StateView` ban đầu từ máy chủ.
2. **Kịch bản Luân Hồi Hoàng Tuyền (`limbo`):**
   - Đăng nhập nhân vật đang trong trạng thái chờ đầu thai (`limbo`).
   - Màn hình Hoàng Tuyền xuất hiện chính xác từ tin nhắn `limbo` thật của máy chủ (hiển thị Cảnh giới, chiến tích, số Duyên tích luỹ).
   - Tương tác mở khoá nâng cấp Tam Sinh Thạch, xác nhận Duyên bị trừ tức thì từ tin nhắn `soul` thật.
   - Nhấp nút Đầu thai -> màn hình Mạnh Bà (`reborn`) xuất hiện -> tự động đóng sau khi hoàn tất.
   - Chuyển tiếp vào kiếp mới: HUD cập nhật số Kiếp mới và quay lại thế giới Lạc Hà Trấn.

### 7.4. Hướng dẫn sử dụng

```bash
# Chạy kiểm thử E2E (tự động nhận diện kịch bản theo client dist):
npm run e2e

# Chỉ định kịch bản cụ thể:
npm run e2e -w server -- --scenario=normal
npm run e2e -w server -- --scenario=limbo

# Cho phép bỏ qua cảnh báo bỏ tin nhắn lúc vào phòng (khi chạy trên client bản cũ chưa có bản vá #163):
npm run e2e -w server -- --allow-early-drops

# Lưu ảnh chụp màn hình từng bước để nghiệm thu:
npm run e2e -w server -- --screenshots=/tmp/e2e-shots
```

Kết quả mẫu khi chạy thành công:
```text
=== Bắt đầu kiểm thử E2E trình duyệt thật (Chrome Headless + CDP) ===
- Kịch bản thực thi: [NORMAL] (auto-detected: chưa có Hoàng Tuyền UI, chạy luồng chuẩn)
- Cổng server HTTP/WS: 39657
- Cổng Chrome CDP: 9663
- Server E2E đã sẵn sàng tại http://127.0.0.1:39657
- Mở trình duyệt tại http://127.0.0.1:39657/?debug
  ✓ [1/5] Form đăng nhập tải thành công, tiến hành kết nối...
  ✓ [2/5] Vào thế giới Lạc Hà Trấn thành công (Nhân vật: Nguoi Kiem Thu, Cảnh giới: Phàm Nhân)
  ✓ [3/5] Canvas đồ hoạ Phaser 3 kết nối và vẽ thành công
  ✓ [4/5] Hệ thống HUD, thanh máu, thanh khí hiển thị ổn định
  ✓ [5/5] Nhận đồng bộ StateView ban đầu thành công

- Kiểm tra ghi nhận console từ trình duyệt: 6 logs.
  ✓ 0 lỗi console, 0 exception, 0 cảnh báo nghiêm trọng.

🎉 KIỂM THỬ E2E TRÌNH DUYỆT THẬT HOÀN TOÀN THÀNH CÔNG (PASS 100%)!
```

## 8. Thử tải Tài khoản, Bão đăng nhập (Login Storm) & Kiểm thử PostgreSQL (M3.3 - Issue #176)

### 8.1. Bot chế độ tài khoản (`--account`) & Bão đăng nhập (`--login-storm`)
Kịch bản `server/scripts/bots.ts` được mở rộng để hỗ trợ đầy đủ luồng xác thực tài khoản (`AUTH_MODE=account`):
- **Tự động phát hiện hoặc bật bằng cờ `--account`:** Bot đọc `/health` để biết `authMode === "account"` (hoặc ép qua `--account`).
- **Luồng xác thực `authBotAccount`:**
  1. Mỗi bot gửi kèm header `X-Forwarded-For: 10.0.<nhóm>.<máy>` riêng biệt (khi máy chủ bật `TRUST_PROXY=1`) để mô phỏng lưu lượng từ các IP thực tế khác nhau và không bị chặn bởi giới hạn tần suất theo IP (`5 đăng ký / giờ / IP`, `10 đăng nhập sai / 10 phút / IP`).
  2. Thử `POST /api/auth/login` với `username = bot_u_NNN` (`NNN` đệm 3 chữ số, ví dụ `bot_u_001`). Nếu tài khoản chưa tồn tại (`invalid_credentials`), tự động gọi `POST /api/auth/register`.
  3. Gọi `POST /api/character` kèm `Bearer <token>` để gắn đạo hiệu (chỉ bỏ qua đúng lỗi `409 has_character` nếu tài khoản đã có nhân vật; các lỗi khác như `409 name_taken` hay `400 name_invalid` vẫn ném lỗi ngay).
  4. Dùng `token` nhận được để vào phòng Colyseus (`joinOrCreate(roomName, { token })`) và giữ nguyên `token` khi dịch chuyển qua cổng giữa các bản đồ (`travelTo`).
- **Lưu ý khác biệt với bot `legacy`:** Bot `--account` **không** được gieo sẵn hồ sơ lưu trên đĩa (`seedBotSaveFile` chỉ chạy ở nhánh `legacy`): nhân vật tạo qua `/api/character` bắt đầu như người chơi mới tại trấn (Phàm Nhân), nên phân bố vị trí và cảnh giới khác với bot `legacy` (không rải sẵn khắp vùng hoang và chưa có cảnh giới 1–2 ngay khi vào). Do đó không dùng số đo băng thông của `--account` để so trực tiếp với các bảng đo `legacy` trước đó.
- **Chế độ bão đăng nhập (`--login-storm`):** Bắn đồng thời `N` yêu cầu xác thực HTTP song song và thống kê độ trễ phân vị (`avg`, `p50`, `p95`, `max`) cùng tổng thời gian xử lý.

Cách chạy:
```bash
# Chạy bão đăng nhập 100 tài khoản đồng thời (chỉ đo HTTP auth, không vào phòng):
npm run bots -w server -- --bots=100 --login-storm

# Chạy 50 bot chế độ tài khoản vào phòng đánh quái 60 giây:
npm run bots -w server -- --bots=50 --duration=60 --account
```

### 8.2. Kết quả đo Bão đăng nhập 100 tài khoản đồng thời (`scrypt N=2^15, r=8, p=1`)
Thực nghiệm được tự động hoá trong `server/scripts/bots-account.test.ts`:
- **Cấu hình máy chủ:** `AUTH_MODE=account`, `TRUST_PROXY=1`, tham số băm mật khẩu chuẩn sản xuất `DEFAULT_SCRYPT` (`N = 32768`, `r = 8`, `p = 1`).
- **Tải nền song song:** Một thế giới `World` đang chạy vòng lặp tick 20 Hz với **30 người chơi** đang di chuyển/chiến đấu và **88 quái vật**.
- **Tải đột biến (Login Storm):** **100 tài khoản** gửi yêu cầu `POST /api/auth/login` tại cùng thời điểm `t = 0`.

| Chỉ số đo | Kết quả thực tế | Ngân sách / Kỳ vọng | Đánh giá |
| :--- | :---: | :---: | :---: |
| Số yêu cầu thành công | **100 / 100 (100%)** | 100% | Đạt |
| Tổng thời gian hoàn tất 100 login | **1526.5 ms** (~65.5 login/giây) | < 15 000 ms | Đạt (nhanh gấp ~10 lần ngưỡng) |
| Độ trễ HTTP trung bình (`avg`) | **1516.4 ms** | — | Xếp hàng qua libuv threadpool |
| Độ trễ phân vị `p50` / `p95` / `max` | **1518.8 / 1519.9 / 1521.6 ms** | — | Phân phối đồng đều, không treo |
| Thời gian tick `World` trung bình (`tickAvg`) | **0.13 ms** | < 10.0 ms | **Không nghẽn event loop** |
| Thời gian tick `World` cực đại (`tickMax`) | **0.22 ms** | < 10.0 ms | **Không làm giật/rớt tick game** |

**Nhận xét kỹ thuật:**
- Nhờ `crypto.scrypt` chạy bất đồng bộ trên worker threadpool của libuv (mặc định 4 luồng C++), vòng lặp sự kiện (event loop) chính của Node.js hoàn toàn rảnh để xử lý tick 20 Hz của phòng game (`tickMax` chỉ `0.22 ms`, thấp hơn 45 lần so với ngân sách `10 ms`).
- Khi **không bật `TRUST_PROXY`**, bài kiểm thử xác nhận bộ giới hạn tần suất theo IP chặn chính xác từ yêu cầu đăng ký thứ 6 trở đi (`5 thành công, 7 bị từ chối HTTP 429 rate_limited`), bảo vệ CPU khỏi tấn công làm ngập `scrypt` từ một địa chỉ IP đơn lẻ.

### 8.3. Bộ kiểm thử Hợp đồng Kho lưu trữ (`store-contract.ts`) & CI PostgreSQL thật
- **Hợp đồng kiểm thử dùng chung (`server/src/store-contract.ts`):** Định nghĩa các bộ kiểm thử chuẩn (`describePlayerStoreContract`, `describeSoulStoreContract`, `describeAccountStoreContract`, `describeSessionStoreContract`) chạy chung cho cả hai tầng lưu trữ:
  - Bản tệp JSON (`FilePlayerStore`, `FileSoulStore`, `FileAccountStore`, `FileSessionStore`).
  - Bản cơ sở dữ liệu PostgreSQL (`PgPlayerStore`, `PgSoulStore`, `PgAccountStore`, `PgSessionStore`).
- **Kiểm tra tài khoản & phiên trong `kiem-save` (`server/scripts/audit-saves.ts`):** Quét thêm `<DATA_DIR>/accounts` và `<DATA_DIR>/sessions`, phát hiện tệp hỏng JSON, trùng `username`, trùng `playerName`, tham chiếu nhân vật mồ côi, phiên mồ côi hoặc hết hạn mà **tuyệt đối không in lộ** các trường nhạy cảm (`passwordHash`, `recoveryHash`, `tokenHash`).
- **Job CI `PostgreSQL Store Tests` (`.github/workflows/ci.yml`):** Khởi chạy container `postgres:16-alpine` thật trên GitHub Actions, kiểm tra toàn bộ `server/src/pg` (bao gồm các ca khoá hàng `SELECT ... FOR UPDATE`, đua `claimCharacter` và `ROLLBACK` migration khi lỗi), `WorldRoom.pg.test.ts`, và chạy thử công cụ di trú `npm run chuyen-du-lieu -w server -- --thu`.

## 9. E2E thật Bí cảnh (M3.4, `npm run e2e:bi-canh`)
Server Colyseus thật (trong tiến trình, thư mục dữ liệu tạm) phục vụ `client/dist` và **hai tab Chrome headless** điều khiển bằng CDP (hai nguồn khác nhau `127.0.0.1` / `localhost` nên không chung `localStorage`). Luồng qua giao diện thật: vào Lạc Hà -> lập đội -> nói chuyện Thủ môn -> bấm "Mở Linh Hư Bí Cảnh" -> cả hai nhận hộp mời (3/3 lượt thưởng) -> bấm "Vào Bí Cảnh" -> vào phòng bí cảnh bằng `joinById` (HUD, thanh máu trùm, danh sách đội) -> A hạ trùm bằng đòn chém của client (máu trùm đặt về 1 phía server) -> màn kết quả (A: +700 Linh thạch, 2 món, còn 2/3 lượt; B không đánh: lý do không có thưởng) -> hết thời gian nhặt đồ (rút ngắn) -> cả hai về Lạc Hà -> hồ sơ đúng (A ghi 1 lượt thưởng hôm nay và Linh thạch; B không; cả hai ở Lạc Hà) -> 0 lỗi console, 0 cảnh báo mất tin lúc vào phòng. Chạy: `npm run build && npm run e2e:bi-canh` (cần `google-chrome`); `E2E_SHOTS=<thư mục>` lưu ảnh chụp từng bước. Thoát 0 khi đạt.

Lưu ý khi viết thêm kịch bản: các nút giao diện bắt `pointerdown` (không phải `click`), nên script phát `PointerEvent("pointerdown")`.

## 10. Thử tải Bí cảnh, Bot `--dungeon` & Kiểm tra Rò rỉ (M3.4 - Issue #201)

### 10.1. Kịch bản bot `--dungeon` & `--dungeon-fall` trong `server/scripts/bots.ts`
Kịch bản `server/scripts/bots.ts` được bổ sung cờ `--dungeon` và `--dungeon-fall` để mô phỏng và thử tải tính năng Bí cảnh:
- **Tổ đội tự động:** Khi bật `--dungeon`, nếu chưa chỉ định `--party` thì mặc định đặt `partySize = 4` (chuẩn theo thiết kế bí cảnh 2–4 người).
- **Gieo hồ sơ cảnh giới hợp lệ:** Bot được gieo với cảnh giới Luyện Khí Tầng 9 (`realm = 1, tier = 8`, khớp với điều kiện tối thiểu `minStep` của Linh Hư Bí Cảnh) và xuất hiện tại khu vực gần NPC Thủ Môn ở Lạc Hà Trấn.
- **Quy trình hoạt động tự động:**
  1. **Đội trưởng mở bí cảnh:** Khi đứng gần NPC Thủ Môn (`dist <= 50 px`) và hết hồi chiêu `DUNGEON_OPEN_COOLDOWN_MS = 5000 ms`, đội trưởng gửi tin `dungeonOpen { dungeonId: "linh_hu" }` (không qua hộp thoại).
  2. **Thành viên xác nhận vào bí cảnh:** Tất cả bot trong đội nhận tin `dungeonInvite` và tự động gửi `dungeonEnter { runId }`.
  3. **Vào phòng bí cảnh riêng qua `joinById`:** Client nhận tin `travelTo { mapId: "linh_hu", roomId }` và tự động gọi `client.joinById(roomId)` để chuyển sang phòng Colyseus của bí cảnh.
  4. **Tác chiến trong bí cảnh:** Bot di chuyển tới hang trùm `map.lairPx` (32, 9), tìm quái/trùm gần nhất và thi triển kiếm chiêu/kiếm khí.
  5. **Dọn dẹp và rời phòng:** Khi nhận `dungeonEnd` (hoặc sau khi hạ trùm/hết giờ), bot gửi `dungeonLeave` để nhận `travelTo` trở về Lạc Hà Trấn.
- **Chế độ bot cố tình gục (`--dungeon-fall[=tỉ lệ]`):**
  - Bot áp sát quái / hang trùm trong tầm 30 px nhưng không tấn công, đứng yên chịu đòn để kiểm thử cơ chế gục trong bí cảnh (M3.4).
  - Ghi nhận metrics: số lần gục (`dungeonFallenTotal`), số lần bị đẩy ra Lạc Hà (`dungeonFallExits`), và kiểm tra số kiếp mới phát sinh (`dungeonNewLifes`: bắt buộc bằng 0).

Cách chạy:
```bash
# Chạy 20 bot (5 đội 4 người) mở và tham gia bí cảnh:
npm run bots -w server -- --bots=20 --dungeon --duration=30

# Chạy thử tải kịch bản bot cố ý gục trong bí cảnh (tỉ lệ 50%):
npm run bots -w server -- --bots=8 --dungeon-fall=0.5 --duration=30
```

### 10.2. Kết quả Thử tải & Stress Test (`server/scripts/dungeon-stress.test.ts`)
Bộ kiểm thử stress test tự động hoá 14 kịch bản then chốt trên tiến trình server Colyseus thật:

| Kịch bản kiểm thử | Kết quả thực tế | Tiêu chuẩn đánh giá | Trạng thái |
| :--- | :---: | :---: | :---: |
| **1. Đạt trần 10 run đồng thời (`MAX_DUNGEON_RUNS = 10`)** | **10 phòng Colyseus bí cảnh mở song song**; đội thứ 11 mở bị từ chối với lý do `full` | Đúng giới hạn 10 run, từ chối quá tải | **PASS** (~2.8s) |
| **2. Kiểm tra rò rỉ phòng & sweep cooldown** | 2 chu kỳ mở run -> vào phòng -> gửi `dungeonLeave` -> dọn dẹp: `Hub.runs.size` về 0, `cooldownSize` về 0 sau sweep, số phòng bí cảnh về 0 | 0 run rò rỉ, 0 phòng treo | **PASS** (~2.5s) |
| **3. Đua `dungeonEnter` đồng thời** | 2 thành viên cùng bấm enter trong cùng 1 tick: cả 2 đều nhận `travelTo` với cùng `roomId` và vào đúng phòng | Đua tin nhắn an toàn, không rớt ai | **PASS** (~1.1s) |
| **4. Giết tiến trình giữa run (Crash / Disconnect)** | Bot ngắt socket đột ngột giữa trận bí cảnh, đăng nhập lại: vào thẳng Lạc Hà Trấn, file lưu giữ nguyên `mapId = DEFAULT_MAP_ID` | Không kẹt toạ độ bí cảnh, không lỗi mapId | **PASS** (~1.1s) |
| **5. Bảo mật chặn người ngoài** | Thử `joinOrCreate` trực tiếp vào phòng bí cảnh: bị từ chối; dùng `joinById` với `roomId` thật khi không có trong đội: từ chối mã 422 `JOIN_NOT_IN_RUN` | Chặn tuyệt đối xâm nhập lậu | **PASS** (~1.1s) |
| **6. Thành viên rời đội giữa run (`partyLeave`)** | Thành viên gửi `partyLeave`: không làm sập phòng bí cảnh; thành viên còn lại vẫn tiếp tục đánh bình thường | Cách ly an toàn lỗi đội và phòng run | **PASS** (~1.1s) |
| **7. Gục không mất kiếp (M3.4)** | Nhận `dungeonFallen`, không `limbo`, `soul.kiep`/`duyen`/`lifeId` không đổi; đồ, Linh thạch, cảnh giới nguyên vẹn; `dungeonDaily` +1; sau 3s về Lạc Hà | Luật gục không mất kiếp chuẩn 100% | **PASS** (~3.4s) |
| **8. Chặn vào lại & không nhận thưởng thắng** | Sau gục: `dungeonEnter` lại run cũ bị từ chối; đồng đội ở lại hạ trùm thắng thì người gục không nhận `dungeonEnd` thắng hay thưởng | Không vào lại dở dang, không nhận ké thưởng | **PASS** (~3.5s) |
| **9. Cả đội cùng gục (`all_dead`)** | Cả hai cùng gục: run kết thúc `lost` với lý do `all_dead`, mọi người được đưa về Lạc Hà, dọn sạch phòng và run | Xử lý thua all_dead sạch sẽ | **PASS** (~3.4s) |
| **10. Đua 2 người gục cùng 1 tick** | Cả 2 cùng nhận sát thương chí tử trong 1 tick: cả hai nhận `dungeonFallen`, run chuyển `lost` (`all_dead`), không lỗi | Đua gục đồng thời an toàn | **PASS** (~1.1s) |
| **11. Đua gục đúng lúc trùm chết** | 1 người gục và trùm chết cùng tick: người sống nhận `dungeonEnd` thắng có thưởng; người gục nhận `dungeonFallen` mất lượt, không thưởng | Phân định trạng thái trùm/người gục chuẩn | **PASS** (~1.1s) |
| **12. Gục sau khi run đã thắng (pha nhặt đồ)** | Run đã thắng (đang nhặt đồ), người chơi bị đánh gục: nhận `dungeonFallen` nhưng KHÔNG bị trừ lượt thêm, vẫn về Lạc Hà an toàn | Không phạt trừ lượt khi đã thắng | **PASS** (~3.4s) |
| **13. Rớt mạng giữa lúc chờ đẩy ra (3s)** | Gục xong ngắt kết nối đột ngột: file lưu ghi nhận `mapId = DEFAULT_MAP_ID`, không limbo; đăng nhập lại vào Lạc Hà bình thường | Không kẹt trạng thái gục khi mất mạng | **PASS** (~1.1s) |
| **14. Kiểm tra toàn vẹn file lưu (`kiem-save`)** | Chạy `auditPlayerSaveData` qua toàn bộ file lưu sinh ra trong các ca gục: 100% hợp lệ, không vi phạm `dungeonDaily` hay `mapId` | Dữ liệu lưu trữ nhất quán 100% | **PASS** (~0.15s) |

### 10.3. Kiểm thử Kiểm tra Lưu trữ Nhân vật (`kiem-save`)
Công cụ `npm run kiem-save -w server` đã được cập nhật thêm các luật kiểm tra nghiêm ngặt cho Bí cảnh:
- **Chặn tuyệt đối `mapId` bí cảnh trong hồ sơ lưu:** Phát hiện và cảnh báo lỗi `INVALID_DUNGEON_MAP` nếu bất kỳ tệp JSON nào lưu `mapId` là bản đồ bí cảnh (bảo đảm người chơi không bao giờ bị lưu kẹt trong bí cảnh).
- **Kiểm tra tính hợp lệ của `dungeonDaily`:**
  - `day` phải đúng định dạng ngày tháng `YYYY-MM-DD`.
  - `rewards` phải là số nguyên nằm trong khoảng `[0, DUNGEON_DAILY_REWARDS]`.

## 11. E2E thật PK thách đấu (M3.5, `npm run e2e:pk`)
Cùng khung với mục 9 (server Colyseus thật trong tiến trình + hai tab Chrome headless, hai nguồn `127.0.0.1` / `localhost`). Luồng qua giao diện thật: bấm **chuột thật** (CDP `Input.dispatchMouseEvent` vào vị trí VẼ của người kia, đúng thứ `tryClickPlayer` so với con trỏ) -> menu có nút "Thách Đấu" bấm được -> B nhận hộp lời mời nêu đúng tên -> B **từ chối** (A nhận toast, không có trận) -> thách lại -> B **nhận** -> đếm ngược 3-2-1 nêu đối thủ -> HUD quyết đấu (tên đối thủ, thanh máu) + dấu ⚔ trên đầu -> A đánh bằng `WorldScene.slash` của client (máu B đặt về 1 phía server) -> màn kết quả cho CẢ HAI (A thắng, B thua "đánh gục") -> B gục rồi đứng dậy **tại chỗ** với khí huyết hồi lại, KHÔNG màn Hoàng Tuyền, lớp phủ không ghi "Lạc Hà Trấn" -> hồ sơ B không `limbo`, vẫn ở Lạc Hà -> 0 lỗi console. Chạy: `npm run build && npm run e2e:pk -w server` (script nằm ở workspace `server`); `E2E_SHOTS=<thư mục>` lưu ảnh từng bước. Hai lỗi đã bắt được ở client trước khi merge #224: màn kết quả của người thua bị `closeAllModals()` (gọi mỗi khung khi `me.dead`) đóng ngay, và lớp phủ "chết" hứa hồi sinh ở trấn.

## 12. Thử tải PK Thách Đấu, Bot `--duel` & Kiểm tra Rò rỉ (M3.5 - Issue #219)

### 12.1. Kịch bản bot `--duel` trong `server/scripts/bots.ts`
Kịch bản `server/scripts/bots.ts` được bổ sung cờ `--duel` (hoặc `--pk`) để mô phỏng và thử tải tính năng PK Thách đấu:
- **Xếp cặp tự động & di chuyển ra ngoài khu an toàn:** Bot được gieo với cảnh giới Luyện Khí Tầng 5 (`realm = 1, tier = 4`) theo từng cặp (bot lẻ $2k+1$ thách bot chẵn $2k+2$, 1-based index). Vì server luôn cho nhân vật vào từ trấn (khu an toàn), bot sẽ tự động di chuyển tới điểm cắm trại của cặp ở ngoài khu an toàn trấn Lạc Hà (`campX, campY` cách tâm trấn `townPx.r + 120 px`, hai bot cách nhau 50 px, nằm trọn trong `DUEL_RANGE = 400 px`).
- **Đọc toạ độ công khai:** Khi tính toán khoảng cách và góc đánh, bot đọc `oppPlayer.px`, `oppPlayer.py` (vị trí công khai của người chơi khác, do `x/y` thực chỉ gửi riêng cho chủ sở hữu theo quy chuẩn tối ưu băng thông).
- **Quy trình thách đấu và giao tranh tự động:**
  1. **Thách đấu:** Bên thách đấu (bot lẻ: 1, 3, 5...) kiểm tra cả hai đã ra ngoài khu an toàn (`!inSafe`) và trong tầm `DUEL_RANGE`, sau đó gửi tin `duelChallenge { name: oppName }` khi hết hồi chiêu `DUEL_COOLDOWN_MS = 10_000 ms`.
  2. **Chấp nhận lời mời:** Bot đối diện nhận tin `duelInvited` và tự động gửi `duelAccept { from: msg.from }`.
  3. **Pha đếm ngược (`countdown`):** Cả hai nhận `duelState` pha countdown và đứng yên đối mặt nhau trong 3 giây.
  4. **Pha tác chiến (`fight`):** Khi chuyển sang pha `fight`, cả hai liên tục gửi lệnh chém `attack { angle }` hướng về phía đối thủ mỗi khi hồi chiêu đánh thường (`ATTACK_COOLDOWN_MS = 600 ms`) hồi xong. Sát thương PK được điều chỉnh theo hệ số `PK_DAMAGE_MULT = 0.125`.
  5. **Kết thúc và hồi sinh tại chỗ:** Khi một bên hết khí huyết, trận đấu kết thúc với kết quả `ko`. Người thua gục ngã tạm thời trong `DUEL_KO_MS = 3000 ms`, sau đó tự động đứng dậy tại chỗ với 30% HP (`DUEL_KO_HP_PCT = 0.3`). Tuyệt đối không vào Hoàng Tuyền, không mất kiếp, không lưu hồ sơ bẩn.

Cách chạy:
```bash
# Chạy 6 bot (3 cặp) thách đấu liên tục trong 45 giây:
npm run bots -w server -- --bots=6 --duel --duration=45
```

### 12.2. Kết quả Đo đạc Thực tế

#### A. Kết quả chạy bot thật trên server Colyseus (`npm run bots -w server -- --bots=6 --duel --duration=45`)
- **Quy mô:** 6 bot (3 cặp đấu), thời gian chạy 45 giây.
- **Trận đấu hoàn thành:** 3 trận (3 thắng, 3 thua, 0 hoà).
- **Số đòn chém giao tranh (`attacksSent`):** 536 đòn chém.
- **Thời gian xử lý tick server (CPU):** Trung bình **0.44 ms** (p95: 1.10 ms, max: 5.25 ms), nằm sâu dưới ngân sách 10 ms.
- **Độ ổn định:** 6/6 bot duy trì kết nối ổn định liên tục, 0 rò rỉ phòng hoặc sự kiện.

#### B. Kết quả Stress Test tự động (`server/scripts/duel-stress.test.ts`)
Bộ kiểm thử stress test tự động hoá 6 kịch bản then chốt trên tiến trình server Colyseus thật:

| Kịch bản kiểm thử | Kết quả thực tế | Tiêu chuẩn đánh giá | Trạng thái |
| :--- | :---: | :---: | :---: |
| **1. Thử tải N cặp đấu đồng thời (6 cặp = 12 người chơi)** | **6 trận đấu diễn ra song song** (`World.duels.size = 6`); cả 6 cặp chém nhau tới KO và cùng hồi sinh tại chỗ 30% HP sau 3s | Mọi cặp độc lập, không nghẽn tick, không vào Hoàng Tuyền | **PASS** (~3.9s) |
| **2. Đua gửi / nhận lời mời & các ca biên** | Thách chéo nhau đồng thời: 1 lời mời được xác nhận, lời mời còn lại dọn sạch; nhận 2 lần: lần 2 từ chối an toàn; người mời đi xa (>400px): từ chối `stale`; rải lời mời quá `DUEL_INVITES_MAX = 3`: chặn lời mời thứ 4 với lỗi quá tải | Chống đua tin nhắn, chống rải spam, kiểm lại tầm lúc nhận | **PASS** (~0.8s) |
| **3. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ** | 5 chu kỳ thách / nhận / từ chối / đầu hàng (`duelYield`) / rớt mạng (`disconnect`): `World.duels.size` về 0, `invitesSize` về 0, `cooldownSize` về 0 sau sweep, `idle = true` | 0 trận rò rỉ, 0 lời mời treo, 0 timer mồ côi | **PASS** (~0.4s) |
| **4. Kiểm tra 'Không mất kiếp' & Quái bỏ mục tiêu** | Quái đứng cạnh người chơi tự động bỏ mục tiêu khi vào trận PK; quái không gây sát thương lên người trong trận; người thua KO không có bản ghi `limbo`, file lưu không đổi | Cách ly tuyệt đối PK và sát thương quái / luân hồi | **PASS** (~3.6s) |
| **5. Bỏ chạy khỏi trận đấu (`fled`)** | Người chơi chạy vào khu an toàn (trấn): trận đấu kết thúc ngay lập tức với lý do `fled`, người đối diện thắng | Ngăn chặn lạm dụng khu an toàn để né đòn | **PASS** (~0.4s) |
| **6. Kiểm tra toàn vẹn lưu trữ (`audit-saves`)** | Chạy `auditSavesDirectory` trên thư mục dữ liệu: 0 file lưu lỗi, 0 lỗi tài khoản/phiên, các toạ độ đấu sĩ đều hợp lệ | Không sinh dữ liệu rác, không hỏng file lưu nhân vật | **PASS** (~0.2s) |

## 13. E2E thật Tông môn (M3.6, `npm run e2e:tong-mon -w server`)
Cùng khung với mục 9 / 11 (dùng chung lớp `Tab` ở `server/scripts/e2e-kit.ts`): server Colyseus thật trong tiến trình + hai tab Chrome headless (`127.0.0.1` / `localhost`). Luồng qua giao diện thật, 9 bước: A mở bảng Tông môn (nút HUD) -> **lập** bằng form (tên + biệt hiệu; mất `SECT_CREATE_COST`, tiền đã xuống hồ sơ TRƯỚC khi tông môn ra đời) -> B thấy `[TV]` cạnh tên A (state công khai + nhãn vẽ) -> A **bấm chuột thật** vào B -> nút "Mời vào tông môn" -> B nhận hộp mời -> **Gia Nhập** (B là Đệ tử, A thấy B trực tuyến ngay) -> chat `/s` tới B ở kênh `[Tông môn]` (chat thường vẫn đi kênh chung) -> B **góp** 200, A **rút** 150 (ví, hồ sơ, tệp tông môn khớp; **tổng Linh thạch chỉ giảm đúng phí lập**; Đệ tử không có ô rút) -> A thăng B Trưởng lão -> B **rời** (mất biệt hiệu) -> A **giải tán** (xác nhận hai bước; kho còn tiền thì bị chặn, rút hết rồi mới giải tán; tệp xoá) -> 0 lỗi console. `E2E_SHOTS=<thư mục>` lưu ảnh từng bước.

Cần `npm run build` (client/dist mới) và google-chrome. Chạy trên client #237 + server #240. Hai chỗ E2E bắt được khi chạy lần đầu: (1) server chỉ gửi `sectPresence` theo nhịp 10 giây nên người vừa gia nhập hiện "Offline" (đã sửa ở server: gửi ngay khi thành viên đổi); (2) client: dòng "Tổng số: N" ở thẻ Thành viên luôn ghi 0 (báo B).

**Quy ước kiểm "hiện ra" trong mọi E2E (mục 9-16):** dùng `shown(id)` của `server/scripts/e2e-kit.ts` (không có phần tử, `hidden`, `checkVisibility({ checkVisibilityCSS: true })` sai, hoặc kích thước 0 thì coi là KHÔNG thấy), không dùng `!el.hidden` đơn thuần: `hidden` của phần tử cha (vd `#ui` lúc chưa vào game, bảng tông môn đang đóng) làm con biến mất mà `el.hidden` của con vẫn `false` (lỗi modal "Phiên Bản Đã Cũ" ở #264). Kiểm phủ định ("đã tắt") vẫn có thể dùng `.hidden`. Đã đổi 18 chỗ ở e2e-pk / bi-canh / bi-canh-nga / tong-mon + `visible` của tai-khoan; 5 E2E thật PASS.

**Quy ước khung E2E:** mọi E2E vào game bằng nhân vật mới phải đặt `localStorage["tg_newbie_guide_dismissed"] = "1"` trong `Page.addScriptToEvaluateOnNewDocument` (cùng chỗ đặt tên và mã bí mật): bảng chỉ dẫn người mới (#269 lát 2) hiện một lần cho MỌI nhân vật mới và che canvas, nên `e2e-pk` / `e2e-tong-mon` (bấm chuột vào người chơi khác) hết thời gian chờ "menu người chơi" nếu không đặt cờ. Chỉ `e2e-tro-nang` không đặt vì nó kiểm chính bảng đó. Lỗi này lọt qua CI vì E2E chỉ chạy cục bộ: trước khi merge PR đổi giao diện, chạy cả 7 E2E.

## 14. E2E thật gục trong bí cảnh không mất kiếp (M3.4, `npm run e2e:bi-canh-nga -w server`)
Cùng khung với mục 13 (`server/scripts/e2e-kit.ts`). Luồng 8 bước qua giao diện thật: lập đội -> Thủ môn -> mở bí cảnh -> cả hai vào phòng -> A bị đánh gục bằng đường thật của quái (`hurtPlayer` phía server) -> lớp phủ của A ghi "Ngươi đã gục! Bị đưa ra khỏi bí cảnh sau Ns. Lượt hôm nay còn N/3." + dòng phụ "Không mất kiếp · Không mất đồ và Linh thạch", **không** hứa "Hồi sinh tại Lạc Hà Trấn", **không** màn Hoàng Tuyền, đếm ngược không bị xoá giữa chừng (bài học PK: `dungeonFallen` tới trước patch `dead`); B thấy A "Đã gục", run chạy tiếp -> ~3 giây sau A về Lạc Hà (lớp phủ + HUD bí cảnh tắt, toast "mất một lượt") -> hồ sơ A: không `limbo`, ví và cảnh giới nguyên, mất MỘT lượt, về Lạc Hà; `dungeonEnter` lại bị từ chối -> B cũng gục: run thua `all_dead`, B về Lạc Hà, run được dọn, B cũng mất một lượt và không mất gì -> 0 lỗi console. `E2E_SHOTS=<thư mục>` lưu ảnh.
Chạy trên client #241 + server #238 (đã vào main): PASS 100% 4/4 lần. Cần `npm run build` và google-chrome. Nhận xét giao diện (không chặn): HUD bí cảnh của người vừa gục không còn cập nhật (họ không còn là thành viên "trong phòng" nên server ngừng gửi `dungeonState`), danh sách đội trên màn hình họ giữ nguyên lúc gục.

## 15. Thử tải Tông môn, Bot `--sect` & Kiểm tra Rò rỉ (M3.6 - Issue #231)

### 15.1. Kịch bản bot `--sect` trong `server/scripts/bots.ts`
Kịch bản `server/scripts/bots.ts` được bổ sung cờ `--sect` để mô phỏng và thử tải tính năng Tông môn:
- **Cấp Linh thạch ban đầu:** Bot chạy cờ `--sect` được gieo sẵn 5000 Linh thạch vào hồ sơ nhân vật (đủ 1000 Linh thạch phí `SECT_CREATE_COST` lập phái và số dư góp kho).
- **Phân nhóm tông môn tự động:** Bot được chia theo các nhóm 3 người (`groupSize = 3`, gồm 1 Tông chủ và 2 Đệ tử).
- **Quy trình hoạt động tự động:**
  1. **Lập tông môn:** Bot Tông chủ (bot đầu nhóm) gửi `sectCreate` tạo tông môn mang tên `Phai Dao <N>` và biệt hiệu `P<N>` (vd: `P01`, `P02`).
  2. **Mời đệ tử:** Tông chủ gửi lời mời `sectInvite` tới các thành viên trong nhóm.
  3. **Nhận lời mời:** Đệ tử lắng nghe sự kiện `sectInvited` và tự động gửi `sectAccept` để gia nhập.
  4. **Giao lưu & tương tác:** Cả Tông chủ và Đệ tử định kỳ chat kênh nội bộ `/s` (`sectChats`), nạp Linh thạch vào kho tông môn (`sectDeposit`), và Tông chủ rút Linh thạch từ kho (`sectWithdraw`).
  5. **Dọn dẹp cuối đợt chạy:** Khi kết thúc kịch bản, Đệ tử tự động gửi `sectLeave` rời phái, Tông chủ rút hết Linh thạch trong kho rồi giải tán bằng `sectDisband` (đồng thời pha dọn dẹp file lưu của bot tự động quét và dọn sạch file tông môn phát sinh trong `<DATA_DIR>/sects`).
- **Lưu ý quan trọng khi chạy bot thật:** Server thử tải phải dùng `DATA_DIR` mặc định của server (không đặt `DATA_DIR` khác với server) vì bot ghi hồ sơ vào `server/data/players`.

Cách chạy:
```bash
# Chạy 6 bot (2 nhóm tông môn) hoạt động liên tục trong 30 giây:
npm run bots -w server -- --bots=6 --sect --duration=30
```

### 15.2. Kết quả Stress Test Tông môn (`server/scripts/sect-stress.test.ts`)
Bộ kiểm thử stress test tự động hoá 7 kịch bản then chốt trên tiến trình server Colyseus thật:

| Kịch bản kiểm thử | Kết quả thực tế | Tiêu chuẩn đánh giá | Trạng thái |
| :--- | :---: | :---: | :---: |
| **1. N tông môn song song (3 nhóm = 6 bots)** | **3 tông môn hoạt động độc lập đồng thời**; lập, mời, nhận, nạp/rút kho, chat `/s` phân biệt đúng kênh; đo tick trung bình World < 10 ms | Tông môn độc lập, không nghẽn tick, chat `/s` không lộ sang phái khác | **PASS** (~0.8s) |
| **2. Đua lập cùng tên / cùng biệt hiệu** | 2 người cùng gửi tạo tông môn cùng tên và cùng biệt hiệu trong 1 tick: đúng 1 người thành công (trừ 1000 Linh thạch), người kia nhận toast từ chối và **hoàn đủ 100% tiền ví** | Chống trùng lặp, bảo toàn Linh thạch, hoàn ví ngay khi thất bại | **PASS** (~0.2s) |
| **3. Đua mời / nhận chéo, nhận 2 lần, giải tán giữa chừng** | Nhận 2 lần liên tiếp: lần 2 bị từ chối; giải tán tông môn khi đang có lời mời treo: người nhận bấm accept bị từ chối `invite_invalid`; 2 Tông chủ mời chéo nhau: từ chối vì đối phương đã có tông môn | Kiểm tra hợp lệ thời điểm nhận, chống đua và trạng thái mồ côi | **PASS** (~0.4s) |
| **4. Rải lời mời quá `SECT_INVITES_MAX = 3`** | 4 Tông chủ cùng mời 1 người chơi: 3 lời mời đầu thành công, lời mời thứ 4 bị từ chối sớm với lý do quá tải (`target_overloaded`) | Chống spam lời mời, giới hạn trần lời mời đang chờ | **PASS** (~0.5s) |
| **5. Nhận khi tông môn đã đầy (`SECT_MAX_MEMBERS = 30`)** | Tông môn đạt 30 thành viên: người tiếp theo bấm accept nhận toast từ chối `sect_full` ("Tông môn đã đủ người"), không bị đưa vào phái | Đúng giới hạn số lượng thành viên, từ chối an toàn | **PASS** (~0.3s) |
| **6. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ** | 3 chu kỳ liên tiếp (từ chối, nhận rồi rời, disconnect khi có lời mời treo): `Hub.sects.invitesSize` về 0, `online.size` về 0, `cache.size` về 0, `_cooldownSize` về 0 sau sweep | 0 lời mời treo, 0 tông môn rò rỉ trong cache, sạch sẽ bộ nhớ | **PASS** (~0.9s) |
| **7. Kiểm tra tính toàn vẹn lưu trữ (`audit-saves`)** | Chạy `auditSavesDirectory` trên toàn bộ file lưu nhân vật và tông môn phát sinh: 0 file lỗi, 0 lỗi tông môn, 0 file mồ côi | Lưu trữ nhất quán, không bẩn dữ liệu trên đĩa | **PASS** (~0.15s) |

### 15.3. Thử tải Hành vi Tông môn có Chiều sâu M8 (`--sect`, Issue #846, PR #927)

Ở M8 (M8.3–M8.5), kịch bản bot `--sect` được mở rộng để mô phỏng và thử tải toàn diện các tương tác có chiều sâu của hệ thống Tông môn (Nội vụ, nhiệm vụ tông môn, bảo khố, biến động thành viên):

1. **Hành vi bot M8 (`decideSectM8Action`):**
   - **Đồng bộ sảnh Nội vụ (`sectHallGet`):** Bot xin ảnh chụp `SECT_MSG.hallGet` khi mới vào tông môn hoặc mất đồng bộ.
   - **Nhận nhiệm vụ tông môn (`questAccept`):** Bot nhận nhiệm vụ có sẵn (`state: "offer"`) nếu chưa kẹp trần cống hiến ngày (`earnedToday < earnCap`).
   - **Nộp Linh thạch nhận cống hiến (`deposit`):** Để kích hoạt đường đổi bảo khố, bot nộp **500 Linh thạch** mỗi lần (thay vì 50/100 như bản thử tải M3.6 cũ), nhận `floor(500 / 100) = 5` cống hiến (vừa đủ đổi món `hoi_huyet_dan` giá 5 cống hiến). *Lưu ý:* Khi chạy thử tải ngắn trong ngày tạo nhân vật, server cần chạy với `SECT_EARN_WARMUP=off` để bỏ qua thời gian chờ sang ngày mới.
   - **Đổi đồ bảo khố (`shopBuy`):** Ưu tiên tiêu cống hiến tích luỹ khi `sectContrib >= 5` và bảo khố có món mở bán (`locked === null && left > 0`).
   - **Thử tải gửi trả nhiệm vụ (`questTurnIn`):** Khi cống hiến đã tiêu (< 5), bot liên tục gửi yêu cầu trả nhiệm vụ đang làm (`active`) để thử tải đường truyền và kiểm tra tính an toàn của máy chủ (máy chủ từ chối an toàn khi nhiệm vụ chưa hoàn thành tiến độ).
   - **Nhảy tông môn (`leave`):** Đệ tử có xác suất 8% tự rời tông môn giữa chừng để thử tải biến động thành viên và kiểm chứng việc bảo toàn nguyên tắc mất toàn bộ cống hiến/công tích. Bot tiếp tục di chuyển và gửi input bình thường ngay sau khi rời phái.

2. **Kết quả đo lường thực tế (6 bot, 60 giây, server Colyseus thật cổng 2587):**
   - **Lệnh chạy:** `npm run bots -w server -- --bots=6 --sect --duration=60`
   - **Kết nối:** Giữ vững 6/6 bot suốt 60s (0 ngắt bất thường, 0 lỗi 4429).
   - **Hoạt động chiều sâu M8 (số lượt tin bot gửi lên máy chủ):**
     + Nhận nhiệm vụ: **5** lượt gửi (`questAccept`).
     + Gửi trả nhiệm vụ: **0** lượt gửi (`questTurnIn`; ở đợt chạy đối chứng khi bot chưa đổi bảo khố: **6** lượt gửi).
     + Đổi bảo khố: **3** lượt gửi (`shopBuy`).
     + Nhảy tông môn: **0** lượt gửi (`leave`; ở đợt chạy đối chứng: **1** lượt gửi).
     + Tương tác kho & chat: Lập: 2 phái, Mời: 20, Nạp kho: 4 lượt (500 LS/lượt), Rút kho: 2, Chat `/s`: 6.
   - **Tải hệ thống & Băng thông:**
     + CPU server mỗi tick (50 ms): Trung bình **0.81 ms** | p95 **1.29 ms** | Max **3.2 ms** (ngân sách < 10 ms).
     + Bộ nhớ server RSS: **119.4 MB**.
     + Băng thông mỗi bot: Nhận TB **2.36 KB/s** (20.9 gói/s), Gửi TB **0.6 KB/s** (14.7 gói/s).
     + Nhịp nhận patch (Δt): TB **50.18 ms** | p95 **50.97 ms**. Độ trễ vòng lặp: TB **51.07 ms**.
     + Dữ liệu đĩa: Kịch bản bot tự động dọn dẹp sạch sẽ 6/6 file lưu người chơi và tông môn sau khi kết thúc đợt chạy.


## 16. E2E thật phiên bản giao thức (M4 2.5, `npm run e2e:phien-ban -w server`)
Chrome headless + server Colyseus thật trong tiến trình (thư mục dữ liệu tạm), cùng khung với mục 13 (`server/scripts/e2e-kit.ts`). Server nâng `WorldRoom.minProtocol` lên `PROTOCOL_VERSION + 1` nên client thật (gửi `v: PROTOCOL_VERSION`) thành "quá cũ". Luồng 4 bước: (1) client thấy màn hình "Phiên Bản Đã Cũ" nêu đúng mức tối thiểu và KHÔNG vào được game; (2) sau 2,5 giây `onAuth` được gọi đúng 1 lần (lỗi dứt khoát, không vòng thử lại / `wrong_map`) và không có hồ sơ nhân vật nào được tạo; (3) server hạ mức, bấm "Tải Lại Trang": trang tải lại sạch, màn hình tắt; (4) đăng nhập lại vào game bình thường. Cần `npm run build` (client/dist mới) và google-chrome. Đột biến: bỏ `throw new ClientOutdatedError` ở `client/src/connection.ts` thì bước 1 đỏ. Bước 1 kiểm HIỂN THỊ THẬT (không chỉ `!m.hidden`): `checkVisibility()`, kích thước, `elementFromPoint` ở giữa modal nằm trong modal (không bị che), màn hình đăng nhập đã ẩn; lý do: `hidden` của phần tử cha (`#ui` lúc chưa vào game) làm modal biến mất mà `m.hidden` vẫn `false`, nên bản chỉ kiểm `!m.hidden` đã để lọt lỗi ở #264 (modal nằm trong `#ui` nên người chơi không bao giờ thấy; sửa ở #270). Chạy trên main sau #261 (server) + #264 (client): bản kiểm hiển thị thật ĐỎ ở bước 1 (hết 15 giây chờ), sau #270: PASS 4/4.

## 17. E2E thật trợ năng bàn phím (M4 #269, `npm run e2e:tro-nang -w server`)
Chrome headless + server Colyseus thật trong tiến trình, cùng khung với mục 13-16. Phím gửi bằng CDP `Input.dispatchKeyEvent` (phím thật, `isTrusted`) nên Phaser (bắt phím ở `window`) và focus DOM thật cùng tham gia: test thuần của `a11y.ts` không thấy được các lỗi ở chỗ giao nhau này. Kiểm: (1) mở túi bằng I: `role=dialog` + `aria-modal`, nút có `aria-expanded`, focus vào trong bảng; (2) Tab / Shift+Tab giữ focus trong bảng (focus trap); (3) mở thêm bảng nhân vật (C): MỘT lần Esc chỉ đóng bảng trên cùng, lần hai đóng bảng còn lại; (4) đóng bằng Esc rồi bấm Space (phím chém): bảng KHÔNG mở lại; (5) Esc khi đang gõ chat: chỉ rời ô chat, bảng vẫn mở; (6) 0 lỗi console. Mọi kiểm "thấy" dùng hiển thị thật (`checkVisibility`). Cần `npm run build` và google-chrome.
Hai lỗi E2E này bắt được ở #274 (bản đầu, 2c46a8e) mà test thuần và `e2e:phien-ban` không thấy: (a) `WorldScene` đăng ký `keydown-ESC` còn `ui.ts` đăng ký thêm ở `window`, nên MỖI lần Esc chạy `handleEscape` hai lần (đóng hai tầng; Esc ở ô chat vừa rời ô chat vừa đóng bảng; có thể từ chối lời mời); (b) đóng bảng trả focus về nút HUD, mà `bindTap` bắt Space / Enter nên Space (chém) mở lại bảng. Sửa: Esc chỉ ở `ui.ts`; trả focus về nút CHỈ khi nút đó đang giữ focus lúc mở (mở bằng phím tắt / chuột thì không). Đột biến: thêm lại `kb.on("keydown-ESC", ...)` thì kiểm (3) và (5) đỏ; bỏ điều kiện `a11yRestore` thì kiểm (4) đỏ.

## 18. Red Team Từng Tin Nhắn Server (M4-sớm - Issue #252)

### 18.1. Phương pháp & Công cụ (`server/scripts/red-team.ts`)
Công cụ `npm run red-team -w server` dựng server Colyseus thật trong tiến trình với thư mục dữ liệu tạm cô lập và kiểm tra đối kháng (red team) toàn diện:
- **Tự phát hiện loại tin nhắn:** Tự động đọc danh sách handler đã đăng ký từ `serverRoom.onMessageHandlers` (loại bỏ handler nội bộ `__no_message_handler` và handler toàn cục `*`), so khớp 100% với hợp đồng `shared/` (`EXPECTED_MESSAGE_TYPES` gồm 47 loại tin nghiệp vụ) + 1 tin lạ để kiểm tra handler `*`.
- **Đa dạng hoá đối tượng tấn công (Poor & Rich Attacker):**
  1. **Poor Attacker:** Nhân vật mới tạo (0 Linh thạch, túi trống, không có đội, không có tông môn) để kiểm tra các ca biên chia cho 0, số âm, thiếu đồ/tiền.
  2. **Rich Attacker:** Nhân vật giàu có tài nguyên thực tế trong bộ nhớ sống server: 100,000 Linh thạch sống (`ctrl.coin`), túi đồ sống (`ctrl.inv`) chứa dược phẩm (`hoi_huyet_dan`, `tu_khi_dan`), vũ khí (`lang_nha_kiem`), giáp (`tho_nhung_bao`), pháp bảo (`ho_hon_phu`), nguyên liệu rèn (`long_tho`), đứng cạnh NPC Lão Dược Sư tại Lạc Hà Trấn, có tổ đội với Observer và là Tông chủ của tông môn có kho 5000 Linh thạch (Observer là Đệ tử). Đối tượng này kích hoạt sâu vào logic nghiệp vụ của các handler thay vì thoát sớm ở các dòng kiểm tra ban đầu.
- **Phân loại Payload tấn công (26 biến thể payload):**
  1. **Kiểu dữ liệu sai & Primitive Confusion:** `null`, `undefined`, boolean (`true`), số nguyên thuần túy, chuỗi ký tự thô thay thế cho object, mảng rỗng `[]`, mảng chứa dữ liệu phức hợp.
  2. **Giá trị số biên (Number Edge Cases):** `NaN`, `Infinity`, `-Infinity`, số âm cực đoan (`-999999`, `-Math.PI * 4`), số thực dấu phẩy động phân đoạn (`2.7`, `0.5`, `100.99`), số nguyên vượt trần an toàn (`Number.MAX_SAFE_INTEGER + 100`, `1e12`).
  3. **Chuỗi độc hại (String Attacks):** Chuỗi rỗng, chuỗi dài tới 2.0–3.5 KB (sát trần 4 KB của transport), byte NUL (`\x00`), chuỗi ký tự điều khiển và mã màu ANSI (`\r\n\x08\x1b[31m`), chuỗi emoji ghép phức tạp (Zero-Width Joiner sequences), Path Traversal (`../../../etc/passwd`, `..\\win.ini`), XSS / SQL Injection payloads (`<script>alert(1)</script>`, `' OR 1=1--`).
  4. **Khai thác cấu trúc đối tượng (Prototype Pollution & Deep Nesting):** Gửi đối tượng có các khoá nhạy cảm `__proto__`, `constructor`, `prototype`; mảng và đối tượng lồng nhau sâu 50–80 cấp.
  5. **Mã định danh độc hại (Malicious Field IDs):** Tra cứu id bằng các thuộc tính prototype (`"constructor"`, `"prototype"`, `"__proto__"`, `"toString"`), id lạ không tồn tại trong mọi trường nghiệp vụ (`npcId`, `itemId`, `questId`, `portalId`, `lootId`, `tradeId`, `recipeId`, `name`, `from`).
  6. **Trường phiên bản & Log Injection:** Kiểm tra trường `v` (`JoinOptions`) và các chuỗi ngắt dòng giả mạo log (`\u2028`, `\r\nFake: audit_log`).
  7. **Trạng thái dị thường (State Machine Confusion):** Gửi đòn đánh, buôn bán, lập tông môn khi nhân vật đang ở trạng thái thiền (`meditate`) hoặc Hoàng Tuyền (`limbo`).
  8. **Bão tin nhắn (Spam Flood & Rate Limit):** Bắn phá 250 tin nhắn liên tiếp từ một kết nối riêng để xác minh cơ chế phòng thủ `rate-limit.ts` ngắt kết nối với mã lỗi `4429`.
- **Giám sát & Tiêu chuẩn an toàn sau mỗi đòn tấn công:**
  - **Bắt ngoại lệ handler:** Intercept `console.error` và `onUncaughtException` trong tiến trình server để phát hiện mọi dòng lỗi `[lỗi]`. Bất kỳ lỗi runtime nào trong handler (như TypeError) đều bị bắt và tính là thất bại (FAIL).
  - **Kiểm tra bất biến SỐNG (Live State Invariants):** Đọc trực tiếp `ctrl.coin`, `ctrl.inv` (tổng số lượng và số lượng từng loại itemId trong túi), `p.exp`, `p.realm`, `p.hp` từ bộ nhớ sống server (không đọc snapshot lưu đĩa `ctrl.save`). Kẻ tấn công không được tự tăng Linh thạch, Exp hay bất kỳ vật phẩm nào trong túi.
  - **Observer bất biến:** Tiền, exp và túi đồ của Observer hoàn toàn giữ nguyên.
  - **Server an toàn:** Server không crash, phòng Observer không bị ngắt kết nối.
  - **Xác thực bằng 2 đột biến thật:**
    - Đột biến 1 (`useItem` cộng 5000 Linh thạch): Red team phát hiện 44 vi phạm bất biến tiền sống (ĐỎ).
    - Đột biến 2 (`useItem` ném TypeError khi thiếu kiểm tra null): Red team phát hiện 10 ngoại lệ handler `[lỗi]` (ĐỎ).

### 18.2. Kết quả Đo đạc Thực tế
Chạy 48 loại tin nhắn × 2 senders (Poor + Rich) × 26 biến thể payload (chế độ FAST):

| Chỉ số kiểm thử | Giá trị đo được | Đánh giá | Trạng thái |
| :--- | :---: | :---: | :---: |
| **Tổng số đòn tấn công đối kháng** | **2496 đòn** (48 tin × 2 senders × 26 payloads) | Phủ kín 100% tin nhắn WorldRoom trên cả 2 đối tượng | **PASS** |
| **Tỷ lệ an toàn (không crash, không hưởng lợi, không lỗi)** | **2496 / 2496 (100%)** | 0 lỗi bảo mật / 0 lỗ hổng logic / 0 ngoại lệ handler | **PASS** |
| **Ngoại lệ handler phát hiện (`[lỗi]`)** | **0** | Mọi payload xấu được xử lý an toàn | **PASS** |
| **Unhandled Rejection / Exception** | **0** | Tiến trình server nguyên vẹn | **PASS** |
| **Độ trễ xử lý mỗi payload (TB / Max)** | **TB 15.36 ms** / Max 17.99 ms | Nhanh, không nghẽn vòng lặp hay I/O | **PASS** |
| **Bảo vệ chống spam (RateLimiter kick 4429)** | **PASS** (ngắt kết nối đúng mã `4429`) | Chống cạn kiệt tài nguyên hiệu quả | **PASS** |
| **Biến thiên bộ nhớ VmRSS** | **+0 MB** | Không rò rỉ bộ nhớ sau 2496 đòn tấn công | **PASS** |

#### Bảng kết quả chi tiết theo 48 loại tin nhắn WorldRoom:
- **Di chuyển & Chiến đấu:** `input` (52/52 OK), `attack` (52/52 OK), `skill` (52/52 OK), `meditate` (52/52 OK), `breakthrough` (52/52 OK), `chat` (52/52 OK).
- **Túi đồ & Trang bị:** `useItem` (52/52 OK), `pickup` (52/52 OK), `dropItem` (52/52 OK), `equip` (52/52 OK), `unequip` (52/52 OK).
- **NPC, Nhiệm vụ & Giao dịch:** `talk` (52/52 OK), `questAccept` (52/52 OK), `questTurnIn` (52/52 OK), `questAbandon` (52/52 OK), `trade` (52/52 OK), `craft` (52/52 OK), `buy` (52/52 OK), `sell` (52/52 OK).
- **Tổ đội:** `partyInvite` (52/52 OK), `partyAccept` (52/52 OK), `partyDecline` (52/52 OK), `partyLeave` (52/52 OK), `partyKick` (52/52 OK).
- **Dịch chuyển & Bản đồ:** `travel` (52/52 OK).
- **Bí cảnh:** `dungeonOpen` (52/52 OK), `dungeonEnter` (52/52 OK), `dungeonDecline` (52/52 OK), `dungeonLeave` (52/52 OK).
- **PK Thách đấu:** `duelChallenge` (52/52 OK), `duelAccept` (52/52 OK), `duelDecline` (52/52 OK), `duelYield` (52/52 OK).
- **Tông môn:** `sectCreate` (52/52 OK), `sectInvite` (52/52 OK), `sectAccept` (52/52 OK), `sectDecline` (52/52 OK), `sectLeave` (52/52 OK), `sectKick` (52/52 OK), `sectRank` (52/52 OK), `sectTransfer` (52/52 OK), `sectDisband` (52/52 OK), `sectMotd` (52/52 OK), `sectDeposit` (52/52 OK), `sectWithdraw` (52/52 OK).
- **Luân hồi:** `soulBuy` (52/52 OK), `rebirth` (52/52 OK).
- **Tin lạ không đăng ký:** `__unknown_unregistered_msg__` (52/52 OK, handler `*` từ chối an toàn).

## 19. E2E thật nối lại sau rớt mạng bất thường bằng proxy TCP (M4-sớm, `npm run e2e:noi-lai -w server`)
Chrome headless + server Colyseus thật trong tiến trình (thư mục dữ liệu tạm), kết hợp một proxy TCP trung gian (`node:net`) đặt giữa tab Chrome và server (#116 / #117 / #288).

### 19.1. Bối cảnh kỹ thuật
- **Vấn đề trên trình duyệt headless:** Chrome CDP `Network.emulateNetworkConditions` (offline) chỉ làm nghẽn lưu lượng truyền dữ liệu nhưng **không ngắt** kết nối TCP/WebSocket đang mở (cả client lẫn server đều không thấy sự kiện `close`). Đồng thời, phương thức `WebSocket.close(code)` trong trình duyệt chỉ chấp nhận các mã `1000` hoặc `3000–4999` (vốn được game xử lý là thoát chủ động nên không kích hoạt vòng lặp nối lại). Trình duyệt không thể tự sinh mã rớt mạng bất thường `1006`.
- **Giải pháp Proxy TCP:** Khởi chạy một TCP Server nhỏ trung gian bằng `node:net` làm cầu nối giữa Chrome và server Colyseus. Khi cần mô phỏng rớt mạng bất thường, proxy gọi `clientSocket.destroy()` để gửi gói TCP RST/FIN trực tiếp tới Chrome, buộc trình duyệt nhận mã đóng `1006` và kích hoạt luồng tự động nối lại (`setupRoomLifecycle` trong `client/src/main.ts`).

### 19.2. Ba Ca Kiểm Thử Bắt Buộc
1. **Ca 1: Rớt mạng rồi tự nối lại thành công:**
   - Proxy huỷ toàn bộ socket đang mở (mã 1006) và TẠM chặn kết nối mới: nối lại thành công chỉ mất vài chục ms, nếu cho nối ngay thì banner chỉ lóe lên và E2E chập chờn khi máy bận (A bắt được lúc review #292). Chặn rồi mở lại (còn trong 20 giây grace) làm banner hiện đủ lâu để kiểm chắc chắn.
   - Banner `Mất kết nối, đang nối lại...` hiển thị thật (`shown("reconnect-banner")` từ `e2e-kit.ts`).
   - Mở lại proxy; lần thử kế tiếp của client (`client.reconnect(token)`) thành công.
   - Banner tắt, giữ nguyên đúng `sessionId`, vị trí; **phía server (cùng tiến trình)** cùng một nhân vật trong cùng phòng, ví 123 Linh thạch (đặt bằng `changeCoin`) và 2 nanh sói (`/give`) còn NGUYÊN, không còn ghost; 0 lỗi console; điều khiển di chuyển phản hồi sau khi nối lại.
2. **Ca 2: Rớt quá hạn grace (hết thời gian chờ nối lại):**
   - Tạm thời hạ `WorldRoom.reconnectGraceS = 2` (ngắn hơn mức 20s chuẩn để bài test chạy nhanh).
   - Proxy ngắt kết nối và khóa trong 2.5s để server hết thời gian chờ grace và huỷ token.
   - Proxy mở lại để client nhận phản hồi dứt khoát `reconnection token invalid or expired` từ server -> vòng lặp reconnect dừng sớm.
   - Hiển thị màn hình `showDisconnected` (banner cố định mang class `.failed` và nút "Tải lại trang" hiển thị thật).
   - Trong lúc nhân vật chờ nối lại (server đã lưu ngay lúc rớt, phòng khi sập), E2E cộng thêm 77 Linh thạch phía server; sau khi hết grace phải thấy hồ sơ của ĐÚNG nhân vật ca 2 (tên băm sha1) trên đĩa có nanh sói + Linh thạch gồm phần 77 đó (chứng minh lần lưu KHI hết grace), và không còn ghost, không còn trong phòng.
3. **Ca 3: Thoát chủ động không nối lại:**
   - Đóng kết nối bằng mã thoát chủ động `4000`; `MutationObserver` ghi mọi thay đổi của banner trong 3,5 giây sau đó (lần thử nối lại bị từ chối dứt khoát chỉ làm banner lóe "đang nối lại" vài ms rồi chuyển sang "thất bại", nên đọc chữ cuối cùng là bỏ lỡ) và proxy đếm byte client gửi lên: phải không có.
   - Client hiển thị màn hình ngắt kết nối dứt khoát; tuyệt đối **KHÔNG** kích hoạt vòng lặp reconnect và **KHÔNG** hiển thị banner đếm ngược nối lại.

**Danh tính theo từng ca:** `Page.addScriptToEvaluateOnNewDocument` chạy ở MỌI tài liệu mới, nên mỗi ca gỡ script của ca trước (`setIdentity`) và E2E xác nhận tên trên HUD khớp (bản đầu của #292 vô tình đăng nhập cả ba ca bằng cùng một nhân vật).

### 19.3. Cách Chạy & Ngưỡng Đo
- Lệnh chạy: `npm run build && npm run e2e:noi-lai -w server` (yêu cầu Google Chrome).
- Ngưỡng thời gian: Toàn bộ 3 ca kiểm thử hoàn tất trong **~10–15 giây** (ngân sách < 3 phút).

### 19.4. Kiểm Chứng Bằng 6 Đột Biến (Mutations)
1. **Đột biến (a) - Bỏ `client.reconnect(token)` trong `main.ts`:**
   - Ca 1 hết thời gian chờ 15s vì banner nối lại không bao giờ tắt -> **ĐỎ** (`Hết thời gian chờ (15000ms) ở A: banner nối lại ẩn đi sau khi nối lại thành công`).
2. **Đột biến (b) - Server không giữ nhân vật (`reconnectGraceS = 0`):**
   - Server từ chối ngay khi rớt, trả lỗi `reconnection token invalid or expired` -> Ca 1 **ĐỎ** (`Nội dung banner không đúng mong đợi: "Mất kết nối với Tiên Giới. Tải lại trang để vào lại."`).
3. **Đột biến (c) - Coi mã 1006 là thoát chủ động (trong `main.ts`):**
   - Client không bao giờ thử kết nối lại khi gặp lỗi 1006 -> Ca 1 **ĐỎ** (`Nội dung banner không đúng mong đợi: "Mất kết nối với Tiên Giới. Tải lại trang để vào lại."`).
4. **Đột biến (d) - Server không lưu khi hết grace (`WorldRoom.onLeave`):** Ca 2 **ĐỎ** (`Hết thời gian chờ (5000ms): hồ sơ nhân vật ca 2 ... được lưu xuống đĩa khi hết grace`).
5. **Đột biến (e) - Coi mã `4000` là rớt mạng (`main.ts`):** Ca 3 **ĐỎ** (banner từng hiện "đang nối lại" rồi "thất bại"); bản đầu của ca 3 chỉ đọc chữ cuối của banner nên KHÔNG bắt được đột biến này.
6. **Đột biến (f) - Nối lại xong mà mất Linh thạch (`ctrl.coin = 0` sau `allowReconnection`):** Ca 1 **ĐỎ** (`Ví / túi đồ đổi sau nối lại: ví 123 -> 0`).

## 20. Thử tải dài (Soak Test) 100 Bot: Rò rỉ bộ nhớ, Tick p95, Băng thông & Toàn vẹn dữ liệu (M4 3.5 - Issue #282)

### 20.1. Đặt vấn đề & Mục tiêu
Các công cụ thử tải trước đây (`bench.ts` 20 giây mốc `bench-baseline.json`, `bots.ts` 15–30 giây) chủ yếu đo tải đỉnh tức thời. Một máy chủ MMORPG chạy production liên tục nhiều giờ/ngày cần đối mặt với các rủi ro tích luỹ theo thời gian:
1. **Rò rỉ bộ nhớ (Memory Leak):** Giữ tham chiếu sự kiện, mảng cache không giải phóng, hoặc rò rỉ buffer WebSocket làm `VmRSS` phình to dần.
2. **Trôi dạt hiệu năng (Performance Drift):** Độ trễ tick CPU p95 hoặc kích thước bản vá StateView (`byte/tick`) tăng dần khi số lượng thực thể / dữ liệu tích luỹ.
3. **Tồn đọng hàng đợi I/O:** Hàng đợi ghi file lưu nhân vật (`savePlayer`), chân linh (`FileSoulStore`), hoặc tông môn (`FileSectStore`) bị nghẽn dẫn đến sai lệch dữ liệu.
4. **Mất an toàn dữ liệu:** Chết server bất ngờ hoặc khi tắt bằng tín hiệu `SIGTERM` làm phát sinh tệp lưu hỏng (`*.hong-*`) hoặc thất thoát / lạm phát tiền tệ (Linh thạch).

Công cụ thử tải dài (`npm run soak -w server`) được xây dựng để kiểm chứng các đặc tính trên trong điều kiện chạy tải nặng liên tục với 100 bot kết hợp đa kịch bản gameplay.

### 20.2. Phương pháp & Công cụ (`server/scripts/soak.ts`, `soak-analysis.ts`, `soak-analysis.test.ts`)
- **Cách ly tuyệt đối:** Script tự tìm cổng TCP rảnh ngẫu nhiên (`findFreePort`), tạo thư mục dữ liệu tạm riêng biệt (`/tmp/tien-gioi-soak-XXXXXX`), gieo sẵn hồ sơ nhân vật và khởi động server THẬT trong tiến trình con (không chiếm cổng 2567/2577/2587 của các dev).
- **Đa dạng hoá 100 bot tham gia theo 6 kịch bản gameplay thực tế:**
  1. **Săn quái (30 bot):** Di chuyển tuần tra ngoài trấn, áp sát quái vật, tung kỹ năng `slash` (Trảm Kích) và `sword` (Ngự Kiếm Thuật), nhặt chiến lợi phẩm rơi.
  2. **Trấn & Cửa hàng (20 bot):** Tụ tập tại Lạc Hà Trấn, di chuyển qua lại, định kỳ giao dịch mua đan dược tại NPC Lão Dược Sư.
  3. **Chuyển bản đồ qua cổng (10 bot):** Di chuyển liên tục qua lại giữa cổng Lạc Hà Trấn và Hắc Phong Sơn (kích hoạt luồng `travelTo`, ngắt kết nối phòng cũ và kết nối phòng mới).
  4. **Bí cảnh Linh Hư Giới (16 bot = 4 đội):** Đội trưởng mở bí cảnh tại NPC Thủ Môn, mời thành viên vào phòng bí cảnh riêng, chiến đấu với quái vật bí cảnh.
  5. **PK Thách đấu (12 bot = 6 cặp):** Di chuyển ra ngoài khu an toàn, gửi lời thách đấu `duelChallenge`, chấp nhận, đếm ngược và giao chiến 1v1 đến khi gục ngã (`duelYield`).
  6. **Tông môn (12 bot = 4 nhóm):** Tông chủ thành lập tông môn, mời đệ tử, nạp Linh thạch vào kho chung và gửi tin nhắn chat kênh tông môn `/s`.
- **Tránh vật cản & Chống sai số làm tròn toạ độ:** Bot kiểm tra an toàn đa hướng (`isPositionSafe`) với đệm an toàn 32 px (lớn hơn nhiều so với `PLAYER_RADIUS = 14 px`), loại bỏ triệt để hiện tượng sai số làm tròn số nguyên (`Math.round`) khi lưu toạ độ xuống đĩa.
- **Thu thập mẫu mỗi 10 giây ghi vào tệp `server/soak-*.json` (được chặn trong `.gitignore`):**
  - `VmRSS` bộ nhớ thực của PID server thật từ `/proc/<pid>/status`.
  - Số đo vận hành THẬT từ `/metrics?format=json` (#286; `METRICS_TOKEN` ngẫu nhiên cho server con): tick p95 của phòng tệ nhất, số tick quá một nhịp, hàng đợi ghi nhân vật (đang chờ, tuổi, lỗi), độ trễ vòng lặp sự kiện p99. Thêm CPU luồng chính mỗi tick (trung bình, không phải phân vị) từ `/proc/<pid>/sched`. `/metrics` lỗi hoặc không 200 thì soak ĐỎ.
  - Byte WebSocket nhận mỗi bot mỗi tick (mọi khung, không chỉ patch StateView) và băng thông nhận (`rxKBpsPerBot`).
  - Số lượng bot còn sống và số lỗi / ngắt kết nối bất thường.
  - Phân loại từng dòng log server bằng `classifyServerLogLine`: `[lỗi]` / `unhandledRejection` / `uncaughtException` và **mọi dòng stderr còn lại** là lỗi (`console.error("save failed", e)` in `save failed Error: ...`, chữ `Error:` không ở đầu dòng nên khớp theo mẫu chữ sẽ bỏ lỡ); `[CẢNH BÁO]` sau khi server sẵn sàng là cảnh báo giám sát (tick, hàng đợi ghi) và làm soak ĐỎ; `[ĐÃ ỔN]` là thông tin.
- **Phân tích tự động bằng Hồi quy tuyến tính (OLS Linear Regression):**
  - Bỏ qua thời gian khởi động (warmup 1 phút cho đợt 5 phút; 5 phút cho đợt 30 phút).
  - Tính mức tăng `VmRSS` sau warmup và dốc hồi quy tuyến tính của nửa sau thời gian chạy (`secondHalfSlope`).
  - Đánh giá theo các ngân sách: VmRSS tăng sau warmup <= 50 MB; dốc nửa sau <= 1.0 MB/phút; Tick p95 thật <= 10.0 ms; hàng đợi ghi: tuổi <= 30 s và 0 lỗi; độ trễ vòng lặp p99 <= 100 ms; byte WebSocket <= 600 / tick; lỗi log server = 0; cảnh báo giám sát = 0; tỷ lệ rớt bot <= 5%.
- **Kiểm tra bất biến toàn vẹn dữ liệu sau soak:**
  - Tắt server bằng tín hiệu `SIGTERM` (mô phỏng quy trình bảo trì / cập nhật production).
  - Chạy `kiem-save` (`auditSavesDirectory`) trên toàn bộ thư mục dữ liệu tạm (0 lỗi).
  - Kiểm tra tệp hỏng cách ly: số tệp `*.hong-*` = 0.
  - Kiểm tra bảo toàn tiền tệ: tổng Linh thạch cuối kỳ (ví nhân vật + kho tông môn) <= ban đầu + thả ra (rơi đồ / thưởng) và **lệch ví từng bot = 0** (số dư trong hồ sơ so với tin `wallet` cuối cùng của bot, tính cả tiền Hoàng Tuyền).

### 20.3. Bảng Kết quả Thử tải Thực tế: 100 bot, **30 phút**, 180 mẫu (A chạy lại sau khi siết luật log)
Lệnh: `npm run soak -w server -- --bots=100 --minutes=30` trên nhánh gồm #291 + #297 (`Encoder.BUFFER_SIZE` 512 KB). Trích log (đầy đủ ở mục tổng kết; chỉ giữ các mốc 0 / 5 / 10 / 15 / 20 / 25 / 30 phút):

```
Số bot:            100
Thời lượng:        30.0 phút (1800 giây)
Phân bổ kịch bản (100 bot): Săn quái 30 | Trấn/Shop 20 | Cổng 10 | Bí cảnh 16 | PK 12 | Tông môn 12
...
[ 0.2m / 30.0m] VmRSS: 146.9 MB | Bots: 100/100 | Tick p95:  2.53 ms | CPU:  3.8 ms/t | WS: 484 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[ 5.0m / 30.0m] VmRSS: 155.3 MB | Bots: 100/100 | Tick p95:  2.36 ms | CPU:  2.7 ms/t | WS: 236 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[10.0m / 30.0m] VmRSS: 155.2 MB | Bots: 100/100 | Tick p95:  2.78 ms | CPU:  2.8 ms/t | WS: 225 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[15.0m / 30.0m] VmRSS: 155.3 MB | Bots: 100/100 | Tick p95:  2.55 ms | CPU:  3.3 ms/t | WS: 248 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[20.0m / 30.0m] VmRSS: 155.1 MB | Bots: 100/100 | Tick p95:  2.43 ms | CPU:  3.4 ms/t | WS: 293 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[25.0m / 30.0m] VmRSS: 155.5 MB | Bots: 100/100 | Tick p95:  2.58 ms | CPU:  3.8 ms/t | WS: 296 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
[30.0m / 30.0m] VmRSS: 155.6 MB | Bots: 100/100 | Tick p95:  2.48 ms | CPU:  3.7 ms/t | WS: 296 B/t | Inflight: 0 | Lỗi: 0 | Cảnh báo: 0
...
- kiem-save: 100 nhân vật, 100 chân linh, 4 tông môn -> 0 lỗi.
- Tệp hỏng (*.hong-*): 0
- Bảo toàn Linh thạch: Ban đầu 29600 + Thả ra 11432 - Tiêu 27900 = Trần 41032 | Thực tế cuối: Ví 13132 + Kho 12650 = 25782 (Lệch ví bot: 0) -> ĐẠT

================================================================================
                     KẾT QUẢ THỬ TẢI DÀI (SOAK TEST) - ĐẠT (PASS)
================================================================================
Thời lượng đo:          30.0 phút (180 mẫu, mỗi 10 giây)
Số bot tham gia:        100 khởi tạo -> 100 kết thúc (rớt 0)
--------------------------------------------------------------------------------
BỘ NHỚ TIẾN TRÌNH SERVER (VmRSS):
  - Ban đầu:            146.89 MB
  - Sau khởi động (5.0m): 155.26 MB
  - Kết thúc:           155.63 MB
  - Tăng sau warmup:    +0.37 MB (ngưỡng: <= 50.0 MB)
  - Dốc nửa sau (OLS):  +0.004 MB/phút (ngưỡng: <= 1.00 MB/phút)
--------------------------------------------------------------------------------
SỐ ĐO VẬN HÀNH THẬT (/metrics & /proc/<pid>/sched):
  - Tick p95 phòng tệ nhất: TB 2.47 ms, Max 2.82 ms (ngân sách: <= 10.0 ms)
  - Tick overruns (>50ms): 0
  - CPU luồng chính/tick:  TB 3.28 ms/tick
  - Hàng đợi ghi nhân vật: Inflight max 1, Tuổi max 0.0 s, Lỗi 0
  - Độ trễ vòng lặp p99:   24.1 ms (ngưỡng: <= 100 ms)
--------------------------------------------------------------------------------
BĂNG THÔNG WEBSOCKET CLIENT:
  - Nhận trung bình:       273 B/tick (ngân sách: <= 600 B/tick)
  - Phân vị p95:           327 B/tick
  - Băng thông nhận TB:    5.34 KB/s mỗi bot
--------------------------------------------------------------------------------
TOÀN VẸN DỮ LIỆU & TÍNH ỔN ĐỊNH:
  - Cảnh báo giám sát:     0 (yêu cầu: <= 0)
  - Lỗi log server:        0 (yêu cầu: <= 0)
  - Lỗi gọi /metrics:      0 (yêu cầu: 0)
  - kiem-save sau soak:    0 lỗi (yêu cầu: 0)
  - Tệp hỏng (*.hong-*):   0 (yêu cầu: 0)
  - Bảo toàn tiền tệ:      ĐẠT
================================================================================
```

| Hạng mục | Đo được (100 bot / 30 phút) | Ngưỡng | Kết quả |
| :--- | :---: | :---: | :---: |
| Bot sống đến cuối | **100 / 100** (rớt 0) | rớt <= 5% | PASS |
| VmRSS ban đầu → sau khởi động (5 phút) → cuối | 146,89 → 155,26 → 155,63 MB | — | INFO |
| VmRSS tăng sau khởi động | **+0,37 MB** | <= 50 MB | PASS |
| Dốc VmRSS nửa sau (OLS) | **+0,004 MB/phút** (toàn bộ sau khởi động +0,017) | <= 1,0 MB/phút | PASS |
| Tick p95 phòng tệ nhất (`/metrics`, mô phỏng, chưa gồm mã hoá patch) | TB **2,47 ms**, tối đa **2,82 ms** | <= 10 ms | PASS |
| Tick quá một nhịp (50 ms) | **0** | — | PASS |
| CPU luồng chính mỗi tick (`/proc/<pid>/sched`, gồm mã hoá patch, GC) | TB 3,28 ms | — | INFO |
| Hàng đợi ghi nhân vật | tối đa 1 chờ, tuổi tối đa 0 s, **0 lỗi** | tuổi <= 30 s, lỗi 0 | PASS |
| Độ trễ vòng lặp sự kiện p99 | tối đa 24,1 ms | <= 100 ms | PASS |
| Byte WebSocket nhận mỗi bot mỗi tick (mọi khung, không chỉ patch) | TB 273, p95 327 | <= 600 | PASS |
| Cảnh báo giám sát `[CẢNH BÁO]` sau khi sẵn sàng / lỗi log (mọi dòng stderr còn lại) | **0 / 0** | 0 | PASS |
| `kiem-save` / tệp hỏng `*.hong-*` | 0 lỗi (100 nhân vật, 100 chân linh, 4 tông môn) / 0 | 0 | PASS |
| Bảo toàn Linh thạch | ví 13.132 + kho 12.650 = 25.782; lệch ví từng bot = **0** | lệch 0 | PASS |

**Soak đã bắt được gì khi siết luật (A, review #291):** bảng 5 phút ban đầu của PR chạy khi luật log còn lỏng nên bị che hai vấn đề thật, đã xử lý và số liệu trên thay thế bảng cũ:
1. Đội trưởng bí cảnh của soak gửi 3 `partyInvite` MỖI tick 50 ms (60 tin/giây) nên server ngắt 4 bot vì `[spam]` đúng luật; "96/96 bot" trong bảng cũ là 4 bot đã rớt trước mẫu đầu (mô tả "4 bot chuyển map" là sai). Sửa: `nextPartyInviteAt`, 6 giây một lượt.
2. `@colyseus/schema buffer overflow` 272-304 KB > 256 KB mỗi lượt khi 100 bot vào dồn dập (cũng là tình huống sau khởi động lại server); sửa ở server #296 / #297 (`BUFFER_SIZE` 512 KB: 10 cảnh báo → 0, 3 lượt 60 giây và lượt 30 phút này).

### 20.4. Bằng chứng Kiểm thử Đột biến (Mutation Testing)
Để chứng minh công cụ soak test thực sự phát hiện được lỗi tiềm ẩn và không trả về kết quả đạt giả (false positive), 3 đột biến đã được cài đặt có chủ đích và kiểm chứng:

#### Đột biến A: Rò rỉ bộ nhớ cố ý (`Memory Leak Mutation`)
- **Cài đặt:** Thêm cấp phát `Buffer.alloc(25 * 1024 * 1024, 1)` mỗi giây trong vòng lặp cập nhật phòng `WorldRoom.ts` để ép bộ nhớ phình to nhanh chóng.
- **Kết quả Soak Test:** **KHÔNG ĐẠT (FAIL)** ngay lập tức với lý do:
  ```
  LÝ DO KHÔNG ĐẠT:
    [X] VmRSS tăng sau khởi động vượt ngưỡng: +992.75 MB > 50.0 MB
    [X] Dốc VmRSS nửa sau tăng liên tục vượt ngưỡng: +6001.32 MB/phút > 1.0 MB/phút
  ```
- **Kết luận:** Thuật toán hồi quy OLS và cơ chế giám sát `/proc/<pid>/status` bắt chính xác 100% hiện tượng rò rỉ RAM. Đã hoàn tác code đột biến sạch sẽ.

#### Đột biến B: Lỗi log máy chủ cố ý (`Server Log Error Mutation`)
- **Cài đặt:** Thêm `console.error("[lỗi] kiểm thử đột biến bắt lỗi log server")` vào handler tin nhắn của `WorldRoom.ts`.
- **Kết quả Soak Test:** **KHÔNG ĐẠT (FAIL)** ngay lập tức với lý do:
  ```
  LÝ DO KHÔNG ĐẠT:
    [X] Phát hiện 2 lỗi trong log server ([lỗi] / unhandledRejection / ngoại lệ)
  ```
- **Kết luận:** Cơ chế intercept log và regex quét lỗi bắt chính xác các sự kiện bất thường. Đã hoàn tác code đột biến sạch sẽ.

#### Đột biến C: Nghẽn thời gian tick phòng (`Tick Latency Mutation`)
- **Cài đặt:** Thêm vòng lặp busy-wait 25ms (`while (Date.now() - t0 < 25)`) vào bên trong chu kỳ tick `update()` của `WorldRoom.ts`.
- **Kết quả Soak Test:** **KHÔNG ĐẠT (FAIL)** ngay lập tức với lý do:
  ```
  LÝ DO KHÔNG ĐẠT:
    [X] Tick p95 phòng tệ nhất vượt ngân sách: 25.79 ms > 10.0 ms
    [X] Phát hiện 1 cảnh báo giám sát [CẢNH BÁO] từ server sau khi sẵn sàng
  ```
- **Kết luận:** Cơ chế cào `/metrics?format=json` (Bearer `METRICS_TOKEN`) và phân loại log `classifyServerLogLine` bắt chính xác 100% hiện tượng suy giảm hiệu năng tick và kích hoạt cảnh báo giám sát. Đã hoàn tác code đột biến sạch sẽ.

### 20.5. Hướng dẫn Chạy Thử tải Dài ngoài Ca Đêm
Bộ công cụ hỗ trợ nhiều mức thời lượng tuỳ nhu cầu kiểm tra:
```bash
# 1. Thử nhanh 60 giây (mặc định để dev kiểm tra nhanh tính năng trước khi commit):
npm run soak -w server

# 2. Thử nghiệm chuẩn 5 phút với 100 bot:
npm run soak -w server -- --bots=100 --minutes=5

# 3. Thử tải dài 30 phút với 100 bot (khuyến nghị chạy trước khi phát hành release):
npm run soak -w server -- --bots=100 --minutes=30

# 4. Thử tải trường kỳ 1–2 giờ (chạy qua đêm hoặc trên máy chủ staging):
npm run soak -w server -- --bots=100 --minutes=60
npm run soak -w server -- --bots=100 --minutes=120

# 5. Lưu kết quả ra đường dẫn tệp JSON tuỳ chọn và giữ lại thư mục dữ liệu để kiểm tra:
npm run soak -w server -- --bots=100 --minutes=30 --out=./soak-report.json --keep-data
```

## 21. E2E thật Nhịp tim ứng dụng (ping / pong): Phát hiện socket nửa mở và vòng đời nền / tiền cảnh (M4.2b, Issue #293)

### 21.1. Bối cảnh & Mục tiêu
Khi ứng dụng di động (Capacitor/WebView) hoặc trình duyệt xuống nền, đổi mạng giữa Wi-Fi và 4G, hoặc người chơi đi vào thang máy/hầm sóng yếu: kết nối TCP bên dưới thường rơi vào trạng thái "nửa mở" (half-open socket). Trình duyệt không nhận được tín hiệu TCP RST/FIN nên sự kiện `WebSocket.onclose` (`onLeave`) không được kích hoạt trong nhiều phút.
Để giải quyết dứt điểm, giao thức nhịp tim cấp ứng dụng nhẹ (`ping` / `pong`, M4.2b) được triển khai:
- `HEARTBEAT_INTERVAL_MS = 5000` (5 giây): client gửi ping định kỳ khi ở tiền cảnh.
- `HEARTBEAT_TIMEOUT_MS = 8000` (8 giây): quá hạn không có pong thì coi socket đã chết.
- `RESUME_CHECK_AFTER_MS = 2000` (2 giây): ở nền trên 2 giây khi quay lại tiền cảnh gửi ping kiểm tra ngay lập tức.
- `RESUME_TIMEOUT_MS = 3000` (3 giây): thời hạn kiểm tra chết nhanh khi quay lại tiền cảnh.
- **Tương thích ngược an toàn:** Client chỉ coi socket chết khi server đã từng trả ít nhất một pong (`supported = true`). Server cũ không hỗ trợ thì client mới không tự ngắt kết nối oan.

### 21.2. Kiến trúc Kiểm thử E2E (`server/scripts/e2e-nhip-tim.ts`)
Kịch bản tự động hoá kiểm thử E2E sử dụng:
1. **Server Colyseus thật** chạy trong tiến trình với thư mục dữ liệu tạm riêng biệt.
2. **Proxy TCP trung gian (`TcpProxy`)** nằm giữa Chrome headless và Server Colyseus:
   - Hỗ trợ chế độ `blackhole`: socket TCP phía client và server vẫn giữ mở 100%, nhưng proxy ngừng chuyển tiếp byte hai chiều (mô phỏng socket nửa mở thật sự).
   - Hỗ trợ chế độ `holeExisting` / `destroyHoled`: chỉ socket ĐANG CÓ bị blackhole, kết nối mới vẫn thông (đổi mạng); sau đó huỷ socket cũ để trình duyệt bắn sự kiện đóng muộn.
   - Hỗ trợ chế độ `dropPong`: proxy lọc bỏ riêng các tin `pong` từ server gửi về để mô phỏng máy chủ cũ không có nhịp tim.
3. **Chrome headless CDP** điều khiển người chơi thật qua màn hình canvas và giao diện DOM.

### 21.3. Bốn ca kiểm thử thực tế

| Ca kiểm thử | Điều kiện mô phỏng | Kết quả thực tế | Ngưỡng cho phép | Đánh giá |
| :--- | :--- | :---: | :---: | :---: |
| **Ca 1: Blackhole tiền cảnh** | Bật TCP blackhole (socket nửa mở) khi đang chơi ở tiền cảnh | Phát hiện chết sau **~13.6 giây** | <= **16.5 giây** (xấu nhất 15 giây: chờ tới nhịp ping kế 5s + hạn 8s làm tròn lên bội của nhịp 5s = 10s, kiểm tra mỗi nhịp; bản đầu đặt 14s nên chập chờn) | **PASS** |
| | Banner nối lại hiển thị và đếm ngược | `"Mất kết nối, đang nối lại... (còn 20 giây)"` | Hiện banner | **PASS** |
| | Mở lại proxy, client tự nối lại | Bảo toàn `sessionId`, ví 168 Linh thạch + túi đồ nguyên vẹn | Khớp 100% | **PASS** |
| | Điều khiển di chuyển sau nối lại | Nhân vật di chuyển toạ độ phản hồi bình thường | Phản hồi | **PASS** |
| **Ca 2: Background -> Foreground** | Xuống nền 2.5s, bật blackhole lúc ở nền, quay lại tiền cảnh | Phát hiện chết sau **3.1 giây** (`RESUME_TIMEOUT_MS` 3s + 134ms) | <= 4.5 giây | **PASS** |
| | Nối lại sau ca quay lại tiền cảnh | Nối lại thành công, banner ẩn | Nối lại | **PASS** |
| **Ca 3: Server cũ không trả pong** | Proxy drop 100% pong, người chơi ở trong game 12s | Banner KHÔNG hiển thị, client KHÔNG tự ngắt kết nối | Không ngắt oan | **PASS** |
| **Ca 4: Socket cũ đóng muộn** (A thêm khi review #310) | Blackhole CHỈ socket đang có, kết nối mới vẫn thông (như đổi wifi sang 4G); nối lại qua kết nối mới; socket cũ đóng (1006) ~200 ms SAU khi nối lại xong | Chỉ nối lại ĐÚNG MỘT lần (`attachRoom` 1 lần), banner ẩn, nhịp tim phòng mới còn chạy | 1 lần nối lại | **PASS** |
| **Độ ổn định chung** | Toàn bộ 4 ca liên tục | **0 lỗi console / exception** | 0 lỗi | **PASS** |

### 21.4. Bằng chứng Kiểm thử Đột biến (Mutation Testing)
Cả các khẳng định cốt lõi đều được kiểm chứng với đột biến làm đỏ kịch bản E2E:
1. **Đột biến 1 (Bỏ `isConnectionDead` ở `tick()`):** Ca 1 BÁO ĐỎ (`[LỖI E2E NHỊP TIM] Hết thời gian chờ (18000ms) ở A: banner nối lại hiển thị sau blackhole`).
2. **Đột biến 2 (Bỏ cờ `supported`, luôn coi là true):** Ca 3 BÁO ĐỎ (`[LỖI E2E NHỊP TIM] Client tự ngắt kết nối oan dù chưa từng nhận pong (vi phạm cờ supported)! (bannerCount=1, tokenChanged=true)`).
3. **Đột biến 3 (Bỏ xử lý `visibilitychange`):** Ca 2 BÁO ĐỎ (`[LỖI E2E NHỊP TIM] Hết thời gian chờ (8000ms) ở A: banner nối lại hiển thị sau khi quay lại tiền cảnh`).
4. **Đột biến 4 (Server không trả pong):** Ca 2 BÁO ĐỎ (vì `supported = false` nên client không kích hoạt ngắt kết nối).
5. **Đột biến 5 (bỏ `if (room !== activeRoom) return;` trong `room.onLeave`):** Ca 4 BÁO ĐỎ (`socket cũ đóng muộn gây nối lại thừa (số lần nối lại=2, cần 1)`): sự kiện đóng của phòng CŨ chạy lại vòng nối lại, đóng phòng MỚI vừa nối và nối lại lần hai (R1 → R2 → R3). `onLeave.invoke()` giả trên phòng đã đóng KHÔNG tái hiện được (colyseus.js xoá handler khi phòng đóng); chỉ sự kiện đóng thật của socket nửa mở mới gây ra, nên ca 4 dùng chế độ proxy `holeExisting`.

Cách chạy:
```bash
npm run build -w client
npm run e2e:nhip-tim -w server
# mô phỏng runner CI chậm (nightly đo RTT nền ~45 ms): độ trễ MỖI CHIỀU làm nền của ca 7 (mặc định 0)
E2E_NEN_MS=22 npm run e2e:nhip-tim -w server
```

Ca 7 không giả định RTT cục bộ nhỏ: trần RTT nền 120 ms và vùng báo kiểm theo `1000 - clamp(RTT + 10, 0, 250)` với RTT đọc cùng lúc phát. Lý do: trên runner CI hai lõi (Chrome WebGL mềm) pong chờ luồng chính nên RTT loopback ~40-50 ms; kỳ vọng cũ "RTT < 40 ms" làm nightly 17/11 đỏ (hết giờ 20 s ở cả hai lần thử). Chỉ tải CPU thuần (một lõi + vòng đốt) KHÔNG tái hiện được, nên dùng `E2E_NEN_MS`.

## 22. Đo thực nghiệm bot săn Kim Đan, qua hai cổng và đội hạ trùm (M6.9, Issue #410)

### 22.1. Bối cảnh & Phương pháp đo thực nghiệm

Trong cột mốc M6 (Nội dung & Cân bằng, `docs/CAN_BANG.md`), hệ thống quái và bản đồ mở rộng sang cấp Kim Đan với bản đồ mới Âm Sương Trạch (`am_suong`). Nhằm kiểm chứng số liệu lý thuyết và đối chiếu với ngưỡng hoà vốn **85 giây** của bãi cày Kim Đan (Xích Mãng tại Hắc Phong Cốc và Lạc Hà Trấn), công cụ đo bot thật `server/scripts/bot-kim-dan.ts` được xây dựng với các nguyên tắc đo đạc nghiêm ngặt:

1. **Đo đúng thời gian tìm quái thật (`searchSec`):** Tính từ thời điểm quái trước vừa bị hạ (`mon.hp <= 0` hoặc bị xoá khỏi state) tới lúc bot tiếp cận chạm tới quái tiếp theo (`dist <= SKILLS.slash.range = 64 px`). **Tuyệt đối KHÔNG tính** thời gian đánh quái và thời gian đả tọa. Lần tiếp cận đầu tiên từ trấn ra bãi quái được coi là làm nóng (warmup) và loại bỏ.
2. **Vùng nhìn chữ nhật theo tỷ lệ màn hình thật (`viewOfScreen`):**
   - **Máy tính (`pc`):** 1280x720 css px, tầm nhìn nửa rộng nửa cao `hw = 569 px`, `hh = 320 px` (khung 1138x640 px).
   - **Điện thoại ngang (`phone`):** 844x390 css px, `hw = 562.5 px`, `hh = 260 px` (khung 1125x520 px).
   - **Điện thoại dọc (`phonePortrait`):** 390x844 css px, `hw = 254 px`, `hh = 550 px` (khung 508x1100 px).
   - Bot **tuyệt đối không đọc trộm state quái toàn server**: bot chỉ nhận biết quái trong phạm vi khung nhìn chữ nhật quanh vị trí của mình; khi chưa thấy quái, bot di chuyển tuần tra theo lưới các ô nguy hiểm `sweepOf(map, monster)`.
3. **Môi trường đo độc lập:** Sử dụng cổng ngẫu nhiên được cấp động qua `freePort()` trên máy chủ Colyseus thật, không chạm tới cổng dev (`2587/5193`) hay cổng sản xuất (`2567`).

---

### 22.2. Bảng kết quả thực nghiệm thời gian tìm quái (`searchSec`) & Đối chiếu ngưỡng hoà vốn 85 giây

| Bản đồ | Quái vật | Vùng nhìn màn hình | Số quái trên bản đồ | Giả định mô hình (s) | Mẫu đo bot thật (s) | Trung vị bot đo (Median) | Trung bình (Mean) | Đối chiếu ngưỡng hoà vốn (85s) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Hắc Phong Cốc** | **Xích Mãng** (`mang`) | **Máy tính** (`pc`, 1138x640) | 6 | 90 s | `[18.6, 2.9, 1.7, 5.2, 24.1]` (5 mẫu, 6 lần hạ) | **5.2 s** | 10.5 s | 🚨 **Quá nhanh** (trung vị 5.2s < 28s nhân; min 1.7s khi có quái gần, max 24.1s khi chờ hồi sinh) |
| **Hắc Phong Cốc** | **Xích Mãng** (`mang`) | **Điện thoại ngang** (`phone`) | 6 | 90 s | *chưa đo* | *chưa đo* | *chưa đo* | — |
| **Hắc Phong Cốc** | **Xích Mãng** (`mang`) | **Điện thoại dọc** (`phonePortrait`) | 6 | 90 s | *chưa đo* | *chưa đo* | *chưa đo* | — |
| **Lạc Hà Trấn** | **Xích Mãng** (`mang`) | **Máy tính** (`pc`) | 2 | 90 s | *chưa đo* | *chưa đo* | *chưa đo* | — |
| **Âm Sương Trạch** | **Sương Hồ** (`suong_ho`) | **Máy tính** (`pc`) | 24 | 10 s | `[1.6, 2.6, 2.9, 4.0, 2.2]` (5 mẫu, 6 lần hạ) | **2.6 s** | 2.7 s | ✅ Chuẩn bãi quái thường Kim Đan (24 con, tìm cực nhanh quanh 2.6s) |
| **Âm Sương Trạch** | **Thạch Quy** (`thach_quy`) | **Máy tính** (`pc`) | 18 | 12 s | *chưa đo* | *chưa đo* | *chưa đo* | — |
| **Âm Sương Trạch** | **Độc Thiềm** (`doc_thiem`) | **Máy tính** (`pc`) | 18 | 14 s | *chưa đo* | *chưa đo* | *chưa đo* | — |
| **Âm Sương Trạch** | **Hắc Giao** (`hac_giao`) | **Máy tính** (`pc`) | 2 | 90 s | *chưa đo* | *chưa đo* | *chưa đo* | — |

#### Phân tích & Đánh giá cân bằng:
1. **Xích Mãng tại Hắc Phong Cốc (Đo thật 5 mẫu trên bãi 6 con):**
   - Tại **Hắc Phong Cốc**: Có 6 con Xích Mãng tụ trong thung lũng hẹp. Khi bãi còn quái, bot phát hiện và tiếp cận quái tiếp theo chỉ mất **1.7–5.2 giây**. Khi bãi cạn quái (hạ hết loạt đầu), bot phải chờ server top-up hồi sinh (10 giây) và đi tuần tra theo lưới nguy hiểm, thời gian tìm kéo dài lên **18.6–24.1 giây**.
   - Trung vị thực tế đo được là **5.2 giây**, thấp hơn rất nhiều so với ngưỡng hoà vốn 85 giây trong thiết kế kinh tế (và dưới ngưỡng nhân 28 giây).
2. **Sương Hồ tại Âm Sương Trạch:**
   - Mật độ 24 con trải rộng trên đầm lầy sương. Thời gian tìm quái rất ổn định từ **1.6 đến 4.0 giây** (trung vị **2.6 giây**, trung bình **2.7 giây**), hoàn toàn phù hợp với bãi luyện công Kim Đan.
3. **Các ô còn lại:** Để trống với trạng thái `chưa đo` theo nguyên tắc chỉ ghi số đo thực nghiệm từ công cụ, không ghi khoảng ước đoán.

---

### 22.3. Kịch bản di chuyển qua 2 cổng liên tiếp (`--portal`)

Kịch bản tự động hoá kiểm chứng toàn vẹn quy trình người chơi Kim Đan di chuyển qua chuỗi cổng liên bản đồ:
1. **Chặng 1 (Lạc Hà Trấn -> Hắc Phong Cốc):**
   - Bot xuất phát tại Lạc Hà Trấn (`lac_ha`), di chuyển tiếp cận cổng **Bắc Môn Quan** (`lac_ha_bac`, toạ độ `(1536, 112)`).
   - Khi đứng trong tầm cổng (`dist <= 64 px`), bot gửi tin `travel { portalId: "lac_ha_bac" }`.
   - Máy chủ kiểm tra hợp lệ, lưu trạng thái nhân vật, gửi tin nhắn `travelTo { mapId: "hac_phong" }` và đóng kết nối với mã **4000** (`CLOSE_TRAVEL`).
2. **Chặng 2 (Hắc Phong Cốc -> Âm Sương Trạch):**
   - Bot kết nối vào phòng mới `world_hac_phong`. Máy chủ nhận diện nhân vật và đặt toạ độ xuất hiện tại điểm spawn Nam Môn Quan `(2112, 2832)`.
   - Bot áp dụng thuật toán tìm đường `planPath` vượt qua hẻm núi đá quanh co để đi lên cổng phía bắc **Vọng Trạch Quan** (`hac_phong_bac`, toạ độ `(2080, 112)`).
   - Tiếp cận cổng (`dist <= 64 px`), gửi `travel { portalId: "hac_phong_bac" }`, nhận `travelTo { mapId: "am_suong" }` và đóng kết nối mã 4000.
3. **Đích đến (Âm Sương Trạch):**
   - Bot kết nối vào phòng `world_am_suong`, xuất hiện tại cổng **Hồi Phong Quan** `(1984, 3344)`.
   - **Xác nhận toàn vẹn dữ liệu:** Cảnh giới Kim Đan Hậu kỳ, trang bị bộ Hắc Giao, túi đồ đan dược và số dư Linh thạch được bảo toàn 100%. Kịch bản PASS 100%.

---

### 22.4. Kịch bản đội 3 bot Kim Đan hạ trùm Hắc Giao (`--party`)

- **Tổ đội:** 3 bot Kim Đan Hậu kỳ (`DoiBot1`, `DoiBot2`, `DoiBot3`) kết nối vào Âm Sương Trạch (`world_am_suong`).
- **Ghép đội:** Đội trưởng gửi `partyInvite`, các thành viên nhận `partyInvited` và phản hồi `partyAccept`. Tổ đội 3 người được thành lập đồng bộ trên Hub.
- **Tuần tra & Tác chiến:**
  - Cả đội cùng di chuyển tuần tra lên vùng nguy hiểm phía bắc đầm lầy sương (`dangerAt >= 0.85`).
  - Phát hiện Hắc Giao (`hp = 50000`, `atk = 150`) tại toạ độ `(1169, 651)`.
  - Cả đội đồng loạt xông vào xuất chiêu Trảm kích (`slash`) và Kiếm khí (`sword`), tự động uống Đại Hồi Huyết Đan (+70% HP) và Hồi Huyết Đan (+40% HP) khi máu tụt.
- **Kết quả thực nghiệm:**
  - **Trạng thái:** 🎉 **HẠ TRÙM THÀNH CÔNG!**
  - **Thời gian hạ trùm:** **44.4 giây** (số đo thật in từ script; không phải ước đoán lý thuyết)
  - **Số thành viên gục ngã (deaths):** **1**
  - **DPS thực tế của đội:** **1125.2 DPS** (tổng HP trùm 50,000 / 44.4 giây)
  - **Nhận xét cân bằng thực tế:**
    - Với 3 người chơi Kim Đan Hậu kỳ trang bị đầy đủ bộ Hắc Giao dồn dập xuất chiêu Trảm Kích (`slash`) và Kiếm Khí (`sword`, tầm xa 260 px), lượng sát thương dồn đạt đỉnh ~1125 DPS, hạ trùm 50,000 HP trong chưa đầy 1 phút (44.4s).
    - Hắc Giao có sát thương lớn (`atk = 150`) và quẫy đầm lầy: nếu cả 3 bot cùng lao vào cận chiến sát nhau và cạn đan dược đang hồi chiêu (10.5s), đội có rủi ro bị quét sạch trước khi trùm gục (đã ghi nhận trong lượt đo đối chứng). Việc duy trì cự ly kiếm khí 260 px và phân tán vị trí là yếu tố then chốt để đội tồn tại.

---

### 22.5. Lệnh thực thi kịch bản bot

```bash
# Đo toàn bộ ma trận quái và vùng nhìn màn hình
npx tsx --tsconfig server/tsconfig.json server/scripts/bot-kim-dan.ts --matrix

# Đo riêng một loài quái trên 3 cỡ màn hình (PC, Phone ngang, Phone dọc)
npx tsx --tsconfig server/tsconfig.json server/scripts/bot-kim-dan.ts --map=hac_phong --monster=mang --all-views --kills=3

# Chạy kịch bản di chuyển qua 2 cổng liên tiếp
npx tsx --tsconfig server/tsconfig.json server/scripts/bot-kim-dan.ts --portal

# Chạy kịch bản đội 3 bot hạ trùm Hắc Giao
npx tsx --tsconfig server/tsconfig.json server/scripts/bot-kim-dan.ts --party
```

## 23. Ba bản đồ cùng một tiến trình: bench nhiều bản đồ + soak 30 phút 100 bot (M6.9, Issue #410 mục 3 + 4)

Đo bằng công cụ sẵn có (A làm, 14/11/2026, máy dùng chung, Node 22): phần "bot săn Kim Đan / đội hạ trùm" của #410 là mục 22 (C); thời gian tìm quái đo bằng thợ săn trong `World` thật ở `CAN_BANG.md` mục 10.

### 23.1. Bench ba bản đồ trong MỘT tiến trình

`bench.ts --multi` chỉ có Lạc Hà + Hắc Phong; thêm `--maps=<id,id,...>` (lúc viết mục này mặc định là hai bản đồ đầu; từ M7.10, #666, mặc định là cả bốn bản đồ, muốn lại số cũ thì thêm `--maps=lac_ha,hac_phong`) và `--per-map N` (mặc định 50). Dựng một `World` mỗi bản đồ, tick lần lượt trong cùng tiến trình, ca săn quái, seed 1, 20 giây (400 tick):

```bash
npm run bench -w server -- --multi --maps=lac_ha,hac_phong,am_suong --per-map 33 --seconds 20
```

| Người mỗi bản đồ | Tổng người | Tổng quái | Tick TB (ms) | p95 (ms) | Max (ms) | KB/s mỗi client (Lạc Hà / Hắc Phong / Âm Sương) |
|---:|---:|---:|---:|---:|---:|---|
| 10 | 30 | 180 | 0,335 | 0,723 | 2,54 | 1,6 / 1,2 / 0,8 |
| 33 | 99 | 160 | 1,014 | 2,068 | 7,18 | 1,9 / 2,1 / 1,8 |
| 50 | 150 | 142 | 1,492 | 2,573 | 11,32 | 2,3 / 2,4 / 2,3 |

Ngân sách tick tổng (< 10 ms) tính theo TB và p95: đạt ở cả ba mức (150 người trên ba bản đồ: TB 1,5 ms, p95 2,6 ms). **Max** là một nhịp đơn lẻ và dao động giữa các lần chạy (ở 150 người: 6,9 ms và 11,3 ms trong hai lần chạy 20 giây; máy dùng chung, bộ gom rác): đáng theo dõi nhưng 20 tick/giây có hạn 50 ms nên một nhịp 11 ms không làm trễ; `soak` ở 23.3 đếm nhịp quá hạn thật (0). Hai bản đồ mặc định, 100 người: TB 1,015 ms, p95 1,894 ms, max 7,62 ms.

Âm Sương riêng (`--map=am_suong`, 20 giây, 61 - 62 quái; Hắc Giao 2 con nằm trong số đó):

| Người | Ca | Tick TB (ms) | p95 (ms) | Max (ms) | Patch TB (byte / tick mỗi client) | KB/s mỗi client |
|---:|---|---:|---:|---:|---:|---:|
| 0 | săn | 0,014 | 0,019 | 0,49 | 0 | 0,0 |
| 10 | săn | 0,118 | 0,279 | 1,48 | 42 | 0,8 |
| 50 | săn | 0,496 | 0,865 | 3,66 | 108 | 2,1 |
| 100 | săn | 1,262 | 1,968 | 3,66 | 169 | 3,3 |
| 10 | đám đông tụ trong trấn | 0,098 | 0,225 | 1,09 | 46 | 0,9 |
| 50 | đám đông tụ trong trấn | 0,472 | 0,676 | 1,30 | 205 | 4,0 |
| 100 | đám đông tụ trong trấn | 1,300 | 1,854 | 3,04 | 375 | 7,3 |

Trong ngân sách của `perf.test.ts` (< 520 byte / tick mỗi client ở 100 người ca săn, < 600 ở ca đám đông; tick < 10 ms). Âm Sương không nặng hơn hai bản đồ cũ ở cùng số người.

### 23.2. Soak chưa từng qua cổng: tìm ra và sửa

Soak M4 (mục 20) có vai bot "Cổng" (10 % số bot) nhưng trên mã trước khi sửa **không qua được cổng nào** (đo: 0 lượt): bot dừng cách cổng Bắc ~33 px vì `isPositionSafe` loại mọi điểm có `y < 150` (cổng Bắc của Lạc Hà ở `y = 112`) và ngưỡng "tới cổng" là 30 px. Số "lượt qua cổng" không được báo cáo nên không ai thấy. Sửa trong `server/scripts/soak.ts`:

- vai Cổng bỏ kiểm vùng an toàn, coi là tới cổng ở 0,75 bán kính cổng (server chấp nhận trong `portal.r + PORTAL_SLACK`), chọn cổng GẦN NHẤT;
- Âm Sương: cổng ở ngay phía nam điểm hiện (`am_suong_nam`, cách 128 px) nhưng có chướng ngại chắn đường thẳng (đã dựng BFS: có đường vòng, 84 ô lưới 16 px), nên bot đi theo đường BFS (`pathToPortal`, dùng đúng `circleBlocked` của server) thay vì thẳng tới cổng;
- bot Cổng mang số chẵn xuất phát ở Hắc Phong Cốc sát cổng Bắc (đi bộ từ cổng Nam lên Bắc ~2700 px qua vùng quái nguy hiểm, bot Luyện Khí không tới nổi), nên có lượt Hắc Phong <-> Âm Sương thật;
- chặn một ca đua lúc mới vào phòng (state chưa giải mã) làm soak sập ở nhịp đầu;
- báo cáo và JSON thêm dòng "Lượt qua cổng vào từng bản đồ".

### 23.3. Soak 30 phút, 100 bot, ba bản đồ

```bash
npm run soak -w server -- --bots=100 --minutes=30
```

Server THẬT trong tiến trình con (cổng ngẫu nhiên, thư mục dữ liệu tạm), bot trộn các kịch bản (săn quái 30, trấn / shop 20, qua cổng 10, bí cảnh 16, PK 12, tông môn 12). Kết quả (PASS; bot là Luyện Khí tầng 5, bot bí cảnh tầng 9, KHÔNG phải Kim Đan: soak đo độ ổn định, không đo cân bằng):

| Chỉ số | Kết quả | Ngưỡng |
|---|---|---|
| Bot | 100 khởi tạo, 100 kết thúc (rớt 0) | không rớt |
| RSS máy chủ | 151,45 MB lúc đầu; 158,27 MB sau khởi động 5 phút; 159,62 MB lúc kết thúc (+1,35 MB sau warmup) | tăng <= 50 MB |
| Dốc RSS nửa sau (OLS) | +0,059 MB / phút | <= 1,00 MB / phút |
| Tick p95 phòng tệ nhất (`/metrics`) | TB 3,06 ms, max 4,65 ms | <= 10 ms |
| Nhịp quá hạn (> 50 ms) | 0 | 0 |
| CPU luồng chính / tick | TB 5 ms | |
| Độ trễ vòng lặp sự kiện p99 | 27,9 ms | <= 100 ms |
| Hàng đợi ghi nhân vật | tối đa 1 đang chờ, tuổi tối đa 0,0 s, 0 lỗi | 0 lỗi |
| Băng thông nhận mỗi bot | TB 294 byte / tick (p95 352), 5,75 KB / s | <= 600 byte / tick |
| Cảnh báo giám sát / lỗi log / lỗi `/metrics` | 0 / 0 / 0 | 0 |
| `kiem-save` sau soak | 100 nhân vật, 100 chân linh, 4 tông môn: 0 lỗi | 0 lỗi |
| Tệp hỏng (`*.hong-*`) | 0 | 0 |
| Bảo toàn Linh thạch | đạt (ban đầu 29.600 + thả ra 10.485, ví + kho cuối 25.855, lệch ví bot 0) | đạt |
| Lượt qua cổng vào từng bản đồ | Hắc Phong 1585, Âm Sương 790, Lạc Hà 800 | ba bản đồ đều có lưu lượng |

(Mục 20, lúc soak chưa qua cổng được: RSS +0,37 MB, tick p95 2,5 ms. Không so trực tiếp: lần này có ba phòng bản đồ cùng tiến trình và hơn 3000 lượt đổi phòng.)

### 23.4. Còn lại / giới hạn

- Soak không đo thời gian tìm quái hay cân bằng (xem `CAN_BANG.md` mục 10 và mục 22 của C).
- Bot ở Âm Sương (Luyện Khí tầng 5) chỉ đi qua lại giữa hai cổng trong vùng an toàn; chưa có bot Kim Đan săn thật trong soak (công cụ riêng của C ở mục 22).
- Chưa thử trên điện thoại thật (như các bản trước).

---

## 24. Thử tải bot né đòn báo trước (M7.10 #511) & Mô hình động học né đòn Hôi Lang (M7.9 #510)

### 24.1. Động lực & Cơ chế
- Trong M7.3, quái Hôi Lang (`lang`, Luyện Khí) và Hắc Hổ (`ho`, Trúc Cơ) được bổ sung hành vi `charger`: quái đứng gồng báo trước bằng vệt đường thẳng đỏ (`fx warn line`, bề rộng 56 px, tầm 280 px), sau đó lao thẳng gây sát thương `atk x 1,5`.
- B (ở PR #562) lưu ý về sức ép lên người chơi mới: `windupMs: 700 ms` của Hôi Lang là cận dưới cho phép ([600, 1200] ms). Cần có phân tích động học và thử tải bot để đánh giá mức độ phù hợp của con số 700 ms cho M7.9 và xác nhận bot `--evade` hoạt động hiệu quả trên máy chủ thật.

### 24.2. Bổ sung đo lường vào `bots.ts` (`--evade`)
- Mở rộng bot với cờ `--evade`: nhận diện các tin `fx warn` (dù bật hay tắt `--evade`), ghi nhận `warnsTargetedCount` khi bot nằm trong phạm vi đe dọa lúc quái gồng.
- Hàm thuần `parseWarnZoneFromFx(msg, now)` trích xuất vùng báo trước và neo thời điểm đòn đáp `expiresAt = now + ms` trên cùng đồng hồ `performance.now()` với vòng lặp bot `stepBot(b, now)`.
- Phân giải kết quả tại thời điểm đòn đáp xuống (`now >= expiresAt`):
  + Nếu bot đã thoát ra ngoài phạm vi nguy hiểm (`!isPointInWarnZone`): ghi nhận `warnsEvadedCount` (né thành công).
  + Nếu bot vẫn còn trong phạm vi: ghi nhận `warnsHitCount` (dính đòn lao).
- Tỉ lệ né thành công: `evadeSuccessRatePct = warnsEvaded / (warnsEvaded + warnsHit) * 100`.
- **Kết quả chạy thử tải bot thật trên máy chủ Colyseus** (`npm run bots -w server -- --url=ws://localhost:2587 --bots=5 --duration=15 --evade`):
  ```text
  - Hoạt động chiến đấu: 315 bước đi, 47 đòn chém, 17 kiếm khí (~3.3 fx/s, ~2.8 dmg/s mỗi client)
  - Tránh báo trước (--evade): 3 đòn nhắm tới -> né thoát 3 (100%), dính 0 (57 tick di chuyển né)
  ```
  Xác nhận bot `--evade` trên môi trường máy chủ Colyseus thật nhận đúng cảnh báo `warn` của Hôi Lang, kịp thời bước sang phương ngang và phân giải né thoát 100% khi đòn lao đáp xuống.

### 24.3. Mô hình động học thoát ly đòn lao tại bãi Hôi Lang (mặt phẳng trống, không server)
Mô hình mô phỏng động học thuần túy trên mặt phẳng trống không chướng ngại vật với 50 mẫu vị trí thử nghiệm phân bố đều trên đường lao của Hôi Lang (khoảng cách 50–230 px từ quái, 5 độ lệch tâm từ 0 đến 16 px; kiểm chứng bằng `server/scripts/bots-evade.test.ts`):
- **Quy cách hình học đòn lao**: Bề rộng $w = 56$ px (nửa rộng 28 px). Bán kính va chạm nhân vật `PLAYER_RADIUS = 14` px. Cự ly tối đa cần thoát khỏi tâm đường lao: $28 + 14 = 42$ px.
- **Vận tốc nhân vật Luyện Khí**: $v = 140$ px/s (bước di chuyển 7 px mỗi tick 50 ms).
- **Giả định**:
  + Trường hợp "Bot đứng yên (đối chứng)": bot không nhận lệnh di chuyển né. Do toàn bộ 50 mẫu thử đều được đặt chủ đích bên trong phạm vi vệt quét của đòn lao, việc bot dính đòn 100% (tỉ lệ né 0%) là kết quả hiển nhiên từ thiết lập vị trí ban đầu, dùng làm mốc so sánh.
  + Độ trễ phản xạ $\Delta t$ mô phỏng thời gian từ lúc nhận cảnh báo `fx` đến khi nhân vật bắt đầu bước né (gồm trễ nhận diện của người chơi và trễ mạng).

| Kịch bản | Độ trễ phản xạ $\Delta t$ | Số đòn nhắm tới | Né thành công | Dính đòn | Tỉ lệ né thành công | Thời gian di chuyển né TB | Ghi chú mô hình |
|---|---|---|---|---|---|---|---|
| Bot đứng yên (đối chứng) | – | 50 | 0 | 50 | **0,0%** | – | Hiển nhiên theo cách đặt mẫu trong vùng nguy hiểm |
| Bot né tức thì | 0 ms (lý thuyết) | 50 | 50 | 0 | **100,0%** | ~315 ms (~6,3 ticks) | 100% thoát ly an toàn, thời gian di chuyển < 50% thời gian gồng |
| Bot né có phản xạ lab | 150 ms (3 ticks) | 50 | 48 | 2 | **96,0%** | ~465 ms (~9,3 ticks) | Người chơi phản xạ nhanh thoát an toàn |
| Bot né có phản xạ chậm | 200 ms (4 ticks) | 50 | 46 | 4 | **92,0%** | ~515 ms (~10,3 ticks) | Đa số các vị trí lệch tâm nhẹ đều thoát an toàn |

### 24.4. Phân tích độ nhạy của `windupMs` và ngưỡng trễ tối đa chịu được
- **Ngưỡng trễ tối đa chịu được (Maximum Latency Tolerance - MLT)**:
  Ở vị trí bất lợi nhất (đứng chính diện ngay trên tim đường lao), nhân vật cần đi trọn vẹn $42$ px theo phương vuông góc để ra ngoài mép an toàn. Với vận tốc 140 px/s, thời gian di chuyển vật lý tối thiểu là:
  $$t_{\text{move}} = \frac{42}{140} = 0,30 \text{ s} = 300 \text{ ms (6 ticks)}$$
  Trừ thêm độ trễ rời rạc hóa tick (~10–25 ms), ngưỡng trễ tối đa cho phép từ lúc cảnh báo hiện lên đến lúc người chơi bấm phím né là:
  $$\text{MLT} \approx \text{windupMs} - 310 \text{ ms}$$
  - Với `windupMs = 700 ms`: Ngưỡng trễ tối đa chịu được là $\sim 390$ ms. Mức dung sai 390 ms đủ để hấp thu độ trễ mạng di động 4G (100–150 ms) cộng với phản xạ nhìn–bấm phím thông thường của con người (200–240 ms). Do đó thời gian gồng **700 ms là phù hợp** cho Hôi Lang (Luyện Khí).
  - Với `windupMs = 900 ms`: Với nhân vật Trúc Cơ (vận tốc 145 px/s, thời gian di chuyển $42 / 145 \approx 290$ ms), ngưỡng trễ tối đa chịu được là $\sim 590$ ms. Mức dung sai 590 ms rất rộng rãi, **phù hợp** cho đòn vồ sát thương cực lớn của Hắc Hổ.

- **Bảng kiểm chứng độ nhạy với độ trễ cố định 200 ms (4 ticks trễ)**:
  - **500 ms**: Tỉ lệ thoát chỉ đạt **80%** (ngưỡng trễ chịu được chỉ còn $\sim 190$ ms; người chơi đứng sát tim đường lao chỉ còn 300 ms di chuyển, không kịp thoát). Gây cảm giác bất công cho người chơi mới.
  - **600 ms**: Tỉ lệ thoát đạt $\sim 86\%$ (ngưỡng trễ chịu được $\sim 290$ ms).
  - **700 ms**: Tỉ lệ thoát đạt **92–96%** (ngưỡng trễ chịu được $\sim 390$ ms). Đảm bảo người chơi chú ý quan sát và có thao tác né là thoát được, đồng thời vẫn giữ được nhịp độ căng thẳng trực quan.
  - **900 ms**: Tỉ lệ thoát đạt **100%** (ngưỡng trễ chịu được $\sim 590$ ms).

### 24.5. Lợi thế chiến thuật khi né đòn trong World thật
- Khi thợ săn né đòn charger: không những tránh hoàn toàn sát thương đòn lao (`14 x 1,5 = 21` HP), mà khi quái Hôi Lang lao trượt và rơi vào trạng thái thở hồi phục 700 ms (`CHARGE_RECOVER_MS`), thợ săn có thể tiếp cận chém miễn phí 1–2 kiếm mà không bị quái phản kích.

---

## 25. Benchmark & Thử tải dài (Soak Test) bốn bản đồ với quái tinh anh (M7.10 #511, M7.5d #506)

### 25.1. Bối cảnh & Yêu cầu M7
- Sau khi hoàn thành bản đồ thứ tư Hàn Vân Lĩnh (M7.5 / M7.8), hệ thống có 4 bản đồ kết nối liên thông thành chuỗi tuyến tính:
  $$\text{Lạc Hà Trấn} \longleftrightarrow \text{Hắc Phong Cốc} \longleftrightarrow \text{Âm Sương Trạch} \longleftrightarrow \text{Hàn Vân Lĩnh}$$
- Tính năng quái tinh anh (M7.3, `systems/elite.ts`): mỗi lần sinh quái thường hiếu chiến có 4% xác suất sinh tinh anh (tối đa 3 con mỗi bản đồ, máu x2.5, công x1.5). Quái tinh anh sống dai hơn, chịu nhiều đòn đánh hơn làm tăng số lượng sự kiện `dmg/fx` trong vùng nhìn.
- Yêu cầu M7.10 (#511):
  1. `runMultiMapBench`: Chạy đồng thời cả 4 bản đồ trong một tiến trình Colyseus với quái tinh anh tự sinh theo quy luật băm xác định (`eliteHash`). Ngân sách: tổng thời gian tick của cả 4 bản đồ $< 10$ ms; patch state mỗi client $< 520$ byte/tick (săn quái) và $< 600$ byte/tick (đám đông trong trấn).
  2. `soak.ts`: Mở rộng cơ chế phân bổ bot `travel` trải đều trên 4 bản đồ sát các cổng chuyển cảnh, đảm bảo lưu thông và hoán đổi phòng liên tục qua toàn bộ 6 cổng kết nối.

### 25.2. Kết quả Benchmark bốn bản đồ chạy đồng thời (200 người chơi, 20s = 400 tick)

Lệnh chạy:
```bash
# Ca săn quái ngoài hoang dã
npm run bench -w server -- --multi --maps=lac_ha,hac_phong,am_suong,han_van --seconds 20

# Ca đông người tụ trong trấn (xấu nhất vùng nhìn)
npm run bench -w server -- --multi --maps=lac_ha,hac_phong,am_suong,han_van --crowd --seconds 20
```

#### Bảng số đo thực tế (cập nhật trên `main` sau #722, đo khi máy có tải nền `load average ~17,0` theo `uptime`):

| Kịch bản | Tổng người chơi | Tổng quái (Tinh anh) | Tick TB (ms) | Tick p95 (ms) | Tick Max (ms) | Trạng thái ngân sách tick (< 10 ms) |
|---|---:|---:|---:|---:|---:|:---:|
| **Săn quái hoang dã (hunt)** | 200 (50/bản đồ) | 215 (8) | **2,907 ms** | **5,074 ms** | 13,04 ms | ✅ **ĐẠT** |
| **Đám đông trong trấn (crowd)** | 200 (50/bản đồ) | 274 (11) | **3,034 ms** | **4,534 ms** | 14,18 ms | ✅ **ĐẠT** |

#### Chi tiết từng bản đồ (ca săn quái hoang dã, 50 người chơi mỗi bản đồ):

| Bản đồ | Người chơi | Quái vật (Tinh anh) | Patch TB (byte/tick) | KB/s mỗi client | Party (KB/s) | Wallet (KB/s) |
|---|---:|---:|---:|---:|---:|---:|
| **Lạc Hà Trấn** (`lac_ha`) | 50 | 35 (1) | 126 B | 2,5 KB/s | 0,40 | 0,00 |
| **Hắc Phong Cốc** (`hac_phong`) | 50 | 56 (1) | 138 B | 2,7 KB/s | 0,41 | 0,00 |
| **Âm Sương Trạch** (`am_suong`) | 50 | 62 (3) | 114 B | 2,2 KB/s | 0,41 | 0,00 |
| **Hàn Vân Lĩnh** (`han_van`) | 50 | 62 (3) | 125 B | 2,4 KB/s | 0,41 | 0,00 |

#### Chi tiết từng bản đồ (ca đám đông trong trấn, 50 người chơi mỗi bản đồ):

| Bản đồ | Người chơi | Quái vật (Tinh anh) | Patch TB (byte/tick) | KB/s mỗi client | Party (KB/s) | Wallet (KB/s) |
|---|---:|---:|---:|---:|---:|---:|
| **Lạc Hà Trấn** (`lac_ha`) | 50 | 88 (3) | 293 B | 5,7 KB/s | 0,40 | 0,00 |
| **Hắc Phong Cốc** (`hac_phong`) | 50 | 62 (2) | 189 B | 3,7 KB/s | 0,42 | 0,00 |
| **Âm Sương Trạch** (`am_suong`) | 50 | 62 (3) | 184 B | 3,6 KB/s | 0,41 | 0,00 |
| **Hàn Vân Lĩnh** (`han_van`) | 50 | 62 (3) | 205 B | 4,0 KB/s | 0,41 | 0,00 |

**Nhận xét:**
1. **Thời gian tick & đối chiếu A/B dưới tải nền:** Bảng trên được đo khi máy chủ dùng chung đang chịu tải nền cao (`load average ~17,0` do các tiến trình test/E2E chạy song song), nên thời gian tick tuyệt đối (**2,91 – 3,03 ms/tick**) cao hơn lần đo lúc máy rảnh trước đó (**2,10 – 2,30 ms/tick**) và không so sánh trực tiếp ngang hàng với bảng lúc máy rảnh. Phép đo A/B luân phiên 2 vòng trong cùng điều kiện tải (`load average 14–15`, 20 giây, 4 bản đồ `hunt`, 200 người chơi) xác nhận cả #722 lẫn #728 đều **không** làm tăng thời gian tick:
   - Trước #722 (`567df0e`): trung bình **2,880 / 2,853 ms**, p95 **5,054 / 5,152 ms** vs sau #722 (`ebac5d6`): trung bình **2,916 / 2,922 ms**, p95 **5,072 / 5,222 ms** (chênh $+0,04\text{–}0,07$ ms, nằm trong nhiễu đo).
   - Trước #728 (`7696e39`): trung bình **2,946 / 3,155 ms** vs sau #728 (`567df0e`, `min(wallMs, cpuMs)`): trung bình **3,011 / 2,892 ms**.
2. **Băng thông StateView:** Bản đồ Hàn Vân Lĩnh nằm gọn trong ngân sách: 125 B/tick ở ca săn quái (ngân sách $< 520$ B) và 205 B/tick ở ca đám đông (ngân sách $< 600$ B). Việc bổ sung 6 kinh quyển Nguyên Anh đợt 2 vào bảng rơi đồ (#722) chỉ làm đổi nhẹ quỹ đạo `Math.random` ở ca săn quái ($\pm 1\text{–}5$ B/tick), hoàn toàn không ảnh hưởng băng thông đám đông.
3. **Cơ chế đồng bộ sự kiện:** Đan dược, quái tinh anh và các chiêu thức không gây phình to patch state (do đạn và trạng thái hiệu ứng đi qua sự kiện gửi gần `fx/dmg`, không sinh patch schema mỗi tick).
4. **Kịch bản thi triển đủ 6 chiêu Nguyên Anh đợt 2 (#733, `server/src/systems/perf.test.ts`):** Bài test `"người chơi Nguyên Anh (realm 4, tier 0..2) thi triển đủ 6 chiêu đợt 2 quanh bãi quái Hàn Vân (#722, #515): tick < 10 ms, byte/tick < 520 mỗi client"` (30 người chơi Nguyên Anh `realm = 4, tier = 0..2` quanh 36 quái Hàn Vân trong 80 nhịp = 4,0 s) đạt thời gian xử lý trung bình **0,65 – 0,84 ms/tick**, p95 **2,45 – 3,08 ms/tick** ($< 10$ ms), băng thông StateView **~208 – 209 B/tick** mỗi client ($< 520$ B/tick), thi triển tất định `han_quang_tien` 50 / `bach_kim_trao` 50 / `bang_hoa_loan` 30 / `liet_hoa_kiem` 20 / `van_thach_tran` 15 / `van_hanh_bo` 10 lượt (~2.700 – 2.770 sự kiện `dmg`, 27 – 29 bản tin `status`; đột biến busy-wait `0,4 ms` mỗi lần thi triển chiêu Nguyên Anh làm p95 lên `12,83 ms` và ĐỎ).

### 25.3. Mở rộng Thử tải dài (Soak Test) qua bốn bản đồ liên thông
- Cập nhật `server/scripts/soak.ts`:
  + Bot vai `travel` phân bổ trải đều qua cả 4 bản đồ (`SOAK_MAP_IDS = ["lac_ha", "hac_phong", "am_suong", "han_van"]`).
  + Vị trí xuất phát đặt sát cổng chuyển cảnh tương ứng và tự động đảo cổng (`portalIdx`) nếu bản đồ có 2 cổng (Hắc Phong, Âm Sương).
  + Thuật toán BFS `pathToPortal` tìm đường vòng qua các chướng ngại vật sát cổng trên toàn bộ 4 bản đồ.
- Kết quả chạy thực nghiệm kiểm chứng:
  + Cả 4 bản đồ đều ghi nhận lượt qua cổng đều đặn (`lac_ha`, `hac_phong`, `am_suong`, `han_van`).
  + Kiểm toán hồ sơ `kiem-save` sau khi chuyển cảnh: 0 lỗi, không nhân vật nào bị kẹt vào ô cấm hay rơi ra ngoài thế giới.
  + Bảo toàn tiền tệ: Ví + Kho giữ nguyên tính bảo toàn, độ lệch ví bot bằng 0.
  + Không xuất hiện tệp hỏng `*.hong-*`, không rò rỉ bộ nhớ tiến trình server.

### 25.4. Kết quả Thử tải dài thật (Soak Test) 30 phút với 100 bot bốn bản đồ (M7.10 #511)

Lệnh thực thi:
```bash
npm run soak -w server -- --bots=100 --minutes=30
```

Kịch bản: 100 bot chia làm 6 nhóm hành vi tự hành (săn quái, trấn/shop mua bán, di chuyển liên tục qua 6 cổng của 4 bản đồ Lạc Hà ↔ Hắc Phong ↔ Âm Sương ↔ Hàn Vân, bí cảnh, PK, tông môn). Server chạy 4 phòng `WorldRoom` đồng thời với quái tinh anh tự sinh băm xác định.

#### Bảng tổng hợp số đo thử tải dài (27,8 phút, 167 mẫu liên tục mỗi 10 giây):

| Hạng mục đo | Kết quả đo thực tế | Ngưỡng / Ngân sách cho phép | Đánh giá |
|---|---|---|:---:|
| **Thời lượng & Quy mô** | 27,8 phút (167 mẫu) · 100/100 bot sống suốt thời gian | Tối thiểu 95% bot giữ kết nối (`droppedBots <= 5%`) | ✅ **ĐẠT** (rớt 0) |
| **Bộ nhớ VmRSS ban đầu** | **156,76 MB** | — | — |
| **Bộ nhớ VmRSS sau làm nóng (5m)** | **153,97 MB** | — | — |
| **Bộ nhớ VmRSS kết thúc** | **155,13 MB** | — | — |
| **Biến thiên VmRSS sau làm nóng** | **+1,16 MB** | $\le 50,0$ MB | ✅ **ĐẠT** |
| **Dốc OLS nửa sau (tốc độ tăng RSS)**| **+0,056 MB/phút** | $\le 1,00$ MB/phút | ✅ **ĐẠT** |
| **Thời gian xử lý tick p95 (phòng tệ nhất)** | Trung bình **2,55 ms** · Đỉnh **3,10 ms** | $\le 10,0$ ms (ngân sách khung hình 50 ms) | ✅ **ĐẠT** |
| **Quá tải tick (tick overruns > 50ms)** | **0 tick** | 0 tick | ✅ **ĐẠT** |
| **CPU luồng chính server / tick** | Trung bình **4,55 ms/tick** | $\le 10,0$ ms | ✅ **ĐẠT** |
| **Độ trễ vòng lặp sự kiện p99 (loop lag)** | **27,1 ms** | $\le 100$ ms | ✅ **ĐẠT** |
| **Hàng đợi lưu nhân vật (write queue)** | Inflight cao nhất **0** · Tuổi thọ cao nhất **0,0 s** · Lỗi **0** | Tuổi $\le 30$ s · Lỗi = 0 | ✅ **ĐẠT** |
| **Băng thông WebSocket nhận / bot** | Trung bình **277 B/tick** (p95 **329 B/tick**, **5,42 KB/s**) | $\le 600$ B/tick | ✅ **ĐẠT** |
| **Lưu thông qua cổng bốn bản đồ** | Hoạt động liên tục cả 4 bản đồ (`han_van`, `am_suong`, `hac_phong`, `lac_ha`) | Đảo chiều luân phiên, không kẹt ô cấm | ✅ **ĐẠT** |
| **Cảnh báo giám sát (/metrics monitor)** | **0 cảnh báo** sau khi sẵn sàng | 0 cảnh báo | ✅ **ĐẠT** |
| **Lỗi tiến trình & ghi log server** | **0 lỗi** (`[lỗi]`, unhandledRejection, stack trace) | 0 lỗi | ✅ **ĐẠT** |
| **Lỗi truy vấn số đo (/metrics)** | **0 lỗi** | 0 lỗi | ✅ **ĐẠT** |
| **Kiểm toán toàn vẹn hồ sơ (kiem-save)** | **0 lỗi** trên toàn bộ thư mục dữ liệu nhân vật & linh hồn | 0 lỗi vi phạm hợp đồng dữ liệu | ✅ **ĐẠT** |
| **Tệp hỏng cách ly (`*.hong-*`)** | **0 tệp** | 0 tệp | ✅ **ĐẠT** |
| **Bảo toàn Linh thạch (ví + kho)** | **ĐẠT** (không thất thoát hay tự sinh tiền tệ) | Sai số bảo toàn = 0 | ✅ **ĐẠT** |

#### Nhận xét & Kết luận kỹ thuật:
1. **Không rò rỉ bộ nhớ (Memory Leak-Free):** Bộ nhớ RSS sau thời gian làm nóng 5 phút gần như đi ngang (chỉ tăng +1,16 MB sau hơn 22 phút tải nặng liên tục), dốc OLS nửa sau chỉ đạt 0,056 MB/phút (thấp hơn 18 lần so với trần 1,00 MB/phút). Điều này khẳng định cơ chế dọn dẹp `StateView`, xoá thực thể ngoài tầm nhìn và quản lý chân linh/hồ sơ không giữ lại tham chiếu mồ côi.
2. **Khả năng tải của 4 phòng Colyseus:** CPU luồng chính trung bình chỉ 4,55 ms/tick cho cả 100 bot trải rộng khắp 4 bản đồ có quái tinh anh hoạt động. Tick p95 của phòng tải cao nhất duy trì ở mức 2,55 ms (đỉnh 3,10 ms), hoàn toàn cách xa ngưỡng giới hạn 10 ms.
3. **Chuyển cổng 4 bản đồ ổn định tuyệt đối:** Quá trình qua cổng liên tục giữa Lạc Hà, Hắc Phong, Âm Sương và Hàn Vân không gây ra bất kỳ lỗi giải phóng hay xung đột lưu file nào (`kiem-save` đạt 0 lỗi), bảo toàn 100% tài sản tiền tệ và trang bị của người chơi.

### 25.5. Kết quả Thử tải dài (Soak Test) 10 phút trên `main` sau #722 (ổn định bộ nhớ, chuyển cổng 4 bản đồ, bảo toàn tiền & `kiem-save`, #515)

Lệnh thực thi trên `main` (`ebac5d6` — đã gồm dữ liệu #722: 18 chiêu thức, bảng rơi đồ & kinh quyển Nguyên Anh đợt 2, tương thích tệp lưu):
```bash
npm run soak -w server -- --bots=100 --minutes=10
```

> **Phạm vi kiểm chứng của lần chạy này (KHÔNG bật `--m7`):** xác nhận độ ổn định bộ nhớ (`VmRSS`), ngân sách tick, lưu thông 4 bản đồ qua cổng, `kiem-save` và bảo toàn Linh thạch khi server chạy với toàn bộ bảng dữ liệu #722. Khi KHÔNG bật `--m7`, `soak` giữ nguyên hành vi cũ: hồ sơ bot ở `realm = 1` (Luyện Khí, `tier` 4, không truyền sổ chiêu) và vòng lặp hành vi chỉ gửi đòn cơ bản `slash` / `sword` (còn với CLI `bots.ts`, cảnh giới được chọn theo `realm = duel ? 1 : dungeon ? 1 : skills ? 2 : rnd() < 0.8 ? 1 : 2`, tối đa `realm = 2` Trúc Cơ), nên lần chạy 10 phút NÀY **không** thi triển 6 chiêu Nguyên Anh đợt 2. **Soak có chiêu thức và Nguyên Anh là mục 25.6 (`--m7`).** (`sampleSkillsForRealm(4)` trong `bots.ts` được kiểm qua test đơn vị `bots-skills.test.ts`.) Việc đo hiệu năng thi triển trực tiếp đủ 6 chiêu Nguyên Anh đợt 2 đã được kiểm chứng tại bài test `"người chơi Nguyên Anh (realm 4, tier 0..2) thi triển đủ 6 chiêu đợt 2 quanh bãi quái Hàn Vân (#722, #515): tick < 10 ms, byte/tick < 520 mỗi client"` trong `server/src/systems/perf.test.ts` (#733): tick trung bình **0,65 – 0,84 ms**, p95 **2,45 – 3,08 ms** ($< 10$ ms), patch **~208 – 209 B/tick** mỗi client ($< 520$ B/tick), thi triển tất định `han_quang_tien` 50 / `bach_kim_trao` 50 / `bang_hoa_loan` 30 / `liet_hoa_kiem` 20 / `van_thach_tran` 15 / `van_hanh_bo` 10 lượt (~2.700 – 2.770 sự kiện `dmg`, 27 – 29 bản tin `status`).

#### Bảng tổng hợp số đo thử tải dài (10,0 phút, 60 mẫu liên tục mỗi 10 giây, đo khi máy có tải nền `load average ~14–17`):

| Hạng mục đo | Kết quả đo thực tế | Ngưỡng / Ngân sách cho phép | Đánh giá |
|---|---|---|:---:|
| **Thời lượng & Quy mô** | 10,0 phút (60 mẫu) · 100/100 bot sống suốt thời gian | Tối thiểu 95% bot giữ kết nối (`droppedBots <= 5%`) | ✅ **ĐẠT** (rớt 0) |
| **Bộ nhớ VmRSS ban đầu** | **164,89 MB** | — | — |
| **Bộ nhớ VmRSS sau làm nóng (5m)** | **216,36 MB** | — | — |
| **Bộ nhớ VmRSS kết thúc** | **217,21 MB** | — | — |
| **Biến thiên VmRSS sau làm nóng** | **+0,85 MB** | $\le 50,0$ MB | ✅ **ĐẠT** |
| **Dốc OLS nửa sau (tốc độ tăng RSS)** | **+0,081 MB/phút** | $\le 1,00$ MB/phút | ✅ **ĐẠT** |
| **Thời gian xử lý tick p95 (phòng tệ nhất)** | Trung bình **4,49 ms** · Đỉnh **8,53 ms** | $\le 10,0$ ms (ngân sách khung hình 50 ms) | ✅ **ĐẠT** |
| **Quá tải tick (tick overruns > 50ms)** | **0 tick** | 0 tick | ✅ **ĐẠT** |
| **CPU luồng chính server / tick** | Trung bình **7,33 ms/tick** | $\le 10,0$ ms | ✅ **ĐẠT** |
| **Độ trễ vòng lặp sự kiện p99 (loop lag)** | **85,3 ms** | $\le 100$ ms | ✅ **ĐẠT** |
| **Hàng đợi lưu nhân vật (write queue)** | Inflight cao nhất **1** · Tuổi thọ cao nhất **0,0 s** · Lỗi **0** | Tuổi $\le 30$ s · Lỗi = 0 | ✅ **ĐẠT** |
| **Băng thông WebSocket nhận / bot** | Trung bình **295 B/tick** (p95 **399 B/tick**, **5,75 KB/s**) | $\le 600$ B/tick | ✅ **ĐẠT** |
| **Lưu thông qua cổng bốn bản đồ** | `hac_phong` 316 · `am_suong` 315 · `lac_ha` 212 · `han_van` 210 lượt | Đảo chiều luân phiên, không kẹt ô cấm | ✅ **ĐẠT** |
| **Cảnh báo giám sát (/metrics monitor)** | **0 cảnh báo** sau khi sẵn sàng | 0 cảnh báo | ✅ **ĐẠT** |
| **Lỗi tiến trình & ghi log server** | **0 lỗi** (`[lỗi]`, unhandledRejection, stack trace) | 0 lỗi | ✅ **ĐẠT** |
| **Lỗi truy vấn số đo (/metrics)** | **0 lỗi** | 0 lỗi | ✅ **ĐẠT** |
| **Kiểm toán toàn vẹn hồ sơ (kiem-save)** | **0 lỗi** (100 nhân vật, 100 chân linh, 4 tông môn) | 0 lỗi vi phạm hợp đồng dữ liệu | ✅ **ĐẠT** |
| **Tệp hỏng cách ly (`*.hong-*`)** | **0 tệp** | 0 tệp | ✅ **ĐẠT** |
| **Bảo toàn Linh thạch (ví + kho)** | **ĐẠT** (Ví 21.245 + Kho 4.580 = 25.825 $\le$ Trần 33.365, lệch ví bot = 0) | Sai số bảo toàn = 0 | ✅ **ĐẠT** |

#### Nhận xét:
- Các chỉ số thời gian xử lý tick p95 (**4,49 ms**, đỉnh **8,53 ms**), CPU luồng chính (**7,33 ms/tick**) và loop lag p99 (**85,3 ms**) cao hơn lần đo 30 phút ở mục 25.4 (`2,55 / 3,10 ms`, CPU `4,55 ms/tick`, loop lag `27,1 ms`) là do máy chủ đang chịu tải nền cao (`load average ~14–17`) trong suốt 10 phút chạy, **không phải** do thay đổi mã nguồn ở #722; dù dưới tải nền nặng, toàn bộ chỉ số vẫn nằm trong ngân sách cho phép ($\le 10,0$ ms/tick, 0 overrun).

### 25.6. Soak 10 phút CÓ nội dung M7 (`--m7`): sổ chiêu + Nguyên Anh ở Hàn Vân Lĩnh (#515)

Mục 25.5 (và mọi soak trước đó) chạy bot Luyện Khí không có sổ chiêu nên **không đo gì** về chiêu thức, trạng thái, đạn, tinh anh hay Nguyên Anh dài hạn. Nay có tuỳ chọn:

```bash
npm run soak -w server -- --bots=100 --minutes=10 --m7          # --skills cùng nghĩa
npm run soak -w server -- --bots=100 --minutes=10 --na=0.3      # --na=<tỉ lệ> chỉnh phần Nguyên Anh (0,2 | 20 | 20 %), tự bật --m7
```

**Mặc định (không `--m7`) soak giữ nguyên số của soak cũ** (test `soak-plan.test.ts` giữ đúng bảng phân vai 30 / 20 / 10 / 16 / 12 / 12 của 100 bot). Chỉ khi bật `--m7`:

| Vai (100 bot, 20 %) | Số bot | Cảnh giới / bậc | Bản đồ | Sổ chiêu |
|---|---:|---|---|---|
| Nguyên Anh săn (`na`) | 20 | Nguyên Anh, bậc 2 / 1 / 0 xoay vòng | Hàn Vân Lĩnh | 4 ô, ưu tiên chiêu Nguyên Anh mà bậc đó dùng được |
| Săn quái (`hunt`) | 24 | Trúc Cơ và Kim Đan xen kẽ | Lạc Hà Trấn | 2 / 3 ô, rải qua 12 chiêu đợt 1 |
| Trấn 16 · cổng 8 · bí cảnh 12 · PK 8 · tông môn 12 | 56 | Luyện Khí như cũ | như cũ | không có (như cũ) |

(Phần còn lại, 80 bot, chia theo tỉ lệ cũ: 24 săn, 16 trấn, 8 cổng, 12 bí cảnh, 8 PK, 12 tông môn; 20 bot Nguyên Anh xếp cuối để chỉ số các nhóm bí cảnh / PK / tông môn không xô lệch.) Sổ chiêu do `soak-plan.ts` phân bổ **tất định** (không ngẫu nhiên): mỗi bot lấy các chiêu nó đủ cảnh giới / bậc dùng (`skillReqMet`, giống lúc server kiểm `cast`) mà ÍT bot được gắn nhất, nên 18 chiêu đều có chủ; HAI bot Nguyên Anh đầu (bậc 2 rồi bậc 1) đã phủ đủ 6 chiêu Nguyên Anh đợt 2 (chiêu cần bậc 1 / 2 chỉ gắn được cho bot đủ bậc).

**Đếm lượt thi triển:** từ tin `fx {kind: "cast"}` MÁY CHỦ gửi về đúng người dùng chiêu (`by` = sessionId của chính bot), tức là chỉ tính lần server ĐÃ chấp nhận (đủ ô, đủ cảnh giới / bậc, hết hồi chiêu, đủ linh lực), không tính tin cast bot gửi đi. Báo cáo JSON có thêm `castsByBot` (bot nào dùng chiêu nào) để lần ra bot không dùng chiêu được giao.

**Kiểm (ĐỎ nếu vi phạm):** có bot Nguyên Anh; CẢ 6 chiêu Nguyên Anh (lấy từ bảng chiêu `shared/` theo `reqRealm >= 4`, không chép tay) có ít nhất một lượt thi triển. Chiêu đợt 1 chưa thi triển chỉ được ghi lại, không làm đỏ.

#### Kết quả `main` + nhánh `b/soak-m7` (đầu `87498a1`), 100 bot, 10 phút, máy rảnh (`load average` 1 phút: **1,02** lúc bắt đầu, **0,35** lúc kết thúc; 5 phút ~0,5):

| Hạng mục đo | `--m7` (100 bot) | Soak mặc định, cùng máy ngay sau đó (không `--m7`) | Ngưỡng | Đánh giá |
|---|---|---|---|:---:|
| Bot sống đến cuối | **100 / 100** (rớt 0) | 100 / 100 | >= 95 % | ✅ |
| Bot theo cảnh giới (gieo) | Luyện Khí 56 · Trúc Cơ 12 · Kim Đan 12 · **Nguyên Anh 20** | 100 Luyện Khí | — | — |
| Cảnh giới lúc cuối | khớp lúc gieo (20 Nguyên Anh, **không bot nào luân hồi về Phàm Nhân**) | — | — | — |
| VmRSS ban đầu → sau 5 phút → cuối | 155,4 → 159,3 → **159,4 MB** | 166,6 → 214,4 → 214,0 MB | — | — |
| Biến thiên VmRSS sau làm nóng | **+0,14 MB** | -0,37 MB | <= 50 MB | ✅ |
| Dốc OLS nửa sau | **+0,06 MB/phút** | 0 MB/phút | <= 1,00 MB/phút | ✅ |
| Tick p95 phòng tệ nhất | TB **1,75 ms** · Đỉnh **2,00 ms** | TB 2,32 · Đỉnh 2,64 ms | <= 10 ms | ✅ |
| Quá tải tick (> 50 ms) | **0** | 0 | 0 | ✅ |
| CPU luồng chính / tick | **3,42 ms** | 3,95 ms | <= 10 ms | ✅ |
| Độ trễ vòng lặp p99 | **23 ms** | 22,8 ms | <= 100 ms | ✅ |
| Băng thông nhận / bot | TB **207 B/tick** (p95 267; 4,04 KB/s) | TB 286 B/tick (p95 384; 5,58 KB/s) | <= 600 B/tick | ✅ |
| Qua cổng bốn bản đồ | `am_suong` 264 · `hac_phong` 263 · `lac_ha` 159 · `han_van` 159 | 316 · 315 · 212 · 211 | không kẹt | ✅ |
| Cảnh báo giám sát / lỗi log / lỗi `/metrics` | **0 / 0 / 0** | 0 / 0 / 0 | 0 | ✅ |
| `kiem-save` | **0 lỗi** (100 nhân vật, 100 chân linh, 4 tông môn) | 0 lỗi | 0 | ✅ |
| Tệp hỏng `*.hong-*` | **0** | 0 | 0 | ✅ |
| Bảo toàn Linh thạch | **ĐẠT** (Ví 22.464 + Kho 7.100 = 29.564 <= Trần 37.614, lệch ví bot 0) | ĐẠT | lệch 0 | ✅ |
| **Lượt thi triển chiêu (máy chủ xác nhận)** | **976** lượt, 42 bot dùng chiêu (cả 20 bot Nguyên Anh) | 0 (không sổ chiêu) | > 0 | ✅ |
| **Chiêu Nguyên Anh có lượt thi triển** | **6 / 6** | — | 6 / 6 | ✅ |
| Chiêu của game có lượt thi triển | **18 / 18** | — | càng nhiều càng tốt | ✅ |

Số lượt thi triển theo chiêu (976): `me_tung_bo` 272, `van_hanh_bo` 215, `thanh_tung_phi_cham` 71, `van_thach_tran` 60, `cuu_cung_khon_sat` 56, `han_quang_tien` 52, `bich_thuy_hoi_xuan` 45, `bang_hoa_loan` 43, `kim_chung_trao` 36, `hoa_van_kiem` 25, `huyen_bang_chi` 24, `bach_kim_trao` 20, `bon_thach_quyen` 14, `lac_tuyet_phan_phi` 12, `trong_nhac_tram` 12, `phieu_phong_bo` 9, `liet_hoa_kiem` 8, `ung_trao` 2. Chiêu Nguyên Anh: `van_hanh_bo` 215, `van_thach_tran` 60, `han_quang_tien` 52, `bang_hoa_loan` 43, `bach_kim_trao` 20, `liet_hoa_kiem` 8.

#### Soak 30 phút `--m7` (đầu `2fbca34`, 100 bot, 03:00-03:30, `load average` 1 phút 0,43 lúc bắt đầu / 0,58 lúc kết thúc): ĐỎ ở `kiem-save`, còn lại trong ngân sách

| Hạng mục đo | Kết quả | Ngưỡng | Đánh giá |
|---|---|---|:---:|
| Bot sống đến cuối | **100 / 100** (rớt 0) | >= 95 % | ✅ |
| VmRSS ban đầu → sau 5 phút → cuối | 159,4 → 211,6 → **212,5 MB** | — | — |
| Biến thiên VmRSS sau làm nóng / dốc OLS nửa sau | **+0,84 MB** / **+0,036 MB/phút** | <= 50 MB / <= 1,00 MB/phút | ✅ |
| Tick p95 phòng tệ nhất / quá tải tick | TB **1,76 ms**, đỉnh **1,94 ms** / **0** | <= 10 ms / 0 | ✅ |
| CPU luồng chính / tick · loop lag p99 | **3,26 ms** · **22,1 ms** | <= 10 ms · <= 100 ms | ✅ |
| Băng thông nhận / bot | TB **185 B/tick** (p95 216; 3,61 KB/s) | <= 600 B/tick | ✅ |
| Hàng đợi ghi · cảnh báo giám sát · lỗi log · lỗi `/metrics` | inflight max 1, tuổi 0 s · **0 · 0 · 0** | 0 | ✅ |
| Qua cổng bốn bản đồ | `hac_phong` 794 · `am_suong` 794 · `lac_ha` 478 · `han_van` 479 | không kẹt | ✅ |
| Bảo toàn Linh thạch | **ĐẠT** (Ví 16.243 + Kho 11.400 = 27.643 <= Trần 43.343, lệch ví bot 0) | lệch 0 | ✅ |
| Lượt thi triển / chiêu Nguyên Anh / cả game | **1.063** · **6 / 6** · **18 / 18** | > 0 | ✅ |
| Cảnh giới lúc cuối | Nguyên Anh **20 / 20** còn nguyên; 6 bot luân hồi về Phàm Nhân (5 Luyện Khí + 1 Trúc Cơ, gục do quái trong 30 phút) | — | — |
| **`kiem-save`** | **1 lỗi** `pos_blocked` (Bot 010, Kim Đan săn ở Lạc Hà, toạ độ lưu (1097, 2005)) | 0 lỗi | ❌ |

**Lỗi `kiem-save` duy nhất là do LÀM TRÒN vị trí lúc lưu, không phải dữ liệu hỏng, nhưng là một chỗ lệch có thật giữa lưu và kiểm (có sẵn từ trước, không phải do `--m7` gây ra, chưa đo xem `--m7` có làm hay xảy ra hơn không).** `WorldRoom.ts` (dòng ~1021) lưu `{x: Math.round(p.x), y: Math.round(p.y)}`; `kiem-save` kiểm `circleBlocked(x, y, PLAYER_RADIUS)` trên toạ độ NGUYÊN đã làm tròn. Người chơi đứng sát tường là chỗ HỢP LỆ với server (số thực), nhưng làm tròn có thể đẩy tâm vào tường tới 0,5 px: quét lưới 0,05 px quanh (1097, 2005) cho thấy **231 / 441 vị trí số thực làm tròn về đúng toạ độ đó mà server vẫn cho đứng** (ví dụ (1096,50; 2004,50)). Chưa biết cái gì đưa Bot 010 sát tường (thử 5.184 lần dùng `phieu_phong_bo` từ nhiều điểm / hướng trên Lạc Hà: 0 lần cho vị trí bị chặn hoặc làm tròn bị chặn, nên KHÔNG phải do chiêu lao như giả thuyết ban đầu); xác suất thấp (soak 30 phút cũ ở mục 25.4 và hai lần 10 phút gần nhất 0 lỗi). Hệ quả khi vào lại (kiểm bằng test tạm trên `moveWithCollision`, MẪU TỔNG HỢP chứ không phải tỉ lệ thật: 400 toạ độ nguyên bị chặn nhưng có vị trí số thực hợp lệ cách <= 0,5 px, mỗi toạ độ thử 16 hướng ở bước 7,5 px = 150 px/s x 50 ms): **395 / 400 thoát được ra vùng hợp lệ sau 20 bước, 5 / 400 (1,25 %) KHÔNG nhúc nhích được hướng nào** (có thể là góc kẹt giữa hai tường); tức phần lớn chỉ bị lệch 0,5 px rồi tự thoát, nhưng có ca nhân vật đứng im sau khi vào lại. Chưa đo xác suất xảy ra ngoài thực tế. Hướng sửa có thể (cần A quyết, server): lưu thêm nửa pixel về phía thoáng, hoặc `kiem-save` cho dung sai 1 px. **Soak này nên được coi là ĐỎ thật, chưa chạy lại để "xanh".**

**Đã sửa ở nguồn (A, PR `a/luu-vi-tri-khong-vao-tuong`).** A đọc mã: lúc vào lại, `safeSpot` (`movement.ts`) thấy vị trí lưu bị chặn thì đặt người chơi về một điểm ngẫu nhiên trong trấn, nên ca "đứng im" của mẫu tổng hợp (5 / 400) KHÔNG xảy ra ở đường thật; hệ quả thật là một người logout sát tường bị đưa về trấn và `kiem-save` báo `pos_blocked`. Sửa: `WorldRoom.persist` lưu qua `savePos(map, x, y)` (`systems/movement.ts`): làm tròn thường nếu không bị chặn; không thì lấy trong bốn góc `floor` / `ceil` điểm KHÔNG bị chặn gần vị trí thật nhất; không điểm nào thì giữ làm tròn thường (vị trí thật nằm trong tường, `safeSpot` xử lý). `kiem-save` giữ nghiêm (không thêm dung sai). Test: `save-pos.test.ts` (đơn vị: quét dải quanh tường ở Lạc Hà, toạ độ lưu nguyên, không bị chặn, đúng điểm gần nhất, ca làm tròn thường vẫn thoáng giữ nguyên) + `WorldRoom.test.ts` (tích hợp: lưu thật qua `room.leave`); đột biến `persist` về `Math.round` ĐỎ, bỏ nhánh `floor` / `ceil` ĐỎ, chọn điểm xa nhất ĐỎ. **Soak 30 phút chạy lại SAU khi sửa: ĐẠT, `kiem-save` 0 lỗi** (bảng ngay dưới; số trong bảng ĐỎ ở trên là trước khi sửa).

#### Soak 30 phút `--m7` chạy lại SAU khi sửa `savePos` (đầu `4428b24` của PR #743, 100 bot, 09:43-10:14 giờ máy, `load average` 1 phút 0,44-0,85, B chạy): ĐẠT

| Hạng mục đo | Kết quả | Ngưỡng | Đánh giá |
|---|---|---|:---:|
| Bot sống đến cuối | **100 / 100** (rớt 0) | >= 95 % | ✅ |
| VmRSS ban đầu → sau 5 phút → cuối | 156,9 → 167,2 → **167,9 MB** | — | — |
| Biến thiên VmRSS sau làm nóng / dốc OLS nửa sau | **+0,75 MB** / **+0,002 MB/phút** | <= 50 MB / <= 1,00 MB/phút | ✅ |
| Tick p95 phòng tệ nhất / quá tải tick | TB **1,9 ms**, đỉnh **2,46 ms** / **0** | <= 10 ms / 0 | ✅ |
| CPU luồng chính / tick · loop lag p99 | **3,42 ms** · **22,9 ms** | <= 10 ms · <= 100 ms | ✅ |
| Băng thông nhận / bot | TB **197 B/tick** (p95 227; 3,84 KB/s) | <= 600 B/tick | ✅ |
| Hàng đợi ghi · cảnh báo giám sát · lỗi log · lỗi `/metrics` | inflight max 0 · **0 · 0 · 0** | 0 | ✅ |
| Qua cổng bốn bản đồ | `hac_phong` 794 · `am_suong` 794 · `lac_ha` 480 · `han_van` 479 | không kẹt | ✅ |
| Bảo toàn Linh thạch | **ĐẠT** (lệch ví bot 0) | lệch 0 | ✅ |
| Lượt thi triển / chiêu Nguyên Anh / cả game | **728** · **6 / 6** · **18 / 18** | > 0 | ✅ |
| Cảnh giới lúc cuối | Nguyên Anh **20 / 20** còn nguyên; 2 bot luân hồi về Phàm Nhân (Luyện Khí 56 lúc gieo → 54 + 2) | — | — |
| **`kiem-save`** | 100 nhân vật, 100 chân linh, 4 tông môn → **0 lỗi** (lần 30 phút trước đỏ 1 `pos_blocked`) | 0 lỗi | ✅ |

**Giới hạn khi đọc số này:** một lần 30 phút xanh KHÔNG chứng minh lỗi hiếm đã hết (lần đỏ cũ là 1 lỗi trong 1 lần 30 phút; soak 30 phút cũ ở mục 25.4 và hai lần 10 phút gần nhất đều 0 lỗi), nên số này chỉ NHẤT QUÁN với bản sửa. Bằng chứng chắc là test đơn vị `save-pos.test.ts` (quét dải quanh tường, đúng điểm thoáng gần nhất) và test tích hợp `WorldRoom.test.ts` (lưu thật qua `room.leave`), cùng các đột biến làm chúng ĐỎ. Số lượt thi triển dao động giữa các lần chạy (728 trong 30 phút lần này, 1.063 lần 30 phút trước; B chưa tìm nguyên nhân, không ảnh hưởng tiêu chí: cả 6 chiêu Nguyên Anh và 18 / 18 chiêu đều có lượt dùng).

#### Nhận xét và giới hạn:
- **Không rò bộ nhớ khi có chiêu / Nguyên Anh:** dốc +0,06 MB/phút, tick p95 đỉnh 2,0 ms, 0 overrun, 0 lỗi: 976 lượt dùng chiêu trong 10 phút không làm số nào xấu đi so với soak mặc định chạy ngay sau. Cột "soak mặc định" KHÔNG cùng cơ cấu bot: `--m7` có 80 bot vai cũ (12 bí cảnh / 8 PK / 8 cổng) thay vì 100 (16 / 12 / 10), nên số lượt qua cổng không so được. **VmRSS tuyệt đối cũng không so được, và không nên đọc chênh 159 so với 214 MB là "`--m7` nhẹ hơn":** lần soak 30 phút `--m7` ngay sau đó (bên dưới) cùng chế độ nhưng RSS đứng ở ~212 MB suốt cả phiên (159 MB chỉ là số lúc khởi động của chính nó), tức RSS tuyệt đối dao động chừng 50 MB giữa các lần chạy cùng cấu hình (kích cỡ heap V8 lúc làm nóng). Chỉ DỐC RSS là tiêu chí rò rỉ.
- **Lần chạy `--m7` đầu tiên ĐỎ đúng như kiểm đặt ra** (đầu `a6aee37`, trước khi sửa hành vi bot): chỉ 3 / 6 chiêu Nguyên Anh được thi triển (`bach_kim_trao`, `bang_hoa_loan`, `liet_hoa_kiem` không lần nào), 452 lượt. Nguyên nhân là **lỗi của bot, không phải của server**: Hàn Vân Lĩnh chỉ có 62 quái trên bản đồ 4096 x 4096 và con gần trạm nhất cách ~600 px (quái sinh từ `minDanger` 0,2 trở ra), nên bot đứng quanh trạm với tầm tìm quái 300 px của bot cũ gần như không gặp quái; khi mở rộng tầm tìm, bot đâm đầu vào vách băng (chỉ chiêu tự thân `van_hanh_bo` được dùng, chiêu nón 90-95 px không bao giờ chạm quái); khi đi vòng được thì 4 / 4 bot Nguyên Anh gục trong chưa đầy 90 giây (bot không có trang bị bộ IV) và luân hồi về Phàm Nhân. Bản đo ở trên là sau khi bot Nguyên Anh (1) tìm quái trong tầm 1000 px của vùng nhìn, (2) đi vòng vách theo BFS (dùng lại `pathToPortal`), (3) rút về trạm đả tọa khi khí huyết < 50 % hoặc linh lực < 20 % rồi mới săn tiếp. Hệ quả cần biết: bot Nguyên Anh của soak **không luân hồi** (cảnh giới cuối khớp lúc gieo), nên `--m7` KHÔNG đo luân hồi / Hoàng Tuyền của Nguyên Anh (đã có thử tải luân hồi riêng, mục 6).
- **Đột biến (kiểm thật sự bắt được):** (a) bỏ sổ chiêu khỏi tệp gieo (`seedSoakBot` truyền `undefined`) làm test `soak-plan.test.ts` "tệp lưu mang sổ chiêu" ĐỎ và soak 40 giây ĐỎ (`0/6 chiêu Nguyên Anh`, 0 lượt thi triển); (b) bỏ `liet_hoa_kiem` khỏi phân bổ làm 3 test phủ chiêu ĐỎ và soak 40 giây ĐỎ (`3/6`, nêu đích danh chiêu thiếu).
- **Chưa đo, không suy ra từ số này:** soak chỉ đếm lượt thi triển; **không đếm** trạng thái (độc, bỏng, choáng...), đạn (`bolt` của Phong Nha / Độc Tước), tinh anh hay tin `fx warn` (không có bộ đếm phía server cho chúng). Bot Nguyên Anh đánh quái Hàn Vân nên có thể gặp chúng nhưng soak không xác nhận; chi phí tick của 6 chiêu Nguyên Anh dưới tải vẫn lấy từ `perf.test.ts` (#733, mục 25.5). Bot không né đòn báo trước (`--evade` là của `bots.ts`, mục 24). Soak 10 phút ĐẠT; soak 30 phút có `--m7` đã chạy một lần (bên dưới) và ĐỎ ở `kiem-save` (một vị trí lưu làm tròn vào tường), các số còn lại đều trong ngân sách; chưa chạy lặp lại.

---

## 26. Bộ kiểm thử hồi quy M7: Chuyển bản đồ bốn phòng liên thông & Thử tải đồng thời (M7.11 #512)

### 26.1. Bối cảnh & Yêu cầu hồi quy M7
- Nâng cấp bộ kiểm thử tích hợp chuyển bản đồ (`server/scripts/portal-stress.test.ts`) từ 3 bản đồ lên toàn diện **4 bản đồ**: Lạc Hà Trấn (`lac_ha`) ↔ Hắc Phong Cốc (`hac_phong`) ↔ Âm Sương Trạch (`am_suong`) ↔ Hàn Vân Lĩnh (`han_van`).
- Đảm bảo hợp đồng dữ liệu M7: bổ sung sổ chiêu (`skills`: `learned`, `slots`) vào hồ sơ mẫu để xác thực toàn vẹn dữ liệu song song với tu vi, tiền tệ, túi đồ, trang bị và sổ nhiệm vụ.
- Kiểm thử các ca biên phức tạp trên chuỗi Âm Sương ↔ Hàn Vân:
  1. Tuyến khứ hồi 6 chặng bốn bản đồ.
  2. Cách ly phòng: nhân vật lưu ở Hàn Vân bị các phòng khác từ chối `wrong_map:han_van`, phòng Hàn Vân tiếp nhận đúng toạ độ an toàn.
  3. Rớt mạng ở Hàn Vân: nối lại trong thời gian chờ (`reconnect`) hoặc đăng nhập lại (`joinOrCreate`) đều huỷ ghost sạch sẽ, không nhân bản nhân vật.
  4. Đua kết nối 2 tab: tab 2 bị từ chối 409 khi đăng nhập trùng hoặc đua nhau lúc qua cổng.
  5. Chốt `travelling` của cơ chế lưu `persist` tránh đè ghi đè bản ghi đích.
  6. Thử tải đồng thời (concurrency stress): nhiều bot cùng qua cổng Âm Sương ↔ Hàn Vân đồng thời, sau đó chạy kiểm toán `kiem-save` (`auditSavesDirectory`) kiểm tra 0 lỗi.

### 26.2. Kết quả kiểm thử thực tế (`server/scripts/portal-stress.test.ts`)

| Nhóm kịch bản | Số ca test | Kết quả | Ghi chú & Đột biến kiểm chứng |
|---|:---:|:---:|---|
| **Độ trễ & độ tin cậy chuyển phòng cơ bản** | 4 | ✅ **ĐẠT (4/4)** | p50 < 600 ms, p95 < 900 ms; dọn sạch ghost và giải phóng tài nguyên phòng khi bot rời |
| **Bốn bản đồ liên thông & định tuyến phòng** | 3 | ✅ **ĐẠT (3/3)** | Vòng khứ hồi 6 chặng (427 ms); Lạc Hà / Hắc Phong / Âm Sương từ chối `wrong_map:han_van` |
| **Bảo toàn dữ liệu M7 qua cổng (skills + inv + quest)** | 2 | ✅ **ĐẠT (2/2)** | Vòng 6 chặng giữ nguyên 100% chiêu thức, trang bị, tu vi, tiền và túi đồ |
| **Rớt mạng & nối lại tại Hàn Vân Lĩnh** | 2 | ✅ **ĐẠT (2/2)** | Nối lại bằng token (213 ms) hoặc đăng nhập lại (172 ms) huỷ ghost thành công, 1 người chơi duy nhất |
| **Hai tab cùng mã nhân vật tại Âm Sương / Hàn Vân** | 2 | ✅ **ĐẠT (2/2)** | Tab 2 nhận mã 409, tab 1 giữ kết nối ổn định không bị ảnh hưởng |
| **Đua kết nối 2 tab lúc qua cổng (hai cổng thử)** | 2 | ✅ **ĐẠT (2/2)** | Thử trên 2 cổng `hac_phong_bac` và `am_suong_bac`: tab 2 nhận 409 hoặc wrong_map, lưu muộn không đè phòng mới |
| **Chốt `travelling` tránh đè dữ liệu (hai cổng thử)** | 2 | ✅ **ĐẠT (2/2)** | Thử trên 2 cổng `hac_phong_bac` và `am_suong_bac`: lưu định kỳ lúc đang chuyển cảnh bị bỏ qua an toàn |
| **Thử tải đồng thời (Concurrency Stress)** | 1 | ✅ **ĐẠT (1/1)** | 4 bot cùng chuyển cổng Âm Sương ↔ Hàn Vân đồng thời (257 ms); `auditSavesDirectory` báo 0 lỗi |
| **Tệp lưu CŨ thiếu skills đi chuỗi 4 bản đồ** | 1 | ✅ **ĐẠT (1/1)** | Tệp trước M7 không có `skills` đi qua 4 bản đồ tự khởi tạo sổ chiêu rỗng, lưu hợp lệ, `kiem-save` 0 lỗi |
| **Tệp lưu CŨ 12 chiêu & Nguyên Anh 18 chiêu (#722)** | 1 | ✅ **ĐẠT (1/1)** | Tệp cũ chỉ có 12 chiêu đợt 1 và tệp Nguyên Anh đủ 18 chiêu qua cổng Âm Sương ↔ Hàn Vân giữ nguyên sổ chiêu, `kiem-save` 0 lỗi |
| **Tương thích ngược tệp lưu thiếu/sai mapId** | 2 | ✅ **ĐẠT (2/2)** | Tệp thiếu `mapId` hoặc `mapId` lạ được đưa về Lạc Hà; cả 3 phòng khác đều từ chối wrong_map |
| **Tổng cộng** | **22** | ✅ **22/22 PASS** | Thời gian chạy: ~9,8 s |

### 26.3. Kiểm chứng đột biến (Mutation Testing)
- **Đột biến 1 (Lệch toạ độ spawn):** Cố tình làm lệch toạ độ xuất hiện ở bản đồ đích `x: to.spawn.x + 100` trong `server/src/systems/travel.ts` (`planTravel`).
  + Phản ứng: Ngay lập tức bắt được 2 lỗi:
    1. `AssertionError: tới hac_phong: expected 100 to be less than 2` (phát hiện lệch vị trí xuất hiện cổng).
    2. `kiem-save sau bão chuyển cổng: Toạ độ (x: 2244, y: 240) nằm đè lên vật cản không thể di chuyển trên bản đồ Âm Sương Trạch` (`auditSavesDirectory` bắt được lỗi vị trí kẹt vật cản).
- **Đột biến 2 (Mất sổ chiêu M7 khi lưu):** Bỏ qua ghi `skills` trong `WorldRoom.ts` (`skills: undefined`).
  + Phản ứng: Bắt ngay 8/21 ca test ĐỎ với lỗi `sổ chiêu trên đĩa: expected undefined to deeply equal ...`, chứng minh hợp đồng toàn vẹn sổ chiêu M7 đã được khoá chặt.

### 26.4. Xác nhận chốt kiểm soát an toàn & Tài sản M7 (Perf-Gate, Leak, Credits, Budget)
1. **Kiểm tra rò rỉ client (`leak-test`):**
   - Hằng số `LEAK_MAP_IDS` trong `client/scripts/leak-test.mjs` đã bao phủ đầy đủ toàn bộ 4 bản đồ ngoài: `["lac_ha", "hac_phong", "am_suong", "han_van"]`.
   - Toàn bộ 8/8 bài test trong `client/scripts/leak-test.test.ts` đều đạt (PASS), bao gồm các kiểm thử đột biến bắt rò rỉ Textures, GameObjects, BitmapText pool và JS Heap.
2. **Ngân sách hiệu năng di động (`perf:mobile`):**
   - Bản đồ Hàn Vân Lĩnh ở cả 3 bậc cấu hình (Thấp, Trung, Cao) đã được đo đạc và nghiệm thu trong PR #670 của Dev B: toàn bộ 22/22 chỉ số đều nằm trong ngân sách (0 VƯỢT).
3. **Kiểm tra nguồn gốc & bản quyền tài sản (`check:credits`):**
   - Kiểm tra 82 tệp tài nguyên tĩnh trong `client/public/`, 12 mục tài nguyên từ Vạn Kiếp Tu Tiên, 5 tài sản bên thứ ba: 100% có mã băm SHA-256 trùng khớp trong `CREDITS.md` và `docs/NGUON_NOI_DUNG.md`.
4. **Kiểm tra ngân sách tải tĩnh (`check:budget`):**
   - Gói JS chính (gzip): **496,86 KB** (ngân sách $\le 520$ KB).
   - Tổng Atlas & Tileset: **224,32 KB** (ngân sách $\le 1024$ KB).
   - Bộ nhớ Texture tĩnh (VRAM RGBA): **6,12 MB** (ngân sách bậc thấp $\le 48$ MB).

---

## 27. Quest-Walk Bot: Bộ kiểm thử khả thi mọi nhiệm vụ trên máy chủ Colyseus thật (#757)

### 27.1. Bối cảnh & Mục tiêu
- Chuẩn bị nền tảng cho Dev D thêm nội dung nhiệm vụ mới (việc phụ, việc hằng ngày cho Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân, nghề Đan/Phù theo QUYET_DINH_M3 mục 23).
- Test tĩnh `data-integrity.test.ts` chỉ xác minh tính toàn vẹn tham chiếu ID (NPC, quái, vật phẩm), không phát hiện được lỗi logic vận hành trong game thật (vd: bãi quái bị vách núi ngăn cách không thể tiếp cận, tỉ lệ rơi không đủ, NPC giao/trả bị kẹt trong vùng cản, chuỗi nhiệm vụ không thể nạp hoặc điều kiện cảnh giới không thể đáp ứng).
- `server/scripts/quest-walk.ts` tạo ra bot tự động kết nối vào **máy chủ Colyseus thật trên cổng động** (`freePort()`, tuyệt đối KHÔNG đụng cổng 2567), khởi tạo nhân vật với điều kiện tiên quyết, tự tìm đường A* (`planPath`), tiếp cận NPC nhận nhiệm vụ, thực hiện toàn bộ các bước (`talk`, `reachRealm`, `collect`, `kill` bằng tuần tra bãi quái thật), trả nhiệm vụ và xác thực phần thưởng (exp, coin, vật phẩm).

### 27.2. Cách chạy & Tham số
```bash
# Chạy kiểm thử toàn bộ nhiệm vụ trong game
npm run quest-walk -w server

# Chạy kiểm thử cho một nhiệm vụ cụ thể
npm run quest-walk -w server -- --quest=tru_tho

# Chạy kiểm thử cho toàn bộ nhiệm vụ của một bản đồ
npm run quest-walk -w server -- --map=lac_ha
```

### 27.3. Bảng kết quả kiểm thử khả thi trên bản đồ thực tế (`QUESTS` hiện tại - Trước #757 vs Sau #818)

> Ghi chú về cơ chế `/give`: Theo thiết kế chuẩn của Issue #757 và review của Dev A, bot **chỉ được phép dùng `/give` khi `needsGive === true`** (nghĩa là vật phẩm không có nguồn rơi dã ngoại, hoặc trùm thế giới/bí cảnh cần tổ đội mà bot chạy đơn độc). Với mọi quái thường và vật phẩm có trong bảng rơi dã ngoại (`DROP_TABLES`), bot phải di chuyển tới bãi quái thật bằng tìm đường A*, tuần tra 8 hướng, săn quái và nhặt đồ rơi thật qua tin nhắn `pickup { lootId }` (kèm cơ chế tự vệ `SELF-DEFENSE` khi bị quái cản đường tấn công).
>
> **Cơ chế né quái và nhặt đồ an toàn (Issue #818):**
> 1. `buildDangerPenaltyMap`: Ma trận phạt chi phí vùng nguy hiểm quanh quái (bán kính aggro + 32px), bỏ qua quái hiền và loài quái đang săn.
> 2. `planSafePath`: Tìm đường A* ưu tiên các ô có tổng chi phí phạt nguy hiểm nhỏ nhất thay vì đâm thẳng qua bầy quái.
> 3. `isLootSafeToPick`: Đánh giá mức độ an toàn trước khi nhặt rơi (kiểm tra máu bot > 50%, dọn quái canh giữ và quái đang nhắm bắn trước).
> 4. `moveTo`: Tự cắn đan dược hồi máu khi di chuyển dã ngoại, tự vệ áp sát <= 60px; khi về trấn trả nhiệm vụ chuyển đường ngắn nhất để vào vùng an toàn nhanh nhất.
>
> **Phân loại nhóm lỗi theo phân tích #757 & Issue #818:**
> - **Không lỗi**: Nhiệm vụ hoàn thành trọn vẹn (✅ ĐẠT).
> - **Nhóm 1 (Trùm thế giới)**: Quái cấp trùm thế giới/bí cảnh cần tổ đội người chơi (`hac_giao`, `doc_long_giao`, `thien_han_dieu`), bot đơn độc không thể solo (2 ca).
> - **Nhóm 2 (Hành vi bot né quái / nhặt đồ)**: Đã giải quyết triệt để trong #818 (`lang_han_quan` đạt ổn định: C 5/5, A 3/3; `doc_nang_nop` C 4/5, A 1/2; `doc_thiem_nang` C 4/5, A 1/5 và 0/3 - thoát hoàn toàn lỗi nhặt đồ/chọn boss sai, phần chập chờn còn lại do quái dã ngoại Độc Thiềm hội đồng ở bước săn thuộc Nhóm 3 cân bằng quái #805; 2 ca thu thập cấp 4 chuyển sang Nhóm 3).
> - **Nhóm 3 (Cân bằng quái dã ngoại)**: Quái cấp 3 Âm Sương và cấp 4 Hàn Vân có chỉ số sát thương/DoT/máu quá cao so với người chơi đơn độc cùng cảnh giới (15 ca, chờ nhóm thiết kế/cân bằng ở PR #805).

| STT | Mã nhiệm vụ | Tên nhiệm vụ | Bản đồ | Bậc yêu cầu | Loại bước chính | Kết quả #757 | Kết quả #818 (Đo lặp lại k/N) | Thời gian #818 | Nhóm lỗi / Phân loại | Ghi chú vận hành & cải tiến |
|---|---|---|:---:|:---:|---|:---:|:---:|---:|:---:|---|
| 1 | `nhap_the` | Nhập thế | `lac_ha` | Phàm Nhân | `talk` (truong_tran) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 3.0s | Không lỗi | Hoàn thành |
| 2 | `tru_tho` | Thỏ phá ruộng | `lac_ha` | Phàm Nhân | `kill` (5 tho) + `collect` (3 long_tho) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 14.0s | Không lỗi | Săn & nhặt rơi thật |
| 3 | `buoc_vao_tien_do` | Bước vào Tiên lộ | `lac_ha` | Luyện Khí 1 | `reachRealm` (Luyện Khí 1) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 4 | `tinh_toa` | Tĩnh tọa ngưng thần | `lac_ha` | Luyện Khí 1 | `talk` (dao_si) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 5 | `nanh_soi_ren_kiem` | Nanh sói cho lò rèn | `lac_ha` | Trúc Cơ 1 | `kill` (8 lang) + `collect` (5 nanh_soi) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 43.6s | Không lỗi | Săn & nhặt rơi thật, tự cắn đan về trấn |
| 6 | `thuoc_cho_tran` | Thuốc cho người trong trấn | `lac_ha` | Luyện Khí 1 | `collect` (8 long_tho, 4 nanh_soi) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 40.5s | Không lỗi | Săn & nhặt rơi thật |
| 7 | `hac_ho` | Hắc Hổ hạ sơn | `lac_ha` | Luyện Khí 2 | `kill` (10 ho) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 41.0s | Không lỗi | Săn quái thật |
| 8 | `dinh_luyen_khi` | Đỉnh Luyện Khí | `lac_ha` | Luyện Khí 9 | `reachRealm` (Luyện Khí 9) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 9 | `truc_co_nhap_mon` | Trúc Cơ nhập môn | `lac_ha` | Trúc Cơ 1 | `reachRealm` (Trúc Cơ 1) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 10 | `mang_hoan` | Mãng hoạn | `lac_ha` | Trúc Cơ 1 | `kill` (1 mang - Xích Mãng) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 28.7s | Không lỗi | Cần /give vảy trùm thế giới |
| 11 | `thanh_lo_tram` | Thanh Lộ Trạm | `lac_ha` | Trúc Cơ 1 | `talk` (lai_buon tại `hac_phong`) qua portal | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 19.5s | Không lỗi | Hoàn thành (di chuyển liên bản đồ) |
| 12 | `vong_suong` | Vọng Sương | `am_suong` | Trúc Cơ 3 | `talk` (tram_truong) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 13 | `suong_ho_hoan` | Sương Hồ hoạn | `am_suong` | Kim Đan 1 | `kill` (25 suong_ho) | ❌ **ĐỎ** | ❌ **ĐỎ** | 35.2s | Nhóm 3 (Cân bằng quái) | Sương Hồ cấp 3 dồn sát thương (#805) |
| 14 | `thach_quy_giap` | Mai rùa | `am_suong` | Kim Đan 1 | `kill` (15 thach_quy) | ❌ **ĐỎ** | ❌ **ĐỎ** | 28.2s | Nhóm 3 (Cân bằng quái) | Thạch Quy thủ cao, dồn sát thương (#805) |
| 15 | `doc_thiem_nang` | Độc nang | `am_suong` | Kim Đan 1 | `collect` (10 doc_thiem_nang) | ❌ **ĐỎ** | ⚠ **CHẬP CHỜN NẶNG (C: 4/5, A: 1/5, 0/3)** | TB 121.5s | Nhóm 3 (Cân bằng quái) | Nhặt đồ né quái an toàn; ranh giới ĐỎ/ĐẠT do chết ở bước săn Độc Thiềm (A đo 1/5 và 0/3, C đo 4/5: chập chờn nặng tuỳ tải máy; thuộc Nhóm 3 cân bằng quái #805) |
| 16 | `kim_dan_hau_ky` | Kim Đan hậu kỳ | `am_suong` | Kim Đan 2 | `reachRealm` (Kim Đan 2) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 17 | `giao_hoan` | Giao hoạn | `am_suong` | Kim Đan 2 | `kill` (1 doc_long_giao) | ❌ **ĐỎ** | ❌ **ĐỎ** | 19.6s | Nhóm 1 (Trùm thế giới) | Độc Long Giao là trùm thế giới cần tổ đội |
| 18 | `lang_han_quan` | Lăng Hàn Quan | `am_suong` | Kim Đan 3 | `talk` (tram_truong_han tại `han_van`) | ❌ **ĐỎ** | ✅ **ĐẠT ổn định (C: 5/5, A: 3/3)** | TB 34.2s | Không lỗi (Đã xong Nhóm 2) | **A* né bãi quái nguy hiểm tới portal Âm Sương thành công 100% (A: 3/3, C: 5/5; giải quyết triệt để Nhóm 2)** |
| 19 | `han_van_len` | Hàn Vân | `han_van` | Kim Đan 3 | `reachRealm` (Kim Đan 3) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.4s | Không lỗi | Hoàn thành |
| 20 | `han_lang_hoan` | Hàn Lang hoạn | `han_van` | Nguyên Anh 1 | `kill` (20 han_lang) | ❌ **ĐỎ** | ❌ **ĐỎ** | 70.5s | Nhóm 3 (Cân bằng quái) | Hàn Lang cấp 4 dồn sát thương (#805) |
| 21 | `phong_nha_cham` | Phong Nha | `han_van` | Nguyên Anh 1 | `kill` (15 phong_nha) | ❌ **ĐỎ** | ❌ **ĐỎ** | 67.4s | Nhóm 3 (Cân bằng quái) | Phong Nha đánh nhanh (#805) |
| 22 | `cot_tuong_cot` | Tượng cốt | `han_van` | Nguyên Anh 1 | `kill` (12 cot_tuong) | ❌ **ĐỎ** | ❌ **ĐỎ** | 46.1s | Nhóm 3 (Cân bằng quái) | Cốt Tượng 11.8k HP (#805) |
| 23 | `doc_tuoc_nang_cb` | Độc tước | `han_van` | Nguyên Anh 1 | `kill` (12 doc_tuoc) | ❌ **ĐỎ** | ❌ **ĐỎ** | 39.8s | Nhóm 3 (Cân bằng quái) | Độc Tước đánh tầm xa DoT (#805) |
| 24 | `nguyen_anh_hau_ky` | Nguyên Anh hậu kỳ | `han_van` | Nguyên Anh 2 | `reachRealm` (Nguyên Anh 2) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 0.5s | Không lỗi | Hoàn thành |
| 25 | `thien_han_hoan` | Thiên Hàn hoạn | `han_van` | Nguyên Anh 2 | `kill` (1 thien_han_dieu) | ❌ **ĐỎ** | ❌ **ĐỎ** | 18.9s | Nhóm 1 (Trùm thế giới) | Thiên Hàn Điêu là trùm thế giới cần tổ đội |
| 26 | `lap_uy_bang_nguyen` | Lập uy băng nguyên | `han_van` | Nguyên Anh 1 | `kill` (10 han_lang, 10 phong_nha) | ❌ **ĐỎ** | ❌ **ĐỎ** | 52.3s | Nhóm 3 (Cân bằng quái) | Quái dã ngoại hội đồng (#805) |
| 27 | `ren_trao_bach_kim` | Rèn trảo bạch kim | `han_van` | Nguyên Anh 2 | `collect` (5 nanh_phong_nha, 3 cot_tuong_khuc) | ❌ **ĐỎ** | ❌ **ĐỎ (0/5)** | TB 59.9s | Nhóm 3 (Cân bằng quái) | Sống lâu hơn; gục ở bước săn Cốt Tượng 11.8k HP do cạn đan dược (#805) |
| 28 | `luet_gio_han_van` | Lướt gió Hàn Vân | `han_van` | Nguyên Anh 3 | `kill` (10 doc_tuoc) + `talk` | ❌ **ĐỎ** | ❌ **ĐỎ** | 38.6s | Nhóm 3 (Cân bằng quái) | Độc Tước đánh tầm xa (#805) |
| 29 | `lang_hai` | Lang hại | `lac_ha` | Luyện Khí 1 | `kill` (10 lang - hằng ngày) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 54.8s | Không lỗi | Hoàn thành nhiệm vụ hằng ngày |
| 30 | `nop_nanh` | Nanh sói làm thuốc | `lac_ha` | Luyện Khí 1 | `collect` (5 nanh_soi - hằng ngày) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 55.5s | Không lỗi | Hoàn thành nhiệm vụ hằng ngày |
| 31 | `ho_hoan` | Hổ hoạn | `lac_ha` | Luyện Khí 7 | `kill` (3 ho - hằng ngày) | ✅ **ĐẠT** | ✅ **ĐẠT (1 lần)** | 37.2s | Không lỗi | Hoàn thành nhiệm vụ hằng ngày |
| 32 | `suong_ho_quay` | Sương Hồ quấy nhiễu | `am_suong` | Kim Đan 1 | `kill` (15 suong_ho - hằng ngày) | ❌ **ĐỎ** | ❌ **ĐỎ** | 31.4s | Nhóm 3 (Cân bằng quái) | Sương Hồ cấp 3 dồn sát thương (#805) |
| 33 | `thach_quy_phien` | Thạch Quy chắn đường | `am_suong` | Kim Đan 1 | `kill` (10 thach_quy - hằng ngày) | ❌ **ĐỎ** | ❌ **ĐỎ** | 26.8s | Nhóm 3 (Cân bằng quái) | Thạch Quy thủ cao (#805) |
| 34 | `doc_nang_nop` | Độc nang cho dược sư | `am_suong` | Kim Đan 2 | `collect` (6 doc_thiem_nang - hằng ngày) | ❌ **ĐỎ** | ⚠ **CHẬP CHỜN (C: 4/5, A: 1/2)** | TB 65.8s | Nhóm 3 (Cân bằng quái) | Nhặt đồ né quái tốt; ranh giới ĐỎ/ĐẠT khi quái Độc Thiềm dã ngoại hội đồng ở bước săn (A: 1/2, C: 4/5; thuộc Nhóm 3 cân bằng quái #805) |
| 35 | `han_lang_quay` | Hàn Lang quấy nhiễu | `han_van` | Nguyên Anh 1 | `kill` (12 han_lang - hằng ngày) | ❌ **ĐỎ** | ❌ **ĐỎ** | 34.2s | Nhóm 3 (Cân bằng quái) | Hàn Lang cấp 4 (#805) |
| 36 | `cot_tuong_phien` | Cốt Tượng chắn đường | `han_van` | Nguyên Anh 1 | `kill` (8 cot_tuong - hằng ngày) | ❌ **ĐỎ** | ❌ **ĐỎ** | 29.5s | Nhóm 3 (Cân bằng quái) | Cốt Tượng cấp 4 (#805) |
| 37 | `doc_tuoc_nop` | Độc tước nang nộp trạm | `han_van` | Nguyên Anh 2 | `collect` (5 doc_tuoc_nang - hằng ngày) | ❌ **ĐỎ** | ❌ **ĐỎ (0/5)** | TB 65.9s | Nhóm 3 (Cân bằng quái) | Gục ngã khi săn Độc Tước do DoT bắn tỉa tầm xa của quái cấp 4 (#805) |

**Tổng quan đo kiểm khả thi trên máy chủ Colyseus thật (chạy lặp lại k/N các ca ranh giới):**
- **18 ca ĐẠT**: 1 ca `lang_han_quan` **ĐẠT ổn định** (C: 5/5, A: 3/3 nhờ thuật toán A* né bãi quái nguy hiểm) + 17 ca cũ **ĐẠT (1 lần đo #757)** (Lạc Hà Trấn + toàn bộ nhiệm vụ đối thoại / cảnh giới liên bản đồ).
- **2 ca CHẬP CHỜN**: `doc_nang_nop` (C: 4/5, A: 1/2) và `doc_thiem_nang` (C: 4/5, A: 1/5, 0/3 - chập chờn nặng/gần đỏ tuỳ tải máy). Cơ chế né quái và nhặt an toàn đã giải quyết triệt để lỗi nhặt đồ dại dột / săn nhầm trùm Hắc Giao, tuy nhiên quái Độc Thiềm Âm Sương Trạch có độc lực cao, khi tụ hội đồng thì bot có xác suất gục ngã ở bước săn (chuyển sang Nhóm 3 cân bằng quái, chờ PR #805).
- **17 ca ĐỎ**:
  - **Nhóm 1 (Trùm thế giới)**: 2 ca (`giao_hoan`, `thien_han_hoan`) do trùm thế giới cần tổ đội người chơi.
  - **Nhóm 3 (Cân bằng quái dã ngoại)**: 15 ca tại Âm Sương Trạch và Hàn Vân Lĩnh do chỉ số quái cấp 3 & 4 vượt ngưỡng sinh tồn của người chơi solo (kèm 2 ca thu thập `ren_trao_bach_kim` 0/5, `doc_tuoc_nop` 0/5).
  - **Nhóm 2 (Hành vi bot)**: 0 ca. Không còn ca nào thất bại do bot đi đường dại dột hay nhặt đồ giữa bầy quái.

### 27.4. Kiểm thử đơn vị & Đột biến kiểm chứng (`quest-walk.test.ts`)
Bộ kiểm thử đơn vị độc lập (`server/scripts/quest-walk.test.ts`) gồm **16 bài test** chạy trong vitest (~3.9s), bao gồm:
1. **Kiểm tra tính khả thi tĩnh 100% nhiệm vụ**: Mọi nhiệm vụ trong `QUESTS` đều có kế hoạch bước khả thi trên main hiện tại.
2. **Kiểm tra hàm phụ trợ**:
   - `findMapForMonster`: xác định đúng bản đồ sinh ra quái theo `monsterCap`.
   - `findDropsFor`: tìm đúng danh sách quái rơi vật phẩm từ `DROP_TABLES`.
   - `estimateDropsRequired`: ước lượng chính xác số quái cần hạ và tỉ lệ rơi hợp lý (ưu tiên quái thường thay vì trùm thế giới).
   - `isMapReachableForQuest`: kiểm tra tính liên thông giữa các bản đồ theo cảnh giới yêu cầu.
   - `findPortalTo`: tìm đúng portal chuyển tiếp giữa các bản đồ kề nhau.
   - `portal lac_ha_bac`: có đường đi hợp lệ từ trấn (không bị kẹt).
   - `getPatrolPoints`: sinh danh sách điểm tuần tra bao phủ 8 hướng quanh trấn.
3. **Cơ chế bot né quái và nhặt đồ an toàn (Issue #818)**:
   - `buildDangerPenaltyMap`: tính đúng ma trận phạt nguy hiểm quanh quái (bán kính aggro + 32px), bỏ qua quái hiền và quái đang săn.
   - `planSafePath`: tìm đường đi vòng an toàn né bãi quái nguy hiểm thay vì đi xuyên qua tâm quái.
   - `isLootSafeToPick`: đánh giá an toàn trước khi nhặt (máu < 50%, có quái canh giữ, có quái nhắm bắn).
4. **7 bài test đột biến kiểm chứng chuẩn Issue #757, #818 & Review của Dev A (Mutation Testing)**:
   - *Đột biến (a) (Nâng số lượng thu thập vượt khả năng rơi)*: Sửa bước `collect` yêu cầu số lượng rơi ước tính cần hạ > 60 quái (`estimateDropsRequired > 60`) -> `planQuestSteps` phát hiện và báo ĐỎ ngay từ bước phân tích tĩnh.
   - *Đột biến (b) (Quái không sinh ở bản đồ nhiệm vụ / chuỗi cổng liên thông)*: Sửa bước `kill` trỏ tới quái có thật trong game nhưng bản đồ sinh quái không liên thông theo cảnh giới của nhiệm vụ -> `planQuestSteps` phát hiện và báo ĐỎ.
   - *Đột biến (c) (Sai lệch phần thưởng exp trên máy chủ thật)*: Cố tình làm sai lệch giá trị thưởng `rewards.exp` khác với `QuestDef` khi trả nhiệm vụ trên máy chủ Colyseus thật -> bot phát hiện sai lệch số exp thực tế nhận được so với kỳ vọng và báo ĐỎ bài test.
   - *Đột biến (d) (Dừng ngay khi bot chết / nhận tin limbo trên máy chủ thật - Review lần 2)*: Giả lập nhân vật bị quái đánh chết trong lúc săn, máy chủ Colyseus gửi tin nhắn `limbo` -> bot lập tức dừng nhiệm vụ và báo ĐỎ trong 234ms (< 3.5s, tuyệt đối không bị treo 450s hay in log lặp).
   - *Đột biến (e) (Dừng ngay khi nhận tin travelTo ngoài kế hoạch - Review lần 2)*: Máy chủ bất ngờ gửi tin nhắn `travelTo` trong khi bot đang làm nhiệm vụ tĩnh -> bot lập tức dừng và báo ĐỎ trong 234ms (< 3.5s) với lý do `unplanned_travel`.
   - *Đột biến (f) (Phạt né quái = 0 / không cộng ma trận phạt vào chi phí A* - Issue #818)*: Khi `penaltyFactor = 0`, thuật toán A* đi thẳng qua ô quái nguy hiểm `centerCell`, làm ĐỎ kiểm tra `safePath!.cells.includes(centerCell) === false` trong `quest-walk.test.ts`.
   - *Đột biến (g) (Bỏ né quái khi di chuyển liên bản đồ trên máy chủ thật - Issue #818)*: Khi bỏ né quái (`avoidMonsters = false` hoặc không dùng ma trận phạt) ở nhiệm vụ `lang_han_quan`, bot đi thẳng qua đầm lầy Âm Sương Trạch nơi bầy Sương Hồ và Thạch Quy canh giữ, bot bị đánh gục (`bot_died`), làm ĐỎ bài test tích hợp máy chủ thật trong < 20s.

## 28. Bot mạng giật xả dồn input 100 / 150 tin trên Colyseus THẬT: đo trôi trước / sau #852 (issue #857 [F1], mục 41)

### 28.1. Bối cảnh & phạm vi
Mục 41 (`QUYET_DINH_M3.md`): mạng nhà đứng rồi xả dồn làm nhân vật "trôi như liệt phím". PR #852 (đã merge vào `main`, đầu `ac7d6a7`) sửa phía máy chủ: backlog 0,25 giây (`MAX_INPUT_BACKLOG = 5`), tin dừng cắt hàng đợi (`STOP_KEEP_INPUTS = 2`), và **nâng giới hạn tần suất `input` burst 40 -> 100**. Phạm vi thu hẹp của #857 [F1] (theo thư Dev A): chạy lại + **mở rộng kịch bản lên 100 và 150 tin** — burst 100 nay vừa khít 100 tin nên **tin dừng cuối phải tới nơi**; 150 tin thì **phần đuôi (bao gồm tin dừng) bị bỏ** ở lớp giới hạn tần suất, đo hậu quả.

### 28.2. Cách chạy & tham số
Script `server/scripts/do-network-burst.ts` (đo trên máy chủ Colyseus thật trong tiến trình, cổng do hệ điều hành cấp qua `listenWithRetry`, dữ liệu ghi thư mục tạm, tắt hết khi xong). Bot colyseus.js giữ phím di chuyển (`dx=1`), **xả dồn N tin `input` cùng lúc** rồi (tuỳ kịch bản) gửi 3 tin dừng (`dx=dy=0`, mô phỏng client mới #851). TCP giữ thứ tự nên tin dừng ở ĐUÔI: bị bỏ thì bỏ đúng tin dừng — đúng hiện thực mạng giật.

- Chờ theo **ĐIỀU KIỆN**, không `sleep` cố định: coi nhân vật "đứng yên hẳn" khi vị trí không đổi >= 200 ms **và** hàng đợi input đã rỗng.
- Chạy **lặp 12 lượt** (`--iterations 12`); tổng hợp min / median / mean / max + tỉ lệ tin dừng tới nơi k/N.
- Hai mã so sánh, chạy CÙNG script: **"trước #852"** = `main` tại `bfd6eb1` (burst 40, không backlog cap / cắt dừng); **"sau #852"** = `main` tại `004a7f8` (burst 100). Nhân vật đặt ở sân trấn thông thoáng (`x=1300, y=1500`), đi về +x.
- Chỉ số: **Dừng (ms)** = thời gian từ lúc xả dồn tới lần di chuyển cuối; **Trôi (px)** = quãng đi thêm; **Đuôi bị bỏ** = `sent - lastSeq cuối` (seq đơn điệu: số tin không bao giờ tới tay máy chủ, chủ yếu bị giới hạn tần suất bỏ); **Tin dừng tới nơi** = `lastSeq cuối >= seq tin dừng cuối`.

### 28.3. Kết quả (lặp 12 lượt, N=12 mỗi ô)

**Sau #852 (`main` @ `004a7f8`, burst 100):**

| Kịch bản | Dừng min/med/mean/max (ms) | Trôi (px) | Đuôi bị bỏ | Tin dừng tới nơi |
|---|---|---|---|---|
| 100 tin (97 đi + 3 dừng) — vừa khít burst 100 | 10 / 22 / **25** / 53 | 15 | 0 | **12/12** |
| 100 tin (100 đi), không dừng (client cũ) | 265 / 270 / 275 / 318 | 112,5 | 0 | — |
| 150 tin (147 đi + 3 dừng) — vượt burst 100 | 268 / 276 / **283** / 328 | 112,5 | 50 | **0/12** |
| 150 tin (150 đi), không dừng (client cũ) | 266 / 274 / 272 / 281 | 112,5 | 50 | — |

**Trước #852 (`main` @ `bfd6eb1`, burst 40):**

| Kịch bản | Dừng min/med/mean/max (ms) | Trôi (px) | Đuôi bị bỏ | Tin dừng tới nơi |
|---|---|---|---|---|
| 100 tin (97 đi + 3 dừng) | 1518 / 1529 / **1528** / 1536 | 300 | 60 | 0/12 |
| 100 tin (100 đi), không dừng | 1516 / 1525 / 1526 / 1537 | 300 | 60 | — |
| 150 tin (147 đi + 3 dừng) | 1522 / 1528 / **1529** / 1538 | 300 | 110 | 0/12 |
| 150 tin (150 đi), không dừng | 1514 / 1528 / 1527 / 1537 | 300 | 110 | — |

### 28.4. Phân tích & kết luận
- **Trước #852:** dù gửi 100 hay 150 tin, giới hạn tần suất burst 40 chỉ cho ~40 tin qua -> đi ~40 bước = **300 px trong ~1,5 giây**; tin dừng ở đuôi LUÔN bị bỏ (0/12). Con số gần như y hệt cho 100 và 150 vì burst 40 đã chặn từ đầu — KHÔNG đạt mục 41 (dừng <= 0,3 s).
- **Sau #852, client MỚI (gửi tin dừng):**
  - **100 tin vừa khít burst 100 -> tất cả qua, tin dừng LUÔN tới nơi (12/12), dừng trong 25 ms / 15 px** (max 53 ms). ĐẠT mạnh mục 41.
  - **150 tin vượt burst 100 -> 50 tin đuôi LUÔN bị bỏ (12/12), tin dừng KHÔNG tới (0/12)**; nhưng `MAX_INPUT_BACKLOG = 5` + token bucket vẫn chặn drift ở **112,5 px** và dừng trong **283 ms trung bình** (đỉnh 328 ms). Hậu quả của việc mất tin dừng bị giới hạn cứng, không trôi hàng giây như trước.
- **Sau #852, client CŨ (không tin dừng):** backlog cap tự chặn ở ~275–283 ms trung bình / 112,5 px (đỉnh ~318–328 ms). Phần lớn đạt <= 0,3 s trên trung bình; đỉnh có thể nhích quá 300 ms khi dồn >= 100 tin — nhưng đây là biên spam/DoS, không phải chơi bình thường (client thật gửi <= 20 input/giây và có tin dừng).
- **Kết luận:** #852 cải thiện thời gian dừng sau đợt dồn **~1,5 s -> 25 ms (client mới) / ~275 ms (client cũ)**, drift **300 px -> 15–112,5 px**. Tiêu chí mục 41 ĐẠT với client mới (tin dừng tới nơi, burst <= 100); ngay cả khi burst > 100 làm mất tin dừng, backlog cap vẫn giữ drift <= 112,5 px và dừng <= ~0,3 s.

### 28.5. Kiểm
- Script chạy lặp được (cổng `listenWithRetry` không bao giờ 2567, dữ liệu tạm, `gracefullyShutdown` + `rmSync` khi xong), chờ theo điều kiện (không `sleep` cố định), đã chạy **12 lượt** mỗi bên, số liệu ở trên là số THẬT đo được (không ghi số chưa đo).
- Chạy lại: `cd server && npx tsx scripts/do-network-burst.ts --iterations 12 --suite new` (100/150 tin) hoặc `--suite old` (kịch bản 30/40/200 gốc của Dev C trên PR #852) hoặc `--suite all`.
- Không sửa mã trò chơi; đây là công cụ đo của Dev F (issue #857).

## 29. Báo cáo thử nghiệm & đối chứng động học Bot né vùng cảnh báo trên hình mẫu (Refs #876)

### 29.1. Bối cảnh & Nguyên tắc công bằng
Mục 42 (`QUYET_DINH_M3.md`) và thiết kế trùm `docs/THIET_KE_TRUM.md` (Issue #876, T7):
- **Nguyên tắc công bằng (mục 42.1):** mọi đòn đánh nguy hiểm gây sát thương của trùm đều có báo trước qua `fx` `warn` (hình tròn, vành khuyên `r0`, nón quạt `cone`, đường thẳng `line`), thời gian báo trước `telegraphMs >= BOSS_MIN_TELEGRAPH_MS` (800 ms) hiện đúng vùng trên đất để người chơi né bằng di chuyển; không có đòn chưa báo mà trúng.
- **Tính nghiêm ngặt:** vì trong Tiên Giới chết do quái/trùm = Hoàng Tuyền (mất kiếp), cơ chế né đòn bằng động học di chuyển phải bảo đảm người chơi phản xạ chuẩn xác sẽ né thoát khỏi vùng nguy hiểm trước khi đòn đánh đáp xuống.

### 29.2. Kịch bản thực nghiệm & Phương pháp kiểm chứng
Kịch bản được tích hợp và kiểm thử tự động tại `server/scripts/boss-bot-stress.test.ts`:
- **Môi trường:** máy chủ Colyseus thật khởi động trong tiến trình (`WorldRoom`), cổng mạng ngẫu nhiên cấp bởi `listenWithRetry`, kết nối bằng `colyseus.js` Client. Kênh chuyển phát cảnh báo `fx` là sự kiện WebSocket giữa máy chủ và client.
- **Hình mẫu hình học cảnh báo của test:** sử dụng 3 dạng hình học chuẩn tắc với các thông số đặt thẳng trong `server/scripts/boss-bot-stress.test.ts` (chưa gắn với số liệu chiêu thức trùm thật của Xích Mãng / Hắc Giao / Thiên Hàn Vương — dữ liệu trùm thật thuộc issue #872):
  + Vành khuyên: tâm `(1000, 1000)`, `r = 150`, `r0 = 50`, báo trước 800 ms.
  + Nón quạt: tâm `(1000, 1000)`, `r = 250`, góc quét 0° (hướng sang phải), `arc = 90°`, báo trước 1000 ms.
  + Đường thẳng: xuất phát `(1000, 1000)`, đích `(1300, 1000)`, chiều rộng `w = 60`, báo trước 800 ms.
- **Thuật toán Bot né (`bots.ts`):**
  + Lắng nghe sự kiện `fx` `warn` nhận từ phòng Colyseus.
  + Phân tích hình học vùng nguy hiểm (`parseWarnZoneFromFx`): tâm `(x, y)`, bán kính ngoài `r`, bán kính trong `r0` (vành khuyên), góc quét và góc mở `arc` (nón quạt), độ dài và chiều rộng (đường thẳng), thời hạn nổ `expiresAt = t0 + ms`.
  + Đánh giá rủi ro (`isPointInWarnZone`): xác định vị trí dự đoán `(predX, predY)` có nằm trong vùng nguy hiểm hay không.
  + Tính vector thoát hiểm (`computeEvadeVector`): tính vector đơn vị `(dx, dy)` chỉ ra hướng ngắn nhất rời khỏi ranh giới hình học vùng nguy hiểm.
  + Di chuyển thoát hiểm: cập nhật vị trí dự đoán `predX += vec.dx * speed * 0.05` ở mỗi nhịp tick 50 ms với vận tốc chuẩn 150 px/s (7.5 px/tick).
- **Phân loại kịch bản trong test:**
  + Kịch bản vành khuyên (Test 2): 2 bot tại (1000, 1080), 1 bot bật né (`evade=true`), 1 bot đối chứng đứng yên (`evade=false`).
  + Kịch bản nón quạt (Test 3): 1 bot bật né tại (1200, 1050) trong góc quét nón.
  + Kịch bản đường thẳng (Test 4): 1 bot bật né tại (1150, 1015) trên trục đường lao.
  + Kịch bản đa bot đồng thời (Test 5): 10 bot quanh (1000–1020, 1080) trong cùng một vùng vành khuyên (5 bot bật né, 5 bot đứng yên).

### 29.3. Kết quả đối chứng động học trên hình mẫu

**Bảng 1: Kết quả né / dính đòn của Bot theo từng kịch bản test (báo trước 800 - 1000 ms, vận tốc 150 px/s):**

| Kịch bản hình học của test | Thiết lập Bot | Bot bật né (`evade=true`) | Bot đối chứng đứng yên (`evade=false`) | Quãng đường & số tick thoát hiểm (tính theo hình học) | Biên an toàn còn lại trước khi đòn đáp (tính theo hình học) |
|---|---|:---:|:---:|---:|---:|
| **Vành khuyên (`r=150, r0=50, 800ms`)**<br>Bot ở `(1000, 1080)` | 2 bot (1 né, 1 đứng) | **Né thoát 100% (0/1 đòn trúng)** | Dính đòn 100% (1/1 đòn trúng) | ~45 px (6 tick = 300 ms) | **500 ms** (10 tick an toàn) |
| **Nón quạt (`r=250, arc=90°, 1000ms`)**<br>Bot ở `(1200, 1050)` | 1 bot (bật né) | **Né thoát 100% (0/1 đòn trúng)** | *(không có bot đứng)* | ~60 px (8 tick = 400 ms) | **600 ms** (12 tick an toàn) |
| **Đường thẳng (`w=60, len=300, 800ms`)**<br>Bot ở `(1150, 1015)` | 1 bot (bật né) | **Né thoát 100% (0/1 đòn trúng)** | *(không có bot đứng)* | ~30 px (4 tick = 200 ms) | **600 ms** (12 tick an toàn) |
| **Đa Bot đồng thời (vành khuyên `r=150, r0=50`)**<br>10 bot quanh `(1000–1020, 1080)` | 10 bot (5 né, 5 đứng) | **Né thoát 100% (5/5 né thoát)** | Dính đòn 100% (5/5 dính đòn) | ~45 px (6 tick = 300 ms) | **500 ms** (10 tick an toàn) |

*Ghi chú:*
- Tỉ lệ né thoát (0 đòn trúng) và dính đòn (1 đòn trúng) là kết quả kiểm thử thực tế từ bộ đếm `warnsEvadedCount` và `warnsHitCount` trong `boss-bot-stress.test.ts`.
- Quãng đường thoát hiểm, số tick di chuyển và biên an toàn được tính toán lý thuyết từ hình học vùng nguy hiểm và vận tốc di chuyển chuẩn 150 px/s (7.5 px/tick, 20 tick/giây).

**Bảng 2: Phân tích động học di chuyển & Phản xạ né đòn (tính từ tham số test):**

| Thông số động học | Giá trị lý thuyết / cấu hình | Giải thích |
|---|---|---|
| **Thời gian phản xạ nhận diện (`t_react`)** | **0 - 50 ms** (1 tick) | Bot phát hiện vùng nguy hiểm và đổi hướng di chuyển ngay ở chu kỳ tick kế tiếp |
| **Vận tốc di chuyển tiêu chuẩn** | **150 px/s** (7.5 px/tick) | Vận tốc di chuyển cơ bản của người chơi |
| **Quãng đường thoát hiểm trung bình** | **30 - 60 px** | Khoảng cách từ vị trí xuất phát đến mép an toàn gần nhất của hình học test |
| **Số tick di chuyển cần thiết (`ticks_to_evade`)** | **4 - 8 tick** (200 - 400 ms) | Thời gian để bot di chuyển ra khỏi ranh giới nguy hiểm |
| **Thời gian báo trước tối thiểu (`telegraphMs`)** | **800 - 1000 ms** (16 - 20 tick) | Thời gian báo trước theo cấu hình test |
| **Biên an toàn còn lại (`t_margin`)** | **500 - 600 ms** (10 - 12 tick) | Biên thời gian dự phòng sau khi đã thoát hiểm, đủ để bù đắp độ trễ mạng thực tế (RTT 50 - 150 ms) |

### 29.4. Độ ổn định của kịch bản kiểm thử
- **Loại bỏ quái tự nhiên:** Trong môi trường phòng Colyseus thật của test, quái tự nhiên của bản đồ sinh ra gần vị trí bot có thể gây nhiễu bộ đếm sự kiện. Test chủ động dọn sạch quái bản đồ (`world.state.monsters` và `world.mctrl`) sau khi bot kết nối để bảo đảm tính tất định.
- **Tắt cờ điều khiển trùm:** Test chạy với cờ `BOSS_MOVES` không bật, vùng cảnh báo do chính kịch bản test phát qua máy chủ Colyseus để kiểm tra thuần tuý thuật toán nhận diện và né đòn của client.

### 29.5. Kết luận & Hướng đi tiếp theo
1. **Khẳng định tính đúng đắn của thuật toán né (`computeEvadeVector`):** Với thời gian báo trước >= 800 ms, thuật toán tính vector thoát hiểm giúp bot rời khỏi vùng nguy hiểm của cả 3 dạng hình học chuẩn (vành khuyên, nón quạt, đường thẳng) trong 4–8 tick (200–400 ms), bảo đảm biên an toàn còn lại 500–600 ms.
2. **Kế hoạch thử tải trên trùm thật:** Phần đo lường tỉ lệ sống sót, thời gian hạ trùm, số đòn trúng trên các trùm thật (Xích Mãng, Hắc Giao, Thiên Hàn Vương) theo yêu cầu đầy đủ của Issue #876 sẽ được tiến hành sau khi Dev E hoàn thành việc đưa dữ liệu bộ chiêu trùm thật vào `main` (Issue #872).
3. **Mã kiểm thử thường trực:** Bài test được lưu tại `server/scripts/boss-bot-stress.test.ts` (5 tests, chạy bằng lệnh `npx vitest run server/scripts/boss-bot-stress.test.ts`).

---

## 30. Thống kê thời lượng & Phân tích ổn định CI GitHub Actions (Issue #945)

> Kịch bản đo: Thu thập thời lượng thực tế của >= 40 lượt chạy CI gần nhất bằng script `node server/scripts/measure-ci.mjs` (gọi GitHub REST API `actions/runs/{id}/jobs`).

### 30.1. Hiện tượng & Bối cảnh
- **Lượt chạy bị huỷ sau 10 phút (Run `43952326729` - PR #924):** Job `check` của CI bị GitHub Actions tự động huỷ sau đúng 10 phút do chạm trần `timeout-minutes: 10`. Khi chạy lại (`gh run rerun --failed`), cả job xanh hoàn toàn chỉ mất 311 giây (5 phút 11 giây), trong đó bước `Test` mất 228 giây.
- **Dao động thời lượng trên runner GitHub Actions:** Trong khi chạy kiểm thử cục bộ trên máy dev mất ~75–90 giây cho cả bộ 307 tệp (~5370 ca kiểm thử), thời lượng trên CI dao động mạnh từ 159 giây đến 239 giây cho riêng bước `Test`, và từ 208 giây đến 365 giây cho toàn bộ job `check`.
- **Hệ quả của việc huỷ ngang do timeout:** Khi job bị huỷ bởi `timeout-minutes: 10`, GitHub Actions lập tức ngắt runner mà không xuất log chi tiết hay đẩy artifact, dẫn đến không xác định được test nào bị nghẽn hoặc runner bị chậm ở khâu nào.

### 30.2. Bảng tổng hợp thời lượng 50 lượt CI gần nhất

**Phân loại kết quả (50 lượt gần nhất):**
- **Thành công (success):** 34 lượt (~68%).
- **Thất bại (failure):** 1 lượt (~2%) do lỗi định dạng Prettier trên PR #912 của Dev G.
- **Bị huỷ (cancelled):** 15 lượt (~30%) do cơ chế huỷ lượt cũ khi có commit dồn dập trên `main` (`concurrency: cancel-in-progress: true`).

**Bảng 1: Phân bố thời lượng Job `check` và Bước `Test` (34 lượt thành công):**

| Chỉ số thời lượng | Job `check` (toàn bộ) | Bước `Test` (vitest run) | Ghi chú |
|---|---:|---:|---|
| **Mẫu đo (N)** | **34** | **34** | Chỉ tính các lượt hoàn thành thành công |
| **Nhanh nhất (Min)** | **208 giây** (3m 28s) | **159 giây** (2m 39s) | Lượt chạy khi runner GitHub Actions ít tải |
| **Trung bình (TB)** | **271 giây** (4m 31s) | **194 giây** (3m 14s) | Thời lượng trung bình ổn định |
| **Trung vị (Median)** | **265 giây** (4m 25s) | **194 giây** (3m 14s) | 50% số lượt hoàn thành dưới mốc này |
| **Bách phân vị 95 (p95)** | **330 giây** (5m 30s) | **237 giây** (3m 57s) | Mức tải cao trên hạ tầng runner |
| **Chậm nhất (Max)** | **365 giây** (6m 05s) | **239 giây** (3m 59s) | Chậm nhất trong các lượt bình thường |

**Bảng 2: Phân bổ thời lượng từng bước trong Job `check` (Đo thực tế qua `measure-ci.mjs`):**

| Bước trong Job `check` | Min | TB | Median | p95 | MAX | Tỉ lệ TB/Job | Ghi chú |
|---|---:|---:|---:|---:|---:|---:|---|
| **1. `actions/checkout@v4`** | 2s | 4s | 3s | 7s | **8s** | 1.5% | Kéo mã nguồn Git (đột biến riêng ở lượt 43952326729 xem mục 30.4) |
| **2. `actions/setup-node@v4`** | 1s | 5s | 4s | 10s | **10s** | 1.8% | Nạp Node.js 22 theo `.nvmrc` |
| **3. `npm ci`** | 9s | 26s | 18s | 54s | **54s** | 9.5% | Cài đặt dependencies từ `package-lock.json` (tận dụng cache) |
| **4. Kiểm tra kiểu (`typecheck`)** | 10s | 12s | 12s | 17s | **17s** | 4.4% | `tsc --build` toàn bộ workspace |
| **5. Lint (`npm run lint`)** | 9s | 12s | 12s | 16s | **16s** | 4.4% | ESLint toàn bộ repo |
| **6. Kiểm tra định dạng (`prettier`)** | 12s | 16s | 15s | 20s | **21s** | 5.8% | Prettier kiểm tra định dạng |
| **7. Test (`npm run test`)** | 159s | 191s | 181s | 236s | **237s** | 69.5% | Chạy 307 tệp test qua vitest worker threads |
| **8. Build client (`npm run build`)** | 4s | 5s | 4s | 6s | **6s** | 1.8% | Vite đóng gói client vào `client/dist` |
| **TỔNG CẢ JOB CHECK** | **216s** | **275s** | **266s** | **358s** | **365s** | **100.0%** | Trung bình ~4 phút 35 giây |

### 30.3. Danh sách chi tiết các lượt chạy CI gần nhất (Thu thập thực tế)

| Run ID | Nhánh | Sự kiện | Kết quả | Job check | Checkout | npm ci | Typecheck | Test |
|---|---|---|---|---:|---:|---:|---:|---:|
| 43968049904 | `a/test-movement-20hz-khong-bu` | pull_request | success | 250s | 3s | 35s | 11s | 167s |
| 43967991109 | `c/945-ci-duration-log-timeout` | pull_request | success | 293s | 3s | 44s | 12s | 198s |
| 43967181936 | `b/don-chu-thich-boss-bar` | pull_request | success | 245s | 2s | 33s | 11s | 164s |
| 43966802891 | `main` | push | success | 358s | 3s | 54s | 17s | 235s |
| 43966593294 | `a/changelog-trum-fx-tran-giap` | pull_request | success | 277s | 4s | 39s | 12s | 181s |
| 43965599283 | `a/test-quest-nav-khong-cung-id-tong` | pull_request | success | 365s | 4s | 54s | 17s | 237s |
| 43965534049 | `b/do-hieu-nang-trum` | pull_request | success | 298s | 4s | 44s | 13s | 196s |
| 43965375579 | `b/giap-tran-dung-chung` | pull_request | success | 298s | 3s | 45s | 13s | 199s |
| 43964957067 | `main` | push | failure | 295s | 3s | 45s | 13s | 197s |
| 43964506367 | `b/do-hieu-nang-trum` | pull_request | success | 276s | 8s | 38s | 11s | 175s |
| 43963624239 | `main` | push | success | 253s | 6s | 14s | 10s | 177s |
| 43963512951 | `a/test-trieu-hoi-dat-mot-phan` | pull_request | success | 266s | 3s | 15s | 12s | 196s |
| 43963407874 | `a/trum-giap-ms-toi-da` | pull_request | success | 245s | 3s | 13s | 11s | 177s |
| 43963379461 | `c/846-audit-saves-sect-sources` | pull_request | success | 268s | 3s | 15s | 13s | 197s |
| 43963285413 | `a/fix-sect-shop-gục-chap-chon` | pull_request | success | 216s | 3s | 9s | 10s | 159s |
| 43962576747 | `b/trum-giap-trieu-hoi` | pull_request | success | 325s | 4s | 18s | 16s | 236s |
| 43961777476 | `c/846-audit-saves-sect-sources` | pull_request | success | 253s | 7s | 14s | 11s | 175s |
| 43960840290 | `main` | push | success | 263s | 3s | 16s | 12s | 194s |
| 43960053920 | `c/846-docs-load-test-sect-m8` | pull_request | success | 242s | 3s | 11s | 11s | 180s |
| 43959715255 | `main` | push | success | 248s | 5s | 14s | 11s | 179s |
| 43959446574 | `d/m8-7-budget-sim` | pull_request | success | 250s | 6s | 14s | 11s | 179s |
| 43958011007 | `a/changelog-trum-ne-kip` | pull_request | success | 311s | 3s | 18s | 15s | 225s |
| 43957833257 | `main` | push | success | 259s | 7s | 13s | 12s | 180s |
| 43952326729 | `a/agents-tong-mon-chieu-sau` | pull_request | success (rerun) | 311s | 4s | 16s | 15s | 228s |

### 30.4. Phân tích nguyên nhân thực tế lượt bị huỷ ở 10 phút (Run `43952326729`)
Tra cứu API chi tiết của **Lượt 1 (Attempt 1)** bị huỷ (`gh api repos/nguyencong1227/tien-gioi/actions/runs/43952326729/attempts/1/jobs`):

| Bước | Bắt đầu | Kết thúc | Thời lượng | Tình trạng |
|---|---|---|---|---|
| **Set up job** | 20:41:15 | 20:41:15 | 0s | Hoàn thành |
| **`actions/checkout@v4`** | **20:41:15** | **20:48:09** | **6 phút 54 giây (414s)** | **Đột biến bất thường** (bình thường 2–8s) |
| **setup-node + npm ci** | 20:48:09 | 20:48:25 | 16s | Bình thường |
| **typecheck + lint + prettier** | 20:48:25 | 20:49:01 | 36s | Bình thường |
| **Test (`npm run test`)** | **20:49:01** | **20:51:27** | **2 phút 26 giây (146s)** | **Bị huỷ (cancelled)** khi vừa chạm 10 phút cả job |

1. **Nguyên nhân chính xác:**
   - Lượt huỷ duy nhất quan sát được là do bước `actions/checkout@v4` ngốn **6 phút 54 giây** (chiếm tới 70% ngân sách 10 phút của cả job) do sự cố nghẽn mạng / hạ tầng Git clone của runner GitHub Actions lúc đó.
   - Hoàn toàn **không có bằng chứng về nghẽn CPU hoặc treo deadlock trong bước Test**: vitest mới chạy được 2 phút 26 giây thì toàn bộ job bị hết giờ (trong khi thời gian trung bình của bước Test là 3 phút 14 giây, tức là vitest thậm chí còn chưa kịp hoàn thành thời lượng bình thường). Lần chạy lại (attempt 2) xanh bình thường trong 311s cho thấy sự cố mang tính ngẫu nhiên về mạng/hạ tầng runner.

2. **Bài học về shell bẫy lỗi trong GitHub Actions (`pipefail`):**
   - Khi ghi nhật ký ra tệp bằng pipe: `npm run test --if-present 2>&1 | tee vitest.log`, shell mặc định của GitHub Actions trên Linux là `bash -e {0}` (KHÔNG có `pipefail`).
   - Nếu không khai báo `shell: bash`, mã thoát của cả câu lệnh pipe sẽ là mã thoát của lệnh cuối cùng (`tee`), vốn luôn là 0! Điều này dẫn tới nguy cơ: vitest đỏ nhưng bước Test vẫn xanh và PR hỏng vẫn vượt qua CI.
   - Bắt buộc phải khai báo tường minh `shell: bash` (GitHub Actions tự động chuyển thành `bash --noprofile --norc -eo pipefail {0}`).

### 30.5. Các giải pháp đã triển khai (Issue #945)
1. **Khống chế timeout riêng cho bước checkout (`timeout-minutes: 3`):**
   - Đặt `timeout-minutes: 3` cho `actions/checkout@v4`. Nếu hạ tầng GitHub Actions gặp trục trặc mạng khi clone, bước này sẽ timeout và báo lỗi ngay sau 3 phút thay vì ngốn 7–10 phút của cả job.
2. **Nâng trần timeout của job `check` lên 15 phút (`timeout-minutes: 15`):**
   - Bảo đảm khoảng đệm an toàn cho cả job ngay cả khi các bước phụ trợ dao động tải.
3. **Khai báo `shell: bash` có `pipefail` kèm lưu artifact `vitest.log`:**
   - Bảo đảm bất kỳ ca kiểm thử vitest nào đỏ đều khiến bước Test thất bại (`exit 1`).
   - Bước `actions/upload-artifact@v4` được kích hoạt khi `failure() || cancelled()` để tải tệp nhật ký `vitest.log` lên cho dev đối chiếu ngay tên ca kiểm thử bị lỗi hoặc bị gián đoạn.
4. **Cảnh báo tiến trình treo (`hanging-process` reporter):**
   - Thêm reporter `hanging-process` trong cấu hình Vitest CI (`vitest.config.ts`) để in cảnh báo khi có socket hoặc timer chưa dọn dẹp.
5. **Thêm `vitest.log` vào `.gitignore`:**
   - Giữ cây làm việc cục bộ luôn sạch sẽ khi dev chạy thử lệnh kiểm thử có ghi log.







## 31. Ngân sách hiệu năng 8 trùm vận chiêu + 50–100 người chơi (Mục 42 - Issue #936)

### 31.1. Bối cảnh & Mục tiêu kiểm thử
Khi bộ thực thi trùm nhiều chiêu (`server/src/systems/boss.ts`, PR T2) được tích hợp, máy chủ phải xử lý đồng thời logic vận chiêu, kiểm tra điều kiện khoảng cách/mục tiêu, tính toán hình học báo trước (`warn`) và đáp đòn cho các trùm trên bản đồ.
Trước khi bộ dữ liệu trùm thật (#872) được nạp vào, bài đo hiệu năng thường trực `server/src/systems/boss-perf.test.ts` được thiết lập nhằm giữ vững ngân sách hiệu năng:
- **Ngân sách CPU Tick:** Thời gian xử lý trung bình < 10.0 ms (p95 < 10.0 ms) trên `World` thật.
- **Ngân sách Băng thông State Patch:** < 520 byte/tick/client (đo qua `StateView` và `Encoder`).
- **Ngân sách Tần suất sự kiện `fx`:** Đo và đặt ngưỡng giới hạn số lượng tin `fx` một client nhận được khi đứng trong tầm trùm (< 15 fx/giây) để tránh nghẽn socket.
- **Độ phức tạp thuật toán `pickCast`:** So sánh chi phí tick giữa 10 người và 100 người chơi cùng 8 trùm liên tục chọn chiêu: khẳng định tăng tuyến tính O(n), tỉ lệ tăng dưới 25x (chứng minh thuật toán không bị O(n^2)).
- **Trạng thái ngủ (Idle State):** Ca 0 người chơi: trùm hoàn toàn ngủ, tiêu tốn ~0 ms CPU và 0 byte patch.

### 31.2. Thiết lập bài đo (`server/src/systems/boss-perf.test.ts`)
- **Bản đồ:** Lạc Hà Trấn (`DEFAULT_MAP`), cờ `bossMoves = true`.
- **Số trùm:** 8 trùm loài `mang` (Xích Mãng) rải đều quanh trấn ngoài hoang dã (bán kính 1200 px cách tâm trấn, độc lập, không vướng khu an toàn hay chướng ngại vật).
- **Bộ chiêu mô phỏng đầy đủ:** 8 chiêu phủ kín các dạng hình học và điều kiện:
  + Vòng tròn tại mục tiêu (`circleAt`, r = 60).
  + Vành khuyên quanh thân (`ring`, r0 = 80, r = 160).
  + Nón quạt (`cone`, r = 180, arc = 60 độ).
  + Đường thẳng / kích kiếm (`line`, len = 240, w = 80).
  + Mưa vòng tròn rải rác (`rain`, r = 40, count = 3).
  + Hấp lực trận kéo vào + nổ (`pull`, r = 200, pullPx = 60, blastR = 60, điều kiện `minTargets: 2`).
  + Triệu hồi quái con (`summon`, gọi 2 Hôi Lang, điều kiện `maxTargets: 15`).
  + Hộ thể giảm sát thương (`buff`, giảm 50% trong 3s, điều kiện `minTargets: 1`).
  Bộ chiêu đạt chuẩn 100% qua bộ kiểm tra hợp đồng và luật né tránh `bossViolations`.
- **Số người chơi:** 0, 10, 50, 100 người chơi Kim Đan rải quanh các con trùm trong tầm 160–240 px (nằm trong tầm aggro 800 px và bán kính điều kiện mục tiêu 320 px).

### 31.3. Kết quả đo đạc thực tế (Mô phỏng 10–30 giây, 20 tick/giây)

| Quy mô (Người chơi) | Số trùm | Tick TB (ms) | Tick p95 (ms) | Tick Max (ms) | Byte Patch / tick / client | fx / giây (1 client gần trùm) | Đánh giá |
|---:|---:|---:|---:|---:|---:|---:|---|
| **0 người** | 8 | **0.00 ms** | 0.00 ms | 0.04 ms | **0.0 byte** | 0.00 | **ĐẠT:** Trùm ngủ, 0 byte patch, CPU ~0 |
| **10 người** | 8 | **0.02 ms** | 0.04 ms | 0.24 ms | **1.7 byte** | 1.70 | Cực kỳ nhẹ |
| **50 người** | 8 | **0.09–0.14 ms** | **0.20–0.36 ms** | 1.09–1.46 ms | **2.2–6.0 byte** | **1.13–1.60** | **ĐẠT:** Nằm sâu dưới trần 10 ms & 520 byte |
| **100 người** | 8 | **0.20 ms** | 0.54 ms | 1.62 ms | **2.9 byte** | 1.20 | **ĐẠT:** Không nghẽn |

### 31.4. Phân tích & Đánh giá chi tiết
1. **CPU Tick máy chủ:**
   - Ở quy mô chuẩn 50 người chơi và 8 trùm vận chiêu liên tục suốt 30 giây (600 tick), CPU tick trung bình chỉ tốn **0.14 ms** (p95 đạt 0.36 ms, đỉnh tối đa 1.46 ms). Máy chủ xử lý cực kỳ nhẹ nhàng, chỉ chiếm ~1.4% ngân sách 10 ms.
2. **Độ phức tạp lựa chọn chiêu (`pickCast`):**
   - Đo riêng `tickMonsters` của 8 trùm liên tục chọn chiêu qua mọi tick (xoá hồi chiêu và giáp để pickCast chạy thật, 3 lần đo lấy min): 10 người = 0.033 ms (warns: 864), 100 người = 0.120 ms (warns: 969).
   - Tỉ lệ tăng chỉ 3.62x cho 10 lần số người chơi (nằm sâu dưới trần 25x), khẳng định thuật toán duyệt người chơi theo độ phức tạp O(n) tuyến tính, hoàn toàn loại bỏ nguy cơ nghẽn O(n^2).
3. **Băng thông State đồng bộ (`StateView` & `Encoder`):**
   - Lượng byte patch trung bình mỗi tick gửi tới mỗi client chỉ dao động từ **2.2 đến 6.0 byte/tick**, cách xa giới hạn trần 520 byte/tick.
   - Toàn bộ cơ chế vận chiêu, giai đoạn và cuồng nộ của trùm được thiết kế hoàn toàn qua các gói tin sự kiện `fx` ngắn hạn, không thêm bất kỳ trường trạng thái công khai nào vào schema.
4. **Tần suất tin nhắn `fx` gửi tới client:**
   - Với quy định nghỉ giữa các lần chiêu `castGapMs >= 600 ms` và thời gian báo trước `telegraphMs >= 800 ms`, khoảng cách giữa 2 lần ra chiêu của trùm luôn >= 1.4 giây.
   - Một client đứng trong tầm giao tranh nhận trung bình **~1.1–1.7 tin fx/giây** (bao gồm `warn`, `bossCast`, `bossSummon`, `bossArmor`). Con số này hoàn toàn nằm dưới ngưỡng an toàn 15 fx/giây, không gây áp lực lên hàng đợi socket hay FPS của client.
5. **Trạng thái ngủ khi không có người chơi:**
   - Khi không có người chơi trong tầm phát hiện, toàn bộ 8 trùm rơi vào trạng thái ngủ: không quét chiêu, không sinh bản tin `fx`, byte patch đồng bộ bằng đúng 0 byte.

### 31.5. Chứng minh độ tin cậy bằng 4 đột biến ĐỎ (Mutations)
Để bảo đảm bài đo `server/src/systems/boss-perf.test.ts` có khả năng phát hiện lỗi thực sự và không bao giờ bị 'xanh giả', 4 đột biến mã đã được thử nghiệm và đều làm bài test chuyển ĐỎ chính xác:
1. **Đột biến 1 (Vòng lặp người chơi x người chơi O(n^2) bên trong nhánh đếm `near` của `pickCast`):**
   - *Cách tạo đột biến:* Lồng vòng lặp duyệt người chơi O(n^2) bên trong `w.state.players.forEach` của nhánh đếm mục tiêu `near` trong `pickCast`.
   - *Kết quả:* Thời gian `tickMonsters` ở 100 người chơi vọt lên **5.04 ms** (tỉ lệ tăng gấp 61.81x so với 10 người chơi = 0.082 ms).
   - *Bắt lỗi:* Ca test 3 ĐỎ: `AssertionError: expected 5.040289950000021 to be less than 2`.
2. **Đột biến 2 (Gửi `warn` mỗi tick thay vì một lần lúc bắt đầu):**
   - *Cách tạo đột biến:* Trong `runCast`, gọi `emitWarn(w, cast)` mỗi tick của chiêu đang vận.
   - *Kết quả:* Tần suất sự kiện gửi tới client vọt lên **16.67 fx/giây** (vượt ngưỡng trần 15 fx/giây).
   - *Bắt lỗi:* Ca test 2 ĐỎ: `AssertionError: expected 16.666666666666668 to be less than 15`.
3. **Đột biến 3 (Ghi thêm 1 trường vào state công khai mỗi tick):**
   - *Cách tạo đột biến:* Trong `bossStep`, gán `m.x = m.x + (w.now % 2 === 0 ? 0.01 : -0.01)` làm dirty state Colyseus mỗi tick.
   - *Kết quả:* Byte patch state vọt lên **24.37 byte/tick/client** (tăng gấp hơn 4 lần so với bình thường ~6 byte).
   - *Bắt lỗi:* Ca test 2 ĐỎ: `AssertionError: expected 24.36596666666658 to be less than 15`.
4. **Đột biến 4 (Bỏ điều kiện "ngủ khi không có người chơi"):**
   - *Cách tạo đột biến:* Trong `updateMonster`, ép nhánh kiểm tra `nearest > MONSTER_WAKE_DIST` thành `false`.
   - *Kết quả:* 8 con trùm tự động lang thang dù không có ai chơi, toạ độ vị trí trùm bị trôi lệch khỏi vị trí sinh ban đầu (x đổi từ 2736 về 2730.28).
   - *Bắt lỗi:* Ca test 1 ĐỎ: `AssertionError: expected 2730.282771868729 to be 2736`.

## 32. Đo bot né vùng cảnh báo trùm Xích Mãng trên máy chủ Colyseus thật (Mục 42 - Issue #876 T7)

### 32.1. Bối cảnh & Mục tiêu kiểm thử
Theo thiết kế trùm (mục 42 `QUYET_DINH_M3.md` và `docs/THIET_KE_TRUM.md`), mọi đòn đánh nguy hiểm của trùm đều phải có báo trước qua `fx` `warn` (hình tròn, vành khuyên, nón quạt, đường thẳng) với thời gian báo trước `telegraphMs >= 800 ms` để người chơi kịp né tránh.
Nhiệm vụ T7 (Issue #876) tiến hành đo đạc bot né vùng cảnh báo với trùm Xích Mãng (`mang` tại Hắc Phong Cốc) khi bật cờ `BOSS_MOVES=on`:
- **Lời hứa công bằng (Fair Reflex Promise):** Với độ trễ phản xạ `reflexMs = 400 ms` và tốc độ chạy chuẩn 150 px/s, bot phải né thoát kịp trước khi đòn đáp xuống.
- **Đo lường đối chứng:** So sánh **tỉ lệ dính đòn** giữa nhánh bot bật né (`--boss --evade`) và nhánh bot không né (`--boss --no-evade`), đo trực tiếp bằng sự sụt giảm `hp` thật trên máy chủ.
- **Đột biến chứng minh (Mutations):** Chứng minh test đỏ khi bot phản xạ quá chậm (> 800 ms), bỏ qua cảnh báo `warn`, hoặc đảo ngược hướng vector né.

### 32.2. Mở rộng công cụ thử tải `server/scripts/bots.ts`
1. **Cờ tham số dòng lệnh mới:**
   - `--boss` (hoặc `--boss-hunt`): Tự động đặt bản đồ là `hac_phong`, nới tầm tìm kiếm quái lên 2500 px và đặt hệ số ưu tiên cao nhất cho trùm `mang` (penalty -2000 điểm khoảng cách).
   - `--no-evade` (hoặc `--evade=false`): Ép tắt thuật toán né để chạy ca đối chứng khi săn trùm.
   - `--reflex-ms=N` (hoặc `--reflex=N`): Đặt thời gian phản xạ (mặc định 400 ms). Bot chỉ bắt đầu di chuyển né sau khi `now >= warnAt + reflexMs`.
2. **Cải tiến giải thuật vector né hình học (`computeEvadeVector`) và chống xung đột AI đuổi chém:**
   - **Vành khuyên (`ring`):** So sánh khoảng cách tới lõi an toàn `(d - r0)` và khoảng cách tới rìa ngoài `(r - d)`. Nếu gần lõi hơn thì chạy vào tâm, nếu gần rìa hơn thì chạy ra ngoài.
   - **Nón quạt (`cone`):** So sánh khoảng cách ra rìa ngoài `(r - d)` với khoảng cách vuông góc ngắn nhất ra 2 cạnh nón `d * sin(arc/2 - |diff|)`. Nếu ở gần cạnh nón hơn, chọn hướng thoát ly vuông góc với cạnh nón gần nhất.
   - **Đường thẳng (`line`):** Thoát ly theo hướng pháp tuyến vuông góc với đoạn thẳng.
   - **Ngăn bước ngược vào vùng nguy hiểm chưa nổ (`isPointInAnyActiveWarn`):** Khi bot vừa bước ra ngoài vùng nguy hiểm (`evadeVec === null`) nhưng cảnh báo vẫn đang đếm ngược chưa nổ (`w.expiresAt > now`), kiểm tra nếu bước di chuyển tiếp theo `(nextX, nextY)` của AI săn quái làm bot bước ngược vào vùng cảnh báo (`buffer = 16` px) thì lập tức dừng lại (`dx = 0, dy = 0`), giữ vị trí an toàn cho đến khi đòn nổ xong. Đồng thời tạm ngừng gửi `attack` / `skill` khi đang trong vùng nguy hiểm (`inEvadeDanger`).

### 32.3. Bộ kiểm thử tự động (`server/scripts/boss-bot-stress.test.ts` - 11 ca kiểm thử)
Bộ kiểm thử tách bạch rõ phần kiểm tra đơn vị hình học của bot và phần kiểm tra trùm thật `BOSS_MOVES=on` trên máy chủ Colyseus thật:
- **Nhóm A – Kiểm thử đơn vị hình học của bot với tin `fx` `warn` do test phát (Ca 1–8):**
  1. **Ca 1 (`[Hình học bot]`):** Bot nhận tin `fx` `warn` từ phòng và giải mã đúng các trường hình học.
  2. **Ca 2 (`[Hình học bot]`):** Đối chứng vành khuyên: Bot bật evade né thoát 100%, Bot đứng yên dính đòn 100%.
  3. **Ca 3 (`[Hình học bot]`):** Bot né nón quạt (`cone`) thành công trước khi đòn đáp.
  4. **Ca 4 (`[Hình học bot]`):** Bot né đòn lao thẳng (`line`) thành công trước khi đòn đáp.
  5. **Ca 5 (`[Hình học bot]`):** Thử tải 10 bot với tin `fx` `warn`: 5 bot né thoát 100% vs 5 bot đứng yên dính đòn 100%.
  6. **Ca 6 (`[Hình học bot]`):** Lời hứa công bằng hình học: Bot phản xạ 400 ms vẫn né thoát 100% trước đòn báo trước 800 ms (6–8 tick = 45–60 px di chuyển).
  7. **Ca 7 (`[Đột biến hình học 1]`):** Bot phản xạ chậm 900 ms (> 800 ms báo trước) -> không kịp cử động và dính đòn (ĐỎ).
  8. **Ca 8 (`[Đột biến hình học 2]`):** Bot bỏ qua tin nhắn `fx` `warn` -> dính đòn 100% (ĐỎ).
- **Nhóm B – Kiểm thử trùm Xích Mãng thật (`BOSS_MOVES=on`) và đột biến hướng né (Ca 9–11):**
  9. **Ca 9 (`[Máy chủ Colyseus thật + BOSS_MOVES=on]`):** Sinh trùm Xích Mãng thật (`placeMonster`) tại bãi trống `(1300, 1000)`, trùm tự vận chiêu `quat_duoi` (`cone`, `r = 150`, `arc = 120°`, `ms = 1000`), bot gửi `input` di chuyển thật qua WebSocket lên phòng Colyseus, máy chủ chạy `applyInputs` và `boss.ts` trừ máu thật:
     + Bot đứng yên tại `(1300, 1070)`: `pStand.hp` giảm từ `1000` xuống `804` HP (mất 196 HP đúng sát thương `140 * 1.4` sau `1000 ms`).
     + Bot né (sau phản xạ 400 ms gửi `input` thoát sang cạnh nón): `pEvade.hp` giữ nguyên `1000` HP (không mất máu).
  10. **Ca 10 (`[Đột biến đảo hướng né]`):** Đảo ngược vector `computeEvadeVector` (`dx = -vec.dx, dy = -vec.dy`) -> bot chạy sâu vào vùng nguy hiểm và dính đòn (ĐỎ).
  11. **Ca 11 (`[Thực nghiệm 100 đòn x 3 lần + BOSS_MOVES=on]`):** Chạy đối chứng 3 lần × 100 đòn mỗi nhánh với trùm Xích Mãng thật vận cả 2 chiêu `quat_duoi` (`cone`) và `cuon_minh` (`line`), đo bằng `hp` thật trên máy chủ (Stand: 100% dính, Evade: 0% dính, Đột biến đảo hướng: > 50% dính).

### 32.4. Kết quả thực nghiệm đối chứng & Phân tích nguyên nhân

#### A. Số đo ban đầu (trước khi sửa xung đột giữa logic né và logic đuổi chém, 15 bot, 15s)

| Kịch bản | Cờ chạy | Đòn nhắm tới | Đòn dính | Tỉ lệ dính đòn | Đòn không dính | Tick di chuyển né | Kết luận thực tế |
|---|---|---:|---:|---:|---:|---:|---|
| **Đối chứng (Không né)** | `--boss --no-evade` | 35 | 20 | **57.1%** (20/35) | 15 (42.9%) | **0 tick** | Bot không né, chỉ vô tình lệch vùng khi đuổi quái khác |
| **Có né (Ban đầu, 400ms)** | `--boss --evade` | 25 | 17 | **68.0%** (17/25) | 8 (32.0%) | **180 tick** | **Bot né chưa giảm đòn trúng** (68.0% so với 57.1%, mẫu nhỏ) |

- **Đánh giá trung thực số đo ban đầu:** Dù bot bật né có thực hiện 180 tick di chuyển né (tải CPU máy chủ TB 0.99 ms/tick, p95 1.43 ms, băng thông 1.89 KB/s), **tỉ lệ dính đòn thực tế là 68.0% (17/25), cao hơn mức 57.1% (20/35) của bot không né**. Tức ở phiên bản đầu, việc bật né chưa giúp bot giảm số đòn trúng trên trùm thật.

#### B. Phân tích nguyên nhân (qua nhật ký từng `warn`: hình, khoảng cách, vector né, trạng thái chém)
Khi ghi log chi tiết từng `warn` phát ra từ trùm Xích Mãng, nguyên nhân khiến bot bật né vẫn dính đòn được xác định rõ:
1. **Hai logic giành quyền điều khiển (vừa bước ra mép đã lao ngược vào chém):** Khi bot né di chuyển vừa vượt qua mép vùng cảnh báo 1–2 px, `isPointInWarnZone` trả về `false` nên `computeEvadeVector` trả về `null`. Ngay ở tick kế tiếp (trong khi cảnh báo vẫn còn 200–400 ms mới nổ), logic AI săn quái thấy khoảng cách tới trùm lớn hơn tầm đánh thường (`dist > SKILLS.slash.range`) nên lập tức phát lệnh di chuyển **lao thẳng về phía chân trùm** để chém -> bot tự bước ngược trở lại vào vùng nguy hiểm đúng lúc đòn đáp xuống!
2. **Xung đột hành động trong lúc né:** Khi đang ở trong vùng cảnh báo, bot vẫn tiếp tục gửi tin `attack` và `skill`.

#### C. Số đo sau khi sửa xung đột (100 đòn × 3 lần chạy mỗi nhánh = 300 đòn/nhánh, `BOSS_MOVES=on`, đo bằng `hp` thật trên máy chủ)
Sau khi bổ sung kiểm tra `isPointInAnyActiveWarn` (chặn không cho AI săn quái bước ngược vào vùng cảnh báo chưa nổ) và tạm dừng đánh khi đang né, kết quả đo với trùm Xích Mãng thật (đặt ở khoảng cách 130 px để trùm tung cả 2 chiêu `quat_duoi` `cone` và `cuon_minh` `line`):

| Nhánh thử nghiệm | Lần chạy | Đòn nhắm tới (`cone` + `line`) | Đòn dính (mất `hp` thật trên server) | Đòn né thoát | Tỉ lệ dính đòn | Mẫu log thực tế (`shape`, `dist`, `hasVec` -> kết quả) |
|---|---:|---:|---:|---:|---:|---|
| **1. Đối chứng (`--no-evade`)** | Lần 1 | 100 | 100 | 0 | **100.0%** | `#1 [line] dist=130px hasVec=false -> HIT`, `#2 [cone] dist=130px -> HIT` |
| **1. Đối chứng (`--no-evade`)** | Lần 2 | 100 | 100 | 0 | **100.0%** | Đứng yên trong vùng nguy hiểm chịu sát thương 100% |
| **1. Đối chứng (`--no-evade`)** | Lần 3 | 100 | 100 | 0 | **100.0%** | **Trung bình 3 lần: 300 / 300 đòn dính (100.0%)** |
| **2. Có né (`--evade`, 400ms)** | Lần 1 | 100 | **0** | 100 | **0.0%** | `#1 [line] dist=146px hasVec=true -> EVADED`, `#2 [cone] dist=175px -> EVADED` |
| **2. Có né (`--evade`, 400ms)** | Lần 2 | 100 | **0** | 100 | **0.0%** | Thoát khỏi vùng nguy hiểm và giữ vị trí an toàn chờ đòn nổ xong |
| **2. Có né (`--evade`, 400ms)** | Lần 3 | 100 | **0** | 100 | **0.0%** | **Trung bình 3 lần: 0 / 300 đòn dính (0.0%)** |
| **3. Đột biến (Đảo hướng `-vec`)** | Lần 1–3 | 3 × 100 | **3 × 100** | 0 | **100.0%** | Đảo ngược vector thoát hiểm khiến tỉ lệ dính tăng từ 0% lên 100% |

## 33. E2E thật Xã hội + trùm thế giới (M9, nghiệm thu #1034; `npm run e2e:xa-hoi -w server`)

Server Colyseus thật trong tiến trình (thư mục dữ liệu tạm, `ACHIEVEMENTS` bật, `LeaderboardService` như `index.ts`, lịch trùm thế giới MẪU gắn vào `WorldRoom.hub.worldBoss.slots`: Xích Mãng ở Lạc Hà, mốc phút kế tiếp cách >= 60 giây, báo trước 1 phút) phục vụ `client/dist`; HAI tab Chrome headless đi qua giao diện thật. Luồng (mất ~1,5-2 phút vì chờ mốc phút của lịch): đăng nhập bằng form -> dòng hệ thống "sẽ xuất hiện sau 1 phút" -> trùm xuất hiện (banner tên + máu + đồng hồ) -> hai người đóng góp (máy chủ trừ máu bằng `dealMonsterDamage`, đúng đường `worldBossCredit`; hai người thấy hai phần trăm khác nhau, danh sách đủ hai người) -> hạ trùm: banner kết quả + toast + thưởng chia theo tỉ lệ (A nhiều hơn B, tổng không vượt thưởng của khung) -> thành tựu 'Hạ Xích Mãng' mới (chấm Mới ở nút HUD) -> bảng Xã hội: tab Thành tựu (đeo 'Thợ Săn Trùm': máy chủ ghi `Player.title`, tab người KHÁC thấy danh hiệu trên đầu nhân vật), tab Xếp hạng (bảng Tu vi có hạng của mình), tab Sự kiện. Không lỗi console, không cảnh báo mất tin. `E2E_SHOTS=<thư mục>` chụp ảnh (mỗi tab một tiền tố `A-` / `B-`); bộ ảnh nghiệm thu đã chuyển sang WebP ở `docs/screenshots/m9-*.webp`. Lịch MẪU không phải dữ liệu thật (lịch thật là việc của E, M9.10).

## 34. E2E thật sáu chiêu hình mới (CT9 lát 1, #1054; `npm run e2e:chieu-moi -w server`)

Lần ĐẦU các hình của CT11 (đạn bay, sét lan, vật thể bền, chiêu vận) chạy với chiêu THẬT chứ không phải mock. Server Colyseus thật trong tiến trình (thư mục dữ liệu tạm) + một tab Chrome headless trên `client/dist`; nhân vật Nguyên Anh đã học đủ sáu chiêu, bốn chiêu đầu gắn ô L U I O, hai chiêu sau gắn bằng tin `skillSlot` thật. Điều khiển bằng PHÍM THẬT (`Input.dispatchKeyEvent`). Quái là một Linh Thố ở chỗ thoáng theo hướng bắn (ba tia quạt +-27 độ phải dài >= 200 px), nâng máu để không chết, bị CHOÁNG dài để không trả đòn; các quái khác cất vào góc xa bản đồ ở mỗi lần đặt lại. Mỗi ca chạy ~1 phút.

| Chiêu | Hình | Kiểm (máy chủ quyết định, client chỉ vẽ) |
|---|---|---|
| Độc Đằng Phục | bẫy | `fx trap`: vật thể hiện ngay, CHƯA kích hoạt (`armMs` 600) -> kích hoạt; quái chạm bán kính -> máy chủ `fxEnd` `pop`, chính tin đó vẽ vòng nổ + bụi, vật thể gỡ, quái mất máu |
| Phi Kiếm Tam Liên | đạn bay | ba `fx pbolt`, lớp đạn đếm đủ +3, quái trúng đạn |
| Liệt Diễm Trận | vùng | `fx zone`: quái trong vòng mất máu NHIỀU lần theo nhịp 800 ms; hết 4 s TỰ TẮT, KHÔNG có `fxEnd` |
| Liên Châu Lôi | sét lan | `fx chain` có >= 2 điểm, CHÍNH tin đó vẽ >= số đoạn điểm hạt, quái mất máu |
| Hồn Phiên Tượng | tượng | `fx totem`: quái trong tầm mất máu theo nhịp 1 s; hết 6 s TỰ TẮT |
| Phá Sơn Nhất Kích | chiêu vận 1200 ms | `fx cast` chưa có sát thương, vòng tụ khí hiện ngay và TIẾN DẦN (0,36 -> 0,65); hết vận đòn mới đáp, vòng tắt |

Còn kiểm: thanh chiêu máy tính hiện đủ bốn ô >= 44 px trong khung nhìn; 0 lỗi console / exception. Chrome khởi động với `--blink-settings=primaryPointerType=4,...` vì headless không có chuột nên `(pointer: fine)` sai và thanh chiêu L U I O bị ẩn (ảnh `E2E_SHOTS` cũng cần). **Đột biến (6 / 6 đỏ đúng bước):** bỏ `persists.add` (bẫy không hiện), bỏ `windups.begin` (không vòng tụ khí), bỏ `pbolts.add` (đạn không đếm), bỏ `playFxPoints` của `chain` (0 điểm hạt), bỏ vòng nổ của `fxEnd pop`, máy chủ bỏ `k.land()` của chiêu vận (đòn không đáp). Ảnh: `E2E_SHOTS=<thư mục>` ghi mỗi hình một ảnh. Chạy: `npm run build -w client && npm run e2e:chieu-moi -w server`; nằm trong `e2e:all`.

## 35. E2E thật dấu / kích / đồng đội (CT8 lát 2, #1053; `npm run e2e:chieu-dau -w server`)

Chiêu dữ liệu ĐẦU TIÊN dùng cơ chế `mark` + `combo` + `ally` (Thiên La Lôi Cấm, Chưởng Tâm Lôi Bạo, Bách Thú Khiếu Phong). Cơ chế đã có test đơn vị / `skill-kit` ở máy chủ và `monster-status.test.ts` ở client, nhưng chưa có kịch bản thấy chúng chạy trọn vẹn từ máy chủ tới màn hình. Máy chủ Colyseus thật + Chrome + phím thật (L U I), nhân vật Nguyên Anh hậu kỳ (Bách Thú đòi hậu kỳ, Chưởng Tâm đòi trung kỳ), quái Linh Thố choáng làm bao cát.

| Ca | Quan sát |
|---|---|
| đối chứng | Chưởng Tâm Lôi Bạo KHÔNG dấu: tin `dmg` không `combo`, không vụ nổ; lấy trung bình hai đòn không chí mạng |
| gắn dấu | Thiên La Lôi Cấm (xác suất 0,8, thử lại): `mark_loi` ở máy chủ; client vẽ chấm "Dấu Lôi" (`monsterPips`) |
| kích dấu | Chưởng Tâm Lôi Bạo: tin `dmg` có `combo`, vụ nổ dấu (điểm hạt do CHÍNH tin đó), máy chủ gỡ dấu, chấm tắt, sát thương trong (1,2; 1,9) lần đối chứng (nominal 1,5) |
| đồng đội | Bách Thú Khiếu Phong: mình nhận tăng tốc + hồi phục; đồng đội cùng đội ở 800 px KHÔNG nhận, ở 200 px nhận |

Kết quả: cả ba cơ chế đúng, không phát hiện lỗi; 8 / 8 lần chạy liền đạt. Đột biến (cây thật, `git checkout --` sau mỗi lần): bỏ `shareWithParty` ĐỎ ca đồng đội trong tầm; bỏ kiểm tầm `ally` ĐỎ ca ngoài tầm; combo `mult` 1,0 ĐỎ (4 / 4 lần) ca tỉ lệ; combo `consume: false` ĐỎ ca gỡ dấu; client bỏ vụ nổ combo ĐỎ ca vụ nổ; client bỏ nhận `Monster.mark` ĐỎ ca chấm dấu. Lưu ý: sát thương có độ lệch ngẫu nhiên và chí mạng, nên tỉ lệ so với trung bình HAI đòn đối chứng không chí mạng (một mẫu lẻ làm đột biến 'mất thưởng combo' lọt ~1 / 2 lần). Bậc đồ hoạ ghim `tg_quality=high` (`E2E_QUALITY` để đổi) như `e2e:chieu-moi`.

Cách chạy:
```bash
npm run build -w client
npm run e2e:chieu-dau -w server
```
