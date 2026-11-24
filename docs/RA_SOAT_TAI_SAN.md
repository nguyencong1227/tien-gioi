# Báo Cáo Rà Soát Tài Sản & Bản Quyền (M4 Mục 4.4)

> Thực hiện theo kế hoạch M4-sớm (Issue #257, `docs/PHAN_CONG_M4.md` mục 4.4).
> Người thực hiện: **Dev B (Client & Trải nghiệm)**.
> Ngày thực hiện: **11/11/2026**.
> **Cập nhật nghề nhỏ lát 2 (17/11/2026, #817, Dev B):** thêm 1 NPC Bàn phù `lao_phu` (Tô Linh Ấn, lão phù sư áo tím giơ dải phù và cầm bút lông) và 9 icon phù (hàng 90-98, vẽ SAU dữ liệu của Dev G: dải giấy phù, hệ đọc bằng HÌNH ở giữa + màu dải, bậc đọc bằng SỐ chấm vàng 1-4) sinh bằng `gen-assets.mjs`, atlas 448 khung (mục 2b), tổng 101 tệp tĩnh.
>
> **Cập nhật nghề nhỏ lát 1 (16/11/2026, #763, Dev B):** thêm 3 icon đan hộ đạo `dot_pha_dan`, `kinh_chi_dan`, `duong_anh_dan` (hàng 87-89, vẽ SAU dữ liệu của Dev D, mỗi viên có ngọn lửa luyện và 1 / 2 / 3 mũi tên lên theo bậc cảnh giới) và 1 NPC Lò đan `lao_dan` (Mộc Diên) sinh bằng `gen-assets.mjs`, atlas 438 khung (mục 2b), tổng 91 tệp tĩnh.
>
> **Cập nhật M7.4 (15/11/2026, #505, Dev A):** thêm 14 icon cho đồ ba ô riêng (hài, ngọc bội, pháp bảo) sinh bằng `gen-assets.mjs` (hàng 43-56, mục 2) và 12 icon kinh quyển (hàng 57-68), atlas 363 khung (mục 2b), tổng 70 tệp tĩnh.
>
> **Cập nhật M6 (13/11/2026, Issue #411 mục 4 phần tài sản, Dev B):** thêm 15 icon Kim Đan, khung atlas M6, các mô-đun đồ hoạ vẽ bằng mã của M5-M6, ảnh chụp trong `docs/`, danh xưng M6 (mục 2, 2b-2d, 3, 6). Các số liệu M4 đã cũ được sửa tại chỗ; mốc M4 giữ trong `git log`.
>
> **Cập nhật nghề nhỏ CT17 lát 2 (22/11/2026, #1187, Dev G):** thêm 2 icon kinh quyển Mộc `kinh_me_hon_huong_quyet`, `kinh_man_da_hoa_kinh` (hàng 138-139, bìa theo hệ mộc, không dấu) sinh bằng `gen-assets.mjs`, atlas 490 khung (mục 2b), tổng 147 tệp tĩnh.

---

## 1. Mục tiêu và phạm vi rà soát

1. **Rà soát toàn diện mọi tệp tài nguyên tĩnh** trong `client/public/` (ảnh, tileset, atlas, icon, SVG) và tài nguyên nhúng runtime trong `client/src/` (audio tổng hợp Web Audio, textures vẽ bằng Canvas).
2. **Đối chiếu giấy phép với `CREDITS.md`**: Đảm bảo mọi tài nguyên đều có nguồn gốc rõ ràng, tác giả, đường dẫn tệp và chỉ thuộc giấy phép **CC0 1.0 Public Domain**, **CC-BY 3.0 / 4.0**, hoặc **SIL OFL 1.1**.
3. **Tuân thủ quy tắc sáng tạo độc quyền**: Tuyệt đối không sao chép hình ảnh, âm thanh, tên gọi, danh xưng hay cốt truyện của bất kỳ trò chơi nào khác.
4. **Xây dựng công cụ kiểm tra tự động**: Tự động phát hiện tệp tài nguyên mới chưa khai báo trong `CREDITS.md` (`npm run check:credits`).

---

<!-- AUTO-RA-SOAT-HEADER:START -->## 2. Bảng thống kê chi tiết tài sản (172 tệp tĩnh; các mô-đun vẽ bằng mã ở mục 2c)<!-- AUTO-RA-SOAT-HEADER:END -->

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
<!-- AUTO-RA-SOAT-ITEM-ROWS:START -->
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
| 43 | `client/public/assets/items/ho_bo_ngoa.png` | Icon hài Hổ Bộ Ngoa (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 44 | `client/public/assets/items/mang_hanh_ngoa.png` | Icon hài Mãng Hành Ngoa (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 45 | `client/public/assets/items/suong_van_ngoa.png` | Icon hài Sương Vân Ngoa (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 46 | `client/public/assets/items/giao_anh_ngoa.png` | Icon hài Giao Ảnh Ngoa (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 47 | `client/public/assets/items/tho_nguyet_boi.png` | Icon ngọc bội Thố Nguyệt Bội (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 48 | `client/public/assets/items/mang_tinh_boi.png` | Icon ngọc bội Mãng Tinh Bội (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 49 | `client/public/assets/items/suong_linh_boi.png` | Icon ngọc bội Sương Linh Bội (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 50 | `client/public/assets/items/giao_chau_boi.png` | Icon ngọc bội Giao Châu Bội (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 51 | `client/public/assets/items/ho_than_an.png` | Icon pháp bảo Hộ Thân Ấn (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 52 | `client/public/assets/items/hap_linh_chau.png` | Icon pháp bảo Hấp Linh Châu (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 53 | `client/public/assets/items/xich_diem_an.png` | Icon pháp bảo Xích Diễm Ấn (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 54 | `client/public/assets/items/han_bang_an.png` | Icon pháp bảo Hàn Băng Ấn (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 55 | `client/public/assets/items/dinh_tam_chung.png` | Icon pháp bảo Định Tâm Chung (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 56 | `client/public/assets/items/phong_hanh_boi.png` | Icon pháp bảo Phong Hành Bội (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 57 | `client/public/assets/items/kinh_hoa_van_kiem.png` | Icon kinh quyển Hỏa Vân Kiếm Pháp (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 58 | `client/public/assets/items/kinh_bon_thach_quyen.png` | Icon kinh quyển Bôn Thạch Quyền (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 59 | `client/public/assets/items/kinh_ung_trao.png` | Icon kinh quyển Ưng Trảo Công (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 60 | `client/public/assets/items/kinh_trong_nhac_tram.png` | Icon kinh quyển Trọng Nhạc Kiếm Pháp (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 61 | `client/public/assets/items/kinh_huyen_bang_chi.png` | Icon kinh quyển Huyền Băng Chỉ (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 62 | `client/public/assets/items/kinh_kim_chung_trao.png` | Icon kinh quyển Kim Chung Tráo (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 63 | `client/public/assets/items/kinh_bich_thuy_hoi_xuan.png` | Icon kinh quyển Bích Thủy Hồi Xuân Thuật (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 64 | `client/public/assets/items/kinh_phieu_phong_bo.png` | Icon kinh quyển Phiêu Phong Bộ (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 65 | `client/public/assets/items/kinh_thanh_tung_phi_cham.png` | Icon kinh quyển Thanh Tùng Châm Quyết (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 66 | `client/public/assets/items/kinh_lac_tuyet_phan_phi.png` | Icon kinh quyển Lạc Tuyết Kiếm Quyết (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 67 | `client/public/assets/items/kinh_cuu_cung_khon_sat.png` | Icon kinh quyển Cửu Cung Trận Quyết (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 68 | `client/public/assets/items/kinh_me_tung_bo.png` | Icon kinh quyển Mê Tung Bộ (M7.4 #505) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 69 | `client/public/assets/items/han_lang_mao.png` | Icon nguyên liệu Hàn Lang Mao (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 70 | `client/public/assets/items/phong_nha_vu.png` | Icon nguyên liệu Phong Nha Vũ (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 71 | `client/public/assets/items/tuong_cot.png` | Icon nguyên liệu Tượng Cốt (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 72 | `client/public/assets/items/doc_tuoc_nang.png` | Icon nguyên liệu Độc Tước Nang (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 73 | `client/public/assets/items/thien_han_chau.png` | Icon nguyên liệu Thiên Hàn Châu (trùm Thiên Hàn Vương) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 74 | `client/public/assets/items/han_vu_kiem.png` | Icon vũ khí Hàn Vũ Kiếm (bộ IV Nguyên Anh) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 75 | `client/public/assets/items/han_lang_bao.png` | Icon pháp bào Hàn Lang Bào (bộ IV Nguyên Anh) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 76 | `client/public/assets/items/phong_nha_phu.png` | Icon hộ phù Phong Nha Phù (bộ IV Nguyên Anh) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 77 | `client/public/assets/items/tuyet_hanh_ngoa.png` | Icon hài Tuyết Hành Ngoa (bộ IV Nguyên Anh) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 78 | `client/public/assets/items/han_tinh_boi.png` | Icon ngọc bội Hàn Tinh Bội (bộ IV Nguyên Anh) (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 79 | `client/public/assets/items/thuong_hoi_huyet_dan.png` | Icon đan cấp 3 Thượng Hồi Huyết Đan (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 80 | `client/public/assets/items/thuong_hoi_linh_dan.png` | Icon đan cấp 3 Thượng Hồi Linh Đan (M7.5 #506) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 81 | `client/public/assets/items/kinh_han_quang_tien.png` | Icon kinh quyển Hàn Quang Tiễn (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 82 | `client/public/assets/items/kinh_bach_kim_trao.png` | Icon kinh quyển Bạch Kim Trảo (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 83 | `client/public/assets/items/kinh_van_thach_tran.png` | Icon kinh quyển Vạn Thạch Trận (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 84 | `client/public/assets/items/kinh_bang_hoa_loan.png` | Icon kinh quyển Băng Hoa Loạn (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 85 | `client/public/assets/items/kinh_liet_hoa_kiem.png` | Icon kinh quyển Liệt Hỏa Kiếm (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 86 | `client/public/assets/items/kinh_van_hanh_bo.png` | Icon kinh quyển Vân Hành Bộ (đợt 2 Nguyên Anh, #654; dấu riêng giữa bìa) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 87 | `client/public/assets/items/dot_pha_dan.png` | Icon đan hộ đạo Đột Phá Đan (nghề nhỏ lát 1, #763; viên đan có ngọn lửa luyện, 1 mũi tên lên = bậc Luyện Khí) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 88 | `client/public/assets/items/kinh_chi_dan.png` | Icon đan hộ đạo Kinh Chỉ Đan (nghề nhỏ lát 1, #763; ngọn lửa luyện, 2 mũi tên lên = bậc Trúc Cơ) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 89 | `client/public/assets/items/duong_anh_dan.png` | Icon đan hộ đạo Dưỡng Anh Đan (nghề nhỏ lát 1, #763; ngọn lửa luyện, 3 mũi tên lên = bậc Kim Đan) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 90 | `client/public/assets/items/phu_hoa_dan.png` | Icon phù Hỏa Đạn Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Hỏa, 1 chấm = Luyện Khí) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 91 | `client/public/assets/items/phu_hoa_cuonghuyet.png` | Icon phù Cuồng Huyết Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Hỏa, 1 chấm = Luyện Khí) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 92 | `client/public/assets/items/phu_kim_phicham.png` | Icon phù Phi Châm Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Kim, 2 chấm = Trúc Cơ) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 93 | `client/public/assets/items/phu_kim_toagia.png` | Icon phù Toái Giáp Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Kim, 2 chấm = Trúc Cơ) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 94 | `client/public/assets/items/phu_hoa_lieutiem.png` | Icon phù Liệt Diễm Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Hỏa, 2 chấm = Trúc Cơ) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 95 | `client/public/assets/items/phu_loi_loino.png` | Icon phù Lôi Nộ Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Lôi, 3 chấm = Kim Đan) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 96 | `client/public/assets/items/phu_hoa_tammoi.png` | Icon phù Tam Muội Hỏa Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Hỏa, 4 chấm = Nguyên Anh) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 97 | `client/public/assets/items/phu_moc_kimlan.png` | Icon phù Kim Lân Độc Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Mộc, 4 chấm = Nguyên Anh) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 98 | `client/public/assets/items/phu_tho_tocphong.png` | Icon phù Tốc Phong Phù (nghề nhỏ lát 2, #817; dải giấy phù, hình hệ ở giữa + màu dải theo hệ, số chấm vàng = bậc: Phong (giảm hồi chiêu), 2 chấm = Trúc Cơ) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 99 | `client/public/assets/items/kinh_thanh_van_kiem_khi.png` | Icon kinh quyển Thanh Vân Kiếm Khí (Kim, Huyền phẩm, Trúc Cơ) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 100 | `client/public/assets/items/kinh_ban_thach_ho_the.png` | Icon kinh quyển Bàn Thạch Hộ Thể (Thổ, Huyền phẩm, Trúc Cơ) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 101 | `client/public/assets/items/kinh_thu_thuy_kiem_anh.png` | Icon kinh quyển Thu Thủy Kiếm Ảnh (Kim, Huyền phẩm, Kim Đan) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 102 | `client/public/assets/items/kinh_liet_dia_nhat_quyen.png` | Icon kinh quyển Liệt Địa Nhất Quyền (Thổ, Huyền phẩm, Kim Đan) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 103 | `client/public/assets/items/kinh_phan_nhac_tram.png` | Icon kinh quyển Phân Nhạc Trảm (Thổ, Huyền phẩm, Kim Đan) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 104 | `client/public/assets/items/kinh_van_kiem_quy_tong.png` | Icon kinh quyển Vạn Kiếm Quy Tông (Kim, Địa phẩm, Nguyên Anh) (CT6 lát 1, #1051; bìa theo hệ, chiêu kiếm có dấu kiếm) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 105 | `client/public/assets/items/kinh_doc_dang_phuc.png` | Icon kinh quyển Độc Đằng Phục (Mộc, bẫy, Trúc Cơ) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 106 | `client/public/assets/items/kinh_phi_kiem_tam_lien.png` | Icon kinh quyển Phi Kiếm Tam Liên (Kim, đạn bay, Kim Đan) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 107 | `client/public/assets/items/kinh_liet_diem_tran.png` | Icon kinh quyển Liệt Diễm Trận (Hỏa, vùng, Kim Đan) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 108 | `client/public/assets/items/kinh_loi_lien_chau.png` | Icon kinh quyển Liên Châu Lôi (Lôi, sét lan, Kim Đan) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 109 | `client/public/assets/items/kinh_hon_phien_tuong.png` | Icon kinh quyển Hồn Phiên Tượng (Âm, tượng, Nguyên Anh) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 110 | `client/public/assets/items/kinh_pha_son_nhat_kich.png` | Icon kinh quyển Phá Sơn Nhất Kích (Thổ, chiêu vận, Nguyên Anh) (CT9 lát 1, #1054; bìa theo hệ) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 111 | `client/public/assets/items/kinh_hu_thuy_chuong.png` | Icon kinh quyển Hủ Thủy Chưởng (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 112 | `client/public/assets/items/kinh_trien_xa_thu.png` | Icon kinh quyển Triền Xà Thủ (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 113 | `client/public/assets/items/kinh_hac_sa_doc_chuong.png` | Icon kinh quyển Hắc Sa Độc Chưởng (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 114 | `client/public/assets/items/kinh_thi_doc_am_chuong.png` | Icon kinh quyển Thi Độc Âm Chưởng (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 115 | `client/public/assets/items/kinh_thiem_to_cong.png` | Icon kinh quyển Thiềm Tô Công (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 116 | `client/public/assets/items/kinh_doan_truong_chi_phap.png` | Icon kinh quyển Đoạn Trường Chỉ Pháp (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 117 | `client/public/assets/items/kinh_kho_moc_phung_xuan_quyet.png` | Icon kinh quyển Khô Mộc Phùng Xuân Quyết (hệ Mộc/Thủy CT7 #1052; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev E) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 118 | `client/public/assets/items/kinh_liet_diem_chuong.png` | Icon kinh quyển Liệt Diễm Chưởng (Hỏa, Hoàng phẩm, Luyện Khí) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 119 | `client/public/assets/items/kinh_xich_tuoc_phu.png` | Icon kinh quyển Xích Tước Phù (Hỏa, Huyền phẩm, Kim Đan) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 120 | `client/public/assets/items/kinh_han_bang_nhat_chuong.png` | Icon kinh quyển Hàn Băng Nhất Chưởng (Băng, Huyền phẩm, Trúc Cơ) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 121 | `client/public/assets/items/kinh_minh_anh_phuc_chuong.png` | Icon kinh quyển Minh Ảnh Phúc Chưởng (Âm, Huyền phẩm, Trúc Cơ) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 122 | `client/public/assets/items/kinh_loi_dinh_nhat_miet.png` | Icon kinh quyển Lôi Đình Nhất Miết (Lôi, Huyền phẩm, Kim Đan) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 123 | `client/public/assets/items/kinh_hoi_phong_lien_chuong.png` | Icon kinh quyển Hồi Phong Liên Chưởng (Phong, Huyền phẩm, Kim Đan) (CT8 lát 1; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 124 | `client/public/assets/items/kinh_thien_la_loi_cam.png` | Icon kinh quyển Thiên La Lôi Cấm (Lôi, Địa phẩm, Nguyên Anh) (CT8 lát 2; bìa theo hệ; dấu "trận" vẽ tay) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 125 | `client/public/assets/items/kinh_chuong_tam_loi_bao.png` | Icon kinh quyển Chưởng Tâm Lôi Bạo (Lôi, Địa phẩm, Nguyên Anh) (CT8 lát 2; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 126 | `client/public/assets/items/kinh_bach_thu_khieu_phong.png` | Icon kinh quyển Bách Thú Khiếu Phong (Phong, Địa phẩm, Nguyên Anh) (CT8 lát 2; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 127 | `client/public/assets/items/kinh_minh_vu_lac_hon.png` | Icon kinh quyển Minh Vũ Lạc Hồn (Âm, Địa phẩm, Nguyên Anh) (CT8 lát 2; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 128 | `client/public/assets/items/kinh_phuong_minh_cau_hoang.png` | Icon kinh quyển Phượng Minh Cầu Hoàng (Hỏa, Địa phẩm, Nguyên Anh) (CT8 lát 2; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 129 | `client/public/assets/items/kinh_huyet_anh_xuyen_tam.png` | Icon kinh quyển Huyết Ảnh Xuyên Tâm (vô sắc, Hoàng phẩm, Luyện Khí) (CT8 lát 3; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 130 | `client/public/assets/items/kinh_su_tu_hong.png` | Icon kinh quyển Sư Tử Hống (vô sắc, Huyền phẩm, Trúc Cơ) (CT8 lát 3; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 131 | `client/public/assets/items/kinh_cam_long_khau.png` | Icon kinh quyển Cầm Long Khấu (vô sắc, Huyền phẩm, Trúc Cơ) (CT8 lát 3; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 132 | `client/public/assets/items/kinh_hoa_huyet_phe_nguyen.png` | Icon kinh quyển Hóa Huyết Phệ Nguyên (vô sắc, Huyền phẩm, Kim Đan) (CT8 lát 3; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 133 | `client/public/assets/items/kinh_long_tuong_ho_the.png` | Icon kinh quyển Long Tượng Hộ Thể (vô sắc, Địa phẩm, Nguyên Anh) (CT8 lát 3; bìa theo hệ; ấn riêng giữa bìa sinh từ id, #1303) | Do nhóm Tiên Giới (Dev A) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 134 | `client/public/assets/items/kinh_kim_thoa_xuyen_tam.png` | Icon kinh quyển Kim Thoa Xuyên Tâm (kim, Hoàng phẩm, Luyện Khí) (CT17 lát 1, G; bìa theo hệ kim) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 135 | `client/public/assets/items/kinh_thuc_giap_phi_tan.png` | Icon kinh quyển Thực Giáp Phi Tán (kim, Huyền phẩm, Trúc Cơ) (CT17 lát 1, G; bìa theo hệ kim) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 136 | `client/public/assets/items/kinh_thiet_sa_chuong.png` | Icon kinh quyển Thiết Sa Chưởng (thổ, Hoàng phẩm, Luyện Khí) (CT17 lát 1, G; bìa theo hệ thổ) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 137 | `client/public/assets/items/kinh_chuong_vu_phong_lam.png` | Icon kinh quyển Chướng Vụ Phong Lâm (thổ, Địa phẩm, Nguyên Anh) (CT17 lát 1, G; bìa theo hệ thổ) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 138 | `client/public/assets/items/kinh_me_hon_huong_quyet.png` | Icon kinh quyển Mê Hồn Hương Quyết (mộc, Huyền phẩm, Trúc Cơ) (CT17 lát 2, G; bìa theo hệ mộc, không dấu) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 139 | `client/public/assets/items/kinh_man_da_hoa_kinh.png` | Icon kinh quyển Mạn Đà Hoa Kinh (mộc, Địa phẩm, Nguyên Anh) (CT17 lát 2, G; bìa theo hệ mộc, không dấu) | Do nhóm Tiên Giới (Dev G) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 140 | `client/public/assets/items/kinh_loi_hoa_pha_ta_chuong.png` | Icon kinh quyển Lôi Hỏa Phá Tà Chưởng (chiêu Lôi Hỏa Chưởng; lôi, Trúc Cơ) (CT15 đợt 2, #1185, D; bìa theo hệ lôi, ấn sinh từ id) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 141 | `client/public/assets/items/kinh_chan_hon_loi_phap.png` | Icon kinh quyển Chấn Hồn Lôi Pháp (chiêu Âm Lôi Chấn Hồn; lôi, Nguyên Anh) (CT15 đợt 2, #1185, D; bìa theo hệ lôi, ấn sinh từ id) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 142 | `client/public/assets/items/kinh_thuc_hon_nhat_chi.png` | Icon kinh quyển U Hồn Chỉ (chiêu Thực Hồn Nhất Chỉ; âm, cg0 Luyện Khí theo E) (CT16 đợt 2 lô 1, #1186, E; B vẽ TRƯỚC dữ liệu chiêu; bìa tím đen mực, ấn sinh từ id) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 143 | `client/public/assets/items/kinh_tich_da_phan_anh.png` | Icon kinh quyển Tịch Dạ Kiếm Quyết (chiêu Tịch Dạ Phân Ảnh; âm, cg1 theo E) (CT16 đợt 2 lô 1, #1186, E; B vẽ TRƯỚC dữ liệu chiêu; bìa xanh đêm, dấu kiếm) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 144 | `client/public/assets/items/kinh_kho_mach_dan_luu.png` | Icon kinh quyển Khô Mạch Chỉ (chiêu Khô Mạch Đoạn Lưu; âm, cg3 theo E) (CT16 đợt 2 lô 1, #1186, E; B vẽ TRƯỚC dữ liệu chiêu; bìa đen thâm, viền lục độc, ấn sinh từ id) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 145 | `client/public/assets/items/kinh_thuc_phat_am_trao.png` | Icon kinh quyển Thực Phách Âm Trảo (chiêu Thực Phách Âm Trảo; âm, cg2 theo E; dấu `trao` ba vệt vuốt cào) (CT16 đợt 2 lô 1, #1186, E; B vẽ TRƯỚC dữ liệu chiêu; bìa tím rượu, vệt trảo hồng tro; thay hai icon cg4 / cg5 đã gỡ ở #1387) | Do nhóm Tiên Giới (Dev B) sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 146 | `client/public/assets/items/kinh_huyet_co_bi_kinh.png` | Icon kinh quyển `kinh_huyet_co_bi_kinh` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 147 | `client/public/assets/items/kinh_huyet_ti_phuoc_than.png` | Icon kinh quyển `kinh_huyet_ti_phuoc_than` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 148 | `client/public/assets/items/kinh_no_dao_bai_khong.png` | Icon kinh quyển `kinh_no_dao_bai_khong` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 149 | `client/public/assets/items/kinh_thai_hoa_bo_nguyen.png` | Icon kinh quyển `kinh_thai_hoa_bo_nguyen` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 150 | `client/public/assets/items/kinh_toa_long_cam_na.png` | Icon kinh quyển `kinh_toa_long_cam_na` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 151 | `client/public/assets/items/kinh_bach_cot_hong_nhan.png` | Icon kinh quyển `kinh_bach_cot_hong_nhan` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 152 | `client/public/assets/items/kinh_huyet_trao_pha_mach.png` | Icon kinh quyển `kinh_huyet_trao_pha_mach` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 153 | `client/public/assets/items/kinh_niep_hon_doat_phat.png` | Icon kinh quyển `kinh_niep_hon_doat_phat` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 154 | `client/public/assets/items/kinh_am_phong_quyen_hon.png` | Icon kinh quyển `kinh_am_phong_quyen_hon` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 155 | `client/public/assets/items/kinh_huyet_mang_pha_giap.png` | Icon kinh quyển `kinh_huyet_mang_pha_giap` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 156 | `client/public/assets/items/kinh_ma_trao_phe_huyet.png` | Icon kinh quyển `kinh_ma_trao_phe_huyet` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 157 | `client/public/assets/items/kinh_phat_hoa_hang_ma.png` | Icon kinh quyển `kinh_phat_hoa_hang_ma` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 158 | `client/public/assets/items/kinh_quy_anh_me_tung.png` | Icon kinh quyển `kinh_quy_anh_me_tung` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 159 | `client/public/assets/items/kinh_quy_hoa_phe_hon.png` | Icon kinh quyển `kinh_quy_hoa_phe_hon` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 160 | `client/public/assets/items/kinh_bang_phach_than_cham.png` | Icon kinh quyển `kinh_bang_phach_than_cham` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 161 | `client/public/assets/items/kinh_giao_can_cung.png` | Icon kinh quyển `kinh_giao_can_cung` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 162 | `client/public/assets/items/kinh_han_suong_toa.png` | Icon kinh quyển `kinh_han_suong_toa` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 163 | `client/public/assets/items/kinh_loi_am_an.png` | Icon kinh quyển `kinh_loi_am_an` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
| 164 | `client/public/assets/items/kinh_tu_dien_thoa.png` | Icon kinh quyển `kinh_tu_dien_thoa` | Do nhóm Tiên Giới sinh bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** | ✓ Hợp lệ |
<!-- AUTO-RA-SOAT-ITEM-ROWS:END -->

> Hàng 2-3 (atlas) chứa toàn bộ khung nhân vật, quái, NPC, vật phẩm (xem 2b). Hàng 4-19 và các hàng từ 28 trở đi chứa biểu tượng vật phẩm và kinh quyển trong thế giới: 69 khớp 69 mặt hàng trong `ITEMS` của `shared/` (gồm 3 đan hộ đạo hàng 87-89, #763, vẽ SAU dữ liệu của Dev D, và 9 phù hàng 90-98, #817, vẽ SAU dữ liệu của Dev G) (mọi vật phẩm đều có icon riêng, không món nào dùng ảnh thay thế) + 12 icon Hàn Vân Lĩnh (hàng 69-80, M7.5 #506) + 6 icon kinh quyển đợt 2 (hàng 81-86, #654, A) vẽ TRƯỚC vật phẩm trong `shared/` + 6 icon kinh quyển Kim / Thổ (hàng 99-104, CT6 lát 1 #1051, A) + 6 icon chiêu dạng mới (hàng 105-110, CT9 lát 1 #1054, A) + 7 icon kinh quyển hệ Mộc/Thủy (hàng 111-117, CT7 #1052, E) + 6 icon kinh quyển Hỏa / Băng / Âm / Lôi / Phong (hàng 118-123, CT8 lát 1, A) và 5 icon kinh quyển Nguyên Anh (hàng 124-128, CT8 lát 2, A) và 5 icon kinh quyển vô sắc (hàng 129-133, CT8 lát 3, A) và 4 icon kinh quyển Kim / Thổ (hàng 134-137, CT17 lát 1, G) và 2 icon kinh quyển Mộc (hàng 138-139, CT17 lát 2, G) và 2 icon kinh quyển Lôi (hàng 140-141, CT15 đợt 2, #1185, D; B vẽ SAU dữ liệu) vẽ TRƯỚC dữ liệu (id chưa có trong `ITEMS` thì vô hại; A / Dev D / Dev E thêm dữ liệu sau).
>
> **Ấn kinh quyển (#1303, B):** quyển KHÔNG có dấu vẽ tay trong bảng `BOOKS` (`gen-assets.mjs`) tự có "ấn" 7 x 7 đối xứng sinh tất định từ id (`client/scripts/book-marks.mjs`; luật chống chữ Hán: không nét liền dài từ 4 điểm trở lên), nên quyển mới của G / D / E không phải vẽ tay. `client/scripts/book-marks.test.ts` giữ bất biến cho mọi quyển học được: không hai icon giống hệt, không cùng (bìa, viền, dấu), và hai quyển bìa + viền gần nhau phải khác nhau từ 10 điểm ảnh ở vùng dấu (trùng thì thêm `salt` ở phần tử thứ tư của mục `BOOKS`). Số khung atlas không đổi (mỗi quyển đã có khung).

<!-- AUTO-RA-SOAT-ATLAS-HEADER:START -->### 2b. Khung atlas (tệp 2-3) sau NPC `tran_uy` (D7 #755, E): 525 khung, toàn bộ sinh bằng `gen-assets.mjs`<!-- AUTO-RA-SOAT-ATLAS-HEADER:END -->

| Nhóm khung | Số khung | Nội dung |
|---|:---:|---|
| `me`, `other` | 41 + 41 | Nhân vật (mình / người khác): 4 hướng x đứng / đi / chém, tư thế bị đánh `-hurt-<hướng>`, gục `-die-0..3` |
| `robe-*` | 123 | Ba bộ pháp bào `tho_nhung_bao`, `hac_ho_bao`, `xich_lan_bao` (3 x 41 khung như trên) |
| `mon-*` | 140 | **9 yêu thú x 10 khung** (đứng, đi 0-1, đánh `atk-0..1`, bị đánh `hurt`, gục `die-0..3`): `tho`, `lang`, `ho`, `mang` và **M6 #407** `suong_ho`, `thach_quy`, `doc_thiem`, `hac_giao`, `yeu_vuong` và **M7.5b #506** (B, vẽ TRƯỚC khi loài vào `shared/`) `han_lang` (sói băng), `phong_nha` (chim nanh thép), `cot_tuong` (voi xương), `doc_tuoc` (sẻ độc), `thien_han_vuong` (trùm sư tử băng): **14 loài x 10 khung** (không còn "9 yêu thú x 10") |
| `npc-*` | 15 | `truong_tran`, `duoc_su`, `tho_ren`, `cao_thi`, `lai_buon`, `thu_mon` và **M6** `tram_truong`, `lai_buon_suong`, `tho_ren_suong` và **#763** `lao_dan` (Mộc Diên, lão đan sư ôm lò đan) và **#817** `lao_phu` (Tô Linh Ấn, lão phù sư giơ dải phù) và **D7 #755** `tran_uy` (trạm úy Hắc Phong, cầm thương) |
<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:START -->| `item-*` | 153 | Biểu tượng vật phẩm trong thế giới (rơi trên đất), một khung cho mỗi icon ở bảng trên |<!-- AUTO-RA-SOAT-ATLAS-ITEM-ROW:END -->
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

- Số tệp ảnh AI trong `client/public/assets/ai/`: **6 tệp** (`login_bg.webp`, nền màn đăng nhập, ảnh AI đầu tiên của game; và 5 thẻ minh hoạ bản đồ của lô 1: `the_lac_ha`, `the_hac_phong`, `the_linh_hu`, `the_am_suong`, `the_han_van`; đường kiểm tự động có từ TRƯỚC khi ảnh đầu tiên vào).
- **Gói tải theo nhu cầu `art:trum`** (`client/public/packs/art-trum/`, KHÔNG đếm vào con số trên): **4 tệp** thẻ trùm của lô 2 (`the_xich_mang`, `the_hac_giao`, `the_thien_han_vuong`, `the_yeu_vuong`, 384x384, <= 30 KB mỗi ảnh), cùng luật nguồn như `assets/ai` (`check:credits` `aiAssetDirs`); bảng dưới liệt kê chung.
- Mỗi ảnh vào đây phải có: tệp nguồn `docs/art/nguon/<tên>.json` (đủ trường mục 9.3 của `docs/KE_HOACH_DO_HOA_AI.md`, `finalSha256` khớp), một dòng ở `CREDITS.md` mục 7, không siêu dữ liệu (PNG không `tEXt` / `iTXt` / `zTXt` / `eXIf`, WebP không `EXIF` / `XMP `), chỉ model SDXL base và không LoRA, người duyệt xác nhận không chữ và không giống game khác, dung lượng <= trần `static.aiAssets` (mỗi ảnh 150 KB, tổng 300 KB).
- Bảng ảnh (thêm hàng khi có ảnh; `credits.test.ts` đếm số tệp thật và so với con số "N tệp" ở trên):

| Ảnh | Tệp nguồn | Ngày | Người duyệt |
|---|---|---|---|
| `client/public/assets/ai/login_bg.webp` | `docs/art/nguon/login_bg.json` | 2026-11-17 (sinh 2026-11-15) | Dev B (xem cả ảnh và bốn góc phóng 200 %: không chữ / ký tự giả, không người, không logo) |
| `client/public/assets/ai/the_lac_ha.webp` | `docs/art/nguon/the_lac_ha.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 15 ảnh thô của lô 1, ảnh cuối ở cỡ thật và bốn góc phóng 200 %: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/assets/ai/the_hac_phong.webp` | `docs/art/nguon/the_hac_phong.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 15 ảnh thô của lô 1, ảnh cuối ở cỡ thật và bốn góc phóng 200 %: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/assets/ai/the_linh_hu.webp` | `docs/art/nguon/the_linh_hu.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 15 ảnh thô của lô 1, ảnh cuối ở cỡ thật và bốn góc phóng 200 %: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/assets/ai/the_am_suong.webp` | `docs/art/nguon/the_am_suong.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 15 ảnh thô của lô 1, ảnh cuối ở cỡ thật và bốn góc phóng 200 %: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/assets/ai/the_han_van.webp` | `docs/art/nguon/the_han_van.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 15 ảnh thô của lô 1, ảnh cuối ở cỡ thật và bốn góc phóng 200 %: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/packs/art-trum/the_xich_mang.webp` | `docs/art/nguon/the_xich_mang.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 16 ảnh thô của lô 2, hai ứng viên cuối ở 640 px, ảnh cuối ở cỡ thật và thu nhỏ 64 px: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/packs/art-trum/the_hac_giao.webp` | `docs/art/nguon/the_hac_giao.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 16 ảnh thô của lô 2, hai ứng viên cuối ở 640 px, ảnh cuối ở cỡ thật và thu nhỏ 64 px: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/packs/art-trum/the_thien_han_vuong.webp` | `docs/art/nguon/the_thien_han_vuong.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 16 ảnh thô của lô 2, hai ứng viên cuối ở 640 px, ảnh cuối ở cỡ thật và thu nhỏ 64 px: không chữ / ký tự giả / chữ ký, không người, không logo) |
| `client/public/packs/art-trum/the_yeu_vuong.webp` | `docs/art/nguon/the_yeu_vuong.json` | 2026-11-17 (sinh 2026-11-17) | Dev B (xem cả 16 ảnh thô của lô 2, hai ứng viên cuối ở 640 px, ảnh cuối ở cỡ thật và thu nhỏ 64 px: không chữ / ký tự giả / chữ ký, không người, không logo) |

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
<!-- AUTO-RA-SOAT-SUMMARY-ROW:START -->| Tệp tĩnh quét (`client/public/assets`, `icons`, `fonts`) | **172 tệp** (3 trong `assets/` + 6 ảnh AI `assets/ai/` (`login_bg.webp` + 5 thẻ bản đồ) + 153 icon + 5 icon PWA + 5 phông), **0 tệp thiếu nguồn / tác giả / giấy phép** |<!-- AUTO-RA-SOAT-SUMMARY-ROW:END -->
| Tài sản bên thứ ba có SHA-256 khớp `CREDITS.md` mục 6 | 5 / 5 (4 tệp `woff2` + `OFL.txt`) |
| Giấy phép | CC0 1.0 (Tiên Giới tự tạo) cho 39 tệp; SIL OFL 1.1 cho 5 tệp phông (Noto Serif); không có CC-BY mới |
| Mô-đun đồ hoạ / âm thanh vẽ bằng mã | 7 dòng (mô-đun hoặc nhóm mô-đun) ở 2c, không có tài sản ngoài |
| Tên gọi mới (M6) | xem mục 3: không phát hiện tên lấy nguyên từ game khác (rà bằng mắt, không tra nhãn hiệu) |
| `client/src/credits.test.ts` | 12 ca xanh: 9 ca gốc (gồm đột biến: tệp mới chưa khai báo, khớp chuỗi con, thiếu / sai SHA-256) + 3 ca canh tài liệu (số tệp ghi ở `CREDITS.md` mục 4 và tiêu đề mục 2 khớp số tệp thật; mọi icon vật phẩm có hàng ở bảng mục 2): thêm tài sản mà quên cập nhật tài liệu thì đỏ |

**Việc còn mở (không chặn M6):** (1) rà soát nhãn hiệu thật sự cho tên gọi trước khi phát hành rộng (cần người, mục 3); (2) `docs/screenshots/` và `docs/screenshots/m5-baseline/` không nằm trong phạm vi quét của `check:credits` (không phát hành, mục 2d): nếu sau này ảnh chụp được dùng ngoài tài liệu (cửa hàng ứng dụng, trang giới thiệu) thì cần rà lại.

