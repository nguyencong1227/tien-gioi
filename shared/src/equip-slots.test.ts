// Hợp đồng sáu ô trang bị (M7.4, #505): ô công khai / riêng, mở theo cảnh giới, trần chỉ số phần trăm, pháp bảo (`docs/THIET_KE_NHAN_VAT_6_O.md` mục 8).
import { afterEach, describe, expect, it } from "vitest";
import {
  CDR_CAP,
  ELEMENT_BY_ID,
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  EQUIP_SLOT_UNLOCK_REALM,
  ITEMS,
  ITEM_BY_ID,
  OWNER_EQUIP_SLOTS,
  PUBLIC_EQUIP_SLOTS,
  REALMS,
  STAT_CAPS,
  TREASURES,
  emptyEquipment,
  equipBonus,
  equipSlotOpen,
  statsFor,
  treasureOf,
  type EquipSlot,
  type EquipStats,
  type ItemDef,
} from "./index";

/** Thêm món thử vào bảng chung (bảng là `Record` thường): dọn sau mỗi ca. */
const injected: string[] = [];
function inject(id: string, slot: EquipSlot, stats: EquipStats, treasure?: string): void {
  const def = {
    id,
    name: id,
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "thử",
    equip: { slot, stats, reqRealm: 0, reqTier: 0, ...(treasure ? { treasure } : {}) },
    color: 0,
  } as unknown as ItemDef;
  ITEM_BY_ID[id] = def;
  injected.push(id);
}
afterEach(() => {
  for (const id of injected.splice(0)) delete ITEM_BY_ID[id];
});

describe("sáu ô trang bị", () => {
  it("thứ tự hiển thị, tên, chia ô công khai / riêng", () => {
    expect(EQUIP_SLOTS).toEqual(["weapon", "robe", "talisman", "boots", "jade", "treasure"]);
    expect(PUBLIC_EQUIP_SLOTS).toEqual(["weapon", "robe", "talisman"]);
    expect(OWNER_EQUIP_SLOTS).toEqual(["boots", "jade", "treasure"]);
    expect([...PUBLIC_EQUIP_SLOTS, ...OWNER_EQUIP_SLOTS]).toEqual(EQUIP_SLOTS);
    expect(EQUIP_SLOTS.map((s) => EQUIP_SLOT_NAMES[s])).toEqual([
      "Vũ khí",
      "Pháp bào",
      "Hộ phù",
      "Hài",
      "Ngọc bội",
      "Pháp bảo",
    ]);
  });

  it("emptyEquipment: ba ô công khai rỗng, ba ô riêng VẮNG (= trống, giữ nguyên file lưu / mã cũ), mỗi lần một đối tượng mới", () => {
    const a = emptyEquipment();
    expect(a).toEqual({ weapon: "", robe: "", talisman: "" });
    for (const s of OWNER_EQUIP_SLOTS) expect(s in a).toBe(false);
    a.boots = "x";
    a.weapon = "y";
    expect(emptyEquipment()).toEqual({ weapon: "", robe: "", talisman: "" });
  });

  it("ô mở theo cảnh giới: pháp bảo từ Kim Đan (realm 3), các ô khác luôn mở; ô lạ / realm rác thì chưa", () => {
    expect(EQUIP_SLOT_UNLOCK_REALM).toEqual({ treasure: 3 });
    expect(REALMS[3].name).toBe("Kim Đan");
    for (const s of EQUIP_SLOTS.filter((x) => x !== "treasure")) {
      expect(equipSlotOpen(s, 0)).toBe(true);
    }
    expect(equipSlotOpen("treasure", 0)).toBe(false);
    expect(equipSlotOpen("treasure", 2)).toBe(false);
    expect(equipSlotOpen("treasure", 3)).toBe(true);
    expect(equipSlotOpen("treasure", 5)).toBe(true);
    for (const bad of ["constructor", "__proto__", "", "Weapon", 1, null, undefined, {}]) {
      expect(equipSlotOpen(bad, 9)).toBe(false);
    }
    for (const r of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(equipSlotOpen("weapon", r)).toBe(false);
    }
  });
});

describe("trần chỉ số phần trăm của trang bị", () => {
  it("STAT_CAPS đúng issue #505; CDR_CAP (phân số, dùng ở hồi chiêu) lấy từ cùng một nguồn", () => {
    expect(STAT_CAPS).toEqual({ crit: 40, cdr: 30, guard: 40 });
    expect(CDR_CAP).toBe(STAT_CAPS.cdr / 100);
  });

  it("equipBonus cộng từ nhiều ô rồi KẸP: dưới trần giữ nguyên, trên trần về đúng trần", () => {
    inject("t_boots", "boots", { crit: 15, cdr: 10, guard: 20, speed: 12 });
    inject("t_jade", "jade", { crit: 20, cdr: 15, guard: 15, hp: 50 });
    const under = equipBonus({ boots: "t_boots" });
    expect([under.crit, under.cdr, under.guard, under.speed]).toEqual([15, 10, 20, 12]);
    const over = equipBonus({ boots: "t_boots", jade: "t_jade" });
    expect(over.crit).toBe(35); // 15 + 20 < 40
    expect(over.cdr).toBe(25); // 10 + 15 < 30
    expect(over.guard).toBe(35); // 20 + 15 < 40
    expect(over.hp).toBe(50);
    inject("t_big", "talisman", { crit: 99, cdr: 99, guard: 99 });
    const cap = equipBonus({ boots: "t_boots", jade: "t_jade", talisman: "t_big" });
    expect([cap.crit, cap.cdr, cap.guard]).toEqual([
      STAT_CAPS.crit,
      STAT_CAPS.cdr,
      STAT_CAPS.guard,
    ]);
    // Đúng bằng trần thì giữ nguyên (biên `<=`)
    inject("t_exact", "robe", { crit: STAT_CAPS.crit, cdr: STAT_CAPS.cdr, guard: STAT_CAPS.guard });
    const exact = equipBonus({ robe: "t_exact" });
    expect([exact.crit, exact.cdr, exact.guard]).toEqual([40, 30, 40]);
  });

  it("số âm hoặc không hữu hạn trong dữ liệu đồ không bao giờ làm chỉ số âm / NaN", () => {
    inject("t_neg", "boots", { crit: -50, cdr: Number.NaN, guard: Number.POSITIVE_INFINITY });
    const b = equipBonus({ boots: "t_neg" });
    expect([b.crit, b.cdr, b.guard]).toEqual([0, 0, 0]);
  });

  it("statsFor trả crit / cdr / guard đã kẹp (cùng số với equipBonus)", () => {
    inject("t_boots", "boots", { crit: 15, cdr: 10, guard: 20 });
    inject("t_big", "talisman", { crit: 99, cdr: 99, guard: 99 });
    const s = statsFor(1, 0, { boots: "t_boots", talisman: "t_big" });
    expect([s.crit, s.cdr, s.guard]).toEqual([40, 30, 40]);
    const t = statsFor(1, 0, { boots: "t_boots" });
    expect([t.crit, t.cdr, t.guard]).toEqual([15, 10, 20]);
    expect([statsFor(1, 0).crit, statsFor(1, 0).cdr, statsFor(1, 0).guard]).toEqual([0, 0, 0]);
  });

  it("món đặt SAI ô không có tác dụng (kể cả ô riêng)", () => {
    inject("t_boots", "boots", { crit: 15 });
    expect(equipBonus({ jade: "t_boots" }).crit).toBe(0);
    expect(equipBonus({ boots: "t_boots" }).crit).toBe(15);
  });

  it("ô CHƯA MỞ không có tác dụng khi truyền realm (pháp bảo trước Kim Đan, file lưu sửa tay); không truyền realm thì không xét", () => {
    inject("t_treasure", "treasure", { guard: 12, hp: 30 });
    const eq = { treasure: "t_treasure" };
    expect(equipBonus(eq, 2).guard).toBe(0);
    expect(equipBonus(eq, 2).hp).toBe(0);
    expect(equipBonus(eq, 3).guard).toBe(12);
    expect(equipBonus(eq).guard).toBe(12);
    expect(statsFor(2, 0, eq).guard).toBe(0);
    expect(statsFor(3, 0, eq).guard).toBe(12);
    expect(statsFor(3, 0, eq).maxHp).toBe(statsFor(3, 0).maxHp + 30);
  });
});

describe("pháp bảo (TREASURES)", () => {
  it("sáu loại, id không trùng, có tên và câu mô tả hoàn chỉnh", () => {
    expect(TREASURES).toHaveLength(6);
    expect(new Set(TREASURES.map((t) => t.id)).size).toBe(6);
    for (const t of TREASURES) {
      expect(t.name.length, t.id).toBeGreaterThan(0);
      expect(t.desc.length, t.id).toBeGreaterThan(10);
      expect(t.desc.endsWith("."), t.id).toBe(true);
      expect(t.desc, t.id).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it("`desc` nhắc ĐÚNG từng số của `params` (tỉ lệ -> `N %`, giây -> `N giây`, `ms` -> giây), để câu chữ và số không lệch nhau", () => {
    for (const t of TREASURES) {
      const entries = Object.entries(t.params);
      expect(entries.length, t.id).toBeGreaterThan(0);
      for (const [k, v] of entries) {
        expect(Number.isFinite(v) && v > 0, `${t.id}.${k}`).toBe(true);
        const shown =
          k === "ms"
            ? `${v / 1000} giây`
            : /S$/.test(k) && !/Ratio/.test(k)
              ? `${v} giây`
              : `${Math.round(v * 100)} %`;
        expect(t.desc, `${t.id}.${k} = ${v} => "${shown}"`).toContain(shown);
      }
    }
  });

  it("pháp bảo tăng sát thương một hệ nêu đúng hệ có thật; ngoài ra không có `element`", () => {
    for (const t of TREASURES) {
      if (t.params.dmgRatio !== undefined) {
        expect(t.element, t.id).toBeDefined();
        expect(ELEMENT_BY_ID[t.element!], t.id).toBeDefined();
        const name = ELEMENT_BY_ID[t.element!].name;
        expect(t.desc, t.id).toContain(`hệ ${name}`);
      } else {
        expect(t.element, t.id).toBeUndefined();
      }
    }
  });

  it("treasureOf: id hợp lệ trả đúng định nghĩa; id lạ / độc / không phải chuỗi trả undefined", () => {
    for (const t of TREASURES) expect(treasureOf(t.id)).toBe(t);
    for (const bad of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "",
      "xx",
      1,
      null,
      undefined,
      {},
      [],
    ]) {
      expect(treasureOf(bad)).toBeUndefined();
    }
  });

  it("món trang bị: `equip.treasure` chỉ ở ô `treasure` và trỏ tới pháp bảo có thật; món ở ô `treasure` phải có pháp bảo", () => {
    for (const it of ITEMS) {
      const e = it.equip;
      if (!e) continue;
      if (e.treasure !== undefined) {
        expect(e.slot, it.id).toBe("treasure");
        expect(treasureOf(e.treasure), it.id).toBeDefined();
      }
      if (e.slot === "treasure") expect(e.treasure, it.id).toBeDefined();
    }
  });
});
