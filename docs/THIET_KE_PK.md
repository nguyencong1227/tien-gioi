# Thiết kế PK thách đấu (M3 bước 5)

> Bản thiết kế của Dev A để B và C review **trước khi viết mã** (cùng quy trình với `THIET_KE_BI_CANH.md`). Quyết định của người dùng (`~/TT/orchestra/QUYET_DINH_M3.md`, mục 2.5 và `GDD.md`): **PK chỉ khi hai bên đồng ý (thách đấu); chết vì PK không mất kiếp.** Bốn câu hỏi mở ở mục 10, A đã chọn hướng an toàn.

## 1. Mục tiêu và phạm vi

**Làm:** một người thách đấu một người khác đứng gần; chỉ khi người kia nhận thì hai bên mới đánh nhau được, và chỉ đánh nhau với nhau. Trận có đếm ngược, có kết thúc rõ (một bên hết khí huyết, đầu hàng, bỏ chạy, hết giờ, rớt mạng), thua thì **không mất gì** (không luân hồi, không mất đồ / Linh thạch / tu vi) và không ai khác chen vào được.

**Không làm (bản đầu):** phần thưởng / cược / bảng xếp hạng (để sau, gắn với tông môn, bước 6); thách đấu đội (nhiều người một bên); khán giả đặt cược; PK tự do ngoài thách đấu (không bao giờ); thách đấu qua bản đồ khác (hai người phải cùng một phòng); thách đấu trong trấn, trong khu an toàn của cổng, trong bí cảnh.

## 2. Hiện trạng đã đọc mã (cái để tái dùng, cái cần đổi)

- `systems/combat.ts`: `slash` / `swordQi` chỉ tính trúng **quái** (`hitMonster`); chưa có sát thương người lên người. `hurtPlayer` có `if (w.ghosts.has(sid)) return` (hồn lìa xác bất tử) và nhánh chết: `w.reincarnate` thì `beginLimbo` (mất kiếp), ngược lại nhánh hồi sinh cũ (`p.dead`, `c.deadAt`, `tickRespawn` sau `RESPAWN_MS`). **Nhánh hồi sinh cũ trong game thật không còn ai dùng** (chỉ bench / test đơn vị), đã giữ lại đúng cho chuyện này (`THIET_KE_LUAN_HOI.md` mục 4).
- `systems/party.ts`: mẫu lời mời đã chạy tốt (`partyInvite` / `partyAnswer`, `PARTY_INVITE_TTL_MS` 30 s, hồi chiêu mời, lời mời dùng một lần, kiểm trạng thái lúc nhận). PK bắt chước đúng khuôn này nhưng **cùng phòng** (không qua `Hub.locate`).
- `GameMap.inSafe` / `inTown`: quái và (nay) PK dùng chung khái niệm khu an toàn.
- `World.ghosts`: đã có luật "đang chờ nối lại thì bất tử"; PK cần luật tương tự cho trận (không để quái giết người đang thách đấu: đó là chết thật).
- `systems/progression.ts` `tickRecovery` (đả tọa, hồi khí huyết) và `inventory.ts` `useItem` (`healHp`): trong trận phải khoá, không thì thách đấu thành cuộc thi đan dược.
- Client (`WorldScene.ts`): bấm người chơi khác đã mở **menu tương tác** (mời tổ đội): thêm nút "Thách đấu".
- Tin nhắn đăng ký bằng `this.on(...)` (giới hạn tần suất); vùng nhìn (`interest`) và `sendNear` cho số sát thương: dùng nguyên.

## 3. Trải nghiệm (luồng người chơi)

1. A bấm vào B (cùng phòng, B ở ngoài trấn, trong `DUEL_RANGE`) -> menu có **"Thách đấu"** (ẩn / mờ kèm lý do nếu `canChallenge` không đạt).
2. B nhận hộp "A thách đấu ngươi" (đếm ngược `DUEL_INVITE_TTL_MS`, nút **Nhận** / **Từ chối**). Từ chối hoặc hết hạn: A nhận toast.
3. B nhận: **đếm ngược 3 giây** (`DUEL_COUNTDOWN_MS`), không ai gây được sát thương, hai người thấy dấu hiệu "đối thủ" và HUD trận.
4. Đánh: hai bên dùng Kiếm chém / Kiếm khí như đánh quái; **chỉ đối thủ** trúng đòn. Khí huyết người ngoài thấy được như mọi người chơi. Không uống đan, không đả tọa trong trận.
5. Kết thúc (mục 4.4): màn kết quả "Thắng / Thua / Hoà"; người thua **gục `DUEL_KO_MS` (3 giây) rồi đứng dậy ngay tại chỗ với 30% khí huyết**, người thắng giữ nguyên. Không ai mất gì.

## 4. Kiến trúc

### 4.1 Trạng thái và vòng đời
- Trận sống trong `World` (mỗi phòng một sổ; hai người **cùng phòng** nên không cần `Hub`): `World.duels: Map<sessionId, Duel>` (mỗi người trong trận trỏ tới cùng một `Duel`), `Duel { a, b, phase: "countdown" | "fight", startedAt, fightAt, endsAt, origin: {x,y} }`. Không vào state chung, **không lưu file** (sập giữa trận: không có gì để mất; vào lại là không còn trận).
- Logic ở `server/src/systems/duel.ts` (không đụng Colyseus `Room`, như mọi system): `duelChallenge`, `duelAnswer`, `duelYield`, `duelHit`, `tickDuels`, `endDuel`. Lời mời đang chờ lưu cạnh (`Map<người được mời, Invite[]>`), hết hạn theo `w.now`.
- Mỗi tick `tickDuels` (thoát ngay khi `World.duels.idle`: không trận, không lời mời, không hồi chiêu: ca thường, ngân sách tick không đổi): đếm ngược -> `fight`; kiểm điều kiện kết thúc; gửi `duelState` mỗi giây (không mỗi tick). **Dọn dẹp (góp ý của C ở #212):** lời mời và hồi chiêu hết hạn được quét theo nhịp riêng 500 ms (kể cả khi không có trận nào; người thách nhận toast "không trả lời" và khoá theo cặp), và `World.duels` có getter đếm cho test rò rỉ: `size` (số trận), `invitesSize` (lời mời đang chờ), `cooldownSize` (hồi chiêu đang giữ), đều về 0 sau khi hết hạn; `active` (rẻ, không cấp phát) dùng ở đường nóng (vòng lặp quái, `slash`).

### 4.2 Sát thương người lên người
- `slash` / `swordQi` hiện duyệt quái trong cung / tia; thêm: nếu người đánh đang trong trận pha `fight`, duyệt **đối thủ** (đúng hình học đã có: tầm, cung, `angleDiff`) và gọi `duelHit(w, attacker, target, mult)`. Người ngoài trận không bao giờ bị trúng, và người trong trận không trúng người ngoài (kể cả đứng đè lên nhau).
- Công thức: cùng `statsFor(...).atk` như đánh quái, **nhân `PK_DAMAGE_MULT`** (< 1, mục 6) để trận kéo dài vài chục giây thay vì 4-5 đòn là hết; cùng bạo kích / dao động như `hitMonster`. Không phòng thủ riêng (game chưa có chỉ số này). Sát thương hiện bằng tin `dmg` có sẵn (`sendNear`).
- **Không bao giờ đi qua `hurtPlayer` / `beginLimbo`**: PK có hàm trừ máu riêng; hết máu thì `endDuel` (4.4), không có nhánh chết thật. Đây là điểm an toàn chính: không có đường nào từ thách đấu tới luân hồi.

### 4.3 Quái và các hệ thống khác trong lúc đang trong trận
- Người trong trận **bất tử trước quái** như hồn lìa xác: `hurtPlayer` thêm `|| w.duels.has(sid)` ở chỗ đã có kiểm `ghosts`, quái bỏ mục tiêu khi trận bắt đầu (`forgetTarget`) và không nhắm lại (cùng chỗ `monsters.ts` đã kiểm `ghosts`). Nếu không, một con hổ đi ngang là chết thật giữa lúc "chơi". Lời mời thách đấu cũng bị từ chối khi người kia vừa bị đánh (`lastHitAt`).
- `tickRecovery`: khoá hồi phục khí huyết / linh lực và đả tọa trong trận. `useItem`: **đan hồi huyết bị khoá** (toast "đang thách đấu"); đồ khác vẫn dùng được. `travel` (qua cổng): từ chối. Vào bí cảnh (`dungeonEnter`): từ chối. `rebirth`: không liên quan (không ở Hoàng Tuyền).
- Đội: hai người trong cùng đội vẫn thách đấu được (bạn bè tập luyện là ca chính); chia tu vi đội không đổi.

### 4.4 Kết thúc trận (luôn rõ ràng, luôn dọn sạch)
| Lý do | Kết quả |
|---|---|
| Khí huyết một bên về 0 (`duelHit`) | bên kia **thắng**; bên thua gục `DUEL_KO_MS`, đứng dậy tại chỗ 30% khí huyết |
| `duelYield` (nút Đầu hàng) | bên kia thắng; người đầu hàng không gục, giữ khí huyết |
| Rời quá `DUEL_LEASH_PX` khỏi điểm bắt đầu, hoặc bước vào khu an toàn / trấn | bên kia thắng (bỏ chạy), không ai gục |
| Hết `DUEL_MAX_MS` (3 phút) | **hoà**, giữ nguyên khí huyết |
| Một bên rớt mạng (vào trạng thái `ghosts`), rời phòng, chết thật vì lý do khác, qua cổng | **huỷ trận, hoà** (rớt mạng không được tính là thua) |
- `endDuel` luôn: xoá `World.duels` của cả hai, gửi `duelEnd` cho cả hai, trả `dead = false` (người thua sau `DUEL_KO_MS`), đặt `lastDuelAt` cho hồi chiêu. Gọi trong `dropPlayer` (rời phòng) để không có trận mồ côi; `tickDuels` quét trận có người không còn trong `state.players`.
- Khi gục, `p.dead = true` trong `DUEL_KO_MS` rồi tự đứng dậy tại chỗ (cờ `c.reviveAt` mới; `tickRespawn` đã có sẵn đường hồi sinh nhưng đưa về trấn: PK **không** dùng đường đó, vì bị dịch chuyển về trấn sau mỗi trận bạn bè là phiền). Trong lúc gục không bị quái đánh (cùng lý do 4.3, kéo dài tới lúc đứng dậy).

### 4.5 Hiệu năng
- Không thêm trường nào vào state chung ngoài **một** cờ công khai `Player.duel` (boolean, đổi chỉ lúc bắt đầu / kết thúc) để người ngoài vẽ dấu "đang thách đấu" (cùng loại thay đổi hiếm như `dead`); số đo `bench` phải giữ 0.0%.
- `duelState` 1 lần / giây chỉ cho hai người trong trận; `duelInvited` một lần cho người được mời. Sát thương đi qua `sendNear` đã có.

## 5. Điều kiện và chống lạm dụng (server quyết định, client chỉ gửi ý định)
Mọi tin kiểm kiểu và giá trị hữu hạn, đăng ký bằng `this.on(...)`, tên qua `cleanName`:
- `duelChallenge { name }`: người thách còn sống, không đang ở Hoàng Tuyền / ghost / đi qua cổng, **không trong trận**, ngoài khu an toàn (`!inSafe`, cả hai), **cùng phòng**, trong `DUEL_RANGE` (có sai số nhỏ cho độ trễ như `PORTAL_SLACK`), không phải chính mình, không ở bản đồ bí cảnh; người kia chưa trong trận, còn sống, không vừa bị đánh; hồi chiêu `DUEL_COOLDOWN_MS` mỗi người thách; không thách trùng người đang chờ trả lời; tối đa `DUEL_INVITES_MAX` lời mời đang chờ gửi tới một người (chống rải lời mời làm phiền).
- `duelAnswer { from }` (nhận / từ chối): lời mời còn hạn, đúng người, người mời vẫn thoả điều kiện (còn trong tầm, ngoài trấn, chưa trong trận) **kiểm lại lúc nhận**; lời mời dùng một lần.
- Chống quấy rối: hồi chiêu mỗi người thách; từ chối nhiều lần thì giới hạn lời mời tới người đó (`DUEL_COOLDOWN_MS` theo cặp); chặn người chơi là việc sau (cần danh sách bạn / chặn).
- Không có phần thưởng nên không có gì để cày hay thông đồng; **không có đường nào đổi mất kiếp / đồ / tiền** (4.2). Test đột biến giữ điều này (mục 9).

## 6. Cân bằng (`PK_DAMAGE_MULT`)
Mục tiêu: hai người **cùng bậc** đánh liên tục hết khí huyết nhau trong ~25-45 giây (đủ để có cảm giác đấu, không kéo dài), không đan, không đả tọa. Chọn `PK_DAMAGE_MULT` bằng mô phỏng bằng chính mã server như `server/src/balance/dungeon.ts` (hai `World` người, `slash` mỗi lần hồi chiêu, hạt giống cố định), quét theo bậc tu và có trang bị; test giữ khoảng 25-45 giây cho một vài bậc đại diện và ghi vào `docs/CAN_BANG.md` một mục "PK". Người chênh nhau nhiều bậc: không có hiệu chỉnh (người yếu hơn có quyền từ chối); ghi số đo (thắng bao nhiêu % khi chênh 1 / 3 bậc) để người dùng quyết có cần hiệu chỉnh không.

## 7. Hợp đồng `shared/` (PR 5a, chỉ sửa `shared/`, B và C review)
- `shared/src/duel.ts` (mới): hằng số `DUEL_RANGE`, `DUEL_INVITE_TTL_MS`, `DUEL_COUNTDOWN_MS`, `DUEL_MAX_MS`, `DUEL_KO_MS`, `DUEL_LEASH_PX`, `DUEL_COOLDOWN_MS`, `DUEL_INVITES_MAX`, `DUEL_KO_HP_PCT` (0.3), `PK_DAMAGE_MULT` (số tạm, 5c cân bằng); tên tin `DUEL_MSG`.
- Client -> server: `DuelChallengeMsg { name }`, `DuelAnswerMsg { from }` (`duelAccept` / `duelDecline`), `DuelYieldMsg {}`; bộ đọc `parseDuelChallenge` / `parseDuelAnswer` (không mang trường lạ, như `parseDungeonEnter`).
- Server -> client: `DuelInvitedMsg { from, ttlMs }`, `DuelStateMsg { phase, opponent, startsInMs, endsInMs }` (khí huyết đối thủ đã có trong state người chơi), `DuelEndMsg { result: "won" | "lost" | "draw", reason: DuelEndReason }` với `DuelEndReason = "ko" | "yield" | "fled" | "timeout" | "disconnect"`.
- Hàm thuần có test: `canChallenge(input)` (thứ tự kiểm cố định, client dùng để ẩn nút, server kiểm lại) + `duelChallengeFailMessage(reason)` (câu báo tiếng Việt, không lộ số nội bộ), như `canOpenDungeon`.
- `Player.duel` (cờ công khai) thêm ở `server/src/schema.ts` (không phải `shared/`); client đọc để vẽ dấu.

## 8. Giao diện (B)
Nút "Thách đấu" trong menu tương tác người chơi (cạnh "Mời vào đội"; ẩn / mờ kèm lý do theo `canChallenge`); hộp lời mời (đếm ngược, Nhận / Từ chối) như hộp mời đội; đếm ngược 3-2-1 giữa màn hình; HUD trận (tên đối thủ, đồng hồ, nút **Đầu hàng**); dấu "⚔" trên đầu hai người trong trận (theo `Player.duel`) cho người xem; màn kết quả Thắng / Thua / Hoà ngắn, rồi tắt. Ảnh 1280x720 và 390x844, mọi chỗ DOM dùng `textContent`, E2E thật cho luồng thách -> nhận -> đánh -> kết thúc (hai tab).

## 9. Chia PR và phân công
| PR | Nội dung | Ai |
|---|---|---|
| 5a | `shared/`: hằng số, tin nhắn, `canChallenge`, bộ đọc + test | A |
| 5b | Server: `systems/duel.ts`, `duelHit` trong `slash` / `swordQi`, bất tử trước quái, khoá đan / đả tọa / qua cổng, `Player.duel`, dọn trận mồ côi; test đơn vị + tích hợp + **đột biến** (PK không bao giờ gọi `beginLimbo`; bỏ kiểm đồng ý; người ngoài trúng đòn; quái giết người trong trận; trận mồ côi khi rời phòng; thách đấu trong trấn / bí cảnh; lời mời không dùng một lần) | A |
| 5c | Cân bằng `PK_DAMAGE_MULT` + mục "PK" trong `CAN_BANG.md` (shared số liệu: PR riêng) | A |
| 5d | Client: menu, lời mời, đếm ngược, HUD, kết quả, dấu trên đầu | B |
| 5e | Công cụ: bot thách đấu (`--duel`), thử tải N cặp, rò rỉ trận / lời mời, `kiem-save` không đổi (trận không lưu) | C |

Mỗi PR server có test đơn vị (`World` giả) và tích hợp (phòng Colyseus thật), bench Lạc Hà 0.0%.

## 10. Câu hỏi mở (A chọn hướng an toàn, người dùng đổi nếu muốn)
1. **Người thua gục rồi đứng dậy tại chỗ (30% khí huyết), không về trấn.** Cách cũ trong thiết kế luân hồi là "hồi sinh ở trấn sau 5 giây" (`tickRespawn`); A đề xuất đứng tại chỗ vì thách đấu giữa bạn bè mà bị đưa về trấn sau mỗi trận thì phiền.
2. **Khoá đan hồi huyết và đả tọa trong trận** (nếu không, người nhiều đan thắng): giữ khoá cho bản đầu.
3. **Không phần thưởng, không bảng xếp hạng** cho bản đầu (chỉ thắng / thua tức thời); thêm "danh vọng" gắn tông môn ở bước 6.
4. **Không hiệu chỉnh chênh lệch cảnh giới** (người yếu hơn tự từ chối); sau 5c sẽ có số đo để quyết.
