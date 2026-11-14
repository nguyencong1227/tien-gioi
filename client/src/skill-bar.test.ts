import { describe, expect, it } from "vitest";
import {
  SKILLS_M7,
  SLOT_UNLOCK_REALM,
  skillCooldownMs,
  skillMpCost,
  skillOf,
  type SkillsMsg,
} from "@tien-gioi/shared";
import {
  BAR_SLOTS,
  aimMode,
  SkillTracker,
  blockedToast,
  elementColor,
  isMockSkillsEnabled,
  levelPips,
  mockAssign,
  mockCast,
  mockRealm,
  mockSkillCount,
  mockSkillsMsg,
  needText,
  shortName,
  slotAriaLabel,
  slotView,
  stateText,
  unlockText,
  type SlotMe,
} from "./skill-bar";

const HOA = "hoa_van_kiem"; // reqRealm 1
const BANG = "huyen_bang_chi"; // reqRealm 1
const TUNG = "thanh_tung_phi_cham"; // reqRealm 2: ở ô 2 (mở từ Luyện Khí) khi mới Luyện Khí = thiếu cảnh giới

/** Người chơi Kim Đan (realm 3): mở ô 2, 3, 4; ô 5 (Nguyên Anh) còn khoá. Linh lực dư. */
const ME: SlotMe = { realm: 3, tier: 0, mp: 1000, maxMp: 1000 };

function msg(over: Partial<SkillsMsg> = {}): SkillsMsg {
  return {
    learned: { [HOA]: 2, [BANG]: 1 },
    slots: [HOA, BANG, "", ""],
    cd: [0, 0, 0, 0],
    cdMax: [3000, 4000, 0, 0],
    ...over,
  };
}

function tracker(over: Partial<SkillsMsg> = {}, at = 0): SkillTracker {
  const t = new SkillTracker();
  t.set(msg(over), at);
  return t;
}

describe("SkillTracker: nhận sổ chiêu (không tin tin nhắn)", () => {
  it("chưa nhận gì: ô trống, hồi chiêu 0", () => {
    const t = new SkillTracker();
    expect(t.received).toBe(false);
    expect(t.skillAt(2)).toBe("");
    expect(t.cdLeft(2, 0)).toBe(0);
    expect(t.learnedList()).toEqual([]);
  });

  it("nhận đúng ô, tầng, danh sách theo thứ tự bảng", () => {
    const t = tracker();
    expect(t.received).toBe(true);
    expect(t.skillAt(2)).toBe(HOA);
    expect(t.skillAt(3)).toBe(BANG);
    expect(t.skillAt(4)).toBe("");
    expect(t.levelOf(HOA)).toBe(2);
    expect(t.levelOf("khong_co")).toBe(0);
    expect(t.learnedList().map((x) => x.def.id)).toEqual([HOA, BANG]);
  });

  it("tăng `version` mỗi lần nhận và khi xoá (người vẽ dựng lại danh sách)", () => {
    const t = new SkillTracker();
    const v0 = t.version;
    t.set(msg(), 0);
    expect(t.version).toBe(v0 + 1);
    t.clear();
    expect(t.version).toBe(v0 + 2);
    expect(t.received).toBe(false);
    expect(t.skillAt(2)).toBe("");
  });

  it("đếm lùi hồi chiêu theo đồng hồ client, về 0 đúng mốc, đồng hồ lùi coi như chưa trôi", () => {
    const t = tracker({ cd: [2500, 0, 0, 0] }, 1000);
    expect(t.cdLeft(2, 1000)).toBe(2500);
    expect(t.cdLeft(2, 2000)).toBe(1500);
    expect(t.cdLeft(2, 3500)).toBe(0);
    expect(t.cdLeft(2, 9999)).toBe(0);
    expect(t.cdLeft(2, 500)).toBe(2500); // đồng hồ lùi
  });

  it("rác: id lạ / độc, tầng ngoài khoảng, ô chưa học, trùng, số không hữu hạn", () => {
    const t = new SkillTracker();
    t.set(
      {
        learned: { [HOA]: 99, __proto__x: 1, constructor: 3, [BANG]: -4 },
        slots: ["constructor", HOA, HOA, "__proto__"],
        cd: [Number.NaN, -5, Infinity, "x"],
        cdMax: [Number.NaN, 7, -1, null],
      },
      0,
    );
    expect(t.levelOf(HOA)).toBe(3); // kẹp 3
    expect(t.levelOf(BANG)).toBe(1); // kẹp 1
    expect(t.levelOf("constructor")).toBe(0);
    expect(t.skillAt(2)).toBe(""); // "constructor" không phải chiêu
    expect(t.skillAt(3)).toBe(HOA); // đã học
    expect(t.skillAt(4)).toBe(""); // trùng -> bỏ
    expect(t.skillAt(5)).toBe("");
    expect(t.cdLeft(2, 0)).toBe(0); // ô 2 trống: cd 0 dù NaN
    expect(t.cdLeft(3, 0)).toBe(0); // âm -> 0
  });

  it("tin không phải đối tượng / mảng cd không phải mảng: coi như sổ rỗng", () => {
    const t = new SkillTracker();
    for (const raw of [null, undefined, 5, "x", [], { learned: 3, slots: "ab", cd: 1, cdMax: 2 }]) {
      t.set(raw, 0);
      expect(t.learnedList()).toEqual([]);
      expect(t.skillAt(2)).toBe("");
      expect(t.cdLeft(2, 0)).toBe(0);
    }
  });

  it("kẹp hồi chiêu rất lớn (không kẹt vòng quét hàng giờ) và cdMax không nhỏ hơn cd", () => {
    const t = tracker({ cd: [9e12, 5000, 0, 0], cdMax: [100, 1000, 0, 0] }, 0);
    expect(t.cdLeft(2, 0)).toBe(10 * 60 * 1000);
    expect(t.cdTotal(2)).toBe(10 * 60 * 1000);
    expect(t.cdTotal(3)).toBe(5000); // cdMax 1000 < cd 5000 -> nâng lên cd
  });
});

describe("slotView: bảy trạng thái theo thứ tự ưu tiên", () => {
  it("1. khoá: ô chưa mở ở cảnh giới này (kể cả đang gắn chiêu)", () => {
    const t = tracker({ slots: [HOA, "", "", BANG] });
    const v = slotView(5, t, ME, false, 0);
    expect(v.kind).toBe("locked");
    expect(v.canCast).toBe(false);
    expect(v.def).toBeUndefined();
    expect(v.skillId).toBe("");
    expect(unlockText(5)).toBe("Mở ở Nguyên Anh");
  });

  it("ô mở đúng ở cảnh giới mở (biên): realm = SLOT_UNLOCK_REALM mở, thấp hơn 1 khoá", () => {
    const t = tracker();
    for (const slot of BAR_SLOTS) {
      const open = SLOT_UNLOCK_REALM[slot];
      expect(slotView(slot, t, { ...ME, realm: open }, false, 0).kind).not.toBe("locked");
      expect(slotView(slot, t, { ...ME, realm: open - 1 }, false, 0).kind).toBe("locked");
    }
  });

  it("2. trống: mở nhưng chưa gắn", () => {
    const v = slotView(4, tracker(), ME, false, 0);
    expect(v.kind).toBe("empty");
    expect(v.canCast).toBe(false);
    expect(v.level).toBe(0);
  });

  it("3. thiếu cảnh giới: chiêu khắc sang kiếp mới cần cảnh giới cao hơn (`skillReqMet` của shared)", () => {
    const t = new SkillTracker();
    t.set(
      {
        learned: { [TUNG]: 1 },
        slots: [TUNG, "", "", ""],
        cd: [0, 0, 0, 0],
        cdMax: [4000, 0, 0, 0],
      },
      0,
    );
    const me: SlotMe = { realm: 1, tier: 3, mp: 1000, maxMp: 1000 };
    const v = slotView(2, t, me, false, 0);
    expect(v.kind).toBe("needRealm");
    expect(v.canCast).toBe(false);
    expect(v.def?.id).toBe(TUNG);
    expect(needText(skillOf(TUNG)!)).toBe("Cần đạt Trúc Cơ");
    // đủ cảnh giới thì dùng được
    expect(slotView(2, t, { ...me, realm: 2 }, false, 0).kind).toBe("ready");
  });

  it("4. choáng thắng hồi chiêu và thiếu linh lực, nhưng thua khoá / trống / thiếu cảnh giới", () => {
    const t = tracker({ cd: [2000, 0, 0, 0] });
    expect(slotView(2, t, ME, true, 0).kind).toBe("stunned");
    expect(slotView(2, t, { ...ME, mp: 0 }, true, 0).kind).toBe("stunned");
    expect(slotView(4, t, ME, true, 0).kind).toBe("empty"); // trống thắng choáng
    expect(slotView(5, t, ME, true, 0).kind).toBe("locked"); // khoá thắng choáng
    const tung = new SkillTracker();
    tung.set(
      { learned: { [TUNG]: 1 }, slots: [TUNG, "", "", ""], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] },
      0,
    );
    expect(slotView(2, tung, { realm: 1, tier: 0, mp: 9, maxMp: 9 }, true, 0).kind).toBe(
      "needRealm",
    );
  });

  it("5. hồi chiêu: vòng quét cdLeft / cdMax, số giây làm tròn LÊN, thắng thiếu linh lực", () => {
    const t = tracker({ cd: [2001, 0, 0, 0], cdMax: [3000, 4000, 0, 0] }, 1000);
    const v = slotView(2, t, { ...ME, mp: 0 }, false, 1000);
    expect(v.kind).toBe("cooldown");
    expect(v.canCast).toBe(false);
    expect(v.cdSec).toBe(3); // 2,001 s -> 3
    expect(v.cdFrac).toBeCloseTo(2001 / 3000, 12);
    const later = slotView(2, t, ME, false, 2001); // còn 1000 ms
    expect(later.cdSec).toBe(1);
    expect(later.cdFrac).toBeCloseTo(1000 / 3000, 12);
    // đúng mốc hết: sẵn sàng
    expect(slotView(2, t, ME, false, 3001).kind).toBe("ready");
  });

  it("vòng quét luôn trong 0..1 dù `cdMax` thiếu / nhỏ hơn", () => {
    const t = tracker({ cd: [1500, 0, 0, 0], cdMax: [0, 0, 0, 0] });
    const v = slotView(2, t, ME, false, 0);
    expect(v.cdFrac).toBe(1);
    expect(v.cdSec).toBe(2);
  });

  it("6. thiếu linh lực: mp < skillMpCost; đúng bằng thì đủ (biên)", () => {
    const t = tracker();
    const cost = skillMpCost(skillOf(HOA)!, 1000);
    expect(slotView(2, t, { ...ME, mp: cost - 1 }, false, 0).kind).toBe("noMp");
    expect(slotView(2, t, { ...ME, mp: cost }, false, 0).kind).toBe("ready");
    const v = slotView(2, t, { ...ME, mp: 0 }, false, 0);
    expect(v.mpCost).toBe(cost);
    expect(v.canCast).toBe(false);
  });

  it("linh lực không hữu hạn: không cho dùng (không gửi tin chắc chắn bị từ chối)", () => {
    const t = tracker();
    expect(slotView(2, t, { ...ME, mp: Number.NaN }, false, 0).kind).toBe("noMp");
  });

  it("7. sẵn sàng: còn lại, canCast, kèm tầng và linh lực", () => {
    const v = slotView(2, tracker(), ME, false, 0);
    expect(v.kind).toBe("ready");
    expect(v.canCast).toBe(true);
    expect(v.level).toBe(2);
    expect(v.def?.id).toBe(HOA);
    expect(v.cdSec).toBe(0);
    expect(v.cdFrac).toBe(0);
  });

  it("chỉ trạng thái `ready` mới cho gửi (canCast), mọi trạng thái khác thì không", () => {
    const t = tracker({ cd: [0, 5000, 0, 0] });
    const cases: Array<[boolean, ReturnType<typeof slotView>]> = [
      [true, slotView(2, t, ME, false, 0)],
      [false, slotView(3, t, ME, false, 0)], // hồi chiêu
      [false, slotView(4, t, ME, false, 0)], // trống
      [false, slotView(5, t, ME, false, 0)], // khoá
      [false, slotView(2, t, ME, true, 0)], // choáng
      [false, slotView(2, t, { ...ME, mp: 0 }, false, 0)], // thiếu linh lực
    ];
    for (const [can, v] of cases) expect(v.canCast).toBe(can);
  });
});

describe("chữ hiển thị: aria-label, toast, tên viết tắt", () => {
  it("aria-label đủ ý theo từng trạng thái", () => {
    const t = tracker({ cd: [3000, 0, 0, 0] }, 0);
    expect(slotAriaLabel(slotView(3, t, ME, false, 0), ["U"])).toBe(
      "Ô chiêu thức 3: Huyền Băng Chỉ, tầng 1, sẵn sàng (Phím U)",
    );
    expect(slotAriaLabel(slotView(2, t, ME, false, 0), ["L"])).toBe(
      "Ô chiêu thức 2: Hỏa Vân Kiếm, tầng 2, hồi chiêu 3 giây (Phím L)",
    );
    expect(slotAriaLabel(slotView(4, t, ME, false, 0), ["I"])).toBe(
      "Ô chiêu thức 4, còn trống (Phím I)",
    );
    expect(slotAriaLabel(slotView(5, t, ME, false, 0), ["O", "Num5"])).toBe(
      "Ô chiêu thức 5, mở ở nguyên anh (Phím O hoặc Num5)",
    );
    expect(slotAriaLabel(slotView(2, t, ME, true, 0), [])).toBe(
      "Ô chiêu thức 2: Hỏa Vân Kiếm, tầng 2, đang choáng",
    );
    expect(stateText(slotView(2, t, { ...ME, mp: 0 }, false, 5000))).toMatch(
      /^thiếu linh lực, cần \d+$/,
    );
  });

  it("toast chỉ khi chắc chắn bị từ chối mà người chơi cần biết lý do; hồi chiêu / choáng im lặng", () => {
    const t = tracker({ cd: [0, 5000, 0, 0] });
    expect(blockedToast(slotView(5, t, ME, false, 0))).toBe(
      "Ô chiêu thức 5 chưa mở: Mở ở Nguyên Anh.",
    );
    expect(blockedToast(slotView(4, t, ME, false, 0))).toBe(
      "Ô chiêu thức 4 còn trống. Gắn chiêu ở bảng Công pháp.",
    );
    expect(blockedToast(slotView(2, t, { ...ME, mp: 0 }, false, 0))).toBe("Linh lực không đủ.");
    expect(blockedToast(slotView(3, t, ME, false, 0))).toBeNull(); // hồi chiêu
    expect(blockedToast(slotView(2, t, ME, true, 0))).toBeNull(); // choáng
    expect(blockedToast(slotView(2, t, ME, false, 0))).toBeNull(); // sẵn sàng
  });

  it("toast thiếu cảnh giới nêu tên chiêu và cảnh giới cần", () => {
    const t = new SkillTracker();
    t.set(
      { learned: { [TUNG]: 1 }, slots: [TUNG, "", "", ""], cd: [0, 0, 0, 0], cdMax: [0, 0, 0, 0] },
      0,
    );
    expect(blockedToast(slotView(2, t, { realm: 1, tier: 0, mp: 9, maxMp: 9 }, false, 0))).toBe(
      "Cần đạt Trúc Cơ để dùng Thanh Tùng Phi Châm.",
    );
  });

  it("tên viết tắt <= 10 ký tự: lấy từ đầu vừa chỗ, từ đầu quá dài thì cắt thêm …", () => {
    expect(shortName("Hỏa Vân Kiếm")).toBe("Hỏa Vân");
    expect(shortName("Bôn Thạch Quyền")).toBe("Bôn Thạch");
    expect(shortName("Trọng Nhạc Trảm")).toBe("Trọng Nhạc");
    expect(shortName("Hồi Xuân")).toBe("Hồi Xuân");
    expect(shortName("Kim")).toBe("Kim");
    expect(shortName("  Kim  ")).toBe("Kim");
    expect(shortName("Nguyenabcdefgh")).toBe("Nguyenabc…");
    expect(shortName("Phiêu Phong Bộ", 7)).toBe("Phiêu");
    for (const d of SKILLS_M7) {
      const s = shortName(d.name);
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(10);
    }
  });

  it("chấm tầng 0..3; màu hệ rơi về xám khi hệ lạ", () => {
    expect(levelPips(0)).toBe(0);
    expect(levelPips(2.9)).toBe(2);
    expect(levelPips(99)).toBe(3);
    expect(levelPips(Number.NaN)).toBe(0);
    expect(elementColor("hoa")).not.toBe(elementColor("thuy"));
    expect(elementColor("constructor")).toBe(elementColor("none"));
    expect(elementColor(undefined)).toBe(elementColor("none"));
  });
});

describe("dữ liệu giả ?skills=mock", () => {
  it("chỉ bật ở DEV hoặc có ?debug", () => {
    expect(isMockSkillsEnabled("?skills=mock", true)).toBe(true);
    expect(isMockSkillsEnabled("?skills=mock", false)).toBe(false);
    expect(isMockSkillsEnabled("?skills=mock&debug=1", false)).toBe(true);
    expect(isMockSkillsEnabled("?skills=khac", true)).toBe(false);
    expect(isMockSkillsEnabled("", true)).toBe(false);
  });

  it("số chiêu mẫu 0 / 1 / 2 / 4, giá trị khác -> 4", () => {
    expect(mockSkillCount("?n=0")).toBe(0);
    expect(mockSkillCount("?n=1")).toBe(1);
    expect(mockSkillCount("?n=2")).toBe(2);
    expect(mockSkillCount("?n=4")).toBe(4);
    expect(mockSkillCount("?n=9")).toBe(4);
    expect(mockSkillCount("")).toBe(4);
  });

  it("tin mẫu qua được bộ theo dõi và cho đúng số ô gắn; ô đầu hồi chiêu khi `cdMs` > 0", () => {
    const ids = SKILLS_M7.slice(0, 5).map((d) => d.id);
    for (const n of [0, 1, 2, 4] as const) {
      const t = new SkillTracker();
      t.set(mockSkillsMsg(ids, n, 3000), 0);
      const filled = BAR_SLOTS.filter((s) => t.skillAt(s) !== "").length;
      expect(filled).toBe(n);
      if (n > 0) expect(t.cdLeft(2, 0)).toBe(Math.min(3000, skillOf(ids[0])!.cooldown));
    }
    const t = new SkillTracker();
    t.set(mockSkillsMsg(ids, 2), 0);
    expect(t.cdLeft(2, 0)).toBe(0);
  });
});

describe("aimMode: hướng đánh theo hình chiêu (A xác nhận ở #536)", () => {
  it("bộ pháp lao theo hướng di chuyển; vòng nổ / hộ thể theo hướng nhìn; còn lại nhắm mục tiêu", () => {
    expect(aimMode("dash")).toBe("move");
    expect(aimMode("nova")).toBe("facing");
    expect(aimMode("self")).toBe("facing");
    for (const s of ["cone", "line", "fan", "ground"] as const) expect(aimMode(s)).toBe("target");
  });
  it("mọi chiêu thật có một cách chọn hướng; Phiêu Phong Bộ (dash) KHÔNG nhắm quái", () => {
    for (const d of SKILLS_M7) expect(["move", "facing", "target"]).toContain(aimMode(d.shape));
    expect(aimMode(skillOf("phieu_phong_bo")!.shape)).toBe("move");
    expect(aimMode(skillOf("cuu_cung_khon_sat")!.shape)).toBe("target");
  });
});

describe("máy chủ giả: cảnh giới và cast", () => {
  it("`?realm=N` thắng; không có thì đủ mở số ô cần thấy", () => {
    expect(mockRealm("?realm=3", 4)).toBe(3);
    expect(mockRealm("?realm=0", 4)).toBe(0);
    expect(mockRealm("?realm=99", 4)).toBe(4); // không phải một chữ số -> bỏ qua
    expect(mockRealm("?realm=-1", 2)).toBe(2);
    expect(mockRealm("", 4)).toBe(4);
    expect(mockRealm("", 2)).toBe(2);
    expect(mockRealm("", 1)).toBe(1);
    expect(mockRealm("", 0)).toBe(2);
  });

  it("mockCast: đặt hồi chiêu đúng cdMax cho ô vừa dùng, im lặng khi ô trống hoặc đang hồi", () => {
    const ids = SKILLS_M7.slice(0, 5).map((d) => d.id);
    const m = mockSkillsMsg(ids, 2);
    const next = mockCast(m, 3, 0)!;
    expect(next.cd).toEqual([0, m.cdMax[1], 0, 0]);
    expect(next.slots).toEqual(m.slots);
    expect(mockCast(m, 3, 100)).toBeNull(); // đang hồi
    expect(mockCast(m, 4, 0)).toBeNull(); // ô trống
    expect(m.cd).toEqual([0, 0, 0, 0]); // không sửa tin cũ
  });
});

describe("máy chủ giả: mockAssign dùng đúng luật assignSlot của shared", () => {
  const ids = SKILLS_M7.slice(0, 5).map((d) => d.id);
  it("gắn vào ô mở: slots đổi, cdMax tính lại theo tầng; chiêu đang ở ô khác thì ĐỔI chỗ (ô cũ trống)", () => {
    const m = mockSkillsMsg(ids, 2); // ô 2, 3 gắn ids[0], ids[1]
    const next = mockAssign(m, 4, ids[0], 4)!;
    expect(next.slots).toEqual(["", ids[1], ids[0], ""]);
    expect(next.cdMax[2]).toBe(skillCooldownMs(skillOf(ids[0])!, next.learned[ids[0]], 0));
    expect(next.cdMax[0]).toBe(0);
    expect(m.slots).toEqual([ids[0], ids[1], "", ""]); // không sửa tin cũ
  });
  it("gỡ ('') và từ chối: ô chưa mở, chiêu chưa học, ô lạ", () => {
    const m = mockSkillsMsg(ids, 2);
    expect(mockAssign(m, 2, "", 4)!.slots).toEqual(["", ids[1], "", ""]);
    expect(mockAssign(m, 5, ids[0], 3)).toBeNull(); // ô 5 khoá ở Kim Đan
    expect(mockAssign(m, 4, "khong_co", 4)).toBeNull();
    expect(mockAssign(m, 9, ids[0], 4)).toBeNull();
    expect(mockAssign(m, 4, SKILLS_M7[9].id, 4)).toBeNull(); // chiêu thật nhưng CHƯA học (mock chỉ học 5 chiêu đầu)
  });
  it("hồi chiêu đang chạy của ô còn chiêu được giữ, ô trống về 0", () => {
    const m = { ...mockSkillsMsg(ids, 2, 2000) };
    const next = mockAssign(m, 4, ids[1], 4)!; // ids[1] chuyển sang ô 4, ô 3 trống
    expect(next.cd[0]).toBe(2000);
    expect(next.cd[1]).toBe(0);
  });
});
