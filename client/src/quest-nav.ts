// Chỉ đường nhiệm vụ XÉT BẢN ĐỒ (M6): từ khi có ba bản đồ, đích của một bước nhiệm vụ (NPC, quái, vật phẩm rơi, người giao)
// có thể nằm ở bản đồ KHÁC bản đồ người chơi đang đứng; toạ độ của đích chỉ có nghĩa trong bản đồ của nó, nên mũi tên phải chỉ
// tới CỔNG kế tiếp trên đường tới đó (tìm đường theo đồ thị cổng). Toàn hàm thuần (không Phaser) để test được.
import {
  DEFAULT_MAP_ID,
  DROP_TABLES,
  MAPS,
  MONSTER_BY_ID,
  NPC_BY_ID,
  getMap,
  questReady,
  type PortalDef,
  type QuestCtx,
  type QuestDef,
  type QuestProgress,
} from "@tien-gioi/shared";

/** Đích của bước hiện tại: đứng ở đâu cũng được, hoặc phải tới một trong các bản đồ này. */
export type QuestGoal = { kind: "anywhere" } | { kind: "maps"; mapIds: string[] };

/** Chặng kế tiếp trên đường sang bản đồ đích: đi vào `portal` (đang ở bản đồ xuất phát), tới `toMapId`. */
export interface NavHop {
  portal: PortalDef;
  toMapId: string;
  /** Số cổng phải qua tính cả cổng này (>= 1) */
  hops: number;
}

/** Bản đồ nơi NPC đứng (`NpcDef.mapId` thiếu = bản đồ mặc định); undefined nếu không có NPC đó. */
export function npcMapId(npcId: string): string | undefined {
  // `hasOwn`: `NPC_BY_ID["constructor"]` không phải undefined (bảng là object thường)
  if (!Object.hasOwn(NPC_BY_ID, npcId)) return undefined;
  return NPC_BY_ID[npcId].mapId ?? DEFAULT_MAP_ID;
}

/** Các bản đồ ngoài hoang có sinh quái `monsterId` (`monsterCap` > 0). Bí cảnh không tính: người chơi không đi "tới" bí cảnh bằng cổng. */
export function mapsSpawning(monsterId: string): string[] {
  return MAPS.filter((d) => (getMap(d.id)?.monsterCapOf(monsterId) ?? 0) > 0).map((d) => d.id);
}

/** Quái (id) rơi `itemId`, theo tỉ lệ rơi giảm dần. */
function droppers(itemId: string): string[] {
  const rows: [string, number][] = [];
  for (const [monId, entries] of Object.entries(DROP_TABLES)) {
    const e = entries.find((x) => x.itemId === itemId);
    if (e) rows.push([monId, e.chance]);
  }
  return rows.sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Các bản đồ ngoài hoang mà ở đó có quái rơi `itemId`. */
export function dropMaps(itemId: string): string[] {
  const ids = new Set<string>();
  for (const mon of droppers(itemId)) for (const m of mapsSpawning(mon)) ids.add(m);
  return MAPS.map((d) => d.id).filter((id) => ids.has(id));
}

/**
 * Quái nên nhắm để lấy `itemId` khi đang ở bản đồ `mapId`: ưu tiên QUÁI THƯỜNG sinh ở đó (trùm có máu rất dày, không phải nguồn
 * để cày nguyên liệu nếu có loài thường rơi nó), rồi tới tỉ lệ rơi cao nhất; undefined nếu bản đồ không sinh quái nào rơi nó.
 */
export function dropSourceIn(itemId: string, mapId: string): string | undefined {
  const here = droppers(itemId).filter((mon) => mapsSpawning(mon).includes(mapId));
  return here.find((mon) => !MONSTER_BY_ID[mon]?.boss) ?? here[0];
}

/** Đích của bước hiện tại của một nhiệm vụ đang làm; null nếu không xác định được (id lạ, quái không sinh ở đâu cả). */
export function questGoal(def: QuestDef, prog: QuestProgress, ctx: QuestCtx): QuestGoal | null {
  const only = (ids: string[]): QuestGoal | null =>
    ids.length ? { kind: "maps", mapIds: ids } : null;
  // Xong hết bước (hoặc đủ đồ để trả): về người giao
  if (questReady(def, prog, ctx)) {
    const m = npcMapId(def.giver);
    return m ? { kind: "maps", mapIds: [m] } : null;
  }
  const step = def.steps[prog.step];
  if (!step) return null;
  switch (step.kind) {
    case "talk": {
      const m = npcMapId(step.npcId);
      return m ? { kind: "maps", mapIds: [m] } : null;
    }
    case "kill":
      return only(mapsSpawning(step.monster));
    case "collect":
      return only(dropMaps(step.itemId));
    case "reachRealm":
      return { kind: "anywhere" };
    default:
      return null;
  }
}

/**
 * Cổng kế tiếp phải vào từ bản đồ `fromMapId` để tới GẦN NHẤT một trong `targetMapIds` (tìm theo chiều rộng trên đồ thị cổng).
 * null khi đã ở một bản đồ đích, khi không có đường (vd đang ở bí cảnh: không có cổng ra) hoặc không có đích hợp lệ.
 */
export function nextHop(fromMapId: string, targetMapIds: readonly string[]): NavHop | null {
  const targets = new Set(targetMapIds);
  if (targets.has(fromMapId) || targets.size === 0) return null;
  const graph = new Map<string, PortalDef[]>(MAPS.map((d) => [d.id, [...(d.portals ?? [])]]));
  if (!graph.has(fromMapId)) return null;
  // Mỗi phần tử hàng đợi giữ cổng ĐẦU TIÊN (ở bản đồ xuất phát) của đường đi tới nó
  const queue: { mapId: string; first: PortalDef; hops: number }[] = [];
  const seen = new Set<string>([fromMapId]);
  for (const p of graph.get(fromMapId)!) {
    if (!graph.has(p.toMap) || seen.has(p.toMap)) continue;
    seen.add(p.toMap);
    queue.push({ mapId: p.toMap, first: p, hops: 1 });
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (targets.has(cur.mapId))
      return { portal: cur.first, toMapId: cur.first.toMap, hops: cur.hops };
    for (const p of graph.get(cur.mapId) ?? []) {
      if (!graph.has(p.toMap) || seen.has(p.toMap)) continue;
      seen.add(p.toMap);
      queue.push({ mapId: p.toMap, first: cur.first, hops: cur.hops + 1 });
    }
  }
  return null;
}

/** Chữ ngắn hiện cạnh mũi tên khi đang chỉ tới cổng, vd "Qua Vọng Trạch Quan". */
export function hopLabel(hop: NavHop): string {
  return `Qua ${hop.portal.name}`;
}
