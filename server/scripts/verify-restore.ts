// Kịch bản khôi phục sao lưu có kiểm chứng (M4 3.4 - Issue #276).
// Luồng thực hiện:
// 1. Tạo dữ liệu mẫu thật trong thư mục tạm bằng chính các kho / dịch vụ của server:
//    - Nhân vật (hồ sơ JSON chuẩn mapId lac_ha, có trang bị, túi đồ, nhiệm vụ).
//    - Chân linh (FileSoulStore).
//    - Tông môn (FileSectStore).
//    - Tài khoản + Phiên đăng nhập (AuthService + FileAccountStore + FileSessionStore).
// 2. Tính SHA-256 hash của từng tệp trước khi sao lưu.
// 3. Thực hiện sao lưu bằng performBackup (tương đương npm run backup).
// 4. Xoá sạch thư mục dữ liệu nguồn để mô phỏng sự cố mất dữ liệu.
// 5. Khôi phục bằng ĐÚNG lệnh trong docs/TRIEN_KHAI.md mục 7.3: tar -xzf <archive> -C <parentDir>.
// 6. Chạy kiem-save (auditSavesDirectory): phải đạt 0 lỗi toàn vẹn.
// 7. So sánh lại SHA-256 hash của từng tệp: phải khớp 100% với dữ liệu ban đầu.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MAP_ID, cleanName } from "@tien-gioi/shared";
import { FileAccountStore, FileSessionStore } from "../src/account-store";
import { AuthService } from "../src/auth-service";
import { FileSectStore } from "../src/sect-store";
import { FileSoulStore, soulIdOf } from "../src/soul";
import { auditSavesDirectory, type AuditReport } from "./audit-saves";
import { performBackup } from "./backup";

export interface VerifyRestoreResult {
  fileCount: number;
  archivePath: string;
  archiveSizeBytes: number;
  auditReport: AuditReport;
  totalErrors: number;
  hashMatch: boolean;
  restoredFiles: string[];
}

export function hashFileSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/**
 * Thu thập bản đồ { relativePath -> sha256 } của toàn bộ tệp trong thư mục (đệ quy).
 */
export function hashDirectoryTree(rootDir: string, subDir = ""): Map<string, string> {
  const current = path.join(rootDir, subDir);
  const map = new Map<string, string>();
  if (!existsSync(current)) return map;

  for (const entry of readdirSync(current)) {
    const fullPath = path.join(current, entry);
    const relPath = subDir ? `${subDir}/${entry}` : entry;
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      const childMap = hashDirectoryTree(rootDir, relPath);
      for (const [k, v] of childMap.entries()) {
        map.set(k, v);
      }
    } else if (st.isFile()) {
      map.set(relPath, hashFileSha256(fullPath));
    }
  }

  return map;
}

/**
 * Tạo dữ liệu mẫu thật đầy đủ 5 thành phần: nhân vật, chân linh, tông môn, tài khoản, phiên
 * bằng chính các kho và dịch vụ của server.
 */
export async function createSampleGameData(dataDir: string): Promise<void> {
  mkdirSync(dataDir, { recursive: true });
  const soulsDir = path.join(dataDir, "souls");
  const sectsDir = path.join(dataDir, "sects");
  const accountsDir = path.join(dataDir, "accounts");
  const sessionsDir = path.join(dataDir, "sessions");
  mkdirSync(soulsDir, { recursive: true });
  mkdirSync(sectsDir, { recursive: true });
  mkdirSync(accountsDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });

  const playerName = "Lâm Chân Nhân";
  const sKey = soulIdOf(playerName);

  // 1. Chân linh tạo qua FileSoulStore
  const soulStore = new FileSoulStore(soulsDir);
  await soulStore.create(sKey, (s) => ({
    ...s,
    duyen: 40,
    duyenTotal: 50,
    kiep: 2,
    origins: ["kiem_khach"],
    best: { step: 2, realm: 1, tier: 1 },
    unlocks: { du_am: 2 },
  }));

  // 2. Tông môn tạo qua FileSectStore
  const sectStore = new FileSectStore(sectsDir);
  await sectStore.create({
    v: 1,
    id: "sect-001-uuid",
    name: "Thanh Vân Môn",
    tag: "TV",
    leader: sKey,
    motd: "Tu tâm cầu đạo",
    members: [{ soulKey: sKey, name: playerName, rank: "chu", joinedAt: 1700000000000 }],
    coin: 20000,
    log: [{ at: 1700000000000, name: playerName, kind: "deposit", amount: 20000 }],
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });

  // 3. Tài khoản và Phiên tạo qua AuthService
  const accountStore = new FileAccountStore(accountsDir);
  const sessionStore = new FileSessionStore(sessionsDir);
  const authSvc = new AuthService({ accounts: accountStore, sessions: sessionStore });
  const regRes = await authSvc.register("127.0.0.1", {
    username: "lamthanh",
    password: "MatKhauManh123!@#",
  });
  if (!regRes.ok) {
    throw new Error(`Không tạo được tài khoản mẫu: ${regRes.error}`);
  }

  // 4. Nhân vật hợp lệ chuẩn format
  const cName = cleanName(playerName);
  if (!cName) throw new Error(`Tên nhân vật không hợp lệ: ${playerName}`);
  const playerFile = path.join(
    dataDir,
    `${createHash("sha1").update(cName.toLowerCase()).digest("hex")}.json`,
  );
  const samplePlayer = {
    name: playerName,
    secretHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    realm: 1,
    tier: 1,
    exp: 450,
    coin: 12500,
    x: 1536,
    y: 1536,
    mapId: DEFAULT_MAP_ID,
    createdAt: "2026-11-10T00:00:00.000Z",
    updatedAt: "2026-11-10T00:00:00.000Z",
    inventory: [
      { itemId: "hoi_huyet_dan", qty: 5 },
      { itemId: "long_tho", qty: 2 },
    ],
    equipment: {
      weapon: "lang_nha_kiem",
      robe: "tho_nhung_bao",
      talisman: "ho_hon_phu",
    },
    quests: {
      active: [{ id: "tru_tho", step: 0, progress: 0 }],
      done: ["nhap_the"],
      daily: {
        lang_hai: "2026-11-10T00:00:00.000Z",
      },
    },
  };
  writeFileSync(playerFile, JSON.stringify(samplePlayer, null, 2), "utf8");
}

/**
 * Thực hiện chu trình kiểm chứng khôi phục:
 * Tạo -> Tính hash -> Sao lưu -> Xoá -> Khôi phục bằng tar -> Audit kiem-save -> So khớp hash.
 */
export async function runRestoreVerification(
  opts: {
    tempRootDir?: string;
    keepArchive?: boolean;
  } = {},
): Promise<VerifyRestoreResult> {
  const tmpRoot = opts.tempRootDir ?? mkdtempSync(path.join(os.tmpdir(), "tien-gioi-restore-"));
  const dataDir = path.join(tmpRoot, "players");
  const backupDir = path.join(tmpRoot, "backups");

  try {
    // 1. Tạo dữ liệu mẫu
    await createSampleGameData(dataDir);

    // 2. Thu thập mã băm SHA-256 ban đầu
    const originalHashes = hashDirectoryTree(dataDir);
    if (originalHashes.size === 0) {
      throw new Error("Không tạo được dữ liệu mẫu.");
    }

    // 3. Thực hiện sao lưu
    const backupRes = performBackup({
      dataDir,
      backupDir,
      keep: 5,
      now: new Date(),
    });

    if (!existsSync(backupRes.archivePath)) {
      throw new Error(`File sao lưu không tồn tại: ${backupRes.archivePath}`);
    }

    // 4. Xoá sạch thư mục dữ liệu nguồn để giả lập sự cố mất mát
    rmSync(dataDir, { recursive: true, force: true });
    if (existsSync(dataDir)) {
      throw new Error("Không thể xoá thư mục dữ liệu nguồn trước khi khôi phục.");
    }

    // 5. Khôi phục BẰNG ĐÚNG lệnh trong docs/TRIEN_KHAI.md mục 7.3:
    // tar -xzf <archivePath> -C <parentDir>
    const parentDir = path.dirname(dataDir);
    execFileSync("tar", ["-xzf", backupRes.archivePath, "-C", parentDir], {
      stdio: "pipe",
    });

    if (!existsSync(dataDir)) {
      throw new Error("Thư mục dữ liệu không được phục hồi sau lệnh giải nén tar.");
    }

    // 6. Kiểm tra tính toàn vẹn bằng kiem-save (auditSavesDirectory)
    const report = auditSavesDirectory(dataDir);
    const totalErrors =
      report.errorFiles +
      (report.errorSouls ?? 0) +
      (report.errorAccounts ?? 0) +
      (report.errorSessions ?? 0) +
      (report.errorSects ?? 0);
    if (totalErrors > 0) {
      const errDetails = report.failedFiles
        .map((f) => `${f.file}: ${f.errors.map((e) => e.code).join(", ")}`)
        .join("; ");
      throw new Error(`Dữ liệu sau khôi phục có ${totalErrors} lỗi toàn vẹn: ${errDetails}`);
    }

    // 7. So sánh mã băm SHA-256 của từng file
    const restoredHashes = hashDirectoryTree(dataDir);
    let hashMatch = true;

    if (originalHashes.size !== restoredHashes.size) {
      hashMatch = false;
    } else {
      for (const [file, originalHash] of originalHashes.entries()) {
        const restoredHash = restoredHashes.get(file);
        if (restoredHash !== originalHash) {
          hashMatch = false;
          break;
        }
      }
    }

    if (!hashMatch) {
      throw new Error("Mã băm SHA-256 dữ liệu sau khôi phục KHÔNG khớp dữ liệu gốc ban đầu.");
    }

    return {
      fileCount: originalHashes.size,
      archivePath: backupRes.archivePath,
      archiveSizeBytes: backupRes.archiveSizeBytes,
      auditReport: report,
      totalErrors,
      hashMatch: true,
      restoredFiles: [...restoredHashes.keys()],
    };
  } finally {
    if (!opts.keepArchive && !opts.tempRootDir) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

export async function main(): Promise<number> {
  console.log("=== Bắt đầu kiểm chứng khôi phục sao lưu (M4 3.4) ===");
  try {
    const res = await runRestoreVerification();
    const sizeKb = (res.archiveSizeBytes / 1024).toFixed(1);
    console.log(`- Đã tạo và sao lưu ${res.fileCount} tệp dữ liệu mẫu (${sizeKb} KB)`);
    console.log(`- Lệnh giải nén tar mục 7.3: PASS (đã bung chính xác vào thư mục dữ liệu)`);
    console.log(
      `- kiem-save auditSavesDirectory: PASS (0 lỗi, ${res.auditReport.cleanFiles} nhân vật, ${res.auditReport.cleanSouls} chân linh, ${res.auditReport.cleanSects} tông môn, ${res.auditReport.cleanAccounts} tài khoản, ${res.auditReport.cleanSessions} phiên)`,
    );
    console.log(`- Đối chiếu SHA-256 từng tệp: 100% TRÙNG KHỚP`);
    console.log("=== KHÔI PHỤC SAO LƯU KIỂM CHỨNG THÀNH CÔNG ===");
    return 0;
  } catch (err: unknown) {
    console.error(
      `Khôi phục kiểm chứng THẤT BẠI: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
