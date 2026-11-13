// Đội dùng chung giữa các phòng (mỗi bản đồ một phòng): mời, nhận, chat đội, đội hình, đi qua cổng, đi vắng.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  PARTY_SNAPSHOT_MS,
  getMap,
  NO_PARTY,
  partyExpShare,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import {
  PARTY_AWAY_MS,
  killShares,
  partyAnswer,
  partyChat,
  partyDrop,
  partyInvite,
  partyKick,
  partyResync,
  sameParty,
  tickParty,
} from "./party";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const HAC_PHONG = getMap(HAC_PHONG_ID)!;
const A = "Alpha"; // ở Lạc Hà
const B = "Bravo"; // ở Hắc Phong Cốc
const C = "Charlie"; // ở Lạc Hà

/** Hai phòng dùng chung một Hub: Lạc Hà (A, C) và Hắc Phong Cốc (B) */
function twoRooms() {
  const hub = new Hub();
  const lh = makeWorld(DEFAULT_MAP, hub);
  const hp = makeWorld(HAC_PHONG, hub);
  addPlayer(lh.w, A);
  addPlayer(lh.w, C);
  addPlayer(hp.w, B);
  hp.w.now = lh.w.now; // cùng một đồng hồ như khi chạy thật (Date.now)
  return { hub, lh, hp };
}
const key = (n: string) => n.toLowerCase();

function formParty(t: ReturnType<typeof twoRooms>) {
  partyInvite(t.lh.w, A, B);
  partyAnswer(t.hp.w, B, A, true);
  t.lh.w.now += 5000;
  t.hp.w.now = t.lh.w.now;
}

describe("đội khác bản đồ", () => {
  it("mời người ở bản đồ khác: lời mời tới đúng phòng của họ; nhận thì cả hai nhận đội hình qua phòng của mình, kèm mapId", () => {
    const t = twoRooms();
    partyInvite(t.lh.w, A, B);
    expect(t.hp.invited).toEqual([{ sid: B, msg: expect.objectContaining({ from: A }) }]);
    expect(t.lh.invited).toHaveLength(0);
    partyAnswer(t.hp.w, B, A, true);
    expect(t.lh.w.parties).toBe(t.hp.w.parties); // một sổ chung
    expect(t.lh.w.parties.size).toBe(1);
    expect(sameParty(t.lh.w, A, B)).toBe(false); // sameParty chỉ cho người CÙNG phòng (B không ở phòng này)
    const forA = t.lh.parties.at(-1)!;
    const forB = t.hp.parties.at(-1)!;
    expect(forA.sid).toBe(A);
    expect(forB.sid).toBe(B);
    for (const m of [forA.msg, forB.msg]) {
      expect(m.leader).toBe(A);
      expect(m.members.map((x) => [x.name, x.mapId])).toEqual([
        [A, DEFAULT_MAP_ID],
        [B, HAC_PHONG_ID],
      ]);
    }
    // toast "đã vào đội" tới người ở phòng kia
    expect(t.lh.toasts.some((x) => x.sid === A && /Bravo.*vào đội/.test(x.msg.text))).toBe(true);
    expect(t.hp.toasts.some((x) => x.sid === B && /vào đội/.test(x.msg.text))).toBe(true);
  });

  it("người ở phòng khác đã ở trong đội thì không mời được; mời trùng bị chặn; tên không có ở phòng nào báo không tìm thấy", () => {
    const t = twoRooms();
    formParty(t);
    partyInvite(t.lh.w, C, B);
    expect(t.lh.toasts.at(-1)?.msg.text).toMatch(/đã ở trong một đội/);
    partyInvite(t.lh.w, A, "Khong Co Ai");
    expect(t.lh.toasts.at(-1)?.msg.text).toMatch(/Không tìm thấy/);
  });

  it("chat đội tới thành viên ở mọi bản đồ, người ngoài đội không nhận", () => {
    const t = twoRooms();
    formParty(t);
    partyChat(t.lh.w, A, "xin chào đội");
    expect(t.hp.chatsTo).toEqual([
      { sid: B, msg: { from: A, text: "xin chào đội", channel: "party" } },
    ]);
    expect(t.lh.chatsTo.map((x) => x.sid)).toEqual([A]);
    partyChat(t.hp.w, B, "đáp lại");
    expect(t.lh.chatsTo.at(-1)).toEqual({
      sid: A,
      msg: { from: B, text: "đáp lại", channel: "party" },
    });
    expect(t.lh.chatsTo.some((x) => x.sid === C)).toBe(false);
  });

  it("tickParty: một nhịp dùng chung, phòng nào tick trước gửi cho cả đội và phòng kia không gửi lặp", () => {
    const t = twoRooms();
    formParty(t);
    const before = [t.lh.parties.length, t.hp.parties.length];
    t.lh.w.now += PARTY_SNAPSHOT_MS;
    t.hp.w.now = t.lh.w.now;
    tickParty(t.lh.w);
    tickParty(t.hp.w); // chưa tới nhịp kế tiếp: không gửi nữa
    expect([t.lh.parties.length - before[0], t.hp.parties.length - before[1]]).toEqual([1, 1]);
  });

  it("đi qua cổng vẫn ở trong đội: rời phòng cũ (không partyDrop) thì tạm vắng, vào phòng mới thì hiện lại với mapId mới", () => {
    const t = twoRooms();
    formParty(t);
    // B đi qua cổng sang Lạc Hà: gỡ khỏi phòng Hắc Phong, chưa vào phòng nào
    t.hp.w.state.players.delete(B);
    expect(t.hp.w.parties.partyIdOf(key(B))).toBeDefined();
    t.lh.w.now += PARTY_SNAPSHOT_MS;
    tickParty(t.lh.w);
    expect(t.lh.parties.at(-1)!.msg.members.map((m) => m.name)).toEqual([A]); // B tạm vắng
    expect(t.lh.w.parties.size).toBe(1); // đội vẫn còn
    // B vào phòng Lạc Hà với sessionId MỚI
    addPlayer(t.lh.w, B);
    partyResync(t.lh.w, B);
    const msg = t.lh.parties.at(-1)!;
    expect(msg.sid).toBe(B);
    expect(msg.msg.members.map((m) => [m.name, m.mapId])).toEqual([
      [A, DEFAULT_MAP_ID],
      [B, DEFAULT_MAP_ID],
    ]);
    expect(sameParty(t.lh.w, A, B)).toBe(true); // giờ cùng phòng
  });

  it("đi vắng quá PARTY_AWAY_MS (đóng tab giữa lúc qua cổng) thì bị gỡ; đội còn một người thì giải tán; chưa quá hạn thì giữ", () => {
    const t = twoRooms();
    formParty(t);
    t.lh.w.now += PARTY_SNAPSHOT_MS;
    tickParty(t.lh.w); // B còn ở phòng Hắc Phong: được ghi nhận "đã thấy"
    t.hp.w.state.players.delete(B); // rồi biến mất (đóng tab giữa lúc qua cổng)
    t.lh.w.now += PARTY_SNAPSHOT_MS;
    tickParty(t.lh.w);
    expect(t.lh.w.parties.size).toBe(1);
    t.lh.w.now += PARTY_AWAY_MS - PARTY_SNAPSHOT_MS * 2;
    tickParty(t.lh.w);
    expect(t.lh.w.parties.size).toBe(1); // chưa quá hạn
    t.lh.w.now += PARTY_SNAPSHOT_MS * 3;
    tickParty(t.lh.w);
    expect(t.lh.w.parties.size).toBe(0);
    expect(t.lh.parties.at(-1)).toEqual({ sid: A, msg: NO_PARTY });
    expect(t.lh.w.parties.names.size).toBe(0); // không rò dữ liệu
    expect(t.lh.w.parties.seenAt.size).toBe(0);
  });

  it("phòng đóng (dispose): người ở đó không còn tìm thấy, bị coi là đi vắng", () => {
    const t = twoRooms();
    formParty(t);
    t.hp.w.dispose();
    expect(t.hub.locate(key(B))).toBeNull();
    expect(t.hub.locate(key(A))).not.toBeNull();
    partyChat(t.lh.w, A, "còn ai không"); // không ném lỗi
  });

  it("thoát hẳn (partyDrop): rời đội, người còn lại ở phòng khác được báo và nhận đội hình mới / NO_PARTY", () => {
    const t = twoRooms();
    formParty(t);
    partyDrop(t.hp.w, B);
    expect(t.lh.w.parties.size).toBe(0);
    expect(t.lh.parties.at(-1)).toEqual({ sid: A, msg: NO_PARTY });
    expect(t.hp.parties.at(-1)).toEqual({ sid: B, msg: NO_PARTY });
    expect(t.lh.toasts.some((x) => x.sid === A && /giải tán/.test(x.msg.text))).toBe(true);
  });

  it("đội trưởng kick thành viên ở bản đồ khác: người đó nhận NO_PARTY và toast ở phòng của mình", () => {
    const t = twoRooms();
    partyInvite(t.lh.w, A, B);
    partyAnswer(t.hp.w, B, A, true);
    t.lh.w.now += 5000;
    partyInvite(t.lh.w, A, C);
    partyAnswer(t.lh.w, C, A, true);
    partyKick(t.lh.w, A, B);
    expect(t.hp.parties.at(-1)).toEqual({ sid: B, msg: NO_PARTY });
    expect(t.hp.toasts.at(-1)!.msg.text).toMatch(/mời ra khỏi đội/);
    expect(t.lh.w.parties.partyIdOf(key(B))).toBeUndefined();
    expect(sameParty(t.lh.w, A, C)).toBe(true);
  });

  it("chia tu vi chỉ cho người CÙNG phòng với quái: thành viên ở bản đồ khác không được chia và không tính vào số người", () => {
    const t = twoRooms();
    formParty(t);
    partyInvite(t.lh.w, A, C);
    partyAnswer(t.lh.w, C, A, true);
    const { m: p } = addMonster(t.lh.w, "ho", 1000, 1000);
    const pa = t.lh.w.state.players.get(A)!;
    const pc = t.lh.w.state.players.get(C)!;
    pa.x = p.x + 10;
    pa.y = p.y;
    pc.x = p.x + 20;
    pc.y = p.y;
    const dmg = new Map([[A, 50]]);
    const shares = killShares(t.lh.w, dmg, p.x, p.y);
    expect([...shares.keys()].sort()).toEqual([A, C].sort()); // B ở Hắc Phong Cốc: không có mặt
    // 2 người có mặt (không phải 3): hệ số partyExpShare(2) / người, cả A và C bằng nhau
    expect(shares.get(A)).toBeCloseTo(shares.get(C)!, 10);
    expect(shares.get(A)).toBeCloseTo(partyExpShare(2), 10);
  });
});
