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
  samePlan,
} from "./act-confirm";

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
