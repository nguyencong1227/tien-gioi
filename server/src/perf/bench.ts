// Benchmark một tick server, không cần mạng: N người chơi giả đi săn quái trong World thật.
// Đo thời gian mỗi tick (mục tiêu < 10 ms, xem #29) và số byte patch state gửi cho mỗi client
// (mã hóa riêng theo StateView của từng client, như SchemaSerializer.applyPatches, xem #62).
// Chạy: npm run bench -w server [-- --players 100 --seconds 60]
// Dùng để so trước / sau khi tối ưu; kết quả in ra bảng, không ghi file.
import { performance } from "node:perf_hooks";
import { Encoder, StateView } from "@colyseus/schema";
import {
  MONSTER_BY_ID,
  MONSTER_RESPAWN_MS,
  REALMS,
  SKILLS,
  TICK_MS,
  TOWN_PX,
  WORLD_W,
  circleBlocked,
  dangerAt,
} from "@tien-gioi/shared";
import { WorldState } from "../schema";
import { World } from "../world";
import { addPlayer } from "../systems/test-helpers";
import { slash } from "../systems/combat";
import { spawnInitial, topUpMonsters } from "../systems/monsters";
import { tickWorld } from "../systems/tick";

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
}

/** PRNG có seed để hai lần chạy giống nhau (so trước / sau tối ưu cho công bằng) */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchResult {
  players: number;
  monsters: number;
  ticks: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  /** Byte patch trung bình mỗi client mỗi tick (gồm phần chung + phần theo vùng nhìn) */
  patchBytes: number;
  /** KB/giây mỗi client nhận (patch × 20 tick) */
  kbPerSecPerClient: number;
}

export function runBench(players: number, seconds: number, seed = 1): BenchResult {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    const w = new World(new WorldState(), {
      fx: () => {},
      dmg: () => {},
      sys: () => {},
      chat: () => {},
      toast: () => {},
      inv: () => {},
      quests: () => {},
      dialog: () => {},
    });
    w.now = 0;
    spawnInitial(w);

    // Người chơi rải ở vùng hoang dã, cảnh giới ngẫu nhiên Luyện Khí 1–9 / Trúc Cơ
    const bots: { sid: string; seq: number; target: string | null }[] = [];
    for (let i = 0; i < players; i++) {
      const sid = `bot${i}`;
      const realm = Math.random() < 0.8 ? 1 : 2;
      const tier = Math.floor(Math.random() * REALMS[realm].tiers.length);
      const { p } = addPlayer(w, sid, realm, tier);
      for (;;) {
        const a = Math.random() * Math.PI * 2;
        const r = TOWN_PX.r + 80 + Math.random() * (WORLD_W * 0.45 - TOWN_PX.r);
        const x = TOWN_PX.x + Math.cos(a) * r;
        const y = TOWN_PX.y + Math.sin(a) * r;
        if (!circleBlocked(x, y, 12) && dangerAt(x, y) < 0.9) {
          p.x = x;
          p.y = y;
          break;
        }
      }
      bots.push({ sid, seq: 0, target: null });
    }
    // Vùng nhìn: đăng ký sau khi đã đặt vị trí, như WorldRoom.onJoin
    const views: StateView[] = [];
    for (const b of bots) {
      const v = new StateView();
      w.interest.join(w, b.sid, v);
      views.push(v);
    }

    const encoder = new Encoder(w.state);
    encoder.encodeAll();
    encoder.discardChanges();
    // Thực tế phần thực thể ban đầu đi trong gói state đầy đủ lúc vào phòng, không tính là patch
    for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
    encoder.discardChanges();

    const ticks = Math.round((seconds * 1000) / TICK_MS);
    const times: number[] = [];
    let bytes = 0;
    let nextTopUp = MONSTER_RESPAWN_MS;

    for (let t = 0; t < ticks; t++) {
      w.now += TICK_MS;

      // Bot "client": chọn quái gần nhất, đi tới, vào tầm thì chém (không tính vào thời gian tick)
      const intents: { sid: string; angle: number }[] = [];
      for (const b of bots) {
        const p = w.state.players.get(b.sid)!;
        const c = w.ctrl.get(b.sid)!;
        if (p.dead) continue;
        let m = b.target ? w.state.monsters.get(b.target) : undefined;
        if (!m || t % 40 === 0) {
          let best = Infinity;
          w.state.monsters.forEach((mon, id) => {
            const d = Math.hypot(mon.x - p.x, mon.y - p.y);
            if (d < best) {
              best = d;
              b.target = id;
              m = mon;
            }
          });
        }
        if (!m) continue;
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const d = Math.hypot(dx, dy);
        const reach = SKILLS.slash.range + MONSTER_BY_ID[m.kind].radius - 4;
        if (d > reach) c.inputs.push({ seq: ++b.seq, dx: dx / d, dy: dy / d });
        else if (w.now >= c.nextSlash) intents.push({ sid: b.sid, angle: Math.atan2(dy, dx) });
      }

      const t0 = performance.now();
      for (const i of intents) slash(w, i.sid, i.angle);
      tickWorld(w, TICK_MS);
      if (w.now >= nextTopUp) {
        topUpMonsters(w);
        nextTopUp += MONSTER_RESPAWN_MS;
      }
      // Như SchemaSerializer.applyPatches: một patch chung, rồi mỗi client một bản theo view của nó
      const it = { offset: 1 };
      let sharedOffset = 1;
      const shared = encoder.hasChanges;
      if (shared) {
        encoder.encode(it);
        sharedOffset = it.offset;
      }
      let tickBytes = 0;
      for (const v of views) {
        if (shared || v.changes.size > 0)
          tickBytes += encoder.encodeView(v, sharedOffset, it).byteLength;
      }
      encoder.discardChanges();
      times.push(performance.now() - t0);
      bytes += players > 0 ? tickBytes / players : 0;
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((s, x) => s + x, 0) / times.length;
    const patchBytes = bytes / ticks;
    return {
      players,
      monsters: w.state.monsters.size,
      ticks,
      avgMs: avg,
      p95Ms: times[Math.floor(times.length * 0.95)],
      maxMs: times.at(-1)!,
      patchBytes,
      kbPerSecPerClient: (patchBytes * (1000 / TICK_MS)) / 1024,
    };
  } finally {
    Math.random = realRandom;
  }
}

if (process.argv[1]?.endsWith("bench.ts")) {
  const seconds = arg("seconds", 60);
  const counts = process.argv.includes("--players") ? [arg("players", 100)] : [0, 10, 50, 100];
  console.log(`Mô phỏng ${seconds} giây chơi (${seconds * 20} tick), đo tick + mã hóa patch\n`);
  console.log(
    "| Người chơi | Quái | Tick TB (ms) | p95 (ms) | Max (ms) | Patch TB (byte) | KB/s mỗi client |",
  );
  console.log("|---:|---:|---:|---:|---:|---:|---:|");
  for (const n of counts) {
    const r = runBench(n, seconds);
    console.log(
      `| ${n} | ${r.monsters} | ${r.avgMs.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.maxMs.toFixed(2)} | ${Math.round(r.patchBytes)} | ${r.kbPerSecPerClient.toFixed(1)} |`,
    );
  }
}
