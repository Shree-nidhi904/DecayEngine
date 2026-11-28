import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { pwa } from "@decay-engine/pwa/vite";

// Vitest also reads this file. Every Ghosted test runs in jsdom.
// base "/": the build's asset paths work when served from the site root (Req 32.3).
// testTimeout 20000: jsdom App tests can pass Vitest's 5-second default on a
// loaded machine without any real bug (Req 32.4).
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    // Web app manifest and offline service worker, in production builds only.
    pwa({
      name: "Ghosted",
      shortName: "Ghosted",
      description: "Find who has gone quiet, and reach out before the light goes out.",
      themeColor: "#100e1a",
      backgroundColor: "#07060d",
      extraPrecache: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"],
    }),
  ],
  test: { environment: "jsdom", testTimeout: 20000, maxWorkers: 4 },
});
