# Sổ tay quái và bảng rơi đồ

> File này **SINH TỰ ĐỘNG** từ `server/src/balance/so-tay-quai.ts`, đọc dữ liệu thật ở `shared/` (`MONSTERS`, `DROP_TABLES`, `COIN_DROPS`, `ITEMS`, `MONSTER_REALM`, bản đồ).
> Sau khi sửa số liệu quái / rơi đồ / bản đồ, chạy `npm run so-tay-quai -w server` để cập nhật; test `server/src/balance/so-tay-quai-sync.test.ts` bắt tài liệu lệch bản sinh.
> Trạng thái: **31 quái**, **181 dòng rơi đồ**.

---

## Mục 1 — Quái theo bậc

> Sắp theo bậc (cảnh giới khai ở `MONSTER_REALM`), rồi cấp (`level`), rồi id. **Bậc** là bậc ĐÃ KHAI của bãi quái, KHÁC cấp suy từ `level` (vd Hắc Hổ cấp 7 = Luyện Khí tầng 7 nhưng thuộc bãi Trúc Cơ). **Tu vi** là tu vi gốc khi hạ cả con (chưa nhân hệ số). **Linh thạch** = xác suất rơi × khoảng số lượng.

| Quái | ID | Loại | Bậc | Cấp | Máu | Công | Tu vi | Linh thạch rơi | Xuất hiện ở |
|---|---|---|---|---:|---:|---:|---:|---|---|
| **Linh Thố** | `tho` | Thường | Luyện Khí | 0 | 40 | 4 | 4 | 60% × 1-3 | Lạc Hà Trấn |
| **Hôi Lang** | `lang` | Thường | Luyện Khí | 1 | 140 | 14 | 10 | 70% × 2-6 | Lạc Hà Trấn, Hắc Phong Cốc, Linh Hư Bí Cảnh |
| **Thanh Xà** | `thanh_xa` | Trùm | Luyện Khí | 7 | 2600 | 26 | 650 | 100% × 100-200 | — |
| **Hắc Hổ** | `ho` | Thường | Trúc Cơ | 7 | 600 | 42 | 35 | 80% × 8-20 | Lạc Hà Trấn, Hắc Phong Cốc, Linh Hư Bí Cảnh |
| **Xích Mãng** | `mang` | Trùm | Trúc Cơ | 12 | 4000 | 140 | 900 | 100% × 150-300 | Lạc Hà Trấn, Hắc Phong Cốc |
| **Rắn Con** | `ran_con` | Thường | Trúc Cơ | 12 | 320 | 42 | 0 | — | — |
| **Phân Thân Yêu Vương** | `phan_than_yeu_vuong` | Thường | Trúc Cơ | 14 | 500 | 40 | 0 | — | — |
| **Linh Hư Yêu Vương** | `yeu_vuong` | Trùm | Trúc Cơ | 14 | 100000 | 16 | 4500 | 100% × 300-500 | Linh Hư Bí Cảnh |
| **Sương Hồ** | `suong_ho` | Thường | Kim Đan | 13 | 2400 | 150 | 220 | 80% × 25-55 | Âm Sương Trạch |
| **Thạch Quy** | `thach_quy` | Thường | Kim Đan | 14 | 9750 | 70 | 430 | 80% × 50-110 | Âm Sương Trạch |
| **Độc Thiềm** | `doc_thiem` | Thường | Kim Đan | 15 | 3900 | 290 | 460 | 90% × 60-130 | Âm Sương Trạch |
| **Hắc Giao** | `hac_giao` | Trùm | Kim Đan | 18 | 75000 | 150 | 6400 | 100% × 300-490 | Âm Sương Trạch |
| **Hàn Lang** | `han_lang` | Thường | Nguyên Anh | 16 | 4350 | 264 | 1320 | 80% × 75-165 | Hàn Vân Lĩnh |
| **Cốt Tượng** | `cot_tuong` | Thường | Nguyên Anh | 17 | 17700 | 123 | 2580 | 80% × 200-400 | Hàn Vân Lĩnh |
| **Phong Nha** | `phong_nha` | Thường | Nguyên Anh | 17 | 4200 | 309 | 1520 | 80% × 85-185 | Hàn Vân Lĩnh |
| **Độc Tước** | `doc_tuoc` | Thường | Nguyên Anh | 18 | 7050 | 512 | 2760 | 90% × 230-430 | Hàn Vân Lĩnh |
| **Thiên Hàn Vương** | `thien_han_vuong` | Trùm | Nguyên Anh | 21 | 123000 | 240 | 38400 | 100% × 900-1470 | Hàn Vân Lĩnh |
| **Dã Lang** | `da_lang` | Thường | Hóa Thần | 19 | 6644 | 394 | 6732 | 80% × 250-540 | Lang Hoang |
| **Luyện Huyết Đệ Tử** | `luyen_huyet_de_tu` | Thường | Hóa Thần | 19 | 7035 | 418 | 7128 | 80% × 340-740 | Uy Vân Kinh |
| **Ngạ Quỷ** | `nga_quy` | Thường | Hóa Thần | 19 | 6644 | 394 | 6732 | 80% × 330-720 | Uy Vân Kinh |
| **Cương Thi** | `cuong_thi` | Thường | Hóa Thần | 20 | 30217 | 205 | 14706 | 80% × 550-900 | Uy Vân Kinh |
| **Hắc Phong Lang** | `hac_phong_lang` | Thường | Hóa Thần | 20 | 7170 | 516 | 8664 | 80% × 270-570 | Lang Hoang |
| **Huyết Ảnh** | `huyet_anh` | Thường | Hóa Thần | 20 | 7547 | 543 | 9120 | 80% × 380-780 | Uy Vân Kinh |
| **Thương Nguyệt Lang** | `thuong_nguyet_lang` | Thường | Hóa Thần | 20 | 31807 | 216 | 15480 | 80% × 600-900 | Lang Hoang |
| **Huyết Mị** | `huyet_mi` | Thường | Hóa Thần | 21 | 11402 | 809 | 14904 | 90% × 560-910 | Uy Vân Kinh |
| **Huyết Nguyệt Lang** | `huyet_nguyet_lang` | Thường | Hóa Thần | 21 | 8599 | 510 | 8712 | 80% × 280-580 | Lang Hoang |
| **Huyết Sát Chân Truyền** | `huyet_sat_chan_truyen` | Thường | Hóa Thần | 21 | 13936 | 989 | 18216 | 90% × 850-1300 | Uy Vân Kinh |
| **Ngân Nguyệt Lang** | `ngan_nguyet_lang` | Thường | Hóa Thần | 21 | 13936 | 989 | 18216 | 90% × 640-980 | Lang Hoang |
| **Xích Diễm Lang** | `xich_diem_lang` | Thường | Hóa Thần | 21 | 11402 | 809 | 14904 | 90% × 410-680 | Lang Hoang |
| **Lang Vương** | `lang_vuong` | Trùm | Hóa Thần | 22 | 99500 | 190 | 103680 | 100% × 1100-1800 | Lang Hoang |
| **Thiên Lang Vương** | `thien_lang_vuong` | Trùm | Hóa Thần | 24 | 221030 | 422 | 230400 | 100% × 2500-4000 | Lang Hoang |

## Mục 2 — Vật phẩm rơi từ quái nào

> Bảng đảo của `DROP_TABLES`: mỗi vật phẩm có trong bảng rơi một dòng (theo thứ tự `ITEMS`), liệt kê quái rơi kèm xác suất mỗi lần hạ.

| Vật phẩm | ID | Loại | Phẩm | Rơi từ |
|---|---|---|---|---|
| **Hồi Huyết Đan** | `hoi_huyet_dan` | Đan dược | Phàm phẩm | Linh Thố 8%, Hôi Lang 12%, Hắc Hổ 20%, Xích Mãng 100%, Thanh Xà 100%, Sương Hồ 10%, Linh Hư Yêu Vương 100% |
| **Hồi Linh Đan** | `hoi_linh_dan` | Đan dược | Phàm phẩm | Hôi Lang 8%, Hắc Hổ 15%, Thạch Quy 10% |
| **Tụ Khí Đan** | `tu_khi_dan` | Đan dược | Linh phẩm | Hắc Hổ 1%, Xích Mãng 30%, Thanh Xà 30%, Hắc Giao 50%, Thiên Hàn Vương 60%, Linh Hư Yêu Vương 80% |
| **Đại Hồi Huyết Đan** | `dai_hoi_huyet_dan` | Đan dược | Bảo phẩm | Sương Hồ 4%, Độc Thiềm 6%, Hắc Giao 100%, Hàn Lang 8% |
| **Đại Hồi Linh Đan** | `dai_hoi_linh_dan` | Đan dược | Bảo phẩm | Thạch Quy 4%, Độc Thiềm 6%, Phong Nha 8%, Cốt Tượng 10% |
| **Lông thỏ** | `long_tho` | Nguyên liệu | Phàm phẩm | Linh Thố 50% |
| **Nanh sói** | `nanh_soi` | Nguyên liệu | Phàm phẩm | Hôi Lang 45% |
| **Da hổ** | `da_ho` | Nguyên liệu | Linh phẩm | Hắc Hổ 50% |
| **Vảy mãng** | `vay_mang` | Nguyên liệu | Bảo phẩm | Xích Mãng 100%, Linh Hư Yêu Vương 100% |
| **Sương mao** | `suong_mao` | Nguyên liệu | Bảo phẩm | Sương Hồ 50% |
| **Quy giáp** | `quy_giap` | Nguyên liệu | Bảo phẩm | Thạch Quy 50% |
| **Độc nang** | `doc_nang` | Nguyên liệu | Tiên phẩm | Độc Thiềm 45%, Hắc Giao 80% |
| **Giao lân** | `giao_lan` | Nguyên liệu | Tiên phẩm | Hắc Giao 100% |
| **Hàn Lang mao** | `han_lang_mao` | Nguyên liệu | Bảo phẩm | Hàn Lang 50% |
| **Phong Nha vũ** | `phong_nha_vu` | Nguyên liệu | Bảo phẩm | Phong Nha 50% |
| **Tượng cốt** | `tuong_cot` | Nguyên liệu | Bảo phẩm | Cốt Tượng 50% |
| **Độc tước nang** | `doc_tuoc_nang` | Nguyên liệu | Bảo phẩm | Độc Tước 45%, Thiên Hàn Vương 80% |
| **Thiên Hàn châu** | `thien_han_chau` | Nguyên liệu | Thần phẩm | Thiên Hàn Vương 100% |
| **Da Lang Hoang** | `bi_lang_hoang` | Nguyên liệu | Tiên phẩm | Dã Lang 50%, Xích Diễm Lang 45%, Thiên Lang Vương 80% |
| **Nanh Trăng** | `nanh_nguyet` | Nguyên liệu | Tiên phẩm | Hắc Phong Lang 45%, Huyết Nguyệt Lang 50%, Ngân Nguyệt Lang 30%, Lang Vương 60%, Thiên Lang Vương 80% |
| **Cốt Lang Vương** | `cot_lang_vuong` | Nguyên liệu | Tiên phẩm | Thương Nguyệt Lang 50%, Ngân Nguyệt Lang 30%, Lang Vương 80%, Thiên Lang Vương 100% |
| **Hồn Tinh Thiên Lang** | `hon_tinh_thien_lang` | Nguyên liệu | Thần phẩm | Thương Nguyệt Lang 10%, Lang Vương 30%, Thiên Lang Vương 100% |
| **Mảnh áo Liệt Dương** | `manh_ao_liet_duong` | Nguyên liệu | Tiên phẩm | Thiên Lang Vương 100% |
| **Thượng Hồi Huyết Đan** | `thuong_hoi_huyet_dan` | Đan dược | Tiên phẩm | Hàn Lang 3%, Cốt Tượng 4%, Độc Tước 5%, Thiên Hàn Vương 100%, Dã Lang 6%, Hắc Phong Lang 6%, Huyết Nguyệt Lang 7%, Xích Diễm Lang 8%, Thương Nguyệt Lang 10%, Ngân Nguyệt Lang 10%, Lang Vương 60%, Thiên Lang Vương 100%, Luyện Huyết Đệ Tử 6%, Ngạ Quỷ 6%, Cương Thi 8%, Huyết Mị 8%, Huyết Ảnh 7%, Huyết Sát Chân Truyền 10% |
| **Thượng Hồi Linh Đan** | `thuong_hoi_linh_dan` | Đan dược | Tiên phẩm | Phong Nha 3%, Độc Tước 5%, Thiên Hàn Vương 100%, Dã Lang 5%, Hắc Phong Lang 6%, Huyết Nguyệt Lang 5%, Xích Diễm Lang 6%, Thương Nguyệt Lang 8%, Ngân Nguyệt Lang 8%, Lang Vương 50%, Thiên Lang Vương 100%, Luyện Huyết Đệ Tử 6%, Ngạ Quỷ 5%, Cương Thi 6%, Huyết Mị 6%, Huyết Ảnh 6%, Huyết Sát Chân Truyền 8% |
| **Hỏa Vân Kiếm Pháp** | `kinh_hoa_van_kiem` | Kinh quyển | Linh phẩm | Hắc Hổ 1,2% |
| **Bôn Thạch Quyền** | `kinh_bon_thach_quyen` | Kinh quyển | Linh phẩm | Hắc Hổ 1,2% |
| **Thanh Tùng Châm Quyết** | `kinh_thanh_tung_phi_cham` | Kinh quyển | Bảo phẩm | Xích Mãng 25%, Độc Thiềm 2%, Phong Nha 2% |
| **Lạc Tuyết Kiếm Quyết** | `kinh_lac_tuyet_phan_phi` | Kinh quyển | Bảo phẩm | Sương Hồ 2%, Hàn Lang 2%, Linh Hư Yêu Vương 30% |
| **Cửu Cung Trận Quyết** | `kinh_cuu_cung_khon_sat` | Kinh quyển | Bảo phẩm | Xích Mãng 25%, Thạch Quy 2%, Cốt Tượng 2% |
| **Mê Tung Bộ** | `kinh_me_tung_bo` | Kinh quyển | Bảo phẩm | Độc Thiềm 2%, Độc Tước 2% |
| **Hàn Quang Tiễn Quyết** | `kinh_han_quang_tien` | Kinh quyển | Bảo phẩm | Hàn Lang 2%, Phong Nha 1,2% |
| **Bạch Kim Trảo** | `kinh_bach_kim_trao` | Kinh quyển | Bảo phẩm | Hàn Lang 1,5% |
| **Vân Thạch Trận Pháp** | `kinh_van_thach_tran` | Kinh quyển | Tiên phẩm | Cốt Tượng 2% |
| **Băng Hoa Loạn Quyết** | `kinh_bang_hoa_loan` | Kinh quyển | Tiên phẩm | Phong Nha 2% |
| **Liệt Hỏa Kiếm Quyết** | `kinh_liet_hoa_kiem` | Kinh quyển | Tiên phẩm | Độc Tước 1,8%, Thiên Hàn Vương 25% |
| **Vân Hành Bộ** | `kinh_van_hanh_bo` | Kinh quyển | Bảo phẩm | Cốt Tượng 1,5%, Độc Tước 1,2% |
| **Thanh Vân Kiếm Quyết** | `kinh_thanh_van_kiem_khi` | Kinh quyển | Bảo phẩm | Hắc Hổ 1% |
| **Bàn Thạch Hộ Thể Công** | `kinh_ban_thach_ho_the` | Kinh quyển | Bảo phẩm | Hắc Hổ 1% |
| **Thu Thủy Kiếm Quyết** | `kinh_thu_thuy_kiem_anh` | Kinh quyển | Bảo phẩm | Sương Hồ 1,2% |
| **Liệt Địa Quyền** | `kinh_liet_dia_nhat_quyen` | Kinh quyển | Bảo phẩm | Thạch Quy 1,2% |
| **Phân Nhạc Kiếm Quyết** | `kinh_phan_nhac_tram` | Kinh quyển | Bảo phẩm | Thạch Quy 1,2% |
| **Thanh Vân Vạn Kiếm Quyết** | `kinh_van_kiem_quy_tong` | Kinh quyển | Tiên phẩm | Phong Nha 0,8% |
| **Thực Giáp Tán** | `kinh_thuc_giap_phi_tan` | Kinh quyển | Bảo phẩm | Xích Mãng 1% |
| **Ngũ Chướng Huyền Công** | `kinh_chuong_vu_phong_lam` | Kinh quyển | Tiên phẩm | Phong Nha 0,8% |
| **Hắc Sa Độc Chưởng** | `kinh_hac_sa_doc_chuong` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6%, Độc Tước 1,2% |
| **Thi Độc Âm Chưởng** | `kinh_thi_doc_am_chuong` | Kinh quyển | Bảo phẩm | Hắc Hổ 0,5% |
| **Thiềm Tô Công** | `kinh_thiem_to_cong` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6%, Độc Tước 1,2% |
| **Đoạn Trường Chỉ Pháp** | `kinh_doan_truong_chi_phap` | Kinh quyển | Bảo phẩm | Độc Tước 1,2% |
| **Khô Mộc Phùng Xuân Quyết** | `kinh_kho_moc_phung_xuan_quyet` | Kinh quyển | Bảo phẩm | Độc Tước 1,2% |
| **Mạn Đà Hoa Kinh** | `kinh_man_da_hoa_kinh` | Kinh quyển | Tiên phẩm | Phong Nha 0,8% |
| **Mê Hồn Hương Quyết** | `kinh_me_hon_huong_quyet` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Thái Hoa Quyết** | `kinh_thai_hoa_bo_nguyen` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Huyết Cổ Bí Kinh** | `kinh_huyet_co_bi_kinh` | Kinh quyển | Bảo phẩm | Sương Hồ 0,6% |
| **Tỏa Long Thủ** | `kinh_toa_long_cam_na` | Kinh quyển | Bảo phẩm | Sương Hồ 0,6% |
| **Huyết Phược Chú** | `kinh_huyet_ti_phuoc_than` | Kinh quyển | Tiên phẩm | Hàn Lang 0,6% |
| **Vĩnh Triều Chưởng** | `kinh_no_dao_bai_khong` | Kinh quyển | Tiên phẩm | Hàn Lang 0,6% |
| **Xích Tước Phù Lục** | `kinh_xich_tuoc_phu` | Kinh quyển | Bảo phẩm | Độc Thiềm 0,5% |
| **Phượng Cầu Hoàng Quyết** | `kinh_phuong_minh_cau_hoang` | Kinh quyển | Tiên phẩm | Độc Tước 0,6% |
| **Huyết Trảo Công** | `kinh_huyet_trao_pha_mach` | Kinh quyển | Bảo phẩm | Độc Thiềm 0,6% |
| **Hồng Phấn Khô Lâu** | `kinh_bach_cot_hong_nhan` | Kinh quyển | Tiên phẩm | Phong Nha 0,6% |
| **Nhiếp Hồn Đại Pháp** | `kinh_niep_hon_doat_phat` | Kinh quyển | Tiên phẩm | Độc Tước 0,6% |
| **Huyết Diễm Ma Trảo** | `kinh_ma_trao_phe_huyet` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Hàng Ma Chưởng** | `kinh_phat_hoa_hang_ma` | Kinh quyển | Bảo phẩm | Thạch Quy 0,5% |
| **Huyết Mang Kinh** | `kinh_huyet_mang_pha_giap` | Kinh quyển | Tiên phẩm | Phong Nha 0,5% |
| **Hàn Băng Chưởng** | `kinh_han_bang_nhat_chuong` | Kinh quyển | Bảo phẩm | Hắc Hổ 0,35% |
| **Minh Ảnh Chưởng** | `kinh_minh_anh_phuc_chuong` | Kinh quyển | Bảo phẩm | Hắc Hổ 0,35% |
| **Điện Mâu Quyết** | `kinh_loi_dinh_nhat_miet` | Kinh quyển | Bảo phẩm | Thạch Quy 0,5% |
| **Hồi Phong Chưởng** | `kinh_hoi_phong_lien_chuong` | Kinh quyển | Bảo phẩm | Sương Hồ 0,5% |
| **Thiên La Lôi Trận** | `kinh_thien_la_loi_cam` | Kinh quyển | Tiên phẩm | Phong Nha 0,6% |
| **Chưởng Tâm Lôi** | `kinh_chuong_tam_loi_bao` | Kinh quyển | Tiên phẩm | Phong Nha 0,6% |
| **Vạn Thú Triều Phong** | `kinh_bach_thu_khieu_phong` | Kinh quyển | Tiên phẩm | Phong Nha 0,6% |
| **Minh Vũ Kiếm Quyết** | `kinh_minh_vu_lac_hon` | Kinh quyển | Tiên phẩm | Hàn Lang 0,6% |
| **Sư Tử Hống** | `kinh_su_tu_hong` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Cầm Long Thủ** | `kinh_cam_long_khau` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Hóa Huyết Đại Pháp** | `kinh_hoa_huyet_phe_nguyen` | Kinh quyển | Bảo phẩm | Độc Thiềm 0,5% |
| **Long Tượng Bá Thể** | `kinh_long_tuong_ho_the` | Kinh quyển | Tiên phẩm | Cốt Tượng 0,6% |
| **Lôi Hỏa Phá Tà Chưởng** | `kinh_loi_hoa_pha_ta_chuong` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Chấn Hồn Lôi Pháp** | `kinh_chan_hon_loi_phap` | Kinh quyển | Tiên phẩm | Phong Nha 0,6% |
| **Tịch Dạ Kiếm Quyết** | `kinh_tich_da_phan_anh` | Kinh quyển | Bảo phẩm | Hắc Hổ 0,35% |
| **Thực Phách Trảo** | `kinh_thuc_phat_am_trao` | Kinh quyển | Bảo phẩm | Sương Hồ 0,5% |
| **Khô Mạch Chỉ** | `kinh_kho_mach_dan_luu` | Kinh quyển | Tiên phẩm | Hàn Lang 0,5% |
| **Quỷ Phong Quyết** | `kinh_am_phong_quyen_hon` | Kinh quyển | Bảo phẩm | Thạch Quy 0,5% |
| **Giao Cân Cung** | `kinh_giao_can_cung` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Hàn Sương Tỏa** | `kinh_han_suong_toa` | Kinh quyển | Bảo phẩm | Sương Hồ 0,6% |
| **Băng Phách Thần Châm** | `kinh_bang_phach_than_cham` | Kinh quyển | Tiên phẩm | Hàn Lang 0,6% |
| **Lôi Âm Ấn** | `kinh_loi_am_an` | Kinh quyển | Bảo phẩm | Xích Mãng 0,6% |
| **Tử Điện Thoa** | `kinh_tu_dien_thoa` | Kinh quyển | Bảo phẩm | Sương Hồ 0,6% |
| **Độc Đằng Phục Kinh** | `kinh_doc_dang_phuc` | Kinh quyển | Bảo phẩm | Hắc Hổ 0,8% |
| **Tam Liên Kiếm Quyết** | `kinh_phi_kiem_tam_lien` | Kinh quyển | Bảo phẩm | Sương Hồ 0,8% |
| **Liệt Diễm Trận Đồ** | `kinh_liet_diem_tran` | Kinh quyển | Bảo phẩm | Độc Thiềm 0,8% |
| **Liên Châu Lôi Kinh** | `kinh_loi_lien_chau` | Kinh quyển | Bảo phẩm | Thạch Quy 0,8% |
| **Hồn Phiên Trận Kinh** | `kinh_hon_phien_tuong` | Kinh quyển | Tiên phẩm | Hàn Lang 0,6% |
| **Phá Sơn Quyền Kinh** | `kinh_pha_son_nhat_kich` | Kinh quyển | Tiên phẩm | Cốt Tượng 0,6% |
| **Xích Luyện Ma Đao** | `kinh_xich_luyen_doan_hon` | Kinh quyển | Tiên phẩm | Huyết Nguyệt Lang 0,6%, Xích Diễm Lang 1%, Lang Vương 5%, Thiên Lang Vương 20% |
| **Tâm Kiếm Quyết** | `kinh_tam_kiem_vo_hinh` | Kinh quyển | Tiên phẩm | Thương Nguyệt Lang 0,6%, Ngân Nguyệt Lang 1%, Thiên Lang Vương 20% |
| **Thái Sơn Áp Đỉnh** | `kinh_thai_son_ap_dinh` | Kinh quyển | Tiên phẩm | Thương Nguyệt Lang 1,2%, Thiên Lang Vương 20% |

## Mục 3 — Sách chiêu rơi từ đâu, và soát luật bậc quái

> Luật (`AGENTS.md`, mục Chiêu thức; `shared/src/book-drop-realm.test.ts`): sách chiêu KHÔNG được rơi từ quái bậc THẤP hơn cảnh giới yêu cầu của chiêu; chiêu độ hiếm >= 2 cần ít nhất một nơi rơi cùng bậc hoặc hơn đúng một bậc. Mỗi nơi rơi ghi `quái [bậc quái] xác suất`.

| Sách | Chiêu | Cảnh giới chiêu | Phẩm | Rơi từ |
|---|---|---|---|---|
| **Bôn Thạch Quyền** | Bôn Thạch Quyền (`bon_thach_quyen`) | Luyện Khí | Linh phẩm | Hắc Hổ [Trúc Cơ] 1,2% |
| **Hỏa Vân Kiếm Pháp** | Hỏa Vân Kiếm (`hoa_van_kiem`) | Luyện Khí | Linh phẩm | Hắc Hổ [Trúc Cơ] 1,2% |
| **Bàn Thạch Hộ Thể Công** | Bàn Thạch Hộ Thể (`ban_thach_ho_the`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 1% |
| **Cửu Cung Trận Quyết** | Cửu Cung Khốn Sát (`cuu_cung_khon_sat`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 25%; Thạch Quy [Kim Đan] 2%; Cốt Tượng [Nguyên Anh] 2% |
| **Độc Đằng Phục Kinh** | Độc Đằng Phục (`doc_dang_phuc`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 0,8% |
| **Giao Cân Cung** | Hàn Giao Tiễn (`giao_can_cung`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Hắc Sa Độc Chưởng** | Hắc Sa Chưởng (`hac_sa_doc_chuong`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6%; Độc Tước [Nguyên Anh] 1,2% |
| **Hàn Băng Chưởng** | Hàn Băng Nhất Chưởng (`han_bang_nhat_chuong`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 0,35% |
| **Lạc Tuyết Kiếm Quyết** | Lạc Tuyết Phân Phi (`lac_tuyet_phan_phi`) | Trúc Cơ | Bảo phẩm | Sương Hồ [Kim Đan] 2%; Hàn Lang [Nguyên Anh] 2%; Linh Hư Yêu Vương [Trúc Cơ] 30% |
| **Lôi Âm Ấn** | Lôi Âm (`loi_am_an`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Lôi Hỏa Phá Tà Chưởng** | Lôi Hỏa Chưởng (`loi_hoa_pha_ta_chuong`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Huyết Diễm Ma Trảo** | Ma Trảo Phệ Huyết (`ma_trao_phe_huyet`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Mê Hồn Hương Quyết** | Mê Hồn Hương (`me_hon_huong_quyet`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Mê Tung Bộ** | Mê Tung Bộ (`me_tung_bo`) | Trúc Cơ | Bảo phẩm | Độc Thiềm [Kim Đan] 2%; Độc Tước [Nguyên Anh] 2% |
| **Minh Ảnh Chưởng** | Minh Ảnh Phúc Chưởng (`minh_anh_phuc_chuong`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 0,35% |
| **Sư Tử Hống** | Sư Tử Hống (`su_tu_hong`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Thái Hoa Quyết** | Thái Hoa Bổ Nguyên (`thai_hoa_bo_nguyen`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Thanh Tùng Châm Quyết** | Thanh Tùng Phi Châm (`thanh_tung_phi_cham`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 25%; Độc Thiềm [Kim Đan] 2%; Phong Nha [Nguyên Anh] 2% |
| **Thanh Vân Kiếm Quyết** | Thanh Vân Kiếm Khí (`thanh_van_kiem_khi`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 1% |
| **Thi Độc Âm Chưởng** | Âm Thi Độc Chưởng (`thi_doc_am_chuong`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 0,5% |
| **Thiềm Tô Công** | Thiềm Tô Liệu Thương (`thiem_to_cong`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6%; Độc Tước [Nguyên Anh] 1,2% |
| **Thực Giáp Tán** | Thực Giáp Phi Tán (`thuc_giap_phi_tan`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 1% |
| **Tịch Dạ Kiếm Quyết** | Tịch Dạ Phân Ảnh (`tich_da_phan_anh`) | Trúc Cơ | Bảo phẩm | Hắc Hổ [Trúc Cơ] 0,35% |
| **Cầm Long Thủ** | Cầm Long Khấu (`cam_long_khau`) | Trúc Cơ | Bảo phẩm | Xích Mãng [Trúc Cơ] 0,6% |
| **Quỷ Phong Quyết** | Âm Phong Quyển Hồn (`am_phong_quyen_hon`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 0,5% |
| **Đoạn Trường Chỉ Pháp** | Đoạn Trường Chỉ (`doan_truong_chi_phap`) | Kim Đan | Bảo phẩm | Độc Tước [Nguyên Anh] 1,2% |
| **Hàn Sương Tỏa** | Hàn Sương Phong Mạch (`han_suong_toa`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,6% |
| **Hồi Phong Chưởng** | Hồi Phong Liên Chưởng (`hoi_phong_lien_chuong`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,5% |
| **Huyết Cổ Bí Kinh** | Cổ Nhập Huyết Mạch (`huyet_co_bi_kinh`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,6% |
| **Huyết Trảo Công** | Huyết Trảo Phá Mạch (`huyet_trao_pha_mach`) | Kim Đan | Bảo phẩm | Độc Thiềm [Kim Đan] 0,6% |
| **Khô Mộc Phùng Xuân Quyết** | Khô Mộc Phùng Xuân (`kho_moc_phung_xuan_quyet`) | Kim Đan | Bảo phẩm | Độc Tước [Nguyên Anh] 1,2% |
| **Liệt Địa Quyền** | Liệt Địa Nhất Quyền (`liet_dia_nhat_quyen`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 1,2% |
| **Liệt Diễm Trận Đồ** | Liệt Diễm Trận (`liet_diem_tran`) | Kim Đan | Bảo phẩm | Độc Thiềm [Kim Đan] 0,8% |
| **Điện Mâu Quyết** | Lôi Đình Nhất Miết (`loi_dinh_nhat_miet`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 0,5% |
| **Liên Châu Lôi Kinh** | Liên Châu Lôi (`loi_lien_chau`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 0,8% |
| **Phân Nhạc Kiếm Quyết** | Phân Nhạc Trảm (`phan_nhac_tram`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 1,2% |
| **Hàng Ma Chưởng** | Phật Hỏa Hàng Ma (`phat_hoa_hang_ma`) | Kim Đan | Bảo phẩm | Thạch Quy [Kim Đan] 0,5% |
| **Tam Liên Kiếm Quyết** | Phi Kiếm Tam Liên (`phi_kiem_tam_lien`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,8% |
| **Thu Thủy Kiếm Quyết** | Thu Thủy Kiếm Ảnh (`thu_thuy_kiem_anh`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 1,2% |
| **Thực Phách Trảo** | Thực Phách Âm Trảo (`thuc_phat_am_trao`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,5% |
| **Tỏa Long Thủ** | Tỏa Long Cầm Nã (`toa_long_cam_na`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,6% |
| **Tử Điện Thoa** | Tử Điện Xuyên Vân (`tu_dien_thoa`) | Kim Đan | Bảo phẩm | Sương Hồ [Kim Đan] 0,6% |
| **Xích Tước Phù Lục** | Xích Tước Phù (`xich_tuoc_phu`) | Kim Đan | Bảo phẩm | Độc Thiềm [Kim Đan] 0,5% |
| **Hóa Huyết Đại Pháp** | Hóa Huyết Phệ Nguyên (`hoa_huyet_phe_nguyen`) | Kim Đan | Bảo phẩm | Độc Thiềm [Kim Đan] 0,5% |
| **Hồng Phấn Khô Lâu** | Bạch Cốt Hồng Nhan (`bach_cot_hong_nhan`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,6% |
| **Bạch Kim Trảo** | Bạch Kim Trảo (`bach_kim_trao`) | Nguyên Anh | Bảo phẩm | Hàn Lang [Nguyên Anh] 1,5% |
| **Băng Phách Thần Châm** | Băng Phách Xuyên Tâm (`bang_phach_than_cham`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,6% |
| **Chấn Hồn Lôi Pháp** | Âm Lôi Chấn Hồn (`chan_hon_loi_phap`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,6% |
| **Ngũ Chướng Huyền Công** | Chướng Vụ Phong Lâm (`chuong_vu_phong_lam`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,8% |
| **Hàn Quang Tiễn Quyết** | Hàn Quang Tiễn (`han_quang_tien`) | Nguyên Anh | Bảo phẩm | Hàn Lang [Nguyên Anh] 2%; Phong Nha [Nguyên Anh] 1,2% |
| **Hồn Phiên Trận Kinh** | Hồn Phiên Tượng (`hon_phien_tuong`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,6% |
| **Huyết Mang Kinh** | Huyết Mang Phá Giáp (`huyet_mang_pha_giap`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,5% |
| **Huyết Phược Chú** | Huyết Ti Phược Thân (`huyet_ti_phuoc_than`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,6% |
| **Khô Mạch Chỉ** | Khô Mạch Đoạn Lưu (`kho_mach_dan_luu`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,5% |
| **Mạn Đà Hoa Kinh** | Mạn Đà Hoa Vũ (`man_da_hoa_kinh`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,8% |
| **Minh Vũ Kiếm Quyết** | Minh Vũ Lạc Hồn (`minh_vu_lac_hon`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,6% |
| **Nhiếp Hồn Đại Pháp** | Nhiếp Hồn Đoạt Phách (`niep_hon_doat_phat`) | Nguyên Anh | Tiên phẩm | Độc Tước [Nguyên Anh] 0,6% |
| **Vĩnh Triều Chưởng** | Nộ Đào Bài Không (`no_dao_bai_khong`) | Nguyên Anh | Tiên phẩm | Hàn Lang [Nguyên Anh] 0,6% |
| **Phá Sơn Quyền Kinh** | Phá Sơn Nhất Kích (`pha_son_nhat_kich`) | Nguyên Anh | Tiên phẩm | Cốt Tượng [Nguyên Anh] 0,6% |
| **Thiên La Lôi Trận** | Thiên La Lôi Cấm (`thien_la_loi_cam`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,6% |
| **Băng Hoa Loạn Quyết** | Băng Hoa Loạn (`bang_hoa_loan`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 2% |
| **Chưởng Tâm Lôi** | Chưởng Tâm Lôi Bạo (`chuong_tam_loi_bao`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,6% |
| **Long Tượng Bá Thể** | Long Tượng Hộ Thể (`long_tuong_ho_the`) | Nguyên Anh | Tiên phẩm | Cốt Tượng [Nguyên Anh] 0,6% |
| **Phượng Cầu Hoàng Quyết** | Phượng Minh Cầu Hoàng (`phuong_minh_cau_hoang`) | Nguyên Anh | Tiên phẩm | Độc Tước [Nguyên Anh] 0,6% |
| **Thanh Vân Vạn Kiếm Quyết** | Vạn Kiếm Quy Tông (`van_kiem_quy_tong`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,8% |
| **Vân Thạch Trận Pháp** | Vân Thạch Trận (`van_thach_tran`) | Nguyên Anh | Tiên phẩm | Cốt Tượng [Nguyên Anh] 2% |
| **Vạn Thú Triều Phong** | Bách Thú Khiếu Phong (`bach_thu_khieu_phong`) | Nguyên Anh | Tiên phẩm | Phong Nha [Nguyên Anh] 0,6% |
| **Liệt Hỏa Kiếm Quyết** | Liệt Hỏa Kiếm (`liet_hoa_kiem`) | Nguyên Anh | Tiên phẩm | Độc Tước [Nguyên Anh] 1,8%; Thiên Hàn Vương [Nguyên Anh] 25% |
| **Vân Hành Bộ** | Vân Hành Bộ (`van_hanh_bo`) | Nguyên Anh | Bảo phẩm | Cốt Tượng [Nguyên Anh] 1,5%; Độc Tước [Nguyên Anh] 1,2% |
| **Tâm Kiếm Quyết** | Tâm Kiếm Vô Hình (`tam_kiem_vo_hinh`) | Hóa Thần | Tiên phẩm | Thương Nguyệt Lang [Hóa Thần] 0,6%; Ngân Nguyệt Lang [Hóa Thần] 1%; Thiên Lang Vương [Hóa Thần] 20% |
| **Thái Sơn Áp Đỉnh** | Thái Sơn Áp Đỉnh (`thai_son_ap_dinh`) | Hóa Thần | Tiên phẩm | Thương Nguyệt Lang [Hóa Thần] 1,2%; Thiên Lang Vương [Hóa Thần] 20% |
| **Xích Luyện Ma Đao** | Xích Luyện Đoạn Hồn (`xich_luyen_doan_hon`) | Hóa Thần | Tiên phẩm | Huyết Nguyệt Lang [Hóa Thần] 0,6%; Xích Diễm Lang [Hóa Thần] 1%; Lang Vương [Hóa Thần] 5%; Thiên Lang Vương [Hóa Thần] 20% |

### Vi phạm luật bậc quái

Hiện **KHÔNG có**: mọi sách chiêu rơi từ quái đủ bậc, và mọi chiêu độ hiếm >= 2 có nơi rơi cùng bậc.
