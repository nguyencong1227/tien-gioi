import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MSG,
  HEARTBEAT_TIMEOUT_MS,
  RESUME_CHECK_AFTER_MS,
  RESUME_TIMEOUT_MS,
  isConnectionDead,
  parsePing,
} from "./index";

describe("nhịp tim ứng dụng (M4.2b)", () => {
  it("hằng số hợp lý: ping đều đặn, hạn chờ lớn hơn nhịp, hạn lúc quay lại ngắn hơn hạn thường", () => {
    expect(HEARTBEAT_MSG).toEqual({ ping: "ping", pong: "pong" });
    expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
    expect(HEARTBEAT_TIMEOUT_MS).toBeGreaterThan(HEARTBEAT_INTERVAL_MS);
    expect(RESUME_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RESUME_TIMEOUT_MS).toBeLessThan(HEARTBEAT_TIMEOUT_MS);
    expect(RESUME_CHECK_AFTER_MS).toBeGreaterThan(0);
  });

  it("parsePing chỉ nhận object có t là số hữu hạn không âm", () => {
    expect(parsePing({ t: 0 })).toEqual({ t: 0 });
    expect(parsePing({ t: 1731000000000 })).toEqual({ t: 1731000000000 });
    expect(parsePing({ t: 12.5, thua: "bi-bo-qua" })).toEqual({ t: 12.5 }); // chỉ lặp lại t, bỏ phần thừa
    for (const bad of [
      undefined,
      null,
      0,
      "1",
      [],
      {},
      { t: "1" },
      { t: -1 },
      { t: NaN },
      { t: Infinity },
      { t: -Infinity },
      { t: Number.MAX_SAFE_INTEGER + 2 },
      { t: null },
      { t: {} },
      { t: [1] },
    ]) {
      expect(parsePing(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("isConnectionDead: chỉ chết khi server từng trả pong, đang có ping chờ, và chờ LỐ hạn", () => {
    const t0 = 1_000;
    const waiting = { supported: true, pendingSince: t0 };
    expect(isConnectionDead(waiting, t0 + HEARTBEAT_TIMEOUT_MS, HEARTBEAT_TIMEOUT_MS)).toBe(false); // đúng hạn: chưa
    expect(isConnectionDead(waiting, t0 + HEARTBEAT_TIMEOUT_MS + 1, HEARTBEAT_TIMEOUT_MS)).toBe(
      true,
    );
    expect(isConnectionDead(waiting, t0 + RESUME_TIMEOUT_MS + 1, RESUME_TIMEOUT_MS)).toBe(true); // hạn ngắn lúc quay lại
    expect(isConnectionDead(waiting, t0 + RESUME_TIMEOUT_MS + 1, HEARTBEAT_TIMEOUT_MS)).toBe(false);
  });

  it("isConnectionDead: server cũ (chưa từng pong) hoặc không có ping chờ: KHÔNG BAO GIỜ chết", () => {
    expect(
      isConnectionDead({ supported: false, pendingSince: 0 }, 10 ** 9, HEARTBEAT_TIMEOUT_MS),
    ).toBe(false);
    expect(
      isConnectionDead({ supported: true, pendingSince: null }, 10 ** 9, HEARTBEAT_TIMEOUT_MS),
    ).toBe(false);
    expect(
      isConnectionDead({ supported: false, pendingSince: null }, 10 ** 9, HEARTBEAT_TIMEOUT_MS),
    ).toBe(false);
  });
});
