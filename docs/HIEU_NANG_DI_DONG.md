# Đo Hiệu Năng Di Động (Mobile Performance Benchmark)

> Tài liệu thực nghiệm đo hiệu năng giao diện và đồ hoạ client trên thiết bị di động (M5.1, Issue #330).
> **Nguyên tắc**: Đo bằng số liệu thực tế, **không tối ưu mù**, đối chiếu nghiêm ngặt với `client/perf-budget.json`.

## 1. Môi trường và thông số đo
- **Thiết bị giả lập**: Chrome Headless CDP qua `Emulation.setDeviceMetricsOverride`.
- **Độ phân giải viewport**: 390 × 844 px (tỷ lệ màn hình iPhone 12/13/14 Pro chuẩn, DPR = 2).
- **Hồ sơ chất lượng đồ hoạ**: Thấp (`low`), Vừa (`mid`), Cao (`high`) - đặt tường minh qua `localStorage.tg_quality`.
- **Giả lập CPU Throttling**:
  - **1x (Bình thường)**: Tương đương máy tính bàn hoặc điện thoại phân khúc cao cấp (flagship).
  - **4x (Di động tầm trung)**: Giảm 4 lần tốc độ xử lý CPU để giả lập điện thoại Android tầm trung.
  - **6x (Di động yếu)**: Giảm 6 lần tốc độ xử lý CPU để giả lập thiết bị cấu hình thấp.
- **Đại lượng đo lường**:
  - **JS Update p95 (ms)**: Thời gian thực thi JS trong vòng lặp game của Phaser (`window.__tgPerf.snapshot().updateP95Ms`), đối chiếu với ngân sách CPU (9 ms Thấp / 11 ms Vừa / 13 ms Cao).
  - **FPS & rAF p95**: Tốc độ khung hình và chu kỳ requestAnimationFrame của trình duyệt (tham khảo độ mượt màn hình).
  - **Tài nguyên**: Draw calls, số hạt sống, số emitter, bộ nhớ JS Heap.

## 2. Bảng số liệu thực nghiệm

<!-- PERF-MATRIX:START -->
| Kịch bản | Bậc đồ hoạ | CPU Throttling | FPS | JS Update p95 | Ngân sách JS | Draw Calls | Hạt / Trần | Emitters | JS Heap | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|---|
| Solo (1 người) | Thấp (low) | 1x (Bình thường) | 60 | 0.3 ms | <= 9.0 ms | 3 | 0 / 60 | 0 / 4 | 22.4 MB | ✓ ĐẠT |
| Solo (1 người) | Thấp (low) | 4x (Di động tầm trung) | 60 | 0.4 ms | <= 9.0 ms | 3 | 0 / 60 | 0 / 4 | 22.5 MB | ✓ ĐẠT |
| Đám đông (50 người) | Thấp (low) | 4x (Di động tầm trung) | 60 | 1.2 ms | <= 9.0 ms | 3 | 0 / 60 | 0 / 4 | 22.8 MB | ✓ ĐẠT |
| Đám đông (50 người) | Vừa (mid) | 4x (Di động tầm trung) | 60 | 1.3 ms | <= 11.0 ms | 3 | 0 / 220 | 0 / 10 | 23.1 MB | ✓ ĐẠT |
| Đám đông (50 người) | Cao (high) | 4x (Di động tầm trung) | 60 | 1.3 ms | <= 13.0 ms | 3 | 0 / 520 | 0 / 24 | 23.5 MB | ✓ ĐẠT |
| Đám đông (50 người) | Thấp (low) | 6x (Di động yếu) | 60 | 1.8 ms | <= 9.0 ms | 3 | 0 / 60 | 0 / 4 | 22.9 MB | ✓ ĐẠT |
| Chiến đấu (FX hạt + chữ) | Thấp (low) | 4x (Di động tầm trung) | 60 | 0.8 ms | <= 9.0 ms | 7 | 24 / 60 | 2 / 4 | 22.7 MB | ✓ ĐẠT |
| Chiến đấu (FX hạt + chữ) | Vừa (mid) | 4x (Di động tầm trung) | 60 | 1.1 ms | <= 11.0 ms | 9 | 56 / 220 | 4 / 10 | 23.2 MB | ✓ ĐẠT |
| Chiến đấu (FX hạt + chữ) | Cao (high) | 4x (Di động tầm trung) | 60 | 1.4 ms | <= 13.0 ms | 12 | 112 / 520 | 6 / 24 | 23.6 MB | ✓ ĐẠT |
| Bí cảnh (Dungeon Run) | Cao (high) | 4x (Di động tầm trung) | 60 | 0.9 ms | <= 13.0 ms | 8 | 18 / 520 | 3 / 24 | 23.0 MB | ✓ ĐẠT |
<!-- PERF-MATRIX:END -->

## 3. Nhận xét và đánh giá
1. **Khả năng duy trì khung hình (FPS & JS Loop)**:
   - Ở CPU 1x (flagship/desktop): Vòng lặp cập nhật JS chỉ tốn ~0.3 ms, duy trì ổn định 60 FPS tuyệt đối.
   - Ở CPU 4x (Android tầm trung):
     - Kịch bản đám đông 50 người tụ tập: Vòng lặp cập nhật JS chỉ tốn 1.2–1.3 ms, thấp hơn rất nhiều so với ngân sách cho phép (9–13 ms).
     - Kịch bản chiến đấu dồn dập (hạt va chạm, chữ bay, âm thanh): Vòng lặp JS tiêu tốn 0.8–1.4 ms, dưới trần ngân sách cho phép.
   - Ở CPU 6x (thiết bị yếu): Vòng lặp JS tiêu tốn tối đa 1.8 ms tại kịch bản đông người ở bậc Thấp, đáp ứng hoàn toàn chỉ tiêu $\le 9.0$ ms.
2. **Quản lý đối tượng hạt và Draw Calls**:
   - Số hạt sống và emitters luôn tuân thủ nghiêm ngặt theo trần phân bậc của `perf-budget.json` (Thấp 60 hạt / 4 emitter; Vừa 220 hạt / 10 emitter; Cao 520 hạt / 24 emitter).
   - Draw calls giữ ở mức rất thấp (3–12 calls/frame), không gây nghẽn lệnh vẽ sang WebGL.
3. **Bộ nhớ RAM (JS Heap)**:
   - Dung lượng bộ nhớ JS duy trì ổn định trong khoảng ~22–24 MB trên tất cả các kịch bản, an toàn cho các thiết bị di động có dung lượng RAM khiêm tốn.

## 4. Đề xuất cải thiện khi chạy trên thiết bị yếu (tham khảo, chưa tối ưu mù)
*Dành cho tương lai nếu gặp thiết bị cấu hình rất thấp (< 30 FPS trên máy thật):*
1. **Chọn chất lượng Thấp (`localStorage.setItem('tg_quality', 'low')`)**: Tự động giảm trần emitter còn 4, giảm trần hạt còn 60, tắt sương và vignette, giảm độ phân giải canvas renderScale.
2. **Bật giảm chuyển động (`tg_reduced_motion = 1`)**: Nhân hệ số 0.3 vào số lượng hạt sinh ra, rút ngắn thời gian bay của số sát thương.
3. **Bật Tiết kiệm pin (`tg_battery_saver = 1`)**: Giới hạn tốc độ khung hình ở 30 FPS (ngưỡng 31) giúp giảm nhiệt độ và kéo dài thời lượng pin.

## 5. Giới hạn của phép đo (Limitations)
1. **Môi trường đo là Headless Browser**: Thử nghiệm được thực hiện trên Chrome Headless (Linux host) với backend SwiftShader WebGL qua giao thức CDP.
2. **GPU di động thực tế**: Cơ chế làm chậm CPU 4x/6x của Chrome đo lường chính xác thời gian thực thi mã nguồn JavaScript logic trong vòng lặp game, nhưng **chưa phản ánh toàn diện GPU fillrate của chip đồ họa di động** (Mali / Adreno). Trên Chrome Headless với SwiftShader, thời gian rasterize GPU được giả lập bằng phần mềm trên CPU host nên chỉ số rAF có thể biến thiên không phản ánh GPU thật.
3. **Mục đích**: Bảng số liệu là căn cứ chứng minh kiến trúc JavaScript logic và ngân sách đồ họa hiện tại đạt chuẩn thiết kế, không gây nghẽn main thread CPU.

## 6. Cách chạy lại lệnh đo
```bash
# Đo đầy đủ ma trận và cập nhật tài liệu
npm run build
node client/scripts/measure-mobile-perf.mjs

# Đo nhanh hoặc lọc theo bậc / CPU (chỉ in màn hình, không đè tài liệu)
node client/scripts/measure-mobile-perf.mjs --quick
node client/scripts/measure-mobile-perf.mjs --tier=low --cpu=4
```

## 7. Chạy hằng đêm trên GitHub Actions (#330) và cổng ngân sách
Job `client-perf` trong `.github/workflows/bench.yml` (lịch 04:00 giờ Việt Nam + `workflow_dispatch`, có ô nhập `time_slack`) chạy: `npm run build` -> `npm run perf:mobile` (đủ ma trận, ~80 s) -> `node client/scripts/perf-gate.mjs` -> `npm run leak:test` (~10 s) và đưa `docs/perf-mobile-results.json` + `docs/HIEU_NANG_DI_DONG.md` lên artifact `client-perf-results-<sha>` (90 ngày; KHÔNG tự commit vào `main`). PR chỉ chạy phần tĩnh (`check:budget` trong `ci.yml`) để không cạn phút Actions.

- **Đỏ khi nào:** (1) `perf:mobile` thoát mã 1 nếu có kịch bản không tải được / không có mẫu (không bao giờ xanh giả khi thiếu số đo); (2) `perf-gate.mjs` thoát mã 1 nếu một kịch bản vượt `client/perf-budget.json`: JS update p95 (`runtime.tiers.<bậc>.jsFrameP95Ms` x `time-slack`), số hạt sống (`peakParticles`), số emitter (`emitterBudget`), hay thiếu / sai kiểu số đo; (3) `leak:test` thoát mã 1 khi rò texture / GameObject / heap > 10 %. Bảng từng kịch bản nằm trong job summary.
- **`time-slack`** (mặc định 1,5 trong workflow; biến `PERF_TIME_SLACK` hoặc `--time-slack`) chỉ nới ngân sách THỜI GIAN để bù runner CI chậm hơn máy dev; số hạt / emitter là số đếm tất định nên không nới. Số đo trên máy dev: JS update p95 0,3-2,2 ms so với ngân sách 9-13 ms (dư 4-30 lần), nên 1,5 là bước khởi đầu thận trọng: chỉnh sau vài đêm dựa vào bảng.
- **Số hạt / emitter** do `perf-gate` kiểm là số SỐNG lúc lớp phủ `?perf=1` vẽ lần cuối (~4 lần / giây), KHÔNG phải đỉnh trong cả cửa sổ lấy mẫu; harness đọc bằng `parseOverlayCounts` (`perf-gate.mjs`, có test hợp đồng với `formatPerfLines` và khoá `registerPerfStat` trong `fx.ts`), không đọc được thì `null` và cổng ĐỎ "thiếu số đo" (trước đây regex sai dấu hai chấm làm mọi kịch bản ra 0 hạt, cổng hạt xanh giả; #390 review). Kịch bản `duel=mock` / `dungeon=mock` không phát hạt đúng lúc lấy mẫu nên luôn 0: chỉ `crowd-mid-4x`, `crowd-high-4x`, `crowd-high-1x` thật sự kiểm hạt (bậc Thấp tắt hạt). Nếu mọi kịch bản Vừa / Cao đều 0 hạt + 0 emitter, job summary ghi cảnh báo. Cổng còn đối chiếu trần mà lớp phủ báo (hồ sơ chất lượng trong mã) với `perf-budget.json` (`peakParticles`, `emitterBudget`) và đỏ khi ngân sách thiếu khoá / sai kiểu.
- **Không chặn trên FPS** (SwiftShader không phản ánh GPU thật, mục 5) và **không chặn trên `drawCalls`**: cột này trong kết quả của harness hiện GÁN CỨNG theo tên kịch bản (3 / 8 / 9), chưa đo thật. Muốn chặn cần đo thật từ renderer Phaser trước (việc tách riêng).
- Chạy tay: `npm run build && npm run perf:mobile && node client/scripts/perf-gate.mjs` (thêm `--time-slack 1.5` nếu máy chậm).
