// Fuzz bất biến di chuyển (issue #859, sau PR #852 mục 41): chuỗi input ngẫu nhiên (đi / dừng / dồn / trễ)
// KHÔNG được phá tốc độ, hàng đợi, lastSeq. Dựa trên tính chất (seeded, lặp >= 300 kịch bản), KHÔNG hard-code kịch bản.
//
// Ba lớp phủ:
//   A. Move-only (đầu vào chỉ di chuyển, hướng ngẫu nhiên): kiểm ĐỦ mọi bất biến, kể cả bảo toàn input (đếm chính xác),
//      vì mã KHÔNG đếm input dừng thừa bị cắt → chỉ move-only mới có sổ cái cân bằng kín.
//   B. Xen đi/dừng: kiểm ngân sách quãng đường + giới hạn hàng đợi + lastSeq "kể cả gửi xen đi / dừng" (KHÔNG kiểm bảo toàn,
//      vì input dừng thừa bị cắt vô điều kiện KHÔNG tính vào `dropped`).
//   C. Đích: đầu vào sai kiểu bị loại ở cửa; người choáng không di chuyển nhưng vẫn tiêu thụ input + tăng lastSeq.
//   D. Dồn sau nghỉ (nhắm đích): nghỉ nhiều tick để moveBudget tích luỹ rồi dồn một nhịp — bắt M1 (trần ngân sách một tick),
//      vì fuzz ngẫu nhiên hiếm khi nghỉ đủ lâu để budget phình vượt trần.
//
// ĐỘT BIẾN chứng minh có răng (commit mã thật TRƯỚC khi chạy đột biến, `git checkout --` để khôi phục; đã chạy thật):
//   M1 bỏ trần ngân sách (`MAX_MOVE_BUDGET`) trong applyInputs → lớp D (một tick đi > 10 bước) ĐỎ.
//   M2 bỏ cắt backlog trong applyInputs (`c.inputs.splice(0, dropped)`) → `inputs.length <= MAX_INPUT_BACKLOG` (A/B) ĐỎ.
//   M3 bỏ trần cứng 64 trong queueInput (`if (c.inputs.length > INPUT_QUEUE_HARD_CAP)`) → `inputs.length <= 64` (A) ĐỎ.
//   M4 không ghi `p.lastSeq = inp.seq` trong applyInputs → lastSeq KHÔNG tiến khi nuốt input (A) + stunned (C) ĐỎ.
import { describe, expect, it } from "vitest";
import { PLAYER_RADIUS, TICK_MS, statsFor } from "@tien-gioi/shared";
import { MAX_INPUT_BACKLOG, applyInputs, queueInput } from "./movement";
import { seeded } from "../balance/dungeon";
import { makeWorld, addPlayer } from "./test-helpers";

const STEP = TICK_MS / 1000; // px mỗi bước = speed * STEP
const SCENARIOS = 300; // >= 300 như yêu cầu; ticks ngắn (20-64) + assertions gọn để toàn bộ file < 10s

/** Mulberry32 theo seed: hoán `Math.random` trong một kịch bản, khôi phục sau. */
function withSeed<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = seeded(seed);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a; // int trong [a, b]

/**
 * Chạy một kịch bản move-only: mỗi tick enqueue 0..K input di chuyển (hướng ngẫu nhiên, thỉnh thoảng dồn mạnh / nghỉ),
 * rồi `applyInputs` với dt ngẫu nhiên 10-300 ms. Kiểm mọi bất biến SAU từng tick. Trả số tick đã chạy (để log nếu đỏ).
 */
function fuzzMoveOnly(): { ticks: number; dist: number } {
  const { w } = makeWorld();
  const { p, c } = addPlayer(w, "a");
  const map = w.map;
  const speed = statsFor(p.realm, p.tier, p).speed;
  const cap = speed * STEP; // px tối đa mỗi bước áp

  let seq = 0;
  let enqueued = 0; // input hợp lệ đã enqueue (move-only: mọi tin đều hợp lệ)
  let droppedA = 0; // tổng applyInputs trả (input cũ bị cắt theo backlog)
  let applied = 0; // tổng input thực tế đã nuốt (đo từng tick: before - after - dropped, KHÔNG đếm lastSeq phân biệt)
  let prevLastSeq = p.lastSeq;
  let prevX = p.x;
  let prevY = p.y;
  let dist = 0; // quãng đường thực tế đã đi
  let credit = 0; // tổng credit bước đã cấp (= sum(dt)/TICK_MS)
  const budget0 = c.moveBudget; // ngân sách ban đầu: quãng đường bền vững <= (budget0 + credit) bước, CHẶT

  const ticks = ri(20, 48);
  for (let t = 0; t < ticks; t++) {
    // Đầy đủ: thỉnh thoảng dồn 1-500 tin một nhịp; thường 0-6; đôi khi nghỉ (0 tin)
    let n = ri(0, 6);
    if (Math.random() < 0.08) n = ri(1, 500);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2; // hướng bất kỳ
      queueInput(w, "a", { seq: ++seq, dx: Math.cos(a), dy: Math.sin(a) });
      enqueued++;
      // Bất biến lúc nhận: hàng đợi NEVER vượt trần cứng 64
      expect(c.inputs.length, `seq ${seq}: queue > 64 lúc nhận`).toBeLessThanOrEqual(64);
    }
    const dt = Math.random() < 0.85 ? TICK_MS : ri(10, 300); // dt tick ngẫu nhiên 10-300 ms
    credit += dt / TICK_MS;
    const before = c.inputs.length; // đếm số input trước khi áp (để tính chính xác số đã nuốt)
    const dropped = applyInputs(map, p, c, dt);
    droppedA += dropped;
    // Số input thực tế đã nuốt trong tick = vào - còn - bị cắt backlog (before = applied + dropped + after)
    const consumedThisTick = before - c.inputs.length - dropped;
    applied += consumedThisTick;
    // Bất biến sau áp: backlog NEVER vượt MAX_INPUT_BACKLOG
    expect(c.inputs.length, `tick ${t}: backlog > MAX_INPUT_BACKLOG sau áp`).toBeLessThanOrEqual(
      MAX_INPUT_BACKLOG,
    );
    // lastSeq KHÔNG bao giờ lùi (cùng dòng seq tăng dần)
    expect(p.lastSeq, `tick ${t}: lastSeq lùi`).toBeGreaterThanOrEqual(prevLastSeq);
    // lastSeq PHẢI tiến khi đã nuốt input (seq cuối cùng đã áp > prevLastSeq) — chống M4 (KHÔNG ghi lastSeq)
    if (consumedThisTick > 0)
      expect(p.lastSeq, `tick ${t}: nuốt input nhưng lastSeq KHÔNG tiến (M4)`).toBeGreaterThan(
        prevLastSeq,
      );
    prevLastSeq = p.lastSeq;
    // Không bao giờ NaN
    expect(Number.isFinite(p.x) && Number.isFinite(p.y), `tick ${t}: NaN vị trí`).toBe(true);
    // Không ngoài bản đồ (không đứng trên ô chặn)
    expect(map.circleBlocked(p.x, p.y, PLAYER_RADIUS), `tick ${t}: đứng trên ô chặn`).toBe(false);
    // Quãng đường thực tế trong tick này
    const tickDist = Math.hypot(p.x - prevX, p.y - prevY);
    dist += tickDist;
    prevX = p.x;
    prevY = p.y;
    // BẤT BIẾN PER-TICK (chống M1): trần ngân sách MAX_MOVE_BUDGET(=10, KHÔNG export) giới hạn <= 10 bước/tick → <= 10*cap.
    // Bỏ trần thì moveBudget phình theo credit tích luỹ → một tick dồn (dt lớn / hàng trăm tin) đi hàng chục bước → RED ở đây.
    expect(
      tickDist,
      `tick ${t}: một tick đi quá trần ngân sách (MAX_MOVE_BUDGET=10)`,
    ).toBeLessThanOrEqual(10 * cap + 1e-6);
    // Bất biến ngân sách: quãng đường <= (ngân sách dồn tối đa + credit theo thời gian thật) x tốc độ
    const budgetSteps = MAX_INPUT_BACKLOG + MAX_INPUT_BACKLOG + credit + MAX_INPUT_BACKLOG; // nới đủ (xem M1)
    expect(dist, `tick ${t}: đi nhanh hơn ngân sách`).toBeLessThanOrEqual(budgetSteps * cap + cap);
    // CHẶT (B, review #1268): tổng bước đã đi <= ngân sách đầu + tổng credit theo thời gian thật (ngân sách chỉ bị trần cắt bớt, KHÔNG bao giờ được cộng thêm): bắt cả speed hack bền vững 20 %
    expect(dist, `tick ${t}: vượt (ngân sách đầu + credit) thời gian thật`).toBeLessThanOrEqual(
      (budget0 + credit) * cap + 1e-6,
    );
  }
  // Bảo toàn input: đã enqueue = đã áp + đã bỏ (queueInput) + đã bỏ (applyInputs) + còn chờ — KHÔNG mất dấu
  const pending = c.inputs.length;
  const droppedQ = w.inputStats.dropped;
  expect(
    applied + droppedQ + droppedA + pending,
    `bảo toàn input: ${applied}+${droppedQ}+${droppedA}+${pending} != ${enqueued}`,
  ).toBe(enqueued);
  return { ticks, dist };
}

describe("Fuzz bất biến di chuyển (issue #859): input ngẫu nhiên không phá tốc độ / hàng đợi / lastSeq", () => {
  it("move-only: >= 300 kịch bản seeded, mọi bất biến giữ (ngân sách, backlog, trần 64, lastSeq, bảo toàn, không NaN)", () => {
    let minTicks = Infinity;
    let totalDist = 0;
    for (let seed = 1; seed <= SCENARIOS; seed++) {
      const { ticks, dist } = withSeed(seed, () => fuzzMoveOnly());
      minTicks = Math.min(minTicks, ticks);
      totalDist += dist;
    }
    // Đo thật (ghi vào PR): trung bình ~N px/kịch bản, min ticks = M
    expect(minTicks).toBeGreaterThan(0);
    expect(totalDist).toBeGreaterThan(0);
  });
});

/**
 * Nghỉ N tick (KHÔNG input) để moveBudget tích luỹ, rồi dồn một nhịp nhiều tin. Đây là ca xấu nhất của trần ngân sách:
 * có trần (MAX_MOVE_BUDGET=10) thì một tick chỉ nuốt <= 10 bước dù đã nghỉ lâu; KHÔNG trần (M1) thì nuốt cả budget tích luỹ
 * (4 + N credit) → đi nhanh hơn trần một tick → RED. Fuzz ngẫu nhiên hiếm khi nghỉ đủ lâu nên cần ca nhắm đích này.
 */
function restThenBurst(restTicks: number, burst: number): { tickSteps: number; cap: number } {
  const { w } = makeWorld();
  const { p, c } = addPlayer(w, "a");
  const map = w.map;
  const cap = statsFor(p.realm, p.tier, p).speed * STEP;
  for (let t = 0; t < restTicks; t++) applyInputs(map, p, c, TICK_MS); // nghỉ: tích luỹ budget, KHÔNG di chuyển
  let seq = 0;
  for (let i = 0; i < burst; i++) queueInput(w, "a", { seq: ++seq, dx: 1, dy: 0 });
  const x0 = p.x,
    y0 = p.y;
  applyInputs(map, p, c, TICK_MS);
  const tickSteps = Math.hypot(p.x - x0, p.y - y0) / cap; // số bước thực tế một tick
  return { tickSteps, cap };
}

describe("Fuzz bất biến di chuyển (issue #859): dồn sau khi nghỉ — trần ngân sách một tick (bắt M1)", () => {
  it("nghỉ 20 tick rồi dồn 60 tin: một tick KHÔNG đi quá ~10 bước (MAX_MOVE_BUDGET)", () => {
    // Nghỉ 20 tick → credit tích luỹ 20 bước. Có trần: budget chặn ở 10; KHÔNG trần (M1): budget = 4 + 20 = 24.
    const { tickSteps } = restThenBurst(20, 60);
    expect(
      tickSteps,
      `một tick đi ${tickSteps.toFixed(1)} bước > trần 10 (M1 bỏ trần ngân sách)`,
    ).toBeLessThanOrEqual(10 + 1e-6);
  });
});

/**
 * Xen đi/dừng: kiểm ngân sách quãng đường + giới hạn hàng đợi + lastSeq "kể cả gửi xen đi / dừng".
 * KHÔNG kiểm bảo toàn (input dừng thừa bị cắt vô điều kiện KHÔNG tính vào `dropped`).
 */
function fuzzGoStop(): { ticks: number; dist: number } {
  const { w } = makeWorld();
  const { p, c } = addPlayer(w, "a");
  const map = w.map;
  const speed = statsFor(p.realm, p.tier, p).speed;
  const cap = speed * STEP;

  let seq = 0;
  let prevLastSeq = p.lastSeq;
  let prevX = p.x;
  let prevY = p.y;
  let dist = 0;
  let credit = 0;
  const budget0 = c.moveBudget;

  const ticks = ri(20, 48);
  for (let t = 0; t < ticks; t++) {
    let n = ri(0, 5);
    if (Math.random() < 0.1) n = ri(1, 400); // dồn
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.35) {
        queueInput(w, "a", { seq: ++seq, dx: 0, dy: 0 }); // dừng
      } else {
        const a = Math.random() * Math.PI * 2;
        queueInput(w, "a", { seq: ++seq, dx: Math.cos(a), dy: Math.sin(a) }); // đi
      }
      expect(c.inputs.length, `seq ${seq}: queue > 64`).toBeLessThanOrEqual(64);
    }
    const dt = Math.random() < 0.85 ? TICK_MS : ri(10, 300);
    credit += dt / TICK_MS;
    applyInputs(map, p, c, dt);
    expect(c.inputs.length, `tick ${t}: backlog > MAX_INPUT_BACKLOG`).toBeLessThanOrEqual(
      MAX_INPUT_BACKLOG,
    );
    expect(p.lastSeq, `tick ${t}: lastSeq lùi`).toBeGreaterThanOrEqual(prevLastSeq);
    prevLastSeq = p.lastSeq;
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(map.circleBlocked(p.x, p.y, PLAYER_RADIUS)).toBe(false);
    dist += Math.hypot(p.x - prevX, p.y - prevY);
    prevX = p.x;
    prevY = p.y;
    const budgetSteps = MAX_INPUT_BACKLOG + MAX_INPUT_BACKLOG + credit + MAX_INPUT_BACKLOG;
    expect(dist, `tick ${t}: đi nhanh hơn ngân sách (xen đi/dừng)`).toBeLessThanOrEqual(
      budgetSteps * cap + cap,
    );
    expect(
      dist,
      `tick ${t}: vượt (ngân sách đầu + credit) thời gian thật (xen đi/dừng)`,
    ).toBeLessThanOrEqual((budget0 + credit) * cap + 1e-6);
  }
  return { ticks, dist };
}

describe("Fuzz bất biến di chuyển (issue #859): xen đi/dừng không phá ngân sách / hàng đợi / lastSeq", () => {
  it(">= 300 kịch bản seeded: ngân sách quãng đường + backlog + trần 64 + lastSeq giữ dù xen đi/dừng/dồn", () => {
    let totalDist = 0;
    for (let seed = 1; seed <= SCENARIOS; seed++)
      totalDist += withSeed(seed, () => fuzzGoStop()).dist;
    expect(totalDist).toBeGreaterThan(0);
  });
});

describe("Fuzz bất biến di chuyển (issue #859): đầu vào sai kiểu + người choáng", () => {
  it("NaN / Infinity ở dx/dy + seq không phải số (chuỗi) bị loại ở cửa: hàng đợi + dropped KHÔNG đổi", () => {
    const { w } = makeWorld();
    const { c } = addPlayer(w, "a");
    queueInput(w, "a", { seq: 1, dx: 1, dy: 0 }); // hợp lệ → vào hàng đợi
    expect(c.inputs.length).toBe(1);
    const before = w.inputStats.dropped;
    queueInput(w, "a", { seq: 2, dx: NaN, dy: 0 } as never);
    queueInput(w, "a", { seq: 3, dx: Infinity, dy: 1 } as never);
    queueInput(w, "a", { seq: "x" as unknown as number, dx: 1, dy: 0 } as never);
    expect(c.inputs.length, "input sai kiểu KHÔNG vào hàng đợi").toBe(1);
    expect(w.inputStats.dropped).toBe(before);
    // `seq: NaN` / Infinity / âm / thập phân từng lọt qua (typeof NaN === "number") và bị lưu thành seq 0 (kéo lastSeq lùi): A vá ở #1263 (PR #1271) và khoá
    // từng giá trị ở `movement-drift.test.ts` ("cửa nhận input KHÔNG tin seq"); fuzz này không sửa mã trò chơi.
  });

  it("người choáng: vẫn tiêu thụ input + tăng lastSeq, nhưng KHÔNG di chuyển", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    c.stunned = true;
    c.moveBudget = 10; // đủ ngân sách nuốt hết 8 input trong một tick (applyInputs cộng credit=1 rồi chặn trần 10)
    for (let s = 1; s <= 8; s++) queueInput(w, "a", { seq: s, dx: 1, dy: 0 });
    const x0 = p.x,
      y0 = p.y;
    applyInputs(w.map, p, c, TICK_MS);
    expect(c.inputs.length, "choáng vẫn tiêu thụ hết input").toBe(0);
    expect(p.lastSeq, "choáng vẫn tăng lastSeq").toBe(8);
    expect(p.x).toBe(x0);
    expect(p.y).toBe(y0);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
