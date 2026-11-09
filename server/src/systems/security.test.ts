// Gửi dữ liệu rác vào mọi system nhận tin nhắn client: không được ném lỗi, không sinh đồ, không cộng tu vi.
import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, NPC_BY_ID, NPCS, QUEST_BY_ID } from "@tien-gioi/shared";
import { addPlayer, makeWorld } from "./test-helpers";
import { byId } from "./lookup";
import { queueInput } from "./movement";
import { slash, swordQi } from "./combat";
import { breakthrough, setMeditating } from "./progression";
import { chat } from "./chat";
import { dropItem, pickup } from "./loot";
import { giveItem, sanitizeInventory, useItem } from "./inventory";
import { sanitizeQuests } from "./quests";
import { abandonQuest, acceptQuest, talk, trade, turnInQuest } from "./npc";

/** Những giá trị client có thể gửi thay cho dữ liệu đúng */
const JUNK: unknown[] = [
  undefined,
  null,
  true,
  0,
  -1,
  1.5,
  1e9,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  "",
  "x".repeat(5000),
  "constructor",
  "__proto__",
  "toString",
  "hasOwnProperty",
  {},
  [],
  [0],
  { length: 3 },
];

describe("byId", () => {
  it("chỉ trả về mục có thật trong bảng", () => {
    expect(byId(ITEM_BY_ID, "nanh_soi")).toBe(ITEM_BY_ID.nanh_soi);
    for (const k of ["constructor", "__proto__", "toString", "valueOf", "nope"])
      expect(byId(ITEM_BY_ID, k)).toBeUndefined();
    for (const k of [1, null, undefined, {}, ["nanh_soi"]])
      expect(byId(ITEM_BY_ID, k)).toBeUndefined();
  });
});

describe("dữ liệu rác vào mọi system", () => {
  /** Người chơi đứng giữa các NPC (trong tầm của Trưởng trấn), có sẵn ít đồ */
  function setup() {
    const t = makeWorld();
    const sid = "s1";
    const { p, c } = addPlayer(t.w, sid);
    p.x = NPC_BY_ID.truong_tran.x;
    p.y = NPC_BY_ID.truong_tran.y;
    giveItem(t.w, sid, "long_tho", 3);
    t.invs.length = 0;
    return { ...t, sid, p, c };
  }

  it("không ném lỗi, không đổi túi đồ, không cộng tu vi, không mở hộp thoại", () => {
    const t = setup();
    const inv0 = JSON.stringify(t.c.inv);
    const exp0 = t.p.exp;
    const w = t.w;
    const calls: ((v: unknown) => void)[] = [
      (v) => queueInput(w, t.sid, v as never),
      (v) => queueInput(w, t.sid, { seq: v, dx: v, dy: v } as never),
      (v) => slash(w, t.sid, v),
      (v) => swordQi(w, t.sid, v),
      (v) => setMeditating(w, t.sid, v === true),
      () => breakthrough(w, t.sid),
      (v) => chat(w, t.sid, v),
      (v) => useItem(w, t.sid, v),
      (v) => pickup(w, t.sid, v),
      (v) => dropItem(w, t.sid, v, v),
      (v) => talk(w, t.sid, v),
      (v) => acceptQuest(w, t.sid, v),
      (v) => turnInQuest(w, t.sid, v),
      (v) => abandonQuest(w, t.sid, v),
      (v) => trade(w, t.sid, v),
    ];
    for (const call of calls) for (const v of JUNK) expect(() => call(v)).not.toThrow();
    expect(JSON.stringify(t.c.inv)).toBe(inv0);
    expect(t.p.exp).toBe(exp0);
    expect(t.dialogs).toHaveLength(0);
    expect(t.c.quests.active).toHaveLength(0);
  });

  it("id trùng tên thuộc tính của object không vượt được kiểm tra khoảng cách", () => {
    const t = setup();
    // Đứng xa mọi NPC: nếu NPC_BY_ID["constructor"] lọt qua thì khoảng cách là NaN và không bị chặn
    t.p.x = 64;
    t.p.y = 64;
    for (const k of ["constructor", "__proto__", "toString"]) talk(t.w, t.sid, k);
    expect(t.dialogs).toHaveLength(0);
    expect(NPCS.every((n) => Math.hypot(n.x - 64, n.y - 64) > 80)).toBe(true);
  });
});

describe("file lưu bị sửa tay", () => {
  it("túi đồ: bỏ id lạ / trùng tên thuộc tính object", () => {
    const inv = sanitizeInventory([
      { itemId: "constructor", qty: 5 },
      { itemId: "__proto__", qty: 5 },
      { itemId: "nanh_soi", qty: 2 },
      "rac",
      { itemId: "long_tho", qty: "nhieu" },
    ]);
    expect(inv.filter(Boolean)).toEqual([{ itemId: "nanh_soi", qty: 2 }]);
  });

  it("sổ nhiệm vụ: bỏ id lạ / trùng tên thuộc tính object", () => {
    const q = sanitizeQuests({
      active: [
        { id: "constructor", step: 0, count: 0 },
        { id: "nhap_the", step: 0, count: 0 },
      ],
      done: ["toString", "nhap_the"],
      daily: { constructor: "2026-01-01", hasOwnProperty: "x" },
    });
    expect(q.active.map((a) => a.id)).toEqual(["nhap_the"]);
    expect(q.done).toEqual(["nhap_the"]);
    expect(q.daily).toEqual({});
    expect(QUEST_BY_ID.nhap_the).toBeDefined();
  });
});
