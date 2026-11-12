// E2E THẬT hệ thống chất lượng đồ hoạ (M5, Issue #323): server Colyseus thật + Chrome headless + client đã build.
// Kiểm trong phiên chơi thật (không giả lập): lõi hiển thị ghi data-*, hồ sơ chất lượng ghi data-quality / class body.low-fx,
// bộ điều tốc nhận thời gian khung THẬT từ Phaser (lớp phủ ?perf=1 hiện FPS > 0), ô cài đặt Chất lượng đổi hồ sơ + lưu +
// nhớ sau khi tải lại, giảm chuyển động đổi hồ sơ, tiết kiệm pin lưu, và di cư `tg_low_fx=1` -> `tg_quality=low`.
// Chạy: `npm run build && npm run e2e:chat-luong -w server` (cần google-chrome).
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, shown, killChrome, removeTmpDirs } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 38000 + Math.floor(Math.random() * 2000);
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  out("=== E2E THẬT chất lượng đồ hoạ: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chatluong-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-chatluong-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  let failed: string | null = null;
  const ok = (m: string) => out(`  ✓ ${m}`);
  const must = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
  };

  try {
    chrome = spawn(
      "google-chrome",
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        `--remote-debugging-port=${CDP}`,
        `--user-data-dir=${chromeDir}`,
        "--window-size=1280,720",
        "about:blank",
      ],
      { stdio: "ignore", detached: true },
    );
    let targets: any[] = [];
    for (const start = Date.now(); Date.now() - start < 8000;) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP}/json`);
        if (res.ok) {
          targets = (await res.json()) as any[];
          break;
        }
      } catch {
        await sleep(150);
      }
    }
    const first = targets.find((t) => t.type === "page");
    if (!first?.webSocketDebuggerUrl) throw new Error("Không kết nối được Chrome DevTools");
    tab = await Tab.open("A", first.webSocketDebuggerUrl);
    const T = tab;

    let NAME = "Chat Luong"; // ca 3 dùng đạo hiệu khác: ca 2 vừa rời phòng, nhân vật cũ còn trong thời gian chờ nối lại
    const SECRET = "e2e_secret_chatluong_1111111";
    let scriptId: string | null = null;
    const setStorage = async (extra: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)}); ${extra}`,
      });
      scriptId = String(r.result?.identifier ?? "");
    };
    const login = async (url: string) => {
      await T.send("Page.navigate", { url });
      await T.waitFor(
        `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
        "form đăng nhập",
      );
      await T.ev(
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(NAME)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      await T.waitFor(
        `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
        "vào game thành công",
      );
    };
    const setQuality = (v: string) =>
      T.ev(
        `(() => { const s = document.getElementById('set-quality'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })(); 1`,
      );
    const setCheck = (id: string, on: boolean) =>
      T.ev(
        `(() => { const c = document.getElementById(${JSON.stringify(id)}); c.checked = ${on}; c.dispatchEvent(new Event('change')); })(); 1`,
      );
    const attr = (name: string) =>
      T.ev(`document.documentElement.getAttribute(${JSON.stringify(name)})`);
    const ls = (k: string) => T.ev(`localStorage.getItem(${JSON.stringify(k)})`);
    const overlay = async () =>
      String(await T.ev(`document.getElementById('perf-overlay')?.textContent ?? ''`));

    // ---------------- Ca 1: vào game thật, bộ điều tốc nhận khung THẬT, lớp phủ ?perf=1 ----------------
    out("\n--- Ca 1: lõi hiển thị + hồ sơ chất lượng + khung hình thật + lớp phủ ?perf=1 ---");
    await setStorage(""); // sạch: chưa có tg_quality / tg_low_fx
    await login(`http://127.0.0.1:${PORT}/?debug&perf=1`);
    must(
      (await attr("data-form")) === "desktop",
      `data-form phải là desktop (1280x720, chuột), thấy ${await attr("data-form")}`,
    );
    must(
      ["low", "mid", "high"].includes(String(await attr("data-quality"))),
      "data-quality hợp lệ",
    );
    must((await attr("data-reduce-motion")) === "0", "data-reduce-motion mặc định 0");
    ok(
      `html: data-form=${await attr("data-form")} data-quality=${await attr("data-quality")} data-reduce-motion=0`,
    );
    await T.waitFor(`!!document.getElementById('perf-overlay')`, "lớp phủ ?perf=1 hiện");
    await sleep(2500); // để bộ đo có ~150 khung
    const ov = await overlay();
    const fps = Number(/FPS (\d+)/.exec(ov)?.[1] ?? 0);
    must(
      fps >= 10 && fps <= 130,
      `FPS trên lớp phủ phải hợp lý (khung THẬT của Phaser), thấy "${ov.split("\n")[0]}"`,
    );
    ok(`lớp phủ nhận khung thật: ${ov.split("\n").slice(0, 2).join(" | ")}`);
    must(/chất lượng (low|mid|high) \(auto\)/.test(ov), "lớp phủ ghi bậc + chế độ auto");
    const lowFxClass = await T.ev(`document.body.classList.contains('low-fx')`);
    must(
      lowFxClass === ((await attr("data-quality")) === "low"),
      "class body.low-fx đúng bằng (bậc == low)",
    );
    ok("class body.low-fx khớp bậc Thấp");
    must((await ls("tg_quality")) === null, "chưa lưu tg_quality khi người chơi chưa chọn");

    // ---------------- Ca 2: cài đặt Chất lượng đổi hồ sơ, lưu, nhớ sau tải lại ----------------
    out("\n--- Ca 2: ô cài đặt Chất lượng + Tiết kiệm pin + Giảm chuyển động ---");
    await T.ev(`document.getElementById('btn-settings').click(); 1`);
    await T.waitFor(shown("set-quality"), "ô chọn chất lượng hiện trong Cài đặt");
    must(
      (await T.ev(`document.getElementById('set-quality').value`)) === "auto",
      "ô chọn mặc định là Tự động",
    );
    await setQuality("high");
    must((await attr("data-quality")) === "high", "chọn Cao -> data-quality=high");
    must((await ls("tg_quality")) === "high", "tg_quality=high đã lưu");
    must(!(await T.ev(`document.body.classList.contains('low-fx')`)), "bậc Cao: body.low-fx tắt");
    await sleep(700);
    must(/chất lượng high \(high\)/.test(await overlay()), "lớp phủ cập nhật: high (high)");
    must(
      String(await T.ev(`document.getElementById('set-quality-now').textContent`)).includes("Cao"),
      "dòng 'Đang dùng: Cao'",
    );
    ok("chọn tay Cao: data-quality, localStorage, class body, lớp phủ, dòng 'Đang dùng' đều đổi");

    await setQuality("low");
    must(
      (await attr("data-quality")) === "low" &&
        (await T.ev(`document.body.classList.contains('low-fx')`)) === true,
      "chọn Thấp -> low + body.low-fx",
    );
    ok("chọn tay Thấp: body.low-fx bật");

    await setCheck("set-reduced-motion", true);
    must(
      (await attr("data-reduce-motion")) === "1",
      "giảm chuyển động -> data-reduce-motion=1 (hồ sơ đọc lại)",
    );
    await setCheck("set-reduced-motion", false);
    must((await attr("data-reduce-motion")) === "0", "tắt giảm chuyển động -> 0");
    ok("giảm chuyển động đổi hồ sơ ngay (không cần tải lại)");

    await setCheck("set-battery-saver", true);
    must((await ls("tg_battery_saver")) === "1", "tiết kiệm pin được lưu");
    await setCheck("set-battery-saver", false);
    must((await ls("tg_battery_saver")) === "0", "tắt tiết kiệm pin được lưu");
    ok("tiết kiệm pin lưu / tắt");

    // chọn Vừa rồi tải lại: nhớ lựa chọn
    await setQuality("mid");
    await login(`http://127.0.0.1:${PORT}/?debug&perf=1`);
    must((await attr("data-quality")) === "mid", "tải lại: vẫn Vừa (đã lưu)");
    await T.ev(`document.getElementById('btn-settings').click(); 1`);
    await T.waitFor(shown("set-quality"), "ô chọn chất lượng hiện lại");
    must(
      (await T.ev(`document.getElementById('set-quality').value`)) === "mid",
      "ô chọn hiện đúng 'Vừa' sau khi tải lại",
    );
    ok("lựa chọn được nhớ sau khi tải lại");

    // ---------------- Ca 3: di cư tg_low_fx ----------------
    out("\n--- Ca 3: di cư cài đặt cũ tg_low_fx=1 ---");
    NAME = "Chat Luong Hai";
    await setStorage(
      `localStorage.removeItem("tg_quality"); localStorage.setItem("tg_low_fx", "1");`,
    );
    await login(`http://127.0.0.1:${PORT}/?debug`);
    must((await attr("data-quality")) === "low", "tg_low_fx=1 -> bậc Thấp");
    must((await ls("tg_quality")) === "low", "đã di cư: tg_quality=low");
    must(
      (await T.ev(`document.getElementById('perf-overlay')`)) === null,
      "không có ?perf thì KHÔNG có lớp phủ",
    );
    ok("tg_low_fx=1 di cư thành tg_quality=low; không ?perf thì không có lớp phủ");

    must(T.errors.length === 0, `Không được có lỗi console / exception: ${T.errors.join(" | ")}`);
    ok("0 lỗi console / exception trong toàn bộ E2E");
    out("\n=== E2E CHẤT LƯỢNG ĐỒ HOẠ ĐẠT ===");
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
    out(`\n✗ THẤT BẠI: ${failed}`);
  } finally {
    if (tab) {
      try {
        await tab.close();
      } catch {
        /* bỏ qua */
      }
    }
    killChrome(chrome);
    await new Promise<void>((r) => httpServer.close(() => r()));
    await gameServer.gracefullyShutdown(false);
    await removeTmpDirs(dataDir, chromeDir);
  }
  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
