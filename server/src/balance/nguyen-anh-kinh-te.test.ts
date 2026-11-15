// Mô hình kinh tế + nhịp Nguyên Anh (M7.9): giữ mục tiêu ở `docs/PHAN_CONG_M7.md` mục 10 và các bất biến của bảng
// "Nguyên Anh sau nội dung" trong `docs/CAN_BANG.md`. Số cụ thể do `can-bang-sync.test.ts` giữ (tệp tài liệu khớp bản sinh).
import { describe, expect, it } from "vitest";
import {
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NGUYEN_ANH_RECIPES,
  WILD_MONSTERS,
  buyPrice,
  sellPrice,
} from "@tien-gioi/shared";
import { ASSUME, huntRate } from "./simulate";
import { BOSS_PARTY } from "./kim-dan-kinh-te";
import {
  NGUYEN_ANH_BOSS_ID,
  NGUYEN_ANH_MATERIALS,
  NGUYEN_ANH_MONSTER_IDS,
  PILL_TIER3,
  bossCoinPerHour,
  feeHours,
  materialShare,
  nguyenAnhBo,
  nguyenAnhEconomy,
  nguyenAnhPacing,
  nguyenAnhSolo,
  renderNguyenAnhSau,
  spendableCoinPerHour,
  withNguyenAnh,
} from "./nguyen-anh-kinh-te";

const NA = 4;

describe("giả định và phạm vi của mô hình Nguyên Anh", () => {
  it("mọi loài Nguyên Anh và trùm có thời gian tìm quái riêng (không rơi về mặc định 10 giây)", () => {
    for (const id of [...NGUYEN_ANH_MONSTER_IDS, NGUYEN_ANH_BOSS_ID])
      expect(ASSUME.searchSec[id], id).toBeGreaterThan(0);
    // trùm cũng chỉ vài con cả bản đồ như Hắc Giao: không được lạc quan hơn Hắc Giao
    expect(ASSUME.searchSec[NGUYEN_ANH_BOSS_ID]).toBeGreaterThanOrEqual(ASSUME.searchSec.hac_giao);
    // loài thường lấy theo loài Kim Đan cùng vai: không nhanh hơn loài Kim Đan nhanh nhất
    for (const id of NGUYEN_ANH_MONSTER_IDS)
      expect(ASSUME.searchSec[id], id).toBeGreaterThanOrEqual(ASSUME.searchSec.suong_ho);
  });

  it("withNguyenAnh thêm bốn loài (không thêm trùm) rồi khôi phục danh sách săn, kể cả khi ném lỗi", () => {
    const before = WILD_MONSTERS.map((m) => m.id);
    withNguyenAnh(() => {
      const ids = WILD_MONSTERS.map((m) => m.id);
      for (const id of NGUYEN_ANH_MONSTER_IDS) expect(ids).toContain(id);
      expect(ids).not.toContain(NGUYEN_ANH_BOSS_ID);
    });
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
    expect(() =>
      withNguyenAnh(() => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
  });
});

describe("nhịp cả cảnh giới Nguyên Anh", () => {
  const pace = withNguyenAnh(() => nguyenAnhPacing());

  it("6-9 giờ solo (mục tiêu PHAN_CONG_M7 mục 10)", () => {
    expect(pace.hours).toBeGreaterThanOrEqual(6);
    expect(pace.hours).toBeLessThanOrEqual(9);
  });

  it("ba bậc, mỗi bậc săn một loài Nguyên Anh (không quay về bãi Kim Đan, không chỉ đả tọa)", () => {
    expect(pace.tiers).toHaveLength(3);
    for (const t of pace.tiers)
      expect(NGUYEN_ANH_MONSTER_IDS as readonly string[], t.label).toContain(t.source);
  });

  it("Dư âm tu hành làm bậc ngắn lại (tốc độ tu vi nhân lên)", () => {
    const fast = nguyenAnhPacing(2);
    expect(fast.hours).toBeLessThan(pace.hours);
  });
});

describe("săn solo Nguyên Anh", () => {
  const solo = withNguyenAnh(() => nguyenAnhSolo());

  it("mỗi bậc có ít nhất ba loài an toàn; Độc Tước (đòn nặng nhất) là loài DUY NHẤT chưa an toàn ở Sơ kỳ", () => {
    for (let t = 0; t < 3; t++) {
      const safe = NGUYEN_ANH_MONSTER_IDS.filter((id) => solo[id][t]);
      expect(safe.length, `bậc ${t}`).toBeGreaterThanOrEqual(3);
    }
    expect(solo.doc_tuoc[0]).toBeNull();
    for (const id of ["han_lang", "phong_nha", "cot_tuong"]) expect(solo[id][0], id).not.toBeNull();
    expect(solo.doc_tuoc[1]).not.toBeNull();
  });

  it("bãi không lệch quá ~2x về Linh thạch / giờ giữa các loài cùng bậc, và tu vi / giờ không quá ~1,5x loài chậm nhất an toàn", () => {
    for (let t = 0; t < 3; t++) {
      const cells = NGUYEN_ANH_MONSTER_IDS.map((id) => solo[id][t]).filter((c) => c !== null);
      const coin = cells.map((c) => c.coinPerHour);
      const exp = cells.map((c) => c.expPerHour);
      expect(Math.max(...coin) / Math.min(...coin), `Linh thạch bậc ${t}`).toBeLessThanOrEqual(2);
      expect(Math.max(...exp) / Math.min(...exp), `tu vi bậc ${t}`).toBeLessThanOrEqual(1.6);
    }
  });

  it("khí huyết mất / trận giảm dần theo bậc (mặc đồ tốt hơn, lớn hơn) và người chơi không bao giờ mất quá nửa", () => {
    for (const id of NGUYEN_ANH_MONSTER_IDS) {
      const d = solo[id].filter((c) => c !== null).map((c) => c.danger);
      for (let i = 0; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(0.5);
      for (let i = 1; i < d.length; i++) expect(d[i], id).toBeLessThan(d[i - 1]);
    }
  });
});

describe("trùm Thiên Hàn Vương theo đội", () => {
  const boss = MONSTER_BY_ID[NGUYEN_ANH_BOSS_ID];

  it("đội 4 an toàn ở cả ba bậc, đội 3 an toàn từ Trung kỳ, một người và đội 2 thì không", () => {
    for (let t = 0; t < 3; t++) {
      expect(huntRate(boss, NA, t, BOSS_PARTY), `đội 4 bậc ${t}`).not.toBeNull();
      expect(huntRate(boss, NA, t, 1), `một người bậc ${t}`).toBeNull();
      expect(huntRate(boss, NA, t, 2), `đội 2 bậc ${t}`).toBeNull();
    }
    expect(huntRate(boss, NA, 0, 3)).toBeNull();
    expect(huntRate(boss, NA, 1, 3)).not.toBeNull();
    expect(huntRate(boss, NA, 2, 3)).not.toBeNull();
  });

  it("tiền trùm chia đội kiếm MỖI NGƯỜI ít hơn săn solo (nên săn trùm lấy Châu có giá, không phải đường làm giàu)", () => {
    const solo = withNguyenAnh(() => nguyenAnhSolo());
    for (let t = 0; t < 3; t++) {
      const best = Math.max(...NGUYEN_ANH_MONSTER_IDS.map((id) => solo[id][t]?.coinPerHour ?? 0));
      expect(bossCoinPerHour(t), `bậc ${t}`).toBeGreaterThan(0);
      expect(bossCoinPerHour(t), `bậc ${t}`).toBeLessThan(best);
    }
  });
});

describe("kinh tế bộ IV", () => {
  const eco = withNguyenAnh(() => nguyenAnhEconomy());
  const totalFee = NGUYEN_ANH_RECIPES.reduce((n, r) => n + (r.coin ?? 0), 0);

  it("một bộ duy nhất, đủ năm món, tổng phí khớp công thức", () => {
    expect(eco.bo).toHaveLength(1);
    expect(eco.bo[0].recipes).toHaveLength(5);
    expect(eco.bo[0].fee).toBe(totalFee);
    expect(eco.tiers.at(-1)!.feeCumulative).toBe(totalFee);
  });

  it("nguyên liệu bộ IV đúng bằng đầu vào công thức, không bán (không vào thu nhập khả dụng)", () => {
    const need = new Set(eco.bo[0].materials.map((m) => m.itemId));
    expect(need).toEqual(NGUYEN_ANH_MATERIALS);
    // Hàn Lang rơi nguyên liệu rèn: thu nhập khả dụng thấp hơn tổng thu nhập đúng bằng giá bán nguyên liệu
    const raw = withNguyenAnh(() => nguyenAnhSolo()).han_lang[1]!.coinPerHour;
    const spend = withNguyenAnh(() => spendableCoinPerHour("han_lang", 1))!;
    expect(spend).toBeLessThan(raw);
    expect(sellPrice("han_lang_mao")).toBeGreaterThan(0);
  });

  it("nguyên liệu không phải nút cổ chai: cày đủ mất dưới một nửa thời gian bậc đầu", () => {
    expect(materialShare(eco, 0)).toBeGreaterThan(0);
    expect(materialShare(eco, 0)).toBeLessThan(0.5);
  });

  it("phí rèn luôn cao hơn giá bán thành phẩm và trả đủ trước hết Trung kỳ (không chặn người chơi quá một bậc)", () => {
    for (const r of NGUYEN_ANH_RECIPES)
      expect(r.coin ?? 0, r.output.itemId).toBeGreaterThan(sellPrice(r.output.itemId));
    expect(eco.tiers[1].surplus).toBeGreaterThanOrEqual(0);
  });

  it("săn trùm theo đội lấy Thiên Hàn Châu ở Sơ kỳ làm hụt thu nhập bậc đó so với toàn bộ thời gian săn solo", () => {
    const t = eco.tiers[0];
    expect(eco.bo[0].bossHours).toBeGreaterThan(0);
    expect(t.earned).toBeLessThan((t.minutes / 60) * t.coinPerHour);
  });

  it("thu nhập cộng dồn tăng đều theo bậc và Linh thạch / giờ khả dụng tăng theo nguồn tốt hơn", () => {
    for (let i = 1; i < eco.tiers.length; i++) {
      expect(eco.tiers[i].cumulative).toBeGreaterThan(eco.tiers[i - 1].cumulative);
      expect(eco.tiers[i].coinPerHour).toBeGreaterThanOrEqual(eco.tiers[i - 1].coinPerHour);
    }
    expect(eco.carry).toBeGreaterThanOrEqual(0);
  });

  it("một viên đan cấp 3 chỉ tốn dưới 5% thu nhập một giờ (chỗ xả tuỳ chọn, không chặn)", () => {
    expect(ITEM_BY_ID[PILL_TIER3]).toBeDefined();
    expect(buyPrice(PILL_TIER3)).toBeGreaterThan(0);
    expect(buyPrice(PILL_TIER3)).toBeLessThan(eco.tiers[0].coinPerHour * 0.05);
  });

  it("phí cả bộ IV là vài giờ thu nhập Sơ kỳ, không phải vài phút hay vài chục giờ", () => {
    expect(feeHours(eco)).toBeGreaterThan(0.5);
    expect(feeHours(eco)).toBeLessThan(6);
  });

  it("nhịp và phí cùng nguồn với `nguyenAnhBo` (một nguồn sự thật)", () => {
    const bo = withNguyenAnh(() => nguyenAnhBo());
    expect(bo[0].soloHours).toBeCloseTo(eco.bo[0].soloHours, 9);
    expect(bo[0].bossHours).toBeGreaterThan(0); // Thiên Hàn Châu chỉ rơi từ trùm
  });
});

describe("mục Markdown của docs/CAN_BANG.md", () => {
  it("có đủ bốn mục con và nêu câu hỏi chưa chốt về Linh thạch dư", () => {
    const md = renderNguyenAnhSau();
    expect(md).toContain("## Nguyên Anh sau nội dung");
    for (const h of ["### 1.", "### 2.", "### 3.", "### 4."]) expect(md).toContain(h);
    expect(md).toContain("CHƯA CHỐT");
    // mọi loài Nguyên Anh hiện đủ trong bảng săn solo
    for (const id of NGUYEN_ANH_MONSTER_IDS) expect(md).toContain(MONSTER_BY_ID[id].name);
  });
});
