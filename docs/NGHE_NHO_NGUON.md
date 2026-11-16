# Khảo sát nguồn nghề luyện đan + chế phù (từ Vạn Kiếp Tu Tiên)

> Tài liệu khảo sát + đề xuất của Dev D cho #749, phần 1 của #514. **Chỉ tài liệu**, chưa đụng `shared/` / `server/` / `client/`.
> Dev A dùng bản này để viết thiết kế (`docs/THIET_KE_NGHE_NHO.md`) + hợp đồng `shared/`, rồi giao lại cho D phần dữ liệu công thức + test + mô phỏng kinh tế.
>
> **Nguồn:** `~/TT/van-kiep-tu-tien-clone/site/assets/content-ClG6Ha-i.json` (bản tiếng Việt, CHỈ đọc). KHÔNG dùng `content-zh-*.json`.
> **Toàn bộ số liệu dưới đây là SỐ DỪNG BAN ĐẦU, CHƯA MÔ PHỎNG**, chỉ để A định hướng thiết kế; số cuối do mô phỏng kinh tế chốt (M7.9 sau).

---

## 1. Nguồn trong bản sao trên máy

Các khoá YAML liên quan (đọc từ JSON, giá trị là chuỗi YAML mã hoá):

| Khoá | Có gì | Số mục |
| --- | --- | --- |
| `/content/recipes/luyen_dan.yaml` | Kịch bản gặp gỡ học nghề đan (có `choices` / `scenes` / `cap_viec`), KHÔNG phải bảng nguyên liệu | 9 |
| `/content/recipes/che_phu.yaml` | Kịch bản gặp gỡ học nghề phù, tương tự | 6 |
| `/content/items/luyen_che/luyen_dan.yaml` | Phương dược (tờ phương `don_phuong` — vật phẩm kiến thức, `day` trỏ tới công thức thật) | 91 |
| `/content/items/luyen_che/che_phu.yaml` | Dụng cụ chế phù (bút, giấy, mực…) + phương phù | 79 |
| `/content/items/dan_duoc.yaml` | Đơn dược (thành phẩm đan) | 85 |
| `/content/items/phu_luc.yaml` | Phù lục (thành phẩm phù) | 66 |
| `/content/encounters/nghe/{luyen_dan,che_phu,chung}.yaml` | Sự kiện khi hành nghề, kết quả `luyen_thanh/thuong/ha/hong` | flavor, không phải bảng |
| (nút `recipes` trong JSON) | **Công thức thật** — mỗi cái có `chu` (chủ liệu), `phu` (phụ liệu), `hoa` (hỏa pháp), `linh_thach` (phí), `ra` (thành phẩm), `mo_ta` | ~274 |

**Cấu trúc công thức thật** (ví dụ `dp.hoa_dan_phu`):

```yaml
id: dp.hoa_dan_phu
chu:  [{id: item.chu_sa, so: 1}, {id: item.phu_chi, so: 1}]   # chủ liệu: list {id, so}
phu:  [{loai: linh_duoc, he: [moc], pham: 2, so: 1}]          # phụ liệu: MẪU lọc (xem mục 5)
hoa:  van        # văn hỏa / vũ hỏa — cách lửa, ảnh hưởng tỉ lệ thành công
linh_thach: 2    # phí Linh thạch
ra: item.hoa_dan_phu
nguon: [pho_bien]  # pho_bien (phổ biến) / co (hiếm) — nguồn mở khoá công thức
```

**Cảnh giới nguồn (`canh_gioi`) ánh xạ sang Tiên Giới:** 0–1 → Luyện Khí, 2 → Trúc Cơ, 3 → Kim Đan, 4 → Nguyên Anh, **5 → Hóa Thần (vượt trần nội dung TT, LOẠI)**.

**Hai cơ chế nguồn có, TT chưa có** (chi tiết ở mục 3, 5):
- `dot_pha` — tăng tỉ lệ đột phá cảnh giới (đan phần lớn là để "đột phá", không phải hồi máu).
- `tu_luyen` — tự tu theo năm (`nam`, `toc_do`), cơ chế tu luyện ngoại tuyến theo thời gian.

---

## 2. Bảng chọn lọc — Luyện đan (10 công thức)

Ưu tiên thứ **dịch được sang chiến đấu thời gian thực**: đan hồi + đan tăng chỉ số có thời hạn. Đánh dấu ★ = điểm sáng (cơ chế TT chưa có, không trùng đan hiện có). Bậc cảnh giới theo `canh_gioi` nguồn.

| Bậc | Thành phẩm | Nguyên liệu (chủ + phụ) | Phí | Hiệu ứng (số + nguyên văn) |
| --- | --- | --- | --- | --- |
| Luyện Khí | **Tráng Đảm Đan** ★ | Hùng Đảm ×1 | 4 | Bạo phát +1 đòn gấp rưỡi, hồi 15% khí huyết. *"giữa trận một lượt ra đòn nặng gấp rưỡi, hồi chút khí huyết, không hại thân"* |
| Luyện Khí | Hồi Xuân Đan | Huyết Đỉa Dịch ×1 | 1 | Hồi 25% khí huyết. *"giữa trận hồi một phần tư khí huyết"* |
| Luyện Khí | Tụ Linh Đan | Nhất Giai Yêu Đan ×1 | 0 | Hồi linh lực (+4 hơi thở). *"linh lực trong kinh mạch dâng lên"* |
| Trúc Cơ | **Lôi Âm Đan** ★ | Lôi Kiếp Trúc ×1 + phụ mộc linh dược ×1 | 40 | Bạo phát +2 đòn gấp rưỡi, hồi linh lực. *"hai lượt ra đòn nặng gấp rưỡi, linh lực thêm bốn hơi thở"* |
| Trúc Cơ | Hoàn Hồn Đan | Minh Đăng Thảo ×2 | 20 | Hồi 55% khí huyết. *"giữa trận hồi quá nửa khí huyết"* |
| Trúc Cơ | Ngưng Nguyên Đan | Trầm Uyên Tảo ×1 | 30 | Hồi linh lực (+6). *"thêm sáu hơi thở linh lực"* |
| Kim Đan | **Cửu Chuyển Kim Đan** ★ | Vạn Niên Tùng Chi ×1 + phụ hoa linh dược ×1 | 50 | Hồi 60% khí huyết + linh lực. *"giữa trận hồi sáu phần khí huyết"* (thêm thọ nguyên — TT không có, bỏ, xem mục 3) |
| Kim Đan | Tái Tạo Đan | Mãng Hồn Chi ×1 + phụ phẩm-5 ×1 | 100 | Hồi 60% khí huyết. *"trọng thương hạ còn thương nhẹ, thương nặng thì lành hẳn"* |
| Nguyên Anh | **Duệ Kim Đan** ★ | Cửu Diệp Kiếm Thảo ×1 + Hạt Vương Độc Thích ×1 | 200 | Bạo phát +3 đòn gấp rưỡi, hồi linh lực. *"ba lượt ra đòn nặng gấp rưỡi, linh lực thêm sáu hơi thở"* |
| Nguyên Anh | Vạn Sinh Đan | Cửu Tuệ Linh Đạo ×1 + phụ mộc phẩm-5 ×1 | 1000 | Hồi 65% khí huyết. *"sinh cơ tràn khắp kinh mạch… hồi hơn sáu phần khí huyết"* |

**Loại bỏ (luyện đan) + lý do:**
- **Đan đột phá (`dot_pha`)** — Trúc Cơ Đan và các đan tăng tỉ lệ đột phá cảnh giới khác: cơ chế theo lượt TT không có (TT tiến cảnh giới theo bậc cố định).
- **Đan tự tu (`tu_luyen`)** — Dưỡng Khí Đan…: tu theo năm/tháng, cơ chế ngoại tuyến TT không có.
- **Đan phá bình cảnh (`pha_binh_canh`)** — Phá Chướng Đan…: phá tường cảnh giới, cần hệ thống TT chưa có.
- **Đan hồi/thần thức trùng lặp** — Sinh Cơ Đan (hồi 40% = Hồi Huyết Đan hiện có), Bổ Khí Đan (hồi linh lực ~ Hồi Linh Đan): trùng đan hiện có, KHÔNG cần làm lại (xem mục 3).
- **Siêu trần** — Thương Long Đan, Kim Ô Đan, Tạo Hóa Đan (cảnh giới 5 Hóa Thần): vượt trần nội dung TT.
- **Cần hệ thống trạng thái TT chưa có** — Tịch Độc Đan (trừ độc: cần cơ chế độc/trạng thái), Định Thần Đan (tam ma): đề nghị để sau nếu làm hệ trạng thái.

---

## 3. Bảng chọn lọc — Chế phù (10 công thức)

Phù lục nguồn là **vật phẩm dùng một lần** (consumable), khác với "Hộ phù" (trang bị ô talisman) của TT. Ưu tiên phù tấn công / giảm chỉ số đối thủ dùng một lần. Hiệu ứng trong nguồn mô tả bằng văn xuôi (`dung` cấu trúc gần như trống), nên lấy nguyên văn làm mô tả.

| Bậc | Thành phẩm | Hệ | Nguyên liệu | Phí | Hiệu ứng (nguyên văn) |
| --- | --- | --- | --- | --- | --- |
| Luyện Khí | Hỏa Đạn Phù | Hoa | Chu Sa ×1, Phù Chỉ ×1 | 2 | Sát thương đơn mục tiêu. *"ném ra nổ thành một quả cầu lửa cỡ nắm tay"* |
| Luyện Khí | Định Thân Phù | Thổ | Chu Sa ×1, Phù Chỉ ×1, Điệp Phấn ×1 | 0 | Choáng/giam đối thủ. *"dán trúng người thì tê cứng cả thân… đủ cho ngươi ra thêm một đòn"* |
| Luyện Khí | Cuồng Huyết Phù | Hoa | Chu Sa ×2, Phù Chỉ ×1, Yêu Huyết Mặc ×2, Huyết Linh Chi ×1 | 30 | Tăng sát thương (buff). *"ra đòn nặng hơn thường"* |
| Luyện Khí | Phi Châm Phù | Kim | Chu Sa ×2, Phù Chỉ ×2, Yêu Huyết Mặc ×1, Kim Mạch Đạo ×2 | 30 | Sát thương diện rộng. *"nổ thành cả trăm mũi kim, bắn tạt vào đám địch trước mặt"* |
| Trúc Cơ | Liệt Diễm Phù | Hoa | Chu Sa ×2, Phù Chỉ ×3, Hỏa Tinh Châu ×2, Hỏa Kê Vũ ×1 | 0 | Cột lửa AoE. *"một cột lửa phụt thẳng từ đất lên, cao ba trượng"* |
| Trúc Cơ | Toái Giáp Phù | Kim | Chu Sa ×2, Phù Chỉ ×3, Yêu Huyết Mặc ×2, Tê Ngưu Giác ×1, Kim Tuệ Mạch ×1 | 40 | Giảm phòng thủ đối thủ. *"giáp trụ, vảy cứng đều nứt toác, đòn sau ăn sâu hơn"* |
| Kim Đan | Lôi Nộ Phù | Lôi | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Lôi Linh Châu ×2 | 300 | Buff + sát thương. *"lôi khí chạy khắp người… đòn đánh ra kèm tiếng sấm"* |
| Kim Đan | Khốn Long Phù | Thổ | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Sơn Tinh Hạch ×2, Cửu Khúc Hoàng Tinh ×1 | 0 | Giam chân đối thủ. *"đất dưới chân đối thủ dựng lên khóa chặt, giãy một lượt mới ra"* |
| Nguyên Anh | Kim Lân Độc Phù | Mộc | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Kim Lân Mãng Đởm ×1 (+ phụ yêu tài phẩm-5) | 50 | Ngộ độc DoT. *"một đạo khí lục quấn lấy đối thủ, chỗ nào chạm vào là da thịt thâm đen"* |
| Nguyên Anh | Tam Muội Hỏa Phù | Hoa | Chu Sa ×3, Phù Chỉ ×3, Yêu Huyết Mặc ×3, Ngô Đồng Chi ×2 | 0 | Lửa DoT bền. *"ngọn lửa phù bám vào đâu cháy tới đó, nước dội không tắt"* |

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

**Các nguyên liệu nghề đan/fù của nguồn là MỚI gần như toàn bộ**, khác tên và khác loại:
- **Linh dược (`linh_duoc`, thảo mộc)**: Huyết Linh Chi, Minh Đăng Thảo, Lôi Kiếp Trúc, Trầm Uyên Tảo, Vạn Niên Tùng Chi, Mãng Hồn Chi, Cửu Tuệ Linh Đạo, Cửu Diệp Kiếm Thảo, Kim Tuệ Mạch, Cửu Khúc Hoàng Tinh, Ngô Đồng Chi… → **PHẢI thêm**, đề xuất gắn nguồn rơi/thu hái có thật (mỗi loài/cây một vùng, theo bậc cảnh giới).
- **Yêu tài (`yeu_tai`, rơi quái)**: Huyết Đỉa Dịch, Hùng Đảm, Nhất Giai Yêu Đan, Hỏa Tinh Châu, Tê Ngưu Giác, Lôi Linh Châu, Sơn Tinh Hạch, Kim Lân Mãng Đởm, Hạt Vương Độc Thích… → **PHẢI thêm**, gắn quái rơi có thật.
- **Nguyên liệu nền phù (2 loại)**: **Chu Sa** (hoa hệ, phẩm-1, giá 2) và **Phù Chỉ** (giá 1) — rẻ, dùng cho MỌI phù. → **Đề xuất mua được ở NPC** (như mô hình cửa hàng đan hồi), để chế phù tốn Linh thạch = một chỗ xả tiền.
- **Yêu Huyết Mặc** (nguyên liệu, hoa hệ, phẩm-2): xuất hiện trong hầu hết phù trung-cao cấp → đề xuất làm nguyên liệu rơi tầm trung, có thật.

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

**Quy tắc chống sinh tiền** (từ `shared/src/currency.ts`, bất biến test giữ): giá NPC thu mua thành phẩm = `ITEM_VALUE × 0.5`, và phải **≤ tổng giá nguyên liệu + phí chế**, để không có vòng "chế rồi bán lại có lời". Đồ tiêu dùng tự chế còn có thể đặt `ITEM_VALUE = 0` (không bán được) — cách an toàn nhất.

**Tổng giá nguyên liệu** (dùng `gia` nguồn, QUY ĐỔI sang Linh thạch chỉ là ước lượng, CHƯA chuẩn hóa):

| Cỡ | Ví dụ (thành phẩm — tổng nguyên liệu + phí) |
| --- | --- |
| Luyện Khí | Hỏa Đạn Phù ~5, Định Thân Phù ~35, Cuồng Huyết Phù ~105, Tráng Đảm Đan ~44, Hồi Xuân Đan ~11 |
| Trúc Cơ | Liệt Diễm Phù ~319, Toái Giáp Phù ~322, Lôi Âm Đan ~475, Hoàn Hồn Đan ~260 |
| Kim Đan | Lôi Nộ Phù ~1454, Khốn Long Phù ~1954, Cửu Chuyển Kim Đan ~1950, Tái Tạo Đan ~2200 |
| Nguyên Anh | Kim Lân Độc Phù ~3550, Tam Muội Hỏa Phù ~3054, Vạn Sinh Đan ~2800, Duệ Kim Đan ~5100 |

**Nhận xét:**
- Chi phí do **nguyên liệu rơi quái hiếm** chi phối (không mua được) → với phù/đan dùng một lần, nguy cơ sinh tiền THẤP hơn đồ rèn (vì nguyên liệu phải cày, và thành phẩm bị tiêu thụ khi dùng).
- **Phí chế (`linh_thach`)** dao động 0–1000 (Vạn Sinh Đan 1000 là cao nhất) — là chỗ xả tiền mặt trực tiếp.
- **Chu Sa / Phù Chỉ mua ở NPC** → biến chế phù thành chỗ xả tiền (phải mua nguyên liệu nền).

**Câu hỏi cân bằng ~168.000 ở Nguyên Anh** (từ `docs/PHAN_CONG_M7.md`): người chơi dư ~168.000 Linh thạch cuối Nguyên Anh mà chỉ có đan cấp 3 + kho tông môn làm chỗ tiêu. Nghề đan/fù có thể thành chỗ tiêu mới NẾU: (a) một số nguyên liệu tầng cao **mua được ở NPC** (kiểu Thiên Hàn châu), hoặc (b) phí chế tầng Nguyên Anh cao hơn. Nhưng vì chi phí chủ yếu là nguyên liệu rơi quái (không mua), nên **phải mô phỏng mới biết xả được bao nhiêu** — đây là phần D làm sau khi có thiết kế.

**Thời gian chế:** nguồn ghi *"lửa văn ủ ba ngày"* (nhiều ngày) — KHÔNG hợp thời gian thực. Đề xuất: chế **tức thì có hồi chiêu** hoặc **vài giây**, KHÔNG theo ngày. (Cần A chốt, xem mục 6.)

---

## 6. Câu hỏi mở cho A

1. **Phụ liệu (`phu`) là MẪU lọc, không phải item cố định.** Nguồn ghi phụ liệu dạng `{loai: linh_duoc, he: [moc], pham: 2}` — "any mộc herb phẩm-2" — trong khi `RecipeDef.inputs` của TT là list `{itemId, qty}` cố định. A chọn: (a) **cố định** mỗi phụ liệu thành một item cụ thể (đơn giản, đề xuất cho v1), hay (b) làm cơ chế **khớp mẫu** trong system chế?
2. **Hỏa pháp (`hoa`: văn/vũ).** Nguồn có hai cách lửa cho mỗi công thức, ảnh hưởng tỉ lệ thành/bị lỗi. System chế của TT mô hình hóa cách lửa (minigame cho B), hay chỉ một tỉ lệ thành công phẳng?
3. **Bán lại đồ tự chế.** Phù/đan tự chế có cho bán NPC không? Đề xuất: đặt `ITEM_VALUE = 0` (không bán) cho đồ tiêu dùng tự chế — chống sinh tiền đơn giản nhất. A chốt?
4. **Thọ nguyên / đột phá.** Nguồn có `thọ nguyên` (Cửu Chuyển Kim Đan +80 năm) và `dot_pha` (đột phá) — TT không có cả hai. Xác nhận **bỏ hẳn** hai hiệu ứng này, chỉ giữ hồi/buff/sát thương?
5. **Thời gian chế.** Tức thì + hồi chiêu, hay có thời gian chế vài giây? (Nguồn "ba ngày" không hợp thời gian thực.)
6. **Nguyên liệu nền / thảo mộc có mua được ở NPC không?** Chu Sa, Phù Chỉ và một số thảo mộc có nên bán ở NPC (để chế phù là chỗ xả tiền), hay hoàn toàn do quái/rừng rơi?

---

*Chưa tạo vật phẩm / công thức nào trong `shared/`. Mọi số là đề xuất, chờ mô phỏng kinh tế chốt. Khi triển khai (sau thiết kế của A) sẽ ghi nguồn vào `docs/NGUON_NOI_DUNG.md` + `CREDITS.md` theo quy tắc Asset nguồn 3.*
