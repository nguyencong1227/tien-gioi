// Kiểm thử tính năng bot dùng chiêu thức (M7.10 #511): sampleSkillsForRealm, autoAssignBotSkills, tryCastLearnedSkill
import { describe, expect, it } from "vitest";
import {
  LEARNABLE_SLOTS,
  SKILL_MSG,
  elementMult,
  slotOpen,
  type SkillSlot,
} from "@tien-gioi/shared";
import { autoAssignBotSkills, sampleSkillsForRealm, tryCastLearnedSkill } from "./bots";

describe("bot dùng chiêu thức: sampleSkillsForRealm (M7.10 #511)", () => {
  it("trả về SkillBook hợp lệ và đúng quy tắc cho từng cảnh giới", () => {
    // Realm 0: Phàm nhân (chưa mở ô nào)
    const s0 = sampleSkillsForRealm(0);
    expect(s0.slots).toEqual(["", "", "", ""]);
    expect(Object.keys(s0.learned).length).toBe(0);

    // Realm 1: Luyện Khí (chỉ mở ô 2)
    const s1 = sampleSkillsForRealm(1);
    expect(slotOpen(2, 1)).toBe(true);
    expect(slotOpen(3, 1)).toBe(false);
    expect(s1.slots[0]).toBe("hoa_van_kiem");
    expect(s1.slots[1]).toBe("");
    expect(s1.slots[2]).toBe("");
    expect(s1.slots[3]).toBe("");
    expect(s1.learned["hoa_van_kiem"]).toBeGreaterThanOrEqual(1);

    // Realm 2: Trúc Cơ (mở ô 2 và 3)
    const s2 = sampleSkillsForRealm(2);
    expect(slotOpen(2, 2)).toBe(true);
    expect(slotOpen(3, 2)).toBe(true);
    expect(slotOpen(4, 2)).toBe(false);
    expect(s2.slots[0]).toBe("hoa_van_kiem");
    expect(s2.slots[1]).toBe("thanh_tung_phi_cham");
    expect(s2.slots[2]).toBe("");
    expect(s2.slots[3]).toBe("");
    expect(s2.learned["hoa_van_kiem"]).toBeGreaterThanOrEqual(1);
    expect(s2.learned["thanh_tung_phi_cham"]).toBeGreaterThanOrEqual(1);

    // Realm 3: Kim Đan (mở ô 2, 3, 4)
    const s3 = sampleSkillsForRealm(3);
    expect(slotOpen(4, 3)).toBe(true);
    expect(slotOpen(5, 3)).toBe(false);
    expect(s3.slots[0]).toBe("hoa_van_kiem");
    expect(s3.slots[1]).toBe("thanh_tung_phi_cham");
    expect(s3.slots[2]).toBe("cuu_cung_khon_sat");
    expect(s3.slots[3]).toBe("");

    // Realm 4: Nguyên Anh (mở cả 4 ô 2, 3, 4, 5)
    const s4 = sampleSkillsForRealm(4);
    for (const slot of LEARNABLE_SLOTS) {
      expect(slotOpen(slot, 4)).toBe(true);
    }
    expect(s4.slots[0]).toBeTruthy();
    expect(s4.slots[1]).toBeTruthy();
    expect(s4.slots[2]).toBeTruthy();
    expect(s4.slots[3]).toBeTruthy();
  });
});

describe("bot dùng chiêu thức: autoAssignBotSkills", () => {
  function makeMockBot(realm = 1, tier = 0): any {
    const sentMsgs: { type: string; data: any }[] = [];
    return {
      skills: true,
      skillsLearned: {},
      skillsSlots: ["", "", "", ""],
      skillsCd: [0, 0, 0, 0],
      skillsCdMax: [0, 0, 0, 0],
      skillsNextCastAt: [0, 0, 0, 0],
      skillsCastCount: 0,
      skillsMsgsCount: 0,
      skillsSent: 0,
      room: {
        sessionId: "bot_test_1",
        state: {
          players: new Map([["bot_test_1", { realm, tier, mp: 100, maxMp: 100 }]]),
        },
        send: (type: string, data: any) => {
          sentMsgs.push({ type, data });
        },
      },
      _sent: sentMsgs,
    };
  }

  it("không làm gì nếu bot.skills không được bật", () => {
    const b = makeMockBot(1);
    b.skills = false;
    b.skillsLearned = { hoa_van_kiem: 1 };
    autoAssignBotSkills(b);
    expect(b._sent.length).toBe(0);
  });

  it("tự động gán chiêu đã học vào ô mở đang trống", () => {
    const b = makeMockBot(1);
    b.skillsLearned = { hoa_van_kiem: 1 };
    b.skillsSlots = ["", "", "", ""];

    autoAssignBotSkills(b);

    // Ô 2 mở ở realm 1, được gán hoa_van_kiem
    expect(b._sent.length).toBe(1);
    expect(b._sent[0]).toEqual({
      type: SKILL_MSG.slot,
      data: { slot: 2, skillId: "hoa_van_kiem" },
    });
    expect(b.skillsSlots[0]).toBe("hoa_van_kiem");
  });

  it("không gán vào các ô chưa mở theo cảnh giới", () => {
    const b = makeMockBot(1); // Luyện Khí chỉ mở ô 2
    b.skillsLearned = {
      hoa_van_kiem: 1,
      thanh_tung_phi_cham: 1, // cần Trúc Cơ
    };
    b.skillsSlots = ["hoa_van_kiem", "", "", ""];

    autoAssignBotSkills(b);

    // Ô 3, 4, 5 chưa mở nên không gửi tin gán
    expect(b._sent.length).toBe(0);
    expect(b.skillsSlots[1]).toBe("");
  });

  it("cảnh giới 1 mở ô 2 nhưng học cả 2 chiêu: chỉ gán đúng ô 2, không gán ô 3 (diệt đột biến N1)", () => {
    const b = makeMockBot(1); // Luyện Khí chỉ mở ô 2
    b.skillsLearned = {
      hoa_van_kiem: 1,
      thanh_tung_phi_cham: 1,
    };
    b.skillsSlots = ["", "", "", ""]; // Tất cả ô đang trống

    autoAssignBotSkills(b);

    // Chỉ gửi duy nhất 1 tin gán cho ô 2, ô 3 chưa mở nên tuyệt đối không được gán
    expect(b._sent.length).toBe(1);
    expect(b._sent[0]).toEqual({
      type: SKILL_MSG.slot,
      data: { slot: 2, skillId: "hoa_van_kiem" },
    });
    expect(b.skillsSlots[0]).toBe("hoa_van_kiem");
    expect(b.skillsSlots[1]).toBe("");
  });

  it("gán đúng vào ô mở tiếp theo khi lên cảnh giới cao hơn", () => {
    const b = makeMockBot(2); // Trúc Cơ mở ô 2 và ô 3
    b.skillsLearned = {
      hoa_van_kiem: 2,
      thanh_tung_phi_cham: 1,
    };
    b.skillsSlots = ["hoa_van_kiem", "", "", ""];

    autoAssignBotSkills(b);

    expect(b._sent.length).toBe(1);
    expect(b._sent[0]).toEqual({
      type: SKILL_MSG.slot,
      data: { slot: 3, skillId: "thanh_tung_phi_cham" },
    });
    expect(b.skillsSlots[1]).toBe("thanh_tung_phi_cham");
  });
});

describe("bot dùng chiêu thức: tryCastLearnedSkill", () => {
  function makeMockCombatBot(): any {
    const sentMsgs: { type: string; data: any }[] = [];
    return {
      skills: true,
      skillsLearned: { hoa_van_kiem: 2, thanh_tung_phi_cham: 1 },
      skillsSlots: ["hoa_van_kiem", "thanh_tung_phi_cham", "", ""],
      skillsCd: [0, 0, 0, 0],
      skillsCdMax: [2000, 3000, 0, 0],
      skillsNextCastAt: [0, 0, 0, 0],
      skillsCastCount: 0,
      skillsMsgsCount: 0,
      skillsSent: 0,
      room: {
        send: (type: string, data: any) => {
          sentMsgs.push({ type, data });
        },
      },
      _sent: sentMsgs,
    };
  }

  it("trả về false nếu me không đủ linh lực (MP)", () => {
    const b = makeMockCombatBot();
    const me = { mp: 0, maxMp: 100 };
    const res = tryCastLearnedSkill(b, me, 100, 0, 1000, true);
    expect(res).toBe(false);
    expect(b._sent.length).toBe(0);
  });

  it("trả về false nếu me có MP > 0 nhưng nhỏ hơn MP cần của chiêu (diệt đột biến N2)", () => {
    const b = makeMockCombatBot();
    // hoa_van_kiem cần ceil(0.08 * 100) = 8 MP, thanh_tung_phi_cham cần ceil(0.10 * 100) = 10 MP
    const me = { mp: 5, maxMp: 100 };
    const res = tryCastLearnedSkill(b, me, 80, 0, 1000, true);
    expect(res).toBe(false);
    expect(b._sent.length).toBe(0);
  });

  it("trả về false nếu tất cả chiêu đang trong thời gian hồi chiêu", () => {
    const b = makeMockCombatBot();
    const me = { mp: 100, maxMp: 100 };
    const now = 1000;
    b.skillsNextCastAt[0] = 5000;
    b.skillsNextCastAt[1] = 5000;

    const res = tryCastLearnedSkill(b, me, 100, 0, now, true);
    expect(res).toBe(false);
    expect(b._sent.length).toBe(0);
  });

  it("trả về false nếu quái vượt quá tầm đánh của tất cả chiêu", () => {
    const b = makeMockCombatBot();
    const me = { mp: 100, maxMp: 100 };
    // thanh_tung_phi_cham có range 240, hoa_van_kiem có range 90. 500 px xa hơn cả hai
    const farDist = 500;

    const res = tryCastLearnedSkill(b, me, farDist, 0, 1000, true);
    expect(res).toBe(false);
    expect(b._sent.length).toBe(0);
  });

  it("thi triển thành công khi đủ điều kiện: gửi tin cast, tăng đếm, đặt hồi chiêu", () => {
    const b = makeMockCombatBot();
    const me = { mp: 100, maxMp: 100 };
    const now = 1000;

    const res = tryCastLearnedSkill(b, me, 80, 0.5, now, true);
    expect(res).toBe(true);
    expect(b._sent.length).toBe(1);
    expect(b._sent[0].type).toBe(SKILL_MSG.cast);
    expect([2, 3]).toContain(b._sent[0].data.slot);
    expect(b._sent[0].data.angle).toBe(0.5);
    expect(b.skillsCastCount).toBe(1);
    expect(b.skillsSent).toBe(1);
  });

  it("ưu tiên chiêu có khắc ngũ hành lên hệ của quái dù mult cơ bản nhỏ hơn (diệt đột biến N3)", () => {
    const b = makeMockCombatBot();
    const me = { mp: 100, maxMp: 100 };
    const now = 1000;

    // hoa_van_kiem (ô 2): hệ Hỏa, mult = 1.6
    // thanh_tung_phi_cham (ô 3): hệ Mộc, mult = 1.5
    // Đánh quái hệ Thổ (tho):
    // - Hỏa lên Thổ: không khắc, factor = 1.0 -> score = 1.6 * 1.0 = 1.6
    // - Mộc khắc Thổ: factor = 1.3 -> score = 1.5 * 1.3 = 1.95 (> 1.6)
    // Dù thanh_tung_phi_cham có mult nhỏ hơn (1.5 < 1.6), nhưng nhờ hệ khắc nên được ưu tiên chọn!
    expect(elementMult("hoa", "tho")).toBeLessThanOrEqual(1);
    expect(elementMult("moc", "tho")).toBeGreaterThan(1);

    const res = tryCastLearnedSkill(b, me, 80, 0, now, true, "tho");
    expect(res).toBe(true);
    expect(b._sent[0].data.slot).toBe(3 as SkillSlot); // Phải chọn ô 3 (thanh_tung_phi_cham)
  });
});
