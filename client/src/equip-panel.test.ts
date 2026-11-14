// Bảng trang bị sáu ô (M7.4, #505): lớp thuần `equip-panel.ts`. Ghim hợp đồng `shared/` (#585) ở phía client: thứ tự lưới, ô pháp bảo khoá tới Kim Đan, trần `STAT_CAPS`,
// dữ liệu từ state không tin được (giá trị lạ, `constructor`), và các con số đi qua `statsFor` THẬT (client không tự cộng / kẹp).
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  EQUIP_SLOT_UNLOCK_REALM,
  ITEM_BY_ID,
  REALMS,
  STAT_CAPS,
  TREASURES,
  statsFor,
  type EquipSlot,
  type EquipStats,
  type ItemDef,
} from "@tien-gioi/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  PCT_STATS,
  deltaText,
  describeEquipStats,
  equipmentOf,
  itemOf,
  pctRows,
  equipDiffers,
  slotLockText,
  slotViews,
  statDeltas,
  swapInfo,
  type FullEquip,
} from "./equip-panel";

const KIM_DAN = EQUIP_SLOT_UNLOCK_REALM.treasure as number;
const empty = (): FullEquip => equipmentOf({});

/** Món thử chèn vào `ITEM_BY_ID` (chưa có món thật cho ba ô riêng, sẽ thêm ở PR server); dọn sau mỗi ca. */
const injected: string[] = [];
function inject(
  id: string,
  slot: EquipSlot,
  stats: EquipStats,
  treasure?: ItemDef["equip"],
): ItemDef {
  const def: ItemDef = {
    id,
    name: `Món ${id}`,
    type: "equip",
    stack: 1,
    color: 0x7fb6ff,
    rarity: 1,
    desc: "thử",
    equip: { slot, stats, reqRealm: 0, reqTier: 0, ...(treasure ?? {}) },
  } as ItemDef;
  ITEM_BY_ID[id] = def;
  injected.push(id);
  return def;
}
afterEach(() => {
  for (const id of injected.splice(0)) delete ITEM_BY_ID[id];
});

describe("equipmentOf / sameEquip: đủ sáu ô từ state không tin được", () => {
  it("luôn có đủ sáu khoá theo EQUIP_SLOTS, ô vắng hoặc null/undefined = trống", () => {
    for (const p of [undefined, null, {}, { weapon: "kiem" }]) {
      const eq = equipmentOf(p);
      expect(Object.keys(eq)).toEqual([...EQUIP_SLOTS]);
      expect(EQUIP_SLOTS).toHaveLength(6);
    }
    expect(equipmentOf({ weapon: "a", boots: "b", treasure: "c" })).toMatchObject({
      weapon: "a",
      boots: "b",
      treasure: "c",
      robe: "",
      jade: "",
    });
  });

  it("giá trị không phải chuỗi (số, object, mảng, hàm) về trống", () => {
    const eq = equipmentOf({
      weapon: 5,
      robe: {},
      talisman: [],
      boots: () => 1,
      jade: null,
      treasure: true,
    });
    expect(Object.values(eq).every((v) => v === "")).toBe(true);
  });

  it("equipDiffers nhìn CẢ SÁU ô (đổi một ô riêng cũng là khác), không cần dựng FullEquip", () => {
    const eq = equipmentOf({ weapon: "x" });
    expect(equipDiffers({ weapon: "x" }, eq)).toBe(false);
    expect(equipDiffers({ weapon: "x", boots: "" }, eq), "ô riêng vắng = trống").toBe(false);
    expect(equipDiffers({ weapon: "x", boots: 5 }, eq), "giá trị lạ = trống").toBe(false);
    for (const slot of EQUIP_SLOTS) {
      expect(equipDiffers({ weapon: "x", [slot]: "khac" }, eq), slot).toBe(true);
    }
    expect(equipDiffers(null, equipmentOf({}))).toBe(false);
    expect(equipDiffers(undefined, eq)).toBe(true);
  });
});

describe("slotLockText / slotViews: ô pháp bảo khoá tới Kim Đan", () => {
  it("Kim Đan là cảnh giới 3 và câu ghi 'Mở ở Kim Đan' (tên lấy từ REALMS, không gõ cứng)", () => {
    expect(KIM_DAN).toBe(3);
    expect(REALMS[KIM_DAN].name).toBe("Kim Đan");
    expect(slotLockText("treasure", KIM_DAN - 1)).toBe("Mở ở Kim Đan");
  });

  it("chỉ pháp bảo có điều kiện mở; biên: dưới Kim Đan khoá, từ Kim Đan mở", () => {
    for (const r of [0, 1, 2])
      expect(slotLockText("treasure", r), `realm ${r}`).toBe("Mở ở Kim Đan");
    for (const r of [3, 4, 5, 6]) expect(slotLockText("treasure", r), `realm ${r}`).toBeNull();
    for (const s of ["weapon", "robe", "talisman", "boots", "jade"])
      expect(slotLockText(s, 0), s).toBeNull();
  });

  it("ô lạ / độc / realm rác không ném lỗi và không bịa ra câu khoá", () => {
    for (const s of ["constructor", "__proto__", "toString", "", 7, null, undefined])
      expect(slotLockText(s, 0)).toBeNull();
    expect(slotLockText("treasure", Number.NaN)).toBe("Mở ở Kim Đan");
  });

  it("sáu thẻ đúng thứ tự lưới 3 x 2, nhãn Hài / Ngọc bội / Pháp bảo", () => {
    const v = slotViews(empty(), 0);
    expect(v.map((x) => x.slot)).toEqual([
      "weapon",
      "robe",
      "talisman",
      "boots",
      "jade",
      "treasure",
    ]);
    expect(v.map((x) => x.label)).toEqual([
      "Vũ khí",
      "Pháp bào",
      "Hộ phù",
      "Hài",
      "Ngọc bội",
      "Pháp bảo",
    ]);
    expect(v.map((x) => x.label)).toEqual(EQUIP_SLOTS.map((s) => EQUIP_SLOT_NAMES[s]));
  });

  it("trước Kim Đan: chỉ thẻ pháp bảo khoá (kèm câu cho trình đọc); từ Kim Đan thì mở", () => {
    const before = slotViews(empty(), 2);
    expect(before.filter((x) => x.locked).map((x) => x.slot)).toEqual(["treasure"]);
    const t = before[5];
    expect(t.lockText).toBe("Mở ở Kim Đan");
    expect(t.aria).toBe("Pháp bảo: khoá, Mở ở Kim Đan");
    expect(slotViews(empty(), KIM_DAN).some((x) => x.locked)).toBe(false);
    expect(slotViews(empty(), KIM_DAN)[5].aria).toBe("Pháp bảo: trống");
  });

  it("thẻ có đồ: tên món, đúng ô; id lạ / 'constructor' / món sai ô = trống (khớp equipBonus bỏ qua)", () => {
    inject("t_boots", "boots", { speed: 5 });
    inject("t_jade", "jade", { crit: 3 });
    const eq = equipmentOf({
      boots: "t_boots",
      jade: "t_boots",
      weapon: "constructor",
      robe: "khong_co",
    });
    const v = slotViews(eq, 0);
    expect(v[3].def?.id).toBe("t_boots");
    expect(v[3].aria).toBe("Hài: Món t_boots, Linh phẩm, chạm để tháo"); // tên + BẬC (dấu ◆ ★ bị giấu khỏi trình đọc)
    expect(v[4].def, "hài đặt nhầm vào ngọc bội").toBeUndefined();
    expect(v[0].def, "constructor").toBeUndefined();
    expect(v[1].def, "id lạ").toBeUndefined();
  });

  it("ô CHƯA MỞ mà tệp lưu sửa tay có pháp bảo: hiển thị khoá, không như đang có tác dụng", () => {
    inject("t_tre", "treasure", {}, { treasure: TREASURES[0].id } as never);
    const v = slotViews(equipmentOf({ treasure: "t_tre" }), 1)[5];
    expect(v.locked).toBe(true);
    expect(v.def).toBeUndefined();
    expect(slotViews(equipmentOf({ treasure: "t_tre" }), KIM_DAN)[5].def?.id).toBe("t_tre");
  });

  it("itemOf an toàn với khoá của Object.prototype", () => {
    for (const id of ["constructor", "__proto__", "hasOwnProperty", 1, null])
      expect(itemOf(id)).toBeUndefined();
  });
});

describe("pctRows: ba dòng chỉ số với trần STAT_CAPS", () => {
  const zero = { crit: 0, cdr: 0, guard: 0 };

  it("ba dòng đúng thứ tự, nhãn tiếng Việt, trần lấy từ STAT_CAPS", () => {
    const rows = pctRows(zero, null);
    expect(rows.map((r) => r.key)).toEqual(["crit", "cdr", "guard"]);
    expect(rows.map((r) => r.label)).toEqual([
      "Bạo kích (từ trang bị)",
      "Giảm hồi chiêu",
      "Giáp (giảm sát thương)",
    ]);
    expect(rows.map((r) => r.cap)).toEqual([STAT_CAPS.crit, STAT_CAPS.cdr, STAT_CAPS.guard]);
    expect(
      rows.every((r) => r.valueText === "0%" && !r.atCap && r.diff === null && r.diffText === ""),
    ).toBe(true);
    expect(PCT_STATS).toHaveLength(3);
  });

  it("chạm trần ghi '(tối đa)'; dưới trần thì không; biên: trần - 1 chưa, đúng trần rồi", () => {
    for (const k of ["crit", "cdr", "guard"] as const) {
      const cap = STAT_CAPS[k];
      const below = pctRows({ ...zero, [k]: cap - 1 }, null).find((r) => r.key === k)!;
      const at = pctRows({ ...zero, [k]: cap }, null).find((r) => r.key === k)!;
      expect(below.valueText, k).toBe(`${cap - 1}%`);
      expect(at.valueText, k).toBe(`${cap}% (tối đa)`);
      expect(at.atCap && !below.atCap, k).toBe(true);
    }
  });

  it("xem trước: mũi tên ▲ / ▼ kèm số, không chỉ màu; bằng nhau thì không có gì", () => {
    const rows = pctRows({ crit: 10, cdr: 20, guard: 5 }, { crit: 15, cdr: 12, guard: 5 });
    expect(rows[0].diffText).toBe("▲+5%");
    expect(rows[1].diffText).toBe("▼-8%");
    expect(rows[2].diffText).toBe("");
    expect(rows[1].aria).toBe("Giảm hồi chiêu: 20%, ▼-8%");
  });

  it("món xem trước làm CHẠM trần thì ghi '(tối đa)' ở mũi tên", () => {
    const r = pctRows({ ...zero, crit: 35 }, { ...zero, crit: STAT_CAPS.crit })[0];
    expect(r.diffText).toBe(`▲+${STAT_CAPS.crit - 35}% (tối đa)`);
  });

  it("đã ở trần mà món mới có cộng chỉ số đó: 'đã tối đa' thay cho mũi tên; món KHÔNG cộng chỉ số đó thì im", () => {
    const cap = { ...zero, crit: STAT_CAPS.crit };
    expect(pctRows(cap, cap, { crit: 10 })[0].diffText).toBe("đã tối đa");
    expect(pctRows(cap, cap, { crit: 10 })[0].maxed).toBe(true);
    expect(pctRows(cap, cap, { atk: 10 })[0].diffText).toBe("");
    expect(pctRows(cap, cap, undefined)[0].maxed).toBe(false);
  });

  it("số không hữu hạn coi như 0 (không in NaN)", () => {
    const rows = pctRows({ crit: Number.NaN, cdr: Number.POSITIVE_INFINITY, guard: 1 }, null);
    expect(rows[0].valueText).toBe("0%");
    expect(rows[1].valueText).toBe("0%");
    expect(JSON.stringify(rows)).not.toMatch(/NaN|Infinity/);
  });

  it("TÍCH HỢP với statsFor thật: hai món crit 30 + 30 bị kẹp về trần, dòng ghi '(tối đa)'", () => {
    inject("t_a", "boots", { crit: 30 });
    inject("t_b", "jade", { crit: 30 });
    const cur = statsFor(0, 0, equipmentOf({ boots: "t_a", jade: "t_b" }));
    expect(cur.crit).toBe(STAT_CAPS.crit);
    const row = pctRows(cur, null)[0];
    expect(row.valueText).toBe(`${STAT_CAPS.crit}% (tối đa)`);
  });

  it("TÍCH HỢP: mặc thử món thứ hai khi đã chạm trần -> 'đã tối đa' (dùng đúng hàm của máy chủ)", () => {
    const a = inject("t_a", "boots", { crit: STAT_CAPS.crit });
    const b = inject("t_b", "jade", { crit: 5 });
    const eq = equipmentOf({ boots: a.id });
    const cur = statsFor(0, 0, eq);
    const next = statsFor(0, 0, { ...eq, [b.equip!.slot]: b.id });
    expect(pctRows(cur, next, b.equip!.stats)[0].diffText).toBe("đã tối đa");
  });

  it("TÍCH HỢP: pháp bảo ở người CHƯA tới Kim Đan không cộng chỉ số (statsFor bỏ qua ô chưa mở)", () => {
    inject("t_t", "treasure", { guard: 10 });
    const eq = equipmentOf({ treasure: "t_t" });
    expect(statsFor(KIM_DAN - 1, 0, eq).guard).toBe(0);
    expect(statsFor(KIM_DAN, 0, eq).guard).toBe(10);
  });
});

describe("statDeltas / deltaText / describeEquipStats", () => {
  const base = statsFor(0, 0, equipmentOf({}));

  it("chỉ liệt kê chỉ số ĐỔI, theo thứ tự cố định, bạo kích / hồi chiêu / giáp có đơn vị %", () => {
    const next = { ...base, atk: base.atk + 5, crit: 3, guard: 4, speed: base.speed - 2 };
    const d = statDeltas(base, next);
    expect(d.map((x) => x.key)).toEqual(["atk", "speed", "crit", "guard"]);
    expect(d.map(deltaText)).toEqual(["Công +5", "Tốc độ -2", "Bạo kích +3%", "Giáp +4%"]);
    expect(statDeltas(base, base)).toEqual([]);
  });

  it("chênh không hữu hạn bị bỏ", () => {
    expect(statDeltas(base, { ...base, atk: Number.NaN })).toEqual([]);
  });

  it("describeEquipStats: ba chỉ số mới, thứ tự sau bốn chỉ số cũ, không có gì thì 'Không cộng chỉ số'", () => {
    expect(describeEquipStats({ atk: 5, hp: 20, mp: 3, speed: 4, crit: 3, cdr: 5, guard: 4 })).toBe(
      "+5 Công · +20 Khí huyết · +3 Linh lực · +4 Tốc độ · +3% Bạo kích · +5% Giảm hồi chiêu · +4% Giáp",
    );
    expect(describeEquipStats({})).toBe("Không cộng chỉ số");
    expect(describeEquipStats({ crit: 0, cdr: 0 })).toBe("Không cộng chỉ số");
  });

  it("ba chỉ số % không hữu hạn / không dương không được in (không '+Infinity%', không '+-3%')", () => {
    expect(describeEquipStats({ crit: Number.POSITIVE_INFINITY, cdr: Number.NaN, guard: -3 })).toBe(
      "Không cộng chỉ số",
    );
    expect(describeEquipStats({ crit: 2, cdr: Number.POSITIVE_INFINITY })).toBe("+2% Bạo kích");
  });

  it("deltaText không bao giờ in NaN / Infinity (kể cả khi bị gọi với số hỏng)", () => {
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(deltaText({ key: "crit", label: "Bạo kích", d, unit: "%" })).toBe("Bạo kích 0%");
  });

  it("pháp bảo: thêm NGUYÊN VĂN câu desc của shared (client không diễn giải số); id lạ thì bỏ", () => {
    for (const t of TREASURES) {
      expect(describeEquipStats({ guard: 2 }, t.id)).toBe(`+2% Giáp · ${t.desc}`);
      expect(describeEquipStats({}, t.id), "chỉ có nội tại, không có 'Không cộng chỉ số'").toBe(
        t.desc,
      );
    }
    for (const bad of ["constructor", "__proto__", "khong_co", 5, null, undefined])
      expect(describeEquipStats({ crit: 1 }, bad)).toBe("+1% Bạo kích");
  });
});

describe("swapInfo: 'Đang mặc: cũ -> mới' cùng ô", () => {
  it("ô trống ghi 'Trống'; có đồ ghi tên cũ; tên ô theo EQUIP_SLOT_NAMES", () => {
    const a = inject("t_a", "boots", { speed: 5 });
    const b = inject("t_b", "boots", { speed: 9 });
    expect(swapInfo(empty(), b)).toMatchObject({
      slotName: "Hài",
      fromName: "Trống",
      toName: "Món t_b",
    });
    expect(swapInfo(equipmentOf({ boots: a.id }), b)).toMatchObject({
      fromName: "Món t_a",
      toName: "Món t_b",
    });
  });

  it("chỉ so với món ĐÚNG ô (món cũ đặt sai ô không tính)", () => {
    const j = inject("t_j", "jade", { crit: 1 });
    const b = inject("t_b", "boots", { speed: 9 });
    expect(swapInfo(equipmentOf({ boots: j.id }), b)?.fromName).toBe("Trống");
  });

  it("pháp bảo so bằng hai câu desc; món thường thì desc là null; không phải trang bị thì null", () => {
    const [t0, t1] = TREASURES;
    const a = inject("t_t0", "treasure", {}, { treasure: t0.id } as never);
    const b = inject("t_t1", "treasure", {}, { treasure: t1.id } as never);
    const s = swapInfo(equipmentOf({ treasure: a.id }), b)!;
    expect(s.fromDesc).toBe(t0.desc);
    expect(s.toDesc).toBe(t1.desc);
    expect(swapInfo(empty(), inject("t_n", "boots", { speed: 1 }))?.toDesc).toBeNull();
    expect(
      swapInfo(empty(), { id: "x", name: "x", type: "material", rarity: 0, desc: "" } as ItemDef),
    ).toBeNull();
  });
});
