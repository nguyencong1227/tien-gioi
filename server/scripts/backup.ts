// Kịch bản sao lưu dữ liệu nhân vật Tiên Giới (M2/M3 - Issue #68).
// Nén thư mục DATA_DIR thành backups/players-YYYYMMDD-HHMMSS.tar.gz bằng lệnh `tar` hệ thống.
// Mặc định giữ lại 14 bản sao lưu mới nhất (thay đổi bằng --keep=N).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNotProd } from "./assert-not-prod.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export const BACKUP_FILE_REGEX = /^players-(\d{8}-\d{6}(?:-\d+)?)\.tar\.gz$/;

/**
 * Định dạng tên file sao lưu theo thời gian YYYYMMDD-HHMMSS.
 */
export function formatBackupFilename(d = new Date(), suffix = ""): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const suf = suffix ? `-${suffix}` : "";
  return `players-${yyyy}${mm}${dd}-${hh}${mi}${ss}${suf}.tar.gz`;
}

/**
 * Hàm thuần (pure function) chọn danh sách các file sao lưu cũ cần xoá.
 * - Chỉ xét các file khớp mẫu `players-YYYYMMDD-HHMMSS*.tar.gz`.
 * - Sắp xếp giảm dần theo thời gian (mới nhất đứng đầu).
 * - Giữ lại `keep` bản mới nhất, trả về các file cũ cần xoá.
 * - `keep` bắt buộc là số nguyên >= 1; ném RangeError nếu không hợp lệ để tránh vô tình xoá sạch sao lưu.
 */
export function selectOldBackups(files: readonly string[], keep: number): string[] {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(
      `Tham số keep phải là số nguyên >= 1 (nhận được: ${keep}). Không được phép chạy với keep < 1 để tránh mất dữ liệu sao lưu.`,
    );
  }
  const matched = files.filter((f) => BACKUP_FILE_REGEX.test(f));
  // Định dạng YYYYMMDD-HHMMSS có thứ tự từ điển trùng với thứ tự thời gian
  matched.sort((a, b) => b.localeCompare(a));
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
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(`Tham số keep phải là số nguyên >= 1 (nhận được: ${keep}).`);
  }

  const now = opts.now ?? new Date();

  const dataDir = opts.dataDir
    ? path.resolve(opts.dataDir)
    : process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(here, "../data/players");

  const backupDir = opts.backupDir
    ? path.resolve(opts.backupDir)
    : path.resolve(repoRoot, "backups");

  assertNotProd(dataDir, "backup");
  assertNotProd(backupDir, "backup");

  if (!existsSync(dataDir)) {
    throw new Error(
      `Không tìm thấy thư mục dữ liệu nguồn: "${dataDir}". Vui lòng kiểm tra biến DATA_DIR hoặc cờ --dir=... Không thể sao lưu thư mục không tồn tại.`,
    );
  }

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  let archiveName = formatBackupFilename(now);
  let archivePath = path.join(backupDir, archiveName);

  // Nếu file đã tồn tại trong cùng giây, thêm hậu tố đếm để tránh ghi đè
  let counter = 1;
  while (existsSync(archivePath)) {
    archiveName = formatBackupFilename(now, String(counter++));
    archivePath = path.join(backupDir, archiveName);
  }

  const parentDir = path.dirname(dataDir);
  const targetDirName = path.basename(dataDir);

  // Dùng execFileSync an toàn (không qua shell) để tránh shell injection
  execFileSync("tar", ["-czf", archivePath, "-C", parentDir, targetDirName], {
    stdio: "pipe",
  });

  const archiveSizeBytes = existsSync(archivePath) ? statSync(archivePath).size : 0;

  // Quét các bản sao lưu cũ và dọn dẹp theo chính sách `keep`
  const allFiles = readdirSync(backupDir);
  const candidateOldFiles = selectOldBackups(allFiles, keep);

  // Phòng thủ 2 lớp: không bao giờ xoá bản sao lưu vừa tạo trong phiên hiện tại
  const safeOldFiles = candidateOldFiles.filter((f) => f !== archiveName);

  for (const old of safeOldFiles) {
    rmSync(path.join(backupDir, old), { force: true });
  }

  return {
    archiveName,
    archivePath,
    archiveSizeBytes,
    dataDir,
    removedFiles: safeOldFiles,
  };
}

export function parseCliArgs(argv: string[]) {
  let keep = 14;
  let dataDir: string | undefined;
  let backupDir: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--keep=")) {
      const raw = arg.slice(7).trim();
      const num = Number(raw);
      if (!raw || !Number.isInteger(num) || num < 1) {
        throw new Error(`Cờ --keep phải là số nguyên >= 1 (ví dụ --keep=14). Nhận được: "${raw}"`);
      }
      keep = num;
    } else if (arg.startsWith("--dir=")) {
      dataDir = arg.slice(6);
    } else if (arg.startsWith("--out=")) {
      backupDir = arg.slice(6);
    }
  }

  return { keep, dataDir, backupDir };
}

function main() {
  let args: ReturnType<typeof parseCliArgs>;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err: unknown) {
    console.error(`Lỗi tham số dòng lệnh: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log("=== Bắt đầu sao lưu dữ liệu nhân vật Tiên Giới ===");
  try {
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
      console.log(
        `- Số lượng bản sao lưu hiện tại nằm trong hạn mức (giữ tối đa ${args.keep} bản).`,
      );
    }
    console.log("=== Sao lưu hoàn tất thành công ===");
  } catch (err: unknown) {
    console.error(`Sao lưu thất bại: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
