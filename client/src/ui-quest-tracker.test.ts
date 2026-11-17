import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ITEM_BY_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  QUESTS,
  emptyInventory,
  realmLabel,
  type QuestCtx,
  type QuestDef,
  type QuestProgress,
} from "@tien-gioi/shared";
import { describeStep, renderQuestTrackerView } from "./ui-quest-tracker";
import { QUEST_KIND_BADGE, questKind, questReadyText } from "./quest-log";

const ctx = (): QuestCtx => ({ realm: 0, tier: 0, inv: emptyInventory() });
const firstWith = (kind: string): QuestDef => {
  const d = QUESTS.find((q) => q.steps[0]?.kind === kind);
  if (!d) throw new Error(`không có nhiệm vụ nào bắt đầu bằng bước ${kind}`);
  return d;
};

describe("describeStep (chữ bước đang làm của nhiệm vụ)", () => {
  it("kill: 'Hạ <tên quái>: có / cần', chưa sẵn sàng", () => {
    const def = firstWith("kill");
    const s = def.steps[0] as { monster: string; count: number };
    const r = describeStep(def, { id: def.id, step: 0, count: 2 }, ctx());
    expect(r.ready).toBe(false);
    expect(r.text).toBe(`Hạ ${MONSTER_BY_ID[s.monster]?.name ?? s.monster}: 2/${s.count}`);
  });

  it("collect: 'Thu thập <tên đồ>: có / cần' tính theo túi đồ, không theo `count`", () => {
    const def = firstWith("collect");
    const s = def.steps[0] as { itemId: string; count: number };
    const r = describeStep(def, { id: def.id, step: 0, count: 0 }, ctx());
    expect(r.ready).toBe(false);
    expect(r.text).toBe(`Thu thập ${ITEM_BY_ID[s.itemId]?.name ?? s.itemId}: 0/${s.count}`);
  });

  it("talk: 'Tới nói chuyện với <tên NPC>'", () => {
    const def = firstWith("talk");
    const s = def.steps[0] as { npcId: string };
    const r = describeStep(def, { id: def.id, step: 0, count: 0 }, ctx());
    expect(r).toEqual({
      text: `Tới nói chuyện với ${NPC_BY_ID[s.npcId]?.name ?? s.npcId}`,
      ready: false,
    });
  });

  it("reachRealm: 'Đạt <cảnh giới>'", () => {
    const def = QUESTS.find((q) => q.steps.some((s) => s.kind === "reachRealm"));
    if (!def) return; // dữ liệu hiện không có nhiệm vụ cảnh giới: không có gì để kiểm
    const idx = def.steps.findIndex((s) => s.kind === "reachRealm");
    const s = def.steps[idx] as { realm: number; tier: number };
    const r = describeStep(def, { id: def.id, step: idx, count: 0 }, ctx());
    expect(r.text).toBe(`Đạt ${realmLabel(s.realm, s.tier)}`);
    expect(r.ready).toBe(false);
  });

  it("đã qua hết các bước và đủ điều kiện (không bước thu thập thiếu đồ): sẵn sàng trả, chữ lấy từ questReadyText", () => {
    const def = QUESTS.find((q) => q.steps.every((s) => s.kind !== "collect"))!;
    const prog: QuestProgress = { id: def.id, step: def.steps.length, count: 0 };
    const r = describeStep(def, prog, ctx());
    expect(r.ready).toBe(true);
    expect(r.text).toBe(questReadyText(def));
  });

  it("đã qua hết các bước nhưng có bước thu thập mà túi thiếu đồ: (hành vi gốc) 'Đã hoàn thành', ready", () => {
    const def = QUESTS.find((q) => q.steps.some((s) => s.kind === "collect"))!;
    const prog: QuestProgress = { id: def.id, step: def.steps.length, count: 0 };
    expect(describeStep(def, prog, ctx())).toEqual({ text: "Đã hoàn thành", ready: true });
  });

  it("bước không tồn tại (tiến độ hỏng, vượt quá số bước nhưng chưa đủ điều kiện trả): 'Đã hoàn thành'", () => {
    const def = firstWith("collect");
    // step < steps.length thì có bước; tạo trường hợp step âm: `def.steps[-1]` không có
    const r = describeStep(def, { id: def.id, step: -1, count: 0 }, ctx());
    expect(r).toEqual({ text: "Đã hoàn thành", ready: true });
  });
});

// ---------- DOM giả đủ dùng cho renderQuestTrackerView ----------
class FakeEl {
  className = "";
  textContent = "";
  title = "";
  hidden = false;
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  handlers = new Map<string, (e: unknown) => void>();
  private cls = new Set<string>();
  classList = {
    toggle: (c: string, on: boolean) => void (on ? this.cls.add(c) : this.cls.delete(c)),
    contains: (c: string) => this.cls.has(c),
  };
  append(...k: FakeEl[]) {
    this.children.push(...k);
  }
  replaceChildren() {
    this.children = [];
  }
  addEventListener(t: string, h: (e: unknown) => void) {
    this.handlers.set(t, h);
  }
}

function stubDom() {
  const byId: Record<string, FakeEl> = {};
  for (const id of ["quest-tracker-list", "qt-count", "qt-hint", "quest-tracker", "qt-toggle"])
    byId[id] = new FakeEl();
  vi.stubGlobal("document", {
    getElementById: (id: string) => byId[id] ?? null,
    createElement: () => new FakeEl(),
  });
  return byId;
}

afterEach(() => vi.unstubAllGlobals());

describe("renderQuestTrackerView (bảng theo dõi nhiệm vụ HUD)", () => {
  const A = QUESTS[0]!;
  const B = QUESTS[1]!;
  const prog = (d: QuestDef): QuestProgress => ({ id: d.id, step: 0, count: 0 });
  const run = (active: QuestProgress[], trackingId: string | null) => {
    const dom = stubDom();
    const onTrack = vi.fn();
    const out = renderQuestTrackerView({ active, trackingId, ctx: ctx(), onTrack });
    return { dom, onTrack, out };
  };
  const items = (dom: Record<string, FakeEl>) => dom["quest-tracker-list"]!.children;

  it("không có nhiệm vụ: gợi ý một dòng, khung 'empty', không số đếm, KHÔNG đổi nhiệm vụ theo dõi", () => {
    const { dom, out } = run([], "id_cu");
    expect(out).toBe("id_cu");
    expect(items(dom)).toHaveLength(1);
    expect(items(dom)[0]!.textContent).toMatch(/^Chưa nhận nhiệm vụ/);
    expect(dom["quest-tracker"]!.classList.contains("empty")).toBe(true);
    expect(dom["qt-count"]!.textContent).toBe("");
    expect(dom["qt-hint"]!.hidden).toBe(true);
    expect(dom["qt-toggle"]!.title).toMatch(/^Chưa nhận nhiệm vụ/);
  });

  it("có nhiệm vụ: số đếm ở tiêu đề, gợi ý hiện, khung không 'empty', mỗi nhiệm vụ một thẻ", () => {
    const { dom } = run([prog(A), prog(B)], A.id);
    expect(dom["qt-count"]!.textContent).toBe(" (2)");
    expect(dom["qt-hint"]!.hidden).toBe(false);
    expect(dom["quest-tracker"]!.classList.contains("empty")).toBe(false);
    expect(dom["qt-toggle"]!.title).toBe("Thu gọn / mở bảng nhiệm vụ");
    expect(items(dom)).toHaveLength(2);
  });

  it("chưa theo dõi / theo dõi một nhiệm vụ không còn: tự chọn nhiệm vụ ĐẦU TIÊN và trả id đó", () => {
    expect(run([prog(A), prog(B)], null).out).toBe(A.id);
    expect(run([prog(A), prog(B)], "khong_con").out).toBe(A.id);
  });

  it("đang theo dõi một nhiệm vụ còn trong sổ: giữ nguyên và chỉ thẻ đó mang lớp 'tracking'", () => {
    const { dom, out } = run([prog(A), prog(B)], B.id);
    expect(out).toBe(B.id);
    expect(items(dom).map((e) => e.className.includes("tracking"))).toEqual([false, true]);
  });

  it("thẻ có tên, huy hiệu loại nhiệm vụ và chữ bước", () => {
    const { dom } = run([prog(A)], A.id);
    const card = items(dom)[0]!;
    const [titleRow, step] = card.children;
    expect(titleRow!.children[0]!.textContent).toBe(A.title);
    expect(titleRow!.children[1]!.textContent).toBe(QUEST_KIND_BADGE[questKind(A)]);
    expect(step!.textContent).toBe(describeStep(A, prog(A), ctx()).text);
  });

  it("nhiệm vụ lạ (id không có trong bảng) bị bỏ qua, không làm hỏng danh sách", () => {
    const { dom } = run([{ id: "khong_co_that", step: 0, count: 0 }, prog(B)], null);
    expect(items(dom)).toHaveLength(1);
  });

  it("chạm một thẻ: chặn mặc định và báo onTrack với đúng id nhiệm vụ", () => {
    const { dom, onTrack } = run([prog(A), prog(B)], A.id);
    const e = { preventDefault: vi.fn() };
    items(dom)[1]!.handlers.get("pointerdown")!(e);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(onTrack).toHaveBeenCalledWith(B.id);
    expect(onTrack).toHaveBeenCalledTimes(1);
  });
});

describe("nối vào ui.ts (canh MÃ NGUỒN: hành vi thật do check-quest-log / check-hud / check-sect-hall kiểm bằng Chrome)", () => {
  const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");

  it("renderQuestTracker gán lại nhiệm vụ theo dõi từ giá trị `renderQuestTrackerView` trả về (tự chọn mặc định phải được nhớ)", () => {
    expect(ui).toMatch(/trackingQuestId = renderQuestTrackerView\(\{/);
  });

  it("chạm thẻ giữ ĐÚNG thứ tự cũ: đặt nhiệm vụ theo dõi, vẽ lại, rồi báo cảnh (onTrackQuest)", () => {
    expect(ui).toMatch(
      /onTrack: \(id\) => \{\s*trackingQuestId = id;\s*renderQuestTracker\(\);\s*callbacks\?\.onTrackQuest\?\.\(id\);\s*\},/,
    );
  });

  it("ui.ts không còn bản sao của describeStep / vẽ thẻ (một nơi duy nhất) và sổ nhiệm vụ dùng describeStep với bối cảnh hiện tại", () => {
    expect(ui).not.toMatch(/function describeStep\(/);
    expect(ui).not.toMatch(/className = "qt-item/);
    expect(ui).toMatch(/describeStep\(def, a, getCtx\(\)\)/);
  });
});
