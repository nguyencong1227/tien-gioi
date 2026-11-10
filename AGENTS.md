# Tiên Giới

> File này là quy ước chung cho mọi trợ lý AI trong repo: Claude Code đọc qua `CLAUDE.md` (chỉ chứa `@AGENTS.md`), Antigravity CLI đọc thẳng `AGENTS.md`. Sửa quy ước thì sửa ở đây.

MMORPG 2D tu tiên, chiến đấu thời gian thực. Client Phaser 3 + Vite, server Colyseus 0.16, TypeScript, npm workspaces.
Trả lời người dùng bằng tiếng Việt. Comment trong code viết tiếng Việt.

## Nhóm và nơi làm việc
- 3 dev cùng SSH vào một máy, cùng user Linux `nguyencong`, cùng tài khoản GitHub `nguyencong1227`.
- **Dev A (Server & Gameplay, giao việc):** `~/TT/tien-gioi-a`, cổng 2567/5173, nhánh `a/...`. Dùng Claude Code.
- **Dev B (Client & Trải nghiệm):** `~/TT/tien-gioi-b`, cổng 2577/5183, nhánh `b/...`. Dùng Antigravity CLI (`agy`).
- **Dev C (Công cụ, Thử tải & Phát hành):** `~/TT/tien-gioi-c`, cổng 2587/5193, nhánh `c/...`. Dùng Antigravity CLI (`agy`).
- Thư mục mở lúc khởi động là thư mục của dev đang làm việc với bạn: chỉ làm trong đó. Không sửa, không `git switch`, không chạy server trong thư mục của người khác.
- Không sửa `~/.bashrc`, `~/.gitconfig`, `~/.gemini/`, `~/.claude/` hay cấu hình global: ba người dùng chung.
- **Việc được giao nằm trong GitHub issue** (nhãn `dev-a` / `dev-b` / `dev-c`). Trước khi làm, đọc issue bằng `gh issue view <số>`: issue ghi hợp đồng `shared/` cần dùng, tin nhắn, phụ thuộc và tiêu chí xong. Trợ lý AI không nhớ cuộc trò chuyện của dev khác; issue và comment trên PR là nơi duy nhất truyền thông tin giữa các dev.
- Chi tiết: `docs/LAM_CHUNG_MAY.md`. Phân công M2: `docs/PHAN_CONG.md` và GitHub issues (nhãn `dev-a` / `dev-b` / `dev-c` / `shared`, milestone Sprint 0–3).

## Lệnh
Node 22 ở `~/.local/node/bin`. Nếu `npm` không có trong PATH thì thêm `export PATH=~/.local/node/bin:$PATH` vào đầu lệnh.

```bash
npm run dev          # server + client, cổng lấy từ .env.local
npm run typecheck    # bắt buộc qua trước khi commit
npm run format       # định dạng code bằng Prettier (CI kiểm bằng npx prettier --check .)
npm run build        # build client vào client/dist
```

- `.env.local` ở gốc repo (không commit) giữ `PORT` và `CLIENT_PORT` của từng dev. Vite dùng `strictPort`: lỗi cổng bị chiếm thì kiểm tra xem có đang chạy nhầm thư mục không, đừng đổi cổng cho xong.
- Chạy server nền xong nhớ tắt, để không giữ cổng của dev.

## Kiến trúc
- `shared/src/`: **hợp đồng** giữa client và server.
  - `realms.ts`: cảnh giới, chỉ số.
  - `game.ts`: hằng số, quái, kiểu tin nhắn.
  - `map.ts`: bản đồ sinh theo seed, va chạm. **Bản đồ là tham số** (#123): `MapDef` mô tả, `GameMap` giữ ô và có `tileAt`, `isBlockedPx`, `circleBlocked`, `moveWithCollision`, `inTown`, `dangerAt`, `dangerRadius`, `townPx`, `worldW`, `worldH`; lấy bằng `getMap(id)` (id đến từ client / file lưu thì dùng hàm này, id lạ trả `undefined`) hoặc `DEFAULT_MAP`.
- `server/src/rooms/WorldRoom.ts`: chỉ lo vào/ra phòng, lưu nhân vật, nối tin nhắn với system, vòng lặp 20 tick/giây. Rớt mạng bất thường thì nhân vật ở lại `RECONNECT_GRACE_S` (20) giây chờ `allowReconnection` (#116); thoát chủ động hoặc bị ngắt vì spam thì không chờ.
- **Mỗi bản đồ một phòng Colyseus** (M3.1, `docs/THIET_KE_NHIEU_BAN_DO.md`): tên phòng là `roomNameOf(mapId)` (`world` cho Lạc Hà, `world_hac_phong`...), `defineRooms` đăng ký từng bản đồ, `World` dựng ở `onCreate` theo `mapId` (client không gửi `mapId` khi vào phòng). Nhân vật thuộc đúng một bản đồ do `mapId` trong file lưu quyết định; vào nhầm phòng thì `onAuth` trả lỗi `JOIN_WRONG_MAP` (421, `wrong_map:<id>`) để client vào lại đúng phòng. Qua cổng: client gửi `travel {portalId}`, `systems/travel.ts` (`planTravel`) kiểm, `WorldRoom.travel` lưu bản ghi đích rồi gửi `travelTo {mapId}` và ngắt kết nối (mã 4000, không chờ nối lại); `savePlayer` xếp hàng theo tệp nên lưu của phòng cũ không đè bản của phòng mới.
- Nhật ký kiểm toán (M4 2.4, #263): `server/src/audit.ts` (`audit(ev, fields)`: một dòng JSON mỗi sự kiện nhạy cảm; mặc định KHÔNG ghi, `index.ts` bật theo `AUDIT_LOG`). Các system gọi qua `World.audit?.(...)` (null trong test / bench), auth gọi `audit` trực tiếp; không bao giờ truyền mật khẩu / token / mã bí mật vào trường (khoá giống bí mật bị loại, nhưng đừng dựa vào đó). Thêm sự kiện nhạy cảm mới thì ghi ở đây + test.
- `server/src/hub.ts`: `Hub` dùng chung giữa mọi phòng cùng tiến trình: chat toàn server (`addChatSink`), sổ đội dùng chung `Hub.parties` (khoá theo đạo hiệu viết thường, không theo sessionId vì sessionId đổi khi qua cổng; thành viên đang qua cổng được giữ `PARTY_AWAY_MS`), `Hub.worlds` + `locate` để tìm người ở phòng khác. Thông báo hệ thống (`sys`: nhập thế, rời đi) vẫn chỉ trong phòng; chat đội `/p` đi theo đội, kể cả sang phòng khác. Chạy nhiều tiến trình thì thay bằng `presence` của Colyseus (ngoài phạm vi M3).
- `server/src/soul.ts`: chân linh (`SoulStore`, `FileSoulStore` ghi vào `<DATA_DIR>/souls/`, hàng đợi ghi theo từng chân linh, tệp hỏng được cách ly thành `*.hong-*`), nền cho luân hồi (`docs/THIET_KE_LUAN_HOI.md`). Tên người chơi vẫn là khoá của tệp nhân vật; chân linh khoá theo tên chuẩn hoá (bước 3 sẽ gắn với tài khoản).
- Tông môn (M3 bước 6, `docs/THIET_KE_TONG_MON.md`): `server/src/sect-store.ts` (`Sect`, `sanitizeSect`, `SectStore`: `FileSectStore` ở `<DATA_DIR>/sects/` hoặc `PgSectStore`; ba bất biến giữ bằng cấu trúc: tên / biệt hiệu duy nhất, một linh hồn một tông môn, một Tông chủ), `sect-service.ts` (`SectService`: luật + kho, quyền kiểm TRÊN bản ghi trong `update`, giải tán chỉ khi kho rỗng bằng `delete(id, guard)`). Thành viên là LINH HỒN (`Identity.soulKey`). Tiền đi theo thứ tự "trừ ví -> LƯU hồ sơ -> kho" (rút: kho -> ví -> lưu): chỉ được MẤT, không bao giờ tăng. `SECTS=off` gỡ tính năng. `Player.sect` (biệt hiệu) là state công khai, chỉ đổi lúc đổi tông môn.
- Tài khoản (M3 bước 3, `docs/THIET_KE_TAI_KHOAN.md`): `server/src/auth.ts` (scrypt, token phiên, mã khôi phục), `account-store.ts` (`AccountStore` / `SessionStore`, bản file), `auth-service.ts` (`AuthService`: đăng ký / đăng nhập / phiên / khôi phục, giới hạn tần suất ở `auth-limits.ts`), `auth-http.ts` (`mountAuth`: `/health` kèm `authMode` và, khi `AUTH_MODE=account`, `/api/auth/*`). Cùng nguồn, không CORS. `AUTH_MODE=legacy` (mặc định) giữ nguyên đăng nhập bằng đạo hiệu + mã bí mật. Mật khẩu, mã khôi phục, token không bao giờ ghi log hay lưu dạng rõ.
- `server/src/systems/`: logic game, mỗi file một mảng: `movement`, `combat`, `monsters`, `progression`, `chat`, `inventory` (túi đồ, đan dược, lệnh `/give` khi không chạy production), `loot` (rơi đồ, nhặt, vứt đồ), `quests` (tiến độ nhiệm vụ cập nhật từ sự kiện), `npc` (nói chuyện, nhận / trả nhiệm vụ, đổi đồ), `wallet` (ví Linh thạch: mọi thay đổi số dư đi qua `changeCoin` / `trySpendCoin` / `splitCoin`), `shop` (mua / bán với NPC bán hàng, trọn vẹn hoặc không gì cả), `interest` (vùng nhìn: mỗi client chỉ nhận state của thực thể ở gần, bằng `StateView`), `reincarnation` (chết do quái = Hoàng Tuyền: `beginLimbo`, `creditSoul`, `applyRebirth`; chỉ chạy khi `World.reincarnate` bật, `WorldRoom` bật, bench và test đơn vị mặc định tắt), `travel` (kiểm đi qua cổng), `dungeon` (bí cảnh: sổ run ở `Hub.runs`, phòng tạm theo đội, thưởng + lượt ngày; **gục trong bí cảnh KHÔNG mất kiếp**: `dungeonFall` chạy trước `beginLimbo` trong `hurtPlayer`, `docs/THIET_KE_BI_CANH.md` mục 4.4), `duel` (PK thách đấu hai bên đồng ý, `duelHit` KHÔNG qua `hurtPlayer` / `beginLimbo`, `docs/THIET_KE_PK.md`), `sect` (tông môn nối với phòng: sổ lời mời + thành viên trực tuyến ở `Hub.sects`, chat `/s`, kho chung đi qua ví + `World.onSaveNow`, `docs/THIET_KE_TONG_MON.md`).
  - Các system nhận `World` (`server/src/world.ts`: state, dữ liệu riêng của người chơi/quái, `events` để gửi tin), không đụng tới Colyseus `Room`. Tính năng mới thì thêm system mới.
- `server/src/schema.ts` là state đồng bộ, `store.ts` lưu nhân vật dạng JSON ở `server/data/players/`.
- Test:
  - `shared/**/*.test.ts`, `server/src/systems/*.test.ts`: test đơn vị với `World` giả (dựng bằng `server/src/systems/test-helpers.ts`).
  - `server/src/rooms/WorldRoom.test.ts`: test tích hợp với server Colyseus thật.
  - Tính năng server mới cần có test.
- `client/src/scenes/WorldScene.ts`: vẽ, input, đoán trước di chuyển. `ui.ts` là HUD DOM, `textures.ts` là ảnh tạm vẽ bằng code.
- **Không import hằng / hàm bản đồ toàn cục** (`TOWN_PX`, `WORLD_W`, `MAP_TILES`, `tileAt`, `moveWithCollision`, `inTown`, `dangerAt`...) trong `server/` và `client/`: server đọc `world.map`, client đọc `scene.map` (`GameMap`). Các tên cũ chỉ còn trong `shared/` để giữ tương thích; `server/scripts/no-global-map-imports.test.ts` đỏ nếu ai import lại (kể cả `import * as`, `export ... from`, đường dẫn tương đối). Cần số đo của bản đồ (kích thước, trấn, độ nguy hiểm) thì thêm vào `GameMap`, không chép công thức ở nơi dùng.
- Luồng di chuyển: client gửi `input {seq, dx, dy}` mỗi 50 ms và tự đoán trước vị trí. Server xử lý mỗi input đúng một bước 50 ms bằng `moveWithCollision` dùng chung. Client đối chiếu lại theo `lastSeq`.
  - Đổi tốc độ, va chạm hay bước tick thì phải sửa trong `shared/` để hai bên vẫn khớp.

## Quy tắc bắt buộc
- **Server quyết định mọi kết quả** (sát thương, rơi đồ, tu vi, nhiệm vụ). Client chỉ gửi ý định và hiển thị.
- **Server không tin client:**
  - Kiểm tra kiểu, giá trị hữu hạn, khoảng cách, hồi chiêu cho mọi tin nhắn.
  - Đăng ký tin nhắn mới bằng `this.on(...)` trong `WorldRoom` (có giới hạn tần suất, `server/src/rate-limit.ts`), không gọi thẳng `onMessage`.
  - Tra bảng `*_BY_ID` bằng id đến từ client / file lưu thì dùng `byId(TABLE, id)` (`server/src/systems/lookup.ts`): `TABLE["constructor"]` không phải `undefined`.
  - Dữ liệu riêng (túi đồ, nhiệm vụ, Linh thạch) không đưa vào state chung, chỉ gửi cho chủ.
  - Số liệu từ file lưu cũng không tin: nạp qua hàm kẹp / làm sạch (`addCoin`, `sanitizeInventory`...), không gán thẳng.
- **Đổi `shared/`:** làm PR riêng, chỉ sửa `shared/`, một dev khác review trước khi các bên code tiếp.
- **Phiên bản đã ghim:** Colyseus 0.16, `@colyseus/schema` 3, `colyseus.js` 0.16, Phaser 3.90, TypeScript 5.9.
  - Không tự nâng major. Các bản mới (Colyseus 0.18, Phaser 4, TS 7) đổi API.
  - Schema dùng decorator `@type`, cần `experimentalDecorators` + `useDefineForClassFields: false` (đã cấu hình trong `server/tsconfig.json`).
- **Asset:** chỉ dùng CC0 / CC-BY (ghi nguồn trong `CREDITS.md`). Không dùng chữ, tên, hình hay âm thanh của game khác. Thế giới, địa danh, nhân vật phải là của Tiên Giới.

## Hiệu năng (làm tới đâu tối ưu tới đó)
Vẫn dùng TypeScript; tối ưu thuật toán và dữ liệu gửi đi ngay khi viết, đo bằng số chứ không đoán.
- **Đo trước và sau:** `npm run bench -w server` mô phỏng 0 / 10 / 50 / 100 người chơi trong `World` thật (có seed, kết quả cố định), in thời gian tick và byte patch mỗi client. Dán bảng trước / sau vào PR khi đụng vòng lặp tick hoặc state.
  - Bench hằng đêm (`.github/workflows/bench.yml`, #97) so với mốc `server/src/perf/bench-baseline.json` và đỏ nếu byte/tick ở 100 người tăng quá 15%. PR nào đổi byte/tick có chủ ý thì cập nhật mốc cùng PR. Bench có seed nên **nhạy với số lần gọi `Math.random` trong mô phỏng**: thêm tính năng gọi `Math.random` trong luồng tick (vd rơi tiền, #99) làm quỹ đạo đổi và số byte nhích dù không đổi gì về state; ghi rõ trong PR và cập nhật mốc.
- **Ngân sách** (test trong `server/src/systems/perf.test.ts` giữ, CI đỏ nếu vượt): tick < 10 ms; không ai chơi thì patch = 0 byte; 100 người < 520 byte/tick **mỗi client** (đo theo StateView của từng client).
- Ca xấu nhất của vùng nhìn là đông người tụ trong trấn (ai cũng thấy nhau): `npm run bench -w server -- --crowd`. Hiện ~9.5 KB/s mỗi client ở 100 người (484 byte/tick; trước #80 là ~25 KB/s), `perf.test.ts` giữ ngưỡng < 600; đừng chỉ đo ca săn quái rải khắp bản đồ.
- **Vị trí người chơi:** `Player.x`, `Player.y` là vị trí thật (float, mô phỏng và đối chiếu dự đoán) và **chỉ gửi cho chủ** (`@view(TAG_OWNER)`). Người khác nhận `px`, `py` (số nguyên, ~10 Hz, `syncPublicPos`); client vẽ người khác theo `px`, `py`. Dịch chuyển tức thời (vào phòng, hồi sinh) phải gọi `syncPublicPos(p)`. Đừng đọc `x`, `y` của người khác ở client.
- **Băng thông quan trọng hơn CPU:** mỗi trường state đổi là một patch gửi cho *mọi client đang thấy thực thể đó* (xem `interest`), 20 lần/giây.
  - Không ghi vào state mỗi tick những giá trị chỉ nhích số lẻ: cộng dồn trong dữ liệu riêng của server (`PlayerCtrl` / `MonsterCtrl`) rồi ghi phần nguyên (`takeWhole`) hoặc ghi định kỳ.
  - Thứ không ai nhìn thấy thì không cập nhật (quái "ngủ" khi không có người chơi trong `MONSTER_WAKE_DIST`).
  - Tin nhắn có vị trí (`fx`, `dmg`, hiệu ứng mới) gửi bằng `WorldRoom.sendNear` (chỉ người trong vùng nhìn), không `broadcast` cả phòng. Chỉ chat và thông báo hệ thống mới là của cả phòng.
  - Gán lại giá trị y hệt thì schema bỏ qua; gán số thực khác đi một chút là gửi 8 byte.
- **CPU:** tránh vòng lặp lồng nhau người chơi × thực thể mỗi tick khi số lượng có thể lớn; nếu cần thì chia lưới không gian. Không tạo object / mảng mới trong vòng lặp nóng nếu tránh được.
- Hot path nào đo rồi vẫn quá chậm mới tính tới chuyển riêng phần đó sang Rust (napi-rs / WebAssembly).

## Git
- Không commit hay push thẳng lên `main`. Mỗi việc một nhánh (`a/...`, `b/...` hoặc `c/...`) và một PR, ghi `Closes #<số issue>`.
- Vì chung tài khoản GitHub nên không Approve được: người review comment "LGTM" rồi mới merge.
- Tên commit đặt theo thư mục (`git config user.name` không có `--global`).
- Chỉ commit, push hay merge khi dev yêu cầu.
- Definition of Done: `docs/PHAN_CONG.md#definition-of-done-một-việc-được-coi-là-xong-khi`.
