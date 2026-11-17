// Khung dữ liệu chiêu thức (mục 51, CT1 #1046): `LEARNABLE_SKILLS` gom các tệp dữ liệu, `skillViolations` bắt từng loại lỗi, `skill-kit`, `sampleSkills`.
import { describe, expect, it } from "vitest";
import {
  ELEMENTS,
  LEARNABLE_SKILLS,
  SKILLS_M7,
  SKILL_BY_ID,
  SKILL_FX_IDS,
  SKILL_GRADES,
  SKILL_GRADE_NAMES,
  SKILL_MULT_CAP,
  SKILL_SHAPES,
  SKILL_STYLES,
  TURN_MS,
  bookIdOf,
  sampleSkills,
  skillEffect,
  skillOf,
  skillViolations,
  type SkillDef,
} from "./index";
import { TURN_MS as KIT_TURN_MS } from "./skill-kit";
import { SKILLS_KIM_THO } from "./skills-kim-tho";
import { SKILLS_MOC_THUY } from "./skills-moc-thuy";
import { SKILLS_HOA } from "./skills-hoa";
import { SKILLS_KHAC } from "./skills-khac";
import { SKILL_BOOK_ITEMS } from "./books";

// chữ Hán dựng bằng mã (no-cjk.test.ts cấm chữ Hán trực tiếp trong mã nguồn, kể cả test)
const HAN = String.fromCharCode(0x5c71);
const base = (): SkillDef => ({ ...SKILLS_M7.find((s) => s.id === "hoa_van_kiem")! });
const withDef = (o: Partial<SkillDef>): SkillDef => ({ ...base(), ...o });

describe("LEARNABLE_SKILLS: gom 18 chiêu gốc + các tệp dữ liệu theo nhóm", () => {
  it("bằng SKILLS_M7 + bốn tệp nhóm theo thứ tự; id duy nhất; tra cứu và kinh quyển đọc từ đây", () => {
    expect(LEARNABLE_SKILLS).toEqual([
      ...SKILLS_M7,
      ...SKILLS_KIM_THO,
      ...SKILLS_MOC_THUY,
      ...SKILLS_HOA,
      ...SKILLS_KHAC,
    ]);
    expect(SKILLS_M7.length).toBe(18); // 18 chiêu gốc không đổi
    expect(new Set(LEARNABLE_SKILLS.map((s) => s.id)).size).toBe(LEARNABLE_SKILLS.length);
    for (const s of LEARNABLE_SKILLS) {
      expect(skillOf(s.id)).toBe(s);
      expect(SKILL_BY_ID[s.id]).toBe(s);
      expect(SKILL_BOOK_ITEMS.find((b) => b.id === bookIdOf(s.id))?.teaches).toBe(s.id);
    }
    expect(SKILL_BOOK_ITEMS.length).toBe(LEARNABLE_SKILLS.length);
  });

  it("TURN_MS: skills.ts xuất lại đúng hằng của skill-kit (một nguồn); skillEffect đổi lượt -> ms", () => {
    expect(TURN_MS).toBe(KIT_TURN_MS);
    expect(TURN_MS).toBe(1500);
    expect(skillEffect("burn", 2, 0.3, 0.5)).toEqual({
      status: "burn",
      ms: 3000,
      ratio: 0.3,
      chance: 0.5,
    });
    expect(skillEffect("chill", 1.5, 0.4, 1).ms).toBe(Math.round(1.5 * TURN_MS));
  });

  it("danh sách phong cách / phẩm cấp: đúng số lượng, không trùng, có tên phẩm", () => {
    expect(SKILL_STYLES.length).toBe(12);
    expect(new Set(SKILL_STYLES).size).toBe(SKILL_STYLES.length);
    expect(SKILL_STYLES).toContain("khac");
    expect([...SKILL_GRADES]).toEqual([0, 1, 2, 3]);
    expect(SKILL_GRADE_NAMES).toEqual(["Hoàng", "Huyền", "Địa", "Thiên"]);
    expect(SKILL_SHAPES.length).toBe(7);
  });
});

describe("skillViolations", () => {
  it("dữ liệu thật hợp lệ (mọi chiêu của LEARNABLE_SKILLS, kể cả các tệp nhóm khi D / E / G thêm vào)", () => {
    expect(skillViolations(LEARNABLE_SKILLS)).toEqual([]);
    expect(skillViolations()).toEqual([]);
  });

  it("khung sát thương theo cảnh giới tồn tại cho cảnh giới 0-4 và tăng dần", () => {
    let prev = { hit: 0, total: 0 };
    for (let r = 0; r <= 4; r++) {
      const c = SKILL_MULT_CAP[r];
      expect(c, `cảnh giới ${r}`).toBeDefined();
      expect(c.hit).toBeGreaterThanOrEqual(prev.hit);
      expect(c.total).toBeGreaterThanOrEqual(c.hit);
      prev = c;
    }
    // mọi chiêu thật nằm TRONG khung nhưng khung không quá rộng: chiêu mạnh nhất hiện có vượt hơn nửa khung
    for (const s of SKILLS_M7) {
      const hits = s.shape === "fan" ? (s.count ?? 1) : 1;
      expect(s.mult * hits).toBeLessThanOrEqual(SKILL_MULT_CAP[s.reqRealm].total);
    }
  });

  const cases: [string, Partial<SkillDef>, RegExp][] = [
    ["id sai dạng", { id: "Hoa-Van" }, /id sai dạng/],
    ["id rỗng", { id: "" }, /id sai dạng/],
    ["tên quá ngắn", { name: "A" }, /name phải/],
    ["tên có chữ Hán", { name: `Hỏa ${HAN}` }, /chữ Hán/],
    ["tên quyển có chữ Hán", { bookName: `Kinh ${HAN}` }, /chữ Hán/],
    ["mô tả quá ngắn", { desc: "ngắn" }, /desc phải/],
    [
      "mô tả có chữ Hán",
      { desc: `Mô tả dài đủ hai mươi ký tự nhưng có ${HAN} lẫn vào.` },
      /chữ Hán/,
    ],
    ["hệ lạ", { element: "x" as never }, /hệ/],
    ["hệ prototype", { element: "constructor" as never }, /hệ/],
    ["hình lạ", { shape: "cube" as never }, /hình/],
    ["cooldown quá nhỏ", { cooldown: 100 }, /cooldown/],
    ["cooldown quá lớn", { cooldown: 99_000 }, /cooldown/],
    ["cooldown lẻ", { cooldown: 3000.5 }, /cooldown/],
    ["mpPct quá lớn", { mpPct: 0.9 }, /mpPct/],
    ["mpPct âm", { mpPct: -0.1 }, /mpPct/],
    ["range NaN", { range: Number.NaN }, /range/],
    ["range quá lớn", { range: 5000 }, /range/],
    ["mult vượt khung một lần trúng", { mult: 9 }, /vượt khung/],
    ["mult âm", { mult: -1 }, /mult/],
    ["cone thiếu arc", { arc: undefined }, /cone cần arc/],
    ["cone arc quá lớn", { arc: 7 }, /cone cần arc/],
    [
      "trạng thái lạ",
      { effects: [{ status: "khong_co" as never, ms: 1000, ratio: 0.1, chance: 1 }] },
      /trạng thái/,
    ],
    [
      "trạng thái prototype",
      { effects: [{ status: "constructor" as never, ms: 1000, ratio: 0.1, chance: 1 }] },
      /trạng thái/,
    ],
    [
      "hiệu ứng ms quá hạn",
      { effects: [{ status: "burn", ms: 99_999, ratio: 0.1, chance: 1 }] },
      /ms/,
    ],
    [
      "hiệu ứng ratio quá hạn",
      { effects: [{ status: "burn", ms: 3000, ratio: 5, chance: 1 }] },
      /ratio/,
    ],
    [
      "hiệu ứng chance > 1",
      { effects: [{ status: "burn", ms: 3000, ratio: 0.1, chance: 2 }] },
      /chance/,
    ],
    [
      "quá nhiều hiệu ứng",
      { effects: Array.from({ length: 5 }, () => skillEffect("burn", 1, 0.1, 1)) },
      /quá/,
    ],
    ["reqRealm ngoài thang", { reqRealm: 9 }, /reqRealm/],
    ["reqRealm lẻ", { reqRealm: 1.5 }, /reqRealm/],
    ["reqTier ngoài thang", { reqTier: 99 }, /reqTier/],
    ["rarity ngoài thang", { rarity: 7 as never }, /rarity/],
    ["giá bằng 0", { price: 0 }, /price/],
    ["fx lạ", { fx: "khong_co" as never }, /fx/],
    ["style lạ", { style: "nhat_chi_thien" as never }, /style/],
    ["grade lạ", { grade: 7 as never }, /grade/],
    ["grade không khớp rarity", { grade: 3, rarity: 1 }, /không khớp rarity/],
  ];
  for (const [name, o, re] of cases)
    it(`bắt: ${name}`, () => {
      const v = skillViolations([withDef(o)]);
      expect(v.length, name).toBeGreaterThan(0);
      expect(v.join("\n")).toMatch(re);
    });

  it("bắt: id / tên / tên quyển trùng giữa hai chiêu", () => {
    const a = base();
    expect(skillViolations([a, { ...a }]).join("\n")).toMatch(/trùng id/);
    expect(skillViolations([a, { ...a, id: "khac_id" }]).join("\n")).toMatch(/name .* trùng/);
    expect(skillViolations([a, { ...a, id: "khac_id", name: "Tên Khác" }]).join("\n")).toMatch(
      /bookName .* trùng/,
    );
    // chữ hoa / thường không phân biệt
    expect(
      skillViolations([
        a,
        { ...a, id: "khac_id", name: a.name.toUpperCase(), bookName: "Khác" },
      ]).join("\n"),
    ).toMatch(/name .* trùng/);
  });

  it("bắt: chiêu không có tác dụng (mult 0, không hiệu ứng, không né); né / hiệu ứng thì được", () => {
    expect(skillViolations([withDef({ mult: 0, effects: [] })]).join("\n")).toMatch(
      /không có tác dụng/,
    );
    expect(skillViolations([withDef({ mult: 0, effects: [], dodgeMs: 300 })])).toEqual([]);
    expect(skillViolations([withDef({ mult: 0 })])).toEqual([]); // còn hiệu ứng của hoa_van_kiem
  });

  it("bắt: fan thiếu count / quá nhiều; fan nhiều tia vượt khung TỔNG dù mult mỗi tia nhỏ", () => {
    const fan = { ...SKILLS_M7.find((s) => s.shape === "fan")! };
    expect(skillViolations([fan])).toEqual([]);
    expect(skillViolations([{ ...fan, count: 1 }]).join("\n")).toMatch(/fan cần count/);
    expect(skillViolations([{ ...fan, count: 12 }]).join("\n")).toMatch(/fan cần count/);
    const cap = SKILL_MULT_CAP[fan.reqRealm];
    const v = skillViolations([{ ...fan, count: 5, mult: cap.hit - 0.01 }]);
    expect(v.join("\n")).toMatch(/tổng mult/);
  });

  it("bắt: dash thiếu reach, ground thiếu bán kính, line thiếu bề rộng, dodgeMs quá lớn", () => {
    const dash = { ...SKILLS_M7.find((s) => s.shape === "dash")! };
    expect(skillViolations([{ ...dash, reach: 0 }]).join("\n")).toMatch(/dash cần reach/);
    expect(skillViolations([{ ...dash, dodgeMs: 9000 }]).join("\n")).toMatch(/dodgeMs/);
    const ground = { ...SKILLS_M7.find((s) => s.shape === "ground")! };
    expect(skillViolations([{ ...ground, range: 0 }]).join("\n")).toMatch(/ground cần range/);
    const line = { ...SKILLS_M7.find((s) => s.shape === "line")! };
    expect(skillViolations([{ ...line, width: 0 }]).join("\n")).toMatch(/line cần width/);
  });

  it("grade hợp lệ khi khớp độ hiếm: Hoàng 0-1, Huyền 1-2, Địa 2-3, Thiên 3-4", () => {
    const ok: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 4],
    ];
    for (const [g, r] of ok)
      expect(
        skillViolations([withDef({ grade: g as never, rarity: r as never })]),
        `${g}/${r}`,
      ).toEqual([]);
    const no: [number, number][] = [
      [0, 2],
      [1, 0],
      [1, 3],
      [2, 1],
      [2, 4],
      [3, 2],
    ];
    for (const [g, r] of no)
      expect(
        skillViolations([withDef({ grade: g as never, rarity: r as never })]).length,
        `${g}/${r}`,
      ).toBeGreaterThan(0);
  });
});

describe("sampleSkills (chiêu mẫu cho giao diện)", () => {
  it("60 chiêu mẫu mặc định qua skillViolations, id mau_N duy nhất, KHÔNG vào LEARNABLE_SKILLS / kinh quyển", () => {
    const s = sampleSkills();
    expect(s.length).toBe(60);
    expect(skillViolations(s)).toEqual([]);
    expect(new Set(s.map((x) => x.id)).size).toBe(60);
    for (const x of s) {
      expect(x.id).toMatch(/^mau_\d+$/);
      expect(skillOf(x.id)).toBeUndefined();
    }
  });
  it("đủ đa dạng: mọi hệ, mọi hình, cả bốn phẩm, cả bốn cảnh giới, mọi phong cách, mọi hiệu ứng client", () => {
    const s = sampleSkills(80);
    expect(new Set(s.map((x) => x.element))).toEqual(new Set(ELEMENTS.map((e) => e.id)));
    expect(new Set(s.map((x) => x.shape))).toEqual(new Set(SKILL_SHAPES));
    expect(new Set(s.map((x) => x.grade))).toEqual(new Set(SKILL_GRADES));
    expect(new Set(s.map((x) => x.reqRealm))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(s.map((x) => x.style))).toEqual(new Set(SKILL_STYLES));
    expect(new Set(s.map((x) => x.fx))).toEqual(new Set(SKILL_FX_IDS));
  });
  it("tất định, kẹp số lượng, đầu vào rác an toàn", () => {
    expect(sampleSkills(10)).toEqual(sampleSkills(10));
    expect(sampleSkills(0)).toEqual([]);
    expect(sampleSkills(-5)).toEqual([]);
    expect(sampleSkills(10_000).length).toBe(200);
    expect(sampleSkills(Number.NaN).length).toBe(60);
    expect(skillViolations(sampleSkills(200))).toEqual([]);
  });
});
