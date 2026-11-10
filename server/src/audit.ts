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

/** Đặt nơi ghi (null: tắt). Test dùng để bắt dòng log; `startAudit` dùng stdout. */
export function setAuditSink(s: AuditSink | null, now: () => number = Date.now) {
  sink = s;
  clock = now;
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
    const line = JSON.stringify({
      t: new Date(clock()).toISOString(),
      audit: 1,
      ev: cleanAuditString(String(ev)),
      ...cleanAuditFields(fields),
    });
    sink(line);
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
