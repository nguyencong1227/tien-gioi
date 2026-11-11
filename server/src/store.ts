// Lưu nhân vật bằng file JSON (bản thử). M4 sẽ thay bằng PostgreSQL.
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  DEFAULT_MAP_ID,
  DEFAULT_ORIGIN,
  ITEM_BY_ID,
  getMap,
  isDungeonMap,
  originOf,
  type DungeonDaily,
  type Equipment,
  type Inventory,
  type LifeSummary,
  type QuestProgress,
} from "@tien-gioi/shared";

const DIR = path.resolve(process.env.DATA_DIR ?? "data/players");

export interface SavedPlayer {
  name: string;
  secretHash: string;
  realm: number;
  tier: number;
  exp: number;
  x?: number;
  y?: number;
  /** Túi đồ; file cũ không có thì coi như túi trống */
  inventory?: Inventory;
  /** Sổ nhiệm vụ; file cũ không có thì coi như chưa làm gì */
  quests?: QuestSave;
  /** Đồ đang mặc; file cũ không có thì coi như mặc đồ trống */
  equipment?: Equipment;
  /** Linh thạch; file cũ không có thì coi như 0. Nạp qua addCoin: không tin giá trị trong file. */
  coin?: number;
  /**
   * Bản đồ (phòng) nhân vật đang ở, kèm `x`, `y` tính trong bản đồ đó. File cũ không có thì coi là `DEFAULT_MAP_ID`;
   * id không còn trong `MAPS` cũng vậy (đọc bằng `mapIdOf`, không tin giá trị trong file).
   */
  mapId?: string;
  /** Định danh kiếp (chống cộng Duyên hai lần, xem docs/THIET_KE_LUAN_HOI.md mục 4); file cũ không có thì sinh khi vào game */
  lifeId?: string;
  /**
   * Nhân vật đang ở Hoàng Tuyền (đã chết thật, chưa đầu thai): hồ sơ đã đặt lại về Phàm Nhân, đồ và Linh thạch của kiếp
   * cũ chỉ còn ở đây (`keepable`, `coinAtDeath`). Có thì vào game là hiện lại màn hình Hoàng Tuyền (docs/THIET_KE_LUAN_HOI.md).
   */
  limbo?: LimboRecord;
  /** Xuất thân của kiếp này (đã chọn lúc đầu thai); bỏ trống / lạ là Phàm gia */
  origin?: string;
  /** Bộ đếm thành tựu của kiếp này (dùng tính Duyên); file cũ không có thì bắt đầu từ 0 */
  life?: LifeCounters;
  /**
   * Bộ đếm thưởng hoàn thành bí cảnh theo ngày (`dayKey` UTC+7; tối đa `DUNGEON_DAILY_REWARDS` lượt mỗi ngày). Thiếu = chưa
   * nhận lượt nào. Đọc bằng `sanitizeDungeonDaily` (systems/dungeon.ts), không tin giá trị trong file.
   */
  dungeonDaily?: DungeonDaily;
  /** Lần đi qua cổng gần nhất (ms, `Date.now()`): hồi chiêu `TRAVEL_COOLDOWN_MS` tính qua cả các phòng */
  travelAt?: number;
  createdAt: string;
  updatedAt: string;
}

/** Bản ghi Hoàng Tuyền trong hồ sơ nhân vật. */
export interface LimboRecord {
  /** `lifeId` của kiếp ĐÃ KẾT THÚC: khoá chống cộng Duyên hai lần (`Soul.lastCreditedLife`) */
  endedLifeId: string;
  summary: LifeSummary;
  /** Trang bị có thể giữ lại (id vật phẩm, lặp lại nếu có nhiều món cùng loại), chụp lúc chết */
  keepable: string[];
  /** Linh thạch lúc chết (mang theo tới `coinCarryCap`) */
  coinAtDeath: number;
  /** Kiếp này có được tính (tăng bộ đếm kiếp) hay không */
  counts: boolean;
  /** Đã cộng Duyên vào chân linh chưa (chạy lại sau sập máy thì cộng tiếp, idempotent theo `endedLifeId`) */
  credited: boolean;
}

const LIFE_CAP = 1_000_000_000_000;

const int = (v: unknown, max = LIFE_CAP): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;

/** Đọc bản ghi Hoàng Tuyền từ file lưu: không tin file. Không phải object hợp lệ thì `undefined` (coi như không ở Hoàng Tuyền). */
export function sanitizeLimbo(raw: unknown): LimboRecord | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const s =
    r.summary !== null && typeof r.summary === "object"
      ? (r.summary as Record<string, unknown>)
      : {};
  if (typeof r.endedLifeId !== "string" || !r.endedLifeId) return undefined;
  const keepable = (Array.isArray(r.keepable) ? r.keepable : [])
    .filter((id): id is string => typeof id === "string" && ITEM_BY_ID[id]?.type === "equip")
    .slice(0, 30);
  return {
    endedLifeId: r.endedLifeId.slice(0, 64),
    summary: {
      kiep: Math.max(1, int(s.kiep, 1_000_000)),
      realm: int(s.realm, 20),
      tier: int(s.tier, 20),
      minutes: int(s.minutes),
      kills: int(s.kills),
      bossKills: int(s.bossKills),
      gain: int(s.gain, 1_000_000_000),
    },
    keepable,
    coinAtDeath: int(r.coinAtDeath, 1_000_000_000),
    counts: r.counts === true,
    credited: r.credited === true,
  };
}

/** Đọc xuất thân từ file lưu: id hợp lệ trong `ORIGINS`, còn lại là Phàm gia. */
export function sanitizeOrigin(raw: unknown): string {
  return originOf(raw)?.id ?? DEFAULT_ORIGIN;
}

/** Bộ đếm thành tựu của kiếp hiện tại (dữ liệu riêng của server, không vào state chung). */
export interface LifeCounters {
  /** Thời gian chơi thật (ms): nhân vật ở trong game, không tính hồn lìa xác / Hoàng Tuyền */
  playMs: number;
  /** Số quái đã hạ (góp sát thương hoặc cùng đội, như tiến độ nhiệm vụ) */
  kills: number;
  /** Trong đó số trùm */
  bossKills: number;
}

/** Đọc bộ đếm từ file lưu: không tin giá trị trong file (kiểu sai, âm, NaN, vô cùng, số lẻ đều về số nguyên hợp lệ). */
export function sanitizeLife(raw: unknown): LifeCounters {
  const r = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(LIFE_CAP, Math.max(0, Math.floor(v)))
      : 0;
  const kills = n(r.kills);
  return { playMs: n(r.playMs), kills, bossKills: Math.min(kills, n(r.bossKills)) };
}

/** Định danh kiếp mới. */
export const newLifeId = () => randomUUID();

/** Đọc `lifeId` từ file lưu: không phải chuỗi hợp lý (8-64 ký tự, không ký tự điều khiển) thì sinh mã mới. */
export function sanitizeLifeId(raw: unknown): string {
  return typeof raw === "string" && /^[\x21-\x7e]{8,64}$/.test(raw) ? raw : newLifeId();
}

export interface QuestSave {
  active: QuestProgress[];
  /** Nhiệm vụ không lặp đã xong */
  done: string[];
  /** Nhiệm vụ lặp: questId -> ngày làm xong gần nhất (dayKey) */
  daily: Record<string, string>;
}

/**
 * Bản đồ của nhân vật đã lưu: id của một bản đồ THƯỜNG (`MAPS`), còn lại (thiếu, lạ, sai kiểu) là bản đồ mặc định.
 * Bản đồ bí cảnh cũng là bản đồ `getMap` tra được nhưng là phòng tạm của một run, KHÔNG BAO GIỜ là chỗ ở của nhân vật
 * (docs/THIET_KE_BI_CANH.md mục 4.3): file lưu mang id đó (sửa tay, lỗi, bản cũ) thì về Lạc Hà thay vì bị đưa tới một
 * phòng không có (`world_bi_canh_...` không đăng ký thì client không vào được: kẹt).
 */
export function mapIdOf(save: Pick<SavedPlayer, "mapId">): string {
  const m = getMap(save.mapId);
  return m && !isDungeonMap(m.def.id) ? m.def.id : DEFAULT_MAP_ID;
}

export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");

function fileFor(name: string) {
  const key = createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex");
  return path.join(DIR, `${key}.json`);
}

export async function loadPlayer(name: string): Promise<SavedPlayer | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(name), "utf8"));
  } catch {
    return null;
  }
}

/** Hàng đợi ghi theo từng file: các lần lưu cùng một nhân vật chạy lần lượt, đúng thứ tự gọi. */
const writing = new Map<string, Promise<unknown>>();

/**
 * Lưu nhân vật (ghi tệp tạm rồi `rename`). Các lần lưu cùng một nhân vật được xếp hàng: lưu định kỳ, lưu lúc rớt mạng
 * và lưu lúc đi qua cổng có thể chồng nhau; nếu cùng ghi một tệp tạm thì lần `rename` thứ hai hỏng (ENOENT) hoặc bản
 * cũ ghi đè bản mới. Xếp hàng thì bản gọi sau luôn là bản cuối cùng trong file. Một lần lỗi không chặn các lần sau.
 */
export function savePlayer(p: SavedPlayer): Promise<void> {
  const file = fileFor(p.name);
  const run = async () => {
    await fs.mkdir(DIR, { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ ...p, updatedAt: new Date().toISOString() }, null, 1));
    await fs.rename(tmp, file);
  };
  const prev = writing.get(file) ?? Promise.resolve();
  const next = prev.then(run, run);
  writing.set(file, next);
  const done = () => {
    if (writing.get(file) === next) writing.delete(file);
  };
  next.then(done, done);
  return next;
}

/** Xoá nhân vật theo tên. Xếp hàng cùng tệp như savePlayer. */
export function deletePlayer(name: string): Promise<boolean> {
  const file = fileFor(name);
  const run = async () => {
    try {
      await fs.unlink(file);
      return true;
    } catch (e: any) {
      if (e?.code === "ENOENT") return false;
      throw e;
    }
  };
  const prev = writing.get(file) ?? Promise.resolve();
  const next = prev.then(run, run);
  writing.set(file, next);
  const done = () => {
    if (writing.get(file) === next) writing.delete(file);
  };
  next.then(done, done);
  return next;
}
