// Bạo kích từ trang bị (M7.4, #505): `Stats.crit` (điểm %, kẹp `STAT_CAPS.crit`) CỘNG vào xác suất bạo kích cơ bản `CRIT_CHANCE`, ở đánh thường (`hitMonster`) và chiêu (`cast`).
// Chưa tính ở PK thách đấu (`duelHit`, docs/THIET_KE_PK.md quyết riêng). Món thử chèn vào `ITEM_BY_ID` rồi dọn.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_BY_ID,
  STAT_CAPS,
  type EquipSlot,
  type EquipStats,
  type ItemDef,
} from "@tien-gioi/shared";
import { cast } from "./cast";
import { hitMonster } from "./combat";
import { CRIT_CHANCE, CRIT_MULT, rollDamage } from "./damage";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const injected: string[] = [];
function inject(id: string, slot: EquipSlot, stats: EquipStats): void {
  ITEM_BY_ID[id] = {
    id,
    name: id,
    type: "equip",
    stack: 1,
    rarity: 2,
    desc: "thử",
    equip: { slot, stats, reqRealm: 0, reqTier: 0 },
    color: 0,
  } as unknown as ItemDef;
  injected.push(id);
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of injected.splice(0)) delete ITEM_BY_ID[id];
});

/** Mỗi lần gọi trả lần lượt các số trong `seq` (lặp lại số cuối khi hết). */
function mockRandom(seq: number[]) {
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => seq[Math.min(i++, seq.length - 1)]);
}

describe("rollDamage: xác suất bạo kích = cơ bản + trang bị", () => {
  it("không trang bị: ngưỡng đúng CRIT_CHANCE; có critPct thì ngưỡng dịch đúng critPct / 100", () => {
    mockRandom([CRIT_CHANCE - 0.001, 0.5]);
    expect(rollDamage(100, 1).crit).toBe(true);
    mockRandom([CRIT_CHANCE + 0.001, 0.5]);
    expect(rollDamage(100, 1).crit).toBe(false);
    mockRandom([CRIT_CHANCE + 0.2 - 0.001, 0.5]);
    expect(rollDamage(100, 1, 20).crit).toBe(true);
    mockRandom([CRIT_CHANCE + 0.2 + 0.001, 0.5]);
    expect(rollDamage(100, 1, 20).crit).toBe(false);
  });

  it("bạo kích nhân CRIT_MULT; critPct rác (âm, NaN, vô cực) coi như 0; xác suất không vượt 1", () => {
    mockRandom([0, 0.5]); // dao động 0,5 -> hệ số đúng giữa 0,9..1,1 = 1
    const hit = rollDamage(100, 1);
    mockRandom([0.99, 0.5]);
    const norm = rollDamage(100, 1);
    expect(hit.dmg).toBe(Math.round(norm.dmg * CRIT_MULT));
    for (const bad of [-30, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      // Coi như 0: ngưỡng vẫn là CRIT_CHANCE (dưới ngưỡng => bạo kích, trên ngưỡng => không); số rác không được kéo ngưỡng xuống hay làm nó thành NaN
      mockRandom([CRIT_CHANCE - 0.05, 0.5]);
      expect(rollDamage(100, 1, bad).crit, `${bad} dưới ngưỡng`).toBe(true);
      mockRandom([CRIT_CHANCE + 0.05, 0.5]);
      expect(rollDamage(100, 1, bad).crit, `${bad} trên ngưỡng`).toBe(false);
    }
    mockRandom([0.999999, 0.5]);
    expect(rollDamage(100, 1, 1e9).crit).toBe(true); // kẹp ở xác suất 1
  });

  it("đúng HAI lần gọi Math.random (bạo kích rồi dao động) dù có critPct hay không: chuỗi ngẫu nhiên của bench không đổi", () => {
    const spy = mockRandom([0.5]);
    rollDamage(100, 1);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();
    rollDamage(100, 1, 25);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("bạo kích từ trang bị qua đánh thường và chiêu", () => {
  /** Quái nhiều khí huyết để không chết giữa hai lần đánh. */
  const tough = (t: ReturnType<typeof makeWorld>, id: string) => {
    const mon = t.w.state.monsters.get(id)!;
    mon.hp = mon.maxHp = 1e9;
    return mon;
  };
  const critOf = (t: ReturnType<typeof makeWorld>, id: string) =>
    t.dmgs.filter((d) => d.target === id && !d.toPlayer).map((d) => d.crit === true);

  it("đánh thường: có trang bị bạo kích thì cùng một con số ngẫu nhiên từ KHÔNG bạo kích thành bạo kích", () => {
    inject("t_crit", "jade", { crit: 30 });
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 1, 0);
    const m = addMonster(t.w, "tho", p.x + 20, p.y);
    mockRandom([0.35, 0.5]); // ngưỡng cơ bản 0,1: không; có +30 % (0,4): có
    hitMonster(t.w, m.id, t.w.state.monsters.get(m.id)!, "a", p, 1);
    expect(critOf(t, m.id)).toEqual([false]);
    p.jade = "t_crit";
    t.dmgs.length = 0;
    mockRandom([0.35, 0.5]);
    hitMonster(t.w, m.id, t.w.state.monsters.get(m.id)!, "a", p, 1);
    expect(critOf(t, m.id)).toEqual([true]);
  });

  it("bạo kích từ nhiều ô cộng rồi kẹp theo STAT_CAPS.crit (0,1 + 0,4 = 0,5): 0,49 bạo kích, 0,51 thì không", () => {
    inject("t_a", "jade", { crit: 30 });
    inject("t_b", "boots", { crit: 30 });
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 1, 0);
    p.jade = "t_a";
    p.boots = "t_b"; // 60 điểm cộng, kẹp còn 40
    const m = addMonster(t.w, "tho", p.x + 20, p.y);
    const mon = () => t.w.state.monsters.get(m.id)!;
    mockRandom([CRIT_CHANCE + STAT_CAPS.crit / 100 - 0.01, 0.5]);
    hitMonster(t.w, m.id, mon(), "a", p, 1);
    mockRandom([CRIT_CHANCE + STAT_CAPS.crit / 100 + 0.01, 0.5]);
    hitMonster(t.w, m.id, mon(), "a", p, 1);
    expect(critOf(t, m.id)).toEqual([true, false]);
  });

  it("ô CHƯA MỞ không cộng bạo kích (pháp bảo trước Kim Đan), mở rồi thì có", () => {
    inject("t_tc", "treasure", { crit: 30 });
    const t = makeWorld();
    const { p } = addPlayer(t.w, "a", 2, 0);
    p.treasure = "t_tc";
    const m = addMonster(t.w, "tho", p.x + 20, p.y);
    tough(t, m.id);
    mockRandom([0.35, 0.5]);
    hitMonster(t.w, m.id, t.w.state.monsters.get(m.id)!, "a", p, 1);
    p.realm = 3;
    mockRandom([0.35, 0.5]);
    hitMonster(t.w, m.id, t.w.state.monsters.get(m.id)!, "a", p, 1);
    expect(critOf(t, m.id)).toEqual([false, true]);
  });

  it("chiêu thức (cast): bạo kích từ trang bị cũng tính cho từng lần trúng", () => {
    inject("t_crit", "jade", { crit: 30 });
    const t = makeWorld();
    const { p, c } = addPlayer(t.w, "a", 4, 0);
    p.mp = p.maxMp;
    c.skills.learned.bon_thach_quyen = 1;
    c.skills.slots[0] = "bon_thach_quyen";
    const m = addMonster(t.w, "tho", p.x + 30, p.y);
    tough(t, m.id);
    t.w.now = 10_000;
    mockRandom([0.35, 0.5]);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(critOf(t, m.id)).toEqual([false]);
    p.jade = "t_crit";
    t.dmgs.length = 0;
    t.w.now = 30_000;
    p.mp = p.maxMp;
    mockRandom([0.35, 0.5]);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(critOf(t, m.id)).toEqual([true]);
  });
});
