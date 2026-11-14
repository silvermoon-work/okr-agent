import { resolve } from "node:path";
import { lstatSync } from "node:fs";
import type * as Fs from "node:fs";
import { expect, it, vi } from "vitest";
import { Files } from "../src/files.js";
import {
  DeliverablesError,
  validateDeliveryPaths,
} from "../assets/deliverables.mjs";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof Fs>()),
  lstatSync: vi.fn(),
}));
it.each(["EACCES", "EIO", "EPERM"])(
  "keeps %s directory faults as execution failures",
  (code) => {
    const fault = Object.assign(new Error("directory I/O failed"), { code });
    vi.mocked(lstatSync).mockImplementationOnce(() => {
      throw fault;
    });
    expect(() => {
      validateDeliveryPaths(resolve("."), [{ path: "apps", type: "custom" }]);
    }).toThrow(fault);
  },
);
it("classifies only expected directory absence as a normal missing finding", () => {
  vi.mocked(lstatSync).mockImplementationOnce(() => {
    throw Object.assign(new Error("absent"), { code: "ENOENT" });
  });
  expect(() => {
    validateDeliveryPaths(resolve("."), [{ path: "apps", type: "custom" }]);
  }).toThrow(DeliverablesError);
});
it("keeps async directory permission and cancellation failures, but normalizes absence", async () => {
  const files = new Files(resolve("."), new AbortController().signal);
  const guard = vi.spyOn(files, "guard");
  guard.mockRejectedValueOnce(
    Object.assign(new Error("absent"), { code: "ENOENT" }),
  );
  expect(await files.directory("absent")).toBe(false);
  guard.mockRejectedValueOnce(
    Object.assign(new Error("denied"), { code: "EACCES" }),
  );
  await expect(files.directory("denied")).rejects.toThrow("denied");
  guard.mockRejectedValueOnce(new Error("canceled"));
  await expect(files.directory("canceled")).rejects.toThrow("canceled");
});
