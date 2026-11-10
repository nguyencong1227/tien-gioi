// Kho tài khoản và phiên bản file: tính duy nhất không bị đua, đạo hiệu một lần, nạp lại sau khi khởi động, tệp hỏng
// bị cách ly, không đi ra ngoài thư mục. Bộ ca "hợp đồng" chạy chung cho File* và Pg* là việc của #176.
import { afterAll, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FileAccountStore,
  FileSessionStore,
  accountsDir,
  nameKeyOf,
  sanitizeAccount,
  sanitizeSession,
  sessionsDir,
  type NewAccount,
  type SessionRecord,
} from "./account-store";
import { hashToken } from "./auth";

const root = mkdtempSync(path.join(tmpdir(), "tien-gioi-acc-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const freshDir = () => path.join(root, `d${++n}`);
/** Các tệp `.json` trong thư mục; chưa có thư mục (chưa ghi gì) thì rỗng. */
const jsonFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

const acc = (username: string): NewAccount => ({
  username,
  passHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  recoveryHash: "scrypt$1024$8$1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g",
  createdAt: "2026-11-10T00:00:00.000Z",
  lastLoginAt: "2026-11-10T00:00:00.000Z",
  disabled: false,
});

describe("FileAccountStore", () => {
  it("tạo / tra theo tên đăng nhập và id; tên đăng nhập trùng thì null; id là uuid", async () => {
    const s = new FileAccountStore(freshDir());
    const a = await s.create(acc("lam_thanh"));
    expect(a?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a?.name).toBeUndefined();
    expect(await s.create(acc("lam_thanh"))).toBeNull();
    expect((await s.byUsername("lam_thanh"))?.id).toBe(a!.id);
    expect((await s.byId(a!.id))?.username).toBe("lam_thanh");
    expect(await s.byUsername("khong_co")).toBeNull();
    expect(await s.byId("khong-co-id-nay")).toBeNull();
  });

  it("40 yêu cầu tạo CÙNG một tên đăng nhập cùng lúc: đúng một cái thắng, trên đĩa đúng một tệp", async () => {
    const dir = freshDir();
    const s = new FileAccountStore(dir);
    const results = await Promise.all(Array.from({ length: 40 }, () => s.create(acc("dua_ten"))));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(jsonFiles(dir)).toHaveLength(1);
  });

  it("từ chối tên đăng nhập chưa chuẩn hoá (chữ hoa, ký tự lạ) thay vì ghi", async () => {
    const dir = freshDir();
    const s = new FileAccountStore(dir);
    await expect(s.create(acc("Lam_Thanh"))).rejects.toThrow();
    await expect(s.create(acc("../etc"))).rejects.toThrow();
    expect(jsonFiles(dir)).toHaveLength(0);
  });

  it("all: mọi tài khoản, cũ trước (ngày tạo, rồi tên đăng nhập); nạp lại từ đĩa vẫn đủ", async () => {
    const dir = freshDir();
    const s = new FileAccountStore(dir);
    expect(await s.all()).toEqual([]);
    await s.create({ ...acc("nguoi_c"), createdAt: "2026-11-12T00:00:00.000Z" });
    await s.create({ ...acc("nguoi_b"), createdAt: "2026-11-10T00:00:00.000Z" });
    await s.create({ ...acc("nguoi_a"), createdAt: "2026-11-10T00:00:00.000Z" });
    expect((await s.all()).map((a) => a.username)).toEqual(["nguoi_a", "nguoi_b", "nguoi_c"]);
    expect((await new FileAccountStore(dir).all()).map((a) => a.username)).toEqual([
      "nguoi_a",
      "nguoi_b",
      "nguoi_c",
    ]);
  });

  it("setName: một lần; hai tài khoản tranh một tên (không phân biệt hoa thường, NFC) thì đúng một bên được", async () => {
    const s = new FileAccountStore(freshDir());
    const a = (await s.create(acc("nguoi_a")))!;
    const b = (await s.create(acc("nguoi_b")))!;
    const [ra, rb] = await Promise.all([
      s.setName(a.id, "Lâm Thanh"),
      s.setName(b.id, "LÂM THANH"),
    ]);
    expect([ra, rb].sort()).toEqual(["name_taken", "ok"]);
    const winner = ra === "ok" ? a : b;
    const loser = ra === "ok" ? b : a;
    expect((await s.byName("lâm thanh"))?.id).toBe(winner.id);
    expect((await s.byId(loser.id))?.name).toBeUndefined();
    // Đã có đạo hiệu thì không đổi được; người thua chọn tên khác được
    expect(await s.setName(winner.id, "Tên Khác")).toBe("has_character");
    expect(await s.setName(loser.id, "Tên Khác")).toBe("ok");
    expect(await s.setName("khong-co-id-nay", "Ai Do")).toBe("not_found");
  });

  it("setName: tên chưa qua cleanName bị ném (không ghi); không có tên nào được giữ", async () => {
    const s = new FileAccountStore(freshDir());
    const a = (await s.create(acc("nguoi_a")))!;
    for (const bad of ["a", "x".repeat(17), "../x", "a<b>", ""])
      await expect(s.setName(a.id, bad), bad).rejects.toThrow();
    expect((await s.byId(a.id))?.name).toBeUndefined();
  });

  it("update: đổi mật khẩu / mã khôi phục / lần đăng nhập / khoá; không đụng tên đăng nhập, id, đạo hiệu", async () => {
    const s = new FileAccountStore(freshDir());
    const a = (await s.create(acc("nguoi_a")))!;
    await s.setName(a.id, "Lâm Thanh");
    const u = await s.update(a.id, {
      passHash: "mới",
      lastLoginAt: "2026-11-11T00:00:00.000Z",
      disabled: true,
    });
    expect([u?.passHash, u?.recoveryHash === a.recoveryHash, u?.disabled]).toEqual([
      "mới",
      true,
      true,
    ]);
    expect([u?.id, u?.username, u?.name]).toEqual([a.id, "nguoi_a", "Lâm Thanh"]);
    expect(await s.update("khong-co-id-nay", { disabled: true })).toBeNull();
  });

  it("nạp lại từ đĩa (cửa hàng mới trên cùng thư mục): tài khoản, đạo hiệu, chỉ mục vẫn đủ; tệp 0600 và không còn tệp tạm", async () => {
    const dir = freshDir();
    const s1 = new FileAccountStore(dir);
    const a = (await s1.create(acc("nguoi_a")))!;
    await s1.setName(a.id, "Lâm Thanh");
    await s1.update(a.id, { passHash: "băm-mới" });
    const s2 = new FileAccountStore(dir);
    const back = await s2.byUsername("nguoi_a");
    expect([back?.id, back?.name, back?.passHash]).toEqual([a.id, "Lâm Thanh", "băm-mới"]);
    expect((await s2.byName("LÂM THANH"))?.id).toBe(a.id);
    expect(await s2.create(acc("nguoi_a"))).toBeNull();
    const c = (await s2.create(acc("nguoi_c")))!;
    expect(await s2.setName(c.id, "lâm thanh")).toBe("name_taken");
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
    expect(statSync(path.join(dir, `${a.id}.json`)).mode & 0o777).toBe(0o600);
  });

  it("tệp hỏng / sai dạng bị cách ly thành *.hong-*, không làm sập và không chặn tài khoản khác", async () => {
    const dir = freshDir();
    const s1 = new FileAccountStore(dir);
    const ok = (await s1.create(acc("nguoi_ok")))!;
    writeFileSync(path.join(dir, "rac.json"), "{không phải json");
    writeFileSync(path.join(dir, "sai-dang.json"), JSON.stringify({ id: "x", username: "A!" }));
    const s2 = new FileAccountStore(dir);
    expect((await s2.byId(ok.id))?.username).toBe("nguoi_ok");
    const files = readdirSync(dir);
    expect(files.filter((f) => f.includes(".hong-"))).toHaveLength(2);
    expect(files).not.toContain("rac.json");
  });

  it("hai tệp cùng tên đăng nhập (sửa tay): giữ một, không sập", async () => {
    const dir = freshDir();
    const s1 = new FileAccountStore(dir);
    const a = (await s1.create(acc("nguoi_a")))!;
    const copy = {
      ...readJson(path.join(dir, `${a.id}.json`)),
      id: "11111111-1111-1111-1111-111111111111",
    };
    writeFileSync(path.join(dir, `${copy.id}.json`), JSON.stringify(copy));
    const s2 = new FileAccountStore(dir);
    expect(await s2.byUsername("nguoi_a")).not.toBeNull();
    expect(await s2.create(acc("nguoi_a"))).toBeNull();
  });
});

const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8"));

describe("sanitizeAccount / sanitizeSession (dữ liệu từ tệp không đáng tin)", () => {
  const good = { id: "11111111-1111-1111-1111-111111111111", ...acc("lam_thanh") };
  it("nhận bản tốt; kiểu sai / thiếu trường / tên đăng nhập chưa chuẩn hoá / đạo hiệu sai thì null", () => {
    expect(sanitizeAccount(good)?.username).toBe("lam_thanh");
    const bads: unknown[] = [
      null,
      [],
      "x",
      { ...good, id: 5 },
      { ...good, id: "../x" },
      { ...good, username: "Lam_Thanh" },
      { ...good, username: "ab" },
      { ...good, passHash: "" },
      { ...good, passHash: "x".repeat(600) },
      { ...good, recoveryHash: 7 },
      { ...good, name: "a" },
      { ...good, name: " Lâm  Thanh" },
      { ...good, name: 5 },
    ];
    for (const b of bads) expect(sanitizeAccount(b), JSON.stringify(b)).toBeNull();
  });
  it("thời gian hỏng được thay bằng mốc 0, `disabled` chỉ true khi đúng true", () => {
    const a = sanitizeAccount({ ...good, createdAt: "không", lastLoginAt: 5, disabled: "yes" });
    expect([a?.createdAt, a?.lastLoginAt, a?.disabled]).toEqual([
      new Date(0).toISOString(),
      new Date(0).toISOString(),
      false,
    ]);
  });
  it("không mang theo trường lạ (`__proto__`, `isAdmin`...)", () => {
    const a = sanitizeAccount({ ...good, isAdmin: true, ["__proto__"]: { x: 1 } }) as any;
    expect(a.isAdmin).toBeUndefined();
    expect(Object.keys(a).sort()).toEqual([
      "createdAt",
      "disabled",
      "id",
      "lastLoginAt",
      "passHash",
      "recoveryHash",
      "username",
    ]);
  });
  it("phiên: hash phải đúng sha256 hex, thời gian hữu hạn", () => {
    const s: SessionRecord = {
      tokenHash: hashToken("t"),
      accountId: good.id,
      createdAt: 1,
      expiresAt: 2,
      lastSeenAt: 1,
    };
    expect(sanitizeSession(s)).toEqual(s);
    for (const b of [
      null,
      { ...s, tokenHash: "../../x" },
      { ...s, tokenHash: "A".repeat(64) },
      { ...s, accountId: "../x" },
      { ...s, expiresAt: NaN },
      { ...s, createdAt: -1 },
      { ...s, lastSeenAt: "1" },
    ])
      expect(sanitizeSession(b), JSON.stringify(b)).toBeNull();
  });
  it("nameKeyOf: NFC + chữ thường", () => {
    expect(nameKeyOf("Á")).toBe(nameKeyOf("Á".normalize("NFC").toLowerCase()));
    expect(nameKeyOf("LÂM")).toBe(nameKeyOf("lâm"));
  });
});

const sess = (token: string, accountId: string, expiresAt: number): SessionRecord => ({
  tokenHash: hashToken(token),
  accountId,
  createdAt: 1000,
  expiresAt,
  lastSeenAt: 1000,
});

describe("FileSessionStore", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";

  it("tạo / tra / làm mới (touch) / xoá; tra token lạ là null", async () => {
    const s = new FileSessionStore(freshDir());
    await s.create(sess("t1", A, 5000));
    expect((await s.get(hashToken("t1")))?.accountId).toBe(A);
    expect(await s.get(hashToken("khac"))).toBeNull();
    await s.touch(hashToken("t1"), 2000, 9000);
    const t = await s.get(hashToken("t1"));
    expect([t?.lastSeenAt, t?.expiresAt, t?.createdAt]).toEqual([2000, 9000, 1000]);
    await s.touch(hashToken("khac"), 1, 2); // không có thì bỏ qua
    await s.delete(hashToken("t1"));
    expect(await s.get(hashToken("t1"))).toBeNull();
    await s.delete(hashToken("t1")); // xoá lần hai không lỗi
  });

  it("deleteAllOf chỉ xoá phiên của tài khoản đó; deleteExpired chỉ xoá phiên đã hết hạn; số trả về đúng", async () => {
    const dir = freshDir();
    const s = new FileSessionStore(dir);
    await s.create(sess("a1", A, 5000));
    await s.create(sess("a2", A, 9000));
    await s.create(sess("b1", B, 3000));
    expect(await s.deleteExpired(5000)).toBe(2); // b1 (3000) và a1 (đúng 5000 coi là hết)
    expect(await s.get(hashToken("a2"))).not.toBeNull();
    expect(await s.deleteAllOf(B)).toBe(0);
    expect(await s.deleteAllOf(A)).toBe(1);
    expect(jsonFiles(dir)).toHaveLength(0);
  });

  it("nạp lại sau khởi động; phiên đã xoá không sống lại; tệp tạm không còn", async () => {
    const dir = freshDir();
    const s1 = new FileSessionStore(dir);
    await s1.create(sess("a1", A, 5000));
    await s1.create(sess("a2", A, 5000));
    await s1.delete(hashToken("a1"));
    const s2 = new FileSessionStore(dir);
    expect(await s2.get(hashToken("a1"))).toBeNull();
    expect((await s2.get(hashToken("a2")))?.accountId).toBe(A);
    expect(await s2.deleteAllOf(A)).toBe(1);
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toHaveLength(0);
  });

  it("chỉ ghi token đã băm: nội dung tệp không chứa token thật; tệp 0600", async () => {
    const dir = freshDir();
    const s = new FileSessionStore(dir);
    await s.create(sess("token-bi-mat", A, 5000));
    const [f] = readdirSync(dir);
    expect(readFileSync(path.join(dir, f), "utf8")).not.toContain("token-bi-mat");
    expect(statSync(path.join(dir, f)).mode & 0o777).toBe(0o600);
  });

  it("xoá bằng tokenHash lạ (../, dấu phân cách) không đụng tệp ngoài thư mục phiên", async () => {
    const dir = freshDir();
    const outside = path.join(root, "ngoai.json");
    writeFileSync(outside, "{}");
    const s = new FileSessionStore(path.join(dir, "sessions"));
    await s.create(sess("a1", A, 5000));
    await s.delete("../ngoai");
    await s.delete(path.join("..", "..", "ngoai"));
    expect(readFileSync(outside, "utf8")).toBe("{}");
    expect(await s.get(hashToken("a1"))).not.toBeNull();
  });

  it("từ chối tạo phiên sai dạng (không ghi)", async () => {
    const dir = freshDir();
    const s = new FileSessionStore(dir);
    await expect(s.create({ ...sess("a", A, 5000), tokenHash: "../x" })).rejects.toThrow();
    await expect(s.create({ ...sess("a", A, 5000), expiresAt: Number.NaN })).rejects.toThrow();
    expect(jsonFiles(dir)).toHaveLength(0);
  });

  it("tệp phiên hỏng bị cách ly, phiên khác vẫn dùng được", async () => {
    const dir = freshDir();
    const s1 = new FileSessionStore(dir);
    await s1.create(sess("a1", A, 5000));
    writeFileSync(path.join(dir, `${"b".repeat(64)}.json`), "rác");
    const s2 = new FileSessionStore(dir);
    expect(await s2.get(hashToken("a1"))).not.toBeNull();
    expect(readdirSync(dir).filter((f) => f.includes(".hong-"))).toHaveLength(1);
  });
});

describe("accountsDir / sessionsDir", () => {
  it("mặc định nằm trong DATA_DIR (cùng volume và bản sao lưu); ACCOUNTS_DIR / SESSIONS_DIR ghi đè", () => {
    const keep = { ...process.env };
    try {
      delete process.env.ACCOUNTS_DIR;
      delete process.env.SESSIONS_DIR;
      process.env.DATA_DIR = "/tmp/xyz-players";
      expect(accountsDir()).toBe("/tmp/xyz-players/accounts");
      expect(sessionsDir()).toBe("/tmp/xyz-players/sessions");
      process.env.ACCOUNTS_DIR = "/tmp/tk";
      process.env.SESSIONS_DIR = "/tmp/ph";
      expect([accountsDir(), sessionsDir()]).toEqual(["/tmp/tk", "/tmp/ph"]);
    } finally {
      process.env = keep;
    }
  });
});
