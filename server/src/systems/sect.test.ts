// Tông môn nối với phòng (M3.6 bước 6c): lập / mời / nhận / rời / mời ra / chuyển quyền / giải tán / chat `/s` / presence / kho + ví.
// World giả, hai phòng dùng chung Hub, kho tệp thật (thư mục tạm) + `SectService` thật. Kiểm cả thứ tự "ví <-> hồ sơ <-> kho".
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  COIN_CAP,
  DEFAULT_MAP,
  HAC_PHONG_ID,
  SECT_CREATE_COOLDOWN_MS,
  SECT_CREATE_COST,
  SECT_INVITES_MAX,
  SECT_INVITE_TTL_MS,
  SECT_PRESENCE_MS,
  SECT_REJOIN_COOLDOWN_MS,
  getMap,
} from "@tien-gioi/shared";
import { Hub } from "../hub";
import { FileSectStore } from "../sect-store";
import { SectService } from "../sect-service";
import { chat } from "./chat";
import {
  sectAnswer,
  sectChat,
  sectCreate,
  sectDeposit,
  sectDisband,
  sectDrop,
  sectInvite,
  sectKick,
  sectLeave,
  sectMotd,
  sectOnJoin,
  sectRank,
  sectTransfer,
  sectWithdraw,
  tickSect,
} from "./sect";
import { addPlayer, makeWorld } from "./test-helpers";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-sys-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const A = "Alpha"; // ở Lạc Hà, Tông chủ
const B = "Bravo"; // ở Hắc Phong Cốc
const C = "Charlie"; // ở Lạc Hà
const D = "Delta"; // ở Hắc Phong Cốc
const key = (s: string) => s.toLowerCase();

let now = 1_700_000_000_000;
let hub: Hub;
let lh: ReturnType<typeof makeWorld>;
let hp: ReturnType<typeof makeWorld>;
let store: FileSectStore;
let svc: SectService;
let order: string[];

beforeEach(() => {
  now = 1_700_000_000_000;
  hub = new Hub();
  lh = makeWorld(DEFAULT_MAP, hub);
  hp = makeWorld(getMap(HAC_PHONG_ID)!, hub);
  store = new FileSectStore(path.join(root, `s${++n}`), () => now);
  let ids = 0;
  svc = new SectService(
    store,
    () => now,
    () => `sect${++ids}`,
  );
  order = [];
  for (const r of [lh, hp]) {
    r.w.now = now;
    r.w.sectService = svc;
    r.w.onSaveNow = async (sid) => (order.push(`save:${sid}`), true);
  }
  addPlayer(lh.w, A, 1, 8);
  addPlayer(hp.w, B, 1, 8);
  addPlayer(lh.w, C, 1, 8);
  addPlayer(hp.w, D, 1, 8);
  for (const [r, who] of [
    [lh, A],
    [hp, B],
    [lh, C],
    [hp, D],
  ] as const)
    r.w.ctrl.get(who)!.coin = 5000;
  // ghi thứ tự các thao tác của dịch vụ
  for (const m of ["create", "deposit", "withdraw"] as const) {
    const orig = svc[m].bind(svc) as (...a: unknown[]) => Promise<unknown>;
    (svc as unknown as Record<string, unknown>)[m] = async (...a: unknown[]) => {
      order.push(`service:${m}`);
      return orig(...a);
    };
  }
});

const tick = (ms: number) => {
  now += ms;
  lh.w.now = hp.w.now = now;
};
const coinOf = (r: typeof lh, who: string) => r.w.ctrl.get(who)!.coin;
const tagOf = (r: typeof lh, who: string) => r.w.state.players.get(who)!.sect;
const lastToast = (r: typeof lh, who: string) =>
  r.toasts.filter((t) => t.sid === who).at(-1)?.msg.text;
const snapshotsOf = (r: typeof lh, who: string) => r.sects.filter((s) => s.sid === who);
const lastSnap = (r: typeof lh, who: string) => snapshotsOf(r, who).at(-1)?.msg.sect;

/** A lập tông môn "Thanh Van" [TV]. */
async function makeSect() {
  await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
  return (await svc.sectOf(key(A)))!;
}
/** A mời `who` (ở phòng `r`) và người đó nhận. */
async function join(r: typeof lh, who: string) {
  await sectInvite(lh.w, A, { name: who });
  await sectAnswer(r.w, who, { from: A }, true);
}

describe("lập tông môn", () => {
  it("trừ SECT_CREATE_COST, LƯU hồ sơ TRƯỚC khi kho tạo; Tông chủ nhận ảnh chụp, biệt hiệu hiện ở state", async () => {
    await sectCreate(lh.w, A, { name: " Thanh  Van ", tag: "TV" });
    expect(order).toEqual([`save:${A}`, "service:create"]);
    expect(coinOf(lh, A)).toBe(5000 - SECT_CREATE_COST);
    expect(tagOf(lh, A)).toBe("TV");
    expect(lastSnap(lh, A)).toMatchObject({
      name: "Thanh Van",
      tag: "TV",
      myRank: "chu",
      coin: 0,
      members: [{ name: A, rank: "chu" }],
    });
    expect(lastToast(lh, A)).toMatch(/Đã lập tông môn Thanh Van/);
    expect(hub.sects.online.get(key(A))).toBe("sect1");
  });

  it("không đủ tiền / tên / biệt hiệu sai / đã có tông môn / hồi chiêu: từ chối, KHÔNG trừ tiền, không lưu", async () => {
    lh.w.ctrl.get(A)!.coin = SECT_CREATE_COST - 1;
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    expect(lastToast(lh, A)).toMatch(/Không đủ Linh thạch/);
    lh.w.ctrl.get(A)!.coin = 5000;
    await sectCreate(lh.w, A, { name: "x", tag: "TV" });
    expect(lastToast(lh, A)).toMatch(/Tên tông môn/);
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "T" });
    expect(lastToast(lh, A)).toMatch(/Biệt hiệu/);
    await sectCreate(lh.w, A, null);
    await sectCreate(lh.w, A, "Thanh Van");
    expect(coinOf(lh, A)).toBe(5000);
    expect(order).toEqual([]);
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    order.length = 0;
    const after = coinOf(lh, A);
    await sectCreate(lh.w, A, { name: "Tong Hai", tag: "TH" });
    expect(lastToast(lh, A)).toMatch(/đã thuộc một tông môn/);
    expect(coinOf(lh, A)).toBe(after);
    expect(order).toEqual([]);
  });

  it("tên trùng (kho từ chối sau khi đã trừ tiền): HOÀN tiền, báo lý do", async () => {
    await makeSect();
    order.length = 0;
    const before = coinOf(hp, B);
    await sectCreate(hp.w, B, { name: "THANH VAN", tag: "XX" });
    expect(order).toEqual([`save:${B}`, "service:create"]); // đã trừ và lưu rồi mới bị từ chối
    expect(coinOf(hp, B)).toBe(before); // hoàn đủ
    expect(lastToast(hp, B)).toMatch(/Tên tông môn này đã có người dùng/);
    expect(tagOf(hp, B)).toBe("");
    // người lập tông môn ngay sau khi giải tán vẫn bị hồi chiêu: cũng hoàn tiền
    await sectDisband(lh.w, A);
    const a0 = coinOf(lh, A);
    await sectCreate(lh.w, A, { name: "Tong Moi", tag: "TM" });
    expect(lastToast(lh, A)).toMatch(/Vừa lập tông môn xong/);
    expect(coinOf(lh, A)).toBe(a0);
    tick(SECT_CREATE_COOLDOWN_MS);
    await sectCreate(lh.w, A, { name: "Tong Moi", tag: "TM" });
    expect(coinOf(lh, A)).toBe(a0 - SECT_CREATE_COST);
  });

  it("hai người lập CÙNG LÚC cùng tên: một tông môn, người thua được hoàn tiền (tổng Linh thạch chỉ giảm đúng một phí)", async () => {
    const total = () => coinOf(lh, A) + coinOf(hp, B);
    const before = total();
    await Promise.all([
      sectCreate(lh.w, A, { name: "Dua Ten", tag: "D1" }),
      sectCreate(hp.w, B, { name: "dua ten", tag: "D2" }),
    ]);
    expect((await store.all()).length).toBe(1);
    expect(total()).toBe(before - SECT_CREATE_COST);
  });

  it("SECTS=off (không có dịch vụ): mọi tin bị từ chối `disabled`, không đổi ví / state", async () => {
    lh.w.sectService = null;
    await sectCreate(lh.w, A, { name: "Thanh Van", tag: "TV" });
    await sectInvite(lh.w, A, { name: B });
    await sectLeave(lh.w, A);
    await sectDeposit(lh.w, A, { amount: 5 });
    await sectOnJoin(lh.w, A);
    expect(lastToast(lh, A)).toMatch(/chưa mở/);
    expect(coinOf(lh, A)).toBe(5000);
    expect(tagOf(lh, A)).toBe("");
    expect(lh.sects).toHaveLength(0);
  });
});

describe("mời và nhận", () => {
  it("mời người ở PHÒNG KHÁC: họ nhận `sectInvited`; nhận thì cả hai nhận ảnh chụp mới, biệt hiệu hiện, lời mời được dùng hết", async () => {
    await makeSect();
    await sectInvite(lh.w, A, { name: B });
    expect(hp.sectInviteds).toEqual([
      { sid: B, msg: { from: A, sect: "Thanh Van", tag: "TV", ttlMs: SECT_INVITE_TTL_MS } },
    ]);
    expect(lastToast(lh, A)).toMatch(/Đã mời Bravo/);
    await sectAnswer(hp.w, B, { from: A }, true);
    expect(tagOf(hp, B)).toBe("TV");
    expect(lastSnap(hp, B)).toMatchObject({ myRank: "de_tu", members: [{ name: A }, { name: B }] });
    expect(lastSnap(lh, A)?.members.map((m) => m.name)).toEqual([A, B]); // Tông chủ thấy người mới
    // presence cập nhật NGAY (không chờ nhịp tick): Tông chủ thấy B trực tuyến ở Hắc Phong Cốc
    expect(lh.sectPresences.at(-1)?.msg.online.map((e) => [e.name, e.mapId])).toEqual([
      [A, DEFAULT_MAP.def.id],
      [B, HAC_PHONG_ID],
    ]);
    expect(hp.sectPresences.at(-1)?.msg.online.map((e) => e.name)).toEqual([A, B]);
    expect(hub.sects.invitesSize).toBe(0);
    expect(lastToast(hp, B)).toMatch(/Đã gia nhập/);
    // nhận lại lời mời cũ: không còn
    await sectAnswer(hp.w, B, { from: A }, true);
    expect(lastToast(hp, B)).toMatch(/không còn hiệu lực/);
  });

  it("từ chối: Tông chủ được báo, không vào; hết hạn mời: `invite_expired`; người lạ / chính mình / đã ở tông môn / sai quyền bị từ chối đúng lý do", async () => {
    await makeSect();
    await sectInvite(lh.w, A, { name: B });
    await sectAnswer(hp.w, B, { from: A }, false);
    expect(lastToast(lh, A)).toMatch(/Bravo từ chối/);
    expect(tagOf(hp, B)).toBe("");
    expect(hub.sects.invitesSize).toBe(0);

    await sectInvite(lh.w, A, { name: B });
    tick(SECT_INVITE_TTL_MS + 1);
    await sectAnswer(hp.w, B, { from: A }, true);
    expect(lastToast(hp, B)).toMatch(/hết hạn/);
    expect(tagOf(hp, B)).toBe("");

    await sectInvite(lh.w, A, { name: "Nguoi La" });
    expect(lastToast(lh, A)).toMatch(/Không thấy đạo hữu/);
    await sectInvite(lh.w, A, { name: A });
    expect(lastToast(lh, A)).toMatch(/chính mình/);
    await sectInvite(lh.w, C, { name: B }); // C chưa ở tông môn nào
    expect(lastToast(lh, C)).toMatch(/chưa thuộc tông môn/);
    await join(hp, B);
    await sectInvite(lh.w, A, { name: B });
    expect(lastToast(lh, A)).toMatch(/đã thuộc một tông môn/);
    await sectInvite(hp.w, B, { name: C }); // B là Đệ tử: không có quyền mời
    expect(lastToast(hp, B)).toMatch(/chưa đủ quyền/);
  });

  it("mời trùng (đang chờ) bị chặn; tới SECT_INVITES_MAX lời mời từ các tông môn khác nhau thì người kia 'quá tải'; hồi chiêu vào lại sau khi rời", async () => {
    await makeSect();
    await sectInvite(lh.w, A, { name: B });
    await sectInvite(lh.w, A, { name: B });
    expect(lastToast(lh, A)).toMatch(/Đã mời đạo hữu này, đang chờ/);
    expect(hp.sectInviteds).toHaveLength(1);
    // ba tông môn khác (do ba người khác lập) cùng mời D
    const others = ["Eve", "Finn", "Gina"].slice(0, SECT_INVITES_MAX);
    for (const [i, nm] of others.entries()) {
      addPlayer(lh.w, nm, 1, 8);
      lh.w.ctrl.get(nm)!.coin = 5000;
      await sectCreate(lh.w, nm, { name: `Tong ${nm}`, tag: `T${i}X` });
      await sectInvite(lh.w, nm, { name: D });
    }
    expect(hub.sects._invitesTo(key(D), now)).toHaveLength(SECT_INVITES_MAX);
    addPlayer(lh.w, "Hugo", 1, 8);
    lh.w.ctrl.get("Hugo")!.coin = 5000;
    await sectCreate(lh.w, "Hugo", { name: "Tong Hugo", tag: "HG" });
    await sectInvite(lh.w, "Hugo", { name: D });
    expect(lastToast(lh, "Hugo")).toMatch(/quá nhiều lời mời/);

    // B rời rồi bị chặn vào lại một lúc
    await sectAnswer(hp.w, B, { from: A }, true);
    await sectLeave(hp.w, B);
    await sectInvite(lh.w, A, { name: B });
    expect(lastToast(lh, A)).toMatch(/vừa rời tông môn/);
    tick(SECT_REJOIN_COOLDOWN_MS);
    await sectInvite(lh.w, A, { name: B });
    expect(hp.sectInviteds.length).toBeGreaterThan(1);
  });

  it("nhận một lời mời thì các lời mời khác tới người đó bị quên (không treo tới hết hạn)", async () => {
    await makeSect();
    addPlayer(lh.w, "Eve", 1, 8);
    lh.w.ctrl.get("Eve")!.coin = 5000;
    await sectCreate(lh.w, "Eve", { name: "Tong Eve", tag: "EV" });
    await sectInvite(lh.w, A, { name: B });
    await sectInvite(lh.w, "Eve", { name: B });
    expect(hub.sects._invitesTo(key(B), now)).toHaveLength(2);
    await sectAnswer(hp.w, B, { from: A }, true);
    expect(hub.sects._invitesTo(key(B), now)).toHaveLength(0);
    await sectAnswer(hp.w, B, { from: "Eve" }, true); // lời mời của Eve đã bị quên
    expect(lastToast(hp, B)).toMatch(/không còn hiệu lực/);
    expect(tagOf(hp, B)).toBe("TV");
  });

  it("nhận lời mời khi người mời vừa mất quyền / tông môn đã giải tán: từ chối, không vào", async () => {
    await makeSect();
    await join(hp, B);
    await sectRank(lh.w, A, { name: B, rank: "truong_lao" });
    await sectInvite(hp.w, B, { name: C });
    await sectRank(lh.w, A, { name: B, rank: "de_tu" }); // B mất quyền mời
    await sectAnswer(lh.w, C, { from: B }, true);
    expect(lastToast(lh, C)).toMatch(/không còn hiệu lực/);
    expect(tagOf(lh, C)).toBe("");

    await sectInvite(lh.w, A, { name: C });
    await sectKick(lh.w, A, { name: B });
    await sectDisband(lh.w, A);
    await sectAnswer(lh.w, C, { from: A }, true);
    expect(tagOf(lh, C)).toBe("");
    expect(lastToast(lh, C)).toMatch(/không còn hiệu lực/);
  });
});

describe("rời / mời ra / chức vụ / giải tán", () => {
  it("rời: người rời nhận NO_SECT và mất biệt hiệu, những người còn lại nhận ảnh chụp mới; Tông chủ không rời được", async () => {
    await makeSect();
    await join(hp, B);
    await sectLeave(lh.w, A);
    expect(lastToast(lh, A)).toMatch(/phải chuyển quyền/);
    await sectLeave(hp.w, B);
    expect(lastSnap(hp, B)).toBeNull();
    expect(tagOf(hp, B)).toBe("");
    expect(lastSnap(lh, A)?.members.map((m) => m.name)).toEqual([A]);
    expect(hub.sects.online.has(key(B))).toBe(false);
  });

  it("mời ra: người bị mời ra (ở phòng khác) nhận NO_SECT + toast, mất biệt hiệu; thiếu quyền bị từ chối", async () => {
    await makeSect();
    await join(hp, B);
    await join(lh, C);
    await sectKick(hp.w, B, { name: C }); // Đệ tử không có quyền
    expect(lastToast(hp, B)).toMatch(/chưa đủ quyền/);
    await sectKick(lh.w, A, { name: B });
    expect(lastSnap(hp, B)).toBeNull();
    expect(tagOf(hp, B)).toBe("");
    expect(lastToast(hp, B)).toMatch(/bị mời ra/);
    expect(lastSnap(lh, C)?.members.map((m) => m.name)).toEqual([A, C]);
  });

  it("chuyển quyền: Tông chủ mới và cũ đều nhận ảnh chụp đúng hạng; thông báo (motd) cập nhật cho mọi người", async () => {
    await makeSect();
    await join(hp, B);
    await sectTransfer(lh.w, A, { name: B });
    expect(lastSnap(hp, B)?.myRank).toBe("chu");
    expect(lastSnap(lh, A)?.myRank).toBe("truong_lao");
    await sectMotd(hp.w, B, { motd: "Hom nay san boss" });
    expect(lastSnap(lh, A)?.motd).toBe("Hom nay san boss");
    await sectMotd(lh.w, A, { motd: "toi la ai" }); // Trưởng lão: được sửa
    expect(lastSnap(hp, B)?.motd).toBe("toi la ai");
    await sectRank(lh.w, A, { name: B, rank: "de_tu" }); // A không còn quyền
    expect(lastToast(lh, A)).toMatch(/chưa đủ quyền/);
  });

  it("giải tán: mọi thành viên (mọi phòng) nhận NO_SECT, mất biệt hiệu, nhận thông báo; bộ nhớ chung dọn sạch", async () => {
    await makeSect();
    await join(hp, B);
    await join(lh, C);
    await sectDisband(lh.w, A);
    for (const [r, who] of [
      [lh, A],
      [hp, B],
      [lh, C],
    ] as const) {
      expect(lastSnap(r, who)).toBeNull();
      expect(tagOf(r, who)).toBe("");
      expect(lastToast(r, who)).toMatch(/đã giải tán/);
    }
    expect(hub.sects.online.size).toBe(0);
    expect(hub.sects.cache.size).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it("bản ghi thực sự là nguồn: tin nhắn rác không phá gì (sai kiểu, thiếu trường)", async () => {
    await makeSect();
    for (const bad of [
      null,
      undefined,
      5,
      "x",
      [],
      {},
      { name: 5 },
      { name: "x" },
      { rank: "chu", name: "x" },
    ]) {
      await sectInvite(lh.w, A, bad);
      await sectKick(lh.w, A, bad);
      await sectRank(lh.w, A, bad);
      await sectTransfer(lh.w, A, bad);
      await sectAnswer(lh.w, A, bad, true);
      await sectMotd(lh.w, A, bad === undefined ? { motd: 5 } : bad);
    }
    expect((await svc.sectOf(key(A)))?.members).toHaveLength(1);
    expect(hp.sectInviteds).toHaveLength(0);
  });
});

describe("chat tông môn /s", () => {
  it("tới thành viên ở MỌI phòng (kể cả người gửi), không tới người ngoài; kênh `sect`; chat thường và /p không đổi", async () => {
    await makeSect();
    await join(hp, B);
    chat(lh.w, A, "/s Hom nay san boss");
    const got = (r: typeof lh, who: string) =>
      r.chatsTo.filter((c) => c.sid === who).map((c) => c.msg);
    expect(got(lh, A)).toEqual([{ from: A, text: "Hom nay san boss", channel: "sect" }]);
    expect(got(hp, B)).toEqual([{ from: A, text: "Hom nay san boss", channel: "sect" }]);
    expect(got(lh, C)).toEqual([]);
    expect(got(hp, D)).toEqual([]);
    // chat chung vẫn đi kênh chung; "/sect" không phải lệnh /s
    lh.w.ctrl.get(A)!.nextChat = 0;
    chat(lh.w, A, "/sect xin chao");
    expect(lh.chats.at(-1)).toEqual({ from: A, text: "/sect xin chao" });
    lh.w.ctrl.get(A)!.nextChat = 0;
    const before = lh.chatsTo.length;
    chat(lh.w, A, "/s   "); // rỗng: bỏ
    expect(lh.chatsTo).toHaveLength(before);
  });

  it("người ngoài tông môn gửi /s: báo chưa ở tông môn, không ai nhận; sau khi rời không nhận nữa", async () => {
    await makeSect();
    await join(hp, B);
    chat(lh.w, C, "/s xin chao");
    expect(lastToast(lh, C)).toMatch(/chưa thuộc tông môn/);
    expect(hp.chatsTo.filter((c) => c.msg.channel === "sect")).toHaveLength(0);
    await sectLeave(hp.w, B);
    sectChat(lh.w, A, "con ai khong");
    expect(hp.chatsTo.filter((c) => c.msg.channel === "sect")).toHaveLength(0);
  });
});

describe("vào phòng, presence, rời phòng", () => {
  it("vào phòng: nhận ảnh chụp, biệt hiệu hiện (bất đồng bộ), đạo hiệu đã lưu cập nhật; mọi người thấy người mới trực tuyến", async () => {
    await makeSect();
    await join(hp, B);
    // B qua cổng: rời phòng cũ rồi vào phòng mới (xoá ctrl, tạo lại)
    sectDrop(hp.w, B);
    hp.w.state.players.delete(B);
    hp.w.ctrl.delete(B);
    expect(hub.sects.online.has(key(B))).toBe(false);
    addPlayer(lh.w, B, 1, 8);
    await sectOnJoin(lh.w, B);
    expect(tagOf(lh, B)).toBe("TV");
    expect(lastSnap(lh, B)?.myRank).toBe("de_tu");
    expect(
      lh.sectPresences
        .at(-1)
        ?.msg.online.map((e) => e.name)
        .sort(),
    ).toEqual([A, B].sort());
    expect(hub.sects.online.get(key(B))).toBe("sect1");
  });

  it("presence: gửi khi có đổi (không mỗi nhịp); người rời phòng thành ngoại tuyến; cache dọn khi không còn ai trực tuyến", async () => {
    await makeSect();
    await join(hp, B);
    tick(SECT_PRESENCE_MS);
    tickSect(lh.w);
    const sent = () =>
      lh.sectPresences.filter((p) => p.sid === A).length +
      hp.sectPresences.filter((p) => p.sid === B).length;
    const s1 = sent();
    expect(s1).toBeGreaterThan(0);
    expect(lh.sectPresences.at(-1)?.msg.online).toEqual([
      { name: A, realm: 1, tier: 8, mapId: DEFAULT_MAP.def.id },
      { name: B, realm: 1, tier: 8, mapId: HAC_PHONG_ID },
    ]);
    tick(SECT_PRESENCE_MS);
    tickSect(lh.w);
    expect(sent()).toBe(s1); // không đổi: không gửi lại
    // B đổi cảnh giới: nhịp tới gửi lại
    hp.w.state.players.get(B)!.tier = 9;
    tick(SECT_PRESENCE_MS);
    tickSect(hp.w);
    expect(sent()).toBeGreaterThan(s1);
    // cả hai rời: bộ nhớ chung dọn
    sectDrop(lh.w, A);
    sectDrop(hp.w, B);
    expect(hub.sects.online.size).toBe(0);
    expect(hub.sects.cache.size).toBe(0);
    tick(SECT_PRESENCE_MS);
    tickSect(lh.w);
    expect(hub.sects.lastPresence.size).toBe(0);
  });

  it("lời mời hết hạn được dọn theo nhịp chung (không rò rỉ)", async () => {
    await makeSect();
    await sectInvite(lh.w, A, { name: B });
    await sectInvite(lh.w, A, { name: C });
    expect(hub.sects.invitesSize).toBe(2);
    tick(SECT_INVITE_TTL_MS + SECT_PRESENCE_MS);
    tickSect(lh.w);
    expect(hub.sects.invitesSize).toBe(0);
  });
});

describe("kho chung: ví <-> hồ sơ <-> kho", () => {
  it("góp: trừ ví -> LƯU hồ sơ -> cộng kho; mọi thành viên thấy số dư và sổ ghi", async () => {
    await makeSect();
    await join(hp, B);
    order.length = 0;
    await sectDeposit(hp.w, B, { amount: 700 });
    expect(order).toEqual([`save:${B}`, "service:deposit"]);
    expect(coinOf(hp, B)).toBe(4300);
    expect(lastSnap(lh, A)).toMatchObject({
      coin: 700,
      log: [{ name: B, kind: "deposit", amount: 700 }],
    });
    expect(lastSnap(hp, B)?.coin).toBe(700);
  });

  it("góp: không đủ tiền / số sai / không ở tông môn: không trừ, không lưu; kho từ chối (đầy) thì HOÀN ví", async () => {
    await makeSect();
    const c0 = coinOf(lh, A);
    order.length = 0;
    await sectDeposit(lh.w, A, { amount: 999_999 });
    expect(lastToast(lh, A)).toMatch(/Không đủ Linh thạch/);
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: "7" }, null, {}])
      await sectDeposit(lh.w, A, bad);
    await sectDeposit(lh.w, C, { amount: 10 });
    expect(lastToast(lh, C)).toMatch(/chưa thuộc tông môn/);
    expect(coinOf(lh, A)).toBe(c0);
    expect(coinOf(lh, C)).toBe(5000);
    expect(order).toEqual([]);
    // kho đầy: dịch vụ từ chối sau khi đã trừ ví -> hoàn
    const real = svc.deposit.bind(svc);
    svc.deposit = async () => ({ ok: false, reason: "treasury_full" });
    await sectDeposit(lh.w, A, { amount: 100 });
    expect(coinOf(lh, A)).toBe(c0); // hoàn đủ
    expect(lastToast(lh, A)).toMatch(/Kho tông môn đã đầy/);
    svc.deposit = real;
  });

  it("rút: chỉ Tông chủ; trừ kho -> cộng ví -> lưu hồ sơ; ví không chứa nổi thì từ chối từ đầu (kho nguyên)", async () => {
    await makeSect();
    await join(hp, B);
    await sectDeposit(hp.w, B, { amount: 1000 });
    order.length = 0;
    await sectWithdraw(hp.w, B, { amount: 10 });
    expect(lastToast(hp, B)).toMatch(/chưa đủ quyền/);
    const a0 = coinOf(lh, A);
    order.length = 0;
    await sectWithdraw(lh.w, A, { amount: 400 });
    expect(order).toEqual(["service:withdraw", `save:${A}`]);
    expect(coinOf(lh, A)).toBe(a0 + 400);
    expect(lastSnap(lh, A)?.coin).toBe(600);
    await sectWithdraw(lh.w, A, { amount: 601 });
    expect(lastToast(lh, A)).toMatch(/Kho tông môn không đủ/);
    lh.w.ctrl.get(A)!.coin = COIN_CAP - 5;
    await sectWithdraw(lh.w, A, { amount: 100 });
    expect(lastToast(lh, A)).toMatch(/không chứa thêm được/);
    expect((await svc.sectOf(key(A)))?.coin).toBe(600); // không rút dở
  });

  it("rút mà người chơi rời giữa chừng (không cộng được ví): GÓP LẠI vào kho, Linh thạch không biến mất", async () => {
    await makeSect();
    await sectDeposit(lh.w, A, { amount: 1000 });
    const real = svc.withdraw.bind(svc);
    svc.withdraw = async (...args) => {
      const r = await real(...args);
      lh.w.ctrl.delete(A); // rớt mạng ngay sau khi kho đã trừ
      return r;
    };
    await sectWithdraw(lh.w, A, { amount: 300 });
    expect((await svc.sectOf(key(A)))?.coin).toBe(1000); // nguyên vẹn (đã góp lại)
  });

  it("bảo toàn tiền: 30 lần góp + 10 lần rút đồng thời (nhiều người, nhiều phòng): ví + kho không đổi tổng", async () => {
    await makeSect();
    await join(hp, B);
    await join(lh, C);
    const total = async () =>
      coinOf(lh, A) + coinOf(hp, B) + coinOf(lh, C) + ((await svc.sectOf(key(A)))?.coin ?? 0);
    const before = await total();
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < 30; i++) {
      const [r, who] = [
        [lh, A],
        [hp, B],
        [lh, C],
      ][i % 3] as [typeof lh, string];
      jobs.push(sectDeposit(r.w, who, { amount: 7 + (i % 5) }));
    }
    for (let i = 0; i < 10; i++) jobs.push(sectWithdraw(lh.w, A, { amount: 20 }));
    await Promise.all(jobs);
    expect(await total()).toBe(before - 0); // phí lập đã trừ trước `before`; mọi chuyển khoản đều bảo toàn
    expect((await svc.sectOf(key(A)))!.coin).toBeGreaterThanOrEqual(0);
  });

  it("góp ĐUA với giải tán: Linh thạch không biến mất (kho còn và không giải tán, hoặc giải tán rồi hoàn ví)", async () => {
    for (let i = 0; i < 6; i++) {
      await sectDisband(lh.w, A).catch(() => {});
      tick(SECT_CREATE_COOLDOWN_MS);
      lh.w.ctrl.get(A)!.coin = 5000;
      hp.w.ctrl.get(B)!.coin = 5000;
      await sectCreate(lh.w, A, { name: `Dua Xoa ${i}`, tag: `X${i}X` });
      await join(hp, B);
      const before = coinOf(lh, A) + coinOf(hp, B);
      if (i % 2 === 0)
        await Promise.all([sectDisband(lh.w, A), sectDeposit(hp.w, B, { amount: 50 })]);
      else await Promise.all([sectDeposit(hp.w, B, { amount: 50 }), sectDisband(lh.w, A)]);
      const sect = await svc.sectOf(key(A));
      const after = coinOf(lh, A) + coinOf(hp, B) + (sect?.coin ?? 0);
      expect(after).toBe(before);
      if (sect) await sectWithdraw(lh.w, A, { amount: sect.coin || 1 }).catch(() => {});
    }
  });
});

describe("danh tính theo linh hồn", () => {
  it("người trùng đạo hiệu nhưng KHÁC linh hồn không nhận ảnh chụp / chat / presence của tông môn (kiểm `soulKey`, không chỉ tên)", async () => {
    await makeSect();
    await join(hp, B);
    const impostor = hp.w.ctrl.get(B)!;
    impostor.identity = { name: B, soulKey: "linh-hon-khac" };
    const before = hp.sects.length;
    const beforePres = hp.sectPresences.length;
    await sectMotd(lh.w, A, { motd: "Bi mat" });
    chat(lh.w, A, "/s bi mat");
    expect(hp.sects).toHaveLength(before);
    expect(hp.chatsTo.filter((c) => c.msg.channel === "sect")).toHaveLength(0);
    expect(hp.sectPresences).toHaveLength(beforePres);
  });

  it("người đầu thai (hồ sơ đặt lại, cùng linh hồn) vào phòng vẫn ở tông môn với đúng chức vụ", async () => {
    await makeSect();
    await join(hp, B);
    // B chết thật và đầu thai: ctrl mới, cùng identity.soulKey
    sectDrop(hp.w, B);
    hp.w.state.players.delete(B);
    hp.w.ctrl.delete(B);
    addPlayer(hp.w, B, 0, 0); // Phàm Nhân
    await sectOnJoin(hp.w, B);
    expect(tagOf(hp, B)).toBe("TV");
    expect(lastSnap(hp, B)?.myRank).toBe("de_tu");
  });
});
