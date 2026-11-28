// Hai trùm Lang Hoang, lát B của D1 (#1466, mục 75; `docs/QUAI_HOA_THAN_DE_XUAT.md` mục 3): Lang Vương (trùm nhỏ) và Thiên Lang Vương (trùm chương 5). Test canh số liệu theo hàng "Trùm" của KHUNG
// (221.030 / 422 / 230.400 / cấp 24), bậc / tiền / rơi, bộ chiêu qua khung chiêu trùm (`bossViolations`; cổng bot né hoàn hảo và độ nặng đòn ở `server/src/balance/trum.test.ts`),
// và đúng hai trùm sinh ở Lang Hoang (<= `MAX_BOSSES_PER_MAP`).
import { describe, expect, it } from "vitest";
import {
  AMBUSH_FOE_LEVEL_CAP,
  BOSS_ADDS_CAP,
  BOSS_BY_KIND,
  BOSS_MIN_TELEGRAPH_MS,
  COIN_DROPS,
  DROP_TABLES,
  ITEM_BY_ID,
  MAPS,
  MAX_BOSSES_PER_MAP,
  MONSTER_BY_ID,
  MONSTER_REALM,
  bossViolations,
  getMap,
} from "./index";

const KHUNG_TRUM = { hp: 221030, atk: 422, exp: 230400, level: 24 };

describe("hai trùm Lang Hoang (D1 #1466 lát B)", () => {
  it("Thiên Lang Vương = hàng Trùm của khung Hóa Thần (máu / công / tu vi / cấp); Lang Vương là trùm nhỏ ~ 45 % cả máu lẫn tu vi, cấp thấp hơn", () => {
    const t = MONSTER_BY_ID.thien_lang_vuong;
    const l = MONSTER_BY_ID.lang_vuong;
    expect(t.boss).toBe(true);
    expect(l.boss).toBe(true);
    for (const k of ["hp", "atk", "exp", "level"] as const)
      expect(t[k], `thien_lang_vuong.${k}`).toBe(KHUNG_TRUM[k]);
    expect(l.hp / t.hp).toBeGreaterThan(0.4);
    expect(l.hp / t.hp).toBeLessThan(0.5);
    expect(l.exp / t.exp).toBeGreaterThan(0.4);
    expect(l.exp / t.exp).toBeLessThan(0.5);
    expect(l.level).toBeLessThan(t.level);
    expect(l.minDanger).toBeLessThan(t.minDanger);
    // trùm chặn đường Hóa Thần không dùng (cấp 24 > trần 21): ngoại lệ như KHUNG mục 5
    expect(t.level).toBeGreaterThan(AMBUSH_FOE_LEVEL_CAP[5]!);
  });

  it("bậc `MONSTER_REALM` 5; tiền rơi chắc chia cho đội, đúng thứ tự theo tu vi; bảng rơi trỏ vật phẩm thật; Thiên Lang Vương rơi CHẮC Cốt Lang Vương + Hồn Tinh Thiên Lang", () => {
    for (const id of ["lang_vuong", "thien_lang_vuong"]) {
      expect(MONSTER_REALM[id], id).toBe(5);
      expect(COIN_DROPS[id].chance, id).toBe(1);
      expect(DROP_TABLES[id].length, id).toBeGreaterThan(0);
      for (const d of DROP_TABLES[id])
        expect(ITEM_BY_ID[d.itemId], `${id} -> ${d.itemId}`).toBeDefined();
    }
    const avg = (id: string) => (COIN_DROPS[id].min + COIN_DROPS[id].max) / 2;
    expect(avg("thien_lang_vuong")).toBeGreaterThan(avg("lang_vuong"));
    expect(avg("lang_vuong")).toBeGreaterThan(avg("ngan_nguyet_lang"));
    const tl = DROP_TABLES.thien_lang_vuong;
    expect(tl.find((d) => d.itemId === "cot_lang_vuong")!.chance).toBe(1);
    expect(tl.find((d) => d.itemId === "hon_tinh_thien_lang")!.chance).toBe(1);
    // trùm nhỏ rơi hồn tinh ít hơn trùm chương
    expect(
      DROP_TABLES.lang_vuong.find((d) => d.itemId === "hon_tinh_thien_lang")!.chance,
    ).toBeLessThan(1);
  });

  it("bộ chiêu: có thật, qua bossViolations, mọi đòn báo trước >= 800 ms, Thiên Lang Vương có 3 giai đoạn + cuồng nộ + triệu Ngân Nguyệt Lang (tối đa 2 con), Lang Vương một giai đoạn không triệu hồi", () => {
    const t = BOSS_BY_KIND.thien_lang_vuong;
    const l = BOSS_BY_KIND.lang_vuong;
    expect(t).toBeDefined();
    expect(l).toBeDefined();
    expect(bossViolations([t, l]).join("\n")).toBe("");
    for (const d of [t, l])
      for (const a of d.abilities)
        if (a.dmgMult > 0)
          expect(a.telegraphMs, `${d.kind}/${a.id}`).toBeGreaterThanOrEqual(BOSS_MIN_TELEGRAPH_MS);
    expect(t.phases.map((p) => p.fromHp)).toEqual([1, 0.6, 0.35]);
    expect(t.enrage).toBeDefined();
    expect(t.maxAdds).toBeGreaterThan(0);
    expect(t.maxAdds).toBeLessThanOrEqual(BOSS_ADDS_CAP);
    expect(
      t.abilities.some((a) => a.shape.t === "summon" && a.shape.kind === "ngan_nguyet_lang"),
    ).toBe(true);
    expect(l.phases).toHaveLength(1);
    expect(l.maxAdds).toBe(0);
    expect(l.abilities.every((a) => a.shape.t !== "summon")).toBe(true);
  });

  it("sinh ĐÚNG ở Lang Hoang (mỗi trùm 1 con, <= MAX_BOSSES_PER_MAP) và không ở bản đồ nào khác", () => {
    const lh = getMap("lang_hoang")!;
    expect(lh.monsterCapOf("lang_vuong")).toBe(1);
    expect(lh.monsterCapOf("thien_lang_vuong")).toBe(1);
    const trum = Object.keys(lh.monsterCap).filter((id) => MONSTER_BY_ID[id]?.boss);
    expect(trum.sort()).toEqual(["lang_vuong", "thien_lang_vuong"]);
    expect(trum.reduce((n, id) => n + lh.monsterCapOf(id), 0)).toBeLessThanOrEqual(
      MAX_BOSSES_PER_MAP,
    );
    for (const m of MAPS) {
      if (m.id === "lang_hoang") continue;
      expect(getMap(m.id)!.monsterCapOf("lang_vuong"), m.id).toBe(0);
      expect(getMap(m.id)!.monsterCapOf("thien_lang_vuong"), m.id).toBe(0);
    }
  });
});
