// Vòng tầm đánh của TƯỢNG phải nhìn thấy được (rà giao diện điện thoại 25/11): bản cũ nét 1 / độ đậm 0,22 không thấy trên 390x844 (dò điểm ảnh quanh bán kính tầm không ra vòng nào),
// người chơi không biết tượng với tới đâu. Test gọi THẬT `drawTotem` của PersistLayer với một Graphics giả ghi lại lệnh vẽ (persist-layer chỉ import KIỂU của Phaser nên chạy được ngoài trình duyệt).
import { describe, expect, it } from "vitest";
import {
  PERSIST_TOTEM_FILL_ALPHA,
  PERSIST_TOTEM_RING_ALPHA,
  PERSIST_TOTEM_RING_ARC,
  PERSIST_TOTEM_RING_DASHES,
  PERSIST_TOTEM_RING_WIDTH,
} from "./persist-fx";
import { PersistLayer } from "./persist-layer";

interface Rec {
  lines: Array<{ width: number; color: number; alpha: number }>;
  fills: Array<{ color: number; alpha: number }>;
  arcs: Array<{ r: number; len: number }>;
  fillCircles: Array<{ r: number; alpha: number }>;
}

/** Graphics giả: chỉ ghi lại thứ `drawTotem` gọi. */
function stubGraphics(): { g: any; rec: Rec } {
  const rec: Rec = { lines: [], fills: [], arcs: [], fillCircles: [] };
  const g: any = {
    lineStyle: (width: number, color: number, alpha: number) =>
      rec.lines.push({ width, color, alpha }),
    fillStyle: (color: number, alpha: number) => rec.fills.push({ color, alpha }),
    beginPath: () => g,
    strokePath: () => g,
    arc: (_x: number, _y: number, r: number, s: number, e: number) =>
      rec.arcs.push({ r, len: e - s }),
    fillCircle: (_x: number, _y: number, r: number) =>
      rec.fillCircles.push({ r, alpha: rec.fills[rec.fills.length - 1]!.alpha }),
    fillEllipse: () => g,
    fillRect: () => g,
  };
  return { g, rec };
}

const TINT = 0xaa66ff;
const R = 220;
function draw(a: number, boost: number, detail: boolean): Rec {
  const { g, rec } = stubGraphics();
  const layer = new PersistLayer({} as any, {} as any) as any;
  layer.drawTotem(g, { tint: TINT }, R, a, boost, 0.5, detail);
  return rec;
}

describe("vòng tầm đánh của tượng", () => {
  it("hằng số: nét >= 2, độ đậm >= 0,4 (ngang vòng bẫy / vùng đã kích hoạt), các cung phủ >= 40 % vòng", () => {
    expect(PERSIST_TOTEM_RING_WIDTH).toBeGreaterThanOrEqual(2);
    expect(PERSIST_TOTEM_RING_ALPHA).toBeGreaterThanOrEqual(0.4);
    expect(
      (PERSIST_TOTEM_RING_DASHES * PERSIST_TOTEM_RING_ARC) / (2 * Math.PI),
    ).toBeGreaterThanOrEqual(0.4);
    expect(PERSIST_TOTEM_FILL_ALPHA).toBeGreaterThan(0);
    expect(PERSIST_TOTEM_FILL_ALPHA).toBeLessThan(0.14); // nhẹ hơn nền của vùng (0,14)
  });

  it("vẽ THẬT: nét và độ đậm lấy từ hằng số (không còn nét 1 / 0,22), đúng số cung, cung nằm đúng bán kính tầm", () => {
    const rec = draw(1, 1, true);
    expect(rec.lines).toHaveLength(1);
    expect(rec.lines[0]).toEqual({
      width: PERSIST_TOTEM_RING_WIDTH,
      color: TINT,
      alpha: PERSIST_TOTEM_RING_ALPHA,
    });
    expect(rec.arcs).toHaveLength(PERSIST_TOTEM_RING_DASHES);
    for (const a of rec.arcs) {
      expect(a.r).toBe(R);
      expect(a.len).toBeCloseTo(PERSIST_TOTEM_RING_ARC, 10);
    }
  });

  it("tượng của MÌNH đậm hơn một chút (boost) nhưng không vượt 1; đang mờ dần (a nhỏ) thì vòng mờ theo", () => {
    const base = draw(1, 1, true).lines[0]!.alpha;
    const mine = draw(1, 1.25, true).lines[0]!.alpha;
    expect(mine).toBeGreaterThan(base);
    expect(mine).toBeLessThanOrEqual(1);
    expect(draw(1, 100, true).lines[0]!.alpha).toBe(1);
    expect(draw(0.3, 1, true).lines[0]!.alpha).toBeCloseTo(base * 0.3, 10);
  });

  it("bậc đồ hoạ có chi tiết: có nền nhạt phủ cả vùng tầm; bậc thấp: chỉ vòng (không nền)", () => {
    const hi = draw(1, 1, true);
    const bigFill = hi.fillCircles.find((c) => c.r === R);
    expect(bigFill, "thiếu nền phủ vùng tầm").toBeDefined();
    expect(bigFill!.alpha).toBeCloseTo(PERSIST_TOTEM_FILL_ALPHA, 10);
    const lo = draw(1, 1, false);
    expect(lo.fillCircles.find((c) => c.r === R)).toBeUndefined();
    expect(lo.lines).toHaveLength(1); // vòng vẫn có ở bậc thấp
    expect(lo.arcs).toHaveLength(PERSIST_TOTEM_RING_DASHES);
  });
});
