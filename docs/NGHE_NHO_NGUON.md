# Khảo sát nguồn nghề luyện đan + chế phù (từ Vạn Kiếp Tu Tiên)

> Tài liệu khảo sát + đề xuất của Dev D cho #749, phần 1 của #514. **Chỉ tài liệu**, chưa đụng `shared/` / `server/` / `client/`.
> Dev A dùng bản này để viết thiết kế (`docs/THIET_KE_NGHE_NHO.md`) + hợp đồng `shared/`, rồi giao lại cho D phần dữ liệu công thức + test + mô phỏng kinh tế.
>
> **Nguồn:** `~/TT/van-kiep-tu-tien-clone/site/assets/content-ClG6Ha-i.json` (bản tiếng Việt, CHỈ đọc). KHÔNG dùng `content-zh-*.json`.
> **Toàn bộ số liệu dưới đây là SỐ DỪNG BAN ĐẦU, CHƯA MÔ PHỎNG**, chỉ để A định hướng thiết kế; số cuối do mô phỏng kinh tế chốt (M7.9 sau).
>
> **Cập nhật theo review của A (#764):** đã sửa con số khoá nguồn (85 / 72 công thức thật), tách đan đột phá thành mục riêng (là lát 1 = #763), sửa hai nguyên liệu sai (Tụ Linh ×3, Tái Tạo phụ mộc phẩm-3), nêu quy tắc định giá phụ liệu, và cập nhật toàn bộ theo sáu câu trả lời của A (phụ liệu cố định, không hỏa pháp, không bán, bỏ thọ nguyên giữ đột phá, chế tức thì, mua nền ở NPC).

---

## 1. Nguồn trong bản sao trên máy

Các khoá YAML liên quan (đọc từ JSON, giá trị là chuỗi YAML mã hoá). **Công thức thật nằm ở `/content/recipes/<nghề>.yaml`** — đây là bảng nguyên liệu, KHÔNG phải kịch bản gặp gỡ.

| Khoá | Có gì | Số mục |
| --- | --- | --- |
| `/content/recipes/luyen_dan.yaml` | **Bảng công thức luyện đan thật** (`chu` / `phu` / `hoa` / `linh_thach` / `ra` / `nguon` / `mo_ta`) | 85 |
| `/content/recipes/che_phu.yaml` | **Bảng công thức chế phù thật**, cấu trúc giống | 72 |
| `/content/items/luyen_che/luyen_dan.yaml` | Phương dược — tờ phương `don_phuong` (vật phẩm kiến thức) + `dung_cu` (dụng cụ: cối, lò…) | 91 (= 85 `don_phuong` + 6 `dung_cu`) |
| `/content/items/luyen_che/che_phu.yaml` | Dụng cụ chế phù (bút, giấy, mực…) + phương phù | 79 (= 70 `don_phuong` + 6 `dung_cu` + 3 `nguyen_lieu`: Chu Sa, Phù Chỉ, Yêu Huyết Mặc — nguyên liệu nền của nghề phù) |
| `/content/items/dan_duoc.yaml` | Đơn dược — thành phẩm đan, ghi hiệu ứng (`dot_pha` / `pha_binh_canh` / `bao_phat` / hồi máu…) | 85 |
| `/content/items/phu_luc.yaml` | Phù lục — thành phẩm phù (hiệu ứng chủ yếu mô tả bằng văn xuôi trong `mo_ta`, `dung` gần như trống) | 66 |
| `/content/encounters/nghe/{luyen_dan,che_phu,chung}.yaml` | Sự kiện khi hành nghề (kịch bản gặp gỡ, `choices` / `scenes` / `cap_viec`), kết quả `luyen_thanh/thuong/ha/hong` — flavor, KHÔNG phải bảng nguyên liệu | 9 / 6 / — |
| `/content/recipes/luyen_bao.yaml` | Công thức rèn khí (không thuộc phạm vi #514) | 124 |
| `/content/recipes/tran_phap.yaml` | Công thức trận pháp (không thuộc phạm vi #514) | 59 |

**Cấu trúc công thức thật** (ví dụ `dp.loi_am_dan`):

```yaml
id: dp.loi_am_dan
chu:  [{id: item.loi_kiep_truc, so: 1}]                  # chủ liệu: list {id, so}
phu:  [{loai: linh_duoc, he: [moc], pham: 3, so: 1}]     # phụ liệu: MẪU lọc (xem mục 5)
hoa:  vu        # văn hỏa / vũ hỏa — đã KHÔNG dùng (A chốt: chế tất định)
linh_thach: 40  # phí Linh thạch
ra: item.loi_am_dan
nguon: [pho_bien]  # pho_bien (phổ biến) / co (hiếm) / tong_mon (tông môn) — nguồn mở khoá công thức
```

**Hai dạng phụ liệu `phu`:**
- **Mẫu lọc** `{loai, he, pham, so}` — "any <loai> <he> phẩm-<pham>" (vd `{loai: linh_duoc, he: [moc], pham: 3}` = "mộc linh dược phẩm-3 bất kỳ"). Chỉ xuất hiện trên MỘT SỐ công thức (Lôi Âm Đan, Cửu Chuyển Kim Đan, Tái Tạo Đan, Vạn Sinh Đan…).
- **Item cố định** `{id, so}` — giống `chu`, trỏ thẳng một vật phẩm. Là dạng còn lại.

→ Theo chốt của A (câu 1): **mỗi phụ liệu cố định thành MỘT item cụ thể**, `RecipeDef.inputs` giữ `{itemId, qty}`, KHÔNG làm khớp mẫu. Cách chọn item cố định + giá xem mục 5.

**Cảnh giới nguồn (`canh_gioi` trên item) ánh xạ sang Tiên Giới:** 0–1 → Luyện Khí, 2 → Trúc Cơ, 3 → Kim Đan, 4 → Nguyên Anh, **5 → Hóa Thần (vượt trần nội dung TT, LOẠI)**.

**Ba cơ chế nguồn có, TT xử lý khác (chi tiết mục 2, 3):**
- `dot_pha` (trên item `dan_duoc.yaml`) — tăng tỉ lệ đột phá cảnh giới. **TT CÓ** `breakthroughChance` → đan đột phá LÀ lát 1 của nghề (mục 2 riêng).
- `tu_luyen` — tự tu theo năm (`nam`, `toc_do`), cơ chế tu luyện ngoại tuyến. TT KHÔNG có → LOẠI.
- `thọ nguyên` (ví dụ Cửu Chuyển Kim Đan +80 năm) — TT KHÔNG có → LOẠI.

---

## 2. Bảng chọn lọc — Luyện đan (10 công thức)

Ưu tiên thứ **dịch được sang chiến đấu thời gian thực**: đan hồi + đan tăng chỉ số có thời hạn. Đánh dấu ★ = điểm sáng (cơ chế TT chưa có, không trùng đan hiện có). Bậc cảnh giới theo `canh_gioi` item nguồn.

| Bậc | Thành phẩm | Nguyên liệu (chủ + phụ) | Phí | Hiệu ứng (số + nguyên văn) |
| --- | --- | --- | --- | --- |
| Luyện Khí | **Tráng Đảm Đan** ★ | Hùng Đảm ×1 | 4 | Bạo phát +1 đòn gấp rưỡi, hồi 15% khí huyết. *"giữa trận một lượt ra đòn nặng gấp rưỡi, hồi chút khí huyết, không hại thân"* |
| Luyện Khí | Hồi Xuân Đan | Sơn Sâm ×1 | 2 | Hồi 25% khí huyết. *"giữa trận hồi một phần tư khí huyết"* |
| Luyện Khí | Tụ Linh Đan | Nhất Giai Yêu Đan ×3 | 0 | Hồi linh lực (+4 hơi thở). *"linh lực trong kinh mạch dâng lên"* |
| Trúc Cơ | **Lôi Âm Đan** ★ | Lôi Kiếp Trúc ×1 + phụ mộc linh dược phẩm-3 ×1 | 40 | Bạo phát +2 đòn gấp rưỡi, hồi linh lực. *"hai lượt ra đòn nặng gấp rưỡi, linh lực thêm bốn hơi thở"* |
| Trúc Cơ | Hoàn Hồn Đan | Minh Đăng Thảo ×2 | 20 | Hồi 55% khí huyết. *"giữa trận hồi quá nửa khí huyết"* |
| Trúc Cơ | Ngưng Nguyên Đan | Trầm Uyên Tảo ×1 | 30 | Hồi linh lực (+6). *"thêm sáu hơi thở linh lực"* |
| Kim Đan | **Cửu Chuyển Kim Đan** ★ | Vạn Niên Tùng Chi ×1 + phụ hoa linh dược phẩm-3 ×1 | 50 | Hồi 60% khí huyết + linh lực. *"giữa trận hồi sáu phần khí huyết"* (thêm thọ nguyên — TT không có, bỏ, xem mục 3) |
| Kim Đan | Tái Tạo Đan | Mãng Hồn Chi ×1 + phụ mộc linh dược phẩm-3 ×1 | 100 | Hồi 60% khí huyết. *"trọng thương hạ còn thương nhẹ, thương nặng thì lành hẳn"* |
| Nguyên Anh | **Duệ Kim Đan** ★ | Cửu Diệp Kiếm Thảo ×1 + Hạt Vương Độc Thích ×1 | 200 | Bạo phát +3 đòn gấp rưỡi, hồi linh lực. *"ba lượt ra đòn nặng gấp rưỡi, linh lực thêm sáu hơi thở"* |
| Nguyên Anh | Vạn Sinh Đan | Cửu Tuệ Linh Đạo ×1 + phụ mộc linh dược phẩm-5 ×1 | 1000 | Hồi 65% khí huyết. *"sinh cơ tràn khắp kinh mạch… hồi hơn sáu phần khí huyết"* |

**Đan đột phá (lát 1 của nghề — issue #763, KHÔNG loại bỏ).** Trong nguồn là hiệu ứng `pha_binh_canh` trên item `dan_duoc.yaml` (KHÔNG phải `dot_pha` — cái đó là chỉ số tăng tỉ lệ trên đan thường). TT **có** `breakthroughChance(realm)` 77 / 69 / 61 % (thất bại mất 30 % tu vi + nửa khí huyết), nên đan đột phá khớp cơ chế sẵn. Ba đan này là lát 1 D làm sau #761 merge:

| Bậc | Thành phẩm | Nguyên liệu (chủ) | Phí | Hiệu ứng (`pha_binh_canh`) | `nguon` |
| --- | --- | --- | --- | --- | --- |
| Trúc Cơ | Phá Chướng Đan | Khai Khiếu Châu ×1 | 20 | Phá bình cảnh Trúc Cơ (1 phần). *"vách chân khí vỡ ra, bước sang tiểu cảnh giới kế"* | `pho_bien` |
| Kim Đan | Toái Bích Đan | Xuyên Bích Giác ×1 | 60 | Phá bình cảnh Kim Đan (1 phần). *"vách chướng vỡ vụn như tường đất gặp lũ"* | `pho_bien` |
| Nguyên Anh | Thông Huyền Đan | Huyền Quan Tủy ×1 | 100 | Phá bình cảnh Nguyên Anh (1 phần). *"cửa ải trong thân tự mở"* | **`tong_mon`** (mở khoá qua tông môn — D11 cân nhắc) |

> Phá Hư Đan (Hóa Thần, `canh_gioi` 5) — LOẠI (siêu trần).
> Lưu ý: `dot_pha` trên đan thường (Trúc Cơ Đan +15 %, Kết Đan Đan +12 %, Duỳ Anh Đan +9 % tam ma…) là cơ chế **tăng tỉ lệ đột phá**, khác với `pha_binh_canh` là **phá bình cảnh trực tiếp**; lát 1 (#763) lấy `pha_binh_canh`.

**Loại bỏ (luyện đan) + lý do:**
- **Đan tự tu (`tu_luyen`)** — Dưỡng Khí Đan…: tu theo năm/tháng, cơ chế ngoại tuyến TT không có.
- **Đan dưỡng phẩm (`duong_pham`)** — Cố Cơ Đan / Uẩn Đan Lộ / Uẩn Anh Liên / Uẩn Thần Đăng: "ôn dưỡng phẩm chất đan điền một bậc, mỗi cảnh giới chỉ một lần" — cơ chế nâng phẩm chất thân thể TT chưa có, để sau nếu làm.
- **Đan hồi/thần thức trùng lặp** — Sinh Cơ Đan (hồi 40% = Hồi Huyết Đan hiện có), Bổ Khí Đan (hồi linh lực ~ Hồi Linh Đan): trùng đan hiện có, KHÔNG cần làm lại (xem mục 4).
- **Siêu trần** — Thương Long Đan, Kim Ô Đan, Tạo Hóa Đan (cảnh giới 5 Hóa Thần): vượt trần nội dung TT.
- **Cần hệ thống trạng thái TT chưa có** — Tịch Độc Đan (trừ độc: cần cơ chế độc/trạng thái), Định Thần Đan (tam ma): đề nghị để sau nếu làm hệ trạng thái.

---

## 3. Bảng chọn lọc — Chế phù (10 công thức)

Phù lục nguồn là **vật phẩm dùng một lần** (consumable), khác với "Hộ phù" (trang bị ô talisman) của TT. Ưu tiên phù tấn công / giảm chỉ số đối thủ dùng một lần. Hiệu ứng trong nguồn mô tả bằng văn xuôi (`dung` cấu trúc gần như trống), nên lấy nguyên văn làm mô tả.

| Bậc | Thành phẩm | Hệ | Nguyên liệu | Phí | `nguon` | Hiệu ứng (nguyên văn) |
| --- | --- | --- | --- | --- | --- | --- |
| Luyện Khí | Hỏa Đạn Phù | Hỏa | Chu Sa ×1, Phù Chỉ ×1 | 2 | pho_bien | Sát thương đơn mục tiêu. *"ném ra nổ thành một quả cầu lửa cỡ nắm tay"* |
| Luyện Khí | Định Thân Phù | Thổ | Chu Sa ×1, Phù Chỉ ×1, Điệp Phấn ×1 | 0 | pho_bien | Choáng/giam đối thủ. *"dán trúng người thì tê cứng cả thân… đủ cho ngươi ra thêm một đòn"* |
| Luyện Khí | Cuồng Huyết Phù | Hỏa | Chu Sa ×2, Phù Chỉ ×1, Yêu Huyết Mặc ×2, Huyết Linh Chi ×1 | 30 | pho_bien | Tăng sát thương (buff). *"ra đòn nặng hơn thường"* |
| Trúc Cơ | Phi Châm Phù | Kim | Chu Sa ×2, Phù Chỉ ×2, Yêu Huyết Mặc ×1, Kim Mạch Đạo ×2 | 30 | pho_bien | Sát thương diện rộng. *"nổ thành cả trăm mũi kim, bắn tạt vào đám địch trước mặt"* |
| Trúc Cơ | Liệt Diễm Phù | Hỏa | Chu Sa ×2, Phù Chỉ ×3, Hỏa Tinh Châu ×2, Hỏa Kê Vũ ×1 | 0 | pho_bien | Cột lửa AoE. *"một cột lửa phụt thẳng từ đất lên, cao ba trượng"* |
| Trúc Cơ | Toái Giáp Phù | Kim | Chu Sa ×2, Phù Chỉ ×3, Yêu Huyết Mặc ×2, Tê Ngưu Giác ×1, Kim Tuệ Mạch ×1 | 40 | pho_bien | Giảm phòng thủ đối thủ. *"giáp trụ, vảy cứng đều nứt toác, đòn sau ăn sâu hơn"* |
| Kim Đan | Lôi Nộ Phù | Lôi | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Lôi Linh Châu ×2 | 300 | pho_bien | Buff + sát thương. *"lôi khí chạy khắp người… đòn đánh ra kèm tiếng sấm"* |
| Kim Đan | Khốn Long Phù | Thổ | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Sơn Tinh Hạch ×2, Cửu Khúc Hoàng Tinh ×1 | 0 | pho_bien | Giam chân đối thủ. *"đất dưới chân đối thủ dựng lên khóa chặt, giãy một lượt mới ra"* |
| Nguyên Anh | Kim Lân Độc Phù | Mộc | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Kim Lân Mãng Đởm ×1 | 50 | **co** | Ngộ độc DoT. *"một đạo khí lục quấn lấy đối thủ, chỗ nào chạm vào là da thịt thâm đen"* |
| Nguyên Anh | Tam Muội Hỏa Phù | Hỏa | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Ngô Đồng Chi ×2 | 0 | pho_bien | Lửa DoT bền. *"ngọn lửa phù bám vào đâu cháy tới đó, nước dội không tắt"* |

**Thiết kế phù theo chốt của A (mục 2.6, `docs/THIET_KE_NGHE_NHO.md`):** lát 2 hiện chỉ có `amp_<he>` (nhân sát thương chiêu cùng hệ trong 60 giây) và `cdr_phu` (giảm hồi chiêu). Trong 10 phù trên, **chỉ Cuồng Huyết Phù và Lôi Nộ Phù (buff) khớp ngay** với `amp` / `cdr_phu`; phù ném sát thương / giam / DoT (Hỏa Đạn, Phi Châm, Liệt Diễm, Toái Giáp, Định Thân, Khốn Long, Kim Lân Độc, Tam Muội Hỏa) cần một loại `ItemEffect` thi triển chiêu mà A chưa thiết kế — A sẽ quyết ở lát 2 và có thể chọn lại từ bảng này. Không cần đổi gì trong PR tài liệu này.

**Loại bỏ (chế phù) + lý do:**
- **Truyền tống** — Na Di Phù, Quy Tức Phù, Địa Độn Phù, Thủy Độn Phù, Thái Hư Độn Phù: công cụ di chuyển, cần hệ truyền tống trận TT chưa có (không phải chiến đấu).
- **Tin nhắn / tìm kiếm** — Truyền Âm Phù, Ngọc Giản Truyền Tin, Tầm Lộ Phù, Tầm Bảo Phù: tiện ích ngoài chiến đấu.
- **Hồi sinh** — Hoàn Sinh Phù: cần cơ chế hồi sinh theo lượt; TT xử lý chết bằng Hoàng Tuyền / luân hồi, để sau.
- **Gắn quốc gia của VKTT** — **Phá Quân Phù**: *"Phù quan ải Lương Quốc"* — Lương Quốc là quốc gia của game nguồn, vi phạm quy tắc Asset nguồn 3 → KHÔNG lấy.
- **Gắn đạo quân / flavor nặng** — Âm Binh Phù (*"đạo quân chết trận"*): flavor gắn thế lực, để tránh.
- **Siêu trần Hóa Thần (cảnh giới 5)** — Trảm Thần Phù, Cửu Thiên Lôi Phù, Diệm Hải Phù, Thủy Lao Phù, Thiên Cương Phù, Hủ Đằng Phù, Tạo Hóa Phù: vượt trần nội dung TT.
- **Trùng gần với phù đã chọn** — Tỏa Hồn Phù / Thiên Ti Phù / Tỏa Tiên Phù (giam chân, giống Định Thân/Khốn Long), Đoạn Sinh Phù (hút sinh cơ, gần giống DoT), Bùa trừ tà (sát thương nhỏ): chọn đại diện, bỏ bản sao gần.

---

## 4. Đối chiếu với Tiên Giới

### Nguyên liệu: ĐÃ có vs PHẢI thêm

TT hiện có **13 nguyên liệu quái rơi** từ bốn bản đồ (`items.ts`): lông thỏ, nanh sói, da hổ, vảy mãng, sương mao, quy giáp, độc nang, giao lân, hàn lang mao, phong nha vũ, tượng cốt, độc tước nang, thiên hàn châu.

**Các nguyên liệu nghề đan / phù của nguồn là MỚI gần như toàn bộ**, khác tên và khác loại:
- **Linh dược (`linh_duoc`, thảo mộc)**: Huyết Linh Chi, Minh Đăng Thảo, Lôi Kiếp Trúc, Trầm Uyên Tảo, Vạn Niên Tùng Chi, Mãng Hồn Chi, Cửu Tuệ Linh Đạo, Cửu Diệp Kiếm Thảo, Kim Mạch Đạo, Kim Tuệ Mạch, Cửu Khúc Hoàng Tinh, Ngô Đồng Chi… → **PHẢI thêm**, đề xuất gắn nguồn rơi/thu hái có thật (mỗi loài/cây một vùng, theo bậc cảnh giới).
- **Yêu tài (`yeu_tai`, rơi quái)**: Huyết Đỉa Dịch, Hùng Đảm, Nhất Giai Yêu Đan, Hỏa Tinh Châu, Tê Ngưu Giác, Lôi Linh Châu, Sơn Tinh Hạch, Kim Lân Mãng Đởm, Hạt Vương Độc Thích… → **PHẢI thêm**, gắn quái rơi có thật.
- **Nguyên liệu nền phù (3 loại, `loai: nguyen_lieu`)**: **Chu Sa** (hoa hệ, phẩm-1, giá 2), **Phù Chỉ** (phẩm-1, giá 1), **Yêu Huyết Mặc** (hoa hệ, phẩm-2, giá 15) — rẻ, dùng cho MỌI phù. Yêu Huyết Mặc xuất hiện trong hầu hết phù trung-cao cấp. → **Đề xuất mua được ở NPC** (như mô hình cửa hàng đan hồi), để chế phù tốn Linh thạch = một chỗ xả tiền.
- **Yêu tài trung bình** — Điệp Phấn (phẩm-2, giá 32): xuất hiện ở Định Thân Phù, đề xuất làm nguyên liệu rơi tầm trung, có thật.

**Không có nguyên liệu nào trùng trực tiếp** với 13 món của TT (khác tên). *(Khác với phỏng đoán ban đầu: "Quy giáp" của nguồn không nằm trong công thức đã chọn, nên không tái dụng.)*

### Thành phẩm trùng đan hiện có

TT có 7 đan tiêu dùng: Hồi Huyết Đan (hồi 40%), Đại Hồi Huyết Đan (70%), Thượng Hồi Huyết Đan (90%), Hồi Linh Đan (50% MP), Đại Hồi Linh Đan (70% MP), Thượng Hồi Linh Đan (90% MP), Tụ Khí Đan (exp). Đối chiếu:

| Đan nguồn | Hiệu ứng | Trùng với TT? | Kiến nghị |
| --- | --- | --- | --- |
| Sinh Cơ Đan | hồi 40% | **TRÙNG HẾT** Hồi Huyết Đan | KHÔNG làm lại |
| Bổ Khí Đan | hồi MP | trùng Hồi Linh Đan | KHÔNG làm lại |
| Hồi Xuân Đan | hồi 25% | thấp hơn đan rẻ nhất (40%) | Tùy: lấp khe hoặc bỏ |
| Hoàn Hồn Đan (55%) / Tái Tạo, Cửu Chuyển (60%) / Vạn Sinh, Hồi Thiên (65%) | hồi máu | xen giữa 50/70/90% | Một phần trùng; giữ nếu muốn dải hồi mượt |
| Tụ Linh / Ngưng Nguyên Đan | hồi MP | trùng Hồi Linh / Đại Hồi Linh | Tùy bậc |
| **Tráng Đảm / Lôi Âm / Duệ Kim Đan** | **bạo phát tăng sát thương** | **KHÔNG có gì trùng** | **Làm — điểm sáng** |

**Kết luận:** phần lớn đan hồi/MP của nguồn TRÙNG đan TT → không cần làm. Giá trị độc nhất là **3 đan bạo phát (★)** — tăng sát thương có thời hạn, cơ chế TT chưa từng có. Nên ưu tiên 3 đan này + một vài đan hồi điền khe, bỏ đan trùng.

### Va chạm tên vật phẩm

- **Quy Tức Phù**: TT đã có `quy_tuc_phu` là **trang bị Hộ phù** (cộng MP/speed); nguồn có "Quy Tức Phù" là **phù truyền tống tiêu dùng**. Cùng tên, khác loại → nếu làm phù truyền tống thì **đổi tên** để khỏi đụng. (Đã không chọn phù này.)
- Các phù tấn công đã chọn (Hỏa Đạn, Định Thân, Cuồng Huyết, Phi Châm, Liệt Diễm, Toái Giáp, Lôi Nộ, Khốn Long, Kim Lân Độc, Tam Muội Hỏa) — **không trùng** tên vật phẩm TT hiện có.
- Khái niệm: phù nguồn là **tiêu dùng một lần**, khác ô "Hộ phù" (trang bị) của TT → nên vào một loại vật phẩm mới (`consumable`), không chen vào `equip`.

---

## 5. Phác kinh tế (SỐ ƯỚC LƯỢNG, CHƯA MÔ PHỎNG)

**Quy tắc chống sinh tiền** (từ `shared/src/currency.ts`, bất biến test giữ): giá NPC thu mua thành phẩm = `ITEM_VALUE × 0.5`, và phải **≤ tổng giá nguyên liệu + phí chế**, để không có vòng "chế rồi bán lại có lời". Theo chốt của A (câu 3): **đầu ra của trạm `alchemy` / `talisman` KHÔNG vào `ITEM_VALUE`** (nên `sellPrice` = 0, test khoá) — đồ tự chế KHÔNG bán được NPC, cách an toàn nhất.

**Quy tắc định giá phụ liệu (sửa điểm không nhất quán).** Một số công thức có phụ liệu là **mẫu lọc** `{loai, he, pham}` chứ không phải item cố định. Khi cố định thành item cụ thể (chốt A câu 1), giá phụ liệu phải lấy theo **giá thấp nhất khớp mẫu** (loại + hệ + phẩm), KHÔNG chọn item đắt trong dải — vì cùng một mẫu mà giá khác nhau 8 lần sẽ phá bất biến chống sinh tiền. Ví dụ mẫu `linh_duoc + mộc + phẩm-3` khớp: Tùng Tâm Chi (90), Minh Đăng Thảo (120), Cổ Mộc Tâm (130) → **lấy 90** (Tùng Tâm Chi); KHÔNG lấy 900 (Cửu Tuệ Linh Đạo là phẩm-5, sai phẩm). Áp dụng đều cho mọi phụ liệu mẫu.

**Tổng giá nguyên liệu** (dùng `gia` nguồn, QUY ĐỔI sang Linh thạch chỉ là ước lượng, CHƯA chuẩn hóa; phụ liệu mẫu tính theo giá thấp nhất khớp mẫu):

| Cỡ | Ví dụ (thành phẩm — tổng nguyên liệu + phí) |
| --- | --- |
| Luyện Khí | Hỏa Đạn Phù ~5, Định Thân Phù ~35, Cuồng Huyết Phù ~105, Tráng Đảm Đan ~44, Hồi Xuân Đan ~11 |
| Trúc Cơ | Liệt Diễm Phù ~319, Toái Giáp Phù ~322, Lôi Âm Đan ~430 (360 + phụ 90), Hoàn Hồn Đan ~260 |
| Kim Đan | Lôi Nộ Phù ~1454, Khốn Long Phù ~1954, Cửu Chuyển Kim Đan ~1915 (1850 + phụ 65*), Tái Tạo Đan ~2290 (1300 + phụ 90) |
| Nguyên Anh | Kim Lân Độc Phù ~3550, Tam Muội Hỏa Phù ~3054, Vạn Sinh Đan ~2800, Duệ Kim Đan ~5100 |

<small>*Cửu Chuyển Kim Đan phụ là hoa linh dược phẩm-3; con số chỉ minh hoạ cách cộng, chưa chốt item.</small>

**Nhận xét:**
- Chi phí do **nguyên liệu rơi quái hiếm** chi phối (không mua được) → với phù/đan dùng một lần, nguy cơ sinh tiền THẤP hơn đồ rèn (vì nguyên liệu phải cày, và thành phẩm bị tiêu thụ khi dùng, lại KHÔNG bán được NPC).
- **Phí chế (`linh_thach`)** dao động 0–1000 (Vạn Sinh Đan 1000 là cao nhất) — là chỗ xả tiền mặt trực tiếp.
- **Chu Sa / Phù Chỉ / Yêu Huyết Mặc mua ở NPC** → biến chế phù thành chỗ xả tiền (phải mua nguyên liệu nền).

**Câu hỏi cân bằng ~168.000 ở Nguyên Anh** (từ `docs/PHAN_CONG_M7.md`): người chơi dư ~168.000 Linh thạch cuối Nguyên Anh mà chỉ có đan cấp 3 + kho tông môn làm chỗ tiêu. Nghề đan / phù có thể thành chỗ tiêu mới NẾU: (a) một số nguyên liệu tầng cao **mua được ở NPC** (kiểu Thiên Hàn châu), hoặc (b) phí chế tầng Nguyên Anh cao hơn. Nhưng vì chi phí chủ yếu là nguyên liệu rơi quái (không mua), nên **phải mô phỏng mới biết xả được bao nhiêu** — đây là phần D làm sau khi có thiết kế.

**Thời gian chế:** theo chốt của A (câu 5) — **tức thì** (không theo ngày, không hàng đợi); giới hạn dùng nằm ở `def.cooldown` khi dùng đan/phù. (Nguồn ghi *"lửa văn ủ ba ngày"* là mô tả flavor, KHÔNG áp.)

---

## 6. Sáu câu hỏi đã chốt (A trả lời, đều nằm trong `docs/THIET_KE_NGHE_NHO.md`)

1. **Phụ liệu `phu`:** CỐ ĐỊNH. Mỗi phụ liệu chọn MỘT vật phẩm cụ thể; `RecipeDef.inputs` giữ `{itemId, qty}`, không làm khớp mẫu. (Giá phụ liệu mẫu: thấp nhất khớp mẫu, xem mục 5.)
2. **Hỏa pháp văn / vũ:** KHÔNG có. Chế tác tất định, một công thức một kết quả; chỉ thêm tỉ lệ hỏng nếu mô phỏng EV cho thấy cần.
3. **Bán lại:** KHÔNG bán. Đầu ra của trạm `alchemy` / `talisman` không vào `ITEM_VALUE` (nên `sellPrice` = 0), test khoá.
4. **Thọ nguyên / đột phá:** Thọ nguyên **BỎ**. Đột phá **GIỮ** — là lát 1 của nghề (`pha_binh_canh`, issue #763), KHÔNG "bỏ cả hai".
5. **Thời gian chế:** tức thì (không theo ngày, không hàng đợi); giới hạn dùng nằm ở `def.cooldown`.
6. **Nguyên liệu nền:** Chu Sa / Phù Chỉ (và Yêu Huyết Mặc) đồng ý bán ở NPC (chỗ xả Linh thạch) theo luật `SHOPS` hiện có, chốt số ở lát 2 (Bàn phù). Thảo mộc / yêu tài lát 1: lấy nguyên liệu quái rơi ĐÃ CÓ; cần nguyên liệu mới thì mở issue riêng cho A.

---

*Chưa tạo vật phẩm / công thức nào trong `shared/`. Mọi số là đề xuất, chờ mô phỏng kinh tế chốt. Khi triển khai (sau thiết kế của A) sẽ ghi nguồn vào `docs/NGUON_NOI_DUNG.md` + `CREDITS.md` theo quy tắc Asset nguồn 3.*
