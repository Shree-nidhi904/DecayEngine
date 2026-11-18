import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest also reads this file. App tests run in the default node environment;
// the dialog tests opt into jsdom with a "// @vitest-environment jsdom" comment.
export default defineConfig({
  plugins: [react()],
});
