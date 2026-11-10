// Test thử tải luân hồi (M3.2, Issue #151):
// 1. Chết hàng loạt: nhiều client cùng chết trong 1 tick, tải ghi file kép (nhân vật + chân linh)
// 2. Đua soulBuy: nhiều tin nhắn soulBuy gửi đồng thời trên cùng một chân linh (không âm Duyên, nấc hợp lệ)
// 3. Rớt mạng ở Hoàng Tuyền: ngắt kết nối khi đang ở Hoàng Tuyền, vào lại không cộng Duyên lần hai, không mất Duyên
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-reincarnation-stress-"));
process.env.DATA_DIR = dataDir;

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import {
  DEFAULT_MAP_ID,
  roomNameOf,
  type LimboMsg,
  type SoulMsg,
  type RebornMsg,
  type SoulBuyMsg,
  type RebirthMsg,
} from "@tien-gioi/shared";

const PORT = 43000 + Math.floor(Math.random() * 4000);
let server: Server;
const activeRooms: Room[] = [];

beforeAll(async () => {
  const { defineRooms } = await import("./WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(PORT);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(activeRooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(50);
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

let botSeq = 0;
const secretOf = (name: string) => `secret-${name}-0123456789abcdef`;

async function joinClient(name = `Bot ${++botSeq}`) {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), {
    name,
    secret: secretOf(name),
  });
  const limbos: LimboMsg[] = [];
  const souls: SoulMsg[] = [];
  const reborns: RebornMsg[] = [];
  room.onMessage("limbo", (m: LimboMsg) => limbos.push(m));
  room.onMessage("soul", (m: SoulMsg) => souls.push(m));
  room.onMessage("reborn", (m: RebornMsg) => reborns.push(m));
  activeRooms.push(room);
  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  return {
    room,
    name,
    limbos,
    souls,
    reborns,
    me: () => (room.state as any).players.get(room.sessionId),
  };
}

function serverRoom(room: Room): any {
  return matchMaker.getLocalRoomById(room.roomId) as any;
}

const sha = (name: string) =>
  createHash("sha1").update(name.normalize("NFC").toLowerCase()).digest("hex");
const soulOf = (name: string) =>
  JSON.parse(readFileSync(path.join(dataDir, "souls", `${sha(name)}.json`), "utf8"));
const playerOf = (name: string) => {
  const f = readdirSync(dataDir)
    .filter((x) => x.endsWith(".json"))
    .find((x) => {
      try {
        return JSON.parse(readFileSync(path.join(dataDir, x), "utf8")).name === name;
      } catch {
        return false;
      }
    });
  return f ? JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) : null;
};

describe("Thử tải luân hồi (Issue #151)", () => {
  // Tính nguyên tử của cập nhật chân linh được đảm bảo bởi hàng đợi FileSoulStore.update (đã test ở soul.test.ts #159).
  // Test này kiểm tra bất biến cấp phòng game: khi client spam nhiều tin soulBuy dồn dập, Duyên không âm và nấc mở đúng.
  it("bất biến soulBuy: 20 tin nhắn soulBuy dồn dập trên cùng một chân linh -> Duyên không bao giờ âm, nấc mở đúng", async () => {
    const name = `Dua ${++botSeq}`;
    const c = await joinClient(name);
    const sr = serverRoom(c.room);
    const p = sr.state.players.get(c.room.sessionId)!;
    const ctrl = sr.world.ctrl.get(c.room.sessionId)!;

    // Đưa ra ngoài trấn, Luyện Khí tầng 8, chơi 48 phút -> 22 Duyên (đủ mở nấc 1 giá 12, thiếu cho nấc 2 giá 18)
    p.realm = 1;
    p.tier = 8;
    p.exp = 100;
    ctrl.life = { playMs: 48 * 60_000, kills: 30, bossKills: 0 };
    p.x = sr.world.map.townPx.x + sr.world.map.townPx.r + 300;
    p.y = sr.world.map.townPx.y;

    // Cho nhân vật chết do quái
    const [, m] = [...sr.state.monsters].find(([, mm]) => mm.kind === "lang")!;
    const { hurtPlayer } = await import("../systems/combat");
    hurtPlayer(sr.world, c.room.sessionId, p, 1e9, m);

    // Chờ nhận tin LimboMsg
    const limbo = await waitFor(() => c.limbos[0]);
    expect(limbo).toBeDefined();
    expect(limbo.summary.gain).toBe(22);
    expect(limbo.soul.duyen).toBe(22);

    // Gửi 20 tin soulBuy liên tiếp cùng lúc cho 'du_am'
    for (let i = 0; i < 20; i++) {
      c.room.send("soulBuy", { id: "du_am" } satisfies SoulBuyMsg);
    }

    // Đợi server xử lý xong các tin trong hàng đợi nguyên tử
    await sleep(400);

    const soulData = soulOf(name);
    expect(soulData.duyen).toBeGreaterThanOrEqual(0);
    // 22 Duyên chỉ đủ mở nấc 1 (12 Duyên), nấc 2 cần 18 Duyên nữa (tổng 30 > 22) -> chỉ mở nấc 1
    expect(soulData.unlocks.du_am).toBe(1);
    expect(soulData.duyen).toBe(22 - 12);
    expect(soulData.duyenTotal).toBe(22);
  });

  it("chết hàng loạt: 10 người chơi chết cùng lúc -> ghi kép file nhân vật + chân linh toàn vẹn, audit-saves sạch lỗi", async () => {
    const clients = await Promise.all(
      Array.from({ length: 10 }, () => joinClient(`Hang ${++botSeq}`)),
    );

    const { hurtPlayer } = await import("../systems/combat");

    for (const c of clients) {
      const sr = serverRoom(c.room);
      const p = sr.state.players.get(c.room.sessionId)!;
      const ctrl = sr.world.ctrl.get(c.room.sessionId)!;
      p.realm = 1;
      p.tier = 2;
      ctrl.life = { playMs: 10 * 60_000, kills: 5, bossKills: 0 };
      p.x = sr.world.map.townPx.x + sr.world.map.townPx.r + 300;
      p.y = sr.world.map.townPx.y;
    }

    // Đồng loạt hạ gục cả 10 bot trong cùng một đợt
    for (const c of clients) {
      const sr = serverRoom(c.room);
      const p = sr.state.players.get(c.room.sessionId)!;
      const [, m] = [...sr.state.monsters].find(([, mm]) => mm.kind === "lang")!;
      hurtPlayer(sr.world, c.room.sessionId, p, 1e9, m);
    }

    // Chờ toàn bộ 10 bot nhận được tin LimboMsg
    await Promise.all(clients.map((c) => waitFor(() => c.limbos[0])));

    // Cả 10 bot đều ở trạng thái dead: true
    for (const c of clients) {
      await waitFor(() => c.me().dead);
      expect(c.limbos[0].summary.gain).toBeGreaterThan(0);
    }

    // Kiểm tra tính toàn vẹn của dữ liệu bằng auditSavesDirectory (#151)
    const { auditSavesDirectory } = await import("../../scripts/audit-saves");
    const report = auditSavesDirectory(dataDir);
    expect(report.errorFiles).toBe(0);
    expect(report.errorSouls).toBe(0);
    expect(report.totalSouls).toBeGreaterThanOrEqual(10);
    expect(report.cleanSouls).toBe(report.totalSouls);
  });

  it("rớt mạng ở Hoàng Tuyền: ngắt kết nối khi đang ở Hoàng Tuyền, vào lại nhận lại LimboMsg và KHÔNG bị cộng Duyên hai lần", async () => {
    const name = `Rot ${++botSeq}`;
    const c = await joinClient(name);
    const sr = serverRoom(c.room);
    const p = sr.state.players.get(c.room.sessionId)!;
    const ctrl = sr.world.ctrl.get(c.room.sessionId)!;

    p.realm = 1;
    p.tier = 3;
    ctrl.life = { playMs: 12 * 60_000, kills: 8, bossKills: 0 };
    p.x = sr.world.map.townPx.x + sr.world.map.townPx.r + 300;
    p.y = sr.world.map.townPx.y;

    const [, m] = [...sr.state.monsters].find(([, mm]) => mm.kind === "lang")!;
    const { hurtPlayer } = await import("../systems/combat");
    hurtPlayer(sr.world, c.room.sessionId, p, 1e9, m);

    const firstLimbo = await waitFor(() => c.limbos[0]);
    const firstGain = firstLimbo.summary.gain;
    const soulBefore = soulOf(name);
    expect(soulBefore.duyen).toBe(firstGain);

    // Rớt mạng ngay lập tức tại Hoàng Tuyền (chưa bấm đầu thai)
    await c.room.leave(true);
    await sleep(200);

    // Đăng nhập lại vào phòng
    const c2 = await joinClient(name);
    // Nhận lại màn hình Hoàng Tuyền
    const secondLimbo = await waitFor(() => c2.limbos[0]);
    expect(secondLimbo).toBeDefined();

    // Duyên KHÔNG bị cộng lần hai nhờ lastCreditedLife
    const soulAfter = soulOf(name);
    expect(soulAfter.duyen).toBe(firstGain);
    expect(soulAfter.duyenTotal).toBe(firstGain);
    expect(soulAfter.kiep).toBe(soulBefore.kiep);

    // Đầu thai thành công
    c2.room.send("rebirth", { origin: "pham_gia", keep: [] } satisfies RebirthMsg);
    const reborn = await waitFor(() => c2.reborns[0]);
    expect(reborn.kiep).toBe(soulAfter.kiep);
    await waitFor(() => !c2.me().dead);

    // Chờ file nhân vật được cập nhật và sạch hồ sơ limbo
    await waitFor(() => playerOf(name)?.limbo === undefined);
  });
});
