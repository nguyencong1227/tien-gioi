// Hàng đợi input theo THỜI GIAN THẬT (mục 25 QUYET_DINH_M3: di chuyển bàn phím giật). Mô phỏng đồng hồ ảo: client gửi đúng 20 Hz,
// máy chủ chạy tick với chu kỳ / độ trễ tuỳ ý (`setInterval(50)` của Node thật ~19,9 Hz), mạng giữ gói rồi ập tới cùng lúc.
// Đo `scripts/do-input-lag.ts` trên máy chủ thật: với "+1 mỗi tick" cũ hàng đợi tụt hậu ~1 input / 12 giây rồi đầy và bỏ input.
import { describe, expect, it } from "vitest";
import { TICK_MS } from "@tien-gioi/shared";
import { makeWorld, addPlayer } from "./test-helpers";
import { applyInputs, queueInput } from "./movement";
import { tickWorld } from "./tick";

/** Một lần chạy mô phỏng. Trả số input đã gửi, bị bỏ (hàng đợi đầy), độ sâu hàng đợi lớn nhất / cuối, `lastSeq`. */
function simulate(o: {
  seconds: number;
  /** chu kỳ tick máy chủ (ms) */
  tickMs: number;
  /** độ trễ ngẫu nhiên cộng vào mỗi tick, 0..jitterMs (LCG có seed) */
  jitterMs?: number;
  /** [từ, tới) ms: gói tin gửi trong khoảng này bị mạng giữ rồi tới cùng lúc tại thời điểm `tới` */
  stall?: [number, number];
}) {
  const { w } = makeWorld();
  const { p, c } = addPlayer(w, "a");
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const total = Math.floor((o.seconds * 1000) / TICK_MS);
  let sent = 0;
  let dropped = 0;
  let maxDepth = 0;
  // sự kiện đến máy chủ: (thời điểm đến, seq, dx)
  const arrivals: { at: number; seq: number; dx: number }[] = [];
  for (let n = 0; n < total; n++) {
    const t = n * TICK_MS;
    const at = o.stall && t >= o.stall[0] && t < o.stall[1] ? o.stall[1] : t;
    arrivals.push({ at, seq: ++sent, dx: Math.floor(n / 40) % 2 === 0 ? 1 : -1 });
  }
  arrivals.sort((a, b) => a.at - b.at || a.seq - b.seq);
  let next = 0;
  let now = 0;
  let lastTick = 0;
  const end = o.seconds * 1000;
  while (now < end) {
    now += o.tickMs + (o.jitterMs ? rnd() * o.jitterMs : 0);
    while (next < arrivals.length && arrivals[next].at <= now) {
      const a = arrivals[next++];
      const before = c.inputs.length;
      queueInput(w, "a", { seq: a.seq, dx: a.dx, dy: 0 });
      if (c.inputs.length === before) dropped++;
    }
    maxDepth = Math.max(maxDepth, c.inputs.length);
    applyInputs(w.map, p, c, now - lastTick);
    lastTick = now;
  }
  return { sent, dropped, maxDepth, depth: c.inputs.length, lastSeq: p.lastSeq };
}

describe("hàng đợi input theo thời gian thật", () => {
  it("tick chậm hơn 50 ms (19,8 Hz như Node thật khi bận): 10 phút đi liên tục KHÔNG tụt hậu, không bỏ input", () => {
    const r = simulate({ seconds: 600, tickMs: 50.5 });
    expect(r.dropped).toBe(0);
    expect(r.maxDepth).toBeLessThanOrEqual(3);
    expect(r.sent - r.lastSeq).toBeLessThanOrEqual(4); // chỉ còn phần đang bay / chờ tick kế
  });

  it("tick trễ thất thường (0-30 ms mỗi tick): vẫn không tụt hậu dài hạn", () => {
    const r = simulate({ seconds: 600, tickMs: 50, jitterMs: 30 });
    expect(r.dropped).toBe(0);
    expect(r.depth).toBeLessThanOrEqual(3);
    expect(r.sent - r.lastSeq).toBeLessThanOrEqual(5);
  });

  it("mạng giữ gói 400 ms rồi dồn tới cùng lúc: ngân sách tích trong lúc chờ hấp thụ hết, không còn tụt hậu", () => {
    const r = simulate({ seconds: 60, tickMs: 50, stall: [10_000, 10_400] });
    expect(r.dropped).toBe(0);
    expect(r.depth).toBeLessThanOrEqual(2);
    expect(r.sent - r.lastSeq).toBeLessThanOrEqual(3);
  });

  it("mạng giữ gói 2 giây: không bỏ input nào (hàng đợi chứa được); phần vượt ngân sách xả dần khi người chơi ngừng đi", () => {
    const r = simulate({ seconds: 60, tickMs: 50, stall: [10_000, 12_000] });
    expect(r.dropped).toBe(0);
    expect(r.maxDepth).toBeLessThanOrEqual(60);
  });

  it("mạng giữ gói quá 3 giây: input vượt hàng đợi bị bỏ (đã có giới hạn, không phình bộ nhớ)", () => {
    const r = simulate({ seconds: 60, tickMs: 50, stall: [10_000, 14_000] }); // 80 input dồn
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.maxDepth).toBeLessThanOrEqual(60);
  });

  it("chống chạy nhanh: đứng im rồi gửi dồn 200 input cùng lúc chỉ đi được ngân sách tối đa, sau đó đúng 1 bước / TICK_MS", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    for (let i = 0; i < 400; i++) applyInputs(w.map, p, c, TICK_MS); // đứng im 20 giây: ngân sách đầy
    for (let seq = 1; seq <= 200; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    expect(c.inputs.length).toBe(60); // hàng đợi chặn ở 60 (3 giây)
    applyInputs(w.map, p, c, TICK_MS);
    const burst = p.lastSeq;
    expect(burst).toBeGreaterThanOrEqual(1);
    expect(burst).toBeLessThanOrEqual(11); // tối đa 10 bước dồn + 1 của chính tick này
    for (let i = 0; i < 20; i++) applyInputs(w.map, p, c, TICK_MS);
    expect(p.lastSeq - burst).toBeLessThanOrEqual(20); // bền vững: không quá 1 bước mỗi 50 ms thời gian thật
    expect(p.lastSeq - burst).toBeGreaterThanOrEqual(19);
  });

  it("chống chạy nhanh theo thời gian THẬT: 100 tick ngắn 25 ms chỉ được ~50 bước, không phải 100", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.moveBudget = 0;
    for (let seq = 1; seq <= 40; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    for (let i = 0; i < 40; i++) applyInputs(w.map, p, c, TICK_MS / 2); // 40 tick x 25 ms = 1 giây = 20 bước
    expect(p.lastSeq).toBe(20);
  });

  it("dt sai không phá ngân sách: NaN / âm coi như một tick đúng nhịp; dt khổng lồ bị chặn ở mức tối đa", () => {
    for (const bad of [Number.NaN, -500, Number.POSITIVE_INFINITY]) {
      const { w } = makeWorld();
      const { p, c } = addPlayer(w, "a");
      c.moveBudget = 0;
      for (let seq = 1; seq <= 50; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
      applyInputs(w.map, p, c, bad);
      expect(p.lastSeq).toBe(1);
    }
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    for (let seq = 1; seq <= 40; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    applyInputs(w.map, p, c, 3_600_000); // máy chủ treo cả giờ
    expect(p.lastSeq).toBe(10);
  });

  it("tickWorld truyền thời gian thật của tick xuống hàng đợi: tick trễ 100 ms xử lý được 2 bước (không cố định 1)", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.moveBudget = 0;
    for (let seq = 1; seq <= 5; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    tickWorld(w, 2 * TICK_MS);
    expect(p.lastSeq).toBe(2);
    tickWorld(w, TICK_MS);
    expect(p.lastSeq).toBe(3);
  });

  it("cộng dồn số thực không làm mất bước: 10 tick x 5 ms cộng ra 0,9999999999999999 vẫn đủ một bước (BUDGET_EPS)", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.moveBudget = 0;
    queueInput(w, "a", { seq: 1, dx: 0, dy: 1 });
    for (let i = 0; i < 9; i++) applyInputs(w.map, p, c, 5);
    expect(p.lastSeq).toBe(0); // 0,9 bước: chưa đủ
    applyInputs(w.map, p, c, 5); // 10 x 0,1 = 0,9999999999999999 trong số thực
    expect(p.lastSeq).toBe(1);
  });
});
