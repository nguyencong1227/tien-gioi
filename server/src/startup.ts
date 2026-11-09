/** Cảnh báo cấu hình in ra khi server khởi động (thuần hàm để test được). */
export function startupWarnings(env: NodeJS.ProcessEnv): string[] {
  const warnings: string[] = [];
  // Khớp đúng điều kiện chặn /give ở systems/inventory.ts: chỉ chữ "production" mới tắt lệnh.
  if (env.NODE_ENV !== "production") {
    warnings.push(
      "NODE_ENV không phải 'production': lệnh /give đang BẬT cho mọi người chơi (tự cấp vật phẩm). " +
        "Khi mở cho người chơi thật phải đặt NODE_ENV=production (xem docs/TRIEN_KHAI.md).",
    );
  }
  return warnings;
}
