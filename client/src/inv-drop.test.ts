import { describe, expect, it } from "vitest";
import {
  DROP_WARN_RARITY,
  dropConfirmText,
  dropStillValid,
  dropWarnText,
  planDrop,
  type DropSlot,
} from "./inv-drop";

const bag = (): (DropSlot | null)[] => [
  { itemId: "hoi_huyet_dan", qty: 5 },
  null,
  { itemId: "long_tho", qty: 1 },
  { itemId: "lang_nha_kiem", qty: 1 },
];

describe("planDrop: chụp món + số lượng lúc bấm", () => {
  it("Vứt 1: đúng 1, còn lại tính từ số đang có; Vứt hết: cả stack", () => {
    const b = bag();
    expect(planDrop(b, 0, false)).toEqual({
      index: 0,
      itemId: "hoi_huyet_dan",
      qty: 1,
      have: 5,
      all: false,
    });
    expect(planDrop(b, 0, true)).toEqual({
      index: 0,
      itemId: "hoi_huyet_dan",
      qty: 5,
      have: 5,
      all: true,
    });
  });
  it("ô trống / ngoài túi / chỉ số hỏng / số lượng hỏng: không có kế hoạch", () => {
    const b = bag();
    expect(planDrop(b, 1, true)).toBeNull();
    expect(planDrop(b, -1, true)).toBeNull();
    expect(planDrop(b, 4, true)).toBeNull();
    expect(planDrop(b, 1.5, true)).toBeNull();
    expect(planDrop(b, Number.NaN, true)).toBeNull();
    expect(planDrop([{ itemId: "x", qty: 0 }], 0, true)).toBeNull();
    expect(planDrop([{ itemId: "x", qty: Number.NaN }], 0, true)).toBeNull();
    expect(planDrop([{ itemId: "", qty: 3 }], 0, true)).toBeNull();
  });
});

describe("dropStillValid: kiểm lại lúc xác nhận", () => {
  it("túi không đổi: hợp lệ; số lượng giảm nhưng còn đủ: hợp lệ", () => {
    const b = bag();
    const plan = planDrop(b, 0, false)!;
    expect(dropStillValid(b, plan)).toBe(true);
    b[0] = { itemId: "hoi_huyet_dan", qty: 2 };
    expect(dropStillValid(b, plan)).toBe(true);
  });
  it("ô đã đổi sang món KHÁC (cùng chỉ số): huỷ, không vứt nhầm", () => {
    const b = bag();
    const plan = planDrop(b, 0, true)!;
    b[0] = { itemId: "long_tho", qty: 5 };
    expect(dropStillValid(b, plan)).toBe(false);
  });
  it("ô đã trống, hoặc không còn đủ số lượng định vứt (Vứt hết 5 mà chỉ còn 3): huỷ", () => {
    const b = bag();
    const all = planDrop(b, 0, true)!;
    b[0] = { itemId: "hoi_huyet_dan", qty: 3 };
    expect(dropStillValid(b, all)).toBe(false);
    b[0] = null;
    expect(dropStillValid(b, all)).toBe(false);
    expect(dropStillValid([], all)).toBe(false);
  });
});

describe("dropConfirmText: ghi rõ tên + số lượng", () => {
  const b = bag();
  it("Vứt hết nhiều món: tên + ×số lượng; chỉ có 1 thì không ghi ×1", () => {
    expect(dropConfirmText("Hồi Huyết Đan", planDrop(b, 0, true)!)).toBe(
      "Vứt hết Hồi Huyết Đan ×5?",
    );
    expect(dropConfirmText("Long Thố", planDrop(b, 2, true)!)).toBe("Vứt Long Thố?");
  });
  it("Vứt 1 từ stack: nêu số còn lại; từ món đơn: như Vứt", () => {
    expect(dropConfirmText("Hồi Huyết Đan", planDrop(b, 0, false)!)).toBe(
      "Vứt 1 Hồi Huyết Đan? (còn lại 4)",
    );
    expect(dropConfirmText("Lang Nha Kiếm", planDrop(b, 3, false)!)).toBe("Vứt Lang Nha Kiếm?");
  });
});

describe("dropWarnText: nhắc đồ quý", () => {
  it("từ ngưỡng quý trở lên có dòng nhắc kèm tên bậc phẩm; đồ thường / số hỏng không", () => {
    expect(dropWarnText(DROP_WARN_RARITY, "Bảo phẩm")).toBe(
      "Đồ quý: Bảo phẩm. Vứt xuống đất rồi có thể mất.",
    );
    expect(dropWarnText(4, "Thần phẩm")).toContain("Thần phẩm");
    expect(dropWarnText(DROP_WARN_RARITY - 1, "Lương phẩm")).toBeNull();
    expect(dropWarnText(0, "Phàm phẩm")).toBeNull();
    expect(dropWarnText(Number.NaN, "?")).toBeNull();
  });
});
