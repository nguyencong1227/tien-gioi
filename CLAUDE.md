# Tiên Giới

MMORPG 2D tu tiên, chiến đấu thời gian thực. Client Phaser 3 + Vite, server Colyseus 0.16, TypeScript, npm workspaces.
Trả lời người dùng bằng tiếng Việt. Comment trong code viết tiếng Việt.

## Nhóm và nơi làm việc
- 2 dev cùng SSH vào một máy, cùng user Linux `nguyencong`, cùng tài khoản GitHub `nguyencong1227`.
- **Dev A (Server & Gameplay):** `~/TT/tien-gioi-a`, cổng 2567/5173, nhánh `a/...`.
- **Dev B (Client & Trải nghiệm):** `~/TT/tien-gioi-b`, cổng 2577/5183, nhánh `b/...`.
- Chỉ làm trong thư mục của dev đang làm việc với bạn. Không sửa, không `git switch`, không chạy server trong thư mục của người kia.
- Không sửa `~/.bashrc`, `~/.gitconfig` hay cấu hình global: hai người dùng chung.
- Chi tiết: `docs/LAM_CHUNG_MAY.md`. Phân công M2: `docs/PHAN_CONG.md` và GitHub issues (nhãn `dev-a` / `dev-b` / `shared`, milestone Sprint 0–3).

## Lệnh
Node 22 ở `~/.local/node/bin`. Nếu `npm` không có trong PATH thì thêm `export PATH=~/.local/node/bin:$PATH` vào đầu lệnh.

```bash
npm run dev          # server + client, cổng lấy từ .env.local
npm run typecheck    # bắt buộc qua trước khi commit
npm run build        # build client vào client/dist
```

- `.env.local` ở gốc repo (không commit) giữ `PORT` và `CLIENT_PORT` của từng dev. Vite dùng `strictPort`: lỗi cổng bị chiếm thì kiểm tra xem có đang chạy nhầm thư mục không, đừng đổi cổng cho xong.
- Chạy server nền xong nhớ tắt, để không giữ cổng của dev.

## Kiến trúc
- `shared/src/`: **hợp đồng** giữa client và server.
  - `realms.ts`: cảnh giới, chỉ số.
  - `game.ts`: hằng số, quái, kiểu tin nhắn.
  - `map.ts`: bản đồ sinh theo seed, va chạm.
- `server/src/rooms/WorldRoom.ts`: chỉ lo vào/ra phòng, lưu nhân vật, nối tin nhắn với system, vòng lặp 20 tick/giây.
- `server/src/systems/`: logic game, mỗi file một mảng: `movement`, `combat`, `monsters`, `progression`, `chat`, `inventory` (túi đồ, đan dược, lệnh `/give` khi không chạy production), `loot` (rơi đồ, nhặt, vứt đồ), `quests` (tiến độ nhiệm vụ cập nhật từ sự kiện), `npc` (nói chuyện, nhận / trả nhiệm vụ, đổi đồ).
  - Các system nhận `World` (`server/src/world.ts`: state, dữ liệu riêng của người chơi/quái, `events` để gửi tin), không đụng tới Colyseus `Room`. Tính năng mới thì thêm system mới.
- `server/src/schema.ts` là state đồng bộ, `store.ts` lưu nhân vật dạng JSON ở `server/data/players/`.
- Test:
  - `shared/**/*.test.ts`, `server/src/systems/*.test.ts`: test đơn vị với `World` giả (dựng bằng `server/src/systems/test-helpers.ts`).
  - `server/src/rooms/WorldRoom.test.ts`: test tích hợp với server Colyseus thật.
  - Tính năng server mới cần có test.
- `client/src/scenes/WorldScene.ts`: vẽ, input, đoán trước di chuyển. `ui.ts` là HUD DOM, `textures.ts` là ảnh tạm vẽ bằng code.
- Luồng di chuyển: client gửi `input {seq, dx, dy}` mỗi 50 ms và tự đoán trước vị trí. Server xử lý mỗi input đúng một bước 50 ms bằng `moveWithCollision` dùng chung. Client đối chiếu lại theo `lastSeq`.
  - Đổi tốc độ, va chạm hay bước tick thì phải sửa trong `shared/` để hai bên vẫn khớp.

## Quy tắc bắt buộc
- **Server quyết định mọi kết quả** (sát thương, rơi đồ, tu vi, nhiệm vụ). Client chỉ gửi ý định và hiển thị.
- **Server không tin client:**
  - Kiểm tra kiểu, giá trị hữu hạn, khoảng cách, hồi chiêu cho mọi tin nhắn.
  - Dữ liệu riêng (túi đồ, nhiệm vụ) không đưa vào state chung, chỉ gửi cho chủ.
- **Đổi `shared/`:** làm PR riêng, chỉ sửa `shared/`, người kia review trước khi hai bên code tiếp.
- **Phiên bản đã ghim:** Colyseus 0.16, `@colyseus/schema` 3, `colyseus.js` 0.16, Phaser 3.90, TypeScript 5.9.
  - Không tự nâng major. Các bản mới (Colyseus 0.18, Phaser 4, TS 7) đổi API.
  - Schema dùng decorator `@type`, cần `experimentalDecorators` + `useDefineForClassFields: false` (đã cấu hình trong `server/tsconfig.json`).
- **Asset:** chỉ dùng CC0 / CC-BY (ghi nguồn trong `CREDITS.md`). Không dùng chữ, tên, hình hay âm thanh của game khác. Thế giới, địa danh, nhân vật phải là của Tiên Giới.

## Git
- Không commit hay push thẳng lên `main`. Mỗi việc một nhánh (`a/...` hoặc `b/...`) và một PR, ghi `Closes #<số issue>`.
- Vì chung tài khoản GitHub nên không Approve được: người review comment "LGTM" rồi mới merge.
- Tên commit đặt theo thư mục (`git config user.name` không có `--global`).
- Chỉ commit, push hay merge khi dev yêu cầu.
- Definition of Done: `docs/PHAN_CONG.md#definition-of-done-một-việc-được-coi-là-xong-khi`.
