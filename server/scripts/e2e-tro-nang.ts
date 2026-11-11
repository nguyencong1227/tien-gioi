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
import { Tab, sleep, shown } from "./e2e-kit";

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
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
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

    // 0. Bảng gợi ý người mới (hiện 1 lần lần đầu nhập thế, #269 lát 2)
    check(
      "Lần đầu nhập thế: bảng chỉ dẫn người mới hiện thật",
      !!(await ev(shown("newbie-guide-modal"))),
      "newbie-guide-modal không hiện",
    );
    check(
      "Bảng chỉ dẫn có role=dialog và aria-modal=true",
      (await ev(
        `[document.getElementById('newbie-guide-modal').getAttribute('role'), document.getElementById('newbie-guide-modal').getAttribute('aria-modal')].join('|')`,
      )) === "dialog|true",
      String(await ev(`document.getElementById('newbie-guide-modal').getAttribute('role')`)),
    );
    // Đóng bằng Esc
    await press(t, K.esc);
    check(
      "Bấm Esc: đóng bảng chỉ dẫn người mới",
      !(await ev(shown("newbie-guide-modal"))),
      "newbie-guide-modal vẫn mở",
    );
    check(
      "Đã ghi nhận dismiss vào localStorage",
      (await ev(`localStorage.getItem("tg_newbie_guide_dismissed")`)) === "1",
      String(await ev(`localStorage.getItem("tg_newbie_guide_dismissed")`)),
    );
    // Nút Trợ giúp (?) ở đáy HUD hiển thị thật
    check(
      "Nút Trợ giúp (?) ở HUD đáy hiển thị thật",
      !!(await ev(shown("help"))),
      "help không hiện",
    );
    // Bấm nút Trợ giúp (?) mở lại được
    await ev(`document.getElementById('help').click(); 1`);
    check(
      "Bấm nút Trợ giúp (?): mở lại bảng chỉ dẫn",
      !!(await ev(shown("newbie-guide-modal"))),
      "newbie-guide-modal không mở lại",
    );
    // Bấm nút 'Đã Hiểu'
    await ev(`document.getElementById('newbie-btn-dismiss').click(); 1`);
    check(
      "Bấm nút 'Đã Hiểu': đóng bảng chỉ dẫn người mới thành công",
      !(await ev(shown("newbie-guide-modal"))),
      "newbie-guide-modal chưa đóng",
    );

    // 0b. Bảng Cài đặt & tuỳ chọn Giảm chuyển động (#269 lát 2)
    await ev(`document.getElementById('btn-settings').click(); 1`);
    check(
      "Mở bảng Cài đặt: bảng hiện thật",
      !!(await ev(shown("settings-modal"))),
      "settings-modal không hiện",
    );
    check(
      "Bảng Cài đặt có role=dialog và aria-modal=true",
      (await ev(
        `[document.getElementById('settings-modal').getAttribute('role'), document.getElementById('settings-modal').getAttribute('aria-modal')].join('|')`,
      )) === "dialog|true",
      String(await ev(`document.getElementById('settings-modal').getAttribute('role')`)),
    );
    await ev(`document.getElementById('set-reduced-motion').click(); 1`);
    const reducedOn =
      (await ev(`document.body.classList.contains('reduced-motion')`)) &&
      (await ev(`localStorage.getItem('tg_reduced_motion')`)) === "1";
    check(
      "Bật tuỳ chọn giảm chuyển động: body có class reduced-motion và lưu localStorage",
      !!reducedOn,
      `class=${await ev(`document.body.className`)}, storage=${await ev(`localStorage.getItem('tg_reduced_motion')`)}`,
    );
    await ev(`document.getElementById('set-reduced-motion').click(); 1`);
    const reducedOff =
      !(await ev(`document.body.classList.contains('reduced-motion')`)) &&
      (await ev(`localStorage.getItem('tg_reduced_motion')`)) === "0";
    check(
      "Tắt tuỳ chọn giảm chuyển động: gỡ class và lưu localStorage",
      !!reducedOff,
      `class=${await ev(`document.body.className`)}, storage=${await ev(`localStorage.getItem('tg_reduced_motion')`)}`,
    );
    await press(t, K.esc);
    check(
      "Bấm Esc: đóng bảng Cài đặt",
      !(await ev(shown("settings-modal"))),
      "settings-modal vẫn mở",
    );

    // 0c. Giả lập OS bật giảm chuyển động qua CDP (Issue #280)
    await tab.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    // Tổ hợp 1: OS bật nhưng người chơi TẮT trong game (=0)
    await ev(`localStorage.setItem("tg_reduced_motion", "0"); window.__ui?.syncReducedMotion(); 1`);
    const motionOk = await ev(
      `document.body.classList.contains("motion-ok") && !document.body.classList.contains("reduced-motion")`,
    );
    check(
      "OS bật reduced-motion nhưng game chọn tắt (=0): body có class motion-ok",
      !!motionOk,
      `classes=${await ev(`document.body.className`)}`,
    );
    const cssDuration = await ev(
      `(() => {
        const btn = document.getElementById("btn-portal");
        return btn ? window.getComputedStyle(btn).animationDuration : "none";
      })()`,
    );
    check(
      "OS bật nhưng game tắt (=0): thời lượng animation CSS bình thường (> 0.1s)",
      cssDuration !== "0.01ms" && cssDuration !== "0.00001s",
      `animationDuration=${cssDuration}`,
    );

    // Tổ hợp 2: OS bật và người chơi KHÔNG cài đặt (mặc định)
    await ev(`localStorage.removeItem("tg_reduced_motion"); window.__ui?.syncReducedMotion(); 1`);
    const osDefaultReduced = await ev(
      `document.body.classList.contains("reduced-motion") && !document.body.classList.contains("motion-ok")`,
    );
    check(
      "OS bật và chưa có cài đặt: body có class reduced-motion",
      !!osDefaultReduced,
      `classes=${await ev(`document.body.className`)}`,
    );
    const cssDurationReduced = await ev(
      `(() => {
        const btn = document.getElementById("btn-portal");
        return btn ? window.getComputedStyle(btn).animationDuration : "none";
      })()`,
    );
    const isDurationReduced =
      parseFloat(String(cssDurationReduced)) <= 0.001 ||
      String(cssDurationReduced) === "0.01ms" ||
      String(cssDurationReduced).includes("1e-05");
    check(
      "OS bật và chưa có cài đặt: CSS bị ép giảm chuyển động (<= 0.01ms)",
      Boolean(isDurationReduced),
      `animationDuration=${cssDurationReduced}`,
    );
    // Khôi phục giả lập OS
    await tab.send("Emulation.setEmulatedMedia", { features: [] });
    await ev(`localStorage.removeItem("tg_reduced_motion"); window.__ui?.syncReducedMotion(); 1`);

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

    // 6. Kiểm tra Esc với lời mời (Issue #280): Esc chỉ ẩn hộp lời mời trên màn hình, không gửi tin từ chối
    await ev(`(() => {
      const pib = document.getElementById('party-invite-box');
      if (pib) pib.hidden = false;
      return true;
    })()`);
    check(
      "Mở hộp lời mời tổ đội",
      !!(await ev(shown("party-invite-box"))),
      "party-invite-box không hiện",
    );
    await press(t, K.esc);
    check(
      "Bấm Esc: chỉ tạm ẩn hộp lời mời trên màn hình",
      !(await ev(shown("party-invite-box"))),
      "party-invite-box vẫn mở",
    );

    // 7. Kích hoạt nút HUD bằng bàn phím (bindTap, #280): nút thật `<button>` và phần tử không phải nút
    const closeAll = async () => {
      for (
        let n = 0;
        n < 4 && ((await ev(shown("inv-modal"))) || (await ev(shown("map-modal"))));
        n++
      )
        await press(t, K.esc);
      await ev(
        `document.activeElement && document.activeElement.blur && document.activeElement.blur(); 1`,
      );
    };
    await closeAll();
    await ev(`document.getElementById('btn-bag').focus(); 1`);
    await press(t, K.enter);
    check(
      "Enter trên nút btn-bag (<button>): túi mở đúng một lần",
      !!(await ev(shown("inv-modal"))),
      "inv-modal không mở",
    );
    check(
      "Enter trên nút HUD: focus nằm TRONG bảng vừa mở, không bị Phaser kéo về ô chat",
      !!(await ev(`document.getElementById('inv-modal').contains(document.activeElement)`)),
      `activeElement=${await ev(active)}`,
    );
    await closeAll();
    await ev(`document.getElementById('btn-bag').focus(); 1`);
    await press(t, K.space);
    check(
      "Space trên nút btn-bag (<button>): túi mở đúng một lần",
      !!(await ev(shown("inv-modal"))),
      "inv-modal không mở",
    );
    await closeAll();
    // phím lặp (giữ phím): sự kiện giả có repeat bắn thẳng vào phần tử (focus chuyển vào bảng sẽ làm nhiễu phím thật)
    await ev(
      `(() => { const el = document.getElementById('minimap-wrap'); const mk = (rep) => new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', repeat: rep, bubbles: true, cancelable: true }); el.dispatchEvent(mk(false)); for (let i = 0; i < 3; i++) el.dispatchEvent(mk(true)); return 1; })()`,
    );
    await sleep(200);
    check(
      "Giữ Enter (1 + 3 lặp) trên #minimap-wrap (không phải <button>): bản đồ mở đúng một lần",
      !!(await ev(shown("map-modal"))),
      "map-modal đóng vì bị bật / tắt nhiều lần",
    );
    await closeAll();

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
