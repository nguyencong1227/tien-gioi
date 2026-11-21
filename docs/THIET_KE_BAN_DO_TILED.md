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

1. **Một nguồn:** tệp `shared/maps/<id>.json` (Tiled JSON). Client và server đọc đúng tệp đó; không có bản sao.
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
| `logic` | loại ô `T` (mỗi ô một số 0-7, bằng giá trị enum `T`; tileset logic `logic.tsx` có đúng 8 ô để sửa tay bằng Tiled thấy màu) | server + client (va chạm, dự đoán, bản đồ nhỏ) |
| `ground`, `decor`, `over` | hình: nền (đã bo góc), trang trí, phủ trên đầu nhân vật | CHỈ client |

**Lớp đối tượng (objectgroup)** `objects`; mỗi đối tượng có `type` + thuộc tính:
- `town` (hình tròn / điểm + `r` ô): khu an toàn (`MapDef.town`).
- `portal`: `id`, `name`, `toMap`, `toPortal`, `r`, `safeR`, `spawnX`, `spawnY` (px thế giới; `x`, `y` của đối tượng là tâm cổng).
- `lair` (bí cảnh / hang cố định, nếu có).
- (lát cắt 5, tuỳ chọn) `spawnZone`: `monster` (id), `max`, hình chữ nhật / elip: nơi quái / trùm sinh thay cho cách sinh ngầm theo `dangerAt`.

`dangerAt` GIỮ công thức theo khoảng cách tới `town` (không thành dữ liệu ở giai đoạn này).

## 5. Kiểm tra (hàm thuần ở `shared/src/tiled.ts`, `tiledViolations(json, ctx)`)

Chạy trong test (mọi tệp `shared/maps/*.json`) và `npm run check:content`. Báo lỗi gọn `tệp + đối tượng`:
1. Cấu trúc: `schema`, `orientation`, `infinite`, kích thước lớp `logic` == `width * height`, mọi số ô logic thuộc `0..7`, tệp có lớp `logic` + `objects`.
2. **Cổng hai chiều:** `toMap` / `toPortal` tồn tại và trỏ ngược lại; id cổng duy nhất toàn game; `spawn` đi được, trong `safeR`, ngoài `r`; tâm cổng không nằm trên ô chặn (đã có trong `checkPortals`, chuyển thành hàm dùng chung).
3. Tâm `town` và `lair` đi được; trấn không phủ kín nửa bản đồ (điều kiện `dangerSpanPx > 0` đang có).
4. **Liên thông:** từ tâm trấn, loang theo lưới đi được (cỡ thân lớn nhất của một loại trùm trong bản đồ, như `navClassOf`) phải chạm TOÀN BỘ cổng, hang, mọi `spawnZone` và mọi điểm sinh trùm; không có ô đi được nào bị cô lập mà vẫn là chỗ sinh quái (mục 48: chống "đứng sau cây đánh trùm miễn phí").
5. **Vùng sinh:** không nằm trong ô chặn; trùm sinh sẵn <= `MAX_BOSSES_PER_MAP` (6, mục 56); vùng sinh trùm đủ rộng (cỡ thân + lề) và KHÔNG sát cây / đá (mục 48).
6. `monsterCap` chỉ chứa id quái CÓ THẬT (đã có `checkMonsterCap`).

## 6. Lát cắt (mỗi cái một PR, theo thứ tự)

| # | Việc | Ai | Hành vi đổi? |
|---|---|---|---|
| S1 | `shared/src/tiled.ts`: kiểu `TiledMap`, `parseTiledMap(json)` -> dữ liệu dựng `GameMap`, `tiledViolations`; `MapDef.tiled?` (tuỳ chọn); `GameMap` dựng từ tệp khi có `tiled`, từ `generate(def)` khi không. Test với mẫu nhỏ + đột biến mỗi luật mục 5. | A | Không (không bản đồ nào dùng) |
| S2 | CÔNG CỤ `npm run map:bake`: xuất bốn bản đồ hiện có (sinh theo `seed`) ra `shared/maps/*.json` (lớp `logic` = `tiles` hiện tại; `ground` = chép từ `logic` qua bảng ô -> hình tạm; đối tượng cổng / trấn / hang). Chuyển `MAPS` sang đọc tệp. Test SO TỪNG BYTE: `GameMap` từ tệp == `GameMap` sinh theo `seed` (`tiles`, `portals`, `townPx`, `lairPx`, `dangerAt` mẫu, `monsterCap`) cho cả 4 bản đồ. `generate` còn lại cho `dungeon` / `arena` và làm "đồng hồ chuẩn" của test. | A (công cụ có thể nhờ C) | KHÔNG: byte giống hệt |
| S3 | Client vẽ từ lớp hình của JSON (`tilemapTiledJSON`, nạp THEO BẢN ĐỒ bằng `import.meta.glob` lazy để giữ `startupGzipKb`), khi tệp có lớp hình; chưa có thì giữ cách vẽ cũ. Cờ đồ hoạ để quay lại. | B (sau #1196 hướng đồ hoạ + S2) | Chỉ hình |
| S4 | CÔNG CỤ `map:build` (sinh lớp hình bo góc từ lớp `logic` bằng terrain set / Wang blob 47 ô định nghĩa trong tileset), `map:check` (chạy `tiledViolations`), `map:show` (ASCII + PNG xem trước để AI / người nhìn). Agent chỉ sửa lớp `logic` + `objects` rồi chạy `map:build`. | C (công cụ), A review | Chỉ hình |
| S5 | `spawnZone`: server dùng vùng sinh dữ liệu khi có (`monsters.ts`, `world-boss.ts`), quay về cách cũ khi bản đồ không khai; kiểm mục 5.4-5.5. | A | Có (từng bản đồ một, mục 7) |
| S6 | Dựng / chỉnh bản đồ thật (và bản đồ MỚI) bằng công cụ: từng bản đồ một PR, có mô phỏng cân bằng (`npm run can-bang -w server`) và ảnh trước / sau. | E / G (nội dung), A duyệt | Có |

S1 và S2 KHÔNG cần người dùng quyết gì thêm (hành vi không đổi); S3 cần hướng đồ hoạ đã duyệt (#1196); S5-S6 đổi bản đồ thật thì theo mục 7.

## 7. Khi va chạm thật đổi (S5, S6): tương thích và an toàn dữ liệu

1. **Giao thức:** client dự đoán di chuyển bằng CÙNG tệp bản đồ; bản client cũ (bộ nhớ đệm) mà bản đồ đổi va chạm thì dự đoán lệch (giật). Mỗi PR đổi va chạm / cổng / vùng sinh của một bản đồ PHẢI tăng `PROTOCOL_VERSION` (và đặt `MIN_PROTOCOL_VERSION` khi không chịu nổi bản cũ), theo quy tắc đã có ở AGENTS.md.
2. **Vị trí đã lưu:** nhân vật lưu `x`, `y`, `mapId`. Hiện `safeSpot` (`server/src/systems/movement.ts`) giữ vị trí đã lưu nếu `circleBlocked` không chặn, KHÔNG thì đặt ngẫu nhiên trong trấn (đủ an toàn nhưng người đang săn ở xa bị kéo về trấn). Khi bản đồ thật đổi (S5 / S6), thêm bước GẦN NHẤT trước khi về trấn: tìm vòng tròn mở rộng quanh vị trí cũ (tối đa vài chục ô, đúng bản đồ, ngoài `inSafe` của hang trùm / vùng chặn đường), không có thì về trấn như cũ; ghi nhật ký kiểm toán `map.relocate` (id bản đồ, khoảng dời; không dữ liệu cá nhân). Phải có test hồ sơ cũ trên bản đồ đã đổi (vị trí cũ trong ô chặn mới; ngoài bản đồ).
3. **Bí cảnh:** bản đồ `dungeon` không đổi (ngoài phạm vi), nên lượt chạy bí cảnh đang diễn ra không bị ảnh hưởng.
4. **Tìm đường:** `nav.ts` dựng lưới từ `GameMap` theo từng bản đồ và lưu trong `WeakMap<GameMap, NavGrid>` (khoá theo ĐỐI TƯỢNG `GameMap`), nên tự theo bản đồ mới, không dùng nhầm lưới cũ khi nạp lại tệp trong test; không phải sửa. `getMap(id)` vẫn trả MỘT `GameMap` cho mỗi id (S2 giữ nguyên bộ nhớ đệm hiện có).
5. **Hiệu năng:** `GameMap` dựng MỘT lần lúc khởi động (ngân sách tick không đổi); nạp tệp JSON ~100-150 KB mỗi bản đồ lúc khởi động server, không nạp lại. Phía client: tải theo bản đồ (lazy), tổng gzip dự kiến ~10-15 KB mỗi bản đồ; phải giữ `client/perf-budget.json` (`startupGzipKb` 220, `totalJsGzipKb` 540). `npm run bench -w server` không được đổi (chỉ đổi cách dựng, không đổi tick).

## 8. Rủi ro và cách giữ

| Rủi ro | Giữ bằng |
|---|---|
| Lệch client / server (hai nơi hiểu tệp khác nhau) | Một `parseTiledMap` dùng chung ở `shared/`; client KHÔNG tự đọc lớp logic bằng mã riêng |
| Agent / người sửa tệp làm hỏng bất biến (cổng một chiều, trùm kẹt) | `tiledViolations` trong test + `check:content` + CI (mục 5); không có đường tắt |
| Tệp lớn làm chậm tải | Lazy theo bản đồ + giữ ngân sách; ô là mảng số nên gzip tốt |
| Đồ hoạ mới (cỡ ô khác) buộc đổi lưới | Thuộc tính `tileScale`; `GameMap` chỉ đọc `width` / `height`; hướng B quyết ở #1196 |
| Tiled GPL | Tiled chỉ là CÔNG CỤ (ngoài repo); tệp xuất ra thuộc dự án. Không chép mã Tiled vào repo |
| Sinh bo góc (S4) chậm / xấu | Bắt đầu từ bảng 47 ô chuẩn (Wang blob); xem trước `map:show`; ảnh trước / sau trong PR |

## 9. Câu hỏi còn mở (không chặn S1 / S2)

1. **Cỡ ô hình 16 hay 32?** Thiết kế chọn 16 (khớp Ninja Adventure, phóng ×2 nguyên số). B chốt ở `docs/HUONG_DO_HOA_MOI.md`; nếu chọn khác chỉ đổi `tileScale`, không đổi mã server.
2. Giữ `dungeon` / `arena` theo `seed`? (khuyến nghị: có, giai đoạn này.)
3. Có dựng bản đồ MỚI trong S6 không, hay chỉ vẽ lại bốn bản đồ? (cần người dùng quyết; ảnh hưởng nội dung E / G, quái, cổng.)
