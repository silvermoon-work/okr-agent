import { expect, it, vi } from "vitest";
const main = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock("../src/cli.js", () => ({ main }));
it("the owned bin delegates directly and sets process.exitCode", async () => {
  const previous = process.exitCode;
  try {
    await import("../src/bin.js");
    expect(main).toHaveBeenCalledWith(process.argv.slice(2));
    expect(process.exitCode).toBe(0);
  } finally {
    process.exitCode = previous;
  }
});
