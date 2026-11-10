// Gục trong bí cảnh KHÔNG mất kiếp (quyết định của người dùng 11/11/2026, docs/THIET_KE_BI_CANH.md mục 4.4): không `beginLimbo`,
// bị đẩy ra về cổng vào, mất lượt trong ngày, không thưởng, không vào lại; cả đội gục thì run thua. World giả, hai phòng chung Hub.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_FALL_EXIT_MS,
  DUNGEON_FALL_HP_PCT,
  DUNGEON_LOOT_MS,
  HAC_PHONG_ID,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  MONSTER_BY_ID,
  NPC_BY_ID,
  dayKey,
  dungeonOf,
  getMap,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { partyAnswer, partyInvite } from "./party";
import { hurtPlayer, killMonster } from "./combat";
import {
  DUNGEON_EXIT_DELAY_MS,
  GATEKEEPER_ID,
  enterDungeon,
  finishRun,
  memberJoined,
  openDungeon,
  tickDungeonRun,
  type Run,
} from "./dungeon";
import { tickWorld } from "./tick";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import type { Monster } from "../schema";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const LEADER = "Alpha";
const MEMBER = "Bravo";
const gate = NPC_BY_ID[GATEKEEPER_ID];
const key = (n: string) => n.toLowerCase();
const TICK = 50;

/** Run đã mở (đội A ở Lạc Hà + B ở Hắc Phong Cốc) và một World bí cảnh dùng chung Hub; chưa ai vào. */
function setup() {
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(HAC_PHONG, hub);
  const a = addPlayer(lh.w, LEADER, 1, 8);
  addPlayer(hp.w, MEMBER, 1, 8);
  hp.w.now = lh.w.now;
  a.p.x = gate.x;
  a.p.y = gate.y;
  partyInvite(lh.w, LEADER, MEMBER);
  partyAnswer(hp.w, MEMBER, LEADER, true);
  lh.w.now += 10_000;
  hp.w.now = lh.w.now;
  const run = openDungeon(lh.w, LEADER, { dungeonId: LINH_HU_ID })!;
  const dun = makeWorld(getMap(LINH_HU_MAP_ID)!, hub);
  dun.w.runId = run.id;
  dun.w.now = lh.w.now;
  dun.w.reincarnate = true; // như WorldRoom: chết ở phòng thường là luân hồi
  lh.w.reincarnate = true;
  return { hub, lh, run, dun, w: dun.w };
}
type T = ReturnType<typeof setup>;

/** Cả hai thành viên vào phòng bí cảnh (đang `running`). */
function bothInside(t: T) {
  for (const n of [LEADER, MEMBER]) {
    addPlayer(t.w, n, 1, 8);
    memberJoined(t.w, t.run, key(n));
  }
  // Như WorldRoom.handOff: đặt `travelling` ngay khi bắt đầu đưa đi
  t.w.onDungeonExit = vi.fn((sid: string) => {
    t.w.ctrl.get(sid)!.travelling = true;
  });
}
const exitMock = (t: T) => t.w.onDungeonExit as ReturnType<typeof vi.fn>;
const ctrl = (t: T, n: string) => t.w.ctrl.get(n)!;
const player = (t: T, n: string) => t.w.state.players.get(n)!;
const member = (t: T, n: string) => t.run.members.get(key(n))!;

/** Một đòn chí mạng lên `n` bằng đường thật (`hurtPlayer`: quái đánh). */
function lethalHit(t: T, n: string) {
  const p = player(t, n);
  const { m } = addMonster(t.w, "lang", p.x + 30, p.y);
  hurtPlayer(t.w, n, p, p.hp + 1000, m as Monster);
}
const step = (t: T, ms: number) => {
  for (let left = ms; left > 0; left -= TICK) {
    t.w.now += TICK;
    tickWorld(t.w, TICK);
  }
};

describe("hết khí huyết trong bí cảnh: không mất kiếp", () => {
  it("không Hoàng Tuyền, không mất gì, không Duyên; gục tại chỗ, quái bỏ mục tiêu; HUD thấy `alive: false`", () => {
    const t = setup();
    bothInside(t);
    const c = ctrl(t, LEADER);
    const before = {
      realm: player(t, LEADER).realm,
      tier: player(t, LEADER).tier,
      exp: player(t, LEADER).exp,
    };
    c.coin = 777;
    const lifeId = c.lifeId;
    const soul = structuredClone(c.soul);
    const { m, id } = addMonster(t.w, "lang", 1, 1);
    t.w.mctrl.get(id)!.target = LEADER;
    const onLimbo = vi.fn();
    t.w.onLimbo = onLimbo;
    t.dun.toasts.length = 0;

    lethalHit(t, LEADER);

    const p = player(t, LEADER);
    expect(c.limbo).toBeUndefined();
    expect(onLimbo).not.toHaveBeenCalled();
    expect(p.dead).toBe(true);
    expect(p.hp).toBe(0);
    expect([p.realm, p.tier, p.exp]).toEqual([before.realm, before.tier, before.exp]); // không đặt lại về Phàm Nhân
    expect(c.coin).toBe(777);
    expect(c.lifeId).toBe(lifeId);
    expect(c.soul).toEqual(soul); // không cộng Duyên, không đổi kiếp
    expect(t.w.mctrl.get(id)!.target).toBeNull();
    expect(c.reviveHpPct).toBe(DUNGEON_FALL_HP_PCT); // đứng dậy theo tỉ lệ của bí cảnh, không phải của thách đấu
    expect(c.reviveAt).toBe(t.w.now + DUNGEON_FALL_EXIT_MS);
    void m;
    expect(t.dun.toasts.at(-1)?.msg.text).toMatch(/Không mất kiếp/);
    // HUD: người gục là `left` + `fell`, hiện `alive: false`
    expect(member(t, LEADER)).toMatchObject({ status: "left", fell: true });
    expect(t.dun.dungeonStates.at(-1)!.msg.members).toEqual([
      { name: LEADER, alive: false },
      { name: MEMBER, alive: true },
    ]);
  });

  it("chỉ người gục nhận `dungeonFallen { exitInMs, rewardsLeft }` (đã trừ lượt); đồng đội không nhận; không có `dungeonEnd`", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    expect(t.dun.dungeonFallens).toEqual([
      {
        sid: LEADER,
        msg: { exitInMs: DUNGEON_FALL_EXIT_MS, rewardsLeft: DUNGEON_DAILY_REWARDS - 1 },
      },
    ]);
    expect(t.dun.dungeonEnds).toHaveLength(0);
    expect(t.run.phase).toBe("running"); // đồng đội còn sống: run tiếp tục
  });

  it("ở PHÒNG THƯỜNG vẫn luân hồi như cũ (đối chứng)", () => {
    const t = setup();
    addPlayer(t.lh.w, "Dave", 1, 8);
    const onLimbo = vi.fn();
    t.lh.w.onLimbo = onLimbo;
    const p = t.lh.w.state.players.get("Dave")!;
    const { m } = addMonster(t.lh.w, "lang", p.x + 30, p.y);
    hurtPlayer(t.lh.w, "Dave", p, p.hp + 1000, m as Monster);
    expect(t.lh.w.ctrl.get("Dave")!.limbo).toBeDefined();
    expect(onLimbo).toHaveBeenCalledTimes(1);
    expect(t.lh.dungeonFallens).toHaveLength(0);
  });

  it("đòn thứ hai lên người đã gục không trừ lượt lần nữa", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    lethalHit(t, LEADER);
    lethalHit(t, LEADER);
    expect(t.dun.dungeonFallens).toHaveLength(1);
    expect(ctrl(t, LEADER).save.dungeonDaily?.rewards).toBe(1);
  });
});

describe("mất lượt trong ngày", () => {
  it("trừ MỘT lượt vào `dungeonDaily` (hôm nay), ghi cùng hồ sơ; chưa có bộ đếm thì tạo", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    expect(ctrl(t, LEADER).save.dungeonDaily).toEqual({ day: dayKey(t.w.now), rewards: 1 });
    expect(ctrl(t, MEMBER).save.dungeonDaily).toBeUndefined(); // đồng đội không bị ảnh hưởng
  });

  it("đã dùng 2 lượt thì thành 3 (hết); đã hết lượt thì giữ nguyên, không vượt tối đa, `rewardsLeft` 0; bộ đếm của ngày khác coi như chưa dùng", () => {
    const t = setup();
    bothInside(t);
    ctrl(t, LEADER).save.dungeonDaily = {
      day: dayKey(t.w.now),
      rewards: DUNGEON_DAILY_REWARDS - 1,
    };
    ctrl(t, MEMBER).save.dungeonDaily = { day: dayKey(t.w.now), rewards: DUNGEON_DAILY_REWARDS };
    lethalHit(t, LEADER);
    lethalHit(t, MEMBER);
    expect(ctrl(t, LEADER).save.dungeonDaily).toEqual({
      day: dayKey(t.w.now),
      rewards: DUNGEON_DAILY_REWARDS,
    });
    expect(ctrl(t, MEMBER).save.dungeonDaily).toEqual({
      day: dayKey(t.w.now),
      rewards: DUNGEON_DAILY_REWARDS,
    });
    expect(t.dun.dungeonFallens.map((f) => [f.sid, f.msg.rewardsLeft])).toEqual([
      [LEADER, 0],
      [MEMBER, 0],
    ]);

    const u = setup();
    bothInside(u);
    ctrl(u, LEADER).save.dungeonDaily = { day: "2000-01-01", rewards: DUNGEON_DAILY_REWARDS };
    lethalHit(u, LEADER);
    expect(ctrl(u, LEADER).save.dungeonDaily).toEqual({ day: dayKey(u.w.now), rewards: 1 });
    expect(u.dun.dungeonFallens[0].msg.rewardsLeft).toBe(DUNGEON_DAILY_REWARDS - 1);
  });
});

describe("đứng dậy rồi bị đẩy ra", () => {
  it("nằm `DUNGEON_FALL_EXIT_MS`, đứng dậy với `DUNGEON_FALL_HP_PCT` khí huyết, rồi `onDungeonExit` đúng MỘT lần; không đẩy sớm", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    step(t, DUNGEON_FALL_EXIT_MS - 100);
    expect(player(t, LEADER).dead).toBe(true);
    expect(exitMock(t)).not.toHaveBeenCalled();
    step(t, 200);
    const p = player(t, LEADER);
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(Math.max(1, Math.round(p.maxHp * DUNGEON_FALL_HP_PCT)));
    expect(ctrl(t, LEADER).reviveHpPct).toBeUndefined(); // dùng một lần
    expect(exitMock(t).mock.calls.map((c) => c[0])).toEqual([LEADER]);
    // đang đi qua cổng (handOff đặt travelling): không gọi lại
    ctrl(t, LEADER).travelling = true;
    step(t, 5000);
    expect(exitMock(t)).toHaveBeenCalledTimes(1);
  });

  it("`reviveInPlace` đọc tỉ lệ khí huyết từ người chơi (`reviveHpPct`), không cứng theo thách đấu", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    ctrl(t, LEADER).reviveHpPct = 0.8; // giá trị khác hằng số bí cảnh để phân biệt với mặc định của thách đấu
    step(t, DUNGEON_FALL_EXIT_MS + 100);
    const p = player(t, LEADER);
    expect(p.hp).toBe(Math.round(p.maxHp * 0.8));
  });

  it("run kết thúc / bị xoá khỏi sổ TRƯỚC khi người gục đứng dậy: vẫn được đưa ra (không kẹt lại trong phòng)", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    finishRun(t.w, t.run, "lost", "timeout", 0);
    step(t, 200);
    expect(t.hub.runs.size).toBe(0); // run đã xoá, người gục còn nằm
    expect(exitMock(t)).not.toHaveBeenCalledWith(LEADER);
    step(t, DUNGEON_FALL_EXIT_MS);
    expect(exitMock(t).mock.calls.map((c) => c[0])).toContain(LEADER);
  });

  it("đưa ra lỗi (lưu hỏng, travelling gỡ lại): thử lại sau 2 giây, không dồn mỗi tick", () => {
    const t = setup();
    bothInside(t);
    t.w.onDungeonExit = vi.fn(); // lưu hỏng: không đặt `travelling` (hoặc đã gỡ lại)
    lethalHit(t, LEADER);
    step(t, DUNGEON_FALL_EXIT_MS + 100);
    expect(exitMock(t)).toHaveBeenCalledTimes(1);
    step(t, 1800);
    expect(exitMock(t)).toHaveBeenCalledTimes(1);
    step(t, 300);
    expect(exitMock(t)).toHaveBeenCalledTimes(2);
  });

  it("rớt mạng giữa lúc gục: ctrl biến mất, không gọi đẩy ra, không treo gì", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    t.w.state.players.delete(LEADER);
    t.w.ctrl.delete(LEADER);
    step(t, DUNGEON_FALL_EXIT_MS + 3000);
    expect(exitMock(t)).not.toHaveBeenCalled();
    expect(member(t, LEADER).status).toBe("left"); // vẫn không vào lại được
  });
});

describe("run: thưởng, vào lại, cả đội gục", () => {
  it("người gục KHÔNG nhận thưởng khi đồng đội hạ trùm và không nhận `dungeonEnd`; đồng đội nhận thưởng đúng", () => {
    const t = setup();
    bothInside(t);
    const def = dungeonOf(LINH_HU_ID)!;
    const boss = addMonster(t.w, def.boss, player(t, MEMBER).x + 40, player(t, MEMBER).y);
    const bossCtrl = t.w.mctrl.get(boss.id)!;
    bossCtrl.damageBy.set(LEADER, 500);
    bossCtrl.damageBy.set(MEMBER, 500);
    lethalHit(t, LEADER);
    const coinBefore = ctrl(t, LEADER).coin;
    killMonster(t.w, boss.id, bossCtrl);
    expect(t.run.phase).toBe("won");
    expect(ctrl(t, LEADER).coin).toBe(coinBefore); // không thưởng
    expect(t.dun.dungeonEnds.map((e) => e.sid)).toEqual([MEMBER]);
    expect(t.dun.dungeonEnds[0].msg.reward).toBeDefined();
    expect(ctrl(t, LEADER).save.dungeonDaily?.rewards).toBe(1); // lượt đã bị trừ, không bị trừ thêm
  });

  it("không vào lại được run đó: `dungeonEnter` bị từ chối", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    // từ Lạc Hà (người gục đã về), thử vào lại
    const back = addPlayer(t.lh.w, LEADER + "2", 1, 8); // chỗ trống cho test: dùng đúng tên thành viên bên dưới
    void back;
    t.lh.w.state.players.delete(LEADER + "2");
    t.lh.w.ctrl.delete(LEADER + "2");
    addPlayer(t.lh.w, LEADER, 1, 8);
    t.lh.w.now += 10_000;
    t.lh.w.onDungeonEnter = vi.fn();
    expect(enterDungeon(t.lh.w, LEADER, { runId: t.run.id })).toBe(false);
    expect(t.lh.w.onDungeonEnter).not.toHaveBeenCalled();
  });

  it("cả hai gục: run thua `all_dead`; không ai nhận `dungeonEnd` (đã nhận `dungeonFallen`); cả hai vẫn được đẩy ra dù run đã bị xoá khỏi sổ", () => {
    const t = setup();
    bothInside(t);
    lethalHit(t, LEADER);
    step(t, 100);
    expect(t.run.phase).toBe("running");
    lethalHit(t, MEMBER);
    step(t, 100);
    expect(t.run.phase).toBe("lost");
    expect(t.run.endReason).toBe("all_dead");
    expect(t.dun.dungeonEnds).toHaveLength(0);
    expect(t.dun.dungeonFallens.map((f) => f.sid).sort()).toEqual([LEADER, MEMBER].sort());
    // hết giờ chờ: run bị xoá khỏi sổ; người gục vẫn được đưa ra
    step(t, DUNGEON_EXIT_DELAY_MS + DUNGEON_FALL_EXIT_MS + 500);
    expect(t.hub.runs.size).toBe(0);
    expect(
      exitMock(t)
        .mock.calls.map((c) => c[0])
        .sort(),
    ).toEqual([LEADER, MEMBER].sort());
  });

  it("một người tự rời, người kia gục: `all_dead` (có người gục)", () => {
    const t = setup();
    bothInside(t);
    // MEMBER rời
    member(t, MEMBER).status = "left";
    t.w.state.players.delete(MEMBER);
    t.w.ctrl.delete(MEMBER);
    lethalHit(t, LEADER);
    step(t, 100);
    expect(t.run.endReason).toBe("all_dead");
  });

  it("đang nhặt đồ sau khi thắng: gục vẫn không mất kiếp và bị đẩy ra, nhưng KHÔNG trừ lượt thêm", () => {
    const t = setup();
    bothInside(t);
    finishRun(t.w, t.run, "won", "boss_dead", DUNGEON_LOOT_MS);
    t.dun.dungeonFallens.length = 0;
    lethalHit(t, LEADER);
    expect(ctrl(t, LEADER).limbo).toBeUndefined();
    expect(ctrl(t, LEADER).save.dungeonDaily).toBeUndefined();
    expect(t.dun.dungeonFallens[0].msg.rewardsLeft).toBe(DUNGEON_DAILY_REWARDS);
    step(t, DUNGEON_FALL_EXIT_MS + 100);
    expect(exitMock(t).mock.calls.map((c) => c[0])).toEqual([LEADER]);
  });

  it("thành viên chưa `inside` (còn được mời) hoặc người ngoài run bị đánh ngã trong phòng: không đụng tới run / lượt, vẫn không mất kiếp", () => {
    const t = setup();
    addPlayer(t.w, "Stranger", 1, 8);
    t.w.onDungeonExit = vi.fn();
    lethalHit(t, "Stranger");
    expect(ctrl(t, "Stranger").limbo).toBeUndefined();
    expect(ctrl(t, "Stranger").save.dungeonDaily).toBeUndefined();
    expect(t.run.members.get(key(LEADER))!.status).toBe("invited");
    expect(t.run.phase).toBe("gathering");
  });
});

describe("không phá những luật cũ", () => {
  it("người hồn lìa xác (rớt mạng, chờ nối lại) vẫn bất tử; người trong trận thách đấu không gục kiểu bí cảnh", () => {
    const t = setup();
    bothInside(t);
    t.w.ghosts.add(LEADER);
    lethalHit(t, LEADER);
    expect(player(t, LEADER).dead).toBe(false);
    expect(t.dun.dungeonFallens).toHaveLength(0);
  });

  it("`tickDungeonRun` ở phòng thường (runId null) và `MONSTER_BY_ID.lang` tồn tại (test dựng đúng)", () => {
    const t = setup();
    expect(MONSTER_BY_ID.lang).toBeDefined();
    expect(() => tickDungeonRun(t.lh.w)).not.toThrow();
    const run: Run = t.run;
    expect(run.phase).toBe("gathering");
  });
});
