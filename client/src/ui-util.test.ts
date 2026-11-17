import { afterEach, describe, expect, it, vi } from "vitest";
import { $, buttonShown, fmt, hexColor, onPress, readPref, writePref } from "./ui-util";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fmt (số rút gọn ở HUD)", () => {
  it("số nhỏ giữ nguyên phần nguyên, làm tròn xuống", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(7)).toBe("7");
    expect(fmt(999.9)).toBe("999");
    expect(fmt(9999)).toBe("9999");
  });
  it("từ 10 nghìn: k một số lẻ; từ 1 triệu: M một số lẻ", () => {
    expect(fmt(10000)).toBe("10.0k");
    expect(fmt(12345)).toBe("12.3k");
    expect(fmt(999999)).toBe("1000.0k");
    expect(fmt(1_000_000)).toBe("1.0M");
    expect(fmt(2_500_000)).toBe("2.5M");
  });
  it("số hỏng hoặc âm thành 0 (HUD không bao giờ hiện NaN / Infinity / số âm)", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, -0.5]) expect(fmt(bad)).toBe("0");
  });
});

describe("hexColor", () => {
  it("đệm đủ 6 chữ số hex", () => {
    expect(hexColor(0xff0000)).toBe("#ff0000");
    expect(hexColor(0x00ff7f)).toBe("#00ff7f");
    expect(hexColor(0x0000ff)).toBe("#0000ff");
    expect(hexColor(0)).toBe("#000000");
  });
});

describe("readPref / writePref (localStorage an toàn)", () => {
  it("ghi rồi đọc lại; khoá chưa có thì null", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(readPref("tg_x")).toBeNull();
    writePref("tg_x", "1");
    expect(readPref("tg_x")).toBe("1");
    expect(store.get("tg_x")).toBe("1");
  });
  it("chế độ riêng tư chặn localStorage (ném lỗi): không ném ra ngoài, đọc ra null, ghi bỏ qua", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readPref("tg_x")).toBeNull();
    expect(() => writePref("tg_x", "1")).not.toThrow();
  });
  it("không có localStorage (môi trường không phải trình duyệt): không ném", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readPref("tg_x")).toBeNull();
    expect(() => writePref("tg_x", "1")).not.toThrow();
  });
});

describe("onPress (chuột / chạm = pointerdown, bàn phím = Enter / Cách)", () => {
  function fake() {
    const handlers = new Map<string, (e: any) => void>();
    const el = {
      addEventListener: (type: string, h: (e: any) => void) => void handlers.set(type, h),
    } as unknown as HTMLElement;
    const ev = (extra: Record<string, unknown> = {}) => ({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...extra,
    });
    return { el, handlers, ev };
  }

  it("pointerdown: gọi hành động đúng một lần, chặn mặc định, không chặn nổi bọt khi stop = false", () => {
    const { el, handlers, ev } = fake();
    const fn = vi.fn();
    onPress(el, fn);
    const e = ev();
    handlers.get("pointerdown")!(e);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });
  it("stop = true: chặn cả nổi bọt", () => {
    const { el, handlers, ev } = fake();
    onPress(el, vi.fn(), true);
    const e = ev();
    handlers.get("pointerdown")!(e);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });
  it("Enter và Cách gọi hành động; phím giữ (repeat) và phím khác thì không", () => {
    const { el, handlers, ev } = fake();
    const fn = vi.fn();
    onPress(el, fn);
    const kd = handlers.get("keydown")!;
    kd(ev({ key: "Enter", repeat: false }));
    kd(ev({ key: " ", repeat: false }));
    expect(fn).toHaveBeenCalledTimes(2);
    kd(ev({ key: "Enter", repeat: true }));
    kd(ev({ key: "a", repeat: false }));
    kd(ev({ key: "Tab", repeat: false }));
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("phím không phải Enter / Cách không bị chặn mặc định (Tab vẫn đi tiếp được)", () => {
    const { el, handlers, ev } = fake();
    onPress(el, vi.fn());
    const e = ev({ key: "Tab", repeat: false });
    handlers.get("keydown")!(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe("$ và buttonShown", () => {
  function stubDoc(map: Record<string, unknown>) {
    vi.stubGlobal("document", { getElementById: (id: string) => map[id] ?? null });
  }
  it("$ trả đúng phần tử theo id (hoặc null)", () => {
    const a = { id: "a" };
    stubDoc({ a });
    expect($("a")).toBe(a);
    expect($("zz")).toBeNull();
  });
  it("buttonShown: có, không disabled, không tổ tiên nào hidden thì true", () => {
    stubDoc({ b: { disabled: false, closest: () => null } });
    expect(buttonShown("b")).toBe(true);
  });
  it("buttonShown: không có phần tử / disabled / nằm trong tổ tiên hidden thì false", () => {
    stubDoc({
      d: { disabled: true, closest: () => null },
      h: { disabled: false, closest: () => ({}) },
    });
    expect(buttonShown("none")).toBe(false);
    expect(buttonShown("d")).toBe(false);
    expect(buttonShown("h")).toBe(false);
  });
});
