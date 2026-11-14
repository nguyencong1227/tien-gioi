# Báo cáo Phân tích Thành phần Gói tải Client (Bundle Breakdown)

> Ngày cập nhật: 2026-11-15 (M7.15, Refs #516)
> Gói JS chính: `assets/index-BKv90fq4.js` — **1564.64 KiB** thô, **456.18 KiB** gzip level 9 (hoặc **469.13 KB** theo log của Vite).
> Ngân sách tối đa: **520 KB** (Khoảng đệm an toàn hiện tại: **63.82 KiB** / **50.87 KB**).

## 1. Cơ cấu theo Nhóm thành phần

| Thành phần | Mô tả | Kích thước thô | Tỷ lệ thô | Minified | Tỷ lệ Min | Ước tính Gzip | Tỷ lệ Gzip |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Phaser 3 Engine** | Bộ engine game 2D chính (dist/phaser.js) | 1072.35 KiB | 51% | 1060.86 KiB | 65% | **296.66 KiB** | 65% |
| **Colyseus Client & Schema** | Kết nối WebSocket, đồng bộ Schema state và msgpackr | 366.06 KiB | 17.4% | 123.35 KiB | 7.6% | **34.5 KiB** | 7.6% |
| **Hợp đồng Game (shared/)** | Bản đồ, vật phẩm, công thức, nhiệm vụ, cảnh giới, chiêu thức | 86.82 KiB | 4.1% | 74.38 KiB | 4.6% | **20.8 KiB** | 4.6% |
| **DOM UI (HUD & Panels)** | Giao diện HTML/DOM: HUD, phím tắt, bảng phím, modal, chat | 177.4 KiB | 8.4% | 119.17 KiB | 7.3% | **33.32 KiB** | 7.3% |
| **Mã Game (Scenes, GFX, Logic)** | Phaser WorldScene, map-render, VFX, âm thanh, điều khiển | 377.54 KiB | 18% | 239.79 KiB | 14.7% | **67.06 KiB** | 14.7% |
| **Thư viện khác & Polyfills** | Capacitor, tslib, vite/modulepreload-polyfill | 22.01 KiB | 1% | 13.74 KiB | 0.8% | **3.84 KiB** | 0.8% |

### Nhận định trọng điểm:
- **Phaser 3 Engine**: chiếm **~296.66 KiB gzip** (65% bundle). Tỷ lệ minified thực tế phản ánh chính xác kích thước trong gói so với mã nguồn thô chưa nén. Khi áp dụng production alias `phaser-arcade-physics.min.js` (#565), Phaser giảm từ ~441 KiB xuống ~282 KiB gzip.
- **Colyseus Client + Schema**: chiếm **~34.5 KiB gzip** (~7.6%).
- **Mã Game (WorldScene, GFX, FX, Connection)**: chiếm **~67.06 KiB gzip** (~14.7%).
- **DOM UI (HUD, Modal, Chat, Panels)**: chiếm **~33.32 KiB gzip** (~7.3%).
- **Hợp đồng Shared**: chiếm **~20.8 KiB gzip** (~4.6%).

## 2. Top 20 Module nặng nhất trong Bundle (xếp theo Minified)

| STT | Module | Kích thước thô | Minified | Tỷ lệ Min | Ước tính Gzip |
| :---: | :--- | :---: | :---: | :---: | :---: |
| 1 | `node_modules/phaser/dist/phaser-arcade-physics.min.js` | 1072.15 KiB | 1060.68 KiB | 65% | ~296.61 KiB |
| 2 | `client/src/ui.ts` | 144.6 KiB | 96.16 KiB | 5.9% | ~26.89 KiB |
| 3 | `node_modules/@colyseus/schema/build/umd/index.js` | 234.1 KiB | 60.2 KiB | 3.7% | ~16.83 KiB |
| 4 | `client/src/scenes/WorldScene.ts` | 100.62 KiB | 60.08 KiB | 3.7% | ~16.8 KiB |
| 5 | `shared/src/quests.ts` | 20.44 KiB | 24.1 KiB | 1.5% | ~6.74 KiB |
| 6 | `node_modules/@colyseus/msgpackr/unpack.js` | 33.12 KiB | 18.37 KiB | 1.1% | ~5.14 KiB |
| 7 | `node_modules/@colyseus/msgpackr/pack.js` | 38.53 KiB | 16.67 KiB | 1% | ~4.66 KiB |
| 8 | `client/src/main.ts` | 23.45 KiB | 15.49 KiB | 0.9% | ~4.33 KiB |
| 9 | `shared/src/skills.ts` | 12.87 KiB | 10.99 KiB | 0.7% | ~3.07 KiB |
| 10 | `node_modules/tslib/tslib.es6.mjs` | 17.47 KiB | 10.98 KiB | 0.7% | ~3.07 KiB |
| 11 | `client/src/map-render.ts` | 14.83 KiB | 9.15 KiB | 0.6% | ~2.56 KiB |
| 12 | `client/src/auth-ui.ts` | 13.38 KiB | 8.92 KiB | 0.5% | ~2.5 KiB |
| 13 | `shared/src/items.ts` | 10.98 KiB | 8.68 KiB | 0.5% | ~2.43 KiB |
| 14 | `client/src/auth.ts` | 10.74 KiB | 8.44 KiB | 0.5% | ~2.36 KiB |
| 15 | `client/src/gfx/quality.ts` | 12.29 KiB | 7.61 KiB | 0.5% | ~2.13 KiB |
| 16 | `client/src/audio.ts` | 11.21 KiB | 7.5 KiB | 0.5% | ~2.1 KiB |
| 17 | `shared/src/map.ts` | 13.36 KiB | 7.38 KiB | 0.5% | ~2.06 KiB |
| 18 | `client/src/keybinds.ts` | 9.01 KiB | 7.13 KiB | 0.4% | ~1.99 KiB |
| 19 | `client/src/gfx/packs.ts` | 10.44 KiB | 6.06 KiB | 0.4% | ~1.69 KiB |
| 20 | `client/src/dungeon.ts` | 6.57 KiB | 5.6 KiB | 0.3% | ~1.57 KiB |

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
- **Gói chính lúc khởi động sau khi tách**: giảm từ **456.18 KiB** (469.13 KB) xuống còn **~441.68 KiB** (~454.28 KB).
- **Dư địa ngân sách an toàn**: tăng từ **63.82 KiB** (50.87 KB) lên **~78.32 KiB**, tạo khoảng đệm an toàn lớn cho các tính năng tiếp theo của M7 và M8.

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