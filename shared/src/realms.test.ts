import { describe, expect, it } from "vitest";
import {
  REALMS,
  realmLabel,
  stepOf,
  isLastTier,
  isPeak,
  expToNext,
  statsFor,
  breakthroughChance,
} from "./realms";

/** Toàn bộ thang cảnh giới theo thứ tự [realm, tier]. */
const ladder: [number, number][] = REALMS.flatMap((r, ri) =>
  r.tiers.map((_, ti) => [ri, ti] as [number, number]),
);

describe("thang cảnh giới", () => {
  it("bắt đầu từ Phàm Nhân, kết thúc ở Độ Kiếp", () => {
    expect(REALMS[0].name).toBe("Phàm Nhân");
    expect(REALMS.at(-1)!.name).toBe("Độ Kiếp");
    expect(REALMS[1].tiers).toHaveLength(9); // Luyện Khí tầng 1–9
  });

  it("stepOf đánh số liên tục từ 0", () => {
    ladder.forEach(([r, t], i) => expect(stepOf(r, t)).toBe(i));
    expect(stepOf(2, 0)).toBe(10); // Trúc Cơ Sơ kỳ = 1 (Phàm Nhân) + 9 (Luyện Khí)
  });

  it("realmLabel ghép tên cảnh giới và bậc", () => {
    expect(realmLabel(0, 0)).toBe("Phàm Nhân");
    expect(realmLabel(1, 2)).toBe("Luyện Khí Tầng 3");
    expect(realmLabel(2, 1)).toBe("Trúc Cơ Trung kỳ");
  });

  it("isLastTier / isPeak", () => {
    expect(isLastTier(0, 0)).toBe(true);
    expect(isLastTier(1, 7)).toBe(false);
    expect(isLastTier(1, 8)).toBe(true);
    expect(isPeak(1, 8)).toBe(false);
    const last = REALMS.length - 1;
    expect(isPeak(last, REALMS[last].tiers.length - 1)).toBe(true);
  });
});

describe("tu vi và chỉ số", () => {
  it("tu vi cần để lên bậc tăng dần", () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(expToNext(...ladder[i])).toBeGreaterThan(expToNext(...ladder[i - 1]));
    }
  });

  it("chỉ số không bao giờ giảm khi lên bậc", () => {
    for (let i = 1; i < ladder.length; i++) {
      const a = statsFor(...ladder[i - 1]);
      const b = statsFor(...ladder[i]);
      expect(b.maxHp).toBeGreaterThan(a.maxHp);
      expect(b.maxMp).toBeGreaterThan(a.maxMp);
      expect(b.atk).toBeGreaterThan(a.atk);
      expect(b.speed).toBeGreaterThanOrEqual(a.speed);
    }
  });

  it("đột phá cảnh giới lớn tạo bước nhảy rõ rệt hơn lên bậc nhỏ", () => {
    // Luyện Khí tầng 8 -> 9 (bậc nhỏ) so với Luyện Khí tầng 9 -> Trúc Cơ Sơ kỳ (cảnh giới lớn)
    const minor = statsFor(1, 8).maxHp / statsFor(1, 7).maxHp;
    const major = statsFor(2, 0).maxHp / statsFor(1, 8).maxHp;
    expect(major).toBeGreaterThan(minor);
  });

  it("Phàm Nhân khởi đầu với chỉ số như thiết kế", () => {
    expect(statsFor(0, 0)).toEqual({ maxHp: 100, maxMp: 50, atk: 10, speed: 150 });
    expect(expToNext(0, 0)).toBe(40);
  });
});

describe("xác suất đột phá", () => {
  it("nằm trong [0.15, 0.85] và giảm dần theo cảnh giới", () => {
    let prev = 1;
    for (let r = 0; r < REALMS.length; r++) {
      const c = breakthroughChance(r);
      expect(c).toBeGreaterThanOrEqual(0.15);
      expect(c).toBeLessThanOrEqual(0.85);
      expect(c).toBeLessThanOrEqual(prev);
      prev = c;
    }
  });
});
