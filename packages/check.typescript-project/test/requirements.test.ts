import { expect, it } from "vitest";
import { Value } from "@sinclair/typebox/value";
import { Input } from "../src/contract.js";
import { fixedRequirements } from "../src/requirements.js";
import { stableSeries } from "../src/convention.js";

it.each([
  {},
  { context: { projectDirectory: "D:\\project" } },
  { projectDirectory: "D:\\project", requirements: {} },
  { projectDirectory: "D:\\project", projectScopes: ["packages/a"] },
  { projectDirectory: "D:\\project", context: {} },
])("rejects obsolete or missing input %#", (value) => {
  expect(Value.Check(Input, value)).toBe(false);
});
it("has no mutable caller policy and uses SemVer-compatible freshness series", () => {
  const first = fixedRequirements();
  first.testing.coverage.minimum.lines = 1;
  expect(fixedRequirements().testing.coverage.minimum.lines).toBe(90);
  expect(stableSeries("6.0.3")).toBe("6.x");
  expect(stableSeries("0.34.0")).toBe("0.34.x");
  expect(stableSeries("0.0.7")).toBe("0.0.7");
});
