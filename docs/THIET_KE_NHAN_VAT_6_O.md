# Thiết kế bảng nhân vật 6 ô, độ hiếm và kiểu bản đồ thứ tư (M7.8, #509)

> Người viết: Dev B (client). Cần A duyệt phần **hợp đồng** (mục 2) TRƯỚC khi A viết `shared/` của M7.4 (#505): đây là những gì client cần để vẽ đúng mà không đoán. Phần việc không phụ thuộc hợp đồng (kiểu `han_van`, thời tiết tuyết, xem trước) đã làm xong ở cùng PR (mục 7). Số đo ở mục 1 lấy từ `main` (`e1e24cc` trở đi).

## 1. Hiện trạng (đã đọc mã)
- **Ba ô trang bị** (`shared/src/items.ts`): `EquipSlot = "weapon" | "robe" | "talisman"`, `EQUIP_SLOTS`, `EQUIP_SLOT_NAMES`; ba trường công khai `Player.weapon / robe / talisman` (client đọc đồ đang mặc từ chính `player` trong state, không có tin riêng). `EquipStats` chỉ có `atk`, `hp`, `mp`, `speed`; `statsFor(realm, tier, equipment)` là hàm dùng chung (client dựng bảng chỉ số bằng ĐÚNG hàm của máy chủ).
- **Bảng nhân vật** (`#char-modal`, `renderCharModalImpl` ở `ui.ts`): hàng thẻ `.equip-slot-card` (nút: nhãn ô, biểu tượng, tên đồ tô màu độ hiếm, "chỉ số · Chạm tháo"), khối chỉ số tổng hợp có **xem trước** (chạm đồ trong túi => `previewEquipItemId` => mỗi dòng hiện `giá trị -> giá trị mới`), danh sách đồ trang bị trong túi. Bàn phím: `data-nav="eq:<ô>"` cho `panel-nav.ts`.
- **Độ hiếm**: `Rarity` 0-4 (`RARITY_NAMES`: Phàm / Linh / Bảo / Tiên / Thần phẩm), `RARITY_COLORS` (xám ngà, lục, lam, tím, cam). Màu được dùng ở **11 chỗ** của `ui.ts` (túi, tooltip, cửa hàng, lò rèn, nhặt đồ, kho tông môn, phần thưởng...). Đo độ tương phản của năm màu trên nền bảng (`rgb(27,24,20)`): 10,2 / 9,1 / 6,8 / 6,2 / 9,8 (đều >= 4,5). **Độ hiếm hiện chỉ phân biệt bằng MÀU** (xanh lục / lam / tím gần nhau với người khó phân biệt màu).

## 2. Hợp đồng đề xuất cho M7.4 (A quyết; B chỉ ghi những gì client cần)
1. **Ô mới:** `EquipSlot` thêm `"boots" | "jade" | "treasure"`; `EQUIP_SLOTS` giữ thứ tự hiển thị `weapon, robe, talisman, boots, jade, treasure`; `EQUIP_SLOT_NAMES` thêm "Hài", "Ngọc bội", "Pháp bảo".
2. **Ba ô mới là riêng của chủ** (A đã chốt ở `PHAN_CONG_M7.md` mục 7). **Đề xuất cách gửi:** ba trường `boots`, `jade`, `treasure` trên `Player` với `@view(TAG_OWNER)` (cơ chế đã dùng cho `Player.x / y`, `AGENTS.md` mục Hiệu năng) thay vì tin riêng: client đọc từ chính `player` như ba ô cũ (một đường duy nhất, tự đồng bộ khi nối lại phòng và qua cổng, không thêm loại tin, người khác không nhận byte nào). Nếu A chọn tin riêng (mở rộng `InvMsg`) thì client cần nó gửi LẠI khi nối lại / qua cổng như `inv`.
3. **Ô pháp bảo khoá tới Kim Đan:** cần `EQUIP_SLOT_UNLOCK_REALM: Partial<Record<EquipSlot, number>>` (hoặc tương đương) ở `shared/` để client ghi "Mở ở Kim Đan" như thanh chiêu (`SLOT_UNLOCK_REALM`, `lockedSlotToast`); máy chủ vẫn là nơi từ chối.
4. **Chỉ số mới:** `EquipStats` thêm `crit` (điểm bạo kích, %), `cdr` (giảm hồi chiêu, %, <= 30), `guard` (giảm sát thương nhận, %, <= 40). **Cần `statsFor` / `equipBonus` trả cả ba (đã kẹp trần ở `shared/`)** để bảng chỉ số và phần xem trước dùng đúng hàm của máy chủ; không để client tự cộng và tự kẹp. Cần hằng `STAT_CAPS = { cdr: 30, guard: 40, ... }` xuất ra để client ghi "tối đa 30 %" và biết khi đồ mới không còn tăng được nữa (đã chạm trần).
5. **Pháp bảo:** `ItemDef.equip.treasure?: TreasureId` + bảng `TREASURES: TreasureDef[] { id, name, desc }` với `desc` là CÂU TIẾNG VIỆT hoàn chỉnh nêu nội tại ("Mỗi 10 giây tự dựng khiên 15 % khí huyết"): client chỉ hiển thị `desc` (không tự diễn giải số). Máy chủ thực thi (`systems/treasure.ts`).
6. **Độ hiếm:** giữ `Rarity` / `RARITY_NAMES` / `RARITY_COLORS`; B làm phần hiển thị (mục 4). Không cần đổi `shared/`.

## 3. Bố cục bảng 6 ô
- **Máy tính / tablet (>= 640 px):** lưới 3 x 2: hàng trên vũ khí, pháp bào, hộ phù (ba ô công khai, quen tay); hàng dưới hài, ngọc bội, pháp bảo. Thẻ giữ cấu trúc hiện có (nhãn, biểu tượng, tên, gợi ý). Đổi `.equip-slots-row` từ hàng ngang sang `display: grid; grid-template-columns: repeat(3, 1fr)`.
- **Điện thoại dọc (360 px):** vẫn lưới 3 cột (bảng là tờ đáy rộng ~344 px, mỗi thẻ ~105 px: chữ tên đồ cắt 2 dòng); hai hàng chiếm thêm ~110 px chiều cao nên khối chỉ số + túi nằm dưới và cuộn (tờ đã cuộn được từ #386). Mọi thẻ cao >= 44 px.
- **Ô khoá (pháp bảo trước Kim Đan):** thẻ mờ, ổ khoá (`lockIconSvg` đã có ở thanh chiêu), "Mở ở Kim Đan"; `aria-disabled`, vẫn focus được để nghe lý do. **Ô trống:** viền nét đứt, "Trống".
- **Ngoại hình:** ba ô mới không công khai nên KHÔNG đổi hình nhân vật (không đụng `applyItemVisual` của sprite, không đụng băng thông).
- **Bàn phím:** `data-nav="eq:<ô>"` cho cả sáu; mũi tên đi theo hình học (3 x 2); `Enter` trên thẻ ĐÃ mặc = tháo (như nay); `Enter` trên thẻ TRỐNG = nhảy tới đồ hợp ô đó trong danh sách túi (lọc / cuộn tới), để người chơi không phải mò.

## 4. Chỉ số mới, so sánh đồ, độ hiếm
- **Bảng chỉ số:** thêm ba dòng "Bạo kích", "Giảm hồi chiêu", "Giáp (giảm sát thương)" đơn vị %. `statItems` đã tổng quát hoá theo `{label, val, add, nextVal, unit}` nên chỉ thêm mục. Khi giá trị chạm trần ghi "30 % (tối đa)"; khi đồ xem trước KHÔNG còn làm tăng vì đã chạm trần thì ghi "đã tối đa" thay cho mũi tên.
- **So sánh CÙNG Ô:** khi chạm đồ trong túi, trên bảng chỉ số hiện thêm hàng "Đang mặc: <tên cũ> -> <tên mới>" (ô trống: "Trống -> ..."), mỗi chỉ số có **mũi tên ▲ / ▼ cùng màu** (không chỉ màu xanh / đỏ), pháp bảo so bằng hai câu `desc` đặt cạnh nhau (không có số để trừ). Mục tiêu: không bao giờ phải nhớ chỉ số món đang mặc.
- **Độ hiếm thêm một tín hiệu thứ hai ngoài màu:** `rarityStyle(rarity) -> { color, mark, name }` ở client (một hàm, 11 chỗ của `ui.ts` đi qua nó): `mark` = `""`, `◆`, `◆◆`, `◆◆◆`, `★` cho Phàm / Linh / Bảo / Tiên / Thần phẩm, đặt cạnh tên (và `aria-label` ghi tên bậc). Test: không còn `RARITY_COLORS[` ngoài hàm đó; năm bậc có `mark` khác nhau; màu >= 4,5:1 trên nền bảng (`contrast.ts`). Không đổi `shared/`.
- **Tooltip đồ:** `describeEquipStats` thêm ba chỉ số mới ("Bạo kích +3 %, Giảm hồi chiêu +5 %, Giáp +4 %"), pháp bảo thêm câu `desc`.

## 5. Bản đồ thứ tư (`han_van`)
- **Kiểu thị giác (ĐÃ làm, mục 7):** `MAP_STYLES.han_van` lạnh trắng xanh (ambient `#bcd6f2`, sương `#e4f0fb` alpha 0,3 trôi 7 px/s, nước băng phản chiếu chậm), thời tiết mới `snow` (hạt trắng ngà rơi chéo nhẹ, 12 hạt mỗi đợt như các loại khác, 11 hạt/giây), trang trí thưa (tuyết phủ): hoa tuyết, đá xám lạnh, nhũ băng thay nấm, tùng sẫm. Không thêm loại ô (đúng `PHAN_CONG_M7.md` mục 8).
- **Nền ô (đã quyết, A 15/11): B thêm `tileTint` theo kiểu, ĐÃ làm.** Ảnh xem trước đầu tiên cho thấy nền ô vẫn xanh cỏ (bộ ô dùng chung), nên vẻ băng nguyên chủ yếu do lớp phủ + sương + tuyết. `MapStyle.tileTint?: { color, alpha }` (trần `MAX_TILE_TINT_ALPHA` 0,45, kiểm bởi `validateStyle`): MỘT hình chữ nhật phủ cả bản đồ ngay TRÊN lớp ô (độ sâu -9,8) và DƯỚI trang trí / nước / thực thể; không thêm ảnh, không thêm loại ô; kiểu vắng khai báo thì chi phí 0. Không dùng `Tile.tint` của Phaser vì nó NHÂN màu (chỉ làm tối): phủ thường kéo cỏ về trắng xanh. `han_van`: `#e6f0fa` alpha 0,36; đo trên Chrome thật: độ sáng trung bình vùng giữa cảnh 173,1 -> 199,3 và xanh - đỏ -47,4 -> -2,0 so với cảnh mặc định (ảnh `docs/screenshots/han-van-xem-truoc.png` đã chụp lại). A chọn địa hình theo lối chơi, không theo màu.
- **Chuyển cảnh Âm Sương -> Hàn Vân và bản đồ nhỏ / lớn:** dùng `scene-transition.ts` và `map-overview.ts` (#498) như ba bản đồ trước: chỉ thêm mục cho id `han_van` (nhãn, màu nút trên sơ đồ, hướng cổng bắc của Âm Sương). Làm sau khi A đưa `MapDef` + cổng vào `shared/` (M7.5, #506).
- **Phòng ngừa:** kiểu `han_van` có trước bản đồ nên test "kiểu không mồ côi" có danh sách chờ; khi A thêm bản đồ, test ĐỎ nhắc bỏ `han_van` khỏi danh sách chờ (không để cũ).

## 6. Việc của B theo thứ tự và phụ thuộc
| # | Việc | Phụ thuộc |
|---|---|---|
| 1 | `rarityStyle` + dấu phụ độ hiếm ở 11 chỗ, test | không |
| 2 | Lưới 3 x 2 + ô khoá + bàn phím, bảng chỉ số 3 dòng mới, so sánh cùng ô, tooltip | hợp đồng M7.4 (mục 2) |
| 3 | Chuyển cảnh + bản đồ nhỏ / lớn cho `han_van`, E2E qua cổng ba -> bốn, ảnh 4 khung nhìn, `perf:mobile` + `leak:test` | M7.5 (bản đồ trong `shared/`) |
| 4 | Ảnh mở đầu bản đồ thứ tư (SDXL, #513) | bước 0 + ảnh thô của C |

## 7. Đã làm cùng PR thiết kế này (không phụ thuộc hợp đồng)
- `MAP_STYLES.han_van` + `WeatherKind "snow"` + công thức hạt `weather-snow` (`recipes-weather.ts`), `styleIdFor` và xem trước `?debug&style=<id>` (id lạ / thiếu `?debug` bị bỏ qua), 4 test mới (nhiều khẳng định mỗi ca) + 1 test sửa (danh sách chờ), 6 đột biến đỏ.
- `client/scripts/check-han-van-style.mjs` (Chrome thật): có hạt tuyết (tint `#f2f8ff`) mà cảnh mặc định không có; màu trung bình vùng giữa lạnh hơn bản mặc định (xanh - đỏ -47,4 -> -16,7); `?style=constructor` bị bỏ qua.

## 8. Câu hỏi cho A và TRẢ LỜI (A, 15/11/2026; đây là hợp đồng để A viết `shared/` của M7.4, #505)
1. **Ba ô riêng của chủ: trường `Player` `@view(TAG_OWNER)`** (`boots`, `jade`, `treasure`: chuỗi id, `""` = trống), như đề xuất: cùng đường với ba ô cũ, tự đồng bộ khi nối lại / qua cổng, không thêm loại tin, người khác không nhận byte nào. Máy chủ ghi vào `save.equipment` (đủ sáu ô) rồi phản chiếu ra `Player`. KHÔNG mở rộng `InvMsg`. `PROTOCOL_VERSION` đã là 3 cho M7 chưa phát hành; thêm trường trước khi phát hành thì không cần tăng thêm. `EquipSlot` thêm `boots | jade | treasure`, `EQUIP_SLOTS` theo thứ tự mục 2.1; `EQUIP_SLOT_UNLOCK_REALM: Partial<Record<EquipSlot, number>> = { treasure: 3 }` (Kim Đan là `realm` 3 trong `REALMS`).
2. **Có.** `EquipStats` thêm `crit`, `cdr`, `guard`; `statsFor` / `equipBonus` trả tổng từ trang bị ĐÃ KẸP, kèm `STAT_CAPS = { crit: 40, cdr: 30, guard: 40 }` xuất từ `shared/` (số `crit` 40 theo issue #505 là khởi đầu, M7.9 hiệu chỉnh; chỉ một chỗ để sửa). Trần chỉ áp lên phần TRANG BỊ; chiêu / trạng thái (hộ thể, tăng tốc...) là hệ số riêng, không nằm trong `statsFor`. Client so với `STAT_CAPS` để ghi "(tối đa)", không tự kẹp.
3. **A viết `TREASURES[].desc`** (câu tiếng Việt hoàn chỉnh) cạnh số liệu ở `shared/`, kèm test "desc nhắc đúng từng số của định nghĩa" (chu kỳ, tỉ lệ... xuất hiện trong `desc` đúng dạng "10 giây", "15 %") để câu chữ và số không lệch nhau. Client chỉ hiển thị `desc`, không diễn giải số.
4. **B thêm `tileTint` theo kiểu** (một trường dữ liệu trong `MAP_STYLES`, không thêm ảnh, không thêm loại ô); A chọn địa hình theo lối chơi (liên thông, sức chứa quái, tỉ lệ ô), không theo màu. B ĐÃ làm (#581, mục 5).

Nhắc khi A thêm bản đồ `han_van` (M7.5, #506): bỏ `han_van` khỏi danh sách chờ của test "kiểu không mồ côi" (`client/src/gfx/map-decor.test.ts`), nếu không test đỏ.

**Thứ tự thực hiện (A, 15/11):** (1) PR #580 (ĐÃ vào main): trường `Player` `@view(TAG_OWNER)`; (2) PR #585, `shared/`-only: mở `EquipSlot` / `EQUIP_SLOTS` lên 6 ô + `EquipStats` + `STAT_CAPS` + `TREASURES` (mở `EquipSlot` trước khi `Player` có trường làm `tsc` đỏ ở `equipment.ts`); (3) PR server (ghi / đọc sáu ô, `systems/treasure.ts`, đồ, rơi); (4) client của B.

**Điều chỉnh kiểu `Equipment` (A, #585):** ba ô riêng là TUỲ CHỌN trong kiểu (`Partial`) và `emptyEquipment()` vẫn trả ba khoá công khai; ô vắng hoặc `""` = trống. Bắt buộc đủ sáu khoá làm `tsc` đỏ ở mã dựng `Equipment` ba khoá (server `equipmentOf`, hai test, client `ui.ts`) mà PR `shared/` chỉ được sửa `shared/`. Client đọc ô riêng bằng `currentEquip[slot] || ""`; mã mới duyệt `EQUIP_SLOTS` (sáu ô). `equipBonus(eq, realm?)` bỏ qua ô chưa mở khi truyền `realm`.
