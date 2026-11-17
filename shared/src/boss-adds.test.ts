// Quái con do TRÙM triệu hồi (#887, mục 42): quy ước dữ liệu. Chỉ do `summonAdds` dựng; không rơi gì, không tu vi, không sinh ngoài hoang.
import { describe, expect, it } from "vitest";
import {
  BOSSES,
  COIN_DROPS,
  DROP_TABLES,
  MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  SUMMON_ONLY_KINDS,
  getMap,
} from "./index";

describe("quái con của trùm (SUMMON_ONLY_KINDS, #887)", () => {
  it("danh sách có đủ rắn con (Xích Mãng) và phân thân Yêu Vương, mỗi id là một loài có thật, không trùng", () => {
    expect(SUMMON_ONLY_KINDS).toEqual(expect.arrayContaining(["ran_con", "phan_than_yeu_vuong"]));
    expect(new Set(SUMMON_ONLY_KINDS).size).toBe(SUMMON_ONLY_KINDS.length);
    for (const id of SUMMON_ONLY_KINDS) expect(MONSTER_BY_ID[id], id).toBeDefined();
  });

  it("KHÔNG sinh ngoài hoang: MONSTER_CAP = 0 và không bản đồ nào (kể cả bí cảnh) khai báo số lượng > 0", () => {
    for (const id of SUMMON_ONLY_KINDS) {
      expect(MONSTER_CAP[id], id).toBe(0);
      for (const def of MAPS) {
        expect(getMap(def.id)!.monsterCapOf(id), `${def.id}/${id}`).toBe(0);
      }
    }
  });

  it("KHÔNG rơi gì: exp 0, không mục trong DROP_TABLES / COIN_DROPS", () => {
    for (const id of SUMMON_ONLY_KINDS) {
      const m = MONSTER_BY_ID[id]!;
      expect(m.exp, id).toBe(0);
      expect(DROP_TABLES[id], id).toBeUndefined();
      expect(COIN_DROPS[id], id).toBeUndefined();
    }
  });

  it("là quái thường: không phải trùm, không hệ (không làm đổi sát thương chiêu người chơi), chỉ số hữu hạn và dương", () => {
    for (const id of SUMMON_ONLY_KINDS) {
      const m = MONSTER_BY_ID[id]!;
      expect(m.boss, id).toBeUndefined();
      expect(m.element, id).toBeUndefined();
      for (const k of ["hp", "atk", "speed", "radius", "aggro", "attackRange", "attackCd"] as const)
        expect(Number.isFinite(m[k]) && m[k] > 0, `${id}.${k}`).toBe(true);
      expect(Number.isInteger(m.level) && m.level >= 0, `${id}.level`).toBe(true);
      expect(Number.isInteger(m.color), `${id}.color`).toBe(true);
    }
  });

  it("MẠNH VỪA PHẢI so với trùm gọi chúng: máu <= 10%, công <= 40% của trùm cùng bậc (nguy hiểm vì đông, không vì một đòn)", () => {
    const pairs: [string, string][] = [
      ["ran_con", "mang"], // Xích Mãng gọi rắn con
      ["phan_than_yeu_vuong", "yeu_vuong"], // Linh Hư Yêu Vương gọi phân thân
    ];
    for (const [add, boss] of pairs) {
      const a = MONSTER_BY_ID[add]!;
      const b = MONSTER_BY_ID[boss]!;
      expect(a.hp, add).toBeLessThanOrEqual(b.hp * 0.1);
      // phân thân Yêu Vương: công trùm bí cảnh rất thấp (16, "bao máu"): so với công của quái Kim Đan cùng bậc, không so với 16
      if (boss === "mang") expect(a.atk, add).toBeLessThanOrEqual(b.atk * 0.4);
      expect(a.level, add).toBeLessThanOrEqual(b.level);
    }
  });

  it("mọi loài khác ĐỀU phải có bảng rơi (miễn trừ chỉ dành cho danh sách này)", () => {
    for (const m of MONSTERS) {
      if (SUMMON_ONLY_KINDS.includes(m.id)) continue;
      expect(DROP_TABLES[m.id]?.length, m.id).toBeGreaterThan(0);
    }
  });

  it("mọi `summon` trong BOSSES trỏ tới loài có thật, và nếu là loài chỉ-triệu-hồi thì đúng bậc trùm gọi", () => {
    for (const b of BOSSES) {
      for (const ab of b.abilities) {
        if (ab.shape.t !== "summon") continue;
        const k = MONSTER_BY_ID[ab.shape.kind];
        expect(k, `${b.kind}/${ab.id}`).toBeDefined();
        if (SUMMON_ONLY_KINDS.includes(ab.shape.kind))
          expect(k!.level, `${b.kind}/${ab.id}`).toBeLessThanOrEqual(MONSTER_BY_ID[b.kind]!.level);
      }
    }
  });
});
