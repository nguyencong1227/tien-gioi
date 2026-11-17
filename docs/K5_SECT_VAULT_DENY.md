# K5 — Danh sách chặn góp kho đồ tông môn (`SECT_VAULT_DENY_ITEMS`)

> Dev D, issue **#789** (K5, `QUYET_DINH_M3.md` mục 27). Soạn theo thiết kế `docs/THIET_KE_TONG_MON.md` **mục 11.8** ("Đồ không góp được" → "Vật phẩm nhiệm vụ: ... Dùng danh sách chặn `SECT_VAULT_DENY_ITEMS` (`shared/`, ban đầu **RỖNG**; test kiểm mọi id có thật). D rà các nhiệm vụ (`QUESTS`) tìm món chỉ dùng cho nhiệm vụ rồi đề xuất danh sách").
>
> **Kết luận: với dữ liệu hiện tại, danh sách để RỖNG** — KHÔNG có vật phẩm nào "chỉ dùng cho nhiệm vụ". Lý do và bằng chứng dưới đây; A chốt rồi đặt hằng số + test vào `shared/` (K1).

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

`SECT_VAULT_DENY_ITEMS` **để RỖNG** (`[]`) ở K1, khớp dự liệu của thiết kế 11.8 ("ban đầu RỖNG"). Test kèm (`shared/`, A đặt) kiểm: (a) mọi id trong danh sách (hiện không có) đều có thật trong `ITEM_BY_ID`; (b) **bất biến dữ liệu** — KHÔNG có vật phẩm nào vừa có `ITEM_VALUE` = 0 (hoặc không bán được) vừa xuất hiện trong nhiệm vụ mà KHÔNG nằm trong danh sách chặn (xem mục 6).

## 5. Câu hỏi mở cho A (có nên mở rộng tiêu chí?)

Mặc định trên chỉ chặn đồ *không có giá trị kinh tế*. Còn một **bẫy nhẹ** A có thể muốn chặn thêm: ngay cả nguyên liệu *có giá* (vd Lông thỏ 2 LS), người chơi góp hết vào kho rồi **không còn đủ trong túi để trả nhiệm vụ `collect`**, phải rút lại (tốn 1 lượt hạn mức Đệ tử) mới trả được. Đây là sự bất tiện chứ không mất mát (không nhân đôi, không mất đồ).

- **Hướng an toàn (đề xuất giữ):** KHÔNG chặn — nguyên liệu có giá, góp kho là hợp lệ; bẫy chỉ là một cú rút thêm. Phù hợp chữ "chỉ dùng cho nhiệm vụ" trong 11.8.
- **Hướng rộng hơn (A chọn nếu muốn):** chặn MỌI `itemId` là mục tiêu `collect` (bất kể giá), để người chơi KHÔNG bao giờ góp mất đồ đang cần trả nhiệm vụ. Nếu chọn hướng này, danh sách = đúng 13 id ở bảng 3a; D có thể nộp danh sách cụ thể + test theo yêu cầu.

**D không tự mở rộng tiêu chí** (đổi phạm vi chặn = đổi cân bằng trải nghiệm, A chốt).

## 6. Guard cho tương lai (khi có đồ nhiệm vụ THẬT)

Khi nào thêm vật phẩm *chỉ dùng cho nhiệm vụ* (ví dụ một "phích thư nhiệm vụ" `ITEM_VALUE` = 0, không chế/dùng), bắt buộc:

1. Thêm id vào `SECT_VAULT_DENY_ITEMS` (`shared/`); góp món đó trả `vault_denied` (đã có mã lỗi, mục 11.9).
2. Test bất biến (D nộp ở K5): với mọi `itemId` trong `QUESTS` + `SECT_QUESTS`, nếu món đó KHÔNG bán được (`ITEM_VALUE` = 0) VÀ KHÔNG chế/dùng được → phải có trong `SECT_VAULT_DENY_ITEMS`. Đột biến: bỏ một id khỏi danh sách → test đỏ.

## 7. Cách kiểm (đã chạy, trên `origin/main` `9bdebd0c`)

- `grep` mọi `kind: "collect", itemId` ở `quests.ts` (13 id riêng) và `sect-depth.ts` (9 id riêng).
- Đối chiếu mỗi id với `ITEM_VALUE` trong `currency.ts` (kể cả `...SKILL_BOOK_VALUE` cho `kinh_*`), số lần xuất hiện trong `recipes.ts`.
- Kết quả: KHÔNG id nhiệm vụ nào có `ITEM_VALUE` = 0; mọi mục tiêu `collect` đều có ≥ 1 công thức; mọi phần thưởng đều là đan / kinh quyển / nguyên liệu có giá.
