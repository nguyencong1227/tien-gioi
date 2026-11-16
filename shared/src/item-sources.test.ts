// Kiểm toán nguồn của MỌI vật phẩm (issue #751): mọi vật phẩm phải có ít nhất MỘT đường vào game
// (rơi quái / cửa hàng / công thức / thưởng nhiệm vụ / đổi NPC / rương bí cảnh), trừ danh sách ngoại lệ có chú thích.
// Nguyên liệu (type "material") phải được ít nhất một công thức / nhiệm vụ / đổi đồ dùng tới (không là nguyên liệu "chết").
// KHÔNG đổi số dữ liệu game — chỉ kiểm chứng (test chéo). Báo cáo đầy đủ ở docs/KIEM_TOAN_VAT_PHAM.md.
import { describe, expect, it } from "vitest";
import {
  DUNGEONS,
  DROP_TABLES,
  ITEMS,
  QUESTS,
  RECIPES,
  SHOPS,
  TRADES,
} from "./index";
import { OWNER_GEAR_ITEMS } from "./owner-gear";

export type Source = "drop" | "shop" | "recipe" | "quest" | "trade" | "dungeon";

/**
 * Mọi cách vật phẩm `itemId` được NGƯỜI CHƠI NHẬN (không trùng): rơi quái / mua cửa hàng / chế thành phẩm / thưởng nhiệm vụ / NPC đổi cho / rương bí cảnh.
 * Dùng cho kiểm tra "mọi vật phẩm có ít nhất MỘT đường vào".
 */
export function sourcesOf(itemId: string): Source[] {
  const out: Source[] = [];
  // 1. Rơi từ quái (DROP_TABLES)
  for (const table of Object.values(DROP_TABLES)) {
    if (table.some((d) => d.itemId === itemId)) {
      out.push("drop");
      break;
    }
  }
  // 2. Bán ở cửa hàng (SHOPS)
  if (SHOPS.some((s) => s.itemIds.includes(itemId))) out.push("shop");
  // 3. Thành phẩm công thức (RECIPES)
  if (RECIPES.some((r) => r.output.itemId === itemId)) out.push("recipe");
  // 4. Thưởng nhiệm vụ (QUESTS[].rewards.items)
  if (QUESTS.some((q) => q.rewards.items?.some((r) => r.itemId === itemId))) out.push("quest");
  // 5. NPC đổi cho (TRADES[].give)
  if (TRADES.some((t) => t.give.some((g) => g.itemId === itemId))) out.push("trade");
  // 6. Phần thưởng bí cảnh (DUNGEONS[].reward.items)
  if (DUNGEONS.some((d) => d.reward?.items.some((r) => r.itemId === itemId))) out.push("dungeon");
  return out;
}

/**
 * Mọi cách nguyên liệu `itemId` bị TIÊU THỤ (không trùng): làm nguyên liệu đầu vào công thức / mục thu thập nhiệm vụ / NPC thu lấy khi đổi đồ.
 * Dùng cho kiểm tra "mọi nguyên liệu được ít nhất một nơi dùng tới" (không là nguyên liệu chết).
 */
export function consumedBy(itemId: string): Source[] {
  const out: Source[] = [];
  // 1. Nguyên liệu đầu vào công thức (RECIPES[].inputs)
  if (RECIPES.some((r) => r.inputs.some((ing) => ing.itemId === itemId))) out.push("recipe");
  // 2. Mục thu thập nhiệm vụ (QUESTS[].steps collect)
  if (QUESTS.some((q) => q.steps.some((s) => s.kind === "collect" && s.itemId === itemId)))
    out.push("quest");
  // 3. NPC thu lấy khi đổi đồ (TRADES[].get)
  if (TRADES.some((t) => t.get.itemId === itemId)) out.push("trade");
  return out;
}

/**
 * Vật phẩm CÓ CHỦ Ý không cần nguồn rơi / bán / chế (ngoại lệ): mỗi mục kèm lý do. Cập nhật khi phát hiện vật phẩm mồ côi hợp lệ.
 * Hiện: KHÔNG có ngoại lệ — mọi vật phẩm đều phải có ít nhất một đường vào (test đỏ nếu thiếu, mở issue dev-a để nối nguồn).
 */
const NGOAI_LE: Readonly<Record<string, string>> = {};

describe("kiểm toán nguồn vật phẩm (issue #751)", () => {
  const sources = Object.fromEntries(ITEMS.map((i) => [i.id, sourcesOf(i.id)]));

  it("mọi vật phẩm có ít nhất MỘT nguồn vào (không còn vật phẩm mồ côi)", () => {
    const coi = ITEMS.filter((i) => sources[i.id].length === 0);
    expect(
      coi.map((i) => i.id),
      `Vật phẩm KHÔNG có nguồn vào nào (mồ côi): ${coi.map((i) => i.id).join(", ") || "không có"}. Nối nguồn rơi / shop / công thức / thưởng / đổi / rương, hoặc thêm vào NGOAI_LE kèm lý do.`,
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
    for (const t of TRADES)
      for (const g of t.give)
        expect(validIds.has(g.itemId), `TRADES give lạ: ${g.itemId}`).toBe(true);
    for (const d of DUNGEONS)
      for (const r of d.reward?.items ?? [])
        expect(validIds.has(r.itemId), `DUNGEON reward lạ: ${r.itemId}`).toBe(true);
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
