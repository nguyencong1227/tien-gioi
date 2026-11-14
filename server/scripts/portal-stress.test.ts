// Test tích hợp & thử tải chuyển bản đồ qua cổng (M3.1, Issue #141)
// Kiểm tra:
// 1. Bot qua cổng liên tục giữa hai phòng (Lạc Hà <-> Hắc Phong Cốc), đo độ trễ travel -> full state phòng đích
// 2. Không mất dữ liệu nhân vật (tu vi, Linh thạch, túi đồ) qua nhiều lần chuyển phòng
// 3. Nhân vật mới chỉ tạo ở Lạc Hà Trấn: client kết nối vào bản đồ khác bị từ chối wrong_map
// 4. Người đang chờ nối lại ở phòng này mà vào phòng khác -> nhận wrong_map, vào lại đúng phòng dọn ghost sạch ngay lập tức
// 5. Giải phóng tài nguyên và không rò rỉ: khi rời hết phòng, online và players về 0, ghosts và ctrl được dọn sạch.
// 6. Ba bản đồ (M6, #405): đi trọn Lạc Hà <-> Hắc Phong Cốc <-> Âm Sương Trạch, nhân vật lưu ở Âm Sương chỉ vào được phòng Âm Sương.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  AM_SUONG_ID,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  QUESTS,
  TRAVEL_COOLDOWN_MS,
  emptyInventory,
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

import { listenWithRetry } from "../src/test-port";

// cổng do hệ điều hành cấp ở beforeAll (`listenWithRetry`): tự động thử lại nếu gặp EADDRINUSE giữa các tệp chạy song song
let PORT = 0;
let server: Server;
let savePlayer: typeof import("../src/store").savePlayer;
let hashSecret: typeof import("../src/store").hashSecret;
const rooms: Room[] = [];

beforeAll(async () => {
  const store = await import("../src/store");
  savePlayer = store.savePlayer;
  hashSecret = store.hashSecret;
  const { WorldRoom, defineRooms } = await import("../src/rooms/WorldRoom");
  WorldRoom.reconnectGraceS = 5; // Đủ dài để phân biệt ghost bị huỷ do đăng nhập lại vs hết hạn tự nhiên
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  PORT = await listenWithRetry(server);
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

async function waitFor<T>(fn: () => T | undefined | false, ms = 8000): Promise<T> {
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

      // Đợi nhận tin travelTo của bản đồ đích (chờ điều kiện khớp targetMapId thay vì chỉ kiểm tra length)
      const travelToMsg = await waitFor(
        () => cur.travelTos.find((m) => m.mapId === targetMapId),
        8000,
      );
      expect(travelToMsg).toEqual({ mapId: targetMapId });

      // Đợi kết nối phòng cũ đóng
      await waitFor(() => !cur.room.connection.isOpen, 8000);

      // Client kết nối phòng mới
      const nextClient = new Client(`ws://localhost:${PORT}`);
      const nextRoom = await nextClient.joinOrCreate(roomNameOf(targetMapId), { name, secret });
      rooms.push(nextRoom);

      // Đợi nhận state đầy đủ ở phòng mới
      await waitFor(() => (nextRoom.state as any)?.players?.get(nextRoom.sessionId), 8000);
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

      // Đợi hết hồi chiêu cổng trên đồng hồ phòng server trước khi chặng tiếp theo bắt đầu
      if (round < 2) {
        await waitFor(() => {
          const srNow = serverRoom(cur.room);
          const ctrl = srNow?.world?.ctrl?.get(cur.room.sessionId);
          if (!ctrl) return false;
          return srNow.world.now - (ctrl.save?.travelAt ?? 0) >= TRAVEL_COOLDOWN_MS;
        }, 8000);
      }
    }

    // 3. Đánh giá độ trễ: p50 và p95 (mục tiêu LOAD_TEST.md p50 < 350, p95 < 600; trần test 600 / 900)
    travelLatencies.sort((a, b) => a - b);
    const p50 = travelLatencies[Math.floor(travelLatencies.length * 0.5)];
    const p95 = travelLatencies[Math.floor(travelLatencies.length * 0.95)];
    expect(p50).toBeLessThan(600); // Độ trễ chuyển phòng p50 < 600 ms khi chịu tải nền
    expect(p95).toBeLessThan(900);

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

  it("nhân vật mới chỉ được tạo ở bản đồ mặc định (Lạc Hà Trấn); phòng khác từ chối wrong_map", async () => {
    const name = `Bot LH Only ${++nameSeq}`;
    const secret = secretOf(name);

    // Thử kết nối đồng thời vào 2 phòng khác nhau khi chưa có file lưu
    const client1 = new Client(`ws://localhost:${PORT}`);
    const client2 = new Client(`ws://localhost:${PORT}`);

    const [res1, res2] = await Promise.allSettled([
      client1.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { name, secret }),
      client2.joinOrCreate(roomNameOf(HAC_PHONG_ID), { name, secret }),
    ]);

    // Lạc Hà tạo nhân vật thành công, Hắc Phong Cốc từ chối vì nhân vật mới chỉ được sinh ở Lạc Hà
    expect(res1.status).toBe("fulfilled");
    expect(res2.status).toBe("rejected");
    if (res1.status === "fulfilled") rooms.push(res1.value);
    if (res2.status === "rejected") {
      const err = (res2 as PromiseRejectedResult).reason;
      expect(parseWrongMap(err?.code, err?.message)).toBe(DEFAULT_MAP_ID);
    }
  });

  it("người đang chờ nối lại ở phòng này mà vào phòng khác -> nhận wrong_map, vào lại phòng cũ dọn sạch ghost", async () => {
    const name = `Bot Ghost ${++nameSeq}`;
    const secret = secretOf(name);

    // Vào Lạc Hà
    const c1 = await joinRoom(name, secret, DEFAULT_MAP_ID);
    const sr = serverRoom(c1.room);
    const sid = c1.room.sessionId;

    // Rớt mạng bất thường (ws close không leave) -> thành ghost
    const tDrop = Date.now();
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

    // Vào lại đúng phòng Lạc Hà -> ghost cũ bị huỷ ngay lập tức, vào phòng bình thường
    const client3 = new Client(`ws://localhost:${PORT}`);
    const c3 = await client3.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { name, secret });
    rooms.push(c3);
    const elapsed = (Date.now() - tDrop) / 1000;
    // Đảm bảo thời gian chưa hết hạn grace (reconnectGraceS = 5s)
    const { WorldRoom } = await import("../src/rooms/WorldRoom");
    expect(elapsed).toBeLessThan(WorldRoom.reconnectGraceS);
    // Ghost phải được dọn dẹp NGAY sau joinOrCreate chứ không phải do grace timer hết hạn
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
    expect((sr1.state as any).online).toBe(1);
    expect((sr2.state as any).online).toBe(1);

    // Cả 2 rời phòng chủ động
    await b1.room.leave(true);
    await b2.room.leave(true);

    await sleep(200);

    // Cả 2 phòng online về đúng 0, players rỗng, ghosts rỗng, ctrl rỗng
    expect((sr1.state as any).players.size).toBe(0);
    expect((sr2.state as any).players.size).toBe(0);
    expect((sr1.state as any).online).toBe(0);
    expect((sr2.state as any).online).toBe(0);
    expect(sr1.ghosts.size).toBe(0);
    expect(sr2.ghosts.size).toBe(0);
    expect(sr1.world.ctrl.size).toBe(0);
    expect(sr2.world.ctrl.size).toBe(0);
  });
});

type Conn = Awaited<ReturnType<typeof joinRoom>>;

/** Đứng ở cổng `portalId` của bản đồ `fromMapId`, qua cổng, nối vào phòng đích; trả kết nối mới. */
async function hop(cur: Conn, name: string, fromMapId: string, portalId: string): Promise<Conn> {
  const portal = getMap(fromMapId)!.portal(portalId)!;
  standAt(cur.room, portal);
  // Hồi chiêu cổng đã có test riêng (planTravel); ở đây xoá để không phải chờ 3 giây mỗi chặng
  serverRoom(cur.room).world.ctrl.get(cur.room.sessionId).save.travelAt = 0;
  cur.room.send("travel", { portalId } satisfies TravelMsg);
  const travelToMsg = await waitFor(
    () => cur.travelTos.find((m) => m.mapId === portal.toMap),
    8000,
  );
  expect(travelToMsg).toEqual({ mapId: portal.toMap });
  await waitFor(() => !cur.room.connection.isOpen);
  // Vào được phòng đích mà không bị wrong_map nghĩa là bản ghi đích đã được lưu TRƯỚC khi gửi travelTo
  const next = await joinRoom(name, secretOf(name), portal.toMap);
  expect(serverRoom(next.room).mapId).toBe(portal.toMap);
  expect(fileOf(name).mapId).toBe(portal.toMap);
  return next;
}

describe("Ba bản đồ: Lạc Hà <-> Hắc Phong Cốc <-> Âm Sương Trạch (M6, #405)", () => {
  it("đi hết một vòng khứ hồi bốn chặng: tới đúng chỗ xuất hiện của cổng đích, trong khu an toàn, dữ liệu nguyên vẹn", async () => {
    const name = `Bot Ba Ban Do ${++nameSeq}`;
    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    cur.room.send("chat", { text: "/give nanh_soi 5" });
    await waitFor(() => cur.invs.some((m) => m.gained));
    serverRoom(cur.room).state.players.get(cur.room.sessionId)!.exp = 42;

    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_nam"],
      [HAC_PHONG_ID, "hac_phong_nam"],
    ];
    const visited: string[] = [DEFAULT_MAP_ID];
    for (const [fromMapId, portalId] of route) {
      cur = await hop(cur, name, fromMapId, portalId);
      const portal = getMap(fromMapId)!.portal(portalId)!;
      const dest = getMap(portal.toMap)!;
      const spawn = dest.portal(portal.toPortal)!.spawn;
      const me = cur.me();
      expect(Math.hypot(me.x - spawn.x, me.y - spawn.y), `tới ${portal.toMap}`).toBeLessThan(2);
      expect(dest.inSafe(me.x, me.y), `${portal.toMap}: chỗ xuất hiện nằm trong khu an toàn`).toBe(
        true,
      );
      expect(dest.isBlockedPx(me.x, me.y), `${portal.toMap}: không đứng trong ô chặn`).toBe(false);
      visited.push(portal.toMap);
    }
    expect(visited).toEqual([
      DEFAULT_MAP_ID,
      HAC_PHONG_ID,
      AM_SUONG_ID,
      HAC_PHONG_ID,
      DEFAULT_MAP_ID,
    ]);

    const saved = fileOf(name);
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
    expect(saved.exp).toBe(42);
    expect(saved.inventory?.find((s: any) => s?.itemId === "nanh_soi")?.qty).toBe(5);
    expect(cur.me().exp).toBe(42);
  }, 30_000);

  it("nhân vật lưu ở Âm Sương: phòng Lạc Hà và Hắc Phong trả wrong_map:am_suong, phòng Âm Sương nhận, có quái và đúng bản đồ", async () => {
    const name = `Bot Am Suong ${++nameSeq}`;
    const to = getMap(HAC_PHONG_ID)!.portal("hac_phong_bac")!;
    const spawn = getMap(to.toMap)!.portal(to.toPortal)!.spawn;
    await savePlayer({
      name,
      secretHash: hashSecret(secretOf(name)),
      realm: 4,
      tier: 0,
      exp: 0,
      mapId: AM_SUONG_ID,
      x: spawn.x,
      y: spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const wrong of [DEFAULT_MAP_ID, HAC_PHONG_ID]) {
      const client = new Client(`ws://localhost:${PORT}`);
      let err: any = null;
      try {
        rooms.push(await client.joinOrCreate(roomNameOf(wrong), { name, secret: secretOf(name) }));
      } catch (e: any) {
        err = e;
      }
      expect(err, `vào nhầm ${wrong}`).not.toBeNull();
      expect(parseWrongMap(err.code, err.message)).toBe(AM_SUONG_ID);
    }
    const ok = await joinRoom(name, secretOf(name), AM_SUONG_ID);
    const sr = serverRoom(ok.room);
    expect(sr.mapId).toBe(AM_SUONG_ID);
    expect(sr.state.monsters.size).toBeGreaterThan(0);
    expect(ok.me().x).toBeCloseTo(spawn.x, 0);
    expect(ok.me().y).toBeCloseTo(spawn.y, 0);
  });
});

describe("Ba bản đồ: dữ liệu nguyên vẹn sau MỖI lần qua cổng, rớt mạng và hai tab cùng mã (M6, #411 mục 1)", () => {
  // Hồ sơ mẫu có MỌI loại dữ liệu cần giữ: tu vi, Linh thạch, túi đồ, sổ nhiệm vụ (đang làm dở một nhiệm vụ diệt quái, đã xong một nhiệm vụ)
  const EXP = 42;
  const COIN = 12345;
  // Cảnh giới KHÁC mặc định (Luyện Khí tầng 3), có đồ đang mặc và mã kiếp: nếu lưu lúc qua cổng làm rơi các trường này thì đỏ
  const REALM = 1;
  const TIER = 2;
  const LIFE_ID = "kiep-thu-nghiem-0123";
  const equipment = { weapon: "lang_nha_kiem", robe: "tho_nhung_bao", talisman: "lang_nha_phu" };
  const killQuest = QUESTS.find(
    (q) => !q.daily && q.steps[0]?.kind === "kill" && (q.steps[0] as { count: number }).count >= 3,
  )!;
  const doneQuest = QUESTS.find((q) => !q.daily && q.id !== killQuest.id)!;
  const inventory = emptyInventory();
  inventory[0] = { itemId: "nanh_soi", qty: 5 };
  inventory[3] = { itemId: "hoi_huyet_dan", qty: 2 };
  const quests = {
    active: [{ id: killQuest.id, step: 0, count: 2 }],
    done: [doneQuest.id],
    daily: {},
  };
  const items = (inv: ({ itemId: string; qty: number } | null)[]) =>
    inv.filter(Boolean).sort((a, b) => a!.itemId.localeCompare(b!.itemId));

  /** Lưu sẵn nhân vật ở bản đồ `mapId`, đứng ở chỗ xuất hiện của cổng `portalId` (hoặc mặc định nếu không nêu). */
  async function seed(name: string, mapId: string, portalId?: string) {
    const spawn = portalId ? getMap(mapId)!.portal(portalId)!.spawn : undefined;
    await savePlayer({
      name,
      secretHash: hashSecret(secretOf(name)),
      realm: REALM,
      tier: TIER,
      exp: EXP,
      coin: COIN,
      inventory,
      quests,
      equipment,
      lifeId: LIFE_ID,
      mapId,
      ...(spawn ? { x: spawn.x, y: spawn.y } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Hồ sơ trên đĩa VÀ trạng thái sống ở phòng hiện tại đều khớp hồ sơ mẫu. */
  async function expectIntact(cur: Conn, name: string, where: string) {
    const f = fileOf(name);
    expect(f.realm, `${where}: cảnh giới trên đĩa`).toBe(REALM);
    expect(f.tier, `${where}: tầng trên đĩa`).toBe(TIER);
    expect(f.exp, `${where}: tu vi trên đĩa`).toBe(EXP);
    expect(f.equipment, `${where}: đồ đang mặc trên đĩa`).toEqual(equipment);
    expect(f.lifeId, `${where}: mã kiếp trên đĩa`).toBe(LIFE_ID);
    expect(f.coin, `${where}: Linh thạch trên đĩa`).toBe(COIN);
    expect(items(f.inventory), `${where}: túi đồ trên đĩa`).toEqual(items(inventory));
    expect(f.quests, `${where}: sổ nhiệm vụ trên đĩa`).toEqual(quests);
    expect(cur.me().exp, `${where}: tu vi đang chơi`).toBe(EXP);
    expect(cur.me().realm, `${where}: cảnh giới đang chơi`).toBe(REALM);
    expect(cur.me().tier, `${where}: tầng đang chơi`).toBe(TIER);
    expect(
      { weapon: cur.me().weapon, robe: cur.me().robe, talisman: cur.me().talisman },
      `${where}: đồ đang mặc đang chơi`,
    ).toEqual(equipment);
    await waitFor(() => cur.wallets.at(-1)?.coin === COIN);
    await waitFor(() => cur.invs.at(-1) && items(cur.invs.at(-1)!.slots).length === 2);
    expect(items(cur.invs.at(-1)!.slots), `${where}: túi đồ đang chơi`).toEqual(items(inventory));
  }

  /** Rớt mạng bất thường (đóng WebSocket không "thoát chủ động") rồi nối lại bằng token như client thật. */
  async function dropAndReconnect(cur: Conn): Promise<Conn> {
    const sr = serverRoom(cur.room);
    const sid = cur.room.sessionId;
    (cur.room.connection.transport as any).ws.close();
    await waitFor(() => sr.ghosts.has(sid));
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.reconnect(cur.room.reconnectionToken);
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

  it("vòng khứ hồi bốn chặng: tu vi, Linh thạch, túi đồ, sổ nhiệm vụ nguyên vẹn SAU MỖI lần qua cổng (đĩa và đang chơi)", async () => {
    const name = `Bot Toan Ven ${++nameSeq}`;
    await seed(name, DEFAULT_MAP_ID);
    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    await expectIntact(cur, name, DEFAULT_MAP_ID);
    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_nam"],
      [HAC_PHONG_ID, "hac_phong_nam"],
    ];
    for (const [fromMapId, portalId] of route) {
      cur = await hop(cur, name, fromMapId, portalId);
      await expectIntact(cur, name, `sau ${portalId}`);
    }
  }, 40_000);

  it("rớt mạng ở Âm Sương rồi nối lại trong thời gian chờ: vẫn ở Âm Sương, dữ liệu nguyên, vẫn qua cổng được", async () => {
    const name = `Bot Roi Mang ${++nameSeq}`;
    await seed(name, AM_SUONG_ID, "am_suong_nam");
    const first = await joinRoom(name, secretOf(name), AM_SUONG_ID);
    await expectIntact(first, name, "vào Âm Sương");
    const sid = first.room.sessionId;

    const again = await dropAndReconnect(first);
    expect(again.room.sessionId).toBe(sid);
    expect(serverRoom(again.room).mapId).toBe(AM_SUONG_ID);
    await expectIntact(again, name, "sau khi nối lại");
    // Chỉ một nhân vật mang tên này trong phòng (không sinh bản sao)
    const sr = serverRoom(again.room);
    const same = [...sr.state.players.values()].filter((p: any) => p.name === name);
    expect(same.length).toBe(1);
    expect(sr.ghosts.has(sid)).toBe(false);

    // Nối lại xong vẫn qua cổng bình thường và dữ liệu theo sang bản đồ đích
    const next = await hop(again, name, AM_SUONG_ID, "am_suong_nam");
    await expectIntact(next, name, "qua cổng sau khi nối lại");
  }, 30_000);

  it("rớt mạng ở Âm Sương rồi ĐĂNG NHẬP LẠI (mất token): huỷ chờ, vào lại đúng phòng, một nhân vật, dữ liệu nguyên", async () => {
    const name = `Bot Nhap Lai ${++nameSeq}`;
    await seed(name, AM_SUONG_ID, "am_suong_nam");
    const first = await joinRoom(name, secretOf(name), AM_SUONG_ID);
    const sr = serverRoom(first.room);
    const sid = first.room.sessionId;
    (first.room.connection.transport as any).ws.close();
    await waitFor(() => sr.ghosts.has(sid));

    const second = await joinRoom(name, secretOf(name), AM_SUONG_ID);
    expect(sr.ghosts.has(sid)).toBe(false);
    expect([...sr.state.players.values()].filter((p: any) => p.name === name).length).toBe(1);
    await expectIntact(second, name, "đăng nhập lại");
  }, 30_000);

  it("hai tab cùng mã nhân vật ở Âm Sương: tab thứ hai bị từ chối 409, tab đầu không bị ảnh hưởng", async () => {
    const name = `Bot Hai Tab ${++nameSeq}`;
    await seed(name, AM_SUONG_ID, "am_suong_nam");
    const a = await joinRoom(name, secretOf(name), AM_SUONG_ID);
    let err: any = null;
    try {
      rooms.push(
        await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(AM_SUONG_ID), {
          name,
          secret: secretOf(name),
        }),
      );
    } catch (e: any) {
      err = e;
    }
    expect(err?.code).toBe(409);
    expect(a.room.connection.isOpen).toBe(true);
    expect(
      [...serverRoom(a.room).state.players.values()].filter((p: any) => p.name === name).length,
    ).toBe(1);
    await expectIntact(a, name, "tab đầu sau khi tab hai bị từ chối");
  }, 30_000);

  it("hai tab đua nhau lúc qua cổng: tab hai không vào được phòng cũ (409 hoặc wrong_map), chỉ vào được phòng đích, đĩa không bị đè lại", async () => {
    const name = `Bot Dua Cong ${++nameSeq}`;
    await seed(name, HAC_PHONG_ID, "hac_phong_bac");
    const a = await joinRoom(name, secretOf(name), HAC_PHONG_ID);
    const portal = getMap(HAC_PHONG_ID)!.portal("hac_phong_bac")!;
    standAt(a.room, portal);
    serverRoom(a.room).world.ctrl.get(a.room.sessionId).save.travelAt = 0;

    // Tab A qua cổng ĐỒNG THỜI với tab B vào lại phòng cũ bằng cùng mã nhân vật
    const joinOld = new Client(`ws://localhost:${PORT}`)
      .joinOrCreate(roomNameOf(HAC_PHONG_ID), { name, secret: secretOf(name) })
      .then(
        (r) => {
          rooms.push(r);
          return { ok: true as const, err: null };
        },
        (err: any) => ({ ok: false as const, err }),
      );
    a.room.send("travel", { portalId: "hac_phong_bac" } satisfies TravelMsg);
    const res = await joinOld;
    expect(res.ok, "không được có hai nhân vật cùng tên ở phòng cũ").toBe(false);
    const code = res.err?.code;
    const wrong = parseWrongMap(code, res.err?.message ?? "");
    expect(code === 409 || wrong === AM_SUONG_ID, `lỗi bất ngờ: ${code} ${res.err?.message}`).toBe(
      true,
    );

    await waitFor(() => a.travelTos.length > 0);
    await waitFor(() => !a.room.connection.isOpen);
    const b = await joinRoom(name, secretOf(name), portal.toMap);
    await expectIntact(b, name, "tab hai ở phòng đích");
    // Lưu muộn của phòng cũ không được đè bản ghi mới (savePlayer xếp hàng theo tệp)
    await sleep(500);
    expect(fileOf(name).mapId).toBe(portal.toMap);
    expect(
      [...serverRoom(b.room).state.players.values()].filter((p: any) => p.name === name).length,
    ).toBe(1);
  }, 30_000);
  it("lưu định kỳ chạy ĐÚNG lúc đang qua cổng không đè bản ghi đích (chốt `travelling` của persist)", async () => {
    const name = `Bot Dinh Ky ${++nameSeq}`;
    await seed(name, HAC_PHONG_ID, "hac_phong_bac");
    const a = await joinRoom(name, secretOf(name), HAC_PHONG_ID);
    const portal = getMap(HAC_PHONG_ID)!.portal("hac_phong_bac")!;
    standAt(a.room, portal);
    const sr = serverRoom(a.room);
    const sid = a.room.sessionId;
    const p = sr.state.players.get(sid);
    const c = sr.world.ctrl.get(sid);
    c.save.travelAt = 0;
    a.room.send("travel", { portalId: "hac_phong_bac" } satisfies TravelMsg);
    await waitFor(() => c.travelling);
    // Lưu định kỳ / lúc rớt mạng chạy sau khi đã bắt đầu qua cổng: phải bị bỏ qua, không ghi lại bản đồ cũ
    await sr.persist(p, c);
    await waitFor(() => a.travelTos.length > 0);
    await waitFor(() => !a.room.connection.isOpen);
    await sleep(200);
    expect(fileOf(name).mapId).toBe(portal.toMap);
    const b = await joinRoom(name, secretOf(name), portal.toMap);
    await expectIntact(b, name, "đích sau lưu định kỳ chen ngang");
  }, 30_000);
  it("tệp lưu cũ (thiếu mapId, hoặc mapId của bản đồ không còn / chưa biết): vào được Lạc Hà, phòng khác trả wrong_map:lac_ha", async () => {
    for (const [label, extra] of [
      ["thiếu mapId (tệp trước M3)", {}],
      ["mapId của bản đồ chưa biết (tệp của bản mới hơn)", { mapId: "ban_do_tuong_lai" }],
    ] as const) {
      const name = `Bot Tep Cu ${++nameSeq}`;
      await savePlayer({
        name,
        secretHash: hashSecret(secretOf(name)),
        realm: REALM,
        tier: TIER,
        exp: EXP,
        coin: COIN,
        inventory,
        quests,
        equipment,
        lifeId: LIFE_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...extra,
      });
      for (const wrong of [HAC_PHONG_ID, AM_SUONG_ID]) {
        let err: any = null;
        try {
          rooms.push(
            await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(wrong), {
              name,
              secret: secretOf(name),
            }),
          );
        } catch (e: any) {
          err = e;
        }
        expect(parseWrongMap(err?.code, err?.message ?? ""), `${label}: vào nhầm ${wrong}`).toBe(
          DEFAULT_MAP_ID,
        );
      }
      const ok = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
      expect(serverRoom(ok.room).mapId, label).toBe(DEFAULT_MAP_ID);
      await expectIntact(ok, name, label);
      // Qua cổng từ tệp cũ cũng chạy bình thường (ghi mapId đích đúng)
      const next = await hop(ok, name, DEFAULT_MAP_ID, "lac_ha_bac");
      await expectIntact(next, name, `${label}: sau khi qua cổng`);
    }
  }, 30_000);
});
