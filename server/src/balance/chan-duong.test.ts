// Mô phỏng cân bằng chặn đường (CD6 #1066, `chan-duong.ts`). Dữ liệu thật `AMBUSH_FOES` có thể còn rỗng: các ca dưới đây dùng bầy MẪU dựng tay (loài thật, bầy giả) để chứng minh
// công cụ ĐO ĐÚNG; riêng ca cuối khoá DỮ LIỆU THẬT (rỗng thì hiển nhiên đạt, E / G thêm bầy thì phải đạt mục tiêu).
import { describe, expect, it } from "vitest";
import {
  AMBUSH_FLEE_CHANNEL_MS,
  AMBUSH_FOES,
  AMBUSH_DAY_CAP,
  AMBUSH_HUNT_EXP_PER_MIN,
  AMBUSH_TIER_WEIGHTS,
  ambushRewardExp,
  type AmbushFoeGroup,
} from "@tien-gioi/shared";
import {
  ASSUME_AMBUSH,
  ambushBalanceViolations,
  ambushBalanceWarnings,
  ambushIntervalMin,
  ambushSensitivityViolations,
  atLeastOnce,
  blendedRate,
  blendedUplift,
  cautiousRow,
  fightAmbush,
  outcomeOf,
  realmRows,
  renderAmbushBalance,
  sensitivityRow,
  sensitivityRows,
  sensitivityScenarios,
  summarizeGroup,
  upliftOf,
  type AmbushFight,
  type GroupSummary,
  type SensitivityRow,
  huntExpPerMinTable,
  upliftByRealm,
} from "./chan-duong";
import { ASSUME_DUNGEON } from "./dungeon";

const group = (
  id: string,
  minStep: number,
  tier: AmbushFoeGroup["tier"],
  foes: AmbushFoeGroup["foes"],
  mapId = "lac_ha",
): AmbushFoeGroup => ({ id, name: id, mapId, minStep, maxStep: minStep + 3, tier, foes });

/** Dễ: hai Hôi Lang (cấp 1) đối đầu người bậc 1 (Luyện Khí tầng 1). */
const EASY = group("mau_de", 1, "normal", [{ kind: "lang", count: 2 }]);
/** Khó: Hắc Hổ tinh anh đối đầu người bậc 5: người chỉ đánh thường không sống nổi. */
const HARD = group("mau_kho", 5, "elite", [{ kind: "ho", count: 1 }]);

/** Đôi Thạch Quy ở Âm Sương (bậc 13): với MỘT hạt giống (1) người đủ đồ + 8 đan THẮNG, + 2 đan thì CHẾT: cặp ca thử đúng cho số đan và đồ. */
const QUY = group("mau_quy", 13, "normal", [{ kind: "thach_quy", count: 2 }], "am_suong");

const fight = (over: Partial<AmbushFight>): AmbushFight => ({
  result: "won",
  seconds: 20,
  fleeAt: null,
  exp: 0,
  coin: 0,
  potionsUsed: 0,
  ...over,
});

describe("fightAmbush: chạy đấu trường thật", () => {
  it("bầy dễ: người chơi thắng, thưởng THẬT của payRewards (tu vi + Linh thạch > 0)", () => {
    const f = fightAmbush(EASY, { step: EASY.minStep, seed: 1 });
    expect(f.result).toBe("won");
    expect(f.exp).toBe(192); // CD6b: 4 phút săn (mức thường) x 48 tu vi / phút ở bậc 1; KHÔNG theo số con trong bầy
    expect(f.coin).toBeGreaterThan(0);
    expect(f.seconds).toBeGreaterThan(1);
  });

  it("bầy khó: người chơi bị hạ (chết), không thưởng; khí huyết đã từng xuống dưới ngưỡng bỏ chạy", () => {
    const f = fightAmbush(HARD, { step: HARD.minStep, seed: 1 });
    expect(f.result).toBe("lost");
    expect(f.exp).toBe(0);
    expect(f.fleeAt).not.toBeNull();
    expect(f.fleeAt!).toBeLessThanOrEqual(f.seconds);
  });

  it("quái TẦM XA (Sương Hồ đứng bắn, lùi khi bị áp sát): người chơi phải TIẾN SÁT mới hạ được; đứng yên thì không bao giờ chạm tới", () => {
    const ranged = group("mau_xa", 13, "normal", [{ kind: "suong_ho", count: 1 }]);
    const f = fightAmbush(ranged, { step: ranged.minStep, seed: 1 });
    expect(f.result).toBe("won");
    expect(summarizeGroup(ranged, 4).toEnd.won).toBe(1);
  });

  it("tất định: cùng hạt giống cho đúng cùng kết quả; không làm rò Math.random", () => {
    const before = Math.random;
    const a = fightAmbush(EASY, { step: 1, seed: 7 });
    const b = fightAmbush(EASY, { step: 1, seed: 7 });
    expect(b).toEqual(a);
    expect(Math.random).toBe(before);
  });

  it("bản đồ không có đấu trường: ném lỗi rõ ràng và vẫn trả Math.random", () => {
    const before = Math.random;
    expect(() =>
      fightAmbush(group("x", 1, "normal", [{ kind: "lang", count: 1 }], "khong_co"), { step: 1 }),
    ).toThrow(/khong_co/);
    expect(Math.random).toBe(before);
  });

  it("người mạnh hơn thì thắng nhanh hơn (bậc cao hơn, cùng bầy)", () => {
    const low = fightAmbush(EASY, { step: 1, seed: 1 });
    const high = fightAmbush(EASY, { step: 6, seed: 1 });
    expect(high.result).toBe("won");
    expect(high.seconds).toBeLessThan(low.seconds);
  });
});

describe("outcomeOf: cách chơi suy từ MỘT trận 'tới cùng'", () => {
  const ch = AMBUSH_FLEE_CHANNEL_MS / 1000;
  it("tới cùng: đúng kết cục của trận", () => {
    expect(outcomeOf(fight({ result: "lost", fleeAt: 5, seconds: 9 }), "to_end")).toBe("lost");
    expect(outcomeOf(fight({ result: "won", fleeAt: 5, seconds: 30 }), "to_end")).toBe("won");
  });
  it("biết bỏ chạy: chưa bao giờ xuống ngưỡng thì y hệt trận", () => {
    expect(outcomeOf(fight({ result: "won", fleeAt: null }), "flee")).toBe("won");
  });
  it("biết bỏ chạy: sống qua giây vận thì THOÁT (kể cả khi tới cùng sẽ chết hoặc thắng sát nút)", () => {
    expect(outcomeOf(fight({ result: "lost", fleeAt: 5, seconds: 5 + ch + 2 }), "flee")).toBe(
      "fled",
    );
    expect(outcomeOf(fight({ result: "won", fleeAt: 5, seconds: 5 + ch + 2 }), "flee")).toBe(
      "fled",
    );
  });
  it("biết bỏ chạy: gục TRONG giây vận thì vẫn chết (không bất khả xâm phạm); thắng trước khi vận xong thì thắng", () => {
    expect(outcomeOf(fight({ result: "lost", fleeAt: 5, seconds: 5 + ch / 2 }), "flee")).toBe(
      "lost",
    );
    expect(outcomeOf(fight({ result: "won", fleeAt: 5, seconds: 5 + ch / 2 }), "flee")).toBe("won");
    // đúng mốc: gục đúng lúc vận xong vẫn tính là gục (không thoát kịp)
    expect(outcomeOf(fight({ result: "lost", fleeAt: 5, seconds: 5 + ch }), "flee")).toBe("lost");
  });
  it("biết bỏ chạy: hết giờ mà đã bấm thì thoát; chưa bấm thì hết giờ", () => {
    expect(outcomeOf(fight({ result: "timeout", fleeAt: 40, seconds: 90 }), "flee")).toBe("fled");
    expect(outcomeOf(fight({ result: "timeout", fleeAt: null, seconds: 90 }), "flee")).toBe(
      "timeout",
    );
  });
});

describe("summarizeGroup / realmRows", () => {
  it("tỉ lệ mỗi cách chơi cộng lại bằng 1; bầy dễ thắng 100%, không chết", () => {
    const s = summarizeGroup(EASY, 4);
    const sum = (r: GroupSummary["toEnd"]) => r.won + r.lost + r.timeout + r.fled;
    expect(sum(s.toEnd)).toBeCloseTo(1, 9);
    expect(sum(s.flee)).toBeCloseTo(1, 9);
    expect(s.toEnd.won).toBe(1);
    expect(s.toEnd.lost).toBe(0);
    expect(s.winExp).toBe(192);
    expect(s.fleeExp).toBeGreaterThan(0);
    expect(s.fleeCoin).toBeGreaterThan(0);
  });

  it("thời gian THẬT = giây mô phỏng / uptime của mức (người thật né nên đánh chậm hơn)", () => {
    const f = fightAmbush(EASY, { step: EASY.minStep, seed: 1 });
    const s = summarizeGroup(EASY, 1);
    expect(s.realSeconds).toBeCloseTo(f.seconds / ASSUME_AMBUSH.uptime.normal, 9);
    expect(s.realSeconds).toBeGreaterThan(f.seconds);
  });

  it("bầy khó: tới cùng chết gần hết; biết bỏ chạy thì chết ÍT HƠN hẳn (thoát được) nhưng không về 0 do đòn dồn", () => {
    const s = summarizeGroup(HARD, 8);
    expect(s.toEnd.lost).toBeGreaterThan(0.9);
    expect(s.flee.lost).toBeLessThan(s.toEnd.lost);
    expect(s.flee.fled).toBeGreaterThan(0.4);
    // bỏ chạy không bao giờ làm chết NHIỀU hơn: mỗi trận chết khi biết bỏ chạy thì cũng chết khi tới cùng
    expect(s.flee.lost).toBeLessThanOrEqual(s.toEnd.lost);
  });

  it("realmRows gộp theo (cảnh giới của minStep, mức); chỗ không có bầy thì không có hàng", () => {
    expect(realmRows([])).toEqual([]);
    const rows = realmRows([summarizeGroup(EASY, 2), summarizeGroup(HARD, 2)]);
    expect(rows.map((r) => `${r.realm}/${r.tier}`)).toEqual(["1/normal", "1/elite"]);
    expect(rows[1]!.worst.group.id).toBe("mau_kho");
    expect(rows[0]!.toEnd.won).toBe(1);
  });

  it("realmRows: nhiều bầy cùng (cảnh giới, mức) -> trung bình các bầy + chỉ ra bầy TỆ NHẤT (chết nhiều nhất)", () => {
    const heavy = group("mau_nang", 5, "normal", [{ kind: "ho", count: 3 }]);
    const a = summarizeGroup(EASY, 2);
    const b = summarizeGroup(heavy, 2);
    expect(b.toEnd.lost).toBeGreaterThan(0.5); // ba Hắc Hổ thường vẫn hạ được người bậc 5
    const [row] = realmRows([a, b]);
    expect(row!.groups).toBe(2);
    expect(row!.worst.group.id).toBe("mau_nang");
    expect(row!.toEnd.lost).toBeCloseTo((a.toEnd.lost + b.toEnd.lost) / 2, 9);
    expect(row!.realSeconds).toBeCloseTo((a.realSeconds + b.realSeconds) / 2, 9);
    // thứ tự đầu vào không đổi kết quả
    expect(realmRows([b, a])[0]!.worst.group.id).toBe("mau_nang");
  });
});

describe("bất biến cân bằng", () => {
  const easy = summarizeGroup(EASY, 4);
  const hard = summarizeGroup(HARD, 4);

  it("bầy khó vi phạm tỉ lệ thắng tối thiểu theo mức; bầy dễ không", () => {
    const bad = ambushBalanceViolations([easy, hard]);
    expect(bad.some((v) => v.includes("mau_kho") && v.includes("thắng"))).toBe(true);
    expect(bad.some((v) => v.includes("mau_de"))).toBe(false);
  });

  it("thưởng tu vi không hơn giá bỏ chạy là CẢNH BÁO (bỏ chạy đắt hơn cả thưởng), KHÔNG phải vi phạm: thắng +R luôn hơn bỏ chạy -P", () => {
    const priceWarn = (s: GroupSummary) =>
      ambushBalanceWarnings([s]).filter((w) => w.includes("bỏ chạy đắt hơn"));
    const dear: GroupSummary = { ...easy, winExp: easy.fleeExp, realSeconds: 45 };
    expect(ambushBalanceViolations([dear])).toEqual([]);
    expect(priceWarn(dear).join("\n")).toContain("bỏ chạy đắt hơn cả thưởng");
    const cheap: GroupSummary = { ...easy, winExp: easy.fleeExp + 1, realSeconds: 45 };
    expect(priceWarn(cheap)).toEqual([]);
    const none: GroupSummary = { ...easy, winExp: 0, realSeconds: 45 }; // chưa có thưởng thắng nào đo được: không cảnh báo giá
    expect(priceWarn(none)).toEqual([]);
  });

  it("DỮ LIỆU THẬT (CD6b): ở mọi bậc giá bỏ chạy giữa trận NHỎ hơn thưởng thắng thấp nhất: không bầy nào bị cảnh báo 'bỏ chạy đắt hơn cả thưởng'", () => {
    const sums = AMBUSH_FOES.map((g) => ({
      ...summarizeGroup(g, 1),
    }));
    const dear = ambushBalanceWarnings(sums).filter((w) => w.includes("bỏ chạy đắt hơn"));
    expect(dear).toEqual([]);
  });

  it("tăng tu vi / phút ngoài mục tiêu 20-40% của một CẢNH GIỚI là cảnh báo; trong khung thì không", () => {
    const base = summarizeGroup(EASY, 1);
    const hunt = upliftOf(base).huntRate;
    const withUplift = (u: number): GroupSummary => {
      const equiv = u * (ambushIntervalMin() + 1) + 1; // trận 60 giây: trừ 1 phút, mẫu số cộng 1 phút
      return {
        ...base,
        flee: { won: 1, lost: 0, timeout: 0, fled: 0 },
        winExp: equiv * hunt * 60,
        realSeconds: 60,
      };
    };
    const upWarn = (s: GroupSummary) =>
      ambushBalanceWarnings([s]).filter((w) => w.includes("tu vi / phút tăng"));
    expect(upliftOf(withUplift(0.3)).uplift).toBeCloseTo(0.3, 9);
    expect(upWarn(withUplift(0.3))).toEqual([]);
    expect(upWarn(withUplift(0.2))).toEqual([]);
    expect(upWarn(withUplift(0.4))).toEqual([]);
    expect(upWarn(withUplift(0.1)).join("\n")).toContain("Luyện Khí");
    expect(upWarn(withUplift(0.1)).join("\n")).toContain("10%");
    expect(upWarn(withUplift(0.6)).join("\n")).toContain("60%");
  });

  it("thời gian trận ngoài khung chỉ là CẢNH BÁO, không phải vi phạm", () => {
    expect(ambushBalanceViolations([easy])).toEqual([]);
    expect(ambushBalanceWarnings([easy]).length).toBe(1); // trận ~9 giây < 30
    const inRange: GroupSummary = { ...easy, realSeconds: 45 };
    expect(ambushBalanceWarnings([inRange])).toEqual([]);
  });

  it("khoảng giữa hai lần bị chặn >= hồi tối thiểu; tu vi / phút tính được và trộn theo trọng số", () => {
    expect(ambushIntervalMin()).toBeGreaterThan(8);
    const u = upliftOf(easy);
    expect(Number.isFinite(u.uplift)).toBe(true);
    expect(u.huntRate).toBeGreaterThan(0);
    expect(blendedUplift([])).toBeNull();
    expect(blendedUplift([easy])).toBeCloseTo(u.uplift, 9);
  });

  it("khoảng giữa hai lần bị chặn ~14,7 phút (hồi 8 + đi bộ ~6,7: 1200 px / 170 px/s / p giữa khoảng 3,5% / 50% thời gian đi bộ): ghim số, đổi hằng số là có chủ ý", () => {
    // đạo hàm tay: 8 + (1200 / 170 / 0.035) / 0.5 / 60 = 14,72
    expect(ambushIntervalMin()).toBeCloseTo(14.72, 1);
  });

  it("upliftOf: số cụ thể tính tay (đơn vị phút, trừ thời gian chiến đấu, mẫu số gồm cả trận)", () => {
    const hunt = upliftOf(easy).huntRate; // tu vi / giây săn quái cùng bậc
    // thắng 100%, thưởng = đúng 10 phút săn, trận 60 giây thật (1 phút): tương đương 10 - 1 = 9 phút
    const win = upliftOf({
      ...easy,
      flee: { won: 1, lost: 0, timeout: 0, fled: 0 },
      winExp: hunt * 600,
      realSeconds: 60,
    });
    expect(win.expPerAmbush).toBeCloseTo(hunt * 600, 6);
    expect(win.equivMinutes).toBeCloseTo(9, 6);
    expect(win.uplift).toBeCloseTo(9 / (ambushIntervalMin() + 1), 9);
    // bỏ chạy 100%, giá = 5 phút săn: LỖ 5 phút + 1 phút trận = -6 (giá bỏ chạy phải TRỪ, không cộng)
    const fled = upliftOf({
      ...easy,
      flee: { won: 0, lost: 0, timeout: 0, fled: 1 },
      fleeExp: hunt * 300,
      realSeconds: 60,
    });
    expect(fled.expPerAmbush).toBeCloseTo(-hunt * 300, 6);
    expect(fled.equivMinutes).toBeCloseTo(-6, 6);
    expect(fled.uplift).toBeCloseTo(-6 / (ambushIntervalMin() + 1), 9);
  });

  it("mục tiêu đặt đúng theo thiết kế mục 9 (90 / 80 / 60%, 30-70 giây, 20-40%)", () => {
    expect(ASSUME_AMBUSH.targets.winRate).toEqual({ normal: 0.9, elite: 0.8, leader: 0.6 });
    expect(ASSUME_AMBUSH.targets.seconds).toEqual({ min: 30, max: 70 });
    expect(ASSUME_AMBUSH.targets.uplift).toEqual({ min: 0.2, max: 0.4 });
  });
});

describe("CD6b: bảng tu vi / phút săn và thưởng theo phút", () => {
  it("AMBUSH_HUNT_EXP_PER_MIN của shared/ KHỚP bản sinh từ bestOption (nếu đỏ: đổi số liệu quái / đồ làm lệch; dán bảng mới ở thông báo vào shared/src/ambush.ts)", () => {
    const fresh = huntExpPerMinTable();
    expect([...AMBUSH_HUNT_EXP_PER_MIN], `bảng đúng hiện nay:\n[${fresh.join(", ")}]`).toEqual(
      fresh,
    );
  });
  it("huntExpPerMinTable: mỗi bậc là tu vi / phút (= bestOption x 60, làm tròn), bậc cao hơn Luyện Khí săn nhanh hơn Phàm Nhân", () => {
    const t = huntExpPerMinTable(4);
    expect(t).toHaveLength(4);
    for (const v of t) expect(v).toBeGreaterThan(0);
    expect(t[3]).toBeGreaterThan(t[0]);
  });
  it("thưởng tu vi KHÔNG phụ thuộc số con trong bầy (bầy đã được chọn để trận 30-70 giây): 1 con và 2 con cùng thưởng", () => {
    const one = fightAmbush(group("mot_con", 1, "normal", [{ kind: "lang", count: 1 }]), {
      step: 1,
      seed: 1,
    });
    const two = fightAmbush(EASY, { step: 1, seed: 1 });
    expect(one.result).toBe("won");
    expect(two.result).toBe("won");
    expect(one.exp).toBe(two.exp);
    expect(one.exp).toBe(ambushRewardExp(1, "normal"));
  });
  it("thưởng tu vi theo MỨC: tinh anh hơn thường, cầm đầu hơn tinh anh (cùng bậc)", () => {
    expect(ambushRewardExp(10, "elite")).toBeGreaterThan(ambushRewardExp(10, "normal"));
    expect(ambushRewardExp(10, "leader")).toBeGreaterThan(ambushRewardExp(10, "elite"));
  });
  it("upliftByRealm: nhóm theo cảnh giới của minStep; mức không có bầy thì thiếu; trộn đúng bằng blendedUplift của riêng cảnh giới đó", () => {
    const luyenKhi = summarizeGroup(EASY, 1); // bậc 1
    const trucCo = summarizeGroup(group("truc_co", 10, "normal", [{ kind: "ho", count: 1 }]), 1);
    const rows = upliftByRealm([luyenKhi, trucCo]);
    expect(rows.map((r) => r.realm)).toEqual([1, 2]);
    expect(rows[0].blended).toBeCloseTo(upliftOf(luyenKhi).uplift, 9);
    expect(rows[1].blended).toBeCloseTo(upliftOf(trucCo).uplift, 9);
    expect(Object.keys(rows[0].byTier)).toEqual(["normal"]);
    expect(upliftByRealm([])).toEqual([]);
  });
});

describe("độ nhạy theo giả định: tuỳ chọn đan / đồ của fightAmbush", () => {
  it("không đặt tuỳ chọn = giả định chuẩn (8 đan + đồ tốt nhất đủ bậc): kết quả y hệt đặt tường minh", () => {
    expect(fightAmbush(EASY, { step: 1, seed: 7 })).toEqual(
      fightAmbush(EASY, { step: 1, seed: 7, potions: ASSUME_DUNGEON.potions, gear: "best" }),
    );
    expect(summarizeGroup(EASY, 4)).toEqual(
      summarizeGroup(EASY, 4, { potions: ASSUME_DUNGEON.potions, gear: "best" }),
    );
  });

  it("số đan quyết định sống chết: cùng hạt giống, 8 đan thắng, 2 đan chết, 0 đan không uống viên nào", () => {
    const at = (potions: number) => fightAmbush(QUY, { step: QUY.minStep, seed: 1, potions });
    expect(at(8).result).toBe("won");
    expect(at(2).result).toBe("lost");
    expect(at(0).result).toBe("lost");
    expect(at(0).potionsUsed).toBe(0);
    expect(at(2).potionsUsed).toBeLessThanOrEqual(2);
    expect(at(8).potionsUsed).toBeLessThanOrEqual(8);
  });

  it("KHÔNG đồ: cùng trận, cùng 8 đan: đánh lâu hơn và tốn nhiều đan hơn người đủ đồ", () => {
    const best = fightAmbush(QUY, { step: QUY.minStep, seed: 1, gear: "best" });
    const none = fightAmbush(QUY, { step: QUY.minStep, seed: 1, gear: "none" });
    expect(none.seconds).toBeGreaterThan(best.seconds);
    expect(none.potionsUsed).toBeGreaterThan(best.potionsUsed);
  });
});

describe("độ nhạy theo giả định: phép tính", () => {
  it("atLeastOnce: 1 - (1 - p)^n, kẹp đầu vào sai về đầu gần nhất", () => {
    expect(atLeastOnce(0, 12)).toBe(0);
    expect(atLeastOnce(1, 12)).toBe(1);
    expect(atLeastOnce(0.3, 1)).toBeCloseTo(0.3, 12);
    expect(atLeastOnce(0.05, 12)).toBeCloseTo(1 - 0.95 ** 12, 12); // 45,96%: 5% mỗi lần ~ nửa số ngày chết ít nhất một lần
    expect(atLeastOnce(0.05, 0)).toBe(0);
    expect(atLeastOnce(0.05, -3)).toBe(0);
    expect(atLeastOnce(Number.NaN, 12)).toBe(0);
    expect(atLeastOnce(-0.5, 12)).toBe(0);
    expect(atLeastOnce(2, 12)).toBe(1);
  });

  it("blendedRate: trung bình các bầy TRONG mức rồi trộn theo AMBUSH_TIER_WEIGHTS; mức không có bầy thì bỏ khỏi phép trộn; rỗng -> null", () => {
    const base = summarizeGroup(EASY, 1);
    const withLost = (
      id: string,
      tier: AmbushFoeGroup["tier"],
      lost: number,
      fled = 0,
    ): GroupSummary => ({
      ...base,
      group: { ...base.group, id, tier },
      toEnd: { won: 1 - lost, lost, timeout: 0, fled: 0 },
      flee: { won: 1 - fled, lost: 0, timeout: 0, fled },
    });
    const sums = [
      withLost("a", "normal", 0.1),
      withLost("b", "normal", 0.3), // mức thường: trung bình 0,2
      withLost("c", "elite", 0.5),
    ];
    const w = AMBUSH_TIER_WEIGHTS;
    expect(blendedRate(sums, "toEnd", "lost")).toBeCloseTo(
      (w.normal * 0.2 + w.elite * 0.5) / (w.normal + w.elite),
      12,
    );
    expect(blendedRate([sums[0]!], "toEnd", "lost")).toBeCloseTo(0.1, 12); // chỉ một mức: đúng số của mức đó
    expect(blendedRate([withLost("d", "normal", 0, 0.4)], "flee", "fled")).toBeCloseTo(0.4, 12);
    expect(blendedRate([], "toEnd", "lost")).toBeNull();
  });

  it("sensitivityScenarios: 6 kịch bản, đồ tốt nhất trước rồi KHÔNG đồ, mỗi kiểu 8 / 2 / 0 đan; có cả giả định chuẩn và thận trọng", () => {
    const sc = sensitivityScenarios();
    expect(sc).toEqual([
      { potions: 8, gear: "best" },
      { potions: 2, gear: "best" },
      { potions: 0, gear: "best" },
      { potions: 8, gear: "none" },
      { potions: 2, gear: "none" },
      { potions: 0, gear: "none" },
    ]);
    const c = ASSUME_AMBUSH.sensitivity.cautious;
    expect(sc).toContainEqual({ potions: c.potions, gear: c.gear });
    expect(ASSUME_AMBUSH.sensitivity.dayCap).toBe(AMBUSH_DAY_CAP);
    expect(ASSUME_DUNGEON.potions).toBe(8); // hàng đầu là giả định chuẩn của bảng 1-3
  });

  it("sensitivityRow: bảng rỗng -> null; có bầy: đếm bầy dưới mục tiêu, chỉ ra bầy chết nhiều nhất, xác suất ngày = atLeastOnce(chết / lần, 12)", () => {
    expect(sensitivityRow([], { potions: 8, gear: "best" })).toBeNull();
    expect(sensitivityRows([])).toEqual([]);
    const r = sensitivityRow([EASY, HARD], { potions: 8, gear: "best" }, 8)!;
    expect(r.groups).toBe(2);
    expect(r.runs).toBe(8);
    expect(r.worst.group.id).toBe("mau_kho");
    expect(r.belowTarget).toBe(1); // HARD (tinh anh) thua gần hết, EASY thắng hết
    expect(r.deadToEnd).toBeGreaterThan(0);
    expect(r.fledFlee).toBeGreaterThan(0); // HARD (tinh anh) buộc người biết bỏ chạy phải thoát
    expect(r.fledFlee).toBeLessThanOrEqual(1);
    // tính lại ĐỘC LẬP bằng tay: mỗi mức một bầy nên trộn = (w1 x a + w2 x b) / (w1 + w2)
    const [de, ha] = r.sums;
    const w = AMBUSH_TIER_WEIGHTS;
    const mix = (pick: (s: GroupSummary) => number) =>
      (w.normal * pick(de!) + w.elite * pick(ha!)) / (w.normal + w.elite);
    expect(r.deadToEnd).toBeCloseTo(
      mix((s) => s.toEnd.lost),
      12,
    );
    expect(r.deadFlee).toBeCloseTo(
      mix((s) => s.flee.lost),
      12,
    );
    expect(r.fledFlee).toBeCloseTo(
      mix((s) => s.flee.fled),
      12,
    );
    expect(mix((s) => s.flee.fled)).not.toBeCloseTo(
      mix((s) => s.flee.lost),
      6,
    ); // hai đại lượng khác nhau thật: đột biến lẫn chúng sẽ bị bắt
    expect(r.deadDayToEnd).toBeCloseTo(atLeastOnce(r.deadToEnd, AMBUSH_DAY_CAP), 12);
    expect(r.deadDayFlee).toBeCloseTo(atLeastOnce(r.deadFlee, AMBUSH_DAY_CAP), 12);
    expect(r.deadFlee).toBeLessThanOrEqual(r.deadToEnd + 1e-12); // bỏ chạy không bao giờ chết nhiều hơn đánh tới cùng
  });

  it("CHIỀU của số đo: ít đan hơn / không đồ thì chết nhiều hơn (ca Thạch Quy, 8 trận mỗi kịch bản)", () => {
    const rows = sensitivityRows([QUY], 8);
    expect(rows).toHaveLength(6);
    const dead = (potions: number, gear: "best" | "none") =>
      rows.find((r) => r.scenario.potions === potions && r.scenario.gear === gear)!.deadToEnd;
    expect(dead(8, "best")).toBeLessThan(dead(2, "best"));
    expect(dead(2, "best")).toBeLessThanOrEqual(dead(0, "best"));
    for (const p of [8, 2, 0]) expect(dead(p, "none")).toBeGreaterThanOrEqual(dead(p, "best"));
  });

  it("VI PHẠM: bầy chết 'tới cùng' VƯỢT 5% hoặc thắng DƯỚI mục tiêu ở giả định thận trọng (2 đan + đồ đúng bậc) bị nêu TÊN; đúng ngưỡng thì không; thiếu hàng thận trọng thì không", () => {
    const rows = sensitivityRows([QUY, EASY], 8);
    const w = ambushSensitivityViolations(rows);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("mau_quy");
    expect(w[0]).toContain("giả định thận trọng");
    expect(w[0]).toContain("chết vượt 5%");
    expect(w[0]).not.toContain("mau_de");
    // chỉnh tay tỉ lệ chết / thắng của MỘT bầy quanh ngưỡng (thắng = 1 - chết: không để thắng thấp làm nhiễu phép thử ngưỡng chết)
    const cautious = cautiousRow(rows)!;
    const at = (lost: number, won = 1 - lost): SensitivityRow[] => [
      {
        ...cautious,
        sums: [{ ...cautious.sums[0]!, toEnd: { ...cautious.sums[0]!.toEnd, lost, won } }],
      },
    ];
    expect(ambushSensitivityViolations(at(0.05, 0.95))).toEqual([]); // đúng 5%: không vượt (bầy thường cần thắng >= 90%)
    expect(ambushSensitivityViolations(at(0.0625, 0.9375))).toHaveLength(1); // 3 / 48
    // thắng dưới mục tiêu dù KHÔNG chết (hết giờ): vẫn là vi phạm, lý do nêu 'thắng dưới'
    const slow = ambushSensitivityViolations(at(0, 0.8));
    expect(slow).toHaveLength(1);
    expect(slow[0]).toContain("thắng dưới 90%");
    expect(slow[0]).not.toContain("chết vượt");
    expect(ambushSensitivityViolations(rows.filter((r) => r !== cautious))).toEqual([]);
    expect(ambushSensitivityViolations([])).toEqual([]);
  });
});

describe("renderAmbushBalance", () => {
  it("bảng rỗng: nói THẲNG là chưa có dữ liệu (không bịa số)", () => {
    const md = renderAmbushBalance([]);
    expect(md).toContain("Chưa có bầy kẻ chặn đường nào");
    expect(md).not.toContain("| Cảnh giới |");
  });
  it("có bầy: có bảng theo cảnh giới + từng bầy + mục vi phạm kèm tên bầy khó", () => {
    const md = renderAmbushBalance([EASY, HARD]);
    expect(md).toContain("### 1. Tỉ lệ chết theo cảnh giới");
    expect(md).toContain("| mau_de |");
    expect(md).toContain("| mau_kho |");
    // bầy khó vi phạm HAI nơi: bảng chuẩn (thắng dưới mục tiêu) và hàng thận trọng (độ nhạy)
    expect(md).toContain("**VI PHẠM (2):**");
    expect(md).toContain("ở giả định thận trọng");
    expect(md).toContain("Luyện Khí");
  });
  it("mục 4 Độ nhạy: đủ 6 hàng (đan x đồ), đánh dấu hàng chuẩn và hàng thận trọng, nêu xác suất chết trong ngày và có lời kết luận về giả định chuẩn", () => {
    const md = renderAmbushBalance([EASY, QUY]);
    expect(md).toContain("### 4. Độ nhạy theo giả định");
    expect(md).toContain("| đồ tốt nhất đủ bậc | 8 (chuẩn) |");
    expect(md).toContain("| đồ tốt nhất đủ bậc | 2 (thận trọng) |");
    expect(md.match(/\| KHÔNG đồ \|/g)).toHaveLength(3);
    expect(md).toContain(`${AMBUSH_DAY_CAP} lần chặn`);
    expect(md).toContain("Chết >= 1 lần / ngày");
    expect(md).toContain("mau_quy (chết"); // bầy chết nhiều nhất
    expect(md).toContain("VI PHẠM** (tên ở mục vi phạm bên dưới): chưa đề xuất bật"); // Thạch Quy chết 2 đan: bầy vi phạm ở giả định thận trọng
    expect(md).toContain("ở giả định thận trọng");
    expect(md).toContain("chết vượt 5%"); // vi phạm độ nhạy đi vào danh sách VI PHẠM của báo cáo
    expect(md).toContain("bầy mau_quy (am_suong, bậc 13, normal): chết");
    expect(renderAmbushBalance([EASY])).toContain("không bầy nào vi phạm");
    expect(renderAmbushBalance([])).not.toContain("### 4.");
  });
  it("renderAmbushBalance nhận bảng độ nhạy ĐÃ đo và DÙNG nó (không đo lại): bảng rỗng thì không có hàng chuẩn; thiếu hàng thận trọng thì không có câu về giả định chuẩn", () => {
    const rows = sensitivityRows([EASY, QUY], 4);
    expect(renderAmbushBalance([EASY, QUY], rows)).toContain("(chuẩn)");
    expect(renderAmbushBalance([EASY, QUY], rows)).toContain("LÀ chuẩn để quyết bật");
    const md0 = renderAmbushBalance([EASY, QUY], []);
    expect(md0).toContain("### 4.");
    expect(md0).not.toContain("(chuẩn)");
    const noCautious = rows.filter((r) => r !== cautiousRow(rows));
    expect(renderAmbushBalance([EASY, QUY], noCautious)).not.toContain("LÀ chuẩn để quyết bật");
  });
});

/** Hạn của ca dữ liệu thật (hạn mặc định 15 giây): 120 giây cho máy chung đang bận (tải 30 / 20 nhân từng làm bản 60 giây đỏ); kết quả sai vẫn đỏ ngay vì là khẳng định, không phải thời gian. */
const REAL_DATA_TIMEOUT_MS = 120_000;

/**
 * Bảng độ nhạy của dữ liệu THẬT, đo MỘT lần cho cả tệp (6 kịch bản x mọi bầy x 48 trận: ~5 giây trên máy rảnh; máy chung tải 30 / 20 nhân từng đo gấp ~6 lần). Trước đây hai ca dữ liệu thật
 * mỗi ca tự đo (cộng cả `renderAmbushBalance` đo lần nữa) nên ca thứ hai chạm hạn 60 giây khi máy bận và cả bộ đỏ 22/11.
 */
let realSensitivity: SensitivityRow[] | undefined;
const realRows = (): SensitivityRow[] => (realSensitivity ??= sensitivityRows());

describe("DỮ LIỆU THẬT: độ nhạy (AMBUSH_FOES)", () => {
  it(
    "chiều của số đo trên bảng thật: ít đan hơn / không đồ thì chết nhiều hơn; bỏ chạy không chết nhiều hơn tới cùng; xác suất ngày khớp chết / lần",
    () => {
      if (AMBUSH_FOES.length === 0) return;
      const rows = realRows();
      expect(rows).toHaveLength(6);
      const dead = (potions: number, gear: "best" | "none") =>
        rows.find((r) => r.scenario.potions === potions && r.scenario.gear === gear)!.deadToEnd;
      expect(dead(8, "best")).toBeLessThanOrEqual(dead(2, "best"));
      expect(dead(2, "best")).toBeLessThanOrEqual(dead(0, "best"));
      for (const p of [8, 2, 0]) expect(dead(p, "none")).toBeGreaterThanOrEqual(dead(p, "best"));
      for (const r of rows) {
        expect(r.groups).toBe(AMBUSH_FOES.length);
        expect(r.deadFlee).toBeLessThanOrEqual(r.deadToEnd + 1e-12);
        expect(r.deadDayToEnd).toBeCloseTo(atLeastOnce(r.deadToEnd, AMBUSH_DAY_CAP), 12);
      }
    },
    REAL_DATA_TIMEOUT_MS,
  );
});

describe("DỮ LIỆU THẬT (AMBUSH_FOES)", () => {
  it(
    "không bầy nào vi phạm mục tiêu tỉ lệ thắng / thắng hơn bỏ chạy (nếu đỏ: chạy `npm run can-bang -w server`, đọc mục 'Chặn đường', chọn bầy yếu hơn hoặc chỉnh hằng số)",
    () => {
      expect(ambushBalanceViolations()).toEqual([]);
      // GIẢ ĐỊNH THẬN TRỌNG là chuẩn bật AMBUSH (A chốt 22/11, CD6c): ít đan (2) + đồ đúng bậc vẫn chết <= 5% và thắng >= mục tiêu ở MỌI bầy (nếu đỏ: bầy nêu tên quá khó với người ít đan: giảm số con / nâng `minStep` / chọn loài nhẹ hơn, đo lại bằng `npm run can-bang -w server`)
      expect(ambushSensitivityViolations(realRows())).toEqual([]);
      // không "đạt" chỉ vì bảng rỗng ở bản đã có dữ liệu: nếu có bầy thì phải đã đo
      expect(
        renderAmbushBalance(AMBUSH_FOES, realRows()).includes("Chưa có bầy")
          ? AMBUSH_FOES.length
          : -1,
      ).toBe(AMBUSH_FOES.length === 0 ? 0 : -1);
    },
    REAL_DATA_TIMEOUT_MS,
  ); // đo / dựng cả báo cáo (mục 4) trên dữ liệu thật: nặng, nên hạn riêng
});
