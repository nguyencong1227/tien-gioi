// Đọc `TEST_EXP_MULT` (QUYET_DINH_M3 mục 34): dạng `đạo_hiệu:hệ_số`, không phân biệt hoa thường, hệ số nguyên 1-10, mục sai bị bỏ kèm cảnh báo.
import { describe, expect, it } from "vitest";
import { TEST_EXP_MULT_MAX, TEST_EXP_MULT_MIN, testExpMultFor, testExpMultOf } from "./test-exp";
import { startupWarnings } from "./startup";

const of = (raw: string | undefined) => testExpMultOf({ TEST_EXP_MULT: raw } as NodeJS.ProcessEnv);

describe("testExpMultOf", () => {
  it("không đặt / rỗng / chỉ khoảng trắng: TẮT, không cảnh báo", () => {
    for (const raw of [undefined, "", "   "]) {
      const r = of(raw);
      expect(r.value.size).toBe(0);
      expect(r.warnings).toEqual([]);
    }
  });

  it("Han:5 -> khoá chuẩn hoá thường 'han' = 5; tra không phân biệt hoa thường; người khác = 1", () => {
    const r = of("Han:5");
    expect(r.value.get("han")).toBe(5);
    for (const n of ["Han", "han", "HAN", "hAn"]) expect(testExpMultFor(r.value, n)).toBe(5);
    expect(testExpMultFor(r.value, "Hana")).toBe(1);
    expect(testExpMultFor(r.value, "Ha")).toBe(1);
    expect(testExpMultFor(new Map(), "Han")).toBe(1);
  });

  it("đang bật thì có đúng MỘT cảnh báo khởi động liệt kê ai được nhân (minh bạch)", () => {
    const r = of("Han:5");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("BẬT");
    expect(r.warnings[0]).toContain("Han x5");
    expect(startupWarnings({ TEST_EXP_MULT: "Han:5" } as NodeJS.ProcessEnv).join("\n")).toContain(
      "Han x5",
    );
    // tắt thì startupWarnings không nhắc tới
    expect(startupWarnings({} as NodeJS.ProcessEnv).join("\n")).not.toContain("TEST_EXP_MULT");
  });

  it("nhiều mục cách nhau dấu phẩy, tên có khoảng trắng, bỏ khoảng trắng thừa và mục rỗng", () => {
    const r = of(" Han:5 , Linh Nhi : 2 ,, Tử Vân:10 ");
    expect([...r.value]).toEqual([
      ["han", 5],
      ["linh nhi", 2],
      ["tử vân", 10],
    ]);
    expect(testExpMultFor(r.value, "LINH NHI")).toBe(2);
    expect(testExpMultFor(r.value, "tử vân")).toBe(10);
  });

  it("tên có dấu: Unicode dạng tổ hợp và dựng sẵn (NFC / NFD) khớp nhau", () => {
    const composed = "Tử Vân"; // dựng sẵn (NFC)
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    const r = of(`${decomposed}:3`);
    expect(testExpMultFor(r.value, composed)).toBe(3);
    expect(testExpMultFor(r.value, decomposed)).toBe(3);
  });

  it(`hệ số ${TEST_EXP_MULT_MIN} và ${TEST_EXP_MULT_MAX} là biên hợp lệ; 1 không nhân và không bị liệt kê là 'đang bật'`, () => {
    const r = of(`A1:${TEST_EXP_MULT_MIN},B2:${TEST_EXP_MULT_MAX}`);
    expect(r.value.get("a1")).toBe(1);
    expect(r.value.get("b2")).toBe(10);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("B2 x10");
    expect(r.warnings[0]).not.toContain("A1");
  });

  it("mục sai bị BỎ kèm cảnh báo, không đoán / không kẹp lặng lẽ (Han:50 KHÔNG thành x10)", () => {
    for (const bad of [
      "Han:0",
      "Han:11",
      "Han:50",
      "Han:-3",
      "Han:2.5",
      "Han:abc",
      "Han:",
      "Han",
      ":5",
      "Han:5x",
    ]) {
      const r = of(bad);
      expect(r.value.size, bad).toBe(0);
      expect(r.warnings, bad).toHaveLength(1);
      expect(r.warnings[0], bad).toContain("bỏ mục");
    }
  });

  it("mục sai không làm hỏng mục đúng bên cạnh", () => {
    const r = of("Han:5,Lỗi:99,Linh:2");
    expect([...r.value]).toEqual([
      ["han", 5],
      ["linh", 2],
    ]);
    expect(r.warnings.some((w) => w.includes("Lỗi:99"))).toBe(true);
  });

  it("trùng đạo hiệu (khác hoa thường): lấy mục SAU CÙNG, có cảnh báo", () => {
    const r = of("Han:5,HAN:3");
    expect(r.value.get("han")).toBe(3);
    expect(r.warnings.some((w) => w.includes("nhiều lần"))).toBe(true);
  });

  it("cảnh báo không lộ thứ nào ngoài đạo hiệu và hệ số", () => {
    const r = of("Han:5");
    expect(r.warnings.join(" ")).not.toMatch(/secret|token|mật/i);
  });
});
