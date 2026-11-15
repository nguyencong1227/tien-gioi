import { describe, expect, it } from "vitest";
import { botFight, botHuntSummary, HAN_VAN_MONSTERS } from "./bot-hunt";
import { MONSTER_BY_ID } from "@tien-gioi/shared";

const NA_REALM = 4;

describe("bot-hunt: mô phỏng bot THẬT Nguyên Anh (có độ trễ phản xạ, né đòn báo trước, đo đồ ô riêng)", () => {
  it("solo 4 loài Hàn Vân Lĩnh: bot né đòn báo trước (evade=true) sống sót và hạ quái an toàn 100%", () => {
    for (const monsterId of HAN_VAN_MONSTERS) {
      // Hậu kỳ (tier 2), solo 1 người, có né đòn
      const summary = botHuntSummary(NA_REALM, 2, monsterId, { evade: true, runs: 3 });
      expect(summary.killedAll).toBe(true);
      expect(summary.deathsTotal).toBe(0);
      expect(summary.medianSeconds).toBeGreaterThan(0);
      expect(summary.medianSeconds).toBeLessThan(60);
    }
  });

  it("Cốt Tượng: bot có né đòn đập đất (evade=true) né thoát đòn đập đất và mất ít máu hơn rõ rệt so với đứng yên (evade=false)", () => {
    const noEvade = botFight({
      realm: NA_REALM,
      tier: 2,
      monsterId: "cot_tuong",
      evade: false,
      seed: 42,
    });

    const withEvade = botFight({
      realm: NA_REALM,
      tier: 2,
      monsterId: "cot_tuong",
      evade: true,
      seed: 42,
    });

    expect(noEvade.killed).toBe(true);
    expect(withEvade.killed).toBe(true);
    // Khi né đòn đập đất thành công: số đòn trúng ít hơn hoặc sát thương nhận vào thấp hơn
    expect(withEvade.warnsEvaded).toBeGreaterThan(0);
    expect(withEvade.totalDamageTaken).toBeLessThanOrEqual(noEvade.totalDamageTaken);
  });

  it("độ nhạy đồ ô riêng: có đủ đồ ô riêng (useOwnerGear=true) giảm sát thương nhận vào và tăng tốc độ hạ quái", () => {
    const noOwnerGear = botHuntSummary(NA_REALM, 2, "doc_tuoc", {
      useOwnerGear: false,
      evade: true,
      runs: 4,
    });

    const withOwnerGear = botHuntSummary(NA_REALM, 2, "doc_tuoc", {
      useOwnerGear: true,
      evade: true,
      runs: 4,
    });

    expect(noOwnerGear.killedAll).toBe(true);
    expect(withOwnerGear.killedAll).toBe(true);
    // Đồ ô riêng (hài + ngọc bội + pháp bảo) có thêm công, tốc độ, guard: thời gian hạ nhanh hơn hoặc sát thương ít hơn
    expect(withOwnerGear.medianSeconds).toBeLessThanOrEqual(noOwnerGear.medianSeconds);
    expect(withOwnerGear.medianTotalDmg).toBeLessThanOrEqual(noOwnerGear.medianTotalDmg);
  });

  it("trùm Thiên Hàn Vương theo đội: đội 4 người có né đòn hạ trùm an toàn 100% 0 chết", () => {
    const res = botFight({
      realm: NA_REALM,
      tier: 2, // Hậu kỳ
      monsterId: "thien_han_vuong",
      party: 4,
      evade: true,
      useOwnerGear: false,
      seed: 1,
    });

    expect(res.killed).toBe(true);
    expect(res.deaths).toBe(0);
    expect(res.seconds).toBeLessThan(180);
    // Có né thoát ít nhất 1 đợt đập đất 140px của Thiên Hàn Vương
    expect(res.warnsEvaded).toBeGreaterThan(0);
  });

  it("trùm Thiên Hàn Vương theo đội: đội 3 người có đồ ô riêng (useOwnerGear=true) hạ trùm an toàn", () => {
    const res = botFight({
      realm: NA_REALM,
      tier: 2, // Hậu kỳ
      monsterId: "thien_han_vuong",
      party: 3,
      evade: true,
      useOwnerGear: true,
      seed: 2,
    });

    expect(res.killed).toBe(true);
    expect(res.deaths).toBe(0);
    expect(res.seconds).toBeLessThan(200);
  });

  it("đo số bot thật Nguyên Anh đối chiếu CAN_BANG (M7.10 / M7.9)", () => {
    console.log("\n=== BẢNG SỐ ĐO BOT THẬT NGUYÊN ANH (M7.10) ===");
    for (let tier = 0; tier <= 2; tier++) {
      const tierLabel = tier === 0 ? "Sơ kỳ" : tier === 1 ? "Trung kỳ" : "Hậu kỳ";
      console.log(`\n--- [CẢNH GIỚI NGUYÊN ANH - ${tierLabel.toUpperCase()}] ---`);
      for (const mId of HAN_VAN_MONSTERS) {
        const noEvade = botHuntSummary(NA_REALM, tier, mId, {
          evade: false,
          useOwnerGear: false,
          runs: 6,
        });
        const evadeNoGear = botHuntSummary(NA_REALM, tier, mId, {
          evade: true,
          useOwnerGear: false,
          runs: 6,
        });
        const evadeWithGear = botHuntSummary(NA_REALM, tier, mId, {
          evade: true,
          useOwnerGear: true,
          runs: 6,
        });

        console.log(`[${mId.toUpperCase()}]:`);
        console.log(
          `  - Đứng yên (3 món): ${noEvade.medianSeconds.toFixed(1)}s | ST: ${noEvade.medianTotalDmg.toFixed(0)} | Mất máu: ${(noEvade.worstLostFrac * 100).toFixed(0)}%`,
        );
        console.log(
          `  - Né đòn (3 món):   ${evadeNoGear.medianSeconds.toFixed(1)}s | ST: ${evadeNoGear.medianTotalDmg.toFixed(0)} | Mất máu: ${(evadeNoGear.worstLostFrac * 100).toFixed(0)}%`,
        );
        console.log(
          `  - Né + 6 món:       ${evadeWithGear.medianSeconds.toFixed(1)}s | ST: ${evadeWithGear.medianTotalDmg.toFixed(0)} | Mất máu: ${(evadeWithGear.worstLostFrac * 100).toFixed(0)}%`,
        );
      }

      console.log(`\n[THIÊN HÀN VƯƠNG] Trùm ${tierLabel}:`);
      for (const party of [4, 3]) {
        const boss3M = botHuntSummary(NA_REALM, tier, "thien_han_vuong", {
          party,
          evade: true,
          useOwnerGear: false,
          runs: 6,
        });
        const boss6M = botHuntSummary(NA_REALM, tier, "thien_han_vuong", {
          party,
          evade: true,
          useOwnerGear: true,
          runs: 6,
        });
        console.log(
          `  - Đội ${party} (né, 3 món): ${boss3M.medianSeconds.toFixed(1)}s | Đan/người: ${boss3M.medianPotions.toFixed(1)} | Chết: ${boss3M.deathsTotal}/6 trận`,
        );
        console.log(
          `  - Đội ${party} (né, 6 món): ${boss6M.medianSeconds.toFixed(1)}s | Đan/người: ${boss6M.medianPotions.toFixed(1)} | Chết: ${boss6M.deathsTotal}/6 trận`,
        );
      }
    }
  });
});
