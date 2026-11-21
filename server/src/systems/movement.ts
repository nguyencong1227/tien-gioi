// Di chuyển của người chơi: nhận input, áp từng bước TICK_MS, chọn chỗ đứng an toàn.
import {
  TICK_MS,
  TILE,
  PLAYER_RADIUS,
  statsFor,
  type GameMap,
  type InputMsg,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import { rand, quantAngle, type World, type PlayerCtrl } from "../world";
import { reachableFromTown } from "./walk-reach";

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
 * input cũ nhất. Mọi input DI CHUYỂN bị bỏ tính vào `World.inputStats.dropped` (input dừng thừa bị cắt thì không).
 */
export function queueInput(w: World, sid: string, m: InputMsg | undefined) {
  const c = w.ctrl.get(sid);
  if (!c || typeof m?.seq !== "number" || !Number.isFinite(m.dx) || !Number.isFinite(m.dy)) return;
  if (Math.hypot(m.dx, m.dy) <= STOP_LEN && c.inputs.length > STOP_KEEP_INPUTS) {
    // Chỉ input DI CHUYỂN bị cắt mới tính vào `dropped`: input DỪNG thừa bị cắt (client lặp tin dừng cho chắc: tin thứ ba cắt tin thứ hai) là vô hại
    // và làm `input_dropped` ở `/metrics` nhiễu (chỉ cần một bước chờ + ba tin dừng là dropped = 1; B đo ở #963).
    for (let i = STOP_KEEP_INPUTS; i < c.inputs.length; i++)
      if (Math.hypot(c.inputs[i]!.dx, c.inputs[i]!.dy) > STOP_LEN) w.inputStats.dropped++;
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
    // Choáng / đang mở hộp thoại chặn đường (mục 52): vẫn TIÊU THỤ input và tăng `lastSeq` (chỉ không di chuyển) để hàng đợi dự đoán của client rỗng được, `reconcile` không chạy lại input cũ
    if (len > 0.05 && !c.stunned && c.ambush?.offer === undefined) {
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

/** Bán kính tìm chỗ đứng gần nhất quanh vị trí đã lưu bị chặn (px): 24 ô. Xa hơn thì về trấn (bản đồ đổi hẳn, vị trí cũ vô nghĩa). */
export const RELOCATE_MAX_PX = 24 * TILE;
/** Bước lấy mẫu khi tìm chỗ đứng gần nhất (px): nửa ô, là số nguyên để toạ độ lưu vẫn nguyên. */
const RELOCATE_STEP = TILE / 2;

/**
 * Chỗ đứng KHÔNG bị chặn và ĐI BỘ TỚI ĐƯỢC từ tâm trấn (`reachableFromTown`) GẦN (x, y) nhất trong `RELOCATE_MAX_PX` (lấy mẫu mỗi nửa ô, chọn khoảng cách nhỏ nhất; hoà thì lấy điểm quét trước: hàng trên, cột trái). `null` nếu không có.
 * Dùng khi bản đồ đổi (docs/THIET_KE_BAN_DO_TILED.md mục 7.2) hoặc hồ sơ lưu rơi vào tường: người đang săn ở xa không bị kéo về trấn. Chỉ chạy lúc vào phòng với vị trí hỏng (hiếm).
 */
export function nearestFreeSpot(
  map: GameMap,
  x: number,
  y: number,
): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const r = RELOCATE_MAX_PX;
  const x0 = Math.max(0, Math.ceil((x - r) / RELOCATE_STEP) * RELOCATE_STEP);
  const x1 = Math.min(map.worldW, Math.floor((x + r) / RELOCATE_STEP) * RELOCATE_STEP);
  const y0 = Math.max(0, Math.ceil((y - r) / RELOCATE_STEP) * RELOCATE_STEP);
  const y1 = Math.min(map.worldH, Math.floor((y + r) / RELOCATE_STEP) * RELOCATE_STEP);
  let best: { x: number; y: number } | null = null;
  let bestD = r * r;
  for (let cy = y0; cy <= y1; cy += RELOCATE_STEP)
    for (let cx = x0; cx <= x1; cx += RELOCATE_STEP) {
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d >= bestD) continue;
      if (map.circleBlocked(cx, cy, PLAYER_RADIUS)) continue;
      // Chỉ nhận chỗ NỐI với thế giới (đi bộ tới được từ tâm trấn, kể cả qua khu an toàn): "gần nhất" mà nằm trong túi kín thì người chơi KHÔNG đi ra được và game không có lệnh gỡ kẹt (B đo ở review #1213:
      // 12-22 % ô chặn dời vào túi kín nếu bỏ kiểm này). Chỉ gọi khi điểm sẽ thành `best` (đã qua `d < bestD`) nên rất ít lần.
      if (!reachableFromTown(map, cx, cy)) continue;
      bestD = d;
      best = { x: cx, y: cy };
    }
  return best;
}

/** Cách `safeSpot` đã dời người khỏi vị trí đã lưu (chỉ có khi người gọi đưa vị trí mà vị trí đó không dùng được). */
export interface SpotMoved {
  /** Khoảng cách tới vị trí cũ (px, làm tròn) */
  dist: number;
  /** `near`: tới chỗ đứng gần nhất; `town`: không có chỗ nào trong tầm nên về trấn */
  to: "near" | "town";
}

/**
 * Vị trí đã lưu nếu còn hợp lệ (không đè ô chặn và đi bộ tới được từ tâm trấn); không thì chỗ đứng GẦN nhất (`nearestFreeSpot`); không có thì một điểm ngẫu nhiên trong trấn. Khi phải dời, kết quả kèm `moved` (để ghi nhật ký kiểm toán `map.relocate`).
 * Không đưa vị trí (bí cảnh, hồi sinh) thì luôn là điểm ngẫu nhiên trong trấn.
 */
export function safeSpot(
  map: GameMap,
  x?: number,
  y?: number,
): { x: number; y: number; moved?: SpotMoved } {
  const town = map.townPx;
  const hasCoords = typeof x === "number" && typeof y === "number";
  // Toạ độ không hữu hạn (NaN / Infinity từ hồ sơ hỏng) KHÔNG dùng được: so sánh với NaN không bao giờ "chặn" nên trước đây NaN lọt qua như vị trí hợp lệ
  const finite = hasCoords && Number.isFinite(x) && Number.isFinite(y);
  // Vị trí lưu hợp lệ = không đè ô chặn VÀ đi bộ tới được từ tâm trấn: hồ sơ cũ nằm trong túi kín (bản đồ bị sửa tay sau khi lưu) sẽ không đi ra được, nên cũng phải dời
  if (
    finite &&
    !map.circleBlocked(x as number, y as number, PLAYER_RADIUS) &&
    reachableFromTown(map, x as number, y as number)
  )
    return { x: x as number, y: y as number };
  if (finite) {
    const near = nearestFreeSpot(map, x as number, y as number);
    if (near)
      return {
        ...near,
        moved: {
          dist: Math.round(Math.hypot(near.x - (x as number), near.y - (y as number))),
          to: "near",
        },
      };
  }
  let spot: { x: number; y: number } | null = null;
  for (let i = 0; i < 50 && !spot; i++) {
    const a = rand(0, Math.PI * 2),
      r = rand(0, town.r * 0.6);
    const sx = town.x + Math.cos(a) * r,
      sy = town.y + Math.sin(a) * r;
    if (!map.circleBlocked(sx, sy, PLAYER_RADIUS)) spot = { x: sx, y: sy };
  }
  spot ??= { x: town.x, y: town.y };
  if (!hasCoords) return spot;
  const dist = finite ? Math.round(Math.hypot(spot.x - (x as number), spot.y - (y as number))) : -1;
  return { ...spot, moved: { dist, to: "town" } };
}
