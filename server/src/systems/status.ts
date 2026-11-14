// Trạng thái của người chơi và quái (M7.2b, docs/PHAN_CONG_M7.md mục 5.4): nối luật thuần `status-rules.ts` với thế giới. Gắn trạng thái lên
// quái / người chơi (xác suất, trùm miễn choáng), tick sát thương theo giây + hồi phục + hết hạn, gửi danh sách trạng thái cho chủ.
// Tác dụng lên chiến đấu nằm ở chỗ dùng: `combat.ts` (vỡ giáp nhân sát thương nhận, khiên hấp thụ), `monsters.ts` (choáng / tê cóng).
// Chưa nối vào di chuyển của NGƯỜI CHƠI (tăng tốc / tê cóng): client phải đoán trước cùng hệ số, quyết ở bước `cast` (`speedMult`).
import { statusOf, type SkillEffect } from "@tien-gioi/shared";
import { takeWhole, type World } from "../world";
import { dealMonsterDamage } from "./combat";
import {
  addStatus,
  entriesOf,
  newStatusBox,
  pruneStatuses,
  type AddResult,
  type StatusBox,
} from "./status-rules";

/** Sát thương theo giây dồn lại rồi tính mỗi chừng này ms (ít tin `dmg` hơn mỗi tick; lúc hết hạn tính nốt phần lẻ). */
export const DOT_TICK_MS = 1000;

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
  if (res === "added" || res === "refreshed") w.statusM.add(id);
  return res;
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
    sendStatus(w, sid);
  }
  return res;
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
      if (statusOf(s.id)?.kind !== "dot" || s.dps <= 0) continue;
      const end = Math.min(now, s.until);
      if (now < s.last + DOT_TICK_MS && now < s.until) continue;
      const dmg = Math.round((s.dps * (end - s.last)) / 1000);
      if (dmg < 1) {
        if (now >= s.until) s.last = end; // hết hạn mà phần lẻ chưa đủ 1: bỏ
        continue;
      }
      s.last = end;
      dealMonsterDamage(w, id, mon, s.src, dmg, false, false);
      if (!w.mctrl.has(id)) break; // chết vì sát thương theo giây: quái đã bị xoá
    }
    if (!w.mctrl.has(id)) {
      w.statusM.delete(id);
      continue;
    }
    pruneStatuses(box, now);
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
    for (const s of box.list) {
      if (s.id !== "regen" || s.until <= now || p.hp >= p.maxHp) continue;
      const add = takeWhole(c.frac, "hp", s.ratio * p.maxHp * dt);
      if (add) p.hp = Math.min(p.maxHp, p.hp + add);
    }
    if (pruneStatuses(box, now)) sendStatus(w, sid);
    if (box.list.length === 0) w.statusP.delete(sid);
  }
}
