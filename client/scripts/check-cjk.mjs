// Kiểm tra KHÔNG có chữ Hán / chữ CJK trong mã và tài liệu (QUYET_DINH_M3 mục 12, 13/11/2026): mọi chữ người chơi thấy phải là
// tiếng Việt hoặc biểu tượng vẽ. Chạy: `npm run check:cjk` (CI chạy bước này và cả `npm test`, xem client/src/cjk.test.ts).
//
// Quét mọi tệp văn bản mà git theo dõi (bỏ tệp nhị phân: ảnh, phông, APK...; bỏ khóa npm). Ngoài ký tự thật còn bắt DẠNG THOÁT
// của chúng, vì chữ Hán viết thành chuỗi thoát vẫn hiện ra cho người chơi: `\uXXXX`, `\u{X...}`, thực thể HTML `&#xHEX;` / `&#DEC;`
// và (chỉ trong .css / .html) thoát CSS `\HEX`. Dữ liệu thử cần ký tự CJK (vd kiểm xử lý điểm mã ngoài BMP) thì dựng bằng
// `String.fromCodePoint(0x...)` trong test, KHÔNG viết ký tự hay chuỗi thoát vào mã nguồn.
//
// Mã nguồn tệp này cố ý không chứa ký tự CJK hay chuỗi thoát nào: các dải được viết bằng số.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Dải điểm mã bị cấm [từ, đến] (gồm hai đầu). */
export const CJK_RANGES = [
  [0x2e80, 0x2fdf], // bộ thủ CJK, bộ thủ Khang Hy
  [0x3000, 0x303f], // dấu câu và ký hiệu CJK
  [0x3040, 0x30ff], // hiragana, katakana
  [0x3100, 0x318f], // bopomofo, hangul tương thích
  [0x31a0, 0x31ff], // bopomofo mở rộng, nét CJK, katakana mở rộng
  [0x3200, 0x33ff], // CJK khoanh tròn, CJK tương thích
  [0x3400, 0x4dbf], // mở rộng A
  [0x4e00, 0x9fff], // chữ Hán thống nhất
  [0xac00, 0xd7af], // hangul
  [0xf900, 0xfaff], // chữ Hán tương thích
  [0xff00, 0xffef], // dạng toàn chiều / bán chiều
  [0x20000, 0x2fa1f], // mở rộng B tới F, bổ sung tương thích
];

/** Điểm mã `cp` có thuộc dải bị cấm không. */
export function isCjk(cp) {
  return CJK_RANGES.some(([a, b]) => cp >= a && cp <= b);
}

const EXT_BINARY = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".apk",
  ".aab",
  ".jar",
  ".keystore",
  ".jks",
  ".gz",
  ".zip",
  ".pdf",
  ".mp3",
  ".ogg",
  ".wav",
]);

/** Tệp không phải văn bản để quét (theo đuôi) hoặc khóa npm (chứa băm, tên gói). */
export function isSkippedFile(file) {
  const base = path.basename(file);
  if (base === "package-lock.json") return true;
  return EXT_BINARY.has(path.extname(file).toLowerCase());
}

/** Có nên bắt thoát CSS `\HEX` ở tệp này (chỉ .css / .html: nơi `content: "\4e00"` có nghĩa). */
function usesCssEscapes(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === ".css" || ext === ".html";
}

function hex(cp) {
  return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Tìm CJK trong `text`: trả về mảng `{ line, col, what, cp }` (dòng / cột bắt đầu từ 1).
 * `file` chỉ để quyết định có bắt thoát CSS không (có thể bỏ trống).
 */
export function findCjk(text, file = "") {
  const out = [];
  const lines = text.split("\n");
  const cssEsc = usesCssEscapes(file);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 1. Ký tự thật
    let col = 0;
    for (const ch of line) {
      col++;
      const cp = ch.codePointAt(0);
      if (isCjk(cp)) out.push({ line: i + 1, col, what: `ký tự ${hex(cp)}`, cp });
    }
    // 2. Dạng thoát: \uXXXX, \u{X...}, &#xHEX;, &#DEC;, (css/html) \HEX
    const esc = [
      [/\\u([0-9a-fA-F]{4})/g, (m) => parseInt(m[1], 16), "thoát \\u"],
      [/\\u\{([0-9a-fA-F]{1,6})\}/g, (m) => parseInt(m[1], 16), "thoát \\u{}"],
      [/&#[xX]([0-9a-fA-F]{1,6});/g, (m) => parseInt(m[1], 16), "thực thể HTML"],
      [/&#([0-9]{1,7});/g, (m) => parseInt(m[1], 10), "thực thể HTML"],
    ];
    if (cssEsc)
      esc.push([/\\([0-9a-fA-F]{4,6})(?![0-9a-fA-F])/g, (m) => parseInt(m[1], 16), "thoát CSS"]);
    for (const [re, toCp, label] of esc) {
      for (const m of line.matchAll(re)) {
        const cp = toCp(m);
        if (Number.isFinite(cp) && isCjk(cp)) {
          out.push({ line: i + 1, col: m.index + 1, what: `${label} ${hex(cp)}`, cp });
        }
      }
    }
  }
  return out;
}

/** Danh sách tệp git theo dõi, đường dẫn tương đối gốc repo. Ném lỗi nếu không chạy được git. */
export function trackedFiles(rootDir) {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw.split("\0").filter(Boolean);
}

/**
 * Quét các tệp (đường dẫn tương đối `rootDir`): trả về `{ scanned, violations }`, mỗi vi phạm là `{ file, line, col, what }`.
 * Tệp không đọc được dạng UTF-8 hợp lệ hoặc chứa byte NUL được coi là nhị phân và bỏ qua.
 */
export function scanFiles(rootDir, files) {
  let scanned = 0;
  const violations = [];
  for (const file of files) {
    if (isSkippedFile(file)) continue;
    const full = path.join(rootDir, file);
    let buf;
    try {
      buf = fs.readFileSync(full);
    } catch {
      continue; // đã xoá khỏi đĩa nhưng còn trong chỉ mục git
    }
    if (buf.includes(0)) continue;
    scanned++;
    for (const v of findCjk(buf.toString("utf8"), file)) violations.push({ file, ...v });
  }
  return { scanned, violations };
}

function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  let files;
  try {
    files = trackedFiles(rootDir);
  } catch (e) {
    process.stderr.write(`[LỖI] Không chạy được 'git ls-files': ${e.message}\n`);
    process.exit(2);
  }
  const { scanned, violations } = scanFiles(rootDir, files);
  if (violations.length === 0) {
    process.stdout.write(`OK: không có chữ Hán / CJK trong ${scanned} tệp văn bản.\n`);
    return;
  }
  process.stderr.write(
    `[LỖI] Có ${violations.length} chỗ chứa chữ Hán / CJK (mọi chữ người chơi thấy phải là tiếng Việt):\n`,
  );
  for (const v of violations.slice(0, 60))
    process.stderr.write(`  ${v.file}:${v.line}:${v.col}  ${v.what}\n`);
  if (violations.length > 60) process.stderr.write(`  ... và ${violations.length - 60} chỗ nữa\n`);
  process.stderr.write(
    "Đổi sang tiếng Việt hoặc biểu tượng vẽ. Dữ liệu thử cần ký tự CJK thì dựng bằng String.fromCodePoint(0x...) trong test.\n",
  );
  process.exit(1);
}

// Chạy khi gọi trực tiếp (`node client/scripts/check-cjk.mjs`), không chạy khi được import trong test
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
