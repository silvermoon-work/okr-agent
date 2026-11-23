import { defineConfig } from "vitest/config";
import sharedConfig from "../../vitest.config.js";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    env: { TOOLCHAIN_NATIVE_TESTS: "1" },
    include: ["test/inspect.test.ts"],
  },
});
