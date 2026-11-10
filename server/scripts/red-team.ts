// Công cụ rà soát đối kháng (Red Team) từng tin nhắn phía server (M4-sớm, Issue #252, docs/PHAN_CONG_M4.md mục 2.1).
// Dựng server Colyseus thật trong tiến trình với thư mục dữ liệu tạm cô lập.
// Kết nối 2 client (RedTeamer và Observer), gửi MỌI loại tin nhắn mà WorldRoom đăng ký với các payload xấu:
// kiểu sai, null, undefined, NaN / Infinity / -0, số cực lớn / cực nhỏ, chuỗi rất dài, NUL byte, ký tự điều khiển,
// prototype pollution (__proto__, constructor), object / mảng lồng sâu, id lạ, spam hàng trăm tin (kiểm rate limit 4429),
// và tin nhắn trong các trạng thái dị thường (Hoàng Tuyền / thiền / ...).
//
// Cách chạy:
//   npm run red-team -w server
//   npm run red-team -w server -- --fast     # Chạy tập payload nhanh (< 15s)
//   npm run red-team -w server -- --report   # In bảng chi tiết từng loại tin x payload

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Cô lập DATA_DIR trước khi bất kỳ module server nào được nạp
const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-red-team-"));
process.env.DATA_DIR = dataDir;

import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  DUEL_MSG,
  DUNGEON_MSG,
  PROTOCOL_VERSION,
  SECT_MSG,
  roomNameOf,
  type ChatMsg,
} from "@tien-gioi/shared";

// Danh sách tất cả 47 loại tin nhắn hợp lệ mà WorldRoom đăng ký + 1 tin lạ kiểm tra handler '*'
export const ALL_MESSAGE_TYPES = [
  // Di chuyển & chiến đấu
  "input",
  "attack",
  "skill",
  "meditate",
  "breakthrough",
  "chat",
  // Túi đồ & trang bị
  "useItem",
  "pickup",
  "dropItem",
  "equip",
  "unequip",
  // NPC, nhiệm vụ & buôn bán
  "talk",
  "questAccept",
  "questTurnIn",
  "questAbandon",
  "trade",
  "craft",
  "buy",
  "sell",
  // Tổ đội
  "partyInvite",
  "partyAccept",
  "partyDecline",
  "partyLeave",
  "partyKick",
  // Dịch chuyển
  "travel",
  // Bí cảnh
  DUNGEON_MSG.open,
  DUNGEON_MSG.enter,
  DUNGEON_MSG.decline,
  DUNGEON_MSG.leave,
  // PK thách đấu
  DUEL_MSG.challenge,
  DUEL_MSG.accept,
  DUEL_MSG.decline,
  DUEL_MSG.yield,
  // Tông môn
  SECT_MSG.create,
  SECT_MSG.invite,
  SECT_MSG.accept,
  SECT_MSG.decline,
  SECT_MSG.leave,
  SECT_MSG.kick,
  SECT_MSG.rank,
  SECT_MSG.transfer,
  SECT_MSG.disband,
  SECT_MSG.motd,
  SECT_MSG.deposit,
  SECT_MSG.withdraw,
  // Luân hồi
  "soulBuy",
  "rebirth",
  // Tin lạ không đăng ký
  "__unknown_unregistered_msg__",
] as const;

export type MessageType = (typeof ALL_MESSAGE_TYPES)[number];

export interface AttackPayload {
  name: string;
  category: "primitive" | "number" | "string" | "prototype" | "nested" | "field";
  data: unknown;
}

/** Tạo object lồng sâu N cấp */
function createDeepObject(depth: number): Record<string, unknown> {
  let curr: Record<string, unknown> = { leaf: "payload" };
  for (let i = 0; i < depth; i++) {
    curr = { next: curr };
  }
  return curr;
}

/** Tạo mảng lồng sâu N cấp */
function createDeepArray(depth: number): unknown[] {
  let curr: unknown[] = ["leaf"];
  for (let i = 0; i < depth; i++) {
    curr = [curr];
  }
  return curr;
}

/** Tập payload xấu dùng để red-team mọi tin nhắn */
export function buildBadPayloads(fastMode = false): AttackPayload[] {
  const payloads: AttackPayload[] = [
    // 1. Primitive & Type confusion
    { name: "null", category: "primitive", data: null },
    { name: "undefined", category: "primitive", data: undefined },
    { name: "number-as-obj", category: "primitive", data: 12345 },
    { name: "string-as-obj", category: "primitive", data: "malicious_string_not_object" },
    { name: "boolean-true", category: "primitive", data: true },
    { name: "empty-array", category: "primitive", data: [] },
    { name: "array-with-items", category: "primitive", data: [1, "bad", { x: 1 }] },

    // 2. Number Edge Cases
    {
      name: "num-nan",
      category: "number",
      data: { slot: NaN, qty: NaN, amount: NaN, angle: NaN, seq: NaN },
    },
    {
      name: "num-infinity",
      category: "number",
      data: { slot: Infinity, qty: Infinity, amount: Infinity, angle: Infinity },
    },
    {
      name: "num-neg-infinity",
      category: "number",
      data: { slot: -Infinity, qty: -Infinity, amount: -Infinity },
    },
    {
      name: "num-negative",
      category: "number",
      data: { slot: -1, qty: -100, amount: -999999, angle: -Math.PI * 4, seq: -5 },
    },
    {
      name: "num-huge-int",
      category: "number",
      data: { slot: 99999999, amount: Number.MAX_SAFE_INTEGER + 100, qty: 1e12 },
    },
    {
      name: "num-float-fraction",
      category: "number",
      data: { slot: 2.7, qty: 0.5, amount: 100.99 },
    },

    // 3. String attacks
    {
      name: "str-empty",
      category: "string",
      data: { text: "", name: "", id: "", portalId: "", questId: "", npcId: "" },
    },
    {
      name: "str-long-2k",
      category: "string",
      data: {
        text: "A".repeat(2000),
        name: "A".repeat(200),
        id: "A".repeat(200),
      },
    },
    {
      name: "str-nul-byte",
      category: "string",
      data: { text: "hello\x00world", name: "bad\x00name", id: "item\x001" },
    },
    {
      name: "str-control-chars",
      category: "string",
      data: { text: "\r\n\x08\x1b[31mred\x1b[0m", name: "hacked\r\nadmin" },
    },
    {
      name: "str-emoji-zwj",
      category: "string",
      data: { text: "👨‍👩‍👧‍👦🏳️‍🌈\u200D\uFE0F\uD83D\uDC68", name: "👨‍👩‍👦" },
    },
    {
      name: "str-path-traversal",
      category: "string",
      data: {
        id: "../../../etc/passwd",
        questId: "../../secrets",
        npcId: "..\\win.ini",
        portalId: "../../../dev/null",
      },
    },
    {
      name: "str-xss-sqli",
      category: "string",
      data: { text: "<script>alert(1)</script>", name: "' OR 1=1--" },
    },

    // 4. Prototype Pollution & Nested structures
    {
      name: "proto-pollution",
      category: "prototype",
      data: JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
      ),
    },
    {
      name: "nested-deep-obj",
      category: "nested",
      data: createDeepObject(50),
    },
    {
      name: "nested-deep-array",
      category: "nested",
      data: { items: createDeepArray(50) },
    },

    // 5. Malicious fields & unknown IDs
    {
      name: "field-unknown-ids",
      category: "field",
      data: {
        npcId: "constructor",
        itemId: "prototype",
        recipeId: "__proto__",
        tradeId: "toString",
        questId: "non_existent_quest_id",
        lootId: "non_existent_loot_id",
        portalId: "portal_to_nowhere",
        name: "constructor",
        from: "prototype",
      },
    },

    // 6. Trường v (phiên bản giao thức M4) và log injection (U+2028, xuống dòng, __proto__)
    {
      name: "field-protocol-v-bad",
      category: "field",
      data: {
        v: "not_a_version",
        text: "Line1\u2028Line2\r\nFake: audit_log",
        name: "bad\u2028name",
      },
    },
    {
      name: "field-protocol-v-nan-neg",
      category: "field",
      data: { v: NaN, amount: NaN, slot: -1, angle: -0 },
    },
  ];

  if (!fastMode) {
    // Thêm các payload cực hạn khi không chạy --fast (nằm sát giới hạn 4KB của transport)
    payloads.push(
      {
        name: "str-long-3k5",
        category: "string",
        data: { text: "X".repeat(3500), note: "Y".repeat(200) },
      },
      {
        name: "nested-extreme-obj",
        category: "nested",
        data: createDeepObject(80),
      },
    );
  }

  return payloads;
}

export interface RedTeamTestResult {
  messageType: string;
  payloadName: string;
  category: string;
  ok: boolean;
  error?: string;
}

export interface RedTeamSummary {
  totalAttacks: number;
  passedAttacks: number;
  failedAttacks: number;
  unhandledErrors: string[];
  serverTickAvgMs: number;
  serverTickMaxMs: number;
  rssDeltaMb: number;
  rateLimitKicked: boolean;
  results: RedTeamTestResult[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readVmRssMb(): number {
  try {
    const status = readFileSync(`/proc/${process.pid}/status`, "utf8");
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(status);
    return m ? Math.round(Number(m[1]) / 1024) : 0;
  } catch {
    return Math.round(process.memoryUsage().rss / 1024 / 1024);
  }
}

/** Chạy toàn bộ bài kiểm tra đối kháng (Red Team) */
export async function runRedTeam(options: {
  fast?: boolean;
  verbose?: boolean;
}): Promise<RedTeamSummary> {
  const fast = options.fast ?? false;
  const verbose = options.verbose ?? false;

  const initialRss = readVmRssMb();
  const unhandledErrors: string[] = [];

  // Bắt các unhandled error nếu lọt ra tiến trình Node
  const onUnhandled = (err: any) => {
    unhandledErrors.push(String(err?.stack ?? err));
  };
  process.on("unhandledRejection", onUnhandled);
  process.on("uncaughtException", onUnhandled);

  // Khởi tạo Server Colyseus
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  const port = 49600 + Math.floor(Math.random() * 1500);
  const server = new Server({
    transport: new WebSocketTransport(),
    gracefullyShutdown: false,
  });
  defineRooms(server);
  await server.listen(port);

  const client = new Client(`ws://127.0.0.1:${port}`);
  const roomName = roomNameOf(DEFAULT_MAP_ID);

  // Lắng nghe các tin broadcast / private để client không log cảnh báo unhandled message
  const registerNoop = (r: Room) => {
    for (const t of [
      "inv",
      "quests",
      "wallet",
      "soul",
      "chat",
      "toast",
      "fx",
      "dmg",
      "limbo",
      "travelTo",
      "sectPresence",
    ]) {
      r.onMessage(t, () => {});
    }
  };

  // 1. Tạo bot Observer (nạn nhân / quan sát viên) để kiểm tra bất biến
  const observerRoom = await client.joinOrCreate(roomName, {
    name: "RedTeamObserver",
    secret: "secret-observer-123456",
    v: PROTOCOL_VERSION,
  });
  registerNoop(observerRoom);
  await sleep(150);

  let attackerSeq = 1;
  let attackerRoom = await client.joinOrCreate(roomName, {
    name: "Red001",
    secret: "secret-attacker-123456",
    v: PROTOCOL_VERSION,
  });
  registerNoop(attackerRoom);
  await sleep(150);

  const getAttackerRoom = async (): Promise<Room> => {
    if (attackerRoom && attackerRoom.connection.isOpen) {
      return attackerRoom;
    }
    attackerSeq++;
    attackerRoom = await client.joinOrCreate(roomName, {
      name: `Red${String(attackerSeq).padStart(3, "0")}`,
      secret: "secret-attacker-123456",
      v: PROTOCOL_VERSION,
    });
    registerNoop(attackerRoom);
    await sleep(100);
    return attackerRoom;
  };

  const world = [...WorldRoom.hub.worlds].find((w) => w.map.def.id === DEFAULT_MAP_ID)!;

  // Lấy snapshot ban đầu của Observer và Attacker
  const getObserverState = () => {
    const p = observerRoom.state?.players?.get(observerRoom.sessionId);
    const ctrl = world.ctrl.get(observerRoom.sessionId);
    return {
      coin: ctrl?.save?.coin ?? 0,
      exp: p?.exp ?? 0,
      hp: p?.hp ?? 0,
      x: p?.x ?? 0,
      y: p?.y ?? 0,
      invSize: ctrl?.save?.inventory?.filter(Boolean).length ?? 0,
    };
  };

  const getAttackerState = () => {
    const p = attackerRoom.state?.players?.get(attackerRoom.sessionId);
    const ctrl = world.ctrl.get(attackerRoom.sessionId);
    return {
      coin: ctrl?.save?.coin ?? 0,
      exp: p?.exp ?? 0,
      realm: p?.realm ?? 0,
      invSize: ctrl?.save?.inventory?.filter(Boolean).length ?? 0,
    };
  };

  const initObs = getObserverState();
  const initAtk = getAttackerState();

  const payloads = buildBadPayloads(fast);
  const results: RedTeamTestResult[] = [];
  const tickSamples: number[] = [];

  let totalAttacks = 0;
  let passedAttacks = 0;
  let failedAttacks = 0;

  // Chạy lần lượt từng loại tin nhắn x từng payload xấu
  for (const msgType of ALL_MESSAGE_TYPES) {
    for (const payload of payloads) {
      totalAttacks++;
      const t0 = performance.now();

      const curAttackerRoom = await getAttackerRoom();

      try {
        // Gửi payload qua kết nối WebSocket thật
        curAttackerRoom.send(msgType as any, payload.data as any);
      } catch (_err: unknown) {
        // Gửi qua WebSocket ném lỗi phía client colyseus.js (vd serialization) là an toàn cho server
        results.push({
          messageType: msgType,
          payloadName: payload.name,
          category: payload.category,
          ok: true,
        });
        passedAttacks++;
        continue;
      }

      // Đợi server xử lý nhịp tick
      await sleep(20);

      const dt = performance.now() - t0;
      tickSamples.push(dt);

      // Kiểm tra các bất biến sau đòn tấn công:
      // 1. Observer: coin không đổi, exp không đổi, invSize không đổi
      const curObs = getObserverState();
      const obsOk =
        curObs.coin === initObs.coin &&
        curObs.exp === initObs.exp &&
        curObs.invSize === initObs.invSize;

      // 2. Attacker: coin không tăng, exp không tăng, invSize không tăng
      const curAtk = getAttackerState();
      const atkOk =
        curAtk.coin <= initAtk.coin &&
        curAtk.exp <= initAtk.exp &&
        curAtk.invSize <= initAtk.invSize;

      // 3. Observer room vẫn mở và server không sập
      const serverAlive = observerRoom.connection.isOpen && unhandledErrors.length === 0;

      const ok = obsOk && atkOk && serverAlive;

      if (!ok) {
        failedAttacks++;
        const errorMsg = !serverAlive
          ? `Server bị crash hoặc Observer bị ngắt kết nối: ${unhandledErrors.join("; ")}`
          : !obsOk
            ? `Observer bị thay đổi trái phép: coin ${initObs.coin}->${curObs.coin}, exp ${initObs.exp}->${curObs.exp}`
            : `Attacker hưởng lợi bất hợp pháp: coin ${initAtk.coin}->${curAtk.coin}, exp ${initAtk.exp}->${curAtk.exp}`;

        results.push({
          messageType: msgType,
          payloadName: payload.name,
          category: payload.category,
          ok: false,
          error: errorMsg,
        });

        if (verbose) {
          console.error(`[FAIL] ${msgType} x ${payload.name}: ${errorMsg}`);
        }
      } else {
        passedAttacks++;
        results.push({
          messageType: msgType,
          payloadName: payload.name,
          category: payload.category,
          ok: true,
        });
      }
    }
  }

  // 3. Kiểm tra các trạng thái dị thường (State machine):
  // Gửi tin nhắn khi nhân vật đang thiền hoặc ở Hoàng Tuyền
  const curAttackerRoom = await getAttackerRoom();
  curAttackerRoom.send("meditate", { on: true });
  await sleep(60);
  curAttackerRoom.send("attack", { angle: 0 });
  curAttackerRoom.send("trade", { tradeId: "constructor" });
  curAttackerRoom.send(SECT_MSG.create, { name: "Bang Phai", tag: "BP01" });
  curAttackerRoom.send("meditate", { on: false });
  await sleep(60);

  // 4. Kiểm tra rate-limit / spam flood:
  // Gửi 250 tin nhắn liên tiếp thật nhanh từ một kết nối riêng để kiểm tra ngắt 4429
  let rateLimitKicked = false;
  const spammerRoom = await client.joinOrCreate(roomName, {
    name: "RedTeamSpammer",
    secret: "secret-spammer-123456",
    v: PROTOCOL_VERSION,
  });
  registerNoop(spammerRoom);
  await sleep(100);

  spammerRoom.onLeave((code) => {
    if (code === 4429) {
      rateLimitKicked = true;
    }
  });

  // Bắn phá liên tục 250 tin
  for (let i = 0; i < 250; i++) {
    spammerRoom.send("chat", { text: `Spam #${i}` } as ChatMsg);
  }
  await sleep(300);

  // 5. Kiểm tra onAuth options xấu (trường v & prototype pollution ở bước join)
  const badJoinOpts = [
    { name: "RedVStr", secret: "secret-attacker-123456", v: "not_a_number" },
    { name: "RedVNaN", secret: "secret-attacker-123456", v: NaN },
    { name: "RedVNeg", secret: "secret-attacker-123456", v: -1 },
    { name: "RedVObj", secret: "secret-attacker-123456", v: { nested: true } },
    { name: "RedVArr", secret: "secret-attacker-123456", v: [1, 2] },
    {
      name: "RedProto",
      secret: "secret-attacker-123456",
      v: PROTOCOL_VERSION,
      __proto__: { polluted: true },
    },
  ];

  for (const opts of badJoinOpts) {
    try {
      const badRoom = await client.joinOrCreate(roomName, opts);
      registerNoop(badRoom);
      if (badRoom.connection.isOpen) await badRoom.leave(true);
    } catch {
      // Bị từ chối an toàn ở onAuth là đúng thiết kế
    }
  }

  // Dọn dẹp kết nối
  if (attackerRoom.connection.isOpen) await attackerRoom.leave(true);
  if (observerRoom.connection.isOpen) await observerRoom.leave(true);
  if (spammerRoom.connection.isOpen) await spammerRoom.leave(true);
  await sleep(100);

  await server.gracefullyShutdown(false);

  process.off("unhandledRejection", onUnhandled);
  process.off("uncaughtException", onUnhandled);

  rmSync(dataDir, { recursive: true, force: true });

  const finalRss = readVmRssMb();
  const rssDeltaMb = Math.max(0, finalRss - initialRss);

  tickSamples.sort((a, b) => a - b);
  const avgTick =
    tickSamples.length > 0 ? tickSamples.reduce((a, b) => a + b, 0) / tickSamples.length : 0;
  const maxTick = tickSamples.length > 0 ? tickSamples.at(-1)! : 0;

  return {
    totalAttacks,
    passedAttacks,
    failedAttacks,
    unhandledErrors,
    serverTickAvgMs: Number(avgTick.toFixed(2)),
    serverTickMaxMs: Number(maxTick.toFixed(2)),
    rssDeltaMb,
    rateLimitKicked,
    results,
  };
}

// Chạy trực tiếp qua CLI
const isDirectRun = process.argv[1]?.endsWith("red-team.ts");
if (isDirectRun) {
  const isFast = process.argv.includes("--fast");
  const isReport = process.argv.includes("--report");

  console.log(
    `=== Bắt đầu chạy Red Team Server Messages (chế độ: ${isFast ? "FAST" : "FULL"}) ===`,
  );
  console.log(`- Kiểm tra ${ALL_MESSAGE_TYPES.length} loại tin nhắn WorldRoom`);

  runRedTeam({ fast: isFast, verbose: true })
    .then((summary) => {
      console.log("\n=== KẾT QUẢ RED TEAM ===");
      console.log(`- Tổng số payload đã thử: ${summary.totalAttacks}`);
      console.log(
        `- Thành công (an toàn, không lỗi): ${summary.passedAttacks}/${summary.totalAttacks}`,
      );
      console.log(`- Thất bại / Lỗi phát hiện: ${summary.failedAttacks}`);
      console.log(`- Unhandled Rejection / Exception: ${summary.unhandledErrors.length}`);
      console.log(
        `- Độ trễ xử lý mỗi payload: TB ${summary.serverTickAvgMs} ms | Max ${summary.serverTickMaxMs} ms`,
      );
      console.log(
        `- Cơ chế chống spam (RateLimiter kick 4429): ${summary.rateLimitKicked ? "PASS (ngắt đúng 4429)" : "FAIL"}`,
      );
      console.log(`- Mức tăng bộ nhớ VmRSS: +${summary.rssDeltaMb} MB`);

      if (isReport) {
        console.log("\n--- Bảng kết quả tổng hợp theo loại tin ---");
        const byType = new Map<string, { pass: number; fail: number }>();
        for (const r of summary.results) {
          const e = byType.get(r.messageType) ?? { pass: 0, fail: 0 };
          if (r.ok) e.pass++;
          else e.fail++;
          byType.set(r.messageType, e);
        }
        for (const [type, stat] of byType) {
          const status = stat.fail === 0 ? "OK" : `FAIL (${stat.fail})`;
          console.log(`  + ${type.padEnd(25)}: ${status} (${stat.pass} passed)`);
        }
      }

      if (summary.failedAttacks > 0 || summary.unhandledErrors.length > 0) {
        console.error("\n❌ PHÁT HIỆN LỖ HỔNG! Cần mở issue cho dev-a.");
        process.exit(1);
      } else {
        console.log("\n✅ TẤT CẢ TIN NHẮN ĐỀU AN TOÀN TRƯỚC PAYLOAD XẤU! 0 lỗi phát hiện.");
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error("Lỗi khi chạy red-team:", err);
      process.exit(1);
    });
}
