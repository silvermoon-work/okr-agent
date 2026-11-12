import { expect, it } from "vitest";
import { normalizeRequirements } from "../src/requirements.js";

it("normalizes defaults and partial thresholds without mutating caller data", () => {
  expect(normalizeRequirements(undefined)).toEqual(normalizeRequirements({}));
  const input = Object.freeze({
    testing: Object.freeze({
      coverage: Object.freeze({ minimum: Object.freeze({ branches: 80.5 }) }),
    }),
  });
  const result = normalizeRequirements(input);
  expect(result.ok).toBe(true);
  if (
    !result.ok ||
    !result.requirements.testing.enabled ||
    !result.requirements.testing.coverage.enabled
  )
    throw new Error("expected coverage");
  expect(result.requirements.testing.coverage.minimum).toEqual({
    branches: 80.5,
    functions: 90,
    lines: 90,
    statements: 90,
  });
});
it("derives gates from enabled domains, removes disabled rules, and treats false as relaxation", () => {
  const result = normalizeRequirements({
    lint: { enabled: false },
    testing: { coverage: { enabled: false } },
    typescript: { strict: false },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected normalized requirements");
  expect(result.requirements.lint).toEqual({ enabled: false });
  expect(result.requirements.qualityGate).toEqual({
    enabled: true,
    capabilities: ["typecheck", "formatting", "test"],
    propagateFailures: true,
  });
  expect(result.requirements.ci).toMatchObject({ coverage: false });
});
it.each([
  [null, "requirements"],
  [[], "requirements"],
  [{ unknown: true }, "requirements.unknown"],
  [{ ci: null }, "requirements.ci"],
  [{ ci: { enabled: "false" } }, "requirements.ci.enabled"],
  [{ ci: { enabled: false, mainPush: false } }, "requirements.ci"],
  [
    { testing: { coverage: { minimum: { lines: "90" } } } },
    "requirements.testing.coverage.minimum.lines",
  ],
  [
    { testing: { coverage: { minimum: { lines: Infinity } } } },
    "requirements.testing.coverage.minimum.lines",
  ],
  [
    { testing: { coverage: { minimum: { lines: NaN } } } },
    "requirements.testing.coverage.minimum.lines",
  ],
  [
    { testing: { coverage: { minimum: { lines: -1 } } } },
    "requirements.testing.coverage.minimum.lines",
  ],
  [
    { testing: { coverage: { minimum: { lines: 101 } } } },
    "requirements.testing.coverage.minimum.lines",
  ],
  [
    { qualityGate: { capabilities: [] } },
    "requirements.qualityGate.capabilities",
  ],
  [
    { qualityGate: { capabilities: ["lint", "lint"] } },
    "requirements.qualityGate.capabilities[1]",
  ],
  [
    { qualityGate: { capabilities: ["build"] } },
    "requirements.qualityGate.capabilities[0]",
  ],
  [
    { lint: { enabled: false }, qualityGate: { capabilities: ["lint"] } },
    "requirements.qualityGate.capabilities",
  ],
  [
    { testing: { coverage: { enabled: false } }, ci: { coverage: true } },
    "requirements.ci.coverage",
  ],
  [
    { qualityGate: { enabled: false }, ci: { qualityGate: true } },
    "requirements.ci.qualityGate",
  ],
  [
    { typescript: { safetyOptions: [] } },
    "requirements.typescript.safetyOptions",
  ],
  [
    { dependencyManagement: { minimumVersion: "11.22" } },
    "requirements.dependencyManagement.minimumVersion",
  ],
  [
    { dependencyManagement: { minimumVersion: null } },
    "requirements.dependencyManagement.minimumVersion",
  ],
])("rejects malformed or contradictory requirements %#", (input, path) => {
  expect(normalizeRequirements(input)).toMatchObject({
    ok: false,
    error: { path },
  });
});
it("replaces arrays and never invokes accessor fields", () => {
  const normalized = normalizeRequirements({
    qualityGate: { capabilities: ["lint"] },
  });
  expect(normalized).toMatchObject({
    ok: true,
    requirements: { qualityGate: { capabilities: ["lint"] } },
  });
  let read = false;
  const value = Object.defineProperty({}, "ci", {
    get() {
      read = true;
      return {};
    },
    enumerable: true,
  });
  expect(normalizeRequirements(value)).toMatchObject({
    ok: false,
    error: { path: "requirements.ci" },
  });
  expect(read).toBe(false);
  for (const lines of [0, 100, 89.99])
    expect(
      normalizeRequirements({ testing: { coverage: { minimum: { lines } } } })
        .ok,
    ).toBe(true);
});
