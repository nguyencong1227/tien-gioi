// Tài khoản thật (M3 bước 3, docs/THIET_KE_TAI_KHOAN.md mục 4, 5, 9): hợp đồng giữa client và server.
// Luật đặt tên đăng nhập / mật khẩu / đạo hiệu dùng chung để client kiểm cùng luật với server (server KHÔNG tin client:
// vẫn kiểm lại bằng chính các hàm này). Mật khẩu chỉ đi qua API HTTP, không bao giờ qua phòng game.

// ---------- Luật đặt tên và mật khẩu ----------

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Tên đăng nhập: chữ thường không dấu, số, gạch dưới. */
export const USERNAME_RE = /^[a-z0-9_]+$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Đạo hiệu (tên nhân vật hiện cho người khác): 2-16 ký tự, khác tên đăng nhập. */
export const DAO_HIEU_MIN = 2;
export const DAO_HIEU_MAX = 16;

/** Mật khẩu hay gặp (>= 8 ký tự) bị từ chối. Danh sách ngắn có chủ ý: chặn lỗi hiển nhiên, không phải bộ lọc đầy đủ. */
export const COMMON_PASSWORDS: readonly string[] = [
  "password",
  "password1",
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "12341234",
  "qwertyui",
  "qwerty123",
  "abc12345",
  "iloveyou",
  "admin123",
  "letmein1",
  "tiengioi",
  "tiengioi1",
  "tiengioi123",
];

/** Đạo hiệu hợp lệ (NFC, gộp khoảng trắng), hoặc `null`. Là bản chuẩn của luật mà `server/src/store.ts` đang giữ một bản trùng. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const n = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (n.length < DAO_HIEU_MIN || n.length > DAO_HIEU_MAX) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(n)) return null;
  return n;
}

export type UsernameCheck =
  { ok: true; value: string } | { ok: false; reason: "type" | "length" | "chars" };

/** Chuẩn hoá (cắt khoảng trắng đầu / cuối, chữ thường) rồi kiểm tên đăng nhập. `value` là dạng dùng làm khoá. */
export function validateUsername(raw: unknown): UsernameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "type" };
  const v = raw.trim().toLowerCase();
  if (v.length < USERNAME_MIN || v.length > USERNAME_MAX) return { ok: false, reason: "length" };
  if (!USERNAME_RE.test(v)) return { ok: false, reason: "chars" };
  return { ok: true, value: v };
}

export type PasswordCheck =
  { ok: true } | { ok: false; reason: "type" | "short" | "long" | "same_as_username" | "common" };

/**
 * Kiểm mật khẩu: độ dài 8-128 (đếm theo ký tự Unicode, không cắt khoảng trắng: người dùng đặt gì giữ nguyên), không trùng
 * tên đăng nhập, không nằm trong `COMMON_PASSWORDS`. Không áp luật ký tự (dài quan trọng hơn phức tạp).
 */
export function validatePassword(raw: unknown, username?: unknown): PasswordCheck {
  if (typeof raw !== "string") return { ok: false, reason: "type" };
  const len = [...raw].length;
  if (len < PASSWORD_MIN) return { ok: false, reason: "short" };
  if (len > PASSWORD_MAX) return { ok: false, reason: "long" };
  const lower = raw.toLowerCase();
  if (typeof username === "string" && username !== "" && lower === username.trim().toLowerCase())
    return { ok: false, reason: "same_as_username" };
  if (COMMON_PASSWORDS.includes(lower)) return { ok: false, reason: "common" };
  return { ok: true };
}

// ---------- API HTTP ----------

export const AUTH_API = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  recover: "/api/auth/recover",
  character: "/api/character",
  claim: "/api/character/claim",
} as const;

export interface RegisterReq {
  username: string;
  password: string;
}
/** `recoveryCode` chỉ hiện MỘT lần (server chỉ giữ băm); client bắt người chơi xác nhận đã lưu. */
export interface RegisterRes {
  token: string;
  recoveryCode: string;
}
export interface LoginReq {
  username: string;
  password: string;
}
export interface LoginRes {
  token: string;
}
export interface MeRes {
  username: string;
  hasCharacter: boolean;
  /** Đạo hiệu, có khi `hasCharacter` */
  name?: string;
}
/** Tạo nhân vật (chọn đạo hiệu) cho tài khoản chưa có. */
export interface CharacterReq {
  name: string;
}
/** Nhận lại nhân vật cũ (đăng nhập kiểu tên + mã bí mật trước bước 3) về tài khoản này. */
export interface ClaimReq {
  name: string;
  secret: string;
}
export interface RecoverReq {
  username: string;
  recoveryCode: string;
  newPassword: string;
}
/** Đặt lại thành công: phiên mới và MÃ KHÔI PHỤC MỚI (mã cũ vô hiệu). */
export interface RecoverRes {
  token: string;
  recoveryCode: string;
}

/** Mã lỗi ổn định của API (thân phản hồi `{ error: <mã> }` kèm mã HTTP 4xx). */
export const AUTH_ERRORS = [
  "invalid", // sai kiểu / thiếu trường / quá dài
  "username_invalid",
  "weak_password",
  "username_taken",
  "name_invalid",
  "name_taken",
  "bad_credentials", // sai tên đăng nhập HOẶC mật khẩu HOẶC mã khôi phục: cùng một câu, không lộ cái nào đúng
  "unauthorized", // thiếu / hết hạn / sai token phiên
  "rate_limited",
  "has_character",
  "need_character",
  "already_online",
  "not_found", // nhân vật cũ để nhận không có / sai mã bí mật (cùng một câu)
] as const;
export type AuthErrorCode = (typeof AUTH_ERRORS)[number];

export interface AuthErrorBody {
  error: AuthErrorCode;
  /** Có khi `rate_limited`: nên chờ bấy nhiêu giây rồi thử lại */
  retryAfterS?: number;
}

/**
 * Đọc thân phản hồi lỗi của API; không phải lỗi hợp lệ (kiểu sai, mã lạ, kể cả `constructor` / `__proto__`) thì `null`.
 * Client không tin thân phản hồi: mã lạ coi như lỗi không rõ.
 */
export function parseAuthError(raw: unknown): AuthErrorBody | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const code = r.error;
  if (typeof code !== "string" || !(AUTH_ERRORS as readonly string[]).includes(code)) return null;
  const body: AuthErrorBody = { error: code as AuthErrorCode };
  if (typeof r.retryAfterS === "number" && Number.isFinite(r.retryAfterS) && r.retryAfterS >= 0)
    body.retryAfterS = Math.min(86_400, Math.ceil(r.retryAfterS));
  return body;
}

// ---------- Lỗi khi vào phòng (chế độ tài khoản) ----------
// Mã trong `ServerError` ở `onAuth`; tên + mã bí mật (chế độ cũ) vẫn dùng 400 / 403 / 409 / `JOIN_WRONG_MAP`.

/** Token phiên thiếu / sai / hết hạn: client về màn hình đăng nhập. */
export const JOIN_BAD_TOKEN = 401;
/** Tài khoản chưa có nhân vật: client hiện bước chọn đạo hiệu (`AUTH_API.character`) rồi vào lại. */
export const JOIN_NEED_CHARACTER = 423;
