import { describe, expect, it } from "vitest";
import { bindHdGate, createHdGate } from "./hd-gate";
import { HD_STABLE_MS } from "./packs";

/** Đồng hồ giả: `t` tăng tay. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("gfx/hd-gate: cổng gói 2x chỉ mở khi bậc Rất cao đã ổn định", () => {
  it("mặc định đóng; mốc ổn định là 60 s (thiết kế mục 10.3)", () => {
    expect(HD_STABLE_MS).toBe(60_000);
    const c = clock();
    const g = createHdGate(c.now);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(Infinity);
  });

  it("hdPacks tắt thì không bao giờ mở, dù đợi bao lâu", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(false);
    c.advance(10 * HD_STABLE_MS);
    expect(g.allowed()).toBe(false);
  });

  it("bật liên tục: đóng tới sát mốc, mở đúng ở mốc, còn mở sau đó", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(HD_STABLE_MS);
    c.advance(HD_STABLE_MS - 1);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(1);
    c.advance(1);
    expect(g.allowed()).toBe(true);
    expect(g.msUntilAllowed()).toBe(0);
    c.advance(5 * HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
  });

  it("báo lại `true` nhiều lần (hồ sơ đổi vì lý do khác) KHÔNG đặt lại đồng hồ", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS / 2);
    g.update(true);
    c.advance(HD_STABLE_MS / 2);
    g.update(true);
    expect(g.allowed()).toBe(true);
  });

  it("hạ bậc / bật tiết kiệm pin (hdPacks tắt) đóng NGAY, bật lại thì đếm lại từ đầu", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
    g.update(false); // tiết kiệm pin bật
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(Infinity);
    c.advance(HD_STABLE_MS * 3); // tắt bao lâu cũng không tính
    g.update(true); // tắt tiết kiệm pin
    expect(g.allowed()).toBe(false);
    c.advance(HD_STABLE_MS - 1);
    expect(g.allowed()).toBe(false);
    c.advance(1);
    expect(g.allowed()).toBe(true);
  });

  it("nháy ngắn tắt rồi bật (bộ điều tốc dao động) bị tính là KHÔNG ổn định", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS - 1000);
    g.update(false);
    g.update(true);
    c.advance(1000);
    expect(g.allowed()).toBe(false);
  });

  it("mốc ổn định tuỳ chỉnh (tham số thứ hai)", () => {
    const c = clock();
    const g = createHdGate(c.now, 5000);
    g.update(true);
    c.advance(4999);
    expect(g.allowed()).toBe(false);
    c.advance(1);
    expect(g.allowed()).toBe(true);
  });
});

describe("gfx/hd-gate: bindHdGate nối cổng với hồ sơ chất lượng", () => {
  /** Nguồn hồ sơ giả: `emit(hdPacks)` phát một lần đổi hồ sơ tới mọi người nghe. */
  function source() {
    const listeners = new Set<(hd: boolean) => void>();
    return {
      subscribe: (cb: (hd: boolean) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      emit: (hd: boolean) => listeners.forEach((cb) => cb(hd)),
      count: () => listeners.size,
    };
  }

  it("ghi nhận giá trị ban đầu: máy đã ở Rất cao thì đếm 60 s từ lúc nối, không phải từ lúc hồ sơ đổi", () => {
    const c = clock();
    const g = createHdGate(c.now);
    const src = source();
    bindHdGate(g, true, src.subscribe, () => undefined);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
  });

  it("giá trị ban đầu tắt: cổng đóng; hồ sơ lên Rất cao sau đó thì đếm từ lúc đó", () => {
    const c = clock();
    const g = createHdGate(c.now);
    const src = source();
    bindHdGate(g, false, src.subscribe, () => undefined);
    c.advance(HD_STABLE_MS * 2);
    expect(g.allowed()).toBe(false);
    src.emit(true);
    c.advance(HD_STABLE_MS - 1);
    expect(g.allowed()).toBe(false);
    c.advance(1);
    expect(g.allowed()).toBe(true);
  });

  it("hdPacks tắt: cổng đóng VÀ gọi giải phóng gói hd:*; hdPacks bật thì KHÔNG giải phóng", () => {
    const c = clock();
    const g = createHdGate(c.now);
    const src = source();
    let released = 0;
    bindHdGate(g, true, src.subscribe, () => released++);
    src.emit(true);
    expect(released).toBe(0);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
    src.emit(false);
    expect(released).toBe(1);
    expect(g.allowed()).toBe(false);
  });

  it("hàm gỡ nối thôi nghe hồ sơ", () => {
    const g = createHdGate(clock().now);
    const src = source();
    const off = bindHdGate(g, true, src.subscribe, () => undefined);
    expect(src.count()).toBe(1);
    off();
    expect(src.count()).toBe(0);
  });
});
