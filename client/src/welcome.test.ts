import { describe, expect, it } from "vitest";
import { welcomeText } from "./welcome";

const KEYS = { interact: "F", quest: "N", map: "M" };

describe("welcomeText: dòng chào theo cách nhập", () => {
  it("chuột / bàn phím: nêu phím đang gán", () => {
    const t = welcomeText(false, KEYS);
    expect(t).toContain("Trưởng trấn (F)");
    expect(t).toContain("sổ nhiệm vụ (N)");
    expect(t).toContain("bản đồ (M)");
  });
  it("đổi phím thì chữ đổi theo (phím do người chơi gán)", () => {
    expect(welcomeText(false, { interact: "E", quest: "J", map: "Tab" })).toContain(
      "Trưởng trấn (E)",
    );
  });
  it("cảm ứng: nêu NÚT, không nêu phím nào", () => {
    const t = welcomeText(true, KEYS);
    expect(t).toMatch(/nút Nói/);
    expect(t).toMatch(/thanh menu/);
    expect(t).not.toContain("(F)");
    expect(t).not.toContain("(N)");
    expect(t).not.toContain("(M)");
  });
  it("cảm ứng không phụ thuộc phím truyền vào", () => {
    expect(welcomeText(true, { interact: "x", quest: "y", map: "z" })).toBe(
      welcomeText(true, KEYS),
    );
  });
});
