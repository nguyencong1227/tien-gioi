// Độ tương phản chữ / nền theo WCAG 2.x (M7, a11y): hàm THUẦN để chữ tô màu theo hệ (mục khắc chân linh, bảng Công pháp...) luôn đọc được trên nền tối
// (>= 4,5:1 cho chữ thường). Màu là chuỗi "#rrggbb" hoặc bộ ba [r, g, b] (0-255); đầu vào hỏng không ném lỗi mà coi như đen.
export type Rgb = readonly [number, number, number];

const clamp255 = (n: number): number => (Number.isFinite(n) ? Math.min(255, Math.max(0, n)) : 0);

/** "#rrggbb" (hoặc "rrggbb") -> [r, g, b]; không đúng dạng -> [0, 0, 0]. */
export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(typeof hex === "string" ? hex.trim() : "");
  if (!m) return [0, 0, 0];
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function toHex(c: Rgb): string {
  return `#${c.map((n) => Math.round(clamp255(n)).toString(16).padStart(2, "0")).join("")}`;
}

/** Độ sáng tương đối WCAG (0..1). */
export function luminance(c: Rgb): number {
  const lin = (v: number): number => {
    const s = clamp255(v) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** Tỉ số tương phản WCAG giữa hai màu (1..21), đối xứng. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Màu `fg` (alpha 0..1) đặt LÊN nền đặc `bg`: kết quả đặc. Dùng để tính nền thật của một lớp trong suốt xếp chồng. */
export function compositeOver(fg: readonly [number, number, number, number], bg: Rgb): Rgb {
  const a = Number.isFinite(fg[3]) ? Math.min(1, Math.max(0, fg[3])) : 1;
  return [0, 1, 2].map((i) => clamp255(fg[i] * a + bg[i] * (1 - a))) as unknown as Rgb;
}

/**
 * Sáng dần `fg` về phía trắng (bước 4 %) cho tới khi tương phản với `bg` đạt `min` (mặc định 4,5, mức AA cho chữ thường). Đã đạt thì giữ nguyên (không đổi
 * sắc thái thừa). Nền quá sáng để đạt `min` bằng cách làm sáng chữ thì trả trắng (cố gắng tối đa).
 */
export function readableOn(fg: string, bg: Rgb, min = 4.5): string {
  const base = parseHex(fg);
  if (contrast(base, bg) >= min) return toHex(base);
  for (let t = 0.04; t <= 1.0001; t += 0.04) {
    const c = base.map((v) => v + (255 - v) * t) as unknown as Rgb;
    if (contrast(c, bg) >= min) return toHex(c);
  }
  return "#ffffff";
}
