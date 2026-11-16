// Hợp đồng hệ số tu vi thử nghiệm (mục 34): tin `testExp`, bộ đọc kẹp giá trị, nhãn hiển thị.
import { describe, expect, it } from "vitest";
import {
  TEST_EXP_MAX,
  TEST_EXP_MIN,
  TEST_EXP_MSG,
  hasTestExp,
  parseTestExp,
  testExpLabel,
} from "./index";

describe("hằng số hệ số tu vi thử nghiệm", () => {
  it("khoảng 1-10 (khớp cấu hình TEST_EXP_MULT), tên tin ổn định", () => {
    expect(TEST_EXP_MIN).toBe(1);
    expect(TEST_EXP_MAX).toBe(10);
    expect(TEST_EXP_MSG).toBe("testExp");
  });
});

describe("parseTestExp (không tin máy chủ tuyệt đối)", () => {
  it("nhận số hữu hạn trong khoảng, giữ nguyên", () => {
    expect(parseTestExp({ mult: 5 })).toEqual({ mult: 5 });
    expect(parseTestExp({ mult: 2.5 })).toEqual({ mult: 2.5 });
    expect(parseTestExp({ mult: 1 })).toEqual({ mult: 1 });
    expect(parseTestExp({ mult: 10 })).toEqual({ mult: 10 });
  });

  it("kẹp ngoài khoảng: dưới 1 / âm / 0 -> 1 (xoá nhãn); trên 10 -> 10", () => {
    expect(parseTestExp({ mult: 0 })).toEqual({ mult: 1 });
    expect(parseTestExp({ mult: -3 })).toEqual({ mult: 1 });
    expect(parseTestExp({ mult: 0.5 })).toEqual({ mult: 1 });
    expect(parseTestExp({ mult: 11 })).toEqual({ mult: 10 });
    expect(parseTestExp({ mult: 1e9 })).toEqual({ mult: 10 });
  });

  it("làm tròn 2 chữ số thập phân", () => {
    expect(parseTestExp({ mult: 2.3456 })).toEqual({ mult: 2.35 });
    expect(parseTestExp({ mult: 1.004 })).toEqual({ mult: 1 });
  });

  it("rác: không phải đối tượng, thiếu mult, kiểu sai, NaN / vô cực -> null (bỏ qua tin)", () => {
    for (const bad of [
      null,
      undefined,
      5,
      "5",
      [],
      {},
      { mult: "5" },
      { mult: null },
      { mult: NaN },
      { mult: Infinity },
      { mult: -Infinity },
      { x: 5 },
    ])
      expect(parseTestExp(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("hasTestExp / testExpLabel", () => {
  it("chỉ hệ số > 1 mới có nhãn", () => {
    expect(hasTestExp(5)).toBe(true);
    expect(hasTestExp(1.01)).toBe(true);
    for (const v of [1, 0, -2, NaN, Infinity, null, undefined])
      expect(hasTestExp(v as never)).toBe(false);
    for (const v of [1, 0, -2, NaN, null, undefined]) expect(testExpLabel(v as never)).toBe("");
  });

  it("nhãn: số nguyên không có phần thập phân, số lẻ dùng dấu phẩy, kẹp trần 10", () => {
    expect(testExpLabel(5)).toBe("Thử nghiệm ×5");
    expect(testExpLabel(2.5)).toBe("Thử nghiệm ×2,5");
    expect(testExpLabel(2.25)).toBe("Thử nghiệm ×2,25");
    expect(testExpLabel(10)).toBe("Thử nghiệm ×10");
    expect(testExpLabel(99)).toBe("Thử nghiệm ×10");
    expect(testExpLabel(3.0)).toBe("Thử nghiệm ×3");
  });
});
