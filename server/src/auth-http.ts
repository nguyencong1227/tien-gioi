// API HTTP của tài khoản (M3 bước 3c-3, docs/THIET_KE_TAI_KHOAN.md mục 4): lớp mỏng nối Express với `AuthService`.
// Mọi logic (kiểm đầu vào, băm, giới hạn tần suất, phiên) nằm ở `auth-service.ts`; ở đây chỉ lo giao thức: kiểu nội dung,
// cỡ thân yêu cầu, tiêu đề `Authorization`, IP của khách, mã HTTP và tiêu đề phản hồi.
//
// Cùng nguồn, KHÔNG CORS: client gọi bằng đường dẫn tương đối (production cùng server; dev qua proxy của Vite), nên
// server không bật CORS cho API có mật khẩu. Token đi bằng tiêu đề `Authorization`, không dùng cookie nên không có CSRF.
import { isIP } from "node:net";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { AUTH_API, PROTOCOL_VERSION } from "@tien-gioi/shared";
import { minProtocolOf } from "./protocol";
import { AuthService, type AuthResult, type Kdf } from "./auth-service";
import { CharacterService } from "./character-service";
import { defaultPlayerStore, type PlayerStore } from "./player-store";
import { defaultSoulStore, type SoulStore } from "./soul";
import {
  defaultAccountStore,
  defaultSessionStore,
  type AccountStore,
  type SessionStore,
} from "./account-store";

export type AuthMode = "legacy" | "account";

/** `AUTH_MODE=account` bật tài khoản; mọi giá trị khác (kể cả không đặt) là `legacy`. */
export function authModeOf(env: NodeJS.ProcessEnv): AuthMode {
  return env.AUTH_MODE === "account" ? "account" : "legacy";
}

/**
 * `TRUST_PROXY`: số tầng proxy tin cậy (vd `1` khi chạy sau Caddy / Nginx) hoặc danh sách tên / mạng con của Express
 * (`loopback`, `uniquelocal`, `10.0.0.0/8`...). KHÔNG nhận `true` / `*` (tin mọi `X-Forwarded-For` là để kẻ xấu tự đặt IP
 * và qua mặt giới hạn tần suất). Không đặt hoặc giá trị không hợp lệ thì `false` (dùng IP của kết nối).
 */
export function parseTrustProxy(raw: string | undefined): number | string | false {
  const v = (raw ?? "").trim();
  if (v === "") return false;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n >= 1 && n <= 10 ? n : false;
  }
  // Danh sách: mỗi mục là tên có sẵn của Express hoặc IP / mạng con hợp lệ. Mục sai thì bỏ CẢ danh sách: Express ném lỗi
  // lúc `app.set("trust proxy", ...)` với IP sai (sập server lúc khởi động), còn `true` / `*` là tin mọi tiêu đề.
  for (const part of v.split(",")) {
    const item = part.trim();
    if (["loopback", "linklocal", "uniquelocal"].includes(item)) continue;
    const [ip, prefix, ...rest] = item.split("/");
    const kind = isIP(ip);
    if (kind === 0 || rest.length > 0) return false;
    if (
      prefix !== undefined &&
      !(/^\d{1,3}$/.test(prefix) && Number(prefix) <= (kind === 4 ? 32 : 128))
    )
      return false;
  }
  return v;
}

/**
 * Khoá giới hạn tần suất theo IP của khách: IPv4 giữ nguyên; IPv6 gộp theo /64 (kẻ tấn công thường có cả khối /64 nên
 * đổi địa chỉ trong khối không được tính là "IP khác"). `::ffff:1.2.3.4` quy về IPv4.
 */
export function clientKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1];
  if (!ip.includes(":")) return ip;
  // Mở `::` thành đủ 8 nhóm rồi lấy 4 nhóm đầu
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head === "" ? [] : head.split(":");
  const t = tail === "" ? [] : tail.split(":");
  const groups = ip.includes("::")
    ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
    : h;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;
const tokenOf = (req: Request): string | undefined =>
  BEARER.exec(req.headers.authorization ?? "")?.[1];

function send<T>(res: Response, r: AuthResult<T>) {
  if (r.ok) {
    res.status(200).json(r.value);
    return;
  }
  if (r.retryAfterS !== undefined) res.set("Retry-After", String(r.retryAfterS));
  res.status(r.status).json({
    error: r.error,
    ...(r.retryAfterS !== undefined ? { retryAfterS: r.retryAfterS } : {}),
  });
}

/** Thành công không có thân: 204; lỗi như `send`. */
function sendEmpty(res: Response, r: AuthResult<unknown>) {
  if (r.ok) {
    res.status(204).end();
    return;
  }
  send(res, r);
}

/** Bọc handler bất đồng bộ của Express 4 (không tự bắt lỗi từ Promise). */
const h =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

export function createAuthRouter(auth: AuthService, characters?: CharacterService): Router {
  const r = express.Router();
  r.use(noStore);
  // Chỉ nhận `application/json`, thân tối đa 2 KB, chỉ object / mảng (strict). Kiểu khác thì `req.body` rỗng và
  // `AuthService` trả `invalid`.
  r.use(express.json({ limit: "2kb", type: "application/json" }));

  r.post(
    AUTH_API.register,
    h(async (req, res) => send(res, await auth.register(clientKey(req.ip), req.body))),
  );
  r.post(
    AUTH_API.login,
    h(async (req, res) => send(res, await auth.login(clientKey(req.ip), req.body))),
  );
  r.post(
    AUTH_API.recover,
    h(async (req, res) => send(res, await auth.recover(clientKey(req.ip), req.body))),
  );
  r.get(
    AUTH_API.me,
    h(async (req, res) => send(res, await auth.me(tokenOf(req)))),
  );
  // Đăng xuất luôn 204 (token sai / đã hết hạn cũng vậy: không lộ gì)
  r.post(
    AUTH_API.logout,
    h(async (req, res) => {
      await auth.logout(tokenOf(req));
      res.status(204).end();
    }),
  );

  if (characters) {
    // Chọn đạo hiệu (tài khoản chưa có nhân vật) và nhận lại nhân vật cũ: 204 khi thành công
    r.post(
      AUTH_API.character,
      h(async (req, res) => sendEmpty(res, await characters.create(tokenOf(req), req.body))),
    );
    r.post(
      AUTH_API.claim,
      h(async (req, res) =>
        sendEmpty(res, await characters.claim(clientKey(req.ip), tokenOf(req), req.body)),
      ),
    );
  }

  // Đường dẫn khác dưới /api: 404 dạng JSON (không rơi vào trang tĩnh của client)
  r.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Lỗi: thân sai / quá lớn là lỗi của khách (4xx, KHÔNG ghi log vì thông báo lỗi JSON có thể chứa mảnh mật khẩu);
  // lỗi khác (kho lưu hỏng...) là 500, chỉ ghi tên lỗi.
  r.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "invalid" });
    } else if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
      res.status(400).json({ error: "invalid" });
    } else {
      console.error(
        `[auth] lỗi nội bộ: ${err?.name ?? "Error"}${err?.code ? ` (${err.code})` : ""}`,
      );
      res.status(500).json({ error: "server_error" });
    }
  });
  return r;
}

export interface MountOptions {
  env: NodeJS.ProcessEnv;
  /** Mặc định: kho file dùng chung của tiến trình */
  accounts?: AccountStore;
  sessions?: SessionStore;
  players?: PlayerStore;
  souls?: SoulStore;
  kdf?: Kdf;
  now?: () => number;
}

/**
 * Gắn `/health` (kèm `authMode` để client biết hiện ô tên cũ hay màn hình tài khoản) và, khi `AUTH_MODE=account`, các
 * đường `/api/auth/*`. Chế độ `legacy` (mặc định) KHÔNG mở API tài khoản nào (không thêm bề mặt tấn công cho dev / test /
 * bot). Phải gọi trước khi gắn trang tĩnh (`app.get("*")`). Trả `auth` để người gọi lên lịch `auth.sweep()`.
 */
export function mountAuth(
  app: Express,
  o: MountOptions,
): { mode: AuthMode; auth: AuthService | null } {
  const mode = authModeOf(o.env);
  app.set("trust proxy", parseTrustProxy(o.env.TRUST_PROXY));
  // `protocol` / `minProtocol` (M4 2.5): client biết phiên bản của server; công cụ giám sát thấy mức tối thiểu đang áp dụng
  const minProtocol = minProtocolOf(o.env).value;
  app.get("/health", (_req, res) => {
    res.json({ ok: true, authMode: mode, protocol: PROTOCOL_VERSION, minProtocol });
  });
  if (mode !== "account") return { mode, auth: null };
  const accounts = o.accounts ?? defaultAccountStore();
  const auth = new AuthService({
    accounts,
    sessions: o.sessions ?? defaultSessionStore(),
    kdf: o.kdf,
    now: o.now,
  });
  const characters = new CharacterService({
    auth,
    accounts,
    players: o.players ?? defaultPlayerStore(),
    souls: o.souls ?? defaultSoulStore(),
    now: o.now,
  });
  app.use(createAuthRouter(auth, characters));
  return { mode, auth };
}
