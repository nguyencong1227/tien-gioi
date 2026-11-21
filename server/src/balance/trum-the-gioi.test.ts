// Mô phỏng cân bằng trùm thế giới (M9.10 #1029, `trum-the-gioi.ts`): chọn `hpMult`. Lịch thật có thể còn rỗng: các ca dùng khung MẪU (`sampleWorldBossSchedule`) với hệ số tự đặt;
// ca cuối khoá LỊCH THẬT (rỗng thì hiển nhiên đạt; có lịch thì phải đạt mục tiêu).
import { describe, expect, it } from "vitest";
import {
  WORLD_BOSS_SCHEDULE,
  sampleWorldBossSchedule,
  type WorldBossSlot,
} from "@tien-gioi/shared";
import {
  ASSUME_WORLD_BOSS,
  measureSlot,
  perPlayerDps,
  renderWorldBossBalance,
  worldBossBalanceViolations,
} from "./trum-the-gioi";

const base = sampleWorldBossSchedule()[0]!; // Thiên Hàn Vương, 30 phút
/** Quỹ thưởng đủ cho đội 10 người ~17,5 phút săn (bậc 18: ~396 tu vi / phút => 10 x 17,5 x 396 ~ 69.300) để các ca không đỏ vì thưởng; ca riêng bên dưới thử thưởng sai. */
const REWARD = { exp: 70_000, coin: 50_000 };
const slot = (over: Partial<WorldBossSlot>): WorldBossSlot => ({
  ...base,
  reward: REWARD,
  ...over,
});

describe("perPlayerDps", () => {
  it("Thiên Hàn Vương: DPS thật mỗi người ~457 (đo từ trận đội nhỏ x uptime), Hắc Giao thấp hơn; loài không phải trùm có bộ chiêu thì null", () => {
    const han = perPlayerDps("thien_han_vuong")!;
    const giao = perPlayerDps("hac_giao")!;
    expect(han).toBeGreaterThan(430);
    expect(han).toBeLessThan(485);
    expect(giao).toBeGreaterThan(260);
    expect(giao).toBeLessThan(320);
    expect(perPlayerDps("ho")).toBeNull();
    expect(perPlayerDps("khong_co")).toBeNull();
  });
});

describe("measureSlot", () => {
  it("hpMult 1: máu gốc, một người đã hạ được; thời gian né hoàn hảo tỉ lệ nghịch với số người", () => {
    const r = measureSlot(slot({ hpMult: undefined }));
    expect(r.hp).toBe(123_000);
    expect(r.minPlayers).toBe(1);
    const t5 = r.dodgeMinutes[5]!;
    expect(r.dodgeMinutes[20]!).toBeCloseTo(t5 / 4, 9);
    expect(r.dodgeMinutes[50]!).toBeCloseTo(t5 / 10, 9);
  });

  it("hpMult tuyến tính: gấp đôi hệ số thì gấp đôi thời gian và ~gấp đôi số người tối thiểu; số cụ thể ở x35 (6 người, 50 người ~3,1 phút)", () => {
    const a = measureSlot(slot({ hpMult: 35 }));
    const b = measureSlot(slot({ hpMult: 70 }));
    expect(b.dodgeMinutes[20]!).toBeCloseTo(a.dodgeMinutes[20]! * 2, 9);
    expect(a.minPlayers).toBe(6);
    expect(b.minPlayers).toBe(11); // 8,61 triệu máu / (~457 x 1800 giây) = 10,5 -> 11
    expect(a.dodgeMinutes[50]!).toBeGreaterThan(3);
    expect(a.dodgeMinutes[50]!).toBeLessThan(3.3);
    expect(a.dodgeMinutes[5]!).toBeGreaterThan(30); // 5 người né hoàn hảo vẫn KHÔNG kịp 30 phút
  });

  it("thời lượng dài hơn thì cần ÍT người hơn (cùng hệ số)", () => {
    const short = measureSlot(slot({ hpMult: 35, durationMin: 30 }));
    const long = measureSlot(slot({ hpMult: 35, durationMin: 60 }));
    expect(long.minPlayers!).toBeLessThan(short.minPlayers!);
  });

  it("không né: máu gốc đội 5 người hạ được; máu x40 đội 50 người chết sạch và không hạ nổi (cận bi quan)", () => {
    const plain = measureSlot(slot({ hpMult: undefined }));
    expect(plain.noDodge[5]!.winRate).toBe(1);
    const huge = measureSlot(slot({ hpMult: 40 }));
    expect(huge.noDodge[50]!.winRate).toBe(0);
    expect(huge.noDodge[50]!.deaths).toBe(50);
    expect(huge.noDodge[50]!.minutes).toBeNull();
  });

  it("loài không có bộ chiêu: ném lỗi rõ ràng", () => {
    expect(() => measureSlot(slot({ boss: "ho" }))).toThrow(/ho/);
  });
});

describe("thưởng quy ra phút săn", () => {
  it("săn tốt nhất ở bậc 18 ~396 tu vi / phút, bậc 15 ~536; thưởng một người = quỹ / số người / tu vi mỗi phút (số tính tay)", () => {
    const han = measureSlot(slot({ hpMult: 35 }));
    expect(han.huntExpPerMin).toBeGreaterThan(380);
    expect(han.huntExpPerMin).toBeLessThan(415);
    expect(han.expEquivMinutes[10]!).toBeCloseTo(70_000 / 10 / han.huntExpPerMin, 9);
    expect(han.expEquivMinutes[10]!).toBeGreaterThan(16);
    expect(han.expEquivMinutes[10]!).toBeLessThan(19);
    expect(han.expEquivMinutes[20]!).toBeCloseTo(han.expEquivMinutes[10]! / 2, 9); // đông gấp đôi thì phần mỗi người nửa
    expect(han.coinEquivMinutes[10]!).toBeCloseTo(50_000 / 10 / han.huntCoinPerMin, 9);
    const giao = measureSlot(slot({ boss: "hac_giao", hpMult: 40 }));
    expect(giao.huntExpPerMin).toBeGreaterThan(500);
    expect(giao.huntExpPerMin).toBeLessThan(570);
  });

  it("quỹ quá nhỏ (khung mẫu 1000 tu vi) hoặc quá lớn bị bắt; trong khoảng 12-25 phút thì đạt", () => {
    const tiny = worldBossBalanceViolations([
      measureSlot(slot({ hpMult: 35, reward: { exp: 1000, coin: 200 } })),
    ]).join("\n");
    expect(tiny).toContain("thưởng tu vi của một người");
    const huge = worldBossBalanceViolations([
      measureSlot(slot({ hpMult: 35, reward: { exp: 400_000, coin: 50_000 } })),
    ]).join("\n");
    expect(huge).toContain("thưởng tu vi của một người");
    expect(
      worldBossBalanceViolations([
        measureSlot(slot({ hpMult: 35, reward: { exp: 60_000, coin: 50_000 } })),
      ]),
    ).toEqual([]);
    expect(
      worldBossBalanceViolations([
        measureSlot(slot({ hpMult: 35, reward: { exp: 95_000, coin: 50_000 } })),
      ]),
    ).toEqual([]);
  });
});

describe("worldBossBalanceViolations", () => {
  it("máu gốc (quá dễ) vi phạm cả hai mục tiêu; x35 đạt; x200 (quá khó) bị bắt", () => {
    const easy = worldBossBalanceViolations([measureSlot(slot({ hpMult: undefined }))]).join("\n");
    expect(easy).toContain("cần ít nhất 1 người");
    expect(easy).toContain("đội 50 người hạ trong");
    expect(worldBossBalanceViolations([measureSlot(slot({ hpMult: 35 }))])).toEqual([]);
    const hard = worldBossBalanceViolations([measureSlot(slot({ hpMult: 200 }))]).join("\n");
    expect(hard).toContain("cần ít nhất");
    expect(hard).not.toContain("đội 50 người hạ trong");
  });

  it("mục tiêu đặt đúng (4-8 người tối thiểu, 50 người không dưới 3 phút, đo 5 / 20 / 50)", () => {
    expect(ASSUME_WORLD_BOSS.minPlayers).toEqual({ min: 4, max: 8 });
    expect(ASSUME_WORLD_BOSS.fastestMinutes).toBe(3);
    expect(ASSUME_WORLD_BOSS.parties).toEqual([5, 20, 50]);
    expect(ASSUME_WORLD_BOSS.typicalPlayers).toBe(10);
    expect(ASSUME_WORLD_BOSS.rewardMinutes).toEqual({ min: 12, max: 25 });
  });
});

describe("renderWorldBossBalance", () => {
  it("lịch rỗng: nói THẲNG là chưa có khung giờ (không bịa số)", () => {
    const md = renderWorldBossBalance([]);
    expect(md).toContain("Chưa có khung giờ nào");
    expect(md).not.toContain("| Khung |");
  });
  it("có lịch: bảng có id khung, trùm, người tối thiểu, hai mô hình; vi phạm hiện kèm tên khung", () => {
    const md = renderWorldBossBalance([
      slot({ id: "mau_kho", hpMult: 35 }),
      slot({ id: "mau_de" }),
    ]);
    expect(md).toContain("| mau_kho |");
    expect(md).toContain("| mau_de |");
    expect(md).toContain("Né hoàn hảo");
    expect(md).toContain("**VI PHẠM (2):**");
    expect(md).toContain('khung "mau_de"');
    expect(md).not.toContain('khung "mau_kho"');
  });
});

describe("LỊCH THẬT (WORLD_BOSS_SCHEDULE)", () => {
  it("mọi khung đạt mục tiêu số người tối thiểu / không hạ quá nhanh (nếu đỏ: chạy `npm run can-bang -w server`, đọc mục 'Trùm thế giới', chỉnh hpMult)", () => {
    expect(worldBossBalanceViolations()).toEqual([]);
    expect(WORLD_BOSS_SCHEDULE.length === 0 ? "rỗng" : "có lịch").toBe(
      WORLD_BOSS_SCHEDULE.length === 0 ? "rỗng" : "có lịch",
    );
  });
});
