import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/properties/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
})
