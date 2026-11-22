// Kiểm toán NGUỒN của mọi vật phẩm (issue #751; gom vào `check:content` ở Phần 2 #1200): mọi vật phẩm phải có
// ít nhất MỘT đường vào game (rơi quái / cửa hàng / cửa hàng tông / công thức / thưởng nhiệm vụ + nhiệm vụ tông /
// đổi NPC / rương bí cảnh), trừ ngoại lệ có chú thích; mọi nguyên liệu (type "material") phải được ít nhất một nơi
// DÙNG TỚI (không là nguyên liệu "chết"); mọi tham chiếu nguồn phải trỏ tới vật phẩm CÓ THẬT (không itemId rác).
//
// Các hàm ở đây là THUẦN, dùng chung giữa `item-sources.test.ts` (chứng minh hướng `give`/`get` của TRADES, ngoại
// lệ...) và `server/scripts/check-content.ts` (Phần 2 #1200: chạy trong CI, đỏ khi dữ liệu sai). KHÔNG đổi số dữ
// liệu game — chỉ kiểm chứng (test chéo). Báo cáo đầy đủ ở docs/KIEM_TOAN_VAT_PHAM.md.
import { DROP_TABLES, ITEMS } from "./items";
import { QUESTS } from "./quests";
import { RECIPES } from "./recipes";
import { TRADES } from "./npcs";
import { DUNGEONS } from "./dungeon";
import { SHOPS } from "./currency";
import { SECT_QUESTS, SECT_SHOP } from "./sect-depth";
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
    id?: string;
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
 * Vật phẩm CÓ Ý ĐỊNH không cần nguồn rơi / bán / chế (ngoại lệ): mỗi mục kèm lý do. Cập nhật khi phát hiện vật phẩm mồ côi hợp lệ.
 * Hiện: KHÔNG có ngoại lệ — mọi vật phẩm đều phải có ít nhất một đường vào (test đỏ nếu thiếu, mở issue dev-a để nối nguồn).
 */
export const NGOAI_LE: Readonly<Record<string, string>> = {};

/** Vật phẩm MỒ CÔI: không có nguồn vào nào VÀ không nằm trong bảng ngoại lệ `ngoaiLe` (nhận tham số để ca kiểm chứng dùng bảng giả). */
export function orphans(
  ids: readonly string[],
  sourcesFor: (id: string) => readonly Source[],
  ngoaiLe: Readonly<Record<string, string>> = NGOAI_LE,
): string[] {
  return ids.filter((id) => sourcesFor(id).length === 0 && !Object.hasOwn(ngoaiLe, id));
}

/**
 * Vi phạm NGUỒN vật phẩm (Phần 2 #1200, chạy trong `check:content`): (1) vật phẩm mồ côi — không nguồn vào nào;
 * (2) owner-gear lang thang ngoài ITEMS (sẽ KHÔNG bị kiểm nguồn); (3) nguyên liệu chết — không nơi nào dùng;
 * (4) tham chiếu nguồn trỏ tới itemId KHÔNG có trong ITEMS (rác). Trả danh sách lỗi (rỗng = sạch). Đọc bảng THẬT.
 */
export function itemSourceViolations(): string[] {
  const bad: string[] = [];
  const valid = new Set(ITEMS.map((i) => i.id));

  // (1) Mọi vật phẩm có ít nhất MỘT nguồn vào (không mồ côi).
  const src = new Map<string, Source[]>();
  for (const i of ITEMS) src.set(i.id, sourcesOf(i.id));
  for (const id of orphans(
    ITEMS.map((i) => i.id),
    (id) => src.get(id) ?? [],
  ))
    bad.push(
      `vật phẩm mồ côi: ${id} (không có nguồn rơi / cửa hàng / công thức / thưởng / đổi / rương)`,
    );

  // (2) Owner-gear đều là vật phẩm CÓ TRONG ITEMS → thừa hưởng kiểm nguồn ở trên; lang thang ngoài ITEMS sẽ KHÔNG bị kiểm.
  for (const g of OWNER_GEAR_ITEMS)
    if (!valid.has(g.id))
      bad.push(`owner-gear lang thang ngoài ITEMS: ${g.id} (sẽ KHÔNG bị kiểm nguồn)`);

  // (3) Mọi nguyên liệu (type "material") được ít nhất một nơi DÙNG TỚI (không là nguyên liệu chết).
  for (const m of ITEMS) {
    if (m.type !== "material") continue;
    if (consumedBy(m.id).length === 0)
      bad.push(`nguyên liệu chết: ${m.id} (không công thức / nhiệm vụ / đổi đồ nào dùng tới)`);
  }

  // (4) Mọi tham chiếu nguồn phải trỏ tới vật phẩm CÓ THẬT (không itemId rác).
  const ref = (loc: string, id: string | undefined) => {
    if (typeof id !== "string" || !valid.has(id))
      bad.push(`${loc}: vật phẩm ${id ?? "(thiếu)"} lạ`);
  };
  for (const [kind, table] of Object.entries(REAL_TABLES.drops))
    for (const d of table) ref(`DROP_TABLES[${kind}]`, d.itemId);
  for (const s of REAL_TABLES.shops) for (const id of s.itemIds) ref("SHOPS", id);
  for (const r of REAL_TABLES.recipes) ref(`RECIPES ${r.output.itemId}`, r.output.itemId);
  for (const q of REAL_TABLES.quests)
    for (const rw of q.rewards.items ?? []) ref(`QUEST ${q.id ?? "?"} reward`, rw.itemId);
  for (const t of REAL_TABLES.trades) {
    for (const g of t.give) ref("TRADES give", g.itemId);
    ref("TRADES get", t.get.itemId);
  }
  for (const d of REAL_TABLES.dungeons)
    for (const r of d.reward?.items ?? []) ref("DUNGEON reward", r.itemId);
  for (const e of REAL_TABLES.sectShop) ref("SECT_SHOP", e.itemId);
  for (const t of REAL_TABLES.sectQuests)
    for (const def of Object.values(t.byTier)) {
      for (const rw of def.rewards.items ?? []) ref("SECT_QUEST reward", rw.itemId);
      for (const s of def.steps) if (s.kind === "collect") ref("SECT_QUEST collect", s.itemId);
    }

  return bad;
}
