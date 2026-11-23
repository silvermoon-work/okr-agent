import { defineConfig } from "vitest/config";

if (process.env.SILVERMOON_NATIVE_TEST !== "1")
  throw new Error("Use the explicit native-test command.");

export default defineConfig({
  test: {
    include: ["native-test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
