// Cờ AMBUSH và AMBUSH_BOTS (mục 52, CD9 #1069): mặc định TẮT, giá trị lạ coi là TẮT và có cảnh báo; bật thì có dòng log. Cùng khuôn `boss-config.test.ts`.
import { describe, expect, it } from "vitest";
import {
  AMBUSH_MIN_POTIONS_MAX,
  ambushBotsOn,
  ambushMinPotions,
  ambushNotice,
  ambushOn,
  ambushWarnings,
} from "./ambush-config";
import { startupWarnings } from "../startup";

describe("AMBUSH (gặp chặn đường)", () => {
  it("mặc định (không đặt / rỗng) là TẮT, không cảnh báo, không log", () => {
    for (const env of [{}, { AMBUSH: "" }, { AMBUSH: "   " }]) {
      expect(ambushOn(env)).toBe(false);
      expect(ambushBotsOn(env)).toBe(false);
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
      expect(ambushBotsOn({ AMBUSH_BOTS: v }), v).toBe(false);
      expect(ambushWarnings({ AMBUSH: v })).toEqual([]);
      expect(ambushWarnings({ AMBUSH_BOTS: v })).toEqual([]);
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

  it("AMBUSH_BOTS: mặc định TẮT, bật với on/1/true/yes, giá trị lạ cảnh báo", () => {
    expect(ambushBotsOn({})).toBe(false);
    expect(ambushBotsOn({ AMBUSH_BOTS: "on" })).toBe(true);
    expect(ambushBotsOn({ AMBUSH_BOTS: " 1 " })).toBe(true);
    expect(ambushBotsOn({ AMBUSH_BOTS: "false" })).toBe(false);

    // Bật cả AMBUSH và AMBUSH_BOTS thì notice có ghi chú bot
    expect(ambushNotice({ AMBUSH: "on", AMBUSH_BOTS: "on" })).toContain("AMBUSH_BOTS");
    // AMBUSH tắt thì notice luôn null dù AMBUSH_BOTS bật
    expect(ambushNotice({ AMBUSH: "off", AMBUSH_BOTS: "on" })).toBeNull();

    // Giá trị lạ
    const wb = ambushWarnings({ AMBUSH_BOTS: "bat_len" });
    expect(wb).toHaveLength(1);
    expect(wb[0]).toContain("AMBUSH_BOTS='bat_len'");
    expect(startupWarnings({ AMBUSH_BOTS: "bat_len" } as NodeJS.ProcessEnv).join("\n")).toContain(
      "AMBUSH_BOTS='bat_len'",
    );
  });
});

describe("AMBUSH_MIN_POTIONS (CD6c): số Hồi Huyết Đan tối thiểu để bị chặn", () => {
  it("mặc định (không đặt / rỗng) là 0: không đòi, không cảnh báo, dòng log không nhắc", () => {
    for (const env of [{}, { AMBUSH_MIN_POTIONS: "" }, { AMBUSH_MIN_POTIONS: "  " }]) {
      expect(ambushMinPotions(env)).toBe(0);
      expect(ambushWarnings(env)).toEqual([]);
    }
    expect(ambushNotice({ AMBUSH: "on" })).not.toContain("AMBUSH_MIN_POTIONS");
  });

  it("số nguyên 0..8 (có khoảng trắng) được nhận; log khi BẬT nêu ngưỡng nếu > 0", () => {
    for (let n = 0; n <= AMBUSH_MIN_POTIONS_MAX; n++) {
      const env = { AMBUSH: "on", AMBUSH_MIN_POTIONS: ` ${n} ` };
      expect(ambushMinPotions(env), String(n)).toBe(n);
      expect(ambushWarnings(env)).toEqual([]);
    }
    expect(ambushNotice({ AMBUSH: "on", AMBUSH_MIN_POTIONS: "2" })).toContain(
      "dưới 2 đan hồi huyết",
    );
    expect(ambushNotice({ AMBUSH: "on", AMBUSH_MIN_POTIONS: "0" })).not.toContain("đan hồi huyết");
    // tắt AMBUSH thì không có dòng log nào dù đặt núm này
    expect(ambushNotice({ AMBUSH_MIN_POTIONS: "2" })).toBeNull();
  });

  it("giá trị lạ / âm / thập phân / quá trần coi là 0 (KHÔNG chặn ngầm) và có cảnh báo", () => {
    for (const v of ["-1", "2.5", "abc", "9", "100", "1e1", "0x2", "on"]) {
      expect(ambushMinPotions({ AMBUSH_MIN_POTIONS: v }), v).toBe(0);
      const w = ambushWarnings({ AMBUSH_MIN_POTIONS: v });
      expect(w, v).toHaveLength(1);
      expect(w[0]).toContain(`AMBUSH_MIN_POTIONS='${v}'`);
    }
  });

  it("đi vào startupWarnings của máy chủ", () => {
    expect(startupWarnings({ AMBUSH_MIN_POTIONS: "xyz" }).join("\n")).toContain(
      "AMBUSH_MIN_POTIONS='xyz'",
    );
  });
});
