# Khung số liệu Hóa Thần trở lên (Hóa Thần -> Độ Kiếp)

> Việc A1 (#1461) của mục 75 (`docs/COT_TRUYEN.md`). Mọi số dưới đây **tính sống từ `shared/`** (script nháp, không commit) bằng đúng hàm của game (`statsFor`, `expToNext`, `breakthroughChance`, `killExp`, mô hình `huntRate` của `server/src/balance/simulate.ts`). Mục đích: Dev D / E biết đủ số để soạn quái, trùm, đồ, chiêu cho sáu bản đồ mới mà không phải đoán; Dev A sửa nốt hai bảng cứng ở `shared/` (PR riêng, mục 6).

## 1. Kết luận ngắn

- **Công thức người chơi đã tổng quát tới Độ Kiếp**: `REALMS` có đủ mười cảnh giới, `expToNext` (từ Nguyên Anh gấp 6 lần cảnh giới trước), `statsFor` (máu x1,76-1,83 và công x1,71-1,81 mỗi cảnh giới), `breakthroughChance` (0,45 Hóa Thần, giảm 0,08 mỗi cảnh giới, sàn 0,15), `duyenPerStep` (x5 mỗi cảnh giới), `COIN_CAP` (999.999.999 Linh thạch), trường schema `exp` / `expMax` / `hp` / `maxHp` kiểu `number` (không tràn). **Không cần đổi công thức để chạy Hóa Thần.**
- **Cái còn thiếu là DỮ LIỆU và hai bảng cứng bậc <= 4** (mục 2): `SKILL_MULT_CAP` / kiểm `reqRealm`, `AMBUSH_FOE_LEVEL_CAP`.
- **Điều kiện để mô hình giữ được ~4,5 giờ mỗi cảnh giới: người chơi phải có ĐỒ CÙNG BẬC.** Quái Nguyên Anh được hiệu chỉnh khi người chơi mặc bộ IV (đồ cùng bậc chiếm ~29 % máu và công ở bậc đầu mỗi cảnh giới). Nếu đưa quái Hóa Thần vào mà chưa có bộ V thì mô hình báo "không loài nào săn được" ở Hóa Thần sơ kỳ (đã thử: vô hạn giờ). **Bộ V (đồ Hóa Thần) là việc phải có TRƯỚC khi mở bãi Hóa Thần**, cùng lúc với quái.

## 2. Kiểm kê: chỗ nào cứng bậc <= 4

| Chỗ | Tình trạng | Việc | Ai |
| --- | --- | --- | --- |
| `shared/src/skill-violations.ts` (`reqRealm > 4` bị từ chối "ngoài 0-4"; `SKILL_MULT_CAP` chỉ có 0-4) | **CỨNG**: chiêu Hóa Thần không qua `skillViolations` | thêm khung 5-9 (mục 5) | A (PR `shared/` riêng) |
| `shared/src/ambush.ts` (`AMBUSH_FOE_LEVEL_CAP` có 0-4; ghi rõ "cảnh giới chưa liệt kê không có bầy hợp lệ") | **CỨNG** có chủ ý: đòi khai trần trước khi thêm nội dung | thêm trần cấp 5-9 (mục 5) | A (cùng PR `shared/`) |
| `shared/src/book-drop-realm.test.ts` (`MONSTER_REALM`, chú thích bậc 0-4) | không cứng (bảng theo từng quái) nhưng **mỗi quái mới rơi sách phải thêm dòng** với bậc 5+ | thêm dòng khi D thêm quái; cập nhật chú thích trong AGENTS.md | D |
| `shared/src/items.ts` + `recipes.ts` (đồ cao nhất `reqRealm: 4`, công thức `NGUYEN_ANH_RECIPES`) | **THIẾU DỮ LIỆU**: mô hình dùng đồ Nguyên Anh cho mọi bậc sau | bộ V ... bộ IX (mục 4) + công thức rèn | D / E |
| `server/src/balance/simulate.ts` (`ASSUME.searchSec` theo id quái; mặc định 10 s nếu thiếu) | không cứng | thêm id quái mới khi hiệu chỉnh | D |
| `server/src/balance/*` (`kim-dan-*.ts`, `nguyen-anh-kinh-te.ts`...) | mỗi cảnh giới một tệp báo cáo riêng, `can-bang.ts` gọi từng cái | thêm báo cáo "Hóa Thần sau nội dung" khi có quái thật (`docs/CAN_BANG.md`) | A (khuôn) + D (số) |
| `shared/src/realms.ts` `speed: 150 + min(realm, 6) * 8` | tốc độ người chơi **dừng ở 198 từ Luyện Hư** (có chủ ý) | không đổi; đồ cao cấp không được thêm tốc độ vượt +28 (mục 4); quái không nhanh hơn ~200 | D |
| trường schema `exp` / `hp` kiểu `number`, `qty` `uint16`, `COIN_CAP` 999.999.999, `DUYEN_CAP` 1e9 | đủ | theo dõi Linh thạch (mục 3) | A |

## 3. Đường cong người chơi (số thật từ `shared/`, bậc đầu mỗi cảnh giới, không đồ)

| Cảnh giới | Máu | Công | Tốc độ | Thanh tu vi (bậc Sơ) | Xác suất đột phá |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nguyên Anh (đã có) | 2.261 | 197 | 182 | 288.000 | 0,53 |
| **Hóa Thần** | 4.063 | 346 | 190 | 1.728.000 | 0,45 |
| **Luyện Hư** | 7.247 | 601 | 198 | 10.368.000 | 0,37 |
| **Hợp Thể** | 12.847 | 1.038 | 198 | 62.208.000 | 0,29 |
| **Đại Thừa** | 22.653 | 1.785 | 198 | 373.248.000 | 0,21 |
| **Độ Kiếp** (đỉnh, không đột phá tiếp) | 39.757 | 3.054 | 198 | 2.239.488.000 | 0,15 |

**Giờ chơi solo ước tính mỗi cảnh giới** (mô hình `huntRate`: người chơi có đồ cùng bậc, săn bốn vai quái mẫu ở mục 4, không tính nhiệm vụ, có tính đột phá thất bại mất 30 % thanh): Nguyên Anh 4,4 giờ (bảng thật `docs/CAN_BANG.md` ghi 4,0), **Hóa Thần 4,6, Luyện Hư 4,9, Hợp Thể 5,2, Đại Thừa 5,8, Độ Kiếp 4,3** (đỉnh nên không có đột phá). Đại Thừa dài hơn vì xác suất đột phá còn 0,21: **đề xuất giữ nguyên** (tầng cuối cảnh giới cao khó đột phá là có chủ ý, mục 30 chỉ rút Nguyên Anh còn ~4 giờ). Tổng từ Hóa Thần tới đỉnh ~29 giờ solo; nếu người dùng muốn nhanh hơn thì chỉnh `REALM_EXP_MULT_AFTER` hoặc `breakthroughChance` (một chỗ), không chỉnh từng quái.

**Linh thạch:** thu nhập săn solo cùng vai (Sương Hồ của Kim Đan so với Hàn Lang của Nguyên Anh, `docs/CAN_BANG.md`) ~8,6-11 nghìn / giờ lên ~23,8-29 nghìn / giờ (x2,8). Nếu giữ nhịp x2,5-2,8 mỗi cảnh giới thì Độ Kiếp ~ vài triệu / giờ: còn xa `COIN_CAP`, nhưng **giá bán / mua, phí rèn và quỹ tông môn của bậc sau phải đặt theo cùng nhịp** (phí rèn bộ r ~ nửa thu nhập một cảnh giới, như bộ IV: 43.500 / ~85.000). Dev D soạn số theo khuôn `server/src/balance/nguyen-anh-kinh-te.ts`, A review.

## 4. Khung quái và đồ

### 4.1. Quái: suy từ năm vai mẫu Nguyên Anh

Công thức (đúng như đã làm cho Nguyên Anh ở `shared/src/game.ts`, chú thích M7.5b): với cảnh giới `r` và vai mẫu `m` (Hàn Lang, Phong Nha, Cốt Tượng, Độc Tước, Thiên Hàn Vương):

- `hp(r) = hp(m) x máuNgườiChơi(r, bậc 0) / máuNgườiChơi(4, bậc 0)`; `atk(r)` tương tự theo công người chơi; `exp(r) = exp(m) x 6^(r - 4)` (khớp thanh tu vi); `level(r) = level(m) + 3 x (r - 4)` (mỗi cảnh giới 3 bậc; `killExp` giảm tu vi khi người chơi vượt cấp quái quá `KILL_EXP_FREE_GAP`).
- `attackCd`, `speed`, `radius`, hành vi giữ nguyên vai (tốc độ quái không vượt ~200).
- Số suy ra chỉ là **điểm khởi đầu**: D chạy mô hình `huntRate` / `huntFight` ở cảnh giới đó và chỉnh để (a) mỗi vai an toàn ~30-50 % khí huyết mất / trận, (b) không bãi nào cho tu vi / giờ vượt ~1,5 lần bãi tốt nhất cùng bậc (mục tiêu của `docs/CAN_BANG.md`), (c) trùm cần đội 3-4 người như Thiên Hàn Vương.

| Vai (mẫu) | Cảnh giới | Máu | Công | Tu vi khi hạ | Cấp |
| --- | --- | ---: | ---: | ---: | ---: |
| Gồng lao (Hàn Lang) | Hóa Thần | 7.817 | 464 | 7.920 | 19 |
| | Luyện Hư | 13.943 | 805 | 47.520 | 22 |
| | Hợp Thể | 24.717 | 1.391 | 285.120 | 25 |
| | Đại Thừa | 43.583 | 2.392 | 1.710.720 | 28 |
| | Độ Kiếp | 76.490 | 4.093 | 10.264.320 | 31 |
| Bắn đạn (Phong Nha) | Hóa Thần | 7.547 | 543 | 9.120 | 20 |
| | Luyện Hư | 13.462 | 943 | 54.720 | 23 |
| | Hợp Thể | 23.864 | 1.628 | 328.320 | 26 |
| | Đại Thừa | 42.080 | 2.800 | 1.969.920 | 29 |
| | Độ Kiếp | 73.852 | 4.790 | 11.819.520 | 32 |
| Dày, đập đất (Cốt Tượng) | Hóa Thần | 31.807 | 216 | 15.480 | 20 |
| | Luyện Hư | 56.732 | 375 | 92.880 | 23 |
| | Hợp Thể | 100.571 | 648 | 557.280 | 26 |
| | Đại Thừa | 177.337 | 1.114 | 3.343.680 | 29 |
| | Độ Kiếp | 311.233 | 1.907 | 20.062.080 | 32 |
| Đòn nặng + độc (Độc Tước) | Hóa Thần | 12.669 | 899 | 16.560 | 21 |
| | Luyện Hư | 22.597 | 1.562 | 99.360 | 24 |
| | Hợp Thể | 40.058 | 2.698 | 596.160 | 27 |
| | Đại Thừa | 70.634 | 4.639 | 3.576.960 | 30 |
| | Độ Kiếp | 123.966 | 7.937 | 21.461.760 | 33 |
| Trùm (Thiên Hàn Vương) | Hóa Thần | 221.030 | 422 | 230.400 | 24 |
| | Luyện Hư | 394.242 | 732 | 1.382.400 | 27 |
| | Hợp Thể | 698.886 | 1.265 | 8.294.400 | 30 |
| | Đại Thừa | 1.232.339 | 2.175 | 49.766.400 | 33 |
| | Độ Kiếp | 2.162.809 | 3.721 | 298.598.400 | 36 |

Trùm sinh sẵn: **tối đa 6 mỗi bản đồ** (mục 56); tổng quái mỗi bản đồ dưới ~70 (`perf.test.ts`). Quái tinh anh (`systems/elite.ts`) và trùm thế giới nhân `hpMult` như hiện có.

### 4.2. Đồ cùng bậc (bộ V ... bộ IX)

Bộ I-IV đo được: kiếm +công, bào +máu, phù +mp và tốc độ, mỗi món ~28-29 % chỉ số gốc cùng ô ở bậc đầu cảnh giới. Bộ `r` theo cùng tỉ lệ (`công kiếm = 56 x công(r) / công(4)`, `máu bào = 650 x máu(r) / máu(4)`, `mp phù = 170 x mp(r) / mp(4)`):

| Bộ | Cảnh giới yêu cầu | Kiếm (công) | Bào (máu) | Phù (mp) | Phù (tốc độ) |
| --- | --- | ---: | ---: | ---: | ---: |
| IV (đã có) | Nguyên Anh | 56 | 650 | 170 | 28 |
| V | Hóa Thần | 98 | 1.168 | 262 | 28 |
| VI | Luyện Hư | 171 | 2.083 | 399 | 28 |
| VII | Hợp Thể | 295 | 3.693 | 605 | 28 |
| VIII | Đại Thừa | 507 | 6.512 | 911 | 28 |
| IX | Độ Kiếp | 868 | 11.429 | 1.368 | 28 |

**Tốc độ của phù giữ +28** ở mọi bộ (tốc độ người chơi đã dừng ở 198; thêm nữa làm lệch dự đoán di chuyển / va chạm ở `shared/`). Đồ ba ô riêng (hài, ngọc bội, pháp bảo) và đồ hiếm / quái rơi (như `han_bang_an`) theo khuôn bộ IV: D / E soạn, `STAT_CAPS` (bạo kích 40, giảm hồi chiêu 30, giảm sát thương 40) KHÔNG nới. Độ hiếm vẫn `Rarity` 0-4: đồ Hóa Thần trở lên dùng 4 (Thiên); bậc cao hơn nằm ở `reqRealm` và chỉ số, không thêm độ hiếm mới.

## 5. Khung chiêu và chặn đường (đề xuất, vào PR `shared/` ở mục 6)

**`SKILL_MULT_CAP`** (nay 0: 1,5 / 2; 1: 2,2 / 2,6; 2: 2,8 / 4; 3: 3,4 / 5; 4: 3,8 / 6). Người chơi đã mạnh thêm x1,75 mỗi cảnh giới nên hệ số chiêu chỉ cần nhích chậm (chiêu là "bao nhiêu lần công", DPS thật đã canh bằng `skills-dps.test.ts` 1,10-1,60 lần chỉ chém):

| `reqRealm` | `hit` | `total` |
| --- | ---: | ---: |
| 5 Hóa Thần | 4,1 | 7 |
| 6 Luyện Hư | 4,4 | 8 |
| 7 Hợp Thể | 4,6 | 9 |
| 8 Đại Thừa | 4,8 | 10 |
| 9 Độ Kiếp | 5,0 | 11 |

Kèm: `skillViolations` cho `reqRealm` 0-9 (bỏ chặn `> 4`), vẫn `rarity >= 2` cho mọi chiêu từ Trúc Cơ trở lên và `rarity >= 3` đề xuất cho Hóa Thần trở lên; sách rơi từ quái cùng bậc hoặc hơn một bậc (`MONSTER_REALM` 5-9).

**`AMBUSH_FOE_LEVEL_CAP`** (nay 0: 1; 1: 7; 2: 12; 3: 15; 4: 18; mỗi cảnh giới thêm 3 bậc cấp): 5 -> **21**, 6 -> **24**, 7 -> **27**, 8 -> **30**, 9 -> **33** (cấp loài thường cao nhất của khung ở mục 4.1; trùm 36 là ngoại lệ chặn đường không dùng).

## 6. Thứ tự việc của A1

1. **PR này (tài liệu):** `docs/KHUNG_HOA_THAN.md`.
2. **PR `shared/` riêng** (một dev khác review): `SKILL_MULT_CAP` 5-9, bỏ chặn `reqRealm > 4` (kèm test đột biến: chiêu Hóa Thần qua, chiêu vượt khung đỏ), `AMBUSH_FOE_LEVEL_CAP` 5-9 (test: bầy hợp lệ ở Hóa Thần, loài vượt cấp đỏ), chú thích `MONSTER_REALM` / AGENTS.md "bậc 0-9".
3. **Khi D có quái và đồ bộ V:** A thêm mục "Hóa Thần sau nội dung" ở `can-bang.ts` / `docs/CAN_BANG.md` (khuôn `nguyen-anh-kinh-te.ts`), chạy `bench` bản đồ mới (số phòng, RAM, byte / tick) và ghi vào `docs/COT_TRUYEN.md` mục 9 nếu phải hạn chế số phòng.
4. Mỗi cảnh giới sau (Luyện Hư ... Độ Kiếp) lặp lại bước 3 khi bản đồ của chương đó tới.
