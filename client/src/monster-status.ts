// Huy hiệu trạng thái CÓ HẠI trên đầu quái (M7.7 bước 3b, #508): máy chủ công khai `Monster.fx` (mặt nạ bit `STATUS_BIT`: bỏng 1, độc 2, chảy máu 4, tê cóng 8, vỡ giáp 16, choáng 32;
// buff không lên quái, #559), client đọc bằng `statusesOfMask` rồi vẽ một hàng chấm nhỏ phía trên thanh máu. Mỗi trạng thái có MÀU và HÌNH riêng (tam giác, chấm tròn, thoi, ô vuông,
// chữ thập, ngôi sao bốn cánh) để người khó phân biệt màu vẫn đọc được. Lớp THUẦN: hình học + màu; `drawPips` vẽ qua giao diện Graphics tối thiểu nên test được không cần Phaser.
// Client không tin tin nhắn: `fx` lạ (không phải số nguyên, bit lạ) thì bỏ phần lạ (`statusesOfMask`), không vẽ gì.
import { statusesOfMask, statusOf, type StatusId } from "@tien-gioi/shared";

export type PipShape = "triangle" | "circle" | "diamond" | "square" | "cross" | "star";

export interface PipSpec {
  id: StatusId;
  name: string;
  shape: PipShape;
  /** 0xRRGGBB */
  color: number;
}

/** Hình + màu của từng trạng thái có hại trên quái (khoá theo `STATUS_BIT`). Màu sáng, đủ tách khỏi nền cỏ / đất nhờ viền tối vẽ kèm. */
export const PIP_STYLE: Readonly<Partial<Record<StatusId, { shape: PipShape; color: number }>>> = {
  burn: { shape: "triangle", color: 0xff8a3d },
  poison: { shape: "circle", color: 0x8be04e },
  bleed: { shape: "diamond", color: 0xff4d5e },
  chill: { shape: "square", color: 0x7fdcff },
  sunder: { shape: "cross", color: 0xffd34d },
  stun: { shape: "star", color: 0xffffff },
};

/** Các chấm cho một mặt nạ `fx`, theo thứ tự bit tăng dần (ổn định: chấm không nhảy chỗ khi một cái hết hạn). */
export function pipsOf(mask: unknown): PipSpec[] {
  const out: PipSpec[] = [];
  for (const id of statusesOfMask(mask)) {
    const st = PIP_STYLE[id];
    const def = statusOf(id);
    if (st && def) out.push({ id, name: def.name, shape: st.shape, color: st.color });
  }
  return out;
}

/** Bán kính một chấm (px thế giới) và khoảng cách giữa tâm hai chấm. */
export const PIP_R = 4;
export const PIP_STEP = 11;

/** Toạ độ x (tương đối tâm quái) của `n` chấm xếp thành hàng ngang cân giữa. */
export function pipOffsets(n: number): number[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  const count = Math.min(6, Math.floor(n));
  const half = ((count - 1) * PIP_STEP) / 2;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(-half + i * PIP_STEP);
  return out;
}

export interface PipPoint {
  x: number;
  y: number;
}

/** Đa giác của hình (tâm (cx, cy), "bán kính" r); `circle` trả rỗng (vẽ bằng hình tròn). `star` là ngôi sao bốn cánh (8 đỉnh). */
export function pipPolygon(shape: PipShape, cx: number, cy: number, r: number): PipPoint[] {
  switch (shape) {
    case "triangle":
      return [
        { x: cx, y: cy - r },
        { x: cx + r, y: cy + r * 0.8 },
        { x: cx - r, y: cy + r * 0.8 },
      ];
    case "diamond":
      return [
        { x: cx, y: cy - r },
        { x: cx + r, y: cy },
        { x: cx, y: cy + r },
        { x: cx - r, y: cy },
      ];
    case "square":
      return [
        { x: cx - r * 0.8, y: cy - r * 0.8 },
        { x: cx + r * 0.8, y: cy - r * 0.8 },
        { x: cx + r * 0.8, y: cy + r * 0.8 },
        { x: cx - r * 0.8, y: cy + r * 0.8 },
      ];
    case "cross": {
      const t = r * 0.38; // nửa bề rộng cánh
      return [
        { x: cx - t, y: cy - r },
        { x: cx + t, y: cy - r },
        { x: cx + t, y: cy - t },
        { x: cx + r, y: cy - t },
        { x: cx + r, y: cy + t },
        { x: cx + t, y: cy + t },
        { x: cx + t, y: cy + r },
        { x: cx - t, y: cy + r },
        { x: cx - t, y: cy + t },
        { x: cx - r, y: cy + t },
        { x: cx - r, y: cy - t },
        { x: cx - t, y: cy - t },
      ];
    }
    case "star": {
      const inner = r * 0.4;
      const pts: PipPoint[] = [];
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r : inner;
        pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
      }
      return pts;
    }
    case "circle":
      return [];
  }
}

/** Phần của Graphics mà `drawPips` dùng (Phaser.GameObjects.Graphics khớp). */
export interface PipGraphics {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  fillCircle(x: number, y: number, r: number): unknown;
  fillPoints(points: PipPoint[], closeShape?: boolean): unknown;
}

/** Quầng tối sau mỗi chấm (tăng tương phản trên nền sáng) */
const HALO_ALPHA = 0.7;

/** Vẽ hàng chấm (xoá trước). `y` là tâm hàng tương đối gốc của quái. Trả số chấm đã vẽ. */
export function drawPips(g: PipGraphics, pips: readonly PipSpec[], y: number): number {
  g.clear();
  const xs = pipOffsets(pips.length);
  for (let i = 0; i < xs.length; i++) {
    const p = pips[i];
    const x = xs[i];
    g.fillStyle(0x000000, HALO_ALPHA);
    g.fillCircle(x, y, PIP_R + 2);
    g.fillStyle(p.color, 1);
    if (p.shape === "circle") g.fillCircle(x, y, PIP_R * 0.85);
    else g.fillPoints(pipPolygon(p.shape, x, y, PIP_R), true);
  }
  return xs.length;
}

/** Câu mô tả cho script / trình đọc: "Bỏng, Choáng". */
export function pipsLabel(pips: readonly PipSpec[]): string {
  return pips.map((p) => p.name).join(", ");
}
