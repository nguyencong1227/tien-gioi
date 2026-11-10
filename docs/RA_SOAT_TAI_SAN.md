# Báo Cáo Rà Soát Tài Sản & Bản Quyền (M4 Mục 4.4)

> Thực hiện theo kế hoạch M4-sớm (Issue #257, `docs/PHAN_CONG_M4.md` mục 4.4).
> Người thực hiện: **Dev B (Client & Trải nghiệm)**.
> Ngày thực hiện: **11/11/2026**.

---

## 1. Mục tiêu và phạm vi rà soát

1. **Rà soát toàn diện mọi tệp tài nguyên tĩnh** trong `client/public/` (ảnh, tileset, atlas, icon, SVG) và tài nguyên nhúng runtime trong `client/src/` (audio tổng hợp Web Audio, textures vẽ bằng Canvas).
2. **Đối chiếu giấy phép với `CREDITS.md`**: Đảm bảo mọi tài nguyên đều có nguồn gốc rõ ràng, tác giả, đường dẫn tệp và chỉ thuộc giấy phép **CC0 1.0 Public Domain**, **CC-BY 3.0 / 4.0**, hoặc **SIL OFL 1.1**.
3. **Tuân thủ quy tắc sáng tạo độc quyền**: Tuyệt đối không sao chép hình ảnh, âm thanh, tên gọi, danh xưng hay cốt truyện của bất kỳ trò chơi nào khác.
4. **Xây dựng công cụ kiểm tra tự động**: Tự động phát hiện tệp tài nguyên mới chưa khai báo trong `CREDITS.md` (`npm run check:credits`).

---

## 2. Bảng thống kê chi tiết tài sản (24 tệp tĩnh + 2 mô-đun runtime)

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
| 27 | Google Fonts: `Noto Serif` | Phông chữ tiếng Việt cổ phong | Noto Project / Google Fonts qua CDN | **SIL OFL 1.1** | ✓ Hợp lệ |

---

## 3. Rà soát danh xưng và cốt truyện (Chống sao chép thương hiệu)

Đã rà soát toàn bộ danh xưng trong `shared/src/game.ts` và `shared/src/realms.ts`:
- **Địa danh**: Lạc Hà Trấn (`lac_ha`), Hắc Phong Lâm (`hac_phong_lam`), Vân Mộng Sơn (`van_mong_son`), Hoàng Tuyền / Vong Xuyên Hà / Tam Sinh Thạch.
- **Nhân vật NPC**: Trương Trấn Trưởng (`truong_tran`), Dược Sư Tôn Diệu (`duoc_su`), Thợ Rèn Thiết Ngưu (`tho_ren`), Cáo Thị Lạc Hà (`cao_thi`), Thủ Môn Bí Cảnh Lão Long (`thu_mon`), Chân Thần Khôi Phục (`chan_than`).
- **Yêu thú**: Thỏ Rừng (`tho_rung`), Sói Hoang (`soi_hoang`), Hắc Hổ (`hac_ho`), Xích Mãng (`xich_mang`), Yêu Vương Mãng Xà (`boss_mang_xa`).
- **Hệ thống tu vi**: 10 cảnh giới kinh điển văn học tiên hiệp phương Đông (`Phàm Nhân` -> `Độ Kiếp`).

> **Kết luận**: 100% tên gọi, địa danh, vật phẩm, kỹ năng đều là bản quyền sáng tạo của Tiên Giới hoặc thuật ngữ chung của dòng văn học tiên hiệp, **không sao chép từ bất kỳ tựa game nào khác**.

---

## 4. Công cụ kiểm soát bản quyền tự động (`npm run check:credits`)

- Script tự động: `client/scripts/check-credits.mjs`.
- Unit test: `client/src/credits.test.ts` (4 test cases, kiểm tra cả đột biến phát hiện tệp lậu).
- Thời gian chạy: `< 10 ms`.
- Chức năng: Khi có bất kỳ tệp mới nào được thêm vào `client/public/assets` hoặc `client/public/icons` mà chưa được khai báo đầy đủ trong `CREDITS.md`, lệnh `npm run check:credits` sẽ báo lỗi và ngăn chặn commit / build CI.
