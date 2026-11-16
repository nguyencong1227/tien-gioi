// Hộ thể sau khi nối lại / có tin lại / được tha chết vì mạng (QUYET_DINH_M3 mục 33, `shared/src/net-guard.ts`). Máy chủ quyết định (nhân vật bất tử `NET_SHIELD_MS` = 3 giây, quái mất mục
// tiêu) và gửi RIÊNG chủ tin `netShield { ms, reason }`; client chỉ HIỂN THỊ: vầng sáng quanh nhân vật mình + chữ "Hộ thể" đếm ngược. Lớp THUẦN (đồng hồ do người gọi truyền vào) nên test được.
// Không cần cờ trên `Player` state: người khác không cần thấy hộ thể của mình.
import { NET_SHIELD_MS, type NetShieldMsg, type NetShieldReason } from "@tien-gioi/shared";

/** Trần thời gian hộ thể client chịu hiển thị (ms): tin hỏng / quá lớn không làm vầng sáng sáng mãi. */
export const SHIELD_MAX_MS = 10_000;

const REASONS: readonly NetShieldReason[] = ["resume", "spared"];

/** Làm sạch `netShield` nhận từ máy chủ (client không tin tin nhắn): `ms` hữu hạn, dương, kẹp `SHIELD_MAX_MS`; `reason` lạ / thiếu thì coi là `resume`. Hỏng hẳn: `null`. */
export function parseNetShield(raw: unknown): NetShieldMsg | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { ms?: unknown; reason?: unknown };
  if (typeof r.ms !== "number" || !Number.isFinite(r.ms) || r.ms <= 0) return null;
  const reason = REASONS.includes(r.reason as NetShieldReason)
    ? (r.reason as NetShieldReason)
    : "resume";
  return { ms: Math.min(SHIELD_MAX_MS, Math.floor(r.ms)), reason };
}

/** Chữ đếm ngược: "Hộ thể 2,4s" (làm tròn LÊN tới 0,1 giây để không hiện "0,0s" khi còn hộ thể); `null` khi đã hết. */
export function shieldLabel(remainingMs: number): string | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const tenths = Math.ceil(Math.min(remainingMs, SHIELD_MAX_MS) / 100) / 10;
  return `Hộ thể ${tenths.toFixed(1).replace(".", ",")}s`;
}

/** Đồng hồ đếm ngược hộ thể theo đồng hồ CỦA CLIENT (`now`, ms) từ lúc nhận tin. */
export class ShieldTimer {
  private until = Number.NEGATIVE_INFINITY;
  private _reason: NetShieldReason | null = null;

  /** Bắt đầu / làm mới hộ thể `ms` ms từ `now`. Tin mới KHÔNG rút ngắn hộ thể đang chạy (hai tin sát nhau: lấy mốc hết muộn hơn). */
  start(msg: NetShieldMsg, now: number): void {
    if (!Number.isFinite(now)) return;
    const end = now + msg.ms;
    if (end > this.until || now >= this.until) {
      this.until = end;
      this._reason = msg.reason;
    }
  }

  remaining(now: number): number {
    return Number.isFinite(now) ? Math.max(0, this.until - now) : 0;
  }

  active(now: number): boolean {
    return this.remaining(now) > 0;
  }

  get reason(): NetShieldReason | null {
    return this._reason;
  }

  clear(): void {
    this.until = Number.NEGATIVE_INFINITY;
    this._reason = null;
  }
}

/** Hộ thể mặc định theo hợp đồng (để test / mock). */
export const DEFAULT_SHIELD_MS = NET_SHIELD_MS;
