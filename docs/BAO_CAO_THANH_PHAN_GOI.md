# Báo cáo Phân tích Thành phần Gói tải Client (Bundle Breakdown)

> Ngày tạo: 2026-11-14 17:54:20.709Z
> Gói JS chính: `assets/index-Dj4xVeKF.js` — **1946.91 KiB** thô, **496.86 KiB** gzip level 9 (hoặc **511.57 KB** theo log của Vite).
> Ngân sách tối đa: **520 KB** (Khoảng đệm an toàn hiện tại: **23.14 KiB** / **8.43 KB**).

## 1. Cơ cấu theo Nhóm thành phần

| Thành phần | Mô tả | Kích thước thô | Tỷ lệ thô | Ước tính Gzip | Tỷ lệ Gzip |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Phaser 3 Engine** | Bộ engine game 2D chính (dist/phaser.js) | 8082.07 KiB | 88.8% | **441.11 KiB** | 88.8% |
| **Colyseus Client & Schema** | Kết nối WebSocket, đồng bộ Schema state và msgpackr | 366.06 KiB | 4% | **19.98 KiB** | 4% |
| **Hợp đồng Game (shared/)** | Bản đồ, vật phẩm, công thức, nhiệm vụ, cảnh giới, chiêu thức | 86.15 KiB | 0.9% | **4.7 KiB** | 0.9% |
| **DOM UI (HUD & Panels)** | Giao diện HTML/DOM: HUD, phím tắt, bảng phím, modal, chat | 177.4 KiB | 1.9% | **9.68 KiB** | 1.9% |
| **Mã Game (Scenes, GFX, Logic)** | Phaser WorldScene, map-render, VFX, âm thanh, điều khiển | 369.68 KiB | 4.1% | **20.18 KiB** | 4.1% |
| **Thư viện khác & Polyfills** | Capacitor, tslib, vite/modulepreload-polyfill | 22.01 KiB | 0.2% | **1.2 KiB** | 0.2% |

### Nhận định trọng điểm:
- **Phaser 3 Engine** chiếm tới **~441.11 KiB gzip** (chiếm **~88.8%** toàn bộ gói!). Đây là tệp unminified/bundled từ `dist/phaser.js` của Phaser 3.90.
- **Colyseus Client + Schema** chiếm **~19.98 KiB gzip** (~4.0%).
- **Mã Game (WorldScene, GFX, FX, Connection)** chiếm **~20.18 KiB gzip** (~4.1%).
- **DOM UI (HUD, Modal, Chat, Panels)** chiếm **~9.68 KiB gzip** (~1.9%).
- **Hợp đồng Shared** chiếm **~4.7 KiB gzip** (~0.9%).

## 2. Top 20 Module nặng nhất trong Bundle

| STT | Module | Kích thước thô | Tỷ lệ | Ước tính Gzip |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `node_modules/phaser/dist/phaser.js` | 8081.94 KiB | 88.8% | ~441.11 KiB |
| 2 | `node_modules/@colyseus/schema/build/umd/index.js` | 234.1 KiB | 2.6% | ~12.78 KiB |
| 3 | `client/src/ui.ts` | 144.6 KiB | 1.6% | ~7.89 KiB |
| 4 | `client/src/scenes/WorldScene.ts` | 99.11 KiB | 1.1% | ~5.41 KiB |
| 5 | `node_modules/@colyseus/msgpackr/pack.js` | 38.53 KiB | 0.4% | ~2.1 KiB |
| 6 | `node_modules/@colyseus/msgpackr/unpack.js` | 33.12 KiB | 0.4% | ~1.81 KiB |
| 7 | `client/src/main.ts` | 23.25 KiB | 0.3% | ~1.27 KiB |
| 8 | `shared/src/quests.ts` | 20.44 KiB | 0.2% | ~1.12 KiB |
| 9 | `node_modules/tslib/tslib.es6.mjs` | 17.47 KiB | 0.2% | ~0.95 KiB |
| 10 | `client/src/map-render.ts` | 14.83 KiB | 0.2% | ~0.81 KiB |
| 11 | `client/src/auth-ui.ts` | 13.38 KiB | 0.1% | ~0.73 KiB |
| 12 | `shared/src/map.ts` | 13.36 KiB | 0.1% | ~0.73 KiB |
| 13 | `shared/src/skills.ts` | 12.54 KiB | 0.1% | ~0.68 KiB |
| 14 | `client/src/gfx/quality.ts` | 12.29 KiB | 0.1% | ~0.67 KiB |
| 15 | `client/src/audio.ts` | 11.21 KiB | 0.1% | ~0.61 KiB |
| 16 | `shared/src/items.ts` | 10.98 KiB | 0.1% | ~0.6 KiB |
| 17 | `node_modules/colyseus.js/build/cjs/Client.js` | 10.8 KiB | 0.1% | ~0.59 KiB |
| 18 | `client/src/auth.ts` | 10.74 KiB | 0.1% | ~0.59 KiB |
| 19 | `client/src/gfx/packs.ts` | 10.44 KiB | 0.1% | ~0.57 KiB |
| 20 | `node_modules/colyseus.js/build/cjs/Room.js` | 9.75 KiB | 0.1% | ~0.53 KiB |

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
- **Tổng mã các bảng có thể tách**: **60.88 KiB thô**, tương đương **~3.32 KiB gzip**.
- **Gói chính lúc khởi động sau khi tách**: giảm từ **496.86 KiB** (511.57 KB) xuống còn **~493.54 KiB** (~508.17 KB).
- **Dư địa ngân sách an toàn**: tăng từ **23.14 KiB** (8.43 KB) lên **~26.46 KiB**, tạo khoảng đệm an toàn lớn cho các tính năng tiếp theo của M7 và M8.

## 4. Đề xuất Kiến trúc cho Dev A

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
   - Chunk Phaser (~443 KiB gzip) sẽ được Service Worker cache immutable vĩnh viễn. Khi cập nhật bản mới, người chơi chỉ cần tải lại chunk game (~60 KiB) thay vì toàn bộ ~500 KiB.