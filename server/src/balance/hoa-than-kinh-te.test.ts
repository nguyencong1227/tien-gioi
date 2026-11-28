// Mô hình kinh tế + nhịp Hóa Thần (D1 #1466 lát A3): giữ mục tiêu ở `docs/KHUNG_HOA_THAN.md` mục 3 và các bất biến của bảng "Hóa Thần sau nội dung"
// trong `docs/CAN_BANG.md`. Số cụ thể do `can-bang-sync.test.ts` giữ (tệp tài liệu khớp bản sinh).
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  HOA_THAN_RECIPES,
  MONSTER_BY_ID,
  REALMS,
  WILD_MONSTERS,
  sellPrice,
} from "@tien-gioi/shared";
import { ASSUME, bestGear, monsterEconomy } from "./simulate";
import {
  HOA_THAN_MATERIALS,
  HOA_THAN_MONSTER_IDS,
  feeHours,
  hoaThanBo,
  hoaThanEconomy,
  hoaThanPacing,
  hoaThanSolo,
  renderHoaThanSau,
  spendableCoinPerHour,
  withHoaThan,
} from "./hoa-than-kinh-te";

const HT = 5;

describe("giả định và phạm vi của mô hình Hóa Thần", () => {
  it("mọi sói Hóa Thần có thời gian tìm quái riêng, không nhanh hơn loài Nguyên Anh cùng bãi nhanh nhất", () => {
    for (const id of HOA_THAN_MONSTER_IDS) {
      expect(ASSUME.searchSec[id], id).toBeGreaterThan(0);
      expect(ASSUME.searchSec[id], id).toBeGreaterThanOrEqual(ASSUME.searchSec.han_lang);
    }
  });

  it("withHoaThan thêm sáu sói (không thêm gì khác ngoài loài Kim Đan / Nguyên Anh của mô hình) rồi khôi phục, kể cả khi ném lỗi", () => {
    const before = WILD_MONSTERS.map((m) => m.id);
    withHoaThan(() => {
      const ids = WILD_MONSTERS.map((m) => m.id);
      for (const id of HOA_THAN_MONSTER_IDS) expect(ids).toContain(id);
    });
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
    expect(() =>
      withHoaThan(() => {
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(WILD_MONSTERS.map((m) => m.id)).toEqual(before);
  });

  it("người chơi Hóa Thần mặc BỘ V trong mô hình (không bộ V thì mô hình báo 'không loài nào săn được': KHUNG mục 3)", () => {
    const g = bestGear(HT, 0);
    expect(g.weapon).toBe("kiem_nanh_nguyet");
    expect(g.robe).toBe("bao_huyet_nguyet");
    expect(g.talisman).toBe("phu_hon_thien_lang");
  });
});

describe("săn solo sáu sói Hóa Thần", () => {
  const solo = withHoaThan(() => hoaThanSolo());

  it("mỗi loài (trừ loài đòn nặng nhất) an toàn solo ở ít nhất một bậc, và khi an toàn thì mất <= 50 % khí huyết / trận", () => {
    let khongAnToan = 0;
    for (const id of HOA_THAN_MONSTER_IDS) {
      const cells = solo[id];
      if (cells.every((c) => c === null)) khongAnToan++;
      for (const c of cells) if (c) expect(c.danger, id).toBeLessThanOrEqual(0.5);
    }
    // như Độc Tước ở Nguyên Anh: một loài sâu nhất cố ý KHÔNG săn solo được ở mọi bậc (cần đội), không quá một loài
    expect(khongAnToan).toBeLessThanOrEqual(1);
  });

  it("tu vi / giờ tăng theo bậc ở mỗi loài an toàn; không bãi nào cho tu vi / giờ vượt 1,5 lần bãi tốt nhất còn lại cùng bậc", () => {
    for (const id of HOA_THAN_MONSTER_IDS) {
      const safe = solo[id].filter((c) => c !== null);
      for (let i = 1; i < safe.length; i++)
        expect(safe[i]!.expPerHour, id).toBeGreaterThan(safe[i - 1]!.expPerHour);
    }
    for (let tier = 0; tier < REALMS[HT].tiers.length; tier++) {
      const rates = HOA_THAN_MONSTER_IDS.map((id) => solo[id][tier]?.expPerHour ?? 0).sort(
        (a, b) => b - a,
      );
      if (rates[1] > 0) expect(rates[0] / rates[1], `bậc ${tier}`).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("nhịp và kinh tế Hóa Thần", () => {
  it("nhịp cả cảnh giới nằm trong 3,5-6 giờ (mục tiêu ~4-4,6 giờ) và mỗi bậc nguồn tốt nhất là một sói, không phải đả tọa", () => {
    const p = hoaThanPacing();
    expect(p.hours).toBeGreaterThan(3.5);
    expect(p.hours).toBeLessThan(6);
    for (const t of p.tiers)
      expect(HOA_THAN_MONSTER_IDS as readonly string[], t.label).toContain(t.source);
  });

  it("bộ V: phí = tổng phí ba công thức, nguyên liệu đủ ở sáu sói, cày nguyên liệu < thời gian Sơ kỳ ('rèn kịp trong bậc')", () => {
    const bo = withHoaThan(() => hoaThanBo());
    expect(bo.fee).toBe(HOA_THAN_RECIPES.reduce((n, r) => n + (r.coin ?? 0), 0));
    expect(bo.materials.length).toBeGreaterThanOrEqual(4);
    for (const m of bo.materials) {
      expect(HOA_THAN_MONSTER_IDS as readonly string[], m.itemId).toContain(m.source);
      expect(m.hours, m.itemId).toBeGreaterThan(0);
    }
    const eco = hoaThanEconomy();
    expect(bo.hours * 60).toBeLessThan(eco.tiers[0].minutes);
  });

  it("thu nhập trả đủ bộ V trong Sơ kỳ hoặc Trung kỳ; phí = 0,5-3 giờ thu nhập Sơ kỳ (không quá rẻ, không chặn người chơi)", () => {
    const eco = hoaThanEconomy();
    const firstOk = eco.tiers.find((t) => t.surplus >= 0);
    expect(firstOk, "bộ V không bao giờ trả đủ").toBeDefined();
    expect(firstOk!.tier).toBeLessThanOrEqual(1);
    const h = feeHours(eco);
    expect(h).toBeGreaterThan(0.5);
    expect(h).toBeLessThan(3);
  });

  it("thu nhập khả dụng KHÔNG tính nguyên liệu bộ V (giữ lại để rèn): thấp hơn tổng thu nhập nếu bán hết, và bằng tiền rơi + bán phần đồ còn lại", () => {
    withHoaThan(() => {
      for (const id of ["da_lang", "thuong_nguyet_lang"]) {
        const e = monsterEconomy(MONSTER_BY_ID[id], HT, 1)!;
        const khaDung = spendableCoinPerHour(id, 1)!;
        const mats = DROP_TABLES[id].filter((d) => HOA_THAN_MATERIALS.has(d.itemId));
        expect(mats.length, id).toBeGreaterThan(0);
        expect(khaDung, id).toBeLessThan(e.totalCoinPerHour);
        let sale = 0;
        for (const d of DROP_TABLES[id])
          if (!HOA_THAN_MATERIALS.has(d.itemId))
            sale += d.chance * ((d.min + d.max) / 2) * sellPrice(d.itemId);
        expect(khaDung, id).toBeCloseTo(e.coinDropPerHour + e.killsPerHour * sale, 6);
      }
    });
  });

  it("render Markdown có đủ ba mục và khớp số bậc / loài", () => {
    const md = renderHoaThanSau();
    expect(md).toContain("## Hóa Thần sau nội dung");
    for (const h of [
      "### 1. Săn solo",
      "### 2. Nhịp cả cảnh giới Hóa Thần",
      "### 3. Kinh tế Hóa Thần",
    ])
      expect(md).toContain(h);
    for (const id of HOA_THAN_MONSTER_IDS) expect(md).toContain(MONSTER_BY_ID[id].name);
    for (const name of REALMS[HT].tiers) expect(md).toContain(`Hóa Thần ${name}`);
  });
});
