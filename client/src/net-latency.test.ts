import { describe, expect, it } from "vitest";
import { HEARTBEAT_TIMEOUT_MS } from "@tien-gioi/shared";
import {
  RTT_MAX_SAMPLE_MS,
  RTT_MIN_SAMPLES,
  RTT_SAMPLES,
  RttTracker,
  WARN_COMP_MAX_FRAC,
  WARN_COMP_MAX_MS,
  WARN_COMP_PAD_MS,
  perfRttText,
  warnCompMs,
  warnShownMs,
} from "./net-latency";

describe("RttTracker (trung vị RTT, #873)", () => {
  it("hằng số khớp quyết định của A: trung vị 5 pong, cần ít nhất 2 mẫu", () => {
    expect(RTT_SAMPLES).toBe(5);
    expect(RTT_MIN_SAMPLES).toBe(2);
    expect(RTT_MAX_SAMPLE_MS).toBe(HEARTBEAT_TIMEOUT_MS);
  });

  it("chưa đủ 2 mẫu thì null (không bù); đủ rồi thì có số", () => {
    const t = new RttTracker();
    expect(t.median()).toBeNull();
    t.add(100);
    expect(t.count).toBe(1);
    expect(t.median()).toBeNull();
    t.add(140);
    expect(t.median()).toBe(120); // số mẫu chẵn: trung bình hai giá trị giữa
  });

  it("trung vị chống mẫu lẻ loi: một pong chậm không làm số nhảy", () => {
    const t = new RttTracker();
    for (const v of [60, 62, 58, 61]) t.add(v);
    const before = t.median()!;
    expect(before).toBeCloseTo(60.5, 6);
    t.add(2500); // một pong chậm (mạng ngắt quãng)
    expect(t.count).toBe(5);
    expect(t.median()).toBe(61); // trung vị của 58, 60, 61, 62, 2500
    expect(t.median()! - before).toBeLessThan(1);
  });

  it("chỉ giữ 5 mẫu gần nhất: mẫu cũ trôi đi, RTT đổi thật thì số theo sau", () => {
    const t = new RttTracker();
    for (let i = 0; i < 5; i++) t.add(50);
    expect(t.median()).toBe(50);
    t.add(200);
    t.add(200);
    expect(t.count).toBe(5);
    expect(t.median()).toBe(50); // 50, 50, 50, 200, 200
    t.add(200);
    expect(t.median()).toBe(200); // 50, 50, 200, 200, 200: mạng đổi thật thì số đổi theo
  });

  it("bỏ mẫu hỏng: không hữu hạn, âm (đồng hồ nhảy lùi), quá RTT_MAX_SAMPLE_MS (pong của ping cũ), sai kiểu", () => {
    const t = new RttTracker();
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, RTT_MAX_SAMPLE_MS + 1, 1e9]) {
      expect(t.add(bad)).toBe(false);
    }
    expect(t.add("50" as unknown as number)).toBe(false);
    expect(t.add(undefined as unknown as number)).toBe(false);
    expect(t.count).toBe(0);
    expect(t.add(0)).toBe(true); // 0 hợp lệ (máy chủ cùng máy)
    expect(t.add(RTT_MAX_SAMPLE_MS)).toBe(true); // đúng ngưỡng vẫn nhận
    expect(t.count).toBe(2);
  });

  it("clear() xoá sạch (phòng mới bắt đầu lại từ chưa biết)", () => {
    const t = new RttTracker();
    t.add(80);
    t.add(90);
    t.clear();
    expect(t.count).toBe(0);
    expect(t.median()).toBeNull();
  });
});

describe("warnCompMs / warnShownMs (độ bù = clamp(RTT + 10, 0, min(250, 0,3 x ms)))", () => {
  it("hằng số khớp quyết định của A", () => {
    expect(WARN_COMP_PAD_MS).toBe(10);
    expect(WARN_COMP_MAX_MS).toBe(250);
    expect(WARN_COMP_MAX_FRAC).toBe(0.3);
  });

  it("RTT 0 / 60 / 160: bù RTT + 10 khi chưa chạm trần (ms 1000)", () => {
    expect(warnCompMs(0, 1000)).toBe(10);
    expect(warnCompMs(60, 1000)).toBe(70);
    expect(warnCompMs(160, 1000)).toBe(170);
    expect(warnShownMs(1000, 160)).toBe(830);
  });

  it("RTT 1000 (hỏng / mạng chết): kẹp 250 ms nếu báo trước dài, kẹp 30 % nếu báo trước ngắn", () => {
    expect(warnCompMs(1000, 1500)).toBe(250); // 0,3 x 1500 = 450 > 250
    expect(warnCompMs(1000, 800)).toBe(240); // 0,3 x 800 = 240 < 250
    expect(warnCompMs(1000, 400)).toBeCloseTo(120, 9);
    expect(warnShownMs(800, 1000)).toBe(560); // không bao giờ co quá 30 %
  });

  it("ranh giới của trần: RTT + 10 đúng bằng trần thì không đổi, vượt một chút thì bị kẹp", () => {
    expect(warnCompMs(240, 2000)).toBe(250); // 240 + 10 = 250 đúng trần tuyệt đối
    expect(warnCompMs(241, 2000)).toBe(250);
    expect(warnCompMs(229, 800)).toBe(239); // 0,3 x 800 = 240: chưa tới
    expect(warnCompMs(230, 800)).toBe(240);
    expect(warnCompMs(231, 800)).toBe(240);
  });

  it("chưa biết RTT (null / undefined) thì KHÔNG bù, kể cả RTT hỏng", () => {
    expect(warnCompMs(null, 1000)).toBe(0);
    expect(warnCompMs(undefined, 1000)).toBe(0);
    expect(warnCompMs(Number.NaN, 1000)).toBe(0);
    expect(warnCompMs(Infinity, 1000)).toBe(0);
    expect(warnShownMs(1000, null)).toBe(1000);
  });

  it("RTT âm không làm vùng báo DÀI ra (độ bù không âm)", () => {
    expect(warnCompMs(-500, 1000)).toBe(0);
    expect(warnCompMs(-5, 1000)).toBe(5);
    expect(warnShownMs(1000, -500)).toBe(1000);
  });

  it("ms hỏng (0, âm, NaN) thì độ bù 0", () => {
    expect(warnCompMs(100, 0)).toBe(0);
    expect(warnCompMs(100, -800)).toBe(0);
    expect(warnCompMs(100, Number.NaN)).toBe(0);
  });

  it("quét: vùng báo luôn trong [0,7 x ms, ms] và đơn điệu theo RTT", () => {
    for (const ms of [200, 400, 800, 1000, 1500, 3000]) {
      let prev = ms;
      for (let rtt = 0; rtt <= 2000; rtt += 7) {
        const shown = warnShownMs(ms, rtt);
        expect(shown).toBeLessThanOrEqual(ms);
        expect(shown).toBeGreaterThanOrEqual(ms * 0.7 - 1e-9);
        expect(shown).toBeLessThanOrEqual(prev + 1e-9);
        prev = shown;
      }
    }
  });
});

describe("perfRttText (bảng ?perf=1)", () => {
  it("số ms làm tròn; chưa biết / hỏng thì '--'", () => {
    expect(perfRttText(160.4)).toBe("160 ms");
    expect(perfRttText(0)).toBe("0 ms");
    expect(perfRttText(null)).toBe("--");
    expect(perfRttText(undefined)).toBe("--");
    expect(perfRttText(Number.NaN)).toBe("--");
    expect(perfRttText(-3)).toBe("--");
  });
});
