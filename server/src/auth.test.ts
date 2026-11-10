// Mật mã tài khoản: scrypt (tham số mặc định chạy được, so hằng thời gian, chuỗi hỏng không ném), token, mã khôi phục.
import { describe, expect, it } from "vitest";
import {
  SCRYPT_DEFAULT,
  dummyHash,
  hashSecretScrypt,
  hashToken,
  isTokenShape,
  needsRehash,
  newRecoveryCode,
  newSessionToken,
  normalizeRecoveryCode,
  parseHash,
  verifyScrypt,
} from "./auth";

/** Tham số rẻ cho test; riêng ca "mặc định" dùng `SCRYPT_DEFAULT` thật. */
const CHEAP = { N: 1 << 10, r: 8, p: 1 };

describe("scrypt", () => {
  it("tham số MẶC ĐỊNH chạy được (không ném RangeError vì maxmem), đúng dạng chuỗi, đúng / sai mật khẩu", async () => {
    const h = await hashSecretScrypt("mật khẩu dài đủ");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyScrypt("mật khẩu dài đủ", h)).toBe(true);
    expect(await verifyScrypt("mật khẩu dài đủ ", h)).toBe(false);
    expect(await verifyScrypt("", h)).toBe(false);
  });

  it("muối ngẫu nhiên: cùng mật khẩu băm hai lần ra hai chuỗi khác nhau, cả hai đều đúng", async () => {
    const a = await hashSecretScrypt("abcdefgh", CHEAP);
    const b = await hashSecretScrypt("abcdefgh", CHEAP);
    expect(a).not.toBe(b);
    expect(await verifyScrypt("abcdefgh", a)).toBe(true);
    expect(await verifyScrypt("abcdefgh", b)).toBe(true);
  });

  it("chuẩn hoá Unicode: cùng một mật khẩu gõ dạng dựng sẵn / tổ hợp đều đúng", async () => {
    const h = await hashSecretScrypt("mật-khẩu-é", CHEAP);
    expect(await verifyScrypt("mật-khẩu-é", h)).toBe(true);
  });

  it("tham số nằm trong chuỗi: băm bằng tham số cũ vẫn kiểm đúng, và needsRehash báo cần băm lại", async () => {
    const old = await hashSecretScrypt("abcdefgh", CHEAP);
    expect(await verifyScrypt("abcdefgh", old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash(old, CHEAP)).toBe(false);
    expect(needsRehash(await hashSecretScrypt("x1234567", SCRYPT_DEFAULT))).toBe(false);
    expect(needsRehash("rác")).toBe(true);
  });

  it("chuỗi băm hỏng / bị sửa không ném mà trả false; tham số quá trần bị từ chối (không cấp bộ nhớ vô hạn)", async () => {
    const good = await hashSecretScrypt("abcdefgh", CHEAP);
    const [, , r, p, salt, key] = good.split("$");
    const bad: unknown[] = [
      undefined,
      null,
      42,
      "",
      "rác",
      "scrypt$1024$8$1$x",
      `scrypt$1000$${r}$${p}$${salt}$${key}`, // N không phải luỹ thừa của 2
      `scrypt$${1 << 30}$${r}$${p}$${salt}$${key}`, // N khổng lồ
      `scrypt$1024$9999$${p}$${salt}$${key}`,
      `scrypt$1024$8$99$${salt}$${key}`,
      `bcrypt$1024$8$1$${salt}$${key}`,
      `scrypt$1024$8$1$$${key}`, // muối rỗng
      "scrypt$1024$8$1$aaaa$bbbb", // muối / khoá quá ngắn
      `scrypt$1024$8$1$${salt}$${"A".repeat(400)}`, // khoá quá dài
      "x".repeat(600),
    ];
    for (const s of bad) {
      expect(parseHash(s), String(s).slice(0, 40)).toBeNull();
      expect(await verifyScrypt("abcdefgh", s)).toBe(false);
    }
  });

  it("khoá băm bị đổi một ký tự (ký tự đầu của khoá: mang đủ 6 bit dữ liệu) thì false", async () => {
    const h = await hashSecretScrypt("abcdefgh", CHEAP);
    const parts = h.split("$");
    parts[5] = (parts[5][0] === "A" ? "B" : "A") + parts[5].slice(1);
    expect(await verifyScrypt("abcdefgh", parts.join("$"))).toBe(false);
  });

  it("dummyHash: chuỗi băm hợp lệ, dùng lại cùng một lời hứa, không khớp mật khẩu người dùng", async () => {
    const d = await dummyHash();
    expect(parseHash(d)).not.toBeNull();
    expect(dummyHash()).toBe(dummyHash());
    expect(await verifyScrypt("abcdefgh", d)).toBe(false);
  });
});

describe("token phiên", () => {
  it("32 byte ngẫu nhiên base64url (43 ký tự), mỗi lần khác nhau, tokenHash là sha256 hex của token", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(isTokenShape(a.token)).toBe(true);
    expect(a.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("isTokenShape từ chối kiểu sai, quá dài / ngắn, ký tự lạ", () => {
    for (const bad of [
      undefined,
      null,
      1,
      {},
      "",
      "a".repeat(42),
      "a".repeat(44),
      "a".repeat(42) + "=",
      "a".repeat(42) + "/",
    ])
      expect(isTokenShape(bad), String(bad)).toBe(false);
    expect(isTokenShape("a".repeat(43))).toBe(true);
  });
});

describe("mã khôi phục", () => {
  it("dạng XXXX-XXXX-XXXX-XXXX trong bảng chữ không có 0 O 1 I; mỗi lần khác nhau", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = newRecoveryCode();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(200);
  });

  it("phân bố đều: 32 ký tự đều xuất hiện, không ký tự nào lệch quá xa (80 bit thật, không thiên lệch modulo)", () => {
    const count = new Map<string, number>();
    const N = 3000;
    for (let i = 0; i < N; i++)
      for (const ch of newRecoveryCode().replace(/-/g, "")) count.set(ch, (count.get(ch) ?? 0) + 1);
    expect(count.size).toBe(32);
    const mean = (N * 16) / 32; // 1500
    for (const [ch, n] of count) expect(Math.abs(n - mean), ch).toBeLessThan(mean * 0.2);
  });

  it("normalizeRecoveryCode: bỏ gạch / dấu cách, viết hoa; sai độ dài hay ký tự ngoài bảng thì null", () => {
    expect(normalizeRecoveryCode("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizeRecoveryCode(" ABCD EFGH JKMN PQRS ")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizeRecoveryCode("ABCDEFGHJKMNPQRS")).toBe("ABCDEFGHJKMNPQRS");
    for (const bad of [
      undefined,
      null,
      5,
      "",
      "ABCD",
      "ABCD-EFGH-JKMN-PQRS-TUVW",
      "0BCD-EFGH-JKMN-PQRS",
      "ABCD-EFGH-JKMN-PQR!",
      "A".repeat(200),
    ])
      expect(normalizeRecoveryCode(bad), String(bad)).toBeNull();
  });
});
