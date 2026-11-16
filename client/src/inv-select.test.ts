// Lỗi túi đồ (QUYET_DINH_M3 mục 24): RÊ CHUỘT không được đổi món đã chọn. Phần đổi trạng thái thật được kiểm bằng Chrome thật (`client/scripts/check-inv-select.mjs`:
// chuột, cảm ứng, bàn phím); test này canh MÃ NGUỒN để không ai gắn lại sự kiện rê chuột vào việc chọn (một dòng `pointerenter` cũ là cả lỗi).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");

const HOVER_EVENTS =
  /addEventListener\(\s*"(pointerenter|pointerover|pointermove|mouseenter|mouseover|mousemove)"\s*,\s*([^)]*)/g;

describe("ui.ts: rê chuột không đổi món đã chọn", () => {
  it("mọi nghe sự kiện rê chuột trong ui.ts đều nằm trong danh sách cho phép (chỉ thanh chat)", () => {
    const found = [...src.matchAll(HOVER_EVENTS)].map((m) => `${m[1]}:${m[2].trim()}`);
    expect(found).toEqual(["pointerenter:bumpChat"]);
  });

  it("bộ chọn ô túi đồ chỉ gọi selectSlot từ pointerdown (chuột chính / chạm) và focus (bàn phím)", () => {
    const calls = [...src.matchAll(/selectSlot\(i\)/g)].length;
    expect(calls).toBe(2);
    const down = src.indexOf('btn.addEventListener("pointerdown"');
    const focus = src.indexOf('btn.addEventListener("focus"');
    expect(down).toBeGreaterThan(0);
    expect(focus).toBeGreaterThan(down);
    // đoạn pointerdown của ô túi chặn nút phụ của chuột
    expect(src.slice(down, focus)).toContain("e.button !== 0");
  });

  it("nút Vứt không gửi dropItem trực tiếp: phải qua hộp xác nhận", () => {
    expect(src).not.toMatch(/bindTap\("inv-btn-drop1",[^)]*onDrop/);
    expect(src).not.toMatch(/bindTap\("inv-btn-dropall",[^)]*onDrop/);
    expect(src).toContain('bindTap("inv-btn-drop1", () => askDropConfirm(false');
    expect(src).toContain('bindTap("inv-btn-dropall", () => askDropConfirm(true');
  });
});
