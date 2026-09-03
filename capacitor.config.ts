import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.adityav2000.focalpoint",
  appName: "Lifetime",
  webDir: "mobile-dist",
  ios: {
    scheme: "Lifetime",
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  server: {
    iosScheme: "capacitor",
  },
};

export default config;
