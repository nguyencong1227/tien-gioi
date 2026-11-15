// Tinh anh (M7.3, #504): điều kiện, số liệu nhân, giới hạn số lượng, sinh trong World thật, tiền / đồ rơi thêm, bí cảnh không có.
import { afterEach, describe, expect, it, vi } from "vitest";
import { COIN_DROPS, DROP_TABLES, MONSTERS, MONSTER_BY_ID, killExp } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { killMonster } from "./combat";
import { placeMonster, spawnMonster, tickMonsters } from "./monsters";
import {
  ELITE_ATK_MULT,
  ELITE_CHANCE,
  ELITE_COIN_MULT,
  ELITE_EXP_MULT,
  ELITE_HP_MULT,
  ELITE_MAX,
  canBeElite,
  eliteCount,
  eliteDefOf,
  rollElite,
} from "./elite";
import { seeded } from "../balance/hunt-check";

afterEach(() => vi.restoreAllMocks());

const LANG = MONSTER_BY_ID.lang;

describe("tinh anh: điều kiện", () => {
  it("chỉ quái thường hiếu chiến (aggro > 0, không trùm) có thể là tinh anh: Linh Thố hiền và mọi trùm thì không", () => {
    expect(canBeElite(MONSTER_BY_ID.tho)).toBe(false); // aggro 0
    for (const m of MONSTERS) {
      if (m.boss) expect(canBeElite(m), `trùm ${m.id}`).toBe(false);
      else expect(canBeElite(m), m.id).toBe(m.aggro > 0);
    }
    expect(canBeElite(LANG)).toBe(true);
    expect(MONSTERS.filter(canBeElite).length).toBeGreaterThanOrEqual(8);
  });

  it("rollElite: loài không đủ điều kiện hoặc phòng bí cảnh thì KHÔNG tung (không gọi rng, giữ nguyên chuỗi ngẫu nhiên)", () => {
    const { w } = makeWorld();
    const rng = vi.fn(() => 0);
    expect(rollElite(w, MONSTER_BY_ID.tho, rng)).toBe(false);
    expect(rollElite(w, MONSTER_BY_ID.mang, rng)).toBe(false); // trùm
    w.runId = "run-1"; // phòng bí cảnh
    expect(rollElite(w, LANG, rng)).toBe(false);
    expect(rng).not.toHaveBeenCalled();
  });

  it("rollElite: tung dưới ELITE_CHANCE là tinh anh, từ ELITE_CHANCE trở lên thì không", () => {
    const { w } = makeWorld();
    expect(rollElite(w, LANG, () => ELITE_CHANCE - 0.001)).toBe(true);
    expect(rollElite(w, LANG, () => ELITE_CHANCE)).toBe(false);
    expect(rollElite(w, LANG, () => 0.99)).toBe(false);
  });

  it(`rollElite: đã có ${ELITE_MAX} tinh anh trong phòng thì không thêm, dù tung trúng`, () => {
    const { w } = makeWorld();
    for (let i = 0; i < ELITE_MAX; i++) placeMonster(w, LANG, 500 + i * 30, 500, true);
    expect(eliteCount(w)).toBe(ELITE_MAX);
    expect(rollElite(w, LANG, () => 0)).toBe(false);
    // hạ một con thì lại được thêm
    const first = [...w.state.monsters.keys()][0]!;
    w.state.monsters.delete(first);
    expect(rollElite(w, LANG, () => 0)).toBe(true);
  });
});

describe("tinh anh: số liệu", () => {
  it("nhân khí huyết / công / tu vi đúng hệ số, giữ id / hành vi / bán kính, tên có hậu tố, không sửa loài gốc", () => {
    const base = { ...LANG };
    const e = eliteDefOf(LANG);
    expect(e.hp).toBe(Math.round(LANG.hp * ELITE_HP_MULT));
    expect(e.atk).toBe(Math.round(LANG.atk * ELITE_ATK_MULT));
    expect(e.exp).toBe(Math.round(LANG.exp * ELITE_EXP_MULT));
    expect(e.id).toBe(LANG.id);
    expect(e.behavior).toBe(LANG.behavior);
    expect(e.radius).toBe(LANG.radius);
    expect(e.name).toBe(`${LANG.name} tinh anh`);
    expect(LANG).toEqual(base); // loài gốc không bị đổi
    expect(eliteDefOf(LANG)).toBe(e); // cache: cùng một đối tượng
  });

  it("hệ số theo thiết kế (docs/PHAN_CONG_M7.md mục 6): khí huyết x2,5, công x1,5, tu vi x2, tiền x2; trận dài ~3-4x sát thương nhận", () => {
    expect(ELITE_HP_MULT).toBe(2.5);
    expect(ELITE_ATK_MULT).toBe(1.5);
    expect(ELITE_EXP_MULT).toBe(2);
    expect(ELITE_COIN_MULT).toBe(2);
    expect(ELITE_HP_MULT * ELITE_ATK_MULT).toBeGreaterThanOrEqual(3);
    expect(ELITE_HP_MULT * ELITE_ATK_MULT).toBeLessThanOrEqual(4);
    expect(ELITE_CHANCE).toBeLessThanOrEqual(0.05);
  });

  it("tu vi hạ tinh anh gấp ĐÔI quái thường cùng loài (killExp đọc def.exp của tinh anh)", () => {
    const e = eliteDefOf(LANG);
    expect(killExp(e, 1, 4)).toBe(2 * killExp(LANG, 1, 4));
  });
});

describe("tinh anh: sinh trong World", () => {
  it("placeMonster tinh anh: Monster.elite = 1, khí huyết đầy theo số nhân, mc.def là bản nhân, mc.elite; quái thường không có cờ", () => {
    const { w } = makeWorld();
    const eid = placeMonster(w, LANG, 300, 300, true);
    const nid = placeMonster(w, LANG, 400, 300, false);
    const e = w.state.monsters.get(eid)!;
    const n = w.state.monsters.get(nid)!;
    expect(e.elite).toBe(1);
    expect(e.hp).toBe(Math.round(LANG.hp * ELITE_HP_MULT));
    expect(e.maxHp).toBe(e.hp);
    expect(e.kind).toBe("lang"); // id giữ nguyên: client chọn ảnh theo loài
    expect(w.mctrl.get(eid)!.def).toBe(eliteDefOf(LANG));
    expect(w.mctrl.get(eid)!.elite).toBe(true);
    expect(n.elite).toBe(0);
    expect(n.hp).toBe(LANG.hp);
    expect(w.mctrl.get(nid)!.def).toBe(LANG);
    expect(w.mctrl.get(nid)!.elite).toBeUndefined();
  });

  it("spawnMonster hàng trăm con (hạt giống cố định): có tinh anh, KHÔNG vượt ELITE_MAX, mọi tinh anh đúng số liệu nhân, không con nào là trùm / quái hiền", () => {
    const { w } = makeWorld();
    const saved = Math.random;
    Math.random = seeded(7);
    try {
      for (let i = 0; i < 400; i++) {
        spawnMonster(w, LANG);
        spawnMonster(w, MONSTER_BY_ID.tho);
      }
    } finally {
      Math.random = saved;
    }
    const elites = [...w.state.monsters.entries()].filter(([, m]) => m.elite);
    expect(elites.length).toBeGreaterThanOrEqual(1);
    expect(elites.length).toBeLessThanOrEqual(ELITE_MAX);
    for (const [id, m] of elites) {
      expect(m.kind).toBe("lang"); // Linh Thố hiền không bao giờ là tinh anh
      expect(m.maxHp).toBe(Math.round(LANG.hp * ELITE_HP_MULT));
      expect(w.mctrl.get(id)!.def.atk).toBe(Math.round(LANG.atk * ELITE_ATK_MULT));
    }
  });

  it("phòng bí cảnh (runId có giá trị): không bao giờ sinh tinh anh dù tung may mắn", () => {
    const { w } = makeWorld();
    w.runId = "run-9";
    const saved = Math.random;
    Math.random = seeded(3);
    try {
      for (let i = 0; i < 300; i++) spawnMonster(w, LANG);
    } finally {
      Math.random = saved;
    }
    expect(eliteCount(w)).toBe(0);
  });
});

describe("tinh anh: phần thưởng", () => {
  /** Hạ một con `lang` (tinh anh hoặc thường) cạnh người chơi, random = 0 (chắc chắn rơi, mức tối thiểu). */
  function killOne(elite: boolean) {
    const t = makeWorld();
    const { p } = addPlayer(t.w, "A", 1, 4);
    const id = placeMonster(t.w, LANG, p.x + 10, p.y, elite);
    const mc = t.w.mctrl.get(id)!;
    mc.damageBy.set("A", 50);
    vi.spyOn(Math, "random").mockReturnValue(0);
    killMonster(t.w, id, mc);
    vi.restoreAllMocks();
    return { coin: t.w.ctrl.get("A")!.coin, loot: t.w.state.loot.size, exp: p.exp };
  }

  it("tiền rơi gấp ELITE_COIN_MULT, đồ rơi gấp đôi số món (tung bảng thêm một lần), tu vi gấp đôi", () => {
    const normal = killOne(false);
    const elite = killOne(true);
    expect(normal.coin).toBe(COIN_DROPS.lang!.min);
    expect(elite.coin).toBe(normal.coin * ELITE_COIN_MULT);
    // random = 0 -> mọi mục của bảng đều rơi; tinh anh tung hai lần nên đủ gấp đôi số món
    expect(normal.loot).toBe(DROP_TABLES.lang!.length);
    expect(elite.loot).toBe(2 * normal.loot);
    expect(elite.exp).toBeGreaterThan(normal.exp);
  });
});

describe("tinh anh: đọc mc.def (đòn dùng công đã nhân)", () => {
  it("quái đứng cạnh người chơi đánh bằng công đã nhân: tinh anh gây đúng round(atk x ELITE_ATK_MULT) (ngẫu nhiên ±15% của đòn cố định ở 1,0)", () => {
    const melee = { ...LANG, behavior: "melee" as const };
    const dmgOf = (elite: boolean) => {
      const t = makeWorld();
      const { p } = addPlayer(t.w, "A", 1, 4);
      p.hp = p.maxHp = 100_000;
      const id = placeMonster(t.w, melee, p.x + 20, p.y, elite);
      t.w.mctrl.get(id)!.target = "A";
      t.w.now = 10_000;
      // `rand(0.85, 1.15)` của đòn đánh: 0,5 -> hệ số đúng 1,0 (không còn dao động)
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      tickMonsters(t.w, 0.05);
      vi.restoreAllMocks();
      return p.maxHp - p.hp;
    };
    const base = dmgOf(false);
    const eli = dmgOf(true);
    expect(base).toBeGreaterThan(0);
    expect(base).toBe(Math.round(melee.atk));
    expect(eli).toBe(Math.round(Math.round(melee.atk * ELITE_ATK_MULT)));
  });
});
