// CORS theo danh sách cho phép (M4.2a-1): đọc cấu hình, middleware, và qua máy chủ Express THẬT (cổng ngẫu nhiên, `fetch` thật)
// ghép với `mountAuth` thật: mặc định không có tiêu đề CORS nào; nguồn được phép nhận đúng nguồn của nó (không `*`, không
// Allow-Credentials); nguồn lạ không nhận gì và preflight bị 403; đường ngoài `/health` / `/api` không bao giờ nhận.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { FileAccountStore, FileSessionStore } from "./account-store";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "./auth";
import { mountAuth } from "./auth-http";
import type { Kdf } from "./auth-service";
import { CORS_PATHS, corsOriginsOf, mountCors } from "./cors";
import { FileSoulStore } from "./soul";
import { startupWarnings } from "./startup";
import type { PlayerStore } from "./player-store";

describe("corsOriginsOf", () => {
  it("không đặt / rỗng / chỉ khoảng trắng và dấu phẩy: tắt, không cảnh báo", () => {
    for (const v of [undefined, "", "   ", " , ,"]) {
      expect(corsOriginsOf({ CORS_ORIGINS: v })).toEqual({ origins: [], warnings: [] });
    }
  });

  it("nhận danh sách hợp lệ: cắt khoảng trắng, chữ thường, bỏ trùng, giữ thứ tự", () => {
    const c = corsOriginsOf({
      CORS_ORIGINS:
        " https://localhost, HTTP://Localhost ,capacitor://localhost,https://game.example.com:8443,https://localhost, http://192.168.1.5:2567, http://[::1]:5173",
    });
    expect(c.warnings).toEqual([]);
    expect(c.origins).toEqual([
      "https://localhost",
      "http://localhost",
      "capacitor://localhost",
      "https://game.example.com:8443",
      "http://192.168.1.5:2567",
      "http://[::1]:5173",
    ]);
  });

  it("bỏ kèm cảnh báo: '*', ký tự đại diện, dấu '/' cuối, đường dẫn, thiếu lược đồ, 'null', khoảng trắng bên trong", () => {
    const bad = [
      "*",
      "https://*.example.com",
      "https://example.com/",
      "https://example.com/app",
      "example.com",
      "null",
      "https://exa mple.com",
      "https://",
      "https://example.com:",
      "javascript:alert(1)",
    ];
    const c = corsOriginsOf({ CORS_ORIGINS: `${bad.join(",")},https://ok.example.com` });
    expect(c.origins).toEqual(["https://ok.example.com"]);
    expect(c.warnings).toHaveLength(bad.length);
    expect(c.warnings.every((w) => w.startsWith("CORS_ORIGINS: bỏ qua"))).toBe(true);
  });

  it("chặn danh sách khổng lồ (tối đa 20 nguồn)", () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://h${i}.example.com`).join(",");
    const c = corsOriginsOf({ CORS_ORIGINS: many });
    expect(c.origins).toHaveLength(20);
    expect(c.warnings.some((w) => w.includes("tối đa 20"))).toBe(true);
  });

  it("cảnh báo đi vào startupWarnings", () => {
    const w = startupWarnings({ CORS_ORIGINS: "*" });
    expect(w.some((l) => l.includes("CORS_ORIGINS"))).toBe(true);
    expect(
      startupWarnings({ CORS_ORIGINS: "https://localhost" }).some((l) =>
        l.includes("CORS_ORIGINS"),
      ),
    ).toBe(false);
  });
});

// ---- Express thật, ghép với mountAuth thật (chế độ tài khoản)
const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-cors-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const CHEAP = { N: 1 << 10, r: 8, p: 1 };
const cheapDummy = hashSecretScrypt("khong-ai-dung", CHEAP);
const kdf: Kdf = {
  hash: (s) => hashSecretScrypt(s, CHEAP),
  verify: verifyScrypt,
  dummy: () => cheapDummy,
  needsRehash: (h) => needsRehash(h, CHEAP),
};
const noPlayers: PlayerStore = { load: async () => null, save: async () => {} };

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()));
});

async function serve(corsOrigins: string | undefined) {
  const dir = path.join(root, `s${++n}`);
  const env: NodeJS.ProcessEnv = { AUTH_MODE: "account", CORS_ORIGINS: corsOrigins };
  const app = express();
  const cors = mountCors(app, env); // như index.ts: TRƯỚC mountAuth
  mountAuth(app, {
    env,
    accounts: new FileAccountStore(path.join(dir, "accounts")),
    sessions: new FileSessionStore(path.join(dir, "sessions")),
    players: noPlayers,
    souls: new FileSoulStore(path.join(dir, "souls")),
    kdf,
  });
  app.get("/metrics", (_req, res) => res.json({ giam: "sat" })); // đường ngoài danh sách chịu CORS
  app.get("/ngoai", (_req, res) => res.send("trang"));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => new Promise<void>((r) => server.close(() => r())));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, cors };
}

const ORIGIN = "https://localhost";
const JSON_H = { "Content-Type": "application/json" };
const acao = (r: Response) => r.headers.get("access-control-allow-origin");
const preflight = (base: string, p: string, origin: string, method = "POST") =>
  fetch(base + p, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  });

describe("mặc định (không đặt CORS_ORIGINS): hành vi y như trước", () => {
  it("không gắn gì: không tiêu đề CORS, không Vary, preflight rơi vào 404 của /api", async () => {
    const s = await serve(undefined);
    expect(s.cors.enabled).toBe(false);
    const h = await fetch(`${s.base}/health`, { headers: { Origin: ORIGIN } });
    expect(h.status).toBe(200);
    expect(acao(h)).toBeNull();
    expect(h.headers.get("vary")).toBeNull();
    const p = await preflight(s.base, "/api/auth/login", ORIGIN);
    expect(p.status).toBe(404);
    expect(acao(p)).toBeNull();
  });

  it("toàn mục sai: vẫn tắt", async () => {
    const s = await serve("*,https://localhost/");
    expect(s.cors.enabled).toBe(false);
    expect(acao(await fetch(`${s.base}/health`, { headers: { Origin: ORIGIN } }))).toBeNull();
  });
});

describe("bật CORS_ORIGINS", () => {
  it("GET /health và POST /api/auth/* từ nguồn được phép: nhận đúng nguồn đó, Vary: Origin, KHÔNG '*' và KHÔNG Allow-Credentials", async () => {
    const s = await serve(`${ORIGIN},capacitor://localhost`);
    expect(s.cors.enabled).toBe(true);
    for (const o of [ORIGIN, "capacitor://localhost"]) {
      const h = await fetch(`${s.base}/health`, { headers: { Origin: o } });
      expect(h.status).toBe(200);
      expect(acao(h)).toBe(o);
      expect(h.headers.get("vary")).toMatch(/Origin/i);
      expect(h.headers.get("access-control-allow-credentials")).toBeNull();
      expect((await h.json()).authMode).toBe("account"); // thân phản hồi không đổi
    }
    const post = await fetch(`${s.base}/api/auth/login`, {
      method: "POST",
      headers: { ...JSON_H, Origin: ORIGIN },
      body: JSON.stringify({ username: "", password: "" }),
    });
    expect(post.status).toBe(401); // tới được xử lý thật (đăng nhập sai), không bị chặn
    expect(acao(post)).toBe(ORIGIN);
    const me = await fetch(`${s.base}/api/auth/me`, {
      headers: { Origin: ORIGIN, Authorization: "Bearer khong-co" },
    });
    expect(me.status).toBe(401);
    expect(acao(me)).toBe(ORIGIN); // lỗi cũng phải đọc được ở trình duyệt, nếu không client không hiện thông báo
  });

  it("so khớp nguồn không phân biệt hoa thường nhưng phản chiếu đúng chuỗi trình duyệt gửi", async () => {
    const s = await serve(ORIGIN);
    expect(
      acao(await fetch(`${s.base}/health`, { headers: { Origin: "HTTPS://LocalHost" } })),
    ).toBe("HTTPS://LocalHost");
  });

  it("preflight từ nguồn được phép: 204, phương thức và tiêu đề CỐ ĐỊNH, Max-Age, không '*'", async () => {
    const s = await serve(ORIGIN);
    const r = await preflight(s.base, "/api/auth/login", ORIGIN);
    expect(r.status).toBe(204);
    expect(acao(r)).toBe(ORIGIN);
    expect(r.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(r.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
    expect(r.headers.get("access-control-max-age")).toBe("600");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    // yêu cầu tiêu đề lạ không được phản chiếu lại
    const odd = await fetch(`${s.base}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-bi-mat",
      },
    });
    expect(odd.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
  });

  it("nguồn lạ (kể cả giống tiền tố hoặc 'null'): không nhận tiêu đề CORS; yêu cầu thường vẫn chạy; preflight 403", async () => {
    const s = await serve(ORIGIN);
    for (const o of [
      "https://evil.example.com",
      "https://localhost.evil.com",
      "http://localhost",
      "https://localhost:8443",
      "null",
    ]) {
      const h = await fetch(`${s.base}/health`, { headers: { Origin: o } });
      expect(h.status, o).toBe(200); // không đổi hành vi với nguồn lạ: không phải rào chắn CSRF
      expect(acao(h), o).toBeNull();
      expect(h.headers.get("vary"), o).toMatch(/Origin/i);
      const p = await preflight(s.base, "/api/auth/login", o);
      expect(p.status, o).toBe(403);
      expect(acao(p), o).toBeNull();
      expect(await p.json()).toEqual({ error: "cors_origin_not_allowed" });
    }
  });

  it("không có Origin (cùng nguồn, curl, giám sát) và OPTIONS thường không phải preflight: đi qua nguyên vẹn", async () => {
    const s = await serve(ORIGIN);
    const h = await fetch(`${s.base}/health`);
    expect(h.status).toBe(200);
    expect(acao(h)).toBeNull();
    // OPTIONS có Origin được phép nhưng thiếu Access-Control-Request-Method: không phải preflight, không bị trả 204 giả
    const o = await fetch(`${s.base}/api/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: ORIGIN },
    });
    expect(o.status).toBe(404);
  });

  it("chỉ /health và /api: /metrics và đường khác KHÔNG nhận CORS dù nguồn được phép", async () => {
    expect([...CORS_PATHS]).toEqual(["/health", "/api"]);
    const s = await serve(ORIGIN);
    for (const p of ["/metrics", "/ngoai", "/healthz"]) {
      const r = await fetch(s.base + p, { headers: { Origin: ORIGIN } });
      expect(acao(r), p).toBeNull();
      expect(r.headers.get("vary"), p).toBeNull();
    }
  });
});
