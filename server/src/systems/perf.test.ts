// Giữ các tối ưu băng thông / CPU của vòng lặp tick (xem AGENTS.md, mục Hiệu năng).
import { describe, expect, it } from "vitest";
import { Encoder, StateView } from "@colyseus/schema";
import { MONSTER_BY_ID, TOWN_PX } from "@tien-gioi/shared";
import { ANGLE_STEP, quantAngle, takeWhole } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickWorld } from "./tick";
import { slash, tickRespawn } from "./combat";
import { cast } from "./cast";
import { MONSTER_WAKE_DIST, WANDER_STRIDE, spawnInitial, tickMonsters } from "./monsters";
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

  it("ca đông người tụ trong trấn (#80): giữ mức hiện tại (< 600), mục tiêu < 520 byte/tick", () => {
    const r = runBench(100, 10, 1, "crowd");
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
    expect(r.eventKbBroadcast).toBeGreaterThan(1);
    expect(r.eventKbNear).toBeLessThan(r.eventKbBroadcast / 2);
    expect(r.eventKbNear).toBeLessThan(4);
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

      const t0 = performance.now();
      tickWorld(w, 0.05);
      const dt = performance.now() - t0;
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
});
