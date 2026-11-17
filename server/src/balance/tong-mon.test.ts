// Cân bằng tông môn trên BẢNG THẬT (M8.7, #844): bất biến + hàm tính của `tong-mon.ts`. Bảng thật phải sạch; mỗi luật có một ca bảng GIẢ chứng minh nó đỏ khi bị phá.
import { describe, expect, it } from "vitest";
import {
  SECT_EARN_DAY_CAP,
  SECT_LEVELS,
  SECT_SHOP,
  type SectLevelInfo,
  type SectShopEntry,
} from "@tien-gioi/shared";
import {
  SECT_MAX_HUNT_HOURS,
  renderSectEconomy,
  sectBalanceViolations,
  sectDailyMaxValue,
  sectDaysToPoints,
  sectHuntIncome,
  sectLowestIncome,
  sectShopFacts,
} from "./tong-mon";

const entry = (over: Partial<SectShopEntry> & { itemId: string }): SectShopEntry => ({
  cost: 5,
  minLevel: 1,
  limitDay: 1,
  hall: "baoKho",
  ...over,
});

describe("bảng tông môn THẬT: bất biến cân bằng (M8.7, #844)", () => {
  it("không vi phạm bất biến nào (không vòng lời, sức mua / ngày <= 1 giờ săn, buff <= 5%)", () => {
    expect(sectBalanceViolations()).toEqual([]);
  });

  it("mọi món có giá NPC và tỉ lệ hữu hạn (không NaN / Infinity lọt vào báo cáo)", () => {
    const facts = sectShopFacts();
    expect(facts).toHaveLength(SECT_SHOP.length);
    for (const f of facts) {
      expect(f.npcBuy, f.itemId).toBeGreaterThan(0);
      expect(Number.isFinite(f.valuePerCh), f.itemId).toBe(true);
      expect(Number.isFinite(f.resaleAnchor), f.itemId).toBe(true);
      expect(Number.isFinite(f.resaleDeposit), f.itemId).toBe(true);
    }
  });

  it("sức mua tối đa / ngày không giảm theo cấp tông và <= 1 giờ săn của bậc thu nhập thấp nhất", () => {
    const low = sectLowestIncome();
    let prev = 0;
    for (const l of SECT_LEVELS) {
      const v = sectDailyMaxValue(l.level);
      expect(v, `cấp ${l.level}`).toBeGreaterThanOrEqual(prev);
      expect(v / low.perHour, `cấp ${l.level}`).toBeLessThanOrEqual(SECT_MAX_HUNT_HOURS);
      prev = v;
    }
    expect(prev).toBeGreaterThan(0);
  });

  it("báo cáo sinh từ bảng thật: nêu đúng số món, đủ tên cấp, không NaN / Infinity / undefined, không dòng VI PHẠM", () => {
    const md = renderSectEconomy();
    expect(md).toContain(`(${SECT_SHOP.length} món)`);
    for (const l of SECT_LEVELS) expect(md).toContain(l.name);
    expect(md).not.toMatch(/NaN|Infinity|undefined/);
    expect(md).not.toContain("VI PHẠM");
    expect(md).toContain("**Không có vòng lời**");
  });
});

describe("hàm tính", () => {
  it("sectDaysToPoints: điểm / (người x cống hiến); không ai kiếm thì vô hạn", () => {
    expect(sectDaysToPoints(1000, 3, 140)).toBeCloseTo(1000 / 420, 10);
    expect(sectDaysToPoints(30000, 1, 90)).toBeCloseTo(333.333, 2);
    expect(sectDaysToPoints(1000, 0, 140)).toBe(Infinity);
  });

  it("sectDailyMaxValue: lấy món sức mua / cống hiến cao nhất trước, tới hạn mức ngày, kẹp theo cấp và ngân sách", () => {
    // hoi_huyet_dan: giá mua NPC 24, cost 5 -> 4,8 / cống hiến (hạn 10 = 50 cống hiến); tu_khi_dan: 180 / 30 = 6 (hạn 2 = 60 cống hiến)
    const table = [
      entry({ itemId: "hoi_huyet_dan", cost: 5, limitDay: 10, minLevel: 1 }),
      entry({ itemId: "tu_khi_dan", cost: 30, limitDay: 2, minLevel: 3 }),
    ];
    // cấp 1: chỉ đan hồi phục, 50 cống hiến x 4,8 = 240 (còn dư ngân sách vì hết hạn mức)
    expect(sectDailyMaxValue(1, table)).toBeCloseTo(240, 6);
    // cấp 3: Tụ Khí Đan trước (60 x 6 = 360) rồi đan hồi phục (50 x 4,8 = 240)
    expect(sectDailyMaxValue(3, table)).toBeCloseTo(600, 6);
    // ngân sách nhỏ hơn hạn mức: chỉ mua món tốt nhất (30 x 6)
    expect(sectDailyMaxValue(3, table, 30)).toBeCloseTo(180, 6);
    // ngân sách 80: 60 cho Tụ Khí Đan rồi 20 x 4,8
    expect(sectDailyMaxValue(3, table, 80)).toBeCloseTo(360 + 96, 6);
  });

  it("thu nhập tham chiếu: có số cho Phàm Nhân, mốc thấp nhất đúng là cực tiểu của các cảnh giới săn được", () => {
    expect(sectHuntIncome(0)).toBeGreaterThan(0);
    const low = sectLowestIncome();
    for (let r = 0; r < 10; r++) {
      const v = sectHuntIncome(r);
      if (v !== null) expect(v).toBeGreaterThanOrEqual(low.perHour);
    }
  });
});

describe("mỗi luật ĐỎ khi bảng bị phá (bảng giả)", () => {
  const withEntry = (e: SectShopEntry) => [...SECT_SHOP, e];

  it("vòng lời qua cống hiến miễn phí: bán lại NPC >= vốn neo 5 LT / cống hiến", () => {
    // Tụ Khí Đan bán lại 45 LT mà chỉ 1 cống hiến (neo 5 LT)
    const v = sectBalanceViolations(withEntry(entry({ itemId: "tu_khi_dan", cost: 1 })));
    expect(v.some((x) => x.includes("vòng lời qua cống hiến miễn phí"))).toBe(true);
  });

  it("vòng lời qua góp kho: bán lại NPC >= vốn 100 LT / cống hiến", () => {
    // Liệt Hỏa Kiếm Quyết bán lại 115 LT mà 1 cống hiến (100 LT góp kho)
    const v = sectBalanceViolations(withEntry(entry({ itemId: "kinh_liet_hoa_kiem", cost: 1 })));
    expect(v.some((x) => x.includes("vốn góp kho"))).toBe(true);
  });

  it("sức mua / ngày vượt 1 giờ săn của bậc thấp nhất", () => {
    // 100 viên Tụ Khí Đan / ngày giá 1 cống hiến: 140 x 180 = 25.200 LT / ngày
    const v = sectBalanceViolations(
      withEntry(entry({ itemId: "tu_khi_dan", cost: 1, limitDay: 100 })),
    );
    expect(v.some((x) => x.includes("giờ săn bậc thấp nhất"))).toBe(true);
    // cùng bảng THẬT nhưng mốc thu nhập thấp quá (100 LT / giờ) cũng đỏ: ngưỡng thật sự đo theo mốc truyền vào
    expect(
      sectBalanceViolations(SECT_SHOP, SECT_LEVELS, 100).some((x) =>
        x.includes("giờ săn bậc thấp nhất"),
      ),
    ).toBe(true);
  });

  it("buff tu vi: ranh giới 5% nhịp lên cảnh giới (x1,0526 sạch, x1,0527 vi phạm) và trần cứng", () => {
    const levels = (exp: number, drop = 1): SectLevelInfo[] =>
      SECT_LEVELS.map((l) => (l.level === 5 ? { ...l, buff: { ...l.buff, exp, drop } } : l));
    expect(sectBalanceViolations(SECT_SHOP, levels(1.0526))).toEqual([]);
    const over = sectBalanceViolations(SECT_SHOP, levels(1.0527));
    expect(over.some((x) => x.includes("buff tu vi"))).toBe(true);
    // vượt trần cứng x1,10 cũng bị bắt
    expect(
      sectBalanceViolations(SECT_SHOP, levels(1.2)).some((x) => x.includes("buff tu vi")),
    ).toBe(true);
  });

  it("buff rơi đồ: +5% sạch, +6% vi phạm", () => {
    const levels = (drop: number): SectLevelInfo[] =>
      SECT_LEVELS.map((l) => (l.level === 5 ? { ...l, buff: { ...l.buff, drop } } : l));
    expect(sectBalanceViolations(SECT_SHOP, levels(1.05))).toEqual([]);
    expect(
      sectBalanceViolations(SECT_SHOP, levels(1.06)).some((x) => x.includes("buff rơi đồ")),
    ).toBe(true);
  });

  it("trần kiếm hằng ngày là ngân sách mặc định của sức mua", () => {
    const table = [entry({ itemId: "tu_khi_dan", cost: 1, limitDay: 1000 })];
    // ngân sách mặc định = SECT_EARN_DAY_CAP cống hiến, mỗi cống hiến 180 LT
    expect(sectDailyMaxValue(1, table)).toBeCloseTo(SECT_EARN_DAY_CAP * 180, 6);
  });
});
