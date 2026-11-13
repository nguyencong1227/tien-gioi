// Chuỗi nhiệm vụ chính đi qua BA bản đồ (M6, #405): mỗi bản đồ một phòng (một World), nhân vật mang theo nhiệm vụ / túi / ví khi qua cổng.
// Kiểm: người chơi không đội làm được hết chuỗi chính tới Kim Đan, mỗi nhiệm vụ nhận / trả đúng NPC ở đúng phòng.
import { describe, expect, it } from "vitest";
import {
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  MAIN_QUEST_START,
  NPC_BY_ID,
  QUESTS,
  QUEST_BY_ID,
  expToNext,
  getMap,
  stepOf,
  type QuestDef,
} from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { giveItem } from "./inventory";
import { acceptQuest, talk, turnInQuest } from "./npc";
import { onMonsterKilled, refreshQuests } from "./quests";
import { applyStats } from "./progression";

type Room = ReturnType<typeof makeWorld> & {
  p: ReturnType<typeof addPlayer>["p"];
  c: ReturnType<typeof addPlayer>["c"];
};

/** Ba phòng, MỘT nhân vật "a" dùng chung nhiệm vụ / túi / ví (như khi qua cổng: lưu rồi nạp ở phòng đích). */
function threeRooms() {
  const mk = (id: string): Room => {
    const t = makeWorld(getMap(id)!);
    const { p, c } = addPlayer(t.w, "a", 1, 8);
    return { ...t, p, c };
  };
  const rooms: Record<string, Room> = {
    [DEFAULT_MAP_ID]: mk(DEFAULT_MAP_ID),
    [HAC_PHONG_ID]: mk(HAC_PHONG_ID),
    [AM_SUONG_ID]: mk(AM_SUONG_ID),
  };
  const all = Object.values(rooms);
  const base = all[0];
  for (const r of all.slice(1)) {
    r.c.quests = base.c.quests; // cùng một sổ nhiệm vụ / túi
    r.c.inv = base.c.inv;
  }
  const sync = (from: Room) => {
    for (const r of all) {
      r.c.coin = from.c.coin;
      if (r === from) continue;
      r.p.realm = from.p.realm;
      r.p.tier = from.p.tier;
      r.p.exp = from.p.exp;
      applyStats(r.p, true);
    }
  };
  const at = (npcId: string) => {
    const npc = NPC_BY_ID[npcId];
    const room = rooms[npc.mapId ?? DEFAULT_MAP_ID];
    room.p.x = npc.x + 10;
    room.p.y = npc.y;
    sync(room);
    return room;
  };
  return { rooms, all, at, sync };
}

describe("chuỗi nhiệm vụ chính qua ba bản đồ", () => {
  it("người chơi KHÔNG đội làm được trọn chuỗi chính: từ Trưởng trấn (Lạc Hà) tới Trạm trưởng (Vọng Sương) và nhiệm vụ cuối", () => {
    const { all, at, sync } = threeRooms();
    const done: string[] = [];
    for (let id: string | undefined = MAIN_QUEST_START; id; id = QUEST_BY_ID[id].next) {
      const def: QuestDef = QUEST_BY_ID[id];
      // Cảnh giới tối thiểu để nhận: người chơi đã tu tới đó (săn quái / đả tọa nằm ở hệ thống khác)
      if (
        def.minRealm &&
        stepOf(all[0].p.realm, all[0].p.tier) < stepOf(def.minRealm.realm, def.minRealm.tier)
      )
        for (const r of all) {
          r.p.realm = def.minRealm.realm;
          r.p.tier = def.minRealm.tier;
          r.p.exp = 0;
          applyStats(r.p, true);
        }
      const giver = at(def.giver);
      acceptQuest(giver.w, "a", id);
      expect(
        giver.c.quests.active.map((a) => a.id),
        `nhận ${id} ở phòng của ${def.giver}`,
      ).toContain(id);
      for (const s of def.steps) {
        if (s.kind === "kill")
          for (let i = 0; i < s.count; i++) onMonsterKilled(giver.w, "a", s.monster);
        else if (s.kind === "collect") giveItem(giver.w, "a", s.itemId, s.count);
        else if (s.kind === "talk") {
          const room = at(s.npcId);
          talk(room.w, "a", s.npcId);
        } else if (stepOf(giver.p.realm, giver.p.tier) < stepOf(s.realm, s.tier)) {
          // Giả lập tu luyện tới mốc (đột phá / đả tọa nằm ở hệ thống khác)
          for (const r of all) {
            r.p.realm = s.realm;
            r.p.tier = s.tier;
            r.p.exp = 0;
            applyStats(r.p, true);
          }
          sync(giver);
        }
        refreshQuests(giver.w, "a");
      }
      const back = at(def.giver);
      turnInQuest(back.w, "a", id);
      expect(back.c.quests.done, `${id}: trả ở phòng của ${def.giver}`).toContain(id);
      done.push(id);
    }
    expect(done).toHaveLength(16);
    expect(done.slice(-6)).toEqual([
      "vong_suong",
      "suong_ho_hoan",
      "thach_quy_giap",
      "doc_thiem_nang",
      "kim_dan_hau_ky",
      "giao_hoan",
    ]);
    // người chơi cuối chuỗi đã là Kim Đan hậu kỳ (các bước reachRealm đẩy bậc lên đúng thang)
    expect(stepOf(all[0].p.realm, all[0].p.tier)).toBeGreaterThanOrEqual(stepOf(3, 2));
    expect(expToNext(3, 2)).toBe(63480);
  });

  it("nhiệm vụ nào cũng được giao bởi NPC đứng đúng bản đồ có thật; NPC ở phòng khác không nhận được nhầm", () => {
    const { rooms } = threeRooms();
    for (const q of QUESTS) {
      const npc = NPC_BY_ID[q.giver];
      expect(npc, q.id).toBeDefined();
      const here = rooms[npc.mapId ?? DEFAULT_MAP_ID];
      expect(here.w.map.def.id).toBe(npc.mapId ?? DEFAULT_MAP_ID);
    }
    // đứng ở Vọng Sương (đúng toạ độ trạm trưởng) nhưng ở phòng Lạc Hà: không có NPC đó trong phòng, không nhận được
    const lacHa = rooms[DEFAULT_MAP_ID];
    lacHa.p.x = NPC_BY_ID.tram_truong.x;
    lacHa.p.y = NPC_BY_ID.tram_truong.y;
    lacHa.p.realm = 3;
    lacHa.p.tier = 0;
    acceptQuest(lacHa.w, "a", "suong_ho_quay");
    expect(lacHa.c.quests.active.map((a) => a.id)).not.toContain("suong_ho_quay");
  });

  it("việc phụ Mãng hoạn và ba nhiệm vụ lặp ở Vọng Sương nhận / trả được đúng phòng và đúng bậc", () => {
    const { at, sync, all } = threeRooms();
    // Trúc Cơ sơ kỳ: nhận việc phụ ở Lạc Hà
    for (const r of all) {
      r.p.realm = 2;
      r.p.tier = 0;
      applyStats(r.p, true);
    }
    const lh = at("truong_tran");
    acceptQuest(lh.w, "a", "mang_hoan");
    expect(lh.c.quests.active.map((a) => a.id)).toContain("mang_hoan");
    // Kim Đan sơ kỳ: nhiệm vụ lặp ở trạm; Độc nang (minRealm Trung kỳ) chưa nhận được
    for (const r of all) {
      r.p.realm = 3;
      r.p.tier = 0;
      applyStats(r.p, true);
    }
    const vs = at("tram_truong");
    sync(vs);
    acceptQuest(vs.w, "a", "suong_ho_quay");
    acceptQuest(vs.w, "a", "doc_nang_nop");
    const ids = vs.c.quests.active.map((a) => a.id);
    expect(ids).toContain("suong_ho_quay");
    expect(ids).not.toContain("doc_nang_nop");
    for (let i = 0; i < 20; i++) onMonsterKilled(vs.w, "a", "suong_ho");
    turnInQuest(vs.w, "a", "suong_ho_quay");
    expect(Object.keys(vs.c.quests.daily)).toContain("suong_ho_quay"); // nhiệm vụ lặp: ghi ngày đã làm
  });
});
