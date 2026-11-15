import { describe, expect, it } from "vitest";
import { optionTag, skipHintText } from "./dialog-opt";

describe("skipHintText: gợi ý theo cách nhập", () => {
  it("cảm ứng: Chạm; chuột / bàn phím / thiếu / lạ: Enter hoặc nhấp", () => {
    expect(skipHintText("touch")).toBe("Chạm để hiện hết chữ ▸");
    expect(skipHintText("mouse")).toBe("Enter hoặc nhấp để hiện hết chữ ▸");
    expect(skipHintText(undefined)).toBe("Enter hoặc nhấp để hiện hết chữ ▸");
    expect(skipHintText(null)).toBe("Enter hoặc nhấp để hiện hết chữ ▸");
    expect(skipHintText("khac")).toBe("Enter hoặc nhấp để hiện hết chữ ▸");
  });
  it("chuột không còn bảo 'Chạm'", () => {
    expect(skipHintText("mouse")).not.toMatch(/Chạm/);
  });
});

describe("optionTag: thẻ phụ dưới nhãn lựa chọn", () => {
  it("nhận / trả / rèn / bí cảnh có thẻ riêng", () => {
    expect(optionTag("accept", "Nhận nhiệm vụ: Nhập thế")?.text).toBe("Nhận việc");
    expect(optionTag("turnIn", "Trả nhiệm vụ: Nhập thế")?.text).toBe("Trả thưởng");
    expect(optionTag("forge", "Rèn đồ")?.text).toBe("Lò rèn");
    expect(optionTag("dungeon", "Vào bí cảnh")?.text).toBe("Bí cảnh");
  });
  it("bí cảnh bị khoá: thẻ đỏ 'Chưa đủ điều kiện'", () => {
    const t = optionTag("dungeon", "Vào bí cảnh", true);
    expect(t?.text).toBe("Chưa đủ điều kiện");
    expect(t?.color).toBe("#fca5a5");
  });
  it("thẻ TRÙNG nhãn thì bỏ: nút 'Cửa hàng' không in thêm 'Cửa hàng' (kể cả khác hoa thường / dấu cách thừa)", () => {
    expect(optionTag("shop", "Cửa hàng")).toBeNull();
    expect(optionTag("shop", "  cửa hàng ")).toBeNull();
  });
  it("cửa hàng có nhãn khác thì vẫn có thẻ; lựa chọn không có thẻ (đổi đồ, rời đi): null", () => {
    expect(optionTag("shop", "Xem hàng")?.text).toBe("Cửa hàng");
    expect(optionTag("trade", "Đổi 5 Lông thỏ lấy 1 Hồi Huyết Đan")).toBeNull();
    expect(optionTag("close", "Rời đi")).toBeNull();
  });
});
