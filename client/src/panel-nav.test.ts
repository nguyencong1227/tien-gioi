import { describe, expect, it } from "vitest";
import { dirOfArrowKey, ownsArrowKeys, pickNeighbor, type NavRect } from "./panel-nav";

const box = (col: number, row: number, w = 40, h = 40, gap = 4): NavRect => ({
  left: col * (w + gap),
  top: row * (h + gap),
  right: col * (w + gap) + w,
  bottom: row * (h + gap) + h,
});

/** Lưới `cols` x `rows` (như túi đồ), chỉ số = hàng * cols + cột */
const grid = (cols: number, rows: number) =>
  Array.from({ length: cols * rows }, (_, i) => box(i % cols, Math.floor(i / cols)));

describe("pickNeighbor: lưới ô (túi đồ)", () => {
  const g = grid(6, 4);
  it("bốn hướng đi đúng một ô", () => {
    const at = 1 * 6 + 2; // hàng 1, cột 2
    expect(pickNeighbor(g, at, "right")).toBe(at + 1);
    expect(pickNeighbor(g, at, "left")).toBe(at - 1);
    expect(pickNeighbor(g, at, "down")).toBe(at + 6);
    expect(pickNeighbor(g, at, "up")).toBe(at - 6);
  });

  it("ở mép lưới: không vòng lại, không nhảy sang hàng khác", () => {
    expect(pickNeighbor(g, 5, "right")).toBeNull(); // cuối hàng 0
    expect(pickNeighbor(g, 0, "left")).toBeNull();
    expect(pickNeighbor(g, 0, "up")).toBeNull();
    expect(pickNeighbor(g, 3 * 6 + 2, "down")).toBeNull();
    expect(pickNeighbor(g, 6, "left")).toBeNull(); // đầu hàng 1 không nhảy lên cuối hàng 0
  });

  it("đi liên tục quanh lưới về đúng chỗ cũ", () => {
    let i = 7;
    for (const d of ["right", "right", "down", "left", "left", "up"] as const)
      i = pickNeighbor(g, i, d)!;
    expect(i).toBe(7);
  });
});

describe("pickNeighbor: danh sách thẻ có hàng nút (cửa hàng)", () => {
  // mỗi hàng: [−] [+] [Mua]; ba hàng
  const rows = [0, 1, 2].flatMap((r) => [
    { left: 200, top: r * 60, right: 230, bottom: r * 60 + 30 }, // −
    { left: 240, top: r * 60, right: 270, bottom: r * 60 + 30 }, // +
    { left: 300, top: r * 60, right: 380, bottom: r * 60 + 30 }, // Mua
  ]);
  it("Xuống từ một nút sang nút cùng cột ở hàng dưới", () => {
    expect(pickNeighbor(rows, 0, "down")).toBe(3); // − -> − dưới
    expect(pickNeighbor(rows, 1, "down")).toBe(4);
    expect(pickNeighbor(rows, 2, "down")).toBe(5);
    expect(pickNeighbor(rows, 5, "up")).toBe(2);
  });
  it("Trái / Phải đi trong cùng hàng, không nhảy hàng", () => {
    expect(pickNeighbor(rows, 0, "right")).toBe(1);
    expect(pickNeighbor(rows, 1, "right")).toBe(2);
    expect(pickNeighbor(rows, 2, "right")).toBeNull();
    expect(pickNeighbor(rows, 3, "left")).toBeNull();
  });
});

describe("pickNeighbor: dãy lựa chọn xếp dọc (hội thoại) và trường hợp lệch", () => {
  const stack = [0, 1, 2, 3].map((r) => ({
    left: 0,
    top: r * 50,
    right: 300,
    bottom: r * 50 + 40,
  }));
  it("Lên / Xuống đi từng dòng, Trái / Phải không làm gì", () => {
    expect(pickNeighbor(stack, 0, "down")).toBe(1);
    expect(pickNeighbor(stack, 3, "up")).toBe(2);
    expect(pickNeighbor(stack, 0, "up")).toBeNull();
    expect(pickNeighbor(stack, 1, "left")).toBeNull();
    expect(pickNeighbor(stack, 1, "right")).toBeNull();
  });

  it("không có phần tử nào chồng hình chiếu: lấy phần tử gần nhất theo khoảng cách + độ lệch", () => {
    const r: NavRect[] = [
      { left: 0, top: 0, right: 40, bottom: 40 },
      { left: 300, top: 100, right: 340, bottom: 140 }, // xa, lệch
      { left: 100, top: 90, right: 140, bottom: 130 }, // gần hơn
    ];
    expect(pickNeighbor(r, 0, "down")).toBe(2);
    expect(pickNeighbor(r, 0, "right")).toBe(2); // không ai cùng hàng: vẫn lấy phần tử gần nhất theo điểm
  });

  it("chỉ số ngoài khoảng / danh sách một phần tử: null", () => {
    expect(pickNeighbor([], 0, "down")).toBeNull();
    expect(pickNeighbor([box(0, 0)], 0, "down")).toBeNull();
    expect(pickNeighbor(grid(2, 2), 9, "down")).toBeNull();
  });
});

describe("dirOfArrowKey / ownsArrowKeys", () => {
  it("chỉ bốn phím mũi tên", () => {
    expect(dirOfArrowKey("ArrowUp")).toBe("up");
    expect(dirOfArrowKey("ArrowDown")).toBe("down");
    expect(dirOfArrowKey("ArrowLeft")).toBe("left");
    expect(dirOfArrowKey("ArrowRight")).toBe("right");
    for (const k of ["w", "a", "Enter", "Tab", " "]) expect(dirOfArrowKey(k)).toBeNull();
  });

  const el = (tagName: string, type = "") => ({ tagName, type }) as unknown as Element;
  it("ô nhập chữ, select, thanh trượt là của chính nó; nút và checkbox thì không", () => {
    expect(ownsArrowKeys(el("INPUT", "text"))).toBe(true);
    expect(ownsArrowKeys(el("INPUT", "range"))).toBe(true);
    expect(ownsArrowKeys(el("INPUT", "number"))).toBe(true);
    expect(ownsArrowKeys(el("SELECT"))).toBe(true);
    expect(ownsArrowKeys(el("TEXTAREA"))).toBe(true);
    expect(ownsArrowKeys(el("INPUT", "checkbox"))).toBe(false);
    expect(ownsArrowKeys(el("BUTTON"))).toBe(false);
    expect(ownsArrowKeys(null)).toBe(false);
  });
  it("thanh trượt nằm ngang: chỉ Trái / Phải là của nó, Lên / Xuống vẫn chuyển focus (không bẫy ở Cài đặt)", () => {
    const range = el("INPUT", "range");
    expect(ownsArrowKeys(range, "left")).toBe(true);
    expect(ownsArrowKeys(range, "right")).toBe(true);
    expect(ownsArrowKeys(range, "up")).toBe(false);
    expect(ownsArrowKeys(range, "down")).toBe(false);
    // ô chọn và ô chữ giữ cả bốn phím
    for (const d of ["up", "down", "left", "right"] as const) {
      expect(ownsArrowKeys(el("SELECT"), d)).toBe(true);
      expect(ownsArrowKeys(el("INPUT", "text"), d)).toBe(true);
    }
  });
});
