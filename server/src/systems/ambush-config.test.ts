// Cờ AMBUSH (mục 52): mặc định TẮT, giá trị lạ coi là TẮT và có cảnh báo; bật thì có dòng log. Cùng khuôn `boss-config.test.ts`.
import { describe, expect, it } from "vitest";
import { ambushNotice, ambushOn, ambushWarnings } from "./ambush-config";
import { startupWarnings } from "../startup";

describe("AMBUSH (gặp chặn đường)", () => {
  it("mặc định (không đặt / rỗng) là TẮT, không cảnh báo, không log", () => {
    for (const env of [{}, { AMBUSH: "" }, { AMBUSH: "   " }]) {
      expect(ambushOn(env)).toBe(false);
      expect(ambushWarnings(env)).toEqual([]);
      expect(ambushNotice(env)).toBeNull();
    }
  });

  it("on / 1 / true / yes (không phân biệt hoa thường, có khoảng trắng) là BẬT và có dòng log", () => {
    for (const v of ["on", "ON", "1", "true", " Yes "]) {
      expect(ambushOn({ AMBUSH: v }), v).toBe(true);
      expect(ambushWarnings({ AMBUSH: v })).toEqual([]);
      expect(ambushNotice({ AMBUSH: v })).toContain("AMBUSH");
    }
  });

  it("off / 0 / false / no là TẮT, không cảnh báo", () => {
    for (const v of ["off", "0", "false", "no"]) {
      expect(ambushOn({ AMBUSH: v }), v).toBe(false);
      expect(ambushWarnings({ AMBUSH: v })).toEqual([]);
    }
  });

  it("giá trị lạ (gõ nhầm) KHÔNG bật ngầm, và cảnh báo nêu đúng giá trị; cảnh báo đi vào startupWarnings", () => {
    for (const v of ["enable", "onn", "2"]) {
      expect(ambushOn({ AMBUSH: v }), v).toBe(false);
      const w = ambushWarnings({ AMBUSH: v });
      expect(w).toHaveLength(1);
      expect(w[0]).toContain(`AMBUSH='${v}'`);
      expect(startupWarnings({ AMBUSH: v } as NodeJS.ProcessEnv).join("\n")).toContain(
        `AMBUSH='${v}'`,
      );
    }
  });
});
