import { authModeOf, parseTrustProxy } from "./auth-http";
import { storeKindOf } from "./stores";
import { minProtocolOf } from "./protocol";
import { corsOriginsOf } from "./cors";
import { metricsTokenOf, thresholdsOf } from "./metrics";

/** Cảnh báo cấu hình in ra khi server khởi động (thuần hàm để test được). */
export function startupWarnings(env: NodeJS.ProcessEnv): string[] {
  const warnings: string[] = [];
  const production = env.NODE_ENV === "production";
  // Khớp đúng điều kiện chặn /give ở systems/inventory.ts: chỉ chữ "production" mới tắt lệnh.
  if (!production) {
    warnings.push(
      "NODE_ENV không phải 'production': lệnh /give đang BẬT cho mọi người chơi (tự cấp vật phẩm). " +
        "Khi mở cho người chơi thật phải đặt NODE_ENV=production (xem docs/TRIEN_KHAI.md).",
    );
  }
  const mode = authModeOf(env);
  if (
    env.AUTH_MODE !== undefined &&
    env.AUTH_MODE !== "" &&
    env.AUTH_MODE !== "legacy" &&
    env.AUTH_MODE !== "account"
  ) {
    warnings.push(
      `AUTH_MODE='${env.AUTH_MODE}' không hợp lệ (chỉ 'legacy' hoặc 'account'): đang dùng 'legacy'.`,
    );
  }
  if (production && mode === "legacy") {
    warnings.push(
      "AUTH_MODE=legacy: danh tính chỉ là đạo hiệu + mã bí mật lưu ở trình duyệt (mất trình duyệt là mất nhân vật). " +
        "Khi mở cho người chơi thật nên đặt AUTH_MODE=account (xem docs/TRIEN_KHAI.md).",
    );
  }
  const rawProxy = env.TRUST_PROXY;
  if (rawProxy !== undefined && rawProxy.trim() !== "" && parseTrustProxy(rawProxy) === false) {
    warnings.push(
      `TRUST_PROXY='${rawProxy}' không hợp lệ hoặc không an toàn (không nhận true / *): đang KHÔNG tin X-Forwarded-For. ` +
        "Dùng số tầng proxy (vd 1) hoặc danh sách mạng con (loopback, 10.0.0.0/8).",
    );
  }
  if (production && mode === "account" && (rawProxy ?? "").trim() === "") {
    warnings.push(
      "AUTH_MODE=account mà TRUST_PROXY chưa đặt: nếu chạy sau reverse proxy (Caddy / Nginx) mọi người chơi sẽ dùng chung " +
        "IP của proxy và chung hạn mức đăng nhập (10 lần sai / 10 phút cho CẢ server). Đặt TRUST_PROXY=1 khi có đúng một " +
        "proxy đặt X-Forwarded-For; bỏ qua cảnh báo này nếu mở thẳng ra Internet.",
    );
  }
  warnings.push(...minProtocolOf(env).warnings);
  warnings.push(...metricsTokenOf(env).warnings, ...thresholdsOf(env).warnings);
  warnings.push(...corsOriginsOf(env).warnings);
  const kind = storeKindOf(env);
  if (env.STORE !== undefined && env.STORE !== "" && env.STORE !== "file" && env.STORE !== "pg") {
    warnings.push(`STORE='${env.STORE}' không hợp lệ (chỉ 'file' hoặc 'pg'): đang dùng 'file'.`);
  }
  if (kind === "file" && (env.DATABASE_URL ?? "").trim() !== "") {
    warnings.push(
      "DATABASE_URL đã đặt nhưng STORE chưa phải 'pg': đang lưu bằng tệp JSON, PostgreSQL KHÔNG được dùng. Đặt STORE=pg để dùng.",
    );
  }
  if (production && kind === "file") {
    warnings.push(
      "STORE=file: nhân vật, chân linh, tài khoản nằm trong tệp JSON ở DATA_DIR (chỉ một máy, một tiến trình). Khuyến nghị " +
        "STORE=pg + DATABASE_URL (PostgreSQL) khi mở cho người chơi thật (xem docs/TRIEN_KHAI.md).",
    );
  }
  return warnings;
}
