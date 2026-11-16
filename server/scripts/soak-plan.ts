// Kế hoạch phân vai và gieo nhân vật cho thử tải dài (soak.ts). Tách ra khỏi soak.ts để kiểm bằng test đơn vị.
//
// Mặc định (không bật --m7) soak giữ y hệt trước đây: 100 bot Luyện Khí tầng 5 / 9, KHÔNG có sổ chiêu, nên không đo gì về chiêu thức,
// trạng thái, đạn, tinh anh hay Nguyên Anh. Bật `--m7` thì:
// - ~20 % số bot là Nguyên Anh (tầng 0..2) đứng săn ở Hàn Vân Lĩnh (vai "na"), mỗi người một bộ bốn ô chiêu rải đều để CẢ 6 chiêu Nguyên Anh
//   đợt 2 đều có người dùng (chiêu có `reqTier` thì chỉ bot đủ bậc mới được gắn: `skillReqMet`, giống lúc server kiểm `cast`);
// - các bot "hunt" còn lại là Trúc Cơ / Kim Đan xen kẽ, có sổ chiêu rải đều qua 12 chiêu đợt 1 mở cho họ;
// - vai khác (trấn, cổng, bí cảnh, PK, tông môn) giữ nguyên như cũ.
import { mkdirSync } from "node:fs";
import {
  DEFAULT_MAP,
  HAN_VAN_ID,
  REALMS,
  SKILLS_M7,
  SKILL_MAX_LEVEL,
  skillReqMet,
  slotOpen,
  LEARNABLE_SLOTS,
  type SkillBook,
  type SkillDef,
} from "@tien-gioi/shared";
import { seedBotSaveFile } from "./bots";

export type SoakRole = "hunt" | "crowd" | "travel" | "dungeon" | "duel" | "sect" | "na";

/** Cảnh giới Nguyên Anh (chỉ số trong `REALMS`) */
export const NGUYEN_ANH_REALM = 4;

/**
 * Các chiêu Nguyên Anh (`reqRealm` >= 4): lấy từ bảng chiêu của `shared/` để thêm chiêu Nguyên Anh mới thì soak `--m7` tự đòi
 * chiêu đó cũng phải được thi triển (không chép tay danh sách).
 */
export const NGUYEN_ANH_SKILL_IDS: readonly string[] = SKILLS_M7.filter(
  (s) => s.reqRealm >= NGUYEN_ANH_REALM,
).map((s) => s.id);

/** Mọi chiêu của game (18 chiêu hiện nay): mục tiêu "càng nhiều chiêu được thi triển càng tốt" */
export const ALL_SKILL_IDS: readonly string[] = SKILLS_M7.map((s) => s.id);

/** Tỉ lệ bot Nguyên Anh mặc định khi bật `--m7` */
export const DEFAULT_NA_RATIO = 0.2;

/** Bậc của bot Nguyên Anh lần lượt: tầng 2 trước để HAI bot đầu đã phủ đủ 6 chiêu (chiêu cần bậc 1 / 2 chỉ gắn được cho bot đủ bậc) */
export const NA_TIER_ORDER: readonly number[] = [2, 1, 0];

/** Số bot Nguyên Anh theo tỉ lệ: ít nhất 2 (đủ phủ 6 chiêu) khi có đủ chỗ, không vượt quá tổng số bot */
export function soakNaCount(bots: number, naRatio: number): number {
  if (!Number.isFinite(bots) || bots <= 0) return 0;
  const want = Math.round(bots * (Number.isFinite(naRatio) ? naRatio : DEFAULT_NA_RATIO));
  return Math.min(bots, Math.max(Math.min(2, bots), want));
}

/**
 * Phân vai cho `bots` bot. `naCount` bot Nguyên Anh (vai "na") xếp CUỐI, phần còn lại chia theo tỉ lệ cũ (30 % săn, 20 % trấn, 10 % cổng,
 * 16 % bí cảnh theo nhóm 4, 12 % PK theo cặp, phần dư là tông môn). `naCount = 0` cho đúng bảng cũ (100 bot: 30 / 20 / 10 / 16 / 12 / 12).
 * Mảng trả về có thể dài hơn `bots` ở số bot rất nhỏ (như trước đây: mỗi vai tối thiểu 1 bot); người gọi chỉ đọc `[0, bots)`.
 */
export function allocateSoakRoles(bots: number, naCount = 0): SoakRole[] {
  const na = Math.max(0, Math.min(Math.floor(naCount), bots));
  const rest = bots - na;
  const countHunt = Math.max(1, Math.round(rest * 0.3));
  const countCrowd = Math.max(1, Math.round(rest * 0.2));
  const countTravel = Math.max(1, Math.round(rest * 0.1));
  const countDungeon = Math.max(0, Math.floor((rest * 0.16) / 4) * 4);
  const countDuel = Math.max(0, Math.floor((rest * 0.12) / 2) * 2);
  const countSect = Math.max(
    0,
    rest - (countHunt + countCrowd + countTravel + countDungeon + countDuel),
  );

  const roles: SoakRole[] = [];
  const push = (role: SoakRole, n: number) => {
    for (let i = 0; i < n; i++) roles.push(role);
  };
  push("hunt", countHunt);
  push("crowd", countCrowd);
  push("travel", countTravel);
  push("dungeon", countDungeon);
  push("duel", countDuel);
  push("sect", countSect);
  while (roles.length < rest) roles.push("hunt");
  // Vai "na" xếp sau cùng để chỉ số các nhóm bí cảnh / PK / tông môn (tính theo chỉ số bot) không bị xô lệch
  const head = roles.slice(0, Math.max(rest, 0));
  const overflow = roles.slice(Math.max(rest, 0));
  return [...head, ...Array.from({ length: na }, () => "na" as const), ...overflow];
}

/** Kế hoạch gieo MỘT bot khi bật `--m7` (bot vai khác: `null`, gieo như cũ) */
export interface M7BotPlan {
  realm: number;
  tier: number;
  /** Bản đồ xuất phát: "na" ở Hàn Vân Lĩnh, "hunt" ở Lạc Hà Trấn như cũ */
  mapId: string;
  skills: SkillBook;
}

/** Số ô chiêu đã mở ở cảnh giới `realm` (ô mở theo thứ tự nên đếm là đủ) */
function openSlotCount(realm: number): number {
  return LEARNABLE_SLOTS.filter((s) => slotOpen(s, realm)).length;
}

/**
 * Chọn `n` chiêu cho một bot từ các chiêu nó đủ cảnh giới / bậc dùng: ưu tiên chiêu ÍT người được gắn nhất (`usage`) để chiêu nào cũng có chủ.
 * Bot Nguyên Anh xét thêm "chiêu Nguyên Anh trước" để cả bốn ô đều là chiêu đợt 2 khi đủ bậc; ngang nhau thì chiêu cần bậc cao hơn trước, rồi thứ tự bảng.
 */
function pickSkills(
  pool: readonly SkillDef[],
  n: number,
  usage: Map<string, number>,
  naFirst: boolean,
): SkillDef[] {
  const order = new Map(SKILLS_M7.map((s, i) => [s.id, i]));
  const used = (s: SkillDef) => usage.get(s.id) ?? 0;
  const sorted = [...pool].sort((a, b) => {
    if (naFirst && a.reqRealm !== b.reqRealm) return b.reqRealm - a.reqRealm;
    return (
      used(a) - used(b) ||
      b.reqRealm - a.reqRealm ||
      b.reqTier - a.reqTier ||
      (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  });
  return sorted.slice(0, n);
}

/**
 * Kế hoạch cảnh giới / bậc / sổ chiêu của từng bot (theo chỉ số 0-based của `roles`). Thuần và tất định: cùng đầu vào cho cùng kết quả,
 * không dùng ngẫu nhiên (hai lần soak so được với nhau).
 */
export function planM7Bots(roles: readonly SoakRole[], bots: number): (M7BotPlan | null)[] {
  const usage = new Map<string, number>();
  const plans: (M7BotPlan | null)[] = [];
  let naOrdinal = 0;
  let huntOrdinal = 0;
  for (let i = 0; i < bots; i++) {
    const role = roles[i];
    if (role !== "na" && role !== "hunt") {
      plans.push(null);
      continue;
    }
    const isNa = role === "na";
    const realm = isNa ? NGUYEN_ANH_REALM : huntOrdinal % 2 === 0 ? 2 : 3;
    const tiers = REALMS[realm].tiers.length;
    const tier = isNa
      ? NA_TIER_ORDER[naOrdinal % NA_TIER_ORDER.length] % tiers
      : huntOrdinal % tiers;
    const ordinal = isNa ? naOrdinal++ : huntOrdinal++;

    const pool = SKILLS_M7.filter((s) => skillReqMet(s, realm, tier));
    const picked = pickSkills(pool, openSlotCount(realm), usage, isNa);
    const skills: SkillBook = { learned: {}, slots: ["", "", "", ""] };
    picked.forEach((def, j) => {
      skills.learned[def.id] = 1 + ((ordinal + j) % SKILL_MAX_LEVEL);
      skills.slots[j] = def.id;
      usage.set(def.id, (usage.get(def.id) ?? 0) + 1);
    });
    plans.push({ realm, tier, mapId: isNa ? HAN_VAN_ID : DEFAULT_MAP.def.id, skills });
  }
  return plans;
}

/** Số bot theo cảnh giới theo kế hoạch gieo (bot vai khác: Luyện Khí = 1 như cũ) */
export function countRealms(plans: readonly (M7BotPlan | null)[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of plans) {
    const r = p?.realm ?? 1;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

/** Các chiêu có mặt ở ít nhất một ô chiêu trong kế hoạch (để kiểm "kế hoạch phủ đủ chiêu") */
export function slottedSkillIds(plans: readonly (M7BotPlan | null)[]): Set<string> {
  const out = new Set<string>();
  for (const p of plans) {
    for (const id of p?.skills.slots ?? []) if (id) out.add(id);
  }
  return out;
}

export interface SeedSoakBotOptions {
  name: string;
  secret: string;
  x: number;
  y: number;
  /** Bản đồ / cảnh giới / bậc / sổ chiêu mặc định khi không có kế hoạch M7 (Luyện Khí, không sổ chiêu như cũ) */
  baseRealm: number;
  baseTier: number;
  baseMapId: string;
  coin: number;
  dir: string;
  plan: M7BotPlan | null;
}

/**
 * Ghi tệp lưu của một bot soak. Có kế hoạch M7 thì dùng cảnh giới / bậc / bản đồ / sổ chiêu của kế hoạch; không thì như cũ.
 * MỘT chỗ ghi để test đơn vị đọc lại đúng tệp mà soak thật gieo (đột biến bỏ sổ chiêu ở đây làm test đỏ).
 */
export function seedSoakBot(o: SeedSoakBotOptions): void {
  mkdirSync(o.dir, { recursive: true });
  seedBotSaveFile(
    o.name,
    o.secret,
    o.x,
    o.y,
    o.plan?.realm ?? o.baseRealm,
    o.plan?.tier ?? o.baseTier,
    o.plan?.mapId ?? o.baseMapId,
    undefined,
    o.coin,
    o.dir,
    o.plan?.skills,
  );
}
