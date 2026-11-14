import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import { freePort, listenWithRetry } from "./test-port";

/**
 * Bind thử `port` trên `host` rồi đóng ngay: `true` nếu bind được, `false` nếu EADDRINUSE (lỗi khác thì ném).
 * Giữa lúc `freePort` đóng cổng và lúc test bind lại, một tệp vitest KHÁC chạy song song có thể xin đúng cổng đó (đúng cái đua mà `listenWithRetry` sinh ra để chịu):
 * nên "cổng freePort trả về bind lại được" chỉ kiểm bằng nhiều lần thử, không bằng đúng một lần (đỏ chập chờn do máy chạy song song, B báo ở #614 15/11/2026).
 */
function tryBind(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", (err: NodeJS.ErrnoException) =>
      err.code === "EADDRINUSE" ? resolve(false) : reject(err),
    );
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

/** Xin `freePort` và bind lại được trong tối đa `tries` lần (mỗi lần xin cổng MỚI); trả về cổng đã bind được, hoặc ném lỗi nếu cả `tries` lần đều EADDRINUSE. */
async function bindableWithin(host: string | undefined, tries = 5): Promise<number> {
  for (let i = 0; i < tries; i++) {
    const port = await freePort(host);
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
    if (await tryBind(port, host ?? "::")) return port;
  }
  throw new Error(`freePort(${host ?? "mặc định"}) không cho cổng bind lại được sau ${tries} lần`);
}

describe("freePort", () => {
  it("trả về cổng hợp lệ mà bind lại được ngay trên host mặc định (::), chịu được cổng bị tệp song song giành mất (thử lại tối đa 5 lần)", async () => {
    await bindableWithin(undefined);
  });

  it("hỗ trợ chỉ định host cụ thể 127.0.0.1 (cũng thử lại khi cổng bị giành mất)", async () => {
    await bindableWithin("127.0.0.1");
  });

  it("tryBind: cổng đang bận trả `false` (kiểm công cụ kiểm tra, không để các ca trên xanh giả)", async () => {
    const held = net.createServer();
    await new Promise<void>((resolve) => held.listen(0, "127.0.0.1", () => resolve()));
    const port = (held.address() as net.AddressInfo).port;
    try {
      await expect(tryBind(port, "127.0.0.1")).resolves.toBe(false);
    } finally {
      await new Promise<void>((resolve) => held.close(() => resolve()));
    }
  });

  it("nhiều lần gọi song song cho cổng khác nhau", async () => {
    const ports = await Promise.all(Array.from({ length: 30 }, () => freePort()));
    expect(new Set(ports).size).toBeGreaterThan(25);
  });
});

describe("listenWithRetry", () => {
  it("thành công ngay lần đầu: trả về đúng cổng đã listen", async () => {
    const listenMock = vi.fn().mockResolvedValue(undefined);
    const fakeServer = { listen: listenMock };

    const port = await listenWithRetry(fakeServer);
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(listenMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith(port);
  });

  it("tự động thử lại khi gặp lỗi EADDRINUSE ở lần đầu", async () => {
    const eaddrinuseErr = new Error("listen EADDRINUSE: address already in use :::35000");
    (eaddrinuseErr as any).code = "EADDRINUSE";

    const listenMock = vi
      .fn()
      .mockRejectedValueOnce(eaddrinuseErr)
      .mockResolvedValueOnce(undefined);

    const fakeServer = { listen: listenMock };

    const port = await listenWithRetry(fakeServer, 3);
    expect(Number.isInteger(port)).toBe(true);
    expect(listenMock).toHaveBeenCalledTimes(2);
    // Cổng lần 2 phải khác cổng lần 1 (hoặc độc lập)
    const portAttempt1 = listenMock.mock.calls[0][0];
    const portAttempt2 = listenMock.mock.calls[1][0];
    expect(port).toBe(portAttempt2);
    expect(typeof portAttempt1).toBe("number");
  });

  it("ném lỗi ngay lập tức nếu không phải lỗi EADDRINUSE (ví dụ EACCES)", async () => {
    const otherErr = new Error("permission denied");
    (otherErr as any).code = "EACCES";

    const listenMock = vi.fn().mockRejectedValue(otherErr);
    const fakeServer = { listen: listenMock };

    await expect(listenWithRetry(fakeServer, 3)).rejects.toThrow("permission denied");
    expect(listenMock).toHaveBeenCalledTimes(1);
  });

  it("ném lỗi nếu tất cả các lần thử đều bị EADDRINUSE vượt quá maxRetries", async () => {
    const eaddrinuseErr = new Error("EADDRINUSE");
    (eaddrinuseErr as any).code = "EADDRINUSE";

    const listenMock = vi.fn().mockRejectedValue(eaddrinuseErr);
    const fakeServer = { listen: listenMock };

    await expect(listenWithRetry(fakeServer, 3)).rejects.toThrow("EADDRINUSE");
    expect(listenMock).toHaveBeenCalledTimes(3);
  });
});
