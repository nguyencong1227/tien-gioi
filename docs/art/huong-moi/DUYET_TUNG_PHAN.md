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

## Nhóm 10 — Người chơi (NV)

Tờ ảnh: `10-nguoi-choi.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/10-nguoi-choi-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| NV-01 | Người chơi (nam), đứng | đạo sĩ áo trắng 32x40 | Ninja Adventure (CC0); top-down 4 hướng, 16 px; samurai (đạo bào Luyện Khí) 16 px | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; Swordsman, 8 hướng, 156x180 | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); swordsman NHÌN NGANG | B (thân top-down 8 hướng) hoặc A |
| NV-02 | Người chơi (nữ), đứng | chưa có nhân vật nữ | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); heroine NHÌN NGANG | Sunnyside World Free (**gói riêng**, riêng: cấm đóng gói lại / huấn luyện AI); nhìn ngang, 16 px; Human tóc dài 16 px, nhìn ngang | — | C cho chân dung; thân cần tô lại |
| NV-03 | Áo theo trang bị (3 bộ áo hiện có) | thổ nhung / hắc hổ / xích lân | Ninja Adventure (CC0); top-down 4 hướng, 16 px; samurai đổi màu vải (3 bộ) | — | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); swordsman v_black / v_green / v_red | A (đổi màu áo theo bộ) |
| NV-04 | Chém (hoạt ảnh đánh) | 3 khung chém xuống | Ninja Adventure (CC0); top-down 4 hướng, 16 px; 1 khung chém / hướng (4 hướng) | Wuxia RTS Lite (DQYYY) (**gói riêng**, riêng: cấm phân phối lại / huấn luyện AI); top-down 8 hướng; Attack_South 4 khung | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); attack (nhìn ngang) | B (4 khung mỗi hướng) hoặc giữ hiện tại |

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

## Nhóm 13 — Trùm (T): thẻ trùm bằng ảnh AI SDXL giữ nguyên, đây chỉ là THÂN trên bản đồ

Tờ ảnh: `13-trum.png` (công khai: hiện tại + CC0) và `/mnt/data/assets-private/preview/13-trum-day-du.png` (đủ cả gói riêng, KHÔNG lên GitHub).

| Mã | Đối tượng | Hiện tại | A | B | C | Khuyến nghị |
|---|---|---|---|---|---|---|
| T-01 | Xích Mãng | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); rắn thường PHÓNG LỚN + TÔ ĐỎ (gói không có trăn) | — | — | A (cần xem kỹ) / ảnh AI |
| T-02 | Hắc Giao | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss jiaolong (giao long) | — | — | A |
| T-03 | Thiên Hàn Vương | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss fallenimmortal (tiên sa ngã) | — | — | A (cần xem kỹ) / ảnh AI |
| T-04 | Linh Hư Yêu Vương | hiện tại (thân) + thẻ ảnh AI | Xianxia Pixel Pack (willYEE) (CC0); NHÌN NGANG (2D cuộn ngang); boss ninetail (cửu vĩ hồ) | — | — | A |

## Nhóm 14, 15, 16 — ĐANG LÀM (B + G)

| Nhóm | Mã | Việc | Nguồn dự kiến |
|---|---|---|---|
| 14 vật phẩm | VP-xxx (126 món: đan, kinh quyển, trang bị theo phẩm, nguyên liệu) | tờ ảnh HIỆN TẠI đủ mã + phương án theo NHÓM kiểu biểu tượng | Xianxia (36 biểu tượng / vũ khí, CC0), Ninja Adventure (vũ khí, hũ, hòm), gói biểu tượng khác của mục 68 khi G kiểm xong giấy phép |
| 15 hiệu ứng chiêu | HU-xx (57 chiêu học được) | ghép từng chiêu với hiệu ứng theo hệ / loại (kiếm khí, bay kiếm, sen, phượng hoàng, lôi kiếp, bùa, băng...) | Xianxia `fx/` (40 hiệu ứng ĐƠN SẮC trắng-xám: tô màu theo hệ lúc chạy, có `anchor`), Wuxia Lite (1 chém), hạt của Ninja Adventure |
| 16 giao diện | UI-xx (khung bảng, nút, thanh, ô túi, con trỏ, đường kẻ) | HIỆN TẠI (DOM / CSS) với bộ UI các gói | Xianxia `ui/` (66 tệp, CC0), Ninja Adventure `theme_1` (đổi màu), Sunnyside UI (riêng) |

