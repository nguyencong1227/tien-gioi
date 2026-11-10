// Thử nghiệm thuộc tính (property / fuzz) cho kinh tế (M4-sớm, #253; docs/PHAN_CONG_M4.md mục 2.2): chuỗi thao tác NGẪU NHIÊN có hạt
// giống (mua / bán / vứt / nhặt / mặc / tháo / dùng đan / đổi đồ / rèn / nhận - trả - bỏ nhiệm vụ / đồ rơi hết hạn / lưu rồi nạp lại)
// của nhiều người chơi trong một World giả. Sau MỖI bước kiểm hai lớp:
//  1. "Sổ cái" theo thao tác: chụp toàn bộ Linh thạch + vật phẩm (túi + trang bị + đồ trên đất) TRƯỚC / SAU và đòi độ lệch đúng bằng
//     "không gì cả" hoặc đúng hiệu ứng của thao tác đó (mua: -giá x số lượng, +hàng; vứt / nhặt / mặc / tháo: tổng vật phẩm KHÔNG đổi;
//     bán: chỉ đổi lấy đúng giá bán...). Tức là không thao tác nào được SINH THÊM hay LÀM MẤT tiền / đồ ngoài công thức.
//  2. Bất biến cấu trúc: túi đúng 24 ô, mỗi ô 1..stack, ví nguyên 0..COIN_CAP, trang bị đúng ô, đồ trên đất qty nguyên >= 1.
// Nguồn sinh hợp lệ (quái rơi / thưởng) là các thao tác "nguồn" riêng; mỗi nhiệm vụ chỉ trả thưởng MỘT lần (mỗi ngày với nhiệm vụ lặp).
// Mọi lỗi in kèm hạt + số bước để tái hiện: đổi `SEEDS` / `STEPS` rồi chạy lại.
import { describe, expect, it } from "vitest";
import {
  COIN_CAP,
  EQUIP_SLOTS,
  INVENTORY_SLOTS,
  ITEMS,
  ITEM_BY_ID,
  LOOT_DESPAWN_MS,
  NPCS,
  NPC_BY_ID,
  QUEST_BY_ID,
  QUESTS,
  RECIPES,
  REALMS,
  SHOP_BY_NPC,
  SHOP_MAX_QTY,
  TRADES,
  addCoin,
  buyPrice,
  coinCarryCap,
  dayKey,
  keepSlotsOf,
  sellPrice,
  startPackOf,
  validateRebirth,
  type EquipSlot,
} from "@tien-gioi/shared";
import type { World } from "../world";
import { changeCoin, splitCoin } from "./wallet";
import { giveItem, sanitizeInventory, useItem } from "./inventory";
import { dropItem, pickup, spawnLoot, tickLoot } from "./loot";
import { buy, sell } from "./shop";
import { equip, equipmentOf, sanitizeEquipment, unequip } from "./equipment";
import { abandonQuest, acceptQuest, craft, trade, turnInQuest } from "./npc";
import { applyRebirth, beginLimbo } from "./reincarnation";
import { addPlayer, makeWorld } from "./test-helpers";

// ---------- Hạt giống, bộ sinh ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDS = ["P1", "P2", "P3"] as const;
const ITEM_IDS = ITEMS.map((i) => i.id);
const SHOP_NPCS = Object.keys(SHOP_BY_NPC);
const TRADE_NPCS = [...new Set(TRADES.map((t) => t.npcId))];
const CRAFT_NPCS = [...new Set(RECIPES.map((r) => r.npcId))];

/** Giá trị "xấu" xen lẫn giá trị tốt: server không được tin client. */
const BAD = [undefined, null, NaN, Infinity, -1, 0, 1.5, "3", {}, [], "constructor", "__proto__"];

// ---------- Ảnh chụp "sổ cái" ----------

type Counts = Record<string, number>;
interface Snap {
  coin: Counts; // theo người chơi
  mine: Record<string, Counts>; // vật phẩm của từng người (túi + trang bị)
  ground: Counts; // vật phẩm trên đất
}
const bump = (m: Counts, k: string, n: number) => void (m[k] = (m[k] ?? 0) + n);

function snap(w: World): Snap {
  const s: Snap = { coin: {}, mine: {}, ground: {} };
  for (const sid of SIDS) {
    const c = w.ctrl.get(sid)!;
    const p = w.state.players.get(sid)!;
    s.coin[sid] = c.coin;
    const mine: Counts = {};
    for (const slot of c.inv) if (slot) bump(mine, slot.itemId, slot.qty);
    for (const es of EQUIP_SLOTS) if (p[es]) bump(mine, p[es], 1);
    s.mine[sid] = mine;
  }
  w.state.loot.forEach((l) => bump(s.ground, l.itemId, l.qty));
  return s;
}

const clean = (m: Counts) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0));
const sub = (a: Counts, b: Counts): Counts => {
  const out: Counts = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  return clean(out);
};
const sum = (...ms: Counts[]): Counts => {
  const out: Counts = {};
  for (const m of ms) for (const [k, v] of Object.entries(m)) bump(out, k, v);
  return clean(out);
};
const total = (s: Snap): Counts => sum(...Object.values(s.mine), s.ground);

/** Độ lệch sau - trước, chỉ giữ phần khác 0. */
function delta(b: Snap, a: Snap) {
  const coin: Counts = {};
  const mine: Record<string, Counts> = {};
  for (const sid of SIDS) {
    coin[sid] = a.coin[sid]! - b.coin[sid]!;
    mine[sid] = sub(a.mine[sid]!, b.mine[sid]!);
  }
  return {
    coin: clean(coin),
    mine: Object.fromEntries(Object.entries(mine).filter(([, m]) => Object.keys(m).length > 0)),
    ground: sub(a.ground, b.ground),
    total: sub(total(a), total(b)),
  };
}
type Delta = ReturnType<typeof delta>;
const isNone = (d: Delta) =>
  Object.keys(d.coin).length === 0 &&
  Object.keys(d.mine).length === 0 &&
  Object.keys(d.ground).length === 0;

/** Hiệu ứng mong đợi: người `sid` đổi `coin` Linh thạch và `items` vật phẩm (ghi bằng số âm / dương); không ai khác đổi gì. */
function effect(sid: string, coin: number, items: Counts): Delta {
  const it = clean(items);
  return {
    coin: coin === 0 ? {} : { [sid]: coin },
    mine: Object.keys(it).length ? { [sid]: it } : {},
    ground: {},
    total: it,
  };
}

// ---------- Bất biến cấu trúc ----------

function checkStructure(w: World, where: string) {
  for (const sid of SIDS) {
    const c = w.ctrl.get(sid)!;
    const p = w.state.players.get(sid)!;
    const at = `${where} ${sid}`;
    expect(c.inv.length, `${at}: túi phải đủ ${INVENTORY_SLOTS} ô`).toBe(INVENTORY_SLOTS);
    for (const s of c.inv) {
      if (!s) continue;
      const def = ITEM_BY_ID[s.itemId];
      expect(def, `${at}: ô túi có vật phẩm lạ ${s.itemId}`).toBeTruthy();
      expect(
        Number.isInteger(s.qty) && s.qty >= 1 && s.qty <= def!.stack,
        `${at}: qty ${s.qty} của ${s.itemId} ngoài 1..${def!.stack}`,
      ).toBe(true);
    }
    expect(
      Number.isInteger(c.coin) && c.coin >= 0 && c.coin <= COIN_CAP,
      `${at}: ví ${c.coin}`,
    ).toBe(true);
    for (const es of EQUIP_SLOTS) {
      const id = p[es as EquipSlot];
      if (id) expect(ITEM_BY_ID[id]?.equip?.slot, `${at}: ${id} mặc sai ô ${es}`).toBe(es);
    }
    const ids = c.quests.active.map((q) => q.id);
    expect(new Set(ids).size, `${at}: nhiệm vụ đang làm trùng ${ids}`).toBe(ids.length);
  }
  w.state.loot.forEach((l, id) => {
    expect(ITEM_BY_ID[l.itemId], `${where}: đồ rơi ${id} lạ`).toBeTruthy();
    expect(Number.isInteger(l.qty) && l.qty >= 1, `${where}: đồ rơi ${id} qty ${l.qty}`).toBe(true);
    expect(Number.isFinite(l.x) && Number.isFinite(l.y), `${where}: đồ rơi ${id} toạ độ`).toBe(
      true,
    );
  });
}

// ---------- Thao tác ----------

interface Step {
  label: string;
  /** Chạy thao tác trên World. */
  run: () => void;
  /** Kiểm độ lệch; ném lỗi (expect) nếu sai. */
  verify: (d: Delta, b: Snap) => void;
}

const oneOf = (d: Delta, ...opts: { name: string; want: Delta }[]) => {
  if (isNone(d)) return;
  for (const o of opts) {
    try {
      expect(d).toEqual(o.want);
      return;
    } catch {
      /* thử phương án kế */
    }
  }
  throw new Error(
    `độ lệch không khớp phương án nào (${opts.map((o) => o.name).join(" / ") || "chỉ cho phép không đổi"}): ${JSON.stringify(d)}`,
  );
};

function makeFuzz(seed: number) {
  const rand = rng(seed);
  const { w } = makeWorld();
  w.now = 1_700_000_000_000;
  const realms = [REALMS.length - 1, 1, 0];
  SIDS.forEach((sid, i) => {
    addPlayer(w, sid, realms[i]!, i === 1 ? 8 : 0);
    const c = w.ctrl.get(sid)!;
    c.coin = Math.floor(rand() * 600);
  });
  const rewarded = new Map<string, number>(); // `${sid}|${questId}|${ngày}` -> số lần đã trả thưởng

  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const chance = (p: number) => rand() < p;
  const sidOf = () => pick(SIDS);
  const slotArg = (): unknown => (chance(0.85) ? Math.floor(rand() * INVENTORY_SLOTS) : pick(BAD));
  const qtyArg = (max = 120): unknown =>
    chance(0.8)
      ? 1 + Math.floor(rand() * Math.min(max, 6))
      : chance(0.5)
        ? 1 + Math.floor(rand() * max)
        : pick(BAD);
  const validQty = (q: unknown): q is number =>
    typeof q === "number" && Number.isInteger(q) && q >= 1 && q <= SHOP_MAX_QTY;
  const itemArg = (): unknown => (chance(0.9) ? pick(ITEM_IDS) : pick(BAD));

  const place = (sid: string, x: number, y: number) => {
    const p = w.state.players.get(sid)!;
    p.x = x;
    p.y = y;
  };
  const placeNear = (sid: string, npcId: string) => {
    const n = NPC_BY_ID[npcId]!;
    if (chance(0.88)) {
      place(sid, n.x + rand() * 30, n.y + rand() * 30);
      return true;
    }
    place(sid, n.x + 5000, n.y + 5000); // đứng xa: mọi giao dịch phải bị từ chối
    return false;
  };

  const steps: (() => Step)[] = [
    // ----- nguồn sinh hợp lệ (quái rơi / thưởng) -----
    () => {
      const sid = sidOf();
      const id = pick(ITEM_IDS);
      const qty = 1 + Math.floor(rand() * 30);
      return {
        label: `[nguồn] nhận ${qty} ${id} vào túi ${sid}`,
        run: () => void giveItem(w, sid, id, qty),
        verify: (d) => {
          // chỉ được TĂNG đúng người đó, không quá `qty`, không động tới ví / người khác
          expect(Object.keys(d.coin)).toEqual([]);
          for (const k of Object.keys(d.mine)) expect(k).toBe(sid);
          for (const [k, v] of Object.entries(d.total)) {
            expect(k).toBe(id);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(qty);
          }
        },
      };
    },
    () => {
      const sid = sidOf();
      const n = 1 + Math.floor(rand() * 400);
      return {
        label: `[nguồn] ${sid} nhặt ${n} Linh thạch`,
        run: () => void changeCoin(w, sid, n),
        verify: (d) => {
          expect(Object.keys(d.mine)).toEqual([]);
          expect(Object.keys(d.coin).every((k) => k === sid)).toBe(true);
          expect(d.coin[sid] ?? 0).toBeGreaterThanOrEqual(0);
          expect(d.coin[sid] ?? 0).toBeLessThanOrEqual(n);
        },
      };
    },
    () => {
      const id = pick(ITEM_IDS);
      const qty = 1 + Math.floor(rand() * ITEM_BY_ID[id]!.stack);
      const owner = chance(0.4) ? sidOf() : "";
      const x = 300 + rand() * 40;
      const y = 300 + rand() * 40;
      return {
        label: `[nguồn] quái rơi ${qty} ${id} (chủ "${owner}")`,
        run: () => void spawnLoot(w, id, qty, x, y, owner),
        verify: (d) =>
          expect(d).toEqual({ coin: {}, mine: {}, ground: { [id]: qty }, total: { [id]: qty } }),
      };
    },
    // ----- cửa hàng -----
    () => {
      const sid = sidOf();
      const npcId = pick(SHOP_NPCS);
      const near = placeNear(sid, npcId);
      const shop = SHOP_BY_NPC[npcId]!;
      const item = chance(0.85) ? pick(shop.itemIds) : itemArg();
      const qty = qtyArg();
      return {
        label: `mua ${JSON.stringify(qty)} ${JSON.stringify(item)} ở ${npcId} (${sid}, ${near ? "gần" : "xa"})`,
        run: () => buy(w, sid, npcId, item, qty),
        verify: (d) => {
          const valid =
            near && typeof item === "string" && shop.itemIds.includes(item) && validQty(qty);
          oneOf(
            d,
            ...(valid
              ? [{ name: "mua", want: effect(sid, -buyPrice(item) * qty, { [item]: qty }) }]
              : []),
          );
        },
      };
    },
    () => {
      const sid = sidOf();
      const npcId = pick(SHOP_NPCS);
      const near = placeNear(sid, npcId);
      const c = w.ctrl.get(sid)!;
      const slot = slotArg();
      const qty = qtyArg();
      const s = typeof slot === "number" ? c.inv[slot] : null;
      const before = s ? { itemId: s.itemId, qty: s.qty } : null;
      return {
        label: `bán ${JSON.stringify(qty)} ô ${JSON.stringify(slot)} (${before?.itemId}x${before?.qty}) ở ${npcId} (${sid}, ${near ? "gần" : "xa"})`,
        run: () => sell(w, sid, npcId, slot, qty),
        verify: (d) => {
          const valid =
            near && !!before && validQty(qty) && qty <= before.qty && sellPrice(before.itemId) > 0;
          oneOf(
            d,
            ...(valid
              ? [
                  {
                    name: "bán",
                    want: effect(sid, sellPrice(before.itemId) * qty, { [before.itemId]: -qty }),
                  },
                ]
              : []),
          );
        },
      };
    },
    // ----- đồ rơi -----
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const slot = slotArg();
      const qty = chance(0.3) ? undefined : qtyArg();
      const s = typeof slot === "number" ? c.inv[slot] : null;
      const item = s?.itemId;
      return {
        label: `${sid} vứt ô ${JSON.stringify(slot)} (${item}x${s?.qty}) qty=${JSON.stringify(qty)}`,
        run: () => dropItem(w, sid, slot, qty),
        verify: (d) => {
          // chỉ chuyển từ túi ra đất: tổng không đổi, ví không đổi, đúng một loại, đúng người đó
          expect(d.coin).toEqual({});
          expect(d.total).toEqual({});
          if (isNone(d)) return;
          expect(Object.keys(d.mine)).toEqual([sid]);
          expect(Object.keys(d.ground)).toEqual([item]);
          expect(d.ground[item!]).toBeGreaterThan(0);
          expect(d.mine[sid]).toEqual({ [item!]: -d.ground[item!]! });
        },
      };
    },
    () => {
      const sid = sidOf();
      const ids = [...w.state.loot.keys()];
      const id = ids.length && chance(0.9) ? pick(ids) : pick(BAD);
      const l = typeof id === "string" ? w.state.loot.get(id) : undefined;
      if (l && chance(0.9)) place(sid, l.x + rand() * 20, l.y + rand() * 20);
      return {
        label: `${sid} nhặt ${JSON.stringify(id)} (${l?.itemId}x${l?.qty})`,
        run: () => pickup(w, sid, id),
        verify: (d) => {
          // chỉ chuyển từ đất vào túi: tổng không đổi, ví không đổi
          expect(d.coin).toEqual({});
          expect(d.total).toEqual({});
          if (isNone(d)) return;
          expect(Object.keys(d.mine)).toEqual([sid]);
          expect(Object.keys(d.ground)).toEqual([l!.itemId]);
          expect(d.ground[l!.itemId]).toBeLessThan(0);
          expect(d.mine[sid]).toEqual({ [l!.itemId]: -d.ground[l!.itemId]! });
        },
      };
    },
    () => {
      const ms = pick([1000, 20_000, LOOT_DESPAWN_MS / 2, LOOT_DESPAWN_MS + 1, 24 * 3600_000]);
      return {
        label: `thời gian trôi ${ms} ms (đồ rơi hết hạn)`,
        run: () => {
          w.now += ms;
          tickLoot(w);
        },
        verify: (d) => {
          // đồ trên đất chỉ có thể MẤT, ví và túi không đổi
          expect(d.coin).toEqual({});
          expect(d.mine).toEqual({});
          for (const v of Object.values(d.ground)) expect(v).toBeLessThan(0);
        },
      };
    },
    // ----- trang bị, dùng đan -----
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const gear = c.inv.flatMap((x, i) => (x && ITEM_BY_ID[x.itemId]?.equip ? [i] : []));
      const slot = gear.length && chance(0.8) ? pick(gear) : slotArg();
      return {
        label: `${sid} mặc ô ${JSON.stringify(slot)}`,
        run: () => equip(w, sid, slot),
        verify: (d) => {
          expect(d.coin).toEqual({});
          expect(d.total).toEqual({}); // đổi chỗ túi <-> người: tổng vật phẩm không đổi
          expect(d.ground).toEqual({});
        },
      };
    },
    () => {
      const sid = sidOf();
      const slot = chance(0.85) ? pick(EQUIP_SLOTS) : pick(BAD);
      return {
        label: `${sid} tháo ${JSON.stringify(slot)}`,
        run: () => unequip(w, sid, slot),
        verify: (d) => {
          expect(d.coin).toEqual({});
          expect(d.total).toEqual({});
          expect(d.ground).toEqual({});
        },
      };
    },
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const potions = c.inv.flatMap((x, i) => (x && ITEM_BY_ID[x.itemId]?.effect ? [i] : []));
      const slot = potions.length && chance(0.75) ? pick(potions) : slotArg();
      const s = typeof slot === "number" ? c.inv[slot] : null;
      const item = s?.itemId;
      if (chance(0.5)) w.now += 20_000; // hồi chiêu đan
      if (chance(0.7)) {
        // bị thương / cạn linh lực / chưa đầy tu vi: đan dược mới có chỗ tác dụng
        const p = w.state.players.get(sid)!;
        p.hp = Math.max(1, Math.floor(p.maxHp * rand()));
        p.mp = Math.floor(p.maxMp * rand());
        p.exp = Math.floor(p.expMax * rand() * 0.5);
      }
      return {
        label: `${sid} dùng ô ${JSON.stringify(slot)} (${item})`,
        run: () => useItem(w, sid, slot),
        verify: (d) =>
          oneOf(d, ...(item ? [{ name: "dùng", want: effect(sid, 0, { [item]: -1 }) }] : [])),
      };
    },
    // ----- đổi đồ / rèn -----
    () => {
      const sid = sidOf();
      const t = pick(TRADES);
      const near = placeNear(sid, t.npcId);
      const id = chance(0.9) ? t.id : (pick(BAD) as string);
      const items: Counts = {};
      for (const g of t.give) bump(items, g.itemId, -g.qty);
      bump(items, t.get.itemId, t.get.qty);
      return {
        label: `${sid} đổi ${JSON.stringify(id)} (${near ? "gần" : "xa"})`,
        run: () => trade(w, sid, id),
        verify: (d) =>
          oneOf(d, ...(near && id === t.id ? [{ name: "đổi", want: effect(sid, 0, items) }] : [])),
      };
    },
    () => {
      const sid = sidOf();
      const r = pick(RECIPES);
      const near = placeNear(sid, r.npcId);
      const id = chance(0.9) ? r.id : (pick(BAD) as string);
      const items: Counts = {};
      for (const g of r.inputs) bump(items, g.itemId, -g.qty);
      bump(items, r.output.itemId, r.output.qty);
      return {
        label: `${sid} rèn ${JSON.stringify(id)} (${near ? "gần" : "xa"})`,
        run: () => craft(w, sid, id),
        verify: (d) =>
          oneOf(d, ...(near && id === r.id ? [{ name: "rèn", want: effect(sid, 0, items) }] : [])),
      };
    },
    // ----- nhiệm vụ -----
    () => {
      const sid = sidOf();
      const q = pick(QUESTS);
      const near = placeNear(sid, q.giver);
      return {
        label: `${sid} nhận nhiệm vụ ${q.id} (${near ? "gần" : "xa"})`,
        run: () => acceptQuest(w, sid, q.id),
        verify: (d) => {
          expect(d.coin).toEqual({});
          expect(d.total).toEqual({}); // nhận nhiệm vụ không đụng tới đồ
        },
      };
    },
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const a = c.quests.active.length ? pick(c.quests.active) : null;
      if (a && chance(0.8)) a.step = QUEST_BY_ID[a.id]!.steps.length; // giả lập các bước giết / nói chuyện đã xong (sự kiện hợp lệ)
      return {
        label: `${sid} hoàn các bước ${a?.id}`,
        run: () => {},
        verify: (d) => expect(isNone(d)).toBe(true),
      };
    },
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const a = c.quests.active.length && chance(0.9) ? pick(c.quests.active) : null;
      const q = a ? QUEST_BY_ID[a.id]! : pick(QUESTS);
      const active = c.quests.active.some((x) => x.id === q.id); // q có thể trùng ngẫu nhiên với nhiệm vụ đang làm
      const near = placeNear(sid, q.giver);
      const items: Counts = {};
      for (const st of q.steps) if (st.kind === "collect") bump(items, st.itemId, -st.count);
      for (const r of q.rewards.items ?? []) bump(items, r.itemId, r.qty);
      const day = dayKey(w.now);
      return {
        label: `${sid} trả nhiệm vụ ${q.id} (${near ? "gần" : "xa"}, ${active ? "đang làm" : "không làm"})`,
        run: () => turnInQuest(w, sid, q.id),
        verify: (d) => {
          const was = active && c.quests.active.every((x) => x.id !== q.id); // đã rời khỏi danh sách đang làm => đã trả
          if (was) {
            const key = `${sid}|${q.id}|${q.daily ? day : "mọi ngày"}`;
            const n = (rewarded.get(key) ?? 0) + 1;
            rewarded.set(key, n);
            expect(n, `nhiệm vụ ${q.id} trả thưởng ${n} lần (${key})`).toBe(1);
            expect(d).toEqual(effect(sid, 0, items));
          } else {
            expect(isNone(d)).toBe(true);
          }
        },
      };
    },
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const id = c.quests.active.length ? pick(c.quests.active).id : pick(QUESTS).id;
      return {
        label: `${sid} bỏ nhiệm vụ ${id}`,
        run: () => abandonQuest(w, sid, id),
        verify: (d) => expect(isNone(d)).toBe(true),
      };
    },
    // ----- lưu rồi nạp lại (đóng gói hồ sơ như `persist` / `onJoin`) -----
    () => {
      const sid = sidOf();
      const c = w.ctrl.get(sid)!;
      const p = w.state.players.get(sid)!;
      return {
        label: `${sid} lưu rồi nạp lại hồ sơ`,
        run: () => {
          const file = JSON.parse(
            JSON.stringify({ inventory: c.inv, equipment: equipmentOf(p), coin: c.coin }),
          ) as { inventory: unknown; equipment: unknown; coin: number };
          // nạp lại như WorldRoom: kẹp / làm sạch, không gán thẳng
          expect(sanitizeInventory(file.inventory)).toEqual(c.inv);
          expect(sanitizeEquipment(file.equipment)).toEqual(equipmentOf(p));
          expect(addCoin(0, file.coin)).toBe(c.coin);
        },
        verify: (d) => expect(isNone(d)).toBe(true),
      };
    },
  ];

  // Nhiệm vụ hay lọt lỗi lặp thưởng: cho chúng nhiều trọng số hơn (mỗi thao tác xuất hiện nhiều lần trong bảng chọn)
  const questOps = steps.slice(-5, -1); // nhận, hoàn các bước, trả, bỏ (cuối bảng là "lưu rồi nạp lại")
  steps.push(...questOps, ...questOps);
  // Chết thật (Hoàng Tuyền) rồi đầu thai: kiếp cũ mất sạch (đồ, Linh thạch, nhiệm vụ), kiếp mới chỉ có gói khởi đầu + trang bị ĐÃ CHỌN giữ
  // (mỗi món trong `keepable` dùng tối đa một lần, tối đa số ô giữ) + Linh thạch không vượt lúc chết và trần mang theo
  const reincarnate = (): Step => {
    const sid = sidOf();
    let wantItems: Counts = {};
    let wantCoin = 0;
    return {
      label: `${sid} chết thật rồi đầu thai`,
      run: () => {
        const p = w.state.players.get(sid)!;
        const c = w.ctrl.get(sid)!;
        // chân linh đã mở các nấc: túi tiền mang qua kiếp, gói khởi đầu, ô giữ trang bị (chân linh mới tinh thì cả ba đều 0)
        c.soul = {
          ...c.soul,
          unlocks: {
            kim_nang: Math.floor(rand() * 5),
            le_ma: Math.floor(rand() * 4),
            ky_vat: Math.floor(rand() * 4),
          },
        };
        beginLimbo(w, sid, p, c);
        const limbo = c.limbo!;
        limbo.credited = true;
        const pool = [...limbo.keepable];
        const keep: string[] = [];
        for (
          let n = Math.floor(rand() * (keepSlotsOf(c.soul.unlocks) + 1));
          n > 0 && pool.length;
          n--
        )
          keep.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
        // thỉnh thoảng gửi lựa chọn gian (trùng món, món lạ): server phải từ chối rồi mới đầu thai bằng lựa chọn hợp lệ
        const bad = chance(0.3) ? { keep: [...keep, ...limbo.keepable, "constructor"] } : null;
        if (bad)
          expect(
            validateRebirth(c.soul, bad, limbo.keepable),
            "lựa chọn gian phải bị từ chối",
          ).toBeNull();
        const choice = validateRebirth(c.soul, { keep }, limbo.keepable);
        expect(choice, "lựa chọn hợp lệ phải được nhận").not.toBeNull();
        wantItems = {};
        for (const it of startPackOf(c.soul.unlocks)) bump(wantItems, it.itemId, it.qty);
        for (const id of choice!.keep) bump(wantItems, id, 1);
        wantCoin = Math.min(limbo.coinAtDeath, coinCarryCap(c.soul.unlocks));
        applyRebirth(w, sid, p, c, choice!);
        for (const k of [...rewarded.keys()]) if (k.startsWith(`${sid}|`)) rewarded.delete(k); // kiếp mới: nhiệm vụ làm lại được
      },
      verify: (d, b) => {
        expect(d.ground).toEqual({}); // chết không rơi đồ ra đất
        expect(Object.keys(d.mine).every((k) => k === sid)).toBe(true);
        const now = sum(b.mine[sid]!, d.mine[sid] ?? {});
        expect(now).toEqual(clean(wantItems));
        expect((b.coin[sid] ?? 0) + (d.coin[sid] ?? 0)).toBe(wantCoin);
        expect(wantCoin).toBeLessThanOrEqual(b.coin[sid]!); // không bao giờ có thêm Linh thạch nhờ chết
        const c = w.ctrl.get(sid)!;
        expect(w.state.players.get(sid)!.dead).toBe(false);
        expect(c.quests).toEqual({ active: [], done: [], daily: {} });
        expect(c.limbo).toBeUndefined();
      },
    };
  };
  steps.push(reincarnate);
  // Lặp đi lặp lại "nhận -> làm xong -> trả" cho cùng một nhiệm vụ: thưởng chỉ được trả MỘT lần (mỗi ngày với nhiệm vụ lặp)
  const questLoop = (): Step => {
    const sid = sidOf();
    const q = pick(QUESTS);
    return {
      label: `[nguồn] ${sid} làm đi làm lại nhiệm vụ ${q.id}`,
      run: () => {
        const c = w.ctrl.get(sid)!;
        place(sid, NPC_BY_ID[q.giver]!.x, NPC_BY_ID[q.giver]!.y);
        for (let k = 0; k < 3; k++) {
          acceptQuest(w, sid, q.id);
          const a = c.quests.active.find((x) => x.id === q.id);
          if (!a) continue;
          a.step = q.steps.length;
          for (const st of q.steps)
            if (st.kind === "collect") giveItem(w, sid, st.itemId, st.count);
          turnInQuest(w, sid, q.id);
          if (c.quests.active.some((x) => x.id === q.id)) continue; // chưa trả được (túi đầy...)
          const key = `${sid}|${q.id}|${q.daily ? dayKey(w.now) : "mọi ngày"}`;
          const n = (rewarded.get(key) ?? 0) + 1;
          rewarded.set(key, n);
          expect(n, `nhiệm vụ ${q.id} trả thưởng ${n} lần (${key})`).toBe(1);
        }
      },
      // đồ được cấp ở đây là nguồn hợp lệ; chỉ kiểm ví không đổi
      verify: (d) => expect(d.coin).toEqual({}),
    };
  };
  steps.push(questLoop, questLoop);
  // Đi săn đủ nguyên liệu cho một công thức / phép đổi / bước thu thập (nguồn hợp lệ): để rèn, đổi, trả nhiệm vụ THỰC SỰ xảy ra
  const farmOps = [
    (): [string, { itemId: string; qty: number }[]] => {
      const r = pick(RECIPES);
      return [`công thức ${r.id}`, r.inputs];
    },
    (): [string, { itemId: string; qty: number }[]] => {
      const t = pick(TRADES);
      return [`phép đổi ${t.id}`, t.give];
    },
    (): [string, { itemId: string; qty: number }[]] => {
      const gear = ITEMS.filter((i) => i.equip);
      return ["trang bị", [{ itemId: pick(gear).id, qty: 1 + Math.floor(rand() * 2) }]];
    },
    (): [string, { itemId: string; qty: number }[]] => {
      const potions = ITEMS.filter((i) => i.effect);
      return ["đan dược", [{ itemId: pick(potions).id, qty: 1 + Math.floor(rand() * 5) }]];
    },
    (): [string, { itemId: string; qty: number }[]] => {
      const q = pick(QUESTS);
      const need = q.steps.flatMap((st) =>
        st.kind === "collect" ? [{ itemId: st.itemId, qty: st.count }] : [],
      );
      return [`nhiệm vụ ${q.id}`, need];
    },
  ];
  const farm = (): Step => {
    const sid = sidOf();
    const [what, need] = pick(farmOps)();
    return {
      label: `[nguồn] ${sid} săn đủ nguyên liệu cho ${what}`,
      run: () => {
        for (const n of need) giveItem(w, sid, n.itemId, n.qty);
      },
      verify: (d) => {
        expect(d.coin).toEqual({});
        expect(d.ground).toEqual({});
        for (const k of Object.keys(d.mine)) expect(k).toBe(sid);
        for (const v of Object.values(d.total)) expect(v).toBeGreaterThan(0);
      },
    };
  };
  steps.push(farm, farm, farm);
  // Ví gần trần: nguồn Linh thạch chạm trần, bán phải bị từ chối (không mất đồ lấy tiền bị cắt) chứ không kẹp lặng lẽ
  steps.push(() => {
    const sid = sidOf();
    const c = w.ctrl.get(sid)!;
    const target = COIN_CAP - Math.floor(rand() * 40);
    return {
      label: `[nguồn] ví ${sid} gần trần (${target})`,
      run: () => void changeCoin(w, sid, target - c.coin),
      verify: (d) => {
        expect(Object.keys(d.mine)).toEqual([]);
        expect(Object.keys(d.coin).every((k) => k === sid)).toBe(true);
      },
    };
  });

  return { w, rand, steps, pick };
}

export interface FuzzResult {
  steps: number;
  counts: Record<string, number>;
}

function runFuzz(seed: number, stepCount: number): FuzzResult {
  const { w, rand, steps } = makeFuzz(seed);
  const counts: Record<string, number> = {};
  checkStructure(w, `seed ${seed} khởi đầu`);
  for (let i = 0; i < stepCount; i++) {
    const make = steps[Math.floor(rand() * steps.length)]!;
    const step = make();
    const before = snap(w);
    step.run();
    const after = snap(w);
    const where = `seed ${seed} bước ${i} «${step.label}»`;
    try {
      step.verify(delta(before, after), before);
      checkStructure(w, where);
    } catch (e) {
      throw new Error(`${where}: ${(e as Error).message}`, { cause: e });
    }
    const key = step.label.split(" ").slice(0, 2).join(" ");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { steps: stepCount, counts };
}

// ---------- Kiểm ----------

// Mặc định đủ nhanh cho CI (~6 s); chạy sâu: `FUZZ_SEEDS=400 FUZZ_STEPS=1500 npx vitest run server/src/systems/economy-fuzz.test.ts`
const SEEDS = Array.from({ length: Number(process.env.FUZZ_SEEDS) || 16 }, (_, i) => i + 1);
const STEPS = Number(process.env.FUZZ_STEPS) || 700;

describe("kinh tế: chuỗi thao tác ngẫu nhiên không sinh thêm / làm mất tiền và đồ", () => {
  it.each(SEEDS)("hạt %i: mọi bước đúng công thức và giữ bất biến", (seed) => {
    const r = runFuzz(seed, STEPS);
    expect(r.steps).toBe(STEPS);
  });

  it("bộ thao tác thật sự chạm tới các nhánh quan trọng (mua / bán / nhặt / mặc / đổi / rèn / trả nhiệm vụ đều xảy ra)", () => {
    const seen: Record<string, number> = {};
    for (const seed of SEEDS.slice(0, 8)) {
      const { w, rand, steps } = makeFuzz(seed);
      for (let i = 0; i < STEPS; i++) {
        const step = steps[Math.floor(rand() * steps.length)]!();
        const before = snap(w);
        step.run();
        const d = delta(before, snap(w));
        const op = step.label.split(" ")[0] === "[nguồn]" ? "nguồn" : step.label.split(" ")[0]!;
        const other =
          step.label.match(/ (mặc|tháo|nhặt|vứt|bán|mua|đổi|rèn|dùng|trả|nhận) /)?.[1] ?? op;
        if (!isNone(d) || other === "mặc" || other === "tháo") seen[other] = (seen[other] ?? 0) + 1;
      }
    }
    for (const k of ["mua", "bán", "nhặt", "vứt", "đổi", "rèn", "dùng", "trả", "mặc"])
      expect(seen[k] ?? 0, `thao tác "${k}" chưa lần nào thực sự đổi trạng thái`).toBeGreaterThan(
        0,
      );
  });
});

describe("giá cả: không có vòng mua - đổi - bán có lãi", () => {
  const shopItems = new Set(Object.values(SHOP_BY_NPC).flatMap((s) => s.itemIds));
  it("mọi hàng của cửa hàng: giá bán lại luôn thấp hơn giá mua (không kiếm lãi bằng mua rồi bán)", () => {
    for (const id of shopItems) {
      expect(buyPrice(id), `${id} phải mua được`).toBeGreaterThan(0);
      expect(sellPrice(id), `${id}: bán lại phải thấp hơn giá mua`).toBeLessThan(buyPrice(id));
    }
  });
  it("công thức rèn / đổi đồ: nếu mọi nguyên liệu đều MUA được thì đồ ra không bán được nhiều hơn tiền mua nguyên liệu", () => {
    const cost = (id: string) => (shopItems.has(id) ? buyPrice(id) : Infinity);
    for (const r of RECIPES) {
      const c = r.inputs.reduce((s, g) => s + cost(g.itemId) * g.qty, 0);
      if (Number.isFinite(c))
        expect(sellPrice(r.output.itemId) * r.output.qty, `rèn ${r.id}`).toBeLessThanOrEqual(c);
    }
    for (const t of TRADES) {
      const c = t.give.reduce((s, g) => s + cost(g.itemId) * g.qty, 0);
      if (Number.isFinite(c))
        expect(sellPrice(t.get.itemId) * t.get.qty, `đổi ${t.id}`).toBeLessThanOrEqual(c);
    }
  });
  it("NPC nhắc tới trong cửa hàng / đổi / rèn đều có thật (dữ liệu không trỏ vào chỗ trống)", () => {
    for (const id of [...SHOP_NPCS, ...TRADE_NPCS, ...CRAFT_NPCS])
      expect(
        NPCS.some((n) => n.id === id),
        id,
      ).toBe(true);
  });
});

describe("ví: các hàm số học không sinh thêm tiền", () => {
  it("splitCoin: tổng chia ra đúng bằng tổng đầu vào (không làm tròn mất tiền, không sinh thêm), phần nào cũng nguyên dương", () => {
    const rand = rng(7);
    for (let i = 0; i < 3000; i++) {
      const total = 1 + Math.floor(rand() * 100_000);
      const n = 1 + Math.floor(rand() * 6);
      const weights = new Map<string, number>();
      for (let k = 0; k < n; k++)
        weights.set(`s${k}`, rand() < 0.15 ? pickBad(rand) : 0.001 + rand() * 50);
      const out = splitCoin(total, weights, rand);
      const eligible = [...weights.values()].filter((x) => Number.isFinite(x) && x > 0).length;
      const got = [...out.values()].reduce((a, b) => a + b, 0);
      if (eligible === 0) expect(out.size).toBe(0);
      else expect(got, `chia ${total} cho ${JSON.stringify([...weights])}`).toBe(total);
      for (const [sid, v] of out) {
        expect(Number.isInteger(v) && v > 0, `phần ${sid}=${v}`).toBe(true);
        expect(Number.isFinite(weights.get(sid)!) && weights.get(sid)! > 0).toBe(true);
      }
    }
  });
  it("splitCoin: tổng không nguyên / không dương thì không chia gì", () => {
    const w = new Map([["a", 1]]);
    for (const t of [0, -5, 1.5, NaN, Infinity]) expect(splitCoin(t, w).size).toBe(0);
  });
  it("addCoin: luôn nguyên trong 0..COIN_CAP, không bao giờ vượt tổng đầu vào quá phần cộng", () => {
    const rand = rng(11);
    const vals = [
      0,
      1,
      7,
      1e6,
      COIN_CAP - 1,
      COIN_CAP,
      COIN_CAP + 5,
      -3,
      2.7,
      NaN,
      Infinity,
      -Infinity,
    ];
    for (const a of vals)
      for (const b of vals) {
        const r = addCoin(a, b);
        expect(Number.isInteger(r) && r >= 0 && r <= COIN_CAP, `addCoin(${a}, ${b}) = ${r}`).toBe(
          true,
        );
      }
    for (let i = 0; i < 2000; i++) {
      const a = Math.floor(rand() * COIN_CAP);
      const b = Math.floor(rand() * 2_000_000_000) - 1_000_000_000;
      const r = addCoin(a, b);
      expect(r).toBe(Math.min(COIN_CAP, Math.max(0, a + b)));
    }
  });
});

function pickBad(rand: () => number): number {
  return [NaN, Infinity, -2, 0][Math.floor(rand() * 4)]!;
}
