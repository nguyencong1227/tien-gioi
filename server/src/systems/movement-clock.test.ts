// Hàng đợi input theo THỜI GIAN THẬT (mục 25 QUYET_DINH_M3: di chuyển bàn phím giật). Mô phỏng đồng hồ ảo: client gửi đúng 20 Hz,
// máy chủ chạy tick với chu kỳ / độ trễ tuỳ ý (`setInterval(50)` của Node thật ~19,9 Hz), mạng giữ gói rồi ập tới cùng lúc.
// Đo `scripts/do-input-lag.ts` trên máy chủ thật: với "+1 mỗi tick" cũ hàng đợi tụt hậu ~1 input / 12 giây rồi đầy và bỏ input.
import { describe, expect, it } from "vitest";
import { TICK_MS } from "@tien-gioi/shared";
import { makeWorld, addPlayer } from "./test-helpers";
import { MAX_INPUT_BACKLOG, applyInputs, queueInput } from "./movement";
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
  let maxDepthAfter = 0; // độ sâu SAU khi áp (backlog còn lại): mục 41 giữ <= MAX_INPUT_BACKLOG
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
    dropped += applyInputs(w.map, p, c, now - lastTick); // mục 41: input cũ vượt backlog bị bỏ
    maxDepthAfter = Math.max(maxDepthAfter, c.inputs.length);
    lastTick = now;
  }
  return { sent, dropped, maxDepth, maxDepthAfter, depth: c.inputs.length, lastSeq: p.lastSeq };
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

  it("mạng giữ gói 2 giây rồi xả dồn (mục 41): input CŨ vượt ngân sách + backlog 0,25 giây bị BỎ, backlog sau mỗi tick không bao giờ quá MAX_INPUT_BACKLOG, hết dồn ngay (không trôi 2 giây)", () => {
    const r = simulate({ seconds: 60, tickMs: 50, stall: [10_000, 12_000] }); // 40 input dồn
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.maxDepthAfter).toBeLessThanOrEqual(MAX_INPUT_BACKLOG);
    expect(r.depth).toBeLessThanOrEqual(MAX_INPUT_BACKLOG); // backlog còn lại LUÔN <= 0,25 giây (hết dồn 2 giây)
    // đã bỏ khoảng 25 / 40 (ngân sách 10 + backlog 5 được giữ): không áp lại cả 2 giây đã trễ
    expect(r.dropped).toBeGreaterThanOrEqual(20);
    expect(r.dropped).toBeLessThanOrEqual(30);
  });

  it("mạng giữ gói 4 giây: vẫn bị chặn (không phình bộ nhớ): hàng đợi lúc nhận <= 64, backlog sau áp <= MAX_INPUT_BACKLOG", () => {
    const r = simulate({ seconds: 60, tickMs: 50, stall: [10_000, 14_000] }); // 80 input dồn
    expect(r.dropped).toBeGreaterThan(40);
    expect(r.maxDepth).toBeLessThanOrEqual(64);
    expect(r.maxDepthAfter).toBeLessThanOrEqual(MAX_INPUT_BACKLOG);
  });

  /**
   * Bộ đo số BƯỚC đã áp: đã gửi - đã bỏ (lúc nhận + lúc áp) - còn chờ. Không đo bằng quãng đường (nhân vật có thể bị bản đồ chặn). Mọi input đều phải
   * thuộc đúng MỘT trong ba nhóm: đã áp / đã bỏ / còn chờ.
   */
  function rig() {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    let pushed = 0;
    let dropAtApply = 0;
    return {
      w,
      p,
      c,
      push(dy: number, seq = pushed + 1) {
        queueInput(w, "a", { seq, dx: 0, dy });
        pushed++;
      },
      apply(dtMs: number = TICK_MS) {
        dropAtApply += applyInputs(w.map, p, c, dtMs);
      },
      get dropped() {
        return w.inputStats.dropped + dropAtApply;
      },
      get applied() {
        return pushed - w.inputStats.dropped - dropAtApply - c.inputs.length;
      },
    };
  }

  it("chống chạy nhanh: đứng im rồi gửi dồn 200 input cùng lúc chỉ đi được ngân sách tối đa, sau đó đúng 1 bước / TICK_MS (mục 41: phần cũ vượt backlog bị bỏ)", () => {
    const r = rig();
    for (let i = 0; i < 400; i++) r.apply(); // đứng im 20 giây: ngân sách đầy
    for (let seq = 1; seq <= 200; seq++) r.push(1, seq);
    expect(r.c.inputs.length).toBe(64); // chặn cứng lúc nhận
    r.apply();
    const burst = r.applied;
    expect(burst).toBeGreaterThanOrEqual(1);
    expect(burst).toBeLessThanOrEqual(10); // tối đa 10 bước dồn (ngân sách), KHÔNG phải cả hàng đợi
    expect(r.c.inputs.length).toBeLessThanOrEqual(MAX_INPUT_BACKLOG);
    // sau đó bền vững: không quá 1 bước mỗi 50 ms thời gian thật (chỉ còn <= 5 input chờ)
    for (let i = 0; i < 20; i++) r.apply();
    expect(r.applied - burst).toBeLessThanOrEqual(MAX_INPUT_BACKLOG);
    expect(r.c.inputs.length).toBe(0);
    expect(r.applied + r.dropped).toBe(200);
  });

  it("chống chạy nhanh theo thời gian THẬT: client gửi 40 Hz (gấp đôi) trong 1 giây chỉ áp được ~20 bước, dư bị bỏ chứ không đi nhanh hơn", () => {
    const r = rig();
    r.c.moveBudget = 0;
    for (let i = 0; i < 40; i++) {
      r.push(1); // mỗi tick 25 ms: gửi 1 input (40 Hz) rồi áp với dt 25 ms
      r.apply(TICK_MS / 2);
    }
    expect(r.applied).toBeLessThanOrEqual(20); // 1 giây thật = tối đa 20 bước
    expect(r.applied).toBeGreaterThanOrEqual(19);
    expect(r.applied + r.dropped + r.c.inputs.length).toBe(40); // không mất dấu input nào: áp / bỏ / còn chờ
    expect(r.c.inputs.length).toBeLessThanOrEqual(MAX_INPUT_BACKLOG);
  });

  it("dt sai không phá ngân sách: NaN / âm coi như một tick đúng nhịp (1 bước); dt khổng lồ bị chặn ở mức tối đa (10 bước)", () => {
    for (const bad of [Number.NaN, -500, Number.POSITIVE_INFINITY]) {
      const r = rig();
      r.c.moveBudget = 0;
      for (let seq = 1; seq <= 50; seq++) r.push(1, seq);
      r.apply(bad);
      expect(r.applied).toBe(1);
    }
    const r = rig();
    for (let seq = 1; seq <= 40; seq++) r.push(1, seq);
    r.apply(3_600_000); // máy chủ treo cả giờ
    expect(r.applied).toBe(10);
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
