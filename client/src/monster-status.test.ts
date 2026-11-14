import { describe, expect, it } from "vitest";
import { STATUS_BIT, statusMask, type StatusId } from "@tien-gioi/shared";
import {
  PIP_R,
  PIP_STEP,
  PIP_STYLE,
  drawPips,
  pipOffsets,
  pipPolygon,
  pipsLabel,
  pipsOf,
  type PipGraphics,
  type PipPoint,
  type PipShape,
} from "./monster-status";

describe("monster-status: pipsOf (mặt nạ -> chấm)", () => {
  it("mỗi bit một chấm, theo thứ tự bit tăng dần, đúng tên", () => {
    const pips = pipsOf(statusMask(["stun", "burn", "chill"]));
    expect(pips.map((p) => p.id)).toEqual(["burn", "chill", "stun"]);
    expect(pips.map((p) => p.name)).toEqual(["Bỏng", "Tê cóng", "Choáng"]);
    expect(pipsLabel(pips)).toBe("Bỏng, Tê cóng, Choáng");
  });

  it("đủ sáu trạng thái có hại: sáu chấm, mỗi cái có HÌNH riêng và MÀU riêng", () => {
    const pips = pipsOf(63);
    expect(pips).toHaveLength(6);
    expect(new Set(pips.map((p) => p.shape)).size).toBe(6);
    expect(new Set(pips.map((p) => p.color)).size).toBe(6);
  });

  it("bảng kiểu phủ kín STATUS_BIT: thêm trạng thái mới vào mặt nạ mà quên kiểu thì test đỏ", () => {
    for (const id of Object.keys(STATUS_BIT) as StatusId[]) expect(PIP_STYLE[id], id).toBeDefined();
    for (const id of Object.keys(PIP_STYLE)) expect(STATUS_BIT[id as StatusId], id).toBeDefined();
  });

  it("mặt nạ rỗng / rác: không chấm nào, không ném lỗi", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, "3", null, undefined, {}, [], 64, 128])
      expect(pipsOf(bad as never), String(bad)).toEqual([]);
    // bit lạ lẫn bit thật: giữ bit thật
    expect(pipsOf(64 | 2).map((p) => p.id)).toEqual(["poison"]);
  });
});

describe("monster-status: bố cục hàng chấm", () => {
  it("cân giữa quanh 0, cách đều PIP_STEP", () => {
    expect(pipOffsets(1)).toEqual([0]);
    expect(pipOffsets(2)).toEqual([-PIP_STEP / 2, PIP_STEP / 2]);
    const six = pipOffsets(6);
    expect(six).toHaveLength(6);
    expect(six[0]).toBeCloseTo(-six[5], 9);
    for (let i = 1; i < 6; i++) expect(six[i] - six[i - 1]).toBeCloseTo(PIP_STEP, 9);
  });

  it("rỗng khi n <= 0 / không hữu hạn; tối đa 6", () => {
    for (const n of [0, -3, NaN, Infinity]) expect(pipOffsets(n)).toEqual([]);
    expect(pipOffsets(99)).toHaveLength(6);
  });

  it("hai chấm kề nhau không chồng lên nhau (khoảng cách tâm > 2 x bán kính + quầng)", () => {
    expect(PIP_STEP).toBeGreaterThan(2 * (PIP_R + 2) - 2);
  });
});

describe("monster-status: hình học", () => {
  const shapes: PipShape[] = ["triangle", "diamond", "square", "cross", "star"];
  it("mỗi hình nằm trong hộp [-r, r] quanh tâm và có số đỉnh đúng", () => {
    const want: Record<string, number> = { triangle: 3, diamond: 4, square: 4, cross: 12, star: 8 };
    for (const s of shapes) {
      const poly = pipPolygon(s, 10, 20, 4);
      expect(poly, s).toHaveLength(want[s]);
      for (const p of poly) {
        expect(Math.abs(p.x - 10)).toBeLessThanOrEqual(4 + 1e-9);
        expect(Math.abs(p.y - 20)).toBeLessThanOrEqual(4 + 1e-9);
      }
    }
    expect(pipPolygon("circle", 0, 0, 4)).toEqual([]);
  });

  it("các hình KHÁC nhau thật (không hai hình trùng đỉnh)", () => {
    const sig = shapes.map((s) => JSON.stringify(pipPolygon(s, 0, 0, 4)));
    expect(new Set(sig).size).toBe(shapes.length);
  });

  it("ngôi sao: đỉnh chẵn ở bán kính ngoài, đỉnh lẻ ở bán kính trong (nhọn thật)", () => {
    const poly = pipPolygon("star", 0, 0, 5);
    poly.forEach((p, i) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(i % 2 === 0 ? 5 : 2, 9));
  });
});

class FakeG implements PipGraphics {
  calls: string[] = [];
  styles: Array<[number, number | undefined]> = [];
  polys: PipPoint[][] = [];
  circles: Array<[number, number, number]> = [];
  clear() {
    this.calls.push("clear");
    return this;
  }
  fillStyle(c: number, a?: number) {
    this.styles.push([c, a]);
    return this;
  }
  fillCircle(x: number, y: number, r: number) {
    this.circles.push([x, y, r]);
    return this;
  }
  fillPoints(p: PipPoint[]) {
    this.polys.push(p);
    return this;
  }
}

describe("monster-status: drawPips", () => {
  it("xoá trước, mỗi chấm có quầng tối rồi hình đúng màu, đúng vị trí", () => {
    const g = new FakeG();
    const n = drawPips(g, pipsOf(statusMask(["poison", "burn"])), -30);
    expect(n).toBe(2);
    expect(g.calls[0]).toBe("clear");
    // burn (tam giác) đứng trước poison (tròn) theo bit; hai quầng + một chấm tròn của poison
    const colors = g.styles.map(([c]) => c);
    expect(colors).toEqual([0x000000, PIP_STYLE.burn!.color, 0x000000, PIP_STYLE.poison!.color]);
    expect(g.polys).toHaveLength(1); // tam giác
    expect(g.circles.filter(([, , r]) => r === PIP_R + 2)).toHaveLength(2); // hai quầng
    const xs = pipOffsets(2);
    expect(g.circles[0][0]).toBe(xs[0]);
    expect(g.circles[0][1]).toBe(-30);
    const poisonCircle = g.circles[g.circles.length - 1];
    expect(poisonCircle[0]).toBe(xs[1]);
    expect(poisonCircle[2]).toBeCloseTo(PIP_R * 0.85, 9);
  });

  it("rỗng: chỉ xoá, vẽ 0", () => {
    const g = new FakeG();
    expect(drawPips(g, [], -30)).toBe(0);
    expect(g.calls).toEqual(["clear"]);
    expect(g.styles).toEqual([]);
  });
});
