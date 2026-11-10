// Mật mã cho tài khoản (M3 bước 3c, docs/THIET_KE_TAI_KHOAN.md mục 4): băm mật khẩu / mã khôi phục bằng `scrypt`
// bất đồng bộ của Node (không thêm thư viện), token phiên, mã khôi phục. Chỉ có hàm thuần và mật mã, không I/O, không
// biết HTTP hay kho lưu; `AuthService` (bước kế) ghép với kho và giới hạn tần suất.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/**
 * Tham số mặc định. `N = 2^15, r = 8` cần ~32 MiB: Node mặc định `maxmem` là 32 MiB nên ném `RangeError: memory limit
 * exceeded` ngay lúc gọi, vì vậy PHẢI truyền `maxmem` (xem `maxmemFor`). ~80 ms một lần trên máy dev.
 */
export const SCRYPT_DEFAULT: ScryptParams = { N: 1 << 15, r: 8, p: 1 };
const KEY_LEN = 64;
const SALT_LEN = 16;
/**
 * Trần tham số khi ĐỌC một chuỗi băm đã lưu: chuỗi đến từ kho (DB / file) nên không tin hoàn toàn; không cho một dòng
 * bị sửa ép server cấp bộ nhớ hay tính toán vô hạn.
 */
const MAX_N = 1 << 17;
const MAX_R = 16;
const MAX_P = 4;

/** `maxmem` đủ cho tham số: scrypt dùng ~128 * N * r byte, nhân đôi cho dư. */
export const maxmemFor = (t: ScryptParams) => 2 * 128 * t.N * t.r + 1024 * 1024;

function derive(secret: string, salt: Buffer, t: ScryptParams, keyLen = KEY_LEN): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret.normalize("NFKC"),
      salt,
      keyLen,
      { N: t.N, r: t.r, p: t.p, maxmem: maxmemFor(t) },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

const isPow2 = (n: number) => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;

/** Băm với muối ngẫu nhiên; kết quả `scrypt$N$r$p$muối$băm` (base64url), tham số nằm trong chuỗi nên đổi được về sau. */
export async function hashSecretScrypt(
  secret: string,
  params: ScryptParams = SCRYPT_DEFAULT,
): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(secret, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

interface Parsed extends ScryptParams {
  salt: Buffer;
  key: Buffer;
}

/** Đọc chuỗi băm đã lưu; sai định dạng hoặc tham số ngoài trần thì `null`. */
export function parseHash(stored: unknown): Parsed | null {
  if (typeof stored !== "string" || stored.length > 512) return null;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!isPow2(N) || N > MAX_N) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_R) return null;
  if (!Number.isInteger(p) || p < 1 || p > MAX_P) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const key = Buffer.from(parts[5], "base64url");
  if (salt.length < 8 || key.length < 16 || key.length > 128) return null;
  return { N, r, p, salt, key };
}

/** So `secret` với chuỗi băm đã lưu, **hằng thời gian** (`timingSafeEqual`). Chuỗi băm hỏng thì `false`, không ném. */
export async function verifyScrypt(secret: string, stored: unknown): Promise<boolean> {
  const h = parseHash(stored);
  if (!h) return false;
  let key: Buffer;
  try {
    key = await derive(secret, h.salt, h, h.key.length);
  } catch {
    return false;
  }
  return key.length === h.key.length && timingSafeEqual(key, h.key);
}

/** Chuỗi đã lưu dùng tham số yếu hơn mặc định: băm lại lúc đăng nhập thành công. */
export function needsRehash(stored: unknown, target: ScryptParams = SCRYPT_DEFAULT): boolean {
  const h = parseHash(stored);
  if (!h) return true;
  return h.N < target.N || h.r < target.r || h.p < target.p;
}

let dummy: Promise<string> | undefined;
/**
 * Băm giả cho tên không tồn tại: đăng nhập vẫn tốn đúng một lần scrypt để thời gian phản hồi không lộ tên nào có thật.
 * Dựng lười, dùng tham số mặc định (nếu cấu hình khác thì chuỗi thật và giả vẫn cùng cỡ).
 */
export function dummyHash(): Promise<string> {
  return (dummy ??= hashSecretScrypt("khong-ai-dung-mat-khau-nay"));
}

// ---------- Token phiên ----------

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Token 32 byte ngẫu nhiên (base64url) cho client; server chỉ giữ `tokenHash`. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Token hợp lệ về hình dạng (đúng 43 ký tự base64url): chặn chuỗi dài / lạ trước khi băm hay tra kho. */
export const isTokenShape = (t: unknown): t is string =>
  typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

// ---------- Mã khôi phục ----------

/** 32 ký tự, bỏ các chữ dễ nhầm (0 O 1 I): 16 ký tự x 5 bit = 80 bit. */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_LEN = 16;

/** Mã khôi phục dạng `XXXX-XXXX-XXXX-XXXX` (~80 bit entropy). 256 chia hết cho 32 nên lấy 5 bit thấp là đều. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_LEN);
  let s = "";
  for (let i = 0; i < RECOVERY_LEN; i++) {
    if (i > 0 && i % 4 === 0) s += "-";
    s += RECOVERY_ALPHABET[bytes[i] & 31];
  }
  return s;
}

/**
 * Chuẩn hoá mã người chơi nhập (chữ thường, có / không gạch ngang, dấu cách): trả dạng không phân cách viết hoa để
 * băm và so sánh; không đúng 16 ký tự trong bảng chữ thì `null`.
 */
export function normalizeRecoveryCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (s.length !== RECOVERY_LEN) return null;
  for (const ch of s) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return s;
}
