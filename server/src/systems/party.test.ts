// Tổ đội (#74): đội hình, lời mời, chat đội, chia tu vi, chủ đồ rơi, nhặt đồ của đồng đội.
import { describe, expect, it } from "vitest";
import {
  NO_PARTY,
  PARTY_INVITE_COOLDOWN_MS,
  PARTY_INVITE_TTL_MS,
  PARTY_MAX,
  PARTY_SHARE_RANGE,
  PARTY_SNAPSHOT_MS,
  killExp,
  partyExpShare,
} from "@tien-gioi/shared";
import type { World } from "../world";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";
import {
  killShares,
  lootOwner,
  partyAnswer,
  partyDrop,
  partyInvite,
  partyKick,
  partyLeave,
  tickParty,
} from "./party";
import { killMonster } from "./combat";
import { chat } from "./chat";
import { pickup, spawnLoot } from "./loot";

// addPlayer dùng sessionId làm đạo hiệu; cleanName cần 2–16 ký tự
const A = "Alpha";
const B = "Bravo";
const C = "Charlie";
const D = "Delta";
const E = "Echo";

function setup(...names: string[]) {
  const t = makeWorld();
  for (const n of names) addPlayer(t.w, n);
  return t;
}

/** Mời rồi nhận, tua đồng hồ qua hồi chiêu mời để người mời mời tiếp được */
function join(w: World, from: string, to: string) {
  partyInvite(w, from, to);
  partyAnswer(w, to, from, true);
  w.now += PARTY_INVITE_COOLDOWN_MS;
}

const lastToast = (t: ReturnType<typeof makeWorld>, sid: string) =>
  t.toasts.filter((x) => x.sid === sid).at(-1)?.msg;

describe("mời và nhận lời mời", () => {
  it("mời: người được mời nhận partyInvited; chưa có đội cho tới khi nhận", () => {
    const t = setup(A, B);
    partyInvite(t.w, A, B.toLowerCase()); // không phân biệt hoa thường
    expect(t.invited).toEqual([{ sid: B, msg: { from: A, ttlMs: PARTY_INVITE_TTL_MS } }]);
    expect(t.w.parties.size).toBe(0);
    expect(lastToast(t, A)).toMatchObject({ tone: "info" });
  });

  it("nhận: lập đội, người mời làm đội trưởng, cả hai nhận đội hình", () => {
    const t = setup(A, B);
    partyInvite(t.w, A, B);
    partyAnswer(t.w, B, A, true);
    expect(t.w.parties.size).toBe(1);
    expect(t.w.parties.sameParty(A, B)).toBe(true);
    const msgs = t.parties.filter((x) => x.msg.members.length === 2);
    expect(msgs.map((x) => x.sid).sort()).toEqual([A, B]);
    expect(msgs[0].msg.leader).toBe(A);
    expect(msgs[0].msg.members.map((m) => m.name)).toEqual([A, B]);
    expect(msgs[0].msg.members[0]).toMatchObject({ hp: expect.any(Number), x: expect.any(Number) });
  });

  it("từ chối: không lập đội, người mời được báo, lời mời đã dùng", () => {
    const t = setup(A, B);
    partyInvite(t.w, A, B);
    partyAnswer(t.w, B, A, false);
    expect(t.w.parties.size).toBe(0);
    expect(lastToast(t, A)?.text).toContain("từ chối");
    partyAnswer(t.w, B, A, true); // đã dùng rồi
    expect(t.w.parties.size).toBe(0);
    expect(lastToast(t, B)).toMatchObject({ tone: "bad" });
  });

  it("từ chối mọi trường hợp không hợp lệ: không có người, tự mời, hồi chiêu, mời trùng", () => {
    const t = setup(A, B, C);
    partyInvite(t.w, A, "Khong Co Ai");
    partyInvite(t.w, A, A);
    expect(t.invited).toEqual([]);
    partyInvite(t.w, A, B);
    expect(t.invited).toHaveLength(1);
    partyInvite(t.w, A, C); // quá nhanh sau lần mời trước
    expect(t.invited).toHaveLength(1);
    t.w.now += PARTY_INVITE_COOLDOWN_MS;
    partyInvite(t.w, A, B); // đã mời B và còn chờ
    expect(t.invited).toHaveLength(1);
    partyInvite(t.w, A, C);
    expect(t.invited).toHaveLength(2);
  });

  it("dữ liệu rác (kiểu sai, tên quá dài, ký tự lạ) không làm gì và không ném lỗi", () => {
    const t = setup(A, B);
    for (const bad of [undefined, null, 42, {}, [], "x", "x".repeat(5000), "<script>", "Br@vo"]) {
      expect(() => partyInvite(t.w, A, bad)).not.toThrow();
      expect(() => partyAnswer(t.w, B, bad, true)).not.toThrow();
      expect(() => partyKick(t.w, A, bad)).not.toThrow();
      t.w.now += PARTY_INVITE_COOLDOWN_MS;
    }
    expect(t.invited).toEqual([]);
    expect(t.w.parties.size).toBe(0);
  });

  it("người đã chết không mời được", () => {
    const t = setup(A, B);
    t.w.state.players.get(A)!.dead = true;
    partyInvite(t.w, A, B);
    expect(t.invited).toEqual([]);
  });

  it("lời mời hết hạn sau PARTY_INVITE_TTL_MS", () => {
    const t = setup(A, B);
    partyInvite(t.w, A, B);
    t.w.now += PARTY_INVITE_TTL_MS + 1;
    partyAnswer(t.w, B, A, true);
    expect(t.w.parties.size).toBe(0);
    expect(lastToast(t, B)?.text).toContain("hết hạn");
    // mời lại được sau khi hết hạn (không bị tính là mời trùng)
    partyInvite(t.w, A, B);
    expect(t.invited).toHaveLength(2);
  });

  it("không nhận được lời mời không phải gửi cho mình", () => {
    const t = setup(A, B, C);
    partyInvite(t.w, A, B);
    partyAnswer(t.w, C, A, true);
    expect(t.w.parties.size).toBe(0);
    expect(lastToast(t, C)).toMatchObject({ tone: "bad" });
  });

  it("người mời đã vào đội khác thì lời mời cũ mất hiệu lực", () => {
    const t = setup(A, B, C);
    partyInvite(t.w, A, B); // lúc đó A chưa có đội
    t.w.now += PARTY_INVITE_COOLDOWN_MS;
    join(t.w, A, C); // A lập đội với C
    partyAnswer(t.w, B, A, true);
    expect(t.w.parties.partyIdOf(B)).toBeUndefined();
    expect(lastToast(t, B)?.text).toContain("không còn hiệu lực");
  });

  it("đã có đội thì không nhận thêm lời mời, không bị mời", () => {
    const t = setup(A, B, C, D);
    join(t.w, A, B);
    join(t.w, C, D);
    partyInvite(t.w, A, C); // C đã có đội
    expect(t.invited.filter((x) => x.sid === C)).toEqual([]);
    expect(lastToast(t, A)).toMatchObject({ tone: "bad" });
  });

  it("mọi thành viên đều mời được; đội đầy thì không mời nữa, và không vào quá PARTY_MAX", () => {
    const names = [A, B, C, D, E];
    const t = setup(...names);
    join(t.w, A, B);
    join(t.w, B, C); // B (không phải đội trưởng) mời C
    expect(t.w.parties.sameParty(A, C)).toBe(true);
    join(t.w, C, D);
    expect(t.w.parties.membersOf(t.w.parties.partyIdOf(A)!)).toHaveLength(PARTY_MAX);
    partyInvite(t.w, A, E);
    expect(t.invited.filter((x) => x.sid === E)).toEqual([]);
    expect(t.w.parties.partyIdOf(E)).toBeUndefined();
  });

  it("hai lời mời cùng lúc khi chỗ chỉ còn một: người nhận sau bị từ chối", () => {
    const t = setup(A, B, C, D, E);
    join(t.w, A, B);
    join(t.w, A, C); // 3 người, còn 1 chỗ
    partyInvite(t.w, A, D);
    t.w.now += PARTY_INVITE_COOLDOWN_MS;
    partyInvite(t.w, B, E);
    partyAnswer(t.w, D, A, true);
    partyAnswer(t.w, E, B, true);
    expect(t.w.parties.sameParty(A, D)).toBe(true);
    expect(t.w.parties.partyIdOf(E)).toBeUndefined();
    expect(lastToast(t, E)?.text).toContain("đủ người");
  });
});

describe("rời đội, kick, rời phòng", () => {
  it("đội trưởng rời: người vào sớm nhất kế tiếp làm đội trưởng; người rời nhận NO_PARTY", () => {
    const t = setup(A, B, C);
    join(t.w, A, B);
    join(t.w, A, C);
    t.parties.length = 0;
    partyLeave(t.w, A);
    expect(t.w.parties.partyIdOf(A)).toBeUndefined();
    expect(t.parties.find((x) => x.sid === A)?.msg).toEqual(NO_PARTY);
    const toB = t.parties.filter((x) => x.sid === B).at(-1)!.msg;
    expect(toB.leader).toBe(B);
    expect(toB.members.map((m) => m.name)).toEqual([B, C]);
  });

  it("còn một người thì đội giải tán, cả hai nhận NO_PARTY", () => {
    const t = setup(A, B);
    join(t.w, A, B);
    t.parties.length = 0;
    partyLeave(t.w, B);
    expect(t.w.parties.size).toBe(0);
    expect(t.w.parties.partyIdOf(A)).toBeUndefined();
    expect(
      t.parties
        .filter((x) => x.msg.members.length === 0)
        .map((x) => x.sid)
        .sort(),
    ).toEqual([A, B]);
  });

  it("rời khi chưa có đội: báo lỗi, không ném lỗi", () => {
    const t = setup(A);
    expect(() => partyLeave(t.w, A)).not.toThrow();
    expect(lastToast(t, A)).toMatchObject({ tone: "bad" });
  });

  it("kick: chỉ đội trưởng, chỉ thành viên, không tự kick", () => {
    const t = setup(A, B, C, D);
    join(t.w, A, B);
    join(t.w, A, C);
    partyKick(t.w, B, C); // B không phải đội trưởng
    expect(t.w.parties.sameParty(A, C)).toBe(true);
    partyKick(t.w, A, D); // D không ở trong đội
    partyKick(t.w, A, A); // tự kick
    expect(t.w.parties.membersOf(t.w.parties.partyIdOf(A)!)).toHaveLength(3);
    partyKick(t.w, A, C);
    expect(t.w.parties.partyIdOf(C)).toBeUndefined();
    expect(t.parties.filter((x) => x.sid === C).at(-1)?.msg).toEqual(NO_PARTY);
    expect(lastToast(t, C)?.tone).toBe("bad");
    expect(t.w.parties.sameParty(A, B)).toBe(true);
  });

  it("rời phòng (partyDrop): bị loại khỏi đội và lời mời liên quan bị xoá", () => {
    const t = setup(A, B, C);
    join(t.w, A, B);
    partyInvite(t.w, A, C); // A mời C
    partyDrop(t.w, A); // A rời phòng
    t.w.state.players.delete(A);
    expect(t.w.parties.size).toBe(0);
    partyAnswer(t.w, C, A, true); // A không còn
    expect(t.w.parties.partyIdOf(C)).toBeUndefined();
    expect(() => partyDrop(t.w, A)).not.toThrow(); // gọi lại cũng không sao
  });
});

describe("gửi đội hình và chat đội", () => {
  it("tickParty gửi mỗi PARTY_SNAPSHOT_MS, phản ánh máu hiện tại", () => {
    const t = setup(A, B);
    join(t.w, A, B);
    t.parties.length = 0;
    t.w.now = 10_000;
    tickParty(t.w);
    expect(t.parties).toHaveLength(2);
    t.w.state.players.get(B)!.hp = 7;
    t.w.now += PARTY_SNAPSHOT_MS - 1;
    tickParty(t.w);
    expect(t.parties).toHaveLength(2); // chưa tới giờ
    t.w.now += 1;
    tickParty(t.w);
    expect(t.parties).toHaveLength(4);
    expect(t.parties.at(-1)!.msg.members.find((m) => m.name === B)!.hp).toBe(7);
  });

  it("không có đội thì tickParty không gửi gì", () => {
    const t = setup(A, B);
    t.w.now = 10_000;
    tickParty(t.w);
    expect(t.parties).toEqual([]);
  });

  it("/p chỉ tới thành viên, mang channel party; chat thường vẫn tới cả phòng", () => {
    const t = setup(A, B, C);
    join(t.w, A, B);
    chat(t.w, A, "/p tập hợp ở cổng");
    expect(t.chatsTo.map((x) => x.sid).sort()).toEqual([A, B]);
    expect(t.chatsTo[0].msg).toEqual({ from: A, text: "tập hợp ở cổng", channel: "party" });
    expect(t.chats).toEqual([]); // không lọt ra kênh chung
    t.w.now += 1000;
    chat(t.w, A, "xin chào");
    expect(t.chats).toEqual([{ from: A, text: "xin chào" }]);
  });

  it("/p khi chưa có đội báo lỗi; /p rỗng bị bỏ qua; dùng chung hồi chiêu chat", () => {
    const t = setup(A, B);
    chat(t.w, A, "/p xin chào");
    expect(lastToast(t, A)).toMatchObject({ tone: "bad" });
    expect(t.chatsTo).toEqual([]);
    join(t.w, A, B);
    t.w.now += 1000;
    chat(t.w, A, "/p   ");
    chat(t.w, A, "/p");
    expect(t.chatsTo).toEqual([]);
    chat(t.w, A, "/p một");
    chat(t.w, A, "/p hai"); // quá nhanh
    expect(t.chatsTo.filter((x) => x.sid === B)).toHaveLength(1);
  });

  it("chữ '/party' hay '/pham' không bị nhầm là chat đội", () => {
    const t = setup(A, B);
    join(t.w, A, B);
    t.w.now += 1000;
    chat(t.w, A, "/pham vi");
    expect(t.chatsTo).toEqual([]);
    expect(t.chats).toEqual([{ from: A, text: "/pham vi" }]);
  });
});

describe("chia tu vi (killShares)", () => {
  const at = (w: World, sid: string, x: number, y = 1000) => {
    const p = w.state.players.get(sid)!;
    p.x = x;
    p.y = y;
  };

  it("người lẻ: dmg / tổng như trước khi có đội", () => {
    const t = setup(A, B);
    at(t.w, A, 1000);
    at(t.w, B, 1000);
    const s = killShares(
      t.w,
      new Map([
        [A, 30],
        [B, 10],
      ]),
      1000,
      1000,
    );
    expect(s.get(A)).toBeCloseTo(0.75, 9);
    expect(s.get(B)).toBeCloseTo(0.25, 9);
  });

  it("đội 2 người cùng đánh: mỗi người nhận (tổng dmg đội / tổng) × partyExpShare(2)", () => {
    const t = setup(A, B, C);
    for (const n of [A, B, C]) at(t.w, n, 1000);
    join(t.w, A, B);
    const s = killShares(
      t.w,
      new Map([
        [A, 20],
        [B, 20],
        [C, 20],
      ]),
      1000,
      1000,
    );
    expect(s.get(A)).toBeCloseTo((40 / 60) * partyExpShare(2), 9);
    expect(s.get(B)).toBeCloseTo((40 / 60) * partyExpShare(2), 9);
    expect(s.get(C)).toBeCloseTo(20 / 60, 9); // người lẻ không đổi
  });

  it("thành viên chưa ra đòn nhưng đứng gần vẫn được chia; ở xa hoặc đã ngã thì không, và không tính vào n", () => {
    const t = setup(A, B, C, D);
    for (const n of [A, B, C, D]) at(t.w, n, 1000);
    join(t.w, A, B);
    join(t.w, A, C);
    join(t.w, A, D);
    at(t.w, C, 1000 + PARTY_SHARE_RANGE + 50); // ở xa
    t.w.state.players.get(D)!.dead = true; // đã ngã
    const s = killShares(t.w, new Map([[A, 100]]), 1000, 1000);
    expect(s.get(A)).toBeCloseTo(partyExpShare(2), 9); // chỉ A và B đủ điều kiện
    expect(s.get(B)).toBeCloseTo(partyExpShare(2), 9);
    expect(s.has(C)).toBe(false);
    expect(s.has(D)).toBe(false);
  });

  it("đội 4 người: cả đội nhận chưa tới 1.5 lần so với một người hạ một mình", () => {
    const t = setup(A, B, C, D);
    for (const n of [A, B, C, D]) at(t.w, n, 1000);
    join(t.w, A, B);
    join(t.w, A, C);
    join(t.w, A, D);
    const s = killShares(
      t.w,
      new Map([
        [A, 25],
        [B, 25],
        [C, 25],
        [D, 25],
      ]),
      1000,
      1000,
    );
    const total = [...s.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1);
    expect(total).toBeLessThan(1.5);
  });

  it("killMonster: mỗi người nhận theo cảnh giới của chính mình, không ai nhận hai lần", () => {
    const t = setup(A, B);
    const a = t.w.state.players.get(A)!;
    const b = t.w.state.players.get(B)!;
    a.realm = 1;
    a.tier = 0;
    b.realm = 1;
    b.tier = 3;
    for (const p of [a, b]) {
      p.x = 1000;
      p.y = 1000;
      p.exp = 0;
    }
    join(t.w, A, B);
    const { id, mc } = addMonster(t.w, "lang", 1000, 1000);
    mc.damageBy.set(A, 50); // chỉ A ra đòn
    killMonster(t.w, id, mc);
    const f = partyExpShare(2);
    expect(a.exp).toBe(Math.max(1, Math.round(killExp(mc.def, 1, 0) * f)));
    expect(b.exp).toBe(Math.max(1, Math.round(killExp(mc.def, 1, 3) * f)));
    expect(t.w.state.monsters.has(id)).toBe(false);
  });

  it("killMonster: người lẻ nhận y như trước", () => {
    const t = setup(A);
    const a = t.w.state.players.get(A)!;
    a.realm = 1;
    a.exp = 0;
    const { id, mc } = addMonster(t.w, "lang", a.x, a.y);
    mc.damageBy.set(A, 80);
    killMonster(t.w, id, mc);
    expect(a.exp).toBe(Math.max(1, Math.round(killExp(mc.def, 1, 0))));
  });
});

describe("chủ đồ rơi và nhặt đồ của đồng đội", () => {
  it("chủ đồ là người đánh nhiều nhất của nhóm gây nhiều sát thương nhất (đội thắng người lẻ)", () => {
    const t = setup(A, B, C, D, E);
    join(t.w, A, B);
    join(t.w, A, C);
    join(t.w, A, D);
    const owner = lootOwner(
      t.w,
      new Map([
        [A, 24],
        [B, 26], // đội tổng 100
        [C, 25],
        [D, 25],
        [E, 30], // người lẻ đơn lẻ cao nhất nhưng thấp hơn cả đội
      ]),
    );
    expect(owner).toBe(B);
  });

  it("bỏ qua người đã ngã hoặc đã rời; không ai đủ điều kiện thì ''", () => {
    const t = setup(A, B);
    t.w.state.players.get(A)!.dead = true;
    expect(lootOwner(t.w, new Map([[A, 50]]))).toBe("");
    expect(lootOwner(t.w, new Map([["biến mất", 50]]))).toBe("");
    expect(lootOwner(t.w, new Map())).toBe("");
    expect(
      lootOwner(
        t.w,
        new Map([
          [A, 50],
          [B, 10],
        ]),
      ),
    ).toBe(B);
  });

  it("đồng đội nhặt được đồ của chủ trong thời gian chủ nhặt trước; người ngoài đội thì không", () => {
    const t = setup(A, B, C);
    join(t.w, A, B);
    const pa = t.w.state.players.get(A)!;
    for (const n of [B, C]) {
      const p = t.w.state.players.get(n)!;
      p.x = pa.x;
      p.y = pa.y;
    }
    const id = spawnLoot(t.w, "nanh_soi", 1, pa.x, pa.y, A);
    pickup(t.w, C, id);
    expect(t.w.state.loot.has(id)).toBe(true);
    expect(t.w.ctrl.get(C)!.inv.every((s) => s === null)).toBe(true);
    pickup(t.w, B, id);
    expect(t.w.state.loot.has(id)).toBe(false);
    expect(t.w.ctrl.get(B)!.inv[0]).toEqual({ itemId: "nanh_soi", qty: 1 });
  });

  it("rời đội rồi thì không còn nhặt được đồ của người cũ", () => {
    const t = setup(A, B);
    join(t.w, A, B);
    const pa = t.w.state.players.get(A)!;
    const pb = t.w.state.players.get(B)!;
    pb.x = pa.x;
    pb.y = pa.y;
    partyLeave(t.w, B);
    const id = spawnLoot(t.w, "nanh_soi", 1, pa.x, pa.y, A);
    pickup(t.w, B, id);
    expect(t.w.state.loot.has(id)).toBe(true);
  });
});
