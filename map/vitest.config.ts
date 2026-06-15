import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only (tests/unit). Playwright owns tests/e2e separately.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
