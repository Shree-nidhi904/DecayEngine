import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest also reads this file. Every Ghosted test runs in jsdom.
// base "/": the build's asset paths work when served from the site root (Req 32.3).
// testTimeout 20000: jsdom App tests can pass Vitest's 5-second default on a
// loaded machine without any real bug (Req 32.4).
export default defineConfig({
  base: "/",
  plugins: [react()],
  test: { environment: "jsdom", testTimeout: 20000, maxWorkers: 4 },
});
