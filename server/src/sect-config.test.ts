// Cờ "kiếp mới chưa được rút" (SECT_NEWLIFE_LOCK_HOURS, docs/THIET_KE_TONG_MON.md mục 11.7): mặc định TẮT, đọc số giờ an toàn, cảnh báo khi hỏng.
import { describe, expect, it } from "vitest";
import {
  NEWLIFE_LOCK_MAX_HOURS,
  earnWarmupOf,
  newLifeLockMsOf,
  newLifeLockOf,
} from "./sect-config";
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

describe("earnWarmupOf (SECT_EARN_WARMUP, M8: chờ sang ngày mới kiếm được cống hiến)", () => {
  it("MẶC ĐỊNH BẬT: thiếu / rỗng / khoảng trắng / on / 1 / true (không phân biệt hoa thường) đều bật, không cảnh báo", () => {
    for (const raw of [undefined, "", "   ", "on", "ON", "1", "true", " True "])
      expect(earnWarmupOf({ SECT_EARN_WARMUP: raw })).toEqual({ on: true, warnings: [] });
  });

  it("off / 0 / false TẮT (chỉ dev / E2E) và NHẮC rõ không bao giờ tắt trên bản chạy thật", () => {
    for (const raw of ["off", "OFF", " Off ", "0", "false", "FALSE"]) {
      const r = earnWarmupOf({ SECT_EARN_WARMUP: raw });
      expect(r.on).toBe(false);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/KHÔNG BAO GIỜ tắt trên bản chạy thật/);
    }
  });

  it("giá trị lạ (gõ nhầm 'no', 'tat', '2'): GIỮ BẬT (an toàn) kèm cảnh báo, không tắt nhầm", () => {
    for (const raw of ["no", "tat", "2", "disable", "off1"]) {
      const r = earnWarmupOf({ SECT_EARN_WARMUP: raw });
      expect(r.on).toBe(true);
      expect(r.warnings[0]).toMatch(/không hiểu: giữ BẬT/);
    }
  });

  it("cảnh báo lúc khởi động (startupWarnings) có mặt khi tắt, không có khi bật", () => {
    expect(startupWarnings({ NODE_ENV: "production", SECT_EARN_WARMUP: "off" }).join("\n")).toMatch(
      /SECT_EARN_WARMUP=off/,
    );
    expect(startupWarnings({ NODE_ENV: "production" }).join("\n")).not.toMatch(/SECT_EARN_WARMUP/);
  });
});
