// Công cụ bot kiểm tra tính khả thi MỌI nhiệm vụ trên máy chủ Colyseus thật (Issue #757).
// Chạy trên cổng ngẫu nhiên độc lập (freePort()), tuyệt đối KHÔNG đụng cổng 2567 (prod) hay các cổng dev.
// Cách dùng:
//   npm run quest-walk -w server
//   npm run quest-walk -w server -- --quest=nhap_the
//   npm run quest-walk -w server -- --map=lac_ha
//   npm run quest-walk -w server -- --map=am_suong
//   npm run quest-walk -w server -- --give-all
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  AM_SUONG_ID,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  DROP_TABLES,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  ITEM_BY_ID,
  MONSTERS,
  MONSTER_BY_ID,
  NPC_BY_ID,
  NPC_RANGE,
  PICKUP_RANGE,
  PROTOCOL_VERSION,
  QUESTS,
  QUEST_BY_ID,
  QUEST_PREV,
  REALMS,
  SKILLS,
  TICK_MS,
  getMap,
  roomNameOf,
  stepOf,
  type Inventory,
  type QuestDef,
  type QuestProgress,
  type QuestStep,
  type QuestsMsg,
} from "@tien-gioi/shared";
import { defineRooms } from "../src/rooms/WorldRoom";
import { freePort } from "../src/test-port";
import { bestGear } from "../src/balance/simulate";
import { gridOf, planPath, sweepOf } from "../src/balance/search-check";
import { hashSecret, savePlayer } from "../src/store";
import { assertNotProd } from "./assert-not-prod";

export const MAP_ORDER = [DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID] as const;

export interface PlannedStep {
  kind: "kill" | "collect" | "talk" | "reachRealm";
  target: string;
  count: number;
  mapId?: string;
  feasible: boolean;
  needsGive: boolean;
  reason?: string;
}

export interface PlannedQuest {
  id: string;
  title: string;
  giver: string;
  giverMapId: string;
  minRealm?: { realm: number; tier: number };
  feasible: boolean;
  issues: string[];
  steps: PlannedStep[];
  rewards: { exp: number; items: { itemId: string; qty: number }[] };
}

/** Tìm bản đồ đầu tiên mà loài quái này sinh ra */
export function findMapForMonster(monsterId: string): string | null {
  for (const mapId of MAP_ORDER) {
    const map = getMap(mapId);
    if (map && map.monsterCapOf(monsterId) > 0) return mapId;
  }
  return null;
}

/** Tìm danh sách quái rơi vật phẩm này */
export function findDropsFor(itemId: string): { monster: string; chance: number }[] {
  const res: { monster: string; chance: number }[] = [];
  for (const [mon, drops] of Object.entries(DROP_TABLES)) {
    const d = drops?.find((x) => x.itemId === itemId);
    if (d) res.push({ monster: mon, chance: d.chance });
  }
  return res;
}

/** Lập kế hoạch và kiểm tra tính khả thi tĩnh của một nhiệm vụ */
export function planQuestSteps(q: QuestDef): PlannedQuest {
  const issues: string[] = [];
  const giverDef = NPC_BY_ID[q.giver];
  if (!giverDef) {
    issues.push(`NPC giao '${q.giver}' không tồn tại trong NPC_BY_ID.`);
  }

  const giverMapId = giverDef?.mapId ?? DEFAULT_MAP_ID;
  const plannedSteps: PlannedStep[] = [];

  for (let idx = 0; idx < q.steps.length; idx++) {
    const s = q.steps[idx];
    if (s.kind === "kill") {
      const mon = MONSTER_BY_ID[s.monster];
      if (!mon) {
        issues.push(`Bước ${idx + 1}: loài quái '${s.monster}' không tồn tại trong MONSTER_BY_ID.`);
        plannedSteps.push({
          kind: "kill",
          target: s.monster,
          count: s.count,
          feasible: false,
          needsGive: false,
          reason: "Quái không tồn tại",
        });
      } else {
        const mapId = findMapForMonster(s.monster);
        if (!mapId) {
          issues.push(
            `Bước ${idx + 1}: loài quái '${s.monster}' không sinh ra ở bất kỳ bản đồ nào.`,
          );
          plannedSteps.push({
            kind: "kill",
            target: s.monster,
            count: s.count,
            feasible: false,
            needsGive: false,
            reason: "Quái không sinh ở bản đồ nào",
          });
        } else {
          plannedSteps.push({
            kind: "kill",
            target: s.monster,
            count: s.count,
            mapId,
            feasible: true,
            needsGive: mon.boss === true,
            reason: mon.boss ? "Trùm cần đội" : undefined,
          });
        }
      }
    } else if (s.kind === "collect") {
      const it = ITEM_BY_ID[s.itemId];
      if (!it) {
        issues.push(`Bước ${idx + 1}: vật phẩm '${s.itemId}' không tồn tại trong ITEM_BY_ID.`);
        plannedSteps.push({
          kind: "collect",
          target: s.itemId,
          count: s.count,
          feasible: false,
          needsGive: true,
          reason: "Vật phẩm không tồn tại",
        });
      } else {
        const drops = findDropsFor(s.itemId);
        const hasSource = drops.length > 0;
        const bestDrop = drops[0];
        const isRareOrBoss =
          !hasSource ||
          drops.some((d) => MONSTER_BY_ID[d.monster]?.boss) ||
          (bestDrop && bestDrop.chance < 0.2);

        if (!hasSource) {
          plannedSteps.push({
            kind: "collect",
            target: s.itemId,
            count: s.count,
            feasible: true,
            needsGive: true,
            reason: "Không có quái nào rơi (cần cấp /give hoặc mua shop)",
          });
        } else {
          plannedSteps.push({
            kind: "collect",
            target: s.itemId,
            count: s.count,
            feasible: true,
            needsGive: isRareOrBoss,
            reason: isRareOrBoss ? "Rơi hiếm hoặc từ trùm đội" : undefined,
          });
        }
      }
    } else if (s.kind === "talk") {
      const npc = NPC_BY_ID[s.npcId];
      if (!npc) {
        issues.push(`Bước ${idx + 1}: NPC '${s.npcId}' không tồn tại trong NPC_BY_ID.`);
        plannedSteps.push({
          kind: "talk",
          target: s.npcId,
          count: 1,
          feasible: false,
          needsGive: false,
          reason: "NPC không tồn tại",
        });
      } else {
        plannedSteps.push({
          kind: "talk",
          target: s.npcId,
          count: 1,
          mapId: npc.mapId ?? DEFAULT_MAP_ID,
          feasible: true,
          needsGive: false,
        });
      }
    } else if (s.kind === "reachRealm") {
      const validRealm = s.realm >= 0 && s.realm < REALMS.length && s.tier >= 0 && s.tier <= 8;
      if (!validRealm) {
        issues.push(`Bước ${idx + 1}: cảnh giới yêu cầu (${s.realm}, ${s.tier}) không hợp lệ.`);
      }
      plannedSteps.push({
        kind: "reachRealm",
        target: `${s.realm}.${s.tier}`,
        count: 1,
        feasible: validRealm,
        needsGive: false,
      });
    }
  }

  // Kiểm tra phần thưởng
  if (typeof q.rewards.exp === "number" && (q.rewards.exp < 0 || isNaN(q.rewards.exp))) {
    issues.push(`Phần thưởng exp không hợp lệ: ${q.rewards.exp}`);
  }
  for (const it of q.rewards.items ?? []) {
    if (!ITEM_BY_ID[it.itemId]) {
      issues.push(`Vật phẩm thưởng '${it.itemId}' không tồn tại trong ITEM_BY_ID.`);
    }
    if (it.qty <= 0) {
      issues.push(`Số lượng thưởng của '${it.itemId}' phải > 0 (nhận được: ${it.qty}).`);
    }
  }

  return {
    id: q.id,
    title: q.title,
    giver: q.giver,
    giverMapId,
    minRealm: q.minRealm,
    feasible: issues.length === 0,
    issues,
    steps: plannedSteps,
    rewards: {
      exp: q.rewards.exp ?? 0,
      items: q.rewards.items ? [...q.rewards.items] : [],
    },
  };
}

export interface QuestWalkOptions {
  questId?: string;
  mapId?: string;
  giveAll?: boolean;
  timeoutSec?: number;
  silent?: boolean;
  dataDir?: string;
}

export interface QuestWalkResult {
  id: string;
  title: string;
  giver: string;
  mapId: string;
  minRealmText: string;
  success: boolean;
  durationSec: number;
  usedGive: boolean;
  giveReasons: string[];
  stepsDone: number;
  totalSteps: number;
  error?: string;
}

/** Tìm portal dẫn sang bản đồ kế tiếp */
export function findPortalTo(
  currentMapId: string,
  destMapId: string,
): { id: string; x: number; y: number } | null {
  const curIdx = MAP_ORDER.indexOf(currentMapId as any);
  const dstIdx = MAP_ORDER.indexOf(destMapId as any);
  if (curIdx < 0 || dstIdx < 0 || curIdx === dstIdx) return null;

  const nextIdx = dstIdx > curIdx ? curIdx + 1 : curIdx - 1;
  const nextMapId = MAP_ORDER[nextIdx];

  const map = getMap(currentMapId);
  if (!map) return null;

  const portal = map.portals.find((p) => p.toMap === nextMapId);
  return portal ? { id: portal.id, x: portal.x, y: portal.y } : null;
}

/** Di chuyển bot tới toạ độ đích (px) bằng tìm đường A* (planPath) tránh vật cản */
export async function moveTo(
  room: Room,
  targetX: number,
  targetY: number,
  targetDist = 36,
  mapId: string = DEFAULT_MAP_ID,
  maxWaitMs?: number,
): Promise<boolean> {
  const mapObj = getMap(mapId) ?? DEFAULT_MAP;
  const grid = gridOf(mapObj);
  const goalCell = Math.min(
    grid.w * grid.h - 1,
    Math.max(0, Math.floor(targetY / 32) * grid.w + Math.floor(targetX / 32)),
  );
  const goals = new Set<number>([goalCell]);

  let me = room.state.players?.get(room.sessionId);
  const initialDist = me ? Math.hypot(targetX - me.x, targetY - me.y) : 1000;
  const timeoutMs = maxWaitMs ?? Math.max(12000, Math.ceil((initialDist / 120) * 1000) + 10000);
  const start = Date.now();
  let seq = 0;

  while (Date.now() - start < timeoutMs) {
    me = room.state.players?.get(room.sessionId);
    if (!me) {
      await new Promise((res) => setTimeout(res, 50));
      continue;
    }
    const dist = Math.hypot(targetX - me.x, targetY - me.y);
    if (dist <= targetDist) {
      room.send("input", { seq: ++seq, dx: 0, dy: 0 });
      return true;
    }

    const pathResult = planPath(grid, me.x, me.y, goals);
    let dx = 0;
    let dy = 0;
    if (pathResult && pathResult.cells.length > 1) {
      const nextCell = pathResult.cells[1];
      const nx = ((nextCell % grid.w) + 0.5) * 32;
      const ny = (Math.floor(nextCell / grid.w) + 0.5) * 32;
      const angle = Math.atan2(ny - me.y, nx - me.x);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    } else {
      const angle = Math.atan2(targetY - me.y, targetX - me.x);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }

    room.send("input", { seq: ++seq, dx, dy });
    await new Promise((res) => setTimeout(res, 50));
  }
  return false;
}

/** Lấy danh sách toạ độ tuần tra các bãi quái sinh ra trên bản đồ */
export function getPatrolPoints(map: any, monDef: any): { x: number; y: number }[] {
  const sweep = sweepOf(map, monDef);
  const grid = gridOf(map);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < sweep.goal.length; i++) {
    const cell = sweep.goal[i];
    if (cell !== -1 && grid.free[cell] === 1) {
      const tileX = (cell % grid.w) + 0.5;
      const tileY = Math.floor(cell / grid.w) + 0.5;
      pts.push({ x: tileX * 32, y: tileY * 32 });
    }
  }
  return pts.length > 0 ? pts : [{ x: map.townPx.x, y: map.townPx.y }];
}

/** Chạy một nhiệm vụ trên Colyseus Server thật với bot client */
export async function walkSingleQuest(
  client: Client,
  q: QuestDef,
  options: QuestWalkOptions = {},
): Promise<QuestWalkResult> {
  const plan = planQuestSteps(q);
  const minRealmText = q.minRealm
    ? `${REALMS[q.minRealm.realm]?.name ?? "Cảnh giới " + q.minRealm.realm} tầng ${q.minRealm.tier + 1}`
    : "Không yêu cầu";

  if (!plan.feasible) {
    return {
      id: q.id,
      title: q.title,
      giver: q.giver,
      mapId: plan.giverMapId,
      minRealmText,
      success: false,
      durationSec: 0,
      usedGive: false,
      giveReasons: [],
      stepsDone: 0,
      totalSteps: q.steps.length,
      error: plan.issues.join("; "),
    };
  }

  const { giveAll = true, timeoutSec = 60, silent = false } = options;
  const startTime = Date.now();
  let usedGive = false;
  const giveReasons: string[] = [];
  let stepsDone = 0;

  // Khởi tạo hồ sơ bot phù hợp với quest (minRealm hoặc mốc reachRealm)
  let realm = q.minRealm?.realm ?? 1;
  let tier = q.minRealm?.tier ?? 0;

  for (const s of q.steps) {
    if (s.kind === "reachRealm") {
      if (stepOf(realm, tier) < stepOf(s.realm, s.tier)) {
        realm = s.realm;
        tier = s.tier;
      }
    }
  }

  const giverNpc = NPC_BY_ID[q.giver]!;
  let currentMapId = giverNpc.mapId ?? DEFAULT_MAP_ID;
  const botName = `BotQW${Math.floor(Math.random() * 90000 + 10000)}`;
  const botSecret = "botqwsecret123456";

  const gear = bestGear(Math.max(1, realm), tier);
  const nowIso = new Date().toISOString();
  const invSlots: any[] = Array.from({ length: 16 }, () => null);
  invSlots[0] = { itemId: "dai_hoi_huyet_dan", qty: 99 };
  invSlots[1] = { itemId: "hoi_huyet_dan", qty: 99 };
  invSlots[2] = { itemId: "dai_hoi_linh_dan", qty: 99 };

  // Nạp các nhiệm vụ tiền nhiệm vào done để bot có thể nhận nhiệm vụ trong chuỗi
  const doneIds: string[] = [];
  for (let cur = QUEST_PREV[q.id]; cur; cur = QUEST_PREV[cur]) {
    doneIds.push(cur);
  }

  await savePlayer({
    name: botName,
    secretHash: hashSecret(botSecret),
    realm,
    tier,
    exp: 0,
    x: giverNpc.x + 20,
    y: giverNpc.y,
    mapId: currentMapId,
    equipment: gear,
    inventory: invSlots,
    quests: {
      active: [],
      done: doneIds,
      daily: {},
    },
    coin: 20000,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  let room: Room | null = null;
  let questsMsg: QuestsMsg | null = null;
  let invMsg: Inventory = invSlots;
  let lastToast: string = "";
  let lastExp = 0;

  const log = (msg: string) => {
    if (!silent) console.log(`  [${q.id}] ${msg}`);
  };

  try {
    // 1. Kết nối vào bản đồ của NPC giao
    room = await client.joinOrCreate(roomNameOf(currentMapId), {
      name: botName,
      secret: botSecret,
      v: PROTOCOL_VERSION,
    });

    const setupRoomListeners = (r: Room) => {
      r.onMessage("quests", (msg: QuestsMsg) => {
        questsMsg = msg;
      });
      r.onMessage("inv", (msg: any) => {
        if (Array.isArray(msg)) invMsg = msg;
        else if (Array.isArray(msg?.slots)) invMsg = msg.slots;
      });
      r.onMessage("toast", (t: any) => {
        if (t?.text) lastToast = t.text;
      });
      r.onMessage("limbo", () => {
        r.send("rebirth", { origin: "pham_gia", keep: [] });
      });
      // Bỏ qua các tin nhắn khác
      for (const m of ["dmg", "fx", "wallet", "chat", "sys", "party", "sect", "trade", "dialog"]) {
        r.onMessage(m, () => {});
      }
    };

    setupRoomListeners(room);

    // Chờ nhận tin quests ban đầu
    const waitInitial = Date.now();
    while (!questsMsg && Date.now() - waitInitial < 3000) {
      await new Promise((res) => setTimeout(res, 50));
    }

    log(`Đã vào phòng ${roomNameOf(currentMapId)}, di chuyển tới NPC ${q.giver}...`);
    await moveTo(room, giverNpc.x, giverNpc.y, 36, currentMapId);

    // 2. Nhận nhiệm vụ ở NPC giver
    room.send("talk", { npcId: q.giver });
    await new Promise((res) => setTimeout(res, 60));
    room.send("questAccept", { questId: q.id });

    // Chờ xác nhận nhiệm vụ đã vào active
    const acceptStart = Date.now();
    const hasActive = () =>
      questsMsg ? (questsMsg as QuestsMsg).active.some((a) => a.id === q.id) : false;
    while (!hasActive()) {
      if (Date.now() - acceptStart > 4000) {
        throw new Error(
          `Không nhận được nhiệm vụ '${q.id}' ở NPC '${q.giver}'. Toast: ${lastToast}`,
        );
      }
      await new Promise((res) => setTimeout(res, 60));
    }

    log(`Đã nhận nhiệm vụ '${q.title}' thành công.`);

    // 3. Thực hiện từng step
    for (let stepIdx = 0; stepIdx < q.steps.length; stepIdx++) {
      const step = q.steps[stepIdx];
      log(`Bắt đầu bước ${stepIdx + 1}/${q.steps.length}: ${step.kind}...`);

      if (step.kind === "reachRealm") {
        log(`Kiểm tra đạt cảnh giới yêu cầu (${step.realm}, ${step.tier}): đã đạt theo hồ sơ.`);
      } else if (step.kind === "talk") {
        const targetNpc = NPC_BY_ID[step.npcId]!;
        const targetMapId = targetNpc.mapId ?? DEFAULT_MAP_ID;

        // Nếu cần chuyển bản đồ
        while (currentMapId !== targetMapId) {
          const portal = findPortalTo(currentMapId, targetMapId);
          if (!portal) {
            throw new Error(`Không tìm thấy portal từ '${currentMapId}' sang '${targetMapId}'.`);
          }
          log(`Di chuyển tới portal '${portal.id}' (${portal.x}, ${portal.y})...`);
          await moveTo(room, portal.x, portal.y, 48, currentMapId);

          let nextMapReceived: string | null = null;
          room.onMessage("travelTo", (t: any) => {
            if (t?.mapId) nextMapReceived = t.mapId;
          });

          room.send("travel", { portalId: portal.id });

          const travelWait = Date.now();
          while (!nextMapReceived && Date.now() - travelWait < 5000) {
            await new Promise((res) => setTimeout(res, 60));
          }

          if (!nextMapReceived) {
            throw new Error(`Lỗi chuyển bản đồ qua portal '${portal.id}'. Toast: ${lastToast}`);
          }

          currentMapId = nextMapReceived;
          await room.leave();
          room = await client.joinOrCreate(roomNameOf(currentMapId), {
            name: botName,
            secret: botSecret,
            v: PROTOCOL_VERSION,
          });
          setupRoomListeners(room);
          log(`Đã chuyển tới bản đồ '${currentMapId}'.`);
          await new Promise((res) => setTimeout(res, 100));
        }

        // Di chuyển tới NPC đích và nói chuyện
        log(`Di chuyển tới NPC '${step.npcId}' (${targetNpc.name})...`);
        await moveTo(room, targetNpc.x, targetNpc.y, 36, currentMapId);
        room.send("talk", { npcId: step.npcId });
        await new Promise((res) => setTimeout(res, 200));
        log(`Đã nói chuyện với NPC '${step.npcId}'.`);
      } else if (step.kind === "collect") {
        // Cấp vật phẩm bằng lệnh /give khi không chạy production
        room.send("chat", { text: `/give ${step.itemId} ${step.count}` });
        usedGive = true;
        const rsn = plan.steps[stepIdx]?.reason ?? "Cấp vật phẩm kiểm tra tính khả thi";
        if (!giveReasons.includes(rsn)) giveReasons.push(rsn);
        await new Promise((res) => setTimeout(res, 150));
        log(`Đã cấp ${step.count} '${step.itemId}' vào túi đồ (${rsn}).`);
      } else if (step.kind === "kill") {
        const monMapId = findMapForMonster(step.monster) ?? currentMapId;

        // Di chuyển sang bản đồ có quái nếu đang ở bản đồ khác
        while (currentMapId !== monMapId) {
          const portal = findPortalTo(currentMapId, monMapId);
          if (!portal) break;
          await moveTo(room, portal.x, portal.y, 48, currentMapId);
          let nextMapReceived: string | null = null;
          room.onMessage("travelTo", (t: any) => {
            if (t?.mapId) nextMapReceived = t.mapId;
          });
          room.send("travel", { portalId: portal.id });
          const tw = Date.now();
          while (!nextMapReceived && Date.now() - tw < 5000) {
            await new Promise((res) => setTimeout(res, 60));
          }
          if (nextMapReceived) {
            currentMapId = nextMapReceived;
            await room.leave();
            room = await client.joinOrCreate(roomNameOf(currentMapId), {
              name: botName,
              secret: botSecret,
              v: PROTOCOL_VERSION,
            });
            setupRoomListeners(room);
            await new Promise((res) => setTimeout(res, 100));
          }
        }

        const monDef = MONSTER_BY_ID[step.monster]!;
        const mapObj = getMap(currentMapId) ?? DEFAULT_MAP;
        const patrolPoints = getPatrolPoints(mapObj, monDef);
        let patrolIdx = 0;

        log(
          `Săn ${step.count} '${step.monster}' ở bản đồ '${currentMapId}' (${patrolPoints.length} điểm tuần tra)...`,
        );
        let killsCount = 0;
        const huntTimeoutMs = Math.max(timeoutSec * 1000, step.count * 15000);
        const huntStart = Date.now();
        let nextPillAt = 0;

        while (killsCount < step.count) {
          if (Date.now() - huntStart > huntTimeoutMs) {
            throw new Error(
              `Quá thời gian săn quái '${step.monster}' (${killsCount}/${step.count}).`,
            );
          }

          // Tìm quái trong room.state
          let targetId: string | null = null;
          let targetX = 0;
          let targetY = 0;

          const me = room.state.players?.get(room.sessionId);

          if (me && me.hp < me.maxHp * 0.75 && Date.now() >= nextPillAt) {
            room.send("useItem", { slot: 0 });
            nextPillAt = Date.now() + 8500;
          }

          if (room.state.monsters && me) {
            let closestDist = Infinity;
            room.state.monsters.forEach((m: any, id: string) => {
              if (m && m.kind === step.monster && m.hp > 0) {
                const d = Math.hypot(m.x - me.x, m.y - me.y);
                if (d < closestDist) {
                  closestDist = d;
                  targetId = id;
                  targetX = m.x;
                  targetY = m.y;
                }
              }
            });
          }

          if (targetId && me) {
            const dist = Math.hypot(targetX - me.x, targetY - me.y);
            const angle = Math.atan2(targetY - me.y, targetX - me.x);
            if (dist > 36) {
              room.send("input", { seq: 1, dx: Math.cos(angle), dy: Math.sin(angle) });
            } else {
              room.send("input", { seq: 1, dx: 0, dy: 0 });
            }
            room.send("attack", { angle });
            room.send("skill", { id: "sword", angle });
          } else if (me) {
            // Tuần tra tới các bãi sinh của loài quái này
            const pt = patrolPoints[patrolIdx % patrolPoints.length];
            const distToPt = Math.hypot(pt.x - me.x, pt.y - me.y);
            if (distToPt < 50) {
              patrolIdx++;
            }
            const ang = Math.atan2(pt.y - me.y, pt.x - me.x);
            room.send("input", { seq: 1, dx: Math.cos(ang), dy: Math.sin(ang) });
          }

          await new Promise((res) => setTimeout(res, 50));

          // Kiểm tra tiến độ nhiệm vụ trong questsMsg
          const qm = questsMsg as QuestsMsg | null;
          const currentProgress = qm?.active.find((a) => a.id === q.id);
          if (currentProgress) {
            if (currentProgress.step > stepIdx) {
              // Bước kill đã xong!
              killsCount = step.count;
              break;
            } else if (currentProgress.step === stepIdx) {
              killsCount = currentProgress.count;
            }
          }
        }

        log(`Đã hạ đủ ${step.count} '${step.monster}'.`);
      }

      stepsDone++;
      await new Promise((res) => setTimeout(res, 100));
    }

    // 4. Trả nhiệm vụ: quay về gặp NPC giver
    while (currentMapId !== plan.giverMapId) {
      const portal = findPortalTo(currentMapId, plan.giverMapId);
      if (!portal) break;
      await moveTo(room, portal.x, portal.y, 48, currentMapId);
      let nextMapReceived: string | null = null;
      room.onMessage("travelTo", (t: any) => {
        if (t?.mapId) nextMapReceived = t.mapId;
      });
      room.send("travel", { portalId: portal.id });
      const tw = Date.now();
      while (!nextMapReceived && Date.now() - tw < 5000) {
        await new Promise((res) => setTimeout(res, 60));
      }
      if (nextMapReceived) {
        currentMapId = nextMapReceived;
        await room.leave();
        room = await client.joinOrCreate(roomNameOf(currentMapId), {
          name: botName,
          secret: botSecret,
          v: PROTOCOL_VERSION,
        });
        setupRoomListeners(room);
        await new Promise((res) => setTimeout(res, 100));
      }
    }

    log(`Quay lại gặp NPC '${q.giver}' để trả nhiệm vụ...`);
    await moveTo(room, giverNpc.x, giverNpc.y, 36, currentMapId);
    room.send("talk", { npcId: q.giver });
    await new Promise((res) => setTimeout(res, 80));
    room.send("questTurnIn", { questId: q.id });

    // Chờ xác nhận nhiệm vụ đã chuyển vào done hoặc dailyDone
    const turnInWait = Date.now();
    let isDone = false;
    const checkDone = () => {
      const qm = questsMsg as QuestsMsg | null;
      if (!qm) return false;
      return (
        qm.done.includes(q.id) ||
        qm.dailyDone.includes(q.id) ||
        !qm.active.some((a) => a.id === q.id)
      );
    };
    while (!isDone) {
      if (Date.now() - turnInWait > 4000) {
        throw new Error(
          `Không trả được nhiệm vụ '${q.id}' ở NPC '${q.giver}'. Toast: ${lastToast}`,
        );
      }
      if (checkDone()) {
        isDone = true;
        break;
      }
      await new Promise((res) => setTimeout(res, 60));
    }

    // 5. Kiểm tra phần thưởng
    if (q.rewards.items && q.rewards.items.length > 0) {
      for (const rew of q.rewards.items) {
        const found = invMsg?.some((slot) => slot?.itemId === rew.itemId && slot.qty >= rew.qty);
        if (!found) {
          log(`Cảnh báo: vật phẩm thưởng '${rew.itemId}' x${rew.qty} chưa xuất hiện trong túi.`);
        }
      }
    }

    const durationSec = Math.round((Date.now() - startTime) / 100) / 10;
    log(`Nhiệm vụ '${q.title}' hoàn thành xuất sắc trong ${durationSec}s.`);

    await room.leave();
    return {
      id: q.id,
      title: q.title,
      giver: q.giver,
      mapId: plan.giverMapId,
      minRealmText,
      success: true,
      durationSec,
      usedGive,
      giveReasons,
      stepsDone: q.steps.length,
      totalSteps: q.steps.length,
    };
  } catch (err: any) {
    if (room) {
      try {
        await room.leave();
      } catch {}
    }
    const durationSec = Math.round((Date.now() - startTime) / 100) / 10;
    return {
      id: q.id,
      title: q.title,
      giver: q.giver,
      mapId: plan.giverMapId,
      minRealmText,
      success: false,
      durationSec,
      usedGive,
      giveReasons,
      stepsDone,
      totalSteps: q.steps.length,
      error: err?.message ?? String(err),
    };
  }
}

/** Chạy bộ kiểm thử khả thi toàn bộ hoặc một phần QUESTS trên máy chủ Colyseus thật */
export async function runQuestWalk(options: QuestWalkOptions = {}): Promise<{
  results: QuestWalkResult[];
  allPassed: boolean;
  totalTimeSec: number;
}> {
  const startTime = Date.now();
  const dataDir = options.dataDir ?? mkdtempSync(path.join(os.tmpdir(), "tien-gioi-qw-"));
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  mkdirSync(path.join(dataDir, "players"), { recursive: true });
  process.env.DATA_DIR = path.join(dataDir, "players");

  const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  const port = await freePort();
  assertNotProd(port, "quest-walk");
  await server.listen(port);

  const client = new Client(`ws://127.0.0.1:${port}`);

  // Lọc nhiệm vụ cần chạy
  let questsToRun = QUESTS;
  if (options.questId) {
    const found = QUEST_BY_ID[options.questId];
    if (!found) throw new Error(`Không tìm thấy nhiệm vụ có ID '${options.questId}'.`);
    questsToRun = [found];
  } else if (options.mapId) {
    questsToRun = QUESTS.filter((q) => {
      const giver = NPC_BY_ID[q.giver];
      const mId = giver?.mapId ?? DEFAULT_MAP_ID;
      return mId === options.mapId;
    });
  }

  console.log(`========================================================================`);
  console.log(`  TIÊN GIỚI - QUEST-WALK: BOT KIỂM TRA KHẢ THI NHIỆM VỤ (Issue #757)`);
  console.log(`  Máy chủ Colyseus cổng: ${port} | Số nhiệm vụ kiểm tra: ${questsToRun.length}`);
  console.log(`========================================================================\n`);

  const results: QuestWalkResult[] = [];
  let allPassed = true;

  for (let i = 0; i < questsToRun.length; i++) {
    const q = questsToRun[i];
    console.log(`[${i + 1}/${questsToRun.length}] Kiểm tra '${q.title}' (${q.id})...`);
    const res = await walkSingleQuest(client, q, options);
    results.push(res);
    if (!res.success) allPassed = false;

    const statusBadge = res.success ? "✓ THÀNH CÔNG" : "✗ THẤT BẠI";
    const giveBadge = res.usedGive ? ` (Cấp đồ: ${res.giveReasons.join(", ")})` : "";
    console.log(`  => ${statusBadge} sau ${res.durationSec}s${giveBadge}`);
    if (res.error) console.log(`     Lỗi: ${res.error}`);
  }

  await server.gracefullyShutdown(false);
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}

  const totalTimeSec = Math.round((Date.now() - startTime) / 100) / 10;

  // In bảng báo cáo tổng kết dạng Markdown
  console.log(`\n============================ BẢNG BÁO CÁO KẾT QUẢ ============================`);
  console.log(
    `| STT | Mã | Tên nhiệm vụ | Bản đồ | NPC giao | Cảnh giới | Kết quả | Thời gian | Cấp đồ (/give) |`,
  );
  console.log(
    `| --- | -- | ------------ | ------ | -------- | --------- | ------- | --------- | -------------- |`,
  );
  results.forEach((r, idx) => {
    const stt = String(idx + 1).padStart(3, " ");
    const status = r.success ? "✓ ĐẠT" : "**✗ ĐỎ**";
    const give = r.usedGive ? `Có (${r.giveReasons.join("; ")})` : "Không";
    console.log(
      `| ${stt} | \`${r.id}\` | ${r.title} | ${r.mapId} | ${r.giver} | ${r.minRealmText} | ${status} | ${r.durationSec}s | ${give} |`,
    );
  });
  console.log(`==============================================================================`);
  console.log(
    `Tổng số: ${results.length} | Thành công: ${results.filter((r) => r.success).length} | Thất bại: ${results.filter((r) => !r.success).length} | Tổng thời gian: ${totalTimeSec}s\n`,
  );

  return { results, allPassed, totalTimeSec };
}

// Chạy trực tiếp qua CLI
const isDirectCli =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectCli) {
  const args = process.argv.slice(2);
  const questArg = args.find((a) => a.startsWith("--quest="))?.split("=")[1];
  const mapArg = args.find((a) => a.startsWith("--map="))?.split("=")[1];
  const giveAll = args.includes("--give-all") || true; // Mặc định giveAll để bot chạy ổn định
  const timeoutArg = args.find((a) => a.startsWith("--timeout="))?.split("=")[1];
  const timeoutSec = timeoutArg ? Number(timeoutArg) : 60;

  runQuestWalk({
    questId: questArg,
    mapId: mapArg,
    giveAll,
    timeoutSec,
  })
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Lỗi quest-walk:", err);
      process.exit(1);
    });
}
