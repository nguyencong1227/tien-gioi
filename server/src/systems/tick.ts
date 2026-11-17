// Một tick của thế giới (TICK_MS). WorldRoom gọi mỗi tick; benchmark (server/src/perf) gọi y hệt.
import type { World } from "../world";
import { INPUT_BACKLOG_WARN, POS_SYNC_EVERY_TICKS, applyInputs, syncPublicPos } from "./movement";
import { tickRespawn } from "./combat";
import { tickMonsters } from "./monsters";
import { tickRecovery } from "./progression";
import { tickLoot } from "./loot";
import { tickParty } from "./party";
import { tickDungeonRun, tickDungeons } from "./dungeon";
import { tickDuels } from "./duel";
import { tickSect } from "./sect";
import { tickStatuses } from "./status";
import { tickBolts } from "./bolt";
import { tickPBolts } from "./pbolt";
import { tickObjects } from "./objects";
import { tickWindup } from "./windup";
import { tickTreasure } from "./treasure";
import { tickNetGuard } from "./net-guard";
import { tickAmbush, trackAmbushWalk } from "./ambush";
import { tickArena } from "./arena";

export function tickWorld(w: World, dtMs: number) {
  const dt = dtMs / 1000;
  w.state.players.forEach((p, sid) => {
    const c = w.ctrl.get(sid);
    if (!c) return;
    if (c.windup !== undefined) tickWindup(w, sid, p, c); // chiêu vận (CT5): huỷ / đáp TRƯỚC các return sớm (chết, Hoàng Tuyền, hồn lìa xác vẫn phải huỷ vận)
    if (c.beatMs !== undefined || c.shieldUntil !== undefined) tickNetGuard(w, sid, c); // mục 33: im lặng -> hồn lìa xác, hết hạn hộ thể (client cũ không tốn gì)
    if (c.limbo) return; // ở Hoàng Tuyền: không hồi sinh theo đồng hồ, chỉ đầu thai khi người chơi chọn
    if (p.dead) return tickRespawn(w, p, c);
    if (w.ghosts.size > 0 && w.ghosts.has(sid)) return; // hồn lìa xác: đứng yên, không hồi phục, không tu luyện
    c.life.playMs += dtMs; // thời gian chơi thật của kiếp (không tính chết, hồn lìa xác)
    w.inputStats.dropped += applyInputs(w.map, p, c, dtMs); // ngân sách bước theo thời gian thật (`dtMs` đồng hồ phòng), không +1 mỗi tick; input cũ vượt backlog bị bỏ (mục 41)
    if (w.ambush !== null) trackAmbushWalk(w, sid, p, c); // chặn đường (mục 52): cộng quãng đi THẬT sau khi áp input; tính năng tắt thì không tốn gì
    if (c.inputs.length >= INPUT_BACKLOG_WARN) w.inputStats.backlogTicks++;
    if ((w.tick + c.posPhase) % POS_SYNC_EVERY_TICKS === 0) syncPublicPos(p);
    if (!w.duels.has(sid)) tickRecovery(w, sid, p, c, dt); // trong trận thách đấu: không hồi khí huyết / linh lực, không đả tọa
    // Pháp bảo (M7.4): khiên tự dựng, hồi khi đứng yên; không mặc thì không tốn gì. Trong trận thách đấu: KHÔNG chạy (cùng nguyên tắc khoá hồi phục của `tickRecovery`;
    // review B ở #594: Định Tâm Chung từng hồi máu giữa trận). Sau trận khiên dựng lại ngay (`nextShieldAt` đã qua).
    if ((p.treasure || c.treasure) && !w.duels.has(sid)) tickTreasure(w, sid, p, c, dt);
  });
  tickStatuses(w, dt); // trước quái: quái chết vì sát thương theo giây thì không còn bị cập nhật
  tickMonsters(w, dt);
  tickBolts(w, dt); // đạn của quái tầm xa (M7.3): sau quái (quái vừa bắn thì đạn bay ngay tick sau)
  tickObjects(w); // vật thể bền của người chơi (CT4): vùng / bẫy / hào quang / tượng, tới nhịp thì tác dụng quái; không có thì thoát ngay
  tickPBolts(w); // đạn của người chơi (CT3): sau quái (quái đã đi / chết trong tick này thì đạn tới nơi tính theo đó)
  tickLoot(w);
  tickParty(w);
  tickDungeons(w);
  tickDungeonRun(w);
  tickDuels(w);
  tickSect(w);
  tickArena(w, dtMs); // đấu trường chặn đường (mục 52): chỉ phòng đấu trường, phòng thường thoát ngay
  tickAmbush(w, dtMs); // hộp thoại chặn đường: hết giờ / huỷ / đóng băng khi hồn lìa xác (không có hộp thoại nào thì thoát ngay)
  w.interest.update(w); // sau cùng: dựa trên vị trí mới của tick này
  w.tick++;
}
