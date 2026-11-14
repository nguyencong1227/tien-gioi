# Nguồn tài nguyên (Credits & Licenses)

Tiên Giới chỉ sử dụng các bộ tài nguyên (hình ảnh, hiệu ứng, âm thanh) tự tạo của dự án hoặc có giấy phép mở (**CC0 1.0 Public Domain** / **CC-BY 3.0 / 4.0** / **SIL OFL 1.1**), cho phép sử dụng và chỉnh sửa trong trò chơi công khai. Toàn bộ thế giới, địa danh (Lạc Hà Trấn, Hắc Phong Lâm, Vân Mộng Sơn), hệ thống cảnh giới và nhân vật là sáng tạo riêng của Tiên Giới.

---

## 1. Tài nguyên đang đóng gói trong repo (`client/public/` & `client/src/`)

Tính đến 14/11/2026, toàn bộ các file hình ảnh pixel-art, biểu tượng và âm thanh hiện tại trong repo được tạo riêng cho **Tiên Giới** và phát hành theo giấy phép **CC0 1.0 Public Domain** (câu này phải sửa khi tệp `vktt/` hoặc ảnh AI đầu tiên vào repo, theo `AGENTS.md` mục Asset):

| Tài nguyên | File trong repo | Tác giả & Công cụ tạo | Giấy phép |
|---|---|---|---|
| **Tileset bản đồ** (8 ô địa hình `32×32` px: `Grass`, `TallGrass`, `Dirt`, `Water`, `Tree`, `Rock`, `Stone`, `Sand`) | `client/public/assets/tileset.png` | **Nhóm Tiên Giới (Dev B)** — sinh và đóng gói bằng script `client/scripts/gen-assets.mjs` (`npm run assets -w client`) | **CC0 1.0** (Do dự án tạo) |
| **Texture Atlas nhân vật, NPC, yêu thú & hiệu ứng** (`me`, `other` và 3 bộ pháp bào `robe-tho_nhung_bao`, `robe-hac_ho_bao`, `robe-xich_lan_bao` 4 hướng `idle`/`walk`/`slash`; tư thế bị đánh `<bộ>-hurt-<hướng>` và gục `<bộ>-die-0..3` (M5.2, suy từ khung đứng bằng biến đổi + màu trong script); 9 yêu thú `mon-tho`, `mon-lang`, `mon-ho`, `mon-mang` và (M6 #407) `mon-suong_ho`, `mon-thach_quy`, `mon-doc_thiem`, `mon-hac_giao`, `mon-yeu_vuong` kèm tư thế đánh / bị đánh / gục `mon-<id>-atk-0..1`, `mon-<id>-hurt`, `mon-<id>-die-0..3` (M5.2, suy từ khung đi bằng biến đổi + màu trong script); 9 NPC `npc-truong_tran`, `npc-duoc_su`, `npc-tho_ren`, `npc-cao_thi` và (M6 #407) `npc-lai_buon`, `npc-thu_mon`, `npc-tram_truong`, `npc-lai_buon_suong`, `npc-tho_ren_suong`; `swordbeam`, `dot`, `item-*`) | `client/public/assets/atlas.png`, `client/public/assets/atlas.json` | **Nhóm Tiên Giới (Dev B)** — vẽ pixel-art và đóng gói Phaser 3 JSON Atlas bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** (Do dự án tạo) |
| **Ảnh biểu tượng vật phẩm & trang bị DOM** (31 tệp, 15 tệp Kim Đan M6 #407 ở cuối danh sách: `hoi_huyet_dan.png`, `hoi_linh_dan.png`, `tu_khi_dan.png`, `long_tho.png`, `nanh_soi.png`, `da_ho.png`, `vay_mang.png`, `lang_nha_kiem.png`, `tho_nhung_bao.png`, `lang_nha_phu.png`, `hac_ho_kiem.png`, `hac_ho_bao.png`, `ho_hon_phu.png`, `xich_mang_kiem.png`, `xich_lan_bao.png`, `mang_dam_phu.png`, `suong_mao.png`, `quy_giap.png`, `doc_nang.png`, `giao_lan.png`, `dai_hoi_huyet_dan.png`, `dai_hoi_linh_dan.png`, `suong_vu_kiem.png`, `suong_ho_bao.png`, `ho_tam_phu.png`, `huyen_quy_kiem.png`, `quy_giap_bao.png`, `quy_tuc_phu.png`, `hac_giao_kiem.png`, `giao_lan_bao.png`, `giao_long_phu.png`) | `client/public/assets/items/*.png` | **Nhóm Tiên Giới (Dev B)** — sinh từ `client/scripts/gen-assets.mjs` | **CC0 1.0** (Do dự án tạo) |
| **Bộ biểu tượng PWA & Favicon** (`icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) | `client/public/icons/icon.svg`, `client/public/icons/icon-192.png`, `client/public/icons/icon-512.png`, `client/public/icons/icon-maskable-512.png`, `client/public/icons/apple-touch-icon.png` | **Nhóm Tiên Giới (Dev C)** — vẽ huy hiệu kiếm Tiên Giới cổ phong bằng SVG thuần và render ảnh PNG | **CC0 1.0** (Do dự án tạo) |
| **Biểu tượng nút HUD / hành động** (12 hình SVG nét đơn: nhân vật, túi, nhiệm vụ, tông môn, nhặt, nói chuyện, qua cổng, mục tiêu, đột phá, đả tọa, kiếm khí, chém; thay chữ Hán, QUYET_DINH_M3 mục 12) | `client/index.html` (khối `<symbol id="i-...">`), `client/src/style.css` (`.ico`) | **Nhóm Tiên Giới (Dev B)** — tự vẽ bằng SVG thuần | **CC0 1.0** (Do dự án tạo) |
| **Texture tự vẽ bằng mã nguồn (Procedural Canvas)** (vòng sáng thiền định, tia sáng đột phá, minimap, dấu ấn quyết đấu, hiệu ứng hạt) | `client/src/textures.ts` | **Nhóm Tiên Giới (Dev B)** — dựng bằng HTML5 Canvas 2D API | **CC0 1.0** (Do dự án tạo) |
| **Nhạc nền ngũ cung & hiệu ứng âm thanh (SFX)** (nhạc Lạc Hà Trấn, nhạc hoang dã, tiếng kiếm chém, kiếm khí, trúng đòn, nhặt đồ, lên cấp, đột phá) | `client/src/audio.ts` | **Nhóm Tiên Giới (Dev B)** — tổng hợp thời gian thực bằng Web Audio API | **CC0 1.0** (Do dự án tạo) |
| **Phông chữ tiếng Việt cổ phong** (`Noto Serif` hỗ trợ đầy đủ dấu tiếng Việt; **tự lưu** từ #331, KHÔNG còn nạp từ Google Fonts) | `client/public/fonts/` (4 tệp `woff2` + `OFL.txt`, khai báo ở `client/src/fonts.css`; nguồn, ngày và SHA-256 từng tệp ở mục 6) | **The Noto Project Authors** ([github.com/notofonts/latin-greek-cyrillic](https://github.com/notofonts/latin-greek-cyrillic)), đóng gói bởi Fontsource | **SIL OFL 1.1** |

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
3. **Quy tắc định danh & cốt truyện:** Toàn bộ tên NPC, môn phái, địa danh, vật phẩm, kỹ năng đều là bản quyền sáng tạo của Tiên Giới, không sao chép từ bất kỳ thương hiệu trò chơi nào khác.

---

## 4. Kết quả rà soát tài sản (M4-sớm, Issue #257)

- **Tổng số tệp tài nguyên tĩnh quét qua script tự động (`npm run check:credits`):** 44 tệp (cập nhật M6, 13/11/2026; lúc M4-sớm là 24 tệp, chi tiết ở `docs/RA_SOAT_TAI_SAN.md`).
  - `client/public/assets/`: 34 tệp (1 tileset, 2 atlas, 31 biểu tượng vật phẩm).
  - `client/public/icons/`: 5 tệp (1 svg, 4 png icon PWA / favicon).
  - `client/public/fonts/`: 5 tệp (4 `woff2` + `OFL.txt`, có SHA-256 ở mục 6).
- **Tài nguyên tự sinh runtime (không có tệp ảnh, ngoài phạm vi quét):** `client/src/textures.ts` (vẽ canvas), `client/src/audio.ts` (Web Audio) và các mô-đun đồ hoạ M5-M6 `client/src/gfx/` (tileset trang trí, ánh sáng, sương, nước, atlas hạt + phông bit-map, bóng đốm): danh sách ở `docs/RA_SOAT_TAI_SAN.md` mục 2c.
- **Số tệp thiếu nguồn / không rõ tác giả:** **0 tệp**.
- **Số tài sản vi phạm bản quyền / sao chép từ game khác:** **0 tệp** (tính đến 14/11/2026; tài sản của Vạn Kiếp Tu Tiên dùng với sự cho phép của tác giả được ghi riêng ở `docs/NGUON_NOI_DUNG.md`, không tính là vi phạm).
- **Công cụ kiểm tra tự động:** `client/scripts/check-credits.mjs` (kiểm tra tự động trong CI).

---

## 5. Thư viện Đóng gói Ứng dụng Di động (Capacitor)

Các thư viện mã nguồn mở dùng để đóng gói ứng dụng di động trong thư mục `app/`:

| Gói | Phiên bản | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|
| `@capacitor/core` | 8.6.0 | Ionic / Max Lynch ([github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor)) | **MIT** |
| `@capacitor/cli` | 8.6.0 | Ionic / Max Lynch ([github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor)) | **MIT** |
| `@capacitor/android` | 8.6.0 | Ionic / Max Lynch ([github.com/ionic-team/capacitor](https://github.com/ionic-team/capacitor)) | **MIT** |
| `@capacitor/app` | 8.1.2 | Ionic / Max Lynch ([github.com/ionic-team/capacitor-plugins](https://github.com/ionic-team/capacitor-plugins)) | **MIT** |

### 5b. Thư viện chạy trong trình duyệt (đóng gói vào gói JavaScript của client)

Giấy phép MIT / ISC / BSD / 0BSD yêu cầu giữ thông báo bản quyền và nội dung giấy phép trong bản phân phối: toàn văn nằm ở `client/public/notices.html` (phát hành cùng game, đưa vào bộ nhớ đệm PWA và APK), liên kết từ Cài đặt, mục "Giới thiệu và ghi công" (`#set-credit-libs`). Trang này **được SINH từ `node_modules`** (`node client/scripts/gen-notices.mjs`; `--check` chỉ kiểm) cho TOÀN BỘ bao đóng phụ thuộc chạy của `client/package.json` (cả gói đi kèm, bắc cầu) và cho mã bên thứ ba nhúng sẵn trong Phaser; `client/src/credits-ui.test.ts` đỏ nếu trang lệch bản sinh (đổi phụ thuộc mà quên chạy lại), thiếu gói, hoặc thiếu mã nhúng.

| Gói | Phiên bản | Tác giả / Nguồn | Giấy phép |
|---|---|---|---|
| `phaser` | 3.90.0 | Richard Davey, Phaser Studio Inc. ([phaser.io](https://phaser.io)); bản production dùng `phaser-arcade-physics.min.js` (#565) | **MIT** |
| `colyseus.js` | 0.16.22 | Endel Dreyer ([colyseus.io](https://colyseus.io)) | **MIT** |
| `@colyseus/schema` | đi kèm `colyseus.js` | Endel Dreyer | **MIT** |
| `@colyseus/httpie` | đi kèm `colyseus.js` | Luke Edwards (bản của Colyseus) | **MIT** |
| `@colyseus/msgpackr` | đi kèm `colyseus.js` | Kris Zyp (bản của Colyseus) | **MIT** |
| `eventemitter3` | đi kèm `phaser` | Arnout Kazemier | **MIT** |
| `tslib` | đi kèm `@capacitor/core`, `colyseus.js` | Microsoft | **0BSD** |
| `@capacitor/core`, `@capacitor/app` | xem mục 5 | Ionic Team / Drifty Co. | **MIT** |
| `ws` | đi kèm `colyseus.js` (chỉ dùng khi chạy trên Node; liệt kê cho đủ) | Einar Otto Stangvik, Arnout Kazemier và cộng sự | **MIT** |
| Earcut 2.2.4 (nhúng trong Phaser, `src/geom/polygon/Earcut.js`) | theo `phaser` | Mapbox | **ISC** |
| Simplify.js (nhúng trong Phaser, `src/geom/polygon/Simplify.js`) | theo `phaser` | Vladimir Agafonkin | **BSD 2 điều khoản** |

---

## 6. Tài sản bên thứ ba có tệp trong repo (nguồn, tác giả, giấy phép, ngày, SHA-256)

Mỗi tệp của bên thứ ba trong `client/public/fonts/` PHẢI có một dòng ở bảng dưới, cùng dòng với **tên tệp** và **SHA-256 thật** của nội dung tệp hiện tại (`sha256sum <tệp>`). `npm run check:credits` (và `client/src/credits.test.ts` trong CI) đỏ nếu thiếu tệp, thiếu băm hoặc băm sai (đổi tệp mà quên cập nhật dòng này).

| Tệp | Nguồn | Tác giả | Giấy phép | Ngày lấy | SHA-256 |
|---|---|---|---|---|---|
| `noto-serif-latin-wght-normal.woff2` (Latin + dấu câu, đứng, độ đậm 400-700) | npm `@fontsource-variable/noto-serif@5.3.0` (`files/noto-serif-latin-wght-normal.woff2`; bản gốc: [notofonts/latin-greek-cyrillic](https://github.com/notofonts/latin-greek-cyrillic)) | The Noto Project Authors | SIL OFL 1.1 | 12/11/2026 | `46281456234014ceb2a79bff447245de0f76b8d803be0738972ed374c3206c5b` |
| `noto-serif-vietnamese-wght-normal.woff2` (chữ có dấu tiếng Việt, đứng) | npm `@fontsource-variable/noto-serif@5.3.0` (`files/noto-serif-vietnamese-wght-normal.woff2`) | The Noto Project Authors | SIL OFL 1.1 | 12/11/2026 | `fb6a5ed734c2fbe39794a1e11ea075c70676ed82b8e8cd57c175ebbb4af805c1` |
| `noto-serif-latin-wght-italic.woff2` (Latin + dấu câu, nghiêng) | npm `@fontsource-variable/noto-serif@5.3.0` (`files/noto-serif-latin-wght-italic.woff2`) | The Noto Project Authors | SIL OFL 1.1 | 12/11/2026 | `a1a6ebee6d69b2628ac102f55cb447135643a5401ae92eb77f4e2c6888dfce22` |
| `noto-serif-vietnamese-wght-italic.woff2` (chữ có dấu tiếng Việt, nghiêng) | npm `@fontsource-variable/noto-serif@5.3.0` (`files/noto-serif-vietnamese-wght-italic.woff2`) | The Noto Project Authors | SIL OFL 1.1 | 12/11/2026 | `7b88e337afea323d51a3ec524b4da220f4913646eb590cab048feda319364390` |
| `OFL.txt` (văn bản giấy phép SIL OFL 1.1 đi kèm phông, OFL yêu cầu giữ cùng bản phân phối) | npm `@fontsource-variable/noto-serif@5.3.0` (`LICENSE`) | The Noto Project Authors | SIL OFL 1.1 | 12/11/2026 | `45d545469122348b916bfa4d362f691c3f7f3af7169fd46f920845cae97923df` |

Chỉ dùng tập con `latin` + `vietnamese` (đủ cho tiếng Việt); không đóng gói `latin-ext` (~187 KB) vì chữ ngoài hai tập con này rơi về `Georgia` / `serif` hệ thống. Không sửa nội dung tệp phông (OFL cho phép phân phối lại nguyên bản).

### Mẫu mục cho tài sản bên thứ ba (CC0 / CC-BY / OFL) để B / C dùng về sau

1. Chỉ lấy tài sản CC0, CC-BY hoặc OFL (xem mục 3); KHÔNG lấy gì của game khác, trừ nội dung / hình / âm của Vạn Kiếp Tu Tiên đã được tác giả cho phép (ghi từng tệp ở `docs/NGUON_NOI_DUNG.md`, tệp nằm dưới thư mục có đoạn `vktt/`, và vẫn thêm dòng ở đây: `check:credits` kiểm hai chiều) và ảnh AI SDXL base (ghi model / prompt / seed / ngày / người chỉnh).
2. Bỏ tệp vào `client/public/<thư mục>/` rồi thêm dòng vào bảng mục 6 theo mẫu dưới. Với CC-BY, cột "Tác giả" phải đúng tên người ghi công và cột "Nguồn" là đường dẫn trang gốc; kèm tệp giấy phép nếu giấy phép yêu cầu (như `OFL.txt`).
3. Chạy `sha256sum client/public/<thư mục>/<tệp>` và dán băm VÀO ĐÚNG DÒNG CÓ TÊN TỆP; thêm thư mục mới vào `hashDirs` của `auditHashes` (`client/scripts/check-credits.mjs`) nếu chưa có.
4. `npm run check:credits` phải xanh.

```
| `ten-tep.ext` (mô tả ngắn) | URL trang gốc hoặc gói + phiên bản | Tên tác giả | CC0 1.0 / CC-BY 4.0 / OFL 1.1 | dd/mm/yyyy | `<64 ký tự hex từ sha256sum>` |
```

---

## 7. Ảnh do AI sinh (SDXL base, nhóm Tiên Giới tự sinh)

Ảnh sinh bằng ComfyUI **chỉ với model SDXL base** (không model / LoRA khác nếu chưa hỏi người dùng; `QUYET_DINH_M3.md` mục 18.3, quy trình ở `docs/KE_HOACH_DO_HOA_AI.md`), chạy trên máy của nhóm, hậu kỳ bằng script có tham số ghi lại (không vẽ tay), không chữ Hán / chữ lạ, prompt không nêu tên, nhân vật hay phong cách của game khác. Ảnh vào game nằm RIÊNG ở `client/public/assets/ai/` (chỉ `.webp` hoặc `.png`, đã xoá toàn bộ siêu dữ liệu).

Mỗi ảnh PHẢI có: (1) một dòng ở bảng dưới (tên tệp đầy đủ + mô tả ngắn + ngày); (2) tệp nguồn `docs/art/nguon/<tên>.json` cùng tên với ảnh, đủ các trường ở `docs/KE_HOACH_DO_HOA_AI.md` mục 9.3 (model + sha256 (PHẢI là băm của checkpoint SDXL base 1.0, `31e35c80...3f7e5b`), workflow + sha256, prompt, seed, `postProcess`, `reviewed` có `noText` và `noOtherGameLikeness` đều true...) và `finalSha256` KHỚP tệp ảnh thật; (3) không có khối siêu dữ liệu (PNG: `tEXt` / `iTXt` / `zTXt` / `eXIf`; WebP: `EXIF` / `XMP `); (4) dung lượng trong trần ở `client/perf-budget.json` (`static.aiAssets`: mỗi ảnh <= 150 KB, tổng <= 300 KB). `npm run check:credits` (và `client/src/credits.test.ts` trong CI) đỏ nếu thiếu JSON, đổi byte ảnh, sai băm, JSON mồ côi, thiếu dòng ở bảng này hoặc còn siêu dữ liệu; `npm run check:budget` đỏ nếu vượt trần.

| Ảnh | Mô tả | Model | Ngày sinh | Tệp nguồn |
|---|---|---|---|---|
| (chưa có ảnh AI nào trong repo) | | | | |
