import { describe, expect, it } from "vitest";
import { ABUSE, DEFAULT_LIMIT, MESSAGE_LIMITS, RateLimiter } from "./rate-limit";

describe("giới hạn tần suất tin nhắn", () => {
  it("cho gửi dồn tới burst, sau đó bỏ; hồi lại theo thời gian", () => {
    const lim = new RateLimiter(0);
    const { burst, perSec } = MESSAGE_LIMITS.attack;
    for (let i = 0; i < burst; i++) expect(lim.check("attack", 0)).toBe("ok");
    expect(lim.check("attack", 0)).toBe("drop");
    expect(lim.check("attack", 1000 / perSec)).toBe("ok"); // hồi đúng 1 lượt
    expect(lim.check("attack", 1000 / perSec)).toBe("drop");
  });

  it("client bình thường (input 20 lần/giây) không bao giờ bị bỏ", () => {
    const lim = new RateLimiter(0);
    for (let t = 0; t < 60_000; t += 50) expect(lim.check("input", t)).toBe("ok");
  });

  it("mỗi loại tin nhắn có quỹ riêng; loại không khai báo dùng DEFAULT_LIMIT", () => {
    const lim = new RateLimiter(0);
    for (let i = 0; i < DEFAULT_LIMIT.burst; i++) expect(lim.check("talk", 0)).toBe("ok");
    expect(lim.check("talk", 0)).toBe("drop");
    expect(lim.check("trade", 0)).toBe("ok");
    expect(lim.check("constructor", 0)).toBe("ok"); // không đọc nhầm Object.prototype
  });

  it("spam liên tục thì bị ngắt; bị bỏ lác đác thì không", () => {
    const lim = new RateLimiter(0);
    for (let i = 0; i < ABUSE.burst; i++) expect(lim.reject(0)).toBe("drop");
    expect(lim.reject(0)).toBe("kick");

    const calm = new RateLimiter(0);
    // Bỏ ít hơn tốc độ hồi: không bao giờ bị ngắt
    for (let t = 0; t < 60_000; t += 100) expect(calm.reject(t)).toBe("drop");
  });

  it("giữ một phím (tự lặp 30 lần/giây) suốt 5 phút không bị ngắt", () => {
    const lim = new RateLimiter(0);
    for (let t = 0; t < 300_000; t += 1000 / 30)
      expect(lim.check("breakthrough", t)).not.toBe("kick");
  });

  it("gửi rất nhiều loại tin nhắn khác nhau không làm phình bộ nhớ", () => {
    const lim = new RateLimiter(0);
    let kicked = false;
    for (let i = 0; i < 10_000 && !kicked; i++) kicked = lim.check(`rac_${i}`, 0) === "kick";
    expect(kicked).toBe(true);
  });
});
