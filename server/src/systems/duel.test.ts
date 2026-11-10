// PK thách đấu (M3 bước 5b): thách / nhận / từ chối, đếm ngược, sát thương chỉ giữa hai người, gục rồi đứng dậy tại chỗ,
// bất tử trước quái, khoá hồi phục / đan / đả tọa / qua cổng, mọi cách kết thúc, dọn lời mời và hồi chiêu. World giả.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP,
  DUEL_COOLDOWN_MS,
  DUEL_COUNTDOWN_MS,
  DUEL_INVITE_TTL_MS,
  DUEL_INVITES_MAX,
  DUEL_KO_HP_PCT,
  DUEL_KO_MS,
  DUEL_LEASH_PX,
  DUEL_MAX_MS,
  DUEL_RANGE,
  LINH_HU_MAP_ID,
  PK_DAMAGE_MULT,
  SKILLS,
  TICK_MS,
  TRAVEL_COMBAT_LOCK_MS,
  duelChallengeFailMessage,
  getMap,
  statsFor,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { hurtPlayer, slash, swordQi } from "./combat";
import { duelAnswer, duelChallenge, duelDrop, duelHit, duelYield, tickDuels } from "./duel";
import { setMeditating } from "./progression";
import { useItem } from "./inventory";
import { planTravel } from "./travel";
import { tickMonsters } from "./monsters";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const A = "Alpha";
const B = "Bravo";
const C = "Charlie";
const D = "Delta";
const E = "Echo";

/** Phòng Lạc Hà với vài người chơi đứng ngoài trấn, cách nhau 100 px, cùng một đồng hồ. */
function setup(names: string[] = [A, B, C]) {
  const t = makeWorld(DEFAULT_MAP, new Hub());
  const ps = names.map((n, i) => {
    const r = addPlayer(t.w, n, 1, 8);
    r.p.x += i * 45; // trong tầm chém
    return r;
  });
  return { ...t, ps };
}
type T = ReturnType<typeof setup>;
const lastToast = (t: T) => t.toasts.at(-1)?.msg.text;
const accept = (t: T, who: string, from: string) => duelAnswer(t.w, who, { from }, true);
const decline = (t: T, who: string, from: string) => duelAnswer(t.w, who, { from }, false);

/** A thách B và B nhận: trận ở pha đếm ngược. */
function startDuel(t: T, a = A, b = B) {
  duelChallenge(t.w, a, { name: b });
  accept(t, b, a);
  const d = t.w.duels.of(a)!;
  expect(d).toBeDefined();
  return d;
}
/** Tới pha đánh. */
function toFight(t: T) {
  t.w.now += DUEL_COUNTDOWN_MS + 1;
  tickDuels(t.w);
}
/** Quay A về phía B để chém trúng. */
const angleAB = (t: T, a = A, b = B) => {
  const pa = t.w.state.players.get(a)!;
  const pb = t.w.state.players.get(b)!;
  return Math.atan2(pb.y - pa.y, pb.x - pa.x);
};

describe("thách đấu (duelChallenge)", () => {
  it("hợp lệ: lời mời tới đúng người (tên người thách, TTL), người thách nhận toast, mở hồi chiêu", () => {
    const t = setup();
    duelChallenge(t.w, A, { name: B });
    expect(t.duelInvites).toEqual([{ sid: B, msg: { from: A, ttlMs: DUEL_INVITE_TTL_MS } }]);
    expect(lastToast(t)).toBe(`Đã thách đấu ${B}.`);
    expect(t.w.duels.invitesSize).toBe(1);
    expect(t.w.duels.cooldownSize).toBe(1);
    expect(t.w.duels.size).toBe(0); // chưa nhận thì chưa có trận
    expect(t.ps[0].p.duel).toBe(false);
  });

  it("từ chối và báo đúng lý do: không tìm thấy, chính mình, khu an toàn (cả hai phía), quá xa, trọng thương, bận, bí cảnh", () => {
    const fail = (
      t: T,
      reason: Parameters<typeof duelChallengeFailMessage>[0],
      name = B,
      who = A,
    ) => {
      t.toasts.length = 0;
      duelChallenge(t.w, who, { name });
      expect(t.duelInvites, reason).toHaveLength(0);
      expect(lastToast(t), reason).toBe(duelChallengeFailMessage(reason));
    };
    let t = setup();
    fail(t, "not_found", "Nguoi La");
    fail(t, "self", A);
    fail(t, "self", A.toUpperCase()); // không phân biệt hoa thường
    t = setup();
    t.ps[0].p.x = DEFAULT_MAP.townPx.x;
    t.ps[0].p.y = DEFAULT_MAP.townPx.y; // người thách trong trấn
    fail(t, "safe_zone");
    t = setup();
    t.ps[1].p.x = DEFAULT_MAP.townPx.x;
    t.ps[1].p.y = DEFAULT_MAP.townPx.y; // đối thủ trong trấn
    fail(t, "target_safe_zone");
    t = setup();
    t.ps[1].p.x += DUEL_RANGE + 500;
    fail(t, "too_far");
    t = setup();
    t.ps[0].p.dead = true;
    fail(t, "not_alive");
    t = setup();
    t.ps[1].p.dead = true;
    fail(t, "target_not_alive");
    t = setup();
    t.ps[0].c.lastHitAt = t.w.now; // vừa bị đánh
    fail(t, "busy");
    t = setup();
    t.ps[1].c.travelling = true;
    fail(t, "target_busy");
    t = setup();
    t.w.ghosts.add(B);
    fail(t, "target_busy");
    // bí cảnh
    const d = makeWorld(getMap(LINH_HU_MAP_ID)!, new Hub());
    const x = addPlayer(d.w, A, 1, 8);
    const y = addPlayer(d.w, B, 1, 8);
    x.p.x = d.w.map.townPx.x + d.w.map.townPx.r + 300;
    y.p.x = x.p.x + 50;
    y.p.y = x.p.y = d.w.map.townPx.y;
    duelChallenge(d.w, A, { name: B });
    expect(d.duelInvites).toHaveLength(0);
    expect(d.toasts.at(-1)?.msg.text).toBe(duelChallengeFailMessage("in_dungeon"));
  });

  it("tin rác (kiểu sai, tên sai luật) im lặng, không lời mời, không toast", () => {
    const t = setup();
    for (const bad of [
      undefined,
      null,
      5,
      "Bravo",
      [],
      {},
      { name: 5 },
      { name: "" },
      { name: "<b>" },
      { from: B },
    ])
      duelChallenge(t.w, A, bad);
    expect(t.duelInvites).toHaveLength(0);
    expect(t.toasts).toHaveLength(0);
    expect(t.w.duels.cooldownSize).toBe(0);
  });

  it("hồi chiêu mỗi người thách, không mời trùng, tối đa `DUEL_INVITES_MAX` lời mời tới một người", () => {
    const t = setup([A, B, C, D, E]);
    duelChallenge(t.w, A, { name: B });
    t.toasts.length = 0;
    duelChallenge(t.w, A, { name: C }); // A còn hồi chiêu
    expect(lastToast(t)).toBe(duelChallengeFailMessage("cooldown"));
    t.w.now += DUEL_COOLDOWN_MS;
    duelChallenge(t.w, A, { name: B }); // hết hồi chiêu nhưng lời mời cũ còn hạn
    expect(lastToast(t)).toBe(duelChallengeFailMessage("already_invited"));
    // nhiều người cùng thách B
    duelChallenge(t.w, C, { name: B });
    duelChallenge(t.w, D, { name: B });
    expect(t.w.duels.invitesSize).toBe(DUEL_INVITES_MAX);
    t.toasts.length = 0;
    duelChallenge(t.w, E, { name: B });
    expect(lastToast(t)).toBe(duelChallengeFailMessage("target_overloaded"));
  });
});

describe("trả lời (duelAnswer)", () => {
  it("nhận: trận bắt đầu ở pha đếm ngược; cờ công khai bật; cả hai nhận `duelState`; quái bỏ mục tiêu; lời mời khác của hai người mất hiệu lực", () => {
    const t = setup([A, B, C, D]);
    const mon = addMonster(t.w, "lang", 5, 5);
    mon.mc.target = B;
    duelChallenge(t.w, C, { name: A }); // lời mời khác tới A
    duelChallenge(t.w, A, { name: B });
    accept(t, B, A);
    const d = t.w.duels.of(A)!;
    expect(t.w.duels.of(B)).toBe(d);
    expect(d.phase).toBe("countdown");
    expect(t.w.duels.size).toBe(1);
    expect(t.ps[0].p.duel && t.ps[1].p.duel).toBe(true);
    expect(t.ps[2].p.duel).toBe(false);
    expect(t.duelStates.map((s) => [s.sid, s.msg.opponent, s.msg.phase]).sort()).toEqual([
      [A, B, "countdown"],
      [B, A, "countdown"],
    ]);
    expect(t.duelStates[0].msg.startsInMs).toBe(DUEL_COUNTDOWN_MS);
    expect(mon.mc.target).toBeNull();
    expect(t.w.duels.invitesSize).toBe(0); // lời mời C -> A bị huỷ
  });

  it("từ chối: người thách nhận toast, lời mời dùng một lần, hồi chiêu theo cặp (không thách lại ngay dù người thách đã hết hồi chiêu)", () => {
    const t = setup();
    duelChallenge(t.w, A, { name: B });
    t.w.now += 5000; // B nghĩ một lát rồi từ chối
    t.toasts.length = 0;
    decline(t, B, A);
    expect(t.toasts.some((x) => x.sid === A && x.msg.text === `${B} từ chối lời thách đấu.`)).toBe(
      true,
    );
    expect(t.w.duels.invitesSize).toBe(0);
    accept(t, B, A); // lời mời đã dùng
    expect(lastToast(t)).toBe("Không có lời thách đấu nào từ người này.");
    expect(t.w.duels.size).toBe(0);
    // hồi chiêu của A hết (10 s từ lúc thách) nhưng cặp A-B còn khoá (10 s từ lúc từ chối)
    t.w.now += DUEL_COOLDOWN_MS - 4000;
    t.duelInvites.length = 0;
    t.toasts.length = 0;
    duelChallenge(t.w, A, { name: B });
    expect(t.duelInvites).toHaveLength(0);
    expect(lastToast(t)).toBe(duelChallengeFailMessage("pair_cooldown"));
    t.w.now += 5000;
    duelChallenge(t.w, A, { name: B });
    expect(t.duelInvites).toHaveLength(1);
  });

  it("nhận hai lần / lời mời không tồn tại / người lạ: không có trận, báo lý do", () => {
    const t = setup();
    accept(t, B, A);
    expect(lastToast(t)).toBe("Không có lời thách đấu nào từ người này.");
    accept(t, B, "Nguoi La");
    duelAnswer(t.w, B, { from: 5 }, true);
    duelAnswer(t.w, B, undefined, true);
    expect(t.w.duels.size).toBe(0);
    startDuel(t);
    t.toasts.length = 0;
    accept(t, B, A);
    expect(t.w.duels.size).toBe(1); // không thêm trận
  });

  it("lời mời hết hạn: nhận không được", () => {
    const t = setup();
    duelChallenge(t.w, A, { name: B });
    t.w.now += DUEL_INVITE_TTL_MS + 1;
    accept(t, B, A);
    expect(lastToast(t)).toBe("Lời thách đấu đã hết hạn.");
    expect(t.w.duels.size).toBe(0);
  });

  it("kiểm LẠI lúc nhận: người thách đi xa / vào trấn / chết / vào trận khác thì lời mời không còn hiệu lực", () => {
    const stale = (mutate: (t: T) => void) => {
      const t = setup([A, B, C, D]);
      duelChallenge(t.w, A, { name: B });
      mutate(t);
      t.toasts.length = 0;
      accept(t, B, A);
      expect(t.w.duels.of(A)?.b === B).toBeFalsy();
      expect(lastToast(t)).toBe("Lời thách đấu không còn hiệu lực.");
    };
    stale((t) => (t.ps[0].p.x += DUEL_RANGE + 500));
    stale((t) => {
      t.ps[0].p.x = DEFAULT_MAP.townPx.x;
      t.ps[0].p.y = DEFAULT_MAP.townPx.y;
    });
    stale((t) => (t.ps[0].p.dead = true));
    stale((t) => (t.ps[1].p.dead = true));
    stale((t) => (t.ps[1].c.lastHitAt = t.w.now));
  });
});

describe("trận: đếm ngược, sát thương, kết thúc", () => {
  it("đếm ngược: chưa ai gây sát thương được; hết đếm ngược thì sang `fight` và nhận `duelState`", () => {
    const t = setup();
    startDuel(t);
    const hp = t.ps[1].p.hp;
    expect(duelHit(t.w, A, B, 1)).toBe(false);
    slash(t.w, A, angleAB(t));
    expect(t.ps[1].p.hp).toBe(hp);
    t.duelStates.length = 0;
    toFight(t);
    expect(t.w.duels.of(A)!.phase).toBe("fight");
    expect(t.duelStates.every((s) => s.msg.phase === "fight" && s.msg.startsInMs === 0)).toBe(true);
    t.ps[0].c.nextSlash = 0;
    slash(t.w, A, angleAB(t));
    expect(t.ps[1].p.hp).toBeLessThan(hp);
  });

  it("sát thương theo `atk * mult * PK_DAMAGE_MULT` (dao động + bạo kích), hiện bằng `dmg` tới vùng nhìn, đối thủ trúng, người ngoài KHÔNG", () => {
    const t = setup();
    startDuel(t);
    toFight(t);
    const atk = statsFor(1, 8, t.ps[0].p, t.ps[0].c.mult).atk;
    const lo = Math.round(atk * SKILLS.slash.mult * PK_DAMAGE_MULT * 0.9);
    const hi = Math.round(atk * SKILLS.slash.mult * PK_DAMAGE_MULT * 1.1 * 1.8) + 1;
    // C đứng cùng hướng, sát B: nhưng không trong trận
    t.ps[2].p.x = t.ps[1].p.x + 20;
    t.ps[2].p.y = t.ps[1].p.y;
    const hpB = t.ps[1].p.hp;
    const hpC = t.ps[2].p.hp;
    slash(t.w, A, angleAB(t));
    const lost = hpB - t.ps[1].p.hp;
    expect(lost).toBeGreaterThanOrEqual(Math.max(1, lo));
    expect(lost).toBeLessThanOrEqual(hi);
    expect(t.ps[2].p.hp).toBe(hpC);
    expect(duelHit(t.w, A, C, 5)).toBe(false); // không phải đối thủ: không trúng dù gọi thẳng
    expect(t.ps[2].p.hp).toBe(hpC);
    expect(t.dmgs.at(-1)).toMatchObject({ target: B, amount: lost, toPlayer: true });
    // người ngoài đánh người trong trận: không trúng
    t.ps[2].c.nextSlash = 0;
    slash(t.w, C, Math.atan2(t.ps[1].p.y - t.ps[2].p.y, t.ps[1].p.x - t.ps[2].p.x));
    expect(t.ps[1].p.hp).toBe(hpB - lost);
    // người trong trận đánh người ngoài: không trúng
    t.ps[0].c.nextSlash = 0;
    t.ps[2].p.x = t.ps[0].p.x - 40;
    t.ps[2].p.y = t.ps[0].p.y;
    slash(t.w, A, Math.PI);
    expect(t.ps[2].p.hp).toBe(hpC);
  });

  it("kiếm khí: tia thẳng trúng đối thủ trong tầm, không trúng người ngoài trên tia", () => {
    const t = setup();
    startDuel(t);
    toFight(t);
    t.ps[0].p.mp = t.ps[0].p.maxMp;
    t.ps[2].p.x = t.ps[1].p.x + 30;
    t.ps[2].p.y = t.ps[1].p.y;
    const hpB = t.ps[1].p.hp;
    const hpC = t.ps[2].p.hp;
    swordQi(t.w, A, angleAB(t));
    expect(t.ps[1].p.hp).toBeLessThan(hpB);
    expect(t.ps[2].p.hp).toBe(hpC);
  });

  it("hết khí huyết = KO: người thắng / thua nhận `duelEnd`; người thua gục rồi ĐỨNG DẬY TẠI CHỖ với 30% khí huyết; KHÔNG mất kiếp, không mất gì", () => {
    const t = setup();
    t.w.reincarnate = true; // chết do quái sẽ đi nhánh luân hồi: PK tuyệt đối không được vào đó
    const onLimbo = vi.fn();
    t.w.onLimbo = onLimbo;
    startDuel(t);
    toFight(t);
    const b = t.ps[1];
    b.c.coin = 123;
    b.c.inv[0] = { itemId: "hoi_huyet_dan", qty: 5 };
    const exp = b.p.exp;
    const at = { x: b.p.x, y: b.p.y };
    b.p.hp = 1;
    t.ps[0].c.nextSlash = 0;
    slash(t.w, A, angleAB(t));
    expect(t.duelEnds.map((e) => [e.sid, e.msg.result, e.msg.reason]).sort()).toEqual([
      [A, "won", "ko"],
      [B, "lost", "ko"],
    ]);
    expect(t.w.duels.size).toBe(0);
    expect(t.ps[0].p.duel || b.p.duel).toBe(false);
    expect(b.p.dead).toBe(true);
    expect(b.c.reviveAt).toBe(t.w.now + DUEL_KO_MS);
    expect(onLimbo).not.toHaveBeenCalled();
    expect(b.c.limbo).toBeUndefined();
    // đứng dậy tại chỗ sau DUEL_KO_MS (qua tickWorld thật), không về trấn
    t.w.now += DUEL_KO_MS - 100;
    tickWorld(t.w, TICK_MS);
    expect(b.p.dead).toBe(true);
    t.w.now += 200;
    tickWorld(t.w, TICK_MS);
    expect(b.p.dead).toBe(false);
    expect(b.c.reviveAt).toBeUndefined();
    expect([b.p.x, b.p.y]).toEqual([at.x, at.y]);
    expect(b.p.hp).toBe(Math.max(1, Math.round(b.p.maxHp * DUEL_KO_HP_PCT)));
    expect(b.c.coin).toBe(123);
    expect(b.c.inv[0]).toEqual({ itemId: "hoi_huyet_dan", qty: 5 });
    expect(b.p.exp).toBe(exp);
    expect(onLimbo).not.toHaveBeenCalled();
    // đánh tiếp sau trận: không còn trúng nhau
    t.ps[0].c.nextSlash = 0;
    const hp = b.p.hp;
    slash(t.w, A, angleAB(t));
    expect(b.p.hp).toBe(hp);
  });

  it("đầu hàng: người kia thắng, người đầu hàng không gục và giữ khí huyết; đầu hàng cả trong lúc đếm ngược", () => {
    const t = setup();
    startDuel(t);
    t.ps[1].p.hp = 77;
    duelYield(t.w, B);
    expect(t.duelEnds.map((e) => [e.sid, e.msg.result, e.msg.reason]).sort()).toEqual([
      [A, "won", "yield"],
      [B, "lost", "yield"],
    ]);
    expect(t.ps[1].p.dead).toBe(false);
    expect(t.ps[1].p.hp).toBe(77);
    expect(t.w.duels.size).toBe(0);
    duelYield(t.w, B); // không có trận: bỏ qua
    expect(t.duelEnds).toHaveLength(2);
  });

  it("bỏ chạy: vào khu an toàn hoặc rời quá `DUEL_LEASH_PX` thì thua (không gục); hai trường hợp đều báo `fled`", () => {
    let t = setup();
    startDuel(t);
    toFight(t);
    t.ps[0].p.x = DEFAULT_MAP.townPx.x;
    t.ps[0].p.y = DEFAULT_MAP.townPx.y;
    tickDuels(t.w);
    expect(t.duelEnds.map((e) => [e.sid, e.msg.result, e.msg.reason]).sort()).toEqual([
      [A, "lost", "fled"],
      [B, "won", "fled"],
    ]);
    expect(t.ps[0].p.dead).toBe(false);
    t = setup();
    startDuel(t);
    toFight(t);
    t.ps[1].p.x += DUEL_LEASH_PX + 300;
    tickDuels(t.w);
    expect(t.duelEnds.find((e) => e.sid === B)!.msg).toEqual({ result: "lost", reason: "fled" });
    expect(t.duelEnds.find((e) => e.sid === A)!.msg).toEqual({ result: "won", reason: "fled" });
  });

  it("hết `DUEL_MAX_MS`: HOÀ, giữ nguyên khí huyết", () => {
    const t = setup();
    startDuel(t);
    toFight(t);
    t.ps[0].p.hp = 200;
    t.w.now += DUEL_MAX_MS;
    tickDuels(t.w);
    expect(t.duelEnds.every((e) => e.msg.result === "draw" && e.msg.reason === "timeout")).toBe(
      true,
    );
    expect(t.duelEnds).toHaveLength(2);
    expect(t.ps[0].p.hp).toBe(200);
    expect(t.ps[0].p.dead || t.ps[1].p.dead).toBe(false);
  });

  it("rớt mạng (hồn lìa xác) / rời phòng / qua cổng: huỷ trận, HOÀ; rời phòng dọn lời mời và hồi chiêu", () => {
    let t = setup();
    startDuel(t);
    t.w.ghosts.add(B);
    tickDuels(t.w);
    expect(t.duelEnds.every((e) => e.msg.result === "draw" && e.msg.reason === "disconnect")).toBe(
      true,
    );
    expect(t.ps[0].p.duel).toBe(false);

    t = setup([A, B, C]);
    startDuel(t);
    duelChallenge(t.w, C, { name: A }); // C còn lời mời tới A (đang trong trận): bị từ chối; thử với người khác
    duelDrop(t.w, B); // B rời phòng
    expect(t.duelEnds.find((e) => e.sid === A)!.msg).toEqual({
      result: "draw",
      reason: "disconnect",
    });
    expect(t.w.duels.size).toBe(0);
    expect(t.ps[0].p.duel).toBe(false);

    t = setup();
    startDuel(t);
    t.ps[1].c.travelling = true;
    tickDuels(t.w);
    expect(t.w.duels.size).toBe(0);

    // rời phòng sạch mọi dấu vết của người đó
    t = setup();
    duelChallenge(t.w, A, { name: B });
    expect(t.w.duels.invitesSize + t.w.duels.cooldownSize).toBeGreaterThan(0);
    duelDrop(t.w, A);
    duelDrop(t.w, B);
    expect(t.w.duels.invitesSize).toBe(0);
    expect(t.w.duels.cooldownSize).toBe(0);
  });

  it("kết thúc là một lần (idempotent): đầu hàng rồi hết giờ không gửi `duelEnd` thêm", () => {
    const t = setup();
    startDuel(t);
    duelYield(t.w, A);
    t.w.now += DUEL_MAX_MS * 2;
    tickDuels(t.w);
    expect(t.duelEnds).toHaveLength(2);
  });
});

describe("người trong trận: bất tử trước quái và các khoá", () => {
  it("quái không làm hại người trong trận (kể cả đòn đủ giết) và không nhắm họ; hết trận thì lại bị đánh như thường", () => {
    const t = setup();
    t.w.reincarnate = true;
    const onLimbo = vi.fn();
    t.w.onLimbo = onLimbo;
    startDuel(t);
    toFight(t);
    const m = addMonster(t.w, "ho", t.ps[1].p.x, t.ps[1].p.y);
    const hp = t.ps[1].p.hp;
    hurtPlayer(t.w, B, t.ps[1].p, 999999, t.w.state.monsters.get(m.id)!);
    expect(t.ps[1].p.hp).toBe(hp);
    expect(t.ps[1].p.dead).toBe(false);
    for (let i = 0; i < 100; i++) {
      t.w.now += TICK_MS;
      tickMonsters(t.w, TICK_MS / 1000);
    }
    expect(m.mc.target === A || m.mc.target === B).toBe(false);
    expect(t.ps[1].p.hp).toBe(hp);
    expect(onLimbo).not.toHaveBeenCalled();
    // hết trận: không còn miễn nhiễm
    duelYield(t.w, B);
    t.ps[1].p.hp = 10;
    hurtPlayer(t.w, B, t.ps[1].p, 999999, t.w.state.monsters.get(m.id)!);
    expect(onLimbo).toHaveBeenCalledTimes(1);
  });

  it("không hồi phục, không đả tọa, không uống đan hồi huyết trong trận; đan hồi linh vẫn dùng được", () => {
    const t = setup();
    startDuel(t);
    toFight(t);
    const b = t.ps[1];
    b.p.hp = Math.round(b.p.maxHp / 2);
    b.p.mp = 1;
    b.c.inv[0] = { itemId: "hoi_huyet_dan", qty: 3 };
    b.c.inv[1] = { itemId: "hoi_linh_dan", qty: 3 };
    setMeditating(t.w, B, true);
    expect(b.p.meditating).toBe(false);
    const hp = b.p.hp;
    for (let i = 0; i < 100; i++) {
      t.w.now += TICK_MS;
      tickWorld(t.w, TICK_MS);
    }
    expect(b.p.hp).toBe(hp);
    expect(b.p.mp).toBe(1);
    t.toasts.length = 0;
    useItem(t.w, B, 0);
    expect(b.p.hp).toBe(hp);
    expect(b.c.inv[0]!.qty).toBe(3);
    expect(lastToast(t)).toMatch(/thách đấu/);
    useItem(t.w, B, 1);
    expect(b.p.mp).toBeGreaterThan(1);
    // hết trận: uống được lại
    duelYield(t.w, A);
    useItem(t.w, B, 0);
    expect(b.p.hp).toBeGreaterThan(hp);
  });

  it("không qua cổng khi đang trong trận", () => {
    const t = setup();
    const portal = DEFAULT_MAP.portals[0];
    t.ps[0].p.x = portal.x;
    t.ps[0].p.y = portal.y;
    t.ps[1].p.x = portal.x + 50;
    t.ps[1].p.y = portal.y;
    // cổng có khu an toàn: ra ngoài rồi đấu, sau đó quay lại gần cổng (còn trong tầm cổng nhưng ngoài khu an toàn là khó): kiểm trực tiếp
    t.w.duels._start({ a: A, b: B, phase: "fight", fightAt: 0, endsAt: Infinity, ox: 0, oy: 0 });
    expect(planTravel(t.w, A, portal.id)).toBeNull();
    expect(lastToast(t)).toMatch(/thách đấu/);
  });
});

describe("dọn dẹp lời mời và hồi chiêu (không rò)", () => {
  it("lời mời hết hạn: người thách nhận toast, khoá theo cặp, sổ về 0 sau khi hết hồi chiêu và qua nhịp quét", () => {
    const t = setup();
    duelChallenge(t.w, A, { name: B });
    t.w.now += DUEL_INVITE_TTL_MS + 1;
    tickDuels(t.w);
    expect(t.w.duels.invitesSize).toBe(0);
    expect(
      t.toasts.some((x) => x.sid === A && x.msg.text === `${B} không trả lời lời thách đấu.`),
    ).toBe(true);
    t.w.now += DUEL_COOLDOWN_MS + 1000;
    tickDuels(t.w);
    expect(t.w.duels.cooldownSize).toBe(0);
    expect(t.w.duels.idle).toBe(true);
  });

  it("nhiều chu kỳ thách / nhận / từ chối / hết hạn / rời phòng: mọi sổ về 0", () => {
    const t = setup([A, B, C, D]);
    for (let i = 0; i < 30; i++) {
      const [x, y] = i % 2 ? [A, B] : [C, D];
      duelChallenge(t.w, x, { name: y });
      if (i % 3 === 0) accept(t, y, x);
      else if (i % 3 === 1) decline(t, y, x);
      if (t.w.duels.of(x)) duelYield(t.w, x);
      t.w.now += DUEL_INVITE_TTL_MS + DUEL_COOLDOWN_MS + 1000;
      tickDuels(t.w);
    }
    t.w.now += DUEL_INVITE_TTL_MS + DUEL_COOLDOWN_MS + 2000;
    tickDuels(t.w);
    expect(t.w.duels.size).toBe(0);
    expect(t.w.duels.invitesSize).toBe(0);
    expect(t.w.duels.cooldownSize).toBe(0);
    for (const r of t.ps) expect(r.p.duel).toBe(false);
  });

  it("không có trận, lời mời hay hồi chiêu thì `tickDuels` không làm gì (đường nóng)", () => {
    const t = setup();
    expect(t.w.duels.idle).toBe(true);
    expect(() => tickDuels(t.w)).not.toThrow();
    expect(t.w.duels.nextSweepAt).toBe(0);
  });
});

describe("khoá thời gian khi vừa bị đánh", () => {
  it("người vừa bị quái đánh (`TRAVEL_COMBAT_LOCK_MS`) chưa thách / nhận được; hết khoá thì được", () => {
    const t = setup();
    t.ps[1].c.lastHitAt = t.w.now;
    duelChallenge(t.w, A, { name: B });
    expect(lastToast(t)).toBe(duelChallengeFailMessage("target_busy"));
    t.w.now += TRAVEL_COMBAT_LOCK_MS + 1;
    t.toasts.length = 0;
    duelChallenge(t.w, A, { name: B });
    expect(t.duelInvites).toHaveLength(1);
  });
});
