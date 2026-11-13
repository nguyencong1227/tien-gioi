// Đội và tông môn xuyên BA phòng (M6, #405): Lạc Hà, Hắc Phong Cốc, Âm Sương Trạch dùng chung một Hub. `party-multi.test.ts` và
// `sect.test.ts` đã kiểm hai phòng; ở đây kiểm rằng phòng thứ ba (bản đồ mới) không làm gãy sổ đội, chat `/p`, tông môn, chat `/s`
// và kho chung (ví <-> hồ sơ <-> kho), kể cả khi người chơi đi qua cặp cổng mới Hắc Phong <-> Âm Sương.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AM_SUONG_ID,
  DEFAULT_MAP,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  PARTY_SNAPSHOT_MS,
  getMap,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { chat } from "./chat";
import {
  killShares,
  partyAnswer,
  partyChat,
  partyInvite,
  partyResync,
  sameParty,
  tickParty,
} from "./party";
import { sectAnswer, sectCreate, sectDeposit, sectDrop, sectInvite, sectOnJoin } from "./sect";
import { addMonster, addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-ba-ban-do-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const A = "Alpha"; // Lạc Hà
const B = "Bravo"; // Hắc Phong Cốc
const C = "Charlie"; // Âm Sương Trạch
const key = (s: string) => s.toLowerCase();

let now = 1_700_000_000_000;
let hub: Hub;
let lh: ReturnType<typeof makeWorld>;
let hp: ReturnType<typeof makeWorld>;
let as: ReturnType<typeof makeWorld>;
let svc: SectService;

beforeEach(() => {
  now = 1_700_000_000_000;
  hub = new Hub();
  lh = makeWorld(DEFAULT_MAP, hub);
  hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);
  as = makeWorld(getMap(AM_SUONG_ID)!, hub);
  let ids = 0;
  svc = new SectService(
    new FileSectStore(path.join(root, `s${++n}`), () => now),
    () => now,
    () => `sect${++ids}`,
  );
  for (const r of [lh, hp, as]) {
    r.w.now = now;
    r.w.sectService = svc;
    r.w.onSaveNow = async () => true;
  }
  addPlayer(lh.w, A, 1, 8);
  addPlayer(hp.w, B, 1, 8);
  addPlayer(as.w, C, 1, 8);
  for (const [r, who] of [
    [lh, A],
    [hp, B],
    [as, C],
  ] as const)
    r.w.ctrl.get(who)!.coin = 5000;
});

const tick = (ms: number) => {
  now += ms;
  lh.w.now = hp.w.now = as.w.now = now;
};
const rooms = () => [lh, hp, as] as const;
const gotChat = (r: typeof lh, who: string) =>
  r.chatsTo.filter((c) => c.sid === who).map((c) => c.msg);

/** Đội A + B + C: A mời B (Hắc Phong) và C (Âm Sương), cả hai nhận. */
function formParty() {
  partyInvite(lh.w, A, B);
  partyAnswer(hp.w, B, A, true);
  tick(5000); // hồi chiêu mời của người mời
  partyInvite(lh.w, A, C);
  partyAnswer(as.w, C, A, true);
  tick(5000);
}

describe("đội xuyên ba phòng", () => {
  it("mời người ở phòng thứ ba: lời mời tới đúng phòng Âm Sương; nhận thì cả ba nhận đội hình kèm đúng mapId", () => {
    partyInvite(lh.w, A, C);
    expect(as.invited.map((x) => x.sid)).toEqual([C]);
    expect(hp.invited).toHaveLength(0);
    expect(lh.invited).toHaveLength(0);
    partyAnswer(as.w, C, A, true);
    tick(5000); // hồi chiêu mời của người mời
    partyInvite(lh.w, A, B);
    partyAnswer(hp.w, B, A, true);
    tick(PARTY_SNAPSHOT_MS);
    for (const r of rooms()) tickParty(r.w);
    const expected = [
      [A, DEFAULT_MAP_ID],
      [B, HAC_PHONG_ID],
      [C, AM_SUONG_ID],
    ];
    for (const [r, who] of [
      [lh, A],
      [hp, B],
      [as, C],
    ] as const) {
      const msg = r.parties.filter((x) => x.sid === who).at(-1)?.msg;
      expect(
        msg?.members.map((m) => [m.name, m.mapId]).sort(),
        `đội hình ở phòng của ${who}`,
      ).toEqual(expected.slice().sort());
    }
    // Sổ đội là MỘT cho cả ba phòng
    expect(new Set([lh, hp, as].map((r) => r.w.parties.partyIdOf(key(A)))).size).toBe(1);
    expect(lh.w.parties.partyIdOf(key(C))).toBe(lh.w.parties.partyIdOf(key(A)));
  });

  it("chat đội /p tới thành viên ở cả ba phòng, kể cả khi người gửi ở phòng thứ ba", () => {
    formParty();
    partyChat(as.w, C, "xin chào từ Âm Sương");
    const msg = { from: C, text: "xin chào từ Âm Sương", channel: "party" };
    expect(gotChat(lh, A)).toEqual([msg]);
    expect(gotChat(hp, B)).toEqual([msg]);
    expect(gotChat(as, C)).toEqual([msg]);
    partyChat(lh.w, A, "nghe rõ");
    expect(gotChat(as, C).at(-1)).toEqual({ from: A, text: "nghe rõ", channel: "party" });
    expect(gotChat(hp, B).at(-1)).toEqual({ from: A, text: "nghe rõ", channel: "party" });
  });

  it("đi qua cổng Âm Sương -> Hắc Phong vẫn ở trong đội (vào phòng mới với sessionId mới, mapId mới)", () => {
    formParty();
    // C qua cổng: gỡ khỏi phòng Âm Sương, rồi vào phòng Hắc Phong
    as.w.state.players.delete(C);
    expect(as.w.parties.partyIdOf(key(C))).toBeDefined(); // chưa partyDrop: đội còn
    expect(as.w.parties.partyIdOf(key(C))).toBe(as.w.parties.partyIdOf(key(A)));
    // C vào phòng Hắc Phong (sổ đội theo đạo hiệu viết thường, không theo sessionId)
    addPlayer(hp.w, C, 1, 8);
    partyResync(hp.w, C);
    const msg = hp.parties.filter((x) => x.sid === C).at(-1)?.msg;
    expect(msg?.members.find((m) => m.name === C)?.mapId).toBe(HAC_PHONG_ID);
    expect(sameParty(hp.w, B, C)).toBe(true); // giờ cùng phòng với B
    expect(sameParty(as.w, A, B)).toBe(false);
  });

  it("chia tu vi ở Âm Sương chỉ tính người CÓ MẶT ở Âm Sương; hai người ở phòng khác không được chia và không tính vào số người", () => {
    formParty();
    addPlayer(as.w, "Dora", 1, 8);
    tick(5000);
    partyInvite(lh.w, A, "Dora");
    partyAnswer(as.w, "Dora", A, true);
    const { m } = addMonster(as.w, "suong_ho", as.w.map.townPx.x + 400, as.w.map.townPx.y - 400);
    for (const who of [C, "Dora"]) {
      const p = as.w.state.players.get(who)!;
      p.x = m.x + 10;
      p.y = m.y;
    }
    const shares = killShares(as.w, new Map([[C, 50]]), m.x, m.y);
    expect([...shares.keys()].sort()).toEqual([C, "Dora"].sort()); // A (Lạc Hà), B (Hắc Phong): không có mặt
    expect(shares.get(C)).toBeCloseTo(shares.get("Dora")!, 10);
    // đội có 4 người nhưng chỉ 2 có mặt: hệ số theo 2 người, mỗi người một nửa
    expect(shares.get(C)).toBeCloseTo((1 + 0.15) / 2, 10);
    expect(sameParty(as.w, C, "Dora")).toBe(true);
    expect(sameParty(as.w, C, A)).toBe(false); // khác phòng
  });
});

describe("tông môn xuyên ba phòng", () => {
  /** A lập tông môn ở Lạc Hà, mời B (Hắc Phong) và C (Âm Sương), cả hai nhận. */
  async function makeSectOfThree() {
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    for (const [r, who] of [
      [hp, B],
      [as, C],
    ] as const) {
      await sectInvite(lh.w, A, { name: who });
      await sectAnswer(r.w, who, { from: A }, true);
    }
  }

  it("mời người ở phòng Âm Sương: lời mời tới đúng phòng, nhận thì biệt hiệu hiện ở state của phòng đó, presence đủ ba người", async () => {
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    await sectInvite(lh.w, A, { name: C });
    expect(as.sectInviteds.map((x) => x.sid)).toEqual([C]);
    await sectAnswer(as.w, C, { from: A }, true);
    expect(as.w.state.players.get(C)!.sect).toBe("TV");
    await sectInvite(lh.w, A, { name: B });
    await sectAnswer(hp.w, B, { from: A }, true);
    for (const r of rooms())
      expect(
        r.sectPresences
          .at(-1)
          ?.msg.online.map((e) => e.name)
          .sort(),
      ).toEqual([A, B, C].sort());
  });

  it("chat /s tới thành viên ở CẢ BA phòng; người ngoài tông môn (cùng phòng) không nhận", async () => {
    await makeSectOfThree();
    addPlayer(as.w, "Dora", 1, 8); // cùng phòng Âm Sương với C, KHÔNG ở tông môn
    chat(as.w, C, "/s săn Hắc Giao lúc tối");
    const msg = { from: C, text: "săn Hắc Giao lúc tối", channel: "sect" };
    expect(gotChat(lh, A)).toEqual([msg]);
    expect(gotChat(hp, B)).toEqual([msg]);
    expect(gotChat(as, C)).toEqual([msg]);
    expect(gotChat(as, "Dora")).toEqual([]);
  });

  it("góp tiền từ phòng Âm Sương: trừ ví đúng số, mọi thành viên ở mọi phòng thấy cùng số dư kho; tổng ví + kho không đổi", async () => {
    await makeSectOfThree();
    const total = () => lh.w.ctrl.get(A)!.coin + hp.w.ctrl.get(B)!.coin + as.w.ctrl.get(C)!.coin;
    const treasury = async () => (await svc.sectOf(key(A)))!.coin;
    const before = total() + (await treasury());
    await sectDeposit(as.w, C, { amount: 900 });
    expect(as.w.ctrl.get(C)!.coin).toBe(5000 - 900);
    expect(await treasury()).toBe(900);
    expect(total() + (await treasury())).toBe(before);
    for (const [r, who] of [
      [lh, A],
      [hp, B],
      [as, C],
    ] as const)
      expect(
        r.sects.filter((s) => s.sid === who).at(-1)?.msg.sect?.coin,
        `kho thấy ở phòng của ${who}`,
      ).toBe(900);
  });

  it("qua cổng Hắc Phong -> Âm Sương vẫn là thành viên: vào phòng mới nhận lại ảnh chụp và biệt hiệu; presence đổi phòng", async () => {
    await makeSectOfThree();
    // B qua cổng bắc: rời phòng Hắc Phong rồi vào phòng Âm Sương
    sectDrop(hp.w, B);
    hp.w.state.players.delete(B);
    hp.w.ctrl.delete(B);
    expect(hub.sects.online.has(key(B))).toBe(false);
    addPlayer(as.w, B, 1, 8);
    await sectOnJoin(as.w, B);
    expect(as.w.state.players.get(B)!.sect).toBe("TV");
    expect(as.sects.filter((s) => s.sid === B).at(-1)?.msg.sect?.myRank).toBe("de_tu");
    expect(hub.sects.online.get(key(B))).toBe("sect1");
    chat(lh.w, A, "/s chào");
    expect(gotChat(as, B).at(-1)).toEqual({ from: A, text: "chào", channel: "sect" });
  });
});
