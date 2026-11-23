// Kiểm toán nguồn của MỌI vật phẩm (issue #751): mọi vật phẩm phải có ít nhất MỘT đường vào game
// (rơi quái / cửa hàng / cửa hàng tông / công thức / thưởng nhiệm vụ + nhiệm vụ tông / đổi NPC / rương bí cảnh), trừ ngoại lệ có chú thích.
// Nguyên liệu (type "material") phải được ít nhất một công thức / nhiệm vụ / đổi đồ dùng tới (không là nguyên liệu "chết").
// KHÔNG đổi số dữ liệu game — chỉ kiểm chứng (test chéo). Báo cáo đầy đủ ở docs/KIEM_TOAN_VAT_PHAM.md.
import { itemSourceViolations } from "./item-sources";
import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  DROP_TABLES,
  ITEMS,
  QUESTS,
  RECIPES,
  SECT_QUESTS,
  SECT_SHOP,
  SHOPS,
  TRADES,
} from "./index";
import { OWNER_GEAR_ITEMS } from "./owner-gear";
import { AuditTables, NGOAI_LE, Source, consumedBy, orphans, sourcesOf } from "./item-sources";

// Các hàm thuần `Source` / `AuditTables` / `sourcesOf` / `consumedBy` / `NGOAI_LE` / `orphans` đã dời sang
// `./item-sources` (dùng chung với `check:content` ở Phần 2 #1200); test này nhập lại và chỉ giữ các CA KIỂM CHỨNG.

describe("kiểm toán nguồn vật phẩm (issue #751)", () => {
  const sources = Object.fromEntries(ITEMS.map((i) => [i.id, sourcesOf(i.id)]));

  it("mọi vật phẩm có ít nhất MỘT nguồn vào (không còn vật phẩm mồ côi)", () => {
    const coi = orphans(
      ITEMS.map((i) => i.id),
      (id) => sources[id],
    );
    expect(
      coi,
      `Vật phẩm KHÔNG có nguồn vào nào (mồ côi): ${coi.join(", ") || "không có"}. Nối nguồn rơi / shop / công thức / thưởng / đổi / rương, hoặc thêm vào NGOAI_LE kèm lý do.`,
    ).toEqual([]);
  });

  it("trang bị ô riêng của chủ (OWNER_GEAR_ITEMS) đều là vật phẩm CÓ TRONG ITEMS, nên thừa hưởng kiểm nguồn ở trên", () => {
    // Issue #751 yêu cầu kiểm cả owner-gear.ts. Ba ô riêng (hài / ngọc bội / pháp bảo) là MỘT SỐ món equip trong ITEMS
    // (cùng id), nên đã được kiểm nguồn ở trên. Kiểm ở đây để đảm bảo KHÔNG có owner-gear nào "lang thang" ngoài ITEMS
    // (khi đó nó sẽ KHÔNG bị kiểm nguồn).
    const itemIds = new Set(ITEMS.map((i) => i.id));
    const lang_thang = OWNER_GEAR_ITEMS.filter((g) => !itemIds.has(g.id));
    expect(
      lang_thang.map((g) => g.id),
      `Owner-gear KHÔNG ở trong ITEMS (sẽ KHÔNG bị kiểm nguồn): ${lang_thang.map((g) => g.id).join(", ") || "không có"}.`,
    ).toEqual([]);
  });

  it("mọi nguyên liệu (type material) được ít nhất một công thức / nhiệm vụ / đổi đồ DÙNG TỚI (không là nguyên liệu chết)", () => {
    const nguyen_lieu = ITEMS.filter((i) => i.type === "material");
    expect(nguyen_lieu.length, "phải có nguyên liệu để kiểm").toBeGreaterThan(0);
    for (const m of nguyen_lieu) {
      const dung_vao = consumedBy(m.id);
      expect(
        dung_vao.length > 0,
        `Nguyên liệu "${m.id}" KHÔNG được công thức / nhiệm vụ / đổi đồ nào DÙNG TỚI (cách nhận: ${sources[m.id].join(",") || "none"}). Nguyên liệu chết = dấu hiệu quên nối nguồn tiêu thụ.`,
      ).toBe(true);
    }
  });

  it("mọi nguồn vào đều trỏ tới vật phẩm CÓ THẬT (không có itemId rác)", () => {
    const validIds = new Set(ITEMS.map((i) => i.id));
    for (const [kind, table] of Object.entries(DROP_TABLES)) {
      for (const d of table)
        expect(validIds.has(d.itemId), `DROP_TABLES[${kind}] itemId lạ: ${d.itemId}`).toBe(true);
    }
    for (const s of SHOPS)
      for (const id of s.itemIds) expect(validIds.has(id), `SHOPS itemId lạ: ${id}`).toBe(true);
    for (const r of RECIPES)
      expect(validIds.has(r.output.itemId), `RECIPES output lạ: ${r.output.itemId}`).toBe(true);
    for (const q of QUESTS)
      for (const rw of q.rewards.items ?? [])
        expect(validIds.has(rw.itemId), `QUEST reward lạ: ${rw.itemId}`).toBe(true);
    for (const t of TRADES) {
      for (const g of t.give)
        expect(validIds.has(g.itemId), `TRADES give lạ: ${g.itemId}`).toBe(true);
      expect(validIds.has(t.get.itemId), `TRADES get lạ: ${t.get.itemId}`).toBe(true);
    }
    for (const d of DUNGEONS)
      for (const r of d.reward?.items ?? [])
        expect(validIds.has(r.itemId), `DUNGEON reward lạ: ${r.itemId}`).toBe(true);
    for (const e of SECT_SHOP)
      expect(validIds.has(e.itemId), `SECT_SHOP itemId lạ: ${e.itemId}`).toBe(true);
    for (const t of SECT_QUESTS)
      for (const def of Object.values(t.byTier)) {
        for (const rw of def.rewards.items ?? [])
          expect(validIds.has(rw.itemId), `SECT_QUEST reward lạ: ${rw.itemId}`).toBe(true);
        for (const s of def.steps)
          if (s.kind === "collect")
            expect(validIds.has(s.itemId), `SECT_QUEST collect lạ: ${s.itemId}`).toBe(true);
      }
  });

  it("hướng TRADES đúng: `get` là thứ NGƯỜI CHƠI NHẬN (nguồn), `give` là thứ NGƯỜI CHƠI NỘP (tiêu thụ) — bảng giả chứng minh, đảo hướng thì đỏ", () => {
    const rong: Partial<AuditTables> = {
      drops: {},
      shops: [],
      recipes: [],
      quests: [],
      dungeons: [],
      sectShop: [],
      sectQuests: [],
      trades: [{ give: [{ itemId: "chi_nop" }], get: { itemId: "chi_nhan" } }],
    };
    // món CHỈ ở `get`: có nguồn "trade", KHÔNG bị tiêu
    expect(sourcesOf("chi_nhan", rong)).toEqual(["trade"]);
    expect(consumedBy("chi_nhan", rong)).toEqual([]);
    // món CHỈ ở `give`: được tiêu "trade", KHÔNG có nguồn
    expect(consumedBy("chi_nop", rong)).toEqual(["trade"]);
    expect(sourcesOf("chi_nop", rong)).toEqual([]);
  });

  it("ngoại lệ có thật thì KHÔNG bị báo mồ côi, món không ngoại lệ vẫn bị báo", () => {
    const khongNguon = () => [] as Source[];
    const ngoaiLe = { mon_dac_biet: "cố ý không có nguồn (thử)" };
    expect(orphans(["mon_dac_biet", "mon_thuong"], khongNguon, ngoaiLe)).toEqual(["mon_thuong"]);
    expect(orphans(["mon_dac_biet", "mon_thuong"], khongNguon, {})).toEqual([
      "mon_dac_biet",
      "mon_thuong",
    ]);
    // id kiểu `constructor` không được lọt qua bảng ngoại lệ bằng chuỗi nguyên mẫu
    expect(orphans(["constructor"], khongNguon, {})).toEqual(["constructor"]);
  });

  it("ngoại lệ (nếu có) đều là vật phẩm CÓ THẬT và nêu lý do", () => {
    for (const id of Object.keys(NGOAI_LE)) {
      expect(
        ITEMS.some((i) => i.id === id),
        `NGOAI_LE chứa id không tồn tại: ${id}`,
      ).toBe(true);
      expect(NGOAI_LE[id].length, `NGOAI_LE[${id}] thiếu lý do`).toBeGreaterThan(0);
    }
  });
});

// RĂNG của `itemSourceViolations` (Phần 2 #1200): dữ liệu GIẢ, mỗi lớp lỗi một ca; xoá / làm yếu một kiểm trong hàm thì ca đó ĐỎ.
describe("itemSourceViolations: bắt đủ 4 lớp lỗi (dữ liệu giả)", () => {
  const empty = {
    drops: {},
    shops: [],
    recipes: [],
    quests: [],
    trades: [],
    dungeons: [],
    sectShop: [],
    sectQuests: [],
  };
  const clean = {
    items: [
      { id: "mat", type: "material" },
      { id: "gear", type: "weapon" },
    ],
    tables: {
      ...empty,
      drops: { q: [{ itemId: "mat" }] },
      recipes: [{ output: { itemId: "gear" }, inputs: [{ itemId: "mat" }] }],
    },
    ownerGear: [],
  };
  it("dữ liệu sạch => rỗng", () => {
    expect(itemSourceViolations(clean)).toEqual([]);
  });
  it("(1) vật phẩm mồ côi bị báo", () => {
    const v = itemSourceViolations({
      ...clean,
      items: [...clean.items, { id: "mocoi", type: "weapon" }],
    });
    expect(v.some((m) => m.includes("mồ côi: mocoi"))).toBe(true);
  });
  it("(2) owner-gear ngoài ITEMS bị báo", () => {
    const v = itemSourceViolations({ ...clean, ownerGear: [{ id: "langthang" }] });
    expect(v.some((m) => m.includes("langthang"))).toBe(true);
  });
  it("(3) nguyên liệu chết bị báo", () => {
    const v = itemSourceViolations({
      ...clean,
      items: [...clean.items, { id: "chet", type: "material" }],
      tables: { ...clean.tables, drops: { q: [{ itemId: "mat" }, { itemId: "chet" }] } },
    });
    expect(v.some((m) => m.includes("nguyên liệu chết: chet"))).toBe(true);
  });
  it("(4) tham chiếu trỏ vật phẩm lạ bị báo (bảng rơi)", () => {
    const v = itemSourceViolations({
      ...clean,
      tables: { ...clean.tables, drops: { q: [{ itemId: "mat" }, { itemId: "rac" }] } },
    });
    expect(v.some((m) => m.includes("DROP_TABLES[q]") && m.includes("rac"))).toBe(true);
  });
});
