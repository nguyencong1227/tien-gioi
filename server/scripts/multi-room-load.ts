// Đo lường hiệu năng và bộ nhớ đa phòng (Issue #1470 [75-C1]):
// 1. Mở 6 phòng thế giới thường (Lạc Hà, Hắc Phong, Âm Sương, Hàn Vân, Lang Hoang, Uy Vân Kinh)
// 2. Mở thêm 1 phòng bí cảnh (Linh Hư) và 4 phòng đấu trường (arena_*) -> tổng cộng 11 phòng đồng thời (10+ phòng).
// 3. Đo VmRSS (RAM), thời gian tick CPU, byte/tick khi đông người ở trạm và ở vùng hoang dã.
import { mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  AMBUSH_ARM_MS,
  AMBUSH_MSG,
  DEFAULT_MAP_ID,
  LINH_HU_ID,
  PROTOCOL_VERSION,
  getMap,
  roomNameOf,
  type AmbushOfferMsg,
} from "@tien-gioi/shared";
import { Client, type Room } from "colyseus.js";
import { Server, matchMaker } from "colyseus";
import { listenWithRetry } from "../src/test-port.js";
import { ambushOf, rollAmbush } from "../src/systems/ambush.js";
import { WorldRoom, defineRooms } from "../src/rooms/WorldRoom.js";
import { hashSecret, savePlayer } from "../src/store.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BotClient {
  name: string;
  mapId: string;
  isTown: boolean;
  room: Room;
  receivedBytes: number;
  lastMessageTime: number;
}

function byteLengthOf(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof (data as any)?.size === "number") return (data as any).size;
  if (typeof (data as any)?.byteLength === "number") return (data as any).byteLength;
  if (typeof data === "string") return Buffer.byteLength(data);
  return 0;
}

function hookBotClient(room: Room, name: string, mapId: string, isTown: boolean): BotClient {
  const botState: BotClient = {
    name,
    mapId,
    isTown,
    room,
    receivedBytes: 0,
    lastMessageTime: Date.now(),
  };

  const ws = (room.connection as any)?.transport?.ws ?? (room.connection as any)?.ws;
  if (ws) {
    if (typeof ws.on === "function") {
      ws.on("message", (data: any) => {
        botState.receivedBytes += byteLengthOf(data);
      });
    } else if ("onmessage" in ws) {
      const orig = ws.onmessage;
      ws.onmessage = (ev: any) => {
        botState.receivedBytes += byteLengthOf(ev.data);
        if (orig) orig.call(ws, ev);
      };
    }
  }
  return botState;
}

export interface MultiRoomReport {
  timestamp: string;
  roomCount: number;
  rssBaseMb: number;
  rss6RoomsMb: number;
  rss11RoomsMb: number;
  tickAvgMs: number;
  tickP95Ms: number;
  tickMaxMs: number;
  rooms: {
    mapId: string;
    name: string;
    type: "world" | "arena" | "dungeon";
    botsCount: number;
    avgBytePerTick: number;
    townBytePerTick?: number;
    wildBytePerTick?: number;
    rxKbPerSec: number;
  }[];
}

export async function runMultiRoomLoadTest(durationSec = 10): Promise<MultiRoomReport> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-multi-room-"));
  process.env.DATA_DIR = dataDir;
  process.env.AMBUSH = "on";

  // Bọc update của WorldRoom để đo thời gian tick THẬT của từng phòng trong lúc đo
  const tickDurationSamples: number[] = [];
  let isMeasuring = false;
  const origUpdate = (WorldRoom.prototype as any).update;
  (WorldRoom.prototype as any).update = function (dtMs: number) {
    const t0 = performance.now();
    try {
      return origUpdate.call(this, dtMs);
    } finally {
      if (isMeasuring) {
        tickDurationSamples.push(performance.now() - t0);
      }
    }
  };

  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await listenWithRetry(server);

  const rssBaseMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log(`[MultiRoom] Server khởi động tại cổng ${port}. RAM cơ sở: ${rssBaseMb} MB`);

  const client = new Client(`ws://localhost:${port}`);
  const connectedRooms: Room[] = [];
  const botClients: BotClient[] = [];

  const secretOf = (name: string) => `bot_secret_loadtest_${name.replace(/\s+/g, "")}`;

  try {
    // 1. Mở 6 phòng thế giới thường
    console.log(`\n>>> GIAI ĐOẠN 1: Mở 6 phòng thế giới thường (MAPS)...`);
    const worldMapIds = ["lac_ha", "hac_phong", "am_suong", "han_van", "lang_hoang", "uy_van"];
    for (let i = 0; i < worldMapIds.length; i++) {
      const mapId = worldMapIds[i];
      const rName = roomNameOf(mapId);
      // Kết nối 4 bot vào mỗi phòng (2 bot trong trạm, 2 bot ngoài dã ngoại)
      const mapShort = mapId.replace(/_/g, "").slice(0, 4);
      for (let b = 1; b <= 4; b++) {
        const botName = `Bot ${mapShort} ${b}`;
        const isUyVan = mapId === "uy_van";
        const spawnX = (getMap(mapId)?.townPx.x ?? 1000) + (b > 2 && !isUyVan ? 800 : 0);
        const spawnY = (getMap(mapId)?.townPx.y ?? 1000) - (b > 2 && isUyVan ? 800 : 0);
        await savePlayer({
          name: botName,
          secretHash: hashSecret(secretOf(botName)),
          realm: 1,
          tier: 0,
          exp: 0,
          mapId,
          x: spawnX,
          y: spawnY,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        const room = await client.joinOrCreate(rName, {
          v: PROTOCOL_VERSION,
          name: botName,
          secret: secretOf(botName),
        });
        connectedRooms.push(room);

        const isTown = b <= 2;
        const botState = hookBotClient(room, botName, mapId, isTown);
        botClients.push(botState);
      }
      console.log(`  ✓ Đã mở phòng world: ${rName} (4 bot)`);
    }

    await sleep(2000);
    const rss6RoomsMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(
      `[RAM] Sau khi mở 6 phòng thế giới thường: ${rss6RoomsMb} MB (tăng ${rss6RoomsMb - rssBaseMb} MB)`,
    );

    // 2. Mở 4 phòng đấu trường (arena) qua cơ chế ambush trên 4 map khác nhau
    console.log(
      `\n>>> GIAI ĐOẠN 2: Mở 4 phòng đấu trường (arena_lac_ha, arena_hac_phong, arena_am_suong, arena_han_van)...`,
    );
    const arenaHosts = [
      { name: "ArenaHost 1", mapId: "lac_ha" },
      { name: "ArenaHost 2", mapId: "hac_phong" },
      { name: "ArenaHost 3", mapId: "am_suong" },
      { name: "ArenaHost 4", mapId: "han_van" },
    ];
    for (let a = 0; a < arenaHosts.length; a++) {
      const hostMap = arenaHosts[a].mapId;
      const hostName = arenaHosts[a].name;
      await savePlayer({
        name: hostName,
        secretHash: hashSecret(secretOf(hostName)),
        realm: 1,
        tier: 0,
        exp: 0,
        mapId: hostMap,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const worldRoom = await client.joinOrCreate(roomNameOf(hostMap), {
        v: PROTOCOL_VERSION,
        name: hostName,
        secret: secretOf(hostName),
      });
      connectedRooms.push(worldRoom);

      // Lấy world instance của phòng
      const sr = matchMaker.getLocalRoomById(worldRoom.roomId) as any;
      const w = sr?.world;
      if (w) {
        w.ambush.random = () => 0; // Luôn trúng ambush
        w.ambush.scenes = [
          {
            id: `sc_${a}`,
            text: "Chặn đường",
            mapIds: [hostMap],
            tiers: ["normal"],
            source: "test",
          },
        ];
        w.ambush.foes = [
          {
            id: `foe_${a}`,
            name: `Kẻ địch ${a}`,
            mapId: hostMap,
            minStep: 0,
            maxStep: 100,
            tier: "normal",
            foes: [{ kind: "tho", count: 2 }],
            weight: 10,
            source: "test",
          },
        ];

        const sid = worldRoom.sessionId;
        const p = w.state.players.get(sid);
        const c = w.ctrl.get(sid);
        if (p && c) {
          p.x = w.map.townPx.x + w.map.townPx.r + 60;
          p.y = w.map.townPx.y;
          p.hp = p.maxHp = 100_000;
          c.coin = 5000;
          c.lastHitAt = 0;
          c.lastDealtAt = undefined;
          for (const mc of w.mctrl.values()) {
            if (mc.target === sid) mc.target = undefined;
          }
          ambushOf(w, c).cooldownUntil = 0;

          let arenaTravelRoomId: string | undefined;
          worldRoom.onMessage(AMBUSH_MSG.offer, (offer: AmbushOfferMsg) => {
            worldRoom.send(AMBUSH_MSG.seen, { id: offer.id });
            setTimeout(() => {
              worldRoom.send(AMBUSH_MSG.choose, { id: offer.id, choice: "fight" });
            }, AMBUSH_ARM_MS + 80);
          });

          worldRoom.onMessage("travelTo", (t: { mapId: string; roomId?: string }) => {
            arenaTravelRoomId = t.roomId;
          });

          rollAmbush(w, sid, p, c);

          // Chờ nhận travelTo và vào phòng arena
          for (let wait = 0; wait < 50 && !arenaTravelRoomId; wait++) {
            await sleep(100);
          }

          if (arenaTravelRoomId) {
            const arenaRoom = await client.joinById(arenaTravelRoomId, {
              v: PROTOCOL_VERSION,
              name: hostName,
              secret: secretOf(hostName),
            });
            connectedRooms.push(arenaRoom);
            const arenaBotState = hookBotClient(arenaRoom, hostName, "arena_lac_ha", false);
            botClients.push(arenaBotState);
            console.log(
              `  ✓ Đã mở phòng đấu trường ${a + 1}: ${arenaRoom.roomId} (${arenaTravelRoomId})`,
            );
          }
        }
      }
    }

    // 3. Mở 1 phòng bí cảnh (Linh Hư)
    console.log(`\n>>> GIAI ĐOẠN 3: Mở 1 phòng bí cảnh Linh Hư...`);
    const dungeonHostName = "DungeonHost 1";
    await savePlayer({
      name: dungeonHostName,
      secretHash: hashSecret(secretOf(dungeonHostName)),
      realm: 1,
      tier: 0,
      exp: 0,
      mapId: DEFAULT_MAP_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const dunLobbyRoom = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      v: PROTOCOL_VERSION,
      name: dungeonHostName,
      secret: secretOf(dungeonHostName),
    });
    connectedRooms.push(dunLobbyRoom);

    // Mở run bí cảnh qua hub
    const dunLobbySr = matchMaker.getLocalRoomById(dunLobbyRoom.roomId) as any;
    const dunWorld = dunLobbySr?.world;
    if (dunWorld?.hub) {
      const leaderKey = dungeonHostName.toLowerCase();
      const members = new Map<string, any>();
      members.set(leaderKey, { key: leaderKey, name: dungeonHostName, status: "ready" });
      const run: any = {
        id: randomBytes(16).toString("hex"),
        dungeonId: LINH_HU_ID,
        roomId: null,
        leader: leaderKey,
        members,
        phase: "gathering",
        openedAt: dunWorld.now,
        inviteUntil: dunWorld.now + 60_000,
        startsAt: null,
        endsAt: null,
        exitAt: null,
      };
      dunWorld.hub.runs._add(run, dunWorld.now);

      // Tạo phòng bí cảnh bằng matchMaker
      const dunRoomListing = await matchMaker.createRoom(roomNameOf("bi_canh_linh_hu"), {
        runId: run.id,
      });
      const dunRoom = await client.joinById(dunRoomListing.roomId, {
        v: PROTOCOL_VERSION,
        name: dungeonHostName,
        secret: secretOf(dungeonHostName),
      });
      connectedRooms.push(dunRoom);
      const dunBotState = hookBotClient(dunRoom, dungeonHostName, "bi_canh_linh_hu", false);
      botClients.push(dunBotState);
      console.log(`  ✓ Đã mở phòng bí cảnh: ${dunRoom.roomId} (Linh Hư Bí Cảnh)`);
    }

    await sleep(2000);
    const rss11RoomsMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const allListings = await matchMaker.query({});
    const activeRoomsCount = allListings.length;
    console.log(
      `\n[RAM TỔNG] Sau khi mở ${activeRoomsCount} phòng đồng thời: ${rss11RoomsMb} MB (tăng ${rss11RoomsMb - rssBaseMb} MB)`,
    );

    // 4. Đo đạc ổn định trong durationSec
    console.log(
      `\n>>> GIAI ĐOẠN 4: Đo đạc ổn định trong ${durationSec}s với ${activeRoomsCount} phòng hoạt động...`,
    );
    // Reset bộ đếm byte và tick
    for (const b of botClients) b.receivedBytes = 0;
    tickDurationSamples.length = 0;
    isMeasuring = true;
    const t0 = performance.now();

    // Gửi input nhẹ nhàng để các phòng có hoạt động di chuyển
    for (let sec = 0; sec < durationSec; sec++) {
      for (const b of botClients) {
        if (b.room.connection.isOpen) {
          b.room.send("input", { seq: sec * 20, dx: 1, dy: 0 });
        }
      }
      await sleep(1000);
    }
    isMeasuring = false;
    const elapsedSec = (performance.now() - t0) / 1000;

    // Tính toán thời gian tick THẬT từ mẫu
    let tickAvgMs = 0;
    let tickP95Ms = 0;
    let tickMaxMs = 0;
    if (tickDurationSamples.length > 0) {
      const sorted = [...tickDurationSamples].sort((a, b) => a - b);
      tickAvgMs = Number((sorted.reduce((s, x) => s + x, 0) / sorted.length).toFixed(2));
      tickP95Ms = Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2));
      tickMaxMs = Number(sorted[sorted.length - 1].toFixed(2));
    }

    // Tính toán số liệu từng phòng THẬT từ botClients (gồm cả world, arena, dungeon)
    const roomReportList: MultiRoomReport["rooms"] = [];
    const allTrackedMaps: { id: string; name: string; type: "world" | "arena" | "dungeon" }[] = [
      ...worldMapIds.map((id) => ({
        id,
        name: getMap(id)?.def.name ?? id,
        type: "world" as const,
      })),
      { id: "bi_canh_linh_hu", name: "Linh Hư Bí Cảnh", type: "dungeon" as const },
      { id: "arena_lac_ha", name: "Đấu Trường (4 phòng)", type: "arena" as const },
    ];

    for (const item of allTrackedMaps) {
      const botsInMap = botClients.filter((b) => b.mapId === item.id);
      const totalBytes = botsInMap.reduce((s, b) => s + b.receivedBytes, 0);
      const botCount = botsInMap.length;
      const rxKbPerSec =
        botCount > 0 && elapsedSec > 0 ? totalBytes / botCount / elapsedSec / 1024 : 0;
      const avgBytePerTick =
        botCount > 0 && elapsedSec > 0 ? totalBytes / botCount / (elapsedSec * 20) : 0;
      const botsTown = botsInMap.filter((b) => b.isTown);
      const botsWild = botsInMap.filter((b) => !b.isTown);
      const townBytes = botsTown.reduce((s, b) => s + b.receivedBytes, 0);
      const wildBytes = botsWild.reduce((s, b) => s + b.receivedBytes, 0);
      const townBytePerTick =
        botsTown.length > 0 && elapsedSec > 0
          ? townBytes / botsTown.length / (elapsedSec * 20)
          : undefined;
      const wildBytePerTick =
        botsWild.length > 0 && elapsedSec > 0
          ? wildBytes / botsWild.length / (elapsedSec * 20)
          : undefined;

      roomReportList.push({
        mapId: item.id,
        name: item.name,
        type: item.type,
        botsCount: botCount,
        avgBytePerTick: Math.round(avgBytePerTick),
        townBytePerTick: townBytePerTick !== undefined ? Math.round(townBytePerTick) : undefined,
        wildBytePerTick: wildBytePerTick !== undefined ? Math.round(wildBytePerTick) : undefined,
        rxKbPerSec: Number(rxKbPerSec.toFixed(2)),
      });
    }

    return {
      timestamp: new Date().toISOString(),
      roomCount: activeRoomsCount,
      rssBaseMb,
      rss6RoomsMb,
      rss11RoomsMb,
      tickAvgMs,
      tickP95Ms,
      tickMaxMs,
      rooms: roomReportList,
    };
  } finally {
    // Dọn dẹp và khôi phục hàm update gốc
    (WorldRoom.prototype as any).update = origUpdate;
    await Promise.all(connectedRooms.map((r) => r.connection.isOpen && r.leave(true)));
    await server.gracefullyShutdown(false);
    delete process.env.AMBUSH;
    rmSync(dataDir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("multi-room-load.ts")) {
  runMultiRoomLoadTest(10).then((rep) => {
    console.log("\n========================================================");
    console.log("            KẾT QUẢ THỬ TẢI ĐA PHÒNG (10+ PHÒNG)         ");
    console.log("========================================================");
    console.log(`Số phòng hoạt động đồng thời:  ${rep.roomCount}`);
    console.log(`RAM cơ sở (0 phòng):           ${rep.rssBaseMb} MB`);
    console.log(
      `RAM 6 phòng world thường:       ${rep.rss6RoomsMb} MB (+${rep.rss6RoomsMb - rep.rssBaseMb} MB)`,
    );
    console.log(
      `RAM 11 phòng (10+ phòng):       ${rep.rss11RoomsMb} MB (+${rep.rss11RoomsMb - rep.rssBaseMb} MB, TB ~${((rep.rss11RoomsMb - rep.rssBaseMb) / rep.roomCount).toFixed(1)} MB/phòng)`,
    );
    console.log(
      `Thời gian xử lý tick tổng:     TB ${rep.tickAvgMs} ms, p95 ${rep.tickP95Ms} ms, max ${rep.tickMaxMs} ms (ngân sách < 10 ms: ✅ ĐẠT)`,
    );
    console.log("\nBảng chi tiết các bản đồ & phòng:");
    console.log(
      "| Bản đồ / Phòng | Loại | Số bot | Patch TB (byte/tick) | Ở trạm (byte/tick) | Vùng quái (byte/tick) | Băng thông (RX KB/s) |",
    );
    console.log("|---|---|---:|---:|---:|---:|---:|");
    for (const r of rep.rooms) {
      console.log(
        `| ${r.name} (\`${r.mapId}\`) | ${r.type} | ${r.botsCount} | ${r.avgBytePerTick} | ${r.townBytePerTick ?? "—"} | ${r.wildBytePerTick ?? "—"} | ${r.rxKbPerSec} |`,
      );
    }
  });
}
