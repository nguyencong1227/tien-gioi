// Phần XÃ HỘI lưu theo LINH HỒN (M9, QUYET_DINH_M3 mục 50, docs/PHAN_CONG_M9.md mục 5, issue M9.1 #1020): bộ đếm, thành tựu đã đạt, danh hiệu đang đeo, thống kê PK.
// Tách khỏi `social.ts` (bảng xếp hạng, trùm thế giới, dữ liệu thành tựu) để `reincarnation.ts` (`Soul.social`, `sanitizeSoul`) nhập được mà KHÔNG vòng import: tệp này không nhập gì ngoài kiểu.
//
// Luật chốt:
//  - `Soul.social` là TUỲ CHỌN khi đọc (file cũ không có), `sanitizeSocial` KHÔNG TIN file: khoá hợp lệ theo văn phạm, số hữu hạn kẹp [0, cận], bỏ khoá lạ / quá số lượng. Đọc bộ đếm bằng `socialCounterOf` (chỉ thuộc tính RIÊNG:
//    `counters["constructor"]` không phải `undefined`).
//  - Mọi thay đổi đi qua `socialTrack` / `socialGrant` (thuần, bất biến, idempotent): server gọi trong `SoulStore.update`. Đừng ghi `counters` / `ach` ở chỗ khác (như `sectAwardDay`).
//  - Bộ đếm có HAI chế độ: `add` (cộng dồn: trùm đã hạ, trận thắng) và `max` (mốc cao nhất: kiếp, cảnh giới, cấp tông). `max` không bao giờ giảm nên đầu thai / rời tông không làm mất thành tựu.

/** Số khoá bộ đếm tối đa một linh hồn (chặn file sửa tay phình to). */
export const SOCIAL_COUNTER_KEYS_MAX = 256;
/** Giá trị tối đa của một bộ đếm. */
export const SOCIAL_COUNTER_CAP = 1_000_000_000;
/** Số thành tựu tối đa lưu cho một linh hồn. */
export const SOCIAL_ACH_MAX = 512;
/** Trận thắng / thua PK tối đa lưu. */
export const SOCIAL_PK_CAP = 1_000_000;

/** id danh hiệu: ID NGẮN (<= 4 ký tự a-z 0-9) vì `Player.title` đi vào bản chụp state của MỌI người thấy nhân vật; chữ hiển thị tra từ `TITLES` ở client (`social.ts`). */
export const TITLE_ID_RE = /^[a-z0-9]{1,4}$/;
/** id thành tựu / khoá bộ đếm: bắt đầu bằng chữ hoặc số (KHÔNG `__proto__`), tối đa 48 ký tự; `:` ngăn họ khoá với phần sau (`boss:mang`). */
export const SOCIAL_KEY_RE = /^[a-z0-9][a-z0-9_]{0,47}(:[a-z0-9][a-z0-9_]{0,47})?$/;
const ACH_ID_RE = /^[a-z0-9][a-z0-9_]{0,47}$/;

export type SocialCounterMode = "add" | "max";

/**
 * Bộ đếm CỐ ĐỊNH (không `:`): `kiep` (số kiếp đã bắt đầu, max), `realm_step` (bậc cảnh giới cao nhất từng đạt, max), `sect_level` (cấp tông cao nhất từng ở, max),
 * `pk_won` / `pk_lost` (add), `world_boss_joined` (số sự kiện trùm thế giới đã qua ngưỡng đóng góp, add), `world_boss_top` (số lần vào top đóng góp, add).
 */
export const SOCIAL_FIXED_COUNTERS: Readonly<Record<string, SocialCounterMode>> = {
  kiep: "max",
  realm_step: "max",
  sect_level: "max",
  pk_won: "add",
  pk_lost: "add",
  world_boss_joined: "add",
  world_boss_top: "add",
};

/** HỌ bộ đếm có đuôi `<họ>:<id>`: `boss:<loài trùm>` (số lần hạ, add), `craft:<nghề>` (số lần chế, add), `map:<mã bản đồ>` (đã tới = 1, max). */
export const SOCIAL_COUNTER_FAMILIES: Readonly<Record<string, SocialCounterMode>> = {
  boss: "add",
  craft: "add",
  map: "max",
};

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Chế độ của khoá bộ đếm, hoặc `null` nếu khoá không hợp lệ (sai văn phạm, họ / khoá cố định lạ). Không kiểm id đuôi có thật (việc của `achievementViolations`). */
export function socialCounterMode(key: unknown): SocialCounterMode | null {
  if (typeof key !== "string" || !SOCIAL_KEY_RE.test(key)) return null;
  const i = key.indexOf(":");
  if (i < 0) return hasOwn(SOCIAL_FIXED_COUNTERS, key) ? SOCIAL_FIXED_COUNTERS[key] : null;
  const fam = key.slice(0, i);
  return hasOwn(SOCIAL_COUNTER_FAMILIES, fam) ? SOCIAL_COUNTER_FAMILIES[fam] : null;
}

/** Phần xã hội của một linh hồn. */
export interface SoulSocial {
  v: 1;
  /** Thống kê PK theo linh hồn (BXH `pk`). */
  pk: { won: number; lost: number };
  /** Khoá bộ đếm -> giá trị (đọc bằng `socialCounterOf`). */
  counters: Record<string, number>;
  /** id thành tựu -> thời điểm đạt (ISO). */
  ach: Record<string, string>;
  /** id danh hiệu đang đeo (`TITLE_ID_RE`) hoặc `null`. */
  title: string | null;
}

export function newSocial(): SoulSocial {
  return { v: 1, pk: { won: 0, lost: 0 }, counters: {}, ach: {}, title: null };
}

const intIn = (v: unknown, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo;

/**
 * Đọc `Soul.social` từ file lưu: không tin giá trị. Không phải object -> `undefined` (linh hồn chưa có phần xã hội, file giữ nguyên). Khoá bộ đếm phải đúng văn phạm VÀ họ / khoá cố định có thật,
 * số kẹp [0, `SOCIAL_COUNTER_CAP`], tối đa `SOCIAL_COUNTER_KEYS_MAX` khoá (giữ các khoá đầu); thành tựu: id đúng văn phạm, tối đa `SOCIAL_ACH_MAX`, thời điểm là chuỗi <= 40 ký tự; danh hiệu phải đúng `TITLE_ID_RE`.
 */
export function sanitizeSocial(raw: unknown): SoulSocial | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out = newSocial();
  const pk = r.pk !== null && typeof r.pk === "object" ? (r.pk as Record<string, unknown>) : {};
  out.pk = { won: intIn(pk.won, 0, SOCIAL_PK_CAP), lost: intIn(pk.lost, 0, SOCIAL_PK_CAP) };
  if (r.counters !== null && typeof r.counters === "object" && !Array.isArray(r.counters)) {
    let n = 0;
    for (const [k, v] of Object.entries(r.counters as Record<string, unknown>)) {
      if (n >= SOCIAL_COUNTER_KEYS_MAX) break;
      if (socialCounterMode(k) === null || typeof v !== "number" || !Number.isFinite(v)) continue;
      out.counters[k] = intIn(v, 0, SOCIAL_COUNTER_CAP);
      n++;
    }
  }
  if (r.ach !== null && typeof r.ach === "object" && !Array.isArray(r.ach)) {
    let n = 0;
    for (const [k, v] of Object.entries(r.ach as Record<string, unknown>)) {
      if (n >= SOCIAL_ACH_MAX) break;
      if (!ACH_ID_RE.test(k) || typeof v !== "string") continue;
      out.ach[k] = v.slice(0, 40);
      n++;
    }
  }
  out.title = typeof r.title === "string" && TITLE_ID_RE.test(r.title) ? r.title : null;
  return out;
}

/** Giá trị bộ đếm `key` (0 nếu chưa có); chỉ thuộc tính RIÊNG. */
export function socialCounterOf(social: SoulSocial | undefined, key: string): number {
  if (!social || !hasOwn(social.counters, key)) return 0;
  const v = social.counters[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Ghi nhận `value` cho bộ đếm `key` theo chế độ của nó: `add` cộng thêm `floor(value)` (>= 0), `max` đặt `max(hiện có, floor(value))`; kẹp `SOCIAL_COUNTER_CAP`. Thuần: không sửa đối số.
 * Khoá lạ, giá trị không hữu hạn / không dương, hoặc quá `SOCIAL_COUNTER_KEYS_MAX` khoá mới -> `changed: false`, trả lại đúng đối tượng cũ.
 */
export function socialTrack(
  social: SoulSocial | undefined,
  key: unknown,
  value: unknown,
): { social: SoulSocial; changed: boolean } {
  const base = social ?? newSocial();
  const mode = socialCounterMode(key);
  if (mode === null || typeof value !== "number" || !Number.isFinite(value) || value < 1)
    return { social: base, changed: false };
  const k = key as string;
  const has = hasOwn(base.counters, k);
  if (!has && Object.keys(base.counters).length >= SOCIAL_COUNTER_KEYS_MAX)
    return { social: base, changed: false };
  const cur = socialCounterOf(base, k);
  const next = Math.min(
    SOCIAL_COUNTER_CAP,
    mode === "add" ? cur + Math.floor(value) : Math.max(cur, Math.floor(value)),
  );
  if (has && next === cur) return { social: base, changed: false };
  return { social: { ...base, counters: { ...base.counters, [k]: next } }, changed: true };
}

/** Ghi thành tựu `id` đã đạt lúc `at` (ISO). IDEMPOTENT: đã có thì trả lại đúng đối tượng cũ (`granted: false`, giữ thời điểm đầu). id sai văn phạm / quá `SOCIAL_ACH_MAX` -> không ghi. */
export function socialGrant(
  social: SoulSocial | undefined,
  id: unknown,
  at: string,
): { social: SoulSocial; granted: boolean } {
  const base = social ?? newSocial();
  if (typeof id !== "string" || !ACH_ID_RE.test(id)) return { social: base, granted: false };
  if (hasOwn(base.ach, id)) return { social: base, granted: false };
  if (Object.keys(base.ach).length >= SOCIAL_ACH_MAX) return { social: base, granted: false };
  return { social: { ...base, ach: { ...base.ach, [id]: at.slice(0, 40) } }, granted: true };
}

/**
 * Ghi MỘT trận PK đã phân thắng thua cho linh hồn này: cộng `pk.won` hoặc `pk.lost` VÀ bộ đếm `pk_won` / `pk_lost` cùng lúc (một nguồn, không lệch), kẹp `SOCIAL_PK_CAP`. Thuần.
 * Chống đổi thắng (một cặp tối đa `BOARD_PK_PAIR_DAY_CAP` thắng mỗi ngày) là việc của máy chủ TRƯỚC khi gọi (sổ cặp trong bộ nhớ, `social.ts`).
 */
export function socialPkRecord(social: SoulSocial | undefined, result: "won" | "lost"): SoulSocial {
  const base = social ?? newSocial();
  const pk = {
    won: Math.min(SOCIAL_PK_CAP, base.pk.won + (result === "won" ? 1 : 0)),
    lost: Math.min(SOCIAL_PK_CAP, base.pk.lost + (result === "lost" ? 1 : 0)),
  };
  const key = result === "won" ? "pk_won" : "pk_lost";
  return socialTrack({ ...base, pk }, key, 1).social;
}
