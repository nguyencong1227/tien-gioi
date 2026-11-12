/* global console */
/**
 * Script kiểm tra ngân sách hiệu năng tĩnh (Static Performance Budget Checker)
 * M5.1, Issue #330, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.
 *
 * Kiểm tra các chỉ số tài nguyên tĩnh trước khi merge:
 * 1. Gói JS chính nén gzip (dist/assets/index-*.js) <= 520 KB
 * 2. Bộ tệp atlas + tileset trong client/public/assets/ <= 1024 KB (1 MB)
 * 3. Tổng bộ nhớ texture tĩnh (ảnh PNG + texture sinh bằng mã) <= 48 MB (bậc Thấp)
 *
 * Chạy: node client/scripts/check-perf-budget.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  if (!buffer || buffer.length < 24) return null;
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
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
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

/**
 * Tính toán bộ nhớ texture tĩnh (ảnh PNG tải từ assets + texture sinh bằng mã)
 * Mỗi điểm ảnh RGBA chiếm 4 bytes trong bộ nhớ VRAM.
 * @param {string} assetsDir
 * @returns {{ items: Array<{ name: string, width: number, height: number, bytes: number, mb: number }>, totalBytes: number, totalMb: number }}
 */
export function calculateStaticTextureMemory(assetsDir) {
  const items = [];
  let totalBytes = 0;

  // 1. Quét đệ quy tất cả các tệp .png trong assets
  function scanPngs(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanPngs(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".png")) {
        const buf = fs.readFileSync(fullPath);
        const dim = readPngDimensions(buf);
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

  scanPngs(assetsDir);

  // 2. Texture sinh bằng mã lúc chạy (từ gfx/fx và gfx/decor-tileset: fx-font 576x1008, fx-atlas 192x32, decor-tileset 320x32, light-vignette 128x128, light-white 4x4)
  const codeGenerated = [
    { name: "fx-font (sinh bằng mã)", width: 576, height: 1008 },
    { name: "fx-atlas (sinh bằng mã)", width: 192, height: 32 },
    { name: "decor-tileset (sinh bằng mã)", width: 320, height: 32 },
    { name: "light-vignette (sinh bằng mã)", width: 128, height: 128 },
    { name: "light-white (sinh bằng mã)", width: 4, height: 4 },
    { name: "fog-blob (sinh bằng mã)", width: 128, height: 128 },
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
 * Kiểm tra toàn bộ ngân sách tĩnh so với perf-budget.json
 * @param {{ budgetPath?: string, distDir?: string, assetsDir?: string }} [opts]
 * @returns {{ ok: boolean, bundle: any, atlas: any, texture: any, errors: string[] }}
 */
export function checkPerfBudget(opts = {}) {
  const budgetPath = opts.budgetPath || BUDGET_FILE;
  const distDir = opts.distDir || DIST_DIR;
  const assetsDir = opts.assetsDir || ASSETS_DIR;

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

  // 3. Kiểm tra Texture Memory tĩnh (so với bậc Thấp)
  const texture = calculateStaticTextureMemory(assetsDir);
  const textureLimitMb = budget.static.textureMemoryMb.low;
  const textureOk = texture.totalMb <= textureLimitMb;
  if (!textureOk) {
    errors.push(
      `Tổng bộ nhớ texture tĩnh ${texture.totalMb} MB vượt ngân sách bậc Thấp ${textureLimitMb} MB!`,
    );
  }

  return {
    ok: errors.length === 0,
    bundle,
    atlas,
    texture: { ...texture, limitMb: textureLimitMb, ok: textureOk },
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

    console.log(`\n3. Bộ nhớ Texture tĩnh (VRAM RGBA):`);
    for (const it of res.texture.items) {
      console.log(`   - ${it.name} (${it.width}x${it.height}): ${it.mb} MB`);
    }
    console.log(
      `   ${res.texture.ok ? "✓" : "✗"} Tổng bộ nhớ texture: ${res.texture.totalMb} MB / Ngân sách bậc Thấp: <= ${res.texture.limitMb} MB`,
    );

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
