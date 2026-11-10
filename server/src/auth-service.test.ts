// AuthService: đăng ký / đăng nhập / phiên / khôi phục, giới hạn tần suất và khoá mềm, không lộ tên nào có thật.
// Dùng kho file thật trong thư mục tạm, scrypt tham số rẻ (đếm số lần gọi), giờ giả.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileAccountStore, FileSessionStore, type AccountRecord } from "./account-store";
import { hashSecretScrypt, hashToken, needsRehash, verifyScrypt } from "./auth";
import {
  AUTH_STATUS,
  AuthService,
  LOGIN_FAIL_PER_IP,
  REGISTER_PER_IP,
  SESSION_TOUCH_MS,
  SESSION_TTL_MS,
  type Kdf,
} from "./auth-service";
import { AUTH_ERRORS } from "@tien-gioi/shared";
import { setAuditSink } from "./audit";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-auth-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const CHEAP = { N: 1 << 10, r: 8, p: 1 };
const TARGET = { N: 1 << 11, r: 8, p: 1 };
/** Băm giả rẻ cho test (bản thật dùng tham số mặc định, ~80 ms mỗi lần). */
const cheapDummy = hashSecretScrypt("khong-ai-dung", CHEAP);
const T0 = Date.parse("2026-11-10T00:00:00Z");
const MIN = 60_000;

class SpySessions extends FileSessionStore {
  touches = 0;
  override touch(h: string, a: number, b: number) {
    this.touches++;
    return super.touch(h, a, b);
  }
}

let t: number;
let calls: { hash: number; verify: number; dummy: number };
let accounts: FileAccountStore;
let sessions: SpySessions;
let svc: AuthService;
let dirs: { acc: string; ses: string };

function setup(maxTracked?: number) {
  const base = path.join(root, `t${++n}`);
  dirs = { acc: path.join(base, "accounts"), ses: path.join(base, "sessions") };
  accounts = new FileAccountStore(dirs.acc);
  sessions = new SpySessions(dirs.ses);
  t = T0;
  calls = { hash: 0, verify: 0, dummy: 0 };
  const kdf: Kdf = {
    hash: (s) => (calls.hash++, hashSecretScrypt(s, CHEAP)),
    verify: (s, h) => (calls.verify++, verifyScrypt(s, h)),
    dummy: () => (calls.dummy++, cheapDummy),
    needsRehash: (h) => needsRehash(h, TARGET),
  };
  svc = new AuthService({ accounts, sessions, kdf, now: () => t, maxTracked });
}
beforeEach(() => setup());

const PW = "mat-khau-dai-du";
const reg = async (username = "lam_thanh", ip = "1.1.1.1", password = PW) => {
  const r = await svc.register(ip, { username, password });
  if (!r.ok) throw new Error(`đăng ký lỗi: ${r.error}`);
  return r.value;
};
const login = (username: string, password: string, ip = "2.2.2.2") =>
  svc.login(ip, { username, password });
const errOf = (r: { ok: boolean; error?: string }) => (r.ok ? "ok" : r.error);

describe("đăng ký", () => {
  it("thành công: token + mã khôi phục; kho chỉ giữ băm; phiên dùng được; hasCharacter false", async () => {
    const r = await reg("Lam_Thanh"); // chuẩn hoá chữ thường
    expect(r.token).toHaveLength(43);
    expect(r.recoveryCode).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    const a = (await accounts.byUsername("lam_thanh"))!;
    expect(await verifyScrypt(PW, a.passHash)).toBe(true);
    expect(await verifyScrypt(r.recoveryCode.replace(/-/g, ""), a.recoveryHash)).toBe(true);
    // Không có gì ở dạng rõ trên đĩa: mật khẩu, mã khôi phục, token
    const onDisk = [
      ...readdirSync(dirs.acc).map((f) => readFileSync(path.join(dirs.acc, f), "utf8")),
      ...readdirSync(dirs.ses).map((f) => readFileSync(path.join(dirs.ses, f), "utf8")),
    ].join("\n");
    for (const secret of [PW, r.recoveryCode, r.recoveryCode.replace(/-/g, ""), r.token])
      expect(onDisk).not.toContain(secret);
    expect(await sessions.get(hashToken(r.token))).not.toBeNull();
    expect(await svc.me(r.token)).toEqual({
      ok: true,
      value: { username: "lam_thanh", hasCharacter: false },
    });
  });

  it("đầu vào xấu: kiểu sai, tên sai luật, mật khẩu yếu: đúng mã lỗi, không tạo gì, không tốn hạn mức", async () => {
    const cases: [unknown, string][] = [
      [null, "invalid"],
      [[], "invalid"],
      ["x", "invalid"],
      [{ username: "abc" }, "invalid"],
      [{ username: "abc", password: 12345678 }, "invalid"],
      [{ username: "abc", password: "x".repeat(300) }, "invalid"],
      [{ username: 5, password: PW }, "username_invalid"],
      [{ username: "ab", password: PW }, "username_invalid"],
      [{ username: "Lâm Thanh", password: PW }, "username_invalid"],
      [{ username: "../etc", password: PW }, "username_invalid"],
      [{ username: "abc", password: "ngan" }, "weak_password"],
      [{ username: "abc", password: "password" }, "weak_password"],
      [{ username: "lam_thanh", password: "LAM_THANH" }, "weak_password"],
      [{ username: "abc", password: "x".repeat(129) }, "weak_password"],
    ];
    for (const [body, code] of cases)
      expect(errOf(await svc.register("9.9.9.9", body)), JSON.stringify(body)).toBe(code);
    expect(calls.hash).toBe(0);
    expect(await accounts.byUsername("abc")).toBeNull();
    for (let i = 0; i < REGISTER_PER_IP; i++) await reg(`ten_hop_le${i}`, "9.9.9.9"); // hạn mức còn nguyên
  });

  it("tên đã có (kể cả khác hoa thường): username_taken; 20 yêu cầu cùng tên cùng lúc: đúng một cái thắng", async () => {
    await reg("lam_thanh");
    expect(errOf(await svc.register("3.3.3.3", { username: "LAM_THANH", password: PW }))).toBe(
      "username_taken",
    );
    const rs = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        svc.register(`10.0.0.${i}`, { username: "dua_ten", password: PW }),
      ),
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => !r.ok && r.error === "username_taken")).toBe(true);
    expect(readdirSync(dirs.acc).filter((f) => f.endsWith(".json"))).toHaveLength(2);
  });

  it(`giới hạn ${REGISTER_PER_IP} lần/giờ theo IP: lần kế rate_limited kèm retryAfterS, IP khác không ảnh hưởng, sau 1 giờ được lại`, async () => {
    for (let i = 0; i < REGISTER_PER_IP; i++) await reg(`nguoi_${i}`, "5.5.5.5");
    const r = await svc.register("5.5.5.5", { username: "nguoi_x", password: PW });
    expect(r).toMatchObject({ ok: false, error: "rate_limited", status: 429 });
    expect(r.ok === false && r.retryAfterS).toBe(3600);
    await reg("nguoi_khac", "6.6.6.6");
    t += 30 * MIN;
    expect((await svc.register("5.5.5.5", { username: "nguoi_x", password: PW })).ok).toBe(false);
    t += 30 * MIN;
    expect((await svc.register("5.5.5.5", { username: "nguoi_x", password: PW })).ok).toBe(true);
  });

  it("đăng ký trùng tên cũng tính vào hạn mức (không dùng đăng ký để dò tên hàng loạt)", async () => {
    await reg("lam_thanh", "7.7.7.7");
    for (let i = 0; i < REGISTER_PER_IP - 1; i++)
      await svc.register("7.7.7.7", { username: "lam_thanh", password: PW });
    expect(errOf(await svc.register("7.7.7.7", { username: "lam_thanh", password: PW }))).toBe(
      "rate_limited",
    );
  });
});

describe("đăng nhập", () => {
  it("đúng: token mới dùng được, ghi lần đăng nhập cuối; token đăng ký vẫn còn dùng được (nhiều thiết bị)", async () => {
    const r1 = await reg();
    t += 5 * MIN;
    const r = await login("LAM_THANH", PW);
    expect(r.ok).toBe(true);
    const tok = r.ok ? r.value.token : "";
    expect(tok).not.toBe(r1.token);
    expect((await accounts.byUsername("lam_thanh"))?.lastLoginAt).toBe(new Date(t).toISOString());
    expect((await svc.me(tok)).ok).toBe(true);
    expect((await svc.me(r1.token)).ok).toBe(true);
  });

  it("sai mật khẩu và tên không tồn tại: CÙNG một câu trả lời và đúng MỘT lần scrypt mỗi lần (không lộ tên nào có thật)", async () => {
    await reg();
    calls.verify = calls.dummy = 0;
    const wrongPw = await login("lam_thanh", "sai-mat-khau-roi");
    expect([calls.verify, calls.dummy]).toEqual([1, 0]);
    calls.verify = calls.dummy = 0;
    const noUser = await login("khong_co_ten_nay", "sai-mat-khau-roi");
    expect([calls.verify, calls.dummy]).toEqual([1, 1]); // băm giả: verify đúng 1 lần
    expect(wrongPw).toEqual(noUser);
    expect(wrongPw).toEqual({ ok: false, error: "bad_credentials", status: 401 });
  });

  it("đầu vào xấu: kiểu sai là invalid; tên sai luật như sai thông tin (không tốn scrypt, không thành tài khoản)", async () => {
    for (const body of [
      null,
      [],
      { username: "a" },
      { username: 1, password: "x" },
      { username: "a".repeat(100), password: "x" },
      { username: "abc", password: "x".repeat(300) },
    ])
      expect(errOf(await svc.login("2.2.2.2", body)), JSON.stringify(body)).toBe("invalid");
    calls.verify = 0;
    expect(errOf(await login("Lâm Thanh!", PW, "2.2.2.3"))).toBe("bad_credentials");
    expect(calls.verify).toBe(0);
  });

  it("tài khoản bị khoá (disabled) không vào được dù mật khẩu đúng, cùng câu bad_credentials", async () => {
    await reg();
    const a = (await accounts.byUsername("lam_thanh"))!;
    await accounts.update(a.id, { disabled: true });
    expect(await login("lam_thanh", PW)).toEqual({
      ok: false,
      error: "bad_credentials",
      status: 401,
    });
  });

  it(`IP thất bại ${LOGIN_FAIL_PER_IP} lần/10 phút thì bị chặn, kể cả mật khẩu đúng, và KHÔNG tốn scrypt; hết 10 phút được lại`, async () => {
    await reg();
    for (let i = 0; i < LOGIN_FAIL_PER_IP; i++)
      await login(`ten_la_${i}`, "sai-mat-khau-roi", "8.8.8.8");
    calls.verify = 0;
    const r = await login("lam_thanh", PW, "8.8.8.8");
    expect(r).toMatchObject({ ok: false, error: "rate_limited", status: 429 });
    expect(calls.verify).toBe(0);
    expect(r.ok === false && r.retryAfterS).toBe(600);
    expect((await login("lam_thanh", PW, "8.8.4.4")).ok).toBe(true); // IP khác không bị
    t += 10 * MIN;
    expect((await login("lam_thanh", PW, "8.8.8.8")).ok).toBe(true);
  });

  it("khoá mềm theo tên: 5 lần sai (từ nhiều IP) khoá 1 phút, mật khẩu đúng cũng bị từ chối; lần khoá sau 5 phút, rồi 30 phút; đăng nhập đúng xoá", async () => {
    await reg();
    const bad = async (k: number) => {
      for (let i = 0; i < k; i++) await login("lam_thanh", "sai-mat-khau-roi", `4.4.${k}.${i}`);
    };
    await bad(4);
    expect((await login("lam_thanh", PW, "4.4.0.1")).ok).toBe(true); // 4 lần chưa khoá, đúng thì xoá bộ đếm
    await bad(5);
    let r = await login("lam_thanh", PW, "4.4.9.9");
    expect(r).toMatchObject({ ok: false, error: "rate_limited" });
    expect(r.ok === false && r.retryAfterS).toBe(60);
    t += 59_000;
    expect(errOf(await login("lam_thanh", PW, "4.4.9.9"))).toBe("rate_limited");
    t += 1_000;
    await bad(5); // hết khoá 1 phút, sai tiếp 5 lần: bậc 2 = 5 phút
    r = await login("lam_thanh", PW, "4.4.9.9");
    expect(r.ok === false && r.retryAfterS).toBe(300);
    t += 5 * MIN;
    await bad(5);
    r = await login("lam_thanh", PW, "4.4.9.9");
    expect(r.ok === false && r.retryAfterS).toBe(1800);
    t += 30 * MIN;
    await bad(5);
    r = await login("lam_thanh", PW, "4.4.9.9");
    expect(r.ok === false && r.retryAfterS).toBe(1800); // giữ trần 30 phút
    t += 30 * MIN;
    expect((await login("lam_thanh", PW, "4.4.9.9")).ok).toBe(true);
    await bad(4);
    expect((await login("lam_thanh", PW, "4.4.9.9")).ok).toBe(true); // đã xoá: bậc về đầu
  });

  it("tên KHÔNG tồn tại cũng bị khoá mềm giống hệt tên có thật (không lộ tên)", async () => {
    await reg();
    const probe = async (name: string) => {
      for (let i = 0; i < 5; i++) await login(name, "sai-mat-khau-roi", `3.3.${name.length}.${i}`);
      const r = await login(name, PW, "3.3.250.250");
      return r.ok === false ? [r.error, r.retryAfterS] : "ok";
    };
    expect(await probe("lam_thanh")).toEqual(await probe("khong_co_ten_nay".slice(0, 9)));
  });
});

describe("phiên", () => {
  it("hạn 30 ngày: hết hạn thì không dùng được và bị xoá khỏi kho", async () => {
    const { token } = await reg();
    t += SESSION_TTL_MS - 1;
    expect((await svc.me(token)).ok).toBe(true);
    t += SESSION_TTL_MS; // quá hạn (lần dùng ở trên đã làm mới, tính tiếp từ đó)
    expect(errOf(await svc.me(token))).toBe("unauthorized");
    expect(await sessions.get(hashToken(token))).toBeNull();
  });

  it("phiên trượt: dùng thì gia hạn, nhưng ghi tối đa mỗi ngày một lần", async () => {
    const { token } = await reg();
    expect(sessions.touches).toBe(0);
    for (let i = 0; i < 20; i++) {
      t += 60_000;
      await svc.me(token);
    }
    expect(sessions.touches).toBe(0); // dưới một ngày: không ghi
    t += SESSION_TOUCH_MS;
    await svc.me(token);
    await svc.me(token);
    expect(sessions.touches).toBe(1);
    expect((await sessions.get(hashToken(token)))?.expiresAt).toBe(t + SESSION_TTL_MS);
  });

  it("token rác / sai dạng / không có: null, không ném, không tra kho", async () => {
    for (const bad of [undefined, null, 5, {}, "", "abc", "a".repeat(43), "a".repeat(1000), "../x"])
      expect(errOf(await svc.me(bad)), String(bad)).toBe("unauthorized");
  });

  it("đăng xuất xoá đúng phiên này, phiên khác còn; gọi lại / token rác không lỗi", async () => {
    const a = await reg();
    const b = await login("lam_thanh", PW);
    const tokB = b.ok ? b.value.token : "";
    await svc.logout(a.token);
    expect(errOf(await svc.me(a.token))).toBe("unauthorized");
    expect((await svc.me(tokB)).ok).toBe(true);
    await svc.logout(a.token);
    await svc.logout("rác");
    await svc.logout(undefined);
  });

  it("tài khoản bị khoá thì phiên đang có cũng vô hiệu; tài khoản mất thì phiên mồ côi bị xoá", async () => {
    const { token } = await reg();
    const a = (await accounts.byUsername("lam_thanh"))!;
    await accounts.update(a.id, { disabled: true });
    expect(errOf(await svc.me(token))).toBe("unauthorized");
    await accounts.update(a.id, { disabled: false });
    expect((await svc.me(token)).ok).toBe(true);
    // phiên của tài khoản không tồn tại
    const ghost = new AuthService({
      accounts: new FileAccountStore(path.join(root, "trong")),
      sessions,
      now: () => t,
    });
    expect(errOf(await ghost.me(token))).toBe("unauthorized");
    expect(await sessions.get(hashToken(token))).toBeNull();
  });

  it("sweep xoá phiên hết hạn, giữ phiên còn hạn", async () => {
    const a = await reg("nguoi_a", "1.0.0.1");
    t += SESSION_TTL_MS - MIN;
    const b = await reg("nguoi_b", "1.0.0.2");
    t += 2 * MIN; // a hết hạn, b còn
    expect(await svc.sweep()).toBe(1);
    expect(await sessions.get(hashToken(a.token))).toBeNull();
    expect(await sessions.get(hashToken(b.token))).not.toBeNull();
  });
});

describe("khôi phục mật khẩu", () => {
  const rec = (username: string, recoveryCode: string, newPassword: string, ip = "3.3.3.3") =>
    svc.recover(ip, { username, recoveryCode, newPassword });

  it("đúng mã: mật khẩu mới dùng được, mật khẩu cũ và mọi phiên cũ vô hiệu, sinh mã khôi phục MỚI, mã cũ hết dùng", async () => {
    const { token, recoveryCode } = await reg();
    const other = await login("lam_thanh", PW);
    const r = await rec(
      "lam_thanh",
      recoveryCode.toLowerCase().replace(/-/g, " "),
      "mat-khau-moi-dai",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.recoveryCode).not.toBe(recoveryCode);
    expect(errOf(await svc.me(token))).toBe("unauthorized");
    expect(errOf(await svc.me(other.ok ? other.value.token : ""))).toBe("unauthorized");
    expect((await svc.me(r.value.token)).ok).toBe(true);
    expect(errOf(await login("lam_thanh", PW))).toBe("bad_credentials");
    expect((await login("lam_thanh", "mat-khau-moi-dai")).ok).toBe(true);
    expect(errOf(await rec("lam_thanh", recoveryCode, "mat-khau-khac-nua"))).toBe(
      "bad_credentials",
    ); // mã cũ
    expect((await rec("lam_thanh", r.value.recoveryCode, "mat-khau-khac-nua")).ok).toBe(true); // mã mới
  });

  it("sai mã / mã sai dạng / tên không có: CÙNG lỗi, đúng một lần scrypt, tính vào giới hạn", async () => {
    const { recoveryCode } = await reg();
    const out: unknown[] = [];
    for (const [u, c] of [
      ["lam_thanh", "ABCD-EFGH-JKMN-PQRS"],
      ["lam_thanh", "ngắn"],
      ["khong_co_ten", recoveryCode],
      ["Lâm Thanh!", recoveryCode],
    ] as const) {
      calls.verify = 0;
      out.push(await rec(u, c, "mat-khau-moi-dai"));
      if (u !== "Lâm Thanh!" && c !== "ngắn") expect(calls.verify, `${u} ${c}`).toBe(1);
    }
    expect(new Set(out.map((o) => JSON.stringify(o))).size).toBe(1);
    expect(out[0]).toEqual({ ok: false, error: "bad_credentials", status: 401 });
    // 5 lần sai của tên này đã khoá mềm: mã ĐÚNG cũng bị từ chối
    for (let i = 0; i < 3; i++)
      await rec("lam_thanh", "ABCD-EFGH-JKMN-PQRS", "mat-khau-moi-dai", `5.5.5.${i}`);
    expect(errOf(await rec("lam_thanh", recoveryCode, "mat-khau-moi-dai", "5.5.5.9"))).toBe(
      "rate_limited",
    );
  });

  it("mật khẩu mới yếu: weak_password, KHÔNG tiêu mã, không tính thất bại, không đổi gì", async () => {
    const { token, recoveryCode } = await reg();
    for (let i = 0; i < 10; i++)
      expect(errOf(await rec("lam_thanh", recoveryCode, "ngan"))).toBe("weak_password");
    expect(errOf(await rec("lam_thanh", recoveryCode, "lam_thanh"))).toBe("weak_password");
    expect((await login("lam_thanh", PW)).ok).toBe(true);
    expect((await svc.me(token)).ok).toBe(true);
    expect((await rec("lam_thanh", recoveryCode, "mat-khau-moi-dai")).ok).toBe(true);
  });

  it("đầu vào xấu: invalid", async () => {
    for (const b of [
      null,
      [],
      { username: "a" },
      { username: "a", recoveryCode: 1, newPassword: "x" },
      { username: "a", recoveryCode: "x", newPassword: 5 },
      { username: "a".repeat(100), recoveryCode: "x", newPassword: "x" },
    ])
      expect(errOf(await svc.recover("3.3.3.3", b)), JSON.stringify(b)).toBe("invalid");
  });
});

describe("nâng cấp tham số băm", () => {
  it("băm bằng tham số yếu hơn mục tiêu: đăng nhập đúng thì băm lại và vẫn đăng nhập được; sai thì không đổi", async () => {
    await reg();
    const a = (await accounts.byUsername("lam_thanh"))!;
    expect(needsRehash(a.passHash, TARGET)).toBe(true);
    await login("lam_thanh", "sai-mat-khau-roi");
    expect((await accounts.byUsername("lam_thanh"))?.passHash).toBe(a.passHash);
    expect((await login("lam_thanh", PW)).ok).toBe(true);
    const b = (await accounts.byUsername("lam_thanh")) as AccountRecord;
    expect(b.passHash).not.toBe(a.passHash);
    expect(await verifyScrypt(PW, b.passHash)).toBe(true);
  });
});

describe("bộ nhớ của giới hạn", () => {
  it("rất nhiều IP / tên khác nhau không làm phình bộ đếm quá trần", async () => {
    setup(50);
    for (let i = 0; i < 400; i++)
      await login(`ten_la_${i}`, "sai-mat-khau-roi", `10.1.${i >> 8}.${i & 255}`);
    const s = svc as unknown as { ipFails: { size: number }; locks: { size: number } };
    expect(s.ipFails.size).toBeLessThanOrEqual(50);
    expect(s.locks.size).toBeLessThanOrEqual(50);
  });
});

describe("bảng mã HTTP", () => {
  it("có đủ mọi mã lỗi của hợp đồng, đều là 4xx", () => {
    expect(Object.keys(AUTH_STATUS).sort()).toEqual([...AUTH_ERRORS].sort());
    for (const s of Object.values(AUTH_STATUS)) {
      expect(s).toBeGreaterThanOrEqual(400);
      expect(s).toBeLessThan(500);
    }
  });
});

describe("nhật ký kiểm toán", () => {
  const lines: string[] = [];
  const events = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  beforeEach(() => {
    lines.length = 0;
    setAuditSink(
      (l) => lines.push(l),
      () => t,
    );
  });
  afterAll(() => setAuditSink(null));

  it("đăng nhập sai / tên không tồn tại ghi `auth.login_failed` (IP + tên chuẩn hoá); mật khẩu KHÔNG bao giờ xuất hiện trong log; đăng nhập đúng không ghi", async () => {
    await reg();
    await login("lam_thanh", "mat-khau-sai-bi-mat-1", "3.3.3.3");
    await login("ten_khong_co", "mat-khau-sai-bi-mat-2", "3.3.3.4");
    await login("lam_thanh", PW, "3.3.3.5"); // đúng: không ghi
    expect(events().map((e) => [e.ev, e.ip, e.user])).toEqual([
      ["auth.login_failed", "3.3.3.3", "lam_thanh"],
      ["auth.login_failed", "3.3.3.4", "ten_khong_co"],
    ]);
    const all = lines.join("\n");
    for (const secret of ["mat-khau-sai-bi-mat-1", "mat-khau-sai-bi-mat-2", PW])
      expect(all).not.toContain(secret);
  });

  it("bị chặn theo IP, bị khoá mềm theo tên và đăng ký quá hạn mức ghi `auth.rate_limited` kèm lý do", async () => {
    await reg();
    for (let i = 0; i < LOGIN_FAIL_PER_IP; i++)
      await login(`ten_la_${i}`, "sai-mat-khau-roi", "9.9.9.9");
    lines.length = 0;
    await login("lam_thanh", PW, "9.9.9.9"); // IP bị chặn
    expect(events()).toEqual([
      expect.objectContaining({ ev: "auth.rate_limited", kind: "login", ip: "9.9.9.9", by: "ip" }),
    ]);
    lines.length = 0;
    for (let i = 0; i < REGISTER_PER_IP; i++)
      await svc.register("7.7.7.7", { username: `nguoi_${i}`, password: PW });
    lines.length = 0;
    await svc.register("7.7.7.7", { username: "nguoi_cuoi", password: PW });
    expect(events()).toEqual([
      expect.objectContaining({ ev: "auth.rate_limited", kind: "register", ip: "7.7.7.7" }),
    ]);
    expect(lines.join("")).not.toContain(PW);
  });

  it("khôi phục mật khẩu sai ghi `auth.recover_failed` và không lộ mã khôi phục đã thử", async () => {
    await reg();
    await svc.recover("4.4.4.4", {
      username: "lam_thanh",
      recoveryCode: "ma-khoi-phuc-sai-kiem-tra",
      newPassword: "mat-khau-moi-du-dai",
    });
    expect(events()).toEqual([
      expect.objectContaining({ ev: "auth.recover_failed", ip: "4.4.4.4", user: "lam_thanh" }),
    ]);
    const all = lines.join("");
    expect(all).not.toContain("ma-khoi-phuc-sai-kiem-tra");
    expect(all).not.toContain("mat-khau-moi-du-dai");
  });
});
