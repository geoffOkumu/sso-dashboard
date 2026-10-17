import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("."),
      "server-only": path.resolve("tests/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.db.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
