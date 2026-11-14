// Sổ chiêu (M7.2a): học từ kinh quyển, gắn ô L U I O, gửi cho chủ, mất theo kiếp trừ chiêu đã khắc vào chân linh.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ITEM_BY_ID, SKILL_BY_ID, emptySkillBook, type ItemDef } from "@tien-gioi/shared";
import { hurtPlayer } from "./combat";
import { useItem } from "./inventory";
import { applyRebirth } from "./reincarnation";
import { cooldownsLeft, learnFromBook, rebirthSkills, sendSkills, skillSlot } from "./skills";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

/** Kinh quyển thử: M7.4 mới có sách thật trong `ITEMS`; ở đây thêm tạm vào bảng tra và gỡ sau khi xong. */
const books: ItemDef[] = [
  ["hoa_van_kiem", "thu_hoa"],
  ["bon_thach_quyen", "thu_tho"],
  ["thanh_tung_phi_cham", "thu_moc"],
  ["me_tung_bo", "thu_phong"],
  ["constructor", "thu_hong"],
].map(([teaches, id]) => ({
  id: `kinh_${id}`,
  name: `Kinh quyển ${id}`,
  type: "book",
  stack: 20,
  rarity: 1,
  desc: "thử",
  teaches,
  color: 0,
}));

beforeAll(() => {
  for (const b of books) ITEM_BY_ID[b.id] = b;
});
afterAll(() => {
  for (const b of books) delete ITEM_BY_ID[b.id];
});

const HOA = "kinh_thu_hoa";
const THO = "kinh_thu_tho";
const MOC = "kinh_thu_moc";
const HONG = "kinh_thu_hong";

/** Người chơi ở Luyện Khí tầng 1 (ô chiêu 2 mở, ô 3 chưa) với `qty` quyển ở ô túi `i`. */
function setup(realm = 1, give: Array<[string, number]> = [[HOA, 3]]) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", realm, 0);
  give.forEach(([id, qty], i) => (a.c.inv[i] = { itemId: id, qty }));
  return { ...t, ...a };
}

describe("học chiêu từ kinh quyển (useItem)", () => {
  it("học lần đầu: có chiêu ở tầng 1, trừ ĐÚNG một quyển, tự gắn vào ô 2 (L), gửi sổ + túi + thông báo", () => {
    const t = setup();
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned).toEqual({ hoa_van_kiem: 1 });
    expect(t.c.skills.slots).toEqual(["hoa_van_kiem", "", "", ""]);
    expect(t.c.inv[0]).toEqual({ itemId: HOA, qty: 2 });
    expect(t.skillMsgs.at(-1)!.sid).toBe("a");
    expect(t.skillMsgs.at(-1)!.msg.learned).toEqual({ hoa_van_kiem: 1 });
    expect(t.invs.length).toBeGreaterThan(0);
    expect(t.toasts.at(-1)!.msg.tone).toBe("good");
    expect(t.toasts.at(-1)!.msg.text).toContain("Hỏa Vân Kiếm");
  });

  it("quyển trùng: +1 tầng (không gắn lại), tối đa tầng 3, sau đó quyển còn nguyên và báo đã tối đa", () => {
    const t = setup(1, [[HOA, 4]]);
    for (const want of [1, 2, 3]) {
      useItem(t.w, "a", 0);
      expect(t.c.skills.learned.hoa_van_kiem).toBe(want);
    }
    expect(t.c.inv[0]).toEqual({ itemId: HOA, qty: 1 });
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned.hoa_van_kiem).toBe(3);
    expect(t.c.inv[0]).toEqual({ itemId: HOA, qty: 1 }); // không bị nuốt
    expect(t.toasts.at(-1)!.msg.text).toMatch(/tầng cao nhất/);
  });

  it("chưa đủ cảnh giới: không học, quyển còn nguyên, báo cảnh giới cần", () => {
    const t = setup(0, [[HOA, 1]]); // Phàm Nhân
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned).toEqual({});
    expect(t.c.inv[0]).toEqual({ itemId: HOA, qty: 1 });
    expect(t.toasts.at(-1)!.msg.tone).toBe("bad");
    expect(t.toasts.at(-1)!.msg.text).toMatch(/Cần đạt/);
    expect(t.skillMsgs.length).toBe(0);
  });

  it("quyển dạy chiêu không tồn tại / id độc: không học, quyển còn nguyên", () => {
    const t = setup(1, [[HONG, 1]]);
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned).toEqual({});
    expect(t.c.inv[0]).toEqual({ itemId: HONG, qty: 1 });
    expect(t.toasts.at(-1)!.msg.tone).toBe("bad");
  });

  it("người đã gục không đọc được quyển", () => {
    const t = setup();
    t.p.dead = true;
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned).toEqual({});
    expect(t.c.inv[0]).toEqual({ itemId: HOA, qty: 3 });
  });

  it("chỉ gắn tự động vào ô ĐÃ MỞ còn trống: Luyện Khí chỉ mở ô 2 nên chiêu thứ hai học được nhưng chưa gắn; Trúc Cơ thì gắn vào ô 3", () => {
    const t1 = setup(1, [
      [HOA, 1],
      [THO, 1],
    ]);
    useItem(t1.w, "a", 0);
    useItem(t1.w, "a", 1);
    expect(t1.c.skills.learned).toEqual({ hoa_van_kiem: 1, bon_thach_quyen: 1 });
    expect(t1.c.skills.slots).toEqual(["hoa_van_kiem", "", "", ""]);

    const t2 = setup(2, [
      [HOA, 1],
      [THO, 1],
    ]);
    useItem(t2.w, "a", 0);
    useItem(t2.w, "a", 1);
    expect(t2.c.skills.slots).toEqual(["hoa_van_kiem", "bon_thach_quyen", "", ""]);
  });

  it("chiêu cần Trúc Cơ: Luyện Khí không học được (tier cao cũng không bù realm thấp)", () => {
    const t = setup(1, [[MOC, 1]]);
    t.p.tier = 8;
    useItem(t.w, "a", 0);
    expect(t.c.skills.learned).toEqual({});
    expect(t.c.inv[0]).toEqual({ itemId: MOC, qty: 1 });
  });

  it("learnFromBook trả false khi không học và true khi học (người gọi quyết định trừ quyển)", () => {
    const t = setup(1, []);
    expect(learnFromBook(t.w, "a", ITEM_BY_ID[HONG]!)).toBe(false);
    expect(learnFromBook(t.w, "a", ITEM_BY_ID[HOA]!)).toBe(true);
    expect(learnFromBook(t.w, "nobody", ITEM_BY_ID[HOA]!)).toBe(false);
  });
});

describe("gắn chiêu vào ô (tin skillSlot)", () => {
  /** Đã học hai chiêu Luyện Khí; đứng ở Trúc Cơ để mở ô 2 và 3 */
  function learned() {
    const t = setup(2, []);
    t.c.skills = {
      learned: { hoa_van_kiem: 1, bon_thach_quyen: 2 },
      slots: ["", "", "", ""],
    };
    return t;
  }

  it("gắn chiêu đã học vào ô đã mở; gửi lại sổ", () => {
    const t = learned();
    skillSlot(t.w, "a", { slot: 3, skillId: "bon_thach_quyen" });
    expect(t.c.skills.slots).toEqual(["", "bon_thach_quyen", "", ""]);
    expect(t.skillMsgs.at(-1)!.msg.slots).toEqual(["", "bon_thach_quyen", "", ""]);
  });

  it("chiêu đang ở ô khác thì ĐỔI chỗ (ô cũ trống); gỡ bằng chuỗi rỗng", () => {
    const t = learned();
    skillSlot(t.w, "a", { slot: 2, skillId: "hoa_van_kiem" });
    skillSlot(t.w, "a", { slot: 3, skillId: "hoa_van_kiem" });
    expect(t.c.skills.slots).toEqual(["", "hoa_van_kiem", "", ""]);
    skillSlot(t.w, "a", { slot: 3, skillId: "" });
    expect(t.c.skills.slots).toEqual(["", "", "", ""]);
  });

  it("ô chưa mở, chiêu chưa học, chiêu lạ: từ chối, không đổi sổ, có thông báo và gửi lại sổ để client đồng bộ", () => {
    const t = learned();
    for (const m of [
      { slot: 4, skillId: "hoa_van_kiem" }, // ô 4 mở từ Kim Đan
      { slot: 2, skillId: "me_tung_bo" }, // chưa học
      { slot: 2, skillId: "constructor" },
      { slot: 2, skillId: "__proto__" },
    ]) {
      const before = JSON.stringify(t.c.skills);
      const nMsg = t.skillMsgs.length;
      const nToast = t.toasts.length;
      skillSlot(t.w, "a", m);
      expect(JSON.stringify(t.c.skills), JSON.stringify(m)).toBe(before);
      expect(t.toasts.length).toBe(nToast + 1);
      expect(t.skillMsgs.length).toBe(nMsg + 1);
    }
  });

  it("tin sai kiểu bị bỏ lặng lẽ (không ném lỗi, không đổi sổ, không phát tin)", () => {
    const t = learned();
    for (const bad of [
      null,
      undefined,
      5,
      "x",
      [],
      {},
      { slot: 1, skillId: "hoa_van_kiem" },
      { slot: 6, skillId: "hoa_van_kiem" },
      { slot: "2", skillId: "hoa_van_kiem" },
      { slot: 2, skillId: 5 },
      { slot: 2, skillId: "x".repeat(500) },
      { slot: Number.NaN, skillId: "" },
    ]) {
      skillSlot(t.w, "a", bad);
    }
    expect(t.c.skills.slots).toEqual(["", "", "", ""]);
    expect(t.skillMsgs.length).toBe(0);
    expect(t.toasts.length).toBe(0);
  });

  it("người đã gục hoặc không có trong phòng: bỏ qua", () => {
    const t = learned();
    t.p.dead = true;
    skillSlot(t.w, "a", { slot: 2, skillId: "hoa_van_kiem" });
    skillSlot(t.w, "ghost", { slot: 2, skillId: "hoa_van_kiem" });
    expect(t.c.skills.slots).toEqual(["", "", "", ""]);
  });
});

describe("gửi sổ chiêu", () => {
  it("hồi chiêu còn lại tính theo w.now, làm tròn lên, không âm", () => {
    const t = setup();
    t.w.now = 10_000;
    t.c.skillCd = [10_000, 10_000.2, 12_500, 5_000];
    expect(cooldownsLeft(t.c, t.w.now)).toEqual([0, 1, 2500, 0]);
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.cd).toEqual([0, 1, 2500, 0]);
  });

  it("bản sao: sửa tin đã gửi không làm hỏng sổ thật", () => {
    const t = setup();
    t.c.skills = { learned: { hoa_van_kiem: 1 }, slots: ["hoa_van_kiem", "", "", ""] };
    sendSkills(t.w, "a");
    const msg = t.skillMsgs.at(-1)!.msg;
    msg.learned.ung_trao = 3;
    msg.slots[0] = "";
    expect(t.c.skills.learned).toEqual({ hoa_van_kiem: 1 });
    expect(t.c.skills.slots[0]).toBe("hoa_van_kiem");
  });

  it("người không có trong phòng: không phát tin", () => {
    const t = setup();
    sendSkills(t.w, "ghost");
    expect(t.skillMsgs.length).toBe(0);
  });
});

describe("mất theo kiếp, trừ chiêu đã khắc vào chân linh", () => {
  it("rebirthSkills: chiêu đã khắc về tầng 1, ô trống, id lạ bị bỏ", () => {
    const b = rebirthSkills(["hoa_van_kiem", "me_tung_bo", "constructor", "__proto__"]);
    expect(b.learned).toEqual({ hoa_van_kiem: 1, me_tung_bo: 1 });
    expect(b.slots).toEqual(["", "", "", ""]);
    expect(rebirthSkills([])).toEqual(emptySkillBook());
  });

  it("chết thật: chiêu và hồi chiêu về trống; đầu thai: chỉ chiêu đã khắc trở lại (tầng 1), gửi sổ mới", () => {
    const t = makeWorld();
    t.w.reincarnate = true;
    const a = addPlayer(t.w, "a", 1, 8);
    a.c.life = { playMs: 48 * 60_000, kills: 30, bossKills: 0 };
    a.c.skills = {
      learned: { hoa_van_kiem: 3, bon_thach_quyen: 1 },
      slots: ["hoa_van_kiem", "", "", ""],
    };
    a.c.skillCd = [5000, 0, 0, 0];
    a.c.soul = { ...a.c.soul, engraved: ["hoa_van_kiem"] };
    const { m } = addMonster(t.w, "lang", a.p.x + 20, a.p.y);
    hurtPlayer(t.w, "a", a.p, 1e9, m);
    expect(a.c.limbo).toBeDefined();
    expect(a.c.skills).toEqual(emptySkillBook());
    expect(a.c.skillCd).toEqual([0, 0, 0, 0]);
    const nMsg = t.skillMsgs.length;
    applyRebirth(t.w, "a", a.p, a.c, { origin: "pham_gia", keep: [] });
    expect(a.c.skills.learned).toEqual({ hoa_van_kiem: 1 });
    expect(a.c.skills.slots).toEqual(["", "", "", ""]);
    expect(t.skillMsgs.length).toBe(nMsg + 1);
    expect(t.skillMsgs.at(-1)!.msg.learned).toEqual({ hoa_van_kiem: 1 });
  });

  it("kiếp mới không chân linh khắc thì trống", () => {
    const t = makeWorld();
    t.w.reincarnate = true;
    const a = addPlayer(t.w, "a", 1, 8);
    a.c.life = { playMs: 48 * 60_000, kills: 30, bossKills: 0 };
    a.c.skills = { learned: { ung_trao: 2 }, slots: ["ung_trao", "", "", ""] };
    const { m } = addMonster(t.w, "lang", a.p.x + 20, a.p.y);
    hurtPlayer(t.w, "a", a.p, 1e9, m);
    applyRebirth(t.w, "a", a.p, a.c, { origin: "pham_gia", keep: [] });
    expect(a.c.skills).toEqual(emptySkillBook());
  });
});

describe("dữ liệu chiêu dùng được ở server", () => {
  it("mọi chiêu học được qua kinh quyển đều tra được (SKILL_BY_ID) và đủ cảnh giới để vào ô mở sớm nhất khi đạt reqRealm", () => {
    for (const s of Object.values(SKILL_BY_ID)) expect(s.reqRealm).toBeGreaterThanOrEqual(1);
  });
});
