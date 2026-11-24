import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchChrome } from "./e2e-chrome";

/** Tìm một cổng TCP rảnh cục bộ. */
async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as net.AddressInfo).port;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

describe("e2e-chrome: helper dựng Chrome với chẩn đoán và tự thử lại (#1432)", () => {
  let tmpDir: string;
  const createdServers: http.Server[] = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "tg-e2e-chrome-test-"));
  });

  afterEach(async () => {
    for (const s of createdServers) {
      try {
        await new Promise<void>((r) => s.close(() => r()));
      } catch {
        /* bỏ qua */
      }
    }
    createdServers.length = 0;
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* bỏ qua */
    }
  });

  it("Ca 1: Chrome giả mở cổng CDP muộn -> thành công ở lần dựng đầu tiên", async () => {
    const port = await freePort();
    const fakeScript = path.join(tmpDir, "fake-chrome-delayed.js");

    // Script Node giả lập Chrome: sau 200 ms mở HTTP server tại cổng chỉ định và trả /json
    writeFileSync(
      fakeScript,
      `
      const http = require("node:http");
      const port = Number(process.argv[2]);
      setTimeout(() => {
        const server = http.createServer((req, res) => {
          if (req.url === "/json") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/1" }]));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        server.listen(port, "127.0.0.1");
      }, 200);
      setInterval(() => {}, 1000);
      `,
    );

    const logs: string[] = [];
    const launched = await launchChrome({
      cdpPort: port,
      userDataDir: path.join(tmpDir, "user-data"),
      executable: process.execPath,
      customArgs: (p) => [fakeScript, String(p)],
      timeoutMs: 3000,
      pollIntervalMs: 50,
      log: (m) => logs.push(m),
    });

    expect(launched.diag.attempts).toBe(1);
    expect(launched.webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${port}/devtools/page/1`);
    expect(logs).not.toContain("đã dựng lại Chrome lần 2");

    launched.kill();
  });

  it("Ca 2: Chrome giả chết ngay ở lần 1, thành công ở lần 2 -> ghi log 'đã dựng lại Chrome lần 2'", async () => {
    const port = await freePort();
    const fakeScript = path.join(tmpDir, "fake-chrome-retry.js");
    const markerFile = path.join(tmpDir, "attempt-marker.txt");

    // Lần 1: thấy chưa có markerFile -> in stderr, ghi markerFile rồi thoát với code 1 (chết sớm).
    // Lần 2: thấy đã có markerFile -> mở HTTP server lắng nghe /json.
    writeFileSync(
      fakeScript,
      `
      const fs = require("node:fs");
      const http = require("node:http");
      const port = Number(process.argv[2]);
      const marker = ${JSON.stringify(markerFile)};

      if (!fs.existsSync(marker)) {
        fs.writeFileSync(marker, "attempt-1-crashed");
        process.stderr.write("Fake crash on attempt 1\\n");
        process.exit(1);
      }

      const server = http.createServer((req, res) => {
        if (req.url === "/json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/2" }]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(port, "127.0.0.1");
      setInterval(() => {}, 1000);
      `,
    );

    const logs: string[] = [];
    const launched = await launchChrome({
      cdpPort: port,
      userDataDir: path.join(tmpDir, "user-data"),
      executable: process.execPath,
      customArgs: (p) => [fakeScript, String(p)],
      timeoutMs: 3000,
      pollIntervalMs: 50,
      log: (m) => logs.push(m),
    });

    expect(launched.diag.attempts).toBe(2);
    expect(launched.webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${port}/devtools/page/2`);
    expect(logs).toContain("đã dựng lại Chrome lần 2");

    launched.kill();
  });

  it("Ca 3: Chrome giả không bao giờ mở cổng -> thử lại 1 lần rồi ném lỗi có chẩn đoán chi tiết (thời gian, exitCode, stderr tail)", async () => {
    const port = await freePort();
    const fakeScript = path.join(tmpDir, "fake-chrome-fail.js");

    // Script Node giả lập: in nhiều dòng stderr rồi thoát mà không bao giờ mở HTTP server
    writeFileSync(
      fakeScript,
      `
      for (let i = 1; i <= 25; i++) {
        process.stderr.write("Stderr line " + i + "\\n");
      }
      process.exit(2);
      `,
    );

    const logs: string[] = [];
    let caughtError: Error | null = null;

    try {
      await launchChrome({
        cdpPort: port,
        userDataDir: path.join(tmpDir, "user-data"),
        executable: process.execPath,
        customArgs: (p) => [fakeScript, String(p)],
        timeoutMs: 300,
        pollIntervalMs: 50,
        log: (m) => logs.push(m),
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    const msg = caughtError!.message;

    // Phải có dòng log thử lại
    expect(logs).toContain("đã dựng lại Chrome lần 2");
    // Phải có thông tin thời gian chờ và số lần thử
    expect(msg).toMatch(/Không kết nối được Chrome DevTools sau \d+ ms \(đã thử 2 lần\)/);
    // Phải có exitCode
    expect(msg).toContain("exitCode: 2");
    // Phải in stderr đuôi (~20 dòng cuối)
    expect(msg).toContain("Stderr line 25");
    expect(msg).toContain("Stderr line 10");
  });

  it("Ca 4: Khi thử lại có thể cấp cổng mới qua allocPort", async () => {
    const port1 = await freePort();
    const port2 = await freePort();
    const fakeScript = path.join(tmpDir, "fake-chrome-port-switch.js");
    const markerFile = path.join(tmpDir, "marker-port.txt");

    writeFileSync(
      fakeScript,
      `
      const fs = require("node:fs");
      const http = require("node:http");
      const port = Number(process.argv[2]);
      const marker = ${JSON.stringify(markerFile)};

      if (!fs.existsSync(marker)) {
        fs.writeFileSync(marker, "first");
        process.exit(1);
      }

      const server = http.createServer((req, res) => {
        if (req.url === "/json") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/new" }]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(port, "127.0.0.1");
      setInterval(() => {}, 1000);
      `,
    );

    let allocCalled = false;
    const launched = await launchChrome({
      cdpPort: port1,
      userDataDir: path.join(tmpDir, "user-data"),
      executable: process.execPath,
      customArgs: (p) => [fakeScript, String(p)],
      timeoutMs: 2000,
      pollIntervalMs: 50,
      allocPort: () => {
        allocCalled = true;
        return port2;
      },
    });

    expect(allocCalled).toBe(true);
    expect(launched.cdpPort).toBe(port2);
    expect(launched.webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${port2}/devtools/page/new`);

    launched.kill();
  });

  it("Ca 5: Chrome giả còn sống nhưng mở cổng quá muộn (> timeoutMs) -> tiến trình 1 bị giết, tiến trình 2 thế chỗ thành công (#1434 review)", async () => {
    const port = await freePort();
    const fakeScript = path.join(tmpDir, "fake-chrome-hang.js");
    const markerFile = path.join(tmpDir, "attempt-marker-hang.txt");
    const pid1File = path.join(tmpDir, "pid1.txt");

    // Lần 1: ghi pid1, giữ tiến trình sống nhưng mở cổng sau tận 3000ms (> timeoutMs 400ms).
    // Lần 2: mở cổng ngay sau 50ms với URL khác biệt (/attempt-2).
    writeFileSync(
      fakeScript,
      `
      const fs = require("node:fs");
      const http = require("node:http");
      const port = Number(process.argv[2]);
      const marker = ${JSON.stringify(markerFile)};
      const pid1 = ${JSON.stringify(pid1File)};

      if (!fs.existsSync(marker)) {
        fs.writeFileSync(marker, "attempt-1-started");
        fs.writeFileSync(pid1, String(process.pid));
        setTimeout(() => {
          const srv = http.createServer((req, res) => {
            if (req.url === "/json") {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/attempt-1" }]));
            }
          });
          srv.listen(port, "127.0.0.1");
        }, 3000);
        setInterval(() => {}, 1000);
      } else {
        setTimeout(() => {
          const srv = http.createServer((req, res) => {
            if (req.url === "/json") {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:" + port + "/devtools/page/attempt-2" }]));
            }
          });
          srv.listen(port, "127.0.0.1");
        }, 50);
        setInterval(() => {}, 1000);
      }
      `,
    );

    const logs: string[] = [];
    const launched = await launchChrome({
      cdpPort: port,
      userDataDir: path.join(tmpDir, "user-data"),
      executable: process.execPath,
      customArgs: (p) => [fakeScript, String(p)],
      timeoutMs: 400,
      pollIntervalMs: 50,
      log: (m) => logs.push(m),
    });

    expect(launched.diag.attempts).toBe(2);
    // Khẳng định URL thuộc về lần 2, không phải của lần 1 trả lời chậm
    expect(launched.webSocketDebuggerUrl).toBe(`ws://127.0.0.1:${port}/devtools/page/attempt-2`);
    expect(logs).toContain("đã dựng lại Chrome lần 2");

    // Đọc PID của lần 1 và kiểm chứng tiến trình 1 ĐÃ CHẾT sau khi bị killChrome
    expect(existsSync(pid1File)).toBe(true);
    const pid1 = Number(readFileSync(pid1File, "utf8").trim());
    expect(Number.isInteger(pid1) && pid1 > 0).toBe(true);

    let pid1Alive = true;
    for (let k = 0; k < 20; k++) {
      try {
        process.kill(pid1, 0);
        await new Promise((r) => setTimeout(r, 25));
      } catch {
        pid1Alive = false;
        break;
      }
    }
    expect(pid1Alive, `Tiến trình Chrome lần 1 (PID ${pid1}) phải bị killChrome tiêu diệt`).toBe(
      false,
    );

    launched.kill();
  });
});
