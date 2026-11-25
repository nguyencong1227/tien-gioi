# Nguồn tài nguyên (Credits & Licenses)

Tiên Giới chỉ sử dụng các bộ tài nguyên (hình ảnh, hiệu ứng, âm thanh) tự tạo của dự án hoặc có giấy phép mở (**CC0 1.0 Public Domain** / **CC-BY 3.0 / 4.0** / **SIL OFL 1.1**), cho phép sử dụng và chỉnh sửa trong trò chơi công khai. Toàn bộ thế giới, địa danh (Lạc Hà Trấn, Hắc Phong Lâm, Vân Mộng Sơn), hệ thống cảnh giới và nhân vật là sáng tạo riêng của Tiên Giới.

---

## 1. Tài nguyên đang đóng gói trong repo (`client/public/` & `client/src/`)

Tính đến 14/11/2026, toàn bộ các file hình ảnh pixel-art, biểu tượng và âm thanh hiện tại trong repo được tạo riêng cho **Tiên Giới** và phát hành theo giấy phép **CC0 1.0 Public Domain** (câu này phải sửa khi tệp `vktt/` hoặc ảnh AI đầu tiên vào repo, theo `AGENTS.md` mục Asset):

| Tài nguyên | File trong repo | Tác giả & Công cụ tạo | Giấy phép |
|---|---|---|---|
| **Tileset bản đồ** (8 ô địa hình `32×32` px: `Grass`, `TallGrass`, `Dirt`, `Water`, `Tree`, `Rock`, `Stone`, `Sand`) | `client/public/assets/tileset.png` | **Nhóm Tiên Giới (Dev B)** — sinh và đóng gói bằng script `client/scripts/gen-assets.mjs` (`npm run assets -w client`) | **CC0 1.0** (Do dự án tạo) |
| **Texture Atlas nhân vật, NPC, yêu thú & hiệu ứng** (`me`, `other` và 3 bộ pháp bào `robe-tho_nhung_bao`, `robe-hac_ho_bao`, `robe-xich_lan_bao` 4 hướng `idle`/`walk`/`slash`; tư thế bị đánh `<bộ>-hurt-<hướng>` và gục `<bộ>-die-0..3` (M5.2, suy từ khung đứng bằng biến đổi + màu trong script); 14 yêu thú `mon-tho`, `mon-lang`, `mon-ho`, `mon-mang` và (M6 #407) `mon-suong_ho`, `mon-thach_quy`, `mon-doc_thiem`, `mon-hac_giao`, `mon-yeu_vuong` và (M7.5b #506) `mon-han_lang`, `mon-phong_nha`, `mon-cot_tuong`, `mon-doc_tuoc`, `mon-thien_han_vuong` kèm tư thế đánh / bị đánh / gục `mon-<id>-atk-0..1`, `mon-<id>-hurt`, `mon-<id>-die-0..3` (M5.2, suy từ khung đi bằng biến đổi + màu trong script); 12 NPC `npc-truong_tran`, `npc-duoc_su`, `npc-tho_ren`, `npc-cao_thi` và (M6 #407) `npc-lai_buon`, `npc-thu_mon`, `npc-tram_truong`, `npc-lai_buon_suong`, `npc-tho_ren_suong` và (M7.5 #506) `npc-tram_truong_han`, `npc-lai_buon_han`, `npc-tho_ren_han`; `swordbeam`, `dot`, `item-*`) | `client/public/assets/atlas.png`, `client/public/assets/atlas.json` | **Nhóm Tiên Giới (Dev B)** — vẽ pixel-art và đóng gói Phaser 3 JSON Atlas bằng `client/scripts/gen-assets.mjs` | **CC0 1.0** (Do dự án tạo) |
| **Ảnh biểu tượng vật phẩm & trang bị DOM** (<!-- AUTO-CREDITS-ITEM-COUNT:START -->156 tệp<!-- AUTO-CREDITS-ITEM-COUNT:END -->, 15 tệp Kim Đan M6 #407, 14 tệp ba ô riêng, 12 tệp kinh quyển M7.4 #505 rồi 12 tệp Hàn Vân Lĩnh M7.5 #506 (B, vẽ TRƯỚC vật phẩm trong `shared/`) rồi 6 tệp kinh quyển đợt 2 Nguyên Anh #654 (A, cũng vẽ TRƯỚC vật phẩm trong `shared/`) rồi 3 tệp đan hộ đạo nghề nhỏ lát 1 #763 (B, vẽ SAU dữ liệu của Dev D) rồi 9 tệp phù Bàn phù nghề nhỏ lát 2 #817 (B, vẽ SAU dữ liệu của Dev G; hệ đọc bằng hình + màu dải, bậc bằng số chấm vàng) rồi 6 tệp kinh quyển Kim / Thổ CT6 lát 1 #1051 (A, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 6 tệp kinh quyển chiêu dạng mới CT9 lát 1 #1054 (A, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 7 tệp kinh quyển hệ Mộc / Thủy CT7 #1052 (E, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 6 tệp kinh quyển Hỏa / Băng / Âm / Lôi / Phong CT8 lát 1 (A, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 5 tệp kinh quyển Nguyên Anh CT8 lát 2 (A, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 5 tệp kinh quyển vô sắc CT8 lát 3 (A, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 4 tệp kinh quyển Kim / Thổ CT17 lát 1 (G, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 2 tệp kinh quyển Mộc CT17 lát 2 (G, vẽ TRƯỚC dữ liệu chiêu trong `shared/`) rồi 2 tệp kinh quyển Lôi CT15 đợt 2 (#1185, D; B vẽ SAU dữ liệu chiêu theo lời nhờ của D) rồi 5 tệp kinh quyển Âm CT16 đợt 2 lô 1 (#1186, E; B vẽ TRƯỚC dữ liệu chiêu trong `shared/`) ở cuối danh sách: <!-- AUTO-CREDITS-ITEMS:START -->`hoi_huyet_dan.png`, `hoi_linh_dan.png`, `tu_khi_dan.png`, `long_tho.png`, `nanh_soi.png`, `da_ho.png`, `vay_mang.png`, `lang_nha_kiem.png`, `tho_nhung_bao.png`, `lang_nha_phu.png`, `hac_ho_kiem.png`, `hac_ho_bao.png`, `ho_hon_phu.png`, `xich_mang_kiem.png`, `xich_lan_bao.png`, `mang_dam_phu.png`, `suong_mao.png`, `quy_giap.png`, `doc_nang.png`, `giao_lan.png`, `dai_hoi_huyet_dan.png`, `dai_hoi_linh_dan.png`, `suong_vu_kiem.png`, `suong_ho_bao.png`, `ho_tam_phu.png`, `huyen_quy_kiem.png`, `quy_giap_bao.png`, `quy_tuc_phu.png`, `hac_giao_kiem.png`, `giao_lan_bao.png`, `giao_long_phu.png`, `ho_bo_ngoa.png`, `mang_hanh_ngoa.png`, `suong_van_ngoa.png`, `giao_anh_ngoa.png`, `tho_nguyet_boi.png`, `mang_tinh_boi.png`, `suong_linh_boi.png`, `giao_chau_boi.png`, `ho_than_an.png`, `hap_linh_chau.png`, `xich_diem_an.png`, `han_bang_an.png`, `dinh_tam_chung.png`, `phong_hanh_boi.png`, `kinh_hoa_van_kiem.png`, `kinh_bon_thach_quyen.png`, `kinh_ung_trao.png`, `kinh_trong_nhac_tram.png`, `kinh_huyen_bang_chi.png`, `kinh_kim_chung_trao.png`, `kinh_bich_thuy_hoi_xuan.png`, `kinh_phieu_phong_bo.png`, `kinh_thanh_tung_phi_cham.png`, `kinh_lac_tuyet_phan_phi.png`, `kinh_cuu_cung_khon_sat.png`, `kinh_me_tung_bo.png`, `han_lang_mao.png`, `phong_nha_vu.png`, `tuong_cot.png`, `doc_tuoc_nang.png`, `thien_han_chau.png`, `han_vu_kiem.png`, `han_lang_bao.png`, `phong_nha_phu.png`, `tuyet_hanh_ngoa.png`, `han_tinh_boi.png`, `thuong_hoi_huyet_dan.png`, `thuong_hoi_linh_dan.png`, `kinh_han_quang_tien.png`, `kinh_bach_kim_trao.png`, `kinh_van_thach_tran.png`, `kinh_bang_hoa_loan.png`, `kinh_liet_hoa_kiem.png`, `kinh_van_hanh_bo.png`, `dot_pha_dan.png`, `kinh_chi_dan.png`, `duong_anh_dan.png`, `phu_hoa_dan.png`, `phu_hoa_cuonghuyet.png`, `phu_kim_phicham.png`, `phu_kim_toagia.png`, `phu_hoa_lieutiem.png`, `phu_loi_loino.png`, `phu_hoa_tammoi.png`, `phu_moc_kimlan.png`, `phu_tho_tocphong.png`, `kinh_thanh_van_kiem_khi.png`, `kinh_ban_thach_ho_the.png`, `kinh_thu_thuy_kiem_anh.png`, `kinh_liet_dia_nhat_quyen.png`, `kinh_phan_nhac_tram.png`, `kinh_van_kiem_quy_tong.png`, `kinh_doc_dang_phuc.png`, `kinh_phi_kiem_tam_lien.png`, `kinh_liet_diem_tran.png`, `kinh_loi_lien_chau.png`, `kinh_hon_phien_tuong.png`, `kinh_pha_son_nhat_kich.png`, `kinh_hu_thuy_chuong.png`, `kinh_trien_xa_thu.png`, `kinh_hac_sa_doc_chuong.png`, `kinh_thi_doc_am_chuong.png`, `kinh_thiem_to_cong.png`, `kinh_doan_truong_chi_phap.png`, `kinh_kho_moc_phung_xuan_quyet.png`, `kinh_liet_diem_chuong.png`, `kinh_xich_tuoc_phu.png`, `kinh_han_bang_nhat_chuong.png`, `kinh_minh_anh_phuc_chuong.png`, `kinh_loi_dinh_nhat_miet.png`, `kinh_hoi_phong_lien_chuong.png`, `kinh_thien_la_loi_cam.png`, `kinh_chuong_tam_loi_bao.png`, `kinh_bach_thu_khieu_phong.png`, `kinh_minh_vu_lac_hon.png`, `kinh_phuong_minh_cau_hoang.png`, `kinh_huyet_anh_xuyen_tam.png`, `kinh_su_tu_hong.png`, `kinh_cam_long_khau.png`, `kinh_hoa_huyet_phe_nguyen.png`, `kinh_long_tuong_ho_the.png`, `kinh_kim_thoa_xuyen_tam.png`, `kinh_thuc_giap_phi_tan.png`, `kinh_thiet_sa_chuong.png`, `kinh_chuong_vu_phong_lam.png`, `kinh_me_hon_huong_quyet.png`, `kinh_man_da_hoa_kinh.png`, `kinh_loi_hoa_pha_ta_chuong.png`, `kinh_chan_hon_loi_phap.png`, `kinh_thuc_hon_nhat_chi.png`, `kinh_tich_da_phan_anh.png`, `kinh_kho_mach_dan_luu.png`, `kinh_thuc_phat_am_trao.png`, `kinh_huyet_co_bi_kinh.png`, `kinh_huyet_ti_phuoc_than.png`, `kinh_no_dao_bai_khong.png`, `kinh_thai_hoa_bo_nguyen.png`, `kinh_toa_long_cam_na.png`, `kinh_bach_cot_hong_nhan.png`, `kinh_huyet_trao_pha_mach.png`, `kinh_niep_hon_doat_phat.png`, `kinh_am_phong_quyen_hon.png`, `kinh_huyet_mang_pha_giap.png`, `kinh_ma_trao_phe_huyet.png`, `kinh_phat_hoa_hang_ma.png`, `kinh_quy_anh_me_tung.png`, `kinh_quy_hoa_phe_hon.png`, `kinh_bang_phach_than_cham.png`, `kinh_giao_can_cung.png`, `kinh_han_suong_toa.png`, `kinh_loi_am_an.png`, `kinh_tu_dien_thoa.png`, `kinh_chu_canh_dao_hong.png`, `kinh_hoa_duoc_no.png`, `kinh_xich_viem.png`<!-- AUTO-CREDITS-ITEMS:END -->) | `client/public/assets/items/*.png` | **Nhóm Tiên Giới (Dev A, Dev B)** — sinh từ `client/scripts/gen-assets.mjs` (ấn riêng của kinh quyển sinh tất định từ id bằng `client/scripts/book-marks.mjs`, #1303, vẽ bằng mã, không tài sản ngoài) | **CC0 1.0** (Do dự án tạo) |
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

### 2b. Tệp DẪN XUẤT từ Ninja Adventure (CC0) trong gói bản đồ (QUYET_DINH_M3 mục 67.1, issue #1330)

Bốn ảnh tileset của lớp hình bản đồ do nhóm Tiên Giới (Dev B) **sinh bằng mã** `client/scripts/art/dung-tileset-world.py` (tất định: cùng gói gốc + cùng script cho cùng từng byte; test đối chiếu) từ ba tệp của **Ninja Adventure Asset Pack** (Pixel-boy & AAA, **CC0 1.0**): `content/map/tileset_floor.png` (cỏ / đất / cát / băng, đổi màu theo vùng), `content/map/tileset_interior_floor.png` (hoạ tiết đá cuội) và `content/map/tileset_village_abandoned.png` (đáy cây, tảng đá, bụi lá). Tán cây vẽ bằng mã. Tệp dẫn xuất cũng là **CC0 1.0**; không dùng tài nguyên của gói riêng nào (nguồn 4 của AGENTS.md). Tệp nằm trong gói tải `map:<id>` (`client/public/packs/map-<id>/`, tải theo nhu cầu, thiếu thì client vẽ cách cũ).

| Tệp | Nội dung | SHA-256 |
|---|---|---|
| `client/public/packs/map-lac_ha/tileset_world.png` | Tileset lớp hình bản đồ Lạc Hà (396x504, đùn mép): cát / đất / nước / đá lát + cây nguyên khối 32 x 32 (mục 73) + ô thân / tán cũ, đá, bụi; bảng màu theo vùng | `3c2c272d7bfc1c8c498c2b028d5bc2cb6679994eb6677ea6f0b602c6d9178acf` |
| `client/public/packs/map-hac_phong/tileset_world.png` | Tileset lớp hình bản đồ Hắc Phong (396x504, đùn mép): cát / đất / nước / đá lát + cây nguyên khối 32 x 32 (mục 73) + ô thân / tán cũ, đá, bụi; bảng màu theo vùng | `402d57d3d6ae62c81130c0728c1dcb157d254f04c6c71de98812824c649a0a64` |
| `client/public/packs/map-am_suong/tileset_world.png` | Tileset lớp hình bản đồ Âm Sương (396x504, đùn mép): cát / đất / nước / đá lát + cây nguyên khối 32 x 32 (mục 73) + ô thân / tán cũ, đá, bụi; bảng màu theo vùng | `ba4f437130d7e77c5b65c1528e8d2441ddeea417e285610106e5d4fd4203aa56` |
| `client/public/packs/map-han_van/tileset_world.png` | Tileset lớp hình bản đồ Hàn Vân (396x504, đùn mép): cát / đất / nước / đá lát + cây nguyên khối 32 x 32 (mục 73) + ô thân / tán cũ, đá, bụi; bảng màu theo vùng | `57d0265be89d267acc4f4d520ecc03299eb9a7a149aa417119f59b7e8672a9ed` |

---

## 3. Tuyên bố tuân thủ bản quyền

1. **Không sử dụng tài nguyên độc quyền hoặc thương mại chưa cấp phép.**
2. **Tuân thủ ghi công (Attribution) đối với CC-BY 3.0 / 4.0:** Mọi tài nguyên CC-BY khi đưa vào `client/public/assets/` đều được ghi rõ tên tác giả, tên bộ tài nguyên, liên kết gốc và loại giấy phép trong file `CREDITS.md` này.
3. **Quy tắc định danh & cốt truyện:** Toàn bộ tên NPC, môn phái, địa danh, vật phẩm, kỹ năng đều là bản quyền sáng tạo của Tiên Giới, không sao chép từ bất kỳ thương hiệu trò chơi nào khác.

---

## 4. Kết quả rà soát tài sản (M4-sớm, Issue #257)

<!-- AUTO-CREDITS-TOTAL-STATIC-HEADING:START -->- **Tổng số tệp tài nguyên tĩnh quét qua script tự động (`npm run check:credits`):** 175 tệp<!-- AUTO-CREDITS-TOTAL-STATIC-HEADING:END --> (cập nhật 5 kinh quyển Âm CT16 đợt 2 lô 1 (#1186, E; B vẽ), 23/11/2026; 149 sau 2 kinh quyển Lôi CT15 đợt 2 (#1185, D), 23/11/2026; 147 sau 2 kinh quyển Mộc CT17 lát 2 (CT17 lát 2, G), 22/11/2026; 145 sau 4 kinh quyển Kim / Thổ CT17 lát 1 (CT17 lát 1, G), 22/11/2026; 141 sau 5 kinh quyển vô sắc CT8 lát 3, 18/11/2026; 136 sau 5 kinh quyển Nguyên Anh CT8 lát 2, 18/11/2026; 131 sau 6 kinh quyển Hỏa / Băng / Âm / Lôi / Phong CT8 lát 1, 18/11/2026; 125 sau 7 kinh quyển hệ Mộc / Thủy CT7 #1052, 18/11/2026; 118 sau 6 kinh quyển chiêu dạng mới CT9 lát 1 #1054; 112 sau 6 kinh quyển Kim / Thổ CT6 lát 1 #1051; cập nhật 6 kinh quyển Kim / Thổ CT6 lát 1 #1051, 18/11/2026; 106 sau chín phù Bàn phù #817, 17/11/2026; 97 sau 5 thẻ minh hoạ bản đồ lô 1 #513, 17/11/2026; 92 sau ảnh AI ĐẦU TIÊN `login_bg.webp` #513, 17/11/2026; 91 sau đan hộ đạo #763, 16/11/2026; 88 sau kinh quyển đợt 2 #654, 15/11/2026; 82 sau M7.5 Hàn Vân Lĩnh; 70 sau kinh quyển M7.4, 58 sau đồ ba ô riêng, lúc M6 là 44 tệp, lúc M4-sớm là 24 tệp, chi tiết ở `docs/RA_SOAT_TAI_SAN.md`).
<!-- AUTO-CREDITS-ASSETS-DIR:START -->  - `client/public/assets/`: 165 tệp (1 tileset, 2 atlas, 156 biểu tượng vật phẩm, 6 ảnh AI ở `assets/ai/`: `login_bg.webp` và 5 thẻ bản đồ, mục 7).<!-- AUTO-CREDITS-ASSETS-DIR:END -->
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

**Nội dung chữ / dữ liệu của Vạn Kiếp Tu Tiên** (tác giả Hải Quân · Bắc Team, dùng với sự cho phép — xem `docs/NGUON_NOI_DUNG.md`): ba đan hộ đạo `dot_pha_dan` / `kinh_chi_dan` / `duong_anh_dan` (`shared/src/items.ts`, #763) — CHỈ Dưỡng Anh Đan giữ tên nguồn (`item.duong_anh_dan`); Đột Phá Đan (từ `item.truc_co_dan` "Trúc Cơ Đan") + Kinh Chỉ Đan (từ `item.ket_kim_dan` "Kết Kim Đan") là viết lại tên theo thế giới Tiên Giới; lấy ý "tăng % đột phá" từ `/content/items/dan_duoc.yaml`, KHÔNG chữ Hán, cơ chế `dao_ho` là của Tiên Giới (nguồn có `tam_ma` KHÔNG lấy); ratio nguồn 0,15/0,12/0,09 → Dev A chốt 0,08/0,10/0,12; chi tiết ở dòng `du_lieu` mục 3 `docs/NGUON_NOI_DUNG.md`.

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
| `client/public/assets/ai/login_bg.webp` | Nền màn đăng nhập: đỉnh núi sương sớm, tháp gỗ trên vách đá nhìn ra biển mây (1024x1024, WebP sạch 72 KB; ảnh thô số 4 của lô pilot, seed 2026111504, hậu kỳ chỉ mã hoá lại bằng `client/scripts/art/hau-ky-webp.py`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-15 | `docs/art/nguon/login_bg.json` |
| `client/public/assets/ai/the_lac_ha.webp` | Thẻ bản đồ Lạc Hà Trấn: thị trấn nhà gỗ bên sông dưới núi, hoa đào hồng, ánh ấm (624x416, WebP sạch 33 KB; ảnh thô số 1 của lô 1, seed 2026111711, hậu kỳ cắt + đổi cỡ bằng `client/scripts/art/hau-ky-webp.py`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_lac_ha.json` |
| `client/public/assets/ai/the_hac_phong.webp` | Thẻ bản đồ Hắc Phong Cốc: hẻm núi xám, tháp canh đổ nát, cây khô, trời u ám (624x416, WebP sạch 30 KB; ảnh thô số 2 của lô 1, seed 2026111722, cùng hậu kỳ); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_hac_phong.json` |
| `client/public/assets/ai/the_linh_hu.webp` | Thẻ bản đồ Linh Hư Bí Cảnh: hang ngọc lam, nấm phát sáng, hồ nước lam ngọc (624x416, WebP sạch 34 KB; ảnh thô số 3 của lô 1, seed 2026111733, cùng hậu kỳ); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_linh_hu.json` |
| `client/public/assets/ai/the_am_suong.webp` | Thẻ bản đồ Âm Sương Trạch: đầm lầy sương rêu xanh, cây chết, nước đen (624x416, WebP sạch 27 KB; ảnh thô số 3 của lô 1, seed 2026111743, cùng hậu kỳ); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_am_suong.json` |
| `client/public/assets/ai/the_han_van.webp` | Thẻ bản đồ Hàn Vân Lĩnh: băng nguyên, đỉnh băng nhọn, hồ đóng băng, ánh bạc lạnh (624x416, WebP sạch 23 KB; ảnh thô số 1 của lô 1, seed 2026111751, cùng hậu kỳ); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_han_van.json` |
| `client/public/packs/art-trum/the_xich_mang.webp` | Thẻ trùm Xích Mãng (`mang`): trăn đỏ thẫm cuộn trên đá rêu dưới cành hoa đào, núi hồng, ánh hổ phách (384x384, WebP sạch 26 KB; ảnh thô số 1 của lô 2, seed 2026111801, hậu kỳ cắt + đổi cỡ bằng `client/scripts/art/hau-ky-webp.py`; gói tải theo nhu cầu `art:trum`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_xich_mang.json` |
| `client/public/packs/art-trum/the_hac_giao.webp` | Thẻ trùm Hắc Giao (`hac_giao`): giao long đen vảy xanh rêu trên bãi đầm sương, cây chết hai bên (384x384, WebP sạch 20 KB; ảnh thô số 1 của lô 2, seed 2026111811, hậu kỳ cắt + đổi cỡ bằng `client/scripts/art/hau-ky-webp.py`; gói tải theo nhu cầu `art:trum`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_hac_giao.json` |
| `client/public/packs/art-trum/the_thien_han_vuong.webp` | Thẻ trùm Thiên Hàn Vương (`thien_han_vuong`): khối băng khổng lồ hình người trên hồ băng, gai băng, núi tuyết (384x384, WebP sạch 15 KB; ảnh thô số 1 của lô 2, seed 2026111821, hậu kỳ cắt + đổi cỡ bằng `client/scripts/art/hau-ky-webp.py`; gói tải theo nhu cầu `art:trum`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_thien_han_vuong.json` |
| `client/public/packs/art-trum/the_yeu_vuong.webp` | Thẻ trùm Linh Hư Yêu Vương (`yeu_vuong`): hươu đực lông lam ngọc, gạc lớn phát sáng trong hang ngọc lam (384x384, WebP sạch 21 KB; ảnh thô số 1 của lô 2, seed 2026111831, hậu kỳ cắt + đổi cỡ bằng `client/scripts/art/hau-ky-webp.py`; gói tải theo nhu cầu `art:trum`); đã xem 200 %: không chữ / ký tự giả / người | `sd_xl_base_1.0.safetensors` (SDXL base 1.0, không LoRA) | 2026-11-17 | `docs/art/nguon/the_yeu_vuong.json` |
