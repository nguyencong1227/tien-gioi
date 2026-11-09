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
  ROOM_NAME,
  MONSTER_CAP,
  TOWN_PX,
  SKILLS,
  expToNext,
  statsFor,
  type ChatOut,
  type ToastMsg,
  type InvMsg,
  type QuestsMsg,
  type DialogMsg,
  NPC_BY_ID,
  QUEST_BY_ID,
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
  const invs: InvMsg[] = [];
  room.onMessage("inv", (m: InvMsg) => invs.push(m));
  const quests: QuestsMsg[] = [];
  const dialogs: DialogMsg[] = [];
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
    quests,
    dialogs,
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
    const total = Object.values(MONSTER_CAP).reduce((a, b) => a + b, 0);
    await waitFor(() => (room.state as any).monsters.size > 0);
    expect((room.state as any).monsters.size).toBeLessThanOrEqual(total);
    expect((room.state as any).monsters.size).toBeGreaterThan(total * 0.8);
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

  it("bị quái đánh hết máu thì trọng thương và mất tu vi", async () => {
    const { room, me, toasts } = await join();
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
    p.realm = 1;
    p.tier = 3;
    p.exp = 12;
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
