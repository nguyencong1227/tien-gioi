/**
 * Thời tiết theo bản đồ (M5.3, #332 bước 2c): kế hoạch phát hạt từ kiểu bản đồ + hồ sơ chất lượng. Hàm THUẦN (không Phaser):
 * `WorldScene` chỉ gọi `planWeather` mỗi khung và phát bằng `fx.play(recipe, cx, cy, { area })`.
 *
 * Nhịp phát = số hạt / tốc độ (hạt/giây): tốc độ cao thì phát dày hơn nhưng số hạt SỐNG vẫn ~ tốc độ x tuổi thọ, và số
 * lần phát đang sống (emitter trong ngân sách) ~ tuổi thọ / nhịp, nên một thời tiết chỉ chiếm vài emitter ưu tiên 0.
 */
import type { MapStyle, WeatherKind } from "./map-style";
import { WEATHER_COUNT } from "./fx/recipes-weather";

export const WEATHER_RECIPE: Readonly<Record<Exclude<WeatherKind, "none">, string>> = {
  petals: "weather-petals",
  ash: "weather-ash",
  spirit: "weather-spirit",
};

/** Cận dưới của nhịp phát (ms): tốc độ rất cao cũng không phát dày hơn mức này. */
export const WEATHER_MIN_INTERVAL_MS = 250;
/** Vùng phát phủ thừa khung nhìn một chút để hạt trôi vào từ mép. */
export const WEATHER_AREA_MARGIN = 1.1;

/** Tốc độ hạt/giây cho hồ sơ chất lượng (`off` hoặc giảm chuyển động: 0; `light`: một nửa; `full`: đủ). */
export function weatherRate(
  w: MapStyle["weather"],
  mode: "off" | "light" | "full",
  reducedMotion: boolean,
): number {
  if (w.kind === "none" || mode === "off" || reducedMotion) return 0;
  return mode === "light" ? w.rate / 2 : w.rate;
}

/** Nhịp giữa hai lần phát (ms) để đạt `rate` hạt/giây với `count` hạt mỗi lần; `null` nếu không phát. */
export function weatherIntervalMs(rate: number, count: number = WEATHER_COUNT): number | null {
  if (!(rate > 0) || !Number.isFinite(rate)) return null;
  return Math.max(WEATHER_MIN_INTERVAL_MS, Math.round((count / rate) * 1000));
}

export interface WeatherView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WeatherPlan {
  recipe: string;
  /** Tâm vùng phát (px thế giới) = tâm khung nhìn. */
  x: number;
  y: number;
  area: { w: number; h: number };
  /** Mốc phát kế tiếp (ms, đồng hồ cảnh). */
  nextAt: number;
}

/**
 * Tới lúc phát một đợt thời tiết chưa. `nextAt` = mốc đã hẹn (undefined = lần đầu: phát ngay). Trả `null` nếu chưa tới /
 * không có thời tiết / khung nhìn hỏng.
 */
export function planWeather(
  w: MapStyle["weather"],
  mode: "off" | "light" | "full",
  reducedMotion: boolean,
  view: WeatherView,
  now: number,
  nextAt: number | undefined,
): WeatherPlan | null {
  if (w.kind === "none") return null;
  const interval = weatherIntervalMs(weatherRate(w, mode, reducedMotion));
  if (interval === null) return null;
  if (nextAt !== undefined && now < nextAt) return null;
  for (const v of [view.x, view.y, view.width, view.height]) if (!Number.isFinite(v)) return null;
  if (!(view.width > 0 && view.height > 0)) return null;
  return {
    recipe: WEATHER_RECIPE[w.kind],
    x: view.x + view.width / 2,
    y: view.y + view.height / 2,
    area: { w: view.width * WEATHER_AREA_MARGIN, h: view.height * WEATHER_AREA_MARGIN },
    nextAt: now + interval,
  };
}

/**
 * Bật / tắt một hiệu ứng môi trường CHUYỂN ĐỘNG liên tục (`name` = "weather" | "water") theo địa chỉ trang: `?<name>=1|on` bật,
 * `?<name>=0|off` tắt; không ghi gì thì BẬT trừ khi đang `?debug` (các script đo hạt sống / điểm ảnh đều chạy ở `?debug=1` và cần
 * cảnh tĩnh để ảnh đối chứng không nhiễu). e2e bật lại lúc chạy bằng thuộc tính của cảnh.
 */
export function ambientEnabledByUrl(search: string, name: string): boolean {
  const q = new URLSearchParams(search);
  const v = q.get(name);
  if (v === "1" || v === "on") return true;
  if (v === "0" || v === "off") return false;
  return !q.has("debug");
}

/** Thời tiết bằng hạt theo địa chỉ trang (xem `ambientEnabledByUrl`). */
export function weatherEnabledByUrl(search: string): boolean {
  return ambientEnabledByUrl(search, "weather");
}
