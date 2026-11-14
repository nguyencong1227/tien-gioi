import { describe, expect, it } from "vitest";
import { TelegraphLayer, WARN_DEPTH, BOLT_DEPTH_OFFSET } from "./telegraph-layer";
import { WARN_FADE_MS, BOLT_FADE_MS, type BoltMsg, type WarnMsg } from "./telegraph";

/** Graphics giả: ghi lại trạng thái và số lệnh vẽ, dây chuyền như Phaser. */
class FakeG {
  x = 0;
  y = 0;
  depth = 0;
  alpha = 1;
  visible = true;
  destroyed = false;
  clears = 0;
  calls: string[] = [];
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setDepth(d: number) {
    this.depth = d;
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  clear() {
    this.clears++;
    this.calls.length = 0;
    return this;
  }
  fillStyle() {
    return this;
  }
  lineStyle() {
    return this;
  }
  fillCircle() {
    this.calls.push("fillCircle");
    return this;
  }
  strokeCircle() {
    this.calls.push("strokeCircle");
    return this;
  }
  fillPoints(_p: unknown, _a?: boolean, _b?: boolean, n?: number) {
    this.calls.push(`fillPoints:${n}`);
    return this;
  }
  strokePoints(_p: unknown, _a?: boolean, _b?: boolean, n?: number) {
    this.calls.push(`strokePoints:${n}`);
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function make(budget = 24, view = { value: true }) {
  const me = { value: null as { x: number; y: number; r: number } | null };
  const dangers: number[] = [];
  const made: FakeG[] = [];
  const scene = {
    add: {
      graphics: () => {
        const g = new FakeG();
        made.push(g);
        return g;
      },
    },
  };
  const reduced = { value: false };
  const b = { value: budget };
  const layer = new TelegraphLayer(scene as never, {
    emitterBudget: () => b.value,
    reduced: () => reduced.value,
    inView: () => view.value,
    player: () => me.value,
    onDanger: () => void dangers.push(1),
  });
  return { layer, made, budget: b, reduced, view, me, dangers };
}

const warn = (o: Partial<WarnMsg> = {}): WarnMsg =>
  ({ kind: "warn", shape: "circle", x: 100, y: 200, r: 60, ms: 800, ...o }) as WarnMsg;
const bolt = (o: Partial<BoltMsg> = {}): BoltMsg =>
  ({ kind: "bolt", x: 100, y: 200, angle: 0, speed: 300, range: 450, ...o }) as BoltMsg;

describe("TelegraphLayer: vùng báo trước", () => {
  it("nhận tin hợp lệ: đặt đúng vị trí, nằm DƯỚI mọi thực thể (độ sâu âm), có vẽ", () => {
    const { layer, made } = make();
    expect(layer.warn(warn({ x: 321, y: 654 }), 1000)).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ x: 321, y: 654, depth: WARN_DEPTH, visible: true });
    expect(WARN_DEPTH).toBeLessThan(0);
    expect(layer.stats()).toMatchObject({ warns: 1, spawnedWarns: 1, drawnWarns: 0, rejected: 0 });
    layer.update(1000);
    expect(layer.stats().drawnWarns).toBe(1);
  });

  it("circle vẽ hình tròn; cone / line vẽ đa giác với đúng số đỉnh", () => {
    const { layer, made } = make(24); // bậc Cao: 12 đoạn cung
    layer.warn(warn({ shape: "circle" }), 0);
    layer.warn(warn({ shape: "cone", angle: 0, arc: 1 }), 0);
    layer.warn(warn({ shape: "line", angle: 0, w: 30 }), 0);
    layer.update(400);
    expect(made[0].calls).toEqual(["fillCircle", "strokeCircle"]);
    expect(made[1].calls).toEqual(["fillPoints:14", "strokePoints:14"]); // tâm + 13 điểm cung
    expect(made[2].calls).toEqual(["fillPoints:4", "strokePoints:4"]);
  });

  it("bậc Thấp vẽ cung thô hơn bậc Cao", () => {
    const hi = make(24);
    const lo = make(4);
    hi.layer.warn(warn({ shape: "cone" }), 0);
    lo.layer.warn(warn({ shape: "cone" }), 0);
    hi.layer.update(100);
    lo.layer.update(100);
    const verts = (g: FakeG) => Number(g.calls[0].split(":")[1]);
    expect(verts(lo.made[0])).toBeLessThan(verts(hi.made[0]));
  });

  it("hết ms + WARN_FADE_MS thì biến mất và Graphics về pool (tái dùng, không tạo mới)", () => {
    const { layer, made } = make();
    layer.warn(warn({ ms: 500 }), 1000);
    layer.update(1000 + 500 + WARN_FADE_MS - 1);
    expect(layer.stats().warns).toBe(1);
    layer.update(1000 + 500 + WARN_FADE_MS);
    expect(layer.stats().warns).toBe(0);
    expect(made[0].visible).toBe(false);
    layer.warn(warn(), 5000);
    expect(made).toHaveLength(1); // dùng lại Graphics cũ
    expect(layer.stats().graphics).toBe(1);
  });

  it("tin hỏng bị bỏ và đếm, không ném lỗi, không tạo Graphics", () => {
    const { layer, made } = make();
    expect(layer.warn(warn({ r: NaN }), 0)).toBe(false);
    expect(layer.warn(warn({ shape: "x" as never }), 0)).toBe(false);
    expect(layer.warn(undefined as never, 0)).toBe(false);
    expect(made).toHaveLength(0);
    expect(layer.stats()).toMatchObject({ warns: 0, rejected: 3 });
  });

  it("vượt trần của bậc: KHÔNG bỏ tin mới, tái dùng cái sắp đáp nhất", () => {
    const { layer, made } = make(4); // Thấp: trần 4
    layer.warn(warn({ x: 1, ms: 3000 }), 0); // đáp lúc 3000
    layer.warn(warn({ x: 2, ms: 500 }), 0); // đáp lúc 500: sắp nhất
    layer.warn(warn({ x: 3, ms: 2000 }), 0);
    layer.warn(warn({ x: 4, ms: 1500 }), 0);
    expect(layer.stats()).toMatchObject({ warns: 4, recycledWarns: 0 });
    layer.warn(warn({ x: 99, ms: 800 }), 100);
    expect(layer.stats()).toMatchObject({ warns: 4, recycledWarns: 1, peakWarns: 4 });
    expect(made).toHaveLength(4); // không tạo thêm Graphics
    const xs = layer
      .snapshot(100)
      .warns.map((w) => w.x)
      .sort((a, b) => a - b);
    expect(xs).toEqual([1, 3, 4, 99]); // x = 2 (sắp đáp nhất) bị thay
  });

  it("ngoài khung nhìn: ẩn và không vẽ; vào lại khung thì vẽ lại", () => {
    const { layer, made, view } = make();
    layer.warn(warn(), 0);
    view.value = false;
    const clears = made[0].clears;
    layer.update(100);
    expect(made[0].visible).toBe(false);
    expect(made[0].clears).toBe(clears); // không tốn lệnh vẽ
    expect(layer.stats()).toMatchObject({ warns: 1, drawnWarns: 0 });
    view.value = true;
    layer.update(200);
    expect(made[0].visible).toBe(true);
    expect(layer.stats().drawnWarns).toBe(1);
  });

  it("snapshot: tiến độ tăng theo thời gian theo đồng hồ cảnh", () => {
    const { layer } = make();
    layer.warn(warn({ ms: 1000 }), 5000);
    expect(layer.snapshot(5000).warns[0].progress).toBe(0);
    expect(layer.snapshot(5500).warns[0].progress).toBeCloseTo(0.5);
    expect(layer.snapshot(7000).warns[0].progress).toBe(1);
  });
});

describe("TelegraphLayer: đạn", () => {
  it("vị trí đạn theo đồng hồ cảnh: speed px/giây theo hướng angle, dừng ở cuối tầm", () => {
    const { layer, made } = make();
    layer.bolt(bolt({ x: 100, y: 200, angle: 0, speed: 300, range: 450 }), 2000);
    expect(made[0]).toMatchObject({ x: 100, y: 200 });
    layer.update(2500); // 0,5 giây -> 150 px
    expect(made[0].x).toBeCloseTo(250);
    expect(made[0].y).toBeCloseTo(200);
    expect(made[0].depth).toBeCloseTo(200 + BOLT_DEPTH_OFFSET);
    layer.update(3500); // hết tầm (1500 ms) -> 450 px
    expect(made[0].x).toBeCloseTo(550);
    expect(layer.snapshot(2500).bolts[0].travelled).toBeCloseTo(150);
  });

  it("bay hết tầm rồi mờ trong BOLT_FADE_MS và biến mất; Graphics về pool", () => {
    const { layer, made } = make();
    layer.bolt(bolt(), 0); // bay 1500 ms
    layer.update(1500 + BOLT_FADE_MS / 2);
    expect(layer.stats().bolts).toBe(1);
    expect(made[0].alpha).toBeCloseTo(0.5);
    layer.update(1500 + BOLT_FADE_MS);
    expect(layer.stats().bolts).toBe(0);
    expect(made[0].visible).toBe(false);
    layer.bolt(bolt(), 9000);
    expect(made).toHaveLength(1);
  });

  it("vượt trần: tái dùng viên bay lâu nhất, không tạo thêm Graphics", () => {
    const { layer, made } = make(4); // Thấp: trần 8 đạn
    for (let i = 0; i < 8; i++) layer.bolt(bolt({ x: i }), i * 10);
    expect(layer.stats()).toMatchObject({ bolts: 8, recycledBolts: 0 });
    layer.bolt(bolt({ x: 999 }), 100);
    expect(layer.stats()).toMatchObject({ bolts: 8, recycledBolts: 1, peakBolts: 8 });
    expect(made).toHaveLength(8);
    const xs = layer.snapshot(100).bolts.map((b) => Math.round(b.x - b.travelled));
    expect(xs).not.toContain(0); // viên đầu tiên (bắn lúc 0) bị thay
    expect(xs).toContain(999);
  });

  it("tin hỏng bị bỏ", () => {
    const { layer, made } = make();
    expect(layer.bolt(bolt({ speed: NaN }), 0)).toBe(false);
    expect(layer.bolt(bolt({ range: -1 }), 0)).toBe(false);
    expect(made).toHaveLength(0);
    expect(layer.stats().rejected).toBe(2);
  });

  it("bậc Thấp vẽ ít lệnh hơn bậc Cao (không quầng sáng, không vệt đuôi)", () => {
    const hi = make(24);
    const lo = make(4);
    for (const m of [hi, lo]) {
      m.layer.bolt(bolt({ speed: 100 }), 0);
      m.layer.update(1000); // đã bay 100 px: vệt đuôi có chỗ
    }
    const circles = (g: FakeG) => g.calls.filter((c) => c === "fillCircle").length;
    expect(circles(lo.made[0])).toBe(2); // lõi + chấm trắng
    expect(circles(hi.made[0])).toBeGreaterThan(circles(lo.made[0]));
  });

  it("ngoài khung nhìn: ẩn, không vẽ", () => {
    const { layer, made, view } = make();
    view.value = false;
    layer.bolt(bolt(), 0);
    expect(made[0].visible).toBe(false);
    expect(layer.stats().drawnBolts).toBe(0);
  });
});

describe("TelegraphLayer: dọn", () => {
  it("clear trả hết về pool và ẩn; dùng lại không tạo Graphics mới", () => {
    const { layer, made } = make();
    layer.warn(warn(), 0);
    layer.bolt(bolt(), 0);
    layer.clear();
    expect(layer.stats()).toMatchObject({ warns: 0, bolts: 0 });
    expect(made.every((g) => !g.visible)).toBe(true);
    layer.warn(warn(), 0);
    layer.bolt(bolt(), 0);
    expect(made).toHaveLength(2);
  });

  it("destroy huỷ mọi Graphics", () => {
    const { layer, made } = make();
    layer.warn(warn(), 0);
    layer.bolt(bolt(), 0);
    layer.destroy();
    expect(made.every((g) => g.destroyed)).toBe(true);
    expect(layer.stats()).toMatchObject({ warns: 0, bolts: 0 });
  });

  it("không rò: 500 vòng bắn / hết hạn chỉ dùng tối đa số Graphics bằng đỉnh đồng thời", () => {
    const { layer, made } = make(24);
    let now = 0;
    for (let i = 0; i < 500; i++) {
      layer.warn(warn({ ms: 200 }), now);
      layer.bolt(bolt({ speed: 1000, range: 100 }), now);
      now += 50;
      layer.update(now);
    }
    const s = layer.stats();
    expect(made.length).toBe(s.graphics);
    expect(s.graphics).toBeLessThanOrEqual(s.peakWarns + s.peakBolts);
    expect(s.graphics).toBeLessThan(20);
  });
});

describe("TelegraphLayer: báo động khi mình đứng trong vùng", () => {
  it("vào vùng thì báo MỘT lần (không lặp mỗi khung), snapshot đánh dấu danger", () => {
    const { layer, me, dangers } = make();
    me.value = { x: 100, y: 200, r: 14 };
    layer.warn(warn({ shape: "circle", x: 100, y: 200, r: 60, ms: 800 }), 0);
    layer.update(100);
    layer.update(150);
    layer.update(200);
    expect(dangers).toHaveLength(1);
    expect(layer.stats().dangerAlerts).toBe(1);
    expect(layer.snapshot(200).warns[0].danger).toBe(true);
  });

  it("ngoài vùng: không báo, danger false; bước vào giữa chừng thì báo lúc đó; bước ra thì danger tắt nhưng không báo lại khi vào lần nữa", () => {
    const { layer, me, dangers } = make();
    me.value = { x: 1000, y: 1000, r: 14 };
    layer.warn(warn({ shape: "circle", x: 100, y: 200, r: 60, ms: 800 }), 0);
    layer.update(100);
    expect(dangers).toHaveLength(0);
    expect(layer.snapshot(100).warns[0].danger).toBe(false);
    me.value = { x: 110, y: 200, r: 14 };
    layer.update(300);
    expect(dangers).toHaveLength(1);
    me.value = { x: 1000, y: 1000, r: 14 };
    layer.update(400);
    expect(layer.snapshot(400).warns[0].danger).toBe(false);
    me.value = { x: 110, y: 200, r: 14 };
    layer.update(500);
    expect(dangers).toHaveLength(1); // đã báo cho vùng này rồi
  });

  it("đòn đã đáp (hết ms) thì KHÔNG báo nữa: lúc đó vô nghĩa", () => {
    const { layer, me, dangers } = make();
    me.value = { x: 1000, y: 1000, r: 14 };
    layer.warn(warn({ shape: "circle", x: 100, y: 200, r: 60, ms: 500 }), 0);
    layer.update(100);
    me.value = { x: 100, y: 200, r: 14 };
    layer.update(520); // trong khoảng mờ sau ms
    expect(dangers).toHaveLength(0);
    expect(layer.snapshot(520).warns[0].danger).toBe(false);
  });

  it("mỗi vùng báo một lần: hai vùng bao lấy mình thì hai lần; vùng mới tái dùng Graphics báo lại từ đầu", () => {
    const { layer, me, dangers } = make(4); // trần 4 vùng
    me.value = { x: 100, y: 200, r: 14 };
    layer.warn(warn({ x: 100, y: 200, r: 60, ms: 3000 }), 0);
    layer.warn(warn({ x: 110, y: 200, r: 60, ms: 3000 }), 0);
    layer.update(50);
    expect(dangers).toHaveLength(2);
    for (let i = 0; i < 4; i++) layer.warn(warn({ x: 105, y: 200, r: 60, ms: 3000 }), 60 + i);
    layer.update(100);
    expect(dangers).toHaveLength(6); // 2 vùng đầu + 4 vùng mới (hai trong số đó TÁI DÙNG Graphics của vùng cũ) đều báo
    expect(layer.stats().dangerAlerts).toBe(dangers.length);
  });

  it("không có người chơi (null) hoặc ngoài khung nhìn: không báo", () => {
    const { layer, me, dangers, view } = make();
    layer.warn(warn({ x: 100, y: 200, r: 60 }), 0);
    layer.update(100); // me null
    expect(dangers).toHaveLength(0);
    me.value = { x: 100, y: 200, r: 14 };
    view.value = false;
    layer.update(200); // không vẽ nên không đánh giá
    expect(dangers).toHaveLength(0);
  });
});
