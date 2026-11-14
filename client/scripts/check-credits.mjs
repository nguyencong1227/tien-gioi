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
import { Buffer } from "node:buffer";
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
  const clean = path.posix.normalize(p.replace(/\\/g, "/"));
  return clean
    .replace(/^\.\//, "")
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

    // 7. Bắt buộc mỗi tệp hình ảnh / âm thanh chỉ có đúng một dòng trong bảng (chống trùng lặp tệp thật)
    // Tài sản dữ liệu (cong_phap, du_lieu, trang_bi...) ghi theo cụm hoặc tệp chung (như shared/src/skills.ts)
    if (type === "hinh_anh" || type === "am_thanh") {
      const normKey = normalizePublicPath(inRepo);
      if (seenInRepo.has(normKey)) {
        throw new Error(
          `[NGUON_NOI_DUNG.md] Dòng ${lineNum}: Trùng đường dẫn 'Trong repo' (${inRepo}) đã khai báo ở dòng ${seenInRepo.get(normKey)}`,
        );
      }
      seenInRepo.set(normKey, lineNum);
    }

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

// ---------------------------------------------------------------------------------------------------------------
// Ảnh do AI sinh (SDXL base, nhóm tự sinh; docs/KE_HOACH_DO_HOA_AI.md mục 9.3-9.4, M7.12 #513)
// ---------------------------------------------------------------------------------------------------------------

/** Thư mục RIÊNG của ảnh AI trong gói phát hành, và thư mục tệp nguồn (mỗi ảnh một JSON cùng tên). */
export const AI_ASSET_DIR = path.join(CLIENT_PUBLIC, "assets/ai");
export const AI_SOURCE_DIR = path.resolve(ROOT_DIR, "docs/art/nguon");
/** Định dạng ảnh AI được vào game: đã mã hoá lại sạch (WebP) hoặc PNG đã xoá khối văn bản. */
export const AI_ALLOWED_EXT = new Set([".webp", ".png"]);
/** Tiêu đề mục riêng của CREDITS.md cho ảnh AI (mục chứa dòng của từng ảnh). */
export const AI_CREDITS_HEADING_RE = /^## \d+\. Ảnh do AI sinh/m;
/** Khối siêu dữ liệu CẤM trong ảnh vào game: ComfyUI nhúng prompt + toàn bộ workflow vào khối văn bản của PNG. */
export const PNG_FORBIDDEN_CHUNKS = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);
export const WEBP_FORBIDDEN_CHUNKS = new Set(["EXIF", "XMP "]);

const HEX64 = /^[0-9a-f]{64}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Danh sách khối của PNG (tên 4 ký tự theo thứ tự), hoặc ném lỗi nếu không phải PNG / bị cắt cụt.
 * @param {Buffer} buf
 * @returns {string[]}
 */
export function pngChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error("không phải PNG");
  const out = [];
  let off = 8;
  while (off < buf.length) {
    if (off + 12 > buf.length) throw new Error("PNG bị cắt cụt (khối dở dang)");
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`PNG bị cắt cụt (khối ${type})`);
    out.push(type);
    off += 12 + len;
    if (type === "IEND") break;
  }
  if (out[out.length - 1] !== "IEND") throw new Error("PNG thiếu khối IEND");
  if (off !== buf.length)
    throw new Error("PNG có dữ liệu thừa sau khối IEND (có thể giấu siêu dữ liệu)");
  return out;
}

/**
 * Danh sách khối của WebP (RIFF), hoặc ném lỗi nếu không phải WebP / bị cắt cụt.
 * @param {Buffer} buf
 * @returns {string[]}
 */
export function webpChunks(buf) {
  if (
    buf.length < 12 ||
    buf.toString("latin1", 0, 4) !== "RIFF" ||
    buf.toString("latin1", 8, 12) !== "WEBP"
  )
    throw new Error("không phải WebP");
  if (buf.readUInt32LE(4) + 8 !== buf.length)
    throw new Error("WebP bị cắt cụt hoặc thừa byte sau RIFF");
  const out = [];
  let off = 12;
  while (off < buf.length) {
    if (off + 8 > buf.length) throw new Error("WebP bị cắt cụt (khối dở dang)");
    const type = buf.toString("latin1", off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (off + 8 + len > buf.length) throw new Error(`WebP bị cắt cụt (khối ${type})`);
    out.push(type);
    off += 8 + len + (len % 2); // khối căn chẵn
  }
  return out;
}

/**
 * Siêu dữ liệu CẤM có trong ảnh không: PNG có `tEXt` / `iTXt` / `zTXt` / `eXIf`, WebP có `EXIF` / `XMP `. Ảnh không đọc được / định dạng khác cũng là lỗi.
 * @param {Buffer} buf
 * @param {string} ext ".png" | ".webp"
 * @returns {{ chunks: string[], forbidden: string[], error: string | null }}
 */
export function auditImageMetadata(buf, ext) {
  try {
    if (ext === ".png") {
      const chunks = pngChunks(buf);
      return { chunks, forbidden: chunks.filter((c) => PNG_FORBIDDEN_CHUNKS.has(c)), error: null };
    }
    if (ext === ".webp") {
      const chunks = webpChunks(buf);
      return { chunks, forbidden: chunks.filter((c) => WEBP_FORBIDDEN_CHUNKS.has(c)), error: null };
    }
    return {
      chunks: [],
      forbidden: [],
      error: `định dạng ${ext || "(không đuôi)"} không được phép`,
    };
  } catch (err) {
    return { chunks: [], forbidden: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Kiểm lược đồ `docs/art/nguon/<tên>.json` (docs/KE_HOACH_DO_HOA_AI.md mục 9.3). Trả danh sách vấn đề (rỗng = hợp lệ).
 * Quy tắc cứng (AGENTS.md mục Asset, nguồn 2): chỉ SDXL BASE, không LoRA; người duyệt xác nhận không chữ và không giống game khác.
 * @param {any} j
 * @returns {string[]}
 */
export function validateAiSource(j) {
  const bad = [];
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  if (j === null || typeof j !== "object" || Array.isArray(j)) return ["không phải đối tượng JSON"];
  if (!str(j.asset)) bad.push("thiếu `asset` (đường dẫn trong repo)");
  if (!HEX64.test(j.finalSha256 ?? "")) bad.push("`finalSha256` phải là 64 ký tự hex thường");
  if (!HEX64.test(j.rawSha256 ?? ""))
    bad.push("`rawSha256` (ảnh thô được chọn) phải là 64 ký tự hex thường");
  if (
    !j.model ||
    typeof j.model !== "object" ||
    !str(j.model.name) ||
    !HEX64.test(j.model.sha256 ?? "")
  )
    bad.push("`model` phải có `name` và `sha256` (64 hex)");
  else if (
    !/(sd[-_ ]?xl|stable[-_ ]?diffusion[-_ ]?xl)/i.test(j.model.name) ||
    !/base/i.test(j.model.name)
  )
    bad.push(
      `\`model.name\` "${j.model.name}" không phải SDXL base (chỉ được SDXL base, AGENTS.md)`,
    );
  if (!Array.isArray(j.lora)) bad.push("`lora` phải là mảng (`[]` nếu không dùng)");
  else if (j.lora.length > 0)
    bad.push("`lora` phải rỗng: không dùng model / LoRA khác nếu chưa hỏi người dùng (AGENTS.md)");
  if (!(
    str(j.comfyui) ||
    (j.comfyui && typeof j.comfyui === "object" && Object.keys(j.comfyui).length > 0)
  ))
    bad.push("thiếu `comfyui` (phiên bản ComfyUI, PyTorch, driver)");
  if (
    !j.workflow ||
    typeof j.workflow !== "object" ||
    !str(j.workflow.path) ||
    !HEX64.test(j.workflow.sha256 ?? "")
  )
    bad.push("`workflow` phải có `path` và `sha256` (64 hex)");
  if (!str(j.prompt)) bad.push("thiếu `prompt`");
  if (typeof j.negativePrompt !== "string")
    bad.push("`negativePrompt` phải là chuỗi (có thể rỗng)");
  if (!(Number.isInteger(j.seed) || (typeof j.seed === "string" && /^-?\d+$/.test(j.seed))))
    bad.push("`seed` phải là số nguyên");
  if (
    !Array.isArray(j.postProcess) ||
    j.postProcess.length === 0 ||
    !j.postProcess.every((x) => x && typeof x === "object" && str(x.script))
  )
    bad.push("`postProcess` phải là mảng không rỗng các mục có `script`");
  if (!j.reviewed || typeof j.reviewed !== "object") bad.push("thiếu `reviewed`");
  else {
    if (!str(j.reviewed.by)) bad.push("`reviewed.by` trống");
    if (!str(j.reviewed.date)) bad.push("`reviewed.date` trống");
    if (j.reviewed.noText !== true)
      bad.push("`reviewed.noText` phải là true (người duyệt xác nhận không chữ / ký tự giả)");
    if (j.reviewed.noOtherGameLikeness !== true)
      bad.push("`reviewed.noOtherGameLikeness` phải là true (không giống game khác)");
  }
  if (!str(j.date)) bad.push("thiếu `date`");
  if (CJK_REGEX.test(JSON.stringify(j)))
    bad.push("có ký tự CJK trong tệp nguồn (prompt / ghi chú không được chứa chữ Hán)");
  return bad;
}

/**
 * Rà ảnh AI: nguồn (JSON cùng tên, băm khớp, dòng riêng ở CREDITS.md), siêu dữ liệu sạch, định dạng. Không có ảnh nào thì sạch (cũng báo JSON mồ côi).
 * @param {{ aiDir?: string, sourceDir?: string, creditsPath?: string, rootDir?: string }} [opts]
 * @returns {{ files: string[], sources: string[], errors: Array<{ kind: string, file: string, detail: string }> }}
 */
export function auditAiImages(opts = {}) {
  const rootDir = opts.rootDir ?? ROOT_DIR;
  const aiDir = opts.aiDir ?? AI_ASSET_DIR;
  const sourceDir = opts.sourceDir ?? AI_SOURCE_DIR;
  const creditsPath = opts.creditsPath ?? CREDITS_FILE;
  const errors = [];
  const err = (kind, file, detail) => errors.push({ kind, file, detail });
  const rel = (abs) => path.relative(rootDir, abs).replace(/\\/g, "/");
  const aiPrefix = `${rel(aiDir)}/`;

  const files = scanFiles(aiDir, rootDir).sort();
  const jsonNames = fs.existsSync(sourceDir)
    ? fs
        .readdirSync(sourceDir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort()
    : [];
  const sources = jsonNames.map((n) => rel(path.join(sourceDir, n)));

  let creditsSection = null;
  if (fs.existsSync(creditsPath)) {
    const text = fs.readFileSync(creditsPath, "utf8");
    const m = AI_CREDITS_HEADING_RE.exec(text);
    if (m) {
      const rest = text.slice(m.index + m[0].length);
      const next = rest.search(/^## /m);
      creditsSection = next < 0 ? rest : rest.slice(0, next);
    }
  }
  if (files.length > 0 && creditsSection === null)
    err(
      "credits",
      "CREDITS.md",
      "thiếu mục riêng cho ảnh AI (tiêu đề dạng `## N. Ảnh do AI sinh ...`)",
    );

  // Đọc các JSON nguồn
  /** @type {Map<string, any>} */
  const parsed = new Map();
  for (const n of jsonNames) {
    const full = path.join(sourceDir, n);
    try {
      parsed.set(n, JSON.parse(fs.readFileSync(full, "utf8")));
    } catch (e) {
      err(
        "badJson",
        rel(full),
        `không đọc được JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Mỗi JSON phải trỏ tới ảnh có thật, dưới thư mục ảnh AI, đúng tên, băm khớp, lược đồ đủ
  for (const [n, j] of parsed) {
    const jsonRel = rel(path.join(sourceDir, n));
    for (const problem of validateAiSource(j)) err("schema", jsonRel, problem);
    const asset =
      typeof j?.asset === "string" ? path.posix.normalize(j.asset.replace(/\\/g, "/")) : "";
    if (!asset.startsWith(aiPrefix) || asset.includes("..")) {
      err("assetPath", jsonRel, `\`asset\` "${j?.asset}" phải nằm dưới ${aiPrefix}`);
      continue;
    }
    const stem = path.posix.basename(asset, path.posix.extname(asset));
    if (`${stem}.json` !== n)
      err("nameMismatch", jsonRel, `tên JSON phải là ${stem}.json (theo tên ảnh)`);
    const full = path.resolve(rootDir, asset);
    if (!fs.existsSync(full)) {
      err("orphanSource", jsonRel, `trỏ tới ${asset} không tồn tại`);
      continue;
    }
    if (
      typeof j.finalSha256 === "string" &&
      HEX64.test(j.finalSha256) &&
      sha256File(full) !== j.finalSha256
    )
      err(
        "badHash",
        jsonRel,
        `\`finalSha256\` không khớp tệp thật ${asset} (thực: ${sha256File(full)})`,
      );
  }

  // Mỗi ảnh phải có JSON cùng tên trỏ đúng về nó, dòng riêng ở CREDITS.md, và siêu dữ liệu sạch
  for (const f of files) {
    const ext = path.posix.extname(f).toLowerCase();
    if (!AI_ALLOWED_EXT.has(ext)) {
      err(
        "badFormat",
        f,
        `định dạng ${ext || "(không đuôi)"} không được phép (chỉ .webp / .png đã xoá siêu dữ liệu)`,
      );
      continue;
    }
    const stem = path.posix.basename(f, path.posix.extname(f));
    const j = parsed.get(`${stem}.json`);
    if (!jsonNames.includes(`${stem}.json`))
      err("noSource", f, `thiếu docs/art/nguon/${stem}.json`);
    else if (j && path.posix.normalize(String(j.asset ?? "").replace(/\\/g, "/")) !== f)
      err(
        "assetMismatch",
        f,
        `docs/art/nguon/${stem}.json trỏ tới "${j.asset}", không phải ảnh này`,
      );
    if (creditsSection !== null) {
      const short = f.replace(/^client\/public\//, "");
      if (!(
        matchExactToken(creditsSection, f) ||
        matchExactToken(creditsSection, short) ||
        matchExactToken(creditsSection, path.posix.basename(f))
      ))
        err("credits", f, "chưa có dòng riêng trong mục ảnh AI của CREDITS.md");
    }
    const meta = auditImageMetadata(fs.readFileSync(path.resolve(rootDir, f)), ext);
    if (meta.error) err("badImage", f, meta.error);
    else if (meta.forbidden.length > 0)
      err(
        "metadata",
        f,
        `còn khối siêu dữ liệu: ${[...new Set(meta.forbidden)].join(", ")} (ComfyUI nhúng prompt + workflow ở đây)`,
      );
  }
  return { files, sources, errors };
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

    // Ảnh do AI sinh (docs/KE_HOACH_DO_HOA_AI.md mục 9.4 (a), (b))
    const aiAudit = auditAiImages();
    if (aiAudit.errors.length > 0) {
      console.error(
        `\n❌ LỖI ẢNH AI: ${aiAudit.errors.length} vấn đề với ảnh do AI sinh (client/public/assets/ai/, docs/art/nguon/):`,
      );
      for (const e of aiAudit.errors) console.error(`  - [${e.kind}] ${e.file}: ${e.detail}`);
      process.exit(1);
    }
    console.log(
      `✓ Ảnh AI: ${aiAudit.files.length} ảnh, ${aiAudit.sources.length} tệp nguồn, băm khớp, không siêu dữ liệu, có dòng riêng ở CREDITS.md.`,
    );

    console.log(`\n✓ TẤT CẢ TÀI NGUYÊN ĐỀU HỢP LỆ VÀ CÓ NGUỒN GỐC RÕ RÀNG.`);
  } catch (err) {
    console.error("[check-credits] Lỗi khi thực hiện rà soát:", err);
    process.exit(1);
  }
}
