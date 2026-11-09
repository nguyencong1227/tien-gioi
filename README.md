# Tiên Giới

MMORPG 2D tu tiên, chiến đấu thời gian thực, chơi trên web và (sắp tới) app Android/iOS.
Thiết kế: [GDD.md](GDD.md).

## Chạy thử

Cần Node.js 22 (`.nvmrc`).

```bash
npm install
cp .env.example .env.local   # chỉnh cổng nếu cần
npm run dev        # server :2567 + client :5173 (Vite, tự reload)
npm test           # chạy test (Vitest); npm run test:watch để tự chạy lại khi sửa
```

Mở http://localhost:5173. Mở thêm tab ẩn danh hoặc điện thoại cùng mạng LAN (`http://<ip-máy>:5173`) để thử nhiều người chơi.

Chạy kiểu production (một cổng duy nhất):

```bash
npm run build && npm start   # http://localhost:2567
```

## Cấu trúc

```
shared/   Hợp đồng chung: cảnh giới, hằng số, quái, sinh bản đồ, va chạm, kiểu tin nhắn
server/   Colyseus: WorldRoom (vào/ra, lưu, nối tin nhắn), systems/ (logic game: movement, combat, monsters,
          progression, chat), world.ts (trạng thái dùng chung), schema (state đồng bộ), store (lưu nhân vật)
client/   Phaser 3 + Vite: WorldScene (vẽ, đoán trước di chuyển), ui (HUD DOM), joystick, textures (ảnh tạm)
```

### Luồng mạng
- Client gửi `input` {seq, dx, dy} mỗi 50 ms khi di chuyển và **tự đoán trước** vị trí của mình.
  Server xử lý mỗi input đúng một bước 50 ms. Khi nhận state, client lấy vị trí server làm gốc rồi
  chạy lại các input chưa được xử lý (`lastSeq`). Hàm di chuyển `moveWithCollision` dùng chung, nên hai bên khớp nhau.
- Người khác và quái: client nội suy về vị trí server.
- Đánh: client gửi `attack` / `skill` kèm góc. Server kiểm tra hồi chiêu, tầm đánh, tính sát thương rồi phát `fx` / `dmg`.
- Server 20 tick/giây, gửi patch 20 lần/giây.

## Chia việc cho 3 dev

Chi tiết từng sprint, tiêu chí "xong", quy trình review: **[docs/PHAN_CONG.md](docs/PHAN_CONG.md)**.
Ba dev cùng SSH vào một máy: **[docs/LAM_CHUNG_MAY.md](docs/LAM_CHUNG_MAY.md)** (thư mục và cổng riêng cho từng người).

- **Dev A: Server & Gameplay:** `server/`, logic trong `shared/`.
- **Dev B: Client & Trải nghiệm:** `client/`, asset, âm thanh, UI/UX.
- **Dev C: Công cụ, Thử tải & Phát hành:** CI, script thử tải (`server/scripts/`), PWA và đóng gói.
- `shared/` là hợp đồng chung: đổi gì ở đó thì làm PR riêng, một dev khác review trước.
- Logic quyết định kết quả (sát thương, rơi đồ, tu vi) **chỉ nằm ở server**.

## Thay ảnh tạm bằng asset thật
`client/src/textures.ts` vẽ ảnh bằng code với các key: `tileset`, `me`, `other`, `mon-<id>`, `swordbeam`, `dot`.
Nạp ảnh thật với cùng key trong `preload()` của `WorldScene` là xong. Nguồn CC0 gợi ý: Kenney.nl, OpenGameArt (ghi rõ nguồn trong `CREDITS.md`).

## Lưu ý bản thử
- Nhân vật lưu bằng file JSON trong `server/data/players` (đổi chỗ bằng biến môi trường `DATA_DIR`).
- Tên nhân vật được giữ bằng mã bí mật lưu trong trình duyệt. Đổi máy hoặc xóa dữ liệu trình duyệt thì mất quyền dùng tên đó. M4 sẽ có tài khoản thật.
- Một phòng `world` tối đa 100 người.

## Lộ trình
Xem [GDD.md](GDD.md#lộ-trình). Đóng gói app: thêm Capacitor vào `client/` (M4).
