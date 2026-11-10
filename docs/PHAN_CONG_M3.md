# Phân công M3 (bản đề xuất)

> **Trạng thái (10/11/2026, sau quyết định của người dùng): Sprint 4 (tổ đội) và phần không đổi kiến trúc của Sprint 5 (tiền tệ, Bước 0 nhiều bản đồ) đã xong và nằm trên `main`. Hướng đi phần còn lại đã được người dùng chốt (mục "Quyết định của người dùng"); bản đề xuất cũ của Dev A ở Sprint 5 / 6 bên dưới được thay bằng mục "Kế hoạch M3 theo quyết định".**

## Quyết định của người dùng (10/11/2026)
Thay cho các câu hỏi trước đây ở cuối file này và trong `questions.md`.

1. **Bản đồ thứ hai: phương án A.** Mỗi bản đồ một phòng Colyseus, một người ở một phòng một lúc, cổng chuyển bản đồ ở rìa, file lưu có `mapId`. Cần thêm **kênh chung giữa các phòng** cho chat toàn server và tổ đội khác bản đồ.
2. **Thứ tự M3 mới:** (1) bản đồ thứ hai; (2) luân hồi bản đầu; (3) tài khoản thật + PostgreSQL, để lưu **linh hồn** tách khỏi **nhân vật** (kéo từ M4 lên); (4) bí cảnh (phòng tạm theo đội); (5) PK chỉ khi hai bên đồng ý (thách đấu), chết vì PK **không** mất kiếp; (6) tông môn, gắn với linh hồn.
3. **Chết = luân hồi** (bỏ luật cũ "hồi sinh ở trấn, mất 10% tu vi"): nhân vật của kiếp đó mất hẳn (cảnh giới, đồ, Linh thạch về 0), đầu thai sang kiếp mới; nhận **điểm luân hồi** theo thành tựu kiếp vừa rồi; tiêu điểm vào **bảng mở khóa vĩnh viễn** (bản đầu khoảng 4–5 mục: dư âm tu hành +% tốc độ tu luyện tối đa +100%, khắc chân linh, chọn xuất thân kiếp mới, đồ khởi đầu, giữ lại một món đồ). Không chết khi đang rớt mạng. Linh thạch mất theo kiếp (trừ phần mở khóa mang theo). Tên thuật ngữ theo phong cách tu tiên, tự đặt cho Tiên Giới (không chép chữ của game khác).
4. **Câu chưa quyết** (cân bằng tu vi tổ đội, bán đan cộng tu vi): giữ hướng an toàn A đã đề xuất (giữ nguyên công thức tổ đội, cửa hàng **không** bán `tu_khi_dan`).

## Trạng thái thực tế

| Hạng mục | Trạng thái | PR chính |
|---|---|---|
| Sprint 4: Tổ đội (hợp đồng, server, client, bot thử tải) | Xong | #73, #79, #90, #94 (cân bằng: #82) |
| Sprint 5: Tiền tệ, cửa hàng (hợp đồng, server, client, công cụ) | Xong | #98, #103, #104, #107, #115, #110 (cân bằng: #106) |
| Sprint 5: Nhiều bản đồ, **Bước 0** (bản đồ thành tham số, hành vi không đổi, chỉ `lac_ha`) | Xong | thiết kế #121; #124, #128, #130, #132; dọn: #131, #133, #134, #135 |
| M3 bước 1: bản đồ thứ hai (phương án A) | **Đang làm**: hợp đồng `shared/` trước, rồi server / client / công cụ | `docs/THIET_KE_NHIEU_BAN_DO.md` |
| M3 bước 2–6: luân hồi, tài khoản + PostgreSQL, bí cảnh, PK thách đấu, tông môn | Đã có quyết định; làm lần lượt sau bước 1 | `docs/THIET_KE_LUAN_HOI.md` (bước 2) |

Việc ngoài kế hoạch M3 đã làm xen vào: tối ưu băng thông vùng nhìn (#70, #87, #89; 100 người: ~9.5 KB/s mỗi client ở ca đông người tụ trong trấn), bench hằng đêm (#97), nối lại khi rớt mạng (#118, #122, #127; thử tải #125), kiểm file lưu (#113, #114), Docker và triển khai (#81, #83), rà giao diện điện thoại (#105).

Số đo trên `main` (10/11/2026): 385 test; bench 100 người: săn quái 191, đám đông 484 byte/tick mỗi client, tick trung bình ~1.05 / ~1.7 ms (ngân sách < 10 ms); 40 bot thật 15 s: 40/40 giữ kết nối, tick tối đa 8.92 ms.

Hai câu cũ (cân bằng tu vi của tổ đội, bán đan cộng tu vi) đã chốt theo hướng an toàn của A, xem mục quyết định ở trên; kinh tế Linh thạch khi chết do bước 2 (luân hồi) quyết.

Mục tiêu M3 (theo `GDD.md`): biến Tiên Giới từ chơi một mình cạnh người khác thành **chơi cùng nhau**: tổ đội, tông môn, PK có điều kiện, nhiều bản đồ, bí cảnh. `PHAN_CONG.md` còn thêm tiền tệ và cửa hàng (Lão dược sư đang đổi nguyên liệu lấy đan vì chưa có tiền).

Cách làm giữ nguyên M2: hợp đồng `shared/` trước (PR riêng, dev khác review), rồi A / B / C làm song song trên nhánh riêng. Việc nào cũng ghi thành issue có hợp đồng, tin nhắn, phụ thuộc và tiêu chí xong, đủ để Antigravity đọc là làm được.

## Thứ tự và lý do
Sprint 4 (tổ đội) đã làm trước vì tự đứng được. Phần còn lại làm theo thứ tự người dùng chốt (mục "Quyết định của người dùng" và "Kế hoạch M3 theo quyết định" ở trên). Mục Sprint 4 bên dưới giữ nguyên để tra hợp đồng tổ đội.

## Sprint 4: Tổ đội

### Hợp đồng `shared/` (Dev A soạn, B hoặc C review)
- `shared/src/party.ts`:
  - Hằng số: `PARTY_MAX = 4`, `PARTY_SHARE_RANGE` (người trong tầm này mới được chia tu vi), `PARTY_EXP_BONUS` (cộng thêm cho mỗi thành viên có mặt), `PARTY_INVITE_TTL_MS`.
  - Client → server: `partyInvite { name }`, `partyAccept { from }`, `partyDecline { from }`, `partyLeave`, `partyKick { name }` (chỉ đội trưởng).
  - Server → client (chỉ gửi cho thành viên): `party { leader, members: [{ name, realm, tier, hp, maxHp, x, y, online }] }` mỗi ~1 giây và khi đổi đội hình; `partyInvited { from }` (hiện nút nhận / từ chối).
  - Chat đội: `ChatMsg` thêm kênh `party` (lệnh `/p <nội dung>`), `ChatOut.channel`.
- Thành viên đội ở xa không nằm trong vùng nhìn (#62): vị trí và máu đi qua tin `party`, không qua state chung. Dữ liệu đội không đưa vào state chung.

### Dev A: server
- [ ] `systems/party.ts`: tạo / mời / nhận / rời / kick / giải tán; kiểm tra người mời còn sống và cùng phòng, lời mời hết hạn, không mời người đã có đội, không tự mời mình; đội trưởng rời thì chuyển cho người kế.
- [ ] Chia tu vi khi giết quái: người trong đội và trong `PARTY_SHARE_RANGE` cùng nhận phần, cộng `PARTY_EXP_BONUS`; không làm lệch đường cong tu luyện đã cân bằng ở #28 (kiểm bằng `npm run can-bang`).
- [ ] Quyền nhặt đồ: đồ rơi của quái do đội hạ thì cả đội nhặt được trong thời gian `owner` (hiện chỉ một người).
- [ ] Chat đội; tin `party` mỗi giây; rate limit mọi tin nhắn mới qua `this.on`.
- [ ] Test: mời / nhận / rời, hai lời mời trùng, kick không phải đội trưởng bị từ chối, chia tu vi đúng và không nhân đôi, người ở xa không được chia, người thoát phòng bị loại khỏi đội.

### Dev B: client
- [ ] **Bảng đội** góc trái HUD: tên, cảnh giới, thanh khí huyết từng thành viên (từ tin `party`), nút Rời.
- [ ] **Lời mời:** toast có nút Nhận / Từ chối (cỡ chạm ≥ 44 px); menu "Mời vào đội" khi chạm người chơi khác.
- [ ] **Chat đội** (tab riêng hoặc màu riêng, lệnh `/p`).
- [ ] **Chấm đồng đội trên bản đồ nhỏ / lớn** (vị trí từ tin `party`, kể cả ở xa).

### Dev C: công cụ
- [ ] Mở rộng bot thử tải: bot lập đội 4 người và đi cùng nhau; thêm kịch bản "đội" vào `docs/LOAD_TEST.md`, kiểm tra byte tin `party` mỗi client.
- [ ] `bench.ts`: thêm tin `party` vào số đo (cùng cách đo `fx` / `dmg`).

**Xong khi:** bốn người mời nhau, đi săn chung, thấy máu nhau, chat riêng; thoát ra vào lại không còn trong đội; đội 4 người ở 100 người chơi vẫn trong ngân sách byte / tick.

## Kế hoạch M3 theo quyết định (thay Sprint 5 / 6 cũ)
Mỗi bước: hợp đồng `shared/` trước (PR riêng chỉ sửa `shared/` + tài liệu, một dev khác review), rồi A / B / C làm song song trên nhánh riêng, mỗi việc một issue có hợp đồng, tin nhắn, phụ thuộc, tiêu chí xong. Tiền tệ, cửa hàng của Sprint 5 cũ đã xong (bảng trên).

### Bước 1: Bản đồ thứ hai (phương án A)
Thiết kế và lý do: `docs/THIET_KE_NHIEU_BAN_DO.md`. Bản đồ thứ hai là khu săn thường (cùng cách chơi, mạnh hơn), nối với Lạc Hà Trấn bằng cổng ở rìa; chuyển bản đồ = lưu nhân vật, rời phòng, vào phòng đích.
- **A:** hợp đồng `shared/` (`MapDef` thêm cổng, quái, tên; tin `travel` / `travelTo`; mã lỗi `wrong_map`; kênh chat chung; `mapId` trong tin đội) → server (`WorldRoom` lọc theo `mapId`, sổ tên đang chơi toàn cục, hệ thống `travel`, lưu / nạp `mapId`, `PartyBook` và chat dùng chung giữa các phòng, quái / NPC theo bản đồ) → nội dung bản đồ thứ hai (seed, quái, trạm an toàn).
- **B:** client vào đúng `mapId`, nút / hỏi "đi qua cổng", chuyển cảnh mờ dần + tên bản đồ, bản đồ nhỏ / lớn theo bản đồ, tổ đội thấy thành viên ở bản đồ khác, chat chung.
- **C:** bot `--map`, bench nhiều `World` trong một tiến trình (ngân sách tổng tick), thử tải qua cổng liên tục (rò ghost, đua lưu / nạp, không nhân bản nhân vật, bộ nhớ khi tạo / huỷ phòng), `kiem-save` kiểm `mapId` và tọa độ; tiêu chí đo: `docs/THIET_KE_NHIEU_BAN_DO.md` mục 5.
- **Xong khi:** đi qua cổng hai chiều không mất dữ liệu, chat chung và đội hoạt động qua hai phòng, bench một bản đồ vẫn 0.0% so mốc, tổng tick N bản đồ x M người < 10 ms.

### Bước 2: Luân hồi bản đầu
Thiết kế: `docs/THIET_KE_LUAN_HOI.md` (A soạn, B và C review trong lúc làm bước 1). Linh hồn lưu file riêng (qua một giao diện lưu trữ để bước 3 thay bằng PostgreSQL), điểm luân hồi, bảng mở khóa, luồng chết → đầu thai, bất tử khi rớt mạng, bỏ luật `DEATH_EXP_LOSS` / hồi sinh sau `RESPAWN_MS`.
- **A:** hợp đồng + server + cân bằng (`docs/CAN_BANG.md`). **B:** màn hình chết → đầu thai, bảng mở khóa, hiển thị điểm. **C:** mô phỏng điểm luân hồi / đường cong mở khóa, `kiem-save` cho linh hồn, thử tải chết hàng loạt.

### Bước 3: Tài khoản thật + PostgreSQL
Kéo từ M4 lên để linh hồn tách khỏi nhân vật và có chủ. **Đăng nhập, mật khẩu, di chuyển dữ liệu từ file JSON, sao lưu:** thiết kế riêng khi tới bước này (A soạn trước, C lo Docker / sao lưu / di chuyển dữ liệu).

### Bước 4: Bí cảnh
Phòng tạm theo đội (`autoDispose`, hạn giờ, quái trùm, phần thưởng), dựa trên bước 1 (phòng theo bản đồ) và tổ đội. Thiết kế khi tới bước này.

### Bước 5: PK thách đấu
Chỉ khi hai bên đồng ý (lời thách đấu, nhận / từ chối, trận có kết thúc rõ); chết vì PK **không** mất kiếp (không luân hồi, không mất đồ). Không PK trong trấn. Thiết kế khi tới bước này.

### Bước 6: Tông môn
Gắn với **linh hồn** (không gắn nhân vật từng kiếp): tạo / gia nhập / chức vụ, chat tông môn, kho chung. Phụ thuộc bước 3. Thiết kế khi tới bước này.

## Sprint 5 cũ: ghi chú đã được thay
Phác thảo ban đầu (tiền tệ, nhiều bản đồ, bí cảnh) và Sprint 6 (PK, tông môn) đã được thay bằng kế hoạch trên; các câu hỏi ở cuối bản đề xuất cũ đã có trả lời (mục "Quyết định của người dùng").
