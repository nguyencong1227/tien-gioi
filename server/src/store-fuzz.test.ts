// Fuzz hồ sơ lưu (H6, #1106): số liệu từ file lưu KHÔNG được tin (AGENTS.md: "nạp qua hàm kẹp / làm sạch").
// Property test theo mẫu `systems/economy-fuzz.test.ts` (hạt giống cố định `rng(seed)`, in hạt + số bước khi lỗi).
// Với MỖI hạt giống sinh >= STEPS hồ sơ RÁC (biến đổi ngẫu nhiên một hồ sơ hợp lệ mẫu: xoá trường, đổi kiểu, số cực trị,
// chuỗi dài / ký tự điều khiển, khoá nguy hiểm `__proto__` / `constructor`, mảng quá dài, object lồng sâu, id lạ) rồi kiểm:
//  1. `cleanSave` (dựng lại hồ sơ bằng ĐÚNG các hàm `sanitize*` + kẹp vô hướng như luồng nạp thật `WorldRoom.onJoin` / `persist`)
//     KHÔNG BAO GIỜ ném lỗi.
//  2. Hồ sơ đã làm sạch → JSON → `auditPlayerSaveData` trả VỀ KHÔNG CÓ LỖI (số nguyên trong khoảng, túi đúng 24 ô, ví
//     0..COIN_CAP, id chiêu / vật phẩm tồn tại, mastery không âm và < cần để lên tầng, tầng chiêu <= skillMaxLevelOf).
//  3. Làm sạch là điểm bất động: `cleanSave(cleanSave(x))` bằng `cleanSave(x)` (nạp -> lưu -> nạp không đổi).
//  4. KHÔNG ô nhiễm nguyên mẫu: sau mỗi lượt, `({}).polluted` vẫn `undefined`.
// Riêng `loadPlayer` / `savePlayer` (store.ts, đọc `DATA_DIR` tạm) được thử với tệp thật ở describe thứ hai: `loadPlayer`
// KHÔNG BAO GIỜ ném (JSON hỏng trả `null`), và nạp -> lưu -> nạp là điểm bất động.
// Mọi lỗi in kèm hạt + số bước để tái hiện: đổi `FUZZ_SEEDS` / `FUZZ_STEPS` rồi chạy lại.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  AMBUSH_COOLDOWN_MS,
  AMBUSH_DAY_CAP,
  COIN_CAP,
  DEFAULT_ORIGIN,
  DUNGEON_DAILY_REWARDS,
  EQUIP_SLOTS,
  INVENTORY_SLOTS,
  ITEM_BY_ID,
  LEARNABLE_SLOTS,
  LEARNABLE_SKILLS,
  QUEST_BY_ID,
  REALMS,
  SKILL_BY_ID,
  SKILL_MAX_LEVEL,
  dayKey,
  emptyInventory,
  masteryNeedOf,
  sanitizeSkillBook,
  skillMaxLevelOf,
} from "@tien-gioi/shared";
import { auditPlayerSaveData } from "../scripts/audit-saves";
import {
  loadPlayer,
  mapIdOf,
  savePlayer,
  sanitizeLife,
  sanitizeLifeId,
  sanitizeLimbo,
  sanitizeOrigin,
  type SavedPlayer,
} from "./store";
import { sanitizeInventory } from "./systems/inventory";
import { sanitizeEquipment } from "./systems/equipment";
import { sanitizeQuests } from "./systems/quests";
import { sanitizeDungeonDaily } from "./systems/dungeon";
import { sanitizeAmbushDaily, sanitizeAmbushUntil } from "./systems/ambush";

// ---------- Hạt giống ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.parse("2026-11-22T00:00:00.000Z");
const DAY = dayKey(NOW); // "2026-11-22"
const ISO = new Date(NOW).toISOString();
const VALID_NAME = "Tiểu Đạo Sĩ";
const VALID_HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

/** Giá trị "xấu" xen lẫn giá trị tốt: server không được tin client / file lưu. */
const BAD = [
  undefined,
  null,
  NaN,
  Infinity,
  -Infinity,
  -0,
  2 ** 53,
  -(2 ** 53),
  Number.MIN_VALUE,
  1.5,
  "3",
  "constructor",
  "__proto__",
  "pham_gia_xau",
  {},
  [],
  true,
];

// ---------- Hồ sơ hợp lệ mẫu (dùng lại làm gốc để đột biến) ----------

/** id vật phẩm trang bị hợp lệ cho ô `slot` (lấy từ bảng thật, không cứng). */
function equipItemIdFor(slot: string): string {
  for (const id of Object.keys(ITEM_BY_ID)) if (ITEM_BY_ID[id]?.equip?.slot === slot) return id;
  return "";
}
/** quest id hợp lệ (thường / lặp) lấy từ bảng thật. */
function someQuestId(daily: boolean): string | undefined {
  for (const id of Object.keys(QUEST_BY_ID)) if (!!QUEST_BY_ID[id]?.daily === daily) return id;
  return undefined;
}
const REALM = 2; // Nguyên Anh: mở đủ ô trang bị / chiêu để thử cả nhánh "ô mở"
const TIER = REALMS[REALM]!.tiers.length - 1;
// Một chiêu đã học tầng 1 (có thể luyện) + điểm luyện cần để lên tầng 2 — dùng cho hồ sơ mẫu VÀ input đối kháng mastery
const BASE_SKILL_ID =
  LEARNABLE_SKILLS.find((s) => skillMaxLevelOf(s) > 1)?.id ?? LEARNABLE_SKILLS[0]!.id;
const BASE_NEED = masteryNeedOf(SKILL_BY_ID[BASE_SKILL_ID]!, 1);
const BASE_ITEM_ID = Object.keys(ITEM_BY_ID).find((id) => (ITEM_BY_ID[id]!.stack ?? 1) >= 3)!;

function baseSave(): SavedPlayer {
  const inv = emptyInventory(); // Inventory = (InvSlot | null)[], không phải InvSlot[]
  inv[0] = { itemId: BASE_ITEM_ID, qty: 3 };
  inv[1] = { itemId: BASE_ITEM_ID, qty: 2 };
  const activeId = someQuestId(false) ?? someQuestId(true) ?? "";
  const dailyId = someQuestId(true);
  // Một chiêu đã học tầng 1 + điểm luyện dở dang hợp lệ (< cần để lên tầng 2 = MASTERY_NEED[0])
  const mastery: Record<string, number> = {};
  if (BASE_NEED) mastery[BASE_SKILL_ID] = BASE_NEED - 1;
  const limbo = sanitizeLimbo({
    endedLifeId: "endedlifex",
    summary: { kiep: 3, realm: REALM, tier: TIER, minutes: 42, kills: 7, bossKills: 2, gain: 999 },
    keepable: [equipItemIdFor("weapon")],
    engravable: [BASE_SKILL_ID],
    coinAtDeath: 500,
    counts: true,
    credited: false,
  });
  return {
    name: VALID_NAME,
    secretHash: VALID_HASH,
    realm: REALM,
    tier: TIER,
    exp: 1500,
    mapId: "lac_ha",
    inventory: inv,
    equipment: {
      weapon: equipItemIdFor("weapon"),
      robe: equipItemIdFor("robe"),
      talisman: equipItemIdFor("talisman"),
      boots: equipItemIdFor("boots"),
      jade: equipItemIdFor("jade"),
      treasure: equipItemIdFor("treasure"),
    },
    quests: {
      active: activeId ? [{ id: activeId, step: 0, count: 0 }] : [],
      done: [someQuestId(false)!].filter(Boolean),
      daily: dailyId ? { [dailyId]: DAY } : {},
    },
    skills: { learned: { [BASE_SKILL_ID]: 1 }, slots: [BASE_SKILL_ID, "", "", ""], mastery },
    coin: 200,
    lifeId: "lifexxxxxx",
    life: { playMs: 1000, kills: 5, bossKills: 1 },
    origin: DEFAULT_ORIGIN,
    limbo,
    dungeonDaily: { day: DAY, rewards: 1 },
    ambushDaily: { day: DAY, n: 0 },
    ambushUntil: NOW + 10_000,
    ambushReturnAt: NOW,
    travelAt: NOW,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

// ---------- Bộ sinh rác ----------

/** Object lồng sâu (đừng để stack overflow: giới hạn độ sâu). */
function deepObject(rand: () => number, depth = 0): unknown {
  if (depth > 4) return BAD[Math.floor(rand() * BAD.length)]!;
  const o: Record<string, unknown> = {};
  const n = Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) o["k" + i] = deepObject(rand, depth + 1);
  return o;
}

function garbageValue(rand: () => number): unknown {
  const r = rand();
  if (r < 0.5) return BAD[Math.floor(rand() * BAD.length)]!;
  if (r < 0.7) return "x".repeat(Math.floor(rand() * 2000)); // chuỗi rất dài
  if (r < 0.8) return deepObject(rand);
  if (r < 0.9)
    return Array.from(
      { length: Math.floor(rand() * 50) },
      () => BAD[Math.floor(rand() * BAD.length)],
    );
  return undefined;
}

/** Gán một trường ngẫu nhiên của hồ sơ một giá trị rác (hoặc xoá trường). */
const FUZZ_FIELDS = [
  "realm",
  "tier",
  "exp",
  "coin",
  "mapId",
  "inventory",
  "equipment",
  "quests",
  "skills",
  "lifeId",
  "life",
  "origin",
  "limbo",
  "dungeonDaily",
  "ambushDaily",
  "ambushUntil",
  "ambushReturnAt",
  "travelAt",
] as const;

function mutate(rand: () => number, base: SavedPlayer): Record<string, unknown> {
  const s: Record<string, unknown> = JSON.parse(JSON.stringify(base));
  const n = 1 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const f = FUZZ_FIELDS[Math.floor(rand() * FUZZ_FIELDS.length)]!;
    (s as Record<string, unknown>)[f] = garbageValue(rand);
  }
  // Thử ô nhiễm nguyên mẫu: khoá own `__proto__` / `constructor` ở tầng gốc và lồng trong túi / sổ.
  if (rand() < 0.35) {
    Object.defineProperty(s, "__proto__", {
      value: { polluted: true, mark: 1 },
      enumerable: false,
      configurable: true,
    });
  }
  if (rand() < 0.25) (s as Record<string, unknown>)["constructor"] = { polluted: true };
  if (rand() < 0.25) (s as Record<string, unknown>)["extra_junk"] = garbageValue(rand);
  // Túi / sổ chiêu: chèn khoá nguy hiểm như thể file bị can thiệp
  if (rand() < 0.3 && Array.isArray(s.inventory)) {
    (s.inventory as unknown[]).push({ itemId: "__proto__", qty: 999 });
    (s.inventory as unknown[]).push({ itemId: "constructor", qty: -5 });
  }
  if (rand() < 0.3 && s.skills && typeof s.skills === "object") {
    const sk = s.skills as Record<string, unknown>;
    if (sk.learned && typeof sk.learned === "object")
      (sk.learned as Record<string, unknown>)["constructor"] = 9;
  }
  return s;
}

// ---------- Input đối kháng: mỗi mục nhắm một lần kẹp — đảm bảo test CÓ RĂNG khi đột biến bỏ kẹp ----------
/** Hồ sơ hợp lệ rồi ghi đè một vài trường — dễ dựng input nhắm đúng lần kẹp cần thử. */
function patched(base: SavedPlayer, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...JSON.parse(JSON.stringify(base)), ...patch };
}

const UNKNOWN_SKILL_ID = "zzz_khong_ton_tai_quyen"; // không có trong LEARNABLE_SKILLS / SKILL_BY_ID

/** Bộ input đối kháng: túi qty rác (id hợp lệ), chiêu lạ, mastery vượt trần / âm, coin / realm / tier cực trị. */
const ADVERSARIAL: Record<string, unknown>[] = [
  // Kẹp qty túi: id hợp lệ + số lượng 0 / âm / NaN (bỏ kẹp → lọt audit qty_out_of_range)
  patched(baseSave(), { inventory: [{ itemId: BASE_ITEM_ID, qty: 0 }] }),
  patched(baseSave(), { inventory: [{ itemId: BASE_ITEM_ID, qty: -5 }] }),
  patched(baseSave(), { inventory: [{ itemId: BASE_ITEM_ID, qty: NaN }] }),
  patched(baseSave(), { inventory: [{ itemId: BASE_ITEM_ID, qty: 2 ** 53 }] }),
  // Kiểm id chiêu: chiêu lạ trong learned (bỏ kiểm → lọt audit unknown_skill)
  patched(baseSave(), {
    skills: { learned: { [BASE_SKILL_ID]: 1, [UNKNOWN_SKILL_ID]: 2 }, slots: ["", "", "", ""] },
  }),
  // Kẹp mastery: điểm vượt trần / âm (bỏ kẹp → structural mastery đỏ; audit KHÔNG kiểm mastery)
  patched(baseSave(), {
    skills: { learned: { [BASE_SKILL_ID]: 1 }, mastery: { [BASE_SKILL_ID]: 1_000_000 } },
  }),
  patched(baseSave(), {
    skills: { learned: { [BASE_SKILL_ID]: 1 }, mastery: { [BASE_SKILL_ID]: -7 } },
  }),
  // Kẹp coin / realm / tier cực trị
  patched(baseSave(), { coin: 2 ** 53 }),
  patched(baseSave(), { coin: -100 }),
  patched(baseSave(), { realm: 999 }),
  patched(baseSave(), { realm: -3 }),
  patched(baseSave(), { tier: 999 }),
  patched(baseSave(), { exp: -50 }),
  patched(baseSave(), { mapId: "ban_do_khong_co" }),
  // limbo / dungeonDaily / ambushDaily rác (bỏ kẹp → audit đỏ)
  // limbo: endedLifeId + realm hợp lệ — sanitize KHÔNG ép `endedLifeId` ≥8 hay realm về REALMS.length (audit nghiêm hơn sanitize ở biên, KHÔNG phải lỗi kho). Chỉ stress kiep âm + keepable item lạ: bỏ Math.max(1,..)/lọc equip nào thì audit đỏ nhánh đó.
  patched(baseSave(), {
    limbo: { endedLifeId: "endedlifex", summary: { kiep: -1, realm: REALM }, keepable: ["zzz"] },
  }),
  patched(baseSave(), { dungeonDaily: { day: DAY, rewards: 99999 } }),
  patched(baseSave(), { ambushDaily: { day: DAY, n: 99999 } }),
  patched(baseSave(), { ambushUntil: -1000 }),
];

// ---------- Dựng lại hồ sơ hợp lệ từ rác (giống luồng nạp thật) ----------

const intClamp = (v: unknown, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)
    ? Math.min(hi, Math.max(lo, v))
    : lo;
const isDayKey = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T00:00:00Z`));

/**
 * Áp ĐÚNG các hàm `sanitize*` + kẹp vô hướng như `WorldRoom.onJoin` / `persist` để dựng hồ sơ hợp lệ từ rác.
 * `name` / `secretHash` / mốc thời gian là trường danh tính / tin cậy (được kiểm ở lớp đăng ký, không ở đây) nên luôn giữ hợp lệ.
 * `x` / `y` bỏ (persist thường ghi `undefined`; vị trí hợp lệ là việc của bản đồ, không phải của hàm kẹp hồ sơ).
 * `quests.daily`: `sanitizeQuests` giữ nguyên chuỗi ngày nên làm lại ở đây — chỉ giữ ngày hợp lệ (định dạng ngày là của audit).
 */
function cleanSave(raw: unknown): SavedPlayer {
  const r =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const realm = intClamp(r.realm, 0, REALMS.length - 1);
  const tier = intClamp(r.tier, 0, REALMS[realm]!.tiers.length - 1);
  const exp =
    typeof r.exp === "number" && Number.isFinite(r.exp) && r.exp >= 0 ? Math.floor(r.exp) : 0;
  const coin = intClamp(r.coin, 0, COIN_CAP);
  const q = sanitizeQuests(r.quests);
  const daily: Record<string, string> = {};
  for (const [id, d] of Object.entries(q.daily)) if (isDayKey(d)) daily[id] = d;
  return {
    name: VALID_NAME,
    secretHash: VALID_HASH,
    realm,
    tier,
    exp,
    mapId: mapIdOf({ mapId: r.mapId as string }),
    inventory: sanitizeInventory(r.inventory),
    equipment: sanitizeEquipment(r.equipment, realm),
    quests: { ...q, daily },
    skills: sanitizeSkillBook(r.skills, realm),
    coin,
    lifeId: sanitizeLifeId(r.lifeId),
    life: sanitizeLife(r.life),
    limbo: sanitizeLimbo(r.limbo),
    origin: sanitizeOrigin(r.origin),
    dungeonDaily: sanitizeDungeonDaily(r.dungeonDaily),
    ambushDaily: sanitizeAmbushDaily(r.ambushDaily),
    ambushUntil: sanitizeAmbushUntil(r.ambushUntil, NOW),
    ambushReturnAt:
      typeof r.ambushReturnAt === "number" && Number.isFinite(r.ambushReturnAt)
        ? r.ambushReturnAt
        : undefined,
    travelAt:
      typeof r.travelAt === "number" && Number.isFinite(r.travelAt) ? r.travelAt : undefined,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

// ---------- Kiểm cấu trúc trực tiếp trên hồ sơ đã làm sạch ----------

function assertStructural(c: SavedPlayer, where: string) {
  // cleanSave LUÔN đặt skills / life / coin / inventory (sanitize* luôn trả giá trị hợp lệ, KHÔNG undefined);
  // thiếu = lỗi bộ dựng lại hồ sơ. Guard để TS biết (các trường này optional trong SavedPlayer) + dừng sớm nếu bất biến bị phá.
  if (!c.skills || !c.life || c.coin === undefined || !c.inventory)
    throw new Error(`${where}: cleanSave phải luôn đặt skills/life/coin/inventory`);
  // Số nguyên trong khoảng
  expect(
    Number.isInteger(c.realm) && c.realm >= 0 && c.realm < REALMS.length,
    `${where}: realm`,
  ).toBe(true);
  expect(
    Number.isInteger(c.tier) && c.tier >= 0 && c.tier < REALMS[c.realm]!.tiers.length,
    `${where}: tier`,
  ).toBe(true);
  expect(typeof c.exp === "number" && Number.isFinite(c.exp) && c.exp >= 0, `${where}: exp`).toBe(
    true,
  );
  expect(Number.isInteger(c.coin) && c.coin >= 0 && c.coin <= COIN_CAP, `${where}: coin`).toBe(
    true,
  );
  // Túi đúng 24 ô, mỗi ô hợp lệ
  expect(c.inventory.length, `${where}: túi 24 ô`).toBe(INVENTORY_SLOTS);
  for (const slot of c.inventory) {
    if (!slot) continue;
    expect(ITEM_BY_ID[slot.itemId], `${where}: ô túi id lạ ${slot.itemId}`).toBeTruthy();
    expect(
      Number.isInteger(slot.qty) && slot.qty >= 1 && slot.qty <= ITEM_BY_ID[slot.itemId]!.stack,
      `${where}: qty ${slot.qty}`,
    ).toBe(true);
  }
  // Trang bị: mỗi ô hoặc rỗng hoặc id trang bị đúng ô (trang bị là trường optional nên cast qua record để index theo biến)
  const equip = c as unknown as Record<string, string | undefined>;
  for (const slot of EQUIP_SLOTS) {
    const id = equip[slot];
    if (id)
      expect(ITEM_BY_ID[id]?.equip?.slot === slot, `${where}: trang bị sai ô ${slot}=${id}`).toBe(
        true,
      );
  }
  // Sổ chiêu: tầng [1, skillMaxLevelOf] ⊆ [1, SKILL_MAX_LEVEL]; ô đúng 4; id đã học
  const sk = c.skills;
  for (const [id, lv] of Object.entries(sk.learned)) {
    const def = SKILL_BY_ID[id];
    expect(def, `${where}: chiêu đã học lạ ${id}`).toBeTruthy();
    expect(
      Number.isInteger(lv) && lv >= 1 && lv <= skillMaxLevelOf(def) && lv <= SKILL_MAX_LEVEL,
      `${where}: tầng chiêu ${id}=${lv}`,
    ).toBe(true);
  }
  expect(sk.slots.length, `${where}: ô chiêu 4`).toBe(LEARNABLE_SLOTS.length);
  for (const id of sk.slots) {
    if (id === "") continue;
    expect(sk.learned[id] !== undefined, `${where}: ô chiêu chiêu chưa học ${id}`).toBe(true);
  }
  // mastery: mỗi điểm nguyên >= 0 và < cần để lên tầng (hoặc không có khoá nếu không luyện được)
  for (const [id, pts] of Object.entries(sk.mastery ?? {})) {
    const def = SKILL_BY_ID[id];
    const level = sk.learned[id];
    const need = def && level ? masteryNeedOf(def, level) : null;
    expect(
      Number.isInteger(pts) && pts >= 0,
      `${where}: mastery ${id}=${pts} âm/không nguyên`,
    ).toBe(true);
    if (need !== null)
      expect(pts < need, `${where}: mastery ${id}=${pts} >= cần ${need}`).toBe(true);
    else expect(true, `${where}: mastery cho chiêu không luyện được phải bị bỏ`).toBe(true);
  }
  // life / limbo / dungeonDaily / ambushDaily / ambushUntil đã được kẹp (không ném, hợp lệ)
  expect(typeof c.life.playMs === "number", `${where}: life.playMs`).toBe(true);
  if (c.limbo)
    expect(typeof c.limbo.endedLifeId === "string", `${where}: limbo.endedLifeId`).toBe(true);
  if (c.dungeonDaily)
    expect(
      Number.isInteger(c.dungeonDaily.rewards) &&
        c.dungeonDaily.rewards >= 0 &&
        c.dungeonDaily.rewards <= DUNGEON_DAILY_REWARDS,
      `${where}: dungeonDaily.rewards`,
    ).toBe(true);
  if (c.ambushDaily)
    expect(
      Number.isInteger(c.ambushDaily.n) &&
        c.ambushDaily.n >= 0 &&
        c.ambushDaily.n <= AMBUSH_DAY_CAP,
      `${where}: ambushDaily.n`,
    ).toBe(true);
  if (c.ambushUntil !== undefined)
    expect(
      Number.isFinite(c.ambushUntil) &&
        c.ambushUntil >= 0 &&
        c.ambushUntil <= NOW + AMBUSH_COOLDOWN_MS,
      `${where}: ambushUntil`,
    ).toBe(true);
}

// ---------- Kiểm ----------

const SEEDS = Array.from({ length: Number(process.env.FUZZ_SEEDS) || 6 }, (_, i) => i + 1);
const STEPS = Number(process.env.FUZZ_STEPS) || 2000;

/** Chạy môt hồ sơ rác qua cả bốn tính chất (1)–(4); ném lỗi kèm hạt + bước để tái hiện. */
function checkOne(garbage: unknown, where: string) {
  // (1) cleanSave KHÔNG ném
  let c: SavedPlayer;
  try {
    c = cleanSave(garbage);
  } catch (e) {
    throw new Error(`${where}: cleanSave ném ${(e as Error).message}`, { cause: e });
  }
  assertStructural(c, where);

  // (2) audit hồ sơ đã làm sạch → KHÔNG có lỗi
  const text = JSON.stringify(c);
  const errors = auditPlayerSaveData(text, Buffer.byteLength(text));
  expect(errors, `${where}: audit còn lỗi ${JSON.stringify(errors)}`).toEqual([]);

  // (3) điểm bất động: làm sạch lại một lần nữa phải giống hệt
  const again = JSON.stringify(cleanSave(JSON.parse(text)));
  expect(again, `${where}: cleanSave không bất động`).toBe(text);

  // (4) không ô nhiễm nguyên mẫu
  expect(({} as Record<string, unknown>).polluted, `${where}: ô nhiễm nguyên mẫu`).toBeUndefined();
  expect(
    (Object.prototype as Record<string, unknown>).polluted,
    `${where}: Object.prototype ô nhiễm`,
  ).toBeUndefined();
}

describe("fuzz hồ sơ lưu: rác -> làm sạch -> audit sạch, idempotent, không ô nhiễm nguyên mẫu", () => {
  it.each(SEEDS)(
    "hạt %i: %d hồ sơ rác đều làm sạch được, audit sạch, bất động, không ô nhiễm",
    (seed) => {
      const rand = rng(seed);
      const base = baseSave();
      for (let i = 0; i < STEPS; i++) {
        checkOne(mutate(rand, base), `seed ${seed} bước ${i}`);
      }
    },
  );

  it("input đối kháng (bỏ kẹp nào thì tính chất đó đỏ): túi qty / chiêu lạ / mastery / coin / realm / limbo ...", () => {
    ADVERSARIAL.forEach((g, i) => checkOne(g, `đối kháng ${i}`));
  });

  it("chứa đủ nhánh rác (đổi kiểu / số cực trị / prototype / id lạ / object lồng sâu) trên mọi trường", () => {
    // Đảm bảo bộ sinh thực sự chạm các nhánh nguy hiểm (tránh test pass rộng).
    const rand = rng(3);
    const base = baseSave();
    const seen: Record<string, number> = {};
    for (let i = 0; i < STEPS; i++) {
      const g = mutate(rand, base);
      for (const f of FUZZ_FIELDS)
        if (g[f] !== (base as unknown as Record<string, unknown>)[f]) seen[f] = (seen[f] ?? 0) + 1;
    }
    for (const f of FUZZ_FIELDS)
      expect(seen[f] ?? 0, `trường "${f}" chưa lần nào bị đột biến`).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ---------- loadPlayer / savePlayer với tệp thật (DATA_DIR tạm) ----------

describe("store.ts: loadPlayer / savePlayer với tệp thật", () => {
  let dir: string;
  let prev: string | undefined;

  // Đường tệp đúng như store.ts: fileFor(name) = <DATA_DIR>/<sha1(NFC lower)>.json
  const fileFor = (name: string) =>
    path.join(
      dir,
      `${createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex")}.json`,
    );

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "tien-gioi-store-fuzz-"));
    prev = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
  });

  it("loadPlayer KHÔNG bao giờ ném: tệp hỏng / rỗng / không phải object → null hoặc giá trị đã parse, không treo", async () => {
    const cases: [string, string][] = [
      ["ten-hoang-tuong", "không tồn tại"], // không ghi → chưa có tệp
      ["ten-json-hoang", "{ this is not json"], // JSON hỏng
      ["ten-vao-duong", ""], // rỗng
      ["ten-so", "123"], // JSON hợp lệ nhưng là số
      ["ten-mang", "[1,2,3]"], // JSON hợp lệ nhưng là mảng
      ["ten-null", "null"], // JSON hợp lệ nhưng là null
    ];
    for (const [name, content] of cases) {
      const p = fileFor(name);
      await fs.mkdir(dir, { recursive: true });
      if (name !== "ten-hoang-tuong") await fs.writeFile(p, content);
      // KHÔNG được ném, KHÔNG được treo (vitest timeout)
      const loaded = await loadPlayer(name);
      if (name === "ten-hoang-tuong" || name === "ten-json-hoang" || name === "ten-vao-duong")
        expect(loaded, `${name}: hỏng / rỗng → null`).toBeNull();
      // JSON hợp lệ nhưng không phải object: loadPlayer trả về giá trị parse THÔ (không tin file, không kiểm)
      else if (name === "ten-so") expect(loaded, "ten-so").toBe(123);
      else if (name === "ten-mang") expect(loaded, "ten-mang").toEqual([1, 2, 3]);
      else expect(loaded, "ten-null").toBeNull(); // JSON "null" parse ra null
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("savePlayer → loadPlayer → savePlayer là điểm bất động (nạp -> lưu -> nạp không đổi)", async () => {
    const c = cleanSave(mutate(rng(99), baseSave()));
    const name = c.name; // cleanSave giữ tên hợp lệ; load theo đúng khoá tệp
    await savePlayer(c);
    const a = await loadPlayer(name);
    expect(a, "nạp lại được hồ sơ đã lưu").not.toBeNull();
    await savePlayer(a!);
    const b = await loadPlayer(name);
    // `savePlayer` luôn đóng dấu updatedAt = now nên bỏ trường đó khi so: dữ liệu (không tính thời điểm ghi) phải bất động
    const strip = (o: SavedPlayer) => JSON.stringify({ ...o, updatedAt: undefined });
    expect(strip(b!), "lưu->nạp lại bất động (trừ updatedAt)").toBe(strip(a!));
    await fs.rm(dir, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env.DATA_DIR = prev; // trả DATA_DIR về giá trị gốc, KHÔNG để lại cho test khác
  });
});
