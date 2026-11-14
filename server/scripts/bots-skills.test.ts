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

  it("ưu tiên chiêu có khắc ngũ hành lên hệ của quái", () => {
    const b = makeMockCombatBot();
    const me = { mp: 100, maxMp: 100 };
    const now = 1000;

    // hoa_van_kiem là hệ Hỏa (khắc Kim)
    // thanh_tung_phi_cham là hệ Mộc (khắc Thổ)
    // Quái hệ Kim: chiêu hệ Hỏa (ô 2) được hưởng lợi khắc x1.3, nên phải được ưu tiên!
    expect(elementMult("hoa", "kim")).toBeGreaterThan(1);
    expect(elementMult("moc", "kim")).toBeLessThanOrEqual(1);

    const res = tryCastLearnedSkill(b, me, 80, 0, now, true, "kim");
    expect(res).toBe(true);
    expect(b._sent[0].data.slot).toBe(2 as SkillSlot); // Ô 2 = hoa_van_kiem
  });
});
