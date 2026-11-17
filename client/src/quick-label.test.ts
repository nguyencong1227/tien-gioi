import { describe, expect, it } from "vitest";
import { ITEMS } from "@tien-gioi/shared";
import { quickLabel } from "./quick-label";
import { isQuickCandidate } from "./item-use";

describe("quickLabel: nhãn ngắn của ô nhanh đan dược", () => {
  it("giữ loại (Huyết / Linh) và cấp (2 / 3) của đan Hồi", () => {
    expect(quickLabel("Hồi Huyết Đan")).toBe("Huyết");
    expect(quickLabel("Hồi Linh Đan")).toBe("Linh");
    expect(quickLabel("Đại Hồi Huyết Đan")).toBe("Huyết 2");
    expect(quickLabel("Đại Hồi Linh Đan")).toBe("Linh 2");
    expect(quickLabel("Thượng Hồi Huyết Đan")).toBe("Huyết 3");
    expect(quickLabel("Thượng Hồi Linh Đan")).toBe("Linh 3");
  });

  it("đan khác chỉ bỏ chữ 'Đan' ở cuối; tên lạ / rỗng / không phải chuỗi không ném lỗi", () => {
    expect(quickLabel("Tụ Khí Đan")).toBe("Tụ Khí");
    expect(quickLabel("Giao Lân")).toBe("Giao Lân"); // không có 'Đan': giữ nguyên
    expect(quickLabel("  Hồi Huyết Đan  ")).toBe("Huyết");
    expect(quickLabel("")).toBe("");
    expect(quickLabel(undefined as unknown as string)).toBe("");
    expect(quickLabel(null as unknown as string)).toBe("");
  });

  it("MỌI vật phẩm có thể chiếm ô dùng nhanh có nhãn KHÁC NHAU và đủ ngắn cho ô ~48 px (<= 9 ký tự): đan mới thêm vào mà nhãn trùng / quá dài thì đỏ ở đây", () => {
    // Ô dùng nhanh chỉ hiển thị ứng viên (isQuickCandidate = consumable KHÔNG gắn trạng thái). Đan hộ đạo (#763) và phù
    // (#817) gắn trạng thái (`effect.kind === "status"`) nên KHÔNG xuất hiện ở ô nhanh (xem item-use.ts): không cần nhãn ngắn.
    const consumables = ITEMS.filter(isQuickCandidate);
    expect(consumables.length).toBeGreaterThanOrEqual(7);
    const labels = consumables.map((i) => quickLabel(i.name));
    expect(new Set(labels).size).toBe(labels.length); // không hai đan chung nhãn
    for (const [k, l] of labels.entries()) {
      expect(l.length, `${consumables[k].id} -> "${l}"`).toBeLessThanOrEqual(9);
      expect(l.length).toBeGreaterThan(0);
    }
  });
});
