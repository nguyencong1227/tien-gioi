import { getChromeGpuFlags } from "./chrome-gpu.mjs";
/* global console, setTimeout, fetch */
/**
 * Đo HIỆU NĂNG của cơ chế TRÙM phía client (QUYET_DINH_M3 mục 42, issue T4 #873, mục "đo `?perf=1`"): so khung hình khi trùm đứng yên (nền) với khi trùm chạy ĐỦ cơ chế
 * (vùng cảnh báo vành khuyên mỗi 1,5 s, gồng / đáp trên thân + tiếng, giáp + vầng giáp + số bay xanh, gọi quái con, đổi giai đoạn, đòn dồn lên trùm 10 lần / giây).
 * Chrome headless THẬT, mock bí cảnh (không cần máy chủ), viewport điện thoại 390x844 (DPR 2), CPU bị bóp (mặc định 4x = Android tầm trung), bậc đồ hoạ Thấp và Cao.
 * Đây là số ĐO TRÊN MÁY NÀY (SwiftShader / GPU máy chủ), dùng để SO SÁNH nền với cơ chế trùm, KHÔNG phải số của điện thoại thật: số tuyệt đối đo ở máy thật bằng `?perf=1` (bảng góc màn hình).
 *
 *   npm run build -w client && node client/scripts/perf-boss.mjs [--cpu 4] [--tier low,high] [--seconds 6]
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { freePort } from "./free-port.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(REPO, "client/dist");

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const CPU = Number(arg("cpu", "4"));
const TIERS = arg("tier", "low,high")
  .split(",")
  .map((s) => s.trim());
const SECONDS = Number(arg("seconds", "6"));

/** Bộ phát cơ chế trùm chạy TRONG trang (không để độ trễ CDP làm lệch nhịp): mọi tin đi qua `scene.onFx` / `scene.onDmg` thật. */
const MECH_SOURCE = `(() => {
  const sc = window.__scene;
  const id = "m1";
  const b = () => sc.state.monsters.get(id);
  let timers = [];
  const stat = { sent: 0, peakParticles: 0, armorSeen: 0 };
  window.__bossMech = {
    stat,
    start() {
      const m = b();
      const x = m.x, y = m.y;
      const send = (m) => { stat.sent++; sc.onFx(m); };
      const hit = (m) => { stat.sent++; sc.onDmg(m); };
      const every = (ms, fn) => { fn(); timers.push(setInterval(fn, ms)); };
      // bằng chứng cơ chế THẬT chạy tới hạt / vầng: đỉnh hạt đang sống + số lần thấy vầng giáp bật
      timers.push(setInterval(() => {
        const st = window.__fx.stats();
        if (st.liveParticles > stat.peakParticles) stat.peakParticles = st.liveParticles;
        if (b() && sc.monsters.get(id)?.armorAura?.visible) stat.armorSeen++;
        if (sc.bossFx.armorOf(id, sc.time.now)) stat.armorOn = (stat.armorOn || 0) + 1;
        if (sc.monsters.get(id)) stat.entity = (stat.entity || 0) + 1;
        if (sc.monsters.get(id)?.root?.visible) stat.visible = (stat.visible || 0) + 1;
      }, 50));
      every(1500, () => {
        send({ kind: "warn", shape: "circle", x, y, r: 150, r0: 50, ms: 1000 });
        send({ kind: "bossCast", by: id, x, y, ability: "quat_duoi", ms: 1000 });
      });
      every(4500, () => send({ kind: "bossArmor", by: id, x, y, ms: 2500, mult: 0.5 }));
      every(6000, () => send({ kind: "bossSummon", by: id, x, y, n: 2 }));
      every(9000, () => send({ kind: "bossPhase", by: id, x, y, phase: 1 }));
      every(100, () => hit({ target: id, amount: 20 + Math.round(Math.random() * 150), crit: Math.random() < 0.15, x: x + (Math.random() - 0.5) * 60, y, toPlayer: false }));
    },
    stop() { timers.forEach(clearInterval); timers = []; },
  };
  return 1;
})()`;

async function main() {
  if (!fs.existsSync(path.join(DIST, "index.html")))
    throw new Error("Chưa có client/dist: chạy `npm run build -w client` trước.");
  const MIMES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) filePath = path.join(DIST, "index.html");
    try {
      res.writeHead(200, {
        "Content-Type": MIMES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(fs.readFileSync(filePath));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const HTTP_PORT = await freePort();
  await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
  const CDP_PORT = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-perf-boss-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      ...getChromeGpuFlags(),
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmp}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true },
  );
  const rows = [];
  const pageErrors = [];
  try {
    let page = null;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        page =
          (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find(
            (t) => t.type === "page",
          ) ?? null;
      } catch {
        // Chrome chưa mở cổng
      }
      if (!page) await sleep(150);
    }
    if (!page) throw new Error("Không tìm thấy Chrome page target.");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let nextId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.method === "Runtime.exceptionThrown")
        pageErrors.push(
          msg.params?.exceptionDetails?.exception?.description?.split("\n")[0] ?? "ngoại lệ",
        );
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
    await send("Page.enable");
    await send("Runtime.enable");

    for (const tier of TIERS) {
      const src = `try { localStorage.setItem('tg_newbie_guide_dismissed','1'); localStorage.setItem('tg_quality','${tier}'); localStorage.removeItem('tg_reduced_motion'); } catch (e) {}`;
      const reg = await send("Page.addScriptToEvaluateOnNewDocument", { source: src });
      await send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await send("Emulation.setCPUThrottlingRate", { rate: CPU });
      await evalJs("window.__isOldPage = true");
      await send("Page.navigate", {
        url: `http://127.0.0.1:${HTTP_PORT}/?dungeon=mock&debug=1&perf=1&map=am_suong`,
      });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        await sleep(200);
        ready = Boolean(
          await evalJs(
            `Boolean(!window.__isOldPage && window.__scene && window.__ui && window.__tgPerf && window.__craftData && !document.getElementById("ui")?.hidden)`,
          ),
        );
      }
      if (!ready) throw new Error(`Cảnh không sẵn sàng (bậc ${tier})`);
      await sleep(800);
      await evalJs(
        `["dungeon-mock-badge", "duel-mock-badge"].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; })`,
      );
      await evalJs(`(() => {
        const sc = window.__scene;
        sc.room.send = () => {};
        const n = window.__craftData.NPC_BY_ID.tho_ren_suong;
        sc.predX = n.x; sc.predY = n.y + 90; sc.cameras.main.centerOn(sc.predX, sc.predY);
        sc.state.monsters.set("m1", { kind: "mang", x: sc.predX + 80, y: sc.predY, hp: 4000, maxHp: 4000, angle: 0, fx: 0, elite: 0 });
        return 1;
      })()`);
      await evalJs(MECH_SOURCE);
      await sleep(1500);
      const ents = await evalJs(`window.__scene.monsters.size`);
      if (!ents)
        throw new Error(
          `Trùm chưa có thực thể trong cảnh (monsters.size = ${ents}); lỗi trang: ${pageErrors.slice(0, 3).join(" | ") || "không"}`,
        );
      const sample = async (name, run) => {
        if (run) await evalJs("window.__bossMech.start(); 1");
        await sleep(1500); // khởi động nhịp
        await evalJs("window.__tgPerf.reset(); 1");
        await sleep(SECONDS * 1000);
        const snap = await evalJs("JSON.stringify(window.__tgPerf.snapshot())");
        if (run) await evalJs("window.__bossMech.stop(); 1");
        const s = JSON.parse(snap);
        const st = await evalJs("JSON.stringify(window.__bossMech.stat)");
        rows.push({ tier, cpu: CPU, name, ...s, mech: run ? JSON.parse(st) : null });
        await sleep(1500); // để hạt / vầng tàn hết trước ca sau
      };
      await sample("nền (trùm đứng yên)", false);
      await sample("đủ cơ chế trùm", true);
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: reg.result.identifier });
    }
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (pageErrors.length)
    console.log(
      `\nLỗi trang (${pageErrors.length}): ${[...new Set(pageErrors)].slice(0, 3).join(" | ")}`,
    );
  console.log(`\nĐo cơ chế trùm: CPU ${CPU}x, ${SECONDS} giây mỗi ca, 390x844 DPR 2\n`);
  console.log(
    "| bậc | ca | FPS | khung p95 (ms) | khung p99 (ms) | > 33 ms | > 50 ms | update TB (ms) | update p95 (ms) |",
  );
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows)
    console.log(
      `| ${r.tier} | ${r.name} | ${r.fpsAvg} | ${r.frameP95Ms} | ${r.frameP99Ms} | ${r.longFramesOver33Ms} | ${r.longFramesOver50Ms} | ${r.updateAvgMs} | ${r.updateP95Ms} |`,
    );
  for (const r of rows)
    if (r.mech)
      console.log(
        `\nBằng chứng cơ chế chạy thật (bậc ${r.tier}): ${r.mech.sent} tin gửi, đỉnh ${r.mech.peakParticles} hạt đang sống, vầng giáp thấy ${r.mech.armorSeen} / giáp bật ${r.mech.armorOn ?? 0} / thực thể ${r.mech.entity ?? 0} / hiện ${r.mech.visible ?? 0} lần lấy mẫu 50 ms`,
      );
  for (const tier of TIERS) {
    const a = rows.find((r) => r.tier === tier && r.name.startsWith("nền"));
    const b = rows.find((r) => r.tier === tier && r.name.startsWith("đủ"));
    if (a && b)
      console.log(
        `\nBậc ${tier}: cơ chế trùm làm FPS ${a.fpsAvg} -> ${b.fpsAvg}, update p95 ${a.updateP95Ms} -> ${b.updateP95Ms} ms (chênh ${(b.updateP95Ms - a.updateP95Ms).toFixed(3)} ms)`,
      );
  }
  // Bằng chứng cơ chế CHẠY THẬT (không để số đẹp mà cơ chế không chạy: một lần ngoại lệ trang làm `update` rẻ giả tạo): tin gửi đủ, vầng giáp bật, hạt đang sống, không lỗi trang
  const bad = [];
  if (pageErrors.length)
    bad.push(`có ${pageErrors.length} lỗi trang: ${[...new Set(pageErrors)][0]}`);
  for (const r of rows.filter((x) => x.mech)) {
    if (r.mech.sent < 40) bad.push(`bậc ${r.tier}: chỉ ${r.mech.sent} tin gửi (cần >= 40)`);
    if ((r.mech.armorSeen ?? 0) < 20)
      bad.push(
        `bậc ${r.tier}: vầng giáp chỉ thấy ${r.mech.armorSeen ?? 0} lần lấy mẫu (cần >= 20)`,
      );
    if (r.mech.peakParticles < 20)
      bad.push(`bậc ${r.tier}: đỉnh hạt chỉ ${r.mech.peakParticles} (cần >= 20)`);
  }
  if (bad.length) {
    console.error(`\n❌ SỐ ĐO KHÔNG ĐÁNG TIN (cơ chế trùm không chạy đủ):\n- ${bad.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
