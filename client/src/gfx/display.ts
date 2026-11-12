/**
 * Lõi hiển thị M5 (issue #322, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 3.1, 4.1).
 *
 * Một nơi DUY NHẤT biết: kích thước khung nhìn logic (CSS px), DPR, vùng an toàn, loại thiết bị, hướng, và
 * đang dùng cảm ứng hay chuột. HUD (CSS), camera và lớp hiệu ứng chỉ ĐỌC kết quả (`getDisplay`) hoặc đăng ký
 * lắng nghe (`onDisplayChange`); không ai tự đọc `innerWidth` / `matchMedia` rải rác.
 *
 * Kết quả cũng được ghi lên `<html>` để CSS dùng thay cho `@media` rải rác:
 *   data-form="phone|tablet|desktop"  data-orient="portrait|landscape"  data-input="touch|mouse"
 *   --safe-t/r/b/l (px)  --vw  --vh (px thật của khung nhìn, tránh lỗi 100vh trên di động)  --ui-scale
 * (`data-quality` và `data-reduce-motion` do `quality.ts` đặt.)
 *
 * Mã tách làm hai: hàm thuần (phân loại) và bộ điều khiển nhận một `DisplayEnv` được TIÊM VÀO, nên test chạy
 * bằng đối tượng giả (client không có jsdom). `browserEnv()` là bản thật gắn vào `window` / `document`.
 */

export type FormFactor = "phone" | "tablet" | "desktop";
export type Orient = "portrait" | "landscape";

export interface SafeInsets {
  t: number;
  r: number;
  b: number;
  l: number;
}

export interface DisplayInfo {
  /** Kích thước khung nhìn logic (CSS px), đã trừ bàn phím ảo nếu `visualViewport` báo. */
  cssW: number;
  cssH: number;
  /** `devicePixelRatio` thật. */
  dpr: number;
  /** Hệ số nhân canvas thực dùng (<= dpr); do Scale Manager / hồ sơ chất lượng đặt (mặc định 1). */
  renderScale: number;
  form: FormFactor;
  orient: Orient;
  /** Đang dùng cảm ứng (đổi theo lần nhập gần nhất trên máy lai). */
  touch: boolean;
  safe: SafeInsets;
}

/** Cạnh ngắn dưới mức này (CSS px) là điện thoại. */
export const PHONE_MAX_SHORT_SIDE = 600;
/** Chênh lệch kích thước nhỏ hơn mức này không coi là thay đổi (chống rung khi thanh địa chỉ co giãn). */
export const RESIZE_EPSILON_PX = 2;
/** Gom nhiều sự kiện đổi kích thước dồn dập. */
export const RESIZE_DEBOUNCE_MS = 100;

export const UI_SCALES = [0.9, 1, 1.15] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const UI_SCALE_STORAGE_KEY = "tg_ui_scale";

/**
 * Loại thiết bị theo kích thước khung nhìn và con trỏ CHÍNH, KHÔNG theo User-Agent:
 * cạnh ngắn < 600 là điện thoại; còn lại là máy tính bảng nếu con trỏ chính là cảm ứng, không thì máy tính.
 * (1280x720 chuột là `desktop`; iPad / máy tính bảng Android là `tablet`; laptop cảm ứng có chuột là `desktop`
 * nhưng `touch` vẫn bật được theo lần nhập gần nhất.)
 */
export function classifyForm(cssW: number, cssH: number, coarsePrimary: boolean): FormFactor {
  if (Math.min(cssW, cssH) < PHONE_MAX_SHORT_SIDE) return "phone";
  return coarsePrimary ? "tablet" : "desktop";
}

export function classifyOrient(cssW: number, cssH: number): Orient {
  return cssW >= cssH ? "landscape" : "portrait";
}

export function clampUiScale(v: unknown): UiScale {
  // null / rỗng / boolean: `Number(null)` = 0 sẽ bị hiểu là "rất nhỏ" (0.9): chưa có giá trị thì phải là 1
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  let best: UiScale = 1;
  let bestD = Infinity;
  for (const s of UI_SCALES) {
    const d = Math.abs(s - n);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function safeNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeInset(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export type DisplayEventType =
  | "resize"
  | "orientationchange"
  | "viewport"
  | "pointerdown"
  /** `(pointer: coarse)` đổi (máy lai gắn / tháo bàn phím, chế độ tablet) mà không có `resize`. */
  | "pointermedia";

/** Phần tối thiểu của môi trường mà lõi hiển thị cần (tiêm vào để test không cần DOM). */
export interface DisplayEnv {
  /** Khung nhìn logic hiện tại (CSS px). */
  size(): { w: number; h: number };
  dpr(): number;
  /** `(pointer: coarse)` là con trỏ chính? */
  coarsePrimary(): boolean;
  safe(): SafeInsets;
  /** Đăng ký sự kiện; trả về hàm huỷ. `pointerdown` kèm `pointerType`. */
  listen(type: DisplayEventType, cb: (e?: { pointerType?: string }) => void): () => void;
  /** Hẹn giờ; trả về hàm huỷ. */
  setTimer(fn: () => void, ms: number): () => void;
  root: {
    setAttribute(name: string, value: string): void;
    setProperty(name: string, value: string): void;
  };
  storage?: { get(key: string): string | null; set(key: string, value: string): void };
  /** Dọn tài nguyên môi trường tạo ra (vd phần tử dò vùng an toàn). */
  dispose?(): void;
}

export interface DisplayController {
  get(): DisplayInfo;
  /** Đăng ký lắng nghe thay đổi; trả về hàm huỷ. KHÔNG gọi ngay lúc đăng ký. */
  onChange(cb: (d: DisplayInfo) => void): () => void;
  /** Scale Manager (#324) báo hệ số nhân canvas thực dùng. */
  setRenderScale(scale: number): void;
  setUiScale(scale: number): void;
  /** Đọc lại NGAY (không chờ gom sự kiện). */
  refresh(): void;
  dispose(): void;
}

function sameInfo(a: DisplayInfo, b: DisplayInfo): boolean {
  return (
    Math.abs(a.cssW - b.cssW) < RESIZE_EPSILON_PX &&
    Math.abs(a.cssH - b.cssH) < RESIZE_EPSILON_PX &&
    a.dpr === b.dpr &&
    a.renderScale === b.renderScale &&
    a.form === b.form &&
    a.orient === b.orient &&
    a.touch === b.touch &&
    a.safe.t === b.safe.t &&
    a.safe.r === b.safe.r &&
    a.safe.b === b.safe.b &&
    a.safe.l === b.safe.l
  );
}

export function createDisplay(env: DisplayEnv): DisplayController {
  const listeners = new Set<(d: DisplayInfo) => void>();
  let touch = env.coarsePrimary();
  let renderScale = 1;
  // Chiều cao ỔN ĐỊNH dùng để phân loại `form` / `orient`: bàn phím ảo làm khung nhìn thấp đi (360x640 -> 360x340)
  // mà máy không xoay; nếu phân loại theo chiều cao thật thì `orient` lật sang landscape (và tablet thành phone)
  // đúng lúc người chơi gõ chữ, làm tấm toàn màn hình biến thành ngăn kéo. Trên cảm ứng: chiều cao chỉ GIẢM mà
  // bề rộng không đổi thì giữ chiều cao lớn nhất đã thấy ở bề rộng này; bề rộng đổi (xoay máy, đổi cỡ cửa sổ) thì
  // đặt lại. Trên máy tính (chuột) thay đổi chiều cao là thật nên theo sát.
  let lastW = -1;
  let stableH = 0;
  let uiScale: UiScale = clampUiScale(env.storage?.get(UI_SCALE_STORAGE_KEY));

  const read = (): DisplayInfo => {
    const sz = env.size();
    const cssW = Math.max(1, Math.round(safeNumber(sz.w, 1)));
    const cssH = Math.max(1, Math.round(safeNumber(sz.h, 1)));
    const s = env.safe();
    if (cssW !== lastW) {
      lastW = cssW;
      stableH = cssH;
    } else {
      stableH = touch ? Math.max(stableH, cssH) : cssH;
    }
    return {
      cssW,
      cssH,
      dpr: safeNumber(env.dpr(), 1),
      renderScale,
      form: classifyForm(cssW, stableH, env.coarsePrimary()),
      orient: classifyOrient(cssW, stableH),
      touch,
      safe: { t: safeInset(s.t), r: safeInset(s.r), b: safeInset(s.b), l: safeInset(s.l) },
    };
  };

  const write = (d: DisplayInfo): void => {
    env.root.setAttribute("data-form", d.form);
    env.root.setAttribute("data-orient", d.orient);
    env.root.setAttribute("data-input", d.touch ? "touch" : "mouse");
    env.root.setProperty("--safe-t", `${d.safe.t}px`);
    env.root.setProperty("--safe-r", `${d.safe.r}px`);
    env.root.setProperty("--safe-b", `${d.safe.b}px`);
    env.root.setProperty("--safe-l", `${d.safe.l}px`);
    env.root.setProperty("--vw", `${d.cssW}px`);
    env.root.setProperty("--vh", `${d.cssH}px`);
    env.root.setProperty("--ui-scale", String(uiScale));
  };

  let info = read();
  write(info);

  const apply = (): void => {
    const next = read();
    if (sameInfo(info, next)) return;
    info = next;
    write(info);
    for (const cb of [...listeners]) {
      // Một người nghe lỗi không được chặn những người nghe khác (và không làm hỏng việc cập nhật)
      try {
        cb(info);
      } catch (e) {
        console.error("[display] người nghe onChange ném lỗi:", e);
      }
    }
  };

  let cancelTimer: (() => void) | null = null;
  const schedule = (): void => {
    cancelTimer?.();
    cancelTimer = env.setTimer(() => {
      cancelTimer = null;
      apply();
    }, RESIZE_DEBOUNCE_MS);
  };

  const unsub: Array<() => void> = [
    env.listen("resize", schedule),
    env.listen("orientationchange", schedule),
    env.listen("viewport", schedule),
    env.listen("pointermedia", schedule),
    env.listen("pointerdown", (e) => {
      const t = e?.pointerType;
      // Chỉ đổi theo loại con trỏ đã biết; loại lạ không làm nhảy chế độ.
      if (t === "touch" || t === "pen") touch = true;
      else if (t === "mouse") touch = false;
      else return;
      apply(); // đổi ngay (không cần gom): người chơi vừa chạm / bấm
    }),
  ];

  return {
    get: () => info,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setRenderScale(scale) {
      const v = safeNumber(scale, 1);
      if (v === renderScale) return;
      renderScale = v;
      apply();
    },
    setUiScale(scale) {
      const v = clampUiScale(scale);
      if (v === uiScale) return;
      uiScale = v;
      env.storage?.set(UI_SCALE_STORAGE_KEY, String(v));
      env.root.setProperty("--ui-scale", String(uiScale));
    },
    refresh() {
      cancelTimer?.();
      cancelTimer = null;
      apply();
    },
    dispose() {
      cancelTimer?.();
      cancelTimer = null;
      for (const u of unsub) u();
      listeners.clear();
      env.dispose?.();
    },
  };
}

/** Môi trường thật: gắn vào `window` / `document` của trình duyệt. */
export function browserEnv(win: Window = window, doc: Document = document): DisplayEnv {
  let probe: HTMLElement | null = null;
  const ensureProbe = (): HTMLElement => {
    if (probe) return probe;
    probe = doc.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
      "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    doc.documentElement.appendChild(probe);
    return probe;
  };
  const root = doc.documentElement;
  const vv = win.visualViewport ?? null;
  return {
    size: () => (vv ? { w: vv.width, h: vv.height } : { w: win.innerWidth, h: win.innerHeight }),
    dpr: () => win.devicePixelRatio,
    coarsePrimary: () => win.matchMedia("(pointer: coarse)").matches,
    safe: () => {
      const cs = win.getComputedStyle(ensureProbe());
      return {
        t: parseFloat(cs.paddingTop),
        r: parseFloat(cs.paddingRight),
        b: parseFloat(cs.paddingBottom),
        l: parseFloat(cs.paddingLeft),
      };
    },
    listen(type, cb) {
      if (type === "viewport") {
        if (!vv) return () => {};
        const h = () => cb();
        vv.addEventListener("resize", h);
        return () => vv.removeEventListener("resize", h);
      }
      if (type === "pointermedia") {
        const mq = win.matchMedia("(pointer: coarse)");
        const h = () => cb();
        mq.addEventListener?.("change", h);
        return () => mq.removeEventListener?.("change", h);
      }
      if (type === "pointerdown") {
        const h = (e: Event) => cb({ pointerType: (e as PointerEvent).pointerType });
        win.addEventListener("pointerdown", h, { capture: true, passive: true });
        return () => win.removeEventListener("pointerdown", h, { capture: true });
      }
      const h = () => cb();
      win.addEventListener(type, h);
      return () => win.removeEventListener(type, h);
    },
    setTimer(fn, ms) {
      const id = win.setTimeout(fn, ms);
      return () => win.clearTimeout(id);
    },
    root: {
      setAttribute: (n, v) => root.setAttribute(n, v),
      setProperty: (n, v) => root.style.setProperty(n, v),
    },
    dispose: () => {
      probe?.remove();
      probe = null;
    },
    storage: {
      get: (k) => {
        try {
          return win.localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          win.localStorage.setItem(k, v);
        } catch {
          /* chế độ riêng tư: bỏ qua */
        }
      },
    },
  };
}

// --- Bản duy nhất dùng trong ứng dụng ---

let current: DisplayController | null = null;

/** Khởi tạo (gọi sớm trong `main.ts`); gọi lại sẽ thay bản cũ. */
export function initDisplay(env?: DisplayEnv): DisplayController {
  current?.dispose();
  current = createDisplay(env ?? browserEnv());
  return current;
}

function ctl(): DisplayController {
  return current ?? initDisplay();
}

export function getDisplay(): DisplayInfo {
  return ctl().get();
}
export function onDisplayChange(cb: (d: DisplayInfo) => void): () => void {
  return ctl().onChange(cb);
}
export function setRenderScale(scale: number): void {
  ctl().setRenderScale(scale);
}
export function setUiScale(scale: number): void {
  ctl().setUiScale(scale);
}
