import { describe, expect, it } from "vitest";
import {
  QTY_HOLD_DELAY_MS,
  applyHold,
  applyQtyAction,
  parseQty,
  qtyDisabled,
  qtyHoldStep,
  type QtyAction,
} from "./qty-input";

describe("parseQty (đọc chữ người chơi gõ)", () => {
  it("số hợp lệ trong giới hạn: giữ nguyên, không báo", () => {
    expect(parseQty("7", 50)).toEqual({ qty: 7, note: "", clamped: false, invalid: false });
    expect(parseQty("50", 50).qty).toBe(50);
    expect(parseQty("1", 50).qty).toBe(1);
  });

  it("vượt giới hạn: kẹp về max kèm chữ báo, đánh dấu clamped (ô ghi đè lại số đã kẹp)", () => {
    const r = parseQty("9999", 120);
    expect(r).toMatchObject({ qty: 120, clamped: true, invalid: false });
    expect(r.note).toBe("Chỉ có tối đa 120.");
    expect(parseQty("51", 50)).toMatchObject({ qty: 50, clamped: true });
  });

  it("số rất dài (vượt mọi giới hạn) không mất chính xác: vẫn kẹp về max", () => {
    expect(parseQty("99999999999999999999999", 40)).toMatchObject({ qty: 40, clamped: true });
    expect(parseQty("1".repeat(30), 40)).toMatchObject({ qty: 40, clamped: true });
  });

  it("dấu phân nhóm nghìn và khoảng trắng được chấp nhận ('1.000', '1,000', ' 12 ')", () => {
    expect(parseQty("1.000", 5000).qty).toBe(1000);
    expect(parseQty("1,000", 5000).qty).toBe(1000);
    expect(parseQty(" 12 ", 50).qty).toBe(12);
    expect(parseQty("1 000", 5000).qty).toBe(1000);
  });

  it("số 0 đứng đầu bị bỏ ('007' = 7); riêng '0' là sai (phải từ 1)", () => {
    expect(parseQty("007", 50).qty).toBe(7);
    expect(parseQty("0", 50)).toMatchObject({ qty: null, invalid: true });
    expect(parseQty("0", 50).note).toMatch(/từ 1 trở lên/);
    expect(parseQty("000", 50)).toMatchObject({ qty: null, invalid: true });
  });

  it("chữ, dấu âm, số lẻ, ký hiệu khoa học: hỏng, KHÔNG đoán ý", () => {
    for (const bad of ["abc", "-5", "1e3", "12abc", "3,5a", "+7", "١٢", "\uFF15"]) {
      const r = parseQty(bad, 50);
      expect(r.qty, bad).toBeNull();
      expect(r.invalid, bad).toBe(true);
      expect(r.note, bad).not.toBe("");
    }
  });

  it("ô trống: chưa phải lỗi (đang xoá để gõ lại), qty null, không báo", () => {
    expect(parseQty("", 50)).toEqual({ qty: null, note: "", clamped: false, invalid: false });
    expect(parseQty("   ", 50)).toEqual({ qty: null, note: "", clamped: false, invalid: false });
  });

  it("kiểu không phải chuỗi (null / số / undefined): coi như trống, không ném", () => {
    expect(parseQty(null, 50).qty).toBeNull();
    expect(parseQty(undefined, 50).qty).toBeNull();
    expect(parseQty(12 as unknown, 50).qty).toBeNull();
  });

  it("không còn gì để chọn (max < 1, NaN, Infinity): qty null và nói rõ", () => {
    for (const max of [0, -3, Number.NaN, -Infinity]) {
      const r = parseQty("5", max);
      expect(r.qty, String(max)).toBeNull();
      expect(r.note, String(max)).toMatch(/Không còn gì để chọn/);
    }
  });

  it("max lẻ được làm tròn xuống (số lượng luôn nguyên)", () => {
    expect(parseQty("99", 7.9)).toMatchObject({ qty: 7, clamped: true });
  });
});

describe("applyQtyAction (nút nhanh)", () => {
  const A = (cur: number | null, a: QtyAction, max: number) => applyQtyAction(cur, a, max);

  it("− / +: một đơn vị, kẹp vào [1, max]", () => {
    expect(A(5, "plus", 50)).toBe(6);
    expect(A(5, "minus", 50)).toBe(4);
    expect(A(1, "minus", 50)).toBe(1);
    expect(A(50, "plus", 50)).toBe(50);
  });

  it("×10 / ×100 NHÂN số hiện tại (1 -> 10 -> 100), kẹp theo max", () => {
    expect(A(1, "x10", 5000)).toBe(10);
    expect(A(10, "x10", 5000)).toBe(100);
    expect(A(1, "x100", 5000)).toBe(100);
    expect(A(7, "x100", 5000)).toBe(700);
    expect(A(7, "x100", 300)).toBe(300);
    expect(A(40, "x10", 120)).toBe(120);
  });

  it("Tối đa: đúng max (đã làm tròn xuống)", () => {
    expect(A(1, "max", 87)).toBe(87);
    expect(A(1, "max", 87.6)).toBe(87);
  });

  it("ô trống / hỏng / dưới 1: + cho 1, ×10 cho 10, ×100 cho 100, − cho 1 (không nhảy lên 2 vô lý)", () => {
    expect(A(null, "plus", 50)).toBe(1);
    expect(A(0, "plus", 50)).toBe(1);
    expect(A(Number.NaN, "plus", 50)).toBe(1);
    expect(A(Number.NaN, "x10", 50)).toBe(10);
    expect(A(null, "x100", 500)).toBe(100);
    expect(A(null, "x100", 50)).toBe(50);
    expect(A(-4, "minus", 50)).toBe(1);
    expect(A(null, "minus", 50)).toBe(1);
  });

  it("không còn gì để chọn: mọi nút cho 0", () => {
    for (const a of ["minus", "plus", "x10", "x100", "max"] as QtyAction[])
      expect(A(3, a, 0), a).toBe(0);
  });

  it("kết quả luôn nguyên và trong [1, max] (quét)", () => {
    for (const max of [1, 2, 9, 10, 99, 100, 1000])
      for (const cur of [null, 1, 2, 9, 10, 55, 100, 5000])
        for (const a of ["minus", "plus", "x10", "x100", "max"] as QtyAction[]) {
          const v = A(cur, a, max);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(max);
        }
  });
});

describe("qtyDisabled (khoá nút vô tác dụng)", () => {
  it("ở 1: khoá −; ở trần: khoá +, ×10, ×100, Tối đa", () => {
    expect(qtyDisabled(1, 50)).toEqual({
      minus: true,
      plus: false,
      x10: false,
      x100: false,
      max: false,
    });
    expect(qtyDisabled(50, 50)).toEqual({
      minus: false,
      plus: true,
      x10: true,
      x100: true,
      max: true,
    });
    expect(qtyDisabled(10, 50)).toEqual({
      minus: false,
      plus: false,
      x10: false,
      x100: false,
      max: false,
    });
  });
  it("max = 1: chỉ còn một lựa chọn, khoá hết; max < 1: khoá hết", () => {
    expect(Object.values(qtyDisabled(1, 1)).every(Boolean)).toBe(true);
    expect(Object.values(qtyDisabled(null, 0)).every(Boolean)).toBe(true);
  });
  it("số hiện tại trống (null) tính như 1", () => {
    expect(qtyDisabled(null, 50).minus).toBe(true);
    expect(qtyDisabled(null, 50).plus).toBe(false);
  });
});

describe("giữ nút −/+ (tăng nhanh dần)", () => {
  it("nhịp đầu 1 đơn vị, về sau nhanh dần: delta không giảm, khoảng chờ không tăng, có sàn", () => {
    expect(qtyHoldStep(0)).toEqual({ delta: 1, nextMs: 170 });
    let prevDelta = 0;
    let prevMs = Infinity;
    for (let i = 0; i < 200; i++) {
      const s = qtyHoldStep(i);
      expect(s.delta).toBeGreaterThanOrEqual(prevDelta);
      expect(s.nextMs).toBeLessThanOrEqual(prevMs);
      expect(s.nextMs).toBeGreaterThanOrEqual(45);
      prevDelta = s.delta;
      prevMs = s.nextMs;
    }
    expect(qtyHoldStep(200).delta).toBe(100);
  });

  it("chỉ số hỏng (âm, NaN) coi như nhịp 0", () => {
    expect(qtyHoldStep(-5)).toEqual(qtyHoldStep(0));
    expect(qtyHoldStep(Number.NaN)).toEqual(qtyHoldStep(0));
  });

  it("đi từ 1 tới trần vài nghìn trong vài giây (đủ nhanh), nhưng 5 nhịp đầu chỉ +1 (còn chọn chính xác được)", () => {
    let cur = 1;
    let t = QTY_HOLD_DELAY_MS;
    for (let i = 0; cur < 3000; i++) {
      cur = applyHold(cur, "plus", i, 3000);
      t += qtyHoldStep(i).nextMs;
      expect(i).toBeLessThan(400); // không kẹt
    }
    expect(t).toBeLessThan(6000);
    let c = 1;
    for (let i = 0; i < 5; i++) c = applyHold(c, "plus", i, 3000);
    expect(c).toBe(6);
  });

  it("applyHold kẹp vào [1, max] cả hai chiều và max < 1 cho 0", () => {
    expect(applyHold(95, "plus", 40, 100)).toBe(100);
    expect(applyHold(5, "minus", 40, 100)).toBe(1);
    expect(applyHold(5, "plus", 0, 0)).toBe(0);
  });
});
