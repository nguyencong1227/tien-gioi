/* global console */
/**
 * Script kiểm tra ngân sách hiệu năng tĩnh (Static Performance Budget Checker)
 * M5.1, Issue #330, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10;
 * M7.15, Issue #516: bổ sung kiểm tra ngân sách theo gói tải (Packs).
 *
 * Kiểm tra các chỉ số tài nguyên tĩnh trước khi merge:
 * 1. Gói JS chính nén gzip (dist/assets/index-*.js) <= 520 KB
 * 2. Bộ tệp atlas + tileset trong client/public/assets/ <= 1024 KB (1 MB)
 * 3. Tổng bộ nhớ texture tĩnh (ảnh PNG + texture sinh bằng mã) <= 48 MB (bậc Thấp)
 * 4. Ngân sách các gói tải (Packs) theo perf-budget.json (core <= 2MB, map <= 2MB, icons <= 3MB, audio <= 5MB, hd <= 3x)
 *
 * Chạy: node client/scripts/check-perf-budget.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import process from "node:process";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PACKS_DIR,
  DEFAULT_MANIFEST_PATH,
  collectFilesRecursively,
  toPosixPath,
} from "./build-packs.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");
const DIST_DIR = path.resolve(CLIENT_DIR, "dist");
const ASSETS_DIR = path.resolve(CLIENT_DIR, "public/assets");
const BUDGET_FILE = path.resolve(CLIENT_DIR, "perf-budget.json");

/**
 * Đọc chiều rộng và chiều cao từ tiêu đề PNG (chuẩn IHDR chunk)
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function readPngDimensions(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a
  ) {
    return null;
  }
  const ihdrType = buffer.toString("ascii", 12, 16);
  if (ihdrType !== "IHDR") return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Đọc kích thước (width, height) từ header của tệp WebP (VP8, VP8L hoặc VP8X)
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
export function readWebpDimensions(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  // RIFF header: 'RIFF' (offset 0..3) và 'WEBP' (offset 8..11)
  if (
    buffer[0] !== 0x52 || // 'R'
    buffer[1] !== 0x49 || // 'I'
    buffer[2] !== 0x46 || // 'F'
    buffer[3] !== 0x46 || // 'F'
    buffer[8] !== 0x57 || // 'W'
    buffer[9] !== 0x45 || // 'E'
    buffer[10] !== 0x42 || // 'B'
    buffer[11] !== 0x50 // 'P'
  ) {
    return null;
  }

  const format = buffer.toString("ascii", 12, 16);

  // 1. Extended WebP (VP8X)
  if (format === "VP8X") {
    if (buffer.length < 30) return null;
    // Canvas width: 24-bit LE tại byte 24 + 1
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    // Canvas height: 24-bit LE tại byte 27 + 1
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  // 2. Lossless WebP (VP8L)
  if (format === "VP8L") {
    if (buffer.length < 25) return null;
    // Byte 20 phải là 0x2F (signature)
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  // 3. Lossy WebP (VP8 )
  if (format === "VP8 ") {
    if (buffer.length < 30) return null;
    // VP8 sync code: 0x9D 0x01 0x2A tại offset 23..25
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return null;
    }
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  return null;
}

/**
 * Đọc kích thước ảnh từ buffer theo định dạng PNG hoặc WebP
 * @param {Buffer} buffer
 * @param {string} [ext]
 * @returns {{ width: number, height: number } | null}
 */
export function readImageDimensions(buffer, ext = "") {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  const normalized = ext.toLowerCase();
  if (normalized === ".png") {
    return readPngDimensions(buffer);
  }
  if (normalized === ".webp") {
    return readWebpDimensions(buffer);
  }
  return readPngDimensions(buffer) || readWebpDimensions(buffer);
}

/**
 * Kiểm tra kích thước gói JS chính sau khi nén gzip
 * @param {string} distDir
 * @param {number} limitKb
 * @returns {{ file: string, rawBytes: number, gzipBytes: number, gzipKb: number, limitKb: number, ok: boolean }}
 */
export function checkBundleGzip(distDir, limitKb) {
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    throw new Error(
      `Thư mục dist/assets không tồn tại tại: ${assetsDir}. Cần chạy 'npm run build' trước.`,
    );
  }

  const entries = fs.readdirSync(assetsDir);
  // Tìm gói JS chính: tệp index-*.js lớn nhất trong dist/assets/
  const jsFiles = entries.filter((f) => /^index-.*\.js$/.test(f) && !f.endsWith(".map"));
  if (jsFiles.length === 0) {
    throw new Error(`Không tìm thấy tệp bundle JS chính (index-*.js) trong ${assetsDir}`);
  }
  jsFiles.sort(
    (a, b) => fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size,
  );
  const mainJsFile = jsFiles[0];

  const filePath = path.join(assetsDir, mainJsFile);
  const rawBuffer = fs.readFileSync(filePath);
  const gzipBuffer = zlib.gzipSync(rawBuffer, { level: 9 });
  const rawBytes = rawBuffer.length;
  const gzipBytes = gzipBuffer.length;
  const gzipKb = Number((gzipBytes / 1024).toFixed(2));
  const ok = gzipKb <= limitKb;

  return {
    file: mainJsFile,
    rawBytes,
    gzipBytes,
    gzipKb,
    limitKb,
    ok,
  };
}

/**
 * Kiểm tra tổng kích thước của atlas + tileset
 * @param {string} assetsDir
 * @param {number} limitKb
 * @returns {{ files: Array<{ file: string, bytes: number, kb: number }>, totalBytes: number, totalKb: number, limitKb: number, ok: boolean }}
 */
export function checkAtlasTileset(assetsDir, limitKb) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Thư mục assets không tồn tại tại: ${assetsDir}`);
  }

  const targetFiles = ["atlas.png", "tileset.png", "atlas.json"];
  const files = [];
  let totalBytes = 0;

  for (const name of targetFiles) {
    const fullPath = path.join(assetsDir, name);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      totalBytes += stat.size;
      files.push({
        file: name,
        bytes: stat.size,
        kb: Number((stat.size / 1024).toFixed(2)),
      });
    }
  }

  const totalKb = Number((totalBytes / 1024).toFixed(2));
  const ok = totalKb <= limitKb;

  return {
    files,
    totalBytes,
    totalKb,
    limitKb,
    ok,
  };
}

/** Trần mặc định của ảnh AI khi `perf-budget.json` thiếu `static.aiAssets` (docs/KE_HOACH_DO_HOA_AI.md mục 9.4 (c)). */
export const DEFAULT_AI_LIMITS = { maxFileKb: 150, totalKb: 300 };

/**
 * Trần dung lượng ảnh do AI sinh (`client/public/assets/ai/`, docs/KE_HOACH_DO_HOA_AI.md mục 9.4 (c)): mỗi ảnh <= `maxFileKb`, tổng <= `totalKb`. Ảnh được
 * precache cho MỌI người chơi web ở lần mở đầu (`stamp-sw.mjs` đưa mọi tệp của `dist/` vào `PRECACHE_URLS`, `cache.addAll` là tất cả hoặc không gì) và vào cả APK,
 * nên trần chặt. Thư mục không tồn tại = chưa có ảnh nào = hợp lệ. Bộ nhớ texture của ảnh đã được `calculateStaticTextureMemory` quét đệ quy tính vào.
 * @param {string} aiDir
 * @param {{ maxFileKb: number, totalKb: number }} limits
 * @returns {{ files: Array<{ file: string, bytes: number, kb: number, over: boolean }>, totalBytes: number, totalKb: number, limits: { maxFileKb: number, totalKb: number }, ok: boolean, errors: string[] }}
 */
export function checkAiAssets(aiDir, limits) {
  const files = [];
  const errors = [];
  let totalBytes = 0;
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const bytes = fs.statSync(full).size;
        totalBytes += bytes;
        const kb = Number((bytes / 1024).toFixed(2));
        const over = kb > limits.maxFileKb;
        files.push({ file: path.relative(aiDir, full).replace(/\\/g, "/"), bytes, kb, over });
        if (over)
          errors.push(
            `Ảnh AI ${path.relative(aiDir, full)} ${kb} KB vượt trần mỗi ảnh ${limits.maxFileKb} KB!`,
          );
      }
    }
  };
  walk(aiDir);
  files.sort((a, b) => a.file.localeCompare(b.file));
  const totalKb = Number((totalBytes / 1024).toFixed(2));
  if (totalKb > limits.totalKb)
    errors.push(`Tổng dung lượng ảnh AI ${totalKb} KB vượt trần ${limits.totalKb} KB!`);
  return { files, totalBytes, totalKb, limits, ok: errors.length === 0, errors };
}

/**
 * Tính toán bộ nhớ texture tĩnh (ảnh PNG tải từ assets + texture sinh bằng mã)
 * Mỗi điểm ảnh RGBA chiếm 4 bytes trong bộ nhớ VRAM.
 * @param {string} assetsDir
 * @returns {{ items: Array<{ name: string, width: number, height: number, bytes: number, mb: number }>, totalBytes: number, totalMb: number }}
 */
export function calculateStaticTextureMemory(assetsDir) {
  const items = [];
  let totalBytes = 0;

  // 1. Quét đệ quy tất cả các tệp .png và .webp trong assets
  function scanTextures(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanTextures(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".png" || ext === ".webp") {
          const buf = fs.readFileSync(fullPath);
          const dim = readImageDimensions(buf, ext);
          if (dim && dim.width > 0 && dim.height > 0) {
            const vramBytes = dim.width * dim.height * 4;
            totalBytes += vramBytes;
            const relName = path.relative(assetsDir, fullPath);
            items.push({
              name: relName,
              width: dim.width,
              height: dim.height,
              bytes: vramBytes,
              mb: Number((vramBytes / (1024 * 1024)).toFixed(3)),
            });
          }
        }
      }
    }
  }

  scanTextures(assetsDir);

  // 2. Texture sinh bằng mã lúc chạy (từ gfx/fx và gfx/decor-tileset)
  const codeGenerated = [
    { name: "fx-font (sinh bằng mã)", width: 576, height: 1008 },
    { name: "fx-atlas (sinh bằng mã)", width: 192, height: 32 },
    { name: "decor-tileset (sinh bằng mã)", width: 320, height: 32 },
    { name: "light-vignette (sinh bằng mã)", width: 128, height: 128 },
    { name: "light-white (sinh bằng mã)", width: 4, height: 4 },
    { name: "fog-blob (sinh bằng mã)", width: 128, height: 128 },
    { name: "water-shimmer (sinh bằng mã)", width: 128, height: 32 },
    { name: "blob-shadow (sinh bằng mã)", width: 64, height: 28 },
  ];

  for (const gen of codeGenerated) {
    const vramBytes = gen.width * gen.height * 4;
    totalBytes += vramBytes;
    items.push({
      name: gen.name,
      width: gen.width,
      height: gen.height,
      bytes: vramBytes,
      mb: Number((vramBytes / (1024 * 1024)).toFixed(3)),
    });
  }

  const totalMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
  return {
    items,
    totalBytes,
    totalMb,
  };
}

/**
 * Tính kích thước đã nén hiệu dụng ("byte thật phải tải", THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.1):
 * - Ảnh (.png, .webp, .jpg) và âm thanh (.ogg, .mp3): byte trên đĩa (định dạng vốn đã nén).
 * - Văn bản (.json, .svg, .txt, .csv, .xml, .css, .js): gzip level 9.
 * - Khác: kích thước đĩa.
 * @param {string} filePath
 * @returns {number} Số byte hiệu dụng
 */
export function calculateEffectiveFileSize(filePath) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const uncompressedTextExts = new Set([
    ".json",
    ".svg",
    ".txt",
    ".csv",
    ".xml",
    ".css",
    ".js",
    ".html",
  ]);
  if (uncompressedTextExts.has(ext)) {
    const raw = fs.readFileSync(filePath);
    return zlib.gzipSync(raw, { level: 9 }).length;
  }
  return stat.size;
}

/** Các giới hạn khớp bộ nạp client (client/src/gfx/packs.ts) */
export const PACK_ID_RE = /^[a-z0-9_:.-]{1,64}$/i;
export const MAX_PACKS = 64;
export const MAX_FILES_PER_PACK = 512;
export const MAX_PATH_LENGTH = 200;

/**
 * Kiểm tra tính hợp lệ của đường dẫn tệp trong gói
 * @param {string} relPath
 * @returns {string | null} Lỗi phát hiện hoặc null nếu hợp lệ
 */
export function validatePackFilePath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) {
    return "Đường dẫn tệp trong gói rỗng!";
  }
  if (relPath.length > MAX_PATH_LENGTH) {
    return `Đường dẫn tệp '${relPath}' dài ${relPath.length} ký tự, vượt quá giới hạn tối đa ${MAX_PATH_LENGTH} ký tự!`;
  }
  if (
    relPath.startsWith("/") ||
    relPath.includes("\\") ||
    relPath.includes("?") ||
    relPath.includes("#")
  ) {
    return `Đường dẫn tệp '${relPath}' chứa ký tự cấm (?, #, \\ hoặc bắt đầu bằng /)!`;
  }
  const segments = relPath.split("/");
  if (segments.some((seg) => seg === ".." || seg === "." || seg === "")) {
    return `Đường dẫn tệp '${relPath}' chứa đoạn không hợp lệ ('.' hoặc '..' hoặc '//')!`;
  }
  return null;
}

/**
 * Kiểm tra ngân sách cho các gói tải theo nhu cầu (M7.15, #516; THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.1)
 * @param {{
 *   packsDir?: string,
 *   manifestPath?: string,
 *   budgetPacks?: any
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   manifestFound: boolean,
 *   packs: Array<{ id: string, kind: string, mapId?: string, fileCount: number, rawKb: number, compressedKb: number, limitKb: number, vramBytes: number, vramMb: number, ok: boolean }>,
 *   errors: string[]
 * }}
 */
export function checkPacksBudget(opts = {}) {
  const packsDir = opts.packsDir || DEFAULT_PACKS_DIR;
  const manifestPath = opts.manifestPath || DEFAULT_MANIFEST_PATH;
  const budgetPacks = opts.budgetPacks;
  const errors = [];

  // Nếu không có cấu hình ngân sách packs: bỏ qua
  if (!budgetPacks) {
    return { ok: true, manifestFound: false, packs: [], errors: [] };
  }

  const manifestExists = fs.existsSync(manifestPath);
  const packsDirExists = fs.existsSync(packsDir);

  // Không có thư mục packs và không có manifest: hợp lệ (chưa có tài sản gói nào)
  if (!packsDirExists && !manifestExists) {
    return { ok: true, manifestFound: false, packs: [], errors: [] };
  }

  // Có thư mục packs nhưng không có manifest:
  if (packsDirExists && !manifestExists) {
    const diskFiles = collectFilesRecursively(packsDir);
    if (diskFiles.length === 0) {
      return { ok: true, manifestFound: false, packs: [], errors: [] };
    }
    errors.push(
      `Thư mục packs chứa ${diskFiles.length} tệp nhưng thiếu manifest.json! Hãy chạy 'npm run build:packs'.`,
    );
    return { ok: false, manifestFound: false, packs: [], errors };
  }

  // Đọc manifest
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    errors.push(`Lỗi đọc JSON manifest tại ${manifestPath}: ${err.message}`);
    return { ok: false, manifestFound: true, packs: [], errors };
  }

  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.packs)) {
    errors.push(`Cấu trúc manifest tại ${manifestPath} không hợp lệ (thiếu mảng 'packs').`);
    return { ok: false, manifestFound: true, packs: [], errors };
  }

  // N1: Kiểm tra số lượng gói tối đa
  if (manifest.packs.length > MAX_PACKS) {
    errors.push(
      `Tổng số gói (${manifest.packs.length}) vượt quá giới hạn tối đa ${MAX_PACKS} gói mà client hỗ trợ!`,
    );
  }

  // 1. Kiểm tra tính toàn vẹn 2 chiều giữa đĩa và manifest (nếu thư mục packs tồn tại)
  if (packsDirExists) {
    const diskFilePaths = collectFilesRecursively(packsDir);
    const diskMap = new Map();
    for (const abs of diskFilePaths) {
      const rel = toPosixPath(path.relative(packsDir, abs));
      const stat = fs.statSync(abs);
      const sha256 = crypto
        .createHash("sha256")
        .update(fs.readFileSync(abs))
        .digest("hex")
        .toLowerCase();
      diskMap.set(rel, { abs, size: stat.size, sha256 });
    }

    const manifestMap = new Map();
    for (const p of manifest.packs) {
      if (Array.isArray(p.files)) {
        for (const f of p.files) {
          manifestMap.set(f.path, { file: f, packId: p.id });
        }
      }
    }

    // Mọi tệp trên đĩa phải có trong manifest
    for (const [rel] of diskMap) {
      if (!manifestMap.has(rel)) {
        errors.push(`Tệp trên đĩa '${rel}' không được khai báo trong manifest.json!`);
      }
    }

    // Mọi tệp trong manifest phải có trên đĩa và khớp kích thước / mã băm
    for (const [rel, { file, packId }] of manifestMap) {
      const onDisk = diskMap.get(rel);
      if (!onDisk) {
        errors.push(
          `Tệp '${rel}' trong gói '${packId}' được khai báo trong manifest nhưng không tồn tại trên đĩa!`,
        );
        continue;
      }
      if (onDisk.size !== file.bytes) {
        errors.push(
          `Tệp '${rel}' trong gói '${packId}' sai kích thước bytes: trên đĩa ${onDisk.size} != manifest ${file.bytes}`,
        );
      }
      if (onDisk.sha256 !== file.sha256.toLowerCase()) {
        errors.push(
          `Tệp '${rel}' trong gói '${packId}' sai mã băm SHA-256: trên đĩa ${onDisk.sha256} != manifest ${file.sha256}`,
        );
      }
    }
  }

  // 2. Tính toán dung lượng và so sánh với ngân sách từng gói
  const evaluatedPacks = [];
  const packMap = new Map();

  for (const p of manifest.packs) {
    // N1: Kiểm tra định dạng ID gói
    if (!PACK_ID_RE.test(p.id)) {
      errors.push(`Id gói '${p.id}' không hợp lệ! Phải khớp /^[a-z0-9_:.-]{1,64}$/i.`);
    }
    if (p.mapId && !PACK_ID_RE.test(p.mapId)) {
      errors.push(`mapId '${p.mapId}' trong gói '${p.id}' không hợp lệ!`);
    }

    let totalRawBytes = 0;
    let totalCompressedBytes = 0;
    let totalVramBytes = 0;

    if (!Array.isArray(p.files)) {
      errors.push(`Gói '${p.id}' thiếu mảng 'files'!`);
    } else {
      if (p.files.length > MAX_FILES_PER_PACK) {
        errors.push(
          `Gói '${p.id}' chứa ${p.files.length} tệp, vượt quá giới hạn tối đa ${MAX_FILES_PER_PACK} tệp/gói!`,
        );
      }

      for (const f of p.files) {
        // N1: Kiểm tra đường dẫn tệp trong gói
        const pathErr = validatePackFilePath(f.path);
        if (pathErr) {
          errors.push(`Gói '${p.id}': ${pathErr}`);
        }

        totalRawBytes += f.bytes || 0;
        let compBytes = f.bytes || 0;
        let fileVramBytes = 0;

        const ext = path.extname(f.path || "").toLowerCase();
        const isTexture = ext === ".png" || ext === ".webp";

        if (packsDirExists) {
          const abs = path.join(packsDir, f.path);
          if (fs.existsSync(abs)) {
            compBytes = calculateEffectiveFileSize(abs);
            if (isTexture) {
              const buf = fs.readFileSync(abs);
              const dim = readImageDimensions(buf, ext);
              if (dim && dim.width > 0 && dim.height > 0) {
                fileVramBytes = dim.width * dim.height * 4;
              }
            }
          }
        }

        // Hỗ trợ mock vramBytes trong unit test nếu không có file thật trên đĩa
        if (fileVramBytes === 0 && typeof f.vramBytes === "number") {
          fileVramBytes = f.vramBytes;
        }

        totalCompressedBytes += compBytes;
        totalVramBytes += fileVramBytes;
      }
    }

    const rawKb = Number((totalRawBytes / 1024).toFixed(2));
    const compressedKb = Number((totalCompressedBytes / 1024).toFixed(2));
    const vramMb = Number((totalVramBytes / (1024 * 1024)).toFixed(3));

    const packRecord = {
      id: p.id,
      kind: p.kind,
      ...(p.mapId ? { mapId: p.mapId } : {}),
      fileCount: Array.isArray(p.files) ? p.files.length : 0,
      rawBytes: totalRawBytes,
      rawKb,
      compressedBytes: totalCompressedBytes,
      compressedKb,
      vramBytes: totalVramBytes,
      vramMb,
      limitKb: 0,
      ok: true,
    };
    evaluatedPacks.push(packRecord);
    packMap.set(p.id, packRecord);
  }

  // Đánh giá hạn mức cho từng gói
  for (const p of evaluatedPacks) {
    let limitKb;
    if (p.kind === "core") {
      limitKb = budgetPacks.core?.maxKb ?? 2048;
    } else if (p.kind === "map") {
      limitKb = budgetPacks.map?.maxKb ?? 2048;
    } else if (p.kind === "icons") {
      limitKb = budgetPacks.icons?.maxKb ?? 3072;
    } else if (p.kind === "audio") {
      limitKb = budgetPacks.audio?.maxKb ?? 5120;
    } else if (p.kind === "hd") {
      const maxFactor = budgetPacks.hdMaxFactor ?? 3;
      // Tìm gói thường tương ứng (hd:core -> core, hd:map:hac_phong -> map:hac_phong)
      let baseId = p.id.replace(/^hd:/, "");
      const basePack = packMap.get(baseId);
      if (basePack) {
        limitKb = Number((basePack.compressedKb * maxFactor).toFixed(2));
      } else {
        const baseLimit = baseId.startsWith("map:")
          ? (budgetPacks.map?.maxKb ?? 2048)
          : (budgetPacks.core?.maxKb ?? 2048);
        limitKb = baseLimit * maxFactor;
      }
    } else {
      limitKb = budgetPacks.core?.maxKb ?? 2048;
    }

    p.limitKb = limitKb;
    if (p.compressedKb > limitKb) {
      p.ok = false;
      errors.push(
        `Gói '${p.id}' (${p.compressedKb} KB đã nén) vượt ngân sách cho phép (${limitKb} KB)!`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    manifestFound: true,
    packs: evaluatedPacks,
    errors,
  };
}

/**
 * Kiểm tra bộ nhớ texture ca xấu nhất lúc chạy (Worst-case Texture Memory) theo từng bậc đồ hoạ:
 * - Các bậc Thấp (low), Vừa (mid), Cao (high): static textures + core + icons + max(map)
 * - Bậc Rất cao (ultra): static textures + (hd:core ?? core) + (hd:icons ?? icons) + max(hd:map ?? map)
 * @param {{
 *   staticTextureBytes: number,
 *   packs: Array<{ id: string, kind: string, mapId?: string, vramBytes?: number }>,
 *   tierLimits?: { low?: number, mid?: number, high?: number, ultra?: number }
 * }} params
 * @returns {{
 *   ok: boolean,
 *   tiers: Record<string, { tier: string, staticMb: number, packMb: number, totalMb: number, limitMb: number, ok: boolean }>,
 *   errors: string[]
 * }}
 */
export function checkWorstCaseTextureMemoryByTier({
  staticTextureBytes = 0,
  packs = [],
  tierLimits = { low: 48, mid: 80, high: 256, ultra: 512 },
}) {
  const packMap = new Map();
  for (const p of packs) {
    packMap.set(p.id, p);
  }

  const corePack = packMap.get("core");
  const iconsPack = packMap.get("icons");
  const mapPacks = packs.filter((p) => p.kind === "map");
  const maxMapVram = mapPacks.length > 0 ? Math.max(...mapPacks.map((p) => p.vramBytes || 0)) : 0;

  const normalWorstPackVram = (corePack?.vramBytes || 0) + (iconsPack?.vramBytes || 0) + maxMapVram;

  // Ultra: dùng HD nếu có
  const hdCorePack = packMap.get("hd:core");
  const hdIconsPack = packMap.get("hd:icons");
  const ultraCoreVram = (hdCorePack?.vramBytes ?? corePack?.vramBytes) || 0;
  const ultraIconsVram = (hdIconsPack?.vramBytes ?? iconsPack?.vramBytes) || 0;

  let maxUltraMapVram = 0;
  if (mapPacks.length > 0) {
    for (const m of mapPacks) {
      const hdMap = packMap.get(`hd:${m.id}`);
      const v = (hdMap?.vramBytes ?? m.vramBytes) || 0;
      if (v > maxUltraMapVram) maxUltraMapVram = v;
    }
  }

  const ultraWorstPackVram = ultraCoreVram + ultraIconsVram + maxUltraMapVram;

  const results = {};
  const tiers = ["low", "mid", "high", "ultra"];
  const errors = [];

  for (const tier of tiers) {
    const packVram = tier === "ultra" ? ultraWorstPackVram : normalWorstPackVram;
    const totalBytes = staticTextureBytes + packVram;
    const totalMb = Number((totalBytes / (1024 * 1024)).toFixed(2));
    const limitMb = tierLimits[tier] ?? (tier === "ultra" ? 512 : 48);
    const ok = totalMb <= limitMb;
    if (!ok) {
      errors.push(
        `Bộ nhớ texture ca xấu nhất ở bậc ${tier} (${totalMb} MB) vượt ngân sách ${limitMb} MB!`,
      );
    }
    results[tier] = {
      tier,
      staticMb: Number((staticTextureBytes / (1024 * 1024)).toFixed(2)),
      packMb: Number((packVram / (1024 * 1024)).toFixed(2)),
      totalMb,
      limitMb,
      ok,
    };
  }

  return {
    ok: errors.length === 0,
    tiers: results,
    errors,
  };
}

/**
 * Kiểm tra toàn bộ ngân sách tĩnh so với perf-budget.json
 * @param {{ budgetPath?: string, distDir?: string, assetsDir?: string, packsDir?: string, manifestPath?: string }} [opts]
 * @returns {{ ok: boolean, bundle: any, atlas: any, texture: any, packs: any, worstCaseTexture: any, errors: string[] }}
 */
export function checkPerfBudget(opts = {}) {
  const budgetPath = opts.budgetPath || BUDGET_FILE;
  const distDir = opts.distDir || DIST_DIR;
  const assetsDir = opts.assetsDir || ASSETS_DIR;
  const packsDir = opts.packsDir || DEFAULT_PACKS_DIR;
  const manifestPath = opts.manifestPath || DEFAULT_MANIFEST_PATH;
  const aiDir = opts.aiDir || path.join(assetsDir, "ai");

  if (!fs.existsSync(budgetPath)) {
    throw new Error(`Tệp cấu hình ngân sách không tồn tại: ${budgetPath}`);
  }

  const budget = JSON.parse(fs.readFileSync(budgetPath, "utf-8"));
  const errors = [];

  // 1. Kiểm tra Bundle Gzip
  const bundle = checkBundleGzip(distDir, budget.static.bundleGzipKb);
  if (!bundle.ok) {
    errors.push(
      `Gói JS chính (${bundle.file}) nén gzip ${bundle.gzipKb} KB vượt ngân sách ${bundle.limitKb} KB!`,
    );
  }

  // 2. Kiểm tra Atlas + Tileset
  const atlas = checkAtlasTileset(assetsDir, budget.static.atlasTilesetKb);
  if (!atlas.ok) {
    errors.push(
      `Tổng dung lượng atlas + tileset ${atlas.totalKb} KB vượt ngân sách ${atlas.limitKb} KB!`,
    );
  }

  // 2b. Ảnh do AI sinh: trần mỗi ảnh + tổng (M7.12 #513). Ngân sách thiếu khai báo thì dùng trần mặc định (không lặng lẽ bỏ kiểm tra).
  const aiLimits = budget.static.aiAssets ?? DEFAULT_AI_LIMITS;
  const aiAssets = checkAiAssets(aiDir, aiLimits);
  errors.push(...aiAssets.errors);

  // 3. Kiểm tra Texture Memory tĩnh (so với bậc Thấp)
  const texture = calculateStaticTextureMemory(assetsDir);
  const textureLimitMb = budget.static.textureMemoryMb.low;
  const textureOk = texture.totalMb <= textureLimitMb;
  if (!textureOk) {
    errors.push(
      `Tổng bộ nhớ texture tĩnh ${texture.totalMb} MB vượt ngân sách bậc Thấp ${textureLimitMb} MB!`,
    );
  }

  // 4. Kiểm tra Packs (M7.15, #516)
  const packs = checkPacksBudget({
    packsDir,
    manifestPath,
    budgetPacks: budget.packs,
  });
  if (!packs.ok) {
    errors.push(...packs.errors);
  }

  // 5. Kiểm tra Bộ nhớ texture ca xấu nhất theo từng bậc (M7.15, N3)
  const staticLimits = budget.static?.textureMemoryMb || {};
  const runtimeTiers = budget.runtime?.tiers || {};
  const tierLimits = {
    low: staticLimits.low ?? runtimeTiers.low?.maxTextureMemoryMb ?? 48,
    mid: staticLimits.mid ?? runtimeTiers.mid?.maxTextureMemoryMb ?? 80,
    high: staticLimits.high ?? runtimeTiers.high?.maxTextureMemoryMb ?? 256,
    ultra: staticLimits.ultra ?? runtimeTiers.ultra?.maxTextureMemoryMb ?? 512,
  };
  const worstCaseTexture = checkWorstCaseTextureMemoryByTier({
    staticTextureBytes: texture.totalBytes,
    packs: packs.packs,
    tierLimits,
  });
  if (!worstCaseTexture.ok) {
    errors.push(...worstCaseTexture.errors);
  }

  return {
    ok: errors.length === 0,
    bundle,
    atlas,
    aiAssets,
    texture: { ...texture, limitMb: textureLimitMb, ok: textureOk },
    packs,
    worstCaseTexture,
    errors,
  };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("=== KIỂM TRA NGÂN SÁCH HIỆU NĂNG TĨNH (PERFORMANCE BUDGET) ===");
  try {
    const res = checkPerfBudget();

    console.log(`\n1. Gói JS chính (gzip):`);
    console.log(
      `   ${res.bundle.ok ? "✓" : "✗"} Tệp: ${res.bundle.file} - ${res.bundle.gzipKb} KB / Ngân sách: <= ${res.bundle.limitKb} KB (Thô: ${(res.bundle.rawBytes / 1024).toFixed(2)} KB)`,
    );

    console.log(`\n2. Atlas & Tileset:`);
    for (const f of res.atlas.files) {
      console.log(`   - ${f.file}: ${f.kb} KB`);
    }
    console.log(
      `   ${res.atlas.ok ? "✓" : "✗"} Tổng: ${res.atlas.totalKb} KB / Ngân sách: <= ${res.atlas.limitKb} KB`,
    );

    console.log(`\n2b. Ảnh do AI sinh (assets/ai/):`);
    if (res.aiAssets.files.length === 0) {
      console.log(`   ✓ Chưa có ảnh AI nào (thư mục trống hoặc chưa tạo là hợp lệ).`);
    } else {
      for (const f of res.aiAssets.files) {
        console.log(
          `   ${f.over ? "✗" : "✓"} ${f.file}: ${f.kb} KB / Trần mỗi ảnh: <= ${res.aiAssets.limits.maxFileKb} KB`,
        );
      }
      console.log(
        `   ${res.aiAssets.totalKb <= res.aiAssets.limits.totalKb ? "✓" : "✗"} Tổng: ${res.aiAssets.totalKb} KB / Trần: <= ${res.aiAssets.limits.totalKb} KB`,
      );
    }

    console.log(`\n3. Bộ nhớ Texture tĩnh (VRAM RGBA):`);
    for (const it of res.texture.items) {
      console.log(`   - ${it.name} (${it.width}x${it.height}): ${it.mb} MB`);
    }
    console.log(
      `   ${res.texture.ok ? "✓" : "✗"} Tổng bộ nhớ texture: ${res.texture.totalMb} MB / Ngân sách bậc Thấp: <= ${res.texture.limitMb} MB`,
    );

    console.log(`\n4. Các gói tài nguyên tải theo nhu cầu (Packs):`);
    if (res.packs.packs.length === 0) {
      console.log(`   ✓ Chưa có gói tải nào trong client/public/packs/ (manifest rỗng là hợp lệ).`);
    } else {
      for (const p of res.packs.packs) {
        console.log(
          `   ${p.ok ? "✓" : "✗"} Gói ${p.id} (${p.kind}): ${p.compressedKb} KB / Ngân sách: <= ${p.limitKb} KB (${p.fileCount} tệp)`,
        );
      }
    }

    console.log(`\n5. Bộ nhớ Texture ca xấu nhất theo bậc đồ hoạ (Worst-case VRAM):`);
    for (const [tier, r] of Object.entries(res.worstCaseTexture.tiers)) {
      console.log(
        `   ${r.ok ? "✓" : "✗"} Bậc ${tier}: ${r.totalMb} MB (Tĩnh: ${r.staticMb} MB + Gói: ${r.packMb} MB) / Ngân sách: <= ${r.limitMb} MB`,
      );
    }

    if (!res.ok) {
      console.error("\n❌ PHÁT HIỆN VI PHẠM NGÂN SÁCH HIỆU NĂNG:");
      for (const err of res.errors) {
        console.error(`   - ${err}`);
      }
      process.exit(1);
    }

    console.log("\n🎉 TẤT CẢ CHỈ SỐ TÀI NGUYÊN ĐỀU NẰM TRONG NGÂN SÁCH AN TOÀN!");
  } catch (err) {
    console.error(`\n❌ Lỗi khi kiểm tra ngân sách: ${err.message}`);
    process.exit(1);
  }
}
