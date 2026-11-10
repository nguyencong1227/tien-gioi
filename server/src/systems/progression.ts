// Tu luyện: chỉ số theo cảnh giới, tu vi, đột phá, hồi phục / đả tọa.
import {
  MEDITATE,
  meditateExpPerSec,
  BREAK_FAIL_EXP_LOSS,
  REALMS,
  statsFor,
  expToNext,
  isLastTier,
  isPeak,
  breakthroughChance,
  type StatMult,
  expMultOf,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { takeWhole, type World, type PlayerCtrl } from "../world";
import { refreshQuests } from "./quests";

const BREAK_COOLDOWN_MS = 3000;

/** Tính lại chỉ số tối đa theo cảnh giới; `heal` thì hồi đầy. */
export function applyStats(p: Player, heal: boolean, mult?: StatMult) {
  const s = statsFor(p.realm, p.tier, p, mult); // gồm trang bị và hệ số xuất thân
  p.maxHp = s.maxHp;
  p.maxMp = s.maxMp;
  p.expMax = expToNext(p.realm, p.tier);
  if (heal) {
    p.hp = p.maxHp;
    p.mp = p.maxMp;
  }
  p.hp = Math.min(p.hp, p.maxHp);
  p.mp = Math.min(p.mp, p.maxMp);
}

/**
 * Cộng tu vi; đủ thì tự lên bậc nhỏ. Bậc cuối của cảnh giới thì dừng ở đầy, chờ Đột phá.
 * `scale`: hệ số tốc độ tu luyện của chân linh (Dư âm tu hành, `expMultOf`): chỉ truyền cho tu vi từ HẠ QUÁI và ĐẢ TỌA;
 * đan dược (phần trăm thanh) và thưởng nhiệm vụ (số cố định) không nhân.
 */
export function gainExp(w: World, sid: string, p: Player, amount: number, scale = 1) {
  amount *= scale;
  if (isPeak(p.realm, p.tier)) {
    p.exp = Math.min(p.expMax, p.exp + amount);
    return;
  }
  p.exp += amount;
  while (p.exp >= p.expMax) {
    if (isLastTier(p.realm, p.tier)) {
      p.exp = p.expMax;
      break;
    } // cần Đột phá
    p.exp -= p.expMax;
    p.tier += 1;
    applyStats(p, true, w.ctrl.get(sid)?.mult);
    w.events.fx({ kind: "levelup", by: sid, x: p.x, y: p.y, major: false });
    refreshQuests(w, sid); // bước "reachRealm"
  }
}

export function setMeditating(w: World, sid: string, on: boolean) {
  const r = w.ready(sid);
  if (!r) return;
  r.p.meditating = on;
  if (on) r.c.inputs.length = 0;
}

export function breakthrough(w: World, sid: string) {
  const r = w.ready(sid);
  if (!r) return;
  const { p, c } = r;
  if (w.now < c.nextBreak) return;
  if (isPeak(p.realm, p.tier))
    return w.events.toast(sid, { text: "Đã tới đỉnh tiên đồ.", tone: "info" });
  if (!isLastTier(p.realm, p.tier) || p.exp < p.expMax) {
    return w.events.toast(sid, {
      text: `Chưa đủ hỏa hầu. Cần đạt đỉnh ${REALMS[p.realm].name} với đầy tu vi.`,
      tone: "info",
    });
  }
  c.nextBreak = w.now + BREAK_COOLDOWN_MS;
  p.meditating = false;
  if (Math.random() < breakthroughChance(p.realm)) {
    p.realm += 1;
    p.tier = 0;
    p.exp = 0;
    applyStats(p, true, c.mult);
    w.events.fx({ kind: "levelup", by: sid, x: p.x, y: p.y, major: true });
    refreshQuests(w, sid);
    w.events.sys(`⚡ ${p.name} đột phá thành công, bước vào ${REALMS[p.realm].name}!`);
  } else {
    p.exp = Math.floor(p.exp * (1 - BREAK_FAIL_EXP_LOSS));
    p.hp = Math.max(1, Math.floor(p.hp * 0.5));
    w.events.fx({ kind: "breakfail", by: sid, x: p.x, y: p.y });
    w.events.toast(sid, {
      text: "Đột phá thất bại, chân khí nghịch loạn, tổn hao tu vi.",
      tone: "bad",
    });
  }
}

/** Hồi phục mỗi tick: đả tọa hồi nhanh + tăng tu vi; bình thường hồi chậm (nhanh hơn trong trấn). */
/** Tu vi đả tọa ghi vào state mỗi chừng này ms (thanh tu vi vẫn nhích đều từng giây) */
export const EXP_FLUSH_MS = 1000;

/**
 * Hồi khí huyết / linh lực, tu vi khi đả tọa. Mỗi tick chỉ là số lẻ nhỏ; ghi thẳng vào state thì
 * trường đó đổi 20 lần/giây, mỗi lần một số thực 8 byte gửi cho mọi client.
 * - Khí huyết / linh lực: state chỉ nhận số nguyên (takeWhole).
 * - Tu vi: để dành, ghi mỗi EXP_FLUSH_MS (số lẻ thì vẫn hiện tiến độ ở cảnh giới thấp).
 */
export function tickRecovery(w: World, sid: string, p: Player, c: PlayerCtrl, dt: number) {
  let hpRate = 0;
  let mpRate = 0.01;
  if (p.meditating) {
    hpRate = MEDITATE.hpRegenPct;
    mpRate = MEDITATE.mpRegenPct;
    c.frac.exp += meditateExpPerSec(p.realm, p.tier) * dt;
    if (w.now >= c.frac.expAt) {
      gainExp(w, sid, p, c.frac.exp, expMultOf(c.soul.unlocks));
      c.frac.exp = 0;
      c.frac.expAt = w.now + EXP_FLUSH_MS;
    }
  } else if (w.now - c.lastHitAt > 5000) {
    hpRate = w.map.inTown(p.x, p.y) ? 0.08 : 0.01;
  }
  regen(c, "hp", p.hp, p.maxHp, p.maxHp * hpRate * dt, (v) => (p.hp = v));
  regen(c, "mp", p.mp, p.maxMp, p.maxMp * mpRate * dt, (v) => (p.mp = v));
}

function regen(
  c: PlayerCtrl,
  key: "hp" | "mp",
  cur: number,
  max: number,
  amount: number,
  set: (v: number) => void,
) {
  if (cur >= max || amount <= 0) {
    c.frac[key] = 0; // đầy rồi thì không để dành phần lẻ
    return;
  }
  const add = takeWhole(c.frac, key, amount);
  if (add) set(Math.min(max, cur + add));
}
