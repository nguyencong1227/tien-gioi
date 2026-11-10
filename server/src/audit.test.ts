import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIT_COIN,
  audit,
  auditCoinThreshold,
  auditEnabled,
  cleanAuditFields,
  cleanAuditString,
  setAuditSink,
  startAudit,
} from "./audit";

afterEach(() => setAuditSink(null));

describe("làm sạch trường audit", () => {
  it("bỏ khoá giống mật khẩu / bí mật / token / băm / mã khôi phục / phiên, dù viết hoa thường thế nào", () => {
    const out = cleanAuditFields({
      user: "lam_thanh",
      password: "mat-khau-that",
      newPassword: "x",
      secret: "s",
      secretHash: "h",
      token: "t",
      sessionToken: "t2",
      Authorization: "Bearer abc",
      recoveryCode: "r",
      passHash: "p",
      cookie: "c",
      keep: 1,
    });
    expect(out).toEqual({ user: "lam_thanh", keep: 1 });
  });

  it("không cho ghi đè trường do audit đặt (t, audit, ev); khoá sai dạng bị bỏ", () => {
    expect(cleanAuditFields({ t: "x", audit: 0, ev: "y", ok: true })).toEqual({ ok: true });
    for (const k of ["", "1abc", "a-b", "a b", "a.b", "x".repeat(33), "__proto__", "ghi chú"])
      expect(cleanAuditFields({ [k]: 1 }), JSON.stringify(k)).toEqual({});
  });

  it("chỉ nhận giá trị phẳng: số hữu hạn, chuỗi, boolean, null; bỏ NaN / vô hạn / object / mảng / hàm / undefined", () => {
    expect(
      cleanAuditFields({
        a: 1,
        b: -2.5,
        c: "x",
        d: true,
        e: null,
        f: NaN,
        g: Infinity,
        h: { x: 1 },
        i: [1],
        j: () => 1,
        k: undefined,
        l: 10n,
        m: Symbol("s"),
      }),
    ).toEqual({ a: 1, b: -2.5, c: "x", d: true, e: null });
  });

  it("chuỗi: bỏ ký tự điều khiển / xuống dòng / U+2028 U+2029 (không chèn được dòng log giả), cắt còn 200 ký tự", () => {
    const bad = [0x0a, 0x0d, 0x2028, 0x2029, 0x00, 0x7f, 0x09].map((c) => String.fromCharCode(c));
    const evil = `ten${bad[0]}GIA {"audit":1,"ev":"x"}${bad.join("")}`;
    const s = cleanAuditString(evil);
    for (const ch of bad) expect(s.includes(ch), `còn ký tự ${ch.charCodeAt(0)}`).toBe(false);
    expect(cleanAuditString("a".repeat(500))).toHaveLength(201);
    expect(cleanAuditString("a".repeat(500)).endsWith("…")).toBe(true);
    expect(cleanAuditString("Đạo hữu Lâm 😀")).toBe("Đạo hữu Lâm 😀");
  });

  it("tối đa 16 trường", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 40; i++) many[`k${i}`] = i;
    expect(Object.keys(cleanAuditFields(many))).toHaveLength(16);
  });
});

describe("ghi nhật ký", () => {
  it("chưa bật (mặc định): không ghi gì và không ném lỗi", () => {
    expect(auditEnabled()).toBe(false);
    expect(() => audit("sect.create", { name: "A" })).not.toThrow();
  });

  it("bật: đúng MỘT dòng JSON (có t, audit: 1, ev và các trường đã làm sạch); thời gian lấy từ đồng hồ truyền vào", () => {
    const lines: string[] = [];
    setAuditSink(
      (l) => lines.push(l),
      () => Date.parse("2026-11-11T05:00:00Z"),
    );
    expect(auditEnabled()).toBe(true);
    audit("auth.login_failed", { ip: "1.2.3.4", user: "lam_thanh", password: "KHONG-BAO-GIO-GHI" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(lines[0]).not.toContain("KHONG-BAO-GIO-GHI");
    expect(JSON.parse(lines[0]!)).toEqual({
      t: "2026-11-11T05:00:00.000Z",
      audit: 1,
      ev: "auth.login_failed",
      ip: "1.2.3.4",
      user: "lam_thanh",
    });
  });

  it("tên sự kiện cũng bị làm sạch; nơi ghi ném lỗi thì audit nuốt (không làm hỏng game)", () => {
    const lines: string[] = [];
    setAuditSink((l) => lines.push(l));
    audit("a\nb");
    expect(JSON.parse(lines[0]!).ev).toBe("a b");
    setAuditSink(() => {
      throw new Error("đĩa đầy");
    });
    expect(() => audit("x")).not.toThrow();
  });
});

describe("cấu hình môi trường", () => {
  it("startAudit: mặc định bật, chỉ 'off' (không phân biệt hoa thường) mới tắt", () => {
    for (const v of [undefined, "", "on", "1", "true", "yes"]) {
      expect(startAudit({ AUDIT_LOG: v }), String(v)).toBe(true);
      expect(auditEnabled()).toBe(true);
    }
    for (const v of ["off", "OFF", " Off "]) {
      expect(startAudit({ AUDIT_LOG: v }), v).toBe(false);
      expect(auditEnabled()).toBe(false);
    }
  });

  it("auditCoinThreshold: số nguyên dương hợp lệ, còn lại về mặc định", () => {
    expect(auditCoinThreshold({})).toBe(DEFAULT_AUDIT_COIN);
    expect(auditCoinThreshold({ AUDIT_COIN_THRESHOLD: "100" })).toBe(100);
    expect(auditCoinThreshold({ AUDIT_COIN_THRESHOLD: " 250 " })).toBe(250);
    for (const v of ["", "0", "-5", "1.5", "abc", "1e3", "9999999999"])
      expect(auditCoinThreshold({ AUDIT_COIN_THRESHOLD: v }), v).toBe(DEFAULT_AUDIT_COIN);
  });
});
