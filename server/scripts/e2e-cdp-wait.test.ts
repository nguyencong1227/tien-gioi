// Giữ vòng chờ Chrome mở cổng CDP đủ dài trong MỌI script E2E (#694, #1432).
// Lần khởi động Chrome ĐẦU TIÊN trên một runner mới (hồ sơ, bộ nhớ đệm phông, lạnh) mất > 8 s: `e2e` (script đầu tiên của `e2e:all`)
// ĐỎ lần 1 ở đúng ~8,5 s ("page target không phản hồi") trong cả bốn lần chạy đủ trên runner, rồi XANH ở lần thử lại. Đây là bước dựng,
// không phải khẳng định, nên hạn rộng không làm lỏng kiểm tra nào; hạn ngắn chỉ gây đỏ giả.
// Sau #1432: các script dần chuyển sang helper `e2e-chrome.ts` với hạn chờ >= 30 s và cơ chế tự thử lại kèm chẩn đoán.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN_WAIT_MS = 15000;
const HELPER_MIN_WAIT_MS = 30000;
/** Vòng `for (const start = Date.now(); Date.now() - start < N;)` hoặc `while (Date.now() - waitChromeStart < N)` chờ `/json` của CDP. */
export const LOOP = /Date\.now\(\) - (start|waitChromeStart) < (\d+)/g;
/** Khớp dòng import helper `launchChrome` từ `./e2e-chrome`. */
export const IMPORT_HELPER =
  /import\s*\{[^}]*\blaunchChrome\b[^}]*\}\s*from\s*["']\.\/e2e-chrome["']/;

/**
 * Kiểm tra mã nguồn của một script E2E:
 * - Nếu đã import launchChrome: không được còn vòng chờ chép tay (LOOP).
 * - Nếu chưa chuyển đổi: phải có vòng chờ CDP >= MIN_WAIT_MS (15 s).
 */
export function checkScriptSource(name: string, src: string): void {
  if (IMPORT_HELPER.test(src)) {
    // Script đã chuyển sang helper: không được còn vòng chờ chép tay sót lại
    const waits = [...src.matchAll(LOOP)].map((m) => Number(m[2]));
    expect(waits.length, `${name} đã import launchChrome nhưng vẫn còn vòng chờ chép tay`).toBe(0);
    return;
  }
  const waits = [...src.matchAll(LOOP)].map((m) => Number(m[2]));
  for (const w of waits) {
    expect(w, `${name}: hạn chờ ${w} < ${MIN_WAIT_MS}`).toBeGreaterThanOrEqual(MIN_WAIT_MS);
  }
}

describe("E2E: hạn chờ Chrome mở CDP đủ cho khởi động lạnh (#694, #1432)", () => {
  const files = readdirSync(here).filter(
    (f) => /^e2e.*\.ts$/.test(f) && !f.endsWith(".test.ts") && f !== "e2e-chrome.ts",
  );

  it("có script E2E để kiểm", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it(`helper e2e-chrome.ts có hạn chờ mặc định >= ${HELPER_MIN_WAIT_MS} ms (#1432)`, () => {
    const helperSrc = readFileSync(path.join(here, "e2e-chrome.ts"), "utf8");
    const match = helperSrc.match(/DEFAULT_CDP_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(HELPER_MIN_WAIT_MS);
  });

  for (const f of files) {
    it(`${f}: dùng launchChrome (>= ${HELPER_MIN_WAIT_MS} ms, không còn vòng chép tay) hoặc có vòng chờ CDP >= ${MIN_WAIT_MS} ms`, () => {
      const src = readFileSync(path.join(here, f), "utf8");
      checkScriptSource(f, src);
    });
  }

  it("ít nhất phần lớn script có vòng chờ CDP hoặc dùng helper launchChrome (#1432)", () => {
    const withWait = files.filter((f) => {
      const src = readFileSync(path.join(here, f), "utf8");
      return IMPORT_HELPER.test(src) || new RegExp(LOOP.source).test(src);
    });
    expect(withWait.length).toBeGreaterThanOrEqual(18);
  });

  it("bắt được trường hợp ngụy tạo: chỉ ghi chuỗi trong chú thích nhưng vẫn giữ vòng chờ ngắn < 15 s (#1434 review)", () => {
    const fakeBadSrc = `
      // kịch bản này thử dùng launchChrome( sau khi sửa
      for (const start = Date.now(); Date.now() - start < 5000;) {}
    `;
    expect(IMPORT_HELPER.test(fakeBadSrc)).toBe(false);
    expect(() => checkScriptSource("fakeBad", fakeBadSrc)).toThrow();
  });

  it("bắt được trường hợp vừa import launchChrome vừa giữ vòng chờ chép tay (#1434 review)", () => {
    const fakeMixedSrc = `
      import { launchChrome } from "./e2e-chrome";
      for (const start = Date.now(); Date.now() - start < 15000;) {}
    `;
    expect(IMPORT_HELPER.test(fakeMixedSrc)).toBe(true);
    expect(() => checkScriptSource("fakeMixed", fakeMixedSrc)).toThrow();
  });
});
