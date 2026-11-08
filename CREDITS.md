# Nguồn tài nguyên (Credits & Licenses)

Tiên Giới chỉ sử dụng các bộ tài nguyên (hình ảnh, hiệu ứng, âm thanh) có giấy phép mở (**CC0 1.0 Public Domain** hoặc **CC-BY 3.0 / 4.0**), cho phép sử dụng và chỉnh sửa trong trò chơi công khai. Toàn bộ thế giới, địa danh (Lạc Hà Trấn), hệ thống cảnh giới và nhân vật là sáng tạo riêng của Tiên Giới.

---

## 1. Bản đồ & Môi trường (Tileset)

| Hạng mục | Bộ asset đã chọn | Tác giả / Nguồn | Giấy phép | Ghi chú sử dụng |
|---|---|---|---|---|
| Địa hình cơ bản (`Grass`, `TallGrass`, `Dirt`, `Water`, `Sand`, `Stone`) | **Roguelike/RPG Pack** (1,700+ tiles, scale lên 32×32 px) | **Kenney Vleugels** ([kenney.nl/assets/roguelike-rpg-pack](https://kenney.nl/assets/roguelike-rpg-pack)) | **CC0 1.0** | Trích xuất và sắp xếp thành dải 8 ô `32×32` (`256×32` px) khớp thứ tự enum `T` trong `shared/src/map.ts` |
| Kiến trúc trấn, cây cối (`Tree`), núi đá (`Rock`), vật trang trí Lạc Hà Trấn | **Tiny Town** & **Tiny Dungeon** | **Kenney Vleugels** ([kenney.nl/assets/tiny-town](https://kenney.nl/assets/tiny-town), [kenney.nl/assets/tiny-dungeon](https://kenney.nl/assets/tiny-dungeon)) | **CC0 1.0** | Dùng cho cây tùng/trúc, tảng đá chặn đường và trang trí khu an toàn Lạc Hà Trấn |

---

## 2. Nhân vật & NPC (Sprites 4 hướng)

| Hạng mục | Bộ asset đã chọn | Tác giả / Nguồn | Giấy phép | Ghi chú sử dụng |
|---|---|---|---|---|
| Tu sĩ người chơi (`me`, `other`) và NPC Lạc Hà Trấn (`truong_tran`, `duoc_su`, `tho_ren`, `cao_thi`) | **Ninja Adventure Asset Pack** (nhân vật cổ trang Á Đông, đạo sĩ, hiệp khách, dân làng, 4 hướng đi + đứng + đánh) | **Pixel-boy & AAA** ([pixel-boy.itch.io/ninja-adventure-asset-pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) / OpenGameArt) | **CC0 1.0** | Có sẵn hoạt ảnh 4 hướng (xuống, lên, trái, phải), đứng yên, vung vũ khí, hợp phong cách tu tiên Á Đông mà không vướng ràng buộc copyleft |
| Bộ trang phục bổ sung (áo bào tu sĩ, kiếm đeo lưng cho Sprint 3) | **LPC Base Assets / Universal LPC Spritesheet** (chỉ chọn các lớp đánh dấu CC0 / CC-BY 3.0) | **Stephen Challener (Redshrike), Johannes Sjölund (wulax), Matthew Krohn (makrohn)** ([opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles)) | **CC-BY 3.0** | Khi dùng lớp LPC trong Sprint 3 (đổi màu đạo bào theo trang bị), giữ nguyên ghi nhận tác giả tại mục này |

---

## 3. Yêu thú / Quái vật (`mon-<id>`)

| Mã quái (`id`) | Tên trong game | Bộ asset đã chọn | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|---|
| `tho` | **Linh Thố** (thỏ linh) | **LPC Bunny / Rabbit** & **Tiny Creatures** | **Stephen Challener (Redshrike)** ([opengameart.org/content/lpc-bunny](https://opengameart.org/content/lpc-bunny)) / **Kenney** | **CC-BY 3.0** / **CC0 1.0** |
| `lang` | **Hôi Lang** (sói xám) | **LPC Wolf Animation** / **Pixel-boy Beast Pack** | **Stephen Challener (Redshrike), William.Thompsonj** ([opengameart.org/content/lpc-wolf-animation](https://opengameart.org/content/lpc-wolf-animation)) | **CC-BY 3.0** |
| `ho` | **Hắc Hổ** (hổ đen) | **Cat / Tiger Fighter Sprite** (chỉnh bảng màu đen – vàng kim cho Hắc Hổ) | **Elthen / OpenGameArt CC0 Creatures** & **Redshrike** ([opengameart.org](https://opengameart.org)) | **CC0 1.0** / **CC-BY 3.0** |
| `mang` | **Xích Mãng** (trùm rắn đỏ) | **Snake / Serpent Sprite Sheet** (chỉnh sắc đỏ thẫm + vảy vàng kim) | **Pixel-boy & AAA** (*Ninja Adventure Asset Pack* – Giant Snake/Boss) & **Redshrike** | **CC0 1.0** / **CC-BY 3.0** |

---

## 4. Vật phẩm, Biểu tượng & Hiệu ứng chiến đấu (VFX / Icons)

| Hạng mục | Bộ asset đã chọn | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|
| Hiệu ứng kiếm chém (`slash`), luồng kiếm khí (`swordbeam`), vòng đột phá (`levelup`), hạt sáng (`dot`) | **Particle Pack** & **Smoke Particles** | **Kenney Vleugels** ([kenney.nl/assets/particle-pack](https://kenney.nl/assets/particle-pack)) | **CC0 1.0** |
| Biểu tượng đan dược (`hoi_huyet_dan`, `hoi_linh_dan`, `tu_khi_dan`), nguyên liệu yêu thú (`long_tho`, `nanh_soi`, `da_ho`, `vay_mang`), trang bị (`weapon`, `robe`, `talisman`) | **RPG Urban Pack / Fantasy UI Borders / 496 Pixel Art Icons for Medieval/Fantasy RPG** | **Kenney Vleugels** ([kenney.nl](https://kenney.nl/assets)) & **Henrique Lazarini (7Soul1)** ([opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg)) | **CC0 1.0** |

---

## 5. Âm thanh & Nhạc nền (Audio – chuẩn bị cho Sprint 2)

| Hạng mục | Bộ asset đã chọn | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|
| Âm thanh chém kiếm, kiếm khí, trúng đòn, quái tấn công | **RPG Audio** & **Impact Sounds** | **Kenney Vleugels** ([kenney.nl/assets/rpg-audio](https://kenney.nl/assets/rpg-audio), [kenney.nl/assets/impact-sounds](https://kenney.nl/assets/impact-sounds)) | **CC0 1.0** |
| Âm thanh giao diện (mở túi đồ, nhặt đồ, dùng đan dược, bấm nút, lên bậc, đột phá) | **Interface Sounds** & **UI Audio** | **Kenney Vleugels** ([kenney.nl/assets/interface-sounds](https://kenney.nl/assets/interface-sounds), [kenney.nl/assets/ui-audio](https://kenney.nl/assets/ui-audio)) | **CC0 1.0** |
| Nhạc nền Lạc Hà Trấn (thanh bình) và ngoài hoang dã (săn yêu thú) | **Asian / Eastern Fantasy Chiptune & Ambient Tracks (CC0)** | **Spring / SubspaceAudio (Juhani Junkala)** ([opengameart.org/content/5-chiptunes-action](https://opengameart.org/content/5-chiptunes-action)) & **PeriTune** ([peritune.com](https://peritune.com/about/)) | **CC0 1.0** / **CC-BY 4.0** |

---

## 6. Tóm tắt điều khoản giấy phép

- **CC0 1.0 Universal (Public Domain Dedication):** Toàn quyền sao chép, chỉnh sửa, đóng gói và phát hành thương mại/phi thương mại mà không bắt buộc ghi công (nhưng vẫn được liệt kê tại đây để minh bạch nguồn gốc).
  - Toàn văn: <https://creativecommons.org/publicdomain/zero/1.0/>
- **CC-BY 3.0 / CC-BY 4.0 (Creative Commons Attribution):** Cho phép sao chép, chỉnh sửa (kể cả đổi màu, cắt ghép sprite, đóng gói texture atlas) và phát hành công khai với điều kiện giữ phần ghi nhận tác giả ở trên.
  - Toàn văn CC-BY 3.0: <https://creativecommons.org/licenses/by/3.0/>
  - Toàn văn CC-BY 4.0: <https://creativecommons.org/licenses/by/4.0/>
