# K5 — Danh sách chặn góp kho đồ tông môn (`SECT_VAULT_DENY_ITEMS`)

> Dev D, issue **#789** (K5, `QUYET_DINH_M3.md` mục 27). Soạn theo thiết kế `docs/THIET_KE_TONG_MON.md` **mục 11.8** ("Đồ không góp được" → "Vật phẩm nhiệm vụ: ... Dùng danh sách chặn `SECT_VAULT_DENY_ITEMS` (`shared/`, ban đầu **RỖNG**; test kiểm mọi id có thật). D rà các nhiệm vụ (`QUESTS`) tìm món chỉ dùng cho nhiệm vụ rồi đề xuất danh sách").
>
> **Kết luận: với dữ liệu hiện tại, danh sách để RỖNG** — KHÔNG có vật phẩm nào "chỉ dùng cho nhiệm vụ". Lý do và bằng chứng dưới đây.
>
> **Trạng thái (A đã chốt, review #990):** hằng `SECT_VAULT_DENY_ITEMS: readonly string[] = []` ĐÃ có ở `shared/src/sect.ts:72`; test "danh sách chặn chỉ chứa id có thật" ĐÃ có ở `shared/src/sect.test.ts` (ca `sectVaultAccepts`). A CHỐT **giữ RỖNG** (lý do mục 5). Tài liệu này là bản rà + ghi quyết định; KHÔNG đổi `shared/`.

## 1. Tiêu chí "đồ chỉ dùng cho nhiệm vụ" (phải chặn khỏi kho)

Một món xứng đáng vào `SECT_VAULT_DENY_ITEMS` khi **góp vào kho vừa vô ích vừa có hại**, tức nó *không có mục đích nào ngoài nhiệm vụ*:

- **Không bán được** cho NPC (`ITEM_VALUE` = 0 — theo chú thích `shared/src/currency.ts`: "giá trị 0 nghĩa là KHÔNG bán được cho NPC (đồ nhiệm vụ, đồ riêng)"), **và**
- **Không chế** (không là nguyên liệu của công thức nào trong `shared/src/recipes.ts`), **và**
- **Không dùng** (không phải đan / phù có `effect`, không phải kinh quyển học chiêu), **và**
- **Xuất hiện trong nhiệm vụ** (`QUESTS` hoặc `SECT_QUESTS` ở `sect-depth.ts`: là mục tiêu `collect` hoặc phần thưởng).

Ngược lại — món có giá bán, hoặc chế được, hoặc dùng được — góp kho là **quyền lựa chọn hợp lệ** của người chơi (ngân hàng nguyên liệu cho tông), KHÔNG phải bẫy, nên KHÔNG chặn.

## 2. Phương pháp rà

Quét MỌI `itemId` xuất hiện trong `shared/src/quests.ts` (chuỗi chính + việc phụ) và `shared/src/sect-depth.ts` (`SECT_QUESTS` hằng ngày của tông), rồi đối chiếu từng món với bốn cột: `ITEM_VALUE` (giá bán, gồm `...SKILL_BOOK_VALUE`), có trong `recipes.ts`, có `effect` (dùng được), type.

## 3. Kết quả rà (đầy đủ)

### 3a. Mục tiêu `collect` — tất cả là nguyên liệu có giá, KHÔNG món nào chỉ dùng cho nhiệm vụ

| itemId | Tên | `ITEM_VALUE` (bán) | Trong công thức | Là mục tiêu `collect` ở |
|---|---|---:|:-:|---|
| `long_tho` | Lông thỏ | 2 | ✔ (7) | quests, sect-depth |
| `nanh_soi` | Nanh sói | 4 | ✔ (6) | quests, sect-depth |
| `da_ho` | Da hổ | 18 | ✔ (11) | quests, sect-depth |
| `suong_mao` | Sương mao | 45 | ✔ (7) | quests, sect-depth |
| `quy_giap` | Quy giáp | 60 | ✔ (13) | quests, sect-depth |
| `doc_nang` | Độc nang | 90 | ✔ (14) | quests, sect-depth |
| `han_lang_mao` | Hàn Lang mao | 135 | ✔ (3) | quests, sect-depth |
| `phong_nha_vu` | Phong Nha vũ | 180 | ✔ (2) | quests, sect-depth |
| `tuong_cot` | Tượng cốt | 180 | ✔ (3) | quests, sect-depth |
| `vay_mang` | Vảy mãng | 120 | ✔ (6) | quests |
| `giao_lan` | Giao lân | 600 | ✔ (7) | quests |
| `doc_tuoc_nang` | Độc tước nang | 270 | ✔ (1) | quests |
| `thien_han_chau` | Thiên Hàn châu | 1800 | ✔ (1) | quests |

Mọi mục tiêu `collect` đều là **nguyên liệu quái rơi** có giá bán > 0 và là nguyên liệu của ít nhất một công thức rèn / đan → có hai mục đích ngoài nhiệm vụ (bán Linh thạch, chế đồ). **Không món nào lọt tiêu chí chặn.**

### 3b. Phần thưởng nhiệm vụ — đan (dùng được) hoặc kinh quyển (học được), KHÔNG món nào chỉ dùng cho nhiệm vụ

- Đan dược (`hoi_huyet_dan`, `hoi_linh_dan`, `tu_khi_dan`, `dai_hoi_*`, `thuong_hoi_*` …): `type: "consumable"`, có `effect` (hồi HP/MP/tu vi) → **dùng được**.
- Kinh quyển (`kinh_*`): `type: "book"`, dùng để **học chiêu**; có giá bán qua `SKILL_BOOK_VALUE` → dùng được + bán được.
- Nguyên liệu thưởng (`nanh_soi`, `long_tho`, `da_ho`, …): như bảng 3a — bán/chế được.

**Không phần thưởng nào "chỉ dùng cho nhiệm vụ".**

### 3c. Không có itemId nhiệm vụ nào thiếu / lạ

Mọi `itemId` trong `quests.ts` và `sect-depth.ts` đều resolves tới `ITEM_BY_ID` (không id thừa, không sai chính tả). Không phát hiện dữ liệu hỏng.

## 4. Kết luận

`SECT_VAULT_DENY_ITEMS` **giữ RỖNG** (`[]`), khớp dự liệu của thiết kế 11.8 ("ban đầu RỖNG") và quyết định của A (mục 5). Hằng đã ở `shared/src/sect.ts:72`; test "mọi id trong danh sách có thật trong `ITEM_BY_ID`" đã ở `shared/src/sect.test.ts` (ca `sectVaultAccepts`) — với danh sách rỗng, ca này thông tầm (không id để xét) nhưng vẫn giữ làm lưới an toàn khi nào thêm id. **Bất biến dữ liệu** (mục 6) — KHÔNG có vật phẩm nào vừa `ITEM_VALUE` = 0 vừa ở trong nhiệm vụ mà KHÔNG nằm trong danh sách — là guard tương lai, để làm ở PR test riêng (ưu tiên thấp).

## 5. Quyết định của A (review #990): GIỮ RỖNG, KHÔNG chặn mọi `collect`

Có một **bẫy nhẹ** ban đầu đặt ra: ngay cả nguyên liệu *có giá* (vd Lông thỏ 2 LS), người chơi góp hết vào kho rồi **không còn đủ trong túi để trả nhiệm vụ `collect`**, phải rút lại (tốn 1 lượt hạn mức Đệ tử) mới trả được. Đây là sự bất tiện chứ không mất mát (không nhân đôi, không mất đồ). **A đã xét và CHỐT KHÔNG mở rộng** — danh sách giữ rỗng, vì:

1. **Nguyên liệu là thứ kho tông môn sinh ra để chứa** (ngân hàng nguyên liệu cho tông); chặn mọi `collect` là chặn đúng món góp phổ biến nhất và làm kho vô nghĩa.
2. **Cái "bẫy" chỉ là một lượt rút thêm** (mất 1 lượt hạn mức Đệ tử), không mất đồ, không nhân đôi.
3. **Nếu người chơi kêu, xử lý bằng giao diện** (cảnh báo khi góp món đang là mục tiêu nhiệm vụ đang làm), KHÔNG bằng chặn.

→ `SECT_VAULT_DENY_ITEMS` giữ `[]`. D KHÔNG tự mở rộng tiêu chí (đổi phạm vi chặn = đổi cân bằng trải nghiệm, thuộc A).

## 6. Guard cho tương lai (khi có đồ nhiệm vụ THẬT)

Khi nào thêm vật phẩm *chỉ dùng cho nhiệm vụ* (ví dụ một "phích thư nhiệm vụ" `ITEM_VALUE` = 0, không chế/dùng), bắt buộc:

1. Thêm id vào `SECT_VAULT_DENY_ITEMS` (`shared/`); góp món đó trả `vault_denied` (đã có mã lỗi, mục 11.9).
2. **Test bất biến** (D nộp ở PR test riêng, ưu tiên thấp theo A): hàm thuần nhận bảng (nhiệm vụ, `ITEM_VALUE`, công thức, danh sách chặn) làm tham số + ca bảng giả (món `ITEM_VALUE` = 0, không chế / dùng, có trong nhiệm vụ, KHÔNG có trong danh sách chặn ⇒ đỏ; thêm vào danh sách ⇒ xanh); trên dữ liệu thật phải xanh. Đột biến: bỏ một id khỏi danh sách → test đỏ. PR chỉ test cần B / C LGTM.

## 7. Mô phỏng kinh tế nhỏ (phần 4 của #789): kho có phá nhịp cân bằng không?

Câu hỏi (issue #789 phần 4): một tông môn 30 người dùng kho theo hạn mức mặc định — một Đệ tử lấy tối đa bao nhiêu đồ / ngày, so với tốc độ rơi đồ thường?

- **Trần rút của một Đệ tử:** `SECT_VAULT_DRAW_DEFAULT` = 3 lượt / ngày × `SECT_VAULT_DRAW_QTY_DE_TU` = 10 món / lượt = **30 món / ngày** (Tông chủ có thể nâng `drawPerDay` tới `SECT_VAULT_DRAW_MAX` = 10 → trần 100 món / ngày; Tông chủ / Trưởng lão rút tự do, không hạn).
- **So với tốc độ rơi thường:** nguyên liệu phổ thông rơi từ quái dễ (vd `long_tho` chance 0,5 × trung bình 1,5 = ~0,75 món / sát thương; `nanh_soi` ~0,68 / sát thương). Một Đệ tử cày quái thường xuyên dễ đạt vài chục tới hàng trăm món / ngày — **vượt xa trần rút 30 / ngày**. Vậy hạn mức rút KHÔNG bao giờ là nút thắt và KHÔNG tạo đường tắt: Đệ tử KHÔNG thể rút nhanh hơn mình cày.
- **Giá trị Linh thạch tối đa rút được / ngày:** 30 món × giá cao nhất trong kho. Nếu rút toàn `thien_han_chau` (1800 LS) = 54.000 LS / ngày / Đệ tử — NHƯNG chỉ rút được số đã có trong kho, mà số đó do cả tông cống hiến (trừ túi → lưu hồ sơ → cộng kho, không nhân đôi, K5 phần 2-3 #790). Không có nguồn nào sinh ra `thien_han_chau` ngoài hạ Thiên Hàn Vương.
- **Kết luận:** kho đồ là cơ chế **ngân hàng / gộp nguyên liệu** (conservation — tổng đồ = tổng đã góp, do K5 phần 2-3 #790 đảm bảo), KHÔNG phải nguồn sinh đồ. Trần rút 30 / ngày / Đệ tử là một tiện lợi nhỏ, **KHÔNG phá nhịp cân bằng** vật liệu.

## 8. Cách kiểm (đã chạy, trên `origin/main` `9bdebd0c`)

- `grep` mọi `kind: "collect", itemId` ở `quests.ts` (13 id riêng) và `sect-depth.ts` (9 id riêng).
- Đối chiếu mỗi id với `ITEM_VALUE` trong `currency.ts` (kể cả `...SKILL_BOOK_VALUE` cho `kinh_*`), số lần xuất hiện trong `recipes.ts`.
- Kết quả: KHÔNG id nhiệm vụ nào có `ITEM_VALUE` = 0; mọi mục tiêu `collect` đều có ≥ 1 công thức; mọi phần thưởng đều là đan / kinh quyển / nguyên liệu có giá.
