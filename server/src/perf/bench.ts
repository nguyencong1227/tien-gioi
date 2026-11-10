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
  DEFAULT_MAP,
  getMap,
  type GameMap,
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
  /** Tin nhắn ví Linh thạch (độ dài JSON + 4 byte khung): KB/giây mỗi client nhận (chỉ gửi khi số dư đổi) (#102) */
  walletKbPerClient: number;
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
  map: GameMap = DEFAULT_MAP,
): BenchResult {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    // Đếm tin nhắn có vị trí: byte nếu broadcast cho cả phòng, và byte thật sự gửi khi cắt theo vùng nhìn
    let evBroadcast = 0;
    let evNear = 0;
    let partyBytes = 0;
    let walletBytes = 0;
    const emit = (type: string, x: number, y: number, extra: number, msg: object) => {
      const size = JSON.stringify(msg).length + type.length + 4;
      evBroadcast += size * players;
      w.interest.forEachNear(w, x, y, VIEW_ENTER + extra, () => (evNear += size));
    };
    const w = new World(
      new WorldState(),
      {
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
        wallet: (_sid, msg) => {
          walletBytes += JSON.stringify(msg).length + 6 + 4; // "wallet".length = 6
        },
        chatTo: () => {},
        limbo: () => {},
        soul: () => {},
        reborn: () => {},
        dungeonInvite: () => {},
        dungeonEnd: () => {},
        dungeonState: () => {},
        dungeonFallen: () => {},
        duelInvited: () => {},
        duelState: () => {},
        duelEnd: () => {},
      },
      map,
    );
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
        const r = Math.sqrt(Math.random()) * w.map.townPx.r * 0.9;
        p.x = w.map.townPx.x + Math.cos(a) * r;
        p.y = w.map.townPx.y + Math.sin(a) * r;
      } else {
        for (;;) {
          const a = Math.random() * Math.PI * 2;
          const r = w.map.townPx.r + 80 + Math.random() * (w.map.worldW * 0.45 - w.map.townPx.r);
          const x = w.map.townPx.x + Math.cos(a) * r;
          const y = w.map.townPx.y + Math.sin(a) * r;
          if (!w.map.circleBlocked(x, y, 12) && w.map.dangerAt(x, y) < 0.9) {
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
            const tx = w.map.townPx.x - p.x;
            const ty = w.map.townPx.y - p.y;
            if (Math.hypot(tx, ty) > w.map.townPx.r) b.angle = Math.atan2(ty, tx); // ra khỏi trấn thì quay về
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
      walletKbPerClient: players > 0 ? walletBytes / players / seconds / 1024 : 0,
    };
  } finally {
    Math.random = realRandom;
  }
}

export interface MultiMapRoomConfig {
  mapId: string;
  players: number;
  mode?: BenchMode;
}

export interface MultiMapRoomResult {
  mapId: string;
  mapName: string;
  players: number;
  monsters: number;
  patchBytes: number;
  kbPerSecPerClient: number;
  eventKbBroadcast: number;
  eventKbNear: number;
  partyKbPerClient: number;
  walletKbPerClient: number;
}

export interface MultiMapBenchResult {
  seconds: number;
  ticks: number;
  totalPlayers: number;
  totalMonsters: number;
  avgTotalMs: number;
  p95TotalMs: number;
  maxTotalMs: number;
  rooms: MultiMapRoomResult[];
}

/**
 * Benchmark ca nhiều World (nhiều phòng bản đồ) chạy đồng thời trên cùng một tiến trình Node.js (#141).
 * Mỗi phòng một World với GameMap riêng. Trong mỗi tick 50 ms, server xử lý tuần tự từng phòng;
 * thời gian tick của tiến trình là TỔNG thời gian xử lý của tất cả các phòng (ngân sách tổng < 10 ms).
 */
export function runMultiMapBench(
  roomsConfig: MultiMapRoomConfig[],
  seconds: number,
  seed = 1,
): MultiMapBenchResult {
  const realRandom = Math.random;
  Math.random = seeded(seed);
  try {
    const rooms = roomsConfig.map((cfg, rIdx) => {
      const map = getMap(cfg.mapId) ?? DEFAULT_MAP;
      const players = cfg.players;
      const mode = cfg.mode ?? "hunt";
      let evBroadcast = 0;
      let evNear = 0;
      let partyBytes = 0;
      let walletBytes = 0;

      const emit = (type: string, x: number, y: number, extra: number, msg: object) => {
        const size = JSON.stringify(msg).length + type.length + 4;
        evBroadcast += size * players;
        w.interest.forEachNear(w, x, y, VIEW_ENTER + extra, () => (evNear += size));
      };

      const w = new World(
        new WorldState(),
        {
          fx: (m) => emit("fx", m.x, m.y, "range" in m ? m.range : 0, m),
          dmg: (m) => emit("dmg", m.x, m.y, 0, m),
          sys: () => {},
          chat: () => {},
          toast: () => {},
          inv: () => {},
          quests: () => {},
          dialog: () => {},
          party: (_sid, msg) => {
            partyBytes += JSON.stringify(msg).length + 5 + 4;
          },
          partyInvited: () => {},
          wallet: (_sid, msg) => {
            walletBytes += JSON.stringify(msg).length + 6 + 4;
          },
          chatTo: () => {},
          limbo: () => {},
          soul: () => {},
          reborn: () => {},
          dungeonInvite: () => {},
          dungeonEnd: () => {},
          dungeonState: () => {},
          dungeonFallen: () => {},
          duelInvited: () => {},
          duelState: () => {},
          duelEnd: () => {},
        },
        map,
      );
      w.now = 0;
      spawnInitial(w);

      const bots: {
        sid: string;
        seq: number;
        target: string | null;
        walking: boolean;
        angle: number;
        until: number;
      }[] = [];

      for (let i = 0; i < players; i++) {
        const sid = `r${rIdx}_bot${i}`;
        const realm = Math.random() < 0.8 ? 1 : 2;
        const tier = Math.floor(Math.random() * REALMS[realm].tiers.length);
        const { p } = addPlayer(w, sid, realm, tier);
        if (mode === "crowd") {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * w.map.townPx.r * 0.9;
          p.x = w.map.townPx.x + Math.cos(a) * r;
          p.y = w.map.townPx.y + Math.sin(a) * r;
        } else {
          for (;;) {
            const a = Math.random() * Math.PI * 2;
            const r = w.map.townPx.r + 80 + Math.random() * (w.map.worldW * 0.45 - w.map.townPx.r);
            const x = w.map.townPx.x + Math.cos(a) * r;
            const y = w.map.townPx.y + Math.sin(a) * r;
            if (!w.map.circleBlocked(x, y, 12) && w.map.dangerAt(x, y) < 0.9) {
              p.x = x;
              p.y = y;
              break;
            }
          }
        }
        bots.push({ sid, seq: 0, target: null, walking: false, angle: 0, until: 0 });
      }

      for (const b of bots) syncPublicPos(w.state.players.get(b.sid)!);

      for (let i = 0; i < players; i += 4) {
        const leader = `r${rIdx}_bot${i}`;
        const members: string[] = [];
        for (let j = 1; j < 4 && i + j < players; j++) {
          members.push(`r${rIdx}_bot${i + j}`);
        }
        if (members.length > 0) {
          const party = w.parties._create(leader, members[0]);
          for (let k = 1; k < members.length; k++) {
            w.parties._join(party, members[k]);
          }
        }
      }

      const views: StateView[] = [];
      for (const b of bots) {
        const v = new StateView();
        w.interest.join(w, b.sid, v);
        views.push(v);
      }

      const encoder = new Encoder(w.state);
      encoder.encodeAll();
      encoder.discardChanges();
      for (const v of views) encoder.encodeView(v, 1, { offset: 1 });
      encoder.discardChanges();

      return {
        cfg,
        w,
        map,
        players,
        mode,
        bots,
        views,
        encoder,
        nextTopUp: MONSTER_RESPAWN_MS,
        bytes: 0,
        getEvBroadcast: () => evBroadcast,
        getEvNear: () => evNear,
        getPartyBytes: () => partyBytes,
        getWalletBytes: () => walletBytes,
      };
    });

    const ticks = Math.round((seconds * 1000) / TICK_MS);
    const times: number[] = [];

    for (let t = 0; t < ticks; t++) {
      const roomIntents: { sid: string; angle: number }[][] = [];
      for (const room of rooms) {
        room.w.now += TICK_MS;
        const intents: { sid: string; angle: number }[] = [];
        for (const b of room.bots) {
          const p = room.w.state.players.get(b.sid)!;
          const c = room.w.ctrl.get(b.sid)!;
          if (p.dead) continue;
          if (room.mode === "crowd") {
            if (t >= b.until) {
              b.walking = Math.random() >= CROWD_IDLE;
              b.angle = Math.random() * Math.PI * 2;
              b.until = t + 20 + Math.floor(Math.random() * 60);
            }
            if (b.walking) {
              const tx = room.w.map.townPx.x - p.x;
              const ty = room.w.map.townPx.y - p.y;
              if (Math.hypot(tx, ty) > room.w.map.townPx.r) b.angle = Math.atan2(ty, tx);
              c.inputs.push({ seq: ++b.seq, dx: Math.cos(b.angle), dy: Math.sin(b.angle) });
            }
            continue;
          }
          let m = b.target ? room.w.state.monsters.get(b.target) : undefined;
          if (!m || t % 40 === 0) {
            let best = Infinity;
            room.w.state.monsters.forEach((mon, id) => {
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
          else if (room.w.now >= c.nextSlash)
            intents.push({ sid: b.sid, angle: Math.atan2(dy, dx) });
        }
        roomIntents.push(intents);
      }

      const t0 = performance.now();
      for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
        const room = rooms[rIdx];
        const intents = roomIntents[rIdx];
        for (const i of intents) slash(room.w, i.sid, i.angle);
        tickWorld(room.w, TICK_MS);
        if (room.w.now >= room.nextTopUp) {
          topUpMonsters(room.w);
          room.nextTopUp += MONSTER_RESPAWN_MS;
        }
        const it = { offset: 1 };
        let sharedOffset = 1;
        const shared = room.encoder.hasChanges;
        if (shared) {
          room.encoder.encode(it);
          sharedOffset = it.offset;
        }
        let tickBytes = 0;
        for (const v of room.views) {
          if (shared || v.changes.size > 0)
            tickBytes += room.encoder.encodeView(v, sharedOffset, it).byteLength;
        }
        room.encoder.discardChanges();
        room.bytes += room.players > 0 ? tickBytes / room.players : 0;
      }
      times.push(performance.now() - t0);
    }

    times.sort((a, b) => a - b);
    const avgTotalMs = times.reduce((s, x) => s + x, 0) / times.length;
    const p95TotalMs = times[Math.floor(times.length * 0.95)];
    const maxTotalMs = times.at(-1)!;

    const roomResults: MultiMapRoomResult[] = rooms.map((room) => {
      const patchBytes = room.bytes / ticks;
      const p = room.players;
      return {
        mapId: room.map.def.id,
        mapName: room.map.def.name,
        players: p,
        monsters: room.w.state.monsters.size,
        patchBytes,
        kbPerSecPerClient: (patchBytes * (1000 / TICK_MS)) / 1024,
        eventKbBroadcast: p > 0 ? room.getEvBroadcast() / p / seconds / 1024 : 0,
        eventKbNear: p > 0 ? room.getEvNear() / p / seconds / 1024 : 0,
        partyKbPerClient: p > 0 ? room.getPartyBytes() / p / seconds / 1024 : 0,
        walletKbPerClient: p > 0 ? room.getWalletBytes() / p / seconds / 1024 : 0,
      };
    });

    return {
      seconds,
      ticks,
      totalPlayers: rooms.reduce((s, r) => s + r.players, 0),
      totalMonsters: rooms.reduce((s, r) => s + r.w.state.monsters.size, 0),
      avgTotalMs,
      p95TotalMs,
      maxTotalMs,
      rooms: roomResults,
    };
  } finally {
    Math.random = realRandom;
  }
}

export interface BenchOutput {
  mode: BenchMode;
  seconds: number;
  seed: number;
  mapId?: string;
  timestamp: string;
  results: BenchResult[];
  multiMap?: MultiMapBenchResult;
}

if (process.argv[1]?.endsWith("bench.ts")) {
  const seconds = arg("seconds", 60);
  const mode: BenchMode = process.argv.includes("--crowd") ? "crowd" : "hunt";
  const mapArg = process.argv.find((a) => a.startsWith("--map="));
  const targetMapId = mapArg ? mapArg.slice(6) : DEFAULT_MAP.def.id;
  const targetMap = getMap(targetMapId) ?? DEFAULT_MAP;
  const isMulti = process.argv.includes("--multi");

  const jsonArg = process.argv.find((a) => a === "--json" || a.startsWith("--json="));
  const jsonPath = jsonArg ? (jsonArg.startsWith("--json=") ? jsonArg.slice(7) : "") : null;

  if (isMulti) {
    console.log(
      `Mô phỏng nhiều World đồng thời trong một tiến trình (${seconds}s = ${seconds * 20} tick), ngân sách tổng < 10 ms (#141)\n`,
    );
    const multiRes = runMultiMapBench(
      [
        { mapId: "lac_ha", players: 50, mode },
        { mapId: "hac_phong", players: 50, mode },
      ],
      seconds,
      1,
    );

    console.log(
      `Tổng người chơi: ${multiRes.totalPlayers} | Tổng quái: ${multiRes.totalMonsters} | Tick TB: ${multiRes.avgTotalMs.toFixed(3)} ms | p95: ${multiRes.p95TotalMs.toFixed(3)} ms | Max: ${multiRes.maxTotalMs.toFixed(2)} ms`,
    );
    console.log(
      `Trạng thái ngân sách tick tổng (< 10 ms): ${multiRes.avgTotalMs < 10 && multiRes.p95TotalMs < 10 ? "✅ ĐẠT" : "❌ VƯỢT NGÂN SÁCH"}\n`,
    );
    console.log(
      "| Bản đồ | Người chơi | Quái | Patch TB (byte) | KB/s mỗi client | Party (KB/s) | Wallet (KB/s) |",
    );
    console.log("|---|---:|---:|---:|---:|---:|---:|");
    for (const r of multiRes.rooms) {
      console.log(
        `| ${r.mapName} (${r.mapId}) | ${r.players} | ${r.monsters} | ${Math.round(r.patchBytes)} | ${r.kbPerSecPerClient.toFixed(1)} | ${r.partyKbPerClient.toFixed(2)} | ${r.walletKbPerClient.toFixed(2)} |`,
      );
    }

    if (jsonPath !== null) {
      const data: BenchOutput = {
        mode,
        seconds,
        seed: 1,
        timestamp: new Date().toISOString(),
        results: [],
        multiMap: multiRes,
      };
      if (jsonPath) {
        writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
        console.log(`\nĐã ghi kết quả JSON vào ${jsonPath}`);
      } else {
        console.log("\n" + JSON.stringify(data, null, 2));
      }
    }
  } else {
    const counts = process.argv.includes("--players") ? [arg("players", 100)] : [0, 10, 50, 100];
    console.log(
      `Mô phỏng ${seconds} giây chơi (${seconds * 20} tick), bản đồ ${targetMap.def.name} (${targetMap.def.id}), đo tick + mã hóa patch, ca ${mode === "crowd" ? "đông người tụ trong trấn" : "săn quái ngoài hoang dã"}\n`,
    );
    console.log(
      "| Người chơi | Quái | Tick TB (ms) | p95 (ms) | Max (ms) | Patch TB (byte) | KB/s mỗi client | fx+dmg cả phòng (KB/s) | fx+dmg vùng nhìn (KB/s) | Party (KB/s) | Wallet (KB/s) |",
    );
    console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    const results: BenchResult[] = [];
    for (const n of counts) {
      const r = runBench(n, seconds, 1, mode, targetMap);
      results.push(r);
      console.log(
        `| ${n} | ${r.monsters} | ${r.avgMs.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.maxMs.toFixed(2)} | ${Math.round(r.patchBytes)} | ${r.kbPerSecPerClient.toFixed(1)} | ${r.eventKbBroadcast.toFixed(1)} | ${r.eventKbNear.toFixed(1)} | ${r.partyKbPerClient.toFixed(2)} | ${r.walletKbPerClient.toFixed(2)} |`,
      );
    }

    if (jsonPath !== null) {
      const data: BenchOutput = {
        mode,
        seconds,
        seed: 1,
        mapId: targetMap.def.id,
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
}
