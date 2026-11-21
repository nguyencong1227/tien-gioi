// Chống DÙNG KÉ máy chủ (QUYET_DINH_M3 mục 59 điểm 1): trang web KHÁC (bản sao client đặt ở tên miền lạ) không được gọi HTTP / WebSocket của Tiên Giới.
//
// Cơ chế: trình duyệt LUÔN gắn `Origin` vào WebSocket, `fetch` / XHR khác nguồn và mọi POST; trang lạ không giả được tiêu đề đó (JavaScript không đặt được `Origin`).
// Vì vậy kiểm `Origin`: có mà không nằm trong danh sách cho phép => từ chối (403). KHÔNG có `Origin` (curl, bot, công cụ giám sát, kiểm tra sức khoẻ của Docker,
// tải trang bằng GET) => cho qua: máy không phải trình duyệt tự đặt được tiêu đề nào cũng được, nên chặn nó chỉ gây hại cho người vận hành mà không thêm an toàn.
// Đây là lớp chống DÙNG KÉ qua trình duyệt, KHÔNG phải xác thực (xác thực vẫn là token phiên / mã bí mật).
//
// Danh sách cho phép (theo thứ tự):
//  1. `ALLOWED_ORIGINS` (ngăn cách bằng dấu phẩy, cùng dạng với `CORS_ORIGINS`); không đặt thì mặc định `DEFAULT_PUBLIC_ORIGIN` (bản chạy thật).
//  2. `CORS_ORIGINS` (app đóng gói gọi sang server này, vd `https://localhost`): đã được phép đọc `/api/*` thì cũng được vào phòng.
//  3. Cùng nguồn: máy của `Origin` trùng tiêu đề `Host` của chính yêu cầu (web chạy sau đường hầm / proxy đổi tên miền vẫn hoạt động mà không cần cấu hình).
//  4. Không phải production (`NODE_ENV` khác `production` VÀ không `TIEN_GIOI_PROD=1`): mọi `http(s)://localhost`, `127.0.0.1`, `[::1]` mọi cổng (Vite dev, test, bot).
// `ORIGIN_CHECK=off` tắt hẳn (chỉ để khẩn cấp; in cảnh báo khi khởi động).
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { RequestHandler } from "express";
import { corsOriginsOf } from "./cors";

/** Nguồn công khai của bản chạy thật (mục 59 điểm 1). */
export const DEFAULT_PUBLIC_ORIGIN = "https://tiengioi.hethongtm.site";

const MAX_ORIGINS = 20;
const ORIGIN_RE = /^[a-z][a-z0-9+.-]*:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/;
/** Máy cục bộ (chỉ ngoài production) */
const LOCAL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

export interface OriginPolicy {
  /** `false` = tắt (ORIGIN_CHECK=off): mọi nguồn qua */
  enabled: boolean;
  /** Nguồn cho phép rõ ràng (đã chuẩn hoá chữ thường, không trùng) */
  allowed: ReadonlySet<string>;
  /** Cho mọi máy cục bộ (dev / test) */
  allowLocal: boolean;
  /** Cảnh báo cấu hình in lúc khởi động */
  warnings: string[];
}

export function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || env.TIEN_GIOI_PROD === "1";
}

/** Đọc chính sách từ môi trường (thuần hàm). Mục `ALLOWED_ORIGINS` sai bị BỎ kèm cảnh báo (ít nguồn hơn luôn an toàn hơn đoán ý). */
export function originPolicyOf(env: NodeJS.ProcessEnv): OriginPolicy {
  const warnings: string[] = [];
  if (env.ORIGIN_CHECK === "off") {
    warnings.push(
      "ORIGIN_CHECK=off: KHÔNG kiểm nguồn (Origin) của HTTP / WebSocket, trang lạ dùng ké được máy chủ này.",
    );
    return { enabled: false, allowed: new Set(), allowLocal: true, warnings };
  }
  const allowed = new Set<string>();
  const raw = env.ALLOWED_ORIGINS;
  if (raw === undefined || raw.trim() === "") allowed.add(DEFAULT_PUBLIC_ORIGIN);
  else {
    for (const part of raw.split(",")) {
      const item = part.trim().toLowerCase();
      if (item === "") continue;
      if (!ORIGIN_RE.test(item)) {
        warnings.push(
          `ALLOWED_ORIGINS: bỏ qua '${part.trim()}' (cần dạng lược đồ://máy[:cổng]; không nhận '*', đường dẫn hay dấu '/' cuối).`,
        );
        continue;
      }
      if (allowed.size >= MAX_ORIGINS) {
        warnings.push(
          `ALLOWED_ORIGINS: chỉ nhận tối đa ${MAX_ORIGINS} nguồn, bỏ qua '${part.trim()}'.`,
        );
        break;
      }
      allowed.add(item);
    }
    if (allowed.size === 0)
      warnings.push(
        "ALLOWED_ORIGINS không có mục hợp lệ nào: chỉ nhận cùng nguồn, CORS_ORIGINS (và máy cục bộ khi không phải production).",
      );
  }
  for (const o of corsOriginsOf(env).origins) allowed.add(o);
  return { enabled: true, allowed, allowLocal: !isProduction(env), warnings };
}

/**
 * Nguồn này có được vào không. `origin` không có (hoặc rỗng) => cho qua (máy không phải trình duyệt). `host` là tiêu đề `Host` của yêu cầu (so cùng nguồn).
 * `Origin: null` (iframe cách ly, tệp `file://`) KHÔNG được nhận.
 */
export function isOriginAllowed(
  policy: OriginPolicy,
  origin: string | string[] | undefined,
  host: string | string[] | undefined,
): boolean {
  if (!policy.enabled) return true;
  if (origin === undefined) return true;
  const o = (Array.isArray(origin) ? origin[0] : origin)?.trim().toLowerCase();
  if (o === undefined || o === "") return true;
  if (policy.allowed.has(o)) return true;
  if (policy.allowLocal && LOCAL_RE.test(o)) return true;
  const h = (Array.isArray(host) ? host[0] : host)?.trim().toLowerCase();
  if (h) {
    // cùng nguồn: máy (kèm cổng) của Origin trùng Host. Chỉ so phần sau `://`, không cho lược đồ lạ như `capacitor://`.
    const m = /^https?:\/\/([^/]+)$/.exec(o);
    if (m && m[1] === h) return true;
  }
  return false;
}

/** Kiểm trực tiếp từ bộ tiêu đề HTTP của một yêu cầu. */
export function headersAllowed(
  policy: OriginPolicy,
  headers: IncomingHttpHeaders | undefined,
): boolean {
  return isOriginAllowed(policy, headers?.origin, headers?.host);
}

/** Middleware Express: yêu cầu HTTP có `Origin` lạ bị từ chối 403 (preflight cũng vậy). Gắn TRƯỚC mọi route. */
export function originGuardMiddleware(policy: OriginPolicy): RequestHandler {
  return (req, res, next) => {
    if (headersAllowed(policy, req.headers)) return next();
    res.status(403).json({ error: "origin_not_allowed" });
  };
}

/**
 * `verifyClient` của `ws` cho `WebSocketTransport`: bắt tay WebSocket có `Origin` lạ bị từ chối 403 TRƯỚC khi nâng cấp kết nối.
 * (`info.origin` là tiêu đề Origin; `info.req` giữ `Host`.)
 */
export function wsVerifyClient(policy: OriginPolicy) {
  return (
    info: { origin: string; req: { headers: IncomingHttpHeaders } },
    done: (ok: boolean, code?: number, message?: string) => void,
  ) => {
    if (isOriginAllowed(policy, info.origin || undefined, info.req?.headers?.host))
      return done(true);
    done(false, 403, "origin_not_allowed");
  };
}

/** Thay `matchMaker.controller.getCorsHeaders` của Colyseus: nguồn được phép thì phản chiếu đúng nguồn đó; lạ thì KHÔNG trả tiêu đề CORS (trình duyệt tự chặn). */
export function matchmakeCorsHeaders(policy: OriginPolicy) {
  return (req: { headers?: IncomingHttpHeaders }): Record<string, string> => {
    const origin = req.headers?.origin;
    if (typeof origin !== "string" || origin === "") return {};
    return headersAllowed(policy, req.headers) ? { "Access-Control-Allow-Origin": origin } : {};
  };
}

/**
 * Chống NHÚNG: trang khác không được đặt Tiên Giới trong `<iframe>` (clickjacking / dùng ké giao diện). `frame-ancestors 'self'` (CSP) và `X-Frame-Options: SAMEORIGIN`
 * (trình duyệt cũ). Chỉ giới hạn việc nhúng, KHÔNG đặt chính sách tải tài nguyên nào khác. Gắn TRƯỚC mọi route.
 */
export const FRAME_ANCESTORS_CSP = "frame-ancestors 'self'";
export const frameGuardMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("Content-Security-Policy", FRAME_ANCESTORS_CSP);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
};

/** Bộ điều khiển matchmaking của Colyseus (chỉ phần ta đụng vào, để test được không cần nạp Colyseus). */
export interface MatchmakeController {
  DEFAULT_CORS_HEADERS: Record<string, string>;
  getCorsHeaders: (req: IncomingMessage) => Record<string, string>;
}

/**
 * Colyseus mặc định trả `Access-Control-Allow-Origin: *` + `Allow-Credentials: true` cho `/matchmake/*` (mọi trang lạ gọi được xin chỗ). Bỏ hai tiêu đề mặc định đó
 * và chỉ phản chiếu nguồn được phép. Yêu cầu từ máy không phải trình duyệt vẫn được xử lý; phần chặn thật cho chúng là `WorldRoom.onAuth` (kiểm `Origin` có mặt).
 */
export function lockMatchmakeCors(controller: MatchmakeController, policy: OriginPolicy) {
  if (!policy.enabled) return;
  delete controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"];
  delete controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Credentials"];
  controller.getCorsHeaders = matchmakeCorsHeaders(policy);
}

/** Phần của `Server` Colyseus mà ta bọc (để test được không cần nạp Colyseus). */
export interface MatchmakeHandler {
  handleMatchMakeRequest: (req: IncomingMessage, res: ServerResponse) => unknown;
}

/**
 * Colyseus xử lý `/matchmake/*` RIÊNG, TRƯỚC Express (middleware Express không thấy), và chấp nhận cả POST "đơn giản" từ trang lạ (không preflight) nên một trang lạ vẫn xin được chỗ
 * dù không đọc được phản hồi. Bọc `handleMatchMakeRequest`: yêu cầu có `Origin` lạ (kể cả preflight) bị 403, KHÔNG kèm tiêu đề CORS. Yêu cầu hợp lệ đi tiếp nguyên vẹn.
 */
export function guardMatchmake(server: MatchmakeHandler, policy: OriginPolicy) {
  if (!policy.enabled) return;
  const original = server.handleMatchMakeRequest.bind(server);
  server.handleMatchMakeRequest = (req, res) => {
    if (headersAllowed(policy, req.headers)) return original(req, res);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 403, error: "origin_not_allowed" }));
  };
}
