// Hợp đồng thách đấu (M3 bước 5, PR 5a): hằng số, tên tin nhắn, bộ đọc tin từ client, điều kiện thách.
import { describe, expect, it } from "vitest";
import {
  DUEL_COOLDOWN_MS,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITES_MAX,
  DUEL_INVITE_TTL_MS,
  DUEL_KO_HP_PCT,
  DUEL_KO_MS,
  DUEL_LEASH_PX,
  DUEL_MAX_MS,
  DUEL_MSG,
  DUEL_RANGE,
  DUEL_STATE_MS,
  PK_DAMAGE_MULT,
  canChallenge,
  duelChallengeFailMessage,
  parseDuelAnswer,
  parseDuelChallenge,
  type DuelChallengeFail,
  type DuelChallengeInput,
  type DuelParty,
} from "./duel";
import { DUNGEON_MSG } from "./dungeon";

describe("hằng số và tên tin nhắn", () => {
  it("hằng số dương, hữu hạn, quan hệ hợp lý (tầm thách < dây xích; đếm ngược < trận; hồi sinh trong (0, 1))", () => {
    for (const v of [
      DUEL_RANGE,
      DUEL_INVITE_TTL_MS,
      DUEL_COUNTDOWN_MS,
      DUEL_MAX_MS,
      DUEL_KO_MS,
      DUEL_LEASH_PX,
      DUEL_COOLDOWN_MS,
      DUEL_STATE_MS,
      DUEL_INVITES_MAX,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(Number.isInteger(DUEL_INVITES_MAX)).toBe(true);
    expect(DUEL_LEASH_PX).toBeGreaterThan(DUEL_RANGE);
    expect(DUEL_MAX_MS).toBeGreaterThan(DUEL_COUNTDOWN_MS);
    expect(DUEL_INVITE_TTL_MS).toBeGreaterThan(DUEL_COOLDOWN_MS / 2);
    expect(DUEL_KO_HP_PCT).toBeGreaterThan(0);
    expect(DUEL_KO_HP_PCT).toBeLessThan(1);
    expect(PK_DAMAGE_MULT).toBeGreaterThan(0);
    expect(PK_DAMAGE_MULT).toBeLessThanOrEqual(1);
  });

  it("tên tin nhắn không trùng nhau, đều bắt đầu bằng `duel`, không trùng tin của bí cảnh / đội", () => {
    const names = Object.values(DUEL_MSG);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^duel[A-Z]/);
    expect(DUEL_MSG.accept).toBe("duelAccept");
    expect(DUEL_MSG.decline).toBe("duelDecline");
    const others: string[] = [
      ...Object.values(DUNGEON_MSG),
      "partyInvite",
      "partyAccept",
      "partyDecline",
    ];
    for (const n of names) expect(others).not.toContain(n);
  });
});

describe.each([
  ["parseDuelChallenge", parseDuelChallenge, "name", "from"],
  ["parseDuelAnswer", parseDuelAnswer, "from", "name"],
] as const)("%s (không tin client)", (_label, parse, field, other) => {
  const ok = (name: string) => parse({ [field]: name } as never);

  it("nhận đạo hiệu hợp lệ và chuẩn hoá (NFC, gộp khoảng trắng, cắt hai đầu)", () => {
    expect(ok("Dao Truong")).toEqual({ [field]: "Dao Truong" });
    expect(ok("  Dao    Truong  ")).toEqual({ [field]: "Dao Truong" });
    expect(ok("Đạo Trưởng 7")).toEqual({ [field]: "Đạo Trưởng 7" });
    expect(ok("Dao\nTruong")).toEqual({ [field]: "Dao Truong" }); // xuống dòng được gộp như khoảng trắng (luật `cleanName` chung)
    expect(ok("TụSi".normalize("NFD"))).toEqual({ [field]: "TụSi".normalize("NFC") });
  });

  it("mọi thứ khác là null: sai kiểu, thiếu / sai trường, đạo hiệu sai luật", () => {
    const bad: unknown[] = [
      undefined,
      null,
      5,
      "Dao Truong",
      [],
      [{ [field]: "Dao Truong" }],
      {},
      { [other]: "Dao Truong" }, // trường của tin kia
      { [field]: 5 },
      { [field]: null },
      { [field]: {} },
      { [field]: ["Dao Truong"] },
      { [field]: "" },
      { [field]: " " },
      { [field]: "A" }, // quá ngắn
      { [field]: "A".repeat(40) }, // quá dài
      { [field]: "<script>alert(1)</script>" },
      { [field]: "Dao_Truong" },
      { [field]: "../etc/passwd" },
      { [field]: { toString: () => "Dao Truong" } },
    ];
    for (const b of bad) expect(parse(b as never), JSON.stringify(b)).toBeNull();
  });

  it("không mang trường lạ sang kết quả (không `__proto__`, không trường thừa)", () => {
    const raw = JSON.parse(
      `{"${field}":"Dao Truong","__proto__":{"x":1},"admin":true,"${other}":"Khac Nguoi"}`,
    );
    const r = parse(raw)!;
    expect(Object.keys(r)).toEqual([field]);
    expect((r as any).admin).toBeUndefined();
  });
});

describe("canChallenge", () => {
  const party = (name: string, over: Partial<DuelParty> = {}): DuelParty => ({
    name,
    alive: true,
    inSafe: false,
    inDuel: false,
    busy: false,
    ...over,
  });
  const input = (over: Partial<DuelChallengeInput> = {}): DuelChallengeInput => ({
    self: party("Alpha"),
    target: party("Bravo"),
    distance: 120,
    inDungeon: false,
    cooldownLeftMs: 0,
    pairCooldownLeftMs: 0,
    alreadyInvited: false,
    targetPendingInvites: 0,
    ...over,
  });

  it("đủ điều kiện thì ok", () => {
    expect(canChallenge(input())).toEqual({ ok: true });
  });

  it("từng lý do, đúng câu báo", () => {
    const cases: [DuelChallengeFail, Partial<DuelChallengeInput>][] = [
      ["self", { target: party("alpha") }], // không phân biệt hoa thường
      ["not_found", { target: null }],
      ["in_dungeon", { inDungeon: true }],
      ["not_alive", { self: party("Alpha", { alive: false }) }],
      ["in_duel", { self: party("Alpha", { inDuel: true }) }],
      ["safe_zone", { self: party("Alpha", { inSafe: true }) }],
      ["busy", { self: party("Alpha", { busy: true }) }],
      ["target_not_alive", { target: party("Bravo", { alive: false }) }],
      ["target_in_duel", { target: party("Bravo", { inDuel: true }) }],
      ["target_safe_zone", { target: party("Bravo", { inSafe: true }) }],
      ["target_busy", { target: party("Bravo", { busy: true }) }],
      ["too_far", { distance: DUEL_RANGE + 1 }],
      ["cooldown", { cooldownLeftMs: 1 }],
      ["pair_cooldown", { pairCooldownLeftMs: 1 }],
      ["already_invited", { alreadyInvited: true }],
      ["target_overloaded", { targetPendingInvites: DUEL_INVITES_MAX }],
    ];
    for (const [reason, over] of cases) {
      const r = canChallenge(input(over));
      expect(r, reason).toEqual({ ok: false, reason });
      expect(duelChallengeFailMessage(reason).length, reason).toBeGreaterThan(8);
    }
  });

  it("ranh giới: đúng tầm / ngay dưới giới hạn lời mời thì ok; số hỏng (NaN, Infinity, âm vô cực) không lọt", () => {
    expect(canChallenge(input({ distance: DUEL_RANGE }))).toEqual({ ok: true });
    expect(canChallenge(input({ distance: 0 }))).toEqual({ ok: true });
    expect(canChallenge(input({ targetPendingInvites: DUEL_INVITES_MAX - 1 }))).toEqual({
      ok: true,
    });
    expect(canChallenge(input({ cooldownLeftMs: 0 }))).toEqual({ ok: true });
    for (const d of [NaN, Infinity])
      expect(canChallenge(input({ distance: d })), String(d)).toEqual({
        ok: false,
        reason: "too_far",
      });
    expect(canChallenge(input({ cooldownLeftMs: NaN }))).toEqual({ ok: false, reason: "cooldown" });
    expect(canChallenge(input({ pairCooldownLeftMs: NaN }))).toEqual({
      ok: false,
      reason: "pair_cooldown",
    });
    expect(canChallenge(input({ targetPendingInvites: NaN }))).toEqual({
      ok: false,
      reason: "target_overloaded",
    });
  });

  it("thứ tự kiểm cố định: nhiều lỗi cùng lúc thì báo lỗi đầu tiên theo thứ tự", () => {
    const everything = input({
      self: party("Alpha", { alive: false, inDuel: true, inSafe: true, busy: true }),
      target: party("Bravo", { alive: false, inDuel: true, inSafe: true, busy: true }),
      distance: 9999,
      inDungeon: true,
      cooldownLeftMs: 5,
      pairCooldownLeftMs: 5,
      alreadyInvited: true,
      targetPendingInvites: 99,
    });
    const order: DuelChallengeFail[] = [];
    let cur: DuelChallengeInput = { ...everything };
    // bỏ dần từng lỗi theo đúng thứ tự mong đợi và ghi lại lý do báo ra
    const fixes: ((i: DuelChallengeInput) => DuelChallengeInput)[] = [
      (i) => ({ ...i, inDungeon: false }),
      (i) => ({ ...i, self: { ...i.self, alive: true } }),
      (i) => ({ ...i, self: { ...i.self, inDuel: false } }),
      (i) => ({ ...i, self: { ...i.self, inSafe: false } }),
      (i) => ({ ...i, self: { ...i.self, busy: false } }),
      (i) => ({ ...i, target: { ...i.target!, alive: true } }),
      (i) => ({ ...i, target: { ...i.target!, inDuel: false } }),
      (i) => ({ ...i, target: { ...i.target!, inSafe: false } }),
      (i) => ({ ...i, target: { ...i.target!, busy: false } }),
      (i) => ({ ...i, distance: 10 }),
      (i) => ({ ...i, cooldownLeftMs: 0 }),
      (i) => ({ ...i, pairCooldownLeftMs: 0 }),
      (i) => ({ ...i, alreadyInvited: false }),
      (i) => ({ ...i, targetPendingInvites: 0 }),
    ];
    for (const fix of fixes) {
      const r = canChallenge(cur);
      expect(r.ok).toBe(false);
      if (!r.ok) order.push(r.reason);
      cur = fix(cur);
    }
    expect(canChallenge(cur)).toEqual({ ok: true });
    expect(order).toEqual([
      "in_dungeon",
      "not_alive",
      "in_duel",
      "safe_zone",
      "busy",
      "target_not_alive",
      "target_in_duel",
      "target_safe_zone",
      "target_busy",
      "too_far",
      "cooldown",
      "pair_cooldown",
      "already_invited",
      "target_overloaded",
    ]);
    // chính mình / không tìm thấy đứng TRƯỚC mọi thứ khác
    expect(canChallenge({ ...everything, target: party("ALPHA") })).toEqual({
      ok: false,
      reason: "self",
    });
    expect(canChallenge({ ...everything, target: null })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("mọi lý do có câu báo riêng bằng tiếng Việt, không trùng nhau, không lộ số / id nội bộ", () => {
    const reasons: DuelChallengeFail[] = [
      "self",
      "not_found",
      "in_dungeon",
      "not_alive",
      "in_duel",
      "safe_zone",
      "busy",
      "target_not_alive",
      "target_in_duel",
      "target_safe_zone",
      "target_busy",
      "too_far",
      "cooldown",
      "pair_cooldown",
      "already_invited",
      "target_overloaded",
    ];
    const msgs = reasons.map((r) => duelChallengeFailMessage(r));
    expect(new Set(msgs).size).toBe(reasons.length);
    for (const m of msgs) {
      expect(m).not.toMatch(/\d/);
      expect(m).not.toMatch(/[_{}]|undefined|NaN/);
    }
  });
});
