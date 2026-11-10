/* global console, process */

/**
 * Script kiểm tra tài sản & bản quyền (License & Credits Checker)
 * Đảm bảo 100% tài nguyên tĩnh trong client/public/assets và client/public/icons
 * đều được khai báo nguồn gốc, tác giả và giấy phép trong CREDITS.md.
 *
 * Chạy: node client/scripts/check-credits.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CLIENT_PUBLIC = path.resolve(ROOT_DIR, "client/public");
const CREDITS_FILE = path.resolve(ROOT_DIR, "CREDITS.md");

/**
 * Quét đệ quy tất cả các tệp trong một thư mục
 * @param {string} dir
 * @returns {string[]} Danh sách đường dẫn tương đối từ ROOT_DIR
 */
export function scanFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(path.relative(ROOT_DIR, fullPath));
    }
  }
  return files;
}

/**
 * Kiểm tra xem một tệp có được nhắc đến trong nội dung CREDITS.md hay không.
 * Khớp theo:
 * 1. Đường dẫn đầy đủ tương đối: client/public/assets/tileset.png
 * 2. Đường dẫn ngắn: assets/tileset.png
 * 3. Tên tệp đơn lẻ: tileset.png
 * 4. Quy tắc wildcard/thư mục: client/public/assets/items/*.png hoặc assets/items/*.png hoặc icons/
 *
 * @param {string} filePath Đường dẫn tương đối từ repo root (vd: client/public/assets/tileset.png)
 * @param {string} creditsContent Nội dung văn bản của CREDITS.md
 * @returns {boolean}
 */
export function isAssetCredited(filePath, creditsContent) {
  // Chuẩn hoá phân cách đường dẫn sang forward-slash
  const normPath = filePath.replace(/\\/g, "/");
  const fileName = path.basename(normPath);

  // 1. Khớp chính xác tên tệp hoặc đường dẫn
  if (creditsContent.includes(normPath)) return true;
  if (creditsContent.includes(fileName)) return true;

  // 2. Cắt bớt tiền tố client/public/
  const shortPath = normPath.replace(/^client\/public\//, "");
  if (creditsContent.includes(shortPath)) return true;

  // 3. Khớp thư mục hoặc pattern có wildcard (vd: assets/items/*.png hoặc client/public/icons/)
  const dirName = path.dirname(shortPath);
  if (creditsContent.includes(`${dirName}/*.${normPath.split(".").pop()}`)) return true;
  if (creditsContent.includes(`${dirName}/*`)) return true;
  if (creditsContent.includes(`client/public/${dirName}/*.${normPath.split(".").pop()}`))
    return true;
  if (creditsContent.includes(`client/public/${dirName}/*`)) return true;

  return false;
}

/**
 * Kiểm tra toàn bộ tài sản
 * @param {string} creditsPath
 * @param {string[]} targetDirs
 * @returns {{ scanned: string[], missing: string[] }}
 */
export function auditAssets(
  creditsPath = CREDITS_FILE,
  targetDirs = [path.join(CLIENT_PUBLIC, "assets"), path.join(CLIENT_PUBLIC, "icons")],
) {
  if (!fs.existsSync(creditsPath)) {
    throw new Error(`Không tìm thấy file CREDITS: ${creditsPath}`);
  }
  const creditsContent = fs.readFileSync(creditsPath, "utf8");

  const scanned = [];
  const missing = [];

  for (const dir of targetDirs) {
    const files = scanFiles(dir);
    for (const f of files) {
      scanned.push(f);
      if (!isAssetCredited(f, creditsContent)) {
        missing.push(f);
      }
    }
  }

  return { scanned, missing };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === __filename) {
  try {
    const { scanned, missing } = auditAssets();
    console.log(
      `[check-credits] Đã rà soát ${scanned.length} tệp tài nguyên tĩnh trong client/public/:`,
    );
    for (const f of scanned) {
      const status = missing.includes(f) ? "❌ THIẾU NGUỒN" : "✓";
      console.log(`  ${status} ${f}`);
    }

    if (missing.length > 0) {
      console.error(
        `\n❌ LỖI BẢN QUYỀN: Có ${missing.length} tệp chưa được ghi nhận trong CREDITS.md:`,
      );
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
      console.error(
        "\nVui lòng bổ sung tác giả, nguồn gốc và giấy phép (CC0/CC-BY) vào CREDITS.md.",
      );
      process.exit(1);
    }

    console.log(`\n✓ TẤT CẢ ${scanned.length} TỆP TÀI NGUYÊN ĐỀU HỢP LỆ VÀ CÓ NGUỒN GỐC RÕ RÀNG.`);
  } catch (err) {
    console.error("[check-credits] Lỗi khi thực hiện rà soát:", err);
    process.exit(1);
  }
}
