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

**Nhận xét thẳng của B khi xem ảnh:**

- Nền, cây, vành bờ nước, mép đất ghép góc: **rõ ràng đẹp và nhất quán hơn** hiện tại (mép ô vuông, cây 1 ô). SAU B dịu và hợp tông cổ phong hơn SAU A.
- Nhân vật của gói: dễ thương nhưng **kém "tu sĩ"** so với đạo sĩ áo trắng cầm kiếm hiện tại; NPC của gói (1 hình) không thay được 15 vai. Ảnh 1 hàng "Quái": 2 loài của gói vs 14 loài hiện tại.
- Cây to gấp ~2 lần so với người (đúng phong cách gói): cảnh có cảm giác "rừng" hơn nhưng che khuất nhiều hơn; cần kiểm tầm nhìn khi đánh quái trong rừng.
- SAU C (pha trộn) dùng được nhưng **hai mật độ điểm ảnh khác nhau** hiện rõ: nhân vật tinh hơn nền. Chấp nhận được nếu người dùng thích hướng này; nếu không, cần thay nhân vật.

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
- **Khi nhập tệp thật** (bước sau): chỉ chép phần dùng, đã chỉnh, vào `client/public/` (không đưa nguyên gói vào repo); MỖI tệp một dòng ở `CREDITS.md` mục 6 kèm SHA-256 thật + ngày + commit gói; thêm thư mục vào `hashDirs` của `check-credits.mjs`; `npm run check:credits` xanh; không chữ Hán; đo ngân sách.

## 9. Kế hoạch triển khai (SAU khi người dùng duyệt)

| Bước | Việc | Người | Ghi chú |
|---|---|---|---|
| 0 | Tài liệu + ảnh mẫu (tệp này) | B | xong, chờ duyệt |
| 1 | Bật lọc điểm ảnh; **lớp nền ghép góc** (`gfx/nen-moi.ts`) dựng từ `tileAt`, cỏ / đất / cát / nước / sàn; cờ cài đặt; ảnh chụp 6 cỡ trước / sau | B | khó nhất về kỹ thuật; không đổi server |
| 2 | Cây, đá, tường, công trình bằng tilemap nhiều ô; kiểm tầm nhìn và va chạm | B | đo `drawCalls` |
| 3 | Khí quyển (tia sáng, mây, hạt gói) | B | trong ngân sách hạt |
| 4 | UI khung 9 mảnh | B | `contrast.test.ts` xanh |
| 5 | Nhạc theo nhu cầu (nếu Q5 đồng ý) | B + C (gói tải) | mã hoá lại |
| 6 | Nhập tệp + ghi nguồn từng tệp | G (nhập liệu), B (kiểm) | `check:credits` |
| 7 | Nhân vật / NPC / quái / trùm / vật phẩm / VFX / SFX từ gói đầy đủ | B + G + D / E | chỉ khi Q4 đồng ý và người dùng đặt gói vào máy |
| 8 | Giai đoạn 2 (Tiled) và 3 (ngoại hình theo trang bị) | A + B + E / G | theo mục 62, quyết sau |
