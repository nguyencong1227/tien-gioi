# Phong cách minh hoạ của Tiên Giới (Bước 0 của ảnh AI, M7.12 #513, `QUYET_DINH_M3.md` mục 46)

> **Dùng cho ai:** Dev C (chạy ComfyUI + SDXL base theo trang này) và Dev B (chọn ảnh, hậu kỳ, đưa vào game). Mọi con số, từ khoá và prompt dưới đây là **một bản sao có kiểm tra** của `client/scripts/art/prompt-rules.mjs`: `client/scripts/art/prompt-rules.test.ts` đỏ nếu trang này lệch mã, và `npm run check:credits` đỏ nếu một tệp `docs/art/nguon/*.json` có prompt vi phạm luật ở mục 3.
> **Ranh giới không đổi** (`AGENTS.md` mục Asset, nguồn 2; `docs/KE_HOACH_DO_HOA_AI.md`): chỉ **SDXL base** (không LoRA, không model khác), ComfyUI chỉ nghe 127.0.0.1, giới hạn RAM, tự tắt sau khi sinh, ảnh thô ở `/mnt/data/comfyui/output/`, không chạy cùng lúc với đo hiệu năng GPU, **không chữ / chữ Hán / chữ lạ trên ảnh**, prompt **không nêu tên, nhân vật hay phong cách của game khác**.

## 1. Tinh thần
Tranh phong cảnh **vẽ tay mềm** (mực loang + bột màu), màu **dịu và trầm**, nhiều **sương** tạo chiều sâu, ánh sáng đổi theo bản đồ; không có người, không có chữ, không có khung viền. Ảnh phải ĂN MÀU với trò chơi: cùng bảng màu với nền bản đồ trong game (`MAP_STYLES`) và giao diện (`style.css`), để thẻ minh hoạ đặt cạnh bản đồ thật không lạc tông.

## 2. Bảng màu (12 màu)
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
| `lang_hoang` | `#d8c9a0` | Lang Hoang: vàng rơm, thảo nguyên khô | `MAP_STYLES.lang_hoang.ambient.color` |
| `uy_van` | `#a8444a` | Uy Vân: đỏ gạch, huyết trận | `MAP_STYLES.uy_van.ambient.color` |

## 3. Luật prompt (máy kiểm, `promptViolations`)
**Bắt buộc trong prompt dương:** ít nhất MỘT neo phong cách tranh (`painterly`, `painting`, `ink wash`, `gouache`, `watercolor`, `watercolour`, `matte painting`) và đúng mệnh đề `no text` (mệnh đề = đoạn giữa hai dấu phẩy).
**Bắt buộc trong prompt âm:** `text`, `letters`, `watermark`, `signature`, `logo`, `cjk`, `chinese characters`. Prompt âm chuẩn của mọi lô:

```text
text, letters, words, calligraphy, watermark, signature, logo, cjk, chinese characters, frame, border, blurry, lowres, distorted, modern, futuristic, photorealistic, human face, western fantasy, anime, 3d render
```

**CẤM trong prompt dương** (so khớp theo từ nguyên vẹn, không phân biệt hoa thường; các mệnh đề phủ định như `no people`, `without text`, `avoid …` được bỏ qua khi quét, vì vậy `no text` hợp lệ còn `text` thì cấm):

- **tên game / truyện / thương hiệu khác:** `genshin`, `honkai`, `warcraft`, `diablo`, `league of legends`, `dota`, `perfect world`, `jade dynasty`, `zhu xian`, `tru tien`, `van kiep`, `path of exile`, `elden ring`, `dark souls`, `sekiro`, `black myth`, `wukong`, `final fantasy`, `pokemon`, `maplestory`, `ragnarok`, `lineage`, `disney`, `marvel`, `ghibli`, `tolkien`, `middle earth`, `lord of the rings`, `game of thrones`, `skyrim`, `witcher`, `zelda`
- **nghệ sĩ / phong cách của một người:** `greg rutkowski`, `artgerm`, `wlop`, `ruan jia`, `makoto shinkai`, `miyazaki`, `thomas kinkade`, `craig mullins`, `in the style of`, `style of`, `inspired by`, `reminiscent of`, `fan art`, `fanart`
- **gợi chữ / ký tự (SDXL vẽ chữ giả):** `text`, `letters`, `calligraphy`, `inscription`, `signboard`, `sign board`, `banner with`, `scroll with`, `writing`, `poem`, `seal`, `stamp`, `hanzi`, `kanji`, `glyph`, `rune`, `runes`, `symbols`
- **thể loại kéo ảnh về kiểu game khác:** `chinese`, `xianxia`, `wuxia`, `xuanhuan`, `anime`, `manga`, `chibi`, `video game`, `game art`, `game`, `screenshot`, `trending on`, `artstation`, `pixiv`, `deviantart`, `unreal engine`, `octane`
- **ảnh chụp / người thật:** `photorealistic`, `photo realistic`, `photograph`, `photo of`, `real person`, `celebrity`, `portrait of`

Lý do từng nhóm: tên game / truyện / nghệ sĩ khác vi phạm quy tắc Asset; từ gợi chữ khiến SDXL vẽ ký tự giả (phải xoá ở hậu kỳ, mất công, dễ sót); `chinese` / `xianxia` / `wuxia` / `anime` kéo ảnh về đúng kiểu nhân vật và kiến trúc của các game đó và đẻ ra chữ Hán; `photorealistic` / `portrait of` kéo về ảnh chụp và mặt người thật. Dùng "eastern mountain", "cultivation fantasy", "timber houses", "stone watchtower"... là đủ. Thêm từ cấm mới thì sửa `BANNED_PROMPT_TERMS` rồi chạy lại `prettier` + test (trang này phải liệt kê nó).

## 4. Các lớp ảnh, tỉ lệ khung, dung lượng
| lớp | dùng ở | tỉ lệ | thô (SDXL) | cuối (WebP) | trần mỗi ảnh | trạng thái |
|---|---|---|---|---|---|---|
| nền đăng nhập | `section#login` | 1:1 | 1024x1024 | 1024x1024 | 150 KB | ĐÃ VÀO (`login_bg.webp`, 72 KB) |
| **thẻ bản đồ** | màn chuyển cảnh qua cổng (ĐÃ nối: `client/src/map-card.ts`, danh sách `MAP_CARDS`; chưa có ảnh thì chỉ hiện tên) và đầu bảng Sơn Hà Đồ (`M`; ĐÃ nối: `ui.setMapPanelCard`, thẻ của bản đồ ĐANG XEM, 60x40 px, bỏ ở màn cao <= 480 px) | 3:2 (thô ≈ 3:2, B cắt nhẹ về đúng 3:2) | 1216x832 | 624x416 | 40 KB | **LÔ 1 ĐÃ VÀO GAME (17/11/2026, mục 5)** |
| thẻ trùm | ảnh đại diện ở đầu thanh máu trùm (ĐÃ nối: `client/src/boss-card.ts`, danh sách `BOSS_CARDS` rỗng tới khi có ảnh; ảnh dự phòng là chữ) | 1:1 | 1024x1024 | 384x384 | 30 KB | lô 2 (mục 5b), vào GÓI `art:trum` (tải theo nhu cầu, mục 4b) |
| chân dung NPC | đầu khung hội thoại (ĐÃ nối: `client/src/npc-portrait.ts`, danh sách `NPC_PORTRAITS` rỗng tới khi có ảnh; ảnh dự phòng là chữ) | 1:1 | 1024x1024 | 256x256 | 20 KB | lô 3 (mục 5c), vào GÓI `art:npc` (tải theo nhu cầu, mục 4b) |

**Ngân sách gói tải NGAY** (`client/perf-budget.json` `static.aiAssets`: mỗi ảnh <= 150 KB, tổng <= 300 KB; ảnh ở `client/public/assets/ai/` vào `dist/` nên vào cả APK lẫn bộ nhớ đệm PWA của mọi người chơi web): `login_bg` 72 KB + 5 thẻ bản đồ (23-34 KB mỗi ảnh, thực đo 146,5 KB) = **218,7 KB <= 300 KB**. **A giữ trần 300 KB** (quyết định ở #998): lô 2 và lô 3 KHÔNG vào đây mà vào gói tải theo nhu cầu `art` (mục 4b).

### 4b. Gói tải theo nhu cầu `art` (lô 2 thẻ trùm, lô 3 chân dung NPC)
- **Id và thư mục:** `art:trum` = `client/public/packs/art-trum/`, `art:npc` = `client/public/packs/art-npc/` (thư mục lồng `art/<tên>/` cũng được). `npm run build:packs` sinh `client/public/packs/manifest.json` (loại `art`), `check:packs` kiểm manifest khớp đĩa. Tên tệp ảnh = tên của JSON nguồn (vd `the_xich_mang.webp` <-> `docs/art/nguon/the_xich_mang.json`).
- **Ngân sách** (`perf-budget.json` `packs.art`, `check-perf-budget` kiểm): **mỗi gói <= 512 KB, mỗi ảnh <= 60 KB**, `load: tai-dan-nen`. Cỡ dự kiến: `art:trum` 4 thẻ x <= 30 KB = 120 KB; `art:npc` 15 chân dung x <= 20 KB = 300 KB (15 NPC hiện có); số 512 / 60 cho dư một đợt thêm trùm / NPC mà không phải đổi ngân sách. Đây là ĐỀ XUẤT để A duyệt (thấp hơn `audio` 5120 KB và `icons` 3072 KB vì ảnh nhỏ, chạy 1 - 2 bảng một lúc).
- **Không precache:** `stamp-sw.mjs` chỉ đưa gói `core` vào `PRECACHE_URLS`; test `stamp-sw.test.ts` chứng minh thêm gói `art` KHÔNG đổi danh sách precache. Người chơi web chỉ tải một gói khi mở bảng trùm / hội thoại lần đầu (gói đã tải thì lần sau lấy từ bộ nhớ đệm).
- **APK:** bản native đóng sẵn `client/dist` (Capacitor `webDir`) nên các gói `art` nằm trong APK (+420 KB với đủ lô 2 + 3, so với APK vài chục MB) và `ensure` trả `cached` ngay, không `fetch`, dùng URL không băm `/packs/<đường dẫn>`. ĐỀ XUẤT giữ như vậy (đơn giản, chạy được offline); nếu A muốn loại khỏi APK thì phải thêm một bước chép `dist` có lọc trước `cap sync` (chưa có, `hd:*` hiện cũng chưa bị loại khỏi APK ở tầng đóng gói).
- **Nơi dùng** gọi `showArtImage(img, { packId: artPackId("trum"), file: "art-trum/<tên>.webp" })` (`client/src/art-image.ts`): thẻ `<img>` ẨN cho tới khi ảnh giải mã xong; chưa có gói / lỗi / hết giờ chờ 3 giây / tệp không có trong gói thì thẻ vẫn ẩn và nơi dùng giữ ảnh dự phòng (chữ, màu); gói về muộn thì áp dụng nếu nơi dùng còn cần; đổi nội dung thì yêu cầu cũ bị bỏ.
- **Kiểm nguồn:** ảnh AI trong gói `art` chịu ĐÚNG luật của `assets/ai` (`check-credits` `aiAssetDirs`): JSON nguồn cùng tên, băm khớp, WebP / PNG sạch, dòng ở `CREDITS.md` mục 7, prompt qua `promptViolations`; hai ảnh cùng tên ở hai thư mục bị từ chối; một tệp lạ bỏ vào gói `art` làm `check:credits` ĐỎ (đã thử).
- **Đo `client/dist` trước / sau** (gói THỬ gồm 4 + 15 tệp ngẫu nhiên 30 / 20 KB, đã xoá): `dist` 2.486.955 B -> 2.920.522 B (+433.567 B = gói 420 KB + manifest); **số URL precache 101 -> 101, băm danh sách precache giống hệt, tệp JS chính không đổi**; `check-perf-budget`: `art:trum` 120 KB và `art:npc` 300 KB, cả hai <= 512 KB; bậc đồ hoạ thấp / vừa / cao / rất cao vẫn 10,18 MB (ảnh `<img>` giải mã khi hiện, một lúc chỉ 1 - 2 ảnh).
- **Việc sau gói này:** (1) B đưa prompt lô 2 (4 trùm: Xích Mãng, Hắc Giao, Thiên Hàn Vương, Linh Hư Yêu Vương) cho C sau khi PR gói được duyệt; (2) Thẻ trùm ĐÃ nối vào thanh máu trùm bằng `showArtImage` (`boss-card.ts`; thêm một thẻ = một dòng `BOSS_CARDS` cùng PR với ảnh + nguồn + CREDITS + `npm run build:packs`; `check-boss-card.mjs` kiểm qua gói giả); chân dung NPC ở hội thoại sẽ nối ở PR riêng sau lô 3.

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

## 5b. LÔ 2: bốn thẻ trùm (việc của C, CHỈ KHI #1005 gói `art` đã được A duyệt)
Mỗi trùm một thẻ vuông, **bốn hạt giống** mỗi thẻ để B chọn một (16 ảnh thô; lô 1 cho thấy 4 / 15 ảnh có chữ ký giả ở góc nên dư một ảnh). Cỡ thô 1024x1024, ảnh cuối 384x384 WebP <= 30 KB, vào gói `art:trum` (`client/public/packs/art-trum/`, mục 4b). Cùng cài đặt KSampler của lô 1 (`euler`, `normal`, 25 bước, CFG 7.0, denoise 1.0), cùng prompt âm ở mục 3, chỉ SDXL base. Tên tệp thô `<id>_raw_<n>_00001_.png` (n = 1..4 theo thứ tự hạt giống) vào `/mnt/data/comfyui/output/`. Màu và ánh sáng theo bản đồ của từng trùm (bảng màu mục 2); trùm là thú / khối băng, KHÔNG mặt người (để khỏi giống nhân vật của game khác). Prompt dương (đã qua `promptViolations`, KHÔNG sửa tay: cần đổi thì sửa `BOSS_CARD_BATCH` trong `prompt-rules.mjs` rồi cập nhật trang này):

### `the_xich_mang` (trùm `mang`; hạt giống `2026111801`, `2026111802`, `2026111803`, `2026111804`)
```text
colossal crimson python coiled around mossy boulders beneath blossoming peach branches, glossy blood-red scales, warm amber evening light, soft rose and cream haze, painterly soft ink wash and gouache creature illustration, single creature centered, full body visible, muted colors, misty depth, eastern mountain cultivation fantasy, no people, no text
```

### `the_hac_giao` (trùm `hac_giao`; hạt giống `2026111811`, `2026111812`, `2026111813`, `2026111814`)
```text
enormous black river dragon-serpent rising from dark swamp water, wet obsidian scales with a pale green sheen, dead trees around it, moss green and grey-green mist, faint wisps of pale lantern light, heavy fog, painterly soft ink wash and gouache creature illustration, single creature centered, full body visible, muted colors, misty depth, eastern mountain cultivation fantasy, no people, no text
```

### `the_thien_han_vuong` (trùm `thien_han_vuong`; hạt giống `2026111821`, `2026111822`, `2026111823`, `2026111824`)
```text
towering colossus of living glacier ice standing on a frozen lake, armor-like plates of blue ice, a jagged crown of icicles, no face, pale ice blue and white haze, cold silver light, painterly soft ink wash and gouache creature illustration, single creature centered, full body visible, muted colors, misty depth, eastern mountain cultivation fantasy, no people, no text
```

### `the_yeu_vuong` (trùm `yeu_vuong`; hạt giống `2026111831`, `2026111832`, `2026111833`, `2026111834`)
```text
ancient spirit beast lord with huge branching luminous antlers and long fur drifting like mist, standing in a crystal cavern with glowing mushrooms, jade teal and cyan glow with deep violet accents against blue-black shadows, painterly soft ink wash and gouache creature illustration, single creature centered, full body visible, muted colors, misty depth, eastern mountain cultivation fantasy, no people, no text
```

## 5c. LÔ 3: mười hai chân dung NPC (việc của C, SAU lô 2)
Mỗi NPC có hội thoại một chân dung vuông (trừ `cao_thi`: là bảng cáo thị, không có người), **ba hạt giống** mỗi chân dung (36 ảnh thô). Cỡ thô 1024x1024, ảnh cuối 256x256 WebP <= 20 KB, vào gói `art:npc` (`client/public/packs/art-npc/`, mục 4b). Cùng cài đặt KSampler của lô 1 (`euler`, `normal`, 25 bước, CFG 7.0, denoise 1.0), cùng prompt âm ở mục 3, chỉ SDXL base. Tên tệp thô `<id>_raw_<n>_00001_.png` (n = 1..3). **NPC là NGƯỜI, nên luật riêng:** dáng nhìn nghiêng hoặc từ sau, nửa thân, **mặt khuất bóng nón / mũ trùm / sương** (mọi prompt có đúng mệnh đề `face hidden in shadow`; test bắt thiếu), KHÔNG nét mặt người, KHÔNG người nổi tiếng, không trang phục đặc trưng của nhân vật game khác; prompt âm chuẩn đã có `human face`. Khi duyệt ảnh, B loại ảnh nào lộ mặt rõ. Màu theo bản đồ của NPC (bảng màu mục 2). Prompt dương (đã qua `promptViolations`, KHÔNG sửa tay: cần đổi thì sửa `NPC_PORTRAIT_BATCH` trong `prompt-rules.mjs` rồi cập nhật trang này):

### `npc_truong_tran` (NPC `truong_tran`; hạt giống `2026111911`, `2026111912`, `2026111913`)
```text
middle-aged village headman in a long dark blue robe seen from the side, wide-brimmed straw hat, hands folded, timber houses behind him, face hidden in shadow, warm peach and amber light, soft rose haze, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_duoc_su` (NPC `duoc_su`; hạt giống `2026111921`, `2026111922`, `2026111923`)
```text
stooped old herbalist in a green robe seen from behind, cloth headwrap, carrying a basket of drying herbs, face hidden in shadow, warm amber and sage light, soft cream haze, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_tho_ren` (NPC `tho_ren`; hạt giống `2026111931`, `2026111932`, `2026111933`)
```text
broad-shouldered blacksmith in a leather apron seen in profile, holding a hammer, a glowing forge behind him, hooded, face hidden in shadow, warm amber with ember glow, soft rose haze, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_lai_buon` (NPC `lai_buon`; hạt giống `2026111941`, `2026111942`, `2026111943`)
```text
travelling merchant with a heavy pack and a long windblown coat seen from the side, hat brim pulled low, face hidden in shadow, slate grey and cold blue shadows, pale grey haze, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_tram_truong` (NPC `tram_truong`; hạt giống `2026111951`, `2026111952`, `2026111953`)
```text
station master in a long coat holding a hooded lantern, standing on a stone platform, brimmed hat, face hidden in shadow, moss green and grey-green mist, faint pale lantern light, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_lai_buon_suong` (NPC `lai_buon_suong`; hạt giống `2026111961`, `2026111962`, `2026111963`)
```text
merchant poling a small cargo boat through a foggy swamp, conical hat, sacks piled behind him, face hidden in shadow, moss green and grey-green mist, dim sickly glow, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_tho_ren_suong` (NPC `tho_ren_suong`; hạt giống `2026111971`, `2026111972`, `2026111973`)
```text
swamp blacksmith in a heavy damp apron seen in profile, hooded, a forge glowing red in the fog, face hidden in shadow, moss green mist with a warm ember glow, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_tram_truong_han` (NPC `tram_truong_han`; hạt giống `2026111981`, `2026111982`, `2026111983`)
```text
station master in a thick fur-trimmed coat and deep hood standing in drifting snow, one hand raised against the wind, face hidden in shadow, pale ice blue and white haze, cold silver light, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_lai_buon_han` (NPC `lai_buon_han`; hạt giống `2026111991`, `2026111992`, `2026111993`)
```text
merchant in a fur hood leading a loaded pack animal through deep snow, seen from the side, face hidden in shadow, pale ice blue and white haze, cold silver light, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_tho_ren_han` (NPC `tho_ren_han`; hạt giống `2026112001`, `2026112002`, `2026112003`)
```text
blacksmith at an outdoor forge in falling snow, fur-lined hood, raising a hammer, seen in profile, face hidden in shadow, pale ice blue haze with a warm ember glow, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_thu_mon` (NPC `thu_mon`; hạt giống `2026112011`, `2026112012`, `2026112013`)
```text
gatekeeper in layered robes seen from behind, holding a long staff, standing before a glowing jade cavern gate, face hidden in shadow, jade teal and cyan glow against deep blue-black shadows, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

### `npc_lao_dan` (NPC `lao_dan`; hạt giống `2026112021`, `2026112022`, `2026112023`)
```text
old alchemist in a long robe bending over a clay furnace, wisps of pale smoke rising, hooded, face hidden in shadow, warm amber and sage light, soft cream haze, painterly soft ink wash and gouache half-length figure study, single figure centered, muted colors, misty depth, eastern mountain cultivation fantasy, no text
```

## 6. Quy trình sau khi C sinh xong
1. C chạy `scripts/art/comfy-up.sh`, sinh 15 ảnh, chạy `scripts/art/comfy-down.sh` (cổng 8188 sạch, đơn vị `tg-comfy` inactive), rồi báo B (thư) kèm danh sách tệp + băm ảnh thô.
2. B xem từng ảnh (và 4 góc phóng 200 %), chọn MỘT ảnh mỗi bản đồ: ưu tiên ít chi tiết, màu gần bảng màu mục 2, KHÔNG chữ / ký tự giả / người / logo. Ảnh nào có chữ giả thì loại, sinh lại với hạt giống khác (C), không sửa tay.
3. B chuyển ảnh thô được chọn sang `/mnt/data/comfyui/output/chosen/`, hậu kỳ bằng `client/scripts/art/hau-ky-webp.py` (cắt / đổi cỡ 624x416, WebP sạch, <= 40 KB), ghi `docs/art/nguon/<tên>.json` + mục riêng trong `CREDITS.md`, rồi `npm run check:credits` + `check:perf-budget`.
4. B thêm mỗi thẻ đã chọn vào `MAP_CARDS` (`client/src/map-card.ts`, một dòng cho mỗi bản đồ) CÙNG PR với ảnh + tệp nguồn + `CREDITS.md`; màn chuyển cảnh qua cổng đã nối sẵn (`npm run build -w client && node client/scripts/check-map-card.mjs --shots <thư mục>` kiểm năm khung). Chỗ dùng thứ hai (đầu bảng Sơn Hà Đồ) là PR riêng, kèm `capture-viewports` năm khung + kiểm không che / lệch nút (QUYET_DINH_M3 mục 15).
