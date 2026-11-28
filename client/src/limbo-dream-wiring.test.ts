import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMBO_DREAM_LINES, limboDreamOf } from "@tien-gioi/shared";

// Giấc mơ bến sông (#1464 lát 2): DỮ LIỆU và tra cứu ở shared/src/limbo-dream.ts (test riêng ở đó); đây chỉ canh phần NỐI của client:
// HTML ẩn mặc định và đứng sau dòng kiếp, ui.ts chỉ lấy lời qua limboDreamOf(summary.kiep) và ẩn khi `undefined`, không giữ bản sao chữ ở client.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

describe("giấc mơ bến sông: nối ở client (#1464)", () => {
  it("index.html: #limbo-dream ẩn mặc định, đứng NGAY SAU #limbo-kiep-sub và trước bảng tóm tắt", () => {
    const m = html.match(/<p id="limbo-dream"[^>]*>/);
    expect(m, "thiếu <p id=limbo-dream>").not.toBeNull();
    expect(m![0]).toContain("hidden");
    const sub = html.indexOf('id="limbo-kiep-sub"');
    const dream = html.indexOf('id="limbo-dream"');
    const summary = html.indexOf('class="limbo-summary"');
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThan(dream);
    expect(dream).toBeLessThan(summary);
  });

  it("ui.ts: lời lấy qua limboDreamOf(summary.kiep), ẩn khi undefined, KHÔNG chép chữ giấc mơ vào client", () => {
    expect(ui).toMatch(/limboDreamOf\(summary\.kiep\)/);
    expect(ui).toMatch(/dreamEl\.hidden = dream === undefined/);
    expect(ui).toMatch(/dreamEl\.textContent = dream \?\? ""/);
    const lines = LIMBO_DREAM_LINES.map((l) => l.text);
    for (const t of lines) {
      expect(ui.includes(t), "chữ giấc mơ bị chép vào ui.ts").toBe(false);
      expect(html.includes(t), "chữ giấc mơ bị chép vào index.html").toBe(false);
    }
  });

  it("style.css: .limbo-dream chữ nghiêng; dữ liệu: kiếp 1 có lời, kiếp 2 chưa có", () => {
    const block = css.match(/\.limbo-dream \{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("font-style: italic");
    expect(limboDreamOf(1)).toBeTruthy();
    expect(limboDreamOf(2)).toBeUndefined();
  });
});
