# Sổ tay chiêu thức

> File này **SINH TỰ ĐỘNG** từ `server/src/balance/so-tay-chieu.ts`, đọc dữ liệu thật ở `shared/` (`LEARNABLE_SKILLS`, `DROP_TABLES`,
> `SHOPS`, `MONSTER_BY_ID`, ...). Sau khi sửa số liệu chiêu / rơi đồ / cửa hàng, chạy `npm run so-tay-chieu -w server` để cập nhật;
> test `server/src/balance/so-tay-chieu-sync.test.ts` bắt tài liệu lệch bản sinh. Trạng thái: **87 chiêu** trên 10 hệ.

---

## Mục 1 — Bảng chiêu theo hệ

> Mỗi chiêu một dòng: tên, id, cảnh giới yêu cầu (`reqRealm`), phẩm, hình, hồi chiêu, hiệu ứng tóm tắt, và cách có được (bán ở cửa hàng / rơi từ quái).

### Kim (9 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Kim Chung Tráo** | `kim_chung_trao` | Luyện Khí | Hoàng | self | 9s | Hộ thể 5,25s 20 | Bán ở Hà lão, Mạc Thông (70 LT) |
| **Kim Thoa Xuyên Tâm** | `kim_thoa_xuyen_tam` | Luyện Khí | Hoàng | bolt | 3s | Chảy máu 3s 20 (50) | Bán ở Hà lão, Mạc Thông (160 LT) |
| **Ưng Trảo** | `ung_trao` | Luyện Khí | Hoàng | cone | 2,5s | Chảy máu 3s 15 (40) | Bán ở Hà lão, Mạc Thông (56 LT) |
| **Thanh Vân Kiếm Khí** | `thanh_van_kiem_khi` | Trúc Cơ | Huyền | line | 3s | Chảy máu 3s 20 (50) | Rơi từ Hắc Hổ 1% |
| **Thực Giáp Phi Tán** | `thuc_giap_phi_tan` | Trúc Cơ | Huyền | cone | 3,5s | Độc 3s 20 (60); Vỡ giáp 3s 10 (50) | Rơi từ Xích Mãng 1% |
| **Phi Kiếm Tam Liên** | `phi_kiem_tam_lien` | Kim Đan | Huyền | bolt | 5,5s | Chảy máu 3s 20 (50) | Rơi từ Sương Hồ 0,8% |
| **Thu Thủy Kiếm Ảnh** | `thu_thuy_kiem_anh` | Kim Đan | Huyền | cone | 5s | Chảy máu 3s 25 (50) | Rơi từ Sương Hồ 1,2% |
| **Bạch Kim Trảo** | `bach_kim_trao` | Nguyên Anh | Huyền | cone | 3,2s | Chảy máu 4,5s 18 (55) | Rơi từ Hàn Lang 1,5% |
| **Vạn Kiếm Quy Tông** | `van_kiem_quy_tong` | Nguyên Anh | Địa | fan | 5s | Vỡ giáp 3s 10 (40) | Rơi từ Phong Nha 0,8% |

### Mộc (9 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Triền Xà Tỏa Hầu** | `trien_xa_thu` | Luyện Khí | Hoàng | cone | 3s | Độc 3s 15 (50) | Bán ở Hà lão, Mạc Thông (40 LT) |
| **Độc Đằng Phục** | `doc_dang_phuc` | Trúc Cơ | Huyền | trap | 8s | Độc 4,5s 20 (80) | Rơi từ Hắc Hổ 0,8% |
| **Hắc Sa Chưởng** | `hac_sa_doc_chuong` | Trúc Cơ | Huyền | cone | 3s | Độc 3s 20 (60) | Rơi từ Xích Mãng 0,6%, Độc Tước 1,2% |
| **Mê Hồn Hương** | `me_hon_huong_quyet` | Trúc Cơ | Huyền | cone | 5s | Suy Yếu 3s 20 (60); Vỡ giáp 3s 10 (50) | Rơi từ Xích Mãng 0,6% |
| **Thanh Tùng Phi Châm** | `thanh_tung_phi_cham` | Trúc Cơ | Huyền | line | 3s | Độc 3s 20 (60) | Rơi từ Xích Mãng 25%, Độc Thiềm 2%, Phong Nha 2% |
| **Thiềm Tô Liệu Thương** | `thiem_to_cong` | Trúc Cơ | Huyền | self | 5s | Hồi phục 3s 15 | Rơi từ Xích Mãng 0,6%, Độc Tước 1,2% |
| **Đoạn Trường Chỉ** | `doan_truong_chi_phap` | Kim Đan | Huyền | line | 5s | Độc 4,5s 25 (60) | Rơi từ Độc Tước 1,2% |
| **Khô Mộc Phùng Xuân** | `kho_moc_phung_xuan_quyet` | Kim Đan | Huyền | self | 7s | Hồi phục 3s 15 | Rơi từ Độc Tước 1,2% |
| **Mạn Đà Hoa Vũ** | `man_da_hoa_kinh` | Nguyên Anh | Địa | cone | 7s | Độc 4,5s 30 (70) | Rơi từ Phong Nha 0,8% |

### Thủy (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Hồi Xuân** | `bich_thuy_hoi_xuan` | Luyện Khí | Hoàng | self | 8s | Hồi phục 4,05s 6 | Bán ở Hà lão, Mạc Thông (80 LT) |
| **Hủ Thủy Kình** | `hu_thuy_chuong` | Luyện Khí | Hoàng | cone | 3s | Độc 3s 20 (60) | Bán ở Hà lão, Mạc Thông (40 LT) |
| **Thái Hoa Bổ Nguyên** | `thai_hoa_bo_nguyen` | Trúc Cơ | Huyền | self | 7s | Hồi phục 3s 15 | Rơi từ Xích Mãng 0,6% |
| **Âm Thi Độc Chưởng** | `thi_doc_am_chuong` | Trúc Cơ | Huyền | cone | 3s | Độc 4,5s 25 (60) | Rơi từ Hắc Hổ 0,5% |
| **Cổ Nhập Huyết Mạch** | `huyet_co_bi_kinh` | Kim Đan | Huyền | line | 5s | Độc 4,5s 25 (60); Chảy máu 3s 20 (50) | Rơi từ Sương Hồ 0,6% |
| **Tỏa Long Cầm Nã** | `toa_long_cam_na` | Kim Đan | Huyền | cone | 5s | Choáng 0,75s (60) | Rơi từ Sương Hồ 0,6% |
| **Huyết Ti Phược Thân** | `huyet_ti_phuoc_than` | Nguyên Anh | Địa | cone | 7s | Choáng 0,75s (60); Suy Yếu 3s 15 (60) | Rơi từ Hàn Lang 0,6% |
| **Nộ Đào Bài Không** | `no_dao_bai_khong` | Nguyên Anh | Địa | cone | 5s | — | Rơi từ Hàn Lang 0,6% |

### Hỏa (13 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Chúc Ảnh Dao Hồng** | `chu_canh_dao_hong` | Luyện Khí | Hoàng | cone | 4s | Choáng 0,75s (60) | Bán ở Hà lão, Mạc Thông (90 LT) |
| **Hỏa Dược Nổ** | `hoa_duoc_no` | Luyện Khí | Hoàng | cone | 3s | — | Bán ở Hà lão, Mạc Thông (60 LT) |
| **Hỏa Vân Kiếm** | `hoa_van_kiem` | Luyện Khí | Hoàng | cone | 3s | Bỏng 3s 12 (40) | Bán ở Hà lão, Mạc Thông (80 LT); Rơi từ Hắc Hổ 1,2% |
| **Liệt Diễm Chưởng** | `liet_diem_chuong` | Luyện Khí | Hoàng | cone | 3s | — | Bán ở Hà lão, Mạc Thông (70 LT) |
| **Quỷ Hỏa Phệ Hồn** | `quy_hoa_phe_hon` | Luyện Khí | Hoàng | cone | 3s | — | Bán ở Hà lão, Mạc Thông (86 LT) |
| **Xích Viêm** | `xich_viem` | Luyện Khí | Hoàng | cone | 3s | Bỏng 3s 20 (50) | Bán ở Hà lão, Mạc Thông (70 LT) |
| **Ma Trảo Phệ Huyết** | `ma_trao_phe_huyet` | Trúc Cơ | Huyền | cone | 3s | Chảy máu 3s 25 (60) | Rơi từ Xích Mãng 0,6% |
| **Liệt Diễm Trận** | `liet_diem_tran` | Kim Đan | Huyền | zone | 8s | Bỏng 3s 10 (40) | Rơi từ Độc Thiềm 0,8% |
| **Phật Hỏa Hàng Ma** | `phat_hoa_hang_ma` | Kim Đan | Huyền | cone | 5s | Bỏng 3s 25 (50) | Rơi từ Thạch Quy 0,5% |
| **Xích Tước Phù** | `xich_tuoc_phu` | Kim Đan | Huyền | cone | 5s | Bỏng 4,5s 25 (70) | Rơi từ Độc Thiềm 0,5% |
| **Huyết Mang Phá Giáp** | `huyet_mang_pha_giap` | Nguyên Anh | Địa | cone | 5s | Chảy máu 3s 25 (60) | Rơi từ Phong Nha 0,5% |
| **Phượng Minh Cầu Hoàng** | `phuong_minh_cau_hoang` | Nguyên Anh | Địa | cone | 7s | Choáng 0,9s (70); Bỏng 3s 20 (50) | Rơi từ Độc Tước 0,6% |
| **Liệt Hỏa Kiếm** | `liet_hoa_kiem` | Nguyên Anh | Địa | cone | 3,5s | Bỏng 4,5s 20 (60) | Rơi từ Độc Tước 1,8%, Thiên Hàn Vương 25% |

### Thổ (10 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Bôn Thạch Quyền** | `bon_thach_quyen` | Luyện Khí | Hoàng | cone | 3,5s | — | Bán ở Hà lão, Mạc Thông (60 LT); Rơi từ Hắc Hổ 1,2% |
| **Thiết Sa Chưởng** | `thiet_sa_chuong` | Luyện Khí | Hoàng | cone | 3s | Vỡ giáp 3s 10 (40) | Bán ở Hà lão, Mạc Thông (140 LT) |
| **Trọng Nhạc Trảm** | `trong_nhac_tram` | Luyện Khí | Hoàng | cone | 3s | Chảy máu 3s 12 (30) | Bán ở Hà lão, Mạc Thông (80 LT) |
| **Bàn Thạch Hộ Thể** | `ban_thach_ho_the` | Trúc Cơ | Huyền | self | 9s | Hộ thể 4,5s 25 | Rơi từ Hắc Hổ 1% |
| **Cửu Cung Khốn Sát** | `cuu_cung_khon_sat` | Trúc Cơ | Huyền | ground | 7s | Choáng 1,05s (70); Vỡ giáp 3s 10 (50) | Rơi từ Xích Mãng 25%, Thạch Quy 2%, Cốt Tượng 2% |
| **Liệt Địa Nhất Quyền** | `liet_dia_nhat_quyen` | Kim Đan | Huyền | ground | 5s | Cường Lực 3s 30 | Rơi từ Thạch Quy 1,2% |
| **Phân Nhạc Trảm** | `phan_nhac_tram` | Kim Đan | Huyền | cone | 5s | Chảy máu 3s 20 (40) | Rơi từ Thạch Quy 1,2% |
| **Chướng Vụ Phong Lâm** | `chuong_vu_phong_lam` | Nguyên Anh | Địa | cone | 5,5s | Độc 4,5s 25 (60) | Rơi từ Phong Nha 0,8% |
| **Phá Sơn Nhất Kích** | `pha_son_nhat_kich` | Nguyên Anh | Địa | ground | 9s | Choáng 1,2s (70); Vỡ giáp 3s 15 (60) | Rơi từ Cốt Tượng 0,6% |
| **Vân Thạch Trận** | `van_thach_tran` | Nguyên Anh | Địa | ground | 7s | Choáng 1,05s (70); Vỡ giáp 3s 12 (55) | Rơi từ Cốt Tượng 2% |

### Băng (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Huyền Băng Chỉ** | `huyen_bang_chi` | Luyện Khí | Hoàng | line | 2,5s | — | Bán ở Hà lão, Mạc Thông (76 LT) |
| **Hàn Giao Tiễn** | `giao_can_cung` | Trúc Cơ | Huyền | bolt | 3s | Tê cóng 3s 10 (40) | Rơi từ Xích Mãng 0,6% |
| **Hàn Băng Nhất Chưởng** | `han_bang_nhat_chuong` | Trúc Cơ | Huyền | cone | 3s | Tê cóng 3s 10 (50) | Rơi từ Hắc Hổ 0,35% |
| **Lạc Tuyết Phân Phi** | `lac_tuyet_phan_phi` | Trúc Cơ | Huyền | fan | 3,5s | Tê cóng 3s 30 (50) | Rơi từ Sương Hồ 2%, Hàn Lang 2%, Linh Hư Yêu Vương 30% |
| **Hàn Sương Phong Mạch** | `han_suong_toa` | Kim Đan | Huyền | trap | 9s | Tê cóng 4,5s 10 (60) | Rơi từ Sương Hồ 0,6% |
| **Băng Phách Xuyên Tâm** | `bang_phach_than_cham` | Nguyên Anh | Địa | bolt | 5s | Tê cóng 3s 12 (70) | Rơi từ Hàn Lang 0,6% |
| **Hàn Quang Tiễn** | `han_quang_tien` | Nguyên Anh | Huyền | line | 3s | Tê cóng 3s 30 (55) | Rơi từ Hàn Lang 2%, Phong Nha 1,2% |
| **Băng Hoa Loạn** | `bang_hoa_loan` | Nguyên Anh | Địa | fan | 3,8s | Tê cóng 3s 30 (50) | Rơi từ Phong Nha 2% |

### Phong (7 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Phiêu Phong Bộ** | `phieu_phong_bo` | Luyện Khí | Hoàng | dash | 3s | — | Bán ở Hà lão, Mạc Thông (12 LT) |
| **Quỷ Ảnh Mê Tung** | `quy_anh_me_tung` | Luyện Khí | Hoàng | self | 3s | Tăng tốc 3s 30 | Bán ở Hà lão, Mạc Thông (80 LT) |
| **Mê Tung Bộ** | `me_tung_bo` | Trúc Cơ | Huyền | self | 8s | Tăng tốc 3s 35 | Rơi từ Độc Thiềm 2%, Độc Tước 2% |
| **Âm Phong Quyển Hồn** | `am_phong_quyen_hon` | Kim Đan | Huyền | fan | 7s | Choáng 0,75s (50) | Rơi từ Thạch Quy 0,5% |
| **Hồi Phong Liên Chưởng** | `hoi_phong_lien_chuong` | Kim Đan | Huyền | cone | 3s | Tăng tốc 1,5s 30 | Rơi từ Sương Hồ 0,5% |
| **Bách Thú Khiếu Phong** | `bach_thu_khieu_phong` | Nguyên Anh | Địa | self | 7s | Tăng tốc 4,5s 25; Hồi phục 4,5s 5 | Rơi từ Phong Nha 0,6% |
| **Vân Hành Bộ** | `van_hanh_bo` | Nguyên Anh | Huyền | self | 8s | Tăng tốc 3s 40 | Rơi từ Cốt Tượng 1,5%, Độc Tước 1,2% |

### Lôi (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Lôi Âm** | `loi_am_an` | Trúc Cơ | Huyền | ground | 5s | Dấu Lôi 3s (65) | Rơi từ Xích Mãng 0,6% |
| **Lôi Hỏa Chưởng** | `loi_hoa_pha_ta_chuong` | Trúc Cơ | Huyền | cone | 3s | Bỏng 3s 20 (50) | Rơi từ Xích Mãng 0,6% |
| **Lôi Đình Nhất Miết** | `loi_dinh_nhat_miet` | Kim Đan | Huyền | line | 5s | Tăng tốc 1,5s 30 | Rơi từ Thạch Quy 0,5% |
| **Liên Châu Lôi** | `loi_lien_chau` | Kim Đan | Huyền | chain | 4,5s | Choáng 0,75s (25) | Rơi từ Thạch Quy 0,8% |
| **Tử Điện Xuyên Vân** | `tu_dien_thoa` | Kim Đan | Huyền | bolt | 5s | — | Rơi từ Sương Hồ 0,6% |
| **Âm Lôi Chấn Hồn** | `chan_hon_loi_phap` | Nguyên Anh | Địa | fan | 5s | Dấu Lôi 6s (80) | Rơi từ Phong Nha 0,6% |
| **Thiên La Lôi Cấm** | `thien_la_loi_cam` | Nguyên Anh | Địa | ground | 4,5s | Dấu Lôi 6s (80) | Rơi từ Phong Nha 0,6% |
| **Chưởng Tâm Lôi Bạo** | `chuong_tam_loi_bao` | Nguyên Anh | Địa | cone | 5s | — | Rơi từ Phong Nha 0,6% |

### Âm (7 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Thực Hồn Nhất Chỉ** | `thuc_hon_nhat_chi` | Luyện Khí | Hoàng | cone | 3s | — | Bán ở Hà lão, Mạc Thông (80 LT) |
| **Minh Ảnh Phúc Chưởng** | `minh_anh_phuc_chuong` | Trúc Cơ | Huyền | cone | 3s | Suy Yếu 4,5s 25 (60) | Rơi từ Hắc Hổ 0,35% |
| **Tịch Dạ Phân Ảnh** | `tich_da_phan_anh` | Trúc Cơ | Huyền | fan | 3s | Chảy máu 3s 20 (50) | Rơi từ Hắc Hổ 0,35% |
| **Thực Phách Âm Trảo** | `thuc_phat_am_trao` | Kim Đan | Huyền | cone | 5s | — | Rơi từ Sương Hồ 0,5% |
| **Hồn Phiên Tượng** | `hon_phien_tuong` | Nguyên Anh | Địa | totem | 12s | Suy Yếu 4,5s 15 (50) | Rơi từ Hàn Lang 0,6% |
| **Khô Mạch Đoạn Lưu** | `kho_mach_dan_luu` | Nguyên Anh | Địa | cone | 5s | Độc 4,5s 25 (60) | Rơi từ Hàn Lang 0,5% |
| **Minh Vũ Lạc Hồn** | `minh_vu_lac_hon` | Nguyên Anh | Địa | fan | 5s | Chảy máu 3s 25 (50) | Rơi từ Hàn Lang 0,6% |

### Vô sắc (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Huyết Ảnh Xuyên Tâm** | `huyet_anh_xuyen_tam` | Luyện Khí | Hoàng | line | 3s | Chảy máu 3s 20 (50) | Bán ở Hà lão, Mạc Thông (70 LT) |
| **Sư Tử Hống** | `su_tu_hong` | Trúc Cơ | Huyền | cone | 4,5s | Choáng 0,75s (60) | Rơi từ Xích Mãng 0,6% |
| **Cầm Long Khấu** | `cam_long_khau` | Trúc Cơ | Huyền | cone | 5s | Choáng 0,75s (65); Vỡ giáp 3s 10 (50) | Rơi từ Xích Mãng 0,6% |
| **Huyết Trảo Phá Mạch** | `huyet_trao_pha_mach` | Kim Đan | Huyền | cone | 5s | Chảy máu 3s 25 (60) | Rơi từ Độc Thiềm 0,6% |
| **Hóa Huyết Phệ Nguyên** | `hoa_huyet_phe_nguyen` | Kim Đan | Huyền | cone | 5s | Chảy máu 4,5s 30 (70) | Rơi từ Độc Thiềm 0,5% |
| **Bạch Cốt Hồng Nhan** | `bach_cot_hong_nhan` | Nguyên Anh | Địa | cone | 9s | Choáng 0,75s (65) | Rơi từ Phong Nha 0,6% |
| **Nhiếp Hồn Đoạt Phách** | `niep_hon_doat_phat` | Nguyên Anh | Địa | cone | 9s | Choáng 0,9s (70) | Rơi từ Độc Tước 0,6% |
| **Long Tượng Hộ Thể** | `long_tuong_ho_the` | Nguyên Anh | Địa | self | 7s | Hộ thể 6s 30 | Rơi từ Cốt Tượng 0,6% |


## Mục 2 — Ma trận độ phủ: hệ × cảnh giới

> Số chiêu của mỗi hệ ở mỗi cảnh giới yêu cầu (`reqRealm`). Ô trống (–) là hệ chưa có chiêu nào đòi cảnh giới đó — dùng để chọn lô chiêu kế tiếp.

| Hệ \ Cảnh giới | Phàm Nhân | Luyện Khí | Trúc Cơ | Kim Đan | Nguyên Anh | Tổng |
|---|---:|---:|---:|---:|---:|---:|
| Kim | – | 3 | 2 | 2 | 2 | 9 |
| Mộc | – | 1 | 5 | 2 | 1 | 9 |
| Thủy | – | 2 | 2 | 2 | 2 | 8 |
| Hỏa | – | 6 | 1 | 3 | 3 | 13 |
| Thổ | – | 3 | 2 | 2 | 3 | 10 |
| Băng | – | 1 | 3 | 1 | 3 | 8 |
| Phong | – | 2 | 1 | 2 | 2 | 7 |
| Lôi | – | – | 2 | 3 | 3 | 8 |
| Âm | – | 1 | 2 | 1 | 3 | 7 |
| Vô sắc | – | 1 | 2 | 2 | 3 | 8 |
| **Tổng** | 0 | 20 | 22 | 20 | 25 | 87 |

## Mục 3 — Chiêu "mồ côi" (không bán, không rơi từ quái nào)

Hiện **KHÔNG có**: mọi chiêu đều bán ở cửa hàng (độ hiếm <= 1) hoặc rơi từ ít nhất một quái. Thêm chiêu mà không gắn nơi có được thì dòng sẽ hiện ở đây.
