import { describe, it, expect } from "vitest";
import { LOCK_RANGE, keepLock, pickNextTarget } from "./target-lock";

const c = (id: string, dist: number) => ({ id, dist });

describe("target-lock: pickNextTarget", () => {
  it("không có quái trong tầm: null", () => {
    expect(pickNextTarget([], null)).toBeNull();
    expect(pickNextTarget([c("a", LOCK_RANGE + 1)], null)).toBeNull();
  });

  it("chưa khoá: lấy con gần nhất", () => {
    expect(pickNextTarget([c("xa", 300), c("gan", 80), c("giua", 150)], null)).toBe("gan");
  });

  it("đang khoá: chuyển lần lượt gần -> xa rồi vòng lại", () => {
    const list = [c("a", 50), c("b", 120), c("c", 300)];
    expect(pickNextTarget(list, "a")).toBe("b");
    expect(pickNextTarget(list, "b")).toBe("c");
    expect(pickNextTarget(list, "c")).toBe("a");
  });

  it("chỉ còn đúng con đang khoá: bấm lần nữa nhả khoá", () => {
    expect(pickNextTarget([c("a", 60)], "a")).toBeNull();
  });

  it("mục tiêu cũ đã mất hoặc ra khỏi tầm: lấy con gần nhất", () => {
    expect(pickNextTarget([c("b", 90), c("c", 200)], "a")).toBe("b");
    expect(pickNextTarget([c("a", LOCK_RANGE + 50), c("b", 90)], "a")).toBe("b");
  });

  it("bỏ qua quái ngoài tầm khi chuyển; cùng khoảng cách thì ổn định theo id", () => {
    const list = [c("a", 50), c("xa", LOCK_RANGE + 10), c("b", 120)];
    expect(pickNextTarget(list, "a")).toBe("b");
    expect(pickNextTarget(list, "b")).toBe("a");
    expect(pickNextTarget([c("z", 100), c("m", 100)], null)).toBe("m");
  });

  it("khoảng cách rác (NaN) bị bỏ qua", () => {
    expect(pickNextTarget([c("a", NaN), c("b", 70)], null)).toBe("b");
  });
});

describe("target-lock: keepLock", () => {
  it("còn hiệu lực khi quái còn đó và trong tầm", () => {
    expect(keepLock(100)).toBe(true);
    expect(keepLock(LOCK_RANGE)).toBe(true);
    expect(keepLock(LOCK_RANGE + 1)).toBe(false);
    expect(keepLock(null)).toBe(false);
    expect(keepLock(NaN)).toBe(false);
  });
});
