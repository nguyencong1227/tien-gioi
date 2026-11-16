import { describe, expect, it } from "vitest";
import {
  BREAK_FAIL_EXP_LOSS,
  REALMS,
  breakthroughChanceWith,
  type StatusEntry,
} from "@tien-gioi/shared";
import {
  ACT_CONFIRM_GUARD_MS,
  breakAidRatio,
  breakthroughPlan,
  inConfirmGuard,
  needsSellConfirm,
  rebirthPlan,
  samePlan,
  sellPlan,
  sellStillValid,
  unlockPlan,
  unlockStillValid,
} from "./act-confirm";
import { DROP_WARN_RARITY } from "./inv-drop";

const TRUC_CO = 2;
const lastTier = (r: number) => REALMS[r].tiers.length - 1;

describe("inConfirmGuard: chống click ma", () => {
  it("trong cửa sổ thì chặn, hết cửa sổ thì cho", () => {
    expect(inConfirmGuard(1000, 1000)).toBe(true);
    expect(inConfirmGuard(1000, 1000 + ACT_CONFIRM_GUARD_MS - 1)).toBe(true);
    expect(inConfirmGuard(1000, 1000 + ACT_CONFIRM_GUARD_MS)).toBe(false);
  });
  it("đồng hồ lùi / số hỏng coi là còn trong cửa sổ (an toàn)", () => {
    expect(inConfirmGuard(5000, 1000)).toBe(true);
    expect(inConfirmGuard(Number.NaN, 1000)).toBe(true);
    expect(inConfirmGuard(-Infinity, 1000)).toBe(true);
  });
});

describe("breakAidRatio", () => {
  it("lấy cường độ đan hộ đạo còn hạn; không có / hết hạn / hỏng = 0", () => {
    expect(breakAidRatio([["dao_ho", 600_000, 0.15]])).toBeCloseTo(0.15, 12);
    expect(breakAidRatio([["haste", 5000, 0.3]])).toBe(0);
    expect(breakAidRatio([["dao_ho", 0, 0.15]])).toBe(0);
    expect(breakAidRatio([["dao_ho", 5000]])).toBe(0);
    expect(breakAidRatio([["dao_ho", 5000, Number.NaN]] as StatusEntry[])).toBe(0);
    expect(breakAidRatio([])).toBe(0);
  });
});

describe("breakthroughPlan: hộp xác nhận đột phá", () => {
  it("chưa đủ điều kiện thử (chưa tầng cuối / chưa đầy tu vi / đỉnh tiên đồ): không hỏi (máy chủ báo, không mất gì)", () => {
    expect(breakthroughPlan(TRUC_CO, 0, 100, 100, [])).toBeNull();
    expect(breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 99, 100, [])).toBeNull();
    expect(
      breakthroughPlan(REALMS.length - 1, lastTier(REALMS.length - 1), 100, 100, []),
    ).toBeNull();
    expect(breakthroughPlan(999, 0, 100, 100, [])).toBeNull();
  });

  it("đủ điều kiện: nêu cảnh giới, xác suất thành công (cùng hàm với máy chủ) và hậu quả thất bại", () => {
    const plan = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [])!;
    const want = Math.round(breakthroughChanceWith(TRUC_CO, 0) * 100);
    expect(plan.pct).toBe(want);
    expect(plan.aidPct).toBe(0);
    expect(plan.spec.text).toBe(
      `Đột phá ${REALMS[TRUC_CO].name} lên ${REALMS[TRUC_CO + 1].name}: thành công ${want}%.`,
    );
    expect(plan.spec.warn).toBe(
      `Thất bại mất ${Math.round(BREAK_FAIL_EXP_LOSS * 100)}% tu vi và nửa khí huyết.`,
    );
    expect(plan.spec.ok).toBe("Đột phá");
    expect(plan.spec.cancel).toBe("Chưa");
  });

  it("có đan hộ đạo: xác suất cao hơn, nhắc phần đã cộng; kẹp theo trần của máy chủ", () => {
    const plain = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [])!;
    const aided = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [
      ["dao_ho", 600_000, 0.15],
    ])!;
    expect(aided.pct).toBeGreaterThan(plain.pct);
    expect(aided.aidPct).toBe(aided.pct - plain.pct);
    expect(aided.spec.warn).toContain(`Đã cộng ${aided.aidPct}% từ đan hộ đạo`);
    const huge = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [["dao_ho", 600_000, 5]])!;
    expect(huge.pct).toBe(Math.round(breakthroughChanceWith(TRUC_CO, 5) * 100));
    expect(huge.pct).toBeLessThanOrEqual(95);
  });

  it("samePlan: cùng cảnh giới + cùng xác suất; đan hộ đạo hết hạn giữa chừng thì KHÁC (huỷ, lời hộp không còn đúng)", () => {
    const a = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [["dao_ho", 600_000, 0.15]]);
    const same = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, [
      ["dao_ho", 500_000, 0.15],
    ]);
    const expired = breakthroughPlan(TRUC_CO, lastTier(TRUC_CO), 100, 100, []);
    expect(samePlan(a, same)).toBe(true);
    expect(samePlan(a, expired)).toBe(false);
    expect(samePlan(a, null)).toBe(false);
    expect(samePlan(null, null)).toBe(false);
    const other = breakthroughPlan(TRUC_CO + 1, lastTier(TRUC_CO + 1), 100, 100, []);
    expect(samePlan(expired, other)).toBe(false);
  });
});

describe("bán đồ: hỏi khi là đồ quý hoặc trang bị (hàng 2 của docs/RA_SOAT_THAO_TAC.md)", () => {
  const potion = { name: "Hồi Huyết Đan", type: "consumable", rarity: 0, rarityName: "Phàm phẩm" };
  const bigPotion = {
    name: "Đại Hồi Huyết Đan",
    type: "consumable",
    rarity: 2,
    rarityName: "Bảo phẩm",
  };
  const sword = { name: "Lang Nha Kiếm", type: "equip", rarity: 0, rarityName: "Phàm phẩm" };
  const luxSword = { name: "Hắc Hổ Kiếm", type: "equip", rarity: 2, rarityName: "Bảo phẩm" };
  const slots = [
    { itemId: "hoi_huyet_dan", qty: 20 },
    { itemId: "dai_hoi_huyet_dan", qty: 5 },
    null,
    { itemId: "lang_nha_kiem", qty: 1 },
  ];

  it("chỉ trang bị hoặc bậc >= DROP_WARN_RARITY cần hỏi; đồ thường bán thẳng", () => {
    expect(needsSellConfirm(potion)).toBe(false);
    expect(needsSellConfirm({ type: "material", rarity: DROP_WARN_RARITY - 1 })).toBe(false);
    expect(needsSellConfirm({ type: "material", rarity: DROP_WARN_RARITY })).toBe(true);
    expect(needsSellConfirm(bigPotion)).toBe(true);
    expect(needsSellConfirm(sword)).toBe(true);
    expect(needsSellConfirm({ type: "consumable", rarity: Number.NaN })).toBe(false);
  });

  it("đồ thường: không có hộp (null) dù dữ liệu hợp lệ", () => {
    expect(sellPlan(slots, 0, 5, 6, potion)).toBeNull();
  });

  it("đồ quý: nêu TÊN + SỐ LƯỢNG + Linh thạch nhận + nhắc mua lại tốn hơn", () => {
    const p = sellPlan(slots, 1, 5, 30, bigPotion)!;
    expect(p.spec.text).toBe("Bán Đại Hồi Huyết Đan ×5 được 150 Linh thạch?");
    expect(p.spec.warn).toMatch(/Đồ quý: Bảo phẩm.*mua lại tốn hơn/);
    expect(p.spec.ok).toBe("Bán");
    expect(p.spec.cancel).toBe("Giữ lại");
    expect(p).toMatchObject({ index: 1, itemId: "dai_hoi_huyet_dan", qty: 5, total: 150 });
    expect(sellPlan(slots, 1, 1, 30, bigPotion)!.spec.text).toBe(
      "Bán Đại Hồi Huyết Đan được 30 Linh thạch?",
    );
  });

  it("trang bị: có hộp; trang bị quý nhắc 'Trang bị quý'", () => {
    const p = sellPlan(slots, 3, 1, 15, sword)!;
    expect(p.spec.text).toBe("Bán Lang Nha Kiếm được 15 Linh thạch?");
    expect(p.spec.warn).toMatch(/^Trang bị: bán rồi mua lại tốn hơn/);
    expect(sellPlan(slots, 3, 1, 250, luxSword)!.spec.warn).toMatch(/^Trang bị quý: Bảo phẩm/);
  });

  it("dữ liệu hỏng: null (ô trống / ngoài khoảng / số lượng thừa, thiếu, không nguyên / giá không dương)", () => {
    expect(sellPlan(slots, 2, 1, 30, bigPotion)).toBeNull(); // ô trống
    expect(sellPlan(slots, 9, 1, 30, bigPotion)).toBeNull();
    expect(sellPlan(slots, -1, 1, 30, bigPotion)).toBeNull();
    expect(sellPlan(slots, 1, 6, 30, bigPotion)).toBeNull(); // có 5, bán 6
    expect(sellPlan(slots, 1, 0, 30, bigPotion)).toBeNull();
    expect(sellPlan(slots, 1, 1.5, 30, bigPotion)).toBeNull();
    expect(sellPlan(slots, 1, 1, 0, bigPotion)).toBeNull();
    expect(sellPlan(slots, 1, 1, Number.NaN, bigPotion)).toBeNull();
  });

  it("sellStillValid: món đổi / không đủ số lượng thì huỷ, còn đúng thì cho", () => {
    const p = sellPlan(slots, 1, 5, 30, bigPotion)!;
    expect(sellStillValid(slots, p)).toBe(true);
    expect(sellStillValid([null, { itemId: "dai_hoi_huyet_dan", qty: 4 }], p)).toBe(false); // vừa dùng 1
    expect(sellStillValid([null, { itemId: "hoi_huyet_dan", qty: 20 }], p)).toBe(false); // ô giờ là món khác
    expect(sellStillValid([null, null], p)).toBe(false);
    expect(sellStillValid([], p)).toBe(false);
    expect(sellStillValid([null, { itemId: "dai_hoi_huyet_dan", qty: 9 }], p)).toBe(true); // nhặt thêm: vẫn bán đúng 5
  });
});

describe("Hoàng Tuyền: mở bằng Duyên (hàng 11) và tóm tắt đầu thai (hàng 12)", () => {
  it("unlockPlan: nêu tên + giá + Duyên còn lại, nhắc không hoàn lại", () => {
    const p = unlockPlan("Khắc chân linh nấc 2", 100, 130)!;
    expect(p.cost).toBe(100);
    expect(p.spec.text).toBe("Mở Khắc chân linh nấc 2 tốn 100 Duyên (còn lại 30)?");
    expect(p.spec.warn).toMatch(/không hoàn lại/);
    expect(p.spec.ok).toBe("Mở");
    expect(p.spec.cancel).toBe("Giữ lại");
  });

  it("unlockPlan: không đủ Duyên / giá hỏng / Duyên hỏng thì null (nút đã tắt, không hỏi)", () => {
    expect(unlockPlan("x", 100, 99)).toBeNull();
    expect(unlockPlan("x", 0, 100)).toBeNull();
    expect(unlockPlan("x", -5, 100)).toBeNull();
    expect(unlockPlan("x", 10.5, 100)).toBeNull();
    expect(unlockPlan("x", Number.NaN, 100)).toBeNull();
    expect(unlockPlan("x", 10, Number.NaN)).toBeNull();
    expect(unlockPlan("x", 10, Infinity)).toBeNull();
    expect(unlockPlan("x", 100, 100)!.spec.text).toMatch(/còn lại 0\)/); // đủ vừa
  });

  it("unlockStillValid: giá đổi / đã mở hết / Duyên không còn đủ thì HUỶ", () => {
    const p = unlockPlan("x", 100, 130)!;
    expect(unlockStillValid(p, 100, 130)).toBe(true);
    expect(unlockStillValid(p, 100, 100)).toBe(true);
    expect(unlockStillValid(p, 100, 99)).toBe(false); // vừa tiêu Duyên chỗ khác
    expect(unlockStillValid(p, 150, 500)).toBe(false); // nấc kế đắt hơn (đã mở nấc này)
    expect(unlockStillValid(p, null, 500)).toBe(false); // đã mở hết / đã sở hữu
    expect(unlockStillValid(p, 100, Number.NaN)).toBe(false);
  });

  it("rebirthPlan: tóm tắt xuất thân, số di vật giữ, số chiêu khắc; nút 'Xem lại' quay về màn chọn", () => {
    const s = rebirthPlan("Kiếm khách", 2, 1);
    expect(s.text).toBe("Đầu thai làm Kiếm khách, giữ 2 di vật, khắc 1 chiêu?");
    expect(s.warn).toMatch(/không đổi lại được/);
    expect(s.ok).toBe("Đầu thai");
    expect(s.cancel).toBe("Xem lại");
    expect(rebirthPlan("Phàm gia", 0, 0).text).toBe(
      "Đầu thai làm Phàm gia, giữ 0 di vật, khắc 0 chiêu?",
    );
  });

  it("rebirthPlan: số hỏng coi như 0, số thập phân làm tròn xuống", () => {
    expect(rebirthPlan("A", -3, Number.NaN).text).toBe(
      "Đầu thai làm A, giữ 0 di vật, khắc 0 chiêu?",
    );
    expect(rebirthPlan("A", 2.9, 1.2).text).toBe("Đầu thai làm A, giữ 2 di vật, khắc 1 chiêu?");
    expect(rebirthPlan("A", Infinity, 1).text).toBe("Đầu thai làm A, giữ 0 di vật, khắc 1 chiêu?");
  });
});
