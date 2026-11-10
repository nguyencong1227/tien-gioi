// Chiến đấu: kỹ năng của người chơi, sát thương lên quái / người chơi, trọng thương và hồi sinh.
import {
  SKILLS,
  RESPAWN_MS,
  DEATH_EXP_LOSS,
  MONSTER_BY_ID,
  statsFor,
  killExp,
  rollCoin,
} from "@tien-gioi/shared";
import type { Player, Monster } from "../schema";
import {
  rand,
  angleDiff,
  quantAngle,
  type World,
  type PlayerCtrl,
  type MonsterCtrl,
} from "../world";
import { applyStats, gainExp } from "./progression";
import { safeSpot, syncPublicPos } from "./movement";
import { dropLoot } from "./loot";
import { onMonsterKilled } from "./quests";
import { killShares } from "./party";
import { changeCoin, splitCoin } from "./wallet";

const CRIT_CHANCE = 0.1;
const CRIT_MULT = 1.8;

/** Kiếm chém: hình quạt trước mặt. */
export function slash(w: World, sid: string, angle: unknown) {
  const r = w.ready(sid);
  if (!r || typeof angle !== "number" || !Number.isFinite(angle) || w.now < r.c.nextSlash) return;
  const { p, c } = r;
  const s = SKILLS.slash;
  c.nextSlash = w.now + s.cooldown;
  p.meditating = false;
  p.angle = quantAngle(angle);
  w.events.fx({ kind: "slash", by: sid, x: p.x, y: p.y, angle });
  w.state.monsters.forEach((mon, id) => {
    const d = Math.hypot(mon.x - p.x, mon.y - p.y);
    const def = MONSTER_BY_ID[mon.kind];
    if (d > s.range + def.radius) return;
    if (d > def.radius && angleDiff(Math.atan2(mon.y - p.y, mon.x - p.x), angle) > s.arc / 2)
      return;
    hitMonster(w, id, mon, sid, p, s.mult);
  });
}

/** Kiếm khí: luồng thẳng, tốn linh lực. */
export function swordQi(w: World, sid: string, angle: unknown) {
  const r = w.ready(sid);
  if (!r || typeof angle !== "number" || !Number.isFinite(angle)) return;
  const { p, c } = r;
  const s = SKILLS.sword;
  if (w.now < c.nextSword) return;
  if (p.mp < s.mp) return w.events.toast(sid, { text: "Linh lực không đủ.", tone: "bad" });
  c.nextSword = w.now + s.cooldown;
  p.mp -= s.mp;
  p.meditating = false;
  p.angle = quantAngle(angle);
  w.events.fx({ kind: "sword", by: sid, x: p.x, y: p.y, angle, range: s.range });
  const ux = Math.cos(angle),
    uy = Math.sin(angle);
  w.state.monsters.forEach((mon, id) => {
    const def = MONSTER_BY_ID[mon.kind];
    const rx = mon.x - p.x,
      ry = mon.y - p.y;
    const along = rx * ux + ry * uy;
    const perp = Math.abs(rx * uy - ry * ux);
    if (along < -def.radius || along > s.range + def.radius || perp > s.width / 2 + def.radius)
      return;
    hitMonster(w, id, mon, sid, p, s.mult);
  });
}

export function hitMonster(
  w: World,
  id: string,
  mon: Monster,
  by: string,
  p: Player,
  mult: number,
) {
  const atk = statsFor(p.realm, p.tier, p).atk; // gồm vũ khí
  const crit = Math.random() < CRIT_CHANCE;
  const dmg = Math.max(1, Math.round(atk * mult * rand(0.9, 1.1) * (crit ? CRIT_MULT : 1)));
  mon.hp = Math.max(0, mon.hp - dmg);
  const mc = w.mctrl.get(id)!;
  mc.damageBy.set(by, (mc.damageBy.get(by) ?? 0) + dmg);
  mc.target = by;
  w.events.dmg({ target: id, amount: dmg, x: mon.x, y: mon.y - 18, crit });
  if (mon.hp <= 0) killMonster(w, id, mc);
}

/** Chia tu vi theo tỉ lệ sát thương cho những người còn sống, rơi đồ, rồi xóa quái. */
export function killMonster(w: World, id: string, mc: MonsterCtrl) {
  const mon = w.state.monsters.get(id);
  // Hệ số tu vi của từng người (đội chia đều có thưởng, người lẻ theo sát thương: xem killShares)
  const shares = killShares(w, mc.damageBy, mon?.x ?? 0, mon?.y ?? 0);
  for (const [sid, frac] of shares) {
    const p = w.state.players.get(sid);
    if (!p || p.dead) continue;
    // Quái càng mạnh, tu vi càng tăng theo cấp số nhân
    const share = Math.max(1, Math.round(killExp(mc.def, p.realm, p.tier) * frac));
    gainExp(w, sid, p, share);
    onMonsterKilled(w, sid, mc.def.id); // ai góp sát thương (hoặc cùng đội) cũng được tính cho nhiệm vụ
  }
  if (mon) dropCoin(w, mc, mon.x, mon.y);
  if (mc.def.boss) w.events.sys(`🐉 ${mc.def.name} đã bị hạ!`);
  if (mon) dropLoot(w, mc, mon.x, mon.y);
  w.state.monsters.delete(id);
  w.mctrl.delete(id);
}

/**
 * Linh thạch quái rơi (tung một lần cho cả con quái), cộng thẳng cho người hạ nó, không nằm trên đất.
 * Người nhận như chia tu vi (người lẻ theo sát thương; đội chia đều cho thành viên còn sống đứng trong
 * PARTY_SHARE_RANGE) nhưng KHÔNG có thưởng đội, và tổng chia ra đúng bằng số đã tung (xem `splitCoin`).
 */
function dropCoin(w: World, mc: MonsterCtrl, x: number, y: number) {
  const coin = rollCoin(mc.def.id);
  if (coin <= 0) return;
  const weights = new Map<string, number>();
  for (const [sid, wt] of killShares(w, mc.damageBy, x, y, false)) {
    const p = w.state.players.get(sid);
    if (p && !p.dead) weights.set(sid, wt);
  }
  for (const [sid, n] of splitCoin(coin, weights)) changeCoin(w, sid, n);
}

export function hurtPlayer(w: World, sid: string, p: Player, dmg: number, from: Monster) {
  const c = w.ctrl.get(sid);
  if (!c || p.dead) return;
  if (w.ghosts.has(sid)) return; // rớt mạng, đang chờ nối lại: bất tử
  p.hp = Math.max(0, p.hp - dmg);
  p.meditating = false;
  c.lastHitAt = w.now;
  w.events.dmg({ target: sid, amount: dmg, x: p.x, y: p.y - 20, toPlayer: true });
  if (p.hp <= 0) {
    p.dead = true;
    c.deadAt = w.now;
    c.inputs.length = 0;
    p.exp = Math.floor(p.exp * (1 - DEATH_EXP_LOSS));
    w.events.toast(sid, {
      text: `Bị ${MONSTER_BY_ID[from.kind].name} đánh trọng thương, tổn hao tu vi.`,
      tone: "bad",
    });
    for (const m of w.mctrl.values()) if (m.target === sid) m.target = null;
  }
}

/** Trọng thương đủ lâu thì hồi sinh ở Lạc Hà Trấn với đầy khí huyết. */
export function tickRespawn(w: World, p: Player, c: PlayerCtrl) {
  if (w.now - c.deadAt < RESPAWN_MS) return;
  const s = safeSpot(w.map);
  p.x = s.x;
  p.y = s.y;
  syncPublicPos(p); // dịch chuyển tức thời: người khác thấy ngay
  p.dead = false;
  p.meditating = false;
  applyStats(p, true);
}
