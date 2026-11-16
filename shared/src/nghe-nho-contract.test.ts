// Hợp đồng nghề nhỏ lát 1 (#514, docs/THIET_KE_NGHE_NHO.md mục 5): trạm chế tác, trạng thái hộ đạo, xác suất đột phá có cộng,
// hiệu ứng trạng thái của vật phẩm. Chỉ kiểm HỢP ĐỒNG (kiểu + dữ liệu + hàm kẹp); hành vi máy chủ có test riêng ở server.
import { describe, expect, it } from "vitest";
import {
  BREAK_CHANCE_CAP,
  CRAFT_STATIONS,
  CRAFT_STATION_IDS,
  ITEMS,
  REALMS,
  MAX_STATUSES,
  NPCS,
  NPC_BY_ID,
  RECIPES,
  STATUSES,
  canAttemptBreakthrough,
  breakthroughChance,
  breakthroughChanceWith,
  clampStatusEffect,
  craftStationOf,
  craftSuccessText,
  isCraftStation,
  sanitizeStatusList,
  statusDescMatches,
  statusEffectFigures,
  statusCarriesRatio,
  statusOf,
} from "./index";

/** Chữ Hán (CJK): chữ hiển thị Tiên Giới tiếng Việt KHÔNG được có. */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

describe("trạm chế tác (CraftStation)", () => {
  it("CRAFT_STATIONS phủ đúng mọi trạm, chữ không rỗng / không Hán / không 'bạn'", () => {
    expect(Object.keys(CRAFT_STATIONS).sort()).toEqual([...CRAFT_STATION_IDS].sort());
    for (const id of CRAFT_STATION_IDS) {
      for (const [k, v] of Object.entries(CRAFT_STATIONS[id])) {
        expect(v.length, `${id}.${k}`).toBeGreaterThan(0);
        expect(CJK.test(v), `${id}.${k}: chữ Hán`).toBe(false);
        expect(v.toLowerCase().includes("bạn"), `${id}.${k}: xưng 'bạn'`).toBe(false);
      }
    }
  });

  it("trạm `forge` giữ ĐÚNG chữ cũ của lò rèn (không đổi trải nghiệm hiện có)", () => {
    expect(CRAFT_STATIONS.forge).toEqual({
      verb: "Rèn",
      label: "Rèn đồ",
      title: "Lò Rèn",
      button: "Rèn",
      tag: "Lò rèn",
    });
    expect(craftSuccessText("forge", "Hàn Vũ Kiếm")).toBe("Rèn thành công Hàn Vũ Kiếm.");
    expect(craftSuccessText("alchemy", "Đan X")).toBe("Luyện thành công Đan X.");
    expect(craftSuccessText("talisman", "Phù Y")).toBe("Chế thành công Phù Y.");
  });

  it("nhãn và tiêu đề của ba trạm khác nhau (người chơi phân biệt được)", () => {
    for (const f of ["verb", "label", "title", "button", "tag"] as const)
      expect(new Set(CRAFT_STATION_IDS.map((id) => CRAFT_STATIONS[id][f])).size, f).toBe(
        CRAFT_STATION_IDS.length,
      );
  });

  it("craftStationOf: thiếu / lạ / không phải chuỗi đều là `forge`; trạm hợp lệ giữ nguyên", () => {
    expect(craftStationOf(undefined)).toBe("forge");
    expect(craftStationOf(null)).toBe("forge");
    expect(craftStationOf({})).toBe("forge");
    for (const bad of ["", "Forge", "constructor", "__proto__", 3, {}, null, true])
      expect(craftStationOf({ station: bad }), String(bad)).toBe("forge");
    for (const id of CRAFT_STATION_IDS) {
      expect(craftStationOf({ station: id })).toBe(id);
      expect(isCraftStation(id)).toBe(true);
    }
    expect(isCraftStation("constructor")).toBe(false);
  });

  it("mọi NPC có `station` thì hợp lệ; NPC có công thức thì trạm của nó tồn tại trong CRAFT_STATIONS", () => {
    for (const n of NPCS)
      if (n.station !== undefined) expect(isCraftStation(n.station), n.id).toBe(true);
    for (const r of RECIPES) {
      const npc = NPC_BY_ID[r.npcId];
      expect(npc, `${r.id}: NPC ${r.npcId}`).toBeDefined();
      expect(CRAFT_STATIONS[craftStationOf(npc)], `${r.id}: trạm`).toBeDefined();
    }
  });
});

describe("trạng thái hộ đạo (dao_ho)", () => {
  it("là trạng thái CÓ LỢI loại breakAid, thêm CUỐI bảng, thứ tự các id cũ không đổi", () => {
    const ids = STATUSES.map((s) => s.id);
    expect(ids.slice(0, 9)).toEqual([
      "burn",
      "poison",
      "bleed",
      "chill",
      "sunder",
      "stun",
      "shield",
      "haste",
      "regen",
    ]);
    expect(ids[9]).toBe("dao_ho");
    const d = statusOf("dao_ho")!;
    expect(d.kind).toBe("breakAid");
    expect(d.harmful).toBe(false);
    expect(d.maxMs).toBe(15 * 60 * 1000);
    expect(d.maxRatio).toBe(0.2);
    expect(d.name).toBe("Hộ đạo");
  });

  it("mang `ratio` trong tin status (client hiện '+X %'), và được kẹp khi nhận từ tin", () => {
    expect(statusCarriesRatio("dao_ho")).toBe(true);
    expect(statusCarriesRatio("shield")).toBe(false);
    const [entry] = sanitizeStatusList([["dao_ho", 60_000, 5]]);
    expect(entry).toEqual(["dao_ho", 60_000, 0.2]);
    const [low] = sanitizeStatusList([["dao_ho", 60_000, -1]]);
    expect(low).toEqual(["dao_ho", 60_000, 0]);
  });

  it("MAX_STATUSES vẫn 4 (đan + phù + buff chiêu dễ chạm trần: hợp đồng giữ số này, đổi là có chủ ý)", () => {
    expect(MAX_STATUSES).toBe(4);
  });
});

describe("xác suất đột phá có cộng (breakthroughChanceWith)", () => {
  it("bonus 0 / âm / không hữu hạn: bằng xác suất gốc, KHÔNG bao giờ giảm", () => {
    for (const realm of [1, 2, 3, 4]) {
      const base = breakthroughChance(realm);
      for (const b of [0, -0.5, -Infinity, NaN])
        expect(breakthroughChanceWith(realm, b), `r${realm} b${b}`).toBe(base);
    }
  });

  it("cộng đúng và kẹp ở BREAK_CHANCE_CAP; đơn điệu theo bonus", () => {
    expect(BREAK_CHANCE_CAP).toBe(0.95);
    expect(breakthroughChanceWith(1, 0.1)).toBeCloseTo(breakthroughChance(1) + 0.1, 10);
    expect(breakthroughChanceWith(1, 0.2)).toBe(BREAK_CHANCE_CAP); // 0,77 + 0,2 = 0,97 bị kẹp ở 0,95
    expect(breakthroughChanceWith(1, 5)).toBe(BREAK_CHANCE_CAP);
    expect(breakthroughChanceWith(1, Infinity)).toBe(0.77);
    for (const realm of [1, 2, 3, 4]) {
      let prev = 0;
      for (const b of [0, 0.05, 0.1, 0.15, 0.2, 0.5]) {
        const v = breakthroughChanceWith(realm, b);
        expect(v, `r${realm} b${b}`).toBeGreaterThanOrEqual(prev);
        expect(v).toBeLessThanOrEqual(BREAK_CHANCE_CAP);
        prev = v;
      }
    }
  });

  it("bonus tối đa của đan hộ đạo (maxRatio 0,2) không đưa bậc nào tới chắc chắn 100 %", () => {
    const max = statusOf("dao_ho")!.maxRatio;
    for (const realm of [0, 1, 2, 3, 4, 5])
      expect(breakthroughChanceWith(realm, max)).toBeLessThan(1);
  });
});

describe("clampStatusEffect (hiệu ứng trạng thái của vật phẩm)", () => {
  it("kẹp thời gian và cường độ theo STATUSES, làm tròn ms", () => {
    expect(clampStatusEffect({ id: "dao_ho", ratio: 0.12, ms: 600000.4 })).toEqual({
      id: "dao_ho",
      ratio: 0.12,
      ms: 600000,
    });
    expect(clampStatusEffect({ id: "dao_ho", ratio: 9, ms: 10 ** 9 })).toEqual({
      id: "dao_ho",
      ratio: 0.2,
      ms: 900000,
    });
    expect(clampStatusEffect({ id: "haste", ratio: 0.3, ms: 5000 })).toEqual({
      id: "haste",
      ratio: 0.3,
      ms: 5000,
    });
  });

  it("từ chối: id lạ / có hại, số không hữu hạn, ms < 1, ratio âm, sai kiểu", () => {
    const bad: unknown[] = [
      { id: "burn", ratio: 0.1, ms: 1000 }, // có hại: vật phẩm không được tự gây hại cho người dùng
      { id: "stun", ratio: 0, ms: 1000 },
      { id: "constructor", ratio: 0.1, ms: 1000 },
      { id: "__proto__", ratio: 0.1, ms: 1000 },
      { id: 7, ratio: 0.1, ms: 1000 },
      { id: "dao_ho", ratio: NaN, ms: 1000 },
      { id: "dao_ho", ratio: Infinity, ms: 1000 },
      { id: "dao_ho", ratio: -0.1, ms: 1000 },
      { id: "dao_ho", ratio: "0.1", ms: 1000 },
      { id: "dao_ho", ratio: 0.1, ms: 0 },
      { id: "dao_ho", ratio: 0.1, ms: -5 },
      { id: "dao_ho", ratio: 0.1, ms: NaN },
      { id: "dao_ho", ratio: 0.1, ms: "1000" },
    ];
    for (const b of bad) expect(clampStatusEffect(b as never), JSON.stringify(b)).toBeNull();
  });
});

describe("canAttemptBreakthrough (MỘT nguồn cho máy chủ và client)", () => {
  const lastTier = (realm: number) => REALMS[realm].tiers.length - 1;

  it("chỉ đúng khi ở tầng cuối + đủ tu vi + chưa đỉnh tiên đồ", () => {
    for (let realm = 1; realm < REALMS.length - 1; realm++) {
      const last = lastTier(realm);
      expect(canAttemptBreakthrough(realm, last, 100, 100), `r${realm} đủ`).toBe(true);
      expect(canAttemptBreakthrough(realm, last, 101, 100), `r${realm} dư`).toBe(true);
      expect(canAttemptBreakthrough(realm, last, 99, 100), `r${realm} thiếu`).toBe(false);
      expect(canAttemptBreakthrough(realm, last - 1, 100, 100), `r${realm} chưa tầng cuối`).toBe(
        false,
      );
    }
    const peak = REALMS.length - 1;
    expect(canAttemptBreakthrough(peak, lastTier(peak), 10 ** 9, 100), "đỉnh tiên đồ").toBe(false);
  });

  it("không bao giờ ném lỗi và trả false với dữ liệu hỏng", () => {
    expect(canAttemptBreakthrough(1, lastTier(1), NaN, 100)).toBe(false);
    expect(canAttemptBreakthrough(1, lastTier(1), 100, NaN)).toBe(false);
    expect(canAttemptBreakthrough(999, 0, 100, 100)).toBe(false);
    expect(canAttemptBreakthrough(-1, 0, 100, 100)).toBe(false);
  });
});

describe("mô tả vật phẩm trạng thái khớp con số (statusDescMatches)", () => {
  it("mọi vật phẩm có hiệu ứng `status` nêu đúng phần trăm và thời gian trong desc", () => {
    for (const it of ITEMS) {
      const e = it.effect;
      if (!e || e.kind !== "status") continue;
      expect(
        statusDescMatches(it.desc, e),
        `${it.id}: desc "${it.desc}" lệch ${JSON.stringify(e)}`,
      ).toBe(true);
    }
  });

  it("figures và khớp: chấp nhận '12%' / '12 %', '900 giây' / '15 phút'; bắt lệch số", () => {
    expect(statusEffectFigures({ ratio: 0.12, ms: 900000 })).toEqual({
      pct: ["12%", "12 %"],
      time: ["900 giây", "15 phút"],
    });
    expect(statusEffectFigures({ ratio: 0, ms: 45000 })).toEqual({ pct: [], time: ["45 giây"] });
    const e = { ratio: 0.12, ms: 900000 };
    expect(statusDescMatches("Cộng 12% xác suất đột phá trong 15 phút.", e)).toBe(true);
    expect(statusDescMatches("Cộng 12 % xác suất đột phá trong 900 giây.", e)).toBe(true);
    expect(statusDescMatches("Cộng 15% xác suất đột phá trong 15 phút.", e)).toBe(false); // sai %
    expect(statusDescMatches("Cộng 12% xác suất đột phá trong 10 phút.", e)).toBe(false); // sai thời gian
    expect(statusDescMatches("Cộng xác suất đột phá một lần.", e)).toBe(false); // không nêu số
    expect(statusDescMatches("Tăng thêm trong 45 giây.", { ratio: 0, ms: 45000 })).toBe(true);
  });
});
