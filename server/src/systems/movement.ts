// Di chuyển của người chơi: nhận input, áp từng bước TICK_MS, chọn chỗ đứng an toàn.
import { TICK_MS, PLAYER_RADIUS, statsFor, type GameMap, type InputMsg } from "@tien-gioi/shared";
import type { Player } from "../schema";
import { rand, quantAngle, type World, type PlayerCtrl } from "../world";

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
/**
 * Người khác nhận vị trí công khai px, py (số nguyên, 10 Hz) thay vì x, y thật 20 Hz (#80): ở 100 người tụ trong trấn
 * việc đó cắt gần một nửa byte. Client nội suy vị trí người khác nên không nhìn ra. Đổi hằng số này để chỉnh nhịp.
 */
export const POS_SYNC_EVERY_TICKS = 2;

const INT16_MAX = 32767;

/**
 * Ghi vị trí công khai (px, py) từ vị trí thật. Gán lại giá trị y hệt thì schema bỏ qua nên đứng yên không tốn byte.
 * Gọi ngay khi dịch chuyển tức thời (vào phòng, hồi sinh) để người khác không thấy nhân vật ở chỗ cũ / (0, 0);
 * còn lại do tickWorld gọi theo nhịp POS_SYNC_EVERY_TICKS (cũng tự chữa nếu chỗ nào đó gán `p.x` trực tiếp).
 */
export function syncPublicPos(p: Player) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  p.px = Math.max(-INT16_MAX, Math.min(INT16_MAX, Math.round(p.x)));
  p.py = Math.max(-INT16_MAX, Math.min(INT16_MAX, Math.round(p.y)));
}

export function applyInputs(map: GameMap, p: Player, c: PlayerCtrl) {
  const step = TICK_MS / 1000;
  c.moveBudget = Math.min(MAX_MOVE_BUDGET, c.moveBudget + 1);
  // hộ phù có tốc độ; tăng tốc / tê cóng nhân thêm `moveSpeedMul` (bản nhớ trong `c.moveMul`, client dùng CÙNG hàm để đoán trước)
  const speed = statsFor(p.realm, p.tier, p).speed * (c.moveMul ?? 1);
  while (c.inputs.length && c.moveBudget >= 1) {
    const inp = c.inputs.shift()!;
    c.moveBudget -= 1;
    let { dx, dy } = inp;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Choáng: vẫn TIÊU THỤ input và tăng `lastSeq` (chỉ không di chuyển) để hàng đợi dự đoán của client rỗng được, `reconcile` không chạy lại input cũ
    if (len > 0.05 && !c.stunned) {
      p.meditating = false;
      const next = map.moveWithCollision(
        p.x,
        p.y,
        dx * speed * step,
        dy * speed * step,
        PLAYER_RADIUS,
      );
      p.x = next.x;
      p.y = next.y;
      p.angle = quantAngle(Math.atan2(dy, dx));
    }
    p.lastSeq = inp.seq;
  }
}

/** Vị trí đã lưu nếu còn hợp lệ, không thì một điểm ngẫu nhiên trong Lạc Hà Trấn. */
export function safeSpot(map: GameMap, x?: number, y?: number) {
  const town = map.townPx;
  if (typeof x === "number" && typeof y === "number" && !map.circleBlocked(x, y, PLAYER_RADIUS))
    return { x, y };
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2),
      r = rand(0, town.r * 0.6);
    const sx = town.x + Math.cos(a) * r,
      sy = town.y + Math.sin(a) * r;
    if (!map.circleBlocked(sx, sy, PLAYER_RADIUS)) return { x: sx, y: sy };
  }
  return { x: town.x, y: town.y };
}
