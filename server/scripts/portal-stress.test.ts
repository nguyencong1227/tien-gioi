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
  HAN_VAN_ID,
  LANG_HOANG_ID,
  UY_VAN_ID,
  QUESTS,
  SKILLS_M7,
  TRAVEL_COOLDOWN_MS,
  emptyInventory,
  emptySkillBook,
  getMap,
  parseWrongMap,
  roomNameOf,
  type InvMsg,
  type SkillBook,
  type SkillsMsg,
  type TravelMsg,
  type TravelToMsg,
  type WalletMsg,
} from "@tien-gioi/shared";
import { auditSavesDirectory } from "./audit-saves";

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
  const skillsMsgs: SkillsMsg[] = [];
  room.onMessage("inv", (m: InvMsg) => invs.push(m));
  room.onMessage("wallet", (m: WalletMsg) => wallets.push(m));
  room.onMessage("travelTo", (m: TravelToMsg) => travelTos.push(m));
  room.onMessage("skills", (m: SkillsMsg) => skillsMsgs.push(m));
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return {
    room,
    client,
    invs,
    wallets,
    travelTos,
    skillsMsgs,
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
      const nextSkillsMsgs: SkillsMsg[] = [];
      nextRoom.onMessage("inv", (m: InvMsg) => nextInvs.push(m));
      nextRoom.onMessage("wallet", (m: WalletMsg) => nextWallets.push(m));
      nextRoom.onMessage("travelTo", (m: TravelToMsg) => nextTravelTos.push(m));
      nextRoom.onMessage("skills", (m: SkillsMsg) => nextSkillsMsgs.push(m));

      cur = {
        room: nextRoom,
        client: nextClient,
        invs: nextInvs,
        wallets: nextWallets,
        travelTos: nextTravelTos,
        skillsMsgs: nextSkillsMsgs,
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

describe("Bốn bản đồ: Lạc Hà <-> Hắc Phong Cốc <-> Âm Sương Trạch <-> Hàn Vân Lĩnh (M7.11, #512)", () => {
  it("đi hết một vòng khứ hồi sáu chặng bốn bản đồ: tới đúng chỗ xuất hiện của cổng đích, trong khu an toàn, dữ liệu nguyên vẹn", async () => {
    const name = `Bot Bon Ban Do ${++nameSeq}`;
    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    cur.room.send("chat", { text: "/give nanh_soi 5" });
    await waitFor(() => cur.invs.some((m) => m.gained));
    serverRoom(cur.room).state.players.get(cur.room.sessionId)!.exp = 42;

    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_bac"],
      [HAN_VAN_ID, "han_van_nam"],
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
      HAN_VAN_ID,
      AM_SUONG_ID,
      HAC_PHONG_ID,
      DEFAULT_MAP_ID,
    ]);

    const saved = fileOf(name);
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
    expect(saved.exp).toBe(42);
    expect(saved.inventory?.find((s: any) => s?.itemId === "nanh_soi")?.qty).toBe(5);
    expect(cur.me().exp).toBe(42);
  }, 45_000);

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

  it("nhân vật lưu ở Hàn Vân Lĩnh: các phòng Lạc Hà, Hắc Phong, Âm Sương trả wrong_map:han_van, phòng Hàn Vân nhận, có quái và đúng bản đồ", async () => {
    const name = `Bot Han Van ${++nameSeq}`;
    const to = getMap(AM_SUONG_ID)!.portal("am_suong_bac")!;
    const spawn = getMap(to.toMap)!.portal(to.toPortal)!.spawn;
    await savePlayer({
      name,
      secretHash: hashSecret(secretOf(name)),
      realm: 4,
      tier: 0,
      exp: 0,
      mapId: HAN_VAN_ID,
      x: spawn.x,
      y: spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const wrong of [DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID]) {
      const client = new Client(`ws://localhost:${PORT}`);
      let err: any = null;
      try {
        rooms.push(await client.joinOrCreate(roomNameOf(wrong), { name, secret: secretOf(name) }));
      } catch (e: any) {
        err = e;
      }
      expect(err, `vào nhầm ${wrong}`).not.toBeNull();
      expect(parseWrongMap(err.code, err.message)).toBe(HAN_VAN_ID);
    }
    const ok = await joinRoom(name, secretOf(name), HAN_VAN_ID);
    const sr = serverRoom(ok.room);
    expect(sr.mapId).toBe(HAN_VAN_ID);
    expect(sr.state.monsters.size).toBeGreaterThan(0);
    expect(ok.me().x).toBeCloseTo(spawn.x, 0);
    expect(ok.me().y).toBeCloseTo(spawn.y, 0);
  });
});

describe("Bốn bản đồ: dữ liệu nguyên vẹn sau MỖI lần qua cổng, rớt mạng và hai tab cùng mã (M7.11, #512)", () => {
  // Hồ sơ mẫu có MỌI loại dữ liệu cần giữ: tu vi, Linh thạch, túi đồ, sổ nhiệm vụ (đang làm dở một nhiệm vụ diệt quái, đã xong một nhiệm vụ)
  const EXP = 42;
  const COIN = 12345;
  // Cảnh giới KHÁC mặc định (Luyện Khí tầng 3), có đồ đang mặc và mã kiếp: nếu lưu lúc qua cổng làm rơi các trường này thì đỏ
  const REALM = 1;
  const TIER = 2;
  const LIFE_ID = "kiep-thu-nghiem-0123";
  const equipment = { weapon: "lang_nha_kiem", robe: "tho_nhung_bao", talisman: "lang_nha_phu" };
  const skills = {
    learned: { hoa_van_kiem: 2, bon_thach_quyen: 1 },
    slots: ["hoa_van_kiem", "", "", ""] as [string, string, string, string],
  };
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
      skills,
      mapId,
      ...(spawn ? { x: spawn.x, y: spawn.y } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Hồ sơ trên đĩa VÀ trạng thái sống ở phòng hiện tại đều khớp hồ sơ mẫu. */
  async function expectIntact(
    cur: Conn,
    name: string,
    where: string,
    expectedSkills: SkillBook | null = skills,
  ) {
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
    if (expectedSkills) {
      expect(f.skills, `${where}: sổ chiêu trên đĩa`).toEqual(expectedSkills);
      await waitFor(() => cur.skillsMsgs.length > 0);
      const lastSkills = cur.skillsMsgs.at(-1)!;
      expect(lastSkills.learned, `${where}: chiêu đã học đang chơi`).toEqual(
        expectedSkills.learned,
      );
      expect(lastSkills.slots, `${where}: ô chiêu đang chơi`).toEqual(expectedSkills.slots);
    }
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
    const skillsMsgs: SkillsMsg[] = [];
    room.onMessage("inv", (m: InvMsg) => invs.push(m));
    room.onMessage("wallet", (m: WalletMsg) => wallets.push(m));
    room.onMessage("travelTo", (m: TravelToMsg) => travelTos.push(m));
    room.onMessage("skills", (m: SkillsMsg) => skillsMsgs.push(m));
    await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
    return {
      room,
      client,
      invs,
      wallets,
      travelTos,
      skillsMsgs,
      me: () => (room.state as any).players.get(room.sessionId),
    };
  }

  it("vòng khứ hồi sáu chặng bốn bản đồ: tu vi, Linh thạch, túi đồ, sổ nhiệm vụ, sổ chiêu nguyên vẹn SAU MỖI lần qua cổng (đĩa và đang chơi)", async () => {
    const name = `Bot4M ${++nameSeq}`;
    await seed(name, DEFAULT_MAP_ID);
    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    await expectIntact(cur, name, DEFAULT_MAP_ID);
    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_bac"],
      [HAN_VAN_ID, "han_van_nam"],
      [AM_SUONG_ID, "am_suong_nam"],
      [HAC_PHONG_ID, "hac_phong_nam"],
    ];
    for (const [fromMapId, portalId] of route) {
      cur = await hop(cur, name, fromMapId, portalId);
      await expectIntact(cur, name, `sau ${portalId}`);
    }
  }, 45_000);

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

  it("rớt mạng ở Hàn Vân Lĩnh rồi nối lại trong thời gian chờ: vẫn ở Hàn Vân Lĩnh, dữ liệu nguyên, vẫn qua cổng về Âm Sương được", async () => {
    const name = `BotRM HV ${++nameSeq}`;
    await seed(name, HAN_VAN_ID, "han_van_nam");
    const first = await joinRoom(name, secretOf(name), HAN_VAN_ID);
    await expectIntact(first, name, "vào Hàn Vân Lĩnh");
    const sid = first.room.sessionId;

    const again = await dropAndReconnect(first);
    expect(again.room.sessionId).toBe(sid);
    expect(serverRoom(again.room).mapId).toBe(HAN_VAN_ID);
    await expectIntact(again, name, "sau khi nối lại");
    const sr = serverRoom(again.room);
    const same = [...sr.state.players.values()].filter((p: any) => p.name === name);
    expect(same.length).toBe(1);
    expect(sr.ghosts.has(sid)).toBe(false);

    // Nối lại xong vẫn qua cổng bình thường về Âm Sương và dữ liệu theo sang bản đồ đích
    const next = await hop(again, name, HAN_VAN_ID, "han_van_nam");
    await expectIntact(next, name, "qua cổng về Âm Sương sau khi nối lại");
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

  it("rớt mạng ở Hàn Vân Lĩnh rồi ĐĂNG NHẬP LẠI (mất token): huỷ chờ, vào lại đúng phòng, một nhân vật, dữ liệu nguyên", async () => {
    const name = `BotNL HV ${++nameSeq}`;
    await seed(name, HAN_VAN_ID, "han_van_nam");
    const first = await joinRoom(name, secretOf(name), HAN_VAN_ID);
    const sr = serverRoom(first.room);
    const sid = first.room.sessionId;
    (first.room.connection.transport as any).ws.close();
    await waitFor(() => sr.ghosts.has(sid));

    const second = await joinRoom(name, secretOf(name), HAN_VAN_ID);
    expect(sr.ghosts.has(sid)).toBe(false);
    expect([...sr.state.players.values()].filter((p: any) => p.name === name).length).toBe(1);
    await expectIntact(second, name, "đăng nhập lại ở Hàn Vân");
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

  it("hai tab cùng mã nhân vật ở Hàn Vân Lĩnh: tab thứ hai bị từ chối 409, tab đầu không bị ảnh hưởng", async () => {
    const name = `BotTab HV ${++nameSeq}`;
    await seed(name, HAN_VAN_ID, "han_van_nam");
    const a = await joinRoom(name, secretOf(name), HAN_VAN_ID);
    let err: any = null;
    try {
      rooms.push(
        await new Client(`ws://localhost:${PORT}`).joinOrCreate(roomNameOf(HAN_VAN_ID), {
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
    await expectIntact(a, name, "tab đầu sau khi tab hai bị từ chối ở Hàn Vân");
  }, 30_000);

  it.each([
    {
      label: "Hắc Phong <-> Âm Sương",
      fromMapId: HAC_PHONG_ID,
      portalId: "hac_phong_bac",
      targetMapId: AM_SUONG_ID,
    },
    {
      label: "Âm Sương <-> Hàn Vân",
      fromMapId: AM_SUONG_ID,
      portalId: "am_suong_bac",
      targetMapId: HAN_VAN_ID,
    },
  ])(
    "hai tab đua nhau lúc qua cổng ($label): tab hai không vào được phòng cũ (409 hoặc wrong_map), chỉ vào được phòng đích, đĩa không bị đè lại",
    async ({ fromMapId, portalId, targetMapId }) => {
      const name = `BotDua ${++nameSeq}`;
      await seed(name, fromMapId, portalId);
      const a = await joinRoom(name, secretOf(name), fromMapId);
      const portal = getMap(fromMapId)!.portal(portalId)!;
      standAt(a.room, portal);
      serverRoom(a.room).world.ctrl.get(a.room.sessionId).save.travelAt = 0;

      // Tab A qua cổng ĐỒNG THỜI với tab B vào lại phòng cũ bằng cùng mã nhân vật
      const joinOld = new Client(`ws://localhost:${PORT}`)
        .joinOrCreate(roomNameOf(fromMapId), { name, secret: secretOf(name) })
        .then(
          (r) => {
            rooms.push(r);
            return { ok: true as const, err: null };
          },
          (err: any) => ({ ok: false as const, err }),
        );
      a.room.send("travel", { portalId } satisfies TravelMsg);
      const res = await joinOld;
      expect(res.ok, "không được có hai nhân vật cùng tên ở phòng cũ").toBe(false);
      const code = res.err?.code;
      const wrong = parseWrongMap(code, res.err?.message ?? "");
      expect(
        code === 409 || wrong === targetMapId,
        `lỗi bất ngờ: ${code} ${res.err?.message}`,
      ).toBe(true);

      await waitFor(() => a.travelTos.length > 0);
      await waitFor(() => !a.room.connection.isOpen);
      const b = await joinRoom(name, secretOf(name), portal.toMap);
      await expectIntact(b, name, `tab hai ở phòng đích ${targetMapId}`);
      // Lưu muộn của phòng cũ không được đè bản ghi mới (savePlayer xếp hàng theo tệp)
      await sleep(500);
      expect(fileOf(name).mapId).toBe(portal.toMap);
      expect(
        [...serverRoom(b.room).state.players.values()].filter((p: any) => p.name === name).length,
      ).toBe(1);
    },
    30_000,
  );

  it.each([
    {
      label: "Hắc Phong <-> Âm Sương",
      fromMapId: HAC_PHONG_ID,
      portalId: "hac_phong_bac",
    },
    {
      label: "Âm Sương <-> Hàn Vân",
      fromMapId: AM_SUONG_ID,
      portalId: "am_suong_bac",
    },
  ])(
    "lưu định kỳ chạy ĐÚNG lúc đang qua cổng ($label) không đè bản ghi đích (chốt `travelling` của persist)",
    async ({ fromMapId, portalId }) => {
      const name = `BotDK ${++nameSeq}`;
      await seed(name, fromMapId, portalId);
      const a = await joinRoom(name, secretOf(name), fromMapId);
      const portal = getMap(fromMapId)!.portal(portalId)!;
      standAt(a.room, portal);
      const sr = serverRoom(a.room);
      const sid = a.room.sessionId;
      const p = sr.state.players.get(sid);
      const c = sr.world.ctrl.get(sid);
      c.save.travelAt = 0;
      a.room.send("travel", { portalId } satisfies TravelMsg);
      await waitFor(() => c.travelling);
      // Lưu định kỳ / lúc rớt mạng chạy sau khi đã bắt đầu qua cổng: phải bị bỏ qua, không ghi lại bản đồ cũ
      await sr.persist(p, c);
      await waitFor(() => a.travelTos.length > 0);
      await waitFor(() => !a.room.connection.isOpen);
      await sleep(200);
      expect(fileOf(name).mapId).toBe(portal.toMap);
      const b = await joinRoom(name, secretOf(name), portal.toMap);
      await expectIntact(b, name, "đích sau lưu định kỳ chen ngang");
    },
    30_000,
  );

  it("thử tải đồng thời (concurrency stress): 4 bot cùng qua cổng Âm Sương <-> Hàn Vân đồng thời, không lỗi, kiem-save 0 lỗi", async () => {
    const BOTS_COUNT = 4;
    const botNames = Array.from({ length: BOTS_COUNT }, (_, i) => `BotCC ${++nameSeq} ${i}`);

    const configs = [
      { mapId: AM_SUONG_ID, portalId: "am_suong_bac", targetMapId: HAN_VAN_ID },
      { mapId: AM_SUONG_ID, portalId: "am_suong_bac", targetMapId: HAN_VAN_ID },
      { mapId: HAN_VAN_ID, portalId: "han_van_nam", targetMapId: AM_SUONG_ID },
      { mapId: HAN_VAN_ID, portalId: "han_van_nam", targetMapId: AM_SUONG_ID },
    ];

    const conns: Conn[] = [];
    for (let i = 0; i < BOTS_COUNT; i++) {
      const name = botNames[i];
      const cfg = configs[i];
      await seed(name, cfg.mapId, cfg.portalId);
      const conn = await joinRoom(name, secretOf(name), cfg.mapId);
      conns.push(conn);
    }

    // Đặt bot tại cổng và xóa travelAt
    for (let i = 0; i < BOTS_COUNT; i++) {
      const conn = conns[i];
      const cfg = configs[i];
      const portal = getMap(cfg.mapId)!.portal(cfg.portalId)!;
      standAt(conn.room, portal);
      serverRoom(conn.room).world.ctrl.get(conn.room.sessionId).save.travelAt = 0;
    }

    // Gửi travel đồng thời
    for (let i = 0; i < BOTS_COUNT; i++) {
      conns[i].room.send("travel", { portalId: configs[i].portalId } satisfies TravelMsg);
    }

    // Chờ nhận travelTo và đóng phòng cũ
    await Promise.all(
      conns.map(async (conn, i) => {
        const targetMapId = configs[i].targetMapId;
        await waitFor(() => conn.travelTos.find((m) => m.mapId === targetMapId), 8000);
        await waitFor(() => !conn.room.connection.isOpen, 8000);
      }),
    );

    // Kết nối vào phòng đích đồng thời
    await Promise.all(
      conns.map(async (conn, i) => {
        const name = botNames[i];
        const targetMapId = configs[i].targetMapId;
        const next = await joinRoom(name, secretOf(name), targetMapId);
        expect(serverRoom(next.room).mapId).toBe(targetMapId);
        expect(fileOf(name).mapId).toBe(targetMapId);
        await expectIntact(next, name, `concurrency đích ${targetMapId}`);
        return next;
      }),
    );

    // Kiểm toán toàn vẹn thư mục lưu
    const auditRes = auditSavesDirectory(dataDir);
    expect(
      auditRes.errorFiles,
      `kiem-save sau bão chuyển cổng: ${JSON.stringify(auditRes.failedFiles)}`,
    ).toBe(0);
    expect(auditRes.failedFiles.length).toBe(0);
  }, 40_000);

  it("chuỗi qua cổng 4 bản đồ từ tệp lưu CŨ thiếu skills (trước M7): tự khởi tạo sổ chiêu rỗng, không mất dữ liệu, kiem-save 0 lỗi", async () => {
    const name = `Bot OldM6 ${++nameSeq}`;
    // Tệp lưu trước M7: hoàn toàn không có trường `skills`, xuất phát ở Lạc Hà
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
      mapId: DEFAULT_MAP_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    const emptySkills = emptySkillBook();
    // Tệp cũ trên đĩa lúc mới vào chưa có skills; client nhận skills rỗng từ server
    expect(fileOf(name).skills).toBeUndefined();
    await waitFor(() => cur.skillsMsgs.length > 0);
    expect(cur.skillsMsgs.at(-1)!.learned).toEqual({});
    expect(cur.skillsMsgs.at(-1)!.slots).toEqual(["", "", "", ""]);

    // Đi trọn chuỗi 4 bản đồ: Lạc Hà -> Hắc Phong -> Âm Sương -> Hàn Vân
    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_bac"],
    ];
    for (const [fromMapId, portalId] of route) {
      cur = await hop(cur, name, fromMapId, portalId);
      await expectIntact(cur, name, `tệp cũ sau ${portalId}`, emptySkills);
    }

    // Kiểm toán thư mục dữ liệu sau khi tệp cũ chuyển qua 4 bản đồ
    const auditRes = auditSavesDirectory(dataDir);
    expect(
      auditRes.errorFiles,
      `kiem-save sau chuỗi 4 bản đồ tệp cũ: ${JSON.stringify(auditRes.failedFiles)}`,
    ).toBe(0);
    expect(auditRes.failedFiles.length).toBe(0);
  }, 45_000);

  it("tệp lưu CŨ chỉ có 12 chiêu đợt 1 và tệp Nguyên Anh có đủ 18 chiêu (#654/#722) qua cổng Âm Sương <-> Hàn Vân: giữ nguyên sổ chiêu, kiem-save 0 lỗi", async () => {
    expect(SKILLS_M7.length).toBe(18);
    // 1. Nhân vật tệp lưu cũ chỉ có 12 chiêu đợt 1 (thiếu 6 chiêu Nguyên Anh đợt 2)
    const old12Book: SkillBook = {
      learned: Object.fromEntries(SKILLS_M7.slice(0, 12).map((s) => [s.id, 2])),
      slots: ["hoa_van_kiem", "thanh_tung_phi_cham", "cuu_cung_khon_sat", ""],
    };
    const nameOld = `Bot Old12 ${++nameSeq}`;
    const spawnAs = getMap(AM_SUONG_ID)!.portal("am_suong_bac")!.spawn;
    await savePlayer({
      name: nameOld,
      secretHash: hashSecret(secretOf(nameOld)),
      realm: 3,
      tier: 2,
      exp: EXP,
      coin: COIN,
      inventory,
      quests,
      equipment,
      lifeId: LIFE_ID,
      skills: old12Book,
      mapId: AM_SUONG_ID,
      x: spawnAs.x,
      y: spawnAs.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    let curOld = await joinRoom(nameOld, secretOf(nameOld), AM_SUONG_ID);
    curOld = await hop(curOld, nameOld, AM_SUONG_ID, "am_suong_bac");
    expect(fileOf(nameOld).skills).toEqual(old12Book);
    await waitFor(() => curOld.skillsMsgs.length > 0);
    expect(curOld.skillsMsgs.at(-1)!.learned).toEqual(old12Book.learned);
    expect(curOld.skillsMsgs.at(-1)!.slots).toEqual(old12Book.slots);

    // 2. Nhân vật Nguyên Anh có đủ 18 chiêu (gắn 4 chiêu Nguyên Anh đợt 2 vào ô 2..5)
    const all18Book: SkillBook = {
      learned: Object.fromEntries(SKILLS_M7.map((s) => [s.id, 3])),
      slots: ["han_quang_tien", "bach_kim_trao", "van_thach_tran", "liet_hoa_kiem"],
    };
    const nameNa = `Bot Full18 ${++nameSeq}`;
    const spawnHv = getMap(HAN_VAN_ID)!.portal("han_van_nam")!.spawn;
    await savePlayer({
      name: nameNa,
      secretHash: hashSecret(secretOf(nameNa)),
      realm: 4,
      tier: 2,
      exp: EXP,
      coin: COIN,
      inventory,
      quests,
      equipment,
      lifeId: LIFE_ID,
      skills: all18Book,
      mapId: HAN_VAN_ID,
      x: spawnHv.x,
      y: spawnHv.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    let curNa = await joinRoom(nameNa, secretOf(nameNa), HAN_VAN_ID);
    curNa = await hop(curNa, nameNa, HAN_VAN_ID, "han_van_nam");
    expect(fileOf(nameNa).skills).toEqual(all18Book);
    await waitFor(() => curNa.skillsMsgs.length > 0);
    expect(curNa.skillsMsgs.at(-1)!.learned).toEqual(all18Book.learned);
    expect(curNa.skillsMsgs.at(-1)!.slots).toEqual(all18Book.slots);

    const auditRes = auditSavesDirectory(dataDir);
    expect(
      auditRes.errorFiles,
      `kiem-save 12/18 chiêu: ${JSON.stringify(auditRes.failedFiles)}`,
    ).toBe(0);
  }, 45_000);

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
        skills,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...extra,
      });
      for (const wrong of [HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID]) {
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
      await expectIntact(ok, name, label, null);
      // Qua cổng từ tệp cũ cũng chạy bình thường (ghi mapId đích đúng)
      const next = await hop(ok, name, DEFAULT_MAP_ID, "lac_ha_bac");
      await expectIntact(next, name, `${label}: sau khi qua cổng`, null);
    }
  }, 30_000);
});

describe("Sáu bản đồ: Lạc Hà <-> Hắc Phong <-> Âm Sương <-> Hàn Vân <-> Lang Hoang <-> Uy Vân Kinh (Mục 75, #1470)", () => {
  it("đi hết một vòng khứ hồi mười chặng sáu bản đồ: tới đúng chỗ xuất hiện, khu an toàn, giữ tu vi / đồ, kiem-save 0 lỗi", async () => {
    const name = `Bot6M ${++nameSeq}`;
    expect(name.length).toBeLessThanOrEqual(16);
    let cur = await joinRoom(name, secretOf(name), DEFAULT_MAP_ID);
    cur.room.send("chat", { text: "/give nanh_soi 5" });
    await waitFor(() => cur.invs.some((m) => m.gained));
    serverRoom(cur.room).state.players.get(cur.room.sessionId)!.exp = 42;

    const route: [string, string][] = [
      [DEFAULT_MAP_ID, "lac_ha_bac"],
      [HAC_PHONG_ID, "hac_phong_bac"],
      [AM_SUONG_ID, "am_suong_bac"],
      [HAN_VAN_ID, "han_van_bac"],
      [LANG_HOANG_ID, "lang_hoang_bac"],
      [UY_VAN_ID, "uy_van_nam"],
      [LANG_HOANG_ID, "lang_hoang_nam"],
      [HAN_VAN_ID, "han_van_nam"],
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
      HAN_VAN_ID,
      LANG_HOANG_ID,
      UY_VAN_ID,
      LANG_HOANG_ID,
      HAN_VAN_ID,
      AM_SUONG_ID,
      HAC_PHONG_ID,
      DEFAULT_MAP_ID,
    ]);

    const saved = fileOf(name);
    expect(saved.mapId).toBe(DEFAULT_MAP_ID);
    expect(saved.exp).toBe(42);
    expect(saved.inventory?.find((s: any) => s?.itemId === "nanh_soi")?.qty).toBe(5);
    expect(cur.me().exp).toBe(42);

    const auditRes = auditSavesDirectory(dataDir);
    expect(auditRes.errorFiles, `kiem-save 6 bản đồ: ${JSON.stringify(auditRes.failedFiles)}`).toBe(
      0,
    );
  }, 60_000);

  it("nhân vật lưu ở Lang Hoang: các phòng khác trả wrong_map:lang_hoang, phòng Lang Hoang nhận và không quái", async () => {
    const name = `BotLH ${++nameSeq}`;
    expect(name.length).toBeLessThanOrEqual(16);
    const to = getMap(HAN_VAN_ID)!.portal("han_van_bac")!;
    const spawn = getMap(to.toMap)!.portal(to.toPortal)!.spawn;
    await savePlayer({
      name,
      secretHash: hashSecret(secretOf(name)),
      realm: 5,
      tier: 0,
      exp: 0,
      mapId: LANG_HOANG_ID,
      x: spawn.x,
      y: spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const wrong of [DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID, UY_VAN_ID]) {
      const client = new Client(`ws://localhost:${PORT}`);
      let err: any = null;
      try {
        rooms.push(await client.joinOrCreate(roomNameOf(wrong), { name, secret: secretOf(name) }));
      } catch (e: any) {
        err = e;
      }
      expect(err, `vào nhầm ${wrong}`).not.toBeNull();
      expect(parseWrongMap(err.code, err.message)).toBe(LANG_HOANG_ID);
    }
    const ok = await joinRoom(name, secretOf(name), LANG_HOANG_ID);
    const sr = serverRoom(ok.room);
    expect(sr.mapId).toBe(LANG_HOANG_ID);
    expect(sr.state.monsters.size).toBe(64); // `monsterCap` Lang Hoang: sáu loài sói Hóa Thần (62) + hai trùm (D1 #1466 lát A3 / B)
    expect(ok.me().x).toBeCloseTo(spawn.x, 0);
    expect(ok.me().y).toBeCloseTo(spawn.y, 0);
  }, 35_000);

  it("nhân vật lưu ở Uy Vân Kinh: các phòng khác trả wrong_map:uy_van, phòng Uy Vân Kinh nhận và không quái", async () => {
    const name = `BotUV ${++nameSeq}`;
    expect(name.length).toBeLessThanOrEqual(16);
    const to = getMap(LANG_HOANG_ID)!.portal("lang_hoang_bac")!;
    const spawn = getMap(to.toMap)!.portal(to.toPortal)!.spawn;
    await savePlayer({
      name,
      secretHash: hashSecret(secretOf(name)),
      realm: 5,
      tier: 0,
      exp: 0,
      mapId: UY_VAN_ID,
      x: spawn.x,
      y: spawn.y,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    for (const wrong of [DEFAULT_MAP_ID, HAC_PHONG_ID, AM_SUONG_ID, HAN_VAN_ID, LANG_HOANG_ID]) {
      const client = new Client(`ws://localhost:${PORT}`);
      let err: any = null;
      try {
        rooms.push(await client.joinOrCreate(roomNameOf(wrong), { name, secret: secretOf(name) }));
      } catch (e: any) {
        err = e;
      }
      expect(err, `vào nhầm ${wrong}`).not.toBeNull();
      expect(parseWrongMap(err.code, err.message)).toBe(UY_VAN_ID);
    }
    const ok = await joinRoom(name, secretOf(name), UY_VAN_ID);
    const sr = serverRoom(ok.room);
    expect(sr.mapId).toBe(UY_VAN_ID);
    expect(sr.state.monsters.size).toBe(0); // monsterCap rỗng
    expect(ok.me().x).toBeCloseTo(spawn.x, 0);
    expect(ok.me().y).toBeCloseTo(spawn.y, 0);
  }, 35_000);

  it("mục 75 / #1470: đo RAM khi chạy đồng thời 6 phòng bản đồ thường (Lạc Hà -> Uy Vân Kinh): mỗi phòng < 10 MB heap", async () => {
    if (global.gc) global.gc();
    const m0 = process.memoryUsage();

    const roomNames = [
      roomNameOf(DEFAULT_MAP_ID),
      roomNameOf(HAC_PHONG_ID),
      roomNameOf(AM_SUONG_ID),
      roomNameOf(HAN_VAN_ID),
      roomNameOf(LANG_HOANG_ID),
      roomNameOf(UY_VAN_ID),
    ];

    const created: any[] = [];
    for (const name of roomNames) {
      const r = await matchMaker.createRoom(name, {});
      created.push(r);
    }

    if (global.gc) global.gc();
    const m1 = process.memoryUsage();

    const heapPerRoomMb = (m1.heapUsed - m0.heapUsed) / roomNames.length / 1024 / 1024;
    expect(created.length).toBe(6);
    expect(heapPerRoomMb).toBeLessThan(10); // Ngân sách < 10 MB heap/phòng
  });
});
