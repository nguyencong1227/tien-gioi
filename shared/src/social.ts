// HỢP ĐỒNG M9 XÃ HỘI (QUYET_DINH_M3 mục 50, docs/PHAN_CONG_M9.md, issue M9.1 #1020): bảng xếp hạng, trùm thế giới theo giờ, thành tựu + danh hiệu.
// Mọi thứ ở đây là THUẦN (không I/O, không đồng hồ): server (M9.2-M9.5), giao diện (M9.6-M9.8), nội dung (M9.9-M9.10) và test (M9.12-M9.14) dùng chung một nguồn.
// `PROTOCOL_VERSION` KHÔNG tăng: chỉ THÊM tin / trường tuỳ chọn, client cũ bỏ qua. Phần lưu theo linh hồn (`Soul.social`, bộ đếm, `socialTrack`) ở `social-soul.ts` (không vòng import với `reincarnation.ts`).
//
// Nguyên tắc (chốt trong docs/PHAN_CONG_M9.md):
//  - Server quyết định mọi kết quả; client chỉ hỏi và hiển thị. Thời gian trong MỌI tin là TƯƠNG ĐỐI (`ageMs`, `startsInMs`, `endsInMs`): đếm ngược không lệch theo đồng hồ máy người chơi.
//  - Số liệu bảng xếp hạng gửi THÔ (cảnh giới, bậc, kiếp, điểm...) để client định dạng bằng `shared/`; tiêu đề cột lấy từ `BOARD_COLUMNS`. Chỉ hiện ĐẠO HIỆU (không id, không tài khoản).
//  - `Player.title` là ID NGẮN (`TITLE_ID_RE`); client tra `TITLES` ra chữ. `achievements` KHÔNG gửi lại định nghĩa: client có `ACHIEVEMENTS` / `TITLES` và tự tính tiến độ từ `cond`.
//  - Dữ liệu (`WORLD_BOSS_SCHEDULE`, `ACHIEVEMENTS`, `TITLES`) là việc của D / E / G; luật kiểm `worldBossViolations` / `achievementViolations` / `titleViolations` đỏ nếu dữ liệu sai.
import { MONSTER_BY_ID } from "./game";
import { MAP_BY_ID, isDungeonMap } from "./map";
import { ITEM_BY_ID } from "./items";
import { REALMS, stepOf } from "./realms";
import { bossDefOf } from "./bosses";
import { KIEP_CAP } from "./reincarnation";
import {
  SOCIAL_COUNTER_CAP,
  TITLE_ID_RE,
  socialCounterMode,
  socialCounterOf,
  type SoulSocial,
} from "./social-soul";

export * from "./social-soul";

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** Chữ Hán / CJK (quy tắc "không chữ Hán" của dự án). */
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ID_RE = /^[a-z0-9][a-z0-9_]{0,31}$/;
const lenOf = (s: string): number => [...s].length;

// ---------- Tên tin nhắn ----------

export const SOCIAL_MSG = {
  /** Client -> server: xin một bảng (giới hạn tần suất). */
  boardsGet: "boardsGet",
  /** Server -> client (chỉ người hỏi). */
  boards: "boards",
  /**
   * Client -> server (không tải): xin trạng thái trùm thế giới MỘT lần (lúc mở tab "Sự kiện", người ở BẤT KỲ phòng nào). Server trả MỘT tin `worldBoss` cho lần xảy ra đang diễn ra (`live`) hoặc sắp tới nhất
   * (`soon`, `startsInMs` BẤT KỲ độ lớn); không có lịch (rỗng / `WORLD_BOSS=off`) thì `phase: "none"` (client phân biệt "chưa có sự kiện" với "chưa nhận được tin"). Giới hạn tần suất.
   */
  worldBossGet: "worldBossGet",
  /**
   * Server -> client: sự kiện trùm thế giới. Gửi cho MỌI người chơi trực tuyến ở MỌI phòng (qua `Hub`) ở các mốc: báo trước (`soon`, 10 / 5 / 1 phút theo `announceMin`), xuất hiện (`live`), hạ gục / bỏ chạy /
   * huỷ (`ended`); trong lúc `live`, người đang Ở PHÒNG ĐÍCH nhận thêm bản cập nhật `hpPct` / `top` / `mine` mỗi `WORLD_BOSS_BOARD_EVERY_MS` (người phòng khác chỉ nhận khi hỏi bằng `worldBossGet`).
   * Thời gian luôn TƯƠNG ĐỐI (client cộng mốc nhận tin), kể cả khi ở phòng khác.
   */
  worldBoss: "worldBoss",
  /**
   * Client -> server: đeo / gỡ danh hiệu. KHÔNG có tin trả lời riêng: server LUÔN gửi lại `achievements` (có `title` hiện tại) sau mỗi `titleSet`, thành công hay bị từ chối (chưa mở danh hiệu / id lạ);
   * client vẽ từ tin đó, không đoán trước.
   */
  titleSet: "titleSet",
  /** Client -> server: xin sổ thành tựu (lúc mở bảng). */
  achievementsGet: "achievementsGet",
  /** Server -> client (chỉ chủ). */
  achievements: "achievements",
  /** Server -> client (chỉ chủ): vừa đạt một thành tựu (toast). */
  achievementNew: "achievementNew",
} as const;

// ---------- Bảng xếp hạng ----------

export const BOARD_IDS = ["tuvi", "linhhon", "tongmon", "pk"] as const;
export type BoardId = (typeof BOARD_IDS)[number];

/** Số dòng mỗi bảng. */
export const BOARD_SIZE = 20;
/** Làm mới bản chụp mỗi chừng này (ms): KHÔNG mỗi tick. */
export const BOARD_REFRESH_MS = 5 * 60_000;
/** Số bản ghi tối đa một lần quét kho để xếp hạng. */
export const BOARD_SCAN_MAX = 5000;
/** Bảng PK: cần ít nhất chừng này trận (thắng + thua) mới lên bảng. */
export const BOARD_PK_MIN_GAMES = 10;
/** Bảng PK: một CẶP linh hồn chỉ tính tối đa chừng này trận thắng mỗi ngày (chống đổi thắng). */
export const BOARD_PK_PAIR_DAY_CAP = 3;

/** Một dòng của bảng (số liệu THÔ; trường nào có phụ thuộc bảng, xem `BOARD_COLUMNS`). `test: true` = tài khoản có `TEST_EXP_MULT` (chỉ xuất hiện ở các bảng KHÔNG phải `tuvi`). */
export interface BoardRow {
  rank: number;
  /** Đạo hiệu (bảng `tongmon`: tên tông môn). */
  name: string;
  titleId?: string;
  test?: true;
  realm?: number;
  tier?: number;
  exp?: number;
  /** Bậc cảnh giới (`stepOf`). */
  step?: number;
  kiep?: number;
  /** Cấp tông (`sectLevelOf`). */
  level?: number;
  /** Tổng cống hiến của tông. */
  points?: number;
  members?: number;
  won?: number;
  lost?: number;
}

/**
 * Hiển thị cột: `realm` (bảng `tuvi`) = `realmLabel(row.realm, row.tier)`; `step` (bảng `linhhon`, bậc cao nhất từng đạt) = `realmOfStep(row.step)` rồi `realmLabel`; `level` = cấp tông; còn lại là số thô.
 */
export interface BoardColumn {
  /** Trường của `BoardRow` cần hiển thị. */
  key: Exclude<keyof BoardRow, "rank" | "name" | "titleId" | "test">;
  /** Tiêu đề cột (tiếng Việt). */
  label: string;
}

/** Cột của từng bảng, theo thứ tự hiển thị (sau cột hạng và đạo hiệu). */
export const BOARD_COLUMNS: Readonly<Record<BoardId, readonly BoardColumn[]>> = {
  tuvi: [
    { key: "realm", label: "Cảnh giới" },
    { key: "exp", label: "Tu vi" },
  ],
  linhhon: [
    { key: "step", label: "Cảnh giới cao nhất" },
    { key: "kiep", label: "Kiếp" },
  ],
  tongmon: [
    { key: "level", label: "Cấp" },
    { key: "points", label: "Cống hiến" },
    { key: "members", label: "Thành viên" },
  ],
  pk: [
    { key: "won", label: "Thắng" },
    { key: "lost", label: "Thua" },
  ],
};

export const BOARD_LABELS: Readonly<Record<BoardId, string>> = {
  tuvi: "Tu vi",
  linhhon: "Linh hồn",
  tongmon: "Tông môn",
  pk: "Thách đấu",
};

/** Đọc `boardsGet`: `board` phải là bảng CÓ THẬT (tra bằng `hasOwnProperty` qua danh sách), hoặc `null`. */
export function parseBoardsGet(raw: unknown): BoardId | null {
  if (raw === null || typeof raw !== "object") return null;
  const b = (raw as { board?: unknown }).board;
  return typeof b === "string" && (BOARD_IDS as readonly string[]).includes(b)
    ? (b as BoardId)
    : null;
}

/** Lý do không có hạng: `test` (tài khoản thử nghiệm không vào bảng tu vi), `min_games` (PK chưa đủ `BOARD_PK_MIN_GAMES` trận, `need` = số trận còn thiếu), `none` (chưa có dữ liệu / ngoài top quét). */
export type BoardNoRank = "test" | "min_games" | "none";

export interface BoardMine {
  /** Hạng của mình (1 = đầu), `null` nếu không có hạng. */
  rank: number | null;
  reason?: BoardNoRank;
  need?: number;
  /** Dòng của chính mình (kể cả khi ngoài top 20) để hiện số liệu; vắng khi `rank` null mà không có số liệu. */
  row?: BoardRow;
}

/** Server -> client: một bảng. `ageMs` = tuổi bản chụp (làm mới mỗi `BOARD_REFRESH_MS`). */
export interface BoardsMsg {
  board: BoardId;
  rows: BoardRow[];
  mine: BoardMine;
  ageMs: number;
}

const num = (v: number | undefined): number => (typeof v === "number" ? v : 0);

/**
 * So hai dòng của `board` (âm = `a` đứng trước). Khoá: `tuvi` (cảnh giới, bậc, tu vi giảm dần), `linhhon` (bậc cao nhất, kiếp), `tongmon` (cấp, cống hiến), `pk` (thắng, rồi tỉ lệ thắng).
 * Mọi bảng đồng hạng thì xếp theo đạo hiệu (không phân biệt hoa thường) để kết quả TẤT ĐỊNH.
 */
export function compareBoardRows(board: BoardId, a: BoardRow, b: BoardRow): number {
  let d = 0;
  switch (board) {
    case "tuvi":
      d = num(b.realm) - num(a.realm) || num(b.tier) - num(a.tier) || num(b.exp) - num(a.exp);
      break;
    case "linhhon":
      d = num(b.step) - num(a.step) || num(b.kiep) - num(a.kiep);
      break;
    case "tongmon":
      d = num(b.level) - num(a.level) || num(b.points) - num(a.points);
      break;
    case "pk": {
      const ga = num(a.won) + num(a.lost);
      const gb = num(b.won) + num(b.lost);
      d = num(b.won) - num(a.won) || (gb ? num(b.won) / gb : 0) - (ga ? num(a.won) / ga : 0);
      break;
    }
  }
  if (d !== 0) return d;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "vi");
}

/** Xếp `rows` theo `board` (không sửa đối số), cắt `BOARD_SIZE`, đánh `rank` 1..n. */
export function rankBoard(
  board: BoardId,
  rows: readonly BoardRow[],
  size = BOARD_SIZE,
): BoardRow[] {
  return [...rows]
    .sort((a, b) => compareBoardRows(board, a, b))
    .slice(0, size)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------- Trùm thế giới ----------

/** Giờ của lịch trùm thế giới là giờ MÁY CHỦ, cố định UTC+7 (không đổi theo mùa). */
export const WORLD_BOSS_TZ_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;
/** Ngưỡng đóng góp tối thiểu (% máu tối đa của trùm) để được thưởng (chống "ké"). */
export const WORLD_BOSS_MIN_SHARE_PCT = 1.5;
/** Phần HỖ TRỢ (hồi / khiên cho người khác, quy ra sát thương tương đương) tối đa trong tổng điểm đóng góp (%). */
export const WORLD_BOSS_SUPPORT_CAP_PCT = 30;
/** Top bao nhiêu người đóng góp được thêm vật phẩm hiếm. */
export const WORLD_BOSS_TOP_N = 3;
/** Bảng đóng góp gửi cho client tối đa mỗi chừng này (ms), không mỗi tick. */
export const WORLD_BOSS_BOARD_EVERY_MS = 2000;
/** Số dòng `top` trong tin `worldBoss`. */
export const WORLD_BOSS_TOP_SHOWN = 5;

export interface WorldBossReward {
  /** Tu vi nhận khi đóng góp 100% (nhân theo tỉ lệ đóng góp, đi qua `gainExp`). */
  exp: number;
  /** Linh thạch nhận khi đóng góp 100% (nhân theo tỉ lệ, đi qua `changeCoin`). */
  coin: number;
  /** Vật phẩm thêm cho `WORLD_BOSS_TOP_N` người đóng góp cao nhất. */
  top?: { itemId: string; count: number };
}

/** Một khung giờ của lịch (mỗi ngày). `boss`: loài quái có `boss: true` và có bộ chiêu trong `BOSSES`. */
export interface WorldBossSlot {
  id: string;
  /** Giờ máy chủ (UTC+7), 0-23. */
  hour: number;
  minute: number;
  boss: string;
  /** Bản đồ thường (không phải bí cảnh) nơi trùm xuất hiện. */
  mapId: string;
  /** Trùm tồn tại tối đa chừng này phút rồi bỏ chạy. */
  durationMin: number;
  /** Thông báo toàn server trước giờ xuất hiện chừng này phút (giảm dần, vd [10, 5, 1]). */
  announceMin: readonly number[];
  reward: WorldBossReward;
}

/**
 * Lịch trùm thế giới. RỖNG cho tới khi E có dữ liệu thật (M9.10): máy chủ không lập lịch khi rỗng (và `WORLD_BOSS=off`). Dữ liệu thử nghiệm: `sampleWorldBossSchedule()`.
 */
export const WORLD_BOSS_SCHEDULE: readonly WorldBossSlot[] = [];

/** Mẫu 2 khung giờ (12:00 và 21:00) dùng loài trùm có sẵn, cho test và giao diện thử; KHÔNG phải dữ liệu thật. */
export function sampleWorldBossSchedule(): WorldBossSlot[] {
  return [
    {
      id: "mau_trua",
      hour: 12,
      minute: 0,
      boss: "thien_han_vuong",
      mapId: "han_van",
      durationMin: 30,
      announceMin: [10, 5, 1],
      reward: { exp: 1000, coin: 200, top: { itemId: "dai_hoi_huyet_dan", count: 1 } },
    },
    {
      id: "mau_toi",
      hour: 21,
      minute: 0,
      boss: "hac_giao",
      mapId: "am_suong",
      durationMin: 30,
      announceMin: [10, 5, 1],
      reward: { exp: 800, coin: 150 },
    },
  ];
}

/** Đầu ngày (UTC+7) chứa `ms`, tính theo ms của đồng hồ. */
export function worldBossDayStart(ms: number): number {
  return Math.floor((ms + WORLD_BOSS_TZ_OFFSET_MS) / DAY_MS) * DAY_MS - WORLD_BOSS_TZ_OFFSET_MS;
}

export interface WorldBossOccurrence {
  slot: WorldBossSlot;
  startMs: number;
  endMs: number;
}

/** Lần xảy ra của `slot` trong ngày có đầu ngày `dayStartMs`. */
export function worldBossOccurrence(slot: WorldBossSlot, dayStartMs: number): WorldBossOccurrence {
  const startMs = dayStartMs + (slot.hour * 60 + slot.minute) * 60_000;
  return { slot, startMs, endMs: startMs + slot.durationMin * 60_000 };
}

/** Lần xảy ra SỚM NHẤT chưa kết thúc tính từ `nowMs` (đang diễn ra hoặc sắp tới), xét hôm nay và ngày mai; `null` nếu lịch rỗng. */
export function worldBossNext(
  slots: readonly WorldBossSlot[],
  nowMs: number,
): WorldBossOccurrence | null {
  if (!Number.isFinite(nowMs)) return null;
  const today = worldBossDayStart(nowMs);
  let best: WorldBossOccurrence | null = null;
  for (const dayStart of [today, today + DAY_MS])
    for (const s of slots) {
      const o = worldBossOccurrence(s, dayStart);
      if (o.endMs > nowMs && (best === null || o.startMs < best.startMs)) best = o;
    }
  return best;
}

export type WorldBossPhase = "soon" | "live" | "ended";

/** Pha trong tin `worldBoss`: thêm `none` = hiện KHÔNG có sự kiện nào (lịch rỗng / tắt); khi đó `id`, `name`, `mapId` là chuỗi rỗng, không có trường nào khác. */
export type WorldBossMsgPhase = WorldBossPhase | "none";

export function worldBossPhaseAt(o: WorldBossOccurrence, nowMs: number): WorldBossPhase {
  return nowMs < o.startMs ? "soon" : nowMs < o.endMs ? "live" : "ended";
}

/** Các mốc báo trước (phút) của `slot` rơi vào khoảng (`prevMs`, `nowMs`] của lần xảy ra bắt đầu lúc `startMs`: mỗi mốc ĐÚNG MỘT lần khi bộ lập lịch gọi liên tiếp với `prevMs` = lần gọi trước. */
export function worldBossAnnouncements(
  slot: WorldBossSlot,
  startMs: number,
  prevMs: number,
  nowMs: number,
): number[] {
  return slot.announceMin.filter((m) => {
    const at = startMs - m * 60_000;
    return at > prevMs && at <= nowMs;
  });
}

/**
 * Điểm đóng góp của một người: sát thương + hỗ trợ, trong đó hỗ trợ chỉ tính tối đa `WORLD_BOSS_SUPPORT_CAP_PCT` % của TỔNG điểm (nên không "cày hỗ trợ" mà không đánh).
 * Đầu vào không hữu hạn / âm coi là 0.
 */
export function worldBossPoints(damage: number, support: number): number {
  const d = Number.isFinite(damage) && damage > 0 ? damage : 0;
  const s = Number.isFinite(support) && support > 0 ? support : 0;
  const cap = (d * WORLD_BOSS_SUPPORT_CAP_PCT) / (100 - WORLD_BOSS_SUPPORT_CAP_PCT);
  return d + Math.min(s, cap);
}

/** Đủ ngưỡng thưởng chưa: điểm >= `WORLD_BOSS_MIN_SHARE_PCT` % máu tối đa của trùm. */
export function worldBossEligible(points: number, bossMaxHp: number): boolean {
  return (
    Number.isFinite(points) &&
    Number.isFinite(bossMaxHp) &&
    bossMaxHp > 0 &&
    points >= (bossMaxHp * WORLD_BOSS_MIN_SHARE_PCT) / 100
  );
}

export interface WorldBossTopRow {
  name: string;
  titleId?: string;
  pts: number;
  /** % trong tổng điểm của mọi người ĐỦ ngưỡng. */
  pct: number;
}

export interface WorldBossMine {
  pts: number;
  pct: number;
  /** Đã qua ngưỡng `WORLD_BOSS_MIN_SHARE_PCT` (để UI hiện "chưa đủ ngưỡng" thay vì danh sách dài). */
  eligible: boolean;
}

export type WorldBossOutcome = "killed" | "fled" | "cancelled";

/** Phần thưởng đã trao cho CHÍNH người nhận tin (chỉ có ở `phase: "ended"` khi `outcome: "killed"` và người đó đủ ngưỡng). */
export interface WorldBossRewardMsg {
  exp: number;
  coin: number;
  item?: { itemId: string; count: number };
}

/**
 * Server -> client. Thời gian TƯƠNG ĐỐI: `startsInMs` (phase `soon`), `endsInMs` (phase `live`: còn bao lâu trùm bỏ chạy). `top` tối đa `WORLD_BOSS_TOP_SHOWN` dòng;
 * `mine` chỉ cho người nhận. `ended`: `outcome` + (nếu có) `reward`.
 */
export interface WorldBossMsg {
  phase: WorldBossMsgPhase;
  /** id khung giờ của lịch. */
  id: string;
  /** Tên trùm hiển thị. */
  name: string;
  mapId: string;
  startsInMs?: number;
  endsInMs?: number;
  hpPct?: number;
  top?: WorldBossTopRow[];
  mine?: WorldBossMine;
  outcome?: WorldBossOutcome;
  reward?: WorldBossRewardMsg;
}

/** Tin `worldBoss` "không có sự kiện" (trả lời `worldBossGet` khi lịch rỗng / tắt). */
export function worldBossNoneMsg(): WorldBossMsg {
  return { phase: "none", id: "", name: "", mapId: "" };
}

/**
 * Kiểm lịch trùm thế giới (trả danh sách lỗi, rỗng = hợp lệ): id duy nhất; mỗi lần xảy ra nằm gọn trong MỘT ngày (không vắt qua nửa đêm); `boss` là loài trùm có thật CÓ bộ chiêu; bản đồ có thật và KHÔNG phải bí cảnh; giờ / phút / thời lượng hợp lệ;
 * mốc báo trước giảm dần, dương, nhỏ hơn 60 phút; thưởng là số nguyên dương hợp lý, vật phẩm có thật; không hai khung giờ chồng lên nhau (một trùm thế giới tại một thời điểm).
 */
export function worldBossViolations(
  slots: readonly WorldBossSlot[] = WORLD_BOSS_SCHEDULE,
): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  for (const s of slots) {
    const at = `lịch trùm thế giới "${String(s.id)}"`;
    if (typeof s.id !== "string" || !ID_RE.test(s.id)) bad.push(`${at}: id sai văn phạm`);
    else if (ids.has(s.id)) bad.push(`${at}: id trùng`);
    else ids.add(s.id);
    const mk = hasOwn(MONSTER_BY_ID, String(s.boss)) ? MONSTER_BY_ID[s.boss] : undefined;
    if (!mk) bad.push(`${at}: không có loài quái "${String(s.boss)}"`);
    else if (!mk.boss) bad.push(`${at}: "${s.boss}" không phải trùm (boss: true)`);
    else if (!bossDefOf(s.boss)) bad.push(`${at}: "${s.boss}" chưa có bộ chiêu trong BOSSES`);
    if (!hasOwn(MAP_BY_ID, String(s.mapId)))
      bad.push(`${at}: không có bản đồ "${String(s.mapId)}"`);
    else if (isDungeonMap(s.mapId))
      bad.push(`${at}: bản đồ "${s.mapId}" là bí cảnh (cần bản đồ thường)`);
    if (!Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23)
      bad.push(`${at}: giờ phải là số nguyên 0-23`);
    if (!Number.isInteger(s.minute) || s.minute < 0 || s.minute > 59)
      bad.push(`${at}: phút phải là số nguyên 0-59`);
    if (!Number.isInteger(s.durationMin) || s.durationMin < 10 || s.durationMin > 120)
      bad.push(`${at}: thời lượng phải là số nguyên 10-120 phút`);
    else if (
      Number.isInteger(s.hour) &&
      Number.isInteger(s.minute) &&
      s.hour * 60 + s.minute + s.durationMin > 1440
    )
      bad.push(
        `${at}: vắt qua nửa đêm (giờ + thời lượng phải <= 24:00; \`worldBossNext\` và kiểm chồng giờ giả định mỗi lần xảy ra nằm gọn trong một ngày)`,
      );
    const a = s.announceMin;
    if (!Array.isArray(a) || a.length === 0 || a.length > 5)
      bad.push(`${at}: cần 1-5 mốc báo trước`);
    else {
      for (let i = 0; i < a.length; i++) {
        if (!Number.isInteger(a[i]) || a[i] < 1 || a[i] >= 60)
          bad.push(`${at}: mốc báo trước phải là số nguyên 1-59 phút`);
        if (i > 0 && !(a[i] < a[i - 1])) bad.push(`${at}: mốc báo trước phải giảm dần`);
      }
    }
    const r = s.reward;
    if (!r || !Number.isInteger(r.exp) || r.exp < 1 || r.exp > 10_000_000)
      bad.push(`${at}: thưởng tu vi phải là số nguyên 1-10.000.000`);
    if (!r || !Number.isInteger(r.coin) || r.coin < 0 || r.coin > 1_000_000)
      bad.push(`${at}: thưởng Linh thạch phải là số nguyên 0-1.000.000`);
    if (r?.top) {
      if (!hasOwn(ITEM_BY_ID, String(r.top.itemId)))
        bad.push(`${at}: vật phẩm thưởng "${String(r.top.itemId)}" không có`);
      if (!Number.isInteger(r.top.count) || r.top.count < 1 || r.top.count > 99)
        bad.push(`${at}: số vật phẩm thưởng phải là số nguyên 1-99`);
    }
  }
  // Chồng giờ: so từng cặp trong cùng một ngày (hai khung khác nhau không được giao nhau)
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const x = worldBossOccurrence(slots[i], 0);
      const y = worldBossOccurrence(slots[j], 0);
      if (x.startMs < y.endMs && y.startMs < x.endMs)
        bad.push(
          `lịch trùm thế giới: "${String(slots[i].id)}" và "${String(slots[j].id)}" chồng giờ`,
        );
    }
  return bad;
}

// ---------- Thành tựu + danh hiệu ----------

export const ACHIEVEMENT_GROUPS = [
  "luan_hoi",
  "tong_mon",
  "nghe",
  "trum",
  "pk",
  "kham_pha",
] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

export const ACHIEVEMENT_GROUP_LABELS: Readonly<Record<AchievementGroup, string>> = {
  luan_hoi: "Luân hồi",
  tong_mon: "Tông môn",
  nghe: "Nghề",
  trum: "Trùm",
  pk: "Thách đấu",
  kham_pha: "Khám phá",
};

/** Duyên thưởng tối đa của MỘT thành tựu và của TẤT CẢ thành tựu cộng lại (thưởng chỉ là danh hiệu + Duyên nhỏ, KHÔNG đồ / tu vi). */
export const ACHIEVEMENT_DUYEN_MAX = 10;
export const ACHIEVEMENT_DUYEN_TOTAL_MAX = 200;
/** Độ dài tối đa (ký tự) của tên / mô tả thành tựu và chữ danh hiệu. */
export const ACHIEVEMENT_NAME_MAX = 40;
export const ACHIEVEMENT_DESC_MAX = 160;
export const TITLE_TEXT_MAX = 12;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  group: AchievementGroup;
  /** Đạt khi bộ đếm `counter` (khoá hợp lệ của `socialCounterMode`) >= `atLeast`. */
  cond: { counter: string; atLeast: number };
  reward?: { titleId?: string; duyen?: number };
}

export interface TitleDef {
  /** `TITLE_ID_RE`: ID NGẮN, vào state công khai. */
  id: string;
  /** Chữ hiển thị cạnh đạo hiệu, <= `TITLE_TEXT_MAX` ký tự, không chữ Hán. */
  text: string;
  group: AchievementGroup | "su_kien";
}

/**
 * Danh hiệu. Khung có VÀI MẪU (D mở rộng ở M9.9). Mọi `reward.titleId` của `ACHIEVEMENTS` phải có ở đây (`achievementViolations`).
 */
export const TITLES: readonly TitleDef[] = [
  { id: "lh2", text: "Tái Sinh", group: "luan_hoi" },
  { id: "tr1", text: "Thợ Săn Trùm", group: "trum" },
  { id: "pk10", text: "Đấu Sĩ", group: "pk" },
  { id: "kp1", text: "Lữ Khách", group: "kham_pha" },
];

export const TITLE_BY_ID: Readonly<Record<string, TitleDef>> = Object.fromEntries(
  TITLES.map((t) => [t.id, t]),
);

/** Tra danh hiệu theo id BẤT KỲ (id từ file lưu / client / state người khác): thuộc tính RIÊNG (xem `achievementOf`). */
export function titleOf(id: unknown): TitleDef | undefined {
  return typeof id === "string" && hasOwn(TITLE_BY_ID, id) ? TITLE_BY_ID[id] : undefined;
}

/**
 * Thành tựu. Khung có VÀI MẪU thật (D mở rộng tới >= 40 ở M9.9). Máy chủ cấp qua MỘT cổng (`trackSocial`, M9.5); `achievementsDue` cho biết thành tựu nào vừa đủ điều kiện.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "kiep_2",
    name: "Luân Hồi Lần Đầu",
    desc: "Đầu thai sang kiếp thứ hai.",
    group: "luan_hoi",
    cond: { counter: "kiep", atLeast: 2 },
    reward: { titleId: "lh2", duyen: 2 },
  },
  {
    id: "trum_mang_1",
    name: "Hạ Xích Mãng",
    desc: "Hạ gục Xích Mãng một lần.",
    group: "trum",
    cond: { counter: "boss:mang", atLeast: 1 },
    reward: { titleId: "tr1" },
  },
  {
    id: "pk_thang_10",
    name: "Mười Trận Thắng",
    desc: "Thắng mười trận thách đấu.",
    group: "pk",
    cond: { counter: "pk_won", atLeast: 10 },
    reward: { titleId: "pk10", duyen: 1 },
  },
  {
    id: "den_am_suong",
    name: "Đặt Chân Âm Sương",
    desc: "Lần đầu tới Âm Sương Trạch.",
    group: "kham_pha",
    cond: { counter: "map:am_suong", atLeast: 1 },
    reward: { titleId: "kp1" },
  },
];

export const ACHIEVEMENT_BY_ID: Readonly<Record<string, AchievementDef>> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Tra thành tựu theo id BẤT KỲ (id từ file lưu / client): thuộc tính RIÊNG, `ACHIEVEMENT_BY_ID["constructor"]` không phải `undefined` nên đừng tra trực tiếp. */
export function achievementOf(id: unknown): AchievementDef | undefined {
  return typeof id === "string" && hasOwn(ACHIEVEMENT_BY_ID, id)
    ? ACHIEVEMENT_BY_ID[id]
    : undefined;
}

/** Bậc cảnh giới cao nhất có thật (`stepOf` của bậc cuối). */
function maxRealmStep(): number {
  const last = REALMS[REALMS.length - 1];
  return stepOf(REALMS.length - 1, last.tiers.length - 1);
}

/** Id đuôi của khoá bộ đếm có thật không (họ `boss:` / `map:`; `craft:` chỉ kiểm văn phạm vì bảng nghề do D / E thêm dần). Trả lý do lỗi hoặc `null`. */
function counterTargetProblem(counter: string): string | null {
  const i = counter.indexOf(":");
  if (i < 0) return null;
  const fam = counter.slice(0, i);
  const id = counter.slice(i + 1);
  if (fam === "boss") {
    const mk = hasOwn(MONSTER_BY_ID, id) ? MONSTER_BY_ID[id] : undefined;
    return mk && mk.boss ? null : `"${counter}": "${id}" không phải loài trùm`;
  }
  if (fam === "map") return hasOwn(MAP_BY_ID, id) ? null : `"${counter}": không có bản đồ "${id}"`;
  return null;
}

/** Kiểm DANH HIỆU (lỗi, rỗng = hợp lệ): id `TITLE_ID_RE` duy nhất, chữ 1-`TITLE_TEXT_MAX` ký tự không chữ Hán, nhóm hợp lệ. */
export function titleViolations(titles: readonly TitleDef[] = TITLES): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  const groups: readonly string[] = [...ACHIEVEMENT_GROUPS, "su_kien"];
  for (const t of titles) {
    const at = `danh hiệu "${String(t.id)}"`;
    if (typeof t.id !== "string" || !TITLE_ID_RE.test(t.id))
      bad.push(`${at}: id phải khớp ${String(TITLE_ID_RE)} (ngắn, vào state công khai)`);
    else if (ids.has(t.id)) bad.push(`${at}: id trùng`);
    else ids.add(t.id);
    if (typeof t.text !== "string" || lenOf(t.text) < 1 || lenOf(t.text) > TITLE_TEXT_MAX)
      bad.push(`${at}: chữ phải dài 1-${TITLE_TEXT_MAX} ký tự`);
    else if (CJK_RE.test(t.text)) bad.push(`${at}: có chữ Hán / CJK`);
    if (!groups.includes(t.group)) bad.push(`${at}: nhóm "${String(t.group)}" không hợp lệ`);
  }
  return bad;
}

/**
 * Kiểm THÀNH TỰU (lỗi, rỗng = hợp lệ): id duy nhất đúng văn phạm; tên / mô tả có độ dài hợp lệ, không chữ Hán; nhóm hợp lệ; `cond.counter` là khoá bộ đếm hợp lệ (đuôi `boss:` / `map:` có thật);
 * `atLeast` nguyên dương, đạt được (`kiep` <= `KIEP_CAP`, `realm_step` <= bậc cao nhất, mọi bộ đếm <= `SOCIAL_COUNTER_CAP`); `reward.titleId` có trong `titles`; Duyên mỗi mục <= `ACHIEVEMENT_DUYEN_MAX`
 * và tổng <= `ACHIEVEMENT_DUYEN_TOTAL_MAX`; không hai thành tựu cùng (`counter`, `atLeast`).
 */
export function achievementViolations(
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
  titles: readonly TitleDef[] = TITLES,
): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  const conds = new Set<string>();
  const titleIds = new Set(titles.map((t) => t.id));
  let duyen = 0;
  for (const a of defs) {
    const at = `thành tựu "${String(a.id)}"`;
    if (typeof a.id !== "string" || !ID_RE.test(a.id)) bad.push(`${at}: id sai văn phạm`);
    else if (ids.has(a.id)) bad.push(`${at}: id trùng`);
    else ids.add(a.id);
    for (const [f, v, max] of [
      ["tên", a.name, ACHIEVEMENT_NAME_MAX],
      ["mô tả", a.desc, ACHIEVEMENT_DESC_MAX],
    ] as const) {
      if (typeof v !== "string" || lenOf(v) < 1 || lenOf(v) > max)
        bad.push(`${at}: ${f} phải dài 1-${max} ký tự`);
      else if (CJK_RE.test(v)) bad.push(`${at}: ${f} có chữ Hán / CJK`);
    }
    if (!(ACHIEVEMENT_GROUPS as readonly string[]).includes(a.group))
      bad.push(`${at}: nhóm "${String(a.group)}" không hợp lệ`);
    const c = a.cond;
    if (!c || socialCounterMode(c.counter) === null)
      bad.push(`${at}: bộ đếm "${String(c?.counter)}" không hợp lệ`);
    else {
      const prob = counterTargetProblem(c.counter);
      if (prob) bad.push(`${at}: bộ đếm ${prob}`);
      if (!Number.isInteger(c.atLeast) || c.atLeast < 1 || c.atLeast > SOCIAL_COUNTER_CAP)
        bad.push(`${at}: atLeast phải là số nguyên 1-${SOCIAL_COUNTER_CAP}`);
      else {
        if (c.counter === "kiep" && c.atLeast > KIEP_CAP)
          bad.push(`${at}: kiếp ${c.atLeast} vượt KIEP_CAP`);
        if (c.counter === "realm_step" && c.atLeast > maxRealmStep())
          bad.push(`${at}: bậc cảnh giới ${c.atLeast} vượt bậc cao nhất`);
        const ck = `${c.counter}>=${c.atLeast}`;
        if (conds.has(ck)) bad.push(`${at}: trùng điều kiện (${ck}) với thành tựu khác`);
        conds.add(ck);
      }
    }
    const r = a.reward;
    if (r?.titleId !== undefined && !titleIds.has(r.titleId))
      bad.push(`${at}: danh hiệu thưởng "${r.titleId}" không có`);
    if (r?.duyen !== undefined) {
      if (!Number.isInteger(r.duyen) || r.duyen < 0 || r.duyen > ACHIEVEMENT_DUYEN_MAX)
        bad.push(`${at}: Duyên thưởng phải là số nguyên 0-${ACHIEVEMENT_DUYEN_MAX}`);
      else duyen += r.duyen;
    }
  }
  if (duyen > ACHIEVEMENT_DUYEN_TOTAL_MAX)
    bad.push(`tổng Duyên thưởng ${duyen} vượt ${ACHIEVEMENT_DUYEN_TOTAL_MAX}`);
  return bad;
}

/** Thành tựu đủ điều kiện mà CHƯA có trong `social.ach` (thứ tự theo `defs`). Thuần: máy chủ cấp qua `socialGrant`. */
export function achievementsDue(
  social: SoulSocial | undefined,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): AchievementDef[] {
  return defs.filter(
    (a) =>
      !(social && hasOwn(social.ach, a.id)) &&
      socialCounterOf(social, a.cond.counter) >= a.cond.atLeast,
  );
}

/** Tiến độ một thành tựu theo bộ đếm: `{ have, need, done }` (client tự tính từ `ACHIEVEMENTS` + `achievements.counters`). */
export function achievementProgress(
  a: AchievementDef,
  counters: Readonly<Record<string, number>>,
  ach: Readonly<Record<string, string>>,
): { have: number; need: number; done: boolean } {
  const have = hasOwn(counters, a.cond.counter)
    ? Math.min(counters[a.cond.counter], a.cond.atLeast)
    : 0;
  return { have, need: a.cond.atLeast, done: hasOwn(ach, a.id) };
}

/** Client -> server: đeo danh hiệu `id` (phải đã mở) hoặc gỡ (`null`). */
export interface TitleSetMsg {
  id: string | null;
}

/** Đọc `titleSet`: `{ id }` với `id` đúng `TITLE_ID_RE` hoặc `null`; sai kiểu -> `undefined` (bỏ tin). Kiểm "đã mở" là việc của máy chủ. */
export function parseTitleSet(raw: unknown): TitleSetMsg | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const id = (raw as { id?: unknown }).id;
  if (id === null) return { id: null };
  return typeof id === "string" && TITLE_ID_RE.test(id) ? { id } : undefined;
}

/** Server -> client (chỉ chủ): đúng `Soul.social` rút gọn, KHÔNG kèm định nghĩa. */
export interface AchievementsMsg {
  ach: Record<string, string>;
  counters: Record<string, number>;
  title: string | null;
}

/** Server -> client (chỉ chủ): vừa đạt thành tựu `id`. */
export interface AchievementNewMsg {
  id: string;
}

// ---------- Hàm mẫu (giao diện `?debug`, test, F / B dùng chung; khớp kiểu thật, tất định) ----------

const SAMPLE_NAMES = [
  "Tô Vân Hạc",
  "Hạ Thanh Linh",
  "Mạc Khinh Trần",
  "Ngô Tử Khiêm",
  "Bùi Chấn Nhạc",
];

/** Biến thể của `mine` trong bảng mẫu: `top` (hạng 3, trong top), `outside` (hạng 47 ngoài top 20, có `row`), `test` / `min_games` / `none` (không hạng, kèm lý do; `min_games` có `need`). */
export type SampleBoardVariant = "top" | "outside" | "test" | "min_games" | "none";

/** Bảng MẪU cho `board` (không có dữ liệu thật): `n` dòng đã xếp hạng + `mine` theo `variant` (mặc định hạng 3). Tất định theo (`board`, `n`, `variant`). */
export function sampleBoards(
  board: BoardId,
  n = 5,
  variant: SampleBoardVariant = "top",
): BoardsMsg {
  const rows: BoardRow[] = [];
  for (let i = 0; i < Math.min(n, BOARD_SIZE); i++) {
    const name =
      board === "tongmon"
        ? `Tông ${SAMPLE_NAMES[i % 5].split(" ")[0]} ${i + 1}`
        : `${SAMPLE_NAMES[i % 5]} ${i + 1}`;
    rows.push(sampleBoardRow(board, i, name));
  }
  const ranked = rankBoard(board, rows);
  let mine: BoardMine;
  switch (variant) {
    case "outside": {
      const row = { ...sampleBoardRow(board, 46, "Người Chơi Hiện Tại"), rank: 47 };
      mine = { rank: 47, row };
      break;
    }
    case "test":
      mine = { rank: null, reason: "test" };
      break;
    case "min_games":
      mine = { rank: null, reason: "min_games", need: Math.max(1, BOARD_PK_MIN_GAMES - 4) };
      break;
    case "none":
      mine = { rank: null, reason: "none" };
      break;
    default: {
      const row = ranked[2];
      mine = row ? { rank: row.rank, row } : { rank: null, reason: "none" };
    }
  }
  return { board, rows: ranked, mine, ageMs: 90_000 };
}

/** Dòng mẫu thứ `i` (số liệu giảm dần theo `i`) của `board`. */
function sampleBoardRow(board: BoardId, i: number, name: string): BoardRow {
  const base: BoardRow = { rank: i + 1, name };
  if (i === 1 && board !== "tuvi") base.test = true;
  if (i === 0) base.titleId = "kp1";
  switch (board) {
    case "tuvi":
      Object.assign(base, { realm: 3, tier: 2 - (i % 3), exp: Math.max(0, 90_000 - i * 7_000) });
      break;
    case "linhhon":
      Object.assign(base, { step: Math.max(1, 30 - i * 2), kiep: Math.max(1, 12 - i) }); // bậc TRONG thang (bậc cao nhất là 33), để giao diện đổi ra tên cảnh giới được
      break;
    case "tongmon":
      Object.assign(base, {
        level: Math.max(1, 5 - Math.min(4, i)),
        points: Math.max(0, 40_000 - i * 5_000),
        members: Math.max(1, 20 - i * 2),
      });
      break;
    case "pk":
      Object.assign(base, { won: Math.max(0, 60 - i * 8), lost: 10 + i * 3 });
      break;
  }
  return base;
}

/** Biến thể của `ended` / `live` trong tin trùm mẫu: `killed` (mặc định, có thưởng), `fled`, `cancelled`, `below` (hạ được nhưng người xem CHƯA đủ ngưỡng: không thưởng; với `live`: `mine.eligible: false`). */
export type SampleWorldBossVariant = "killed" | "fled" | "cancelled" | "below";

/** Tin `worldBoss` MẪU cho `phase` (dùng lịch mẫu `sampleWorldBossSchedule`); `none` = không có sự kiện. */
export function sampleWorldBossEvent(
  phase: WorldBossMsgPhase = "live",
  variant: SampleWorldBossVariant = "killed",
): WorldBossMsg {
  if (phase === "none") return worldBossNoneMsg();
  const slot = sampleWorldBossSchedule()[0];
  const base: WorldBossMsg = {
    phase,
    id: slot.id,
    name: MONSTER_BY_ID[slot.boss]?.name ?? slot.boss,
    mapId: slot.mapId,
  };
  if (phase === "soon") return { ...base, startsInMs: 5 * 60_000 };
  if (phase === "live")
    return {
      ...base,
      endsInMs: 22 * 60_000,
      hpPct: 64,
      top: [
        { name: SAMPLE_NAMES[0], pts: 61_000, pct: 31.2, titleId: "tr1" },
        { name: SAMPLE_NAMES[1], pts: 44_000, pct: 22.5 },
        { name: SAMPLE_NAMES[2], pts: 30_000, pct: 15.3 },
      ],
      mine:
        variant === "below"
          ? { pts: 900, pct: 0.4, eligible: false }
          : { pts: 9_000, pct: 4.6, eligible: true },
    };
  if (variant === "fled" || variant === "cancelled") return { ...base, outcome: variant };
  if (variant === "below") return { ...base, outcome: "killed" };
  return {
    ...base,
    outcome: "killed",
    reward: { exp: 46, coin: 9, item: { itemId: "dai_hoi_huyet_dan", count: 1 } },
  };
}

/** Sổ thành tựu MẪU (đúng `Soul.social` rút gọn): đã đạt `kiep_2`, đang dở `pk_thang_10`. */
export function sampleAchievements(): AchievementsMsg {
  return {
    ach: { kiep_2: "2026-11-17T08:00:00.000Z" },
    counters: { kiep: 2, pk_won: 6, "boss:mang": 0 },
    title: "lh2",
  };
}
