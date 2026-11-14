// Quái `charger` (M7.3, #504, docs/PHAN_CONG_M7.md mục 6): ĐỨNG GỒNG `windupMs` (báo trước bằng `fx` `warn` hình đường thẳng, bằng `sendNear` qua
// `WorldRoom`), rồi LAO THẲNG một quãng cố định theo hướng đã khoá lúc bắt đầu gồng, rồi đứng THỞ (hồi) một lúc trước khi ra đòn kế.
// Luật chốt (server quyết định, người chơi tránh được):
//  - Hướng khoá lúc gồng: người chơi đi ngang ra khỏi đường lao trong thời gian gồng thì KHÔNG trúng; đứng yên (hoặc đi dọc theo đường) thì trúng.
//  - Trúng tính theo VỊ TRÍ người chơi LÚC ĐÁP ĐÒN (không phải lúc gồng): mọi người không ở khu an toàn (người chết / hồn lìa xác / thách đấu / đang né do `hurtPlayer` bỏ qua), cách đoạn lao <= nửa bề rộng + bán kính.
//  - Lao dừng ở ô chặn (`moveWithCollision` dùng chung) và không lao vào khu an toàn; vùng báo trước luôn vẽ đủ tầm (an toàn cho người xem: hơi thừa).
//  - Choáng (`stun`) NGẮT cú gồng (không đáp đòn) và phạt chờ lâu hơn: phần thưởng cho chiêu khống chế (M7.2b).
//  - Đòn lao mạnh hơn đòn thường (`CHARGE_MULT`), không dùng `Math.random` (giữ nguyên chuỗi của bench có seed).
// Mô-đun chỉ biết `World`; `monsters.ts` gọi `chargerStep` mỗi tick cho quái có mục tiêu và `behavior === "charger"`.
import { PLAYER_RADIUS, type MonsterKind } from "@tien-gioi/shared";
import type { Monster } from "../schema";
import { quantAngle, type World, type MonsterCtrl } from "../world";
import { hurtPlayer } from "./combat";

/** Quãng lao (px) và bề rộng đường lao / vùng báo trước (px). */
export const CHARGE_LEN = 280;
export const CHARGE_WIDTH = 56;
/** Hệ số sát thương của đòn lao so với đòn thường. */
export const CHARGE_MULT = 1.5;
/** Quái chỉ bắt đầu gồng khi mục tiêu cách trong khoảng [đánh gần, `CHARGE_TRIGGER`] (px, tính từ tâm tới tâm). */
export const CHARGE_TRIGGER = 240;
/** Đứng thở sau khi lao (ms): quái dễ bị đánh nhất lúc này. */
export const CHARGE_RECOVER_MS = 700;
/** Bước kiểm va chạm khi lao (px). */
const CHARGE_STEP = 16;
/** Thời gian gồng mặc định (ms) khi `MonsterKind.windupMs` bỏ trống. */
export const DEFAULT_WINDUP_MS = 800;

/** Khoảng cách từ điểm (px, py) tới đoạn (ax, ay)-(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Chỗ (x, y) có nằm trong khu an toàn không? Quái không đánh người ở đó (đường lao dừng ở rìa khu, nhưng đoạn lao cuối vẫn có thể kề sát người đứng trong khu).
 * Người chết, hồn lìa xác, đang thách đấu, đang né: `hurtPlayer` đã bỏ qua (một nơi giữ các luật này).
 */
function inSafeZone(w: World, x: number, y: number): boolean {
  return w.map.inSafe(x, y, 20);
}

/**
 * Đáp đòn lao: lao từ vị trí hiện tại theo `angle` tối đa `CHARGE_LEN`, dừng ở chỗ chặn; trúng mọi người nằm sát đoạn vừa lao.
 * Trả vị trí cuối (đã ghi vào `m`).
 */
function strike(w: World, id: string, m: Monster, mc: MonsterCtrl, angle: number) {
  const def = mc.def;
  const x0 = m.x;
  const y0 = m.y;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let left = CHARGE_LEN;
  while (left > 0) {
    const s = Math.min(CHARGE_STEP, left);
    const next = w.map.moveWithCollision(m.x, m.y, ux * s, uy * s, def.radius * 0.8);
    if (next.x === m.x && next.y === m.y) break; // bị chặn
    if (w.map.inSafe(next.x, next.y, def.radius + 8)) break; // không lao vào khu an toàn
    m.x = next.x;
    m.y = next.y;
    left -= s;
  }
  w.events.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle });
  const dmg = Math.round(def.atk * CHARGE_MULT);
  const reach = CHARGE_WIDTH / 2 + PLAYER_RADIUS;
  // Gom trước rồi mới gây sát thương: `hurtPlayer` có thể làm người chơi chết / đổi `w.state.players` (luân hồi)
  const hit: string[] = [];
  w.state.players.forEach((p, sid) => {
    if (inSafeZone(w, p.x, p.y)) return;
    if (segDist(p.x, p.y, x0, y0, m.x, m.y) <= reach) hit.push(sid);
  });
  for (const sid of hit) {
    const p = w.state.players.get(sid);
    if (p) hurtPlayer(w, sid, p, dmg, m);
  }
}

/**
 * Một tick của quái `charger` có mục tiêu `target` ở khoảng cách `d`. Trả `true` nếu quái đang gồng / thở (người gọi KHÔNG di chuyển, KHÔNG đánh thường),
 * `false` thì quái chạy như quái thường (đuổi, đánh gần).
 */
export function chargerStep(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  target: { x: number; y: number },
  d: number,
  stunned: boolean,
): boolean {
  const def: MonsterKind = mc.def;
  const ai = mc.ai;
  if (ai) {
    if (ai.phase === "windup") {
      if (stunned) {
        // Bị choáng giữa lúc gồng: huỷ đòn, chờ lâu hơn
        mc.ai = undefined;
        mc.nextAttack = w.now + def.attackCd * 3;
        return true;
      }
      m.angle = quantAngle(ai.angle);
      if (w.now >= ai.until) {
        strike(w, id, m, mc, ai.angle);
        mc.ai = { phase: "recover", until: w.now + CHARGE_RECOVER_MS, angle: ai.angle };
      }
      return true;
    }
    // recover: đứng thở
    if (w.now >= ai.until) {
      mc.ai = undefined;
      mc.nextAttack = w.now + def.attackCd * 2;
      return false;
    }
    return true;
  }
  if (stunned || w.now < mc.nextAttack) return false;
  if (d > CHARGE_TRIGGER || d <= def.attackRange + PLAYER_RADIUS) return false; // quá xa: đuổi tiếp; đã sát: đánh thường
  // Bắt đầu gồng: KHOÁ hướng (người chơi tránh bằng cách ra khỏi đường lao), báo trước cho người ở gần
  const angle = Math.atan2(target.y - m.y, target.x - m.x);
  const ms = def.windupMs ?? DEFAULT_WINDUP_MS;
  mc.ai = { phase: "windup", until: w.now + ms, angle };
  m.angle = quantAngle(angle);
  w.events.fx({
    kind: "warn",
    shape: "line",
    x: m.x,
    y: m.y,
    r: CHARGE_LEN,
    w: CHARGE_WIDTH,
    angle,
    ms,
  });
  return true;
}
