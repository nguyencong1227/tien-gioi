// LUYỆN CHIÊU (mục 51, CT5 lát 1): mỗi lần dùng chiêu TRÚNG quái được 1 điểm luyện (trần 60 / phút / người), đủ điểm thì lên tầng, điểm dở dang gửi cho chủ (<= 1 lần / 30 giây) và
// đi theo hồ sơ. Hồ sơ cũ (không có `mastery`) vẫn chạy y như trước.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MASTERY_NEED,
  MASTERY_PER_MIN_CAP,
  SKILL_BY_ID,
  type SkillDef,
  skillMaxLevelOf,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import { MASTERY_SEND_MS, MASTERY_WINDOW_MS, creditMastery, sendSkills } from "./skills";
import { tickPBolts } from "./pbolt";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const added: string[] = [];
function withSkill(over: Partial<SkillDef> & { id: string }): SkillDef {
  const def: SkillDef = { ...SKILL_BY_ID["bon_thach_quyen"]!, effects: [], ...over } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[def.id] = def;
  added.push(def.id);
  return def;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of added.splice(0)) delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
});

/** Chiêu `tia` đánh thẳng (line) phẩm `grade` (Hoàng 0 = tối đa tầng 3, luyện tầng 1 -> 2; Thiên 3 = tầng 6, luyện tới tầng 5). */
function setup(grade: 0 | 1 | 2 | 3 = 0, level = 1) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  t.w.now = 500_000;
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const def = withSkill({
    id: "tia_luyen",
    shape: "line",
    mult: 0.01,
    range: 400,
    width: 60,
    element: "none",
    grade,
  } as Partial<SkillDef> & { id: string });
  a.c.skills.learned[def.id] = level;
  a.c.skills.slots[0] = def.id;
  return { ...t, ...a, def };
}
type T = ReturnType<typeof setup>;
/** Quái máu rất lớn ngay trước mặt (hướng 0) để đánh bao nhiêu lần cũng không chết. */
const target = (t: T, dx = 100) => {
  const m = addMonster(t.w, "tho", 1000 + dx, 1000);
  m.m.hp = m.m.maxHp = 1e12;
  return m;
};
/** Dùng chiêu ô 2 hướng 0 và nhả hồi chiêu để dùng tiếp được. */
const use = (t: T) => {
  cast(t.w, "a", { slot: 2, angle: 0 });
  t.c.skillCd[0] = 0;
  t.p.mp = t.p.maxMp;
};
const pts = (c: PlayerCtrl, id = "tia_luyen") => c.skills.mastery?.[id] ?? 0;

describe("luyện chiêu: cộng điểm khi TRÚNG", () => {
  it("trúng quái: +1 điểm; không trúng gì (không có quái trong vùng): 0 điểm", () => {
    const t = setup();
    use(t);
    expect(pts(t.c)).toBe(0);
    expect(t.c.skills.mastery).toBeUndefined(); // hồ sơ không có trường khi chưa có điểm
    target(t);
    t.toasts.length = 0;
    t.skillMsgs.length = 0;
    use(t);
    expect(pts(t.c)).toBe(1);
    use(t);
    expect(pts(t.c)).toBe(2);
    expect(t.toasts).toEqual([]); // chưa lên tầng thì không báo gì
    expect(t.skillMsgs.every((m) => m.msg.learned["tia_luyen"] === 1)).toBe(true);
  });

  it("MỘT điểm mỗi lần dùng, dù trúng nhiều quái hoặc nhiều tia (fan)", () => {
    const t = setup();
    for (const dx of [80, 120, 160, 200]) target(t, dx);
    use(t);
    expect(pts(t.c)).toBe(1);
    const f = setup();
    withSkill({
      id: "tia_luyen",
      shape: "fan",
      mult: 0.01,
      range: 400,
      width: 80,
      count: 3,
      arc: 0.1,
      element: "none",
      grade: 0,
    } as Partial<SkillDef> & { id: string });
    target(f, 100);
    use(f);
    expect(pts(f.c)).toBe(1); // 3 tia cùng trúng một quái vẫn một điểm
  });

  it("đạn bay (bolt): điểm cộng khi đạn THẬT SỰ trúng (không phải lúc bắn), một điểm cho cả loạt nhiều viên", () => {
    const t = setup();
    withSkill({
      id: "tia_luyen",
      shape: "bolt",
      mult: 0.01,
      range: 500,
      count: 3,
      arc: 0.05,
      speed: 500,
      pierce: 0,
      bounce: 0,
      element: "none",
      grade: 0,
    } as Partial<SkillDef> & { id: string });
    vi.spyOn(t.w.map, "isBlockedPx").mockReturnValue(false);
    target(t, 200);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(pts(t.c)).toBe(0); // vừa bắn, chưa trúng
    t.w.now += 5000;
    tickPBolts(t.w);
    expect(pts(t.c)).toBe(1); // ba viên cùng trúng một quái: MỘT điểm
  });

  it("đòn lên ĐỐI THỦ thách đấu KHÔNG cộng điểm (chống hai người cùng cày điểm luyện)", () => {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = 1100;
    b.p.y = 1000;
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: "fight",
      fightAt: 0,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    const hp = b.p.hp;
    use(t);
    expect(b.p.hp).toBeLessThan(hp); // trúng thật
    expect(pts(t.c)).toBe(0);
  });

  it("chiêu không còn luyện được (tầng cuối - 1 trở lên) KHÔNG cộng điểm và KHÔNG tốn trần", () => {
    const t = setup(0, 2); // Hoàng: tối đa tầng 3 -> luyện chỉ tầng 1 -> 2; đang tầng 2
    expect(skillMaxLevelOf(t.def)).toBe(3);
    target(t);
    use(t);
    expect(pts(t.c)).toBe(0);
    expect(t.c.masteryWin).toBeUndefined();
  });

  it("chiêu CHƯA học (id lạ trong sổ) không ném lỗi, không cộng", () => {
    const t = setup();
    expect(() => creditMastery(t.w, "a", { ...t.def, id: "chua_hoc" })).not.toThrow();
    expect(t.c.skills.mastery).toBeUndefined();
  });
});

describe("luyện chiêu: trần chống cày", () => {
  it(`tối đa ${MASTERY_PER_MIN_CAP} điểm mỗi cửa sổ 60 giây; sang cửa sổ mới thì cộng tiếp`, () => {
    const t = setup(3, 1); // Thiên: luyện 1 -> 2 cần 60 điểm, trùng đúng trần một phút
    target(t);
    for (let i = 0; i < MASTERY_PER_MIN_CAP + 15; i++) {
      t.w.now += 100; // 75 lần trong 7,5 giây
      use(t);
    }
    // 60 điểm đủ lên tầng 2 (cần 60), phần còn lại bị trần chặn: điểm dở sang tầng 2 phải = 0
    expect(t.c.skills.learned["tia_luyen"]).toBe(2);
    expect(pts(t.c)).toBe(0);
    expect(t.c.masteryWin!.n).toBe(MASTERY_PER_MIN_CAP);
    t.w.now += MASTERY_WINDOW_MS; // sang cửa sổ mới
    use(t);
    expect(pts(t.c)).toBe(1);
    expect(t.c.masteryWin!.n).toBe(1);
  });

  it("trần tính theo TỪNG người: người này đủ trần không chặn người khác", () => {
    const t = setup(3, 1);
    const b = addPlayer(t.w, "b", 4, 0);
    b.c.skills.learned["tia_luyen"] = 1;
    t.c.masteryWin = { start: t.w.now, n: MASTERY_PER_MIN_CAP };
    creditMastery(t.w, "a", t.def);
    expect(pts(t.c)).toBe(0);
    creditMastery(t.w, "b", t.def);
    expect(pts(b.c)).toBe(1);
  });
});

describe("luyện chiêu: lên tầng", () => {
  it("đủ điểm thì lên tầng kế, phần dư sang tầng sau, báo + gửi lại sổ ngay kèm mastery", () => {
    const t = setup(3, 1);
    t.c.skills.mastery = { tia_luyen: MASTERY_NEED[0]! - 1 };
    target(t);
    t.skillMsgs.length = 0;
    t.toasts.length = 0;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.c.skills.learned["tia_luyen"]).toBe(2);
    expect(pts(t.c)).toBe(0); // đúng 60 -> dư 0, xoá trường
    expect(t.toasts.some((x) => /luyện lên tầng 2/.test(x.msg.text) && x.msg.tone === "good")).toBe(
      true,
    );
    const last = t.skillMsgs.at(-1)!.msg;
    expect(last.learned["tia_luyen"]).toBe(2);
  });

  it("tin gửi lúc lên tầng ÉP kèm mastery (điểm của các chiêu khác đang dở), dù vừa gửi cách đây chưa tới 30 giây", () => {
    const t = setup(3, 1);
    t.c.skills.learned["chiêu_khác"] = 1;
    t.c.skills.mastery = { tia_luyen: MASTERY_NEED[0]! - 1, chiêu_khác: 9 };
    sendSkills(t.w, "a"); // vừa gửi: mốc 30 giây đang chạy
    target(t);
    t.skillMsgs.length = 0;
    cast(t.w, "a", { slot: 2, angle: 0 });
    const withMastery = t.skillMsgs.filter((m) => m.msg.mastery !== undefined);
    expect(withMastery).toHaveLength(1);
    expect(withMastery[0]!.msg.mastery).toEqual({ chiêu_khác: 9 });
    expect(withMastery[0]!.msg.learned["tia_luyen"]).toBe(2);
  });

  it("lên tầng thì lần dùng sau mạnh hơn (hệ số tầng) và hồi chiêu ngắn hơn", () => {
    const t = setup(3, 1);
    withSkill({
      id: "tia_luyen",
      shape: "line",
      mult: 1,
      range: 400,
      width: 60,
      element: "none",
      grade: 3,
    } as Partial<SkillDef> & { id: string });
    target(t);
    const dmg = () => {
      t.dmgs.length = 0;
      use(t);
      return t.dmgs[0]?.amount ?? 0;
    };
    const before = dmg();
    t.c.skills.mastery = { tia_luyen: MASTERY_NEED[0]! - 1 };
    use(t); // lên tầng 2
    expect(t.c.skills.learned["tia_luyen"]).toBe(2);
    expect(dmg()).toBeGreaterThan(before);
  });

  it("điểm luyện đi theo `c.skills` (nơi WorldRoom lưu hồ sơ): sổ mới trả về giữ mastery và tầng", () => {
    const t = setup(3, 1);
    target(t);
    for (let i = 0; i < 5; i++) use(t);
    expect(pts(t.c)).toBe(5);
    expect(JSON.parse(JSON.stringify(t.c.skills)).mastery).toEqual({ tia_luyen: 5 });
  });
});

describe("luyện chiêu: tin `skills` mang điểm (<= 1 lần / 30 giây)", () => {
  it("lần đầu có điểm thì kèm mastery; trong 30 giây không kèm lại; sau 30 giây kèm lại; sổ chưa có điểm thì không có trường", () => {
    const t = setup(3, 1);
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.mastery).toBeUndefined(); // chưa luyện gì: y như trước CT5
    t.c.skills.mastery = { tia_luyen: 7 };
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.mastery).toEqual({ tia_luyen: 7 });
    t.w.now += MASTERY_SEND_MS - 1;
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.mastery).toBeUndefined();
    t.w.now += 1;
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.mastery).toEqual({ tia_luyen: 7 });
    sendSkills(t.w, "a", true); // ép (vào phòng / lên tầng)
    expect(t.skillMsgs.at(-1)!.msg.mastery).toEqual({ tia_luyen: 7 });
  });

  it('ÉP gửi (lên tầng) mà sổ HẾT điểm dở: vẫn kèm `mastery: {}` để client phân biệt với "giãn nhịp 30 giây"', () => {
    const t = setup(3, 1);
    t.c.skills.mastery = { tia_luyen: MASTERY_NEED[0]! - 1 };
    target(t);
    t.skillMsgs.length = 0;
    cast(t.w, "a", { slot: 2, angle: 0 }); // lên tầng 2, dư 0, sổ không còn điểm nào
    expect(t.c.skills.mastery).toBeUndefined();
    const forced = t.skillMsgs.filter((m) => m.msg.mastery !== undefined);
    expect(forced).toHaveLength(1);
    expect(forced[0]!.msg.mastery).toEqual({});
    // không ép + không có điểm: vẫn không có trường
    t.w.now += MASTERY_SEND_MS * 2;
    sendSkills(t.w, "a");
    expect(t.skillMsgs.at(-1)!.msg.mastery).toBeUndefined();
  });

  it("bản gửi là BẢN SAO: client / test sửa không làm đổi sổ của máy chủ", () => {
    const t = setup(3, 1);
    t.c.skills.mastery = { tia_luyen: 7 };
    sendSkills(t.w, "a");
    t.skillMsgs.at(-1)!.msg.mastery!["tia_luyen"] = 999;
    expect(t.c.skills.mastery["tia_luyen"]).toBe(7);
  });
});
