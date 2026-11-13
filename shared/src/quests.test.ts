import { describe, expect, it } from "vitest";
import {
  NPCS,
  NPC_BY_ID,
  TRADES,
  QUESTS,
  QUEST_BY_ID,
  QUEST_PREV,
  MONSTER_BY_ID,
  ITEM_BY_ID,
  PLAYER_RADIUS,
  MAX_ACTIVE_QUESTS,
  DEFAULT_MAP_ID,
  getMap,
  emptyInventory,
  dayKey,
  countItem,
  stepSatisfied,
  questReady,
  canAccept,
  npcMarker,
  MAIN_QUEST_START,
  stepOf,
  type QuestsMsg,
  type QuestCtx,
} from "./index";

const ctx = (realm = 0, tier = 0, inv = emptyInventory()): QuestCtx => ({ realm, tier, inv });
const log = (p: Partial<QuestsMsg> = {}): QuestsMsg => ({
  active: [],
  done: [],
  dailyDone: [],
  ...p,
});

describe("dữ liệu NPC và đổi đồ", () => {
  it("id không trùng; NPC đứng trong trấn, chỗ đi lại được, không chồng lên nhau", () => {
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
    for (const n of NPCS) {
      const mapId = n.mapId ?? DEFAULT_MAP_ID;
      const map = getMap(mapId)!; // NPC đứng trong trấn của bản đồ CỦA NÓ
      expect(map, `NPC ${n.id}: bản đồ ${mapId} không có`).toBeDefined();
      expect(map.inTown(n.x, n.y)).toBe(true);
      expect(map.circleBlocked(n.x, n.y, PLAYER_RADIUS)).toBe(false);
      for (const o of NPCS)
        if (o !== n && (o.mapId ?? DEFAULT_MAP_ID) === mapId)
          expect(Math.hypot(o.x - n.x, o.y - n.y)).toBeGreaterThan(64);
    }
  });

  it("đổi đồ trỏ tới NPC và vật phẩm có thật, số lượng dương", () => {
    expect(new Set(TRADES.map((t) => t.id)).size).toBe(TRADES.length);
    for (const t of TRADES) {
      expect(NPC_BY_ID[t.npcId]).toBeDefined();
      for (const g of [...t.give, t.get]) {
        expect(ITEM_BY_ID[g.itemId]).toBeDefined();
        expect(g.qty).toBeGreaterThan(0);
      }
    }
  });
});

describe("dữ liệu nhiệm vụ", () => {
  it("mọi tham chiếu đều có thật", () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(NPC_BY_ID[q.giver], q.id).toBeDefined();
      expect(q.steps.length, q.id).toBeGreaterThan(0);
      if (q.next) expect(QUEST_BY_ID[q.next], q.id).toBeDefined();
      for (const it of q.rewards.items ?? []) expect(ITEM_BY_ID[it.itemId], q.id).toBeDefined();
      for (const s of q.steps) {
        if (s.kind === "kill") expect(MONSTER_BY_ID[s.monster], q.id).toBeDefined();
        if (s.kind === "collect") expect(ITEM_BY_ID[s.itemId], q.id).toBeDefined();
        if (s.kind === "talk") expect(NPC_BY_ID[s.npcId], q.id).toBeDefined();
        if (s.kind === "kill" || s.kind === "collect") expect(s.count, q.id).toBeGreaterThan(0);
      }
      expect(
        q.talk.offer.length && q.talk.progress.length && q.talk.complete.length,
        q.id,
      ).toBeTruthy();
    }
  });

  it("chuỗi next không vòng lặp, không hai nhiệm vụ cùng trỏ tới một nhiệm vụ, nhiệm vụ lặp không nằm trong chuỗi", () => {
    const targets = QUESTS.filter((q) => q.next).map((q) => q.next!);
    expect(new Set(targets).size).toBe(targets.length);
    for (const q of QUESTS) {
      const seen = new Set<string>();
      for (let cur: string | undefined = q.id; cur; cur = QUEST_BY_ID[cur].next) {
        expect(seen.has(cur), `vòng lặp ở ${q.id}`).toBe(false);
        seen.add(cur);
      }
      if (q.daily) expect(q.next === undefined && !targets.includes(q.id), q.id).toBe(true);
    }
  });
});

describe("dayKey", () => {
  it("đổi ngày lúc 0 giờ giờ Việt Nam (17:00 UTC)", () => {
    expect(dayKey(Date.UTC(2026, 10, 8, 16, 59))).toBe("2026-11-08");
    expect(dayKey(Date.UTC(2026, 10, 8, 17, 0))).toBe("2026-11-09");
  });
});

describe("tiến độ bước", () => {
  it("kill / talk theo count; collect đếm trong túi; reachRealm so cảnh giới", () => {
    expect(stepSatisfied({ kind: "kill", monster: "tho", count: 5 }, 4, ctx())).toBe(false);
    expect(stepSatisfied({ kind: "kill", monster: "tho", count: 5 }, 5, ctx())).toBe(true);
    expect(stepSatisfied({ kind: "talk", npcId: "duoc_su" }, 1, ctx())).toBe(true);
    const inv = emptyInventory();
    inv[2] = { itemId: "long_tho", qty: 2 };
    inv[9] = { itemId: "long_tho", qty: 1 };
    expect(countItem(inv, "long_tho")).toBe(3);
    expect(
      stepSatisfied({ kind: "collect", itemId: "long_tho", count: 3 }, 0, ctx(0, 0, inv)),
    ).toBe(true);
    expect(stepSatisfied({ kind: "reachRealm", realm: 1, tier: 3 }, 0, ctx(1, 2))).toBe(false);
    expect(stepSatisfied({ kind: "reachRealm", realm: 1, tier: 3 }, 0, ctx(2, 0))).toBe(true);
  });

  it("đã qua bước collect nhưng vứt bớt đồ thì chưa trả được", () => {
    const def = QUEST_BY_ID.tru_tho;
    const inv = emptyInventory();
    inv[0] = { itemId: "long_tho", qty: 3 };
    const prog = { id: def.id, step: def.steps.length, count: 0 };
    expect(questReady(def, prog, ctx(0, 0, inv))).toBe(true);
    inv[0] = { itemId: "long_tho", qty: 2 };
    expect(questReady(def, prog, ctx(0, 0, inv))).toBe(false);
    expect(questReady(def, { ...prog, step: 1 }, ctx(0, 0, inv))).toBe(false);
  });
});

describe("nhận nhiệm vụ và ký hiệu NPC", () => {
  it("nhiệm vụ sau trong chuỗi chỉ mở khi xong nhiệm vụ trước; nhiệm vụ đã xong không nhận lại", () => {
    expect(canAccept(QUEST_BY_ID.nhap_the, log(), ctx())).toBe(true);
    expect(canAccept(QUEST_BY_ID.tru_tho, log(), ctx())).toBe(false);
    expect(canAccept(QUEST_BY_ID.tru_tho, log({ done: ["nhap_the"] }), ctx())).toBe(true);
    expect(canAccept(QUEST_BY_ID.nhap_the, log({ done: ["nhap_the"] }), ctx())).toBe(false);
    expect(
      canAccept(
        QUEST_BY_ID.nhap_the,
        log({ active: [{ id: "nhap_the", step: 0, count: 0 }] }),
        ctx(),
      ),
    ).toBe(false);
  });

  it("nhiệm vụ lặp: cần đủ cảnh giới, mỗi ngày một lần", () => {
    const q = QUEST_BY_ID.lang_hai;
    expect(canAccept(q, log(), ctx(0, 0))).toBe(false);
    expect(canAccept(q, log(), ctx(1, 0))).toBe(true);
    expect(canAccept(q, log({ dailyDone: ["lang_hai"], done: ["lang_hai"] }), ctx(1, 0))).toBe(
      false,
    );
    expect(canAccept(q, log({ done: ["lang_hai"] }), ctx(1, 0))).toBe(true); // hôm qua làm rồi thì hôm nay vẫn nhận được
  });

  it("giới hạn số nhiệm vụ nhận cùng lúc", () => {
    const active = Array.from({ length: MAX_ACTIVE_QUESTS }, (_, i) => ({
      id: `x${i}`,
      step: 0,
      count: 0,
    }));
    expect(canAccept(QUEST_BY_ID.nhap_the, log({ active }), ctx())).toBe(false);
  });

  it("'?' khi có nhiệm vụ để trả, '!' khi có nhiệm vụ mới, '' khi không có gì", () => {
    expect(npcMarker("truong_tran", log(), ctx())).toBe("!");
    expect(npcMarker("tho_ren", log(), ctx())).toBe("");
    expect(npcMarker("cao_thi", log(), ctx())).toBe(""); // chưa đủ cảnh giới
    const ready = log({ active: [{ id: "nhap_the", step: 1, count: 0 }] });
    expect(npcMarker("truong_tran", ready, ctx())).toBe("?");
    const doing = log({ active: [{ id: "nhap_the", step: 0, count: 0 }] });
    expect(npcMarker("truong_tran", doing, ctx())).toBe("");
  });
});

describe("nội dung nhiệm vụ (#19)", () => {
  /** Chuỗi chính theo `next`, bắt đầu từ MAIN_QUEST_START */
  const chain = () => {
    const out: string[] = [];
    for (let id: string | undefined = MAIN_QUEST_START; id; id = QUEST_BY_ID[id].next) out.push(id);
    return out;
  };

  it("chuỗi chính: Luyện Khí (8 nhiệm vụ) -> Trúc Cơ (2) -> Kim Đan (6); mọi nhiệm vụ không lặp nằm trong chuỗi, trừ việc phụ mang_hoan; Luyện Khí kết thúc ở tầng 9", () => {
    const ids = chain();
    expect(ids).toHaveLength(16);
    // Việc phụ không có người đứng trước và không nằm trong chuỗi: hạ Xích Mãng (không an toàn khi solo) KHÔNG được chặn chuỗi chính
    expect(new Set([...ids, "mang_hoan"])).toEqual(
      new Set(QUESTS.filter((q) => !q.daily).map((q) => q.id)),
    );
    expect(ids).not.toContain("mang_hoan");
    expect(QUEST_PREV.mang_hoan).toBeUndefined();
    expect(QUEST_BY_ID.mang_hoan.next).toBeUndefined();
    const i = ids.indexOf("dinh_luyen_khi");
    expect(i).toBe(7); // nhiệm vụ Luyện Khí cuối cùng
    expect(QUEST_BY_ID.dinh_luyen_khi.steps.at(-1)).toEqual({
      kind: "reachRealm",
      realm: 1,
      tier: 8,
    });
    expect(ids.slice(i + 1, i + 3)).toEqual(["truc_co_nhap_mon", "thanh_lo_tram"]);
    expect(ids.slice(i + 3)).toEqual([
      "vong_suong",
      "suong_ho_hoan",
      "thach_quy_giap",
      "doc_thiem_nang",
      "kim_dan_hau_ky",
      "giao_hoan",
    ]);
  });

  it("mốc cảnh giới trong chuỗi chỉ tăng dần", () => {
    let prev = -1;
    for (const id of chain()) {
      for (const s of QUEST_BY_ID[id].steps) {
        if (s.kind !== "reachRealm") continue;
        const st = stepOf(s.realm, s.tier);
        expect(st, id).toBeGreaterThan(prev);
        prev = st;
      }
    }
  });

  it("3 nhiệm vụ lặp ở Bảng cáo thị (Lạc Hà) và 3 ở Vọng Sương Trạm (Kim Đan, M6)", () => {
    const daily = QUESTS.filter((q) => q.daily);
    expect(daily).toHaveLength(6);
    expect(daily.filter((q) => q.giver === "cao_thi")).toHaveLength(3);
    const vs = daily.filter((q) => q.giver === "tram_truong");
    expect(vs).toHaveLength(3);
    for (const q of vs) expect(q.minRealm, q.id).toEqual(expect.objectContaining({ realm: 3 }));
  });

  it("người chơi mới thấy '!' ở Trưởng trấn ngay khi vào game", () => {
    expect(npcMarker("truong_tran", log(), ctx())).toBe("!");
    expect(NPCS.filter((n) => npcMarker(n.id, log(), ctx()) === "!").map((n) => n.id)).toEqual([
      "truong_tran",
    ]);
  });
});
