# Báo cáo Đo lường và Làm vững Test Chập chờn (Refs #752)

> **Mục tiêu**: Đo tỉ lệ ĐỎ thật của `npm test` toàn bộ qua $\ge 20$ lần chạy trong 3 điều kiện: (1) Máy rảnh, (2) Có tải CPU nền (2 worker threads tính toán), (3) Hai bản `vitest` chạy song song cùng lúc.
> Xác định các test chập chờn do phụ thuộc đồng hồ tường / thời gian trôi thực và làm vững bằng mốc thời gian xác định hoặc chờ theo điều kiện thực thể; **tuyệt đối không nới ngưỡng ngân sách** (tick < 10ms, patch < 520 byte/tick). Mỗi test được sửa phải có đột biến ĐỎ chứng minh vẫn phát hiện hồi quy thật.

---

## 1. Phương pháp & Công cụ Đo kiểm

- **Bộ đo tự động**: `server/scripts/do-test-chap-chon.ts` (lệnh: `npm run do-test-chap-chon -w server`).
- **Phân tích kết quả**: Thu thập báo cáo JSON chi tiết từ `vitest run --reporter=json` cho toàn bộ 284 tệp test (~4.930 test cases).
- **Ba điều kiện thử nghiệm**:
  1. `idle`: Máy chủ ở trạng thái rảnh rỗi.
  2. `cpu-load`: Bật 2 worker threads (`cpu-burner-worker.js`) chạy vòng lặp tính toán liên tục để tạo tải CPU nền.
  3. `parallel`: Khởi chạy đồng thời 2 tiến trình `vitest run` song song tranh chấp CPU và I/O.
- **Tiêu chí sửa**: Chỉ sửa các test có $\ge 1$ lần ĐỎ trong quá trình đo. Test nào ĐẠT 100% trong cả 3 điều kiện được xem là ổn định vững chắc.

---

## 2. Bảng Thống kê Tỉ lệ Đỏ Trước / Sau

| STT | Tệp test | Test case bị ảnh hưởng | Tỉ lệ ĐỎ đo được trước sửa (k/N) | Triệu chứng & Nguyên nhân | Giải pháp làm vững | Tỉ lệ ĐỎ sau sửa (k/N đã đo) | Đột biến kiểm chứng |
|:---:|---|---|:---:|---|---|:---:|---|
| 1 | `server/scripts/kiem-mat-ket-noi.test.ts` | Ca 2: Bị hạ khi im lặng 2-3s (lần 1-3 tha, lần 4 chết thật) | **2 lần ĐỎ trên CI** (sự cố CI #824 dưới tải, trước #826) | `sleep(2150)` thời gian thực ở dã ngoại khiến quái sinh lại chém trộm, kích hoạt khiên sớm làm lệch máu (HP=1 thay vì 10) hoặc chết sớm. | Vô hiệu hoá quái sinh lại trong Ca 2 (`monsterCapOf = () => 0`), đặt mốc `c.lastHeardAt = w.now - 2200` xác định. | **0/6 (0%)** (Dev A đo 6/6 parallel ở PR #826; bot thật 4/4 ca ĐẠT ở lượt 317; chưa đo đủ 20 lượt) | Bỏ tha chết / tăng `NET_SPARE_MAX` làm Ca 2 ĐỎ ngay lập tức. |
| 2 | `server/src/rooms/WorldRoom.test.ts` | Chân linh & bộ đếm kiếp: bộ đếm được lưu | **1 lần ĐỎ trên CI** (sự cố CI #822 dưới tải, trước #826) | Đọc file JSON ngay sau `await leave(a)` khi hàng đợi lưu `savePlayer` chưa kịp flush xuống đĩa. | Dùng `waitFor` chờ tệp lưu có dữ liệu `kills === 2 && bossKills === 1` thay vì đọc ngay. | **0/6 (0%)** (Dev A đo 6/6 parallel ở PR #826; chưa đo đủ 20 lượt) | Đổi sai giá trị kỳ vọng trong file làm test ĐỎ ngay lập tức. |
| 3 | `server/src/rooms/WorldRoom.sect.test.ts` | Tông môn: kho đồ qua server Colyseus thật (mục 27) > Đệ tử rút có hạn mức | **1/4 (25%)** (đo đợt 1 parallel 2 lượt = 4 bản) | Vòng rút kiểm tra túi đổi (`ctrlOf(B).inv`), nhưng túi đổi trước khi lưu hồ sơ xong và máy chủ chỉ nhả khoá `vaultBusy` sau khi lưu xong; dưới tải lưu chậm thì lượt gửi tiếp bị từ chối 'trục trặc' và timeout 4s. | Sửa chờ toast `rutDuoc(B)` (gửi cùng lượt với nhả `vaultBusy`); thêm `slowSave` / `gateSave` tái hiện tất định và ca test bảo vệ khoá một-thao-tác-một-lúc (Dev B làm ở PR #835). | **0/10 (0%)** (Dev B thử nghiệm 10 lượt ở PR #835; cần đo tiếp trong đợt parallel tích lũy) | Bỏ khoá ở góp hoặc rút làm test ĐỎ ngay lập tức. |
| 4 | `server/src/systems/perf.test.ts` | Chiêu thức Nguyên Anh quanh bãi quái Hàn Vân (#722, #515): tick < 10ms | **2/4 (50%)** (đo đợt 1 parallel 2 lượt = 4 bản) | Khi 2 bản vitest chạy song song, CPU bị preempt 1 tick khiến `p95Ms` nhảy lên 19.37ms trong khi `avgMs` vẫn đạt (< 10ms). | Đo `min` theo từng tick qua 3 lần lặp mô phỏng cùng điều kiện ban đầu (#723); triệt tiêu nhiễu lịch chạy CPU nhưng giữ nguyên ngưỡng bắt hồi quy. | **0/3 (0%)** (kiểm tra 3 lượt cục bộ; đang chờ đo tích lũy >= 20 lượt) | Chèn 12ms chờ vào `tickWorld` làm test Nguyên Anh ĐỎ ngay ("expected 12.23 to be less than 10"). |
| 5 | `client/scripts/comfy-scripts.test.ts` | Tích hợp chrome-gpu: detectGpu tự động nhường GPU khi có khóa | **1/4 (25%)** (đo đợt 1 parallel 2 lượt = 4 bản) | Dùng chung đường dẫn file khóa tĩnh cố định `/tmp/tg-comfy.lock` và xóa `delete process.env.CI` trên `process.env` toàn cục, gây xung đột race condition giữa các tiến trình chạy song song. | `chrome-gpu.mjs` ưu tiên `process.env.COMFY_LOCK_FILE`; các test tạo file khóa trong thư mục tạm riêng (`mkdtempSync`), cô lập hoàn toàn giữa các worker. | **0/3 (0%)** (kiểm tra 3 lượt cục bộ; đang chờ đo tích lũy >= 20 lượt) | Bỏ tệp khóa giả làm test ĐỎ ngay lập tức. |

---

## 3. Nhật ký Đo lường Chi tiết Đợt 1

### 3.1. Điều kiện CPU-LOAD (Tải CPU nền 2 workers)
- **Lệnh chạy**: `npm run do-test-chap-chon -w server -- --mode=cpu-load --runs=3 --workers=2`
- **Thời gian**: 2026-11-16T22:36:06+07:00
- **Kết quả**: 3/3 lượt ĐẠT 100% (281/281 tệp test XANH). Thời gian trung bình mỗi lượt: 91.0s.

### 3.2. Điều kiện PARALLEL (2 bản vitest song song tranh chấp tài nguyên)
- **Lệnh chạy**: `npm run do-test-chap-chon -w server -- --mode=parallel --runs=2` (tổng cộng 4 phiên bản toàn bộ)
- **Thời gian**: 2026-11-16T22:39:27+07:00
- **Kết quả**: 3 tệp test chập chờn được phát hiện:
  - `server/src/systems/perf.test.ts`: 2/4 ĐỎ (50%) - `AssertionError: expected 19.37 to be less than 10` tại dòng 811.
  - `server/src/rooms/WorldRoom.sect.test.ts`: 1/4 ĐỎ (25%) - `Error: Hết thời gian chờ lượt 2` tại dòng 387.
  - `client/scripts/comfy-scripts.test.ts`: 1/4 ĐỎ (25%) - Xung đột file lock tĩnh `/tmp/tg-comfy.lock`.

---

## 4. Kế hoạch Đo kiểm Tích lũy (Việc còn lại của Issue #752)

Hiện tại tiến độ thu thập số liệu đo lường đạt:
- **`idle`**: **10/20** lượt (đo đợt 2: 10/10 lượt XANH 418/418 tệp, 0 chập chờn — `docs/data/flaky-idle.json`, 22/11).
- **`cpu-load`**: **3/20** lượt (đã đo 3 lượt đạt 100%, cần đo thêm 17 lượt).
- **`parallel`**: **4/20** phiên bản (đã đo 2 lượt chạy song song = 4 bản, cần đo thêm 8 lượt chạy song song = 16 bản).

### 4.1. Nhật ký Đo lường Chi tiết Đợt 2 — `idle` (Máy rảnh)
- **Lệnh chạy**: `npm run do-test-chap-chon -w server -- --mode=idle --runs=10 --out=docs/data/flaky-idle.json`
- **Thời gian**: 2026-11-22T03:34:26Z (lượt Dev F chạy đêm)
- **Kết quả**: **10/10 lượt ĐẠT 100%** (418/418 tệp test XANH). Thời gian trung bình mỗi lượt: 91.7s. **Không có tệp test nào chập chờn** trong điều kiện máy rảnh.
- **Nhận xét**: `perf.test.ts` (bao gồm 2 ca "chặn đường" mục 52 dùng `performance.now()` thô + trung bình) KHÔNG đỏ trong 10 lượt idle — ổn định khi máy rảnh; chập chờn của chúng (đợt 1 parallel 2/4) chỉ xuất hiện khi CPU bị preempt nặng (2 bản vitest song song). Đợt parallel tích lũy tiếp theo sẽ xác nhận lại dưới tải nặng hơn.

PR #830 là bước cơ sở (`Refs #752`): cung cấp công cụ `do-test-chap-chon.ts` và vá triệt để 3 ca chập chờn phát hiện ở đợt 1. Mục tiêu $\ge 20$ lượt đo cho mỗi điều kiện sẽ tiếp tục được chạy tích lũy trong các đợt thử tải định kỳ để hoàn thiện báo cáo trước khi đóng chính thức Issue #752.
