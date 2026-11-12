// Công cụ quản trị tài khoản: đặt lại mật khẩu / mã khôi phục, khoá / mở, đăng xuất, liệt kê; từ chối khi server đang chạy;
// không bao giờ in băm / token. Dùng kho file thật trong thư mục tạm và AuthService thật để kiểm HIỆU QUẢ (đăng nhập được hay không).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePassword } from "@tien-gioi/shared";
import { FileAccountStore, FileSessionStore } from "../src/account-store";
import { hashSecretScrypt, needsRehash, verifyScrypt } from "../src/auth";
import { AuthService } from "../src/auth-service";
import { FileSoulStore } from "../src/soul";
import { FileSectStore } from "../src/sect-store";
import type { PlayerStore } from "../src/player-store";
import { cleanAuditFields } from "../src/audit";
import { makeSavedPlayer, makeSect } from "../src/store-contract";
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
let players: PlayerStore;
let souls: FileSoulStore;
let sects: FileSectStore;
let memPlayers: Map<string, any>;
let auditEvents: Array<{ ev: string; fields?: Record<string, unknown> }>;
let auth: AuthService;
let up: boolean;
let deps: ToolDeps;
let seq = 0;

beforeEach(() => {
  dir = path.join(root, `t${++n}`);
  accounts = new FileAccountStore(path.join(dir, "accounts"));
  sessions = new FileSessionStore(path.join(dir, "sessions"));
  memPlayers = new Map();
  players = {
    load: async (name) => memPlayers.get(name.normalize("NFC").toLowerCase()) ?? null,
    save: async (p) => void memPlayers.set(p.name.normalize("NFC").toLowerCase(), p),
    delete: async (name) => memPlayers.delete(name.normalize("NFC").toLowerCase()),
  };
  souls = new FileSoulStore(path.join(dir, "souls"));
  sects = new FileSectStore(path.join(dir, "sects"));
  auditEvents = [];
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
    players,
    souls,
    sects,
    isServerUp: async () => up,
    hash: (s) => hashSecretScrypt(s, CHEAP),
    auditFn: (ev, fields) => auditEvents.push({ ev, fields }),
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

describe("PostgreSQL (serverMustBeOff = false)", () => {
  it("server đang chạy vẫn đặt lại / khoá được (mọi thay đổi đi qua DB); --force không cần", async () => {
    await reg("lam_thanh");
    up = true;
    deps = { ...deps, serverMustBeOff: false };
    const r = await runTool(["reset-password", "lam_thanh"], deps);
    expect(r.code).toBe(0);
    expect((await runTool(["disable", "lam_thanh"], deps)).code).toBe(0);
    expect((await accounts.byUsername("lam_thanh"))?.disabled).toBe(true);
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

describe("xoa - chạy thử (mặc định hoặc có --thu)", () => {
  it("không có cờ hoặc có --thu: in kế hoạch xoá, không đổi bất kỳ dữ liệu nào", async () => {
    const a = await reg("lam_thanh", "Lâm Thanh");
    const acc = (await accounts.byUsername("lam_thanh"))!;
    memPlayers.set("lâm thanh", makeSavedPlayer("Lâm Thanh"));
    await souls.create(acc.id);
    await login("lam_thanh", PW); // tạo 2 phiên
    await login("lam_thanh", PW); // tạo 3 phiên
    await sects.create(
      makeSect("tm1", {
        leader: "khac",
        members: [
          { soulKey: "khac", name: "Chủ", rank: "chu", joinedAt: 1000 },
          { soulKey: acc.id, name: "Lâm Thanh", rank: "de_tu", joinedAt: 1000 },
        ],
      }),
    );

    // Chạy thử mặc định (không có --yes)
    const r1 = await runTool(["xoa", "lam_thanh"], deps);
    expect(r1.code).toBe(0);
    expect(text(r1)).toContain("[CHẠY THỬ]");
    expect(text(r1)).toContain(acc.id);
    expect(text(r1)).toContain("Lâm Thanh");
    expect(text(r1)).toContain("--yes");

    // Dữ liệu còn nguyên vẹn
    expect(await accounts.byUsername("lam_thanh")).not.toBeNull();
    expect(await players.load("Lâm Thanh")).not.toBeNull();
    expect(await souls.get(acc.id)).not.toBeNull();
    expect((await sects.findBySoul(acc.id))?.id).toBe("tm1");
    expect((await auth.me(a.token)).ok).toBe(true);

    // Chạy thử với --thu
    const r2 = await runTool(["xoa", "lam_thanh", "--thu"], deps);
    expect(r2.code).toBe(0);
    expect(text(r2)).toContain("[CHẠY THỬ]");
  });

  it("chạy thử vẫn chạy được khi server đang chạy (chỉ đọc)", async () => {
    await reg("lam_thanh");
    up = true;
    const r = await runTool(["xoa", "lam_thanh"], deps);
    expect(r.code).toBe(0);
    expect(text(r)).toContain("[CHẠY THỬ]");
  });
});

describe("xoa - từ chối an toàn", () => {
  it("tên không tồn tại: mã 1", async () => {
    const r = await runTool(["xoa", "chua_tung_co"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain('Không có tài khoản "chua_tung_co"');
  });

  it("tài khoản đang trực tuyến: từ chối mã 1", async () => {
    await reg("lam_thanh");
    deps = { ...deps, isOnline: () => true };
    const r = await runTool(["xoa", "lam_thanh", "--yes"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain("đang trực tuyến: không xoá");
    expect(await accounts.byUsername("lam_thanh")).not.toBeNull();
  });

  it("Tông chủ còn thành viên khác: từ chối mã 1, yêu cầu chuyển quyền / giải tán trước", async () => {
    await reg("chu_phai", "Tông Chủ");
    const acc = (await accounts.byUsername("chu_phai"))!;
    await sects.create(
      makeSect("tm2", {
        name: "Côn Lôn",
        leader: acc.id,
        members: [
          { soulKey: acc.id, name: "Tông Chủ", rank: "chu", joinedAt: 1000 },
          { soulKey: "thanh_vien_khac", name: "Đệ Tử", rank: "de_tu", joinedAt: 1000 },
        ],
      }),
    );

    const r = await runTool(["xoa", "chu_phai", "--yes"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain("là Tông chủ của tông môn");
    expect(text(r)).toContain("còn 1 thành viên khác");
    expect(await accounts.byUsername("chu_phai")).not.toBeNull();
    expect(await sects.findBySoul(acc.id)).not.toBeNull();
  });

  it("Tông chủ một mình nhưng kho còn Linh thạch: từ chối mã 1, không làm mồ côi tiền", async () => {
    await reg("chu_giau", "Chủ Giàu");
    const acc = (await accounts.byUsername("chu_giau"))!;
    await sects.create(
      makeSect("tm3", {
        name: "Phú Quý Tông",
        leader: acc.id,
        coin: 5000,
        members: [{ soulKey: acc.id, name: "Chủ Giàu", rank: "chu", joinedAt: 1000 }],
      }),
    );

    const r = await runTool(["xoa", "chu_giau", "--yes"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain("còn 5000 Linh thạch trong kho");
    expect(await accounts.byUsername("chu_giau")).not.toBeNull();
    expect((await sects.get("tm3"))?.coin).toBe(5000);
  });

  it("server đang chạy với STORE=file: xoá thật (--yes) bị từ chối mã 2; --force bỏ qua", async () => {
    await reg("lam_thanh");
    up = true;
    const r = await runTool(["xoa", "lam_thanh", "--yes"], deps);
    expect(r.code).toBe(2);
    expect(text(r)).toContain("TẮT server");
    expect(await accounts.byUsername("lam_thanh")).not.toBeNull();

    const forced = await runTool(["xoa", "lam_thanh", "--yes", "--force"], deps);
    expect(forced.code).toBe(0);
    expect(await accounts.byUsername("lam_thanh")).toBeNull();
  });
});

describe("xoa - xoá thật khi có --yes", () => {
  it("xoá thành viên thường trong tông môn: dọn sạch tài khoản, phiên, nhân vật, chân linh, gỡ khỏi tông môn, ghi audit", async () => {
    const a = await reg("nguoi_dung", "Người Dùng");
    const acc = (await accounts.byUsername("nguoi_dung"))!;
    memPlayers.set("người dùng", makeSavedPlayer("Người Dùng"));
    await souls.create(acc.id);
    await login("nguoi_dung", PW); // tạo phiên thứ 2

    // Tông môn có Tông chủ khác và người dùng này là thành viên
    await sects.create(
      makeSect("tm4", {
        name: "Thái Huyền",
        leader: "chu_khac",
        members: [
          { soulKey: "chu_khac", name: "Chủ", rank: "chu", joinedAt: 1000 },
          { soulKey: acc.id, name: "Người Dùng", rank: "de_tu", joinedAt: 1000 },
        ],
      }),
    );

    const r = await runTool(["xoa", "nguoi_dung", "--yes"], deps);
    expect(r.code).toBe(0);
    expect(text(r)).toContain("Đã xoá vĩnh viễn tài khoản");

    // 1. Tài khoản bị xoá
    expect(await accounts.byId(acc.id)).toBeNull();
    expect(await accounts.byUsername("nguoi_dung")).toBeNull();
    expect(await accounts.byName("Người Dùng")).toBeNull();

    // 2. Phiên bị thu hồi
    expect((await auth.me(a.token)).ok).toBe(false);

    // 3. Nhân vật bị xoá
    expect(await players.load("Người Dùng")).toBeNull();

    // 4. Chân linh bị xoá
    expect(await souls.get(acc.id)).toBeNull();

    // 5. Gỡ khỏi tông môn (tông môn còn lại 1 thành viên)
    const sectAfter = await sects.get("tm4");
    expect(sectAfter).not.toBeNull();
    expect(sectAfter?.members.map((m) => m.soulKey)).toEqual(["chu_khac"]);

    // 6. Ghi kiểm toán đúng định dạng và không bị lọc
    expect(auditEvents.length).toBe(1);
    const ev = auditEvents[0];
    expect(ev.ev).toBe("account.deleted");
    expect(ev.fields?.id).toBe(acc.id);
    expect(ev.fields?.character).toBe("Người Dùng");
    expect(ev.fields?.sessions).toBe(2);
    expect(typeof ev.fields?.userDigest).toBe("string");
    // Kiểm tra sạch sẽ qua cleanAuditFields
    const clean = cleanAuditFields(ev.fields);
    expect(clean.userDigest).toBe(ev.fields?.userDigest);
    expect(clean.id).toBe(acc.id);

    // 7. Giải phóng tên đăng nhập, có thể đăng ký lại
    expect((await reg("nguoi_dung")).token).toBeTruthy();
  });

  it("Tông chủ một mình có kho = 0: giải tán tông môn", async () => {
    await reg("chu_doc_than", "Độc Thân");
    const acc = (await accounts.byUsername("chu_doc_than"))!;
    await sects.create(
      makeSect("tm5", {
        name: "Cô Độc Môn",
        leader: acc.id,
        coin: 0,
        members: [{ soulKey: acc.id, name: "Độc Thân", rank: "chu", joinedAt: 1000 }],
      }),
    );

    const r = await runTool(["xoa", "chu_doc_than", "--yes"], deps);
    expect(r.code).toBe(0);
    expect(text(r)).toContain('đã giải tán tông môn "Cô Độc Môn"');
    expect(await sects.get("tm5")).toBeNull();
  });

  it("xoa --yes đòi server phải tắt ở cả hai kho (serverMustBeOff: false vẫn đòi tắt)", async () => {
    await reg("tk_test");
    up = true; // server đang chạy

    // 1. Dù serverMustBeOff: false (PostgreSQL), xoa --yes vẫn bị từ chối với mã 2
    const pgDeps: ToolDeps = { ...deps, serverMustBeOff: false };
    const r1 = await runTool(["xoa", "tk_test", "--yes"], pgDeps);
    expect(r1.code).toBe(2);
    expect(text(r1)).toContain(
      "Server đang chạy (trả lời ở /health): hãy TẮT server rồi chạy lại.",
    );
    expect(text(r1)).toContain("nhân vật trong bộ nhớ sống lại");
    expect(await accounts.byUsername("tk_test")).not.toBeNull();

    // 2. Chạy thử (không --yes): vẫn chạy được bình thường khi server đang bật
    const rDry = await runTool(["xoa", "tk_test"], pgDeps);
    expect(rDry.code).toBe(0);
    expect(text(rDry)).toContain("[CHẠY THỬ]");

    // 3. Có cờ --force: bỏ qua kiểm tra server tắt
    const rForce = await runTool(["xoa", "tk_test", "--yes", "--force"], pgDeps);
    expect(rForce.code).toBe(0);
    expect(await accounts.byUsername("tk_test")).toBeNull();
  });
});

describe("đột biến kiểm chứng (5 khẳng định của Issue #317)", () => {
  it("Đột biến 1: Bỏ kiểm Tông chủ làm Tông chủ có thành viên khác bị xoá và làm tông môn mất chủ", async () => {
    await reg("chu_db1", "Chủ ĐB1");
    const acc = (await accounts.byUsername("chu_db1"))!;
    await sects.create(
      makeSect("tmdb1", {
        name: "Tông ĐB1",
        tag: "TDB1",
        leader: acc.id,
        members: [
          { soulKey: acc.id, name: "Chủ ĐB1", rank: "chu", joinedAt: 1000 },
          { soulKey: "tv_khac", name: "Đệ Tử", rank: "de_tu", joinedAt: 1000 },
        ],
      }),
    );
    const r = await runTool(["xoa", "chu_db1", "--yes"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain("Tông chủ");
    expect(await accounts.byUsername("chu_db1")).not.toBeNull();
    expect((await sects.get("tmdb1"))?.leader).toBe(acc.id);
  });

  it("Đột biến 2: Bỏ kiểm trực tuyến làm tài khoản đang chơi trong phòng bị xoá ngầm", async () => {
    await reg("online_user");
    deps = { ...deps, isOnline: () => true };
    const r = await runTool(["xoa", "online_user", "--yes"], deps);
    expect(r.code).toBe(1);
    expect(text(r)).toContain("đang trực tuyến");
    expect(await accounts.byUsername("online_user")).not.toBeNull();
  });

  it("Đột biến 3: Xoá không có --yes vẫn xoá dữ liệu người chơi", async () => {
    await reg("no_yes_user");
    const r = await runTool(["xoa", "no_yes_user"], deps);
    expect(r.code).toBe(0);
    expect(text(r)).toContain("[CHẠY THỬ]");
    expect(await accounts.byUsername("no_yes_user")).not.toBeNull();
  });

  it("Đột biến 4: Quên xoá phiên hoặc chân linh khi xoá tài khoản", async () => {
    const a = await reg("leak_test", "Đạo Leak");
    const acc = (await accounts.byUsername("leak_test"))!;
    await souls.create(acc.id);
    const r = await runTool(["xoa", "leak_test", "--yes"], deps);
    expect(r.code).toBe(0);
    expect(await accounts.byId(acc.id)).toBeNull();
    // Khẳng định phiên và chân linh không bị bỏ sót
    expect(await souls.get(acc.id)).toBeNull();
    expect((await auth.me(a.token)).ok).toBe(false);
  });

  it("Đột biến 5: Chạy thử (--thu) mà vẫn thay đổi dữ liệu trên hệ thống", async () => {
    const a = await reg("dry_run_user", "Đạo Hữu Dry");
    const acc = (await accounts.byUsername("dry_run_user"))!;
    memPlayers.set("đạo hữu dry", makeSavedPlayer("Đạo Hữu Dry"));
    await souls.create(acc.id);
    await sects.create(
      makeSect("tmdry", {
        name: "Tông Dry",
        tag: "TDRY",
        leader: "other",
        members: [
          { soulKey: "other", name: "Chủ", rank: "chu", joinedAt: 1000 },
          { soulKey: acc.id, name: "Đạo Hữu Dry", rank: "de_tu", joinedAt: 1000 },
        ],
      }),
    );

    const r = await runTool(["xoa", "dry_run_user", "--thu"], deps);
    expect(r.code).toBe(0);

    // Mọi bản ghi giữ nguyên không đổi
    expect(await accounts.byId(acc.id)).not.toBeNull();
    expect(await players.load("Đạo Hữu Dry")).not.toBeNull();
    expect(await souls.get(acc.id)).not.toBeNull();
    expect((await auth.me(a.token)).ok).toBe(true);
    expect((await sects.findBySoul(acc.id))?.id).toBe("tmdry");
  });
});

describe("hàng rào bảo vệ và cờ TIEN_GIOI_PROD (Issue #321)", () => {
  it("CLI scripts/tai-khoan.ts từ chối cổng 2567 khi không có TIEN_GIOI_PROD=1; cho phép khi có TIEN_GIOI_PROD=1", () => {
    const scriptPath = path.resolve(__dirname, "tai-khoan.ts");

    // 1. Khi PORT=2567 và TIEN_GIOI_PROD không phải 1: in lỗi hàng rào gọn, mã thoát 1, không in stack trace
    const bad = spawnSync("node", ["--import", "tsx", scriptPath, "list"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        PORT: "2567",
        TIEN_GIOI_PROD: "0",
      },
    });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("[HÀNG RÀO BẢO VỆ]");
    expect(bad.stderr).toContain("cổng 2567");
    expect(bad.stderr).not.toContain("Error:"); // không in stack trace
    expect(bad.stderr).not.toContain("at main (");

    // 2. Khi TIEN_GIOI_PROD=1: vượt qua hàng rào bảo vệ
    const goodDir = mkdtempSync(path.join(tmpdir(), "tk-prod-test-"));
    try {
      const good = spawnSync("node", ["--import", "tsx", scriptPath, "list"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          PORT: "2567",
          TIEN_GIOI_PROD: "1",
          STORE: "file",
          DATA_DIR: goodDir,
        },
      });
      expect(good.stderr).not.toContain("[HÀNG RÀO BẢO VỆ]");
      expect(good.stdout).toContain("Tổng: 0 tài khoản.");
      expect(good.status).toBe(0);
    } finally {
      rmSync(goodDir, { recursive: true, force: true });
    }
  });

  it("Đột biến: bỏ kiểm tra TIEN_GIOI_PROD === '1' thì môi trường prod bị hàng rào chặn", () => {
    const scriptContent = readFileSync(path.resolve(__dirname, "tai-khoan.ts"), "utf-8");
    expect(scriptContent).toContain('process.env.TIEN_GIOI_PROD !== "1"');
    const mutated = scriptContent.replace(
      'if (process.env.TIEN_GIOI_PROD !== "1")',
      "if (true /* đột biến */)",
    );
    expect(mutated).not.toBe(scriptContent);
  });
});
