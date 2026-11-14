/* global console, process */

/**
 * Script kiểm tra tài sản, bản quyền và nguồn gốc (License, Credits & Content Source Checker)
 * 1. Đảm bảo 100% tài nguyên tĩnh trong client/public/assets, client/public/icons và client/public/fonts
 *    đều được khai báo nguồn gốc, tác giả và giấy phép trong CREDITS.md.
 * 2. Riêng tài sản bên thứ ba (client/public/fonts, #331) phải có SHA-256 THẬT cùng dòng trong CREDITS.md.
 * 3. Mọi tài sản hình ảnh/âm thanh từ bên ngoài (Vạn Kiếp Tu Tiên, #517 M7.16) phải được khai báo
 *    đầy đủ trong docs/NGUON_NOI_DUNG.md kèm cột "Đã duyệt chữ Hán" và đồng bộ với CREDITS.md.
 *
 * Chạy: node client/scripts/check-credits.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CLIENT_PUBLIC = path.resolve(ROOT_DIR, "client/public");
const CREDITS_FILE = path.resolve(ROOT_DIR, "CREDITS.md");
export const CONTENT_SOURCE_FILE = path.resolve(ROOT_DIR, "docs/NGUON_NOI_DUNG.md");

/**
 * Regex phát hiện ký tự CJK (chữ Hán, kana, hangul, dấu câu CJK)
 * Đồng bộ với server/scripts/no-cjk.test.ts
 */
export const CJK_REGEX =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebbf}\u{30000}-\u{3134f}]/u;

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
 * Kiểm tra xem một chuỗi token có xuất hiện trọn vẹn trong văn bản hay không
 * (không bị dính vào ký tự tên tệp / đường dẫn hợp lệ ở hai đầu: [A-Za-z0-9_.-]).
 * Ngăn chặn lỗi lọt chuỗi con (ví dụ 'con.svg' trong 'icon.svg' hay '512.png' trong 'icon-512.png').
 *
 * @param {string} content
 * @param {string} token
 * @returns {boolean}
 */
export function matchExactToken(content, token) {
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9_.-])${escaped}($|[^A-Za-z0-9_.-])`);
  return re.test(content);
}

/**
 * Kiểm tra xem một tệp có được nhắc đến trong nội dung CREDITS.md hay không.
 * Khớp trọn vẹn theo:
 * 1. Đường dẫn đầy đủ tương đối: client/public/assets/tileset.png
 * 2. Đường dẫn ngắn: assets/tileset.png hoặc icons/icon.svg
 * 3. Tên tệp đơn lẻ: tileset.png, hoi_huyet_dan.png
 * Tuyệt đối không dùng wildcard thư mục để đảm bảo mọi tệp mới đều phải ghi danh.
 *
 * @param {string} filePath Đường dẫn tương đối từ repo root (vd: client/public/assets/tileset.png)
 * @param {string} creditsContent Nội dung văn bản của CREDITS.md
 * @returns {boolean}
 */
export function isAssetCredited(filePath, creditsContent) {
  if (!filePath || !creditsContent) return false;
  const normPath = filePath.replace(/\\/g, "/");
  const fileName = path.basename(normPath);
  const shortPath = normPath.replace(/^client\/public\//, "");

  // 1. Khớp trọn token đường dẫn đầy đủ
  if (matchExactToken(creditsContent, normPath)) return true;

  // 2. Khớp trọn token đường dẫn ngắn (bỏ client/public/)
  if (matchExactToken(creditsContent, shortPath)) return true;

  // 3. Khớp trọn token tên tệp đơn lẻ
  if (matchExactToken(creditsContent, fileName)) return true;

  return false;
}

/**
 * Kiểm tra toàn bộ tài sản tĩnh trong client/public/
 * @param {string} creditsPath
 * @param {string[]} targetDirs
 * @returns {{ scanned: string[], missing: string[] }}
 */
export function auditAssets(
  creditsPath = CREDITS_FILE,
  targetDirs = [
    path.join(CLIENT_PUBLIC, "assets"),
    path.join(CLIENT_PUBLIC, "icons"),
    path.join(CLIENT_PUBLIC, "fonts"),
  ],
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

/** SHA-256 (hex thường) của một tệp. */
export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Tài sản bên thứ ba (mặc định: client/public/fonts) phải có dòng bảng trong CREDITS.md chứa cả TÊN TỆP lẫn
 * SHA-256 thật của nội dung tệp hiện tại. Một băm của tệp khác, hay băm cũ sau khi đổi tệp, đều không qua.
 *
 * @param {string} creditsPath
 * @param {string[]} hashDirs
 * @returns {{ hashed: string[], wrongHash: string[] }}
 */
export function auditHashes(
  creditsPath = CREDITS_FILE,
  hashDirs = [path.join(CLIENT_PUBLIC, "fonts")],
) {
  if (!fs.existsSync(creditsPath)) {
    throw new Error(`Không tìm thấy file CREDITS: ${creditsPath}`);
  }
  const lines = fs.readFileSync(creditsPath, "utf8").split("\n");
  const hashed = [];
  const wrongHash = [];
  for (const dir of hashDirs) {
    for (const f of scanFiles(dir)) {
      hashed.push(f);
      const fileName = path.basename(f);
      const sha = sha256File(path.resolve(ROOT_DIR, f));
      const ok = lines.some((l) => matchExactToken(l, fileName) && matchExactToken(l, sha));
      if (!ok) wrongHash.push(f);
    }
  }
  return { hashed, wrongHash };
}

/**
 * Phân tích cú pháp Bảng mục 3 trong docs/NGUON_NOI_DUNG.md
 * @param {string} contentSourcePath Đường dẫn tới docs/NGUON_NOI_DUNG.md
 * @returns {Array<{ type: string, source: string, inRepo: string, date: string, pr: string, cjkChecked: string, notes: string, lineNum: number }>}
 */
export function parseContentSourceTable(contentSourcePath = CONTENT_SOURCE_FILE) {
  if (!fs.existsSync(contentSourcePath)) {
    return [];
  }
  const content = fs.readFileSync(contentSourcePath, "utf-8");
  const lines = content.split("\n");

  const entries = [];
  let inTableSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("## 3. Bảng nguồn")) {
      inTableSection = true;
      continue;
    }
    if (inTableSection && line.startsWith("## ")) {
      // Sang phần tiếp theo thì dừng
      break;
    }

    if (!inTableSection) continue;
    if (!line.startsWith("|")) continue;

    // Bỏ qua dòng tiêu đề và phân cách
    if (line.includes("---") || line.toLowerCase().includes("trong repo")) {
      continue;
    }
    // Bỏ qua dòng ghi chú rỗng khi chưa có tệp
    if (line.includes("chưa có tệp nào")) {
      continue;
    }

    // Tách các cột theo dấu |
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    if (cols.length >= 6) {
      // Hỗ trợ cả bảng 6 cột hoặc 7 cột (có thêm cột Đã duyệt chữ Hán)
      let type = cols[0];
      let source = cols[1];
      let inRepo = cols[2];
      let date = cols[3];
      let pr = cols[4];
      let cjkChecked = "";
      let notes = "";

      if (cols.length >= 7) {
        cjkChecked = cols[5];
        notes = cols[6];
      } else {
        notes = cols[5];
      }

      if (inRepo && inRepo !== "-") {
        entries.push({
          type,
          source,
          inRepo,
          date,
          pr,
          cjkChecked,
          notes,
          lineNum: i + 1,
        });
      }
    }
  }

  return entries;
}

/**
 * Kiểm tra xem tệp ảnh có chứa ký tự CJK trong nội dung XML (.svg) hoặc metadata không.
 * @param {string} fullPath Đường dẫn tệp tuyệt đối
 * @returns {{ hasCjk: boolean, match?: string }}
 */
export function checkImageFileCjk(fullPath) {
  if (!fs.existsSync(fullPath)) return { hasCjk: false };
  const ext = path.extname(fullPath).toLowerCase();

  try {
    if (ext === ".svg") {
      const text = fs.readFileSync(fullPath, "utf-8");
      const match = text.match(CJK_REGEX);
      if (match) {
        return { hasCjk: true, match: match[0] };
      }
    } else if (ext === ".png" || ext === ".webp") {
      // Quét chuỗi UTF-8 trong các chunk metadata văn bản của tệp
      const buf = fs.readFileSync(fullPath);
      const text = buf.toString("utf-8");
      const match = text.match(CJK_REGEX);
      if (match) {
        return { hasCjk: true, match: match[0] };
      }
    }
  } catch {
    // Bỏ qua nếu lỗi đọc nhị phân
  }

  return { hasCjk: false };
}

/** Giá trị hợp lệ cho cột "Đã duyệt chữ Hán" đối với hình ảnh */
const VALID_CJK_APPROVALS = new Set([
  "KHONG_CHU",
  "KHONG_CO_CHU",
  "DA_XOA_CHU_HAN",
  "DA_DUYET",
  "OK",
  "KHONG_AP_DUNG",
]);

/**
 * Rà soát nguồn nội dung, hình ảnh và âm thanh (M7.16 #517, QUYET_DINH_M3 mục 19-20)
 * Kiểm tra:
 * 1. Mọi tệp trong NGUON_NOI_DUNG.md phải được nhắc tới trong CREDITS.md.
 * 2. Mọi tệp hình ảnh phải có xác nhận đã duyệt chữ Hán (không để trống, không để "-").
 * 3. Kiểm tra ký tự CJK trong nội dung tệp SVG / metadata ảnh nếu tệp tồn tại trên đĩa.
 *
 * @param {string} contentSourcePath
 * @param {string} creditsPath
 * @returns {{
 *   entries: Array<any>,
 *   missingInCredits: string[],
 *   missingCjkCheck: string[],
 *   cjkDetectedInFile: Array<{ file: string, char: string }>
 * }}
 */
export function auditContentSources(
  contentSourcePath = CONTENT_SOURCE_FILE,
  creditsPath = CREDITS_FILE,
) {
  const entries = parseContentSourceTable(contentSourcePath);
  const missingInCredits = [];
  const missingCjkCheck = [];
  const cjkDetectedInFile = [];

  const creditsContent = fs.existsSync(creditsPath) ? fs.readFileSync(creditsPath, "utf-8") : "";

  for (const entry of entries) {
    const filePath = entry.inRepo;

    // 1. Phải được ghi nhận trong CREDITS.md
    if (!isAssetCredited(filePath, creditsContent)) {
      missingInCredits.push(filePath);
    }

    // 2. Kiểm tra duyệt chữ Hán cho tệp hình ảnh
    const isImage = entry.type === "hinh_anh" || /\.(png|jpg|jpeg|webp|svg)$/i.test(filePath);

    if (isImage) {
      const cjkVal = (entry.cjkChecked || "").toUpperCase().trim();
      if (!cjkVal || cjkVal === "-" || !VALID_CJK_APPROVALS.has(cjkVal)) {
        missingCjkCheck.push(filePath);
      }

      // 3. Kiểm tra trực tiếp tệp trên đĩa nếu tồn tại
      const fullPath = path.resolve(ROOT_DIR, filePath);
      const cjkCheck = checkImageFileCjk(fullPath);
      if (cjkCheck.hasCjk) {
        cjkDetectedInFile.push({ file: filePath, char: cjkCheck.match });
      }
    }
  }

  return {
    entries,
    missingInCredits,
    missingCjkCheck,
    cjkDetectedInFile,
  };
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

    const { hashed, wrongHash } = auditHashes();
    if (wrongHash.length > 0) {
      console.error(
        `\n❌ LỖI BẢN QUYỀN: ${wrongHash.length} / ${hashed.length} tài sản bên thứ ba thiếu SHA-256 đúng (cùng dòng với tên tệp) trong CREDITS.md:`,
      );
      for (const m of wrongHash) {
        console.error(`  - ${m}  sha256 = ${sha256File(path.resolve(ROOT_DIR, m))}`);
      }
      process.exit(1);
    }
    console.log(`✓ ${hashed.length} tài sản bên thứ ba có SHA-256 khớp trong CREDITS.md.`);

    // Rà soát nguồn nội dung bên ngoài (M7.16 #517, QUYET_DINH_M3 mục 19-20)
    const contentAudit = auditContentSources();
    if (contentAudit.entries.length > 0) {
      console.log(
        `\n[check-credits] Đã rà soát ${contentAudit.entries.length} mục trong docs/NGUON_NOI_DUNG.md:`,
      );

      if (contentAudit.missingInCredits.length > 0) {
        console.error(
          `\n❌ LỖI NGUỒN: Có ${contentAudit.missingInCredits.length} tệp từ NGUON_NOI_DUNG.md chưa được khai báo trong CREDITS.md:`,
        );
        for (const m of contentAudit.missingInCredits) {
          console.error(`  - ${m}`);
        }
        process.exit(1);
      }

      if (contentAudit.missingCjkCheck.length > 0) {
        console.error(
          `\n❌ LỖI CHỮ HÁN: Có ${contentAudit.missingCjkCheck.length} tệp hình ảnh thiếu xác nhận duyệt chữ Hán trong NGUON_NOI_DUNG.md:`,
        );
        for (const m of contentAudit.missingCjkCheck) {
          console.error(`  - ${m} (cột 'Đã duyệt chữ Hán' phải là KHONG_CHU hoặc DA_XOA_CHU_HAN)`);
        }
        process.exit(1);
      }

      if (contentAudit.cjkDetectedInFile.length > 0) {
        console.error(`\n❌ LỖI CJK: Phát hiện ký tự CJK trong nội dung tệp hình ảnh:`);
        for (const c of contentAudit.cjkDetectedInFile) {
          console.error(`  - ${c.file}: chứa ký tự '${c.char}'`);
        }
        process.exit(1);
      }

      console.log(
        `✓ Toàn bộ ${contentAudit.entries.length} mục trong NGUON_NOI_DUNG.md đều hợp lệ, có trong CREDITS.md và đã duyệt chữ Hán.`,
      );
    } else {
      console.log(
        "\n[check-credits] docs/NGUON_NOI_DUNG.md hợp lệ (chưa có tệp ngoài nào được đưa vào repo).",
      );
    }

    console.log(`\n✓ TẤT CẢ TÀI NGUYÊN ĐỀU HỢP LỆ VÀ CÓ NGUỒN GỐC RÕ RÀNG.`);
  } catch (err) {
    console.error("[check-credits] Lỗi khi thực hiện rà soát:", err);
    process.exit(1);
  }
}
