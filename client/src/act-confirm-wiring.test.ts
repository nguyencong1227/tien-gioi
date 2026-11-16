// Canh MÃ NGUỒN cho hộp xác nhận dùng chung (issue #779): phần hành vi thật do script Chrome thật `client/scripts/check-act-confirm.mjs` đảm nhận. Test này
// giữ để không ai gửi `breakthrough` thẳng (bỏ qua hộp) khi sửa WorldScene sau này.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf8");
const uiSrc = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");

describe("đột phá: mọi đường gửi đều qua hộp xác nhận", () => {
  it("chỉ có HAI chỗ gửi `breakthrough`, cả hai trong requestBreakthrough (chưa đủ điều kiện: máy chủ báo; đã xác nhận)", () => {
    const sends = [...scene.matchAll(/send\("breakthrough"\)/g)];
    expect(sends).toHaveLength(2);
    const start = scene.indexOf("private requestBreakthrough(");
    const end = scene.indexOf("public travelPortal(");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    for (const m of sends) {
      expect(m.index).toBeGreaterThan(start);
      expect(m.index).toBeLessThan(end);
    }
  });

  it("nút HUD và phím tắt đều gọi requestBreakthrough", () => {
    expect(scene).toMatch(/bind\("sk-break",\s*\(\)\s*=>\s*this\.requestBreakthrough\(/);
    expect(scene).toMatch(/case "skill\.breakthrough":\s*this\.requestBreakthrough\(/);
  });

  it("nối lại mạng và đổi cảnh đóng hộp xác nhận", () => {
    const closes = [...scene.matchAll(/ui\.closeActConfirm\(false\)/g)];
    expect(closes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("hộp xác nhận là tầng trên cùng của bàn phím", () => {
  it("isKeyboardCaptured tính hộp xác nhận (hộp không nằm trong modalStack): đang mở mà giữ phím đi thì nhân vật đứng lại", () => {
    const start = uiSrc.indexOf("isKeyboardCaptured() {");
    expect(start).toBeGreaterThan(0);
    const body = uiSrc.slice(start, uiSrc.indexOf("\n  },", start));
    expect(body).toContain("this.isActConfirmOpen()");
  });
});
