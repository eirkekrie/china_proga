import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eirkekrie.hanziflow",
  appName: "Hanzi Flow",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
