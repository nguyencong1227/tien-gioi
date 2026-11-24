// Giữ vòng chờ Chrome mở cổng CDP đủ dài trong MỌI script E2E (#694, #1432).
// Lần khởi động Chrome ĐẦU TIÊN trên một runner mới (hồ sơ, bộ nhớ đệm phông, lạnh) mất > 8 s: `e2e` (script đầu tiên của `e2e:all`)
// ĐỎ lần 1 ở đúng ~8,5 s ("page target không phản hồi") trong cả bốn lần chạy đủ trên runner, rồi XANH ở lần thử lại. Đây là bước dựng,
// không phải khẳng định, nên hạn rộng không làm lỏng kiểm tra nào; hạn ngắn chỉ gây đỏ giả.
// Sau #1432: TOÀN BỘ kịch bản E2E trong server/scripts/ đã chuyển sang helper `e2e-chrome.ts` với hạn chờ >= 30 s và cơ chế tự thử lại kèm chẩn đoán.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const HELPER_MIN_WAIT_MS = 30000;
/** Vòng `for (const start = Date.now(); Date.now() - start < N;)` hoặc `while (Date.now() - waitChromeStart < N)` chờ `/json` của CDP. */
export const LOOP = /Date\.now\(\) - (start|waitChromeStart) < (\d+)/g;
/** Khớp dòng import helper `launchChrome` từ `./e2e-chrome`. */
export const IMPORT_HELPER =
  /import\s*\{[^}]*\blaunchChrome\b[^}]*\}\s*from\s*["']\.\/e2e-chrome(?:\.js)?["']/;

/**
 * Kiểm tra mã nguồn của một script E2E:
 * Sau #1432, MỌI kịch bản E2E bắt buộc phải import launchChrome từ ./e2e-chrome và KHÔNG được còn vòng chờ chép tay (LOOP).
 */
export function checkScriptSource(name: string, src: string): void {
  expect(
    IMPORT_HELPER.test(src),
    `${name}: bắt buộc phải import launchChrome từ ./e2e-chrome (#1432)`,
  ).toBe(true);
  const waits = [...src.matchAll(LOOP)].map((m) => Number(m[2]));
  expect(waits.length, `${name} đã import launchChrome nhưng vẫn còn vòng chờ chép tay`).toBe(0);
}

/**
 * Ba tệp duy nhất trong họ kịch bản E2E không tự khởi chạy Chrome trực tiếp (#1432, #1440 review B):
 * - `e2e-chrome.ts`: nơi định nghĩa helper `launchChrome`, không tự import chính nó.
 * - `e2e-kit.ts`: thư viện hàm phụ trợ dùng chung (`listenWithRetry`, `killChrome`, `removeTmpDirs`...), không dựng Chrome.
 * - `e2e-all.ts`: bộ điều phối chạy tuần tự các kịch bản qua spawn child process `tsx`, không mở Chrome trực tiếp.
 */
export const EXCLUDED_E2E_FILES = new Map<string, string>([
  ["e2e-chrome.ts", "nơi định nghĩa helper launchChrome, không tự import chính nó"],
  ["e2e-kit.ts", "thư viện hàm phụ trợ (killChrome, listenWithRetry...), không dựng Chrome"],
  ["e2e-all.ts", "bộ điều phối chạy tuần tự các kịch bản qua child process, không dựng Chrome"],
]);

describe("E2E: hạn chờ Chrome mở CDP đủ cho khởi động lạnh (#694, #1432)", () => {
  const files = readdirSync(here).filter(
    (f) =>
      ((/^e2e.*\.ts$/.test(f) && !f.endsWith(".test.ts")) || f === "shot-layout.ts") &&
      !EXCLUDED_E2E_FILES.has(f),
  );

  it("danh sách loại trừ EXCLUDED_E2E_FILES chỉ gồm đúng 3 tệp không dựng Chrome (#1440 review B)", () => {
    expect([...EXCLUDED_E2E_FILES.keys()].sort()).toEqual([
      "e2e-all.ts",
      "e2e-chrome.ts",
      "e2e-kit.ts",
    ]);
  });

  it("có đủ 31 kịch bản E2E để kiểm (30 script e2e-*.ts + shot-layout.ts)", () => {
    expect(files.length).toBeGreaterThanOrEqual(31);
  });

  it(`helper e2e-chrome.ts có hạn chờ mặc định >= ${HELPER_MIN_WAIT_MS} ms (#1432)`, () => {
    const helperSrc = readFileSync(path.join(here, "e2e-chrome.ts"), "utf8");
    const match = helperSrc.match(/DEFAULT_CDP_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(HELPER_MIN_WAIT_MS);
  });

  for (const f of files) {
    it(`${f}: bắt buộc dùng helper launchChrome và không còn vòng chờ chép tay (#1432)`, () => {
      const src = readFileSync(path.join(here, f), "utf8");
      checkScriptSource(f, src);
    });
  }

  it("tất cả script E2E ngoài danh sách loại trừ đều đã import launchChrome (#1432)", () => {
    for (const f of files) {
      const src = readFileSync(path.join(here, f), "utf8");
      expect(IMPORT_HELPER.test(src), `${f} chưa import helper launchChrome từ ./e2e-chrome`).toBe(
        true,
      );
    }
  });

  it("bắt được trường hợp kịch bản mới ngoài danh sách loại trừ nhưng không import launchChrome (#1434, #1440 review B)", () => {
    const fakeNewScriptSrc = `
      // kịch bản e2e mới mở PR nhưng chưa chuyển sang launchChrome
      const chrome = spawn("google-chrome", ["--headless=new"]);
    `;
    expect(() => checkScriptSource("e2e-moi-chua-dung-helper.ts", fakeNewScriptSrc)).toThrow(
      /bắt buộc phải import launchChrome/,
    );
  });

  it("bắt được trường hợp chép tay: chưa import helper launchChrome dù có vòng chờ dài hay ngắn (#1434 review)", () => {
    const fakeNoHelperSrc = `
      // kịch bản này chép tay vòng chờ 30s
      for (const start = Date.now(); Date.now() - start < 30000;) {}
    `;
    expect(IMPORT_HELPER.test(fakeNoHelperSrc)).toBe(false);
    expect(() => checkScriptSource("fakeNoHelper", fakeNoHelperSrc)).toThrow(
      /bắt buộc phải import launchChrome/,
    );
  });

  it("bắt được trường hợp vừa import launchChrome vừa giữ vòng chờ chép tay (#1434 review)", () => {
    const fakeMixedSrc = `
      import { launchChrome } from "./e2e-chrome";
      for (const start = Date.now(); Date.now() - start < 15000;) {}
    `;
    expect(IMPORT_HELPER.test(fakeMixedSrc)).toBe(true);
    expect(() => checkScriptSource("fakeMixed", fakeMixedSrc)).toThrow(/vẫn còn vòng chờ chép tay/);
  });

  it("chấp nhận kịch bản chuẩn dùng launchChrome và không có vòng chờ chép tay", () => {
    const fakeGoodSrc = `
      import { launchChrome } from "./e2e-chrome";
      const launched = await launchChrome({ cdpPort: 9222, userDataDir: "/tmp" });
    `;
    expect(() => checkScriptSource("fakeGood", fakeGoodSrc)).not.toThrow();
  });
});
