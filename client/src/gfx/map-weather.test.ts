import { describe, expect, it } from "vitest";
import { MAP_STYLES, MAX_WEATHER_RATE, styleOf } from "./map-style";
import { getRecipe, recipeCost } from "./fx/recipes";
import { WEATHER_COUNT } from "./fx/recipes-weather";
import {
  WEATHER_AREA_MARGIN,
  WEATHER_MIN_INTERVAL_MS,
  WEATHER_RECIPE,
  planWeather,
  ambientEnabledByUrl,
  weatherEnabledByUrl,
  weatherIntervalMs,
  weatherRate,
} from "./map-weather";

const VIEW = { x: 1000, y: 500, width: 780, height: 420 };

describe("map-weather (kế hoạch thời tiết)", () => {
  it("mỗi loại thời tiết có công thức đã đăng ký, ưu tiên 0, có vùng phát, tuổi thọ <= 4000 ms", () => {
    for (const id of Object.values(WEATHER_RECIPE)) {
      const r = getRecipe(id)!;
      expect(r, id).toBeDefined();
      expect(r.priority).toBe(0);
      expect(r.particles?.zone, id).toBeDefined();
      expect(r.particles!.count).toBe(WEATHER_COUNT);
      expect(r.particles!.lifespan.max).toBeLessThanOrEqual(4000);
    }
  });

  it("mỗi bản đồ có thời tiết khớp công thức; mọi tốc độ nằm trong trần", () => {
    for (const [id, s] of Object.entries(MAP_STYLES)) {
      expect(s.weather.kind, id).not.toBe("none");
      expect(WEATHER_RECIPE[s.weather.kind as keyof typeof WEATHER_RECIPE], id).toBeDefined();
      expect(s.weather.rate).toBeLessThanOrEqual(MAX_WEATHER_RATE);
    }
  });

  it("weatherRate: tắt ở bậc Thấp / giảm chuyển động / kiểu 'none'; light = một nửa", () => {
    const w = styleOf("lac_ha").weather;
    expect(weatherRate(w, "full", false)).toBe(w.rate);
    expect(weatherRate(w, "light", false)).toBe(w.rate / 2);
    expect(weatherRate(w, "off", false)).toBe(0);
    expect(weatherRate(w, "full", true)).toBe(0);
    expect(weatherRate({ kind: "none", rate: 0 }, "full", false)).toBe(0);
  });

  it("weatherIntervalMs: = số hạt / tốc độ, cận dưới, null khi không phát / số rác", () => {
    expect(weatherIntervalMs(6, 6)).toBe(1000);
    expect(weatherIntervalMs(12, 12)).toBe(1000);
    expect(weatherIntervalMs(3, 6)).toBe(2000);
    expect(weatherIntervalMs(1000)).toBe(WEATHER_MIN_INTERVAL_MS);
    for (const bad of [0, -3, Number.NaN, Infinity]) expect(weatherIntervalMs(bad)).toBeNull();
    // Số hạt sống ~ tốc độ x tuổi thọ, số lần phát đang sống ~ tuổi thọ / nhịp: vài emitter, không phải hàng chục
    for (const [id, s] of Object.entries(MAP_STYLES)) {
      const iv = weatherIntervalMs(weatherRate(s.weather, "full", false))! / 1000;
      const life =
        getRecipe(WEATHER_RECIPE[s.weather.kind as keyof typeof WEATHER_RECIPE])!.particles!
          .lifespan.max / 1000;
      expect(life / iv, `${id}: số lần phát đang sống`).toBeLessThanOrEqual(8);
      expect(s.weather.rate * life, `${id}: số hạt sống`).toBeLessThanOrEqual(120);
    }
  });

  it("ngân sách thật: một thời tiết ở bậc Cao / Vừa chiếm <= trần ưu tiên 0 (60 %) của emitter và hạt", () => {
    const profile = {
      high: { emitters: 24, particles: 520 },
      mid: { emitters: 10, particles: 220 },
    };
    for (const [tier, lim] of Object.entries(profile)) {
      const mode = tier === "high" ? "full" : "light";
      for (const [id, s] of Object.entries(MAP_STYLES)) {
        const r = getRecipe(WEATHER_RECIPE[s.weather.kind as keyof typeof WEATHER_RECIPE])!;
        const cost = recipeCost(r);
        const iv = weatherIntervalMs(weatherRate(s.weather, mode, false))!;
        const concurrent = Math.ceil(r.particles!.lifespan.max / iv);
        expect(concurrent * cost.emitters, `${tier}/${id} emitter`).toBeLessThanOrEqual(
          lim.emitters * 0.6 * 0.5,
        );
        expect(concurrent * cost.particles, `${tier}/${id} hạt`).toBeLessThanOrEqual(
          lim.particles * 0.6 * 0.5,
        );
      }
    }
  });

  it("planWeather: phát ngay lần đầu, rồi chờ đúng nhịp; vùng phát phủ khung nhìn, tâm = tâm khung nhìn", () => {
    const w = styleOf("lac_ha").weather;
    const p = planWeather(w, "full", false, VIEW, 5000, undefined)!;
    expect(p.recipe).toBe("weather-petals");
    expect(p.x).toBe(1000 + 390);
    expect(p.y).toBe(500 + 210);
    expect(p.area.w).toBeCloseTo(780 * WEATHER_AREA_MARGIN, 6);
    expect(p.area.h).toBeCloseTo(420 * WEATHER_AREA_MARGIN, 6);
    expect(p.nextAt).toBe(5000 + weatherIntervalMs(w.rate)!);
    expect(planWeather(w, "full", false, VIEW, p.nextAt - 1, p.nextAt)).toBeNull();
    expect(planWeather(w, "full", false, VIEW, p.nextAt, p.nextAt)).not.toBeNull();
  });

  it("planWeather: null khi tắt (bậc Thấp, giảm chuyển động, kiểu none) hoặc khung nhìn hỏng", () => {
    const w = styleOf("hac_phong").weather;
    expect(planWeather(w, "off", false, VIEW, 0, undefined)).toBeNull();
    expect(planWeather(w, "full", true, VIEW, 0, undefined)).toBeNull();
    expect(planWeather({ kind: "none", rate: 0 }, "full", false, VIEW, 0, undefined)).toBeNull();
    for (const bad of [
      { ...VIEW, width: 0 },
      { ...VIEW, height: -5 },
      { ...VIEW, x: Number.NaN },
      { ...VIEW, y: Infinity },
    ])
      expect(planWeather(w, "full", false, bad, 0, undefined)).toBeNull();
  });

  it("mỗi bản đồ phát công thức khác nhau", () => {
    const rec = Object.keys(MAP_STYLES).map(
      (id) => planWeather(styleOf(id).weather, "full", false, VIEW, 0, undefined)!.recipe,
    );
    expect(new Set(rec).size).toBe(rec.length);
  });

  it("ambientEnabledByUrl: cùng luật cho từng tên (weather / water), tên khác không ảnh hưởng nhau", () => {
    expect(ambientEnabledByUrl("?debug=1", "water")).toBe(false);
    expect(ambientEnabledByUrl("?debug=1&water=1", "water")).toBe(true);
    expect(ambientEnabledByUrl("?debug=1&weather=1", "water")).toBe(false); // bật thời tiết KHÔNG bật nước
    expect(ambientEnabledByUrl("?debug=1&water=1", "weather")).toBe(false);
    expect(ambientEnabledByUrl("?water=off", "water")).toBe(false);
    expect(ambientEnabledByUrl("", "water")).toBe(true);
  });

  it("weatherEnabledByUrl: mặc định BẬT, nhưng ?debug thì TẮT trừ khi ?weather=1; ?weather=0 luôn tắt", () => {
    expect(weatherEnabledByUrl("")).toBe(true);
    expect(weatherEnabledByUrl("?perf=1")).toBe(true);
    expect(weatherEnabledByUrl("?debug=1")).toBe(false);
    expect(weatherEnabledByUrl("?debug=1&duel=mock")).toBe(false);
    expect(weatherEnabledByUrl("?debug=1&weather=1")).toBe(true);
    expect(weatherEnabledByUrl("?weather=on&debug=1")).toBe(true);
    expect(weatherEnabledByUrl("?weather=0")).toBe(false);
    expect(weatherEnabledByUrl("?weather=off")).toBe(false);
  });
});
