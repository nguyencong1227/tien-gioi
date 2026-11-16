// Canh MÃ NGUỒN cho lỗi di chuyển bàn phím (QUYET_DINH_M3 mục 25); hành vi thật do script Chrome thật `client/scripts/check-move-keys.mjs` đảm nhận.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scene = readFileSync(new URL("./scenes/WorldScene.ts", import.meta.url), "utf8");

describe("WorldScene: phím di chuyển đọc theo event.code", () => {
  it("không còn đăng ký phím di chuyển của Phaser (keyCode) và không đọc isDown", () => {
    expect(scene).not.toMatch(/addKeys\(/);
    expect(scene).not.toMatch(/\.isDown\b/);
  });

  it("nghe keydown / keyup ở pha bắt và quên phím khi mất focus, ẩn tab, menu chuột phải, vào ô chat", () => {
    expect(scene).toMatch(/addEventListener\("keydown", kd, true\)/);
    expect(scene).toMatch(/addEventListener\("keyup", ku, true\)/);
    for (const ev of ['"blur"', '"pagehide"', '"contextmenu"']) {
      expect(scene).toContain(`addEventListener(${ev}, forget)`);
    }
    expect(scene).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(scene).toContain('document.addEventListener("focusin", onFocusIn, true)');
  });

  it("chỉ ô NHẬP CHỮ chặn đi bộ (không phải mọi <input>)", () => {
    expect(scene).not.toMatch(/activeElement instanceof HTMLInputElement/);
    expect(scene).toMatch(
      /if \(isTypingElement\(document\.activeElement\)\) return \{ dx: 0, dy: 0 \}/,
    );
  });
});
