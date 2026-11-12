/**
 * Ô chọn cỡ chữ giao diện (M5.1, #326, `docs/THIET_KE_GIAO_DIEN_DO_HOA.md` mục 4.2 điều 2): Nhỏ / Vừa / Lớn.
 * MỘT nguồn sự thật là `gfx/display.ts` (`setUiScale`, `UI_SCALES`, khoá `tg_ui_scale` lưu SỐ 0,9 / 1 / 1,15): display.ts đọc giá trị đã
 * lưu lúc khởi tạo và GHI LẠI `--ui-scale` lên `<html>` mỗi lần kích thước / hướng máy đổi. Mô-đun này chỉ nối ô chọn `#set-ui-scale` với
 * `setUiScale`, KHÔNG tự ghi `--ui-scale` hay bộ nhớ (bản đầu làm vậy: chọn Lớn rồi xoay máy thì display.ts ghi đè về 1).
 * Chỉ chữ NỘI DUNG (bảng, hộp thoại, chat) co giãn theo `--ui-scale`; HUD không (xem `text-scale.css`).
 * Hàm thuần (`parseUiScale`, `uiScaleFactor`, `modeOfScale`) + `initUiScale` (nối DOM, môi trường tiêm được) để test được.
 */
import { UI_SCALES, setUiScale } from "./gfx/display";

export type UiScaleMode = "small" | "normal" | "large";

export const DEFAULT_UI_SCALE: UiScaleMode = "normal";

/** Hệ số nhân chữ nội dung theo chế độ (đúng ba nấc của display.ts). */
export const UI_SCALE_FACTORS: Readonly<Record<UiScaleMode, number>> = {
  small: UI_SCALES[0],
  normal: UI_SCALES[1],
  large: UI_SCALES[2],
};

export function parseUiScale(v: unknown): UiScaleMode {
  return v === "small" || v === "normal" || v === "large" ? v : DEFAULT_UI_SCALE;
}

export function uiScaleFactor(mode: UiScaleMode): number {
  return UI_SCALE_FACTORS[mode];
}

/** Chế độ ứng với hệ số đang áp (nấc gần nhất); số hỏng / rỗng về Vừa. */
export function modeOfScale(scale: unknown): UiScaleMode {
  if (scale === null || scale === undefined || scale === "" || typeof scale === "boolean")
    return DEFAULT_UI_SCALE;
  const n = Number(scale);
  if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
  let best: UiScaleMode = DEFAULT_UI_SCALE;
  let bestD = Infinity;
  for (const m of Object.keys(UI_SCALE_FACTORS) as UiScaleMode[]) {
    const d = Math.abs(UI_SCALE_FACTORS[m] - n);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

interface SelectLike {
  value: string;
  dataset: Record<string, string | undefined>;
  addEventListener(type: "change", cb: () => void): void;
}

/** Môi trường tối thiểu (thay được trong test: không cần DOM thật). */
export interface UiScaleEnv {
  doc: {
    documentElement: { style: { getPropertyValue(name: string): string } };
    getElementById(id: string): unknown;
  };
  /** Đổi hệ số (display.ts lưu + ghi `--ui-scale`). */
  setScale(scale: number): void;
}

function browserEnv(): UiScaleEnv {
  return { doc: document as unknown as UiScaleEnv["doc"], setScale: setUiScale };
}

/** Gọi SAU `initDisplay()` (đã ghi `--ui-scale` từ giá trị lưu): đặt ô chọn `#set-ui-scale` đúng nấc đang áp và nối sự kiện đổi. */
export function initUiScale(env: UiScaleEnv = browserEnv()): void {
  const sel = env.doc.getElementById("set-ui-scale") as SelectLike | null;
  if (!sel || sel.dataset.bound) return;
  sel.dataset.bound = "1";
  sel.value = modeOfScale(env.doc.documentElement.style.getPropertyValue("--ui-scale"));
  sel.addEventListener("change", () => env.setScale(uiScaleFactor(parseUiScale(sel.value))));
}
