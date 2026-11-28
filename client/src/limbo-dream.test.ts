import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMBO_DREAM_TEXT, limboDreamLine } from "./limbo-dream";

describe("giấc mơ bến sông ở màn Hoàng Tuyền (#1464)", () => {
  it("chỉ kiếp 1 (lần chết đầu) có dòng giấc mơ", () => {
    expect(limboDreamLine(1)).toBe(LIMBO_DREAM_TEXT);
  });

  it("kiếp khác và giá trị lạ (máy chủ gửi bậy) không hiện", () => {
    for (const v of [0, 2, 3, 10, -1, 1.5, NaN, Infinity, "1", null, undefined, {}, [1]]) {
      expect(limboDreamLine(v), `kiep = ${String(v)}`).toBeNull();
    }
  });

  it("lời giấc mơ: một câu ngắn, không chữ Hán, không nêu tên thật Lão Đò (chân tướng để dành chương 7-10)", () => {
    expect(LIMBO_DREAM_TEXT.length).toBeGreaterThan(40);
    expect(LIMBO_DREAM_TEXT.length).toBeLessThanOrEqual(160);
    expect(/\p{Script=Han}/u.test(LIMBO_DREAM_TEXT)).toBe(false);
    expect(LIMBO_DREAM_TEXT).not.toMatch(/Thích Không/);
    expect(LIMBO_DREAM_TEXT).toContain("ông lão");
  });

  it("nối đủ: index.html có #limbo-dream (ẩn mặc định, sau #limbo-kiep-sub), ui.ts đặt chữ bằng limboDreamLine, có dòng nguồn ở NGUON_NOI_DUNG", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const m = html.match(/<p id="limbo-dream"[^>]*>/);
    expect(m, "thiếu <p id=limbo-dream>").not.toBeNull();
    expect(m![0]).toContain("hidden");
    expect(html.indexOf('id="limbo-kiep-sub"')).toBeLessThan(html.indexOf('id="limbo-dream"'));
    const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
    expect(ui).toMatch(/limboDreamLine\(summary\.kiep\)/);
    const nguon = readFileSync(new URL("../../docs/NGUON_NOI_DUNG.md", import.meta.url), "utf8");
    const rows = nguon.split("\n").filter((l) => l.includes("lore.lao_do_ben_song"));
    expect(rows.length, "đúng MỘT dòng nguồn lore.lao_do_ben_song").toBe(1);
    expect(rows[0]).toMatch(/\| su_kien \|/);
    expect(rows[0]).toContain("#1464");
    expect(rows[0]).toContain("KHONG_AP_DUNG");
  });
});
