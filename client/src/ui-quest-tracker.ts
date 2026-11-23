// Bảng theo dõi nhiệm vụ trên HUD (QUYET_DINH_M3 mục 15 / 28): chữ mô tả bước đang làm và vẽ danh sách. Tách khỏi `ui.ts` (dọn ui.ts bước 2: mỗi PR một mô-đun, CHỈ chuyển mã, không đổi
// hành vi). Không giữ trạng thái: nhiệm vụ đang làm, nhiệm vụ được theo dõi và bối cảnh (cảnh giới, túi đồ) do `ui.ts` truyền vào; chỉ tạo phần tử bằng `createElement` + `textContent`.
import {
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  questDefAny,
  questReady,
  realmLabel,
  stepProgress,
  stepSatisfied,
  type QuestCtx,
  type QuestDef,
  type QuestProgress,
} from "@tien-gioi/shared";
import { QUEST_KIND_BADGE, questKind, questReadyText } from "./quest-log";
import { $ } from "./ui-util";

/** Chữ mô tả bước hiện tại của một nhiệm vụ và đã sẵn sàng trả chưa. */
export function describeStep(
  def: QuestDef,
  prog: QuestProgress,
  ctx: QuestCtx,
): {
  text: string;
  ready: boolean;
} {
  if (questReady(def, prog, ctx)) {
    return { text: questReadyText(def), ready: true };
  }
  // Đã qua hết các bước nhưng CHƯA trả được: chỉ còn một lý do, bước thu thập mà túi đang thiếu (lỡ vứt / bán / dùng đồ sau khi qua bước đó; `questReady` bắt buộc đủ đồ lúc trả).
  // Trước đây rơi xuống "Đã hoàn thành" kèm `ready` nên thẻ báo xong trong khi NPC không có dấu "?" và máy chủ từ chối nhận: nói rõ còn thiếu gì.
  if (prog.step >= def.steps.length) {
    for (const st of def.steps) {
      if (st.kind !== "collect" || stepSatisfied(st, 0, ctx)) continue;
      const p = stepProgress(st, 0, ctx);
      const it = ITEM_BY_ID[st.itemId]?.name ?? st.itemId;
      return { text: `Cần đủ ${it}: ${p.have}/${p.need} để trả nhiệm vụ`, ready: false };
    }
  }
  const s = def.steps[prog.step];
  if (!s) return { text: "Đã hoàn thành", ready: true };
  const p = stepProgress(s, prog.count, ctx);
  switch (s.kind) {
    case "kill": {
      const mon = MONSTER_BY_ID[s.monster]?.name ?? s.monster;
      return { text: `Hạ ${mon}: ${p.have}/${p.need}`, ready: false };
    }
    case "collect": {
      const it = ITEM_BY_ID[s.itemId]?.name ?? s.itemId;
      return { text: `Thu thập ${it}: ${p.have}/${p.need}`, ready: false };
    }
    case "talk": {
      const npc = NPC_BY_ID[s.npcId]?.name ?? s.npcId;
      return { text: `Tới nói chuyện với ${npc}`, ready: false };
    }
    case "reachRealm": {
      return { text: `Đạt ${realmLabel(s.realm, s.tier)}`, ready: false };
    }
  }
}

/** Vẽ lại bảng theo dõi nhiệm vụ trên HUD; trả nhiệm vụ đang được theo dõi sau khi tự chọn mặc định (nhiệm vụ đầu tiên) nếu chưa chọn / không còn. */
export function renderQuestTrackerView(opts: {
  active: readonly QuestProgress[];
  /** Nhiệm vụ đang theo dõi (có thể rỗng / không còn trong `active`: khi đó chọn nhiệm vụ đầu tiên) */
  trackingId: string | null;
  ctx: QuestCtx;
  /** Người chơi chạm một nhiệm vụ: bên gọi đặt lại nhiệm vụ theo dõi, vẽ lại và báo cảnh (chỉ đường) */
  onTrack: (id: string) => void;
}): string | null {
  const { active, ctx, onTrack } = opts;
  let trackingId = opts.trackingId;
  const list = $("quest-tracker-list");
  list.replaceChildren();
  // Số nhiệm vụ đang làm ở tiêu đề (còn thấy khi thu gọn)
  $("qt-count").textContent = active.length ? ` (${active.length})` : "";
  // Gợi ý "chạm nhiệm vụ để chỉ đường" nằm NGOÀI nút thu gọn / mở (nằm trong nút thì người chơi tưởng bấm tiêu đề là chỉ đường); chỉ hiện khi có nhiệm vụ để chạm
  $("qt-hint").hidden = active.length === 0;
  // Chưa có nhiệm vụ: bảng chỉ còn tiêu đề một dòng (gợi ý nằm ở `title` của nút), khỏi chiếm chỗ vô ích
  const trackerEl = $("quest-tracker");
  trackerEl.classList.toggle("empty", active.length === 0);
  $("qt-toggle").title =
    active.length === 0
      ? "Chưa nhận nhiệm vụ: gặp Trưởng trấn hoặc Bảng cáo thị"
      : "Thu gọn / mở bảng nhiệm vụ";

  if (!active.length) {
    const p = document.createElement("p");
    p.style.opacity = "0.7";
    p.style.fontSize = "var(--fs-11)";
    p.style.margin = "2px 0";
    p.textContent = "Chưa nhận nhiệm vụ. Gặp Trưởng trấn hoặc Bảng cáo thị để nhận việc.";
    list.append(p);
    return trackingId;
  }

  // Tự động gán nhiệm vụ theo dõi mặc định nếu chưa chọn
  if (!trackingId || !active.some((a) => a.id === trackingId)) {
    trackingId = active[0]?.id ?? null;
  }

  for (const a of active) {
    const def = questDefAny(a.id); // nhiệm vụ thường + nhiệm vụ tông môn (M8)
    if (!def) continue;
    const { text, ready } = describeStep(def, a, ctx);

    const div = document.createElement("div");
    div.className = `qt-item${ready ? " ready" : ""}${trackingId === def.id ? " tracking" : ""}`;

    const titleRow = document.createElement("div");
    titleRow.className = "qt-title";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = def.title;

    const badge = document.createElement("span");
    badge.className = "qt-badge";
    badge.textContent = QUEST_KIND_BADGE[questKind(def)];

    titleRow.append(nameSpan, badge);

    const stepEl = document.createElement("div");
    stepEl.className = "qt-step";
    stepEl.textContent = text;

    div.append(titleRow, stepEl);
    div.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onTrack(def.id);
    });

    list.append(div);
  }
  return trackingId;
}
