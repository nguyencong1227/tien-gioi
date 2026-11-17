import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch, process, Buffer */
// Kiểm VẬT THỂ BỀN (`fx` `zone` / `trap` / `totem` / `aura` + `fxEnd`, mục 51, CT11b bước 3b) trong Chrome THẬT (`?skills=mock&crowd=3`, không cần máy chủ): phát tin qua ĐÚNG đường
// nhận tin của cảnh (mock room `emit`), đo vật thể đang giữ (`scene.persists`) và HẠT thật khi bẫy nổ (`__fx.stats()`). Chưa chiêu thật nào có hình này nên script gán tạm `armMs` /
// `tickMs` lên chiêu mẫu. Khẳng định: vật thể hiện ngay, TỰ TẮT đúng lúc hết `ms` (không cần `fxEnd`); bẫy chưa kích hoạt trước `armMs` rồi mới sáng; `fxEnd` `pop` có vòng nổ + bụi,
// `gone` thì mờ tắt không bụi; `fxEnd` id lạ / gửi hai lần bị bỏ qua; hào quang BÁM người dùng, mờ tắt khi người đó chết / rời state; ngoài tầm nhìn / tin hỏng / chiêu lạ không vẽ gì
// và không lỗi JS; số vật thể KHÔNG vượt trần theo bậc chất lượng và theo chủ. Có thể chụp ảnh: `--shots <thư mục>`.
//   node client/scripts/check-persist-fx.mjs [--url <client đang chạy sẵn, tuỳ chọn>] [--shots /tmp/tg-b-shots]
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
const SHOTS = argOf("--shots", "");
const BUDGET = { low: 4, high: 24 };
const CDP_PORT = await freePort();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-check-persist-fx-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
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
  await send("Runtime.enable");
  await send("Page.enable");
  let scriptId = null;
  const open = async (quality) => {
    if (scriptId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
    const r = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem('tg_newbie_guide_dismissed','1');localStorage.setItem('tg_quality','${quality}');localStorage.removeItem('tg_reduced_motion')}catch(e){}`,
    });
    scriptId = String(r.result?.identifier ?? "");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `${BASE_URL}/?skills=mock&n=4&debug=1&crowd=3` });
    for (let k = 0; k < 50; k++) {
      await sleep(300);
      if (
        await evalJs(
          "Boolean(window.__scene && window.__scene.me && window.__scene.me() && window.__fx)",
        )
      )
        break;
    }
    await sleep(1200);
    // Chế độ mock không chạy đối chiếu (predX / predY = 0): đặt người chơi (và đoán trước) vào giữa trấn thoáng, camera nhìn vào đó
    await evalJs(`(() => { const sc = window.__scene, me = sc.me(), t = sc.map.townPx;
      me.x = t.x; me.y = t.y; sc.predX = me.x; sc.predY = me.y; sc.pending.length = 0; sc.cameras.main.centerOn(me.x, me.y); return 1; })()`);
    await sleep(500);
  };
  const settle = async () => {
    await evalJs("window.__fx.clear(); 0");
    for (let k = 0; k < 60; k++) {
      await sleep(100);
      if ((await evalJs("window.__fx.stats().liveParticles")) === 0 && k >= 3) break;
    }
  };
  /** Gán `armMs` / `tickMs` cho chiêu mẫu ngay trong trang (object `SkillDef` dùng chung của shared). */
  const ARM = 700;
  const tune = (on) =>
    evalJs(`(() => { const L = window.__scene.skills.learnedList(); const a = L.find((x) => x.def.id === "hoa_van_kiem")?.def; if (!a) return 0;
      a.armMs = ${on ? ARM : "undefined"}; a.tickMs = ${on ? 500 : "undefined"}; return 1; })()`);
  const layer = () =>
    evalJs(
      `(() => { const sc = window.__scene, p = sc.persists; return JSON.stringify({ s: p.stats(), snap: p.snapshot(sc.time.now) }); })()`,
    ).then((s) => JSON.parse(s));
  const emit = (msgJs) =>
    evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY);
      const x = sc.predX, y = sc.predY, sid = sc.sid; sc.room.emit("fx", ${msgJs}); return 1; })()`);
  const admitted = () => evalJs("window.__fx.stats().admitted");
  const reset = async () => {
    await evalJs("window.__scene.persists.clear(); window.__fx.clear(); 0");
    await settle();
  };
  const obj = (kind, over = "") =>
    `{ kind: "${kind}", by: "mock-bot-1", skill: "hoa_van_kiem", id: 1, x, y, r: 90, ms: 1500${over} }`;
  const LIMITS = { low: { total: 12 }, high: { total: 60 } };
  for (const q of ["high", "low"]) {
    console.log(`--- bậc ${q === "high" ? "Cao" : "Thấp"} (ngân sách emitter ${BUDGET[q]}) ---`);
    await open(q);
    check((await tune(true)) === 1, "gán armMs / tickMs cho chiêu mẫu (hoa_van_kiem)");
    await evalJs(`(() => { const sc = window.__scene; for (let i = 1; i <= 3; i++) { const p = sc.state.players.get("mock-bot-" + i);
      if (p) { p.px = p.x = sc.predX + 30 * i; p.py = p.y = sc.predY + 10; p.dead = false; } } return 1; })()`);
    await sleep(1500);
    await reset();

    // 1. vùng: hiện ngay (đang hiện dần), đúng chỗ, tự tắt sau ms mà KHÔNG cần fxEnd
    const x0 = await evalJs("window.__scene.predX");
    const y0 = await evalJs("window.__scene.predY");
    await emit(obj("zone"));
    let r = await layer();
    check(r.s.alive === 1 && r.snap.length === 1, `vùng hiện ngay khi nhận tin (giữ ${r.s.alive})`);
    check(
      Math.abs(r.snap[0].x - x0) < 1 && Math.abs(r.snap[0].y - y0) < 1,
      "vùng đứng đúng tâm (x, y) máy chủ gửi",
    );
    check(r.snap[0].alpha < 1, `mới dựng thì hiện dần (alpha ${r.snap[0].alpha.toFixed(2)})`);
    await sleep(500);
    r = await layer();
    check(r.snap[0]?.alpha === 1 && r.s.drawn === 1, "giữa chừng đậm tối đa và đang được vẽ");
    await sleep(700); // ~1250 ms: đang mờ dần cuối đời
    r = await layer();
    check(r.s.alive === 1 && r.snap[0].alpha < 1, "cuối đời mờ dần (chưa gỡ)");
    await sleep(500); // > 1500 ms
    r = await layer();
    check(r.s.alive === 0, `hết ms thì tự tắt, KHÔNG cần fxEnd (giữ ${r.s.alive})`);
    check(r.s.ended === 0, "không có fxEnd nào được áp dụng");
    await reset();

    // 2. bẫy: chưa kích hoạt trước armMs, rồi sáng; fxEnd pop có vòng nổ + bụi, rồi gỡ
    await emit(obj("trap", ", id: 2, ms: 8000"));
    r = await layer();
    check(r.snap[0]?.armed === false, "bẫy mới đặt CHƯA kích hoạt (armMs)");
    await sleep(ARM + 150);
    r = await layer();
    check(r.snap[0]?.armed === true, "qua armMs thì bẫy kích hoạt");
    const a1 = await admitted();
    await emit(`{ kind: "fxEnd", id: 2, x, y, why: "pop" }`);
    r = await layer();
    check(r.snap[0]?.ending === "pop", "fxEnd pop: bẫy chuyển sang trạng thái nổ");
    check(
      (await admitted()) - a1 >= 1,
      `bẫy nổ có bụi hạt thật (nhận ${(await admitted()) - a1} điểm)`,
    );
    await sleep(120);
    r = await layer();
    check(r.snap[0]?.alpha < 1, "thân bẫy tắt nhanh khi nổ");
    await sleep(350);
    r = await layer();
    check(r.s.alive === 0, `vòng nổ xong thì gỡ hẳn (giữ ${r.s.alive})`);
    await reset();

    // 3. fxEnd gone: mờ tắt KHÔNG bụi; fxEnd id lạ / gửi hai lần: bỏ qua
    await emit(obj("zone", ", id: 3, ms: 8000"));
    await sleep(300);
    const a2 = await admitted();
    const e0 = (await layer()).s.ended;
    await emit(`{ kind: "fxEnd", id: 999, x, y, why: "gone" }`);
    check((await layer()).s.ended === e0, "fxEnd id lạ: bỏ qua (không áp dụng)");
    await emit(`{ kind: "fxEnd", id: 3, x, y, why: "gone" }`);
    r = await layer();
    check(r.snap[0]?.ending === "gone", "fxEnd gone: vùng chuyển sang mờ tắt");
    await emit(`{ kind: "fxEnd", id: 3, x, y, why: "pop" }`);
    r = await layer();
    check(
      r.snap[0]?.ending === "gone",
      "fxEnd gửi lần hai bị bỏ qua (vẫn là gone, không đổi thành nổ)",
    );
    await sleep(500);
    r = await layer();
    check(r.s.alive === 0, `gone: gỡ sau khi mờ (giữ ${r.s.alive})`);
    check((await admitted()) === a2, "gone KHÔNG có bụi hạt");
    await reset();

    // 4. tượng: đứng yên, sống tới hết ms
    await emit(obj("totem", ", id: 4, r: 140, ms: 1200"));
    await sleep(600);
    r = await layer();
    check(
      r.snap[0]?.kind === "totem" && r.snap[0].x === x0 && r.snap[0].y === y0,
      "tượng đứng yên ở chỗ dựng",
    );
    await sleep(800);
    r = await layer();
    check(r.s.alive === 0, "tượng tự tắt khi hết ms");
    await reset();

    // 5. hào quang: BÁM người dùng; chết thì tắt; rời state thì tắt sau một lúc
    await emit(obj("aura", ", id: 5, r: 70, ms: 20000"));
    await evalJs(
      `(() => { const p = window.__scene.state.players.get("mock-bot-1"); p.px = p.x = window.__scene.predX + 160; p.py = p.y = window.__scene.predY + 40; return 1; })()`,
    );
    await sleep(900);
    r = await layer();
    const botX = await evalJs(`window.__scene.players.get("mock-bot-1").root.x`);
    check(
      r.snap[0] && Math.abs(r.snap[0].x - botX) < 1,
      `hào quang bám theo người dùng (x ${Math.round(r.snap[0]?.x ?? NaN)} so với người ${Math.round(botX)})`,
    );
    check(Math.abs(r.snap[0].x - x0) > 60, "hào quang đã rời chỗ lúc dựng");
    await evalJs(
      `(() => { window.__scene.state.players.get("mock-bot-1").dead = true; return 1; })()`,
    );
    await sleep(100);
    r = await layer();
    check(r.snap[0]?.ending === "gone", "người dùng chết: hào quang mờ tắt");
    await sleep(500);
    check((await layer()).s.alive === 0, "hào quang chết đã gỡ");
    await evalJs(
      `(() => { window.__scene.state.players.get("mock-bot-1").dead = false; return 1; })()`,
    );
    await reset();
    await emit(obj("aura", ", by: sid, id: 6, r: 70, ms: 20000"));
    await evalJs(`(() => { const sc = window.__scene; sc.predX += 120; return 1; })()`);
    await sleep(200);
    r = await layer();
    check(
      r.snap[0]?.mine === true && Math.abs(r.snap[0].x - (x0 + 120)) < 1,
      "hào quang của MÌNH bám vị trí đoán trước",
    );
    await evalJs(`(() => { const sc = window.__scene; sc.predX -= 120; return 1; })()`);
    await reset();
    await emit(obj("aura", ", by: 'mock-bot-2', id: 7, r: 70, ms: 20000"));
    await evalJs(`(() => { window.__scene.state.players.delete("mock-bot-2"); return 1; })()`);
    await sleep(400);
    check(
      (await layer()).s.alive === 1,
      "người dùng vừa mất khỏi state: còn chờ trong thời gian ân hạn",
    );
    await sleep(900);
    r = await layer();
    check(
      r.snap.length === 0 || r.snap[0].ending === "gone",
      "người dùng rời state quá ân hạn: hào quang tắt",
    );
    await reset();

    // 6. ngoài tầm nhìn không vẽ; tin hỏng / chiêu lạ: bỏ cả tin, không lỗi
    await emit(
      `{ kind: "zone", by: "mock-bot-1", skill: "hoa_van_kiem", id: 8, x: x + 5000, y, r: 90, ms: 1500 }`,
    );
    check((await layer()).s.alive === 0, "vật thể ngoài tầm nhìn không vẽ");
    for (const [name, over] of [
      ["kind lạ", ', kind: "wall"'],
      ["kind độc", ', kind: "constructor"'],
      ["by rỗng", ', by: ""'],
      ["id âm", ", id: -1"],
      ["id lẻ", ", id: 1.5"],
      ["r 0", ", r: 0"],
      ["r NaN", ", r: NaN"],
      ["ms chuỗi", ', ms: "600"'],
      ["ms 0", ", ms: 0"],
      ["x vô cực", ", x: Infinity"],
      ["toạ độ quá biên", ", x: 1e9"],
      ["chiêu lạ", ', skill: "khong_co_chieu_nay"'],
      ["chiêu độc", ', skill: "constructor"'],
    ]) {
      await emit(obj("zone", over));
      check((await layer()).s.alive === 0, `tin hỏng (${name}): không vẽ`);
    }
    const eBase = (await layer()).s.ended;
    for (const [name, m] of [
      ["id âm", `{ kind: "fxEnd", id: -1, x, y, why: "pop" }`],
      ["why lạ", `{ kind: "fxEnd", id: 1, x, y, why: "boom" }`],
      ["x NaN", `{ kind: "fxEnd", id: 1, x: NaN, y, why: "gone" }`],
    ]) {
      await emit(m);
      check((await layer()).s.ended === eBase, `fxEnd hỏng (${name}): bỏ qua`);
    }
    await reset();

    // 7. cùng id gửi lại: cập nhật, không thêm
    await emit(obj("zone", ", id: 9, ms: 8000"));
    await emit(obj("zone", ", id: 9, ms: 8000, r: 120"));
    r = await layer();
    check(
      r.s.alive === 1 && r.snap[0].r === 120,
      "cùng id gửi lại thì cập nhật đúng cái đó (giữ 1)",
    );
    await reset();

    // 8. trần: một chủ dựng dồn dập, nhiều chủ cùng dựng, chính mình dựng dồn dập
    const spam = (by, n, base) =>
      `(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY); const x = sc.predX, y = sc.predY;
        for (let i = 0; i < ${n}; i++) sc.room.emit("fx", { kind: "zone", by: ${by}, skill: "hoa_van_kiem", id: ${base} + i, x: x + (i % 5) * 20, y, r: 60, ms: 8000 }); return 1; })()`;
    await evalJs(spam('"mock-bot-1"', 20, 100));
    r = await layer();
    check(r.snap.length <= 4, `20 vật thể của MỘT chủ chỉ giữ ${r.snap.length} (<= 4)`);
    check(
      r.s.recycled >= 16,
      `phần vượt trần được TÁI DÙNG cái cũ (${r.s.recycled} lần), không bỏ tin mới`,
    );
    await reset();
    await evalJs(`(() => { const sc = window.__scene; const x = sc.predX, y = sc.predY;
      for (let o = 0; o < 30; o++) for (let i = 0; i < 4; i++)
        sc.room.emit("fx", { kind: "zone", by: "mock-bot-" + (100 + o), skill: "hoa_van_kiem", id: 1000 + o * 4 + i, x, y, r: 60, ms: 8000 });
      return 1; })()`);
    r = await layer();
    check(
      r.snap.length <= LIMITS[q].total,
      `30 chủ x 4: tổng giữ ${r.snap.length} (<= ${LIMITS[q].total} theo bậc)`,
    );
    check(
      r.snap.length >= Math.min(LIMITS[q].total, 12),
      `không giữ ít hơn trần chung (${r.snap.length})`,
    );
    await reset();
    await evalJs(spam("sc.sid", 20, 5000));
    r = await layer();
    check(
      r.snap.length <= 4 && r.snap.every((s) => s.mine),
      `20 vật thể của chính mình: giữ ${r.snap.length} (<= 4), đều là của mình`,
    );
    if (q === "high" && SHOTS) {
      await reset();
      await evalJs(`(() => { const sc = window.__scene; sc.cameras.main.centerOn(sc.predX, sc.predY); const x = sc.predX, y = sc.predY;
        const E = (m) => sc.room.emit("fx", m);
        E({ kind: "zone", by: sc.sid, skill: "hoa_van_kiem", id: 1, x: x - 150, y: y - 20, r: 80, ms: 20000 });
        E({ kind: "trap", by: sc.sid, skill: "hoa_van_kiem", id: 2, x: x - 40, y: y + 70, r: 34, ms: 20000 });
        E({ kind: "totem", by: "mock-bot-1", skill: "huyen_bang_chi", id: 3, x: x + 70, y: y + 60, r: 120, ms: 20000 });
        E({ kind: "aura", by: sc.sid, skill: "hoa_van_kiem", id: 4, x, y, r: 60, ms: 20000 });
        return 1; })()`);
      await sleep(1300);
      const png = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 380, y: 260, width: 520, height: 220, scale: 1.5 },
      });
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, "vat-the-ben.png"), Buffer.from(png.result.data, "base64"));
    }
    await reset();
    await tune(false);
  }
  check(pageErrors === 0, `không có lỗi JS trên trang (${pageErrors})`);
} finally {
  const exited = new Promise((res) => chrome.once("exit", res));
  chrome.kill();
  await Promise.race([exited, sleep(3000)]);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* bỏ qua */
  }
}
console.log(failures === 0 ? "\nTẤT CẢ ĐẠT" : `\n${failures} LỖI`);
process.exit(failures === 0 ? 0 : 1);
