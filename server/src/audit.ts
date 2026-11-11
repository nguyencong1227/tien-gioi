// Nhật ký kiểm toán có cấu trúc (M4 2.4, issue #263): MỘT dòng JSON cho mỗi sự kiện nhạy cảm, để vận hành / điều tra gian lận truy vết
// được (`grep '"audit":1'` trên log của Docker / systemd). Bản này CHỈ ghi nhận, không phạt ai (mức phạt do người dùng chốt, M4 mục 6).
//
// - Mặc định KHÔNG ghi (bench, test đơn vị yên lặng): `index.ts` bật bằng `startAudit(process.env)`; `AUDIT_LOG=off` tắt.
// - Chỉ chạy khi có sự kiện (đăng nhập sai, ngắt vì spam, đổi ví lớn, lập / giải tán / rút tông môn...), KHÔNG nằm trong tick nóng.
// - Làm sạch: bỏ khoá giống mật khẩu / bí mật / token / băm / mã khôi phục, chỉ nhận giá trị phẳng (số hữu hạn, chuỗi ngắn, boolean,
//   null), cắt chuỗi dài, bỏ ký tự điều khiển (không phá được định dạng một dòng, không "chèn" dòng log giả).
// - Riêng tư: có thể chứa đạo hiệu, tên tài khoản và IP của người chơi: log chỉ để vận hành, không đưa ra ngoài.

/** Giá trị một trường audit sau khi làm sạch. */
export type AuditValue = string | number | boolean | null;
export type AuditFields = Record<string, unknown>;
/** Hàm ghi sự kiện: `ev` dạng `nhóm.việc` (vd `sect.withdraw`). */
export type AuditFn = (ev: string, fields?: AuditFields) => void;
export type AuditSink = (line: string) => void;

/** Khoá bị loại hẳn (không bao giờ ghi, dù người gọi lỡ truyền vào). */
const SECRET_KEY = /pass|secret|token|hash|recover|cookie|authoriz|session/i;
/** Khoá do chính audit đặt, người gọi không được ghi đè. */
const RESERVED = new Set(["t", "audit", "ev"]);
const MAX_STR = 200;
const MAX_FIELDS = 16;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

let sink: AuditSink | null = null;
let clock: () => number = Date.now;
let warnFn: (line: string) => void = (line) => console.warn(line);

/**
 * Đặt nơi ghi (null: tắt). Test dùng để bắt dòng log; `startAudit` dùng stdout. `warn` là nơi in cảnh báo (mặc định `console.warn`,
 * vào stderr kèm tiền tố `[CẢNH BÁO]` như các cảnh báo vận hành khác). Đặt lại sink thì xoá bộ nhớ của luật cảnh báo.
 */
export function setAuditSink(
  s: AuditSink | null,
  now: () => number = Date.now,
  warn: (line: string) => void = (line) => console.warn(line),
) {
  sink = s;
  clock = now;
  warnFn = warn;
  alertHits.clear();
  alertedAt.clear();
}

/**
 * Luật CẢNH BÁO (người dùng chốt 11/11/2026: gian lận chỉ ghi nhận + cảnh báo, KHÔNG tự khoá tài khoản): cùng một khoá
 * (`keyField`) gây ít nhất `count` sự kiện `ev` trong `windowMs` thì ghi thêm một sự kiện `alert` và in một dòng `[CẢNH BÁO]` để người vận
 * hành để ý. Mỗi (luật, khoá) chỉ báo một lần mỗi cửa sổ. Không phạt gì: chỉ để con người xem log rồi quyết định.
 */
export interface AlertRule {
  ev: string;
  keyField: string;
  count: number;
  windowMs: number;
  alert: string;
}
export const ALERT_RULES: readonly AlertRule[] = [
  // Bị ngắt vì spam tin nhắn nhiều lần: client sửa / bot
  {
    ev: "room.spam_kick",
    keyField: "name",
    count: 3,
    windowMs: 600_000,
    alert: "alert.spam_kicks",
  },
  // Một IP bị giới hạn tần suất đăng ký / đăng nhập / khôi phục nhiều lần: dò mật khẩu / tạo tài khoản hàng loạt
  {
    ev: "auth.rate_limited",
    keyField: "ip",
    count: 5,
    windowMs: 600_000,
    alert: "alert.auth_flood",
  },
  // Nhiều lần sai mã bí mật cho cùng một đạo hiệu: dò mã
  { ev: "join.denied", keyField: "name", count: 5, windowMs: 600_000, alert: "alert.join_guess" },
];
/** Số khoá tối đa theo dõi (chặn phình bộ nhớ nếu kẻ xấu đổi khoá liên tục). */
const MAX_ALERT_KEYS = 2000;
const alertHits = new Map<string, number[]>();
const alertedAt = new Map<string, number>();

/** Số khoá đang được theo dõi cho luật cảnh báo (test kiểm trần bộ nhớ). */
export function auditAlertKeyCount(): number {
  return alertHits.size;
}

function observeAlerts(ev: string, fields: Record<string, AuditValue>) {
  for (const rule of ALERT_RULES) {
    if (rule.ev !== ev) continue;
    const keyVal = fields[rule.keyField];
    if (typeof keyVal !== "string" && typeof keyVal !== "number") continue;
    const now = clock();
    const id = `${rule.alert}|${keyVal}`;
    const hits = (alertHits.get(id) ?? []).filter((t) => now - t < rule.windowMs);
    hits.push(now);
    alertHits.delete(id); // đưa khoá về cuối Map: khoá lâu không động tới bị loại trước
    alertHits.set(id, hits);
    if (alertHits.size > MAX_ALERT_KEYS) {
      const oldest = alertHits.keys().next().value;
      if (oldest !== undefined) {
        alertHits.delete(oldest);
        alertedAt.delete(oldest);
      }
    }
    const last = alertedAt.get(id);
    if (hits.length >= rule.count && (last === undefined || now - last >= rule.windowMs)) {
      alertedAt.set(id, now);
      const windowS = Math.round(rule.windowMs / 1000);
      audit(rule.alert, { of: rule.ev, key: keyVal, count: hits.length, windowS });
      try {
        warnFn(
          `[CẢNH BÁO] ${rule.alert}: '${cleanAuditString(String(keyVal))}' gây ${hits.length} lần ${rule.ev} trong ${windowS} giây (chỉ ghi nhận, không tự khoá).`,
        );
      } catch {
        // cảnh báo hỏng không được kéo game sập
      }
    }
  }
}

export function auditEnabled(): boolean {
  return sink !== null;
}

/** Chuỗi một dòng: mọi ký tự điều khiển / ngắt dòng (kể cả U+2028, U+2029) thành dấu cách, cắt `MAX_STR`. */
export function cleanAuditString(s: string): string {
  let t = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    t += c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029 ? " " : ch;
    if (t.length > MAX_STR + 8) break;
  }
  return t.length > MAX_STR ? t.slice(0, MAX_STR) + "…" : t;
}

/** Làm sạch các trường: khoá hợp lệ và không giống bí mật, giá trị phẳng. Trường lạ bị bỏ (không ném lỗi: audit không được làm hỏng game). */
export function cleanAuditFields(fields: AuditFields | undefined): Record<string, AuditValue> {
  const out: Record<string, AuditValue> = {};
  if (!fields) return out;
  let n = 0;
  for (const [k, v] of Object.entries(fields)) {
    if (n >= MAX_FIELDS) break;
    if (!KEY_RE.test(k) || RESERVED.has(k) || SECRET_KEY.test(k)) continue;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      out[k] = v;
    } else if (typeof v === "string") out[k] = cleanAuditString(v);
    else if (typeof v === "boolean" || v === null) out[k] = v;
    else continue;
    n++;
  }
  return out;
}

/** Ghi một sự kiện (không làm gì nếu chưa bật). Không bao giờ ném lỗi ra ngoài. */
export const audit: AuditFn = (ev, fields) => {
  if (!sink) return;
  try {
    const clean = cleanAuditFields(fields);
    const name = cleanAuditString(String(ev));
    sink(JSON.stringify({ t: new Date(clock()).toISOString(), audit: 1, ev: name, ...clean }));
    observeAlerts(name, clean);
  } catch {
    // audit hỏng không được kéo game sập
  }
};

/** Đọc `AUDIT_LOG` (mặc định bật; chỉ "off" mới tắt) và, nếu bật, ghi ra stdout. */
export function startAudit(env: NodeJS.ProcessEnv): boolean {
  if ((env.AUDIT_LOG ?? "").trim().toLowerCase() === "off") {
    setAuditSink(null);
    return false;
  }
  setAuditSink((line) => void process.stdout.write(line + "\n"));
  return true;
}

/** Ngưỡng `wallet.big` (`AUDIT_COIN_THRESHOLD`, mặc định 5000; giá trị không phải số nguyên dương thì dùng mặc định). */
export const DEFAULT_AUDIT_COIN = 5000;
export function auditCoinThreshold(env: NodeJS.ProcessEnv): number {
  const raw = (env.AUDIT_COIN_THRESHOLD ?? "").trim();
  if (!/^\d{1,9}$/.test(raw)) return DEFAULT_AUDIT_COIN;
  const n = Number(raw);
  return n >= 1 ? n : DEFAULT_AUDIT_COIN;
}
