/**
 * Đếm THẬT số draw call mỗi khung trong harness hiệu năng (M5.1, #397; trước đó cột `drawCalls` của `perf:mobile` là số GÁN CỨNG 3 / 8 / 9).
 *
 * KHÔNG sửa mã game: harness tiêm `DRAW_COUNTER_SOURCE` bằng `Page.addScriptToEvaluateOnNewDocument` (chạy TRƯỚC mọi mã của trang),
 * đoạn này bọc các hàm vẽ trên `WebGLRenderingContext.prototype` và `WebGL2RenderingContext.prototype`
 * (`drawElements`, `drawArrays`, `drawElementsInstanced`, `drawArraysInstanced`) để đếm, và gom theo khung bằng `requestAnimationFrame`.
 * (Đo thật: Phaser 3.90 trên WebGL1 vẽ bằng `drawArrays`; đối chiếu với đếm độc lập tại instance `gl` theo sự kiện `postrender` của
 * Phaser cho ra CÙNG số: 4 / 4 / 2 / 2 ở bốn kịch bản thử.)
 *
 * Cách gom: một vòng `requestAnimationFrame` do đoạn tiêm tự chạy; mỗi lần gọi, số lệnh vẽ tích luỹ từ lần gọi trước được ghi thành MỘT ô
 * (`frames[i]`) rồi đặt lại. Vì đoạn tiêm đăng ký rAF trước Phaser nên ô i = các lệnh vẽ của khung render ngay trước nó (đúng một lần
 * `render` của Phaser). Khung nào Phaser không vẽ (tiết kiệm pin 30 khung / giây, tab ẩn...) cho ô 0: `summarizeDrawFrames` BỎ các ô 0
 * (chỉ tính khung có vẽ thật), và đếm số ô có vẽ ở `frames`.
 *
 * Hợp đồng (test `draw-counter.test.ts` chạy CHÍNH đoạn tiêm này trong `node:vm` với WebGL giả):
 *   window.__tgDraw.reset()     bắt đầu cửa sổ lấy mẫu mới (xoá các ô đã ghi);
 *   window.__tgDraw.snapshot()  trả `{ frames: number[] }` (mỗi phần tử = số lệnh vẽ của một khung, nguyên >= 0).
 * `summarizeDrawFrames` / `parseDrawCounterSnapshot` là hàm thuần đọc kết quả đó. Số liệu thiếu / sai kiểu cho `null` (cổng perf-gate báo
 * "thiếu số đo", KHÔNG mặc định 0 để xanh giả).
 */

export const DRAW_COUNTER_SOURCE = `(() => {
  if (window.__tgDraw) return;
  const state = { current: 0, frames: [] };
  const NAMES = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"];
  for (const Ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Ctor || !Ctor.prototype) continue;
    for (const name of NAMES) {
      const original = Ctor.prototype[name];
      if (typeof original !== "function") continue;
      Ctor.prototype[name] = function () {
        state.current++;
        return original.apply(this, arguments);
      };
    }
  }
  const tick = () => {
    state.frames.push(state.current);
    state.current = 0;
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
  window.__tgDraw = {
    reset() {
      state.frames = [];
      state.current = 0;
    },
    snapshot() {
      return { frames: state.frames.slice() };
    },
  };
})();`;

const isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Thống kê từ mảng draw call mỗi khung. Chỉ tính các khung có vẽ (> 0). Trung bình làm tròn 1 chữ số; p95 theo thứ hạng gần nhất
 * (nearest-rank: phần tử thứ ceil(0.95 x n) của dãy tăng dần). Không có khung nào để tính thì mọi số là `null`.
 * @param {unknown} frames
 * @returns {{ drawCallsAvg: number | null, drawCallsP95: number | null, drawCallFrames: number }}
 */
export function summarizeDrawFrames(frames) {
  const empty = { drawCallsAvg: null, drawCallsP95: null, drawCallFrames: 0 };
  if (!Array.isArray(frames)) return empty;
  const drawn = frames.filter(isCount).filter((n) => n > 0);
  if (drawn.length === 0) return empty;
  const sorted = [...drawn].sort((a, b) => a - b);
  const avg = sorted.reduce((s, n) => s + n, 0) / sorted.length;
  const p95 = sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)];
  return {
    drawCallsAvg: Number(avg.toFixed(1)),
    drawCallsP95: p95,
    drawCallFrames: sorted.length,
  };
}

/**
 * Đọc kết quả `JSON.stringify(window.__tgDraw.snapshot())` từ trang (chuỗi JSON hoặc đối tượng); sai hình dạng cho số `null`.
 * @param {unknown} raw
 */
export function parseDrawCounterSnapshot(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return summarizeDrawFrames(null);
    }
  }
  return summarizeDrawFrames(value && typeof value === "object" ? value.frames : null);
}
