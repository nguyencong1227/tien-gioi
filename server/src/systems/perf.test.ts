// Giữ các tối ưu băng thông / CPU của vòng lặp tick (xem AGENTS.md, mục Hiệu năng).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, TOWN_PX } from "@tien-gioi/shared";
import { takeWhole } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { MONSTER_WAKE_DIST, tickMonsters } from "./monsters";
import { EXP_FLUSH_MS, tickRecovery } from "./progression";
import { runBench } from "../perf/bench";

describe("takeWhole", () => {
  it("trả phần nguyên, giữ phần lẻ, cộng dồn qua nhiều lần", () => {
    const acc = { v: 0 };
    let total = 0;
    for (let i = 0; i < 100; i++) total += takeWhole(acc, "v", 0.07);
    expect(total).toBe(7);
    expect(acc.v).toBeCloseTo(0, 9);
  });
});

describe("hồi phục chỉ ghi số nguyên vào state", () => {
  it("khí huyết / linh lực luôn là số nguyên, tổng hồi đúng tốc độ", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    p.hp = 1;
    p.mp = 0;
    p.meditating = true;
    const hp0 = p.hp;
    const writes = new Set<number>();
    for (let i = 0; i < 20; i++) {
      w.now += 50;
      tickRecovery(w, "a", p, c, 0.05);
      writes.add(p.hp);
      expect(Number.isInteger(p.hp)).toBe(true);
      expect(Number.isInteger(p.mp)).toBe(true);
    }
    // 1 giây đả tọa: hồi ~6% khí huyết, nhưng state chỉ đổi vài lần chứ không phải 20
    expect(p.hp - hp0).toBeGreaterThanOrEqual(Math.floor(p.maxHp * 0.06) - 1);
    expect(writes.size).toBeLessThan(20);
  });

  it("tu vi đả tọa ghi vào state mỗi giây một lần, không mất phần lẻ", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    p.meditating = true;
    w.now = 0;
    let changes = 0;
    let last = p.exp;
    for (let i = 0; i < 100; i++) {
      w.now += 50;
      tickRecovery(w, "a", p, c, 0.05);
      if (p.exp !== last) changes++;
      last = p.exp;
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(5000 / EXP_FLUSH_MS) + 1);
    expect(p.exp + c.frac.exp).toBeGreaterThan(0);
  });
});

describe("quái ngủ khi không có ai ở gần", () => {
  function far() {
    const { w } = makeWorld();
    const x = TOWN_PX.x + TOWN_PX.r + 600;
    const { m, mc } = addMonster(w, "lang", x, TOWN_PX.y);
    mc.nextWander = 0;
    return { w, m, mc, x };
  }

  it("không người chơi nào trong MONSTER_WAKE_DIST: đứng yên", () => {
    const { w, m, x } = far();
    for (let i = 0; i < 200; i++) {
      w.now += 50;
      tickMonsters(w, 0.05);
    }
    expect(m.x).toBe(x);
  });

  it("có người chơi trong tầm: lang thang như cũ", () => {
    const { w, m, x } = far();
    const { p } = addPlayer(w, "a");
    p.x = x + MONSTER_WAKE_DIST - 50;
    p.y = TOWN_PX.y;
    let moved = false;
    for (let i = 0; i < 200 && !moved; i++) {
      w.now += 50;
      tickMonsters(w, 0.05);
      moved = m.x !== x;
    }
    expect(moved).toBe(true);
    expect(MONSTER_WAKE_DIST).toBeGreaterThan(MONSTER_BY_ID.lang.aggro);
  });
});

describe("ngân sách băng thông và CPU (benchmark có seed, kết quả cố định)", () => {
  it("không ai chơi thì không gửi gì", () => {
    expect(runBench(0, 5).patchBytes).toBe(0);
  });

  it("100 người chơi: patch mỗi client dưới ngân sách, tick dưới 10 ms", () => {
    const r = runBench(100, 10);
    // Đo lúc viết (#62, StateView): ~585 byte/tick mỗi client (≈ 11 KB/s) trong 10 giây đầu, quái còn đông.
    // Trước StateView mỗi client nhận cả thế giới: ~1670 byte/tick. Vượt ngân sách nghĩa là có trường
    // state đổi mỗi tick không cần thiết, hoặc vùng nhìn (systems/interest.ts) không còn cắt được.
    expect(r.patchBytes).toBeLessThan(800);
    expect(r.avgMs).toBeLessThan(10);
  });
});
