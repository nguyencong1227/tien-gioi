// VẬT THỂ BỀN của người chơi (`SkillDef.shape` = `zone` / `trap` / `aura` / `totem`, mục 51, CT4 #1049, docs/PHAN_CONG_CHIEU_THUC.md mục 3-4): chiêu để lại thứ ĐỨNG LẠI trong thế giới
// một lúc rồi mới tác dụng lên quái.
//  - `zone`: VÙNG đặt như `ground` (cách người dùng `reach` px theo hướng), bán kính `range`, tồn tại `durationMs`; mỗi `tickMs` tác dụng MỌI quái trong vùng.
//  - `trap`: BẪY đặt như `zone`; sau `armMs` mới hoạt động; khi có quái bước vào bán kính thì NỔ MỘT LẦN (tác dụng mọi quái trong bán kính lúc nổ, `fxEnd` `pop`); hết `durationMs` mà chưa nổ thì tan.
//  - `aura`: HÀO QUANG bám theo người dùng (tâm = chỗ người đứng lúc này), bán kính `range`; mỗi `tickMs` tác dụng mọi quái trong bán kính. Đứng trong khu an toàn thì tạm ngưng.
//  - `totem`: TƯỢNG đứng yên (đặt như `zone`) `durationMs`; mỗi `tickMs` đánh quái GẦN NHẤT trong `range`. `taunt` (thu hút quái nhắm) CHƯA nối vào AI quái: bỏ qua, ghi ở kế hoạch.
//  Tác dụng = `strikeMonster` của `cast.ts` (đưa vào qua `strike`: cùng công thức với chiêu tức thời: hệ khắc, combo, hiệu ứng, kéo / đẩy), số liệu (công, bạo kích, nhân, phù) CHỐT lúc đặt.
//  Chỉ đánh QUÁI (PK đợt 1 không: vật thể bền không đánh người). Điểm luyện chiêu chỉ cộng MỘT lần mỗi lần đặt (cờ `credited` trong `strikeMonster`).
//  Đặt trong khu an toàn thì KHÔNG dựng (đã tốn linh lực + hồi chiêu như đạn vào tường).
//  Trần (`SKILL_LIMITS.persistPerPlayerMax` mỗi người, `persistPerRoomMax` mỗi phòng, thêm trần theo loại: 3 vùng / 3 bẫy / 1 hào quang / 2 tượng): vượt thì vật thể CŨ NHẤT cùng loại / của người đó /
//  của phòng bị đẩy ra (`fxEnd` `gone`). Chủ chết / rời phòng / qua cổng / vào bí cảnh (không còn trong phòng này) / hồn lìa xác / Hoàng Tuyền thì vật thể của họ tan (`fxEnd` `gone`).
//  Băng thông: MỘT `fx` lúc dựng và (chỉ khi KẾT THÚC SỚM) MỘT `fxEnd`; tác dụng theo nhịp `nextAt` (bẫy đã hoạt động quét mỗi `TRAP_SCAN_MS`, không mỗi tick); không có vật thể thì thoát ngay. Không `Math.random` ở đây.
import { SKILL_LIMITS, type SkillDef } from "@tien-gioi/shared";
import type { World } from "../world";

/** Bẫy ĐÃ hoạt động quét quái mỗi chừng này (ms), không mỗi tick: đủ nhạy (quái chạy ~ vài px mỗi 100 ms) mà đỡ tốn khi nhiều bẫy chờ. */
export const TRAP_SCAN_MS = 100;

/** Trần theo LOẠI mỗi người (mục 3 của kế hoạch). */
export const PERSIST_KIND_MAX = { zone: 3, trap: 3, aura: 1, totem: 2 } as const;

export type PersistKind = keyof typeof PERSIST_KIND_MAX;

/** Hình nào là vật thể bền. */
export function isPersistShape(shape: unknown): shape is PersistKind {
  return typeof shape === "string" && Object.prototype.hasOwnProperty.call(PERSIST_KIND_MAX, shape);
}

/** Một vật thể bền đang tồn tại (chỉ server; client chỉ nhận `fx` dựng + `fxEnd`). */
export interface PObj {
  /** Số nguyên tăng dần THEO PHÒNG (`World.objSeq`) */
  id: number;
  owner: string;
  skill: string;
  kind: PersistKind;
  /** Tâm lúc đặt (`aura` bám theo chủ nên tâm thật là chỗ chủ đứng) */
  x: number;
  y: number;
  /** Bán kính tác dụng (px) */
  r: number;
  /** Hết hạn (`w.now`, ms) */
  until: number;
  /** Lần tác dụng kế tiếp (`zone` / `aura` / `totem`); với bẫy: lúc bắt đầu hoạt động */
  nextAt: number;
  tickMs: number;
  /** Tác dụng lên một quái (do `cast.ts` đưa vào): (id quái, chỗ xuất phát để kéo / đẩy) */
  strike: (id: string, fromX: number, fromY: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finiteOr = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);

/** Thời gian tồn tại (ms) đã kẹp theo trần của loại; thiếu / không hợp lệ -> 0 (không dựng). */
function durationOf(kind: PersistKind, def: SkillDef): number {
  const max =
    kind === "zone"
      ? SKILL_LIMITS.zoneDurationMax
      : kind === "trap"
        ? SKILL_LIMITS.trapDurationMax
        : kind === "aura"
          ? SKILL_LIMITS.auraDurationMax
          : SKILL_LIMITS.totemDurationMax;
  const v = finiteOr(def.durationMs, 0);
  return v > 0 ? Math.min(max, v) : 0;
}

/** Nhịp tác dụng (ms) đã kẹp theo sàn của loại (bẫy không có nhịp: `armMs`). */
function tickOf(kind: PersistKind, def: SkillDef): number {
  if (kind === "trap")
    return clamp(finiteOr(def.armMs, SKILL_LIMITS.trapArmMin), SKILL_LIMITS.trapArmMin, 60_000);
  const min =
    kind === "zone"
      ? SKILL_LIMITS.zoneTickMin
      : kind === "aura"
        ? SKILL_LIMITS.auraTickMin
        : SKILL_LIMITS.totemTickMin;
  return Math.max(min, finiteOr(def.tickMs, min));
}

/** Kết quả `placeObject`: `ok` đã dựng; `safe` vùng đặt / chỗ đứng ở khu an toàn (không dựng, nên báo người chơi); `invalid` hình không phải vật thể bền hoặc dữ liệu thiếu `durationMs`. */
export type PlaceResult = "ok" | "safe" | "invalid";

/** Gửi `fxEnd` (kết thúc SỚM) và gỡ vật thể khỏi danh sách. */
function endObj(w: World, i: number, why: "pop" | "gone") {
  const o = w.objs[i]!;
  w.objs.splice(i, 1);
  w.events.fx({ kind: "fxEnd", id: o.id, x: Math.round(o.x), y: Math.round(o.y), why });
}

/** Đẩy vật thể CŨ NHẤT thoả `match` ra khỏi phòng (`gone`); `true` nếu đã đẩy. `objs` giữ theo thứ tự dựng nên cũ nhất = chỉ số nhỏ nhất. */
function evictOldest(w: World, match: (o: PObj) => boolean): boolean {
  for (let i = 0; i < w.objs.length; i++) {
    if (match(w.objs[i]!)) {
      endObj(w, i, "gone");
      return true;
    }
  }
  return false;
}

/** Số vật thể của `owner` (theo `kind` nếu có). */
function countOf(w: World, owner: string, kind?: PersistKind): number {
  let n = 0;
  for (const o of w.objs) if (o.owner === owner && (kind === undefined || o.kind === kind)) n++;
  return n;
}

/**
 * Dựng vật thể của chiêu `def` (hình `zone` / `trap` / `aura` / `totem`) cho `sid` đứng ở (x0, y0) hướng `angle`. Trả `ok` nếu đã dựng. Không dựng khi: thiếu `durationMs` (`invalid`), vùng đặt / chỗ đứng nằm trong khu an toàn (`safe`).
 * Đẩy vật thể cũ khi vượt trần (loại, người, phòng) TRƯỚC khi thêm. Gửi MỘT `fx` dựng.
 */
export function placeObject(
  w: World,
  sid: string,
  def: SkillDef,
  x0: number,
  y0: number,
  angle: number,
  strike: PObj["strike"],
): PlaceResult {
  const kind = def.shape;
  if (!isPersistShape(kind)) return "invalid";
  const dur = durationOf(kind, def);
  if (dur <= 0) return "invalid";
  const reach = kind === "aura" ? 0 : Math.max(0, finiteOr(def.reach, 0));
  const x = x0 + Math.cos(angle) * reach;
  const y = y0 + Math.sin(angle) * reach;
  if (w.map.inSafe(x, y) || w.map.inSafe(x0, y0)) return "safe"; // khu an toàn: vật thể bền không tồn tại ở đó
  const r = Math.max(0, finiteOr(def.range, 0));
  const tick = tickOf(kind, def);
  // trần: theo loại (cũ nhất cùng loại của người này), theo người (cũ nhất của người này), theo phòng (cũ nhất của phòng)
  while (countOf(w, sid, kind) >= PERSIST_KIND_MAX[kind]) {
    if (!evictOldest(w, (o) => o.owner === sid && o.kind === kind)) break;
  }
  while (countOf(w, sid) >= SKILL_LIMITS.persistPerPlayerMax) {
    if (!evictOldest(w, (o) => o.owner === sid)) break;
  }
  while (w.objs.length >= SKILL_LIMITS.persistPerRoomMax) {
    if (!evictOldest(w, () => true)) break;
  }
  const id = ++w.objSeq;
  w.objs.push({
    id,
    owner: sid,
    skill: def.id,
    kind,
    x,
    y,
    r,
    until: w.now + dur,
    nextAt: w.now + tick, // zone / aura / totem: nhịp đầu sau `tickMs`; bẫy: bắt đầu hoạt động sau `armMs`
    tickMs: tick,
    strike,
  });
  w.events.fx({
    kind,
    by: sid,
    skill: def.id,
    id,
    x: Math.round(x),
    y: Math.round(y),
    r: Math.round(r),
    ms: Math.round(dur),
  });
  return "ok";
}

/** Id các quái có thân (tâm + bán kính quái) chạm vòng tròn (x, y, r); `nearest` chỉ lấy MỘT con gần nhất. Gom trước rồi mới tác dụng: hạ quái xoá nó khỏi bảng trong lúc duyệt. */
function monstersIn(w: World, x: number, y: number, r: number, nearest: boolean): string[] {
  const out: string[] = [];
  let best = Infinity;
  w.state.monsters.forEach((mon, id) => {
    const mc = w.mctrl.get(id);
    if (!mc) return;
    const lim = r + mc.def.radius;
    if (Math.abs(mon.x - x) > lim || Math.abs(mon.y - y) > lim) return;
    const d = Math.hypot(mon.x - x, mon.y - y);
    if (d > lim) return;
    if (!nearest) out.push(id);
    else if (d < best) {
      best = d;
      out[0] = id;
    }
  });
  return out;
}

/**
 * Mỗi tick: dọn vật thể mất chủ, hết hạn; tác dụng vật thể tới nhịp. Không có vật thể thì thoát ngay (không tốn gì). Duyệt ngược để gỡ an toàn trong lúc lặp.
 * Hết hạn TỰ NHIÊN thì KHÔNG gửi `fxEnd` (client đã biết `ms` lúc dựng); mất chủ thì `fxEnd` `gone`; bẫy nổ thì `pop`.
 */
export function tickObjects(w: World) {
  if (w.objs.length === 0) return;
  const now = w.now;
  for (let i = w.objs.length - 1; i >= 0; i--) {
    const o = w.objs[i];
    if (!o) continue; // mảng vừa co lại do một lần gỡ khác trong cùng vòng (tác dụng làm quái chết không gỡ vật thể, nhưng giữ cho chắc)
    const p = w.state.players.get(o.owner);
    const c = w.ctrl.get(o.owner);
    if (!p || !c || p.dead || c.limbo || (w.ghosts.size > 0 && w.ghosts.has(o.owner))) {
      endObj(w, i, "gone");
      continue;
    }
    if (now >= o.until) {
      w.objs.splice(i, 1); // hết hạn tự nhiên: client tự tắt theo `ms`
      continue;
    }
    if (now < o.nextAt) continue;
    if (o.kind === "trap") {
      // bẫy hoạt động từ `nextAt` (= đặt + armMs): quái chạm bán kính thì nổ MỘT lần, tác dụng mọi quái trong bán kính
      const hit = monstersIn(w, o.x, o.y, o.r, false);
      if (hit.length === 0) {
        o.nextAt = now + TRAP_SCAN_MS; // chưa có quái: quét lại sau một nhịp ngắn (không mỗi tick)
        continue;
      }
      for (const id of hit) o.strike(id, o.x, o.y);
      endObj(w, i, "pop");
      continue;
    }
    o.nextAt = now + o.tickMs;
    if (o.kind === "aura") {
      if (w.map.inSafe(p.x, p.y)) continue; // đứng trong khu an toàn: hào quang tạm ngưng (không đánh)
      for (const id of monstersIn(w, p.x, p.y, o.r, false)) o.strike(id, p.x, p.y);
    } else if (o.kind === "totem") {
      for (const id of monstersIn(w, o.x, o.y, o.r, true)) o.strike(id, o.x, o.y);
    } else {
      for (const id of monstersIn(w, o.x, o.y, o.r, false)) o.strike(id, o.x, o.y);
    }
  }
}
