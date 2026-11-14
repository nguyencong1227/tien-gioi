# Báo cáo Phân tích Thành phần Gói tải Client (Bundle Breakdown)

> Ngày cập nhật: 2026-11-15 (M7.15, Refs #516)
> Gói JS chính: `assets/index-Dj4xVeKF.js` — **1946.91 KiB** thô, **496.86 KiB** gzip level 9 (hoặc **511.57 KB** theo log của Vite).
> Ngân sách tối đa: **520 KB** (Khoảng đệm an toàn hiện tại: **23.14 KiB** / **8.43 KB**).

## 1. Cơ cấu theo Nhóm thành phần

| Thành phần | Mô tả | Kích thước thô | Tỷ lệ thô | Minified | Tỷ lệ Min | Ước tính Gzip | Tỷ lệ Gzip |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Phaser 3 Engine** | Bộ engine game 2D chính (dist/phaser.js) | 8082.07 KiB | 88.8% | 1447.11 KiB | 71.9% | **357.32 KiB** | 71.9% |
| **Colyseus Client & Schema** | Kết nối WebSocket, đồng bộ Schema state và msgpackr | 366.06 KiB | 4% | 123.35 KiB | 6.1% | **30.46 KiB** | 6.1% |
| **Hợp đồng Game (shared/)** | Bản đồ, vật phẩm, công thức, nhiệm vụ, cảnh giới, chiêu thức | 86.15 KiB | 0.9% | 74.09 KiB | 3.7% | **18.29 KiB** | 3.7% |
| **DOM UI (HUD & Panels)** | Giao diện HTML/DOM: HUD, phím tắt, bảng phím, modal, chat | 177.4 KiB | 1.9% | 119.16 KiB | 5.9% | **29.42 KiB** | 5.9% |
| **Mã Game (Scenes, GFX, Logic)** | Phaser WorldScene, map-render, VFX, âm thanh, điều khiển | 369.68 KiB | 4.1% | 234.75 KiB | 11.7% | **57.96 KiB** | 11.7% |
| **Thư viện khác & Polyfills** | Capacitor, tslib, vite/modulepreload-polyfill | 22.01 KiB | 0.2% | 13.74 KiB | 0.7% | **3.39 KiB** | 0.7% |

### Nhận định trọng điểm:
- **Phaser 3 Engine**: chiếm **~357.32 KiB gzip** (71.9% bundle). Tỷ lệ minified thực tế phản ánh chính xác kích thước trong gói so với mã nguồn thô chưa nén. Khi áp dụng production alias `phaser-arcade-physics.min.js` (#565), Phaser giảm từ ~441 KiB xuống ~282 KiB gzip.
- **Colyseus Client + Schema**: chiếm **~30.46 KiB gzip** (~6.1%).
- **Mã Game (WorldScene, GFX, FX, Connection)**: chiếm **~57.96 KiB gzip** (~11.7%).
- **DOM UI (HUD, Modal, Chat, Panels)**: chiếm **~29.42 KiB gzip** (~5.9%).
- **Hợp đồng Shared**: chiếm **~18.29 KiB gzip** (~3.7%).

## 2. Top 20 Module nặng nhất trong Bundle (xếp theo Minified)

| STT | Module | Kích thước thô | Minified | Tỷ lệ Min | Ước tính Gzip |
| :---: | :--- | :---: | :---: | :---: | :---: |
| 1 | `node_modules/phaser/dist/phaser.js` | 8081.94 KiB | 1447 KiB | 71.9% | ~357.29 KiB |
| 2 | `client/src/ui.ts` | 144.6 KiB | 96.16 KiB | 4.8% | ~23.74 KiB |
| 3 | `node_modules/@colyseus/schema/build/umd/index.js` | 234.1 KiB | 60.2 KiB | 3% | ~14.86 KiB |
| 4 | `client/src/scenes/WorldScene.ts` | 99.11 KiB | 59.34 KiB | 2.9% | ~14.65 KiB |
| 5 | `shared/src/quests.ts` | 20.44 KiB | 24.1 KiB | 1.2% | ~5.95 KiB |
| 6 | `node_modules/@colyseus/msgpackr/unpack.js` | 33.12 KiB | 18.37 KiB | 0.9% | ~4.54 KiB |
| 7 | `node_modules/@colyseus/msgpackr/pack.js` | 38.53 KiB | 16.67 KiB | 0.8% | ~4.12 KiB |
| 8 | `client/src/main.ts` | 23.25 KiB | 15.34 KiB | 0.8% | ~3.79 KiB |
| 9 | `node_modules/tslib/tslib.es6.mjs` | 17.47 KiB | 10.98 KiB | 0.5% | ~2.71 KiB |
| 10 | `shared/src/skills.ts` | 12.54 KiB | 10.76 KiB | 0.5% | ~2.66 KiB |
| 11 | `client/src/map-render.ts` | 14.83 KiB | 9.15 KiB | 0.5% | ~2.26 KiB |
| 12 | `client/src/auth-ui.ts` | 13.38 KiB | 8.92 KiB | 0.4% | ~2.2 KiB |
| 13 | `shared/src/items.ts` | 10.98 KiB | 8.68 KiB | 0.4% | ~2.14 KiB |
| 14 | `client/src/auth.ts` | 10.74 KiB | 8.44 KiB | 0.4% | ~2.08 KiB |
| 15 | `client/src/gfx/quality.ts` | 12.29 KiB | 7.61 KiB | 0.4% | ~1.88 KiB |
| 16 | `client/src/audio.ts` | 11.21 KiB | 7.5 KiB | 0.4% | ~1.85 KiB |
| 17 | `shared/src/map.ts` | 13.36 KiB | 7.38 KiB | 0.4% | ~1.82 KiB |
| 18 | `client/src/keybinds.ts` | 9.01 KiB | 7.13 KiB | 0.4% | ~1.76 KiB |
| 19 | `client/src/gfx/packs.ts` | 10.44 KiB | 6.06 KiB | 0.3% | ~1.5 KiB |
| 20 | `client/src/dungeon.ts` | 6.57 KiB | 5.6 KiB | 0.3% | ~1.38 KiB |

## 3. Tiềm năng Tách Dynamic `import()` các Bảng UI ít dùng

Hiện tại, file `client/src/ui.ts` chứa hơn 5.250 dòng lệnh và gom toàn bộ các cửa sổ/modal vào gói khởi động chính. Người chơi lúc vào game chưa cần mở ngay các bảng này.

| Bảng UI / Modal | Điều kiện mở | Số dòng | Kích thước thô |
| :--- | :--- | :---: | :---: |
| **Bảng Phím tắt (Keys Modal)** | Phím H hoặc nút Trợ giúp | 108 dòng | 3.77 KiB |
| **Bảng Nhiệm vụ chi tiết (Quest Modal)** | Phím Q hoặc nút Nhiệm vụ | 384 dòng | 11.94 KiB |
| **Bảng Thợ rèn & Luyện khí (Forge Modal)** | Nói chuyện NPC Thợ rèn | 108 dòng | 3.87 KiB |
| **Bảng Cửa hàng & Đổi đồ (Shop Modal)** | Nói chuyện NPC Thương nhân | 420 dòng | 12.33 KiB |
| **Bảng Công pháp (Skills Modal)** | Phím K hoặc nút Công pháp | 149 dòng | 5.56 KiB |
| **Bảng Hoàng Tuyền (Limbo & Reincarnation)** | Chết / Gục ngã vào Hoàng Tuyền | 354 dòng | 11.44 KiB |
| **Bảng Tông môn (Sect Modal)** | Phím G hoặc nút Tông môn | 238 dòng | 8.09 KiB |
| **Bảng Tổ đội & Thách đấu (Party & Duel)** | Phím P hoặc nút Đội | 118 dòng | 3.88 KiB |

### Hiệu quả dự kiến:
- **Tổng mã các bảng có thể tách**: **60.88 KiB thô**, tương đương **~14.5 KiB gzip** (với tỉ lệ nén mã ứng dụng HTML/DOM thực tế ~4:1).
- **Gói chính lúc khởi động sau khi tách**: giảm từ **496.86 KiB** (511.57 KB) xuống còn **~482.36 KiB** (~496.72 KB).
- **Dư địa ngân sách an toàn**: tăng từ **23.14 KiB** (8.43 KB) lên **~37.64 KiB**, tạo khoảng đệm an toàn lớn cho các tính năng tiếp theo của M7 và M8.

## 4. Quyết định & Đề xuất Kiến trúc cho Nhóm

> **Quyết định (M7):** PR #565 của Dev A (cấu hình production alias `phaser` -> `phaser-arcade-physics.min.js`) đã giúp gói chính giảm ~34 KB gzip (còn ~463 KB gzip, dư ~57 KB tới trần 520 KB). Áp lực ngân sách gói tải M7 đã được giải tỏa hoàn toàn mà không cần thay đổi mã game.
> Do đó, nhóm **chưa cần tách `import()` các bảng UI ở M7**. Phương án tách panel dưới đây được lưu lại làm kiến trúc chuẩn bị cho M8 khi bổ sung thêm các tính năng lớn.

### Lộ trình tách Panel khi cần (M8):
1. **Tách các panel thành các file riêng trong `client/src/panels/`**:
   - `client/src/panels/skills-modal.ts` (Bảng Công pháp: danh sách chiêu, ngưng tụ, gán ô)
   - `client/src/panels/limbo-modal.ts` (Bảng Hoàng Tuyền: khắc bia chân linh, chọn xuất thân)
   - `client/src/panels/sect-modal.ts` (Bảng Tông môn: thành viên, kho, bổng lộc)
   - `client/src/panels/shop-modal.ts` (Bảng Cửa hàng & Thợ rèn: mua bán, luyện khí)
   - `client/src/panels/keys-modal.ts` (Bảng Phím tắt: gợi ý, đổi phím bấm)
   - `client/src/panels/quest-modal.ts` (Bảng Nhiệm vụ chi tiết: lịch sử, chuỗi nhiệm vụ)
2. **Cơ chế nạp theo nhu cầu (Lazy Loading)**:
   - Khi người chơi bấm phím tắt hoặc click nút: gọi `import('./panels/<tên>.js').then(m => m.open(...))`.
   - Lưu cache module sau lần nạp đầu tiên để mở tức thì ở các lần sau mà không nạp lại.
3. **Tách riêng chunk Phaser 3 (Tùy chọn tương lai cho M8)**:
   - Cấu hình Rollup `manualChunks: { vendor_phaser: ['phaser'] }`.
   - Chunk Phaser (~282 KiB gzip) sẽ được Service Worker cache immutable vĩnh viễn. Khi cập nhật bản mới, người chơi chỉ cần tải lại chunk game thay vì toàn bộ bundle.