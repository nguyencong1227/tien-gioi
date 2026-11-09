import { describe, expect, it } from "vitest";
import { INVENTORY_SLOTS, NPC_BY_ID, RECIPE_BY_ID, SKILLS, statsFor } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { equip, equipmentOf, sanitizeEquipment, unequip } from "./equipment";
import { giveItem } from "./inventory";
import { craft, talk } from "./npc";
import { slash } from "./combat";
import { addMonster } from "./test-helpers";

function setup(realm = 1, tier = 0) {
  const t = makeWorld();
  const { p, c } = addPlayer(t.w, "a", realm, tier);
  return { ...t, p, c };
}

describe("mặc / tháo trang bị (#26)", () => {
  it("mặc: món rời túi, lên ô trang bị, chỉ số tăng đúng statsFor", () => {
    const t = setup();
    giveItem(t.w, "a", "lang_nha_kiem", 1);
    giveItem(t.w, "a", "tho_nhung_bao", 1);
    const before = statsFor(1, 0);
    equip(t.w, "a", 0);
    equip(t.w, "a", 1);
    expect(t.p.weapon).toBe("lang_nha_kiem");
    expect(t.p.robe).toBe("tho_nhung_bao");
    expect(t.c.inv[0]).toBeNull();
    expect(t.c.inv[1]).toBeNull();
    expect(t.p.maxHp).toBe(before.maxHp + 40);
    expect(t.p.maxHp).toBe(statsFor(1, 0, t.p).maxHp);
  });

  it("mặc đồ quá cảnh giới bị từ chối", () => {
    const t = setup(1, 5);
    giveItem(t.w, "a", "hac_ho_kiem", 1); // cần Luyện Khí tầng 7
    equip(t.w, "a", 0);
    expect(t.p.weapon).toBe("");
    expect(t.c.inv[0]).toEqual({ itemId: "hac_ho_kiem", qty: 1 });
    expect(t.toasts.at(-1)?.msg.text).toContain("Luyện Khí Tầng 7");
  });

  it("mặc món mới cùng ô: món cũ về đúng ô túi vừa trống (không cần ô trống)", () => {
    const t = setup(1, 6);
    giveItem(t.w, "a", "lang_nha_kiem", 1);
    equip(t.w, "a", 0);
    // Lấp đầy túi, đặt kiếm mới ở ô 5
    for (let i = 0; i < INVENTORY_SLOTS; i++) t.c.inv[i] = { itemId: "long_tho", qty: 99 };
    t.c.inv[5] = { itemId: "hac_ho_kiem", qty: 1 };
    equip(t.w, "a", 5);
    expect(t.p.weapon).toBe("hac_ho_kiem");
    expect(t.c.inv[5]).toEqual({ itemId: "lang_nha_kiem", qty: 1 });
  });

  it("không mặc được đan dược / nguyên liệu / ô rác", () => {
    const t = setup();
    giveItem(t.w, "a", "hoi_huyet_dan", 1);
    for (const v of [0, -1, 99, "0", null, 1.5]) equip(t.w, "a", v);
    expect(equipmentOf(t.p)).toEqual({ weapon: "", robe: "", talisman: "" });
  });

  it("tháo: về túi, chỉ số giảm, khí huyết không vượt tối đa mới", () => {
    const t = setup();
    giveItem(t.w, "a", "tho_nhung_bao", 1);
    equip(t.w, "a", 0);
    t.p.hp = t.p.maxHp;
    unequip(t.w, "a", "robe");
    expect(t.p.robe).toBe("");
    expect(t.c.inv[0]).toEqual({ itemId: "tho_nhung_bao", qty: 1 });
    expect(t.p.maxHp).toBe(statsFor(1, 0).maxHp);
    expect(t.p.hp).toBe(t.p.maxHp);
  });

  it("tháo khi túi đầy: từ chối, không mất đồ", () => {
    const t = setup();
    giveItem(t.w, "a", "lang_nha_kiem", 1);
    equip(t.w, "a", 0);
    for (let i = 0; i < INVENTORY_SLOTS; i++) t.c.inv[i] = { itemId: "long_tho", qty: 99 };
    unequip(t.w, "a", "weapon");
    expect(t.p.weapon).toBe("lang_nha_kiem");
    for (const v of ["khong_co", "constructor", 0, null]) unequip(t.w, "a", v);
    expect(t.p.weapon).toBe("lang_nha_kiem");
  });

  it("mặc kiếm tốt hơn thì sát thương tăng đúng số hiển thị", () => {
    const t = setup();
    const { m } = addMonster(t.w, "ho", t.p.x + 20, t.p.y);
    const noWeapon = statsFor(1, 0).atk;
    giveItem(t.w, "a", "lang_nha_kiem", 1);
    equip(t.w, "a", 0);
    expect(statsFor(1, 0, t.p).atk).toBe(noWeapon + 4);
    const hp0 = m.hp;
    const real = Math.random;
    Math.random = () => 0.5; // không bạo kích, hệ số dao động 1.0
    try {
      slash(t.w, "a", 0);
    } finally {
      Math.random = real;
    }
    expect(hp0 - m.hp).toBe(Math.round((noWeapon + 4) * SKILLS.slash.mult));
  });

  it("file lưu: chỉ giữ món có thật và đúng ô", () => {
    expect(
      sanitizeEquipment({
        weapon: "tho_nhung_bao",
        robe: "tho_nhung_bao",
        talisman: "constructor",
      }),
    ).toEqual({ weapon: "", robe: "tho_nhung_bao", talisman: "" });
    expect(sanitizeEquipment(null)).toEqual({ weapon: "", robe: "", talisman: "" });
  });
});

describe("rèn đồ ở Thợ rèn (#27)", () => {
  function atSmith() {
    const t = setup();
    t.p.x = NPC_BY_ID.tho_ren.x + 10;
    t.p.y = NPC_BY_ID.tho_ren.y;
    return t;
  }
  const rc = RECIPE_BY_ID.ren_lang_nha_kiem; // 8 nanh sói + 4 lông thỏ

  it("đủ nguyên liệu, đứng gần: trừ nguyên liệu, nhận đồ", () => {
    const t = atSmith();
    giveItem(t.w, "a", "nanh_soi", 10);
    giveItem(t.w, "a", "long_tho", 4);
    craft(t.w, "a", rc.id);
    const all = t.c.inv.filter(Boolean);
    expect(all).toContainEqual({ itemId: "nanh_soi", qty: 2 });
    expect(all).toContainEqual({ itemId: "lang_nha_kiem", qty: 1 });
    expect(all.find((s) => s!.itemId === "long_tho")).toBeUndefined();
    expect(t.invs.at(-1)?.msg.gained).toEqual([{ itemId: "lang_nha_kiem", qty: 1 }]);
  });

  it("thiếu nguyên liệu / đứng xa / id rác: không đổi gì", () => {
    const t = atSmith();
    giveItem(t.w, "a", "nanh_soi", 7);
    giveItem(t.w, "a", "long_tho", 4);
    const inv0 = JSON.stringify(t.c.inv);
    craft(t.w, "a", rc.id);
    for (const v of ["constructor", "__proto__", null, 1, "khong_co"]) craft(t.w, "a", v);
    giveItem(t.w, "a", "nanh_soi", 1);
    const inv1 = JSON.stringify(t.c.inv);
    t.p.x += 300;
    craft(t.w, "a", rc.id);
    expect(JSON.stringify(t.c.inv)).toBe(inv1);
    expect(inv0).not.toBe(inv1);
  });

  it("túi đầy: không mất nguyên liệu", () => {
    const t = atSmith();
    for (let i = 0; i < INVENTORY_SLOTS; i++) t.c.inv[i] = { itemId: "da_ho", qty: 99 };
    t.c.inv[0] = { itemId: "nanh_soi", qty: 9 }; // còn 1 sau khi trừ 8: ô không trống ra
    t.c.inv[1] = { itemId: "long_tho", qty: 5 };
    const inv0 = JSON.stringify(t.c.inv);
    craft(t.w, "a", rc.id);
    expect(JSON.stringify(t.c.inv)).toBe(inv0);
    expect(t.toasts.at(-1)?.msg.text).toBe("Túi đồ đã đầy.");
  });

  it("hội thoại Thợ rèn có lựa chọn rèn đồ, NPC khác thì không", () => {
    const t = atSmith();
    talk(t.w, "a", "tho_ren");
    expect(t.dialogs.at(-1)?.msg.options.some((o) => o.action.kind === "forge")).toBe(true);
    t.p.x = NPC_BY_ID.duoc_su.x + 10;
    t.p.y = NPC_BY_ID.duoc_su.y;
    talk(t.w, "a", "duoc_su");
    expect(t.dialogs.at(-1)?.msg.options.some((o) => o.action.kind === "forge")).toBe(false);
  });
});
