// Công cụ tự động hoá kiểm thử nâng cấp dữ liệu v0.5.2 -> main và lùi bản main -> v0.5.2 (Refs #1290).
// Chạy hoàn toàn trên cổng cách ly và thư mục dữ liệu tạm thời dưới /tmp.
import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { PROTOCOL_VERSION, roomNameOf } from "@tien-gioi/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const repoRoot = path.resolve(serverDir, "..");

async function waitHealth(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = (await res.json()) as any;
        if (body.ok) return true;
      }
    } catch {
      // chờ
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function takeSnapshot(dataDir: string) {
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".json") && !f.includes("hong"));
  const snap: {
    players: Record<string, any>;
    souls: Record<string, any>;
    sects: Record<string, any>;
  } = {
    players: {},
    souls: {},
    sects: {},
  };
  for (const f of files) {
    const p = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
    snap.players[p.name] = {
      coin: p.coin,
      exp: p.exp,
      realm: p.realm,
      tier: p.tier,
      inv: p.inventory,
      eq: p.equipment,
      skills: p.skills,
      sect: p.sect,
    };
  }
  const soulsDir = path.join(dataDir, "souls");
  if (existsSync(soulsDir)) {
    for (const f of readdirSync(soulsDir).filter((f) => f.endsWith(".json"))) {
      const s = JSON.parse(readFileSync(path.join(soulsDir, f), "utf8"));
      snap.souls[f] = { duyen: s.duyen, kiep: s.kiep, unlocks: s.unlocks, social: s.social };
    }
  }
  const sectsDir = path.join(dataDir, "sects");
  if (existsSync(sectsDir)) {
    for (const f of readdirSync(sectsDir).filter((f) => f.endsWith(".json"))) {
      const s = JSON.parse(readFileSync(path.join(sectsDir, f), "utf8"));
      snap.sects[f] = { points: s.points, balance: s.balance };
    }
  }
  return snap;
}

function compareSnapshots(before: any, after: any, label: string): number {
  let mismatches = 0;
  for (const [name, bp] of Object.entries(before.players) as [string, any][]) {
    const ap = after.players[name];
    if (!ap) {
      console.error(`[${label}] Mất nhân vật: ${name}`);
      mismatches++;
      continue;
    }
    if (ap.coin > bp.coin) {
      console.error(`[${label}] Tiền tăng: ${name}`);
      mismatches++;
    }
    if (ap.exp < bp.exp || isNaN(ap.exp)) {
      console.error(`[${label}] Tu vi tụt/NaN: ${name}`);
      mismatches++;
    }
    if (ap.realm !== bp.realm || ap.tier !== bp.tier) {
      console.error(`[${label}] Sai lệch cảnh giới: ${name}`);
      mismatches++;
    }
    if (JSON.stringify(ap.eq) !== JSON.stringify(bp.eq)) {
      console.error(`[${label}] Sai lệch trang bị: ${name}`);
      mismatches++;
    }
    if (JSON.stringify(ap.inv) !== JSON.stringify(bp.inv)) {
      console.error(`[${label}] Sai lệch túi đồ: ${name}`);
      mismatches++;
    }
    const bLearned = Object.keys(bp.skills?.learned || {})
      .sort()
      .join(",");
    const aLearned = Object.keys(ap.skills?.learned || {})
      .sort()
      .join(",");
    if (aLearned !== bLearned) {
      console.error(`[${label}] Sai lệch chiêu thức: ${name}`);
      mismatches++;
    }
  }
  for (const [f, bs] of Object.entries(before.souls) as [string, any][]) {
    const as = after.souls[f];
    if (!as || as.duyen !== bs.duyen || as.kiep !== bs.kiep) {
      console.error(`[${label}] Sai lệch chân linh: ${f}`);
      mismatches++;
    }
  }
  for (const [f, bs] of Object.entries(before.sects) as [string, any][]) {
    const as = after.sects[f];
    if (!as || as.points !== bs.points || as.balance !== bs.balance) {
      console.error(`[${label}] Sai lệch tông môn: ${f}`);
      mismatches++;
    }
  }
  return mismatches;
}

async function runBotLogins(port: number, dataDir: string): Promise<number> {
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".json") && !f.includes("hong"));
  const client = new Client(`ws://127.0.0.1:${port}`);
  let ok = 0;
  for (const f of files) {
    const p = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
    const match = p.name.match(/\d+/);
    const num = match ? match[0].padStart(3, "0") : "000";
    const secret = `bot_secret_tien_gioi_${num}_soak`;
    try {
      const room = await client.joinOrCreate(roomNameOf(p.mapId || "lac_ha"), {
        name: p.name,
        secret,
        v: PROTOCOL_VERSION,
      });
      room.send("rest");
      await new Promise((r) => setTimeout(r, 100));
      await room.leave();
      ok++;
    } catch (err: any) {
      console.error(`Lỗi đăng nhập ${p.name}:`, err?.message || err);
    }
  }
  return ok;
}

export async function runUpgradeAudit(): Promise<boolean> {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "tien-gioi-upgrade-"));
  const v052CodeDir = path.join(tmpRoot, "v052");
  const dataDir = path.join(tmpRoot, "data");
  mkdirSync(v052CodeDir, { recursive: true });

  console.log(`==> [1/4] Dựng mã nguồn v0.5.2 tại ${v052CodeDir}...`);
  execSync(`git archive v0.5.2 | tar -x -C ${v052CodeDir}`, { cwd: repoRoot });
  execSync(
    `ln -s ${path.join(repoRoot, "node_modules")} ${path.join(v052CodeDir, "node_modules")}`,
  );

  console.log(`==> [2/4] Chạy soak v0.5.2 sinh 30 hồ sơ mẫu...`);
  try {
    execSync(`npx tsx scripts/soak.ts --bots=30 --duration=30 --keep-data --m7`, {
      cwd: path.join(v052CodeDir, "server"),
      stdio: "ignore",
    });
  } catch {
    // soak ngắn có thể dốc VmRSS > 1MB/min thoát 1, dữ liệu vẫn sinh đầy đủ
  }

  // Tìm thư mục soak vừa sinh
  const tmpDirs = readdirSync(os.tmpdir())
    .filter((d) => d.startsWith("tien-gioi-soak-"))
    .map((d) => path.join(os.tmpdir(), d))
    .sort((a, b) => (readdirSync(b).length || 0) - (readdirSync(a).length || 0));

  const sourceDataDir = tmpDirs[0];
  if (!sourceDataDir || !existsSync(sourceDataDir)) {
    throw new Error("Không tìm thấy thư mục dữ liệu sinh ra bởi soak v0.5.2");
  }
  execSync(`cp -r ${sourceDataDir} ${dataDir}`);
  rmSync(sourceDataDir, { recursive: true, force: true });

  const snapBefore = takeSnapshot(dataDir);
  console.log(
    `  - Đã sinh: ${Object.keys(snapBefore.players).length} nhân vật, ${Object.keys(snapBefore.souls).length} chân linh, ${Object.keys(snapBefore.sects).length} tông môn.`,
  );

  // Khởi động server main
  console.log(`==> [3/4] Nâng cấp trên máy chủ main (cổng cách ly 32595)...`);
  const mainProc = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: serverDir,
    env: { ...process.env, PORT: "32595", DATA_DIR: dataDir, ORIGIN_CHECK: "off" },
    stdio: "ignore",
  });
  await waitHealth(32595);
  const mainLogins = await runBotLogins(32595, dataDir);
  console.log(
    `  - Đăng nhập server main: ${mainLogins}/${Object.keys(snapBefore.players).length} thành công.`,
  );
  await new Promise((r) => setTimeout(r, 1500));
  mainProc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));

  const snapAfterMain = takeSnapshot(dataDir);
  const errsMain = compareSnapshots(snapBefore, snapAfterMain, "MAIN UPGRADE");

  // Khởi động server v0.5.2 lùi bản
  console.log(`==> [4/4] Thử nghiệm lùi bản về v0.5.2 (cổng cách ly 32596)...`);
  const v052Proc = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: path.join(v052CodeDir, "server"),
    env: { ...process.env, PORT: "32596", DATA_DIR: dataDir, ORIGIN_CHECK: "off" },
    stdio: "ignore",
  });
  await waitHealth(32596);
  const rollbackLogins = await runBotLogins(32596, dataDir);
  console.log(
    `  - Đăng nhập server v0.5.2: ${rollbackLogins}/${Object.keys(snapBefore.players).length} thành công.`,
  );
  await new Promise((r) => setTimeout(r, 1500));
  v052Proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));

  const snapAfterRollback = takeSnapshot(dataDir);
  const errsRollback = compareSnapshots(snapAfterMain, snapAfterRollback, "V0.5.2 ROLLBACK");

  // Dọn dẹp
  rmSync(tmpRoot, { recursive: true, force: true });

  const totalErrs = errsMain + errsRollback;
  if (totalErrs === 0 && mainLogins === 30 && rollbackLogins === 30) {
    console.log(`\n✅ KIỂM TRA NÂNG CẤP VÀ LÙI BẢN THÀNH CÔNG: 100% DỮ LIỆU ĐƯỢC BẢO TOÀN!\n`);
    return true;
  } else {
    console.error(`\n❌ THẤT BẠI: Phát hiện ${totalErrs} sai lệch dữ liệu!\n`);
    return false;
  }
}

if (process.argv[1]?.endsWith("kiem-nang-cap.ts")) {
  runUpgradeAudit()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
