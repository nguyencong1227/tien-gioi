// Giữ đường cong tu luyện trong mục tiêu của #28. Sửa số liệu trong shared/ mà test này đỏ
// thì xem lại docs/CAN_BANG.md (chạy `npm run can-bang -w server`).
import { describe, expect, it } from "vitest";
import {
  MONSTERS,
  MONSTER_BY_ID,
  PARTY_MAX,
  TRADE_BY_ID,
  DROP_TABLES,
  buyPrice,
  expToNext,
  killExp,
  meditateExpPerSec,
} from "@tien-gioi/shared";
import {
  bestOption,
  huntRate,
  minutesToFinish,
  partyRatio,
  simulate,
  expectedCoinDrop,
  expectedLootValue,
  expectedTotalCoin,
  monsterEconomy,
  simulateReincarnationMilestones,
  simulateReincarnationProgression,
} from "./simulate";

describe("đường cong tu luyện", () => {
  const rows = simulate();

  it("hết Luyện Khí khoảng 1 giờ (50–70 phút)", () => {
    const m = minutesToFinish(rows, 1);
    expect(m).toBeGreaterThanOrEqual(50);
    expect(m).toBeLessThanOrEqual(70);
  });

  it("hết Trúc Cơ khoảng 3 giờ (2 giờ 40 – 3 giờ 20)", () => {
    const m = minutesToFinish(rows, 2);
    expect(m).toBeGreaterThanOrEqual(160);
    expect(m).toBeLessThanOrEqual(200);
  });

  it("không bậc Luyện Khí nào quá nhanh hoặc quá lâu (2–10 phút)", () => {
    for (const r of rows.filter((x) => x.realm === 1)) {
      expect(r.minutes, r.label).toBeGreaterThanOrEqual(2);
      expect(r.minutes, r.label).toBeLessThanOrEqual(10);
    }
  });

  it("săn quái luôn nhanh hơn chỉ ngồi đả tọa", () => {
    for (const r of rows) expect(r.source, r.label).not.toBe("đả tọa");
  });

  it("quái mạnh hơn được ưa chuộng khi đủ sức: Hôi Lang từ Luyện Khí, Hắc Hổ khi đủ an toàn", () => {
    expect(bestOption(1, 0).source).toBe("lang");
    const firstSafeHo = rows.find((r) => huntRate(MONSTER_BY_ID.ho, r.realm, r.tier));
    expect(firstSafeHo && bestOption(firstSafeHo.realm, firstSafeHo.tier).source).toBe("ho");
  });
});

describe("tu vi khi hạ quái", () => {
  it("quái không quá thấp so với người chơi thì đủ tu vi; thấp hơn nhiều thì giảm, tối thiểu 25%", () => {
    const lang = MONSTER_BY_ID.lang; // cấp 1
    expect(killExp(lang, 1, 0)).toBe(lang.exp);
    expect(killExp(lang, 1, 4)).toBe(lang.exp); // cao hơn 4 bậc: chưa giảm
    expect(killExp(lang, 1, 5)).toBe(Math.round(lang.exp * 0.85));
    expect(killExp(lang, 5, 0)).toBe(Math.round(lang.exp * 0.25));
  });

  it("đả tọa: mỗi cảnh giới tốn nhiều thời gian hơn cho một thanh tu vi", () => {
    const secPerBar = (realm: number) => expToNext(realm, 0) / meditateExpPerSec(realm, 0);
    expect(secPerBar(1)).toBeGreaterThan(secPerBar(0));
    expect(secPerBar(2)).toBeGreaterThan(secPerBar(1));
    expect(secPerBar(3)).toBeGreaterThan(secPerBar(2));
  });
});

describe("đi theo đội (mô hình, #74)", () => {
  const rows = simulate();

  it("đội 1 người cho đúng kết quả đánh một mình ở mọi bậc", () => {
    for (const r of rows) {
      expect(partyRatio(r.realm, r.tier, 1).ratio, r.label).toBe(1);
      for (const m of MONSTERS) {
        expect(huntRate(m, r.realm, r.tier, 1)?.rate, `${r.label} ${m.id}`).toBe(
          huntRate(m, r.realm, r.tier)?.rate,
        );
      }
    }
  });

  it("đội đông thì quái nào một người đánh được, cả đội cũng đánh được (mỗi người chịu ít sát thương hơn)", () => {
    for (const r of rows) {
      for (const m of MONSTERS) {
        if (!huntRate(m, r.realm, r.tier)) continue;
        for (let n = 2; n <= PARTY_MAX; n++) {
          expect(huntRate(m, r.realm, r.tier, n), `${r.label} ${m.id} đội ${n}`).not.toBeNull();
        }
      }
    }
  });

  it("đội đánh được quái mà một người chưa dám (có ít nhất một bậc đội chọn quái khác người lẻ)", () => {
    const differ = rows.filter((r) => {
      const p = partyRatio(r.realm, r.tier, PARTY_MAX);
      return p.party !== p.solo;
    });
    expect(differ.length).toBeGreaterThan(0);
  });
});

describe("kinh tế Linh thạch (mô hình, #102)", () => {
  const rows = simulate();

  it("mọi quái đều có kỳ vọng rơi tiền và đồ bán được > 0; quái mạnh hơn rơi nhiều hơn", () => {
    for (const m of MONSTERS) {
      expect(expectedCoinDrop(m.id), m.id).toBeGreaterThan(0);
      expect(expectedLootValue(m.id), m.id).toBeGreaterThan(0);
      expect(expectedTotalCoin(m.id), m.id).toBeGreaterThan(0);
    }
    const order = ["tho", "lang", "ho", "mang"];
    for (let i = 1; i < order.length; i++) {
      expect(expectedTotalCoin(order[i]!), `${order[i]} vs ${order[i - 1]}`).toBeGreaterThan(
        expectedTotalCoin(order[i - 1]!),
      );
    }
  });

  it("thu nhập Linh thạch mỗi giờ tăng khi người chơi mạnh lên (giết quái nhanh hơn, ít tốn máu hồi phục hơn)", () => {
    const thoPham = monsterEconomy(MONSTER_BY_ID.tho, 0, 0)!;
    const thoLuyenKhi = monsterEconomy(MONSTER_BY_ID.tho, 1, 0)!;
    const thoTrucCo = monsterEconomy(MONSTER_BY_ID.tho, 2, 0)!;
    expect(thoLuyenKhi.totalCoinPerHour).toBeGreaterThan(thoPham.totalCoinPerHour);
    expect(thoTrucCo.totalCoinPerHour).toBeGreaterThan(thoLuyenKhi.totalCoinPerHour);
  });

  it("hai bãi quái cùng cấp 1 (Thỏ và Sói) không lệch quá 2× thu nhập ở mọi bậc an toàn", () => {
    for (const r of rows) {
      const ecoTho = monsterEconomy(MONSTER_BY_ID.tho, r.realm, r.tier);
      const ecoLang = monsterEconomy(MONSTER_BY_ID.lang, r.realm, r.tier);
      if (!ecoTho || !ecoLang) continue;
      const ratio = ecoLang.totalCoinPerHour / ecoTho.totalCoinPerHour;
      expect(ratio, `${r.label}: lang/tho`).toBeGreaterThan(1);
      expect(ratio, `${r.label}: lang/tho`).toBeLessThanOrEqual(2);
    }
  });

  it("đổi nguyên liệu lấy đan rẻ hơn mua đan bằng tiền (tính theo số quái cần diệt để có 1 đan)", () => {
    const trade = TRADE_BY_ID["doi_hoi_huyet"]!;
    const tradeItem = trade.give[0]!;
    const drop = DROP_TABLES.tho!.find((d) => d.itemId === tradeItem.itemId)!;
    const avgMaterial = drop.chance * ((drop.min + drop.max) / 2);
    const killsToTrade = tradeItem.qty / avgMaterial;

    const potionPrice = buyPrice(trade.get.itemId);
    const killsToBuy = potionPrice / expectedTotalCoin("tho");
    expect(killsToTrade).toBeLessThan(killsToBuy);
  });
});

describe("cân bằng luân hồi (mô hình, #151)", () => {
  const milestones = simulateReincarnationMilestones();
  const progression = simulateReincarnationProgression(15);

  it("mọi mốc kết thúc từ Luyện Khí 5 trở lên có tốc độ Duyên / giờ tương đương nhau (~25–50 Duyên/h)", () => {
    // Bỏ qua Luyện Khí 1 (quá sớm 9 phút, chỉ 2-8 Duyên)
    const validMilestones = milestones.slice(1);
    for (const m of validMilestones) {
      expect(m.duyenWithBoss, `${m.label} duyen`).toBeGreaterThanOrEqual(18);
      expect(m.duyenPerHourWithBoss, `${m.label} rate`).toBeGreaterThanOrEqual(25);
      expect(m.duyenPerHourWithBoss, `${m.label} rate`).toBeLessThanOrEqual(55);
    }
  });

  it("Duyên nhận được tăng dần theo tiến độ đạt được trong kiếp", () => {
    for (let i = 1; i < milestones.length; i++) {
      expect(milestones[i]!.duyenZeroBoss).toBeGreaterThan(milestones[i - 1]!.duyenZeroBoss);
      expect(milestones[i]!.duyenWithBoss).toBeGreaterThan(milestones[i - 1]!.duyenWithBoss);
    }
  });

  it("chuỗi kiếp mở dần Dư âm tu hành đạt tối đa (+100%) sau 12–16 kiếp", () => {
    const maxLife = progression.find((p) => p.duAmLevel === 10);
    expect(maxLife).toBeDefined();
    expect(maxLife!.kiep).toBeGreaterThanOrEqual(12);
    expect(maxLife!.kiep).toBeLessThanOrEqual(16);
  });

  it("tốc độ Duyên / giờ qua các kiếp khi max Dư âm tu hành không vượt quá 2× kiếp đầu (kiểm soát lạm phát)", () => {
    const first = progression[0]!;
    const last = progression.at(-1)!;
    expect(last.ratioToFirstLife).toBeGreaterThanOrEqual(1.5);
    expect(last.ratioToFirstLife).toBeLessThanOrEqual(2.0);
    expect(first.duyenPerHour).toBeGreaterThanOrEqual(25);
    expect(last.duyenPerHour).toBeLessThanOrEqual(60);
  });
});
