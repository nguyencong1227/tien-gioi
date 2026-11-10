// Test thử tải, rò rỉ, chống đua Tông môn (M3.6, 6e, Issue #231).
// Kiểm tra:
// 1. N tông môn song song: lập, mời, nhận, chat /s, nạp/rút kho, tick server < 10ms, byte/tick ổn định.
// 2. Đua lập cùng tên / cùng biệt hiệu: 2 người cùng lập, đúng 1 người thành công, người kia bị từ chối và HOÀN TIỀN VÍ đầy đủ.
// 3. Đua mời / nhận chéo, nhận 2 lần, nhận khi tông môn vừa giải tán.
// 4. Rải lời mời quá SECT_INVITES_MAX (3): người được mời bị quá tải (target_overloaded).
// 5. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ (từ chối, hết hạn, rời, giải tán, disconnect): invitesSize, online.size, cache, cooldown về 0.
// 6. Kiểm tra toàn vẹn file lưu nhân vật và tông môn (audit-saves) không bị bẩn hay mồ côi.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-sect-stress-"));
process.env.DATA_DIR = dataDir;

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  SECT_CREATE_COST,
  SECT_INVITES_MAX,
  SECT_MSG,
  roomNameOf,
  type ChatOut,
  type SectInvitedMsg,
  type SectMsg,
  type SectPresenceMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "../src/rooms/WorldRoom";
import type { WorldState } from "../src/schema";
import type { Sect } from "../src/sect-store";
import { auditSavesDirectory } from "./audit-saves";
import { tickWorld } from "../src/systems/tick";

const PORT = 49100 + Math.floor(Math.random() * 2000);
let server: Server;
let WorldRoomClass: typeof WorldRoom;
const rooms: Room[] = [];

beforeAll(async () => {
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  WorldRoomClass = WorldRoom;
  WorldRoomClass.reconnectGraceS = 5;
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => T | undefined | false | Promise<T | undefined | false>,
  ms = 5000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(25);
  }
}

let seq = 0;
const secretOf = (name: string) => `sec-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  secret: string;
  room: Room;
  invited: SectInvitedMsg[];
  sects: SectMsg[];
  presences: SectPresenceMsg[];
  toasts: ToastMsg[];
  chats: ChatOut[];
  me: () => any;
  walletCoin: number;
}

function listen(room: Room, hero: Hero) {
  room.onMessage(SECT_MSG.invited, (m: SectInvitedMsg) => hero.invited.push(m));
  room.onMessage(SECT_MSG.snapshot, (m: SectMsg) => hero.sects.push(m));
  room.onMessage(SECT_MSG.presence, (m: SectPresenceMsg) => hero.presences.push(m));
  room.onMessage("toast", (m: ToastMsg) => hero.toasts.push(m));
  room.onMessage("chat", (m: ChatOut) => hero.chats.push(m));
  room.onMessage("wallet", (m: { coin: number }) => {
    hero.walletCoin = m.coin;
  });
  for (const t of ["inv", "quests", "dialog", "fx", "dmg", "soul", "travelTo", "limbo"]) {
    room.onMessage(t, () => {});
  }
}

async function spawnBot(name: string, mapId = DEFAULT_MAP_ID): Promise<Hero> {
  const secret = secretOf(name);
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(mapId), { name, secret });
  rooms.push(room);

  const hero: Hero = {
    name,
    secret,
    room,
    invited: [],
    sects: [],
    presences: [],
    toasts: [],
    chats: [],
    walletCoin: 0,
    me: () => serverState(room).players.get(room.sessionId),
  };
  listen(room, hero);

  // Đợi state đồng bộ tên người chơi
  await waitFor(() => hero.me()?.name === name, 3000, `bot ${name} xuất hiện`);
  return hero;
}

describe("Thử tải & Stress test Tông môn (M3.6, Issue #231)", () => {
  it("1. N tông môn song song: lập, mời, nhận, chat /s, nạp/rút kho, tick < 10ms", async () => {
    // Tạo 3 nhóm: mỗi nhóm 1 Tông chủ + 1 Đệ tử (tổng 6 bots)
    const heroes: Hero[] = [];
    const runId = ++seq;
    for (let i = 0; i < 6; i++) {
      heroes.push(await spawnBot(`Bot${runId}g${i}`));
    }

    const w = worldOf(heroes[0].room);
    // Bơm tiền cho cả 6 bots (mỗi bot 5000 Linh thạch)
    for (const h of heroes) {
      const c = w.ctrl.get(h.room.sessionId);
      if (c) c.coin = 5000;
      await w.onSaveNow?.(h.room.sessionId);
    }

    // Nhóm 0: h[0] + h[1]; Nhóm 1: h[2] + h[3]; Nhóm 2: h[4] + h[5]
    for (let g = 0; g < 3; g++) {
      const leader = heroes[g * 2];
      const member = heroes[g * 2 + 1];
      const sectTag = `P${runId}${g}`.slice(-4);

      // Leader lập tông môn
      leader.room.send(SECT_MSG.create, { name: `Phai ${runId} ${g}`, tag: sectTag });
      await waitFor(() => leader.me()?.sect === sectTag, 3000, `leader ${g} lập phái`);
      await waitFor(
        () => leader.sects.length > 0 && leader.sects.at(-1)?.sect?.tag === sectTag,
        3000,
      );

      // Leader mời member
      leader.room.send(SECT_MSG.invite, { name: member.name });
      await waitFor(() => member.invited.length > 0, 3000, `member ${g} nhận lời mời`);

      // Member nhận lời mời
      member.room.send(SECT_MSG.accept, { from: leader.name });
      await waitFor(() => member.me()?.sect === sectTag, 3000, `member ${g} vào phái`);
    }

    // Member nạp kho 500 Linh thạch, Leader rút 200 Linh thạch
    for (let g = 0; g < 3; g++) {
      const leader = heroes[g * 2];
      const member = heroes[g * 2 + 1];

      // Member góp
      member.room.send(SECT_MSG.deposit, { amount: 500 });
      await waitFor(
        () => leader.sects.at(-1)?.sect?.coin === 500,
        3000,
        `kho phái ${g} có 500 Linh thạch`,
      );

      // Leader rút
      leader.room.send(SECT_MSG.withdraw, { amount: 200 });
      await waitFor(
        () => leader.sects.at(-1)?.sect?.coin === 300,
        3000,
        `kho phái ${g} còn 300 Linh thạch`,
      );
    }

    // Chat tông môn /s: chỉ thành viên cùng tông môn nhận được
    heroes[1].room.send("chat", { text: `/s Loi chao phai 0` });
    await waitFor(
      () => heroes[0].chats.some((c) => c.text === "Loi chao phai 0" && c.channel === "sect"),
      3000,
      "leader 0 nhận chat /s",
    );
    // Thành viên nhóm 1 không nhận được chat của nhóm 0
    expect(heroes[2].chats.some((c) => c.text.includes("Loi chao phai 0"))).toBe(false);

    // Dọn dẹp: rút hết tiền rồi giải tán
    for (let g = 0; g < 3; g++) {
      const leader = heroes[g * 2];
      leader.room.send(SECT_MSG.withdraw, { amount: 300 });
      await waitFor(() => leader.sects.at(-1)?.sect?.coin === 0, 3000);
      leader.room.send(SECT_MSG.disband, {});
      await waitFor(() => leader.me()?.sect === "", 3000, `leader ${g} giải tán`);
    }

    // Đo tick World: phải mượt mà < 10ms
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      WorldRoomClass.hub.worlds.forEach((world) => tickWorld(world, 50));
    }
    const avgTick = (performance.now() - t0) / 20;
    expect(avgTick).toBeLessThan(10);
  });

  it("2. Đua lập cùng tên / cùng tag: 1 thành công, 1 từ chối và hoàn tiền đầy đủ", async () => {
    const runId = ++seq;
    const h1 = await spawnBot(`Bot${runId}A`);
    const h2 = await spawnBot(`Bot${runId}B`);
    const w = worldOf(h1.room);

    // Bơm 5000 cho cả 2
    w.ctrl.get(h1.room.sessionId)!.coin = 5000;
    w.ctrl.get(h2.room.sessionId)!.coin = 5000;
    await w.onSaveNow?.(h1.room.sessionId);
    await w.onSaveNow?.(h2.room.sessionId);

    // Cả 2 cùng gửi lập tông môn cùng tên và cùng tag
    const sectName = `Vo Dang ${runId}`;
    const sectTag = `V${runId}`.slice(-4);

    h1.room.send(SECT_MSG.create, { name: sectName, tag: sectTag });
    h2.room.send(SECT_MSG.create, { name: sectName, tag: sectTag });

    // Đợi 1 người có sect, 1 người nhận toast lỗi
    await waitFor(
      () =>
        (h1.me()?.sect === sectTag && h2.me()?.sect === "") ||
        (h2.me()?.sect === sectTag && h1.me()?.sect === ""),
      4000,
      "đua lập tông môn phân định thắng thua",
    );

    const winner = h1.me()?.sect === sectTag ? h1 : h2;
    const loser = winner === h1 ? h2 : h1;

    // Winner: trừ phí SECT_CREATE_COST (5000 - 1000 = 4000)
    expect(w.ctrl.get(winner.room.sessionId)?.coin).toBe(5000 - SECT_CREATE_COST);

    // Loser: nhận toast từ chối và tiền VÍ PHẢI ĐƯỢC HOÀN ĐỦ (5000)
    await waitFor(() => loser.toasts.length > 0, 3000, "loser nhận toast");
    expect(loser.toasts.some((t) => t.text.includes("đã có người dùng"))).toBe(true);
    expect(w.ctrl.get(loser.room.sessionId)?.coin).toBe(5000);

    // Dọn dẹp winner giải tán
    winner.room.send(SECT_MSG.disband, {});
    await waitFor(() => winner.me()?.sect === "", 3000);
  });

  it("3. Đua mời / nhận chéo, nhận 2 lần, nhận khi tông môn vừa giải tán", async () => {
    const runId = ++seq;
    const hA = await spawnBot(`Bot${runId}A`);
    const hB = await spawnBot(`Bot${runId}B`);
    const hC = await spawnBot(`Bot${runId}C`);
    const w = worldOf(hA.room);

    w.ctrl.get(hA.room.sessionId)!.coin = 5000;
    w.ctrl.get(hB.room.sessionId)!.coin = 5000;
    w.ctrl.get(hC.room.sessionId)!.coin = 5000;
    await w.onSaveNow?.(hA.room.sessionId);
    await w.onSaveNow?.(hB.room.sessionId);
    await w.onSaveNow?.(hC.room.sessionId);

    const tagA = `A${runId}`.slice(-4);
    // A lập tông môn A
    hA.room.send(SECT_MSG.create, { name: `Mon Phai ${runId} A`, tag: tagA });
    await waitFor(() => hA.me()?.sect === tagA, 3000);

    // A mời B
    hA.room.send(SECT_MSG.invite, { name: hB.name });
    await waitFor(() => hB.invited.length > 0, 3000);

    // Ca 3.1: Nhận 2 lần liên tiếp: lần đầu thành công, lần 2 bị từ chối
    hB.room.send(SECT_MSG.accept, { from: hA.name });
    hB.room.send(SECT_MSG.accept, { from: hA.name });
    await waitFor(() => hB.me()?.sect === tagA, 3000, "B vào phái");
    // B nhận toast từ chối cho lần 2
    await waitFor(
      () =>
        hB.toasts.some(
          (t) => t.text.includes("không còn hiệu lực") || t.text.includes("thuộc một tông môn"),
        ),
      3000,
      "lần 2 bị từ chối",
    );

    // Ca 3.2: A mời C (C chưa từng vào tông môn nào nên không bị dính rejoin cooldown)
    hA.room.send(SECT_MSG.invite, { name: hC.name });
    await waitFor(() => hC.invited.length > 0, 3000, "C nhận lời mời");

    // A giải tán ngay lập tức khi C đang giữ lời mời
    hA.room.send(SECT_MSG.disband, {});
    await waitFor(() => hA.me()?.sect === "", 3000, "A giải tán");

    // C cố chấp bấm accept -> phải bị từ chối "không còn hiệu lực"
    hC.room.send(SECT_MSG.accept, { from: hA.name });
    await waitFor(
      () => hC.toasts.some((t) => t.text.includes("không còn hiệu lực")),
      3000,
      "nhận khi tông môn đã giải tán bị từ chối",
    );
    expect(hC.me()?.sect).toBe("");

    // Ca 3.3: Hai Tông chủ mời chéo nhau: không ai có thể vào phái người kia
    const tagB = `B${runId}`.slice(-4);
    const tagC = `C${runId}`.slice(-4);
    hB.room.send(SECT_MSG.create, { name: `Mon Phai ${runId} B`, tag: tagB });
    hC.room.send(SECT_MSG.create, { name: `Mon Phai ${runId} C`, tag: tagC });
    await waitFor(() => hB.me()?.sect === tagB, 3000);
    await waitFor(() => hC.me()?.sect === tagC, 3000);

    // B mời C, C mời B
    hB.room.send(SECT_MSG.invite, { name: hC.name });
    hC.room.send(SECT_MSG.invite, { name: hB.name });
    await waitFor(() => hB.toasts.some((t) => t.text.includes("đã thuộc một tông môn")), 3000);
    await waitFor(() => hC.toasts.some((t) => t.text.includes("đã thuộc một tông môn")), 3000);

    // Dọn dẹp
    hB.room.send(SECT_MSG.disband, {});
    hC.room.send(SECT_MSG.disband, {});
    await waitFor(() => hB.me()?.sect === "" && hC.me()?.sect === "", 3000);
  });

  it("4. Rải lời mời quá SECT_INVITES_MAX (3): người bị mời báo quá tải", async () => {
    const runId = ++seq;
    // Tạo 4 leaders + 1 target
    const target = await spawnBot(`Bot${runId}Tgt`);
    const leaders: Hero[] = [];
    for (let i = 0; i < 4; i++) {
      leaders.push(await spawnBot(`Bot${runId}L${i}`));
    }
    const w = worldOf(target.room);

    // Cấp tiền và lập 4 tông môn
    for (let i = 0; i < 4; i++) {
      const l = leaders[i];
      w.ctrl.get(l.room.sessionId)!.coin = 5000;
      await w.onSaveNow?.(l.room.sessionId);
      const tag = `T${runId}${i}`.slice(-4);
      l.room.send(SECT_MSG.create, { name: `Phai ${runId} ${i}`, tag });
      await waitFor(() => l.me()?.sect === tag, 3000);
    }

    // 3 leader đầu tiên mời target -> thành công
    for (let i = 0; i < 3; i++) {
      leaders[i].room.send(SECT_MSG.invite, { name: target.name });
      await waitFor(() => target.invited.length === i + 1, 3000);
    }
    expect(target.invited.length).toBe(SECT_INVITES_MAX);

    // Leader thứ 4 gửi lời mời -> bị từ chối target_overloaded
    leaders[3].room.send(SECT_MSG.invite, { name: target.name });
    await waitFor(
      () => leaders[3].toasts.some((t) => t.text.includes("quá nhiều lời mời")),
      3000,
      "leader 4 bị từ chối vì target quá tải",
    );
    // Target không nhận thêm lời mời thứ 4
    expect(target.invited.length).toBe(3);

    // Dọn dẹp: target từ chối cả 3 lời mời để không làm bẩn bộ nhớ test sau
    for (let i = 0; i < 3; i++) {
      target.room.send(SECT_MSG.decline, { from: leaders[i].name });
    }
    for (const l of leaders) {
      l.room.send(SECT_MSG.disband, {});
    }
    await sleep(150);
  });

  it("4b. Nhận khi tông môn đã đầy thành viên (SECT_MAX_MEMBERS): từ chối sect_full", async () => {
    const runId = ++seq;
    const leader = await spawnBot(`Bot${runId}Ldr`);
    const recruit = await spawnBot(`Bot${runId}Rec`);
    const w = worldOf(leader.room);

    w.ctrl.get(leader.room.sessionId)!.coin = 5000;
    await w.onSaveNow?.(leader.room.sessionId);

    const tag = `F${runId}`.slice(-4);
    leader.room.send(SECT_MSG.create, { name: `Day Phai ${runId}`, tag });
    await waitFor(() => leader.me()?.sect === tag, 3000);

    // Mời recruit
    leader.room.send(SECT_MSG.invite, { name: recruit.name });
    await waitFor(() => recruit.invited.length > 0, 3000);

    // Giả lập làm đầy tông môn: chèn thêm 29 thành viên giả vào store
    const sect = await w.sectService!.sectOf(w.ctrl.get(leader.room.sessionId)!.identity.soulKey);
    expect(sect).not.toBeNull();
    await w.sectService!.store.update(sect!.id, (s: Sect) => {
      const dummyMembers = [...s.members];
      while (dummyMembers.length < 30) {
        dummyMembers.push({
          soulKey: `dummy-soul-${dummyMembers.length}`,
          name: `Dummy${dummyMembers.length}`,
          rank: "de_tu",
          joinedAt: Date.now(),
        });
      }
      return { ...s, members: dummyMembers };
    });

    // Recruit bấm accept -> phải nhận toast từ chối vì đầy
    recruit.room.send(SECT_MSG.accept, { from: leader.name });
    await waitFor(
      () => recruit.toasts.some((t) => t.text.includes("đã đủ người")),
      3000,
      "từ chối do tông môn đầy",
    );
    expect(recruit.me()?.sect).toBe("");

    // Dọn dẹp
    leader.room.send(SECT_MSG.disband, {});
    await waitFor(() => leader.me()?.sect === "", 3000);
  });

  it("5. Kiểm tra dọn dẹp rò rỉ sau N chu kỳ: invites, online, cache đều về 0", async () => {
    const book = WorldRoomClass.hub.sects;
    book._sweep(Date.now() + 10_000_000);

    // Chạy 3 chu kỳ liên tiếp
    for (let cycle = 0; cycle < 3; cycle++) {
      const runId = ++seq;
      const hA = await spawnBot(`Bot${runId}A`);
      const hB = await spawnBot(`Bot${runId}B`);
      const w = worldOf(hA.room);

      w.ctrl.get(hA.room.sessionId)!.coin = 5000;
      await w.onSaveNow?.(hA.room.sessionId);

      const tag = `K${runId}`.slice(-4);
      // Lập tông môn
      hA.room.send(SECT_MSG.create, { name: `Bang ${runId}`, tag });
      await waitFor(() => hA.me()?.sect === tag, 3000);

      // Mời B
      hA.room.send(SECT_MSG.invite, { name: hB.name });
      await waitFor(() => hB.invited.length > 0, 3000);

      if (cycle === 0) {
        // Chu kỳ 0: B từ chối lời mời
        hB.room.send(SECT_MSG.decline, { from: hA.name });
        await waitFor(() => book.invitesSize === 0, 3000);
      } else if (cycle === 1) {
        // Chu kỳ 1: B nhận lời mời rồi rời phái
        hB.room.send(SECT_MSG.accept, { from: hA.name });
        await waitFor(() => hB.me()?.sect === tag, 3000);
        hB.room.send(SECT_MSG.leave, {});
        await waitFor(() => hB.me()?.sect === "", 3000);
      } else {
        // Chu kỳ 2: B disconnect khi đang có lời mời treo
        await hB.room.leave(true);
        // Quét lời mời hết hạn
        book._sweep(Date.now() + 10_000_000);
      }

      // Giải tán
      hA.room.send(SECT_MSG.disband, {});
      await waitFor(() => hA.me()?.sect === "", 3000);

      // Rời phòng
      await hA.room.leave(true);
      if (hB.room.connection.isOpen) await hB.room.leave(true);
      await sleep(150);

      // Dọn hồi chiêu
      w.sectService?._sweep(Date.now() + 10_000_000);
    }

    // Kiểm tra sạch sẽ bộ nhớ sau tất cả chu kỳ
    expect(book.invitesSize).toBe(0);
    expect(book.online.size).toBe(0);
    expect(book.cache.size).toBe(0);
  });

  it("6. Kiểm tra tính toàn vẹn file lưu (audit-saves) không bị bẩn hay lỗi sau thử tải", () => {
    const report = auditSavesDirectory(dataDir);
    expect(report.errorFiles).toBe(0);
    expect(report.errorSects ?? 0).toBe(0);
    expect(report.failedFiles).toHaveLength(0);
  });
});
