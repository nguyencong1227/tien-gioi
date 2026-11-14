import path from "node:path";

/** Mã băm bất biến của tệp gói tải là 12 ký tự hex (khớp client và build-packs) */
export const PACK_VERSION_RE = /^[0-9a-f]{12}$/i;

/**
 * Trích xuất tham số query `v` từ request của Express / Node HTTP
 * @param req Đối tượng Request từ Express hoặc Node IncomingMessage
 * @returns Chuỗi tham số `v` hoặc null nếu không có
 */
export function extractQueryV(req: any): string | null {
  if (!req) return null;
  // 1. Express req.query:
  if (req.query && typeof req.query.v === "string") {
    return req.query.v;
  }
  // 2. Dự phòng phân tích trực tiếp từ req.url (kể cả khi req là IncomingMessage thuần):
  if (typeof req.url === "string") {
    const qIndex = req.url.indexOf("?");
    if (qIndex !== -1) {
      const search = req.url.slice(qIndex);
      const params = new URLSearchParams(search);
      return params.get("v");
    }
  }
  return null;
}

/**
 * Tính toán giá trị Cache-Control header cho tệp tĩnh phục vụ từ client/dist (M7.15, Issue #516):
 * - /packs/manifest.json -> "no-cache" (luôn kiểm tra tính cập nhật từ mạng)
 * - /packs/** có ?v=<12 ký tự hex> -> "public, max-age=31536000, immutable" (tài nguyên gắn băm bất biến)
 * - /packs/** KHÔNG có ?v= hoặc ?v= không hợp lệ -> "no-cache" (không bị trình duyệt giữ 1 năm khi không có băm)
 * - Các tệp tĩnh khác ngoài /packs/ -> null (để express.static dùng cấu hình mặc định)
 *
 * @param relPath Đường dẫn tương đối từ dist (chuẩn hoá dấu '/')
 * @param v Giá trị tham số query `v` nếu có
 * @returns Header Cache-Control hoặc null
 */
export function staticCacheHeader(relPath: string, v?: string | null): string | null {
  const normalized = relPath.split(path.sep).join("/").replace(/^\/+/, "");

  if (normalized === "packs/manifest.json") {
    return "no-cache";
  }

  if (normalized.startsWith("packs/")) {
    if (v && PACK_VERSION_RE.test(v)) {
      return "public, max-age=31536000, immutable";
    }
    return "no-cache";
  }

  return null;
}

/**
 * Áp dụng headers cho express.static setHeaders
 * @param res Đối tượng Response của Express
 * @param filePath Đường dẫn tuyệt đối của tệp tĩnh trên đĩa
 * @param distDir Đường dẫn thư mục dist
 */
export function applyStaticHeaders(res: any, filePath: string, distDir: string): void {
  const rel = path.relative(distDir, filePath);
  const v = extractQueryV(res?.req);
  const cacheControl = staticCacheHeader(rel, v);
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }
}
