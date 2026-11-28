// CT12 (#1057): bộ kiểm DỮ LIỆU chiêu chạy qua hệ combat THẬT. Duyệt MỌI chiêu trong `LEARNABLE_SKILLS` (mục 51): mỗi chiêu khi dùng
// phải tốn đúng linh lực, đặt đúng hồi chiêu, phát fx đúng tầm, trúng đúng hình (trong / ngoài vùng), gắn đúng trạng thái (có hại -> kẻ
// trúng, có lợi -> mình), bị chặn khi chưa đủ cảnh giới / bậc, tầng cao hơn mạnh hơn + hồi nhanh hơn, thiếu mp KHÔNG dùng. Chiêu mới của
// D / E / G thêm vào `LEARNABLE_SKILLS` thì TỰ được phủ mà KHÔNG cần viết test mới.
//
// Aim order (mục 29) ở `aim-order.test.ts`; `shapeHits` thuần ở `cast.test.ts`. Ở đây chỉ lo chiêu THẬT qua `cast` (server quyết định).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEARNABLE_SKILLS,
  SKILL_BY_ID,
  skillCooldownMs,
  skillDamageMult,
  skillMpCost,
  statusOf,
  type FxMsg,
  type SkillDef,
} from "@tien-gioi/shared";
import type { PlayerCtrl } from "../world";
import { cast, shapeHits } from "./cast";
import { planBolt, type PTarget } from "./pbolt";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

/** Sát thương server ghi cho quái `id` (mảng các lần trúng; dài = số tia / nhịp). */
const dmgOf = (dmgs: ReturnType<typeof makeWorld>["dmgs"], id: string) =>
  dmgs.filter((d) => d.target === id).map((d) => d.amount);

/**
 * Player Hóa Thần (bậc 5, chiêu Hóa Thần của D1 #1466 lát C cần `reqRealm` 5) tầng cao: cả bốn ô chiêu đã mở, đủ điều kiện dùng MỌI chiêu trong `LEARNABLE_SKILLS`
 * (reqRealm <= 5, reqTier <= 2). Đầy linh lực, đứng ngoài trấn.
 */
function setup(realm = 5, tier = 2) {
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

let testedHitShapesCount = 0;

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

      if (def.shape === "bolt") {
        // Nhánh đạn hẹn giờ (CT3 #1108): đạn bay theo tốc độ, trúng quái trên đường bay, xuyên/nảy theo dữ liệu chiêu
        const speed = Math.max(1, def.speed ?? 500);
        const range = def.range;
        const pierce = Math.max(0, Math.floor(def.pierce ?? 0));
        const bounce = Math.max(0, Math.floor(def.bounce ?? 0));
        const count = Math.max(1, Math.floor(def.count ?? 1));
        const spread = Math.max(0, def.arc ?? 0);

        // Đặt quái trên đường bay chính (angle = 0): m1 gần, m2 sau m1 (cho xuyên)
        const d1 = Math.min(80, range * 0.3);
        const d2 = Math.min(160, range * 0.6);
        const m1 = bigMonster(t, d1, 0);
        const m2 = bigMonster(t, d2, 0);
        // Quái miss lệch xa hẳn khỏi đường bay
        const miss = bigMonster(t, z.out[0], z.out[1]);

        // Nếu chiêu có nảy (bounce > 0): đặt m3 trong bán kính nảy từ m2
        const testMonsters = [m1, m2, miss];
        let m3: ReturnType<typeof bigMonster> | undefined;
        if (bounce > 0) {
          m3 = bigMonster(t, d2, 60);
          testMonsters.push(m3);
        }

        // Đối chiếu với quy hoạch thuần planBolt (không chép công thức)
        const targets: PTarget[] = testMonsters.map((tm) => ({
          id: tm.id,
          x: tm.m.x,
          y: tm.m.y,
          r: tm.mc.def.radius,
        }));
        const expectedHits: Record<string, number> = {};
        const expectedLegs: { x: number; y: number; angle: number; ms: number }[] = [];

        for (let i = 0; i < count; i++) {
          const a = count === 1 ? 0 : 0 - spread / 2 + (spread * i) / (count - 1);
          const plan = planBolt({
            x: t.p.x,
            y: t.p.y,
            angle: a,
            speed,
            range,
            pierce,
            bounce,
            targets,
            blocked: (x, y) => t.w.map.isBlockedPx(x, y),
          });
          for (const h of plan.hits) expectedHits[h.id] = (expectedHits[h.id] ?? 0) + 1;
          for (const l of plan.legs) {
            expectedLegs.push({
              x: l.x,
              y: l.y,
              angle: l.angle,
              ms: Math.round((l.dist / speed) * 1000),
            });
          }
        }

        cast(t.w, "a", { slot: 2, angle: 0 });

        // Chờ vận chiêu xong nếu có windupMs và cho đạn bay hết qua tickWorld (tối đa 200 tick)
        const pins = testMonsters.map((tm) => [tm.m, tm.m.x, tm.m.y] as const);
        for (let step = 0; step < 200 && t.c.windup !== undefined; step++) {
          t.w.now += 50;
          tickWorld(t.w, 50);
          for (const [m, x, y] of pins) {
            m.x = x;
            m.y = y;
          }
        }
        for (let step = 0; step < 200; step++) {
          if (t.w.pbolts.length === 0) break;
          t.w.now += 50;
          tickWorld(t.w, 50);
          for (const [m, x, y] of pins) {
            m.x = x;
            m.y = y;
          }
        }

        expect(t.w.pbolts.length, `${def.id}: đạn phải bay xong`).toBe(0);
        // Quái ngoài đường không bị đánh
        expect(dmgOf(t.dmgs, miss.id), `${def.id}: quái ngoài đường không bị đánh`).toEqual([]);
        // Khớp số lần trúng của m1
        expect(dmgOf(t.dmgs, m1.id).length, `${def.id}: m1 hits`).toBe(expectedHits[m1.id] ?? 0);
        expect(
          expectedHits[m1.id] ?? 0,
          `${def.id}: m1 phải trúng ít nhất một viên`,
        ).toBeGreaterThan(0);

        // Khớp số lần trúng của m2 (xuyên)
        expect(dmgOf(t.dmgs, m2.id).length, `${def.id}: m2 hits`).toBe(expectedHits[m2.id] ?? 0);
        if (pierce > 0) {
          expect(
            dmgOf(t.dmgs, m2.id).length,
            `${def.id}: m2 phải trúng nhờ pierce`,
          ).toBeGreaterThan(0);
        } else {
          expect(dmgOf(t.dmgs, m2.id), `${def.id}: m2 không trúng khi không có pierce`).toEqual([]);
        }

        // Khớp số lần trúng của m3 (nảy) nếu có
        if (m3) {
          expect(dmgOf(t.dmgs, m3.id).length, `${def.id}: m3 hits`).toBe(expectedHits[m3.id] ?? 0);
          if (bounce > 0) {
            expect(
              dmgOf(t.dmgs, m3.id).length,
              `${def.id}: m3 phải trúng nhờ bounce`,
            ).toBeGreaterThan(0);
          }
        }

        // fx pbolt có đúng số đoạn và ms đúng
        const pboltFxs = t.fx.filter((f) => f.kind === "pbolt") as Array<
          Extract<FxMsg, { kind: "pbolt" }>
        >;
        expect(pboltFxs.length, `${def.id}: số đoạn fx pbolt`).toBe(expectedLegs.length);
        for (let k = 0; k < expectedLegs.length; k++) {
          expect(pboltFxs[k].ms, `${def.id}: fx pbolt leg ${k} ms`).toBe(expectedLegs[k].ms);
        }

        testedHitShapesCount++;
        return;
      }

      if (def.shape === "chain") {
        // Sét lan (mục 51): đánh mục tiêu đầu trong tầm với, nảy sang các quái khác (dùng castAndSettle để windupMs không đỏ giả)
        const hit = bigMonster(t, z.in[0], z.in[1]);
        const miss = bigMonster(t, z.out[0], z.out[1]);
        castAndSettle(t, def, hit.id);
        expect(dmgOf(t.dmgs, hit.id).length, `${def.id}: quái trong tầm bị đánh`).toBeGreaterThan(
          0,
        );
        expect(dmgOf(t.dmgs, miss.id), `${def.id}: quái ngoài tầm không bị đánh`).toEqual([]);
        testedHitShapesCount++;
        return;
      }

      if (isDelayed(def)) {
        // Chiêu trễ (zone / trap / aura / totem / windupMs)
        const hit = bigMonster(t, z.in[0], z.in[1]);
        const miss = bigMonster(t, z.out[0], z.out[1]);
        castAndSettle(t, def, hit.id);
        expect(
          dmgOf(t.dmgs, hit.id).length,
          `${def.id}: quái trong vùng phải bị đánh`,
        ).toBeGreaterThan(0);
        expect(dmgOf(t.dmgs, miss.id), `${def.id}: quái ngoài vùng không bị đánh`).toEqual([]);
        testedHitShapesCount++;
        return;
      }

      // Chiêu tức thời thông thường (cone, line, fan, nova, ground)
      const hit = bigMonster(t, z.in[0], z.in[1]);
      const miss = bigMonster(t, z.out[0], z.out[1]);
      const R = hit.mc.def.radius;
      const want = shapeHits(def, t.p.x, t.p.y, 0, hit.m.x, hit.m.y, R);
      const missHits = shapeHits(def, t.p.x, t.p.y, 0, miss.m.x, miss.m.y, R);

      // Điểm chọn phải thực sự trúng trong vùng và quái miss phải ngoài vùng: KHÔNG return âm thầm
      expect(want, `${def.id}: điểm in (${z.in}) phải trúng ít nhất một tia`).toBeGreaterThan(0);
      expect(missHits, `${def.id}: điểm out (${z.out}) phải nằm ngoài vùng`).toBe(0);

      cast(t.w, "a", { slot: 2, angle: 0 });
      expect(dmgOf(t.dmgs, hit.id).length, def.id).toBe(want);
      expect(dmgOf(t.dmgs, miss.id), def.id).toEqual([]);
      testedHitShapesCount++;
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
            castAndSettle(t, def, hit.id);
            // KHÔNG return âm thầm: quái phải thực sự bị trúng đòn để nhận trạng thái
            expect(
              dmgOf(t.dmgs, hit.id).length,
              `${def.id}: quái phải trúng đòn để nhận trạng thái có hại`,
            ).toBeGreaterThan(0);
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

describe("skill-kit: bao phủ kiểm tra hình", () => {
  it("toàn bộ chiêu có mult > 0 đều được kiểm tra hình trúng thực sự (không pass rỗng)", () => {
    const required = LEARNABLE_SKILLS.filter((s) => s.mult > 0).length;
    expect(testedHitShapesCount).toBeGreaterThanOrEqual(required);
  });
});

describe("skill-kit: ca riêng cho bolt (đạn hẹn giờ)", () => {
  it("quy hoạch và thực thi qua cast thật: count toả arc, pierce xuyên, bounce nảy, fx pbolt đúng ms", () => {
    const boltDef: SkillDef = {
      ...SKILL_BY_ID["bon_thach_quyen"]!,
      id: "test_bolt_bounce_pierce",
      name: "Đạn Thử Nghiệm",
      shape: "bolt",
      fx: "bolt",
      speed: 500,
      range: 600,
      width: 16,
      count: 1,
      pierce: 1,
      bounce: 1,
      mult: 1.5,
      effects: [],
    };
    (SKILL_BY_ID as Record<string, SkillDef>)[boltDef.id] = boltDef;
    try {
      const t = setup();
      equip(t.c, 2, boltDef.id);
      // q1 trên đường bay (x = 100)
      const q1 = bigMonster(t, 100, 0);
      // q2 sau q1 trên đường bay (x = 200, nhận xuyên pierce)
      const q2 = bigMonster(t, 200, 0);
      // q3 gần q2 (x = 200, y = 60; cách q2 60 px <= PBOLT_BOUNCE_RADIUS 160 px, nhận nảy bounce)
      const q3 = bigMonster(t, 200, 60);
      // q_miss ngoài tầm
      const q_miss = bigMonster(t, 100, 400);

      const speed = boltDef.speed ?? 500;
      const targets: PTarget[] = [q1, q2, q3, q_miss].map((m) => ({
        id: m.id,
        x: m.m.x,
        y: m.m.y,
        r: m.mc.def.radius,
      }));
      const plan = planBolt({
        x: t.p.x,
        y: t.p.y,
        angle: 0,
        speed,
        range: boltDef.range,
        pierce: 1,
        bounce: 1,
        targets,
        blocked: (x, y) => t.w.map.isBlockedPx(x, y),
      });

      cast(t.w, "a", { slot: 2, angle: 0 });

      // Trôi w.now + tickPBolts qua tickWorld (chờ windupMs xong nếu có)
      const pins = [q1, q2, q3, q_miss].map((tm) => [tm.m, tm.m.x, tm.m.y] as const);
      for (let i = 0; i < 200 && t.c.windup !== undefined; i++) {
        t.w.now += 50;
        tickWorld(t.w, 50);
        for (const [m, x, y] of pins) {
          m.x = x;
          m.y = y;
        }
      }
      for (let i = 0; i < 200; i++) {
        if (t.w.pbolts.length === 0) break;
        t.w.now += 50;
        tickWorld(t.w, 50);
        for (const [m, x, y] of pins) {
          m.x = x;
          m.y = y;
        }
      }

      expect(t.w.pbolts.length).toBe(0);
      // Quái ngoài đường không bị đánh
      expect(dmgOf(t.dmgs, q_miss.id)).toEqual([]);
      // q1 bị trúng 1 lần
      expect(dmgOf(t.dmgs, q1.id).length).toBe(1);
      // q2 bị trúng 1 lần (nhờ xuyên pierce = 1)
      expect(dmgOf(t.dmgs, q2.id).length).toBe(1);
      // q3 bị trúng 1 lần (nhờ nảy bounce = 1)
      expect(dmgOf(t.dmgs, q3.id).length).toBe(1);

      // Khớp số lần trúng từ planBolt thuần
      for (const m of [q1, q2, q3, q_miss]) {
        const expectedCount = plan.hits.filter((h) => h.id === m.id).length;
        expect(dmgOf(t.dmgs, m.id).length).toBe(expectedCount);
      }

      // fx pbolt có đúng 2 đoạn (đoạn 1 tới q2, đoạn 2 nảy sang q3)
      const pboltFxs = t.fx.filter((f) => f.kind === "pbolt") as Array<
        Extract<FxMsg, { kind: "pbolt" }>
      >;
      expect(pboltFxs.length).toBe(plan.legs.length);
      for (let k = 0; k < plan.legs.length; k++) {
        const leg = plan.legs[k];
        expect(pboltFxs[k].ms).toBe(Math.round((leg.dist / speed) * 1000));
        expect(pboltFxs[k].x).toBeCloseTo(leg.x, 0);
        expect(pboltFxs[k].y).toBeCloseTo(leg.y, 0);
      }
    } finally {
      delete (SKILL_BY_ID as Record<string, SkillDef>)[boltDef.id];
    }
  });
});

afterEach(() => vi.restoreAllMocks());
