// Giới hạn tần suất cho đăng ký / đăng nhập / khôi phục (M3 bước 3c, docs/THIET_KE_TAI_KHOAN.md mục 4.3). Bộ đếm trong
// bộ nhớ (một tiến trình), có trần số khoá theo dõi để kẻ tấn công đổi IP / tên liên tục không làm phình bộ nhớ.
// Giờ truyền vào (`now`, ms) nên test không cần chờ.

interface Entry {
  n: number;
  resetAt: number;
}

/** Đếm số lần trong một cửa sổ cố định theo khoá (IP, tên...). Hết cửa sổ thì đếm lại từ 0. */
export class WindowCounter {
  private readonly m = new Map<string, Entry>();

  constructor(
    private readonly windowMs: number,
    /** Số khoá theo dõi tối đa; vượt thì bỏ các khoá đã hết hạn, rồi các khoá cũ nhất */
    private readonly cap = 20_000,
  ) {}

  private live(key: string, now: number): Entry | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.resetAt <= now) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }

  count(key: string, now: number): number {
    return this.live(key, now)?.n ?? 0;
  }

  /** Cộng một lần; trả số lần trong cửa sổ hiện tại. */
  add(key: string, now: number): number {
    let e = this.live(key, now);
    if (!e) {
      this.makeRoom(now);
      e = { n: 0, resetAt: now + this.windowMs };
      this.m.set(key, e);
    }
    e.n++;
    return e.n;
  }

  /** Còn bao nhiêu ms đến khi cửa sổ của khoá này đóng (0 nếu không có). */
  retryAfterMs(key: string, now: number): number {
    const e = this.live(key, now);
    return e ? e.resetAt - now : 0;
  }

  get size() {
    return this.m.size;
  }

  private makeRoom(now: number) {
    if (this.m.size < this.cap) return;
    for (const [k, e] of this.m) if (e.resetAt <= now) this.m.delete(k);
    if (this.m.size < this.cap) return;
    // Vẫn đầy: bỏ 10% khoá cũ nhất (Map giữ thứ tự thêm vào)
    let drop = Math.ceil(this.cap / 10);
    for (const k of this.m.keys()) {
      if (drop-- <= 0) break;
      this.m.delete(k);
    }
  }
}

/** Số lần thất bại liên tiếp thì khoá mềm; mỗi lần khoá lại dài hơn (1 phút, 5 phút, 30 phút, rồi giữ 30 phút). */
export const LOCK_STEPS_S = [60, 300, 1800] as const;
export const FAILS_PER_LOCK = 5;
/** Quên một tên sau từng ấy ms kể từ lần thất bại cuối (kể từ lúc hết khoá): bậc khoá về lại đầu. */
const FORGET_MS = 3_600_000;

interface Lock {
  fails: number;
  level: number;
  lockUntil: number;
  lastFail: number;
}

/**
 * Khoá mềm theo tên đăng nhập (kể cả tên không tồn tại, để không lộ tên nào có thật): `FAILS_PER_LOCK` lần thất bại
 * liên tiếp thì khoá `LOCK_STEPS_S[bậc]` giây; đăng nhập đúng thì xoá. Bị khoá thì từ chối mọi lần thử, kể cả mật khẩu đúng
 * (nếu không, khoá chỉ là trang trí). Đánh đổi đã chọn trong thiết kế: kẻ xấu có thể khoá tạm tên của người khác.
 */
export class LoginLocks {
  private readonly m = new Map<string, Lock>();

  constructor(private readonly cap = 20_000) {}

  private live(key: string, now: number): Lock | undefined {
    const l = this.m.get(key);
    if (!l) return undefined;
    if (l.lockUntil <= now && now - Math.max(l.lastFail, l.lockUntil) > FORGET_MS) {
      this.m.delete(key);
      return undefined;
    }
    return l;
  }

  /** Còn bao nhiêu ms bị khoá (0 nếu không). */
  lockedMs(key: string, now: number): number {
    const l = this.live(key, now);
    return l && l.lockUntil > now ? l.lockUntil - now : 0;
  }

  fail(key: string, now: number) {
    let l = this.live(key, now);
    if (!l) {
      this.makeRoom(now);
      l = { fails: 0, level: 0, lockUntil: 0, lastFail: now };
      this.m.set(key, l);
    }
    l.lastFail = now;
    l.fails++;
    if (l.fails >= FAILS_PER_LOCK) {
      l.fails = 0;
      l.level++;
      l.lockUntil = now + LOCK_STEPS_S[Math.min(l.level, LOCK_STEPS_S.length) - 1] * 1000;
    }
  }

  success(key: string) {
    this.m.delete(key);
  }

  get size() {
    return this.m.size;
  }

  private makeRoom(now: number) {
    if (this.m.size < this.cap) return;
    for (const k of [...this.m.keys()]) this.live(k, now);
    if (this.m.size < this.cap) return;
    let drop = Math.ceil(this.cap / 10);
    for (const k of this.m.keys()) {
      if (drop-- <= 0) break;
      this.m.delete(k);
    }
  }
}
