// Luật kiểm DỮ LIỆU chiêu thức (mục 51, docs/PHAN_CONG_CHIEU_THUC.md mục 3 / 9, issue CT1 #1046): D / E / G / F dùng; `skills.test.ts` gọi với `LEARNABLE_SKILLS`.
// Trả danh sách lỗi (rỗng = hợp lệ), cùng khuôn `bossViolations`. Khung sát thương theo cảnh giới (`SKILL_MULT_CAP`) TẠM đặt rộng: CT10 (D, #1055) mô phỏng rồi chốt lại.
import { REALMS } from "./realms";
import {
  ELEMENT_BY_ID,
  MAX_STATUSES,
  SKILL_LIMITS,
  WINDUP_MAX_MS,
  LEARNABLE_SKILLS,
  SKILL_FX_IDS,
  SKILL_SHAPES,
  STATUS_BY_ID,
  type SkillDef,
} from "./skills";
import { SKILL_GRADES, SKILL_STYLES } from "./skill-kit";

const L = SKILL_LIMITS;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Khung sát thương theo cảnh giới yêu cầu (`reqRealm`): `hit` = `mult` tối đa MỘT lần trúng; `total` = `mult` x số lần trúng tối đa của một lần dùng (fan: `count` tia).
 * Không chiêu nào áp đảo cả cảnh giới. Cao nhất hiện có: Luyện Khí 1,9 / Trúc Cơ 1,5 (fan 3,5) / Nguyên Anh 2,6 (fan 4,25). TẠM, CT10 chốt.
 * Hóa Thần (5) -> Độ Kiếp (9) thêm ở A1 #1461 (mục 75, `docs/KHUNG_HOA_THAN.md` mục 5): người chơi đã mạnh thêm x1,75 mỗi cảnh giới nên hệ số chiêu chỉ nhích chậm (hit +0,3 / +0,3 / +0,2 / +0,2 / +0,2,
 * total +1 mỗi cảnh giới); DPS thật vẫn do `skills-dps.test.ts` canh. Có đủ khoá cho MỌI cảnh giới của `REALMS` (test giữ): chiêu `reqRealm` ngoài bảng này bị `skillViolations` bắt.
 */
export const SKILL_MULT_CAP: Readonly<Record<number, { hit: number; total: number }>> = {
  0: { hit: 1.5, total: 2 },
  1: { hit: 2.2, total: 2.6 },
  2: { hit: 2.8, total: 4 },
  3: { hit: 3.4, total: 5 },
  4: { hit: 3.8, total: 6 },
  5: { hit: 4.1, total: 7 },
  6: { hit: 4.4, total: 8 },
  7: { hit: 4.6, total: 9 },
  8: { hit: 4.8, total: 10 },
  9: { hit: 5.0, total: 11 },
};

/** Cảnh giới cao nhất có khung sát thương (= cảnh giới cuối của `REALMS`, test giữ). */
const MAX_REQ_REALM = Math.max(...Object.keys(SKILL_MULT_CAP).map(Number));

/** Phẩm cấp <-> độ hiếm (mục 6 của PHAN_CONG_CHIEU_THUC): Hoàng 0-1, Huyền 1-2, Địa 2-3, Thiên 3-4. */
const GRADE_RARITY: Readonly<Record<number, readonly [number, number]>> = {
  0: [0, 1],
  1: [1, 2],
  2: [2, 3],
  3: [3, 4],
};

/**
 * Số lần trúng TỐI ĐA của MỘT lần dùng lên MỘT mục tiêu đứng yên trong vùng (cận trên bảo thủ để so với `SKILL_MULT_CAP.total`): fan `count` tia; chain `1 + bounces`; bolt `count` viên x
 * `1 + pierce + bounce`; zone / aura / totem `floor(durationMs / tickMs)` nhịp; còn lại 1. Dữ liệu sai kiểu coi là 1.
 */
export function hitsOf(d: SkillDef): number {
  const n = (v: unknown, dflt: number): number => (isInt(v) && v >= 1 ? v : dflt);
  switch (d.shape) {
    case "fan":
      return n(d.count, 1);
    case "chain":
      return 1 + (isInt(d.bounces) && d.bounces > 0 ? d.bounces : 0);
    case "bolt":
      return (
        n(d.count, 1) *
        (1 +
          (isInt(d.pierce) && d.pierce > 0 ? d.pierce : 0) +
          (isInt(d.bounce) && d.bounce > 0 ? d.bounce : 0))
      );
    case "zone":
    case "aura":
    case "totem":
      return isInt(d.durationMs) && isInt(d.tickMs) && d.tickMs > 0
        ? Math.max(1, Math.floor(d.durationMs / d.tickMs))
        : 1;
    default:
      return 1;
  }
}

export function skillViolations(defs: readonly SkillDef[] = LEARNABLE_SKILLS): string[] {
  const bad: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const books = new Set<string>();
  for (const d of defs) {
    const at = `chiêu ${String(d.id)}`;
    if (typeof d.id !== "string" || !ID_RE.test(d.id)) bad.push(`${at}: id sai dạng`);
    else if (ids.has(d.id)) bad.push(`${at}: trùng id`);
    else ids.add(d.id);
    for (const [f, v, lo, hi, set] of [
      ["name", d.name, 2, 40, names],
      ["bookName", d.bookName, 2, 60, books],
    ] as const) {
      if (typeof v !== "string" || v.trim().length < lo || v.length > hi)
        bad.push(`${at}: ${f} phải ${lo}-${hi} ký tự`);
      else {
        if (CJK_RE.test(v)) bad.push(`${at}: ${f} có chữ Hán / chữ lạ`);
        const k = v.trim().toLowerCase();
        if (set.has(k)) bad.push(`${at}: ${f} "${v}" trùng chiêu khác`);
        set.add(k);
      }
    }
    if (typeof d.desc !== "string" || d.desc.length < 20 || d.desc.length > 600)
      bad.push(`${at}: desc phải 20-600 ký tự`);
    else if (CJK_RE.test(d.desc)) bad.push(`${at}: desc có chữ Hán / chữ lạ`);
    if (typeof d.element !== "string" || !hasOwn(ELEMENT_BY_ID, d.element))
      bad.push(`${at}: hệ ${String(d.element)} không có`);
    if (!SKILL_SHAPES.includes(d.shape)) bad.push(`${at}: hình ${String(d.shape)} không có`);
    if (!isInt(d.cooldown) || d.cooldown < 1000 || d.cooldown > 60_000)
      bad.push(`${at}: cooldown ${String(d.cooldown)} ngoài 1000-60000 ms`);
    if (!isNum(d.mpPct) || d.mpPct < 0 || d.mpPct > 0.5)
      bad.push(`${at}: mpPct ${String(d.mpPct)} ngoài 0-0,5`);
    if (!isNum(d.range) || d.range < 0 || d.range > 800)
      bad.push(`${at}: range ${String(d.range)} ngoài 0-800`);
    if (!isNum(d.mult) || d.mult < 0 || d.mult > 10)
      bad.push(`${at}: mult ${String(d.mult)} ngoài 0-10`);
    // Trường theo hình
    const need = (cond: boolean, msg: string) => {
      if (!cond) bad.push(`${at}: ${msg}`);
    };
    switch (d.shape) {
      case "cone":
        need(isNum(d.arc) && d.arc > 0 && d.arc <= Math.PI * 2, "cone cần arc trong (0, 2π]");
        need(d.range > 0, "cone cần range > 0");
        break;
      case "line":
        need(isNum(d.width) && d.width > 0, "line cần width > 0");
        need(d.range > 0, "line cần range > 0");
        break;
      case "fan":
        need(isInt(d.count) && d.count >= 2 && d.count <= 9, "fan cần count nguyên 2-9");
        need(isNum(d.arc) && d.arc > 0 && d.arc <= Math.PI * 2, "fan cần arc trong (0, 2π]");
        need(isNum(d.width) && d.width > 0, "fan cần width > 0");
        need(d.range > 0, "fan cần range > 0");
        break;
      case "nova":
        need(d.range > 0, "nova cần range > 0");
        break;
      case "ground":
        need(isNum(d.reach) && d.reach >= 0, "ground cần reach >= 0");
        need(d.range > 0, "ground cần range (bán kính) > 0");
        break;
      case "dash":
        need(isNum(d.reach) && d.reach > 0, "dash cần reach > 0");
        break;
      // ----- Hình mới (mục 51, CT1b) -----
      case "chain":
        need(d.range > 0, "chain cần range > 0");
        need(
          isInt(d.bounces) && d.bounces >= 0 && d.bounces <= L.chainBouncesMax,
          `chain cần bounces nguyên 0-${L.chainBouncesMax}`,
        );
        need(
          isNum(d.chainReach) && d.chainReach > 0 && d.chainReach <= L.chainReachMax,
          `chain cần chainReach trong (0, ${L.chainReachMax}]`,
        );
        need(
          d.falloff === undefined ||
            (isNum(d.falloff) && d.falloff >= L.chainFalloffMin && d.falloff <= 1),
          `chain: falloff trong ${L.chainFalloffMin}-1`,
        );
        break;
      case "bolt":
        need(
          isNum(d.range) && d.range > 0 && d.range <= L.boltRangeMax,
          `bolt cần range trong (0, ${L.boltRangeMax}]`,
        );
        need(
          isInt(d.count) && d.count >= 1 && d.count <= L.boltCountMax,
          `bolt cần count nguyên 1-${L.boltCountMax}`,
        );
        need(
          isNum(d.speed) && d.speed >= L.boltSpeedMin && d.speed <= L.boltSpeedMax,
          `bolt cần speed trong ${L.boltSpeedMin}-${L.boltSpeedMax}`,
        );
        need(isNum(d.width) && d.width > 0, "bolt cần width > 0");
        need(
          (d.count ?? 1) <= 1 || (isNum(d.arc) && d.arc > 0 && d.arc <= Math.PI * 2),
          "bolt nhiều viên cần arc trong (0, 2π]",
        );
        need(
          d.pierce === undefined ||
            (isInt(d.pierce) && d.pierce >= 0 && d.pierce <= L.boltPierceMax),
          `bolt: pierce nguyên 0-${L.boltPierceMax}`,
        );
        need(
          d.bounce === undefined ||
            (isInt(d.bounce) && d.bounce >= 0 && d.bounce <= L.boltBounceMax),
          `bolt: bounce nguyên 0-${L.boltBounceMax}`,
        );
        break;
      case "zone":
        need(isNum(d.reach) && d.reach >= 0, "zone cần reach >= 0");
        need(d.range > 0, "zone cần range (bán kính) > 0");
        need(
          isInt(d.durationMs) && d.durationMs > 0 && d.durationMs <= L.zoneDurationMax,
          `zone cần durationMs nguyên 1-${L.zoneDurationMax}`,
        );
        need(
          isInt(d.tickMs) && d.tickMs >= L.zoneTickMin && d.tickMs <= (d.durationMs ?? 0),
          `zone cần tickMs nguyên ${L.zoneTickMin}..durationMs`,
        );
        break;
      case "trap":
        need(isNum(d.reach) && d.reach >= 0, "trap cần reach >= 0");
        need(d.range > 0, "trap cần range (bán kính nổ) > 0");
        need(isInt(d.armMs) && d.armMs >= L.trapArmMin, `trap cần armMs nguyên >= ${L.trapArmMin}`);
        need(
          isInt(d.durationMs) && d.durationMs > (d.armMs ?? 0) && d.durationMs <= L.trapDurationMax,
          `trap cần durationMs nguyên trong (armMs, ${L.trapDurationMax}]`,
        );
        break;
      case "aura":
        need(d.range > 0, "aura cần range > 0");
        need(
          isInt(d.durationMs) && d.durationMs > 0 && d.durationMs <= L.auraDurationMax,
          `aura cần durationMs nguyên 1-${L.auraDurationMax}`,
        );
        need(
          isInt(d.tickMs) && d.tickMs >= L.auraTickMin && d.tickMs <= (d.durationMs ?? 0),
          `aura cần tickMs nguyên ${L.auraTickMin}..durationMs`,
        );
        break;
      case "totem":
        need(isNum(d.reach) && d.reach >= 0, "totem cần reach >= 0");
        need(d.range > 0, "totem cần range (tầm đánh) > 0");
        need(
          isInt(d.durationMs) && d.durationMs > 0 && d.durationMs <= L.totemDurationMax,
          `totem cần durationMs nguyên 1-${L.totemDurationMax}`,
        );
        need(
          isInt(d.tickMs) && d.tickMs >= L.totemTickMin && d.tickMs <= (d.durationMs ?? 0),
          `totem cần tickMs nguyên ${L.totemTickMin}..durationMs`,
        );
        break;
      default:
        break;
    }
    // Trường chỉ hợp với đúng hình (chặn dữ liệu nhập nhầm: trường thừa bị lờ đi ở máy chủ nên người nhập tưởng có tác dụng)
    const only = (fields: (keyof SkillDef)[], shapes: SkillDef["shape"][]) => {
      for (const f of fields)
        if (d[f] !== undefined && !shapes.includes(d.shape))
          bad.push(`${at}: ${String(f)} chỉ dùng cho hình ${shapes.join(" / ")}`);
    };
    only(["bounces", "chainReach", "falloff"], ["chain"]);
    only(["speed", "pierce", "bounce"], ["bolt"]);
    only(["armMs"], ["trap"]);
    only(["taunt"], ["totem"]);
    only(["durationMs"], ["zone", "trap", "aura", "totem"]);
    only(["tickMs"], ["zone", "aura", "totem"]);
    // Trường chung
    if (
      d.windupMs !== undefined &&
      (!isInt(d.windupMs) || d.windupMs < L.windupMin || d.windupMs > WINDUP_MAX_MS)
    )
      bad.push(`${at}: windupMs ${String(d.windupMs)} ngoài ${L.windupMin}-${WINDUP_MAX_MS}`);
    if (d.windupMs !== undefined && d.shape === "dash")
      bad.push(`${at}: chiêu vận không dùng cho dash`);
    if (d.displace !== undefined) {
      const x = d.displace;
      if (
        x === null ||
        typeof x !== "object" ||
        (x.dir !== "pull" && x.dir !== "push") ||
        !isNum(x.px) ||
        x.px < L.displaceMin ||
        x.px > L.displaceMax
      )
        bad.push(`${at}: displace cần dir pull / push và px ${L.displaceMin}-${L.displaceMax}`);
      if (d.shape === "self" || d.shape === "dash")
        bad.push(`${at}: displace không dùng cho hình ${d.shape}`);
    }
    if (d.combo !== undefined) {
      const c = d.combo;
      const needDef =
        c && typeof c.needs === "string" && hasOwn(STATUS_BY_ID, c.needs)
          ? STATUS_BY_ID[c.needs]
          : undefined;
      if (!needDef) bad.push(`${at}: combo.needs ${String(c?.needs)} không có`);
      else if (!needDef.harmful)
        bad.push(
          `${at}: combo.needs ${needDef.id} phải là trạng thái CÓ HẠI (đánh vào mục tiêu đang mang nó)`,
        );
      if (c && c.mult !== undefined && (!isNum(c.mult) || c.mult < 1 || c.mult > L.comboMultMax))
        bad.push(`${at}: combo.mult ngoài 1-${L.comboMultMax}`);
      if (c && c.consume !== undefined && typeof c.consume !== "boolean")
        bad.push(`${at}: combo.consume phải là boolean`);
      if (c && c.apply !== undefined) {
        const a = c.apply;
        const ad =
          a && typeof a.status === "string" && hasOwn(STATUS_BY_ID, a.status)
            ? STATUS_BY_ID[a.status]
            : undefined;
        if (!ad) bad.push(`${at}: combo.apply trạng thái ${String(a?.status)} không có`);
        else if (
          !isInt(a.ms) ||
          a.ms <= 0 ||
          a.ms > ad.maxMs ||
          !isNum(a.ratio) ||
          a.ratio < 0 ||
          a.ratio > ad.maxRatio ||
          !isNum(a.chance) ||
          a.chance < 0 ||
          a.chance > 1
        )
          bad.push(`${at}: combo.apply ${ad.id} ngoài trần`);
      }
      if (d.mult === 0) bad.push(`${at}: combo cần chiêu có sát thương (mult > 0)`);
    }
    if (
      d.ally !== undefined &&
      (d.ally === null ||
        typeof d.ally !== "object" ||
        !isNum(d.ally.range) ||
        d.ally.range <= 0 ||
        d.ally.range > L.allyRangeMax)
    )
      bad.push(`${at}: ally.range ngoài (0, ${L.allyRangeMax}]`);
    if (
      d.ally !== undefined &&
      !(d.effects ?? []).some((e) => STATUS_BY_ID[e.status] && !STATUS_BY_ID[e.status].harmful)
    )
      bad.push(`${at}: ally cần ít nhất một hiệu ứng CÓ LỢI để chia cho đồng đội`);
    if (d.dodgeMs !== undefined && (!isInt(d.dodgeMs) || d.dodgeMs < 0 || d.dodgeMs > 3000))
      bad.push(`${at}: dodgeMs ${String(d.dodgeMs)} ngoài 0-3000`);
    // Hiệu ứng
    if (!Array.isArray(d.effects) || d.effects.length > MAX_STATUSES)
      bad.push(`${at}: effects sai hoặc quá ${MAX_STATUSES}`);
    else
      for (const e of d.effects) {
        const def =
          typeof e.status === "string" && hasOwn(STATUS_BY_ID, e.status)
            ? STATUS_BY_ID[e.status]
            : undefined;
        if (!def) {
          bad.push(`${at}: trạng thái ${String(e.status)} không có`);
          continue;
        }
        if (!isInt(e.ms) || e.ms <= 0 || e.ms > def.maxMs)
          bad.push(`${at}: ${def.id} ms ${String(e.ms)} ngoài 1-${def.maxMs}`);
        if (!isNum(e.ratio) || e.ratio < 0 || e.ratio > def.maxRatio)
          bad.push(`${at}: ${def.id} ratio ${String(e.ratio)} ngoài 0-${def.maxRatio}`);
        if (!isNum(e.chance) || e.chance < 0 || e.chance > 1)
          bad.push(`${at}: ${def.id} chance ${String(e.chance)} ngoài 0-1`);
      }
    if (d.mult === 0 && (d.effects?.length ?? 0) === 0 && !d.dodgeMs)
      bad.push(`${at}: không có tác dụng (mult 0, không hiệu ứng, không né)`);
    // Cảnh giới / yêu cầu / độ hiếm / giá
    if (
      !isInt(d.reqRealm) ||
      d.reqRealm < 0 ||
      d.reqRealm > MAX_REQ_REALM ||
      !hasOwn(SKILL_MULT_CAP, String(d.reqRealm))
    )
      bad.push(`${at}: reqRealm ${String(d.reqRealm)} ngoài 0-${MAX_REQ_REALM}`);
    else {
      const tiers = REALMS[d.reqRealm]?.tiers.length ?? 0;
      if (!isInt(d.reqTier) || d.reqTier < 0 || d.reqTier >= tiers)
        bad.push(`${at}: reqTier ${String(d.reqTier)} ngoài 0-${tiers - 1}`);
      const cap = SKILL_MULT_CAP[d.reqRealm];
      if (isNum(d.mult) && d.mult > cap.hit)
        bad.push(`${at}: mult ${d.mult} vượt khung ${cap.hit} của cảnh giới ${d.reqRealm}`);
      const hits = hitsOf(d);
      if (isNum(d.mult) && d.mult * hits > cap.total + 1e-9)
        bad.push(
          `${at}: tổng mult ${Math.round(d.mult * hits * 100) / 100} (x${hits} lần trúng) vượt khung ${cap.total} của cảnh giới ${d.reqRealm}`,
        );
    }
    if (!isInt(d.rarity) || d.rarity < 0 || d.rarity > 4)
      bad.push(`${at}: rarity ${String(d.rarity)} ngoài 0-4`);
    if (!isInt(d.price) || d.price <= 0 || d.price > 100_000)
      bad.push(`${at}: price ${String(d.price)} ngoài 1-100000`);
    if (typeof d.fx !== "string" || !(SKILL_FX_IDS as readonly string[]).includes(d.fx))
      bad.push(`${at}: fx ${String(d.fx)} không có trong SKILL_FX_IDS`);
    if (d.style !== undefined && !(SKILL_STYLES as readonly string[]).includes(d.style))
      bad.push(`${at}: style ${String(d.style)} không có`);
    if (d.grade !== undefined) {
      if (!(SKILL_GRADES as readonly number[]).includes(d.grade))
        bad.push(`${at}: grade ${String(d.grade)} không có`);
      else {
        const [lo, hi] = GRADE_RARITY[d.grade];
        if (isInt(d.rarity) && (d.rarity < lo || d.rarity > hi))
          bad.push(`${at}: grade ${d.grade} không khớp rarity ${d.rarity} (cần ${lo}-${hi})`);
      }
    }
  }
  return bad;
}
