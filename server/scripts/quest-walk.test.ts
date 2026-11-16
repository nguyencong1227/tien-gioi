import { describe, expect, it } from "vitest";
import {
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  DROP_TABLES,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  getMap,
  type QuestDef,
} from "@tien-gioi/shared";
import {
  findDropsFor,
  findMapForMonster,
  findPortalTo,
  getPatrolPoints,
  planQuestSteps,
} from "./quest-walk";
import { gridOf, planPath } from "../src/balance/search-check";

describe("quest-walk: kiểm tra tính khả thi tĩnh của nhiệm vụ (Issue #757)", () => {
  it("mọi nhiệm vụ trong QUESTS đều có kế hoạch bước khả thi trên main hiện tại", () => {
    expect(QUESTS.length).toBeGreaterThan(0);
    const unfeasible: { id: string; issues: string[] }[] = [];

    for (const q of QUESTS) {
      const plan = planQuestSteps(q);
      if (!plan.feasible) {
        unfeasible.push({ id: q.id, issues: plan.issues });
      }
    }

    expect(
      unfeasible,
      "Có nhiệm vụ trong QUESTS không khả thi: " + JSON.stringify(unfeasible),
    ).toEqual([]);
  });

  it("findMapForMonster: xác định đúng bản đồ sinh ra quái", () => {
    // Quái Lạc Hà
    expect(findMapForMonster("tho")).toBe(DEFAULT_MAP_ID);
    expect(findMapForMonster("lang")).toBe(DEFAULT_MAP_ID);
    // Quái Âm Sương Trạch
    expect(findMapForMonster("suong_ho")).toBe(AM_SUONG_ID);
    expect(findMapForMonster("hac_giao")).toBe(AM_SUONG_ID);
    // Quái Hàn Vân Lĩnh
    expect(findMapForMonster("han_lang")).toBe(HAN_VAN_ID);
    expect(findMapForMonster("thien_han_vuong")).toBe(HAN_VAN_ID);
    // Quái không tồn tại hoặc trùm bí cảnh (không sinh ngoài hoang)
    expect(findMapForMonster("quai_la")).toBeNull();
    expect(findMapForMonster("yeu_vuong")).toBeNull();
  });

  it("findDropsFor: tìm đúng danh sách quái rơi vật phẩm", () => {
    const longTho = findDropsFor("long_tho");
    expect(longTho.some((d) => d.monster === "tho")).toBe(true);

    const suongMao = findDropsFor("suong_mao");
    expect(suongMao.some((d) => d.monster === "suong_ho")).toBe(true);

    const tuongCot = findDropsFor("tuong_cot");
    expect(tuongCot.some((d) => d.monster === "cot_tuong")).toBe(true);

    // Vật phẩm không rơi từ quái
    expect(findDropsFor("vat_pham_khong_roi")).toEqual([]);
  });

  it("findPortalTo: tìm đúng portal chuyển map giữa các bản đồ kề nhau", () => {
    // lac_ha -> hac_phong
    const p1 = findPortalTo(DEFAULT_MAP_ID, HAC_PHONG_ID);
    expect(p1).toBeDefined();
    expect(p1?.id).toBe("lac_ha_bac");

    // hac_phong -> am_suong
    const p2 = findPortalTo(HAC_PHONG_ID, AM_SUONG_ID);
    expect(p2).toBeDefined();
    expect(p2?.id).toBe("hac_phong_bac");

    // am_suong -> han_van
    const p3 = findPortalTo(AM_SUONG_ID, HAN_VAN_ID);
    expect(p3).toBeDefined();
    expect(p3?.id).toBe("am_suong_bac");

    // Chiều ngược lại: han_van -> am_suong
    const p4 = findPortalTo(HAN_VAN_ID, AM_SUONG_ID);
    expect(p4).toBeDefined();
    expect(p4?.id).toBe("han_van_nam");
  });

  it("portal lac_ha_bac có đường đi hợp lệ từ trấn", () => {
    const grid = gridOf(getMap(DEFAULT_MAP_ID)!);
    const p = getMap(DEFAULT_MAP_ID)!.portals[0];
    const tileX = Math.floor(p.x / 32);
    const tileY = Math.floor(p.y / 32);
    const cell = tileY * grid.w + tileX;
    console.log("Portal cell free:", grid.free[cell]);
    console.log(
      "Spawn cell free:",
      grid.free[Math.floor(p.spawn.y / 32) * grid.w + Math.floor(p.spawn.x / 32)],
    );
    const path = planPath(grid, 1536, 1536, new Set([cell]));
    console.log("Path length:", path?.cells.length);
    expect(path).toBeDefined();
    expect(path!.cells.length).toBeGreaterThan(0);
  });

  it("getPatrolPoints: sinh danh sách điểm tuần tra hợp lệ cho quái", () => {
    const lacHa = getMap(DEFAULT_MAP_ID)!;
    const ptsTho = getPatrolPoints(lacHa, MONSTER_BY_ID.tho);
    expect(ptsTho.length).toBeGreaterThan(0);
    for (const pt of ptsTho) {
      expect(pt.x).toBeGreaterThan(0);
      expect(pt.y).toBeGreaterThan(0);
    }
  });

  describe("Đột biến ĐỎ (mutations) bắt đúng lỗi cấu hình nhiệm vụ", () => {
    it("đột biến 1: trỏ tới loài quái không tồn tại -> báo không khả thi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.tru_tho,
        id: "tru_tho_mutated",
        steps: [{ kind: "kill", monster: "quai_khong_ton_tai", count: 5 }],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("không tồn tại trong MONSTER_BY_ID"))).toBe(true);
    });

    it("đột biến 2: trỏ tới quái không sinh ở bản đồ nào (trùm bí cảnh) -> báo không khả thi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.tru_tho,
        id: "tru_tho_boss_in_wild",
        steps: [{ kind: "kill", monster: "yeu_vuong", count: 1 }],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("không sinh ra ở bất kỳ bản đồ nào"))).toBe(true);
    });

    it("đột biến 3: vật phẩm thu thập không tồn tại -> báo không khả thi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.tru_tho,
        id: "tru_tho_fake_item",
        steps: [{ kind: "collect", itemId: "item_khong_ton_tai", count: 3 }],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("không tồn tại trong ITEM_BY_ID"))).toBe(true);
    });

    it("đột biến 4: NPC giao không tồn tại -> báo không khả thi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.tru_tho,
        id: "tru_tho_fake_giver",
        giver: "npc_ma",
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("NPC giao 'npc_ma' không tồn tại"))).toBe(true);
    });

    it("đột biến 5: NPC nói chuyện không tồn tại -> báo không khả thi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.nhap_the,
        id: "nhap_the_fake_talk",
        steps: [{ kind: "talk", npcId: "npc_la" }],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("NPC 'npc_la' không tồn tại"))).toBe(true);
    });

    it("đột biến 6: thưởng exp âm hoặc vật phẩm thưởng số lượng <= 0 -> báo lỗi", () => {
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.nhap_the,
        id: "nhap_the_bad_reward",
        rewards: { exp: -100, items: [{ itemId: "hoi_huyet_dan", qty: 0 }] },
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("Phần thưởng exp không hợp lệ"))).toBe(true);
      expect(plan.issues.some((s) => s.includes("phải > 0"))).toBe(true);
    });
  });
});
