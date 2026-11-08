// Vật phẩm, bảng rơi đồ, túi đồ: hợp đồng giữa client và server (Sprint 1).
// Server quyết định mọi thứ (rơi gì, nhặt được không, dùng được không); client chỉ hiển thị.

export type ItemType = "consumable" | "material" | "equip";
/** 0 phàm phẩm, 1 linh phẩm, 2 bảo phẩm, 3 tiên phẩm, 4 thần phẩm */
export type Rarity = 0 | 1 | 2 | 3 | 4;

export const RARITY_NAMES = [
  "Phàm phẩm",
  "Linh phẩm",
  "Bảo phẩm",
  "Tiên phẩm",
  "Thần phẩm",
] as const;
/** Màu gợi ý cho viền ô / hiệu ứng nhấp nháy đồ rơi */
export const RARITY_COLORS = [0xc9c4b8, 0x6fcf73, 0x4fa3ff, 0xc277ff, 0xffb23f] as const;

/** Hiệu ứng khi dùng. pct tính theo giá trị tối đa (khí huyết, linh lực, thanh tu vi của bậc hiện tại). */
export type ItemEffect =
  { kind: "healHp"; pct: number } | { kind: "healMp"; pct: number } | { kind: "exp"; pct: number };

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  /** Số lượng tối đa trong một ô túi */
  stack: number;
  rarity: Rarity;
  desc: string;
  /** Chỉ có ở đan dược */
  effect?: ItemEffect;
  /** Hồi chiêu sau khi dùng (ms), tính riêng cho từng loại vật phẩm */
  cooldown?: number;
  /** Màu ảnh tạm (trước khi có asset thật) */
  color: number;
}

export const ITEMS: ItemDef[] = [
  // ---------- Đan dược ----------
  {
    id: "hoi_huyet_dan",
    name: "Hồi Huyết Đan",
    type: "consumable",
    stack: 20,
    rarity: 0,
    desc: "Hồi 40% khí huyết.",
    effect: { kind: "healHp", pct: 0.4 },
    cooldown: 8_000,
    color: 0xd9433b,
  },
  {
    id: "hoi_linh_dan",
    name: "Hồi Linh Đan",
    type: "consumable",
    stack: 20,
    rarity: 0,
    desc: "Hồi 50% linh lực.",
    effect: { kind: "healMp", pct: 0.5 },
    cooldown: 8_000,
    color: 0x3b7bd9,
  },
  {
    id: "tu_khi_dan",
    name: "Tụ Khí Đan",
    type: "consumable",
    stack: 10,
    rarity: 1,
    desc: "Tăng 15% thanh tu vi của bậc hiện tại.",
    effect: { kind: "exp", pct: 0.15 },
    cooldown: 60_000,
    color: 0xe8c547,
  },
  // ---------- Nguyên liệu ----------
  {
    id: "long_tho",
    name: "Lông thỏ",
    type: "material",
    stack: 99,
    rarity: 0,
    desc: "Lông mềm của Linh Thố.",
    color: 0xf4efe2,
  },
  {
    id: "nanh_soi",
    name: "Nanh sói",
    type: "material",
    stack: 99,
    rarity: 0,
    desc: "Nanh sắc của Hôi Lang.",
    color: 0xdcd6c8,
  },
  {
    id: "da_ho",
    name: "Da hổ",
    type: "material",
    stack: 99,
    rarity: 1,
    desc: "Tấm da dày của Hắc Hổ.",
    color: 0x5a4a3a,
  },
  {
    id: "vay_mang",
    name: "Vảy mãng",
    type: "material",
    stack: 99,
    rarity: 2,
    desc: "Vảy đỏ thẫm của Xích Mãng.",
    color: 0xb3262a,
  },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// ---------- Rơi đồ ----------

export interface DropEntry {
  itemId: string;
  /** Xác suất rơi mỗi lần quái chết (0..1), mỗi dòng tung độc lập */
  chance: number;
  min: number;
  max: number;
}

/** Bảng rơi đồ theo id quái (MONSTERS trong game.ts) */
export const DROP_TABLES: Record<string, DropEntry[]> = {
  tho: [
    { itemId: "long_tho", chance: 0.5, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 0.08, min: 1, max: 1 },
  ],
  lang: [
    { itemId: "nanh_soi", chance: 0.45, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 0.12, min: 1, max: 1 },
    { itemId: "hoi_linh_dan", chance: 0.08, min: 1, max: 1 },
  ],
  ho: [
    { itemId: "da_ho", chance: 0.5, min: 1, max: 1 },
    { itemId: "hoi_huyet_dan", chance: 0.2, min: 1, max: 2 },
    { itemId: "hoi_linh_dan", chance: 0.15, min: 1, max: 2 },
    { itemId: "tu_khi_dan", chance: 0.04, min: 1, max: 1 },
  ],
  mang: [
    { itemId: "vay_mang", chance: 1, min: 2, max: 4 },
    { itemId: "tu_khi_dan", chance: 0.6, min: 1, max: 2 },
    { itemId: "hoi_huyet_dan", chance: 1, min: 2, max: 3 },
  ],
};

/** Tung bảng rơi đồ. rng trả về số trong [0, 1) (truyền vào để test được). */
export function rollDrops(
  monsterKind: string,
  rng: () => number = Math.random,
): { itemId: string; qty: number }[] {
  const out: { itemId: string; qty: number }[] = [];
  for (const e of DROP_TABLES[monsterKind] ?? []) {
    if (rng() >= e.chance) continue;
    const qty = e.min + Math.floor(rng() * (e.max - e.min + 1));
    out.push({ itemId: e.itemId, qty: Math.min(qty, e.max) });
  }
  return out;
}

// ---------- Túi đồ ----------

export const INVENTORY_SLOTS = 24;
/** Khoảng cách tối đa để nhặt đồ (px) */
export const PICKUP_RANGE = 48;
/** Trong khoảng này chỉ người được chia đồ nhặt được; sau đó server đặt owner = "" (ai cũng nhặt được) */
export const LOOT_OWNER_MS = 30_000;
/** Đồ rơi nằm trên đất bao lâu thì biến mất */
export const LOOT_DESPAWN_MS = 90_000;

export interface InvSlot {
  itemId: string;
  qty: number;
}
/** Túi đồ: mảng INVENTORY_SLOTS phần tử, ô trống là null */
export type Inventory = (InvSlot | null)[];

export function emptyInventory(): Inventory {
  return Array.from({ length: INVENTORY_SLOTS }, () => null);
}

/**
 * Cho qty vật phẩm vào túi (sửa trực tiếp slots): cộng dồn vào ô cùng loại trước, rồi tới ô trống.
 * Trả về số còn thừa không cho vào được (0 = vào hết).
 */
export function addToInventory(slots: Inventory, itemId: string, qty: number): number {
  const def = ITEM_BY_ID[itemId];
  if (!def || !(qty > 0)) return Math.max(0, qty || 0);
  let left = Math.floor(qty);
  for (const s of slots) {
    if (left === 0) break;
    if (s && s.itemId === itemId && s.qty < def.stack) {
      const n = Math.min(left, def.stack - s.qty);
      s.qty += n;
      left -= n;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i] === null) {
      const n = Math.min(left, def.stack);
      slots[i] = { itemId, qty: n };
      left -= n;
    }
  }
  return left;
}

// ---------- Đồ rơi trong state chung ----------

/**
 * Hình dạng một món đồ rơi trong state.loot (MapSchema, key = lootId).
 * Class schema thật nằm ở server/src/schema.ts; client đọc theo kiểu này.
 */
export interface LootView {
  itemId: string;
  qty: number;
  x: number;
  y: number;
  /** sessionId của người được nhặt trước; "" = ai cũng nhặt được */
  owner: string;
}

// ---------- Tin nhắn client -> server ----------
export interface UseItemMsg {
  slot: number;
}
export interface PickupMsg {
  lootId: string;
}
/** Vứt qty món ở ô slot xuống đất (qty bỏ trống = cả ô) */
export interface DropItemMsg {
  slot: number;
  qty?: number;
}

// ---------- Tin nhắn server -> client (chỉ gửi cho chủ túi) ----------
export interface InvMsg {
  slots: Inventory;
  /** Thời gian hồi chiêu còn lại (ms) theo itemId, chỉ có món đang hồi */
  cd: Record<string, number>;
  /** Vừa nhận thêm (để hiện "+1 Nanh sói"); không có khi chỉ đồng bộ lại */
  gained?: InvSlot[];
}
