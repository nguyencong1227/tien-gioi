// Kiểm toán nguồn của MỌI vật phẩm (issue #751): mọi vật phẩm phải có ít nhất MỘT đường vào game
// (rơi quái / cửa hàng / cửa hàng tông / công thức / thưởng nhiệm vụ + nhiệm vụ tông / đổi NPC / rương bí cảnh), trừ ngoại lệ có chú thích.
// Nguyên liệu (type "material") phải được ít nhất một công thức / nhiệm vụ / đổi đồ dùng tới (không là nguyên liệu "chết").
// KHÔNG đổi số dữ liệu game — chỉ kiểm chứng (test chéo). Báo cáo đầy đủ ở docs/KIEM_TOAN_VAT_PHAM.md.
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

export type Source =
  "drop" | "shop" | "recipe" | "quest" | "trade" | "dungeon" | "sect_shop" | "sect_quest";

/** Các bảng dữ liệu mà kiểm toán đọc. Mặc định là bảng THẬT; ca kiểm chứng truyền bảng giả để chứng minh hướng `give` / `get` của TRADES không bị đảo. */
export interface AuditTables {
  drops: Record<string, ReadonlyArray<{ itemId: string }>>;
  shops: ReadonlyArray<{ itemIds: readonly string[] }>;
  recipes: ReadonlyArray<{
    output: { itemId: string };
    inputs: ReadonlyArray<{ itemId: string }>;
  }>;
  quests: ReadonlyArray<{
    rewards: { items?: ReadonlyArray<{ itemId: string }> };
    steps: ReadonlyArray<{ kind: string; itemId?: string }>;
  }>;
  trades: ReadonlyArray<{
    give: ReadonlyArray<{ itemId: string }>;
    get: { itemId: string };
  }>;
  dungeons: ReadonlyArray<{ reward?: { items: ReadonlyArray<{ itemId: string }> } }>;
  sectShop: ReadonlyArray<{ itemId: string }>;
  sectQuests: ReadonlyArray<{
    byTier: Record<
      string,
      {
        rewards: { items?: ReadonlyArray<{ itemId: string }> };
        steps: ReadonlyArray<{ kind: string; itemId?: string }>;
      }
    >;
  }>;
}

const REAL_TABLES: AuditTables = {
  drops: DROP_TABLES,
  shops: SHOPS,
  recipes: RECIPES,
  quests: QUESTS,
  trades: TRADES,
  dungeons: DUNGEONS,
  sectShop: SECT_SHOP,
  sectQuests: SECT_QUESTS,
};

/**
 * Mọi cách vật phẩm `itemId` được NGƯỜI CHƠI NHẬN (không trùng): rơi quái / mua cửa hàng / mua cửa hàng tông / chế thành phẩm / thưởng nhiệm vụ / thưởng nhiệm vụ tông / NPC đổi cho / rương bí cảnh.
 * Dùng cho kiểm tra "mọi vật phẩm có ít nhất MỘT đường vào".
 */
export function sourcesOf(itemId: string, tables: Partial<AuditTables> = {}): Source[] {
  const T = { ...REAL_TABLES, ...tables };
  const out: Source[] = [];
  // 1. Rơi từ quái (DROP_TABLES)
  for (const table of Object.values(T.drops)) {
    if (table.some((d) => d.itemId === itemId)) {
      out.push("drop");
      break;
    }
  }
  // 2. Bán ở cửa hàng (SHOPS)
  if (T.shops.some((s) => s.itemIds.includes(itemId))) out.push("shop");
  // 3. Thành phẩm công thức (RECIPES)
  if (T.recipes.some((r) => r.output.itemId === itemId)) out.push("recipe");
  // 4. Thưởng nhiệm vụ (QUESTS[].rewards.items)
  if (T.quests.some((q) => q.rewards.items?.some((r) => r.itemId === itemId))) out.push("quest");
  // 5. NPC đổi cho (TRADES[].get): `get` = vật phẩm NGƯỜI CHƠI NHẬN (máy chủ `systems/npc.ts` `trade()` thêm `[t.get]`); `give` là thứ người chơi NỘP
  if (T.trades.some((t) => t.get.itemId === itemId)) out.push("trade");
  // 6. Phần thưởng bí cảnh (DUNGEONS[].reward.items)
  if (T.dungeons.some((d) => d.reward?.items.some((r) => r.itemId === itemId))) out.push("dungeon");
  // 7. Mua ở cửa hàng tông môn (SECT_SHOP): món chỉ có ở đây sẽ KHÔNG bị báo mồ côi khi D thay bảng thật (M8.7)
  if (T.sectShop.some((e) => e.itemId === itemId)) out.push("sect_shop");
  // 8. Thưởng nhiệm vụ tông (SECT_QUESTS[].byTier[*].rewards.items)
  if (
    T.sectQuests.some((t) =>
      Object.values(t.byTier).some((def) => def.rewards.items?.some((r) => r.itemId === itemId)),
    )
  )
    out.push("sect_quest");
  return out;
}

/**
 * Mọi cách nguyên liệu `itemId` bị TIÊU THỤ (không trùng): làm nguyên liệu đầu vào công thức / mục thu thập nhiệm vụ / mục thu thập nhiệm vụ tông / NPC thu lấy khi đổi đồ.
 * Dùng cho kiểm tra "mọi nguyên liệu được ít nhất một nơi dùng tới" (không là nguyên liệu chết).
 */
export function consumedBy(itemId: string, tables: Partial<AuditTables> = {}): Source[] {
  const T = { ...REAL_TABLES, ...tables };
  const out: Source[] = [];
  // 1. Nguyên liệu đầu vào công thức (RECIPES[].inputs)
  if (T.recipes.some((r) => r.inputs.some((ing) => ing.itemId === itemId))) out.push("recipe");
  // 2. Mục thu thập nhiệm vụ (QUESTS[].steps collect)
  if (T.quests.some((q) => q.steps.some((s) => s.kind === "collect" && s.itemId === itemId)))
    out.push("quest");
  // 3. NPC thu lấy khi đổi đồ (TRADES[].give): `give` = nguyên liệu NGƯỜI CHƠI NỘP (máy chủ trừ `t.give`)
  if (T.trades.some((t) => t.give.some((g) => g.itemId === itemId))) out.push("trade");
  // 4. Mục thu thập nhiệm vụ tông (SECT_QUESTS[].byTier[*].steps kind collect): nguyên liệu chỉ dùng cho tông sẽ KHÔNG bị báo chết
  if (
    T.sectQuests.some((t) =>
      Object.values(t.byTier).some((def) =>
        def.steps.some((s) => s.kind === "collect" && s.itemId === itemId),
      ),
    )
  )
    out.push("sect_quest");
  return out;
}

/**
 * Vật phẩm CÓ CHỦ Ý không cần nguồn rơi / bán / chế (ngoại lệ): mỗi mục kèm lý do. Cập nhật khi phát hiện vật phẩm mồ côi hợp lệ.
 * Hiện: KHÔNG có ngoại lệ — mọi vật phẩm đều phải có ít nhất một đường vào (test đỏ nếu thiếu, mở issue dev-a để nối nguồn).
 */
const NGOAI_LE: Readonly<Record<string, string>> = {};

/** Vật phẩm MỒ CÔI: không có nguồn vào nào VÀ không nằm trong bảng ngoại lệ `ngoaiLe` (nhận tham số để ca kiểm chứng dùng bảng giả). */
export function orphans(
  ids: readonly string[],
  sourcesFor: (id: string) => readonly Source[],
  ngoaiLe: Readonly<Record<string, string>> = NGOAI_LE,
): string[] {
  return ids.filter((id) => sourcesFor(id).length === 0 && !Object.hasOwn(ngoaiLe, id));
}

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
