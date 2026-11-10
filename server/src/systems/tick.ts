// Một tick của thế giới (TICK_MS). WorldRoom gọi mỗi tick; benchmark (server/src/perf) gọi y hệt.
import type { World } from "../world";
import { POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickRespawn } from "./combat";
import { tickMonsters } from "./monsters";
import { tickRecovery } from "./progression";
import { tickLoot } from "./loot";
import { tickParty } from "./party";
import { tickDungeonRun, tickDungeons } from "./dungeon";
import { tickDuels } from "./duel";

export function tickWorld(w: World, dtMs: number) {
  const dt = dtMs / 1000;
  w.state.players.forEach((p, sid) => {
    const c = w.ctrl.get(sid);
    if (!c) return;
    if (c.limbo) return; // ở Hoàng Tuyền: không hồi sinh theo đồng hồ, chỉ đầu thai khi người chơi chọn
    if (p.dead) return tickRespawn(w, p, c);
    if (w.ghosts.size > 0 && w.ghosts.has(sid)) return; // hồn lìa xác: đứng yên, không hồi phục, không tu luyện
    c.life.playMs += dtMs; // thời gian chơi thật của kiếp (không tính chết, hồn lìa xác)
    applyInputs(w.map, p, c);
    if ((w.tick + c.posPhase) % POS_SYNC_EVERY_TICKS === 0) syncPublicPos(p);
    if (!w.duels.has(sid)) tickRecovery(w, sid, p, c, dt); // trong trận thách đấu: không hồi khí huyết / linh lực, không đả tọa
  });
  tickMonsters(w, dt);
  tickLoot(w);
  tickParty(w);
  tickDungeons(w);
  tickDungeonRun(w);
  tickDuels(w);
  w.interest.update(w); // sau cùng: dựa trên vị trí mới của tick này
  w.tick++;
}
