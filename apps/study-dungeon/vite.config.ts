import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest also reads this file. App tests run in the default node environment;
// the dialog tests opt into jsdom with a "// @vitest-environment jsdom" comment.
export default defineConfig({
  plugins: [react()],
  // The jsdom App tests render the whole app; on a loaded machine they can pass
  // 5 seconds and fail by timeout without any real bug.
  test: { testTimeout: 20_000 },
});
