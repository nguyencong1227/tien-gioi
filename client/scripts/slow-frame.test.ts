import { describe, expect, it } from "vitest";
import { slowFrameMs, slowFrameSource } from "./slow-frame.mjs";

describe("slow-frame (giả lập khung chậm cho script Chrome thật, #1389)", () => {
  it("không có cờ / biến môi trường thì tắt", () => {
    expect(slowFrameMs(["node", "x.mjs"], {})).toBe(0);
    expect(slowFrameSource(0)).toBe("");
  });

  it("đọc --slow-frame <ms> và TG_SLOW_FRAME_MS (cờ thắng biến môi trường)", () => {
    expect(slowFrameMs(["node", "x.mjs", "--slow-frame", "250"], {})).toBe(250);
    expect(slowFrameMs(["node", "x.mjs"], { TG_SLOW_FRAME_MS: "180" })).toBe(180);
    expect(slowFrameMs(["node", "x.mjs", "--slow-frame", "100"], { TG_SLOW_FRAME_MS: "180" })).toBe(
      100,
    );
  });

  it("giá trị sai, không hữu hạn, âm hoặc quá lớn coi là tắt (không treo trang)", () => {
    for (const bad of ["abc", "-5", "0", "Infinity", "NaN", "2001", ""]) {
      expect(slowFrameMs(["node", "x.mjs", "--slow-frame", bad], {})).toBe(0);
    }
    expect(slowFrameMs(["node", "x.mjs", "--slow-frame"], {})).toBe(0);
  });

  it("mã nạp là cú pháp JS hợp lệ, dùng performance.now GỐC và chứa đúng số ms", () => {
    const src = slowFrameSource(250);
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain("250");
    // vòng bận KHÔNG đọc `performance.now` đã bị script kiểm thay (đồng hồ dừng sẽ làm vòng bận treo mãi)
    expect(src).toContain("performance.now.bind(performance)");
    expect(src.replace("performance.now.bind(performance)", "")).not.toMatch(/performance\.now/);
  });
});
