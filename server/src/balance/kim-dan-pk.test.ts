// PK và bí cảnh ở Kim Đan (M6, #406 mục 6): bảng ở docs/CAN_BANG.md còn đúng với bậc Kim Đan và ba bộ trang bị mới.
import { describe, expect, it } from "vitest";
import { stepOf } from "@tien-gioi/shared";
import { PK_TARGET_SECONDS, duelOnce } from "./pk";
import { LINH_HU } from "./dungeon";
import { kimDanPkGaps, kimDanPkMirrors, renderKimDanPkBiCanh } from "./kim-dan-pk";
import { bestGear } from "./simulate";

const RUNS = 8;

describe("PK ở Kim Đan: hai người cùng bậc, cùng bộ trang bị", () => {
  const mirrors = kimDanPkMirrors(RUNS);

  it("mọi bậc x mọi bộ mặc được (2 + 3 + 4 = 9 dòng): trận nằm trong 25-45 giây, kể cả ca nhanh nhất / chậm nhất", () => {
    expect(mirrors).toHaveLength(2 + 3 + 4);
    for (const m of mirrors) {
      const tag = `${m.label}, bộ ${m.gearUpTo}`;
      expect(m.summary.min, `${tag} nhanh nhất`).toBeGreaterThanOrEqual(PK_TARGET_SECONDS.min);
      expect(m.summary.max, `${tag} chậm nhất`).toBeLessThanOrEqual(PK_TARGET_SECONDS.max);
    }
  });

  it("`gearUpTo` không đổi hành vi mặc định: đủ bộ mặc được = trang bị tốt nhất đủ bậc; ca cũ (không đặt `gearUpTo`) không đổi", () => {
    for (let tier = 0; tier < 3; tier++) {
      const def = duelOnce({ realm: 3, tier }, { realm: 3, tier }, 5);
      const full = duelOnce(
        { realm: 3, tier, gearUpTo: tier + 1 },
        { realm: 3, tier, gearUpTo: tier + 1 },
        5,
      );
      expect(full, `bậc ${tier}`).toEqual(def);
    }
    expect(bestGear(3, 2).weapon).toBe("hac_giao_kiem"); // ITEMS đã được khôi phục
  });
});

describe("PK ở Kim Đan: cùng bậc khác bộ", () => {
  const gaps = kimDanPkGaps(RUNS);

  it("năm ca (bậc đầu 1; trung kỳ 2; hậu kỳ 2): bên mặc bộ cao hơn thắng >= 90% và trận vẫn trong 25-45 giây", () => {
    expect(gaps).toHaveLength(1 + 2 + 2);
    for (const g of gaps) {
      expect(g.summary.winRate, `${g.label} bộ ${g.hi} vs ${g.lo}`).toBeGreaterThanOrEqual(0.9);
      expect(g.summary.median, `${g.label}`).toBeGreaterThanOrEqual(PK_TARGET_SECONDS.min);
      expect(g.summary.median, `${g.label}`).toBeLessThanOrEqual(PK_TARGET_SECONDS.max);
    }
  });

  it("chênh bộ càng lớn trận càng ngắn (bộ III thách không bộ nào nhanh hơn bộ III thách bộ II)", () => {
    const near = gaps.find((g) => g.tier === 2 && g.hi === 3 && g.lo === 2)!;
    const far = gaps.find((g) => g.tier === 2 && g.hi === 3 && g.lo === 0)!;
    expect(far.summary.median).toBeLessThan(near.summary.median);
  });
});

describe("bí cảnh Linh Hư không bị người Kim Đan đụng tới", () => {
  it("trần bậc của bí cảnh thấp hơn bậc Kim Đan sơ kỳ: người Kim Đan không vào được", () => {
    expect(LINH_HU.maxStep).toBeDefined();
    expect(stepOf(3, 0)).toBeGreaterThan(LINH_HU.maxStep!);
  });

  it("renderKimDanPkBiCanh: đủ bảng và ghi rõ Kim Đan không vào bí cảnh, không NaN / undefined / \\n", () => {
    const md = renderKimDanPkBiCanh();
    for (const w of ["### 8.", "bộ III thách bộ II", "member_high", "câu hỏi 4"])
      expect(md).toContain(w);
    expect(md).not.toMatch(/NaN|undefined|Infinity|\\n/);
    expect(md).toContain("đều nằm trong"); // mọi trận trong 25-45 giây
  });
});
