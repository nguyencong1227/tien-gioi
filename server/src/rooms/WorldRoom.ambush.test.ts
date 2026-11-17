// Gặp chặn đường trên máy chủ Colyseus THẬT (mục 52, CD2 #1062 lát 2): `AMBUSH=on`, bảng cảnh + bầy nhỏ tiêm vào phòng (dữ liệu thật của `shared/` còn RỖNG), xúc xắc tiêm `random` = 0.
// Kiểm chứng ĐƯỜNG ĐI QUA MẠNG: người chơi nhận `ambushOffer` đúng nội dung; `ambushChoose` bỏ chạy trừ ĐÚNG giá chốt, hồ sơ đã LƯU trước khi nhận `ambushEnd`; không xác nhận thì HUỶ
// không phạt; rớt socket giữa hộp thoại thì ĐÓNG BĂNG và nối lại nhận LẠI cùng id; thoát chủ động = bỏ chạy bằng tu vi và hồ sơ ghi mức tu vi đã trừ; `v` cũ không bị chặn; tin rác không làm gì.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  AMBUSH_ARM_MS,
  AMBUSH_MIN_PROTOCOL,
  AMBUSH_MSG,
  AMBUSH_SEEN_MS,
  DEFAULT_MAP_ID,
  PROTOCOL_VERSION,
  roomNameOf,
  type AmbushEndMsg,
  type AmbushFoeGroup,
  type AmbushOfferMsg,
  type AmbushScene,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";
import { listenWithRetry } from "../test-port";
import { ambushOf, createAmbushRuntime, rollAmbush } from "../systems/ambush";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-ambush-room-"));

let PORT = 0;
let server: Server;
let loadPlayer: typeof import("../store").loadPlayer;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  process.env.AMBUSH = "on"; // bật chặn đường trên máy chủ thật
  const mod = await import("./WorldRoom");
  ({ loadPlayer } = await import("../store"));
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  delete process.env.AMBUSH;
  await server.gracefullyShutdown(false);
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
    if (Date.now() > end) throw new Error(`Hết thời gian chờ: ${what}`);
    await sleep(20);
  }
}

let seq = 0;
const secretOf = (name: string) => `secret-${name.replace(/\s/g, "")}-0123456789abcdef`;
const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
const serverState = (room: Room) => serverRoom(room).state as WorldState;
const worldOf = (room: Room) => (serverRoom(room) as any).world;

const SCENE: AmbushScene = {
  id: "canh_thu",
  text: "Đường qua {dia_danh} bỗng vắng hẳn, {ke_dich} lao ra chắn trước mặt.",
  mapIds: [DEFAULT_MAP_ID],
  tiers: ["normal"],
  source: "test",
};
const FOE: AmbushFoeGroup = {
  id: "bay_thuong",
  name: "Sói Hoang",
  mapId: DEFAULT_MAP_ID,
  minStep: 0,
  maxStep: 100,
  tier: "normal",
  foes: [{ kind: "tho", count: 2 }],
};

interface Hero {
  name: string;
  room: Room;
  offers: AmbushOfferMsg[];
  ends: AmbushEndMsg[];
  token: string;
}

function listen(room: Room, h: Hero) {
  room.onMessage(AMBUSH_MSG.offer, (m: AmbushOfferMsg) => h.offers.push(m));
  room.onMessage(AMBUSH_MSG.end, (m: AmbushEndMsg) => h.ends.push(m));
  for (const t of [
    "chat",
    "toast",
    "fx",
    "dmg",
    "party",
    "partyInvited",
    "dialog",
    "inv",
    "wallet",
    "quests",
    "skills",
    "status",
    "sect",
    "sectVault",
    "sectPresence",
  ])
    room.onMessage(t, () => {});
}

async function spawn(prefix: string, v: number = PROTOCOL_VERSION): Promise<Hero> {
  const name = `${prefix} ${++seq}`;
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    v,
    name,
    secret: secretOf(name),
  });
  const h: Hero = { name, room, offers: [], ends: [], token: room.reconnectionToken };
  listen(room, h);
  rooms.push(room);
  await waitFor(
    () => (room.state as any)?.players?.get(room.sessionId),
    4000,
    "player state đồng bộ",
  );
  return h;
}

/** Chuẩn bị người chơi để bị chặn được ngay: bảng cảnh + bầy nhỏ, xúc xắc luôn trúng, hết hồi, đứng ngoài trấn, đủ máu, có tu vi + Linh thạch. */
function prime(h: Hero, opts: { coin?: number; exp?: number } = {}) {
  const w = worldOf(h.room);
  w.ambush = createAmbushRuntime({ random: () => 0, scenes: [SCENE], foes: [FOE] });
  const sid = h.room.sessionId;
  const p = serverState(h.room).players.get(sid)!;
  const c = w.ctrl.get(sid);
  p.x = w.map.townPx.x + w.map.townPx.r + 600;
  p.y = w.map.townPx.y;
  p.hp = p.maxHp;
  p.exp = opts.exp ?? 400;
  p.expMax = 1000;
  c.coin = opts.coin ?? 5000;
  ambushOf(w, c).cooldownUntil = 0;
  c.lastHitAt = 0;
  return { w, sid, p, c };
}

describe("Gặp chặn đường qua mạng (máy chủ Colyseus thật, AMBUSH=on)", () => {
  it("ambushOffer đến đúng người, đúng nội dung; ambushSeen + ambushChoose flee_coin: trừ đúng giá chốt, hồ sơ ĐÃ lưu khi ambushEnd tới", async () => {
    const h = await spawn("Bo Chay");
    const { w, sid, c } = prime(h);
    expect(rollAmbush(w, sid, serverState(h.room).players.get(sid)!, c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    expect(offer.id).toMatch(/^[a-f0-9]{16}$/);
    expect(offer.scene).toBe(
      `Đường qua ${w.map.wildName} bỗng vắng hẳn, Sói Hoang lao ra chắn trước mặt.`,
    );
    expect(offer.foe).toEqual({ name: "Sói Hoang", tier: "normal", count: 2 });
    expect(offer.price.coin.enough).toBe(true);
    expect(offer.ms).toBeGreaterThan(9000);

    h.room.send(AMBUSH_MSG.seen, { id: offer.id });
    await sleep(AMBUSH_ARM_MS + 80); // qua thời gian "mở khoá" (đến sớm hơn bị bỏ qua)
    h.room.send(AMBUSH_MSG.choose, { id: offer.id, choice: "flee_coin" });
    const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd");
    expect(end).toEqual({ result: "fled", paid: { coin: offer.price.coin.price } });
    expect(c.coin).toBe(5000 - offer.price.coin.price);
    // ambushEnd chỉ gửi SAU khi hồ sơ lưu xong: đọc lại từ đĩa phải thấy đúng số dư mới và mốc hồi
    const saved = await loadPlayer(h.name);
    expect(saved?.coin).toBe(5000 - offer.price.coin.price);
    expect(saved?.ambushUntil).toBeGreaterThan(Date.now());
    expect(saved?.ambushDaily?.n).toBe(1);
    expect(w.shielded.has(sid)).toBe(false);
  }, 15_000);

  it("không xác nhận đã thấy: sau AMBUSH_SEEN_MS bị HUỶ lặng lẽ (canceled), không mất gì, vào hồi", async () => {
    const h = await spawn("Vang Mat");
    const { w, sid, p, c } = prime(h);
    expect(rollAmbush(w, sid, p, c)).toBe(true);
    await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    const end = await waitFor(() => h.ends[0], AMBUSH_SEEN_MS + 3000, "nhận ambushEnd canceled");
    expect(end).toEqual({ result: "canceled" });
    expect(c.coin).toBe(5000);
    expect(p.exp).toBe(400);
    expect(c.ambush.offer).toBeUndefined();
    expect(c.ambush.cooldownUntil).toBeGreaterThan(w.now);
  }, 15_000);

  it("có ambushSeen thì quá AMBUSH_SEEN_MS hộp thoại VẪN mở (không bị huỷ); còn chọn được sau đó", async () => {
    const h = await spawn("Da Thay");
    const { w, sid, p, c } = prime(h);
    expect(rollAmbush(w, sid, p, c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    h.room.send(AMBUSH_MSG.seen, { id: offer.id });
    await sleep(AMBUSH_SEEN_MS + 700);
    expect(c.ambush.offer?.id).toBe(offer.id);
    expect(h.ends).toHaveLength(0);
    h.room.send(AMBUSH_MSG.choose, { id: offer.id, choice: "flee_coin" });
    const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd");
    expect(end.result).toBe("fled");
  }, 15_000);

  it("client cũ (v < AMBUSH_MIN_PROTOCOL) KHÔNG bao giờ bị chặn (không có hộp thoại để trả lời)", async () => {
    const h = await spawn("Client Cu", AMBUSH_MIN_PROTOCOL - 1);
    const { w, sid, p, c } = prime(h);
    expect(c.proto).toBe(AMBUSH_MIN_PROTOCOL - 1);
    expect(rollAmbush(w, sid, p, c)).toBe(false);
    await sleep(200);
    expect(h.offers).toHaveLength(0);
  }, 10_000);

  it("tin rác / id sai / giá do client tự khai: bỏ qua, ví và tu vi giữ nguyên, hộp thoại còn nguyên", async () => {
    const h = await spawn("Tin Rac");
    const { w, sid, p, c } = prime(h);
    expect(rollAmbush(w, sid, p, c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    await sleep(AMBUSH_ARM_MS + 80);
    // Ít tin rác thôi: `ambushChoose` có giới hạn tần suất (burst 4), gửi nhiều hơn thì tin hợp lệ phía sau cũng bị bỏ
    for (const bad of [
      { id: "0".repeat(16), choice: "flee_coin" },
      { id: offer.id, choice: "flee_all" },
      "flee_coin",
    ] as unknown[])
      h.room.send(AMBUSH_MSG.choose, bad);
    await sleep(1100); // đủ cho thùng giới hạn tần suất hồi lại
    expect(c.coin).toBe(5000);
    expect(p.exp).toBe(400);
    expect(c.ambush.offer?.id).toBe(offer.id);
    expect(h.ends).toHaveLength(0);
    // trường lạ do client khai bị bỏ: trừ ĐÚNG giá chốt, không phải số client gửi
    h.room.send(AMBUSH_MSG.choose, {
      id: offer.id,
      choice: "flee_coin",
      price: 1,
      coin: 0,
    });
    const end = await waitFor(() => h.ends[0], 3000, "nhận ambushEnd");
    expect(end.paid).toEqual({ coin: offer.price.coin.price });
    expect(c.coin).toBe(5000 - offer.price.coin.price);
  }, 15_000);

  it("rớt socket giữa hộp thoại: ĐÓNG BĂNG đồng hồ; nối lại nhận LẠI cùng id với thời gian còn lại; bỏ chạy sau nối lại vẫn trừ đúng", async () => {
    const h = await spawn("Rot Mang");
    const { w, sid, p, c } = prime(h);
    expect(rollAmbush(w, sid, p, c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    h.room.send(AMBUSH_MSG.seen, { id: offer.id });
    await sleep(100);
    const endsAt0 = c.ambush.offer.endsAt;
    (h.room.connection.transport as any).ws.close();
    await waitFor(() => !h.room.connection.isOpen);
    await waitFor(() => (serverRoom(h.room) as any).ghosts.has(sid), 3000, "thành hồn lìa xác");
    await sleep(1200); // trong lúc rớt, đồng hồ hộp thoại không chạy: hạn dời tiến theo thời gian rớt
    expect(c.ambush.offer).toBeDefined();
    expect(c.ambush.offer.endsAt).toBeGreaterThan(endsAt0 + 800);

    const client = new Client(`ws://localhost:${PORT}`);
    const r2 = await client.reconnect(h.room.reconnectionToken);
    const h2: Hero = { name: h.name, room: r2, offers: [], ends: [], token: "" };
    listen(r2, h2);
    rooms.push(r2);
    const again = await waitFor(() => h2.offers[0], 4000, "nhận LẠI ambushOffer sau nối lại");
    expect(again.id).toBe(offer.id); // CÙNG id: client coi là cập nhật, không dựng lại
    expect(again.ms).toBeGreaterThan(8000); // thời gian còn lại THẬT, không bị trừ lúc rớt

    await sleep(AMBUSH_ARM_MS);
    r2.send(AMBUSH_MSG.choose, { id: offer.id, choice: "flee_coin" });
    const end = await waitFor(() => h2.ends[0], 3000, "nhận ambushEnd sau nối lại");
    expect(end).toEqual({ result: "fled", paid: { coin: offer.price.coin.price } });
    expect(c.coin).toBe(5000 - offer.price.coin.price);
  }, 20_000);

  it("thoát chủ động lúc hộp thoại mở = bỏ chạy bằng tu vi giá hộp thoại; hồ sơ ghi tu vi đã trừ (không né giá bằng cách thoát)", async () => {
    const h = await spawn("Thoat");
    const { w, sid, p, c } = prime(h);
    expect(rollAmbush(w, sid, p, c)).toBe(true);
    const offer = await waitFor(() => h.offers[0], 3000, "nhận ambushOffer");
    expect(offer.price.exp).toBeGreaterThan(0);
    await h.room.leave(true);
    rooms.splice(rooms.indexOf(h.room), 1);
    await waitFor(() => !w.ctrl.has(sid), 4000, "rời phòng");
    const file = await loadPlayer(h.name);
    expect(file?.exp).toBe(400 - offer.price.exp);
    expect(file?.coin).toBe(5000); // bỏ chạy bằng TU VI: Linh thạch giữ nguyên
    expect(file?.ambushUntil).toBeGreaterThan(Date.now());
    expect(w.ambush.open.size).toBe(0);
  }, 15_000);
});
