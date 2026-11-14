// Trạng thái của người chơi và quái (M7.2b, docs/PHAN_CONG_M7.md mục 5.4): nối luật thuần `status-rules.ts` với thế giới. Gắn trạng thái lên
// quái / người chơi (xác suất, trùm miễn choáng), tick sát thương theo giây + hồi phục + hết hạn, gửi danh sách trạng thái cho chủ.
// Tác dụng lên chiến đấu nằm ở chỗ dùng: `combat.ts` (vỡ giáp nhân sát thương nhận, khiên hấp thụ), `monsters.ts` (choáng / tê cóng).
// Chưa nối vào di chuyển của NGƯỜI CHƠI (tăng tốc / tê cóng): client phải đoán trước cùng hệ số, quyết ở bước `cast` (`speedMult`).
import { moveSpeedMul, statusOf, type SkillEffect } from "@tien-gioi/shared";
import { takeWhole, type PlayerCtrl, type World } from "../world";
import { dealMonsterDamage, hurtPlayerDot } from "./combat";
import {
  addStatus,
  entriesOf,
  isStunned,
  maskOf,
  newStatusBox,
  takeDotDamage,
  pruneStatuses,
  type AddResult,
  type StatusBox,
} from "./status-rules";

/** Nhịp tính sát thương theo giây (định nghĩa ở `status-rules.ts` cùng `takeDotDamage`); giữ xuất ở đây cho các nơi / test đang import. */
export { DOT_TICK_MS } from "./status-rules";

/** Kết quả gắn trạng thái; `miss` = không trúng xác suất `chance`. */
export type ApplyResult = AddResult | "miss";

/** Tung xác suất gắn: `chance` >= 1 luôn trúng (không gọi `rng`, giữ nguyên chuỗi `Math.random` của bench), <= 0 / rác không bao giờ. */
function rolls(chance: number, rng: () => number): boolean {
  if (typeof chance !== "number" || !Number.isFinite(chance) || chance <= 0) return false;
  return chance >= 1 || rng() < chance;
}

/**
 * Gắn `effect` lên quái `id`. `baseDmg` là sát thương gốc của đòn gây ra (cho sát thương theo giây), `src` là sessionId người gây. Trùm miễn choáng.
 * Quái không còn trong phòng: `ignored`.
 */
export function applyMonsterStatus(
  w: World,
  id: string,
  effect: SkillEffect,
  baseDmg: number,
  src: string,
  rng: () => number = Math.random,
): ApplyResult {
  const mc = w.mctrl.get(id);
  if (!mc) return "ignored";
  if (!rolls(effect.chance, rng)) return "miss";
  const box = (mc.st ??= newStatusBox());
  const res = addStatus(box, effect, w.now, { baseDmg, src, stunImmune: !!mc.def.boss });
  if (res === "added" || res === "refreshed") {
    w.statusM.add(id);
    syncMonsterFx(w, id, box); // huy hiệu trạng thái trên đầu quái (`Monster.fx`)
  }
  return res;
}

/** Ghi mặt nạ bit trạng thái có hại vào `Monster.fx` (chỉ khi đổi: schema bỏ qua giá trị y hệt nhưng đỡ tính lại). */
function syncMonsterFx(w: World, id: string, box: StatusBox) {
  const mon = w.state.monsters.get(id);
  if (!mon) return;
  const mask = maskOf(box, w.now);
  if (mon.fx !== mask) mon.fx = mask;
}

/**
 * Gắn `effect` lên người chơi `sid` (buff cho mình hoặc trạng thái có hại do quái / người khác gây) rồi gửi danh sách cho chủ.
 * Người đã gục / ở Hoàng Tuyền / không còn trong phòng: `ignored`.
 */
export function applyPlayerStatus(
  w: World,
  sid: string,
  effect: SkillEffect,
  baseDmg: number,
  src: string,
  rng: () => number = Math.random,
): ApplyResult {
  const r = w.ready(sid);
  if (!r || r.c.limbo) return "ignored";
  const { p, c } = r;
  if (!rolls(effect.chance, rng)) return "miss";
  const box = (c.st ??= newStatusBox());
  const res = addStatus(box, effect, w.now, { baseDmg, maxHp: p.maxHp, src });
  if (res === "added" || res === "refreshed") {
    w.statusP.add(sid);
    refreshMoveCache(c, w.now);
    sendStatus(w, sid); // cả khi làm mới: thời gian và cường độ (chiêu mạnh hơn ghi đè chiêu yếu) có thể đổi
  }
  return res;
}

/**
 * Tính lại bản nhớ cho `applyInputs` (`c.moveMul`, `c.stunned`) từ trạng thái hiện có: hệ số bằng ĐÚNG `moveSpeedMul(entriesOf(...))` (hàm dùng chung
 * với client). Gọi mỗi khi trạng thái của người chơi đổi (gắn, hết hạn, xoá), không mỗi tick; hai trường để undefined khi không có gì.
 */
export function refreshMoveCache(c: PlayerCtrl, now: number) {
  const box = c.st;
  if (!box || box.list.length === 0) {
    c.moveMul = undefined;
    c.stunned = undefined;
    return;
  }
  const m = moveSpeedMul(entriesOf(box, now));
  c.moveMul = m === 1 ? undefined : m;
  c.stunned = isStunned(box, now) ? true : undefined;
}

/** Gửi cho chủ danh sách trạng thái còn hiệu lực của chính mình (rỗng cũng gửi: client xoá huy hiệu). */
export function sendStatus(w: World, sid: string) {
  const box = w.ctrl.get(sid)?.st;
  w.events.status(sid, { list: box ? entriesOf(box, w.now) : [] });
}

/** Xoá mọi trạng thái của một người chơi (chết, qua kiếp), gửi danh sách rỗng nếu có gì để xoá. */
export function clearPlayerStatus(w: World, sid: string) {
  const c = w.ctrl.get(sid);
  w.statusP.delete(sid);
  if (!c?.st || c.st.list.length === 0) return;
  c.st.list.length = 0;
  refreshMoveCache(c, w.now);
  sendStatus(w, sid);
}

/** Một tick: sát thương theo giây lên quái, hồi phục cho người chơi, gỡ trạng thái hết hạn. Hai tập rỗng thì không làm gì. */
export function tickStatuses(w: World, dt: number) {
  if (w.statusM.size > 0) tickMonsterStatuses(w);
  if (w.statusP.size > 0) tickPlayerStatuses(w, dt);
}

function tickMonsterStatuses(w: World) {
  const now = w.now;
  for (const id of w.statusM) {
    const mc = w.mctrl.get(id);
    const mon = w.state.monsters.get(id);
    const box = mc?.st;
    if (!mc || !mon || !box) {
      w.statusM.delete(id);
      continue;
    }
    for (const s of box.list) {
      if (statusOf(s.id)?.kind !== "dot") continue;
      const dmg = takeDotDamage(s, now);
      if (dmg < 1) continue;
      dealMonsterDamage(w, id, mon, s.src, dmg, false, false);
      if (!w.mctrl.has(id)) break; // chết vì sát thương theo giây: quái đã bị xoá
    }
    if (!w.mctrl.has(id)) {
      w.statusM.delete(id);
      continue;
    }
    pruneStatuses(box, now);
    syncMonsterFx(w, id, box); // trạng thái vừa hết hạn thì bỏ huy hiệu (kể cả lần dọn cuối, trước khi rời `statusM`)
    if (box.list.length === 0) w.statusM.delete(id);
  }
}

function tickPlayerStatuses(w: World, dt: number) {
  const now = w.now;
  for (const sid of w.statusP) {
    const p = w.state.players.get(sid);
    const c = w.ctrl.get(sid);
    const box: StatusBox | undefined = c?.st;
    if (!p || !c || !box) {
      w.statusP.delete(sid);
      continue;
    }
    if (p.dead || c.limbo) {
      clearPlayerStatus(w, sid);
      continue;
    }
    const ghost = w.ghosts.size > 0 && w.ghosts.has(sid); // hồn lìa xác: không hồi phục
    for (const s of box.list) {
      if (ghost || s.id !== "regen" || s.until <= now || p.hp >= p.maxHp) continue;
      const add = takeWhole(c.frac, "hp", s.ratio * p.maxHp * dt);
      if (add) p.hp = Math.min(p.maxHp, p.hp + add);
    }
    // Sát thương THEO GIÂY lên người (độc / bỏng / chảy máu do quái hoặc chiêu gây ra): cộng dồn rồi tính mỗi DOT_TICK_MS như ở quái (ít tin `dmg`, lúc hết hạn
    // tính nốt phần lẻ). Hồn lìa xác / thách đấu bất tử (`hurtPlayerDot`); người gục vì nó thì dừng (`clearPlayerStatus` dọn ở tick sau).
    for (const s of box.list) {
      const def = statusOf(s.id);
      if (def?.kind !== "dot") continue;
      const dmg = takeDotDamage(s, now);
      if (dmg < 1) continue;
      hurtPlayerDot(w, sid, p, dmg, def.name);
      if (p.dead || c.limbo || w.ctrl.get(sid) !== c) break; // gục / luân hồi / rời phòng: dừng, không đụng hộp trạng thái đã đặt lại
    }
    if (p.dead || c.limbo) continue; // tick sau `clearPlayerStatus` dọn
    if (pruneStatuses(box, now)) {
      refreshMoveCache(c, now);
      sendStatus(w, sid);
    }
    if (box.list.length === 0) w.statusP.delete(sid);
  }
}
