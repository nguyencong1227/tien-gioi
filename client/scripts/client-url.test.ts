import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findViteBin, resolveClientUrl } from "./client-url.mjs";
import { freePort } from "./free-port.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const helperUrl = pathToFileURL(path.join(here, "client-url.mjs")).href;

/** Có trả lời HTTP 2xx không. */
const reachable = async (url: string) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
};

describe("resolveClientUrl (địa chỉ client cho script Chrome / CDP)", () => {
  it("có --url: dùng đúng địa chỉ đó (bỏ dấu / cuối) sau khi nối được", async () => {
    const srv = http.createServer((_q, r) => r.end("ok"));
    await new Promise<void>((res) => srv.listen(0, "127.0.0.1", res));
    try {
      const port = (srv.address() as { port: number }).port;
      expect(await resolveClientUrl(`http://127.0.0.1:${port}/`)).toBe(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((res) => srv.close(() => res()));
    }
  });

  it("có --url nhưng không có gì lắng nghe: báo lỗi RÕ (chỉ cách khắc phục), không chờ vô hạn", async () => {
    const port = await freePort();
    await expect(resolveClientUrl(`http://127.0.0.1:${port}`)).rejects.toThrow(
      /Không nối được client ở .* Bỏ --url để script tự dựng Vite của cây này/,
    );
  });

  it("tìm được `vite` của cây này (tệp tồn tại)", () => {
    expect(fs.existsSync(findViteBin())).toBe(true);
  });

  it(
    "không --url: tự dựng Vite trên cổng trống KHÔNG PHẢI cổng của dev nào, phục vụ client của cây này, và TẮT khi script thoát tự nhiên",
    { timeout: 120_000 },
    async () => {
      // Tiến trình con: dựng Vite, in địa chỉ, rồi thoát tự nhiên khi stdin đóng (không gọi process.exit: kiểm đường `exit` dọn Vite)
      const code = `import { resolveClientUrl } from ${JSON.stringify(helperUrl)};
const url = await resolveClientUrl("");
console.log("URL=" + url);
process.stdin.resume();
process.stdin.on("end", () => {});`;
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (b) => (out += b));
      child.stderr.on("data", (b) => (err += b));
      const exited = new Promise<number | null>((res) => child.once("exit", (c) => res(c)));
      let url = "";
      try {
        for (let i = 0; i < 1000 && !url; i++) {
          const m = /URL=(http:\/\/127\.0\.0\.1:(\d+))/.exec(out);
          if (m) url = m[1];
          else await new Promise((r) => setTimeout(r, 100));
        }
        expect(url, `tiến trình con không in địa chỉ. stderr:\n${err}`).not.toBe("");
        const port = Number(new URL(url).port);
        expect([5173, 5183, 5193, 5203, 2567]).not.toContain(port);
        expect(await reachable(url)).toBe(true);
        // đúng client của cây này: trang chủ có thẻ gốc của game
        expect(await (await fetch(url)).text()).toContain("<div");
      } finally {
        child.stdin.end(); // -> vòng lặp sự kiện rỗng -> script thoát tự nhiên -> `exit` kill Vite
      }
      expect(await exited).toBe(0);
      let down = false;
      for (let i = 0; i < 50 && !down; i++) {
        down = !(await reachable(url));
        if (!down) await new Promise((r) => setTimeout(r, 100));
      }
      expect(down, "Vite phải tắt cùng script (không để mồ côi giữ cổng)").toBe(true);
    },
  );
});
