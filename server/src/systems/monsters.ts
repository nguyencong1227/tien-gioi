// Quái: sinh, bổ sung, AI (lang thang, phát hiện, đuổi, tấn công, về nhà).
import {
  PLAYER_RADIUS,
  MONSTERS,
  inSpawnZone,
  type GameMap,
  type MonsterKind,
  type SpawnZoneDef,
} from "@tien-gioi/shared";
import type { Monster } from "../schema";
import { rand, quantAngle, takeWhole, type World, type MonsterCtrl } from "../world";
import { hurtPlayer } from "./combat";
import { rollElite } from "./elite";
import { placeMonster, WANDER_STRIDE } from "./monster-place";
import { bossReset, bossStep } from "./boss";
import { chargerStep } from "./charge";
import { cancelSlam, slamStep } from "./slam";
import { isRanged, onHitEffectOf, rangedStep } from "./bolt";
import { applyPlayerStatus } from "./status";
import { isStunned, speedMult, weakened } from "./status-rules";
import { inMainRegion, squareFree, warmNav } from "./nav";
import {
  EVADE_HOME_PX,
  NAV_OUT,
  NAV_SEARCHES_PER_TICK,
  STUCK_EVADE_MS,
  isEvading,
  isShunned,
  navIdle,
  navPause,
  navSteer,
  resetNav,
  snapHome,
  startEvade,
} from "./nav-chase";

const LEASH_DIST = 520; // kéo quá xa nhà thì bỏ mục tiêu
export { placeMonster, WANDER_STRIDE };
const WANDER_RADIUS = 90;
const RETURN_HOME_DIST = 200;
const MAX_SPAWN_PER_TOPUP = 3;
/**
 * Không có người chơi nào trong khoảng này thì quái "ngủ": không lang thang. Lớn hơn nửa màn hình máy tính
 * (~770 px) nên người chơi không bao giờ thấy quái đứng hình. Quái lang thang chỗ không ai nhìn
 * vẫn tốn CPU và mỗi tick gửi vị trí mới cho mọi client: 88 con ≈ 900 byte/tick dù không có ai chơi.
 */
export const MONSTER_WAKE_DIST = 900;

/** Trùm sinh cách ô chặn ít nhất chừng này (px) ngoài bán kính thân: không sát cây để khỏi kẹt ngay lúc sinh (mục 48). */
export const BOSS_SPAWN_MARGIN = 32;

/** Chỗ sinh của trùm đủ rộng: không sát cây / đá và nằm trong vùng chính của bản đồ cho cỡ thân của trùm (không nằm trong túi kín). */
export function bossSpawnOk(w: World, def: MonsterKind, x: number, y: number): boolean {
  return bossSpawnOkOn(w.map, def, x, y);
}

/** Như `bossSpawnOk` nhưng chỉ cần bản đồ (công cụ kiểm bản đồ không có `World`). */
export function bossSpawnOkOn(map: GameMap, def: MonsterKind, x: number, y: number): boolean {
  return (
    squareFree(map, x, y, def.radius + BOSS_SPAWN_MARGIN) &&
    inMainRegion(map, def.radius * 0.8, x, y)
  );
}

/**
 * Các loài cần dựng sẵn lưới tìm đường ở bản đồ của phòng: loài có ở đây theo `monsterCapOf` VÀ trùm thế giới của lịch (M9.4) sinh ở bản đồ này (loài đó thường KHÔNG có
 * `monsterCapOf` > 0, nên nếu không thêm thì lần sinh trùm theo giờ phải dựng mặt nạ + vùng chính ngay trong tick: vài chục ms, vượt ngân sách 10 ms).
 */
export function navKindsOf(w: World): MonsterKind[] {
  const kinds = MONSTERS.filter((d) => w.map.monsterCapOf(d.id) > 0);
  for (const slot of w.hub.worldBoss.slots) {
    if (slot.mapId !== w.map.def.id) continue;
    const def = MONSTERS.find((d) => d.id === slot.boss);
    if (def && !kinds.includes(def)) kinds.push(def);
  }
  return kinds;
}

/** Dựng sẵn lưới tìm đường cho các loài quái có ở bản đồ của phòng (một lần lúc tạo phòng, `nav.ts` `warmNav`). */
function warmMonsterNav(w: World) {
  const present = navKindsOf(w);
  warmNav(
    w.map,
    present.map((d) => d.radius * 0.8),
    present.filter((d) => d.boss).map((d) => d.radius * 0.8),
  );
}

/**
 * Khoảng cách tối thiểu (px) giữa hai con CÙNG loài lúc sinh, cho loài cần RẢI ĐỀU bản đồ (QUYET_DINH_M3 mục 32 / 54 / 56: Hắc Giao 6 con ở Âm Sương Trạch không được dồn một chỗ hay
 * quanh cổng). Đo trên bản đồ thật: vùng sinh hợp lệ của Hắc Giao ~4.800 điểm trải khắp bản đồ (chỉ ~2 % trong 500 px quanh cổng), ~17 con cách nhau >= 700 px chứa được, nên 6 con xếp được.
 * Hết lượt thử mà chưa có chỗ thì KHÔNG sinh lần này (`topUpMonsters` thử lại nhịp sau), không nới khoảng cách.
 */
export const SPAWN_SPREAD_PX: Readonly<Record<string, number>> = { hac_giao: 700 };
const SPREAD_TRIES = 400;

/** Đã có con CÙNG loài trong vòng `r` px quanh (x, y) chưa. */
function sameKindNear(w: World, kind: string, x: number, y: number, r: number): boolean {
  for (const m of w.state.monsters.values()) {
    if (m.kind === kind && Math.hypot(m.x - x, m.y - y) < r) return true;
  }
  return false;
}

/** Diện tích thật của vùng (px²): elip bằng pi/4 khung. Dùng làm trọng số chọn vùng nên con số tương đối mới quan trọng. */
function zoneArea(z: SpawnZoneDef): number {
  return z.shape === "rect" ? z.w * z.h : (Math.PI / 4) * z.w * z.h;
}

/** Số con CÙNG loài đang đứng trong vùng `z` (để áp `max` của vùng). Trùm thế giới (M9.4) là THÊM, không chiếm chỗ `max` (như `topUpMonsters`). */
function countInZone(w: World, z: SpawnZoneDef): number {
  let n = 0;
  w.state.monsters.forEach((m, id) => {
    if (id !== w.wbossId && m.kind === z.monster && inSpawnZone(z, m.x, m.y)) n++;
  });
  return n;
}

export interface ZoneSpotOpts {
  /** Khoảng cách tối thiểu tới con cùng loài (xem `SPAWN_SPREAD_PX`) */
  spread?: number;
  /** Bỏ qua `max` của vùng: trùm thế giới là THÊM, không chiếm chỗ của quái thường */
  ignoreMax?: boolean;
}

/**
 * Chọn chỗ sinh cho loài `def` trong các VÙNG SINH dữ liệu của bản đồ (S5, `GameMap.spawnZonesOf`; gọi khi loài có ít nhất một vùng). Chọn vùng theo diện tích trong số vùng còn chỗ
 * (`max`), bốc điểm trong khung rồi lọc: đúng hình vùng, không đè ô chặn, ngoài khu an toàn (cùng đệm 160 px như cách cũ), trùm thì thêm `bossSpawnOk`. KHÔNG xét `dangerAt` / `minDanger`:
 * vùng do người soạn đặt là quyết định rõ ràng. Hết lượt thử (vùng đầy, chật, rải đều không được) thì `null`: lần này KHÔNG sinh, không rơi về cách cũ (`topUpMonsters` thử lại nhịp sau),
 * vì rơi về cách cũ sẽ đặt quái ra ngoài vùng người soạn đã giới hạn.
 */
export function zoneSpawnSpot(
  w: World,
  def: MonsterKind,
  zones: readonly SpawnZoneDef[],
  opts: ZoneSpotOpts = {},
): { x: number; y: number } | null {
  const map = w.map;
  const open = zones.filter(
    (z) => opts.ignoreMax || z.max === undefined || countInZone(w, z) < z.max,
  );
  if (open.length === 0) return null;
  let total = 0;
  for (const z of open) total += zoneArea(z);
  for (const strict of def.boss ? [true, false] : [false]) {
    const tries = opts.spread !== undefined ? SPREAD_TRIES : strict ? 200 : 40;
    for (let i = 0; i < tries; i++) {
      let pick = rand(0, total);
      let z = open[open.length - 1]!;
      for (const c of open) {
        pick -= zoneArea(c);
        if (pick < 0) {
          z = c;
          break;
        }
      }
      const x = z.x + rand(0, z.w);
      const y = z.y + rand(0, z.h);
      if (!inSpawnZone(z, x, y)) continue;
      if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
      if (strict && !bossSpawnOk(w, def, x, y)) continue;
      if (opts.spread !== undefined && sameKindNear(w, def.id, x, y, opts.spread)) continue;
      return { x, y };
    }
  }
  return null;
}

export function spawnMonster(w: World, def: MonsterKind) {
  const map = w.map;
  const spread = Object.prototype.hasOwnProperty.call(SPAWN_SPREAD_PX, def.id)
    ? SPAWN_SPREAD_PX[def.id]
    : undefined;
  // Bản đồ khai VÙNG SINH cho loài này (S5): chỉ sinh trong vùng; không khai thì cách cũ dưới đây (không đổi hành vi, không thêm `Math.random`)
  const zones = map.spawnZonesOf(def.id);
  if (zones.length > 0) {
    const spot = zoneSpawnSpot(w, def, zones, { spread });
    if (spot) placeMonster(w, def, spot.x, spot.y, rollElite(w, def));
    return;
  }
  // Trùm khó tìm chỗ hơn (vòng ngoài xa trấn + rộng + thuộc vùng chính): thử nhiều lần; không thấy chỗ rộng nào thì quay về luật cũ (còn hơn thiếu trùm: bản đồ thật còn > 1000 chỗ rộng, test giữ)
  for (const strict of def.boss ? [true, false] : [false]) {
    const tries = spread !== undefined ? SPREAD_TRIES : strict ? 200 : 40;
    for (let i = 0; i < tries; i++) {
      const x = rand(64, map.worldW - 64),
        y = rand(64, map.worldH - 64);
      const d = map.dangerAt(x, y);
      if (d < def.minDanger || (def.id === "tho" && d > 0.45)) continue;
      if (map.inSafe(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
      if (strict && !bossSpawnOk(w, def, x, y)) continue;
      if (spread !== undefined && sameKindNear(w, def.id, x, y, spread)) continue; // rải đều (mục 32 / 54)
      placeMonster(w, def, x, y, rollElite(w, def));
      return;
    }
  }
}

/** Sinh đủ số quái mỗi loại khi tạo thế giới (số lượng theo bản đồ của phòng: `GameMap.monsterCapOf`). */
export function spawnInitial(w: World) {
  warmMonsterNav(w);
  for (const def of MONSTERS)
    for (let i = 0; i < w.map.monsterCapOf(def.id); i++) spawnMonster(w, def);
}

/**
 * Quái của một phòng bí cảnh: trùm đúng MỘT con, đặt ở tâm hang (`GameMap.lairPx`) nên đội biết đường tới và test giữ được
 * vị trí; quái nhỏ rải theo `monsterCap` như thường. Không có hang thì trùm rải như quái khác. Quái nhỏ không hồi sinh
 * (phòng bí cảnh không gọi `topUpMonsters`).
 */
export function spawnDungeonMonsters(w: World) {
  warmMonsterNav(w);
  const lair = w.map.lairPx;
  for (const def of MONSTERS) {
    const cap = w.map.monsterCapOf(def.id);
    if (def.boss && lair) {
      if (cap > 0) placeMonster(w, def, lair.x, lair.y);
      continue;
    }
    for (let i = 0; i < cap; i++) spawnMonster(w, def);
  }
}

/** Bổ sung quái bị giết, mỗi lần tối đa vài con mỗi loại. */
export function topUpMonsters(w: World) {
  const count: Record<string, number> = {};
  w.state.monsters.forEach((m, id) => {
    if (id !== w.wbossId) count[m.kind] = (count[m.kind] ?? 0) + 1; // trùm thế giới (M9.4) là thêm, không thay một con thường
  });
  for (const def of MONSTERS) {
    const missing = w.map.monsterCapOf(def.id) - (count[def.id] ?? 0);
    for (let i = 0; i < Math.min(missing, MAX_SPAWN_PER_TOPUP); i++) spawnMonster(w, def);
  }
}

/** Bỏ mục tiêu của mọi con quái đang nhắm vào người chơi này (khi rời phòng). */
export function forgetTarget(w: World, sid: string) {
  for (const m of w.mctrl.values()) if (m.target === sid) m.target = null;
}

export function tickMonsters(w: World, dt: number) {
  w.navBudget = NAV_SEARCHES_PER_TICK; // tìm đường của quái thường chia chung từng này lần mỗi tick (trùm không giới hạn), `nav-chase.ts`
  w.state.monsters.forEach((m, id) => {
    const mc = w.mctrl.get(id);
    if (mc) updateMonster(w, id, m, mc, dt);
  });
}

function updateMonster(w: World, id: string, m: Monster, mc: MonsterCtrl, dt: number) {
  const def = mc.def;
  // Trạng thái (M7.2b): choáng = đứng im và không ra đòn, tê cóng làm chậm. Quái không dính gì thì `mc.st` là undefined (không tốn gì).
  const st = mc.st !== undefined && mc.st.list.length > 0 ? mc.st : undefined;
  const stunned = st !== undefined && isStunned(st, w.now);
  // Rút về (mục 48, `nav-chase.ts`): đang rút thì không nhắm ai, về chỗ sinh; rút quá lâu thì đặt thẳng về chỗ sinh
  if (mc.nav !== undefined && mc.nav.evadeUntil > 0 && w.now >= mc.nav.evadeUntil)
    snapHome(w, m, mc);
  const evading = isEvading(w, mc);
  if (evading && mc.target) {
    mc.target = null;
    mc.damageBy.clear();
  }
  let tx = mc.wanderX,
    ty = mc.wanderY,
    speed = def.speed * 0.35;

  // Bỏ mục tiêu nếu đã chết, vào trấn, hoặc kéo quá xa
  let target = mc.target ? w.state.players.get(mc.target) : undefined;
  if (
    target &&
    (target.dead ||
      (w.ghosts.size > 0 && w.ghosts.has(mc.target!)) ||
      (w.shielded.size > 0 && w.shielded.has(mc.target!)) || // hộ thể sau nối lại: quái bỏ mục tiêu (mục 33)
      (w.duels.active && w.duels.has(mc.target!)) ||
      w.map.inSafe(target.x, target.y, 20) ||
      Math.hypot(m.x - mc.homeX, m.y - mc.homeY) > LEASH_DIST)
  ) {
    mc.target = null;
    target = undefined;
    mc.damageBy.clear();
  }
  // Không có mục tiêu: tìm người chơi gần nhất (để gây hấn, và để biết có nên "ngủ" không)
  let nearest = Infinity;
  if (!target && !evading) {
    let best = def.aggro; // aggro 0 (quái hiền) thì không bao giờ chọn mục tiêu
    w.state.players.forEach((p, sid) => {
      if (p.dead) return;
      if (mc.nav !== undefined && isShunned(w, mc, sid)) return; // vừa kẹt vì người này (đứng chỗ không tới được): không nhắm lại ngay (mục 48)
      if (w.ghosts.size > 0 && w.ghosts.has(sid)) return; // hồn lìa xác: quái không thấy
      if (w.shielded.size > 0 && w.shielded.has(sid)) return; // đang hộ thể: quái không nhắm (mục 33)
      if (w.duels.active && w.duels.has(sid)) return; // đang thách đấu: quái không thấy
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < nearest) nearest = d;
      if (d < best && !w.map.inSafe(p.x, p.y, 20)) {
        best = d;
        mc.target = sid;
        target = p;
      }
    });
  }

  let inReach = false; // đã trong tầm đánh gần của mục tiêu (đứng đánh, không phải kẹt)
  let seeking = false; // đang đi tới người (đuổi) hoặc về chỗ sinh: nơi áp tìm đường / đo kẹt (đặt ở chỗ chọn đích, không dò lại bằng so sánh số thực)
  if (target) {
    const d = Math.hypot(target.x - m.x, target.y - m.y);
    inReach = d <= def.attackRange + PLAYER_RADIUS;
    tx = target.x;
    ty = target.y;
    seeking = true;
    speed = def.speed;
    if (mc.boss) {
      // Trùm nhiều chiêu (mục 42, `boss.ts`): bộ chiêu bằng dữ liệu thay hẳn đập đất / lao của loài đó (một chiêu một lúc). Đang gầm / vận chiêu thì đứng yên, không đánh thường.
      if (bossStep(w, id, m, mc, target, d, dt)) speed = 0;
      else if (d <= def.attackRange + PLAYER_RADIUS) {
        speed = 0;
        const aim = Math.atan2(target.y - m.y, target.x - m.x);
        m.angle = quantAngle(aim);
        if (!stunned && w.now >= mc.nextAttack) {
          mc.nextAttack = w.now + def.attackCd;
          w.events.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle: aim });
          const dmg = weakened(mc, w.now, Math.round(def.atk * mc.boss.atk * rand(0.85, 1.15))); // `weaken` (mục 51): quái yếu đi
          const eff = onHitEffectOf(def);
          if (hurtPlayer(w, mc.target!, target, dmg, m) && eff)
            applyPlayerStatus(w, mc.target!, eff, dmg, "");
        }
      }
    } else if (def.slam && slamStep(w, id, m, mc, d, stunned)) {
      // Đang gồng đập đất / vừa đáp đòn (M7.3, `slam.ts`): đứng yên, không đánh thường, không lao
      speed = 0;
    } else if (def.behavior === "charger" && chargerStep(w, id, m, mc, target, d, stunned)) {
      // Đang gồng (báo trước) hoặc thở sau khi lao: đứng yên, không đánh thường (M7.3, `charge.ts`)
      speed = 0;
    } else if (isRanged(def)) {
      // Tầm xa (M7.3, `bolt.ts`): đứng bắn / lùi / đuổi tới tầm bắn; không đánh gần
      const mv = rangedStep(w, m, mc, target, d, stunned);
      tx = mv.tx;
      seeking = mv.tx === target.x && mv.ty === target.y; // tầm xa: chỉ khi đang TIẾN tới người (lui / đứng bắn thì không)
      ty = mv.ty;
      speed = mv.speed;
    } else if (d <= def.attackRange + PLAYER_RADIUS) {
      speed = 0;
      const aim = Math.atan2(target.y - m.y, target.x - m.x);
      m.angle = quantAngle(aim);
      if (!stunned && w.now >= mc.nextAttack) {
        mc.nextAttack = w.now + def.attackCd;
        w.events.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle: aim });
        const dmg = weakened(mc, w.now, Math.round(def.atk * rand(0.85, 1.15))); // `weaken` (mục 51)
        const eff = onHitEffectOf(def);
        // Đòn gần của `poisoner` (M7.3): trúng thì gắn thêm độc; quái thường không đụng tới `status`
        if (hurtPlayer(w, mc.target!, target, dmg, m) && eff)
          applyPlayerStatus(w, mc.target!, eff, dmg, "");
      }
    }
  } else {
    mc.ai = undefined; // mất mục tiêu giữa lúc gồng / thở: bỏ đòn đang dở
    cancelSlam(mc);
    if (mc.boss) bossReset(w, m, mc); // trùm đang trong trận mà hết mục tiêu: reset (hồi đầy, giai đoạn 0, bỏ quái con)
    // Đang đi về nhà hoặc lang thang. Đang RÚT (mục 48) thì về tới sát chỗ sinh, chạy hết tốc độ.
    const homeD = Math.hypot(m.x - mc.homeX, m.y - mc.homeY);
    if (evading && homeD <= EVADE_HOME_PX) resetNav(mc, m, w.now); // về tới nơi: hết rút
    if (evading ? homeD > EVADE_HOME_PX : homeD > RETURN_HOME_DIST) {
      tx = mc.homeX;
      ty = mc.homeY;
      seeking = true;
      speed = def.speed * (evading ? 1 : 0.8);
    } else if (nearest > MONSTER_WAKE_DIST) {
      // Ngủ: đứng yên tại chỗ, không ghi gì vào state ngoài hồi máu
      tx = m.x;
      ty = m.y;
    } else if (w.now >= mc.nextWander) {
      mc.nextWander = w.now + rand(2000, 6000);
      mc.wanderX = mc.homeX + rand(-WANDER_RADIUS, WANDER_RADIUS);
      mc.wanderY = mc.homeY + rand(-WANDER_RADIUS, WANDER_RADIUS);
    }
    // Hồi máu khi không giao chiến (chỉ ghi phần nguyên vào state, xem takeWhole)
    if (m.hp < m.maxHp) {
      const add = takeWhole(mc, "hpFrac", m.maxHp * 0.05 * dt);
      if (add) m.hp = Math.min(m.maxHp, m.hp + add);
    } else mc.hpFrac = 0;
  }

  if (mc.boss) speed *= mc.boss.mv; // giai đoạn / cuồng nộ: nhanh hơn
  if (st !== undefined) speed = stunned ? 0 : speed * speedMult(st, w.now);

  // Không có mục tiêu: chỉ áp bước di chuyển mỗi WANDER_STRIDE tick (bước dài gấp WANDER_STRIDE lần)
  let stride = 1;
  if (target || evading) {
    mc.strideLeft = 0;
  } else if (mc.strideLeft > 0) {
    mc.strideLeft--;
    return;
  } else {
    mc.strideLeft = WANDER_STRIDE - 1;
    stride = WANDER_STRIDE;
  }

  // Tìm đường / phát hiện kẹt (mục 48, `nav-chase.ts`): chỉ khi quái đang đi tới người (đuổi) hoặc về chỗ sinh; đường thẳng thông thì không đổi gì
  if (speed > 0) {
    const chasing = seeking && target !== undefined;
    if (seeking) {
      const goalR = chasing ? Math.max(8, def.attackRange + PLAYER_RADIUS - 6) : 24;
      const stuck = navSteer(w, id, m, mc, tx, ty, goalR);
      if (stuck >= STUCK_EVADE_MS) {
        if (chasing) {
          // Kẹt quá lâu (người đứng chỗ không tới được, hoặc không có lối): RÚT về chỗ sinh, trùm hồi đầy (mất mục tiêu -> `bossReset`)
          startEvade(w, mc, mc.target);
          mc.target = null;
          mc.damageBy.clear();
          mc.ai = undefined;
          cancelSlam(mc);
        } else snapHome(w, m, mc); // về nhà mà vẫn kẹt: đặt thẳng về
        return;
      }
      tx = NAV_OUT.x;
      ty = NAV_OUT.y;
    } else if (mc.nav !== undefined) navIdle(mc, m, w.now); // đi nhưng không phải tới người / về nhà (lui, lang thang): đang di chuyển, đo kẹt lại từ đầu
  } else if (mc.nav !== undefined) {
    // Đứng yên: đã tới tầm đánh thì đo kẹt lại từ đầu; còn lại (gồng, vận chiêu, gầm, choáng) thì chỉ TẠM DỪNG đo, không đặt lại
    if (inReach) navIdle(mc, m, w.now);
    else navPause(mc, m, w.now);
  }

  const dx = tx - m.x,
    dy = ty - m.y,
    dist = Math.hypot(dx, dy);
  if (speed > 0 && dist > 4) {
    const step = Math.min(dist, speed * dt * stride);
    const next = w.map.moveWithCollision(
      m.x,
      m.y,
      (dx / dist) * step,
      (dy / dist) * step,
      def.radius * 0.8,
    );
    if (!w.map.inSafe(next.x, next.y, def.radius + 8)) {
      m.x = next.x;
      m.y = next.y;
    }
    m.angle = quantAngle(Math.atan2(dy, dx));
  }
}
