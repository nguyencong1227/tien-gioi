// Test tích hợp: chạy server Colyseus thật trong tiến trình, kết nối bằng colyseus.js như client thật.
// Dùng để đảm bảo hành vi không đổi khi tách / sửa logic server.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, getStateCallbacks, type Room } from "colyseus.js";
import {
  ROOM_NAME,
  COIN_CAP,
  COIN_DROPS,
  MONSTER_CAP,
  TOWN_PX,
  SKILLS,
  expToNext,
  statsFor,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type WalletMsg,
  type QuestsMsg,
  type DialogMsg,
  type PartyMsg,
  type PartyInvitedMsg,
  type LimboMsg,
  type SoulMsg,
  type RebornMsg,
  PARTY_INVITE_TTL_MS,
  PARTY_SNAPSHOT_MS,
  NPC_BY_ID,
  QUEST_BY_ID,
  buyPrice,
  sellPrice,
  DEFAULT_MAP_ID,
  HAC_PHONG_ID,
  JOIN_WRONG_MAP,
  MAPS,
  getMap,
  parseWrongMap,
  roomNameOf,
  TRAVEL_COOLDOWN_MS,
  type TravelToMsg,
} from "@tien-gioi/shared";
import { changeCoin } from "../systems/wallet";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-test-"));
const PORT = 41000 + Math.floor(Math.random() * 5000);
let server: Server;
let WorldRoomClass: typeof WorldRoom;
let defaultGraceS = 20;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
  const { WorldRoom, defineRooms } = await import("./WorldRoom");
  WorldRoomClass = WorldRoom;
  defaultGraceS = WorldRoom.reconnectGraceS;
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
/** Đủ lâu để thấy nhân vật KHÔNG hồi sinh theo đồng hồ (RESPAWN_MS cũ là 5 giây): kiểm ngắn, đồng hồ giả ở test đơn vị lo phần còn lại */
const RESPAWN_MS_TEST = 1200;

async function waitFor<T>(fn: () => T | undefined | false, ms = 3000): Promise<T> {
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

async function join(name = `Thu ${++nameSeq}`, secret = secretOf(name), mapId = DEFAULT_MAP_ID) {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(mapId), { name, secret });
  const chat: ChatOut[] = [];
  const toasts: ToastMsg[] = [];
  const invs: InvMsg[] = [];
  room.onMessage("inv", (m: InvMsg) => invs.push(m));
  const wallets: WalletMsg[] = [];
  room.onMessage("wallet", (m: WalletMsg) => wallets.push(m));
  const quests: QuestsMsg[] = [];
  const dialogs: DialogMsg[] = [];
  const limbos: LimboMsg[] = [];
  const souls: SoulMsg[] = [];
  const reborns: RebornMsg[] = [];
  room.onMessage("limbo", (m: LimboMsg) => limbos.push(m));
  room.onMessage("soul", (m: SoulMsg) => souls.push(m));
  room.onMessage("reborn", (m: RebornMsg) => reborns.push(m));
  room.onMessage("quests", (m: QuestsMsg) => quests.push(m));
  room.onMessage("dialog", (m: DialogMsg) => dialogs.push(m));
  room.onMessage("chat", (m: ChatOut) => chat.push(m));
  room.onMessage("toast", (m: ToastMsg) => toasts.push(m));
  room.onMessage("fx", () => {});
  room.onMessage("dmg", () => {});
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return {
    room,
    name,
    chat,
    toasts,
    invs,
    wallets,
    quests,
    dialogs,
    limbos,
    souls,
    reborns,
    me: () => (room.state as any).players.get(room.sessionId),
  };
}

/** Phòng thật phía server, để dựng tình huống (đặt quái cạnh người chơi…). */
function serverRoom(room: Room) {
  return matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
}
function serverState(room: Room) {
  return serverRoom(room).state as WorldState;
}

describe("vào game", () => {
  it("từ chối tên không hợp lệ", async () => {
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(
      client.joinOrCreate(ROOM_NAME, { name: "a", secret: secretOf("a") }),
    ).rejects.toThrow(/2–16 ký tự/);
    await expect(
      client.joinOrCreate(ROOM_NAME, { name: "<script>", secret: secretOf("x") }),
    ).rejects.toThrow();
  });

  it("từ chối khi thiếu mã nhân vật", async () => {
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(
      client.joinOrCreate(ROOM_NAME, { name: "Khong Ma", secret: "ngan" }),
    ).rejects.toThrow(/mã nhân vật/);
  });

  it("nhân vật mới bắt đầu ở Phàm Nhân, trong trấn, đủ quái trên bản đồ", async () => {
    const { room, me } = await join();
    const p = me();
    expect(p.realm).toBe(0);
    expect(p.tier).toBe(0);
    expect(p.hp).toBe(statsFor(0, 0).maxHp);
    expect(p.expMax).toBe(expToNext(0, 0));
    expect(Math.hypot(p.x - TOWN_PX.x, p.y - TOWN_PX.y)).toBeLessThan(TOWN_PX.r);
    // Quái trên bản đồ nằm ở server; client chỉ thấy phần ở gần (xem "vùng nhìn")
    const total = Object.values(MONSTER_CAP).reduce((a, b) => a + b, 0);
    const monsters = serverState(room).monsters.size;
    expect(monsters).toBeLessThanOrEqual(total);
    expect(monsters).toBeGreaterThan(total * 0.8);
    await waitFor(() => (room.state as any).monsters.size > 0);
    expect((room.state as any).monsters.size).toBeLessThanOrEqual(monsters);
  });

  it("không cho cùng một nhân vật vào hai lần cùng lúc", async () => {
    const a = await join("Song Sinh");
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(
      client.joinOrCreate(ROOM_NAME, { name: "song sinh", secret: secretOf("Song Sinh") }),
    ).rejects.toThrow(/đang ở trong game/);
    expect(a.me()).toBeTruthy();
  });

  it("tên đã có chủ thì mã khác không vào được", async () => {
    const a = await join("Chu Nhan");
    await a.room.leave(true);
    rooms.length = 0;
    await sleep(150);
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(
      client.joinOrCreate(ROOM_NAME, { name: "Chu Nhan", secret: secretOf("ke gian") }),
    ).rejects.toThrow(/đã có người dùng/);
  });
});

describe("rớt mạng và nối lại (#116)", () => {
  /** Rớt mạng: đóng WebSocket mà không "thoát chủ động" (server thấy mã khác 4000). */
  const dropConnection = (room: Room) => (room.connection.transport as any).ws.close();

  /** Nối lại bằng token của phòng cũ, như client thật; trả về Room mới cùng các hộp thư. */
  async function reconnectTo(old: Room) {
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.reconnect(old.reconnectionToken);
    const invs: InvMsg[] = [];
    const wallets: WalletMsg[] = [];
    const quests: QuestsMsg[] = [];
    room.onMessage("inv", (m: InvMsg) => invs.push(m));
    room.onMessage("wallet", (m: WalletMsg) => wallets.push(m));
    room.onMessage("quests", (m: QuestsMsg) => quests.push(m));
    for (const t of ["chat", "toast", "fx", "dmg", "party", "partyInvited", "dialog"])
      room.onMessage(t, () => {});
    rooms.push(room);
    await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
    return {
      room,
      invs,
      wallets,
      quests,
      me: () => (room.state as any).players.get(room.sessionId),
    };
  }

  const gone = (a: { room: Room }) => !serverState(a.room).players.get(a.room.sessionId);

  it("nối lại trong thời gian chờ: cùng sessionId, nhân vật còn nguyên, nhận lại túi / ví, vùng nhìn đúng, điều khiển được", async () => {
    const a = await join("Noi Lai");
    const b = await join("Hang Xom");
    a.room.send("chat", { text: "/give nanh_soi 4" });
    await waitFor(() => a.invs.find((m) => m.gained));
    const sid = a.room.sessionId;
    const p = serverState(a.room).players.get(sid)!;
    const { x, y } = p;
    const before = serverState(a.room).players.size;

    dropConnection(a.room);
    await waitFor(() => !a.room.connection.isOpen);
    await sleep(300);
    // Đang chờ: nhân vật vẫn ở trong thế giới, người khác vẫn thấy, số người không đổi
    expect(serverState(a.room).players.get(sid)).toBeTruthy();
    expect((b.room.state as any).players.get(sid)).toBeTruthy();
    expect(serverState(a.room).players.size).toBe(before);
    // Gửi tin riêng cho người đang chờ không gây lỗi
    expect(() =>
      (serverRoom(a.room) as any).sendTo(sid, "toast", { text: "x", tone: "info" }),
    ).not.toThrow();

    const r2 = await reconnectTo(a.room);
    expect(r2.room.sessionId).toBe(sid);
    const inv = await waitFor(() => r2.invs[0]);
    expect(inv.slots[0]).toEqual({ itemId: "nanh_soi", qty: 4 });
    expect((await waitFor(() => r2.wallets[0])).coin).toBe(0);
    await waitFor(() => r2.quests[0]);
    // Vùng nhìn còn đúng: thấy người ở gần; x, y riêng (TAG_OWNER) còn đủ và không đổi
    await waitFor(() => (r2.room.state as any).players.get(b.room.sessionId));
    expect(r2.me().x).toBeCloseTo(x, 3);
    expect(r2.me().y).toBeCloseTo(y, 3);
    // Điều khiển được tiếp
    for (let seq = 1; seq <= 5; seq++) r2.room.send("input", { seq, dx: 1, dy: 0 });
    await waitFor(() => r2.me().lastSeq === 5);
    expect(r2.me().x).toBeGreaterThan(x);
    // Người khác vẫn thấy một nhân vật duy nhất
    expect(serverState(a.room).players.size).toBe(before);
    expect((serverRoom(a.room) as any).ghosts.size).toBe(0);
  });

  it("hết thời gian chờ thì dọn như rời phòng, đã lưu, token cũ vô hiệu", async () => {
    WorldRoomClass.reconnectGraceS = 0.4;
    try {
      const a = await join("Het Han");
      a.room.send("chat", { text: "/give nanh_soi 2" });
      await waitFor(() => a.invs.find((m) => m.gained));
      const token = a.room.reconnectionToken;
      const room = serverRoom(a.room);
      dropConnection(a.room);
      await waitFor(() => gone(a), 3000);
      expect((room as any).ghosts.size).toBe(0);
      expect((room as any).world.ctrl.has(a.room.sessionId)).toBe(false);
      expect((room as any).limiters.has(a.room.sessionId)).toBe(false);
      const late = new Client(`ws://localhost:${PORT}`);
      await expect(late.reconnect(token)).rejects.toThrow();
      // Đã lưu: vào lại bình thường vẫn còn đồ
      const again = await join("Het Han");
      expect((await waitFor(() => again.invs[0])).slots[0]).toEqual({ itemId: "nanh_soi", qty: 2 });
    } finally {
      WorldRoomClass.reconnectGraceS = defaultGraceS;
    }
  });

  it("rớt mạng không bị giết: quái đang đánh dừng lại, hết khí huyết cũng không chết, nối lại thì quái đánh tiếp", async () => {
    const a = await join("Bat Tu");
    const sid = a.room.sessionId;
    const sr = serverRoom(a.room) as any;
    const map = sr.world.map;
    const p = serverState(a.room).players.get(sid)!;
    // Ra khỏi trấn tới chỗ đi được, đặt Hắc Hổ sát bên (đánh ~42 mỗi 1.3 s, người chơi mới 100 khí huyết)
    for (let k = 0; k < 40; k++) {
      const ang = (k / 40) * Math.PI * 2;
      const x = map.townPx.x + Math.cos(ang) * (map.townPx.r + 400);
      const y = map.townPx.y + Math.sin(ang) * (map.townPx.r + 400);
      if (!map.circleBlocked(x, y, 16) && !map.circleBlocked(x + 30, y, 16)) {
        p.x = x;
        p.y = y;
        break;
      }
    }
    const hoId = [...serverState(a.room).monsters].find(([, m]) => m.kind === "ho")![0];
    const ho = serverState(a.room).monsters.get(hoId)!;
    ho.x = p.x + 30;
    ho.y = p.y;
    const mc = sr.world.mctrl.get(hoId);
    mc.homeX = ho.x;
    mc.homeY = ho.y;
    // Đang đánh nhau thật: quái đã nhắm người này và gây sát thương
    await waitFor(() => mc.target === sid && p.hp < p.maxHp, 3000);
    p.hp = 1; // chỉ một cú nữa là chết

    dropConnection(a.room);
    await waitFor(() => !a.room.connection.isOpen);
    await waitFor(() => sr.world.ghosts.has(sid), 1000);
    expect(mc.target).toBeNull(); // quái bỏ mục tiêu ngay
    await sleep(2500); // đủ để Hắc Hổ đánh ít nhất hai lần nếu còn nhắm
    expect(p.dead).toBe(false);
    expect(p.hp).toBe(1);
    expect(mc.target).toBeNull();

    // Nối lại: hết bất tử, quái nhắm và đánh bình thường (ở đây là giết: chứng tỏ cờ đã gỡ)
    const r2 = await reconnectTo(a.room);
    expect(sr.world.ghosts.has(sid)).toBe(false);
    await waitFor(() => p.dead === true, 4000);
    void r2;
  });

  it("hết hạn chờ nối lại thì gỡ khỏi tập hồn lìa xác (không rò), kể cả khi bị đăng nhập lại huỷ chờ", async () => {
    WorldRoomClass.reconnectGraceS = 0.4;
    try {
      const a = await join("Het Han Ma");
      const sr = serverRoom(a.room) as any;
      dropConnection(a.room);
      await waitFor(() => sr.world.ghosts.has(a.room.sessionId), 1000);
      await waitFor(() => gone(a), 3000);
      expect(sr.world.ghosts.size).toBe(0);

      WorldRoomClass.reconnectGraceS = 30;
      const b = await join("Huy Cho Ma");
      const sb = serverRoom(b.room) as any;
      dropConnection(b.room);
      await waitFor(() => sb.world.ghosts.has(b.room.sessionId), 1000);
      const again = await join("Huy Cho Ma"); // chính chủ vào lại: huỷ chờ
      expect(again.me()).toBeDefined();
      expect(sb.world.ghosts.size).toBe(0);
    } finally {
      WorldRoomClass.reconnectGraceS = defaultGraceS;
    }
  });

  it("thoát chủ động và bị ngắt vì spam thì không giữ chỗ chờ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await join();
    await a.room.leave(true);
    await waitFor(() => gone(a), 1000);
    const b = await join();
    let code = 0;
    b.room.onLeave((c) => (code = c));
    for (let i = 0; i < 400; i++) b.room.send("talk", { npcId: "truong_tran" });
    await waitFor(() => code);
    expect(code).toBe(4429);
    await waitFor(() => gone(b), 1000);
    expect((serverRoom(b.room) as any).ghosts.size).toBe(0);
  });

  it("đăng nhập lại (đúng mã) khi đang chờ: huỷ chờ rồi vào, không nhân đôi, còn đồ; sai mã vẫn bị từ chối", async () => {
    const name = "Tai Lai";
    const a = await join(name);
    a.room.send("chat", { text: "/give nanh_soi 3" });
    await waitFor(() => a.invs.find((m) => m.gained));
    const oldSid = a.room.sessionId;
    const token = a.room.reconnectionToken;
    dropConnection(a.room);
    await waitFor(() => !a.room.connection.isOpen);
    await sleep(200);
    // Người lạ biết tên nhưng sai mã: vẫn bị từ chối, nhân vật vẫn chờ
    const other = new Client(`ws://localhost:${PORT}`);
    await expect(
      other.joinOrCreate(ROOM_NAME, { name, secret: secretOf("ke gian") }),
    ).rejects.toThrow(/đang ở trong game/);
    expect(serverState(a.room).players.get(oldSid)).toBeTruthy();
    // Chính chủ tải lại trang: vào được ngay
    const again = await join(name);
    expect((await waitFor(() => again.invs[0])).slots[0]).toEqual({ itemId: "nanh_soi", qty: 3 });
    expect(again.room.sessionId).not.toBe(oldSid);
    const names: string[] = [];
    serverState(again.room).players.forEach((p) => names.push(p.name));
    expect(names.filter((n) => n === name)).toHaveLength(1);
    expect(serverState(again.room).players.get(oldSid)).toBeUndefined();
    expect((serverRoom(again.room) as any).ghosts.size).toBe(0);
    // Token cũ không dùng được nữa
    await expect(new Client(`ws://localhost:${PORT}`).reconnect(token)).rejects.toThrow();
  });

  it("rớt mạng rồi nối lại nhiều lần liên tiếp không rò (kết nối, dữ liệu riêng, giới hạn tần suất, người chờ)", async () => {
    const a = await join("Hay Rot");
    const room = serverRoom(a.room);
    const sid = a.room.sessionId;
    const count = () => ({
      clients: room.clients.length,
      ctrl: (room as any).world.ctrl.size,
      limiters: (room as any).limiters.size,
      ghosts: (room as any).ghosts.size,
      players: serverState(a.room).players.size,
    });
    const base = count();
    let cur: Room = a.room;
    for (let i = 0; i < 3; i++) {
      dropConnection(cur);
      await waitFor(() => !cur.connection.isOpen);
      await sleep(150);
      const r = await reconnectTo(cur);
      expect(r.room.sessionId).toBe(sid);
      await waitFor(() => r.invs[0]);
      cur = r.room;
      await waitFor(() => (room as any).ghosts.size === 0);
    }
    expect(count()).toEqual(base);
  }, 15_000);
});

describe("di chuyển", () => {
  it("mỗi input là một bước, server cập nhật vị trí và lastSeq", async () => {
    const { room, me } = await join();
    const x0 = me().x;
    for (let seq = 1; seq <= 10; seq++) room.send("input", { seq, dx: 1, dy: 0 });
    await waitFor(() => me().lastSeq === 10);
    const step = statsFor(0, 0).speed * 0.05;
    // Có thể bị tường chặn, nhưng không bao giờ đi xa hơn 10 bước
    expect(me().x).toBeGreaterThan(x0);
    expect(me().x - x0).toBeLessThanOrEqual(step * 10 + 0.01);
  });

  it("bỏ qua input rác", async () => {
    const { room, me } = await join();
    const { x, y } = me();
    room.send("input", { seq: 1, dx: Number.NaN, dy: 0 });
    room.send("input", { seq: 2, dx: "abc", dy: 1 });
    room.send("input", null);
    await sleep(200);
    expect(me().x).toBe(x);
    expect(me().y).toBe(y);
  });

  it("gửi dồn dập nhiều input cũng không đi nhanh hơn tốc độ cho phép", async () => {
    const { room, me } = await join();
    const x0 = me().x;
    for (let seq = 1; seq <= 20; seq++) room.send("input", { seq, dx: 1, dy: 0 });
    await sleep(160); // ~3 tick
    const step = statsFor(0, 0).speed * 0.05;
    expect(me().x - x0).toBeLessThanOrEqual(step * 8 + 0.01); // ngân sách tối đa 4 + 1 mỗi tick
  });
});

describe("chat", () => {
  it("phát cho mọi người, cắt còn 120 ký tự, chặn spam", async () => {
    const a = await join("Nguoi Noi");
    const b = await join("Nguoi Nghe");
    a.room.send("chat", { text: "  Xin chào  " });
    a.room.send("chat", { text: "spam ngay sau đó" });
    a.room.send("chat", { text: "x".repeat(300) });
    await waitFor(() => b.chat.find((m) => m.from === "Nguoi Noi"));
    await sleep(150);
    const said = b.chat.filter((m) => m.from === "Nguoi Noi");
    expect(said).toEqual([{ from: "Nguoi Noi", text: "Xin chào" }]);
    await sleep(800);
    a.room.send("chat", { text: "y".repeat(300) });
    await waitFor(() => b.chat.filter((m) => m.from === "Nguoi Noi").length === 2);
    expect(b.chat.filter((m) => m.from === "Nguoi Noi")[1].text).toHaveLength(120);
  });
});

describe("chiến đấu và tu luyện", () => {
  /** Đặt một con quái loại `kind` ngay trước mặt người chơi. */
  function placeMonster(room: Room, kind: string, dx = 30) {
    const st = serverState(room);
    const p = st.players.get(room.sessionId)!;
    for (const [id, m] of st.monsters) {
      if (m.kind !== kind) continue;
      m.x = p.x + dx;
      m.y = p.y;
      return { id, m, p };
    }
    throw new Error(`Không có quái ${kind}`);
  }

  it("chém trúng quái làm giảm khí huyết; giết thì được tu vi", async () => {
    const { room, me } = await join();
    // Đưa người chơi ra khỏi trấn để quái không bị chặn ở rìa an toàn
    const { id, m } = placeMonster(room, "tho");
    const before = m.hp;
    room.send("attack", { angle: 0 });
    await waitFor(
      () => !serverState(room).monsters.has(id) || serverState(room).monsters.get(id)!.hp < before,
    );
    // Hạ máu còn 1 rồi đánh tiếp để chắc chắn giết được
    const mon = serverState(room).monsters.get(id);
    if (mon) {
      mon.hp = 1;
      const p = serverState(room).players.get(room.sessionId)!;
      mon.x = p.x + 30;
      mon.y = p.y;
      await sleep(SKILLS.slash.cooldown + 50);
      room.send("attack", { angle: 0 });
    }
    await waitFor(() => !serverState(room).monsters.has(id));
    await waitFor(() => me().exp > 0);
  });

  it("chém ngược hướng thì không trúng", async () => {
    const { room } = await join();
    const { id, m } = placeMonster(room, "tho", 50);
    const before = m.hp;
    room.send("attack", { angle: Math.PI });
    await sleep(150);
    expect(serverState(room).monsters.get(id)?.hp).toBe(before);
  });

  it("kiếm khí tốn linh lực và có hồi chiêu", async () => {
    const { room, me } = await join();
    const mp0 = me().mp;
    room.send("skill", { id: "sword", angle: 0 });
    room.send("skill", { id: "sword", angle: 0 }); // trong hồi chiêu: bỏ qua
    await waitFor(() => me().mp < mp0);
    await sleep(150);
    expect(mp0 - me().mp).toBeGreaterThanOrEqual(SKILLS.sword.mp - 1); // có hồi linh lực theo thời gian
    expect(mp0 - me().mp).toBeLessThan(SKILLS.sword.mp * 2);
  });

  it("đả tọa tăng tu vi; di chuyển thì dừng đả tọa", async () => {
    const { room, me } = await join();
    room.send("meditate", { on: true });
    await waitFor(() => me().meditating);
    await waitFor(() => me().exp > 0, 2000);
    room.send("input", { seq: 1, dx: 1, dy: 0 });
    await waitFor(() => !me().meditating);
  });

  it("bị quái đánh hết máu thì chết thật: vào Hoàng Tuyền, kiếp cũ mất hẳn (không còn mất 10% tu vi rồi hồi sinh)", async () => {
    const { room, me, toasts, limbos } = await join();
    const st = serverState(room);
    const p = st.players.get(room.sessionId)!;
    // Đưa người chơi ra ngoài trấn, đặt Hôi Lang sát bên
    p.x = TOWN_PX.x + TOWN_PX.r + 300;
    p.y = TOWN_PX.y;
    p.exp = 30;
    p.hp = 1;
    for (const m of st.monsters.values()) {
      if (m.kind !== "lang") continue;
      m.x = p.x + 20;
      m.y = p.y;
      break;
    }
    await waitFor(() => me().dead, 4000);
    await waitFor(() => limbos[0]);
    expect(me().exp).toBe(0); // kiếp cũ đã đặt lại (không phải 27)
    expect(toasts.some((t) => t.tone === "bad" && /Hoàng Tuyền/.test(t.text))).toBe(true);
    await sleep(RESPAWN_MS_TEST);
    expect(me().dead).toBe(true); // không hồi sinh theo đồng hồ
  });
});

describe("đột phá", () => {
  it("chưa đủ tu vi thì báo, không đổi cảnh giới", async () => {
    const { room, me, toasts } = await join();
    room.send("breakthrough");
    await waitFor(() => toasts.length > 0);
    expect(me().realm).toBe(0);
  });

  it("thành công: lên cảnh giới mới, hồi đầy, thông báo toàn server", async () => {
    const { room, me, chat } = await join("Dot Pha");
    serverState(room).players.get(room.sessionId)!.exp = expToNext(0, 0);
    vi.spyOn(Math, "random").mockReturnValue(0);
    room.send("breakthrough");
    await waitFor(() => me().realm === 1);
    expect(me().tier).toBe(0);
    expect(me().exp).toBe(0);
    expect(me().hp).toBe(statsFor(1, 0).maxHp);
    await waitFor(() => chat.find((c) => c.sys && c.text.includes("Luyện Khí")));
  });

  it("thất bại: giữ cảnh giới, mất 30% tu vi", async () => {
    const { room, me } = await join();
    const exp = expToNext(0, 0);
    serverState(room).players.get(room.sessionId)!.exp = exp;
    await waitFor(() => me().exp === exp); // chờ client nhận được tu vi đầy
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    room.send("breakthrough");
    await waitFor(() => me().exp < exp);
    expect(me().realm).toBe(0);
    expect(me().exp).toBe(Math.floor(exp * 0.7));
  });
});

describe("lưu nhân vật", () => {
  it("thoát game thì lưu cảnh giới và tu vi", async () => {
    const { room } = await join("Luu Tru");
    const p = serverState(room).players.get(room.sessionId)!;
    p.realm = 1;
    p.tier = 3;
    p.exp = 12;
    await room.leave(true);
    rooms.length = 0;
    const saved = await waitFor(() => {
      for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".json"))) {
        const j = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
        if (j.name === "Luu Tru" && j.realm === 1) return j;
      }
    });
    expect(saved).toMatchObject({ realm: 1, tier: 3, exp: 12 });
    expect(saved.secretHash).not.toContain("secret"); // không lưu mã gốc
  });
});

describe("nhịp tim ứng dụng ping / pong (M4.2b)", () => {
  /** Gom mọi tin `pong` của một người chơi */
  const collectPongs = (room: Room) => {
    const pongs: unknown[] = [];
    room.onMessage("pong", (m: unknown) => pongs.push(m));
    return pongs;
  };

  it("ping hợp lệ: nhận lại đúng pong {t}, không thêm trường nào, chỉ người gửi nhận", async () => {
    const a = await join("Nhip Tim A");
    const b = await join("Nhip Tim B");
    const pa = collectPongs(a.room);
    const pb = collectPongs(b.room);
    a.room.send("ping", { t: 1731000000123 });
    await waitFor(() => pa.length >= 1);
    expect(pa).toEqual([{ t: 1731000000123 }]);
    await sleep(150);
    expect(pb).toEqual([]); // người khác không nhận pong của ai
  });

  it("ping thừa trường: chỉ lặp lại t (không phản chiếu dữ liệu của client)", async () => {
    const a = await join("Nhip Tim Thua");
    const pongs = collectPongs(a.room);
    a.room.send("ping", { t: 5, bi_mat: "x".repeat(200), nested: { a: 1 } });
    await waitFor(() => pongs.length >= 1);
    expect(pongs[0]).toEqual({ t: 5 });
  });

  it("ping xấu (không có t, sai kiểu, âm, không phải object): không trả lời, vẫn còn kết nối", async () => {
    const a = await join("Nhip Tim Xau");
    const pongs = collectPongs(a.room);
    for (const bad of [
      undefined,
      null,
      7,
      "ping",
      [],
      {},
      { t: "1" },
      { t: -1 },
      { t: null },
      { t: {} },
      { t: [1] },
    ]) {
      a.room.send("ping", bad as never);
    }
    await sleep(300);
    expect(pongs).toEqual([]);
    expect(a.room.connection.isOpen).toBe(true);
    // Tin xấu cũng tiêu hao quỹ giới hạn (3 lượt, hồi 1 lượt / giây): chờ hồi rồi tin tốt vẫn được trả lời
    await sleep(1200);
    a.room.send("ping", { t: 9 });
    await waitFor(() => pongs.length >= 1);
    expect(pongs).toEqual([{ t: 9 }]);
  });

  it("giới hạn tần suất: gửi dồn 30 ping chỉ được trả lời tối đa burst (3) + vài lượt hồi, và không bị ngắt", async () => {
    const a = await join("Nhip Tim Spam");
    const pongs = collectPongs(a.room);
    for (let i = 0; i < 30; i++) a.room.send("ping", { t: i });
    await sleep(400);
    expect(pongs.length).toBeGreaterThanOrEqual(3);
    expect(pongs.length).toBeLessThanOrEqual(5);
    expect(a.room.connection.isOpen).toBe(true); // 30 tin vẫn nằm xa ngưỡng ngắt vì spam
  });
});

describe("giám sát vận hành (M4 3.3)", () => {
  it("phòng thật ghi thời gian tick, gắn roomId và xuất hiện trong ảnh chụp số đo", async () => {
    const { room } = await join("Giam Sat");
    const sr = serverRoom(room) as any;
    expect(sr.world.roomId).toBe(room.roomId);
    await waitFor(() => sr.world.tickStats.summary().total >= 5);
    const { collectMetrics } = await import("../metrics");
    const snap = collectMetrics(WorldRoomClass.hub, {
      now: Date.now(),
      uptimeS: 1,
      store: "file",
      rssBytes: 1,
      heapUsedBytes: 1,
      loopLagP99Ms: 0,
    });
    const mine = snap.rooms.find((r) => r.room === room.roomId)!;
    expect(mine).toBeTruthy();
    expect(mine.map).toBe(DEFAULT_MAP_ID);
    expect(mine.players).toBe(1);
    expect(mine.tick.total).toBeGreaterThanOrEqual(5);
    expect(mine.tick.p95).toBeGreaterThan(0);
    expect(mine.tick.p95).toBeLessThan(50); // một tick của phòng gần như trống không thể dài hơn một nhịp
  });

  it("mỗi lần lưu hồ sơ đi qua hàng đợi ghi: đếm đủ, không còn lần nào treo, không có lần lỗi", async () => {
    const hub = WorldRoomClass.hub;
    const before = hub.writes.summary();
    const { room } = await join("Hang Doi Ghi");
    await room.leave(true); // lưu khi rời phòng
    rooms.length = 0;
    await waitFor(() => hub.writes.summary().started > before.started);
    await waitFor(() => hub.writes.summary().inflight === 0);
    const after = hub.writes.summary();
    expect(after.started).toBeGreaterThan(before.started);
    expect(after.failed).toBe(before.failed);
  });

  it("kho lưu trữ ném lỗi lúc lưu: lần ghi tính vào failed và hàng đợi không bị kẹt", async () => {
    const hub = WorldRoomClass.hub;
    const real = WorldRoomClass.players;
    const { room } = await join("Kho Loi"); // vào bằng kho thật (tạo hồ sơ), rồi mới làm hỏng kho
    let calls = 0;
    WorldRoomClass.players = {
      load: async () => null,
      save: async () => {
        calls++;
        throw new Error("đĩa đầy (giả)");
      },
    };
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const before = hub.writes.summary();
      await room.leave(true);
      rooms.length = 0;
      await waitFor(() => calls > 0);
      await waitFor(() => hub.writes.summary().inflight === 0);
      expect(hub.writes.summary().failed).toBeGreaterThan(before.failed);
    } finally {
      WorldRoomClass.players = real;
    }
  });
});

describe("túi đồ và đồ rơi", () => {
  it("vào game nhận túi trống 24 ô; /give chỉ gửi túi cho chủ túi", async () => {
    const a = await join();
    const b = await join();
    await waitFor(() => a.invs.length && b.invs.length);
    expect(a.invs[0].slots).toHaveLength(24);
    expect(a.invs[0].slots.every((x) => x === null)).toBe(true);
    const bCount = b.invs.length;
    a.room.send("chat", { text: "/give hoi_huyet_dan 3" });
    const got = await waitFor(() => a.invs.find((m) => m.gained));
    expect(got.gained).toEqual([{ itemId: "hoi_huyet_dan", qty: 3 }]);
    await sleep(100);
    expect(b.invs.length).toBe(bCount);
    expect(b.chat.some((m) => m.text.includes("/give"))).toBe(false);
  });

  it("thoát ra vào lại vẫn còn đồ", async () => {
    const name = "Tui Do";
    const a = await join(name);
    a.room.send("chat", { text: "/give nanh_soi 7" });
    await waitFor(() => a.invs.find((m) => m.gained));
    await a.room.leave(true);
    rooms.length = 0;
    await sleep(200);
    const again = await join(name);
    const inv = await waitFor(() => again.invs[0]);
    expect(inv.slots[0]).toEqual({ itemId: "nanh_soi", qty: 7 });
  });

  it("Linh thạch: vào phòng nhận wallet (mới = 0); chỉ chủ nhận; thoát ra vào lại vẫn còn", async () => {
    const name = "Co Tien";
    const a = await join(name);
    const other = await join();
    const first = await waitFor(() => a.wallets[0]);
    expect(first).toEqual({ coin: 0 });
    await sleep(150);
    expect(other.wallets.every((m) => m.coin === 0)).toBe(true); // mỗi người chỉ nhận ví của mình
    // Server cộng tiền (như khi hạ quái): chủ nhận wallet kèm gained, người khác không nhận gì thêm
    const before = other.wallets.length;
    changeCoin((serverRoom(a.room) as any).world, a.room.sessionId, 123);
    expect(await waitFor(() => a.wallets.find((m) => m.gained))).toEqual({
      coin: 123,
      gained: 123,
    });
    await sleep(150);
    expect(other.wallets.length).toBe(before);
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const again = await join(name);
    const w = await waitFor(() => again.wallets[0]);
    expect(w).toEqual({ coin: 123 });
  });

  it("Linh thạch trong file lưu bị hỏng (âm, chuỗi, quá lớn) được nạp an toàn, không làm sập phòng", async () => {
    const cases: [unknown, number][] = [
      [-5, 0],
      ["abc", 0],
      [null, 0],
      [1e15, COIN_CAP],
      [12.9, 12],
    ];
    for (const [i, [bad, expected]] of cases.entries()) {
      const name = `Tien Hong ${i}`;
      const a = await join(name);
      await a.room.leave(true);
      rooms.splice(rooms.indexOf(a.room), 1);
      await sleep(200);
      const file = readdirSync(dataDir)
        .filter((x) => x.endsWith(".json"))
        .find((f) => JSON.parse(readFileSync(path.join(dataDir, f), "utf8")).name === name)!;
      const full = path.join(dataDir, file);
      const j = JSON.parse(readFileSync(full, "utf8"));
      j.coin = bad;
      writeFileSync(full, JSON.stringify(j));
      const again = await join(name);
      const w = await waitFor(() => again.wallets[0]);
      expect(w.coin, `coin=${JSON.stringify(bad)}`).toBe(expected);
      expect(again.me()).toBeDefined();
    }
  });

  it("cửa hàng: Lão dược sư có nút Cửa hàng; mua đan trừ tiền, bán đồ lấy tiền; tin rác không sập phòng; vào lại còn đồ và tiền", async () => {
    const name = "Mua Ban";
    const a = await join(name);
    const duoc = NPC_BY_ID.duoc_su!;
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    sp.x = duoc.x;
    sp.y = duoc.y + 20;
    const w = (serverRoom(a.room) as any).world;
    changeCoin(w, a.room.sessionId, 100);
    await waitFor(() => a.wallets.find((m) => m.coin === 100));

    a.room.send("talk", { npcId: "duoc_su" });
    const dlg = await waitFor(() => a.dialogs.find((d) => d.npcId === "duoc_su"));
    expect(dlg.options.some((o) => o.action.kind === "shop")).toBe(true);

    // Mua 2 hồi huyết đan
    const price = buyPrice("hoi_huyet_dan");
    a.room.send("buy", { npcId: "duoc_su", itemId: "hoi_huyet_dan", qty: 2 });
    const bought = await waitFor(() =>
      a.invs.find((m) => m.gained?.[0]?.itemId === "hoi_huyet_dan"),
    );
    expect(bought.gained).toEqual([{ itemId: "hoi_huyet_dan", qty: 2 }]);
    const afterBuy = await waitFor(() => a.wallets.find((m) => m.coin === 100 - 2 * price));
    expect(afterBuy.gained).toBe(-2 * price);

    // Tin rác: không làm sập phòng, không đổi gì
    const junk: unknown[] = [
      { npcId: "duoc_su", itemId: "tu_khi_dan", qty: 1 },
      { npcId: "duoc_su", itemId: "hoi_huyet_dan", qty: -5 },
      { npcId: "duoc_su", itemId: "hoi_huyet_dan", qty: "9" },
      { npcId: "constructor", itemId: "hoi_huyet_dan", qty: 1 },
      { npcId: 5, itemId: {}, qty: [] },
      "mua",
      null,
    ];
    for (const m of junk) a.room.send("buy", m);
    for (const m of junk) a.room.send("sell", m);
    await sleep(300);
    expect(a.me()).toBeDefined();
    expect((serverRoom(a.room) as any).world.ctrl.get(a.room.sessionId)!.coin).toBe(
      100 - 2 * price,
    );

    // Bán 1 hồi huyết đan (ô đầu tiên của túi)
    a.room.send("sell", { npcId: "duoc_su", slot: 0, qty: 1 });
    await waitFor(() => a.wallets.find((m) => m.gained === sellPrice("hoi_huyet_dan")));
    const expectedCoin = 100 - 2 * price + sellPrice("hoi_huyet_dan");
    expect((serverRoom(a.room) as any).world.ctrl.get(a.room.sessionId)!.coin).toBe(expectedCoin);

    // Thoát ra vào lại: còn 1 đan và đúng số tiền
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const again = await join(name);
    expect((await waitFor(() => again.wallets[0])).coin).toBe(expectedCoin);
    const inv = await waitFor(() => again.invs[0]);
    expect(inv.slots[0]).toEqual({ itemId: "hoi_huyet_dan", qty: 1 });
  });

  it("giết quái thì nhận Linh thạch qua tin wallet (chỉ người hạ quái), lưu được khi thoát", async () => {
    const name = "San Tien";
    const a = await join(name);
    const other = await join();
    await waitFor(() => a.wallets[0]);
    const st = serverState(a.room);
    const sr = serverRoom(a.room) as any;
    const p = st.players.get(a.room.sessionId)!;
    const [mid, mon] = [...st.monsters.entries()].find(([, m]) => m.kind === "tho")!;
    mon.x = p.x + 20;
    mon.y = p.y;
    mon.hp = 1;
    sr.world.mctrl.get(mid).homeX = mon.x;
    sr.world.mctrl.get(mid).homeY = mon.y;
    const before = other.wallets.length;
    vi.spyOn(Math, "random").mockReturnValue(0); // rơi chắc chắn, mức tối thiểu
    a.room.send("attack", { angle: 0 });
    const got = await waitFor(() => a.wallets.find((m) => m.gained));
    vi.restoreAllMocks();
    expect(got).toEqual({ coin: COIN_DROPS.tho!.min, gained: COIN_DROPS.tho!.min });
    await sleep(150);
    expect(other.wallets.length).toBe(before); // người không góp sát thương không nhận gì
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const again = await join(name);
    expect((await waitFor(() => again.wallets[0])).coin).toBe(COIN_DROPS.tho!.min);
  });

  it("giết quái thì đồ rơi hiện trong state; nhặt được, dùng được", async () => {
    const { room, me, invs } = await join();
    await waitFor(() => invs.length);
    const st = serverState(room);
    const sr = serverRoom(room) as any;
    const p = st.players.get(room.sessionId)!;
    // Dời ra khỏi trấn để quái không bị kẹt, đặt một con Linh Thố máu 1 ngay trước mặt
    const [mid, mon] = [...st.monsters.entries()].find(([, m]) => m.kind === "tho")!;
    mon.x = p.x + 20;
    mon.y = p.y;
    mon.hp = 1;
    sr.world.mctrl.get(mid).homeX = mon.x;
    sr.world.mctrl.get(mid).homeY = mon.y;
    // Phòng thế giới dùng chung giữa các test: bỏ qua đồ rơi còn sót từ test trước
    const old = new Set(st.loot.keys());
    vi.spyOn(Math, "random").mockReturnValue(0); // không bạo kích, rơi đủ đồ
    room.send("attack", { angle: 0 });
    const loot = await waitFor(() => {
      const fresh = ([...(room.state as any).loot.entries()] as [string, any][]).filter(
        ([id]) => !old.has(id),
      );
      return fresh.length >= 2 && fresh;
    });
    vi.restoreAllMocks();
    expect(loot.every(([, l]) => l.owner === room.sessionId)).toBe(true);
    for (const [id] of loot) room.send("pickup", { lootId: id });
    const inv = await waitFor(() => {
      const last = invs.at(-1)!;
      return last.slots.filter(Boolean).length >= 2 && last;
    });
    expect(inv.slots.map((s) => s?.itemId)).toContain("hoi_huyet_dan");
    await waitFor(() => loot.every(([id]) => !(room.state as any).loot.has(id)));
    const slot = inv.slots.findIndex((s) => s?.itemId === "hoi_huyet_dan");
    p.hp = 10;
    room.send("useItem", { slot });
    await waitFor(() => me().hp > 10);
    await waitFor(() => invs.at(-1)!.cd.hoi_huyet_dan > 0);
  });
});

describe("nhiệm vụ và NPC", () => {
  /** Dịch chuyển người chơi tới cạnh NPC (phía server) */
  function standAt(room: Room, npcId: string) {
    const p = serverState(room).players.get(room.sessionId)!;
    p.x = NPC_BY_ID[npcId].x + 10;
    p.y = NPC_BY_ID[npcId].y;
  }

  it("vào game nhận sổ nhiệm vụ; nói chuyện, nhận, làm và trả nhiệm vụ; trả hai lần chỉ thưởng một lần", async () => {
    const { room, quests, dialogs, invs, me } = await join();
    await waitFor(() => quests.length);
    expect(quests[0]).toEqual({ active: [], done: [], dailyDone: [] });

    standAt(room, "truong_tran");
    room.send("talk", { npcId: "truong_tran" });
    const d = await waitFor(() => dialogs.at(-1));
    expect(d.options[0].action).toEqual({ kind: "accept", questId: "nhap_the" });

    room.send("questAccept", { questId: "nhap_the" });
    await waitFor(() => quests.at(-1)!.active.length === 1);

    standAt(room, "duoc_su");
    room.send("talk", { npcId: "duoc_su" });
    await waitFor(() => quests.at(-1)!.active[0]?.step === 1);

    standAt(room, "truong_tran");
    room.send("questTurnIn", { questId: "nhap_the" });
    room.send("questTurnIn", { questId: "nhap_the" });
    await waitFor(() => quests.at(-1)!.done.includes("nhap_the"));
    await sleep(150);
    expect(me().exp).toBe(QUEST_BY_ID.nhap_the.rewards.exp);
    const pills = invs.at(-1)!.slots.filter((s) => s?.itemId === "hoi_huyet_dan");
    expect(pills.reduce((n, s) => n + s!.qty, 0)).toBe(3);
  });

  it("thoát ra vào lại vẫn giữ tiến độ nhiệm vụ", async () => {
    const name = "So Nhiem Vu";
    const a = await join(name);
    standAt(a.room, "truong_tran");
    a.room.send("questAccept", { questId: "nhap_the" });
    await waitFor(() => a.quests.at(-1)?.active.length === 1);
    await a.room.leave(true);
    rooms.length = 0;
    await sleep(200);
    const again = await join(name);
    const q = await waitFor(() => again.quests[0]);
    expect(q.active).toEqual([{ id: "nhap_the", step: 0, count: 0 }]);
  });

  it("đứng xa NPC thì không nhận hộp thoại", async () => {
    const { room, dialogs } = await join();
    const p = serverState(room).players.get(room.sessionId)!;
    p.x = NPC_BY_ID.tho_ren.x + 200;
    p.y = NPC_BY_ID.tho_ren.y;
    room.send("talk", { npcId: "tho_ren" });
    await sleep(200);
    expect(dialogs).toHaveLength(0);
  });
});

describe("bảo mật", () => {
  it("dữ liệu rác và loại tin nhắn lạ không làm sập phòng, không sinh đồ", async () => {
    const a = await join();
    const b = await join();
    const types = [
      "input",
      "attack",
      "skill",
      "meditate",
      "chat",
      "useItem",
      "pickup",
      "dropItem",
      "talk",
      "questAccept",
      "questTurnIn",
      "questAbandon",
      "trade",
      "khong_co",
      "__proto__",
      "constructor",
      "toString",
    ];
    const junk = [
      null,
      0,
      "x",
      [],
      { slot: -1 },
      { npcId: "constructor" },
      { questId: "__proto__" },
    ];
    for (const t of types) for (const j of junk) a.room.send(t, j);
    await sleep(300);
    expect(a.room.connection.isOpen).toBe(true);
    expect(a.invs.at(-1)!.slots.every((s) => s === null)).toBe(true);
    expect(a.dialogs).toHaveLength(0);
    // Phòng vẫn chạy: người khác vẫn chat được
    b.room.send("chat", { text: "còn sống" });
    await waitFor(() => a.chat.find((m) => m.text === "còn sống"));
  });

  it("tin rác bơm vào MỌI loại tin đã đăng ký (lấy từ phòng, không liệt kê tay): không sập, state hợp lệ, không sinh đồ / tiền", async () => {
    const a = await join();
    const b = await join();
    const sr = serverRoom(a.room) as any;
    // Danh sách loại tin lấy thẳng từ phòng: tin mới thêm sau này tự được kiểm, không phải nhớ sửa test
    const types = Object.keys(sr.onMessageHandlers).filter((t) => t !== "*" && !t.startsWith("__"));
    expect(types.length).toBeGreaterThanOrEqual(24); // phòng không đổi cách lưu handler khiến test chạy rỗng
    for (const t of [
      "input",
      "chat",
      "useItem",
      "equip",
      "craft",
      "buy",
      "sell",
      "partyInvite",
      "breakthrough",
    ]) {
      expect(types, t).toContain(t);
    }

    // Đứng cạnh Lão dược sư với ít tiền và đồ để tin rác chạm tới tận logic mua / bán / đổi, không chỉ bị chặn ở cổng
    const duoc = NPC_BY_ID.duoc_su!;
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    sp.x = duoc.x;
    sp.y = duoc.y + 20;
    const ctrl = sr.world.ctrl.get(a.room.sessionId);
    ctrl.coin = 1000;
    ctrl.inv[0] = { itemId: "long_tho", qty: 5 };
    const lootBefore = serverState(a.room).loot.size;

    // Một đối tượng có MỌI tên trường mà các tin dùng, cùng nhận một giá trị xấu: mỗi handler gặp giá trị xấu ở trường của nó.
    // (Không dùng 0 và 1: slot / qty hợp lệ sẽ làm dropItem vứt đồ thật.)
    const FIELDS = [
      "slot",
      "qty",
      "npcId",
      "itemId",
      "questId",
      "tradeId",
      "recipeId",
      "lootId",
      "name",
      "from",
      "text",
      "angle",
      "dx",
      "dy",
      "seq",
      "x",
      "y",
      "on",
    ];
    const BAD: unknown[] = [
      -1,
      1e308,
      NaN,
      Infinity,
      -Infinity,
      1.5,
      1e9,
      "",
      "x",
      "9",
      "__proto__",
      "constructor",
      "x".repeat(120),
      [],
      {},
      null,
      true,
      false,
    ];
    const uniform = BAD.map((v) => Object.fromEntries(FIELDS.map((f) => [f, v])));
    // Bộ thứ hai "gần hợp lệ": đúng NPC và vật phẩm của cửa hàng, mọi trường còn lại xấu, để mua / bán / nói chuyện
    // đi qua cổng kiểm NPC và hàng bán rồi mới gặp số lượng, ô túi xấu (chạm tới tận logic, không chỉ bị chặn ở cổng).
    const nearValid = uniform.map((u) => ({ ...u, npcId: "duoc_su", itemId: "hoi_huyet_dan" }));
    let deep: any = { slot: -1 };
    for (let i = 0; i < 30; i++) deep = { slot: -1, npcId: "duoc_su", next: deep };
    const proto = JSON.parse(
      '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}',
    );
    const junk: unknown[] = [
      null,
      "x",
      12,
      [],
      [1, 2, 3],
      {},
      deep,
      proto,
      ...uniform,
      ...nearValid,
    ];

    // Chia đợt <= 12 tin mỗi loại, nghỉ giữa các đợt cho giới hạn tần suất của từng loại tin hồi lại (burst 16, 8 tin/giây)
    for (let i = 0; i < junk.length; i += 12) {
      const wave = junk.slice(i, i + 12);
      for (const t of types) for (const j of wave) a.room.send(t, j);
      await sleep(1500);
    }

    expect(a.room.connection.isOpen).toBe(true);
    // Không ai tự nhiên có thêm đồ hay tiền, không ai mất đồ / tiền vì tin rác
    expect(ctrl.coin).toBe(1000);
    expect(ctrl.inv[0]).toEqual({ itemId: "long_tho", qty: 5 });
    expect(ctrl.inv.slice(1).every((x: unknown) => x === null)).toBe(true);
    expect(serverState(a.room).loot.size).toBe(lootBefore);
    // Mọi giá trị trong state vẫn là số hữu hạn
    const st = serverState(a.room);
    st.players.forEach((p) => {
      for (const k of ["x", "y", "hp", "maxHp", "mp", "maxMp", "exp", "expMax"] as const) {
        expect(Number.isFinite((p as any)[k]), `${p.name}.${k}`).toBe(true);
      }
      expect(p.hp).toBeGreaterThanOrEqual(0);
      expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    });
    st.monsters.forEach((m) => {
      expect(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.hp)).toBe(true);
    });
    // Không bị "ô nhiễm prototype"
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
    // Phòng vẫn phục vụ người khác
    b.room.send("chat", { text: "còn sống sau tin rác" });
    await waitFor(() => a.chat.find((m) => m.text === "còn sống sau tin rác"));
  }, 20_000);

  it("spam tin nhắn liên tục thì bị ngắt kết nối", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await join();
    let code = 0;
    a.room.onLeave((c) => (code = c));
    for (let i = 0; i < 400; i++) a.room.send("talk", { npcId: "truong_tran" });
    await waitFor(() => code);
    expect(code).toBe(4429);
    expect(warn).toHaveBeenCalled();
  });

  it("lỗi trong một tin nhắn được ghi log, phòng vẫn chạy", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = await join();
    const b = await join();
    // Làm hỏng dữ liệu riêng của a để useItem ném lỗi
    (serverRoom(a.room) as any).world.ctrl.get(a.room.sessionId).inv = null;
    a.room.send("useItem", { slot: 0 });
    await waitFor(() => error.mock.calls.length > 0);
    b.room.send("chat", { text: "vẫn chạy" });
    await waitFor(() => b.chat.find((m) => m.text === "vẫn chạy"));
    expect(String(error.mock.calls[0][0])).toContain("onMessage");
  });

  it("không gửi túi đồ / nhiệm vụ / hộp thoại của người này cho người khác", async () => {
    const a = await join();
    const b = await join();
    const before = { invs: b.invs.length, quests: b.quests.length, dialogs: b.dialogs.length };
    a.room.send("chat", { text: "/give nanh_soi 3" });
    const p = serverState(a.room).players.get(a.room.sessionId)!;
    p.x = NPC_BY_ID.truong_tran.x + 10;
    p.y = NPC_BY_ID.truong_tran.y;
    a.room.send("talk", { npcId: "truong_tran" });
    await waitFor(() => a.dialogs.length > 0);
    await sleep(100);
    expect({ invs: b.invs.length, quests: b.quests.length, dialogs: b.dialogs.length }).toEqual(
      before,
    );
    // State chung không có trường riêng tư
    const pub = Object.keys(serverState(a.room).players.get(a.room.sessionId)!.toJSON());
    for (const k of ["inv", "inventory", "quests", "secret", "secretHash"])
      expect(pub).not.toContain(k);
  });
});

describe("trang bị và rèn đồ", () => {
  it("rèn ở Thợ rèn, mặc vào: người khác thấy trong state; thoát ra vào lại vẫn mặc", async () => {
    const name = "Tho Ren Thu";
    const a = await join(name);
    const b = await join();
    const p = serverState(a.room).players.get(a.room.sessionId)!;
    p.realm = 1;
    p.x = NPC_BY_ID.tho_ren.x + 10;
    p.y = NPC_BY_ID.tho_ren.y;
    a.room.send("chat", { text: "/give nanh_soi 8" });
    a.room.send("chat", { text: "/give long_tho 4" });
    await waitFor(() => a.invs.at(-1)?.slots.some((s) => s?.itemId === "long_tho"));
    a.room.send("craft", { recipeId: "ren_lang_nha_kiem" });
    const inv = await waitFor(() =>
      a.invs.find((m) => m.gained?.some((g) => g.itemId === "lang_nha_kiem")),
    );
    const slot = inv.slots.findIndex((s) => s?.itemId === "lang_nha_kiem");
    a.room.send("equip", { slot });
    // b nhìn thấy a đang cầm kiếm
    await waitFor(
      () => (b.room.state as any).players.get(a.room.sessionId)?.weapon === "lang_nha_kiem",
    );
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const again = await join(name);
    expect(again.me().weapon).toBe("lang_nha_kiem");
  });
});

describe("vùng nhìn (StateView)", () => {
  /** Đặt người chơi ở vị trí mới ngay trên server (bỏ qua di chuyển) */
  function teleport(room: Room, x: number, y: number) {
    const p = serverState(room).players.get(room.sessionId)!;
    p.x = x;
    p.y = y;
  }
  const FAR = { x: 220, y: 220 }; // cách trấn ~1900 px, xa hơn VIEW_EXIT
  const players = (room: Room) => (room.state as any).players as Map<string, any>;

  it("chỉ thấy người ở gần; ra xa thì mất, lại gần thì thấy lại; online luôn là tổng số", async () => {
    const a = await join();
    const b = await join();
    // Cùng ở trong trấn: thấy nhau
    await waitFor(() => players(a.room).has(b.room.sessionId));
    await waitFor(() => players(b.room).has(a.room.sessionId));

    // b đi ra xa: a không còn thấy b, nhưng vẫn thấy mình; online vẫn là 2
    const removed: string[] = [];
    getStateCallbacks(a.room)(a.room.state as any).players.onRemove((_: unknown, id: string) =>
      removed.push(id),
    );
    teleport(b.room, FAR.x, FAR.y);
    await waitFor(() => !players(a.room).has(b.room.sessionId));
    expect(removed).toContain(b.room.sessionId);
    expect(players(a.room).has(a.room.sessionId)).toBe(true);
    expect(players(b.room).has(a.room.sessionId)).toBe(false);
    await waitFor(() => (a.room.state as any).online === 2 && (b.room.state as any).online === 2);

    // b quay lại gần: thấy nhau trở lại, đủ dữ liệu
    teleport(b.room, TOWN_PX.x + 100, TOWN_PX.y);
    const seen = await waitFor(() => players(a.room).get(b.room.sessionId));
    expect(seen.name).toBe(b.name);
    // px, py được ghi theo nhịp (≤ POS_SYNC_EVERY_TICKS tick): chờ hội tụ về vị trí mới
    await waitFor(() => seen.px === Math.round(TOWN_PX.x + 100));
    expect(seen.py).toBe(Math.round(TOWN_PX.y));

    // b thoát: online giảm, a không còn thấy b
    await b.room.leave(true);
    rooms.splice(rooms.indexOf(b.room), 1);
    await waitFor(() => (a.room.state as any).online === 1);
    expect(players(a.room).has(b.room.sessionId)).toBe(false);
  });

  it("quái và đồ rơi cũng theo vùng nhìn; quái chết thì biến khỏi màn hình người đang thấy", async () => {
    const a = await join();
    const sr = serverRoom(a.room);
    // Một con quái ở xa, một con ngay cạnh
    const mons = [...sr.state.monsters.entries()];
    const [farId, farM] = mons.reduce((best, cur) =>
      Math.hypot(cur[1].x - TOWN_PX.x, cur[1].y - TOWN_PX.y) >
      Math.hypot(best[1].x - TOWN_PX.x, best[1].y - TOWN_PX.y)
        ? cur
        : best,
    );
    expect(Math.hypot(farM.x - TOWN_PX.x, farM.y - TOWN_PX.y)).toBeGreaterThan(1400);
    const near = mons.find(([, m]) => Math.hypot(m.x - TOWN_PX.x, m.y - TOWN_PX.y) < 900);
    expect(near).toBeTruthy();
    const monsters = (a.room.state as any).monsters as Map<string, any>;
    await waitFor(() => monsters.has(near![0]));
    expect(monsters.has(farId)).toBe(false);
    expect(monsters.size).toBeLessThan(sr.state.monsters.size);

    // Quái gần bị xoá khỏi state (như lúc chết): client nhận onRemove
    sr.state.monsters.delete(near![0]);
    await waitFor(() => !monsters.has(near![0]));
  });

  it("lastSeq chỉ gửi cho chủ nhân vật, người khác không nhận", async () => {
    const a = await join();
    const b = await join();
    await waitFor(() => players(b.room).has(a.room.sessionId));
    a.room.send("input", { seq: 7, dx: 1, dy: 0 });
    await waitFor(() => a.me().lastSeq === 7);
    await sleep(150);
    expect(players(b.room).get(a.room.sessionId).lastSeq).toBeUndefined(); // trường không hề đến client b
    expect(players(b.room).get(a.room.sessionId).px).toBeGreaterThan(0); // vẫn thấy vị trí (px, py công khai)
  });

  it("fx chỉ gửi cho người ở gần: người ở xa không nhận, người đứng cạnh và chính mình thì có", async () => {
    const a = await join();
    const near = await join();
    const far = await join();
    teleport(far.room, FAR.x, FAR.y);
    const got = (room: Room) => {
      const kinds: { kind: string; by: string }[] = [];
      room.onMessage("fx", (m: { kind: string; by: string }) => kinds.push(m));
      return kinds;
    };
    const aGot = got(a.room);
    const nearGot = got(near.room);
    const farGot = got(far.room);
    // chờ server xử lý vị trí mới của "far" (đã ra ngoài vùng nhìn) rồi mới chém
    await waitFor(() => !players(near.room).has(far.room.sessionId));
    a.room.send("attack", { angle: 0 });
    // Hai gói đi hai socket khác nhau nên có thể về lệch thứ tự: chờ cả hai thay vì kiểm ngay
    const slashOfA = (m: { kind: string; by: string }) =>
      m.kind === "slash" && m.by === a.room.sessionId;
    await waitFor(() => nearGot.some(slashOfA));
    await waitFor(() => aGot.some(slashOfA)); // chính mình vẫn nhận
    await sleep(200);
    // Các test dùng chung một phòng thế giới: quái có thể đánh người đứng ở góc bản đồ và gửi fx của chính nó,
    // nên chỉ kiểm tin do `a` gây ra (không dùng toEqual([]) trên mọi tin)
    expect(farGot.filter((m) => m.by === a.room.sessionId)).toEqual([]);
  });

  it("người khác nhận px, py làm tròn; x, y thật chỉ đến chủ và không bị gửi tiếp khi đổi (#80)", async () => {
    const a = await join();
    const b = await join();
    await waitFor(() => players(b.room).has(a.room.sessionId));
    // Lần vào tầm đầu: người khác không có x, y thật
    expect(players(b.room).get(a.room.sessionId).x).toBeUndefined();
    expect(players(b.room).get(a.room.sessionId).y).toBeUndefined();
    // Đặt vị trí thật có phần lẻ: chủ thấy đúng số thực, người khác thấy số nguyên làm tròn
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    sp.x = TOWN_PX.x + 60.6;
    sp.y = TOWN_PX.y + 20.4;
    // Chờ CẢ px lẫn py: chỗ vào ngẫu nhiên trong trấn có xác suất nhỏ (~0.5%) trùng đúng px đích, nếu chỉ chờ px
    // thì điều kiện đúng ngay từ đầu và py vẫn là số cũ (flake đã gặp ở CI)
    await waitFor(() => {
      const o = players(b.room).get(a.room.sessionId);
      return o.px === Math.round(TOWN_PX.x + 60.6) && o.py === Math.round(TOWN_PX.y + 20.4);
    });
    expect(a.me().x).toBeCloseTo(TOWN_PX.x + 60.6, 1);
    expect(a.me().y).toBeCloseTo(TOWN_PX.y + 20.4, 1);
    // Đi xa rồi lại gần: schema gửi kèm trường có thẻ MỘT lần khi thêm lại vào view, nhưng các lần đổi sau vẫn bị lọc.
    // Điều ta cần giữ: x, y của người khác không chạy theo (chỉ px, py chạy theo).
    teleport(a.room, FAR.x, FAR.y);
    await waitFor(() => !players(b.room).has(a.room.sessionId));
    teleport(a.room, TOWN_PX.x + 100, TOWN_PX.y);
    const again = await waitFor(() => players(b.room).get(a.room.sessionId));
    sp.x = TOWN_PX.x + 150;
    await waitFor(() => again.px === Math.round(TOWN_PX.x + 150));
    await sleep(120);
    if (again.x !== undefined) expect(again.x).not.toBeCloseTo(TOWN_PX.x + 150, 0);
  });
});

describe("tổ đội", () => {
  /** Thu thập tin `party` / `partyInvited` mà một client nhận được */
  function listen(room: Room) {
    const parties: PartyMsg[] = [];
    const invited: PartyInvitedMsg[] = [];
    room.onMessage("party", (m: PartyMsg) => parties.push(m));
    room.onMessage("partyInvited", (m: PartyInvitedMsg) => invited.push(m));
    return { parties, invited };
  }

  it("mời, nhận, nhận đội hình mỗi giây; /p chỉ tới đội; người ngoài không nhận gì; rời phòng thì rời đội", async () => {
    const a = await join();
    const b = await join();
    const outsider = await join();
    const la = listen(a.room);
    const lb = listen(b.room);
    const lo = listen(outsider.room);

    a.room.send("partyInvite", { name: b.name });
    const inv = await waitFor(() => lb.invited[0]);
    expect(inv).toEqual({ from: a.name, ttlMs: PARTY_INVITE_TTL_MS });
    b.room.send("partyAccept", { from: a.name });
    const first = await waitFor(() => la.parties.find((m) => m.members.length === 2));
    expect(first.leader).toBe(a.name);
    expect(first.members.map((m) => m.name)).toEqual([a.name, b.name]);
    await waitFor(() => lb.parties.some((m) => m.members.length === 2));

    // Đội hình được gửi lại định kỳ (máu, vị trí thay đổi)
    const n = la.parties.length;
    await waitFor(() => la.parties.length > n, PARTY_SNAPSHOT_MS * 3);

    // Chat đội: chỉ a và b nhận, có channel; người ngoài không nhận
    b.room.send("chat", { text: "/p đi săn Hôi Lang" });
    await waitFor(() => a.chat.some((m) => m.channel === "party"));
    await waitFor(() => b.chat.some((m) => m.channel === "party"));
    expect(a.chat.find((m) => m.channel === "party")).toMatchObject({
      from: b.name,
      text: "đi săn Hôi Lang",
    });
    await sleep(150);
    expect(outsider.chat.some((m) => m.text.includes("Hôi Lang"))).toBe(false);
    expect(lo.parties).toEqual([]);
    expect(lo.invited).toEqual([]);

    // b thoát phòng: a không còn đội (còn một mình thì giải tán)
    await b.room.leave(true);
    rooms.splice(rooms.indexOf(b.room), 1);
    await waitFor(() => la.parties.at(-1)?.members.length === 0);
    expect(la.parties.at(-1)).toEqual({ leader: "", members: [] });
  });

  it("tin tổ đội rác (kiểu sai, tên quá dài, spam lời mời) không làm sập phòng, không lập đội", async () => {
    const a = await join();
    const b = await join();
    const lb = listen(b.room);
    const junk: unknown[] = [
      null,
      42,
      "x",
      [],
      { name: 42 },
      { name: "x".repeat(1000) },
      { from: {} },
    ];
    for (const m of junk) {
      a.room.send("partyInvite", m);
      a.room.send("partyAccept", m);
      a.room.send("partyDecline", m);
      a.room.send("partyKick", m);
    }
    a.room.send("partyLeave");
    // spam lời mời hợp lệ: hồi chiêu giữ lại đúng một lời mời
    for (let i = 0; i < 5; i++) a.room.send("partyInvite", { name: b.name });
    await waitFor(() => lb.invited.length >= 1);
    await sleep(250);
    expect(lb.invited).toHaveLength(1);
    expect(serverRoom(a.room).state.players.size).toBeGreaterThanOrEqual(2);
    // phòng vẫn chạy: b vẫn nhận / đi lại được
    b.room.send("input", { seq: 1, dx: 1, dy: 0 });
    await waitFor(() => b.me().lastSeq === 1);
  });
});

describe("nhiều bản đồ: mỗi bản đồ một phòng (M3 bước 1)", () => {
  /** Lỗi vào phòng của colyseus.js: mã + thông điệp như client thật nhận được */
  async function joinError(name: string, secret: string, roomName: string, extra = {}) {
    const client = new Client(`ws://localhost:${PORT}`);
    try {
      await client.joinOrCreate(roomName, { name, secret, ...extra });
    } catch (e: any) {
      return { code: e.code as number, message: String(e.message) };
    }
    throw new Error("Đáng ra phải bị từ chối");
  }
  const saveFileOf = (name: string) => {
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name);
    return f ? path.join(dataDir, f) : undefined;
  };
  /** Tạo nhân vật rồi sửa file lưu như thể đã đi qua cổng / file hỏng */
  async function seedSave(name: string, patch: Record<string, unknown>) {
    const a = await join(name);
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const full = saveFileOf(name)!;
    writeFileSync(full, JSON.stringify({ ...JSON.parse(readFileSync(full, "utf8")), ...patch }));
    return full;
  }
  const cap = (id: string) => Object.values(getMap(id)!.monsterCap).reduce((a, b) => a + b, 0);
  /** Số phòng thế giới đang có, mọi bản đồ */
  const rooms_ = async () =>
    (await Promise.all(MAPS.map((m) => matchMaker.query({ name: roomNameOf(m.id) })))).flat()
      .length;

  it("nhân vật mới vào phòng của bản đồ khác bị đưa về bản đồ mặc định, không tạo file lưu", async () => {
    const name = "Lac Duong";
    const e = await joinError(name, secretOf(name), roomNameOf(HAC_PHONG_ID));
    expect(e.code).toBe(JOIN_WRONG_MAP);
    expect(parseWrongMap(e.code, e.message)).toBe(DEFAULT_MAP_ID);
    expect(saveFileOf(name)).toBeUndefined();
  });

  it("tên phòng của bản đồ không có thì Colyseus từ chối, không tạo phòng; tuỳ chọn mapId của client không đổi được bản đồ của phòng", async () => {
    await join(); // bảo đảm phòng mặc định đã có
    const before = await rooms_();
    for (const bad of ["world_khong_co", "world_", "world_constructor", "world__proto__", "khac"]) {
      const e = await joinError("Rac Ban Do", secretOf("Rac Ban Do"), bad);
      expect(e.code, bad).toBeGreaterThanOrEqual(4000);
    }
    expect(await rooms_()).toBe(before);
    expect(saveFileOf("Rac Ban Do")).toBeUndefined();
    // Client gửi mapId trong tuỳ chọn (kể cả rác) vào phòng mặc định: bị bỏ qua, bản đồ vẫn là của phòng
    for (const [i, forged] of [HAC_PHONG_ID, "khong_co", 5, { a: 1 }].entries()) {
      const name = `Gia Mao ${i}`;
      const client = new Client(`ws://localhost:${PORT}`);
      const room = await client.joinOrCreate(ROOM_NAME, {
        name,
        secret: secretOf(name),
        mapId: forged,
      });
      rooms.push(room);
      expect(serverRoom(room).mapId).toBe(DEFAULT_MAP_ID);
      await room.leave(true);
      rooms.splice(rooms.indexOf(room), 1);
    }
    expect(await rooms_()).toBe(before);
  });

  it("nhân vật đang ở bản đồ khác: phòng sai báo đúng bản đồ, sai mã thì 403 (không lộ bản đồ), phòng đúng cho vào, lưu giữ mapId", async () => {
    const name = "Hac Phong Khach";
    const hp = getMap(HAC_PHONG_ID)!;
    const full = await seedSave(name, {
      mapId: HAC_PHONG_ID,
      x: Math.round(hp.townPx.x),
      y: Math.round(hp.townPx.y),
    });

    const wrong = await joinError(name, secretOf(name), roomNameOf(DEFAULT_MAP_ID));
    expect(wrong.code).toBe(JOIN_WRONG_MAP);
    expect(parseWrongMap(wrong.code, wrong.message)).toBe(HAC_PHONG_ID);
    // Sai mã: không được biết nhân vật ở đâu
    const thief = await joinError(name, "sai-ma-0123456789abcdef-zzz", roomNameOf(DEFAULT_MAP_ID));
    expect(thief.code).toBe(403);
    expect(parseWrongMap(thief.code, thief.message)).toBeUndefined();

    const a = await join(name, secretOf(name), HAC_PHONG_ID);
    const sr = serverRoom(a.room);
    expect(sr.mapId).toBe(HAC_PHONG_ID);
    // đúng bản đồ: vị trí đã lưu nằm trong trạm an toàn của Hắc Phong Cốc, không bị đưa về Lạc Hà
    expect(Math.hypot(a.me().x - hp.townPx.x, a.me().y - hp.townPx.y)).toBeLessThan(2);
    // quái theo bản đồ: không có Linh Thố, tổng số theo monsterCap của Hắc Phong Cốc (và khác Lạc Hà)
    const kinds = new Map<string, number>();
    serverState(a.room).monsters.forEach((m) => kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1));
    expect(kinds.has("tho")).toBe(false);
    expect(serverState(a.room).monsters.size).toBeGreaterThan(cap(HAC_PHONG_ID) * 0.9);
    expect(serverState(a.room).monsters.size).toBeLessThan(cap(DEFAULT_MAP_ID));
    // người ở phòng đó không nói chuyện được với NPC của Lạc Hà dù đứng đúng toạ độ của NPC
    const npc = NPC_BY_ID.truong_tran!;
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    sp.x = npc.x;
    sp.y = npc.y + 20;
    a.room.send("talk", { npcId: npc.id });
    await sleep(300);
    expect(a.dialogs).toHaveLength(0);

    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    expect(JSON.parse(readFileSync(full, "utf8")).mapId).toBe(HAC_PHONG_ID);
  });

  it("client cũ chỉ biết ROOM_NAME vẫn hội tụ: nhân vật ở bản đồ khác được báo bản đồ đúng, nhân vật mặc định vào bình thường", async () => {
    const name = "Khach Cu";
    const hp = getMap(HAC_PHONG_ID)!;
    await seedSave(name, {
      mapId: HAC_PHONG_ID,
      x: Math.round(hp.townPx.x),
      y: Math.round(hp.townPx.y),
    });
    const e = await joinError(name, secretOf(name), ROOM_NAME);
    expect(parseWrongMap(e.code, e.message)).toBe(HAC_PHONG_ID);
    // rồi vào đúng phòng bằng tên phòng của bản đồ đó
    const a = await join(name, secretOf(name), HAC_PHONG_ID);
    expect(serverRoom(a.room).mapId).toBe(HAC_PHONG_ID);
    // Mọi phòng của một bản đồ là MỘT phòng: không có phòng "không nhãn" thứ hai
    expect((await matchMaker.query({ name: ROOM_NAME })).length).toBe(1);
  });

  it("file lưu có mapId lạ hoặc sai kiểu coi như bản đồ mặc định, lưu lại thành mapId hợp lệ", async () => {
    for (const [i, bad] of ["rac", 7, null, {}].entries()) {
      const name = `Map Rac ${i}`;
      const full = await seedSave(name, { mapId: bad });
      const a = await join(name);
      expect(serverRoom(a.room).mapId).toBe(DEFAULT_MAP_ID);
      await a.room.leave(true);
      rooms.splice(rooms.indexOf(a.room), 1);
      await sleep(200);
      expect(JSON.parse(readFileSync(full, "utf8")).mapId).toBe(DEFAULT_MAP_ID);
    }
  });

  it("Lạc Hà không đổi: nhân vật mặc định vào phòng mặc định với đủ quái và lưu mapId mặc định", async () => {
    const name = "Lac Ha Thuong";
    const a = await join(name);
    expect(serverRoom(a.room).mapId).toBe(DEFAULT_MAP_ID);
    expect(serverState(a.room).monsters.size).toBeGreaterThan(cap(DEFAULT_MAP_ID) * 0.9);
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    expect(JSON.parse(readFileSync(saveFileOf(name)!, "utf8")).mapId).toBe(DEFAULT_MAP_ID);
  });
});

describe("chat toàn server giữa các bản đồ (M3 bước 1)", () => {
  const hp = getMap(HAC_PHONG_ID)!;
  /** Nhân vật đang ở Hắc Phong Cốc (tạo rồi sửa file lưu như đã đi qua cổng) */
  async function joinHacPhong(name: string) {
    const a = await join(name);
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name)!;
    const full = path.join(dataDir, f);
    writeFileSync(
      full,
      JSON.stringify({
        ...JSON.parse(readFileSync(full, "utf8")),
        mapId: HAC_PHONG_ID,
        x: Math.round(hp.townPx.x),
        y: Math.round(hp.townPx.y),
      }),
    );
    return join(name, secretOf(name), HAC_PHONG_ID);
  }

  it("chat chung của người ở bản đồ này tới người ở bản đồ kia (hai chiều), kèm đúng tên người gửi", async () => {
    const a = await join("Chat Lac Ha");
    const b = await joinHacPhong("Chat Hac Phong");
    expect(serverRoom(a.room).mapId).toBe(DEFAULT_MAP_ID);
    expect(serverRoom(b.room).mapId).toBe(HAC_PHONG_ID);
    a.room.send("chat", { text: "xin chào từ Lạc Hà" });
    await waitFor(() => b.chat.find((m) => m.text === "xin chào từ Lạc Hà"));
    expect(b.chat.find((m) => m.text === "xin chào từ Lạc Hà")!.from).toBe("Chat Lac Ha");
    await sleep(900); // hồi chiêu chat
    b.room.send("chat", { text: "đáp lại từ Hắc Phong" });
    await waitFor(() => a.chat.find((m) => m.text === "đáp lại từ Hắc Phong"));
    // Người gửi nhận đúng một lần (không nhân đôi khi phòng của mình cũng là người nghe)
    expect(a.chat.filter((m) => m.text === "xin chào từ Lạc Hà")).toHaveLength(1);
    expect(b.chat.filter((m) => m.text === "đáp lại từ Hắc Phong")).toHaveLength(1);
  });

  it("chat đội và thông báo hệ thống vẫn chỉ trong phạm vi của mình (không rò ra bản đồ khác)", async () => {
    const a = await join("Doi Lac Ha");
    const c = await join("Hang Xom Lac");
    const b = await joinHacPhong("Doi Hac Phong");
    // Người mới nhập thế ở Lạc Hà: thông báo hệ thống chỉ ở phòng đó
    await waitFor(() => a.chat.find((m) => m.sys && m.text.includes("Hang Xom Lac")));
    expect(b.chat.some((m) => m.sys && m.text.includes("Hang Xom Lac"))).toBe(false);
    // Chat đội: người ngoài đội ở bản đồ khác không nhận
    a.room.send("chat", { text: "/p bí mật của đội" });
    await sleep(400);
    expect(b.chat.some((m) => m.text.includes("bí mật của đội"))).toBe(false);
    expect(c.chat.some((m) => m.text.includes("bí mật của đội"))).toBe(false);
  });

  it("phòng đóng thì ngừng nghe: không còn chỗ đăng ký của phòng đã đóng và chat vẫn tới các phòng còn lại", async () => {
    const a = await join("Chat Con Lai");
    const b = await joinHacPhong("Chat Phong Dong");
    const hub = WorldRoomClass.hub;
    const before = hub.chatSinkCount;
    const worldsBefore = hub.worlds.size;
    await serverRoom(b.room).disconnect();
    await waitFor(() => hub.chatSinkCount === before - 1, 3000);
    expect(hub.worlds.size).toBe(worldsBefore - 1); // thế giới của phòng đã đóng cũng rời Hub
    await sleep(900);
    a.room.send("chat", { text: "vẫn nói được" });
    await waitFor(() => a.chat.find((m) => m.text === "vẫn nói được"));
  });
});

describe("đi qua cổng giữa hai bản đồ (M3 bước 1)", () => {
  const lacHa = getMap(DEFAULT_MAP_ID)!;
  const hacPhong = getMap(HAC_PHONG_ID)!;
  const BAC = lacHa.portals[0];
  const NAM = hacPhong.portals[0];
  const fileOf = (name: string) => {
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name);
    return JSON.parse(readFileSync(path.join(dataDir, f!), "utf8"));
  };
  /** Nghe tin `travelTo` của một phòng */
  const listenTravel = (room: Room) => {
    const got: TravelToMsg[] = [];
    room.onMessage("travelTo", (m: TravelToMsg) => got.push(m));
    return got;
  };
  /** Đặt người chơi (phía server) đứng ngay tâm cổng */
  const standAt = (room: Room, portal: { x: number; y: number }) => {
    const sp = serverState(room).players.get(room.sessionId)!;
    sp.x = portal.x;
    sp.y = portal.y;
    return sp;
  };

  it("đi qua cổng bắc rồi quay về: không mất dữ liệu, đúng chỗ xuất hiện, đúng phòng, không còn ở phòng cũ", async () => {
    const name = "Qua Cong";
    const a = await join(name);
    const watcher = await join("Nguoi Xem Cong"); // người ở lại phòng cũ
    a.room.send("chat", { text: "/give nanh_soi 3" });
    await waitFor(() => a.invs.find((m) => m.gained));
    const sa = standAt(a.room, BAC);
    sa.exp = 17;
    const got = listenTravel(a.room);

    a.room.send("travel", { portalId: BAC.id });
    await waitFor(() => got.length === 1);
    expect(got[0]).toEqual({ mapId: HAC_PHONG_ID });
    await waitFor(() => !a.room.connection.isOpen); // server đóng kết nối sau travelTo
    // Đã rời phòng cũ ngay (không chờ nối lại) và bản ghi đã nói bản đồ đích + chỗ xuất hiện
    expect(serverState(a.room).players.get(a.room.sessionId)).toBeUndefined();
    await sleep(200);
    // đi qua cổng không phải "rời đi": người ở lại không nhận thông báo rời đi
    expect(watcher.chat.some((m) => m.text.includes(`${name} đã rời đi`))).toBe(false);
    const saved = fileOf(name);
    expect([saved.mapId, saved.x, saved.y]).toEqual([HAC_PHONG_ID, NAM.spawn.x, NAM.spawn.y]);
    expect(saved.travelAt).toBeGreaterThan(Date.now() - 5000);
    // Vào phòng cũ nữa thì được chỉ sang phòng đúng
    const e = await (async () => {
      try {
        await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, {
          name,
          secret: secretOf(name),
        });
      } catch (err: any) {
        return { code: err.code as number, message: String(err.message) };
      }
      throw new Error("đáng ra phải bị chuyển hướng");
    })();
    expect(parseWrongMap(e.code, e.message)).toBe(HAC_PHONG_ID);

    const b = await join(name, secretOf(name), HAC_PHONG_ID);
    expect(serverRoom(b.room).mapId).toBe(HAC_PHONG_ID);
    expect(Math.hypot(b.me().x - NAM.spawn.x, b.me().y - NAM.spawn.y)).toBeLessThan(2);
    expect(b.me().exp).toBe(17);
    expect((await waitFor(() => b.invs[0])).slots.find((s) => s?.itemId === "nanh_soi")?.qty).toBe(
      3,
    );
    // chỗ xuất hiện nằm trong khu an toàn của cổng: quái không nhắm
    expect(hacPhong.inSafe(b.me().x, b.me().y)).toBe(true);

    // Quay về ngay: hồi chiêu (lưu trong file) chặn; chờ hết hồi chiêu thì qua được
    const gotB = listenTravel(b.room);
    standAt(b.room, NAM);
    const toastsBefore = b.toasts.length;
    b.room.send("travel", { portalId: NAM.id });
    await waitFor(() => b.toasts.length > toastsBefore);
    expect(b.toasts.at(-1)!.text).toMatch(/chờ/);
    expect(gotB).toHaveLength(0);
    await sleep(TRAVEL_COOLDOWN_MS + 200);
    b.room.send("travel", { portalId: NAM.id });
    await waitFor(() => gotB.length === 1);
    expect(gotB[0]).toEqual({ mapId: DEFAULT_MAP_ID });
    await waitFor(() => !b.room.connection.isOpen);

    const c = await join(name);
    expect(serverRoom(c.room).mapId).toBe(DEFAULT_MAP_ID);
    expect(Math.hypot(c.me().x - BAC.spawn.x, c.me().y - BAC.spawn.y)).toBeLessThan(2);
    expect(c.me().exp).toBe(17);
    expect(fileOf(name).mapId).toBe(DEFAULT_MAP_ID);
  });

  it("từ chối: xa cổng, cổng của bản đồ khác, id rác, vừa bị đánh: chỉ có toast, vẫn ở phòng, không đổi file", async () => {
    const name = "Khong Qua";
    const a = await join(name);
    const got = listenTravel(a.room);
    const sa = standAt(a.room, { x: BAC.x + BAC.r + 200, y: BAC.y + 100 });
    const before = a.toasts.length;
    a.room.send("travel", { portalId: BAC.id }); // xa cổng
    a.room.send("travel", { portalId: NAM.id }); // cổng của bản đồ kia
    for (const junk of [null, 5, {}, "constructor", "__proto__"])
      a.room.send("travel", { portalId: junk });
    a.room.send("travel", "rác");
    await waitFor(() => a.toasts.length >= before + 2);
    sa.x = BAC.x;
    sa.y = BAC.y;
    (serverRoom(a.room) as any).world.ctrl.get(a.room.sessionId).lastHitAt = Date.now();
    const t2 = a.toasts.length;
    a.room.send("travel", { portalId: BAC.id }); // vừa bị đánh
    await waitFor(() => a.toasts.length > t2);
    expect(a.toasts.at(-1)!.text).toMatch(/giao chiến/);
    await sleep(300);
    expect(got).toHaveLength(0);
    expect(a.room.connection.isOpen).toBe(true);
    expect(serverState(a.room).players.get(a.room.sessionId)).toBeDefined();
    expect(fileOf(name).mapId ?? DEFAULT_MAP_ID).toBe(DEFAULT_MAP_ID);
    expect(fileOf(name).travelAt).toBeUndefined();
  });

  it("chết trong lúc đang lưu thì huỷ: không travelTo, ở lại phòng cũ và file được ghi lại bản đồ cũ (tự chữa)", async () => {
    const name = "Chet Cong";
    const a = await join(name);
    const got = listenTravel(a.room);
    const sr = serverRoom(a.room) as any;
    const sa = standAt(a.room, BAC);
    // Làm việc lưu chậm lại để có khoảng hở giữa "đã lưu bản đồ đích" và "gỡ khỏi phòng"
    const real = sr.persist.bind(sr);
    let slowed = false;
    vi.spyOn(sr, "persist").mockImplementation(async (...args: any[]) => {
      await real(...args);
      if (!slowed && args[2]) {
        slowed = true;
        sa.dead = true; // chết đúng lúc đó (deadAt mới: không hồi sinh ngay trong 100 ms)
        sr.world.ctrl.get(a.room.sessionId).deadAt = Date.now();
        await sleep(100);
      }
    });
    a.room.send("travel", { portalId: BAC.id });
    await waitFor(() => slowed, 3000);
    await sleep(400);
    expect(got).toHaveLength(0);
    expect(a.room.connection.isOpen).toBe(true);
    expect(serverState(a.room).players.get(a.room.sessionId)).toBeDefined();
    expect(sr.world.ctrl.get(a.room.sessionId).travelling).toBe(false);
    await waitFor(() => (fileOf(name).mapId ?? DEFAULT_MAP_ID) === DEFAULT_MAP_ID, 3000);
  });

  it("đang qua cổng thì lưu định kỳ không ghi đè bản đồ đích bằng bản đồ cũ", async () => {
    const name = "Luu De";
    const a = await join(name);
    const sr = serverRoom(a.room) as any;
    standAt(a.room, BAC);
    const c = sr.world.ctrl.get(a.room.sessionId);
    c.travelling = true; // như đang giữa lúc qua cổng
    const p = serverState(a.room).players.get(a.room.sessionId)!;
    const before = JSON.stringify(fileOf(name));
    await sr.persist(p, c); // lưu định kỳ / lúc rớt mạng
    expect(JSON.stringify(fileOf(name))).toBe(before);
    c.travelling = false;
    await sr.persist(p, c);
    expect(fileOf(name).mapId).toBe(DEFAULT_MAP_ID);
  });
});

describe("đội dùng chung giữa các bản đồ (M3 bước 1)", () => {
  const hp = getMap(HAC_PHONG_ID)!;
  const BAC = getMap(DEFAULT_MAP_ID)!.portals[0];
  function listenParty(room: Room) {
    const parties: PartyMsg[] = [];
    const invited: PartyInvitedMsg[] = [];
    room.onMessage("party", (m: PartyMsg) => parties.push(m));
    room.onMessage("partyInvited", (m: PartyInvitedMsg) => invited.push(m));
    return { parties, invited };
  }
  async function joinHacPhong(name: string) {
    const a = await join(name);
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(200);
    const f = readdirSync(dataDir).find(
      (x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name,
    )!;
    const full = path.join(dataDir, f);
    writeFileSync(
      full,
      JSON.stringify({
        ...JSON.parse(readFileSync(full, "utf8")),
        mapId: HAC_PHONG_ID,
        x: Math.round(hp.townPx.x),
        y: Math.round(hp.townPx.y),
      }),
    );
    return join(name, secretOf(name), HAC_PHONG_ID);
  }

  it("lập đội giữa hai bản đồ, chat đội chéo, đi qua cổng vẫn ở trong đội (nhận đội hình ngay ở phòng mới), thoát hẳn thì rời đội", async () => {
    const a = await join("Doi Chu Lac");
    const b = await joinHacPhong("Doi Chu Hac");
    const la = listenParty(a.room);
    const lb = listenParty(b.room);

    a.room.send("partyInvite", { name: b.name });
    await waitFor(() => lb.invited[0]);
    b.room.send("partyAccept", { from: a.name });
    const first = await waitFor(() => la.parties.find((m) => m.members.length === 2));
    expect(first.members.map((m) => [m.name, m.mapId])).toEqual([
      [a.name, DEFAULT_MAP_ID],
      [b.name, HAC_PHONG_ID],
    ]);
    await waitFor(() => lb.parties.some((m) => m.members.length === 2));

    // Chat đội đi chéo hai bản đồ
    b.room.send("chat", { text: "/p đội ơi, mình ở Hắc Phong" });
    await waitFor(() => a.chat.some((m) => m.channel === "party" && m.text.includes("Hắc Phong")));

    // A đi qua cổng sang Hắc Phong Cốc: vẫn ở trong đội
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    sp.x = BAC.x;
    sp.y = BAC.y;
    const got: { mapId: string }[] = [];
    a.room.onMessage("travelTo", (m: { mapId: string }) => got.push(m));
    a.room.send("travel", { portalId: BAC.id });
    await waitFor(() => got.length === 1);
    await waitFor(() => !a.room.connection.isOpen);
    const a2 = await join(a.name, secretOf(a.name), HAC_PHONG_ID);
    const la2 = listenParty(a2.room);
    // B (ở phòng cũ của A) thấy A đã đổi mapId trong đội hình
    await waitFor(
      () => lb.parties.at(-1)?.members.some((m) => m.name === a.name && m.mapId === HAC_PHONG_ID),
      PARTY_SNAPSHOT_MS * 4,
    );
    // A nhận đội hình ở phòng mới (ngay khi vào hoặc theo nhịp kế tiếp), vẫn đủ hai người
    const resync = await waitFor(
      () => la2.parties.find((m) => m.members.length === 2),
      PARTY_SNAPSHOT_MS * 3,
    );
    expect(resync.leader).toBe(a.name);
    expect((serverRoom(a2.room) as any).world.parties.size).toBe(1);

    // B thoát hẳn: đội giải tán, A nhận NO_PARTY
    await b.room.leave(true);
    rooms.splice(rooms.indexOf(b.room), 1);
    await waitFor(() => la2.parties.at(-1)?.members.length === 0, 3000);
    expect((serverRoom(a2.room) as any).world.parties.size).toBe(0);
  });
});

describe("chân linh và bộ đếm kiếp (M3 bước 2)", () => {
  const soulsPath = () => path.join(dataDir, "souls");
  const soulFile = (name: string) =>
    path.join(
      soulsPath(),
      `${createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex")}.json`,
    );
  const playerFile = (name: string) => {
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find(
        (x) =>
          x.endsWith(".json") &&
          JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name,
      )!;
    return path.join(dataDir, f);
  };
  const leave = async (a: { room: Room }) => {
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(250);
  };

  it("vào game lần đầu: tạo chân linh (kiếp 1, 0 Duyên) trong DATA_DIR/souls; lifeId sinh một lần và giữ nguyên qua các lần vào", async () => {
    const name = "Chan Linh Moi";
    const a = await join(name);
    const soul = JSON.parse(readFileSync(soulFile(name), "utf8"));
    expect([soul.kiep, soul.duyen, soul.best.step, soul.id]).toEqual([1, 0, 0, name.toLowerCase()]);
    await leave(a);
    const life1 = JSON.parse(readFileSync(playerFile(name), "utf8"));
    expect(typeof life1.lifeId).toBe("string");
    expect(life1.lifeId.length).toBeGreaterThan(10);
    const b = await join(name);
    await leave(b);
    expect(JSON.parse(readFileSync(playerFile(name), "utf8")).lifeId).toBe(life1.lifeId);
    // hồ sơ nhân vật không lẫn với chân linh: thư mục souls/ không làm hỏng việc đọc file nhân vật
    expect(readdirSync(dataDir).filter((f) => f.endsWith(".json")).length).toBeGreaterThan(0);
  });

  it("người chơi có từ trước khi có luân hồi: chân linh được tạo lặng lẽ, thành tựu cao nhất = bậc hiện tại, hồ sơ nguyên vẹn", async () => {
    const name = "Nguoi Cu";
    const a = await join(name);
    await leave(a);
    const pf = playerFile(name);
    const old = JSON.parse(readFileSync(pf, "utf8"));
    delete old.lifeId;
    delete old.life;
    writeFileSync(pf, JSON.stringify({ ...old, realm: 2, tier: 1, exp: 123 }));
    rmSync(soulFile(name)); // như chưa từng có chân linh
    const b = await join(name);
    expect(b.me().realm).toBe(2);
    expect(Math.floor(b.me().exp)).toBe(123);
    const soul = JSON.parse(readFileSync(soulFile(name), "utf8"));
    expect([soul.kiep, soul.best.realm, soul.best.tier, soul.best.step]).toEqual([1, 2, 1, 11]);
    await leave(b);
    const after = JSON.parse(readFileSync(pf, "utf8"));
    expect(after.lifeId).toBeTruthy();
    expect(after.life).toEqual({ playMs: expect.any(Number), kills: 0, bossKills: 0 });
  });

  it("bộ đếm được lưu: thời gian chơi cộng dồn qua các lần vào, quái và trùm đã hạ được tính", async () => {
    const name = "Dem Kiep";
    const a = await join(name);
    const sr = serverRoom(a.room) as any;
    const ctrl = () => sr.world.ctrl.get(a.room.sessionId);
    await sleep(700);
    expect(ctrl().life.playMs).toBeGreaterThan(400);
    // hạ một con quái bằng đòn đánh thật (còn 1 máu), và một trùm (gọi thẳng killMonster: trùm sẽ giết người chơi mới trước khi kịp đánh)
    const p = serverState(a.room).players.get(a.room.sessionId)!;
    p.x = sr.world.map.townPx.x + sr.world.map.townPx.r + 300;
    p.y = sr.world.map.townPx.y;
    const [tid, tm] = [...serverState(a.room).monsters].find(([, mm]) => mm.kind === "tho")!;
    tm.x = p.x + 20;
    tm.y = p.y;
    tm.hp = 1;
    sr.world.mctrl.get(tid).homeX = tm.x;
    sr.world.mctrl.get(tid).homeY = tm.y;
    await sleep(SKILLS.slash.cooldown + 50);
    a.room.send("attack", { angle: 0 });
    await waitFor(() => !serverState(a.room).monsters.has(tid), 3000);
    const [bid] = [...serverState(a.room).monsters].find(([, mm]) => mm.kind === "mang")!;
    const bmc = sr.world.mctrl.get(bid);
    bmc.damageBy.set(a.room.sessionId, 4000);
    // nạp động: nạp tĩnh ở đầu tệp sẽ kéo store.ts vào trước khi beforeAll đặt DATA_DIR
    const { killMonster } = await import("../systems/combat");
    killMonster(sr.world, bid, bmc);
    expect([ctrl().life.kills, ctrl().life.bossKills]).toEqual([2, 1]);
    const first = ctrl().life.playMs;
    await leave(a);
    const saved1 = JSON.parse(readFileSync(playerFile(name), "utf8")).life;
    expect([saved1.kills, saved1.bossKills]).toEqual([2, 1]);
    expect(saved1.playMs).toBeGreaterThanOrEqual(Math.floor(first));
    // vào lại: bộ đếm nạp từ file rồi cộng tiếp
    const b = await join(name);
    const sr2 = serverRoom(b.room) as any;
    expect(sr2.world.ctrl.get(b.room.sessionId).life.kills).toBe(2);
    await sleep(400);
    expect(sr2.world.ctrl.get(b.room.sessionId).life.playMs).toBeGreaterThan(saved1.playMs);
  });

  it("bộ đếm hỏng trong file (âm, chữ, vô cùng) được làm sạch khi vào game, không làm hỏng phòng", async () => {
    const name = "Dem Hong";
    const a = await join(name);
    await leave(a);
    const pf = playerFile(name);
    writeFileSync(
      pf,
      JSON.stringify({
        ...JSON.parse(readFileSync(pf, "utf8")),
        life: { playMs: "x", kills: -5, bossKills: 1e300 },
        lifeId: 12345,
      }),
    );
    const b = await join(name);
    const c = (serverRoom(b.room) as any).world.ctrl.get(b.room.sessionId);
    expect(c.life).toMatchObject({ kills: 0, bossKills: 0 });
    expect(c.life.playMs).toBeLessThan(5000); // "x" thành 0, rồi mới cộng thời gian chơi thật
    expect(typeof c.lifeId).toBe("string");
    expect(c.lifeId.length).toBeGreaterThan(10);
  });
});

describe("kho nhân vật thay được (M3 bước 3b): WorldRoom chỉ biết giao diện PlayerStore", () => {
  it("nhân vật tạo, nạp và lưu đều đi qua kho được tiêm vào; không có tệp nhân vật nào bị ghi vào DATA_DIR", async () => {
    const memory = new Map<string, any>();
    const calls: string[] = [];
    const filesBefore = readdirSync(dataDir).filter((x) => x.endsWith(".json")).length;
    const key = (n: string) => n.normalize("NFC").toLowerCase();
    WorldRoomClass.players = {
      load: async (name) => {
        calls.push(`load:${key(name)}`);
        return memory.get(key(name)) ?? null;
      },
      save: async (p) => {
        calls.push(`save:${key(p.name)}`);
        memory.set(key(p.name), JSON.parse(JSON.stringify(p)));
      },
    };
    try {
      const name = "Kho Bo Nho";
      const a = await join(name);
      expect(memory.get(key(name))).toMatchObject({ name, realm: 0 }); // tạo mới -> ghi vào kho giả
      await a.room.leave(true); // lưu lúc rời phòng
      rooms.splice(rooms.indexOf(a.room), 1);
      await sleep(250);
      expect(calls.filter((c) => c === `save:${key(name)}`).length).toBeGreaterThanOrEqual(2);
      // vào lại: nạp từ kho giả (đúng mã), không tạo nhân vật mới
      const b = await join(name);
      expect(calls).toContain(`load:${key(name)}`);
      expect(b.me().name).toBe(name);
      await b.room.leave(true);
      rooms.splice(rooms.indexOf(b.room), 1);
      await sleep(250);
      // sai mã bí mật bị từ chối dựa trên dữ liệu của kho giả
      const client = new Client(`ws://localhost:${PORT}`);
      await expect(
        client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { name, secret: "mot-ma-khac-0123456789" }),
      ).rejects.toMatchObject({ code: 403 });
      expect(readdirSync(dataDir).filter((x) => x.endsWith(".json")).length).toBe(filesBefore);
    } finally {
      WorldRoomClass.players = null;
    }
  });
});

describe("luân hồi: chết thật, Hoàng Tuyền, đầu thai (M3 bước 2)", () => {
  const sha = (name: string) =>
    createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex");
  const soulOf = (name: string) =>
    JSON.parse(readFileSync(path.join(dataDir, "souls", `${sha(name)}.json`), "utf8"));
  const playerOf = (name: string) => {
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name)!;
    return JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
  };
  const writePlayer = (name: string, patch: Record<string, unknown>) => {
    const f = readdirSync(dataDir)
      .filter((x) => x.endsWith(".json"))
      .find((x) => JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name)!;
    const full = path.join(dataDir, f);
    writeFileSync(full, JSON.stringify({ ...JSON.parse(readFileSync(full, "utf8")), ...patch }));
  };
  const leave = async (a: { room: Room }) => {
    await a.room.leave(true);
    rooms.splice(rooms.indexOf(a.room), 1);
    await sleep(250);
  };

  /** Dựng người đã chơi tới Luyện Khí tầng 9 sau 48 phút, mang đồ, rồi cho quái đánh chết */
  async function playAndDie(a: Awaited<ReturnType<typeof join>>) {
    const sr = serverRoom(a.room) as any;
    const sid = a.room.sessionId;
    const p = serverState(a.room).players.get(sid)!;
    const c = sr.world.ctrl.get(sid);
    p.realm = 1;
    p.tier = 8;
    c.life = { playMs: 48 * 60_000, kills: 30, bossKills: 0 };
    c.coin = 250;
    c.inv[0] = { itemId: "hac_ho_kiem", qty: 1 };
    p.x = sr.world.map.townPx.x + sr.world.map.townPx.r + 300;
    p.y = sr.world.map.townPx.y;
    const [, m] = [...serverState(a.room).monsters].find(([, mm]) => mm.kind === "lang")!;
    const { hurtPlayer } = await import("../systems/combat");
    hurtPlayer(sr.world, sid, p, 1e9, m);
    return { sr, sid, p, c };
  }

  it("chết thật -> hồ sơ đặt lại ở Hoàng Tuyền, Duyên được cộng, nhận LimboMsg; khoá gameplay; mua mở khóa; đầu thai thành kiếp mới", async () => {
    const name = "Luan Hoi Mot";
    const a = await join(name);
    const { c } = await playAndDie(a);
    const limbo = await waitFor(() => a.limbos[0]);
    expect(limbo.summary).toMatchObject({
      kiep: 1,
      realm: 1,
      tier: 8,
      minutes: 48,
      kills: 30,
      bossKills: 0,
    });
    const gain = limbo.summary.gain;
    expect(gain).toBeGreaterThan(15);
    expect(limbo.soul).toMatchObject({ kiep: 2, duyen: gain });
    expect(limbo.keepable).toEqual(["hac_ho_kiem"]);
    // hồ sơ: đã đặt lại, ở Hoàng Tuyền, đã cộng Duyên; chân linh trong file
    const saved = playerOf(name);
    expect([saved.realm, saved.tier, saved.exp, saved.coin]).toEqual([0, 0, 0, 0]);
    expect(saved.inventory.every((s: unknown) => s === null)).toBe(true);
    expect(saved.limbo).toMatchObject({
      credited: true,
      coinAtDeath: 250,
      counts: true,
      keepable: ["hac_ho_kiem"],
    });
    expect(soulOf(name)).toMatchObject({ kiep: 2, duyen: gain, duyenTotal: gain });
    expect(soulOf(name).history).toHaveLength(1);
    expect(soulOf(name).lastCreditedLife).toBe(saved.limbo.endedLifeId);
    // khoá gameplay: không đi được, không đánh, không hồi sinh theo đồng hồ
    const sp = serverState(a.room).players.get(a.room.sessionId)!;
    const pos = [sp.x, sp.y];
    a.room.send("input", { seq: 1, dx: 1, dy: 0 });
    a.room.send("attack", { angle: 0 });
    await sleep(400);
    expect([sp.x, sp.y]).toEqual(pos);
    expect(sp.dead).toBe(true);

    // mua mở khóa: đủ Duyên thì được (trừ + tăng nấc), không đủ / id rác thì toast và không đổi
    expect(a.souls[0]).toMatchObject({ kiep: 1, duyen: 0, unlocks: {}, origins: [] }); // tin lúc vào phòng
    a.room.send("soulBuy", { id: "du_am" });
    const bought = await waitFor(() => a.souls[1]);
    expect(bought).toMatchObject({ duyen: gain - 12, unlocks: { du_am: 1 } });
    const t0 = a.toasts.length;
    a.room.send("soulBuy", { id: "ky_vat" }); // 25 Duyên: chưa đủ
    for (const junk of ["constructor", "__proto__", 5, null, {}, ["du_am"]])
      a.room.send("soulBuy", { id: junk });
    a.room.send("soulBuy", "rác");
    await waitFor(() => a.toasts.length >= t0 + 2);
    expect(soulOf(name)).toMatchObject({ duyen: gain - 12, unlocks: { du_am: 1 } });
    expect(a.souls).toHaveLength(2); // vào phòng + một lần mua

    // đầu thai: lựa chọn không hợp lệ bị từ chối (chưa mở Ký vật nên không giữ được đồ)
    // Đợi ĐÚNG toast "không hợp lệ", không phải "toast cuối cùng": loạt soulBuy rác ở trên gửi 8 tin
    // nhưng test chỉ đợi 2 toast, nên toast "Mục này không có." đến muộn (máy CI chậm) từng bị bắt
    // nhầm làm phản hồi của rebirth (main đỏ 11/11).
    const t1 = a.toasts.length;
    a.room.send("rebirth", { keep: ["hac_ho_kiem"] });
    await waitFor(() => a.toasts.slice(t1).some((t) => /không hợp lệ/.test(t.text)));
    expect(a.reborns).toHaveLength(0);
    // hợp lệ: gửi hai tin cùng lúc, chỉ một lần đầu thai
    a.room.send("rebirth", { keep: [] });
    a.room.send("rebirth", { keep: [] });
    const reborn = await waitFor(() => a.reborns[0]);
    expect(reborn.kiep).toBe(2);
    await sleep(300);
    expect(a.reborns).toHaveLength(1);
    expect(sp.dead).toBe(false);
    expect([sp.realm, sp.tier]).toEqual([0, 0]);
    const sr = serverRoom(a.room) as any;
    expect(sr.world.map.inTown(sp.x, sp.y)).toBe(true);
    expect(c).toBeDefined();
    const after = playerOf(name);
    expect(after.limbo).toBeUndefined();
    // Hoàng Tuyền đóng: đi lại được, Duyên và mở khóa vẫn còn
    a.room.send("input", { seq: 99, dx: 1, dy: 0 });
    await waitFor(() => a.me().lastSeq === 99);
    expect(soulOf(name)).toMatchObject({ kiep: 2, duyen: gain - 12, unlocks: { du_am: 1 } });
  });

  it("thoát giữa lúc ở Hoàng Tuyền rồi vào lại: nhận lại màn hình Hoàng Tuyền, Duyên KHÔNG bị cộng hai lần", async () => {
    const name = "Luan Hoi Hai";
    const a = await join(name);
    await playAndDie(a);
    const first = await waitFor(() => a.limbos[0]);
    await leave(a);
    const b = await join(name);
    const again = await waitFor(() => b.limbos[0]);
    expect(again.summary).toEqual(first.summary);
    expect(again.soul).toEqual(first.soul);
    expect(b.me().dead).toBe(true);
    expect(b.me().realm).toBe(0);
    expect(soulOf(name).duyen).toBe(first.summary.gain);
    expect(soulOf(name).kiep).toBe(2);
  });

  it("sập giữa lúc ghi hồ sơ và cộng Duyên: vào lại thì cộng đúng một lần rồi hiện màn hình; cộng lại không đổi", async () => {
    const name = "Luan Hoi Ba";
    const { FileSoulStore, soulsDir } = await import("../soul");
    const real = new FileSoulStore(soulsDir());
    let failNext = true;
    WorldRoomClass.souls = {
      get: (id) => real.get(id),
      create: (id, init) => real.create(id, init),
      update: (id, fn) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("đĩa lỗi giữa chừng"));
        }
        return real.update(id, fn);
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const a = await join(name);
      await playAndDie(a);
      await waitFor(() => failNext === false); // lần cộng đầu bị lỗi
      await sleep(300);
      // đã ghi Hoàng Tuyền (đặt lại) nhưng CHƯA cộng Duyên, chưa có màn hình
      expect(playerOf(name).limbo).toMatchObject({ credited: false });
      expect(soulOf(name)).toMatchObject({ kiep: 1, duyen: 0 });
      expect(a.limbos).toHaveLength(0);
      // người chơi bấm đầu thai khi chưa ghi sổ: bị chặn
      a.room.send("rebirth", { keep: [] });
      await sleep(200);
      expect(a.reborns).toHaveLength(0);
      await leave(a);
      // vào lại: cộng bù, hiện màn hình
      const b = await join(name);
      const limbo = await waitFor(() => b.limbos[0]);
      expect(limbo.soul).toMatchObject({ kiep: 2, duyen: limbo.summary.gain });
      expect(soulOf(name)).toMatchObject({ kiep: 2, duyen: limbo.summary.gain });
      expect(playerOf(name).limbo.credited).toBe(true);
      // gọi cộng lần nữa cho cùng kiếp (như chạy lại sau sập): không đổi gì
      const sr = serverRoom(b.room) as any;
      await sr.creditLimbo(b.room.sessionId);
      expect(soulOf(name)).toMatchObject({ kiep: 2, duyen: limbo.summary.gain });
    } finally {
      WorldRoomClass.souls = null;
      vi.restoreAllMocks();
    }
  });

  it("chết ở bản đồ khác: đầu thai xong được đưa về Lạc Hà (travelTo), hồ sơ ghi bản đồ mặc định", async () => {
    const name = "Luan Hoi Bon";
    const hp = getMap(HAC_PHONG_ID)!;
    const first = await join(name);
    await leave(first);
    writePlayer(name, {
      mapId: HAC_PHONG_ID,
      x: Math.round(hp.townPx.x),
      y: Math.round(hp.townPx.y),
    });
    const a = await join(name, secretOf(name), HAC_PHONG_ID);
    const sr = serverRoom(a.room) as any;
    const sid = a.room.sessionId;
    const p = serverState(a.room).players.get(sid)!;
    sr.world.ctrl.get(sid).life = { playMs: 10 * 60_000, kills: 3, bossKills: 0 };
    p.realm = 1;
    p.tier = 2;
    p.x = hp.townPx.x + hp.townPx.r + 600;
    p.y = hp.townPx.y - 300;
    const [, m] = [...serverState(a.room).monsters].find(([, mm]) => mm.kind === "ho")!;
    const { hurtPlayer } = await import("../systems/combat");
    hurtPlayer(sr.world, sid, p, 1e9, m);
    await waitFor(() => a.limbos[0]);
    expect(playerOf(name).mapId).toBe(HAC_PHONG_ID); // chết ở Hắc Phong Cốc: hồ sơ ở lại bản đồ đó cho tới khi đầu thai
    const travel: { mapId: string }[] = [];
    a.room.onMessage("travelTo", (mm: { mapId: string }) => travel.push(mm));
    a.room.send("rebirth", { keep: [] });
    await waitFor(() => travel.length === 1);
    expect(travel[0].mapId).toBe(DEFAULT_MAP_ID);
    await waitFor(() => !a.room.connection.isOpen);
    const saved = playerOf(name);
    expect([saved.mapId, saved.limbo, saved.realm]).toEqual([DEFAULT_MAP_ID, undefined, 0]);
    const b = await join(name); // vào phòng Lạc Hà, còn sống ở trấn
    expect(b.me().dead).toBe(false);
    expect(serverRoom(b.room).mapId).toBe(DEFAULT_MAP_ID);
    expect(soulOf(name).kiep).toBe(2);
  });

  it("vào phòng nhận ngay tin `soul` của chân linh (HUD ghi kiếp N): kiếp, Duyên, mở khóa đúng như trong file", async () => {
    const name = "Luan Hoi Soul";
    const a = await join(name);
    expect(await waitFor(() => a.souls[0])).toMatchObject({ kiep: 1, duyen: 0 });
    await leave(a);
    writeFileSync(
      path.join(dataDir, "souls", `${sha(name)}.json`),
      JSON.stringify({ ...soulOf(name), kiep: 4, duyen: 7, unlocks: { du_am: 2 } }),
    );
    const b = await join(name);
    const soul = await waitFor(() => b.souls[0]);
    expect(soul).toMatchObject({ kiep: 4, duyen: 7, unlocks: { du_am: 2 }, origins: [] });
    expect(b.souls).toHaveLength(1); // chỉ một tin lúc vào, không lặp
    expect(Object.keys(soul).sort()).toEqual(["duyen", "kiep", "origins", "unlocks"]); // SoulView, không lộ lịch sử / mã kiếp
  });

  it("hồ sơ Hoàng Tuyền hỏng trong file (kiểu sai, id vật phẩm lạ) được làm sạch khi vào game", async () => {
    const name = "Luan Hoi Nam";
    const a = await join(name);
    await leave(a);
    writePlayer(name, {
      limbo: {
        endedLifeId: "life-x-0123456789",
        summary: {
          kiep: -4,
          realm: "a",
          tier: 1e30,
          minutes: -1,
          kills: "x",
          bossKills: null,
          gain: Infinity,
        },
        keepable: ["hoi_huyet_dan", "khong_co", 5, "hac_ho_kiem"],
        coinAtDeath: -9,
        counts: "yes",
        credited: true,
      },
    });
    const b = await join(name);
    const limbo = await waitFor(() => b.limbos[0]);
    expect(limbo.keepable).toEqual(["hac_ho_kiem"]); // chỉ trang bị có thật
    expect(limbo.summary.kiep).toBe(1);
    for (const v of [
      limbo.summary.minutes,
      limbo.summary.kills,
      limbo.summary.bossKills,
      limbo.summary.gain,
    ])
      expect(Number.isInteger(v) && v >= 0).toBe(true);
    // hồ sơ hỏng hẳn (không có endedLifeId): coi như không ở Hoàng Tuyền
    await leave(b);
    writePlayer(name, { limbo: { summary: {} } });
    const c = await join(name);
    await sleep(300);
    expect(c.limbos).toHaveLength(0);
    expect(c.me().dead).toBe(false);
  });
});
