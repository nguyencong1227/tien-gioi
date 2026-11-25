import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { launchChrome } from "./chrome-launch.mjs";

// "Chrome giả": script Node nhận đúng các cờ Chrome (--remote-debugging-port, --user-data-dir) rồi hành xử theo FAKE_MODE:
//   ok         mở cổng sau FAKE_DELAY_MS, /json trả một page
//   ok-child   như ok, nhưng THÊM một tiến trình CON (cùng nhóm tiến trình) ghi pid vào FAKE_CHILD_PID: kiểm close() dọn CẢ NHÓM, không chỉ tiến trình Chrome (A ở #1474)
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
if (mode === "ok-child") {
  const cp = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  fs.writeFileSync(process.env.FAKE_CHILD_PID, String(cp.pid));
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
  for (const k of ["FAKE_MODE", "FAKE_COUNTER", "FAKE_DELAY_MS", "FAKE_CHILD_PID"])
    delete process.env[k];
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

  it("close() dọn CẢ NHÓM tiến trình: tiến trình CON của Chrome cũng chết (chrome.kill() đơn lẻ để lại tiến trình mồ côi)", async () => {
    const pidFile = path.join(dir, "child-pid");
    rmSync(pidFile, { force: true });
    setEnv({ FAKE_MODE: "ok-child", FAKE_DELAY_MS: "100", FAKE_CHILD_PID: pidFile });
    const h = await launchChrome({ name: "thu", bin, waitMs: 8000 });
    // pid con được ghi ngay khi Chrome giả chạy (trước khi mở cổng): phải có và đang sống
    const childPid = Number(readFileSync(pidFile, "utf8"));
    expect(childPid).toBeGreaterThan(1);
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    try {
      expect(alive(childPid), "tiến trình con phải đang sống trước close()").toBe(true);
      await h.close();
      // SIGKILL tới cả nhóm: con chết gần như ngay; chờ tối đa 3 s theo điều kiện
      for (let i = 0; i < 30 && alive(childPid); i++) await new Promise((r) => setTimeout(r, 100));
      expect(alive(childPid), "tiến trình CON vẫn sống sau close(): chưa dọn cả nhóm").toBe(false);
    } finally {
      if (alive(childPid)) process.kill(childPid, "SIGKILL"); // không để rò khi test đỏ
    }
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
