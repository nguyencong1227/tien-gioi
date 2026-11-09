// Giữ các tối ưu băng thông / CPU của vòng lặp tick (xem AGENTS.md, mục Hiệu năng).
import { describe, expect, it } from "vitest";
import { MONSTER_BY_ID, TOWN_PX } from "@tien-gioi/shared";
import { ANGLE_STEP, quantAngle, takeWhole } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickWorld } from "./tick";
import { slash, tickRespawn } from "./combat";
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

describe("góc nhìn ghi vào state được lượng tử hóa", () => {
  /** Hướng 4 phía của client (client/src/textures.ts dirFromAngle) */
  const dir4 = (a: number) => {
    const deg = (((((a * 180) / Math.PI + 180) % 360) + 360) % 360) - 180;
    if (deg >= -45 && deg <= 45) return "right";
    if (deg > 45 && deg < 135) return "down";
    if (deg >= 135 || deg <= -135) return "left";
    return "up";
  };

  it("sai lệch tối đa nửa ô, cùng ô thì cùng giá trị, giữ nguyên hướng 4 phía và dấu cos", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 5000; i++) {
      const a = (rnd() * 2 - 1) * Math.PI;
      const q = quantAngle(a);
      expect(Math.abs(q - a)).toBeLessThanOrEqual(ANGLE_STEP / 2 + 1e-9);
      expect(quantAngle(q)).toBe(q);
      expect(Math.cos(q) < 0).toBe(Math.cos(a) < 0);
      // góc sát ranh giới 45° / 135° thì bỏ qua (làm tròn sang bên nào cũng đúng)
      const nearEdge = [45, 135, -45, -135].some((e) => Math.abs((a * 180) / Math.PI - e) < 1e-6);
      if (!nearEdge) expect(dir4(q)).toBe(dir4(a));
    }
  });

  it("đi và quay dần: góc trong state chỉ đổi khi sang ô mới, không đổi mỗi bước", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const seen = new Set<number>();
    let changes = 0;
    let last = p.angle;
    for (let i = 1; i <= 100; i++) {
      const a = i * 0.01; // quay 1 rad qua 100 bước
      c.inputs.push({ seq: i, dx: Math.cos(a), dy: Math.sin(a) });
      w.now += 50;
      applyInputs(p, c);
      seen.add(p.angle);
      if (p.angle !== last) changes++;
      last = p.angle;
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(1 / ANGLE_STEP) + 1); // ~6 lần, không phải 100
    expect(seen.size).toBeLessThan(10);
  });

  it("chém: state ghi góc đã làm tròn, hiệu ứng gửi client vẫn dùng góc chính xác", () => {
    const { w, fx } = makeWorld();
    const { p } = addPlayer(w, "a");
    slash(w, "a", 0.123);
    expect(p.angle).toBe(quantAngle(0.123));
    expect(fx[0]).toMatchObject({ kind: "slash", angle: 0.123 });
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

describe("vị trí công khai px, py của người chơi (#80)", () => {
  it("syncPublicPos làm tròn về số nguyên, kẹp trong int16, bỏ qua giá trị không hữu hạn", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "Alpha");
    p.x = 1234.6;
    p.y = 99.4;
    syncPublicPos(p);
    expect([p.px, p.py]).toEqual([1235, 99]);
    p.x = 1e9;
    p.y = -1e9;
    syncPublicPos(p);
    expect([p.px, p.py]).toEqual([32767, -32767]);
    p.x = NaN;
    p.y = Infinity;
    syncPublicPos(p);
    expect([p.px, p.py]).toEqual([32767, -32767]); // giữ giá trị cũ
  });

  it("vào phòng / hồi sinh: px, py khớp ngay, không đợi nhịp", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "Alpha");
    expect([p.px, p.py]).toEqual([Math.round(p.x), Math.round(p.y)]); // addPlayer làm như onJoin
    p.dead = true;
    c.deadAt = 0;
    p.px = 0;
    p.py = 0;
    w.now = 1e9; // đủ lâu để hồi sinh
    tickRespawn(w, p, c);
    expect(p.dead).toBe(false);
    expect([p.px, p.py]).toEqual([Math.round(p.x), Math.round(p.y)]);
  });

  it("đi liên tục: px, py chỉ đổi mỗi POS_SYNC_EVERY_TICKS tick, vẫn bám sát vị trí thật", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "Alpha");
    let writes = 0;
    let last = `${p.px},${p.py}`;
    const ticks = 40;
    for (let i = 1; i <= ticks; i++) {
      c.inputs.push({ seq: i, dx: 1, dy: 0 });
      w.now += 50;
      tickWorld(w, 50);
      const cur = `${p.px},${p.py}`;
      if (cur !== last) writes++;
      last = cur;
      expect(Math.abs(p.px - p.x)).toBeLessThanOrEqual(POS_SYNC_EVERY_TICKS * 10); // lệch tối đa ~2 bước
    }
    expect(writes).toBeLessThanOrEqual(Math.ceil(ticks / POS_SYNC_EVERY_TICKS));
    expect(writes).toBeGreaterThanOrEqual(ticks / POS_SYNC_EVERY_TICKS - 2);
  });

  it("đứng yên không ghi gì; gán thẳng p.x (dịch chuyển) thì tự chữa trong POS_SYNC_EVERY_TICKS tick", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "Alpha");
    let writes = 0;
    let last = `${p.px},${p.py}`;
    const step = () => {
      w.now += 50;
      tickWorld(w, 50);
      const cur = `${p.px},${p.py}`;
      if (cur !== last) writes++;
      last = cur;
    };
    for (let i = 0; i < 20; i++) step();
    expect(writes).toBe(0);
    p.x += 500;
    for (let i = 0; i < POS_SYNC_EVERY_TICKS; i++) step();
    expect(p.px).toBe(Math.round(p.x));
  });

  it("hai người lệch pha không ghi cùng một tick", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "Alpha");
    const b = addPlayer(w, "Bravo");
    b.c.posPhase = 1;
    const wrote: string[] = [];
    for (let i = 1; i <= 8; i++) {
      for (const x of [a, b]) x.c.inputs.push({ seq: i, dx: 1, dy: 0 });
      const before = [a.p.px, b.p.px];
      w.now += 50;
      tickWorld(w, 50);
      wrote.push(`${a.p.px !== before[0] ? "A" : "-"}${b.p.px !== before[1] ? "B" : "-"}`);
    }
    expect(wrote.some((x) => x === "AB")).toBe(false);
    expect(wrote.some((x) => x.includes("A"))).toBe(true);
    expect(wrote.some((x) => x.includes("B"))).toBe(true);
  });
});

describe("ngân sách băng thông và CPU (benchmark có seed, kết quả cố định)", () => {
  it("không ai chơi thì không gửi gì", () => {
    expect(runBench(0, 5).patchBytes).toBe(0);
  });

  it("100 người chơi: patch mỗi client dưới ngân sách, tick dưới 10 ms", () => {
    const r = runBench(100, 10);
    // Đo lúc viết: ~401 byte/tick mỗi client (≈ 7.8 KB/s) trong 10 giây đầu, quái còn đông.
    // Lịch sử: mỗi client nhận cả thế giới ~1670 byte/tick; StateView (#62) còn ~585; lượng tử hóa
    // góc nhìn (quantAngle) còn ~401. Vượt ngân sách nghĩa là có trường state đổi mỗi tick không cần thiết,
    // hoặc vùng nhìn (systems/interest.ts) không còn cắt được.
    expect(r.patchBytes).toBeLessThan(520);
    expect(r.avgMs).toBeLessThan(10);
  });

  it("ca đông người tụ trong trấn (#80): giữ mức hiện tại (< 1000), chưa đạt mục tiêu < 520 byte/tick", () => {
    const r = runBench(100, 10, 1, "crowd");
    // Đo lúc viết (#80, bước 2): ~788 byte/tick mỗi client (≈ 15.4 KB/s) khi 100 người tụ trong trấn, 70% thời gian đi lại
    // (trước khi người khác nhận px, py làm tròn 10 Hz: ~1267 byte/tick). Cộng với quái lang thang mỗi WANDER_STRIDE tick
    // (#87) còn ~484 byte/tick. Vùng nhìn không cắt được gì vì ai cũng thấy nhau. Test này CHỈ giữ không tệ thêm; khi
    // các bước còn lại của #80 hạ được thì hạ ngưỡng, đích là < 520 như ngân sách chung.
    expect(r.patchBytes).toBeLessThan(1000);
    expect(r.avgMs).toBeLessThan(10);
  });

  it("fx / dmg chỉ gửi cho người trong vùng nhìn: ít hơn một nửa so với broadcast cả phòng", () => {
    const r = runBench(100, 10);
    // Đo lúc viết: ~7.7 KB/s mỗi client nếu broadcast, ~2.3 KB/s khi cắt theo vùng nhìn (ước lượng bằng JSON).
    expect(r.eventKbBroadcast).toBeGreaterThan(1);
    expect(r.eventKbNear).toBeLessThan(r.eventKbBroadcast / 2);
    expect(r.eventKbNear).toBeLessThan(4);
  });
});
