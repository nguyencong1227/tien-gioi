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
  inTown,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World, PlayerCtrl } from "../world";
import { refreshQuests } from "./quests";

const BREAK_COOLDOWN_MS = 3000;

/** Tính lại chỉ số tối đa theo cảnh giới; `heal` thì hồi đầy. */
export function applyStats(p: Player, heal: boolean) {
  const s = statsFor(p.realm, p.tier);
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

/** Cộng tu vi; đủ thì tự lên bậc nhỏ. Bậc cuối của cảnh giới thì dừng ở đầy, chờ Đột phá. */
export function gainExp(w: World, sid: string, p: Player, amount: number) {
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
    applyStats(p, true);
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
    applyStats(p, true);
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
export function tickRecovery(w: World, sid: string, p: Player, c: PlayerCtrl, dt: number) {
  if (p.meditating) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * MEDITATE.hpRegenPct * dt);
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * MEDITATE.mpRegenPct * dt);
    gainExp(w, sid, p, meditateExpPerSec(p.realm, p.tier) * dt);
  } else {
    p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.01 * dt);
    if (w.now - c.lastHitAt > 5000)
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (inTown(p.x, p.y) ? 0.08 : 0.01) * dt);
  }
}
