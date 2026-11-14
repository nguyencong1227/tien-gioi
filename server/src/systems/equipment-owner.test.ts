// Sáu ô trang bị phía server (M7.4, #505): ba ô riêng (hài, ngọc bội, pháp bảo) trên Player, nạp / lưu, mặc / tháo, ô chưa mở, giảm hồi chiêu (`cdr`) và giáp (`guard`).
// Chưa có món thật cho ba ô riêng (đồ ở bước nội dung sau): test chèn món thử vào `ITEM_BY_ID` rồi dọn sau mỗi ca.
import { afterEach, describe, expect, it } from "vitest";
import {
  EQUIP_SLOTS,
  ITEM_BY_ID,
  SKILL_BY_ID,
  STAT_CAPS,
  emptyEquipment,
  skillCooldownMs,
  statsFor,
  type EquipSlot,
  type EquipStats,
  type ItemDef,
} from "@tien-gioi/shared";
import { cast } from "./cast";
import { hurtPlayer, hurtPlayerDot } from "./combat";
import { equip, equipmentOf, sanitizeEquipment, setEquipment, unequip } from "./equipment";
import { keepableOf } from "./reincarnation";
import { applyPlayerStatus } from "./status";
import { cdrOf, cooldownsMax } from "./skills";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const injected: string[] = [];
function inject(id: string, slot: EquipSlot, stats: EquipStats, reqRealm = 0): void {
  ITEM_BY_ID[id] = {
    id,
    name: `Món thử ${id}`,
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "thử",
    equip: { slot, stats, reqRealm, reqTier: 0 },
    color: 0,
  } as unknown as ItemDef;
  injected.push(id);
}
afterEach(() => {
  for (const id of injected.splice(0)) delete ITEM_BY_ID[id];
});

function bag(c: { inv: ({ itemId: string; qty: number } | null)[] }, ...ids: string[]) {
  ids.forEach((id, i) => {
    c.inv[i] = { itemId: id, qty: 1 };
  });
}

describe("nạp / đặt / đọc đồ đang mặc", () => {
  it("sanitizeEquipment: món đúng ô được giữ (kể cả ô riêng); sai ô, id lạ, độc, không phải chuỗi bị bỏ", () => {
    inject("t_boots", "boots", { speed: 10 });
    inject("t_jade", "jade", { hp: 40 });
    const eq = sanitizeEquipment({
      boots: "t_boots",
      jade: "t_boots", // sai ô
      treasure: "constructor", // độc
      weapon: "khong_co",
      robe: 5,
    });
    expect(eq.boots).toBe("t_boots");
    expect(eq.jade ?? "").toBe("");
    expect(eq.treasure ?? "").toBe("");
    expect(eq.weapon).toBe("");
    expect(eq.robe).toBe("");
    expect(sanitizeEquipment({ jade: "t_jade" }).jade).toBe("t_jade");
    expect(sanitizeEquipment(null)).toEqual(emptyEquipment());
    expect(sanitizeEquipment("x")).toEqual(emptyEquipment());
  });

  it("sanitizeEquipment(raw, realm): ô CHƯA MỞ bị bỏ (pháp bảo trước Kim Đan, file sửa tay); không truyền realm thì giữ; file ba khoá cũ vẫn ba khoá", () => {
    inject("t_treasure", "treasure", { guard: 10 });
    const raw = { treasure: "t_treasure" };
    expect(sanitizeEquipment(raw, 2).treasure ?? "").toBe("");
    expect(sanitizeEquipment(raw, 3).treasure).toBe("t_treasure");
    expect(sanitizeEquipment(raw).treasure).toBe("t_treasure");
    expect(sanitizeEquipment({ weapon: "lang_nha_kiem" }, 0)).toEqual({
      weapon: "lang_nha_kiem",
      robe: "",
      talisman: "",
    });
  });

  it("setEquipment / equipmentOf đi về đủ sáu ô; ô riêng trống thì vắng khỏi kết quả (cùng dạng file lưu); đặt lại về emptyEquipment xoá cả ô riêng (luân hồi)", () => {
    inject("t_boots", "boots", { speed: 10 });
    inject("t_treasure", "treasure", { guard: 10 });
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 3, 0);
    expect(equipmentOf(p)).toEqual({ weapon: "", robe: "", talisman: "" });
    setEquipment(p, { ...emptyEquipment(), boots: "t_boots", treasure: "t_treasure" });
    expect([p.boots, p.jade, p.treasure]).toEqual(["t_boots", "", "t_treasure"]);
    expect(equipmentOf(p)).toEqual({
      weapon: "",
      robe: "",
      talisman: "",
      boots: "t_boots",
      treasure: "t_treasure",
    });
    // Vòng đi vòng về qua file lưu
    expect(sanitizeEquipment(JSON.parse(JSON.stringify(equipmentOf(p))), 3)).toEqual(
      equipmentOf(p),
    );
    setEquipment(p, emptyEquipment());
    expect([p.boots, p.jade, p.treasure]).toEqual(["", "", ""]);
    expect(equipmentOf(p)).toEqual({ weapon: "", robe: "", talisman: "" });
  });

  it("món ở ô riêng cũng nằm trong danh sách có thể giữ qua kiếp", () => {
    inject("t_jade", "jade", { hp: 40 });
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    setEquipment(p, { ...emptyEquipment(), jade: "t_jade" });
    expect(keepableOf(p, c)).toContain("t_jade");
  });
});

describe("mặc / tháo ô riêng", () => {
  it("mặc hài: vào Player.boots, món cũ về đúng ô túi, chỉ số cộng đúng, túi gửi lại", () => {
    inject("t_boots", "boots", { speed: 12, hp: 30 });
    inject("t_boots2", "boots", { speed: 20 });
    const { w, invs } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    const base = statsFor(1, 0);
    bag(c, "t_boots");
    equip(w, "a", 0);
    expect(p.boots).toBe("t_boots");
    expect(c.inv[0]).toBeNull();
    expect(p.maxHp).toBe(base.maxHp + 30);
    expect(invs.length).toBeGreaterThan(0);
    // Đổi sang món khác cùng ô: món cũ về ô túi vừa trống
    bag(c, "t_boots2");
    equip(w, "a", 0);
    expect(p.boots).toBe("t_boots2");
    expect(c.inv[0]).toEqual({ itemId: "t_boots", qty: 1 });
    expect(p.maxHp).toBe(base.maxHp); // món 2 không có hp
  });

  it("tháo ô riêng về túi; túi đầy thì từ chối và KHÔNG mất đồ", () => {
    inject("t_jade", "jade", { hp: 40 });
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    setEquipment(p, { ...emptyEquipment(), jade: "t_jade" });
    unequip(w, "a", "jade");
    expect(p.jade).toBe("");
    expect(c.inv.some((s) => s?.itemId === "t_jade")).toBe(true);
    // Mặc lại rồi làm đầy túi
    setEquipment(p, { ...emptyEquipment(), jade: "t_jade" });
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: "long_tho", qty: 1 };
    unequip(w, "a", "jade");
    expect(p.jade).toBe("t_jade");
    expect(toasts.some((t) => t.msg.text.includes("đầy"))).toBe(true);
    // Ô lạ: không làm gì, không ném lỗi
    expect(() => unequip(w, "a", "constructor")).not.toThrow();
  });

  it("ô chưa mở: pháp bảo bị TỪ CHỐI trước Kim Đan (món còn trong túi, có thông báo); mặc được từ Kim Đan", () => {
    inject("t_treasure", "treasure", { guard: 10 });
    const low = makeWorld();
    const a = addPlayer(low.w, "a", 2, 0);
    bag(a.c, "t_treasure");
    equip(low.w, "a", 0);
    expect(a.p.treasure).toBe("");
    expect(a.c.inv[0]).toEqual({ itemId: "t_treasure", qty: 1 });
    expect(
      low.toasts.some((t) => t.msg.text.includes("Pháp bảo") && t.msg.text.includes("Kim Đan")),
    ).toBe(true);

    const ok = makeWorld();
    const b = addPlayer(ok.w, "b", 3, 0);
    bag(b.c, "t_treasure");
    equip(ok.w, "b", 0);
    expect(b.p.treasure).toBe("t_treasure");
    expect(b.c.inv[0]).toBeNull();
  });

  it("món đặt thẳng vào ô chưa mở (file / lỗi) không cộng chỉ số: statsFor qua applyStats dùng realm", () => {
    inject("t_treasure", "treasure", { hp: 100 });
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 2, 0);
    const base = p.maxHp;
    p.treasure = "t_treasure";
    expect(statsFor(p.realm, p.tier, p).maxHp).toBe(base);
    p.realm = 3;
    expect(statsFor(p.realm, p.tier, p).maxHp).toBe(statsFor(3, 0).maxHp + 100);
  });
});

describe("giảm hồi chiêu (cdr) từ trang bị", () => {
  it("cdrOf = equipBonus.cdr / 100 đã kẹp; ô chưa mở không tính", () => {
    inject("t_boots", "boots", { cdr: 10 });
    inject("t_big", "talisman", { cdr: 99 });
    inject("t_treasure", "treasure", { cdr: 5 });
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 2, 0);
    expect(cdrOf(p)).toBe(0);
    p.boots = "t_boots";
    expect(cdrOf(p)).toBeCloseTo(0.1, 10);
    p.talisman = "t_big";
    expect(cdrOf(p)).toBeCloseTo(STAT_CAPS.cdr / 100, 10); // kẹp 30 %
    p.talisman = "";
    p.treasure = "t_treasure"; // realm 2: ô chưa mở
    expect(cdrOf(p)).toBeCloseTo(0.1, 10);
    p.realm = 3;
    expect(cdrOf(p)).toBeCloseTo(0.15, 10);
  });

  it("dùng chiêu đặt hồi chiêu NGẮN hơn đúng theo cdr; cdMax gửi client khớp; mặc / tháo món cdr gửi lại sổ chiêu", () => {
    inject("t_boots", "boots", { cdr: 20 });
    const { w, skillMsgs } = makeWorld();
    const { p, c } = addPlayer(w, "a", 4, 0);
    p.mp = p.maxMp;
    const id = "bon_thach_quyen";
    c.skills.learned[id] = 1;
    c.skills.slots[0] = id;
    const def = SKILL_BY_ID[id];
    w.now = 10_000;
    cast(w, "a", { slot: 2, angle: 0 });
    expect(c.skillCd[0]).toBe(10_000 + skillCooldownMs(def, 1, 0));
    // Mặc hài giảm hồi chiêu: sổ chiêu được gửi lại với cdMax mới
    skillMsgs.length = 0;
    bag(c, "t_boots");
    equip(w, "a", 0);
    expect(skillMsgs.length).toBe(1);
    expect(skillMsgs[0].msg.cdMax[0]).toBe(skillCooldownMs(def, 1, 0.2));
    expect(skillMsgs[0].msg.cdMax[0]).toBeLessThan(skillCooldownMs(def, 1, 0));
    // Dùng chiêu sau khi hết hồi: thời gian hồi mới ngắn hơn
    w.now = 20_000;
    p.mp = p.maxMp;
    cast(w, "a", { slot: 2, angle: 0 });
    expect(c.skillCd[0]).toBe(20_000 + skillCooldownMs(def, 1, 0.2));
    expect(cooldownsMax(c, cdrOf(p))[0]).toBe(skillCooldownMs(def, 1, 0.2));
    // Tháo: gửi lại, về như cũ
    skillMsgs.length = 0;
    unequip(w, "a", "boots");
    expect(skillMsgs.length).toBe(1);
    expect(skillMsgs[0].msg.cdMax[0]).toBe(skillCooldownMs(def, 1, 0));
  });

  it("mặc món KHÔNG đổi cdr thì không gửi lại sổ chiêu (tiết kiệm tin)", () => {
    inject("t_jade", "jade", { hp: 40 });
    const { w, skillMsgs } = makeWorld();
    const { c } = addPlayer(w, "a", 1, 0);
    bag(c, "t_jade");
    equip(w, "a", 0);
    expect(skillMsgs.length).toBe(0);
  });
});

describe("giáp (guard) từ trang bị", () => {
  const hit = (t: ReturnType<typeof makeWorld>, dmg: number) => {
    const m = addMonster(t.w, "lang", 0, 0);
    const p = t.w.state.players.get("a")!;
    hurtPlayer(t.w, "a", p, dmg, m.m);
  };

  it("giáp giảm sát thương nhận đúng phần trăm (làm tròn, ít nhất 1); không giáp thì nguyên số", () => {
    inject("t_jade", "jade", { guard: 20 });
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 1, 0);
    const hp0 = p.hp;
    hit(t, 50);
    expect(hp0 - p.hp).toBe(50); // chưa có giáp
    p.hp = hp0;
    p.jade = "t_jade";
    t.dmgs.length = 0;
    hit(t, 50);
    expect(hp0 - p.hp).toBe(40); // 50 x (1 - 0,2)
    expect(t.dmgs.map((d) => d.amount)).toEqual([40]); // con số hiện cho người chơi là số đã giảm
    p.hp = hp0;
    hit(t, 1);
    expect(hp0 - p.hp).toBe(1); // ít nhất 1
  });

  it("giáp bị kẹp theo STAT_CAPS.guard (40 %), cộng nhiều ô; ô chưa mở không tính", () => {
    inject("t_a", "jade", { guard: 30 });
    inject("t_b", "boots", { guard: 30 });
    inject("t_treasure", "treasure", { guard: 30 });
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 2, 0);
    p.jade = "t_a";
    p.boots = "t_b";
    p.treasure = "t_treasure"; // realm 2: chưa mở
    const hp0 = p.hp;
    hit(t, 100);
    expect(hp0 - p.hp).toBe(100 - STAT_CAPS.guard); // 60 giáp cộng nhưng kẹp 40
    p.hp = hp0;
    p.realm = 3; // pháp bảo mở: vẫn kẹp 40
    hit(t, 100);
    expect(hp0 - p.hp).toBe(100 - STAT_CAPS.guard);
  });

  it("khiên hộ thể đỡ phần ĐÃ giảm giáp (giáp trước, khiên sau); sát thương theo giây cũng được giáp giảm", () => {
    inject("t_jade", "jade", { guard: 40 });
    const t = makeWorld();
    const { p, c } = addPlayer(t.w, "a", 1, 0);
    p.jade = "t_jade";
    applyPlayerStatus(
      t.w,
      "a",
      { status: "shield", ms: 5000, ratio: 30 / p.maxHp, chance: 1 },
      0,
      "",
    );
    expect(Math.round(c.st!.list[0].pool)).toBe(30);
    const hp0 = p.hp;
    hit(t, 100); // 60 sau giáp; khiên 30 đỡ => còn 30
    expect(hp0 - p.hp).toBe(30);
    c.st = undefined;
    p.hp = hp0;
    t.dmgs.length = 0;
    hurtPlayerDot(t.w, "a", p, 10);
    expect(hp0 - p.hp).toBe(6); // 10 x 0,6
  });
});

describe("hợp đồng EQUIP_SLOTS khớp trường Player", () => {
  it("mọi ô của EQUIP_SLOTS đọc / ghi được trên Player (đủ sáu trường)", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a", 3, 0);
    for (const slot of EQUIP_SLOTS) {
      p[slot] = `x_${slot}`;
      expect(p[slot]).toBe(`x_${slot}`);
    }
  });
});
