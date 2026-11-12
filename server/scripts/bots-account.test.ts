// Kiểm thử bot chế độ tài khoản (--account) và kịch bản bão đăng nhập (--login-storm) (Issue #176, M3.3 bước 3f).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { DEFAULT_MAP_ID, roomNameOf, TICK_MS } from "@tien-gioi/shared";
import { FileAccountStore, FileSessionStore } from "../src/account-store";
import type { PlayerStore } from "../src/player-store";
import type { SavedPlayer } from "../src/store";
import { FileSoulStore } from "../src/soul";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "../src/auth";
import { REGISTER_PER_IP, type Kdf } from "../src/auth-service";
import { mountAuth } from "../src/auth-http";
import { defineRooms, WorldRoom } from "../src/rooms/WorldRoom";
import { makeWorld, addPlayer } from "../src/systems/test-helpers";
import { tickWorld } from "../src/systems/tick";
import { authBotAccount, runLoginStorm } from "./bots";
import { freePort } from "../src/test-port";

const rootDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-bots-acc-"));
afterAll(() => rmSync(rootDir, { recursive: true, force: true }));

const CHEAP = { N: 1 << 10, r: 8, p: 1 };
const cheapDummy = hashSecretScrypt("dummy-password", CHEAP);
const kdf: Kdf = {
  hash: (s) => hashSecretScrypt(s, CHEAP),
  verify: verifyScrypt,
  dummy: () => cheapDummy,
  needsRehash: (h) => needsRehash(h, CHEAP),
};

function createMemoryPlayerStore(): PlayerStore {
  const saves = new Map<string, SavedPlayer>();
  return {
    load: async (name) => saves.get(name.normalize("NFC").toLowerCase().trim()) ?? null,
    save: async (p) => void saves.set(p.name.normalize("NFC").toLowerCase().trim(), p),
    delete: async (name) => saves.delete(name.normalize("NFC").toLowerCase().trim()),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Bot thử tải chế độ tài khoản (--account) & Login Storm (Issue #176)", () => {
  let port = 0;
  let httpBase = "";
  let wsBase = "";
  let gameServer: Server;
  const activeRooms: Room[] = [];
  let dataDir = "";

  beforeAll(async () => {
    dataDir = path.join(rootDir, "main-server");
    const accounts = new FileAccountStore(path.join(dataDir, "accounts"));
    const sessions = new FileSessionStore(path.join(dataDir, "sessions"));
    const players = createMemoryPlayerStore();
    const souls = new FileSoulStore(path.join(dataDir, "souls"));

    WorldRoom.players = players;
    WorldRoom.souls = souls;

    const app = express();
    const { auth } = mountAuth(app, {
      env: { AUTH_MODE: "account", TRUST_PROXY: "1" },
      accounts,
      sessions,
      players,
      souls,
      kdf,
    });
    WorldRoom.auth = auth;

    port = await freePort();
    const httpServer = http.createServer(app);
    gameServer = new Server({
      transport: new WebSocketTransport({ server: httpServer }),
      gracefullyShutdown: false,
    });
    defineRooms(gameServer);
    await gameServer.listen(port);
    httpBase = `http://127.0.0.1:${port}`;
    wsBase = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await Promise.all(activeRooms.splice(0).map((r) => r.connection.isOpen && r.leave(true)));
    await sleep(80);
  });

  afterAll(async () => {
    WorldRoom.auth = null;
    await gameServer.gracefullyShutdown(false);
  });

  it("authBotAccount: đăng ký mới -> đặt đạo hiệu -> vào phòng bằng token; gọi lại thì đăng nhập lại vào cùng nhân vật", async () => {
    // 1. Lần đầu: chưa có tài khoản -> tự động đăng ký và đặt đạo hiệu
    const first = await authBotAccount(httpBase, 1, "Bot 001");
    expect(first.isNew).toBe(true);
    expect(first.username).toBe("bot_u_001");
    expect(first.token).toHaveLength(43);
    expect(first.latencyMs).toBeGreaterThan(0);

    // Kết nối vào phòng Colyseus bằng token
    const client1 = new Client(wsBase);
    const room1 = await client1.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { token: first.token });
    activeRooms.push(room1);

    // Chờ state đồng bộ
    await sleep(100);
    const player1 = (room1.state as any).players.get(room1.sessionId);
    expect(player1).toBeDefined();
    expect(player1.name).toBe("Bot 001");

    await room1.leave(true);
    await sleep(100);

    // 2. Lần hai: tài khoản đã có -> đăng nhập lại (isNew = false), bỏ qua tạo đạo hiệu (400 has_character)
    const second = await authBotAccount(httpBase, 1, "Bot 001");
    expect(second.isNew).toBe(false);
    expect(second.username).toBe("bot_u_001");
    expect(second.token).toHaveLength(43);
    expect(second.token).not.toBe(first.token);

    // Vào lại phòng bằng token mới
    const client2 = new Client(wsBase);
    const room2 = await client2.joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { token: second.token });
    activeRooms.push(room2);
    await sleep(100);
    const player2 = (room2.state as any).players.get(room2.sessionId);
    expect(player2?.name).toBe("Bot 001");

    // 3. Nếu tài khoản khác đặt trùng đạo hiệu "Bot 001" (409 name_taken) hoặc tên sai (400 name_invalid) -> phải ném lỗi, không nuốt
    await expect(authBotAccount(httpBase, 998, "Bot 001")).rejects.toThrow(/name_taken/);
    await expect(authBotAccount(httpBase, 999, "!")).rejects.toThrow(/name_invalid/);
  });

  it("runLoginStorm: 40 bot đồng thời đăng ký + đặt đạo hiệu và đăng nhập lại (100% thành công nhờ X-Forwarded-For)", async () => {
    // Đợt 1: 40 bot đồng thời (Bot 1 đã tạo ở test trước, Bot 2..40 đăng ký mới)
    const storm1 = await runLoginStorm(httpBase, 40, "Bot");
    expect(storm1.total).toBe(40);
    expect(storm1.success).toBe(40);
    expect(storm1.failed).toBe(0);
    expect(storm1.p95LatencyMs).toBeGreaterThanOrEqual(storm1.p50LatencyMs);
    expect(storm1.maxLatencyMs).toBeGreaterThanOrEqual(storm1.p95LatencyMs);

    // Đợt 2: Cả 40 bot đồng thời đăng nhập lại (100% đi qua nhánh login)
    const storm2 = await runLoginStorm(httpBase, 40, "Bot");
    expect(storm2.total).toBe(40);
    expect(storm2.success).toBe(40);
    expect(storm2.failed).toBe(0);

    // Đợt 3: 15 bot đồng thời dùng token vừa lấy để cùng ùa vào phòng Colyseus
    const auths = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        authBotAccount(httpBase, i + 1, `Bot ${String(i + 1).padStart(3, "0")}`),
      ),
    );
    const joinedRooms = await Promise.all(
      auths.map((a) =>
        new Client(wsBase).joinOrCreate(roomNameOf(DEFAULT_MAP_ID), { token: a.token }),
      ),
    );
    activeRooms.push(...joinedRooms);
    await sleep(150);

    expect((joinedRooms[0].state as any).online).toBe(15);
  });

  it("khi server KHÔNG bật TRUST_PROXY: bão đăng ký từ cùng kết nối bị chặn đúng ở ngưỡng REGISTER_PER_IP (5/giờ)", async () => {
    const noProxyDir = path.join(rootDir, "no-proxy-server");
    const app = express();
    mountAuth(app, {
      env: { AUTH_MODE: "account" }, // Không có TRUST_PROXY -> mọi bot đều bị tính chung IP 127.0.0.1
      accounts: new FileAccountStore(path.join(noProxyDir, "accounts")),
      sessions: new FileSessionStore(path.join(noProxyDir, "sessions")),
      players: createMemoryPlayerStore(),
      souls: new FileSoulStore(path.join(noProxyDir, "souls")),
      kdf,
    });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address() as { port: number };
    const baseNoProxy = `http://127.0.0.1:${addr.port}`;

    try {
      const report = await runLoginStorm(baseNoProxy, 12, "NoProxyBot");
      expect(report.total).toBe(12);
      expect(report.success).toBe(REGISTER_PER_IP); // Đúng 5 bot đầu thành công
      expect(report.failed).toBe(12 - REGISTER_PER_IP); // 7 bot sau bị chặn 429
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it("bão 30 đăng nhập đồng thời với scrypt thật (N=2^15): 100% thành công và tick World vẫn < 10ms", async () => {
    const prodDir = path.join(rootDir, "prod-scrypt-server");
    const accounts = new FileAccountStore(path.join(prodDir, "accounts"));
    const sessions = new FileSessionStore(path.join(prodDir, "sessions"));

    // Sinh 1 băm scrypt mặc định (N=2^15) và seed sẵn 30 tài khoản vào kho
    const sharedPass = "mat-khau-storm-30-scrypt";
    const prodHash = await hashSecretScrypt(sharedPass);
    const nowIso = new Date().toISOString();
    for (let i = 1; i <= 30; i++) {
      const numStr = String(i).padStart(3, "0");
      const acc = await accounts.create({
        username: `bot_u_${numStr}`,
        passHash: prodHash,
        recoveryHash: prodHash,
        createdAt: nowIso,
        lastLoginAt: nowIso,
        disabled: false,
      });
      if (acc) await accounts.setName(acc.id, `StormBot ${numStr}`);
    }

    const app = express();
    // Không truyền kdf giả -> dùng SCRYPT_DEFAULT (N=2^15) thật của AuthService
    mountAuth(app, {
      env: { AUTH_MODE: "account", TRUST_PROXY: "1" },
      accounts,
      sessions,
      players: createMemoryPlayerStore(),
      souls: new FileSoulStore(path.join(prodDir, "souls")),
    });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const addr = srv.address() as { port: number };
    const baseProd = `http://127.0.0.1:${addr.port}`;

    // Khởi tạo World với 30 người chơi và chạy vòng lặp tick 20 Hz song song với bão đăng nhập
    const { w } = makeWorld();
    for (let i = 1; i <= 30; i++) {
      addPlayer(w, `sid_${i}`, 1, 2);
    }
    const tickDurations: number[] = [];
    const timer = setInterval(() => {
      const t0 = performance.now();
      tickWorld(w, TICK_MS);
      tickDurations.push(performance.now() - t0);
    }, TICK_MS);

    try {
      const report = await runLoginStorm(baseProd, 30, "StormBot", sharedPass);
      expect(report.total).toBe(30);
      expect(report.success).toBe(30);
      expect(report.failed).toBe(0);

      expect(tickDurations.length).toBeGreaterThan(5);
      const tickAvg = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
      const tickMax = Math.max(...tickDurations);

      console.log(
        `[Login Storm N=2^15, 30 concurrent] total=${report.totalDurationMs}ms, avg=${report.avgLatencyMs}ms, p50=${report.p50LatencyMs}ms, p95=${report.p95LatencyMs}ms, max=${report.maxLatencyMs}ms | tickSamples=${tickDurations.length}, tickAvg=${tickAvg.toFixed(2)}ms, tickMax=${tickMax.toFixed(2)}ms`,
      );

      // Ngân sách bắt buộc: tick trung bình < 10 ms ngay cả khi libuv threadpool bão hoà scrypt
      expect(tickAvg).toBeLessThan(10);
    } finally {
      clearInterval(timer);
      await new Promise<void>((r) => srv.close(() => r()));
    }
  }, 20_000);
});
