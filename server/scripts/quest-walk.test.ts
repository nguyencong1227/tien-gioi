import { describe, expect, it } from "vitest";
import {
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  HAN_VAN_ID,
  MONSTER_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  getMap,
  type QuestDef,
} from "@tien-gioi/shared";
import {
  estimateDropsRequired,
  findDropsFor,
  findMapForMonster,
  findPortalTo,
  getPatrolPoints,
  isMapReachableForQuest,
  planQuestSteps,
  walkSingleQuest,
} from "./quest-walk";
import { gridOf, planPath } from "../src/balance/search-check";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { defineRooms } from "../src/rooms/WorldRoom";
import { freePort } from "../src/test-port";
import { assertNotProd } from "./assert-not-prod";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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

  it("estimateDropsRequired: ước lượng chính xác số quái cần hạ và tỉ lệ", () => {
    // da_tho: rơi từ tho (rate = 0.5 * 1.5 = 0.75)
    const estDaTho = estimateDropsRequired("long_tho", 3);
    expect(estDaTho.hasWildSource).toBe(true);
    expect(estDaTho.bestMonster).toBe("tho");
    expect(estDaTho.expectedKills).toBe(Math.ceil(3 / estDaTho.bestRate));
    expect(estDaTho.isRareOrBoss).toBe(false);

    // Vật phẩm không tồn tại nguồn rơi
    const estFake = estimateDropsRequired("fake_item_123", 5);
    expect(estFake.hasWildSource).toBe(false);
    expect(estFake.isRareOrBoss).toBe(true);
  });

  it("isMapReachableForQuest: kiểm tra tính liên thông theo cảnh giới", () => {
    // lac_ha -> lac_ha: luôn được
    expect(isMapReachableForQuest(DEFAULT_MAP_ID, DEFAULT_MAP_ID)).toBe(true);
    // lac_ha -> hac_phong: được
    expect(isMapReachableForQuest(DEFAULT_MAP_ID, HAC_PHONG_ID, { realm: 0, tier: 0 })).toBe(true);
    // lac_ha -> han_van_linh (cách 3 cấp bản đồ) với nhiệm vụ Phàm Nhân: không được
    expect(isMapReachableForQuest(DEFAULT_MAP_ID, HAN_VAN_ID, { realm: 0, tier: 0 })).toBe(false);
    // han_van_linh với nhiệm vụ Nguyên Anh (realm 4): được
    expect(isMapReachableForQuest(DEFAULT_MAP_ID, HAN_VAN_ID, { realm: 4, tier: 0 })).toBe(true);
  });

  it("findPortalTo: tìm đúng portal chuyển map giữa các bản đồ kề nhau", () => {
    const p1 = findPortalTo(DEFAULT_MAP_ID, HAC_PHONG_ID);
    expect(p1).toBeDefined();
    expect(p1?.id).toBe("lac_ha_bac");

    const p2 = findPortalTo(HAC_PHONG_ID, AM_SUONG_ID);
    expect(p2).toBeDefined();
    expect(p2?.id).toBe("hac_phong_bac");

    const p3 = findPortalTo(AM_SUONG_ID, HAN_VAN_ID);
    expect(p3).toBeDefined();
    expect(p3?.id).toBe("am_suong_bac");

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
    const pathResult = planPath(grid, 1536, 1536, new Set([cell]));
    expect(pathResult).toBeDefined();
    expect(pathResult!.cells.length).toBeGreaterThan(0);
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

  describe("Đột biến kiểm chứng đúng yêu cầu Issue #757 (Dev A review)", () => {
    it("đột biến (a): nâng count bước thu thập vượt khả năng rơi (> 60 quái) -> planQuestSteps báo ĐỎ", () => {
      // nanh_soi_ren_kiem gốc: count = 5 nanh sói
      // Nâng lên count = 100 nanh sói (tỉ lệ rơi nanh sói từ lang là ~0.675 -> cần hạ > 140 quái)
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.nanh_soi_ren_kiem,
        id: "nanh_soi_ren_kiem_mutated_count",
        steps: [
          { kind: "kill", monster: "lang", count: 8 },
          { kind: "collect", itemId: "nanh_soi", count: 100 },
        ],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(plan.issues.some((s) => s.includes("vượt quá khả năng rơi hợp lý"))).toBe(true);
    });

    it("đột biến (b): bước kill trỏ quái có thật nhưng không sinh ở bản đồ nhiệm vụ / chuỗi cổng liên thông -> planQuestSteps báo ĐỎ", () => {
      // tru_tho ở Lạc Hà (Phàm Nhân / Luyện Khí), đột biến yêu cầu hạ quái Hàn Lang (chỉ sinh ở Hàn Vân Lĩnh - Nguyên Anh)
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.tru_tho,
        id: "tru_tho_mutated_unreachable_monster",
        steps: [{ kind: "kill", monster: "han_lang", count: 5 }],
      };
      const plan = planQuestSteps(mutatedQuest);
      expect(plan.feasible).toBe(false);
      expect(
        plan.issues.some((s) =>
          s.includes("không thể tiếp cận từ 'lac_ha' theo cảnh giới yêu cầu"),
        ),
      ).toBe(true);
    });

    it("đột biến (c): thưởng exp SAI giá trị so với QuestDef.rewards.exp -> bot phát hiện lỗi sau khi trả nhiệm vụ trên máy chủ thật", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-qw-test-"));
      process.env.DATA_DIR = path.join(tempDir, "players");

      const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
      defineRooms(server);
      const port = await freePort();
      assertNotProd(port, "quest-walk-test");
      await server.listen(port);

      const client = new Client(`ws://127.0.0.1:${port}`);

      // Nhiệm vụ nhap_the có exp thưởng chuẩn là 10.
      // Đột biến sửa kỳ vọng exp thành 9999 (trong khi server thật trả về 10 exp).
      const mutatedQuest: QuestDef = {
        ...QUEST_BY_ID.nhap_the,
        rewards: { exp: 9999 },
      };

      const result = await walkSingleQuest(client, mutatedQuest, { silent: true });

      await server.gracefullyShutdown(false);
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      expect(result.success).toBe(false);
      expect(result.error).toContain("Phần thưởng exp không khớp");
      expect(result.error).toContain("kỳ vọng 9999");
    });

    it("đột biến (d): bot chết nhận tin limbo -> dừng ĐỎ ngay lập tức (< 3.5s), không kẹt 450s (Review lần 2 của Dev A)", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-qw-limbo-"));
      process.env.DATA_DIR = path.join(tempDir, "players");

      const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
      defineRooms(server);
      const port = await freePort();
      assertNotProd(port, "quest-walk-limbo-test");
      await server.listen(port);

      const client = new Client(`ws://127.0.0.1:${port}`);

      const origJoinOrCreate = client.joinOrCreate.bind(client);
      client.joinOrCreate = async (...args: any[]) => {
        const rm = await (origJoinOrCreate as any)(...args);
        // Sau khi bot vào phòng và gắn listeners (200ms), server gửi tin "limbo" tới bot
        setTimeout(() => {
          const sRoom = matchMaker.getLocalRoomById(rm.roomId);
          if (sRoom) {
            sRoom.broadcast("limbo", {});
          }
        }, 200);
        return rm;
      };

      const t0 = Date.now();
      const result = await walkSingleQuest(client, QUEST_BY_ID.thuoc_cho_tran, {
        silent: true,
        timeoutSec: 10,
      });
      const elapsed = Date.now() - t0;

      await server.gracefullyShutdown(false);
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      expect(result.success).toBe(false);
      expect(result.error).toContain("bot_died");
      expect(result.error).toContain("nhận tin limbo");
      // Dừng ngay lập tức trong vòng < 3.5 giây (thay vì kẹt 60s hay 450s)
      expect(elapsed).toBeLessThan(3500);
    });

    it("đột biến (e): nhận tin travelTo ngoài kế hoạch -> dừng ĐỎ ngay lập tức (< 3.5s) kèm lý do rõ ràng", async () => {
      const tempDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-qw-travel-"));
      process.env.DATA_DIR = path.join(tempDir, "players");

      const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
      defineRooms(server);
      const port = await freePort();
      assertNotProd(port, "quest-walk-travel-test");
      await server.listen(port);

      const client = new Client(`ws://127.0.0.1:${port}`);

      const origJoinOrCreate = client.joinOrCreate.bind(client);
      client.joinOrCreate = async (...args: any[]) => {
        const rm = await (origJoinOrCreate as any)(...args);
        // Sau khi bot vào phòng và gắn listeners (200ms), server gửi tin travelTo ngoài kế hoạch
        setTimeout(() => {
          const sRoom = matchMaker.getLocalRoomById(rm.roomId);
          if (sRoom) {
            sRoom.broadcast("travelTo", { mapId: "am_suong_trach" });
          }
        }, 200);
        return rm;
      };

      const t0 = Date.now();
      const result = await walkSingleQuest(client, QUEST_BY_ID.thuoc_cho_tran, {
        silent: true,
        timeoutSec: 10,
      });
      const elapsed = Date.now() - t0;

      await server.gracefullyShutdown(false);
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      expect(result.success).toBe(false);
      expect(result.error).toContain("unplanned_travel");
      expect(result.error).toContain("am_suong_trach");
      expect(elapsed).toBeLessThan(3500);
    });
  });
});
