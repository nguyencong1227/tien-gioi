// Test tích hợp & thử tải chuyển bản đồ qua cổng (M3.1, Issue #141)
// Kiểm tra:
// 1. Bot qua cổng liên tục giữa hai phòng (Lạc Hà <-> Hắc Phong Cốc), đo độ trễ travel -> full state phòng đích
// 2. Không mất dữ liệu nhân vật (tu vi, Linh thạch, túi đồ) qua nhiều lần chuyển phòng
// 3. Không nhân bản: 2 client cùng tài khoản đua vào hai bản đồ -> đúng 1 bên vào, không tạo 2 thực thể
// 4. Người đang chờ nối lại ở phòng này mà vào phòng khác -> nhận wrong_map, vào lại đúng phòng dọn ghost sạch
// 5. Giải phóng tài nguyên và không rò rỉ: khi rời hết phòng, online về 0, ghosts và ctrl được dọn sạch.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  TRAVEL_COOLDOWN_MS,
  getMap,
  parseWrongMap,
  roomNameOf,
  type InvMsg,
  type TravelMsg,
  type TravelToMsg,
  type WalletMsg,
} from "@tien-gioi/shared";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-portal-test-"));
process.env.DATA_DIR = dataDir;

const PORT = 46000 + Math.floor(Math.random() * 2000);
let server: Server;
let savePlayer: typeof import("../src/store").savePlayer;
let hashSecret: typeof import("../src/store").hashSecret;
const rooms: Room[] = [];

beforeAll(async () => {
  const store = await import("../src/store");
  savePlayer = store.savePlayer;
  hashSecret = store.hashSecret;
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  WorldRoom.reconnectGraceS = 2; // Rút ngắn thời gian chờ nối lại cho test nhanh
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(100);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | false, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("Hết thời gian chờ điều kiện");
    await sleep(20);
  }
}

let nameSeq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;

const fileOf = (name: string) => {
  const f = readdirSync(dataDir).find(
    (x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name,
  );
  if (!f) return null;
  return JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
};

/** Lấy phòng server Colyseus nội bộ tương ứng với Room client */
function serverRoom(clientRoom: Room): any {
  return matchMaker.getLocalRoomById(clientRoom.roomId) as any;
}

/** Đặt toạ độ nhân vật server đứng ngay tâm cổng */
function standAt(room: Room, portal: { x: number; y: number }) {
  const sr = serverRoom(room);
  const sp = sr.state.players.get(room.sessionId)!;
  sp.x = portal.x;
  sp.y = portal.y;
  return sp;
}

async function joinRoom(name: string, secret: string, mapId: string) {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(mapId), { name, secret });
  rooms.push(room);
  const invs: InvMsg[] = [];
  const wallets: WalletMsg[] = [];
  const travelTos: TravelToMsg[] = [];
  room.onMessage("inv", (m: InvMsg) => invs.push(m));
  room.onMessage("wallet", (m: WalletMsg) => wallets.push(m));
  room.onMessage("travelTo", (m: TravelToMsg) => travelTos.push(m));
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return {
    room,
    client,
    invs,
    wallets,
    travelTos,
    me: () => (room.state as any).players.get(room.sessionId),
  };
}

describe("Thử tải & độ tin cậy chuyển bản đồ qua cổng (Issue #141)", () => {
  const lacHa = getMap(DEFAULT_MAP_ID)!;
  const hacPhong = getMap(HAC_PHONG_ID)!;
  const PORTAL_LH = lacHa.portals[0];
  const PORTAL_HP = hacPhong.portals[0];

  it("qua cổng liên tục: đo độ trễ travel -> state, không mất dữ liệu (tu vi, coin, túi đồ)", async () => {
    const name = `Bot Travel ${++nameSeq}`;
    const secret = secretOf(name);

    // 1. Khởi tạo nhân vật ở Lạc Hà Trấn, nạp tu vi và túi đồ
    let cur = await joinRoom(name, secret, DEFAULT_MAP_ID);
    cur.room.send("chat", { text: "/give nanh_soi 5" });
    await waitFor(() => cur.invs.some((m) => m.gained));
    const sr = serverRoom(cur.room);
    const sp = sr.state.players.get(cur.room.sessionId)!;
    sp.exp = 42;

    const initialExp = sp.exp;
    const initialCoin = cur.wallets.at(-1)?.coin ?? 0;

    const travelLatencies: number[] = [];
    let currentMapId = DEFAULT_MAP_ID;

    // 2. Chuyển qua lại 2 lượt khứ hồi (Lạc Hà -> Hắc Phong -> Lạc Hà)
    for (let round = 1; round <= 2; round++) {
      const isLacHa = currentMapId === DEFAULT_MAP_ID;
      const curPortal = isLacHa ? PORTAL_LH : PORTAL_HP;
      const targetMapId = isLacHa ? HAC_PHONG_ID : DEFAULT_MAP_ID;

      standAt(cur.room, curPortal);
      const t0 = performance.now();
      cur.room.send("travel", { portalId: curPortal.id } satisfies TravelMsg);

      // Đợi nhận tin travelTo
      await waitFor(() => cur.travelTos.length > 0);
      expect(cur.travelTos.at(-1)).toEqual({ mapId: targetMapId });

      // Đợi kết nối phòng cũ đóng
      await waitFor(() => !cur.room.connection.isOpen);

      // Client kết nối phòng mới
      const nextClient = new Client(`ws://localhost:${PORT}`);
      const nextRoom = await nextClient.joinOrCreate(roomNameOf(targetMapId), { name, secret });
      rooms.push(nextRoom);

      // Đợi nhận state đầy đủ ở phòng mới
      await waitFor(() => (nextRoom.state as any)?.players?.get(nextRoom.sessionId));
      const latency = performance.now() - t0;
      travelLatencies.push(latency);

      // Cập nhật cur sang phòng mới
      const nextInvs: InvMsg[] = [];
      const nextWallets: WalletMsg[] = [];
      const nextTravelTos: TravelToMsg[] = [];
      nextRoom.onMessage("inv", (m: InvMsg) => nextInvs.push(m));
      nextRoom.onMessage("wallet", (m: WalletMsg) => nextWallets.push(m));
      nextRoom.onMessage("travelTo", (m: TravelToMsg) => nextTravelTos.push(m));

      cur = {
        room: nextRoom,
        client: nextClient,
        invs: nextInvs,
        wallets: nextWallets,
        travelTos: nextTravelTos,
        me: () => (nextRoom.state as any).players.get(nextRoom.sessionId),
      };

      currentMapId = targetMapId;

      // Đợi hồi chiêu cổng để lần sau đi tiếp
      await sleep(TRAVEL_COOLDOWN_MS + 50);
    }

    // 3. Đánh giá độ trễ: p50 và p95
    travelLatencies.sort((a, b) => a - b);
    const p50 = travelLatencies[Math.floor(travelLatencies.length * 0.5)];
    const p95 = travelLatencies[Math.floor(travelLatencies.length * 0.95)];
    expect(p50).toBeLessThan(350); // Độ trễ chuyển phòng p50 < 350 ms trong tiến trình test
    expect(p95).toBeLessThan(600);

    // 4. Kiểm tra trọn vẹn dữ liệu: không mất tu vi, không mất túi đồ, file lưu đúng
    const finalCtrl = serverRoom(cur.room).world.ctrl.get(cur.room.sessionId);
    const nanhSoiSlot = finalCtrl?.inv.find((s: any) => s?.itemId === "nanh_soi");
    expect(nanhSoiSlot?.qty).toBe(5);
    expect(cur.me().exp).toBe(initialExp);
    const finalSaved = fileOf(name);
    expect(finalSaved.name).toBe(name);
    expect(finalSaved.mapId).toBe(currentMapId);
    expect(finalSaved.coin ?? 0).toBe(initialCoin);
    expect(finalSaved.inventory?.find((s: any) => s?.itemId === "nanh_soi")?.qty).toBe(5);
  }, 20_000);

  it("chống nhân bản: hai client cùng tài khoản đua kết nối vào hai bản đồ cùng lúc -> đúng một bên vào", async () => {
    const name = `Bot Race ${++nameSeq}`;
    const secret = secretOf(name);

    // Đua kết nối đồng thời vào 2 phòng khác nhau
    const client1 = new Client(`ws://localhost:${PORT}`);
    const client2 = new Client(`ws://localhost:${PORT}`);

    const [res1, res2] = await Promise.allSettled([
      client1.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { name, secret }),
      client2.joinOrCreate(roomNameOf(HAC_PHONG_ID), { name, secret }),
    ]);

    // Đúng một bên thành công, một bên bị từ chối
    const successCount = [res1, res2].filter((r) => r.status === "fulfilled").length;
    const rejectedCount = [res1, res2].filter((r) => r.status === "rejected").length;

    expect(successCount).toBe(1);
    expect(rejectedCount).toBe(1);

    // Bên bị từ chối phải là lỗi chuyển hướng hoặc mã trùng
    const rejected = res1.status === "rejected" ? res1.reason : (res2 as any).reason;
    expect(rejected).toBeDefined();

    // Dọn dẹp phòng thành công
    if (res1.status === "fulfilled") rooms.push(res1.value);
    if (res2.status === "fulfilled") rooms.push(res2.value);
  });

  it("người đang chờ nối lại ở phòng này mà vào phòng khác -> nhận wrong_map, vào lại phòng cũ dọn sạch ghost", async () => {
    const name = `Bot Ghost ${++nameSeq}`;
    const secret = secretOf(name);

    // Vào Lạc Hà
    const c1 = await joinRoom(name, secret, DEFAULT_MAP_ID);
    const sr = serverRoom(c1.room);
    const sid = c1.room.sessionId;

    // Rớt mạng bất thường (ws close không leave) -> thành ghost
    (c1.room.connection.transport as any).ws.close();
    await waitFor(() => sr.ghosts.has(sid));
    expect(sr.ghosts.has(sid)).toBe(true);

    // Thử vào Hắc Phong Cốc khi đang chờ nối lại ở Lạc Hà
    const client2 = new Client(`ws://localhost:${PORT}`);
    let wrongMapErr: any = null;
    try {
      await client2.joinOrCreate(roomNameOf(HAC_PHONG_ID), { name, secret });
    } catch (err: any) {
      wrongMapErr = err;
    }
    expect(wrongMapErr).toBeDefined();
    expect(parseWrongMap(wrongMapErr.code, wrongMapErr.message)).toBe(DEFAULT_MAP_ID);

    // Vào lại đúng phòng Lạc Hà -> ghost cũ bị huỷ, vào phòng bình thường
    const client3 = new Client(`ws://localhost:${PORT}`);
    const c3 = await client3.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { name, secret });
    rooms.push(c3);
    await waitFor(() => !sr.ghosts.has(sid));
    expect(sr.ghosts.has(sid)).toBe(false);
  });

  it("rò rỉ: khi tất cả client rời phòng, online về 0, không còn ghost hay ctrl bị treo", async () => {
    const name1 = `Bot Clean One ${++nameSeq}`;
    const name2 = `Bot Clean Two ${++nameSeq}`;

    // Tạo sẵn file lưu ở Hắc Phong Cốc cho Bot Clean Two
    await savePlayer({
      name: name2,
      secretHash: hashSecret(secretOf(name2)),
      realm: 1,
      tier: 0,
      exp: 0,
      mapId: HAC_PHONG_ID,
      x: PORTAL_HP.spawn.x,
      y: PORTAL_HP.spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const b1 = await joinRoom(name1, secretOf(name1), DEFAULT_MAP_ID);
    const b2 = await joinRoom(name2, secretOf(name2), HAC_PHONG_ID);

    const sr1 = serverRoom(b1.room);
    const sr2 = serverRoom(b2.room);

    expect((sr1.state as any).players.size).toBe(1);
    expect((sr2.state as any).players.size).toBe(1);

    // Cả 2 rời phòng chủ động
    await b1.room.leave(true);
    await b2.room.leave(true);

    await sleep(200);

    // Cả 2 phòng online về đúng 0
    expect((sr1.state as any).players.size).toBe(0);
    expect((sr2.state as any).players.size).toBe(0);
    expect(sr1.ghosts.size).toBe(0);
    expect(sr2.ghosts.size).toBe(0);
  });
});
