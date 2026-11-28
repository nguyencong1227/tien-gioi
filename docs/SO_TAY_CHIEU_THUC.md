# Sổ tay chiêu thức

> File này **SINH TỰ ĐỘNG** từ `server/src/balance/so-tay-chieu.ts`, đọc dữ liệu thật ở `shared/` (`LEARNABLE_SKILLS`, `DROP_TABLES`,
> `SHOPS`, `SECT_SHOP`, `QUESTS`, ...). Sau khi sửa số liệu chiêu / rơi đồ / cửa hàng / tông môn / nhiệm vụ, chạy `npm run so-tay-chieu -w server` để cập nhật;
> test `server/src/balance/so-tay-chieu-sync.test.ts` bắt tài liệu lệch bản sinh. Trạng thái: **87 chiêu** trên 10 hệ.

---

## Mục 1 — Bảng chiêu theo hệ

> Mỗi chiêu một dòng: tên, id, cảnh giới yêu cầu, phẩm, hình đòn, hồi chiêu, hiệu ứng tóm tắt, và cách có được.
>
> - **Hiệu ứng** = tên trạng thái, thời gian, (cường độ: nghĩa ghi ngay trong ngoặc theo loại trạng thái), rồi xác suất gắn khi dưới 100%.
> - **Cách có được** gồm bốn nguồn: _Bán ở_ (cửa hàng NPC, giá bằng Linh thạch), _Rơi từ_ (quái, tỉ lệ %), _Đổi ở_ (Tàng Kinh Các / Bảo khố tông môn, giá bằng cống hiến và cấp tông tối thiểu), _Thưởng nhiệm vụ_.

### Kim (9 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Kim Chung Tráo** | `kim_chung_trao` | Luyện Khí | Hoàng | Hộ thể quanh mình | 9s | Hộ thể 5,25s (chắn 20% khí huyết tối đa), cho bản thân | Bán ở Hà lão, Mạc Thông (70 Linh thạch); Đổi ở Tàng Kinh Các tông môn (14 cống hiến, từ cấp tông 2) |
| **Kim Thoa Xuyên Tâm** | `kim_thoa_xuyen_tam` | Luyện Khí | Hoàng | Đạn bay | 3s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Bán ở Hà lão, Mạc Thông (160 Linh thạch) |
| **Ưng Trảo** | `ung_trao` | Luyện Khí | Hoàng | Quạt trước mặt | 2,5s | Chảy máu 3s (15% sát thương gốc mỗi giây), xác suất 40% | Bán ở Hà lão, Mạc Thông (56 Linh thạch); Đổi ở Tàng Kinh Các tông môn (12 cống hiến, từ cấp tông 2) |
| **Thanh Vân Kiếm Khí** | `thanh_van_kiem_khi` | Trúc Cơ | Huyền | Tia thẳng | 3s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Hắc Hổ 1% |
| **Thực Giáp Phi Tán** | `thuc_giap_phi_tan` | Trúc Cơ | Huyền | Quạt trước mặt | 3,5s | Độc 3s (20% sát thương gốc mỗi giây), xác suất 60%; Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 50% | Rơi từ Xích Mãng 1% |
| **Phi Kiếm Tam Liên** | `phi_kiem_tam_lien` | Kim Đan | Huyền | Đạn bay | 5,5s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Sương Hồ 0,8% |
| **Thu Thủy Kiếm Ảnh** | `thu_thuy_kiem_anh` | Kim Đan | Huyền | Quạt trước mặt | 5s | Chảy máu 3s (25% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Sương Hồ 1,2% |
| **Bạch Kim Trảo** | `bach_kim_trao` | Nguyên Anh | Huyền | Quạt trước mặt | 3,2s | Chảy máu 4,5s (18% sát thương gốc mỗi giây), xác suất 55% | Rơi từ Hàn Lang 1,5%; Đổi ở Tàng Kinh Các tông môn (56 cống hiến, từ cấp tông 4); Thưởng nhiệm vụ "Rèn trảo bạch kim" |
| **Vạn Kiếm Quy Tông** | `van_kiem_quy_tong` | Nguyên Anh | Địa | Toả nhiều tia | 5s | Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 40% | Rơi từ Phong Nha 0,8% |

### Mộc (9 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Triền Xà Tỏa Hầu** | `trien_xa_thu` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Độc 3s (15% sát thương gốc mỗi giây), xác suất 50% | Bán ở Hà lão, Mạc Thông (40 Linh thạch) |
| **Độc Đằng Phục** | `doc_dang_phuc` | Trúc Cơ | Huyền | Bẫy | 8s | Độc 4,5s (20% sát thương gốc mỗi giây), xác suất 80% | Rơi từ Hắc Hổ 0,8% |
| **Hắc Sa Chưởng** | `hac_sa_doc_chuong` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Độc 3s (20% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Xích Mãng 0,6%, Độc Tước 1,2% |
| **Mê Hồn Hương** | `me_hon_huong_quyet` | Trúc Cơ | Huyền | Quạt trước mặt | 5s | Suy Yếu 3s (gây ít hơn 20% sát thương, trùm chỉ chịu một nửa), xác suất 60%; Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 50% | Rơi từ Xích Mãng 0,6% |
| **Thanh Tùng Phi Châm** | `thanh_tung_phi_cham` | Trúc Cơ | Huyền | Tia thẳng | 3s | Độc 3s (20% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Xích Mãng 25%, Độc Thiềm 2%, Phong Nha 2%; Đổi ở Tàng Kinh Các tông môn (60 cống hiến, từ cấp tông 4) |
| **Thiềm Tô Liệu Thương** | `thiem_to_cong` | Trúc Cơ | Huyền | Hộ thể quanh mình | 5s | Hồi phục 3s (hồi 15% khí huyết tối đa mỗi giây), cho bản thân | Rơi từ Xích Mãng 0,6%, Độc Tước 1,2% |
| **Đoạn Trường Chỉ** | `doan_truong_chi_phap` | Kim Đan | Huyền | Tia thẳng | 5s | Độc 4,5s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Độc Tước 1,2% |
| **Khô Mộc Phùng Xuân** | `kho_moc_phung_xuan_quyet` | Kim Đan | Huyền | Hộ thể quanh mình | 7s | Hồi phục 3s (hồi 15% khí huyết tối đa mỗi giây), cho bản thân | Rơi từ Độc Tước 1,2% |
| **Mạn Đà Hoa Vũ** | `man_da_hoa_kinh` | Nguyên Anh | Địa | Quạt trước mặt | 7s | Độc 4,5s (30% sát thương gốc mỗi giây), xác suất 70% | Rơi từ Phong Nha 0,8% |

### Thủy (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Hồi Xuân** | `bich_thuy_hoi_xuan` | Luyện Khí | Hoàng | Hộ thể quanh mình | 8s | Hồi phục 4,05s (hồi 6% khí huyết tối đa mỗi giây), cho bản thân | Bán ở Hà lão, Mạc Thông (80 Linh thạch); Đổi ở Tàng Kinh Các tông môn (16 cống hiến, từ cấp tông 2); Thưởng nhiệm vụ "Bông băng cứu thương" |
| **Hủ Thủy Kình** | `hu_thuy_chuong` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Độc 3s (20% sát thương gốc mỗi giây), xác suất 60% | Bán ở Hà lão, Mạc Thông (40 Linh thạch) |
| **Thái Hoa Bổ Nguyên** | `thai_hoa_bo_nguyen` | Trúc Cơ | Huyền | Hộ thể quanh mình | 7s | Hồi phục 3s (hồi 15% khí huyết tối đa mỗi giây), cho bản thân | Rơi từ Xích Mãng 0,6% |
| **Âm Thi Độc Chưởng** | `thi_doc_am_chuong` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Độc 4,5s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Hắc Hổ 0,5%; Thưởng nhiệm vụ "Độc nang dược sư" |
| **Cổ Nhập Huyết Mạch** | `huyet_co_bi_kinh` | Kim Đan | Huyền | Tia thẳng | 5s | Độc 4,5s (25% sát thương gốc mỗi giây), xác suất 60%; Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Sương Hồ 0,6% |
| **Tỏa Long Cầm Nã** | `toa_long_cam_na` | Kim Đan | Huyền | Quạt trước mặt | 5s | Choáng 0,75s, xác suất 60% | Rơi từ Sương Hồ 0,6% |
| **Huyết Ti Phược Thân** | `huyet_ti_phuoc_than` | Nguyên Anh | Địa | Quạt trước mặt | 7s | Choáng 0,75s, xác suất 60%; Suy Yếu 3s (gây ít hơn 15% sát thương, trùm chỉ chịu một nửa), xác suất 60% | Rơi từ Hàn Lang 0,6% |
| **Nộ Đào Bài Không** | `no_dao_bai_khong` | Nguyên Anh | Địa | Quạt trước mặt | 5s | — | Rơi từ Hàn Lang 0,6% |

### Hỏa (13 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Chúc Ảnh Dao Hồng** | `chu_canh_dao_hong` | Luyện Khí | Hoàng | Quạt trước mặt | 4s | Choáng 0,75s, xác suất 60% | Bán ở Hà lão, Mạc Thông (90 Linh thạch) |
| **Hỏa Dược Nổ** | `hoa_duoc_no` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | — | Bán ở Hà lão, Mạc Thông (60 Linh thạch) |
| **Hỏa Vân Kiếm** | `hoa_van_kiem` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Bỏng 3s (12% sát thương gốc mỗi giây), xác suất 40% | Bán ở Hà lão, Mạc Thông (80 Linh thạch); Rơi từ Hắc Hổ 1,2%; Đổi ở Tàng Kinh Các tông môn (16 cống hiến, từ cấp tông 2); Thưởng nhiệm vụ "Bước vào tiên đồ" |
| **Liệt Diễm Chưởng** | `liet_diem_chuong` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | — | Bán ở Hà lão, Mạc Thông (70 Linh thạch) |
| **Quỷ Hỏa Phệ Hồn** | `quy_hoa_phe_hon` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | — | Bán ở Hà lão, Mạc Thông (86 Linh thạch) |
| **Xích Viêm** | `xich_viem` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Bỏng 3s (20% sát thương gốc mỗi giây), xác suất 50% | Bán ở Hà lão, Mạc Thông (70 Linh thạch) |
| **Ma Trảo Phệ Huyết** | `ma_trao_phe_huyet` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Chảy máu 3s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Xích Mãng 0,6% |
| **Liệt Diễm Trận** | `liet_diem_tran` | Kim Đan | Huyền | Vùng duy trì | 8s | Bỏng 3s (10% sát thương gốc mỗi giây), xác suất 40% | Rơi từ Độc Thiềm 0,8% |
| **Phật Hỏa Hàng Ma** | `phat_hoa_hang_ma` | Kim Đan | Huyền | Quạt trước mặt | 5s | Bỏng 3s (25% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Thạch Quy 0,5% |
| **Xích Tước Phù** | `xich_tuoc_phu` | Kim Đan | Huyền | Quạt trước mặt | 5s | Bỏng 4,5s (25% sát thương gốc mỗi giây), xác suất 70% | Rơi từ Độc Thiềm 0,5% |
| **Huyết Mang Phá Giáp** | `huyet_mang_pha_giap` | Nguyên Anh | Địa | Quạt trước mặt | 5s | Chảy máu 3s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Phong Nha 0,5% |
| **Phượng Minh Cầu Hoàng** | `phuong_minh_cau_hoang` | Nguyên Anh | Địa | Quạt trước mặt | 7s | Choáng 0,9s, xác suất 70%; Bỏng 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Độc Tước 0,6% |
| **Liệt Hỏa Kiếm** | `liet_hoa_kiem` | Nguyên Anh | Địa | Quạt trước mặt | 3,5s | Bỏng 4,5s (20% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Độc Tước 1,8%, Thiên Hàn Vương 25%; Đổi ở Tàng Kinh Các tông môn (92 cống hiến, từ cấp tông 5) |

### Thổ (10 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Bôn Thạch Quyền** | `bon_thach_quyen` | Luyện Khí | Hoàng | Quạt trước mặt | 3,5s | — | Bán ở Hà lão, Mạc Thông (60 Linh thạch); Rơi từ Hắc Hổ 1,2%; Đổi ở Tàng Kinh Các tông môn (12 cống hiến, từ cấp tông 2) |
| **Thiết Sa Chưởng** | `thiet_sa_chuong` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 40% | Bán ở Hà lão, Mạc Thông (140 Linh thạch) |
| **Trọng Nhạc Trảm** | `trong_nhac_tram` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | Chảy máu 3s (12% sát thương gốc mỗi giây), xác suất 30% | Bán ở Hà lão, Mạc Thông (80 Linh thạch); Đổi ở Tàng Kinh Các tông môn (16 cống hiến, từ cấp tông 2) |
| **Bàn Thạch Hộ Thể** | `ban_thach_ho_the` | Trúc Cơ | Huyền | Hộ thể quanh mình | 9s | Hộ thể 4,5s (chắn 25% khí huyết tối đa), cho bản thân | Rơi từ Hắc Hổ 1%; Thưởng nhiệm vụ "Dọn đường trạm" |
| **Cửu Cung Khốn Sát** | `cuu_cung_khon_sat` | Trúc Cơ | Huyền | Vùng đặt xuống đất | 7s | Choáng 1,05s, xác suất 70%; Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 50% | Rơi từ Xích Mãng 25%, Thạch Quy 2%, Cốt Tượng 2%; Đổi ở Tàng Kinh Các tông môn (60 cống hiến, từ cấp tông 4) |
| **Liệt Địa Nhất Quyền** | `liet_dia_nhat_quyen` | Kim Đan | Huyền | Vùng đặt xuống đất | 5s | Cường Lực 3s (tăng 30% sát thương mọi chiêu), cho bản thân | Rơi từ Thạch Quy 1,2% |
| **Phân Nhạc Trảm** | `phan_nhac_tram` | Kim Đan | Huyền | Quạt trước mặt | 5s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 40% | Rơi từ Thạch Quy 1,2% |
| **Chướng Vụ Phong Lâm** | `chuong_vu_phong_lam` | Nguyên Anh | Địa | Quạt trước mặt | 5,5s | Độc 4,5s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Phong Nha 0,8% |
| **Phá Sơn Nhất Kích** | `pha_son_nhat_kich` | Nguyên Anh | Địa | Vùng đặt xuống đất | 9s | Choáng 1,2s, xác suất 70%; Vỡ giáp 3s (nhận thêm 15% sát thương), xác suất 60% | Rơi từ Cốt Tượng 0,6% |
| **Vân Thạch Trận** | `van_thach_tran` | Nguyên Anh | Địa | Vùng đặt xuống đất | 7s | Choáng 1,05s, xác suất 70%; Vỡ giáp 3s (nhận thêm 12% sát thương), xác suất 55% | Rơi từ Cốt Tượng 2%; Đổi ở Tàng Kinh Các tông môn (84 cống hiến, từ cấp tông 5) |

### Băng (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Huyền Băng Chỉ** | `huyen_bang_chi` | Luyện Khí | Hoàng | Tia thẳng | 2,5s | — | Bán ở Hà lão, Mạc Thông (76 Linh thạch); Đổi ở Tàng Kinh Các tông môn (16 cống hiến, từ cấp tông 2) |
| **Hàn Giao Tiễn** | `giao_can_cung` | Trúc Cơ | Huyền | Đạn bay | 3s | Tê cóng 3s (giảm tốc 10%), xác suất 40% | Rơi từ Xích Mãng 0,6% |
| **Hàn Băng Nhất Chưởng** | `han_bang_nhat_chuong` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Tê cóng 3s (giảm tốc 10%), xác suất 50% | Rơi từ Hắc Hổ 0,35% |
| **Lạc Tuyết Phân Phi** | `lac_tuyet_phan_phi` | Trúc Cơ | Huyền | Toả nhiều tia | 3,5s | Tê cóng 3s (giảm tốc 30%), xác suất 50% | Rơi từ Sương Hồ 2%, Hàn Lang 2%, Linh Hư Yêu Vương 30%; Đổi ở Tàng Kinh Các tông môn (58 cống hiến, từ cấp tông 4) |
| **Hàn Sương Phong Mạch** | `han_suong_toa` | Kim Đan | Huyền | Bẫy | 9s | Tê cóng 4,5s (giảm tốc 10%), xác suất 60% | Rơi từ Sương Hồ 0,6% |
| **Băng Phách Xuyên Tâm** | `bang_phach_than_cham` | Nguyên Anh | Địa | Đạn bay | 5s | Tê cóng 3s (giảm tốc 12%), xác suất 70% | Rơi từ Hàn Lang 0,6% |
| **Hàn Quang Tiễn** | `han_quang_tien` | Nguyên Anh | Huyền | Tia thẳng | 3s | Tê cóng 3s (giảm tốc 30%), xác suất 55% | Rơi từ Hàn Lang 2%, Phong Nha 1,2%; Đổi ở Tàng Kinh Các tông môn (48 cống hiến, từ cấp tông 4); Thưởng nhiệm vụ "Lập uy băng nguyên" |
| **Băng Hoa Loạn** | `bang_hoa_loan` | Nguyên Anh | Địa | Toả nhiều tia | 3,8s | Tê cóng 3s (giảm tốc 30%), xác suất 50% | Rơi từ Phong Nha 2%; Đổi ở Tàng Kinh Các tông môn (80 cống hiến, từ cấp tông 5) |

### Phong (7 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Phiêu Phong Bộ** | `phieu_phong_bo` | Luyện Khí | Hoàng | Lao tới, né đòn | 3s | — | Bán ở Hà lão, Mạc Thông (12 Linh thạch); Đổi ở Tàng Kinh Các tông môn (3 cống hiến, từ cấp tông 2) |
| **Quỷ Ảnh Mê Tung** | `quy_anh_me_tung` | Luyện Khí | Hoàng | Hộ thể quanh mình | 3s | Tăng tốc 3s (tăng tốc 30%), cho bản thân | Bán ở Hà lão, Mạc Thông (80 Linh thạch) |
| **Mê Tung Bộ** | `me_tung_bo` | Trúc Cơ | Huyền | Hộ thể quanh mình | 8s | Tăng tốc 3s (tăng tốc 35%), cho bản thân | Rơi từ Độc Thiềm 2%, Độc Tước 2%; Đổi ở Tàng Kinh Các tông môn (30 cống hiến, từ cấp tông 4) |
| **Âm Phong Quyển Hồn** | `am_phong_quyen_hon` | Kim Đan | Huyền | Toả nhiều tia | 7s | Choáng 0,75s, xác suất 50% | Rơi từ Thạch Quy 0,5% |
| **Hồi Phong Liên Chưởng** | `hoi_phong_lien_chuong` | Kim Đan | Huyền | Quạt trước mặt | 3s | Tăng tốc 1,5s (tăng tốc 30%), cho bản thân | Rơi từ Sương Hồ 0,5% |
| **Bách Thú Khiếu Phong** | `bach_thu_khieu_phong` | Nguyên Anh | Địa | Hộ thể quanh mình | 7s | Tăng tốc 4,5s (tăng tốc 25%), cho bản thân; Hồi phục 4,5s (hồi 5% khí huyết tối đa mỗi giây), cho bản thân | Rơi từ Phong Nha 0,6% |
| **Vân Hành Bộ** | `van_hanh_bo` | Nguyên Anh | Huyền | Hộ thể quanh mình | 8s | Tăng tốc 3s (tăng tốc 40%), cho bản thân | Rơi từ Cốt Tượng 1,5%, Độc Tước 1,2%; Đổi ở Tàng Kinh Các tông môn (60 cống hiến, từ cấp tông 4); Thưởng nhiệm vụ "Lướt gió Hàn Vân" |

### Lôi (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Lôi Âm** | `loi_am_an` | Trúc Cơ | Huyền | Vùng đặt xuống đất | 5s | Dấu Lôi 3s (chiêu cùng hệ đánh vào sẽ ăn combo), xác suất 65% | Rơi từ Xích Mãng 0,6% |
| **Lôi Hỏa Chưởng** | `loi_hoa_pha_ta_chuong` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Bỏng 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Xích Mãng 0,6% |
| **Lôi Đình Nhất Miết** | `loi_dinh_nhat_miet` | Kim Đan | Huyền | Tia thẳng | 5s | Tăng tốc 1,5s (tăng tốc 30%), cho bản thân | Rơi từ Thạch Quy 0,5% |
| **Liên Châu Lôi** | `loi_lien_chau` | Kim Đan | Huyền | Sét lan sang mục tiêu gần | 4,5s | Choáng 0,75s, xác suất 25% | Rơi từ Thạch Quy 0,8% |
| **Tử Điện Xuyên Vân** | `tu_dien_thoa` | Kim Đan | Huyền | Đạn bay | 5s | — | Rơi từ Sương Hồ 0,6% |
| **Âm Lôi Chấn Hồn** | `chan_hon_loi_phap` | Nguyên Anh | Địa | Toả nhiều tia | 5s | Dấu Lôi 6s (chiêu cùng hệ đánh vào sẽ ăn combo), xác suất 80% | Rơi từ Phong Nha 0,6% |
| **Thiên La Lôi Cấm** | `thien_la_loi_cam` | Nguyên Anh | Địa | Vùng đặt xuống đất | 4,5s | Dấu Lôi 6s (chiêu cùng hệ đánh vào sẽ ăn combo), xác suất 80% | Rơi từ Phong Nha 0,6% |
| **Chưởng Tâm Lôi Bạo** | `chuong_tam_loi_bao` | Nguyên Anh | Địa | Quạt trước mặt | 5s | — | Rơi từ Phong Nha 0,6% |

### Âm (7 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Thực Hồn Nhất Chỉ** | `thuc_hon_nhat_chi` | Luyện Khí | Hoàng | Quạt trước mặt | 3s | — | Bán ở Hà lão, Mạc Thông (80 Linh thạch) |
| **Minh Ảnh Phúc Chưởng** | `minh_anh_phuc_chuong` | Trúc Cơ | Huyền | Quạt trước mặt | 3s | Suy Yếu 4,5s (gây ít hơn 25% sát thương, trùm chỉ chịu một nửa), xác suất 60% | Rơi từ Hắc Hổ 0,35% |
| **Tịch Dạ Phân Ảnh** | `tich_da_phan_anh` | Trúc Cơ | Huyền | Toả nhiều tia | 3s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Hắc Hổ 0,35% |
| **Thực Phách Âm Trảo** | `thuc_phat_am_trao` | Kim Đan | Huyền | Quạt trước mặt | 5s | — | Rơi từ Sương Hồ 0,5% |
| **Hồn Phiên Tượng** | `hon_phien_tuong` | Nguyên Anh | Địa | Tượng triệu hồi | 12s | Suy Yếu 4,5s (gây ít hơn 15% sát thương, trùm chỉ chịu một nửa), xác suất 50% | Rơi từ Hàn Lang 0,6% |
| **Khô Mạch Đoạn Lưu** | `kho_mach_dan_luu` | Nguyên Anh | Địa | Quạt trước mặt | 5s | Độc 4,5s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Hàn Lang 0,5% |
| **Minh Vũ Lạc Hồn** | `minh_vu_lac_hon` | Nguyên Anh | Địa | Toả nhiều tia | 5s | Chảy máu 3s (25% sát thương gốc mỗi giây), xác suất 50% | Rơi từ Hàn Lang 0,6% |

### Vô sắc (8 chiêu)

| Chiêu | ID | Cảnh giới | Phẩm | Hình | Hồi chiêu | Hiệu ứng | Cách có được |
|---|---|---|---|---|---|---|---|
| **Huyết Ảnh Xuyên Tâm** | `huyet_anh_xuyen_tam` | Luyện Khí | Hoàng | Tia thẳng | 3s | Chảy máu 3s (20% sát thương gốc mỗi giây), xác suất 50% | Bán ở Hà lão, Mạc Thông (70 Linh thạch) |
| **Sư Tử Hống** | `su_tu_hong` | Trúc Cơ | Huyền | Quạt trước mặt | 4,5s | Choáng 0,75s, xác suất 60% | Rơi từ Xích Mãng 0,6% |
| **Cầm Long Khấu** | `cam_long_khau` | Trúc Cơ | Huyền | Quạt trước mặt | 5s | Choáng 0,75s, xác suất 65%; Vỡ giáp 3s (nhận thêm 10% sát thương), xác suất 50% | Rơi từ Xích Mãng 0,6% |
| **Huyết Trảo Phá Mạch** | `huyet_trao_pha_mach` | Kim Đan | Huyền | Quạt trước mặt | 5s | Chảy máu 3s (25% sát thương gốc mỗi giây), xác suất 60% | Rơi từ Độc Thiềm 0,6% |
| **Hóa Huyết Phệ Nguyên** | `hoa_huyet_phe_nguyen` | Kim Đan | Huyền | Quạt trước mặt | 5s | Chảy máu 4,5s (30% sát thương gốc mỗi giây), xác suất 70% | Rơi từ Độc Thiềm 0,5% |
| **Bạch Cốt Hồng Nhan** | `bach_cot_hong_nhan` | Nguyên Anh | Địa | Quạt trước mặt | 9s | Choáng 0,75s, xác suất 65% | Rơi từ Phong Nha 0,6% |
| **Nhiếp Hồn Đoạt Phách** | `niep_hon_doat_phat` | Nguyên Anh | Địa | Quạt trước mặt | 9s | Choáng 0,9s, xác suất 70% | Rơi từ Độc Tước 0,6% |
| **Long Tượng Hộ Thể** | `long_tuong_ho_the` | Nguyên Anh | Địa | Hộ thể quanh mình | 7s | Hộ thể 6s (chắn 30% khí huyết tối đa), cho bản thân | Rơi từ Cốt Tượng 0,6% |


## Mục 2 — Ma trận độ phủ: hệ × cảnh giới

> Số chiêu của mỗi hệ ở mỗi cảnh giới yêu cầu. Ô trống (–) là hệ chưa có chiêu nào đòi cảnh giới đó — dùng để chọn lô chiêu kế tiếp.

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

> Cột Phàm Nhân: chưa có chiêu nào đòi cảnh giới này.

## Mục 3 — Chiêu "mồ côi" (không bán, không rơi, không đổi ở tông môn, không là thưởng nhiệm vụ)

Hiện **KHÔNG có**: mọi chiêu đều có ít nhất một nguồn (cửa hàng, quái rơi, tông môn hoặc thưởng nhiệm vụ). Thêm chiêu mà không gắn nơi có được thì dòng sẽ hiện ở đây.
