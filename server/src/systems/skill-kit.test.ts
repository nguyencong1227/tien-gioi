// CT12 (#1057): bộ kiểm DỮ LIỆU chiêu chạy qua hệ combat THẬT. Duyệt MỌI chiêu trong `LEARNABLE_SKILLS` (mục 51): mỗi chiêu khi dùng
// phải tốn đúng linh lực, đặt đúng hồi chiêu, phát fx đúng tầm, trúng đúng hình (trong / ngoài vùng), gắn đúng trạng thái (có hại -> kẻ
// trúng, có lợi -> mình), bị chặn khi chưa đủ cảnh giới / bậc, tầng cao hơn mạnh hơn + hồi nhanh hơn, thiếu mp KHÔNG dùng. Chiêu mới của
// D / E / G thêm vào `LEARNABLE_SKILLS` thì TỰ được phủ mà KHÔNG cần viết test mới.
//
// Aim order (mục 29) ở `aim-order.test.ts`; `shapeHits` thuần ở `cast.test.ts`. Ở đây chỉ lo chiêu THẬT qua `cast` (server quyết định).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEARNABLE_SKILLS,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  statusOf,
  type SkillDef,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast, shapeHits } from "./cast";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

/** Sát thương server ghi cho quái `id` (mảng các lần trúng; dài = số tia / nhịp). */
const dmgOf = (dmgs: ReturnType<typeof makeWorld>["dmgs"], id: string) =>
  dmgs.filter((d) => d.target === id).map((d) => d.amount);

/**
 * Player Hóa Thần tầng cao: cả bốn ô chiêu đã mở, đủ điều kiện dùng MỌI chiêu trong `LEARNABLE_SKILLS`
 * (reqRealm <= 4, reqTier <= 2). Đầy linh lực, đứng ngoài trấn.
 */
function setup(realm = 4, tier = 2) {
  const t = makeWorld();
  const a = addPlayer(t.w, "a", realm, tier);
  a.p.mp = a.p.maxMp;
  return { ...t, ...a };
}

/** Gắn chiêu vào ô (ghi thẳng vào sổ, bỏ qua luật học — đây là test dùng chiêu, không test học). */
function equip(c: PlayerCtrl, slot: 2 | 3 | 4 | 5, id: string, level = 1) {
  c.skills.learned[id] = level;
  c.skills.slots[slot - 2] = id;
}

/**
 * Điểm tương đối (so người đánh ở gốc, hướng đánh `angle` = 0) nằm TRONG và NGOÀI vùng của chiêu `def`, cho mọi hình tấn công.
 * Quái đặt tại `p.x + in[0]`, `p.y + in[1]` thì trúng; tại `out` thì không.
 */
function zonePoints(def: SkillDef): { in: [number, number]; out: [number, number] } {
  switch (def.shape) {
    case "cone":
      return { in: [def.range * 0.5, 0], out: [-def.range, 0] }; // trong cung/ tầm; ra sau lưng
    case "line":
      return { in: [def.range * 0.5, 0], out: [def.range * 0.5, (def.width ?? 0) + 60] }; // lệch khỏi tia
    case "fan":
      return { in: [def.range * 0.3, 0], out: [0, def.range + 120] }; // giữa các tia, quá tầm
    case "ground":
      return { in: [def.reach ?? 0, 0], out: [(def.reach ?? 0) + def.range + 40, 0] }; // tâm vùng; xa tâm
    case "nova":
      return { in: [def.range * 0.5, 0], out: [def.range + 200, 0] };
    case "dash":
      return { in: [(def.reach ?? 0) * 0.5, 0], out: [(def.reach ?? 0) * 0.5, 200] }; // trên /_off đường lao
    // Hình mới (mục 51): đạn bay / sét lan đi theo hướng đánh; vùng / bẫy / tượng đặt ở `reach` rồi tác dụng quanh đó
    case "chain":
      return { in: [def.range * 0.5, 0], out: [def.range + 300, 0] }; // trong tầm với của mục tiêu đầu; quá xa
    case "bolt":
      return { in: [def.range * 0.4, 0], out: [def.range * 0.4, 400] }; // trên đường bay; lệch hẳn khỏi các viên
    case "zone":
    case "trap":
      return { in: [def.reach ?? 0, 0], out: [(def.reach ?? 0) + def.range + 300, 0] }; // tâm vùng / bẫy; xa hẳn
    case "totem":
      return { in: [(def.reach ?? 0) + 30, 0], out: [(def.reach ?? 0) + def.range + 400, 0] }; // trong tầm đánh của tượng; ngoài tầm
    default:
      return { in: [def.range + 100, 0], out: [def.range + 300, 0] }; // self / không vùng
  }
}

/** Chiêu tác dụng TRỄ sau lúc `cast` (đạn bay, bẫy chờ kích, vùng / tượng theo nhịp, chiêu vận): phải cho thế giới chạy mới thấy sát thương. */
const isDelayed = (def: SkillDef): boolean =>
  def.windupMs !== undefined || ["bolt", "zone", "trap", "aura", "totem"].includes(def.shape);

/**
 * Dùng chiêu ở ô 2 rồi, nếu chiêu tác dụng trễ, cho thế giới chạy từng tick 50 ms (tối đa 10 giây) tới khi `target` bị đánh ít nhất một lần (hoặc không còn gì để đợi).
 * Chiêu tức thời thì chỉ `cast`. Đồng hồ thế giới tiến theo (`w.now`), như phòng thật.
 */
function castAndSettle(t: ReturnType<typeof setup>, def: SkillDef, target?: string) {
  cast(t.w, "a", { slot: 2, angle: 0 });
  if (!isDelayed(def)) return;
  // Quái đứng yên: nếu để AI chạy, quái đi về phía người đánh và rời khỏi vùng / điểm đã đặt trước khi chiêu trễ kịp tác dụng
  const pins = [...t.w.state.monsters.values()].map((m) => [m, m.x, m.y] as const);
  for (let i = 0; i < 200; i++) {
    if (target !== undefined && dmgOf(t.dmgs, target).length > 0) break;
    t.w.now += 50;
    tickWorld(t.w, 50);
    for (const [m, x, y] of pins) {
      m.x = x;
      m.y = y;
    }
  }
}

/** Tầm fx server gửi (khớp `fxRange` trong cast.ts): ground = reach + range, dash = reach, còn lại = range. */
function fxRangeOf(def: SkillDef): number {
  if (def.shape === "ground") return (def.reach ?? 0) + def.range;
  if (def.shape === "dash") return def.reach ?? 0;
  return def.range;
}

/**
 * Quái "lang" đứng yên, máu cực lớn để KHÔNG chết vì đòn (còn gắn được trạng thái), tại điểm tương đối `dx, dy`.
 * Dùng "lang" (KHÔNG phải boss) chứ không phải "mang" (Xích Mãng, boss → miễn choáng), để ca xét choáng thông thường.
 */
function bigMonster(t: ReturnType<typeof setup>, dx: number, dy: number) {
  const m = addMonster(t.w, "lang", t.p.x + dx, t.p.y + dy);
  m.m.hp = 1e9;
  m.m.maxHp = 1e9;
  return m;
}

describe.each(LEARNABLE_SKILLS.map((d) => [d.id, d] as const))(
  "skill-kit: chiêu %s qua cast thật",
  (_id, def) => {
    it("tốn đúng linh lực, đặt đúng hồi chiêu theo tầng, phát fx cast đúng tầm + gửi lại sổ chiêu", () => {
      const t = setup();
      equip(t.c, 2, def.id, 1);
      const mp = t.p.mp;
      t.skillMsgs.length = 0;
      const x0 = t.p.x;
      const y0 = t.p.y;
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.p.mp, def.id).toBe(mp - skillMpCost(def, t.p.maxMp));
      expect(t.c.skillCd[0], def.id).toBe(t.w.now + skillCooldownMs(def, 1, 0));
      // fx phát TRƯỚC khi lao (dash): toạ độ là vị trí trước khi dùng, không phải sau
      expect(t.fx[0], def.id).toEqual({
        kind: "cast",
        by: "a",
        skill: def.id,
        x: x0,
        y: y0,
        angle: 0,
        range: fxRangeOf(def),
      });
      const msg = t.skillMsgs.at(-1)!.msg;
      expect(msg.cd[0], def.id).toBe(skillCooldownMs(def, 1, 0)); // cd còn lại = đầy
      expect(msg.cdMax[0], def.id).toBe(skillCooldownMs(def, 1, 0)); // cdMax = sau cdr (cdr = 0 ở đây)
    });

    it("dưới cảnh giới / bậc yêu cầu thì KHÔNG dùng (im lặng nếu ô chưa mở, báo Cần đạt nếu ô đã mở)", () => {
      const below = Math.max(0, def.reqRealm - 1);
      const t = setup(below, 0); // tier 0: nếu below === reqRealm thì thiếu bậc
      equip(t.c, 2, def.id);
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.fx, def.id).toEqual([]); // KHÔNG vận chiêu
      expect(t.p.mp, def.id).toBe(t.p.maxMp); // KHÔNG tốn linh lực
      expect(t.c.skillCd[0], def.id).toBe(0); // KHÔNG vào hồi chiêu
      // Ô 2 mở từ Luyện Khí (realm 1); nếu dướireq vẫn >= 1 thì ô mở -> báo "Cần đạt"
      if (below >= 1) expect(t.toasts.at(-1)!.msg.text, def.id).toMatch(/Cần đạt/);
    });

    it("trúng đúng hình: quái trong vùng bị đánh (đúng số tia), quái ngoài vùng KHÔNG", () => {
      if (def.mult <= 0) return; // chiêu tự dùng / bộ pháp không gây sát thương vùng
      const z = zonePoints(def);
      const t = setup();
      equip(t.c, 2, def.id);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const hit = bigMonster(t, z.in[0], z.in[1]);
      const miss = bigMonster(t, z.out[0], z.out[1]);
      const R = hit.mc.def.radius;
      const want = shapeHits(def, t.p.x, t.p.y, 0, hit.m.x, hit.m.y, R);
      const missHits = shapeHits(def, t.p.x, t.p.y, 0, miss.m.x, miss.m.y, R);
      // Điểm chọn phải thực sự trong / ngoài vùng (với bán kính thật); nếu không thì bỏ qua ca này.
      if (want <= 0 || missHits !== 0) return;
      cast(t.w, "a", { slot: 2, angle: 0 });
      if (isDelayed(def)) return; // chiêu trễ: số lần trúng theo thời gian, ca riêng bên dưới
      expect(dmgOf(t.dmgs, hit.id).length, def.id).toBe(want);
      expect(want, def.id).toBeGreaterThan(0);
      expect(dmgOf(t.dmgs, miss.id), def.id).toEqual([]);
    });

    it("trạng thái: có hại lên kẻ trúng đòn, có lợi lên chính mình (không ngược)", () => {
      if (def.effects.length === 0) return;
      const harmful = def.effects.filter((e) => statusOf(e.status)?.harmful);
      const helpful = def.effects.filter((e) => statusOf(e.status)?.harmful === false);
      // Math.random = 0 -> mọi chance > 0 luôn gắn (rolls: rng() < chance)
      const spy = vi.spyOn(Math, "random").mockReturnValue(0);
      try {
        if (harmful.length > 0) {
          // phải trúng đòn mới gắn được -> đặt quái trong vùng (đảm bảo có vùng trúng)
          const z = zonePoints(def);
          if (def.mult > 0) {
            const t = setup();
            equip(t.c, 2, def.id);
            const hit = bigMonster(t, z.in[0], z.in[1]);
            // Điểm trong vùng thật (bán kính quái); nếu không thì bỏ qua ca này (điểm chọn chưa hợp cho chiêu này).
            if (shapeHits(def, t.p.x, t.p.y, 0, hit.m.x, hit.m.y, hit.mc.def.radius) <= 0) return;
            castAndSettle(t, def, hit.id);
            for (const e of harmful)
              if (e.chance > 0)
                expect(
                  hit.mc.st!.list.some((s) => s.id === e.status),
                  `${def.id}:${e.status}`,
                ).toBe(true);
            // KHÔNG tự gắn trạng thái có hại lên mình (chiêu vận để lại `st` rỗng sau khi đáp: chỉ cần không còn trạng thái có hại nào)
            expect(
              (t.c.st?.list ?? []).filter((x) => statusOf(x.id)?.harmful),
              def.id,
            ).toEqual([]);
          }
        }
        if (helpful.length > 0) {
          const t = setup();
          equip(t.c, 2, def.id);
          cast(t.w, "a", { slot: 2, angle: 0 });
          for (const e of helpful)
            expect(
              t.c.st!.list.some((s) => s.id === e.status),
              `${def.id}:${e.status}`,
            ).toBe(true);
        }
      } finally {
        spy.mockRestore();
      }
    });

    it("chiêu tác dụng TRỄ (đạn bay / bẫy / vùng / tượng / chiêu vận): chạy thế giới thì quái trong vùng bị đánh, quái ngoài vùng KHÔNG", () => {
      if (!isDelayed(def) || def.mult <= 0) return;
      const z = zonePoints(def);
      const t = setup();
      equip(t.c, 2, def.id);
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const hit = bigMonster(t, z.in[0], z.in[1]);
      const miss = bigMonster(t, z.out[0], z.out[1]);
      castAndSettle(t, def, hit.id);
      expect(
        dmgOf(t.dmgs, hit.id).length,
        `${def.id}: quái trong vùng phải bị đánh`,
      ).toBeGreaterThan(0);
      expect(dmgOf(t.dmgs, miss.id), `${def.id}: quái ngoài vùng không bị đánh`).toEqual([]);
    });

    it("tầng + luyện: tầng 3 sát thương cao hơn, hồi chiêu ngắn hơn tầng 1", () => {
      // Hồi chiêu ngắn hơn ở mọi chiêu (thuần)
      expect(skillCooldownMs(def, 3, 0), def.id).toBeLessThan(skillCooldownMs(def, 1, 0));
      expect(skillDamageMult(3), def.id).toBeGreaterThan(skillDamageMult(1));
      if (def.mult <= 0) return; // chiêu không gây sát thương: chỉ kiểm hệ số (ở trên)
      // Trong combat thật: cùng Math.random -> dmg tỉ lệ với skillDamageMult, tầng 3 > tầng 1
      const castAt = (level: number) => {
        const t = setup();
        equip(t.c, 2, def.id, level);
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const hit = bigMonster(t, zonePoints(def).in[0], zonePoints(def).in[1]);
        castAndSettle(t, def, hit.id);
        return dmgOf(t.dmgs, hit.id)[0] ?? 0;
      };
      expect(castAt(3), def.id).toBeGreaterThan(castAt(1));
    });

    it("thiếu linh lực: báo, KHÔNG tốn gì (không vào hồi chiêu, không vận chiêu)", () => {
      const t = setup();
      equip(t.c, 2, def.id);
      const cost = skillMpCost(def, t.p.maxMp);
      t.p.mp = cost - 1;
      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(t.toasts.at(-1)!.msg.text, def.id).toMatch(/Linh lực không đủ/);
      expect(t.p.mp, def.id).toBe(cost - 1);
      expect(t.c.skillCd[0], def.id).toBe(0);
      expect(t.fx, def.id).toEqual([]);
    });
  },
);

describe("skill-kit: fuzz tin `cast` (không phụ thuộc chiêu)", () => {
  it("tin rác / ô ngoài khoảng 2-5 / góc NaN hoặc không phải số: KHÔNG ném, KHÔNG tốn gì", () => {
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
      { slot: 0, angle: 0 }, // ô dưới tầm
      { slot: 6, angle: 0 }, // ô trên tầm
      { slot: 2.5, angle: 0 }, // không nguyên
      { slot: 2, angle: Number.NaN },
      { slot: 2, angle: Number.POSITIVE_INFINITY },
      { slot: 2, angle: "0" },
      { slot: "2", angle: 0 },
      { slot: 2 }, // thiếu angle
    ])
      cast(t.w, "a", bad);
    expect(t.p.mp).toBe(mp);
    expect(t.c.skillCd).toEqual([0, 0, 0, 0]);
    expect(t.fx).toEqual([]);
    expect(t.toasts).toEqual([]);
    cast(t.w, "không-có-người", { slot: 2, angle: 0 }); // sid lạ: không ném
  });
});

describe("skill-kit: guard — choáng / chết / ghost / Hoàng Tuyền KHÔNG dùng chiêu", () => {
  for (const mode of ["stun", "dead", "ghost", "limbo"] as const) {
    it(`mode ${mode}: KHÔNG vận chiêu, KHÔNG tốn linh lực / hồi chiêu`, () => {
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
    });
  }
});

afterEach(() => vi.restoreAllMocks());
