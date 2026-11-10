// Lưu nhân vật bằng file JSON (bản thử). M4 sẽ thay bằng PostgreSQL.
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
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
  createdAt: string;
  updatedAt: string;
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

export async function savePlayer(p: SavedPlayer): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const file = fileFor(p.name);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ ...p, updatedAt: new Date().toISOString() }, null, 1));
  await fs.rename(tmp, file);
}

/** Tên 2–16 ký tự: chữ (có dấu), số, khoảng trắng đơn. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 16) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(n)) return null;
  return n;
}
