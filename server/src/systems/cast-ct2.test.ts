// Thêm chiêu CT2 (mục 51): thực thi chiêu TỨC THỜI mới: sét lan (`chain`), combo, Cường Lực (`empower`), DẤU hệ (`Monster.mark`). World giả; `Math.random` được ghim để sát thương tất định.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AMP_ELEMENTS,
  CHAIN_FX_POINTS_MAX,
  SKILL_BY_ID,
  PLAYER_RADIUS,
  SKILL_LIMITS,
  TICK_MS,
  markIndexOf,
  type SkillDef,
  type SkillEffect,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import {
  CHAIN_FALLOFF_DEFAULT,
  COMBO_MULT_DEFAULT,
  cast,
  chainTargets,
  displaceMonster,
  displacePlayer,
} from "./cast";
import { tickMonsters } from "./monsters";
import { dealtMult } from "./status-rules";
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
    mon(t, 900, 1000); // sau lưng (hướng đánh 0 = sang phải), TRONG tầm 200: chỉ nửa mặt phía trước mới được chọn làm mục tiêu đầu
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

describe("displace: kéo / đẩy", () => {
  it("đẩy ra xa người dùng đúng quãng; kéo lại gần và dừng SÁT người dùng (không chồng lên)", () => {
    const t = setup();
    const m = mon(t, 1100, 1000);
    expect(displaceMonster(t.w, m.id, "push", 60, 1000, 1000)).toBe(60);
    expect(m.m.x).toBeCloseTo(1160, 3);
    expect(m.m.y).toBeCloseTo(1000, 3);
    const gap = m.mc.def.radius + PLAYER_RADIUS + 2;
    expect(displaceMonster(t.w, m.id, "pull", 200, 1000, 1000)).toBeCloseTo(160 - gap, 3);
    expect(Math.hypot(m.m.x - 1000, m.m.y - 1000)).toBeCloseTo(gap, 3);
    expect(displaceMonster(t.w, m.id, "pull", 50, 1000, 1000)).toBe(0); // đã sát: không kéo thêm
  });

  it("TRÙM miễn, TINH ANH nửa quãng, px ngoài trần bị kẹp displaceMax, số lạ = 0", () => {
    const fresh = (patch?: (r: ReturnType<typeof mon>) => void) => {
      const t = setup();
      const r = mon(t, 1100, 1000); // chỗ trống đã kiểm (cùng toạ độ với ca đẩy / kéo ở trên)
      patch?.(r);
      return { t, r };
    };
    const boss = fresh((r) => (r.mc.def = { ...r.mc.def, boss: true }));
    expect(displaceMonster(boss.t.w, boss.r.id, "push", 100, 1000, 1000)).toBe(0);
    expect(boss.r.m.x).toBe(1100);
    const elite = fresh((r) => (r.mc.elite = true));
    expect(displaceMonster(elite.t.w, elite.r.id, "push", 100, 1000, 1000)).toBe(50);
    const big = fresh();
    expect(displaceMonster(big.t.w, big.r.id, "push", 99999, 1000, 1000)).toBe(
      SKILL_LIMITS.displaceMax,
    );
    const odd = fresh();
    expect(displaceMonster(odd.t.w, odd.r.id, "push", Number.NaN, 1000, 1000)).toBe(0);
    expect(displaceMonster(odd.t.w, "khong_co", "push", 50, 0, 0)).toBe(0);
  });

  it("bị chặn bởi tường / mép bản đồ (dừng giữa chừng) và KHÔNG bị đẩy vào khu an toàn", () => {
    const t = setup();
    const edge = mon(t, 70, 1000); // sát mép trái bản đồ
    const moved = displaceMonster(t.w, edge.id, "push", 200, 400, 1000); // đẩy sang trái, ra khỏi bản đồ
    expect(moved).toBeLessThan(200);
    expect(edge.m.x).toBeGreaterThanOrEqual(0);
    const town = t.w.map.townPx;
    const near = mon(t, town.x + town.r + 40, town.y);
    const startX = near.m.x;
    displaceMonster(t.w, near.id, "push", 200, town.x + town.r + 400, town.y); // đẩy về phía trấn
    expect(t.w.map.inSafe(near.m.x, near.m.y, near.mc.def.radius)).toBe(false);
    expect(near.m.x).toBeLessThan(startX); // có dịch một đoạn rồi dừng ở mép khu an toàn
  });

  it("cast: chiêu có displace đẩy kẻ trúng (còn sống) ra xa người dùng; kẻ ngoài vùng không bị đẩy", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    withSkill({
      id: "chuong_day",
      shape: "cone",
      range: 120,
      arc: 2,
      mult: 1,
      element: "none",
      displace: { dir: "push", px: 40 },
    });
    equip(t.c, "chuong_day");
    const hit = mon(t, 1060, 1000);
    const miss = mon(t, 1500, 1000);
    fire(t);
    expect(hit.m.x).toBeCloseTo(1100, 3);
    expect(miss.m.x).toBe(1500);
  });

  it("kẻ trúng chết thì không còn gì để đẩy (không ném lỗi)", () => {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    withSkill({
      id: "chuong_day",
      shape: "cone",
      range: 120,
      arc: 2,
      mult: 9999,
      element: "none",
      displace: { dir: "push", px: 40 },
    });
    equip(t.c, "chuong_day");
    const weak = mon(t, 1060, 1000, 5);
    expect(() => fire(t)).not.toThrow();
    expect(t.w.mctrl.has(weak.id)).toBe(false);
  });

  it("displacePlayer (PK): đẩy / kéo người chơi, ghi vị trí công khai, người chết không bị", () => {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = t.p.x + 60;
    b.p.y = t.p.y;
    const before = b.p.x;
    expect(displacePlayer(t.w, "b", "push", 40, t.p.x, t.p.y)).toBe(40);
    expect(b.p.x).toBeCloseTo(before + 40, 3);
    expect(b.p.px).toBe(Math.round(b.p.x));
    b.p.dead = true;
    expect(displacePlayer(t.w, "b", "push", 40, t.p.x, t.p.y)).toBe(0);
  });
});

describe("ally: chia trạng thái CÓ LỢI cho đồng đội", () => {
  function party() {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    const near = addPlayer(t.w, "b", 4, 0);
    near.p.x = 1100;
    near.p.y = 1000;
    const far = addPlayer(t.w, "c", 4, 0);
    far.p.x = 1900;
    far.p.y = 1000;
    const stranger = addPlayer(t.w, "d", 4, 0);
    stranger.p.x = 1050;
    stranger.p.y = 1000;
    t.w.parties._create("a", "b");
    t.w.parties._join(t.w.parties._get(t.w.parties.partyIdOf("a")!)!, "c");
    withSkill({
      id: "ho_the_doi",
      shape: "self",
      range: 0,
      mult: 0,
      element: "none",
      ally: { range: 300 },
      effects: [
        { status: "shield", ms: 4000, ratio: 0.2, chance: 1 },
        { status: "burn", ms: 3000, ratio: 0.1, chance: 1 },
      ],
    });
    equip(t.c, "ho_the_doi");
    return { ...t, near, far, stranger };
  }
  const has = (t: ReturnType<typeof party>, sid: string, id: string) =>
    (t.w.ctrl.get(sid)!.st?.list ?? []).some((s) => s.id === id);

  it("đồng đội cùng đội trong tầm nhận buff (hộ thể); ngoài tầm, ngoài đội thì không; trạng thái CÓ HẠI không bao giờ chia", () => {
    const t = party();
    fire(t);
    expect(has(t, "a", "shield")).toBe(true);
    expect(has(t, "b", "shield")).toBe(true);
    expect(has(t, "c", "shield")).toBe(false); // cùng đội nhưng ngoài tầm
    expect(has(t, "d", "shield")).toBe(false); // trong tầm nhưng ngoài đội
    for (const sid of ["a", "b", "c", "d"]) expect(has(t, sid, "burn")).toBe(false);
  });

  it("người chơi KHÔNG có đội: ally không làm gì thêm; đồng đội đã gục không nhận", () => {
    const t = party();
    t.near.p.dead = true;
    fire(t);
    expect(has(t, "b", "shield")).toBe(false);
    const u = setup();
    withSkill({
      id: "ho_the_doi",
      shape: "self",
      range: 0,
      mult: 0,
      element: "none",
      ally: { range: 300 },
      effects: [{ status: "shield", ms: 4000, ratio: 0.2, chance: 1 }],
    });
    equip(u.c, "ho_the_doi");
    expect(() => fire(u)).not.toThrow();
    expect((u.c.st?.list ?? []).some((s) => s.id === "shield")).toBe(true);
  });

  it("tầm ally kẹp allyRangeMax", () => {
    const t = party();
    t.far.p.x = 1000 + SKILL_LIMITS.allyRangeMax + 50;
    (SKILL_BY_ID["ho_the_doi"] as SkillDef).ally = { range: 99999 };
    fire(t);
    expect(has(t, "c", "shield")).toBe(false);
  });
});

describe("weaken (Suy Yếu): quái gây ít sát thương hơn", () => {
  it("dealtMult: 1 - ratio, trùm chỉ chịu nửa, hết hạn / không hộp = 1", () => {
    const box = {
      list: [{ id: "weaken", until: 1000, ratio: 0.4, dps: 0, pool: 0, last: 0, src: "" }],
      stunImmuneUntil: 0,
    };
    expect(dealtMult(box as never, 500)).toBeCloseTo(0.6, 10);
    expect(dealtMult(box as never, 500, true)).toBeCloseTo(0.8, 10);
    expect(dealtMult(box as never, 1000)).toBe(1);
    expect(dealtMult(undefined, 0)).toBe(1);
    expect(dealtMult({ list: [], stunImmuneUntil: 0 }, 0)).toBe(1);
  });

  function hitTaken(weaken: boolean, kind = "lang") {
    const t = setup();
    t.p.hp = t.p.maxHp = 1_000_000;
    const m = addMonster(t.w, kind, t.p.x + 25, t.p.y);
    m.mc.target = "a";
    m.mc.nextAttack = 0;
    if (weaken) {
      t.w.now = 100_000;
      applyMonsterStatus(t.w, m.id, { status: "weaken", ms: 5000, ratio: 0.4, chance: 1 }, 0, "a");
    }
    const hp0 = t.p.hp;
    tickMonsters(t.w, 0.05);
    return hp0 - t.p.hp;
  }

  it("đòn gần của quái thường giảm 40%; của TRÙM giảm 20%; không weaken thì y hệt", () => {
    const base = hitTaken(false);
    const weak = hitTaken(true);
    expect(base).toBeGreaterThan(0);
    expect(weak / base).toBeCloseTo(0.6, 1);
    const bossBase = hitTaken(false, "mang");
    const bossWeak = hitTaken(true, "mang");
    expect(bossBase).toBeGreaterThan(0);
    expect(bossWeak / bossBase).toBeCloseTo(0.8, 1);
  });
});

describe("PK: chain và displace lên đối thủ thách đấu", () => {
  function duel(dx: number) {
    const t = setup();
    t.p.x = 1000;
    t.p.y = 1000;
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = 1000 + dx;
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
    return { ...t, b };
  }

  it("chain trúng đối thủ ở nửa mặt phía TRƯỚC trong tầm; sau lưng hoặc ngoài tầm thì không", () => {
    withSkill({
      id: "set_pk",
      shape: "chain",
      range: 200,
      bounces: 2,
      chainReach: 100,
      mult: 1,
      element: "none",
    });
    for (const [dx, hit] of [
      [100, true],
      [-100, false],
      [400, false],
    ] as const) {
      const t = duel(dx);
      equip(t.c, "set_pk");
      const hp = t.b.p.hp;
      fire(t);
      expect(t.b.p.hp < hp, `dx=${dx}`).toBe(hit);
    }
  });

  it("chiêu displace đẩy ĐỐI THỦ khi đòn trúng; không trúng thì không đẩy", () => {
    withSkill({
      id: "day_pk",
      shape: "cone",
      range: 120,
      arc: 2,
      mult: 1,
      element: "none",
      displace: { dir: "push", px: 40 },
    });
    const hit = duel(60);
    equip(hit.c, "day_pk");
    fire(hit);
    expect(hit.b.p.x).toBeCloseTo(1100, 3);
    const miss = duel(500);
    equip(miss.c, "day_pk");
    fire(miss);
    expect(miss.b.p.x).toBe(1500);
  });

  it("chiêu chain trong PK vẫn đánh quái quanh đó bình thường (không ảnh hưởng nhau)", () => {
    withSkill({
      id: "set_pk",
      shape: "chain",
      range: 200,
      bounces: 1,
      chainReach: 100,
      mult: 1,
      element: "none",
    });
    const t = duel(150);
    equip(t.c, "set_pk");
    const m = mon(t, 1080, 1000);
    const hp = t.b.p.hp;
    fire(t);
    expect(dmgTo(t, m.id)).toHaveLength(1);
    expect(t.b.p.hp).toBeLessThan(hp);
  });
});
