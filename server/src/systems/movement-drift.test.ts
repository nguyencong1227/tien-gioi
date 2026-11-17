// "Trôi như liệt phím" (mục 41 QUYET_DINH_M3): mạng nhà đứng rồi xả dồn làm hàng đợi input đầy input CŨ, máy chủ cứ áp hết nên nhân vật đi tiếp tới ~3 giây SAU
// KHI người chơi nhả phím. Sửa: backlog <= MAX_INPUT_BACKLOG (0,25 giây, input cũ nhất bị bỏ), input DỪNG cắt hàng đợi, token bucket thời gian thật giữ nguyên.
// Mô phỏng bằng đồng hồ ảo: client gửi 20 Hz đúng như `WorldScene` (giữ phím: dx = 1; nhả phím: 3 input dừng seq liên tiếp cách nhau 50 ms, hợp đồng với phần client của
// B); mạng giữ gói trong một khoảng rồi giao dồn theo đúng thứ tự (TCP); máy chủ chạy `tickWorld` mỗi 50 ms.
import { describe, expect, it } from "vitest";
import { TICK_MS } from "@tien-gioi/shared";
import { makeWorld, addPlayer } from "./test-helpers";
import { MAX_INPUT_BACKLOG, STOP_KEEP_INPUTS, applyInputs, queueInput } from "./movement";
import { tickWorld } from "./tick";

interface Pkt {
  /** thời điểm gửi (ms, đồng hồ client) */
  sent: number;
  seq: number;
  dx: number;
}

interface Run {
  /** x của người chơi trên máy chủ sau mỗi tick (ms đồng hồ máy chủ -> x) */
  trace: { t: number; x: number }[];
  /** thời điểm các gói giao tới máy chủ */
  arrivedAt: number;
  w: ReturnType<typeof makeWorld>["w"];
  lastSeq: number;
}

/**
 * Chạy một kịch bản: client giữ phím từ 0 tới `release` ms (gửi dx = 1 mỗi 50 ms); từ `release` gửi `stops` input dừng (seq liên tiếp, cách 50 ms) rồi im lặng (client mới),
 * hoặc không gửi gì (client cũ, `stops = 0`). Mạng giữ mọi gói gửi trong [stall[0], stall[1]) và giao dồn tại stall[1]. Tổng thời gian `end` ms.
 */
function run(o: {
  release: number;
  stops: number;
  stall?: [number, number];
  end?: number;
  startX?: number;
}): Run {
  const { w } = makeWorld();
  const { p } = addPlayer(w, "a");
  if (o.startX !== undefined) p.x = o.startX;
  const pkts: Pkt[] = [];
  let seq = 0;
  for (let t = 0; t < o.release; t += TICK_MS) pkts.push({ sent: t, seq: ++seq, dx: 1 });
  for (let i = 0; i < o.stops; i++) pkts.push({ sent: o.release + i * TICK_MS, seq: ++seq, dx: 0 });
  const arrive = (k: Pkt) =>
    o.stall && k.sent >= o.stall[0] && k.sent < o.stall[1] ? o.stall[1] : k.sent;
  const queue = pkts
    .map((k) => ({ ...k, at: arrive(k) }))
    .sort((a, b) => a.at - b.at || a.seq - b.seq);
  let next = 0;
  const trace: { t: number; x: number }[] = [];
  const end = o.end ?? o.release + 4_000;
  for (let t = 0; t <= end; t += TICK_MS) {
    while (next < queue.length && queue[next].at <= t) {
      const k = queue[next++];
      queueInput(w, "a", { seq: k.seq, dx: k.dx, dy: 0 });
    }
    tickWorld(w, TICK_MS);
    trace.push({ t, x: p.x });
  }
  return { trace, arrivedAt: o.stall ? o.stall[1] : o.release, w, lastSeq: p.lastSeq };
}

/** Thời điểm (ms) máy chủ ĐỨNG YÊN hẳn: tick đầu tiên mà từ đó vị trí không đổi nữa. */
function settledAt(r: Run): number {
  let i = r.trace.length - 1;
  while (i > 0 && r.trace[i - 1]!.x === r.trace[i]!.x) i--;
  return r.trace[i]!.t;
}

describe("trôi như liệt phím (mục 41): mạng đứng rồi xả dồn khi đang giữ phím, nhả phím", () => {
  it("TRƯỚC KHI SỬA sẽ trôi ~2 giây; nay: mạng đứng 2 giây, nhả phím, 3 input dừng: máy chủ dừng trong <= 0,3 giây sau khi gói tới", () => {
    const r = run({ release: 4_000, stops: 3, stall: [2_000, 4_150] });
    expect(settledAt(r) - r.arrivedAt).toBeLessThanOrEqual(300);
    // và lastSeq = seq của input dừng cuối: client bỏ hết pending cũ, không kéo lại đoạn đã đoán
    const sentTotal = Math.ceil(4_000 / TICK_MS) + 3;
    expect(r.lastSeq).toBe(sentTotal);
  });

  it("client CŨ (không gửi input dừng) cũng không trôi quá 0,25 giây: backlog bị cắt còn <= MAX_INPUT_BACKLOG", () => {
    const r = run({ release: 4_000, stops: 0, stall: [2_000, 4_000] });
    expect(settledAt(r) - r.arrivedAt).toBeLessThanOrEqual(MAX_INPUT_BACKLOG * TICK_MS + TICK_MS);
  });

  it("mạng đứng 3 giây rồi xả 60 input: vẫn dừng <= 0,3 giây (trước đây còn đi tiếp cả 3 giây)", () => {
    const r = run({ release: 4_000, stops: 3, stall: [1_000, 4_150] });
    expect(settledAt(r) - r.arrivedAt).toBeLessThanOrEqual(300);
  });

  it("quãng đường đi THÊM sau khi gói dồn tới bị chặn bởi ngân sách bước (<= 10 bước) + backlog (<= 5): không bao giờ đi cả đợt dồn", () => {
    const r = run({ release: 4_000, stops: 0, stall: [2_000, 4_000], startX: 400 });
    const atArrival = r.trace.find((e) => e.t === r.arrivedAt - TICK_MS)!.x;
    const final = r.trace[r.trace.length - 1]!.x;
    const stepPx = 7.5;
    expect(final - atArrival).toBeLessThanOrEqual((10 + MAX_INPUT_BACKLOG + 1) * stepPx + 1e-6);
    // đợt dồn là 40 bước: nếu áp hết thì đã đi >= 300 px
    expect(final - atArrival).toBeLessThan(40 * stepPx);
  });

  it("mạng TỐT (không đứng): nhả phím thì dừng trong <= (STOP_KEEP_INPUTS + 1) tick; hàng đợi bình thường 1-2 input KHÔNG bị bỏ (không giật lùi vô cớ)", () => {
    const r = run({ release: 3_000, stops: 3 });
    expect(settledAt(r) - 3_000).toBeLessThanOrEqual((STOP_KEEP_INPUTS + 1) * TICK_MS);
    expect(r.w.inputStats.dropped).toBe(0);
  });

  it("đang đi liên tục 60 giây trên mạng tốt: không input nào bị bỏ, không tụt hậu (đi bình thường không bị ảnh hưởng)", () => {
    const r = run({ release: 60_000, stops: 3, end: 61_000 });
    expect(r.w.inputStats.dropped).toBe(0);
    expect(r.w.inputStats.backlogTicks).toBe(0);
  });
});

describe("input dừng cắt hàng đợi (queueInput)", () => {
  function rig(n: number) {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.moveBudget = 0;
    for (let seq = 1; seq <= n; seq++) queueInput(w, "a", { seq, dx: 1, dy: 0 });
    return { w, p, c };
  }

  it("hàng đợi 30 input rồi input dừng: còn đúng STOP_KEEP_INPUTS input CŨ NHẤT (giữ thứ tự) + input dừng; số input bỏ được đếm", () => {
    const { w, c } = rig(30);
    queueInput(w, "a", { seq: 31, dx: 0, dy: 0 });
    expect(c.inputs.map((i) => i.seq)).toEqual([1, 2, 31]);
    expect(w.inputStats.dropped).toBe(30 - STOP_KEEP_INPUTS);
  });

  it("hàng đợi ngắn (<= STOP_KEEP_INPUTS) thì input dừng KHÔNG bỏ gì: 1-2 input đang bay vẫn được áp (client đã đoán trước)", () => {
    for (const n of [0, 1, STOP_KEEP_INPUTS]) {
      const { w, c } = rig(n);
      queueInput(w, "a", { seq: 99, dx: 0, dy: 0 });
      expect(c.inputs).toHaveLength(n + 1);
      expect(w.inputStats.dropped).toBe(0);
    }
  });

  it("`dropped` chỉ đếm input DI CHUYỂN bị cắt: input DỪNG thừa bị cắt (tin dừng lặp) không tính (B đo ở #963: 1 bước chờ + 3 tin dừng cùng tick từng cho dropped = 1)", () => {
    // 1 bước chờ + 3 tin dừng: tin dừng thứ ba cắt tin dừng thứ hai: KHÔNG bước di chuyển nào bị bỏ
    {
      const { w } = rig(1);
      for (const seq of [2, 3, 4]) queueInput(w, "a", { seq, dx: 0, dy: 0 });
      expect(w.inputStats.dropped).toBe(0);
    }
    // chỉ tin dừng, nhiều lần: không bỏ gì tính vào dropped
    {
      const { w } = rig(0);
      for (let seq = 1; seq <= 10; seq++) queueInput(w, "a", { seq, dx: 0, dy: 0 });
      expect(w.inputStats.dropped).toBe(0);
    }
    // 5 bước + 3 tin dừng: tin dừng đầu cắt 3 bước di chuyển (còn 2), hai tin dừng sau chỉ cắt tin dừng: đúng 3 bước bị bỏ
    {
      const { w, c } = rig(5);
      for (const seq of [6, 7, 8]) queueInput(w, "a", { seq, dx: 0, dy: 0 });
      expect(w.inputStats.dropped).toBe(5 - STOP_KEEP_INPUTS);
      expect(c.inputs.map((i) => i.seq)).toEqual([1, 2, 8]);
    }
  });

  it("ba input dừng liên tiếp (client lặp cho chắc) không làm hỏng: còn <= STOP_KEEP_INPUTS + 1 input, input dừng CUỐI có mặt, seq tăng dần", () => {
    const { w, c } = rig(25);
    for (const seq of [26, 27, 28]) queueInput(w, "a", { seq, dx: 0, dy: 0 });
    const seqs = c.inputs.map((i) => i.seq);
    expect(seqs.length).toBeLessThanOrEqual(STOP_KEEP_INPUTS + 1);
    expect(seqs[seqs.length - 1]).toBe(28);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("ngưỡng dừng khớp applyInputs: hướng rất nhỏ (<= 0,05) là dừng, lớn hơn là di chuyển (không cắt)", () => {
    const a = rig(10);
    queueInput(a.w, "a", { seq: 11, dx: 0.03, dy: 0.03 }); // độ dài 0,042: dừng
    expect(a.c.inputs).toHaveLength(STOP_KEEP_INPUTS + 1);
    const b = rig(10);
    queueInput(b.w, "a", { seq: 11, dx: 0.06, dy: 0 }); // 0,06: vẫn là di chuyển
    expect(b.c.inputs).toHaveLength(11);
  });

  it("sau khi áp: lastSeq = seq của input dừng (client bỏ hết pending cũ), vị trí chỉ đi thêm đúng số input được giữ", () => {
    const { w, p, c } = rig(30);
    const x0 = p.x;
    queueInput(w, "a", { seq: 31, dx: 0, dy: 0 });
    for (let i = 0; i < STOP_KEEP_INPUTS + 3; i++) applyInputs(w.map, p, c, TICK_MS);
    expect(p.lastSeq).toBe(31);
    expect(c.inputs).toHaveLength(0);
    const moved = p.x - x0;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(STOP_KEEP_INPUTS * 7.5 + 1e-6);
  });

  it("CHỐNG CHẠY NHANH: gửi dồn 1000 cặp (đi, dừng, đi, dừng...) trong một nhịp không đi được quá ngân sách bước (10 bước) và không phình hàng đợi", () => {
    const { w, p, c } = rig(0);
    c.moveBudget = 10;
    const x0 = p.x;
    for (let i = 0; i < 1000; i++) {
      queueInput(w, "a", { seq: 2 * i + 1, dx: 1, dy: 0 });
      queueInput(w, "a", { seq: 2 * i + 2, dx: 0, dy: 0 });
      expect(c.inputs.length).toBeLessThanOrEqual(STOP_KEEP_INPUTS + 1);
    }
    applyInputs(w.map, p, c, TICK_MS);
    expect(p.x - x0).toBeLessThanOrEqual(10 * 7.5 + 1e-6);
    // 1000 nhịp tiếp theo mỗi tick 50 ms: tốc độ bền vững vẫn <= 1 bước / tick
    const x1 = p.x;
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 50; i++) queueInput(w, "a", { seq: 5000 + k * 100 + i, dx: 1, dy: 0 });
      applyInputs(w.map, p, c, TICK_MS);
    }
    expect(p.x - x1).toBeLessThanOrEqual(20 * 7.5 + 10 * 7.5 + 1e-6); // 20 tick x 1 bước + ngân sách dồn còn lại
  });
});

describe("bỏ input CŨ NHẤT khi vượt backlog (applyInputs / queueInput)", () => {
  it("gửi 40 input dồn với ngân sách 10: giữ 15 input MỚI NHẤT (thứ tự seq tăng), áp 10 cũ nhất trong số đó, còn 5; bỏ 25 input cũ nhất và trả đúng số đã bỏ", () => {
    const { w, p, c } = (() => {
      const m = makeWorld();
      const a = addPlayer(m.w, "a");
      return { w: m.w, p: a.p, c: a.c };
    })();
    c.moveBudget = 9; // + 1 của tick = 10
    for (let seq = 1; seq <= 40; seq++) queueInput(w, "a", { seq, dx: 0, dy: 1 });
    const dropped = applyInputs(w.map, p, c, TICK_MS);
    expect(dropped).toBe(40 - (10 + MAX_INPUT_BACKLOG));
    expect(p.lastSeq).toBe(26 + 9); // giữ 26..40; áp 26..35
    expect(c.inputs.map((i) => i.seq)).toEqual([36, 37, 38, 39, 40]);
  });

  it("hàng đợi chặn cứng 64 lúc nhận: bỏ input CŨ NHẤT (không phải mới nhất) và đếm vào dropped", () => {
    const { w } = makeWorld();
    const { c } = addPlayer(w, "a");
    for (let seq = 1; seq <= 70; seq++) queueInput(w, "a", { seq, dx: 1, dy: 0 });
    expect(c.inputs).toHaveLength(64);
    expect(c.inputs[0]!.seq).toBe(7);
    expect(c.inputs[63]!.seq).toBe(70);
    expect(w.inputStats.dropped).toBe(6);
  });

  it("đi bình thường (trung bình 20 Hz, thỉnh thoảng một nhịp dồn 2 rồi một nhịp trống): applyInputs không bỏ gì và trả 0", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    let total = 0;
    let seq = 0;
    for (let tick = 1; tick <= 400; tick++) {
      const n = tick % 10 === 0 ? 2 : tick % 10 === 5 ? 0 : 1; // mạng giật nhẹ: có nhịp dồn 2, có nhịp trống
      for (let i = 0; i < n; i++) queueInput(w, "a", { seq: ++seq, dx: 1, dy: 0 });
      total += applyInputs(w.map, p, c, TICK_MS);
    }
    expect(total).toBe(0);
    expect(w.inputStats.dropped).toBe(0);
  });
});
