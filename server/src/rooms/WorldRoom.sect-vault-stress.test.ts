// Test ngâm / thử tải đồng thời kho đồ tông môn (K6 issue #790, mục 27 QUYET_DINH_M3, docs/THIET_KE_TONG_MON.md mục 11):
// Nhiều bot cùng tông môn (Tông chủ, Trưởng lão, Đệ tử) đua nhau góp / rút đồng thời trên máy chủ Colyseus thật cổng riêng (freePort),
// kiểm tra bảo toàn đồ tuyệt đối (tổng đồ trong túi mọi bot + kho + đất không bao giờ vượt ban đầu).
// Thử nghiệm qua cổng và rớt mạng giữa chừng lúc thao tác kho đồ.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  ITEMS,
  SECT_CREATE_COST,
  SECT_MSG,
  addToInventory,
  roomNameOf,
  type ChatOut,
  type SectInvitedMsg,
  type SectMsg,
  type SectPresenceMsg,
  type SectVaultMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import { listenWithRetry } from "../test-port";
import { restoreSaves, slowSave } from "./test-save-hooks";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-vault-stress-"));

let PORT = 0;
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  restoreSaves(); // trả việc lưu về bình thường trước khi đóng phòng (đóng phòng cũng lưu hồ sơ)
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  await sleep(200);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined | false,
  ms = 6000,
  what = "điều kiện",
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

interface Hero {
  name: string;
  room: Room;
  snaps: SectMsg[];
  presences: SectPresenceMsg[];
  invited: SectInvitedMsg[];
  vaults: SectVaultMsg[];
  chats: ChatOut[];
  toasts: string[];
}

function listen(room: Room, h: Hero) {
  room.onMessage(SECT_MSG.snapshot, (m: SectMsg) => h.snaps.push(m));
  room.onMessage(SECT_MSG.presence, (m: SectPresenceMsg) => h.presences.push(m));
  room.onMessage(SECT_MSG.invited, (m: SectInvitedMsg) => h.invited.push(m));
  room.onMessage(SECT_MSG.vault, (m: SectVaultMsg) => h.vaults.push(m));
  room.onMessage("chat", (m: ChatOut) => h.chats.push(m));
  room.onMessage("toast", (m: ToastMsg) => h.toasts.push(m.text));
  for (const t of ["inv", "wallet", "quests", "dialog", "fx", "dmg", "soul", "party", "skills"]) {
    room.onMessage(t, () => {});
  }
}

async function join(name: string, roomName: string): Promise<Hero> {
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomName, {
    name,
    secret: secretOf(name),
  });
  rooms.push(room);
  const h: Hero = {
    name,
    room,
    snaps: [],
    presences: [],
    invited: [],
    vaults: [],
    chats: [],
    toasts: [],
  };
  listen(room, h);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId), 4000, "vào phòng");
  const w = worldOf(room);
  w.state.monsters.clear(); // dọn quái hoang
  w.mctrl.clear();
  return h;
}

const ctrlOf = (h: Hero) => worldOf(h.room).ctrl.get(h.room.sessionId);
const lastSnap = (h: Hero) => h.snaps.at(-1)?.sect;
const lastVault = (h: Hero) => h.vaults.at(-1)?.vault;

/** Hồ sơ nhân vật trong thư mục data */
const saveOf = (name: string) => {
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name);
  return f ? JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) : undefined;
};

const sectFiles = () =>
  existsSync(path.join(dataDir, "sects"))
    ? readdirSync(path.join(dataDir, "sects")).filter((f) => f.endsWith(".json"))
    : [];

const countInSlots = (slots: ({ itemId: string; qty: number } | null)[] | undefined, id: string) =>
  (slots ?? []).reduce((t, x) => t + (x?.itemId === id ? x.qty : 0), 0);

describe("WorldRoom sect-vault soak & stress (Issue #790 K6)", () => {
  const MAT = ITEMS.filter((i) => i.stack >= 99)[0]; // Món xếp chồng lớn để stress test

  it("nhiều bot cùng tông môn góp / rút đua nhau đồng thời: tổng đồ bảo toàn, không bao giờ nhân đôi", async () => {
    // 1. Tạo 4 hero: 1 Tông chủ, 1 Trưởng lão, 2 Đệ tử
    const Chu = await join(`Stress Chu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const Lao = await join(`Stress Lao ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De1 = await join(`Stress De1 ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De2 = await join(`Stress De2 ${++seq}`, roomNameOf(DEFAULT_MAP_ID));

    ctrlOf(Chu).coin = SECT_CREATE_COST + 1000;
    const sectName = `Stress Sect ${seq}`;
    Chu.room.send(SECT_MSG.create, { name: sectName, tag: `SS${seq % 1000}` });
    await waitFor(() => lastSnap(Chu), 4000, "Chu lập tông môn");

    // Mời Lao, De1, De2
    for (const member of [Lao, De1, De2]) {
      Chu.room.send(SECT_MSG.invite, { name: member.name });
      await waitFor(() => member.invited[0], 4000, `lời mời cho ${member.name}`);
      member.room.send(SECT_MSG.accept, { from: Chu.name });
      await waitFor(() => lastSnap(member)?.myRank === "de_tu", 4000, `${member.name} nhận lời`);
    }

    // Phong Lao làm Trưởng lão
    Chu.room.send(SECT_MSG.rank, { name: Lao.name, rank: "truong_lao" });
    await waitFor(() => lastSnap(Lao)?.myRank === "truong_lao", 4000, "Lao lên Trưởng lão");

    // Tông chủ tăng hạn mức Đệ tử lên 10 lượt / ngày
    Chu.room.send(SECT_MSG.vaultPolicy, { drawPerDay: 10 });
    await waitFor(() => lastVault(Chu)?.drawPerDay === 10, 4000, "hạn mức 10 lượt");

    // 2. Cấp vật phẩm ban đầu:
    // Chu: 40 MAT, Lao: 40 MAT, De1: 35 MAT, De2: 35 MAT. Tổng = 150 MAT
    addToInventory(ctrlOf(Chu).inv, MAT.id, 40);
    addToInventory(ctrlOf(Lao).inv, MAT.id, 40);
    addToInventory(ctrlOf(De1).inv, MAT.id, 35);
    addToInventory(ctrlOf(De2).inv, MAT.id, 35);

    // Lưu ngay hồ sơ nhân vật của 4 người để khớp đĩa
    await worldOf(Chu.room).onSaveNow(Chu.room.sessionId);
    await worldOf(Lao.room).onSaveNow(Lao.room.sessionId);
    await worldOf(De1.room).onSaveNow(De1.room.sessionId);
    await worldOf(De2.room).onSaveNow(De2.room.sessionId);

    const INITIAL_TOTAL = 150;
    const countTotal = () => {
      const invChu = countInSlots(ctrlOf(Chu)?.inv ?? saveOf(Chu.name)?.inventory, MAT.id);
      const invLao = countInSlots(ctrlOf(Lao)?.inv ?? saveOf(Lao.name)?.inventory, MAT.id);
      const invDe1 = countInSlots(ctrlOf(De1)?.inv ?? saveOf(De1.name)?.inventory, MAT.id);
      const invDe2 = countInSlots(ctrlOf(De2)?.inv ?? saveOf(De2.name)?.inventory, MAT.id);

      // Đọc kho đồ từ bản snapshot mới nhất hoặc tệp
      const vaultSlots =
        lastVault(Chu)?.slots ??
        sectFiles()
          .map((f) => JSON.parse(readFileSync(path.join(dataDir, "sects", f), "utf8")))
          .find((s) => s.name === sectName)?.vault?.slots;
      const vaultQty = countInSlots(vaultSlots, MAT.id);

      // Đồ rơi trên đất nếu có
      let lootQty = 0;
      for (const r of [Chu.room, Lao.room, De1.room, De2.room]) {
        const sr = serverRoom(r);
        if (sr?.state?.loot) {
          sr.state.loot.forEach((l: any) => {
            if (l.itemId === MAT.id) lootQty += l.qty ?? 1;
          });
        }
      }

      return invChu + invLao + invDe1 + invDe2 + vaultQty + lootQty;
    };

    expect(countTotal()).toBe(INITIAL_TOTAL);

    // 3. ĐỢT 1: 4 bot cùng lúc gửi góp đồ vào kho
    const slotChu = ctrlOf(Chu).inv.findIndex((s: any) => s?.itemId === MAT.id);
    const slotLao = ctrlOf(Lao).inv.findIndex((s: any) => s?.itemId === MAT.id);
    const slotDe1 = ctrlOf(De1).inv.findIndex((s: any) => s?.itemId === MAT.id);
    const slotDe2 = ctrlOf(De2).inv.findIndex((s: any) => s?.itemId === MAT.id);

    Chu.room.send(SECT_MSG.vaultDeposit, { slot: slotChu, qty: 20 });
    Lao.room.send(SECT_MSG.vaultDeposit, { slot: slotLao, qty: 20 });
    De1.room.send(SECT_MSG.vaultDeposit, { slot: slotDe1, qty: 15 });
    De2.room.send(SECT_MSG.vaultDeposit, { slot: slotDe2, qty: 15 });

    // Đợi kho nhận ít nhất 70 món
    await waitFor(() => countInSlots(lastVault(Chu)?.slots, MAT.id) >= 70, 5000, "kho nhận đủ 70");
    expect(countTotal()).toBe(INITIAL_TOTAL);

    // 4. ĐỢT 2: Nhiều bot đua nhau rút cùng một ô kho và các ô khác nhau
    // Tìm các ô trong kho có MAT
    const vSlots = (lastVault(Chu)?.slots ?? [])
      .map((s, idx) => (s?.itemId === MAT.id ? idx : -1))
      .filter((idx) => idx !== -1);

    expect(vSlots.length).toBeGreaterThan(0);
    const targetSlot = vSlots[0];

    // Cả 4 bot cùng lao vào rút ở targetSlot và các slot khác
    Chu.room.send(SECT_MSG.vaultWithdraw, { slot: targetSlot, itemId: MAT.id, qty: 5 });
    Lao.room.send(SECT_MSG.vaultWithdraw, { slot: targetSlot, itemId: MAT.id, qty: 5 });
    De1.room.send(SECT_MSG.vaultWithdraw, { slot: targetSlot, itemId: MAT.id, qty: 5 });
    De2.room.send(SECT_MSG.vaultWithdraw, { slot: targetSlot, itemId: MAT.id, qty: 5 });

    await sleep(400);

    // Tổng số lượng tuyệt đối không vượt quá INITIAL_TOTAL
    expect(countTotal()).toBe(INITIAL_TOTAL);

    // 5. Thử nghiệm khi đang qua cổng (travelling): thao tác kho bị từ chối
    ctrlOf(De1).travelling = true;
    De1.room.send(SECT_MSG.vaultDeposit, { slot: 0, qty: 1 });
    De1.room.send(SECT_MSG.vaultWithdraw, { slot: 0, itemId: MAT.id, qty: 1 });
    await sleep(150);
    ctrlOf(De1).travelling = false;

    expect(countTotal()).toBe(INITIAL_TOTAL);

    // 6. Thử nghiệm rớt mạng đột ngột của một bot khi đang giao dịch kho
    const preDisconnectTotal = countTotal();
    // De2 gửi góp 5 món rồi đóng kết nối ngay
    const de2Slot = ctrlOf(De2).inv.findIndex((s: any) => s?.itemId === MAT.id);
    if (de2Slot !== -1) {
      De2.room.send(SECT_MSG.vaultDeposit, { slot: de2Slot, qty: 5 });
      De2.room.connection.close();
      await sleep(300);

      // Kiểm tra bảo toàn đồ sau khi ngắt kết nối
      const totalAfterDisconnect = countTotal();
      expect(totalAfterDisconnect).toBe(preDisconnectTotal);
      expect(totalAfterDisconnect).toBe(INITIAL_TOTAL);
    }
  }, 25_000);

  it("đua rút cùng 1 ô kho: tổng rút không vượt quá số lượng trong ô, không nhân đôi đồ", async () => {
    const Chu = await join(`SlotChu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const Lao = await join(`SlotLao ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De = await join(`SlotDe ${++seq}`, roomNameOf(DEFAULT_MAP_ID));

    ctrlOf(Chu).coin = SECT_CREATE_COST + 1000;
    const sectName = `Slot Sect ${seq}`;
    Chu.room.send(SECT_MSG.create, { name: sectName, tag: `SL${seq % 1000}` });
    await waitFor(() => lastSnap(Chu), 4000, "Chu lập tông môn");

    for (const member of [Lao, De]) {
      Chu.room.send(SECT_MSG.invite, { name: member.name });
      await waitFor(() => member.invited[0], 4000, `lời mời cho ${member.name}`);
      member.room.send(SECT_MSG.accept, { from: Chu.name });
      await waitFor(() => lastSnap(member)?.myRank === "de_tu", 4000, `${member.name} nhận lời`);
    }

    Chu.room.send(SECT_MSG.rank, { name: Lao.name, rank: "truong_lao" });
    await waitFor(() => lastSnap(Lao)?.myRank === "truong_lao", 4000, "Lao lên Trưởng lão");

    Chu.room.send(SECT_MSG.vaultPolicy, { drawPerDay: 5 });
    await waitFor(() => lastVault(Chu)?.drawPerDay === 5, 4000, "hạn mức 5 lượt");

    // Chỉ cấp 25 MAT cho Chu
    addToInventory(ctrlOf(Chu).inv, MAT.id, 25);
    await worldOf(Chu.room).onSaveNow(Chu.room.sessionId);

    // Chu góp toàn bộ 25 MAT vào kho
    const slotChu = ctrlOf(Chu).inv.findIndex((s: any) => s?.itemId === MAT.id);
    Chu.room.send(SECT_MSG.vaultDeposit, { slot: slotChu, qty: 25 });
    await waitFor(() => countInSlots(lastVault(Chu)?.slots, MAT.id) === 25, 4000, "kho có 25");

    const vSlot = (lastVault(Chu)?.slots ?? []).findIndex((s) => s?.itemId === MAT.id);
    expect(vSlot).toBeGreaterThanOrEqual(0);

    // Chu, Lao, De đồng thời gửi rút 10 MAT từ đúng ô vSlot (tổng yêu cầu = 30 > 25 trong kho)
    // Lưu hồ sơ chậm 600 ms (cố ý): ảnh chụp kho chỉ gửi SAU lúc lưu, nên bản cũ (ngủ cố định 400 ms rồi đọc ảnh chụp cuối) đọc phải ảnh CŨ và đỏ "45 / 35 thay vì 25"
    // ngay khi đĩa / CI chậm; B tái hiện tất định bằng cách này. Nay chờ ĐÚNG tín hiệu (#752).
    slowSave(Chu.room, 600);
    const heroes = [Chu, Lao, De];
    const before = heroes.map((h) => h.toasts.length);
    for (const h of heroes)
      h.room.send(SECT_MSG.vaultWithdraw, { slot: vSlot, itemId: MAT.id, qty: 10 });

    // Mỗi người nhận một toast KẾT QUẢ của lượt rút (thành công hay bị từ chối), máy chủ gửi sau khi đã nhả khoá thao tác kho
    await waitFor(
      () => heroes.every((h, i) => h.toasts.length > before[i]!),
      8000,
      "cả ba lượt rút có kết quả",
    );
    const total = () =>
      heroes.reduce((n, h) => n + countInSlots(ctrlOf(h).inv, MAT.id), 0) +
      countInSlots(lastVault(Chu)?.slots, MAT.id);
    // Ảnh chụp kho tới sau toast của người khác (mỗi lượt rút phát lại ảnh chụp cho cả tông môn): chờ tới khi khớp túi. Nếu đồ bị nhân đôi hoặc biến mất thì
    // tổng KHÔNG BAO GIỜ về 25 và test hết giờ ĐỎ đúng chỗ (đã đột biến).
    await waitFor(() => total() === 25, 8000, "ảnh chụp kho khớp túi: tổng đồ = 25");
    const withdrawn = heroes.reduce((n, h) => n + countInSlots(ctrlOf(h).inv, MAT.id), 0);

    // Tổng số lượng tuyệt đối bằng 25
    expect(total()).toBe(25);
    // Số lượng rút ra không bao giờ vượt 25
    expect(withdrawn).toBeLessThanOrEqual(25);
  }, 25_000);
});
