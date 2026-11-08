// Test đơn vị: nhiệm vụ, nói chuyện với NPC, trao thưởng, đổi đồ (World giả).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NPC_BY_ID,
  NPC_RANGE,
  QUESTS,
  QUEST_BY_ID,
  countItem,
  MAIN_QUEST_START,
  ITEM_BY_ID,
  stepOf,
  type QuestDef,
} from "@tien-gioi/shared";
import { makeWorld, addPlayer, addMonster } from "./test-helpers";
import { giveItem } from "./inventory";
import { killMonster } from "./combat";
import { applyStats, gainExp } from "./progression";
import { onMonsterKilled, refreshQuests, sanitizeQuests } from "./quests";
import { abandonQuest, acceptQuest, talk, trade, turnInQuest } from "./npc";
import type { World } from "../world";
import type { Player } from "../schema";

afterEach(() => vi.restoreAllMocks());

/** Đặt người chơi đứng ngay cạnh NPC */
function standAt(p: Player, npcId: string) {
  p.x = NPC_BY_ID[npcId].x + 10;
  p.y = NPC_BY_ID[npcId].y;
}

/** Làm xong "Nhập thế" để mở "Thỏ phá ruộng" */
function finishFirst(w: World, sid: string, p: Player) {
  standAt(p, "truong_tran");
  acceptQuest(w, sid, "nhap_the");
  standAt(p, "duoc_su");
  talk(w, sid, "duoc_su");
  standAt(p, "truong_tran");
  turnInQuest(w, sid, "nhap_the");
}

describe("nói chuyện với NPC", () => {
  it("đứng xa quá 80 px thì không có hộp thoại", () => {
    const { w, dialogs } = makeWorld();
    const { p } = addPlayer(w, "a");
    p.x = NPC_BY_ID.truong_tran.x + NPC_RANGE + 1;
    p.y = NPC_BY_ID.truong_tran.y;
    talk(w, "a", "truong_tran");
    talk(w, "a", "khong_co");
    expect(dialogs).toHaveLength(0);
  });

  it("có nhiệm vụ mới thì hiện lời mời và nút nhận, luôn có nút Rời đi", () => {
    const { w, dialogs } = makeWorld();
    const { p } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    talk(w, "a", "truong_tran");
    const d = dialogs.at(-1)!.msg;
    expect(d.lines).toEqual(QUEST_BY_ID.nhap_the.talk.offer);
    expect(d.options.map((o) => o.action)).toEqual([
      { kind: "accept", questId: "nhap_the" },
      { kind: "close" },
    ]);
  });

  it("đã trọng thương thì không nói chuyện được", () => {
    const { w, dialogs } = makeWorld();
    const { p } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    p.dead = true;
    talk(w, "a", "truong_tran");
    expect(dialogs).toHaveLength(0);
  });
});

describe("nhận nhiệm vụ", () => {
  it("nhận một lần; nhiệm vụ sau trong chuỗi chưa nhận được", () => {
    const { w, quests } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "tru_tho");
    expect(c.quests.active).toHaveLength(0);
    acceptQuest(w, "a", "nhap_the");
    acceptQuest(w, "a", "nhap_the");
    expect(c.quests.active).toEqual([{ id: "nhap_the", step: 0, count: 0 }]);
    expect(quests.at(-1)!.msg.active).toEqual([{ id: "nhap_the", step: 0, count: 0 }]);
  });

  it("phải đứng gần người giao nhiệm vụ; id rác thì bỏ qua", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "duoc_su");
    acceptQuest(w, "a", "nhap_the");
    acceptQuest(w, "a", { id: "nhap_the" });
    expect(c.quests.active).toHaveLength(0);
  });

  it("bỏ nhiệm vụ", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "nhap_the");
    abandonQuest(w, "a", "nhap_the");
    expect(c.quests.active).toHaveLength(0);
  });
});

describe("trọn một nhiệm vụ", () => {
  it("Nhập thế: nói chuyện với Hà lão rồi trả, nhận tu vi + đan, mở nhiệm vụ tiếp theo", () => {
    const { w, dialogs, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    finishFirst(w, "a", p);
    expect(c.quests.active).toHaveLength(0);
    expect(c.quests.done).toEqual(["nhap_the"]);
    expect(p.exp).toBe(20);
    expect(countItem(c.inv, "hoi_huyet_dan")).toBe(3);
    expect(toasts.at(-1)!.msg).toMatchObject({ tone: "good" });
    const d = dialogs.at(-1)!.msg;
    expect(d.lines).toEqual(QUEST_BY_ID.nhap_the.talk.complete);
    expect(d.options[0].action).toEqual({ kind: "accept", questId: "tru_tho" });
    // Lúc gặp Hà lão có dòng báo đã xong bước
    expect(dialogs.find((x) => x.msg.npcId === "duoc_su")!.msg.lines[0]).toMatch(
      /Nhập thế: đã gặp/,
    );
  });

  it("gửi questTurnIn hai lần liên tiếp chỉ được thưởng một lần", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    finishFirst(w, "a", p);
    turnInQuest(w, "a", "nhap_the");
    turnInQuest(w, "a", "nhap_the");
    expect(p.exp).toBe(20);
    expect(countItem(c.inv, "hoi_huyet_dan")).toBe(3);
    expect(c.quests.done).toEqual(["nhap_the"]);
  });

  it("chưa xong, đứng xa, hoặc đã trọng thương thì không trả được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "nhap_the");
    turnInQuest(w, "a", "nhap_the"); // chưa gặp Hà lão
    standAt(p, "duoc_su");
    talk(w, "a", "duoc_su");
    turnInQuest(w, "a", "nhap_the"); // đứng xa Trưởng trấn
    standAt(p, "truong_tran");
    p.dead = true;
    turnInQuest(w, "a", "nhap_the");
    expect(c.quests.done).toHaveLength(0);
    expect(p.exp).toBe(0);
  });

  it("Thỏ phá ruộng: hạ đúng loại quái, đủ lông thì xong, trả thì bị trừ lông", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    finishFirst(w, "a", p);
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "tru_tho");
    onMonsterKilled(w, "a", "lang"); // sai loại
    for (let i = 0; i < 4; i++) onMonsterKilled(w, "a", "tho");
    expect(c.quests.active[0]).toEqual({ id: "tru_tho", step: 0, count: 4 });
    onMonsterKilled(w, "a", "tho");
    expect(c.quests.active[0]).toEqual({ id: "tru_tho", step: 1, count: 0 });
    giveItem(w, "a", "long_tho", 5); // túi đổi -> bước collect đạt
    expect(c.quests.active[0].step).toBe(2);
    const exp = p.exp;
    turnInQuest(w, "a", "tru_tho");
    expect(countItem(c.inv, "long_tho")).toBe(2);
    expect(p.exp).toBeGreaterThan(exp);
    expect(c.quests.done).toContain("tru_tho");
  });

  it("đã đủ lông nhưng vứt bớt trước khi trả thì không trả được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    finishFirst(w, "a", p);
    acceptQuest(w, "a", "tru_tho");
    for (let i = 0; i < 5; i++) onMonsterKilled(w, "a", "tho");
    giveItem(w, "a", "long_tho", 3);
    c.inv[c.inv.findIndex((s) => s?.itemId === "long_tho")]!.qty = 2;
    turnInQuest(w, "a", "tru_tho");
    expect(c.quests.done).not.toContain("tru_tho");
  });

  it("có sẵn đồ trong túi trước khi nhận thì bước collect đạt ngay", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a", 1, 0);
    giveItem(w, "a", "nanh_soi", 5);
    standAt(p, "cao_thi");
    acceptQuest(w, "a", "nop_nanh");
    expect(c.quests.active[0].step).toBe(1);
  });

  it("hạ quái chung thì ai góp sát thương cũng được tính", () => {
    const { w } = makeWorld();
    const a = addPlayer(w, "a", 1, 0);
    const b = addPlayer(w, "b", 1, 0);
    for (const x of [a, b]) {
      standAt(x.p, "cao_thi");
      acceptQuest(w, x.p.name, "lang_hai");
      x.p.x += 300; // ra khỏi trấn (killMonster không phụ thuộc vị trí)
    }
    const { id, mc } = addMonster(w, "lang", a.p.x, a.p.y);
    mc.damageBy.set("a", 100).set("b", 40);
    killMonster(w, id, mc);
    expect(a.c.quests.active[0].count).toBe(1);
    expect(b.c.quests.active[0].count).toBe(1);
  });

  it("túi không đủ chỗ cho phần thưởng thì từ chối, giữ nguyên nhiệm vụ và nguyên liệu", () => {
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "truong_tran");
    acceptQuest(w, "a", "nhap_the");
    standAt(p, "duoc_su");
    talk(w, "a", "duoc_su");
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = { itemId: "da_ho", qty: 99 };
    standAt(p, "truong_tran");
    turnInQuest(w, "a", "nhap_the");
    expect(c.quests.active).toHaveLength(1);
    expect(p.exp).toBe(0);
    expect(toasts.at(-1)!.msg.text).toMatch(/Túi đồ đã đầy/);
  });
});

describe("nhiệm vụ lặp hằng ngày", () => {
  it("cần Luyện Khí; xong thì hôm nay không nhận lại, sang ngày mới nhận được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "cao_thi");
    acceptQuest(w, "a", "lang_hai");
    expect(c.quests.active).toHaveLength(0); // Phàm Nhân
    p.realm = 1;
    acceptQuest(w, "a", "lang_hai");
    for (let i = 0; i < 10; i++) onMonsterKilled(w, "a", "lang");
    turnInQuest(w, "a", "lang_hai");
    expect(Object.keys(c.quests.daily)).toEqual(["lang_hai"]);
    expect(c.quests.done).toHaveLength(0);
    acceptQuest(w, "a", "lang_hai");
    expect(c.quests.active).toHaveLength(0);
    w.now += 24 * 3600_000;
    acceptQuest(w, "a", "lang_hai");
    expect(c.quests.active).toHaveLength(1);
  });
});

describe("bước đạt cảnh giới", () => {
  it("lên bậc thì bước reachRealm tự đạt", () => {
    const def: QuestDef = {
      id: "test_canh_gioi",
      title: "Thử",
      giver: "truong_tran",
      desc: "",
      steps: [{ kind: "reachRealm", realm: 1, tier: 1 }],
      rewards: {},
      talk: { offer: ["."], progress: ["."], complete: ["."] },
    };
    QUESTS.push(def);
    QUEST_BY_ID[def.id] = def;
    try {
      const { w } = makeWorld();
      const { p, c } = addPlayer(w, "a", 1, 0);
      standAt(p, "truong_tran");
      acceptQuest(w, "a", def.id);
      expect(c.quests.active[0].step).toBe(0);
      gainExp(w, "a", p, p.expMax);
      expect(p.tier).toBe(1);
      expect(c.quests.active[0].step).toBe(1);
    } finally {
      QUESTS.pop();
      delete QUEST_BY_ID[def.id];
    }
  });
});

describe("đổi đồ ở Lão dược sư", () => {
  it("thiếu nguyên liệu thì nút bị khóa và bị từ chối; đủ thì đổi được", () => {
    const { w, dialogs, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    standAt(p, "duoc_su");
    talk(w, "a", "duoc_su");
    const opt = dialogs.at(-1)!.msg.options.find((o) => o.action.kind === "trade");
    expect(opt?.disabled).toBe(true);
    trade(w, "a", "doi_hoi_huyet");
    expect(toasts.at(-1)!.msg.text).toBe("Không đủ nguyên liệu.");
    giveItem(w, "a", "long_tho", 6);
    trade(w, "a", "doi_hoi_huyet");
    expect(countItem(c.inv, "long_tho")).toBe(1);
    expect(countItem(c.inv, "hoi_huyet_dan")).toBe(1);
  });

  it("đứng xa thì không đổi được", () => {
    const { w } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    giveItem(w, "a", "long_tho", 5);
    standAt(p, "truong_tran");
    trade(w, "a", "doi_hoi_huyet");
    expect(countItem(c.inv, "long_tho")).toBe(5);
  });
});

describe("đọc sổ nhiệm vụ từ file lưu", () => {
  it("bỏ nhiệm vụ lạ / trùng, ép bước và tiến độ về khoảng hợp lệ", () => {
    const q = sanitizeQuests({
      active: [
        { id: "tru_tho", step: 99, count: -3 },
        { id: "tru_tho", step: 0, count: 0 },
        { id: "khong_co", step: 0, count: 0 },
        null,
      ],
      done: ["nhap_the", "nhap_the", "khong_co"],
      daily: { lang_hai: "2026-11-08", nhap_the: "2026-11-08", nop_nanh: 5 },
    });
    expect(q.active).toEqual([{ id: "tru_tho", step: 2, count: 0 }]);
    expect(q.done).toEqual(["nhap_the"]);
    expect(q.daily).toEqual({ lang_hai: "2026-11-08" });
    expect(sanitizeQuests(undefined)).toEqual({ active: [], done: [], daily: {} });
  });
});

describe("chuỗi nhiệm vụ chính (#19)", () => {
  it("người chơi mới làm được hết chuỗi từ Trưởng trấn tới Luyện Khí tầng 9", () => {
    const { w, toasts } = makeWorld();
    const { p, c } = addPlayer(w, "a");
    const order: string[] = [];
    for (let id: string | undefined = MAIN_QUEST_START; id; id = QUEST_BY_ID[id].next) {
      const def = QUEST_BY_ID[id];
      standAt(p, def.giver);
      acceptQuest(w, "a", id);
      expect(
        c.quests.active.map((a) => a.id),
        `nhận ${id}`,
      ).toContain(id);
      for (const s of def.steps) {
        switch (s.kind) {
          case "kill":
            for (let i = 0; i < s.count; i++) onMonsterKilled(w, "a", s.monster);
            break;
          case "collect":
            giveItem(w, "a", s.itemId, s.count);
            break;
          case "talk":
            standAt(p, s.npcId);
            talk(w, "a", s.npcId);
            break;
          case "reachRealm":
            // Giả lập tu luyện tới mốc (đột phá / đả tọa nằm ở hệ thống khác)
            if (stepOf(p.realm, p.tier) < stepOf(s.realm, s.tier)) {
              p.realm = s.realm;
              p.tier = s.tier;
              p.exp = 0;
              applyStats(p, true);
              refreshQuests(w, "a");
            }
            break;
        }
      }
      standAt(p, def.giver);
      turnInQuest(w, "a", id);
      expect(c.quests.done, `${id}: ${toasts.at(-1)?.msg.text}`).toContain(id);
      order.push(id);
    }
    expect(order.length).toBeGreaterThanOrEqual(6);
    expect(c.quests.active).toHaveLength(0);
    expect(stepOf(p.realm, p.tier)).toBeGreaterThanOrEqual(stepOf(1, 8));
    // Nguyên liệu nộp nhiệm vụ đã bị trừ hết, chỉ còn đồ thưởng
    for (const s of c.inv) {
      if (s) expect(ITEM_BY_ID[s.itemId].type, s.itemId).toBe("consumable");
    }
  });
});
