// Nội dung Kim Đan (M6, #403): bất biến của dữ liệu. Số đo cân bằng (nhịp, đường tắt, an toàn) ở server/src/balance/kim-dan-content.test.ts.
import { describe, expect, it } from "vitest";
import {
  COIN_CAP,
  COIN_DROPS,
  DROP_TABLES,
  EQUIP_SLOTS,
  ITEM_BY_ID,
  MONSTER_BY_ID,
  MONSTER_CAP,
  RECIPES,
  REALMS,
  expPillGain,
  expToNext,
  stepOf,
  statsFor,
  type EquipSlot,
} from "./index";

const NEW_MONSTERS = ["suong_ho", "thach_quy", "doc_thiem", "hac_giao"];
/** Ba bộ trang bị Kim Đan theo bậc đầu mặc được (tier 0 / 1 / 2). */
const SETS: Record<EquipSlot, string[]>[] = [
  { weapon: ["suong_vu_kiem"], robe: ["suong_ho_bao"], talisman: ["ho_tam_phu"] },
  { weapon: ["huyen_quy_kiem"], robe: ["quy_giap_bao"], talisman: ["quy_tuc_phu"] },
  { weapon: ["hac_giao_kiem"], robe: ["giao_lan_bao"], talisman: ["giao_long_phu"] },
];

describe("thanh tu vi Kim Đan", () => {
  it("Kim Đan 48000 / 55200 / 63480; Nguyên Anh = Kim Đan x 6; Luyện Khí và Trúc Cơ KHÔNG đổi", () => {
    expect([0, 1, 2].map((t) => expToNext(3, t))).toEqual([48000, 55200, 63480]);
    expect(expToNext(4, 0)).toBe(48000 * 6);
    expect([0, 1, 2].map((t) => expToNext(2, t))).toEqual([4400, 5060, 5819]);
    expect(expToNext(1, 0)).toBe(280);
    expect(expToNext(0, 0)).toBe(40);
  });
});

describe("Tụ Khí Đan: trần tu vi mỗi viên (expPillGain)", () => {
  const eff = ITEM_BY_ID.tu_khi_dan.effect;
  if (eff?.kind !== "exp") throw new Error("tu_khi_dan phải là đan tu vi");

  it("trần 300 không đổi gì tới hết Trúc Cơ (5% thanh luôn <= 300), nhưng cắt từ Kim Đan", () => {
    for (let r = 0; r <= 2; r++)
      for (let t = 0; t < REALMS[r].tiers.length; t++) {
        const bar = expToNext(r, t);
        expect(expPillGain(eff, bar), `${r}-${t}`).toBe(Math.round(bar * eff.pct));
        expect(Math.round(bar * eff.pct), `${r}-${t} < trần`).toBeLessThanOrEqual(eff.maxExp!);
      }
    for (let t = 0; t < 3; t++) expect(expPillGain(eff, expToNext(3, t))).toBe(eff.maxExp);
    expect(eff.maxExp).toBe(300);
  });

  it("không có trần thì = round(expMax x pct); số không hợp lệ cho 0, không bao giờ NaN / âm", () => {
    expect(expPillGain({ pct: 0.05 }, 1000)).toBe(50);
    expect(expPillGain({ pct: 0.05, maxExp: 20 }, 1000)).toBe(20);
    expect(expPillGain({ pct: 0.05, maxExp: -5 }, 1000)).toBe(0);
    expect(expPillGain({ pct: 0.05, maxExp: Number.NaN }, 1000)).toBe(50); // trần hỏng coi như không có
    for (const bad of [Number.NaN, Infinity, -1, 0])
      expect(expPillGain({ pct: 0.05, maxExp: 300 }, bad)).toBe(0);
  });
});

describe("trang bị Kim Đan: ba bộ x ba ô", () => {
  it("yêu cầu Kim Đan Sơ / Trung / Hậu kỳ; độ hiếm không giảm; chỉ số tăng đều giữa các bộ", () => {
    SETS.forEach((set, tier) => {
      for (const slot of EQUIP_SLOTS) {
        const [id] = set[slot];
        const e = ITEM_BY_ID[id].equip!;
        expect(e.slot, id).toBe(slot);
        expect([e.reqRealm, e.reqTier], id).toEqual([3, tier]);
        if (tier > 0) {
          const prev = ITEM_BY_ID[SETS[tier - 1][slot][0]];
          expect(ITEM_BY_ID[id].rarity, id).toBeGreaterThanOrEqual(prev.rarity);
          for (const k of ["atk", "hp", "mp", "speed"] as const)
            expect(e.stats[k] ?? 0, `${id}.${k}`).toBeGreaterThanOrEqual(prev.equip!.stats[k] ?? 0);
        }
      }
    });
  });

  it("mỗi bộ cộng ~29-30% chỉ số gốc ở bậc đầu mặc được (như ba bộ cũ): vũ khí atk, pháp bào hp, hộ phù mp", () => {
    SETS.forEach((set, tier) => {
      const base = statsFor(3, tier);
      const ratio = (id: string, key: "atk" | "hp" | "mp", baseVal: number) =>
        (ITEM_BY_ID[id].equip!.stats[key] ?? 0) / baseVal;
      expect(ratio(set.weapon[0], "atk", base.atk), set.weapon[0]).toBeGreaterThan(0.27);
      expect(ratio(set.weapon[0], "atk", base.atk), set.weapon[0]).toBeLessThan(0.32);
      expect(ratio(set.robe[0], "hp", base.maxHp), set.robe[0]).toBeGreaterThan(0.27);
      expect(ratio(set.robe[0], "hp", base.maxHp), set.robe[0]).toBeLessThan(0.32);
      expect(ratio(set.talisman[0], "mp", base.maxMp), set.talisman[0]).toBeGreaterThan(0.3);
      expect(ratio(set.talisman[0], "mp", base.maxMp), set.talisman[0]).toBeLessThan(0.4);
    });
  });

  it("mỗi món có đúng một công thức rèn, có phí Linh thạch, nguyên liệu là đồ rơi của quái Kim Đan", () => {
    const mats = new Set<string>();
    for (const m of NEW_MONSTERS) for (const d of DROP_TABLES[m]) mats.add(d.itemId);
    for (const set of SETS)
      for (const slot of EQUIP_SLOTS) {
        const id = set[slot][0];
        const rs = RECIPES.filter((r) => r.output.itemId === id);
        expect(rs, id).toHaveLength(1);
        expect(rs[0].coin ?? 0, id).toBeGreaterThan(0);
        expect(Number.isInteger(rs[0].coin), id).toBe(true);
        expect(rs[0].coin!, id).toBeLessThanOrEqual(COIN_CAP); // phí vượt trần ví thì không bao giờ rèn được
        for (const i of rs[0].inputs)
          expect(mats.has(i.itemId), `${id} cần ${i.itemId}`).toBe(true);
      }
  });

  it("phí rèn tăng theo bộ (I < II < III)", () => {
    const fee = (id: string) => RECIPES.find((r) => r.output.itemId === id)!.coin!;
    for (const slot of EQUIP_SLOTS) {
      expect(fee(SETS[0][slot][0])).toBeLessThan(fee(SETS[1][slot][0]));
      expect(fee(SETS[1][slot][0])).toBeLessThan(fee(SETS[2][slot][0]));
    }
  });
});

describe("quái Kim Đan", () => {
  it("cấp 13-18, bốn loài khác nhau, độ nguy hiểm tối thiểu tăng dần, chỉ Hắc Giao là trùm", () => {
    const ms = NEW_MONSTERS.map((id) => MONSTER_BY_ID[id]);
    expect(ms.map((m) => m.level)).toEqual([13, 14, 15, 18]);
    for (let i = 1; i < ms.length; i++)
      expect(ms[i].minDanger).toBeGreaterThan(ms[i - 1].minDanger);
    expect(ms.map((m) => !!m.boss)).toEqual([false, false, false, true]);
    // Mỗi loài một vai: nhanh (Sương Hồ), chậm và dày (Thạch Quy), đòn nặng máu thấp (Độc Thiềm)
    const [sh, tq, dt] = ms;
    expect(sh.speed).toBeGreaterThan(tq.speed);
    expect(tq.hp).toBeGreaterThan(sh.hp);
    expect(dt.atk).toBeGreaterThan(sh.atk);
    expect(dt.hp).toBeLessThan(tq.hp);
  });

  it("không sinh ở bản đồ mặc định (MONSTER_CAP = 0) và có bảng rơi đồ + tiền", () => {
    for (const id of NEW_MONSTERS) {
      expect(MONSTER_CAP[id], id).toBe(0);
      expect(DROP_TABLES[id]?.length, id).toBeGreaterThan(0);
      expect(COIN_DROPS[id], id).toBeDefined();
    }
  });

  it("Tụ Khí Đan: Xích Mãng rơi hiếm hơn trước M6 (0.3 x 1, không còn 0.6 x 1-2)", () => {
    const e = DROP_TABLES.mang.find((d) => d.itemId === "tu_khi_dan")!;
    expect([e.chance, e.min, e.max]).toEqual([0.3, 1, 1]);
  });

  it("mốc bậc: quái Kim Đan cấp >= bậc đầu Kim Đan (13) nên không bị trừ tu vi khi người chơi mới vào Kim Đan", () => {
    expect(stepOf(3, 0)).toBe(13);
    for (const id of NEW_MONSTERS.slice(0, 3))
      expect(MONSTER_BY_ID[id].level).toBeGreaterThanOrEqual(13);
  });
});
