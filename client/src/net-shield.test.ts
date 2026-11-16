import { describe, expect, it } from "vitest";
import { NET_SHIELD_MS } from "@tien-gioi/shared";
import {
  DEFAULT_SHIELD_MS,
  SHIELD_MAX_MS,
  ShieldTimer,
  parseNetShield,
  shieldLabel,
} from "./net-shield";

describe("parseNetShield: client không tin tin nhắn", () => {
  it("tin hợp lệ: giữ ms (làm tròn xuống) và lý do", () => {
    expect(parseNetShield({ ms: 3000, reason: "resume" })).toEqual({ ms: 3000, reason: "resume" });
    expect(parseNetShield({ ms: 2999.9, reason: "spared" })).toEqual({
      ms: 2999,
      reason: "spared",
    });
    expect(DEFAULT_SHIELD_MS).toBe(NET_SHIELD_MS);
  });

  it("ms hỏng (không phải số, NaN, vô cực, <= 0): null, không bật vầng sáng", () => {
    for (const ms of ["3000", null, undefined, Number.NaN, Infinity, -Infinity, 0, -5, {}, []])
      expect(parseNetShield({ ms, reason: "resume" }), String(ms)).toBeNull();
  });

  it("không phải đối tượng: null", () => {
    for (const raw of [null, undefined, 3000, "x", true, []])
      expect(parseNetShield(raw)).toBeNull();
  });

  it("ms quá lớn bị kẹp SHIELD_MAX_MS; lý do lạ / thiếu coi là resume", () => {
    expect(parseNetShield({ ms: 10 ** 9, reason: "resume" })!.ms).toBe(SHIELD_MAX_MS);
    expect(parseNetShield({ ms: 1000, reason: "abc" })!.reason).toBe("resume");
    expect(parseNetShield({ ms: 1000 })!.reason).toBe("resume");
    expect(parseNetShield({ ms: 1000, reason: "constructor" })!.reason).toBe("resume");
  });
});

describe("shieldLabel: chữ đếm ngược", () => {
  it("làm tròn LÊN tới 0,1 giây, dấu phẩy thập phân; còn hộ thể thì không bao giờ hiện 0,0", () => {
    expect(shieldLabel(3000)).toBe("Hộ thể 3,0s");
    expect(shieldLabel(2401)).toBe("Hộ thể 2,5s");
    expect(shieldLabel(2400)).toBe("Hộ thể 2,4s");
    expect(shieldLabel(1)).toBe("Hộ thể 0,1s");
  });

  it("hết hạn / số hỏng: null", () => {
    for (const ms of [0, -1, Number.NaN, Infinity, -Infinity])
      expect(shieldLabel(ms), String(ms)).toBeNull();
  });
});

describe("ShieldTimer: đếm ngược theo đồng hồ client", () => {
  it("chưa bắt đầu: không hoạt động; bắt đầu 3 giây: còn đúng, hết thì tắt", () => {
    const t = new ShieldTimer();
    expect(t.active(1000)).toBe(false);
    t.start({ ms: 3000, reason: "resume" }, 1000);
    expect(t.active(1000)).toBe(true);
    expect(t.remaining(2500)).toBe(1500);
    expect(t.active(3999)).toBe(true);
    expect(t.active(4000)).toBe(false);
    expect(t.remaining(9999)).toBe(0);
    expect(t.reason).toBe("resume");
  });

  it("tin mới KHÔNG rút ngắn hộ thể đang chạy; tin kéo dài hơn thì nối dài; sau khi hết thì tin mới bắt đầu lại", () => {
    const t = new ShieldTimer();
    t.start({ ms: 3000, reason: "resume" }, 0);
    t.start({ ms: 500, reason: "spared" }, 100); // hết lúc 600 < 3000: bỏ qua
    expect(t.remaining(100)).toBe(2900);
    expect(t.reason).toBe("resume");
    t.start({ ms: 3000, reason: "spared" }, 2000); // hết lúc 5000 > 3000: nối dài
    expect(t.remaining(2000)).toBe(3000);
    expect(t.reason).toBe("spared");
    t.start({ ms: 1000, reason: "resume" }, 6000); // đã hết: bắt đầu lại
    expect(t.remaining(6000)).toBe(1000);
  });

  it("clear() và đồng hồ hỏng", () => {
    const t = new ShieldTimer();
    t.start({ ms: 3000, reason: "resume" }, 0);
    t.clear();
    expect(t.active(1)).toBe(false);
    expect(t.reason).toBeNull();
    t.start({ ms: 3000, reason: "resume" }, Number.NaN);
    expect(t.active(1)).toBe(false);
    expect(t.remaining(Number.NaN)).toBe(0);
  });
});
