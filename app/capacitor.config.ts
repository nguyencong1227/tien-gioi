import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "site.hethongtm.tiengioi",
  appName: "Tiên Giới",
  webDir: "../client/dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
