import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { PROTOCOL_VERSION, roomNameOf, DEFAULT_MAP_ID } from "@tien-gioi/shared";
import { auditSavesDirectory } from "./audit-saves";
import { freePort } from "../src/test-port";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const repoRoot = path.resolve(here, "../..");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Các trường được phép biến động thời gian giữa các lần nạp/ghi nhân vật */
export const ALLOWED_DYNAMIC_PLAYER_FIELDS = new Set(["updatedAt", "life.playMs"]);

/** So sánh đệ quy toàn bộ cây đối tượng JSON giữa bản ghi trước và sau */
export function deepCompareEntities(
  before: Record<string, any>,
  after: Record<string, any>,
  prefix = "",
): Array<{ keyPath: string; before: any; after: any }> {
  const diffs: Array<{ keyPath: string; before: any; after: any }> = [];
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  for (const k of allKeys) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (ALLOWED_DYNAMIC_PLAYER_FIELDS.has(fullKey)) continue;

    const valBefore = before[k];
    const valAfter = after[k];

    if (valBefore === undefined && valAfter !== undefined) {
      diffs.push({ keyPath: fullKey, before: undefined, after: valAfter });
    } else if (valBefore !== undefined && valAfter === undefined) {
      diffs.push({ keyPath: fullKey, before: valBefore, after: undefined });
    } else if (
      typeof valBefore === "object" &&
      valBefore !== null &&
      typeof valAfter === "object" &&
      valAfter !== null
    ) {
      if (Array.isArray(valBefore) && Array.isArray(valAfter)) {
        if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
          diffs.push({ keyPath: fullKey, before: valBefore, after: valAfter });
        }
      } else if (!Array.isArray(valBefore) && !Array.isArray(valAfter)) {
        diffs.push(...deepCompareEntities(valBefore, valAfter, fullKey));
      } else {
        diffs.push({ keyPath: fullKey, before: valBefore, after: valAfter });
      }
    } else if (valBefore !== valAfter) {
      diffs.push({ keyPath: fullKey, before: valBefore, after: valAfter });
    }
  }

  return diffs;
}

/** Chụp bản sao JSON của toàn bộ thư mục dữ liệu */
export function takeDirectorySnapshot(dataDir: string): Map<string, Record<string, any>> {
  const snapshot = new Map<string, Record<string, any>>();
  function walk(currentDir: string, relativePrefix = "") {
    if (!fs.existsSync(currentDir)) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
          snapshot.set(relPath, content);
        } catch {
          /* bỏ qua */
        }
      }
    }
  }
  walk(dataDir);
  return snapshot;
}

/** So sánh hai snapshot thư mục */
export function compareDirectorySnapshots(
  before: Map<string, Record<string, any>>,
  after: Map<string, Record<string, any>>,
): {
  missingFiles: string[];
  addedFiles: string[];
  mismatchedFiles: Array<{
    file: string;
    diffs: Array<{ keyPath: string; before: any; after: any }>;
  }>;
} {
  const missingFiles: string[] = [];
  const addedFiles: string[] = [];
  const mismatchedFiles: Array<{
    file: string;
    diffs: Array<{ keyPath: string; before: any; after: any }>;
  }> = [];

  for (const [file, beforeData] of before) {
    if (!after.has(file)) {
      missingFiles.push(file);
      continue;
    }
    const afterData = after.get(file)!;
    const diffs = deepCompareEntities(beforeData, afterData);
    if (diffs.length > 0) {
      mismatchedFiles.push({ file, diffs });
    }
  }

  for (const file of after.keys()) {
    if (!before.has(file)) {
      addedFiles.push(file);
    }
  }

  return { missingFiles, addedFiles, mismatchedFiles };
}

export interface VerifyPhaseArgs {
  phaseName: string;
  snapshotBefore: Map<string, Record<string, any>>;
  snapshotAfter: Map<string, Record<string, any>>;
  loginCount: number;
  expectedLogins: number;
}

export interface VerifyPhaseResult {
  valid: boolean;
  errors: string[];
}

/** Kiểm tra tính đúng đắn của từng chặng thực nghiệm (nâng cấp hoặc lùi bản) */
export function verifyPhase(args: VerifyPhaseArgs): VerifyPhaseResult {
  const errors: string[] = [];

  // 1. Kiểm tra số lượng bot đăng nhập
  if (args.loginCount !== args.expectedLogins) {
    errors.push(
      `[${args.phaseName}] Số bot đăng nhập không đủ: đạt ${args.loginCount}/${args.expectedLogins}`,
    );
  }

  // 2. So sánh snapshot tệp (missingFiles, addedFiles, mismatchedFiles)
  const comp = compareDirectorySnapshots(args.snapshotBefore, args.snapshotAfter);
  if (comp.missingFiles.length > 0) {
    errors.push(`[${args.phaseName}] Có tệp bị mất: ${comp.missingFiles.join(", ")}`);
  }
  if (comp.addedFiles.length > 0) {
    errors.push(`[${args.phaseName}] Có tệp bị thêm bất thường: ${comp.addedFiles.join(", ")}`);
  }
  if (comp.mismatchedFiles.length > 0) {
    for (const m of comp.mismatchedFiles) {
      errors.push(
        `[${args.phaseName}] Tệp ${m.file} có trường sai lệch: ${m.diffs.map((d) => `${d.keyPath} (trước: ${JSON.stringify(d.before)}, sau: ${JSON.stringify(d.after)})`).join("; ")}`,
      );
    }
  }

  // 3. Kiểm tra bằng chứng server THỰC SỰ nạp và ghi lại từng tệp nhân vật
  for (const [file, beforeData] of args.snapshotBefore) {
    // Chỉ kiểm tra các tệp nhân vật ở thư mục gốc (không nằm trong souls/ hay sects/)
    if (file.includes("/")) continue;
    const afterData = args.snapshotAfter.get(file);
    if (!afterData) continue;

    const beforeUpdated = beforeData.updatedAt ?? 0;
    const afterUpdated = afterData.updatedAt ?? 0;
    const beforePlayMs = beforeData.life?.playMs ?? 0;
    const afterPlayMs = afterData.life?.playMs ?? 0;

    const hasWritten = afterUpdated > beforeUpdated || afterPlayMs > beforePlayMs;
    if (!hasWritten) {
      errors.push(
        `[${args.phaseName}] Tệp nhân vật ${file} không có bằng chứng được server ghi lại (updatedAt: ${beforeUpdated} -> ${afterUpdated}, playMs: ${beforePlayMs} -> ${afterPlayMs})`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Chờ cổng nhả hoàn toàn */
export async function waitForPortFree(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isFree = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.unref();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => {
        s.close(() => resolve(true));
      });
    });
    if (isFree) return;
    await sleep(100);
  }
  throw new Error(`Cổng ${port} không được giải phóng sau ${timeoutMs}ms!`);
}

/** Chờ server sẵn sàng tại cổng */
export async function waitForServerReady(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* chưa sẵn sàng */
    }
    await sleep(200);
  }
  throw new Error(`Server tại cổng ${port} không phản hồi /health sau ${timeoutMs}ms!`);
}

/** Tắt tiến trình server sạch sẽ */
export async function stopServerGracefully(proc: ChildProcess, port: number): Promise<void> {
  if (!proc || proc.killed) return;
  proc.kill("SIGTERM");

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => proc.once("exit", () => resolve(true))),
    sleep(6000).then(() => false),
  ]);

  if (!exited) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* bỏ qua */
    }
  }

  await waitForPortFree(port, 5000);
}

/** Đăng nhập bot qua Colyseus client để kích hoạt nạp/lưu */
export async function simulatePlayerLogins(port: number, dataDir: string): Promise<number> {
  const client = new Client(`ws://127.0.0.1:${port}`);
  const playerFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));
  let loginCount = 0;

  for (const file of playerFiles) {
    const fullPath = path.join(dataDir, file);
    let raw: Record<string, any>;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch {
      continue;
    }
    const botName = raw.name;
    if (!botName) continue;

    const match = String(botName).match(/(\d+)/);
    const botNum = match ? match[1]!.padStart(3, "0") : "001";
    const secret = `bot_secret_tien_gioi_${botNum}_soak`;

    const mapId = raw.mapId ?? DEFAULT_MAP_ID;
    const roomName = roomNameOf(mapId);

    try {
      const room = await client.joinOrCreate(roomName, {
        name: botName,
        secret,
        v: PROTOCOL_VERSION,
      });

      // Gửi lệnh đả tọa ngắn
      room.send("rest");
      await sleep(60);
      await room.leave();
      loginCount++;
    } catch (err) {
      console.error(`[LỖI] Đăng nhập bot ${botName} thất bại:`, err);
      throw new Error(`Đăng nhập bot ${botName} thất bại: ${String(err)}`, { cause: err });
    }
  }

  return loginCount;
}

async function run() {
  console.log("================================================================================");
  console.log("    CÔNG CỤ KIỂM TRA NÂNG CẤP & LÙI BẢN DỮ LIỆU TỰ ĐỘNG (Refs #1290)");
  console.log("================================================================================");
  console.log(
    "[CẢNH BÁO] ORIGIN_CHECK=off được sử dụng trong bài kiểm tra này để bot kết nối cục bộ.",
  );

  const tagArg = process.argv.find((a) => a.startsWith("--tag="))?.slice(6) || "v0.5.2";
  if (!/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tagArg)) {
    throw new Error(`Tag không hợp lệ: "${tagArg}". Phải có dạng vX.Y.Z`);
  }
  const tag = tagArg;

  const numBots = Number(process.argv.find((a) => a.startsWith("--bots="))?.slice(7)) || 30;
  const duration = Number(process.argv.find((a) => a.startsWith("--duration="))?.slice(11)) || 30;

  const tempDirsToClean: string[] = [];
  const activeProcesses: Array<{ proc: ChildProcess; port: number }> = [];

  try {
    // 1. Dựng mã cũ vào thư mục tạm
    console.log(`\n==> [1/6] Dựng mã nguồn phiên bản ${tag} vào thư mục tạm...`);
    const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "tien-gioi-rc-archive-"));
    tempDirsToClean.push(archiveDir);
    execSync(`git archive ${tag} | tar -x -C ${archiveDir}`, { stdio: "ignore" });

    // Symlink node_modules
    fs.symlinkSync(
      path.join(repoRoot, "node_modules"),
      path.join(archiveDir, "node_modules"),
      "dir",
    );
    console.log(`    Đã giải nén tại: ${archiveDir}`);

    // 2. Chạy soak mã cũ để sinh dữ liệu
    console.log(`\n==> [2/6] Chạy soak sinh dữ liệu ${tag} (${numBots} bot, ${duration}s)...`);
    const beforeDirs = new Set(
      fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("tien-gioi-soak-")),
    );
    const soakPort = await freePort();

    execSync(
      `nice -n 10 npx tsx scripts/soak.ts --bots=${numBots} --duration=${duration} --keep-data --m7 --port=${soakPort}`,
      {
        cwd: path.join(archiveDir, "server"),
        stdio: "inherit",
        timeout: (duration + 120) * 1000,
      },
    );

    const afterDirs = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("tien-gioi-soak-"));
    const newSoakDirs = afterDirs.filter((d) => !beforeDirs.has(d));
    if (newSoakDirs.length !== 1) {
      throw new Error(
        `Kỳ vọng đúng 1 thư mục soak mới, nhưng tìm thấy ${newSoakDirs.length}: ${newSoakDirs.join(", ")}`,
      );
    }
    const sourceDataDir = path.join(os.tmpdir(), newSoakDirs[0]!);
    tempDirsToClean.push(sourceDataDir);
    console.log(`    Dữ liệu được sinh tại: ${sourceDataDir}`);

    // 3. Chuẩn bị thư mục nâng cấp lên main
    console.log("\n==> [3/6] Chuẩn bị thư mục nâng cấp lên main...");
    const upgradeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tien-gioi-rc-upgrade-main-"));
    tempDirsToClean.push(upgradeDataDir);
    execSync(`cp -r ${sourceDataDir}/* ${upgradeDataDir}/`);

    // Audit trước nâng cấp
    const auditBefore = auditSavesDirectory(upgradeDataDir);
    console.log(
      `    kiem-save trước nâng cấp: ${auditBefore.cleanFiles} nv, ${auditBefore.cleanSouls} chân linh, ${auditBefore.cleanSects} tông môn (Lỗi: ${auditBefore.errorFiles})`,
    );
    if (auditBefore.errorFiles > 0) throw new Error("Dữ liệu gốc có lỗi!");

    const snapshotBefore = takeDirectorySnapshot(upgradeDataDir);

    // 4. Khởi động server main để nạp/ghi dữ liệu
    console.log("\n==> [4/6] Khởi động server main để nạp & ghi lại dữ liệu...");
    const mainPort = await freePort();
    const mainProc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDir,
      env: {
        ...process.env,
        PORT: String(mainPort),
        DATA_DIR: upgradeDataDir,
        STORE: "file",
        ORIGIN_CHECK: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeProcesses.push({ proc: mainProc, port: mainPort });
    await waitForServerReady(mainPort);
    console.log(`    Server main sẵn sàng tại cổng ${mainPort}`);

    const mainLogins = await simulatePlayerLogins(mainPort, upgradeDataDir);
    console.log(
      `    Đã cho ${mainLogins}/${auditBefore.cleanFiles} bot đăng nhập, gửi lệnh và ngắt kết nối.`,
    );

    await stopServerGracefully(mainProc, mainPort);
    activeProcesses.pop();
    console.log("    Server main đã tắt êm ái.");

    // Kiểm tra sau nâng cấp
    const auditAfter = auditSavesDirectory(upgradeDataDir);
    console.log(
      `    kiem-save sau nâng cấp: ${auditAfter.cleanFiles} nv, ${auditAfter.cleanSouls} chân linh, ${auditAfter.cleanSects} tông môn (Lỗi: ${auditAfter.errorFiles})`,
    );
    if (auditAfter.errorFiles > 0) throw new Error("Dữ liệu sau nâng cấp có lỗi!");

    const snapshotAfterUpgrade = takeDirectorySnapshot(upgradeDataDir);
    const upgradeVerification = verifyPhase({
      phaseName: "Nâng cấp lên main",
      snapshotBefore,
      snapshotAfter: snapshotAfterUpgrade,
      loginCount: mainLogins,
      expectedLogins: auditBefore.cleanFiles,
    });

    if (!upgradeVerification.valid) {
      console.error("[LỖI] Kiểm tra chặng Nâng cấp thất bại:");
      for (const err of upgradeVerification.errors) {
        console.error(`- ${err}`);
      }
      throw new Error("Chặng nâng cấp lên main thất bại!");
    }
    console.log(
      "    Bảo toàn toàn bộ cây JSON sau nâng cấp ĐẠT (mọi tệp nhân vật đều được nạp/ghi lại thành công).",
    );

    // 5. Thử nghiệm lùi bản về mã cũ
    console.log(`\n==> [5/6] Thử nghiệm lùi bản về server ${tag}...`);
    const rollbackDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tien-gioi-rc-rollback-"));
    tempDirsToClean.push(rollbackDataDir);
    execSync(`cp -r ${upgradeDataDir}/* ${rollbackDataDir}/`);

    const rollbackPort = await freePort();
    const rollbackProc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: path.join(archiveDir, "server"),
      env: {
        ...process.env,
        PORT: String(rollbackPort),
        DATA_DIR: rollbackDataDir,
        STORE: "file",
        ORIGIN_CHECK: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeProcesses.push({ proc: rollbackProc, port: rollbackPort });
    await waitForServerReady(rollbackPort);
    console.log(`    Server ${tag} sẵn sàng tại cổng ${rollbackPort}`);

    const rollbackLogins = await simulatePlayerLogins(rollbackPort, rollbackDataDir);
    console.log(
      `    Đã cho ${rollbackLogins}/${auditAfter.cleanFiles} bot đăng nhập lại trên ${tag}.`,
    );

    await stopServerGracefully(rollbackProc, rollbackPort);
    activeProcesses.pop();
    console.log(`    Server ${tag} đã tắt êm ái.`);

    // Kiểm tra sau lùi bản
    const auditRollback = auditSavesDirectory(rollbackDataDir);
    console.log(
      `    kiem-save sau lùi bản: ${auditRollback.cleanFiles} nv, ${auditRollback.cleanSouls} chân linh, ${auditRollback.cleanSects} tông môn (Lỗi: ${auditRollback.errorFiles})`,
    );
    if (auditRollback.errorFiles > 0) throw new Error("Dữ liệu sau lùi bản có lỗi!");

    const snapshotAfterRollback = takeDirectorySnapshot(rollbackDataDir);
    const rollbackVerification = verifyPhase({
      phaseName: `Lùi bản về ${tag}`,
      snapshotBefore: snapshotAfterUpgrade,
      snapshotAfter: snapshotAfterRollback,
      loginCount: rollbackLogins,
      expectedLogins: auditAfter.cleanFiles,
    });

    if (!rollbackVerification.valid) {
      console.error("[LỖI] Kiểm tra chặng Lùi bản thất bại:");
      for (const err of rollbackVerification.errors) {
        console.error(`- ${err}`);
      }
      throw new Error(`Chặng lùi bản về ${tag} thất bại!`);
    }
    console.log(`    Bảo toàn toàn bộ cây JSON sau lùi bản về ${tag} ĐẠT.`);

    console.log(
      "\n================================================================================",
    );
    console.log("🎉 KẾT QUẢ: THỰC NGHIỆM NÂNG CẤP VÀ LÙI BẢN DỮ LIỆU ĐẠT 100%!");
    console.log("================================================================================");
  } finally {
    // Luôn luôn tắt các tiến trình còn sót
    for (const item of activeProcesses) {
      try {
        await stopServerGracefully(item.proc, item.port);
      } catch {
        /* bỏ qua */
      }
    }
    // Dọn dẹp thư mục tạm
    for (const dir of tempDirsToClean) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* bỏ qua */
      }
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("kiem-nang-cap.ts")) {
  run().catch((err) => {
    console.error("\n[THẤT BẠI]", err);
    process.exit(1);
  });
}
