// Bí cảnh, phần sảnh (M3 bước 4b-1): mở, mời, vào, từ chối, hết hạn mời, hộp thoại Thủ môn. World giả, nhiều phòng dùng chung Hub.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_INVITE_MS,
  DUNGEON_LOOT_MS,
  DUNGEON_OPEN_COOLDOWN_MS,
  HAC_PHONG_ID,
  LINH_HU_ID,
  LINH_HU_MAP_ID,
  MAX_DUNGEON_RUNS,
  NPC_BY_ID,
  RUN_ID_RE,
  TRAVEL_COMBAT_LOCK_MS,
  dungeonOf,
  dungeonOpenFailMessage,
  dayKey,
  getMap,
  INVENTORY_SLOTS,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { partyAnswer, partyInvite } from "./party";
import { killMonster } from "./combat";
import {
  GATEKEEPER_ID,
  bossKilled,
  DUNGEON_EXIT_DELAY_MS,
  declineDungeon,
  dungeonDialog,
  enterDungeon,
  finishRun,
  leaveDungeon,
  memberJoined,
  memberLeft,
  openDungeon,
  runFailed,
  runOfWorld,
  sanitizeDungeonDaily,
  runReady,
  sendDungeonState,
  tickDungeonRun,
  tickDungeons,
  type Run,
} from "./dungeon";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const LEADER = "Alpha"; // ở Lạc Hà, đứng cạnh Thủ môn
const MEMBER = "Bravo"; // ở Hắc Phong Cốc
const THIRD = "Charlie"; // ở Lạc Hà, không trong đội
const gate = NPC_BY_ID[GATEKEEPER_ID];
const key = (n: string) => n.toLowerCase();

/** Đội A (đội trưởng, Lạc Hà) + B (Hắc Phong Cốc) đủ cảnh giới, hai phòng dùng chung một Hub. */
function setup(over: { memberRealm?: number; memberTier?: number } = {}) {
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(HAC_PHONG, hub);
  const a = addPlayer(lh.w, LEADER, 1, 8);
  addPlayer(lh.w, THIRD, 1, 8);
  addPlayer(hp.w, MEMBER, over.memberRealm ?? 1, over.memberTier ?? 8);
  hp.w.now = lh.w.now;
  a.p.x = gate.x;
  a.p.y = gate.y;
  partyInvite(lh.w, LEADER, MEMBER);
  partyAnswer(hp.w, MEMBER, LEADER, true);
  lh.w.now += 10_000; // qua hồi chiêu mời đội
  hp.w.now = lh.w.now;
  lh.toasts.length = 0;
  hp.toasts.length = 0;
  lh.parties.length = 0;
  hp.parties.length = 0;
  return { hub, lh, hp };
}
type T = ReturnType<typeof setup>;
const lastToast = (r: { toasts: { msg: { text: string } }[] }) => r.toasts.at(-1)?.msg.text;

function open(t: T): Run {
  const run = openDungeon(t.lh.w, LEADER, { dungeonId: LINH_HU_ID });
  expect(run).not.toBeNull();
  return run!;
}

/** Run giả đủ trường (test sổ run). */
function fakeRun(leader: string, over: Partial<Run> = {}): Run {
  return {
    id: leader.padStart(32, "0"),
    dungeonId: LINH_HU_ID,
    roomId: `r-${leader}`,
    leader,
    members: new Map([[leader, { key: leader, name: leader, status: "invited" }]]),
    phase: "gathering",
    openedAt: 0,
    inviteUntil: Infinity,
    startedAt: null,
    deadline: Infinity,
    exitAt: null,
    endReason: null,
    ...over,
  };
}

describe("mở bí cảnh (dungeonOpen)", () => {
  it("đội trưởng đủ điều kiện: lập run `gathering`, mời CẢ HAI người (kể cả người ở phòng khác) với runId 128 bit, tên đội trưởng, hạn mời, số lượt thưởng", () => {
    const t = setup();
    const run = open(t);
    expect(run.id).toMatch(RUN_ID_RE);
    expect(run.phase).toBe("gathering");
    expect(run.leader).toBe(key(LEADER));
    expect([...run.members.keys()]).toEqual([key(LEADER), key(MEMBER)]);
    expect([...run.members.values()].map((m) => m.status)).toEqual(["invited", "invited"]);
    expect(run.inviteUntil).toBe(t.lh.w.now + DUNGEON_INVITE_MS);
    expect(run.roomId).toMatch(/^test-/); // không có hook phòng: id giả, sẵn sàng ngay
    expect(t.hub.runs.size).toBe(1);
    expect(t.hub.runs.ofKey(key(MEMBER))).toBe(run);
    const expected = {
      runId: run.id,
      dungeonId: LINH_HU_ID,
      from: LEADER,
      expiresInMs: DUNGEON_INVITE_MS,
      rewardsLeft: DUNGEON_DAILY_REWARDS,
    };
    expect(t.lh.dungeonInvites).toEqual([{ sid: LEADER, msg: expected }]);
    expect(t.hp.dungeonInvites).toEqual([{ sid: MEMBER, msg: expected }]);
  });

  it("mỗi lần mở một runId khác nhau", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t = setup();
      ids.add(open(t).id);
    }
    expect(ids.size).toBe(20);
  });

  it("có hook phòng: run lập nhưng CHƯA mời cho tới khi `runReady`; `runFailed` huỷ run và báo đội trưởng", () => {
    const t = setup();
    const hook = vi.fn();
    t.lh.w.onDungeonOpen = hook;
    const run = open(t);
    expect(hook).toHaveBeenCalledWith(run);
    expect(run.roomId).toBeNull();
    expect(t.lh.dungeonInvites).toHaveLength(0);
    runReady(t.lh.w, run, "RoomXyz1");
    expect(run.roomId).toBe("RoomXyz1");
    expect(t.lh.dungeonInvites).toHaveLength(1);
    expect(t.hp.dungeonInvites).toHaveLength(1);

    const t2 = setup();
    t2.lh.w.onDungeonOpen = () => {};
    const run2 = open(t2);
    runFailed(t2.lh.w, run2);
    expect(t2.hub.runs.size).toBe(0);
    expect(t2.hub.runs.ofKey(key(MEMBER))).toBeUndefined();
    expect(lastToast(t2.lh)).toMatch(/chưa mở được/);
    // phòng tạo xong SAU khi run đã bị huỷ: không mời ai
    runReady(t2.lh.w, run2, "Late");
    expect(t2.lh.dungeonInvites).toHaveLength(0);
    expect(t2.hp.dungeonInvites).toHaveLength(0);
  });

  const refuse = (t: T, raw: unknown, sid = LEADER, w = t.lh.w) => {
    expect(openDungeon(w, sid, raw)).toBeNull();
    expect(t.hub.runs.size).toBe(0);
    expect(t.lh.dungeonInvites).toHaveLength(0);
    expect(t.hp.dungeonInvites).toHaveLength(0);
  };

  it("từ chối và báo đúng lý do: xa Thủ môn, bí cảnh lạ, không phải đội trưởng, chưa có đội, thiếu cảnh giới, có người ngoại tuyến / đang trong run khác", () => {
    // xa Thủ môn
    let t = setup();
    t.lh.w.state.players.get(LEADER)!.x += 500;
    refuse(t, { dungeonId: LINH_HU_ID });
    expect(lastToast(t.lh)).toMatch(/gần Thủ môn/);

    // bí cảnh lạ (đúng dạng nhưng không có), và id rác
    t = setup();
    refuse(t, { dungeonId: "khong_co" });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("unknown_dungeon"));
    refuse(t, { dungeonId: "constructor" });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("unknown_dungeon"));
    t.lh.toasts.length = 0;
    for (const bad of [undefined, null, 5, "linh_hu", {}, { dungeonId: 3 }, { dungeonId: "A" }])
      refuse(t, bad);
    expect(t.lh.toasts).toHaveLength(0); // tin rác: im lặng

    // người ở bản đồ khác không ở gần Thủ môn (NPC chỉ đứng ở Lạc Hà)
    t = setup();
    refuse(t, { dungeonId: LINH_HU_ID }, MEMBER, t.hp.w);
    expect(lastToast(t.hp)).toMatch(/gần Thủ môn/);

    // thành viên thường (không phải đội trưởng) đứng cạnh Thủ môn gửi `dungeonOpen`: không có quyền
    t = setup();
    partyInvite(t.lh.w, LEADER, THIRD);
    partyAnswer(t.lh.w, THIRD, LEADER, true);
    const third = t.lh.w.state.players.get(THIRD)!;
    third.x = gate.x;
    third.y = gate.y;
    t.lh.toasts.length = 0;
    refuse(t, { dungeonId: LINH_HU_ID }, THIRD);
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("not_leader"));

    // chưa có đội: `party_small`
    t = setup();
    const solo = t.lh.w.state.players.get(THIRD)!;
    solo.x = gate.x;
    solo.y = gate.y;
    refuse(t, { dungeonId: LINH_HU_ID }, THIRD);
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("party_small"));

    // thiếu cảnh giới: báo tên người
    t = setup({ memberRealm: 1, memberTier: 7 });
    refuse(t, { dungeonId: LINH_HU_ID });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("member_low", MEMBER));
    expect(lastToast(t.lh)).toContain(MEMBER);

    // ngoại tuyến
    t = setup();
    t.hp.w.state.players.delete(MEMBER);
    refuse(t, { dungeonId: LINH_HU_ID });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("member_offline", MEMBER));

    // chờ nối lại (hồn lìa xác) và trọng thương
    t = setup();
    t.hp.w.ghosts.add(MEMBER);
    refuse(t, { dungeonId: LINH_HU_ID });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("member_reconnecting", MEMBER));
    t = setup();
    t.hp.w.state.players.get(MEMBER)!.dead = true;
    refuse(t, { dungeonId: LINH_HU_ID });
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("member_dead", MEMBER));
  });

  it("mỗi người tối đa một run; hồi chiêu mở; đầy `MAX_DUNGEON_RUNS` thì không mở thêm; hết run thì mở lại được", () => {
    const t = setup();
    const run = open(t);
    // đang trong run: mở lần nữa bị từ chối (chính đội trưởng cũng đang trong run)
    t.lh.toasts.length = 0;
    expect(openDungeon(t.lh.w, LEADER, { dungeonId: LINH_HU_ID })).toBeNull();
    expect(lastToast(t.lh)).toBe(dungeonOpenFailMessage("member_in_run", LEADER));
    expect(t.hub.runs.size).toBe(1);

    // run biến mất ngay (vd phòng không tạo được) thì hồi chiêu mở của đội trưởng VẪN chạy; qua hồi chiêu thì mở lại được
    const t2 = setup();
    open(t2);
    t2.hub.runs._remove([...t2.hub.runs.all()][0]);
    t2.lh.toasts.length = 0;
    expect(openDungeon(t2.lh.w, LEADER, { dungeonId: LINH_HU_ID })).toBeNull();
    expect(lastToast(t2.lh)).toBe(dungeonOpenFailMessage("cooldown"));
    t2.lh.w.now += DUNGEON_OPEN_COOLDOWN_MS;
    expect(openDungeon(t2.lh.w, LEADER, { dungeonId: LINH_HU_ID })).not.toBeNull();

    // đầy số run trong tiến trình
    const t3 = setup();
    for (let i = 0; i < MAX_DUNGEON_RUNS; i++)
      t3.hub.runs._add(
        {
          id: i.toString(16).padStart(32, "0"),
          dungeonId: LINH_HU_ID,
          roomId: `r${i}`,
          leader: `x${i}`,
          members: new Map([[`x${i}`, { key: `x${i}`, name: `x${i}`, status: "invited" }]]),
          phase: "gathering",
          openedAt: 0,
          inviteUntil: Infinity,
          startedAt: null,
          deadline: Infinity,
          exitAt: null,
          endReason: null,
        },
        0,
      );
    expect(openDungeon(t3.lh.w, LEADER, { dungeonId: LINH_HU_ID })).toBeNull();
    expect(lastToast(t3.lh)).toBe(dungeonOpenFailMessage("full"));
    expect(run.phase).toBe("gathering"); // run đầu không bị đụng
  });
});

describe("vào bí cảnh (dungeonEnter)", () => {
  it("thành viên hợp lệ ở BẤT CỨ phòng nào: nhờ phòng đưa đi (hook), trạng thái vẫn `invited` cho tới khi thật sự vào phòng bí cảnh", () => {
    const t = setup();
    const run = open(t);
    const inLh = vi.fn();
    const inHp = vi.fn();
    t.lh.w.onDungeonEnter = inLh;
    t.hp.w.onDungeonEnter = inHp;
    expect(enterDungeon(t.hp.w, MEMBER, { runId: run.id })).toBe(true);
    expect(inHp).toHaveBeenCalledWith(MEMBER, run);
    expect(enterDungeon(t.lh.w, LEADER, { runId: run.id })).toBe(true);
    expect(inLh).toHaveBeenCalledWith(LEADER, run);
    expect(run.members.get(key(MEMBER))!.status).toBe("invited"); // rớt mạng giữa đường thì bấm lại được
    expect(run.phase).toBe("gathering");
  });

  it("run lạ, người ngoài đội có runId, run chưa có phòng, hết hạn: cùng một câu 'hết hạn', không gọi hook (không lộ run của người khác)", () => {
    const t = setup();
    const run = open(t);
    const hook = vi.fn();
    t.lh.w.onDungeonEnter = hook;
    const expired = "Lời mời đã hết hạn.";
    // runId đúng dạng nhưng không có
    expect(enterDungeon(t.lh.w, LEADER, { runId: "0".repeat(32) })).toBe(false);
    expect(lastToast(t.lh)).toBe(expired);
    // người ngoài đội dùng runId ĐÚNG của đội khác (đoán / lộ được)
    t.lh.toasts.length = 0;
    expect(enterDungeon(t.lh.w, THIRD, { runId: run.id })).toBe(false);
    expect(lastToast(t.lh)).toBe(expired);
    // run chưa có phòng (đang tạo)
    run.roomId = null;
    expect(enterDungeon(t.lh.w, LEADER, { runId: run.id })).toBe(false);
    run.roomId = "r1";
    // hết hạn mời
    t.lh.w.now = run.inviteUntil;
    t.lh.toasts.length = 0;
    expect(enterDungeon(t.lh.w, LEADER, { runId: run.id })).toBe(false);
    expect(lastToast(t.lh)).toBe(expired);
    expect(hook).not.toHaveBeenCalled();
  });

  it("tin rác (kiểu sai, runId sai dạng): im lặng, không gọi hook, không toast", () => {
    const t = setup();
    open(t);
    const hook = vi.fn();
    t.lh.w.onDungeonEnter = hook;
    t.lh.toasts.length = 0;
    for (const bad of [undefined, null, 5, "x", [], {}, { runId: 1 }, { runId: "g".repeat(32) }])
      expect(enterDungeon(t.lh.w, LEADER, bad), JSON.stringify(bad)).toBe(false);
    expect(hook).not.toHaveBeenCalled();
    expect(t.lh.toasts).toHaveLength(0);
  });

  it("không vào được khi: vừa giao chiến, đang đi qua cổng, hồn lìa xác, trọng thương, đã trả lời, đang ở trong bí cảnh", () => {
    const t = setup();
    const run = open(t);
    const hook = vi.fn();
    t.lh.w.onDungeonEnter = hook;
    const c = t.lh.w.ctrl.get(LEADER)!;
    const me = { runId: run.id };

    c.lastHitAt = t.lh.w.now - TRAVEL_COMBAT_LOCK_MS + 100;
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(false);
    expect(lastToast(t.lh)).toMatch(/giao chiến/);
    c.lastHitAt = 0;

    c.travelling = true;
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(false);
    c.travelling = false;

    t.lh.w.ghosts.add(LEADER);
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(false);
    t.lh.w.ghosts.delete(LEADER);

    t.lh.w.state.players.get(LEADER)!.dead = true;
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(false);
    t.lh.w.state.players.get(LEADER)!.dead = false;

    run.members.get(key(LEADER))!.status = "declined";
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(false);
    expect(lastToast(t.lh)).toMatch(/trả lời/);
    run.members.get(key(LEADER))!.status = "invited";

    expect(hook).not.toHaveBeenCalled();
    expect(enterDungeon(t.lh.w, LEADER, me)).toBe(true); // hết vướng thì vào được
    expect(hook).toHaveBeenCalledTimes(1);

    // đang ở trong phòng bí cảnh: không có gì để "vào"
    const dun = makeWorld(getMap(LINH_HU_MAP_ID)!, t.hub);
    addPlayer(dun.w, LEADER, 1, 8);
    dun.w.onDungeonEnter = hook;
    expect(enterDungeon(dun.w, LEADER, me)).toBe(false);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("không có hook phòng: không làm gì (không đổi trạng thái)", () => {
    const t = setup();
    const run = open(t);
    expect(enterDungeon(t.lh.w, LEADER, { runId: run.id })).toBe(false);
    expect(run.members.get(key(LEADER))!.status).toBe("invited");
  });
});

describe("từ chối lời mời (dungeonDecline)", () => {
  it("báo đội trưởng ngay; người đó không vào được nữa; run còn chờ người khác thì giữ", () => {
    const t = setup();
    const run = open(t);
    t.lh.toasts.length = 0;
    declineDungeon(t.hp.w, MEMBER, { runId: run.id });
    expect(run.members.get(key(MEMBER))!.status).toBe("declined");
    expect(t.lh.toasts.map((x) => x.msg.text)).toEqual([`${MEMBER} đã từ chối vào bí cảnh.`]);
    expect(t.lh.toasts[0].sid).toBe(LEADER);
    expect(t.hub.runs.get(run.id)).toBe(run); // đội trưởng còn chưa trả lời
    // từ chối hai lần: không báo lần hai
    declineDungeon(t.hp.w, MEMBER, { runId: run.id });
    expect(t.lh.toasts).toHaveLength(1);
    // đã từ chối thì không vào được
    t.hp.w.onDungeonEnter = vi.fn();
    expect(enterDungeon(t.hp.w, MEMBER, { runId: run.id })).toBe(false);
    expect(t.hp.w.onDungeonEnter).not.toHaveBeenCalled();
  });

  it("MỌI người được mời đều từ chối: huỷ run sớm, đội trưởng nhận `dungeonEnd declined`, mọi người được giải phóng", () => {
    const t = setup();
    const run = open(t);
    declineDungeon(t.hp.w, MEMBER, { runId: run.id });
    declineDungeon(t.lh.w, LEADER, { runId: run.id }); // đội trưởng cũng từ chối
    expect(t.hub.runs.size).toBe(0);
    expect(t.hub.runs.ofKey(key(LEADER))).toBeUndefined();
    expect(t.hub.runs.ofKey(key(MEMBER))).toBeUndefined();
    expect(run.phase).toBe("lost");
    expect(t.lh.dungeonEnds).toEqual([
      {
        sid: LEADER,
        msg: { result: "lost", reason: "declined", rewardsLeft: DUNGEON_DAILY_REWARDS },
      },
    ]);
    expect(t.hp.dungeonEnds).toHaveLength(0); // chỉ đội trưởng
  });

  it("người ngoài đội / runId lạ / tin rác: không đổi gì", () => {
    const t = setup();
    const run = open(t);
    declineDungeon(t.lh.w, THIRD, { runId: run.id });
    declineDungeon(t.lh.w, LEADER, { runId: "f".repeat(32) });
    for (const bad of [undefined, null, 1, {}, { runId: "zz" }])
      declineDungeon(t.lh.w, LEADER, bad);
    expect([...run.members.values()].map((m) => m.status)).toEqual(["invited", "invited"]);
    expect(t.hub.runs.size).toBe(1);
  });
});

describe("hết hạn mời (tickDungeons)", () => {
  it("quá `DUNGEON_INVITE_MS` mà chưa ai vào: huỷ run, đội trưởng nhận `no_entry`; trước hạn thì giữ", () => {
    const t = setup();
    const run = open(t);
    t.lh.w.now = run.inviteUntil - 1;
    tickDungeons(t.lh.w);
    expect(t.hub.runs.size).toBe(1);
    expect(t.lh.dungeonEnds).toHaveLength(0);
    t.lh.w.now = run.inviteUntil + 1000; // qua nhịp kiểm chung (500 ms) của lần tick trước
    tickDungeons(t.lh.w);
    expect(t.hub.runs.size).toBe(0);
    expect(t.lh.dungeonEnds).toEqual([
      {
        sid: LEADER,
        msg: { result: "lost", reason: "no_entry", rewardsLeft: DUNGEON_DAILY_REWARDS },
      },
    ]);
    // phòng thứ hai tick tiếp: không gửi lần hai
    t.hp.w.now = t.lh.w.now + 1000;
    tickDungeons(t.hp.w);
    expect(t.lh.dungeonEnds).toHaveLength(1);
    expect(t.hp.dungeonEnds).toHaveLength(0);
  });

  it("run không còn `gathering` (đã có người vào) không bị huỷ ở đây", () => {
    const t = setup();
    const run = open(t);
    run.phase = "running";
    t.lh.w.now = run.inviteUntil + 10_000;
    tickDungeons(t.lh.w);
    expect(t.hub.runs.get(run.id)).toBe(run);
    expect(t.lh.dungeonEnds).toHaveLength(0);
  });

  it("không có run nào thì tick không làm gì (đường nóng)", () => {
    const t = setup();
    expect(() => tickDungeons(t.lh.w)).not.toThrow();
    expect(t.hub.runs.size).toBe(0);
  });
});

describe("hộp thoại Thủ môn", () => {
  it("đội trưởng đủ điều kiện: nút mở bí cảnh bấm được, kèm số lượt thưởng còn lại", () => {
    const t = setup();
    const d = dungeonDialog(t.lh.w, LEADER)!;
    expect(d.options).toEqual([
      {
        label: `Mở ${dungeonOf(LINH_HU_ID)!.name}`,
        action: { kind: "dungeon", dungeonId: LINH_HU_ID },
      },
    ]);
    expect(d.lines.join(" ")).toContain(`${DUNGEON_DAILY_REWARDS}/${DUNGEON_DAILY_REWARDS}`);
  });

  it("chưa đủ điều kiện: nút vô hiệu và dòng lý do đúng câu thông báo", () => {
    // chưa có đội
    const t = setup();
    const d = dungeonDialog(t.lh.w, THIRD)!;
    expect(d.options[0].disabled).toBe(true);
    expect(d.lines[0]).toContain(dungeonOpenFailMessage("party_small"));
    // thiếu cảnh giới
    const t2 = setup({ memberRealm: 0, memberTier: 0 });
    const d2 = dungeonDialog(t2.lh.w, LEADER)!;
    expect(d2.options[0].disabled).toBe(true);
    expect(d2.lines[0]).toContain(dungeonOpenFailMessage("member_low", MEMBER));
    // người đã chết không có hộp thoại
    t2.lh.w.state.players.get(LEADER)!.dead = true;
    expect(dungeonDialog(t2.lh.w, LEADER)).toBeNull();
  });
});

describe("sổ run (Runs)", () => {
  it("hồi chiêu mở không rò: mục của đội trưởng biến mất sau khi hết hồi chiêu và qua một nhịp kiểm (kể cả khi không còn run nào)", () => {
    const t = setup();
    open(t);
    expect(t.hub.runs.cooldownSize).toBe(1);
    t.hub.runs._remove([...t.hub.runs.all()][0]); // không còn run nào, chỉ còn hồi chiêu
    t.lh.w.now += DUNGEON_OPEN_COOLDOWN_MS - 1000;
    tickDungeons(t.lh.w);
    expect(t.hub.runs.cooldownSize).toBe(1); // còn hồi chiêu: giữ
    t.lh.w.now += 2000;
    tickDungeons(t.lh.w);
    expect(t.hub.runs.cooldownSize).toBe(0);
    expect(t.hub.runs.cooldownLeft(key(LEADER), t.lh.w.now)).toBe(0);
    // nhiều đội trưởng xoay vòng: không tích tụ
    for (let i = 0; i < 50; i++) t.hub.runs._add(fakeRun(`x${i}`), t.lh.w.now);
    expect(t.hub.runs.cooldownSize).toBe(50);
    for (const r of [...t.hub.runs.all()]) t.hub.runs._remove(r);
    t.lh.w.now += DUNGEON_OPEN_COOLDOWN_MS + 1000;
    tickDungeons(t.lh.w);
    expect(t.hub.runs.cooldownSize).toBe(0);
  });

  it("mỗi người một run; xoá run giải phóng mọi thành viên; xoá hai lần không sao; id lạ không tra được", () => {
    const t = setup();
    const run = open(t);
    expect(t.hub.runs.get(run.id)).toBe(run);
    for (const bad of [undefined, null, 5, "constructor", "__proto__", {}])
      expect(t.hub.runs.get(bad)).toBeUndefined();
    t.hub.runs._remove(run);
    t.hub.runs._remove(run);
    expect(t.hub.runs.size).toBe(0);
    expect(t.hub.runs.ofKey(key(LEADER))).toBeUndefined();
    expect(t.hub.runs.ofKey(key(MEMBER))).toBeUndefined();
  });
});

describe("trong phòng bí cảnh: đồng hồ, trạng thái, kết thúc", () => {
  /** Run đã mở (có hook phòng giả), cộng thêm một World bí cảnh dùng chung Hub, các thành viên chưa vào. */
  function inRoom() {
    const t = setup();
    const run = open(t);
    const dun = makeWorld(getMap(LINH_HU_MAP_ID)!, t.hub);
    dun.w.runId = run.id;
    dun.w.now = t.lh.w.now;
    return { ...t, run, dun, w: dun.w };
  }
  const join = (t: ReturnType<typeof inRoom>, name: string) => {
    addPlayer(t.w, name, 1, 8);
    memberJoined(t.w, t.run, key(name));
  };
  const tick = (t: ReturnType<typeof inRoom>, ms: number) => {
    t.w.now += ms;
    t.w.tick++;
    tickDungeonRun(t.w);
  };

  it("người đầu tiên vào: `running`, đồng hồ `timeLimitMs` chạy từ lúc đó; người vào muộn không đổi đồng hồ; HUD nhận trạng thái", () => {
    const t = inRoom();
    expect(runOfWorld(t.w)).toBe(t.run);
    expect(t.run.phase).toBe("gathering");
    t.w.now += 7000;
    join(t, LEADER);
    expect(t.run.phase).toBe("running");
    expect(t.run.startedAt).toBe(t.w.now);
    const limit = dungeonOf(LINH_HU_ID)!.timeLimitMs;
    expect(t.run.deadline).toBe(t.w.now + limit);
    expect(t.run.members.get(key(LEADER))!.status).toBe("inside");
    expect(t.dun.dungeonStates.at(-1)).toMatchObject({
      sid: LEADER,
      msg: { phase: "running", deadlineInMs: limit },
    });
    const deadline = t.run.deadline;
    t.w.now += 5000;
    join(t, MEMBER);
    expect(t.run.deadline).toBe(deadline);
  });

  it("memberJoined cho người không phải thành viên: không đổi gì; phòng thường (runId null) không có run", () => {
    const t = inRoom();
    memberJoined(t.w, t.run, "nguoi la");
    expect(t.run.phase).toBe("gathering");
    expect(runOfWorld(t.lh.w)).toBeUndefined();
    tickDungeonRun(t.lh.w); // phòng thường: không làm gì
    expect(t.lh.dungeonStates).toHaveLength(0);
  });

  it("trạng thái: quái nhỏ còn lại KHÔNG tính trùm; máu trùm; danh sách đội (chưa vào / từ chối không hiện); `alive` theo người chơi", () => {
    const t = inRoom();
    const boss = dungeonOf(LINH_HU_ID)!.boss;
    addMonster(t.w, "lang", 1000, 1000);
    addMonster(t.w, "ho", 1100, 1000);
    const { m: bossMonster } = addMonster(t.w, boss, 1200, 1000);
    bossMonster.hp = 100;
    join(t, LEADER);
    const msg = t.dun.dungeonStates.at(-1)!.msg;
    expect(msg.mobsLeft).toBe(2);
    expect(msg.boss).toEqual({ hp: 100, maxHp: bossMonster.maxHp });
    expect(msg.members).toEqual([{ name: LEADER, alive: true }]); // MEMBER chưa vào: chưa hiện
    t.w.state.players.get(LEADER)!.dead = true;
    sendDungeonState(t.w, t.run);
    expect(t.dun.dungeonStates.at(-1)!.msg.members).toEqual([{ name: LEADER, alive: false }]);
    // trùm chết (không còn trong state): boss = null
    t.w.state.monsters.forEach((m, id) => {
      if (m.kind === boss) t.w.state.monsters.delete(id);
    });
    sendDungeonState(t.w, t.run);
    expect(t.dun.dungeonStates.at(-1)!.msg.boss).toBeNull();
  });

  it("`dungeonState` mỗi giây (20 tick), không mỗi tick", () => {
    const t = inRoom();
    join(t, LEADER);
    t.dun.dungeonStates.length = 0;
    t.w.tick = 1;
    for (let i = 0; i < 40; i++) tick(t, 50);
    expect(t.dun.dungeonStates.length).toBeGreaterThanOrEqual(1);
    expect(t.dun.dungeonStates.length).toBeLessThanOrEqual(3);
  });

  it("hết giờ: `timeout`, run `lost`, mọi người trong phòng nhận `dungeonEnd`; đúng `DUNGEON_EXIT_DELAY_MS` sau đó mới đưa về và xoá run", () => {
    const t = inRoom();
    join(t, LEADER);
    join(t, MEMBER);
    const exit = vi.fn();
    t.w.onDungeonExit = exit;
    tick(t, dungeonOf(LINH_HU_ID)!.timeLimitMs - 100);
    expect(t.run.phase).toBe("running");
    tick(t, 200);
    expect(t.run.phase).toBe("lost");
    expect(t.run.endReason).toBe("timeout");
    expect(t.dun.dungeonEnds.map((e) => [e.sid, e.msg.reason, e.msg.result]).sort()).toEqual([
      [LEADER, "timeout", "lost"],
      [MEMBER, "timeout", "lost"],
    ]);
    expect(t.dun.dungeonEnds[0].msg.rewardsLeft).toBe(DUNGEON_DAILY_REWARDS);
    expect(t.dun.dungeonEnds.every((e) => e.msg.reward === undefined)).toBe(true); // thua: không thưởng
    expect(exit).not.toHaveBeenCalled();
    expect(t.hub.runs.get(t.run.id)).toBe(t.run);
    tick(t, DUNGEON_EXIT_DELAY_MS - 500);
    expect(exit).not.toHaveBeenCalled();
    tick(t, 600);
    expect(exit.mock.calls.map((c) => c[0]).sort()).toEqual([LEADER, MEMBER]);
    expect(t.hub.runs.size).toBe(0);
    expect(t.hub.runs.ofKey(key(LEADER))).toBeUndefined();
    // kết thúc là một lần (idempotent)
    finishRun(t.w, t.run, "lost", "timeout");
    expect(t.dun.dungeonEnds).toHaveLength(2);
  });

  it("mọi người chết: `all_dead`; người chết (Hoàng Tuyền) không bị đưa đi ở đây (họ tự đầu thai rồi về), người còn sống thì có", () => {
    const t = inRoom();
    join(t, LEADER);
    join(t, MEMBER);
    const exit = vi.fn();
    t.w.onDungeonExit = exit;
    t.w.state.players.get(LEADER)!.dead = true;
    tick(t, 50);
    expect(t.run.phase).toBe("running"); // MEMBER còn sống: chưa thua
    t.w.state.players.get(MEMBER)!.dead = true;
    tick(t, 50);
    expect(t.run.endReason).toBe("all_dead");
    tick(t, DUNGEON_EXIT_DELAY_MS + 100);
    expect(exit).not.toHaveBeenCalled(); // cả hai đang ở Hoàng Tuyền
    expect(t.hub.runs.size).toBe(0);

    // một người sống, một người chết khi hết giờ: chỉ người sống được đưa về
    const u = inRoom();
    join(u, LEADER);
    join(u, MEMBER);
    const exit2 = vi.fn();
    u.w.onDungeonExit = exit2;
    u.w.state.players.get(MEMBER)!.dead = true;
    finishRun(u.w, u.run, "lost", "timeout", 0);
    tick(u, 10);
    expect(exit2.mock.calls.map((c) => c[0])).toEqual([LEADER]);
  });

  it("mọi người rời: `all_left` (không ai trong phòng); còn người được mời chưa tới và còn hạn thì chưa kết thúc", () => {
    const t = inRoom();
    join(t, LEADER); // MEMBER còn `invited`, hạn mời còn
    memberLeft(t.w, t.run, key(LEADER));
    t.w.state.players.delete(LEADER);
    tick(t, 50);
    expect(t.run.phase).toBe("running"); // MEMBER còn có thể vào
    t.w.now = t.run.inviteUntil + 1;
    tickDungeonRun(t.w);
    expect(t.run.endReason).toBe("all_left");
    expect(t.dun.dungeonEnds).toHaveLength(0); // không còn ai trong phòng để báo
  });

  it("memberLeft chỉ đổi người đang `inside`; `dungeonLeave` chỉ cho người còn sống đang ở trong run", () => {
    const t = inRoom();
    memberLeft(t.w, t.run, key(MEMBER)); // còn `invited`: không đổi
    expect(t.run.members.get(key(MEMBER))!.status).toBe("invited");
    const exit = vi.fn();
    t.w.onDungeonExit = exit;
    addPlayer(t.w, LEADER, 1, 8);
    leaveDungeon(t.w, LEADER); // chưa `inside`
    expect(exit).not.toHaveBeenCalled();
    join(t, THIRD); // không phải thành viên
    leaveDungeon(t.w, THIRD);
    expect(exit).not.toHaveBeenCalled();
    memberJoined(t.w, t.run, key(LEADER));
    t.w.state.players.get(LEADER)!.dead = true;
    leaveDungeon(t.w, LEADER); // đang chết: đầu thai thì mới về
    expect(exit).not.toHaveBeenCalled();
    t.w.state.players.get(LEADER)!.dead = false;
    leaveDungeon(t.w, LEADER);
    expect(exit).toHaveBeenCalledWith(LEADER);
    leaveDungeon(t.lh.w, LEADER); // phòng thường: bỏ qua
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe("trùm chết: thắng, thưởng hoàn thành, lượt mỗi ngày (4c)", () => {
  const def = dungeonOf(LINH_HU_ID)!;

  /** Phòng bí cảnh đang chạy với LEADER và MEMBER đã vào, trùm có mặt. */
  function fight() {
    const t = setup();
    const run = open(t);
    const dun = makeWorld(getMap(LINH_HU_MAP_ID)!, t.hub);
    dun.w.runId = run.id;
    dun.w.now = t.lh.w.now;
    addPlayer(dun.w, LEADER, 1, 8);
    addPlayer(dun.w, MEMBER, 1, 8);
    memberJoined(dun.w, run, key(LEADER));
    memberJoined(dun.w, run, key(MEMBER));
    const boss = addMonster(dun.w, def.boss, 1000, 1000);
    // đứng cạnh trùm: chia tu vi / thành tích theo đội chỉ tính người trong tầm
    for (const n of [LEADER, MEMBER]) {
      const p = dun.w.state.players.get(n)!;
      p.x = 1000;
      p.y = 1060;
    }
    const cl = dun.w.ctrl.get(LEADER)!;
    const cm = dun.w.ctrl.get(MEMBER)!;
    boss.mc.damageBy.set(LEADER, 900);
    boss.mc.damageBy.set(MEMBER, 100);
    dun.dungeonEnds.length = 0;
    return { ...t, run, dun, w: dun.w, boss, cl, cm };
  }
  const endOf = (f: ReturnType<typeof fight>, sid: string) =>
    f.dun.dungeonEnds.find((e) => e.sid === sid)?.msg;

  it("hạ trùm qua `killMonster` thật: run THẮNG, mỗi người đủ điều kiện nhận thưởng đúng MỘT lần (Linh thạch + đồ chắc chắn), lượt ngày trừ vào hồ sơ", () => {
    const f = fight();
    const before = { l: f.cl.coin, m: f.cm.coin };
    killMonster(f.w, f.boss.id, f.boss.mc);
    expect(f.run.phase).toBe("won");
    expect(f.run.endReason).toBe("boss_dead");
    expect(f.run.exitAt).toBe(f.w.now + DUNGEON_LOOT_MS);
    for (const [sid, c, b] of [
      [LEADER, f.cl, before.l],
      [MEMBER, f.cm, before.m],
    ] as const) {
      const e = endOf(f, sid)!;
      expect(e).toMatchObject({ result: "won", reason: "boss_dead", rewardsLeft: 2 });
      expect(e.noReward).toBeUndefined();
      expect(e.reward!.coin).toBe(def.reward.coin);
      expect(e.reward!.items.map((i) => i.itemId)).toContain("tu_khi_dan"); // chance 1
      expect(c.coin).toBeGreaterThanOrEqual(b + def.reward.coin);
      expect(c.save.dungeonDaily).toEqual({ day: dayKey(f.w.now), rewards: 1 });
    }
    // thành tích kiếp: cả hai cùng đánh trùm -> bossKills++ (đường chia sát thương có sẵn)
    expect(f.cl.life.bossKills).toBe(1);
    // HUD: trùm đã biến mất
    expect(f.dun.dungeonStates.at(-1)!.msg.boss).toBeNull();
    expect(f.dun.dungeonStates.at(-1)!.msg.phase).toBe("won");
  });

  it("nhật ký kiểm toán: hạ trùm ghi dungeon.end MỘT lần và dungeon.reward cho từng người nhận thưởng (không cho người không đủ điều kiện)", () => {
    const f = fight();
    const log: { ev: string; f: Record<string, unknown> }[] = [];
    f.w.audit = (ev, fields) => void log.push({ ev, f: fields ?? {} });
    f.boss.mc.damageBy.delete(MEMBER); // chỉ LEADER đủ điều kiện
    bossKilled(f.w, f.boss.mc);
    const ends = log.filter((x) => x.ev === "dungeon.end");
    expect(ends).toHaveLength(1);
    expect(ends[0].f).toMatchObject({
      run: f.run.id,
      dungeon: def.id,
      result: "won",
      reason: "boss_dead",
    });
    const rewards = log.filter((x) => x.ev === "dungeon.reward");
    expect(rewards).toHaveLength(1);
    expect(rewards[0].f).toMatchObject({ name: LEADER, dungeon: def.id, coin: def.reward.coin });
    expect(Number(rewards[0].f.items)).toBeGreaterThanOrEqual(1);
    // kết thúc là một lần: gọi lại không ghi thêm
    finishRun(f.w, f.run, "lost", "timeout");
    bossKilled(f.w, f.boss.mc);
    expect(log.filter((x) => x.ev === "dungeon.end")).toHaveLength(1);
    expect(log.filter((x) => x.ev === "dungeon.reward")).toHaveLength(1);
  });

  it("người chưa gây sát thương cho trùm: không thưởng, `noReward: no_damage`, không trừ lượt; người rời / đã chết không được tính", () => {
    const f = fight();
    f.boss.mc.damageBy.delete(MEMBER);
    const mBefore = f.cm.coin;
    bossKilled(f.w, f.boss.mc);
    expect(endOf(f, MEMBER)).toMatchObject({ noReward: "no_damage", rewardsLeft: 3 });
    expect(endOf(f, MEMBER)!.reward).toBeUndefined();
    expect(f.cm.coin).toBe(mBefore);
    expect(f.cm.save.dungeonDaily).toBeUndefined();
    expect(endOf(f, LEADER)!.reward).toBeDefined();

    // đã chết (Hoàng Tuyền): không thưởng, không lý do; đã rời: không nhận `dungeonEnd` và không thưởng
    const g = fight();
    g.w.state.players.get(MEMBER)!.dead = true;
    const gBefore = g.cm.coin;
    bossKilled(g.w, g.boss.mc);
    expect(endOf(g, MEMBER)).toEqual({ result: "won", reason: "boss_dead", rewardsLeft: 3 });
    expect(g.cm.coin).toBe(gBefore);
    const h = fight();
    memberLeft(h.w, h.run, key(MEMBER));
    bossKilled(h.w, h.boss.mc);
    expect(endOf(h, MEMBER)).toBeUndefined();
    expect(h.cm.save.dungeonDaily).toBeUndefined();
  });

  it("hết lượt hôm nay (3/3): vẫn thắng nhưng không thưởng, `noReward: daily_limit`; sang ngày khác thì có lại; bộ đếm hỏng trong file coi như chưa dùng", () => {
    const f = fight();
    f.cl.save.dungeonDaily = { day: dayKey(f.w.now), rewards: DUNGEON_DAILY_REWARDS };
    const lBefore = f.cl.coin;
    bossKilled(f.w, f.boss.mc);
    expect(f.run.phase).toBe("won");
    expect(endOf(f, LEADER)).toMatchObject({
      result: "won",
      noReward: "daily_limit",
      rewardsLeft: 0,
    });
    expect(endOf(f, LEADER)!.reward).toBeUndefined();
    expect(f.cl.coin).toBe(lBefore);
    expect(f.cl.save.dungeonDaily!.rewards).toBe(DUNGEON_DAILY_REWARDS); // không tăng thêm
    expect(endOf(f, MEMBER)!.reward).toBeDefined(); // người còn lượt vẫn nhận

    const g = fight();
    g.cl.save.dungeonDaily = {
      day: dayKey(g.w.now - 24 * 3600_000),
      rewards: DUNGEON_DAILY_REWARDS,
    };
    bossKilled(g.w, g.boss.mc);
    expect(endOf(g, LEADER)!.reward).toBeDefined();
    expect(g.cl.save.dungeonDaily).toEqual({ day: dayKey(g.w.now), rewards: 1 });

    for (const bad of [
      { day: "hom nay", rewards: 3 },
      { day: dayKey(Date.now()), rewards: 99 },
      { day: dayKey(Date.now()), rewards: -1 },
      { day: dayKey(Date.now()), rewards: 1.5 },
      "3",
      [],
    ]) {
      const h = fight();
      h.cl.save.dungeonDaily = bad as never;
      bossKilled(h.w, h.boss.mc);
      expect(endOf(h, LEADER)!.reward, JSON.stringify(bad)).toBeDefined();
      expect(endOf(h, LEADER)!.rewardsLeft).toBe(DUNGEON_DAILY_REWARDS - 1);
    }
  });

  it("thưởng chỉ MỘT lần mỗi run: gọi lại (hoặc run đã kết thúc vì lý do khác) không thưởng thêm; thua thì không có thưởng", () => {
    const f = fight();
    bossKilled(f.w, f.boss.mc);
    const coin = f.cl.coin;
    const ends = f.dun.dungeonEnds.length;
    bossKilled(f.w, f.boss.mc);
    expect(f.cl.coin).toBe(coin);
    expect(f.dun.dungeonEnds).toHaveLength(ends);
    expect(f.cl.save.dungeonDaily!.rewards).toBe(1);

    // hết giờ trước: run thua, trùm chết sau đó (trong lúc chờ về) không đổi kết quả
    const g = fight();
    finishRun(g.w, g.run, "lost", "timeout");
    const gCoin = g.cl.coin;
    bossKilled(g.w, g.boss.mc);
    expect(g.run.phase).toBe("lost");
    expect(g.cl.coin).toBe(gCoin);
    expect(endOf(g, LEADER)!.reward).toBeUndefined();
  });

  it("chỉ trùm của bí cảnh này tính: quái thường chết, phòng thường (runId null), run chưa `running` không thắng", () => {
    const f = fight();
    const mob = addMonster(f.w, "lang", 1200, 1000);
    mob.mc.damageBy.set(LEADER, 50);
    killMonster(f.w, mob.id, mob.mc);
    expect(f.run.phase).toBe("running");
    // phòng thường có trùm riêng (Xích Mãng): không đụng tới run nào
    const n = makeWorld(DEFAULT_MAP, f.hub);
    addPlayer(n.w, THIRD, 1, 8);
    const wild = addMonster(n.w, "mang", 1000, 1000);
    wild.mc.damageBy.set(THIRD, 100);
    killMonster(n.w, wild.id, wild.mc);
    expect(f.run.phase).toBe("running");
    // run còn `gathering`
    f.run.phase = "gathering";
    bossKilled(f.w, f.boss.mc);
    expect(f.run.phase).toBe("gathering");
  });

  it("túi đầy: phần đồ không nhét được rơi dưới chân, chủ là chính người đó; Linh thạch vẫn nhận", () => {
    const f = fight();
    // túi toàn món khác, mỗi ô đầy
    for (let i = 0; i < INVENTORY_SLOTS; i++) f.cl.inv[i] = { itemId: "hoi_huyet_dan", qty: 99 };
    const coin = f.cl.coin;
    bossKilled(f.w, f.boss.mc);
    const e = endOf(f, LEADER)!;
    expect(e.reward!.items.map((i) => i.itemId)).toContain("tu_khi_dan");
    expect(f.cl.coin).toBeGreaterThanOrEqual(coin + def.reward.coin);
    const drops = [...f.w.state.loot.values()].filter((l) => l.owner === LEADER);
    expect(drops.some((l) => l.itemId === "tu_khi_dan" && l.qty === 2)).toBe(true);
  });

  it("món có xác suất (< 1): tung riêng cho từng người; xác suất 0.6 ở ngưỡng", async () => {
    const { vi: v } = { vi };
    const f = fight();
    const spy = v.spyOn(Math, "random");
    spy.mockReturnValue(0.59); // dưới 0.6: nhận `vay_mang`; trên 0.1: không nhận `xich_lan_bao`
    bossKilled(f.w, f.boss.mc);
    const ids = endOf(f, LEADER)!.reward!.items.map((i) => i.itemId);
    spy.mockRestore();
    expect(ids).toContain("tu_khi_dan");
    expect(ids).toContain("vay_mang");
    expect(ids).not.toContain("xich_lan_bao");
    const g = fight();
    const spy2 = v.spyOn(Math, "random").mockReturnValue(0.61);
    bossKilled(g.w, g.boss.mc);
    spy2.mockRestore();
    expect(endOf(g, LEADER)!.reward!.items.map((i) => i.itemId)).toEqual(["tu_khi_dan"]);
  });

  it("sau thời gian nhặt đồ: người còn sống được đưa về Lạc Hà và run được xoá", () => {
    const f = fight();
    const exit = vi.fn();
    f.w.onDungeonExit = exit;
    bossKilled(f.w, f.boss.mc);
    f.w.now += DUNGEON_LOOT_MS - 100;
    f.w.tick++;
    tickDungeonRun(f.w);
    expect(exit).not.toHaveBeenCalled();
    f.w.now += 200;
    f.w.tick++;
    tickDungeonRun(f.w);
    expect(exit.mock.calls.map((c) => c[0]).sort()).toEqual([LEADER, MEMBER]);
    expect(f.hub.runs.size).toBe(0);
  });
});

describe("quái của phòng bí cảnh", () => {
  it("trùm đúng MỘT con ở tâm hang; quái nhỏ theo `monsterCap`, ngoài khu an toàn; phòng thường không có hang nên vẫn rải như cũ", async () => {
    const { spawnDungeonMonsters, spawnInitial } = await import("./monsters");
    const map = getMap(LINH_HU_MAP_ID)!;
    const d = makeWorld(map);
    spawnDungeonMonsters(d.w);
    const bossKind = dungeonOf(LINH_HU_ID)!.boss;
    const all = [...d.w.state.monsters.values()];
    const bosses = all.filter((m) => m.kind === bossKind);
    expect(bosses).toHaveLength(1);
    expect(bosses[0].x).toBe(map.lairPx!.x);
    expect(bosses[0].y).toBe(map.lairPx!.y);
    for (const id of ["lang", "ho"])
      expect(all.filter((m) => m.kind === id).length).toBeLessThanOrEqual(map.monsterCapOf(id));
    expect(all.length).toBeGreaterThan(10);
    for (const m of all) if (m.kind !== bossKind) expect(map.inSafe(m.x, m.y, 100)).toBe(false);
    // Lạc Hà: không có hang, `spawnInitial` như cũ (không trùm bí cảnh)
    const n = makeWorld(DEFAULT_MAP);
    spawnInitial(n.w);
    expect([...n.w.state.monsters.values()].some((m) => m.kind === bossKind)).toBe(false);
  });
});

describe("sanitizeDungeonDaily: không tin bộ đếm thưởng bí cảnh trong file", () => {
  it("đúng dạng thì giữ; thiếu, sai kiểu, ngày không có, số lẻ / âm / quá trần thì bỏ", () => {
    const ok = { day: "2026-11-10", rewards: 2 };
    expect(sanitizeDungeonDaily(ok)).toEqual(ok);
    expect(sanitizeDungeonDaily({ day: "2026-02-28", rewards: 0 })).toEqual({
      day: "2026-02-28",
      rewards: 0,
    });
    expect(sanitizeDungeonDaily({ ...ok, extra: 1, __proto__: { x: 1 } })).toEqual(ok); // không mang trường lạ
    for (const bad of [
      undefined,
      null,
      3,
      "2026-11-10",
      [],
      {},
      { day: "2026-11-10" },
      { rewards: 1 },
      { day: 20261110, rewards: 1 },
      { day: "2026-11-10 ", rewards: 1 },
      { day: "2026-13-01", rewards: 1 },
      { day: "2026-02-30", rewards: 1 },
      { day: "hom nay", rewards: 1 },
      { day: "2026-11-10", rewards: "1" },
      { day: "2026-11-10", rewards: 1.5 },
      { day: "2026-11-10", rewards: -1 },
      { day: "2026-11-10", rewards: 4 },
      { day: "2026-11-10", rewards: NaN },
      { day: "2026-11-10", rewards: Infinity },
    ])
      expect(sanitizeDungeonDaily(bad), JSON.stringify(bad)).toBeUndefined();
  });
});
