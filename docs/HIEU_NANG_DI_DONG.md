# Đo Hiệu Năng Di Động & Đồ Hoạ (Mobile Performance Benchmark)

> Tài liệu thực nghiệm đo hiệu năng giao diện và đồ hoạ client trên thiết bị di động (M5.1, Issue #330).
> **Nguyên tắc**: Đo bằng số liệu thực tế, **không tối ưu mù**.

## 1. Môi trường và thông số đo
- **Thiết bị giả lập**: Chrome Headless CDP qua `Emulation.setDeviceMetricsOverride`.
- **Độ phân giải viewport**: 390 × 844 px (tỷ lệ màn hình iPhone 12/13/14 Pro chuẩn, DPR 2).
- **Chất lượng**: Được cố định tường minh qua `localStorage.setItem('tg_quality', tier)` cho từng kịch bản (`low`, `mid`, `high`).
- **CPU Throttling**:
  - **1x**: Máy tính bàn hoặc chip flagship cao cấp.
  - **4x**: Đại diện điện thoại Android / iOS tầm trung.
  - **6x**: Thiết bị đời cũ hoặc phân khúc thấp.

## 2. Bảng số liệu thực nghiệm ma trận

| Kịch bản | Bậc chất lượng | CPU | Vào game (s) | FPS TB | FPS p5 | Frame TB (ms) | Frame p95 (ms) | Ngân sách p95 | Trạng thái | JS Heap (MB) |
|---|---|---|---|---|---|---|---|---|---|---|
| Trấn đông (50 bot) | LOW | 4x | 1.36s | **60** | **60** | 16.66 ms | 16.67 ms | <= 9 ms | ⚠ VƯỢT | 26.5 MB |
| Trấn đông (50 bot) | MID | 4x | 1.08s | **60** | **60** | 16.66 ms | 16.67 ms | <= 11 ms | ⚠ VƯỢT | 28.1 MB |
| Trấn đông (50 bot) | HIGH | 4x | 1.15s | **48.5** | **40** | 20.63 ms | 25 ms | <= 13 ms | ⚠ VƯỢT | 22.9 MB |

## 3. Đối chiếu Ngân sách perf-budget.json
- Bậc Thấp (CPU 4x): Frame p95 <= 9.0 ms
- Bậc Vừa (CPU 4x): Frame p95 <= 11.0 ms
- Bậc Cao (CPU 4x): Frame p95 <= 13.0 ms
- Kết quả chi tiết máy đọc được lưu tại `docs/perf-mobile-results.json`.
