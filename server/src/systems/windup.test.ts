// CHIÊU VẬN (`windupMs`, mục 51, CT5 lát 2): tiêu hao + hồi chiêu lúc BẮT ĐẦU, `fx cast` lúc bắt đầu, sát thương + hiệu ứng hình lúc ĐÁP, người vận chậm 50%, không dùng chiêu khác khi vận,
// huỷ khi choáng / chết / hồn lìa xác / Hoàng Tuyền / thách đấu bắt đầu (không hoàn tiêu hao), đáp từ vị trí HIỆN TẠI. World giả; `Math.random` được ghim.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_STATUSES,
  SKILL_BY_ID,
  SKILL_LIMITS,
  TICK_MS,
  WINDUP_MAX_MS,
  WINDUP_SLOW,
  skillCooldownMs,
  skillMpCost,
  type SkillDef,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast } from "./cast";
import { applyPlayerStatus } from "./status";
import { addStatus, newStatusBox } from "./status-rules";
import { tickWorld } from "./tick";
import { tickWindup, windupMsOf } from "./windup";
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

const WIND = 1000;
function setup(over: Partial<SkillDef> = {}) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.x = 1000;
  a.p.y = 1000;
  a.p.mp = a.p.maxMp;
  t.w.now = 700_000;
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const def = withSkill({
    id: "van_thu",
    shape: "nova",
    mult: 1,
    range: 200,
    element: "none",
    windupMs: WIND,
    ...over,
  } as Partial<SkillDef> & { id: string });
  a.c.skills.learned[def.id] = 1;
  a.c.skills.slots[0] = def.id;
  return { ...t, ...a, def };
}
type T = ReturnType<typeof setup>;
const mon = (t: T, dx: number, dy = 0) => {
  const m = addMonster(t.w, "tho", t.p.x + dx, t.p.y + dy);
  m.m.hp = m.m.maxHp = 1e12;
  return m;
};
const dmgTo = (t: T, id: string) => t.dmgs.filter((d) => d.target === id);
const useIt = (t: T) => cast(t.w, "a", { slot: 2, angle: 0 });
/** Trôi `ms` ms theo từng tick thật (tickWorld) để chạy cả đường nối. */
function run(t: T, ms: number) {
  for (let i = 0; i < Math.ceil(ms / TICK_MS); i++) {
    t.w.now += TICK_MS;
    tickWorld(t.w, TICK_MS);
  }
}
const statusIds = (c: PlayerCtrl) => (c.st?.list ?? []).map((s) => s.id);

describe("windupMsOf: kẹp thời gian vận", () => {
  it("không khai / không hợp lệ -> 0 (tức thời); quá nhỏ kẹp lên windupMin; quá lớn kẹp xuống WINDUP_MAX_MS", () => {
    expect(windupMsOf({})).toBe(0);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "1000" as unknown as number])
      expect(windupMsOf({ windupMs: bad }), String(bad)).toBe(0);
    expect(windupMsOf({ windupMs: 10 })).toBe(SKILL_LIMITS.windupMin);
    expect(windupMsOf({ windupMs: 99_999 })).toBe(WINDUP_MAX_MS);
    expect(windupMsOf({ windupMs: 1200 })).toBe(1200);
  });
});

describe("chiêu vận: bắt đầu", () => {
  it("tiêu hao + hồi chiêu tính NGAY, `fx cast` gửi ngay, KHÔNG sát thương và KHÔNG hiệu ứng hình lúc bắt đầu", () => {
    const t = setup();
    const m = mon(t, 80);
    const mp = t.p.mp;
    useIt(t);
    expect(t.p.mp).toBe(mp - skillMpCost(t.def, t.p.maxMp));
    expect(t.c.skillCd[0]).toBe(t.w.now + skillCooldownMs(t.def, 1, 0));
    expect(t.fx.map((f) => f.kind)).toEqual(["cast"]);
    expect(dmgTo(t, m.id)).toEqual([]);
    expect(t.c.windup).toMatchObject({ until: t.w.now + WIND, skill: "van_thu" });
  });

  it("người vận chậm đúng WINDUP_SLOW (trạng thái `windup`, bản nhớ tốc độ), trạng thái gửi cho chủ", () => {
    const t = setup();
    useIt(t);
    expect(statusIds(t.c)).toContain("windup");
    expect(t.c.moveMul).toBeCloseTo(1 - WINDUP_SLOW, 9);
    expect(t.statusMsgs.at(-1)!.msg.list.some((s) => s[0] === "windup")).toBe(true);
  });

  it("`windup` KHÔNG tính vào MAX_STATUSES: đủ trần buff khác vẫn nhận, và không đẩy buff nào ra", () => {
    const t = setup();
    for (const [i, id] of (["haste", "shield", "regen", "empower"] as const)
      .slice(0, MAX_STATUSES)
      .entries())
      applyPlayerStatus(
        t.w,
        "a",
        { status: id as never, ms: 8000, ratio: 0.1 + i / 100, chance: 1 },
        0,
        "a",
      );
    const before = statusIds(t.c).length;
    useIt(t);
    expect(statusIds(t.c)).toContain("windup");
    expect(statusIds(t.c).length).toBe(before + 1);
  });

  it("đang vận thì KHÔNG dùng chiêu khác (không tốn linh lực, không fx), kể cả chính chiêu đó sau khi hết hồi chiêu", () => {
    const t = setup();
    withSkill({
      id: "tuc_thoi",
      shape: "nova",
      mult: 1,
      range: 200,
      element: "none",
      windupMs: undefined,
    });
    t.c.skills.learned["tuc_thoi"] = 1;
    t.c.skills.slots[1] = "tuc_thoi";
    useIt(t);
    const mp = t.p.mp;
    t.fx.length = 0;
    cast(t.w, "a", { slot: 3, angle: 0 });
    expect(t.p.mp).toBe(mp);
    expect(t.fx).toEqual([]);
    t.c.skillCd[0] = 0;
    useIt(t);
    expect(t.p.mp).toBe(mp);
    expect(t.fx).toEqual([]);
  });
});

describe("chiêu vận: đáp", () => {
  it("chưa tới giờ thì chưa sát thương; tới giờ (qua tickWorld) thì MỘT lần trúng đúng quái trong vùng; trạng thái vận được gỡ, tốc độ trở lại", () => {
    const t = setup();
    const m = mon(t, 80);
    const far = mon(t, 600);
    useIt(t);
    run(t, WIND - TICK_MS * 2);
    expect(dmgTo(t, m.id)).toEqual([]);
    expect(t.c.windup).toBeDefined();
    run(t, TICK_MS * 3);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(dmgTo(t, far.id)).toEqual([]);
    expect(t.c.windup).toBeUndefined();
    expect(statusIds(t.c)).not.toContain("windup");
    expect(t.c.moveMul).toBeUndefined();
    run(t, 2000);
    expect(dmgTo(t, m.id)).toHaveLength(1); // không đáp lần hai
  });

  it("đáp từ vị trí HIỆN TẠI của người vận (đi lại trong lúc vận): quái quanh chỗ mới trúng, quái quanh chỗ cũ thì không", () => {
    const t = setup();
    const oldSpot = mon(t, 50);
    useIt(t);
    t.p.x += 700; // đã đi tới chỗ khác lúc đáp
    const newSpot = mon(t, 50);
    run(t, WIND + TICK_MS);
    expect(dmgTo(t, newSpot.id)).toHaveLength(1);
    expect(dmgTo(t, oldSpot.id)).toEqual([]);
  });

  it("đáp theo HƯỚNG lúc bắt đầu vận (không đổi hướng giữa chừng): chiêu thẳng chỉ trúng quái đúng hướng đã chọn", () => {
    const t = setup({ shape: "line", range: 400, width: 60 } as Partial<SkillDef>);
    const ahead = mon(t, 200, 0);
    const side = mon(t, 0, 200); // phía +y: hướng góc PI / 2
    useIt(t); // hướng 0
    t.p.angle = Math.PI / 2; // người chơi xoay mặt giữa lúc vận: không ảnh hưởng hướng đáp
    run(t, WIND + TICK_MS);
    expect(dmgTo(t, ahead.id)).toHaveLength(1);
    expect(dmgTo(t, side.id)).toEqual([]);
  });

  it("hiệu ứng hình của chiêu đạn (`pbolt`) chỉ gửi lúc ĐÁP, không lúc bắt đầu", () => {
    const t = setup({
      shape: "bolt",
      range: 400,
      count: 1,
      speed: 500,
      pierce: 0,
      bounce: 0,
      arc: undefined,
    });
    vi.spyOn(t.w.map, "isBlockedPx").mockReturnValue(false);
    useIt(t);
    expect(t.fx.some((f) => f.kind === "pbolt")).toBe(false);
    run(t, WIND + TICK_MS);
    expect(t.fx.filter((f) => f.kind === "pbolt")).toHaveLength(1);
  });

  it("điểm luyện chiêu cộng lúc ĐÁP (trúng thật), không lúc bắt đầu", () => {
    const t = setup({ grade: 3 } as Partial<SkillDef>);
    mon(t, 80);
    useIt(t);
    expect(t.c.skills.mastery).toBeUndefined();
    run(t, WIND + TICK_MS);
    expect(t.c.skills.mastery?.["van_thu"]).toBe(1);
  });

  it("chiêu TỨC THỜI (không khai windupMs) không đổi: sát thương ngay, không trạng thái vận", () => {
    const t = setup({ windupMs: undefined });
    const m = mon(t, 80);
    useIt(t);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(t.c.windup).toBeUndefined();
    expect(statusIds(t.c)).not.toContain("windup");
  });
});

describe("chiêu vận: HUỶ (không đáp, không hoàn tiêu hao)", () => {
  const cases: [string, (t: T) => void][] = [
    [
      "choáng",
      (t) =>
        void applyPlayerStatus(t.w, "a", { status: "stun", ms: 3000, ratio: 0, chance: 1 }, 0, "x"),
    ],
    ["chết", (t) => void (t.p.dead = true)],
    ["hồn lìa xác", (t) => void t.w.ghosts.add("a")],
    ["Hoàng Tuyền", (t) => void (t.c.limbo = {} as never)],
    [
      "thách đấu bắt đầu",
      (t) => {
        const b = addPlayer(t.w, "b", 4, 0);
        b.p.x = 3000;
        b.p.y = 3000;
        t.w.duels._start({
          a: "a",
          b: "b",
          phase: "fight",
          fightAt: 0,
          endsAt: Infinity,
          ox: 0,
          oy: 0,
        });
      },
    ],
  ];
  for (const [name, cancel] of cases) {
    it(`${name} giữa lúc vận: không sát thương, dọn trạng thái vận, linh lực + hồi chiêu giữ nguyên đã tiêu`, () => {
      const t = setup();
      const m = mon(t, 80);
      useIt(t);
      const mpAfter = t.p.mp;
      const cd = t.c.skillCd[0];
      run(t, WIND / 2);
      cancel(t);
      run(t, WIND);
      expect(dmgTo(t, m.id), name).toEqual([]);
      expect(t.c.windup, name).toBeUndefined();
      expect(statusIds(t.c), name).not.toContain("windup");
      // chủ được báo bỏ trạng thái vận (không để thanh vận / huy hiệu treo): bản tin trạng thái cuối không còn `windup`
      if (name !== "chết")
        expect(
          t.statusMsgs.at(-1)!.msg.list.some((x) => x[0] === "windup"),
          name,
        ).toBe(false);
      expect(t.p.mp, name).toBeLessThanOrEqual(mpAfter + 1e9); // linh lực không bị hoàn (không đổi do hồi chậm của tick ngắn)
      expect(t.c.skillCd[0], name).toBe(cd);
    });
  }

  it("linh lực KHÔNG được hoàn khi huỷ (so trực tiếp ở tickWindup, không qua hồi phục tick)", () => {
    const t = setup();
    mon(t, 80);
    useIt(t);
    const mpAfter = t.p.mp;
    t.p.dead = true;
    tickWindup(t.w, "a", t.p, t.c);
    expect(t.p.mp).toBe(mpAfter);
    expect(t.c.windup).toBeUndefined();
  });

  it("đã ở trong trận thách đấu LÚC BẮT ĐẦU vận thì KHÔNG bị huỷ (chỉ trận bắt đầu sau đó mới huỷ)", () => {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = 3000;
    b.p.y = 3000;
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: "fight",
      fightAt: 0,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    const m = mon(t, 80);
    useIt(t);
    run(t, WIND + TICK_MS);
    expect(dmgTo(t, m.id)).toHaveLength(1);
  });

  it("người vận rời phòng giữa chừng: không ném lỗi, không còn gì để đáp", () => {
    const t = setup();
    const m = mon(t, 80);
    useIt(t);
    t.w.state.players.delete("a");
    t.w.ctrl.delete("a");
    expect(() => run(t, WIND * 2)).not.toThrow();
    expect(dmgTo(t, m.id)).toEqual([]);
  });

  it("sau khi bị huỷ thì dùng chiêu khác được ngay (không kẹt trạng thái đang vận)", () => {
    const t = setup();
    useIt(t);
    t.p.dead = true;
    run(t, TICK_MS * 2);
    t.p.dead = false;
    t.c.skillCd[0] = 0;
    const mp = t.p.mp;
    t.p.mp = t.p.maxMp;
    useIt(t);
    expect(t.p.mp).toBeLessThan(t.p.maxMp);
    expect(mp).toBeLessThan(t.p.maxMp + 1);
    expect(t.c.windup).toBeDefined();
  });
});

describe("addStatus: `windup` không tính vào MAX_STATUSES (luật máy chủ, khớp `sanitizeStatusList` của client)", () => {
  const fx = (status: string, ms: number, ratio = 0.1) => ({
    status: status as never,
    ms,
    ratio,
    chance: 1,
  });
  const fill = (box: ReturnType<typeof newStatusBox>, now: number) => {
    // bốn buff có lợi hết hạn lệch nhau (đầy trần)
    addStatus(box, fx("haste", 8000), now);
    addStatus(box, fx("shield", 9000), now);
    addStatus(box, fx("regen", 10_000), now);
    addStatus(box, fx("empower", 11_000), now);
  };

  it("hộp đã đủ bốn buff vẫn nhận `windup` (không từ chối, không đẩy buff nào ra)", () => {
    const box = newStatusBox();
    fill(box, 1000);
    expect(box.list).toHaveLength(MAX_STATUSES);
    expect(addStatus(box, fx("windup", 1500, WINDUP_SLOW), 1000)).toBe("added");
    expect(box.list.map((x) => x.id)).toEqual(
      expect.arrayContaining(["haste", "shield", "regen", "empower", "windup"]),
    );
    expect(box.list).toHaveLength(MAX_STATUSES + 1);
  });

  it("`windup` KHÔNG bao giờ là nạn nhân: buff / trạng thái có hại mới đẩy buff thường hết sớm nhất, windup còn nguyên", () => {
    const box = newStatusBox();
    fill(box, 1000);
    addStatus(box, fx("windup", 500, WINDUP_SLOW), 1000); // hết SỚM NHẤT trong hộp
    expect(addStatus(box, fx("chill", 6000, 0.3), 1000)).toBe("added"); // có hại luôn vào
    const ids = box.list.map((x) => x.id);
    expect(ids).toContain("windup"); // không bị đẩy dù hết sớm nhất
    expect(ids).not.toContain("haste"); // nạn nhân là buff thường hết sớm nhất
    expect(box.list.filter((x) => x.id !== "windup")).toHaveLength(MAX_STATUSES);
  });

  it("buff có lợi mới sống lâu hơn khi đủ trần: đẩy buff THƯỜNG hết sớm nhất (không đẩy `windup`)", () => {
    const box = newStatusBox();
    fill(box, 1000);
    addStatus(box, fx("windup", 300, WINDUP_SLOW), 1000); // hết sớm hơn mọi buff thường
    expect(addStatus(box, fx("amp_hoa", 60_000, 0.2), 1000)).toBe("added");
    const ids = box.list.map((x) => x.id);
    expect(ids).toContain("windup");
    expect(ids).toContain("amp_hoa");
    expect(ids).not.toContain("haste");
    expect(box.list.filter((x) => x.id !== "windup")).toHaveLength(MAX_STATUSES);
  });

  it("buff có lợi mới KHÔNG sống lâu hơn buff nào: bị từ chối, `windup` vẫn còn", () => {
    const box = newStatusBox();
    fill(box, 1000);
    addStatus(box, fx("windup", 300, WINDUP_SLOW), 1000);
    expect(addStatus(box, fx("amp_hoa", 2000, 0.2), 1000)).toBe("full"); // 2 s < haste 8 s
    expect(box.list.some((x) => x.id === "windup")).toBe(true);
    expect(box.list.some((x) => x.id === "haste")).toBe(true);
  });
});
