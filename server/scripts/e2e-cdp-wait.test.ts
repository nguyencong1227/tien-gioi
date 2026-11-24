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
const LOOP = /Date\.now\(\) - (start|waitChromeStart) < (\d+)/g;

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
    it(`${f}: mọi vòng chờ CDP >= ${MIN_WAIT_MS} ms (hoặc đã chuyển sang helper launchChrome)`, () => {
      const src = readFileSync(path.join(here, f), "utf8");
      if (src.includes("launchChrome(")) {
        expect(src).toContain("launchChrome");
        return;
      }
      const waits = [...src.matchAll(LOOP)].map((m) => Number(m[2]));
      for (const w of waits) expect(w).toBeGreaterThanOrEqual(MIN_WAIT_MS);
    });
  }

  it("ít nhất phần lớn script có vòng chờ CDP hoặc dùng helper launchChrome (#1432)", () => {
    const withWait = files.filter((f) => {
      const src = readFileSync(path.join(here, f), "utf8");
      return src.includes("launchChrome(") || new RegExp(LOOP.source).test(src);
    });
    expect(withWait.length).toBeGreaterThanOrEqual(18);
  });
});
