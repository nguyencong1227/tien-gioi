import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { launchChrome } from "./chrome-launch.mjs";

// "Chrome giả": script Node nhận đúng các cờ Chrome (--remote-debugging-port, --user-data-dir) rồi hành xử theo FAKE_MODE:
//   ok         mở cổng sau FAKE_DELAY_MS, /json trả một page
//   die-first  lần chạy ĐẦU (đếm bằng tệp FAKE_COUNTER) in lỗi ra stderr rồi thoát mã 3; lần sau chạy như ok
//   die        luôn in lỗi ra stderr rồi thoát mã 3
//   hang       không bao giờ mở cổng
const FAKE = `#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const arg = (n) => (process.argv.find((a) => a.startsWith("--" + n + "=")) || "").split("=").slice(1).join("=");
const port = Number(arg("remote-debugging-port"));
const mode = process.env.FAKE_MODE;
let n = 0;
if (process.env.FAKE_COUNTER) {
  try { n = Number(fs.readFileSync(process.env.FAKE_COUNTER, "utf8")); } catch {}
  fs.writeFileSync(process.env.FAKE_COUNTER, String(n + 1));
}
if (mode === "die" || (mode === "die-first" && n === 0)) {
  console.error("loi gia: khong mo duoc man hinh");
  process.exit(3);
}
if (mode === "hang") setInterval(() => {}, 1000);
else setTimeout(() => {
  http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ type: "page", id: "p", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/p" }]));
  }).listen(port, "127.0.0.1");
}, Number(process.env.FAKE_DELAY_MS || 0));
`;

const dir = mkdtempSync(path.join(os.tmpdir(), "tg-test-chrome-launch-"));
const bin = path.join(dir, "fake-chrome");
writeFileSync(bin, FAKE);
chmodSync(bin, 0o755);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function setEnv(env: Record<string, string>) {
  for (const k of ["FAKE_MODE", "FAKE_COUNTER", "FAKE_DELAY_MS"]) delete process.env[k];
  Object.assign(process.env, env);
}

describe("chrome-launch: khởi động Chrome cho check-*.mjs ở nightly (#1458)", () => {
  it("thành công ngay: trả page, đúng một lần thử; close() dọn tiến trình và thư mục hồ sơ", async () => {
    setEnv({ FAKE_MODE: "ok", FAKE_DELAY_MS: "300" });
    const h = await launchChrome({ name: "thu", bin, waitMs: 8000 });
    expect(h.attempts).toBe(1);
    expect(h.page.id).toBe("p");
    expect(existsSync(h.tmp)).toBe(true);
    const pid = h.chrome.pid as number;
    await h.close();
    expect(existsSync(h.tmp)).toBe(false);
    expect(() => process.kill(pid, 0)).toThrow(); // tiến trình đã chết
  });

  it("lần đầu Chrome thoát sớm (mã 3) thì THỬ LẠI đúng một lần và thành công ở lần 2", async () => {
    const counter = path.join(dir, "counter-1");
    setEnv({ FAKE_MODE: "die-first", FAKE_COUNTER: counter, FAKE_DELAY_MS: "100" });
    const h = await launchChrome({ name: "thu", bin, waitMs: 8000 });
    expect(h.attempts).toBe(2);
    expect(readFileSync(counter, "utf8")).toBe("2");
    await h.close();
  });

  it("hỏng cả hai lần: ném lỗi có mã thoát + đuôi stderr của TỪNG lần, không treo chờ hết hạn khi Chrome đã thoát", async () => {
    setEnv({ FAKE_MODE: "die" });
    const t0 = Date.now();
    await expect(launchChrome({ name: "thu", bin, waitMs: 20000 })).rejects.toThrow(
      /sau 2 lần khởi động[\s\S]*\[lần 1\] Chrome thoát sớm \(mã 3[\s\S]*loi gia: khong mo duoc man hinh[\s\S]*\[lần 2\]/,
    );
    expect(Date.now() - t0).toBeLessThan(8000); // thoát sớm nên không chờ 20 s x 2
  });

  it("Chrome treo không mở cổng: hết hạn từng lần rồi ném lỗi nêu cổng CDP, đã dọn tiến trình", async () => {
    setEnv({ FAKE_MODE: "hang" });
    await expect(launchChrome({ name: "thu", bin, waitMs: 700 })).rejects.toThrow(
      /\[lần 1\] hết \d+ s mà cổng CDP \d+ chưa có page target[\s\S]*\[lần 2\]/,
    );
  });

  it("không có tệp thực thi: báo rõ không chạy được, không treo", async () => {
    setEnv({});
    await expect(
      launchChrome({ name: "thu", bin: path.join(dir, "khong-co-chrome"), waitMs: 3000 }),
    ).rejects.toThrow(/không chạy được|Chrome thoát sớm/);
  });
});
