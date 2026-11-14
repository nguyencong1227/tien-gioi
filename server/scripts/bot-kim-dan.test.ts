import { describe, expect, it } from "vitest";
import { calcStats } from "./bot-kim-dan";
import { viewOfScreen, SEARCH_VIEWS } from "../src/balance/search-check";

describe("bot-kim-dan: tiện ích đo tìm quái M6 (Issue #410)", () => {
  it("calcStats: tính đúng mean, median, min, max, stdDev", () => {
    const empty = calcStats([]);
    expect(empty.mean).toBe(0);
    expect(empty.median).toBe(0);

    const samples = [10, 20, 30, 40, 50];
    const s = calcStats(samples);
    expect(s.mean).toBe(30);
    expect(s.median).toBe(30);
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.stdDev).toBeCloseTo(14.14, 1);

    const evenSamples = [10, 20, 30, 40];
    const sEven = calcStats(evenSamples);
    expect(sEven.median).toBe(25);
  });

  it("vùng nhìn chữ nhật: lọc đúng quái trong/ngoài khung nhìn theo fitZoom", () => {
    const pc = SEARCH_VIEWS.pc; // 1280x720: hw = 568.89, hh = 320
    const botX = 1000;
    const botY = 1000;

    // Quái A: cách 400x, 200y (trong tầm nhìn PC)
    const monIn = { x: botX + 400, y: botY + 200 };
    const inDx = Math.abs(monIn.x - botX);
    const inDy = Math.abs(monIn.y - botY);
    expect(inDx <= pc.hw && inDy <= pc.hh).toBe(true);

    // Quái B: cách 400x, 400y (ngoài tầm nhìn PC vì hh = 320 < 400)
    const monOutY = { x: botX + 400, y: botY + 400 };
    const outY_Dx = Math.abs(monOutY.x - botX);
    const outY_Dy = Math.abs(monOutY.y - botY);
    expect(outY_Dx <= pc.hw && outY_Dy <= pc.hh).toBe(false);

    // Quái C: cách 700x, 100y (ngoài tầm nhìn PC vì hw = 569 < 700)
    const monOutX = { x: botX + 700, y: botY + 100 };
    const outX_Dx = Math.abs(monOutX.x - botX);
    const outX_Dy = Math.abs(monOutX.y - botY);
    expect(outX_Dx <= pc.hw && outX_Dy <= pc.hh).toBe(false);
  });

  it("vùng nhìn điện thoại dọc: hẹp ngang (hw ~ 254 px), rộng dọc (hh ~ 550 px)", () => {
    const portrait = SEARCH_VIEWS.phonePortrait; // 390x844: hw ~ 254, hh ~ 550
    expect(portrait.hw).toBeLessThan(300);
    expect(portrait.hh).toBeGreaterThan(500);

    const botX = 500;
    const botY = 500;

    // Điểm cách 350 px theo phương ngang: PC thấy nhưng Phone dọc KHÔNG thấy!
    const target = { x: botX + 350, y: botY };
    const pc = SEARCH_VIEWS.pc;
    expect(Math.abs(target.x - botX) <= pc.hw).toBe(true);
    expect(Math.abs(target.x - botX) <= portrait.hw).toBe(false);
  });
});
