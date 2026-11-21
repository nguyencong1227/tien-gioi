// Cờ WORLD_BOSS (M9.4 / M9.10, mục 59): mặc định TẮT, giá trị lạ coi là TẮT và có cảnh báo; bật thì có dòng log. Cùng khuôn `ambush-config.test.ts`.
import { describe, expect, it } from "vitest";
import { worldBossNotice, worldBossOn, worldBossWarnings } from "./world-boss-config";
import { startupWarnings } from "../startup";

describe("WORLD_BOSS (trùm thế giới theo giờ)", () => {
  it("mặc định (không đặt / rỗng) là TẮT, không cảnh báo, không log: thêm lịch vào shared/ không tự bật bản chạy thật", () => {
    for (const env of [{}, { WORLD_BOSS: "" }, { WORLD_BOSS: "   " }]) {
      expect(worldBossOn(env)).toBe(false);
      expect(worldBossWarnings(env)).toEqual([]);
      expect(worldBossNotice(env, 2)).toBeNull();
    }
  });

  it("on / 1 / true / yes (không phân biệt hoa thường, có khoảng trắng) là BẬT", () => {
    for (const v of ["on", "ON", "1", "true", " Yes "]) {
      expect(worldBossOn({ WORLD_BOSS: v }), v).toBe(true);
      expect(worldBossWarnings({ WORLD_BOSS: v })).toEqual([]);
    }
  });

  it("off / 0 / false / no là TẮT, không cảnh báo", () => {
    for (const v of ["off", "0", "false", "no", " OFF "]) {
      expect(worldBossOn({ WORLD_BOSS: v }), v).toBe(false);
      expect(worldBossWarnings({ WORLD_BOSS: v })).toEqual([]);
      expect(worldBossNotice({ WORLD_BOSS: v }, 2)).toBeNull();
    }
  });

  it("giá trị lạ (gõ nhầm) KHÔNG bật ngầm; cảnh báo nêu đúng giá trị và đi vào startupWarnings", () => {
    for (const v of ["enable", "onn", "2", "bat"]) {
      expect(worldBossOn({ WORLD_BOSS: v }), v).toBe(false);
      const w = worldBossWarnings({ WORLD_BOSS: v });
      expect(w).toHaveLength(1);
      expect(w[0]).toContain(`WORLD_BOSS='${v}'`);
      expect(startupWarnings({ WORLD_BOSS: v } as NodeJS.ProcessEnv).join("\n")).toContain(
        `WORLD_BOSS='${v}'`,
      );
    }
  });

  it("dòng log khi bật: có lịch thì nêu số khung giờ; lịch RỖNG thì nói rõ không có sự kiện", () => {
    expect(worldBossNotice({ WORLD_BOSS: "on" }, 2)).toBe(
      "Trùm thế giới: BẬT (WORLD_BOSS, 2 khung giờ mỗi ngày)",
    );
    expect(worldBossNotice({ WORLD_BOSS: "on" }, 0)).toContain("lịch RỖNG");
    expect(worldBossNotice({ WORLD_BOSS: "on" }, 0)).toContain("Trùm thế giới");
  });
});

describe("nối vào server/src/index.ts (kiểm tĩnh: index.ts chạy khi nạp nên không import được trong test)", () => {
  it('index.ts gán `worldBoss.enabled` bằng `worldBossOn(process.env)` (không còn `!== "off"`: bật ngầm khi có lịch) và in `worldBossNotice`', async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(src).toContain("WorldRoom.hub.worldBoss.enabled = worldBossOn(process.env);");
    expect(src).not.toMatch(/WORLD_BOSS\s*!==\s*"off"/);
    expect(src).toContain("worldBossNotice(process.env, WorldRoom.hub.worldBoss.slots.length)");
  });
});
