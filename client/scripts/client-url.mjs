/* global fetch, setTimeout, AbortSignal */
// Địa chỉ client cho các script Chrome / CDP (`check-*.mjs`, `snap-*.mjs`).
// Trước đây mỗi script mặc định nối `http://127.0.0.1:5183` (cổng Vite của dev B): dev khác chạy script ở cây của mình lại kiểm nhầm
// mã của B (hoặc "Cảnh không sẵn sàng" / chờ hết giờ khi B không bật Vite; nit của A ở lượt 447). Nay:
//  - có `--url <địa chỉ>`: dùng đúng địa chỉ đó (client đang chạy sẵn, kể cả của người khác), thử nối trước và báo lỗi RÕ nếu không nối được;
//  - không có `--url`: tự dựng Vite CỦA CÂY NÀY trên cổng trống (`freePort()`, không đụng cổng `.env.local` của ai), chờ sẵn sàng rồi trả địa chỉ;
//    Vite tự tắt khi script thoát (kể cả `process.exit`, lỗi chưa bắt, Ctrl+C, SIGTERM của `timeout`). Chỉ còn mồ côi nếu script bị SIGKILL.
// Dùng: `const BASE_URL = await resolveClientUrl(argOf("--url", ""));`
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..");
const repoRoot = path.resolve(clientDir, "..");

/** Đường dẫn thật của `vite` (npm workspaces thường nâng lên `node_modules` gốc; thử cả của `client/`). */
export function findViteBin() {
  for (const p of [
    path.join(repoRoot, "node_modules", ".bin", "vite"),
    path.join(clientDir, "node_modules", ".bin", "vite"),
  ]) {
    if (fs.existsSync(p)) return fs.realpathSync(p);
  }
  throw new Error(
    "Không thấy `vite` trong node_modules (chạy `npm install` ở gốc repo), hoặc truyền --url tới client đang chạy.",
  );
}

/** Có trả lời HTTP 2xx trong `ms` mili giây không (không ném lỗi). */
async function reachable(url, ms) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `explicit` rỗng -> tự dựng Vite của cây này; khác rỗng -> dùng địa chỉ đó sau khi kiểm nối được.
 * @param {string} explicit giá trị `--url` ("" nếu không truyền)
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string>} địa chỉ gốc, không có dấu `/` ở cuối
 */
export async function resolveClientUrl(explicit = "", opts = {}) {
  if (explicit) {
    const url = explicit.replace(/\/+$/, "");
    if (!(await reachable(url, 5000)))
      throw new Error(
        `Không nối được client ở ${url}: chưa chạy Vite (\`npm run dev -w client\`) hay sai cổng? Bỏ --url để script tự dựng Vite của cây này.`,
      );
    return url;
  }
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      findViteBin(),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
      "--clearScreen",
      "false",
    ],
    {
      cwd: clientDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    },
  );
  let tail = "";
  const keep = (b) => {
    tail = (tail + b.toString()).slice(-2000);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  // Không giữ vòng lặp sự kiện: script kết thúc tự nhiên (không `process.exit`) vẫn thoát được, rồi `exit` ở dưới tắt Vite.
  child.unref();
  child.stdout.unref();
  child.stderr.unref();
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const stop = () => {
    if (!exited) child.kill("SIGTERM");
  };
  process.on("exit", stop);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => {
      stop();
      process.exit(128 + (sig === "SIGINT" ? 2 : 15));
    });
  }
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (exited)
      throw new Error(
        `Vite của cây này thoát sớm (cổng ${port}):\n${tail.trim() || "(không có đầu ra)"}`,
      );
    if (await reachable(url, 1000)) return url;
    await new Promise((r) => setTimeout(r, 150));
  }
  stop();
  throw new Error(
    `Vite của cây này chưa sẵn sàng sau ${Math.round(timeoutMs / 1000)} giây (cổng ${port}):\n${tail.trim() || "(không có đầu ra)"}`,
  );
}
