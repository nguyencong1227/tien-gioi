// Giữ các tối ưu băng thông / CPU của vòng lặp tick (xem AGENTS.md, mục Hiệu năng).
import { describe, expect, it } from "vitest";
import { Encoder, StateView } from "@colyseus/schema";
import { MONSTER_BY_ID, TOWN_PX, getMap, MAX_BOLTS } from "@tien-gioi/shared";
import { ANGLE_STEP, quantAngle, takeWhole } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickWorld } from "./tick";
import { slash, tickRespawn } from "./combat";
import { cast } from "./cast";
import { MONSTER_WAKE_DIST, WANDER_STRIDE, spawnInitial, tickMonsters } from "./monsters";
import { EXP_FLUSH_MS, tickRecovery } from "./progression";
import {
  measureSyncStepMs,
  runBench,
  runMultiMapBench,
  summarizeTickMs,
  type BenchMode,
  type BenchResult,
  type MultiMapBenchResult,
} from "../perf/bench";

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
      applyInputs(w.map, p, c);
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

describe("quái lang thang chỉ đổi vị trí mỗi WANDER_STRIDE tick (#80)", () => {
  const TICKS = 80;
  /**
   * Một con lang có điểm lang thang cách 190 px (trong RETURN_HOME_DIST, không bị kéo về nhà); một người chơi ở phía
   * quái đang đi tới, đủ gần để quái không ngủ (đi xa dần sẽ vượt MONSTER_WAKE_DIST) nhưng không đủ gần để gây hấn.
   */
  function wanderer() {
    const { w } = makeWorld();
    const x = TOWN_PX.x + TOWN_PX.r + 600;
    const { m, mc } = addMonster(w, "lang", x, TOWN_PX.y);
    // Bài này đo NHỊP GHI VỊ TRÍ của quái cận chiến đuổi người (WANDER_STRIDE, #80): ép cận chiến tường minh vì Hôi Lang nay là `charger` (M7.3),
    // đứng gồng thay vì đuổi khi người chơi vào tầm (hành vi riêng ở `charge.test.ts`)
    mc.def = { ...mc.def, behavior: "melee" };
    mc.wanderX = x + 190;
    mc.wanderY = TOWN_PX.y;
    mc.nextWander = Infinity;
    const { p } = addPlayer(w, "Alpha");
    p.x = x + 800;
    p.y = TOWN_PX.y;
    expect(800).toBeGreaterThan(MONSTER_BY_ID.lang.aggro);
    expect(800).toBeLessThan(MONSTER_WAKE_DIST);
    return { w, m, mc, x };
  }
  function run(w: ReturnType<typeof makeWorld>["w"], m: { x: number; y: number }, ticks: number) {
    let writes = 0;
    let last = `${m.x},${m.y}`;
    for (let i = 0; i < ticks; i++) {
      w.now += 50;
      tickMonsters(w, 0.05);
      const cur = `${m.x},${m.y}`;
      if (cur !== last) writes++;
      last = cur;
    }
    return writes;
  }

  it("vị trí trong state đổi ~1/WANDER_STRIDE số tick, tốc độ trung bình không đổi", () => {
    const { w, m, x } = wanderer();
    const writes = run(w, m, TICKS);
    expect(writes).toBeLessThanOrEqual(Math.ceil(TICKS / WANDER_STRIDE) + 1);
    expect(writes).toBeGreaterThanOrEqual(Math.floor(TICKS / WANDER_STRIDE) - 2);
    // Quãng đường sau 4 giây = tốc độ lang thang × 4 (như khi áp bước mỗi tick)
    const expected = MONSTER_BY_ID.lang.speed * 0.35 * (TICKS * 0.05);
    expect(m.x - x).toBeGreaterThan(expected * 0.95);
    expect(m.x - x).toBeLessThan(expected * 1.05);
  });

  it("quái có mục tiêu (đang đuổi) vẫn di chuyển mỗi tick", () => {
    const { w, m, x } = wanderer();
    const p = w.state.players.get("Alpha")!;
    p.x = x + 150; // trong tầm gây hấn, còn xa tầm đánh
    expect(150).toBeLessThan(MONSTER_BY_ID.lang.aggro);
    expect(run(w, m, 10)).toBe(10);
  });

  it("vừa có mục tiêu là hết chờ: đuổi ngay, không đợi tới nhịp WANDER_STRIDE", () => {
    const { w, m, mc, x } = wanderer();
    mc.strideLeft = WANDER_STRIDE - 1; // đang chờ
    const p = w.state.players.get("Alpha")!;
    p.x = x + 150;
    w.now += 50;
    tickMonsters(w, 0.05);
    expect(mc.target).toBe("Alpha");
    expect(m.x).toBeGreaterThan(x); // đuổi về phía người chơi ngay tick này
    expect(mc.strideLeft).toBe(0);
  });

  it("quái được sinh lệch pha, không cùng nhúc nhích một tick", () => {
    const { w } = makeWorld();
    spawnInitial(w);
    const phases = new Map<number, number>();
    for (const mc of w.mctrl.values())
      phases.set(mc.strideLeft, (phases.get(mc.strideLeft) ?? 0) + 1);
    expect([...phases.keys()].sort()).toEqual(Array.from({ length: WANDER_STRIDE }, (_, i) => i));
    for (const n of phases.values()) expect(n).toBeGreaterThan(w.mctrl.size / WANDER_STRIDE / 2);
  });
});

describe("ngân sách băng thông và CPU (benchmark có seed, kết quả cố định)", () => {
  /**
   * Lấy min theo từng tick qua `n` lần chạy có seed (cùng nguyên lý với `bestOfMultiMapBench`, #723)
   * cho các ca khẳng định `avgMs < 10`. Các chỉ số xác định (`patchBytes`, `eventKb*`, `partyKb*`, `walletKb*`)
   * giống hệt nhau giữa mọi lần chạy cùng seed.
   */
  function bestOfBench(
    players: number,
    seconds: number,
    seed = 1,
    mode: BenchMode = "hunt",
    n = 2,
  ): BenchResult {
    const first = runBench(players, seconds, seed, mode);
    const minTickMs = [...(first.tickMs ?? [])];
    for (let i = 1; i < n; i++) {
      const r = runBench(players, seconds, seed, mode);
      const ticks = r.tickMs ?? [];
      for (let t = 0; t < minTickMs.length; t++) {
        if (ticks[t] < minTickMs[t]) minTickMs[t] = ticks[t];
      }
    }
    const { avgMs, p95Ms, maxMs } = summarizeTickMs(minTickMs);
    return { ...first, avgMs, p95Ms, maxMs };
  }

  it("không ai chơi thì không gửi gì", () => {
    expect(runBench(0, 5).patchBytes).toBe(0);
  });

  it("100 người chơi: patch mỗi client dưới ngân sách, tick dưới 10 ms", () => {
    const r = bestOfBench(100, 10);
    // Đo lúc viết: ~401 byte/tick mỗi client (≈ 7.8 KB/s) trong 10 giây đầu, quái còn đông.
    // Lịch sử: mỗi client nhận cả thế giới ~1670 byte/tick; StateView (#62) còn ~585; lượng tử hóa
    // góc nhìn (quantAngle) còn ~401. Vượt ngân sách nghĩa là có trường state đổi mỗi tick không cần thiết,
    // hoặc vùng nhìn (systems/interest.ts) không còn cắt được.
    expect(r.patchBytes).toBeLessThan(520);
    expect(r.avgMs).toBeLessThan(10);
  });

  it("ca đông người tụ trong trấn (#80): giữ mức hiện tại (< 600), mục tiêu < 520 byte/tick", () => {
    const r = bestOfBench(100, 10, 1, "crowd");
    // Đo lúc viết (#80): ~1267 byte/tick mỗi client (≈ 25 KB/s) khi 100 người tụ trong trấn, 70% thời gian đi lại.
    // Người khác nhận px, py làm tròn 10 Hz (#89): ~788; quái lang thang chỉ đổi vị trí mỗi WANDER_STRIDE tick (#87):
    // ~974; cả hai: ~484 (≈ 9.5 KB/s). Vùng nhìn không cắt được gì vì ai cũng thấy nhau. Test này CHỈ giữ không
    // tệ thêm; khi hạ được nữa thì hạ ngưỡng, đích là < 520 như ngân sách chung.
    expect(r.patchBytes).toBeLessThan(600);
    expect(r.avgMs).toBeLessThan(10);
  });

  it("fx / dmg chỉ gửi cho người trong vùng nhìn: ít hơn một nửa so với broadcast cả phòng", () => {
    const r = runBench(100, 10);
    // Đo lúc viết: ~7.7 KB/s mỗi client nếu broadcast, ~2.3 KB/s khi cắt theo vùng nhìn (ước lượng bằng JSON).
    // M7.3: Hắc Hổ chảy máu sau đòn lao. Nhịp dot (chảy máu / độc / bỏng) CHỈ gửi chủ (`dmgTo`, không `sendNear`): 100 người, 10 s, 3,79 -> 3,80 KB/s (gửi gần thì 4,05 và làm mọi người đứng gần nghe tiếng đánh mỗi nhịp).
    expect(r.eventKbBroadcast).toBeGreaterThan(1);
    expect(r.eventKbNear).toBeLessThan(r.eventKbBroadcast / 2);
    // M7.3 tinh anh: 3,80 -> 4,01 KB/s (100 người tranh ~20 con trong bench; tinh anh x2,5 khí huyết sống lâu hơn nên nhiều đòn trúng / số sát thương hơn). Roll tinh anh KHÔNG
    // gọi `Math.random` (`eliteHash`): lần đầu dùng `Math.random` nhích tới 4,43 dù xác suất 0 vì lệch chuỗi có hạt giống, không phải do tinh anh.
    expect(r.eventKbNear).toBeLessThan(4.5);
  });

  it("tin tổ đội (PartyMsg) cho một client dưới ngân sách < 1 KB/s (#76)", () => {
    const r = runBench(100, 10);
    // 100 người chia 25 đội 4 người, snapshot gửi mỗi 1 giây (PARTY_SNAPSHOT_MS = 1000).
    // Mỗi client nhận 1 tin nhắn/s kích thước ~300 byte JSON + khung.
    expect(r.partyKbPerClient).toBeGreaterThan(0.1);
    expect(r.partyKbPerClient).toBeLessThan(1.0);
  });

  it("tin ví Linh thạch (WalletMsg) cho một client dưới ngân sách < 0.5 KB/s (#102)", () => {
    const r = runBench(100, 10);
    // Tin wallet chỉ gửi cho đúng chủ khi hạ quái rơi tiền hoặc mua bán tại NPC.
    // Băng thông rất nhỏ nhưng > 0 khi có quái bị hạ, giữ ngân sách < 0.5 KB/s mỗi client.
    expect(r.walletKbPerClient).toBeGreaterThan(0);
    expect(r.walletKbPerClient).toBeLessThan(0.5);
  });
});

describe("kịch bản hiệu năng chiêu thức (M7.10 #511)", () => {
  it("nhiều người chơi liên tục dùng chiêu: tick < 10 ms, fx cast gửi gần, không crash", () => {
    const { w, fx } = makeWorld();
    spawnInitial(w);

    // Thêm 30 người chơi Trúc Cơ rải quanh bãi quái
    const players: string[] = [];
    for (let i = 0; i < 30; i++) {
      const sid = `p_${i}`;
      const { p, c } = addPlayer(w, sid, 2, 5);
      p.x = w.map.townPx.x + 250 + (i % 6) * 40;
      p.y = w.map.townPx.y + 250 + Math.floor(i / 6) * 40;
      p.mp = 500;
      p.maxMp = 500;
      syncPublicPos(p);
      c.skills = {
        learned: { hoa_van_kiem: 2, thanh_tung_phi_cham: 1 },
        slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "", ""],
      };
      players.push(sid);
    }
    // Chắc chắn có mục tiêu trong tầm 300 px: quái của `spawnInitial` sinh NGẪU NHIÊN nên đôi khi không con nào rơi gần bãi người chơi => 0 lần cast, 0 `fx cast`
    // và test đỏ không do mã (CI #575, 15/11/2026). Linh Thố hiền, không đánh người nên không đổi phép đo byte / tick.
    for (let k = 0; k < 3; k++)
      addMonster(w, "tho", w.map.townPx.x + 330 + k * 60, w.map.townPx.y + 330);

    // Gắn StateView và Encoder như server thật để đo byte patch mỗi client (M7.10, tiêu chí N6 #511)
    const views: StateView[] = [];
    for (const sid of players) {
      const v = new StateView();
      w.interest.join(w, sid, v);
      views.push(v);
    }
    const encoder = new Encoder(w.state);
    encoder.encodeAll();
    encoder.discardChanges();
    for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
    encoder.discardChanges();

    const startTicks = 40; // 40 ticks = 2.0 giây
    const tickDurations: number[] = [];
    const bytesPerTick: number[] = [];

    for (let t = 0; t < startTicks; t++) {
      w.now += 50;
      // Mỗi nhịp, người chơi thử cast chiêu vào quái gần nhất
      for (let i = 0; i < players.length; i++) {
        const sid = players[i];
        const p = w.state.players.get(sid)!;
        p.mp = 500; // giữ đủ mana để test áp lực liên tục
        let nearestMon: any = null;
        let minDist = 300;
        w.state.monsters.forEach((mon) => {
          const d = Math.hypot(mon.x - p.x, mon.y - p.y);
          if (d < minDist) {
            minDist = d;
            nearestMon = mon;
          }
        });
        if (nearestMon) {
          const angle = Math.atan2(nearestMon.y - p.y, nearestMon.x - p.x);
          const slot = (2 + (t % 2)) as 2 | 3;
          cast(w, sid, { slot, angle });
        }
      }

      const dt = measureSyncStepMs(() => tickWorld(w, 50));
      tickDurations.push(dt);

      // Đo byte patch thực tế gửi cho từng client theo StateView
      const it = { offset: 1 };
      let sharedOffset = 1;
      const shared = encoder.hasChanges;
      if (shared) {
        encoder.encode(it);
        sharedOffset = it.offset;
      }
      let tickBytes = 0;
      for (const v of views) {
        if (shared || v.changes.size > 0) {
          tickBytes += encoder.encodeView(v, sharedOffset, it).byteLength;
        }
      }
      encoder.discardChanges();
      bytesPerTick.push(tickBytes / players.length);
    }

    const avgMs = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    expect(avgMs).toBeLessThan(10);

    // Tiêu chí #511 & N6: byte / tick mỗi client < 520 (thực tế kịch bản chiêu patch rất nhỏ)
    const avgPatchBytes = bytesPerTick.reduce((a, b) => a + b, 0) / bytesPerTick.length;
    expect(avgPatchBytes).toBeLessThan(520);

    // Có hiệu ứng fx cast được tạo ra
    const castFxs = fx.filter((f) => f.kind === "cast");
    expect(castFxs.length).toBeGreaterThan(0);

    // 30 người chơi vẫn tồn tại bình thường
    expect(w.state.players.size).toBe(30);
  });

  it("kịch bản hiệu năng đông quái tầm xa + chiêu thức (M7.10 #511): tick < 10 ms, MAX_BOLTS 64, byte/tick < 520 mỗi client, đạn không sinh patch state", () => {
    const amSuong = getMap("am_suong")!;
    expect(amSuong).toBeDefined();
    const t = makeWorld(amSuong);
    const { w, fx } = t;

    // Sinh 30 người chơi Kim Đan ngoài hoang dã Âm Sương Trạch
    const players: string[] = [];
    const centerX = amSuong.townPx.x + 400;
    const centerY = amSuong.townPx.y + 400;

    for (let i = 0; i < 30; i++) {
      const sid = `p_ranged_${i}`;
      const { p, c } = addPlayer(w, sid, 3, 0); // Kim Đan Sơ kỳ
      p.x = centerX + (i % 6) * 35;
      p.y = centerY + Math.floor(i / 6) * 35;
      p.hp = 100_000;
      p.maxHp = 100_000; // giữ sống suốt bài test để đo tick liên tục
      p.mp = 500;
      p.maxMp = 500;
      syncPublicPos(p);
      c.skills = {
        learned: { hoa_van_kiem: 2, thanh_tung_phi_cham: 1 },
        slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "", ""],
      };
      players.push(sid);
    }

    // Sinh đông quái tầm xa thật (Sương Hồ + Độc Thiềm) bao quanh bãi người chơi ở khoảng cách 150-250 px
    const monCount = 40;
    for (let mIdx = 0; mIdx < monCount; mIdx++) {
      const kind = mIdx % 2 === 0 ? "suong_ho" : "doc_thiem";
      const rad = (mIdx / monCount) * Math.PI * 2;
      const dist = 180 + (mIdx % 3) * 30;
      const mx = centerX + 100 + Math.cos(rad) * dist;
      const my = centerY + 100 + Math.sin(rad) * dist;
      const mon = addMonster(w, kind, mx, my);
      mon.mc.homeX = mx;
      mon.mc.homeY = my;
    }

    // Gắn StateView và Encoder như server thật để đo byte patch mỗi client
    const views: StateView[] = [];
    for (const sid of players) {
      const v = new StateView();
      w.interest.join(w, sid, v);
      views.push(v);
    }
    const encoder = new Encoder(w.state);
    encoder.encodeAll();
    encoder.discardChanges();
    for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
    encoder.discardChanges();

    const testTicks = 60; // 60 ticks = 3.0 giây mô phỏng
    const tickDurations: number[] = [];
    const bytesPerTick: number[] = [];
    let maxBoltsInFlight = 0;

    for (let tick = 0; tick < testTicks; tick++) {
      w.now += 50;

      // Mỗi nhịp, người chơi cast chiêu vào quái gần nhất
      for (let i = 0; i < players.length; i++) {
        const sid = players[i];
        const p = w.state.players.get(sid)!;
        p.mp = 500;
        let nearestMon: any = null;
        let minDist = 300;
        w.state.monsters.forEach((mon) => {
          const d = Math.hypot(mon.x - p.x, mon.y - p.y);
          if (d < minDist) {
            minDist = d;
            nearestMon = mon;
          }
        });
        if (nearestMon) {
          const angle = Math.atan2(nearestMon.y - p.y, nearestMon.x - p.x);
          const slot = (2 + (tick % 2)) as 2 | 3;
          cast(w, sid, { slot, angle });
        }
      }

      const dt = measureSyncStepMs(() => tickWorld(w, 50));
      tickDurations.push(dt);

      // Theo dõi đạn tầm xa trong không gian
      if (w.bolts.length > maxBoltsInFlight) {
        maxBoltsInFlight = w.bolts.length;
      }
      expect(w.bolts.length).toBeLessThanOrEqual(MAX_BOLTS);

      // Đo byte patch gửi cho từng client theo StateView
      const it = { offset: 1 };
      let sharedOffset = 1;
      const shared = encoder.hasChanges;
      if (shared) {
        encoder.encode(it);
        sharedOffset = it.offset;
      }
      let tickBytes = 0;
      for (const v of views) {
        if (shared || v.changes.size > 0) {
          tickBytes += encoder.encodeView(v, sharedOffset, it).byteLength;
        }
      }
      encoder.discardChanges();
      bytesPerTick.push(tickBytes / players.length);
    }

    const avgMs = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    // Tiêu chí M7.10 (#511): tick < 10 ms khi đông quái tầm xa bắn đạn và người chơi dùng chiêu
    expect(avgMs).toBeLessThan(10);

    // Tiêu chí M7.10 (#511): byte / tick mỗi client < 520 (đạn lưu bộ nhớ server, 0 patch byte)
    const avgPatchBytes = bytesPerTick.reduce((a, b) => a + b, 0) / bytesPerTick.length;
    expect(avgPatchBytes).toBeLessThan(520);

    // Bắt buộc đạn tầm xa đã được bắn liên tục trong không gian
    expect(maxBoltsInFlight).toBeGreaterThan(0);
    expect(maxBoltsInFlight).toBeLessThanOrEqual(MAX_BOLTS);

    const boltFxs = fx.filter((f) => f.kind === "bolt");
    expect(boltFxs.length).toBeGreaterThan(0);

    const castFxs = fx.filter((f) => f.kind === "cast");
    expect(castFxs.length).toBeGreaterThan(0);

    expect(w.state.players.size).toBe(30);
  });

  it("người chơi Nguyên Anh (realm 4, tier 0..2) thi triển đủ 6 chiêu đợt 2 quanh bãi quái Hàn Vân (#722, #515): tick < 10 ms, byte/tick < 520 mỗi client", () => {
    const hanVan = getMap("han_van")!;
    expect(hanVan).toBeDefined();
    const { w, fx, dmgs, statusMsgs } = makeWorld(hanVan);

    const NGUYEN_ANH_SKILLS = [
      "han_quang_tien",
      "bach_kim_trao",
      "van_thach_tran",
      "bang_hoa_loan",
      "liet_hoa_kiem",
      "van_hanh_bo",
    ] as const;

    // Sinh 30 người chơi Nguyên Anh (realm 4), chia đều 3 bậc tier 0 (Sơ kỳ), 1 (Trung kỳ), 2 (Hậu kỳ)
    const players: string[] = [];
    const centerX = hanVan.townPx.x + 360;
    const centerY = hanVan.townPx.y + 360;

    for (let i = 0; i < 30; i++) {
      const tier = i % 3;
      const sid = `p_na_${i}`;
      const { p, c } = addPlayer(w, sid, 4, tier);
      p.x = centerX + (i % 6) * 32;
      p.y = centerY + Math.floor(i / 6) * 32;
      p.hp = 200_000;
      p.maxHp = 200_000;
      p.mp = 2_000;
      p.maxMp = 2_000;
      syncPublicPos(p);

      if (tier === 0) {
        c.skills = {
          learned: {
            han_quang_tien: 2,
            bach_kim_trao: 2,
            hoa_van_kiem: 3,
            thanh_tung_phi_cham: 2,
          },
          slots: ["han_quang_tien", "bach_kim_trao", "hoa_van_kiem", "thanh_tung_phi_cham"],
        };
      } else if (tier === 1) {
        c.skills = {
          learned: {
            han_quang_tien: 2,
            bach_kim_trao: 2,
            van_thach_tran: 2,
            bang_hoa_loan: 2,
          },
          slots: ["han_quang_tien", "bach_kim_trao", "van_thach_tran", "bang_hoa_loan"],
        };
      } else {
        c.skills = {
          learned: {
            han_quang_tien: 3,
            bach_kim_trao: 3,
            van_thach_tran: 3,
            bang_hoa_loan: 3,
            liet_hoa_kiem: 2,
            van_hanh_bo: 2,
          },
          slots:
            i % 6 === 2
              ? ["van_thach_tran", "bang_hoa_loan", "liet_hoa_kiem", "van_hanh_bo"]
              : ["han_quang_tien", "bach_kim_trao", "liet_hoa_kiem", "van_hanh_bo"],
        };
      }
      players.push(sid);
    }

    // Sinh 36 quái Nguyên Anh thật của Hàn Vân Lĩnh (Hàn Lang, Phong Nha, Cốt Tượng, Độc Tước)
    // ở khoảng cách ~55-90 px quanh nhóm người chơi để cả cone (90-95 px), ground (reach 150 ± 120 px),
    // fan (200 px) và line (210 px) đều trúng mục tiêu liên tục.
    const hanVanKinds = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"] as const;
    const monCount = 36;
    for (let mIdx = 0; mIdx < monCount; mIdx++) {
      const kind = hanVanKinds[mIdx % hanVanKinds.length];
      const anchorIdx = mIdx % players.length;
      const anchorP = w.state.players.get(players[anchorIdx])!;
      const rad = (mIdx / monCount) * Math.PI * 2;
      const dist = 60 + (mIdx % 3) * 12; // 60..84 px từ người chơi neo
      const mx = anchorP.x + Math.cos(rad) * dist;
      const my = anchorP.y + Math.sin(rad) * dist;
      const mon = addMonster(w, kind, mx, my);
      mon.m.hp = 500_000;
      mon.m.maxHp = 500_000;
      mon.mc.homeX = mx;
      mon.mc.homeY = my;
    }

    // Gắn StateView và Encoder như server thật để đo byte patch mỗi client
    const views: StateView[] = [];
    for (const sid of players) {
      const v = new StateView();
      w.interest.join(w, sid, v);
      views.push(v);
    }
    const encoder = new Encoder(w.state);
    encoder.encodeAll();
    encoder.discardChanges();
    for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
    encoder.discardChanges();

    const testTicks = 80; // 80 ticks = 4.0 giây mô phỏng (qua hơn 1 vòng hồi chiêu 3.0-3.8s)
    const tickDurations: number[] = [];
    const bytesPerTick: number[] = [];

    for (let tick = 0; tick < testTicks; tick++) {
      w.now += 50;

      // Đo cả bước xử lý tin cast của 30 người chơi lẫn tickWorld trong cùng nhịp 50 ms
      const dt = measureSyncStepMs(() => {
        for (let i = 0; i < players.length; i++) {
          const sid = players[i];
          const p = w.state.players.get(sid)!;
          p.mp = p.maxMp;
          let nearestMon: any = null;
          let minDist = 250;
          w.state.monsters.forEach((mon) => {
            const d = Math.hypot(mon.x - p.x, mon.y - p.y);
            if (d < minDist) {
              minDist = d;
              nearestMon = mon;
            }
          });
          if (nearestMon) {
            const angle = Math.atan2(nearestMon.y - p.y, nearestMon.x - p.x);
            const slot = (2 + ((tick + i) % 4)) as 2 | 3 | 4 | 5;
            cast(w, sid, { slot, angle });
          }
        }
        tickWorld(w, 50);
      });
      tickDurations.push(dt);

      // Đo byte patch gửi cho từng client theo StateView
      const it = { offset: 1 };
      let sharedOffset = 1;
      const shared = encoder.hasChanges;
      if (shared) {
        encoder.encode(it);
        sharedOffset = it.offset;
      }
      let tickBytes = 0;
      for (const v of views) {
        if (shared || v.changes.size > 0) {
          tickBytes += encoder.encodeView(v, sharedOffset, it).byteLength;
        }
      }
      encoder.discardChanges();
      bytesPerTick.push(tickBytes / players.length);
    }

    const { avgMs, p95Ms } = summarizeTickMs(tickDurations);
    expect(avgMs).toBeLessThan(10);
    expect(p95Ms).toBeLessThan(10);

    const avgPatchBytes = bytesPerTick.reduce((a, b) => a + b, 0) / bytesPerTick.length;
    expect(avgPatchBytes).toBeLessThan(520);

    // Khẳng định cả 6 chiêu Nguyên Anh đợt 2 đều được thi triển thực tế nhiều lần
    const castCounts = new Map<string, number>();
    for (const f of fx) {
      if (f.kind === "cast" && typeof f.skill === "string") {
        castCounts.set(f.skill, (castCounts.get(f.skill) ?? 0) + 1);
      }
    }
    for (const skillId of NGUYEN_ANH_SKILLS) {
      expect(
        castCounts.get(skillId) ?? 0,
        `chiêu ${skillId} phải được thi triển`,
      ).toBeGreaterThanOrEqual(10);
    }

    // Các chiêu tấn công thực sự gây sát thương lên quái Hàn Vân và gắn trạng thái
    expect(dmgs.length).toBeGreaterThan(100);
    expect(statusMsgs.length).toBeGreaterThan(0);
    expect(w.state.players.size).toBe(30);
  });
});

/**
 * Đo thời gian trên máy dùng chung dễ bị nhiễu (#723): vitest chạy nhiều worker thread song song và dev khác chạy Chrome / e2e cùng lúc.
 * Mô phỏng có seed nên tick thứ `t` thực hiện công việc GIỐNG HỆT nhau giữa các lần chạy:
 * 1. Trong mỗi lần chạy, từng tick được đo bằng `measureSyncStepMs` (`min(wallMs, cpuMs)`), loại bỏ thời gian chờ khi tiến trình bị hệ điều hành lấy CPU.
 * 2. Chạy `n` lần và lấy **min theo từng tick** (`minTickMs[t] = min_k run_k.tickMs[t]`), rồi mới tính `avgTotalMs` / `p95TotalMs` / `maxTotalMs` qua `summarizeTickMs`.
 *    Nhiễu lịch chạy rải rác ở các tick khác nhau giữa các lần chạy bị triệt tiêu, còn hồi quy thật làm chậm tick `t` ở MỌI lần chạy nên vẫn ĐỎ.
 * 3. Mọi chỉ số xác định (byte, quái, tinh anh) giống hệt nhau giữa các lần chạy cùng seed.
 */
function bestOfMultiMapBench(
  rooms: Parameters<typeof runMultiMapBench>[0],
  seconds: number,
  seed = 1,
  n = 3,
): MultiMapBenchResult {
  const first = runMultiMapBench(rooms, seconds, seed);
  const minTickMs = [...first.tickMs];
  for (let i = 1; i < n; i++) {
    const r = runMultiMapBench(rooms, seconds, seed);
    for (let t = 0; t < minTickMs.length; t++) {
      if (r.tickMs[t] < minTickMs[t]) minTickMs[t] = r.tickMs[t];
    }
  }
  const { avgMs: avgTotalMs, p95Ms: p95TotalMs, maxMs: maxTotalMs } = summarizeTickMs(minTickMs);
  return {
    ...first,
    avgTotalMs,
    p95TotalMs,
    maxTotalMs,
    tickMs: minTickMs,
  };
}

describe("benchmark bốn bản đồ chạy đồng thời (M7.10 #511)", () => {
  it("runMultiMapBench trả mảng tickMs đúng thứ tự từng tick và bestOfMultiMapBench lấy min theo từng tick (#723)", () => {
    const rooms = [
      { mapId: "lac_ha", players: 10 },
      { mapId: "hac_phong", players: 10 },
    ];
    const r1 = runMultiMapBench(rooms, 1, 1);
    const r2 = runMultiMapBench(rooms, 1, 1);
    expect(r1.tickMs).toHaveLength(r1.ticks);
    expect(r1.ticks).toBe(20);
    for (const ms of r1.tickMs) expect(ms).toBeGreaterThanOrEqual(0);
    const sum1 = summarizeTickMs(r1.tickMs);
    expect(r1.avgTotalMs).toBeCloseTo(sum1.avgMs, 9);
    expect(r1.p95TotalMs).toBeCloseTo(sum1.p95Ms, 9);
    expect(r1.maxTotalMs).toBeCloseTo(sum1.maxMs, 9);
    // Cùng seed -> các chỉ số xác định giống hệt nhau
    expect(r1.totalElites).toBe(r2.totalElites);
    expect(r1.rooms.map((x) => x.patchBytes)).toEqual(r2.rooms.map((x) => x.patchBytes));

    const best = bestOfMultiMapBench(rooms, 1, 1, 2);
    expect(best.tickMs).toHaveLength(20);
    const sumBest = summarizeTickMs(best.tickMs);
    expect(best.avgTotalMs).toBeCloseTo(sumBest.avgMs, 9);
    expect(best.p95TotalMs).toBeCloseTo(sumBest.p95Ms, 9);
  });

  it("bốn bản đồ (Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân) với tinh anh đang sinh: tick tổng < 10 ms, patch < 520 byte/tick", () => {
    const res = bestOfMultiMapBench(
      [
        { mapId: "lac_ha", players: 25 },
        { mapId: "hac_phong", players: 25 },
        { mapId: "am_suong", players: 25 },
        { mapId: "han_van", players: 25 },
      ],
      6, // 6 giây = 120 ticks
      1,
    );
    expect(res.totalPlayers).toBe(100);
    expect(res.rooms.length).toBe(4);
    // Ngân sách tick tổng của cả 4 bản đồ < 10 ms
    expect(res.avgTotalMs).toBeLessThan(10);
    expect(res.p95TotalMs).toBeLessThan(10);
    // Quái tinh anh thực sự được sinh ở cả 4 bản đồ (nit A ở #666)
    expect(res.totalElites).toBeGreaterThan(0);
    // Từng bản đồ: patch < 520 byte/tick mỗi client, quái và tinh anh được sinh đầy đủ
    for (const r of res.rooms) {
      expect(r.patchBytes).toBeLessThan(520);
      expect(r.monsters).toBeGreaterThan(0);
      expect(r.elites).toBeGreaterThan(0);
    }
  });

  it("bốn bản đồ ca đông người tụ trong trấn (crowd): tick tổng < 10 ms, patch < 600 byte/tick", () => {
    const res = bestOfMultiMapBench(
      [
        { mapId: "lac_ha", players: 25, mode: "crowd" },
        { mapId: "hac_phong", players: 25, mode: "crowd" },
        { mapId: "am_suong", players: 25, mode: "crowd" },
        { mapId: "han_van", players: 25, mode: "crowd" },
      ],
      6,
      1,
    );
    expect(res.totalPlayers).toBe(100);
    expect(res.avgTotalMs).toBeLessThan(10);
    expect(res.p95TotalMs).toBeLessThan(10);
    for (const r of res.rooms) {
      expect(r.patchBytes).toBeLessThan(600);
    }
  });
});
