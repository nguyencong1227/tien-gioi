// Nội dung thành tựu + danh hiệu (M9.9 #1028, gốc Tiên Giới): đủ số lượng, đủ sáu nhóm, MỖI thành tựu dùng bộ đếm mà máy chủ THẬT SỰ cộng (không thì không bao giờ đạt được),
// mỗi danh hiệu có thành tựu mở nó, không chữ Hán. Luật chi tiết (id, độ dài, Duyên, trùng điều kiện) do `achievementViolations` / `titleViolations` ở `social.test.ts`.
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_DUYEN_TOTAL_MAX,
  TITLES,
  achievementViolations,
  titleViolations,
} from "./social";
import { MAP_BY_ID } from "./map";
import { MONSTER_BY_ID } from "./game";

/** Khoá bộ đếm mà MÁY CHỦ cộng (đã grep `trackSocial` ở `server/src`: `progression` realm_step, `combat` + `world-boss` boss:<loài> / world_boss_*, `WorldRoom` map: / kiep, `social` pk_*, `npc` craft:<trạm>, `sect` sect_level). Thêm khoá mới vào thành tựu mà chưa có nơi cộng thì test đỏ. */
const FED_FIXED = new Set([
  "kiep",
  "realm_step",
  "sect_level",
  "pk_won",
  "pk_lost",
  "world_boss_joined",
  "world_boss_top",
]);
const FED_CRAFT = new Set(["forge", "alchemy", "talisman"]);
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function isFed(counter: string): boolean {
  const i = counter.indexOf(":");
  if (i < 0) return FED_FIXED.has(counter);
  const fam = counter.slice(0, i);
  const id = counter.slice(i + 1);
  if (fam === "boss") return Boolean(MONSTER_BY_ID[id]?.boss);
  if (fam === "map") return Object.prototype.hasOwnProperty.call(MAP_BY_ID, id);
  if (fam === "craft") return FED_CRAFT.has(id);
  return false;
}

describe("nội dung thành tựu + danh hiệu (M9.9)", () => {
  it("hợp lệ theo luật (thành tựu + danh hiệu) và >= 40 thành tựu", () => {
    expect(achievementViolations()).toEqual([]);
    expect(titleViolations()).toEqual([]);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
  });

  it("đủ sáu nhóm, mỗi nhóm >= 4 thành tựu (tab Thành tựu không có nhóm trống)", () => {
    for (const g of ACHIEVEMENT_GROUPS)
      expect(ACHIEVEMENTS.filter((a) => a.group === g).length, g).toBeGreaterThanOrEqual(4);
  });

  it("MỌI thành tựu dùng bộ đếm máy chủ thật sự cộng (không có thành tựu không bao giờ đạt được)", () => {
    for (const a of ACHIEVEMENTS)
      expect(isFed(a.cond.counter), `${a.id}: ${a.cond.counter}`).toBe(true);
  });

  it("mỗi danh hiệu được ĐÚNG MỘT thành tựu mở (không danh hiệu mồ côi, không hai thành tựu cùng mở một danh hiệu)", () => {
    const opened = ACHIEVEMENTS.map((a) => a.reward?.titleId).filter((t): t is string => !!t);
    expect(new Set(opened).size).toBe(opened.length);
    expect([...opened].sort()).toEqual(TITLES.map((t) => t.id).sort());
  });

  it("danh hiệu cùng nhóm với thành tựu mở nó; chữ không chữ Hán", () => {
    for (const a of ACHIEVEMENTS) {
      const t = a.reward?.titleId ? TITLES.find((x) => x.id === a.reward!.titleId) : undefined;
      if (t) expect(t.group, `${a.id} -> ${t.id}`).toBe(a.group);
    }
    for (const a of ACHIEVEMENTS) expect(CJK.test(a.name + a.desc), a.id).toBe(false);
    for (const t of TITLES) expect(CJK.test(t.text), t.id).toBe(false);
  });

  it("tổng Duyên thưởng nhỏ so với trần (thưởng chỉ là danh hiệu + chút Duyên, mục 50)", () => {
    const total = ACHIEVEMENTS.reduce((s, a) => s + (a.reward?.duyen ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(ACHIEVEMENT_DUYEN_TOTAL_MAX);
  });
});
