/**
 * Cỡ chữ giao diện do người chơi chọn (M5.1, #326, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 4.2 điều 2): Nhỏ / Vừa / Lớn qua biến CSS
 * `--ui-scale` (đặt trên `<html>`), lưu `tg_ui_scale`. Chỉ chữ NỘI DUNG (bảng, hộp thoại, chat) co giãn theo; HUD không (xem `text-scale.css`).
 * Hàm thuần (`parseUiScale`, `uiScaleFactor`) + `applyUiScale` / `initUiScale` (đụng DOM) để test được.
 */

export type UiScaleMode = "small" | "normal" | "large";

export const UI_SCALE_STORAGE_KEY = "tg_ui_scale";
export const DEFAULT_UI_SCALE: UiScaleMode = "normal";

/** Hệ số nhân chữ nội dung theo chế độ. */
export const UI_SCALE_FACTORS: Readonly<Record<UiScaleMode, number>> = {
  small: 0.9,
  normal: 1,
  large: 1.15,
};

export function parseUiScale(v: unknown): UiScaleMode {
  return v === "small" || v === "normal" || v === "large" ? v : DEFAULT_UI_SCALE;
}

export function uiScaleFactor(mode: UiScaleMode): number {
  return UI_SCALE_FACTORS[mode];
}

/** Môi trường tối thiểu (thay được trong test: không cần DOM thật). */
export interface UiScaleEnv {
  doc: {
    documentElement: {
      style: { setProperty(name: string, value: string): void };
      dataset: Record<string, string | undefined>;
    };
    getElementById(id: string): unknown;
  };
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
}

function browserEnv(): UiScaleEnv {
  let storage: UiScaleEnv["storage"] = null;
  try {
    storage = localStorage;
  } catch {
    /* trình duyệt chặn localStorage */
  }
  return { doc: document as unknown as UiScaleEnv["doc"], storage };
}

/** Đặt `--ui-scale` và `<html data-ui-scale>`; `persist` ghi `tg_ui_scale` (chế độ riêng tư / chặn lưu thì bỏ qua). */
export function applyUiScale(
  mode: UiScaleMode,
  persist = true,
  env: UiScaleEnv = browserEnv(),
): void {
  env.doc.documentElement.style.setProperty("--ui-scale", String(uiScaleFactor(mode)));
  env.doc.documentElement.dataset.uiScale = mode;
  if (persist) {
    try {
      env.storage?.setItem(UI_SCALE_STORAGE_KEY, mode);
    } catch {
      /* bỏ qua */
    }
  }
}

interface SelectLike {
  value: string;
  dataset: Record<string, string | undefined>;
  addEventListener(type: "change", cb: () => void): void;
}

/** Gọi sớm ở `main.ts`: áp lựa chọn đã lưu và nối ô chọn `#set-ui-scale` (Cài đặt). */
export function initUiScale(env: UiScaleEnv = browserEnv()): void {
  let raw: string | null = null;
  try {
    raw = env.storage?.getItem(UI_SCALE_STORAGE_KEY) ?? null;
  } catch {
    /* bỏ qua */
  }
  const mode = parseUiScale(raw);
  applyUiScale(mode, false, env);
  const sel = env.doc.getElementById("set-ui-scale") as SelectLike | null;
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.value = mode;
    sel.addEventListener("change", () => applyUiScale(parseUiScale(sel.value), true, env));
  }
}
