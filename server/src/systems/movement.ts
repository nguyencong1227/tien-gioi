// Di chuyển của người chơi: nhận input, áp từng bước TICK_MS, chọn chỗ đứng an toàn.
import {
  TICK_MS,
  PLAYER_RADIUS,
  TOWN_PX,
  moveWithCollision,
  circleBlocked,
  statsFor,
  type InputMsg,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { rand, type World, type PlayerCtrl } from "../world";

const MAX_QUEUED_INPUTS = 20;
const MAX_MOVE_BUDGET = 4;

/** Nhận input từ client; bỏ qua dữ liệu sai kiểu. */
export function queueInput(w: World, sid: string, m: InputMsg | undefined) {
  const c = w.ctrl.get(sid);
  if (!c || typeof m?.seq !== "number" || !Number.isFinite(m.dx) || !Number.isFinite(m.dy)) return;
  if (c.inputs.length < MAX_QUEUED_INPUTS) c.inputs.push({ seq: m.seq >>> 0, dx: m.dx, dy: m.dy });
}

/**
 * Áp các input đang chờ. Mỗi input = đúng một bước TICK_MS (client đoán trước y hệt).
 * Token bucket: mỗi tick +1, tối đa 4, nên gửi dồn dập cũng không đi nhanh hơn được.
 */
export function applyInputs(p: Player, c: PlayerCtrl) {
  const step = TICK_MS / 1000;
  c.moveBudget = Math.min(MAX_MOVE_BUDGET, c.moveBudget + 1);
  const speed = statsFor(p.realm, p.tier, p).speed; // hộ phù có tốc độ
  while (c.inputs.length && c.moveBudget >= 1) {
    const inp = c.inputs.shift()!;
    c.moveBudget -= 1;
    let { dx, dy } = inp;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    if (len > 0.05) {
      p.meditating = false;
      const next = moveWithCollision(p.x, p.y, dx * speed * step, dy * speed * step, PLAYER_RADIUS);
      p.x = next.x;
      p.y = next.y;
      p.angle = Math.atan2(dy, dx);
    }
    p.lastSeq = inp.seq;
  }
}

/** Vị trí đã lưu nếu còn hợp lệ, không thì một điểm ngẫu nhiên trong Lạc Hà Trấn. */
export function safeSpot(x?: number, y?: number) {
  if (typeof x === "number" && typeof y === "number" && !circleBlocked(x, y, PLAYER_RADIUS))
    return { x, y };
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2),
      r = rand(0, TOWN_PX.r * 0.6);
    const sx = TOWN_PX.x + Math.cos(a) * r,
      sy = TOWN_PX.y + Math.sin(a) * r;
    if (!circleBlocked(sx, sy, PLAYER_RADIUS)) return { x: sx, y: sy };
  }
  return { x: TOWN_PX.x, y: TOWN_PX.y };
}
