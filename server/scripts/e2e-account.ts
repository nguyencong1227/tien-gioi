// E2E THẬT luồng tài khoản (M3.3): Chrome headless + CDP điều khiển giao diện thật (client/dist), server thật
// `AUTH_MODE=account` (tsx src/index.ts) với thư mục dữ liệu tạm. Luồng: đăng nhập sai -> đăng ký -> mã khôi phục -> đạo
// hiệu -> vào game -> tải lại trang (vào thẳng bằng token) -> đăng xuất -> đăng nhập lại -> quên mật khẩu bằng mã -> nhận
// nhân vật cũ cùng chân linh. Thoát 0 khi đạt, 1 khi sai; không ghi vào `server/data/players` thật.
//
// Chạy: `npm run build && npm run e2e:tai-khoan` (cần google-chrome; client/dist phải là bản build mới).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { shown, getChromeGpuFlags } from "./e2e-kit";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 36000 + Math.floor(Math.random() * 4000);
const CDP = 9500 + Math.floor(Math.random() * 400);
const SHOTS = process.env.E2E_SHOTS; // thư mục lưu ảnh chụp (tuỳ chọn)
const data = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-acc-data-"));
const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-acc-chrome-"));
const sha1 = (s: string) =>
  createHash("sha1").update(s.normalize("NFC").toLowerCase()).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const out = (m: string) => console.log(m);

// Nhân vật cũ (tên + mã bí mật) và chân linh cũ để thử "nhận nhân vật cũ"
const OLD = "Co Nhan Cu",
  OLD_SECRET = "0123456789abcdef0123456789abcdef";
const now = new Date().toISOString();
mkdirSync(path.join(data, "souls"), { recursive: true });
writeFileSync(
  path.join(data, `${sha1(OLD)}.json`),
  JSON.stringify({
    name: OLD,
    secretHash: sha256(OLD_SECRET),
    realm: 1,
    tier: 2,
    exp: 5,
    coin: 10,
    createdAt: now,
    updatedAt: now,
  }),
);
writeFileSync(
  path.join(data, "souls", `${sha1(OLD.normalize("NFC").toLowerCase())}.json`),
  JSON.stringify({
    v: 1,
    id: OLD.toLowerCase(),
    kiep: 3,
    duyen: 17,
    duyenTotal: 17,
    unlocks: {},
    origins: ["pham_gia"],
    best: { step: 14, realm: 1, tier: 2 },
    lastCreditedLife: "",
    history: [],
    createdAt: now,
    updatedAt: now,
  }),
);
const filesBefore = readdirSync(path.join(REPO, "server/data/players")).length;

const server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: REPO + "/server",
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: data,
    AUTH_MODE: "account",
    NODE_ENV: "production",
    TRUST_PROXY: "1",
    PATH: process.env.PATH,
  },
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    ...getChromeGpuFlags(),
    `--remote-debugging-port=${CDP}`,
    `--user-data-dir=${chromeDir}`,
    "--window-size=1280,720",
    "about:blank",
  ],
  { detached: true, stdio: "ignore" },
);
const killAll = () => {
  for (const p of [server, chrome]) {
    try {
      process.kill(-(p.pid as number), "SIGKILL");
    } catch {
      /* bỏ qua: thử lại / đã chết */
    }
  }
};
let ws!: WebSocket;
const errors: string[] = [];
let failed = null;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
    } catch {
      /* bỏ qua: thử lại / đã chết */
    }
    await sleep(500);
  }
  const health = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  if (health.authMode !== "account")
    throw new Error("server không ở chế độ account: " + JSON.stringify(health));
  let targets = [];
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
      if (targets.length) break;
    } catch {
      /* bỏ qua: thử lại / đã chết */
    }
    await sleep(250);
  }
  ws = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  let id = 0;
  const pending = new Map<number, (d: any) => void>();
  ws.on("message", (m) => {
    const d = JSON.parse(String(m));
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)!(d);
      pending.delete(d.id);
      return;
    }
    if (d.method === "Runtime.exceptionThrown")
      errors.push("EXC " + JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    if (d.method === "Runtime.consoleAPICalled") {
      const t = d.params.type,
        txt = d.params.args.map((a: any) => a.value ?? a.description).join(" ");
      if (t === "error") errors.push("CONSOLE-ERROR " + txt.slice(0, 300));
      if (t === "warning" && /onMessage\(\) not registered|unhandled/.test(txt))
        errors.push("WARN " + txt.slice(0, 200));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expr: string): Promise<any> => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error("evaluate: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  const waitFor = async (expr: string, ms = 10000, label = expr) => {
    const end = Date.now() + ms;
    for (;;) {
      try {
        if (await ev(expr)) return true;
      } catch {
        /* bỏ qua: thử lại / đã chết */
      }
      if (Date.now() > end) throw new Error("hết giờ chờ: " + label);
      await sleep(100);
    }
  };
  const shot = async (f: string) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(SHOTS, f), Buffer.from(r.result.data, "base64"));
  };
  const step = (n: string, m: string) => out(`  ✓ [${n}] ${m}`);
  const visible = (view: string) => shown(`auth-view-${view}`); // thấy thật, không chỉ `!hidden`
  const fill = (idEl: string, v: string) =>
    ev(
      `(() => { const e = document.getElementById(${JSON.stringify(idEl)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`,
    );
  const click = (idEl: string) => ev(`document.getElementById(${JSON.stringify(idEl)}).click(); 1`);
  const submit = (idEl: string) =>
    ev(`document.getElementById(${JSON.stringify(idEl)}).requestSubmit(); 1`);
  const inGame = async (name: string, label: string) => {
    await waitFor(
      `!document.getElementById('ui')?.hidden && !!document.querySelector('canvas') && !!document.getElementById('hud-name')?.textContent`,
      12000,
      "HUD game " + label,
    );
    const n = await ev(`document.getElementById('hud-name').textContent`);
    if (!n.includes(name)) throw new Error(`HUD tên "${n}" khác "${name}"`);
    return n;
  };
  const logoutAndReload = async () => {
    const t0 = await ev(`performance.timeOrigin`);
    await ev(`document.getElementById('btn-logout').click(); 1`);
    await waitFor(`performance.timeOrigin !== ${t0}`, 10000, "trang tải lại sau đăng xuất");
    await waitFor(visible("login"), 10000, "màn hình đăng nhập sau đăng xuất");
  };
  const text = (idEl: string) =>
    ev(`document.getElementById(${JSON.stringify(idEl)})?.textContent || ''`);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: `http://localhost:${PORT}/?debug` });

  // 1. Phát hiện chế độ account từ /health: màn hình đăng nhập, KHÔNG có ô tên cũ / link chế độ cũ
  await waitFor(visible("login"), 10000, "màn hình đăng nhập (authMode=account)");
  if (!(await ev(`document.getElementById('auth-view-legacy').hidden`)))
    throw new Error("ô tên cũ vẫn hiện ở chế độ account");
  step("1", "authMode=account => màn hình đăng nhập, ô tên cũ ẩn");

  // 2. Đăng nhập sai: báo lỗi chung, không lộ tên nào có thật
  await fill("auth-login-user", "khong_ton_tai");
  await fill("auth-login-pass", "mat-khau-sai-roi");
  await submit("auth-login-form");
  await waitFor(
    `document.getElementById('auth-login-err').textContent.length > 0`,
    5000,
    "lỗi đăng nhập",
  );
  const e1 = await text("auth-login-err");
  if (!/không chính xác/.test(e1)) throw new Error("lỗi đăng nhập lạ: " + e1);
  step("2", `đăng nhập sai báo: "${e1}"`);

  // 3. Đăng ký -> mã khôi phục (bắt tick xác nhận) -> đạo hiệu -> vào game
  await click("link-to-register");
  await waitFor(visible("register"), 3000, "màn đăng ký");
  await fill("auth-reg-user", "kiem_tu_01");
  await fill("auth-reg-pass", "mat-khau-dai-du-1");
  await submit("auth-reg-form");
  await waitFor(visible("recovery"), 8000, "màn mã khôi phục");
  const code1 = (await text("auth-recovery-code-val")).trim();
  if (!/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/.test(code1))
    throw new Error("mã khôi phục lạ: " + code1);
  if (!(await ev(`document.getElementById('auth-recovery-continue-btn').disabled`)))
    throw new Error("nút Tiếp tục không bị khoá trước khi tick");
  await shot("1-recovery.png");
  await click("auth-recovery-confirm-cb");
  await waitFor(
    `!document.getElementById('auth-recovery-continue-btn').disabled`,
    2000,
    "mở nút Tiếp tục",
  );
  await click("auth-recovery-continue-btn");
  await waitFor(visible("character"), 3000, "màn đạo hiệu");
  step("3a", `đăng ký ok, mã khôi phục ${code1}, bắt tick xác nhận mới cho đi tiếp`);
  await fill("auth-char-name", "Kiem Tu Mot");
  await submit("auth-char-form");
  const n1 = await inGame("Kiem Tu Mot", "sau khi tạo đạo hiệu");
  await shot("2-ingame.png");
  step("3b", `tạo đạo hiệu và vào game, HUD: "${n1}"`);

  // 4. Mở lại tab (tải lại trang = rớt mạng bất thường): vào thẳng bằng token, không phải đăng nhập lại
  await send("Page.reload");
  const n2 = await inGame("Kiem Tu Mot", "sau khi tải lại");
  step("4", `tải lại trang: vào thẳng bằng token (HUD "${n2}"), không qua màn hình đăng nhập`);

  // 5. Đăng xuất -> về màn hình đăng nhập, token bị xoá; đăng nhập lại -> cùng nhân vật
  await logoutAndReload();
  if (await ev(`localStorage.getItem('tien-gioi:token') !== null`))
    throw new Error("token còn sau đăng xuất");
  step("5a", "đăng xuất: về đăng nhập, token đã xoá");
  await fill("auth-login-user", "kiem_tu_01");
  await fill("auth-login-pass", "mat-khau-dai-du-1");
  await submit("auth-login-form");
  await inGame("Kiem Tu Mot", "sau khi đăng nhập lại");
  step("5b", "đăng nhập lại: vào cùng nhân vật");

  // 6. Quên mật khẩu bằng mã khôi phục (gõ chữ thường, không gạch) -> mã MỚI -> vào lại bằng mật khẩu mới
  await logoutAndReload();
  await click("link-to-forgot");
  await waitFor(visible("forgot"), 3000, "màn quên mật khẩu");
  await fill("auth-forgot-user", "kiem_tu_01");
  await fill("auth-forgot-code", code1.toLowerCase().replace(/-/g, ""));
  await fill("auth-forgot-pass", "mat-khau-moi-dai-2");
  await submit("auth-forgot-form");
  await waitFor(visible("recovery"), 8000, "mã khôi phục MỚI");
  const code2 = (await text("auth-recovery-code-val")).trim();
  if (code2 === code1) throw new Error("mã khôi phục không đổi sau khi dùng");
  step("6a", `khôi phục mật khẩu: nhận mã mới ${code2} (khác mã cũ)`);
  await click("auth-recovery-confirm-cb");
  await click("auth-recovery-continue-btn");
  // Tài khoản ĐÃ có nhân vật: đáng ra vào thẳng game, không bắt chọn đạo hiệu lại
  let after = "?";
  try {
    await waitFor(
      `${visible("character")} || (!document.getElementById('ui')?.hidden && !!document.getElementById('hud-name')?.textContent)`,
      10000,
      "sau khi khôi phục",
    );
    after = (await ev(`${visible("character")}`)) ? "character" : "game";
  } catch (e) {
    after = "không rõ: " + (e as Error).message;
  }
  await shot("3-sau-khoi-phuc.png");
  out(
    `  ${after === "game" ? "✓" : "✗"} [6b] sau "Tiếp tục" ở màn mã khôi phục (tài khoản đã có nhân vật) => ${after}`,
  );
  if (after !== "game")
    failed =
      (failed ? failed + "; " : "") + `sau khôi phục tài khoản đã có nhân vật lại hiện: ${after}`;

  // 7. Tài khoản thứ hai nhận nhân vật cũ (tên + mã bí mật) cùng chân linh (Kiếp 3, 17 Duyên)
  await send("Page.navigate", { url: `http://localhost:${PORT}/?debug` });
  await ev(`localStorage.clear(); 1`);
  await send("Page.navigate", { url: `http://localhost:${PORT}/?debug` });
  await waitFor(visible("login"), 10000, "đăng nhập (tài khoản 2)");
  await click("link-to-register");
  await fill("auth-reg-user", "kiem_tu_02");
  await fill("auth-reg-pass", "mat-khau-dai-du-3");
  await submit("auth-reg-form");
  await waitFor(visible("recovery"), 8000, "mã khôi phục tài khoản 2");
  await click("auth-recovery-confirm-cb");
  await click("auth-recovery-continue-btn");
  await waitFor(visible("character"), 3000, "màn đạo hiệu 2");
  await click("link-to-claim");
  await waitFor(visible("claim"), 3000, "màn nhận nhân vật cũ");
  await fill("auth-claim-name", OLD);
  await fill("auth-claim-secret", "sai-ma-0123456789abcdef-zzz");
  await submit("auth-claim-form");
  await waitFor(
    `document.getElementById('auth-claim-err').textContent.length > 0`,
    5000,
    "lỗi nhận sai mã",
  );
  step("7a", `nhận nhân vật cũ sai mã: "${await text("auth-claim-err")}"`);
  await fill("auth-claim-secret", OLD_SECRET);
  await submit("auth-claim-form");
  await inGame(OLD, "nhân vật cũ");
  const kiep = await text("hud-kiep");
  if (!/3/.test(kiep)) throw new Error(`HUD kiếp phải ghi 3 (chân linh cũ), thực tế "${kiep}"`);
  await shot("4-claim.png");
  step(
    "7b",
    `nhận nhân vật cũ đúng mã: vào game "${OLD}", HUD kiếp "${kiep}" (chân linh cũ về tài khoản)`,
  );

  await sleep(500);
  if (errors.length) {
    failed = (failed ? failed + "; " : "") + "lỗi trình duyệt: " + errors.join(" | ");
  } else out("  ✓ 0 lỗi console / exception / cảnh báo colyseus 'onMessage() not registered'");
} catch (e) {
  const msg = (e as Error).message;
  failed = (failed ? failed + "; " : "") + msg;
  out("LỖI: " + msg);
} finally {
  killAll();
  await sleep(500);
  const filesAfter = readdirSync(path.join(REPO, "server/data/players")).length;
  out(`  server/data/players thật: trước ${filesBefore} sau ${filesAfter}`);
  out("  tệp dữ liệu tạm: " + readdirSync(data).join(", "));
  if (/Error|lỗi nội bộ/i.test(serverLog.replace(/CẢNH BÁO[^\n]*/g, "")))
    out(
      "  nhật ký server có dòng lỗi:\n" +
        serverLog
          .split("\n")
          .filter((l) => /Error|lỗi/i.test(l))
          .slice(0, 5)
          .join("\n"),
    );
  rmSync(data, { recursive: true, force: true });
  rmSync(chromeDir, { recursive: true, force: true });
}
if (failed) {
  out("KẾT QUẢ: THẤT BẠI: " + failed);
  process.exit(1);
}
out("KẾT QUẢ: PASS");
