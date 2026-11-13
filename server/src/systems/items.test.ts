// Test đơn vị: túi đồ, đan dược, rơi đồ / nhặt đồ (World giả).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DROP_TABLES,
  ITEM_BY_ID,
  LOOT_DESPAWN_MS,
  LOOT_OWNER_MS,
  PICKUP_RANGE,
  expToNext,
} from "@tien-gioi/shared";
import { makeWorld, addPlayer, addMonster } from "./test-helpers";
import { giveCommand, giveItem, sanitizeInventory, useItem } from "./inventory";
import { dropItem, pickup, releaseLootOwner, spawnLoot, tickLoot } from "./loot";
import { killMonster } from "./combat";
import { chat } from "./chat";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("túi đồ", () => {
  it("nhận đồ thì cộng dồn và báo cho đúng chủ túi kèm gained", () => {
    const { w, invs } = makeWorld();
    const { c } = addPlayer(w, "a");
    addPlayer(w, "b");
    expect(giveItem(w, "a", "nanh_soi", 3)).toBe(0);
    expect(giveItem(w, "a", "nanh_soi", 2)).toBe(0);
    expect(c.inv[0]).toEqual({ itemId: "nanh_soi", qty: 5 });
    expect(invs.every((m) => m.sid === "a")).toBe(true);
    expect(invs.at(-1)!.msg.gained).toEqual([{ itemId: "nanh_soi", qty: 2 }]);
  });

  it("túi đầy thì trả về phần thừa, không gửi gì", () => {
    const { w, invs } = makeWorld();
    const { c } = addPlayer(w, "a");
    c.inv.fill(null).forEach((_, i) => (c.inv[i] = { itemId: "long_tho", qty: 99 }));
    expect(giveItem(w, "a", "da_ho", 1)).toBe(1);
    expect(invs).toHaveLength(0);
  });

  it("đọc file lưu: bỏ món lạ, ép số lượng, luôn đủ 24 ô", () => {
    const inv = sanitizeInventory([
      { itemId: "hoi_huyet_dan", qty: 500 },
      { itemId: "khong_co", qty: 1 },
      { itemId: "long_tho", qty: -2 },
      null,
      { itemId: "da_ho", qty: "3" },
    ]);
    expect(inv).toHaveLength(24);
    expect(inv[0]).toEqual({ itemId: "hoi_huyet_dan", qty: ITEM_BY_ID.hoi_huyet_dan.stack });
    expect(inv[1]).toBeNull();
    expect(inv[2]).toBeNull();
    expect(inv[4]).toEqual({ itemId: "da_ho", qty: 3 });
    expect(sanitizeInventory(undefined).every((s) => s === null)).toBe(true);
  });
});

describe("dùng đan dược", () => {
  it("Hồi Huyết Đan hồi 40% khí huyết, trừ 1 viên, có hồi chiêu", () => {
    const { w, invs } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    giveItem(w, "a", "hoi_huyet_dan", 2);
    p.hp = 10;
    useItem(w, "a", 0);
    expect(p.hp).toBeCloseTo(10 + p.maxHp * 0.4);
    expect(c.inv[0]!.qty).toBe(1);
    expect(invs.at(-1)!.msg.cd.hoi_huyet_dan).toBe(ITEM_BY_ID.hoi_huyet_dan.cooldown);
  });

  it("dùng liên tục bị chặn bởi hồi chiêu, hết hồi chiêu thì dùng được", () => {
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    giveItem(w, "a", "hoi_linh_dan", 5);
    p.mp = 0;
    useItem(w, "a", 0);
    const mp = p.mp;
    p.mp = 0;
    useItem(w, "a", 0);
    expect(p.mp).toBe(0);
    expect(c.inv[0]!.qty).toBe(4);
    expect(toasts.at(-1)!.msg.text).toMatch(/đang hồi/);
    w.now += ITEM_BY_ID.hoi_linh_dan.cooldown!;
    useItem(w, "a", 0);
    expect(p.mp).toBe(mp);
    expect(c.inv[0]!.qty).toBe(3);
  });

  it("hồi chiêu tính riêng từng loại đan", () => {
    const { w } = makeWorld();
    const { p } = addPlayer(w, "a");
    giveItem(w, "a", "hoi_huyet_dan", 1);
    giveItem(w, "a", "hoi_linh_dan", 1);
    p.hp = 1;
    p.mp = 0;
    useItem(w, "a", 0);
    useItem(w, "a", 1);
    expect(p.hp).toBeGreaterThan(1);
    expect(p.mp).toBeGreaterThan(0);
  });

  it("Tụ Khí Đan cộng % thanh tu vi qua gainExp (đủ thì lên bậc)", () => {
    const { w, fx } = makeWorld();
    const { p } = addPlayer(w, "a", 1, 0);
    giveItem(w, "a", "tu_khi_dan", 1);
    const e = ITEM_BY_ID.tu_khi_dan.effect!;
    p.exp = p.expMax * 0.99;
    const before = p.expMax;
    useItem(w, "a", 0);
    expect(p.tier).toBe(1);
    expect(p.exp).toBeCloseTo(before * (0.99 + e.pct - 1));
    expect(fx.some((f) => f.kind === "levelup")).toBe(true);
    expect(p.expMax).toBe(expToNext(1, 1));
  });

  it("Tụ Khí Đan có trần 300 tu vi (M6): Kim Đan cộng đúng 300 thay vì 5% thanh (2400), Trúc Cơ vẫn 5% thanh", () => {
    {
      const { w } = makeWorld();
      const { p } = addPlayer(w, "a", 3, 0); // Kim Đan sơ kỳ: thanh 48000, 5% = 2400
      giveItem(w, "a", "tu_khi_dan", 1);
      p.exp = 0;
      useItem(w, "a", 0);
      expect(p.exp).toBe(300);
    }
    {
      const { w } = makeWorld();
      const { p } = addPlayer(w, "a", 2, 2); // Trúc Cơ hậu kỳ: thanh 5819, 5% = 291 < trần: KHÔNG đổi so với trước M6
      giveItem(w, "a", "tu_khi_dan", 1);
      p.exp = 0;
      useItem(w, "a", 0);
      expect(p.exp).toBe(Math.round(expToNext(2, 2) * 0.05));
      expect(p.exp).toBe(291);
    }
  });

  it("đã trọng thương thì không dùng được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    giveItem(w, "a", "hoi_huyet_dan", 1);
    p.dead = true;
    p.hp = 0;
    useItem(w, "a", 0);
    expect(p.hp).toBe(0);
    expect(c.inv[0]!.qty).toBe(1);
  });

  it("khí huyết đầy, ô trống, nguyên liệu, ô sai thì không mất đồ", () => {
    const { w } = makeWorld();
    const { c } = addPlayer(w, "a");
    giveItem(w, "a", "hoi_huyet_dan", 1);
    giveItem(w, "a", "nanh_soi", 1);
    for (const slot of [0, 1, 5, -1, 24, 1.5, "0", null]) useItem(w, "a", slot);
    expect(c.inv[0]!.qty).toBe(1);
    expect(c.inv[1]!.qty).toBe(1);
  });
});

describe("rơi đồ", () => {
  it("quái chết rơi đồ quanh xác, người gây sát thương nhiều nhất được quyền nhặt trước", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a").p;
    addPlayer(w, "b");
    const { id, mc } = addMonster(w, "lang", a.x + 20, a.y);
    mc.damageBy.set("a", 30).set("b", 110);
    vi.spyOn(Math, "random").mockReturnValue(0); // rơi đủ mọi dòng
    killMonster(w, id, mc);
    const loot = [...w.state.loot.values()];
    expect(loot.map((l) => l.itemId)).toEqual(DROP_TABLES.lang.map((d) => d.itemId));
    expect(loot.every((l) => l.owner === "b")).toBe(true);
    expect(loot.every((l) => Math.hypot(l.x - (a.x + 20), l.y - a.y) <= 16)).toBe(true);
  });

  it("người gây nhiều sát thương nhất đã trọng thương thì nhường cho người còn sống", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a").p;
    addPlayer(w, "b").p.dead = true;
    const { id, mc } = addMonster(w, "tho", a.x, a.y);
    mc.damageBy.set("a", 5).set("b", 50);
    vi.spyOn(Math, "random").mockReturnValue(0);
    killMonster(w, id, mc);
    expect([...w.state.loot.values()].every((l) => l.owner === "a")).toBe(true);
  });

  it("hết 30 giây thì ai cũng nhặt được, hết 90 giây thì biến mất", () => {
    const { w } = makeWorld();
    const id = spawnLoot(w, "da_ho", 1, 0, 0, "a");
    w.now += LOOT_OWNER_MS - 1;
    tickLoot(w);
    expect(w.state.loot.get(id)!.owner).toBe("a");
    w.now += 1;
    tickLoot(w);
    expect(w.state.loot.get(id)!.owner).toBe("");
    w.now += LOOT_DESPAWN_MS;
    tickLoot(w);
    expect(w.state.loot.has(id)).toBe(false);
    expect(w.lctrl.has(id)).toBe(false);
  });

  it("người chơi rời đi thì đồ của họ mở cho mọi người", () => {
    const { w } = makeWorld();
    const id = spawnLoot(w, "da_ho", 1, 0, 0, "a");
    releaseLootOwner(w, "a");
    expect(w.state.loot.get(id)!.owner).toBe("");
  });
});

describe("nhặt đồ", () => {
  it("nhặt đồ của mình trong tầm: vào túi, đồ trên đất biến mất", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const id = spawnLoot(w, "nanh_soi", 2, p.x + PICKUP_RANGE - 1, p.y, "a");
    pickup(w, "a", id);
    expect(c.inv[0]).toEqual({ itemId: "nanh_soi", qty: 2 });
    expect(w.state.loot.has(id)).toBe(false);
  });

  it("đồ của người khác trong 30 giây đầu bị từ chối", () => {
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "b");
    const id = spawnLoot(w, "nanh_soi", 1, p.x, p.y, "a");
    pickup(w, "b", id);
    expect(c.inv.every((s) => s === null)).toBe(true);
    expect(w.state.loot.has(id)).toBe(true);
    expect(toasts.at(-1)).toMatchObject({ sid: "b", msg: { tone: "bad" } });
    w.now += LOOT_OWNER_MS;
    tickLoot(w);
    pickup(w, "b", id);
    expect(c.inv[0]).toEqual({ itemId: "nanh_soi", qty: 1 });
  });

  it("đứng xa quá 48 px thì không nhặt được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const id = spawnLoot(w, "nanh_soi", 1, p.x + PICKUP_RANGE + 1, p.y, "");
    pickup(w, "a", id);
    expect(c.inv[0]).toBeNull();
    expect(w.state.loot.has(id)).toBe(true);
  });

  it("túi đầy thì báo, túi còn chỗ một phần thì nhặt phần đó", () => {
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: "long_tho", qty: 99 };
    const id = spawnLoot(w, "tu_khi_dan", 4, p.x, p.y, "");
    pickup(w, "a", id);
    expect(toasts.at(-1)!.msg.text).toBe("Túi đồ đã đầy.");
    expect(w.state.loot.get(id)!.qty).toBe(4);
    c.inv[7] = { itemId: "tu_khi_dan", qty: 9 }; // stack 10: còn chỗ 1
    pickup(w, "a", id);
    expect(c.inv[7]!.qty).toBe(10);
    expect(w.state.loot.get(id)!.qty).toBe(3);
  });

  it("đã trọng thương hoặc lootId rác thì không nhặt được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const id = spawnLoot(w, "nanh_soi", 1, p.x, p.y, "");
    pickup(w, "a", { id });
    pickup(w, "a", "khong_co");
    p.dead = true;
    pickup(w, "a", id);
    expect(c.inv[0]).toBeNull();
  });
});

describe("vứt đồ", () => {
  it("vứt một phần ra đất dưới chân, ai cũng nhặt được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    giveItem(w, "a", "nanh_soi", 5);
    dropItem(w, "a", 0, 2);
    expect(c.inv[0]!.qty).toBe(3);
    const [l] = [...w.state.loot.values()];
    expect(l).toMatchObject({ itemId: "nanh_soi", qty: 2, owner: "" });
    expect(l.x).toBe(p.x);
    dropItem(w, "a", 0);
    expect(c.inv[0]).toBeNull();
    expect(w.state.loot.size).toBe(2);
  });

  it("số lượng sai thì bỏ qua", () => {
    const { w } = makeWorld();
    const { c } = addPlayer(w, "a");
    giveItem(w, "a", "nanh_soi", 2);
    for (const q of [0, -1, 3, 1.5, NaN, "1", null]) dropItem(w, "a", 0, q);
    dropItem(w, "a", 3, 1);
    expect(c.inv[0]!.qty).toBe(2);
    expect(w.state.loot.size).toBe(0);
  });
});

describe("lệnh /give", () => {
  it("cho đồ vào túi mình, không gửi ra kênh chat", () => {
    const { w, chats } = makeWorld();
    const { c } = addPlayer(w, "a");
    chat(w, "a", "/give hoi_huyet_dan 3");
    expect(c.inv[0]).toEqual({ itemId: "hoi_huyet_dan", qty: 3 });
    expect(chats).toHaveLength(0);
  });

  it("vật phẩm sai thì báo lỗi", () => {
    const { w, toasts } = makeWorld();
    addPlayer(w, "a");
    giveCommand(w, "a", ["khong_co"]);
    expect(toasts.at(-1)!.msg.tone).toBe("bad");
  });

  it("tắt khi NODE_ENV=production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { w, chats } = makeWorld();
    const { c } = addPlayer(w, "a");
    chat(w, "a", "/give hoi_huyet_dan 3");
    expect(c.inv[0]).toBeNull();
    expect(chats).toHaveLength(0);
  });
});
