/**
 * Công thức âm thanh hiệu ứng chiến đấu M7 (#508 mục (a), A chốt 15/11: TỔNG HỢP BẰNG MÃ, KHÔNG thêm gói âm thanh, phạm vi nhỏ): chiêu theo HỆ + HÌNH, đạn tầm xa, trạng thái
 * có hại / có lợi lên chính mình. Lớp THUẦN (không Web Audio, không DOM) nên test được; `audio.ts` (`Audio.playSfx`) biến một công thức thành tiếng. Mỗi công thức là vài
 * "thành phần" (dao động một âm trượt từ f0 tới f1) cộng tuỳ chọn một đợt nhiễu lọc: ngắn (<= `SFX_MAX_S`), nhỏ (tổng biên độ <= `SFX_MAX_GAIN`), để không át tiếng chém /
 * trúng / báo trước đã có và không phá ngân sách âm lượng. Không có tin mạng mới, không đoán kết quả: chỉ là tiếng đi kèm hiệu ứng hình đã có.
 */
import type { SkillShape } from "@tien-gioi/shared";

export interface SfxPartial {
  wave: "sine" | "triangle" | "square" | "sawtooth";
  /** Tần số đầu / cuối (Hz): trượt theo hàm mũ */
  f0: number;
  f1: number;
  /** Trễ so với lúc bắt đầu và độ dài (giây) */
  at: number;
  dur: number;
  /** Biên độ đỉnh (0..1, trước hệ số âm lượng chung) */
  vol: number;
}
export interface SfxNoise {
  at: number;
  dur: number;
  vol: number;
  /** Bộ lọc thông thấp (Hz): thấp = ù ù, cao = xì xào */
  lp: number;
}
export interface SfxRecipe {
  partials: SfxPartial[];
  noise?: SfxNoise;
}

/** Giới hạn mọi công thức: độ dài (giây, kể cả trễ), tổng biên độ, dải tần nghe được an toàn */
export const SFX_MAX_S = 0.6;
export const SFX_MAX_GAIN = 0.62;
export const SFX_MIN_HZ = 40;
export const SFX_MAX_HZ = 6000;

const p = (
  wave: SfxPartial["wave"],
  f0: number,
  f1: number,
  dur: number,
  vol: number,
  at = 0,
): SfxPartial => ({ wave, f0, f1, at, dur, vol });

/** Âm nền theo HỆ (id của `ELEMENTS`); hệ lạ / `none` dùng âm vô sắc */
const BY_ELEMENT: Readonly<Record<string, SfxRecipe>> = {
  kim: { partials: [p("square", 1250, 880, 0.14, 0.2), p("triangle", 1880, 1320, 0.2, 0.16)] }, // kim loại: keng
  moc: {
    partials: [p("sine", 360, 540, 0.18, 0.24)],
    noise: { at: 0, dur: 0.16, vol: 0.14, lp: 1800 },
  }, // cành lá: vút nhẹ
  thuy: { partials: [p("sine", 760, 340, 0.2, 0.3), p("sine", 1140, 520, 0.14, 0.12, 0.03)] }, // nước: bõm
  hoa: {
    partials: [p("sawtooth", 230, 90, 0.22, 0.2)],
    noise: { at: 0, dur: 0.24, vol: 0.2, lp: 2600 },
  }, // lửa: phụt
  tho: { partials: [p("triangle", 120, 52, 0.26, 0.4)] }, // đất: thịch
  bang: {
    partials: [p("sine", 1500, 2300, 0.22, 0.26), p("triangle", 2250, 3000, 0.14, 0.1, 0.02)],
  }, // băng: leng keng
  phong: {
    partials: [p("sine", 420, 760, 0.2, 0.14)],
    noise: { at: 0, dur: 0.22, vol: 0.2, lp: 3600 },
  }, // gió: vù
  loi: { partials: [p("sawtooth", 110, 980, 0.1, 0.22), p("square", 760, 140, 0.16, 0.14, 0.05)] }, // sét: tách tách
  am: { partials: [p("sine", 150, 110, 0.3, 0.26), p("sine", 156, 114, 0.3, 0.2)] }, // âm: ù lệch pha (phách)
  none: { partials: [p("triangle", 520, 300, 0.16, 0.26)] },
};

/** Biến đổi theo HÌNH chiêu (hệ số độ dài / âm lượng và âm thêm) */
function shaped(base: SfxRecipe, shape: SkillShape): SfxRecipe {
  const scale = (r: SfxRecipe, dur: number, vol: number): SfxRecipe => ({
    partials: r.partials.map((x) => ({ ...x, dur: x.dur * dur, at: x.at * dur, vol: x.vol * vol })),
    ...(r.noise
      ? {
          noise: {
            ...r.noise,
            dur: r.noise.dur * dur,
            at: r.noise.at * dur,
            vol: r.noise.vol * vol,
          },
        }
      : {}),
  });
  switch (shape) {
    case "dash": // bộ pháp: vút nhanh, nhỏ
      return scale({ ...base, noise: { at: 0, dur: 0.16, vol: 0.18, lp: 4200 } }, 0.7, 0.8);
    case "nova": // vòng nổ: to, dài, thêm thịch trầm
      return {
        ...scale(base, 1.5, 1),
        partials: [...scale(base, 1.5, 0.9).partials, p("triangle", 90, 45, 0.3, 0.3)],
      };
    case "ground": // đặt xuống đất: thịch trầm
      return {
        ...scale(base, 1.2, 0.9),
        partials: [...scale(base, 1.2, 0.9).partials, p("sine", 85, 48, 0.28, 0.3)],
      };
    case "self": // hộ thể: chuông êm dâng lên
      return { partials: [p("sine", 440, 660, 0.3, 0.26), p("sine", 660, 990, 0.3, 0.14, 0.05)] };
    case "fan": // toả nhiều tia: hai nhịp ngắn
      return {
        partials: [
          ...scale(base, 0.6, 0.85).partials,
          ...scale(base, 0.6, 0.7).partials.map((x) => ({ ...x, at: x.at + 0.1 })),
        ],
      };
    case "line": // tia thẳng: gọn, hơi rít
      return scale(base, 0.85, 1);
    case "cone": // quạt trước mặt: nguyên bản
    default:
      return scale(base, 1, 1);
  }
}

/** Công thức tiếng DÙNG CHIÊU theo hệ (`SkillDef.element`) và hình (`SkillDef.shape`). */
export function castSfx(element: unknown, shape: unknown): SfxRecipe {
  const base =
    BY_ELEMENT[
      typeof element === "string" && Object.hasOwn(BY_ELEMENT, element) ? element : "none"
    ];
  const sh: SkillShape =
    shape === "dash" ||
    shape === "nova" ||
    shape === "ground" ||
    shape === "self" ||
    shape === "fan" ||
    shape === "line"
      ? shape
      : "cone";
  return clampRecipe(shaped(base, sh));
}

/** Công thức tiếng ĐẠN của quái tầm xa bắn ra (màu theo `boltElement`): vút ngắn, nhỏ hơn tiếng chiêu của mình. */
export function boltSfx(element?: unknown): SfxRecipe {
  const base =
    BY_ELEMENT[
      typeof element === "string" && Object.hasOwn(BY_ELEMENT, element) ? element : "none"
    ];
  return clampRecipe({
    partials: base.partials.map((x) => ({
      ...x,
      dur: x.dur * 0.7,
      at: x.at * 0.7,
      vol: x.vol * 0.55,
    })),
    noise: { at: 0, dur: 0.14, vol: 0.12, lp: 3000 },
  });
}

/**
 * Công thức tiếng khi MÌNH dính một trạng thái mới (`StatusKind` của `shared`): có hại thì trầm, gắt, báo hiệu; có lợi (khiên, tăng tốc, hồi phục) thì chuông êm.
 * Loại lạ -> `null` (im lặng).
 */
export function statusSfx(kind: unknown, harmful: boolean): SfxRecipe | null {
  switch (kind) {
    case "stun":
      return clampRecipe({
        partials: [p("square", 210, 120, 0.22, 0.26), p("sawtooth", 160, 80, 0.26, 0.18, 0.04)],
      });
    case "dot":
      return clampRecipe({
        partials: [p("sawtooth", 300, 170, 0.2, 0.2)],
        noise: { at: 0, dur: 0.18, vol: 0.12, lp: 1500 },
      });
    case "slow":
      return clampRecipe({ partials: [p("sine", 520, 240, 0.28, 0.26)] });
    case "vuln":
      return clampRecipe({
        partials: [p("triangle", 640, 360, 0.2, 0.26), p("triangle", 430, 240, 0.2, 0.18, 0.08)],
      });
    case "shield":
    case "haste":
    case "regen":
    case "breakAid":
    case "amp":
    case "cdr":
      return clampRecipe({
        partials: [p("sine", harmful ? 330 : 523, harmful ? 250 : 784, 0.26, 0.24)],
      });
    default:
      return null;
  }
}

/** Sáu khoảnh khắc của một con TRÙM có tiếng riêng (mục 42, T4 #873): gồng chiêu, đòn rơi, đổi giai đoạn, cuồng nộ, dựng giáp, gọi quái con. */
export type BossSfxKind = "cast" | "strike" | "phase" | "enrage" | "armor" | "summon";

/**
 * Công thức tiếng của TRÙM, trầm và nặng hơn mọi tiếng chiêu thường để nhận ra ngay "đây là trùm" kể cả khi nhìn chỗ khác; sắc theo HỆ của chiêu (`element`; hệ lạ -> vô sắc):
 *   - `cast` (gồng): gầm trầm dâng lên (nặng dần, cùng nhịp với thân co thấp ở `boss-cast-anim.ts`) cộng sắc hệ nhỏ ở trên;
 *   - `strike` (đòn rơi): thịch trầm + sắc hệ + một đợt nhiễu ngắn;
 *   - `phase` (đổi giai đoạn): tiếng gầm dài, trầm, rung;
 *   - `enrage` (cuồng nộ): còi gắt hai nhịp trên nền trầm.
 *   - `armor` (dựng giáp): tiếng kim loại ngân hai nốt cao trên nền trầm; `summon` (gọi quái con): hồn bốc lên, hai nốt trầm lệch phách + hơi gió.
 * Loại lạ -> `null` (im lặng, như `statusSfx`). Vẫn bị `clampRecipe` ép vào giới hạn chung (ngắn, nhỏ, trong dải tần).
 */
export function bossSfx(kind: unknown, element?: unknown): SfxRecipe | null {
  const base =
    BY_ELEMENT[
      typeof element === "string" && Object.hasOwn(BY_ELEMENT, element) ? element : "none"
    ];
  const tint = (vol: number, at: number, dur: number): SfxPartial[] =>
    base.partials
      .slice(0, 2)
      .map((x) => ({ ...x, at, dur: Math.min(dur, x.dur * 2), vol: x.vol * vol }));
  switch (kind) {
    case "cast":
      return clampRecipe({
        partials: [p("sawtooth", 62, 118, 0.55, 0.3), ...tint(0.55, 0.1, 0.4)],
      });
    case "strike":
      return clampRecipe({
        partials: [p("triangle", 110, 42, 0.3, 0.42), ...tint(0.7, 0, 0.3)],
        noise: { at: 0, dur: 0.2, vol: 0.18, lp: 1400 },
      });
    case "phase":
      return clampRecipe({
        partials: [p("sawtooth", 96, 52, 0.58, 0.32), p("square", 71, 48, 0.55, 0.14, 0.02)],
        noise: { at: 0.02, dur: 0.5, vol: 0.2, lp: 700 },
      });
    case "armor": // dựng giáp: tiếng kim loại ngân (hai nốt cao chồng lên nền trầm)
      return clampRecipe({
        partials: [
          p("square", 880, 1320, 0.22, 0.2),
          p("triangle", 1320, 1760, 0.3, 0.16, 0.06),
          p("sawtooth", 80, 70, 0.4, 0.2),
        ],
      });
    case "summon": // gọi quái con: hồn bốc lên, hai nốt trầm lệch phách kèm hơi gió
      return clampRecipe({
        partials: [p("sine", 100, 260, 0.5, 0.26), p("sine", 106, 275, 0.5, 0.2, 0.04)],
        noise: { at: 0.05, dur: 0.45, vol: 0.14, lp: 1100 },
      });
    case "enrage":
      return clampRecipe({
        partials: [
          p("square", 660, 430, 0.16, 0.26),
          p("square", 660, 430, 0.16, 0.26, 0.2),
          p("sawtooth", 70, 55, 0.5, 0.2),
        ],
      });
    default:
      return null;
  }
}

/** Ép mọi công thức vào giới hạn (độ dài, tổng biên độ, dải tần): kẻ gọi sai số liệu cũng không phát ra tiếng quá to / quá dài / ngoài dải. */
export function clampRecipe(r: SfxRecipe): SfxRecipe {
  const hz = (f: number): number =>
    Math.min(SFX_MAX_HZ, Math.max(SFX_MIN_HZ, Number.isFinite(f) ? f : 440));
  const partials = r.partials.slice(0, 4).map((x) => {
    const at = Math.max(0, Math.min(SFX_MAX_S - 0.02, x.at));
    return {
      ...x,
      f0: hz(x.f0),
      f1: hz(x.f1),
      at,
      dur: Math.max(0.02, Math.min(SFX_MAX_S - at, x.dur)),
      vol: Math.max(0, Math.min(1, x.vol)),
    };
  });
  let noise: SfxNoise | undefined;
  if (r.noise) {
    const at = Math.max(0, Math.min(SFX_MAX_S - 0.02, r.noise.at));
    noise = {
      at,
      dur: Math.max(0.02, Math.min(SFX_MAX_S - at, r.noise.dur)),
      vol: Math.max(0, Math.min(1, r.noise.vol)),
      lp: hz(r.noise.lp),
    };
  }
  const total = partials.reduce((a, x) => a + x.vol, 0) + (noise?.vol ?? 0);
  if (total > SFX_MAX_GAIN) {
    const k = SFX_MAX_GAIN / total;
    for (const x of partials) x.vol *= k;
    if (noise) noise.vol *= k;
  }
  return noise ? { partials, noise } : { partials };
}

/** Thời gian ngắn nhất giữa hai lần phát CÙNG loại (giây): chống dồn khi nhiều chiêu / đạn cùng lúc */
export const SFX_MIN_GAP_S = 0.05;
