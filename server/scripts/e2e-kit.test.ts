// Test cho phần dọn dẹp dùng chung của E2E (`killChrome`, `removeTmpDirs`): nguyên nhân thật của thư mục /tmp/tien-gioi-e2e-*-chrome-* bị sót
// là tiến trình CON của Chrome còn sống (chỉ giết tiến trình gốc) và ghi lại thư mục sau khi đã xoá.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { killChrome, listenWithRetry, removeTmpDirs, sleep } from "./e2e-kit";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("e2e-kit: dọn dẹp Chrome", () => {
  it("killChrome giết cả NHÓM tiến trình (tiến trình con cũng chết), không chỉ tiến trình gốc", async () => {
    // sh gốc (làm chủ nhóm vì detached) sinh một `sleep` con rồi in pid con ra stdout
    const parent = spawn("sh", ["-c", "sleep 60 & echo $!; wait"], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });
    const childPid = await new Promise<number>((resolve, reject) => {
      parent.stdout!.once("data", (d) => resolve(Number(String(d).trim())));
      parent.once("error", reject);
    });
    expect(Number.isInteger(childPid) && childPid > 0).toBe(true);
    expect(alive(parent.pid!)).toBe(true);
    expect(alive(childPid)).toBe(true);
    killChrome(parent);
    for (let k = 0; k < 40 && (alive(parent.pid!) || alive(childPid)); k++) await sleep(50);
    expect(alive(childPid)).toBe(false); // lỗi cũ: chỉ kill() gốc thì con còn sống
    expect(alive(parent.pid!)).toBe(false);
  });

  it("killChrome không ném lỗi khi null hoặc tiến trình đã thoát", async () => {
    expect(() => killChrome(null)).not.toThrow();
    const done = spawn("sh", ["-c", "exit 0"], { detached: true, stdio: "ignore" });
    await new Promise((r) => done.once("exit", r));
    expect(() => killChrome(done)).not.toThrow();
  });

  it("removeTmpDirs xoá cả thư mục có nội dung và không lỗi với thư mục không tồn tại", async () => {
    const a = mkdtempSync(path.join(os.tmpdir(), "tg-kit-test-"));
    mkdirSync(path.join(a, "sub"));
    writeFileSync(path.join(a, "sub", "f.txt"), "x");
    const missing = path.join(os.tmpdir(), "tg-kit-test-khong-ton-tai-" + Date.now());
    await removeTmpDirs(a, missing);
    expect(existsSync(a)).toBe(false);
  }, 10000);
});

/** Một cổng đang bị chiếm (giữ mở) và một hàm đóng. */
async function occupyPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const srv = net.createServer();
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as net.AddressInfo).port;
  return { port, close: () => new Promise<void>((r) => srv.close(() => r())) };
}
async function freeOne(): Promise<number> {
  const o = await occupyPort();
  await o.close();
  return o.port;
}

describe("e2e-kit: listenWithRetry", () => {
  it("cổng trống: nghe đúng cổng đó và trả về nó", async () => {
    const port = await freeOne();
    const server = http.createServer();
    try {
      expect(await listenWithRetry(server, port, { explicit: false, pick: () => 0 })).toBe(port);
      expect((server.address() as net.AddressInfo).port).toBe(port);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("cổng NGẪU NHIÊN bận: thử lại bằng cổng mới và trả về cổng thật", async () => {
    const busy = await occupyPort();
    const free = await freeOne();
    const server = http.createServer();
    try {
      const got = await listenWithRetry(server, busy.port, { explicit: false, pick: () => free });
      expect(got).toBe(free);
      expect((server.address() as net.AddressInfo).port).toBe(free);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await busy.close();
    }
  });

  it("cổng do người chạy CHỈ ĐỊNH bận: reject EADDRINUSE (không im lặng, không đổi cổng)", async () => {
    const busy = await occupyPort();
    const server = http.createServer();
    try {
      await expect(
        listenWithRetry(server, busy.port, { explicit: true, pick: () => 1 }),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await busy.close();
    }
  });

  it("net.Server + host (proxy TCP của E2E): nghe đúng địa chỉ, cổng bận thì thử cổng mới", async () => {
    const busy = await occupyPort(); // chiếm trên 127.0.0.1
    const free = await freeOne();
    const server = net.createServer();
    try {
      const got = await listenWithRetry(server, busy.port, {
        explicit: false,
        pick: () => free,
        host: "127.0.0.1",
      });
      expect(got).toBe(free);
      const addr = server.address() as net.AddressInfo;
      expect(addr.port).toBe(free);
      expect(addr.address).toBe("127.0.0.1");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await busy.close();
    }
  });

  it("hết số lần thử: reject (không lặp vô hạn)", async () => {
    const busy = await occupyPort();
    const server = http.createServer();
    let picks = 0;
    try {
      await expect(
        listenWithRetry(server, busy.port, {
          explicit: false,
          attempts: 3,
          pick: () => {
            picks++;
            return busy.port;
          },
        }),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(picks).toBe(2);
    } finally {
      await busy.close();
    }
  });
});
