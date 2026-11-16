# Kinh tế đan hộ đạo — mô hình GIÁ TRỊ KỲ VỌNG (issue #763, lát 1 nghề nhỏ #514)

> Đo bằng số thật từ `shared/` (quái, thanh tu vi, xác suất đột phá, thu nhập Linh thạch ở `docs/CAN_BANG.md`).
> Công thức và số liệu mô hình ở `server/src/balance/simulate.ts` (`huntRate`, `monsterEconomy`); đột phá ở
> `shared/src/realms.ts` (`breakthroughChance`, `BREAK_FAIL_EXP_LOSS`). Dữ liệu đan: `shared/src/items.ts`
> (ba đan hộ đạo), `shared/src/recipes.ts` (`DAO_HO_RECIPES`), `shared/src/npcs.ts` (NPC `lao_dan`).
> **Mục tiêu:** đan ĐÁNG mua (giảm rủi ro đột phá) nhưng KHÔNG bắt buộc (phí + nguyên liệu vừa phải, không trả quá tay).

## 1. Cơ chế đột phá (số thật)

Đột phá cảnh giới lớn (Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh) chỉ thử được ở **tầng cuối** của cảnh giới,
khi **đầy tu vi**. Mỗi lần thất bại: mất **30% thanh tu vi** của bậc đó (`BREAK_FAIL_EXP_LOSS`) + **nửa khí huyết**,
phải đả tọa hồi máu rồi luyện lại phần tu vi mất. Xác suất thành công gốc theo cảnh giới (`breakthroughChance`):

| Đột phá | Cảnh giới gốc | p(gốc) | Kỳ vọng lần thất bại `(1−p)/p` | Kỳ vọng tu vi mất (% thanh) | Giờ phục hồi (hồi máu + luyện lại) |
|---|---|---:|---:|---:|---:|
| LK → TC | Luyện Khí | **77%** | 0,30 | 9,0% | ~1,4 phút |
| TC → KD | Trúc Cơ | **69%** | 0,45 | 13,5% | ~14 phút |
| KD → NA | Kim Đan | **61%** | 0,64 | 19,2% | ~1,9 giờ |

Kỳ vọng lần thất bại = `(1−p)/p` (phân phối hình học); mỗi lần thất bại tốn `0,3 × thanh` tu vi phải luyện lại
cộng thời gian hồi nửa HP (đả tọa hồi `hpRegenPct` = 6%/giây → ~5 giây cho nửa HP, không đáng kể ở bậc thấp).

## 2. Giá trị kỳ vọng của đan hộ đạo (EV)

Đan hộ đạo **cộng `ratio` vào xác suất đột phá** (`breakthroughChanceWith`, kẹp trần 95% — luôn còn rủi ro).
Giá trị của đan = **giảm kỳ vọng lần thất bại** → giảm tu vi mất + thời gian phục hồi.

| Đan | `ratio` | p(có đan) | Kỳ vọng lần thất bại KHÔNG/CÓ | Tu vi mất kỳ vọng KHÔNG/CÓ | Giờ phục hồi KHÔNG/CÓ | **Giảm thất bại** | **Giảm giờ phục hồi** |
|---|---:|---:|---:|---:|---:|---:|---:|
| Đột Phá Đan (LK→TC) | +8% | **85%** | 0,30 → 0,18 | 9,0% → 5,3% | ~1,4 phút → ~0,8 phút | **−41%** | **−0,6 phút** |
| Kinh Chỉ Đan (TC→KD) | +10% | **79%** | 0,45 → 0,27 | 13,5% → 8,0% | ~14 phút → ~8,3 phút | **−41%** | **−5,7 phút** |
| Dưỡng Anh Đan (KD→NA) | +12% | **73%** | 0,64 → 0,37 | 19,2% → 11,1% | ~1,9 giờ → ~1,1 giờ | **−42%** | **−0,8 giờ** |

**Kết luận EV:** với `ratio` TĂNG theo bậc (0,08 / 0,10 / 0,12), ba đan cắt **đều ~41%** số lần thất bại ở mọi bậc —
điều chỉnh đúng cho việc chi phí một lần thất bại tăng mạnh theo bậc (1,4 phút → 14 phút → 1,9 giờ). Giá trị tuyệt
đối lớn nhất vẫn ở **Kim Đan → Nguyên Anh**: một viên Dưỡng Anh Đan tiết kiệm ~0,8 giờ tu vi + máu mỗi lần đột phá.
Ở bậc thấp (Luyện Khí) giá trị tuyệt đối nhỏ nhất (đột phá vốn an toàn, 77%), nhưng tỷ lệ giảm (~41%) đều nhau, nên
đan đắt nhất (Dưỡng Anh) cũng mạnh nhất — đúng với chi phí thất bại cao nhất theo bậc.

## 3. Phí Linh thạch + nguyên liệu (chi phí)

Phí `coin` + giá trị nguyên liệu (quái rơi) là chỗ **xả Linh thạch dư** của người chơi. Quy đổi phí ra giờ săn
(theo thu nhập Linh thạch/giờ tốt nhất ở bậc đột phá, từ `docs/CAN_BANG.md`):

| Đan | Phí `coin` | Thu nhập LS/giờ (bậc đột phá) | Phí quy ra giờ săn | Nguyên liệu (quái rơi) |
|---|---:|---:|---:|---|
| Đột Phá Đan | 500 | ~3.800 (Luyện Khí hậu kỳ) | **~0,13 giờ** | long_tho ×10, nanh_soi ×8, da_ho ×4 |
| Kinh Chỉ Đan | 3.000 | ~4.750 (Trúc Cơ hậu kỳ) | **~0,63 giờ** | vay_mang ×6, da_ho ×6 |
| Dưỡng Anh Đan | 8.000 | ~16.700 (Kim Đan, mang) | **~0,48 giờ** | suong_mao ×8, quy_giap ×6, doc_nang ×4 |

**Nhận xét:** phí quy ra **dưới một giờ săn** cho mọi đan — rất nhẹ so với giá trị (giảm tới 0,63 giờ phục hồi
mỗi lần thất bại ở Dưỡng Anh). Nguyên liệu là đồ quái rơi ĐÃ CÓ ở đúng vùng săn của mỗi lần đột phá (LK: Lạc Hà /
TC: Xích Mãng boss / KD: Âm Sương), KHÔNG thêm nguồn rơi mới ở lát 1. `coin` tăng theo bậc (500 → 3.000 → 8.000,
test giữ `forRealm` tăng dần theo `coin`), đúng với giá trị đan tăng theo bậc.

## 4. Kết luận — đan ĐÁNG mua, KHÔNG bắt buộc

- **Đáng mua:** EV (giảm thất bại 33–70%, tiết kiệm tới ~0,63 giờ tu vi + máu/lần) lớn hơn chi phí (phí < 1 giờ
  săn + nguyên liệu rơi). Người chơi cày tới đột phá cảnh giới lớn sẽ thấy lời.
- **Không bắt buộc:** phí + nguyên liệu nhỏ (dưới một giờ săn), KHÔNG trả quá tay; đột phá KHÔNG có đan vẫn làm
  được (p gốc 61–77%), chỉ rủi ro hơn. KHÔNG bán lại được (`sellPrice` = 0, KHÔNG vào `ITEM_VALUE`) — chốt chặn
  chống sinh Linh thạch.
- **Xả Linh thạch dư:** ba đan là một kênh xả nhỏ, tập trung ở các mốc đột phá cảnh giới (không phải kênh xả
  chính — mức xả lớn ở Nguyên Anh ~168.000 vẫn là câu hỏi cân bằng riêng, KHÔNG thuộc lát 1 này).
- **Số `ratio` (0,08 / 0,10 / 0,12, TĂNG theo bậc) là Dev A chốt khi review #815 (16/11), ngược lại đề xuất GIẢM
  theo bậc (0,15 / 0,12 / 0,09) của D.** Lý do: chi phí một lần thất bại tăng mạnh theo bậc (1,4 phút → 14 phút →
  1,9 giờ) nên đan ĐẮT nhất (Dưỡng Anh, 8.000 LS) phải MẠNH nhất; ba số này cho p mới 85/79/73% và cắt đều ~41% số
  lần thất bại (EV ở mục 2). Đổi `ratio` thì cập nhật `desc` (test `statusDescMatches` + mutation #2 giữ chặt) và
  tính lại EV ở mục 2 theo số mới.
