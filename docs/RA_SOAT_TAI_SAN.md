# Báo Cáo Rà Soát Tài Sản & Bản Quyền (M4 Mục 4.4)

> Thực hiện theo kế hoạch M4-sớm (Issue #257, `docs/PHAN_CONG_M4.md` mục 4.4).
> Người thực hiện: **Dev B (Client & Trải nghiệm)**.
> Ngày thực hiện: **11/11/2026**.
> **Cập nhật M6 (13/11/2026, Issue #411 mục 4 phần tài sản, Dev B):** thêm 15 icon Kim Đan, khung atlas M6, các mô-đun đồ hoạ vẽ bằng mã của M5-M6, ảnh chụp trong `docs/`, danh xưng M6 (mục 2, 2b-2d, 3, 6). Các số liệu M4 đã cũ được sửa tại chỗ; mốc M4 giữ trong `git log`.

---

## 1. Mục tiêu và phạm vi rà soát

1. **Rà soát toàn diện mọi tệp tài nguyên tĩnh** trong `client/public/` (ảnh, tileset, atlas, icon, SVG) và tài nguyên nhúng runtime trong `client/src/` (audio tổng hợp Web Audio, textures vẽ bằng Canvas).
2. **Đối chiếu giấy phép với `CREDITS.md`**: Đảm bảo mọi tài nguyên đều có nguồn gốc rõ ràng, tác giả, đường dẫn tệp và chỉ thuộc giấy phép **CC0 1.0 Public Domain**, **CC-BY 3.0 / 4.0**, hoặc **SIL OFL 1.1**.
3. **Tuân thủ quy tắc sáng tạo độc quyền**: Tuyệt đối không sao chép hình ảnh, âm thanh, tên gọi, danh xưng hay cốt truyện của bất kỳ trò chơi nào khác.
4. **Xây dựng công cụ kiểm tra tự động**: Tự động phát hiện tệp tài nguyên mới chưa khai báo trong `CREDITS.md` (`npm run check:credits`).

---

## 2. Bảng thống kê chi tiết tài sản (44 tệp tĩnh = 24 của M4 + 5 phông (#331) + 15 icon Kim Đan (M6); các mô-đun vẽ bằng mã ở mục 2c)

| STT | Đường dẫn tệp | Loại tài nguyên | Nguồn gốc / Tác giả | Giấy phép | Tình trạng |
|:---:|---|---|---|:---:|:---:|
| 1 | `client/public/assets/tileset.png` | Tileset địa hình 8 ô 32×32 px | Do nhóm Tiên Giới (Dev B) tự vẽ bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 2 | `client/public/assets/atlas.png` | Texture Atlas nhân vật, NPC, quái, hiệu ứng | Do nhóm Tiên Giới (Dev B) tự vẽ bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 3 | `client/public/assets/atlas.json` | JSON Frame map của Atlas | Do nhóm Tiên Giới (Dev B) đóng gói bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 4 | `client/public/assets/items/hoi_huyet_dan.png` | Icon đan dược Hồi Huyết Đan | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 5 | `client/public/assets/items/hoi_linh_dan.png` | Icon đan dược Hồi Linh Đan | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 6 | `client/public/assets/items/tu_khi_dan.png` | Icon đan dược Tụ Khí Đan | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 7 | `client/public/assets/items/long_tho.png` | Icon nguyên liệu Lông Thỏ | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 8 | `client/public/assets/items/nanh_soi.png` | Icon nguyên liệu Nanh Sói | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 9 | `client/public/assets/items/da_ho.png` | Icon nguyên liệu Da Hổ | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 10 | `client/public/assets/items/vay_mang.png` | Icon nguyên liệu Vảy Mãng | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 11 | `client/public/assets/items/lang_nha_kiem.png` | Icon vũ khí Lang Nha Kiếm | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 12 | `client/public/assets/items/tho_nhung_bao.png` | Icon pháp bào Thỏ Nhung Bào | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 13 | `client/public/assets/items/lang_nha_phu.png` | Icon pháp bảo Lang Nha Phù | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 14 | `client/public/assets/items/hac_ho_kiem.png` | Icon vũ khí Hắc Hổ Kiếm | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 15 | `client/public/assets/items/hac_ho_bao.png` | Icon pháp bào Hắc Hổ Bào | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 16 | `client/public/assets/items/ho_hon_phu.png` | Icon pháp bảo Hổ Hồn Phù | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 17 | `client/public/assets/items/xich_mang_kiem.png` | Icon vũ khí Xích Mãng Kiếm | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 18 | `client/public/assets/items/xich_lan_bao.png` | Icon pháp bào Xích Lân Bào | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 19 | `client/public/assets/items/mang_dam_phu.png` | Icon pháp bảo Mãng Đảm Phù | Do nhóm Tiên Giới (Dev B) tự sinh từ pixel data | **CC0 1.0** | ✓ Hợp lệ |
| 20 | `client/public/icons/icon.svg` | Vector biểu tượng kiếm Tiên Giới | Do nhóm Tiên Giới (Dev C) thiết kế bằng SVG thuần | **CC0 1.0** | ✓ Hợp lệ |
| 21 | `client/public/icons/icon-192.png` | Icon PWA 192×192 px | Sinh từ `icon.svg` | **CC0 1.0** | ✓ Hợp lệ |
| 22 | `client/public/icons/icon-512.png` | Icon PWA 512×512 px | Sinh từ `icon.svg` | **CC0 1.0** | ✓ Hợp lệ |
| 23 | `client/public/icons/icon-maskable-512.png` | Icon PWA Maskable 512×512 px | Sinh từ `icon.svg` với safe-zone Android | **CC0 1.0** | ✓ Hợp lệ |
| 24 | `client/public/icons/apple-touch-icon.png` | Icon iOS Touch 180×180 px | Sinh từ `icon.svg` | **CC0 1.0** | ✓ Hợp lệ |
| 25 | `client/src/textures.ts` | Texture đồ họa canvas runtime | Do nhóm Tiên Giới (Dev B) dựng bằng Canvas API | **CC0 1.0** | ✓ Hợp lệ |
| 26 | `client/src/audio.ts` | Nhạc nền & hiệu ứng SFX runtime | Do nhóm Tiên Giới (Dev B) tổng hợp bằng Web Audio API | **CC0 1.0** | ✓ Hợp lệ |
| 27 | `client/public/fonts/` (4 tệp `woff2` + `OFL.txt`): `Noto Serif` | Phông chữ tiếng Việt cổ phong, **tự lưu từ #331** (trước đây nạp từ Google Fonts qua CDN) | The Noto Project Authors (gói Fontsource `@fontsource-variable/noto-serif@5.3.0`) | **SIL OFL 1.1** | ✓ Hợp lệ (nguồn, ngày, SHA-256 ở `CREDITS.md` mục 6) |
| 28 | `client/public/assets/items/suong_mao.png` | Icon nguyên liệu Sương mao (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 29 | `client/public/assets/items/quy_giap.png` | Icon nguyên liệu Quy giáp (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 30 | `client/public/assets/items/doc_nang.png` | Icon nguyên liệu Độc nang (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 31 | `client/public/assets/items/giao_lan.png` | Icon nguyên liệu Giao lân (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 32 | `client/public/assets/items/dai_hoi_huyet_dan.png` | Icon đan dược Đại Hồi Huyết Đan (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 33 | `client/public/assets/items/dai_hoi_linh_dan.png` | Icon đan dược Đại Hồi Linh Đan (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 34 | `client/public/assets/items/suong_vu_kiem.png` | Icon vũ khí Sương Vũ Kiếm (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 35 | `client/public/assets/items/suong_ho_bao.png` | Icon pháp bào Sương Hồ Bào (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 36 | `client/public/assets/items/ho_tam_phu.png` | Icon pháp bảo Hồ Tâm Phù (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 37 | `client/public/assets/items/huyen_quy_kiem.png` | Icon vũ khí Huyền Quy Kiếm (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 38 | `client/public/assets/items/quy_giap_bao.png` | Icon pháp bào Quy Giáp Bào (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 39 | `client/public/assets/items/quy_tuc_phu.png` | Icon pháp bảo Quy Tức Phù (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 40 | `client/public/assets/items/hac_giao_kiem.png` | Icon vũ khí Hắc Giao Kiếm (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 41 | `client/public/assets/items/giao_lan_bao.png` | Icon pháp bào Giao Lân Bào (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 42 | `client/public/assets/items/giao_long_phu.png` | Icon pháp bảo Giao Long Phù (M6 #407) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |

> Hàng 2-3 (atlas) nay có **337 khung** (xem 2b). Hàng 4-19 và 28-42 cộng lại là **31 icon** (khớp 31 mặt hàng trong `ITEMS` của `shared/`: mọi vật phẩm đều có icon riêng, không món nào dùng ảnh thay thế).

### 2b. Khung atlas (tệp 2-3) sau M6: 337 khung, toàn bộ sinh bằng `gen-assets.mjs`

| Nhóm khung | Số khung | Nội dung |
|---|:---:|---|
| `me`, `other` | 41 + 41 | Nhân vật (mình / người khác): 4 hướng x đứng / đi / chém, tư thế bị đánh `-hurt-<hướng>`, gục `-die-0..3` |
| `robe-*` | 123 | Ba bộ pháp bào `tho_nhung_bao`, `hac_ho_bao`, `xich_lan_bao` (3 x 41 khung như trên) |
| `mon-*` | 90 | **9 yêu thú x 10 khung** (đứng, đi 0-1, đánh `atk-0..1`, bị đánh `hurt`, gục `die-0..3`): `tho`, `lang`, `ho`, `mang` và **M6 #407** `suong_ho`, `thach_quy`, `doc_thiem`, `hac_giao`, `yeu_vuong` |
| `npc-*` | 9 | `truong_tran`, `duoc_su`, `tho_ren`, `cao_thi`, `lai_buon`, `thu_mon` và **M6** `tram_truong`, `lai_buon_suong`, `tho_ren_suong` |
| `item-*` | 31 | Biểu tượng vật phẩm trong thế giới (rơi trên đất), một khung cho mỗi icon ở bảng trên |
| `swordbeam`, `dot` | 1 + 1 | Kiếm khí, chấm nhỏ dùng chung |

Tư thế đánh / bị đánh / gục của yêu thú và nhân vật suy từ khung đi / đứng bằng biến đổi + đổi màu NGAY trong script (không có ảnh ngoài).

### 2c. Mô-đun đồ hoạ vẽ bằng mã lúc chạy (không có tệp ảnh; không thuộc phạm vi quét của `check:credits`)

| Mô-đun | Sinh ra | Ghi chú nguồn |
|---|---|---|
| `client/src/textures.ts` | Vòng sáng thiền định, tia sáng đột phá, minimap, dấu ấn quyết đấu, texture tạm | Canvas 2D, do nhóm viết |
| `client/src/audio.ts` | Nhạc nền ngũ cung, SFX | Web Audio API, tổng hợp thời gian thực |
| `client/src/gfx/decor-tileset.ts` | Tileset trang trí mỗi bản đồ (10 khung 32x32 theo `MapStyle.decor.palette`, kể cả **Âm Sương Trạch**) | Canvas 2D, tất định theo hạt giống bản đồ |
| `client/src/gfx/map-light.ts`, `map-fog.ts`, `map-water.ts` | Ánh sáng + vignette, sương trôi, mặt nước lấp lánh (texture ~64 KB / 64 KB / 128x32) | Canvas 2D, màu từ `MapStyle` (`gfx/map-style.ts`: Lạc Hà, Hắc Phong, Âm Sương, bí cảnh) |
| `client/src/gfx/fx/atlas.ts` | Atlas hạt 192x32 (6 khung) + phông bit-map chữ bay | Hạt: Canvas 2D. **Phông bit-map: hình chữ lấy từ phông hệ thống / Noto Serif** (SIL OFL 1.1, đã có `client/public/fonts/OFL.txt` và dòng ở `CREDITS.md` mục 6): OFL cho phép nhúng, không phải tài sản ngoài mới |
| `client/src/gfx/anim/entity-lod.ts` | Texture bóng đốm dưới chân | Canvas 2D |
| `client/index.html` (`<symbol id="i-...">`) | 12 biểu tượng nút HUD / hành động bằng SVG nét đơn | Tự vẽ, thay chữ Hán (`QUYET_DINH_M3` mục 12) |

### 2d. Ảnh chụp màn hình trong `docs/` (không phải tài sản phát hành)

`docs/screenshots/` (kể cả bộ M6: `m6-ban-do/` Hắc Phong + Âm Sương x 5 khung, `m6-nhat-ky/`, `m6-ren-cua-hang/`, `hieu-ung-hac-giao.webp`) và `docs/screenshots/m5-baseline/` đều CHỤP TỪ CHÍNH GAME (chế độ mock, `capture-viewports.mjs`, `snap-*.mjs`, `check-*.mjs --shot`) nên chỉ chứa tài sản của Tiên Giới ở trên; không có ảnh chụp trò chơi khác, không ảnh stock. Không vào `client/dist` (không được phát hành cùng ứng dụng).

---

### 2e. Tài sản có AI sinh nháp (SDXL base)

- Số tệp ảnh AI trong `client/public/assets/ai/`: **0 tệp** (chưa có ảnh AI nào vào repo; đường kiểm tự động đã sẵn sàng TRƯỚC khi ảnh đầu tiên vào).
- Mỗi ảnh vào đây phải có: tệp nguồn `docs/art/nguon/<tên>.json` (đủ trường mục 9.3 của `docs/KE_HOACH_DO_HOA_AI.md`, `finalSha256` khớp), một dòng ở `CREDITS.md` mục 7, không siêu dữ liệu (PNG không `tEXt` / `iTXt` / `zTXt` / `eXIf`, WebP không `EXIF` / `XMP `), chỉ model SDXL base và không LoRA, người duyệt xác nhận không chữ và không giống game khác, dung lượng <= trần `static.aiAssets` (mỗi ảnh 150 KB, tổng 300 KB).
- Bảng ảnh (thêm hàng khi có ảnh; `credits.test.ts` đếm số tệp thật và so với con số "0 tệp" ở trên):

| Ảnh | Tệp nguồn | Ngày | Người duyệt |
|---|---|---|---|
| (chưa có) | | | |

---

## 3. Rà soát danh xưng và cốt truyện (Chống sao chép thương hiệu)

Danh sách HIỆN HÀNH, lấy từ dữ liệu của `shared/` (bản M4 ghi id đã đổi như `tho_rung`, `soi_hoang`, `hac_phong_lam`, `boss_mang_xa`: không còn trong mã):
- **Bản đồ và địa danh:** Lạc Hà Trấn (`lac_ha`; vùng hoang Vân Mộng Sơn), Hắc Phong Cốc (`hac_phong`; Thanh Lộ Trạm), **Âm Sương Trạch** (`am_suong`; **Vọng Sương Trạm**, M6); bí cảnh Linh Hư; Hoàng Tuyền / Vong Xuyên Hà / Tam Sinh Thạch. Cổng: Bắc Môn Quan, Nam Môn Quan, Vọng Trạch Quan, **Hồi Phong Quan** (M6).
- **Nhân vật NPC (9):** Lâm Thanh Tùng (trưởng trấn), Hà lão (dược sư), Thiết Ngưu (thợ rèn), Bảng cáo thị, Mạc Thông (lái buôn Hắc Phong), Huyền Cơ (thủ môn bí cảnh) và **M6:** Tống Vân Hạc (trạm trưởng), Phó Quang (lái buôn), Hồ Thiết (thợ rèn) ở Vọng Sương Trạm.
- **Yêu thú (9):** Linh Thố, Hôi Lang, Hắc Hổ, Xích Mãng (trùm), Linh Hư Yêu Vương (trùm bí cảnh) và **M6:** Sương Hồ, Thạch Quy, Độc Thiềm, **Hắc Giao** (trùm Kim Đan).
- **Vật phẩm M6 (15):** nguyên liệu Sương mao / Quy giáp / Độc nang / Giao lân; Đại Hồi Huyết Đan / Đại Hồi Linh Đan; ba bộ Kim Đan: Sương Vũ Kiếm - Sương Hồ Bào - Hồ Tâm Phù, Huyền Quy Kiếm - Quy Giáp Bào - Quy Tức Phù, Hắc Giao Kiếm - Giao Lân Bào - Giao Long Phù.
- **Hệ thống tu vi:** 10 cảnh giới kinh điển văn học tiên hiệp phương Đông (Phàm Nhân, Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Luyện Hư, Hợp Thể, Đại Thừa, Độ Kiếp) - thuật ngữ chung của thể loại.

> **Kết luận (phạm vi và giới hạn):** các tên trên là tên riêng do nhóm đặt hoặc thuật ngữ chung của dòng văn học tiên hiệp (tên thú vật / vật liệu / địa hình ghép từ Hán-Việt phổ thông); người rà soát (Dev B) **không thấy** tên nào lấy nguyên từ một tựa game cụ thể. Đây là rà soát bằng mắt trên danh sách, KHÔNG phải tra cứu nhãn hiệu: nếu cần bảo đảm pháp lý (trước khi phát hành rộng) thì phải có người tra cứu nhãn hiệu riêng, việc nằm ngoài khả năng của công cụ ở đây. Quy tắc "không dùng chữ, tên, hình hay âm thanh của game khác" vẫn là điều kiện bắt buộc của mọi PR (AGENTS.md).

---

## 4. Công cụ kiểm soát bản quyền tự động (`npm run check:credits`)

- Script tự động: `client/scripts/check-credits.mjs`.
- Unit test: `client/src/credits.test.ts` (kiểm tra toàn diện 100% tài nguyên và các ca đột biến).
- Thời gian chạy: `< 10 ms`.
- Cơ chế kiểm duyệt nghiêm ngặt:
  1. **Khớp trọn token (`matchExactToken`)**: Sử dụng ranh giới ký tự tên tệp `(^|[^A-Za-z0-9_.-])<escaped>($|[^A-Za-z0-9_.-])`, chống tuyệt đối việc lọt chuỗi con (ví dụ `con.svg` không thể lọt nhờ `icon.svg`, `512.png` không thể lọt nhờ `icon-512.png`).
  2. **Không dùng wildcard thư mục**: Mọi tệp mới (kể cả trong `assets/items/`) đều bắt buộc phải được ghi rõ đích danh tên tệp trong `CREDITS.md`. Thêm bất kỳ tệp nào vào `assets/items/` mà không ghi danh sẽ lập tức bị chặn đỏ.
- Chức năng: Khi có bất kỳ tệp mới nào được thêm vào `client/public/assets`, `client/public/icons` hoặc `client/public/fonts` mà chưa được khai báo đầy đủ trong `CREDITS.md`, lệnh `npm run check:credits` sẽ báo lỗi và ngăn chặn commit / build CI.
  3. **SHA-256 cho tài sản bên thứ ba (#331)**: mỗi tệp trong `client/public/fonts/` phải có dòng bảng ở `CREDITS.md` mục 6 chứa CẢ tên tệp LẪN SHA-256 thật của nội dung hiện tại (`auditHashes`). Đổi / thay tệp mà quên cập nhật nguồn + băm, thiếu băm, băm của tệp khác hay băm nằm ở dòng khác đều đỏ (3 đột biến trong `credits.test.ts`).
  4. **Ảnh do AI sinh (M7.12 #513)**: `auditAiImages` kiểm `client/public/assets/ai/` hai chiều với `docs/art/nguon/<tên>.json` (băm, lược đồ, SDXL base, không LoRA, người duyệt xác nhận), dòng riêng ở `CREDITS.md` mục 7 và siêu dữ liệu sạch (mục 2e); trần dung lượng ở `client/perf-budget.json` `static.aiAssets` (`check:budget`).

---

## 5. Kết quả rà soát M6 (13/11/2026, `npm run check:credits`)

| Hạng mục | Kết quả |
|---|---|
| Tệp tĩnh quét (`client/public/assets`, `icons`, `fonts`) | **44 tệp** (3 trong `assets/` + 31 icon + 5 icon PWA + 5 phông), **0 tệp thiếu nguồn / tác giả / giấy phép** |
| Tài sản bên thứ ba có SHA-256 khớp `CREDITS.md` mục 6 | 5 / 5 (4 tệp `woff2` + `OFL.txt`) |
| Giấy phép | CC0 1.0 (Tiên Giới tự tạo) cho 39 tệp; SIL OFL 1.1 cho 5 tệp phông (Noto Serif); không có CC-BY mới |
| Mô-đun đồ hoạ / âm thanh vẽ bằng mã | 7 dòng (mô-đun hoặc nhóm mô-đun) ở 2c, không có tài sản ngoài |
| Tên gọi mới (M6) | xem mục 3: không phát hiện tên lấy nguyên từ game khác (rà bằng mắt, không tra nhãn hiệu) |
| `client/src/credits.test.ts` | 12 ca xanh: 9 ca gốc (gồm đột biến: tệp mới chưa khai báo, khớp chuỗi con, thiếu / sai SHA-256) + 3 ca canh tài liệu (số tệp ghi ở `CREDITS.md` mục 4 và tiêu đề mục 2 khớp số tệp thật; mọi icon vật phẩm có hàng ở bảng mục 2): thêm tài sản mà quên cập nhật tài liệu thì đỏ |

**Việc còn mở (không chặn M6):** (1) rà soát nhãn hiệu thật sự cho tên gọi trước khi phát hành rộng (cần người, mục 3); (2) `docs/screenshots/` và `docs/screenshots/m5-baseline/` không nằm trong phạm vi quét của `check:credits` (không phát hành, mục 2d): nếu sau này ảnh chụp được dùng ngoài tài liệu (cửa hàng ứng dụng, trang giới thiệu) thì cần rà lại.

