// Hợp đồng bảo vệ tính mạng khi mất kết nối (mục 33): hằng số nhất quán, bộ đọc nhịp client khai.
import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_TIMEOUT_MS,
  NET_BEAT_MAX_MS,
  NET_BEAT_MIN_MS,
  NET_BEAT_MS,
  NET_MSG,
  NET_RECONNECT_GRACE_S,
  NET_SHIELD_MS,
  NET_SILENCE_GHOST_MS,
  NET_SPARE_HP_PCT,
  NET_SPARE_SILENCE_MS,
  parseBeatMs,
  type JoinOptions,
} from "./index";

describe("hằng số bảo vệ khi mất kết nối", () => {
  it("quan hệ hợp lý: tha chết sớm hơn ghost; ghost chứa được vài nhịp; giữ chỗ dài hơn rớt mạng thực tế (25 giây) + nối lại", () => {
    expect(NET_BEAT_MS).toBeGreaterThanOrEqual(NET_BEAT_MIN_MS);
    expect(NET_BEAT_MS).toBeLessThanOrEqual(NET_BEAT_MAX_MS);
    expect(NET_SPARE_SILENCE_MS).toBeLessThan(NET_SILENCE_GHOST_MS);
    expect(NET_SILENCE_GHOST_MS).toBeGreaterThanOrEqual(2 * NET_BEAT_MS); // chịu được một nhịp lỡ mà không báo nhầm
    expect(NET_SPARE_SILENCE_MS).toBeGreaterThan(NET_BEAT_MS);
    expect(NET_RECONNECT_GRACE_S).toBeGreaterThanOrEqual(60); // rớt tới 25 giây + nối lại, dư rất rộng
    expect(NET_SHIELD_MS).toBeGreaterThan(0);
    expect(NET_SPARE_HP_PCT).toBeGreaterThan(0);
    expect(NET_SPARE_HP_PCT).toBeLessThan(1);
    // máy chủ coi im lặng sớm hơn client coi kết nối chết (nhịp tim 8 giây): nhân vật được bảo vệ TRƯỚC khi banner nối lại hiện
    expect(NET_SILENCE_GHOST_MS).toBeLessThan(HEARTBEAT_TIMEOUT_MS);
  });

  it("tên tin không trùng tin có sẵn", () => {
    expect(NET_MSG.shield).toBe("netShield");
  });
});

describe("parseBeatMs (nhịp client khai)", () => {
  it("nhận số hữu hạn trong [NET_BEAT_MIN_MS, NET_BEAT_MAX_MS], làm tròn xuống", () => {
    expect(parseBeatMs(NET_BEAT_MS)).toBe(NET_BEAT_MS);
    expect(parseBeatMs(NET_BEAT_MIN_MS)).toBe(NET_BEAT_MIN_MS);
    expect(parseBeatMs(NET_BEAT_MAX_MS)).toBe(NET_BEAT_MAX_MS);
    expect(parseBeatMs(1000.9)).toBe(1000);
  });

  it("ngoài khoảng, không phải số, NaN / vô cực: null (không áp luật im lặng)", () => {
    for (const bad of [
      0,
      -1,
      NET_BEAT_MIN_MS - 1,
      NET_BEAT_MAX_MS + 1,
      5000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "1000",
      null,
      undefined,
      {},
      [],
      true,
    ])
      expect(parseBeatMs(bad)).toBeNull();
  });

  it("JoinOptions có trường beatMs tuỳ chọn", () => {
    const o: JoinOptions = { name: "a", beatMs: NET_BEAT_MS };
    expect(o.beatMs).toBe(1000);
  });
});
