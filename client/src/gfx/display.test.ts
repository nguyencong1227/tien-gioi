import { describe, expect, it, vi } from "vitest";
import {
  PHONE_MAX_SHORT_SIDE,
  RESIZE_DEBOUNCE_MS,
  UI_SCALE_STORAGE_KEY,
  classifyForm,
  classifyOrient,
  clampUiScale,
  createDisplay,
  type DisplayEnv,
  type DisplayEventType,
  type SafeInsets,
} from "./display";

/** Môi trường giả: điều khiển được kích thước, con trỏ, vùng an toàn, đồng hồ; ghi lại thuộc tính / biến CSS. */
function fakeEnv(init: {
  w: number;
  h: number;
  dpr?: number;
  coarse?: boolean;
  safe?: SafeInsets;
}) {
  const state = {
    w: init.w,
    h: init.h,
    dpr: init.dpr ?? 1,
    coarse: init.coarse ?? false,
    safe: init.safe ?? { t: 0, r: 0, b: 0, l: 0 },
  };
  const handlers = new Map<DisplayEventType, Set<(e?: { pointerType?: string }) => void>>();
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const attrs: Record<string, string> = {};
  const props: Record<string, string> = {};
  const store: Record<string, string> = {};
  const env: DisplayEnv = {
    size: () => ({ w: state.w, h: state.h }),
    dpr: () => state.dpr,
    coarsePrimary: () => state.coarse,
    safe: () => state.safe,
    listen(type, cb) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(cb);
      return () => handlers.get(type)!.delete(cb);
    },
    setTimer(fn, ms) {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
    root: {
      setAttribute: (n, v) => {
        attrs[n] = v;
      },
      setProperty: (n, v) => {
        props[n] = v;
      },
    },
    storage: {
      get: (k) => store[k] ?? null,
      set: (k, v) => {
        store[k] = v;
      },
    },
  };
  const fire = (type: DisplayEventType, e?: { pointerType?: string }) =>
    [...(handlers.get(type) ?? [])].forEach((h) => h(e));
  /** Chạy mọi hẹn giờ còn sống (đủ để gom xong). */
  const flush = () => {
    for (const t of timers.splice(0)) if (t.live) t.fn();
  };
  return { env, state, fire, flush, timers, attrs, props, store, handlers };
}

describe("gfx/display: phân loại thiết bị theo khung nhìn (không theo User-Agent)", () => {
  // Ma trận khung nhìn của docs/THIET_KE_GIAO_DIEN_DO_HOA.md mục 12 (con trỏ chính: điện thoại / tablet cảm ứng, máy tính chuột)
  const cases: Array<[number, number, boolean, string, string]> = [
    [360, 640, true, "phone", "portrait"],
    [390, 844, true, "phone", "portrait"],
    [412, 915, true, "phone", "portrait"],
    [844, 390, true, "phone", "landscape"],
    [915, 412, true, "phone", "landscape"],
    [768, 1024, true, "tablet", "portrait"],
    [1024, 768, true, "tablet", "landscape"],
    [1280, 720, false, "desktop", "landscape"],
    [1920, 1080, false, "desktop", "landscape"],
    [2560, 1440, false, "desktop", "landscape"],
    // cửa sổ trình duyệt hẹp trên máy tính: cạnh ngắn < 600 là phone dù có chuột (bố cục thu gọn)
    [500, 900, false, "phone", "portrait"],
    // laptop cảm ứng có chuột (con trỏ chính chuột) vẫn là desktop
    [1366, 768, false, "desktop", "landscape"],
  ];
  for (const [w, h, coarse, form, orient] of cases) {
    it(`${w}x${h} ${coarse ? "cảm ứng" : "chuột"} -> ${form} / ${orient}`, () => {
      expect(classifyForm(w, h, coarse)).toBe(form);
      expect(classifyOrient(w, h)).toBe(orient);
    });
  }

  it("ranh giới: cạnh ngắn đúng 600 không còn là phone", () => {
    expect(classifyForm(PHONE_MAX_SHORT_SIDE - 1, 900, true)).toBe("phone");
    expect(classifyForm(PHONE_MAX_SHORT_SIDE, 900, true)).toBe("tablet");
    expect(classifyForm(PHONE_MAX_SHORT_SIDE, 900, false)).toBe("desktop");
  });

  it("vuông: coi là landscape (cùng quy ước >=)", () => {
    expect(classifyOrient(700, 700)).toBe("landscape");
  });

  it("clampUiScale: chọn nấc gần nhất, rác thì 1", () => {
    expect(clampUiScale(0.9)).toBe(0.9);
    expect(clampUiScale("1.15")).toBe(1.15);
    expect(clampUiScale(1.4)).toBe(1.15);
    expect(clampUiScale(0.2)).toBe(0.9);
    expect(clampUiScale("rác")).toBe(1);
    expect(clampUiScale(NaN)).toBe(1);
    expect(clampUiScale(undefined)).toBe(1);
    expect(clampUiScale(null)).toBe(1); // chưa có giá trị lưu
    expect(clampUiScale("")).toBe(1);
    expect(clampUiScale(false)).toBe(1);
  });
});

describe("gfx/display: bộ điều khiển với môi trường giả", () => {
  it("lúc tạo: đọc ngay và ghi thuộc tính + biến CSS lên <html>", () => {
    const f = fakeEnv({ w: 390, h: 844, dpr: 3, coarse: true, safe: { t: 47, r: 0, b: 34, l: 0 } });
    const d = createDisplay(f.env);
    expect(d.get()).toMatchObject({
      cssW: 390,
      cssH: 844,
      dpr: 3,
      renderScale: 1,
      form: "phone",
      orient: "portrait",
      touch: true,
      safe: { t: 47, r: 0, b: 34, l: 0 },
    });
    expect(f.attrs).toMatchObject({
      "data-form": "phone",
      "data-orient": "portrait",
      "data-input": "touch",
    });
    expect(f.props).toMatchObject({
      "--safe-t": "47px",
      "--safe-r": "0px",
      "--safe-b": "34px",
      "--safe-l": "0px",
      "--vw": "390px",
      "--vh": "844px",
      "--ui-scale": "1",
    });
  });

  it("đổi kích thước: gom sự kiện dồn dập rồi phát MỘT lần và cập nhật thuộc tính", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    d.onChange(cb);
    f.state.w = 844;
    f.state.h = 390;
    f.fire("resize");
    f.fire("resize");
    f.fire("orientationchange");
    expect(cb).not.toHaveBeenCalled(); // chưa hết thời gian gom
    expect(f.timers.filter((t) => t.live)).toHaveLength(1); // chỉ còn MỘT hẹn giờ sống
    expect(f.timers.at(-1)!.ms).toBe(RESIZE_DEBOUNCE_MS);
    f.flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatchObject({
      cssW: 844,
      cssH: 390,
      orient: "landscape",
      form: "phone",
    });
    expect(f.attrs["data-orient"]).toBe("landscape");
    expect(f.props["--vw"]).toBe("844px");
  });

  it("bàn phím ảo (visualViewport thu nhỏ chiều cao) cập nhật --vh", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    f.state.h = 520;
    f.fire("viewport");
    f.flush();
    expect(d.get().cssH).toBe(520);
    expect(f.props["--vh"]).toBe("520px");
  });

  it("chênh lệch dưới 2 px (thanh địa chỉ co giãn) không phát sự kiện", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    d.onChange(cb);
    f.state.h = 845;
    f.fire("resize");
    f.flush();
    expect(cb).not.toHaveBeenCalled();
    f.state.h = 850;
    f.fire("resize");
    f.flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("máy lai: chạm đổi sang touch ngay, bấm chuột đổi lại; loại con trỏ lạ không làm nhảy", () => {
    const f = fakeEnv({ w: 1366, h: 768, coarse: false });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    d.onChange(cb);
    expect(d.get().touch).toBe(false);
    expect(f.attrs["data-input"]).toBe("mouse");

    f.fire("pointerdown", { pointerType: "touch" });
    expect(d.get().touch).toBe(true);
    expect(f.attrs["data-input"]).toBe("touch");
    expect(cb).toHaveBeenCalledTimes(1);

    f.fire("pointerdown", { pointerType: "touch" }); // lặp lại: không phát thêm
    expect(cb).toHaveBeenCalledTimes(1);

    f.fire("pointerdown", { pointerType: "something-else" });
    f.fire("pointerdown", {});
    expect(d.get().touch).toBe(true);

    f.fire("pointerdown", { pointerType: "mouse" });
    expect(d.get().touch).toBe(false);
    expect(f.attrs["data-input"]).toBe("mouse");
    expect(cb).toHaveBeenCalledTimes(2);
    // phân loại `form` KHÔNG đổi theo chạm: vẫn desktop (con trỏ CHÍNH là chuột)
    expect(d.get().form).toBe("desktop");
  });

  it("vùng an toàn đổi (xoay máy có tai thỏ) được đọc lại; số rác thành 0", () => {
    const f = fakeEnv({ w: 844, h: 390, coarse: true, safe: { t: 0, r: 47, b: 21, l: 47 } });
    const d = createDisplay(f.env);
    expect(d.get().safe).toEqual({ t: 0, r: 47, b: 21, l: 47 });
    f.state.safe = { t: NaN, r: -5, b: Infinity, l: 12.4 } as unknown as SafeInsets;
    f.fire("resize");
    f.flush();
    expect(d.get().safe).toEqual({ t: 0, r: 0, b: 0, l: 12 });
  });

  it("kích thước / DPR rác không làm vỡ (>= 1 px, dpr 1)", () => {
    const f = fakeEnv({ w: 0, h: NaN, dpr: -2, coarse: true });
    const d = createDisplay(f.env);
    expect(d.get()).toMatchObject({ cssW: 1, cssH: 1, dpr: 1 });
  });

  it("setRenderScale: phát sự kiện khi đổi, bỏ qua khi giống; giá trị rác về 1", () => {
    const f = fakeEnv({ w: 1280, h: 720, dpr: 2 });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    d.onChange(cb);
    d.setRenderScale(1.5);
    expect(d.get().renderScale).toBe(1.5);
    expect(cb).toHaveBeenCalledTimes(1);
    d.setRenderScale(1.5);
    expect(cb).toHaveBeenCalledTimes(1);
    d.setRenderScale(NaN);
    expect(d.get().renderScale).toBe(1);
  });

  it("setUiScale: lưu vào storage, cập nhật --ui-scale; khởi tạo đọc lại từ storage", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    d.setUiScale(1.15);
    expect(f.store[UI_SCALE_STORAGE_KEY]).toBe("1.15");
    expect(f.props["--ui-scale"]).toBe("1.15");

    const f2 = fakeEnv({ w: 390, h: 844, coarse: true });
    f2.store[UI_SCALE_STORAGE_KEY] = "0.9";
    createDisplay(f2.env);
    expect(f2.props["--ui-scale"]).toBe("0.9");
    const f3 = fakeEnv({ w: 390, h: 844, coarse: true });
    f3.store[UI_SCALE_STORAGE_KEY] = "hỏng";
    createDisplay(f3.env);
    expect(f3.props["--ui-scale"]).toBe("1");
  });

  it("refresh: đọc lại ngay, huỷ hẹn giờ đang chờ", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    d.onChange(cb);
    f.state.w = 412;
    f.fire("resize");
    d.refresh();
    expect(cb).toHaveBeenCalledTimes(1);
    f.flush(); // hẹn giờ cũ đã bị huỷ: không phát lần hai
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("huỷ đăng ký + dispose: không còn lắng nghe, không còn hẹn giờ sống", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    const cb = vi.fn();
    const off = d.onChange(cb);
    off();
    f.state.w = 500;
    f.fire("resize");
    f.flush();
    expect(cb).not.toHaveBeenCalled();

    f.fire("resize");
    d.dispose();
    expect(f.timers.every((t) => !t.live)).toBe(true);
    for (const set of f.handlers.values()) expect(set.size).toBe(0); // không rò listener
    const before = f.attrs["data-orient"];
    f.state.w = 1000;
    f.fire("resize");
    f.flush();
    expect(f.attrs["data-orient"]).toBe(before);
  });

  it("callback ném lỗi không chặn callback khác trên cùng một lần phát? (hiện trạng: lỗi nổi lên, ghi nhận bằng test)", () => {
    const f = fakeEnv({ w: 390, h: 844, coarse: true });
    const d = createDisplay(f.env);
    const second = vi.fn();
    d.onChange(() => {
      throw new Error("lỗi người nghe");
    });
    d.onChange(second);
    f.state.w = 600;
    f.fire("resize");
    expect(() => f.flush()).toThrow("lỗi người nghe");
    // trạng thái đã cập nhật trước khi gọi người nghe nên lần đọc sau vẫn đúng
    expect(d.get().cssW).toBe(600);
    expect(second).not.toHaveBeenCalled();
  });
});
