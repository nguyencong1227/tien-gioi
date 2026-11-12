import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_SCALE,
  UI_SCALE_FACTORS,
  UI_SCALE_STORAGE_KEY,
  applyUiScale,
  initUiScale,
  type UiScaleEnv,
  parseUiScale,
  uiScaleFactor,
} from "./ui-scale";

describe("ui-scale: parse / hệ số", () => {
  it("parseUiScale nhận ba chế độ, giá trị lạ về Vừa", () => {
    expect(parseUiScale("small")).toBe("small");
    expect(parseUiScale("normal")).toBe("normal");
    expect(parseUiScale("large")).toBe("large");
    for (const v of ["", "huge", null, undefined, 1, {}, "LARGE"])
      expect(parseUiScale(v)).toBe(DEFAULT_UI_SCALE);
  });
  it("hệ số tăng dần Nhỏ < Vừa < Lớn, Vừa đúng 1", () => {
    expect(UI_SCALE_FACTORS.small).toBeLessThan(UI_SCALE_FACTORS.normal);
    expect(UI_SCALE_FACTORS.normal).toBe(1);
    expect(UI_SCALE_FACTORS.large).toBeGreaterThan(UI_SCALE_FACTORS.normal);
    expect(uiScaleFactor("large")).toBe(1.15);
  });
});

function fakeEnv(stored: string | null = null, blocked = false) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(UI_SCALE_STORAGE_KEY, stored);
  const vars: Record<string, string> = {};
  const dataset: Record<string, string | undefined> = {};
  let changeCb: (() => void) | null = null;
  let listeners = 0;
  const sel = {
    value: "",
    dataset: {} as Record<string, string | undefined>,
    addEventListener: (_t: "change", cb: () => void) => {
      changeCb = cb;
      listeners++;
    },
  };
  const env: UiScaleEnv = {
    doc: {
      documentElement: { style: { setProperty: (k, v) => (vars[k] = v) }, dataset },
      getElementById: (id) => (id === "set-ui-scale" ? sel : null),
    },
    storage: blocked
      ? {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  };
  return { env, store, vars, dataset, sel, change: () => changeCb?.(), listeners: () => listeners };
}

describe("ui-scale: áp lên tài liệu", () => {
  it("applyUiScale đặt --ui-scale, data-ui-scale và lưu", () => {
    const f = fakeEnv();
    applyUiScale("large", true, f.env);
    expect(f.vars["--ui-scale"]).toBe("1.15");
    expect(f.dataset.uiScale).toBe("large");
    expect(f.store.get(UI_SCALE_STORAGE_KEY)).toBe("large");
  });

  it("persist = false không ghi vào bộ nhớ", () => {
    const f = fakeEnv();
    applyUiScale("small", false, f.env);
    expect(f.vars["--ui-scale"]).toBe("0.9");
    expect(f.store.has(UI_SCALE_STORAGE_KEY)).toBe(false);
  });

  it("bộ nhớ bị chặn (ném lỗi) không làm hỏng việc áp cỡ chữ", () => {
    const f = fakeEnv(null, true);
    expect(() => applyUiScale("large", true, f.env)).not.toThrow();
    expect(f.vars["--ui-scale"]).toBe("1.15");
    expect(() => initUiScale(f.env)).not.toThrow();
    expect(f.vars["--ui-scale"]).toBe("1"); // không đọc được giá trị đã lưu: về Vừa
  });

  it("initUiScale áp lựa chọn đã lưu, chỉnh ô chọn và lưu khi đổi", () => {
    const f = fakeEnv("large");
    initUiScale(f.env);
    expect(f.vars["--ui-scale"]).toBe("1.15");
    expect(f.sel.value).toBe("large");
    f.sel.value = "small";
    f.change();
    expect(f.vars["--ui-scale"]).toBe("0.9");
    expect(f.store.get(UI_SCALE_STORAGE_KEY)).toBe("small");
  });

  it("giá trị đã lưu hỏng về Vừa (1)", () => {
    const f = fakeEnv("khong-hop-le");
    initUiScale(f.env);
    expect(f.vars["--ui-scale"]).toBe("1");
  });

  it("gọi initUiScale hai lần không gắn trình nghe hai lần", () => {
    const f = fakeEnv();
    initUiScale(f.env);
    initUiScale(f.env);
    expect(f.listeners()).toBe(1);
  });

  it("giá trị lạ trong ô chọn không làm hỏng: về Vừa", () => {
    const f = fakeEnv();
    initUiScale(f.env);
    f.sel.value = "gigantic";
    f.change();
    expect(f.vars["--ui-scale"]).toBe("1");
  });
});
