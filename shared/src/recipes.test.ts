import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  EQUIP_SLOTS,
  PUBLIC_EQUIP_SLOTS,
  ITEMS,
  ITEM_BY_ID,
  NPC_BY_ID,
  RECIPES,
  RECIPE_BY_ID,
  canEquip,
  emptyEquipment,
  equipBonus,
  statsFor,
  stepOf,
} from "./index";

const gear = ITEMS.filter((i) => i.type === "equip");
/** Nguyên liệu có rơi ra từ quái */
const droppable = new Set(Object.values(DROP_TABLES).flatMap((t) => t.map((e) => e.itemId)));

describe("dữ liệu trang bị", () => {
  it("mọi trang bị có equip, stack 1, và ngược lại", () => {
    for (const i of ITEMS) {
      expect(i.type === "equip").toBe(!!i.equip);
      if (i.equip) expect(i.stack).toBe(1);
    }
  });

  it("mỗi ô có ít nhất 1 món, mỗi món có chỉ số dương", () => {
    // Ba ô CÔNG KHAI phải có đồ; ba ô riêng (hài, ngọc bội, pháp bảo) có đồ từ PR server M7.4 (khi đó đổi sang `EQUIP_SLOTS`)
    for (const slot of PUBLIC_EQUIP_SLOTS)
      expect(gear.some((g) => g.equip!.slot === slot)).toBe(true);
    for (const g of gear) {
      const v = Object.values(g.equip!.stats);
      expect(v.length).toBeGreaterThan(0);
      for (const x of v) expect(x).toBeGreaterThan(0);
    }
  });

  it("cùng ô, món đòi cảnh giới cao hơn thì chỉ số cao hơn", () => {
    for (const slot of EQUIP_SLOTS) {
      const list = gear
        .filter((g) => g.equip!.slot === slot)
        .sort(
          (a, b) =>
            stepOf(a.equip!.reqRealm, a.equip!.reqTier) -
            stepOf(b.equip!.reqRealm, b.equip!.reqTier),
        );
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1].equip!.stats;
        const cur = list[i].equip!.stats;
        for (const k of Object.keys(prev) as (keyof typeof prev)[]) {
          expect(cur[k] ?? 0).toBeGreaterThan(prev[k] ?? 0);
        }
      }
    }
  });

  it("vũ khí không tăng sát thương quá 40% ở cảnh giới tối thiểu của nó", () => {
    for (const g of gear.filter((x) => x.equip!.slot === "weapon")) {
      const base = statsFor(g.equip!.reqRealm, g.equip!.reqTier).atk;
      expect(g.equip!.stats.atk! / base).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("statsFor với trang bị", () => {
  it("không truyền / trang bị trống thì bằng chỉ số gốc", () => {
    expect(statsFor(1, 2, emptyEquipment())).toEqual(statsFor(1, 2));
    expect(statsFor(1, 2, {})).toEqual(statsFor(1, 2));
  });

  it("cộng đúng chỉ số của cả ba ô", () => {
    const eq = { weapon: "hac_ho_kiem", robe: "hac_ho_bao", talisman: "ho_hon_phu" };
    const base = statsFor(1, 6);
    expect(statsFor(1, 6, eq)).toEqual({
      atk: base.atk + 10,
      maxHp: base.maxHp + 110,
      maxMp: base.maxMp + 40,
      speed: base.speed + 10,
      crit: 0,
      cdr: 0,
      guard: 0,
    });
  });

  it("bỏ qua id lạ, vật phẩm không phải trang bị, món đặt sai ô", () => {
    expect(equipBonus({ weapon: "khong_co", robe: "long_tho", talisman: "lang_nha_kiem" })).toEqual(
      {
        atk: 0,
        hp: 0,
        mp: 0,
        speed: 0,
        crit: 0,
        cdr: 0,
        guard: 0,
      },
    );
  });
});

describe("canEquip", () => {
  it("so theo cảnh giới và bậc", () => {
    expect(canEquip("lang_nha_kiem", 0, 0)).toBe(false);
    expect(canEquip("lang_nha_kiem", 1, 0)).toBe(true);
    expect(canEquip("hac_ho_kiem", 1, 5)).toBe(false);
    expect(canEquip("hac_ho_kiem", 1, 6)).toBe(true);
    expect(canEquip("xich_mang_kiem", 1, 8)).toBe(false);
    expect(canEquip("xich_mang_kiem", 2, 0)).toBe(true);
  });

  it("vật phẩm không phải trang bị thì không mặc được", () => {
    expect(canEquip("hoi_huyet_dan", 9, 2)).toBe(false);
    expect(canEquip("khong_co", 9, 2)).toBe(false);
  });
});

describe("công thức rèn", () => {
  it("id không trùng, NPC tồn tại, ra đúng trang bị", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) {
      expect(RECIPE_BY_ID[r.id]).toBe(r);
      expect(NPC_BY_ID[r.npcId]).toBeDefined();
      expect(ITEM_BY_ID[r.output.itemId]?.type).toBe("equip");
      expect(r.output.qty).toBe(1);
    }
  });

  it("mọi trang bị đều rèn được", () => {
    for (const g of gear) expect(RECIPES.some((r) => r.output.itemId === g.id)).toBe(true);
  });

  it("nguyên liệu tồn tại, rơi được từ quái, số lượng vừa một ô túi", () => {
    for (const r of RECIPES) {
      expect(r.inputs.length).toBeGreaterThan(0);
      for (const i of r.inputs) {
        expect(droppable.has(i.itemId)).toBe(true);
        expect(i.qty).toBeGreaterThan(0);
        expect(i.qty).toBeLessThanOrEqual(ITEM_BY_ID[i.itemId].stack);
      }
    }
  });
});
