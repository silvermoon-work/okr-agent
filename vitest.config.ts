import { defineConfig } from "vitest/config";
import { basename, resolve } from "node:path";

export default defineConfig({
  test: {
    setupFiles:
      basename(process.cwd()) === "silvermoon"
        ? [resolve("test", "no-native.ts")]
        : [],
    coverage: {
      autoAttachSubprocess: true,
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
