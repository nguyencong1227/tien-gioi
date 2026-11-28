// Canh MÃ NGUỒN dải "Mất kết nối — nhân vật đang được bảo vệ" (QUYET_DINH_M3 mục 33; #1383 mục 2): logic thời gian do `net-slow.test.ts` kiểm; hành vi thật trong Chrome
// do `npm run e2e:nhip-tim -w server` (Ca 1 / 3 / 5). Test này lấp khe còn lại: chữ trên chip nằm ở `index.html` còn hằng `NET_LOST_TEXT` không ai dùng nên hai chỗ có thể
// lệch nhau, và đường nối `NetSlowMonitor -> ui.setNetSlow -> #net-slow.hidden` chưa có test nào giữ.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NET_LOST_TEXT } from "./net-slow";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/**
 * Bỏ chú thích (`/* ... *\/` và `// ...`) khỏi mã nguồn trước khi so khớp: dòng nối bị COMMENT RA (đột biến `// ui.setNetSlow(slow);` / `// activeNetSlow?.stop();`)
 * từng làm test vẫn xanh vì regex khớp luôn chữ trong chú thích. `(^|[^:])` giữ nguyên `https://...` trong chuỗi.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const ui = stripComments(readFileSync(new URL("./ui.ts", import.meta.url), "utf8"));
const main = stripComments(readFileSync(new URL("./main.ts", import.meta.url), "utf8"));

/** Cắt khối `setNetSlow(...) { ... }` / `isNetSlowShown() { ... }` trong `ui.ts` (tới `}` thụt lề hai ô, đầu khối kế tiếp). */
function uiBlock(name: string): string {
  const start = ui.indexOf(`  ${name}(`);
  expect(start, `ui.ts không còn hàm ${name}`).toBeGreaterThanOrEqual(0);
  const end = ui.indexOf("\n  },", start);
  expect(end, `không tìm thấy cuối hàm ${name}`).toBeGreaterThan(start);
  return ui.slice(start, end);
}

describe("mục 33: dải 'Mất kết nối — nhân vật đang được bảo vệ' (nối dây)", () => {
  it("chữ trên chip ở index.html KHỚP hằng NET_LOST_TEXT (không lệch lời hứa 'được bảo vệ')", () => {
    const m = /<span id="net-slow-text">([^<]*)<\/span>/.exec(html);
    expect(m, "index.html không còn #net-slow-text").not.toBeNull();
    expect(m![1]!.trim()).toBe(NET_LOST_TEXT);
  });

  it("chip #net-slow có sẵn trong trang, ẨN từ đầu và là vùng báo trạng thái (đọc được bằng trình đọc màn hình)", () => {
    const tag = /<div id="net-slow"[^>]*>/.exec(html);
    expect(tag, "index.html không còn #net-slow").not.toBeNull();
    expect(tag![0]).toMatch(/\bhidden\b/);
    expect(tag![0]).toMatch(/role="status"/);
    expect(tag![0]).toMatch(/aria-live="polite"/);
  });

  it("ui.setNetSlow hiện chip khi slow = true và ẩn khi false (`hidden = !slow`); isNetSlowShown đọc đúng cờ ấy", () => {
    const set = uiBlock("setNetSlow");
    expect(set).toMatch(/getElementById\("net-slow"\)/);
    expect(set).toMatch(/chip\.hidden\s*=\s*!slow/);
    const shown = uiBlock("isNetSlowShown");
    expect(shown).toMatch(/getElementById\("net-slow"\)/);
    expect(shown).toMatch(/!chip\.hidden/);
  });

  it("main.ts nối NetSlowMonitor.onChange vào ui.setNetSlow (và dừng chip cùng nhịp tim khi rớt mạng / đổi phòng)", () => {
    expect(main).toMatch(
      /new NetSlowMonitor\(\{[\s\S]*?onChange:\s*\(slow,\s*resumed\)\s*=>\s*\{[\s\S]*?ui\.setNetSlow\(slow\);/,
    );
    expect(main).toMatch(/function stopLiveness\(/);
    expect(main).toMatch(/activeNetSlow\?*\.stop\(\)/);
  });
});
