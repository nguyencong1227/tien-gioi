import { describe, expect, it } from "vitest";
import { PARTY_EXP_BONUS, PARTY_MAX, PARTY_SHARE_RANGE, partyExpShare } from "./party";

describe("partyExpShare", () => {
  it("một người: không đổi so với đánh một mình", () => {
    expect(partyExpShare(1)).toBe(1);
  });

  it("mỗi người nhận ít hơn khi đội đông, nhưng cả đội nhận nhiều hơn một người", () => {
    let prevEach = partyExpShare(1);
    let prevTotal = 1;
    for (let n = 2; n <= PARTY_MAX; n++) {
      const each = partyExpShare(n);
      expect(each).toBeLessThan(prevEach);
      expect(each * n).toBeGreaterThan(prevTotal);
      prevEach = each;
      prevTotal = each * n;
    }
    expect(partyExpShare(PARTY_MAX) * PARTY_MAX).toBeCloseTo(
      1 + PARTY_EXP_BONUS * (PARTY_MAX - 1),
      9,
    );
  });

  it("thưởng tổng của đội đủ nhỏ để không làm lệch đường cong tu luyện (< 1.5 lần)", () => {
    expect(partyExpShare(PARTY_MAX) * PARTY_MAX).toBeLessThan(1.5);
  });

  it("kẹp giá trị lạ về khoảng 1..PARTY_MAX", () => {
    expect(partyExpShare(0)).toBe(1);
    expect(partyExpShare(-3)).toBe(1);
    for (const bad of [NaN, Infinity, -Infinity]) expect(partyExpShare(bad)).toBe(1);
    expect(partyExpShare(99)).toBe(partyExpShare(PARTY_MAX));
    expect(partyExpShare(2.9)).toBe(partyExpShare(2));
  });
});

describe("hằng số tổ đội", () => {
  it("tầm chia tu vi nhỏ hơn vùng nhìn tối thiểu của server (1100 px)", () => {
    expect(PARTY_SHARE_RANGE).toBeLessThan(1100);
  });
});
