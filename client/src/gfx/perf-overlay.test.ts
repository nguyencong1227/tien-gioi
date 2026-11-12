import { describe, expect, it } from "vitest";
import {
  formatPerfLines,
  readPerfExtras,
  registerPerfStat,
  type PerfSnapshot,
} from "./perf-overlay";

const snap = (over: Partial<PerfSnapshot> = {}): PerfSnapshot => ({
  fps: 58.4,
  p95Ms: 17.26,
  tier: "mid",
  mode: "auto",
  cssW: 390,
  cssH: 844,
  dpr: 3,
  renderScale: 1.5,
  heapMb: 31.6,
  governor: { downshifts: 1, badStreak: 0, goodStreak: 2 },
  extras: [],
  ...over,
});

describe("gfx/perf-overlay: định dạng", () => {
  it("các dòng chính: FPS, p95, bậc + chế độ, khung nhìn / DPR, heap", () => {
    const lines = formatPerfLines(snap());
    expect(lines[0]).toBe("FPS 58  p95 17.3 ms");
    expect(lines[1]).toBe("chất lượng mid (auto)  hạ 1  xấu 0 tốt 2");
    expect(lines[2]).toBe("390x844 dpr 3 x1.5");
    expect(lines[3]).toBe("heap 32 MB");
    expect(lines).toHaveLength(4);
  });

  it("không đọc được heap (Safari / Firefox) thì ghi '-', chỉ số thêm vào cuối", () => {
    const lines = formatPerfLines(
      snap({
        heapMb: null,
        extras: [
          ["hạt", "120/220"],
          ["draw", "73"],
        ],
      }),
    );
    expect(lines[3]).toBe("heap -");
    expect(lines.slice(4)).toEqual(["hạt 120/220", "draw 73"]);
  });
});

describe("gfx/perf-overlay: đăng ký chỉ số", () => {
  it("đọc theo thứ tự đăng ký; bỏ đăng ký thì biến mất; hàm lỗi thì '?'", () => {
    const offA = registerPerfStat("hạt", () => "12/60");
    const offB = registerPerfStat("lỗi", () => {
      throw new Error("x");
    });
    expect(readPerfExtras()).toEqual([
      ["hạt", "12/60"],
      ["lỗi", "?"],
    ]);
    offA();
    expect(readPerfExtras()).toEqual([["lỗi", "?"]]);
    offB();
    expect(readPerfExtras()).toEqual([]);
  });

  it("bỏ đăng ký của bản cũ KHÔNG xoá bản đã thay thế cùng tên", () => {
    const off1 = registerPerfStat("x", () => "1");
    const off2 = registerPerfStat("x", () => "2");
    off1();
    expect(readPerfExtras()).toEqual([["x", "2"]]);
    off2();
    expect(readPerfExtras()).toEqual([]);
  });
});
