// Cờ `BOSS_MOVES` (mục 42): mặc định TẮT, chỉ bật khi gõ đúng; giá trị lạ (gõ nhầm) không bao giờ bật ngầm.
import { describe, expect, it } from "vitest";
import { bossMovesOf } from "./boss-config";

describe("bossMovesOf", () => {
  it("không đặt / rỗng / tắt: false", () => {
    for (const v of [undefined, "", "   ", "off", "0", "false", "no"])
      expect(bossMovesOf({ BOSS_MOVES: v }), String(v)).toBe(false);
    expect(bossMovesOf({})).toBe(false);
  });
  it("on / 1 / true / yes (không phân biệt hoa thường, bỏ khoảng trắng): true", () => {
    for (const v of ["on", "ON", " 1 ", "true", "True", "yes", "YES"])
      expect(bossMovesOf({ BOSS_MOVES: v }), v).toBe(true);
  });
  it("giá trị lạ / gõ nhầm: false (không bật ngầm)", () => {
    for (const v of ["onn", "tru", "2", "enable", "bật"])
      expect(bossMovesOf({ BOSS_MOVES: v }), v).toBe(false);
  });
});
