// Luân hồi: hợp đồng giữa client và server (M3 bước 2). Thiết kế đã review: docs/THIET_KE_LUAN_HOI.md.
//
// Chết thật = hết một KIẾP: nhân vật của kiếp đó mất hẳn, CHÂN LINH (linh hồn) đầu thai làm lại từ đầu và mang theo
// DUYÊN (điểm luân hồi) tính theo thành tựu của kiếp vừa qua; Duyên mở khóa lợi ích vĩnh viễn ở TAM SINH THẠCH.
// Server giữ mọi dữ liệu và quyết định mọi kết quả (cộng Duyên, mua, đầu thai); client chỉ gửi ý định và hiển thị.
// Dữ liệu chân linh là dữ liệu riêng: chỉ gửi cho chủ, không vào state chung.
//
// Mọi hàm ở đây là hàm thuần dùng chung cho client (hiển thị đúng số server tính) và server (kết quả thật).
import { REALMS, expToNext, stepOf } from "./realms";
import { sanitizeEngraved } from "./skills";

// ---------------------------------------------------------------------------------------------------------------
// Duyên (điểm luân hồi)
// ---------------------------------------------------------------------------------------------------------------

/** Kiếp chết trong bấy nhiêu phút đầu, hoặc còn ở Phàm Nhân, không tính là một kiếp: 0 Duyên, bộ đếm kiếp không tăng. */
export const MIN_LIFE_MINUTES_FOR_KIEP = 2;
/** Mỗi bấy nhiêu phút chơi được 1 điểm thời gian, tối đa `DUYEN_TIME_CAP`. */
export const DUYEN_MINUTES_PER_PT = 9;
export const DUYEN_TIME_CAP = 15;
/** Mỗi trùm đã hạ được bấy nhiêu điểm, tối đa `DUYEN_BOSS_CAP`. */
export const DUYEN_BOSS_EACH = 3;
export const DUYEN_BOSS_CAP = 15;
/** Số kiếp gần nhất giữ lại trong `Soul.history`. */
export const HISTORY_MAX = 20;
/** Trần an toàn của số Duyên / số kiếp khi đọc từ file (không tin file). */
export const DUYEN_CAP = 1_000_000_000;
export const KIEP_CAP = 1_000_000;

/**
 * Điểm mỗi bậc nhỏ của cảnh giới `realm`: Phàm Nhân 0; Luyện Khí 2; Trúc Cơ 12; Kim Đan 40; từ Kim Đan trở đi mỗi cảnh giới gấp 5 lần
 * cảnh giới trước. Kim Đan là 40 chứ không phải 60 (= 12 x 5, bản đầu khi chưa có nội dung): thanh Kim Đan sau M6 dài ~5 giờ chứ
 * không 5 lần Trúc Cơ, nên 60 làm Duyên / giờ ở Kim Đan hậu kỳ vọt lên ~1,4 lần Luyện Khí tầng 5 (phá mục tiêu "mọi cách chơi
 * tương đương" ~1,3 lần); 40 giữ dải 22-28 Duyên / giờ (`docs/CAN_BANG.md`, mục "Luân hồi khi cày tới Kim Đan").
 */
export function duyenPerStep(realm: number): number {
  if (!Number.isInteger(realm) || realm < 1) return 0;
  if (realm === 1) return 2;
  if (realm === 2) return 12;
  return 40 * Math.pow(5, realm - 3);
}

/** Thành tựu của một kiếp, đầu vào của `calcDuyen`. Mọi trường được làm sạch (số rác coi như 0). */
export interface LifeStats {
  realm: number;
  tier: number;
  /** Tu vi đang có trong bậc hiện tại (để tính phần dở dang của bậc) */
  exp: number;
  /** Thời gian chơi thật (ms): nhân vật ở trong game, không tính hồn lìa xác và Hoàng Tuyền */
  playMs: number;
  /** Số trùm đã hạ */
  bossKills: number;
}

const nonNeg = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/** Đưa (realm, tier) rác về một bậc có thật. */
function cleanStep(realm: unknown, tier: unknown): { realm: number; tier: number } {
  const r = Math.min(
    REALMS.length - 1,
    typeof realm === "number" && Number.isFinite(realm) ? Math.max(0, Math.floor(realm)) : 0,
  );
  const t = Math.min(
    REALMS[r].tiers.length - 1,
    typeof tier === "number" && Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0,
  );
  return { realm: r, tier: t };
}

/** Kiếp này có được tính (đủ lâu và đã qua Phàm Nhân) không. */
export function countsAsKiep(life: LifeStats): boolean {
  const { realm, tier } = cleanStep(life?.realm, life?.tier);
  return nonNeg(life?.playMs) / 60_000 >= MIN_LIFE_MINUTES_FOR_KIEP && stepOf(realm, tier) >= 1;
}

/**
 * Duyên nhận được khi kết thúc một kiếp (số nguyên >= 0):
 * `floor(stepPts + timePts + bossPts)`, xem docs/THIET_KE_LUAN_HOI.md mục 5.
 * Không bao giờ trả NaN / âm / vô cùng, với bất cứ đầu vào nào.
 */
export function calcDuyen(life: LifeStats): number {
  if (!life || !countsAsKiep(life)) return 0;
  const { realm, tier } = cleanStep(life.realm, life.tier);
  let pts = 0;
  // Các bậc ĐÃ VƯỢT QUA, tính theo cảnh giới nơi công sức đó được bỏ ra: cảnh giới trước thì đủ `tiers.length` bậc, cảnh giới
  // đang đứng thì `tier` bậc (bậc hiện tại chưa vượt qua, chỉ có phần dở dang bên dưới). Không có "tiền vào cảnh giới":
  // tính `tier + 1` (như bản đầu) làm bước đầu của mỗi cảnh giới nhận điểm cả cảnh giới đó mà chưa bỏ công sức nào, nên
  // Duyên / giờ vọt lên ở đầu Trúc Cơ (gấp ~1.44 lần cuối Trúc Cơ, `can-bang` #151) và phá mục tiêu "mọi cách chơi như nhau".
  for (let r = 1; r <= realm; r++)
    pts += duyenPerStep(r) * (r < realm ? REALMS[r].tiers.length : tier);
  // Phần dở dang của bậc hiện tại: tu vi / thanh tu vi, tính theo điểm một bậc của cảnh giới đang đứng
  const bar = expToNext(realm, tier);
  const frac = bar > 0 ? Math.min(1, nonNeg(life.exp) / bar) : 0;
  pts += duyenPerStep(realm) * frac;
  pts += Math.min(DUYEN_TIME_CAP, Math.floor(nonNeg(life.playMs) / 60_000 / DUYEN_MINUTES_PER_PT));
  pts += Math.min(DUYEN_BOSS_CAP, DUYEN_BOSS_EACH * Math.floor(nonNeg(life.bossKills)));
  return Math.max(0, Math.floor(pts));
}

// ---------------------------------------------------------------------------------------------------------------
// Tam Sinh Thạch: bảng mở khóa
// ---------------------------------------------------------------------------------------------------------------

/** Mục mở khóa nhiều nấc. Nấc `n` (1..costs.length) mở bằng `costs[n - 1]` Duyên và có hiệu lực `effects[n - 1]`. */
export interface UnlockDef {
  id: string;
  name: string;
  desc: string;
  /** Giá từng nấc (Duyên), tăng dần */
  costs: readonly number[];
  /** Mô tả hiệu lực từng nấc (hiện cho người chơi) */
  effects: readonly string[];
}

export const UNLOCKS: readonly UnlockDef[] = [
  {
    id: "du_am",
    name: "Dư âm tu hành",
    desc: "Kinh mạch còn nhớ đường đã đi: tăng tốc độ tu luyện (hạ quái và đả tọa).",
    costs: [12, 18, 26, 38, 55, 80, 115, 165, 235, 335],
    effects: Array.from({ length: 10 }, (_, i) => `+${(i + 1) * 10}% tốc độ tu luyện`),
  },
  {
    id: "kim_nang",
    name: "Kim nang",
    desc: "Mang một phần Linh thạch qua kiếp (phần vượt trần mất theo kiếp).",
    costs: [10, 30, 70, 150],
    effects: [
      "Mang tối đa 20 Linh thạch",
      "Mang tối đa 60 Linh thạch",
      "Mang tối đa 150 Linh thạch",
      "Mang tối đa 400 Linh thạch",
    ],
  },
  {
    id: "le_ma",
    name: "Lễ Mạnh Bà",
    desc: "Quà đầu thai: đan hồi phục có sẵn trong túi kiếp mới.",
    costs: [6, 18, 45],
    effects: [
      "3 Hồi Huyết Đan + 3 Hồi Linh Đan",
      "6 Hồi Huyết Đan + 6 Hồi Linh Đan",
      "10 Hồi Huyết Đan + 10 Hồi Linh Đan",
    ],
  },
  {
    id: "ky_vat",
    name: "Ký vật",
    desc: "Gửi lại trang bị qua Hoàng Tuyền, đầu thai vẫn còn.",
    costs: [25, 60, 140],
    effects: ["Giữ lại 1 món trang bị", "Giữ lại 2 món trang bị", "Giữ lại 3 món trang bị"],
  },
];

export const UNLOCK_BY_ID: Readonly<Record<string, UnlockDef>> = Object.fromEntries(
  UNLOCKS.map((u) => [u.id, u]),
);

/** Tra mục mở khóa theo id không tin được (tin nhắn client, file lưu): `UNLOCK_BY_ID["constructor"]` không phải `undefined`. */
export function unlockOf(id: unknown): UnlockDef | undefined {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(UNLOCK_BY_ID, id)
    ? UNLOCK_BY_ID[id]
    : undefined;
}

/** Xuất thân: mở một lần, chọn một (hoặc "Phàm gia" không thưởng) khi đầu thai. Hệ số nhân lên chỉ số GỐC theo cảnh giới. */
export interface OriginDef {
  id: string;
  name: string;
  desc: string;
  /** Giá mở (Duyên); 0 = luôn có */
  cost: number;
  mult: StatMult;
}

/** Hệ số nhân chỉ số gốc (1 = không đổi). Dùng làm tham số cuối của `statsFor`. */
export type StatMult = Partial<Record<"maxHp" | "maxMp" | "atk", number>>;

export const DEFAULT_ORIGIN = "pham_gia";

export const ORIGINS: readonly OriginDef[] = [
  {
    id: DEFAULT_ORIGIN,
    name: "Phàm gia",
    desc: "Con nhà bình thường, không thiên vị.",
    cost: 0,
    mult: {},
  },
  { id: "kiem_khach", name: "Kiếm khách", desc: "+12% công.", cost: 20, mult: { atk: 1.12 } },
  { id: "the_tu", name: "Thể tu", desc: "+15% khí huyết tối đa.", cost: 20, mult: { maxHp: 1.15 } },
  {
    id: "linh_tu",
    name: "Linh tu",
    desc: "+15% linh lực tối đa.",
    cost: 20,
    mult: { maxMp: 1.15 },
  },
];

export function originOf(id: unknown): OriginDef | undefined {
  return typeof id === "string" ? ORIGINS.find((o) => o.id === id) : undefined;
}

/** Hệ số chỉ số của một xuất thân (id lạ / bỏ trống: không thưởng). */
export function originMult(id: unknown): StatMult {
  return originOf(id)?.mult ?? {};
}

/** Số nấc đã mở của mục `id`, kẹp về [0, tối đa]. */
export function levelOf(unlocks: Readonly<Record<string, number>> | undefined, id: string): number {
  const def = unlockOf(id);
  const v = unlocks && Object.prototype.hasOwnProperty.call(unlocks, id) ? unlocks[id] : 0;
  if (!def || typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(def.costs.length, Math.max(0, Math.floor(v)));
}

type Unlocks = Readonly<Record<string, number>> | undefined;

/** Hệ số nhân tốc độ tu luyện (1 .. 2): áp lên tu vi từ hạ quái và đả tọa. */
export function expMultOf(unlocks: Unlocks): number {
  return 1 + 0.1 * levelOf(unlocks, "du_am");
}
const CARRY_CAPS = [0, 20, 60, 150, 400];
/** Số Linh thạch tối đa mang qua kiếp (0 nếu chưa mở). */
export function coinCarryCap(unlocks: Unlocks): number {
  return CARRY_CAPS[levelOf(unlocks, "kim_nang")];
}
const START_PACK = [0, 3, 6, 10];
/** Đồ có sẵn trong túi kiếp mới. */
export function startPackOf(unlocks: Unlocks): { itemId: string; qty: number }[] {
  const n = START_PACK[levelOf(unlocks, "le_ma")];
  return n > 0
    ? [
        { itemId: "hoi_huyet_dan", qty: n },
        { itemId: "hoi_linh_dan", qty: n },
      ]
    : [];
}
/** Số món trang bị được giữ lại qua kiếp. */
export function keepSlotsOf(unlocks: Unlocks): number {
  return levelOf(unlocks, "ky_vat");
}

// ---------------------------------------------------------------------------------------------------------------
// Chân linh (dữ liệu lưu của server) và làm sạch
// ---------------------------------------------------------------------------------------------------------------

export interface SoulHistoryEntry {
  kiep: number;
  /** Bậc cao nhất đạt được (`stepOf`) */
  step: number;
  minutes: number;
  gain: number;
  at: string;
}

export interface Soul {
  v: 1;
  /** Khoá: đạo hiệu chuẩn hoá (bước 3 đổi thành id tài khoản) */
  id: string;
  /** Số kiếp đã bắt đầu (kiếp hiện tại), từ 1 */
  kiep: number;
  /** Duyên chưa tiêu */
  duyen: number;
  /** Tổng Duyên đã nhận (thống kê) */
  duyenTotal: number;
  /** id mục -> số nấc đã mở */
  unlocks: Record<string, number>;
  /** Xuất thân đã mở (không gồm Phàm gia) */
  origins: string[];
  /**
   * Công pháp đã KHẮC vào chân linh (M7): giữ qua kiếp (`ENGRAVE_COSTS`, `skills.ts`); id `SkillDef`, không trùng, tối đa `ENGRAVE_MAX`.
   * Số được khắc tối đa theo nấc `unlocks.khac` do server kiểm khi mua (M7.2, #503); dữ liệu cũ không có trường này = [].
   */
  engraved: string[];
  /** Thành tựu cao nhất mọi kiếp */
  best: { step: number; realm: number; tier: number };
  /** lifeId cuối cùng đã cộng Duyên: chống cộng hai lần khi chạy lại sau sập máy */
  lastCreditedLife: string;
  history: SoulHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function newSoul(id: string, now: string): Soul {
  return {
    v: 1,
    id,
    kiep: 1,
    duyen: 0,
    duyenTotal: 0,
    unlocks: {},
    origins: [],
    engraved: [],
    best: { step: 0, realm: 0, tier: 0 },
    lastCreditedLife: "",
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

const intIn = (v: unknown, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Đọc chân linh từ file lưu: không tin giá trị trong file. Số hữu hạn và kẹp về khoảng, bỏ id mục / xuất thân lạ,
 * nấc không vượt tối đa, `duyen >= 0`, lịch sử cắt `HISTORY_MAX`. Trả về `null` nếu `raw` không phải object.
 */
export function sanitizeSoul(raw: unknown, now = ""): Soul | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const soul = newSoul(str(r.id, 64), str(r.createdAt, 40) || now);
  soul.kiep = intIn(r.kiep, 1, KIEP_CAP);
  soul.duyen = intIn(r.duyen, 0, DUYEN_CAP);
  soul.duyenTotal = Math.max(soul.duyen, intIn(r.duyenTotal, 0, DUYEN_CAP));
  const un =
    r.unlocks !== null && typeof r.unlocks === "object"
      ? (r.unlocks as Record<string, unknown>)
      : {};
  for (const def of UNLOCKS) {
    const lv = levelOf(un as Record<string, number>, def.id);
    if (lv > 0) soul.unlocks[def.id] = lv;
  }
  const og = Array.isArray(r.origins) ? r.origins : [];
  for (const o of ORIGINS) if (o.cost > 0 && og.includes(o.id)) soul.origins.push(o.id);
  soul.engraved = sanitizeEngraved(r.engraved);
  const b =
    r.best !== null && typeof r.best === "object" ? (r.best as Record<string, unknown>) : {};
  const { realm, tier } = cleanStep(b.realm, b.tier);
  soul.best = { step: stepOf(realm, tier), realm, tier };
  soul.lastCreditedLife = str(r.lastCreditedLife, 64);
  const hist = Array.isArray(r.history) ? r.history.slice(-HISTORY_MAX) : [];
  for (const h of hist) {
    if (h === null || typeof h !== "object") continue;
    const e = h as Record<string, unknown>;
    soul.history.push({
      kiep: intIn(e.kiep, 1, KIEP_CAP),
      step: intIn(e.step, 0, stepOf(REALMS.length - 1, REALMS[REALMS.length - 1].tiers.length - 1)),
      minutes: intIn(e.minutes, 0, 10_000_000),
      gain: intIn(e.gain, 0, DUYEN_CAP),
      at: str(e.at, 40),
    });
  }
  soul.updatedAt = str(r.updatedAt, 40) || soul.createdAt;
  return soul;
}

// ---------------------------------------------------------------------------------------------------------------
// Mua mở khóa và đầu thai (kiểm hợp lệ dùng chung)
// ---------------------------------------------------------------------------------------------------------------

/** Mã mua xuất thân trong `SoulBuyMsg.id`: `xuat_than:<id xuất thân>`. */
export const ORIGIN_BUY_PREFIX = "xuat_than:";

export type BuyResult =
  { ok: true; soul: Soul; cost: number } | { ok: false; reason: "unknown" | "max" | "poor" };

/** Giá của lần mua kế tiếp cho `id` (mục nhiều nấc hoặc `xuat_than:<id>`); `null` nếu không mua được nữa / id lạ. */
export function nextCost(soul: Pick<Soul, "unlocks" | "origins">, id: unknown): number | null {
  if (typeof id !== "string") return null;
  if (id.startsWith(ORIGIN_BUY_PREFIX)) {
    const o = originOf(id.slice(ORIGIN_BUY_PREFIX.length));
    return o && o.cost > 0 && !soul.origins.includes(o.id) ? o.cost : null;
  }
  const def = unlockOf(id);
  if (!def) return null;
  const lv = levelOf(soul.unlocks, id);
  return lv < def.costs.length ? def.costs[lv] : null;
}

/**
 * Mua nấc kế tiếp / xuất thân: trừ Duyên và tăng nấc trong MỘT thao tác (không bao giờ trừ mà không tăng).
 * Thuần: trả chân linh mới, không sửa đối số. Server gọi trong `SoulStore.update`.
 */
export function buyUnlock(soul: Soul, id: unknown): BuyResult {
  const cost = nextCost(soul, id);
  if (cost === null) {
    const known =
      typeof id === "string" &&
      (id.startsWith(ORIGIN_BUY_PREFIX)
        ? !!originOf(id.slice(ORIGIN_BUY_PREFIX.length))
        : !!unlockOf(id));
    return { ok: false, reason: known ? "max" : "unknown" };
  }
  if (soul.duyen < cost) return { ok: false, reason: "poor" };
  const next: Soul = {
    ...soul,
    unlocks: { ...soul.unlocks },
    origins: [...soul.origins],
    duyen: soul.duyen - cost,
  };
  if ((id as string).startsWith(ORIGIN_BUY_PREFIX))
    next.origins.push((id as string).slice(ORIGIN_BUY_PREFIX.length));
  else next.unlocks[id as string] = levelOf(soul.unlocks, id as string) + 1;
  return { ok: true, soul: next, cost };
}

// ---------------------------------------------------------------------------------------------------------------
// Tin nhắn
// ---------------------------------------------------------------------------------------------------------------

/** Tóm tắt kiếp vừa kết thúc, hiện ở màn hình Hoàng Tuyền. */
export interface LifeSummary {
  kiep: number;
  realm: number;
  tier: number;
  minutes: number;
  kills: number;
  bossKills: number;
  /** Duyên nhận được */
  gain: number;
}

/** Phần chân linh gửi cho chủ (không có lịch sử, id, thời gian). */
export interface SoulView {
  kiep: number;
  duyen: number;
  unlocks: Record<string, number>;
  origins: string[];
}

export function soulView(soul: Soul): SoulView {
  return {
    kiep: soul.kiep,
    duyen: soul.duyen,
    unlocks: { ...soul.unlocks },
    origins: [...soul.origins],
  };
}

// ---------- client -> server (chỉ hợp lệ khi đang ở Hoàng Tuyền) ----------
/** Mua nấc kế tiếp của mục `id` (`UNLOCKS`), hoặc xuất thân `xuat_than:<id>`. */
export interface SoulBuyMsg {
  id: string;
}
/** Đầu thai: chọn xuất thân (bỏ trống = Phàm gia) và các trang bị giữ lại (id vật phẩm, tối đa `keepSlotsOf`). */
export interface RebirthMsg {
  origin?: string;
  keep: string[];
}

// ---------- server -> client (chỉ gửi cho chủ) ----------
/** Vừa chết thật, hoặc đăng nhập lại khi đang ở Hoàng Tuyền: hiện màn hình Hoàng Tuyền. */
export interface LimboMsg {
  summary: LifeSummary;
  soul: SoulView;
  /** Trang bị có thể giữ lại (id vật phẩm; một id có thể xuất hiện nhiều lần nếu có nhiều món cùng loại) */
  keepable: string[];
}
/** Chân linh vừa đổi (sau khi mua). */
export type SoulMsg = SoulView;
/** Đã đầu thai xong: màn hình Hoàng Tuyền đóng, kiếp mới bắt đầu. */
export interface RebornMsg {
  kiep: number;
}

export interface RebirthChoice {
  origin: string;
  keep: string[];
}

/**
 * Kiểm `RebirthMsg` với chân linh và danh sách `keepable` đã chụp lúc chết. Trả lựa chọn đã chuẩn hoá,
 * hoặc `null` nếu không hợp lệ (xuất thân chưa mở / lạ, giữ quá số ô, giữ món không có, sai kiểu).
 */
export function validateRebirth(
  soul: Pick<Soul, "unlocks" | "origins">,
  msg: unknown,
  keepable: readonly string[],
): RebirthChoice | null {
  if (msg === null || typeof msg !== "object") return null;
  const m = msg as { origin?: unknown; keep?: unknown };
  let origin = DEFAULT_ORIGIN;
  if (m.origin !== undefined && m.origin !== DEFAULT_ORIGIN) {
    const o = originOf(m.origin);
    if (!o || o.cost <= 0 || !soul.origins.includes(o.id)) return null;
    origin = o.id;
  }
  if (!Array.isArray(m.keep) || m.keep.length > keepSlotsOf(soul.unlocks)) return null;
  const pool = [...keepable];
  for (const k of m.keep) {
    const i = typeof k === "string" ? pool.indexOf(k) : -1;
    if (i < 0) return null;
    pool.splice(i, 1);
  }
  return { origin, keep: [...(m.keep as string[])] };
}
