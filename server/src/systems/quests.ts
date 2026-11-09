// Nhiệm vụ: tiến độ cập nhật từ sự kiện (hạ quái, túi đồ đổi, lên cảnh giới, nói chuyện).
// Mọi nhiệm vụ đi chung một luồng theo dữ liệu trong shared/src/quests.ts, không có code riêng từng nhiệm vụ.
import {
  QUEST_BY_ID,
  dayKey,
  stepSatisfied,
  type QuestCtx,
  type QuestProgress,
  type QuestsMsg,
} from "@tien-gioi/shared";
import type { Player } from "../schema";
import type { QuestSave } from "../store";
import type { World, PlayerCtrl } from "../world";
import { byId } from "./lookup";

/** Đọc sổ nhiệm vụ từ file lưu: bỏ nhiệm vụ không còn tồn tại, ép bước / tiến độ về khoảng hợp lệ. */
export function sanitizeQuests(raw: unknown): QuestSave {
  const r = (raw ?? {}) as Partial<QuestSave>;
  const ids = new Set<string>();
  const active: QuestProgress[] = [];
  for (const a of Array.isArray(r.active) ? r.active : []) {
    const def = byId(QUEST_BY_ID, a?.id);
    if (!def || ids.has(def.id)) continue;
    ids.add(def.id);
    const step = Math.min(def.steps.length, Math.max(0, Math.floor(Number(a.step)) || 0));
    const count = Math.max(0, Math.floor(Number(a.count)) || 0);
    active.push({ id: def.id, step, count });
  }
  const done = [
    ...new Set((Array.isArray(r.done) ? r.done : []).filter((id) => byId(QUEST_BY_ID, id))),
  ];
  const daily: Record<string, string> = {};
  if (r.daily && typeof r.daily === "object") {
    for (const [id, day] of Object.entries(r.daily)) {
      if (byId(QUEST_BY_ID, id)?.daily && typeof day === "string") daily[id] = day;
    }
  }
  return { active, done, daily };
}

export function questCtx(p: Player, c: PlayerCtrl): QuestCtx {
  return { realm: p.realm, tier: p.tier, inv: c.inv };
}

/** Dạng gửi cho client (và dùng cho canAccept / npcMarker) */
export function questsView(w: World, c: PlayerCtrl): QuestsMsg {
  const today = dayKey(w.now);
  return {
    active: c.quests.active.map((a) => ({ ...a })),
    done: [...c.quests.done],
    dailyDone: Object.keys(c.quests.daily).filter((id) => c.quests.daily[id] === today),
  };
}

export function sendQuests(w: World, sid: string) {
  const c = w.ctrl.get(sid);
  if (c) w.events.quests(sid, questsView(w, c));
}

/** Chuyển sang bước sau chừng nào bước hiện tại đã đạt. Trả về true nếu có thay đổi. */
function advance(prog: QuestProgress, ctx: QuestCtx): boolean {
  const def = QUEST_BY_ID[prog.id];
  let changed = false;
  while (
    def &&
    prog.step < def.steps.length &&
    stepSatisfied(def.steps[prog.step], prog.count, ctx)
  ) {
    prog.step += 1;
    prog.count = 0;
    changed = true;
  }
  return changed;
}

/** Tính lại mọi nhiệm vụ đang làm (sau khi túi đồ / cảnh giới đổi); có thay đổi thì gửi sổ mới. */
export function refreshQuests(w: World, sid: string) {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!p || !c) return;
  const ctx = questCtx(p, c);
  let changed = false;
  for (const a of c.quests.active) changed = advance(a, ctx) || changed;
  if (changed) sendQuests(w, sid);
}

/** Cộng tiến độ cho bước hiện tại nếu khớp `match`, rồi chuyển bước. Trả về tên các nhiệm vụ được cộng. */
function bump(w: World, sid: string, match: (prog: QuestProgress) => boolean): string[] {
  const p = w.state.players.get(sid);
  const c = w.ctrl.get(sid);
  if (!p || !c) return [];
  const ctx = questCtx(p, c);
  const hit: string[] = [];
  let changed = false;
  for (const a of c.quests.active) {
    changed = advance(a, ctx) || changed; // vd bước collect phía trước vừa đủ
    if (match(a)) {
      a.count += 1;
      advance(a, ctx);
      hit.push(QUEST_BY_ID[a.id].title);
      changed = true;
    }
  }
  if (changed) sendQuests(w, sid);
  return hit;
}

/** Người chơi góp phần hạ một con quái. */
export function onMonsterKilled(w: World, sid: string, monster: string) {
  bump(w, sid, (a) => {
    const s = QUEST_BY_ID[a.id]?.steps[a.step];
    return s?.kind === "kill" && s.monster === monster;
  });
}

/** Người chơi nói chuyện với NPC (đã kiểm tra khoảng cách). Trả về tên các nhiệm vụ vừa xong bước gặp NPC này. */
export function onTalked(w: World, sid: string, npcId: string): string[] {
  return bump(w, sid, (a) => {
    const s = QUEST_BY_ID[a.id]?.steps[a.step];
    return s?.kind === "talk" && s.npcId === npcId;
  });
}
