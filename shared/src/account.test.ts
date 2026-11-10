import { describe, expect, it } from "vitest";
import {
  AUTH_API,
  AUTH_ERRORS,
  COMMON_PASSWORDS,
  DAO_HIEU_MAX,
  JOIN_BAD_TOKEN,
  JOIN_NEED_CHARACTER,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
  cleanName,
  parseAuthError,
  validatePassword,
  validateUsername,
} from "./account";
import { JOIN_WRONG_MAP } from "./travel";

describe("cleanName (đạo hiệu)", () => {
  it("nhận 2-16 ký tự chữ (có dấu) / số / khoảng trắng đơn, chuẩn hoá NFC và gộp khoảng trắng", () => {
    expect(cleanName("Lâm Thanh")).toBe("Lâm Thanh");
    expect(cleanName("  Lâm   Thanh  ")).toBe("Lâm Thanh");
    expect(cleanName("a1")).toBe("a1");
    // NFC: "e" + dấu sắc rời (U+0301) -> "é" là MỘT ký tự (dưới 2); ghép hai lần ra "éé" (chuẩn hoá NFC)
    const eAcute = "e" + String.fromCharCode(0x301);
    expect(cleanName(eAcute)).toBeNull();
    expect(cleanName(eAcute + eAcute)).toBe("éé");
    expect(cleanName("a\nb")).toBe("a b"); // mọi khoảng trắng (xuống dòng, tab, NBSP) gộp thành một dấu cách
    expect(cleanName("a".repeat(DAO_HIEU_MAX))).toBe("a".repeat(DAO_HIEU_MAX));
  });
  it("từ chối: ngắn, dài, ký tự lạ, kiểu sai", () => {
    for (const bad of [
      "a",
      "",
      "   ",
      "a".repeat(DAO_HIEU_MAX + 1),
      "a_b",
      "a<b>",
      "a" + String.fromCharCode(0x200b) + "b",
      "x😀y",
    ])
      expect(cleanName(bad), JSON.stringify(bad)).toBeNull();
    for (const bad of [null, undefined, 5, {}, [], ["ab"], true])
      expect(cleanName(bad as unknown)).toBeNull();
  });
});

describe("validateUsername", () => {
  it("chuẩn hoá chữ thường, cắt khoảng trắng đầu / cuối; nhận a-z 0-9 _ dài 3-20", () => {
    expect(validateUsername("  Tien_Gioi01 ")).toEqual({ ok: true, value: "tien_gioi01" });
    expect(validateUsername("abc")).toEqual({ ok: true, value: "abc" });
    const max = "a".repeat(USERNAME_MAX);
    expect(validateUsername(max)).toEqual({ ok: true, value: max });
  });
  it("từ chối đúng lý do", () => {
    expect(validateUsername("ab")).toEqual({ ok: false, reason: "length" });
    expect(validateUsername("a".repeat(USERNAME_MAX + 1))).toEqual({ ok: false, reason: "length" });
    expect(validateUsername("")).toEqual({ ok: false, reason: "length" });
    for (const bad of ["tên có dấu", "a b c", "a-b-c", "a.b.c", "../etc", "ab\u0000c", "ÀBC"])
      expect(validateUsername(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    for (const bad of [null, undefined, 5, {}, []])
      expect(validateUsername(bad as unknown)).toEqual({ ok: false, reason: "type" });
    expect(USERNAME_MIN).toBe(3);
  });
});

describe("validatePassword", () => {
  it("nhận 8-128 ký tự Unicode, không áp luật ký tự, không cắt khoảng trắng", () => {
    expect(validatePassword("kh0ng-phai-pho-bien")).toEqual({ ok: true });
    expect(validatePassword("a".repeat(PASSWORD_MIN))).toEqual({ ok: true });
    expect(validatePassword("a".repeat(PASSWORD_MAX))).toEqual({ ok: true });
    expect(validatePassword("mật khẩu dài có dấu")).toEqual({ ok: true });
    expect(validatePassword("   tám khoảng   ")).toEqual({ ok: true });
    // đếm theo ký tự Unicode (mỗi emoji là một), không theo đơn vị UTF-16
    expect(validatePassword("😀".repeat(PASSWORD_MIN))).toEqual({ ok: true });
    expect(validatePassword("😀".repeat(PASSWORD_MIN - 1))).toEqual({ ok: false, reason: "short" });
  });
  it("từ chối đúng lý do", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN - 1))).toEqual({ ok: false, reason: "short" });
    expect(validatePassword("a".repeat(PASSWORD_MAX + 1))).toEqual({ ok: false, reason: "long" });
    expect(validatePassword("tien_gioi01", "Tien_Gioi01")).toEqual({
      ok: false,
      reason: "same_as_username",
    });
    expect(validatePassword("PASSWORD")).toEqual({ ok: false, reason: "common" });
    for (const common of COMMON_PASSWORDS) {
      expect(common.length, common).toBeGreaterThanOrEqual(PASSWORD_MIN); // danh sách chỉ chứa mật khẩu qua được độ dài
      expect(validatePassword(common)).toEqual({ ok: false, reason: "common" });
    }
    for (const bad of [null, undefined, 12345678, {}, ["abcdefgh"]])
      expect(validatePassword(bad as unknown)).toEqual({ ok: false, reason: "type" });
  });
});

describe("API và lỗi", () => {
  it("đường dẫn API duy nhất, bắt đầu bằng /api/", () => {
    const paths = Object.values(AUTH_API);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p.startsWith("/api/")).toBe(true);
  });
  it("mã lỗi duy nhất; mã join không đụng mã cũ (400, 403, 409, 421)", () => {
    expect(new Set(AUTH_ERRORS).size).toBe(AUTH_ERRORS.length);
    const joinCodes = [JOIN_BAD_TOKEN, JOIN_NEED_CHARACTER, JOIN_WRONG_MAP, 400, 403, 409];
    expect(new Set(joinCodes).size).toBe(joinCodes.length);
  });
  it("parseAuthError: nhận mã có thật, bỏ mã lạ và kiểu sai (kể cả tên thuộc tính của object)", () => {
    for (const code of AUTH_ERRORS)
      expect(parseAuthError({ error: code })).toEqual({ error: code });
    expect(parseAuthError({ error: "rate_limited", retryAfterS: 12.2 })).toEqual({
      error: "rate_limited",
      retryAfterS: 13,
    });
    // retryAfterS rác bị bỏ, quá lớn bị cắt
    expect(parseAuthError({ error: "rate_limited", retryAfterS: -1 })).toEqual({
      error: "rate_limited",
    });
    expect(parseAuthError({ error: "rate_limited", retryAfterS: Infinity })).toEqual({
      error: "rate_limited",
    });
    expect(parseAuthError({ error: "rate_limited", retryAfterS: 1e9 })).toEqual({
      error: "rate_limited",
      retryAfterS: 86_400,
    });
    for (const bad of [
      null,
      undefined,
      "bad_credentials",
      5,
      [],
      [{ error: "invalid" }],
      {},
      { error: "constructor" },
      { error: "__proto__" },
      { error: "toString" },
      { error: 5 },
      { error: "khong_co" },
    ])
      expect(parseAuthError(bad as unknown), JSON.stringify(bad)).toBeNull();
  });
});
