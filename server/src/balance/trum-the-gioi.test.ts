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
const slot = (over: Partial<WorldBossSlot>): WorldBossSlot => ({ ...base, ...over });

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
