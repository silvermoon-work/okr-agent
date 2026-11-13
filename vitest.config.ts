import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      autoAttachSubprocess: true,
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 65,
        functions: 65,
        lines: 65,
        statements: 65,
      },
    },
    include: ["test/**/*.test.ts"],
  },
});
