# Phong cách minh hoạ của Tiên Giới (Bước 0 của ảnh AI, M7.12 #513, `QUYET_DINH_M3.md` mục 46)

> **Dùng cho ai:** Dev C (chạy ComfyUI + SDXL base theo trang này) và Dev B (chọn ảnh, hậu kỳ, đưa vào game). Mọi con số, từ khoá và prompt dưới đây là **một bản sao có kiểm tra** của `client/scripts/art/prompt-rules.mjs`: `client/scripts/art/prompt-rules.test.ts` đỏ nếu trang này lệch mã, và `npm run check:credits` đỏ nếu một tệp `docs/art/nguon/*.json` có prompt vi phạm luật ở mục 3.
> **Ranh giới không đổi** (`AGENTS.md` mục Asset, nguồn 2; `docs/KE_HOACH_DO_HOA_AI.md`): chỉ **SDXL base** (không LoRA, không model khác), ComfyUI chỉ nghe 127.0.0.1, giới hạn RAM, tự tắt sau khi sinh, ảnh thô ở `/mnt/data/comfyui/output/`, không chạy cùng lúc với đo hiệu năng GPU, **không chữ / chữ Hán / chữ lạ trên ảnh**, prompt **không nêu tên, nhân vật hay phong cách của game khác**.

## 1. Tinh thần
Tranh phong cảnh **vẽ tay mềm** (mực loang + bột màu), màu **dịu và trầm**, nhiều **sương** tạo chiều sâu, ánh sáng đổi theo bản đồ; không có người, không có chữ, không có khung viền. Ảnh phải ĂN MÀU với trò chơi: cùng bảng màu với nền bản đồ trong game (`MAP_STYLES`) và giao diện (`style.css`), để thẻ minh hoạ đặt cạnh bản đồ thật không lạc tông.

## 2. Bảng màu (10 màu)
Lấy THẲNG từ mã (test đối chiếu từng màu với `style.css` / `MAP_STYLES`). Dùng làm **neo màu trong prompt** (bằng lời, vì SDXL không nhận mã hex) và làm thước để B duyệt: ảnh chọn phải có màu chủ đạo gần màu của bản đồ nó minh hoạ, ít nhất một vùng gần `ink` làm bóng và một vùng gần `paper` làm sáng, `red` chỉ là điểm nhấn nhỏ.

| id | màu | vai trò | nguồn |
|---|---|---|---|
| `ink` | `#1d1a16` | nền tối, bóng đổ, nét mực | `style.css` `--ink` |
| `paper` | `#f3ecda` | vùng sáng, giấy, mây sương | `style.css` `--paper` |
| `gold` | `#c9a24a` | điểm nhấn ấm, ánh linh khí | `style.css` `--gold` |
| `red` | `#a31d1d` | điểm nhấn nguy hiểm, rất ít | `style.css` `--red` |
| `mp` | `#3f7fa6` | điểm nhấn lạnh, linh lực | `style.css` `--mp` |
| `lac_ha` | `#ffe2b0` | Lạc Hà: ấm, hoa đào | `MAP_STYLES.lac_ha.ambient.color` |
| `hac_phong` | `#8c93a6` | Hắc Phong: xám lam, tro | `MAP_STYLES.hac_phong.ambient.color` |
| `bi_canh_linh_hu` | `#7fe3d4` | Linh Hư: lam ngọc | `MAP_STYLES.bi_canh_linh_hu.ambient.color` |
| `am_suong` | `#7c9a76` | Âm Sương: xanh rêu, sương | `MAP_STYLES.am_suong.ambient.color` |
| `han_van` | `#bcd6f2` | Hàn Vân: băng, tuyết | `MAP_STYLES.han_van.ambient.color` |

## 3. Luật prompt (máy kiểm, `promptViolations`)
**Bắt buộc trong prompt dương:** ít nhất MỘT neo phong cách tranh (`painterly`, `painting`, `ink wash`, `gouache`, `watercolor`, `watercolour`, `matte painting`) và đúng mệnh đề `no text` (mệnh đề = đoạn giữa hai dấu phẩy).
**Bắt buộc trong prompt âm:** `text`, `letters`, `watermark`, `signature`, `logo`, `cjk`, `chinese characters`. Prompt âm chuẩn của mọi lô:

```text
text, letters, words, calligraphy, watermark, signature, logo, cjk, chinese characters, frame, border, blurry, lowres, distorted, modern, futuristic, photorealistic, human face, western fantasy, anime, 3d render
```

**CẤM trong prompt dương** (so khớp theo từ nguyên vẹn, không phân biệt hoa thường; các mệnh đề phủ định như `no people`, `without text`, `avoid …` được bỏ qua khi quét, vì vậy `no text` hợp lệ còn `text` thì cấm):

- **tên game / truyện / thương hiệu khác:** `genshin`, `honkai`, `warcraft`, `diablo`, `league of legends`, `dota`, `perfect world`, `jade dynasty`, `zhu xian`, `tru tien`, `van kiep`, `path of exile`, `elden ring`, `dark souls`, `sekiro`, `black myth`, `wukong`, `final fantasy`, `pokemon`, `maplestory`, `ragnarok`, `lineage`, `disney`, `marvel`, `ghibli`
- **nghệ sĩ / phong cách của một người:** `greg rutkowski`, `artgerm`, `wlop`, `ruan jia`, `makoto shinkai`, `miyazaki`, `thomas kinkade`, `craig mullins`, `in the style of`, `style of`, `inspired by`, `reminiscent of`, `fan art`, `fanart`
- **gợi chữ / ký tự (SDXL vẽ chữ giả):** `text`, `letters`, `calligraphy`, `inscription`, `signboard`, `sign board`, `banner with`, `scroll with`, `writing`, `poem`, `seal`, `stamp`, `hanzi`, `kanji`, `glyph`, `rune`, `runes`, `symbols`
- **thể loại kéo ảnh về kiểu game khác:** `chinese`, `xianxia`, `wuxia`, `xuanhuan`, `anime`, `manga`, `chibi`, `video game`, `game art`, `game`, `screenshot`, `trending on`, `artstation`, `pixiv`, `deviantart`, `unreal engine`, `octane`
- **ảnh chụp / người thật:** `photorealistic`, `photo realistic`, `photograph`, `photo of`, `real person`, `celebrity`, `portrait of`

Lý do từng nhóm: tên game / truyện / nghệ sĩ khác vi phạm quy tắc Asset; từ gợi chữ khiến SDXL vẽ ký tự giả (phải xoá ở hậu kỳ, mất công, dễ sót); `chinese` / `xianxia` / `wuxia` / `anime` kéo ảnh về đúng kiểu nhân vật và kiến trúc của các game đó và đẻ ra chữ Hán; `photorealistic` / `portrait of` kéo về ảnh chụp và mặt người thật. Dùng "eastern mountain", "cultivation fantasy", "timber houses", "stone watchtower"... là đủ. Thêm từ cấm mới thì sửa `BANNED_PROMPT_TERMS` rồi chạy lại `prettier` + test (trang này phải liệt kê nó).

## 4. Các lớp ảnh, tỉ lệ khung, dung lượng
| lớp | dùng ở | tỉ lệ | thô (SDXL) | cuối (WebP) | trần mỗi ảnh | trạng thái |
|---|---|---|---|---|---|---|
| nền đăng nhập | `section#login` | 1:1 | 1024x1024 | 1024x1024 | 150 KB | ĐÃ VÀO (`login_bg.webp`, 72 KB) |
| **thẻ bản đồ** | màn chuyển cảnh qua cổng (ĐÃ nối: `client/src/map-card.ts`, danh sách `MAP_CARDS`; chưa có ảnh thì chỉ hiện tên) và đầu bảng Sơn Hà Đồ (`M`, dự kiến) | 3:2 (thô ≈ 3:2, B cắt nhẹ về đúng 3:2) | 1216x832 | 624x416 | 40 KB | **LÔ 1 (mục 5)** |
| thẻ trùm | thanh máu trùm / báo trùm (dự kiến) | 1:1 | 1024x1024 | 384x384 | 30 KB | lô 2, SAU khi B xem lô 1 |
| chân dung NPC | khung hội thoại (dự kiến) | 1:1 | 1024x1024 | 256x256 | 20 KB | lô 3 |

**Ngân sách gói tải** (`client/perf-budget.json` `static.aiAssets`: mỗi ảnh <= 150 KB, tổng <= 300 KB; ảnh vào `dist/` nên vào cả APK lẫn bộ nhớ đệm PWA của mọi người chơi web): `login_bg` 72 KB + 5 thẻ bản đồ x 40 KB = **272 KB <= 300 KB**. Lô 2 và 3 CHƯA vừa trần này: trước khi sinh lô 2, B + A chốt một trong hai (nâng trần có đo `client/dist` trước / sau, hoặc tải lười ảnh minh hoạ ngoài màn đăng nhập, không precache: đổi `stamp-sw.mjs`, mất tính offline của riêng các thẻ này). Đây là việc của A / người dùng, KHÔNG chặn lô 1.

## 5. LÔ 1: năm thẻ bản đồ (việc của C)
Mỗi bản đồ một thẻ, **ba hạt giống** mỗi thẻ để B chọn một (15 ảnh thô). Cỡ thô 1216x832; cùng cài đặt KSampler của lô pilot (`euler`, `normal`, 25 bước, CFG 7.0, denoise 1.0) và cùng prompt âm ở mục 3. Tên tệp thô `<id>_raw_<n>_00001_.png` (n = 1..3 theo thứ tự hạt giống) vào `/mnt/data/comfyui/output/`. Prompt dương của từng thẻ (đã qua `promptViolations`, KHÔNG sửa tay: cần đổi thì sửa `MAP_CARD_BATCH` trong `prompt-rules.mjs` rồi cập nhật trang này):

### `the_lac_ha` (bản đồ `lac_ha`; hạt giống `2026111711`, `2026111712`, `2026111713`)
```text
small mountain town of timber houses below a sacred misty peak, a river winding past peach blossom trees, falling pink petals, warm peach and amber light, soft rose and cream haze, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text
```

### `the_hac_phong` (bản đồ `hac_phong`; hạt giống `2026111721`, `2026111722`, `2026111723`)
```text
windswept dark canyon with thorny shrubs and twisted pines, ash drifting in the wind, a ruined stone watchtower far away, slate grey and cold blue shadows, pale grey haze, dim overcast light, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text
```

### `the_linh_hu` (bản đồ `bi_canh_linh_hu`; hạt giống `2026111731`, `2026111732`, `2026111733`)
```text
hidden spirit realm cavern with glowing lotus pools and luminous mushrooms, floating motes of light, crystal rock arches, jade teal and cyan glow against deep blue-black shadows, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text
```

### `the_am_suong` (bản đồ `am_suong`; hạt giống `2026111741`, `2026111742`, `2026111743`)
```text
foggy swamp of dead trees and still black water, faint wisps of pale lantern light, rotting wooden walkway, moss green and grey-green mist, dim sickly glow, heavy fog, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text
```

### `the_han_van` (bản đồ `han_van`; hạt giống `2026111751`, `2026111752`, `2026111753`)
```text
icy highland with drifting snow, frozen lake and sheer ice cliffs under a pale dawn, thin clouds on the ridges, pale ice blue and white haze, cold silver light, painterly soft ink wash and gouache landscape, muted colors, misty depth, wide panoramic composition, eastern mountain cultivation fantasy, no people, no text
```

## 6. Quy trình sau khi C sinh xong
1. C chạy `scripts/art/comfy-up.sh`, sinh 15 ảnh, chạy `scripts/art/comfy-down.sh` (cổng 8188 sạch, đơn vị `tg-comfy` inactive), rồi báo B (thư) kèm danh sách tệp + băm ảnh thô.
2. B xem từng ảnh (và 4 góc phóng 200 %), chọn MỘT ảnh mỗi bản đồ: ưu tiên ít chi tiết, màu gần bảng màu mục 2, KHÔNG chữ / ký tự giả / người / logo. Ảnh nào có chữ giả thì loại, sinh lại với hạt giống khác (C), không sửa tay.
3. B chuyển ảnh thô được chọn sang `/mnt/data/comfyui/output/chosen/`, hậu kỳ bằng `client/scripts/art/hau-ky-webp.py` (cắt / đổi cỡ 624x416, WebP sạch, <= 40 KB), ghi `docs/art/nguon/<tên>.json` + mục riêng trong `CREDITS.md`, rồi `npm run check:credits` + `check:perf-budget`.
4. B thêm mỗi thẻ đã chọn vào `MAP_CARDS` (`client/src/map-card.ts`, một dòng cho mỗi bản đồ) CÙNG PR với ảnh + tệp nguồn + `CREDITS.md`; màn chuyển cảnh qua cổng đã nối sẵn (`npm run build -w client && node client/scripts/check-map-card.mjs --shots <thư mục>` kiểm năm khung). Chỗ dùng thứ hai (đầu bảng Sơn Hà Đồ) là PR riêng, kèm `capture-viewports` năm khung + kiểm không che / lệch nút (QUYET_DINH_M3 mục 15).
