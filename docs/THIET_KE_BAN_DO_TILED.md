# Thiết kế: bản đồ bằng JSON của Tiled, MỘT nguồn cho client và server (QUYET_DINH_M3 mục 62, giai đoạn 2)

> Người viết: Dev A (phần server). Phần client (vẽ từ JSON) là việc của Dev B, công cụ dòng lệnh của Dev C, dựng bản đồ thật của Dev E / G. Tài liệu này là ĐẶC TẢ: chưa đổi dòng mã nào. Mỗi lát cắt ở mục 6 là một PR riêng.

## 1. Mục tiêu và ngoài phạm vi

**Mục tiêu**
1. Bản đồ là TỆP DỮ LIỆU (JSON xuất từ Tiled), không còn là hàm sinh theo `seed`. Client vẽ từ tệp; server đọc CÙNG tệp để lấy va chạm, khu an toàn, cổng, hang trùm, vùng sinh.
2. Tự bo góc (bờ nước, vách đá, đường đất, bậc) bằng terrain / autotile: người và agent chỉ khai ô LOGIC (nước / cây / đá...), công cụ dòng lệnh sinh lớp hình đã bo góc. Người dùng vẫn mở tệp bằng Tiled (Windows) để chỉnh tay.
3. Không đổi hành vi hiện có ở lát cắt đầu: bốn bản đồ chuyển sang JSON phải cho CÙNG `tiles`, cùng cổng, cùng `dangerAt` (test so từng byte), nên không cần tăng `PROTOCOL_VERSION`, vị trí nhân vật đã lưu vẫn đúng.

**Ngoài phạm vi (giai đoạn này)**
- Bí cảnh (`dungeon`) và đấu trường chặn đường (`arena`) GIỮ sinh theo `seed` (phòng tạm, không cần tay nghề dựng); chỉ bản đồ `world` chuyển sang JSON. Chuyển sau nếu người dùng muốn.
- Ngoại hình theo trang bị (giai đoạn 3), nhạc / SFX, đổi `TILE`.
- Bản đồ vô hạn (`infinite`), nhiều tầng độ cao, ô chéo (isometric).

## 2. Hiện trạng (đã đọc mã, 21/11/2026)

- `shared/src/map.ts`: `MapDef` (id, name, `seed`, `w`, `h`, `town`, `portals`, `lair`, `monsterCap`...) + `generate(def)` (nhiễu giá trị theo `seed` -> `Uint8Array` các `T`: Grass / TallGrass / Dirt / Water / Tree / Rock / Stone / Sand; viền là đá; trấn là đá lát; bốn đường đất toả ra) + lớp `GameMap` (va chạm `tileAt` / `isBlockedPx` / `circleBlocked` / `moveWithCollision`, `inTown`, `inSafe`, `dangerAt`, `portal`, `portalNear`, kiểm `checkLair` / `checkPortals` / `checkMonsterCap` lúc dựng).
- Client và server TỰ SINH ô từ `seed` (không gửi bản đồ qua mạng); `getMap(id)` là cổng duy nhất lấy `GameMap`.
- Nơi dùng `GameMap.tiles` / va chạm: server `systems/monsters.ts`, `ambush.ts`, `nav.ts` (lưới tìm đường dựng từ `GameMap` theo bán kính thân, mục 48), `world-boss.ts`; client `gfx/map-water.ts`, `gfx/map-decor.ts`, `map-overview.ts`, `scenes/WorldScene.ts`. `dangerAt` cũng được dùng ở quy mô quái sinh (độ nguy hiểm tăng theo khoảng cách tới trấn).
- Quy tắc đã có (AGENTS.md): server / client KHÔNG import hằng bản đồ toàn cục, chỉ nhận `GameMap`; `server/scripts/no-global-map-imports.test.ts` canh. Thiết kế này GIỮ nguyên quy tắc.

Kết luận quan trọng: mọi nơi dùng bản đồ đều đi qua `GameMap`, nên chỉ cần đổi CÁCH DỰNG `GameMap` (từ `generate(def)` sang đọc tệp). `nav.ts`, `monsters.ts`, `ambush.ts`, va chạm dự đoán của client... không phải sửa.

## 3. Nguyên tắc

1. **Một nguồn:** tệp SOẠN `shared/maps/<id>.json` (Tiled JSON, đủ lớp, mở bằng Tiled được). Client và server dùng các bản CHẠY sinh ra từ đúng tệp đó (mục 4a), khớp từng byte (test); không ai viết tay hai bản.
2. **Tách lớp LOGIC khỏi lớp HÌNH.** Va chạm / loại ô lấy từ lớp logic; lớp hình (nền bo góc, trang trí, phủ trên đầu) chỉ để vẽ. Nhờ vậy đổi đồ hoạ (giai đoạn 1) hay vẽ lại bo góc không bao giờ đổi va chạm một cách vô tình.
3. **`T` giữ làm kiểu LOGIC** (8 loại hiện có, `BLOCKING` không đổi) để mọi hệ thống server dùng tiếp; thêm loại logic mới thì thêm vào `T` + `BLOCKING` rồi mới dùng trong tệp.
4. **Server quyết định, không tin tệp của client:** server chỉ tin tệp trong ảnh Docker của chính nó. Client dùng tệp CÙNG bản dựng để dự đoán; bản client cũ trong bộ nhớ đệm có thể lệch va chạm: xử lý bằng `PROTOCOL_VERSION` (mục 7).
5. **Kiểm tra bằng dữ liệu thật** (mục 5): mọi bất biến của bản đồ là hàm thuần ở `shared/`, chạy trong `npm run check:content` (mục 61.2) và test, không chỉ khi dựng.

## 4. Định dạng tệp

Tiled JSON (`.tmj` xuất JSON; lưu `.json`), `orientation: "orthogonal"`, `infinite: false`, dữ liệu ô là MẢNG số (không nén, không base64 / zlib: agent đọc / ghi được bằng mã, `git diff` đọc được). `tilewidth` / `tileheight` = **16** (kích thước ô ẢNH của Ninja Adventure); `width` / `height` = số ô, bằng `MapDef.w` / `h` hiện tại (96 x 96) nên LƯỚI LOGIC KHỚP 1:1 với lưới hình: client vẽ phóng ×2 (nguyên số) thành đúng `TILE = 32` px của thế giới, không đổi bất cứ hằng vật lý nào. (Nếu B chọn hướng khác ở `docs/HUONG_DO_HOA_MOI.md`: cỡ ô hình khác thì `GameMap` chỉ đọc `width` / `height` và thuộc tính `tileScale`; không phụ thuộc cỡ ảnh.)

**Thuộc tính bản đồ** (`properties` ở gốc): `id` (chuỗi, phải khớp tên tệp), `name`, `townName`, `wildName`, `kind` (`"world"`), `monsterCap` (chuỗi JSON `{"id_quai": số}`), `schema` (số nguyên, hiện 1: tăng khi đổi định dạng).

**Lớp ô (tilelayer)**
| Tên lớp | Dùng cho | Ai đọc |
|---|---|---|
| `logic` | loại ô `T`: mỗi ô là `firstgid + T` của tileset tên `logic` (8 ô theo thứ tự enum `T`, để sửa tay bằng Tiled thấy màu; Tiled dùng 0 cho ô TRỐNG nên `firstgid` >= 1 và 0 / cờ lật không hợp lệ) | server + client (va chạm, dự đoán, bản đồ nhỏ) |
| `ground`, `decor`, `over` | hình: nền (đã bo góc), trang trí, phủ trên đầu nhân vật | CHỈ client |

**Lớp đối tượng (objectgroup)** `objects`; mỗi đối tượng có `type` + thuộc tính:
- **Mọi** đối tượng `town` / `lair` / `portal` PHẢI là đối tượng ĐIỂM (`point: true`): Tiled ghi `x, y` của elip / chữ nhật là GÓC TRÊN TRÁI của khung nên coi là tâm sẽ đặt lệch im lặng; `tiledViolations` từ chối elip / chữ nhật (hình elip / chữ nhật chỉ dành cho `spawnZone` ở S5).
- `town` (điểm đặt trong ô tâm + thuộc tính `r` tính bằng Ô): khu an toàn (`MapDef.town`). `lair` cùng quy ước.
- `portal` (đối tượng ĐIỂM đặt ở tâm cổng): `id`, `name`, `toMap`, `toPortal`, `r`, `safeR`, `spawnX`, `spawnY`. MỌI toạ độ / bán kính của đối tượng tính bằng px CỦA TỆP (`tilewidth`); `parseTiledMap` nhân `TILE / tilewidth` ra px thế giới, nên tệp tự nhất quán khi mở bằng Tiled.
- `lair` (bí cảnh / hang cố định, nếu có).
- `spawnZone` (lát cắt S5, tuỳ chọn; đã làm): hình **chữ nhật hoặc elip** (KHÔNG điểm / đa giác / đường / chữ, KHÔNG xoay (`rotation` khác 0), KHÔNG đối tượng ô (`gid`): Tiled xoay quanh góc trên trái và đặt `x, y` của đối tượng ô ở góc DƯỚI trái nên đọc như khung thẳng thì vùng lệch im lặng; `tiledViolations` từ chối cả bốn), `x, y` là GÓC TRÊN TRÁI của khung như Tiled ghi (khác `town` / `portal` là điểm tâm), `width` / `height` >= một ô và khung nằm trong bản đồ bỏ viền núi một ô (lỗi gom ở `errors`, cùng luật `GameMap`); thuộc tính `monster` (id quái, bắt buộc) và `max` (số nguyên >= 1, tuỳ chọn: số con cùng loài tối đa đang sống TRONG vùng). Toạ độ px của tệp, `parseTiledMap` nhân `TILE / tilewidth`. Luật chạy (server): loài có ÍT NHẤT MỘT vùng thì chỉ sinh trong vùng của nó (`zoneSpawnSpot`: chọn vùng theo DIỆN TÍCH trong số vùng còn chỗ `max`, bốc điểm trong khung, lọc: đúng hình, không đè ô chặn theo cỡ thân, ngoài khu an toàn đệm 160 px như cách cũ, trùm thêm `bossSpawnOk`, rải đều `SPAWN_SPREAD_PX`; KHÔNG xét `dangerAt` / `minDanger`: vùng là quyết định rõ ràng của người soạn); hết lượt thử thì lần này KHÔNG sinh (`topUpMonsters` thử lại nhịp sau), KHÔNG rơi về cách cũ vì sẽ đặt quái ra ngoài vùng đã giới hạn. Loài không khai vùng nào sinh theo cách cũ (không đổi hành vi, không thêm `Math.random`: bốn bản đồ thật chưa khai vùng nên bench / mốc không đổi). Trùm thế giới theo giờ (`world-boss.ts` `findSpot`) cũng dùng vùng của loài trùm đó ở bản đồ, BỎ `max` (trùm thế giới là thêm, không chiếm chỗ quái thường). Kiểm trên dữ liệu: `spawnZoneViolations` (`server/src/systems/map-checks.ts`, mục 5.5) cùng `GameMap` (loài lạ, khung, viền núi, `max`).

`dangerAt` GIỮ công thức theo khoảng cách tới `town` (không thành dữ liệu ở giai đoạn này).

## 4a. Hai bản CHẠY: logic (nhập tĩnh) và hình (gói tải theo nhu cầu)  *(B góp ý ở #1201, đã đo)*

`getMap(id)` ở client là ĐỒNG BỘ (`main.ts` dựng `WorldScene` ngay sau `getMap(mapId)`; nhiều nơi gọi `getMap(DEFAULT_MAP_ID)!`), nên phần logic PHẢI có sẵn đồng bộ; còn lớp hình lớn thì không được vào gói khởi động. Số đo thật của B (lớp logic `firstgid + T` dựng từ 4 bản đồ hiện có, gzip -9): lac_ha 18,5 KB -> **2,0 KB**; hac_phong 24,6 -> 2,7; am_suong 28,7 -> 3,2; han_van 32,8 -> 3,7; **tổng 104,6 KB raw / 11,6 KB gzip** (nhập tĩnh được). Một lớp hình nhiều gid gzip 10-18 KB MỖI lớp mỗi bản đồ; 3 lớp x 4 bản đồ có thể 100-200 KB, vượt `startupGzipKb 220`.

| Tệp | Nội dung | Ai tạo | Ai dùng |
|---|---|---|---|
| `shared/maps/<id>.json` | SOẠN: đủ lớp (`logic`, `ground`, `decor`, `over`) + `objects`, tileset nhúng; mở bằng Tiled | người / agent (S4 `map:build` chỉ điền lớp hình) | công cụ |
| `shared/maps/<id>.logic.json` | BẢN CHẠY logic: chỉ lớp `logic` + `objects` + thuộc tính (có `seed` trang trí) | `map:bake` / `map:build` | server: NHẬN lúc `defineRooms` (`adoptTiledMapFiles`, `shared/src/map-files.ts`); client: **S3a ĐÃ LÀM**: nhận trong chunk game tải SAU màn đăng nhập (`createGameLoader` ở `client/src/game-modules.ts` nhập động `shared/src/map-files` rồi gọi `adoptTiledMapFiles()` TRƯỚC khi lời hứa nạp xong, nên trước `new WorldScene` / `getMap`), KHÔNG nhập vào gói khởi động |
| `visual.json` (gói `map:<id>`) | BẢN CHẠY hình: `ground` / `decor` / `over` + tileset NHÚNG | `map:build` | client, qua `ensurePack` / `build-packs.mjs` có sẵn của M7.15 (`gfx/packs.ts`: precache, bản native, thử lại; gói chỉ BỔ SUNG, thiếu gói thì vẽ cách cũ) |

**Vì sao KHÔNG nhập tĩnh vào `shared/src/map.ts` (A đo ở S2):** bốn tệp logic thêm ~16 KB gzip vào chunk KHỞI ĐỘNG (195,6 -> 212,9 KB; `startupGzipKb` 220) và đẩy TỔNG JS từ 528,3 lên 544,5 KB, vượt trần 540 KB (giữ ở #1088, có test khoá) mà chỉ để dùng SAU khi đăng nhập; dữ liệu đã nén tốt nhất (CSV gzip ~11,4 KB, RLE không hơn). Nên `map.ts` KHÔNG nhập JSON: `MAPS` / `MAP_BY_ID` khởi đầu là định nghĩa sinh theo `seed` và `adoptTiledMaps(nguồn)` thay từng mục bằng bản dựng từ tệp (sửa tại chỗ `MAPS`, bỏ `GameMap` đã nhớ); `map-files.ts` (nhập tĩnh 4 tệp) KHÔNG nằm trong `index.ts` và chỉ server (`defineRooms`) nhập ở S2. Ở S2 client chưa nhận tệp nên vẫn sinh theo `seed` (cùng từng byte, test giữ). **S3a (B, #1206, đã làm): từ đây client PHẢI nhận tệp** (đường nhận ở trên); S3a là TIỀN ĐỀ của S6: chưa có S3a thì KHÔNG ai sửa tay bản đồ thật (client sinh theo `seed`, máy chủ theo tệp: lệch bản đồ). Ngân sách: tổng JS 528,65 -> 543,82 KB (chunk `map-files` 13,55 KB gzip; gói khởi động 195,97 -> 198,81 KB), `totalJsGzipKb` nâng 540 -> 548 (A chốt, không làm RLE: thêm định dạng thứ hai, rủi ro lệch client / server). Test khoá: `client/src/map-files-client.test.ts` (sau khi tải chunk game, `getMap(id)` ở client = bản dựng từ tệp, từng ô và từng trường; tệp SỬA TAY khác `seed` được client thấy) và `client/src/game-modules.test.ts` (thứ tự nhận tệp, lỗi tải thì thử lại, `map-files` chỉ vào bằng `import()` động, máy chủ nhập cùng module). **`DEFAULT_MAP` lỗi thời sau khi nhận tệp (B bắt ở review #1212):** hằng này dựng MỘT lần lúc nạp module (từ `seed`) nên sau `adoptTiledMaps` `getMap(DEFAULT_MAP_ID)` là đối tượng KHÁC (cùng byte ở S2, nhưng ở S6 `DEFAULT_MAP` là bản cũ). Quy tắc: mã nguồn server / client / script KHÔNG nhập `DEFAULT_MAP` (thêm vào danh sách cấm của `no-global-map-imports`, đã chuyển mọi chỗ dùng sang `getMap(DEFAULT_MAP_ID)!`); các hàm tên cũ (`tileAt`, `isBlockedPx`...) tra `getMap` mỗi lần gọi. Ảnh chụp của `MAPS` ở mức module chỉ được giữ id và thứ tự (không đổi sau `adopt`), không giữ `portals` / ô. **Từ S3 client PHẢI nhận tệp (nhập `map-files` từ chunk game trước khi dựng cảnh); từ S6 (tệp bị sửa tay, khác bản sinh theo seed) việc nhận tệp ở client là BẮT BUỘC**: test "giống seed" gỡ cùng lúc, nên khi gỡ phải có sẵn đường nhận ở client (chặn quên).

Test: hai bản chạy khớp tệp soạn từng byte (nên vẫn "một nguồn"). **Trước S4** chưa có lớp hình nên tệp `<id>.logic.json` là tệp DUY NHẤT và `map:bake` (S2) chỉ ghi nó; tệp soạn đủ lớp xuất hiện cùng `map:build`, khi đó `<id>.logic.json` thành tệp SINH RA (thêm thuộc tính `generated: true`, test canh).

## 5. Kiểm tra (hàm thuần ở `shared/src/tiled.ts`, `tiledViolations(json, ctx)`)

Chạy trong test (mọi tệp `shared/maps/*.json`) và `npm run check:content`. Báo lỗi gọn `tệp + đối tượng`:
1. Cấu trúc: `schema`, `orientation`, `infinite`, kích thước lớp `logic` == `width * height`, mọi ô logic thuộc `firstgid .. firstgid + 7` (không 0, không cờ lật), tệp có lớp `logic` + `objects`. (Lớp hình kiểm ở `map:check` S4: kích thước == `width * height`, mọi gid thuộc tileset đã nhúng, cờ lật chỉ hợp lệ ở lớp hình, băm hai bản chạy khớp tệp soạn.)
2. **Cổng hai chiều:** `toMap` / `toPortal` tồn tại và trỏ ngược lại; id cổng duy nhất toàn game; `spawn` đi được, trong `safeR`, ngoài `r`; tâm cổng không nằm trên ô chặn (đã có trong `checkPortals`, chuyển thành hàm dùng chung).
3. Tâm `town` và `lair` đi được; trấn không phủ kín nửa bản đồ (điều kiện `dangerSpanPx > 0` đang có).
4. **Liên thông:** từ tâm trấn, loang theo lưới đi được nửa ô (cỡ thân người chơi, như `navClassOf`; KHÔNG dùng vùng chính của quái vì lưới đó cố ý loại khu an toàn) phải chạm TOÀN BỘ cổng (tâm + chỗ xuất hiện) và hang (S2: `server/src/systems/map-checks.ts`, bốn bản đồ thật đều qua); mọi `spawnZone` và mọi điểm sinh trùm theo cỡ thân TRÙM kiểm ở S5; không có ô đi được nào bị cô lập mà vẫn là chỗ sinh quái (mục 48: chống "đứng sau cây đánh trùm miễn phí").
5. **Vùng sinh:** không nằm trong ô chặn; trùm sinh sẵn <= `MAX_BOSSES_PER_MAP` (6, mục 56); vùng sinh trùm đủ rộng (cỡ thân + lề) và KHÔNG sát cây / đá (mục 48). **Đã làm ở S5 (`spawnZoneViolations`):** loài của vùng phải có trong `monsterCap` của bản đồ hoặc là trùm thế giới của lịch cho bản đồ này (nếu không vùng vô dụng và lưới tìm đường của loài không dựng sẵn); mỗi vùng >= `MIN_ZONE_SPOTS` (8) chỗ sinh hợp lệ (lưới nửa ô: đúng hình, không đè ô chặn theo cỡ thân, ngoài khu an toàn đệm 160 px; trùm thì còn `bossSpawnOkOn`); KHÔNG chỗ đứng được nào của vùng nằm trong TÚI KÍN = không tới được từ TÂM TRẤN theo cỡ thân loài đó, KỂ CẢ khi đi qua khu an toàn (loang như `reachabilityViolations`). Cố ý KHÁC `inMainRegion` (thành phần lớn nhất của lưới quái, coi khu an toàn là tường): trấn có thể cắt bản đồ làm hai nửa quái không qua lại được (Âm Sương Trạch: nửa nhỏ ~20 % diện tích, B đo ở review #1214) nhưng nửa nhỏ vẫn là đất MỞ, người chơi tới bằng cách đi qua trấn; chỉ khoảng đất BAO KÍN thật (kể cả phòng lớn) hay khe quá hẹp cho cỡ thân của loài đó mới là túi kín. Không cần ngưỡng kích thước. Trùm còn thêm `bossSpawnOkOn` (vẫn dùng `inMainRegion`, luật mục 48 từ trước): vùng trùm phải nằm ở vùng chính, tức NỬA thế giới chứa vùng chính của lưới quái: nửa nhỏ do trấn cắt hợp lệ cho quái thường nhưng KHÔNG cho trùm (B nêu ở review #1214); khi báo "chỉ có N chỗ sinh hợp lệ", lời báo nêu riêng số chỗ "sát cây / đá" và số chỗ "ngoài vùng chính của lưới quái" để người soạn biết sửa gì (chạy thật, `zoneSpawnSpot` vẫn sinh trùm ở vòng nới nếu vùng đó thật sự không có chỗ chặt: phần KIỂM DỮ LIỆU nghiêm hơn lúc chạy); nếu mọi vùng của một loài đều khai `max` thì tổng `max` >= `monsterCap`. Lấy mẫu theo lưới nửa ô nên khe hẹp hơn nửa ô có thể lọt (đủ cho vùng soạn tay theo ô). Bốn bản đồ thật chưa khai vùng nên chưa chịu kiểm này; S6 (từng bản đồ một) thêm vùng thì chạy kiểm trong test của bản đồ đó.
6. `monsterCap` chỉ chứa id quái CÓ THẬT (đã có `checkMonsterCap`).

## 6. Lát cắt (mỗi cái một PR, theo thứ tự)

| # | Việc | Ai | Hành vi đổi? |
|---|---|---|---|
| S1 | `shared/src/tiled.ts`: kiểu `TiledMap`, `tiledViolations` (cấu trúc, lớp logic, đối tượng: mục 5.1, 5.2 phần khai báo, 5.3 phần khai báo, 5.6 phần khai báo), `parseTiledMap(json, tile)`, `mapDefFromTiled`; `MapDef.tiles?` (ô dựng sẵn) để `GameMap` dựng từ tệp mà KHÔNG import ngược (tránh vòng import) và vẫn chạy mọi kiểm cũ (`checkPortals`, `checkLair`, `checkMonsterCap`). Test với mẫu nhỏ + đột biến mỗi luật + BỐN bản đồ thật đi vòng qua tệp (bản thu nhỏ của S2). | A | Không (không bản đồ nào dùng) |
| S2 | CÔNG CỤ `npm run map:bake` (thêm kiểm LIÊN THÔNG mục 5.4 + cổng hai chiều giữa các bản đồ mục 5.2 trên dữ liệu thật; bản đồ nào không qua thì BÁO cho A, không tự sửa bản đồ): xuất bốn bản đồ hiện có (sinh theo `seed`) ra `shared/maps/<id>.logic.json` (lớp `logic` = `tiles` hiện tại, `firstgid + T`; đối tượng ĐIỂM cổng / trấn / hang; chưa có lớp hình, mục 4a). Server NHẬN các tệp đó lúc `defineRooms` bằng `adoptTiledMaps` (mục 4a; client chưa nhận ở S2). Test SO TỪNG BYTE: `GameMap` từ tệp == `GameMap` sinh theo `seed` (`tiles`, `portals`, `townPx`, `lairPx`, `dangerAt` mẫu, `monsterCap`) cho cả 4 bản đồ. `generate` còn lại cho `dungeon` / `arena` và làm "đồng hồ chuẩn" của test. | A (công cụ có thể nhờ C) | KHÔNG: byte giống hệt |
| S3 | **S3a (nhận tệp logic ở client, tiền đề S6): ĐÃ LÀM (#1206 `Refs`); S3b (vẽ lớp hình): ĐÃ LÀM phía client (B, 23/11/2026; người dùng đã duyệt phần cảnh ở mục 67.1): `client/src/gfx/map-visual.ts` (kiểm `visual.json` không tin, nạp ảnh) + `WorldScene.refreshMapVisual / buildTiledVisual`; gói CHƯA có ảnh tileset thì vẽ cách cũ; ảnh thật vào gói `map:<id>` là PR riêng sau khi C sửa `map-builder.ts` (#1222).** Client vẽ từ `visual.json` (`tilemapTiledJSON`) nạp qua GÓI `map:<id>` có sẵn (`ensurePack`; KHÔNG `import.meta.glob` tự chế); thiếu gói thì vẽ cách cũ. Yêu cầu Phaser: tileset NHÚNG (`tilemapTiledJSON` không đọc tileset ngoài, kiểm lại), ĐÙN MÉP 1 px (`margin 1 / spacing 2`) + `roundPixels` vì camera `fitZoom * renderScale` (`gfx/scale.ts`) gần như luôn lẻ, MỘT ảnh tileset gộp cho mọi lớp hình của mọi bản đồ (giữ `drawCalls` 60 / 100 / 160 / 300), `layer.setScale(TILE / tilewidth)`. Lớp `over` (tán trên đầu): thân cây ở `decor` là ô logic `Tree` DUY NHẤT chặn đường, chỉ phần tán PHÍA TRÊN thân vào `over`, client làm mờ các ô `over` trong ~2 ô quanh người chơi (cờ tắt) để không che màn chơi khi đánh quái trong rừng (cây chiếm ~13 % ô). Khi có `visual.json` TẮT lớp trang trí vẽ mã `gfx/map-decor.ts`; lớp nước lấp lánh `gfx/map-water.ts` vẫn dựng từ lớp logic. Cờ đồ hoạ để quay lại. | B (sau #1196 hướng đồ hoạ + S2) | Chỉ hình |
| S4 | CÔNG CỤ `map:build` (sinh lớp hình bo góc từ lớp `logic` bằng terrain set / Wang blob 47 ô, phép ghép góc ở `shared/src/autotile.ts` dùng chung với client; xuất `<id>.logic.json` + `visual.json` + tileset nhúng đã ĐÙN MÉP, ~20 dòng, không thêm phụ thuộc; định dạng JSON gọn, khoá sắp xếp ổn định để `git diff` sạch), `map:check` (chạy `tiledViolations` + liên thông + cổng hai chiều + kiểm lớp hình mục 5), `map:show` (ASCII + PNG xem trước để AI / người nhìn). Agent chỉ sửa lớp `logic` + `objects` của tệp soạn rồi chạy `map:build`. | C (công cụ), A review | Chỉ hình |
| S5 | `spawnZone`: server dùng vùng sinh dữ liệu khi có (`monsters.ts`, `world-boss.ts`), quay về cách cũ khi bản đồ không khai; kiểm mục 5.4-5.5. | A | Phần mã: KHÔNG (bản đồ thật chưa khai vùng); thêm vùng vào bản đồ thật là S6 (có, mục 7). **Đã làm cục bộ (chưa PR)** |
| S6 | Dựng / chỉnh bản đồ thật (và bản đồ MỚI) bằng công cụ: từng bản đồ một PR, có mô phỏng cân bằng (`npm run can-bang -w server`) và ảnh trước / sau. | E / G (nội dung), A duyệt | Có |

S1 và S2 KHÔNG cần người dùng quyết gì thêm (hành vi không đổi); S3 cần hướng đồ hoạ đã duyệt (#1196); S5-S6 đổi bản đồ thật thì theo mục 7.

## 6a. Quy trình S6 cho MỘT bản đồ thường đã có (E / G soạn, A duyệt; mỗi bản đồ MỘT PR)

Điều kiện đã đủ (21/11/2026): S2 (tệp là nguồn), S3a (client nhận tệp trong chunk game), S4 (`map:check` / `map:build` / `map:show`), S5 (`spawnZone` + kiểm), `safeSpot` đưa vị trí lưu rơi vào ô chặn / túi kín tới chỗ đứng gần nhất. **Phạm vi nội dung của S6 (vẽ lại bốn bản đồ hay dựng bản đồ MỚI, mục 9 câu 3) do NGƯỜI DÙNG quyết**: chưa có trả lời thì chưa ai bắt đầu S6.

1. **Sửa tệp soạn `shared/maps/<id>.json`** (lớp `logic` và `objects`; lần đầu thêm thuộc tính bản đồ `handEdited` = true, kiểu bool). Cờ này (`server/src/systems/map-hand-edited.ts`) báo "tệp là nguồn duy nhất, không còn bằng bản sinh theo `seed`": `map:bake` BỎ QUA bản đồ đó (khỏi ghi đè bản sửa tay) và test "giống từng byte bản sinh theo seed" (`shared/src/tiled-maps.test.ts`) chuyển sang kiểm hợp lệ. KHÔNG xoá bản đồ khỏi `PROCEDURAL_MAPS` (đó là đồng hồ chuẩn và cơ sở của đấu trường chặn đường).
2. **`npm run map:build -w server -- <id>`** (sinh `<id>.logic.json` + `visual.json`), rồi **`npm run map:check -w server -- <id>`** (cú pháp, cờ lật, liên thông từ tâm trấn, cổng hai chiều, vùng sinh `spawnZoneViolations`). `map-sync.test.ts` (trong `npm test`) bắt quên `map:build`.
3. **Đổi va chạm / cổng / vùng sinh thì tăng `PROTOCOL_VERSION`** (mục 7.1; `MIN_PROTOCOL_VERSION` khi client cũ không chịu nổi) và ghi CHANGELOG.
4. **Cân bằng và hiệu năng:** `npm run can-bang -w server` (sinh lại `docs/CAN_BANG.md`) khi đổi vùng sinh / số quái; `npm run bench -w server` không được xấu đi.
5. **Hồ sơ cũ:** thêm ca cho bản đồ đó: vị trí lưu rơi vào ô chặn MỚI hoặc túi kín MỚI được đưa tới chỗ đi bộ tới được gần nhất (cơ chế có sẵn, `server/src/systems/safe-spot.test.ts` + `walk-reach.ts`), không về trấn.
6. **Ảnh trước / sau:** `npm run map:show -w server -- <id> --png <tệp>` đính vào PR.
7. Toàn bộ `npm test` + `typecheck` + `lint` + `prettier --check .`; B hoặc C review phần `shared/` / client; A duyệt.
**Đã thử trước (A, 21/11):** sửa tay một ô cỏ Lạc Hà + cờ `handEdited` + `map:build` thì `npm test` toàn bộ xanh (426 tệp), `map:check` xanh, `map:bake --check` bỏ qua đúng bản đồ đó; hai test từng vỡ (`DEFAULT_MAP` cùng byte với `getMap`, canary) đã sửa trong cùng PR. **Bản đồ MỚI (id mới)** CHƯA hỗ trợ: `adoptTiledMaps` chỉ thay bản đồ có sẵn trong `MAPS`; cần một PR hạ tầng riêng (thêm vào `MAPS` / `PROCEDURAL_MAPS` hoặc nhận id mới, `defineRooms`, cổng đôi, đấu trường) SAU khi người dùng quyết câu 3.

## 7. Khi va chạm thật đổi (S5, S6): tương thích và an toàn dữ liệu

1. **Giao thức:** client dự đoán di chuyển bằng CÙNG tệp bản đồ; bản client cũ (bộ nhớ đệm) mà bản đồ đổi va chạm thì dự đoán lệch (giật). Mỗi PR đổi va chạm / cổng / vùng sinh của một bản đồ PHẢI tăng `PROTOCOL_VERSION` (và đặt `MIN_PROTOCOL_VERSION` khi không chịu nổi bản cũ), theo quy tắc đã có ở AGENTS.md.
2. **Vị trí đã lưu:** nhân vật lưu `x`, `y`, `mapId`. Hiện `safeSpot` (`server/src/systems/movement.ts`) giữ vị trí đã lưu nếu `circleBlocked` không chặn, KHÔNG thì đặt ngẫu nhiên trong trấn (đủ an toàn nhưng người đang săn ở xa bị kéo về trấn). Khi bản đồ thật đổi (S5 / S6), thêm bước GẦN NHẤT trước khi về trấn: tìm vòng tròn mở rộng quanh vị trí cũ (tối đa vài chục ô, đúng bản đồ, ngoài `inSafe` của hang trùm / vùng chặn đường), không có thì về trấn như cũ; ghi nhật ký kiểm toán `map.relocate` (id bản đồ, khoảng dời; không dữ liệu cá nhân). Phải có test hồ sơ cũ trên bản đồ đã đổi (vị trí cũ trong ô chặn mới; ngoài bản đồ).
3. **Bí cảnh:** bản đồ `dungeon` không đổi (ngoài phạm vi), nên lượt chạy bí cảnh đang diễn ra không bị ảnh hưởng.
4. **Tìm đường:** `nav.ts` dựng lưới từ `GameMap` theo từng bản đồ và lưu trong `WeakMap<GameMap, NavGrid>` (khoá theo ĐỐI TƯỢNG `GameMap`), nên tự theo bản đồ mới, không dùng nhầm lưới cũ khi nạp lại tệp trong test; không phải sửa. `getMap(id)` vẫn trả MỘT `GameMap` cho mỗi id (S2 giữ nguyên bộ nhớ đệm hiện có).
5. **Hiệu năng:** `GameMap` dựng MỘT lần lúc khởi động (ngân sách tick không đổi); nạp tệp `<id>.logic.json` (20-35 KB raw mỗi bản đồ, tổng ~14,5 KB gzip) lúc khởi động server, không nạp lại. Phía client: logic KHÔNG vào gói khởi động (mục 4a: nhận trong chunk game tải sau); lớp hình đi gói `map:<id>` (10-18 KB gzip mỗi lớp mỗi bản đồ), KHÔNG vào gói khởi động; phải giữ `client/perf-budget.json` (`startupGzipKb` 220, `totalJsGzipKb` 548 = chỉ MÃ; chunk dữ liệu `map-files-*.js` có trần riêng `mapFilesGzipKb` 48 từ #1283: thêm bản đồ mới không còn ăn trần mã). `npm run bench -w server` không được đổi (chỉ đổi cách dựng, không đổi tick).

## 8. Rủi ro và cách giữ

| Rủi ro | Giữ bằng |
|---|---|
| Lệch client / server (hai nơi hiểu tệp khác nhau) | Một `parseTiledMap` dùng chung ở `shared/`; client KHÔNG tự đọc lớp logic bằng mã riêng |
| Agent / người sửa tệp làm hỏng bất biến (cổng một chiều, trùm kẹt) | `tiledViolations` trong test + `check:content` + CI (mục 5); không có đường tắt |
| Tệp lớn làm chậm tải / `getMap` đồng bộ ở client | Tách bản chạy logic (nhập tĩnh, 11,6 KB gzip) khỏi bản hình (gói `map:<id>`), mục 4a; ô là mảng số nên gzip tốt |
| Đồ hoạ mới (cỡ ô khác) buộc đổi lưới | Thuộc tính `tileScale`; `GameMap` chỉ đọc `width` / `height`; hướng B quyết ở #1196 |
| Tiled GPL | Tiled chỉ là CÔNG CỤ (ngoài repo); tệp xuất ra thuộc dự án. Không chép mã Tiled vào repo |
| Sinh bo góc (S4) chậm / xấu | Bắt đầu từ bảng 47 ô chuẩn (Wang blob); xem trước `map:show`; ảnh trước / sau trong PR |

## 9. Câu hỏi còn mở (không chặn S1 / S2)

1. **Cỡ ô hình 16 hay 32?** ĐÃ CHỐT về kỹ thuật (B, 21/11/2026, `docs/HUONG_DO_HOA_MOI.md` mục 10): ảnh 16 px, phóng ×2 nguyên số = `TILE` 32, MỘT ô logic = MỘT ô hình; định dạng trung lập với cỡ ô (`parseTiledMap` lấy `tile / tilewidth`; người dùng giữ ảnh 32 px thì `tilewidth = 32`, vẫn chạy). Hướng đồ hoạ còn chờ người dùng duyệt; S1 / S2 không phụ thuộc.
2. Giữ `dungeon` / `arena` theo `seed`? (khuyến nghị: có, giai đoạn này.)
3. Có dựng bản đồ MỚI trong S6 không, hay chỉ vẽ lại bốn bản đồ? (cần người dùng quyết; ảnh hưởng nội dung E / G, quái, cổng.)
