// Hằng số gameplay và giao thức tin nhắn client <-> server.
// Đây là "hợp đồng" giữa dev client và dev server: đổi gì ở đây thì báo nhau.
import { expToNext, stepOf } from "./realms";

export const TICK_MS = 50; // server 20 tick/giây
export const PLAYER_RADIUS = 11;
export const ROOM_NAME = "world";
export const MAX_PLAYERS_PER_ROOM = 100;

export const SKILLS = {
  slash: { cooldown: 400, range: 64, arc: Math.PI * 0.6, mp: 0, mult: 1.0 },
  sword: { cooldown: 1500, range: 260, width: 26, mp: 8, mult: 1.8 },
} as const;

export const MEDITATE = {
  /** Số giây đả tọa (không làm gì khác) để đầy một thanh tu vi, theo cảnh giới */
  secPerBar: [240, 720, 6000],
  /** Từ Kim Đan trở đi: mỗi cảnh giới gấp ngần này lần */
  secPerBarMultAfter: 6,
  hpRegenPct: 0.06,
  mpRegenPct: 0.1,
};

/** Tu vi mỗi giây khi đả tọa. Chậm hơn săn quái cùng cấp (xem docs/CAN_BANG.md), dùng để nghỉ và hồi phục. */
export function meditateExpPerSec(realm: number, tier: number): number {
  const t = MEDITATE.secPerBar;
  const sec =
    realm < t.length
      ? t[realm]
      : t[t.length - 1] * Math.pow(MEDITATE.secPerBarMultAfter, realm - t.length + 1);
  return expToNext(realm, tier) / sec;
}

export const RESPAWN_MS = 5000;
export const DEATH_EXP_LOSS = 0.1;
export const BREAK_FAIL_EXP_LOSS = 0.3;

export interface MonsterKind {
  id: string;
  name: string;
  /** Độ nguy hiểm khu vực tối thiểu để xuất hiện (0..1) */
  minDanger: number;
  hp: number;
  atk: number;
  speed: number;
  radius: number;
  aggro: number; // tầm phát hiện (px)
  attackRange: number;
  attackCd: number; // ms
  /** Tu vi gốc khi hạ cả con */
  exp: number;
  /** Cấp của quái, tính theo bậc người chơi (stepOf): 0 Phàm Nhân, 1–9 Luyện Khí, 10–12 Trúc Cơ */
  level: number;
  color: number;
  boss?: boolean;
}

export const MONSTERS: MonsterKind[] = [
  {
    id: "tho",
    name: "Linh Thố",
    minDanger: 0,
    hp: 40,
    atk: 4,
    speed: 70,
    radius: 10,
    aggro: 0,
    attackRange: 26,
    attackCd: 1200,
    exp: 4,
    level: 0,
    color: 0xf4efe2,
  },
  {
    id: "lang",
    name: "Hôi Lang",
    minDanger: 0.22,
    hp: 140,
    atk: 14,
    speed: 125,
    radius: 13,
    aggro: 170,
    attackRange: 32,
    attackCd: 1100,
    exp: 10,
    level: 1,
    color: 0x8a8f99,
  },
  {
    id: "ho",
    name: "Hắc Hổ",
    minDanger: 0.5,
    hp: 600,
    atk: 42,
    speed: 135,
    radius: 16,
    aggro: 200,
    attackRange: 38,
    attackCd: 1300,
    exp: 35,
    level: 7,
    color: 0x2e2a30,
  },
  {
    id: "mang",
    name: "Xích Mãng",
    minDanger: 0.78,
    hp: 4000,
    atk: 140,
    speed: 110,
    radius: 24,
    aggro: 240,
    attackRange: 50,
    attackCd: 1600,
    exp: 900,
    level: 12,
    color: 0xb3262a,
    boss: true,
  },
];

/** Người chơi cao hơn quái quá số bậc này thì tu vi bắt đầu giảm */
export const KILL_EXP_FREE_GAP = 4;

/**
 * Tu vi khi hạ quái (cả con; nhiều người đánh thì chia theo sát thương).
 * Cao hơn quái quá KILL_EXP_FREE_GAP bậc thì mỗi bậc giảm 15%, thấp nhất còn 25%,
 * để người chơi chuyển sang quái mạnh hơn thay vì cày quái yếu.
 */
export function killExp(m: MonsterKind, realm: number, tier: number): number {
  const gap = stepOf(realm, tier) - m.level - KILL_EXP_FREE_GAP;
  const mult = gap > 0 ? Math.max(0.25, 1 - 0.15 * gap) : 1;
  return Math.max(1, Math.round(m.exp * mult));
}

export const MONSTER_BY_ID: Record<string, MonsterKind> = Object.fromEntries(
  MONSTERS.map((m) => [m.id, m]),
);

/** Số quái tối đa mỗi loại trên bản đồ */
export const MONSTER_CAP: Record<string, number> = { tho: 40, lang: 30, ho: 16, mang: 2 };
export const MONSTER_RESPAWN_MS = 10000;

// ---------- Tin nhắn client -> server ----------
export interface InputMsg {
  seq: number;
  dx: number;
  dy: number;
} // dx,dy: hướng đã chuẩn hóa (-1..1)
export interface AttackMsg {
  angle: number;
}
export interface SkillMsg {
  id: "sword";
  angle: number;
}
export interface MeditateMsg {
  on: boolean;
}
export interface ChatMsg {
  text: string;
}

// ---------- Tin nhắn server -> client ----------
export type FxMsg =
  | { kind: "slash"; by: string; x: number; y: number; angle: number }
  | { kind: "sword"; by: string; x: number; y: number; angle: number; range: number }
  | { kind: "mslash"; by: string; x: number; y: number; angle: number }
  | { kind: "levelup"; by: string; x: number; y: number; major: boolean }
  | { kind: "breakfail"; by: string; x: number; y: number };
export interface DmgMsg {
  target: string;
  amount: number;
  x: number;
  y: number;
  crit?: boolean;
  toPlayer?: boolean;
}
export interface ChatOut {
  from: string;
  text: string;
  sys?: boolean;
  /**
   * Kênh chat đội (lệnh `/p <nội dung>`, chỉ gửi cho thành viên, kể cả thành viên ở bản đồ khác);
   * bỏ trống là chat chung **cả server** (mọi bản đồ / phòng, đi qua kênh chung giữa các phòng, M3 bước 1)
   */
  channel?: "party";
}
export interface ToastMsg {
  text: string;
  tone?: "good" | "bad" | "info";
}

export interface JoinOptions {
  name: string;
  secret: string;
  /**
   * Bản đồ (phòng) muốn vào; bỏ trống là `DEFAULT_MAP_ID`. Chỉ là **gợi ý** để chọn phòng: server so với `mapId`
   * đã lưu của nhân vật, sai thì trả lỗi `JOIN_WRONG_MAP` kèm bản đồ đúng (shared/src/travel.ts).
   */
  mapId?: string;
}
