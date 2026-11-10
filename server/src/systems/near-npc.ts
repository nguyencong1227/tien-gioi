// Người chơi còn sống và đứng trong tầm của một NPC. Tách khỏi npc.ts để các system khác (shop, dungeon) dùng được mà không
// kéo theo npc.ts (npc.ts dựng hộp thoại và gọi ngược lại dungeon.ts: nếu dungeon.ts import npc.ts thì thành vòng).
import { DEFAULT_MAP_ID, NPC_BY_ID, NPC_RANGE, type NpcDef } from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World, PlayerCtrl } from "../world";
import { byId } from "./lookup";

/** Người chơi còn sống và đứng trong tầm của NPC. */
export function nearNpc(
  w: World,
  sid: string,
  npcId: unknown,
): { p: Player; c: PlayerCtrl; npc: NpcDef } | null {
  const r = w.ready(sid);
  const npc = byId(NPC_BY_ID, npcId);
  if (!r || !npc) return null;
  // NPC chỉ đứng ở bản đồ của mình: toạ độ của bản đồ khác không có nghĩa ở đây
  if ((npc.mapId ?? DEFAULT_MAP_ID) !== w.map.def.id) return null;
  if (Math.hypot(npc.x - r.p.x, npc.y - r.p.y) > NPC_RANGE) return null;
  return { ...r, npc };
}
