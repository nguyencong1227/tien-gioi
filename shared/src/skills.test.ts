import { describe, expect, it } from "vitest";
import {
  ELEMENTS,
  ELEMENT_ADVANTAGE_MULT,
  ELEMENT_DISADVANTAGE_MULT,
  ENGRAVE_COSTS,
  ENGRAVE_MAX,
  LEARNABLE_SLOTS,
  MAX_STATUSES,
  PHASE_BEATS,
  SKILLS_M7,
  SKILL_BY_ID,
  SKILL_MAX_LEVEL,
  SLOT_UNLOCK_REALM,
  STATUSES,
  STUN_IMMUNE_MS,
  STUN_MAX_MS,
  TURN_MS,
  assignSlot,
  elementMult,
  elementOf,
  emptySkillBook,
  isSkillSlot,
  learnSkill,
  parseCast,
  parseSkillSlot,
  phaseOf,
  sanitizeEngraved,
  sanitizeSkillBook,
  skillCooldownMult,
  skillDamageMult,
  skillOf,
  slotOpen,
  statusOf,
  type Phase,
  type SkillBook,
} from "./skills";
import { ELITE_CHANCE, ELITE_MULT, MAX_BOLTS, MAX_ELITES } from "./game";
import { newSoul, sanitizeSoul } from "./reincarnation";

const POISON_IDS = [
  "",
  "khong_co",
  "constructor",
  "__proto__",
  "toString",
  "hasOwnProperty",
  "prototype",
];
/** Chữ Hán (CJK): viết bằng mã điểm để chính tệp này không chứa ký tự CJK (kiểm `no-cjk.test.ts` quét cả test). */
const hasCjk = (t: string): boolean =>
  [...t].some((c) => {
    const n = c.codePointAt(0)!;
    return (n >= 0x2e80 && n <= 0x9fff) || (n >= 0xf900 && n <= 0xfaff);
  });

describe("hệ (ngũ hành)", () => {
  it("mỗi hệ có pha; mọi pha (trừ none) là một trong năm; id duy nhất", () => {
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length);
    const phases = new Set<Phase>(["kim", "moc", "thuy", "hoa", "tho", "none"]);
    for (const e of ELEMENTS) expect(phases.has(e.phase), e.id).toBe(true);
    expect(phaseOf("bang")).toBe("thuy");
    expect(phaseOf("phong")).toBe("moc");
    expect(phaseOf("loi")).toBe("hoa");
    expect(phaseOf("am")).toBe("thuy");
    expect(phaseOf("none")).toBe("none");
  });

  it("tra hệ bằng id độc / lạ -> undefined, phaseOf -> none", () => {
    for (const bad of [...POISON_IDS, 5, null, undefined, {}]) {
      expect(elementOf(bad as unknown), String(bad)).toBeUndefined();
      expect(phaseOf(bad as unknown)).toBe("none");
    }
  });

  it("vòng khắc: kim > mộc > thổ > thủy > hỏa > kim (năm cạnh), không có cạnh nào khác", () => {
    expect(PHASE_BEATS).toEqual({ kim: "moc", moc: "tho", tho: "thuy", thuy: "hoa", hoa: "kim" });
  });

  it("elementMult: bảng đủ 5x5, đối xứng (khắc x1,3 <=> bị khắc x0,8), cùng pha / không kề x1, none luôn x1", () => {
    const five = ["kim", "moc", "tho", "thuy", "hoa"] as const;
    for (const a of five) {
      for (const d of five) {
        const m = elementMult(a, d);
        if (PHASE_BEATS[a] === d) expect(m, `${a}>${d}`).toBe(ELEMENT_ADVANTAGE_MULT);
        else if (PHASE_BEATS[d] === a) expect(m, `${a}<${d}`).toBe(ELEMENT_DISADVANTAGE_MULT);
        else expect(m, `${a}~${d}`).toBe(1);
        if (m === ELEMENT_ADVANTAGE_MULT) expect(elementMult(d, a)).toBe(ELEMENT_DISADVANTAGE_MULT);
      }
      expect(elementMult(a, "none")).toBe(1);
      expect(elementMult("none", a)).toBe(1);
    }
    expect(elementMult("none", "none")).toBe(1);
  });

  it("hệ con theo pha của nó: băng (thủy) khắc hỏa, phong (mộc) khắc thổ, lôi (hỏa) khắc kim", () => {
    expect(elementMult("bang", "hoa")).toBe(1.3);
    expect(elementMult("phong", "tho")).toBe(1.3);
    expect(elementMult("loi", "kim")).toBe(1.3);
    expect(elementMult("hoa", "bang")).toBe(0.8);
  });

  it("id lạ / độc / không phải chuỗi cho x1 (không ném lỗi, không khắc)", () => {
    for (const bad of [...POISON_IDS, 3, null, undefined, [], {}])
      for (const other of ["kim", "hoa", bad]) {
        expect(elementMult(bad as unknown, other as unknown)).toBe(1);
        expect(elementMult(other as unknown, bad as unknown)).toBe(1);
      }
  });
});

describe("trạng thái", () => {
  it("id duy nhất, tra bằng statusOf an toàn, trần hợp lý", () => {
    expect(new Set(STATUSES.map((s) => s.id)).size).toBe(STATUSES.length);
    for (const s of STATUSES) {
      expect(statusOf(s.id)).toBe(s);
      expect(s.maxMs).toBeGreaterThan(0);
      expect(s.maxRatio).toBeGreaterThanOrEqual(0);
      expect(s.maxRatio).toBeLessThanOrEqual(0.6);
    }
    for (const bad of POISON_IDS) expect(statusOf(bad)).toBeUndefined();
  });

  it("choáng ngắn và không liền nhau; tối đa 4 trạng thái; một lượt nguồn = 1,5 giây", () => {
    expect(statusOf("stun")!.maxMs).toBe(STUN_MAX_MS);
    expect(STUN_MAX_MS).toBeLessThanOrEqual(1200);
    expect(STUN_IMMUNE_MS).toBeGreaterThanOrEqual(2 * STUN_MAX_MS);
    expect(MAX_STATUSES).toBe(4);
    expect(TURN_MS).toBe(1500);
  });
});

describe("dữ liệu 12 chiêu đợt 1", () => {
  const ATTACK_SHAPES = new Set(["cone", "line", "fan", "nova", "ground"]);

  it("đủ 12, id duy nhất, tra bằng skillOf, id độc -> undefined", () => {
    expect(SKILLS_M7.length).toBe(12);
    expect(new Set(SKILLS_M7.map((s) => s.id)).size).toBe(12);
    for (const s of SKILLS_M7) {
      expect(skillOf(s.id)).toBe(s);
      expect(SKILL_BY_ID[s.id]).toBe(s);
    }
    for (const bad of POISON_IDS) expect(skillOf(bad)).toBeUndefined();
  });

  it.each(SKILLS_M7.map((s) => [s.id, s] as const))(
    "%s: số liệu trong khoảng, hình đủ trường, hiệu ứng trong trần",
    (_id, s) => {
      expect(elementOf(s.element), "hệ").toBeDefined();
      expect(s.cooldown).toBeGreaterThanOrEqual(1500);
      expect(s.cooldown).toBeLessThanOrEqual(20000);
      expect(s.mpPct).toBeGreaterThan(0);
      expect(s.mpPct).toBeLessThanOrEqual(0.5);
      expect(s.mult).toBeGreaterThanOrEqual(0);
      expect(s.mult).toBeLessThanOrEqual(3);
      expect(s.reqRealm).toBeGreaterThanOrEqual(1);
      expect(s.reqRealm).toBeLessThanOrEqual(4);
      expect(s.reqTier).toBeGreaterThanOrEqual(0);
      expect([0, 1, 2, 3, 4]).toContain(s.rarity);
      expect(s.price).toBeGreaterThan(0);
      expect(s.fx.length).toBeGreaterThan(0);
      if (ATTACK_SHAPES.has(s.shape))
        expect(s.mult, "chiêu đánh phải gây sát thương").toBeGreaterThan(0);
      else expect(s.mult, "hộ thể / bộ pháp không gây sát thương").toBe(0);
      switch (s.shape) {
        case "cone":
          expect(s.range).toBeGreaterThan(0);
          expect(s.arc).toBeGreaterThan(0);
          expect(s.arc!).toBeLessThanOrEqual(Math.PI);
          break;
        case "line":
          expect(s.range).toBeGreaterThan(0);
          expect(s.width).toBeGreaterThan(0);
          break;
        case "fan":
          expect(s.range).toBeGreaterThan(0);
          expect(s.width).toBeGreaterThan(0);
          expect(s.count).toBeGreaterThanOrEqual(2);
          expect(s.arc).toBeGreaterThan(0);
          break;
        case "ground":
          expect(s.range).toBeGreaterThan(0);
          expect(s.reach).toBeGreaterThan(0);
          break;
        case "dash":
          expect(s.reach).toBeGreaterThan(0);
          expect(s.dodgeMs).toBeGreaterThan(0);
          break;
        case "self":
          expect(s.range).toBe(0);
          break;
        default:
          throw new Error(`hình chưa kiểm: ${s.shape}`);
      }
      for (const e of s.effects) {
        const st = statusOf(e.status)!;
        expect(st, e.status).toBeDefined();
        expect(e.ms).toBeGreaterThan(0);
        expect(e.ms, `${e.status} vượt trần thời gian`).toBeLessThanOrEqual(st.maxMs);
        expect(e.ratio).toBeGreaterThanOrEqual(0);
        expect(e.ratio, `${e.status} vượt trần cường độ`).toBeLessThanOrEqual(st.maxRatio);
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        // chiêu có lợi cho mình (self) chỉ gắn buff, chiêu đánh chỉ gắn trạng thái có hại
        if (s.shape === "self")
          expect(st.harmful, "chiêu tự dùng không được gắn trạng thái có hại").toBe(false);
        else expect(st.harmful, "chiêu đánh không được gắn buff cho mục tiêu").toBe(true);
      }
    },
  );

  it("chiêu tự dùng có hiệu ứng (nếu không thì vô dụng); chiêu phủ đủ hệ và hình", () => {
    for (const s of SKILLS_M7)
      if (s.shape === "self") expect(s.effects.length, s.id).toBeGreaterThan(0);
    const phases = new Set(SKILLS_M7.map((s) => phaseOf(s.element)));
    for (const p of ["kim", "moc", "thuy", "hoa", "tho"] as const)
      expect(phases.has(p), `thiếu pha ${p}`).toBe(true);
    const shapes = new Set(SKILLS_M7.map((s) => s.shape));
    for (const sh of ["cone", "line", "fan", "ground", "dash", "self"])
      expect(shapes.has(sh as never), sh).toBe(true);
  });

  it("chữ tiếng Việt: tên, tên công pháp, mô tả không rỗng và KHÔNG có chữ Hán", () => {
    for (const s of SKILLS_M7) {
      for (const t of [s.name, s.bookName, s.desc]) {
        expect(t.trim().length, s.id).toBeGreaterThan(0);
        expect(hasCjk(t), `${s.id}: chữ Hán`).toBe(false);
      }
    }
  });
});

describe("tầng chiêu", () => {
  it("tầng 1 không đổi, mỗi tầng +15% sát thương / -8% hồi chiêu, kẹp 1..3, đầu vào xấu về tầng 1", () => {
    expect(skillDamageMult(1)).toBe(1);
    expect(skillDamageMult(2)).toBeCloseTo(1.15, 10);
    expect(skillDamageMult(3)).toBeCloseTo(1.3, 10);
    expect(skillDamageMult(99)).toBeCloseTo(1.3, 10);
    expect(skillCooldownMult(1)).toBe(1);
    expect(skillCooldownMult(3)).toBeCloseTo(0.84, 10);
    for (const bad of [0, -5, Number.NaN, Infinity, 1.9]) {
      expect(Number.isFinite(skillDamageMult(bad))).toBe(true);
      expect(skillDamageMult(bad)).toBeGreaterThanOrEqual(1);
      expect(skillCooldownMult(bad)).toBeGreaterThan(0);
    }
    expect(SKILL_MAX_LEVEL).toBe(3);
  });
});

describe("ô chiêu", () => {
  it("L U I O = ô 2-5, mở theo cảnh giới Luyện Khí / Trúc Cơ / Kim Đan / Nguyên Anh", () => {
    expect([...LEARNABLE_SLOTS]).toEqual([2, 3, 4, 5]);
    expect(SLOT_UNLOCK_REALM).toEqual({ 2: 1, 3: 2, 4: 3, 5: 4 });
    expect(slotOpen(2, 0)).toBe(false);
    expect(slotOpen(2, 1)).toBe(true);
    expect(slotOpen(3, 1)).toBe(false);
    expect(slotOpen(3, 2)).toBe(true);
    expect(slotOpen(5, 3)).toBe(false);
    expect(slotOpen(5, 4)).toBe(true);
  });
  it("isSkillSlot / slotOpen từ chối đầu vào không phải ô hợp lệ", () => {
    for (const bad of [0, 1, 6, -2, 2.5, "2", null, undefined, Number.NaN, {}]) {
      expect(isSkillSlot(bad as unknown), String(bad)).toBe(false);
      expect(slotOpen(bad as unknown, 9)).toBe(false);
    }
    expect(slotOpen(2, Number.NaN)).toBe(false);
  });
});

describe("sanitizeSkillBook", () => {
  const good = (): unknown => ({
    learned: { hoa_van_kiem: 2, me_tung_bo: 1 },
    slots: ["hoa_van_kiem", "me_tung_bo", "", ""],
  });

  it("giữ sổ hợp lệ khi đủ cảnh giới", () => {
    const b = sanitizeSkillBook(good(), 2);
    expect(b.learned).toEqual({ hoa_van_kiem: 2, me_tung_bo: 1 });
    expect(b.slots).toEqual(["hoa_van_kiem", "me_tung_bo", "", ""]);
  });

  it("ô CHƯA MỞ ở cảnh giới hiện tại bị gỡ (ô 3 cần Trúc Cơ), chiêu vẫn còn trong learned", () => {
    const b = sanitizeSkillBook(good(), 1);
    expect(b.slots).toEqual(["hoa_van_kiem", "", "", ""]);
    expect(b.learned.me_tung_bo).toBe(1);
  });

  it("đầu vào hỏng không ném lỗi và trả sổ trống", () => {
    for (const bad of [null, undefined, 5, "x", [], true, () => 1]) {
      expect(sanitizeSkillBook(bad, 4)).toEqual(emptySkillBook());
    }
    expect(sanitizeSkillBook({ learned: [], slots: "abc" }, 4)).toEqual(emptySkillBook());
  });

  it("chiêu lạ / độc bị bỏ, không ô nhiễm prototype, learned chỉ có khoá trong bảng", () => {
    const raw = JSON.parse(
      '{"learned":{"__proto__":3,"constructor":2,"toString":1,"hoa_van_kiem":3,"khong_co":2},"slots":["__proto__","constructor","toString","khong_co"]}',
    );
    const b = sanitizeSkillBook(raw, 4);
    expect(Object.keys(b.learned)).toEqual(["hoa_van_kiem"]);
    expect(b.slots).toEqual(["", "", "", ""]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(b.learned)).toBe(Object.prototype);
  });

  it("tầng kẹp 1..3, số xấu thành 1", () => {
    const b = sanitizeSkillBook(
      {
        learned: {
          hoa_van_kiem: 99,
          ung_trao: -4,
          huyen_bang_chi: Number.NaN,
          kim_chung_trao: "3",
          bon_thach_quyen: 2.9,
        },
      },
      4,
    );
    expect(b.learned).toEqual({
      hoa_van_kiem: 3,
      ung_trao: 1,
      huyen_bang_chi: 1,
      kim_chung_trao: 1,
      bon_thach_quyen: 2,
    });
  });

  it("ô chỉ giữ chiêu ĐÃ HỌC và mỗi chiêu tối đa một ô (ô trước thắng)", () => {
    const b = sanitizeSkillBook(
      {
        learned: { hoa_van_kiem: 1 },
        slots: ["hoa_van_kiem", "hoa_van_kiem", "ung_trao", 7],
      },
      4,
    );
    expect(b.slots).toEqual(["hoa_van_kiem", "", "", ""]);
  });

  it("không sửa đối tượng đầu vào", () => {
    const raw = good() as { learned: Record<string, number>; slots: string[] };
    const copy = JSON.stringify(raw);
    sanitizeSkillBook(raw, 1);
    expect(JSON.stringify(raw)).toBe(copy);
  });
});

describe("learnSkill", () => {
  it("chiêu lạ / độc -> unknown", () => {
    for (const bad of [...POISON_IDS, 5, null]) {
      const r = learnSkill(emptySkillBook(), bad as unknown, 4, 2);
      expect(r).toEqual({ ok: false, reason: "unknown" });
    }
  });

  it("thiếu cảnh giới -> realm; đúng ngưỡng thì học được (so theo realm rồi tier)", () => {
    // thanh_tung_phi_cham cần Trúc Cơ (realm 2) tier 0
    expect(learnSkill(emptySkillBook(), "thanh_tung_phi_cham", 1, 8)).toEqual({
      ok: false,
      reason: "realm",
    });
    const ok = learnSkill(emptySkillBook(), "thanh_tung_phi_cham", 2, 0);
    expect(ok.ok).toBe(true);
    expect(learnSkill(emptySkillBook(), "hoa_van_kiem", 0, 0)).toEqual({
      ok: false,
      reason: "realm",
    });
    expect(learnSkill(emptySkillBook(), "hoa_van_kiem", Number.NaN, 0)).toEqual({
      ok: false,
      reason: "realm",
    });
  });

  it("học lần đầu = tầng 1, quyển trùng +1 tầng tới 3 rồi maxed; sổ cũ không bị sửa", () => {
    let book: SkillBook = emptySkillBook();
    const orig = book;
    for (const want of [1, 2, 3]) {
      const r = learnSkill(book, "ung_trao", 1, 0);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.level).toBe(want);
      expect(r.book.learned.ung_trao).toBe(want);
      expect(r.book).not.toBe(book);
      book = r.book;
    }
    expect(orig.learned).toEqual({});
    expect(learnSkill(book, "ung_trao", 1, 0)).toEqual({ ok: false, reason: "maxed" });
  });
});

describe("assignSlot", () => {
  const learned = (): SkillBook => {
    let b = emptySkillBook();
    for (const id of ["hoa_van_kiem", "ung_trao", "me_tung_bo"]) {
      const r = learnSkill(b, id, 4, 2);
      if (!r.ok) throw new Error(id);
      b = r.book;
    }
    return b;
  };

  it("ô không hợp lệ -> slot; ô chưa mở -> locked; chiêu lạ -> unknown; chưa học -> notLearned", () => {
    const b = learned();
    for (const bad of [1, 6, "2", null, 2.5])
      expect(assignSlot(b, bad, "ung_trao", 4)).toEqual({ ok: false, reason: "slot" });
    expect(assignSlot(b, 3, "ung_trao", 1)).toEqual({ ok: false, reason: "locked" });
    expect(assignSlot(b, 2, "constructor", 4)).toEqual({ ok: false, reason: "unknown" });
    expect(assignSlot(b, 2, 5, 4)).toEqual({ ok: false, reason: "unknown" });
    expect(assignSlot(b, 2, "bon_thach_quyen", 4)).toEqual({ ok: false, reason: "notLearned" });
  });

  it("gắn, ĐỔI CHỖ khi chiêu đang ở ô khác (ô cũ trống), gỡ bằng chuỗi rỗng; sổ cũ không bị sửa", () => {
    const b0 = learned();
    const r1 = assignSlot(b0, 2, "ung_trao", 4);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.book.slots).toEqual(["ung_trao", "", "", ""]);
    expect(b0.slots).toEqual(["", "", "", ""]);
    const r2 = assignSlot(r1.book, 4, "ung_trao", 4);
    expect(r2.ok && r2.book.slots).toEqual(["", "", "ung_trao", ""]);
    const r3 = assignSlot(r2.ok ? r2.book : b0, 4, "", 4);
    expect(r3.ok && r3.book.slots).toEqual(["", "", "", ""]);
    // thay chiêu ở ô đã có chiêu khác
    const r4 = assignSlot(r1.book, 2, "hoa_van_kiem", 4);
    expect(r4.ok && r4.book.slots).toEqual(["hoa_van_kiem", "", "", ""]);
  });

  it("gỡ ô CHƯA MỞ vẫn bị từ chối (không có chiêu nào để gỡ, ô khoá)", () => {
    expect(assignSlot(learned(), 5, "", 1)).toEqual({ ok: false, reason: "locked" });
  });
});

describe("tin nhắn client -> server", () => {
  it("parseCast: ô 2..5 và góc hữu hạn; kẹp góc", () => {
    expect(parseCast({ slot: 2, angle: 1.5 })).toEqual({ slot: 2, angle: 1.5 });
    expect(parseCast({ slot: 5, angle: 100 })).toEqual({ slot: 5, angle: 2 * Math.PI });
    expect(parseCast({ slot: 3, angle: -100 })).toEqual({ slot: 3, angle: -2 * Math.PI });
  });
  it("parseCast: từ chối kiểu sai, ô lạ, góc không hữu hạn", () => {
    for (const bad of [
      null,
      undefined,
      5,
      "x",
      [],
      {},
      { slot: 1, angle: 0 },
      { slot: 6, angle: 0 },
      { slot: "2", angle: 0 },
      { slot: 2, angle: "0" },
      { slot: 2, angle: Number.NaN },
      { slot: 2, angle: Infinity },
      { slot: 2.5, angle: 0 },
      { angle: 0 },
      { slot: 2 },
    ])
      expect(parseCast(bad), JSON.stringify(bad)).toBeNull();
  });
  it("parseSkillSlot: id chuỗi ngắn (rỗng = gỡ); từ chối kiểu sai / ô lạ / id quá dài", () => {
    expect(parseSkillSlot({ slot: 3, skillId: "ung_trao" })).toEqual({
      slot: 3,
      skillId: "ung_trao",
    });
    expect(parseSkillSlot({ slot: 4, skillId: "" })).toEqual({ slot: 4, skillId: "" });
    for (const bad of [
      null,
      [],
      { slot: 3 },
      { slot: 3, skillId: 5 },
      { slot: 3, skillId: null },
      { slot: 1, skillId: "ung_trao" },
      { slot: "3", skillId: "ung_trao" },
      { slot: 3, skillId: "x".repeat(41) },
    ])
      expect(parseSkillSlot(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("khắc chân linh", () => {
  it("giá tăng dần, tối đa 3", () => {
    expect([...ENGRAVE_COSTS]).toEqual([40, 100, 220]);
    expect(ENGRAVE_MAX).toBe(3);
    for (let i = 1; i < ENGRAVE_COSTS.length; i++)
      expect(ENGRAVE_COSTS[i]).toBeGreaterThan(ENGRAVE_COSTS[i - 1]);
  });
  it("sanitizeEngraved: bỏ chiêu lạ / độc / trùng, cắt ở mức tối đa, đầu vào hỏng -> []", () => {
    expect(
      sanitizeEngraved([
        "ung_trao",
        "ung_trao",
        "constructor",
        "hoa_van_kiem",
        "x",
        "me_tung_bo",
        "kim_chung_trao",
      ]),
    ).toEqual(["ung_trao", "hoa_van_kiem", "me_tung_bo"]);
    for (const bad of [null, undefined, "ung_trao", 5, {}, [null, 3, {}]])
      expect(sanitizeEngraved(bad)).toEqual([]);
  });
  it("Soul: bản mới có engraved [], tệp cũ không có trường -> [], tệp có thì làm sạch", () => {
    expect(newSoul("a", "t").engraved).toEqual([]);
    const old = sanitizeSoul({ id: "a", kiep: 2 }, "t")!;
    expect(old.engraved).toEqual([]);
    const s = sanitizeSoul(
      {
        id: "a",
        engraved: [
          "ung_trao",
          "__proto__",
          "ung_trao",
          "huyen_bang_chi",
          "kim_chung_trao",
          "me_tung_bo",
        ],
      },
      "t",
    )!;
    expect(s.engraved).toEqual(["ung_trao", "huyen_bang_chi", "kim_chung_trao"]);
  });
});

describe("hằng quái (M7.3)", () => {
  it("trong khoảng hợp lý", () => {
    expect(MAX_BOLTS).toBeGreaterThan(0);
    expect(MAX_BOLTS).toBeLessThanOrEqual(128);
    expect(ELITE_CHANCE).toBeGreaterThan(0);
    expect(ELITE_CHANCE).toBeLessThanOrEqual(0.1);
    expect(ELITE_MULT.hp).toBeGreaterThan(1);
    expect(ELITE_MULT.atk).toBeGreaterThan(1);
    expect(ELITE_MULT.exp).toBeGreaterThan(1);
    expect(MAX_ELITES).toBeGreaterThan(0);
  });
});
