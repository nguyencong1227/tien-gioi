// Kiểm thử kế hoạch phân vai và gieo nhân vật của soak `--m7` (soak-plan.ts)
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HAN_VAN_ID,
  LEARNABLE_SLOTS,
  getMap,
  SKILL_BY_ID,
  SKILL_MAX_LEVEL,
  REALMS,
  sanitizeSkillBook,
  skillReqMet,
  slotOpen,
  type SkillBook,
} from "@tien-gioi/shared";
import { auditSavesDirectory } from "./audit-saves";
import {
  ALL_SKILL_IDS,
  DEFAULT_NA_RATIO,
  NGUYEN_ANH_REALM,
  NGUYEN_ANH_SKILL_IDS,
  allocateSoakRoles,
  countRealms,
  planM7Bots,
  seedSoakBot,
  slottedSkillIds,
  soakNaCount,
  type SoakRole,
} from "./soak-plan";

const tempDirs: string[] = [];
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function countBy(roles: readonly SoakRole[], n = roles.length): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of roles.slice(0, n)) out[r] = (out[r] ?? 0) + 1;
  return out;
}

describe("allocateSoakRoles: giữ nguyên bảng phân vai cũ khi không bật --m7", () => {
  it("100 bot, không Nguyên Anh: 30 săn / 20 trấn / 10 cổng / 16 bí cảnh / 12 PK / 12 tông môn", () => {
    const roles = allocateSoakRoles(100);
    expect(roles).toHaveLength(100);
    expect(countBy(roles)).toEqual({
      hunt: 30,
      crowd: 20,
      travel: 10,
      dungeon: 16,
      duel: 12,
      sect: 12,
    });
    // thứ tự cũ: săn, trấn, cổng, bí cảnh, PK, tông môn (chỉ số bot quyết định nhóm bí cảnh / PK / tông môn)
    expect(roles[0]).toBe("hunt");
    expect(roles[29]).toBe("hunt");
    expect(roles[30]).toBe("crowd");
    expect(roles[60]).toBe("dungeon");
    expect(roles[76]).toBe("duel");
    expect(roles[88]).toBe("sect");
    expect(roles[99]).toBe("sect");
  });

  it("20 bot (cỡ thử nhanh): mỗi vai tối thiểu 1 và tổng đúng 20", () => {
    const roles = allocateSoakRoles(20);
    expect(roles.length).toBeGreaterThanOrEqual(20);
    const c = countBy(roles, 20);
    expect(c.hunt).toBeGreaterThanOrEqual(1);
    expect(c.crowd).toBeGreaterThanOrEqual(1);
    expect(c.travel).toBeGreaterThanOrEqual(1);
  });

  it("có Nguyên Anh: đủ tổng bot, vai na xếp cuối, phần còn lại chia theo tỉ lệ cũ", () => {
    const roles = allocateSoakRoles(100, 20);
    expect(roles).toHaveLength(100);
    expect(countBy(roles)).toEqual({
      hunt: 24,
      crowd: 16,
      travel: 8,
      dungeon: 12,
      duel: 8,
      sect: 12,
      na: 20,
    });
    expect(roles.slice(80)).toEqual(Array(20).fill("na"));
    expect(roles.slice(0, 80).includes("na")).toBe(false);
  });

  it("nhóm bí cảnh (4) và PK (2) vẫn thẳng hàng với chỉ số bot khi có Nguyên Anh", () => {
    const roles = allocateSoakRoles(100, 20);
    const firstDungeon = roles.indexOf("dungeon") + 1; // chỉ số bot 1-based
    const firstDuel = roles.indexOf("duel") + 1;
    expect((firstDungeon - 1) % 4).toBe(0);
    expect((firstDuel - 1) % 2).toBe(0);
  });
});

describe("soakNaCount", () => {
  it("20 % của 100 bot là 20; mặc định tỉ lệ 0,2", () => {
    expect(DEFAULT_NA_RATIO).toBe(0.2);
    expect(soakNaCount(100, 0.2)).toBe(20);
    expect(soakNaCount(50, 0.2)).toBe(10);
  });
  it("ít nhất 2 bot (đủ phủ 6 chiêu), không vượt tổng số bot", () => {
    expect(soakNaCount(10, 0.05)).toBe(2);
    expect(soakNaCount(1, 0.5)).toBe(1);
    expect(soakNaCount(100, 5)).toBe(100);
    expect(soakNaCount(0, 0.2)).toBe(0);
    expect(soakNaCount(100, Number.NaN)).toBe(20);
  });
});

describe("planM7Bots: cảnh giới, bậc, bản đồ và sổ chiêu", () => {
  const BOTS = 100;
  const roles = allocateSoakRoles(BOTS, soakNaCount(BOTS, DEFAULT_NA_RATIO));
  const plans = planM7Bots(roles, BOTS);

  it("chỉ vai na / hunt có kế hoạch; vai khác để null (gieo như cũ)", () => {
    plans.forEach((p, i) => {
      expect(p !== null).toBe(roles[i] === "na" || roles[i] === "hunt");
    });
  });

  it("20 bot Nguyên Anh ở Hàn Vân Lĩnh, bậc xoay 2 / 1 / 0 (đủ bậc 0..2)", () => {
    const na = plans.filter((p, i) => roles[i] === "na");
    expect(na).toHaveLength(20);
    for (const p of na) {
      expect(p?.realm).toBe(NGUYEN_ANH_REALM);
      expect(p?.mapId).toBe(HAN_VAN_ID);
    }
    expect(new Set(na.map((p) => p?.tier))).toEqual(new Set([0, 1, 2]));
    expect(na.slice(0, 3).map((p) => p?.tier)).toEqual([2, 1, 0]);
  });

  it("bot săn là Trúc Cơ / Kim Đan xen kẽ, ở Lạc Hà Trấn, bậc nằm trong cảnh giới", () => {
    const hunters = plans.filter((p, i) => roles[i] === "hunt");
    expect(hunters).toHaveLength(24);
    expect(hunters.map((p) => p?.realm).slice(0, 4)).toEqual([2, 3, 2, 3]);
    for (const p of hunters) {
      expect(p?.mapId).toBe("lac_ha");
      expect(p!.tier).toBeLessThan(REALMS[p!.realm].tiers.length);
    }
  });

  it("MỌI bot có kế hoạch: sổ chiêu hợp lệ theo đúng luật shared (ô mở, đã học, đủ bậc, tầng 1..3)", () => {
    for (const p of plans) {
      if (!p) continue;
      const book: SkillBook = p.skills;
      const slotted = book.slots.filter((s) => s !== "");
      expect(slotted.length).toBeGreaterThan(0);
      expect(new Set(slotted).size).toBe(slotted.length); // mỗi chiêu một ô
      book.slots.forEach((id, i) => {
        if (id === "") return;
        expect(slotOpen(LEARNABLE_SLOTS[i], p.realm)).toBe(true);
        expect(book.learned[id]).toBeGreaterThanOrEqual(1);
        expect(book.learned[id]).toBeLessThanOrEqual(SKILL_MAX_LEVEL);
      });
      // mọi ô mở đều có chiêu (không bỏ phí ô)
      LEARNABLE_SLOTS.forEach((slot, i) => {
        if (slotOpen(slot, p.realm)) expect(book.slots[i]).not.toBe("");
      });
      for (const id of Object.keys(book.learned)) {
        expect(skillReqMet(SKILL_BY_ID[id], p.realm, p.tier), `${id} @ ${p.realm}/${p.tier}`).toBe(
          true,
        );
      }
      // làm sạch như lúc server nạp tệp không đổi gì
      expect(sanitizeSkillBook(book, p.realm)).toEqual(book);
    }
  });

  it("kế hoạch mặc định (100 bot, 20 %) phủ CẢ 6 chiêu Nguyên Anh đợt 2", () => {
    expect(NGUYEN_ANH_SKILL_IDS).toHaveLength(6);
    const slotted = slottedSkillIds(plans);
    for (const id of NGUYEN_ANH_SKILL_IDS) expect(slotted.has(id), id).toBe(true);
  });

  it("kế hoạch mặc định phủ cả 18 chiêu của game", () => {
    expect(ALL_SKILL_IDS).toHaveLength(18);
    const slotted = slottedSkillIds(plans);
    for (const id of ALL_SKILL_IDS) expect(slotted.has(id), id).toBe(true);
  });

  it("chiêu Nguyên Anh cần bậc chỉ gắn cho bot đủ bậc (tầng 0 không có Vạn Thạch Trận / Liệt Hỏa Kiếm...)", () => {
    for (let i = 0; i < BOTS; i++) {
      const p = plans[i];
      if (!p || roles[i] !== "na") continue;
      for (const id of p.skills.slots) {
        if (!id) continue;
        expect(skillReqMet(SKILL_BY_ID[id], p.realm, p.tier), `${id} @ tầng ${p.tier}`).toBe(true);
      }
    }
  });

  it("chỉ HAI bot Nguyên Anh (bậc 2 rồi bậc 1) đã phủ đủ 6 chiêu: chạy nhanh với ít bot vẫn đạt", () => {
    const r = allocateSoakRoles(10, soakNaCount(10, 0.05));
    const p = planM7Bots(r, 10);
    expect(countRealms(p)[NGUYEN_ANH_REALM]).toBe(2);
    const slotted = slottedSkillIds(p);
    for (const id of NGUYEN_ANH_SKILL_IDS) expect(slotted.has(id), id).toBe(true);
  });

  it("tất định: cùng đầu vào cho đúng cùng kế hoạch", () => {
    expect(planM7Bots(roles, BOTS)).toEqual(plans);
  });

  it("countRealms: Nguyên Anh 20, Trúc Cơ / Kim Đan 12 + 12, còn lại Luyện Khí 56", () => {
    expect(countRealms(plans)).toEqual({ 1: 56, 2: 12, 3: 12, 4: 20 });
  });
});

describe("seedSoakBot: tệp lưu soak thật ghi đúng kế hoạch và qua kiem-save", () => {
  function tmp(): string {
    const d = mkdtempSync(path.join(os.tmpdir(), "soak-plan-test-"));
    tempDirs.push(d);
    return d;
  }
  function readOnlySave(dir: string): Record<string, any> {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);
    return JSON.parse(readFileSync(path.join(dir, files[0]), "utf8"));
  }

  it("có kế hoạch M7: tệp lưu mang cảnh giới, bậc, bản đồ và sổ chiêu của kế hoạch", () => {
    const roles = allocateSoakRoles(100, 20);
    const plans = planM7Bots(roles, 100);
    const i = roles.indexOf("na");
    const plan = plans[i]!;
    const dir = tmp();
    seedSoakBot({
      name: "Bot 081",
      secret: "bi_mat_thu_nghiem_soak_081",
      x: 2000,
      y: 2000,
      baseRealm: 1,
      baseTier: 4,
      baseMapId: "lac_ha",
      coin: 100,
      dir,
      plan,
    });
    const raw = readOnlySave(dir);
    expect(raw.realm).toBe(NGUYEN_ANH_REALM);
    expect(raw.tier).toBe(plan.tier);
    expect(raw.mapId).toBe(HAN_VAN_ID);
    expect(raw.skills).toEqual(plan.skills);
    expect(raw.skills.slots.filter((s: string) => s !== "").length).toBe(4);
    expect(auditSavesDirectory(dir).errorFiles).toBe(0);
  });

  it("không có kế hoạch: giữ đúng như cũ (Luyện Khí, không sổ chiêu)", () => {
    const dir = tmp();
    seedSoakBot({
      name: "Bot 001",
      secret: "bi_mat_thu_nghiem_soak_001",
      x: 1500,
      y: 1500,
      baseRealm: 1,
      baseTier: 4,
      baseMapId: "lac_ha",
      coin: 100,
      dir,
      plan: null,
    });
    const raw = readOnlySave(dir);
    expect(raw.realm).toBe(1);
    expect(raw.tier).toBe(4);
    expect(raw.skills).toBeUndefined();
    expect(auditSavesDirectory(dir).errorFiles).toBe(0);
  });

  it("toàn bộ 100 bot theo kế hoạch mặc định đều qua kiem-save với 0 lỗi", () => {
    const roles = allocateSoakRoles(100, 20);
    const plans = planM7Bots(roles, 100);
    const dir = tmp();
    for (let i = 0; i < 100; i++) {
      // tâm trấn của đúng bản đồ bot đứng: luôn là chỗ đi được (kiem-save kiểm toạ độ đè vật cản theo bản đồ)
      const map = getMap(plans[i]?.mapId ?? "lac_ha")!;
      seedSoakBot({
        name: `Bot ${String(i + 1).padStart(3, "0")}`,
        secret: `bi_mat_thu_nghiem_soak_${String(i + 1).padStart(3, "0")}`,
        x: map.townPx.x,
        y: map.townPx.y,
        baseRealm: 1,
        baseTier: 4,
        baseMapId: "lac_ha",
        coin: 100,
        dir,
        plan: plans[i],
      });
    }
    const report = auditSavesDirectory(dir);
    expect(report.totalFiles).toBe(100);
    expect(report.failedFiles).toEqual([]);
    expect(report.errorFiles).toBe(0);
  });
});
