import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import { freePort, listenWithRetry } from "./test-port";

describe("freePort", () => {
  it("trả về cổng hợp lệ mà bind lại được ngay trên host mặc định (::)", async () => {
    const port = await freePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer();
      srv.once("error", reject);
      srv.listen(port, "::", () => srv.close(() => resolve()));
    });
  });

  it("hỗ trợ chỉ định host cụ thể 127.0.0.1", async () => {
    const port = await freePort("127.0.0.1");
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThan(65536);
    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer();
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve()));
    });
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
