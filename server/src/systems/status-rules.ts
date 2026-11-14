// Luật trạng thái THUẦN (M7.2b, docs/PHAN_CONG_M7.md mục 5.4): gắn / làm mới / hết hạn, trần 4 trạng thái, choáng (trùm miễn, miễn 3 giây sau
// khi hết), nhân tốc độ, nhân sát thương nhận, khiên, mặt nạ bit công khai. KHÔNG biết `World` hay tin nhắn (để `combat.ts` và `monsters.ts`
// dùng được mà không import vòng với `status.ts`, nơi nối luật với thế giới); chỉ làm việc trên một `StatusBox`.
// Số liệu từng trạng thái (trần thời gian / cường độ, loại tác dụng) ở `shared/src/skills.ts`; chuỗi / id lạ bị bỏ, không bao giờ ném lỗi.
import {
  MAX_STATUSES,
  STUN_IMMUNE_MS,
  statusCarriesRatio,
  statusMask,
  statusOf,
  type SkillEffect,
  type StatusEntry,
  type StatusId,
} from "@tien-gioi/shared";

/** Một trạng thái đang có trên một mục tiêu. */
export interface StatusInst {
  id: StatusId;
  /** Hết hạn lúc nào (ms, đồng hồ `w.now`) */
  until: number;
  /** Cường độ đã kẹp theo trần của trạng thái (nghĩa theo `StatusKind`) */
  ratio: number;
  /** `dot`: sát thương mỗi giây = `ratio` x sát thương gốc của đòn gây ra nó; loại khác: 0 */
  dps: number;
  /** `shield`: phần khiên còn lại (đơn vị khí huyết); loại khác: 0 */
  pool: number;
  /** `dot`: mốc (ms) đã tính sát thương tới đâu */
  last: number;
  /** Người gây ra (sessionId, "" = không ai): để tính công hạ quái cho sát thương theo giây */
  src: string;
}

/** Trạng thái của một mục tiêu: chỉ nằm trong `PlayerCtrl` / `MonsterCtrl` (riêng của server). */
export interface StatusBox {
  list: StatusInst[];
  /** Không bị choáng trước mốc này (ms): choáng không lặp liền nhau, và nối tiếp cả lúc đang choáng */
  stunImmuneUntil: number;
}

export function newStatusBox(): StatusBox {
  return { list: [], stunImmuneUntil: 0 };
}

export interface AddOpts {
  /** Sát thương gốc của đòn gây ra (cho `dot`: `dps = ratio x baseDmg`) */
  baseDmg?: number;
  /** Khí huyết tối đa của mục tiêu (cho `shield`: khiên = `ratio x maxHp`) */
  maxHp?: number;
  src?: string;
  /** Miễn choáng hẳn (trùm) */
  stunImmune?: boolean;
}

/**
 * `added`: thêm mới (kể cả đẩy ra trạng thái yếu nhất khi đã đủ `MAX_STATUSES`); `refreshed`: cùng loại nên làm mới (KHÔNG cộng dồn);
 * `resisted`: choáng bị chặn (trùm / đang miễn); `full`: đủ trạng thái và không cái nào yếu hơn cái mới; `ignored`: id lạ, thời gian <= 0.
 */
export type AddResult = "added" | "refreshed" | "resisted" | "full" | "ignored";

const finite = (n: unknown, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

/** Xoá trạng thái đã hết hạn. Trả `true` nếu có cái bị xoá. */
export function pruneStatuses(box: StatusBox, now: number): boolean {
  let removed = false;
  for (let i = box.list.length - 1; i >= 0; i--) {
    if (box.list[i].until <= now) {
      box.list.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

/**
 * Gắn trạng thái `effect` (đã qua xác suất `chance`) lên `box` tại thời điểm `now`.
 * Thời gian kẹp [0, `maxMs`], cường độ kẹp [0, `maxRatio`] của trạng thái. Cùng loại: giữ hạn muộn hơn, cường độ mạnh hơn, và với khiên
 * thì nạp lại đầy (làm mới). Đủ `MAX_STATUSES`: đẩy cái hết hạn sớm nhất ra nếu nó hết sớm hơn cái mới, không thì bỏ cái mới.
 */
export function addStatus(
  box: StatusBox,
  effect: SkillEffect,
  now: number,
  opts: AddOpts = {},
): AddResult {
  const def = statusOf(effect.status);
  if (!def) return "ignored";
  const ms = Math.min(def.maxMs, Math.max(0, finite(effect.ms, 0)));
  if (ms <= 0) return "ignored";
  pruneStatuses(box, now);
  const stun = def.kind === "stun";
  if (stun && (opts.stunImmune || now < box.stunImmuneUntil)) return "resisted";
  const ratio = Math.min(def.maxRatio, Math.max(0, finite(effect.ratio, 0)));
  const until = now + ms;
  const dps = def.kind === "dot" ? ratio * Math.max(0, finite(opts.baseDmg, 0)) : 0;
  const pool =
    def.kind === "shield" ? Math.max(0, Math.round(ratio * Math.max(0, finite(opts.maxHp, 0)))) : 0;
  const src = opts.src ?? "";

  const same = box.list.find((s) => s.id === def.id);
  if (same) {
    same.until = Math.max(same.until, until);
    same.ratio = Math.max(same.ratio, ratio);
    same.dps = Math.max(same.dps, dps);
    same.pool = pool; // khiên nạp lại đầy khi làm mới
    if (opts.src !== undefined) same.src = src;
    return "refreshed";
  }
  if (box.list.length >= MAX_STATUSES) {
    let weakest = 0;
    for (let i = 1; i < box.list.length; i++)
      if (box.list[i].until < box.list[weakest].until) weakest = i;
    if (box.list[weakest].until >= until) return "full";
    box.list.splice(weakest, 1);
  }
  box.list.push({ id: def.id, until, ratio, dps, pool, last: now, src });
  if (stun) box.stunImmuneUntil = until + STUN_IMMUNE_MS;
  return "added";
}

/** Đang bị choáng (không di chuyển, không ra đòn). */
export function isStunned(box: StatusBox, now: number): boolean {
  for (const s of box.list) if (s.id === "stun" && s.until > now) return true;
  return false;
}

/** Hệ số tốc độ di chuyển: tăng tốc `1 + ratio`, tê cóng `1 - ratio` (nhân với nhau). 1 khi không có gì. Choáng KHÔNG nằm ở đây (`isStunned`). */
export function speedMult(box: StatusBox, now: number): number {
  let m = 1;
  for (const s of box.list) {
    if (s.until <= now) continue;
    if (s.id === "haste") m *= 1 + s.ratio;
    else if (s.id === "chill") m *= 1 - s.ratio;
  }
  return m;
}

/** Hệ số sát thương NHẬN: vỡ giáp `1 + ratio`. 1 khi không có gì. */
export function takenMult(box: StatusBox, now: number): number {
  let m = 1;
  for (const s of box.list) if (s.id === "sunder" && s.until > now) m += s.ratio;
  return m;
}

/**
 * Khiên hấp thụ sát thương `dmg` (khiên gắn trước dùng trước): trả phần còn lại sau khi trừ khiên, và `changed` nếu khiên có đổi (vơi
 * hoặc vỡ: người gọi gửi lại danh sách trạng thái cho chủ). Khiên cạn thì bị xoá khỏi danh sách.
 */
export function absorbShield(
  box: StatusBox,
  dmg: number,
  now: number,
): { left: number; changed: boolean } {
  let left = dmg;
  let changed = false;
  for (let i = 0; i < box.list.length && left > 0; i++) {
    const s = box.list[i];
    if (s.id !== "shield" || s.until <= now || s.pool <= 0) continue;
    const take = Math.min(s.pool, left);
    s.pool -= take;
    left -= take;
    changed = true;
    if (s.pool <= 0) {
      box.list.splice(i, 1);
      i--;
    }
  }
  return { left, changed };
}

/** Mặt nạ bit công khai (`Monster.fx`, M7.3) của các trạng thái CÓ HẠI còn hiệu lực. */
export function maskOf(box: StatusBox, now: number): number {
  return statusMask(box.list.filter((s) => s.until > now).map((s) => s.id));
}

/**
 * Danh sách `[id, msLeft, ratio?]` còn hiệu lực gửi cho chủ (`StatusMsg.list`): thời gian còn lại nguyên, >= 1; `ratio` CHỈ cho tăng tốc / tê cóng
 * (client cần để đoán trước di chuyển bằng `moveSpeedMul`). Cũng là đầu vào của `moveSpeedMul` ở server: cùng hàm với client.
 */
export function entriesOf(box: StatusBox, now: number): StatusEntry[] {
  const out: StatusEntry[] = [];
  for (const s of box.list) {
    if (s.until <= now) continue;
    const ms = Math.max(1, Math.ceil(s.until - now));
    out.push(statusCarriesRatio(s.id) ? [s.id, ms, s.ratio] : [s.id, ms]);
  }
  return out;
}
