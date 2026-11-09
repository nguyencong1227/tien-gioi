# Nguồn tài nguyên (Credits & Licenses)

Tiên Giới chỉ sử dụng các bộ tài nguyên (hình ảnh, hiệu ứng, âm thanh) tự tạo của dự án hoặc có giấy phép mở (**CC0 1.0 Public Domain** / **CC-BY 3.0 / 4.0**), cho phép sử dụng và chỉnh sửa trong trò chơi công khai. Toàn bộ thế giới, địa danh (Lạc Hà Trấn, Vân Mộng Sơn), hệ thống cảnh giới và nhân vật là sáng tạo riêng của Tiên Giới.

---

## 1. Tài nguyên đang đóng gói trong repo (`client/public/assets/` & `client/src/audio.ts`)

Toàn bộ các file hình ảnh pixel-art và âm thanh hiện tại trong repo được tạo riêng cho **Tiên Giới** và phát hành theo giấy phép **CC0 1.0 Public Domain**:

| Tài nguyên | File trong repo | Tác giả & Công cụ tạo | Giấy phép |
|---|---|---|---|
| **Tileset bản đồ** (8 ô địa hình `32×32` px: `Grass`, `TallGrass`, `Dirt`, `Water`, `Tree`, `Rock`, `Stone`, `Sand`) | `client/public/assets/tileset.png` | **Nhóm Tiên Giới (Dev B)** — sinh và đóng gói bằng script `client/scripts/gen-assets.mjs` (`npm run assets -w client`) | **CC0 1.0** |
| **Texture Atlas nhân vật, NPC, yêu thú & hiệu ứng** (`me`, `other` 4 hướng `idle`/`walk`/`slash`; 4 yêu thú `mon-tho`, `mon-lang`, `mon-ho`, `mon-mang`; 4 NPC `npc-truong_tran`, `npc-duoc_su`, `npc-tho_ren`, `npc-cao_thi`; `swordbeam`, `dot`, `item-*`) | `client/public/assets/atlas.png`, `client/public/assets/atlas.json` | **Nhóm Tiên Giới (Dev B)** — vẽ pixel-art và đóng gói Phaser 3 JSON Atlas bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** |
| **Ảnh biểu tượng vật phẩm DOM** (`hoi_huyet_dan`, `hoi_linh_dan`, `tu_khi_dan`, `long_tho`, `nanh_soi`, `da_ho`, `vay_mang`) | `client/public/assets/items/*.png` | **Nhóm Tiên Giới (Dev B)** — sinh từ `client/scripts/gen-assets.mjs` | **CC0 1.0** |
| **Nhạc nền ngũ cung & hiệu ứng âm thanh (SFX)** (nhạc Lạc Hà Trấn, nhạc hoang dã, tiếng kiếm chém, kiếm khí, trúng đòn, nhặt đồ, lên cấp, đột phá) | `client/src/audio.ts` | **Nhóm Tiên Giới (Dev B)** — tổng hợp thời gian thực bằng Web Audio API | **CC0 1.0** |

> **Cách đóng gói lại atlas khi thêm sprite mới:** sửa hoặc bổ sung hàm vẽ trong `client/scripts/gen-assets.mjs`, sau đó chạy `npm run assets -w client`.

---

## 2. Nguồn tài nguyên mở tham chiếu / mở rộng (CC0 & CC-BY)

Khi bổ sung thêm sprite, biểu tượng hoặc hiệu ứng từ thư viện cộng đồng ở các sprint tiếp theo, chỉ chọn từ các bộ đã kiểm tra giấy phép dưới đây và ghi nhận đầy đủ:

| Hạng mục | Bộ asset | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|
| Địa hình & kiến trúc bổ sung | **Roguelike/RPG Pack**, **Tiny Town**, **Tiny Dungeon** | **Kenney Vleugels** ([kenney.nl/assets](https://kenney.nl/assets)) | **CC0 1.0** |
| Nhân vật & quái cổ trang Á Đông | **Ninja Adventure Asset Pack** | **Pixel-boy & AAA** ([pixel-boy.itch.io/ninja-adventure-asset-pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack)) | **CC0 1.0** |
| Biểu tượng RPG cổ điển | **496 Pixel Art Icons for Medieval/Fantasy RPG** | **Henrique Lazarini (7Soul1)** ([opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg)) | **CC0 1.0** |

---

## 3. Tuyên bố tuân thủ bản quyền

1. **Không sử dụng tài nguyên độc quyền hoặc thương mại chưa cấp phép.**
2. **Tuân thủ ghi công (Attribution) đối với CC-BY 3.0 / 4.0:** Mọi tài nguyên CC-BY khi đưa vào `client/public/assets/` đều được ghi rõ tên tác giả, tên bộ tài nguyên, liên kết gốc và loại giấy phép trong file `CREDITS.md` này.
