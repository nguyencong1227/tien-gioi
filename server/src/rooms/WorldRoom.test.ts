// Test tích hợp: chạy server Colyseus thật trong tiến trình, kết nối bằng colyseus.js như client thật.
// Dùng để đảm bảo hành vi không đổi khi tách / sửa logic server.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  ROOM_NAME, MONSTER_CAP, TOWN_PX, SKILLS, expToNext, statsFor, type ChatOut, type ToastMsg,
} from "@tien-gioi/shared";
import type { WorldRoom } from "./WorldRoom";
import type { WorldState } from "../schema";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-test-"));
const PORT = 41000 + Math.floor(Math.random() * 5000);
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir; // store.ts đọc biến này lúc nạp module
  const { WorldRoom } = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  server.define(ROOM_NAME, WorldRoom);
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

async function join(name = `Thu ${++nameSeq}`, secret = secretOf(name)) {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(ROOM_NAME, { name, secret });
  const chat: ChatOut[] = [];
  const toasts: ToastMsg[] = [];
  room.onMessage("chat", (m: ChatOut) => chat.push(m));
  room.onMessage("toast", (m: ToastMsg) => toasts.push(m));
  room.onMessage("fx", () => {});
  room.onMessage("dmg", () => {});
  rooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return { room, name, chat, toasts, me: () => (room.state as any).players.get(room.sessionId) };
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
    await expect(client.joinOrCreate(ROOM_NAME, { name: "a", secret: secretOf("a") })).rejects.toThrow(/2–16 ký tự/);
    await expect(client.joinOrCreate(ROOM_NAME, { name: "<script>", secret: secretOf("x") })).rejects.toThrow();
  });

  it("từ chối khi thiếu mã nhân vật", async () => {
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(client.joinOrCreate(ROOM_NAME, { name: "Khong Ma", secret: "ngan" })).rejects.toThrow(/mã nhân vật/);
  });

  it("nhân vật mới bắt đầu ở Phàm Nhân, trong trấn, đủ quái trên bản đồ", async () => {
    const { room, me } = await join();
    const p = me();
    expect(p.realm).toBe(0);
    expect(p.tier).toBe(0);
    expect(p.hp).toBe(statsFor(0, 0).maxHp);
    expect(p.expMax).toBe(expToNext(0, 0));
    expect(Math.hypot(p.x - TOWN_PX.x, p.y - TOWN_PX.y)).toBeLessThan(TOWN_PX.r);
    const total = Object.values(MONSTER_CAP).reduce((a, b) => a + b, 0);
    await waitFor(() => (room.state as any).monsters.size > 0);
    expect((room.state as any).monsters.size).toBeLessThanOrEqual(total);
    expect((room.state as any).monsters.size).toBeGreaterThan(total * 0.8);
  });

  it("không cho cùng một nhân vật vào hai lần cùng lúc", async () => {
    const a = await join("Song Sinh");
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(client.joinOrCreate(ROOM_NAME, { name: "song sinh", secret: secretOf("Song Sinh") })).rejects.toThrow(/đang ở trong game/);
    expect(a.me()).toBeTruthy();
  });

  it("tên đã có chủ thì mã khác không vào được", async () => {
    const a = await join("Chu Nhan");
    await a.room.leave(true);
    rooms.length = 0;
    await sleep(150);
    const client = new Client(`ws://localhost:${PORT}`);
    await expect(client.joinOrCreate(ROOM_NAME, { name: "Chu Nhan", secret: secretOf("ke gian") })).rejects.toThrow(/đã có người dùng/);
  });
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
      m.x = p.x + dx; m.y = p.y;
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
    await waitFor(() => !serverState(room).monsters.has(id) || serverState(room).monsters.get(id)!.hp < before);
    // Hạ máu còn 1 rồi đánh tiếp để chắc chắn giết được
    const mon = serverState(room).monsters.get(id);
    if (mon) {
      mon.hp = 1;
      const p = serverState(room).players.get(room.sessionId)!;
      mon.x = p.x + 30; mon.y = p.y;
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

  it("bị quái đánh hết máu thì trọng thương và mất tu vi", async () => {
    const { room, me, toasts } = await join();
    const st = serverState(room);
    const p = st.players.get(room.sessionId)!;
    // Đưa người chơi ra ngoài trấn, đặt Hôi Lang sát bên
    p.x = TOWN_PX.x + TOWN_PX.r + 300; p.y = TOWN_PX.y;
    p.exp = 30;
    p.hp = 1;
    for (const m of st.monsters.values()) {
      if (m.kind !== "lang") continue;
      m.x = p.x + 20; m.y = p.y;
      break;
    }
    await waitFor(() => me().dead, 4000);
    expect(me().exp).toBe(27); // mất 10%
    expect(toasts.some((t) => t.tone === "bad")).toBe(true);
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
    p.realm = 1; p.tier = 3; p.exp = 12;
    await room.leave(true);
    rooms.length = 0;
    const saved = await waitFor(() => {
      for (const f of readdirSync(dataDir)) {
        const j = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
        if (j.name === "Luu Tru" && j.realm === 1) return j;
      }
    });
    expect(saved).toMatchObject({ realm: 1, tier: 3, exp: 12 });
    expect(saved.secretHash).not.toContain("secret"); // không lưu mã gốc
  });
});
