// Benchmark một tick server, không cần mạng: N người chơi giả đi săn quái trong World thật.
// Đo thời gian mỗi tick (mục tiêu < 10 ms, xem #29) và số byte patch state gửi cho mỗi client
// (mã hóa riêng theo StateView của từng client, như SchemaSerializer.applyPatches, xem #62).
// Chạy: npm run bench -w server [-- --players 100 --seconds 60] [--crowd: tụ trong trấn, ca xấu nhất của vùng nhìn]
// Dùng để so trước / sau khi tối ưu; kết quả in ra bảng, không ghi file.
import { writeFileSync } from "node:fs";
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
import { syncPublicPos } from "../systems/movement";
import { VIEW_ENTER } from "../systems/interest";

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
  /**
   * Tin nhắn fx / dmg (ước lượng bằng độ dài JSON + 4 byte khung): KB/giây mỗi client nếu gửi cho cả phòng
   * (cách cũ, broadcast) và nếu chỉ gửi cho người ở trong vùng nhìn (cách của server hiện tại).
   */
  eventKbBroadcast: number;
  eventKbNear: number;
  /** Tin nhắn tổ đội (độ dài JSON + 4 byte khung): KB/giây mỗi client nhận (đội 4 người, snapshot mỗi giây) */
  partyKbPerClient: number;
}

/**
 * "hunt": người chơi rải khắp vùng hoang dã, đi săn quái (mặc định).
 * "crowd" (#80): cả đám tụ trong Lạc Hà Trấn đi lại ngẫu nhiên, ~30% thời gian đứng yên, không đánh quái.
 * Ai cũng thấy nhau nên vùng nhìn không cắt được gì: đây là ca xấu nhất của StateView.
 */
export type BenchMode = "hunt" | "crowd";

/** Tỉ lệ thời gian một người trong ca "crowd" đứng yên */
const CROWD_IDLE = 0.3;

export function runBench(
  players: number,
  seconds: number,
  seed = 1,
  mode: BenchMode = "hunt",
): BenchResult {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    // Đếm tin nhắn có vị trí: byte nếu broadcast cho cả phòng, và byte thật sự gửi khi cắt theo vùng nhìn
    let evBroadcast = 0;
    let evNear = 0;
    let partyBytes = 0;
    const emit = (type: string, x: number, y: number, extra: number, msg: object) => {
      const size = JSON.stringify(msg).length + type.length + 4;
      evBroadcast += size * players;
      w.interest.forEachNear(w, x, y, VIEW_ENTER + extra, () => (evNear += size));
    };
    const w = new World(new WorldState(), {
      fx: (m) => emit("fx", m.x, m.y, "range" in m ? m.range : 0, m),
      dmg: (m) => emit("dmg", m.x, m.y, 0, m),
      sys: () => {},
      chat: () => {},
      toast: () => {},
      inv: () => {},
      quests: () => {},
      dialog: () => {},
      party: (_sid, msg) => {
        partyBytes += JSON.stringify(msg).length + 5 + 4; // "party".length = 5
      },
      partyInvited: () => {},
      wallet: () => {},
      chatTo: () => {},
    });
    w.now = 0;
    spawnInitial(w);

    // Người chơi rải ở vùng hoang dã, cảnh giới ngẫu nhiên Luyện Khí 1–9 / Trúc Cơ
    const bots: {
      sid: string;
      seq: number;
      target: string | null;
      // ca "crowd": đang đi hay đứng yên, hướng đi, tick đổi trạng thái kế tiếp
      walking: boolean;
      angle: number;
      until: number;
    }[] = [];
    for (let i = 0; i < players; i++) {
      const sid = `bot${i}`;
      const realm = Math.random() < 0.8 ? 1 : 2;
      const tier = Math.floor(Math.random() * REALMS[realm].tiers.length);
      const { p } = addPlayer(w, sid, realm, tier);
      if (mode === "crowd") {
        // Rải đều trong hình tròn của trấn (căn bậc hai để đều theo diện tích)
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * TOWN_PX.r * 0.9;
        p.x = TOWN_PX.x + Math.cos(a) * r;
        p.y = TOWN_PX.y + Math.sin(a) * r;
      } else {
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
      }
      bots.push({ sid, seq: 0, target: null, walking: false, angle: 0, until: 0 });
    }
    for (const b of bots) syncPublicPos(w.state.players.get(b.sid)!); // như WorldRoom.onJoin
    // Tổ đội: bot trong bench chia thành các đội 4 người (#76)
    for (let i = 0; i < players; i += 4) {
      const leader = `bot${i}`;
      const members: string[] = [];
      for (let j = 1; j < 4 && i + j < players; j++) {
        members.push(`bot${i + j}`);
      }
      if (members.length > 0) {
        const party = w.parties._create(leader, members[0]);
        for (let k = 1; k < members.length; k++) {
          w.parties._join(party, members[k]);
        }
      }
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
        if (mode === "crowd") {
          // Đi lại ngẫu nhiên trong trấn: mỗi 1–4 giây đổi giữa đi / đứng yên, đi thì chọn hướng mới
          if (t >= b.until) {
            b.walking = Math.random() >= CROWD_IDLE;
            b.angle = Math.random() * Math.PI * 2;
            b.until = t + 20 + Math.floor(Math.random() * 60);
          }
          if (b.walking) {
            const tx = TOWN_PX.x - p.x;
            const ty = TOWN_PX.y - p.y;
            if (Math.hypot(tx, ty) > TOWN_PX.r) b.angle = Math.atan2(ty, tx); // ra khỏi trấn thì quay về
            c.inputs.push({ seq: ++b.seq, dx: Math.cos(b.angle), dy: Math.sin(b.angle) });
          }
          continue;
        }
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
      eventKbBroadcast: players > 0 ? evBroadcast / players / seconds / 1024 : 0,
      eventKbNear: players > 0 ? evNear / players / seconds / 1024 : 0,
      partyKbPerClient: players > 0 ? partyBytes / players / seconds / 1024 : 0,
    };
  } finally {
    Math.random = realRandom;
  }
}

export interface BenchOutput {
  mode: BenchMode;
  seconds: number;
  seed: number;
  timestamp: string;
  results: BenchResult[];
}

if (process.argv[1]?.endsWith("bench.ts")) {
  const seconds = arg("seconds", 60);
  const mode: BenchMode = process.argv.includes("--crowd") ? "crowd" : "hunt";
  const counts = process.argv.includes("--players") ? [arg("players", 100)] : [0, 10, 50, 100];
  console.log(
    `Mô phỏng ${seconds} giây chơi (${seconds * 20} tick), đo tick + mã hóa patch, ca ${mode === "crowd" ? "đông người tụ trong trấn" : "săn quái ngoài hoang dã"}\n`,
  );
  console.log(
    "| Người chơi | Quái | Tick TB (ms) | p95 (ms) | Max (ms) | Patch TB (byte) | KB/s mỗi client | fx+dmg cả phòng (KB/s) | fx+dmg vùng nhìn (KB/s) | Party (KB/s) |",
  );
  console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  const results: BenchResult[] = [];
  for (const n of counts) {
    const r = runBench(n, seconds, 1, mode);
    results.push(r);
    console.log(
      `| ${n} | ${r.monsters} | ${r.avgMs.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.maxMs.toFixed(2)} | ${Math.round(r.patchBytes)} | ${r.kbPerSecPerClient.toFixed(1)} | ${r.eventKbBroadcast.toFixed(1)} | ${r.eventKbNear.toFixed(1)} | ${r.partyKbPerClient.toFixed(2)} |`,
    );
  }

  const jsonArg = process.argv.find((a) => a === "--json" || a.startsWith("--json="));
  if (jsonArg) {
    const jsonPath = jsonArg.startsWith("--json=") ? jsonArg.slice(7) : "";
    const data: BenchOutput = {
      mode,
      seconds,
      seed: 1,
      timestamp: new Date().toISOString(),
      results,
    };
    if (jsonPath) {
      writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
      console.log(`\nĐã ghi kết quả JSON vào ${jsonPath}`);
    } else {
      console.log("\n" + JSON.stringify(data, null, 2));
    }
  }
}
