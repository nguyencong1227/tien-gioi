// Giữ vòng chờ Chrome mở cổng CDP đủ dài trong MỌI script E2E (#694).
// Lần khởi động Chrome ĐẦU TIÊN trên một runner mới (hồ sơ, bộ nhớ đệm phông, lạnh) mất > 8 s: `e2e` (script đầu tiên của `e2e:all`)
// ĐỎ lần 1 ở đúng ~8,5 s ("page target không phản hồi") trong cả bốn lần chạy đủ trên runner, rồi XANH ở lần thử lại. Đây là bước dựng,
// không phải khẳng định, nên hạn rộng không làm lỏng kiểm tra nào; hạn ngắn chỉ gây đỏ giả.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN_WAIT_MS = 15000;
/** Vòng `for (const start = Date.now(); Date.now() - start < N;)` hoặc `while (Date.now() - waitChromeStart < N)` chờ `/json` của CDP. */
const LOOP = /Date\.now\(\) - (start|waitChromeStart) < (\d+)/g;

describe("E2E: hạn chờ Chrome mở CDP đủ cho khởi động lạnh (#694)", () => {
  const files = readdirSync(here).filter((f) => /^e2e.*\.ts$/.test(f) && !f.endsWith(".test.ts"));

  it("có script E2E để kiểm", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const f of files) {
    it(`${f}: mọi vòng chờ CDP >= ${MIN_WAIT_MS} ms`, () => {
      const src = readFileSync(path.join(here, f), "utf8");
      const waits = [...src.matchAll(LOOP)].map((m) => Number(m[2]));
      for (const w of waits) expect(w).toBeGreaterThanOrEqual(MIN_WAIT_MS);
    });
  }

  it("ít nhất phần lớn script có vòng chờ CDP (không để test này rỗng vì đổi cách viết)", () => {
    // Regex mới mỗi lần: cờ `g` của LOOP giữ `lastIndex` giữa các lần `.test`
    const withLoop = files.filter((f) =>
      new RegExp(LOOP.source).test(readFileSync(path.join(here, f), "utf8")),
    );
    expect(withLoop.length).toBeGreaterThanOrEqual(18);
  });
});
