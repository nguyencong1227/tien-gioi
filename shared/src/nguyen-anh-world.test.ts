// Quái Nguyên Anh ở Hàn Vân Lĩnh (M7.5b, #506): chỉ sinh ở bản đồ thứ tư, số liệu suy từ loài Kim Đan cùng vai, hành vi và đạn hợp lệ.
import { describe, expect, it } from "vitest";
import {
  DROP_TABLES,
  COIN_DROPS,
  HAN_VAN_ID,
  ITEM_BY_ID,
  MAPS,
  MONSTERS,
  MONSTER_BY_ID,
  MONSTER_CAP,
  expToNext,
  getMap,
  phaseOf,
  stepOf,
  statsFor,
} from "./index";

const NA = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc", "thien_han_vuong"];
/** Loài Kim Đan cùng vai mà số liệu được suy ra (docs/PHAN_CONG_M7.md mục 8) */
const ANALOG: Record<string, string> = {
  han_lang: "suong_ho",
  phong_nha: "suong_ho",
  cot_tuong: "thach_quy",
  doc_tuoc: "doc_thiem",
  thien_han_vuong: "hac_giao",
};

describe("Hàn Vân Lĩnh: quái Nguyên Anh (M7.5b)", () => {
  const hv = getMap(HAN_VAN_ID)!;

  it("năm loài có thật, quái Nguyên Anh CHỈ sinh ở Hàn Vân; tổng quái <= 70; trùm đúng 2 con", () => {
    for (const id of NA) {
      expect(MONSTER_BY_ID[id], id).toBeDefined();
      expect(hv.monsterCapOf(id), id).toBeGreaterThan(0);
      expect(MONSTER_CAP[id], `${id} ở bản đồ mặc định`).toBe(0);
      for (const other of MAPS)
        if (other.id !== HAN_VAN_ID)
          expect(getMap(other.id)!.monsterCapOf(id), `${id} @ ${other.id}`).toBe(0);
    }
    // Hàn Vân KHÔNG sinh loài của bản đồ khác
    for (const m of MONSTERS) if (!NA.includes(m.id)) expect(hv.monsterCapOf(m.id), m.id).toBe(0);
    expect(Object.values(hv.monsterCap).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(70);
    expect(hv.monsterCapOf("thien_han_vuong")).toBe(2);
  });

  it("cấp 16-18 cho bốn loài thường (bậc Nguyên Anh) và 21 cho trùm; đúng một trùm; vùng sinh tăng dần theo cấp", () => {
    const lv = (id: string) => MONSTER_BY_ID[id].level;
    for (const id of ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc"]) {
      expect(lv(id), id).toBeGreaterThanOrEqual(stepOf(4, 0));
      expect(lv(id), id).toBeLessThanOrEqual(stepOf(4, 2));
      expect(MONSTER_BY_ID[id].boss, id).toBeUndefined();
    }
    expect(lv("thien_han_vuong")).toBe(21);
    expect(MONSTER_BY_ID.thien_han_vuong.boss).toBe(true);
    expect(NA.filter((id) => MONSTER_BY_ID[id].boss)).toEqual(["thien_han_vuong"]);
    const zones = ["han_lang", "phong_nha", "cot_tuong", "doc_tuoc", "thien_han_vuong"].map(
      (id) => MONSTER_BY_ID[id].minDanger,
    );
    expect([...zones].sort((a, b) => a - b)).toEqual(zones);
    expect(new Set(zones).size).toBe(5);
  });

  it("số liệu suy từ loài Kim Đan cùng vai theo tỉ lệ chỉ số người chơi giữa hai bậc: máu / công trong ±12 % của tỉ lệ, tu vi ~6x (`REALM_EXP_BASE`)", () => {
    const base = (level: number) => {
      for (let r = 0; r <= 4; r++)
        for (let t = 0; t < 3; t++) if (stepOf(r, t) === level) return statsFor(r, t);
      const top = statsFor(4, 2); // ngoại suy trên đỉnh Nguyên Anh (trùm cấp 21)
      const d = level - stepOf(4, 2);
      return { maxHp: top.maxHp * Math.pow(1.18, d), atk: top.atk * Math.pow(1.17, d) };
    };
    for (const id of NA) {
      const m = MONSTER_BY_ID[id];
      const a = MONSTER_BY_ID[ANALOG[id]];
      const hpRatio = base(m.level).maxHp / base(a.level).maxHp;
      const atkRatio = base(m.level).atk / base(a.level).atk;
      // Phong Nha là loài bắn, mỏng hơn Sương Hồ (cùng vai ranged) một chút nên được giảm máu 20 %
      const hpWant = a.hp * hpRatio * (id === "phong_nha" ? 0.8 : 1);
      expect(m.hp / hpWant, `${id} máu`).toBeGreaterThan(0.88);
      expect(m.hp / hpWant, `${id} máu`).toBeLessThan(1.12);
      expect(m.atk / (a.atk * atkRatio), `${id} công`).toBeGreaterThan(0.88);
      expect(m.atk / (a.atk * atkRatio), `${id} công`).toBeLessThan(1.12);
      const expRatio = m.exp / a.exp;
      const bandRatio = expToNext(4, 0) / expToNext(3, 0); // 6
      expect(expRatio, `${id} tu vi`).toBeGreaterThanOrEqual(bandRatio * 0.95);
      expect(expRatio, `${id} tu vi`).toBeLessThanOrEqual(bandRatio * 1.3);
    }
  });

  it("hành vi theo vai: Hàn Lang và trùm lao (gồng 600-1200 ms), Phong Nha bắn đạn, Độc Tước nhổ đạn độc, Cốt Tượng cận chiến chậm nhất", () => {
    for (const id of ["han_lang", "thien_han_vuong"]) {
      expect(MONSTER_BY_ID[id].behavior, id).toBe("charger");
      expect(MONSTER_BY_ID[id].windupMs, id).toBeGreaterThanOrEqual(600);
      expect(MONSTER_BY_ID[id].windupMs, id).toBeLessThanOrEqual(1200);
    }
    expect(MONSTER_BY_ID.phong_nha.behavior).toBe("ranged");
    expect(MONSTER_BY_ID.doc_tuoc.behavior).toBe("poisoner");
    expect(MONSTER_BY_ID.doc_tuoc.boltRange).toBeDefined();
    expect(MONSTER_BY_ID.cot_tuong.behavior ?? "melee").toBe("melee");
    const slowest = NA.filter((id) => !MONSTER_BY_ID[id].boss).sort(
      (a, b) => MONSTER_BY_ID[a].speed - MONSTER_BY_ID[b].speed,
    )[0];
    expect(slowest).toBe("cot_tuong");
  });

  it("đạn của quái Nguyên Anh né được và không xuyên tường: tốc độ <= 640 px/s, bay >= 0,8 s hết tầm, tầm > 3 lần tầm đánh gần, <= 400 px; không khai `boltElement` thừa", () => {
    for (const id of ["phong_nha", "doc_tuoc"]) {
      const m = MONSTER_BY_ID[id];
      expect(m.boltSpeed, id).toBeGreaterThan(0);
      expect(m.boltSpeed!, id).toBeLessThanOrEqual(640);
      expect(m.boltRange! / m.boltSpeed!, id).toBeGreaterThanOrEqual(0.8);
      expect(m.boltRange!, id).toBeGreaterThan(m.attackRange * 3);
      expect(m.boltRange!, id).toBeLessThanOrEqual(400);
      expect(m.boltElement, `${id}: màu đạn theo element của quái`).toBeUndefined();
    }
  });

  it("mỗi loài có hệ thật (không `none`), năm loài đủ ba hệ khác nhau trở lên; bảng rơi và tiền đủ", () => {
    const els = new Set<string>();
    for (const id of NA) {
      const e = MONSTER_BY_ID[id].element;
      expect(e, id).toBeDefined();
      expect(phaseOf(e), id).not.toBe("none");
      els.add(e!);
      expect(DROP_TABLES[id]?.length, `${id} bảng rơi`).toBeGreaterThan(0);
      for (const d of DROP_TABLES[id])
        expect(ITEM_BY_ID[d.itemId], `${id}: ${d.itemId}`).toBeDefined();
      expect(COIN_DROPS[id], `${id} tiền`).toBeDefined();
    }
    expect(els.size).toBeGreaterThanOrEqual(3);
  });
});
