// Nhân vật của tài khoản (M3 bước 3c-4, docs/THIET_KE_TAI_KHOAN.md mục 3 và 7): chọn đạo hiệu lần đầu và nhận lại nhân
// vật cũ (đăng nhập kiểu tên + mã bí mật) về tài khoản. Một tài khoản một nhân vật; đạo hiệu đặt MỘT lần.
// Không tạo hồ sơ nhân vật ở đây: `WorldRoom.onAuth` tạo hồ sơ mới ở lần vào đầu tiên (đúng bản đồ mặc định); ở đây chỉ
// giữ chỗ đạo hiệu (`AccountStore.setName`, duy nhất, không đua) và, khi nhận nhân vật cũ, chuyển chân linh theo tên sang
// chân linh của tài khoản.
import { timingSafeEqual } from "node:crypto";
import { cleanName } from "@tien-gioi/shared";
import type { AccountStore } from "./account-store";
import { WindowCounter } from "./auth-limits";
import { authFail, authOk, type AuthResult, type AuthService } from "./auth-service";
import type { PlayerStore } from "./player-store";
import { soulIdOf, type SoulStore } from "./soul";
import { hashSecret } from "./store";

/** Mỗi tài khoản tối đa chừng này lần thử tạo / nhận đạo hiệu mỗi giờ (chặn dò tên hàng loạt). */
export const CHARACTER_TRIES_PER_HOUR = 30;
/** Nhận nhân vật cũ sai mã: tối đa 10 lần / giờ / tài khoản và 20 lần / 10 phút / IP. */
export const CLAIM_FAILS_PER_ACCOUNT = 10;
export const CLAIM_FAILS_PER_IP = 20;
const MAX_SECRET_LEN = 256;

export interface CharacterDeps {
  auth: AuthService;
  accounts: AccountStore;
  players: PlayerStore;
  souls: SoulStore;
  now?: () => number;
  maxTracked?: number;
}

const bodyOf = (raw: unknown): Record<string, unknown> | null =>
  raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;

/** So hai chuỗi băm hex theo hằng thời gian; sai kiểu / khác độ dài thì `false`. */
function sameHash(a: unknown, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class CharacterService {
  private readonly now: () => number;
  private readonly tries: WindowCounter;
  private readonly claimFailsByAccount: WindowCounter;
  private readonly claimFailsByIp: WindowCounter;

  constructor(private readonly d: CharacterDeps) {
    this.now = d.now ?? Date.now;
    this.tries = new WindowCounter(3600_000, d.maxTracked);
    this.claimFailsByAccount = new WindowCounter(3600_000, d.maxTracked);
    this.claimFailsByIp = new WindowCounter(600_000, d.maxTracked);
  }

  /** Chọn đạo hiệu cho tài khoản chưa có nhân vật. */
  async create(token: unknown, raw: unknown): Promise<AuthResult<Record<string, never>>> {
    const account = await this.d.auth.resolve(token);
    if (!account) return authFail("unauthorized");
    const body = bodyOf(raw);
    if (!body || typeof body.name !== "string") return authFail("invalid");
    const name = cleanName(body.name);
    if (!name) return authFail("name_invalid");
    if (account.name !== undefined) return authFail("has_character");

    const now = this.now();
    if (this.tries.count(account.id, now) >= CHARACTER_TRIES_PER_HOUR)
      return authFail("rate_limited", this.tries.retryAfterMs(account.id, now));
    this.tries.add(account.id, now);

    // Tên đã là của một nhân vật cũ (chưa ai nhận) thì không tạo trùng: chỉ nhận được bằng mã bí mật
    if (await this.d.players.load(name)) return authFail("name_taken");
    return this.reserve(account.id, name, "name_taken");
  }

  /** Nhận lại nhân vật cũ (tên + mã bí mật) về tài khoản chưa có nhân vật. */
  async claim(
    ip: string,
    token: unknown,
    raw: unknown,
  ): Promise<AuthResult<Record<string, never>>> {
    const account = await this.d.auth.resolve(token);
    if (!account) return authFail("unauthorized");
    const body = bodyOf(raw);
    if (!body || typeof body.name !== "string" || typeof body.secret !== "string")
      return authFail("invalid");
    if (body.secret.length > MAX_SECRET_LEN || body.name.length > 64) return authFail("invalid");
    if (account.name !== undefined) return authFail("has_character");

    const now = this.now();
    if (this.claimFailsByAccount.count(account.id, now) >= CLAIM_FAILS_PER_ACCOUNT)
      return authFail("rate_limited", this.claimFailsByAccount.retryAfterMs(account.id, now));
    if (this.claimFailsByIp.count(ip, now) >= CLAIM_FAILS_PER_IP)
      return authFail("rate_limited", this.claimFailsByIp.retryAfterMs(ip, now));

    // Mọi lý do không nhận được (tên sai luật, không có nhân vật, sai mã, đã có chủ: `setName` bên dưới) cho CÙNG `not_found`
    const name = cleanName(body.name);
    const existing = name ? await this.d.players.load(name) : null;
    const good = !!name && !!existing && sameHash(existing.secretHash, hashSecret(body.secret));
    if (!name || !good) {
      this.claimFailsByAccount.add(account.id, now);
      this.claimFailsByIp.add(ip, now);
      return authFail("not_found");
    }

    const r = await this.reserve(account.id, name, "not_found");
    if (!r.ok) {
      this.claimFailsByAccount.add(account.id, now);
      this.claimFailsByIp.add(ip, now);
      return r;
    }
    // Chuyển chân linh theo tên sang chân linh của tài khoản (Duyên, Kiếp, mở khoá). `create` không ghi đè nếu đã có.
    // Làm SAU khi giữ chỗ tên (nguyên tử): hai tài khoản cùng nhận một nhân vật thì chỉ bên thắng được chân linh.
    const legacy = await this.d.souls.get(soulIdOf(name));
    if (legacy) await retry(() => this.d.souls.create(account.id, () => legacy));
    return authOk({});
  }

  /** Giữ chỗ đạo hiệu cho tài khoản; `taken` là mã lỗi trả khi đạo hiệu đã có chủ. */
  private async reserve(
    accountId: string,
    name: string,
    taken: "name_taken" | "not_found",
  ): Promise<AuthResult<Record<string, never>>> {
    switch (await this.d.accounts.setName(accountId, name)) {
      case "ok":
        return authOk({});
      case "name_taken":
        return authFail(taken);
      case "has_character":
        return authFail("has_character");
      default:
        return authFail("unauthorized");
    }
  }
}

/** Thử lại vài lần (lỗi đĩa tạm thời); hết lần vẫn lỗi thì ném, lớp HTTP trả 500. */
async function retry<T>(fn: () => Promise<T>, times = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
