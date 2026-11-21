// Mô hình mô phỏng chặn đường (CD6, #1066; docs/THIET_KE_CHAN_DUONG.md mục 9).
// Kiểm: (1) con quái gốc hợp cảnh giới KHÔNG phải world-boss (mutation-guard — Dev A yêu cầu chứng minh test đỏ khi bỏ cận);
// (2) mô hình đấu trường thắng/thua đúng chiều; (3) thưởng/tu vi đúng chiều; (4) mục Markdown nêu đủ mục tiêu + bảng.
import { describe, expect, it } from "vitest";
import { AMBUSH_FOE_LEVEL_CAP, AMBUSH_TIME_MS, REALMS, statsFor } from "@tien-gioi/shared";
import { bestGear } from "./simulate";
import {
  AMBUSH_COIN_REWARD_MULT,
  AMBUSH_EXP_REWARD_MULT,
  ambushAverages,
  ambushPerHour,
  ambushRealmRows,
  ambushReward,
  ambushVsHuntRatio,
  avgWalkSecBetweenAmbush,
  representativeFoe,
  renderAmbush,
  simulateFight,
} from "./ambush-sim";

/** Các cảnh giới có trần kẻ chặn đường (`AMBUSH_FOE_LEVEL_CAP`) — cảnh giới không có trần thì KHÔNG có bầy hợp lệ. */
const REALMS_WITH_CAP = REALMS.map((_, i) => i).filter(
  (r) => AMBUSH_FOE_LEVEL_CAP[r] !== undefined,
);

describe("mô hình mô phỏng chặn đường", () => {
  describe("representativeFoe — con quái gốc hợp cảnh giới", () => {
    it("5 cảnh giới có trần (0-4): con gốc là loài thường cứng nhất, KHÔNG phải world-boss (mutation-guard)", () => {
      // Bỏ cận `if (m.hp > bossHpCeil) continue;` trong representativeFoe thì Nguyên Anh (4) trả về hac_giao (world-boss) -> test ĐỎ.
      expect(representativeFoe(0)?.id).toBe("lang");
      expect(representativeFoe(1)?.id).toBe("ho");
      expect(representativeFoe(2)?.id).toBe("mang");
      expect(representativeFoe(3)?.id).toBe("doc_thiem");
      expect(representativeFoe(4)?.id).toBe("doc_tuoc"); // KHÔNG phải hac_giao (world-boss máu khổng lồ)
    });

    it("mọi con gốc đều có máu <= 10× máu người chơi cảnh giới đó (định nghĩa loại world-boss)", () => {
      for (const r of REALMS_WITH_CAP) {
        const foe = representativeFoe(r);
        if (!foe) continue;
        const tierNo = REALMS[r].tiers.length - 1;
        const playerHp = statsFor(r, tierNo, bestGear(r, tierNo)).maxHp;
        expect(foe.hp, `${REALMS[r].name}/${foe.id}`).toBeLessThanOrEqual(playerHp * 10);
      }
    });

    it("con gốc đúng là loài có level <= trần kẻ chặn đường của cảnh giới", () => {
      for (const r of REALMS_WITH_CAP) {
        const foe = representativeFoe(r);
        if (!foe) continue;
        expect(foe.level, `${REALMS[r].name}/${foe.id}`).toBeLessThanOrEqual(
          AMBUSH_FOE_LEVEL_CAP[r],
        );
      }
    });
  });

  describe("simulateFight — mô hình đấu trường giây-từng-giây", () => {
    it("dps áp đảo, quái gần như không gây sát thương: thắng nhanh, KHÔNG dùng đan", () => {
      const res = simulateFight(100, 1, 1000, 1000);
      expect(res.win).toBe(true);
      expect(res.fightSec).toBe(1); // ceil(100/1000) = 1 giây
      expect(res.potionsUsed).toBe(0);
    });

    it("thua vì HẾT GIỜ trận: sống đủ 120 s nhưng dps quá thấp không hạ được bầy khổng lồ", () => {
      const res = simulateFight(1_000_000, 1, 5, 1000);
      expect(res.win).toBe(false);
      expect(res.fightSec).toBe(Math.floor(AMBUSH_TIME_MS / 1000)); // 120
    });

    it("thua vì NHẬN ĐÒN: bầy sống lâu đủ giết người chơi (kể cả đã dùng đan)", () => {
      const res = simulateFight(2000, 600, 100, 1000);
      expect(res.win).toBe(false);
      expect(res.fightSec).toBeLessThan(Math.floor(AMBUSH_TIME_MS / 1000));
      expect(res.damageTaken).toBeGreaterThan(0);
      expect(res.potionsUsed).toBeGreaterThan(0); // đã cố dùng đan mà vẫn chết
    });

    it("thắng nhờ đan: bầy hạ trong giờ trận, người chơi dùng đan đỡ chết", () => {
      const res = simulateFight(1000, 100, 100, 1000);
      expect(res.win).toBe(true);
      expect(res.fightSec).toBe(10); // ceil(1000/100)
      expect(res.potionsUsed).toBe(1);
    });
  });

  describe("thưởng & so sánh (mục 9)", () => {
    it("hệ số thưởng ĐỀ XUẤT: tu vi 6/12/28, Linh thạch 2/3/5 theo mức", () => {
      expect(AMBUSH_EXP_REWARD_MULT).toEqual({ normal: 6, elite: 12, leader: 28 });
      expect(AMBUSH_COIN_REWARD_MULT).toEqual({ normal: 2, elite: 3, leader: 5 });
    });

    it("thưởng tu vi / Linh thạch khi thắng > 0 với con gốc hợp cảnh giới", () => {
      const base = representativeFoe(1)!; // ho
      const r = ambushReward("normal", base, 1, REALMS[1].tiers.length - 1);
      expect(r.exp).toBeGreaterThan(0);
      expect(r.coin).toBeGreaterThan(0);
    });

    it("tu vi/phút có đi bộ < tu vi/phút chỉ đánh (đi bộ làm loãng lợi suất, mục 9)", () => {
      const cmp = ambushVsHuntRatio(
        "normal",
        1,
        REALMS[1].tiers.length - 1,
        avgWalkSecBetweenAmbush(180),
      );
      expect(cmp).not.toBeNull();
      if (cmp) {
        expect(cmp.ambushRateWalk).toBeLessThan(cmp.ambushRateFight);
        expect(cmp.ratioWalk).toBeLessThan(cmp.ratioFight);
      }
    });

    it("số lần chặn đường/giờ: bị chặn bởi hồi 8 phút VÀ trần ngày (trần ngày nhỏ hơn)", () => {
      const perHour = ambushPerHour(45, 190);
      expect(perHour.cooldownCeil).toBeGreaterThan(0);
      expect(perHour.dayCapPerHour).toBeGreaterThan(0);
      // hồi 8 phút cho ~5 lần/giờ nếu liên tục; trần 12/ngày trong phiên 6 h -> 2 lần/giờ -> giới hạn bởi trần ngày
      expect(perHour.dayCapPerHour).toBeLessThan(perHour.cooldownCeil);
    });
  });

  describe("tổng hợp & Markdown", () => {
    const walkSec = avgWalkSecBetweenAmbush(180);
    const rows = ambushRealmRows(walkSec);

    it("một hàng cho mỗi cảnh giới có trần (0-4), con gốc KHÔNG phải world-boss", () => {
      expect(rows).toHaveLength(REALMS_WITH_CAP.length);
      for (const r of rows) {
        const foe = representativeFoe(r.realm);
        expect(foe, r.base).toBeDefined();
        expect(foe!.name).toBe(r.base); // cột "Quái gốc" là tên con gốc
        const tierNo = REALMS[r.realm].tiers.length - 1;
        const playerHp = statsFor(r.realm, tierNo, bestGear(r.realm, tierNo)).maxHp;
        expect(foe!.hp, r.base).toBeLessThanOrEqual(playerHp * 10); // không phải world-boss
      }
    });

    it("trung bình các cảnh giới có ít nhất một giá trị tỉ lệ thắng theo mọi mức", () => {
      const a = ambushAverages(rows);
      expect(a.win.normal).not.toBeNull();
      expect(a.win.elite).not.toBeNull();
      expect(a.win.leader).not.toBeNull();
    });

    it("mục Markdown nêu header, đủ mục tiêu (tỉ lệ thắng / thời gian trận / tu vi) và đầu bảng", () => {
      const md = renderAmbush(walkSec);
      expect(md).toContain("## Chặn đường (CD6, #1066)");
      expect(md).toContain("mục tiêu >= 90 / 80 / 60%");
      expect(md).toContain("mục tiêu 30-70 s");
      expect(md).toContain("mục tiêu 1.2-1.4");
      expect(md).toContain("| Cảnh giới | Quái gốc |");
    });
  });
});
