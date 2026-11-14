import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("gfx/hd-gate: thời gian tab ẨN không tính là ổn định (review B ở #547)", () => {
  it("ẩn tab dừng đếm, hiện lại đếm tiếp: 30 s hiện + 5 phút ẩn + 30 s hiện = đủ 60 s", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS / 2);
    g.setVisible(false);
    c.advance(5 * 60_000);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(HD_STABLE_MS / 2);
    g.setVisible(true);
    c.advance(HD_STABLE_MS / 2 - 1);
    expect(g.allowed()).toBe(false);
    c.advance(1);
    expect(g.allowed()).toBe(true);
  });

  it("mở trang ở tab ẩn: hdPacks bật nhưng chưa đếm; hiện tab mới bắt đầu", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.setVisible(false);
    g.update(true);
    c.advance(10 * HD_STABLE_MS);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBe(HD_STABLE_MS);
    g.setVisible(true);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
  });

  it("đã đủ ổn định rồi thì ẩn tab KHÔNG đóng cổng", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
    g.setVisible(false);
    expect(g.allowed()).toBe(true);
    c.advance(HD_STABLE_MS);
    g.setVisible(true);
    expect(g.allowed()).toBe(true);
  });

  it("hdPacks tắt trong lúc tab ẩn vẫn xoá phần đã đếm; bật lại đếm từ 0", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS - 1000);
    g.setVisible(false);
    g.update(false);
    g.setVisible(true);
    g.update(true);
    c.advance(1000);
    expect(g.allowed()).toBe(false);
    c.advance(HD_STABLE_MS - 1000);
    expect(g.allowed()).toBe(true);
  });

  it("báo hdPacks=true lặp lại LÚC ĐANG ẨN không xoá phần đã đếm", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS / 2);
    g.setVisible(false);
    g.update(true); // hồ sơ đổi vì lý do khác trong lúc ẩn
    g.update(true);
    g.setVisible(true);
    c.advance(HD_STABLE_MS / 2);
    expect(g.allowed()).toBe(true);
  });

  it("báo hiện / ẩn lặp lại cùng giá trị không đặt lại và không đếm trùng", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    g.setVisible(true);
    c.advance(HD_STABLE_MS / 2);
    g.setVisible(true);
    g.setVisible(false);
    g.setVisible(false);
    c.advance(HD_STABLE_MS);
    expect(g.msUntilAllowed()).toBe(HD_STABLE_MS / 2);
  });

  it("msUntilAllowed không âm khi đã quá mốc", () => {
    const c = clock();
    const g = createHdGate(c.now);
    g.update(true);
    c.advance(HD_STABLE_MS + 12345);
    expect(g.msUntilAllowed()).toBe(0);
  });
});

describe("gfx/hd-gate: đồng hồ mặc định đơn điệu (performance.now), không theo giờ hệ thống", () => {
  afterEach(() => vi.restoreAllMocks());

  it("giờ hệ thống nhảy tiến 1 giờ (đồng bộ giờ / chỉnh tay) KHÔNG làm cổng mở sớm", () => {
    // `Date.now` bị giả TRƯỚC khi tạo cổng: nếu đồng hồ mặc định là `Date.now` thì cổng bắt đúng bản giả này và nhìn thấy cú nhảy
    const spy = vi.spyOn(Date, "now");
    const real = Date.now();
    spy.mockReturnValue(real);
    const g = createHdGate();
    g.update(true);
    spy.mockReturnValue(real + 3_600_000);
    expect(g.allowed()).toBe(false);
    expect(g.msUntilAllowed()).toBeGreaterThan(HD_STABLE_MS - 5000);
  });
});

describe("gfx/hd-gate: bindHdGate nối cả hiện / ẩn tab", () => {
  function visSource(initial: boolean) {
    const listeners = new Set<(v: boolean) => void>();
    return {
      initial,
      subscribe: (cb: (v: boolean) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      emit: (v: boolean) => listeners.forEach((cb) => cb(v)),
      count: () => listeners.size,
    };
  }
  /** Nguồn `hdPacks` không bao giờ phát gì */
  const noHd = () => (_cb: (hd: boolean) => void) => () => undefined;

  it("khởi động ở tab ẨN: hdPacks bật không bắt đầu đếm", () => {
    const c = clock();
    const g = createHdGate(c.now);
    const vis = visSource(false);
    bindHdGate(g, true, noHd(), () => undefined, vis);
    c.advance(10 * HD_STABLE_MS);
    expect(g.allowed()).toBe(false);
    vis.emit(true);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
  });

  it("sự kiện hiện / ẩn đi vào cổng; hàm gỡ nối gỡ CẢ HAI nguồn", () => {
    const c = clock();
    const g = createHdGate(c.now);
    const vis = visSource(true);
    let hdListeners = 0;
    const off = bindHdGate(
      g,
      true,
      () => {
        hdListeners++;
        return () => hdListeners--;
      },
      () => undefined,
      vis,
    );
    c.advance(HD_STABLE_MS / 2);
    vis.emit(false);
    c.advance(HD_STABLE_MS);
    expect(g.msUntilAllowed()).toBe(HD_STABLE_MS / 2);
    expect(vis.count()).toBe(1);
    expect(hdListeners).toBe(1);
    off();
    expect(vis.count()).toBe(0);
    expect(hdListeners).toBe(0);
  });

  it("không truyền nguồn hiện / ẩn thì chạy như trước (luôn hiện)", () => {
    const c = clock();
    const g = createHdGate(c.now);
    bindHdGate(g, true, noHd(), () => undefined);
    c.advance(HD_STABLE_MS);
    expect(g.allowed()).toBe(true);
  });
});
