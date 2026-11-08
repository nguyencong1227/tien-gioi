// Hằng số gameplay và giao thức tin nhắn client <-> server.
// Đây là "hợp đồng" giữa dev client và dev server: đổi gì ở đây thì báo nhau.

export const TICK_MS = 50; // server 20 tick/giây
export const PLAYER_RADIUS = 11;
export const ROOM_NAME = "world";
export const MAX_PLAYERS_PER_ROOM = 100;

export const SKILLS = {
  slash: { cooldown: 400, range: 64, arc: Math.PI * 0.6, mp: 0, mult: 1.0 },
  sword: { cooldown: 1500, range: 260, width: 26, mp: 8, mult: 1.8 },
} as const;

export const MEDITATE = {
  expPctPerSec: 0.004, // % thanh tu vi mỗi giây (~4 phút / bậc)
  hpRegenPct: 0.06,
  mpRegenPct: 0.1,
};

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
  exp: number;
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
    exp: 6,
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
    exp: 22,
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
    exp: 110,
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
    color: 0xb3262a,
    boss: true,
  },
];

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
}
export interface ToastMsg {
  text: string;
  tone?: "good" | "bad" | "info";
}

export interface JoinOptions {
  name: string;
  secret: string;
}
