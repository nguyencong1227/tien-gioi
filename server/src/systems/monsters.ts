// Quái: sinh, bổ sung, AI (lang thang, phát hiện, đuổi, tấn công, về nhà).
import { PLAYER_RADIUS, MONSTERS, MONSTER_CAP, type MonsterKind } from "@tien-gioi/shared";
import { Monster } from "../schema";
import { rand, quantAngle, takeWhole, type World, type MonsterCtrl } from "../world";
import { hurtPlayer } from "./combat";

const LEASH_DIST = 520; // kéo quá xa nhà thì bỏ mục tiêu
const WANDER_RADIUS = 90;
const RETURN_HOME_DIST = 200;
const MAX_SPAWN_PER_TOPUP = 3;
/**
 * Không có người chơi nào trong khoảng này thì quái "ngủ": không lang thang. Lớn hơn nửa màn hình máy tính
 * (~770 px) nên người chơi không bao giờ thấy quái đứng hình. Quái lang thang chỗ không ai nhìn
 * vẫn tốn CPU và mỗi tick gửi vị trí mới cho mọi client: 88 con ≈ 900 byte/tick dù không có ai chơi.
 */
export const MONSTER_WAKE_DIST = 900;

/**
 * Quái KHÔNG có mục tiêu (lang thang, về nhà) chỉ áp bước di chuyển mỗi WANDER_STRIDE tick, với bước dài gấp bấy nhiêu lần:
 * tốc độ trung bình y hệt, nhưng vị trí trong state chỉ đổi 1/WANDER_STRIDE số lần (#80). Quái chạy chậm (~1 px/tick) và client
 * nội suy vị trí quái nên không nhìn ra; quái có mục tiêu (đang đuổi / đánh) vẫn di chuyển mỗi tick.
 * Vị trí thật vẫn nằm trong state (không tách vị trí mô phỏng) nên các system khác đọc `m.x`, `m.y` như cũ.
 */
export const WANDER_STRIDE = 4;

export function spawnMonster(w: World, def: MonsterKind) {
  const map = w.map;
  for (let i = 0; i < 40; i++) {
    const x = rand(64, map.worldW - 64),
      y = rand(64, map.worldH - 64);
    const d = map.dangerAt(x, y);
    if (d < def.minDanger || (def.id === "tho" && d > 0.45)) continue;
    if (map.inTown(x, y, 160) || map.circleBlocked(x, y, def.radius)) continue;
    const id = `m${++w.monsterSeq}`;
    const m = new Monster();
    m.kind = def.id;
    m.x = x;
    m.y = y;
    m.hp = def.hp;
    m.maxHp = def.hp;
    w.state.monsters.set(id, m);
    w.mctrl.set(id, {
      def,
      homeX: x,
      homeY: y,
      target: null,
      nextAttack: 0,
      wanderX: x,
      wanderY: y,
      nextWander: 0,
      damageBy: new Map(),
      hpFrac: 0,
      // Lệch pha theo số thứ tự để quái không cùng nhúc nhích một tick (không dùng random: giữ nguyên chuỗi của bench có seed)
      strideLeft: w.monsterSeq % WANDER_STRIDE,
    });
    return;
  }
}

/** Sinh đủ số quái mỗi loại khi tạo thế giới. */
export function spawnInitial(w: World) {
  for (const def of MONSTERS) for (let i = 0; i < MONSTER_CAP[def.id]; i++) spawnMonster(w, def);
}

/** Bổ sung quái bị giết, mỗi lần tối đa vài con mỗi loại. */
export function topUpMonsters(w: World) {
  const count: Record<string, number> = {};
  for (const m of w.state.monsters.values()) count[m.kind] = (count[m.kind] ?? 0) + 1;
  for (const def of MONSTERS) {
    const missing = MONSTER_CAP[def.id] - (count[def.id] ?? 0);
    for (let i = 0; i < Math.min(missing, MAX_SPAWN_PER_TOPUP); i++) spawnMonster(w, def);
  }
}

/** Bỏ mục tiêu của mọi con quái đang nhắm vào người chơi này (khi rời phòng). */
export function forgetTarget(w: World, sid: string) {
  for (const m of w.mctrl.values()) if (m.target === sid) m.target = null;
}

export function tickMonsters(w: World, dt: number) {
  w.state.monsters.forEach((m, id) => {
    const mc = w.mctrl.get(id);
    if (mc) updateMonster(w, id, m, mc, dt);
  });
}

function updateMonster(w: World, id: string, m: Monster, mc: MonsterCtrl, dt: number) {
  const def = mc.def;
  let tx = mc.wanderX,
    ty = mc.wanderY,
    speed = def.speed * 0.35;

  // Bỏ mục tiêu nếu đã chết, vào trấn, hoặc kéo quá xa
  let target = mc.target ? w.state.players.get(mc.target) : undefined;
  if (
    target &&
    (target.dead ||
      w.map.inTown(target.x, target.y, 20) ||
      Math.hypot(m.x - mc.homeX, m.y - mc.homeY) > LEASH_DIST)
  ) {
    mc.target = null;
    target = undefined;
    mc.damageBy.clear();
  }
  // Không có mục tiêu: tìm người chơi gần nhất (để gây hấn, và để biết có nên "ngủ" không)
  let nearest = Infinity;
  if (!target) {
    let best = def.aggro; // aggro 0 (quái hiền) thì không bao giờ chọn mục tiêu
    w.state.players.forEach((p, sid) => {
      if (p.dead) return;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < nearest) nearest = d;
      if (d < best && !w.map.inTown(p.x, p.y, 20)) {
        best = d;
        mc.target = sid;
        target = p;
      }
    });
  }

  if (target) {
    const d = Math.hypot(target.x - m.x, target.y - m.y);
    tx = target.x;
    ty = target.y;
    speed = def.speed;
    if (d <= def.attackRange + PLAYER_RADIUS) {
      speed = 0;
      const aim = Math.atan2(target.y - m.y, target.x - m.x);
      m.angle = quantAngle(aim);
      if (w.now >= mc.nextAttack) {
        mc.nextAttack = w.now + def.attackCd;
        w.events.fx({ kind: "mslash", by: id, x: m.x, y: m.y, angle: aim });
        hurtPlayer(w, mc.target!, target, Math.round(def.atk * rand(0.85, 1.15)), m);
      }
    }
  } else {
    // Đang đi về nhà hoặc lang thang
    if (Math.hypot(m.x - mc.homeX, m.y - mc.homeY) > RETURN_HOME_DIST) {
      tx = mc.homeX;
      ty = mc.homeY;
      speed = def.speed * 0.8;
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

  // Không có mục tiêu: chỉ áp bước di chuyển mỗi WANDER_STRIDE tick (bước dài gấp WANDER_STRIDE lần)
  let stride = 1;
  if (target) {
    mc.strideLeft = 0;
  } else if (mc.strideLeft > 0) {
    mc.strideLeft--;
    return;
  } else {
    mc.strideLeft = WANDER_STRIDE - 1;
    stride = WANDER_STRIDE;
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
    if (!w.map.inTown(next.x, next.y, def.radius + 8)) {
      m.x = next.x;
      m.y = next.y;
    }
    m.angle = quantAngle(Math.atan2(dy, dx));
  }
}
