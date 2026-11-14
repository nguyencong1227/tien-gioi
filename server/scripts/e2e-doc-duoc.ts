// E2E THẬT "ô chặn đọc ra được" (M6, #408 bước 3): server Colyseus thật + Chrome headless + client đã build, vào game thật.
// Ở mỗi bản đồ (Lạc Hà, Hắc Phong Cốc, Âm Sương Trạch) và MỌI bậc chất lượng (Thấp / Vừa / Cao), với sương + thời tiết + nước BẬT: đưa camera tới
// một cặp ô (ô chặn: nước / đá / cây, kề một ô đi được), chụp canvas WebGL THẬT và đo độ khác màu giữa hai ô. Sương dày + ánh sáng + hạt thời tiết
// không được làm ô chặn "chìm" vào nền đi được (người chơi phải đọc ra chỗ nào không đi qua được). Âm Sương có sương dày nhất nên là ca xấu nhất.
// Chạy: `npm run build && npm run e2e:doc-duoc -w server` (cần google-chrome). Khung server / Chrome / đăng nhập giống `e2e-chuyen-canh.ts`.
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Tab, sleep, listenWithRetry, removeTmpDirs, getChromeGpuFlags } from "./e2e-kit";
import { T as TILE_T, TILE, getMap } from "@tien-gioi/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const clientDist = path.resolve(repoRoot, "client/dist");
const pickPort = () => 38000 + Math.floor(Math.random() * 2000);
let PORT = pickPort();
const CDP = 9800 + Math.floor(Math.random() * 300);
const out = (m: string) => console.log(m);

async function main() {
  out("=== E2E THẬT ô chặn đọc ra được: server Colyseus thật + Chrome headless ===");
  if (!existsSync(path.join(clientDist, "index.html"))) {
    execSync("npm run build -w client", { cwd: repoRoot, stdio: "inherit" });
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-doc-duoc-data-"));
  const chromeDir = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-e2e-doc-duoc-chrome-"));
  process.env.DATA_DIR = dataDir;
  const { defineRooms } = await import("../src/rooms/WorldRoom.js");
  const { savePlayer, hashSecret } = await import("../src/store.js");

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  const httpServer = http.createServer(app);
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  defineRooms(gameServer);
  // Lỗi listen (cổng bận) phải thành lỗi THẬT (e2e-kit.listenWithRetry): `new Promise((r) => server.listen(PORT, r))` không bao giờ resolve khi cổng bận
  // nên script thoát mã 0 không in gì (false green) và sót thư mục tạm. Cổng ngẫu nhiên bận thì thử cổng khác.
  try {
    PORT = await listenWithRetry(httpServer, PORT, { explicit: false, pick: pickPort });
  } catch (err) {
    await removeTmpDirs(dataDir, chromeDir);
    throw err;
  }

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
        ...getChromeGpuFlags(),
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

    let currentName = "DD Lac Ha";
    let currentSecret = "e2e_secret_dd_1111111111111";
    let scriptId: string | null = null;
    const setStorage = async (extra: string) => {
      if (scriptId)
        await T.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId });
      const r = await T.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          `localStorage.setItem("tg_newbie_guide_dismissed", "1"); localStorage.setItem("tien-gioi:name", ${JSON.stringify(currentName)});` +
          ` localStorage.setItem("tien-gioi:secret", ${JSON.stringify(currentSecret)}); ${extra}`,
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
        `const inp = document.getElementById('login-name'); if (inp) inp.value = ${JSON.stringify(currentName)}; document.getElementById('login-form').requestSubmit(); 1`,
      );
      try {
        await T.waitFor(
          `!document.getElementById('ui')?.hidden && !!window.__scene?.room && !!document.getElementById('hud-name')?.textContent`,
          "vào game thành công",
        );
      } catch (err) {
        // Chẩn đoán: lỗi hiện trên màn đăng nhập + lỗi console (vd. wrong_map không được xử lý, mã bí mật sai)
        const info = await ev(
          `JSON.stringify({ err: document.getElementById('login-error')?.textContent || document.querySelector('.auth-error, #auth-msg, .login-msg')?.textContent || '', ui: !document.getElementById('ui')?.hidden, room: !!window.__scene?.room, url: location.href })`,
        );
        out(
          `  (chẩn đoán đăng nhập: ${info}; console: ${T.errors.slice(0, 6).join(" | ")}; trang: ${String(await ev(`document.body.innerText.slice(0, 300)`)).replace(/\s+/g, " ")})`,
        );
        throw err;
      }
    };
    const url = `http://127.0.0.1:${PORT}/?debug=1&weather=1&fog=1&water=1`;
    const ev = (expr: string) => T.ev(expr) as Promise<any>;

    // ---- Chọn cặp ô (chặn, đi được) gần chỗ xuất hiện nhất, đủ xa người chơi để sprite không che ----
    const GROUND = new Set<number>([TILE_T.Grass, TILE_T.Dirt, TILE_T.Sand, TILE_T.TallGrass]);
    type Probe = { kind: string; bx: number; by: number; gx: number; gy: number };
    const findProbes = (mapId: string, from: { x: number; y: number }): Probe[] => {
      const m = getMap(mapId)!;
      const { w, h } = m.def;
      const fx = Math.floor(from.x / TILE);
      const fy = Math.floor(from.y / TILE);
      const kinds: [string, number][] = [
        ["nước", TILE_T.Water],
        ["đá", TILE_T.Rock],
        ["cây", TILE_T.Tree],
      ];
      const out2: Probe[] = [];
      for (const [kind, tt] of kinds) {
        let best: (Probe & { d: number }) | null = null;
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            if (m.tiles[y * w + x] !== tt) continue;
            const d = Math.hypot(x - fx, y - fy);
            if (d < 5 || d > 60 || (best && d >= best.d)) continue;
            // ô chặn kề (4 hướng) một ô đi được, và hai ô cùng nằm ngoài trấn / cổng (không có trang trí che)
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const g = m.tiles[(y + dy) * w + (x + dx)];
              if (GROUND.has(g)) {
                best = { kind, bx: x, by: y, gx: x + dx, gy: y + dy, d };
                break;
              }
            }
          }
        if (best) out2.push(best);
      }
      return out2;
    };

    const SAMPLE_JS = (
      p: Probe,
    ) => `new Promise((resolve) => { const s = window.__scene, g = s.game, cam = s.cameras.main, TS = ${TILE};
      cam.stopFollow(); const cx = (${p.bx} + ${p.gx}) / 2 * TS + TS / 2, cy = (${p.by} + ${p.gy}) / 2 * TS + TS / 2; cam.centerOn(cx, cy);
      const grab = () => new Promise((res) => g.renderer.snapshotArea(0, 0, g.canvas.width, g.canvas.height, (img) => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const wv = cam.worldView, k = img.width / cam.width, z = cam.zoom;
        const patch = (tx, ty) => { const px = (tx * TS + TS / 2 - wv.x) * z * k, py = (ty * TS + TS / 2 - wv.y) * z * k, r = Math.max(2, TS * 0.22 * z * k);
          const d = x.getImageData(Math.round(px - r), Math.round(py - r), Math.round(2 * r), Math.round(2 * r)).data; let R = 0, G = 0, B = 0, n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; } return [R / n, G / n, B / n, px, py]; };
        res({ blocked: patch(${p.bx}, ${p.by}), ground: patch(${p.gx}, ${p.gy}), w: img.width, h: img.height }); }));
      setTimeout(async () => { const out = []; for (let i = 0; i < 3; i++) { out.push(await grab()); await new Promise((r) => setTimeout(r, 160)); } resolve(out); }, 450); })`;

    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const median3 = (v: number[]) => v.slice().sort((a, b) => a - b)[1];

    const MAPS_TO_CHECK: { id: string; name: string; secret: string }[] = [
      { id: "lac_ha", name: "DD Lac Ha", secret: "e2e_secret_dd_1111111111111" },
      { id: "hac_phong", name: "DD Hac Phong", secret: "e2e_secret_dd_2222222222222" },
      { id: "am_suong", name: "DD Am Suong", secret: "e2e_secret_dd_3333333333333" },
    ];
    const QUALITIES = ["low", "mid", "high"];
    const table: Record<string, Record<string, Record<string, number>>> = {};

    for (const mp of MAPS_TO_CHECK) {
      const map = getMap(mp.id)!;
      const spawn = map.portals[0].spawn;
      await savePlayer({
        name: mp.name,
        secretHash: hashSecret(mp.secret),
        realm: 3,
        tier: 0,
        exp: 0,
        mapId: mp.id,
        x: spawn.x,
        y: spawn.y,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      currentName = mp.name;
      currentSecret = mp.secret;
      await setStorage("");
      await login(url);
      await T.waitFor(
        `window.__scene && window.__scene.map && window.__scene.map.def.id === ${JSON.stringify(mp.id)}`,
        `vào đúng phòng ${mp.id}`,
        30000,
      );
      const probes = findProbes(mp.id, spawn);
      must(
        probes.length >= 2,
        `${mp.id}: tìm được cặp ô chặn / đi được gần chỗ xuất hiện (${probes.map((p) => p.kind).join(", ")})`,
      );
      out(
        `\n--- ${mp.id}: ${probes.map((p) => `${p.kind} (${p.bx},${p.by}) kề (${p.gx},${p.gy})`).join("; ")} ---`,
      );
      table[mp.id] = {};
      for (const q of QUALITIES) {
        await ev(
          `(() => { const s = document.getElementById('set-quality'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('change')); })(); 1`,
        );
        await sleep(700);
        table[mp.id][q] = {};
        for (const p of probes) {
          const reads = (await ev(SAMPLE_JS(p))) as { blocked: number[]; ground: number[] }[];
          const c = median3(reads.map((r) => dist(r.blocked, r.ground)));
          table[mp.id][q][p.kind] = c;
          // Ảnh chụp để xem bằng mắt (tuỳ chọn): DOC_DUOC_SHOTS=<thư mục> (không đặt thì bỏ qua)
          if (process.env.DOC_DUOC_SHOTS) {
            mkdirSync(process.env.DOC_DUOC_SHOTS, { recursive: true });
            const shot = await T.send("Page.captureScreenshot", { format: "png" });
            writeFileSync(
              path.join(process.env.DOC_DUOC_SHOTS, `doc-duoc-${mp.id}-${q}-${p.kind}.png`),
              Buffer.from(String(shot.result?.data ?? ""), "base64"),
            );
          }
          const b = reads[1].blocked.map((v) => Math.round(v)).join(",");
          const g = reads[1].ground
            .map((v) => Math.round(v))
            .slice(0, 3)
            .join(",");
          out(
            `  ${q.padEnd(4)} ${p.kind.padEnd(5)} khác màu ${c.toFixed(1).padStart(6)}  (chặn rgb ${b.split(",").slice(0, 3).join(",")} | đi được rgb ${g})`,
          );
        }
      }
    }

    out("\n--- Ngưỡng ---");
    // 1) Phép đo có thật: ở bậc Thấp (không sương / ánh sáng) mọi ô chặn khác ô đi được rõ rệt (đo trượt, vd chụp nhầm chỗ, sẽ ra gần 0).
    // 2) Sàn tuyệt đối ở mọi bậc: khoảng cách RGB >= 25 / 441 (số đo thấp nhất hiện nay: 33 ở đá Âm Sương, bậc Vừa).
    // 3) Âm Sương (sương dày nhất) không tệ hơn Hắc Phong Cốc (bản đồ tối đã duyệt) quá 30%, cùng bậc, cùng loại ô.
    const FLOOR_LOW = 40;
    const FLOOR_ALL = 25;
    const REL_AM_SUONG = 0.7;
    for (const [mapId, qs] of Object.entries(table))
      for (const [q, kinds] of Object.entries(qs))
        for (const [kind, c] of Object.entries(kinds)) {
          if (q === "low")
            must(
              c >= FLOOR_LOW,
              `${mapId} / thấp / ${kind}: phép đo có thật, khác màu ${c.toFixed(1)} >= ${FLOOR_LOW}`,
            );
          must(
            c >= FLOOR_ALL,
            `${mapId} / ${q} / ${kind}: khác màu ${c.toFixed(1)} >= ${FLOOR_ALL}`,
          );
        }
    ok(
      `phép đo có thật (bậc Thấp >= ${FLOOR_LOW}) và mọi ô chặn đọc ra được (>= ${FLOOR_ALL}) ở mọi bản đồ x bậc chất lượng`,
    );
    for (const q of QUALITIES)
      for (const kind of Object.keys(table.am_suong[q])) {
        const a = table.am_suong[q][kind];
        const h = table.hac_phong[q][kind];
        if (h === undefined) continue;
        must(
          a >= REL_AM_SUONG * h,
          `am_suong / ${q} / ${kind}: ${a.toFixed(1)} >= ${REL_AM_SUONG} x Hắc Phong (${h.toFixed(1)})`,
        );
      }
    ok(
      `Âm Sương không tệ hơn Hắc Phong Cốc quá ${Math.round((1 - REL_AM_SUONG) * 100)}% ở mọi bậc chất lượng và loại ô`,
    );
    must(T.errors.length === 0, `0 lỗi console / exception (${T.errors.slice(0, 2).join(" | ")})`);
    ok("0 lỗi console / exception");
    out("\n=== E2E Ô CHẶN ĐỌC RA ĐƯỢC ĐẠT ===");
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err);
    out(`\n  ✗ THẤT BẠI: ${failed}`);
  } finally {
    if (tab) {
      try {
        await tab.close();
      } catch {
        /* bỏ qua */
      }
    }
    // detached: Chrome là chủ một NHÓM tiến trình; giết cả nhóm (-pid) thì tiến trình con (gpu, renderer) không sống sót để ghi lại thư mục dữ liệu
    if (chrome?.pid) {
      try {
        process.kill(-chrome.pid, "SIGKILL");
      } catch {
        chrome.kill("SIGKILL");
      }
    }
    await new Promise<void>((r) => httpServer.close(() => r()));
    // false: mặc định Colyseus GỌI process.exit ngay trong gracefullyShutdown nên các dòng dọn dẹp phía sau không bao giờ chạy (sót thư mục /tmp/tien-gioi-e2e-*)
    await gameServer.gracefullyShutdown(false);
    try {
      // Chrome vừa bị SIGKILL: tiến trình con còn ghi thư mục dữ liệu một lúc, xoá ngay thì sót lại /tmp/tien-gioi-e2e-*-chrome-*: chờ rồi xoá hai lần
      await sleep(1200);
      execSync(`rm -rf "${dataDir}" "${chromeDir}"`);
      await sleep(600);
      execSync(`rm -rf "${chromeDir}"`);
    } catch {
      /* bỏ qua */
    }
  }
  if (failed) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi thực thi main:", err);
  process.exit(1);
});
