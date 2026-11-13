# Bộ Ảnh Mốc Đa Viewport M5 (Baseline Multi-Viewport Screenshots)

> **Bộ ảnh bản đồ ngoài** (`--maps`, #408 bước 4): Hắc Phong Cốc (mốc so sánh) và Âm Sương Trạch (bản đồ mới) ở năm khung nhìn; sương + thời tiết + nước BẬT, 12 đạo hữu đứng giữa trấn. Bộ ảnh mốc M5 nằm ở `docs/screenshots/m5-baseline` và không bị đụng tới.

> Thư mục chứa bộ ảnh chụp màn hình làm mốc đối chiếu trước khi thực hiện các cải tiến giao diện đa thiết bị & đồ hoạ Phaser trong Milestone M5.
> Được sinh tự động bởi `client/scripts/capture-viewports.mjs` (`npm run capture:viewports` hoặc `npm run chup-viewport`).
> Định dạng: **WebP (quality 75)**, tự động kiểm tra chống trùng lặp băm sha256 giữa các kịch bản.
> **Chế độ kiểm thử**: Sử dụng các chế độ giả lập client có sẵn (`?dungeon=mock&debug=1`, `?crowd=30`, `?auth=mock`) không phụ thuộc server mạng thật.
> Thời điểm chụp mốc: `2026-11-13T07:10:28.059Z`.
> Tổng dung lượng: **1.17 MB** (10 tệp WebP).

## 1. Danh sách Viewport đo đạc

| Mã | Thiết bị mô phỏng | Kích thước (px) | Mật độ điểm ảnh (DPR) | Loại thiết bị |
|---|---|---|---|---|
| `desktop-hd` | Máy tính Laptop / HD (1280x720) | 1280 × 720 | 1 | Máy tính (Chuột/Phím) |
| `tablet-p` | Máy tính bảng dọc (iPad Portrait) | 768 × 1024 | 2 | Di động (Cảm ứng) |
| `mobile-l` | Điện thoại ngang (Gaming landscape) | 844 × 390 | 2 | Di động (Cảm ứng) |
| `mobile-p` | Điện thoại dọc (iPhone / Android chuẩn) | 390 × 844 | 2 | Di động (Cảm ứng) |
| `mobile-sm` | Điện thoại nhỏ (Compact 360x640) | 360 × 640 | 2 | Di động (Cảm ứng) |

## 2. Danh sách Kịch bản giao diện

| Mã kịch bản | Tên kịch bản | Phần tử hiển thị yêu cầu | Mô tả kiểm tra |
|---|---|---|---|
| `08-map-hac-phong` | Hắc Phong Cốc (mốc so sánh: sương + thời tiết + nước) | `#hud` | Ảnh mốc hiển thị |
| `09-map-am-suong` | Âm Sương Trạch (sương + thời tiết + nước) | `#hud` | Ảnh mốc hiển thị |

## 3. Tổng hợp ảnh chụp mốc (10 ảnh WebP)

- Xem trực quan dưới dạng gallery HTML tương tác tại: `index.html` (mở trong trình duyệt).
- Tệp siêu dữ liệu: `manifest.json`.
- Tất cả các ảnh trong cùng một viewport đều có băm sha256 duy nhất, đảm bảo các bảng modal (Nhân vật, Túi đồ, Cài đặt) được mở thật.

## 4. Cách chạy lại lệnh chụp
```bash
npm run capture:viewports
# hoặc:
npm run chup-viewport
```
