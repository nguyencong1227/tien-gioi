// Mô phỏng cân bằng chặn đường (CD6 #1066, `chan-duong.ts`). Dữ liệu thật `AMBUSH_FOES` có thể còn rỗng: các ca dưới đây dùng bầy MẪU dựng tay (loài thật, bầy giả) để chứng minh
// công cụ ĐO ĐÚNG; riêng ca cuối khoá DỮ LIỆU THẬT (rỗng thì hiển nhiên đạt, E / G thêm bầy thì phải đạt mục tiêu).
import { describe, expect, it } from "vitest";
import { AMBUSH_FLEE_CHANNEL_MS, AMBUSH_FOES, type AmbushFoeGroup } from "@tien-gioi/shared";
import {
  ASSUME_AMBUSH,
  ambushBalanceViolations,
  ambushBalanceWarnings,
  ambushIntervalMin,
  blendedUplift,
  fightAmbush,
  outcomeOf,
  realmRows,
  renderAmbushBalance,
  summarizeGroup,
  upliftOf,
  type AmbushFight,
  type GroupSummary,
} from "./chan-duong";

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
    expect(f.exp).toBe(30); // 2 Hôi Lang x 10 tu vi x ARENA_REWARD_MULT.normal (1,5)
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
    expect(s.winExp).toBe(30);
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
    const dear: GroupSummary = { ...easy, winExp: easy.fleeExp, realSeconds: 45 };
    expect(ambushBalanceViolations([dear])).toEqual([]);
    expect(ambushBalanceWarnings([dear]).join("\n")).toContain("bỏ chạy đắt hơn cả thưởng");
    const cheap: GroupSummary = { ...easy, winExp: easy.fleeExp + 1, realSeconds: 45 };
    expect(ambushBalanceWarnings([cheap])).toEqual([]);
    const none: GroupSummary = { ...easy, winExp: 0, realSeconds: 45 }; // chưa có thưởng thắng nào đo được: không cảnh báo giá
    expect(ambushBalanceWarnings([none])).toEqual([]);
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
    expect(md).toContain("**VI PHẠM (1):**");
    expect(md).toContain("Luyện Khí");
  });
});

describe("DỮ LIỆU THẬT (AMBUSH_FOES)", () => {
  it("không bầy nào vi phạm mục tiêu tỉ lệ thắng / thắng hơn bỏ chạy (nếu đỏ: chạy `npm run can-bang -w server`, đọc mục 'Chặn đường', chọn bầy yếu hơn hoặc chỉnh hằng số)", () => {
    expect(ambushBalanceViolations()).toEqual([]);
    // không "đạt" chỉ vì bảng rỗng ở bản đã có dữ liệu: nếu có bầy thì phải đã đo
    expect(renderAmbushBalance().includes("Chưa có bầy") ? AMBUSH_FOES.length : -1).toBe(
      AMBUSH_FOES.length === 0 ? 0 : -1,
    );
  });
});
