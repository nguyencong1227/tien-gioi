// E2E THẬT chống DÙNG KÉ + client KHÁC NGUỒN (QUYET_DINH_M3 mục 59.1, #1189): máy chủ `src/index.ts` THẬT chạy ở chế độ production (tiến trình riêng, như bản chạy thật) + Chrome headless.
// Vì sao cần: các e2e khác dựng `defineRooms` trực tiếp (không qua `index.ts`, không có kiểm Origin) và phục vụ client CÙNG nguồn, nên không bắt được lỗi ở lớp Origin / CORS.
// Lần đầu #1189 làm hỏng cả `npm run dev` lẫn app Android mà CI vẫn xanh: `/matchmake` bỏ `Access-Control-Allow-Credentials: true` trong khi colyseus.js luôn gọi với credentials,
// nên client khác nguồn không vào được phòng (chỉ lộ khi chạy thật bằng trình duyệt khác nguồn).
//
// Dựng: client build RIÊNG với `VITE_SERVER_URL=ws://127.0.0.1:<cổng máy chủ>` (giống bản app: client nói chuyện với máy chủ ở NGUỒN KHÁC), phục vụ cùng một bản build ở HAI cổng tĩnh:
//   - cổng A: nằm trong `CORS_ORIGINS` của máy chủ (như `https://localhost` của app Android) = nguồn ĐƯỢC PHÉP;
//   - cổng B: KHÔNG có trong danh sách (trang LẠ chép client về dùng ké máy chủ).
// Ba ca:
//  1. Cùng nguồn: mở thẳng máy chủ (nguồn mặc định `index.ts` phục vụ `client/dist`): vào game được.
//  2. Khác nguồn ĐƯỢC PHÉP (cổng A, credentials): vào game được, kết nối thật tới cổng máy chủ, 0 lỗi console.
//  3. Khác nguồn LẠ (cổng B): KHÔNG vào được game (màn đăng nhập báo lỗi) và cả ba đường `fetch /health`, `POST /matchmake` (credentials), `WebSocket` đều bị chặn.
// Ca 1 dùng `client/dist` mặc định (dựng nếu chưa có); ca 2-3 dùng bản build riêng vào thư mục tạm (mất thêm ~10 giây).
// Chạy: `npm run e2e:khac-nguon -w server` (cần google-chrome). Mất ~45 giây. Thoát 0 khi đạt, 1 khi sai.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Tab, sleep, removeTmpDirs, killChrome } from "./e2e-kit";
import { launchChrome } from "./e2e-chrome";
import { freePort } from "../src/test-port.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const serverDir = path.resolve(repoRoot, "server");
const clientDir = path.resolve(repoRoot, "client");
const clientDist = path.resolve(clientDir, "dist");
const out = (m: string) => console.log(m);
/** Bậc đồ hoạ GHIM (như các e2e khác): bậc "Tự động" đổi theo phần cứng. */
const QUALITY = process.env.E2E_QUALITY ?? "high";

/** Máy chủ tĩnh cho bản build khác nguồn: nghe 127.0.0.1 ở cổng `port`. */
function serveStatic(dir: string, port: number): Promise<http.Server> {
  const app = express();
  app.use(express.static(dir));
  app.get("*", (_req, res) => res.sendFile(path.join(dir, "index.html")));
  const srv = http.createServer(app);
  return new Promise((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

async function main() {
  out("=== E2E THẬT khác nguồn + chống dùng ké: máy chủ index.ts (production) + Chrome ===");
  const serverPort = await freePort();
  const portA = await freePort();
  const portB = await freePort();
  const CDP = await freePort();
  if (new Set([serverPort, portA, portB, CDP]).size < 4)
    throw new Error("cổng trùng nhau, chạy lại");
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kn-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kn-chrome-"));
  const crossDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-kn-dist-"));

  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  out(`- build client KHÁC NGUỒN (VITE_SERVER_URL=ws://127.0.0.1:${serverPort}) -> ${crossDir}`);
  execSync(`npx vite build --outDir ${JSON.stringify(crossDir)} --emptyOutDir`, {
    cwd: clientDir,
    stdio: "ignore",
    env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${serverPort}` },
  });

  const staticA = await serveStatic(crossDir, portA);
  const staticB = await serveStatic(crossDir, portB);
  const ORIGIN_A = `http://127.0.0.1:${portA}`;
  const ORIGIN_B = `http://127.0.0.1:${portB}`;

  const serverLogs: string[] = [];
  let server: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  try {
    // máy chủ THẬT (như `prod.sh`): production => máy cục bộ KHÔNG tự được phép, chỉ nguồn mặc định + CORS_ORIGINS + cùng nguồn
    server = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: serverDir,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(serverPort),
        DATA_DIR: dataDir,
        CORS_ORIGINS: ORIGIN_A,
        AUDIT_LOG: "off",
      },
    });
    const grab = (b: Buffer) => {
      for (const l of String(b).split("\n")) if (l.trim()) serverLogs.push(l.slice(0, 220));
      if (serverLogs.length > 40) serverLogs.splice(0, serverLogs.length - 40);
    };
    server.stdout?.on("data", grab);
    server.stderr?.on("data", grab);
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${serverPort}/health`);
        if (r.ok) break;
      } catch {
        /* chưa lên */
      }
      if (i > 120) throw new Error("máy chủ index.ts không lên sau 60 giây");
      await sleep(500);
    }
    out(
      `- máy chủ index.ts (production) cổng ${serverPort}; nguồn được phép thêm: ${ORIGIN_A}; nguồn LẠ: ${ORIGIN_B}`,
    );
    must(
      serverLogs.some((l) => l.includes("Kiểm nguồn (Origin)") && l.includes(ORIGIN_A)),
      "máy chủ in danh sách nguồn có CORS_ORIGINS",
    );

    const launched = await launchChrome({
      cdpPort: CDP,
      userDataDir: chromeDir,
      log: out,
    });
    chrome = launched.chrome;
    tab = await Tab.open("T", launched.webSocketDebuggerUrl);
    const T = tab;
    const ev = (e: string) => T.ev(e);
    await T.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tg_quality", ${JSON.stringify(QUALITY)});`,
    });

    /** Mở `url`, đăng nhập bằng đạo hiệu (chế độ cũ), trả về true nếu vào được game trong `waitMs`. */
    const login = async (url: string, name: string, waitMs: number): Promise<boolean> => {
      await T.send("Page.navigate", { url });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
        20000,
      );
      await ev(
        `const i = document.getElementById('login-name'); if (i) i.value = ${JSON.stringify(name)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      try {
        await T.waitFor(
          `!document.getElementById('ui')?.hidden && !!window.__scene?.room`,
          "vào game",
          waitMs,
        );
        return true;
      } catch {
        return false;
      }
    };

    out("\n--- Ca 1: cùng nguồn (mở thẳng máy chủ, nguồn mặc định) ---");
    const e0 = T.errors.length;
    must(
      await login(`http://127.0.0.1:${serverPort}/?debug=1`, "Cung Nguon", 25000),
      "ca 1: client CÙNG nguồn vào được game",
    );
    must(T.errors.length === e0, `ca 1: lỗi console: ${JSON.stringify(T.errors.slice(e0))}`);
    ok("cùng nguồn: vào game được, 0 lỗi console");

    out("\n--- Ca 2: khác nguồn ĐƯỢC PHÉP (CORS_ORIGINS) có credentials ---");
    const e1 = T.errors.length;
    must(
      await login(`${ORIGIN_A}/?debug=1`, "Khac Nguon A", 25000),
      "ca 2: client KHÁC nguồn nhưng được phép KHÔNG vào được game (lỗi kiểu thiếu Allow-Credentials)",
    );
    const conn = String(await ev(`window.__scene.room.connection?.transport?.ws?.url ?? ''`));
    must(
      conn.includes(`:${serverPort}`) && !conn.includes(`:${portA}`),
      `ca 2: kết nối thật tới cổng máy chủ khác nguồn (${conn})`,
    );
    must(T.errors.length === e1, `ca 2: lỗi console: ${JSON.stringify(T.errors.slice(e1))}`);
    ok(`khác nguồn được phép: vào game được qua ${conn}, 0 lỗi console`);

    out("\n--- Ca 3: khác nguồn LẠ (trang chép client về dùng ké) ---");
    const entered = await login(`${ORIGIN_B}/?debug=1`, "Khac Nguon B", 7000);
    must(!entered, "ca 3: trang LẠ vào được game (máy chủ không chặn nguồn lạ)");
    const err = String(await ev(`document.getElementById('login-err')?.textContent ?? ''`));
    must(err.trim() !== "", "ca 3: màn đăng nhập phải báo lỗi (không im lặng)");
    ok(`trang lạ không vào được game; màn đăng nhập báo: "${err.trim()}"`);
    await ev(
      `window.__probe = null; (async () => { const T = 'http://127.0.0.1:${serverPort}'; const r = {}; try { const x = await fetch(T + '/health'); r.health = 'http ' + x.status; } catch { r.health = 'chan'; } try { const x = await fetch(T + '/matchmake/joinOrCreate/world', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }); r.matchmake = 'http ' + x.status; } catch { r.matchmake = 'chan'; } r.ws = await new Promise((res) => { try { const w = new WebSocket('ws://127.0.0.1:${serverPort}/x'); w.onopen = () => { w.close(); res('MO'); }; w.onerror = () => res('tu choi'); setTimeout(() => res('het gio'), 5000); } catch { res('loi'); } }); window.__probe = r; })(); 1`,
    );
    await T.waitFor(`!!window.__probe`, "kết quả dò từ trang lạ", 15000);
    const probe = JSON.parse(String(await ev(`JSON.stringify(window.__probe)`))) as {
      health: string;
      matchmake: string;
      ws: string;
    };
    out(`- dò từ trang lạ: ${JSON.stringify(probe)}`);
    must(probe.health === "chan", `ca 3: /health từ trang lạ phải bị chặn (${probe.health})`);
    must(probe.matchmake === "chan", `ca 3: /matchmake từ trang lạ bị chặn (${probe.matchmake})`);
    must(probe.ws === "tu choi", `ca 3: WebSocket từ trang lạ bị từ chối (${probe.ws})`);
    ok("fetch /health, POST /matchmake (credentials) và WebSocket từ trang lạ đều bị chặn");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ THẤT BẠI: ${failed}`);
    if (tab?.errors.length) console.error(`  lỗi console: ${JSON.stringify(tab.errors.slice(-6))}`);
    if (serverLogs.length)
      console.error(`  [MÁY CHỦ]:\n    ${serverLogs.slice(-8).join("\n    ")}`);
    try {
      await tab?.shot("khac-nguon-that-bai", { onFailure: true });
    } catch {
      /* tab đã đóng */
    }
  } finally {
    tab?.close();
    killChrome(chrome);
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGKILL"); // cả nhóm: `npx` -> `tsx` -> node (kill riêng npx để máy chủ sống tiếp giữ cổng)
      } catch {
        server.kill("SIGKILL");
      }
    }
    for (const s of [staticA, staticB]) await new Promise<void>((r) => s.close(() => r()));
    await removeTmpDirs(dataDir, chromeDir, crossDir);
  }
  if (failed) process.exit(1);
  out("\n=== E2E KHÁC NGUỒN + CHỐNG DÙNG KÉ ĐẠT ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
