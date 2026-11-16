// Di chuyển của người chơi: nhận input, áp từng bước TICK_MS, chọn chỗ đứng an toàn.
import { TICK_MS, PLAYER_RADIUS, statsFor, type GameMap, type InputMsg } from "@tien-gioi/shared";
import type { Player } from "../schema";
import { rand, quantAngle, type World, type PlayerCtrl } from "../world";

/**
 * BACKLOG tối đa còn lại SAU khi đã dùng hết ngân sách bước của tick (mục 41 QUYET_DINH_M3, "trôi như liệt phím"): 5 input = 0,25 giây. Mạng nhà đứng rồi xả dồn
 * làm hàng đợi đầy input CŨ; trước đây (tới 60 input = 3 giây) máy chủ cứ áp hết nên nhân vật còn đi tiếp tới ~3 giây SAU KHI người chơi đã nhả phím. Nay input CŨ NHẤT
 * vượt mức này bị BỎ (giữ thứ tự `seq`; client đối chiếu theo `lastSeq` nên tự hấp thụ phần bị kéo lại). Cái giá: một lần mạng đứng LÂU (hơn ngân sách bước 0,5 giây + 0,25 giây
 * này) làm nhân vật bị kéo lại một đoạn thay vì trôi tiếp: người chơi đã chọn đúng đổi này.
 */
export const MAX_INPUT_BACKLOG = 5;
/**
 * Chặn CỨNG bộ nhớ lúc nhận (client gian lận gửi hàng nghìn tin trong một nhịp): đầy thì bỏ input CŨ NHẤT. Phần lớn việc cắt backlog làm ở `applyInputs` (theo ngân sách
 * bước thật); hằng số này chỉ để hàng đợi không phình giữa hai tick.
 */
const INPUT_QUEUE_HARD_CAP = 64;
/**
 * Input "dừng" (độ dài hướng <= ngưỡng này: khớp ngưỡng `len > 0.05` của `applyInputs`, client gửi `dx = dy = 0`): máy chủ CẮT hàng đợi còn tối đa `STOP_KEEP_INPUTS` input
 * cũ nhất rồi mới xếp input dừng vào, nên nhả phím thì nhân vật dừng trong <= (STOP_KEEP_INPUTS + 1) tick = 0,15 giây dù hàng đợi đang đầy. Giữ lại 1-2 input cũ nhất vì
 * ở mạng tốt luôn có 1-2 input "đang bay" mà client đã đoán trước: xoá sạch thì mỗi lần dừng nhân vật bị kéo giật lùi 1-2 bước (7-15 px) dù không có chuyện gì.
 */
const STOP_LEN = 0.05;
export const STOP_KEEP_INPUTS = 2;
/**
 * Ngân sách bước tối đa dồn lại (mỗi bước = một TICK_MS thời gian thật). Ngân sách tích khi không có input (mạng chậm gói, rồi gói ập tới
 * cùng lúc): 10 bước = 0,5 giây bù trễ mà không phải dồn hàng đợi. Cũng là mức "nhảy cóc" tối đa của client gian lận (đứng im 0,5 giây rồi gửi
 * dồn): tốc độ bền vững vẫn đúng 1 bước / TICK_MS thời gian thật.
 */
const MAX_MOVE_BUDGET = 10;
/** Sai số cộng dồn số thực: 0,9999999999 bước coi như đủ một bước (dt chia cho TICK_MS không luôn tròn). */
const BUDGET_EPS = 1 - 1e-9;

/**
 * Nhận input từ client; bỏ qua dữ liệu sai kiểu. Input DỪNG (`dx = dy = 0`) cắt hàng đợi còn `STOP_KEEP_INPUTS` input cũ nhất (xem trên); đầy `INPUT_QUEUE_HARD_CAP` thì bỏ
 * input cũ nhất. Mọi input bị bỏ tính vào `World.inputStats.dropped`.
 */
export function queueInput(w: World, sid: string, m: InputMsg | undefined) {
  const c = w.ctrl.get(sid);
  if (!c || typeof m?.seq !== "number" || !Number.isFinite(m.dx) || !Number.isFinite(m.dy)) return;
  if (Math.hypot(m.dx, m.dy) <= STOP_LEN && c.inputs.length > STOP_KEEP_INPUTS) {
    w.inputStats.dropped += c.inputs.length - STOP_KEEP_INPUTS;
    c.inputs.length = STOP_KEEP_INPUTS;
  }
  c.inputs.push({ seq: m.seq >>> 0, dx: m.dx, dy: m.dy });
  if (c.inputs.length > INPUT_QUEUE_HARD_CAP) {
    c.inputs.shift();
    w.inputStats.dropped++;
  }
}

/** Hàng đợi còn từng này input (0,2 giây) sau khi xử lý một tick thì tính là "tụt hậu" (`World.inputStats.backlogTicks`). Input chờ 1-2 là bình thường (đang bay); tối đa còn `MAX_INPUT_BACKLOG`. */
export const INPUT_BACKLOG_WARN = 4;

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

/**
 * Áp các input đang chờ. Mỗi input = đúng một bước TICK_MS (client đoán trước y hệt).
 * Token bucket theo THỜI GIAN THẬT: mỗi tick cộng `dtMs / TICK_MS` bước (tối đa MAX_MOVE_BUDGET), nên gửi dồn dập cũng không đi nhanh hơn được.
 * Cộng theo thời gian thật chứ không "+1 mỗi tick": `setInterval(50)` của Node chạy thật ~19,9 Hz (và tick bị trễ khi máy bận), trong khi client
 * gửi đúng 20 Hz, nên cộng cố định mỗi tick làm hàng đợi tụt hậu thêm ~1 input / 12 giây, đầy sau ~4 phút đi liên tục rồi bỏ input, nhân vật
 * giật lùi (đo bằng `scripts/do-input-lag.ts`, mục 25 QUYET_DINH_M3). `dtMs` mặc định TICK_MS (test đơn vị, bench).
 * Trước khi áp: input CŨ NHẤT vượt (số bước áp được tick này + `MAX_INPUT_BACKLOG`) bị BỎ (mục 41): bước nào không áp kịp trong 0,25 giây thì không áp nữa.
 * Trả số input đã bỏ (người gọi cộng vào `World.inputStats.dropped`).
 */
export function applyInputs(
  map: GameMap,
  p: Player,
  c: PlayerCtrl,
  dtMs: number = TICK_MS,
): number {
  const step = TICK_MS / 1000;
  // dt sai (NaN, âm) thì coi như một tick đúng nhịp; dt lớn (máy chủ bị treo) bị MAX_MOVE_BUDGET chặn
  const credit = Number.isFinite(dtMs) && dtMs >= 0 ? dtMs / TICK_MS : 1;
  c.moveBudget = Math.min(MAX_MOVE_BUDGET, c.moveBudget + credit);
  // Giới hạn độ trễ: chỉ giữ số input áp được ngay tick này (theo ngân sách) cộng `MAX_INPUT_BACKLOG` chờ tick sau; cũ nhất bỏ trước (giữ thứ tự seq)
  const keep = Math.floor(c.moveBudget + (1 - BUDGET_EPS)) + MAX_INPUT_BACKLOG;
  const dropped = c.inputs.length > keep ? c.inputs.length - keep : 0;
  if (dropped > 0) c.inputs.splice(0, dropped);
  // hộ phù có tốc độ; tăng tốc / tê cóng nhân thêm `moveSpeedMul` (bản nhớ trong `c.moveMul`, client dùng CÙNG hàm để đoán trước)
  const speed = statsFor(p.realm, p.tier, p).speed * (c.moveMul ?? 1);
  while (c.inputs.length && c.moveBudget >= BUDGET_EPS) {
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
  return dropped;
}

/**
 * Toạ độ NGUYÊN để ghi vào hồ sơ từ vị trí thật (số thực) của người chơi. Làm tròn thường (`Math.round`) có thể đẩy tâm vào tường tới
 * 0,5 px dù chỗ đứng thật hợp lệ (người đứng sát tường), làm hồ sơ bị `kiem-save` báo `pos_blocked` và lúc vào lại bị `safeSpot` đưa về trấn
 * (soak 30 phút `--m7`, #741). Nên: làm tròn thường nếu không bị chặn; không thì thử bốn góc `floor` / `ceil` và lấy điểm KHÔNG bị chặn gần
 * vị trí thật nhất; không điểm nào thì trả làm tròn thường (vị trí thật nằm trong tường: `safeSpot` xử lý lúc vào lại).
 */
export function savePos(map: GameMap, x: number, y: number): { x: number; y: number } {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!map.circleBlocked(rx, ry, PLAYER_RADIUS)) return { x: rx, y: ry };
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const cx of [Math.floor(x), Math.ceil(x)]) {
    for (const cy of [Math.floor(y), Math.ceil(y)]) {
      if (map.circleBlocked(cx, cy, PLAYER_RADIUS)) continue;
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
  }
  return best ?? { x: rx, y: ry };
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
