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
  /**
   * Đập đất (M7.3, `server/src/systems/slam.ts`): ĐÒN PHỤ độc lập với `behavior` (quái cận chiến hay `charger` đều có thể kèm đập đất). Khi có người trong `radius`
   * và đã hết hồi, quái đứng gồng `windupMs` (báo trước bằng `fx` `warn` hình tròn), rồi đập: mọi người còn trong vòng LÚC ĐÁP đòn mất `atk` x `mult`.
   */
  slam?: SlamDef;
  /**
   * Hệ HIỂN THỊ của đạn: chỉ quyết định MÀU đạn ở client (`fx` `bolt` gửi `element = boltElement ?? element`), KHÔNG tính khắc / bị khắc (`elementMult` chỉ đọc `element`).
   * Cần vì đặt `element` cho quái làm đổi sát thương chiêu của người chơi lên quái (x1,3 / x0,8): đạn băng của Sương Hồ muốn màu băng mà không đổi cân bằng. Bỏ trống thì
   * dùng `element`, rồi tới màu trung tính (đỏ cam).
   */
  boltElement?: Element;
}

/** Đập đất của quái (`MonsterKind.slam`). Tâm vòng là chỗ quái đứng lúc bắt đầu gồng (quái đứng yên suốt lúc gồng). */
export interface SlamDef {
  /** Thời gian gồng (ms): người chơi bước ra khỏi vòng trong khoảng này thì không trúng (>= 600 để kịp tránh) */
  windupMs: number;
  /** Bán kính vùng đập (px), cũng là khoảng cách người chơi tới quái để quái bắt đầu gồng */
  radius: number;
  /** Hệ số sát thương so với `atk` */
  mult: number;
  /** Chờ giữa hai lần đập (ms), tính từ lúc đáp đòn */
  cdMs: number;
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
    // M7.3 (#504): sói lao tới: đứng gồng 700 ms (báo trước đường lao), rồi lao thẳng. Số khởi đầu, M7.9 hiệu chỉnh.
    behavior: "charger",
    windupMs: 700,
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
    // M7.3 (#504): hổ lao tới, gồng lâu hơn sói một chút (900 ms) vì đòn nặng hơn. Chảy máu nhẹ sau đòn: bước sau. Số khởi đầu, M7.9 hiệu chỉnh.
    behavior: "charger",
    windupMs: 900,
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
    // M7.3 (#504): hồ tuyết đứng xa bắn đạn băng (đứng bắn cách 0,3-0,85 tầm, lùi khi bị áp sát). Số khởi đầu, M7.9 hiệu chỉnh.
    behavior: "ranged",
    boltSpeed: 280,
    boltRange: 300,
    boltElement: "bang", // chỉ tô màu đạn (băng); `element` của quái vẫn trống nên `elementMult` lên Sương Hồ không đổi
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
    // M7.3 (#504): cóc độc nhổ đạn độc (chậm, dễ né): đạn TRÚNG thì gắn độc (`POISON_EFFECT`, không giết người). Số khởi đầu, M7.9 hiệu chỉnh.
    behavior: "poisoner",
    boltSpeed: 220,
    boltRange: 260,
    boltElement: "am", // đạn độc màu tím: tách khỏi nền cỏ và khỏi đạn băng (đạn `moc` xanh lá tương phản thấp, B đã chụp Chrome thật)
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
  // Quái Nguyên Anh ở Hàn Vân Lĩnh (M7.5b, #506; docs/PHAN_CONG_M7.md mục 8). Số khởi đầu: suy từ loài Kim Đan CÙNG VAI theo tỉ lệ chỉ số người chơi giữa
  // hai bậc (máu x ~1,8, công x ~1,76, `exp` x6 theo `REALM_EXP_BASE`), M7.9 hiệu chỉnh bằng `huntFight` ở cảnh giới 4. Có hệ (`element`): người chơi có
  // chiêu khắc thì đánh mạnh hơn (x1,3), bị khắc thì yếu đi (x0,8), đó là lý do bản đồ này có hệ còn các loài trước không.
  {
    id: "han_lang",
    name: "Hàn Lang",
    minDanger: 0.2,
    hp: 2900,
    atk: 264,
    speed: 160,
    radius: 14,
    aggro: 280,
    attackRange: 36,
    attackCd: 1000,
    exp: 660,
    level: 16,
    color: 0x9fc3e8,
    element: "thuy",
    // Sói băng lao tới: gồng 700 ms rồi lao thẳng (đòn lao x1,5)
    behavior: "charger",
    windupMs: 700,
  },
  {
    id: "phong_nha",
    name: "Phong Nha",
    minDanger: 0.4,
    hp: 2800,
    atk: 309,
    speed: 150,
    radius: 13,
    aggro: 300,
    attackRange: 34,
    attackCd: 1000,
    exp: 760,
    level: 17,
    color: 0xb8bcc8,
    element: "kim",
    // Chim nanh thép đứng xa bắn đạn kim (màu đạn theo `element`)
    behavior: "ranged",
    boltSpeed: 300,
    boltRange: 320,
  },
  {
    id: "cot_tuong",
    name: "Cốt Tượng",
    minDanger: 0.55,
    hp: 11800,
    atk: 123,
    speed: 70,
    radius: 22,
    aggro: 150,
    attackRange: 44,
    attackCd: 1800,
    exp: 1290,
    level: 17,
    color: 0xd8cdb4,
    element: "tho",
    // Voi xương to, chậm, máu rất cao, công thấp. Cận chiến + ĐẬP ĐẤT báo trước (gồng 1,1 s, vòng 90 px, x2 công, 6 s một lần): đứng sát nó là phải biết bước ra.
    slam: { windupMs: 1100, radius: 90, mult: 2, cdMs: 6000 },
  },
  {
    id: "doc_tuoc",
    name: "Độc Tước",
    minDanger: 0.7,
    hp: 4700,
    atk: 512,
    speed: 115,
    radius: 13,
    aggro: 240,
    attackRange: 42,
    attackCd: 1500,
    exp: 1380,
    level: 18,
    color: 0x4e8a46,
    element: "moc",
    // Sẻ độc nhổ đạn độc (chậm, dễ né): trúng thì gắn độc (`POISON_EFFECT`, không giết người). Công cao, máu thấp như Độc Thiềm.
    behavior: "poisoner",
    boltSpeed: 240,
    boltRange: 280,
    boltElement: "am", // đạn độc màu tím như Độc Thiềm: "tím = độc" nhất quán (đề xuất của B ở #622; `element` mộc của quái vẫn quyết định khắc / bị khắc)
  },
  // Trùm Nguyên Anh: bãi của đội 3-4 người (như Hắc Giao); lao thẳng (đập đất + vòng lạnh thêm ở bước hành vi kế)
  {
    id: "thien_han_vuong",
    name: "Thiên Hàn Vương",
    minDanger: 0.85,
    hp: 82000,
    atk: 240,
    speed: 110,
    radius: 30,
    aggro: 320,
    attackRange: 60,
    attackCd: 1600,
    exp: 19200,
    level: 21,
    color: 0x5aa0d8,
    boss: true,
    element: "thuy",
    behavior: "charger",
    windupMs: 900,
    // Vừa lao vừa ĐẬP ĐẤT vòng lớn (gồng 1,2 s, vòng 140 px, x1,8 công, 7 s một lần): đứng sát trùm thì phải bước ra, đứng xa thì tránh đường lao
    slam: { windupMs: 1200, radius: 140, mult: 1.8, cdMs: 7000 },
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
  // ---------- Quái con do TRÙM triệu hồi (mục 42, #887 G3; `BossAction` `summon`, `docs/THIET_KE_TRUM.md` mục 6) ----------
  // QUY ƯỚC: không sinh ngoài hoang (`MONSTER_CAP` = 0, bản đồ không khai báo), chỉ xuất hiện khi trùm gọi (`summonAdds`, `maxAdds` giữ số con sống). `exp: 0`
  // và KHÔNG có mục trong `DROP_TABLES`: server còn chặn thêm ở `killMonster` (`MonsterCtrl.addOf`: không tu vi, không rơi đồ / Linh thạch, không nhiệm vụ, không kiếp),
  // nên giết quái con để cày là vô ích. Không `boss`, không `element` (không làm đổi sát thương chiêu của người chơi). Hình ảnh: ảnh dự phòng vẽ bằng code (B vẽ sau).
  // Số là ĐỀ XUẤT khởi đầu (Dev D chốt bằng mô phỏng T5): mỗi con yếu hơn nhiều so với trùm, nguy hiểm vì ĐÔNG và ép người chơi chia sự chú ý, không vì một đòn nặng.
  {
    // Rắn con của Xích Mãng (Trúc Cơ): nhỏ, nhanh, cắn nhẹ; chừng 3% máu và 30% công của trùm, hai con cùng lúc (`maxAdds` 2) bằng ~60% công của trùm.
    id: "ran_con",
    name: "Rắn Con",
    minDanger: 0.78,
    hp: 320,
    atk: 42,
    speed: 140,
    radius: 11,
    aggro: 260,
    attackRange: 28,
    attackCd: 1200,
    exp: 0,
    level: 12,
    color: 0xd9644a,
  },
  {
    // Phân thân Linh Hư Yêu Vương (bí cảnh Kim Đan): máu rất thấp, bị hạ nhanh. HÀNH VI DỰ KIẾN (server làm ở T2 / #871, KHÔNG ở bước dữ liệu này): nổ vòng nhỏ sau `ttl` giây kể
    // từ lúc xuất hiện hoặc khi bị hạ, nên phải đánh nhanh hoặc tránh ra; hiện tại là quái cận chiến thường (đúng với `BossAction` `summon`: chưa có nổ).
    id: "phan_than_yeu_vuong",
    name: "Phân Thân Yêu Vương",
    minDanger: 0.8,
    hp: 500,
    atk: 40,
    speed: 140,
    radius: 14,
    aggro: 320,
    attackRange: 34,
    attackCd: 1300,
    exp: 0,
    level: 14,
    color: 0x9b6fd0,
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
  // Quái con do trùm triệu hồi (#887): KHÔNG sinh tự nhiên ở bản đồ nào; chỉ `summonAdds` dựng
  ran_con: 0,
  phan_than_yeu_vuong: 0,
  // Quái Kim Đan: không sinh ở bản đồ mặc định; Âm Sương Trạch khai báo số lượng riêng (`MapDef.monsterCap`, #404)
  suong_ho: 0,
  thach_quy: 0,
  doc_thiem: 0,
  hac_giao: 0,
  // Quái Nguyên Anh (M7.5b): không sinh ở bản đồ mặc định; Hàn Vân Lĩnh khai báo số lượng riêng (`MapDef.monsterCap`)
  han_lang: 0,
  phong_nha: 0,
  cot_tuong: 0,
  doc_tuoc: 0,
  thien_han_vuong: 0,
};
/**
 * Loài quái CHỈ do trùm triệu hồi (#887): không sinh ngoài hoang, `exp` 0, không bảng rơi đồ / Linh thạch (`DROP_TABLES` / `COIN_DROPS` KHÔNG có mục), không nhiệm vụ / kiếp
 * (server chặn ở `killMonster` qua `MonsterCtrl.addOf`). Test dữ liệu (`boss-adds.test.ts`) giữ quy ước; hai test "mọi quái có bảng rơi" miễn cho các loài này.
 */
export const SUMMON_ONLY_KINDS: readonly string[] = ["ran_con", "phan_than_yeu_vuong"];
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
      /**
       * Bán kính TRONG (px), CHỈ dùng với `circle` (M42 trùm, vành khuyên): vùng nguy hiểm là `[r0, r]`, giữa `r0` là chỗ an toàn. Thiếu = hình tròn đặc.
       * Client cũ không biết trường này vẽ cả hình tròn đặc: thận trọng hơn, không nguy hiểm.
       */
      r0?: number;
      ms: number;
    }
  /** Trùm (mục 42) bắt đầu vận chiêu `ability` (id trong `BossDef.abilities`): thanh máu trùm hiện tên chiêu trong `ms`. (x, y) = chỗ trùm đứng (để `sendNear` chỉ gửi cho người ở gần). Client cũ bỏ qua `fx` lạ. */
  | { kind: "bossCast"; by: string; x: number; y: number; ability: string; ms: number }
  /** Trùm chuyển sang giai đoạn `phase` (chỉ số trong `BossDef.phases`): tiếng gầm, hiệu ứng, cập nhật thanh máu. */
  | { kind: "bossPhase"; by: string; x: number; y: number; phase: number }
  /** Trùm bí cảnh vào cuồng nộ (đánh quá lâu). */
  | { kind: "bossEnrage"; by: string; x: number; y: number }
  /**
   * Trùm (mục 42) dựng GIÁP (chiêu `buff` hoặc hành động vào giai đoạn): trong `ms` (ms) mọi sát thương trùm nhận được nhân `mult` (0 < `mult` <= 1, ví dụ 0,5 = chịu nửa sát thương).
   * Gửi MỘT lần lúc dựng (không gửi lại mỗi tick); dựng lại lúc đang có giáp thì `fx` mới thay thế `fx` cũ. Client tự đếm `ms` để tắt vầng giáp; trùm chết / reset thì thực thể
   * biến mất nên không cần tin "hết giáp". (x, y) = chỗ trùm đứng (để `sendNear` chỉ gửi cho người ở gần). Client cũ bỏ qua `fx` lạ.
   */
  | { kind: "bossArmor"; by: string; x: number; y: number; ms: number; mult: number }
  /**
   * Trùm triệu hồi `n` quái con (>= 1, đã trừ phần vượt `BossDef.maxAdds` và chỗ không dựng được): gửi MỘT lần mỗi lần gọi, chỉ khi có ít nhất một con thật sự xuất hiện.
   * (x, y) = chỗ trùm đứng; quái con tự hiện qua state như mọi quái, `fx` chỉ để vẽ hiệu ứng gọi hồn / tiếng. Client cũ bỏ qua `fx` lạ.
   */
  | { kind: "bossSummon"; by: string; x: number; y: number; n: number }
  /** Đạn tầm xa bắn ra lúc này: bay thẳng từ (x, y) theo `angle` với `speed` (px/giây) tối đa `range` px; client tự vẽ, server tự kiểm trúng */
  | {
      kind: "bolt";
      x: number;
      y: number;
      angle: number;
      speed: number;
      range: number;
      element?: Element;
    }
  /**
   * ĐẠN của người chơi, theo TỪNG ĐOẠN (mục 51, CT1b): bay thẳng từ (x, y) theo `angle` với `speed` (px/giây) trong `ms` (thời gian tới chỗ dừng do MÁY CHỦ tính: ô chặn, trúng,
   * hết tầm). Mỗi lần nảy / xuyên đổi hướng máy chủ gửi `pbolt` MỚI từ điểm đó (client KHÔNG tự mô phỏng nảy). `skill` = id `SkillDef` (tra `fx` + hệ để vẽ). Phần trúng đã có `dmg`.
   */
  | {
      kind: "pbolt";
      by: string;
      skill: string;
      x: number;
      y: number;
      angle: number;
      speed: number;
      ms: number;
    }
  /** SÉT LAN: đường nảy theo thứ tự, `pts` = toạ độ phẳng [x0, y0, x1, y1, ...] (2 tới `CHAIN_FX_POINTS_MAX` điểm nguyên, điểm đầu là người dùng); (x, y) = chỗ người dùng đứng (để `sendNear` chỉ gửi cho người ở gần). Client vẽ tia nối tiếp; phần trúng có `dmg`. */
  | { kind: "chain"; by: string; skill: string; x: number; y: number; pts: number[] }
  /**
   * VẬT THỂ BỀN (`zone` / `trap` / `totem` / `aura`) vừa dựng: `id` (số nguyên tăng dần THEO PHÒNG) để `fxEnd` gỡ đúng cái; (x, y) tâm, `r` bán kính, `ms` thời gian tồn tại tối đa. Gửi MỘT lần
   * (`sendNear`); người đi VÀO vùng nhìn sau lúc dựng KHÔNG thấy nó (sát thương vẫn tính), nối lại mạng thì hình mất: chấp nhận vì vật thể ngắn.
   */
  | {
      kind: "zone" | "trap" | "totem" | "aura";
      by: string;
      skill: string;
      id: number;
      x: number;
      y: number;
      r: number;
      ms: number;
    }
  /** Vật thể bền `id` kết thúc SỚM hơn `ms`: `pop` (bẫy nổ) hoặc `gone` (chủ chết / rời / qua cổng, bị thay, vùng cũ nhất bị đẩy). (x, y) = chỗ vật thể đứng (để `sendNear` chỉ gửi cho người ở gần). */
  | { kind: "fxEnd"; id: number; x: number; y: number; why: "pop" | "gone" };
/** Số điểm tối đa của `FxMsg` `chain` (người dùng + `SKILL_LIMITS.chainBouncesMax` lần nảy + 1 mục tiêu đầu). */
export const CHAIN_FX_POINTS_MAX = 6;
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
  /**
   * Nhịp gửi tin của client ở tiền cảnh (ms, `NET_BEAT_MS` ở `net-guard.ts`). Có khai (trong khoảng hợp lệ) thì máy chủ áp luật "im lặng quá
   * `NET_SILENCE_GHOST_MS` thì thành hồn lìa xác" cho người này; không khai (client cũ) thì giữ hành vi cũ.
   */
  beatMs?: number;
}
