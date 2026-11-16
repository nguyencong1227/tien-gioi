// Cờ "kiếp mới chưa được rút" (SECT_NEWLIFE_LOCK_HOURS, docs/THIET_KE_TONG_MON.md mục 11.7): mặc định TẮT, đọc số giờ an toàn, cảnh báo khi hỏng.
import { describe, expect, it } from "vitest";
import { NEWLIFE_LOCK_MAX_HOURS, newLifeLockMsOf, newLifeLockOf } from "./sect-config";
import { startupWarnings } from "./startup";

const H = 3_600_000;

describe("newLifeLockOf", () => {
  it("thiếu / rỗng / toàn khoảng trắng: TẮT (0), không cảnh báo", () => {
    for (const raw of [undefined, "", "   "])
      expect(newLifeLockOf({ SECT_NEWLIFE_LOCK_HOURS: raw })).toEqual({ ms: 0, warnings: [] });
    expect(newLifeLockMsOf({})).toBe(0);
  });

  it("số giờ hợp lệ đổi ra ms (kể cả số lẻ, 0 = tắt)", () => {
    expect(newLifeLockMsOf({ SECT_NEWLIFE_LOCK_HOURS: "24" })).toBe(24 * H);
    expect(newLifeLockMsOf({ SECT_NEWLIFE_LOCK_HOURS: " 1.5 " })).toBe(1.5 * H);
    expect(newLifeLockMsOf({ SECT_NEWLIFE_LOCK_HOURS: "0" })).toBe(0);
  });

  it("hỏng (chữ, âm, NaN, vô cực): TẮT kèm cảnh báo; quá lớn thì kẹp 30 ngày kèm cảnh báo", () => {
    for (const raw of ["abc", "-3", "NaN", "Infinity", "1e999"]) {
      const r = newLifeLockOf({ SECT_NEWLIFE_LOCK_HOURS: raw });
      expect(r.ms).toBe(0);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain("SECT_NEWLIFE_LOCK_HOURS");
    }
    const big = newLifeLockOf({ SECT_NEWLIFE_LOCK_HOURS: "99999" });
    expect(big.ms).toBe(NEWLIFE_LOCK_MAX_HOURS * H);
    expect(big.warnings).toHaveLength(1);
  });

  it("cảnh báo đi vào startupWarnings", () => {
    expect(
      startupWarnings({ SECT_NEWLIFE_LOCK_HOURS: "x" }).some((w) => w.includes("SECT_NEWLIFE")),
    ).toBe(true);
    expect(startupWarnings({}).some((w) => w.includes("SECT_NEWLIFE"))).toBe(false);
  });
});
