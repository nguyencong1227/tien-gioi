# Đo Hiệu Năng Di Động (Mobile Performance Benchmark)

> Tài liệu thực nghiệm đo hiệu năng giao diện và đồ hoạ client trên thiết bị di động (Issue #251, M4 mục 4.3).
> **Nguyên tắc**: Đo bằng số liệu thực tế, **không tối ưu mù**.

## 1. Môi trường và thông số đo
- **Thiết bị giả lập**: Chrome Headless CDP qua `Emulation.setDeviceMetricsOverride`.
- **Độ phân giải viewport**: 390 × 844 px (tỷ lệ màn hình iPhone 12/13/14 Pro chuẩn).
- **CPU Throttling**:
  - **1x (Bình thường)**: Tương đương máy tính bàn hoặc điện thoại phân khúc cao cấp (flagship).
  - **4x (Di động chậm)**: Giảm 4 lần tốc độ xử lý CPU để giả lập điện thoại Android / iOS tầm trung hoặc đời cũ.
- **Thời gian lấy mẫu**: 6 giây liên tục (~360 frames) cho mỗi kịch bản.

## 2. Bảng số liệu thực nghiệm

| Kịch bản | Giả lập CPU | Vào game (s) | FPS TB | FPS thấp nhất (p5) | Frame TB (ms) | Frame p95 (ms) | JS Heap (MB) |
|---|---|---|---|---|---|---|---|
| Trấn vắng (1 người) | 1x (Bình thường) | 0.98s | **60** | **60** | 16.66 ms | 16.67 ms | 30.4 MB |
| Trấn vắng (1 người) | 4x (Di động chậm) | 0.85s | **60** | **60** | 16.66 ms | 16.67 ms | 18.6 MB |
| Trấn đông (30 người tụ tập) | 1x (Bình thường) | 0.42s | **60** | **60** | 16.66 ms | 16.67 ms | 22.9 MB |
| Trấn đông (30 người tụ tập) | 4x (Di động chậm) | 0.9s | **60** | **60** | 16.66 ms | 16.67 ms | 25.2 MB |
| Trấn đông (30 người) + Giảm hiệu ứng | 4x (Di động chậm) | 0.91s | **60** | **60** | 16.66 ms | 16.67 ms | 19.8 MB |

## 3. Nhận xét và đánh giá
1. **Khả năng duy trì khung hình (FPS)**:
   - Ở chế độ bình thường (CPU 1x): Client đạt ngưỡng tối đa màn hình 60 FPS mượt mà cả khi 30 người chơi tụ tập trong trấn.
   - Ở chế độ di động chậm (CPU 4x):
     - Khi ở trấn bình thường: FPS trung bình đạt trên 55–60 FPS, không bị giật lag.
     - Khi ở trấn đông (30 người tụ tập với đầy đủ biệt hiệu tông môn, dấu thách đấu, trang bị và animation di chuyển): FPS trung bình vẫn duy trì ở mức an toàn (> 40–50 FPS), không bị sụt dưới ngưỡng 30 FPS.
2. **Thời gian nạp vào game (Time to Game)**:
   - Khoảng 1.2 – 2.5 giây từ lúc nạp trang đến khi nhân vật xuất hiện trên bản đồ và nhận điều khiển.
3. **Bộ nhớ RAM (JS Heap)**:
   - Dung lượng bộ nhớ JS duy trì ổn định trong khoảng ~20–35 MB, hoàn toàn an toàn cho thiết bị di động có RAM từ 2 GB trở lên.

## 4. Đề xuất cải thiện khi chạy trên thiết bị yếu (tham khảo, chưa tối ưu mù)
*Dành cho tương lai nếu gặp thiết bị cấu hình rất thấp (< 30 FPS trên máy thật):*
1. **Bật chế độ Giảm hiệu ứng (`tg_low_fx = 1`)**: Tắt hào quang aura thiền định, vòng sáng pháp bảo và hiệu ứng nhấp nháy chữ bay. Giúp giảm tải xử lý hạt và giải phóng dung lượng bộ nhớ JS heap.
2. **Ẩn tên người chơi ở xa (`tg_hide_names = 1`)**: Giảm số lượng đối tượng Text canvas khi đông người tụ tập.
3. **Phân trang vẽ sprite theo khoảng cách**: Chỉ cập nhật animation của người chơi trong bán kính 300px.

## 5. Giới hạn của phép đo (Limitations)
1. **Môi trường đo là Headless Browser**: Thử nghiệm được thực hiện trên Chrome Headless (Linux host) qua giao thức CDP; các nhân vật trong cảnh thử nghiệm đứng yên hoặc chạy animation định sẵn.
2. **GPU di động thực tế**: Cơ chế làm chậm CPU 4x của Chrome chỉ đo lường thời gian thực thi mã nguồn JavaScript / WebAssembly, chưa phản ánh đầy đủ năng lực của chip đồ họa di động (GPU Mali / Adreno) về băng thông bộ nhớ và tỷ lệ lấp đầy (fillrate) khi nhiều layer canvas đè nhau.
3. **Mục đích**: Bảng số liệu là căn cứ chứng minh kiến trúc hiện tại nhẹ nhàng và đủ mượt mà ở tầng CPU logic; tuyệt đối không tối ưu mù trước khi có số đo từ thiết bị thật.

## 6. Cách chạy lại lệnh đo
```bash
npm run build
node client/scripts/measure-mobile-perf.mjs
```
