// Tầng tối đa THEO PHẨM của chiêu (CT1b-3 #1103, mục 51): Hoàng 3 / Huyền 4 / Địa 5 / Thiên 6. Client không còn giả định "mọi chiêu tối đa 3 tầng":
// số chấm trên ô, trên bảng Công pháp và câu "tầng N trên M" đều theo `skillMaxLevelOf` của CHÍNH chiêu đó. Chưa chiêu thật nào khai phẩm (D / E / G thêm sau),
// nên ca có phẩm đăng ký chiêu thử vào bảng tra như `shared/src/skills-ct1b3.test.ts`.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  LEARNABLE_SKILLS,
  SKILLS_M7,
  SKILL_BY_ID,
  SKILL_MAX_LEVEL,
  SKILL_TIER_MAX,
  skillMaxLevelOf,
  type SkillDef,
} from "@tien-gioi/shared";
import { SkillTracker, levelPips, mockSkillsMsg, pipCap, slotView, type SlotMe } from "./skill-bar";
import { pipsText } from "./skill-bar-dom";
import { buildSkillsPanel, rowAria } from "./skills-panel";

const ME: SlotMe = { realm: 4, tier: 0, mp: 1000, maxMp: 1000 };

const added: string[] = [];
/** Thêm tạm một chiêu thử (phẩm `grade`, hoặc không khai) vào bảng tra và danh sách học được; gỡ sau mỗi test. */
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

function trackerWith(learned: Record<string, number>, slot0: string): SkillTracker {
  const t = new SkillTracker();
  t.set(
    {
      learned,
      slots: [slot0, "", "", ""],
      cd: [0, 0, 0, 0],
      cdMax: [3000, 0, 0, 0],
    },
    0,
  );
  return t;
}

describe("levelPips / pipCap / pipsText theo tầng tối đa của chiêu", () => {
  it("bỏ trống `max` thì 3 như cũ (chiêu không khai phẩm)", () => {
    expect(levelPips(2)).toBe(2);
    expect(levelPips(99)).toBe(SKILL_MAX_LEVEL);
    expect(pipsText(1)).toBe("●○○");
    expect(pipsText(3)).toBe("●●●");
  });

  it("có `max`: tầng kẹp theo max và số chấm rỗng = max - tầng (Thiên: 6 chấm)", () => {
    expect(levelPips(5, 6)).toBe(5);
    expect(levelPips(9, 6)).toBe(6);
    expect(levelPips(0, 6)).toBe(0);
    expect(levelPips(3, 4)).toBe(3);
    expect(levelPips(9, 4)).toBe(4);
    expect(pipsText(1, 6)).toBe("●○○○○○");
    expect(pipsText(5, 6)).toBe("●●●●●○");
    expect(pipsText(4, 4)).toBe("●●●●");
    expect(pipsText(2, 5)).toBe("●●○○○");
    expect(pipsText(0, 6)).toBe("");
  });

  it("`max` lạ (0, âm, số lẻ, NaN, quá SKILL_TIER_MAX) rơi về 3, không ném lỗi, không in chuỗi dài", () => {
    for (const bad of [0, -1, 2.5, Number.NaN, Infinity, SKILL_TIER_MAX + 1, 99]) {
      expect(pipCap(bad)).toBe(SKILL_MAX_LEVEL);
      expect(levelPips(9, bad)).toBe(SKILL_MAX_LEVEL);
      expect(pipsText(1, bad)).toBe("●○○");
    }
    for (let m = 1; m <= SKILL_TIER_MAX; m++) expect(pipCap(m)).toBe(m);
  });

  it("mọi tầng tối đa theo phẩm cho đúng số chấm: tổng chấm (đặc + rỗng) luôn bằng tầng tối đa", () => {
    for (const grade of [0, 1, 2, 3]) {
      const max = skillMaxLevelOf({ grade });
      for (let lv = 1; lv <= max; lv++) {
        const s = pipsText(lv, max);
        expect([...s].length).toBe(max);
        expect([...s].filter((c) => c === "●").length).toBe(lv);
      }
    }
  });
});

describe("slotView.maxLevel", () => {
  it("chiêu Thiên phẩm: maxLevel 6, tầng học tới 6 không bị kẹp về 3", () => {
    const d = withSkill("thu_thien", 3);
    const t = trackerWith({ [d.id]: 5 }, d.id);
    const v = slotView(2, t, ME, false, 0);
    expect(v.level).toBe(5);
    expect(v.maxLevel).toBe(6);
    expect(pipsText(v.level, v.maxLevel)).toBe("●●●●●○");
  });

  it("chiêu Huyền / Địa / Hoàng và chiêu KHÔNG khai phẩm: 4 / 5 / 3 / 3", () => {
    const want: Array<[number | undefined, number]> = [
      [1, 4],
      [2, 5],
      [0, 3],
      [undefined, 3],
    ];
    want.forEach(([grade, max], i) => {
      const d = withSkill(`thu_${i}`, grade);
      const v = slotView(2, trackerWith({ [d.id]: 1 }, d.id), ME, false, 0);
      expect(v.maxLevel).toBe(max);
    });
  });

  it("ô trống / ô khoá không có chiêu: maxLevel 0", () => {
    const t = trackerWith({}, "");
    expect(slotView(2, t, ME, false, 0).maxLevel).toBe(0);
    expect(slotView(5, t, { ...ME, realm: 1 }, false, 0).maxLevel).toBe(0); // ô 5 khoá ở Luyện Khí
  });
});

describe("bảng Công pháp theo tầng tối đa của từng chiêu", () => {
  it("hàng của chiêu Thiên phẩm: maxLevel 6, đủ 6 chấm, aria 'tầng N trên 6'", () => {
    const d = withSkill("thu_thien_bang", 3);
    const m = buildSkillsPanel(trackerWith({ [d.id]: 4 }, d.id), ME);
    const row = m.rows.find((r) => r.id === d.id)!;
    expect(row.level).toBe(4);
    expect(row.maxLevel).toBe(6);
    expect(row.pips).toBe("●●●●○○");
    expect(row.aria).toContain("tầng 4 trên 6");
  });

  it("hai chiêu khác phẩm trong CÙNG bảng: mỗi hàng theo tầng tối đa riêng", () => {
    const a = withSkill("thu_a", 3);
    const b = withSkill("thu_b", 0);
    const m = buildSkillsPanel(trackerWith({ [a.id]: 2, [b.id]: 2 }, a.id), ME);
    const ra = m.rows.find((r) => r.id === a.id)!;
    const rb = m.rows.find((r) => r.id === b.id)!;
    expect([ra.maxLevel, rb.maxLevel]).toEqual([6, 3]);
    expect([ra.pips, rb.pips]).toEqual(["●●○○○○", "●●○"]);
    expect(rb.aria).toContain("tầng 2 trên 3");
  });

  it("chiêu thật chưa khai phẩm: vẫn 3 chấm, 'trên 3' (không đổi so với trước)", () => {
    const id = SKILLS_M7[0]!.id;
    const m = buildSkillsPanel(trackerWith({ [id]: 1 }, id), ME);
    expect(m.rows[0]).toMatchObject({ maxLevel: 3, pips: "●○○" });
    expect(m.rows[0].aria).toContain("tầng 1 trên 3");
  });

  it("rowAria: bỏ `maxLevel` thì 3; có thì dùng đúng số", () => {
    expect(rowAria("A", "Hỏa", 2, null, null)).toContain("tầng 2 trên 3");
    expect(rowAria("A", "Hỏa", 2, null, null, "Thiên", 6)).toContain("tầng 2 trên 6");
  });
});

describe("mockSkillsMsg quay vòng tầng theo tầng tối đa của chính chiêu", () => {
  it("chiêu Thiên phẩm ở vị trí 4: tầng 1 + (3 % 6) = 4, không bị quay về 1 như khi giả định tối đa 3", () => {
    const filler = SKILLS_M7.slice(0, 3).map((d) => d.id);
    const d = withSkill("thu_mock", 3);
    const msg = mockSkillsMsg([...filler, d.id], 4);
    expect(msg.learned[d.id]).toBe(4);
    // ba chiêu cũ vẫn quay 1..3
    expect(filler.map((id) => msg.learned[id])).toEqual([1, 2, 3]);
  });
});

describe("không còn hằng 3 cứng ở chỗ hiện tầng", () => {
  const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  it("ui.ts đọc `row.maxLevel` cho câu 'Tầng N trên M' và không dùng SKILL_MAX_LEVEL", () => {
    const ui = src("./ui.ts");
    expect(ui).toContain("trên ${row.maxLevel}");
    expect(ui).not.toContain("SKILL_MAX_LEVEL");
  });
  it("ô chiêu và bảng truyền tầng tối đa của chiêu vào pipsText", () => {
    expect(src("./skill-bar-dom.ts")).toContain("pipsText(v.level, v.maxLevel)");
    expect(src("./skills-panel.ts")).toContain("pipsText(level, maxLevel)");
  });
});
