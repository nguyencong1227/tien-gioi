// Giả lập KHUNG CHẬM cho các script Chrome thật (check-inv-select, check-move-keys): luồng chính của trang bận `ms` mỗi khung hình.
// Runner GitHub chạy WebGL phần mềm (vài khung hình / giây) nên mỗi lệnh CDP chờ cả một khung; ở máy dev không tái hiện được bằng `taskset`
// (#1389: hai script xanh ở máy dev, đỏ 2 / 2 lượt chạy tay trên runner). Dùng: `node client/scripts/check-inv-select.mjs --slow-frame 250`
// hoặc đặt biến môi trường `TG_SLOW_FRAME_MS=250`.
import process from "node:process";

/** Số ms bận mỗi khung từ `--slow-frame <ms>` hoặc `TG_SLOW_FRAME_MS`; 0 = tắt. Giá trị sai / âm / quá lớn (> 2000) coi là tắt. */
export function slowFrameMs(argv = process.argv, env = process.env) {
  const i = argv.indexOf("--slow-frame");
  const raw = i >= 0 ? argv[i + 1] : env.TG_SLOW_FRAME_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 2000 ? Math.floor(n) : 0;
}

/**
 * Mã chạy ở MỖI trang mới (`Page.addScriptToEvaluateOnNewDocument`): mỗi `requestAnimationFrame` làm bận luồng chính `ms` ms.
 * Giữ bản `performance.now` GỐC từ lúc nạp: script kiểm có thể tạm dừng đồng hồ trang (`performance.now = () => t`) mà vòng bận này không treo.
 */
export function slowFrameSource(ms) {
  if (!ms) return "";
  return `(() => {
    const real = performance.now.bind(performance);
    const spin = () => {
      const t = real();
      while (real() - t < ${ms}) {
        // bận luồng chính
      }
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  })();`;
}
