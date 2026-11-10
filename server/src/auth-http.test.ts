// API HTTP của tài khoản qua máy chủ Express THẬT (cổng ngẫu nhiên, `fetch` thật): luồng đăng ký -> phiên -> khôi phục,
// kiểu nội dung / cỡ thân / tiêu đề Authorization, giới hạn tần suất theo IP (kể cả giả X-Forwarded-For), 500 không rò rỉ.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { FileAccountStore, FileSessionStore, type AccountStore } from "./account-store";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "./auth";
import { LOGIN_FAIL_PER_IP, type Kdf } from "./auth-service";
import { authModeOf, clientKey, mountAuth, parseTrustProxy } from "./auth-http";
import { startupWarnings } from "./startup";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-http-"));
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

interface Srv {
  base: string;
  dir: string;
  close: () => Promise<void>;
}
const open: Srv[] = [];

async function serve(env: NodeJS.ProcessEnv, accounts?: AccountStore): Promise<Srv> {
  const dir = path.join(root, `s${++n}`);
  const app = express();
  mountAuth(app, {
    env,
    accounts: accounts ?? new FileAccountStore(path.join(dir, "accounts")),
    sessions: new FileSessionStore(path.join(dir, "sessions")),
    kdf,
  });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const s: Srv = {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    dir,
    close: () => new Promise((r) => server.close(() => r())),
  };
  open.push(s);
  return s;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

const PW = "mat-khau-dai-du";
const JSON_H = { "Content-Type": "application/json" };
const post = (s: Srv, p: string, body: unknown, headers: Record<string, string> = JSON_H) =>
  fetch(s.base + p, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const ACC = { AUTH_MODE: "account" } as NodeJS.ProcessEnv;

describe("authModeOf / /health", () => {
  it("chỉ 'account' mới là account; mọi giá trị khác là legacy", () => {
    expect(authModeOf({ AUTH_MODE: "account" })).toBe("account");
    for (const v of [undefined, "", "legacy", "Account", "ACCOUNT", "1", "true", "accounts"])
      expect(authModeOf({ AUTH_MODE: v }), String(v)).toBe("legacy");
  });

  it("/health báo authMode; legacy là mặc định và KHÔNG mở API tài khoản nào (404, không tạo tệp)", async () => {
    const s = await serve({});
    expect(await (await fetch(`${s.base}/health`)).json()).toEqual({
      ok: true,
      authMode: "legacy",
    });
    const r = await post(s, "/api/auth/register", { username: "lam_thanh", password: PW });
    expect(r.status).toBe(404);
    expect(existsSync(path.join(s.dir, "accounts"))).toBe(false);
    const a = await serve(ACC);
    expect(await (await fetch(`${a.base}/health`)).json()).toEqual({
      ok: true,
      authMode: "account",
    });
  });
});

describe("luồng tài khoản", () => {
  it("đăng ký -> me -> đăng nhập -> đăng xuất -> me 401 -> khôi phục -> đăng nhập bằng mật khẩu mới", async () => {
    const s = await serve(ACC);
    const reg = await post(s, "/api/auth/register", { username: "Lam_Thanh", password: PW });
    expect(reg.status).toBe(200);
    expect(reg.headers.get("content-type")).toMatch(/application\/json/);
    expect(reg.headers.get("cache-control")).toBe("no-store");
    const { token, recoveryCode } = await reg.json();
    expect(token).toHaveLength(43);

    const me = await fetch(`${s.base}/api/auth/me`, { headers: bearer(token) });
    expect(me.status).toBe(200);
    expect(me.headers.get("cache-control")).toBe("no-store");
    expect(await me.json()).toEqual({ username: "lam_thanh", hasCharacter: false });

    const login = await post(s, "/api/auth/login", { username: "lam_thanh", password: PW });
    expect(login.status).toBe(200);
    const t2: string = (await login.json()).token;
    expect(t2).not.toBe(token);

    const out = await post(s, "/api/auth/logout", "", { ...bearer(t2) });
    expect(out.status).toBe(204);
    expect(out.headers.get("cache-control")).toBe("no-store");
    expect((await fetch(`${s.base}/api/auth/me`, { headers: bearer(t2) })).status).toBe(401);
    expect((await fetch(`${s.base}/api/auth/me`, { headers: bearer(token) })).status).toBe(200); // phiên khác còn

    const rec = await post(s, "/api/auth/recover", {
      username: "lam_thanh",
      recoveryCode: recoveryCode.toLowerCase().replaceAll("-", " "),
      newPassword: "mat-khau-moi-dai",
    });
    expect(rec.status).toBe(200);
    const recBody = await rec.json();
    expect(recBody.recoveryCode).not.toBe(recoveryCode);
    expect((await fetch(`${s.base}/api/auth/me`, { headers: bearer(token) })).status).toBe(401); // phiên cũ bị xoá
    expect((await post(s, "/api/auth/login", { username: "lam_thanh", password: PW })).status).toBe(
      401,
    );
    expect(
      (await post(s, "/api/auth/login", { username: "lam_thanh", password: "mat-khau-moi-dai" }))
        .status,
    ).toBe(200);
  });

  it("lỗi: mã HTTP theo AUTH_STATUS, thân { error }, không có chữ lạ", async () => {
    const s = await serve(ACC);
    await post(s, "/api/auth/register", { username: "lam_thanh", password: PW });
    const cases: [string, unknown, number, string][] = [
      ["/api/auth/register", { username: "lam_thanh", password: PW }, 409, "username_taken"],
      ["/api/auth/register", { username: "ab", password: PW }, 400, "username_invalid"],
      ["/api/auth/register", { username: "abc", password: "ngan" }, 400, "weak_password"],
      ["/api/auth/register", { username: "abc" }, 400, "invalid"],
      [
        "/api/auth/login",
        { username: "lam_thanh", password: "sai-mat-khau-roi" },
        401,
        "bad_credentials",
      ],
      [
        "/api/auth/login",
        { username: "khong_co", password: "sai-mat-khau-roi" },
        401,
        "bad_credentials",
      ],
      [
        "/api/auth/recover",
        {
          username: "lam_thanh",
          recoveryCode: "ABCD-EFGH-JKMN-PQRS",
          newPassword: "mat-khau-moi-dai",
        },
        401,
        "bad_credentials",
      ],
    ];
    for (const [p, body, status, error] of cases) {
      const r = await post(s, p, body);
      expect([r.status, await r.json()], `${p} ${JSON.stringify(body)}`).toEqual([
        status,
        { error },
      ]);
    }
  });
});

describe("giao thức", () => {
  it("chỉ nhận application/json: text/plain, form, không kiểu => 400 invalid (không tạo tài khoản)", async () => {
    const s = await serve(ACC);
    const body = JSON.stringify({ username: "lam_thanh", password: PW });
    for (const headers of [
      { "Content-Type": "text/plain" },
      { "Content-Type": "application/x-www-form-urlencoded" },
      {},
    ] as Record<string, string>[]) {
      const r = await fetch(`${s.base}/api/auth/register`, { method: "POST", headers, body });
      expect([r.status, await r.json()], JSON.stringify(headers)).toEqual([
        400,
        { error: "invalid" },
      ]);
    }
    expect(existsSync(path.join(s.dir, "accounts"))).toBe(false);
    // application/json kèm charset vẫn nhận
    const ok = await post(s, "/api/auth/register", body, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(ok.status).toBe(200);
  });

  it("thân sai: mảng, JSON hỏng, thân rỗng => 400 invalid; thân > 2 KB => 413; không ghi log (khỏi lộ mảnh mật khẩu)", async () => {
    const s = await serve(ACC);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const body of [
        "[1,2]",
        '{"username":"a","password":"mat-khau-bi-mat',
        "",
        "null",
        '"x"',
        "123",
      ]) {
        const r = await post(s, "/api/auth/login", body);
        expect([r.status, await r.json()], body).toEqual([400, { error: "invalid" }]);
      }
      const big = await post(s, "/api/auth/register", {
        username: "lam_thanh",
        password: "x".repeat(3000),
      });
      expect([big.status, await big.json()]).toEqual([413, { error: "invalid" }]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("tiêu đề Authorization đọc nghiêm ngặt: chỉ 'Bearer <43 ký tự base64url>'; logout luôn 204", async () => {
    const s = await serve(ACC);
    const { token } = await (
      await post(s, "/api/auth/register", { username: "lam_thanh", password: PW })
    ).json();
    const bad = [
      undefined,
      `bearer ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token}x`,
      `Bearer ${token.slice(1)}`,
      `Basic ${token}`,
      token,
      "Bearer ",
    ];
    for (const a of bad) {
      const r = await fetch(`${s.base}/api/auth/me`, {
        headers: a === undefined ? {} : { Authorization: a },
      });
      expect([r.status, await r.json()], String(a)).toEqual([401, { error: "unauthorized" }]);
      expect(
        (await post(s, "/api/auth/logout", "", a === undefined ? {} : { Authorization: a })).status,
      ).toBe(204);
    }
    // Đăng xuất bằng tiêu đề sai không xoá phiên thật
    expect((await fetch(`${s.base}/api/auth/me`, { headers: bearer(token) })).status).toBe(200);
  });

  it("đường dẫn lạ dưới /api và sai phương thức: 404 JSON { error: 'not_found' }", async () => {
    const s = await serve(ACC);
    for (const [method, p] of [
      ["GET", "/api/khong-co"],
      ["GET", "/api/auth/login"],
      ["POST", "/api/auth/me"],
      ["DELETE", "/api/auth/register"],
    ] as const) {
      const r = await fetch(s.base + p, { method });
      expect([r.status, await r.json()], `${method} ${p}`).toEqual([404, { error: "not_found" }]);
    }
  });
});

describe("giới hạn tần suất theo IP", () => {
  const failLogin = (s: Srv, i: number, headers: Record<string, string> = {}) =>
    post(
      s,
      "/api/auth/login",
      { username: `ten_la_${i}`, password: "sai-mat-khau-roi" },
      { ...JSON_H, ...headers },
    );

  it(`${LOGIN_FAIL_PER_IP} lần sai thì 429 kèm Retry-After và retryAfterS; mật khẩu đúng cũng bị chặn`, async () => {
    const s = await serve(ACC);
    await post(s, "/api/auth/register", { username: "lam_thanh", password: PW });
    for (let i = 0; i < LOGIN_FAIL_PER_IP; i++) expect((await failLogin(s, i)).status).toBe(401);
    const r = await post(s, "/api/auth/login", { username: "lam_thanh", password: PW });
    expect(r.status).toBe(429);
    const body = await r.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterS).toBeGreaterThan(0);
    expect(r.headers.get("retry-after")).toBe(String(body.retryAfterS));
  });

  it("KHÔNG tin X-Forwarded-For khi chưa đặt TRUST_PROXY: đổi tiêu đề mỗi lần không qua mặt được giới hạn", async () => {
    const s = await serve(ACC);
    for (let i = 0; i < LOGIN_FAIL_PER_IP; i++)
      await failLogin(s, i, { "X-Forwarded-For": `9.9.9.${i}` });
    expect((await failLogin(s, 99, { "X-Forwarded-For": "7.7.7.7" })).status).toBe(429);
  });

  it("TRUST_PROXY=1: tính theo IP trong X-Forwarded-For (mỗi IP một hạn mức); giả nhiều tầng vẫn chỉ lấy tầng cuối của proxy", async () => {
    const s = await serve({ ...ACC, TRUST_PROXY: "1" });
    for (let i = 0; i < LOGIN_FAIL_PER_IP; i++)
      await failLogin(s, i, { "X-Forwarded-For": "9.9.9.9" });
    expect((await failLogin(s, 50, { "X-Forwarded-For": "9.9.9.9" })).status).toBe(429);
    expect((await failLogin(s, 51, { "X-Forwarded-For": "8.8.8.8" })).status).toBe(401); // IP khác còn hạn mức
    // Khách tự thêm tầng giả phía trước: proxy tin cậy (1 tầng) chỉ coi mục CUỐI là IP thật
    expect((await failLogin(s, 52, { "X-Forwarded-For": "1.2.3.4, 9.9.9.9" })).status).toBe(429);
  });
});

describe("lỗi nội bộ", () => {
  it("kho lưu hỏng: 500 { error: 'server_error' }, log chỉ có tên lỗi (không chứa thông báo / mật khẩu)", async () => {
    const broken = new FileAccountStore(path.join(root, "x"));
    broken.byUsername = async () => {
      throw Object.assign(new Error(`ENOENT mat-khau-bi-mat-${PW}`), { code: "ENOENT" });
    };
    const s = await serve(ACC, broken);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await post(s, "/api/auth/login", { username: "lam_thanh", password: PW });
      expect([r.status, await r.json()]).toEqual([500, { error: "server_error" }]);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("Error (ENOENT)");
      expect(logged).not.toContain(PW);
      expect(logged).not.toContain("mat-khau-bi-mat");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("parseTrustProxy / clientKey", () => {
  it("TRUST_PROXY: số tầng 1-10 hoặc danh sách mạng con; từ chối true / * / rác", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy(" 2 ")).toBe(2);
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("10.0.0.0/8, loopback")).toBe("10.0.0.0/8, loopback");
    for (const bad of [
      undefined,
      "",
      "  ",
      "0",
      "11",
      "-1",
      "true",
      "TRUE",
      "false",
      "*",
      "all",
      "1; drop",
      "a b$",
    ])
      expect(parseTrustProxy(bad), String(bad)).toBe(false);
  });

  it("IPv4 giữ nguyên; ::ffff:IPv4 quy về IPv4; IPv6 gộp /64; không có IP thì 'unknown'", () => {
    expect(clientKey("1.2.3.4")).toBe("1.2.3.4");
    expect(clientKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(clientKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(clientKey("2001:db8:1:2:1:2:3:4"));
    expect(clientKey("2001:db8:1:2::5")).toBe(clientKey("2001:0db8:0001:0002:ffff::1"));
    expect(clientKey("2001:db8:1:3::5")).not.toBe(clientKey("2001:db8:1:2::5"));
    expect(clientKey("::1")).toBe(clientKey("0:0:0:0:0:0:0:1"));
    expect(clientKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(clientKey(undefined)).toBe("unknown");
    expect(clientKey("")).toBe("unknown");
  });
});

describe("startupWarnings (tài khoản)", () => {
  const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  it("production + legacy: cảnh báo; production + account + TRUST_PROXY: sạch", () => {
    expect(startupWarnings(prod).join("|")).toContain("AUTH_MODE=legacy");
    expect(startupWarnings({ ...prod, AUTH_MODE: "account", TRUST_PROXY: "1" })).toEqual([]);
  });
  it("account mà chưa đặt TRUST_PROXY (production): nhắc IP proxy dùng chung hạn mức", () => {
    const w = startupWarnings({ ...prod, AUTH_MODE: "account" });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("TRUST_PROXY");
  });
  it("AUTH_MODE lạ và TRUST_PROXY không an toàn: cảnh báo", () => {
    const w = startupWarnings({ ...prod, AUTH_MODE: "accounts", TRUST_PROXY: "true" }).join("|");
    expect(w).toContain("AUTH_MODE='accounts'");
    expect(w).toContain("TRUST_PROXY='true'");
  });
  it("không production: vẫn chỉ cảnh báo /give (không thêm tiếng ồn cho dev)", () => {
    const w = startupWarnings({});
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("/give");
  });
});

beforeAll(() => {
  // fetch thật tới 127.0.0.1: không bị proxy môi trường chen vào
  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
});
