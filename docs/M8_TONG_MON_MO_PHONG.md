# M8 — Mô phỏng ngân sách tông môn có chiều sâu (Dev D, #844 M8.7)

> Phần **mô phỏng ngân sách** của M8.7, làm theo thiết kế (đọc hằng số hợp đồng M8.1 + `docs/CAN_BANG.md`). Hợp đồng M8.1 (`shared/src/sect-depth.ts`), 5 tên cấp, và máy chủ M8.3-M8.5 đã ở `main` (PR #848 / #838 đã merge).
> Dữ liệu đầu vào là các hằng số trong `shared/src/sect-depth.ts` (trên main) và số thu nhập trong `docs/CAN_BANG.md`.
> **Mọi số trong thiết kế là ĐỀ XUẤT của A; D chốt bằng mô phỏng này (THIET_KE_TONG_MON.md mục 12.11.3).** Kết quả cuối sẽ gộp vào `docs/CAN_BANG.md` + mở rộng `npm run can-bang -w server` ở PR M8.7 đầy đủ (dữ liệu `SECT_SHOP`, sau hợp đồng đã vào main).

## 0. Đầu vào (hằng số hợp đồng M8.1 — `shared/src/sect-depth.ts` trên main)

| Hằng | Giá trị | Nghĩa |
|---|--:|---|
| `SECT_LEVELS[].points` | `0 / 1.000 / 4.000 / 12.000 / 30.000` | Ngưỡng điểm tông lên cấp 1→5 |
| `SECT_LEVELS[].name` | Sơ Lập / Tiểu Thành / Trung Hưng / Hưng Vượng / Đỉnh Thịnh | Tên 5 cấp (A đặt trong hợp đồng) |
| `SECT_LEVELS[].buff.exp` | `1.00 / 1.02 / 1.03 / 1.04 / 1.05` | Buff tu vi theo cấp |
| `SECT_LEVELS[].buff.drop` | `1.00 / 1.00 / 1.03 / 1.05 / 1.05` | Buff cơ hội rơi đồ |
| `SECT_LEVELS[].buff.regen` | `1.00 / 1.00 / 1.00 / 1.10 / 1.15` | Buff hồi ngoài đả tọa |
| `SECT_EARN_DAY_CAP` | `140` | Trần cống hiến/ngày/người (mọi tông gộp) |
| `SECT_QUEST_CH` | `[20, 30, 40]` → tổng `90` | 3 nhiệm vụ/ngày (một mẫu mỗi độ khó) |
| `SECT_DEPOSIT_DAY_CAP` | `30` | Trần cống hiến từ góp kho/ngày |
| `SECT_DUNGEON_CH` | `20` | Cống hiến bí cảnh (cùng đội ≥2 đồng môn) |
| `SECT_CH_VALUE_LT` | `5` | 1 cống hiến "đáng" 5 LT giá mua NPC |
| `SECT_DEPOSIT_VALUE_PER_CH` | `100` | 100 LT giá trị = 1 cống hiến (góp kho) |
| `SECT_BUFF_{EXP,DROP}_MAX` | `1.10` | Trần cứng buff (an toàn, trên bảng) |
| `SECT_BUFF_REGEN_MAX` | `1.30` | Trần cứng hồi |

Kiểm nhất quán nội bộ (từ `sect-depth.test.ts`): `90 (quest) + 30 (deposit) + 20 (dungeon) = 140 = SECT_EARN_DAY_CAP` ✓.

**Thu nhập tham chiếu** (`docs/CAN_BANG.md` mục "Kinh tế Linh thạch", săn solo): Phàm Nhân ~1.075; Luyện Khí T1 ~1.234 (Linh Thố) / ~1.377 (Hôi Lang) LT/giờ → làm tròn **~1.300 LT/giờ**; Trúc Cơ (Hắc Hổ) ~4.400–4.750 LT/giờ; Kim Đan (theo thiết kế) **5.000–15.000 LT/giờ**.

## 1. (a) Tốc độ lên CẤP TÔNG theo số thành viên tích cực

`Sect.points` = tổng cống hiến MỌI thành viên **từng kiếm** (giữ qua việc rời tông), chỉ tăng. Nên với `N` thành viên tích cực, mỗi người kiếm `E` cống hiến/ngày: `points/ngày = N × E`, và ngày để tới cấp `L` = `ngưỡng_L / (N × E)`.

Hai kịch bản `E`: **MAX** = 140 (nhiệm vụ + góp kho + bí cảnh) và **Nhiệm vụ** = 90 (chỉ 3 nhiệm vụ/ngày, không góp/rút). Bí cảnh (20) cần phối hợp ≥2 đồng môn; góp kho (30) là LT-đằng sau (mục 3) nên "realistic" nằm giữa — coi hai cột là biên trên/dưới.

**Bảng ngày lên cấp (MAX, E=140):**

| Thành viên tích cực | points/ngày | → Cấp 2 (1k) | Cấp 3 (4k) | Cấp 4 (12k) | Cấp 5 (30k) |
|:-:|--:|--:|--:|--:|--:|
| 1 | 140 | 7,1 ngày | 28,6 ngày | 85,7 ngày (~12 tuần) | 214,3 ngày (~31 tuần) |
| 2 | 280 | 3,6 ngày | 14,3 ngày | 42,9 ngày (~6 tuần) | 107,1 ngày (~15 tuần) |
| 3 | 420 | 2,4 ngày | 9,5 ngày | 28,6 ngày (~4 tuần) | 71,4 ngày (~10 tuần) |
| 5 | 700 | 1,4 ngày | 5,7 ngày | 17,1 ngày (~2,5 tuần) | 42,9 ngày (~6 tuần) |
| 10 | 1.400 | 0,7 ngày | 2,9 ngày | 8,6 ngày | 21,4 ngày (~3 tuần) |

**Bảng ngày lên cấp (Nhiệm vụ, E=90):**

| Thành viên tích cực | points/ngày | → Cấp 2 (1k) | Cấp 3 (4k) | Cấp 4 (12k) | Cấp 5 (30k) |
|:-:|--:|--:|--:|--:|--:|
| 1 | 90 | 11,1 ngày | 44,4 ngày | 133,3 ngày (~19 tuần) | 333,3 ngày (~48 tuần) |
| 2 | 180 | 5,6 ngày | 22,2 ngày | 66,7 ngày (~9,5 tuần) | 166,7 ngày (~24 tuần) |
| 3 | 270 | 3,7 ngày | 14,8 ngày | 44,4 ngày (~6,3 tuần) | 111,1 ngày (~16 tuần) |
| 5 | 450 | 2,2 ngày | 8,9 ngày | 26,7 ngày (~3,8 tuần) | 66,7 ngày (~9,5 tuần) |
| 10 | 900 | 1,1 ngày | 4,4 ngày | 13,3 ngày | 33,3 ngày (~5 tuần) |

**Đối chiếu dự đoán của A** (mục 12.4): "Tông 3 người tích cực tối đa 140/người/ngày → cấp 2 ~3 ngày, cấp 3 ~10 ngày, cấp 4 ~4 tuần, cấp 5 ~10 tuần; chỉ làm nhiệm vụ (90/ngày) → ~4 ngày, ~15 ngày, ~6 tuần, ~16 tuần; tông 2 người gấp rưỡi."

| Ngưỡng | A đoán (N=3, MAX) | Mô phỏng (N=3, E=140) | A đoán (N=3, nhiệm vụ) | Mô phỏng (N=3, E=90) |
|---|---|---|---|---|
| Cấp 2 | ~3 ngày | **2,4 ngày** | ~4 ngày | **3,7 ngày** |
| Cấp 3 | ~10 ngày | **9,5 ngày** | ~15 ngày | **14,8 ngày** |
| Cấp 4 | ~4 tuần | **4,1 tuần** | ~6 tuần | **6,3 tuần** |
| Cấp 5 | ~10 tuần | **10,2 tuần** | ~16 tuần | **15,9 tuần** |

→ **Khớp chặt.** A làm tròn lên nhẹ ở cấp 2; các mốc còn lại gần như trùng. Đường cong "lên cấp là chuyện của TUẦN, không phải GIỜ" đạt đúng ý đồ; cấp 5 là mục tiêu dài hạn (~10–16 tuần cho tông 3 người, ~31–48 tuần cho cá nhân chơi một mình). Quy mô thật (1 tông / 2 thành viên) vẫn với tới được: cấp 2 trong ~4–6 ngày, cấp 3 trong ~2–3 tuần. **Không cần chỉnh bảng điểm.**

## 2. (b) Giá trị hàng mua được mỗi ngày so thu nhập từng bậc

Trần giá trị mua mỗi ngày = `SECT_EARN_DAY_CAP × SECT_CH_VALUE_LT` = `140 × 5` = **700 LT-tương-đương/ngày** (nếu kiếm đủ trần). Trong đó:
- **Cống hiến "miễn phí"** (nhiệm vụ 90 + bí cảnh 20 = 110) → `110 × 5` = **550 LT-tương-đương/ngày** sức mua KHÔNG tốn Linh thạch.
- **Cống hiến góp kho** (30) là LT-đằng sau (mục 3), không tính là thu nhập ròng.

So với thu nhập săn (`CAN_BANG.md`), quy ra "giờ săn tương đương" của sức mua tối đa / sức mua miễn phí:

| Bậc | LT/giờ | 700 LT-đvt (tối đa) | 550 LT-đvt (miễn phí) |
|---|--:|---|---|
| Phàm Nhân | 1.075 | 0,65 giờ | 0,51 giờ |
| Luyện Khí | ~1.300 | **0,54 giờ** | **0,42 giờ** |
| Trúc Cơ | ~4.600 | 0,15 giờ | 0,12 giờ |
| Kim Đan | ~10.000 | 0,07 giờ | 0,06 giờ |

Bất biến mục 12.6: "trần giá trị mua mỗi ngày KHÔNG vượt ~1 giờ săn của bậc thấp nhất món dùng được." → 700 LT-đvt = **0,54 giờ săn Luyện Khí** < 1 giờ ✓ (còn dư ~45%). Cửa hàng là **tiện lợi / phần thưởng tham gia tông**, KHÔNG phải chỗ kiếm tiền. **Đạt.**

> **Giới hạn của (b):** kết luận này dựa trên neo `SECT_CH_VALUE_LT = 5` và CHƯA đối chiếu giá thật của `SECT_SHOP` (D đang viết ở #844). Nó chỉ đúng nếu **mọi món trong `SECT_SHOP` có giá trị mua ≤ (giá cống hiến × 5)**; sẽ kiểm bằng dữ liệu thật ở PR M8.7 đầy đủ — đừng coi (b) là đã chốt trên giá thật.

## 3. (d) Không có vòng Linh thạch → cống hiến → hàng → bán lại có lời

Chuỗi chuyển đổi:
- **LT → cống hiến:** chỉ qua góp kho, `100 LT giá trị = 1 cống hiến` (`SECT_DEPOSIT_VALUE_PER_CH`).
- **Cống hiến → hàng:** `1 cống hiến = tối đa 5 LT-đvt hàng` (`SECT_CH_VALUE_LT`).
- → **100 LT vào → 1 cống hiến → 5 LT-đvt hàng = LỖ ~95%.** Không có arbitrage. ✓

Các chốt chặn khác (đều trong hợp đồng, kiểm bằng mô phỏng M8.8 sau):
1. Trần kiếm `SECT_EARN_DAY_CAP = 140`/ngày/người → tổng sức mua tối đa **700 LT-đvt/ngày** bất kể giàu LT đến đâu.
2. Cống hiến theo **LINH HỒN**, mất khi rời tông → không gom trần bằng nhảy tông / lập tông hằng ngày (`sectCanEarn`: phải vào tông từ trước hôm nay).
3. Cống hiến góp kho là LT-đằng sau (lỗ 95%); cống hiến nhiệm vụ/bí cảnh "miễn phí" nhưng KHÔNG đổi ngược ra LT (không có đường contrib→LT).
4. Kinh quyển (`book`) dạy chiêu, tiêu hao, KHÔNG bán lại có lời; đan/đồ hiếm mua bằng cống hiến, giá bán ≤ giá mua (luật cũ).

→ **Không có vòng sinh tiền.** Cửa hàng đúng nghĩa "đổi cống hiến lấy tiện lợi", không phải chỗ rửa LT. **Đạt.**

## 4. (c) Tác động buff (≤ +5% nhịp lên bậc, ≤ +5% rơi đồ)

Buff tông gắn vào **tu vi cá nhân** (`gainExp`), **rơi đồ** (`rollDrops`), **hồi phục** (`regen`) — KHÔNG gắn vào điểm tông. Nên:

- **Nhịp lên BẬC TÔNG:** buff KHÔNG ảnh hưởng (cấp tông dựa trên cống hiến, không phải tu vi). Bảng (a) ở trên là buff-độc lập → buff KHÔNG tạo vòng lặp tăng tốc lên cấp tông. ✓
- **Nhịp lên CẢNH GIỚI (tu vi cá nhân):** buff exp tối đa lvl5 = `×1,05` → mỗi cảnh giới mất `1/1,05 = 0,952×` thời gian = **nhanh 4,76% ≤ 5%** ✓. Trần cứng `SECT_BUFF_EXP_MAX = 1,10` nằm TRÊN bảng (an toàn: lỗi bảng cũng không vượt; ngay tại trần cứng, nhanh 9,1% vẫn bị chặn, và bảng không bao giờ tới).
- **Lượng rơi đồ:** buff drop tối đa lvl5 = `×1,05` → **+5% giá trị rơi ≤ +5%** ✓. Trần cứng `SECT_BUFF_DROP_MAX = 1,10` cũng vậy.
- **Vòng rơi đồ → thu nhập:** +5% rơi ở lvl5 → +5% LT → nhưng LT chỉ đổi ra cống hiến qua góp kho (lỗ 95%, lại bị chặn trần `SECT_DEPOSIT_DAY_CAP = 30`) → tác động tới cống hiến **không đáng kể**. Không có vòng lặp nghĩa.

→ **Buff nằm trong ngân sách +5% của thiết kế, đúng chỗ gắn, không tạo vòng lặp.** **Đạt.** Trần cứng `1,10 / 1,10 / 1,30` đủ xa bảng (`1,05 / 1,05 / 1,15`) để một lỗi bảng không làm buff vô hạn, nhưng vẫn kẹp được.

## 5. Kết luận & đề xuất chỉnh số (mục 12.13 câu 3-4: A chốt, người dùng đổi được)

Mô phỏng **XÁC NHẬN** các số khởi đầu của A đạt mọi mục tiêu thiết kế; **KHÔNG cần chỉnh**:

| Số | Đề xuất A | Kết luận mô phỏng |
|---|---|---|
| Trần `SECT_EARN_DAY_CAP = 140` | 140 cống hiến/ngày | ✓ Đạt nhịp lên cấp "tuần, không giờ"; hợp với quy mô 1 tông/2 người |
| Neo giá `SECT_CH_VALUE_LT = 5` | 1 cống hiến = 5 LT | ✓ Vòng LT→cống→hàng lỗ 95%; trần mua 700 LT-đvt = 0,54 giờ săn Luyện Khí < 1 giờ |
| Bảng cấp `0/1k/4k/12k/30k` | 5 bậc | ✓ Khớp chặt dự đoán của A; cấp 5 dài hạn (~10–16 tuần, tông 3 người) |
| Buff tối đa +5% tu vi / +5% rơi | lvl5 | ✓ Nằm trong ngân sách; trần cứng 1,10 đủ an toàn |

**Ghi chú tuỳ chọn (KHÔNG chặn, A/người dùng quyết):** trần mua 700 LT-đvt/ngày còn dư ~45% dưới mốc 1 giờ săn Luyện Khí. Nếu A muốn cửa hàng "hào phóng" hơn một chút cho bậc cao, có thể nới `SECT_CH_VALUE_LT` xuống 4 (trần 560 LT-đvt = 0,43 giờ) — nhưng KHÔNG cần vì số hiện tại đã an toàn và đúng ý "tiện lợi, không phải chỗ rửa tiền". **Khuyến nghị: GIỮ NGUYÊN.**

## 6. Bước tiếp (PR M8.7 đầy đủ — dữ liệu `SECT_SHOP` + `SECT_TERMS`; hợp đồng M8.1 đã vào main)

1. Dùng `sectQuestViolations()` / `sectShopViolations()` (hợp đồng M8.1, đã trên main) kiểm dữ liệu thật `SECT_SHOP` (5 nhóm) của D; `SECT_QUESTS` (≥12 mẫu × 4 bậc) do Dev E làm ở #856.
2. `SECT_TERMS`: 5 tên cấp (Sơ Lập / Tiểu Thành / Trung Hưng / Hưng Vượng / Đỉnh Thịnh) ĐÃ có trong hợp đồng `SECT_LEVELS[].name`; nếu ghi thêm thuật ngữ giải thích lấy nguyên văn VKTT thì ghi `docs/NGUON_NOI_DUNG.md` mục 3.
3. Mở rộng `npm run can-bang -w server` thêm mục tông môn (đọc `sectAwardDay` / `SECT_EARN_DAY_CAP` / `SECT_CH_VALUE_LT` trên main), gộp các bảng ở mục 1-4 vào `docs/CAN_BANG.md`.
4. Chạy TOÀN BỘ `npm test` + `typecheck` + `lint` + `prettier --check .` trước PR; PR ghi `Closes #844`.

*Lưu:* phần dữ liệu `SECT_SHOP` + `SECT_TERMS` CHƯA viết (Dev D, #844); `SECT_QUESTS` tách sang #856 (Dev E). Hợp đồng M8.1 (#848) ĐÃ vào main. Tài liệu này chỉ là phần mô phỏng ngân sách làm được ngay.
