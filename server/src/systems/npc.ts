// Tương tác NPC: nói chuyện, nhận / trả / bỏ nhiệm vụ, đổi đồ.
// Mọi thao tác đều kiểm tra lại ở server: còn sống, đứng gần NPC, đủ điều kiện.
import {
  QUESTS,
  QUEST_BY_ID,
  TRADES,
  TRADE_BY_ID,
  RECIPES,
  RECIPE_BY_ID,
  ITEM_BY_ID,
  SHOP_BY_NPC,
  canAccept,
  countItem,
  dayKey,
  questReady,
  type DialogMsg,
  type DialogOption,
  type NpcDef,
  type QuestDef,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { World, PlayerCtrl } from "../world";
import { exchangeItems, sendInv } from "./inventory";
import { gainExp } from "./progression";
import { onTalked, questCtx, questsView, sendQuests } from "./quests";
import { byId } from "./lookup";
import { nearNpc } from "./near-npc";
import { GATEKEEPER_ID, dungeonDialog } from "./dungeon";

// nearNpc sống ở near-npc.ts (để dungeon.ts không phải import npc.ts); giữ tên cũ cho các nơi đã import từ đây
export { nearNpc };

const itemName = (id: string) => ITEM_BY_ID[id]?.name ?? id;

/** Hộp thoại theo trạng thái nhiệm vụ hiện tại của người chơi với NPC này. */
function buildDialog(w: World, p: Player, c: PlayerCtrl, npc: NpcDef): DialogMsg {
  const ctx = questCtx(p, c);
  const log = questsView(w, c);
  const mine = (q: QuestDef | undefined): q is QuestDef => q?.giver === npc.id;
  const active = c.quests.active.map((a) => ({ a, def: QUEST_BY_ID[a.id] }));
  const ready = active
    .filter(({ a, def }) => mine(def) && questReady(def, a, ctx))
    .map((x) => x.def);
  const doing = active.filter(({ def }) => mine(def) && !ready.includes(def)).map((x) => x.def);
  const offers = QUESTS.filter((q) => mine(q) && canAccept(q, log, ctx));

  const options: DialogOption[] = [
    ...ready.map((q) => ({
      label: `Trả nhiệm vụ: ${q.title}`,
      action: { kind: "turnIn" as const, questId: q.id },
    })),
    ...offers.map((q) => ({
      label: `Nhận nhiệm vụ: ${q.title}`,
      action: { kind: "accept" as const, questId: q.id },
    })),
    ...TRADES.filter((t) => t.npcId === npc.id).map((t) => ({
      label: `Đổi ${t.give.map((g) => `${g.qty} ${itemName(g.itemId)}`).join(" + ")} lấy ${t.get.qty} ${itemName(t.get.itemId)}`,
      action: { kind: "trade" as const, tradeId: t.id },
      ...(t.give.every((g) => countItem(c.inv, g.itemId) >= g.qty) ? {} : { disabled: true }),
    })),
    // NPC có công thức rèn: một lựa chọn mở bảng rèn (danh sách RECIPES do client tự vẽ)
    ...(RECIPES.some((x) => x.npcId === npc.id)
      ? [{ label: "Rèn đồ", action: { kind: "forge" as const } }]
      : []),
    // NPC có cửa hàng: một lựa chọn mở bảng mua / bán (hàng bán do client đọc từ SHOP_BY_NPC)
    ...(SHOP_BY_NPC[npc.id] ? [{ label: "Cửa hàng", action: { kind: "shop" as const } }] : []),
    { label: "Rời đi", action: { kind: "close" } },
  ];
  // Ưu tiên: có nhiệm vụ để trả > có nhiệm vụ mới > đang làm dở > lời chào
  const lines = ready[0]
    ? [`Việc "${ready[0].title}" xong rồi sao? Để ta xem nào.`]
    : (offers[0]?.talk.offer ?? doing[0]?.talk.progress ?? npc.dialog);
  return { npcId: npc.id, lines, options };
}

export function talk(w: World, sid: string, npcId: unknown) {
  const r = nearNpc(w, sid, npcId);
  if (!r) return;
  const met = onTalked(w, sid, r.npc.id);
  const d = buildDialog(w, r.p, r.c, r.npc);
  // Thủ môn: thêm nút mở bí cảnh (theo điều kiện của đội) và dòng lý do / số lượt thưởng còn lại
  if (r.npc.id === GATEKEEPER_ID) {
    const extra = dungeonDialog(w, sid);
    if (extra) {
      d.lines = [...d.lines, ...extra.lines];
      d.options = [...extra.options, ...d.options];
    }
  }
  // Vừa xong một bước "tới gặp NPC này": báo cho người chơi biết
  if (met.length)
    d.lines = [`(${met.join(", ")}: đã gặp ${r.npc.title} ${r.npc.name}.)`, ...d.lines];
  w.events.dialog(sid, d);
}

export function acceptQuest(w: World, sid: string, questId: unknown) {
  const def = byId(QUEST_BY_ID, questId);
  const r = def && nearNpc(w, sid, def.giver);
  if (!def || !r) return;
  if (!canAccept(def, questsView(w, r.c), questCtx(r.p, r.c))) return;
  r.c.quests.active.push({ id: def.id, step: 0, count: 0 });
  w.events.toast(sid, { text: `Nhận nhiệm vụ: ${def.title}`, tone: "info" });
  sendQuests(w, sid);
  // Bước đầu có thể đã đạt sẵn: đủ đồ trong túi, đủ cảnh giới, hoặc là nói chuyện với chính NPC này
  onTalked(w, sid, def.giver);
}

/**
 * Trả nhiệm vụ. Thứ tự: kiểm tra → trừ đồ + thêm đồ thưởng (nguyên khối) → bỏ khỏi danh sách đang làm → cộng tu vi.
 * Nhiệm vụ bị bỏ khỏi `active` ngay trong lần gọi đầu, nên gửi `questTurnIn` lần hai không còn gì để trả.
 */
export function turnInQuest(w: World, sid: string, questId: unknown) {
  const def = byId(QUEST_BY_ID, questId);
  const r = def && nearNpc(w, sid, def.giver);
  if (!def || !r) return;
  const { p, c } = r;
  const idx = c.quests.active.findIndex((a) => a.id === def.id);
  if (idx < 0 || !questReady(def, c.quests.active[idx], questCtx(p, c))) return;

  const remove = def.steps.flatMap((s) =>
    s.kind === "collect" ? [{ itemId: s.itemId, qty: s.count }] : [],
  );
  const add = def.rewards.items ?? [];
  if (!exchangeItems(c.inv, remove, add)) {
    return w.events.toast(sid, {
      text: "Túi đồ đã đầy, không nhận được phần thưởng.",
      tone: "bad",
    });
  }
  c.quests.active.splice(idx, 1);
  if (def.daily) c.quests.daily[def.id] = dayKey(w.now);
  else if (!c.quests.done.includes(def.id)) c.quests.done.push(def.id);

  if (def.rewards.exp) gainExp(w, sid, p, def.rewards.exp);
  w.events.toast(sid, { text: `Hoàn thành: ${def.title}`, tone: "good" });
  if (remove.length || add.length) {
    sendInv(
      w,
      sid,
      add.map((a) => ({ ...a })),
    );
  }
  sendQuests(w, sid);
  // Lời cảm ơn + các lựa chọn mới (vd nhiệm vụ tiếp theo trong chuỗi)
  w.events.dialog(sid, { ...buildDialog(w, p, c, r.npc), lines: def.talk.complete });
}

export function abandonQuest(w: World, sid: string, questId: unknown) {
  const c = w.ctrl.get(sid);
  if (!c || typeof questId !== "string") return;
  const idx = c.quests.active.findIndex((a) => a.id === questId);
  if (idx < 0) return;
  c.quests.active.splice(idx, 1);
  sendQuests(w, sid);
}

export function trade(w: World, sid: string, tradeId: unknown) {
  const t = byId(TRADE_BY_ID, tradeId);
  const r = t && nearNpc(w, sid, t.npcId);
  if (!t || !r) return;
  if (!t.give.every((g) => countItem(r.c.inv, g.itemId) >= g.qty)) {
    return w.events.toast(sid, { text: "Không đủ nguyên liệu.", tone: "bad" });
  }
  if (!exchangeItems(r.c.inv, t.give, [t.get])) {
    return w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
  }
  sendInv(w, sid, [{ ...t.get }]);
  // Cập nhật lựa chọn (còn đủ nguyên liệu để đổi tiếp không)
  w.events.dialog(sid, buildDialog(w, r.p, r.c, r.npc));
}

/** Rèn đồ theo công thức: đứng gần NPC rèn, đủ nguyên liệu; trừ nguyên liệu và thêm đồ cùng lúc. */
export function craft(w: World, sid: string, recipeId: unknown) {
  const rc = byId(RECIPE_BY_ID, recipeId);
  const r = rc && nearNpc(w, sid, rc.npcId);
  if (!rc || !r) return;
  if (!rc.inputs.every((g) => countItem(r.c.inv, g.itemId) >= g.qty)) {
    return w.events.toast(sid, { text: "Không đủ nguyên liệu.", tone: "bad" });
  }
  // exchangeItems làm trên bản sao: túi đầy thì không trừ gì, không mất nguyên liệu
  if (!exchangeItems(r.c.inv, rc.inputs, [rc.output])) {
    return w.events.toast(sid, { text: "Túi đồ đã đầy.", tone: "bad" });
  }
  w.events.toast(sid, { text: `Rèn thành công ${itemName(rc.output.itemId)}.`, tone: "good" });
  sendInv(w, sid, [{ ...rc.output }]);
}
