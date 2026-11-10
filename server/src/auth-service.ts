// Dịch vụ xác thực (M3 bước 3c, docs/THIET_KE_TAI_KHOAN.md mục 4): đăng ký, đăng nhập, phiên, khôi phục mật khẩu.
// Chỉ có logic: không biết HTTP (lớp HTTP gọi vào đây, bước 3c-3) và không biết kho lưu (nhận `AccountStore` /
// `SessionStore`). Mọi đầu vào là `unknown` vì đến từ mạng: kiểm kiểu và độ dài trước khi băm hay tra kho.
import {
  PASSWORD_MAX,
  validatePassword,
  validateUsername,
  type AuthErrorCode,
  type LoginRes,
  type MeRes,
  type RecoverRes,
  type RegisterRes,
} from "@tien-gioi/shared";
import {
  dummyHash,
  hashSecretScrypt,
  hashToken,
  isTokenShape,
  needsRehash,
  newRecoveryCode,
  newSessionToken,
  normalizeRecoveryCode,
  verifyScrypt,
} from "./auth";
import type { AccountRecord, AccountStore, SessionStore } from "./account-store";
import { LoginLocks, WindowCounter } from "./auth-limits";

/** Mã HTTP cho từng mã lỗi (thân phản hồi `{ error: <mã> }`); lớp HTTP dùng bảng này. */
export const AUTH_STATUS: Record<AuthErrorCode, number> = {
  invalid: 400,
  username_invalid: 400,
  weak_password: 400,
  username_taken: 409,
  name_invalid: 400,
  name_taken: 409,
  bad_credentials: 401,
  unauthorized: 401,
  rate_limited: 429,
  has_character: 409,
  need_character: 409,
  already_online: 409,
  not_found: 404,
};

export type AuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthErrorCode; status: number; retryAfterS?: number };

const ok = <T>(value: T): AuthResult<T> => ({ ok: true, value });
const fail = (error: AuthErrorCode, retryAfterMs?: number): AuthResult<never> => ({
  ok: false,
  error,
  status: AUTH_STATUS[error],
  ...(retryAfterMs !== undefined
    ? { retryAfterS: Math.max(1, Math.ceil(retryAfterMs / 1000)) }
    : {}),
});

/** Hàm băm; tách ra để test đếm số lần gọi và dùng tham số rẻ. Bản thật là scrypt của `auth.ts`. */
export interface Kdf {
  hash(secret: string): Promise<string>;
  verify(secret: string, stored: string): Promise<boolean>;
  dummy(): Promise<string>;
  needsRehash(stored: string): boolean;
}

export const scryptKdf: Kdf = {
  hash: (s) => hashSecretScrypt(s),
  verify: verifyScrypt,
  dummy: dummyHash,
  needsRehash: (s) => needsRehash(s),
};

export const SESSION_TTL_MS = 30 * 24 * 3600_000;
/** Phiên trượt: chỉ ghi làm mới nếu lần ghi trước đã quá chừng này (tối đa mỗi ngày một lần). */
export const SESSION_TOUCH_MS = 24 * 3600_000;
export const LOGIN_FAIL_WINDOW_MS = 10 * 60_000;
export const LOGIN_FAIL_PER_IP = 10;
export const REGISTER_WINDOW_MS = 3600_000;
export const REGISTER_PER_IP = 5;

export interface AuthDeps {
  accounts: AccountStore;
  sessions: SessionStore;
  kdf?: Kdf;
  /** Giờ hiện tại (ms); test đặt giờ giả */
  now?: () => number;
  /** Số khoá theo dõi tối đa của mỗi bộ giới hạn */
  maxTracked?: number;
}

export class AuthService {
  private readonly accounts: AccountStore;
  private readonly sessions: SessionStore;
  private readonly kdf: Kdf;
  private readonly now: () => number;
  private readonly ipFails: WindowCounter;
  private readonly ipRegs: WindowCounter;
  private readonly locks: LoginLocks;

  constructor(d: AuthDeps) {
    this.accounts = d.accounts;
    this.sessions = d.sessions;
    this.kdf = d.kdf ?? scryptKdf;
    this.now = d.now ?? Date.now;
    this.ipFails = new WindowCounter(LOGIN_FAIL_WINDOW_MS, d.maxTracked);
    this.ipRegs = new WindowCounter(REGISTER_WINDOW_MS, d.maxTracked);
    this.locks = new LoginLocks(d.maxTracked);
  }

  // ---------- Đăng ký ----------

  async register(ip: string, raw: unknown): Promise<AuthResult<RegisterRes>> {
    const now = this.now();
    const body = asBody(raw);
    const username = body && validateUsername(body.username);
    if (!body || typeof body.password !== "string" || tooLong(body.password))
      return fail("invalid");
    if (!username || !username.ok) return fail("username_invalid");
    const pw = validatePassword(body.password, username.value);
    if (!pw.ok) return fail("weak_password");

    // Giới hạn đăng ký theo IP: chỉ tính các yêu cầu đã hợp lệ về hình thức (gõ sai không đốt hạn mức)
    const wait = this.ipRegs.retryAfterMs(ip, now);
    if (this.ipRegs.count(ip, now) >= REGISTER_PER_IP) return fail("rate_limited", wait);
    this.ipRegs.add(ip, now);

    // Kiểm nhanh trước khi tốn hai lần scrypt; cuộc đua thật sự do `create` xử lý (UNIQUE)
    if (await this.accounts.byUsername(username.value)) return fail("username_taken");
    const recoveryCode = newRecoveryCode();
    const [passHash, recoveryHash] = await Promise.all([
      this.kdf.hash(body.password),
      this.kdf.hash(normalizeRecoveryCode(recoveryCode)!),
    ]);
    const iso = new Date(now).toISOString();
    const account = await this.accounts.create({
      username: username.value,
      passHash,
      recoveryHash,
      createdAt: iso,
      lastLoginAt: iso,
      disabled: false,
    });
    if (!account) return fail("username_taken");
    return ok({ token: await this.newSession(account.id, now), recoveryCode });
  }

  // ---------- Đăng nhập ----------

  async login(ip: string, raw: unknown): Promise<AuthResult<LoginRes>> {
    const now = this.now();
    const body = asBody(raw);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string")
      return fail("invalid");
    if (body.username.length > 64 || tooLong(body.password)) return fail("invalid");
    const u = validateUsername(body.username);
    const key = u.ok ? u.value : null;

    const blocked = this.blockedFor(ip, key, now);
    if (blocked) return blocked;

    // Tên sai luật thì không thể có tài khoản: không cần scrypt, coi như sai thông tin
    const account = key ? await this.accounts.byUsername(key) : null;
    // Luôn đúng MỘT lần scrypt dù tên có tồn tại hay không (băm giả): thời gian phản hồi không lộ tên nào có thật
    const good = key
      ? await this.kdf.verify(body.password, account?.passHash ?? (await this.kdf.dummy()))
      : false;
    if (!account || !good || account.disabled) return this.failed(ip, key, now);

    this.locks.success(key!);
    // Tham số băm yếu hơn mặc định: băm lại bằng mật khẩu vừa nhập đúng
    const patch: { lastLoginAt: string; passHash?: string } = {
      lastLoginAt: new Date(now).toISOString(),
    };
    if (this.kdf.needsRehash(account.passHash)) patch.passHash = await this.kdf.hash(body.password);
    await this.accounts.update(account.id, patch);
    return ok({ token: await this.newSession(account.id, now) });
  }

  // ---------- Khôi phục mật khẩu ----------

  /** Đặt lại mật khẩu bằng mã khôi phục: mã cũ vô hiệu (sinh mã MỚI), mọi phiên cũ bị xoá, trả phiên mới. */
  async recover(ip: string, raw: unknown): Promise<AuthResult<RecoverRes>> {
    const now = this.now();
    const body = asBody(raw);
    if (!body || typeof body.username !== "string" || typeof body.recoveryCode !== "string")
      return fail("invalid");
    if (typeof body.newPassword !== "string" || tooLong(body.newPassword)) return fail("invalid");
    if (body.username.length > 64) return fail("invalid");
    const u = validateUsername(body.username);
    const key = u.ok ? u.value : null;
    // Mật khẩu mới yếu: báo ngay, KHÔNG tiêu mã và không tính là thất bại (người dùng thật gõ nhầm)
    const pw = validatePassword(body.newPassword, key ?? body.username);
    if (!pw.ok) return fail("weak_password");

    const blocked = this.blockedFor(ip, key, now);
    if (blocked) return blocked;

    const code = normalizeRecoveryCode(body.recoveryCode);
    const account = key ? await this.accounts.byUsername(key) : null;
    // Mã sai dạng hay tên không có: vẫn đúng một lần scrypt, cùng một lỗi (không lộ cái nào sai)
    const good =
      key && code !== null
        ? await this.kdf.verify(code, account?.recoveryHash ?? (await this.kdf.dummy()))
        : false;
    if (!account || !good || account.disabled) return this.failed(ip, key, now);

    this.locks.success(key!);
    const recoveryCode = newRecoveryCode();
    const [passHash, recoveryHash] = await Promise.all([
      this.kdf.hash(body.newPassword),
      this.kdf.hash(normalizeRecoveryCode(recoveryCode)!),
    ]);
    await this.accounts.update(account.id, {
      passHash,
      recoveryHash,
      lastLoginAt: new Date(now).toISOString(),
    });
    await this.sessions.deleteAllOf(account.id);
    return ok({ token: await this.newSession(account.id, now), recoveryCode });
  }

  // ---------- Phiên ----------

  /**
   * Tra phiên từ token: hợp lệ thì trả tài khoản. Token sai dạng / không có / hết hạn / tài khoản bị khoá hoặc mất thì
   * `null` (phiên hết hạn hay mồ côi bị xoá). Phiên trượt: dùng thì làm mới hạn, ghi tối đa mỗi ngày một lần.
   */
  async resolve(token: unknown): Promise<AccountRecord | null> {
    if (!isTokenShape(token)) return null;
    const now = this.now();
    const tokenHash = hashToken(token);
    const s = await this.sessions.get(tokenHash);
    if (!s) return null;
    if (s.expiresAt <= now) {
      await this.sessions.delete(tokenHash);
      return null;
    }
    const account = await this.accounts.byId(s.accountId);
    if (!account) {
      await this.sessions.delete(tokenHash);
      return null;
    }
    if (account.disabled) return null;
    if (now - s.lastSeenAt >= SESSION_TOUCH_MS)
      await this.sessions.touch(tokenHash, now, now + SESSION_TTL_MS);
    return account;
  }

  async me(token: unknown): Promise<AuthResult<MeRes>> {
    const a = await this.resolve(token);
    if (!a) return fail("unauthorized");
    return ok({
      username: a.username,
      hasCharacter: a.name !== undefined,
      ...(a.name !== undefined ? { name: a.name } : {}),
    });
  }

  /** Đăng xuất: xoá phiên của token này; token sai / đã hết hạn cũng coi như xong (không lộ gì). */
  async logout(token: unknown): Promise<void> {
    if (!isTokenShape(token)) return;
    await this.sessions.delete(hashToken(token));
  }

  /** Dọn phiên hết hạn (lớp HTTP gọi định kỳ, vd mỗi giờ); trả số phiên đã xoá. */
  sweep(): Promise<number> {
    return this.sessions.deleteExpired(this.now());
  }

  // ---------- Nội bộ ----------

  private async newSession(accountId: string, now: number): Promise<string> {
    const { token, tokenHash } = newSessionToken();
    await this.sessions.create({
      tokenHash,
      accountId,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastSeenAt: now,
    });
    return token;
  }

  /** Bị chặn (IP đã thất bại quá nhiều, hoặc tên đang bị khoá mềm) thì từ chối TRƯỚC khi tốn scrypt. */
  private blockedFor(ip: string, key: string | null, now: number): AuthResult<never> | null {
    if (this.ipFails.count(ip, now) >= LOGIN_FAIL_PER_IP)
      return fail("rate_limited", this.ipFails.retryAfterMs(ip, now));
    if (key) {
      const ms = this.locks.lockedMs(key, now);
      if (ms > 0) return fail("rate_limited", ms);
    }
    return null;
  }

  /** Ghi một lần thất bại (theo IP và theo tên, kể cả tên không tồn tại) rồi trả cùng một lỗi. */
  private failed(ip: string, key: string | null, now: number): AuthResult<never> {
    this.ipFails.add(ip, now);
    if (key) this.locks.fail(key, now);
    return fail("bad_credentials");
  }
}

function asBody(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/** Mật khẩu dài quá mức (kể cả ký tự nhiều byte) bị loại sớm, trước khi `validatePassword` đếm ký tự hay băm. */
const tooLong = (s: string) => s.length > PASSWORD_MAX * 2;
