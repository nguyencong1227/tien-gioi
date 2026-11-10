# Phân công M3 (bản đề xuất)

> **Trạng thái (10/11/2026): Sprint 4 (tổ đội) và phần không đổi kiến trúc của Sprint 5 (tiền tệ, Bước 0 nhiều bản đồ) đã xong và nằm trên `main`.** Phần còn lại (bản đồ thứ hai, bí cảnh, PK, tông môn) **chờ người dùng quyết định** các câu hỏi ở cuối file (cũng ghi trong `~/TT/orchestra/questions.md`). Bản đề xuất ban đầu của Dev A giữ nguyên bên dưới để đối chiếu.

## Trạng thái thực tế

| Hạng mục | Trạng thái | PR chính |
|---|---|---|
| Sprint 4: Tổ đội (hợp đồng, server, client, bot thử tải) | Xong | #73, #79, #90, #94 (cân bằng: #82) |
| Sprint 5: Tiền tệ, cửa hàng (hợp đồng, server, client, công cụ) | Xong | #98, #103, #104, #107, #115, #110 (cân bằng: #106) |
| Sprint 5: Nhiều bản đồ, **Bước 0** (bản đồ thành tham số, hành vi không đổi, chỉ `lac_ha`) | Xong | thiết kế #121; #124, #128, #130, #132; dọn: #131, #133, #134, #135 |
| Sprint 5: Nhiều bản đồ, **Bước 1** (bản đồ thứ hai) và bí cảnh | **Chờ người dùng chọn phương án A / B** | `docs/THIET_KE_NHIEU_BAN_DO.md` mục 6 |
| Sprint 6: PK có điều kiện, tông môn | Chưa làm, chờ người dùng (câu hỏi 2, 4) | |

Việc ngoài kế hoạch M3 đã làm xen vào: tối ưu băng thông vùng nhìn (#70, #87, #89; 100 người: ~9.5 KB/s mỗi client ở ca đông người tụ trong trấn), bench hằng đêm (#97), nối lại khi rớt mạng (#118, #122, #127; thử tải #125), kiểm file lưu (#113, #114), Docker và triển khai (#81, #83), rà giao diện điện thoại (#105).

Số đo trên `main` (10/11/2026): 385 test; bench 100 người: săn quái 191, đám đông 484 byte/tick mỗi client, tick trung bình ~1.05 / ~1.7 ms (ngân sách < 10 ms); 40 bot thật 15 s: 40/40 giữ kết nối, tick tối đa 8.92 ms.

Chưa quyết, không chặn các việc đã xong: cân bằng tu vi của tổ đội (3 lựa chọn, mục "Đi theo đội" trong `docs/CAN_BANG.md`), kinh tế Linh thạch (3 câu trong `questions.md`).

Mục tiêu M3 (theo `GDD.md`): biến Tiên Giới từ chơi một mình cạnh người khác thành **chơi cùng nhau**: tổ đội, tông môn, PK có điều kiện, nhiều bản đồ, bí cảnh. `PHAN_CONG.md` còn thêm tiền tệ và cửa hàng (Lão dược sư đang đổi nguyên liệu lấy đan vì chưa có tiền).

Cách làm giữ nguyên M2: hợp đồng `shared/` trước (PR riêng, dev khác review), rồi A / B / C làm song song trên nhánh riêng. Việc nào cũng ghi thành issue có hợp đồng, tin nhắn, phụ thuộc và tiêu chí xong, đủ để Antigravity đọc là làm được.

## Thứ tự và lý do
1. **Sprint 4: Tổ đội** trước: tự đứng được, tận dụng vùng nhìn (#62) và chat, chưa cần đổi kiến trúc phòng.
2. **Sprint 5: Tiền tệ, cửa hàng, nhiều bản đồ, bí cảnh:** đụng kiến trúc (mỗi bản đồ một phòng Colyseus, lưu `mapId`), nên làm khi tổ đội đã ổn.
3. **Sprint 6: PK có điều kiện, tông môn:** cần cân bằng và lưu trữ lâu dài; tông môn nên đi sau tài khoản thật (M4) nếu muốn chống mạo danh.

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

## Sprint 5: Tiền tệ, cửa hàng, nhiều bản đồ, bí cảnh (phác thảo, chưa giao)
- **Tiền tệ (Linh thạch):** quái rơi, lưu vào nhân vật, Lão dược sư bán đan bằng tiền. A: server + cân bằng; B: hiển thị, cửa hàng.
- **Nhiều bản đồ** (phân tích hai phương án, thứ tự làm và câu hỏi cần chọn: `docs/THIET_KE_NHIEU_BAN_DO.md`): `shared/src/map.ts` thành danh sách bản đồ (seed, kích thước, cổng nối); mỗi bản đồ một phòng Colyseus (`ROOM_NAME` + `mapId`), lưu `mapId` trong file nhân vật, cổng chuyển bản đồ ở rìa. Đây là đổi kiến trúc lớn nhất của M3, cần hợp đồng và test riêng.
- **Bí cảnh:** phòng tạm theo đội (instance), có thời hạn, quái trùm, phần thưởng; dựa trên "nhiều bản đồ" và "tổ đội".
- C: kịch bản thử tải nhiều phòng, theo dõi bộ nhớ khi tạo / huỷ phòng tạm.

## Sprint 6: PK có điều kiện, tông môn (phác thảo, chưa giao)
- **PK có điều kiện:** chỉ bật ở khu vực đánh dấu hoặc khi hai bên cùng đồng ý (quyết định ở câu hỏi 2); không PK trong trấn; phạt giết người vô cớ.
- **Tông môn:** tạo / gia nhập / chức vụ, chat tông môn, kho chung. Cần lưu trữ chung nhiều nhân vật nên nên đợi PostgreSQL (M4) hoặc tạm dùng file riêng cho tông môn.

## Câu hỏi cần người dùng quyết định
1. **Thứ tự:** có đồng ý bắt đầu bằng tổ đội, rồi tiền tệ / bản đồ, rồi PK / tông môn? Hay muốn làm PostgreSQL + tài khoản thật (M4) trước vì tông môn và mọi thứ về sau phụ thuộc vào nó?
2. **PK:** chỉ ở khu riêng, hay hai bên đồng ý, hay tự do ngoài trấn? Ảnh hưởng tới cân bằng và trải nghiệm người mới.
3. **Nhiều bản đồ = nhiều phòng Colyseus** (mở rộng ngang được, nhưng một người chỉ ở một phòng một lúc, chat chung toàn server cần thêm kênh): có chấp nhận cách này không?
4. **Tông môn** có cần có trong M3, hay chuyển sang M4 cùng tài khoản thật?
