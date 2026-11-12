import net from "node:net";
import { describe, expect, it } from "vitest";
import { freePort } from "./test-port";

describe("freePort", () => {
  it("trả về cổng hợp lệ mà bind lại được ngay", async () => {
    const port = await freePort();
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
