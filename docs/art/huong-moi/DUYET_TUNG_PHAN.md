# Bảng duyệt đồ hoạ TỪNG PHẦN (QUYET_DINH_M3 mục 67.2 / 69, issue #1330)

> Người dùng duyệt theo MÃ, ví dụ: "duyệt NV-01 phương án B, Q-02 phương án A, giữ nguyên T-03, bỏ NPC-04". **Chỉ thay những mã đã duyệt**; mã không nhắc tới giữ nguyên hình hiện tại. Người soạn: Dev B (nhóm 10-13 đã xong; 14-16 đang làm cùng Dev G).
> Phần CẢNH (đất, cỏ, cây, nước, bờ, vách) đã được duyệt riêng ở mục 67.1 và đang làm (PR #1332), không nằm trong bảng này.

## Cách xem

Mỗi nhóm một **tờ ảnh ghép** (nền tối): mỗi hàng một mã; cột đầu là hình HIỆN TẠI của game, ba cột A / B / C là phương án lấy từ các gói đã có trên máy. **Mọi hình đã được thu / phóng về xấp xỉ CỠ TRONG GAME rồi phóng thêm 3 lần nguyên số** để so cùng một thước; chữ `xN` dưới hình là hệ số thu phóng đã dùng (`x0,4` = gói to gấp hơn hai lần cỡ game nên bị thu nhỏ, chi tiết thật sẽ MỊN hơn bản gói; `x2` = gói 16 px phóng gấp đôi, điểm ảnh to hơn nhân vật hiện tại). Ô ghi "KHÔNG CÓ trong các gói" = không nguồn nào có đối tượng đó: đề xuất tô màu / ghép / ảnh AI / giữ hiện tại.

| Nguồn | Giấy phép | Vào repo? | Góc nhìn / cỡ | Ghi chú |
|---|---|---|---|---|
| Hiện tại | của nhóm (vẽ bằng mã) | có | top-down 4 hướng, 32 px | atlas `client/public/assets/atlas.png` |
| Ninja Adventure | CC0 | **có** | top-down 4 hướng, 16 px | bản clone GitHub chỉ có 3 nhân vật + 1 heo + 5 tileset |
| Xianxia Pixel Pack 2.1 (willYEE) | CC0 1.0 | **có** | **NHÌN NGANG** (game cuộn ngang), sprite 80-380 px | 25+ nhân vật / quái / trùm, 36 chân dung NPC, 40 hiệu ứng (đơn sắc, tô màu được), UI, biểu tượng vũ khí |
| Wuxia RTS Pixel Lite (DQYYY) | thương mại OK; **cấm phân phối lại, cấm huấn luyện AI** | **KHÔNG** | top-down **8 hướng**, 156x180 | chỉ 5 đơn vị (Swordsman, Bandit, Farmer, Herbalist, Tiger) + 1 hiệu ứng chém |
| Sunnyside World Free 2.1 | thương mại OK; **cấm đóng gói lại, cấm huấn luyện AI** | **KHÔNG** | nhìn ngang, 16 px | nhân vật nông trại, thú nuôi, UI |
| Cainos Top Down Basic | thương mại OK; cấm phân phối lại | **KHÔNG** | top-down, 32 px | chỉ cảnh vật / vật trang trí (không nhân vật), nên không xuất hiện ở nhóm 10-13 |

**Tờ công khai** (`docs/art/huong-moi/NN-....png`, vào repo) chỉ chứa hình HIỆN TẠI + gói CC0; ô của gói cấm phân phối lại chỉ là khung trống ghi "xem tờ riêng". **Tờ đầy đủ** (có hình gói riêng) ở `/mnt/data/assets-private/preview/NN-...-day-du.png`, KHÔNG lên GitHub, Claude điều phối chép về máy người dùng. Tạo lại bằng `python3 -I client/scripts/art/dung-bang-duyet.py --groups 10,11,12,13` (nguồn ở `/mnt/data`).

**Điều cần cân nhắc khi chọn (B nhận xét thẳng, không thay người dùng quyết):**
- **Phong cách thống nhất.** Hiện tại là pixel nhỏ 32 px kiểu "đồ chơi". Xianxia là pixel **chi tiết cao** kiểu minh hoạ (sprite to hơn 2-4 lần cỡ game): rất đẹp và rất tu tiên, nhưng KHÁC mật độ điểm ảnh với nền Ninja Adventure 16 px đã duyệt; thu về cỡ game sẽ mịn hơn nền. Wuxia Lite (top-down 8 hướng, vẽ tay) hợp góc nhìn nhất nhưng chỉ có 5 đơn vị và bị cấm phân phối lại. Ninja Adventure hợp nền nhất nhưng đầu to, khó đọc cảnh giới.
- **Góc nhìn.** Game là top-down 4 hướng. Nhân vật / quái Xianxia chỉ NHÌN NGANG (trái / phải, lật gương): dùng làm thân trên bản đồ thì khi đi lên / xuống vẫn quay ngang (nhiều game top-down chấp nhận). Chân dung NPC của Xianxia thì dùng ngay không vướng góc nhìn.
- **Chân dung và thân độc lập.** NPC có hai thứ: chân dung ở hộp thoại (gói tải theo nhu cầu `art:npc`, đã có đường ống) và thân đứng trên bản đồ; duyệt riêng từng thứ.

**Nhóm 15 (hiệu ứng chiêu) khác các nhóm trước ở ba điểm:**
- Hiệu ứng của Xianxia là ĐƠN SẮC (trắng -> xám đậm) có chủ ý: README của gói khuyên nhân một màu lúc chạy để ra mọi hệ từ MỘT hiệu ứng. Màu trên tờ ảnh (theo hệ của chiêu) chỉ để XEM; màu thật do `FX` của game chốt.
- Mỗi hiệu ứng có 8-24 khung và một `anchor` (`left`: tia bắn từ tay, `bottom`: đặt dưới chân, `center`); tờ ảnh chỉ hiện 3 khung quanh đỉnh (25 / 50 / 75 %).
- Mười tờ, mỗi HỆ một tờ (Kim, Mộc, Thủy, Hỏa, Thổ, Băng, Phong, Lôi, Âm, Vô sắc). Cột A = hiệu ứng hợp HÌNH chiêu (tia, quạt, vòng, bay...), B = hiệu ứng đặc trưng của HỆ (sen cho Mộc, phượng hoàng cho Hỏa, lôi kiếp cho Lôi...), C = vệt chém Wuxia Lite (gói riêng, chỉ cho chiêu chém / tia / lao). Cột "hiện tại" là icon kinh quyển (hiệu ứng hiện tại vẽ bằng mã, không có tệp ảnh để so).

<!-- NHOM 10 -->
## Nhóm 10 — Người chơi (NV)

Tờ ảnh: `10-nguoi-choi.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/10-nguoi-choi-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| NV-01 | Người chơi (nam), đứng | đạo sĩ áo trắng 32x40 | Ninja Adventure (CC0); top-down 4 hướng, 16 px; samurai (đạo bào Luyện Khí) 16 px | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; Swordsman, 8 hướng, 156x180 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); swordsman NHÌN NGANG | B (thân top-down 8 hướng) hoặc A |
| NV-02 | Người chơi (nữ), đứng | chưa có nhân vật nữ | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); heroine NHÌN NGANG | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); nhìn ngang, 16 px; Human tóc dài 16 px, nhìn ngang | — | C cho chân dung; thân cần tô lại |
| NV-03 | Áo theo trang bị (3 bộ áo hiện có) | thổ nhung / hắc hổ / xích lân | Ninja Adventure (CC0); top-down 4 hướng, 16 px; samurai đổi màu vải (3 bộ) | — | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); swordsman v_black / v_green / v_red | A (đổi màu áo theo bộ) |
| NV-04 | Chém (hoạt ảnh đánh) | 3 khung chém xuống | Ninja Adventure (CC0); top-down 4 hướng, 16 px; 1 khung chém / hướng (4 hướng) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; Attack_South 4 khung | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); attack (nhìn ngang) | B (4 khung mỗi hướng) hoặc giữ hiện tại |

<!-- /NHOM 10 -->

<!-- NHOM 11 -->
## Nhóm 11 — NPC (NPC): chân dung hộp thoại (A) và thân trên bản đồ (B) chọn ĐỘC LẬP

Tờ ảnh: `11-npc.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/11-npc-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| NPC-01 | Lâm Thanh Tùng — Trưởng trấn | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'elder' (hộp thoại) | — | — | A cho chân dung |
| NPC-02 | Hà lão — Lão dược sư | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'herbalist' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Herbalist (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-03 | Thiết Ngưu — Thợ rèn | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'blacksmith' (hộp thoại) | — | — | A cho chân dung |
| NPC-04 | Bảng cáo thị — Việc trong ngày | hiện tại 36x42 | — | — | — | giữ hiện tại (vật trang trí) |
| NPC-05 | Mạc Thông — Lái buôn Thanh Lộ | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'peddler' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Farmer (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-06 | Lôi Báo — Trạm úy Thanh Lộ | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'constable' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Swordsman (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-07 | Tống Vân Hạc — Trạm trưởng Vọng Sương | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'general' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Swordsman (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-08 | Phó Quang — Lái buôn Vọng Sương | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'peddler' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Farmer (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-09 | Hồ Thiết — Thợ rèn Vọng Sương | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'blacksmith' (hộp thoại) | — | — | A cho chân dung |
| NPC-10 | Thôi Tuyết Phong — Trạm trưởng Hàn Vân | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'general' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Swordsman (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-11 | Kỳ Thiên Lộc — Lái buôn Hàn Vân | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'peddler' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Farmer (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-12 | Lô Băng Thiết — Thợ rèn Hàn Vân | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'blacksmith' (hộp thoại) | — | — | A cho chân dung |
| NPC-13 | Huyền Cơ — Thủ môn bí cảnh | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'taoist' (hộp thoại) | — | — | A cho chân dung |
| NPC-14 | Mộc Diên — Lão đan sư | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'alchemist' (hộp thoại) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; thân Herbalist (bản đồ) | — | A cho chân dung + B cho thân |
| NPC-15 | Tô Linh Ấn — Lão phù sư | hiện tại 36x42 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); chân dung 'fortune' (hộp thoại) | — | — | A cho chân dung |

<!-- /NHOM 11 -->

<!-- NHOM 12 -->
## Nhóm 12 — Quái thường (Q)

Tờ ảnh: `12-quai.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/12-quai-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| Q-01 | Linh Thố | hiện tại 32x32 | — | — | — | KHÔNG nguồn nào có: giữ hiện tại / ảnh AI |
| Q-02 | Hôi Lang | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_wolf NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-03 | Hắc Hổ | hiện tại 32x32 | — | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; Tiger top-down | — | B |
| Q-04 | Sương Hồ | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_foxdemon NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-05 | Thạch Quy | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_golem NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-06 | Độc Thiềm | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_toad NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-07 | Hàn Lang | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_wolf NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-08 | Phong Nha | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_bat NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-09 | Cốt Tượng | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_skeleton NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-10 | Độc Tước | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_thunderbird NHÌN NGANG | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); nhìn ngang, 16 px; Sunnyside, 16 px | — | A (tô màu theo hệ nếu cần) |
| Q-11 | Rắn Con | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_snake NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |
| Q-12 | Phân Thân Yêu Vương | hiện tại 32x32 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); mob_ghost NHÌN NGANG | — | — | A (tô màu theo hệ nếu cần) |

<!-- /NHOM 12 -->

<!-- NHOM 13 -->
## Nhóm 13 — Trùm (T): thẻ trùm bằng ảnh AI SDXL giữ nguyên, đây chỉ là THÂN trên bản đồ

Tờ ảnh: `13-trum.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/13-trum-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| T-01 | Xích Mãng | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); rắn thường PHÓNG LỚN + TÔ ĐỎ (gói không có trăn) | — | — | A (cần xem kỹ) / ảnh AI |
| T-02 | Hắc Giao | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss jiaolong (giao long) | — | — | A |
| T-03 | Thiên Hàn Vương | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss fallenimmortal (tiên sa ngã) | — | — | A (cần xem kỹ) / ảnh AI |
| T-04 | Linh Hư Yêu Vương | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss ninetail (cửu vĩ hồ) | — | — | A |

<!-- /NHOM 13 -->

<!-- NHOM 14 -->
## Nhóm 14 — Vật phẩm (VP), đan dược / phù: VP-001 .. VP-019

Tờ ảnh: `14-vat-pham-dan-phu.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-dan-phu-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-001 | Hồi Huyết Đan | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-002 | Hồi Linh Đan | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-003 | Tụ Khí Đan | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-004 | Đại Hồi Huyết Đan | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-005 | Đại Hồi Linh Đan | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-006 | Thượng Hồi Huyết Đan | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-007 | Thượng Hồi Linh Đan | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-008 | Đột Phá Đan | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-009 | Kinh Chỉ Đan | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-010 | Dưỡng Anh Đan | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bình đan (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: hồ lô (CC0) | — | A (bình đan) |
| VP-011 | Hỏa Đạn Phù | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-012 | Cuồng Huyết Phù | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-013 | Phi Châm Phù | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-014 | Toái Giáp Phù | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-015 | Liệt Diễm Phù | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-016 | Lôi Nộ Phù | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-017 | Tam Muội Hỏa Phù | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-018 | Kim Lân Độc Phù | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |
| VP-019 | Tốc Phong Phù | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | — | A (bùa) |

## Nhóm 14 — Vật phẩm (VP), kinh quyển (tờ 1/2): VP-020 .. VP-048

Tờ ảnh: `14-vat-pham-kinh-quyen-1.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-kinh-quyen-1-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-020 | Hỏa Vân Kiếm Pháp | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-021 | Bôn Thạch Quyền | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-022 | Ưng Trảo Công | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-023 | Trọng Nhạc Kiếm Pháp | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-024 | Huyền Băng Chỉ | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-025 | Kim Chung Tráo | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-026 | Bích Thủy Hồi Xuân Thuật | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-027 | Phiêu Phong Bộ | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-028 | Thanh Tùng Châm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-029 | Lạc Tuyết Kiếm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-030 | Cửu Cung Trận Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-031 | Mê Tung Bộ | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-032 | Hàn Quang Tiễn Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-033 | Bạch Kim Trảo | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-034 | Vân Thạch Trận Pháp | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-035 | Băng Hoa Loạn Quyết | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-036 | Liệt Hỏa Kiếm Quyết | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-037 | Vân Hành Bộ | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-038 | Thanh Vân Kiếm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-039 | Bàn Thạch Hộ Thể Công | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-040 | Thu Thủy Kiếm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-041 | Liệt Địa Quyền | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-042 | Phân Nhạc Kiếm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-043 | Thanh Vân Vạn Kiếm Quyết | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-044 | Phi Thoa Thuật | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-045 | Thực Giáp Tán | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-046 | Thiết Sa Chưởng | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-047 | Ngũ Chướng Huyền Công | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-048 | Hủ Thủy Chưởng | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |

## Nhóm 14 — Vật phẩm (VP), kinh quyển (tờ 2/2): VP-049 .. VP-076

Tờ ảnh: `14-vat-pham-kinh-quyen-2.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-kinh-quyen-2-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-049 | Triền Xà Thủ | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-050 | Hắc Sa Độc Chưởng | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-051 | Thi Độc Âm Chưởng | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-052 | Thiềm Tô Công | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-053 | Đoạn Trường Chỉ Pháp | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-054 | Khô Mộc Phùng Xuân Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-055 | Liệt Diễm Chưởng | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-056 | Xích Tước Phù Lục | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-057 | Phượng Cầu Hoàng Quyết | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-058 | Hàn Băng Chưởng | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-059 | Minh Ảnh Chưởng | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-060 | Điện Mâu Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-061 | Hồi Phong Chưởng | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-062 | Thiên La Lôi Trận | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-063 | Chưởng Tâm Lôi | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-064 | Vạn Thú Triều Phong | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-065 | Minh Vũ Kiếm Quyết | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-066 | Huyết Ảnh Chỉ | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-067 | Sư Tử Hống | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-068 | Cầm Long Thủ | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-069 | Hóa Huyết Đại Pháp | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-070 | Long Tượng Bá Thể | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-071 | Độc Đằng Phục Kinh | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-072 | Tam Liên Kiếm Quyết | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-073 | Liệt Diễm Trận Đồ | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-074 | Liên Châu Lôi Kinh | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-075 | Hồn Phiên Trận Kinh | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |
| VP-076 | Phá Sơn Quyền Kinh | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: ngọc giản (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: sách phép (CC0) | — | giữ hiện tại (ấn riêng mỗi quyển, #1303); A / B giống nhau cho cả 57 quyển nên chỉ hợp làm bìa chung |

## Nhóm 14 — Vật phẩm (VP), trang bị (tờ 1/2): VP-077 .. VP-095

Tờ ảnh: `14-vat-pham-trang-bi-1.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-trang-bi-1-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-077 | Lang Nha Kiếm | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 0 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-078 | Lang Nha Phù | hiện tại (Phàm phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 0 (CC0) | — | A (bùa) |
| VP-079 | Thố Nhung Bào | hiện tại (Phàm phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-080 | Hắc Hổ Bào | hiện tại (Linh phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-081 | Hắc Hổ Kiếm | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 1 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-082 | Hổ Bộ Ngoa | hiện tại (Linh phẩm) | — | — | — | KHÔNG nguồn nào có giày: giữ hiện tại |
| VP-083 | Hổ Hồn Phù | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 1 (CC0) | — | A (bùa) |
| VP-084 | Thố Nguyệt Bội | hiện tại (Linh phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-085 | Mãng Hành Ngoa | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có giày: giữ hiện tại |
| VP-086 | Mãng Tinh Bội | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-087 | Mãng Đảm Phù | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 2 (CC0) | — | A (bùa) |
| VP-088 | Xích Lân Bào | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-089 | Xích Mãng Kiếm | hiện tại (Bảo phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 2 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-090 | Huyền Quy Kiếm | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 3 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-091 | Hàn Băng Ấn | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 1, phẩm 3 (CC0) | — | A (6 phẩm tăng dần) |
| VP-092 | Hấp Linh Châu | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 1, phẩm 3 (CC0) | — | A (6 phẩm tăng dần) |
| VP-093 | Hồ Tâm Phù | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | — | A (bùa) |
| VP-094 | Hộ Thân Ấn | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 1, phẩm 3 (CC0) | — | A (6 phẩm tăng dần) |
| VP-095 | Quy Giáp Bào | hiện tại (Tiên phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |

## Nhóm 14 — Vật phẩm (VP), trang bị (tờ 2/2): VP-096 .. VP-113

Tờ ảnh: `14-vat-pham-trang-bi-2.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-trang-bi-2-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-096 | Quy Tức Phù | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | — | A (bùa) |
| VP-097 | Sương Hồ Bào | hiện tại (Tiên phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-098 | Sương Linh Bội | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-099 | Sương Vân Ngoa | hiện tại (Tiên phẩm) | — | — | — | KHÔNG nguồn nào có giày: giữ hiện tại |
| VP-100 | Sương Vũ Kiếm | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 3 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-101 | Xích Diễm Ấn | hiện tại (Tiên phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 3 (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 1, phẩm 3 (CC0) | — | A (6 phẩm tăng dần) |
| VP-102 | Giao Châu Bội | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-103 | Giao Long Phù | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 4 (CC0) | — | A (bùa) |
| VP-104 | Giao Lân Bào | hiện tại (Thần phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-105 | Giao Ảnh Ngoa | hiện tại (Thần phẩm) | — | — | — | KHÔNG nguồn nào có giày: giữ hiện tại |
| VP-106 | Hàn Lang Bào | hiện tại (Thần phẩm) | — | — | — | KHÔNG nguồn nào có áo: giữ hiện tại |
| VP-107 | Hàn Tinh Bội | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-108 | Hàn Vũ Kiếm | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 4 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-109 | Hắc Giao Kiếm | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia kiếm / đao, phẩm 4 (CC0) | Ninja Adventure (CC0); top-down 4 hướng, 16 px; Ninja: đại kiếm (CC0) | — | A (6 phẩm tăng dần) |
| VP-110 | Phong Hành Bội | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: lệnh bài (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: chuỗi hạt (CC0) | — | giữ hiện tại; A nếu muốn lệnh bài |
| VP-111 | Phong Nha Phù | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: bùa (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 4 (CC0) | — | A (bùa) |
| VP-112 | Tuyết Hành Ngoa | hiện tại (Thần phẩm) | — | — | — | KHÔNG nguồn nào có giày: giữ hiện tại |
| VP-113 | Định Tâm Chung | hiện tại (Thần phẩm) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 2, phẩm 4 (CC0) | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); Xianxia: pháp khí loại 1, phẩm 4 (CC0) | — | A (6 phẩm tăng dần) |

## Nhóm 14 — Vật phẩm (VP), nguyên liệu: VP-114 .. VP-126

Tờ ảnh: `14-vat-pham-nguyen-lieu.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/14-vat-pham-nguyen-lieu-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| VP-114 | Lông thỏ | hiện tại (Phàm phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-115 | Nanh sói | hiện tại (Phàm phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-116 | Da hổ | hiện tại (Linh phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-117 | Vảy mãng | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-118 | Sương mao | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-119 | Quy giáp | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-120 | Độc nang | hiện tại (Tiên phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-121 | Giao lân | hiện tại (Tiên phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-122 | Hàn Lang mao | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-123 | Phong Nha vũ | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-124 | Tượng cốt | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-125 | Độc tước nang | hiện tại (Bảo phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |
| VP-126 | Thiên Hàn châu | hiện tại (Thần phẩm) | — | — | — | KHÔNG nguồn nào có: giữ hiện tại |

<!-- /NHOM 14 -->

<!-- NHOM 15 -->
## Nhóm 15 — Hiệu ứng chiêu, hệ Kim (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-kim.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-kim-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-01 | Ưng Trảo (Kim, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-02 | Kim Chung Tráo (Kim, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-03 | Bạch Kim Trảo (Kim, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-04 | Thanh Vân Kiếm Khí (Kim, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-05 | Thu Thủy Kiếm Ảnh (Kim, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-06 | Vạn Kiếm Quy Tông (Kim, fan) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_rain (theo hình 'fan') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-07 | Kim Thoa Xuyên Tâm (Kim, bolt) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'bolt') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-08 | Thực Giáp Phi Tán (Kim, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-09 | Phi Kiếm Tam Liên (Kim, bolt) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'bolt') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Mộc (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-moc.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-moc-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-10 | Thanh Tùng Phi Châm (Mộc, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-11 | Triền Xà Tỏa Hầu (Mộc, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-12 | Hắc Sa Chưởng (Mộc, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-13 | Thiềm Tô Liệu Thương (Mộc, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-14 | Đoạn Trường Chỉ (Mộc, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-15 | Khô Mộc Phùng Xuân (Mộc, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-16 | Độc Đằng Phục (Mộc, trap) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); talisman (theo hình 'trap') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); lotus (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Thủy (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-thuy.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-thuy-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-17 | Hồi Xuân (Thủy, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bgan_waterfall (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-18 | Hủ Thủy Kình (Thủy, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bgan_waterfall (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-19 | Âm Thi Độc Chưởng (Thủy, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bgan_waterfall (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Hỏa (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-hoa.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-hoa-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-20 | Hỏa Vân Kiếm (Hỏa, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-21 | Liệt Hỏa Kiếm (Hỏa, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-22 | Liệt Diễm Chưởng (Hỏa, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-23 | Xích Tước Phù (Hỏa, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-24 | Phượng Minh Cầu Hoàng (Hỏa, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-25 | Liệt Diễm Trận (Hỏa, zone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); array_seal (theo hình 'zone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); phoenix (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Thổ (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-tho.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-tho-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-26 | Bôn Thạch Quyền (Thổ, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-27 | Trọng Nhạc Trảm (Thổ, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-28 | Cửu Cung Khốn Sát (Thổ, ground) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); star_array (theo hình 'ground') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-29 | Vân Thạch Trận (Thổ, ground) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); star_array (theo hình 'ground') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-30 | Bàn Thạch Hộ Thể (Thổ, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-31 | Liệt Địa Nhất Quyền (Thổ, ground) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); star_array (theo hình 'ground') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-32 | Phân Nhạc Trảm (Thổ, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-33 | Thiết Sa Chưởng (Thổ, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-34 | Chướng Vụ Phong Lâm (Thổ, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-35 | Phá Sơn Nhất Kích (Thổ, ground) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); star_array (theo hình 'ground') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); stone_spike (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Băng (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-bang.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-bang-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-36 | Huyền Băng Chỉ (Băng, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); frost_shard (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-37 | Lạc Tuyết Phân Phi (Băng, fan) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_rain (theo hình 'fan') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); frost_shard (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-38 | Hàn Quang Tiễn (Băng, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); frost_shard (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-39 | Băng Hoa Loạn (Băng, fan) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_rain (theo hình 'fan') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); frost_shard (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-40 | Hàn Băng Nhất Chưởng (Băng, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); frost_shard (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Phong (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-phong.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-phong-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-41 | Phiêu Phong Bộ (Phong, dash) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); flying_sword (theo hình 'dash') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); gale_vortex (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-42 | Mê Tung Bộ (Phong, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); gale_vortex (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-43 | Vân Hành Bộ (Phong, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); gale_vortex (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-44 | Hồi Phong Liên Chưởng (Phong, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); gale_vortex (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-45 | Bách Thú Khiếu Phong (Phong, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); gale_vortex (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Lôi (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-loi.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-loi-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-46 | Lôi Đình Nhất Miết (Lôi, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); tribulation (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-47 | Thiên La Lôi Cấm (Lôi, ground) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); star_array (theo hình 'ground') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); tribulation (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-48 | Chưởng Tâm Lôi Bạo (Lôi, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); tribulation (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-49 | Liên Châu Lôi (Lôi, chain) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_rain (theo hình 'chain') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); tribulation (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Âm (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-am.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-am-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-50 | Minh Ảnh Phúc Chưởng (Âm, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); soul_wisp (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-51 | Minh Vũ Lạc Hồn (Âm, fan) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_rain (theo hình 'fan') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); soul_wisp (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-52 | Hồn Phiên Tượng (Âm, totem) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); array_seal (theo hình 'totem') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); soul_wisp (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

## Nhóm 15 — Hiệu ứng chiêu, hệ Vô sắc (HU) — hiệu ứng Xianxia ĐƠN SẮC đã tô màu hệ

Tờ ảnh: `15-hieu-ung-chieu-none.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/15-hieu-ung-chieu-none-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| HU-53 | Huyết Ảnh Xuyên Tâm (Vô sắc, line) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); sword_qi (theo hình 'line') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); taiji (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-54 | Sư Tử Hống (Vô sắc, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); taiji (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-55 | Cầm Long Khấu (Vô sắc, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); taiji (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-56 | Hóa Huyết Phệ Nguyên (Vô sắc, cone) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); moon_arc (theo hình 'cone') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); taiji (theo hệ) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; vệt chém Blade_Slash (64 px) | A (hợp hình); B nếu muốn nét riêng của hệ |
| HU-57 | Long Tượng Hộ Thể (Vô sắc, self) | icon kinh quyển; hiệu ứng vẽ bằng mã | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); bell_ward (theo hình 'self') | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); taiji (theo hệ) | — | A (hợp hình); B nếu muốn nét riêng của hệ |

<!-- /NHOM 15 -->

<!-- NHOM 16 -->
## Nhóm 16 — Giao diện (UI): khung, nút, thanh, ô, con trỏ, đường kẻ, ô kiểm, nút tròn, huy hiệu

Tờ ảnh: `16-giao-dien.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/16-giao-dien-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| UI-01 | Khung bảng (hộp thoại, túi, nhân vật...) | hộp 'Đạo Thể' hiện tại (CSS), góc trên trái 150x84 | Xianxia Pixel Pack (willYEE) (CC0); panel_01 mực / ngọc / gỗ hồng / lụa (9-slice, biên của gói) | Ninja Adventure (CC0); theme_1 nine_path_panel / nine_path_bg ×3 | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); 9slice_box dt / lt ×3 | giữ hiện tại (đọc tốt); A nếu muốn khung mực / ngọc kiểu tiên hiệp |
| UI-02 | Nút bấm (thường / chạm / nhấn) | HUD 'Nhiệm vụ' (thường) + 'Nhân vật' (đang mở) | Xianxia Pixel Pack (willYEE) (CC0); button_01 ngọc / lụa x thường / chạm / nhấn | Ninja Adventure (CC0); theme_1 button thường / chạm / nhấn ×3 | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); label_left + middle + right ×3 (nhãn, không có trạng thái) | giữ hiện tại; A (ngọc) nếu muốn nút kiểu tiên hiệp |
| UI-03 | Thanh khí huyết / linh lực / tu vi | HUD hiện tại: ba thanh 244 px (đỏ / xanh / vàng) có chữ | Xianxia Pixel Pack (willYEE) (CC0); bar_01 frame + hp / mp / spirit (phủ 72 %), thu về 244 px | Ninja Adventure (CC0); system/ui/life_bar + bg ×3 (chỉ có thanh ĐỎ; phủ 100 / 60 / 25 %) | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); redbar / bluebar / greenbar mức 0 / 3 / cuối ×3 | giữ hiện tại (chữ số nằm ngay trên thanh); chỉ đổi nếu chữ vẫn đọc được |
| UI-04 | Ô vật phẩm (túi, thanh dùng nhanh) | HUD: ô 'Hồi Huyết' (sáng) + 'Hồi Linh' (mờ), 54x54 | Xianxia Pixel Pack (willYEE) (CC0); panel_01 mực / ngọc thu 50 % làm ô 54x54 | Ninja Adventure (CC0); theme_1 panel / bg / bg_2 ×2 | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); itemdisc_01 / 02 (đĩa tròn) ×3 | giữ hiện tại; C nếu muốn ô tròn kiểu hộp đạo cụ |
| UI-05 | Con trỏ chuột (máy tính) | con trỏ hệ thống của trình duyệt (không vẽ riêng) | Xianxia Pixel Pack (willYEE) (CC0); cursor_sword / cursor_whisk (phất trần), thu về 32 px | — | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); cursor_01..05 + tay mở / nắm ×3 | A (kiếm) cho điểm nhấn; chỉ máy tính, không ảnh hưởng điện thoại |
| UI-06 | Đường kẻ phân cách + góc trang trí khung | đường kẻ dưới tiêu đề hộp 'Đạo Thể' (CSS, 1 px) | Xianxia Pixel Pack (willYEE) (CC0); divider_cloud / divider_jade / corner_tl (thu về 40 px) | — | — | A (mây / ngọc) nếu duyệt khung bảng A ở UI-01; không thì giữ hiện tại |
| UI-07 | Ô tích chọn + thanh trượt (Cài đặt) | Cài đặt: thanh trượt vàng + ô kiểm trắng | Xianxia Pixel Pack (willYEE) (CC0); slider_track + knob (70 %) + check_off / check_on, thu về cỡ hiện tại | Ninja Adventure (CC0); theme_1 unchecked / checked / grabber / slider_progress ×2 | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); confirm (✓) / cancel (✗) ×3 (dấu, không phải ô kiểm) | giữ hiện tại (ô kiểm HTML gốc: bàn phím và trình đọc màn hình dùng được) |
| UI-08 | Nút hành động tròn (Chém, Đột phá, Đả tọa, Kiếm khí) | HUD: bốn nút tròn 156x156 | — | Ninja Adventure (CC0); theme/nine_path_8 / 9 / 4 (tròn) ×4 | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); itemdisc_01 / 02 ×4 | giữ hiện tại (chữ Hán + nhãn Việt đã rõ trên mọi cỡ màn hình) |
| UI-09 | Huy hiệu trạng thái (Bỏng, Choáng, Tăng tốc...) | HUD: ô 'tên + số giây' (đỏ có hại, xanh có lợi) | Xianxia Pixel Pack (willYEE) (CC0); status_ bleed / burn / freeze / golden_shield / paralyze / poison / seal / swift (32 px) | — | — | A (biểu tượng) đứng cạnh số giây; giữ chữ cho trình đọc màn hình |

<!-- /NHOM 16 -->
