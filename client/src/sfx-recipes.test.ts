import { describe, expect, it } from "vitest";
import { ELEMENTS, SKILLS_M7, STATUSES } from "@tien-gioi/shared";
import {
  SFX_MAX_GAIN,
  SFX_MAX_HZ,
  SFX_MAX_S,
  SFX_MIN_HZ,
  boltSfx,
  bossSfx,
  castSfx,
  clampRecipe,
  statusSfx,
  type SfxRecipe,
} from "./sfx-recipes";

const SHAPES = ["cone", "line", "fan", "nova", "ground", "dash", "self"] as const;

/** Mọi công thức hợp lệ: hữu hạn, trong dải tần, ngắn, nhỏ, có ít nhất một thành phần */
function valid(r: SfxRecipe | null): void {
  expect(r).not.toBeNull();
  const x = r as SfxRecipe;
  expect(x.partials.length).toBeGreaterThan(0);
  expect(x.partials.length).toBeLessThanOrEqual(4);
  let gain = x.noise?.vol ?? 0;
  for (const q of x.partials) {
    for (const f of [q.f0, q.f1]) {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(SFX_MIN_HZ);
      expect(f).toBeLessThanOrEqual(SFX_MAX_HZ);
    }
    expect(q.at).toBeGreaterThanOrEqual(0);
    expect(q.dur).toBeGreaterThan(0);
    expect(q.at + q.dur).toBeLessThanOrEqual(SFX_MAX_S + 1e-9);
    gain += q.vol;
  }
  if (x.noise) {
    expect(x.noise.at + x.noise.dur).toBeLessThanOrEqual(SFX_MAX_S + 1e-9);
    expect(x.noise.lp).toBeGreaterThanOrEqual(SFX_MIN_HZ);
  }
  expect(gain).toBeLessThanOrEqual(SFX_MAX_GAIN + 1e-9);
}

describe("castSfx: tiếng dùng chiêu theo hệ và hình", () => {
  it("mọi hệ x mọi hình đều hợp lệ (ngắn, nhỏ, trong dải tần)", () => {
    for (const e of ELEMENTS) for (const s of SHAPES) valid(castSfx(e.id, s));
  });
  it("mọi chiêu thật (SKILLS_M7) có tiếng hợp lệ", () => {
    for (const d of SKILLS_M7) valid(castSfx(d.element, d.shape));
  });
  it("hệ KHÁC nhau cho tiếng KHÁC nhau (cùng hình)", () => {
    const seen = new Set(ELEMENTS.map((e) => JSON.stringify(castSfx(e.id, "cone"))));
    // Phàm hệ riêng đều khác nhau; `none` có thể trùng một hệ khác nhưng không được cả chục hệ trùng nhau
    expect(seen.size).toBeGreaterThanOrEqual(ELEMENTS.length - 1);
  });
  it("hình KHÁC nhau cho tiếng KHÁC nhau (cùng hệ)", () => {
    const seen = new Set(SHAPES.map((s) => JSON.stringify(castSfx("hoa", s))));
    expect(seen.size).toBe(SHAPES.length);
  });
  it("vòng nổ dài hơn quạt; hộ thể (self) là chuông êm: chỉ sóng sin, không nhiễu", () => {
    const end = (r: SfxRecipe) => Math.max(...r.partials.map((x) => x.at + x.dur));
    expect(end(castSfx("hoa", "nova"))).toBeGreaterThan(end(castSfx("hoa", "cone")));
    const self = castSfx("hoa", "self");
    expect(self.noise).toBeUndefined();
    expect(self.partials.every((x) => x.wave === "sine")).toBe(true);
    // hộ thể không phụ thuộc hệ (cùng một chuông)
    expect(JSON.stringify(castSfx("kim", "self"))).toBe(JSON.stringify(self));
  });
  it("rác (hệ / hình lạ, constructor, kiểu sai) không ném lỗi, vẫn ra công thức hợp lệ", () => {
    for (const e of ["constructor", "__proto__", "", 7, null, undefined, {}]) {
      for (const s of ["constructor", 3, null, undefined, "xyz"]) valid(castSfx(e, s));
    }
  });
});

describe("boltSfx: tiếng đạn của quái", () => {
  it("hợp lệ ở mọi hệ và nhỏ hơn tiếng chiêu cùng hệ", () => {
    const vol = (r: SfxRecipe) => r.partials.reduce((a, x) => a + x.vol, 0);
    for (const e of ELEMENTS) {
      valid(boltSfx(e.id));
      expect(vol(boltSfx(e.id))).toBeLessThan(vol(castSfx(e.id, "line")));
    }
    valid(boltSfx(undefined));
    valid(boltSfx("constructor"));
  });
});

describe("statusSfx: tiếng khi mình dính trạng thái", () => {
  it("mọi loại trạng thái thật (STATUSES) có tiếng hợp lệ", () => {
    for (const st of STATUSES) valid(statusSfx(st.kind, st.harmful));
  });
  it("loại lạ -> im lặng (null)", () => {
    expect(statusSfx("constructor", true)).toBeNull();
    expect(statusSfx(undefined, false)).toBeNull();
    expect(statusSfx(5, true)).toBeNull();
  });
  it("lợi và hại KHÁC nhau (cùng loại khiên / tăng tốc)", () => {
    expect(JSON.stringify(statusSfx("haste", false))).not.toBe(
      JSON.stringify(statusSfx("haste", true)),
    );
  });
  it("choáng KHÁC bỏng (dot) KHÁC tê cóng (slow)", () => {
    const s = new Set(
      ["stun", "dot", "slow", "vuln"].map((k) => JSON.stringify(statusSfx(k, true))),
    );
    expect(s.size).toBe(4);
  });
});

describe("clampRecipe: kẻ gọi sai số liệu cũng không phát ra tiếng quá to / dài / ngoài dải", () => {
  it("kẹp tần số, độ dài, tổng biên độ, số thành phần; số rác (NaN, Infinity, âm)", () => {
    const bad = clampRecipe({
      partials: Array.from({ length: 9 }, () => ({
        wave: "sine" as const,
        f0: Number.NaN,
        f1: 1e9,
        at: -5,
        dur: 99,
        vol: 7,
      })),
      noise: { at: 50, dur: 50, vol: 9, lp: -3 },
    });
    valid(bad);
  });
});

describe("bossSfx: tiếng của trùm (gồng / đòn rơi / đổi giai đoạn / cuồng nộ)", () => {
  const KINDS = ["cast", "strike", "phase", "enrage"] as const;
  const lowest = (r: SfxRecipe) => Math.min(...r.partials.map((q) => Math.min(q.f0, q.f1)));

  it("mọi loại x mọi hệ đều hợp lệ (ngắn, nhỏ, trong dải tần)", () => {
    for (const k of KINDS) {
      valid(bossSfx(k));
      for (const e of ELEMENTS) valid(bossSfx(k, e.id));
    }
  });

  it("bốn loại cho bốn tiếng KHÁC nhau", () => {
    expect(new Set(KINDS.map((k) => JSON.stringify(bossSfx(k, "hoa")))).size).toBe(KINDS.length);
  });

  it("sắc theo HỆ của chiêu: gồng và đòn rơi đổi theo hệ; đổi giai đoạn / cuồng nộ không phụ thuộc hệ", () => {
    for (const k of ["cast", "strike"] as const) {
      const seen = new Set(ELEMENTS.map((e) => JSON.stringify(bossSfx(k, e.id))));
      expect(seen.size).toBeGreaterThanOrEqual(ELEMENTS.length - 1);
    }
    for (const k of ["phase", "enrage"] as const)
      expect(JSON.stringify(bossSfx(k, "hoa"))).toBe(JSON.stringify(bossSfx(k, "bang")));
  });

  it("trầm hơn tiếng chiêu thường: luôn có thành phần trầm (<= 120 Hz) mà tiếng chiêu cùng hệ không có", () => {
    for (const k of KINDS) expect(lowest(bossSfx(k, "kim")!)).toBeLessThanOrEqual(120);
    expect(lowest(castSfx("kim", "cone"))).toBeGreaterThan(120);
  });

  it("gồng dâng lên (tần số trầm tăng), đòn rơi và gầm hạ xuống", () => {
    const bass = (r: SfxRecipe) => r.partials[0]!;
    expect(bass(bossSfx("cast")!).f1).toBeGreaterThan(bass(bossSfx("cast")!).f0);
    expect(bass(bossSfx("strike")!).f1).toBeLessThan(bass(bossSfx("strike")!).f0);
    expect(bass(bossSfx("phase")!).f1).toBeLessThan(bass(bossSfx("phase")!).f0);
  });

  it("cuồng nộ là còi HAI nhịp (hai thành phần vuông cùng tần số cách nhau về thời gian)", () => {
    const sq = bossSfx("enrage")!.partials.filter((q) => q.wave === "square");
    expect(sq.length).toBe(2);
    expect(sq[1]!.at).toBeGreaterThan(sq[0]!.at + sq[0]!.dur - 1e-9);
  });

  it("loại lạ / hệ lạ / giá trị độc: loại lạ im lặng (null), hệ lạ rơi về vô sắc, không ném", () => {
    for (const bad of [undefined, null, 0, "", "constructor", "__proto__", {}, "CAST"])
      expect(bossSfx(bad, "hoa")).toBeNull();
    for (const el of ["constructor", "__proto__", 7, null, "khong_co"])
      expect(JSON.stringify(bossSfx("cast", el))).toBe(JSON.stringify(bossSfx("cast", "none")));
  });
});
