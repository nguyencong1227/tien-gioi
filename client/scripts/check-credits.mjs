/* global console, process */

/**
 * Script kiểm tra tài sản, bản quyền và nguồn gốc (License, Credits & Content Source Checker)
 * 1. Đảm bảo 100% tài nguyên tĩnh trong client/public/assets, client/public/icons và client/public/fonts
 *    đều được khai báo nguồn gốc, tác giả và giấy phép trong CREDITS.md.
 * 2. Riêng tài sản bên thứ ba (client/public/fonts, #331) phải có SHA-256 THẬT cùng dòng trong CREDITS.md.
 * 3. Mọi tài sản hình ảnh/âm thanh từ bên ngoài (Vạn Kiếp Tu Tiên, #517 M7.16) phải được khai báo
 *    đầy đủ trong docs/NGUON_NOI_DUNG.md, nằm dưới thư mục có đoạn vktt/, có trong CREDITS.md và đã duyệt chữ Hán.
 * 4. Kiểm tra 2 chiều: Mọi tệp đĩa dưới client/public/ (có đoạn vktt/) và mọi dòng CREDITS nhắc tới Vạn Kiếp
 *    phải có dòng tương ứng trong Bảng mục 3 của docs/NGUON_NOI_DUNG.md.
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
 * Regex phát hiện ký tự CJK (chữ Hán, kana, hangul, bopomofo, dấu câu CJK và ký tự toàn chiều)
 * Đồng bộ với server/scripts/no-cjk.test.ts
 */
export const CJK_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;

/**
 * Danh sách Loại hợp lệ cho Bảng mục 3 docs/NGUON_NOI_DUNG.md
 */
export const VALID_CONTENT_TYPES = new Set([
  "hinh_anh",
  "am_thanh",
  "du_lieu",
  "cong_phap",
  "trang_bi",
  "phap_bao",
  "nguyen_lieu",
  "nghe",
  "su_kien",
]);

/**
 * Giá trị hợp lệ cho cột "Đã duyệt chữ Hán" đối với hình ảnh
 */
export const VALID_IMAGE_CJK_APPROVALS = new Set(["KHONG_CHU", "DA_XOA_CHU_HAN"]);

/**
 * Quét đệ quy tất cả các tệp trong một thư mục
 * @param {string} dir
 * @param {string} baseDir Thư mục gốc để tính đường dẫn tương đối (mặc định ROOT_DIR)
 * @returns {string[]} Danh sách đường dẫn tương đối từ baseDir (dùng dấu / chuẩn)
 */
export function scanFiles(dir, baseDir = ROOT_DIR) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      files.push(rel);
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

  // 3. Khớp trọn token tên tệp đơn lẻ: CHỈ áp dụng cho tài sản thông thường của Tiên Giới.
  // Với tài sản lấy từ nguồn Vạn Kiếp Tu Tiên (nằm dưới vktt/), BẮT BUỘC phải ghi rõ đường dẫn đầy đủ
  // hoặc đường dẫn ngắn (có vktt/) để tránh trường hợp tệp vktt trùng tên (như hoi_huyet_dan.png)
  // lọt qua kiểm tra vì CREDITS.md đã có tên tệp của Tiên Giới.
  if (!isUnderVktt(filePath) && matchExactToken(creditsContent, fileName)) return true;

  return false;
}

/**
 * Kiểm tra xem đường dẫn có nằm dưới đoạn thư mục vktt/ không (chống lọt path traversal như vktt/../x)
 * @param {string} filePath
 * @returns {boolean}
 */
export function isUnderVktt(filePath) {
  if (!filePath) return false;
  const norm = path.posix.normalize(filePath.replace(/\\/g, "/"));
  const segments = norm.split("/");
  return segments.includes("vktt");
}

/**
 * Chuẩn hoá đường dẫn tệp để so khớp 2 chiều giữa đĩa và bảng
 * @param {string} p
 * @returns {string}
 */
export function normalizePublicPath(p) {
  return p
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^client\/public\//, "");
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
 * Nhận diện chính xác dòng phân cách ^\|[\s:|-]+\|$, dòng tiêu đề và dòng giữ chỗ.
 * Mọi dòng dữ liệu khác phải có đúng 7 cột và Loại thuộc tập hợp hợp lệ.
 *
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
  const seenInRepo = new Map();
  let inTableSection = false;

  const separatorRegex = /^\|[\s:|-]+\|$/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (line.startsWith("## 3. Bảng nguồn")) {
      inTableSection = true;
      continue;
    }
    if (inTableSection && line.startsWith("## ")) {
      // Sang phần tiếp theo thì kết thúc bảng mục 3
      break;
    }

    if (!inTableSection) continue;
    if (!line.startsWith("|")) continue;

    // 1. Nhận diện chính xác dòng phân cách markdown bảng
    if (separatorRegex.test(line)) {
      continue;
    }

    // Tách cột bằng |
    const rawCols = line.split("|");
    // Bỏ phần tử rỗng ở trước | đầu tiên và sau | cuối cùng; loại bỏ backtick bọc quanh cell (nếu có)
    const cols = rawCols.slice(1, -1).map((c) => c.trim().replace(/^`+|`+$/g, ""));

    if (cols.length === 0) continue;

    const firstCell = cols[0].replace(/[*_`]/g, "").trim().toLowerCase();

    // 2. Dòng tiêu đề của bảng (ô đầu tiên là "Loại")
    if (firstCell === "loại") {
      continue;
    }

    // 3. Dòng giữ chỗ khi chưa có tệp (chỉ xét ô đầu tiên)
    if (firstCell.startsWith("(chưa có") || firstCell.startsWith("chưa có")) {
      continue;
    }

    // 4. Mọi dòng dữ liệu khác PHẢI có đúng 7 cột
    const lineNum = i + 1;
    if (cols.length !== 7) {
      throw new Error(
        `[NGUON_NOI_DUNG.md] Dòng ${lineNum}: Bảng nguồn phải có đúng 7 cột (| Loại | Nguồn | Trong repo | Ngày | PR | Đã duyệt chữ Hán | Đã chỉnh gì |), nhận được ${cols.length} cột: "${line}"`,
      );
    }

    const [type, source, inRepo, date, pr, cjkChecked, notes] = cols;

    // 5. Kiểm tra Loại thuộc tập hợp hợp lệ
    if (!VALID_CONTENT_TYPES.has(type)) {
      throw new Error(
        `[NGUON_NOI_DUNG.md] Dòng ${lineNum}: Loại '${type}' không hợp lệ. Phải thuộc một trong: ${Array.from(VALID_CONTENT_TYPES).join(", ")}`,
      );
    }

    // 6. Cột Trong repo không được trống hoặc '-'
    if (!inRepo || inRepo === "-") {
      throw new Error(
        `[NGUON_NOI_DUNG.md] Dòng ${lineNum}: Cột 'Trong repo' không được để trống hoặc '-'`,
      );
    }

    // 7. Bắt buộc mỗi tệp chỉ có đúng một dòng trong bảng (chống trùng lặp)
    if (seenInRepo.has(inRepo)) {
      throw new Error(
        `[NGUON_NOI_DUNG.md] Dòng ${lineNum}: Trùng đường dẫn 'Trong repo' (${inRepo}) đã khai báo ở dòng ${seenInRepo.get(inRepo)}`,
      );
    }
    seenInRepo.set(inRepo, lineNum);

    entries.push({
      type,
      source,
      inRepo,
      date,
      pr,
      cjkChecked,
      notes,
      lineNum,
    });
  }

  return entries;
}

/**
 * Kiểm tra xem tệp ảnh có chứa ký tự CJK không.
 * Chỉ quét văn bản UTF-8 trong tệp vector XML (.svg).
 * Với ảnh nhị phân (.png, .webp...), KHÔNG đọc thô dạng UTF-8 để chống dương tính giả.
 *
 * @param {string} fullPath Đường dẫn tệp tuyệt đối
 * @returns {{ hasCjk: boolean, match?: string }}
 */
export function checkImageFileCjk(fullPath) {
  if (!fs.existsSync(fullPath)) return { hasCjk: false };
  const ext = path.extname(fullPath).toLowerCase();

  if (ext === ".svg") {
    try {
      const text = fs.readFileSync(fullPath, "utf-8");
      const match = text.match(CJK_REGEX);
      if (match) {
        return { hasCjk: true, match: match[0] };
      }
    } catch {
      // Bỏ qua lỗi đọc file
    }
  }

  return { hasCjk: false };
}

/**
 * Rà soát nguồn nội dung, hình ảnh và âm thanh (M7.16 #517, QUYET_DINH_M3 mục 19-20)
 * Kiểm tra:
 * 1. Dòng hình ảnh / âm thanh:
 *    - Phải có trong CREDITS.md
 *    - Phải là tệp có thật trên đĩa
 *    - Phải nằm dưới thư mục có đoạn vktt/
 *    - Với hình ảnh: Cột 'Đã duyệt chữ Hán' CHỈ nhận KHONG_CHU hoặc DA_XOA_CHU_HAN; quét CJK cho SVG.
 *    - Với âm thanh: Cột 'Đã duyệt chữ Hán' CHỈ nhận KHONG_AP_DUNG.
 * 2. Dòng dữ liệu (cong_phap, trang_bi, du_lieu...):
 *    - Cột 'Đã duyệt chữ Hán' CHỈ nhận KHONG_AP_DUNG.
 *    - Không yêu cầu có trong CREDITS.md, không kiểm tra tệp đĩa, không kiểm CJK.
 * 3. Chiều ngược:
 *    - Mọi tệp đĩa nằm dưới client/public/ chứa đoạn vktt/ PHẢI có dòng trong bảng mục 3.
 *    - Mọi dòng trong CREDITS.md nhắc đến "Vạn Kiếp" / "vktt" PHẢI có dòng tương ứng trong bảng mục 3.
 *
 * @param {string} contentSourcePath
 * @param {string} creditsPath
 * @param {string} rootDir
 * @returns {{
 *   entries: Array<any>,
 *   missingInCredits: string[],
 *   missingFiles: string[],
 *   notInVkttDir: string[],
 *   missingCjkCheck: string[],
 *   cjkDetectedInFile: Array<{ file: string, char?: string }>,
 *   unrecordedVkttFiles: string[],
 *   unrecordedCreditsVktt: string[]
 * }}
 */
export function auditContentSources(
  contentSourcePath = CONTENT_SOURCE_FILE,
  creditsPath = CREDITS_FILE,
  rootDir = ROOT_DIR,
) {
  const entries = parseContentSourceTable(contentSourcePath);
  const missingInCredits = [];
  const missingFiles = [];
  const notInVkttDir = [];
  const missingCjkCheck = [];
  const cjkDetectedInFile = [];
  const unrecordedVkttFiles = [];
  const unrecordedCreditsVktt = [];

  const creditsContent = fs.existsSync(creditsPath) ? fs.readFileSync(creditsPath, "utf-8") : "";

  // Tập hợp các đường dẫn chuẩn hoá có trong bảng mục 3
  const recordedNormPaths = new Set();
  const recordedBaseNames = new Set();

  for (const entry of entries) {
    const filePath = entry.inRepo;
    const isAsset = entry.type === "hinh_anh" || entry.type === "am_thanh";

    if (isAsset) {
      recordedNormPaths.add(normalizePublicPath(filePath));
      recordedBaseNames.add(path.basename(filePath));

      // (a) Phải có trong CREDITS.md
      if (!isAssetCredited(filePath, creditsContent)) {
        missingInCredits.push(filePath);
      }

      // (b) Phải là tệp có thật trên đĩa
      const fullPath = path.resolve(rootDir, filePath);
      if (!fs.existsSync(fullPath)) {
        missingFiles.push(filePath);
      } else {
        // (d) Kiểm CJK nếu là SVG
        const cjkCheck = checkImageFileCjk(fullPath);
        if (cjkCheck.hasCjk) {
          cjkDetectedInFile.push({ file: filePath, char: cjkCheck.match });
        }
      }

      // (c) Phải nằm dưới thư mục có đoạn vktt/
      if (!isUnderVktt(filePath)) {
        notInVkttDir.push(filePath);
      }

      // (e) Kiểm tra giá trị cột "Đã duyệt chữ Hán"
      const cjkVal = (entry.cjkChecked || "").trim();
      if (entry.type === "hinh_anh") {
        if (!VALID_IMAGE_CJK_APPROVALS.has(cjkVal)) {
          missingCjkCheck.push(filePath);
        }
      } else {
        // am_thanh chỉ nhận KHONG_AP_DUNG
        if (cjkVal !== "KHONG_AP_DUNG") {
          missingCjkCheck.push(filePath);
        }
      }
    } else {
      // Dữ liệu trong code (cong_phap, trang_bi, du_lieu...):
      // Không đòi CREDITS.md, không kiểm tra tệp đĩa, không kiểm CJK.
      // Cột 'Đã duyệt chữ Hán' bắt buộc phải là KHONG_AP_DUNG.
      const cjkVal = (entry.cjkChecked || "").trim();
      if (cjkVal !== "KHONG_AP_DUNG") {
        missingCjkCheck.push(filePath);
      }
    }
  }

  // Chiều ngược 1: Quét tệp đĩa dưới client/public/**/vktt/**
  const publicDir = path.resolve(rootDir, "client/public");
  if (fs.existsSync(publicDir)) {
    const allPublicFiles = scanFiles(publicDir, rootDir);
    for (const fileRel of allPublicFiles) {
      if (isUnderVktt(fileRel)) {
        const norm = normalizePublicPath(fileRel);
        if (!recordedNormPaths.has(norm)) {
          unrecordedVkttFiles.push(fileRel);
        }
      }
    }
  }

  // Chiều ngược 2: Quét các dòng trong CREDITS.md có chữ "Vạn Kiếp" hoặc "vktt"
  if (creditsContent) {
    const creditsLines = creditsContent.split("\n");
    for (const rawLine of creditsLines) {
      const line = rawLine.trim();
      if (!line.startsWith("|")) continue;
      const lower = line.toLowerCase();
      if (lower.includes("vạn kiếp") || lower.includes("vktt")) {
        // Kiểm tra xem dòng này có khớp với tệp nào trong recordedNormPaths hay recordedBaseNames không
        let matched = false;
        for (const norm of recordedNormPaths) {
          if (matchExactToken(line, norm) || matchExactToken(line, path.basename(norm))) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          for (const base of recordedBaseNames) {
            if (matchExactToken(line, base)) {
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          unrecordedCreditsVktt.push(line);
        }
      }
    }
  }

  return {
    entries,
    missingInCredits,
    missingFiles,
    notInVkttDir,
    missingCjkCheck,
    cjkDetectedInFile,
    unrecordedVkttFiles,
    unrecordedCreditsVktt,
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
    let hasContentError = false;

    if (contentAudit.entries.length > 0) {
      console.log(
        `\n[check-credits] Đã rà soát ${contentAudit.entries.length} mục trong docs/NGUON_NOI_DUNG.md:`,
      );

      if (contentAudit.missingInCredits.length > 0) {
        console.error(
          `\n❌ LỖI NGUỒN: Có ${contentAudit.missingInCredits.length} tệp hình/âm chưa được khai báo trong CREDITS.md:`,
        );
        for (const m of contentAudit.missingInCredits) {
          console.error(`  - ${m}`);
        }
        hasContentError = true;
      }

      if (contentAudit.missingFiles.length > 0) {
        console.error(
          `\n❌ LỖI TỆP ĐĨA: Có ${contentAudit.missingFiles.length} tệp hình/âm không tồn tại trên đĩa:`,
        );
        for (const m of contentAudit.missingFiles) {
          console.error(`  - ${m}`);
        }
        hasContentError = true;
      }

      if (contentAudit.notInVkttDir.length > 0) {
        console.error(
          `\n❌ LỖI THƯ MỤC: Có ${contentAudit.notInVkttDir.length} tệp hình/âm không nằm dưới thư mục chứa 'vktt/':`,
        );
        for (const m of contentAudit.notInVkttDir) {
          console.error(`  - ${m} (phải nằm dưới client/public/**/vktt/**)`);
        }
        hasContentError = true;
      }

      if (contentAudit.missingCjkCheck.length > 0) {
        console.error(
          `\n❌ LỖI CHỮ HÁN: Có ${contentAudit.missingCjkCheck.length} mục có giá trị 'Đã duyệt chữ Hán' không hợp lệ:`,
        );
        for (const m of contentAudit.missingCjkCheck) {
          console.error(
            `  - ${m} (hình ảnh phải là KHONG_CHU hoặc DA_XOA_CHU_HAN; âm thanh/dữ liệu phải là KHONG_AP_DUNG)`,
          );
        }
        hasContentError = true;
      }

      if (contentAudit.cjkDetectedInFile.length > 0) {
        console.error(`\n❌ LỖI CJK: Phát hiện ký tự CJK trong nội dung tệp hình ảnh SVG:`);
        for (const c of contentAudit.cjkDetectedInFile) {
          console.error(`  - ${c.file}: chứa ký tự '${c.char}'`);
        }
        hasContentError = true;
      }
    } else {
      console.log(
        "\n[check-credits] docs/NGUON_NOI_DUNG.md hợp lệ (chưa có tệp ngoài nào được đưa vào repo).",
      );
    }

    // Chiều ngược: Tệp đĩa dưới vktt/ không có trong bảng
    if (contentAudit.unrecordedVkttFiles.length > 0) {
      console.error(
        `\n❌ LỖI BỎ SÓT TỆP VKTT: Có ${contentAudit.unrecordedVkttFiles.length} tệp nằm dưới thư mục 'vktt/' nhưng chưa có trong Bảng mục 3 docs/NGUON_NOI_DUNG.md:`,
      );
      for (const u of contentAudit.unrecordedVkttFiles) {
        console.error(`  - ${u}`);
      }
      hasContentError = true;
    }

    // Chiều ngược: Dòng CREDITS có chữ Vạn Kiếp mà không có trong bảng
    if (contentAudit.unrecordedCreditsVktt.length > 0) {
      console.error(
        `\n❌ LỖI BỎ SÓT CREDITS: Có ${contentAudit.unrecordedCreditsVktt.length} dòng trong CREDITS.md nhắc tới Vạn Kiếp nhưng chưa có trong Bảng mục 3 docs/NGUON_NOI_DUNG.md:`,
      );
      for (const line of contentAudit.unrecordedCreditsVktt) {
        console.error(`  - ${line}`);
      }
      hasContentError = true;
    }

    if (hasContentError) {
      process.exit(1);
    }

    if (contentAudit.entries.length > 0) {
      console.log(
        `✓ Toàn bộ ${contentAudit.entries.length} mục trong NGUON_NOI_DUNG.md đều hợp lệ, có trong CREDITS.md, đúng thư mục vktt/ và đã duyệt chữ Hán.`,
      );
    }

    console.log(`\n✓ TẤT CẢ TÀI NGUYÊN ĐỀU HỢP LỆ VÀ CÓ NGUỒN GỐC RÕ RÀNG.`);
  } catch (err) {
    console.error("[check-credits] Lỗi khi thực hiện rà soát:", err);
    process.exit(1);
  }
}
