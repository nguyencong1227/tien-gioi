import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  DRAW_COUNTER_SOURCE,
  parseDrawCounterSnapshot,
  summarizeDrawFrames,
} from "./draw-counter.mjs";

// Test HỢP ĐỒNG (bài học #390): số đo do harness tự đọc phải có test với NƠI SINH RA số đo. Ở đây "nơi sinh" là CHÍNH đoạn mã tiêm vào trang
// (`DRAW_COUNTER_SOURCE`); test chạy nó trong `node:vm` với một WebGL giả và một `requestAnimationFrame` điều khiển được, rồi đọc kết quả
// bằng chính `summarizeDrawFrames` mà harness dùng.

/** Môi trường trang giả: hai lớp WebGL với các hàm vẽ ghi lại lời gọi, và rAF xếp hàng (chạy tay từng khung). */
function makePage(opts: { webgl2?: boolean } = {}) {
  const calls: string[] = [];
  const rafQueue: Array<() => void> = [];
  const makeCtor = (extra: string[]) => {
    class Ctx {}
    for (const name of ["drawElements", "drawArrays", ...extra]) {
      (Ctx.prototype as any)[name] = function (...a: unknown[]) {
        calls.push(`${name}(${a.join(",")})`);
        return `${name}-ret`;
      };
    }
    return Ctx;
  };
  const sandbox: any = {
    WebGLRenderingContext: makeCtor([]),
    requestAnimationFrame: (fn: () => void) => {
      rafQueue.push(fn);
      return rafQueue.length;
    },
  };
  if (opts.webgl2 !== false) {
    sandbox.WebGL2RenderingContext = makeCtor(["drawElementsInstanced", "drawArraysInstanced"]);
  }
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const inject = (source = DRAW_COUNTER_SOURCE) => vm.runInContext(source, ctx);
  /** Một khung hình: chạy MỌI callback rAF đã xếp hàng theo thứ tự đăng ký (cái mới đăng ký trong lúc chạy thuộc khung sau). */
  const frame = () => {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const fn of batch) fn();
  };
  return {
    sandbox,
    calls,
    inject,
    frame,
    gl1: () => new sandbox.WebGLRenderingContext(),
    gl2: () => new sandbox.WebGL2RenderingContext(),
  };
}

/** Mô phỏng Phaser: đăng ký rAF SAU đoạn tiêm; mỗi khung vẽ `plan[i]` lệnh `drawArrays` (Phaser 3.90 / WebGL1 vẽ bằng drawArrays, đo thật) rồi đăng ký lại. */
function runPhaser(page: ReturnType<typeof makePage>, gl: any, plan: number[]) {
  let i = 0;
  const step = () => {
    for (let k = 0; k < (plan[i] ?? 0); k++) gl.drawArrays(4, 0, 6);
    i++;
    page.sandbox.requestAnimationFrame(step);
  };
  page.sandbox.requestAnimationFrame(step);
}

describe("M5.1 #397: bộ đếm draw call tiêm vào trang (draw-counter)", () => {
  it("bọc đủ 4 hàm vẽ trên cả hai lớp WebGL, GỌI LẠI hàm gốc đúng đối số / this / giá trị trả về", () => {
    const page = makePage();
    page.inject();
    const g1 = page.gl1() as any;
    const g2 = page.gl2() as any;
    expect(g1.drawElements(4, 6)).toBe("drawElements-ret");
    expect(g1.drawArrays(4, 0, 3)).toBe("drawArrays-ret");
    expect(g2.drawElementsInstanced(4, 6, 5123, 0, 10)).toBe("drawElementsInstanced-ret");
    expect(g2.drawArraysInstanced(4, 0, 3, 10)).toBe("drawArraysInstanced-ret");
    expect(page.calls).toEqual([
      "drawElements(4,6)",
      "drawArrays(4,0,3)",
      "drawElementsInstanced(4,6,5123,0,10)",
      "drawArraysInstanced(4,0,3,10)",
    ]);
  });

  it("gom theo khung: lệnh vẽ của khung k thuộc ô k + 1 (đoạn tiêm đăng ký rAF trước game), khung không vẽ cho ô 0", () => {
    const page = makePage();
    page.inject();
    runPhaser(page, page.gl1(), [3, 5, 0, 7]);
    const w = page.sandbox.__tgDraw;
    w.reset();
    for (let f = 0; f < 6; f++) page.frame();
    const snap = w.snapshot();
    expect(snap.frames).toEqual([0, 3, 5, 0, 7, 0]);
    // thống kê chỉ tính khung có vẽ: 3, 5, 7 -> TB 5, p95 = 7 (thứ hạng gần nhất)
    expect(summarizeDrawFrames(snap.frames)).toEqual({
      drawCallsAvg: 5,
      drawCallsP95: 7,
      drawCallFrames: 3,
    });
  });

  it("reset() xoá các ô đã ghi và đếm dở; snapshot() trả bản sao (sửa bản sao không đổi bộ đếm)", () => {
    const page = makePage();
    page.inject();
    const w = page.sandbox.__tgDraw;
    runPhaser(page, page.gl1(), [4, 4, 4, 4, 4, 4]);
    for (let f = 0; f < 4; f++) page.frame();
    expect(w.snapshot().frames.length).toBe(4);
    w.reset();
    expect(w.snapshot().frames).toEqual([]);
    // ô đầu sau reset là 0 (lệnh vẽ dở của khung trước đã bị xoá), ô sau mới là khung đầy đủ
    page.frame();
    page.frame();
    const a = w.snapshot();
    a.frames.push(999);
    expect(w.snapshot().frames).toEqual([0, 4]);
  });

  it("chạy đoạn tiêm hai lần không bọc hai lớp (không đếm đôi)", () => {
    const page = makePage();
    page.inject();
    page.inject();
    runPhaser(page, page.gl1(), [2, 2, 2]);
    const w = page.sandbox.__tgDraw;
    w.reset();
    for (let f = 0; f < 4; f++) page.frame();
    expect(w.snapshot().frames).toEqual([0, 2, 2, 2]);
  });

  it("trình duyệt chỉ có WebGL1 (không có WebGL2RenderingContext) vẫn chạy", () => {
    const page = makePage({ webgl2: false });
    page.inject();
    runPhaser(page, page.gl1(), [6]);
    const w = page.sandbox.__tgDraw;
    w.reset();
    page.frame();
    page.frame();
    expect(w.snapshot().frames).toEqual([0, 6]);
  });

  it("đột biến: bọc THIẾU hàm game dùng (drawArrays) -> mọi ô 0 -> số đo là null (cổng đỏ 'thiếu số đo'), KHÔNG phải 0 giả", () => {
    const page = makePage();
    // bỏ `drawArrays` khỏi danh sách bọc: game gọi drawArrays nên không đếm được gì
    const broken = DRAW_COUNTER_SOURCE.replace('"drawArrays", ', "");
    expect(broken).not.toBe(DRAW_COUNTER_SOURCE);
    page.inject(broken);
    runPhaser(page, page.gl1(), [5, 5, 5]);
    const w = page.sandbox.__tgDraw;
    w.reset();
    for (let f = 0; f < 4; f++) page.frame();
    expect(w.snapshot().frames).toEqual([0, 0, 0, 0]);
    expect(summarizeDrawFrames(w.snapshot().frames)).toEqual({
      drawCallsAvg: null,
      drawCallsP95: null,
      drawCallFrames: 0,
    });
  });
});

describe("M5.1 #397: summarizeDrawFrames / parseDrawCounterSnapshot (hàm thuần)", () => {
  it("p95 theo thứ hạng gần nhất, chỉ khung có vẽ, trung bình làm tròn 1 chữ số", () => {
    const frames = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
    expect(summarizeDrawFrames([0, 0, ...frames, 0])).toEqual({
      drawCallsAvg: 10.5,
      drawCallsP95: 19, // ceil(0,95 x 20) = 19 -> phần tử thứ 19
      drawCallFrames: 20,
    });
    expect(summarizeDrawFrames([7])).toEqual({
      drawCallsAvg: 7,
      drawCallsP95: 7,
      drawCallFrames: 1,
    });
    expect(summarizeDrawFrames([3, 4, 4])).toMatchObject({ drawCallsAvg: 3.7, drawCallsP95: 4 });
  });

  it("dữ liệu rỗng / toàn 0 / sai kiểu -> null (không bao giờ ra số 0 giả)", () => {
    const nul = { drawCallsAvg: null, drawCallsP95: null, drawCallFrames: 0 };
    expect(summarizeDrawFrames([])).toEqual(nul);
    expect(summarizeDrawFrames([0, 0, 0])).toEqual(nul);
    expect(summarizeDrawFrames(undefined)).toEqual(nul);
    expect(summarizeDrawFrames("12")).toEqual(nul);
    expect(summarizeDrawFrames({ frames: [1] })).toEqual(nul);
    // phần tử rác (âm, thập phân, NaN, chuỗi) bị bỏ, phần tử tốt còn lại vẫn tính
    expect(summarizeDrawFrames([-1, 2.5, NaN, "9", null, 6])).toEqual({
      drawCallsAvg: 6,
      drawCallsP95: 6,
      drawCallFrames: 1,
    });
  });

  it("parseDrawCounterSnapshot: chuỗi JSON, đối tượng, và rác", () => {
    const want = { drawCallsAvg: 5, drawCallsP95: 7, drawCallFrames: 3 };
    expect(parseDrawCounterSnapshot(JSON.stringify({ frames: [0, 3, 5, 7] }))).toEqual(want);
    expect(parseDrawCounterSnapshot({ frames: [0, 3, 5, 7] })).toEqual(want);
    const nul = { drawCallsAvg: null, drawCallsP95: null, drawCallFrames: 0 };
    expect(parseDrawCounterSnapshot("không phải JSON")).toEqual(nul);
    expect(parseDrawCounterSnapshot(null)).toEqual(nul);
    expect(parseDrawCounterSnapshot("null")).toEqual(nul);
    expect(parseDrawCounterSnapshot('{"frames":"x"}')).toEqual(nul);
  });
});
