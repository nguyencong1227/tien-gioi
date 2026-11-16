// Công cụ bot kiểm tra tính khả thi MỌI nhiệm vụ trên máy chủ Colyseus thật (Issue #757).
// Chạy trên cổng ngẫu nhiên độc lập (freePort()), tuyệt đối KHÔNG đụng cổng 2567 (prod) hay các cổng dev.
// Cách dùng:
//   npm run quest-walk -w server
//   npm run quest-walk -w server -- --quest=nhap_the
//   npm run quest-walk -w server -- --map=lac_ha
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
  EQUIP_SLOTS,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  ITEMS,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  PROTOCOL_VERSION,
  QUESTS,
  QUEST_BY_ID,
  QUEST_PREV,
  REALMS,
  SKILL_MSG,
  emptyEquipment,
  getMap,
  roomNameOf,
  stepOf,
  type Equipment,
  type GameMap,
  type Inventory,
  type MonsterKind,
  type QuestDef,
  type QuestsMsg,
  type SkillBook,
} from "@tien-gioi/shared";
import { defineRooms } from "../src/rooms/WorldRoom";
import { freePort } from "../src/test-port";
import { gridOf, planPath } from "../src/balance/search-check";
import { safeSpot } from "../src/systems/movement";
import { hashSecret, savePlayer } from "../src/store";
import { assertNotProd } from "./assert-not-prod";

export const MAP_ORDER = [DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID] as const;

/** Trang bị đầy đủ nhất 6 ô cho bot theo cảnh giới yêu cầu để đủ sức làm các nhiệm vụ nguy hiểm */
export function buildFullBestGear(realm: number, tier: number): Equipment {
  const eq = emptyEquipment();
  const step = stepOf(realm, tier);
  for (const slot of EQUIP_SLOTS) {
    let best = -1;
    for (const it of ITEMS) {
      const e = it.equip;
      if (!e || e.slot !== slot) continue;
      const need = stepOf(e.reqRealm, e.reqTier);
      if (need <= step && need > best) {
        best = need;
        eq[slot] = it.id;
      }
    }
  }
  return eq;
}

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

export interface DropSource {
  monster: string;
  chance: number;
  min: number;
  max: number;
  rate: number;
}

export interface DropEstimate {
  hasWildSource: boolean;
  bestMonster?: string;
  bestRate: number;
  expectedKills: number;
  isRareOrBoss: boolean;
  reason?: string;
}

/** Tìm bản đồ đầu tiên mà loài quái này sinh ra */
export function findMapForMonster(monsterId: string): string | null {
  for (const mapId of MAP_ORDER) {
    const map = getMap(mapId);
    if (map && map.monsterCapOf(monsterId) > 0) return mapId;
  }
  return null;
}

/** Tìm danh sách quái rơi vật phẩm này kèm tỉ lệ */
export function findDropsFor(itemId: string): DropSource[] {
  const res: DropSource[] = [];
  for (const [mon, drops] of Object.entries(DROP_TABLES)) {
    const d = drops?.find((x) => x.itemId === itemId);
    if (d) {
      const min = d.min ?? 1;
      const max = d.max ?? 1;
      const avgQty = (min + max) / 2;
      res.push({
        monster: mon,
        chance: d.chance,
        min,
        max,
        rate: d.chance * avgQty,
      });
    }
  }
  res.sort((a, b) => b.rate - a.rate);
  return res;
}

/** Ước lượng số quái cần hạ để gom đủ vật phẩm rơi (Issue #757) */
export function estimateDropsRequired(itemId: string, count: number): DropEstimate {
  const drops = findDropsFor(itemId);
  if (drops.length === 0) {
    return {
      hasWildSource: false,
      bestRate: 0,
      expectedKills: Infinity,
      isRareOrBoss: true,
      reason: "Không có quái nào rơi đồ này (cần /give hoặc mua cửa hàng)",
    };
  }

  let bestMonster: string | undefined;
  let bestRate = 0;
  let hasWild = false;

  for (const d of drops) {
    const mon = MONSTER_BY_ID[d.monster];
    if (!mon) continue;
    const mapId = findMapForMonster(d.monster);
    const isWild = mapId !== null;
    const isBoss =
      mon.boss === true ||
      d.monster === "yeu_vuong" ||
      d.monster === "hac_giao" ||
      d.monster === "thien_han_vuong";

    if (isWild && !isBoss) {
      hasWild = true;
      if (d.rate > bestRate) {
        bestRate = d.rate;
        bestMonster = d.monster;
      }
    } else if (!bestMonster && d.rate > bestRate) {
      bestRate = d.rate;
      bestMonster = d.monster;
    }
  }

  if (!hasWild || !bestMonster) {
    return {
      hasWildSource: false,
      bestMonster,
      bestRate,
      expectedKills: bestRate > 0 ? Math.ceil(count / bestRate) : Infinity,
      isRareOrBoss: true,
      reason: "Vật phẩm chỉ rơi từ trùm hoặc quái hiếm (cần cấp /give)",
    };
  }

  const expectedKills = Math.ceil(count / bestRate);
  const isTooManyKills = expectedKills > 60; // Ngưỡng trần khả năng rơi hợp lý
  return {
    hasWildSource: true,
    bestMonster,
    bestRate,
    expectedKills,
    isRareOrBoss: isTooManyKills || bestRate < 0.1,
    reason: isTooManyKills
      ? `Vượt quá khả năng rơi hợp lý (ước tính cần hạ ${expectedKills} quái > 60)`
      : undefined,
  };
}

/** Kiểm tra bản đồ đích có tiếp cận được từ bản đồ nhiệm vụ theo cảnh giới yêu cầu */
export function isMapReachableForQuest(
  fromMapId: string,
  targetMapId: string,
  minRealm?: { realm: number; tier: number },
): boolean {
  if (fromMapId === targetMapId) return true;
  const fromIdx = MAP_ORDER.indexOf(fromMapId as any);
  const targetIdx = MAP_ORDER.indexOf(targetMapId as any);
  if (fromIdx < 0 || targetIdx < 0) return false;

  const mapReqRealm: Record<string, number> = {
    [DEFAULT_MAP_ID]: 0,
    [HAC_PHONG_ID]: 1,
    [AM_SUONG_ID]: 2,
    [HAN_VAN_ID]: 3,
  };
  const r = minRealm?.realm ?? 0;
  const targetReq = mapReqRealm[targetMapId] ?? 0;
  // Cho phép nhiệm vụ chuẩn bị đột phá bước vào bản đồ kế tiếp (chênh tối đa 1 cấp)
  return r >= targetReq - 1;
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
        } else if (!isMapReachableForQuest(giverMapId, mapId, q.minRealm)) {
          issues.push(
            `Bước ${idx + 1}: quái '${s.monster}' sinh ở bản đồ '${mapId}', không thể tiếp cận từ '${giverMapId}' theo cảnh giới yêu cầu.`,
          );
          plannedSteps.push({
            kind: "kill",
            target: s.monster,
            count: s.count,
            mapId,
            feasible: false,
            needsGive: false,
            reason: "Quái ở bản đồ ngoài tầm tiếp cận",
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
        const est = estimateDropsRequired(s.itemId, s.count);
        if (est.expectedKills > 60) {
          issues.push(
            `Bước ${idx + 1}: số lượng yêu cầu (${s.count} '${s.itemId}') vượt quá khả năng rơi hợp lý (ước tính cần hạ ${est.expectedKills} quái > 60).`,
          );
          plannedSteps.push({
            kind: "collect",
            target: s.itemId,
            count: s.count,
            feasible: false,
            needsGive: false,
            reason: est.reason,
          });
        } else if (!est.hasWildSource) {
          plannedSteps.push({
            kind: "collect",
            target: s.itemId,
            count: s.count,
            feasible: true,
            needsGive: true,
            reason: est.reason,
          });
        } else {
          plannedSteps.push({
            kind: "collect",
            target: s.itemId,
            count: s.count,
            feasible: true,
            needsGive: false,
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

/** Tìm các ô đi được lân cận điểm px, py để tránh kẹt khi điểm đích rơi vào mép vật cản */
function freeCellsNear(
  grid: { w: number; h: number; free: Uint8Array },
  px: number,
  py: number,
): Set<number> {
  const cx = Math.floor(px / 32);
  const cy = Math.floor(py / 32);
  const set = new Set<number>();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < grid.w && ny >= 0 && ny < grid.h) {
        const idx = ny * grid.w + nx;
        if (grid.free[idx] === 1) set.add(idx);
      }
    }
  }
  return set.size > 0
    ? set
    : new Set([Math.min(grid.w * grid.h - 1, Math.max(0, cy * grid.w + cx))]);
}

/** Di chuyển bot tới toạ độ đích (px) bằng tìm đường A* (planPath) tránh vật cản */
export async function moveTo(
  room: Room,
  targetX: number,
  targetY: number,
  targetDist = 36,
  mapId: string = DEFAULT_MAP_ID,
  maxWaitMs?: number,
  abortIf?: () => boolean,
  onTick?: () => void,
): Promise<boolean> {
  const mapObj = getMap(mapId) ?? DEFAULT_MAP;
  const grid = gridOf(mapObj);
  const goals = freeCellsNear(grid, targetX, targetY);

  let me = room.state.players?.get(room.sessionId);
  const initialDist = me ? Math.hypot(targetX - me.x, targetY - me.y) : 1000;
  const timeoutMs = maxWaitMs ?? Math.max(12000, Math.ceil((initialDist / 120) * 1000) + 10000);
  const start = Date.now();
  let seq = 0;

  while (Date.now() - start < timeoutMs) {
    if (onTick) onTick();
    if (abortIf && abortIf()) return true;

    me = room.state.players?.get(room.sessionId);
    if (!me) {
      await new Promise((res) => setTimeout(res, 50));
      continue;
    }
    const dist = Math.hypot(targetX - me.x, targetY - me.y);
    if (dist <= targetDist) {
      room.send("input", { seq: seq + 1, dx: 0, dy: 0 });
      return true;
    }

    const pathResult = planPath(grid, me.x, me.y, goals);
    let dx: number;
    let dy: number;
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

/** Lấy danh sách toạ độ tuần tra các bãi quái sinh ra trên bản đồ, phân bổ đều 8 hướng quanh trấn */
export function getPatrolPoints(map: GameMap, monDef: MonsterKind): { x: number; y: number }[] {
  const grid = gridOf(map);
  const minD = monDef.minDanger;
  const maxD = monDef.id === "tho" ? 0.22 : monDef.id === "lang" ? 0.6 : minD + 0.35;

  // Thu thập các điểm đi được theo từng góc hướng (8 hướng quanh trấn)
  const buckets: { x: number; y: number; dist: number; d: number }[][] = Array.from(
    { length: 8 },
    () => [],
  );

  const stepTiles = 4;
  for (let ty = 2; ty < grid.h - 2; ty += stepTiles) {
    for (let tx = 2; tx < grid.w - 2; tx += stepTiles) {
      const idx = ty * grid.w + tx;
      if (grid.free[idx] !== 1) continue;
      const x = (tx + 0.5) * 32;
      const y = (ty + 0.5) * 32;
      if (map.inSafe(x, y)) continue;

      const d = map.dangerAt(x, y);
      if (d >= minD && d <= maxD) {
        const dx = x - map.townPx.x;
        const dy = y - map.townPx.y;
        let angle = Math.atan2(dy, dx); // [-PI, PI]
        if (angle < 0) angle += 2 * Math.PI; // [0, 2*PI]
        const bucketIdx = Math.floor((angle / (2 * Math.PI)) * 8) % 8;
        const distFromTown = Math.hypot(dx, dy);
        buckets[bucketIdx].push({ x, y, dist: distFromTown, d });
      }
    }
  }

  const sampled: { x: number; y: number }[] = [];
  // Từ mỗi hướng, lấy 1 điểm ở khoảng giữa dải nguy hiểm để tuần tra bao quát
  for (let b = 0; b < 8; b++) {
    const list = buckets[b];
    if (list.length > 0) {
      list.sort((p1, p2) => p1.dist - p2.dist);
      const midIdx = Math.floor(list.length * 0.45);
      const chosen = list[midIdx];
      const spot = safeSpot(map, chosen.x, chosen.y);
      sampled.push(spot);
    }
  }

  return sampled.length > 0 ? sampled : [{ x: map.townPx.x, y: map.townPx.y }];
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

  const { giveAll = false, timeoutSec = 60, silent = false } = options;
  const startTime = Date.now();
  let usedGive = false;
  const giveReasons: string[] = [];
  let stepsDone = 0;

  // Khởi tạo hồ sơ bot phù hợp với quest và chuỗi tiền nhiệm
  let realm = q.minRealm?.realm ?? 0;
  let tier = q.minRealm?.tier ?? 0;

  for (const s of q.steps) {
    if (s.kind === "reachRealm") {
      if (stepOf(realm, tier) < stepOf(s.realm, s.tier)) {
        realm = s.realm;
        tier = s.tier;
      }
    }
  }

  const doneIds: string[] = [];
  for (let cur = QUEST_PREV[q.id]; cur; cur = QUEST_PREV[cur]) {
    doneIds.push(cur);
    const prevQ = QUEST_BY_ID[cur];
    if (prevQ) {
      if (
        prevQ.minRealm &&
        stepOf(realm, tier) < stepOf(prevQ.minRealm.realm, prevQ.minRealm.tier)
      ) {
        realm = prevQ.minRealm.realm;
        tier = prevQ.minRealm.tier;
      }
      for (const s of prevQ.steps) {
        if (s.kind === "reachRealm" && stepOf(realm, tier) < stepOf(s.realm, s.tier)) {
          realm = s.realm;
          tier = s.tier;
        }
      }
    }
  }

  // Nếu nhiệm vụ săn trùm thế giới / trùm đội (Xích Mãng, Hắc Giao, Thiên Hàn Vương, Yêu Vương):
  // do bot chạy solo một mình (không có đội 3-4 người), nạp cảnh giới hậu kỳ (tier 8) để đủ sức solo
  const isBossQuest = q.steps.some(
    (s) =>
      (s.kind === "kill" &&
        ["mang", "yeu_vuong", "hac_giao", "thien_han_vuong"].includes(s.monster)) ||
      (s.kind === "collect" && ["vay_mang", "giao_lan", "thien_han_chau"].includes(s.itemId)),
  );
  if (isBossQuest) {
    tier = Math.max(tier, 8);
  } else {
    // Chuẩn bị cấp bậc cho bot để đủ sức làm các nhiệm vụ theo cảnh giới yêu cầu:
    // Trúc Cơ (realm 2): tier 2
    // Kim Đan (realm 3): tier 2 (Kim Đan hậu kỳ kèm bestGear(3, 2))
    // Nguyên Anh (realm 4): tier 2 (Nguyên Anh hậu kỳ kèm bestGear(4, 2))
    // Luyện Khí có đánh quái: ít nhất Luyện Khí tầng 6 (tier 5)
    if (realm === 4) {
      tier = Math.max(tier, 2);
    } else if (realm === 3) {
      tier = Math.max(tier, 2);
    } else if (realm === 2) {
      tier = Math.max(tier, 2);
    } else {
      const hasKillStep = q.steps.some((s) => s.kind === "kill" || s.kind === "collect");
      if (hasKillStep && realm <= 1 && q.id !== "tru_tho") {
        realm = 1;
        tier = Math.max(tier, 5);
      }
    }
  }

  const giverNpc = NPC_BY_ID[q.giver]!;
  let currentMapId = giverNpc.mapId ?? DEFAULT_MAP_ID;
  const botName = `BotQW${Math.floor(Math.random() * 90000 + 10000)}`;
  const botSecret = "botqwsecret123456";

  const gear = buildFullBestGear(Math.max(1, realm), tier);
  const nowIso = new Date().toISOString();
  const invSlots: any[] = Array.from({ length: 16 }, () => null);
  invSlots[0] = { itemId: "dai_hoi_huyet_dan", qty: 99 };
  invSlots[1] = { itemId: "hoi_huyet_dan", qty: 99 };
  invSlots[2] = { itemId: "dai_hoi_linh_dan", qty: 99 };

  // Sổ chiêu thức nạp sẵn các chiêu thức phù hợp với cảnh giới
  const skillBook: SkillBook = {
    learned: {
      hoa_van_kiem: 3,
      thanh_tung_phi_cham: 3,
      van_thach_tran: 3,
      phong_hanh_quyet: 3,
    },
    slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "van_thach_tran", ""],
  };

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
    skills: skillBook,
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
  let abortReason: string | null = null;
  let currentStepDesc = "Khởi tạo bot";
  let isPlannedTravel = false;

  const log = (msg: string) => {
    if (!silent) console.log(`  [${q.id}] ${msg}`);
  };

  const checkAbort = () => {
    if (abortReason) {
      throw new Error(abortReason);
    }
    if (room && !room.connection.isOpen && !isPlannedTravel) {
      throw new Error(
        `connection_closed: Mất kết nối phòng tại bản đồ '${currentMapId}' trong bước [${currentStepDesc}]`,
      );
    }
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
      r.onMessage("limbo", (_msg: any) => {
        const reason = `bot_died: Bot gục ngã (nhận tin limbo) tại bản đồ '${currentMapId}' trong bước [${currentStepDesc}]`;
        log(`[ABORT] ${reason}`);
        if (!abortReason) abortReason = reason;
      });
      r.onMessage("reborn", () => {
        const reason = `bot_reborn: Bot nhận tin reborn ngoài kế hoạch tại bản đồ '${currentMapId}' trong bước [${currentStepDesc}]`;
        log(`[ABORT] ${reason}`);
        if (!abortReason) abortReason = reason;
      });
      r.onMessage("travelTo", (t: any) => {
        if (!isPlannedTravel) {
          const reason = `unplanned_travel: Bot nhận tin travelTo ngoài kế hoạch (đích: ${t?.mapId}) tại bản đồ '${currentMapId}' trong bước [${currentStepDesc}]`;
          log(`[ABORT] ${reason}`);
          if (!abortReason) abortReason = reason;
        }
      });
      r.onMessage("dmg", (m: any) => {
        if (m?.target === botName || m?.source === botName) {
          log(`[DMG] ${m.source} -> ${m.target}: ${m.amount} (hp left: ${m.hp})`);
        }
      });
      for (const m of [
        "fx",
        "wallet",
        "chat",
        "sys",
        "party",
        "sect",
        "trade",
        "dialog",
        SKILL_MSG.skills,
        SKILL_MSG.status,
      ]) {
        r.onMessage(m, () => {});
      }
    };

    setupRoomListeners(room);

    // Chờ nhận tin quests ban đầu
    const waitInitial = Date.now();
    while (!questsMsg && Date.now() - waitInitial < 3000) {
      checkAbort();
      await new Promise((res) => setTimeout(res, 50));
    }

    currentStepDesc = `Đi tới NPC giao '${q.giver}' (${giverNpc.mapId ?? DEFAULT_MAP_ID})`;
    log(`Đã vào phòng ${roomNameOf(currentMapId)}, di chuyển tới NPC ${q.giver}...`);
    await moveTo(room, giverNpc.x, giverNpc.y, 36, currentMapId, undefined, undefined, checkAbort);

    // 2. Nhận nhiệm vụ ở NPC giver
    currentStepDesc = `Nhận nhiệm vụ tại NPC '${q.giver}'`;
    room.send("talk", { npcId: q.giver });
    await new Promise((res) => setTimeout(res, 60));
    checkAbort();
    room.send("questAccept", { questId: q.id });

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

    // Hàm hỗ trợ chuyển bản đồ qua portal
    const travelToMap = async (targetMap: string) => {
      while (currentMapId !== targetMap) {
        checkAbort();
        const portal = findPortalTo(currentMapId, targetMap);
        if (!portal) {
          throw new Error(`Không tìm thấy portal từ '${currentMapId}' sang '${targetMap}'.`);
        }
        currentStepDesc = `Chuyển bản đồ từ '${currentMapId}' sang '${targetMap}' qua portal '${portal.id}'`;
        log(`Di chuyển tới portal '${portal.id}' (${portal.x}, ${portal.y})...`);
        await moveTo(room!, portal.x, portal.y, 48, currentMapId, undefined, undefined, checkAbort);

        let nextMapReceived: string | null = null;
        isPlannedTravel = true;
        try {
          room!.onMessage("travelTo", (t: any) => {
            if (t?.mapId) nextMapReceived = t.mapId;
          });

          room!.send("travel", { portalId: portal.id });

          const travelWait = Date.now();
          while (!nextMapReceived && Date.now() - travelWait < 5000) {
            checkAbort();
            await new Promise((res) => setTimeout(res, 60));
          }

          if (!nextMapReceived) {
            throw new Error(`Lỗi chuyển bản đồ qua portal '${portal.id}'. Toast: ${lastToast}`);
          }

          currentMapId = nextMapReceived;
          try {
            room!.leave(true);
          } catch {
            /* ignore */
          }
          const closeWait = Date.now();
          while (room!.connection.isOpen && Date.now() - closeWait < 1000) {
            await new Promise((res) => setTimeout(res, 50));
          }

          room = await client.joinOrCreate(roomNameOf(currentMapId), {
            name: botName,
            secret: botSecret,
            v: PROTOCOL_VERSION,
          });
          setupRoomListeners(room);
          log(`Đã chuyển tới bản đồ '${currentMapId}'.`);
          await new Promise((res) => setTimeout(res, 100));
        } finally {
          isPlannedTravel = false;
        }
      }
    };

    // Hàm hỗ trợ săn quái và nhặt đồ rơi thật
    const huntAndCollect = async (params: {
      monsterKind?: string;
      collectItemId?: string;
      targetCount: number;
      isCollect: boolean;
      currentStepIdx: number;
    }) => {
      const { monsterKind, collectItemId, targetCount, isCollect, currentStepIdx } = params;
      currentStepDesc = isCollect
        ? `Thu thập ${targetCount} '${collectItemId}' từ quái '${monsterKind}'`
        : `Săn ${targetCount} quái '${monsterKind}'`;
      const targetMapId = monsterKind
        ? (findMapForMonster(monsterKind) ?? currentMapId)
        : currentMapId;
      await travelToMap(targetMapId);

      const monDef = monsterKind ? MONSTER_BY_ID[monsterKind] : undefined;
      const mapObj = getMap(currentMapId) ?? DEFAULT_MAP;
      const patrolPoints = monDef
        ? getPatrolPoints(mapObj, monDef)
        : [{ x: mapObj.townPx.x, y: mapObj.townPx.y }];
      log(
        `[HUNT] Patrol points (${patrolPoints.length}): ${JSON.stringify(patrolPoints.slice(0, 5))}`,
      );
      let patrolIdx = 0;

      const huntTimeoutMs = Math.max(timeoutSec * 1000, targetCount * 18000);
      const huntStart = Date.now();
      let nextPillAt = 0;
      let nextSmallPillAt = 0;
      let nextManaAt = 0;
      let nextAttackAt = 0;
      let nextCastAt = 0;
      let nextSwordAt = 0;
      let nextPickupAt = 0;
      let seq = 0;
      const pickupAttempts = new Map<string, number>();
      const lootApproachFrames = new Map<string, number>();

      const getItemQty = () => {
        if (!collectItemId) return 0;
        return (invMsg ?? []).reduce(
          (sum, slot) => (slot?.itemId === collectItemId ? sum + (slot.qty ?? 0) : sum),
          0,
        );
      };

      const initialQty = getItemQty();

      const isValidTarget = (m: any) => {
        if (!m || m.hp <= 0) return false;
        if (monsterKind && m.kind !== monsterKind) return false;
        if (monsterKind === "tho" && mapObj.dangerAt(m.x, m.y) > 0.3) return false;
        return true;
      };

      let lastStatusLog = 0;
      while (Date.now() - huntStart < huntTimeoutMs) {
        checkAbort();
        const me = room!.state.players?.get(room!.sessionId);
        if (!me || me.hp <= 0) {
          if (me && me.hp <= 0 && !abortReason) {
            abortReason = `bot_died: Khí huyết bot cạn kiệt (HP <= 0) tại bản đồ '${currentMapId}' trong bước [${currentStepDesc}]`;
          }
          checkAbort();
          await new Promise((res) => setTimeout(res, 50));
          continue;
        }

        if (Date.now() - lastStatusLog > 2000) {
          log(
            `[HUNT] Pos: (${Math.round(me.x)}, ${Math.round(me.y)}), HP: ${me.hp}/${me.maxHp}, MP: ${me.mp}/${me.maxMp}`,
          );
          lastStatusLog = Date.now();
        }

        // Tự cắn đan hồi máu / hồi mana (2 loại đan hồi máu độc lập)
        if (me.hp < me.maxHp * 0.85) {
          if (Date.now() >= nextPillAt) {
            room!.send("useItem", { slot: 0 });
            nextPillAt = Date.now() + 8500;
          }
          if (me.hp < me.maxHp * 0.6 && Date.now() >= nextSmallPillAt) {
            room!.send("useItem", { slot: 1 });
            nextSmallPillAt = Date.now() + 8500;
          }
        }
        if (me.mp < me.maxMp * 0.5 && Date.now() >= nextManaAt) {
          room!.send("useItem", { slot: 2 });
          nextManaAt = Date.now() + 8500;
        }

        // Kiểm tra điều kiện hoàn thành
        if (isCollect) {
          if (getItemQty() >= initialQty + targetCount || getItemQty() >= targetCount) {
            return;
          }
        } else {
          const qm = questsMsg as QuestsMsg | null;
          const curProg = qm?.active.find((a) => a.id === q.id);
          if (curProg) {
            if (curProg.step > currentStepIdx || curProg.count >= targetCount) {
              return;
            }
          }
        }

        // Ưu tiên nhặt đồ rơi gần bot (tầm nhìn 350px)
        let nearestLootId: string | null = null;
        let lootX = 0;
        let lootY = 0;
        let nearestLootDist = 350;
        let lootPath: { cells: number[]; length: number } | null = null;

        if (room!.state.loot) {
          const grid = gridOf(mapObj);
          room!.state.loot.forEach((l: any, id: string) => {
            if (l) {
              const attempts = pickupAttempts.get(id) ?? 0;
              if (attempts < 3) {
                const d = Math.hypot(l.x - me.x, l.y - me.y);
                if (d < nearestLootDist) {
                  const goals = freeCellsNear(grid, l.x, l.y);
                  const pathRes = planPath(grid, me.x, me.y, goals);
                  if (pathRes) {
                    nearestLootDist = d;
                    nearestLootId = id;
                    lootX = l.x;
                    lootY = l.y;
                    lootPath = pathRes;
                  } else {
                    pickupAttempts.set(id, 99); // Không có đường đi tới đồ rơi, bỏ qua
                  }
                }
              }
            }
          });
        }

        if (nearestLootId) {
          const approachCount = (lootApproachFrames.get(nearestLootId) ?? 0) + 1;
          lootApproachFrames.set(nearestLootId, approachCount);

          if (approachCount > 40 && nearestLootDist > 40) {
            // Không thể tiếp cận sau 2 giây, bỏ qua để không kẹt
            pickupAttempts.set(nearestLootId, 99);
          } else if (nearestLootDist > 38) {
            const pRes = lootPath as { cells: number[] } | null;
            if (pRes && pRes.cells.length > 1) {
              const grid = gridOf(mapObj);
              const nextCell = pRes.cells[1];
              const nx = ((nextCell % grid.w) + 0.5) * 32;
              const ny = (Math.floor(nextCell / grid.w) + 0.5) * 32;
              const ang = Math.atan2(ny - me.y, nx - me.x);
              room!.send("input", { seq: ++seq, dx: Math.cos(ang), dy: Math.sin(ang) });
            } else {
              const ang = Math.atan2(lootY - me.y, lootX - me.x);
              room!.send("input", { seq: ++seq, dx: Math.cos(ang), dy: Math.sin(ang) });
            }
          } else {
            room!.send("input", { seq: ++seq, dx: 0, dy: 0 });
            if (Date.now() >= nextPickupAt) {
              log(`[LOOT] Nhặt đồ rơi '${nearestLootId}' (dist: ${nearestLootDist.toFixed(1)})`);
              pickupAttempts.set(nearestLootId, (pickupAttempts.get(nearestLootId) ?? 0) + 1);
              room!.send("pickup", { lootId: nearestLootId });
              nextPickupAt = Date.now() + 250;
            }
          }
          await new Promise((res) => setTimeout(res, 50));
          continue;
        }

        // Tự vệ nếu có quái mục tiêu áp sát (<= 58px) ngáng đường khi đang bị mất máu
        let selfDefenseId: string | null = null;
        let selfDefenseAngle = 0;
        if (room!.state.monsters && me.hp < me.maxHp * 0.95) {
          room!.state.monsters.forEach((m: any, id: string) => {
            if (m && m.hp > 0 && isValidTarget(m)) {
              const d = Math.hypot(m.x - me.x, m.y - me.y);
              if (d <= 58) {
                selfDefenseId = id;
                selfDefenseAngle = Math.atan2(m.y - me.y, m.x - me.x);
              }
            }
          });
        }

        if (selfDefenseId) {
          const now = Date.now();
          const monObj = room!.state.monsters?.get(selfDefenseId);

          if (now >= nextAttackAt) {
            log(
              `[SELF-DEFENSE] Tiêu diệt quái mục tiêu áp sát '${monObj?.kind ?? selfDefenseId}' (HP: ${monObj?.hp})`,
            );
            room!.send("attack", { angle: selfDefenseAngle });
            nextAttackAt = now + 350;
          }
          if (now >= nextCastAt) {
            room!.send(SKILL_MSG.cast, { slot: 2, angle: selfDefenseAngle });
            nextCastAt = now + 3100;
          }
          if (now >= nextSwordAt && me.mp >= 20) {
            room!.send("skill", { id: "sword", angle: selfDefenseAngle });
            nextSwordAt = now + 900;
          }

          await new Promise((res) => setTimeout(res, 50));
          continue;
        }

        // Tìm quái mục tiêu gần nhất có đường đi tới được
        let targetId: string | null = null;
        let targetX = 0;
        let targetY = 0;
        let targetPath: { cells: number[]; length: number } | null = null;
        let closestDist = Infinity;

        if (room!.state.monsters) {
          const grid = gridOf(mapObj);
          room!.state.monsters.forEach((m: any, id: string) => {
            if (isValidTarget(m)) {
              const d = Math.hypot(m.x - me.x, m.y - me.y);
              if (d < closestDist && d <= 1000) {
                const goals = freeCellsNear(grid, m.x, m.y);
                const pathRes = planPath(grid, me.x, me.y, goals);
                if (pathRes) {
                  closestDist = d;
                  targetId = id;
                  targetX = m.x;
                  targetY = m.y;
                  targetPath = pathRes;
                }
              }
            }
          });
        }

        if (targetId) {
          const liveMon = room!.state.monsters?.get(targetId);
          if (liveMon) {
            targetX = liveMon.x;
            targetY = liveMon.y;
          }
          const dist = Math.hypot(targetX - me.x, targetY - me.y);
          const angle = Math.atan2(targetY - me.y, targetX - me.x);
          if (dist > 36) {
            const pRes = targetPath as { cells: number[] } | null;
            if (pRes && pRes.cells.length > 1) {
              const grid = gridOf(mapObj);
              const nextCell = pRes.cells[1];
              const nx = ((nextCell % grid.w) + 0.5) * 32;
              const ny = (Math.floor(nextCell / grid.w) + 0.5) * 32;
              const ang = Math.atan2(ny - me.y, nx - me.x);
              room!.send("input", { seq: ++seq, dx: Math.cos(ang), dy: Math.sin(ang) });
            } else {
              room!.send("input", { seq: ++seq, dx: Math.cos(angle), dy: Math.sin(angle) });
            }
          } else {
            room!.send("input", { seq: ++seq, dx: 0, dy: 0 });
          }

          const now = Date.now();
          if (dist <= 220 && now >= nextCastAt) {
            room!.send(SKILL_MSG.cast, { slot: 1, angle }); // Thanh Tùng Phi Châm tầm xa
            nextCastAt = now + 3100;
          }
          if (dist <= 180 && dist > 55 && now >= nextSwordAt && me.mp >= 20) {
            room!.send("skill", { id: "sword", angle });
            nextSwordAt = now + 900;
          }

          if (dist <= 55) {
            if (now >= nextAttackAt) {
              const monObj = room!.state.monsters?.get(targetId);
              log(
                `[COMBAT] Chém quái '${monObj?.kind ?? targetId}' (HP: ${monObj?.hp}), dist: ${dist.toFixed(1)}`,
              );
              room!.send("attack", { angle });
              nextAttackAt = now + 350;
            }
            if (now >= nextCastAt) {
              room!.send(SKILL_MSG.cast, { slot: 2, angle });
              nextCastAt = now + 3100;
            }
            if (now >= nextSwordAt && me.mp >= 20) {
              room!.send("skill", { id: "sword", angle });
              nextSwordAt = now + 900;
            }
          }
          await new Promise((res) => setTimeout(res, 50));
          continue;
        }

        // Tuần tra có tìm đường A* tránh vật cản tới bãi quái
        const pt = patrolPoints[patrolIdx % patrolPoints.length];
        let aborted = false;
        await moveTo(
          room!,
          pt.x,
          pt.y,
          48,
          currentMapId,
          6000,
          () => {
            const curMe = room!.state.players?.get(room!.sessionId);
            if (!curMe) return false;
            // Ngắt tuần tra nếu có loot gần (<= 250px)
            let hasLoot = false;
            if (room!.state.loot) {
              room!.state.loot.forEach((l: any, lid: string) => {
                if (
                  (pickupAttempts.get(lid) ?? 0) < 3 &&
                  Math.hypot(l.x - curMe.x, l.y - curMe.y) <= 250
                ) {
                  hasLoot = true;
                }
              });
            }
            if (hasLoot) {
              aborted = true;
              return true;
            }
            // Ngắt tuần tra nếu có quái mục tiêu gần (<= 600px)
            let hasMon = false;
            if (room!.state.monsters) {
              room!.state.monsters.forEach((m: any) => {
                if (isValidTarget(m)) {
                  if (Math.hypot(m.x - curMe.x, m.y - curMe.y) <= 600) {
                    hasMon = true;
                  }
                }
              });
            }
            if (hasMon) {
              aborted = true;
              return true;
            }
            return false;
          },
          checkAbort,
        );
        if (!aborted) {
          patrolIdx++;
        }

        await new Promise((res) => setTimeout(res, 50));
      }

      if (isCollect) {
        throw new Error(
          `Quá thời gian thu thập đồ rơi '${collectItemId}' (${getItemQty()}/${targetCount}).`,
        );
      } else {
        throw new Error(`Quá thời gian săn quái '${monsterKind}' (${targetCount}).`);
      }
    };

    // 3. Thực hiện từng step
    for (let stepIdx = 0; stepIdx < q.steps.length; stepIdx++) {
      const step = q.steps[stepIdx];
      log(`Bắt đầu bước ${stepIdx + 1}/${q.steps.length}: ${step.kind}...`);

      if (step.kind === "reachRealm") {
        currentStepDesc = `Đạt cảnh giới (${step.realm}, ${step.tier})`;
        log(`Kiểm tra đạt cảnh giới yêu cầu (${step.realm}, ${step.tier}): đã đạt theo hồ sơ.`);
      } else if (step.kind === "talk") {
        const targetNpc = NPC_BY_ID[step.npcId]!;
        const targetMapId = targetNpc.mapId ?? DEFAULT_MAP_ID;
        currentStepDesc = `Nói chuyện với NPC '${step.npcId}' (${targetNpc.name})`;
        await travelToMap(targetMapId);

        log(`Di chuyển tới NPC '${step.npcId}' (${targetNpc.name})...`);
        await moveTo(
          room,
          targetNpc.x,
          targetNpc.y,
          36,
          currentMapId,
          undefined,
          undefined,
          checkAbort,
        );
        checkAbort();
        room.send("talk", { npcId: step.npcId });
        await new Promise((res) => setTimeout(res, 200));
        checkAbort();
        log(`Đã nói chuyện với NPC '${step.npcId}'.`);
      } else if (step.kind === "collect") {
        currentStepDesc = `Thu thập ${step.count} '${step.itemId}'`;
        const plannedStep = plan.steps[stepIdx];
        const hasEnough = (invMsg ?? []).some(
          (slot) => slot?.itemId === step.itemId && (slot.qty ?? 0) >= step.count,
        );

        if (hasEnough) {
          log(`Túi đồ đã có sẵn đủ ${step.count} '${step.itemId}'.`);
        } else if (plannedStep?.needsGive || giveAll) {
          // Chỉ /give khi needsGive hoặc người dùng bật cờ giveAll
          checkAbort();
          room.send("chat", { text: `/give ${step.itemId} ${step.count}` });
          usedGive = true;
          const rsn = plannedStep?.reason ?? "Cấp theo tùy chọn giveAll";
          if (!giveReasons.includes(rsn)) giveReasons.push(rsn);
          await new Promise((res) => setTimeout(res, 200));
          checkAbort();
          log(`Đã cấp ${step.count} '${step.itemId}' vào túi đồ (${rsn}).`);
        } else {
          // Săn đồ rơi thật
          const drops = findDropsFor(step.itemId);
          const monTarget = drops[0]?.monster;
          if (!monTarget) {
            throw new Error(`Không tìm thấy quái dã ngoại rơi '${step.itemId}'.`);
          }
          log(`Săn quái '${monTarget}' nhặt đủ ${step.count} '${step.itemId}'...`);
          await huntAndCollect({
            monsterKind: monTarget,
            collectItemId: step.itemId,
            targetCount: step.count,
            isCollect: true,
            currentStepIdx: stepIdx,
          });
          log(`Đã thu thập đủ ${step.count} '${step.itemId}' qua rơi thật.`);
        }
      } else if (step.kind === "kill") {
        currentStepDesc = `Hạ gục ${step.count} '${step.monster}'`;
        log(`Săn ${step.count} '${step.monster}'...`);
        await huntAndCollect({
          monsterKind: step.monster,
          targetCount: step.count,
          isCollect: false,
          currentStepIdx: stepIdx,
        });
        log(`Đã hạ đủ ${step.count} '${step.monster}'.`);
      }

      stepsDone++;
      await new Promise((res) => setTimeout(res, 100));
    }

    // 4. Trả nhiệm vụ: quay về gặp NPC giver
    currentStepDesc = `Quay lại trả nhiệm vụ ở NPC '${q.giver}'`;
    await travelToMap(plan.giverMapId);

    log(`Quay lại gặp NPC '${q.giver}' để trả nhiệm vụ...`);
    await moveTo(room, giverNpc.x, giverNpc.y, 36, currentMapId, undefined, undefined, checkAbort);
    checkAbort();

    const meBefore = room.state.players?.get(room.sessionId);
    const lastExp = meBefore?.exp ?? 0;

    room.send("talk", { npcId: q.giver });
    await new Promise((res) => setTimeout(res, 80));
    checkAbort();
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
      checkAbort();
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

    // 5. Xác thực phần thưởng
    const meAfter = room.state.players?.get(room.sessionId);
    const expGained = (meAfter?.exp ?? 0) - lastExp;
    const expectedExp = q.rewards.exp ?? 0;

    // Nếu nhân vật chạm trần expMax chờ đột phá (isLastTier), exp sẽ bị kẹp ở expMax
    const isCappedAtMax =
      meAfter !== undefined &&
      meAfter.exp === meAfter.expMax &&
      lastExp + expectedExp >= meAfter.expMax;

    if (expectedExp > 0 && expGained !== expectedExp && expGained >= 0 && !isCappedAtMax) {
      // Trường hợp đột phá cảnh giới làm reset exp thì bỏ qua kiểm tra chênh lệch đơn giản
      if (meAfter?.realm === meBefore?.realm && meAfter?.tier === meBefore?.tier) {
        throw new Error(
          `Phần thưởng exp không khớp: kỳ vọng ${expectedExp}, thực tế nhận ${expGained}`,
        );
      }
    }

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

    if (room && room.connection.isOpen) {
      try {
        await room.leave(true);
      } catch {
        /* ignore */
      }
    }
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
    if (room && room.connection.isOpen) {
      try {
        await room.leave(true);
      } catch {
        /* ignore */
      }
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
  } catch {
    /* ignore */
  }

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

  const failedQuests = results.filter((r) => !r.success);
  if (failedQuests.length > 0) {
    console.log(`DANH SÁCH NHIỆM VỤ THẤT BẠI (${failedQuests.length}):`);
    failedQuests.forEach((f) => {
      console.log(`  - [${f.id}] '${f.title}': ${f.error}`);
    });
    console.log("");
  } else {
    console.log(
      `✓ TẤT CẢ ${results.length} NHIỆM VỤ ĐÃ KIỂM TRA ĐỀU ĐẠT TÍNH KHẢ THI TRÊN MÁY CHỦ THẬT.\n`,
    );
  }

  return { results, allPassed, totalTimeSec };
}

// Chạy trực tiếp qua CLI
const isDirectCli =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectCli) {
  const args = process.argv.slice(2);
  const questArg = args.find((a) => a.startsWith("--quest="))?.split("=")[1];
  const mapArg = args.find((a) => a.startsWith("--map="))?.split("=")[1];
  const giveAll = args.includes("--give-all");
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
