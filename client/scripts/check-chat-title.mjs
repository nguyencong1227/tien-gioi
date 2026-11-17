import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process */
// Kiểm DANH HIỆU TRONG CHAT (M9, #1027) trong Chrome THẬT qua CDP, chế độ `?skills=mock&n=2`, KHÔNG cần máy chủ: tin `chat` mẫu đổ vào `__ui.chat` (đường vào của `reg("chat")`).
// Mặc định BẬT (`?social=1` vẫn nhận): tin có `titleId` hiện «Danh hiệu» trước tên ở chat chung / đội / tông môn, trong thẻ `<i class="chat-title">`; id lạ KHÔNG hiện và không lộ id; tin không có
// `titleId` y hệt cũ. Có `?social=0`: không hiện danh hiệu nào (công tắc khẩn). Chữ đi vào DOM bằng textContent (tên chứa thẻ HTML không thành thẻ).
//   node client/scripts/check-chat-title.mjs [--url <client đang chạy sẵn, tuỳ chọn>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";
import { resolveClientUrl } from "./client-url.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE_URL = await resolveClientUrl(argOf("--url", ""));
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-chat-title-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    // Chrome không đầu không có chuột: giả lập chuột (4 = fine, 2 = hover) như các script khác
    "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
    ...getChromeGpuFlags(),
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failures++;
};
try {
  let targets = [];
  for (let k = 0; k < 40; k++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        targets = await res.json();
        break;
      }
    } catch {
      await sleep(150);
    }
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("Không tìm thấy Chrome page target.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let nextId = 1;
  const pending = new Map();
  let pageErrors = 0;
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.method === "Runtime.exceptionThrown") pageErrors++;
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const J = async (expression) => JSON.parse(await evalJs(`JSON.stringify(${expression})`));

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','high')}catch(e){}",
  });

  const open = async (query) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=2&debug=1${query}` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__ui)",
        )
      )
        break;
    }
    await sleep(600);
  };
  const say = (m) => evalJs(`window.__ui.chat(${JSON.stringify(m)}); 1`);
  /** Dòng chat cuối: lớp, chữ nhãn (<b>), chữ danh hiệu (<i.chat-title>) nếu có, toàn dòng, số thẻ lạ trong nhãn. */
  const last = () =>
    J(`(() => { const p = document.querySelector('#chat-log p:last-child'); const b = p.querySelector('b'); const t = b.querySelector('i.chat-title');
      return { cls: p.className, label: b.textContent, title: t ? t.textContent : null, all: p.textContent, tags: b.querySelectorAll('*').length - (t ? 1 : 0), html: p.innerHTML.includes('<script') || p.innerHTML.includes('<img') }; })()`);

  console.log("--- có cờ ?social=1 ---");
  await open("&social=1");
  await say({ from: "Vân Hạc", text: "xin chào" });
  let r = await last();
  check(
    r.label === "Vân Hạc: " && r.title === null && r.cls === "",
    `tin KHÔNG có titleId y hệt cũ ('${r.label}')`,
  );
  await say({ from: "Vân Hạc", text: "tái sinh rồi", titleId: "lh2" });
  r = await last();
  check(
    r.title === "«Tái Sinh»" && r.label === "«Tái Sinh» Vân Hạc: ",
    `chat chung: «danh hiệu» trước tên ('${r.label}')`,
  );
  check(r.all === "«Tái Sinh» Vân Hạc: tái sinh rồi", `toàn dòng đọc đúng thứ tự ('${r.all}')`);
  await say({ from: "Vân Hạc", text: "đội ơi", channel: "party", titleId: "tr1" });
  r = await last();
  check(
    r.cls === "party" && r.label === "[Đội] «Thợ Săn Trùm» Vân Hạc: ",
    `chat đội: kênh, danh hiệu, tên ('${r.label}')`,
  );
  await say({ from: "Vân Hạc", text: "tông ơi", channel: "sect", titleId: "pk10" });
  r = await last();
  check(
    r.cls === "sect" && r.label === "[Tông môn] «Đấu Sĩ» Vân Hạc: ",
    `chat tông môn ('${r.label}')`,
  );
  for (const bad of ["id_la_cua_may_chu", "constructor", "__proto__", ""]) {
    await say({ from: "Vân Hạc", text: "id lạ", titleId: bad });
    r = await last();
    check(
      r.title === null && r.label === "Vân Hạc: " && !r.all.includes(bad || "\u0000"),
      `titleId lạ '${bad}': không hiện, không lộ id`,
    );
  }
  await say({ from: "<img src=x onerror=alert(1)>", text: "<script>x</script>", titleId: "kp1" });
  r = await last();
  check(
    r.label.includes("<img src=x onerror=alert(1)>") && r.all.endsWith("<script>x</script>"),
    "tên / chữ chứa thẻ HTML hiện NGUYÊN VĂN như chữ (không bị lọc, không thành thẻ)",
  );
  check(
    !r.html && r.title === "«Lữ Khách»",
    "tên / chữ chứa thẻ HTML chỉ là chữ (textContent), danh hiệu vẫn đúng",
  );
  await say({ from: "Thiên Đạo", text: "thông báo", sys: true });
  r = await evalJs(
    "document.querySelector('#chat-log p:last-child').className + '|' + document.querySelector('#chat-log p:last-child').textContent",
  );
  check(r === "sys|thông báo", `tin hệ thống không đổi ('${r}')`);
  const color = await evalJs(
    "(() => { const i = document.querySelector('#chat-log i.chat-title'); const cs = getComputedStyle(i); return cs.fontStyle + '|' + cs.color; })()",
  );
  check(color.startsWith("normal|"), `danh hiệu không in nghiêng như chữ nhấn khác (${color})`);

  console.log("--- công tắc khẩn ?social=0 (mặc định đã BẬT) ---");
  await open("&social=0");
  await say({ from: "Vân Hạc", text: "tái sinh rồi", titleId: "lh2" });
  r = await last();
  check(
    r.title === null && r.label === "Vân Hạc: ",
    `cờ tắt: KHÔNG hiện danh hiệu dù tin có titleId ('${r.label}')`,
  );
  await say({ from: "Vân Hạc", text: "đội", channel: "party", titleId: "lh2" });
  r = await last();
  check(r.label === "[Đội] Vân Hạc: ", `cờ tắt, chat đội y hệt cũ ('${r.label}')`);

  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  // Chrome có thể còn ghi vào thư mục hồ sơ lúc thoát (ENOTEMPTY): thử lại, thôi thì để /tmp dọn
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch {
    /* không quan trọng */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
