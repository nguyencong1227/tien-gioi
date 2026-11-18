// Cổng KHẢ THI cho nhiệm vụ tông môn (SECT_QUESTS, #968): mỗi (mẫu, bậc 0-3) phải LÀM ĐƯỢC —
// quái thật sự sinh ở bản đồ thế giới và KHÔNG cao hơn bậc nhiệm vụ, nguyên liệu thật sự rơi từ loài
// vừa bậc với số lần hạ kỳ vọng hợp lý, thưởng tu vi không vượt trần của cảnh giới bậc đó.
//
// CHỈ thêm test (không sửa mã trò chơi): hàm cổng ở đây (xuất từ tệp test), dữ liệu thật `SECT_QUESTS`
// trong `sect-depth.ts` KHÔNG đổi. Dữ liệu thật của E / D sau này (và mọi lần đổi bảng) chạy cổng này;
// đỏ ở ca nào là lỗi dữ liệu → mở issue dev-e kèm mẫu / bậc / số liệu (đừng sửa dữ liệu ở đây).
//
// Yêu cầu 4 (cống hiến theo độ khó = SECT_QUEST_CH, sectQuestSlots trải 60 ngày) đã có ở sect-depth.test.ts,
// không lặp lại ở đây.
import { describe, expect, it } from "vitest";
import { DROP_TABLES } from "./items";
import { MONSTER_BY_ID, MONSTER_CAP } from "./game";
import { MAPS } from "./map";
import { expToNext, REALMS } from "./realms";
import {
  SECT_QUESTS,
  SECT_QUEST_TIERS,
  type SectQuestTemplate,
  type SectQuestTier,
  sectQuestViolations,
} from "./sect-depth";

/** Trần số lần hạ quái kỳ vọng để thu đủ nguyên liệu một bước `collect`; vượt = dữ liệu phi lý. */
const MAX_EXPECTED_KILLS = 40;
/** Trần thưởng tu vi = phần này của tổng tu vi cần hoàn thành cảnh giới của bậc đó. */
const REWARD_EXP_CAP_FRAC = 0.1;

/**
 * Bậc săn của một loài quái, SUY TỪ `level` trong MONSTER_BY_ID (KHÔNG chép bản ánh xạ cố định của test E):
 * quái càng cao cấp (level lớn) càng thuộc bậc săn cao. Ngưỡng theo khoảng level thật của từng nhóm:
 * Phàm Nhân / Luyện Khí (tho 0, lang 1) = 0; Trúc Cơ (ho 7) = 1; Kim Đan (suong_ho 13, thach_quy 14, doc_thiem 15) = 2;
 * Nguyên Anh (han_lang 16, phong_nha 17, cot_tuong 17, doc_tuoc 18) = 3. Trùm không làm mục tiêu nhiệm vụ
 * (mang 12, hac_giao 18) có thể lệch bảng cân đối (`search-check.ts`) nhưng KHÔNG xuất hiện ở SECT_QUESTS nên không ảnh hưởng cổng.
 */
export function monsterHuntTier(monsterId: string): number {
  const m = MONSTER_BY_ID[monsterId];
  if (!m) return Number.POSITIVE_INFINITY; // quái lạ: coi là cao nhất để luôn bị chặn
  if (m.level <= 1) return 0;
  if (m.level <= 12) return 1;
  if (m.level <= 15) return 2;
  return 3;
}

/** Loài quái sinh ở ít nhất MỘT bản đồ thế giới (MAPS); trùm bí cảnh / quái triệu hồi (cap 0, không khai báo) KHÔNG tính. */
const SPAWNING_MONSTERS: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const def of MAPS) {
    const cap = def.monsterCap ?? MONSTER_CAP; // bản mặc định (Lạc Hà) dùng MONSTER_CAP
    for (const [id, n] of Object.entries(cap)) if (n > 0) set.add(id);
  }
  return set;
})();

/**
 * `chance × số lượng trung bình mỗi lần rơi` của LOÀI TỐT NHẤT (bậc ≤ `tier`) rơi `itemId`;
 * `undefined` nếu KHÔNG có loài bậc vừa nào rơi món đó. Dùng ước lượng số lần hạ kỳ vọng = `count / tỷ lệ này`.
 */
function bestCollectRate(itemId: string, tier: number): number | undefined {
  let best: number | undefined;
  for (const [mid, entries] of Object.entries(DROP_TABLES)) {
    if (monsterHuntTier(mid) > tier) continue; // chỉ tính loài vừa bậc nhiệm vụ
    for (const e of entries) {
      if (e.itemId !== itemId) continue;
      const rate = e.chance * ((e.min + e.max) / 2);
      if (best === undefined || rate > best) best = rate;
    }
  }
  return best;
}

/** Tổng tu vi cần để hoàn thành cảnh giới `realm` = tổng `expToNext` qua mọi bậc của cảnh giới (realms.ts). */
function realmExpTotal(realm: number): number {
  const r = REALMS[realm];
  if (!r) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let tier = 0; tier < r.tiers.length; tier++) sum += expToNext(realm, tier);
  return sum;
}

/**
 * Cổng khả thi: kế thừa `sectQuestViolations` (id thật, độ khó 1-3, lời thoại, quái / vật phẩm có thật, thưởng hợp lệ)
 * rồi THÊM các kiểm "làm được": quái sinh ở đâu đó và không quá cao bậc, nguyên liệu rơi từ loài vừa bậc với số lần hạ hợp lý,
 * thưởng tu vi ≤ 10 % tu vi hoàn thành cảnh giới. Trả danh sách lỗi (rỗng = sạch). Thuần: không đọc FS / mạng / giờ.
 */
export function sectQuestFeasibleViolations(
  templates: readonly SectQuestTemplate[] = SECT_QUESTS,
): string[] {
  const bad: string[] = [];
  bad.push(...sectQuestViolations(templates)); // cấu trúc + hợp lệ của thưởng (id / qty / exp)
  for (const t of templates) {
    for (const tier of SECT_QUEST_TIERS) {
      const d = t.byTier[tier];
      if (!d) continue;
      const where = `${t.id}.t${tier}`;
      const realm = tier === 0 ? 1 : tier + 1; // khớp buildSectQuest: bậc 0 → Luyện Khí, bậc 1..3 → Trúc Cơ..Nguyên Anh
      for (const st of d.steps) {
        if (st.kind === "kill") {
          if (!SPAWNING_MONSTERS.has(st.monster))
            bad.push(`${where}: quái ${st.monster} không sinh ở bản đồ nào`);
          else {
            const mt = monsterHuntTier(st.monster);
            if (mt > tier)
              bad.push(`${where}: quái ${st.monster} bậc ${mt} cao hơn nhiệm vụ bậc ${tier}`);
          }
        } else if (st.kind === "collect") {
          const rate = bestCollectRate(st.itemId, tier);
          if (rate === undefined)
            bad.push(`${where}: nguyên liệu ${st.itemId} không loài bậc ≤ ${tier} nào rơi`);
          else {
            const expectedKills = st.count / rate;
            if (expectedKills > MAX_EXPECTED_KILLS)
              bad.push(
                `${where}: thu ${st.itemId} x${st.count} cần ~${expectedKills.toFixed(1)} lần hạ (> ${MAX_EXPECTED_KILLS})`,
              );
          }
        }
      }
      const exp = d.rewards.exp ?? 0;
      const cap = realmExpTotal(realm) * REWARD_EXP_CAP_FRAC;
      if (exp > cap)
        bad.push(
          `${where}: thưởng tu vi ${exp} vượt trần ${Math.floor(cap)} (10 % cảnh giới ${realm})`,
        );
    }
  }
  return bad;
}

/** Clone sâu bảng mẫu (structuredClone: dữ liệu thuần) để đột biến mà không đụng `SECT_QUESTS` thật. */
function cloneQuests(tpls: readonly SectQuestTemplate[]): SectQuestTemplate[] {
  return tpls.map((t) => structuredClone(t));
}

/** Đổi monster của bước `kill` đầu tiên ở bậc `tier` của mẫu `templateId`. */
function setKillMonster(
  tpls: SectQuestTemplate[],
  templateId: string,
  tier: SectQuestTier,
  monster: string,
): void {
  const t = tpls.find((x) => x.id === templateId)!;
  const step = t.byTier[tier]!.steps[0]!;
  if (step.kind !== "kill") throw new Error(`bước ${templateId}.t${tier} không phải kill`);
  step.monster = monster;
}

/** Đổi itemId của bước `collect` đầu tiên ở bậc `tier` của mẫu `templateId`. */
function setCollectItem(
  tpls: SectQuestTemplate[],
  templateId: string,
  tier: SectQuestTier,
  itemId: string,
): void {
  const t = tpls.find((x) => x.id === templateId)!;
  const step = t.byTier[tier]!.steps[0]!;
  if (step.kind !== "collect") throw new Error(`bước ${templateId}.t${tier} không phải collect`);
  step.itemId = itemId;
}

/** Tăng count của bước `collect` đầu tiên ở bậc `tier` của mẫu `templateId`. */
function setCollectCount(
  tpls: SectQuestTemplate[],
  templateId: string,
  tier: SectQuestTier,
  count: number,
): void {
  const t = tpls.find((x) => x.id === templateId)!;
  const step = t.byTier[tier]!.steps[0]!;
  if (step.kind !== "collect") throw new Error(`bước ${templateId}.t${tier} không phải collect`);
  step.count = count;
}

/** Nhân thưởng exp của bậc `tier` của mẫu `templateId` với `mult`. */
function scaleRewardExp(
  tpls: SectQuestTemplate[],
  templateId: string,
  tier: SectQuestTier,
  mult: number,
): void {
  const t = tpls.find((x) => x.id === templateId)!;
  const exp = t.byTier[tier]!.rewards.exp ?? 0;
  t.byTier[tier]!.rewards.exp = Math.round(exp * mult);
}

/** Đổi itemId phần thưởng đầu tiên của bậc `tier` của mẫu `templateId` sang id lạ. */
function setRewardItemId(
  tpls: SectQuestTemplate[],
  templateId: string,
  tier: SectQuestTier,
  itemId: string,
): void {
  const t = tpls.find((x) => x.id === templateId)!;
  const items = t.byTier[tier]!.rewards.items;
  if (!items?.length) throw new Error(`bậc ${templateId}.t${tier} không có thưởng đồ`);
  items[0]!.itemId = itemId;
}

describe("cổng khả thi nhiệm vụ tông (SECT_QUESTS, #968)", () => {
  it("dữ liệu thật của E LÀM ĐƯỢC: không vi phạm (quái sinh, vừa bậc, nguyên liệu rơi, thưởng trong trần)", () => {
    // Requirement 6: nếu ca này đỏ → lỗi dữ liệu thật, mở issue dev-e (đừng sửa dữ liệu). Hiện xanh.
    expect(sectQuestFeasibleViolations(SECT_QUESTS)).toEqual([]);
  });

  it("monsterHuntTier suy từ level khớp bậc săn thật (tho/lang 0, ho 1, Kim Đan 2, Nguyên Anh 3)", () => {
    expect(monsterHuntTier("tho")).toBe(0);
    expect(monsterHuntTier("lang")).toBe(0);
    expect(monsterHuntTier("ho")).toBe(1);
    expect(monsterHuntTier("suong_ho")).toBe(2);
    expect(monsterHuntTier("thach_quy")).toBe(2);
    expect(monsterHuntTier("doc_thiem")).toBe(2);
    expect(monsterHuntTier("han_lang")).toBe(3);
    expect(monsterHuntTier("phong_nha")).toBe(3);
    expect(monsterHuntTier("cot_tuong")).toBe(3);
    expect(monsterHuntTier("doc_tuoc")).toBe(3);
    expect(monsterHuntTier("khong_co")).toBe(Number.POSITIVE_INFINITY); // quái lạ
  });

  // ---- Đột biến ĐỎ (requirement 5): mỗi ca đổi MỘT bước của dữ liệu thật rồi khẳng định cổng báo lỗi ----
  it("đột biến 1: kill dùng quái KHÔNG sinh ở bản đồ nào (trùm bí cảnh) -> báo lỗi", () => {
    const m = cloneQuests(SECT_QUESTS);
    setKillMonster(m, "st_tuan_thu_rung", 0, "yeu_vuong"); // yeu_vuong: cap 0, chỉ bí cảnh
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_tuan_thu_rung.t0") && s.includes("không sinh"))).toBe(true);
  });

  it("đột biến 2: collect dùng nguyên liệu KHÔNG có loài bậc vừa nào rơi -> báo lỗi (id có thật nên không phải lỗi tồn tại)", () => {
    const m = cloneQuests(SECT_QUESTS);
    // han_lang_mao chỉ rơi từ han_lang (bậc 3); ở bậc 0 không loài bậc ≤ 0 nào rơi → lỗi khả thi, KHÔNG phải lỗi tồn tại
    setCollectItem(m, "st_nop_thu_pham", 0, "han_lang_mao");
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_nop_thu_pham.t0") && s.includes("không loài bậc"))).toBe(
      true,
    );
  });

  it("đột biến 3: tăng count collect lên 500 (số lần hạ kỳ vọng vượt 40) -> báo lỗi", () => {
    const m = cloneQuests(SECT_QUESTS);
    setCollectCount(m, "st_bao_ve_khoang_mach", 1, 500); // nanh_soi x500: ~740 lần hạ
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_bao_ve_khoang_mach.t1") && s.includes("lần hạ"))).toBe(
      true,
    );
  });

  it("đột biến 4: thưởng tu vi x100 (vượt 10 % tu vi cảnh giới) -> báo lỗi", () => {
    const m = cloneQuests(SECT_QUESTS);
    scaleRewardExp(m, "st_dinh_sat_doc", 0, 100); // 100 -> 10000, trần bậc 0 (Luyện Khí) ~380
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_dinh_sat_doc.t0") && s.includes("vượt trần"))).toBe(true);
  });

  it("đột biến 5: itemId phần thưởng sang id lạ -> báo lỗi", () => {
    const m = cloneQuests(SECT_QUESTS);
    setRewardItemId(m, "st_dinh_sat_doc", 2, "khong_ton_tai_xyz");
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_dinh_sat_doc.t2") && s.includes("khong_ton_tai_xyz"))).toBe(
      true,
    );
  });

  it("đột biến 6: kill dùng quái sinh thật nhưng CAO HƠN bậc nhiệm vụ -> báo lỗi", () => {
    const m = cloneQuests(SECT_QUESTS);
    // han_lang sinh ở Hàn Vân Lĩnh (cap 20) nhưng bậc 3; đặt vào bậc 0 của nhiệm vụ -> vượt bậc
    setKillMonster(m, "st_tru_ho_son", 0, "han_lang");
    const v = sectQuestFeasibleViolations(m);
    expect(v.some((s) => s.includes("st_tru_ho_son.t0") && s.includes("cao hơn"))).toBe(true);
  });

  it("mọi bước kill của dữ liệu thật: quái sinh ở ≥1 bản đồ và bậc ≤ bậc nhiệm vụ", () => {
    for (const t of SECT_QUESTS)
      for (const tier of SECT_QUEST_TIERS) {
        const d = t.byTier[tier]!;
        for (const st of d.steps) {
          if (st.kind === "kill") {
            expect(
              SPAWNING_MONSTERS.has(st.monster),
              `${t.id}.t${tier}: ${st.monster} phải sinh`,
            ).toBe(true);
            expect(
              monsterHuntTier(st.monster),
              `${t.id}.t${tier}: ${st.monster}`,
            ).toBeLessThanOrEqual(tier);
          }
        }
      }
  });

  it("mọi bước collect của dữ liệu thật: có loài bậc ≤ bậc nhiệm vụ rơi, số lần hạ kỳ vọng ≤ 40", () => {
    for (const t of SECT_QUESTS)
      for (const tier of SECT_QUEST_TIERS) {
        const d = t.byTier[tier]!;
        for (const st of d.steps) {
          if (st.kind === "collect") {
            const rate = bestCollectRate(st.itemId, tier);
            expect(
              rate,
              `${t.id}.t${tier}: ${st.itemId} phải có loài bậc ≤ ${tier} rơi`,
            ).toBeTypeOf("number");
            expect(st.count / rate!, `${t.id}.t${tier}: ${st.itemId}`).toBeLessThanOrEqual(
              MAX_EXPECTED_KILLS,
            );
          }
        }
      }
  });
});
