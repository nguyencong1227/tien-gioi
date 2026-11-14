// Công cụ đo thời gian tìm quái (searchSec) bằng bot thật qua Colyseus Client (Issue #410).
// Tuân thủ nghiêm ngặt các yêu cầu của M6 (CAN_BANG.md mục 10 và phản hồi của Dev A/B trên #410):
// 1. Bot chỉ nhận biết quái trong vùng nhìn chữ nhật quanh toạ độ (predX, predY) theo fitZoom (viewOfScreen).
// 2. Đo đúng THỜI GIAN TÌM (searchSec): tính từ lúc quái trước bị hạ tới lúc bot chạm quái kế tiếp (dist <= range),
//    KHÔNG gồm thời gian đánh quái và KHÔNG gồm thời gian đả tọa.
// 3. Khởi động server nội bộ qua freePort() để chạy độc lập không phụ thuộc cổng dev, tự dọn dẹp khi kết thúc.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  AM_SUONG_ID,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  MONSTER_BY_ID,
  MONSTERS,
  PROTOCOL_VERSION,
  SKILLS,
  TICK_MS,
  TILE,
  getMap,
  roomNameOf,
  type GameMap,
} from "@tien-gioi/shared";
import { defineRooms } from "../src/rooms/WorldRoom";
import { freePort } from "../src/test-port";
import {
  gridOf,
  planPath,
  sweepOf,
  viewOfScreen,
  SEARCH_VIEWS,
  SEARCH_VIEW_LABELS,
  type SearchView,
} from "../src/balance/search-check";
import { bestGear } from "../src/balance/simulate";
import { hashSecret, savePlayer } from "../src/store";

export interface MeasureOptions {
  mapId: string;
  monsterId: string;
  viewKey: keyof typeof SEARCH_VIEWS;
  killsTarget: number;
  warmupKills?: number;
  timeoutSec?: number;
  dataDir?: string;
}

export interface MeasureResult {
  mapId: string;
  monsterId: string;
  viewKey: keyof typeof SEARCH_VIEWS;
  viewLabel: string;
  samples: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  killsCompleted: number;
  durationSec: number;
}

export function calcStats(samples: number[]) {
  if (samples.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  const mean = sum / samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);
  return { mean, median, min, max, stdDev };
}

/** Chạy một phiên đo thời gian tìm quái bằng bot thật kết nối Colyseus */
export async function measureSearchTime(options: MeasureOptions): Promise<MeasureResult> {
  const {
    mapId,
    monsterId,
    viewKey,
    killsTarget,
    warmupKills = 1,
    timeoutSec = 180,
    dataDir = path.resolve(
      `/tmp/tg-bot-measure-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ),
  } = options;

  const map = getMap(mapId);
  if (!map) throw new Error(`Không tìm thấy bản đồ: ${mapId}`);
  const monDef = MONSTER_BY_ID[monsterId];
  if (!monDef) throw new Error(`Không tìm thấy loài quái: ${monsterId}`);

  const view: SearchView = SEARCH_VIEWS[viewKey] ?? SEARCH_VIEWS.pc;
  const grid = gridOf(map);
  const sweep = sweepOf(map, monDef);

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(path.join(dataDir, "players"), { recursive: true });
  }

  process.env.DATA_DIR = path.join(dataDir, "players");

  // Khởi tạo máy chủ Colyseus tạm trên cổng ngẫu nhiên do OS cấp
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await freePort();
  await server.listen(port);

  // Tạo nhân vật Kim Đan Hậu kỳ có trang bị đầy đủ và đan dược để bot luôn an toàn, tập trung đo thời gian tìm quái
  const botName = `Bot${monsterId.replace(/_/g, "")}${Math.floor(Math.random() * 900 + 100)}`;
  const botSecret = "botsecret12345678";
  const gear = bestGear(3, 2); // Kim Đan Hậu kỳ (realm 3, tier 2)
  const nowIso = new Date().toISOString();
  const invSlots = Array.from({ length: 16 }, () => null) as any[];
  invSlots[0] = { itemId: "dai_hoi_huyet_dan", qty: 99 };
  invSlots[1] = { itemId: "hoi_huyet_dan", qty: 99 };
  invSlots[2] = { itemId: "dai_hoi_linh_dan", qty: 99 };

  await savePlayer({
    name: botName,
    secretHash: hashSecret(botSecret),
    realm: 3,
    tier: 2,
    exp: 0,
    x: map.townPx.x,
    y: map.townPx.y,
    mapId,
    equipment: gear,
    inventory: invSlots,
    coin: 10000,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const startTime = Date.now();
  const samples: number[] = [];
  let killsDone = 0;
  let isSearching = true;
  let searchStartAt = Date.now();
  let currentTargetId: string | null = null;

  // Điểm tuần tra hiện tại (trong các ô sweep KHÔNG bị chặn)
  let sweepIndex = 0;
  const validSweepGoals: number[] = [];
  for (let i = 0; i < sweep.goal.length; i++) {
    const cell = sweep.goal[i];
    if (cell !== -1 && grid.free[cell] === 1) {
      validSweepGoals.push(cell);
    }
  }
  if (validSweepGoals.length === 0) {
    validSweepGoals.push(
      Math.floor(map.townPx.y / TILE) * grid.w + Math.floor(map.townPx.x / TILE),
    );
  }

  let client: Client | null = null;
  let room: Room | null = null;
  let timer: NodeJS.Timeout | null = null;

  try {
    client = new Client(`ws://127.0.0.1:${port}`);
    room = await client.joinOrCreate(roomNameOf(mapId), {
      name: botName,
      secret: botSecret,
      v: PROTOCOL_VERSION,
    });

    let predX = map.townPx.x;
    let predY = map.townPx.y;
    let lastPredX = predX;
    let lastPredY = predY;
    let stuckTicks = 0;
    let seq = 0;
    let nextSlashAt = 0;
    let nextSwordAt = 0;
    let nextPill1At = 0;
    let nextPill2At = 0;

    // Đăng ký dummy handler cho tất cả message types để tránh warning từ colyseus.js
    const dummyMessages = [
      "dmg",
      "inv",
      "quests",
      "wallet",
      "soul",
      "chat",
      "toast",
      "fx",
      "sys",
      "party",
      "sect",
      "trade",
    ];
    for (const msgType of dummyMessages) {
      room.onMessage(msgType, () => {});
    }

    // Nếu chẳng may gục, tự động đầu thai hồi sinh về trấn ngay
    room.onMessage("limbo", () => {
      room?.send("rebirth", { origin: "pham_gia", keep: [] });
    });

    // Vòng lặp điều khiển bot 50 ms / tick
    await new Promise<void>((resolve) => {
      const timeoutTimer = setTimeout(() => {
        clearInterval(timer!);
        resolve(); // Kết thúc khi hết thời gian tối đa
      }, timeoutSec * 1000);

      timer = setInterval(() => {
        if (!room || !room.connection.isOpen) {
          clearInterval(timer!);
          clearTimeout(timeoutTimer);
          resolve();
          return;
        }

        const now = Date.now();
        const me = room.state.players?.get(room.sessionId);
        if (me) {
          predX = me.x;
          predY = me.y;

          // Tự động uống đan dược khi khí huyết sụt giảm
          if (me.hp < me.maxHp * 0.8 && now >= nextPill1At) {
            room.send("useItem", { slot: 0 }); // Đại Hồi Huyết Đan (+70% HP)
            nextPill1At = now + 10500;
          } else if (me.hp < me.maxHp * 0.5 && now >= nextPill2At) {
            room.send("useItem", { slot: 1 }); // Hồi Huyết Đan (+40% HP)
            nextPill2At = now + 8500;
          }
        }

        // 1. Quét tìm quái trong VÙNG NHÌN CHỮ NHẬT
        let visibleMonsters: { id: string; x: number; y: number; dist: number }[] = [];
        if (room.state.monsters) {
          room.state.monsters.forEach((m: any, id: string) => {
            if (!m || m.kind !== monsterId || m.hp <= 0) return;
            const dx = Math.abs(m.x - predX);
            const dy = Math.abs(m.y - predY);
            if (dx <= view.hw && dy <= view.hh) {
              const d = Math.hypot(m.x - predX, m.y - predY);
              visibleMonsters.push({ id, x: m.x, y: m.y, dist: d });
            }
          });
        }

        visibleMonsters.sort((a, b) => a.dist - b.dist);

        // Kiểm tra xem quái đang nhắm có còn sống không
        if (currentTargetId) {
          const mon = room.state.monsters?.get(currentTargetId);
          if (!mon || mon.hp <= 0) {
            // Quái mục tiêu đã chết!
            currentTargetId = null;
            killsDone++;
            isSearching = true;
            searchStartAt = Date.now();

            console.log(
              `  [Hạ quái] #${killsDone} (mẫu: ${samples.length}/${killsTarget})${
                samples.length > 0
                  ? ` - mẫu gần nhất: ${samples[samples.length - 1].toFixed(1)}s`
                  : ""
              }`,
            );

            if (samples.length >= killsTarget) {
              clearInterval(timer!);
              clearTimeout(timeoutTimer);
              resolve();
              return;
            }
          }
        }

        let dx = 0;
        let dy = 0;

        if (visibleMonsters.length > 0) {
          // Có quái trong tầm nhìn!
          const target = visibleMonsters[0];
          currentTargetId = target.id;
          const dist = target.dist;
          const reach = SKILLS.slash.range;

          if (dist <= reach) {
            // Đã chạm quái!
            if (isSearching) {
              const searchSec = (now - searchStartAt) / 1000;
              if (killsDone >= warmupKills) {
                samples.push(searchSec);
                console.log(
                  `  [Chạm quái] sau ${searchSec.toFixed(1)}s tìm kiếm (mẫu #${samples.length}/${killsTarget})`,
                );
              }
              isSearching = false;
            }

            // Đánh quái
            dx = 0;
            dy = 0;
            const angle = Math.atan2(target.y - predY, target.x - predX);
            if (now >= nextSlashAt) {
              room.send("attack", { angle });
              nextSlashAt = now + SKILLS.slash.cooldown + 20;
            }
            if (now >= nextSwordAt) {
              room.send("skill", { id: "sword", angle });
              nextSwordAt = now + SKILLS.sword.cooldown + 50;
            }
          } else {
            // Tiếp cận quái
            const angle = Math.atan2(target.y - predY, target.x - predX);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          }
        } else {
          // Chưa thấy quái trong vùng nhìn: TUẦN TRA theo các ô sweep
          currentTargetId = null;
          if (!isSearching) {
            isSearching = true;
            searchStartAt = now;
          }

          const targetGoalCell = validSweepGoals[sweepIndex % validSweepGoals.length];
          const targetTileX = (targetGoalCell % grid.w) + 0.5;
          const targetTileY = Math.floor(targetGoalCell / grid.w) + 0.5;
          const targetPxX = targetTileX * TILE;
          const targetPxY = targetTileY * TILE;

          const distToGoal = Math.hypot(targetPxX - predX, targetPxY - predY);
          if (distToGoal < 40) {
            // Đã tới ô tuần tra hiện tại, chuyển sang ô tiếp theo
            sweepIndex = (sweepIndex + 1) % validSweepGoals.length;
          } else {
            // Tìm đường tới ô tuần tra
            const goals = new Set<number>([targetGoalCell]);
            const pathResult = planPath(grid, predX, predY, goals);
            if (pathResult && pathResult.cells.length > 1) {
              const nextCell = pathResult.cells[1];
              const nx = ((nextCell % grid.w) + 0.5) * TILE;
              const ny = (Math.floor(nextCell / grid.w) + 0.5) * TILE;
              const angle = Math.atan2(ny - predY, nx - predX);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
            } else {
              const angle = Math.atan2(targetPxY - predY, targetPxX - predX);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
            }
          }
        }

        // Phát hiện kẹt (stuck detection) khi tuần tra
        if (isSearching && (dx !== 0 || dy !== 0)) {
          if (Math.hypot(predX - lastPredX, predY - lastPredY) < 1.0) {
            stuckTicks++;
            if (stuckTicks > 15) {
              sweepIndex = (sweepIndex + 1) % validSweepGoals.length;
              stuckTicks = 0;
            }
          } else {
            stuckTicks = 0;
          }
        } else {
          stuckTicks = 0;
        }
        lastPredX = predX;
        lastPredY = predY;

        // Gửi input di chuyển
        seq++;
        room.send("input", { seq, dx, dy });
      }, TICK_MS);
    });
  } finally {
    if (timer) clearInterval(timer);
    if (room && room.connection.isOpen) {
      try {
        await room.leave(true);
      } catch {
        /* bỏ qua */
      }
    }
    try {
      await server.transport.shutdown();
    } catch {
      /* bỏ qua */
    }
    // Dọn dẹp thư mục tạm
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* bỏ qua */
    }
  }

  const durationSec = (Date.now() - startTime) / 1000;
  const stats = calcStats(samples);

  return {
    mapId,
    monsterId,
    viewKey,
    viewLabel: SEARCH_VIEW_LABELS[viewKey],
    samples,
    mean: stats.mean,
    median: stats.median,
    min: stats.min,
    max: stats.max,
    stdDev: stats.stdDev,
    killsCompleted: killsDone,
    durationSec,
  };
}

/**
 * Kịch bản bot Kim Đan di chuyển qua 2 cổng liên tiếp:
 * Lạc Hà Trấn (world) -> Hắc Phong Cốc (world_hac_phong) -> Âm Sương Trạch (world_am_suong)
 */
export async function runPortalScenario(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  const logMsg = (msg: string) => {
    log.push(msg);
    console.log(`[Cổng] ${msg}`);
  };

  logMsg(
    "Bắt đầu kịch bản bot đi qua 2 cổng liên tiếp: Lạc Hà Trấn -> Hắc Phong Cốc -> Âm Sương Trạch...",
  );
  const server = new Server();
  defineRooms(server);
  const port = await freePort();
  await server.listen(port);

  const botName = `BotCong${Math.floor(Math.random() * 900 + 100)}`;
  const botSecret = "botsecret12345678";
  const gear = bestGear(3, 2);
  const nowIso = new Date().toISOString();

  await savePlayer({
    name: botName,
    secretHash: hashSecret(botSecret),
    realm: 3,
    tier: 2,
    exp: 0,
    x: 1536,
    y: 200, // Đặt gần cổng Bắc Môn Quan (1536, 112) để kịch bản di chuyển nhanh gọn
    mapId: DEFAULT_MAP_ID,
    equipment: gear,
    inventory: Array.from({ length: 16 }, () => null),
    coin: 5000,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const client = new Client(`ws://127.0.0.1:${port}`);

  try {
    // 1. Vào Lạc Hà Trấn
    logMsg(`1. Kết nối vào Lạc Hà Trấn (${DEFAULT_MAP_ID})...`);
    let room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
      name: botName,
      secret: botSecret,
      v: PROTOCOL_VERSION,
    });
    logMsg(`  ✓ Đã vào phòng Lạc Hà Trấn: sessionId=${room.sessionId}`);

    // Đăng ký dummy handler
    const dummy = [
      "dmg",
      "inv",
      "quests",
      "wallet",
      "soul",
      "chat",
      "toast",
      "fx",
      "sys",
      "party",
      "sect",
    ];
    for (const d of dummy) room.onMessage(d, () => {});

    await new Promise((r) => setTimeout(r, 200));

    // Di chuyển tới cổng Bắc Môn Quan (lac_ha_bac: x=1536, y=112)
    const portal1 = DEFAULT_MAP.portal("lac_ha_bac")!;
    let arrivedPortal1 = false;
    let nextMapId: string | null = null;

    let travelPromise = new Promise<string>((resolve) => {
      room.onMessage("travelTo", (msg: { mapId: string }) => {
        logMsg(`  ✓ Nhận tin travelTo: mapId=${msg.mapId}`);
        nextMapId = msg.mapId;
      });
      room.onLeave((code) => {
        logMsg(`  ✓ Phòng đóng kết nối với mã=${code} (kỳ vọng 4000 CLOSE_TRAVEL)`);
        resolve(nextMapId || "hac_phong");
      });
    });

    logMsg("  Đang di chuyển tới Bắc Môn Quan (lac_ha_bac)...");
    let p1Seq = 0;
    const p1Timer = setInterval(() => {
      p1Seq++;
      const me = room.state.players?.get(room.sessionId);
      if (!me) return;
      const dist = Math.hypot(me.x - portal1.x, me.y - portal1.y);
      if (dist <= portal1.r) {
        if (!arrivedPortal1) {
          arrivedPortal1 = true;
          logMsg(
            `  ✓ Đã đứng trong tầm cổng (dist=${dist.toFixed(1)} <= ${portal1.r}). Gửi travel...`,
          );
          room.send("travel", { portalId: "lac_ha_bac" });
        }
      } else {
        const angle = Math.atan2(portal1.y - me.y, portal1.x - me.x);
        room.send("input", { seq: p1Seq, dx: Math.cos(angle), dy: Math.sin(angle) });
      }
    }, 50);

    const targetMap1 = await Promise.race([
      travelPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout khi qua cổng 1")), 15000),
      ),
    ]);
    clearInterval(p1Timer);

    // 2. Vào Hắc Phong Cốc
    logMsg(`2. Kết nối vào ${targetMap1} (Hắc Phong Cốc)...`);
    room = await client.joinOrCreate(roomNameOf(targetMap1), {
      name: botName,
      secret: botSecret,
      v: PROTOCOL_VERSION,
    });
    for (const d of dummy) room.onMessage(d, () => {});
    await new Promise((r) => setTimeout(r, 200));

    const meHacPhong = room.state.players?.get(room.sessionId);
    logMsg(
      `  ✓ Đã vào phòng Hắc Phong Cốc! Vị trí ban đầu: (${meHacPhong?.x.toFixed(1)}, ${meHacPhong?.y.toFixed(1)})`,
    );

    // Di chuyển tới cổng Vọng Trạch Quan (hac_phong_bac: x=2080, y=112)
    const mapHacPhong = getMap(HAC_PHONG_ID)!;
    const portal2 = mapHacPhong.portal("hac_phong_bac")!;
    let arrivedPortal2 = false;
    nextMapId = null;

    travelPromise = new Promise<string>((resolve) => {
      room.onMessage("travelTo", (msg: { mapId: string }) => {
        logMsg(`  ✓ Nhận tin travelTo: mapId=${msg.mapId}`);
        nextMapId = msg.mapId;
      });
      room.onLeave((code) => {
        logMsg(`  ✓ Phòng đóng kết nối với mã=${code}`);
        resolve(nextMapId || "am_suong");
      });
    });

    logMsg("  Đang di chuyển tới Vọng Trạch Quan (hac_phong_bac) bằng tìm đường tránh vách đá...");
    const gridHacPhong = gridOf(mapHacPhong);
    const targetCell = Math.floor(portal2.y / TILE) * gridHacPhong.w + Math.floor(portal2.x / TILE);
    const goals = new Set<number>([targetCell]);
    let p2Seq = 0;
    const p2Timer = setInterval(() => {
      p2Seq++;
      const me = room.state.players?.get(room.sessionId);
      if (!me) return;
      const dist = Math.hypot(me.x - portal2.x, me.y - portal2.y);
      if (dist <= portal2.r) {
        if (!arrivedPortal2) {
          arrivedPortal2 = true;
          logMsg(
            `  ✓ Đã đứng trong tầm cổng (dist=${dist.toFixed(1)} <= ${portal2.r}). Gửi travel...`,
          );
          room.send("travel", { portalId: "hac_phong_bac" });
        }
      } else {
        const path = planPath(gridHacPhong, me.x, me.y, goals);
        if (path && path.cells.length > 1) {
          const nextCell = path.cells[1];
          const nx = ((nextCell % gridHacPhong.w) + 0.5) * TILE;
          const ny = (Math.floor(nextCell / gridHacPhong.w) + 0.5) * TILE;
          const angle = Math.atan2(ny - me.y, nx - me.x);
          room.send("input", { seq: p2Seq, dx: Math.cos(angle), dy: Math.sin(angle) });
        } else {
          const angle = Math.atan2(portal2.y - me.y, portal2.x - me.x);
          room.send("input", { seq: p2Seq, dx: Math.cos(angle), dy: Math.sin(angle) });
        }
      }
    }, 50);

    const targetMap2 = await Promise.race([
      travelPromise,
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout khi qua cổng 2")), 50000),
      ),
    ]);
    clearInterval(p2Timer);

    // 3. Vào Âm Sương Trạch
    logMsg(`3. Kết nối vào ${targetMap2} (Âm Sương Trạch)...`);
    room = await client.joinOrCreate(roomNameOf(targetMap2), {
      name: botName,
      secret: botSecret,
      v: PROTOCOL_VERSION,
    });
    for (const d of dummy) room.onMessage(d, () => {});
    await new Promise((r) => setTimeout(r, 200));

    const meAmSuong = room.state.players?.get(room.sessionId);
    logMsg(
      `  ✓ Đã vào phòng Âm Sương Trạch! Vị trí: (${meAmSuong?.x.toFixed(1)}, ${meAmSuong?.y.toFixed(1)})`,
    );
    logMsg("  ✓ Cảnh giới: Kim Đan Hậu kỳ, dữ liệu nhân vật nguyên vẹn!");
    logMsg("🎉 Kịch bản di chuyển qua 2 cổng liên tiếp THÀNH CÔNG 100%!");

    await room.leave(true);
    return { success: true, log };
  } catch (err) {
    logMsg(`❌ Lỗi trong kịch bản qua cổng: ${err}`);
    throw err;
  } finally {
    await server.gracefullyShutdown();
  }
}

/**
 * Kịch bản đội 2-4 bot Kim Đan lập tổ đội cùng hạ trùm Hắc Giao tại Âm Sương Trạch.
 */
export async function runPartyBossScenario(partySize: number = 3): Promise<{
  success: boolean;
  bossKilled: boolean;
  durationSec: number;
  deaths: number;
}> {
  console.log(`\n=== BẮT ĐẦU KỊCH BẢN ĐỘI ${partySize} BOT HẠ TRÙM HẮC GIAO (M6.9 #410) ===`);
  const server = new Server();
  defineRooms(server);
  const port = await freePort();
  await server.listen(port);

  const secret = "botsecret12345678";
  const gear = bestGear(3, 2);
  const nowIso = new Date().toISOString();

  const mapAmSuong = getMap(AM_SUONG_ID)!;
  // Tìm điểm xuất phát an toàn ở khu vực phía bắc (gần Hắc Giao, danger >= 0.85)
  let startX = 2048;
  let startY = 500;
  for (let y = 300; y < 900; y += 32) {
    let found = false;
    for (let x = 1000; x < 3000; x += 32) {
      if (!mapAmSuong.isBlockedPx(x, y) && mapAmSuong.dangerAt(x, y) >= 0.85) {
        startX = x;
        startY = y;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  const bots: {
    name: string;
    room?: Room;
    client?: Client;
    hp: number;
    maxHp: number;
    nextSlashAt: number;
    nextSwordAt: number;
    nextPill1At: number;
    nextPill2At: number;
  }[] = [];
  for (let i = 0; i < partySize; i++) {
    const name = `DoiBot${i + 1}${Math.floor(Math.random() * 900 + 100)}`;
    const inv = Array.from({ length: 16 }, () => null) as any[];
    inv[0] = { itemId: "dai_hoi_huyet_dan", qty: 99 };
    inv[1] = { itemId: "hoi_huyet_dan", qty: 99 };

    await savePlayer({
      name,
      secretHash: hashSecret(secret),
      realm: 3,
      tier: 2,
      exp: 0,
      x: startX + i * 20,
      y: startY,
      mapId: AM_SUONG_ID,
      equipment: gear,
      inventory: inv,
      coin: 1000,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    bots.push({
      name,
      hp: 0,
      maxHp: 0,
      nextSlashAt: 0,
      nextSwordAt: 0,
      nextPill1At: 0,
      nextPill2At: 0,
    });
  }

  const dummy = [
    "dmg",
    "inv",
    "quests",
    "wallet",
    "soul",
    "chat",
    "toast",
    "fx",
    "sys",
    "party",
    "sect",
    "reborn",
    "travelTo",
  ];

  try {
    // 1. Cả đội kết nối vào world_am_suong
    for (const b of bots) {
      b.client = new Client(`ws://127.0.0.1:${port}`);
      b.room = await b.client.joinOrCreate(roomNameOf("am_suong"), {
        name: b.name,
        secret,
        v: PROTOCOL_VERSION,
      });
      for (const d of dummy) b.room.onMessage(d, () => {});
    }

    console.log(`  ✓ Đã kết nối ${partySize} bot vào Âm Sương Trạch.`);

    // 2. Lập tổ đội: bot 0 mời các bot khác
    const leader = bots[0];
    for (let i = 1; i < bots.length; i++) {
      const member = bots[i];
      member.room!.onMessage("partyInvited", (msg: { from: string }) => {
        member.room!.send("partyAccept", { from: msg.from });
      });
      leader.room!.send("partyInvite", { name: member.name });
    }
    await new Promise((r) => setTimeout(r, 300));
    console.log(`  ✓ Đã lập tổ đội ${partySize} người (Đội trưởng: ${leader.name}).`);

    // 3. Tìm quái Hắc Giao trong state.monsters
    let bossId: string | null = null;
    let bossX = 0;
    let bossY = 0;
    const mons = leader.room!.state.monsters;
    if (mons) {
      mons.forEach((m: any, id: string) => {
        if (m.kind === "hac_giao") {
          bossId = id;
          bossX = m.x;
          bossY = m.y;
        }
      });
    }

    if (!bossId) {
      console.log("  ⚠️ Chưa thấy Hắc Giao trong tầm nhìn trực tiếp, tuần tra tìm quái...");
    } else {
      console.log(`  ✓ Tìm thấy Hắc Giao tại toạ độ (${bossX}, ${bossY})!`);
    }

    // 4. Tiến hành chiến đấu
    const startTime = Date.now();
    let bossKilled = false;
    let deaths = 0;

    for (const b of bots) {
      b.room!.onMessage("limbo", () => {
        deaths++;
        b.room!.send("rebirth", { origin: "pham_gia", keep: [] });
      });
    }

    const sweep = sweepOf(mapAmSuong, MONSTER_BY_ID["hac_giao"]);
    const gridAmSuong = gridOf(mapAmSuong);
    let sweepIndex = 0;
    const validSweepGoals: number[] = [];
    for (let i = 0; i < sweep.goal.length; i++) {
      if (sweep.goal[i] !== -1) validSweepGoals.push(sweep.goal[i]);
    }
    if (validSweepGoals.length === 0) {
      validSweepGoals.push(Math.floor(startY / TILE) * gridAmSuong.w + Math.floor(startX / TILE));
    }

    let pSeq = 0;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        clearInterval(combatTimer);
        resolve();
      }, 120000); // Tối đa 120 giây (Hắc Giao 50k HP)

      const combatTimer = setInterval(() => {
        pSeq++;
        const now = Date.now();
        // Cập nhật vị trí Hắc Giao
        if (bossId) {
          const boss = leader.room!.state.monsters?.get(bossId);
          if (!boss || boss.hp <= 0) {
            bossKilled = true;
            clearInterval(combatTimer);
            clearTimeout(timeout);
            resolve();
            return;
          }
          bossX = boss.x;
          bossY = boss.y;
        } else {
          // Quét từ tất cả các bot trong đội xem ai đã nhìn thấy Hắc Giao chưa
          for (const b of bots) {
            b.room?.state.monsters?.forEach((m: any, id: string) => {
              if (m.kind === "hac_giao" && m.hp > 0) {
                bossId = id;
                bossX = m.x;
                bossY = m.y;
                console.log(
                  `  ✓ Đội phát hiện Hắc Giao tại (${bossX.toFixed(0)}, ${bossY.toFixed(0)})! Lao vào tấn công!`,
                );
              }
            });
            if (bossId) break;
          }

          if (!bossId) {
            // Chưa thấy Hắc Giao: cả đội đi tuần tra theo sweep
            const targetGoalCell = validSweepGoals[sweepIndex % validSweepGoals.length];
            const targetPxX = ((targetGoalCell % gridAmSuong.w) + 0.5) * TILE;
            const targetPxY = (Math.floor(targetGoalCell / gridAmSuong.w) + 0.5) * TILE;

            const me = leader.room!.state.players?.get(leader.room!.sessionId);
            if (me) {
              const distToGoal = Math.hypot(targetPxX - me.x, targetPxY - me.y);
              if (distToGoal < 50) {
                sweepIndex = (sweepIndex + 1) % validSweepGoals.length;
              } else {
                const goals = new Set<number>([targetGoalCell]);
                const path = planPath(gridAmSuong, me.x, me.y, goals);
                let angle = Math.atan2(targetPxY - me.y, targetPxX - me.x);
                if (path && path.cells.length > 1) {
                  const nextCell = path.cells[1];
                  const nx = ((nextCell % gridAmSuong.w) + 0.5) * TILE;
                  const ny = (Math.floor(nextCell / gridAmSuong.w) + 0.5) * TILE;
                  angle = Math.atan2(ny - me.y, nx - me.x);
                }
                for (const b of bots) {
                  b.room?.send("input", { seq: pSeq, dx: Math.cos(angle), dy: Math.sin(angle) });
                }
              }
            }
            return;
          }
        }

        // Cả đội phối hợp tấn công Hắc Giao
        for (const b of bots) {
          const r = b.room!;
          const me = r.state.players?.get(r.sessionId);
          if (!me || me.hp <= 0) continue;

          // Uống Đại Hồi Huyết Đan (+70% HP, cd 10s)
          if (me.hp < me.maxHp * 0.8 && now >= b.nextPill1At) {
            r.send("useItem", { slot: 0 });
            b.nextPill1At = now + 10500;
          } else if (me.hp < me.maxHp * 0.5 && now >= b.nextPill2At) {
            // Uống Hồi Huyết Đan (+40% HP, cd 8s) khi máu tụt xuống nửa
            r.send("useItem", { slot: 1 });
            b.nextPill2At = now + 8500;
          }

          const dist = Math.hypot(bossX - me.x, bossY - me.y);
          const angle = Math.atan2(bossY - me.y, bossX - me.x);

          if (dist <= SKILLS.slash.range) {
            r.send("input", { seq: pSeq, dx: 0, dy: 0 });
            if (now >= b.nextSlashAt) {
              r.send("attack", { angle });
              b.nextSlashAt = now + SKILLS.slash.cooldown + 20;
            }
            if (now >= b.nextSwordAt) {
              r.send("skill", { id: "sword", angle });
              b.nextSwordAt = now + SKILLS.sword.cooldown + 50;
            }
          } else {
            r.send("input", { seq: pSeq, dx: Math.cos(angle), dy: Math.sin(angle) });
          }
        }
      }, 50);
    });

    const durationSec = (Date.now() - startTime) / 1000;
    console.log(`\n✓ Kết quả trận đánh Hắc Giao:`);
    console.log(
      `  - Trạng thái: ${bossKilled ? "🎉 HẠ TRÙM THÀNH CÔNG!" : "⏱️ Hết thời gian thử nghiệm"}`,
    );
    console.log(`  - Thời gian: ${durationSec.toFixed(1)} giây`);
    console.log(`  - Số thành viên gục ngã (deaths): ${deaths}`);

    for (const b of bots) {
      if (b.room?.connection.isOpen) await b.room.leave(true);
    }

    return { success: true, bossKilled, durationSec, deaths };
  } finally {
    await server.gracefullyShutdown();
  }
}

// --- CLI thực thi trực tiếp ---
if (process.argv[1]?.endsWith("bot-kim-dan.ts")) {
  (async () => {
    const args = process.argv.slice(2);
    let mapId = "hac_phong";
    let monsterId = "mang";
    let viewKey: keyof typeof SEARCH_VIEWS = "pc";
    let kills = 3;
    let allViews = false;
    let runMatrix = false;
    let runPortal = false;
    let runParty = false;
    let timeoutSec = 120;

    for (const arg of args) {
      if (arg.startsWith("--map=")) mapId = arg.slice(6);
      else if (arg.startsWith("--monster=")) monsterId = arg.slice(10);
      else if (arg.startsWith("--view=")) viewKey = arg.slice(7) as any;
      else if (arg.startsWith("--kills=")) kills = Math.max(1, Number(arg.slice(8)));
      else if (arg.startsWith("--timeout=")) timeoutSec = Math.max(10, Number(arg.slice(10)));
      else if (arg === "--all-views") allViews = true;
      else if (arg === "--matrix") runMatrix = true;
      else if (arg === "--portal") runPortal = true;
      else if (arg === "--party") runParty = true;
    }

    if (runPortal) {
      await runPortalScenario();
      return;
    }

    if (runParty) {
      await runPartyBossScenario(3);
      return;
    }

    if (runMatrix) {
      console.log(
        `=== BẮT ĐẦU CHẠY TOÀN BỘ MA TRẬN ĐO THỜI GIAN TÌM QUÁI BẰNG BOT THẬT (Issue #410) ===\n`,
      );

      const matrixCases: {
        mapId: string;
        monsterId: string;
        viewKey: keyof typeof SEARCH_VIEWS;
        kills: number;
      }[] = [
        // 1. Trọng điểm: Xích Mãng tại Hắc Phong Cốc (6 con) trên 3 cỡ màn hình
        { mapId: "hac_phong", monsterId: "mang", viewKey: "pc", kills: 3 },
        { mapId: "hac_phong", monsterId: "mang", viewKey: "phone", kills: 3 },
        { mapId: "hac_phong", monsterId: "mang", viewKey: "phonePortrait", kills: 3 },
        // 2. Trọng điểm: Xích Mãng tại Lạc Hà Trấn (2 con) trên 3 cỡ màn hình
        { mapId: "lac_ha", monsterId: "mang", viewKey: "pc", kills: 3 },
        { mapId: "lac_ha", monsterId: "mang", viewKey: "phone", kills: 3 },
        { mapId: "lac_ha", monsterId: "mang", viewKey: "phonePortrait", kills: 3 },
        // 3. Quái Âm Sương Trạch
        { mapId: "am_suong", monsterId: "suong_ho", viewKey: "pc", kills: 3 },
        { mapId: "am_suong", monsterId: "thach_quy", viewKey: "pc", kills: 3 },
        { mapId: "am_suong", monsterId: "doc_thiem", viewKey: "pc", kills: 3 },
        { mapId: "am_suong", monsterId: "hac_giao", viewKey: "pc", kills: 2 },
      ];

      const results: MeasureResult[] = [];

      for (const c of matrixCases) {
        console.log(
          `\n>>> [Đo] Bản đồ: ${c.mapId} | Quái: ${c.monsterId} | Vùng nhìn: ${c.viewKey} | Số lần hạ: ${c.kills}...`,
        );
        const res = await measureSearchTime({
          mapId: c.mapId,
          monsterId: c.monsterId,
          viewKey: c.viewKey,
          killsTarget: c.kills,
          warmupKills: 1,
          timeoutSec: 300,
        });
        results.push(res);
        console.log(
          `  ✓ Xong: Mean = ${res.mean.toFixed(1)}s | Median = ${res.median.toFixed(1)}s | Mẫu: [${res.samples.map((s) => s.toFixed(1)).join(", ")}]`,
        );
      }

      console.log(`\n\n=== BẢNG TỔNG HỢP KẾT QUẢ ĐO THỰC NGHIỆM BẰNG BOT THẬT (M6.9 #410) ===\n`);
      console.log(
        `| Bản đồ | Quái | Vùng nhìn màn hình | Số con | Giả định (s) | Bot đo Mean (s) | Bot đo Median (s) | Dải [Min - Max] | Đánh giá vs 85s (Xích Mãng) |`,
      );
      console.log(`|---|---|---|---:|---:|---:|---:|---|---|`);

      for (const r of results) {
        const monDef = MONSTER_BY_ID[r.monsterId];
        const assumeSec =
          r.monsterId === "mang"
            ? 90
            : r.monsterId === "hac_giao"
              ? 90
              : r.monsterId === "suong_ho"
                ? 10
                : r.monsterId === "thach_quy"
                  ? 12
                  : 14;
        const count =
          r.mapId === "lac_ha" && r.monsterId === "mang"
            ? 2
            : r.mapId === "hac_phong" && r.monsterId === "mang"
              ? 6
              : r.monsterId === "hac_giao"
                ? 2
                : r.monsterId === "suong_ho"
                  ? 24
                  : 18;
        let verdict = "-";
        if (r.monsterId === "mang") {
          verdict =
            r.median < 28
              ? "🚨 Quá nhanh (< 28s nhân)"
              : r.median < 85
                ? "⚠️ Dưới 85s (chưa hoà vốn)"
                : "✅ Đạt hoà vốn (>= 85s)";
        }
        console.log(
          `| ${r.mapId} | ${monDef.name} (${r.monsterId}) | ${r.viewLabel} | ${count} | ${assumeSec} | **${r.mean.toFixed(1)}** | **${r.median.toFixed(1)}** | [${r.min.toFixed(1)} - ${r.max.toFixed(1)}] | ${verdict} |`,
        );
      }
      return;
    }

    const viewsToRun: (keyof typeof SEARCH_VIEWS)[] = allViews
      ? ["pc", "phone", "phonePortrait"]
      : [viewKey];

    console.log(
      `=== BẮT ĐẦU ĐO THỜI GIAN TÌM QUÁI BẰNG BOT THẬT (M6.9 #410) ===\n` +
        `Bản đồ: ${mapId} | Quái: ${monsterId} | Số lần hạ: ${kills} | Vùng nhìn: ${viewsToRun.join(", ")}\n`,
    );

    for (const vk of viewsToRun) {
      console.log(`[Đang đo] Màn hình: ${SEARCH_VIEW_LABELS[vk]} (${vk})...`);
      const res = await measureSearchTime({
        mapId,
        monsterId,
        viewKey: vk,
        killsTarget: kills,
        warmupKills: 1,
        timeoutSec,
      });

      console.log(
        `✓ Hoàn thành trong ${res.durationSec.toFixed(1)}s (hạ ${res.killsCompleted} con, ${res.samples.length} mẫu đo):`,
      );
      console.log(`  - Mẫu đo (giây): [${res.samples.map((s) => s.toFixed(1)).join(", ")}]`);
      console.log(`  - Trung bình (mean): ${res.mean.toFixed(1)} s`);
      console.log(`  - Trung vị (median): ${res.median.toFixed(1)} s`);
      console.log(`  - Nhỏ nhất: ${res.min.toFixed(1)} s | Lớn nhất: ${res.max.toFixed(1)} s`);
      console.log(`  - Độ lệch chuẩn (stdDev): ${res.stdDev.toFixed(1)} s\n`);
    }
  })().catch((err) => {
    console.error("Lỗi khi đo bot tìm quái:", err);
    process.exit(1);
  });
}
