import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { pwa } from "@decay-engine/pwa/vite";

// Vitest also reads this file. App tests run in the default node environment;
// the dialog tests opt into jsdom with a "// @vitest-environment jsdom" comment.
export default defineConfig({
  plugins: [
    react(),
    // Web app manifest and offline service worker, in production builds only.
    pwa({
      name: "Study Dungeon",
      shortName: "Study Dungeon",
      description: "Facts that fade like candles. Review them before they die.",
      themeColor: "#110d17",
      backgroundColor: "#060509",
      extraPrecache: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"],
    }),
  ],
  // The jsdom App tests render the whole app; on a loaded machine they can pass
  // 5 seconds and fail by timeout without any real bug. Four workers keep memory
  // use low on small machines (12 jsdom workers were killed on a 3.5 GB laptop).
  test: { testTimeout: 20_000, maxWorkers: 4 },
});
