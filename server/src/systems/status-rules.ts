// Luật trạng thái THUẦN (M7.2b, docs/PHAN_CONG_M7.md mục 5.4): gắn / làm mới / hết hạn, trần 4 trạng thái, choáng (trùm miễn, miễn 3 giây sau
// khi hết), nhân tốc độ, nhân sát thương nhận, khiên, mặt nạ bit công khai. KHÔNG biết `World` hay tin nhắn (để `combat.ts` và `monsters.ts`
// dùng được mà không import vòng với `status.ts`, nơi nối luật với thế giới); chỉ làm việc trên một `StatusBox`.
// Số liệu từng trạng thái (trần thời gian / cường độ, loại tác dụng) ở `shared/src/skills.ts`; chuỗi / id lạ bị bỏ, không bao giờ ném lỗi.
import {
  MAX_STATUSES,
  STUN_IMMUNE_MS,
  markIndexOf,
  statusAmpMult,
  statusCarriesRatio,
  statusCdr,
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
 * `added`: thêm mới (kể cả đẩy ra một trạng thái khi đã đủ `MAX_STATUSES`: có hại luôn vào, xem `addStatus`); `refreshed`: cùng loại nên làm mới
 * (KHÔNG cộng dồn); `resisted`: choáng bị chặn (trùm / đang miễn); `full`: đủ trạng thái và trạng thái mới không vào được (buff không đẩy được gì,
 * hoặc trạng thái thường có hại không sống lâu hơn nạn nhân); `ignored`: id lạ, thời gian <= 0.
 */
export type AddResult = "added" | "refreshed" | "resisted" | "full" | "ignored";

const finite = (n: unknown, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

/** Khống chế: choáng và vỡ giáp (luôn vào được khi đủ chỗ, không bị trạng thái khác đẩy ra). */
function isControl(id: StatusId): boolean {
  const kind = statusOf(id)?.kind;
  return kind === "stun" || kind === "vuln";
}

/**
 * Vị trí buff CÓ LỢI hết hạn sớm nhất trong hộp (-1 nếu không có). `withBreakAid` = false thì bỏ qua đan hộ đạo (`breakAid`: đã tốn một viên
 * đan, chỉ mất khi là buff duy nhất).
 */
function earliestBuff(box: StatusBox, withBreakAid: boolean): number {
  let victim = -1;
  for (let i = 0; i < box.list.length; i++) {
    const d = statusOf(box.list[i].id);
    if (!d || d.harmful) continue;
    if (!withBreakAid && d.kind === "breakAid") continue;
    if (victim < 0 || box.list[i].until < box.list[victim].until) victim = i;
  }
  return victim;
}

/**
 * Gỡ MỌI trạng thái sát thương theo giây (độc / bỏng / chảy máu) khỏi hộp, giữ nguyên loại khác (tê cóng, choáng, tăng ích...). Dùng khi người chơi
 * vào khu an toàn (quyết định A 15/11/2026, docs/PHAN_CONG_M7.md 5.4): trấn / cổng thanh tẩy sát thương theo giây. Trả `true` nếu có cái bị gỡ.
 */
export function stripDots(box: StatusBox): boolean {
  let removed = false;
  for (let i = box.list.length - 1; i >= 0; i--) {
    if (statusOf(box.list[i].id)?.kind === "dot") {
      box.list.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

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
 * Gỡ trạng thái `id` còn hiệu lực khỏi `box` và trả mục đã gỡ (undefined nếu không có / đã hết hạn). Dọn mục hết hạn trước. Dùng cho trạng thái
 * TIÊU HAO khi dùng (đan hộ đạo `dao_ho`, #514): đọc cường độ và gỡ trong MỘT thao tác để không dùng được hai lần.
 */
export function takeStatus(box: StatusBox, id: string, now: number): StatusInst | undefined {
  pruneStatuses(box, now);
  const i = box.list.findIndex((s) => s.id === id);
  return i < 0 ? undefined : box.list.splice(i, 1)[0];
}

/**
 * Gắn trạng thái `effect` (đã qua xác suất `chance`) lên `box` tại thời điểm `now`.
 * Thời gian kẹp [0, `maxMs`], cường độ kẹp [0, `maxRatio`] của trạng thái. Cùng loại: giữ hạn muộn hơn, cường độ mạnh hơn, và với khiên
 * thì nạp lại đầy (làm mới). Đủ `MAX_STATUSES` (docs/THIET_KE_NGHE_NHO.md mục 8.5, quyết định A: đồ chế làm đầy ô nên đồ chế không được vô tình
 * cho miễn nhiễm sát thương theo thời gian):
 * - trạng thái CÓ HẠI mới luôn VÀO; nạn nhân là buff CÓ LỢI hết sớm nhất (trừ đan hộ đạo khi còn lựa chọn khác);
 * - buff CÓ LỢI mới chỉ đẩy được buff có lợi hết sớm hơn nó, KHÔNG BAO GIỜ đẩy trạng thái có hại; không có chỗ thì bị bỏ;
 * - hộp không còn buff nào đẩy được (toàn trạng thái có hại, hoặc buff duy nhất là đan hộ đạo): luật cũ, khống chế luôn vào, trạng thái thường
 *   có hại chỉ vào khi sống lâu hơn nạn nhân (trạng thái KHÔNG phải khống chế hết sớm nhất).
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
    if (def.harmful) {
      // Có hại luôn vào: nạn nhân là buff có lợi hết sớm nhất (đan hộ đạo chỉ bị đẩy khi không còn buff nào khác, và khi đó dùng luật cũ).
      let victim = earliestBuff(box, false);
      if (victim < 0) {
        // Luật cũ: khống chế (choáng, vỡ giáp) luôn VÀO và không bị trạng thái khác đẩy ra (choáng ngắn nhất nên nếu so thời gian thì "ba
        // trạng thái + một choáng" thành miễn choáng); nạn nhân là trạng thái KHÔNG phải khống chế hết sớm nhất; trạng thái thường chỉ vào
        // khi sống lâu hơn nạn nhân.
        for (let i = 0; i < box.list.length; i++) {
          if (isControl(box.list[i].id)) continue;
          if (victim < 0 || box.list[i].until < box.list[victim].until) victim = i;
        }
        if (victim < 0) return "full"; // toàn khống chế (không xảy ra: chỉ có hai loại khống chế nên tối đa hai mục)
        if (!isControl(def.id) && box.list[victim].until >= until) return "full";
      }
      box.list.splice(victim, 1);
    } else {
      // Buff có lợi: chỉ đẩy buff có lợi hết sớm hơn nó; không bao giờ đẩy trạng thái có hại.
      const victim = earliestBuff(box, true);
      if (victim < 0 || box.list[victim].until >= until) return "full";
      box.list.splice(victim, 1);
    }
  }
  box.list.push({ id: def.id, until, ratio, dps, pool, last: now, src });
  if (stun) box.stunImmuneUntil = until + STUN_IMMUNE_MS;
  return "added";
}

/**
 * Hệ số nhân sát thương GÂY RA của chiêu hệ `element` từ phù `amp_<hệ>` còn hiệu lực trên `box` (nghề nhỏ lát 2, #514): `statusAmpMult` của `shared/`
 * (một công thức cho máy chủ và công cụ) trên danh sách còn hạn. 1 khi không có hộp / không có phù đó / hệ khác. Gọi MỘT lần mỗi lần dùng chiêu, không mỗi tick.
 */
export function ampMultOf(box: StatusBox | undefined, now: number, element: unknown): number {
  if (!box || box.list.length === 0) return 1;
  return statusAmpMult(entriesOf(box, now), element);
}

/** Giảm hồi chiêu (phân số, 0..`maxRatio` của `cdr_phu`) từ phù `cdr_phu` còn hiệu lực; 0 khi không có. Cộng với của trang bị rồi kẹp `CDR_CAP` ở `skillCooldownMs`. */
export function phuCdrOf(box: StatusBox | undefined, now: number): number {
  if (!box || box.list.length === 0) return 0;
  return statusCdr(entriesOf(box, now));
}

/** Cường độ `cdr_phu` ĐANG LƯU trong hộp, kể cả mục chưa kịp dọn hết hạn (0 khi không có): người gọi so trước / sau một thao tác để biết có phải gửi lại sổ chiêu (`cdMax`). */
export function cdrPhuStored(box: StatusBox | undefined): number {
  return box?.list.find((x) => x.id === "cdr_phu")?.ratio ?? 0;
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

/** Sát thương theo giây dồn lại rồi tính mỗi chừng này ms (ít tin `dmg` hơn mỗi tick; lúc hết hạn tính nốt phần lẻ). */
export const DOT_TICK_MS = 1000;

/**
 * Sát thương THEO GIÂY (`dot`) của MỘT trạng thái cần gây ngay bây giờ (số nguyên >= 0), đồng thời đẩy mốc `last` cho khớp. Dùng chung cho quái và người chơi.
 * Làm tròn KHÔNG mất / thừa phần lẻ: mỗi lần tính chỉ lấy phần NGUYÊN (`floor`) của sát thương dồn tới nay và chỉ đẩy `last` đúng khoảng thời gian phần nguyên đó
 * tương ứng (`n x 1000 / dps` ms), nên phần dư vẫn nằm trong khoảng `last..now` cho lần sau; lúc HẾT HẠN mới làm tròn phần dư cuối (`round`) và chốt `last = until`.
 * Tổng sát thương cả đời trạng thái = `round(dps x thời lượng)` bất kể dps nhỏ cỡ nào (trước đây `round` mỗi giây lệch tới +-30-100 % với dps 0,4 - 1,5).
 * Chưa tới nhịp (`DOT_TICK_MS` kể từ `last`, trừ khi đã hết hạn) hoặc chưa đủ 1 đơn vị: trả 0 và KHÔNG đổi `last`. `now` kẹp ở `until` (tick trễ không tính quá hạn).
 */
export function takeDotDamage(s: StatusInst, now: number): number {
  if (!(s.dps > 0)) return 0;
  const expired = now >= s.until;
  if (!expired && now < s.last + DOT_TICK_MS) return 0;
  const end = Math.min(now, s.until);
  const exact = (s.dps * (end - s.last)) / 1000;
  if (expired) {
    s.last = end;
    return Math.max(0, Math.round(exact));
  }
  const whole = Math.floor(exact);
  if (whole < 1) return 0;
  s.last += (whole * 1000) / s.dps;
  return whole;
}

/** Trạng thái `id` đang còn hiệu lực trên `box` không. */
export function hasStatus(box: StatusBox | undefined, id: string, now: number): boolean {
  if (!box) return false;
  for (const s of box.list) if (s.id === id && s.until > now) return true;
  return false;
}

/**
 * Chỉ số 1..9 (`markIndexOf`) của DẤU hệ MỚI NHẤT còn hiệu lực trên `box` (đặt vào `Monster.mark`); 0 khi không có dấu nào. "Mới nhất" = hết hạn muộn nhất (gắn sau cùng, cùng thời lượng),
 * hoà thì dấu gắn vào hộp sau.
 */
export function newestMarkIndex(box: StatusBox, now: number): number {
  let best = 0;
  let until = -Infinity;
  for (const s of box.list) {
    if (s.until <= now || statusOf(s.id)?.kind !== "mark") continue;
    const index = markIndexOf(s.id.slice("mark_".length));
    if (index > 0 && s.until >= until) {
      best = index;
      until = s.until;
    }
  }
  return best;
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
