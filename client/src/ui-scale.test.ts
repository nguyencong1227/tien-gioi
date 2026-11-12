import { describe, expect, it } from "vitest";
import {
  DEFAULT_UI_SCALE,
  UI_SCALE_FACTORS,
  initUiScale,
  modeOfScale,
  parseUiScale,
  uiScaleFactor,
  type UiScaleEnv,
} from "./ui-scale";
import { UI_SCALES } from "./gfx/display";

describe("ui-scale: parse / hệ số", () => {
  it("parseUiScale nhận ba chế độ, giá trị lạ về Vừa", () => {
    expect(parseUiScale("small")).toBe("small");
    expect(parseUiScale("normal")).toBe("normal");
    expect(parseUiScale("large")).toBe("large");
    for (const v of ["", "huge", null, undefined, 1, {}, "LARGE"])
      expect(parseUiScale(v)).toBe(DEFAULT_UI_SCALE);
  });

  it("hệ số đúng ba nấc của display.ts (một nguồn), Vừa đúng 1", () => {
    expect([UI_SCALE_FACTORS.small, UI_SCALE_FACTORS.normal, UI_SCALE_FACTORS.large]).toEqual([
      ...UI_SCALES,
    ]);
    expect(UI_SCALE_FACTORS.normal).toBe(1);
    expect(uiScaleFactor("large")).toBe(1.15);
  });

  it("modeOfScale: nấc gần nhất; số hỏng / rỗng về Vừa; chuỗi số lấy từ CSS cũng được", () => {
    expect(modeOfScale(0.9)).toBe("small");
    expect(modeOfScale("1")).toBe("normal");
    expect(modeOfScale("1.15")).toBe("large");
    expect(modeOfScale(1.4)).toBe("large");
    expect(modeOfScale(0.2)).toBe("small");
    for (const v of ["", null, undefined, "rác", NaN, true, {}])
      expect(modeOfScale(v)).toBe("normal");
  });
});

function fakeEnv(cssScale = "1") {
  const set: number[] = [];
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
      documentElement: { style: { getPropertyValue: (n) => (n === "--ui-scale" ? cssScale : "") } },
      getElementById: (id) => (id === "set-ui-scale" ? sel : null),
    },
    setScale: (n) => void set.push(n),
  };
  return { env, set, sel, change: () => changeCb?.(), listeners: () => listeners };
}

describe("ui-scale: nối ô chọn với display.ts", () => {
  it("đặt ô chọn theo --ui-scale đang áp (display.ts đã đọc giá trị lưu)", () => {
    for (const [css, mode] of [
      ["0.9", "small"],
      ["1", "normal"],
      ["1.15", "large"],
    ] as const) {
      const f = fakeEnv(css);
      initUiScale(f.env);
      expect(f.sel.value).toBe(mode);
      expect(f.set).toEqual([]); // khởi tạo KHÔNG ghi gì (không tự áp, không tự lưu)
    }
  });

  it("đổi ô chọn gọi setScale với đúng hệ số (display.ts lưu số + ghi --ui-scale)", () => {
    const f = fakeEnv("1");
    initUiScale(f.env);
    f.sel.value = "large";
    f.change();
    f.sel.value = "small";
    f.change();
    f.sel.value = "normal";
    f.change();
    expect(f.set).toEqual([1.15, 0.9, 1]);
  });

  it("giá trị lạ trong ô chọn về Vừa (1)", () => {
    const f = fakeEnv();
    initUiScale(f.env);
    f.sel.value = "gigantic";
    f.change();
    expect(f.set).toEqual([1]);
  });

  it("gọi initUiScale hai lần không gắn trình nghe hai lần; thiếu ô chọn thì bỏ qua", () => {
    const f = fakeEnv();
    initUiScale(f.env);
    initUiScale(f.env);
    expect(f.listeners()).toBe(1);
    const noSel: UiScaleEnv = {
      doc: {
        documentElement: { style: { getPropertyValue: () => "1" } },
        getElementById: () => null,
      },
      setScale: () => {
        throw new Error("không được gọi");
      },
    };
    expect(() => initUiScale(noSel)).not.toThrow();
  });
});
