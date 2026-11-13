// Kinh tế và trang bị Kim Đan (M6, #406 mục 2 và 3), đo bằng mô hình cân bằng: chỗ tiêu Linh thạch cân với thu nhập, ba bộ tăng đều,
// không bộ nào bắt buộc hay vô dụng. Mục tiêu ở docs/PHAN_CONG_M6.md và issue #406.
import { describe, expect, it } from "vitest";
import { ITEMS, KIM_DAN_RECIPES, MONSTER_BY_ID } from "@tien-gioi/shared";
import { bestGear, monsterEconomy } from "./simulate";
import {
  BOSS_PARTY,
  KIM_DAN_MATERIALS,
  bestDropper,
  bossCoinPerHourOf,
  boStat,
  kimDanEconomy,
  kimDanGearEffect,
  materialShare,
  minGearRatio,
  renderKimDanKinhTe,
  shortfallHours,
  spendableCoinPerHour,
  withGearUpTo,
} from "./kim-dan-kinh-te";

const eco = kimDanEconomy();
const gear = kimDanGearEffect();

describe("kinh tế Kim Đan: chi (phí rèn) cân với thu nhập", () => {
  it("nguyên liệu phải giữ lại là đúng bốn loại của ba bộ; nguồn cày: quái thường nếu có, trùm chỉ cho Giao Lân", () => {
    expect([...KIM_DAN_MATERIALS].sort()).toEqual([
      "doc_nang",
      "giao_lan",
      "quy_giap",
      "suong_mao",
    ]);
    expect(bestDropper("suong_mao")).toBe("suong_ho");
    expect(bestDropper("quy_giap")).toBe("thach_quy");
    expect(bestDropper("doc_nang")).toBe("doc_thiem"); // Hắc Giao cũng rơi nhưng không ai đi tìm trùm theo đội để lấy thứ săn solo được
    expect(bestDropper("giao_lan")).toBe("hac_giao");
    expect(MONSTER_BY_ID[bestDropper("giao_lan")].boss).toBe(true);
  });

  it("tổng phí các bộ khớp dữ liệu: 3 bộ x 3 món, cộng đúng `RecipeDef.coin`", () => {
    expect(eco.bo.map((b) => b.recipes.length)).toEqual([3, 3, 3]);
    expect(eco.bo.reduce((n, b) => n + b.fee, 0)).toBe(
      KIM_DAN_RECIPES.reduce((n, r) => n + (r.coin ?? 0), 0),
    );
  });

  it("bộ I trả được trong Sơ kỳ, bộ I + II trong Trung kỳ (không bị chặn ở bộ đầu)", () => {
    expect(eco.tiers[0].surplus).toBeGreaterThanOrEqual(0);
    expect(eco.tiers[1].surplus).toBeGreaterThanOrEqual(0);
  });

  it("KHÔNG dư hàng vạn Linh thạch cuối Kim Đan (dư < 10.000) và KHÔNG bị chặn quá lâu (thiếu <= 3 giờ săn Hậu kỳ)", () => {
    const last = eco.tiers.at(-1)!;
    expect(last.surplus).toBeLessThan(10_000);
    expect(shortfallHours(eco)).toBeLessThanOrEqual(3);
    // cộng dồn đúng: tổng kiếm từng bậc
    expect(last.cumulative).toBeCloseTo(
      eco.tiers.reduce((n, t) => n + t.earned, 0),
      6,
    );
  });

  it("cày nguyên liệu không phải nút cổ chai: chiếm <= 60% thời gian của bậc", () => {
    for (const t of eco.tiers) expect(materialShare(eco, t.tier), t.label).toBeLessThanOrEqual(0.6);
  });

  it("săn trùm theo đội kiếm ít Linh thạch mỗi người hơn săn solo (tiền rơi chia đội, đồ một chủ); bộ III mới cần trùm", () => {
    for (const t of eco.tiers) expect(bossCoinPerHourOf(t.tier)).toBeLessThan(t.coinPerHour);
    expect(eco.bo[0].bossHours).toBe(0);
    expect(eco.bo[1].bossHours).toBe(0);
    expect(eco.bo[2].bossHours).toBeGreaterThan(0);
    expect(BOSS_PARTY).toBe(4);
  });

  it("thu nhập khả dụng: không tính nguyên liệu giữ lại, thấp hơn tổng tiền theo mô hình cũ; quái không an toàn thì null", () => {
    expect(spendableCoinPerHour("doc_thiem", 0)).toBeNull(); // Độc Thiềm chưa an toàn solo ở Sơ kỳ
    for (const t of eco.tiers) expect(t.coinPerHour).toBeGreaterThan(0);
    // Thạch Quy rơi Quy giáp (nguyên liệu giữ lại): khả dụng = tiền rơi + bán đồ KHÁC, nằm giữa chỉ-tiền-rơi và tổng tiền cũ
    const e = monsterEconomy(MONSTER_BY_ID.thach_quy, 3, 1)!;
    const spend = spendableCoinPerHour("thach_quy", 1)!;
    expect(spend).toBeGreaterThan(e.coinDropPerHour);
    expect(spend).toBeLessThan(e.totalCoinPerHour);
  });
});

describe("trang bị Kim Đan: ba bộ tăng đều, không bộ nào bắt buộc hay vô dụng", () => {
  it("withGearUpTo bỏ đúng trang bị Kim Đan từ bộ `upTo` trở đi và khôi phục ITEMS (kể cả khi ném lỗi)", () => {
    const before = ITEMS.map((i) => i.id);
    withGearUpTo(0, () => {
      expect(bestGear(3, 2).weapon).not.toMatch(/suong_vu|huyen_quy|hac_giao/);
    });
    withGearUpTo(1, () => expect(bestGear(3, 2).weapon).toBe("suong_vu_kiem"));
    withGearUpTo(2, () => expect(bestGear(3, 2).weapon).toBe("huyen_quy_kiem"));
    expect(bestGear(3, 2).weapon).toBe("hac_giao_kiem");
    expect(() =>
      withGearUpTo(0, () => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(ITEMS.map((i) => i.id)).toEqual(before);
  });

  it("mỗi bộ thêm vào đều làm nhanh hơn VÀ bớt nguy hiểm ở mọi bậc (không bộ nào vô dụng)", () => {
    for (let tier = 0; tier < 3; tier++) {
      const rows = gear.filter((g) => g.tier === tier);
      expect(rows.length).toBe(tier + 2); // không bộ nào, tới bộ I, ..., tới bộ của bậc đó
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].expPerHour, `bậc ${tier} bộ ${i}`).toBeGreaterThan(rows[i - 1].expPerHour);
        expect(rows[i].docThiemDanger, `bậc ${tier} bộ ${i}`).toBeLessThan(
          rows[i - 1].docThiemDanger,
        );
      }
    }
  });

  it("không bộ nào bắt buộc: không có bộ nào vẫn đạt >= 70% tu vi / giờ so với đủ bộ (mọi bậc, cả hai cách săn)", () => {
    expect(minGearRatio(gear)).toBeGreaterThanOrEqual(0.7);
  });

  it("sức mạnh gốc tăng đều giữa các bộ: công và khí huyết mỗi bước +10..25%, hai bước lệch nhau <= 5 điểm phần trăm", () => {
    for (const [slot, key] of [
      ["weapon", "atk"],
      ["robe", "hp"],
    ] as const) {
      const r1 = boStat(1, slot, key) / boStat(0, slot, key);
      const r2 = boStat(2, slot, key) / boStat(1, slot, key);
      for (const r of [r1, r2]) {
        expect(r, `${slot}`).toBeGreaterThanOrEqual(1.1);
        expect(r, `${slot}`).toBeLessThanOrEqual(1.25);
      }
      expect(Math.abs(r1 - r2), `${slot}`).toBeLessThanOrEqual(0.05);
    }
  });

  it("renderKimDanKinhTe: đủ mục 6 và 7, đủ ba bộ, không NaN / undefined", () => {
    const md = renderKimDanKinhTe();
    for (const w of [
      "### 6.",
      "### 7.",
      "Bộ I",
      "Bộ II",
      "Bộ III",
      "Giao lân",
      "Độc nang",
      "78,500",
    ])
      expect(md).toContain(w);
    expect(md).not.toMatch(/NaN|undefined|Infinity|\\n/);
  });
});
