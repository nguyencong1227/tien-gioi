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
| Kịch bản | Bậc đồ hoạ | CPU Throttling | FPS | JS Update p95 | Ngân sách JS | Draw call TB / p95 / Trần | Hạt / Trần | Emitters | Chữ bay đỉnh / Trần | JS Heap | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Một mình (Trấn vắng) | LOW | 1x | 60 | 0.3 ms | <= 9 ms | 2 / 2 / 60 | 0 / 60 | 0 / 4 | - | 29.5 MB | ✓ ĐẠT |
| Một mình (Trấn vắng) | LOW | 4x | 60 | 1 ms | <= 9 ms | 2 / 2 / 60 | 0 / 60 | 0 / 4 | - | 28.9 MB | ✓ ĐẠT |
| Trấn đông (50 bot) | LOW | 4x | 60 | 1.1 ms | <= 9 ms | 2 / 2 / 60 | 0 / 60 | 0 / 4 | - | 31.8 MB | ✓ ĐẠT |
| Trấn đông (50 bot) | MID | 4x | 48.9 | 1.5 ms | <= 11 ms | 4 / 4 / 100 | 18 / 220 | 6 / 10 | - | 30.5 MB | ✓ ĐẠT |
| Trấn đông (50 bot) | HIGH | 4x | 40 | 1.7 ms | <= 13 ms | 4 / 4 / 160 | 30 / 520 | 10 / 24 | - | 30.7 MB | ✓ ĐẠT |
| Trấn đông (50 bot) | HIGH | 1x | 44.5 | 0.4 ms | <= 13 ms | 4 / 4 / 160 | 33 / 520 | 11 / 24 | - | 29.1 MB | ✓ ĐẠT |
| Trấn đông (50 bot) - Máy rất yếu | LOW | 6x | 60 | 1.7 ms | <= 9 ms | 2 / 2 / 60 | 0 / 60 | 0 / 4 | - | 32.8 MB | ✓ ĐẠT |
| Chiến đấu có hiệu ứng hạt | LOW | 4x | 60 | 1.1 ms | <= 9 ms | 4 / 4 / 60 | 68 đỉnh / 60 | 8 đỉnh / 4 | 8 đỉnh / 8 | 29.2 MB | ✓ ĐẠT |
| Chiến đấu có hiệu ứng hạt | HIGH | 4x | 39.5 | 1.5 ms | <= 13 ms | 4 / 4 / 160 | 76 đỉnh / 520 | 10 đỉnh / 24 | 9 đỉnh / 28 | 31.9 MB | ✓ ĐẠT |
| Nhiều chiêu liên tục | LOW | 4x | 60 | 1 ms | <= 9 ms | 4 / 4 / 60 | 68 đỉnh / 60 | 8 đỉnh / 4 | 8 đỉnh / 8 | 30.8 MB | ✓ ĐẠT |
| Nhiều chiêu liên tục | HIGH | 4x | 38.7 | 1.4 ms | <= 13 ms | 4 / 4 / 160 | 108 đỉnh / 520 | 13 đỉnh / 24 | 16 đỉnh / 28 | 28.7 MB | ✓ ĐẠT |
| Âm Sương Trạch (sương + thời tiết + nước) | LOW | 4x | 60 | 0.7 ms | <= 9 ms | 3 / 3 / 60 | 0 / 60 | 0 / 4 | - | 33.8 MB | ✓ ĐẠT |
| Âm Sương Trạch (sương + thời tiết + nước) | MID | 4x | 49.4 | 1.1 ms | <= 11 ms | 5 / 5 / 100 | 18 / 220 | 6 / 10 | - | 40.7 MB | ✓ ĐẠT |
| Âm Sương Trạch (sương + thời tiết + nước) | HIGH | 4x | 40.1 | 1.4 ms | <= 13 ms | 5 / 5 / 160 | 63 / 520 | 12 / 24 | - | 31.9 MB | ✓ ĐẠT |
| Hắc Phong Cốc (sương + thời tiết + nước) | HIGH | 4x | 40.4 | 1.3 ms | <= 13 ms | 5 / 5 / 160 | 66 / 520 | 13 / 24 | - | 33.8 MB | ✓ ĐẠT |
| Lạc Hà Trấn (sương + thời tiết + nước) | HIGH | 4x | 40.3 | 1.6 ms | <= 13 ms | 6 / 6 / 160 | 48 / 520 | 10 / 24 | - | 28.2 MB | ✓ ĐẠT |
| Bí cảnh | MID | 4x | 52.6 | 1.1 ms | <= 11 ms | 4 / 4 / 100 | 76 đỉnh / 220 | 10 đỉnh / 10 | 9 đỉnh / 16 | 30.4 MB | ✓ ĐẠT |
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
   - Draw calls giữ ở mức rất thấp, ĐO THẬT (#397, bộ đếm tiêm vào WebGL, mục 7): 2 (bậc Thấp, kịch bản mock) – 4 (Trấn đông 50 bot ở bậc Vừa / Cao) lệnh vẽ / khung có vẽ, so với trần 60 / 100 / 160; không gây nghẽn lệnh vẽ sang WebGL. (Các con số 3 / 8 / 9 trong bản trước là GÁN CỨNG theo tên kịch bản, không phải số đo.)
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
# Đo vài kịch bản theo id (cũng không đè tài liệu)
node client/scripts/measure-mobile-perf.mjs --only am-suong-low-4x,am-suong-mid-4x,am-suong-high-4x
```

## 7. Chạy hằng đêm trên GitHub Actions (#330) và cổng ngân sách
Job `client-perf` trong `.github/workflows/bench.yml` (lịch 04:00 giờ Việt Nam + `workflow_dispatch`, có ô nhập `time_slack`) chạy: `npm run build` -> `npm run perf:mobile` (đủ ma trận, ~80 s) -> `node client/scripts/perf-gate.mjs` -> `npm run leak:test` (~10 s) và đưa `docs/perf-mobile-results.json` + `docs/HIEU_NANG_DI_DONG.md` lên artifact `client-perf-results-<sha>` (90 ngày; KHÔNG tự commit vào `main`). PR chỉ chạy phần tĩnh (`check:budget` trong `ci.yml`) để không cạn phút Actions.

- **Đỏ khi nào:** (1) `perf:mobile` thoát mã 1 nếu có kịch bản không tải được / không có mẫu (không bao giờ xanh giả khi thiếu số đo); (2) `perf-gate.mjs` thoát mã 1 nếu một kịch bản vượt `client/perf-budget.json`: JS update p95 (`runtime.tiers.<bậc>.jsFrameP95Ms` x `time-slack`), số hạt sống (`peakParticles`), số emitter (`emitterBudget`), draw call p95 mỗi khung (`drawCalls`), hay thiếu / sai kiểu số đo (kể cả ngân sách thiếu khoá); (3) `leak:test` thoát mã 1 khi rò texture / GameObject / heap > 10 %. Bảng từng kịch bản nằm trong job summary.
- **`time-slack`** (mặc định 1,5 trong workflow; biến `PERF_TIME_SLACK` hoặc `--time-slack`) chỉ nới ngân sách THỜI GIAN để bù runner CI chậm hơn máy dev; số hạt / emitter / draw call là số đếm tất định nên không nới. Số đo trên máy dev: JS update p95 0,3-2,2 ms so với ngân sách 9-13 ms (dư 4-30 lần), nên 1,5 là bước khởi đầu thận trọng: chỉnh sau vài đêm dựa vào bảng.
- **Số hạt / emitter** do `perf-gate` kiểm là số SỐNG lúc lớp phủ `?perf=1` vẽ lần cuối (~4 lần / giây), KHÔNG phải đỉnh trong cả cửa sổ lấy mẫu; harness đọc bằng `parseOverlayCounts` (`perf-gate.mjs`, có test hợp đồng với `formatPerfLines` và khoá `registerPerfStat` trong `fx.ts`), không đọc được thì `null` và cổng ĐỎ "thiếu số đo" (trước đây regex sai dấu hai chấm làm mọi kịch bản ra 0 hạt, cổng hạt xanh giả; #390 review). Các kịch bản `crowd-*` (không bắn hiệu ứng) kiểm số SỐNG này; kịch bản chiến đấu thì BẮN HIỆU ỨNG THẬT và kiểm ĐỈNH (mục dưới). Nếu mọi kịch bản Vừa / Cao đều 0 hạt + 0 emitter (cả sống lẫn đỉnh), job summary ghi cảnh báo. Cổng còn đối chiếu trần mà lớp phủ báo (hồ sơ chất lượng trong mã) với `perf-budget.json` (`peakParticles`, `emitterBudget`) và đỏ khi ngân sách thiếu khoá / sai kiểu.
- **Hiệu ứng bắn THẬT trong chiến đấu (#400):** chế độ mock (`duel=mock` / `dungeon=mock`) không tự phát hạt / chữ bay đúng lúc lấy mẫu nên trước đây `combat-*` / `dungeon-*` đo 0 hạt, 0 emitter, 2 draw call và cổng không kiểm gì cho chiến đấu. Nay các kịch bản có `fx` (`combat-low-4x`, `combat-high-4x`, `burst-low-4x`, `burst-high-4x` MỚI "Nhiều chiêu liên tục", `dungeon-mid-4x`) tiêm `client/scripts/fx-driver.mjs` (`FX_DRIVER_SOURCE`) ngay sau `__tgPerf.reset()` và dừng lúc lấy snapshot: dùng ĐÚNG API sẵn có `window.__fx.play` / `floatNumber` / `stats` (có khi mở trang với `?debug`, harness luôn bật), KHÔNG sửa mã game, với công thức THẬT (`hit-spark` / `hit-crit` / `hit-heavy` của mình ưu tiên 2 và của người khác ưu tiên 1, `hurt-self`, kiếm khí `sword-qi` x 3 + `sword-tip`, `slash-edge`, `mon-vanish`) kèm chữ bay theo nhịp người chơi (`combat`: đòn mỗi 200 ms, công pháp lớn mỗi 1,5 s; `burst`: mỗi 100 ms / 0,6 s), vị trí quanh tâm khung nhìn, số giả ngẫu nhiên hạt giống cố định (tất định). **Đo ĐỈNH:** hạt / emitter / chữ bay sống chỉ tăng lúc xin ngân sách nên đọc `fx.stats()` NGAY SAU mỗi lần phát cho đúng đỉnh trong cả cửa sổ (lớp phủ chỉ cho số sống lúc vẽ cuối). **Cổng:** đỉnh hạt / emitter <= trần x `OWN_OVERSHOOT` (= 2, `budget.ts`; ưu tiên 2 = của chính mình được vượt trần danh nghĩa tới gấp đôi, docs 7.1: đỉnh vượt trần danh nghĩa nhưng trong trần CỨNG là THIẾT KẾ, vượt trần cứng nghĩa là kiểm soát ngân sách hỏng) và đỉnh chữ bay <= `damageNumbers`; phát được < 10 hiệu ứng, hoặc đỉnh = 0 dù đã phát, hoặc thiếu số đo thì ĐỎ. Số đo thật: bậc Thấp chạm trần cứng emitter (8 / 8, hạt 68-72 / 120, ngân sách bỏ 8-51 hiệu ứng, chữ bay 8 / 8), bậc Vừa / Cao dư nhiều (hạt 76-108, emitter 10-13, chữ bay 9-16); draw call 4 (trước 2: hiệu ứng thêm 2 lệnh vẽ), JS p95 không đổi (~1 ms). Test hợp đồng `fx-driver.test.ts` chạy CHÍNH đoạn tiêm trong `node:vm` với `__fx` giả dùng sổ công thức THẬT (id bịa bị từ chối) và đối chiếu màu với `FX_COLOR`.
- **Draw call (#397, ĐO THẬT):** `client/scripts/draw-counter.mjs` (`DRAW_COUNTER_SOURCE`) được tiêm bằng `Page.addScriptToEvaluateOnNewDocument` (chạy TRƯỚC mã của trang, KHÔNG sửa mã game): bọc `drawElements` / `drawArrays` / `drawElementsInstanced` / `drawArraysInstanced` trên `WebGLRenderingContext.prototype` và `WebGL2RenderingContext.prototype`, gom theo khung bằng `requestAnimationFrame` (đăng ký trước Phaser nên mỗi ô = lệnh vẽ của đúng một lần render). Cửa sổ lấy mẫu = cửa sổ của `__tgPerf` (`reset()` cùng lúc). Kết quả `drawCallsAvg` / `drawCallsP95` / `drawCallFrames` (chỉ tính khung CÓ vẽ; khung Phaser không vẽ, vd tiết kiệm pin, bị bỏ). `perf-gate` chặn `drawCallsP95 <= runtime.tiers.<bậc>.drawCalls` (60 / 100 / 160) và đòi `drawCallFrames >= 10`; không đếm được (null) thì ĐỎ "thiếu số đo". Đối chiếu độc lập tại instance `gl` theo sự kiện `postrender` của Phaser (cách của `check-lod.mjs`) ra CÙNG số (4 / 4 / 2 / 2). Phaser 3.90 trên WebGL1 vẽ bằng `drawArrays`. Test hợp đồng `draw-counter.test.ts` chạy CHÍNH đoạn tiêm trong `node:vm` với WebGL giả (bọc thiếu `drawArrays` -> 0 khung -> null -> cổng đỏ). Lưu ý: các kịch bản mock chỉ có 2-4 lệnh vẽ (Phaser gộp lô rất mạnh, chưa có chữ bay / hạt phát đúng lúc lấy mẫu), nên trần 60 / 100 / 160 còn dư rất nhiều: cổng chỉ bắt hồi quy lớn (vd mỗi thực thể một texture riêng làm vỡ gộp lô), chưa phản ánh tải chiến đấu thật.
- **Bản đồ ngoài với sương + thời tiết + nước BẬT (#408 bước 4):** mọi kịch bản trên chạy `?debug=1`, nên sương / thời tiết / nước mặc định TẮT (`ambientEnabledByUrl`) và camera đứng ở góc trên-trái bản đồ Lạc Hà (chế độ mock không chạy `reconcile`, `predX` / `predY` = 0): chưa kịch bản nào đo chi phí của ba hiệu ứng môi trường, cũng không nhìn thấy trấn. Nay có `?map=<id>` cho chế độ mock (`client/src/mock-map.ts`, chỉ DEV / `?debug`): mock khởi đầu ở bản đồ đó, người chơi đứng giữa trấn, phòng mock đồng bộ vị trí cho cảnh (không có `?map=` thì hành vi cũ giữ nguyên). Kịch bản `am-suong-{low,mid,high}-4x` (Âm Sương Trạch) + `hac-phong-high-4x` + `lac-ha-high-4x` (mốc so sánh) dùng `?map=<id>&crowd=20&debug=1&perf=1&weather=1&fog=1&water=1`. **Số đo** (CPU 4x, 20 đạo hữu quanh người chơi, JS p95 / draw call p95 / hạt sống / emitter sống): Âm Sương Thấp 0,7 ms / 3 / 0 / 0, Vừa 1,1 ms / 5 / 18 / 6, Cao 1,4 ms / 5 / 63 / 12; mốc ở bậc Cao: Hắc Phong 1,3 ms / 5 / 66 / 13, Lạc Hà 1,6 ms / 6 / 48 / 10 (ngân sách bậc Cao 13 ms / 160 / 520 / 24): Âm Sương không nặng hơn hai bản đồ kia ở cùng bậc. FPS (SwiftShader, không chặn) 60 / 49,4 / 40,1 so với kịch bản `crowd-*` không có môi trường 60 / 48,9 / 40,0: chi phí vẽ do SwiftShader, không do sương / nước. `perf-gate` chặn như mọi kịch bản; test `perf-gate.test.ts` đỏ nếu thêm bản đồ ngoài vào `shared/` mà harness không có kịch bản đo.
- **`leak:test` đi qua ba bản đồ ngoài (#408 bước 4):** mỗi chu kỳ dựng lại hình ảnh của bản đồ kế tiếp trong `LEAK_MAP_IDS` (Lạc Hà, Hắc Phong, Âm Sương; lớp ô, trang trí, nước, sương, thời tiết, ánh sáng) với sương + thời tiết + nước bật (trước đây chỉ Lạc Hà, môi trường tắt); hai lần đọc chỉ số (đầu / cuối) đều đọc khi đang ở bản đồ gốc. Số đo: Textures 93 -> 93, GameObjects 39 -> 39, heap +1,8 % (ngân sách 10 %). Đột biến "mỗi lần dựng Âm Sương sót một đối tượng" -> `Rò rỉ GameObjects cơ sở: tăng từ 33 lên 39 (+6)`, thoát mã 1 (kiểm Lạc Hà một mình không thấy).
- **Ảnh 5 khung nhìn** (`npm run capture:viewports -- --maps` hoặc `node client/scripts/capture-viewports.mjs --maps`): Hắc Phong Cốc (mốc) và Âm Sương Trạch ở 1280x720, 768x1024, 844x390, 390x844, 360x640 vào `docs/screenshots/m6-ban-do/` (10 ảnh WebP, 1,2 MB; bộ ảnh mốc M5 không bị đụng tới).
- **Không chặn trên FPS** (SwiftShader không phản ánh GPU thật, mục 5).
- Chạy tay: `npm run build && npm run perf:mobile && node client/scripts/perf-gate.mjs` (thêm `--time-slack 1.5` nếu máy chậm).
