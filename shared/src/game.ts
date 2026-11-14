// Hằng số gameplay và giao thức tin nhắn client <-> server.
// Đây là "hợp đồng" giữa dev client và dev server: đổi gì ở đây thì báo nhau.
import { expToNext, stepOf } from "./realms";
import type { Element } from "./skills";

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
  /**
   * Hành vi (M7.3, docs/PHAN_CONG_M7.md mục 6): bỏ trống = `melee` (đuổi và đánh gần, như trước M7). `ranged` đứng xa bắn đạn (`boltSpeed`,
   * `boltRange`; đạn KHÔNG là state, chỉ có `fx` `bolt`); `charger` đứng gồng `windupMs` rồi lao thẳng; `poisoner` đòn gây trạng thái độc.
   */
  behavior?: MonsterBehavior;
  /** Hệ (`skills.ts`): chiêu khắc / bị khắc theo `elementMult`; bỏ trống = `none` */
  element?: Element;
  /** Thời gian gồng (ms) trước đòn mạnh / lao: người chơi tránh được nhờ `fx` `warn` */
  windupMs?: number;
  /** Tầm xa: tốc độ đạn (px/giây) và tầm bay tối đa (px) */
  boltSpeed?: number;
  boltRange?: number;
}

/** Hành vi quái (M7.3). `melee` là mặc định. */
export type MonsterBehavior = "melee" | "ranged" | "charger" | "poisoner";

/** Đạn của quái tầm xa tối đa mỗi phòng (server giữ danh sách riêng, `World.bolts`; client chỉ nhận `fx` `bolt` lúc bắn). */
export const MAX_BOLTS = 64;
/** Tinh anh: xác suất một lần sinh quái thường thành tinh anh, hệ số, trần đồng thời mỗi phòng (M7.3; M7.9 chỉnh). */
export const ELITE_CHANCE = 0.04;
export const ELITE_MULT = { hp: 2.5, atk: 1.5, exp: 2 } as const;
export const MAX_ELITES = 3;

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
  // Quái Kim Đan của Âm Sương Trạch (M6, #403; docs/PHAN_CONG_M6.md). Số đo bằng mô hình ở docs/CAN_BANG.md: bãi "đúng bậc" ~20-35k tu vi / giờ
  // solo (gần Xích Mãng ~30k, không vượt 1,5x), KHÔNG an toàn cho người Trúc Cơ hậu kỳ (mất > 50% khí huyết / trận: không cày sớm được).
  // Chỉ sinh ở bản đồ khai báo trong `MapDef.monsterCap` (`MONSTER_CAP` = 0 ở bản đồ mặc định). Cùng cơ chế cận chiến, khác nhau ở chỉ số.
  {
    id: "suong_ho",
    name: "Sương Hồ",
    minDanger: 0.25,
    hp: 1600,
    atk: 150,
    speed: 150,
    radius: 13,
    aggro: 280,
    attackRange: 34,
    attackCd: 1000,
    exp: 110,
    level: 13,
    color: 0xbfd7e0,
  },
  {
    id: "thach_quy",
    name: "Thạch Quy",
    minDanger: 0.45,
    hp: 6500,
    atk: 70,
    speed: 70,
    radius: 20,
    aggro: 150,
    attackRange: 40,
    attackCd: 1800,
    exp: 215,
    level: 14,
    color: 0x6f7f5e,
  },
  {
    id: "doc_thiem",
    name: "Độc Thiềm",
    minDanger: 0.65,
    hp: 2600,
    atk: 290,
    speed: 110,
    radius: 15,
    aggro: 220,
    attackRange: 42,
    attackCd: 1500,
    exp: 230,
    level: 15,
    color: 0x7a5fa0,
  },
  // Trùm Kim Đan: một người và đội 2 người không an toàn, đội 3 từ Trung kỳ, đội 4 từ Sơ kỳ; đội 3 nhanh hơn săn solo ~1,15-1,2x
  {
    id: "hac_giao",
    name: "Hắc Giao",
    minDanger: 0.85,
    hp: 50000,
    atk: 150,
    speed: 105,
    radius: 28,
    aggro: 300,
    attackRange: 56,
    attackCd: 1600,
    exp: 3200,
    level: 18,
    color: 0x1d2a3a,
    boss: true,
  },
  // Trùm của bí cảnh Linh Hư (docs/THIET_KE_BI_CANH.md). Không sinh ngoài hoang: `MONSTER_CAP.yeu_vuong = 0` và các bản đồ
  // thường không khai báo loại này. Số liệu cân bằng ở 4c-2 (`server/src/balance/dungeon.ts`, docs/CAN_BANG.md mục "Bí cảnh"):
  // đội 3 người ở ngưỡng `minStep` hạ trùm trong ~6 phút (không ai chết ở ca mô phỏng khó: đứng yên, không né), đội 2 người
  // không kịp `timeLimitMs`, một người không hạ nổi. Là một BAO MÁU: sát thương nhẹ nhưng trận dài, nên cần đan và đồng đội.
  {
    id: "yeu_vuong",
    name: "Linh Hư Yêu Vương",
    minDanger: 0.8,
    hp: 100000,
    atk: 16,
    speed: 120,
    radius: 30,
    aggro: 320,
    attackRange: 60,
    attackCd: 1500,
    exp: 4500,
    level: 14,
    color: 0x5b2a8c,
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
export const MONSTER_CAP: Record<string, number> = {
  tho: 40,
  lang: 30,
  ho: 16,
  mang: 2,
  yeu_vuong: 0, // trùm bí cảnh: không sinh ở bản đồ thường
  // Quái Kim Đan: không sinh ở bản đồ mặc định; Âm Sương Trạch khai báo số lượng riêng (`MapDef.monsterCap`, #404)
  suong_ho: 0,
  thach_quy: 0,
  doc_thiem: 0,
  hac_giao: 0,
};
export const MONSTER_RESPAWN_MS = 10000;

/**
 * Quái sinh ra ngoài hoang ở bản đồ mặc định (`MONSTER_CAP` > 0). Trùm bí cảnh (`yeu_vuong`) không nằm đây: mô hình cân
 * bằng săn quái ngoài hoang (`server/src/balance`) dùng danh sách này để không tính nó như một bãi săn.
 */
export const WILD_MONSTERS: MonsterKind[] = MONSTERS.filter((m) => (MONSTER_CAP[m.id] ?? 0) > 0);

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
  | { kind: "breakfail"; by: string; x: number; y: number }
  /** Người chơi dùng chiêu `skill` (id `SkillDef`, client tra `fx` + hệ để vẽ) tại (x, y) theo hướng `angle`; `range` là tầm thật server tính (px) */
  | { kind: "cast"; by: string; skill: string; x: number; y: number; angle: number; range: number }
  /** Báo trước đòn của quái (telegraph): vùng `circle` (bán kính `r`), `cone` (`r`, `angle`, `arc`) hoặc `line` (`r` dài, `w` rộng, `angle`) tồn tại `ms`, rồi mới đáp đòn */
  | {
      kind: "warn";
      shape: "circle" | "cone" | "line";
      x: number;
      y: number;
      r: number;
      angle?: number;
      arc?: number;
      /** Bề rộng vùng báo (px), CHỈ dùng với `line`: bằng đúng bề rộng server tính khi đáp đòn */
      w?: number;
      ms: number;
    }
  /** Đạn tầm xa bắn ra lúc này: bay thẳng từ (x, y) theo `angle` với `speed` (px/giây) tối đa `range` px; client tự vẽ, server tự kiểm trúng */
  | {
      kind: "bolt";
      x: number;
      y: number;
      angle: number;
      speed: number;
      range: number;
      element?: Element;
    };
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
   * Kênh chat đội (lệnh `/p <nội dung>`) hoặc chat tông môn (lệnh `/s <nội dung>`, M3 bước 6): chỉ gửi cho thành viên,
   * kể cả thành viên ở bản đồ khác; bỏ trống là chat chung **cả server** (mọi bản đồ / phòng, đi qua kênh chung giữa các phòng, M3 bước 1)
   */
  channel?: "party" | "sect";
}
export interface ToastMsg {
  text: string;
  tone?: "good" | "bad" | "info";
}

/**
 * Tuỳ chọn khi vào phòng. Chế độ cũ (`AUTH_MODE=legacy`, mặc định cho dev / test / bot): `name` + `secret`. Chế độ tài khoản
 * (`AUTH_MODE=account`, bắt buộc khi chạy thật): chỉ `token` phiên (xem `shared/src/account.ts`); server bỏ qua trường không dùng.
 * `v`: phiên bản giao thức của client (`PROTOCOL_VERSION`, `shared/src/protocol.ts`); thiếu = client cũ (0). Server từ chối client
 * quá cũ bằng `JOIN_CLIENT_OUTDATED` TRƯỚC khi xác thực.
 */
export interface JoinOptions {
  name?: string;
  secret?: string;
  token?: string;
  v?: number;
}
