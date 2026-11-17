// Test cho phần dọn dẹp dùng chung của E2E (`killChrome`, `removeTmpDirs`): nguyên nhân thật của thư mục /tmp/tien-gioi-e2e-*-chrome-* bị sót
// là tiến trình CON của Chrome còn sống (chỉ giết tiến trình gốc) và ghi lại thư mục sau khi đã xoá.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { killChrome, listenWithRetry, removeTmpDirs, sleep, getChromeGpuFlags } from "./e2e-kit";

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
    // freeOne() trả cổng trống tại THỜI ĐIỂM đóng, nhưng khe hở trước listen cho tiến trình khác (CẢ bộ
    // song song, nhiều worker freePort cùng cấp cổng highest-free) chiếm mất -> kit rơi vào pick(0), trả
    // cổng KHÁC (đỏ chập chờn, #1016). Chờ theo điều kiện: xin cổng mới + server mới, thử lại cho tới khi
    // kit thực sự nghe ĐÚNG cổng xin (loại trừ ca bị cướp — không phải lỗi kit; không bắt đỏ khi bị cướp).
    let server = http.createServer();
    let port = 0;
    let got = 0;
    for (let k = 0; k < 25; k++) {
      port = await freeOne();
      got = await listenWithRetry(server, port, { explicit: false, pick: () => 0 });
      if (got === port) break; // nghe đúng cổng xin -> thoả mãn
      await new Promise<void>((r) => server.close(() => r())); // đóng server đã bind cổng khác, thử lại
      server = http.createServer();
    }
    expect(got).toBe(port);
    expect((server.address() as net.AddressInfo).port).toBe(port);
    await new Promise<void>((r) => server.close(() => r()));
  }, 20000);

  it("cổng NGẪU NHIÊN bận: thử lại bằng cổng mới và trả về cổng thật", async () => {
    const busy = await occupyPort();
    // Hồ cổng trống: pick() xoay vòng qua các cổng thật trống, tránh một cổng bị cướp (free-bind dưới
    // contention, #1016) làm hết lượt thử. listenWithRetry vẫn chỉ retry khi EADDRINUSE; trả về cổng thật
    // đang nghe (không nhất thiết cổng đầu tiên được pick).
    const pool = await Promise.all(Array.from({ length: 6 }, () => freeOne()));
    let i = 0;
    const server = http.createServer();
    try {
      const got = await listenWithRetry(server, busy.port, {
        explicit: false,
        pick: () => pool[i++],
      });
      expect(pool).toContain(got);
      expect((server.address() as net.AddressInfo).port).toBe(got);
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
    // Hồ cổng trống tương tự ca "cổng NGẪU NHIÊN bận" (tránh free-bind bị cướp, #1016).
    const pool = await Promise.all(Array.from({ length: 6 }, () => freeOne()));
    let i = 0;
    const server = net.createServer();
    try {
      const got = await listenWithRetry(server, busy.port, {
        explicit: false,
        pick: () => pool[i++],
        host: "127.0.0.1",
      });
      expect(pool).toContain(got);
      const addr = server.address() as net.AddressInfo;
      expect(addr.port).toBe(got);
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

describe("e2e-kit: getChromeGpuFlags", () => {
  it("tôn trọng biến môi trường ép tắt GPU và CI", () => {
    const origEnv = { ...process.env };
    try {
      process.env.DISABLE_GPU = "1";
      delete process.env.CI;
      delete process.env.FORCE_GPU;
      expect(getChromeGpuFlags()).toEqual(["--disable-gpu"]);

      delete process.env.DISABLE_GPU;
      process.env.FORCE_SWIFTSHADER = "1";
      expect(getChromeGpuFlags()).toEqual([
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]);
      delete process.env.FORCE_SWIFTSHADER;

      process.env.CI = "true";
      expect(getChromeGpuFlags()).toEqual(["--disable-gpu"]);

      process.env.FORCE_GPU = "1";
      const flags = getChromeGpuFlags();
      if (existsSync("/dev/nvidia0")) {
        expect(flags).toContain("--enable-gpu");
        expect(flags).toContain("--use-gl=angle");
        expect(flags).toContain("--use-angle=vulkan");
      }
    } finally {
      process.env = origEnv;
    }
  });
});

describe("e2e-kit: ảnh chụp thường lệ KHÔNG bật theo E2E_LOG_DIR (hồi quy #704, #694)", () => {
  // `SHOTS` / `FAILURE_SHOTS` tính một lần lúc nạp mô-đun nên nạp lại với môi trường mong muốn
  const load = async (env: Record<string, string | undefined>) => {
    const keys = ["E2E_SHOTS", "E2E_LOG_DIR"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    try {
      vi.resetModules();
      return await import("./e2e-kit");
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  it("chỉ có E2E_LOG_DIR (e2e:all): ảnh thường lệ TẮT, ảnh chẩn đoán khi đỏ vào thư mục log", async () => {
    const kit = await load({ E2E_LOG_DIR: "/tmp/tg-log" });
    expect(kit.SHOTS).toBeUndefined();
    expect(kit.FAILURE_SHOTS).toBe(path.resolve("/tmp/tg-log"));
  });

  it("có E2E_SHOTS: cả hai trỏ vào E2E_SHOTS (dev xin chụp ảnh)", async () => {
    const kit = await load({ E2E_SHOTS: "/tmp/tg-shots", E2E_LOG_DIR: "/tmp/tg-log" });
    expect(kit.SHOTS).toBe(path.resolve("/tmp/tg-shots"));
    expect(kit.FAILURE_SHOTS).toBe(path.resolve("/tmp/tg-shots"));
  });

  it("không có biến nào: không chụp gì", async () => {
    const kit = await load({});
    expect(kit.SHOTS).toBeUndefined();
    expect(kit.FAILURE_SHOTS).toBeUndefined();
  });
});
