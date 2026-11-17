// ĐẠN BAY của người chơi (`SkillDef.shape = "bolt"`, mục 51, CT3 #1048, docs/PHAN_CONG_CHIEU_THUC.md mục 3-4): `count` viên toả `arc` quanh hướng bắn, bay thẳng `speed` px/giây,
// XUYÊN `pierce` quái, NẢY `bounce` lần sang quái gần nhất chưa trúng trong `PBOLT_BOUNCE_RADIUS`, dừng ở ô chặn / hết `range`; trúng đối thủ thách đấu qua `duelHit`.
//
// THIẾT KẾ (khác bản nháp "mỗi tick di chuyển đạn + lưới không gian": đổi có chủ ý, ghi ở mục 4 của kế hoạch):
//  - Đường bay QUY HOẠCH MỘT LẦN lúc bắn bằng hàm thuần `planBolt` (không đọc `World`): ra các ĐOẠN thẳng (một đoạn, thêm một đoạn mỗi lần nảy) và danh sách LẦN TRÚNG kèm thời điểm.
//    Nhờ vậy `fx` `pbolt` gửi ĐÚNG `ms` tới chỗ dừng thật (ô chặn / trúng / hết tầm) như hợp đồng (mục 3b điểm 4), client KHÔNG tự mô phỏng gì, và máy chủ không phải duyệt đạn x quái
//    mỗi tick: chi phí là MỘT lần quét quái gần mỗi lần bắn (không cần lưới không gian), mỗi tick chỉ cắt các sự kiện đã tới hạn trong `World.pbolts`.
//  - Sát thương ÁP ĐÚNG LÚC đạn chạm (hẹn giờ theo quãng bay), qua cùng `strikeMonster` của chiêu tức thời (hệ khắc, combo, hiệu ứng, kéo / đẩy). Quái đã chết lúc đạn tới thì bỏ lượt (đạn vẫn
//    "xuyên qua" về hình ảnh: đường bay đã chốt lúc bắn); quái di chuyển sau lúc bắn vẫn bị tính theo vị trí LÚC BẮN (đạn nhanh, quái chậm: sai lệch nhỏ, chấp nhận).
//  - Trần: `MAX_PLAYER_BOLTS_PER_PLAYER` đạn đang bay mỗi người, `MAX_PLAYER_BOLTS` mỗi phòng; vượt trần thì viên đó KHÔNG bắn (đã tốn linh lực + hồi chiêu như `fireBolt` của quái).
//  - Chủ chết / rời phòng / hồn lìa xác / vào Hoàng Tuyền thì đạn còn bay TAN ngay (không sát thương mồ côi, không cần móc vào chỗ dọn người chơi).
//  - Không `Math.random` ở đây (giữ chuỗi ngẫu nhiên của bench); `rollDamage` chỉ chạy lúc đạn trúng.
import { PLAYER_RADIUS, SKILL_LIMITS, type SkillDef } from "@tien-gioi/shared";
import type { World } from "../world";

/** Đạn của người chơi đang bay tối đa mỗi người / mỗi phòng. */
export const MAX_PLAYER_BOLTS_PER_PLAYER = 16;
export const MAX_PLAYER_BOLTS = 128;
/** Bán kính trúng của đạn (cộng bán kính mục tiêu) (px). */
export const PBOLT_RADIUS = 8;
/** Nảy sang quái gần nhất chưa trúng trong ngần này px kể từ chỗ vừa trúng. */
export const PBOLT_BOUNCE_RADIUS = 160;
/** Kiểm ô chặn mỗi ngần này px dọc đường bay (nhỏ hơn một ô 32 px: đạn nhanh không nhảy qua tường mỏng). */
export const PBOLT_WALL_SAMPLE = 16;
/** Số đoạn tối đa của một viên (1 + số lần nảy tối đa); chặn vòng quy hoạch không dừng nếu dữ liệu sai. */
const MAX_LEGS = 1 + SKILL_LIMITS.boltBounceMax;
/** Dư an toàn khi lọc quái ở xa trước khi quy hoạch (bán kính quái lớn nhất cộng chút). */
const TARGET_SLACK = 120;
/** Tiền tố id của đối thủ thách đấu trong tập mục tiêu (không bao giờ trùng id quái). */
const PK_PREFIX = "\u0000pk:";

/** Mục tiêu tròn mà đạn có thể trúng. */
export interface PTarget {
  id: string;
  x: number;
  y: number;
  /** Bán kính mục tiêu (px) */
  r: number;
  /** Đối thủ thách đấu (người chơi), không phải quái */
  pk?: boolean;
}

/** Một ĐOẠN bay thẳng: từ (x, y) theo `angle` dài `dist` px; `t0` = thời điểm bắt đầu đoạn (ms kể từ lúc bắn). */
export interface PLeg {
  x: number;
  y: number;
  angle: number;
  dist: number;
  t0: number;
}

/** Một LẦN TRÚNG: `t` = thời điểm (ms kể từ lúc bắn); (fromX, fromY) = chỗ bắt đầu đoạn bay chứa lần trúng (để kéo / đẩy). */
export interface PHit {
  id: string;
  pk: boolean;
  t: number;
  fromX: number;
  fromY: number;
}

export interface PlanIn {
  x: number;
  y: number;
  angle: number;
  /** px / giây, > 0 */
  speed: number;
  /** Tổng quãng bay tối đa (px), chia cho mọi đoạn */
  range: number;
  /** Xuyên thêm bao nhiêu mục tiêu (>= 0) */
  pierce: number;
  /** Số lần nảy (>= 0) */
  bounce: number;
  targets: readonly PTarget[];
  /** Điểm (px) có nằm trên ô chặn không */
  blocked: (x: number, y: number) => boolean;
}

export interface Plan {
  legs: PLeg[];
  hits: PHit[];
}

/**
 * Quy hoạch đường bay MỘT viên đạn (thuần, tất định). Luật:
 *  - Mỗi đoạn bay thẳng tới khi gặp ô chặn (dừng ngay trước ô, như đạn của quái), hết quãng còn lại, hoặc bị mục tiêu chặn.
 *  - Mục tiêu bị trúng khi đường bay lọt vào bán kính `r + PBOLT_RADIUS` quanh nó; mỗi mục tiêu chỉ trúng MỘT lần trên cả đường bay (kể cả sau nảy). Mục tiêu sau lưng không trúng;
 *    mục tiêu đang chồng lên chỗ bắn trúng ở quãng 0.
 *  - Trúng một mục tiêu: còn `pierce` thì xuyên qua (giảm 1, đường thẳng); hết xuyên mà còn `bounce` và có mục tiêu chưa trúng trong `PBOLT_BOUNCE_RADIUS` thì nảy sang cái GẦN NHẤT
 *    (giảm 1, đoạn mới bắt đầu ở chỗ trúng, quãng bay còn lại là phần chưa dùng); không thì đạn dừng tại chỗ trúng.
 */
export function planBolt(a: PlanIn): Plan {
  const legs: PLeg[] = [];
  const hits: PHit[] = [];
  const done = new Set<string>();
  const speed = a.speed > 0 && Number.isFinite(a.speed) ? a.speed : 1;
  let x = a.x;
  let y = a.y;
  let angle = a.angle;
  let left = Number.isFinite(a.range) ? a.range : 0;
  let pierce = Math.max(0, Math.floor(a.pierce));
  let bounce = Math.max(0, Math.floor(a.bounce));
  let t0 = 0;
  while (legs.length < MAX_LEGS) {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // 1) quãng tối đa tới ô chặn / hết tầm
    let reach = Math.max(0, left);
    if (reach > 0) {
      for (let s = PBOLT_WALL_SAMPLE; ; s += PBOLT_WALL_SAMPLE) {
        const d = Math.min(s, left);
        if (a.blocked(x + ux * d, y + uy * d)) {
          reach = Math.max(0, d - PBOLT_WALL_SAMPLE);
          break;
        }
        if (d >= left) break;
      }
    }
    // 2) mục tiêu nằm trên đường (chưa trúng), theo thứ tự gặp
    const cand: { t: PTarget; d: number }[] = [];
    for (const tg of a.targets) {
      if (done.has(tg.id)) continue;
      const rx = tg.x - x;
      const ry = tg.y - y;
      const along = rx * ux + ry * uy;
      const perp = Math.abs(rx * uy - ry * ux);
      const rr = tg.r + PBOLT_RADIUS;
      if (perp > rr) continue;
      const half = Math.sqrt(rr * rr - perp * perp);
      if (along + half < 0) continue; // sau lưng
      const enter = Math.max(0, along - half);
      if (enter > reach) continue; // quá xa hoặc sau ô chặn
      cand.push({ t: tg, d: enter });
    }
    cand.sort((p, q) => p.d - q.d);
    // 3) duyệt các lần trúng: xuyên qua tới khi hết xuyên, rồi nảy hoặc dừng
    let dist = reach;
    let next: { x: number; y: number; angle: number } | null = null;
    for (const c of cand) {
      done.add(c.t.id);
      hits.push({
        id: c.t.id,
        pk: c.t.pk === true,
        t: t0 + (c.d / speed) * 1000,
        fromX: x,
        fromY: y,
      });
      if (pierce > 0) {
        pierce--;
        continue;
      }
      dist = c.d;
      if (bounce > 0) {
        const hx = x + ux * c.d;
        const hy = y + uy * c.d;
        let best: PTarget | null = null;
        let bestD = PBOLT_BOUNCE_RADIUS;
        for (const tg of a.targets) {
          if (done.has(tg.id)) continue;
          const dd = Math.hypot(tg.x - hx, tg.y - hy);
          if (dd <= bestD) {
            bestD = dd;
            best = tg;
          }
        }
        if (best) {
          bounce--;
          next = { x: hx, y: hy, angle: Math.atan2(best.y - hy, best.x - hx) };
        }
      }
      break;
    }
    legs.push({ x, y, angle, dist, t0 });
    if (!next) break;
    left -= dist;
    t0 += (dist / speed) * 1000;
    x = next.x;
    y = next.y;
    angle = next.angle;
  }
  return { legs, hits };
}

/** Một việc hẹn giờ của đạn: gửi đoạn bay kế (`seg`) hoặc áp một lần trúng (`hit` quái, `hitPlayer` đối thủ). */
type PStep =
  | { at: number; kind: "seg"; x: number; y: number; angle: number; ms: number }
  | { at: number; kind: "hit" | "hitPlayer"; id: string; fromX: number; fromY: number };

/** Một viên đạn đang bay (chỉ server; client chỉ nhận `fx` `pbolt` từng đoạn). */
export interface PBolt {
  owner: string;
  skill: string;
  speed: number;
  /** Việc hẹn giờ theo thứ tự `at` tăng dần (`w.now` ms); `next` = việc kế tiếp chưa chạy */
  steps: PStep[];
  next: number;
  /** Lúc đạn HẾT bay (`w.now` ms: đoạn cuối chạm đích): tới đó viên mới rời `World.pbolts` (trần "đang bay" đo theo đây) */
  end: number;
  /** Áp một lần trúng quái (đã chốt công thức ở `cast`): quái đã chết thì bỏ qua bên trong */
  strike: (id: string, fromX: number, fromY: number) => void;
  /** Áp một lần trúng đối thủ thách đấu */
  hitOpponent: (target: string, fromX: number, fromY: number) => void;
}

/** Cách áp sát thương do `cast.ts` đưa vào (tránh vòng import cast <-> pbolt). */
export interface PBoltHandlers {
  strike: PBolt["strike"];
  hitOpponent: PBolt["hitOpponent"];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);

/** Gửi MỘT `fx` `pbolt` cho một đoạn bay (số nguyên cho x / y / ms: ít byte). */
function sendSeg(
  w: World,
  sid: string,
  skill: string,
  speed: number,
  x: number,
  y: number,
  angle: number,
  ms: number,
) {
  w.events.fx({
    kind: "pbolt",
    by: sid,
    skill,
    x: Math.round(x),
    y: Math.round(y),
    angle: Math.round(angle * 1000) / 1000,
    speed,
    ms: Math.round(ms),
  });
}

/**
 * Bắn `def.count` viên từ (x0, y0) theo `angle` (toả `def.arc`); mỗi viên quy hoạch riêng bằng `planBolt` trên cùng tập mục tiêu chụp lúc bắn. Đoạn đầu gửi `fx` ngay,
 * đoạn nảy gửi lúc đạn tới chỗ nảy. Mọi trường của `def` đều được kẹp lại theo `SKILL_LIMITS` (dữ liệu hợp lệ đã kiểm ở `skillViolations`, đây chỉ là dây an toàn thứ hai).
 */
export function fireBolts(
  w: World,
  sid: string,
  def: SkillDef,
  x0: number,
  y0: number,
  angle: number,
  h: PBoltHandlers,
) {
  const count = clamp(Math.floor(finiteOr(def.count, 1)), 1, SKILL_LIMITS.boltCountMax);
  const speed = clamp(
    finiteOr(def.speed, SKILL_LIMITS.boltSpeedMin),
    SKILL_LIMITS.boltSpeedMin,
    SKILL_LIMITS.boltSpeedMax,
  );
  const range = clamp(finiteOr(def.range, 0), 0, SKILL_LIMITS.boltRangeMax);
  const pierce = clamp(Math.floor(finiteOr(def.pierce, 0)), 0, SKILL_LIMITS.boltPierceMax);
  const bounce = clamp(Math.floor(finiteOr(def.bounce, 0)), 0, SKILL_LIMITS.boltBounceMax);
  const spread = Math.max(0, finiteOr(def.arc, 0));
  let mine = 0;
  for (const b of w.pbolts) if (b.owner === sid) mine++;
  if (mine >= MAX_PLAYER_BOLTS_PER_PLAYER || w.pbolts.length >= MAX_PLAYER_BOLTS) return;

  // Chụp tập mục tiêu MỘT lần (quái trong tầm cộng chỗ nảy, và đối thủ thách đấu nếu có): mọi viên dùng chung
  const lim = range + bounce * PBOLT_BOUNCE_RADIUS + PBOLT_RADIUS + TARGET_SLACK;
  const targets: PTarget[] = [];
  w.state.monsters.forEach((mon, id) => {
    const mc = w.mctrl.get(id);
    if (!mc || Math.abs(mon.x - x0) > lim || Math.abs(mon.y - y0) > lim) return;
    targets.push({ id, x: mon.x, y: mon.y, r: mc.def.radius });
  });
  // đối thủ chỉ là mục tiêu khi trận ĐANG ở pha `fight` (`duelHit` từ chối pha khác: đối thủ đứng trong lúc đếm ngược không được chặn đạn)
  const opp =
    w.duels.active && w.duels.of(sid)?.phase === "fight" ? w.duels.opponentOf(sid) : undefined;
  const po = opp === undefined ? undefined : w.state.players.get(opp);
  if (opp !== undefined && po && !po.dead)
    targets.push({ id: PK_PREFIX + opp, x: po.x, y: po.y, r: PLAYER_RADIUS, pk: true });

  const blocked = (x: number, y: number) => w.map.isBlockedPx(x, y);
  for (let i = 0; i < count; i++) {
    if (mine >= MAX_PLAYER_BOLTS_PER_PLAYER || w.pbolts.length >= MAX_PLAYER_BOLTS) break;
    const a = count === 1 ? angle : angle - spread / 2 + (spread * i) / (count - 1);
    const plan = planBolt({
      x: x0,
      y: y0,
      angle: a,
      speed,
      range,
      pierce,
      bounce,
      targets,
      blocked,
    });
    const first = plan.legs[0];
    if (!first || (first.dist < 1 && plan.hits.length === 0)) continue; // bắn thẳng vào tường: không có gì bay
    const steps: PStep[] = [];
    const last = plan.legs[plan.legs.length - 1];
    for (let j = 1; j < plan.legs.length; j++) {
      const l = plan.legs[j];
      steps.push({
        at: w.now + l.t0,
        kind: "seg",
        x: l.x,
        y: l.y,
        angle: l.angle,
        ms: Math.round((l.dist / speed) * 1000),
      });
    }
    for (const hit of plan.hits)
      steps.push({
        at: w.now + hit.t,
        kind: hit.pk ? "hitPlayer" : "hit",
        id: hit.pk ? (opp as string) : hit.id,
        fromX: hit.fromX,
        fromY: hit.fromY,
      });
    // cùng thời điểm: trúng trước, đoạn nảy sau (sát thương rồi mới thấy đạn đổi hướng)
    steps.sort((p, q) => p.at - q.at || (p.kind === "seg" ? 1 : 0) - (q.kind === "seg" ? 1 : 0));
    w.pbolts.push({
      owner: sid,
      skill: def.id,
      speed,
      steps,
      next: 0,
      end: w.now + last.t0 + (last.dist / speed) * 1000,
      strike: h.strike,
      hitOpponent: h.hitOpponent,
    });
    mine++;
    sendSeg(w, sid, def.id, speed, first.x, first.y, first.angle, (first.dist / speed) * 1000);
  }
}

/** Mỗi tick: chạy các việc hẹn giờ đã tới hạn của mọi viên; viên hết việc và đã bay tới đích, hoặc mất chủ, thì gỡ. Không có đạn thì thoát ngay (không tốn gì). */
export function tickPBolts(w: World) {
  const list = w.pbolts;
  if (list.length === 0) return;
  let keep = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const p = w.state.players.get(b.owner);
    const c = w.ctrl.get(b.owner);
    // chủ chết / rời phòng / hồn lìa xác / Hoàng Tuyền: đạn tan, không sát thương mồ côi
    if (!p || !c || p.dead || c.limbo || (w.ghosts.size > 0 && w.ghosts.has(b.owner))) continue;
    while (b.next < b.steps.length && b.steps[b.next].at <= w.now) {
      const s = b.steps[b.next++];
      if (s.kind === "seg") sendSeg(w, b.owner, b.skill, b.speed, s.x, s.y, s.angle, s.ms);
      else if (s.kind === "hit") b.strike(s.id, s.fromX, s.fromY);
      else b.hitOpponent(s.id, s.fromX, s.fromY);
    }
    if (b.next < b.steps.length || w.now < b.end) list[keep++] = b;
  }
  list.length = keep;
}
