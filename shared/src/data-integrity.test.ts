import { describe, expect, it } from "vitest";
import {
  COIN_CAP,
  COIN_DROPS,
  DROP_TABLES,
  EQUIP_SLOTS,
  ITEMS,
  ITEM_BY_ID,
  ITEM_VALUE,
  MONSTERS,
  MONSTER_BY_ID,
  NPCS,
  NPC_BY_ID,
  PLAYER_RADIUS,
  QUESTS,
  QUEST_BY_ID,
  REALMS,
  RECIPES,
  RECIPE_BY_ID,
  SHOPS,
  SHOP_BY_NPC,
  TRADES,
  TRADE_BY_ID,
  circleBlocked,
  inTown,
} from "./index";

describe("nhất quán dữ liệu game (Issue #112 - data-integrity)", () => {
  describe("1. Quái vật và bảng rơi đồ / Linh thạch (MONSTERS x DROP_TABLES x COIN_DROPS)", () => {
    it("mọi quái trong MONSTERS đều có bảng rơi đồ và bảng rơi tiền", () => {
      expect(MONSTERS.length).toBeGreaterThan(0);
      for (const m of MONSTERS) {
        expect(
          DROP_TABLES[m.id],
          `Quái "${m.id}" thiếu bảng rơi đồ trong DROP_TABLES`,
        ).toBeDefined();
        expect(
          DROP_TABLES[m.id]?.length,
          `Bảng rơi đồ của quái "${m.id}" không được rỗng`,
        ).toBeGreaterThan(0);

        expect(
          COIN_DROPS[m.id],
          `Quái "${m.id}" thiếu bảng rơi Linh thạch trong COIN_DROPS`,
        ).toBeDefined();
      }
    });

    it("không có bảng rơi đồ hoặc bảng rơi tiền trỏ tới loại quái không tồn tại", () => {
      const monsterIds = new Set(MONSTERS.map((m) => m.id));

      for (const kind of Object.keys(DROP_TABLES)) {
        expect(monsterIds.has(kind), `DROP_TABLES chứa loại quái không tồn tại: "${kind}"`).toBe(
          true,
        );
      }

      for (const kind of Object.keys(COIN_DROPS)) {
        expect(monsterIds.has(kind), `COIN_DROPS chứa loại quái không tồn tại: "${kind}"`).toBe(
          true,
        );
      }
    });

    it("mọi dòng rơi đồ trỏ tới vật phẩm có thật và số lượng không vượt stack", () => {
      for (const [kind, table] of Object.entries(DROP_TABLES)) {
        for (const drop of table) {
          const item = ITEM_BY_ID[drop.itemId];
          expect(
            item,
            `Bảng rơi của "${kind}" trỏ tới vật phẩm không tồn tại: "${drop.itemId}"`,
          ).toBeDefined();

          expect(drop.chance, `Tỷ lệ rơi của "${drop.itemId}" ở "${kind}"`).toBeGreaterThan(0);
          expect(drop.chance, `Tỷ lệ rơi của "${drop.itemId}" ở "${kind}"`).toBeLessThanOrEqual(1);

          expect(Number.isInteger(drop.min), `min rơi của "${drop.itemId}"`).toBe(true);
          expect(drop.min, `min rơi của "${drop.itemId}"`).toBeGreaterThanOrEqual(1);

          expect(Number.isInteger(drop.max), `max rơi của "${drop.itemId}"`).toBe(true);
          expect(drop.max, `max rơi của "${drop.itemId}"`).toBeGreaterThanOrEqual(drop.min);

          expect(
            drop.max,
            `max rơi (${drop.max}) của "${drop.itemId}" vượt quá stack tối đa (${item.stack})`,
          ).toBeLessThanOrEqual(item.stack);
        }
      }
    });

    it("mọi dòng rơi Linh thạch có tỷ lệ và số lượng nguyên hợp lệ", () => {
      for (const [kind, coinDrop] of Object.entries(COIN_DROPS)) {
        expect(coinDrop.chance, `Tỷ lệ rơi tiền của "${kind}"`).toBeGreaterThan(0);
        expect(coinDrop.chance, `Tỷ lệ rơi tiền của "${kind}"`).toBeLessThanOrEqual(1);

        expect(Number.isInteger(coinDrop.min) && coinDrop.min >= 1, `min tiền của "${kind}"`).toBe(
          true,
        );
        expect(
          Number.isInteger(coinDrop.max) && coinDrop.max >= coinDrop.min,
          `max tiền của "${kind}"`,
        ).toBe(true);
        expect(coinDrop.max, `max tiền của "${kind}"`).toBeLessThanOrEqual(COIN_CAP);
      }
    });
  });

  describe("2. Nhiệm vụ và các liên kết (QUESTS x NPCS x MONSTERS x ITEMS)", () => {
    it("id nhiệm vụ không trùng và danh sách QUESTS khớp với QUEST_BY_ID", () => {
      const ids = QUESTS.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of QUESTS) {
        expect(QUEST_BY_ID[q.id]).toBe(q);
      }
    });

    it("người giao (giver) phải là NPC có thật trong game", () => {
      for (const q of QUESTS) {
        expect(
          NPC_BY_ID[q.giver],
          `Nhiệm vụ "${q.id}" có người giao không tồn tại: "${q.giver}"`,
        ).toBeDefined();
      }
    });

    it("mọi bước nhiệm vụ (steps) chỉ trỏ tới quái, NPC, vật phẩm có thật", () => {
      for (const q of QUESTS) {
        expect(q.steps.length, `Nhiệm vụ "${q.id}" không có bước nào`).toBeGreaterThan(0);

        for (let i = 0; i < q.steps.length; i++) {
          const step = q.steps[i];
          if (step.kind === "kill") {
            expect(
              MONSTER_BY_ID[step.monster],
              `Nhiệm vụ "${q.id}" bước ${i} yêu cầu quái không tồn tại: "${step.monster}"`,
            ).toBeDefined();
            expect(Number.isInteger(step.count) && step.count >= 1, `count quái bước ${i}`).toBe(
              true,
            );
          } else if (step.kind === "collect") {
            const item = ITEM_BY_ID[step.itemId];
            expect(
              item,
              `Nhiệm vụ "${q.id}" bước ${i} yêu cầu vật phẩm không tồn tại: "${step.itemId}"`,
            ).toBeDefined();
            expect(
              Number.isInteger(step.count) && step.count >= 1,
              `count vật phẩm bước ${i}`,
            ).toBe(true);
          } else if (step.kind === "talk") {
            expect(
              NPC_BY_ID[step.npcId],
              `Nhiệm vụ "${q.id}" bước ${i} yêu cầu nói chuyện với NPC không tồn tại: "${step.npcId}"`,
            ).toBeDefined();
          }
        }
      }
    });

    it("phần thưởng nhiệm vụ (rewards) hợp lệ: exp hữu hạn >= 0, vật phẩm có thật", () => {
      for (const q of QUESTS) {
        const rew = q.rewards;
        expect(
          typeof rew.exp === "number" && Number.isFinite(rew.exp) && rew.exp >= 0,
          `Nhiệm vụ "${q.id}" có exp thưởng không hợp lệ`,
        ).toBe(true);

        if (rew.items) {
          for (const rewItem of rew.items) {
            const itemDef = ITEM_BY_ID[rewItem.itemId];
            expect(
              itemDef,
              `Nhiệm vụ "${q.id}" thưởng vật phẩm không tồn tại: "${rewItem.itemId}"`,
            ).toBeDefined();
            expect(
              Number.isInteger(rewItem.qty) && rewItem.qty >= 1 && rewItem.qty <= itemDef.stack,
              `Nhiệm vụ "${q.id}" thưởng số lượng "${rewItem.itemId}" không hợp lệ [1, ${itemDef.stack}]`,
            ).toBe(true);
          }
        }
      }
    });

    it("chuỗi nhiệm vụ không có chu trình (DAG) và nhiệm vụ lặp hàng ngày độc lập", () => {
      const allNextTargets = QUESTS.filter((q) => q.next).map((q) => q.next!);
      // Không hai nhiệm vụ nào cùng trỏ tới một nhiệm vụ tiếp theo
      expect(new Set(allNextTargets).size).toBe(allNextTargets.length);

      for (const q of QUESTS) {
        const visited = new Set<string>();
        let curr: string | undefined = q.id;

        while (curr) {
          expect(
            visited.has(curr),
            `Phát hiện chu trình vòng lặp trong chuỗi nhiệm vụ tại: "${curr}" (bắt đầu từ "${q.id}")`,
          ).toBe(false);
          visited.add(curr);

          const nextQuest: (typeof QUESTS)[number] | undefined = QUEST_BY_ID[curr];
          expect(nextQuest, `Nhiệm vụ tiếp theo "${curr}" không tồn tại`).toBeDefined();
          curr = nextQuest?.next;
        }

        if (q.daily) {
          expect(
            q.next,
            `Nhiệm vụ hàng ngày "${q.id}" không được có chuỗi tiếp theo`,
          ).toBeUndefined();
          expect(
            allNextTargets.includes(q.id),
            `Nhiệm vụ hàng ngày "${q.id}" không được là 'next' của nhiệm vụ khác`,
          ).toBe(false);
        }
      }
    });
  });

  describe("3. NPC và các dịch vụ liên kết (NPCS x TRADES x RECIPES x SHOPS)", () => {
    it("danh sách NPC có id duy nhất, đứng trong trấn, không đè lên ô cản và không dẫm lên nhau", () => {
      const npcIds = NPCS.map((n) => n.id);
      expect(new Set(npcIds).size).toBe(npcIds.length);

      for (const n of NPCS) {
        expect(NPC_BY_ID[n.id]).toBe(n);
        expect(inTown(n.x, n.y), `NPC "${n.id}" không đứng trong trấn`).toBe(true);
        expect(
          circleBlocked(n.x, n.y, PLAYER_RADIUS),
          `NPC "${n.id}" đứng đè lên vật cản không thể tương tác`,
        ).toBe(false);

        for (const other of NPCS) {
          if (other !== n) {
            const dist = Math.hypot(other.x - n.x, other.y - n.y);
            expect(
              dist,
              `NPC "${n.id}" và NPC "${other.id}" đứng quá sát nhau (${dist.toFixed(1)}px <= 64px)`,
            ).toBeGreaterThan(64);
          }
        }
      }
    });

    it("bảng đổi đồ TRADES chỉ trỏ tới NPC và vật phẩm có thật", () => {
      const tradeIds = TRADES.map((t) => t.id);
      expect(new Set(tradeIds).size).toBe(tradeIds.length);

      for (const t of TRADES) {
        expect(TRADE_BY_ID[t.id]).toBe(t);
        expect(
          NPC_BY_ID[t.npcId],
          `Đổi đồ "${t.id}" trỏ tới NPC không tồn tại: "${t.npcId}"`,
        ).toBeDefined();

        for (const g of t.give) {
          const item = ITEM_BY_ID[g.itemId];
          expect(
            item,
            `Đổi đồ "${t.id}" yêu cầu vật phẩm không tồn tại: "${g.itemId}"`,
          ).toBeDefined();
          expect(Number.isInteger(g.qty) && g.qty >= 1, `Số lượng give của "${g.itemId}"`).toBe(
            true,
          );
        }

        const getItem = ITEM_BY_ID[t.get.itemId];
        expect(
          getItem,
          `Đổi đồ "${t.id}" trả vật phẩm không tồn tại: "${t.get.itemId}"`,
        ).toBeDefined();
        expect(
          Number.isInteger(t.get.qty) && t.get.qty >= 1 && t.get.qty <= getItem.stack,
          `Số lượng get của "${t.get.itemId}" trong [1, ${getItem.stack}]`,
        ).toBe(true);
      }
    });

    it("bảng công thức RECIPES chỉ trỏ tới NPC có thật, nguyên liệu và thành phẩm có thật", () => {
      const recipeIds = RECIPES.map((r) => r.id);
      expect(new Set(recipeIds).size).toBe(recipeIds.length);

      for (const r of RECIPES) {
        expect(RECIPE_BY_ID[r.id]).toBe(r);
        expect(
          NPC_BY_ID[r.npcId],
          `Công thức "${r.id}" trỏ tới NPC không tồn tại: "${r.npcId}"`,
        ).toBeDefined();

        expect(r.inputs.length, `Công thức "${r.id}" không có nguyên liệu`).toBeGreaterThan(0);
        for (const ing of r.inputs) {
          const ingItem = ITEM_BY_ID[ing.itemId];
          expect(
            ingItem,
            `Công thức "${r.id}" yêu cầu nguyên liệu không tồn tại: "${ing.itemId}"`,
          ).toBeDefined();
          expect(
            Number.isInteger(ing.qty) && ing.qty >= 1,
            `Số lượng nguyên liệu "${ing.itemId}"`,
          ).toBe(true);
        }

        const resItem = ITEM_BY_ID[r.output.itemId];
        expect(
          resItem,
          `Công thức "${r.id}" tạo ra thành phẩm không tồn tại: "${r.output.itemId}"`,
        ).toBeDefined();
        expect(
          Number.isInteger(r.output.qty) && r.output.qty >= 1 && r.output.qty <= resItem.stack,
          `Số lượng thành phẩm "${r.output.itemId}" phải trong [1, ${resItem.stack}]`,
        ).toBe(true);
      }
    });

    it("bảng cửa hàng SHOPS chỉ trỏ tới NPC có thật, bán vật phẩm có thật và không bán đồ cấm", () => {
      const shopNpcIds = SHOPS.map((s) => s.npcId);
      expect(new Set(shopNpcIds).size).toBe(shopNpcIds.length);

      for (const s of SHOPS) {
        expect(SHOP_BY_NPC[s.npcId]).toBe(s);
        expect(
          NPC_BY_ID[s.npcId],
          `Cửa hàng trỏ tới NPC không tồn tại: "${s.npcId}"`,
        ).toBeDefined();

        expect(new Set(s.itemIds).size).toBe(s.itemIds.length);
        for (const itemId of s.itemIds) {
          const itemDef = ITEM_BY_ID[itemId];
          expect(
            itemDef,
            `Cửa hàng của "${s.npcId}" bán vật phẩm không tồn tại: "${itemId}"`,
          ).toBeDefined();
          expect(itemDef.type, `Cửa hàng không được bán trang bị: "${itemId}"`).not.toBe("equip");
          expect(
            itemDef.effect?.kind,
            `Cửa hàng không được bán vật phẩm tăng tu vi trực tiếp: "${itemId}"`,
          ).not.toBe("exp");
        }
      }
    });
  });

  describe("4. Tính toàn vẹn của bảng vật phẩm (ITEMS)", () => {
    it("id vật phẩm duy nhất, stack >= 1, độ hiếm 0..4", () => {
      const itemIds = ITEMS.map((i) => i.id);
      expect(new Set(itemIds).size).toBe(itemIds.length);

      for (const item of ITEMS) {
        expect(ITEM_BY_ID[item.id]).toBe(item);
        expect(Number.isInteger(item.stack) && item.stack >= 1, `stack của "${item.id}"`).toBe(
          true,
        );
        expect(Number.isInteger(item.rarity) && item.rarity >= 0 && item.rarity <= 4).toBe(true);
      }
    });

    it("mọi trang bị (type === 'equip') phải có stack 1, slot hợp lệ, cảnh giới hợp lệ và chỉ số dương", () => {
      for (const item of ITEMS) {
        if (item.type === "equip") {
          expect(item.stack, `Trang bị "${item.id}" bắt buộc có stack = 1`).toBe(1);
          expect(item.equip, `Trang bị "${item.id}" thiếu định nghĩa equip`).toBeDefined();

          const eq = item.equip!;
          expect(
            EQUIP_SLOTS.includes(eq.slot),
            `Trang bị "${item.id}" có slot không hợp lệ: "${eq.slot}"`,
          ).toBe(true);

          expect(
            Number.isInteger(eq.reqRealm) && eq.reqRealm >= 0 && eq.reqRealm < REALMS.length,
            `reqRealm của "${item.id}"`,
          ).toBe(true);

          const maxTiers = REALMS[eq.reqRealm].tiers.length;
          expect(
            Number.isInteger(eq.reqTier) && eq.reqTier >= 0 && eq.reqTier < maxTiers,
            `reqTier của "${item.id}"`,
          ).toBe(true);

          const statEntries = Object.entries(eq.stats);
          expect(statEntries.length, `Trang bị "${item.id}" không có chỉ số nào`).toBeGreaterThan(
            0,
          );
          for (const [statKey, val] of statEntries) {
            expect(
              typeof val === "number" && Number.isFinite(val) && val > 0,
              `Chỉ số "${statKey}" của "${item.id}" phải là số dương`,
            ).toBe(true);
          }
        } else {
          expect(
            item.equip,
            `Vật phẩm không phải trang bị "${item.id}" không được có equip`,
          ).toBeUndefined();
        }
      }
    });

    it("mọi vật phẩm đều có định nghĩa giá trong ITEM_VALUE", () => {
      for (const item of ITEMS) {
        expect(
          Object.prototype.hasOwnProperty.call(ITEM_VALUE, item.id),
          `Vật phẩm "${item.id}" thiếu giá trị trong ITEM_VALUE`,
        ).toBe(true);
        const val = ITEM_VALUE[item.id]!;
        expect(
          Number.isInteger(val) && val >= 0,
          `Giá trị của "${item.id}" phải là số nguyên >= 0`,
        ).toBe(true);
      }
    });
  });
});
