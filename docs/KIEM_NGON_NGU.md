# Rà soát ngôn ngữ hiển thị (Issue #885 · G1)

> Trạng thái: **Đã xong** — test chéo (`shared/src/ngon-ngu.test.ts`) đỏ nếu phát hiện chữ Hán/CJK, khoảng trắng thừa / ký tự điều khiển, thuật ngữ "Linh thạch" viết sai chuẩn, id nội bộ lộ vào chữ hiển thị, hoặc toast / lời thoại thiếu dấu chấm cuối câu. Báo cáo này là ảnh chụp số liệu tại thời điểm kiểm.
>
> **Không đổi id / số liệu / hành vi** — việc này chỉ KIỂM CHỨNG (test chéo). Chưa sửa chữ nào vì dữ liệu hiện KHÔNG có lỗi. Nếu sau này test đỏ, sửa CHỮ trong dữ liệu (KHÔNG đụng id / số) hoặc mở issue `dev-a` nếu là vấn đề thiết kế.

## 1. Mục đích & phương pháp

Chữ hiển thị cho người chơi (tên / mô tả vật phẩm, chiêu, quái, NPC, nhiệm vụ, lời thoại, toast máy chủ) phải sạch Việt và nhất quán:

- **(a)** KHÔNG ký tự CJK (chữ Hán / Nhật / Hàn).
- **(b)** KHÔNG khoảng trắng thừa đầu/cuối, KHÔNG hai dấu cách liền nhau, KHÔNG ký tự điều khiển.
- **(c)** Lời thoại NPC và toast máy chủ (`sectFailMessage`) là câu đủ — kết thúc dấu chấm.
- **(d)** Thuật ngữ "Linh thạch" viết đúng chuẩn chữ hoa–thường (không "linh thạch", "Linh Thạch", "LINH THẠCH"). Các thuật ngữ khác (`khí huyết`, `tu vi`, `tông môn`, `cống hiến`, `công tích`) theo quy tắc chữ hoa đầu câu nên KHÔNG bắt cứng; `SECT_TERMS` đã giữ chuẩn ở một nơi.
- **(e)** KHÔNG lộ id nội bộ (`snake_case`) vào chữ hiển thị.

Kiểm bằng hàm thuần trong `shared/src/ngon-ngu.test.ts`: đi sâu (recursive walk) vào các bảng dữ liệu thật (`ITEMS`, `MONSTERS`, `NPCS`, `QUESTS`, `SKILLS_M7`, `SKILL_BOOK_ITEMS`, `SECT_TERMS`) và chỉ nhặt chuỗi ở **trường hiển thị** (`name` / `desc` / `title` / `bookName` / `dialog` / `talk` / ...), bỏ qua `id` / số / enum. Toast kiểm qua `sectFailMessage(reason)` với mọi `SECT_FAILS`; lời thoại kiểm từng mục `NPCS[].dialog`.

## 2. Kết quả tổng quát

| Chỉ số | Giá trị |
| --- | --- |
| Chuỗi hiển thị đã quét (samples) | **432** |
| Toast máy chủ (`sectFailMessage`) | **48** |
| Lời thoại NPC (`NPCS[].dialog`) | **65** |
| Id nội bộ đã biết (để đối chiếu lộ id) | **160** |
| Lỗi CJK | **0** |
| Lỗi khoảng trắng / điều khiển | **0** |
| Lỗi thuật ngữ "Linh thạch" | **0** |
| Lỗi lộ id nội bộ | **0** |
| Toast / lời thoại thiếu dấu chấm | **0** |

**Kết luận: dữ liệu hiển thị hiện KHÔNG có lỗi ngôn ngữ.** Test `shared/src/ngon-ngu.test.ts` (4 điều kiện) chạy xanh.

## 3. Nhận xét về dữ liệu

- **Không chữ Hán/CJK** trong mọi chuỗi hiển thị — phù hợp quy ước "không chữ Hán / CJK" (AGENTS.md).
- **"Linh thạch" nhất quán:** mọi chỗ đều viết "Linh thạch" (hoa L, thường thạch); không có biến thể sai.
- **`khí huyết` / `tu vi` / `tông môn` / `cống hiến` / `công tích`** viết thường giữa câu, chỉ hoa chữ cái đầu câu — đúng quy ước tiếng Việt, nên test KHÔNG bắt cứng (chỉ bắt "Linh thạch" vì đây là danh từ riêng của tiền tệ, luôn hoa).
- **Toast & lời thoại** đều là câu đủ kết thúc dấu chấm; tên / tiêu đề / mô tả là cụm từ nên KHÔNG áp dấu chấm (test tách riêng hai nhóm).

## 4. Đột biến ĐỎ (tự làm, dán kết quả)

Commit test trước, rồi inject lỗi vào dữ liệu, chạy test, xác nhận ĐỎ, phục hồi bằng `git checkout --`:

- **Inject:** đổi `ITEMS[0].desc` thành `"Hồi 40% khí huyết 病 hoi_huyet_dan."` (thêm một chữ Hán `病` + một id nội bộ `hoi_huyet_dan` lộ vào mô tả).
- **Kết quả:** test `mọi chữ hiển thị đều sạch` **ĐỎ**, báo đúng hai lỗi:
  - `ITEMS[0].desc (desc): "..." — chữ Hán/CJK`
  - `ITEMS[0].desc (desc): "..." — lộ id nội bộ "hoi_huyet_dan"`
- **Phục hồi:** `git checkout -- shared/src/items.ts` → test trở lại xanh (4/4).

Đột biến này chứng minh test thực sự phát hiện lỗi chứ không phải luôn đúng.

## 5. Kết luận cho Dev A

- **Không cần hành động sửa dữ liệu.** Dữ liệu hiển thị sạch, nhất quán.
- **Kiểm chứng lâu dài:** `shared/src/ngon-ngu.test.ts` chạy trong `npm test` mọi nơi — thêm chữ Hán, thả id nội bộ vào mô tả, hoặc viết sai "Linh thạch" thì test RED, buộc sửa trước khi merge.
- **Nếu phát hiện thuật ngữ mới cần chuẩn hoá** (vd có nơi viết "linh thạch" nhỏ): sửa CHỮ trong dữ liệu (KHÔNG đổi id / số), test sẽ xanh trở lại.
- **Mở rộng phạm vi:** hiện quét 6 bảng nội dung chính + `SECT_TERMS` + toast + lời thoại. Nếu sau có bảng hiển thị mới (boss, sự kiện...), thêm vào `samples` trong test và/hoặc bổ sung trường vào `DISPLAY_FIELDS`.
