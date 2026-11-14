import { describe, it, expect } from "vitest";
import {
  LOCK_RANGE,
  keepLock,
  pickNextPlayer,
  pickNextTarget,
  pickPrevTarget,
} from "./target-lock";

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

describe("target-lock: pickPrevTarget (Shift+Tab)", () => {
  const list = [c("a", 50), c("b", 120), c("c", 300)];

  it("chưa khoá: con gần nhất (như Tab); không có quái trong tầm: null", () => {
    expect(pickPrevTarget(list, null)).toBe("a");
    expect(pickPrevTarget([], null)).toBeNull();
    expect(pickPrevTarget([c("xa", LOCK_RANGE + 1)], null)).toBeNull();
  });

  it("đang khoá: đi ngược xa -> gần rồi vòng về con xa nhất", () => {
    expect(pickPrevTarget(list, "c")).toBe("b");
    expect(pickPrevTarget(list, "b")).toBe("a");
    expect(pickPrevTarget(list, "a")).toBe("c");
  });

  it("Tab rồi Shift+Tab quay lại đúng con cũ", () => {
    for (const id of ["a", "b", "c"]) {
      const next = pickNextTarget(list, id)!;
      expect(pickPrevTarget(list, next)).toBe(id);
    }
  });

  it("chỉ còn đúng con đang khoá: nhả khoá; mục tiêu cũ đã mất: con gần nhất; bỏ qua quái ngoài tầm", () => {
    expect(pickPrevTarget([c("a", 50)], "a")).toBeNull();
    expect(pickPrevTarget(list, "da-mat")).toBe("a");
    expect(pickPrevTarget([...list, c("xa", LOCK_RANGE + 50)], "a")).toBe("c");
  });
});

describe("pickNextPlayer: phím P mở menu đồng đạo (#463)", () => {
  const three = [c("b", 200), c("a", 100), c("c", 300)];
  it("không ai thì null", () => {
    expect(pickNextPlayer([], null)).toBeNull();
    expect(pickNextPlayer([c("x", Number.NaN)], null)).toBeNull();
  });
  it("lần đầu lấy người GẦN nhất, bấm tiếp (sau Esc) đi xa dần rồi vòng lại", () => {
    expect(pickNextPlayer(three, null)).toBe("a");
    expect(pickNextPlayer(three, "a")).toBe("b");
    expect(pickNextPlayer(three, "b")).toBe("c");
    expect(pickNextPlayer(three, "c")).toBe("a");
  });
  it("người vừa mở đã đi khỏi tầm nhìn: quay về người gần nhất", () => {
    expect(pickNextPlayer(three, "zzz")).toBe("a");
  });
  it("chỉ một người: mở lại chính người đó (khác Tab chọn quái, không nhả)", () => {
    expect(pickNextPlayer([c("a", 50)], "a")).toBe("a");
    expect(pickNextPlayer([c("a", 50)], null)).toBe("a");
  });
  it("hoà khoảng cách: theo id, kết quả ổn định", () => {
    const tie = [c("m", 100), c("k", 100)];
    expect(pickNextPlayer(tie, null)).toBe("k");
    expect(pickNextPlayer(tie, "k")).toBe("m");
  });
});
