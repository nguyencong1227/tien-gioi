# Thiết kế Bí cảnh (M3 bước 4: phòng tạm theo đội)

> Tài liệu thiết kế do Dev A soạn cho B và C review, trước khi viết mã. Quyết định gốc của người dùng (10/11/2026, `~/TT/orchestra/QUYET_DINH_M3.md`): bí cảnh là **bước 4** của M3, "phòng tạm theo đội". Dựa trên bước 1 (mỗi bản đồ một phòng Colyseus, `docs/THIET_KE_NHIEU_BAN_DO.md`), tổ đội (`Hub.parties`) và luân hồi (`docs/THIET_KE_LUAN_HOI.md`). Hợp đồng `shared/` ở mục 7; chia PR ở mục 9; câu hỏi cho người dùng ở mục 10.

## 1. Mục tiêu và phạm vi
- Một **đội** (2-4 người) vào một **phòng riêng** của đội, đánh quái nhỏ rồi **trùm** trong thời hạn; thắng thì nhận thưởng, hết giờ / chết hết / rời hết thì phòng tự huỷ và mọi người về chỗ vào. Không ai ngoài đội vào được, nên không tranh quái, không tranh đồ.
- Tái dùng tối đa cái đã có: hệ thống chiến đấu, quái, rơi đồ chia theo đội, chat đội xuyên phòng, luân hồi. **Không đổi giao thức gameplay** (di chuyển, đánh, kỹ năng giữ nguyên); thêm một nhóm tin nhắn nhỏ cho vòng đời bí cảnh.
- Bản đầu: **một bí cảnh** (`linh_hu`, tên có thể đổi khi soạn nội dung), một trùm, một bảng thưởng. Dữ liệu theo bảng `DUNGEONS` nên thêm bí cảnh sau chỉ là thêm dữ liệu.
- Ngoài phạm vi: nhiều tầng, hàng đợi ghép đội tự động, bí cảnh kéo dài nhiều phiên, xếp hạng tốc độ, khoá đồ.

## 2. Hiện trạng đã đọc mã (cái để tái dùng)
- `defineRooms` đăng ký mỗi bản đồ một tên phòng (`roomNameOf(mapId)`) với `WorldRoom` + `{ mapId }`; `WorldRoom.autoDispose = false`; client không tạo được phòng lạ (tên lạ bị Colyseus từ chối).
- Đi qua cổng: `systems/travel.ts` kiểm, `WorldRoom.travel` lưu bản ghi đích rồi gửi `TravelToMsg { mapId }` và ngắt kết nối (mã 4000); client `joinWithRedirect`. `onAuth` so `mapId` đã lưu với phòng (`JOIN_WRONG_MAP`).
- `Hub` (một tiến trình): `worlds` + `locate(key)` tìm người ở phòng khác, `parties` (sổ đội khoá theo đạo hiệu viết thường, sống qua việc đổi phòng), `chat` toàn server.
- `World` mang `map`; `spawnInitial` / `topUpMonsters` đọc `map.monsterCapOf`; quái có `boss?: true` (`mang` / Xích Mãng, 4000 HP). `loot.ts` chia chủ đồ rơi theo đội (`lootOwner`, `sameParty`). `LifeCounters.bossKills` đã nuôi điểm luân hồi (`DUYEN_BOSS_EACH`, trần `DUYEN_BOSS_CAP`).
- `WorldRoom.persist(p, c, at?)`: tham số `at` ghi bản đồ + chỗ xuất hiện thay cho vị trí hiện tại (dùng khi qua cổng): đúng thứ ta cần để bí cảnh **không bao giờ ghi vị trí trong bí cảnh** vào file lưu (mục 4.3).
- Chết (luân hồi): `beginLimbo` -> Hoàng Tuyền -> đầu thai luôn ở Lạc Hà Trấn (`THIET_KE_LUAN_HOI.md` mục "Chết ở bản đồ / phòng khác, trong đội, trong bí cảnh").

## 3. Trải nghiệm (luồng người chơi)
1. Ở Lạc Hà Trấn có NPC **Thủ Môn Bí Cảnh** (dữ liệu NPC mới trong `shared/`). Chỉ **đội trưởng** (`Party.leader` của `Hub.parties`) thấy nút "Mở bí cảnh" trong hộp thoại; người ngoài đội hoặc chưa đủ điều kiện thấy lý do bằng toast.
2. Đội trưởng bấm mở: server kiểm điều kiện (mục 5), tạo một **lần chạy** (`run`) và phòng, rồi gửi lời mời `DungeonInviteMsg` cho **từng thành viên đang online** (dù đang ở bản đồ nào; qua `Hub.locate`). Mỗi người có `DUNGEON_INVITE_MS` (60 giây) để bấm "Vào" (`dungeonEnter`).
3. Ai bấm "Vào": server kiểm lại, lưu nhân vật với **chỗ xuất hiện = cổng vào ở Lạc Hà** (không phải trong bí cảnh), đưa ra khỏi phòng cũ và gửi `TravelToMsg { mapId, roomId }` (mới: `roomId`). Client `joinById(roomId, ...)`.
4. Trong phòng: khu vào an toàn (không quái) ở phía nam, càng lên bắc càng nhiều quái nhỏ, **trùm ở hang phía bắc**. HUD có đồng hồ đếm ngược, số quái còn lại, thanh máu trùm. Quái nhỏ không hồi sinh (dọn một lần).
5. **Thắng:** hạ trùm -> phát thưởng (mục 6), mở `DUNGEON_LOOT_MS` (60 giây) để nhặt đồ, rồi đưa mọi người về cổng vào. **Thua:** hết giờ, hoặc mọi người đã chết / rời -> không thưởng, về cổng vào (người chết đã đầu thai ở Lạc Hà theo luật chung).
6. Mọi trường hợp phòng đều tự huỷ khi trống.

## 4. Kiến trúc

### 4.1 Bản đồ và dữ liệu
- `MapDef` thêm trường `kind?: "world" | "dungeon"` (thiếu = `world`) và, cho bí cảnh, `dungeonId`. Bản đồ bí cảnh nhỏ (64x64 ô), sinh theo seed như mọi bản đồ, **không có trấn**: có `safeZone` ở cổng vào thay `town` (thêm cách khai báo `entry` vào `GameMap` thay vì chép công thức; xem quy ước "số đo bản đồ vào `GameMap`").
- `shared/src/dungeon.ts` (PR 4a): `DungeonDef { id, name, mapId, entryMapId, entryPortal, partyMin, partyMax, minStep, timeLimitMs, mobs: { kind, count }[], boss: kindId, reward: DungeonReward }`, bảng `DUNGEONS`, `dungeonOf(id)` (tra bằng `byId`-an-toàn: id lạ trả `undefined`), các hằng thời gian (`DUNGEON_INVITE_MS`, `DUNGEON_LOOT_MS`...), kiểu tin nhắn (mục 7).
- Trùm: một loại quái mới trong `MONSTERS` (`boss: true`, **không** sinh ở bản đồ thường: `minDanger` > 1, hoặc cờ `dungeonOnly`) để `spawnInitial` của bản đồ thường không đụng tới. Số liệu cân bằng do A tính bằng `can-bang` (mục tiêu: đội 3 người ở ngưỡng `minStep` hạ trùm trong 5-8 phút; một người gần như không hạ được) và ghi vào `docs/CAN_BANG.md`.

### 4.2 Phòng và vòng đời
- Mỗi bí cảnh một **tên phòng** (`roomNameOf("bi_canh_linh_hu")`) đăng ký trong `defineRooms` với `WorldRoom` + `{ mapId, dungeon: true }`. Khác phòng thường: `autoDispose = true`, `maxClients = partyMax`.
- **Chỉ server tạo phòng** (`matchMaker.createRoom(name, { runId })`); client vào bằng `joinById(roomId)` nên không thể tự tạo phòng bí cảnh bằng `joinOrCreate` (chống kẻ xấu mở hàng nghìn phòng).
- **Sổ lần chạy `Hub.runs`** (cạnh `Hub.parties`; logic ở `systems/dungeon.ts`, không đụng Colyseus `Room` như mọi system): `Run { id, dungeonId, roomId, members: Set<khoá đạo hiệu>, leader, phase: "gathering" | "running" | "won" | "lost", openedAt, startedAt, deadline }`. Mỗi người chơi tối đa **một** run đang mở (chỉ mục theo khoá đạo hiệu). Tổng số run mở tối đa `MAX_DUNGEON_RUNS` (chống đầy tiến trình); đầy thì "mở bí cảnh" trả toast "bí cảnh đang đông, thử lại sau".
- Pha: `gathering` (từ lúc mở tới khi có người đầu tiên vào; hết `DUNGEON_INVITE_MS` mà không ai vào thì huỷ run và phòng) -> `running` (người đầu tiên vào bắt đầu đồng hồ `timeLimitMs`; người vào muộn vẫn vào được tới hết hạn mời) -> `won` / `lost` -> dọn.
- Hẹn giờ bằng `room.clock` của Colyseus (huỷ trong `onDispose`, không để hẹn giờ treo), và `w.now` cho đồng hồ mô phỏng.

### 4.3 Lưu nhân vật: không bao giờ kẹt trong bí cảnh
- **File lưu giữ `mapId` / vị trí là chỗ vào ở Lạc Hà suốt thời gian ở bí cảnh.** `persist` của phòng bí cảnh luôn gọi với `at = chỗ vào` (tu vi, túi đồ, Linh thạch, nhiệm vụ vẫn lưu bình thường; chỉ vị trí bí cảnh không ghi). Hệ quả: server sập / rớt mạng quá hạn / đóng tab -> lần sau đăng nhập về Lạc Hà, không bao giờ cần "vào lại phòng đã chết". Không cần trường `dungeon` trong file lưu cho vị trí.
- Rớt mạng ngắn: cơ chế `allowReconnection` (#116) giữ nguyên (nhân vật bất tử trong lúc chờ như ở thế giới thường).
- `onAuth` của phòng bí cảnh: danh tính xác thực như thường, rồi **bắt buộc có tên trong `Run.members` và run còn `gathering` / `running`**, ngược lại `ServerError(JOIN_NOT_IN_RUN)` (mã mới 422). Với phòng bí cảnh bỏ qua kiểm `JOIN_WRONG_MAP` (file lưu để ở bản đồ vào, ngoài bí cảnh) và nhân vật **không** tạo mới ở đây.
- Trạng thái đếm thưởng theo ngày (mục 6) là một trường nhỏ `dungeonDaily?: { day: string; rewards: number }` trong `SavedPlayer`, nạp qua hàm làm sạch, `kiem-save` kiểm.

### 4.4 Chết, luân hồi, đội
- **Chết trong bí cảnh = luật chung** (Hoàng Tuyền, đầu thai ở Lạc Hà), run vẫn tiếp tục với người còn lại. Đây là quyết định đã ghi ở `THIET_KE_LUAN_HOI.md`; **câu hỏi 1 ở mục 10** hỏi người dùng có muốn nới cho bí cảnh không.
- Đội: `Hub.parties` dùng chung nên chat đội `/p` đi xuyên phòng (đã có). **Thành viên run cố định lúc mở** (người rời đội giữa chừng vẫn ở trong run, người mới vào đội không được vào). Người trong run không nhận lời mời / không `travel` sang bản đồ khác (server chặn: đang trong run).
- `Hub.worlds` có cả phòng bí cảnh nên `locate` thấy người ở trong (mời đội, chat).

### 4.5 Hiệu năng
- Phòng bí cảnh là một `World` thật: tick 20 lần/giây, ~20-30 quái nhỏ + 1 trùm, tối đa 4 người. Ước ~0.2-0.3 ms mỗi tick; `MAX_DUNGEON_RUNS` (mặc định 10) giữ tổng dưới ngân sách 10 ms cùng các phòng thường. **Phòng trống phải huỷ ngay** (`autoDispose`), không tick quái "ngủ" khi không ai ở đó.
- Không thêm trường vào state chung; tin `dungeonState` gửi **một lần mỗi giây** (và khi đổi pha / trùm đổi máu theo bậc 5%), không mỗi tick. `sendNear` / vùng nhìn dùng như cũ.
- C đo: N run đồng thời (tổng tick, độ trễ vòng sự kiện), chu kỳ tạo / huỷ phòng (rò `VmRSS` như `--leak` của #125, số `Hub.runs` / hẹn giờ về 0), đua vào phòng (hai lần `dungeonEnter` cùng lúc, vào khi run vừa hết hạn).

## 5. Điều kiện mở và chống lạm dụng (server quyết định, client chỉ gửi ý định)
Mọi tin kiểm kiểu và giá trị hữu hạn, đăng ký bằng `this.on(...)` (có giới hạn tần suất), và:
- `dungeonOpen { dungeonId }`: id có trong `DUNGEONS`; người gửi đứng trong tầm NPC Thủ Môn (`nearNpc`, như `shop`); là **đội trưởng** của đội có `partyMin <= số thành viên <= partyMax`; mọi thành viên đều **online**, **còn sống**, **không trong run khác**, `stepOf(realm, tier) >= minStep`, **không đang chờ nối lại**; còn chỗ ở `MAX_DUNGEON_RUNS`; hồi chiêu mở `DUNGEON_OPEN_COOLDOWN_MS` mỗi đội trưởng.
- `dungeonEnter { runId }`: có lời mời cho người này, chưa hết hạn, run còn `gathering` / `running`, người gửi chưa ở trong phòng đó, còn sống, không đang trong combat lock (`TRAVEL_COMBAT_LOCK_MS`).
- Không cho: tự mời người ngoài đội, vào run của người khác bằng `runId` đoán được (`runId` ngẫu nhiên 128 bit, kiểm thành viên ở cả `dungeonEnter` lẫn `onAuth` phòng), mở nhiều run một lúc, vào bằng `joinById` thẳng (chặn ở `onAuth`).
- **Thưởng chống cày:** mỗi nhân vật chỉ **nhận thưởng hoàn thành tối đa `DUNGEON_DAILY_REWARDS` (mặc định 3) lần mỗi ngày** (khoá ngày như nhiệm vụ hằng ngày, `dungeonDaily`); hết lượt vẫn vào được nhưng chỉ có đồ quái nhỏ rơi. Duyên từ trùm đã bị trần `DUYEN_BOSS_CAP` mỗi kiếp nên không cày Duyên vô hạn được.

## 6. Thưởng
- Khi trùm chết, **mỗi thành viên còn sống, đang ở trong phòng và đã gây sát thương (`damageBy`) cho trùm** nhận: Linh thạch cố định (qua `changeCoin`, không `splitCoin`), một bảng đồ (vật phẩm `ITEM_BY_ID` theo xác suất, vào túi; túi đầy thì rơi xuống đất chủ là người đó), `life.bossKills++` (nuôi điểm luân hồi), nhiệm vụ "hạ trùm" nếu có (`quests` đã nghe sự kiện hạ quái). Tu vi từ trùm chia theo sát thương như quái thường.
- Phần thưởng hoàn thành tính MỘT lần mỗi nhân vật mỗi run (cờ trong `Run`), và chỉ khi còn lượt trong ngày.
- Số liệu cụ thể (Linh thạch, bảng đồ) do A đặt trong `can-bang` với mục tiêu: một lượt thưởng bằng ~15-20 phút săn quái cùng bậc, để bí cảnh là lựa chọn chứ không phải đường duy nhất.

## 7. Hợp đồng `shared/` (PR 4a, chỉ sửa `shared/`, B và C review)
- `MapDef.kind`, `GameMap.entry` (khu vào an toàn) + cách khai báo bản đồ bí cảnh; `shared/src/dungeon.ts` như mục 4.1.
- `TravelToMsg` thêm `roomId?: string` (có thì client `joinById`, không thì `joinOrCreate(roomNameOf(mapId))` như cũ; client cũ bỏ qua trường lạ). `joinWithRedirect` (B) hỗ trợ `roomId`.
- Client -> server: `DungeonOpenMsg { dungeonId }`, `DungeonEnterMsg { runId }`, `DungeonLeaveMsg {}` (rời sớm, về cổng vào).
- Server -> client: `DungeonInviteMsg { runId, dungeonId, from, expiresInMs }`, `DungeonStateMsg { phase, deadlineInMs, mobsLeft, boss: { hp, maxHp } | null, members: { name, alive }[] }`, `DungeonEndMsg { result: "won" | "lost", reason, reward?: { coin, items } }`.
- `JOIN_NOT_IN_RUN = 422`. Hàm thuần có test: `dungeonOf`, `canOpenDungeon(party, dungeon)` (điều kiện có thể kiểm ở client để ẩn nút), `rewardEligible(...)`.

## 8. Giao diện (B)
Hộp thoại NPC có nút "Mở bí cảnh" (chỉ đội trưởng) kèm danh sách thành viên và điều kiện còn thiếu; hộp mời vào (đếm ngược `DUNGEON_INVITE_MS`, nút Vào / Từ chối); HUD bí cảnh (đồng hồ, quái còn lại, thanh máu trùm, danh sách đội còn sống); màn kết quả thắng / thua (thưởng); màn chuyển cảnh khi vào / ra; bản đồ nhỏ của bí cảnh. Ảnh 1280x720 và 390x844 như mọi PR giao diện; mọi chỗ DOM dùng `textContent`; E2E thật (kịch bản như `npm run e2e:tai-khoan`) cho luồng mở -> vào -> hạ trùm (có lệnh `/give` / đặt máu trùm thấp ở chế độ không production để kiểm).

## 9. Chia PR và phân công
| PR | Nội dung | Người |
|---|---|---|
| 4a | `shared/`: hợp đồng mục 7, `DUNGEONS`, bản đồ bí cảnh, quái trùm (dữ liệu), `TravelToMsg.roomId` | A |
| 4b | Server: `Hub.runs` + `systems/dungeon.ts` (mở, mời, vào, pha, hẹn giờ, dọn), `defineRooms` + `autoDispose` + `onAuth` run, `persist` không ghi vị trí bí cảnh; **chưa có trùm / thưởng**; test + đột biến; bench 0.0% (không ai trong bí cảnh) | A |
| 4c | Server: trùm, thắng / thua, thưởng, lượt thưởng mỗi ngày, `dungeonDaily` (+ làm sạch), `can-bang` mô phỏng | A |
| 4d | Client: NPC / lời mời / HUD / kết quả / `joinById` | B |
| 4e | Công cụ: bot `--dungeon`, thử tải N run + rò rỉ + đua vào, `kiem-save` cho `dungeonDaily`, mục mới trong `LOAD_TEST.md` | C |
- Thứ tự: 4a -> (4b song song 4d với API giả như #150) -> 4c -> 4e; E2E thật của A khi 4b + 4c + 4d vào.
- Mỗi PR server có test đơn vị (`World` giả) và tích hợp (phòng Colyseus thật), thử đột biến (bỏ kiểm thành viên ở `onAuth`, bỏ giới hạn số run, bỏ chỉ lưu vị trí vào, bỏ lượt thưởng ngày, phát thưởng hai lần), và **kiểm "không kẹt"**: giết tiến trình giữa run rồi đăng nhập lại phải về Lạc Hà.

## 10. Câu hỏi mở (A chọn hướng an toàn, người dùng đổi nếu muốn)
1. **Chết trong bí cảnh có mất kiếp (luân hồi) không?** Hiện theo luật chung (có), như `THIET_KE_LUAN_HOI.md`. Đây là chỗ dễ làm người chơi mới nản: lựa chọn thay thế "bí cảnh không mất kiếp: chết thì bị đưa ra ngoài, mất lượt thưởng, nhưng không luân hồi" (giống ngoại lệ đã dành cho chết vì PK). **Đề xuất của A: giữ luật chung cho bản đầu** vì đó là quyết định đã ghi, và mở rộng ngoại lệ sau nếu thử nghiệm cho thấy quá khắc nghiệt.
2. **Cỡ đội tối thiểu:** mặc định `partyMin = 2` (bí cảnh là chơi cùng nhau); đặt 1 nếu muốn cho đi một mình.
3. **Lượt thưởng mỗi ngày** `DUNGEON_DAILY_REWARDS = 3`: số hợp lý (giữ bí cảnh là phần thưởng chứ không cày) hay bỏ giới hạn?
4. **Nội dung:** tên bí cảnh / trùm / đồ thưởng là của Tiên Giới (A soạn, không mượn tên từ game khác); trùm mới hay dùng lại Xích Mãng với số liệu mạnh hơn? **A đề xuất trùm mới** để bí cảnh có cái riêng và không lẫn với trùm ngoài hoang.
