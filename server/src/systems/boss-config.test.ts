// Cờ `BOSS_MOVES` (mục 42): mặc định TẮT, chỉ bật khi gõ đúng; giá trị lạ (gõ nhầm) không bao giờ bật ngầm.
import { describe, expect, it } from "vitest";
import { bossMovesNotice, bossMovesOf, bossMovesWarnings } from "./boss-config";

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

describe("bossMovesWarnings: giá trị lạ phải được báo lúc khởi động (không bật ngầm, cũng không im)", () => {
  it("không đặt / rỗng / bật / tắt đúng kiểu: không cảnh báo", () => {
    expect(bossMovesWarnings({})).toEqual([]);
    for (const v of [
      undefined,
      "",
      "   ",
      "on",
      "ON",
      " 1 ",
      "true",
      "Yes",
      "off",
      "OFF",
      "0",
      "false",
      "no",
    ])
      expect(bossMovesWarnings({ BOSS_MOVES: v }), String(v)).toEqual([]);
  });
  it("giá trị lạ / gõ nhầm: đúng MỘT cảnh báo, nêu nguyên giá trị đã gõ và nói đang TẮT", () => {
    for (const v of ["onn", "tru", "2", "enable", "bật", "  enable  "]) {
      const w = bossMovesWarnings({ BOSS_MOVES: v });
      expect(w, v).toHaveLength(1);
      expect(w[0], v).toContain(`BOSS_MOVES='${v.trim()}'`);
      expect(w[0], v).toContain("TẮT");
    }
  });
  it("khớp với bossMovesOf: giá trị nào bật thì không cảnh báo, giá trị nào cảnh báo thì chắc chắn tắt", () => {
    for (const v of [
      "on",
      "1",
      "true",
      "yes",
      "off",
      "0",
      "false",
      "no",
      "enable",
      "onn",
      "",
      "x",
    ]) {
      const env = { BOSS_MOVES: v };
      if (bossMovesOf(env)) expect(bossMovesWarnings(env), v).toEqual([]);
      if (bossMovesWarnings(env).length > 0) expect(bossMovesOf(env), v).toBe(false);
    }
  });
});

describe("bossMovesNotice: dòng log để kiểm sau khi triển khai", () => {
  it("bật: có dòng nêu tên BOSS_MOVES và chữ BẬT (để grep); tắt / lạ / không đặt: không có dòng", () => {
    for (const v of ["on", "1", "true", "yes"]) {
      const n = bossMovesNotice({ BOSS_MOVES: v });
      expect(n, v).toContain("BOSS_MOVES");
      expect(n, v).toContain("BẬT");
    }
    for (const v of [undefined, "", "off", "0", "enable", "onn"])
      expect(bossMovesNotice({ BOSS_MOVES: v }), String(v)).toBeNull();
  });
});
