// Luyện chiêu ở client (CT5 #1050, `SkillsMsg.mastery` của máy chủ #1112): làm sạch tin, luật nhận (có trường = thay thế, vắng = giữ, đổi tầng = bỏ), và đoạn chữ / thanh
// ở bảng Công pháp. Chưa chiêu thật nào khai phẩm nên ca có phẩm đăng ký chiêu thử như `skill-tier.test.ts`.
import { afterEach, describe, expect, it } from "vitest";
import {
  LEARNABLE_SKILLS,
  MASTERY_NEED,
  SKILLS_M7,
  SKILL_BY_ID,
  type SkillDef,
} from "@tien-gioi/shared";
import { SkillTracker, mockSkillsMsg } from "./skill-bar";
import { masteryView, parseMastery } from "./skill-mastery";
import { buildSkillsPanel } from "./skills-panel";

const A = SKILLS_M7[0]!.id;
const B = SKILLS_M7[1]!.id;
const ME = { realm: 4, tier: 0, mp: 1000, maxMp: 1000 };

const added: string[] = [];
function withSkill(id: string, grade?: number): SkillDef {
  const def = { ...SKILLS_M7[0]!, id, ...(grade === undefined ? {} : { grade }) } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[id] = def;
  (LEARNABLE_SKILLS as SkillDef[]).push(def);
  added.push(id);
  return def;
}
afterEach(() => {
  for (const id of added.splice(0)) {
    delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
    const i = (LEARNABLE_SKILLS as SkillDef[]).findIndex((d) => d.id === id);
    if (i >= 0) (LEARNABLE_SKILLS as SkillDef[]).splice(i, 1);
  }
});

const msg = (learned: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  learned,
  slots: [Object.keys(learned)[0] ?? "", "", "", ""],
  cd: [0, 0, 0, 0],
  cdMax: [0, 0, 0, 0],
  ...extra,
});

describe("parseMastery: làm sạch điểm luyện từ tin", () => {
  it("giữ mục đúng (chiêu thật, đã học, còn luyện được, 0 <= điểm < điểm cần), làm tròn xuống", () => {
    expect(parseMastery({ [A]: 30 }, { [A]: 1 })).toEqual({ [A]: 30 });
    expect(parseMastery({ [A]: 0 }, { [A]: 1 })).toEqual({ [A]: 0 });
    expect(parseMastery({ [A]: 59.9 }, { [A]: 1 })).toEqual({ [A]: 59 });
    expect(parseMastery({ [A]: 149 }, { [A]: 2 })).toBeTruthy();
  });

  it("không phải đối tượng thì null (coi như vắng trường)", () => {
    for (const bad of [undefined, null, 5, "x", true, [], [1, 2]])
      expect(parseMastery(bad, { [A]: 1 })).toBeNull();
  });

  it("bỏ TỪNG mục sai, không bỏ cả tin: id lạ / độc, chưa học, điểm rác, ngoài khoảng", () => {
    const raw = {
      [A]: 10, // đúng
      constructor: 5,
      __proto__: 5,
      khong_co_chieu: 5,
      toString: 5,
      [B]: 7, // chưa học
    };
    expect(parseMastery(raw, { [A]: 1 })).toEqual({ [A]: 10 });
    const badVals = [-1, NaN, Infinity, "12", null, {}, [], 60, 61, 1e9];
    for (const v of badVals) expect(parseMastery({ [A]: v }, { [A]: 1 }), String(v)).toEqual({});
  });

  it("chiêu không còn luyện được (tầng tối đa - 1 hoặc tối đa) không nhận điểm", () => {
    // chiêu cũ tối đa 3 tầng: luyện được tầng 1 -> 2, tầng 2 -> 3 chỉ bằng kinh quyển
    expect(parseMastery({ [A]: 5 }, { [A]: 2 })).toEqual({});
    expect(parseMastery({ [A]: 5 }, { [A]: 3 })).toEqual({});
  });
});

describe("masteryView: thanh / dòng chữ ở bảng Công pháp", () => {
  const def = (name = "Hỏa Vân Kiếm") => ({ name, grade: undefined });

  it("chưa biết (máy chủ chưa gửi trường mastery) hoặc tầng không hợp lệ: không hiện gì", () => {
    expect(masteryView(def(), 1, 10, 3, false)).toBeNull();
    for (const lv of [0, -1, 1.5, NaN]) expect(masteryView(def(), lv, 10, 3, true)).toBeNull();
  });

  it("còn luyện được: THANH với điểm / điểm cần, phần trăm làm tròn xuống, chữ + nhãn đọc màn hình đủ số", () => {
    const v = masteryView(def(), 1, 24, 3, true)!;
    expect(v.kind).toBe("bar");
    if (v.kind !== "bar") return;
    expect(v).toMatchObject({ points: 24, need: MASTERY_NEED[0], percent: 40 });
    expect(v.text).toContain("tầng 2");
    expect(v.text).toContain("24 / 60");
    expect(v.text).toContain("cập nhật khi dùng chiêu");
    expect(v.aria).toBe("Luyện chiêu Hỏa Vân Kiếm lên tầng 2: 24 trên 60 điểm");
    expect(masteryView(def(), 1, 1, 3, true)).toMatchObject({ percent: 1 });
    expect(masteryView(def(), 1, 0, 3, true)).toMatchObject({ percent: 0 });
  });

  it("điểm rác bị kẹp trong [0, cần - 1] (không bao giờ đầy thanh trước khi máy chủ báo lên tầng)", () => {
    for (const p of [-5, NaN, Infinity])
      expect(masteryView(def(), 1, p, 3, true)).toMatchObject({ points: 0 });
    expect(masteryView(def(), 1, 9999, 3, true)).toMatchObject({ points: 59, percent: 98 });
  });

  it("tầng kế chỉ bằng kinh quyển (tầng tối đa - 1): một dòng chữ, KHÔNG thanh; tối đa: 'Đã đạt tầng tối đa'", () => {
    expect(masteryView(def(), 2, 0, 3, true)).toEqual({
      kind: "note",
      text: "Tầng 3 chỉ nâng bằng kinh quyển trùng.",
    });
    expect(masteryView(def(), 3, 0, 3, true)).toEqual({
      kind: "note",
      text: "Đã đạt tầng tối đa.",
    });
  });

  it("chiêu Thiên phẩm (tối đa 6): thanh ở tầng 1-4 với điểm cần 60 / 150 / 300 / 600, tầng 5 chỉ kinh quyển, tầng 6 tối đa", () => {
    const d = { name: "Thiên", grade: 3 as const };
    [1, 2, 3, 4].forEach((lv, i) => {
      const v = masteryView(d, lv, 0, 6, true)!;
      expect(v.kind, `tầng ${lv}`).toBe("bar");
      if (v.kind === "bar") expect(v.need).toBe(MASTERY_NEED[i]);
    });
    expect(masteryView(d, 5, 0, 6, true)).toMatchObject({ kind: "note" });
    expect((masteryView(d, 5, 0, 6, true) as { text: string }).text).toContain("Tầng 6");
    expect(masteryView(d, 6, 0, 6, true)).toEqual({ kind: "note", text: "Đã đạt tầng tối đa." });
  });
});

describe("SkillTracker: luật nhận điểm luyện", () => {
  it("chưa nhận trường mastery: chưa 'biết', mọi chiêu 0 điểm", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1 }), 0);
    expect(t.masteryKnown).toBe(false);
    expect(t.masteryOf(A)).toBe(0);
    expect(t.masteryOf("khong_co")).toBe(0);
    expect(t.masteryOf("constructor")).toBe(0);
  });

  it("CÓ trường = thay thế toàn bộ (kể cả rỗng); VẮNG trường = giữ nguyên", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1, [B]: 1 }, { mastery: { [A]: 30, [B]: 12 } }), 0);
    expect(t.masteryKnown).toBe(true);
    expect([t.masteryOf(A), t.masteryOf(B)]).toEqual([30, 12]);
    t.set(msg({ [A]: 1, [B]: 1 }), 1000); // máy chủ giãn nhịp: vắng trường
    expect([t.masteryOf(A), t.masteryOf(B)]).toEqual([30, 12]);
    t.set(msg({ [A]: 1, [B]: 1 }, { mastery: { [A]: 31 } }), 2000); // có trường: B không còn mục = 0
    expect([t.masteryOf(A), t.masteryOf(B)]).toEqual([31, 0]);
    t.set(msg({ [A]: 1, [B]: 1 }, { mastery: {} }), 3000);
    expect([t.masteryOf(A), t.masteryOf(B)]).toEqual([0, 0]);
    expect(t.masteryKnown).toBe(true);
  });

  it("chiêu ĐỔI TẦNG giữa hai tin mà tin sau vắng trường: điểm cũ bỏ ngay (không hiện 59 / điểm cần của tầng mới)", () => {
    const d = withSkill("thu_doi_tang", 3); // Thiên phẩm: luyện được cả tầng 2 (chiêu cũ chỉ luyện tầng 1)
    const t = new SkillTracker();
    t.set(msg({ [d.id]: 1, [B]: 1 }, { mastery: { [d.id]: 59, [B]: 20 } }), 0);
    expect(t.masteryOf(d.id)).toBe(59);
    t.set(msg({ [d.id]: 2, [B]: 1 }), 1000); // lên tầng 2, tin giãn nhịp (vắng trường)
    expect(t.masteryOf(d.id)).toBe(0);
    expect(t.masteryOf(B)).toBe(20); // chiêu khác không bị ảnh hưởng
    t.set(msg({ [d.id]: 2, [B]: 1 }, { mastery: { [d.id]: 4, [B]: 20 } }), 2000); // tin kế mang điểm mới
    expect(t.masteryOf(d.id)).toBe(4);
  });

  it("tầng KHÔNG đổi mà tin vắng trường thì điểm giữ nguyên (đối chứng của ca trên)", () => {
    const d = withSkill("thu_giu_diem", 3);
    const t = new SkillTracker();
    t.set(msg({ [d.id]: 2 }, { mastery: { [d.id]: 100 } }), 0);
    t.set(msg({ [d.id]: 2 }), 1000);
    expect(t.masteryOf(d.id)).toBe(100);
  });

  it("mục điểm của chiêu ở tầng KHÔNG còn luyện được hoặc điểm vượt tầng bị bỏ khi tin đến", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 2 }, { mastery: { [A]: 10 } }), 0); // tầng 2 của chiêu cũ: chỉ bằng kinh quyển
    expect(t.masteryOf(A)).toBe(0);
    t.set(msg({ [A]: 1 }, { mastery: { [A]: 60 } }), 1000); // 60 / 60: không hợp lệ
    expect(t.masteryOf(A)).toBe(0);
  });

  it("chiêu mất khỏi sổ thì điểm bỏ, học lại không 'sống lại' điểm cũ", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1, [B]: 1 }, { mastery: { [A]: 30 } }), 0);
    t.set(msg({ [B]: 1 }), 1000);
    expect(t.masteryOf(A)).toBe(0);
    t.set(msg({ [A]: 1, [B]: 1 }), 2000);
    expect(t.masteryOf(A)).toBe(0);
  });

  it("trường mastery rác (chuỗi, số, mảng) coi như vắng: giữ điểm đã nhớ, không ném lỗi", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1 }, { mastery: { [A]: 25 } }), 0);
    for (const bad of ["x", 5, [], null, true]) {
      t.set(msg({ [A]: 1 }, { mastery: bad }), 1000);
      expect(t.masteryOf(A), JSON.stringify(bad)).toBe(25);
    }
  });

  it("clear (đổi bản đồ / nối lại): quên hết, chưa 'biết' nữa", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1 }, { mastery: { [A]: 25 } }), 0);
    t.clear();
    expect(t.masteryKnown).toBe(false);
    expect(t.masteryOf(A)).toBe(0);
  });
});

describe("bảng Công pháp và máy chủ giả", () => {
  it("hàng có `mastery` null khi chưa nhận trường, THANH khi đã nhận, dòng chữ ở tầng cuối / tối đa", () => {
    const t = new SkillTracker();
    t.set(msg({ [A]: 1, [B]: 2 }), 0);
    let rows = buildSkillsPanel(t, ME).rows;
    expect(rows.every((r) => r.mastery === null)).toBe(true);
    t.set(msg({ [A]: 1, [B]: 2 }, { mastery: { [A]: 24 } }), 1000);
    rows = buildSkillsPanel(t, ME).rows;
    const ra = rows.find((r) => r.id === A)!;
    const rb = rows.find((r) => r.id === B)!;
    expect(ra.mastery).toMatchObject({ kind: "bar", points: 24, need: 60, percent: 40 });
    expect(rb.mastery).toMatchObject({ kind: "note" });
  });

  it("chiêu Thiên phẩm ở tầng 4: thanh với điểm cần 600", () => {
    const d = withSkill("thu_luyen_thien", 3);
    const t = new SkillTracker();
    t.set(msg({ [d.id]: 4 }, { mastery: { [d.id]: 150 } }), 0);
    const row = buildSkillsPanel(t, ME).rows.find((r) => r.id === d.id)!;
    expect(row.mastery).toMatchObject({ kind: "bar", points: 150, need: 600, percent: 25 });
  });

  it("máy chủ giả: có điểm luyện 40% cho chiêu còn luyện được, không có cho tầng cuối / tối đa", () => {
    const ids = SKILLS_M7.slice(0, 3).map((d) => d.id); // tầng 1, 2, 3 (chiêu cũ tối đa 3)
    const m = mockSkillsMsg(ids, 2);
    expect(m.mastery).toEqual({ [ids[0]!]: 24 });
  });
});
