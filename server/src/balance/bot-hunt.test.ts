import { describe, expect, it } from "vitest";
import { botFight, botHuntSummary, HAN_VAN_MONSTERS } from "./bot-hunt";

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

  it("thực nghiệm bot thật đánh TINH ANH Hàn Vân Lĩnh: 3 loài (Hàn Lang, Phong Nha, Cốt Tượng) solo né + đan sống sót 100%, Độc Tước cần đội 2 người", () => {
    // 3 loài thường tinh anh: solo có né + đan dược sống sót 100% (chết 0/3)
    for (const mId of ["han_lang", "phong_nha", "cot_tuong"] as const) {
      const summary = botHuntSummary(NA_REALM, 2, mId, {
        elite: true,
        evade: true,
        useOwnerGear: false,
        runs: 3,
      });
      expect(summary.deathsTotal, `${mId} tinh anh solo`).toBe(0);
      expect(summary.killedAll, `${mId} tinh anh solo`).toBe(true);
      // Đáy khí huyết: trước mục 30 < 0,8; máu quái x1,5 làm trận dài hơn nhưng bot né + đan vẫn sống 100% (đáy lên ~0,86 vì đan hồi nhiều lần): cận mới < 0,9 vẫn phát hiện bot không bao giờ bị đánh
      expect(summary.lowestHpFrac).toBeLessThan(0.9);
    }

    // Độc Tước tinh anh (độc tầm xa dồn dập): solo tử vong kể cả mang 8 đan (do cd đan 12s)
    const docTuocSolo = botHuntSummary(NA_REALM, 2, "doc_tuoc", {
      elite: true,
      evade: true,
      useOwnerGear: false,
      runs: 3,
    });
    expect(docTuocSolo.deathsTotal).toBeGreaterThan(0);

    const docTuocSolo8 = botHuntSummary(NA_REALM, 2, "doc_tuoc", {
      elite: true,
      evade: true,
      useOwnerGear: false,
      potions: 8,
      runs: 3,
    });
    expect(docTuocSolo8.deathsTotal).toBeGreaterThan(0);

    // Độc Tước tinh anh khi đi ĐỘI 2 NGƯỜI: sống sót 100%, tỷ lệ sống cao hơn hẳn solo
    const docTuocParty = botHuntSummary(NA_REALM, 2, "doc_tuoc", {
      elite: true,
      party: 2,
      evade: true,
      useOwnerGear: false,
      runs: 3,
    });
    expect(docTuocParty.deathsTotal).toBe(0);
    expect(docTuocParty.killedAll).toBe(true);
    expect(docTuocParty.deathsTotal).toBeLessThanOrEqual(docTuocSolo.deathsTotal);
    expect(docTuocParty.medianSeconds).toBeLessThan(15);

    // Đối chiếu quái thường vs tinh anh: tinh anh nhận nhiều sát thương hơn và thời gian gấp ~2.5x
    const normalLang = botHuntSummary(NA_REALM, 2, "han_lang", { evade: true, runs: 3 });
    const eliteLang = botHuntSummary(NA_REALM, 2, "han_lang", {
      elite: true,
      evade: true,
      runs: 3,
    });
    expect(eliteLang.medianTotalDmg).toBeGreaterThan(normalLang.medianTotalDmg);
    const timeRatio = eliteLang.medianSeconds / normalLang.medianSeconds;
    expect(timeRatio).toBeGreaterThan(2.0);
    expect(timeRatio).toBeLessThan(3.0);
  });
});
