// Thêm chiêu CT2 (mục 51): thực thi chiêu TỨC THỜI mới: sét lan (`chain`), combo, Cường Lực (`empower`), DẤU hệ (`Monster.mark`). World giả; `Math.random` được ghim để sát thương tất định.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AMP_ELEMENTS,
  CHAIN_FX_POINTS_MAX,
  SKILL_BY_ID,
  SKILL_LIMITS,
  TICK_MS,
  markIndexOf,
  type SkillDef,
  type SkillEffect,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { CHAIN_FALLOFF_DEFAULT, COMBO_MULT_DEFAULT, cast, chainTargets } from "./cast";
import { applyMonsterStatus, applyPlayerStatus, monsterHasStatus, tickStatuses } from "./status";
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

function setup() {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", 4, 0);
  a.p.mp = a.p.maxMp;
  vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích; dao động 0,9-1,1 cố định (0,5 -> 1,0)
  return { ...t, ...a };
}
function equip(c: PlayerCtrl, id: string) {
  c.skills.learned[id] = 1;
  c.skills.slots[0] = id;
}
/** Quái đứng yên với khí huyết rất lớn (không chết giữa phép đo); `hp` nhỏ để thử trường hợp chết ngay. */
function mon(t: { w: ReturnType<typeof makeWorld>["w"] }, x: number, y: number, hp = 1e12) {
  const r = addMonster(t.w, "tho", x, y);
  r.m.hp = r.m.maxHp = hp;
  return r;
}
const fire = (t: ReturnType<typeof setup>) => cast(t.w, "a", { slot: 2, angle: 0 });
const dmgTo = (t: ReturnType<typeof setup>, id: string) => t.dmgs.filter((d) => d.target === id);
const mark = (el: string, ms = 8000): SkillEffect => ({
  status: `mark_${el}` as never,
  ms,
  ratio: 0,
  chance: 1,
});

describe("chainTargets: chọn mục tiêu sét lan", () => {
  it("đầu = quái gần nhất trong tầm và nửa mặt phía trước; nảy tới quái gần nhất CHƯA trúng trong chainReach; tối đa bounces + 1 quái, mỗi quái một lần", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    const near = mon(t, 1060, 1000);
    const b2 = mon(t, 1160, 1000); // cách near 100
    const b3 = mon(t, 1260, 1000); // cách b2 100
    const b4 = mon(t, 1360, 1000);
    const out = chainTargets(
      t.w,
      { range: 200, bounces: 2, chainReach: 120, falloff: 0.5 },
      1000,
      1000,
      0,
    );
    expect(out.hits.map((h) => h.id)).toEqual([near.id, b2.id, b3.id]); // b4 không với tới (đã hết lần nảy)
    expect(out.hits.map((h) => h.scale)).toEqual([1, 0.5, 0.25]);
    expect(out.pts).toEqual([1000, 1000, 1060, 1000, 1160, 1000, 1260, 1000]);
    expect(b4.m.hp).toBeGreaterThan(0);
  });

  it("quái ngoài tầm đầu hoặc phía SAU lưng không được chọn làm mục tiêu đầu; không có mục tiêu thì rỗng", () => {
    const t = setup();
    mon(t, 700, 1000); // sau lưng (hướng đánh 0 = sang phải)
    mon(t, 1500, 1000); // quá tầm 200
    const out = chainTargets(
      t.w,
      { range: 200, bounces: 3, chainReach: 300, falloff: 0.9 },
      1000,
      1000,
      0,
    );
    expect(out.hits).toEqual([]);
    expect(out.pts).toEqual([1000, 1000]);
  });

  it("nảy được cả sang quái ở SAU lưng (nảy không xét hướng); không quay lại quái đã trúng; ngoài chainReach thì dừng", () => {
    const t = setup();
    const first = mon(t, 1100, 1000);
    const back = mon(t, 1000, 1000); // sau mục tiêu đầu, cách 100
    const far = mon(t, 1000, 1400); // cách `back` 400
    const out = chainTargets(
      t.w,
      { range: 150, bounces: 4, chainReach: 150, falloff: 0.8 },
      1050,
      1000,
      0,
    );
    expect(out.hits.map((h) => h.id)).toEqual([first.id, back.id]);
    expect(far.m.hp).toBeGreaterThan(0);
  });

  it("chainReach 0 (hoặc thiếu): KHÔNG nảy dù có quái đứng chồng lên mục tiêu", () => {
    const t = setup();
    mon(t, 1060, 1000);
    mon(t, 1062, 1000); // chồng lên mục tiêu đầu: nếu nảy với tầm 0 thì còn dính
    expect(
      chainTargets(t.w, { range: 200, bounces: 3, chainReach: 0 }, 1000, 1000, 0).hits,
    ).toHaveLength(1);
    expect(chainTargets(t.w, { range: 200, bounces: 3 }, 1000, 1000, 0).hits).toHaveLength(1);
  });

  it("quái đã chết (hp 0) bị bỏ qua; tham số ngoài trần bị kẹp (bounces <= chainBouncesMax, falloff >= chainFalloffMin, chainReach <= chainReachMax, số lạ -> mặc định)", () => {
    const t = setup();
    const dead = mon(t, 1050, 1000);
    dead.m.hp = 0;
    const alive = mon(t, 1080, 1000);
    for (let i = 0; i < 10; i++) mon(t, 1080 + 20 * (i + 1), 1000);
    const out = chainTargets(
      t.w,
      { range: 200, bounces: 99, chainReach: 99999, falloff: 0.01 },
      1000,
      1000,
      0,
    );
    expect(out.hits[0]!.id).toBe(alive.id);
    expect(out.hits).toHaveLength(SKILL_LIMITS.chainBouncesMax + 1);
    expect(out.hits.at(-1)!.scale).toBeCloseTo(
      SKILL_LIMITS.chainFalloffMin ** SKILL_LIMITS.chainBouncesMax,
      10,
    );
    expect(out.pts.length).toBeLessThanOrEqual(CHAIN_FX_POINTS_MAX * 2);
    const lax = chainTargets(
      t.w,
      { range: 200, bounces: Number.NaN, chainReach: Number.NaN, falloff: Number.NaN },
      1000,
      1000,
      0,
    );
    expect(lax.hits).toHaveLength(1); // không bounces hợp lệ: chỉ mục tiêu đầu
    const dflt = chainTargets(t.w, { range: 200, bounces: 1, chainReach: 100 }, 1000, 1000, 0);
    expect(dflt.hits[1]!.scale).toBe(CHAIN_FALLOFF_DEFAULT);
  });
});

describe("cast chain: sát thương và hiệu ứng", () => {
  it("đánh theo thứ tự nảy, mỗi lần nảy giảm đúng falloff; gửi MỘT `fx chain` với pts đúng; mỗi quái một lần", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    withSkill({
      id: "set_lan_thu",
      shape: "chain",
      range: 200,
      bounces: 2,
      chainReach: 120,
      falloff: 0.5,
      mult: 2,
      element: "none",
    });
    equip(t.c, "set_lan_thu");
    const m1 = mon(t, 1060, 1000);
    const m2 = mon(t, 1160, 1000);
    const m3 = mon(t, 1260, 1000);
    fire(t);
    const d1 = dmgTo(t, m1.id)[0]!.amount;
    const d2 = dmgTo(t, m2.id)[0]!.amount;
    const d3 = dmgTo(t, m3.id)[0]!.amount;
    expect(dmgTo(t, m1.id)).toHaveLength(1);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
    expect(d2).toBeCloseTo(d1 * 0.5, -1);
    expect(d3).toBeCloseTo(d1 * 0.25, -1);
    const chains = t.fx.filter((f) => f.kind === "chain");
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({
      by: "a",
      skill: "set_lan_thu",
      x: 1000,
      y: 1000,
      pts: [1000, 1000, 1060, 1000, 1160, 1000, 1260, 1000],
    });
  });

  it("không có mục tiêu: vẫn tốn linh lực + hồi chiêu như mọi chiêu nhưng KHÔNG gửi `fx chain`", () => {
    const t = setup();
    withSkill({
      id: "set_lan_thu",
      shape: "chain",
      range: 100,
      bounces: 2,
      chainReach: 100,
      mult: 2,
      element: "none",
    });
    equip(t.c, "set_lan_thu");
    const mp = t.p.mp;
    fire(t);
    expect(t.p.mp).toBeLessThan(mp);
    expect(t.fx.filter((f) => f.kind === "chain")).toHaveLength(0);
    expect(t.dmgs).toHaveLength(0);
  });

  it("trạng thái của chiêu chain gắn lên MỌI quái trúng (kể cả quái nảy tới)", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    withSkill({
      id: "set_lan_thu",
      shape: "chain",
      range: 200,
      bounces: 1,
      chainReach: 120,
      mult: 1,
      element: "none",
      effects: [{ status: "bleed", ms: 4000, ratio: 0.2, chance: 1 }],
    });
    equip(t.c, "set_lan_thu");
    const m1 = mon(t, 1060, 1000);
    const m2 = mon(t, 1160, 1000);
    const m3 = mon(t, 1260, 1000);
    fire(t);
    expect(monsterHasStatus(t.w, m1.id, "bleed")).toBe(true);
    expect(monsterHasStatus(t.w, m2.id, "bleed")).toBe(true);
    expect(monsterHasStatus(t.w, m3.id, "bleed")).toBe(false);
  });
});

describe("DẤU hệ trên quái (Monster.mark)", () => {
  it("gắn dấu -> mark = chỉ số hệ; nhiều dấu thì lấy dấu MỚI NHẤT; hết hạn hết dấu thì về 0", () => {
    const t = setup();
    const m = mon(t, 1000, 1000);
    expect(m.m.mark).toBe(0);
    t.w.now = 100_000;
    applyMonsterStatus(t.w, m.id, mark("hoa", 3000), 0, "a");
    expect(m.m.mark).toBe(markIndexOf("hoa"));
    t.w.now += 500;
    applyMonsterStatus(t.w, m.id, mark("bang", 3000), 0, "a");
    expect(m.m.mark).toBe(markIndexOf("bang"));
    t.w.now += 2600; // dấu hoả (hết 103000) hết; dấu băng (hết 103500) còn tới 103500
    tickStatuses(t.w, TICK_MS);
    expect(m.m.mark).toBe(markIndexOf("bang"));
    t.w.now += 500;
    tickStatuses(t.w, TICK_MS);
    expect(m.m.mark).toBe(0);
    expect(AMP_ELEMENTS.length).toBeGreaterThanOrEqual(9);
  });
});

describe("combo", () => {
  /** Chiêu thường nhắm trước mặt, nhân `mult` nếu mục tiêu mang dấu hoả. */
  function comboSkill(extra: Partial<SkillDef> = {}) {
    return withSkill({
      id: "kiem_combo_thu",
      shape: "cone",
      range: 120,
      arc: 2,
      mult: 1,
      element: "none",
      combo: { needs: "mark_hoa" as never, mult: 1.5, consume: true },
      ...extra,
    });
  }

  it("mục tiêu mang dấu: sát thương nhân combo.mult, `dmg.combo = true`, dấu bị gỡ (consume); không dấu: đòn thường, không cờ combo", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    comboSkill();
    equip(t.c, "kiem_combo_thu");
    const marked = mon(t, 1060, 1000);
    const plain = mon(t, 1060, 1030);
    applyMonsterStatus(t.w, marked.id, mark("hoa"), 0, "a");
    fire(t);
    const dm = dmgTo(t, marked.id)[0]!;
    const dp = dmgTo(t, plain.id)[0]!;
    expect(dm.amount / dp.amount).toBeCloseTo(1.5, 1);
    expect(dm.combo).toBe(true);
    expect(dp).not.toHaveProperty("combo");
    expect(monsterHasStatus(t.w, marked.id, "mark_hoa")).toBe(false); // gỡ dấu
    expect(marked.m.mark).toBe(0);
  });

  it("không `consume` thì dấu còn; `apply` gắn thêm trạng thái lên kẻ ăn combo (và chỉ kẻ ăn combo)", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    comboSkill({
      combo: {
        needs: "mark_hoa" as never,
        mult: 1.5,
        apply: { status: "chill", ms: 3000, ratio: 0.3, chance: 1 },
      },
    });
    equip(t.c, "kiem_combo_thu");
    const marked = mon(t, 1060, 1000);
    const plain = mon(t, 1060, 1030);
    applyMonsterStatus(t.w, marked.id, mark("hoa"), 0, "a");
    fire(t);
    expect(monsterHasStatus(t.w, marked.id, "mark_hoa")).toBe(true);
    expect(monsterHasStatus(t.w, marked.id, "chill")).toBe(true);
    expect(monsterHasStatus(t.w, plain.id, "chill")).toBe(false);
  });

  it("thiếu combo.mult thì dùng COMBO_MULT_DEFAULT; mult ngoài trần bị kẹp comboMultMax", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    comboSkill({ combo: { needs: "mark_hoa" as never } });
    equip(t.c, "kiem_combo_thu");
    const m = mon(t, 1060, 1000);
    const p2 = mon(t, 1060, 1030);
    applyMonsterStatus(t.w, m.id, mark("hoa"), 0, "a");
    fire(t);
    expect(dmgTo(t, m.id)[0]!.amount / dmgTo(t, p2.id)[0]!.amount).toBeCloseTo(
      COMBO_MULT_DEFAULT,
      1,
    );
    const u = setup();
    u.p.x = 1000;
    u.p.y = 1000;
    comboSkill({ combo: { needs: "mark_hoa" as never, mult: 50 } });
    equip(u.c, "kiem_combo_thu");
    const a = mon(u, 1060, 1000);
    const b = mon(u, 1060, 1030);
    applyMonsterStatus(u.w, a.id, mark("hoa"), 0, "a");
    fire(u);
    expect(dmgTo(u, a.id)[0]!.amount / dmgTo(u, b.id)[0]!.amount).toBeCloseTo(
      SKILL_LIMITS.comboMultMax,
      1,
    );
  });

  it("kẻ ăn combo chết ngay thì không còn gắn `apply` (quái đã bị xoá); dấu khác hệ KHÔNG kích combo", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    comboSkill({
      mult: 9999,
      combo: {
        needs: "mark_hoa" as never,
        mult: 1.5,
        apply: { status: "chill", ms: 3000, ratio: 0.3, chance: 1 },
      },
    });
    equip(t.c, "kiem_combo_thu");
    const m = mon(t, 1060, 1000, 5);
    applyMonsterStatus(t.w, m.id, mark("hoa"), 0, "a");
    expect(() => fire(t)).not.toThrow();
    expect(t.w.mctrl.has(m.id)).toBe(false);
    const u = setup();
    u.p.x = 1000;
    u.p.y = 1000;
    comboSkill();
    equip(u.c, "kiem_combo_thu");
    const other = mon(u, 1060, 1000);
    const ref = mon(u, 1060, 1030);
    applyMonsterStatus(u.w, other.id, mark("bang"), 0, "a");
    fire(u);
    expect(dmgTo(u, other.id)[0]).not.toHaveProperty("combo");
    expect(dmgTo(u, other.id)[0]!.amount).toBe(dmgTo(u, ref.id)[0]!.amount);
  });
});

describe("empower (Cường Lực)", () => {
  it("nhân sát thương MỌI chiêu của mình 1 + ratio; hết hạn thì về như cũ", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    withSkill({ id: "chem_thu", shape: "cone", range: 120, arc: 2, mult: 1, element: "none" });
    equip(t.c, "chem_thu");
    const base = mon(t, 1060, 1000);
    fire(t);
    const d0 = dmgTo(t, base.id)[0]!.amount;
    t.c.skillCd[0] = 0;
    t.dmgs.length = 0;
    t.w.now = 500_000;
    const buff: SkillEffect = { status: "empower", ms: 5000, ratio: 0.4, chance: 1 };
    applyPlayerStatus(t.w, "a", buff, 0, "a");
    fire(t);
    const d1 = dmgTo(t, base.id)[0]!.amount;
    expect(d1 / d0).toBeCloseTo(1.4, 1);
    t.c.skillCd[0] = 0;
    t.dmgs.length = 0;
    t.w.now += 6000; // hết hạn
    fire(t);
    expect(dmgTo(t, base.id)[0]!.amount).toBe(d0);
  });
});
