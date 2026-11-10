// Lưu nhân vật bằng file JSON (bản thử). M4 sẽ thay bằng PostgreSQL.
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  DEFAULT_MAP_ID,
  getMap,
  type Equipment,
  type Inventory,
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
  /** Bộ đếm thành tựu của kiếp này (dùng tính Duyên); file cũ không có thì bắt đầu từ 0 */
  life?: LifeCounters;
  /** Lần đi qua cổng gần nhất (ms, `Date.now()`): hồi chiêu `TRAVEL_COOLDOWN_MS` tính qua cả các phòng */
  travelAt?: number;
  createdAt: string;
  updatedAt: string;
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

const LIFE_CAP = 1_000_000_000_000; // ~31 năm tính bằng ms; số lượng quái không bao giờ tới mức này

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

/** Bản đồ của nhân vật đã lưu: id hợp lệ trong `MAPS`, còn lại (thiếu, lạ, sai kiểu) là bản đồ mặc định. */
export function mapIdOf(save: Pick<SavedPlayer, "mapId">): string {
  return getMap(save.mapId)?.def.id ?? DEFAULT_MAP_ID;
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
const writing = new Map<string, Promise<void>>();

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

/** Tên 2–16 ký tự: chữ (có dấu), số, khoảng trắng đơn. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 16) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(n)) return null;
  return n;
}
