// E2E THẬT trợ năng bàn phím (M4-sớm, #269): server Colyseus thật + Chrome headless, phím gửi bằng CDP `Input.dispatchKeyEvent` (phím
// thật, `isTrusted`), không gọi hàm của UI. Kiểm các hành vi mà test thuần của `a11y.ts` không thấy được vì cần cả Phaser (bắt phím ở
// `window`) lẫn DOM (focus thật):
//  1. Mở hai bảng (I rồi C): MỘT lần Esc chỉ đóng bảng trên cùng; lần Esc thứ hai đóng bảng còn lại.
//  2. Đóng bảng bằng Esc rồi bấm Space (phím chém): KHÔNG mở lại bảng (focus trả về nút HUD không được biến Space thành "bấm nút").
//  3. Esc khi đang gõ ở ô chat: chỉ rời ô chat, KHÔNG đóng bảng đang mở.
//  4. Tab bị giữ trong bảng đang mở (focus trap), Shift+Tab cũng vậy.
//  5. Bảng có `role="dialog"` + `aria-modal`; nút mở có `aria-expanded` đúng; mở bảng thì focus vào trong bảng.
// Mọi kiểm "thấy" dùng hiển thị THẬT (`checkVisibility`), không chỉ `!hidden`. Chạy: `npm run build && npm run e2e:tro-nang -w server`.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, shown, sleep } from "./e2e-kit";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const PORT = 36000 + Math.floor(Math.random() * 4000);
const CDP = 9500 + Math.floor(Math.random() * 400);
const out = (m: string) => console.log(m);
const NAME = "Cu Ky Tro Nang";
const SECRET = "e2e_secret_tro_nang_abcdefghij";

interface Key {
  key: string;
  code: string;
  vk: number;
  text?: string;
}
const K = {
  esc: { key: "Escape", code: "Escape", vk: 27 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
  tab: { key: "Tab", code: "Tab", vk: 9 },
  i: { key: "i", code: "KeyI", vk: 73, text: "i" },
  c: { key: "c", code: "KeyC", vk: 67, text: "c" },
} satisfies Record<string, Key>;

/** Phím thật qua CDP: nhấn rồi nhả (`shift` cho Shift+Tab). */
async function press(tab: Tab, k: Key, shift = false) {
  const modifiers = shift ? 8 : 0;
  const base = {
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk,
    modifiers,
  };
  await tab.send("Input.dispatchKeyEvent", {
    ...base,
    type: k.text ? "keyDown" : "rawKeyDown",
    ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
  });
  await tab.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(120); // cho Phaser / DOM xử lý xong
}

const active = `(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase()) : ''; })()`;

async function main() {
  out("=== E2E THẬT trợ năng bàn phím: Chrome headless + server Colyseus thật ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    out("client/dist chưa có: đang build client...");
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-a11y-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-a11y-chrome-"));
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
  out(`- Server E2E: http://127.0.0.1:${PORT}`);

  let chrome: ChildProcess | null = null;
  let tab: Tab | null = null;
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    out(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${detail})`}`);
    if (!ok) failures.push(`${name}: ${detail}`);
  };
  let fatal: string | null = null;
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
      { stdio: "ignore" },
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
    await tab.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `localStorage.setItem("tien-gioi:name", ${JSON.stringify(NAME)}); localStorage.setItem("tien-gioi:secret", ${JSON.stringify(SECRET)});`,
    });
    await tab.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?debug` });
    await tab.waitFor(
      `typeof window.__switchAuthView === 'function' && !!document.getElementById('login-form')`,
      "form đăng nhập",
    );
    await tab.ev(`document.getElementById('login-form').requestSubmit(); 1`);
    await tab.waitFor(
      `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
      "vào game",
    );
    await sleep(500);
    const t = tab;
    const ev = (e: string) => t.ev(e);

    // 5. ARIA cơ bản + mở bảng thì focus vào trong bảng
    await press(t, K.i);
    check(
      "Mở túi bằng phím I: bảng hiện thật",
      !!(await ev(shown("inv-modal"))),
      "inv-modal không hiện",
    );
    const role = await ev(
      `[document.getElementById('inv-modal').getAttribute('role'), document.getElementById('inv-modal').getAttribute('aria-modal')].join('|')`,
    );
    check(
      "Túi có role=dialog và aria-modal=true",
      /^(alert)?dialog\|true$/.test(String(role)),
      String(role),
    );
    check(
      "Nút túi có aria-expanded=true khi bảng mở",
      (await ev(`document.getElementById('btn-bag').getAttribute('aria-expanded')`)) === "true",
      String(await ev(`document.getElementById('btn-bag').getAttribute('aria-expanded')`)),
    );
    check(
      "Mở bảng: focus nằm TRONG bảng",
      !!(await ev(`document.getElementById('inv-modal').contains(document.activeElement)`)),
      `activeElement=${await ev(active)}`,
    );

    // 4. Focus trap: Tab / Shift+Tab không đưa focus ra ngoài bảng
    let escaped = "";
    for (let n = 0; n < 12 && !escaped; n++) {
      await press(t, K.tab);
      if (!(await ev(`document.getElementById('inv-modal').contains(document.activeElement)`)))
        escaped = `Tab lần ${n + 1}: ${await ev(active)}`;
    }
    for (let n = 0; n < 12 && !escaped; n++) {
      await press(t, K.tab, true);
      if (!(await ev(`document.getElementById('inv-modal').contains(document.activeElement)`)))
        escaped = `Shift+Tab lần ${n + 1}: ${await ev(active)}`;
    }
    check("Tab / Shift+Tab giữ focus trong bảng (focus trap)", escaped === "", escaped);

    // 1. Hai bảng: một Esc chỉ đóng bảng trên cùng
    await press(t, K.c);
    const both = (await ev(shown("inv-modal"))) && (await ev(shown("char-modal")));
    check(
      "Mở thêm bảng nhân vật (C): hai bảng cùng mở",
      !!both,
      `inv=${await ev(shown("inv-modal"))} char=${await ev(shown("char-modal"))}`,
    );
    await press(t, K.esc);
    const afterOne = `inv=${await ev(shown("inv-modal"))} char=${await ev(shown("char-modal"))}`;
    check(
      "MỘT lần Esc chỉ đóng bảng trên cùng (nhân vật), túi còn mở",
      afterOne === "inv=true char=false",
      afterOne,
    );
    await press(t, K.esc);
    const afterTwo = `inv=${await ev(shown("inv-modal"))} char=${await ev(shown("char-modal"))}`;
    check("Esc lần hai đóng nốt túi", afterTwo === "inv=false char=false", afterTwo);

    // 2. Sau khi đóng bằng Esc: Space (phím chém) KHÔNG mở lại bảng
    const focusAfter = await ev(active);
    out(`    (focus sau khi đóng: ${focusAfter})`);
    await press(t, K.space);
    const reopened = await ev(shown("inv-modal"));
    check(
      "Đóng túi bằng Esc rồi bấm Space (chém): túi KHÔNG mở lại",
      !reopened,
      `focus=${focusAfter}, inv mở lại=${reopened}`,
    );
    if (reopened) await press(t, K.esc);

    // 3. Esc khi đang gõ chat: chỉ rời ô chat, không đóng bảng
    await press(t, K.i);
    await ev(`document.getElementById('chat-input').focus(); 1`);
    check("Focus đang ở ô chat", (await ev(active)) === "chat-input", String(await ev(active)));
    await press(t, K.esc);
    const afterChat = `inv=${await ev(shown("inv-modal"))} chatFocus=${(await ev(active)) === "chat-input"}`;
    check(
      "Esc ở ô chat: rời ô chat, túi VẪN mở",
      afterChat === "inv=true chatFocus=false",
      afterChat,
    );
    await press(t, K.esc);
    check(
      "Esc lần sau đóng túi",
      !(await ev(shown("inv-modal"))),
      `inv=${await ev(shown("inv-modal"))}`,
    );

    check("0 lỗi console / exception", t.errors.length === 0, t.errors.slice(0, 3).join(" | "));
  } catch (e) {
    fatal = (e as Error).message;
  } finally {
    tab?.close();
    chrome?.kill();
    await gameServer.gracefullyShutdown(false).catch(() => {});
    httpServer.close();
    rmSync(dataDir, { recursive: true, force: true });
    await sleep(600);
    rmSync(chromeDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  if (fatal || failures.length) {
    out(`\n❌ E2E TRỢ NĂNG THẤT BẠI: ${fatal ?? `${failures.length} kiểm đỏ`}`);
    for (const f of failures) out(`   - ${f}`);
    process.exit(1);
  }
  out("\n🎉 E2E THẬT TRỢ NĂNG PASS 100%!");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
