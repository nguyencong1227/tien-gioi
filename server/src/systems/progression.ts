// Tu luyện: chỉ số theo cảnh giới, tu vi, đột phá, hồi phục / đả tọa.
import {
  MEDITATE,
  SECT_BUFF_EXP_MAX,
  SECT_BUFF_REGEN_MAX,
  meditateExpPerSec,
  BREAK_FAIL_EXP_LOSS,
  REALMS,
  statsFor,
  expToNext,
  canAttemptBreakthrough,
  isLastTier,
  isPeak,
  stepOf,
  breakthroughChanceWith,
  type StatMult,
  expMultOf,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { takeWhole, type World, type PlayerCtrl } from "../world";
import { refreshQuests } from "./quests";
import { consumeBreakAid } from "./status";
import { trackSocial } from "./social";

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
 * `PlayerCtrl.testExpMult` (hệ số THỬ NGHIỆM của `TEST_EXP_MULT`, chỉ khi đạo hiệu nằm trong cấu hình, QUYET_DINH_M3 mục 34) nhân SAU CÙNG, lên MỌI
 * nguồn đi qua đây (hạ quái, đả tọa, đan, nhiệm vụ, bí cảnh): hệ số ngoài 1-10 (không bao giờ đặt ra, nhưng đây là chỗ tiền tệ tu vi) bị coi là 1.
 * Trả về số tu vi THẬT đã cộng (sau mọi hệ số, đã trừ phần bị cắt khi chạm đỉnh / bậc cuối chờ Đột phá): bảng thưởng nhiệm vụ (mục 66) cần đúng số này,
 * không tự nhân lại hệ số ở chỗ khác (hai nơi nhân dễ lệch). Bước lên bậc nhỏ không làm số này đổi.
 */
export function gainExp(w: World, sid: string, p: Player, amount: number, scale = 1): number {
  amount *= scale;
  // Buff tông môn (M8.3b, mục 12.5): nhân SAU `scale`, TRƯỚC hệ số thử nghiệm; hệ số ngoài khoảng (1, `SECT_BUFF_EXP_MAX`] bị coi là 1 (hàng rào thứ hai sau `sectBuffOf`)
  const sb = w.ctrl.get(sid)?.sectBuff?.exp;
  if (sb !== undefined && sb > 1 && sb <= SECT_BUFF_EXP_MAX) amount *= sb;
  const test = w.ctrl.get(sid)?.testExpMult;
  if (test !== undefined && test > 1 && test <= 10) amount *= test;
  if (isPeak(p.realm, p.tier)) {
    const before = p.exp;
    p.exp = Math.min(p.expMax, p.exp + amount);
    return Math.max(0, p.exp - before);
  }
  p.exp += amount;
  let lost = 0; // phần vượt đầy ở bậc cuối (chờ Đột phá) bị cắt, không tính là đã cộng
  while (p.exp >= p.expMax) {
    if (isLastTier(p.realm, p.tier)) {
      lost = p.exp - p.expMax;
      p.exp = p.expMax;
      break;
    } // cần Đột phá
    p.exp -= p.expMax;
    p.tier += 1;
    trackSocial(w, sid, ["realm_step", stepOf(p.realm, p.tier)]); // thành tựu (M9.5): bậc cao nhất từng đạt
    applyStats(p, true, w.ctrl.get(sid)?.mult);
    w.events.fx({ kind: "levelup", by: sid, x: p.x, y: p.y, major: false });
    refreshQuests(w, sid); // bước "reachRealm"
  }
  return Math.max(0, amount - lost);
}

export function setMeditating(w: World, sid: string, on: boolean) {
  const r = w.ready(sid);
  if (!r) return;
  if (on && w.duels.has(sid)) return; // trong trận thách đấu không đả tọa
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
  if (!canAttemptBreakthrough(p.realm, p.tier, p.exp, p.expMax)) {
    return w.events.toast(sid, {
      text: `Chưa đủ hỏa hầu. Cần đạt đỉnh ${REALMS[p.realm].name} với đầy tu vi.`,
      tone: "info",
    });
  }
  c.nextBreak = w.now + BREAK_COOLDOWN_MS;
  p.meditating = false;
  // Đan hộ đạo (#514): đọc cộng thêm rồi GỠ (tiêu hao dù thành công hay thất bại); chỉ tới đây khi đã đủ điều kiện thử, nên không mất oan
  const aid = consumeBreakAid(w, sid);
  if (Math.random() < breakthroughChanceWith(p.realm, aid)) {
    p.realm += 1;
    p.tier = 0;
    p.exp = 0;
    trackSocial(w, sid, ["realm_step", stepOf(p.realm, p.tier)]);
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
  // Buff tông môn (M8.3b): hồi nhanh hơn NGOÀI đả tọa (đả tọa vốn đã hồi nhanh); chỉ khi cấp >= 2
  const rg = c.sectBuff?.regen;
  if (!p.meditating && rg !== undefined && rg > 1 && rg <= SECT_BUFF_REGEN_MAX) {
    hpRate *= rg;
    mpRate *= rg;
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
