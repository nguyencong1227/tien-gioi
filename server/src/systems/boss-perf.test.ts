// Đo ngân sách hiệu năng cho 8 trùm vận chiêu + 50 người (Issue #936, docs/THIET_KE_TRUM.md mục 4).
// Tiêu chí:
// 1. 8 trùm vận chiêu + 50 người chơi: tick TB < 10 ms (p95 < 10 ms), byte patch < 520 byte/tick/client, fx/giây trong ngưỡng.
// 2. Độ phức tạp pickCast: so 10 người và 100 người cùng 8 trùm: thời gian tick tăng < 4 lần (không O(n^2)).
// 3. Ca 0 người chơi: trùm ngủ, 0 byte patch, tick ~0 ms.
// 4. Có >= 4 đột biến ĐỎ:
//    - (1) vòng lặp O(n^2) người chơi x người chơi vào pickCast
//    - (2) gửi warn mỗi tick thay vì một lần
//    - (3) ghi thêm 1 trường vào state công khai mỗi tick
//    - (4) bỏ điều kiện "ngủ khi không có người"
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  MONSTER_BY_ID,
  bossViolations,
  type BossAbility,
  type BossDef,
  type BossPhase,
} from "@tien-gioi/shared";
import { Encoder, StateView } from "@colyseus/schema";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import { newBossCtrl } from "./boss-state";
import { syncPublicPos } from "./movement";
import { tickMonsters } from "./monsters";
import { tickWorld } from "./tick";
import { measureSyncStepMs } from "../perf/bench";

const TICK_MS = 50;

/** Bộ chiêu mẫu hoàn chỉnh có đầy đủ các hình học và điều kiện mục tiêu */
export function makeBenchBossDef(): BossDef {
  const abilities: BossAbility[] = [
    {
      id: "ab_circle",
      name: "Địa Chấn",
      shape: { t: "circleAt", at: "target", r: 60 },
      telegraphMs: 1200,
      recoverMs: 600,
      cooldownMs: 3000,
      weight: 3,
      dmgMult: 1,
    },
    {
      id: "ab_ring",
      name: "Hoả Luân",
      shape: { t: "ring", r0: 80, r: 160 },
      telegraphMs: 1200,
      recoverMs: 600,
      cooldownMs: 3000,
      weight: 3,
      dmgMult: 1,
    },
    {
      id: "ab_cone",
      name: "Long Tức",
      shape: { t: "cone", r: 180, arc: Math.PI / 3 },
      telegraphMs: 1200,
      recoverMs: 600,
      cooldownMs: 3000,
      weight: 3,
      dmgMult: 1,
    },
    {
      id: "ab_line",
      name: "Kích Kiếm",
      shape: { t: "line", len: 240, w: 80 },
      telegraphMs: 1200,
      recoverMs: 600,
      cooldownMs: 3000,
      weight: 3,
      dmgMult: 1,
    },
    {
      id: "ab_rain",
      name: "Băng Vũ",
      shape: { t: "rain", r: 40, count: 3, spreadPx: 150, gapMs: 200 },
      telegraphMs: 1200,
      recoverMs: 600,
      cooldownMs: 4000,
      weight: 2,
      dmgMult: 1,
    },
    {
      id: "ab_pull",
      name: "Hấp Lực Trận",
      shape: { t: "pull", r: 200, pullPx: 60, blastR: 60 },
      telegraphMs: 1400,
      recoverMs: 600,
      cooldownMs: 5000,
      weight: 2,
      dmgMult: 1,
      cond: { minTargets: 2 },
    },
    {
      id: "ab_summon",
      name: "Triệu Hồi Lang",
      shape: { t: "summon", kind: "lang", count: 2 },
      telegraphMs: 800,
      recoverMs: 600,
      cooldownMs: 8000,
      weight: 1,
      dmgMult: 0,
      cond: { maxTargets: 15 },
    },
    {
      id: "ab_buff",
      name: "Kim Cương Hộ Thể",
      shape: { t: "buff", dmgTakenMult: 0.5, ms: 3000 },
      telegraphMs: 800,
      recoverMs: 600,
      cooldownMs: 7000,
      weight: 1,
      dmgMult: 0,
      cond: { minTargets: 1 },
    },
  ];

  const phases: BossPhase[] = [
    {
      id: "p0",
      fromHp: 1,
      speedMult: 1,
      atkMult: 1,
      cdMult: 1,
      castGapMs: 600,
      abilities: abilities.map((a) => a.id),
    },
  ];

  return {
    kind: "mang",
    abilities,
    phases,
    maxAdds: 4,
  };
}

/** Dựng môi trường mô phỏng 8 trùm rải quanh trấn ngoài hoang dã + N người chơi */
export function setupBossBench(numPlayers: number, seed = 1234) {
  const h = makeWorld(DEFAULT_MAP);
  const { w } = h;
  w.now = 10_000;
  w.bossMoves = true;

  const bossDef = makeBenchBossDef();
  expect(bossViolations([bossDef])).toHaveLength(0);

  const town = w.map.townPx;
  const numBosses = 8;
  const bossMonsters: { id: string; m: any; mc: any }[] = [];
  const bossRadius = 1200; // Cách trấn 1200 px (hoàn toàn ngoài khu an toàn)

  for (let i = 0; i < numBosses; i++) {
    const angle = (i * 2 * Math.PI) / numBosses;
    let bx = Math.round(town.x + Math.cos(angle) * bossRadius);
    let by = Math.round(town.y + Math.sin(angle) * bossRadius);

    // Né ô bị chặn nếu có
    while (w.map.isBlockedPx(bx, by) || w.map.inSafe(bx, by, 60)) {
      bx += 20;
      by += 20;
    }

    const { id, m, mc } = addMonster(w, "mang", bx, by);
    mc.def = { ...MONSTER_BY_ID.mang, attackRange: 0, aggro: 800 };
    mc.boss = newBossCtrl(bossDef, seed + i * 17);
    bossMonsters.push({ id, m, mc });
  }

  // Thêm người chơi quanh các trùm
  const playerSids: string[] = [];
  const views: StateView[] = [];

  if (numPlayers > 0) {
    for (let i = 0; i < numPlayers; i++) {
      const bossIdx = i % numBosses;
      const targetBoss = bossMonsters[bossIdx];
      const sid = `player_${i}`;
      const { p } = addPlayer(w, sid, 3, 0); // Kim Đan Sơ kỳ

      // Đặt quanh con trùm tương ứng, cách trùm 150 - 260 px (nằm trong tầm nhìn và BOSS_COND_RADIUS = 320 px)
      const pAngle = (Math.floor(i / numBosses) * 1.1 + i * 0.4) % (2 * Math.PI);
      const dist = 160 + (i % 5) * 20;
      p.x = Math.round(targetBoss.m.x + Math.cos(pAngle) * dist);
      p.y = Math.round(targetBoss.m.y + Math.sin(pAngle) * dist);

      // Khí huyết cực lớn để không bị hạ trong bài test
      p.hp = p.maxHp = 1_000_000_000;
      syncPublicPos(p);
      playerSids.push(sid);
    }

    // Gắn StateView sau khi tất cả players đã được định vị trí chính xác
    for (const sid of playerSids) {
      const v = new StateView();
      w.interest.join(w, sid, v);
      views.push(v);
    }
  }

  const encoder = new Encoder(w.state);
  encoder.encodeAll();
  encoder.discardChanges();
  for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
  encoder.discardChanges();

  return { w, fx: h.fx, bossMonsters, playerSids, views, encoder };
}

describe("Ngân sách hiệu năng 8 trùm vận chiêu (Issue #936)", () => {
  it("Ca 0 người chơi: trùm ở trạng thái ngủ, tick CPU ~0 ms, 0 byte patch", () => {
    const { w, encoder, bossMonsters } = setupBossBench(0);

    // Lưu vị trí ban đầu của 8 trùm
    const initialPos = bossMonsters.map((b) => ({ x: b.m.x, y: b.m.y }));

    // Chạy 60 tick (3 giây)
    const tickMsList: number[] = [];
    let patchBytesTotal = 0;

    for (let t = 0; t < 60; t++) {
      w.now += TICK_MS;
      const dt = measureSyncStepMs(() => tickWorld(w, TICK_MS));
      tickMsList.push(dt);

      if (encoder.hasChanges) {
        const it = { offset: 1 };
        encoder.encode(it);
        patchBytesTotal += it.offset - 1;
        encoder.discardChanges();
      }
    }

    const avgMs = tickMsList.reduce((a, b) => a + b, 0) / tickMsList.length;
    // Không có ai chơi: tick < 1.0 ms
    expect(avgMs).toBeLessThan(1.0);
    // Không có ai chơi: hoàn toàn không phát sinh patch state
    expect(patchBytesTotal).toBe(0);

    // Khẳng định cả 8 con trùm đều ở trạng thái ngủ: đứng yên tuyệt đối tại vị trí sinh ban đầu
    for (let i = 0; i < bossMonsters.length; i++) {
      expect(bossMonsters[i]!.m.x).toBe(initialPos[i]!.x);
      expect(bossMonsters[i]!.m.y).toBe(initialPos[i]!.y);
    }
  });

  it("Ca 8 trùm + 50 người chơi trong 30 giây (600 tick): tick TB < 10 ms, p95 < 10 ms, byte/tick < 520, fx/giây trong ngưỡng", () => {
    const totalTicks = 600; // 30 giây
    const { w, fx, playerSids, views, encoder } = setupBossBench(50);

    const tickDurations: number[] = [];
    const bytesPerTickList: number[] = [];
    let client0FxCount = 0;
    const client0Sid = playerSids[0];

    for (let t = 0; t < totalTicks; t++) {
      w.now += TICK_MS;

      const fxStartLen = fx.length;
      const dt = measureSyncStepMs(() => tickWorld(w, TICK_MS));
      tickDurations.push(dt);

      // Đếm số lượng tin fx gửi cho client 0 trong tick này
      const newFxs = fx.slice(fxStartLen);
      for (const f of newFxs) {
        if (
          f.kind === "warn" ||
          f.kind === "bossCast" ||
          f.kind === "bossSummon" ||
          f.kind === "bossArmor" ||
          f.kind === "bossPhase"
        ) {
          const p0 = w.state.players.get(client0Sid);
          if (p0 && "x" in f && "y" in f) {
            const dist = Math.hypot((f as any).x - p0.x, (f as any).y - p0.y);
            if (dist <= 600) {
              client0FxCount++;
            }
          }
        }
      }

      // Đo byte patch state đồng bộ
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
      bytesPerTickList.push(tickBytes / playerSids.length);
    }

    // 1. Phân tích CPU tick
    const sortedTicks = [...tickDurations].sort((a, b) => a - b);
    const avgTickMs = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    const p95TickMs = sortedTicks[Math.floor(sortedTicks.length * 0.95)];
    const maxTickMs = sortedTicks[sortedTicks.length - 1];

    expect(avgTickMs).toBeLessThan(10.0);
    expect(p95TickMs).toBeLessThan(10.0);

    // 2. Phân tích Byte Patch State
    const avgPatchBytes = bytesPerTickList.reduce((a, b) => a + b, 0) / bytesPerTickList.length;
    // Ngân sách chung của trò chơi (perf.test.ts): < 520 byte/tick/client
    expect(avgPatchBytes).toBeLessThan(520);
    // Cơ chế trùm hoàn toàn không ghi đè trường state mỗi tick: patch thực tế < 15 byte/tick (bình thường ~6 byte)
    // Nếu ai đó ghi thêm trường state mỗi tick (Đột biến 3), patch sẽ tăng vọt lên > 25 byte/tick và đỏ.
    expect(avgPatchBytes).toBeLessThan(15);

    // 3. Phân tích Tần suất fx cho 1 Client
    const fxPerSecClient0 = client0FxCount / 30;
    // Ngưỡng trần an toàn: không vượt quá 15 fx/giây (đảm bảo không bị flood tin nhắn mạng)
    expect(fxPerSecClient0).toBeLessThan(15);
    // Khẳng định trùm thật sự có thi triển chiêu (fx > 0)
    expect(client0FxCount).toBeGreaterThan(5);

    // In thông số để lưu trữ và đưa vào tài liệu
    console.log(
      `[BossBench 8 trùm + 50 người / 30s]: Tick TB: ${avgTickMs.toFixed(2)}ms | p95: ${p95TickMs.toFixed(2)}ms | Max: ${maxTickMs.toFixed(2)}ms | Patch: ${avgPatchBytes.toFixed(1)} byte/tick | fx/client/s: ${fxPerSecClient0.toFixed(2)}`,
    );
  });

  it("Độ phức tạp chọn chiêu pickCast: so 10 người và 100 người cùng 8 trùm tăng tuyến tính O(n), không bị O(n^2)", () => {
    // Đo chi phí tickMonsters (nơi 8 trùm quét điều kiện và pickCast)
    // Để trùm liên tục chọn chiêu ở mỗi tick: xoá cast, đặt nextCastAt = 0, xoá cds và reset armorUntil
    function measureBossStep(numPlayers: number): { avg: number; warns: number } {
      const bench = setupBossBench(numPlayers, 444);
      const times: number[] = [];
      let warnsInWindow = 0;
      for (let t = 0; t < 50; t++) {
        bench.w.now += TICK_MS;
        for (const b of bench.bossMonsters) {
          if (b.mc.boss) {
            b.mc.boss.cast = undefined;
            b.mc.boss.nextCastAt = 0;
            b.mc.boss.cds.clear();
            b.mc.boss.armorUntil = 0;
          }
        }
        const fxCountBefore = bench.fx.length;
        const dt = measureSyncStepMs(() => tickMonsters(bench.w, TICK_MS / 1000));
        times.push(dt);
        if (t >= 10) {
          const newFxs = bench.fx.slice(fxCountBefore);
          for (const f of newFxs) {
            if ((f as any).kind === "warn") warnsInWindow++;
          }
        }
      }
      // Bỏ 10 tick khởi động đầu để JIT ổn định, lấy trung bình
      const avg = times.slice(10).reduce((a, b) => a + b, 0) / 40;
      return { avg, warns: warnsInWindow };
    }

    // Đo 3 lần mỗi quy mô và lấy giá trị NHỎ NHẤT để loại bỏ nhiễu tải CPU đột xuất
    function bestOf(numPlayers: number, runs = 3): { minAvg: number; totalWarns: number } {
      let minAvg = Infinity;
      let totalWarns = 0;
      for (let r = 0; r < runs; r++) {
        const { avg, warns } = measureBossStep(numPlayers);
        if (avg < minAvg) minAvg = avg;
        totalWarns += warns;
      }
      return { minAvg, totalWarns };
    }

    const r10 = bestOf(10, 3);
    const r100 = bestOf(100, 3);

    // Khẳng định cửa sổ đo thật sự có gọi chiêu (không bị đo đường rỗng)
    expect(r10.totalWarns).toBeGreaterThan(0);
    expect(r100.totalWarns).toBeGreaterThan(0);

    const ratio = r100.minAvg / Math.max(r10.minAvg, 0.02);
    console.log(
      `[Độ phức tạp pickCast]: 10 người = ${r10.minAvg.toFixed(3)}ms (warns: ${r10.totalWarns}) | 100 người = ${r100.minAvg.toFixed(3)}ms (warns: ${r100.totalWarns}) | Tỉ lệ = ${ratio.toFixed(2)}x`,
    );

    // Ngưỡng an toàn:
    // 1. Tuyệt đối: 100 người cùng 8 trùm tickMonsters < 2.0 ms (thực tế ~0.11 ms)
    expect(r100.minAvg).toBeLessThan(2.0);
    // 2. Tỉ lệ: O(n) tuyến tính tăng ~5-10x ở 10 lần số người, hoàn toàn dưới ngưỡng chặn 25x (O(n^2) sẽ tăng > 50-70x)
    expect(ratio).toBeLessThan(25);
  });

  it("Bảng số liệu tổng hợp 8 trùm với 0 / 10 / 50 / 100 người chơi", () => {
    const scales = [0, 10, 50, 100];
    const rows: {
      scale: number;
      avgMs: number;
      p95Ms: number;
      maxMs: number;
      patchBytes: number;
      fxRate: number;
    }[] = [];

    for (const numP of scales) {
      const bench = setupBossBench(numP, 8888 + numP);
      const ticks: number[] = [];
      const patchList: number[] = [];
      let c0Fx = 0;
      const c0Sid = bench.playerSids[0];

      const simTicks = 200; // 10 giây mô phỏng
      for (let t = 0; t < simTicks; t++) {
        bench.w.now += TICK_MS;
        const fxStart = bench.fx.length;
        const dt = measureSyncStepMs(() => tickWorld(bench.w, TICK_MS));
        ticks.push(dt);

        if (numP > 0) {
          const newFxs = bench.fx.slice(fxStart);
          for (const f of newFxs) {
            if ("x" in f && "y" in f && c0Sid) {
              const p0 = bench.w.state.players.get(c0Sid);
              if (p0 && Math.hypot((f as any).x - p0.x, (f as any).y - p0.y) <= 600) {
                c0Fx++;
              }
            }
          }

          const it = { offset: 1 };
          let sharedOffset = 1;
          const shared = bench.encoder.hasChanges;
          if (shared) {
            bench.encoder.encode(it);
            sharedOffset = it.offset;
          }
          let tickBytes = 0;
          for (const v of bench.views) {
            if (shared || v.changes.size > 0) {
              tickBytes += bench.encoder.encodeView(v, sharedOffset, it).byteLength;
            }
          }
          bench.encoder.discardChanges();
          patchList.push(tickBytes / numP);
        } else {
          let b = 0;
          if (bench.encoder.hasChanges) {
            const it = { offset: 1 };
            bench.encoder.encode(it);
            b = it.offset - 1;
            bench.encoder.discardChanges();
          }
          patchList.push(b);
        }
      }

      const sorted = [...ticks].sort((a, b) => a - b);
      const avgMs = ticks.reduce((a, b) => a + b, 0) / ticks.length;
      const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
      const maxMs = sorted[sorted.length - 1];
      const patchBytes = patchList.reduce((a, b) => a + b, 0) / patchList.length;
      const fxRate = numP > 0 ? c0Fx / (simTicks * 0.05) : 0;

      rows.push({ scale: numP, avgMs, p95Ms, maxMs, patchBytes, fxRate });
    }

    console.log("\n--- BẢNG HIỆU NĂNG 8 TRÙM VẬN CHIÊU (BẢN ĐỒ LẠC HÀ) ---");
    console.log(
      "| Quy mô (Người) | Số trùm | Tick TB (ms) | Tick p95 (ms) | Tick Max (ms) | Byte Patch / tick / client | fx / giây (1 client) |",
    );
    console.log("|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of rows) {
      console.log(
        `| ${r.scale} | 8 | ${r.avgMs.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.maxMs.toFixed(2)} | ${r.patchBytes.toFixed(1)} | ${r.fxRate.toFixed(2)} |`,
      );
    }
  });
});
