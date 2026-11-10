// Công cụ quản trị tài khoản: đặt lại mật khẩu / mã khôi phục, khoá / mở, đăng xuất, liệt kê; từ chối khi server đang chạy;
// không bao giờ in băm / token. Dùng kho file thật trong thư mục tạm và AuthService thật để kiểm HIỆU QUẢ (đăng nhập được hay không).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePassword } from "@tien-gioi/shared";
import { FileAccountStore, FileSessionStore } from "../src/account-store";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "../src/auth";
import { AuthService } from "../src/auth-service";
import { randomPassword, runTool, type ToolDeps } from "./tai-khoan";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-tk-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

const CHEAP = { N: 1 << 10, r: 8, p: 1 };
const cheapDummy = hashSecretScrypt("x", CHEAP);
const PW = "mat-khau-dai-du";

let dir: string;
let accounts: FileAccountStore;
let sessions: FileSessionStore;
let auth: AuthService;
let up: boolean;
let deps: ToolDeps;
let seq = 0;

beforeEach(() => {
  dir = path.join(root, `t${++n}`);
  accounts = new FileAccountStore(path.join(dir, "accounts"));
  sessions = new FileSessionStore(path.join(dir, "sessions"));
  auth = new AuthService({
    accounts,
    sessions,
    kdf: {
      hash: (s) => hashSecretScrypt(s, CHEAP),
      verify: verifyScrypt,
      dummy: () => cheapDummy,
      needsRehash: (h) => needsRehash(h, CHEAP),
    },
  });
  up = false;
  deps = {
    accounts,
    sessions,
    isServerUp: async () => up,
    hash: (s) => hashSecretScrypt(s, CHEAP),
  };
});

async function reg(username: string, name?: string) {
  const r = await auth.register(`1.0.${++seq >> 8}.${seq & 255}`, { username, password: PW });
  if (!r.ok) throw new Error(r.error);
  if (name) await accounts.setName((await accounts.byUsername(username))!.id, name);
  return r.value;
}
const login = (u: string, p: string) =>
  auth.login(`2.0.${++seq >> 8}.${seq & 255}`, { username: u, password: p });
const text = (r: { lines: string[] }) => r.lines.join("\n");
const grab = (r: { lines: string[] }, label: RegExp) => r.lines.join("\n").match(label)?.[1];

describe("cách dùng", () => {
  it("thiếu lệnh / lệnh lạ / sai số tham số: mã 1 kèm hướng dẫn, không đụng gì", async () => {
    await reg("lam_thanh");
    for (const argv of [
      [],
      ["xoa"],
      ["show"],
      ["reset-password"],
      ["list", "x"],
      ["show", "a", "b"],
      ["--force"],
    ]) {
      const r = await runTool(argv, deps);
      expect(r.code, argv.join(" ")).toBe(1);
      expect(text(r)).toContain("Cách dùng");
    }
    expect((await login("lam_thanh", PW)).ok).toBe(true);
  });

  it("tên không có / sai luật: mã 1, không đổi gì (kể cả tên có ký tự lạ)", async () => {
    for (const cmd of [
      "show",
      "reset-password",
      "reset-recovery",
      "disable",
      "enable",
      "logout-all",
    ])
      for (const name of ["khong_co", "../etc", "Lâm Thanh"]) {
        const r = await runTool([cmd, name], deps);
        expect(r.code, `${cmd} ${name}`).toBe(1);
        expect(text(r)).toContain("Không có tài khoản");
      }
  });
});

describe("list / show (chỉ đọc)", () => {
  it("liệt kê đủ, cũ trước, đánh dấu khoá; chạy được cả khi server đang chạy; KHÔNG in băm / token / mã khôi phục", async () => {
    const a = await reg("nguoi_a", "Lâm Thanh");
    await reg("nguoi_b");
    await accounts.update((await accounts.byUsername("nguoi_b"))!.id, { disabled: true });
    up = true;
    const r = await runTool(["list"], deps);
    expect(r.code).toBe(0);
    const out = text(r);
    expect(out).toMatch(/nguoi_a\s+Lâm Thanh/);
    expect(out).toMatch(/nguoi_b\s+\(chưa có đạo hiệu\).*\[ĐÃ KHOÁ\]/);
    expect(out).toContain("Tổng: 2 tài khoản.");
    expect(out.indexOf("nguoi_a")).toBeLessThan(out.indexOf("nguoi_b"));
    const files = readdirSync(path.join(dir, "accounts")).map((f) =>
      readFileSync(path.join(dir, "accounts", f), "utf8"),
    );
    const hashes = files.flatMap((f) => f.match(/scrypt\$[^"]+/g) ?? []);
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) expect(out).not.toContain(h);
    for (const s of ["scrypt$", a.token, a.recoveryCode]) expect(out).not.toContain(s);
    const show = await runTool(["show", "NGUOI_A"], deps); // tên viết hoa được chuẩn hoá
    expect(text(show)).toContain("Đạo hiệu: Lâm Thanh");
    expect(text(show)).toContain("bình thường");
    expect(text(show)).not.toContain("scrypt$");
  });

  it("danh sách rỗng", async () => {
    expect(await runTool(["list"], deps)).toEqual({ code: 0, lines: ["Tổng: 0 tài khoản."] });
  });
});

describe("reset-password", () => {
  it("mật khẩu tạm dùng được, mật khẩu cũ và MỌI phiên cũ hết hiệu lực, mã khôi phục MỚI dùng được và mã cũ thì không", async () => {
    const a = await reg("lam_thanh", "Lâm Thanh");
    const other = await login("lam_thanh", PW);
    const r = await runTool(["reset-password", "lam_thanh"], deps);
    expect(r.code).toBe(0);
    const password = grab(r, /Mật khẩu tạm:\s+(\S+)/)!;
    const code = grab(r, /Mã khôi phục MỚI:\s+(\S+)/)!;
    expect(text(r)).toContain("đăng xuất 2 phiên");
    expect(validatePassword(password, "lam_thanh").ok).toBe(true);
    expect(errOf(await login("lam_thanh", PW))).toBe("bad_credentials");
    expect(errOf(await auth.me(a.token))).toBe("unauthorized");
    expect(errOf(await auth.me(other.ok ? other.value.token : ""))).toBe("unauthorized");
    expect((await login("lam_thanh", password)).ok).toBe(true);
    // mã cũ vô hiệu, mã mới dùng được (và sinh mã mới nữa)
    const old = await auth.recover("3.0.0.1", {
      username: "lam_thanh",
      recoveryCode: a.recoveryCode,
      newPassword: "mat-khau-moi-dai",
    });
    expect(errOf(old)).toBe("bad_credentials");
    expect(
      (
        await auth.recover("3.0.0.2", {
          username: "lam_thanh",
          recoveryCode: code,
          newPassword: "mat-khau-moi-dai",
        })
      ).ok,
    ).toBe(true);
    expect((await accounts.byUsername("lam_thanh"))?.name).toBe("Lâm Thanh"); // nhân vật giữ nguyên
  });

  it("mỗi lần một mật khẩu và một mã khác; không in băm", async () => {
    await reg("lam_thanh");
    const outs = [
      await runTool(["reset-password", "lam_thanh"], deps),
      await runTool(["reset-password", "lam_thanh"], deps),
    ];
    expect(grab(outs[0], /Mật khẩu tạm:\s+(\S+)/)).not.toBe(grab(outs[1], /Mật khẩu tạm:\s+(\S+)/));
    expect(grab(outs[0], /Mã khôi phục MỚI:\s+(\S+)/)).not.toBe(
      grab(outs[1], /Mã khôi phục MỚI:\s+(\S+)/),
    );
    for (const o of outs) expect(text(o)).not.toContain("scrypt$");
  });
});

describe("reset-recovery", () => {
  it("mã mới dùng được, mã cũ không; mật khẩu và phiên giữ nguyên", async () => {
    const a = await reg("lam_thanh");
    const r = await runTool(["reset-recovery", "lam_thanh"], deps);
    expect(r.code).toBe(0);
    const code = grab(r, /Mã khôi phục MỚI:\s+(\S+)/)!;
    expect(code).not.toBe(a.recoveryCode);
    expect((await auth.me(a.token)).ok).toBe(true);
    expect((await login("lam_thanh", PW)).ok).toBe(true);
    expect(
      errOf(
        await auth.recover("3.0.0.1", {
          username: "lam_thanh",
          recoveryCode: a.recoveryCode,
          newPassword: "mat-khau-moi-dai",
        }),
      ),
    ).toBe("bad_credentials");
    expect(
      (
        await auth.recover("3.0.0.2", {
          username: "lam_thanh",
          recoveryCode: code,
          newPassword: "mat-khau-moi-dai",
        })
      ).ok,
    ).toBe(true);
  });
});

describe("disable / enable / logout-all", () => {
  it("khoá: không đăng nhập được, phiên đang có vô hiệu và bị xoá; mở khoá: đăng nhập lại được", async () => {
    const a = await reg("lam_thanh");
    const r = await runTool(["disable", "lam_thanh"], deps);
    expect(text(r)).toContain("đăng xuất 1 phiên");
    expect(errOf(await login("lam_thanh", PW))).toBe("bad_credentials");
    expect(errOf(await auth.me(a.token))).toBe("unauthorized");
    expect((await accounts.byUsername("lam_thanh"))?.disabled).toBe(true);
    expect(text(await runTool(["show", "lam_thanh"], deps))).toContain("ĐÃ KHOÁ");
    expect((await runTool(["enable", "lam_thanh"], deps)).code).toBe(0);
    expect((await login("lam_thanh", PW)).ok).toBe(true);
  });

  it("logout-all: xoá mọi phiên của đúng tài khoản đó, không đụng tài khoản khác", async () => {
    const a = await reg("nguoi_a");
    const b = await reg("nguoi_b");
    await login("nguoi_a", PW);
    const r = await runTool(["logout-all", "nguoi_a"], deps);
    expect(text(r)).toContain("khỏi 2 thiết bị");
    expect(errOf(await auth.me(a.token))).toBe("unauthorized");
    expect((await auth.me(b.token)).ok).toBe(true);
  });
});

describe("server đang chạy", () => {
  it("lệnh GHI bị từ chối (mã 2, không đổi gì); --force bỏ qua; lệnh chỉ đọc vẫn chạy", async () => {
    const a = await reg("lam_thanh");
    up = true;
    for (const cmd of ["reset-password", "reset-recovery", "disable", "enable", "logout-all"]) {
      const r = await runTool([cmd, "lam_thanh"], deps);
      expect(r.code, cmd).toBe(2);
      expect(text(r)).toContain("TẮT server");
    }
    expect((await login("lam_thanh", PW)).ok).toBe(true);
    expect((await auth.me(a.token)).ok).toBe(true);
    expect((await accounts.byUsername("lam_thanh"))?.disabled).toBe(false);
    expect((await runTool(["show", "lam_thanh"], deps)).code).toBe(0);
    const forced = await runTool(["disable", "lam_thanh", "--force"], deps);
    expect(forced.code).toBe(0);
    expect(errOf(await login("lam_thanh", PW))).toBe("bad_credentials");
  });
});

describe("randomPassword", () => {
  it("đủ dài, chỉ ký tự trong bảng (không 0 O 1 I l), qua validatePassword, khác nhau; phân bố không lệch", () => {
    const seen = new Set<string>();
    const count = new Map<string, number>();
    for (let i = 0; i < 20000; i++) {
      const p = randomPassword();
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
      seen.add(p);
      for (const ch of p) count.set(ch, (count.get(ch) ?? 0) + 1);
    }
    expect(seen.size).toBe(20000);
    expect(validatePassword(randomPassword()).ok).toBe(true);
    expect(count.size).toBe(56);
    const mean = (20000 * 20) / 56;
    for (const [ch, c] of count) expect(Math.abs(c - mean), ch).toBeLessThan(mean * 0.06);
  });
});

function errOf(r: { ok: boolean; error?: string }) {
  return r.ok ? "ok" : r.error;
}
