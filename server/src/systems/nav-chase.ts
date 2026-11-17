// Bám đường, phát hiện kẹt và RÚT VỀ của quái đang đuổi (QUYET_DINH_M3 mục 48, issue #1012). Tìm đường nằm ở `nav.ts`; `monsters.ts` chỉ gọi vài hàm ở đây.
//
// Luật:
//  - Đường thẳng tới đích thông (cho thân thật) thì đi thẳng như cũ (không tốn gì ngoài một lần kiểm 100 ms/lần). Bị chặn thì đi theo đường A* (`nav.ts`); tính lại khi đích dịch > 2 nút
//    hoặc đã hết đường, không dày hơn `NAV_REPATH_MS` mỗi con. Quái thường chia chung `NAV_SEARCHES_PER_TICK` lần tìm mỗi tick (hết thì đi thẳng tick đó, tick sau thử lại); TRÙM luôn được tìm.
//  - Kẹt = MUỐN đi (tốc độ > 0, chưa tới tầm đánh) mà quãng đường THỰC ĐI < `STUCK_MIN_MOVE_PX` trong mỗi cửa sổ `STUCK_CHECK_MS`; cộng dồn. Đo theo vị trí CỦA QUÁI (không theo khoảng cách tới người):
//    người chơi chạy dích dắc quanh trùm vẫn đánh bình thường, chỉ chỗ trùm không tới được mới bị coi là kẹt. Đang gồng / vận chiêu / đứng đánh / choáng thì tốc độ 0 nên không cộng.
//  - Kẹt >= `STUCK_REROUTE_MS`: thử lối khác một lần (coi điểm đang cố tới là vật chặn khi tìm lại). Kẹt >= `STUCK_EVADE_MS`: RÚT (leash): bỏ mục tiêu, về chỗ sinh bằng đường A*, trùm hồi đầy + reset
//    (`bossReset`), trong lúc rút KHÔNG bị đòn đánh kéo lại, và `SHUN_MS` sau đó không nhắm lại đúng người đó (đứng sau cây đánh trùm không cày được: trùm rút + hồi, không đứng ngơ).
//    Rút quá `EVADE_MAX_MS` hoặc kẹt khi về nhà thì đặt thẳng về chỗ sinh (không bao giờ kẹt vĩnh viễn).
import type { Monster } from "../schema";
import type { MonsterCtrl, World } from "../world";
import { findPath, lineClear, NAV_CELL } from "./nav";

/** Quái thường được tìm đường tối đa chừng này lần MỖI TICK (cả phòng); trùm không bị giới hạn. */
export const NAV_SEARCHES_PER_TICK = 3;
/** Giãn cách tối thiểu giữa hai lần tìm của một con (ms). */
export const NAV_REPATH_MS = 400;
/** Tới cách điểm đường chừng này (px) thì sang điểm kế. */
export const NAV_ARRIVE_PX = 12;
/** Cửa sổ đo quãng đường thực đi (ms). */
export const STUCK_CHECK_MS = 500;
/** Đi được ít hơn chừng này (px) trong một cửa sổ thì coi là đứng im. */
export const STUCK_MIN_MOVE_PX = 8;
/** Kẹt từng này ms thì thử lối khác. */
export const STUCK_REROUTE_MS = 2000;
/** Kẹt từng này ms thì rút về (leash). */
export const STUCK_EVADE_MS = 5000;
/** Đang rút quá chừng này (ms) thì đặt thẳng về chỗ sinh. */
export const EVADE_MAX_MS = 15_000;
/** Về tới cách chỗ sinh chừng này (px) thì hết rút. */
export const EVADE_HOME_PX = 48;
/** Sau khi rút, không nhắm lại đúng người đã gây kẹt trong chừng này (ms). */
export const SHUN_MS = 10_000;
/** Bán kính vùng coi là vật chặn quanh điểm đang cố tới khi thử lối khác (px). */
const REROUTE_AVOID_R = 20;
/** Chu kỳ kiểm đường thẳng (ms): quái đi ~5 px mỗi tick nên không cần kiểm từng tick. */
const LOS_MS = 100;

/** Dữ liệu tìm đường / kẹt / rút của MỘT con quái; dựng lười ở lần đuổi đầu tiên (quái không đuổi thì không tốn gì). */
export interface NavCtrl {
  /** Điểm đường (x, y xen kẽ, px) đang đi; null = đi thẳng. */
  pts: Float32Array | null;
  /** Điểm đang hướng tới (chỉ số cặp). */
  i: number;
  /** Đích lúc tìm đường (để biết đích đã dịch xa chưa). */
  gx: number;
  gy: number;
  /** Đường chỉ tới nút gần đích nhất (không tới được vùng đích). */
  partial: boolean;
  /** Sớm nhất được tìm lại (ms của `World.now`). */
  repathAt: number;
  losAt: number;
  los: boolean;
  // Phát hiện kẹt
  chkX: number;
  chkY: number;
  chkAt: number;
  stuckMs: number;
  rerouted: boolean;
  // Rút về
  /** > `World.now`: đang rút (bỏ mục tiêu, không bị kéo lại). 0 = không. */
  evadeUntil: number;
  /** Không nhắm lại người này tới `shunUntil`. */
  shun: string | null;
  shunUntil: number;
}

function newNav(m: Monster, now: number): NavCtrl {
  return {
    pts: null,
    i: 0,
    gx: 0,
    gy: 0,
    partial: false,
    repathAt: 0,
    losAt: -1,
    los: true,
    chkX: m.x,
    chkY: m.y,
    chkAt: now,
    stuckMs: 0,
    rerouted: false,
    evadeUntil: 0,
    shun: null,
    shunUntil: 0,
  };
}

/** Điểm cần hướng tới sau `navSteer` (đối tượng dùng chung, không cấp phát mỗi tick). */
export const NAV_OUT = { x: 0, y: 0 };

/** Đang rút về (không nhắm, không bị kéo lại)? */
export function isEvading(w: World, mc: MonsterCtrl): boolean {
  return mc.nav !== undefined && mc.nav.evadeUntil > w.now;
}

/** Người này đang bị cấm nhắm (vừa là nguyên nhân kẹt)? */
export function isShunned(w: World, mc: MonsterCtrl, sid: string): boolean {
  const nav = mc.nav;
  return nav !== undefined && nav.shun === sid && w.now < nav.shunUntil;
}

/** Bắt đầu rút về chỗ sinh, cấm nhắm lại `sid` một lúc. Người gọi tự bỏ `mc.target`, `damageBy`, đòn đang gồng. */
export function startEvade(w: World, mc: MonsterCtrl, sid: string | null) {
  const nav = mc.nav!;
  nav.evadeUntil = w.now + EVADE_MAX_MS;
  nav.shun = sid;
  nav.shunUntil = sid === null ? 0 : w.now + SHUN_MS;
  nav.pts = null;
  nav.stuckMs = 0;
  nav.rerouted = false;
}

/** Hết rút / bỏ đường và đo kẹt (về tới nhà, đặt lại chỗ). */
export function resetNav(mc: MonsterCtrl, m: Monster, now: number) {
  const nav = mc.nav;
  if (!nav) return;
  nav.evadeUntil = 0;
  nav.pts = null;
  nav.stuckMs = 0;
  nav.rerouted = false;
  nav.chkX = m.x;
  nav.chkY = m.y;
  nav.chkAt = now;
}

/** Không muốn đi tick này (đứng đánh, gồng, choáng, ngủ): đo kẹt bắt đầu lại, bỏ đường. */
export function navIdle(mc: MonsterCtrl, m: Monster, now: number) {
  const nav = mc.nav;
  if (!nav) return;
  nav.stuckMs = 0;
  nav.rerouted = false;
  nav.pts = null;
  nav.chkX = m.x;
  nav.chkY = m.y;
  nav.chkAt = now;
}

/**
 * Tạm không đi tick này vì đang gồng / vận chiêu / gầm / choáng (KHÔNG phải đã tới tầm đánh): đo kẹt TẠM DỪNG, không đặt lại. Trùm vận chiêu từ xa vào người đứng chỗ nó không
 * tới được vẫn tính dồn thời gian kẹt giữa các chiêu (nếu không, cứ vài giây vận một chiêu là không bao giờ rút).
 */
export function navPause(mc: MonsterCtrl, m: Monster, now: number) {
  const nav = mc.nav;
  if (!nav) return;
  nav.pts = null;
  nav.chkX = m.x;
  nav.chkY = m.y;
  nav.chkAt = now;
}

/** Đặt thẳng về chỗ sinh (rút quá lâu / kẹt khi về nhà). */
export function snapHome(w: World, m: Monster, mc: MonsterCtrl) {
  m.x = mc.homeX;
  m.y = mc.homeY;
  resetNav(mc, m, w.now);
}

function trackStuck(nav: NavCtrl, m: Monster, now: number) {
  const dt = now - nav.chkAt;
  if (dt < STUCK_CHECK_MS) return;
  const moved = Math.hypot(m.x - nav.chkX, m.y - nav.chkY);
  if (moved < STUCK_MIN_MOVE_PX) nav.stuckMs += dt;
  else {
    nav.stuckMs = 0;
    nav.rerouted = false;
  }
  nav.chkX = m.x;
  nav.chkY = m.y;
  nav.chkAt = now;
}

/**
 * Chọn điểm cần hướng tới (`NAV_OUT`) khi quái MUỐN đi tới (tx, ty) (người đang đuổi, hoặc chỗ sinh khi về nhà) trong khi đi được tốc độ > 0. `goalR`: đứng cách đích chừng này là đủ
 * (tầm đánh). Trả số ms đã kẹt (cộng dồn); người gọi quyết định rút.
 */
export function navSteer(
  w: World,
  id: string,
  m: Monster,
  mc: MonsterCtrl,
  tx: number,
  ty: number,
  goalR: number,
): number {
  const nav = (mc.nav ??= newNav(m, w.now));
  NAV_OUT.x = tx;
  NAV_OUT.y = ty;
  trackStuck(nav, m, w.now);
  const map = w.map;
  const r = mc.def.radius * 0.8;

  // Đường thẳng thông thì đi thẳng như cũ (kiểm theo chu kỳ)
  if (w.now - nav.losAt >= LOS_MS) {
    nav.losAt = w.now;
    nav.los = lineClear(map, m.x, m.y, tx, ty, r, mc.def.radius + 8);
  }
  if (nav.los) {
    nav.pts = null;
    return nav.stuckMs;
  }

  // Bị chặn: cần đường. Tìm lại khi chưa có, đích dịch xa, hoặc vừa kẹt đủ lâu để thử lối khác
  const goalMoved = nav.pts !== null && Math.hypot(tx - nav.gx, ty - nav.gy) > 2 * NAV_CELL;
  const reroute = nav.stuckMs >= STUCK_REROUTE_MS && !nav.rerouted && nav.pts !== null;
  if ((nav.pts === null || goalMoved || reroute) && w.now >= nav.repathAt) {
    if (mc.boss || w.navBudget > 0) {
      if (!mc.boss) w.navBudget--;
      let avoid: { x: number; y: number; r: number } | undefined;
      if (reroute) {
        // Thử lối khác: điểm đang cố tới (không phải điểm cuối) coi như vật chặn
        const pts = nav.pts!;
        const n = pts.length >> 1;
        const k = Math.min(nav.i, n - 1);
        if (k < n - 1 || Math.hypot(pts[2 * k] - tx, pts[2 * k + 1] - ty) > goalR + REROUTE_AVOID_R)
          avoid = { x: pts[2 * k], y: pts[2 * k + 1], r: REROUTE_AVOID_R };
        nav.rerouted = true;
      }
      const res = findPath(map, r, m.x, m.y, tx, ty, goalR, avoid);
      // Lệch pha theo id để nhiều con không cùng tìm một tick
      nav.repathAt =
        w.now + NAV_REPATH_MS + ((id.length * 37 + (id.charCodeAt(id.length - 1) | 0)) % 100);
      if (res) {
        nav.pts = res.pts;
        nav.i = 0;
        nav.partial = !res.reached;
      } else nav.pts = null; // không có nút thông gần chỗ đứng: đi thẳng như cũ
      nav.gx = tx;
      nav.gy = ty;
    }
  }

  const pts = nav.pts;
  if (pts === null) return nav.stuckMs;
  // Bám đường: sang điểm kế khi tới gần; nhìn thấy điểm xa hơn (tới 3 điểm) thì cắt thẳng tới đó
  const n = pts.length >> 1;
  while (
    nav.i < n - 1 &&
    Math.hypot(pts[2 * nav.i] - m.x, pts[2 * nav.i + 1] - m.y) < NAV_ARRIVE_PX
  )
    nav.i++;
  for (let j = Math.min(n - 1, nav.i + 3); j > nav.i; j--) {
    if (lineClear(map, m.x, m.y, pts[2 * j], pts[2 * j + 1], r, mc.def.radius + 8)) {
      nav.i = j;
      break;
    }
  }
  const last =
    nav.i === n - 1 && Math.hypot(pts[2 * nav.i] - m.x, pts[2 * nav.i + 1] - m.y) < NAV_ARRIVE_PX;
  if (!last) {
    NAV_OUT.x = pts[2 * nav.i];
    NAV_OUT.y = pts[2 * nav.i + 1];
  }
  return nav.stuckMs;
}
