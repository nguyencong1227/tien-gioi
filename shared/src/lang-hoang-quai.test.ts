// Quái Hóa Thần của Lang Hoang, lát A1 của D1 (#1466, mục 75; `docs/QUAI_HOA_THAN_DE_XUAT.md` mục 3, khung `docs/KHUNG_HOA_THAN.md` mục 4.1).
// Sáu loài thường đã KHAI BÁO nhưng CHƯA CHO SINH (lát A3 khai `monsterCap` của `lang_hoang` rồi sửa ca "chưa sinh" ở đây). Test canh: số liệu bám vai của khung,
// hành vi theo vai, cấp trong trần chặn đường Hóa Thần, thứ tự `minDanger` theo `exp`, bậc `MONSTER_REALM` 5, bảng rơi + tiền, và đúng là chưa sinh ở đâu.
import { describe, expect, it } from "vitest";
import {
  AMBUSH_FOE_LEVEL_CAP,
  COIN_DROPS,
  DROP_TABLES,
  ITEM_BY_ID,
  MAPS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  MONSTER_REALM,
  WILD_MONSTERS,
  getMap,
} from "./index";

/** Vai Hóa Thần của khung (mục 4.1): máu / công / tu vi khi hạ; cấp (mẫu Hàn Lang, Phong Nha, Cốt Tượng, Độc Tước). */
const ROLE = {
  gong: { hp: 7817, atk: 464, exp: 7920, level: 19 },
  ban: { hp: 7547, atk: 543, exp: 9120, level: 20 },
  day: { hp: 31807, atk: 216, exp: 15480, level: 20 },
  nang: { hp: 12669, atk: 899, exp: 16560, level: 21 },
} as const;

/** Sáu loài: vai + hệ số vai (tài liệu đề xuất mục 3) + hệ + hành vi mong đợi. */
const LOAI = [
  { id: "da_lang", vai: "gong", he: 0.85, element: undefined, behavior: "charger" },
  { id: "hac_phong_lang", vai: "ban", he: 0.95, element: "phong", behavior: "ranged" },
  { id: "huyet_nguyet_lang", vai: "gong", he: 1.1, element: "hoa", behavior: "charger" },
  { id: "xich_diem_lang", vai: "nang", he: 0.9, element: "hoa", behavior: undefined },
  { id: "thuong_nguyet_lang", vai: "day", he: 1.0, element: "phong", behavior: undefined },
  { id: "ngan_nguyet_lang", vai: "nang", he: 1.1, element: "phong", behavior: undefined },
] as const;

describe("quái Hóa Thần Lang Hoang (D1 #1466 lát A1)", () => {
  it("sáu loài có thật, bậc `MONSTER_REALM` 5 (Hóa Thần), không phải trùm", () => {
    expect(LOAI).toHaveLength(6);
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      expect(m, l.id).toBeDefined();
      expect(MONSTER_REALM[l.id], `${l.id}: MONSTER_REALM`).toBe(5);
      expect(m.boss, `${l.id}: loài thường`).toBeFalsy();
    }
  });

  it("máu / công / tu vi = vai Hóa Thần của khung x hệ số vai (trong +-2 % làm tròn); cấp đúng vai và trong trần chặn đường Hóa Thần", () => {
    const cap = AMBUSH_FOE_LEVEL_CAP[5]!;
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      const r = ROLE[l.vai];
      for (const k of ["hp", "atk", "exp"] as const) {
        const want = r[k] * l.he;
        expect(
          Math.abs(m[k] - want) / want,
          `${l.id}.${k} = ${m[k]}, khung x hệ số = ${Math.round(want)}`,
        ).toBeLessThanOrEqual(0.02);
      }
      expect(m.level, `${l.id}: cấp`).toBeGreaterThanOrEqual(r.level);
      expect(m.level, `${l.id}: cấp`).toBeLessThanOrEqual(cap);
    }
  });

  it("`minDanger` tăng CÙNG `exp` (loài tu vi cao nằm sâu hơn về phía bắc, như Hàn Vân), trong (0, 1), không trùng nhau", () => {
    const theoExp = [...LOAI].sort((a, b) => MONSTER_BY_ID[a.id].exp - MONSTER_BY_ID[b.id].exp);
    for (let i = 0; i + 1 < theoExp.length; i++)
      expect(
        MONSTER_BY_ID[theoExp[i + 1].id].minDanger,
        `${theoExp[i + 1].id} sâu hơn ${theoExp[i].id}`,
      ).toBeGreaterThan(MONSTER_BY_ID[theoExp[i].id].minDanger);
    for (const l of LOAI) {
      const d = MONSTER_BY_ID[l.id].minDanger;
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    }
  });

  it("hành vi theo vai: Dã Lang / Huyết Nguyệt lao (gồng 600-1200 ms), Hắc Phong bắn đạn né được, Thương Nguyệt đập đất báo trước, hai sói đòn nặng cận chiến; tốc độ <= 200", () => {
    for (const l of LOAI) {
      const m = MONSTER_BY_ID[l.id];
      expect(m.behavior, `${l.id}: behavior`).toBe(l.behavior);
      expect(m.element, `${l.id}: element`).toBe(l.element);
      expect(m.speed, `${l.id}: speed`).toBeLessThanOrEqual(200);
      if (l.behavior === "charger") {
        expect(m.windupMs!, l.id).toBeGreaterThanOrEqual(600);
        expect(m.windupMs!, l.id).toBeLessThanOrEqual(1200);
      }
    }
    const ban = MONSTER_BY_ID.hac_phong_lang;
    expect(ban.boltSpeed!).toBeLessThanOrEqual(640); // né được
    expect(ban.boltRange!).toBeGreaterThan(3 * ban.attackRange);
    expect(ban.boltRange!).toBeLessThanOrEqual(400);
    const day = MONSTER_BY_ID.thuong_nguyet_lang;
    expect(day.slam, "Thương Nguyệt Lang đập đất").toBeDefined();
    expect(day.slam!.windupMs).toBeGreaterThanOrEqual(600);
    expect(day.slam!.windupMs).toBeLessThanOrEqual(1500);
    expect(day.slam!.radius).toBeGreaterThan(day.attackRange);
    // Dày nhất, chậm nhất, công thấp nhất (vai Cốt Tượng)
    for (const l of LOAI) {
      if (l.id === day.id) continue;
      expect(day.hp, l.id).toBeGreaterThan(MONSTER_BY_ID[l.id].hp);
      expect(day.speed, l.id).toBeLessThan(MONSTER_BY_ID[l.id].speed);
      expect(day.atk, l.id).toBeLessThan(MONSTER_BY_ID[l.id].atk);
    }
  });

  it("CHƯA SINH ở đâu (lát A3 khai `monsterCap` của lang_hoang): `MONSTER_CAP` 0, ngoài `WILD_MONSTERS`, không bản đồ nào sinh", () => {
    for (const l of LOAI) {
      expect(MONSTER_CAP[l.id], `${l.id}: MONSTER_CAP`).toBe(0);
      expect(
        WILD_MONSTERS.some((m) => m.id === l.id),
        `${l.id}: WILD_MONSTERS`,
      ).toBe(false);
      for (const map of MAPS)
        expect(getMap(map.id)!.monsterCapOf(l.id), `${l.id} @ ${map.id}`).toBe(0);
    }
  });

  it("bảng rơi đồ có thật (vật phẩm trỏ đúng) và tiền rơi hợp lệ; loài tu vi cao rơi tiền trung bình không ít hơn loài tu vi thấp", () => {
    const avg = (id: string) =>
      COIN_DROPS[id]!.chance * ((COIN_DROPS[id]!.min + COIN_DROPS[id]!.max) / 2);
    for (const l of LOAI) {
      expect(DROP_TABLES[l.id]?.length ?? 0, `${l.id}: bảng rơi`).toBeGreaterThan(0);
      for (const d of DROP_TABLES[l.id]!)
        expect(ITEM_BY_ID[d.itemId], `${l.id} -> ${d.itemId}`).toBeDefined();
      expect(COIN_DROPS[l.id], `${l.id}: COIN_DROPS`).toBeDefined();
    }
    const theoExp = [...LOAI].sort((a, b) => MONSTER_BY_ID[a.id].exp - MONSTER_BY_ID[b.id].exp);
    for (let i = 0; i + 1 < theoExp.length; i++)
      expect(
        avg(theoExp[i + 1].id),
        `${theoExp[i + 1].id} >= ${theoExp[i].id}`,
      ).toBeGreaterThanOrEqual(avg(theoExp[i].id));
  });
});
