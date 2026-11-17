// Test kịch bản thử tải & đối kháng Bot né vùng cảnh báo trùm trên máy chủ Colyseus THẬT (M42, Issue #876 T7).
// Kiểm tra:
// 1. Bot kết nối phòng Colyseus thật, nhận tin fx "warn" từ máy chủ.
// 2. Bot bật né (evade = true): nhận diện vùng nguy hiểm (circle r0 vành khuyên, cone nón, line đường, circle đặc),
//    tính vector né thoát hiểm và gửi input di chuyển ra ngoài vùng an toàn trước thời hạn đáp đòn.
// 3. So sánh tỉ lệ dính đòn / né thoát: Bot né đạt tỉ lệ né thoát 100%, Bot không né dính đòn 100%.
// 4. Đo đạc thời gian phản xạ và số tick di chuyển cần thiết để thoát khỏi các loại hình cảnh báo của trùm.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { PROTOCOL_VERSION, ROOM_NAME } from "@tien-gioi/shared";
import { listenWithRetry } from "../src/test-port";
import {
  type BotState,
  computeEvadeVector,
  isPointInWarnZone,
  parseWarnZoneFromFx,
  updateBotWarns,
} from "./bots";

const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-boss-bot-"));
let PORT = 0;
let server: Server;
const rooms: Room[] = [];

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  const mod = await import("../src/rooms/WorldRoom");
  server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false });
  mod.defineRooms(server);
  PORT = await listenWithRetry(server);
});

afterEach(async () => {
  await Promise.all(rooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
  await sleep(150);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
  rmSync(dataDir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => unknown, ms = 4000, what = "điều kiện") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`Hết thời gian chờ ${what}`);
    await sleep(10);
  }
}

const serverRoom = (room: Room) => matchMaker.getLocalRoomById(room.roomId) as any;
const serverPlayer = (room: Room) => serverRoom(room).state.players.get(room.sessionId);

let seq = 0;
async function createTestBot(
  evade = true,
  startX = 1000,
  startY = 1080,
  targetRoomId?: string,
  reflexMs = 400,
  ignoreWarn = false,
): Promise<{
  room: Room;
  bot: BotState;
  receivedWarns: any[];
}> {
  const name = `BotBoss ${++seq}`;
  const client = new Client(`ws://localhost:${PORT}`);
  const options = {
    name,
    secret: `secret-${name}-0123456789abcdef`,
    v: PROTOCOL_VERSION,
  };

  const room = targetRoomId
    ? await client.joinById(targetRoomId, options)
    : await client.create(ROOM_NAME, options);
  rooms.push(room);

  await waitFor(() => (room.state as any)?.players?.get(room.sessionId));
  // Phòng KHÔNG có quái thật: các `warn` trong test đều do test tự phát (`broadcast`); một con quái thật (trùm, hổ lao, đập đất) đứng gần bot cũng gửi `warn` làm các khẳng định
  // đếm "đúng 1 warn" đỏ chập chờn (CI của #898: `expected ... to have a length of 1 but got 2`). Không bật `BOSS_MOVES` vì test không cần trùm chạy bộ chiêu.
  const world = serverRoom(room).world;
  for (const id of [...world.state.monsters.keys()]) {
    world.state.monsters.delete(id);
    world.mctrl.delete(id);
  }

  const receivedWarns: any[] = [];
  const bot = {
    name,
    room,
    predX: startX,
    predY: startY,
    evade,
    reflexMs,
    warns: [],
    evadeCount: 0,
    warnsTargetedCount: 0,
    warnsEvadedCount: 0,
    warnsHitCount: 0,
  } as unknown as BotState;

  const p = serverPlayer(room);
  p.x = startX;
  p.y = startY;

  room.onMessage("fx", (msg: any) => {
    if (msg.kind === "warn") {
      receivedWarns.push(msg);
      if (!ignoreWarn) {
        const zone = parseWarnZoneFromFx(msg, performance.now(), bot.reflexMs ?? 400);
        if (zone) {
          zone.targeted = isPointInWarnZone(bot.predX, bot.predY, zone, 0);
          if (zone.targeted) {
            bot.warnsTargetedCount++;
          }
          bot.warns.push(zone);
        }
      }
    }
  });

  return { room, bot, receivedWarns };
}

describe("Kịch bản thử tải Bot né vùng cảnh báo trùm trên máy chủ Colyseus thật (M42 T7, Issue #876)", () => {
  it("1. Bot nhận tin fx warn từ phòng thật và giải mã đúng các trường hình học", async () => {
    const { room, bot, receivedWarns } = await createTestBot(true, 1000, 1080);
    const sr = serverRoom(room);

    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 150,
      r0: 50, // Vành khuyên
      ms: 1000,
    });

    await waitFor(() => receivedWarns.length > 0, 2000, "bot nhận được tin fx warn");
    expect(receivedWarns).toHaveLength(1);
    expect(receivedWarns[0].shape).toBe("circle");
    expect(receivedWarns[0].r0).toBe(50);
    expect(bot.warns).toHaveLength(1);
    expect(bot.warns[0].r0).toBe(50);
    expect(bot.warns[0].targeted).toBe(true);
  });

  it("2. Đối chứng tỉ lệ né: Bot bật evade né thoát 100%, Bot không né dính đòn 100% trong vành khuyên trùm", async () => {
    const { room: r1, bot: botEvade } = await createTestBot(true, 1000, 1070);
    const { room: _r2, bot: botStand } = await createTestBot(false, 1000, 1070, r1.roomId);
    const sr = serverRoom(r1);

    const warnDurationMs = 800; // Báo trước 800 ms chuẩn thiết kế
    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 150,
      r0: 50,
      ms: warnDurationMs,
    });

    await waitFor(
      () => botEvade.warns.length > 0 && botStand.warns.length > 0,
      2000,
      "cả 2 nhận warn",
    );
    expect(botEvade.warns).toHaveLength(1);
    expect(botStand.warns).toHaveLength(1);

    const warnZone = botEvade.warns[0];
    const expiresAt = warnZone.expiresAt;
    const t0 = warnZone.warnAt ?? expiresAt - warnDurationMs;
    const speed = 150; // px/s

    // 16 tick (800 ms) di chuyển trước khi đòn đáp
    for (let tick = 0; tick < 16; tick++) {
      const curT = t0 + tick * 50;
      updateBotWarns(botEvade, curT, true);
      updateBotWarns(botStand, curT, true);

      if (botEvade.evade && botEvade.warns.length > 0) {
        const vec = computeEvadeVector(botEvade.predX, botEvade.predY, botEvade.warns, curT);
        if (vec) {
          botEvade.predX += vec.dx * speed * 0.05;
          botEvade.predY += vec.dy * speed * 0.05;
          botEvade.evadeCount++;
        }
      }
    }

    // Kết thúc đòn đánh tại thời điểm hết hạn expiresAt
    updateBotWarns(botEvade, expiresAt, true);
    updateBotWarns(botStand, expiresAt, true);

    // Bot né: đã di chuyển vào lõi an toàn hoặc ra ngoài rìa
    expect(botEvade.warnsEvadedCount).toBe(1);
    expect(botEvade.warnsHitCount).toBe(0);
    expect(botEvade.evadeCount).toBeGreaterThan(0);

    // Bot đứng: dính đòn 100%
    expect(botStand.warnsHitCount).toBe(1);
    expect(botStand.warnsEvadedCount).toBe(0);
  });

  it("3. Bot né nón quạt (cone) của trùm thành công trước khi đòn đáp", async () => {
    // Trùm tại (1000, 1000), nón góc 0 (sang phải +x), góc mở pi/2, r = 250
    // Bot đứng tại (1200, 1050) nằm ở nửa ngoài của nón (cách tâm ~206 px > 0.7 * r)
    const { room, bot } = await createTestBot(true, 1200, 1050);
    const sr = serverRoom(room);

    const warnDurationMs = 1000;
    sr.broadcast("fx", {
      kind: "warn",
      shape: "cone",
      x: 1000,
      y: 1000,
      r: 250,
      angle: 0,
      arc: Math.PI / 2,
      ms: warnDurationMs,
    });

    await waitFor(() => bot.warns.length > 0, 2000, "bot nhận warn nón");
    expect(bot.warns).toHaveLength(1);
    expect(bot.warns[0].targeted).toBe(true);

    const expiresAt = bot.warns[0].expiresAt;
    const t0 = expiresAt - warnDurationMs;
    const speed = 150;

    // 18 tick (900 ms) di chuyển né
    for (let tick = 0; tick < 18; tick++) {
      const curT = t0 + tick * 50;
      updateBotWarns(bot, curT, true);
      const vec = computeEvadeVector(bot.predX, bot.predY, bot.warns, curT);
      if (vec) {
        bot.predX += vec.dx * speed * 0.05;
        bot.predY += vec.dy * speed * 0.05;
        bot.evadeCount++;
      }
    }

    // Đòn đáp xuống
    updateBotWarns(bot, expiresAt, true);
    expect(bot.warnsEvadedCount).toBe(1);
    expect(bot.warnsHitCount).toBe(0);
    expect(bot.evadeCount).toBeGreaterThan(0);
  });

  it("4. Bot né đòn lao thẳng (line) của trùm thành công trước khi đòn đáp", async () => {
    // Trùm tại (1000, 1000), lao thẳng sang phải (angle = 0), tầm xa r = 300, bề rộng vệt w = 60
    // Bot đứng tại (1150, 1015) (cách trục lao 15 px < w/2 + 20 px nguy hiểm)
    const { room, bot } = await createTestBot(true, 1150, 1015);
    const sr = serverRoom(room);

    const warnDurationMs = 800;
    sr.broadcast("fx", {
      kind: "warn",
      shape: "line",
      x: 1000,
      y: 1000,
      r: 300,
      w: 60,
      angle: 0,
      ms: warnDurationMs,
    });

    await waitFor(() => bot.warns.length > 0, 2000, "bot nhận warn đường lao");
    expect(bot.warns).toHaveLength(1);
    expect(bot.warns[0].targeted).toBe(true);

    const expiresAt = bot.warns[0].expiresAt;
    const t0 = expiresAt - warnDurationMs;
    const speed = 150;

    // 14 tick (700 ms) di chuyển né vuông góc ra khỏi vệt lao
    for (let tick = 0; tick < 14; tick++) {
      const curT = t0 + tick * 50;
      updateBotWarns(bot, curT, true);
      const vec = computeEvadeVector(bot.predX, bot.predY, bot.warns, curT);
      if (vec) {
        bot.predX += vec.dx * speed * 0.05;
        bot.predY += vec.dy * speed * 0.05;
        bot.evadeCount++;
      }
    }

    // Đòn đáp xuống
    updateBotWarns(bot, expiresAt, true);
    expect(bot.warnsEvadedCount).toBe(1);
    expect(bot.warnsHitCount).toBe(0);
    expect(bot.evadeCount).toBeGreaterThan(0);
  });

  it("5. Thử tải đa bot (10 bot) trên Colyseus thật: 5 bot né thoát 100% vs 5 bot đứng yên dính đòn 100%", async () => {
    // Tạo bot đầu tiên để lấy room ID
    const firstBotResult = await createTestBot(true, 1000, 1080);
    const primaryRoom = firstBotResult.room;
    const evadeBots: BotState[] = [firstBotResult.bot];
    const standBots: BotState[] = [];

    // 4 bot né tiếp theo join vào cùng primaryRoom
    for (let i = 1; i < 5; i++) {
      const { bot } = await createTestBot(true, 1000 + i * 5, 1080, primaryRoom.roomId);
      evadeBots.push(bot);
    }
    // 5 bot đứng yên join vào primaryRoom
    for (let i = 0; i < 5; i++) {
      const { bot } = await createTestBot(false, 1000 + i * 5, 1080, primaryRoom.roomId);
      standBots.push(bot);
    }

    const sr = serverRoom(primaryRoom);
    const warnDurationMs = 800;

    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 160,
      r0: 50,
      ms: warnDurationMs,
    });

    await waitFor(
      () =>
        evadeBots.every((b) => b.warns.length > 0) && standBots.every((b) => b.warns.length > 0),
      3000,
      "toàn bộ 10 bot nhận được cảnh báo",
    );

    const speed = 150;

    // 14 tick (700 ms) mô phỏng vòng lặp game
    for (let tick = 0; tick < 14; tick++) {
      for (const b of evadeBots) {
        const curT = b.warns[0].expiresAt - warnDurationMs + tick * 50;
        updateBotWarns(b, curT, true);
        if (b.evade && b.warns.length > 0) {
          const vec = computeEvadeVector(b.predX, b.predY, b.warns, curT);
          if (vec) {
            b.predX += vec.dx * speed * 0.05;
            b.predY += vec.dy * speed * 0.05;
            b.evadeCount++;
          }
        }
      }
      for (const b of standBots) {
        const curT = b.warns[0].expiresAt - warnDurationMs + tick * 50;
        updateBotWarns(b, curT, true);
      }
    }

    // Đòn đáp xuống
    for (const b of evadeBots) {
      updateBotWarns(b, b.warns[0].expiresAt, true);
    }
    for (const b of standBots) {
      updateBotWarns(b, b.warns[0].expiresAt, true);
    }

    // Kiểm tra kết quả 5 bot né: 100% thành công (5/5 né, 0 dính)
    const totalEvaded = evadeBots.reduce((s, b) => s + b.warnsEvadedCount, 0);
    const totalEvadeHit = evadeBots.reduce((s, b) => s + b.warnsHitCount, 0);
    expect(totalEvaded).toBe(5);
    expect(totalEvadeHit).toBe(0);

    // Kiểm tra kết quả 5 bot đứng yên: 100% dính đòn (5/5 dính, 0 né)
    const totalStandHit = standBots.reduce((s, b) => s + b.warnsHitCount, 0);
    const totalStandEvaded = standBots.reduce((s, b) => s + b.warnsEvadedCount, 0);
    expect(totalStandHit).toBe(5);
    expect(totalStandEvaded).toBe(0);
  });

  it("6. Lời hứa công bằng: Bot phản xạ 400 ms vẫn né thoát 100% trước đòn báo trước 800 ms", async () => {
    // Bot đứng ở vị trí (1000, 1070) trong vành khuyên trùm
    const { room, bot } = await createTestBot(true, 1000, 1070, undefined, 400);
    const sr = serverRoom(room);
    const warnDurationMs = 800;

    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 160,
      r0: 50,
      ms: warnDurationMs,
    });

    await waitFor(() => bot.warns.length > 0, 2000, "bot nhận warn");
    expect(bot.warns).toHaveLength(1);
    expect(bot.warns[0].targeted).toBe(true);

    const warnZone = bot.warns[0];
    const expiresAt = warnZone.expiresAt;
    const t0 = warnZone.warnAt ?? expiresAt - warnDurationMs;
    const speed = 150; // 150 px/s

    // 14 tick (700 ms) di chuyển
    for (let tick = 0; tick < 14; tick++) {
      const curT = t0 + tick * 50;
      updateBotWarns(bot, curT, true);
      const vec = computeEvadeVector(bot.predX, bot.predY, bot.warns, curT);
      if (vec) {
        bot.predX += vec.dx * speed * 0.05;
        bot.predY += vec.dy * speed * 0.05;
        bot.evadeCount++;
      }
    }

    // Đòn đáp xuống
    updateBotWarns(bot, expiresAt, true);
    // Dù chờ 400 ms phản xạ (chỉ còn 400 ms để chạy = 8 tick = 60 px), bot vẫn thoát hiểm thành công
    expect(bot.warnsEvadedCount).toBe(1);
    expect(bot.warnsHitCount).toBe(0);
    expect(bot.evadeCount).toBeGreaterThan(0);
  });

  it("7. Đột biến 1: Bot phản xạ chậm 900 ms (lớn hơn thời gian báo trước 800 ms) -> dính đòn (ĐỎ)", async () => {
    // Phản xạ 900 ms > 800 ms: khi đòn đáp thì bot vẫn chưa bắt đầu chạy né
    const { room, bot } = await createTestBot(true, 1000, 1070, undefined, 900);
    const sr = serverRoom(room);
    const warnDurationMs = 800;

    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 160,
      r0: 50,
      ms: warnDurationMs,
    });

    await waitFor(() => bot.warns.length > 0, 2000, "bot nhận warn");
    expect(bot.warns).toHaveLength(1);
    expect(bot.warns[0].targeted).toBe(true);

    const warnZone = bot.warns[0];
    const expiresAt = warnZone.expiresAt;
    const t0 = warnZone.warnAt ?? expiresAt - warnDurationMs;
    const speed = 150;

    // Trong 800 ms đầu (16 tick), vì reflexMs = 900 ms nên bot không cử động
    for (let tick = 0; tick < 16; tick++) {
      const curT = t0 + tick * 50;
      updateBotWarns(bot, curT, true);
      const vec = computeEvadeVector(bot.predX, bot.predY, bot.warns, curT);
      if (vec) {
        bot.predX += vec.dx * speed * 0.05;
        bot.predY += vec.dy * speed * 0.05;
        bot.evadeCount++;
      }
    }

    // Đòn đáp xuống tại 800 ms
    updateBotWarns(bot, expiresAt, true);
    // Khẳng định bot bị dính đòn vì phản xạ quá chậm
    expect(bot.warnsHitCount).toBe(1);
    expect(bot.warnsEvadedCount).toBe(0);
    expect(bot.evadeCount).toBe(0); // Chưa kịp chạy một bước nào
  });

  it("8. Đột biến 2: Bỏ qua tin nhắn fx warn -> bot không nhận diện được đòn và dính đòn 100% (ĐỎ)", async () => {
    // ignoreWarn = true: bot nhận tin fx warn từ server nhưng bỏ qua (không phân tích vào danh sách warns)
    const { room, bot, receivedWarns } = await createTestBot(
      true,
      1000,
      1070,
      undefined,
      400,
      true,
    );
    const sr = serverRoom(room);
    const warnDurationMs = 800;

    sr.broadcast("fx", {
      kind: "warn",
      shape: "circle",
      x: 1000,
      y: 1000,
      r: 160,
      r0: 50,
      ms: warnDurationMs,
    });

    await waitFor(() => receivedWarns.length > 0, 2000, "bot nhận được tin fx");
    // Vì bỏ qua phân tích warn nên bot.warns rỗng
    expect(bot.warns).toHaveLength(0);

    const warnZone = parseWarnZoneFromFx(receivedWarns[0], performance.now(), 0)!;
    const expiresAt = warnZone.expiresAt;
    const t0 = expiresAt - warnDurationMs;
    const speed = 150;

    // Trong 800 ms báo trước, bot không hề có ý niệm né (computeEvadeVector luôn trả về null)
    for (let tick = 0; tick < 16; tick++) {
      const curT = t0 + tick * 50;
      const vec = computeEvadeVector(bot.predX, bot.predY, bot.warns, curT);
      if (vec) {
        bot.predX += vec.dx * speed * 0.05;
        bot.predY += vec.dy * speed * 0.05;
        bot.evadeCount++;
      }
    }

    // Bot không di chuyển bước nào
    expect(bot.evadeCount).toBe(0);
    expect(bot.predX).toBe(1000);
    expect(bot.predY).toBe(1070);

    // Môi trường chấm điểm trúng đòn: bot vẫn ở trong vùng sát thương
    const hit = isPointInWarnZone(bot.predX, bot.predY, warnZone, 0);
    expect(hit).toBe(true);
  });
});
