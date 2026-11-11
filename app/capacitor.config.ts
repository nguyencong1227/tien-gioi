import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Cờ phát triển nội bộ mạng LAN: chỉ bật khi biến môi trường CAP_DEBUG=1.
 * Khi bật, Capacitor cho phép tải tài nguyên HTTP không mã hóa từ máy tính phát triển trong mạng LAN.
 * Mặc định luôn là bản phát hành an toàn (HTTPS, không cleartext, không server.url).
 */
const isDebug = process.env.CAP_DEBUG === "1" || process.env.CAP_DEBUG === "true";

const config: CapacitorConfig = {
  appId: "site.hethongtm.tiengioi",
  appName: "Tiên Giới",
  webDir: "../client/dist",
  server: {
    androidScheme: isDebug ? "http" : "https",
    ...(isDebug ? { cleartext: true } : {}),
  },
};

export default config;
