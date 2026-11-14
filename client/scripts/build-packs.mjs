/* global console */
/**
 * Trình tạo Manifest cho các gói tải theo nhu cầu (Build Packs Manifest)
 * M7.15, Issue #516, THIET_KE_GIAO_DIEN_DO_HOA.md mục 10.1, QUYET_DINH_M3 mục 21.
 *
 * Quét cây thư mục tài sản trong client/public/packs/<gói>/ để sinh ra manifest chuẩn:
 * client/public/packs/manifest.json = {
 *   packs: [{
 *     id: string,                 // "core", "map:<mapId>", "icons", "audio", "hd:<tên>"
 *     kind: "core" | "map" | "icons" | "audio" | "hd",
 *     mapId?: string,             // chỉ có ở kind "map"
 *     files: [{ path: string, bytes: number, sha256: string }],
 *     bytes: number
 *   }]
 * }
 *
 * Chạy:
 *   node client/scripts/build-packs.mjs          # Sinh manifest.json
 *   node client/scripts/build-packs.mjs --check  # Kiểm tra manifest khớp với đĩa
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const CLIENT_DIR = path.resolve(REPO_ROOT, "client");
export const DEFAULT_PACKS_DIR = path.resolve(CLIENT_DIR, "public/packs");
export const DEFAULT_MANIFEST_PATH = path.resolve(DEFAULT_PACKS_DIR, "manifest.json");

/**
 * Thu thập đệ quy tất cả các tệp trong một thư mục, bỏ qua tệp ẩn và manifest.json
 * @param {string} dir
 * @returns {string[]} Danh sách đường dẫn tuyệt đối của các tệp
 */
export function collectFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      if (entry.name === "manifest.json") continue;
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Chuyển đổi đường dẫn sang dạng POSIX (phân cách bằng '/')
 * @param {string} p
 * @returns {string}
 */
export function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

/**
 * Tính mã băm SHA-256 dạng hex chữ thường của một tệp
 * @param {string} filePath
 * @returns {string}
 */
export function computeFileSha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").toLowerCase();
}

/**
 * Phân tích thư mục gói thành { id, kind, mapId? }
 * Quy ước hỗ trợ:
 * - core -> { id: "core", kind: "core" }
 * - icons -> { id: "icons", kind: "icons" }
 * - audio -> { id: "audio", kind: "audio" }
 * - map-<id> hoặc map_<id> -> { id: "map:" + id, kind: "map", mapId: id }
 * - hd-<name> hoặc hd_<name> -> { id: "hd:" + name (map- thành map:), kind: "hd" }
 * @param {string} dirName
 * @returns {{ id: string, kind: "core" | "map" | "icons" | "audio" | "hd", mapId?: string } | null}
 */
export function parsePackDir(dirName) {
  if (!dirName || dirName.startsWith(".")) return null;

  if (dirName === "core") {
    return { id: "core", kind: "core" };
  }
  if (dirName === "icons") {
    return { id: "icons", kind: "icons" };
  }
  if (dirName === "audio") {
    return { id: "audio", kind: "audio" };
  }

  const mapMatch = dirName.match(/^map[-_:](.+)$/);
  if (mapMatch) {
    const mapId = mapMatch[1];
    return { id: `map:${mapId}`, kind: "map", mapId };
  }

  const hdMatch = dirName.match(/^hd[-_:](.+)$/);
  if (hdMatch) {
    let target = hdMatch[1];
    if (target.startsWith("map-") || target.startsWith("map_")) {
      target = target.replace(/^map[-_]/, "map:");
    }
    return { id: `hd:${target}`, kind: "hd" };
  }

  return null;
}

/**
 * Quét thư mục packs để xây dựng đối tượng manifest
 * @param {string} [packsDir] Thư mục gốc chứa các gói
 * @returns {{ packs: Array<{ id: string, kind: string, mapId?: string, files: Array<{ path: string, bytes: number, sha256: string }>, bytes: number }> }}
 */
export function buildPacksManifest(packsDir = DEFAULT_PACKS_DIR) {
  if (!fs.existsSync(packsDir)) {
    return { packs: [] };
  }

  const entries = fs.readdirSync(packsDir, { withFileTypes: true });
  const packs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    // Hỗ trợ cấu trúc lồng map/<mapId> hoặc hd/<name> nếu có
    if (entry.name === "map") {
      const mapSubDir = path.join(packsDir, "map");
      const subEntries = fs.readdirSync(mapSubDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory() || sub.name.startsWith(".")) continue;
        const packInfo = { id: `map:${sub.name}`, kind: "map", mapId: sub.name };
        const packDir = path.join(mapSubDir, sub.name);
        const pack = processPackDirectory(packsDir, packDir, packInfo);
        if (pack) packs.push(pack);
      }
      continue;
    }

    if (entry.name === "hd") {
      const hdSubDir = path.join(packsDir, "hd");
      const subEntries = fs.readdirSync(hdSubDir, { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory() || sub.name.startsWith(".")) continue;
        let target = sub.name;
        if (target.startsWith("map-") || target.startsWith("map_")) {
          target = target.replace(/^map[-_]/, "map:");
        }
        const packInfo = { id: `hd:${target}`, kind: "hd" };
        const packDir = path.join(hdSubDir, sub.name);
        const pack = processPackDirectory(packsDir, packDir, packInfo);
        if (pack) packs.push(pack);
      }
      continue;
    }

    const packInfo = parsePackDir(entry.name);
    if (!packInfo) continue;

    const packDir = path.join(packsDir, entry.name);
    const pack = processPackDirectory(packsDir, packDir, packInfo);
    if (pack) packs.push(pack);
  }

  // Sắp xếp danh sách gói theo id tăng dần để đảm bảo tính tất định
  packs.sort((a, b) => a.id.localeCompare(b.id));

  return { packs };
}

/**
 * Xử lý một thư mục gói cụ thể
 * @param {string} packsDir
 * @param {string} packDir
 * @param {{ id: string, kind: string, mapId?: string }} packInfo
 */
function processPackDirectory(packsDir, packDir, packInfo) {
  const filePaths = collectFilesRecursively(packDir);
  const files = [];

  for (const absPath of filePaths) {
    const relToPacks = toPosixPath(path.relative(packsDir, absPath));
    const stat = fs.statSync(absPath);
    const sha256 = computeFileSha256(absPath);
    files.push({
      path: relToPacks,
      bytes: stat.size,
      sha256,
    });
  }

  // Sắp xếp file theo path tăng dần
  files.sort((a, b) => a.path.localeCompare(b.path));

  const totalBytes = files.reduce((acc, f) => acc + f.bytes, 0);

  return {
    id: packInfo.id,
    kind: packInfo.kind,
    ...(packInfo.mapId ? { mapId: packInfo.mapId } : {}),
    files,
    bytes: totalBytes,
  };
}

/**
 * Ghi đối tượng manifest vào tệp JSON
 * @param {string} [packsDir]
 * @param {string} [manifestPath]
 * @returns {{ written: boolean, path: string, packCount: number, fileCount: number }}
 */
export function writePacksManifest(
  packsDir = DEFAULT_PACKS_DIR,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  const manifest = buildPacksManifest(packsDir);
  const json = JSON.stringify(manifest, null, 2) + "\n";

  const targetDir = path.dirname(manifestPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(manifestPath, json, "utf8");

  const fileCount = manifest.packs.reduce((acc, p) => acc + p.files.length, 0);
  return {
    written: true,
    path: manifestPath,
    packCount: manifest.packs.length,
    fileCount,
  };
}

/**
 * Kiểm tra xem tệp manifest hiện tại có khớp với nội dung thực tế trên đĩa hay không
 * @param {string} [packsDir]
 * @param {string} [manifestPath]
 * @returns {{ ok: boolean, error?: string, manifest?: any }}
 */
export function verifyPacksManifest(
  packsDir = DEFAULT_PACKS_DIR,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  if (!fs.existsSync(packsDir)) {
    // Không có thư mục packs: nếu manifest không có hoặc manifest rỗng thì ok
    if (!fs.existsSync(manifestPath)) {
      return { ok: true, manifest: { packs: [] } };
    }
    const current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (Array.isArray(current.packs) && current.packs.length === 0) {
      return { ok: true, manifest: current };
    }
    return {
      ok: false,
      error: `Thư mục packs không tồn tại nhưng manifest chứa ${current.packs?.length} gói.`,
    };
  }

  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      error: `Thiếu tệp manifest tại: ${manifestPath}. Hãy chạy 'npm run build:packs'.`,
    };
  }

  let current;
  try {
    current = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { ok: false, error: `Lỗi đọc JSON manifest: ${err.message}` };
  }

  const expected = buildPacksManifest(packsDir);
  const currentStr = JSON.stringify(current);
  const expectedStr = JSON.stringify(expected);

  if (currentStr !== expectedStr) {
    return {
      ok: false,
      error:
        "Tệp manifest.json không đồng bộ với nội dung thực tế trong thư mục packs! Hãy chạy 'npm run build:packs'.",
    };
  }

  return { ok: true, manifest: expected };
}

// Chạy trực tiếp qua CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isCheckMode = process.argv.includes("--check");

  if (isCheckMode) {
    console.log("=== KIỂM TRA ĐỒNG BỘ MANIFEST CÁC GÓI TẢI (PACKS) ===");
    const res = verifyPacksManifest();
    if (!res.ok) {
      console.error(`❌ ${res.error}`);
      process.exit(1);
    }
    console.log(
      `✓ Manifest hợp lệ và đồng bộ (${res.manifest.packs.length} gói, ${res.manifest.packs.reduce((a, p) => a + p.files.length, 0)} tệp).`,
    );
  } else {
    console.log("=== XÂY DỰNG MANIFEST CÁC GÓI TẢI (BUILD PACKS) ===");
    const res = writePacksManifest();
    console.log(
      `✓ Đã tạo manifest thành công tại: ${res.path} (${res.packCount} gói, ${res.fileCount} tệp).`,
    );
  }
}
