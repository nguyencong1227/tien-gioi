# Hướng đồ hoạ mới: nâng đồ hoạ bằng Ninja Adventure (CC0)

> Quyết định gốc: `~/TT/orchestra/QUYET_DINH_M3.md` mục 62, giai đoạn 1 (người dùng, 21/11/2026). Người viết: Dev B. Người duyệt hướng: người dùng, rồi Dev A.
> **Trạng thái: BẢN NHÁP CHỜ NGƯỜI DÙNG DUYỆT.** Chưa đổi tệp nào trong `client/public/`, chưa đổi mã client. Chỉ có tài liệu này, hai ảnh mẫu `docs/art/huong-moi/` và script dựng ảnh `client/scripts/art/mau-huong-moi.py`.

## 0. Tóm tắt và việc cần người dùng quyết

**Ba điều tìm ra khi tải gói về (đã kiểm, không phải suy đoán):**

1. **Bản trên GitHub `pixel-boy/NinjaAdventure` KHÔNG phải cả gói.** Đó là dự án Godot 4 mẫu: 98 ảnh, 4 bản nhạc, đúng **3 sprite nhân vật** (`ninja_blue`, `samurai_blue`, `samurai_green`) + 1 con heo, 5 tileset, 5 vũ khí, vài biểu tượng UI. **Không có** quái (ngoài heo), trùm, 60+ vật phẩm, hiệu ứng chiêu, SFX, phông. Trang itch.io của tác giả liệt kê gói đầy đủ (tệp `Ninja Adventure - Asset Pack.zip`, 89 MB): 50+ nhân vật, 30+ quái, 9 trùm, 60+ vật phẩm, 30+ hiệu ứng hình, 100+ SFX, 37 bản nhạc, 2 phông. Phần lớn "ánh xạ" người dùng mô tả (quái, trùm, hiệu ứng, SFX) chỉ làm được thật khi có gói đầy đủ. Tải gói itch.io cần bấm trong trình duyệt, nên **người dùng đặt tệp zip vào `/mnt/data/assets-src/` hoặc cho phép cách tải khác**; B không tự tải.
2. **Giấy phép:** trang itch.io ghi "released under the Creative Commons Zero (CC0) license", ô giấy phép "Creative Commons Zero v1.0 Universal", dùng được cả game thương mại, ghi công không bắt buộc (đọc 21/11/2026). **Repo GitHub không có tệp LICENSE và API GitHub trả `license: null`.** Bằng chứng giấy phép của ta là trang itch.io, không phải repo. Đã ghi vào mục 8; cần người dùng đồng ý dùng bằng chứng này.
3. **Nhân vật 16 px của gói kém dễ đọc hơn đạo sĩ hiện tại** (xem ảnh 1): đầu to, mặt che băng, phần "đạo bào" thấy được chỉ vài điểm ảnh, nên đổi màu theo cảnh giới gần như không nhìn ra ở cỡ game. **Nền, cây, nhà, nước, UI, nhạc của gói là nâng cấp rõ** (ảnh 2); nhân vật thì chưa.

**Đề xuất của B (hướng C, pha trộn):** lấy nền / cây / đá / nhà / UI / nhạc từ gói (đổi màu theo bảng "tu tiên", mục 4); **giữ nhân vật, NPC, quái hiện tại** cho tới khi có gói đầy đủ để so lại từng con. Tách bước nhỏ, bật tắt được bằng cài đặt, không đổi giao thức server (ô vẫn 32 px, `T` vẫn 8 loại, va chạm vẫn theo ô).

**Cần người dùng trả lời:**

| # | Câu hỏi | Gợi ý của B |
|---|---|---|
| Q1 | Hướng nào: A (thay hết, cần gói đầy đủ), B (thay hết bằng 3 nhân vật có sẵn), C (pha trộn)? | **C**; sau đó xem lại nhân vật khi có gói itch.io |
| Q2 | Màu: giữ nguyên màu gói (SAU A) hay bảng "tu tiên" dịu hơn (SAU B)? | **SAU B**; nguyên màu gói quá tươi so với tông cổ phong của game |
| Q3 | Chấp nhận bằng chứng giấy phép là trang itch.io (repo không có LICENSE)? | Có, kèm lưu ngày đọc + băm của gói tải về |
| Q4 | Tải gói itch.io (89 MB) về `/mnt/data/assets-src/` để làm tiếp quái, trùm, vật phẩm, VFX, SFX? | Có nếu muốn đi tới cùng; không thì dừng ở hướng C |
| Q5 | Nhạc: đưa 4 bản của gói (tổng 5,4 MiB, bản lớn nhất 2,2 MiB) vào gói tải theo nhu cầu, hay giữ nhạc tổng hợp bằng mã (0 KB) làm mặc định? | Gói tải theo nhu cầu, tuỳ chọn; mặc định giữ nhạc mã |

## 1. Hiện trạng đồ hoạ (đo từ `main` ngày 21/11/2026)

| Mặt | Hiện có |
|---|---|
| Ô bản đồ | `TILE = 32` (`shared/src/map.ts`); `enum T` 8 loại: Grass, TallGrass, Dirt, Water, Tree, Rock, Stone, Sand; chặn đường: Water, Tree, Rock |
| Tileset | `client/public/assets/tileset.png` 256x32 = 8 ô 32 px, **không ghép góc** (mép vuông, ảnh "TRƯỚC" ở ảnh 2); lớp trang trí tất định + lớp nước lấp lánh là tilemap riêng (`gfx/decor-tileset`) |
| Bản đồ | 4 bản đồ chính (Lạc Hà 96x96, Hắc Phong 128x96, Âm Sương 128x112, Hàn Vân 128x128 ô), 4 đấu trường 32x32, 1 bí cảnh 64x64. **Cây chiếm ~13 % số ô** (Lạc Hà 1205 / 9216 ô) |
| Atlas | `atlas.png` 640x1488, **484 khung**: người chơi `me` 32x40 (41 khung: 4 hướng x [đứng 1, đi 4, chém 3, trúng đòn 1] + 4 khung ngã), `other` 41, `robe-*` 123 (áo theo trang bị), `mon-*` 140 (14 loài x 10 khung, 32x32), `npc-*` 15 (36x42), `item-*` 122 (24x24) |
| Sinh ảnh | `client/scripts/gen-assets.mjs` vẽ bằng mã (CC0 của nhóm); `client/public/assets` hiện 984 KB (gồm 6 ảnh AI và 122 biểu tượng) |
| UI | DOM + CSS (`ui.ts`, `style.css`), màu `--ink #1d1a16`, `--paper #f3ecda`, `--red #a31d1d`, `--gold #c9a24a`, phông Noto Serif (có tiếng Việt) |
| Âm thanh | Nhạc nền + SFX tổng hợp bằng Web Audio (`audio.ts`, `sfx-recipes.ts`), 0 tệp âm thanh |
| Hiệu ứng | Vẽ bằng mã (`gfx/fx/*`: hạt, vòng, chữ bay, thời tiết `map-weather.ts`) |
| Ngân sách (`client/perf-budget.json`) | `atlasTilesetKb 1024`, `startupGzipKb 220`, `drawCalls` 60 / 100 / 160 / 300 theo bậc Thấp / Vừa / Cao / Rất cao, bộ nhớ ảnh 48 / 80 / 256 / 512 MB |
| Lọc điểm ảnh | `grep` không thấy `pixelArt` / `roundPixels` trong `client/src`: phải kiểm và bật khi dùng ảnh 16 px phóng nguyên số (mục 7) |

## 2. Gói Ninja Adventure: có gì thật

**Bản clone trên máy** (`/mnt/data/assets-src/ninja-adventure`, commit `6ac78232d5aedcc85ce5f27d060ea92366f7c24a`, 19/04/2024):

| Loại | Có gì | Ghi chú đã xác minh |
|---|---|---|
| Nhân vật | `ninja_blue`, `samurai_blue`, `samurai_green` (64x112), `pig` (32x16) | Khung 16x16, **4 cột = hướng** (xuống 0, lên 1, trái 2, phải 3), **7 hàng**: hàng 0-3 đi (hàng 0 cũng là đứng), 4 chém, 5 nhảy, 6 = ngã / dùng đồ / hai thế chiêu (cột 0-3). Đọc từ `system/character/sprite_character.gd` |
| Tileset | `tileset_floor` 352x417, `tileset_village_abandoned` 320x192, `tileset_interior_floor` 352x272, `tileset_wall_simple` 160x176, `tileset_animated` 64x64 (4 khung hoa) | `tileset.tres` (Godot) có **56 ô ghép góc** (8 hàng xóm, 2 địa hình `grass` / `dirt`) cho khối cỏ + đất; script mẫu đã đọc nó để tự ghép |
| Cảnh vật | Cây lớn (64x48) và nhỏ (32x34), nhà gỗ rêu phong (~58x77), đá, tượng ếch, cọc, hũ, hòm, cỏ, gốc cây, cổng | Cắt từ `tileset_village_abandoned` |
| UI | `theme/theme_1`: khung 9 mảnh, nút 4 trạng thái, ô chọn, thanh trượt; tim 16 px; thanh máu 18x4 | Bảng màu cam, cần đổi |
| Hiệu ứng | Hạt cỏ / lá / bình / đá / gỗ; mây, sương, lá, mưa, tuyết, tia sáng (`system/environment/fx`) | **Không có** hiệu ứng chiêu |
| Âm thanh | 4 bản nhạc `.ogg` (0,88 / 0,97 / 1,46 / 2,33 MB) | **Không có** SFX |
| Vũ khí | kiếm lớn, rìu, gậy, sách, xương (7-12 px) | dùng làm biểu tượng |

**Chỉ có ở gói itch.io (theo trang tác giả, chưa tải nên CHƯA kiểm tay):** 50+ nhân vật (có hoạt hoạ + chân dung), 30+ quái, 9 trùm, 60+ vật phẩm, tileset đầy đủ (kể cả nước), 30+ VFX, 100+ SFX, 37 nhạc, 2 phông.

**Khối màu của `tileset_floor`:** 8 khối 11x7 ô cùng bố cục (2 cột x 4 hàng). Đã đo màu: (0,0) cam / sa mạc, (0,1) **cỏ + đất** (khối có định nghĩa ghép góc trong `tileset.tres`), (0,2) tuyết trắng, (0,3) **băng xanh nhạt trên nền trắng**; các khối còn lại là biến thể màu. **Gói clone KHÔNG có ô nước thường**; ao trong ảnh mẫu là khối băng đã bỏ nền trắng và đổi sang xanh nước. Vai trò chính xác của từng khối chưa kiểm hết.

## 3. Cỡ ô và tỉ lệ

Gói dùng ô 16 px; game dùng ô 32 px. Ba hướng:

| Hướng | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **A. Phóng 2 lần nguyên số, giữ `TILE = 32`** | Ảnh gốc 16 px, hiển thị x2 (đặt `setScale(2)` hoặc nướng sẵn atlas x2) | Không đổi server / `shared/`, va chạm, giao thức; 1 điểm ảnh gói = 2x2 điểm ảnh màn hình | Điểm ảnh to hơn hẳn nhân vật hiện tại (xem SAU C) |
| B. Đổi `TILE = 16` | Ô gốc | Đúng cỡ gói | **Đổi hợp đồng `shared/`**, hầu hết hằng số (tốc độ, tầm, vùng nhìn) tính theo px: rủi ro lớn, KHÔNG làm |
| C. Trộn: nền x2 + sprite hiện tại 1x | Mật độ điểm ảnh khác nhau giữa nền và nhân vật (ảnh 2, SAU C) | Giữ được nhân vật, quái, NPC đã có | Nền "thô" hơn nhân vật; cần tay nghề để không lệch phong cách |

**B khuyến nghị A cho nền / cây / UI, và C cho thời gian chuyển tiếp.** Bản nướng sẵn x2 làm bộ nhớ ảnh gấp 4 lần: nên nạp ảnh 16 px và phóng bằng GPU (lọc gần nhất) để giữ ngân sách.

**Cây:** cây nhỏ của gói rộng 2 ô game, cao ~2 ô; cây chiếm 13 % ô nên phải vẽ bằng tilemap nhiều ô (tán lớp trên đầu người chơi, gốc 1 ô chặn đường) thay vì sprite rời (1205 sprite sẽ vượt `drawCalls`). Va chạm giữ nguyên theo ô `T.Tree`.

## 4. Bảng màu "tu tiên"

Môi trường của gói chỉ có ~20 màu, rất tươi (cỏ lime `#adbc3a`, đất cam `#d3865f`, gạch vàng `#f1c471`). Đổi **từng màu** (không chỉnh HSV toàn ảnh) để kiểm soát; viền `#141b1b` giữ nguyên:

| Nhóm | Màu gốc -> màu mới |
|---|---|
| Cỏ | `#adbc3a`->`#9cb77e`, `#a8a129`->`#86a068`, `#74a334`->`#5e8f58`, `#546626`->`#3f6b45`, `#7a7a3e`->`#66784a`, `#56864c`->`#3e6e4d` |
| Đất / gỗ / rễ | `#d3865f`->`#bfa078`, `#bd7959`->`#a88a66`, `#a3754e`->`#8d6a4d`, `#965340`->`#7a4a3c`, `#e46d3a`->`#a9744f` |
| Gạch / đá | `#f1c471`->`#cdbb92`, `#d2b37d`->`#b9a47e`, `#eecf9b`->`#dccaa5`, `#c8966b`->`#a98e6b`, `#cec66a`->`#b1b27e` |
| Nước (từ khối băng) | `#b8dce5`->`#8bbccd`, `#f2eaf1`->`#d9edf2`, nền trắng `#ffffff` -> trong suốt |

Bảng đầy đủ nằm ở `TU_TIEN_ENV` trong `client/scripts/art/mau-huong-moi.py`.

**Theo bản đồ (đề xuất, cùng khối ghép góc, đổi màu đất -> màu khác):** Lạc Hà cỏ + đất vàng; Hắc Phong cỏ sẫm + đất tro; Âm Sương cỏ xanh lục xám + bùn, nhiều nước; Hàn Vân tuyết (khối (0,2) hoặc đổi màu đất thành trắng) + đá lạnh.

**Đạo bào theo cảnh giới** (đổi 3 màu vải của `samurai_blue`: sáng `#79b8ce`, tối `#548789`, dây lưng `#d14b34`; giữ viền, tóc `#3b3643`, da `#ef914f`):

| Cảnh giới | Sáng | Tối | Dây lưng |
|---|---|---|---|
| Phàm Nhân | `#e6dfc9` | `#b3a98f` | `#8a6a4a` |
| Luyện Khí | `#f1f1ea` | `#b4c3c9` | `#3f9fc6` |
| Trúc Cơ | `#bfe3ae` | `#6fa872` | `#2f7d55` |
| Kim Đan | `#f7e5a4` | `#d3a84d` | `#b5832a` |
| Nguyên Anh | `#d3c0f0` | `#8f73c4` | `#5b3fa0` |

**Giới hạn thấy rõ ở ảnh 1:** ở cỡ 16 px chỉ vài điểm ảnh là vải, nên khác biệt cảnh giới đọc chủ yếu qua dây lưng / viền chứ không qua cả bộ đạo bào. Nếu theo hướng thay nhân vật, cảnh giới nên hiện thêm bằng **vòng sáng / hào quang vẽ bằng mã** (đã có sẵn lớp này), không dựa riêng vào màu áo.

**UI:** khung 9 mảnh của gói đổi từ cam sang mực `#1d1a16` / giấy `#f3ecda` / vàng `#c9a24a` / đỏ son `#a31d1d` (màu hiện tại của game).

## 5. Ánh xạ chi tiết

| Thành phần | Hiện có | Gói clone (có sẵn) | Gói itch.io (cần tải) | Việc / rủi ro |
|---|---|---|---|---|
| `T.Grass` | ô cỏ phẳng | khối (0,1) terrain 0, nhiều ô lõi | như clone | ghép góc tự động ở client từ `tileAt` |
| `T.Dirt` | ô đất phẳng | khối (0,1) terrain 1 (ghép góc 56 ô) | như clone | như trên |
| `T.TallGrass` | ô cỏ cao | `destroyable/grass.png`, 4 hoa động | thêm bụi, hoa | lớp trang trí tất định sẵn có, thay hình |
| `T.Water` | ô nước + lấp lánh | **không có**; khối băng đổi màu | tileset nước (theo trang tác giả) | clone: dùng tạm bản đổi màu; nước thật cần gói itch.io |
| `T.Sand` | ô cát | đổi màu khối đất thành cát (cùng bố cục) | khối sa mạc (0,0) | cần thử bằng mắt |
| `T.Stone` (sàn trấn) | gạch lát | `tileset_interior_floor` (gạch vàng, đá xám, đá tối) | như clone | ghép viền khung 3x3 của khối |
| `T.Rock` | ô núi đá | `tileset_wall_simple` (4 màu, khối tường), đá rời của làng | thêm vách đá | thay bằng tường / vách ghép góc |
| `T.Tree` | cây 1 ô | cây lớn / nhỏ 2-4 ô của làng bỏ hoang | thêm loài | tilemap nhiều ô, tán lớp trên (mục 3) |
| Công trình / NPC nhà | không có (chỉ ô) | nhà gỗ rêu, cổng, cọc, tượng ếch, hũ, hòm | thêm | trang trí tất định, không đổi va chạm |
| 4 bản đồ | sinh theo seed bằng mã | — | — | giai đoạn 2 chuyển sang Tiled (mục 62); giai đoạn 1 chỉ đổi cách VẼ |
| Người chơi | `me` / `other` / `robe-*` 32x40, 4 hướng x (đứng, đi 4, chém 3, trúng đòn) + ngã 4 | `samurai_blue` 16x16, 4 hướng x (đứng, đi 4, chém 1, nhảy 1, ngã 1, 3 thế phụ) | 50+ nhân vật | **chưa thay**; hoạt hoạ ánh xạ: chém 3 -> 1 khung + lướt / kiếm khí vẽ mã, trúng đòn -> nháy trắng (gói không có khung), ngã 4 -> khung ngã + mờ dần |
| NPC (15) | 36x42, 15 vai riêng (trấn trưởng, dược sư, thợ rèn...) | 1 hình dùng lại (`ninja_blue`), không đủ phân biệt vai | 50+ nhân vật + chân dung | cần gói đầy đủ |
| Quái (14 loài) | 32x32 x 10 khung | heo + yêu mũ rơm | 30+ quái | cần gói đầy đủ; ghép tên loài sang hình theo hệ / cảnh giới |
| Trùm | quái lớn + thẻ trùm bằng ảnh AI (SDXL) | — | 9 trùm có hoạt hoạ | thẻ trùm AI giữ nguyên; thân trùm cần gói đầy đủ |
| Biểu tượng vật phẩm | 122 ảnh 24x24 vẽ bằng mã | vũ khí 7-12 px, hũ, hòm, tim | 60+ món | gói chỉ phủ ~một nửa: các món còn lại giữ nguyên; ô 24 px không chia nguyên cho 16 -> hiển thị x2 = 32 px trong ô to hơn hoặc giữ x1 |
| Hiệu ứng chiêu | hạt + vòng + chữ vẽ mã | hạt cỏ / đá / gỗ | 30+ VFX | dùng thêm làm hạt nền, kết hợp hạt mã (như người dùng yêu cầu) |
| Thời tiết / khí quyển | `map-weather.ts` vẽ mã | mưa, tuyết, sương, mây, lá, **tia sáng** (`raylight`) | — | thêm tia sáng / mây làm không khí tu tiên; kiểm ngân sách hạt |
| UI | DOM + CSS | khung 9 mảnh, nút, ô chọn, thanh trượt, tim | + thành phần | `border-image` + `image-rendering: pixelated` cho `.modal-box` / nút / `.panel`; bước CUỐI, sau cờ bật tắt; `contrast.test.ts` phải xanh |
| Phông | Noto Serif (Việt) | — | 2 phông | phông pixel của gói chưa chắc có dấu tiếng Việt: giữ Noto Serif cho chữ chính |
| Nhạc | Web Audio, 0 KB | 4 bản `.ogg` (5,4 MiB) | 37 bản | gói tải theo nhu cầu (`build-packs.mjs`), mã hoá lại nhẹ hơn, mặc định giữ nhạc mã |
| SFX | công thức Web Audio | — | 100+ | giữ công thức; thêm tệp khi có gói đầy đủ, mỗi tệp một dòng nguồn |

## 6. Ảnh mẫu trước / sau

Dựng bằng `python3 -I client/scripts/art/mau-huong-moi.py` (đọc gói ở `/mnt/data/assets-src/ninja-adventure` và atlas hiện tại; ghi vào `docs/art/huong-moi/`). **Đây là ảnh ghép NGOÀI game** (chưa có hạt, sương, nhãn tên, HUD, camera): ảnh chụp THẬT trong game ở 6 cỡ màn hình chỉ làm sau khi người dùng chọn hướng (dùng bộ chơi thử AI mục 60).

- **Ảnh 1** `docs/art/huong-moi/01-nhan-vat-quai-do.png`: nhân vật (5 cảnh giới), hoạt hoạ hướng xuống, quái, biểu tượng vật phẩm, bảng màu đạo bào. Trái = hiện tại, phải = gói.
- **Ảnh 2** `docs/art/huong-moi/02-canh-truoc-sau.png`: cùng một bố cục 16x9 ô ở bốn bản: TRƯỚC; SAU A (nguyên màu gói); SAU B (bảng "tu tiên"); SAU C (nền gói + nhân vật / quái hiện tại).
- **Ảnh 3-4: BẢN ĐỒ THẬT ở 6 cỡ màn hình** (360x640, 412x915, 915x412, 550x900, 1366x768, 1920x1080; yêu cầu tiêu chí 4 của #1196). Lưới ô lấy từ `getMap("lac_ha")` (`npx tsx client/scripts/art/xuat-luoi-ban-do.ts lac_ha > lac_ha.json`, rồi `python3 -I client/scripts/art/mau-huong-moi.py --grid lac_ha.json`); vùng nhìn cắt theo đúng `fitZoom` của game (zoom 0,75 / 0,83 / 0,75 / 0,86 / 1,20 / 1,30); TRƯỚC = tileset + atlas hiện tại, SAU = gói + bảng "tu tiên" (SAU B). `03-lac-ha-tran-6-khung.jpg` và `03-vung-san-6-khung.jpg`: tờ tổng hợp 6 khung (Lạc Hà Trấn ở cổng trấn; một vùng săn cách trấn ~30 ô chọn tất định theo độ đa dạng địa hình); `04-*-412x915.jpg` (hai bản cạnh nhau) và `04-*-1366x768.jpg` (xếp dọc) là độ phân giải thật. **Chưa có HUD** (giai đoạn 1 không đổi HUD; UI là bước 4) và **chưa phải ảnh chụp trong game**; lọc ảnh dùng song tuyến cho cả hai bản vì lọc thật của game chưa kiểm.

**Nhận xét thẳng của B khi xem ảnh:**

- Nền, cây, vành bờ nước, mép đất ghép góc: **rõ ràng đẹp và nhất quán hơn** hiện tại (mép ô vuông, cây 1 ô). SAU B dịu và hợp tông cổ phong hơn SAU A.
- Nhân vật của gói: dễ thương nhưng **kém "tu sĩ"** so với đạo sĩ áo trắng cầm kiếm hiện tại; NPC của gói (1 hình) không thay được 15 vai. Ảnh 1 hàng "Quái": 2 loài của gói vs 14 loài hiện tại.
- Cây to gấp ~2 lần so với người (đúng phong cách gói): cảnh có cảm giác "rừng" hơn nhưng che khuất nhiều hơn; cần kiểm tầm nhìn khi đánh quái trong rừng.
- SAU C (pha trộn) dùng được nhưng **hai mật độ điểm ảnh khác nhau** hiện rõ: nhân vật tinh hơn nền. Chấp nhận được nếu người dùng thích hướng này; nếu không, cần thay nhân vật.

**Điều ảnh 3-4 (bản đồ thật) cho thấy thêm:**

- **Rừng quá dày nếu vẽ mỗi ô `T.Tree` một cây của gói** (như ảnh vùng săn): các tán 2 ô chồng lên nhau, nhân vật đứng giữa cụm bị tán vây quanh. Cần một bước **xếp cây** (mỗi khối 2x2 ô cây một cây, ô thừa là bụi / gốc), tán chỉ phủ phần trên thân và mờ khi người chơi ở dưới (mục 7); đây là việc của Bước 2 (và `map:build` S4), không phải của hình gói.
- **Dải 1 ô (bờ cát quanh ao) vẫn rời rạc; ao và đường đất ra sạch sau khi sửa lỗi chuẩn hoá mặt nạ:** bản dựng đầu của B (và bảng tra `WANG_BLOB_LUT` của #1210 lúc review) chọn sai ô khi hai mảng chỉ chạm nhau ở đường chéo (góc bật mà thiếu một cạnh kề): B đo 9-28 % ô đất / nước sai trên 4 bản đồ thật; chuẩn hoá bit góc theo luật Wang (chỉ giữ khi cả hai cạnh kề đều có) làm ao thành mảng liền và đường đất gọn (ảnh trong repo đã dựng lại). Dải cát rộng 1 ô vẫn rời vì bộ 56 ô kiểu blob đẹp với mảng từ 2 ô trở lên: dải 1 ô nên dựng bằng ô viền riêng hoặc làm rộng 2 ô khi dựng bản đồ (S4 / S6).
- **Độ đọc nhân vật phụ thuộc zoom:** ở 360x640 và 915x412 (zoom 0,75) nhân vật gói cao ~24 px màn hình (16 px x2 x 0,75) so với ~29 px hiện tại (39 px x 0,75), đầu to và tối hơn nền; đó là lý do đề xuất giữ nhân vật hiện tại ở hướng C và thêm viền / hào quang vẽ bằng mã nếu thay.
- Nước của gói trong ảnh là khối băng đổi màu (mục 2): sáng và nhạt hơn nước hiện tại; nên chọn lại màu khi có tileset nước thật.

## 7. Rủi ro kỹ thuật và ngân sách

1. **Zoom lẻ.** Camera đặt `zoom = fitZoom(cssW, cssH) * renderScale` (`gfx/scale.ts`: cơ sở `clamp(min(w, h) / 640, 0.75, 1.3)`, nâng lên để giữ vùng nhìn của server `w/zoom <= 1900`, `h/zoom <= 1100`; `renderScale` là DPR): gần như luôn lẻ, nên ảnh 16 px x2 sẽ có điểm ảnh nhoè / rộng hẹp không đều. Cần bật lọc gần nhất + `roundPixels` và cân nhắc làm tròn zoom (vd về bội của 0,5) khi giữ ràng buộc vùng nhìn; đo trên 6 cỡ màn hình trước khi chốt.
2. **Bộ nhớ ảnh và số lệnh vẽ.** Giữ ảnh 16 px (không nướng x2). Tilemap nhiều ô cho cây / tường, KHÔNG sprite rời cho 13 % số ô; cắt theo khung nhìn. Đo bằng `?perf=1` và `perf-budget.json` trước / sau từng bước.
3. **Tải xuống.** `atlasTilesetKb` 1024 KB, `startupGzipKb` 220: 5 tileset của gói clone tổng 80.246 byte PNG (78 KB), dư sức trong ngân sách; nhạc 5,4 MiB phải vào gói tải theo nhu cầu, không vào gói khởi động.
4. **Chữ Hán trên ảnh:** gói không có chữ nhưng phải kiểm từng tệp trước khi nhập (quy tắc asset nguồn).
5. **Bản đồ tất định + ghép góc** là hàm thuần của `tileAt`: hai client cùng ra cùng hình, không đổi byte state.
6. **Hạ cấp:** mọi bước sau cờ (cài đặt đồ hoạ), tắt được; E2E / bot hiện có không phụ thuộc hình.
7. **Ảnh AI đã có** (6 ảnh thẻ bản đồ / màn đăng nhập) không bị ảnh hưởng.

## 8. Nguồn, giấy phép, cách kiểm lại

- Trang chính thức: `https://pixel-boy.itch.io/ninja-adventure-asset-pack`, đọc ngày **21/11/2026**: "They are released under the Creative Commons Zero (CC0) license", "Asset license: Creative Commons Zero v1.0 Universal", "Made by Pixel-Boy and AAA", "Attribution is not required but appreciated". Trang cũng ghi dự án Godot 4 nằm ở GitHub và nội dung hai dự án Godot khác nhau.
- Bản clone: `https://github.com/pixel-boy/NinjaAdventure`, commit `6ac78232d5aedcc85ce5f27d060ea92366f7c24a` (19/04/2024). **Không có tệp LICENSE, API GitHub `license: null`.** Chấp nhận giấy phép dựa trên trang itch.io (Q3).
- Ảnh mẫu trong `docs/art/huong-moi/` là tác phẩm phái sinh từ gói CC0 và atlas hiện tại của nhóm; không nằm trong `client/public/` nên `check:credits` không quét. `CREDITS.md` mục 2 đã liệt kê Ninja Adventure (CC0 1.0) là nguồn tham chiếu.
- **Bằng chứng giấy phép phải lưu ĐỦ (điều kiện của A cho Q3; việc của #1197 / G):** URL trang itch.io, ngày đọc, câu nguyên văn "released under the Creative Commons Zero (CC0) license" + ô "Asset license", băm SHA-256 + kích thước tệp của gói tải về (nếu người dùng tải), commit SHA của bản clone; ghi ở `docs/art/nguon/ninja-adventure.json` và một mục riêng trong `CREDITS.md` (quy tắc Asset nguồn 1).
- **Khi nhập tệp thật** (bước sau): chỉ chép phần dùng, đã chỉnh, vào `client/public/` (không đưa nguyên gói vào repo); MỖI tệp một dòng ở `CREDITS.md` mục 6 kèm SHA-256 thật + ngày + commit gói; thêm thư mục vào `hashDirs` của `check-credits.mjs`; `npm run check:credits` xanh; không chữ Hán; đo ngân sách.

## 9. Kế hoạch triển khai (SAU khi người dùng duyệt)

| Bước | Việc | Người | Ghi chú |
|---|---|---|---|
| 0 | Tài liệu + ảnh mẫu (tệp này) | B | xong, chờ duyệt |
| 1 | Bật lọc điểm ảnh; **lớp nền ghép góc** (`gfx/nen-moi.ts`) dựng từ `tileAt`, cỏ / đất / cát / nước / sàn; cờ cài đặt; ảnh chụp 6 cỡ trước / sau. **Phép ghép góc viết thành hàm thuần dùng chung `shared/src/autotile.ts`** (mặt nạ 8 hàng xóm -> chỉ số ô theo bảng 56 ô của `tileset.tres`, có test; bảng ô là dữ liệu trong repo, không đọc `tileset.tres` lúc chạy), để client giai đoạn 1 và công cụ `map:build` (S4, C) cùng một bản, khỏi lệch nhau (đề nghị của A trên #1204; B làm khi tới bước vẽ nền, PR `shared/` riêng cần dev khác review) | B | khó nhất về kỹ thuật; không đổi server |
| 2 | Cây, đá, tường, công trình bằng tilemap nhiều ô; kiểm tầm nhìn và va chạm | B | đo `drawCalls` |
| 3 | Khí quyển (tia sáng, mây, hạt gói) | B | trong ngân sách hạt |
| 4 | UI khung 9 mảnh | B | `contrast.test.ts` xanh |
| 5 | Nhạc theo nhu cầu (nếu Q5 đồng ý) | B + C (gói tải) | mã hoá lại |
| 6 | Nhập tệp + ghi nguồn từng tệp | G (nhập liệu), B (kiểm) | `check:credits` |
| 7 | Nhân vật / NPC / quái / trùm / vật phẩm / VFX / SFX từ gói đầy đủ | B + G + D / E | chỉ khi Q4 đồng ý và người dùng đặt gói vào máy |
| 8 | Giai đoạn 2 (Tiled) và 3 (ngoại hình theo trang bị) | A + B + E / G | theo mục 62, quyết sau |

## 10. Liên hệ với giai đoạn 2 (bản đồ Tiled, `docs/THIET_KE_BAN_DO_TILED.md`, PR #1201 / #1203)

- **Cỡ ô đã chốt về kỹ thuật (B, 21/11/2026):** ảnh 16 px, phóng 2 lần nguyên số = `TILE` 32, MỘT ô logic = MỘT ô hình; client đặt `layer.setScale(TILE / tilewidth)`. Định dạng Tiled trung lập với cỡ ô (`parseTiledMap` lấy `tile / tilewidth`), nên người dùng chọn hướng nào ở mục 0 cũng không đổi định dạng. Hướng đồ hoạ vẫn chờ người dùng duyệt.
- **Bước 1 ở mục 9 (nền ghép góc dựng ở client từ `tileAt`) là CẦU NỐI tạm:** chạy được ngay, không cần bản đồ Tiled, đo được ngân sách và ảnh trước / sau. Khi S3 / S4 của giai đoạn 2 xong, lớp hình bo góc được nướng sẵn vào `visual.json` (gói `map:<id>` của M7.15) và bộ ghép góc ở client được gỡ; bảng ô terrain đọc từ `tileset.tres` (56 ô, mục 2) là dữ liệu dùng chung cho cả hai.
- **Số đo cho ngân sách (B đo bằng 4 bản đồ hiện có):** lớp logic `firstgid + T` tổng 104,6 KB raw / **11,6 KB gzip** (nhập tĩnh được); lớp hình có nhiều gid gzip 10-18 KB MỖI lớp mỗi bản đồ nên PHẢI đi qua gói tải theo nhu cầu, không vào gói khởi động (`startupGzipKb 220`).
- **Yêu cầu cho lớp hình (chi tiết ở nhận xét của B trên #1201):** tileset NHÚNG (Phaser không đọc tileset ngoài), ĐÙN MÉP 1 px + `roundPixels` (zoom lẻ), MỘT ảnh tileset gộp (giữ `drawCalls`), tán cây ở lớp `over` chỉ phần trên thân và mờ khi người chơi ở dưới (tránh che màn chơi khi đánh quái trong rừng).

## 11. Gói tài nguyên RIÊNG (mục 63): so khớp KỸ THUẬT để người dùng chọn gói thử (B, 22/11/2026)

> Giấy phép từng gói: `docs/GIAY_PHEP_TAI_NGUYEN_RIENG.md` (PR #1275, A). Cơ chế phục vụ / nạp: `docs/THIET_KE_GOI_TAI_NGUYEN_RIENG.md`, `client/src/gfx/private-art.ts` (bảng khoá, hiện RỖNG). **Mục này chỉ nói điều KIỂM ĐƯỢC từ trang công khai và từ mã của repo (cỡ ô, mật độ điểm ảnh, nội dung nêu trên trang, đường ống kỹ thuật). B chưa tải và chưa xem ảnh của gói nào (quy tắc Asset nguồn 4: agent không tự tải), nên KHÔNG kết luận gì về thẩm mỹ hay độ hợp tông "tu tiên" (mục 4): đó là việc của người dùng sau khi xem ảnh trên trang gói. (Câu này đúng lúc viết; từ 22/11 người dùng đã tự tải hai gói và B đã xem: xem đoạn "Cập nhật 22/11" ở cuối mục.)**

**Số liệu từ trang (đọc 22/11/2026 bằng tác tử đọc trang, chưa phải người đọc bằng mắt):**

| Gói (bản được phép) | Ô gốc | Nội dung nêu trên trang | Tệp tải |
|---|---|---|---|
| A. Cainos, Pixel Art Top Down - Basic | **32x32 px** (tileset cỏ / đá 256x256, tường 512x512) | 48 vật trang trí, 15 loại cỏ, 3 cây; trang không nêu nhân vật hay quái | 2,5 MB |
| B. Pixel Frog, Tiny Swords (Free) | **64x64 px** ("Tilemap grid: 64x64 pixels") | nhiều đơn vị, cây, đá, cỏ nhiều màu, bụi cây hoạt hình; trạng thái "In development" | (trang không nêu gọn) |
| D. Daniel Diggle, Sunnyside World (Free) | **16x16 px** | 20 hành động nhân vật (người và yêu tinh), 11 loại cây trồng 5 giai đoạn, 7 kiểu tóc | ~10 MB mỗi gói |
| (C. Kenmi, bản Free: KHÔNG dùng, phi thương mại) | 16x16 px | | |

**So khớp với hạ tầng của Tiên Giới (`TILE = 32`; nhân vật `me` 32x40, quái 32x32, NPC 36x42 vẽ 1x, mục 1):**

| Gói | Tỉ lệ để ra `TILE` 32 | Mật độ điểm ảnh so với sprite hiện tại | Hệ quả kỹ thuật |
|---|---|---|---|
| Cainos (32 px) | **x1, nguyên bản** | **Cùng mật độ**: nền / cây / vật trang trí hợp với nhân vật, quái, NPC đang có; nhược điểm "nền thô hơn nhân vật" của hướng C (mục 3) KHÔNG xảy ra | không cần `setScale`, đùn mép vẫn cần khi zoom lẻ (mục 7.1); `private-art` cùng lưới ô với hình thay thế 32 px mà không phải nướng x2 |
| Sunnyside (16 px) | x2 nguyên số | Mỗi điểm ảnh gói = 2x2 điểm ảnh màn hình, **to gấp đôi sprite hiện tại**: đúng hướng C của mục 3 (nền thô hơn nhân vật) nếu giữ nhân vật cũ; nhân vật 16 px của gói có nguy cơ khó đọc cảnh giới như mục 0.3 (suy ra từ cỡ ô, CHƯA xem ảnh Sunnyside) | cùng đường ống với Ninja Adventure (mục 3 hướng A, mục 10): `layer.setScale(TILE / tilewidth)`, lọc gần nhất, `roundPixels` |
| Tiny Swords (64 px) | **x0,5** | Thu nhỏ một nửa: lọc gần nhất làm mất / chập điểm ảnh; hoặc một ô gói = 2x2 ô game (đổi nghĩa lưới bản đồ, KHÔNG làm vì `shared/`) | **ít hợp nhất** về kỹ thuật; thêm rủi ro `repackage` của giấy phép (GIAY_PHEP mục B) |

**Gợi ý của B (kỹ thuật, KHÔNG phải thẩm mỹ):** nếu người dùng chỉ muốn tải MỘT gói để thử, **Cainos** là gói khớp lưới và mật độ điểm ảnh nhất, giấy phép rõ (A nói "Dùng được"); **Sunnyside** là phương án thứ hai (cùng đường x2 đã chuẩn bị cho Ninja Adventure, nhưng có nhân vật 16 px); **Tiny Swords** để sau. Gói Basic của Cainos chỉ nêu nền / vật trang trí / cây: nhân vật, quái, NPC, trùm vẫn phải giữ như hiện tại hoặc lấy ở nguồn khác (mục 0, hướng C).

**Cập nhật 22/11 (B, sau khi người dùng tự tải hai gói vào `/mnt/data/assets-private/src/`: Cainos Pixel Art Top Down - Basic v1.2.3 và Sunnyside World Free V2.1, có `SOURCES.md`):** B đã xem ảnh của cả hai (giải nén vào thư mục RỖNG MỚI `/mnt/data/assets-private/work/`, bỏ `Gamemaker/` và `__MACOSX` của Sunnyside; không có gì tải từ Internet) và dựng ảnh mẫu NGOÀI git ở `/mnt/data/assets-private/work/mau/` (ảnh ghép từ `tileAt` thật của Lạc Hà Trấn) và `work/mau/trong-game/` (chụp màn chơi thật bằng máy chủ + Chrome với dải ô thử đặt ở `work/dist-thu/`, KHÔNG phải `dist/` thật). Nhận xét thẩm mỹ của B (người dùng quyết, đây chỉ là gợi ý):
- **Cainos**: tàn tích / đá cổ, cỏ ô-liu trầm, cây lớn ba cỡ, bụi, cỏ dại, vật trang trí (hòm, thùng, biển, bình, bia, tượng, đài phun, đèn đá), sàn đá và tường; hợp lưới 32 px và không khí cổ xưa. **Không có nước, cát, đất**; `TX Player.png` chỉ là khối giữ chỗ (KHÔNG dùng). Muốn có nước / cát / đất thì phải đổi bảng màu từ ô khác hoặc lấy ô Sunnyside.
- **Sunnyside**: làng nông trại hoạt hình sáng, bão hoà (kiểu nông trại), có nước / cát / đất, nhà mái đỏ / xanh / cam / tím, cây, cừu, gà, ô UI; 16 px (x2 = 32 px, thô gấp đôi nhân vật); lệch tông tu tiên nên chỉ nên lấy nước / cát / đất nếu cần. **Sunnyside CẤM dùng huấn luyện AI** (và cấm đóng gói lại / bán lại): KHÔNG đưa vào LoRA, dữ liệu ComfyUI hay bất kỳ mô hình nào (dây chuyền ảnh AI ở `docs/KE_HOACH_DO_HOA_AI.md` chỉ dùng SDXL base, không nạp ảnh của gói riêng).
- **Đường ống nạp nền** (PR #1310, `client/src/gfx/private-tileset.ts`): bảng `PRIVATE_ART` và `PRIVATE_MAP_PACKS` vẫn RỖNG nên mặc định không đổi gì; điền bảng + đóng `dist/` thật chờ người dùng duyệt hình (bước 2 bên dưới). Còn thiếu để nền trông "đủ": sàn đá trấn hiện dùng đúng MỘT ô nên phẳng (cần ghép biến thể), lớp cây / bụi / vật trang trí Cainos chưa có đường ống riêng.

**Việc B làm NGAY SAU KHI người dùng đã chọn gói và tự tải vào `/mnt/data/assets-private/src/` (kèm `SOURCES.md`):**
1. Dựng ảnh mẫu trước / sau (như mục 6) **ngoài git**: ảnh mẫu từ gói riêng là tác phẩm đã chỉnh / ghép nên **KHÔNG vào repo** (khác ảnh mẫu Ninja Adventure CC0 ở `docs/art/huong-moi/`); lưu ở `/mnt/data/assets-private/work/` và gửi đường dẫn cho người dùng xem.
2. Sau khi người dùng duyệt hình: chọn khoá và lưới ô, điền `PRIVATE_ART` / `PRIVATE_MAP_PACKS` (`privateArtViolations` đối chiếu với lưới của hình thay thế), đóng gói bằng `npm run assets-private:manifest -w server -- <dist> --strict --title ... --url ... --license ...` (gói itch.io hay có tên tệp chứa khoảng trắng: phải đổi tên tay, `manifest` in `BỎ QUA`), khởi động lại máy chủ.
3. Bước 1 của mục 9 (nền ghép góc) chạy với hình riêng khi có gói, hình thay thế khi thiếu: CI và máy dev không có gói vẫn chạy đủ.
4. Ghi công: màn Ghi công ở Cài đặt hiện `title` + `url` + `license` của gói đang dùng (`PackController.privateCredits()`); `CREDITS.md` chỉ ghi tên gói + link + "tệp không nằm trong repo".

## 12. Ảnh tileset THẬT của lớp hình (QUYET_DINH_M3 mục 67.1, issue #1330, bước a; B, 23/11/2026)

Người dùng đã **duyệt phần cảnh** (mặt đất, cỏ, bụi, cây, đường đất, nước / hồ, bờ cát, vách đá) nên bố cục GIẢ ĐỊNH ở `server/src/systems/map-builder.ts` được thay bằng ảnh thật. Script tất định `client/scripts/art/dung-tileset-world.py` (cần Pillow + gói gốc ở `/mnt/data/assets-src/ninja-adventure`, commit `6ac78232`) dựng MỘT ảnh cho MỖI bản đồ, cùng bố cục, khác bảng màu: `python3 -I client/scripts/art/dung-tileset-world.py --out <thư mục> --preview <ảnh> --map-preview <ảnh>`. Ảnh xem 4 vùng: `docs/art/huong-moi/05-tileset-world-4-vung.png` (trái -> phải: Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân). **Bước a2 (23/11): ảnh `docs/art/huong-moi/06-ban-do-that-4-vung.png` = BỐN BẢN ĐỒ THẬT (`shared/maps/<id>.json`, ba lớp ground / decor / over) vẽ bằng chính tileset vừa dựng** (2 x 2: Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân; mỗi bản đồ một vùng 24 x 16 ô có đủ đất, cát, nước, đá lát, cây, đá, bụi): đây là hình người dùng sẽ thấy khi client vẽ lớp hình (#1206 S3b).

**Bố cục (22 cột, ô 16 px, ĐÙN MÉP margin 1 / spacing 2 = `createExtrudedWorldTileset`; ảnh 396 x 504, ~14 KB mỗi ảnh):**

| Khối (cột, hàng) | Nội dung | Nguồn |
|---|---|---|
| (0, 0) CÁT | 47 ô Wang blob + ô cỏ trơn; đất -> màu cát | khối cỏ / đất của `tileset_floor.png` |
| (0, 7) ĐẤT | như trên, đất theo màu vùng; **ô cỏ trơn nền = (2, 11)** (cục bộ (2, 4)) | khối cỏ / đất |
| (0, 21) NƯỚC | 47 ô blob; nền trắng của băng -> trong suốt rồi **NƯỚNG lên ô cỏ trơn** nên mọi ô nước là ô ĐẶC (không cần lớp nền cỏ riêng, không cần đổi cấu trúc lớp của Tiled) | khối băng |
| (11, 7) ĐÁ LÁT | sàn trấn `T.Stone`: 47 ô blob + ô cỏ trơn; điểm ảnh "đất chính" thay bằng hoạ tiết đá cuội LIỀN MẠCH 16 x 16 (ô sàn nội thất, đổi sang bảng đá của vùng; căn theo lưới ô nên ô đầy liền nhau không lộ khe), bóng / sáng / mép của đất thành đá tối / sáng / vữa | khối cỏ / đất + `tileset_interior_floor.png` ô (6, 13) |
| (16, 27) THÂN CÂY | `GID_TREE_TRUNK` 620, lớp `decor`: đáy rễ của cây nhỏ. **Từ mục 73 (25/11/2026) client KHÔNG vẽ ô này nữa**: mỗi ô 620 là MỘT CÂY NGUYÊN KHỐI (sprite 32 x 32, xem "Cây nguyên khối" dưới bảng); ô giữ lại trong dữ liệu để bản đồ cũ vẫn hợp lệ và để chỉ vị trí cây | `tileset_village_abandoned.png` (72, 112, 16 x 16 điểm ảnh) |
| (17, 27) TÁN CÂY | `GID_TREE_CANOPY` 621, lớp `over`: búp lá tròn 16 x 12 tự vẽ. **Từ mục 73 client bỏ ô này khỏi lớp `over`** (cây nguyên khối đã có tán); giữ trong dữ liệu để tương thích | script |
| (18, 27) ĐÁ | `GID_ROCK` 622, lớp `decor`: tảng đá phủ rêu, rêu theo màu cỏ vùng, đá theo bảng đá lát | `tileset_village_abandoned.png` ô (3, 5) |
| (19, 27) BỤI CỎ | `GID_TALL_GRASS` 623, lớp `decor`: bụi lá, lá đậm hơn nền cỏ một nấc | `tileset_village_abandoned.png` ô (4, 5) |
| còn lại | để trống (trong suốt): vách đá cho bước sau | |

**Cây nguyên khối (mục 73, 25/11/2026).** Gói Ninja Adventure không có "thân" và "tán" rời: cây là một khối tán tròn kèm rễ ở đáy, nên cặp ô thân (đáy rễ 16 x 16) + ô tán (búp lá tự vẽ 16 x 12) lệch nhau, hàng cây dày thành dải tán + dải thân (người dùng báo ở cả 4 bản đồ). Cách làm nay:
- Ảnh `tileset_world.png` (đã đùn mép) có thêm **sprite cây 32 x 32** (cây nhỏ 2 x 2 ô của gói, `tileset_village_abandoned.png` (64, 96, 32 x 32)) ở khung `TREE_FRAME` = (217, 1, 32, 32), vùng trống ô (12..13, 0..1); lá + rễ đổi màu theo vùng như mọi vật thể (cây tuyết Hàn Vân trắng xanh). Sprite KHÔNG nằm trên lưới ô vì đùn mép chèn khe 2 px giữa các ô.
- Client (`client/src/gfx/map-visual.ts`: `visualTreeSpots`, `visualWithoutTreeTiles`; `WorldScene.buildTiledVisual`): MỖI ô GID 620 ở lớp `decor` thành một sprite cây neo ở GỐC (giữa đáy rễ, cách đáy ô logic 3 px để rễ nằm trong ô bị chặn), lật ngang tất định theo ô, **độ sâu = y của gốc** như mọi thực thể (đứng phía bắc cây thì bị tán che, đứng phía nam thì che rễ); ô 620 / 621 bị bỏ khỏi hai lớp ô. Rừng dày: tán các cây chồng nhau theo thứ tự y, chỉ hàng ngoài cùng lộ rễ.
- Va chạm KHÔNG đổi: vẫn theo ô logic `T.Tree` của `shared` (chặn ở gốc, một ô). Bụi cỏ (623) và đá (622) giữ là ô phẳng ở lớp `decor` (dưới chân nhân vật).
- Hằng `VISUAL_TREE_FRAME` (client) và `TREE_FRAME` (script) đối chiếu bằng test; ảnh tileset thật có sprite trong khung được test giải mã PNG. Chụp ảnh cỡ thật 4 bản đồ trước / sau: `node client/scripts/snap-ban-do-cay.mjs --out <thư mục> --tag truoc|sau`; ảnh của lượt sửa ở `docs/screenshots/cay-truoc-*.webp` / `cay-sau-*.webp`.

**Hai điều tìm ra khi dựng (đã xử lý, test canh):**

1. **Khối băng của gói KHÔNG có ô cho ao đơn độc 1 ô** (mặt nạ 0 của `WANG_BLOB_LUT` = ô cục bộ (3, 3), trống; khối đất thì có). Nếu không xử lý thì ao 1 ô sẽ hiện KHOẢNG TRỐNG. Script tự dựng ô này từ chính "giọt đất" cùng vị trí (đất -> nước, viền trong 1 px -> bọt nước, cỏ giữ nguyên), tất định.
2. **Khối đất / băng có bố cục KHÁC ở hàng cục bộ 4-5:** hàng 4 của khối băng chỉ có một phần; ô "đầy dự phòng" (0, 4), (1, 4) của khối đất không có ở khối băng. Chỉ 47 ô của `WANG_BLOB_LUT` được đảm bảo ở cả ba khối; script đọc thẳng `shared/src/autotile.ts` để kiểm (không chép bảng).

**Bảng màu vùng** (đổi TỪNG màu của gói: cỏ 4 màu, đất 4, bụi 2, cát 4, nước 2; không chỉnh HSV): Lạc Hà = bảng "tu tiên" đã duyệt (cỏ ngọc dịu, đất vàng, cát nhạt); Hắc Phong = cỏ ô-liu sẫm + đất tro; Âm Sương = cỏ xanh lục xám + bùn nâu xám, nước đục; Hàn Vân = cỏ -> tuyết trắng xanh, đất -> đá lạnh, nước băng. **Việc tiếp theo:** chốt chỉ số ô với C (#1222: `VARIANT_*` đã khớp (0,0) / (0,7) / (0,21); `GID_GRASS` phải là ô (2, 11) = chỉ số 2 + 11 x 22 = 244 cộng `firstgid` chứ KHÔNG phải ô 0; `VARIANT_STONE` (11, 7) và bốn `GID_*` vật thể (620-623) ĐÃ KHỚP ảnh). **Bước a2 xong: ảnh đã có đá lát + thân / tán / đá / bụi (dưới đây); C chỉ còn hai việc ở `map-builder.ts`: `GID_GRASS` 10 -> 254 và `TILES_WORLD_COUNT` 640 -> 616 (22 x 28 ô thật; script in `CẦN SỬA ...` mỗi lần chạy, test canh); sau đó client vẽ lớp hình (#1206 S3b).**

**Bảng màu thứ năm: Lang Hoang (#1467, QUYET_DINH_M3 mục 75; B, 26/11/2026):** `PALETTES["lang_hoang"]` = "thảo nguyên khô, đá tảng, tuyết thưa" (`docs/COT_TRUYEN.md` 6.1): cỏ úa vàng ô-liu, đất nâu nhạt, bờ cát -> tuyết thưa trắng xám đọng quanh nước lạnh, đá lát xám phiến; cây / đá / bụi theo bảng như các vùng khác (KHÔNG thêm ô vật thể mới). Ảnh `client/public/packs/map-lang_hoang/tileset_world.png` (19,5 KB) cùng bố cục 396 x 504. Ảnh TRƯỚC / SAU cỡ thật (trái = vùng Lang Hoang vẽ bằng bảng màu Lạc Hà, phải = bảng màu riêng) ở `docs/art/huong-moi/07-lang-hoang-truoc-sau.png`, dựng bằng `python3 -I client/scripts/art/dung-tileset-world.py --map-view lang_hoang <ảnh.png>` (bản đồ thêm sau KHÔNG đổi hai ảnh 05 / 06: chúng chỉ gồm `PREVIEW_IDS` = bốn vùng đầu). Thêm bản đồ nữa: thêm khoá vào `PALETTES` + `MAP_PREVIEW_BOX`, id vào `MAP_IDS` của test, chép ảnh dựng vào gói rồi `node client/scripts/build-packs.mjs`, thêm dòng SHA-256 vào `CREDITS.md` mục 2b.

**Bảng màu thứ sáu: Uy Vân Kinh (#1467; B, 26/11/2026):** `PALETTES["uy_van"]` = "đá đỏ, cờ huyết, dòng nước đục; ban đêm" (`docs/COT_TRUYEN.md` 6.2) CHỈ qua bảng màu (bố cục chỉ có 4 ô vật thể, KHÔNG thêm ô cờ): cỏ xám nâu úa, đường / đất thấm máu đỏ gỉ, đá lát đỏ gạch, "bụi" đỏ sẫm, nước đục nâu xám, bờ cát bùn. Ảnh `client/public/packs/map-uy_van/tileset_world.png` (19,5 KB); ảnh trước / sau `docs/art/huong-moi/08-uy-van-truoc-sau.png` (`--map-view uy_van`). Ban đêm là việc của lớp thời tiết / ánh sáng phía client, không nằm trong tileset.

**Client vẽ lớp hình (S3b, B):** `WorldScene.refreshMapVisual()` xin gói `map:<id>` (bản đồ đầu tiên sau đăng nhập cũng xin ở đây), khi gói `ready` VÀ manifest có `map-<id>/tileset_world.png` thì tải `visual.json`, kiểm bằng `sanitizeVisualMap` (sai kích thước / số tileset / gid ngoài tileset / cờ lật / quá 65536 ô / tên ảnh lạ: BỎ cả tệp), nạp ảnh (rộng ĐÚNG 396, cao đủ cho gid lớn nhất) rồi dựng lại nền MỘT lần (gói về muộn sau khi nền cũ đã hiện thì LÀM MỜ CHUYỂN 350 ms, nền cũ gỡ sau khi xong; giảm chuyển động thì thay ngay): ground -10, decor -9, over `worldH - 0.01` (tán phủ trên đầu nhân vật nhưng NGAY DƯỚI hiệu ứng chiêu / vòng chọn mục tiêu ở `worldH`, nhãn / khiên ở `worldH + 1` trở lên), ô 16 px phóng 2 lần; lớp ô cũ + trang trí + nước cũ không vẽ nữa. Thiếu ảnh / tải lỗi / tệp hỏng thì vẽ cách cũ như trước (gói chỉ BỔ SUNG). Cờ, theo thứ tự: `?visual=0` tắt / `?visual=1` bật (thắng mọi thứ khác); **ô "Cảnh bản đồ kiểu mới" trong Cài đặt** (ghi khoá `localStorage` `tg.mapVisual` = `0` / `1`, đổi là cảnh dựng lại NGAY, không cần tải lại); mặc định bật, **trừ khi có `?debug` thì mặc định TẮT** (như thời tiết / sương / nước đứng yên ở `?debug`: các script đo / E2E như `e2e:map`, `check-map-style` (trước là `check-han-van-style`) có cảnh cũ ổn định; muốn thử lớp hình ở `?debug` thì thêm `&visual=1`). Kiểm bằng Chrome thật: `npm run build -w client && node client/scripts/check-map-visual.mjs --shots <thư mục>` (bản sao dist trong thư mục tạm, dựng ảnh bằng script Python nếu dist chưa có). Qua cổng bốn bản đồ với lớp hình bật, server thật: `npm run build -w client && E2E_VISUAL=1 npm run e2e:chuyen-canh -w server` (đủ 3 lớp ở mỗi bản đồ đích, texture bản đồ đã rời được xoá, không lỗi console). Hình trước / sau là `--shots` của script.

**Ảnh ĐÃ vào gói (B, 23/11/2026, `Refs #1330`):** bốn `client/public/packs/map-<id>/tileset_world.png` (396 x 504, ~19 KB; sinh bằng `dung-tileset-world.py`, manifest 12 tệp; test đối chiếu ảnh trong gói == bản dựng lại và khớp `visual.json`); ghi công ở `CREDITS.md` mục 2b (CC0, SHA-256). Ảnh TRƯỚC / SAU của bốn bản đồ ở năm khung nhìn (máy tính HD, tablet dọc, điện thoại ngang / dọc / nhỏ; `capture-viewports.mjs --maps`, nay có cả Lạc Hà `07`): `docs/screenshots/ban-do-hinh-cu/` và `docs/screenshots/ban-do-hinh-moi/`. Tắt khi cần: `?visual=0` hoặc khoá `tg.mapVisual` = `0`.

**Cây trong bản vẽ đầu (cần người dùng nhìn rồi nói):** một ô `T.Tree` = thân (rễ + đáy tán, dưới chân nhân vật) + búp lá viền đen (phủ trên đầu). Rừng đặc hiện ra như hàng búp tròn có dải rễ dưới mỗi hàng (xem Hắc Phong / Âm Sương ở ảnh 06). Cây thật của gói to 2 x 2 hoặc 4 x 3 ô (`02-canh-truoc-sau.png`) nên cây 1 ô nhỏ và đều hơn bản người dùng đã duyệt; nếu người dùng muốn rừng liền khối thì cần chế độ tán `cluster_top` + ô tán RIÊNG của mép rừng (bước sau, cần quyết hướng).

