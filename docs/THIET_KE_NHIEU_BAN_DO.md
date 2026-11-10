# Thiết kế nhiều bản đồ và bí cảnh (đề xuất của Dev A, chờ người dùng quyết định)

> **Trạng thái: đề xuất.** Chưa có dòng mã nào của tính năng này. Mục 1-4 là phân tích; mục 5 là thứ tự làm; mục 6 là những câu cần người dùng chọn. Riêng **Bước 0** (mục 5) không phụ thuộc câu trả lời nào và A sẽ giao khi không còn việc dở.

## 1. Hiện trạng (đã đọc mã, không đoán)
- Một phòng Colyseus duy nhất (`ROOM_NAME = "world"`, `WorldRoom`), tối đa `MAX_PLAYERS_PER_ROOM = 100`, một `World` / một vòng tick.
- Bản đồ là **hằng số toàn cục** trong `shared/src/map.ts`: `MAP_TILES = generate()` (seed cố định `MAP_SEED`), `TOWN`, `TOWN_PX`, `tileAt`, `isBlockedPx`, `circleBlocked`, `moveWithCollision`, `inTown`, `dangerAt`. Client và server cùng nạp module nên ra cùng một bản đồ.
- Nơi đang gọi thẳng các hàm / hằng đó: `server/src/systems/{monsters,movement,progression,interest}.ts`, `server/src/rooms/WorldRoom.ts`, `server/src/perf/bench.ts`, `server/scripts/bots.ts`, `server/scripts/audit-saves.ts` (`kiem-save`), `client/src/scenes/WorldScene.ts` (vẽ ô) và các test. Khoảng 7 tệp mã + test, đủ ít để đổi một lượt.
- `SavedPlayer` chưa có `mapId`; tên đang chơi được kiểm bằng `state.players` **của một phòng** (`onAuth` trả 409); đội (`PartyBook`) nằm trong `World` của phòng; chat là `broadcast` trong phòng.
- Nối lại khi rớt mạng (#116) giữ nhân vật ở `ghosts` **của phòng đó**.

## 2. Mục tiêu và ngoài phạm vi
- Có thể thêm bản đồ thứ hai, thứ ba (khu săn mới, quái mạnh hơn) và bí cảnh theo đội, mà không phá những gì đã chạy: một bản đồ vẫn chạy y như hiện nay, bench / ngân sách không xấu đi.
- Ngoài phạm vi ở đây: PK, tông môn, tài khoản thật / PostgreSQL (M4), nhiều máy chủ.

## 3. Hai phương án kiến trúc
| | **A. Mỗi bản đồ một phòng Colyseus** | **B. Một phòng, nhiều bản đồ trong cùng `World`** |
|---|---|---|
| Cách làm | `gameServer.define("world", WorldRoom).filterBy(["mapId"])`; chuyển bản đồ = lưu nhân vật, rời phòng, vào phòng đích | Mỗi thực thể có `mapId`; vùng nhìn (`interest`) lọc thêm theo bản đồ; quái, đồ rơi, NPC theo bản đồ |
| Chat, đội, kiểm tên đang chơi | Phải dùng chung giữa các phòng (sổ đăng ký toàn cục + kênh chat chung) | Giữ nguyên, không đổi |
| Mở rộng | Mỗi phòng một vòng tick nhưng **chung một luồng Node** trong một tiến trình: ngân sách thật là TỔNG thời gian tick của mọi phòng trong 50 ms; muốn mở rộng ngang (nhiều tiến trình) phải có presence chung (ngoài phạm vi) | Một vòng tick cho tất cả; trần là 100 người cả game cho tới khi tách phòng |
| Bí cảnh theo đội (phòng tạm, có hạn giờ) | Tự nhiên: tạo phòng tạm, huỷ khi hết giờ | Không hợp: phải mô phỏng "phòng" bằng bản đồ động trong `World` |
| Rủi ro lớn nhất | Nhất quán dữ liệu khi chuyển phòng (lưu xong mới nạp), đội / chat / nối lại liên phòng | Tick phình theo tổng số quái của mọi bản đồ; mã `World` phức tạp lên |
| Chi phí ước tính | Lớn (2 sprint), nhiều chỗ chạm | Vừa (1 sprint) nhưng bí cảnh vẫn cần A sau đó |

**Khuyến nghị: A**, vì bí cảnh bắt buộc cần phòng tạm, và làm B xong vẫn phải làm lại một phần. Nếu chỉ cần thêm một hai khu săn mà chưa cần bí cảnh, B rẻ hơn. Quyết định ở câu hỏi 1-2 (mục 6).

## 4. Phương án A chi tiết (cái cần đổi)
**`shared/` (PR riêng, một dev khác review):**
- `MAPS`: bảng bản đồ `{ id, name, seed, w, h, town?, portals: [{ x, y, toMap, toPortal }], danger }` và `getMap(mapId)` trả về ô, va chạm, `inTown`, `dangerAt` theo bản đồ. Giữ các hàm cũ dưới dạng bản đồ mặc định (`lac_ha`) để chuyển dần.
- `JoinOptions.mapId?` (mặc định `lac_ha`); tin `travel { portalId }` (client -> server) và `travelTo { mapId }` (server -> client); `SavedPlayer.mapId?` (tệp cũ không có thì coi là `lac_ha`).

**Server:**
- `World` mang theo `map`; `spawnInitial`, `safeSpot`, `inTown`, `dangerAt`, vùng nhìn đọc từ `w.map`, không đọc hằng toàn cục.
- Hệ thống `travel`: kiểm đứng gần cổng (`NPC_RANGE` tương tự), hồi chiêu, không đang chết; lưu nhân vật (có `mapId` và chỗ vào của bản đồ đích), rồi gửi `travelTo`. Chuyển chủ động nên dùng `leave(true)`, không có "người chờ nối lại" (xem #116).
- **Sổ đăng ký tên đang chơi toàn cục** (module `online.ts`: tên -> phòng + sessionId) thay cho kiểm `state.players` ở `onAuth`, nếu không một nhân vật vào được hai bản đồ cùng lúc. Việc huỷ chờ của `ghosts` (đăng nhập lại đúng mã) cũng phải tra theo sổ này.
- **Đồng bộ lưu / nạp khi chuyển phòng:** phòng đích chỉ nạp file sau khi phòng cũ lưu xong (cùng cơ chế `done` của `ghosts` hiện có).
- **Đội:** `PartyBook` lấy ra khỏi `World` thành một sổ dùng chung (khoá theo tên), tin `party` chỉ liệt kê người cùng phòng kèm cờ "ở bản đồ khác"; chia tu vi vẫn theo khoảng cách nên tự nhiên chỉ tính người cùng phòng.
- **Chat chung:** kênh chat thế giới đi qua một bus chung (`this.presence` của Colyseus hoặc module trong cùng tiến trình, vì hiện chỉ một tiến trình), kênh chat khu vực vẫn là `broadcast` trong phòng.
- **Bí cảnh:** phòng tạm `dungeon` (`maxClients` = cỡ đội, `autoDispose`, hạn giờ bằng `clock.setTimeout`), cổng vào là một cổng đặc biệt chỉ đội trưởng bật; phần thưởng và quái trùm là dữ liệu riêng; khi hết giờ đưa mọi người về cổng vào. Làm SAU khi chuyển bản đồ thường chạy ổn.

**Client:** `main.ts` vào đúng `mapId` đã lưu; `WorldScene` dựng ô từ `getMap`, không từ hằng toàn cục; đổi bản đồ có màn chuyển cảnh (mờ dần, tên bản đồ); bản đồ nhỏ / lớn theo bản đồ; token nối lại (#117) theo phòng hiện tại.

**Công cụ (C):** bot `--map`, bench từng bản đồ và ca "nhiều `World` một tiến trình", kịch bản người qua cổng liên tục (rò ghost, đua lưu / nạp), mục mới trong `docs/LOAD_TEST.md`; `kiem-save` kiểm thêm `mapId` (lạ thì báo, server sẽ đưa về `lac_ha`) và tọa độ phải nằm trong bản đồ CỦA `mapId` đó, không trên ô chặn.

## 5. Thứ tự làm
- **Bước 0: refactor trung tính (không phụ thuộc quyết định nào, làm được ngay sau #117 để không đụng `WorldScene.ts` của B).** Đưa bản đồ thành tham số: `MAPS` chỉ có `lac_ha`, `getMap("lac_ha")`, mọi nơi đọc từ `w.map` / `scene.map`; các hằng và hàm cũ vẫn còn (trỏ tới bản đồ mặc định) để không vỡ gì. Hành vi, bench, ngân sách giữ nguyên (0.0%). PR 0a `shared/` (A, #124, đã vào), PR 0b server (A, `server/src` kể cả `perf/bench.ts`), PR 0c client (B), PR 0d công cụ (C: `server/scripts/bots.ts` và `server/scripts/audit-saves.ts`).
- Bước 1: bản đồ thứ hai + cổng + `travel` (cần quyết định câu 1-2). Nội dung bản đồ (seed, quái, NPC) do A soạn, B vẽ ô nếu cần.
- Bước 2: đội, chat chung, sổ tên toàn cục (nếu chọn A).
- Bước 3: bí cảnh theo đội.
- Bước 4: thử tải liên phòng (C). Tiêu chí đo (cách đã đo ở #120 / #125):
  - **Ngân sách tổng:** tổng tick của mọi phòng trong một tiến trình < 10 ms cho ca N bản đồ x M người (ví dụ 3 x 100), đo thêm độ trễ vòng sự kiện, không chỉ thời gian tick; `bench-baseline.json` có khoá theo bản đồ để workflow hằng đêm so được.
  - **Độ trễ và byte mỗi lần chuyển bản đồ:** từ lúc gửi `travel` tới khi nhận state đầy đủ ở phòng đích (p50 / p95); state đầy đủ ban đầu (~4.8 KB / lần ở #125) x tần suất qua cổng.
  - **Không mất dữ liệu:** tu vi, Linh thạch, túi đồ, nhiệm vụ trước và sau mỗi lần chuyển y hệt nhau, qua hàng nghìn lần chuyển.
  - **Không nhân bản nhân vật:** hai client cùng mã nhân vật đua vào hai bản đồ -> đúng một bên vào; người đang chờ nối lại (`ghosts`) mà vào bản đồ khác bằng mã đó thì bên chờ bị huỷ, lưu đúng một lần.
  - **Rớt mạng giữa lúc chuyển** (sau khi phòng cũ lưu, trước khi vào phòng đích): không kẹt trong sổ tên toàn cục, vào lại được.
  - **Rò rỉ:** tổng `online` của mọi phòng về đúng số người thật; số phòng bí cảnh về 0 sau khi hết giờ / hết người (không còn hẹn giờ treo); VmRSS sau N chu kỳ tạo / huỷ phòng tạm không tăng quá ngưỡng (như `--leak` của #125).

## 6. Cần người dùng chọn
1. **A hay B** (mục 3)? Khuyến nghị A nếu muốn có bí cảnh trong M3.
2. Có chấp nhận **một người chỉ ở một phòng một lúc**, chat thế giới cần kênh riêng, đội liên bản đồ chỉ hiện ở bản đồ cùng phòng (A)?
3. Bản đồ thứ hai là khu săn thường (cùng cách chơi) hay có luật riêng (ví dụ cấm bay / PK sau này)?
4. Bí cảnh mở cho một người hay chỉ cho đội?

Khi chưa có trả lời, A chỉ làm **Bước 0** (không đổi gì người chơi thấy).
