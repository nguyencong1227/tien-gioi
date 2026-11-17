// Bộ thực thi trùm nhiều chiêu (QUYET_DINH_M3 mục 42, docs/THIET_KE_TRUM.md mục 2 và 4, issue T2 #871). Dữ liệu chiêu ở `shared/src/bosses.ts` (`BOSSES`), một bộ thực thi CHUNG cho mọi trùm.
// Luật chốt (server quyết định, người chơi né được vì chết = mất kiếp):
//  - Mọi đòn GÂY SÁT THƯƠNG báo trước bằng `fx` `warn` (vùng khoá lúc bắt đầu, `sendNear`) >= `BOSS_MIN_TELEGRAPH_MS` rồi mới đáp; cuồng nộ KHÔNG rút ngắn báo trước.
//  - Đáp đòn tính theo VỊ TRÍ người chơi LÚC ĐÁP: trúng chỉ khi tâm cách vùng <= `PLAYER_RADIUS - BOSS_HIT_GRACE_PX` (nghiêng về người chơi vì hình vẽ trễ).
//  - Một chiêu một lúc (trừ mưa, nơi từng vòng tự báo trước): giữa hai lần vận có `castGapMs` >= 600 ms nên hai đòn cách nhau >= 1,4 giây kể cả báo trước.
//  - Bộ lọc mục tiêu dùng chung với `monsters.ts` / `hurtPlayer`: người chết, hồn lìa xác, hộ thể, thách đấu, khu an toàn KHÔNG bị nhắm và KHÔNG bị trúng.
//  - Chọn chiêu theo trọng số bằng bộ ngẫu nhiên CÓ SEED riêng của con trùm (`bossRand`): KHÔNG `Math.random` (giữ chuỗi của bench có seed, test lặp lại được).
//  - Giai đoạn là hàm thuần của khí huyết (`bossPhaseOf`), chỉ tăng; chuyển giai đoạn ngắt chiêu đang gồng (không đáp), gầm `BOSS_PHASE_ROAR_MS` KHÔNG sát thương rồi chạy `onEnter`.
//  - Reset (mất hết mục tiêu): về nhà, hồi đầy khí huyết, giai đoạn 0, xoá hồi chiêu / cuồng nộ / vũng / quái con (không để trùm hồi dở dang giữ giai đoạn cao).
// Mô-đun chỉ biết `World`; `monsters.ts` gọi `bossStep` mỗi tick cho trùm có mục tiêu và `bossReset` khi mất mục tiêu.
import {
  BOSS_COND_RADIUS,
  BOSS_FIRST_CAST_DELAY_MS,
  BOSS_HIT_GRACE_PX,
  BOSS_MIN_CAST_GAP_MS,
  BOSS_PHASE_ROAR_MS,
  bossPhaseOf,
  MONSTER_BY_ID,
  PLAYER_RADIUS,
  type BossAbility,
  type BossAction,
} from "@tien-gioi/shared";
import type { Monster, Player } from "../schema";
import { quantAngle, type MonsterCtrl, type World } from "../world";
import {
  bossDespawnAdds,
  bossLiveAdds,
  bossRand,
  type BossCast,
  type BossCtrl,
  type BossZone,
} from "./boss-state";
import { segDist } from "./charge";
import { hurtPlayer } from "./combat";
import { byId } from "./lookup";
import { placeMonster } from "./monster-place";
import { isShielded } from "./net-guard";
import { syncPublicPos } from "./movement";
import { applyPlayerStatus } from "./status";
import { weakened } from "./status-rules";

/** Tầm (px) quanh trùm để tìm người XA nhất cho đòn `circleAt` kiểu `farthest`. */
export const BOSS_FAR_RANGE = 640;
/** Chưa có chiêu hợp lệ thì quét lại sau chừng này (ms): không quét mỗi tick. */
const RESCAN_MS = 400;
/** Số vũng đồng thời tối đa của một trùm (vũng cũ nhất bị bỏ khi vượt). */
const MAX_POOLS = 4;
/** Bước kiểm va chạm khi trùm lao (px). */
const DASH_STEP = 16;

// ---------- Mục tiêu và vùng ----------

/**
 * Người này có thể bị trùm NHẮM / TRÚNG đòn không? Cùng bộ lọc với `monsters.ts` (chết, hồn lìa xác, hộ thể, thách đấu, khu an toàn): `hurtPlayer` còn kiểm lại (một nơi giữ luật).
 * Dùng cho cả chọn mục tiêu, đếm người quanh trùm, và gom người trong vùng đáp đòn.
 */
export function bossCanTarget(w: World, sid: string, p: Player): boolean {
  if (p.dead) return false;
  if (w.ghosts.size > 0 && w.ghosts.has(sid)) return false;
  if (isShielded(w, sid)) return false;
  if (w.duels.active && w.duels.has(sid)) return false;
  return !w.map.inSafe(p.x, p.y, 20);
}

/** Tâm người chơi (px, py) có nằm trong vùng không? Có nới `BOSS_HIT_GRACE_PX` về phía người chơi (xem đầu tệp). */
export function bossInZone(z: BossZone, px: number, py: number): boolean {
  const reach = PLAYER_RADIUS - BOSS_HIT_GRACE_PX;
  switch (z.t) {
    case "circle": {
      const d = Math.hypot(px - z.x, py - z.y);
      return d <= z.r + reach && (z.r0 <= 0 || d >= z.r0 - reach);
    }
    case "cone": {
      const dx = px - z.x;
      const dy = py - z.y;
      const d = Math.hypot(dx, dy);
      if (d > z.r + reach) return false;
      if (d <= reach) return true; // đứng sát chân trùm: trong nón
      const a = Math.atan2(dy, dx) - z.angle;
      const diff = Math.atan2(Math.sin(a), Math.cos(a)); // chuẩn hoá về (-pi, pi]
      return Math.abs(diff) <= z.arc / 2 + Math.asin(Math.min(1, reach / d));
    }
    case "seg":
      return segDist(px, py, z.x0, z.y0, z.x1, z.y1) <= z.w / 2 + reach;
  }
}

/** Mọi người có thể bị nhắm đang nằm trong vùng. Gom TRƯỚC rồi mới gây sát thương (`hurtPlayer` có thể làm người chết / đổi `w.state.players`). */
function hitList(w: World, z: BossZone): string[] {
  const out: string[] = [];
  w.state.players.forEach((p, sid) => {
    if (bossCanTarget(w, sid, p) && bossInZone(z, p.x, p.y)) out.push(sid);
  });
  return out;
}

/** Sát thương một đòn của chiêu `ab`: `round(atk x hệ số hiện hành x dmgMult)`, ít nhất 1. Cố định, không ngẫu nhiên. */
function damageOf(w: World, mc: MonsterCtrl, bs: BossCtrl, ab: BossAbility): number {
  return weakened(mc, w.now, Math.max(1, Math.round(mc.def.atk * bs.atk * ab.dmgMult))); // `weaken` (mục 51): trùm chỉ chịu nửa
}

/** Đáp đòn lên MỌI người trong vùng `z`: `hurtPlayer` (một nơi giữ luật bất tử / né), trúng thật thì mới gắn trạng thái của chiêu. */
function strike(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  bs: BossCtrl,
  ab: BossAbility,
  z: BossZone,
) {
  const dmg = damageOf(w, mc, bs, ab);
  w.events.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle: m.angle });
  for (const sid of hitList(w, z)) {
    const p = w.state.players.get(sid);
    if (p && hurtPlayer(w, sid, p, dmg, m) && ab.effect)
      applyPlayerStatus(w, sid, ab.effect, dmg, "", () => bossRand(bs));
  }
}

// ---------- Báo trước ----------

function warnCircle(w: World, x: number, y: number, r: number, ms: number, r0?: number) {
  if (r0 !== undefined && r0 > 0) w.events.fx({ kind: "warn", shape: "circle", x, y, r, r0, ms });
  else w.events.fx({ kind: "warn", shape: "circle", x, y, r, ms });
}

/** Gửi MỘT lần `warn` của chiêu lúc bắt đầu (mưa tự báo từng vòng ở `runCast`, chiêu không sát thương không báo vùng). */
function emitWarn(w: World, cast: BossCast) {
  const s = cast.ab.shape;
  const ms = cast.ab.telegraphMs;
  switch (s.t) {
    case "circleAt":
    case "pool":
      warnCircle(w, cast.x, cast.y, s.r, ms);
      break;
    case "ring":
      warnCircle(w, cast.x, cast.y, s.r, ms, s.r0);
      break;
    case "cone":
      w.events.fx({
        kind: "warn",
        shape: "cone",
        x: cast.x,
        y: cast.y,
        r: s.r,
        angle: cast.angle,
        arc: s.arc,
        ms,
      });
      break;
    case "line":
    case "charge":
      w.events.fx({
        kind: "warn",
        shape: "line",
        x: cast.x,
        y: cast.y,
        r: s.len,
        w: s.w,
        angle: cast.angle,
        ms,
      });
      break;
    case "pull":
      warnCircle(w, cast.x, cast.y, s.r, ms);
      warnCircle(w, cast.x, cast.y, s.blastR, ms);
      break;
    case "blink":
      warnCircle(w, cast.x, cast.y, s.landR, ms);
      break;
    case "rain":
    case "summon":
    case "buff":
      break;
  }
}

// ---------- Lập kế hoạch một chiêu ----------

/** Người có thể nhắm XA trùm nhất (trong `BOSS_FAR_RANGE`); không có ai khác thì chính mục tiêu hiện tại. */
function farthestPoint(w: World, m: Monster, fallback: { x: number; y: number }) {
  let best = fallback;
  let bd = -1;
  w.state.players.forEach((p, sid) => {
    if (!bossCanTarget(w, sid, p)) return;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d <= BOSS_FAR_RANGE && d > bd) {
      bd = d;
      best = p;
    }
  });
  return { x: best.x, y: best.y };
}

/** Điểm đáp của `blink`: ưu tiên chỗ mục tiêu đứng, lùi dần về phía trùm tới khi có chỗ trống ngoài khu an toàn; không có thì `null` (không vận chiêu này). */
function findLanding(w: World, mc: MonsterCtrl, m: Monster, tx: number, ty: number) {
  const r = mc.def.radius * 0.8;
  for (let k = 0; k <= 8; k++) {
    const x = tx + ((m.x - tx) * k) / 8;
    const y = ty + ((m.y - ty) * k) / 8;
    if (!w.map.circleBlocked(x, y, r) && !w.map.inSafe(x, y, mc.def.radius + 8)) return { x, y };
  }
  return null;
}

/** Lập một lần vận chiêu `ab` ở thời điểm `now`, khoá điểm / hướng theo `target`. `null` nếu chiêu không thực hiện được lúc này. */
function planCast(
  w: World,
  mc: MonsterCtrl,
  m: Monster,
  bs: BossCtrl,
  ab: BossAbility,
  target: { x: number; y: number },
): BossCast | null {
  const now = w.now;
  const s = ab.shape;
  const angle = Math.atan2(target.y - m.y, target.x - m.x);
  const cast: BossCast = {
    ab,
    startAt: now,
    hitAt: now + ab.telegraphMs,
    endAt: 0,
    x: m.x,
    y: m.y,
    angle,
    done: false,
  };
  switch (s.t) {
    case "circleAt": {
      const at = s.at === "target" ? target : s.at === "farthest" ? farthestPoint(w, m, target) : m;
      cast.x = at.x;
      cast.y = at.y;
      break;
    }
    case "pool":
      cast.x = target.x;
      cast.y = target.y;
      break;
    case "blink": {
      const land = findLanding(w, mc, m, target.x, target.y);
      if (!land) return null;
      cast.x = land.x;
      cast.y = land.y;
      break;
    }
    case "rain": {
      // Vòng đầu rơi đúng chỗ mục tiêu đứng lúc bắt đầu, các vòng sau rải quanh trong `spreadPx` (seed riêng của trùm)
      const xs: number[] = [target.x];
      const ys: number[] = [target.y];
      for (let i = 1; i < s.count; i++) {
        const a = bossRand(bs) * 2 * Math.PI;
        const rr = Math.sqrt(bossRand(bs)) * s.spreadPx;
        xs.push(target.x + Math.cos(a) * rr);
        ys.push(target.y + Math.sin(a) * rr);
      }
      cast.rain = { xs, ys, warned: 0, hit: 0, warnAt: [] };
      cast.hitAt = now + (s.count - 1) * s.gapMs + ab.telegraphMs;
      break;
    }
    default:
      break; // ring, cone, line, charge, pull, summon, buff: tâm / gốc là chỗ trùm đứng
  }
  cast.endAt = cast.hitAt + ab.recoverMs;
  return cast;
}

/** Nghỉ giữa hai lần vận chiêu ở giai đoạn / cuồng nộ hiện tại (ms), không bao giờ dưới `BOSS_MIN_CAST_GAP_MS`. */
function gapOf(bs: BossCtrl): number {
  return Math.max(BOSS_MIN_CAST_GAP_MS, Math.round(bs.def.phases[bs.phase]!.castGapMs * bs.cd));
}

/**
 * Chọn chiêu cho lúc này: lọc theo giai đoạn, hồi chiêu, điều kiện (`cond`), còn chỗ cho quái con, chưa có giáp; chọn theo trọng số bằng bộ ngẫu nhiên có seed.
 * Chiêu không lập được kế hoạch (`planCast` trả `null`) bị bỏ rồi chọn lại.
 */
function pickCast(
  w: World,
  mc: MonsterCtrl,
  m: Monster,
  bs: BossCtrl,
  target: { x: number; y: number },
  d: number,
): BossCast | null {
  const now = w.now;
  const ph = bs.def.phases[bs.phase]!;
  const cands: BossAbility[] = [];
  let near = -1; // số người quanh trùm: đếm lười, chỉ khi có chiêu cần
  for (const aid of ph.abilities) {
    const ab = bs.def.abilities.find((a) => a.id === aid);
    if (!ab) continue;
    if ((bs.cds.get(ab.id) ?? 0) > now) continue;
    const c = ab.cond;
    if (c) {
      if (c.minDist !== undefined && d < c.minDist) continue;
      if (c.maxDist !== undefined && d > c.maxDist) continue;
      if (c.minTargets !== undefined || c.maxTargets !== undefined) {
        if (near < 0) {
          near = 0;
          w.state.players.forEach((p, sid) => {
            if (bossCanTarget(w, sid, p) && Math.hypot(p.x - m.x, p.y - m.y) <= BOSS_COND_RADIUS)
              near++;
          });
        }
        if (c.minTargets !== undefined && near < c.minTargets) continue;
        if (c.maxTargets !== undefined && near > c.maxTargets) continue;
      }
    }
    if (ab.shape.t === "summon" && bossLiveAdds(w, bs) >= bs.def.maxAdds) continue;
    if (ab.shape.t === "buff" && bs.armorUntil > now) continue;
    cands.push(ab);
  }
  while (cands.length > 0) {
    let total = 0;
    for (const a of cands) total += a.weight;
    let r = bossRand(bs) * total;
    let k = 0;
    while (k < cands.length - 1 && r >= cands[k]!.weight) r -= cands[k++]!.weight;
    const cast = planCast(w, mc, m, bs, cands[k]!, target);
    if (cast) return cast;
    cands.splice(k, 1);
  }
  return null;
}

// ---------- Hành động không sát thương: triệu hồi, giáp ----------

/** Gọi `count` quái con loài `kind` quanh trùm, không vượt `maxAdds` đang sống. Quái con KHÔNG rơi đồ / tu vi (`MonsterCtrl.addOf`). */
function summonAdds(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  bs: BossCtrl,
  kind: string,
  count: number,
) {
  const def = byId(MONSTER_BY_ID, kind);
  if (!def) return;
  const room = bs.def.maxAdds - bossLiveAdds(w, bs);
  const n = Math.min(count, room);
  let placed = 0;
  for (let i = 0; i < n; i++) {
    const a0 = ((i + bossRand(bs)) * 2 * Math.PI) / Math.max(1, count);
    const dist = mc.def.radius + def.radius + 40;
    // Thử vài hướng quanh hướng dự kiến: bỏ qua chỗ bị chặn / khu an toàn (không dựng quái trong tường)
    for (let t = 0; t < 4; t++) {
      const a = a0 + (t * Math.PI) / 2;
      const x = m.x + Math.cos(a) * dist;
      const y = m.y + Math.sin(a) * dist;
      if (w.map.circleBlocked(x, y, def.radius) || w.map.inSafe(x, y, def.radius + 8)) continue;
      const aid = placeMonster(w, def, x, y);
      const amc = w.mctrl.get(aid);
      if (amc) {
        amc.addOf = id;
        amc.target = mc.target;
        bs.adds.add(aid);
      }
      placed++;
      break;
    }
  }
  // MỘT `fx` mỗi lần gọi, chỉ khi có ít nhất một con thật sự xuất hiện (vẽ hiệu ứng / tiếng gọi hồn; quái con tự hiện qua state)
  if (placed > 0) w.events.fx({ kind: "bossSummon", by: id, x: m.x, y: m.y, n: placed });
}

/** Dựng giáp: `ms` ms nhận `mult` lần sát thương; MỘT `fx` lúc dựng (client tự đếm `ms`), dựng lại lúc đang có giáp thì fx mới thay fx cũ. */
function raiseArmor(w: World, id: string, m: Monster, bs: BossCtrl, ms: number, mult: number) {
  bs.armorUntil = w.now + ms;
  bs.armorMult = mult;
  w.events.fx({ kind: "bossArmor", by: id, x: m.x, y: m.y, ms, mult });
}

function runAction(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  bs: BossCtrl,
  act: BossAction,
) {
  if (act.t === "summon") summonAdds(w, id, m, mc, bs, act.kind, act.count);
  else raiseArmor(w, id, m, bs, act.ms, act.dmgTakenMult);
}

// ---------- Giai đoạn, cuồng nộ ----------

/** Cập nhật hệ số hiện hành = giai đoạn x cuồng nộ. */
function refreshMults(bs: BossCtrl) {
  const ph = bs.def.phases[bs.phase]!;
  const e = bs.enraged ? bs.def.enrage : undefined;
  bs.atk = ph.atkMult * (e?.atkMult ?? 1);
  bs.cd = ph.cdMult * (e?.cdMult ?? 1);
  bs.mv = ph.speedMult * (e?.speedMult ?? 1);
}

/** Chuyển tới giai đoạn `to` (> hiện tại): chạy `onEnter` của từng giai đoạn đã vượt, ngắt chiêu đang gồng (không đáp), gầm không sát thương. */
function enterPhase(w: World, id: string, m: Monster, mc: MonsterCtrl, bs: BossCtrl, to: number) {
  // `bossPhase` đi TRƯỚC `bossArmor` / `bossSummon` của `onEnter` (client thấy gầm rồi mới giáp / gọi quái con); `onEnter` không dời trùm nên (x, y) không đổi
  w.events.fx({ kind: "bossPhase", by: id, x: m.x, y: m.y, phase: to });
  for (let i = bs.phase + 1; i <= to; i++)
    for (const act of bs.def.phases[i]!.onEnter ?? []) runAction(w, id, m, mc, bs, act);
  bs.phase = to;
  bs.cast = undefined;
  bs.roarUntil = w.now + BOSS_PHASE_ROAR_MS;
  refreshMults(bs);
  bs.nextCastAt = bs.roarUntil + gapOf(bs);
}

// ---------- Đáp đòn ----------

/** Đáp đòn của chiêu không phải mưa (tại `hitAt`). */
function resolveCast(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  bs: BossCtrl,
  cast: BossCast,
) {
  const ab = cast.ab;
  const s = ab.shape;
  switch (s.t) {
    case "circleAt":
      strike(w, id, m, mc, bs, ab, { t: "circle", x: cast.x, y: cast.y, r: s.r, r0: 0 });
      break;
    case "ring":
      strike(w, id, m, mc, bs, ab, { t: "circle", x: cast.x, y: cast.y, r: s.r, r0: s.r0 });
      break;
    case "cone":
      strike(w, id, m, mc, bs, ab, {
        t: "cone",
        x: cast.x,
        y: cast.y,
        r: s.r,
        angle: cast.angle,
        arc: s.arc,
      });
      break;
    case "line":
      strike(w, id, m, mc, bs, ab, {
        t: "seg",
        x0: cast.x,
        y0: cast.y,
        x1: cast.x + Math.cos(cast.angle) * s.len,
        y1: cast.y + Math.sin(cast.angle) * s.len,
        w: s.w,
      });
      break;
    case "charge": {
      // Lao thẳng theo hướng đã khoá, dừng ở ô chặn / rìa khu an toàn; trúng mọi người sát đoạn vừa lao (như `charge.ts`)
      const ux = Math.cos(cast.angle);
      const uy = Math.sin(cast.angle);
      let left = s.len;
      while (left > 0) {
        const step = Math.min(DASH_STEP, left);
        const next = w.map.moveWithCollision(m.x, m.y, ux * step, uy * step, mc.def.radius * 0.8);
        if (next.x === m.x && next.y === m.y) break;
        if (w.map.inSafe(next.x, next.y, mc.def.radius + 8)) break;
        m.x = next.x;
        m.y = next.y;
        left -= step;
      }
      strike(w, id, m, mc, bs, ab, { t: "seg", x0: cast.x, y0: cast.y, x1: m.x, y1: m.y, w: s.w });
      break;
    }
    case "pull": {
      // Kéo người trong vòng `r` vào giữa tối đa `pullPx` (không xuyên tường, không vào khu an toàn), rồi nổ `blastR` quanh tâm
      const reach = PLAYER_RADIUS - BOSS_HIT_GRACE_PX;
      const pulled: string[] = [];
      w.state.players.forEach((p, sid) => {
        if (bossCanTarget(w, sid, p) && Math.hypot(p.x - cast.x, p.y - cast.y) <= s.r + reach)
          pulled.push(sid);
      });
      for (const sid of pulled) {
        const p = w.state.players.get(sid);
        if (!p) continue;
        const dx = cast.x - p.x;
        const dy = cast.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0) continue;
        const move = Math.min(s.pullPx, dist);
        const next = w.map.moveWithCollision(
          p.x,
          p.y,
          (dx / dist) * move,
          (dy / dist) * move,
          PLAYER_RADIUS,
        );
        if (w.map.inSafe(next.x, next.y, 20)) continue;
        p.x = next.x;
        p.y = next.y;
        syncPublicPos(p);
      }
      strike(w, id, m, mc, bs, ab, { t: "circle", x: cast.x, y: cast.y, r: s.blastR, r0: 0 });
      break;
    }
    case "pool": {
      // Vũng hiện ra đúng chỗ đã báo trước; hiện lại vùng đó trong suốt thời gian tồn tại để người chơi thấy; gây sát thương mỗi `tickMs`, tick đầu sau `tickMs`
      if (bs.pools.length >= MAX_POOLS) bs.pools.shift();
      bs.pools.push({
        x: cast.x,
        y: cast.y,
        r: s.r,
        until: w.now + s.ttlMs,
        next: w.now + s.tickMs,
        tickMs: s.tickMs,
        dmg: damageOf(w, mc, bs, ab),
        effect: ab.effect,
      });
      warnCircle(w, cast.x, cast.y, s.r, s.ttlMs);
      break;
    }
    case "blink":
      m.x = cast.x;
      m.y = cast.y;
      strike(w, id, m, mc, bs, ab, { t: "circle", x: cast.x, y: cast.y, r: s.landR, r0: 0 });
      break;
    case "summon":
      summonAdds(w, id, m, mc, bs, s.kind, s.count);
      break;
    case "buff":
      raiseArmor(w, id, m, bs, s.ms, s.dmgTakenMult);
      break;
    case "rain":
      break; // từng vòng xử lý ở `runCast`
  }
}

/** Vũng gây sát thương theo nhịp; hết hạn thì bỏ. Chạy cả khi trùm đang vận chiêu khác. */
function tickPools(w: World, m: Monster, bs: BossCtrl) {
  if (bs.pools.length === 0) return;
  let keep = 0;
  for (let i = 0; i < bs.pools.length; i++) {
    const pl = bs.pools[i]!;
    if (w.now >= pl.until) continue;
    if (w.now >= pl.next) {
      pl.next = w.now + pl.tickMs;
      for (const sid of hitList(w, { t: "circle", x: pl.x, y: pl.y, r: pl.r, r0: 0 })) {
        const p = w.state.players.get(sid);
        if (p && hurtPlayer(w, sid, p, pl.dmg, m) && pl.effect)
          applyPlayerStatus(w, sid, pl.effect, pl.dmg, "", () => bossRand(bs));
      }
    }
    bs.pools[keep++] = pl;
  }
  bs.pools.length = keep;
}

/** Một tick của chiêu đang vận: báo từng vòng mưa, đáp đòn tới hạn, hết thở thì kết thúc và đặt nghỉ giữa các chiêu. */
function runCast(w: World, id: string, m: Monster, mc: MonsterCtrl, bs: BossCtrl, cast: BossCast) {
  const now = w.now;
  const ab = cast.ab;
  const rain = cast.rain;
  if (rain && ab.shape.t === "rain") {
    const s = ab.shape;
    // Mỗi vòng có báo trước RIÊNG, >= `telegraphMs` từ lúc hiện tới lúc đáp. Vòng đáp `telegraphMs` sau MỐC THẬT SỰ báo (tick phát `warn`), không theo mốc lý thuyết
    // `startAt + k x gapMs`: hai mốc đó làm tròn lên tick khác nhau nên vòng thứ hai trở đi có thể đáp SỚM hơn báo trước tới 49 ms (fuzz #934 tìm ra, bot sát biên bị trúng).
    while (rain.warned < s.count && now >= cast.startAt + rain.warned * s.gapMs) {
      warnCircle(w, rain.xs[rain.warned]!, rain.ys[rain.warned]!, s.r, ab.telegraphMs);
      rain.warnAt.push(now);
      rain.warned++;
    }
    while (rain.hit < rain.warned && now >= rain.warnAt[rain.hit]! + ab.telegraphMs) {
      strike(w, id, m, mc, bs, ab, {
        t: "circle",
        x: rain.xs[rain.hit]!,
        y: rain.ys[rain.hit]!,
        r: s.r,
        r0: 0,
      });
      rain.hit++;
    }
  } else if (!cast.done && now >= cast.hitAt) {
    cast.done = true;
    resolveCast(w, id, m, mc, bs, cast);
  }
  // chiêu mưa chưa đáp hết vòng thì chưa kết thúc (vòng cuối nay có thể đáp muộn hơn `hitAt` vài chục ms)
  if (bs.cast === cast && now >= cast.endAt && !(rain && rain.hit < rain.xs.length)) {
    bs.cast = undefined;
    bs.nextCastAt = now + gapOf(bs);
  }
}

/** Bắt đầu vận `cast`: ghi hồi chiêu, đứng quay mặt về hướng khoá, gửi tên chiêu và (mưa: vòng đầu tick này) vùng báo trước. */
function beginCast(w: World, id: string, m: Monster, bs: BossCtrl, cast: BossCast) {
  const ab = cast.ab;
  const span = cast.endAt - cast.startAt;
  bs.cds.set(ab.id, cast.startAt + Math.max(Math.round(ab.cooldownMs * bs.cd), span));
  bs.cast = cast;
  m.angle = quantAngle(cast.angle);
  w.events.fx({
    kind: "bossCast",
    by: id,
    x: m.x,
    y: m.y,
    ability: ab.id,
    ms: cast.hitAt - cast.startAt,
  });
  emitWarn(w, cast);
}

// ---------- Vào tick ----------

/**
 * Một tick của trùm có mục tiêu `target` ở khoảng cách `d`. Trả `true` nếu trùm đang gầm / vận chiêu (người gọi KHÔNG di chuyển, KHÔNG đánh thường), `false` thì trùm chạy
 * như quái thường (đuổi, đánh gần) với hệ số tốc độ / sát thương của `mc.boss` (`monsters.ts`). `dt` (giây) cho đồng hồ cuồng nộ. Trùm miễn choáng nên không có tham số choáng.
 */
export function bossStep(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  target: { x: number; y: number },
  d: number,
  dt: number,
): boolean {
  const bs = mc.boss;
  if (!bs) return false;
  const now = w.now;
  if (!bs.engaged) {
    bs.engaged = true;
    bs.nextCastAt = now + BOSS_FIRST_CAST_DELAY_MS; // lần vận đầu sau khi gây hấn >= 1,2 giây
  }
  // Giai đoạn: hàm thuần của khí huyết, chỉ tăng
  const np = bossPhaseOf(bs.def, m.hp / m.maxHp);
  if (np > bs.phase) enterPhase(w, id, m, mc, bs, np);
  // Cuồng nộ (chỉ trùm có `enrage`): đếm khi có mục tiêu; KHÔNG đụng tới báo trước
  if (bs.def.enrage && !bs.enraged) {
    bs.fightMs += dt * 1000;
    if (bs.fightMs >= bs.def.enrage.afterMs) {
      bs.enraged = true;
      refreshMults(bs);
      w.events.fx({ kind: "bossEnrage", by: id, x: m.x, y: m.y });
    }
  }
  tickPools(w, m, bs);
  if (now < bs.roarUntil) return true; // đang gầm: đứng yên, không sát thương
  if (bs.cast) {
    runCast(w, id, m, mc, bs, bs.cast);
    return true;
  }
  if (now < bs.nextCastAt) return false;
  const cast = pickCast(w, mc, m, bs, target, d);
  if (!cast) {
    bs.nextCastAt = now + RESCAN_MS; // chưa chiêu nào hợp lệ: đánh thường như cũ, quét lại sau
    return false;
  }
  beginCast(w, id, m, bs, cast);
  runCast(w, id, m, mc, bs, cast); // cùng tick: mưa báo vòng đầu NGAY lúc bắt đầu (các vòng sau theo `gapMs`)
  return true;
}

/**
 * Mất hết mục tiêu: trùm đang trong trận thì RESET: hồi đầy khí huyết, giai đoạn 0, xoá chiêu đang vận / hồi chiêu / cuồng nộ / vũng / giáp và quái con. Không trong trận thì không làm gì.
 * (Trùm đi về nhà bằng đường về nhà sẵn có của `monsters.ts`.)
 */
export function bossReset(w: World, m: Monster, mc: MonsterCtrl) {
  const bs = mc.boss;
  if (!bs || !bs.engaged) return;
  bossDespawnAdds(w, bs);
  bs.engaged = false;
  bs.phase = 0;
  bs.cast = undefined;
  bs.nextCastAt = 0;
  bs.cds.clear();
  bs.roarUntil = 0;
  bs.armorUntil = 0;
  bs.armorMult = 1;
  bs.fightMs = 0;
  bs.enraged = false;
  bs.pools.length = 0;
  refreshMults(bs);
  m.hp = m.maxHp;
}
