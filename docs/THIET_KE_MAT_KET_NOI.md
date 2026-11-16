# Bảo vệ tính mạng khi mất kết nối (mục 33 `QUYET_DINH_M3.md`)

Người dùng yêu cầu (ƯU TIÊN CAO NHẤT cho v0.3.1): chết thật là MẤT KIẾP, mà mạng nhà máy chủ rớt 13-25 giây mỗi ~10 phút, nên một lần rớt mạng không được phép lấy mạng nhân vật. Hợp đồng `shared/src/net-guard.ts`; máy chủ `server/src/systems/net-guard.ts`; client là việc của Dev B; kiểm giả lập mạng là việc của Dev D.

## 1. Hai lỗ hổng cũ
- **(a) Đường hầm "đứng" mà socket CHƯA đóng:** máy chủ không biết người chơi đã mất kết nối (Cloudflare Tunnel / proxy trả lời khung ping ở lớp WebSocket thay cho client, nên ping của Colyseus không phát hiện được), nhân vật đứng im giữa trận và vẫn bị đánh tới chết. "Hồn lìa xác" (`world.ghosts`: bất tử, quái bỏ mục tiêu) chỉ có khi `onLeave` bắn tức là socket đã đóng.
- **(b) 20 giây giữ chỗ < thời gian rớt thực tế (tới 25 giây) + thời gian nối lại.**

## 2. Luật (máy chủ quyết định, mọi hằng số ở `shared/src/net-guard.ts`)
| # | Luật | Hằng số |
|---|---|---|
| 1 | Client KHAI nhịp gửi tin khi vào phòng (`JoinOptions.beatMs`) và gửi `ping` đều (kể cả đứng yên). Máy chủ ghi thời điểm nhận TIN CUỐI (bất kỳ tin nào, kể cả tin bị giới hạn tần suất). Client có khai nhịp mà im lặng quá ngưỡng thì thành **hồn lìa xác NGAY** dù socket còn mở: bất tử, quái bỏ mục tiêu và không nhắm lại, không dính sát thương theo giây, không bị PK (thách đấu huỷ HOÀ), bỏ input đang chờ, không hồi phục / tu luyện | `NET_BEAT_MS` 1000, `NET_SILENCE_GHOST_MS` 3000 |
| 2 | Rớt socket (không chủ động thoát): giữ nhân vật chờ nối lại | `NET_RECONNECT_GRACE_S` 90 (cũ 20) |
| 3 | Có tin lại sau im lặng, hoặc nối lại sau rớt socket: **hộ thể** (bất tử), quái đang đánh mất mục tiêu và không nhắm trong lúc hộ thể; khí huyết / linh lực giữ như lúc rớt; gửi `netShield {ms, reason: "resume"}` cho chủ | `NET_SHIELD_MS` 3000 |
| 4 | **Tha chết do mạng:** bị hạ (khí huyết về 0) khi client đã im lặng từ ngưỡng này: KHÔNG chết thật (không Hoàng Tuyền, không mất kiếp, trước cả `dungeonFall`); dịch về điểm an toàn gần nhất với ít khí huyết, kèm hộ thể (`reason: "spared"`) và toast | `NET_SPARE_SILENCE_MS` 2000, `NET_SPARE_HP_PCT` 0,1; **hạn mức** `NET_SPARE_MAX` 3 lần / `NET_SPARE_WINDOW_MS` 10 phút (chỉ máy chủ, `systems/net-guard.ts`): lần thứ 4 trong cửa sổ KHÔNG tha, chết thật, ghi `net.spare_denied` |
| 5 | Chống lợi dụng: hồn lìa xác không hành động được (không còn tin nào tới; tin đầu tiên tới là bằng chứng còn sống nên thoát trạng thái này); thách đấu mà một bên mất kết nối thì huỷ trận, không ai thắng / thua; mọi lần rớt / im lặng / tha chết ghi nhật ký kiểm toán | (xem mục 7) |

Vì sao ngưỡng 2 s < 3 s: trong khoảng 2-3 giây im lặng nhân vật CHƯA là hồn lìa xác nhưng khả năng cao đã mất mạng; đúng khoảng này mới cần "tha chết". Sau 3 giây nhân vật đã bất tử nên không còn gì để tha. 3 giây = 3 nhịp 1 giây (chịu được một nhịp lỡ mà không báo nhầm) và sớm hơn mốc 8 giây coi kết nối chết của nhịp tim client (`HEARTBEAT_TIMEOUT_MS`), nên nhân vật được bảo vệ TRƯỚC khi banner nối lại hiện.

## 3. Tương thích với client cũ
- Chỉ client CÓ khai `beatMs` hợp lệ (`parseBeatMs`: 250..1500 ms) mới bị áp luật im lặng và luật tha chết. Client cũ (v0.3.0 trở xuống, nhịp tim 5 giây, đứng yên thì im lặng tới 5 giây) KHÔNG bị ghost oan: giữ nguyên hành vi cũ (chỉ rớt socket mới thành hồn lìa xác). Test chốt: `net-guard.test.ts` + `WorldRoom.test.ts` ("client KHÔNG khai nhịp").
- Rớt socket + nối lại dùng chung cho mọi client (grace 90 giây, hộ thể 3 giây). `beatMs` giữ theo `sessionId` nên nối lại (`allowReconnection`, không qua `onJoin`) không cần khai lại.
- `PROTOCOL_VERSION` KHÔNG tăng (chỉ thêm tin / trường tuỳ chọn). Giới hạn tin `ping` nới 1 -> 2 tin / giây (burst 6) vì nhịp 1 giây.

## 4. Hiện thực máy chủ
- `PlayerCtrl`: `beatMs`, `lastHeardAt` (đặt lúc vào phòng, làm mới ở MỌI tin trong `WorldRoom.on`), `silent` / `silentSince`, `shieldUntil`. `World`: `shielded` (tập người đang hộ thể, kiểm `size > 0` trước ở đường nóng của quái), `netStats` (đếm cho `/metrics`).
- `systems/net-guard.ts`: `heard` (tin tới: ra khỏi im lặng + hộ thể), `reconnected` (nối lại), `tickNetGuard` (mỗi tick, CHỈ người có khai nhịp hoặc đang hộ thể: im lặng quá ngưỡng thì ghost, hết hạn hộ thể thì gỡ; bỏ qua người đang qua cổng và hồn lìa xác thật), `grantShield`, `spareFromNetDeath`, `isShielded`, `silenceMs`.
- `systems/combat.ts`: `hurtPlayer` / `hurtPlayerDot` kiểm hộ thể (sau ghost); `damagePlayer` gọi `spareFromNetDeath` NGAY khi khí huyết về 0, trước `dungeonFall` và `beginLimbo`. `systems/monsters.ts`: quái không giữ / không chọn mục tiêu là người đang hộ thể.
- `WorldRoom`: `RECONNECT_GRACE_S = NET_RECONNECT_GRACE_S`; `onJoin` đọc `beatMs`; `onLeave` (rớt socket thật) đặt `silent = false` (từ đây là hồn lìa xác thật, do `tickNetGuard` bỏ qua), ghi `net.drop`, và nhánh nối lại gọi `reconnected`.
- Phòng bí cảnh: luật im lặng và tha chết áp dụng như mọi phòng (rớt socket vẫn là rời run, `onLeave` không giữ chỗ).

## 5. Việc của client (Dev B) và test (Dev D)
- **B:** gửi `beatMs: NET_BEAT_MS` khi vào phòng; `HeartbeatController` ping mỗi `NET_BEAT_MS` ở tiền cảnh (kể cả đứng yên; xuống nền không ping nên máy chủ coi im lặng và bảo vệ, có chủ ý); dải "Mất kết nối — nhân vật đang được bảo vệ" khi mất tín hiệu quá ~2 giây (khung chip `net-slow`); vòng nối lại dùng `NET_RECONNECT_GRACE_S`; toast "Đã kết nối lại"; vầng hộ thể + chữ đếm ngược theo `netShield.ms`.
- **D:** test giả lập mạng: socket đứng 25 giây giữa đàn quái (không mất máu, không chết), rớt 60 giây rồi nối lại đúng chỗ, chết sau 2 giây im lặng (không mất kiếp), thách đấu + rớt mạng huỷ trận; fuzz ngẫu nhiên có seed (bất biến: không ai mất kiếp vì mạng, không ai ở hai trạng thái, máu không âm).

## 6. Rủi ro đã biết (cần người dùng biết)
- **Cố ý ngắt gói để thoát trận ("nút tạm dừng"):** ghost là bất tử, nên một người chơi cắt gói có chủ ý (macro tường lửa, hoặc đơn giản chuyển tab nền) khi sắp chết sẽ được bảo vệ và khi có lại tin thì được hộ thể 3 giây + quái mất mục tiêu. Đây là hệ quả trực tiếp của yêu cầu (không phân biệt được đường hầm đứng với cố ý). Giảm nhẹ: hồn lìa xác không hồi phục / không tu luyện / không hành động; mọi lần đều ghi nhật ký (`net.silent` kèm khí huyết, số quái đang nhắm, có đang thách đấu không); số đo `/metrics` `net_silent_total`; chính sách hiện chỉ ghi nhận + cảnh báo (mục 6.4), chưa phạt. Hộ thể sau nối lại: chưa giới hạn (chỉ 3 giây, không cứu được một nhân vật đang bị vây lâu). **Tha chết: ĐÃ giới hạn** (Dev B nêu khi review #803): client sửa mã khai `beatMs` hợp lệ rồi gửi gói thưa ~2,5 giây thì không bao giờ ghost (im lặng < 3 giây) nhưng thường im lặng >= 2 giây lúc bị hạ, tức là không bao giờ chết thật. Mỗi nhân vật được tha tối đa `NET_SPARE_MAX` (3) lần trong `NET_SPARE_WINDOW_MS` (10 phút, cửa sổ trượt, đếm trong `PlayerCtrl.spareAts`); quá hạn mức thì chết thật như thường và ghi `net.spare_denied` + số đo `net_spare_denied_total`. Mạng chập chờn thật hiếm khi chạm hạn mức vì mỗi lần tha cần một đòn kết liễu rơi đúng khoảng im lặng 2-3 giây (từ 3 giây đã là hồn lìa xác, bất tử). Giới hạn đếm theo nhân vật trong MỘT lần ở phòng (vào lại phòng / qua cổng thì đếm lại): kẻ cố ý vẫn có thể thoát hạn mức bằng cách vào lại, nhưng mỗi lần vào lại tốn thời gian và để lại `net.drop` / `net.spared` để truy.
- **Thách đấu (PK):** một bên chuyển tab nền thì trận huỷ (hoà): chấp nhận.

## 7. Nhật ký kiểm toán (`AUDIT_LOG`, `docs/VAN_HANH.md`)
| Sự kiện | Khi nào | Trường |
|---|---|---|
| `net.silent` | client có khai nhịp vừa im lặng quá 3 giây (thành hồn lìa xác dù socket mở) | `name, map, hp, maxHp, aggro (số quái nhắm), duel, silentMs` |
| `net.resume` | có tin lại sau im lặng (`kind: silence`) hoặc nối lại sau rớt socket (`kind: reconnect`) | `name, silentMs, map, kind` |
| `net.spared` | được tha chết do mạng | `name, silentMs, inWindow (lần tha thứ mấy trong 10 phút), from, to` |
| `net.spare_denied` | bị hạ khi im lặng >= 2 giây nhưng đã hết hạn mức tha (chết thật) | `name, map, silentMs, inWindow, windowMs` |
| `net.drop` | rớt socket thật (không chủ động thoát) | `name, map, hp, maxHp, recentlyHit, duel, silentMs` |
| `duel.end` (`reason: disconnect`) | thách đấu huỷ vì một bên mất kết nối | có sẵn |
