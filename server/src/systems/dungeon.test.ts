// Bí cảnh, phần sảnh (M3 bước 4b-1): mở, mời, vào, từ chối, hết hạn mời, hộp thoại Thủ môn. World giả, nhiều phòng dùng chung Hub.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP,
  DUNGEON_DAILY_REWARDS,
  DUNGEON_INVITE_MS,
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
  getMap,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { partyAnswer, partyInvite } from "./party";
import {
  GATEKEEPER_ID,
  declineDungeon,
  dungeonDialog,
  enterDungeon,
  openDungeon,
  runFailed,
  runReady,
  tickDungeons,
  type Run,
} from "./dungeon";
import { addPlayer, makeWorld } from "./test-helpers";

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
