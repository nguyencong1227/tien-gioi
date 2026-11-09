// Script hậu xử lý sau `vite build`:
// - Quét toàn bộ file tĩnh trong `client/dist/` (assets, icons, index.html, manifest.webmanifest)
//   để tự động điền `PRECACHE_URLS` (không cần liệt kê thủ công từng icon/trang bị).
// - Tính mã băm SHA-256 theo nội dung toàn bộ bản build để gắn vào `CACHE_NAME`,
//   giúp Service Worker tự xóa cache cũ ngay khi kích hoạt bản mới.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const SW_PATH = path.join(DIST_DIR, "sw.js");

if (!fs.existsSync(SW_PATH)) {
  throw new Error(`Không tìm thấy ${SW_PATH} — hãy chạy vite build trước.`);
}

/** Đệ quy lấy danh sách đường dẫn tương đối (POSIX, bắt đầu bằng `/`) trong thư mục dist. */
function collectDistFiles(dir, baseDir = dir) {
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

const files = collectDistFiles(DIST_DIR);
const hash = crypto.createHash("sha256");
for (const rel of files) {
  hash.update(rel);
  hash.update(fs.readFileSync(path.join(DIST_DIR, rel.slice(1))));
}
const buildVersion = hash.digest("hex").slice(0, 8);
const precacheUrls = ["/", ...files];

let swSource = fs.readFileSync(SW_PATH, "utf8");
swSource = swSource.replace(
  /const CACHE_NAME = "[^"]+";/,
  `const CACHE_NAME = "tien-gioi-static-${buildVersion}";`,
);
swSource = swSource.replace(
  /const PRECACHE_URLS = \[[\s\S]*?\];/,
  `const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};`,
);

fs.writeFileSync(SW_PATH, swSource, "utf8");
