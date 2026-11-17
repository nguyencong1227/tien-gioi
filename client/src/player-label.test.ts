import { describe, expect, it } from "vitest";
import { TITLES } from "@tien-gioi/shared";
import { playerLabelText, titleTextOf } from "./player-label";

describe("titleTextOf", () => {
  it("id có thật ra chữ; rỗng / lạ / khoá nguyên mẫu / không phải chuỗi -> rỗng", () => {
    for (const t of TITLES) expect(titleTextOf(t.id)).toBe(t.text);
    for (const bad of ["", "zzzz", "constructor", "toString", "__proto__", null, undefined, 5, {}])
      expect(titleTextOf(bad)).toBe("");
  });
});

describe("playerLabelText", () => {
  const base = { name: "Tô Vân Hạc", realm: "Luyện Khí Tầng 9" };

  it("không tông, không danh hiệu: đạo hiệu + cảnh giới (như cũ)", () => {
    expect(playerLabelText(base)).toBe("Tô Vân Hạc\nLuyện Khí Tầng 9");
    expect(playerLabelText({ ...base, sect: "" })).toBe("Tô Vân Hạc\nLuyện Khí Tầng 9");
  });

  it("có tông (như cũ)", () => {
    expect(playerLabelText({ ...base, sect: "TD" })).toBe("[TD]\nTô Vân Hạc\nLuyện Khí Tầng 9");
  });

  it("danh hiệu hiện cạnh đạo hiệu, cùng dòng với tông, chỉ khi cờ bật", () => {
    expect(playerLabelText({ ...base, title: "lh2", showTitle: true })).toBe(
      "«Tái Sinh»\nTô Vân Hạc\nLuyện Khí Tầng 9",
    );
    expect(playerLabelText({ ...base, sect: "TD", title: "lh2", showTitle: true })).toBe(
      "[TD] «Tái Sinh»\nTô Vân Hạc\nLuyện Khí Tầng 9",
    );
    expect(playerLabelText({ ...base, title: "lh2" })).toBe("Tô Vân Hạc\nLuyện Khí Tầng 9"); // cờ tắt
    expect(playerLabelText({ ...base, title: "lh2", showTitle: false })).toBe(
      "Tô Vân Hạc\nLuyện Khí Tầng 9",
    );
  });

  it("danh hiệu rỗng / lạ: không hiện gì, không lộ id", () => {
    for (const title of ["", "zz99", "constructor", undefined]) {
      const t = playerLabelText({ ...base, title, showTitle: true });
      expect(t).toBe("Tô Vân Hạc\nLuyện Khí Tầng 9");
      expect(t).not.toContain("zz99");
    }
  });

  it("đang thách đấu: tiền tố ⚔ ở dòng đạo hiệu, không ở dòng tông / danh hiệu", () => {
    expect(
      playerLabelText({ ...base, sect: "TD", title: "lh2", showTitle: true, duel: true }),
    ).toBe("[TD] «Tái Sinh»\n⚔ Tô Vân Hạc\nLuyện Khí Tầng 9");
  });

  it("đạo hiệu có ký tự đặc biệt giữ NGUYÊN (Phaser Text không hiểu HTML)", () => {
    expect(playerLabelText({ name: "<b>x</b>", realm: "R" })).toBe("<b>x</b>\nR");
  });
});
