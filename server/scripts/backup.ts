// Kịch bản sao lưu dữ liệu nhân vật Tiên Giới (M2/M3 - Issue #68).
// Nén thư mục DATA_DIR thành backups/players-YYYYMMDD-HHMMSS.tar.gz bằng lệnh `tar` hệ thống.
// Mặc định giữ lại 14 bản sao lưu mới nhất (thay đổi bằng --keep=N).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export const BACKUP_FILE_REGEX = /^players-(\d{8}-\d{6})\.tar\.gz$/;

/**
 * Định dạng tên file sao lưu theo thời gian YYYYMMDD-HHMMSS.
 */
export function formatBackupFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `players-${yyyy}${mm}${dd}-${hh}${mi}${ss}.tar.gz`;
}

/**
 * Hàm thuần (pure function) chọn danh sách các file sao lưu cũ cần xoá.
 * - Chỉ xét các file khớp mẫu `players-YYYYMMDD-HHMMSS.tar.gz`.
 * - Sắp xếp giảm dần theo thời gian (mới nhất đứng đầu).
 * - Giữ lại `keep` bản mới nhất, trả về các file cũ cần xoá.
 */
export function selectOldBackups(files: readonly string[], keep: number): string[] {
  const matched = files.filter((f) => BACKUP_FILE_REGEX.test(f));
  // Định dạng YYYYMMDD-HHMMSS có thứ tự từ điển trùng với thứ tự thời gian
  matched.sort((a, b) => b.localeCompare(a));
  if (keep <= 0) return matched;
  return matched.slice(keep);
}

export interface BackupOptions {
  dataDir?: string;
  backupDir?: string;
  keep?: number;
  now?: Date;
}

export interface BackupResult {
  archiveName: string;
  archivePath: string;
  archiveSizeBytes: number;
  dataDir: string;
  removedFiles: string[];
}

/**
 * Thực hiện sao lưu thư mục dataDir vào backupDir bằng lệnh `tar`.
 */
export function performBackup(opts: BackupOptions = {}): BackupResult {
  const keep = opts.keep ?? 14;
  const now = opts.now ?? new Date();

  const dataDir = opts.dataDir
    ? path.resolve(opts.dataDir)
    : process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(here, "../data/players");

  const backupDir = opts.backupDir
    ? path.resolve(opts.backupDir)
    : path.resolve(repoRoot, "backups");

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const archiveName = formatBackupFilename(now);
  const archivePath = path.join(backupDir, archiveName);

  const parentDir = path.dirname(dataDir);
  const targetDirName = path.basename(dataDir);

  // Dùng lệnh tar hệ thống nén thư mục dữ liệu
  execSync(`tar -czf "${archivePath}" -C "${parentDir}" "${targetDirName}"`, {
    stdio: "pipe",
  });

  const archiveSizeBytes = existsSync(archivePath) ? statSync(archivePath).size : 0;

  // Quét các bản sao lưu cũ và dọn dẹp theo chính sách `keep`
  const allFiles = readdirSync(backupDir);
  const oldFiles = selectOldBackups(allFiles, keep);
  for (const old of oldFiles) {
    rmSync(path.join(backupDir, old), { force: true });
  }

  return {
    archiveName,
    archivePath,
    archiveSizeBytes,
    dataDir,
    removedFiles: oldFiles,
  };
}

function parseCliArgs(argv: string[]) {
  let keep = 14;
  let dataDir: string | undefined;
  let backupDir: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--keep=")) {
      keep = Math.max(0, Number(arg.slice(7)));
    } else if (arg.startsWith("--dir=")) {
      dataDir = arg.slice(6);
    } else if (arg.startsWith("--out=")) {
      backupDir = arg.slice(6);
    }
  }

  return { keep, dataDir, backupDir };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  console.log("=== Bắt đầu sao lưu dữ liệu nhân vật Tiên Giới ===");
  const res = performBackup(args);
  const sizeKb = (res.archiveSizeBytes / 1024).toFixed(1);
  console.log(`- Thư mục nguồn: ${res.dataDir}`);
  console.log(`- Bản sao lưu: ${res.archivePath} (${sizeKb} KB)`);
  if (res.removedFiles.length > 0) {
    console.log(
      `- Đã xoá ${res.removedFiles.length} bản sao lưu cũ hơn (chính sách giữ ${args.keep} bản):`,
    );
    for (const f of res.removedFiles) {
      console.log(`  * ${f}`);
    }
  } else {
    console.log(`- Số lượng bản sao lưu hiện tại nằm trong hạn mức (giữ tối đa ${args.keep} bản).`);
  }
  console.log("=== Sao lưu hoàn tất thành công ===");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
