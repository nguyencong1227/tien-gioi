# Bộ Ảnh Mốc Đa Viewport M5 (Baseline Multi-Viewport Screenshots)

> Thư mục chứa bộ ảnh chụp màn hình làm mốc đối chiếu trước khi thực hiện các cải tiến giao diện đa thiết bị & đồ hoạ Phaser trong Milestone M5.
> Được sinh tự động bởi `client/scripts/capture-viewports.mjs` (`npm run capture:viewports` hoặc `npm run chup-viewport`).
> Định dạng: **WebP (quality 75)**, tự động kiểm tra chống trùng lặp băm sha256 giữa các kịch bản.
> Thời điểm chụp mốc: `2026-11-12T03:16:39.117Z`.
> Tổng dung lượng: **3.84 MB** (49 tệp WebP).

## 1. Danh sách Viewport đo đạc

| Mã | Thiết bị mô phỏng | Kích thước (px) | Mật độ điểm ảnh (DPR) | Loại thiết bị |
|---|---|---|---|---|
| `mobile-p` | Điện thoại dọc (iPhone / Android chuẩn) | 390 × 844 | 2 | Di động (Cảm ứng) |
| `mobile-l` | Điện thoại ngang (Gaming landscape) | 844 × 390 | 2 | Di động (Cảm ứng) |
| `mobile-sm` | Điện thoại nhỏ (Compact 360x640) | 360 × 640 | 2 | Di động (Cảm ứng) |
| `tablet-p` | Máy tính bảng dọc (iPad Portrait) | 768 × 1024 | 2 | Di động (Cảm ứng) |
| `tablet-l` | Máy tính bảng ngang (iPad Landscape) | 1024 × 768 | 2 | Di động (Cảm ứng) |
| `desktop-hd` | Máy tính Laptop / HD (1280x720) | 1280 × 720 | 1 | Máy tính (Chuột/Phím) |
| `desktop-fhd` | Máy tính Full HD (1920x1080) | 1920 × 1080 | 1 | Máy tính (Chuột/Phím) |

## 2. Danh sách Kịch bản giao diện

| Mã kịch bản | Tên kịch bản | Phần tử hiển thị yêu cầu | Mô tả kiểm tra |
|---|---|---|---|
| `01-auth-login` | Màn hình Đăng nhập | `#auth-view-login` | Ảnh mốc hiển thị |
| `02-auth-register` | Màn hình Đăng ký | `#auth-view-register` | Ảnh mốc hiển thị |
| `03-game-hud` | Giao diện chính trong game (HUD & Bản đồ) | `#hud` | Ảnh mốc hiển thị |
| `04-game-char` | Bảng Nhân vật (Chỉ số & Cảnh giới) | `#char-modal` | Ảnh mốc hiển thị |
| `05-game-inventory` | Bảng Túi đồ & Đan dược | `#inv-modal` | Ảnh mốc hiển thị |
| `06-game-settings` | Bảng Cài đặt & Tuỳ chọn | `#settings-modal` | Ảnh mốc hiển thị |
| `07-game-crowd` | Trấn đông người (30 người tụ tập) | `#hud` | Ảnh mốc hiển thị |

## 3. Tổng hợp ảnh chụp mốc (49 ảnh WebP)

- Xem trực quan dưới dạng gallery HTML tương tác tại: `index.html` (mở trong trình duyệt).
- Tệp siêu dữ liệu: `manifest.json`.
- Tất cả các ảnh trong cùng một viewport đều có băm sha256 duy nhất, đảm bảo các bảng modal (Nhân vật, Túi đồ, Cài đặt) được mở thật.

## 4. Cách chạy lại lệnh chụp
```bash
npm run capture:viewports
# hoặc:
npm run chup-viewport
```
