// Đồ ba ô riêng (M7.4, #505): bất biến của dữ liệu `owner-gear.ts`: khớp ô, khớp pháp bảo, đủ công thức + giá, chỉ số trong trần.
import { describe, expect, it } from "vitest";
import {
  EQUIP_SLOT_UNLOCK_REALM,
  ITEMS,
  ITEM_BY_ID,
  ITEM_VALUE,
  OWNER_EQUIP_SLOTS,
  RECIPES,
  STAT_CAPS,
  TREASURES,
  canEquip,
  equipBonus,
  sellPrice,
  statsFor,
  treasureOf,
  type Equipment,
} from "./index";
import { OWNER_GEAR_ITEMS } from "./owner-gear";

const byIdOf = (id: string) => ITEM_BY_ID[id];

describe("đồ ba ô riêng: dữ liệu", () => {
  it("mười bốn món, id không trùng với món nào khác, đều là trang bị ở ô RIÊNG, có chỉ số dương", () => {
    expect(OWNER_GEAR_ITEMS).toHaveLength(14);
    const ids = OWNER_GEAR_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(14);
    expect(ITEMS.filter((i) => ids.includes(i.id))).toHaveLength(14); // có trong ITEMS đúng một lần
    expect(Object.keys(ITEM_BY_ID).length).toBe(ITEMS.length); // không món nào bị đè bởi id trùng
    for (const it of OWNER_GEAR_ITEMS) {
      expect(it.type, it.id).toBe("equip");
      expect(it.stack, it.id).toBe(1);
      expect((OWNER_EQUIP_SLOTS as readonly string[]).includes(it.equip!.slot), it.id).toBe(true);
      const v = Object.values(it.equip!.stats);
      expect(v.length, it.id).toBeGreaterThan(0);
      for (const x of v) expect(x, it.id).toBeGreaterThan(0);
      expect(it.name.length, it.id).toBeGreaterThan(0);
      expect(it.desc.length, it.id).toBeGreaterThan(5);
    }
  });

  it("mỗi món một mình đã nằm trong trần (crit / cdr / guard), và cả bộ đủ ba ô riêng ở bậc cao nhất vẫn dưới trần", () => {
    for (const it of OWNER_GEAR_ITEMS) {
      const s = it.equip!.stats;
      expect(s.crit ?? 0, it.id).toBeLessThanOrEqual(STAT_CAPS.crit);
      expect(s.cdr ?? 0, it.id).toBeLessThanOrEqual(STAT_CAPS.cdr);
      expect(s.guard ?? 0, it.id).toBeLessThanOrEqual(STAT_CAPS.guard);
    }
    const best: Equipment = {
      weapon: "hac_giao_kiem",
      robe: "giao_lan_bao",
      talisman: "giao_long_phu",
      boots: "giao_anh_ngoa",
      jade: "giao_chau_boi",
      treasure: "dinh_tam_chung",
    };
    const b = equipBonus(best, 3);
    expect(b.guard).toBeLessThan(STAT_CAPS.guard);
    expect(b.cdr).toBeLessThan(STAT_CAPS.cdr);
    expect(b.guard).toBeGreaterThan(0);
    expect(b.cdr).toBeGreaterThan(0);
  });

  it("hài và ngọc bội: chỉ số tăng đều theo bậc yêu cầu (bốn bậc mỗi loại)", () => {
    for (const slot of ["boots", "jade"] as const) {
      const list = OWNER_GEAR_ITEMS.filter((i) => i.equip!.slot === slot);
      expect(list).toHaveLength(4);
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1].equip!;
        const cur = list[i].equip!;
        expect(cur.reqRealm * 10 + cur.reqTier).toBeGreaterThan(prev.reqRealm * 10 + prev.reqTier);
        expect(list[i].rarity).toBeGreaterThanOrEqual(list[i - 1].rarity);
        for (const k of Object.keys(prev.stats) as (keyof typeof prev.stats)[])
          expect(cur.stats[k] ?? 0, `${list[i].id}.${k}`).toBeGreaterThan(prev.stats[k] ?? 0);
      }
    }
  });
});

describe("pháp bảo: món <-> nội tại", () => {
  it("mỗi TREASURES có đúng MỘT món trang bị cùng id ở ô `treasure`, và mọi món ở ô `treasure` trỏ tới pháp bảo có thật", () => {
    const items = OWNER_GEAR_ITEMS.filter((i) => i.equip!.slot === "treasure");
    expect(items).toHaveLength(TREASURES.length);
    for (const t of TREASURES) {
      const it = items.filter((i) => i.equip!.treasure === t.id);
      expect(it, t.id).toHaveLength(1);
      expect(it[0].id).toBe(t.id);
      expect(treasureOf(it[0].equip!.treasure)).toBe(t);
    }
    for (const it of items) expect(treasureOf(it.equip!.treasure), it.id).toBeDefined();
    // Không món nào ngoài ô pháp bảo mang nội tại
    for (const it of ITEMS)
      if (it.equip && it.equip.slot !== "treasure")
        expect(it.equip.treasure, it.id).toBeUndefined();
  });

  it("pháp bảo đòi cảnh giới không thấp hơn lúc ô mở (Kim Đan): không có món mặc được mà ô vẫn khoá", () => {
    for (const it of OWNER_GEAR_ITEMS.filter((i) => i.equip!.slot === "treasure")) {
      expect(it.equip!.reqRealm, it.id).toBeGreaterThanOrEqual(EQUIP_SLOT_UNLOCK_REALM.treasure!);
      expect(canEquip(it.id, 2, 2)).toBe(false);
      expect(canEquip(it.id, it.equip!.reqRealm, it.equip!.reqTier)).toBe(true);
    }
  });
});

describe("đồ ba ô riêng: công thức rèn và giá", () => {
  it("mỗi món có đúng MỘT công thức; Lạc Hà (miễn phí) cho bậc Luyện Khí / Trúc Cơ, Vọng Sương (có phí) cho bậc Kim Đan và pháp bảo", () => {
    for (const it of OWNER_GEAR_ITEMS) {
      const rs = RECIPES.filter((r) => r.output.itemId === it.id);
      expect(rs, it.id).toHaveLength(1);
      const r = rs[0];
      const kimDan = it.equip!.reqRealm >= 3;
      expect(r.npcId, it.id).toBe(kimDan ? "tho_ren_suong" : "tho_ren");
      if (kimDan) expect(r.coin ?? 0, it.id).toBeGreaterThan(0);
      else expect(r.coin, it.id).toBeUndefined();
      for (const i of r.inputs) expect(byIdOf(i.itemId), `${it.id} cần ${i.itemId}`).toBeDefined();
    }
  });

  it("mỗi món có giá trị gốc dương trong ITEM_VALUE (bán được), bán lại luôn thấp hơn phí rèn Kim Đan", () => {
    for (const it of OWNER_GEAR_ITEMS) {
      expect(ITEM_VALUE[it.id], it.id).toBeGreaterThan(0);
      expect(sellPrice(it.id), it.id).toBeGreaterThan(0);
      const r = RECIPES.find((x) => x.output.itemId === it.id)!;
      const mats = r.inputs.reduce((s, i) => s + (ITEM_VALUE[i.itemId] ?? 0) * i.qty, 0);
      expect(sellPrice(it.id), it.id).toBeLessThan(mats + (r.coin ?? 0));
    }
  });
});

describe("đồ ba ô riêng trong chỉ số", () => {
  it("mặc bộ ô riêng cộng đúng vào statsFor ở Kim Đan hậu kỳ; trước Kim Đan pháp bảo không tính", () => {
    const eq: Equipment = {
      weapon: "",
      robe: "",
      talisman: "",
      boots: "giao_anh_ngoa",
      jade: "giao_chau_boi",
      treasure: "dinh_tam_chung",
    };
    const base = statsFor(3, 2);
    const s = statsFor(3, 2, eq);
    expect(s.maxHp).toBe(base.maxHp + 280 + 200);
    expect(s.maxMp).toBe(base.maxMp + 90);
    expect(s.speed).toBe(base.speed + 20);
    expect([s.guard, s.cdr]).toEqual([5, 5]);
    // Trúc Cơ: hài / ngọc bội bậc Kim Đan chưa mặc được ở server, nhưng statsFor chỉ bỏ ô CHƯA MỞ (pháp bảo)
    const low = statsFor(2, 2, eq);
    expect(low.maxHp).toBe(statsFor(2, 2).maxHp + 280); // ngọc bội tính, pháp bảo (ô chưa mở) không
  });
});
