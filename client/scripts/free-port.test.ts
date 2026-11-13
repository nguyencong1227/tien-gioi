import { describe, expect, it } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { freePort } from "./free-port.mjs";

const listen = (port: number) =>
  new Promise<net.Server>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
const close = (s: net.Server) => new Promise<void>((r) => s.close(() => r()));

describe("freePort (cổng trống cho script Chrome / CDP)", () => {
  it("trả số nguyên hợp lệ và bind được NGAY sau đó (nhiều lần liên tiếp)", async () => {
    for (let i = 0; i < 10; i++) {
      const p = await freePort();
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(1024);
      expect(p).toBeLessThanOrEqual(65535);
      const s = await listen(p);
      await close(s);
    }
  });

  it("không trả cổng đang có người nghe (mười cổng đang giữ mở, rồi xin thêm)", async () => {
    const held: net.Server[] = [];
    const heldPorts = new Set<number>();
    try {
      for (let i = 0; i < 10; i++) {
        const s = await listen(0);
        held.push(s);
        heldPorts.add((s.address() as net.AddressInfo).port);
      }
      for (let i = 0; i < 10; i++) expect(heldPorts.has(await freePort())).toBe(false);
    } finally {
      await Promise.all(held.map(close));
    }
  });
});

describe("script Chrome / CDP không tự chọn cổng ngẫu nhiên (nit của A ở #451)", () => {
  const dir = __dirname;
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith(".mjs") && f !== "free-port.mjs");

  it("có nhiều script dùng freePort (kiểm đúng thư mục)", () => {
    const using = scripts.filter((f) =>
      fs.readFileSync(path.join(dir, f), "utf8").includes("await freePort()"),
    );
    expect(using.length).toBeGreaterThanOrEqual(20);
  });

  it("không script nào còn `<CỔNG> = <số> + Math.floor(Math.random() * N)` (khoảng chồng nhau gây 'Không tìm thấy Chrome page target')", () => {
    const bad = scripts.filter((f) =>
      /(HTTP|CDP)_PORT\s*=\s*\d+\s*\+\s*Math\.floor\(\s*Math\.random\(\)/.test(
        fs.readFileSync(path.join(dir, f), "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });

  it("mọi script gọi `freePort()` đều nhập nó từ ./free-port.mjs (thiếu import là ném ReferenceError lúc chạy)", () => {
    for (const f of scripts) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (!src.includes("await freePort()")) continue;
      expect(src, f).toContain('import { freePort } from "./free-port.mjs";');
    }
  });
});
