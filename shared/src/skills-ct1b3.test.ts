// Hợp đồng THÊM CHIÊU phần TẦNG THEO PHẨM + LUYỆN CHIÊU (mục 51, CT1b-3 #1076): bảng hệ số tầng 1-6 (tầng 1-3 GIỮ NGUYÊN), `skillMaxLevelOf` (chỉ phẩm KHAI BÁO mới có tầng 4-6: 18 chiêu cũ
// không đổi), `SkillBook.mastery` (đọc / lưu an toàn), `masteryNeedOf` / `addMastery`, `learnSkill` theo tầng tối đa của phẩm, `SkillsMsg.mastery`.
import { afterEach, describe, expect, it } from "vitest";
import {
  LEARNABLE_SKILLS,
  MASTERY_NEED,
  MASTERY_PER_MIN_CAP,
  SKILLS_M7,
  SKILL_BY_ID,
  SKILL_LEVEL_COOLDOWN,
  SKILL_LEVEL_COOLDOWN_TABLE,
  SKILL_LEVEL_DAMAGE,
  SKILL_LEVEL_DAMAGE_TABLE,
  SKILL_MAX_LEVEL,
  SKILL_MAX_LEVEL_BY_GRADE,
  SKILL_TIER_MAX,
  addMastery,
  assignSlot,
  emptySkillBook,
  learnSkill,
  masteryNeedOf,
  sanitizeSkillBook,
  skillCooldownMs,
  skillCooldownMult,
  skillDamageMult,
  skillGradeOf,
  skillMaxLevelOf,
  type SkillBook,
  type SkillDef,
  type SkillsMsg,
} from "./index";

const ids: string[] = [];
/** Thêm tạm một chiêu thử (phẩm `grade`) vào bảng tra và danh sách học được; gỡ sau mỗi test. */
function withSkill(id: string, grade?: number): SkillDef {
  const def = { ...SKILLS_M7[0]!, id, ...(grade === undefined ? {} : { grade }) } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[id] = def;
  (LEARNABLE_SKILLS as SkillDef[]).push(def);
  ids.push(id);
  return def;
}
afterEach(() => {
  for (const id of ids.splice(0)) {
    delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
    const i = (LEARNABLE_SKILLS as SkillDef[]).findIndex((d) => d.id === id);
    if (i >= 0) (LEARNABLE_SKILLS as SkillDef[]).splice(i, 1);
  }
});

describe("hệ số theo tầng 1-6", () => {
  it("tầng 1-3 TRÙNG công thức tuyến tính cũ; tầng 4-6 theo bảng; tăng đơn điệu, hồi chiêu giảm đơn điệu", () => {
    for (let l = 1; l <= 3; l++) {
      expect(skillDamageMult(l)).toBeCloseTo(1 + SKILL_LEVEL_DAMAGE * (l - 1), 12);
      expect(skillCooldownMult(l)).toBeCloseTo(1 - SKILL_LEVEL_COOLDOWN * (l - 1), 12);
    }
    expect([4, 5, 6].map(skillDamageMult)).toEqual([1.4, 1.5, 1.6]);
    expect([4, 5, 6].map(skillCooldownMult)).toEqual([0.8, 0.76, 0.72]);
    for (let l = 2; l <= SKILL_TIER_MAX; l++) {
      expect(skillDamageMult(l)).toBeGreaterThan(skillDamageMult(l - 1));
      expect(skillCooldownMult(l)).toBeLessThan(skillCooldownMult(l - 1));
    }
    expect(SKILL_LEVEL_DAMAGE_TABLE).toHaveLength(SKILL_TIER_MAX);
    expect(SKILL_LEVEL_COOLDOWN_TABLE).toHaveLength(SKILL_TIER_MAX);
  });

  it("tầng ngoài khoảng / số lạ bị kẹp [1, 6]", () => {
    expect(skillDamageMult(0)).toBe(1);
    expect(skillDamageMult(-5)).toBe(1);
    expect(skillDamageMult(Number.NaN)).toBe(1);
    expect(skillDamageMult(99)).toBe(1.6);
    expect(skillDamageMult(4.9)).toBe(1.4);
    expect(skillCooldownMult(99)).toBe(0.72);
    expect(skillCooldownMs({ cooldown: 10_000 }, 6, 0)).toBe(7200);
  });
});

describe("skillMaxLevelOf: tầng tối đa theo phẩm KHAI BÁO", () => {
  it("Hoàng 3 / Huyền 4 / Địa 5 / Thiên 6; không khai hoặc khai sai thì 3", () => {
    expect([0, 1, 2, 3].map((g) => skillMaxLevelOf({ grade: g }))).toEqual([3, 4, 5, 6]);
    expect(SKILL_MAX_LEVEL_BY_GRADE).toEqual([3, 4, 5, 6]);
    for (const bad of [undefined, null, -1, 4, 1.5, "2", Number.NaN]) {
      expect(skillMaxLevelOf({ grade: bad }), String(bad)).toBe(SKILL_MAX_LEVEL);
    }
    expect(skillMaxLevelOf({})).toBe(SKILL_MAX_LEVEL);
  });

  it("18 chiêu cũ KHÔNG đổi: tối đa tầng 3 dù `skillGradeOf` suy ra phẩm cao từ độ hiếm", () => {
    for (const def of SKILLS_M7) {
      expect(skillMaxLevelOf(def), def.id).toBe(3);
      let book: SkillBook = emptySkillBook();
      for (let i = 0; i < 6; i++) {
        const r = learnSkill(book, def.id, 9, 9);
        if (r.ok) book = r.book;
      }
      expect(book.learned[def.id], def.id).toBe(3);
    }
    expect(SKILLS_M7.some((d) => skillGradeOf(d) >= 1)).toBe(true); // có chiêu cũ được suy ra phẩm cao mà vẫn dừng ở tầng 3
  });
});

describe("learnSkill theo tầng tối đa của phẩm", () => {
  it("chiêu Thiên phẩm học được tới tầng 6 rồi `maxed`; Huyền tới 4", () => {
    const thien = withSkill("thu_thien", 3);
    let book = emptySkillBook();
    for (let l = 1; l <= 6; l++) {
      const r = learnSkill(book, thien.id, 9, 9);
      expect(r.ok, `tầng ${l}`).toBe(true);
      if (r.ok) {
        expect(r.level).toBe(l);
        book = r.book;
      }
    }
    expect(learnSkill(book, thien.id, 9, 9)).toEqual({ ok: false, reason: "maxed" });
    const huyen = withSkill("thu_huyen", 1);
    let b2 = emptySkillBook();
    for (let i = 0; i < 4; i++) {
      const r = learnSkill(b2, huyen.id, 9, 9);
      if (r.ok) b2 = r.book;
    }
    expect(b2.learned[huyen.id]).toBe(4);
    expect(learnSkill(b2, huyen.id, 9, 9)).toEqual({ ok: false, reason: "maxed" });
  });

  it("quyển trùng lên tầng thì điểm luyện dở dang của chiêu đó bị bỏ (luyện lại từ 0), chiêu khác giữ nguyên", () => {
    const a = withSkill("thu_a", 3);
    const b = withSkill("thu_b", 3);
    const book: SkillBook = {
      learned: { [a.id]: 1, [b.id]: 1 },
      slots: ["", "", "", ""],
      mastery: { [a.id]: 30, [b.id]: 40 },
    };
    const r = learnSkill(book, a.id, 9, 9);
    expect(r.ok && r.book.mastery).toEqual({ [b.id]: 40 });
    expect(book.mastery).toEqual({ [a.id]: 30, [b.id]: 40 }); // sổ cũ không bị sửa
  });
});

describe("masteryNeedOf", () => {
  it("điểm cần theo tầng hiện tại; dừng ở (tầng tối đa - 1); tầng / phẩm lạ -> null", () => {
    expect(MASTERY_NEED).toEqual([60, 150, 300, 600]);
    expect(MASTERY_PER_MIN_CAP).toBe(60);
    // Hoàng (max 3): chỉ luyện tầng 1 -> 2
    expect(masteryNeedOf({ grade: 0 }, 1)).toBe(60);
    expect(masteryNeedOf({ grade: 0 }, 2)).toBeNull();
    expect(masteryNeedOf({}, 1)).toBe(60); // không khai phẩm = như Hoàng
    // Thiên (max 6): luyện tới tầng 5
    expect([1, 2, 3, 4, 5].map((l) => masteryNeedOf({ grade: 3 }, l))).toEqual([
      60,
      150,
      300,
      600,
      null,
    ]);
    expect(masteryNeedOf({ grade: 2 }, 3)).toBe(300);
    expect(masteryNeedOf({ grade: 2 }, 4)).toBeNull();
    for (const bad of [0, -1, 1.5, Number.NaN, "1" as unknown as number, 99])
      expect(masteryNeedOf({ grade: 3 }, bad), String(bad)).toBeNull();
  });
});

describe("addMastery", () => {
  const def = (grade = 3) => ({ id: "thu_a", grade });
  const book = (level = 1, mastery?: Record<string, number>): SkillBook => ({
    learned: { thu_a: level },
    slots: ["", "", "", ""],
    ...(mastery ? { mastery } : {}),
  });

  it("cộng dồn điểm chưa đủ: chưa lên tầng, sổ cũ không bị sửa", () => {
    const b = book(1);
    const r = addMastery(b, def(), 25);
    expect(r.leveledTo).toBeUndefined();
    expect(r.book.mastery).toEqual({ thu_a: 25 });
    expect(r.book.learned.thu_a).toBe(1);
    expect(b.mastery).toBeUndefined();
    expect(addMastery(r.book, def(), 20).book.mastery).toEqual({ thu_a: 45 });
  });

  it("đủ điểm thì lên tầng kế và chuyển phần dư; đủ nhiều thì lên liền nhiều tầng", () => {
    const r = addMastery(book(1, { thu_a: 50 }), def(), 20);
    expect(r.leveledTo).toBe(2);
    expect(r.book.learned.thu_a).toBe(2);
    expect(r.book.mastery).toEqual({ thu_a: 10 }); // 70 - 60
    const big = addMastery(book(1), def(), 60 + 150 + 7);
    expect(big.leveledTo).toBe(3);
    expect(big.book.mastery).toEqual({ thu_a: 7 });
  });

  it("DỪNG ở (tầng tối đa - 1): điểm dư bỏ, không lên tầng cuối bằng luyện", () => {
    const r = addMastery(book(1), def(3), 1_000_000);
    expect(r.book.learned.thu_a).toBe(5);
    expect(r.book.mastery).toBeUndefined();
    const hoang = addMastery(book(1), def(0), 1_000_000);
    expect(hoang.book.learned.thu_a).toBe(2); // Hoàng: tầng 3 chỉ bằng quyển
    expect(addMastery(book(2), def(0), 100).book).toEqual(book(2, undefined));
  });

  it("chiêu chưa học, điểm không dương / lạ: trả NGUYÊN sổ; điểm lẻ làm tròn xuống", () => {
    const b = book(1);
    expect(addMastery(b, { id: "khac", grade: 3 }, 50).book).toBe(b);
    for (const p of [0, -5, Number.NaN, Infinity])
      expect(addMastery(b, def(), p).book, String(p)).toBe(b);
    expect(addMastery(b, def(), 7.9).book.mastery).toEqual({ thu_a: 7 });
  });
});

describe("sanitizeSkillBook với tầng và điểm luyện", () => {
  it("tầng kẹp theo tầng tối đa của TỪNG chiêu (Thiên 6, cũ 3); mastery chỉ giữ cho chiêu đã học còn luyện được, kẹp (cần - 1)", () => {
    const thien = withSkill("thu_thien", 3);
    const old = SKILLS_M7[0]!;
    const book = sanitizeSkillBook(
      {
        learned: { [thien.id]: 99, [old.id]: 99, khong_co: 2 },
        slots: ["", "", "", ""],
        mastery: { [thien.id]: 999_999, [old.id]: 50, khong_co: 5 },
      },
      4,
    );
    expect(book.learned[thien.id]).toBe(6);
    expect(book.learned[old.id]).toBe(3);
    // Thiên ở tầng 6 (= tối đa): không luyện được nữa -> bỏ; chiêu cũ ở tầng 3 (= tối đa): bỏ
    expect(book.mastery).toBeUndefined();
    const mid = sanitizeSkillBook(
      {
        learned: { [thien.id]: 2, [old.id]: 1 },
        slots: ["", "", "", ""],
        mastery: { [thien.id]: 999_999, [old.id]: 59.9 },
      },
      4,
    );
    expect(mid.mastery).toEqual({ [thien.id]: 149, [old.id]: 59 }); // kẹp (cần - 1), làm tròn xuống
  });

  it("mastery rác bị bỏ (không object, mảng, số âm / lạ / 0, chiêu chưa học); không có thì không có trường", () => {
    const thien = withSkill("thu_thien", 3);
    const base = { learned: { [thien.id]: 1 }, slots: ["", "", "", ""] };
    for (const bad of [undefined, null, 5, "x", [], [1, 2]]) {
      expect(
        sanitizeSkillBook({ ...base, mastery: bad }, 4).mastery,
        JSON.stringify(bad),
      ).toBeUndefined();
    }
    for (const v of [-3, 0, Number.NaN, Infinity, "5", null, {}]) {
      expect(
        sanitizeSkillBook({ ...base, mastery: { [thien.id]: v } }, 4).mastery,
        String(v),
      ).toBeUndefined();
    }
    expect(sanitizeSkillBook({ ...base, mastery: { [thien.id]: 12 } }, 4).mastery).toEqual({
      [thien.id]: 12,
    });
    expect(
      sanitizeSkillBook({ learned: {}, slots: ["", "", "", ""], mastery: { [thien.id]: 12 } }, 4)
        .mastery,
    ).toBeUndefined();
  });

  it("hồ sơ CŨ (không mastery) đọc được y hệt; `emptySkillBook` không có trường mastery", () => {
    const old = { learned: { [SKILLS_M7[0]!.id]: 2 }, slots: [SKILLS_M7[0]!.id, "", "", ""] };
    const out = sanitizeSkillBook(old, 4);
    expect(out.learned).toEqual(old.learned);
    expect(out).not.toHaveProperty("mastery");
    expect(emptySkillBook()).not.toHaveProperty("mastery");
  });

  it("assignSlot giữ điểm luyện (cả khi gắn và khi gỡ ô)", () => {
    const thien = withSkill("thu_thien", 3);
    const b: SkillBook = {
      learned: { [thien.id]: 1 },
      slots: ["", "", "", ""],
      mastery: { [thien.id]: 33 },
    };
    const put = assignSlot(b, 2, thien.id, 4);
    expect(put.ok && put.book.mastery).toEqual({ [thien.id]: 33 });
    const clear = assignSlot(b, 2, "", 4);
    expect(clear.ok && clear.book.mastery).toEqual({ [thien.id]: 33 });
    expect(put.ok && put.book.mastery).not.toBe(b.mastery); // bản sao
  });
});

describe("SkillsMsg.mastery (kiểm lúc biên dịch bằng `satisfies`)", () => {
  it("trường tuỳ chọn: tin cũ không có và tin có điểm luyện đều hợp kiểu", () => {
    const base: Omit<SkillsMsg, "mastery"> = {
      learned: {},
      slots: ["", "", "", ""],
      cd: [0, 0, 0, 0],
      cdMax: [0, 0, 0, 0],
    };
    const old: SkillsMsg = { ...base };
    const withM: SkillsMsg = { ...base, mastery: { thu_a: 12 } };
    expect(old).not.toHaveProperty("mastery");
    expect(withM.mastery?.thu_a).toBe(12);
  });
});
