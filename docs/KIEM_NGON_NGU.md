# Rà soát ngôn ngữ hiển thị (Issue #885 · G1)

> Trạng thái: **Đã xong** (G viết bộ kiểm đầu tiên; A sửa theo review của A và B ở #964). Test chéo `shared/src/ngon-ngu.test.ts` đỏ nếu phát hiện chữ Hán / CJK, khoảng trắng thừa / ký tự điều khiển, chữ không ở dạng Unicode NFC, thuật ngữ "Linh thạch" viết sai, id nội bộ lộ vào chữ hiển thị, hoặc lời thoại / toast không kết thúc dấu câu.
>
> **Không đổi id / số liệu / hành vi.** Việc này chỉ KIỂM CHỨNG (test chéo). Chưa sửa chữ nào vì dữ liệu hiện KHÔNG có lỗi. Nếu sau này test đỏ, sửa CHỮ trong dữ liệu (không đổi id / số).

## 1. Mục đích và phương pháp

Chữ hiển thị cho người chơi (tên / mô tả vật phẩm, chiêu, quái, NPC, nhiệm vụ, lời thoại, toast máy chủ, nhiệm vụ tông, cấp tông, chiêu trùm, bí cảnh, thành tựu, danh hiệu) phải sạch Việt và nhất quán:

- **(a)** KHÔNG ký tự CJK (chữ Hán / Nhật / Hàn / Bopomofo, dấu câu CJK, dạng toàn chiều). Regex dùng GIỐNG HỆT `server/scripts/no-cjk.test.ts` (một ca của bộ kiểm đọc tệp đó và so khớp nguyên văn, để hai bản không lệch nhau).
- **(b)** KHÔNG khoảng trắng thừa đầu / cuối, KHÔNG hai dấu cách liền nhau, KHÔNG ký tự điều khiển.
- **(c)** Lời thoại NPC, lời thoại nhiệm vụ tông (`talk.offer / progress / complete`) và toast máy chủ (`sectFailMessage`) là câu đủ: kết thúc bằng `.` `!` `?` hoặc chấm lửng, có thể theo sau dấu đóng nháy / ngoặc.
- **(d)** Thuật ngữ "Linh thạch" viết đúng chữ hoa-thường chuẩn (không "linh thạch", "Linh Thạch", "LINH THẠCH"); chạy trên bản NFC nên bản NFD không lọt.
- **(e)** KHÔNG lộ id nội bộ: chữ hiển thị tiếng Việt không bao giờ có `_` giữa hai ký tự chữ-số, nên kiểm theo MẪU `/[A-Za-z0-9]_[A-Za-z0-9]/` (không cần danh sách id đã biết: id của bảng mới như nhiệm vụ tông, chiêu trùm, bí cảnh cũng bị bắt).
- **(f)** Chữ ở dạng Unicode **NFC** (dạng dựng sẵn): dạng tổ hợp (NFD) trông giống hệt nhưng so sánh / tìm kiếm / phông chữ khác nhau.

Kiểm bằng hàm thuần trong `shared/src/ngon-ngu.test.ts` (`collectDisplay`, `fromTable`, `violationsOf`): đi sâu vào các bảng dữ liệu thật, chỉ nhặt chuỗi ở trường hiển thị (`DISPLAY_FIELDS`: `name`, `desc`, `title`, `bookName`, `dialog`, `talk`, `offer`, `progress`, `complete`, `text`, ...), báo kèm vị trí đầy đủ (vd `SECT_QUESTS[3](st_nop_thu_pham).talk.offer[0]`).

## 2. Phạm vi quét (sau khi mở rộng ở #964)

| Bảng | Trường | Số chuỗi |
| --- | --- | --- |
| `ITEMS` | tên, mô tả | 198 |
| `MONSTERS` | tên | 16 |
| `NPCS` | tên, lời thoại | 98 |
| `QUESTS` | tên, mô tả, lời thoại | 258 |
| `LEARNABLE_SKILLS` | tên chiêu, tên quyển, mô tả (mọi chiêu học được, gồm 18 chiêu cũ và các đợt chiêu mới) | 90 |
| `SKILL_BOOK_ITEMS` | tên, mô tả kinh quyển tự dựng | 60 |
| `SECT_QUESTS` | `title`, `desc`, lời thoại `talk.offer / progress / complete` | 60 |
| `SECT_LEVELS` | tên 5 cấp tông | 5 |
| `BOSSES` | tên chiêu trùm (hiện trên thanh máu) | 17 |
| `DUNGEONS` | tên bí cảnh | 1 |
| `ACHIEVEMENTS` | tên, mô tả thành tựu | 108 |
| `TITLES` | chữ danh hiệu | 32 |
| `SECT_TERMS` | thuật ngữ hiển thị | 7 |
| **Tổng** | | **950** |

Ngoài ra: **48 toast** máy chủ (`sectFailMessage`), **70 lời thoại NPC** và **36 lời thoại nhiệm vụ tông** phải là câu đủ. Một ca riêng đòi mỗi bảng mới thật sự được quét tới tầng chữ (`SECT_QUESTS.talk.offer[i]`, `BOSSES[i].abilities[j].name`, ...), vì lỗi cấu trúc dễ gặp nhất là `talk` là object nên bị bỏ qua nếu tên mảng con không nằm trong `DISPLAY_FIELDS`.

Khi thêm bảng hiển thị mới (vd `SECT_SHOP` khi có chữ, lịch trùm thế giới của E), thêm vào `samples` ở đầu `ngon-ngu.test.ts` và vào bảng trên.

## 3. Kết quả

**Dữ liệu hiển thị hiện KHÔNG có lỗi ngôn ngữ**: 0 lỗi CJK, 0 khoảng trắng / điều khiển, 0 chữ NFD, 0 "Linh thạch" sai chuẩn, 0 id lộ, 0 toast / lời thoại thiếu dấu câu (950 chuỗi + 48 + 70 + 36). Test `shared/src/ngon-ngu.test.ts` chạy xanh (14 ca: 6 ca dữ liệu thật + 8 ca chứng minh từng quy tắc bằng dữ liệu giả).

Nhận xét: "Linh thạch" nhất quán (hoa L, thường thạch); `khí huyết` / `tu vi` / `tông môn` / `cống hiến` viết thường giữa câu là đúng quy ước tiếng Việt nên KHÔNG bị bắt; tên / tiêu đề / mô tả là cụm từ nên không áp dấu chấm (chỉ lời thoại và toast).

## 4. Đột biến → ĐỎ (mã thật commit TRƯỚC, rồi chèn lỗi vào DỮ LIỆU THẬT, chạy, `git checkout --` sau mỗi lần)

Mỗi quy tắc một đột biến riêng; test phải ĐỎ đúng quy tắc và nêu ĐÚNG vị trí:

| Quy tắc | Lỗi chèn vào dữ liệu thật | Kết quả (vị trí báo) |
| --- | --- | --- |
| (a) CJK | thêm một chữ Hán vào lời thoại `SECT_QUESTS[3].talk.offer` | ĐỎ: `SECT_QUESTS[3].talk.offer[0] — chữ Hán/CJK` (kiểm luôn phần quét `talk` mới) |
| (b) khoảng trắng | "Khai  thác" (hai dấu cách) ở `SECT_QUESTS[5].desc` | ĐỎ: `SECT_QUESTS[5].desc — hai dấu cách liền nhau` |
| (c) lời thoại | bỏ dấu chấm cuối `SECT_QUESTS[3].talk.offer[0]` | ĐỎ: `SECT_QUESTS[3](st_nop_thu_pham).talk.offer[0]` |
| (c) toast | bỏ dấu chấm cuối toast `disabled` | ĐỎ: `disabled: "Tông môn tạm thời chưa mở"` |
| (d) thuật ngữ | "thưởng linh thạch" (viết thường) ở `SECT_QUESTS[5].desc` | ĐỎ: `thuật ngữ "Linh thạch" viết không chuẩn: "linh thạch"` |
| (e) lộ id | đổi tên chiêu trùm `BOSSES[0].abilities[0].name` thành `quat_duoi` (id CHƯA nằm trong danh sách id nào) | ĐỎ: `BOSSES[0].abilities[0].name — lộ id nội bộ (snake_case)` |
| (f) NFC | tên bí cảnh `DUNGEONS[0].name` ở dạng NFD | ĐỎ: `DUNGEONS[0].name — chữ không ở dạng Unicode NFC` |

Hai ca (e) với id chưa biết và (f) NFD là LỖ HỔNG của bộ kiểm cũ (chỉ so với `knownIds` của 5 bảng; không có quy tắc NFC; không quét `BOSSES`): bản cũ XANH với cả hai lỗi, bản mới ĐỎ.

Ngoài ra tám ca trong `describe("mỗi quy tắc có ca chứng minh (dữ liệu giả)")` kiểm từng quy tắc bằng chuỗi dựng sẵn (kể cả chữ Hán mở rộng B ngoài BMP, dấu phẩy / hai chấm toàn chiều, dấu chấm CJK, Bopomofo, bản NFD của "linh thạch"), kiểm không báo oan chuỗi sạch, và kiểm quét báo đúng `where` của `talk.offer[i]`.

## 5. Kết luận cho Dev A

- **Không cần hành động sửa dữ liệu.** Dữ liệu hiển thị sạch, nhất quán.
- **Kiểm chứng lâu dài:** `shared/src/ngon-ngu.test.ts` chạy trong `npm test` mọi nơi: thêm chữ Hán, thả id nội bộ vào mô tả, viết sai "Linh thạch", gõ chữ NFD hoặc bỏ dấu câu ở lời thoại thì test ĐỎ kèm vị trí.
- **Nếu phát hiện thuật ngữ mới cần chuẩn hoá:** sửa CHỮ trong dữ liệu (KHÔNG đổi id / số), test xanh trở lại.
- **Mở rộng phạm vi:** khi có bảng hiển thị mới, thêm vào `samples` (và nếu bảng có trường chữ mới, thêm tên trường vào `DISPLAY_FIELDS`).
