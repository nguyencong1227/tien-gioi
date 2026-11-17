// Test ngâm / thử tải đồng thời kho đồ tông môn (K6 issue #790, mục 27 QUYET_DINH_M3, docs/THIET_KE_TONG_MON.md mục 11):
// Nhiều bot cùng tông môn (Tông chủ, Trưởng lão, Đệ tử) đua nhau góp / rút đồng thời trên máy chủ Colyseus thật cổng riêng (freePort),
// kiểm tra bảo toàn đồ tuyệt đối (tổng đồ trong túi mọi bot + kho + đất không bao giờ vượt ban đầu).
// Thử nghiệm qua cổng và rớt mạng giữa chừng lúc thao tác kho đồ.
//
// Mở rộng mục 38 (QUYET_DINH_M3, PR #834): đã chết (khí huyết 0 / Hoàng Tuyền) thì KHÔNG góp được kho (đồ lẫn LS);
// đồ kiếp cũ mất theo luật luân hồi (beginLimbo xoá túi + ví); sau đầu thai vẫn rút theo chức vụ (theo chân linh).
// Hai ca này chạy trên máy chủ Colyseus thật, nhiều bot, chết do quái thật (hurtPlayer) — bổ sung cho 8 ca đơn vị ở sect-vault.test.ts.
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
  type LimboMsg,
  type RebornMsg,
  type RebirthMsg,
  type SectInvitedMsg,
  type SectMsg,
  type SectPresenceMsg,
  type SectVaultMsg,
  type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import { listenWithRetry } from "../test-port";
import { hurtPlayer } from "../systems/combat";
import { restoreSaves, slowSave, slowSaveFor } from "./test-save-hooks";

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
  limbs: LimboMsg[]; // tin Hoàng Tuyền (chết do quái)
  reborns: RebornMsg[]; // tin đầu thai xong
}

function listen(room: Room, h: Hero) {
  room.onMessage(SECT_MSG.snapshot, (m: SectMsg) => h.snaps.push(m));
  room.onMessage(SECT_MSG.presence, (m: SectPresenceMsg) => h.presences.push(m));
  room.onMessage(SECT_MSG.invited, (m: SectInvitedMsg) => h.invited.push(m));
  room.onMessage(SECT_MSG.vault, (m: SectVaultMsg) => h.vaults.push(m));
  room.onMessage("chat", (m: ChatOut) => h.chats.push(m));
  room.onMessage("toast", (m: ToastMsg) => h.toasts.push(m.text));
  room.onMessage("limbo", (m: LimboMsg) => h.limbs.push(m));
  room.onMessage("reborn", (m: RebornMsg) => h.reborns.push(m));
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
    limbs: [],
    reborns: [],
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
/** Trạng thái nhân vật trên máy chủ (có `dead`). */
const me = (h: Hero) => serverRoom(h.room).state.players.get(h.room.sessionId) as any;
/** Giết nhân vật do quái (sát thương lớn): `hurtPlayer` chạy `beginLimbo` ĐỒNG BỘ — xoá túi + ví, đặt `dead`/`limbo`. */
const kill = (h: Hero) => {
  const sr = serverRoom(h.room);
  const p = sr.state.players.get(h.room.sessionId)!;
  hurtPlayer(worldOf(h.room), h.room.sessionId, p, 1e9, { kind: "lang" });
};

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

/** Ô kho đồ: ưu tiên snapshot mới nhất của `h`, fallback tệp sect trên đĩa theo tên (vẫn đúng khi `h` vừa đầu thai). */
const vaultSlotsOf = (h: Hero, sectName: string) =>
  lastVault(h)?.slots ??
  sectFiles()
    .map((f) => JSON.parse(readFileSync(path.join(dataDir, "sects", f), "utf8")))
    .find((s: any) => s.name === sectName)?.vault?.slots;

/** Chức vụ thành viên `memberName` trong tông môn `sectName` (đọc từ tệp sect trên đĩa — tên không đổi khi đầu thai). */
const rankOfMember = (sectName: string, memberName: string) =>
  sectFiles()
    .map((f) => JSON.parse(readFileSync(path.join(dataDir, "sects", f), "utf8")))
    .find((s: any) => s.name === sectName)
    ?.members.find((m: any) => m.name === memberName)?.rank;

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

  // --- Mở rộng mục 38 (QUYET_DINH_M3): đã chết (Hoàng Tuyền) thì KHÔNG góp được kho (đồ lẫn LS); đồ kiếp cũ mất theo luật luân hồi;
  // sau đầu thai vẫn rút theo chức vụ. Kiểm trên máy chủ Colyseus thật với nhiều bot + chết do quái thật (hurtPlayer). ---

  it("chết do quái giữa lúc đua góp: đồ đã góp vào kho an toàn, Hoàng Tuyền từ chối góp đồ lẫn LS, tổng KHÔNG nhân đôi (mục 38)", async () => {
    // 1 Tông chủ (Chu) + 2 Đệ tử (De1 sống, De2 chết). Chỉ đếm MAT để bảo toàn rõ ràng.
    const Chu = await join(`VtChu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De1 = await join(`VtDe1 ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De2 = await join(`VtDe2 ${++seq}`, roomNameOf(DEFAULT_MAP_ID));

    ctrlOf(Chu).coin = SECT_CREATE_COST + 1000;
    const sectName = `Vt Sect ${seq}`;
    Chu.room.send(SECT_MSG.create, { name: sectName, tag: `VT${seq % 1000}` });
    await waitFor(() => lastSnap(Chu), 4000, "Chu lập tông môn");

    for (const member of [De1, De2]) {
      Chu.room.send(SECT_MSG.invite, { name: member.name });
      await waitFor(() => member.invited[0], 4000, `lời mời cho ${member.name}`);
      member.room.send(SECT_MSG.accept, { from: Chu.name });
      await waitFor(() => lastSnap(member)?.myRank === "de_tu", 4000, `${member.name} nhận lời`);
    }

    // Cấp đồ + LS: Chu 30 MAT + 500 LS, De1 20 MAT, De2 30 MAT + 800 LS. Tổng MAT = 80
    addToInventory(ctrlOf(Chu).inv, MAT.id, 30);
    addToInventory(ctrlOf(De1).inv, MAT.id, 20);
    addToInventory(ctrlOf(De2).inv, MAT.id, 30);
    ctrlOf(Chu).coin += 500;
    ctrlOf(De2).coin += 800;
    await worldOf(Chu.room).onSaveNow(Chu.room.sessionId);
    await worldOf(De1.room).onSaveNow(De1.room.sessionId);
    await worldOf(De2.room).onSaveNow(De2.room.sessionId);

    const INITIAL_MAT = 80;
    const countTotalMat = () => {
      const inv = (h: Hero) => countInSlots(ctrlOf(h)?.inv ?? saveOf(h.name)?.inventory, MAT.id);
      const vaultQty = countInSlots(vaultSlotsOf(Chu, sectName), MAT.id);
      let loot = 0;
      for (const r of [Chu.room, De1.room, De2.room]) {
        const sr = serverRoom(r);
        sr?.state?.loot?.forEach((l: any) => {
          if (l.itemId === MAT.id) loot += l.qty ?? 1;
        });
      }
      return inv(Chu) + inv(De1) + inv(De2) + vaultQty + loot;
    };

    // ĐỢT 1: góp TRƯỚC khi chết (còn sống) — thành công. Chu +20, De2 +10 -> kho 30
    const slotChu = ctrlOf(Chu).inv.findIndex((s: any) => s?.itemId === MAT.id);
    const slotDe2 = ctrlOf(De2).inv.findIndex((s: any) => s?.itemId === MAT.id);
    Chu.room.send(SECT_MSG.vaultDeposit, { slot: slotChu, qty: 20 });
    De2.room.send(SECT_MSG.vaultDeposit, { slot: slotDe2, qty: 10 });
    await waitFor(
      () => countInSlots(vaultSlotsOf(Chu, sectName), MAT.id) >= 30,
      5000,
      "kho nhận 30",
    );
    expect(countTotalMat()).toBe(INITIAL_MAT); // túi 10+20+20 + kho 30 = 80

    // Số MAT De2 đang giữ NGAY trước khi chết (đã góp 10 -> còn 20)
    const de2HeldBeforeDeath = countInSlots(ctrlOf(De2).inv, MAT.id);
    expect(de2HeldBeforeDeath).toBe(20);

    // Giết De2 do quái: beginLimbo xoá túi + ví, đặt dead/limbo (đồng bộ)
    kill(De2);
    await waitFor(() => me(De2)?.dead, 4000, "De2 chết");
    await waitFor(() => De2.limbs[0], 4000, "De2 vào Hoàng Tuyền");

    // Sau chết: De2 MẤT 20 MAT theo luật luân hồi (đồ kiếp cũ mất, KHÔNG "cứu" qua kho). Tổng = 80 - 20 = 60
    // (không nhân đôi, cũng không mất thêm gì ngoài luật luân hồi)
    expect(countTotalMat()).toBe(INITIAL_MAT - de2HeldBeforeDeath);

    // Hoàng Tuyền: De2 góp ĐỒ bị từ chối (isDown -> downFail "gục"); túi/kho KHÔNG đổi, KHÔNG nhân đôi.
    // Dùng lại chỉ số ô hợp lệ ghi từ TRƯỚC khi chết (túi đã bị beginLimbo xoá -> findIndex trả -1, sai qua bước parse).
    const beforeItemToast = De2.toasts.length;
    De2.room.send(SECT_MSG.vaultDeposit, { slot: slotDe2, qty: 5 });
    await waitFor(
      () => De2.toasts.slice(beforeItemToast).some((t) => t.includes("gục")),
      4000,
      "De2 góp đồ bị từ chối",
    );
    expect(countTotalMat()).toBe(INITIAL_MAT - de2HeldBeforeDeath); // vẫn 60

    // Hoàng Tuyền: De2 góp LS cũng bị từ chối (isDown -> "gục", KHÔNG phải no_coin vì isDown kiểm trước)
    const beforeCoinToast = De2.toasts.length;
    De2.room.send(SECT_MSG.deposit, { amount: 1000 });
    await waitFor(
      () => De2.toasts.slice(beforeCoinToast).some((t) => t.includes("gục")),
      4000,
      "De2 góp LS bị từ chối",
    );
    expect(De2.toasts.slice(beforeCoinToast).some((t) => t.includes("không đủ"))).toBe(false);

    // Đồ đã góp TRƯỚC khi chết vẫn AN TOÀN trong kho (30 MAT) — kho theo tông môn, không mất theo kiếp
    expect(countInSlots(vaultSlotsOf(Chu, sectName), MAT.id)).toBe(30);
  }, 25_000);

  it("sau đầu thai: Tông chủ vẫn rút TỰ DO từ kho (chức vụ + kho tồn tại qua kiếp, KHÔNG hạn mức Đệ tử) (mục 38)", async () => {
    const Chu = await join(`ReChu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const De1 = await join(`ReDe1 ${++seq}`, roomNameOf(DEFAULT_MAP_ID));

    ctrlOf(Chu).coin = SECT_CREATE_COST + 1000;
    const sectName = `Re Sect ${seq}`;
    Chu.room.send(SECT_MSG.create, { name: sectName, tag: `RE${seq % 1000}` });
    await waitFor(() => lastSnap(Chu), 4000, "Chu lập tông môn");

    Chu.room.send(SECT_MSG.invite, { name: De1.name });
    await waitFor(() => De1.invited[0], 4000, "lời mời De1");
    De1.room.send(SECT_MSG.accept, { from: Chu.name });
    await waitFor(() => lastSnap(De1)?.myRank === "de_tu", 4000, "De1 nhận lời");

    // Chu 20 MAT, góp HẾT vào kho. De1 không có MAT. Tổng = 20
    addToInventory(ctrlOf(Chu).inv, MAT.id, 20);
    await worldOf(Chu.room).onSaveNow(Chu.room.sessionId);
    const INITIAL_MAT = 20;
    const countTotalMat = () =>
      countInSlots(ctrlOf(Chu)?.inv ?? saveOf(Chu.name)?.inventory, MAT.id) +
      countInSlots(ctrlOf(De1)?.inv ?? saveOf(De1.name)?.inventory, MAT.id) +
      countInSlots(vaultSlotsOf(Chu, sectName), MAT.id);

    const slotChu = ctrlOf(Chu).inv.findIndex((s: any) => s?.itemId === MAT.id);
    Chu.room.send(SECT_MSG.vaultDeposit, { slot: slotChu, qty: 20 });
    await waitFor(
      () => countInSlots(vaultSlotsOf(Chu, sectName), MAT.id) === 20,
      4000,
      "kho có 20",
    );
    expect(countTotalMat()).toBe(INITIAL_MAT);

    // Giết Chu -> Hoàng Tuyền. Kho (theo tông môn) KHÔNG bị xoá theo kiếp
    kill(Chu);
    await waitFor(() => me(Chu)?.dead, 4000, "Chu chết");
    await waitFor(() => Chu.limbs[0], 4000, "Chu vào Hoàng Tuyền (đã ghi sổ Duyên)");
    expect(countInSlots(vaultSlotsOf(Chu, sectName), MAT.id)).toBe(20); // kho vẫn còn 20 qua kiếp

    // Đầu thai: cần chờ `limbo.credited` (tin limbo về đã nghĩa là ghi sổ xong) rồi mới gửi `rebirth` hợp lệ
    Chu.room.send("rebirth", { origin: "pham_gia", keep: [] } satisfies RebirthMsg);
    await waitFor(() => me(Chu) && !me(Chu).dead, 6000, "Chu đầu thai xong, sống lại");

    // Chức vụ vẫn giữ (theo chân linh, không đổi khi đầu thai): Chu vẫn là Tông chủ
    await waitFor(() => rankOfMember(sectName, Chu.name) === "chu", 4000, "Chu vẫn Tông chủ");
    expect(rankOfMember(sectName, Chu.name)).toBe("chu");

    // Rút THEO CHỨC VỤ: Tông chủ rút TỰ DO — rút 15 MAT một lượt (Đệ tử bị hạn SECT_VAULT_DRAW_QTY_DE_TU=10/lượt)
    const vSlot = (vaultSlotsOf(Chu, sectName) ?? []).findIndex((s: any) => s?.itemId === MAT.id);
    expect(vSlot).toBeGreaterThanOrEqual(0);
    Chu.room.send(SECT_MSG.vaultWithdraw, { slot: vSlot, itemId: MAT.id, qty: 15 });
    await waitFor(() => countInSlots(ctrlOf(Chu).inv, MAT.id) === 15, 4000, "Chu rút được 15");
    expect(countInSlots(vaultSlotsOf(Chu, sectName), MAT.id)).toBe(5);
    expect(countTotalMat()).toBe(INITIAL_MAT); // 15 + 0 + 5 = 20, bảo toàn qua kiếp
  }, 25_000);

  it("ảnh chụp kho KHÔNG bị bản cũ đè: người rút TRƯỚC lưu hồ sơ chậm hơn người rút SAU thì ảnh chụp cuối của mọi thành viên vẫn là số dư thật", async () => {
    const Chu = await join(`OrdChu ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    const Lao = await join(`OrdLao ${++seq}`, roomNameOf(DEFAULT_MAP_ID));
    ctrlOf(Chu).coin = SECT_CREATE_COST + 1000;
    Chu.room.send(SECT_MSG.create, { name: `Ord Sect ${seq}`, tag: `OR${seq % 1000}` });
    await waitFor(() => lastSnap(Chu), 4000, "Chu lập tông môn");
    Chu.room.send(SECT_MSG.invite, { name: Lao.name });
    await waitFor(() => Lao.invited[0], 4000, "lời mời");
    Lao.room.send(SECT_MSG.accept, { from: Chu.name });
    await waitFor(() => lastSnap(Lao)?.myRank === "de_tu", 4000, "Lao nhận lời");
    Chu.room.send(SECT_MSG.rank, { name: Lao.name, rank: "truong_lao" }); // Trưởng lão rút tự do, không dính hạn mức
    await waitFor(() => lastSnap(Lao)?.myRank === "truong_lao", 4000, "Lao lên Trưởng lão");

    addToInventory(ctrlOf(Chu).inv, MAT.id, 25);
    await worldOf(Chu.room).onSaveNow(Chu.room.sessionId);
    const slotChu = ctrlOf(Chu).inv.findIndex((s: any) => s?.itemId === MAT.id);
    Chu.room.send(SECT_MSG.vaultDeposit, { slot: slotChu, qty: 25 });
    await waitFor(() => countInSlots(lastVault(Lao)?.slots, MAT.id) === 25, 4000, "kho có 25");
    const vSlot = (lastVault(Chu)?.slots ?? []).findIndex((s) => s?.itemId === MAT.id);

    // Chu rút TRƯỚC (kho 25 -> 15) nhưng hồ sơ của Chu lưu CHẬM 600 ms; Lao rút SAU (15 -> 5) và lưu ngay: ảnh chụp "5" phát TRƯỚC ảnh chụp "15"
    slowSaveFor(Chu.room, 600, [Chu.name]);
    Chu.room.send(SECT_MSG.vaultWithdraw, { slot: vSlot, itemId: MAT.id, qty: 10 });
    await waitFor(
      () => countInSlots(ctrlOf(Chu).inv, MAT.id) === 10,
      4000,
      "Chu đã nhận 10 (kho 15)",
    );
    Lao.room.send(SECT_MSG.vaultWithdraw, { slot: vSlot, itemId: MAT.id, qty: 10 });
    await waitFor(
      () => countInSlots(ctrlOf(Lao).inv, MAT.id) === 10,
      4000,
      "Lao đã nhận 10 (kho 5)",
    );

    // Chờ cả hai thao tác xong hẳn (toast "Đã rút" của từng người), rồi kho thật còn 5: mọi thành viên PHẢI thấy 5, không được kẹt ở bản cũ 15
    await waitFor(
      () => [Chu, Lao].every((h) => h.toasts.some((t) => /^Đã rút /.test(t))),
      8000,
      "cả hai lượt rút xong",
    );
    await waitFor(
      () => [Chu, Lao].every((h) => countInSlots(lastVault(h)?.slots, MAT.id) === 5),
      4000,
      "ảnh chụp kho cuối cùng của mọi thành viên = số dư thật (5), không phải bản cũ (15)",
    );
  });
});
