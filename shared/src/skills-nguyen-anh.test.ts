// Guard test giữ chặt luật chiêu Nguyên Anh đợt 2 (M7.9, #654) do Dev A chốt: mọi sai lệch số liệu
// chiêu / nguồn rơi phải làm test này ĐỎ. Chữ Việt (Latin có dấu) không phải chữ Hán (CJK); tệp này
// cố ý KHÔNG chứa ký tự CJK — id chiêu / loài là ASCII, mô tả bằng tiếng Việt.
import { describe, expect, it } from "vitest";
import { DROP_TABLES, ITEM_BY_ID, SKILLS_M7, bookIdOf } from "./index";

/** 6 chiêu Nguyên Anh đợt 2 = mọi chiêu trong SKILLS_M7 ở cảnh giới Nguyên Anh (reqRealm 4). */
const DOT2 = SKILLS_M7.filter((s) => s.reqRealm === 4);
const DOT2_IDS = new Set(DOT2.map((s) => s.id));

/** Loài thường Nguyên Anh: mỗi loài rơi 1-2 quyển chiêu đợt 2 (thực tế là đúng 2). */
const NGUYEN_ANH_SPECIES = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"] as const;
/** Trùm Nguyên Anh: rơi đúng 1 quyển đợt 2, hiếm nhất. */
const BOSS = "thien_han_vuong";

/** Quyển kinh của chiêu đợt 2 = item có `teaches` là id một chiêu đợt 2. */
const isDot2Book = (itemId: string): boolean => {
  const teaches = ITEM_BY_ID[itemId]?.teaches;
  return typeof teaches === "string" && DOT2_IDS.has(teaches);
};

describe("Chiêu Nguyên Anh đợt 2 — luật giữ chặt (M7.9, #654)", () => {
  it("đúng 6 chiêu, tất cả cảnh giới Nguyên Anh (reqRealm 4)", () => {
    expect(DOT2).toHaveLength(6);
    for (const s of DOT2) expect(s.reqRealm, s.id).toBe(4);
  });

  it("reqTier là multiset [0,0,1,1,2,2]: 2 chiêu tier 0, 2 tier 1, 2 tier 2", () => {
    const tiers = DOT2.map((s) => s.reqTier).sort((a, b) => a - b);
    expect(tiers).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("mỗi ngũ hành ≤ 2 chiêu", () => {
    const count: Record<string, number> = {};
    for (const s of DOT2) count[s.element] = (count[s.element] ?? 0) + 1;
    for (const [el, n] of Object.entries(count)) expect(n, el).toBeLessThanOrEqual(2);
  });

  it("dùng ≥ 4 hình tấn công khác nhau", () => {
    const shapes = new Set(DOT2.map((s) => s.shape));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });

  it("rarity ∈ {2, 3} và mpPct ≤ 0,5", () => {
    for (const s of DOT2) {
      expect([2, 3].includes(s.rarity), s.id).toBe(true);
      expect(s.mpPct, s.id).toBeLessThanOrEqual(0.5);
    }
  });

  it("mọi kinh quyển đợt 2 dạy đúng chiêu của nó", () => {
    for (const s of DOT2) {
      const book = ITEM_BY_ID[bookIdOf(s.id)];
      expect(book, bookIdOf(s.id)).toBeDefined();
      expect(book.teaches).toBe(s.id);
    }
  });

  it("4 loài Nguyên Anh: mỗi loài rơi đúng 2 quyển đợt 2, chance ≤ 0,02", () => {
    for (const species of NGUYEN_ANH_SPECIES) {
      const books = (DROP_TABLES[species] ?? []).filter((e) => isDot2Book(e.itemId));
      expect(books, species).toHaveLength(2);
      for (const e of books) expect(e.chance, `${species}/${e.itemId}`).toBeLessThanOrEqual(0.02);
    }
  });

  it("Thiên Hàn Vương: rơi đúng 1 quyển đợt 2, chance ∈ [0,2; 0,3], lớn hơn mọi quyển đợt 2 khác", () => {
    const bossBooks = (DROP_TABLES[BOSS] ?? []).filter((e) => isDot2Book(e.itemId));
    expect(bossBooks, BOSS).toHaveLength(1);
    const bossChance = bossBooks[0].chance;
    expect(bossChance).toBeGreaterThanOrEqual(0.2);
    expect(bossChance).toBeLessThanOrEqual(0.3);

    // So sánh với chance của MỌI quyển đợt 2 khác (ở cả loài thường lẫn trùm, trừ chính nó)
    const otherChances: number[] = [];
    for (const species of [...NGUYEN_ANH_SPECIES, BOSS]) {
      for (const e of DROP_TABLES[species] ?? []) {
        if (isDot2Book(e.itemId) && !(species === BOSS && e.itemId === bossBooks[0].itemId)) {
          otherChances.push(e.chance);
        }
      }
    }
    expect(otherChances.length).toBeGreaterThan(0);
    for (const c of otherChances)
      expect(bossChance, `boss ${bossChance} vs ${c}`).toBeGreaterThan(c);
  });
});
