// Dùng chiêu thức (M7.2b bước 2): hình trúng thuần, kiểm từ chối (ô trống / chưa mở / hồi chiêu / linh lực / choáng), sát thương theo tầng và hệ,
// trạng thái gắn lên kẻ trúng và lên mình, lao + né, thách đấu. Chiêu thật lấy từ `SKILLS_M7`; chiêu thử có `chance` 1 được thêm tạm vào bảng.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ELEMENTS,
  PLAYER_RADIUS,
  SKILL_BY_ID,
  SKILL_MSG,
  elementMult,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  statsFor,
  type SkillDef,
} from "@tien-gioi/shared";
import { MESSAGE_LIMITS } from "../rate-limit";
import type { PlayerCtrl } from "../world";
import { cast, shapeHits } from "./cast";
import { hurtPlayer } from "./combat";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const REAL = (id: string): SkillDef => SKILL_BY_ID[id];
const added: string[] = [];
/** Thêm tạm một chiêu thử vào bảng tra (gỡ sau mỗi test). */
function withSkill(over: Partial<SkillDef> & { id: string }): SkillDef {
  const def: SkillDef = {
    ...REAL("bon_thach_quyen"),
    effects: [],
    ...over,
  } as SkillDef;
  (SKILL_BY_ID as Record<string, SkillDef>)[def.id] = def;
  added.push(def.id);
  return def;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const id of added.splice(0)) delete (SKILL_BY_ID as Record<string, SkillDef>)[id];
});

/** Người chơi ở Hóa Thần tầng 0 (cả bốn ô chiêu đã mở), đầy linh lực, đứng ngoài trấn. */
function setup(realm = 4) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", realm, 0);
  a.p.mp = a.p.maxMp;
  return { ...t, ...a };
}
function equip(c: PlayerCtrl, slot: 2 | 3 | 4 | 5, id: string, level = 1) {
  c.skills.learned[id] = level;
  c.skills.slots[slot - 2] = id;
}
const dmgOf = (t: ReturnType<typeof setup>, id: string) =>
  t.dmgs.filter((d) => d.target === id).map((d) => d.amount);

describe("shapeHits: hình trúng thuần", () => {
  const cone = REAL("hoa_van_kiem"); // range 90, arc 2,2 rad
  const R = 13;

  it("cone: trong tầm và trong cung thì trúng; sau lưng, ngoài tầm thì không; chạm sát người đánh luôn trúng", () => {
    expect(shapeHits(cone, 0, 0, 0, 50, 0, R)).toBe(1);
    expect(shapeHits(cone, 0, 0, 0, 50, 60, R)).toBe(1); // lệch ~50°, trong nửa cung 63°
    expect(shapeHits(cone, 0, 0, 0, -50, 0, R)).toBe(0); // sau lưng
    expect(shapeHits(cone, 0, 0, 0, 0, 200, R)).toBe(0); // quá tầm
    expect(shapeHits(cone, 0, 0, 0, 90 + R, 0, R)).toBe(1); // mép tầm (tính cả bán kính)
    expect(shapeHits(cone, 0, 0, 0, 90 + R + 1, 0, R)).toBe(0);
    expect(shapeHits(cone, 0, 0, 0, -5, 0, R)).toBe(1); // chồng lên người đánh: không xét hướng
    expect(shapeHits(cone, 100, 100, Math.PI, 50, 100, R)).toBe(1); // hướng đánh quay lại
  });

  it("line: trong bề rộng + tầm; ngoài bề rộng, quá tầm, sau lưng thì không", () => {
    const line = REAL("huyen_bang_chi"); // range 200, width 20
    expect(shapeHits(line, 0, 0, 0, 150, 5, R)).toBe(1);
    expect(shapeHits(line, 0, 0, 0, 150, 10 + R, R)).toBe(1); // mép bề rộng
    expect(shapeHits(line, 0, 0, 0, 150, 10 + R + 1, R)).toBe(0);
    expect(shapeHits(line, 0, 0, 0, 200 + R + 1, 0, R)).toBe(0);
    expect(shapeHits(line, 0, 0, 0, -20, 0, R)).toBe(0);
    expect(shapeHits(line, 0, 0, Math.PI / 2, 0, 150, R)).toBe(1); // xoay hướng
  });

  it("fan: số tia trúng (mỗi tia một lần): gần người đánh trúng cả 5 tia, xa trục thì ít hơn, quá tầm 0", () => {
    const fan = REAL("lac_tuyet_phan_phi"); // 5 tia, arc 1,57, range 200, width 14
    expect(shapeHits(fan, 0, 0, 0, 20, 0, R)).toBe(5);
    expect(shapeHits(fan, 0, 0, 0, 100, 0, R)).toBe(1); // chỉ tia giữa
    expect(shapeHits(fan, 0, 0, 0, 300, 0, R)).toBe(0);
    expect(shapeHits({ ...fan, count: 1 }, 0, 0, 0, 100, 0, R)).toBe(1);
    expect(shapeHits({ ...fan, count: 0 }, 0, 0, 0, 100, 0, R)).toBe(1); // tối thiểu một tia
  });

  it("nova: vòng quanh mình; ground: vòng cách mình `reach` theo hướng đánh; dash / self không có vùng", () => {
    const nova = { shape: "nova", range: 100 } as SkillDef;
    expect(shapeHits(nova, 0, 0, 0, 100 + R, 0, R)).toBe(1);
    expect(shapeHits(nova, 0, 0, 0, 100 + R + 1, 0, R)).toBe(0);
    const ground = REAL("cuu_cung_khon_sat"); // reach 140, bán kính 110
    expect(shapeHits(ground, 0, 0, 0, 140, 100, R)).toBe(1);
    expect(shapeHits(ground, 0, 0, 0, 0, 0, R)).toBe(0); // chỗ mình đứng KHÔNG nằm trong vùng
    expect(shapeHits(ground, 0, 0, Math.PI / 2, 0, 140, R)).toBe(1); // quay hướng
    expect(shapeHits(REAL("phieu_phong_bo"), 0, 0, 0, 1, 0, R)).toBe(0);
    expect(shapeHits(REAL("kim_chung_trao"), 0, 0, 0, 1, 0, R)).toBe(0);
  });
});

describe("cast: kiểm tin và điều kiện", () => {
  it("tin rác không làm gì, không tốn linh lực / hồi chiêu / tin nhắn", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen");
    const mp = t.p.mp;
    for (const bad of [
      undefined,
      null,
      "x",
      42,
      [],
      {},
      { slot: 1, angle: 0 },
      { slot: 6, angle: 0 },
      { slot: 2.5, angle: 0 },
      { slot: 2, angle: Number.NaN },
      { slot: 2, angle: "0" },
      { slot: "2", angle: 0 },
      { slot: 2 },
    ])
      cast(t.w, "a", bad);
    expect(t.p.mp).toBe(mp);
    expect(t.c.skillCd).toEqual([0, 0, 0, 0]);
    expect(t.fx).toEqual([]);
    expect(t.toasts).toEqual([]);
    cast(t.w, "không-có-người", { slot: 2, angle: 0 }); // không ném lỗi
  });

  it("ô trống: báo 'còn trống', không tốn gì; ô chưa mở (cảnh giới thấp): im lặng", () => {
    const t = setup();
    cast(t.w, "a", { slot: 3, angle: 0 });
    expect(t.toasts.at(-1)!.msg.text).toMatch(/còn trống/);
    expect(t.p.mp).toBe(t.p.maxMp);
    const low = makeWorld();
    const b = addPlayer(low.w, "b", 0, 0); // Phàm Nhân: ô 2 chưa mở
    equip(b.c, 2, "bon_thach_quyen");
    cast(low.w, "b", { slot: 2, angle: 0 });
    expect(low.toasts).toEqual([]);
    expect(low.fx).toEqual([]);
  });

  it("chiêu đã gắn nhưng chưa học (sổ hỏng) coi như ô trống", () => {
    const t = setup();
    t.c.skills.slots[0] = "bon_thach_quyen"; // gắn mà không có trong learned
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.fx).toEqual([]);
    expect(t.toasts.at(-1)!.msg.text).toMatch(/còn trống/);
  });

  it("dùng được: trừ đúng linh lực, đặt hồi chiêu đúng theo tầng, gửi `fx cast` có tầm thật và gửi lại sổ chiêu (cd, cdMax)", () => {
    const t = setup();
    equip(t.c, 3, "bon_thach_quyen", 3);
    const def = REAL("bon_thach_quyen");
    const mp = t.p.mp;
    t.skillMsgs.length = 0;
    cast(t.w, "a", { slot: 3, angle: 1 });
    expect(t.p.mp).toBe(mp - skillMpCost(def, t.p.maxMp));
    const cd = skillCooldownMs(def, 3, 0);
    expect(t.c.skillCd[1]).toBe(t.w.now + cd);
    expect(t.fx).toEqual([
      { kind: "cast", by: "a", skill: def.id, x: t.p.x, y: t.p.y, angle: 1, range: def.range },
    ]);
    const msg = t.skillMsgs.at(-1)!.msg;
    expect(msg.cd[1]).toBe(cd);
    expect(msg.cdMax[1]).toBe(cd);
    expect(msg.cd[0]).toBe(0);
  });

  it("chưa đủ cảnh giới (chiêu khắc từ kiếp trước, kiếp mới còn thấp): báo cần cảnh giới nào, KHÔNG tốn linh lực / hồi chiêu; đủ đúng mốc thì dùng được", () => {
    const def = REAL("thanh_tung_phi_cham"); // cần cảnh giới cao hơn Luyện Khí
    expect(def.reqRealm).toBeGreaterThan(1);
    const t = setup(1); // Luyện Khí: ô 2 đã mở nhưng chưa đủ cảnh giới cho chiêu
    equip(t.c, 2, def.id);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.toasts.at(-1)!.msg.text).toContain(def.name);
    expect(t.toasts.at(-1)!.msg.text).toMatch(/Cần đạt/);
    expect(t.fx).toEqual([]);
    expect(t.p.mp).toBe(t.p.maxMp);
    expect(t.c.skillCd[0]).toBe(0);
    // cùng cảnh giới nhưng bậc thấp hơn: vẫn chưa
    t.p.realm = def.reqRealm;
    t.p.tier = def.reqTier - 1;
    if (def.reqTier > 0) {
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.fx).toEqual([]);
    }
    // đúng mốc: dùng được
    t.p.tier = def.reqTier;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.fx).toHaveLength(1);
    expect(t.p.mp).toBeLessThan(t.p.maxMp);
  });

  it("dùng chiêu ngắt đả tọa", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen");
    t.p.meditating = true;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.p.meditating).toBe(false);
    // chiêu bị từ chối (ô trống) thì KHÔNG ngắt đả tọa
    t.p.meditating = true;
    cast(t.w, "a", { slot: 4, angle: 0 });
    expect(t.p.meditating).toBe(true);
  });

  it("hồi chiêu: trong thời gian chờ im lặng không tốn gì; hết thì dùng lại được", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen");
    cast(t.w, "a", { slot: 2, angle: 0 });
    const mp = t.p.mp;
    const nFx = t.fx.length;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.p.mp).toBe(mp);
    expect(t.fx.length).toBe(nFx);
    t.w.now += skillCooldownMs(REAL("bon_thach_quyen"), 1, 0);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.fx.length).toBe(nFx + 1);
  });

  it("thiếu linh lực: báo, KHÔNG đặt hồi chiêu, không trừ linh lực", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen");
    const cost = skillMpCost(REAL("bon_thach_quyen"), t.p.maxMp);
    t.p.mp = cost - 1;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.toasts.at(-1)!.msg.text).toMatch(/Linh lực không đủ/);
    expect(t.p.mp).toBe(cost - 1);
    expect(t.c.skillCd[0]).toBe(0);
    expect(t.fx).toEqual([]);
    t.p.mp = cost; // đủ đúng bằng
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.fx).toHaveLength(1);
    expect(t.p.mp).toBe(0);
  });

  it("đang choáng, đã gục, hồn lìa xác, ở Hoàng Tuyền: không dùng được chiêu và không tốn gì", () => {
    for (const mode of ["stun", "dead", "ghost", "limbo"] as const) {
      const t = setup();
      equip(t.c, 2, "bon_thach_quyen");
      if (mode === "stun") t.c.stunned = true;
      if (mode === "dead") t.p.dead = true;
      if (mode === "ghost") t.w.ghosts.add("a");
      if (mode === "limbo") t.c.limbo = {} as never;
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.fx, mode).toEqual([]);
      expect(t.p.mp, mode).toBe(t.p.maxMp);
      expect(t.c.skillCd[0], mode).toBe(0);
    }
  });

  it("giới hạn tần suất của tin `cast` đã đăng ký", () => {
    expect(MESSAGE_LIMITS[SKILL_MSG.cast]).toEqual({ perSec: 10, burst: 10 });
  });
});

describe("cast: sát thương lên quái", () => {
  it("chỉ quái trong cung / tầm bị đánh; sát thương = atk x mult x tầng, ghi công cho người đánh", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen", 3); // cone 80, arc 90°, mult 1,9
    vi.spyOn(Math, "random").mockReturnValue(0.5); // không bạo kích, dao động 1,0
    const near = addMonster(t.w, "mang", t.p.x + 40, t.p.y);
    const behind = addMonster(t.w, "mang", t.p.x - 40, t.p.y);
    const far = addMonster(t.w, "mang", t.p.x + 300, t.p.y);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const atk = statsFor(t.p.realm, t.p.tier, t.p, t.c.mult).atk;
    const want = Math.round(atk * REAL("bon_thach_quyen").mult * skillDamageMult(3));
    expect(dmgOf(t, near.id)).toEqual([want]);
    expect(near.m.hp).toBe(near.m.maxHp - want);
    expect(near.mc.damageBy.get("a")).toBe(want);
    expect(near.mc.target).toBe("a"); // đòn thường kéo quái nhắm vào người đánh
    expect(dmgOf(t, behind.id)).toEqual([]);
    expect(dmgOf(t, far.id)).toEqual([]);
  });

  it("hệ khắc / bị khắc nhân sát thương theo `elementMult` của hệ chiêu và hệ quái", () => {
    const t = setup();
    equip(t.c, 2, "bon_thach_quyen"); // hệ thổ
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const results: Record<string, number> = {};
    for (const el of ELEMENTS) {
      const mon = addMonster(t.w, "mang", t.p.x + 40, t.p.y);
      mon.mc.def = { ...mon.mc.def, element: el.id };
      t.w.now += 10_000;
      t.p.mp = t.p.maxMp;
      cast(t.w, "a", { slot: 2, angle: 0 });
      results[el.id] = dmgOf(t, mon.id)[0];
      t.w.state.monsters.delete(mon.id);
      t.w.mctrl.delete(mon.id);
    }
    const atk = statsFor(t.p.realm, t.p.tier, t.p, t.c.mult).atk;
    const mult = REAL("bon_thach_quyen").mult;
    const mults = new Set<number>();
    for (const el of ELEMENTS) {
      const em = elementMult("tho", el.id);
      mults.add(em);
      expect(results[el.id], el.id).toBe(Math.round(atk * mult * em));
    }
    expect(mults.size).toBeGreaterThan(1); // có cả khắc và bị khắc, không phải toàn 1
  });

  it("fan: quái sát người bị cả 5 tia; quái xa trục chỉ một tia", () => {
    const t = setup();
    equip(t.c, 2, "lac_tuyet_phan_phi");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const close = addMonster(t.w, "mang", t.p.x + 20, t.p.y);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(dmgOf(t, close.id)).toHaveLength(5);
    const t2 = setup();
    equip(t2.c, 2, "lac_tuyet_phan_phi");
    const mid = addMonster(t2.w, "mang", t2.p.x + 100, t2.p.y);
    cast(t2.w, "a", { slot: 2, angle: 0 });
    expect(dmgOf(t2, mid.id)).toHaveLength(1);
  });

  it("hạ quái bằng chiêu: quái bị xoá, người đánh nhận tu vi, các quái khác trong vùng vẫn bị đánh", () => {
    const t = setup();
    equip(t.c, 2, "hoa_van_kiem");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const weak = addMonster(t.w, "lang", t.p.x + 30, t.p.y);
    weak.m.hp = 1;
    const tank = addMonster(t.w, "mang", t.p.x + 40, t.p.y + 10);
    const exp0 = t.p.exp;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.w.state.monsters.has(weak.id)).toBe(false);
    expect(t.p.exp).toBeGreaterThan(exp0);
    expect(tank.m.hp).toBeLessThan(tank.m.maxHp);
  });
});

describe("cast: trạng thái", () => {
  it("trạng thái có hại lên kẻ trúng đòn (không lên quái ngoài vùng), sát thương theo giây = ratio x đòn đầu", () => {
    const t = setup();
    withSkill({
      id: "thu_doc",
      element: "moc",
      shape: "cone",
      range: 100,
      arc: 2,
      mult: 1,
      effects: [{ status: "poison", ms: 3000, ratio: 0.2, chance: 1 }],
    });
    equip(t.c, 2, "thu_doc");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const hit = addMonster(t.w, "mang", t.p.x + 40, t.p.y);
    const miss = addMonster(t.w, "mang", t.p.x - 40, t.p.y);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const first = dmgOf(t, hit.id)[0];
    expect(hit.mc.st!.list).toHaveLength(1);
    expect(hit.mc.st!.list[0]).toMatchObject({ id: "poison", src: "a" });
    expect(hit.mc.st!.list[0].dps).toBeCloseTo(0.2 * first, 9);
    expect(miss.mc.st).toBeUndefined();
    expect(t.c.st).toBeUndefined(); // không tự gắn trạng thái có hại lên mình
  });

  it("trạng thái có hại không gắn lên quái đã chết vì chính đòn đó", () => {
    const t = setup();
    withSkill({
      id: "thu_doc2",
      shape: "cone",
      range: 100,
      arc: 2,
      mult: 1,
      effects: [{ status: "burn", ms: 3000, ratio: 0.2, chance: 1 }],
    });
    equip(t.c, 2, "thu_doc2");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const weak = addMonster(t.w, "lang", t.p.x + 30, t.p.y);
    weak.m.hp = 1;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.w.state.monsters.has(weak.id)).toBe(false);
    expect(t.w.statusM.size).toBe(0);
  });

  it("chiêu tự hộ thể (Kim Chung Trảo): khiên lên chính mình, báo cho chủ, không đánh quái ở gần", () => {
    const t = setup();
    equip(t.c, 2, "kim_chung_trao");
    const mon = addMonster(t.w, "mang", t.p.x + 20, t.p.y);
    cast(t.w, "a", { slot: 2, angle: 0 });
    const shield = t.c.st!.list.find((s) => s.id === "shield")!;
    expect(shield.pool).toBe(Math.round(0.2 * t.p.maxHp));
    expect(t.statusMsgs.at(-1)!.msg.list[0][0]).toBe("shield");
    expect(dmgOf(t, mon.id)).toEqual([]);
    expect(t.fx[0]).toMatchObject({ kind: "cast", skill: "kim_chung_trao", range: 0 });
  });

  it("chiêu tăng tốc (Mê Tung Bộ): tăng tốc lên mình kèm ratio và NÉ đòn quái trong dodgeMs; hết né thì bị đánh", () => {
    const t = setup();
    equip(t.c, 2, "me_tung_bo");
    const mon = addMonster(t.w, "mang", t.p.x + 20, t.p.y);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.statusMsgs.at(-1)!.msg.list).toContainEqual(["haste", 3000, 0.35]);
    expect(t.c.moveMul).toBeCloseTo(1.35, 12);
    const hp = t.p.hp;
    hurtPlayer(t.w, "a", t.p, 50, mon.m);
    expect(t.p.hp).toBe(hp); // đang né
    t.w.now += REAL("me_tung_bo").dodgeMs! + 1;
    hurtPlayer(t.w, "a", t.p, 50, mon.m);
    expect(t.p.hp).toBe(hp - 50);
  });

  it("trạng thái có hại ghi trong chiêu tự dùng (hình `self`) bị bỏ qua, không gắn lên mình", () => {
    const t = setup();
    withSkill({
      id: "thu_tu_hai",
      shape: "self",
      range: 0,
      mult: 0,
      effects: [{ status: "burn", ms: 3000, ratio: 0.2, chance: 1 }],
    });
    equip(t.c, 2, "thu_tu_hai");
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.c.st).toBeUndefined();
    expect(t.fx).toHaveLength(1); // chiêu vẫn dùng (tốn linh lực, hồi chiêu)
  });
});

describe("cast: lao (dash)", () => {
  it("Phiêu Phong Bộ lao đúng `reach` theo hướng đánh ở chỗ trống, cập nhật vị trí công khai, né đòn", () => {
    const t = setup();
    equip(t.c, 2, "phieu_phong_bo");
    t.p.x = t.w.map.townPx.x;
    t.p.y = t.w.map.townPx.y;
    const [x0, y0] = [t.p.x, t.p.y];
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.p.x - x0).toBeCloseTo(150, 6);
    expect(t.p.y).toBeCloseTo(y0, 6);
    expect(t.p.px).toBe(Math.round(t.p.x));
    expect(t.c.dodgeUntil).toBe(t.w.now + 350);
    expect(t.fx[0]).toMatchObject({ kind: "cast", skill: "phieu_phong_bo", x: x0, range: 150 });
  });

  it("bị chặn (mép bản đồ): dừng trước vật cản, không xuyên, không ra ngoài bản đồ", () => {
    const t = setup();
    equip(t.c, 2, "phieu_phong_bo");
    t.p.x = 40;
    t.p.y = t.w.map.townPx.y;
    t.w.map.moveWithCollision(t.p.x, t.p.y, 0, 0, PLAYER_RADIUS);
    cast(t.w, "a", { slot: 2, angle: Math.PI });
    expect(t.p.x).toBeGreaterThanOrEqual(0);
    expect(40 - t.p.x).toBeLessThan(150);
    expect(t.p.x).toBeLessThanOrEqual(40);
  });

  it("chiêu lao có sát thương quét quái dọc đường lao (chiêu thử mult > 0)", () => {
    const t = setup();
    withSkill({ id: "thu_lao", shape: "dash", range: 0, reach: 150, mult: 1, effects: [] });
    equip(t.c, 2, "thu_lao");
    t.p.x = t.w.map.townPx.x;
    t.p.y = t.w.map.townPx.y;
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const onPath = addMonster(t.w, "mang", t.p.x + 80, t.p.y + 10);
    const offPath = addMonster(t.w, "mang", t.p.x + 80, t.p.y + 120);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(dmgOf(t, onPath.id)).toHaveLength(1);
    expect(dmgOf(t, offPath.id)).toEqual([]);
  });
});

describe("cast: thách đấu (PK)", () => {
  function duel() {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = t.p.x + 40;
    b.p.y = t.p.y;
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

  it("chiêu trúng đối thủ qua `duelHit`: trừ khí huyết, người ngoài trận không bị", () => {
    const t = duel();
    const bystander = addPlayer(t.w, "c", 4, 0);
    bystander.p.x = t.p.x + 30;
    bystander.p.y = t.p.y;
    equip(t.c, 2, "bon_thach_quyen");
    const hb = t.b.p.hp;
    const hc = bystander.p.hp;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.b.p.hp).toBeLessThan(hb);
    expect(bystander.p.hp).toBe(hc);
  });

  it("đang đếm ngược (chưa `fight`) chiêu không gây sát thương", () => {
    const t = setup();
    const b = addPlayer(t.w, "b", 4, 0);
    b.p.x = t.p.x + 40;
    b.p.y = t.p.y;
    t.w.duels._start({
      a: "a",
      b: "b",
      phase: "countdown",
      fightAt: Infinity,
      endsAt: Infinity,
      ox: 0,
      oy: 0,
    });
    equip(t.c, 2, "bon_thach_quyen");
    const hb = b.p.hp;
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(b.p.hp).toBe(hb);
  });

  it("trong PK: tê cóng gắn được lên đối thủ, CHOÁNG bị gỡ, trạng thái khác chưa nối", () => {
    const t = duel();
    withSkill({
      id: "thu_pk",
      shape: "cone",
      range: 100,
      arc: 2,
      mult: 1,
      effects: [
        { status: "chill", ms: 3000, ratio: 0.3, chance: 1 },
        { status: "stun", ms: 1000, ratio: 0, chance: 1 },
        { status: "burn", ms: 3000, ratio: 0.2, chance: 1 },
      ],
    });
    equip(t.c, 2, "thu_pk");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    cast(t.w, "a", { slot: 2, angle: 0 });
    expect(t.b.c.moveMul).toBeCloseTo(0.7, 12);
    expect(t.b.c.stunned).toBeUndefined();
    expect(t.b.c.st!.list.map((s) => s.id)).toEqual(["chill"]);
  });
});
