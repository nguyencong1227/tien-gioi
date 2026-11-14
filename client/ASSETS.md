# Quy ước Asset Client (`client/ASSETS.md`)

Tài liệu này quy định cách đặt tên key texture, kích thước ảnh, cấu trúc thư mục `client/public/assets/`, cách đóng gói texture atlas và các bước thêm quái/vật phẩm mới để **Dev A** và **Dev B** có thể làm việc độc lập mà không lệch key.

---

## 1. Cấu trúc thư mục

Toàn bộ asset tĩnh phục vụ runtime đặt trong `client/public/assets/` (Vite tự phục vụ ở đường dẫn `/assets/...`):

```text
client/
├── assets-src/                  # (Tùy chọn) File nguồn rời trước khi đóng gói atlas (PNG lẻ)
│   ├── characters/
│   ├── monsters/
│   ├── items/
│   └── fx/
└── public/
    └── assets/
        ├── tileset.png          # Dải tile 32×32 theo thứ tự enum T (shared/src/map.ts)
        ├── atlas.png            # Texture atlas gộp nhân vật, quái, vật phẩm, hiệu ứng
        ├── atlas.json           # Metadata Phaser 3 (JSON Hash / JSON Array) sinh từ free-tex-packer
        └── audio/               # Âm thanh (Sprint 2, định dạng .ogg + .mp3 hoặc .webm)
            ├── bgm-town.ogg
            ├── bgm-wild.ogg
            └── sfx-*.ogg
```

> **Cơ chế tương thích ngược (Fallback):**
> Khi phát triển hoặc khi một key chưa có trong `public/assets/`, `makeTextures(scene)` trong `client/src/textures.ts` chỉ tạo ảnh tạm nếu `!scene.textures.exists(key)`. Nhờ vậy, Dev A có thể thêm quái hoặc vật phẩm mới trong `shared/` ngay lập tức mà không bị lỗi thiếu ảnh trên client.

---

## 2. Quy ước Key Texture & Kích thước

Giữ nguyên các key hiện tại để `WorldScene.ts` không phải đổi logic hiển thị:

### 2.1. Bản đồ (`tileset`)
- **Key:** `"tileset"` (`TILESET_KEY` trong `client/src/textures.ts`).
- **Kích thước:** mỗi ô `32×32` px (`TILE = 32` trong `shared/src/map.ts`).
- **Bố cục dải ngang (`256×32` px cho 8 loại ô):** chỉ số ô khớp chính xác với `enum T` trong `shared/src/map.ts`:
  | Index | Enum `T` | Ý nghĩa | Chặn đường (`BLOCKING`) |
  |---|---|---|---|
  | `0` | `T.Grass` | Đồng cỏ | Không |
  | `1` | `T.TallGrass` | Cỏ cao | Không |
  | `2` | `T.Dirt` | Đường đất | Không |
  | `3` | `T.Water` | Sông hồ | **Có** |
  | `4` | `T.Tree` | Rừng cây | **Có** |
  | `5` | `T.Rock` | Núi đá | **Có** |
  | `6` | `T.Stone` | Nền đá lát Lạc Hà Trấn | Không |
  | `7` | `T.Sand` | Bờ cát | Không |

### 2.2. Nhân vật người chơi (`me`, `other`)
- **Key tĩnh (M1 / fallback):** `"me"` (nhân vật của mình), `"other"` (đạo hữu khác).
- **Kích thước khung (frame):** `32×40` px (điểm gốc mặc định giữa khung, trong container đặt ở `y = -12` để chân nhân vật khớp tâm vòng va chạm `PLAYER_RADIUS = 11`).
- **Hoạt ảnh (Sprint 1):**
  - Khi dùng spritesheet/atlas 4 hướng, các frame đặt tên theo mẫu:
    - `<key>-idle-<dir>`: `dir` ∈ `down | up | side` (hướng trái dùng `setFlipX(true)` từ `side` hoặc dùng đủ 4 hướng `down | up | left | right`).
    - `<key>-walk-<dir>-0..3`: 4 frame đi bộ (8 FPS).
    - `<key>-slash-<dir>-0..2`: 3 frame vung kiếm (12 FPS).
  - Key animation trong Phaser: `"me-idle-down"`, `"me-walk-down"`, `"me-slash-down"`, tương tự cho `"other-..."`.

### 2.3. Yêu thú / Quái vật (`mon-<id>`)
- **Key:** `"mon-<id>"` — trong đó `<id>` lấy trực tiếp từ `MonsterKind.id` trong `shared/src/game.ts`:
  | Key texture | `MonsterKind.id` | Tên quái | `radius` (va chạm) | Kích thước sprite gợi ý |
  |---|---|---|---|---|
  | `mon-tho` | `"tho"` | Linh Thố | `10` px | `32×32` px |
  | `mon-lang` | `"lang"` | Hôi Lang | `13` px | `40×40` px |
  | `mon-ho` | `"ho"` | Hắc Hổ | `16` px | `48×48` px |
  | `mon-mang` | `"mang"` | Xích Mãng (Boss) | `24` px | `64×64` px |
- **Hướng nhìn:** mặc định sprite gốc quay mặt sang **phải** (`angle = 0`). Khi `Math.cos(m.angle) < 0`, `WorldScene` tự gọi `sprite.setFlipX(true)` để lật sang trái.
- **Hoạt ảnh (tùy chọn trong atlas):** nếu có nhiều frame, đặt tên `mon-<id>-0`, `mon-<id>-1`, ... và giữ frame mặc định tên `mon-<id>` để `this.add.image(..., "mon-<id>")` hoặc `this.add.sprite(..., "atlas", "mon-<id>")` luôn hoạt động.

### 2.4. Hiệu ứng (`swordbeam`, `dot`, ...)
- `"swordbeam"`: `48×12` px, mũi kiếm khí hướng sang phải (`angle = 0`), `WorldScene` tự xoay theo `setRotation(angle)`.
- `"dot"`: `16×16` px, hình tròn trắng có biên mềm, dùng để nhuộm màu (`setTint`) cho hạt linh khí / hiệu ứng.

### 2.5. Vật phẩm & NPC (chuẩn bị cho Sprint 1–2)
- **Vật phẩm / Đồ rơi:** `"item-<itemId>"` (`24×24` px hoặc `32×32` px), khớp với `ItemDef.id` trong `shared/src/items.ts` (ví dụ: `item-hoi_huyet_dan`, `item-nanh_soi`).
- **NPC:** `"npc-<npcId>"` (`32×40` px), khớp với `NpcDef.id` trong `shared/src/npcs.ts`.

---

## 3. Đóng gói Texture Atlas (`client/scripts/gen-assets.mjs` / `free-tex-packer`)

Để giảm số lần vẽ (draw calls) trên điện thoại, các sprite được đóng gói thành một atlas duy nhất (`client/public/assets/atlas.png` + `atlas.json`) cùng `tileset.png` và `items/*.png` thông qua script trong repo:

```bash
npm run assets -w client
```

Script `client/scripts/gen-assets.mjs` tự động vẽ và sắp xếp toàn bộ các frame vào `atlas.png` (`512×512`) và xuất `atlas.json` theo chuẩn Phaser 3 JSON Hash. Khi dùng thêm ảnh rời từ `client/assets-src/` với `free-tex-packer`:

### Quy ước khi đóng gói:
- **Định dạng xuất:** Phaser 3 (`Phaser3` hoặc `JSONHash`), bỏ đuôi `.png` trong tên frame (`removeFileExtension: true`) để tên file `mon-tho.png` trở thành frame key `"mon-tho"`.
- **Padding / Extrude:** `padding: 2`, `extrude: 1` (tránh lem viền pixel khi camera zoom lẻ trên màn hình điện thoại).
- **Kích thước tối đa:** `2048×2048` px (tương thích mọi GPU điện thoại tầm trung).

Ví dụ cấu hình với `free-tex-packer-core` (hoặc bản GUI *Free Texture Packer*):
```json
{
  "textureName": "atlas",
  "width": 2048,
  "height": 2048,
  "fixedSize": false,
  "padding": 2,
  "extrude": 1,
  "allowRotation": false,
  "detectIdentical": true,
  "allowTrim": true,
  "exporter": "Phaser3",
  "removeFileExtension": true,
  "prependFolderName": false
}
```

---

## 4. Hướng dẫn: Tự thêm một con quái mới (dành cho cả Dev A & Dev B)

Giả sử cần thêm quái mới **Thanh Hồ** với `id: "ho_ly"`:

### Bước 1: Khai báo trong `shared/src/game.ts`
Thêm phần tử vào mảng `MONSTERS` và `MONSTER_CAP`:
```ts
// shared/src/game.ts
{
  id: "ho_ly",
  name: "Thanh Hồ",
  minDanger: 0.35,
  hp: 300,
  atk: 26,
  speed: 130,
  radius: 14,
  aggro: 180,
  attackRange: 34,
  attackCd: 1200,
  exp: 55,
  color: 0x5cc8b8, // Màu dùng cho ảnh tạm nếu chưa có sprite thật
}
```
> **Lưu ý:** Ngay sau Bước 1, chưa cần thêm file ảnh nào thì game **vẫn chạy được ngay** vì `makeTextures()` trong `client/src/textures.ts` tự sinh texture `"mon-ho_ly"` theo `radius` và `color`.

### Bước 2: Thêm ảnh thật cho Client
1. Chuẩn bị ảnh PNG nền trong suốt, mặt quay sang phải, kích thước khoảng `(radius * 2 + 12)` px (với `radius = 14` → chọn `40×40` hoặc `48×48` px).
2. Đặt tên file là `mon-ho_ly.png`:
   - **Nếu nạp ảnh lẻ:** đặt tại `client/public/assets/monsters/mon-ho_ly.png` và nạp trong `preload()` của `WorldScene`:
     ```ts
     this.load.image("mon-ho_ly", "/assets/monsters/mon-ho_ly.png");
     ```
   - **Nếu dùng chung Atlas:** bỏ `mon-ho_ly.png` vào `client/assets-src/monsters/` rồi chạy đóng gói lại `atlas.png` + `atlas.json`.
3. Ghi rõ nguồn và giấy phép (CC0 / CC-BY, hoặc theo `AGENTS.md` mục Asset: ảnh AI SDXL base, nội dung Vạn Kiếp Tu Tiên đã được tác giả cho phép) của sprite vừa thêm vào `CREDITS.md`.
