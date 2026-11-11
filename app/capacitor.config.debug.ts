import type { CapacitorConfig } from "@capacitor/cli";
import baseConfig from "./capacitor.config";

/**
 * Cấu hình Capacitor riêng cho phát triển trên mạng LAN cục bộ (mục 5.3 docs/THIET_KE_APP_ANDROID.md).
 * CHỈ DÙNG KHI CAP_DEBUG=1. Tuyệt đối không đóng gói vào bản phát hành Google Play.
 */
const debugConfig: CapacitorConfig = {
  ...baseConfig,
  server: {
    ...baseConfig.server,
    androidScheme: "http",
    cleartext: true,
  },
};

export default debugConfig;
