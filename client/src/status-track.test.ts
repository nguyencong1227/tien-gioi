import { describe, expect, it } from "vitest";
import {
  MOVE_SPEED_MUL_MAX,
  MOVE_SPEED_MUL_MIN,
  STATUS_BY_ID,
  moveSpeedMul,
} from "@tien-gioi/shared";
import { StatusTracker } from "./status-track";

describe("StatusTracker (trạng thái của chính mình ở client, M7.2b)", () => {
  it("không có gì: hệ số 1, không choáng, danh sách rỗng", () => {
    const t = new StatusTracker();
    expect(t.empty).toBe(true);
    expect(t.speedMul(0)).toBe(1);
    expect(t.stunned(0)).toBe(false);
    expect(t.active(0)).toEqual([]);
  });

  it("tăng tốc / tê cóng nhân đúng như moveSpeedMul của shared, rồi tự hết hạn theo đồng hồ client", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["haste", 3000, 0.35],
        ["chill", 2000, 0.3],
      ],
      1000,
    );
    // ngay lúc nhận
    expect(t.speedMul(1000)).toBeCloseTo((1 + 0.35) * (1 - 0.3), 12);
    expect(t.speedMul(1000)).toBe(
      moveSpeedMul([
        ["haste", 3000, 0.35],
        ["chill", 2000, 0.3],
      ]),
    );
    // sau 1,5 s: cả hai còn
    expect(t.speedMul(2500)).toBeCloseTo((1 + 0.35) * (1 - 0.3), 12);
    // sau 2,5 s: tê cóng hết, tăng tốc còn
    expect(t.speedMul(3500)).toBeCloseTo(1.35, 12);
    // đúng mốc hết hạn thì thôi (msLeft = 0)
    expect(t.speedMul(4000)).toBe(1);
    expect(t.active(4000)).toEqual([]);
  });

  it("msLeft của mục còn hiệu lực đã trừ thời gian trôi; mục không mang cường độ chỉ có hai phần tử", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["haste", 3000, 0.2],
        ["poison", 2500],
      ],
      500,
    );
    expect(t.active(1500)).toEqual([
      ["haste", 2000, 0.2],
      ["poison", 1500],
    ]);
  });

  it("choáng: bị choáng tới hết msLeft rồi thôi; không ảnh hưởng hệ số tốc độ", () => {
    const t = new StatusTracker();
    t.set([["stun", 1050]], 0);
    expect(t.stunned(0)).toBe(true);
    expect(t.stunned(1049)).toBe(true);
    expect(t.stunned(1050)).toBe(false);
    expect(t.speedMul(0)).toBe(1);
  });

  it("danh sách mới THAY hẳn danh sách cũ (kể cả rỗng), và mốc đếm lùi đặt lại", () => {
    const t = new StatusTracker();
    t.set([["haste", 3000, 0.4]], 0);
    t.set([["haste", 3000, 0.1]], 2000); // chiêu khác ghi đè, mốc mới
    expect(t.speedMul(2000)).toBeCloseTo(1.1, 12);
    expect(t.speedMul(4500)).toBeCloseTo(1.1, 12); // còn 500 ms tính từ mốc 2000
    t.set([], 4500);
    expect(t.empty).toBe(true);
    expect(t.speedMul(4500)).toBe(1);
  });

  it("clear() xoá hết ngay (đổi bản đồ / nối lại)", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["stun", 5000],
        ["haste", 5000, 0.5],
      ],
      0,
    );
    t.clear();
    expect(t.empty).toBe(true);
    expect(t.stunned(1)).toBe(false);
    expect(t.speedMul(1)).toBe(1);
  });

  it("không tin tin nhắn: id lạ / trùng / rác bị bỏ, cường độ và thời gian kẹp theo bảng, tối đa MAX_STATUSES", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["haste", 999999, 99], // kẹp theo maxMs / maxRatio
        ["haste", 1000, 0.01], // trùng id: bỏ
        ["khong_co", 1000, 0.5], // id lạ
        ["chill", Number.NaN, 0.3], // thời gian rác
        ["chill", -5, 0.3],
        "rac",
        null,
        ["constructor", 1000, 0.5],
      ],
      0,
    );
    const a = t.active(0);
    expect(a).toHaveLength(1);
    expect(a[0][0]).toBe("haste");
    expect(a[0][1]).toBe(STATUS_BY_ID.haste.maxMs);
    expect(a[0][2]).toBe(STATUS_BY_ID.haste.maxRatio);
    expect(t.speedMul(0)).toBeCloseTo(1 + STATUS_BY_ID.haste.maxRatio, 12);

    for (const bad of [undefined, null, 5, "x", {}, { list: [] }]) {
      t.set(bad, 0);
      expect(t.empty).toBe(true);
    }
  });

  it("thiếu ratio của tăng tốc / tê cóng (tin hỏng) coi như 0: không tự bịa hệ số", () => {
    const t = new StatusTracker();
    t.set(
      [
        ["haste", 3000],
        ["chill", 3000],
      ],
      0,
    );
    expect(t.speedMul(0)).toBe(1);
  });

  it("đồng hồ lùi (now < mốc nhận) coi như chưa trôi: không kéo dài trạng thái", () => {
    const t = new StatusTracker();
    t.set([["haste", 1000, 0.5]], 5000);
    expect(t.active(4000)).toEqual([["haste", 1000, 0.5]]);
    expect(t.speedMul(4000)).toBeCloseTo(1.5, 12);
  });

  it("hệ số luôn nằm trong [MIN, MAX] của shared với mọi tổ hợp cường độ hợp lệ", () => {
    const t = new StatusTracker();
    for (const h of [0, 0.2, 0.6, 5]) {
      for (const c of [0, 0.3, 0.6, 5]) {
        t.set(
          [
            ["haste", 3000, h],
            ["chill", 3000, c],
          ],
          0,
        );
        const m = t.speedMul(0);
        expect(m).toBeGreaterThanOrEqual(MOVE_SPEED_MUL_MIN);
        expect(m).toBeLessThanOrEqual(MOVE_SPEED_MUL_MAX);
      }
    }
  });
});
