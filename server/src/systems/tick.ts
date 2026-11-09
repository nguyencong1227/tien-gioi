// Một tick của thế giới (TICK_MS). WorldRoom gọi mỗi tick; benchmark (server/src/perf) gọi y hệt.
import type { World } from "../world";
import { POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickRespawn } from "./combat";
import { tickMonsters } from "./monsters";
import { tickRecovery } from "./progression";
import { tickLoot } from "./loot";
import { tickParty } from "./party";

export function tickWorld(w: World, dtMs: number) {
  const dt = dtMs / 1000;
  w.state.players.forEach((p, sid) => {
    const c = w.ctrl.get(sid);
    if (!c) return;
    if (p.dead) return tickRespawn(w, p, c);
    applyInputs(p, c);
    if ((w.tick + c.posPhase) % POS_SYNC_EVERY_TICKS === 0) syncPublicPos(p);
    tickRecovery(w, sid, p, c, dt);
  });
  tickMonsters(w, dt);
  tickLoot(w);
  tickParty(w);
  w.interest.update(w); // sau cùng: dựa trên vị trí mới của tick này
  w.tick++;
}
