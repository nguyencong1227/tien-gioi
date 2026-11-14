import { describe, expect, it } from "vitest";
import { MAPS, TILE } from "@tien-gioi/shared";
import { getMapOverview } from "./map-overview";
import {
  MAX_DPR,
  ZONE_ALPHA,
  canvasPixelSize,
  fitView,
  placeLabels,
  zoneColor,
  zoneRGBA,
  type LabelReq,
  type Rect,
} from "./map-render";

describe("map-render: fitView", () => {
  it("bản đồ rộng trong canvas vuông: vừa chiều ngang, căn giữa theo chiều dọc", () => {
    const worldW = 128 * TILE;
    const worldH = 96 * TILE;
    const v = fitView(worldW, worldH, 400, 400);
    expect(v.scale).toBeCloseTo(400 / worldW, 12);
    expect(v.ox).toBeCloseTo(0, 9);
    expect(v.oy).toBeCloseTo((400 - worldH * v.scale) / 2, 9);
    // toàn bộ bản đồ nằm trong canvas
    expect(v.ox + worldW * v.scale).toBeLessThanOrEqual(400 + 1e-9);
    expect(v.oy + worldH * v.scale).toBeLessThanOrEqual(400 + 1e-9);
  });

  it("lề (pad) được chừa ở mọi cạnh và vẫn căn giữa", () => {
    const v = fitView(1000, 1000, 120, 120, 10);
    expect(v.scale).toBeCloseTo(100 / 1000, 12);
    expect(v.ox).toBeCloseTo(10, 9);
    expect(v.oy).toBeCloseTo(10, 9);
  });

  it("kích thước không hợp lệ (0, âm, NaN, lề quá lớn) không bao giờ ra NaN / vô cực", () => {
    for (const [ww, wh, cw, ch, pad] of [
      [0, 100, 100, 100, 0],
      [100, -1, 100, 100, 0],
      [100, 100, 0, 100, 0],
      [100, 100, Number.NaN, 100, 0],
      [100, 100, 100, 100, 500],
    ] as const) {
      const v = fitView(ww, wh, cw, ch, pad);
      expect(Number.isFinite(v.scale), `${ww},${wh},${cw},${ch},${pad}`).toBe(true);
      expect(v.scale).toBeGreaterThan(0);
      expect(Number.isFinite(v.ox) && Number.isFinite(v.oy)).toBe(true);
    }
  });
});

describe("map-render: canvasPixelSize", () => {
  it("nhân devicePixelRatio, làm tròn, `u` là hệ số đổi CSS -> canvas", () => {
    expect(canvasPixelSize(114, 114, 1)).toEqual({ w: 114, h: 114, u: 1 });
    expect(canvasPixelSize(114, 114, 2)).toEqual({ w: 228, h: 228, u: 2 });
    expect(canvasPixelSize(100.4, 50.6, 1.5)).toEqual({ w: 151, h: 76, u: 1.5 });
  });

  it("dpr kẹp trong 1..MAX_DPR; dpr rác -> 1; kích thước 0 / NaN -> tối thiểu 1 điểm ảnh", () => {
    expect(canvasPixelSize(10, 10, 9).u).toBe(MAX_DPR);
    expect(canvasPixelSize(10, 10, 0.5).u).toBe(1);
    expect(canvasPixelSize(10, 10, Number.NaN).u).toBe(1);
    expect(canvasPixelSize(10, 10, Infinity).u).toBe(1);
    expect(canvasPixelSize(0, 0, 2)).toEqual({ w: 1, h: 1, u: 2 });
    expect(canvasPixelSize(Number.NaN, 5, 1).w).toBe(1);
  });
});

describe("map-render: màu khu quái", () => {
  it("một khu duy nhất lấy màu vàng; nhiều khu: đầu xanh lá, cuối đỏ, độ đỏ tăng đều theo cấp", () => {
    expect(zoneColor(0, 1)).toEqual(zoneColor(0, 0));
    const n = 5;
    const cs = Array.from({ length: n }, (_, i) => zoneColor(i, n));
    const [first, last] = [cs[0], cs[n - 1]];
    expect(first[1]).toBeGreaterThan(first[0]); // xanh lá
    expect(last[0]).toBeGreaterThan(last[1]); // đỏ
    // "độ đỏ" (đỏ trừ xanh lá) tăng đều theo cấp
    for (let i = 1; i < n; i++)
      expect(cs[i][0] - cs[i][1]).toBeGreaterThan(cs[i - 1][0] - cs[i - 1][1]);
    expect(new Set(cs.map((c) => c.join(","))).size).toBe(n); // mỗi cấp một màu khác nhau
  });

  it("chỉ số ngoài khoảng được kẹp, không ra số lạ", () => {
    for (const c of [zoneColor(-3, 4), zoneColor(99, 4)])
      for (const x of c) expect(x >= 0 && x <= 255 && Number.isInteger(x)).toBe(true);
  });
});

describe("map-render: zoneRGBA", () => {
  for (const def of MAPS) {
    it(`${def.id}: điểm ảnh có alpha ZONE_ALPHA đúng ô thuộc khu quái và đúng màu theo cấp; ngoài khu trong suốt`, () => {
      const ov = getMapOverview(def.id)!;
      const outW = 120;
      const outH = Math.round((120 * ov.h) / ov.w);
      const rgba = zoneRGBA(ov, outW, outH);
      expect(rgba.length).toBe(outW * outH * 4);
      let inZone = 0;
      let outside = 0;
      for (let py = 0; py < outH; py++)
        for (let px = 0; px < outW; px++) {
          const cx = Math.min(ov.w - 1, Math.floor(((px + 0.5) * ov.w) / outW));
          const cy = Math.min(ov.h - 1, Math.floor(((py + 0.5) * ov.h) / outH));
          const z = ov.zoneOfCell[cy * ov.w + cx];
          const o = (py * outW + px) * 4;
          if (z === 0) {
            expect(rgba[o + 3]).toBe(0);
            outside++;
          } else {
            const c = zoneColor(z - 1, ov.zones.length);
            expect([rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]]).toEqual([...c, ZONE_ALPHA]);
            inZone++;
          }
        }
      expect(inZone).toBeGreaterThan(0);
      expect(outside).toBeGreaterThan(0); // có trấn / ô chặn / mép không sinh quái
    });
  }

  it("nâng mẫu (ảnh lớn hơn bản đồ, như bản đồ lớn trên màn nét) vẫn đúng loại khu, không rơi về trong suốt", () => {
    const ov = getMapOverview("lac_ha")!;
    const small = zoneRGBA(ov, ov.w, ov.h);
    const big = zoneRGBA(ov, ov.w * 3, ov.h * 3);
    const count = (a: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 3; i < a.length; i += 4) if (a[i] !== 0) n++;
      return n;
    };
    expect(count(big) / count(small)).toBeCloseTo(9, 0); // mỗi ô thành 3x3 điểm ảnh
  });

  it("kích thước ảnh không hợp lệ thì ném lỗi", () => {
    const ov = getMapOverview("lac_ha")!;
    expect(() => zoneRGBA(ov, 0, 10)).toThrow();
    expect(() => zoneRGBA(ov, 10, 1.5)).toThrow();
  });
});

describe("map-render: placeLabels", () => {
  const bounds = { w: 400, h: 400 };
  const req = (key: string, x: number, y: number, prio = 1, w = 60, h = 14, r = 4): LabelReq => ({
    key,
    x,
    y,
    w,
    h,
    r,
    prio,
  });
  const box = (l: { x: number; y: number }, r: LabelReq): Rect => ({
    x: l.x,
    y: l.y,
    w: r.w,
    h: r.h,
  });
  const overlap = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("một nhãn đặt phía trên điểm neo, căn giữa", () => {
    const [p] = placeLabels([req("a", 200, 200)], bounds);
    expect(p.key).toBe("a");
    expect(p.x).toBeCloseTo(200 - 30, 9);
    expect(p.y).toBeLessThan(200);
  });

  it("hai nhãn cùng điểm neo không chồng nhau (nhãn sau chuyển sang dưới / bên cạnh)", () => {
    const rs = [req("a", 200, 200), req("b", 200, 200)];
    const out = placeLabels(rs, bounds);
    expect(out).toHaveLength(2);
    expect(overlap(box(out[0], rs[0]), box(out[1], rs[1]))).toBe(false);
  });

  it("độ ưu tiên cao được đặt trước và giữ chỗ trên: nhãn thấp hơn phải nhường", () => {
    const rs = [req("thap", 200, 200, 1), req("cao", 200, 200, 9)];
    const out = placeLabels(rs, bounds);
    expect(out[0].key).toBe("cao");
    const cao = out.find((p) => p.key === "cao")!;
    expect(cao.y).toBeLessThan(200 - 4); // chỗ đầu tiên (phía trên)
  });

  it("không còn chỗ thì BỎ nhãn ưu tiên thấp, không đè lên nhãn đã đặt", () => {
    // khung chỉ vừa MỘT nhãn: phía trên điểm neo (y 14..28); dưới / trái / phải đều ra ngoài khung
    const tight = { w: 62, h: 40 };
    const rs = [req("a", 30, 30, 5, 60, 14, 0), req("b", 30, 30, 1, 60, 14, 0)];
    const out = placeLabels(rs, tight);
    expect(out.map((p) => p.key)).toEqual(["a"]);
  });

  it("nhãn sát mép trái / phải được kéo vào trong khung", () => {
    const [l] = placeLabels([req("l", 5, 200)], bounds);
    expect(l.x).toBeGreaterThanOrEqual(0);
    const [r] = placeLabels([req("r", 398, 200)], bounds);
    expect(r.x + 60).toBeLessThanOrEqual(400);
  });

  it("tránh vật cản (biểu tượng đã vẽ)", () => {
    const rs = [req("a", 200, 200)];
    const above: Rect = { x: 160, y: 170, w: 80, h: 30 }; // chặn chỗ phía trên
    const [p] = placeLabels(rs, bounds, [above]);
    expect(overlap(box(p, rs[0]), above)).toBe(false);
  });

  it("bản đầy đủ không còn chỗ thì thử bản NGẮN (alts) theo thứ tự; còn chỗ thì dùng bản đầy đủ", () => {
    // cổng sát đáy khung, vật cản chắn dải phía trên: nhãn rộng 300 không vừa ở phía nào, nhãn ngắn 120 vừa bên phải
    const bottom = { w: 400, h: 100 };
    const wall: Rect = { x: 0, y: 60, w: 400, h: 25 };
    const r: LabelReq = { ...req("p", 150, 92, 9, 300, 14, 5), alts: [{ w: 120 }] };
    const [p] = placeLabels([r], bottom, [wall]);
    expect(p.variant).toBe(1);
    expect(p.x + 120).toBeLessThanOrEqual(400);
    expect(p.y + 14).toBeLessThanOrEqual(100);
    // đủ chỗ (không vật cản): bản đầy đủ
    const [q] = placeLabels([r], bottom);
    expect(q.variant).toBe(0);
    // không có bản ngắn: cùng điều kiện thì bỏ nhãn
    expect(placeLabels([{ ...r, alts: undefined }], bottom, [wall])).toEqual([]);
  });

  it("nhãn rộng hơn cả khung bị bỏ (không ném lỗi, không ra ngoài khung)", () => {
    expect(placeLabels([req("rong", 50, 50, 1, 500)], bounds)).toEqual([]);
  });

  it("ngẫu nhiên có hạt giống: không bao giờ chồng nhau hay ra ngoài khung, thứ tự theo ưu tiên", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let round = 0; round < 40; round++) {
      const rs = Array.from({ length: 25 }, (_, i) =>
        req(`n${i}`, rnd() * 400, rnd() * 400, Math.floor(rnd() * 5), 30 + rnd() * 70, 14),
      );
      const out = placeLabels(rs, bounds);
      const byKey = new Map(rs.map((r) => [r.key, r]));
      for (let i = 0; i < out.length; i++) {
        const a = box(out[i], byKey.get(out[i].key)!);
        expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= 400 && a.y + a.h <= 400).toBe(true);
        for (let j = i + 1; j < out.length; j++)
          expect(overlap(a, box(out[j], byKey.get(out[j].key)!))).toBe(false);
      }
      const prios = out.map((p) => byKey.get(p.key)!.prio);
      for (let i = 1; i < prios.length; i++) expect(prios[i]).toBeLessThanOrEqual(prios[i - 1]);
    }
  });
});
