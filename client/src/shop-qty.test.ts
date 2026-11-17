import { describe, expect, it } from "vitest";
import { SHOP_MAX_QTY } from "@tien-gioi/shared";
import { buyQtyMax, sellQtyMax } from "./shop-qty";

describe("buyQtyMax: mua tối đa theo ví và trần của máy chủ", () => {
  it("ví / giá làm tròn XUỐNG", () => {
    expect(buyQtyMax(1000, 24)).toBe(41); // 41 x 24 = 984 <= 1000 < 42 x 24
    expect(buyQtyMax(48, 24)).toBe(2); // vừa đủ
    expect(buyQtyMax(47, 24)).toBe(1);
  });

  it("không quá trần một lần của máy chủ", () => {
    expect(buyQtyMax(1_000_000, 24)).toBe(SHOP_MAX_QTY);
    expect(buyQtyMax(SHOP_MAX_QTY * 5, 5)).toBe(SHOP_MAX_QTY);
    expect(buyQtyMax(SHOP_MAX_QTY * 5 - 1, 5)).toBe(SHOP_MAX_QTY - 1);
  });

  it("ví không đủ cả một cái: vẫn là 1 (ô còn dùng được để xem giá, nút Mua mờ 'Thiếu N')", () => {
    expect(buyQtyMax(23, 24)).toBe(1);
    expect(buyQtyMax(0, 24)).toBe(1);
  });

  it("ví / giá hỏng: không ném, không NaN, ví hỏng = ví 0; giá không dương = không giới hạn theo ví", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -50]) {
      expect(buyQtyMax(bad, 24), `ví ${bad}`).toBe(1);
      expect(buyQtyMax(1000, bad), `giá ${bad}`).toBe(SHOP_MAX_QTY);
    }
    expect(buyQtyMax(1000, 0)).toBe(SHOP_MAX_QTY);
  });

  it("ví lẻ: làm tròn xuống trước khi chia", () => {
    expect(buyQtyMax(47.9, 24)).toBe(1);
    expect(buyQtyMax(48.9, 24)).toBe(2);
  });
});

describe("sellQtyMax: bán tối đa theo số đang có, trần của máy chủ", () => {
  it("số đang có trong ô túi", () => {
    expect(sellQtyMax(1)).toBe(1);
    expect(sellQtyMax(20)).toBe(20);
    expect(sellQtyMax(SHOP_MAX_QTY)).toBe(SHOP_MAX_QTY);
  });

  it("ngăn xếp lớn hơn trần: bán từng đợt tối đa SHOP_MAX_QTY", () => {
    expect(sellQtyMax(150)).toBe(SHOP_MAX_QTY);
    expect(sellQtyMax(SHOP_MAX_QTY + 1)).toBe(SHOP_MAX_QTY);
  });

  it("số hỏng / 0 / âm / lẻ: tối thiểu 1, lẻ làm tròn xuống, không NaN", () => {
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, -3, 0]) {
      expect(sellQtyMax(bad), String(bad)).toBe(1);
    }
    expect(sellQtyMax(Number.POSITIVE_INFINITY)).toBe(1); // không hữu hạn: coi như hỏng
    expect(sellQtyMax(7.9)).toBe(7);
  });
});
