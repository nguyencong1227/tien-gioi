import { describe, expect, it } from "vitest";
import {
  SKILLS_M7,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  skillOf,
  type SkillsMsg,
} from "@tien-gioi/shared";
import { SkillTracker, type SlotMe } from "./skill-bar";
import {
  SHAPE_LABEL,
  buildSkillsPanel,
  effectText,
  fmtNum,
  lockedSlotToast,
  slotMessage,
  statLines,
} from "./skills-panel";

const HOA = "hoa_van_kiem"; // cone, reqRealm 1, mult 1,6, burn 40%
const BANG = "huyen_bang_chi";
const TUNG = "thanh_tung_phi_cham"; // reqRealm 2
const ME: SlotMe = { realm: 3, tier: 0, mp: 1000, maxMp: 1000 }; // Kim Đan: mở ô 2, 3, 4; ô 5 khoá

function tracker(over: Partial<SkillsMsg> = {}): SkillTracker {
  const t = new SkillTracker();
  t.set(
    {
      learned: { [HOA]: 2, [BANG]: 1 },
      slots: [HOA, "", "", ""],
      cd: [0, 0, 0, 0],
      cdMax: [3000, 0, 0, 0],
      ...over,
    },
    0,
  );
  return t;
}

describe("fmtNum: số kiểu Việt", () => {
  it("dấu phẩy, bỏ số 0 thừa, rác -> 0", () => {
    expect(fmtNum(1.84)).toBe("1,84");
    expect(fmtNum(2)).toBe("2");
    expect(fmtNum(2.5)).toBe("2,5");
    expect(fmtNum(1.2, 1)).toBe("1,2");
    expect(fmtNum(0.4 * 100, 0)).toBe("40");
    expect(fmtNum(Number.NaN)).toBe("0");
    expect(fmtNum(Infinity)).toBe("0");
    expect(fmtNum(10)).toBe("10");
    expect(fmtNum(100)).toBe("100"); // không cắt nhầm số 0 của phần nguyên
  });
});

describe("statLines: số THẬT của máy chủ", () => {
  it("sát thương nhân tầng, linh lực theo linh lực tối đa, hồi chiêu theo tầng", () => {
    const def = skillOf(HOA)!;
    const l1 = statLines(def, 1, 1000);
    const l3 = statLines(def, 3, 1000);
    expect(l1[0]).toBe(`Sát thương: ${fmtNum(def.mult * skillDamageMult(1))} lần công`);
    expect(l3[0]).toBe(`Sát thương: ${fmtNum(def.mult * skillDamageMult(3))} lần công`);
    expect(l1[0]).not.toBe(l3[0]);
    expect(l1[1]).toBe(`Linh lực: ${skillMpCost(def, 1000)} (8% tối đa)`);
    expect(statLines(def, 1, 5000)[1]).toBe(`Linh lực: ${skillMpCost(def, 5000)} (8% tối đa)`);
    expect(l1[2]).toBe(`Hồi chiêu: ${fmtNum(skillCooldownMs(def, 1, 0) / 1000, 1)} giây`);
    expect(l3[2]).not.toBe(l1[2]);
  });
  it("chiêu không gây sát thương, chiêu toả tia, vùng đặt đất, bộ pháp có dòng riêng", () => {
    for (const d of SKILLS_M7) {
      const lines = statLines(d, 1, 1000);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines[0]).toMatch(d.mult > 0 ? /^Sát thương: / : /^Không gây sát thương$/);
      expect(lines.join("|")).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(statLines(skillOf("lac_tuyet_phan_phi")!, 1, 1000).join("|")).toMatch(/mỗi tia/);
    expect(statLines(skillOf("cuu_cung_khon_sat")!, 1, 1000).join("|")).toMatch(/Vùng: bán kính/);
    expect(statLines(skillOf("phieu_phong_bo")!, 1, 1000).join("|")).toMatch(/Lao: /);
  });
});

describe("effectText: hiệu ứng gắn kèm", () => {
  it("tên, thời gian, cường độ theo loại, xác suất; trạng thái lạ rỗng", () => {
    expect(effectText({ status: "burn", ms: 3000, ratio: 0.12, chance: 0.4 })).toBe(
      "40% khả năng: Bỏng 3 giây (12% sát thương gốc mỗi giây)",
    );
    expect(effectText({ status: "chill", ms: 3000, ratio: 0.3, chance: 1 })).toBe(
      "Tê cóng 3 giây (giảm tốc 30%)",
    );
    expect(effectText({ status: "stun", ms: 1200, ratio: 0, chance: 1 })).toBe("Choáng 1,2 giây");
    expect(effectText({ status: "shield", ms: 6000, ratio: 0.2, chance: 1 })).toBe(
      "Hộ thể 6 giây (chắn 20% khí huyết tối đa), cho bản thân",
    );
    expect(effectText({ status: "haste", ms: 4500, ratio: 0.35, chance: 1 })).toContain(
      "tăng tốc 35%",
    );
    expect(effectText({ status: "regen", ms: 3000, ratio: 0.05, chance: 1 })).toContain(
      "hồi 5% khí huyết",
    );
    expect(effectText({ status: "sunder", ms: 3000, ratio: 0.2, chance: 1 })).toContain(
      "nhận thêm 20% sát thương",
    );
    expect(effectText({ status: "constructor" as never, ms: 1, ratio: 1, chance: 1 })).toBe("");
  });
  it("mọi hiệu ứng của mọi chiêu thật đều có chữ, không NaN", () => {
    for (const d of SKILLS_M7)
      for (const e of d.effects) {
        const t = effectText(e);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toMatch(/NaN|undefined/);
      }
  });
});

describe("buildSkillsPanel: mô hình bảng", () => {
  it("chưa học gì: rỗng + câu hướng dẫn", () => {
    const m = buildSkillsPanel(new SkillTracker(), ME);
    expect(m.rows).toEqual([]);
    expect(m.count).toBe("0 chiêu đã học");
    expect(m.empty).toMatch(/Túi đồ/);
  });

  it("chỉ chiêu ĐÃ học, theo thứ tự bảng, kèm tầng, hệ, kiểu đánh, kinh quyển, mô tả", () => {
    const m = buildSkillsPanel(tracker(), ME);
    expect(m.rows.map((r) => r.id)).toEqual([HOA, BANG]);
    expect(m.count).toBe("2 chiêu đã học");
    expect(m.empty).toBeNull();
    const r = m.rows[0];
    expect(r).toMatchObject({
      name: "Hỏa Vân Kiếm",
      level: 2,
      pips: "●●○",
      element: "Hỏa",
      shape: SHAPE_LABEL.cone,
    });
    expect(r.book).toBe(skillOf(HOA)!.bookName);
    expect(r.desc).toBe(skillOf(HOA)!.desc);
    expect(r.effects.length).toBe(1);
    expect(r.need).toBeNull();
  });

  it("ô: mở theo cảnh giới, ô đang giữ chiêu, gắn / gỡ", () => {
    const m = buildSkillsPanel(tracker(), ME);
    const hoa = m.rows[0];
    expect(hoa.slotNow).toBe(2);
    expect(hoa.unequip).toBe("Gỡ khỏi ô 2");
    expect(hoa.slots.map((s) => [s.slot, s.open, s.here])).toEqual([
      [2, true, true],
      [3, true, false],
      [4, true, false],
      [5, false, false], // Nguyên Anh mới mở
    ]);
    expect(hoa.slots[0].aria).toBe("Hỏa Vân Kiếm đang ở ô 2");
    expect(hoa.slots[1].aria).toBe("Gắn Hỏa Vân Kiếm vào ô 3");
    expect(hoa.slots[3].aria).toBe("Ô 5 chưa mở: Mở ở Nguyên Anh");
    expect(hoa.slots[3].blocked).toBe("Ô chiêu thức 5 chưa mở: Mở ở Nguyên Anh.");
    expect(hoa.slots[1].blocked).toBeNull();
    const bang = m.rows[1];
    expect(bang.slotNow).toBeNull();
    expect(bang.unequip).toBeNull();
    // gắn vào ô đang có chiêu khác: nói rõ sẽ thay chiêu nào
    expect(bang.slots[0].occupant).toBe("Hỏa Vân Kiếm");
    expect(bang.slots[0].aria).toBe("Gắn Huyền Băng Chỉ vào ô 2, thay Hỏa Vân Kiếm");
    expect(bang.slots[1].occupant).toBe("");
  });

  it("cảnh giới thấp: ô khoá theo SLOT_UNLOCK_REALM, không ô nào mở ở Phàm Nhân", () => {
    const m = buildSkillsPanel(tracker(), { ...ME, realm: 0 });
    expect(m.rows[0].slots.every((s) => !s.open)).toBe(true);
    const m2 = buildSkillsPanel(tracker(), { ...ME, realm: 2 });
    expect(m2.rows[0].slots.map((s) => s.open)).toEqual([true, true, false, false]);
  });

  it("chiêu thiếu cảnh giới (kiếp mới giữ chiêu khắc): ghi 'Cần đạt ...'", () => {
    const t = tracker({ learned: { [TUNG]: 1 }, slots: ["", "", "", ""] });
    const row = buildSkillsPanel(t, { realm: 1, tier: 3, mp: 9, maxMp: 9 }).rows[0];
    expect(row.need).toBe("Cần đạt Trúc Cơ");
    expect(buildSkillsPanel(t, { realm: 2, tier: 0, mp: 9, maxMp: 9 }).rows[0].need).toBeNull();
  });

  it("số trong bảng khớp hàm của máy chủ theo tầng của TỪNG chiêu và linh lực tối đa", () => {
    const m = buildSkillsPanel(tracker(), { ...ME, maxMp: 2000 });
    const def = skillOf(HOA)!;
    expect(m.rows[0].stats[0]).toBe(
      `Sát thương: ${fmtNum(def.mult * skillDamageMult(2))} lần công`,
    );
    expect(m.rows[0].stats[1]).toBe(`Linh lực: ${skillMpCost(def, 2000)} (8% tối đa)`);
  });

  it("rác từ tin nhắn đã bị SkillTracker làm sạch: không có hàng cho id lạ / độc", () => {
    const t = tracker({
      learned: { constructor: 3, __proto__x: 2, [HOA]: 1 },
      slots: ["constructor", "", "", ""],
    });
    expect(buildSkillsPanel(t, ME).rows.map((r) => r.id)).toEqual([HOA]);
  });
});

describe("tin gắn ô và thông báo", () => {
  it("slotMessage: gắn và gỡ ('' = gỡ)", () => {
    expect(slotMessage(3, HOA)).toEqual({ slot: 3, skillId: HOA });
    expect(slotMessage(2, "")).toEqual({ slot: 2, skillId: "" });
  });
  it("ô chưa mở: toast nêu cảnh giới, ô mở: null", () => {
    expect(lockedSlotToast(5, { realm: 3 })).toBe("Ô chiêu thức 5 chưa mở: Mở ở Nguyên Anh.");
    expect(lockedSlotToast(4, { realm: 3 })).toBeNull();
    expect(lockedSlotToast(2, { realm: 0 })).toBe("Ô chiêu thức 2 chưa mở: Mở ở Luyện Khí.");
  });
});
