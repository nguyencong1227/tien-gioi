import { afterEach, describe, expect, it } from "vitest";
import {
  ALERT_RULES,
  DEFAULT_AUDIT_COIN,
  auditAlertKeyCount,
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

describe("cảnh báo lặp lại (người dùng chốt: chỉ ghi nhận + cảnh báo, không tự khoá)", () => {
  /** Bật audit với đồng hồ giả; trả các dòng đã ghi (đã parse), các dòng cảnh báo, và hàm tua đồng hồ. */
  function run() {
    let now = Date.parse("2026-11-11T10:00:00.000Z");
    const lines: Record<string, unknown>[] = [];
    const warns: string[] = [];
    setAuditSink(
      (l) => lines.push(JSON.parse(l)),
      () => now,
      (w) => warns.push(w),
    );
    return { lines, warns, tick: (ms: number) => (now += ms) };
  }
  const evs = (r: ReturnType<typeof run>) => r.lines.map((l) => l.ev);

  it("bảng luật: đúng 3 luật, khoá hợp lệ, ngưỡng >= 2, tên cảnh báo bắt đầu bằng alert.", () => {
    expect(ALERT_RULES.map((r) => r.ev)).toEqual([
      "room.spam_kick",
      "auth.rate_limited",
      "join.denied",
    ]);
    for (const r of ALERT_RULES) {
      expect(r.count).toBeGreaterThanOrEqual(2);
      expect(r.windowMs).toBeGreaterThan(0);
      expect(r.alert.startsWith("alert.")).toBe(true);
      expect(ALERT_RULES.some((x) => x.ev === r.alert)).toBe(false); // cảnh báo không tự kích hoạt luật khác
    }
  });

  it("đủ số lần trong cửa sổ thì ghi MỘT sự kiện alert kèm khoá / số lần và in [CẢNH BÁO]; chưa đủ thì im", () => {
    const r = run();
    audit("room.spam_kick", { name: "Ke Spam" });
    audit("room.spam_kick", { name: "Ke Spam" });
    expect(evs(r)).toEqual(["room.spam_kick", "room.spam_kick"]);
    expect(r.warns).toEqual([]);
    audit("room.spam_kick", { name: "Ke Spam" });
    expect(evs(r)).toEqual([
      "room.spam_kick",
      "room.spam_kick",
      "room.spam_kick",
      "alert.spam_kicks",
    ]);
    const alert = r.lines.at(-1)!;
    expect(alert).toMatchObject({
      audit: 1,
      of: "room.spam_kick",
      key: "Ke Spam",
      count: 3,
      windowS: 600,
    });
    expect(r.warns).toHaveLength(1);
    expect(r.warns[0]).toContain("[CẢNH BÁO]");
    expect(r.warns[0]).toContain("Ke Spam");
    expect(r.warns[0]).toContain("không tự khoá");
  });

  it("mỗi (luật, khoá) chỉ báo một lần mỗi cửa sổ; hết cửa sổ mà còn tái phạm thì báo lại", () => {
    const r = run();
    for (let i = 0; i < 10; i++) audit("room.spam_kick", { name: "A" });
    expect(evs(r).filter((e) => e === "alert.spam_kicks")).toHaveLength(1);
    r.tick(600_001);
    for (let i = 0; i < 3; i++) audit("room.spam_kick", { name: "A" });
    expect(evs(r).filter((e) => e === "alert.spam_kicks")).toHaveLength(2);
    expect(r.warns).toHaveLength(2);
  });

  it("ngoài cửa sổ không cộng dồn; khoá khác nhau độc lập; thiếu khoá / sai kiểu khoá thì bỏ qua", () => {
    const r = run();
    audit("room.spam_kick", { name: "A" });
    r.tick(400_000);
    audit("room.spam_kick", { name: "A" });
    r.tick(400_000); // lần đầu đã trôi ra khỏi cửa sổ 10 phút
    audit("room.spam_kick", { name: "A" });
    expect(r.warns).toEqual([]);
    for (const k of ["B", "C", "D"]) audit("room.spam_kick", { name: k }); // mỗi người một lần
    expect(r.warns).toEqual([]);
    for (let i = 0; i < 5; i++) {
      audit("room.spam_kick", {});
      audit("room.spam_kick", { name: { x: 1 } });
      audit("room.spam_kick", { name: null });
    }
    expect(r.warns).toEqual([]);
  });

  it("hai luật còn lại: IP bị giới hạn tần suất 5 lần; cùng đạo hiệu bị từ chối vào 5 lần (join.denied không có tên thì bỏ qua)", () => {
    const r = run();
    for (let i = 0; i < 5; i++) audit("auth.rate_limited", { ip: "1.2.3.4", kind: "login" });
    for (let i = 0; i < 5; i++) audit("join.denied", { reason: "bad_secret", name: "Nan Nhan" });
    for (let i = 0; i < 9; i++) audit("join.denied", { reason: "bad_token" });
    expect(evs(r).filter((e) => String(e).startsWith("alert."))).toEqual([
      "alert.auth_flood",
      "alert.join_guess",
    ]);
    expect(r.lines.find((l) => l.ev === "alert.auth_flood")).toMatchObject({
      key: "1.2.3.4",
      count: 5,
    });
    expect(r.lines.find((l) => l.ev === "alert.join_guess")).toMatchObject({
      key: "Nan Nhan",
      count: 5,
    });
  });

  it("đồng hồ / nơi cảnh báo ném lỗi không làm hỏng audit; tắt audit (sink null) thì không cảnh báo", () => {
    const lines: string[] = [];
    setAuditSink(
      (l) => lines.push(l),
      Date.now,
      () => {
        throw new Error("warn hỏng");
      },
    );
    expect(() => {
      for (let i = 0; i < 4; i++) audit("room.spam_kick", { name: "Z" });
    }).not.toThrow();
    expect(lines.some((l) => l.includes("alert.spam_kicks"))).toBe(true); // sự kiện vẫn ghi dù in cảnh báo lỗi
    setAuditSink(null);
    const r = run();
    setAuditSink(null);
    for (let i = 0; i < 5; i++) audit("room.spam_kick", { name: "Z" });
    expect(r.lines).toEqual([]);
    expect(r.warns).toEqual([]);
  });

  it("đặt lại sink xoá bộ nhớ: không cộng dồn qua các lần bật", () => {
    const a = run();
    audit("room.spam_kick", { name: "Q" });
    audit("room.spam_kick", { name: "Q" });
    const b = run(); // bật lại
    audit("room.spam_kick", { name: "Q" });
    expect(b.warns).toEqual([]);
    expect(a.warns).toEqual([]);
  });

  it("bộ nhớ có trần: đổi khoá liên tục không làm phình bản đồ theo dõi (<= 2000), khoá mới vẫn được theo dõi", () => {
    const r = run();
    for (let i = 0; i < 6000; i++) audit("room.spam_kick", { name: `ten-${i}` });
    expect(auditAlertKeyCount()).toBeLessThanOrEqual(2000);
    for (let i = 0; i < 3; i++) audit("room.spam_kick", { name: "khoa-moi" });
    expect(r.lines.some((l) => l.ev === "alert.spam_kicks" && l.key === "khoa-moi")).toBe(true);
  });
});
