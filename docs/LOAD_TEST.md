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
  npm run bench -w server -- --multi --seconds 20

  # Hoặc chạy mô phỏng riêng 1 bản đồ chỉ định
  npm run bench -w server -- --map=hac_phong --players 50 --seconds 20
  ```
- **Tiêu chuẩn ngân sách:**
  - Tổng thời gian CPU tick của **toàn bộ các phòng** gộp lại trên tiến trình đơn luồng Node.js phải đạt **< 10 ms/tick** (để giữ vững nhịp 20 tick/giây).
  - Băng thông patch của từng client trên mỗi bản đồ phải tuân thủ ngân sách tương đương (< 520 byte/tick).
- **Kết quả đo thực tế (`--multi --seconds 20`, seed = 1 cố định, 400 tick; Lạc Hà 50 + Hắc Phong Cốc 50 = 100 người chơi):**
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
```

