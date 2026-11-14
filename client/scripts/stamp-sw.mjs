/* global console */
// Script hậu xử lý sau `vite build`:
// - Quét toàn bộ file tĩnh trong `client/dist/` (assets, icons, index.html, manifest.webmanifest)
//   để tự động điền `PRECACHE_URLS` (không cần liệt kê thủ công từng icon/trang bị).
// - M7.15 (#516; THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.1-10.2):
//   Tài sản tải theo nhu cầu trong `dist/packs/`: CHỈ đưa gói `core` vào `PRECACHE_URLS`
//   với URL gắn băm `?v=<12 ký tự sha256>`. Các gói khác (`map:*`, `icons`, `audio`, `hd:*`)
//   tải theo nhu cầu, tuyệt đối không precache để tránh phình bộ nhớ đệm ban đầu của người chơi.
// - Tính mã băm SHA-256 theo nội dung toàn bộ bản build để gắn vào `CACHE_NAME`,
//   giúp Service Worker tự xóa cache cũ ngay khi kích hoạt bản mới.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const SW_PATH = path.join(DIST_DIR, "sw.js");

/** Đệ quy lấy danh sách đường dẫn tương đối (POSIX, bắt đầu bằng `/`) trong thư mục dist. */
export function collectDistFiles(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDistFiles(full, baseDir));
    } else if (entry.isFile()) {
      const rel = "/" + path.relative(baseDir, full).split(path.sep).join("/");
      if (rel === "/sw.js" || rel.endsWith(".map")) continue;
      results.push(rel);
    }
  }
  return results.sort();
}

/**
 * Xây dựng danh sách PRECACHE_URLS:
 * - Bao gồm "/" và tất cả các file tĩnh thông thường ngoài thư mục /packs/
 * - Với /packs/: chỉ nạp manifest.json và đưa các tệp thuộc gói 'core' với URL ?v=<12 sha256>
 * @param {string} distDir
 * @param {string[]} allFiles
 * @returns {string[]}
 */
export function buildPrecacheUrls(distDir, allFiles) {
  // 1. Lọc các file không thuộc /packs/
  const normalFiles = allFiles.filter((rel) => !rel.startsWith("/packs/"));
  const precacheUrls = ["/", ...normalFiles];

  // 2. Kiểm tra nếu có dist/packs/manifest.json để đưa gói 'core' vào
  const manifestPath = path.join(distDir, "packs/manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest && Array.isArray(manifest.packs)) {
        const corePack = manifest.packs.find((p) => p.id === "core" || p.kind === "core");
        if (corePack && Array.isArray(corePack.files)) {
          for (const f of corePack.files) {
            if (f && typeof f.path === "string" && typeof f.sha256 === "string") {
              const hash12 = f.sha256.slice(0, 12);
              precacheUrls.push(`/packs/${f.path}?v=${hash12}`);
            }
          }
        }
      }
    } catch {
      // Manifest lỗi hoặc hỏng: bỏ qua không đưa thêm
    }
  }

  return precacheUrls.sort();
}

/**
 * Đóng dấu Service Worker
 * @param {string} [distDir]
 * @param {string} [swPath]
 * @returns {{ buildVersion: string, precacheCount: number }}
 */
export function stampServiceWorker(distDir = DIST_DIR, swPath = SW_PATH) {
  if (!fs.existsSync(swPath)) {
    throw new Error(`Không tìm thấy ${swPath} — hãy chạy vite build trước.`);
  }

  const files = collectDistFiles(distDir);
  const hash = crypto.createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(distDir, rel.slice(1))));
  }
  const buildVersion = hash.digest("hex").slice(0, 8);
  const precacheUrls = buildPrecacheUrls(distDir, files);

  let swSource = fs.readFileSync(swPath, "utf8");
  swSource = swSource.replace(
    /const CACHE_NAME = "[^"]+";/,
    `const CACHE_NAME = "tien-gioi-static-${buildVersion}";`,
  );
  swSource = swSource.replace(
    /const PRECACHE_URLS = \[[\s\S]*?\];/,
    `const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};`,
  );

  fs.writeFileSync(swPath, swSource, "utf8");
  return { buildVersion, precacheCount: precacheUrls.length };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = stampServiceWorker();
  console.log(
    `✓ Đã stamp Service Worker (phiên bản ${res.buildVersion}, ${res.precacheCount} URLs).`,
  );
}
