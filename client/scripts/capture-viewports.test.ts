import { describe, expect, it } from "vitest";
import { VIEWPORTS, SCENARIOS } from "./capture-viewports.mjs";

describe("capture-viewports", () => {
  it("định nghĩa đầy đủ 7 viewports tiêu chuẩn cho đa thiết bị", () => {
    expect(VIEWPORTS.length).toBe(7);
    const ids = VIEWPORTS.map((v) => v.id);
    expect(ids).toContain("mobile-p");
    expect(ids).toContain("mobile-l");
    expect(ids).toContain("mobile-sm");
    expect(ids).toContain("tablet-p");
    expect(ids).toContain("tablet-l");
    expect(ids).toContain("desktop-hd");
    expect(ids).toContain("desktop-fhd");

    for (const vp of VIEWPORTS) {
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
      expect(vp.dpr).toBeGreaterThanOrEqual(1);
      expect(typeof vp.mobile).toBe("boolean");
    }
  });

  it("định nghĩa đầy đủ 7 kịch bản giao diện cần chụp mốc", () => {
    expect(SCENARIOS.length).toBe(7);
    const ids = SCENARIOS.map((s) => s.id);
    expect(ids).toContain("01-auth-login");
    expect(ids).toContain("02-auth-register");
    expect(ids).toContain("03-game-hud");
    expect(ids).toContain("04-game-char");
    expect(ids).toContain("05-game-inventory");
    expect(ids).toContain("06-game-settings");
    expect(ids).toContain("07-game-crowd");

    for (const sc of SCENARIOS) {
      expect(typeof sc.action).toBe("function");
      expect(["auth", "game", "crowd"]).toContain(sc.mode);
    }
  });
});
