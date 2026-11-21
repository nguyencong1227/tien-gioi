// Chống dùng ké máy chủ (QUYET_DINH_M3 mục 59 điểm 1): kiểm Origin ở HTTP, WebSocket và matchmaking + khung nhúng. Phần đầu là test thuần; phần sau dùng máy chủ Colyseus THẬT.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import WebSocket from "ws";
import { DEFAULT_MAP_ID, PROTOCOL_VERSION, roomNameOf } from "@tien-gioi/shared";
import {
  DEFAULT_PUBLIC_ORIGIN,
  frameGuardMiddleware,
  guardMatchmake,
  isOriginAllowed,
  lockMatchmakeCors,
  matchmakeCorsHeaders,
  originGuardMiddleware,
  originPolicyOf,
  wsVerifyClient,
  type MatchmakeController,
} from "./origin-guard";
import { listenWithRetry } from "./test-port";

const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const DEV = {} as NodeJS.ProcessEnv;
const EVIL = "https://evil.example";
const HOST = "tiengioi.hethongtm.site";

describe("originPolicyOf / isOriginAllowed (thuần)", () => {
  it("mặc định production: chỉ nguồn công khai; trang lạ bị từ chối; KHÔNG có Origin thì qua (bot / curl / kiểm sức khoẻ)", () => {
    const p = originPolicyOf(PROD);
    expect(isOriginAllowed(p, DEFAULT_PUBLIC_ORIGIN, undefined)).toBe(true);
    expect(isOriginAllowed(p, DEFAULT_PUBLIC_ORIGIN.toUpperCase(), undefined)).toBe(true); // Origin không phân biệt hoa thường
    expect(isOriginAllowed(p, EVIL, HOST)).toBe(false);
    expect(isOriginAllowed(p, undefined, HOST)).toBe(true);
    expect(isOriginAllowed(p, "", HOST)).toBe(true);
    expect(isOriginAllowed(p, "null", HOST)).toBe(false); // iframe cách ly / file://
    expect(isOriginAllowed(p, "capacitor://localhost", HOST)).toBe(false);
    expect(isOriginAllowed(p, "https://tiengioi.hethongtm.site.evil.example", HOST)).toBe(false); // không khớp tiền tố
    expect(isOriginAllowed(p, "http://tiengioi.hethongtm.site", HOST)).toBe(true); // cùng máy (Host) khác lược đồ: CÙNG NGUỒN theo Host
  });

  it("cùng nguồn theo Host: đổi tên miền sau proxy vẫn chạy mà không cần cấu hình; Host lạ không giúp trang lạ", () => {
    const p = originPolicyOf(PROD);
    expect(isOriginAllowed(p, "https://moi.example", "moi.example")).toBe(true);
    expect(isOriginAllowed(p, "https://moi.example", HOST)).toBe(false); // Origin lạ + Host của ta => trang lạ gọi sang ta
    expect(isOriginAllowed(p, "capacitor://moi.example", "moi.example")).toBe(false); // lược đồ lạ không dùng đường cùng nguồn
  });

  it("máy cục bộ chỉ được ngoài production (NODE_ENV hoặc TIEN_GIOI_PROD=1)", () => {
    for (const o of [
      "http://localhost:5173",
      "http://127.0.0.1:2597",
      "http://[::1]:5173",
      "https://localhost",
    ]) {
      expect(isOriginAllowed(originPolicyOf(DEV), o, "x:1")).toBe(true);
      expect(isOriginAllowed(originPolicyOf(PROD), o, "x:1")).toBe(false);
      expect(
        isOriginAllowed(originPolicyOf({ TIEN_GIOI_PROD: "1" } as NodeJS.ProcessEnv), o, "x:1"),
      ).toBe(false);
    }
    expect(isOriginAllowed(originPolicyOf(DEV), "http://localhost.evil.example", "x:1")).toBe(
      false,
    );
  });

  it("ALLOWED_ORIGINS thay mặc định; mục sai bị bỏ kèm cảnh báo; CORS_ORIGINS (app đóng gói) cũng được vào", () => {
    const p = originPolicyOf({
      ...PROD,
      ALLOWED_ORIGINS: "https://a.example, https://B.example:8443 ,*,https://c.example/path,",
      CORS_ORIGINS: "https://localhost",
    });
    expect(isOriginAllowed(p, "https://a.example", HOST)).toBe(true);
    expect(isOriginAllowed(p, "https://b.example:8443", HOST)).toBe(true);
    expect(isOriginAllowed(p, "https://localhost", HOST)).toBe(true); // app Capacitor
    expect(isOriginAllowed(p, DEFAULT_PUBLIC_ORIGIN, "khac")).toBe(false); // đã thay mặc định
    expect(isOriginAllowed(p, "https://c.example", HOST)).toBe(false);
    expect(p.warnings.filter((w) => w.startsWith("ALLOWED_ORIGINS")).length).toBe(2); // '*' và có đường dẫn
    const none = originPolicyOf({ ...PROD, ALLOWED_ORIGINS: "*" });
    expect(none.warnings.some((w) => /không có mục hợp lệ/.test(w))).toBe(true);
    expect(isOriginAllowed(none, EVIL, HOST)).toBe(false);
  });

  it("ORIGIN_CHECK=off tắt hẳn kèm cảnh báo", () => {
    const p = originPolicyOf({ ...PROD, ORIGIN_CHECK: "off" });
    expect(p.enabled).toBe(false);
    expect(p.warnings.join(" ")).toMatch(/ORIGIN_CHECK=off/);
    expect(isOriginAllowed(p, EVIL, HOST)).toBe(true);
  });

  it("Origin là mảng (tiêu đề lặp) lấy phần tử đầu; kiểu lạ không làm sập", () => {
    const p = originPolicyOf(PROD);
    expect(isOriginAllowed(p, [DEFAULT_PUBLIC_ORIGIN, EVIL], undefined)).toBe(true);
    expect(isOriginAllowed(p, [EVIL, DEFAULT_PUBLIC_ORIGIN], undefined)).toBe(false);
    expect(isOriginAllowed(p, [], undefined)).toBe(true);
  });

  it("lockMatchmakeCors: bỏ '*' + Allow-Credentials mặc định của Colyseus, chỉ phản chiếu nguồn được phép", () => {
    const controller: MatchmakeController = {
      DEFAULT_CORS_HEADERS: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
      },
      getCorsHeaders: () => ({ "Access-Control-Allow-Origin": "*" }),
    };
    lockMatchmakeCors(controller, originPolicyOf(PROD));
    expect(controller.DEFAULT_CORS_HEADERS).toEqual({
      "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
    });
    const get = (origin?: string) =>
      controller.getCorsHeaders({
        headers: origin ? { origin, host: HOST } : { host: HOST },
      } as never);
    // nguồn được phép PHẢI có Allow-Credentials: true (colyseus.js luôn gọi với credentials: 'include'; thiếu thì client khác nguồn không vào được phòng)
    expect(get(DEFAULT_PUBLIC_ORIGIN)).toEqual({
      "Access-Control-Allow-Origin": DEFAULT_PUBLIC_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
    });
    expect(get(EVIL)).toEqual({});
    expect(get()).toEqual({});
  });

  it("matchmakeCorsHeaders: MỌI loại nguồn được phép (công khai, CORS_ORIGINS, cùng Host, máy cục bộ ngoài production) có ACAO = đúng nguồn (không '*') + ACAC 'true'; nguồn lạ không có gì", () => {
    const check = (env: NodeJS.ProcessEnv, origin: string, host: string) => {
      const headers = matchmakeCorsHeaders(originPolicyOf(env))({ headers: { origin, host } });
      expect(headers["Access-Control-Allow-Origin"]).toBe(origin);
      expect(headers["Access-Control-Allow-Origin"]).not.toBe("*");
      expect(headers["Access-Control-Allow-Credentials"]).toBe("true");
    };
    check(PROD, DEFAULT_PUBLIC_ORIGIN, HOST);
    check({ ...PROD, CORS_ORIGINS: "https://localhost" }, "https://localhost", HOST); // app Android đóng gói
    check(PROD, "http://tunnel.example.org:8080", "tunnel.example.org:8080"); // cùng Host (sau proxy đổi tên miền)
    check({}, "http://localhost:5183", "localhost:2577"); // Vite dev -> máy chủ dev (khác cổng = khác nguồn)
    // lạ: không tiêu đề nào (kể cả ACAC)
    expect(
      matchmakeCorsHeaders(originPolicyOf(PROD))({ headers: { origin: EVIL, host: HOST } }),
    ).toEqual({});
    expect(
      matchmakeCorsHeaders(originPolicyOf(PROD))({
        headers: { origin: "http://localhost:5183", host: HOST }, // production KHÔNG nhận máy cục bộ lạ
      }),
    ).toEqual({});
  });
});

describe("kiểm Origin qua máy chủ Colyseus + Express THẬT (production)", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "tien-gioi-origin-"));
  let port = 0;
  let gameServer: Server;
  let WorldRoomCls: typeof import("./rooms/WorldRoom").WorldRoom;
  const saved = { ...matchMaker.controller.DEFAULT_CORS_HEADERS };
  const savedGet = matchMaker.controller.getCorsHeaders;

  beforeAll(async () => {
    process.env.DATA_DIR = dataDir;
    const mod = await import("./rooms/WorldRoom");
    WorldRoomCls = mod.WorldRoom;
    const policy = originPolicyOf(PROD);
    WorldRoomCls.originPolicy = policy;
    lockMatchmakeCors(matchMaker.controller, policy);
    const app = express();
    app.use(frameGuardMiddleware);
    app.use(originGuardMiddleware(policy));
    app.get("/health", (_req, res) => res.json({ ok: true }));
    const server = http.createServer(app);
    gameServer = new Server({
      transport: new WebSocketTransport({ server, verifyClient: wsVerifyClient(policy) }),
      gracefullyShutdown: false,
    });
    guardMatchmake(gameServer as never, policy);
    mod.defineRooms(gameServer);
    port = await listenWithRetry(gameServer);
  });
  afterAll(async () => {
    WorldRoomCls.originPolicy = null;
    Object.assign(matchMaker.controller.DEFAULT_CORS_HEADERS, saved);
    matchMaker.controller.getCorsHeaders = savedGet;
    await gameServer.gracefullyShutdown(false).catch(() => {});
  });

  const get = (urlPath: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}${urlPath}`, { headers });
  const matchmake = async (origin?: string) => {
    const res = await fetch(
      `http://127.0.0.1:${port}/matchmake/joinOrCreate/${roomNameOf(DEFAULT_MAP_ID)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({
          v: PROTOCOL_VERSION,
          name: "Khach Thu Nguon",
          secret: "secret-khach-thu-nguon-0123456789",
        }),
      },
    );
    return { res, body: (await res.json()) as { code?: number; error?: string; room?: unknown } };
  };

  it("HTTP: Origin lạ bị 403; không Origin và nguồn công khai thì qua; mọi phản hồi có frame-ancestors 'self'", async () => {
    const evil = await get("/health", { Origin: EVIL });
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ error: "origin_not_allowed" });
    expect(evil.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(evil.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const none = await get("/health");
    expect(none.status).toBe(200);
    expect(none.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect((await get("/health", { Origin: DEFAULT_PUBLIC_ORIGIN })).status).toBe(200);
    // preflight từ trang lạ cũng bị chặn
    const pre = await fetch(`http://127.0.0.1:${port}/health`, {
      method: "OPTIONS",
      headers: { Origin: EVIL, "Access-Control-Request-Method": "POST" },
    });
    expect(pre.status).toBe(403);
  });

  it("matchmaking: trang lạ KHÔNG xin được chỗ (kể cả khi bỏ qua CORS) và không được tiêu đề CORS; nguồn công khai và không-Origin thì không bị chặn vì Origin", async () => {
    const evil = await matchmake(EVIL);
    expect(evil.body).toMatchObject({ code: 403, error: "origin_not_allowed" });
    expect(evil.res.headers.get("access-control-allow-origin")).toBeNull(); // trình duyệt của trang lạ cũng không đọc được
    expect(evil.res.headers.get("access-control-allow-credentials")).toBeNull();

    const ok = await matchmake(DEFAULT_PUBLIC_ORIGIN);
    expect(ok.body.error).toBeUndefined();
    expect(ok.body.room).toBeDefined();
    expect(ok.res.headers.get("access-control-allow-origin")).toBe(DEFAULT_PUBLIC_ORIGIN); // phản chiếu ĐÚNG nguồn, không '*'
    expect(ok.res.headers.get("access-control-allow-credentials")).toBe("true"); // colyseus.js gọi với credentials: 'include' (khác nguồn cần cái này)

    const bot = await matchmake(undefined);
    expect(bot.body.error).toBeUndefined();
    expect(bot.body.room).toBeDefined();
    expect(bot.res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("matchmaking: preflight từ trang lạ cũng bị 403; `WorldRoom.onAuth` kiểm Origin lần nữa (lớp thứ hai), không Origin thì qua lớp này", async () => {
    const pre = await fetch(
      `http://127.0.0.1:${port}/matchmake/joinOrCreate/${roomNameOf(DEFAULT_MAP_ID)}`,
      {
        method: "OPTIONS",
        headers: { Origin: EVIL, "Access-Control-Request-Method": "POST" },
      },
    );
    expect(pre.status).toBe(403);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    const onAuth = WorldRoomCls.prototype.onAuth as unknown as (
      c: unknown,
      o: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    await expect(
      onAuth.call(undefined, {}, {}, { headers: { origin: EVIL, host: HOST } }),
    ).rejects.toMatchObject({
      code: 403,
      message: "origin_not_allowed",
    });
    // không Origin: không bị chặn vì Origin (bị chặn vì lý do khác, ở đây thiếu phiên bản giao thức -> mã khác 403 'origin_not_allowed')
    await expect(
      onAuth.call(undefined, {}, {}, { headers: { host: HOST } }),
    ).rejects.not.toMatchObject({
      message: "origin_not_allowed",
    });
  });

  it("WebSocket: bắt tay có Origin lạ bị 403 trước khi nâng cấp; Origin công khai / không Origin thì KHÔNG bị 403", async () => {
    const attempt = (origin?: string) =>
      new Promise<{ status?: number; opened: boolean }>((resolve) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/khong-co-phong?sessionId=x`,
          origin ? { origin } : {},
        );
        let opened = false;
        ws.on("unexpected-response", (_req, res) => {
          resolve({ status: res.statusCode, opened });
          ws.terminate();
        });
        ws.on("open", () => (opened = true));
        ws.on("close", () => resolve({ opened }));
        ws.on("error", () => {});
        setTimeout(() => {
          resolve({ opened });
          ws.terminate();
        }, 3000);
      });
    expect(await attempt(EVIL)).toEqual({ status: 403, opened: false });
    const good = await attempt(DEFAULT_PUBLIC_ORIGIN);
    expect(good.status).not.toBe(403);
    const bot = await attempt(undefined);
    expect(bot.status).not.toBe(403);
  });
});
