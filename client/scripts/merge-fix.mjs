/* global process */
/**
 * Công cụ xử lý xung đột nhanh cho tài sản và tài liệu sinh tự động (#1368).
 * Khi merge nhánh bị xung đột ở atlas.json / atlas.png / CREDITS.md / RA_SOAT_TAI_SAN.md:
 * Chạy lệnh: npm run assets:merge-fix
 * Lệnh này sẽ:
 * 1. Khôi phục các tệp sinh về trạng thái sạch (checkout bản của mình hoặc theirs nếu cần)
 * 2. Chạy lại `npm run assets -w client` để sinh lại toàn bộ atlas, icon và đồng bộ tài liệu
 * 3. Tự động `git add` các tệp đã sinh lại
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

process.stdout.write("[assets:merge-fix] Bắt đầu gỡ xung đột tài sản sinh tự động...\n");

try {
  // Nếu có conflict ở tệp nhị phân atlas, nhận bản của nhánh hiện tại (ours) làm mốc sinh lại
  execSync(
    "git checkout --ours client/public/assets/atlas.json client/public/assets/atlas.png 2>/dev/null || true",
    { cwd: ROOT_DIR },
  );
} catch {
  // bỏ qua
}

try {
  // Chạy lại sinh asset và đồng bộ tài liệu
  process.stdout.write("[assets:merge-fix] Đang chạy sinh lại tài sản và đồng bộ tài liệu...\n");
  execSync("node client/scripts/gen-assets.mjs", { cwd: ROOT_DIR, stdio: "inherit" });

  // Tự động add các file sinh
  execSync("git add client/public/assets/ CREDITS.md docs/RA_SOAT_TAI_SAN.md", {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  process.stdout.write(
    "✓ Đã gỡ xung đột và đồng bộ tài sản thành công! Các tệp đã được `git add` sẵn sàng commit.\n",
  );
} catch (err) {
  process.stderr.write(`[assets:merge-fix] Lỗi: ${err.message}\n`);
  process.exit(1);
}
