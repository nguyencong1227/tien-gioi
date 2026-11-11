// CORS theo DANH SÁCH CHO PHÉP cho `/health` và `/api/*` (M4.2a-1, docs/THIET_KE_APP_ANDROID.md mục 5.2).
//
// Vì sao cần: ở web client và server cùng nguồn nên không có CORS. Trong app đóng gói (Capacitor) trang chạy ở nguồn riêng
// (`https://localhost`, `http://localhost`, `capacitor://localhost`) và gọi HTTP sang địa chỉ server khác, trình duyệt chặn
// phản hồi nếu thiếu tiêu đề CORS.
//
// Nguyên tắc: MẶC ĐỊNH TẮT (không đặt `CORS_ORIGINS` thì không gắn gì, hành vi y như trước). Khi bật: chỉ nguồn nằm đúng trong
// danh sách được nhận tiêu đề; KHÔNG bao giờ `*` và KHÔNG `Allow-Credentials` (API dùng `Authorization: Bearer`, không cookie).
// Đây KHÔNG phải rào chắn CSRF: yêu cầu từ nguồn lạ vẫn được xử lý như cũ (chỉ trình duyệt của nguồn lạ không đọc được phản hồi);
// bảo vệ thật vẫn là kiểu nội dung `application/json` + token trong tiêu đề. Đường `/matchmake/*` do Colyseus tự xử lý CORS
// (mặc định phản chiếu mọi nguồn) và không đổi ở đây, vì Vite dev (cổng 5173) cần nó.
import type { Express, RequestHandler } from "express";

/** Số nguồn tối đa nhận từ môi trường (chặn danh sách khổng lồ do gõ nhầm). */
const MAX_ORIGINS = 20;

/**
 * Một nguồn hợp lệ: `lược đồ://máy[:cổng]`, KHÔNG đường dẫn, KHÔNG dấu `/` cuối, KHÔNG ký tự đại diện. Lược đồ là chữ thường
 * (https, http, capacitor, ionic...), máy là tên miền / IPv4 / `localhost` / IPv6 trong ngoặc vuông.
 */
const ORIGIN_RE = /^[a-z][a-z0-9+.-]*:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/;

export interface CorsConfig {
  /** Nguồn được phép, đã chuẩn hoá chữ thường, không trùng; rỗng = tắt */
  origins: string[];
  /** Cảnh báo khi cấu hình sai (in lúc khởi động qua `startup.ts`) */
  warnings: string[];
}

/**
 * Đọc `CORS_ORIGINS` (danh sách ngăn cách bằng dấu phẩy). Mục sai bị BỎ kèm cảnh báo (không đoán ý): `*`, có đường dẫn / dấu `/`
 * cuối, thiếu lược đồ, `null`. Bỏ qua mục sai luôn an toàn hơn đoán vì kết quả chỉ là ít nguồn được phép hơn.
 */
export function corsOriginsOf(env: NodeJS.ProcessEnv): CorsConfig {
  const raw = env.CORS_ORIGINS;
  const warnings: string[] = [];
  const origins: string[] = [];
  if (raw === undefined || raw.trim() === "") return { origins, warnings };
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (item === "") continue;
    const o = item.toLowerCase();
    if (!ORIGIN_RE.test(o)) {
      warnings.push(
        `CORS_ORIGINS: bỏ qua '${item}' (cần dạng lược đồ://máy[:cổng], vd https://localhost; không nhận '*', đường dẫn hay dấu '/' cuối).`,
      );
      continue;
    }
    if (origins.includes(o)) continue;
    if (origins.length >= MAX_ORIGINS) {
      warnings.push(
        `CORS_ORIGINS: chỉ nhận tối đa ${MAX_ORIGINS} nguồn, bỏ qua '${item}' và các mục sau.`,
      );
      break;
    }
    origins.push(o);
  }
  return { origins, warnings };
}

/**
 * Middleware CORS cho danh sách `origins` (đã chuẩn hoá). Luôn thêm `Vary: Origin` (phản hồi phụ thuộc nguồn). Yêu cầu không
 * có `Origin` (cùng nguồn qua GET, curl, giám sát) đi qua nguyên vẹn.
 * - Nguồn được phép: `Access-Control-Allow-Origin: <đúng nguồn đó>`; preflight (`OPTIONS`) trả 204 kèm phương thức / tiêu đề cố định.
 * - Nguồn lạ: không thêm tiêu đề CORS nào (yêu cầu thường vẫn chạy như cũ); preflight bị từ chối 403 để lỗi hiện rõ.
 */
export function corsMiddleware(origins: readonly string[]): RequestHandler {
  const allowed = new Set(origins);
  return (req, res, next) => {
    res.vary("Origin");
    const origin = req.headers.origin;
    if (typeof origin !== "string") return next();
    const ok = allowed.has(origin.toLowerCase());
    const preflight =
      req.method === "OPTIONS" && req.headers["access-control-request-method"] !== undefined;
    if (!ok) {
      if (preflight) {
        res.status(403).json({ error: "cors_origin_not_allowed" });
        return;
      }
      return next();
    }
    res.set("Access-Control-Allow-Origin", origin);
    if (preflight) {
      res.set({
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "600",
      });
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Các đường chịu CORS (và chỉ những đường này): kiểm tình trạng và API tài khoản. `/metrics` là cho máy giám sát, không cho trình duyệt. */
export const CORS_PATHS = ["/health", "/api"] as const;

/**
 * Gắn CORS cho `/health` và `/api/*` khi `CORS_ORIGINS` có ít nhất một nguồn hợp lệ; không thì KHÔNG gắn gì. Phải gọi TRƯỚC
 * `mountAuth` (và trước trang tĩnh).
 */
export function mountCors(app: Express, env: NodeJS.ProcessEnv): CorsConfig & { enabled: boolean } {
  const cfg = corsOriginsOf(env);
  if (cfg.origins.length === 0) return { ...cfg, enabled: false };
  app.use([...CORS_PATHS], corsMiddleware(cfg.origins));
  return { ...cfg, enabled: true };
}
