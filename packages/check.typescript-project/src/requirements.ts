export const capabilities = [
  "typecheck",
  "lint",
  "formatting",
  "test",
  "coverage",
] as const;
export type Capability = (typeof capabilities)[number];
export const safetyOptions = [
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "noImplicitOverride",
  "noImplicitReturns",
  "noFallthroughCasesInSwitch",
] as const;
export const metrics = [
  "branches",
  "functions",
  "lines",
  "statements",
] as const;
type Enabled<T> = { enabled: false } | ({ enabled: true } & T);
export interface Requirements {
  dependencyManagement: Enabled<{
    manager: "pnpm";
    minimumVersion: string;
    lockfile: boolean;
  }>;
  typescript: Enabled<{
    declaredDependency: boolean;
    strict: boolean;
    safetyOptions: (typeof safetyOptions)[number][];
    includeSource: boolean;
    includeTests: boolean;
  }>;
  lint: Enabled<{
    typeAware: boolean;
    includeSource: boolean;
    includeTests: boolean;
  }>;
  formatting: Enabled<{ checkOnly: boolean }>;
  testing: Enabled<{
    nonWatch: boolean;
    failOnNoTests: boolean;
    coverage: Enabled<{
      includeUntested: boolean;
      minimum: Record<(typeof metrics)[number], number>;
    }>;
  }>;
  qualityGate: Enabled<{
    capabilities: Capability[];
    propagateFailures: boolean;
  }>;
  ci: Enabled<{
    pullRequest: boolean;
    mainPush: boolean;
    frozenInstall: boolean;
    qualityGate: boolean;
    coverage: boolean;
  }>;
}
export interface RequirementsError {
  path: string;
  reason: string;
}
export type NormalizeResult =
  | { ok: true; requirements: Requirements }
  | { ok: false; error: RequirementsError };

class Invalid extends Error {
  constructor(readonly detail: RequirementsError) {
    super(`${detail.path}: ${detail.reason}`);
  }
}
function invalid(path: string, reason: string): never {
  throw new Invalid({ path, reason });
}
function object(value: unknown, path: string, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(path, "expected an object");
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    invalid(path, "expected a plain data object");
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  ))
    if (!("value" in descriptor))
      invalid(`${path}.${key}`, "accessor properties are unsupported");
  if (Object.getOwnPropertySymbols(value).length)
    invalid(path, "symbol fields are unsupported");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!fields.includes(key)) invalid(`${path}.${key}`, "unknown field");
  return result;
}
function bool(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") invalid(path, "expected a boolean");
  return value;
}
function strings<T extends string>(
  value: unknown,
  fallback: readonly T[],
  allowed: readonly T[],
  path: string,
): T[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || !value.length)
    invalid(path, "expected a nonempty array");
  const result: T[] = [];
  for (const [i, item] of value.entries()) {
    if (typeof item !== "string" || !allowed.includes(item as T))
      invalid(`${path}[${i}]`, "unsupported value");
    if (result.includes(item as T)) invalid(`${path}[${i}]`, "duplicate value");
    result.push(item as T);
  }
  return result;
}
function domain<T>(
  value: unknown,
  path: string,
  fields: string[],
  active: (raw: Record<string, unknown>) => T,
): Enabled<T> {
  const raw = object(value === undefined ? {} : value, path, [
    "enabled",
    ...fields,
  ]);
  const enabled = bool(raw.enabled, true, `${path}.enabled`);
  if (!enabled) {
    if (Object.keys(raw).some((key) => key !== "enabled"))
      invalid(path, "disabled domain permits only enabled");
    return { enabled: false };
  }
  return { enabled: true, ...active(raw) };
}
export function normalizeRequirements(input: unknown): NormalizeResult {
  try {
    const raw = object(input === undefined ? {} : input, "requirements", [
      "dependencyManagement",
      "typescript",
      "lint",
      "formatting",
      "testing",
      "qualityGate",
      "ci",
    ]);
    const dependencyManagement = domain(
      raw.dependencyManagement,
      "requirements.dependencyManagement",
      ["manager", "minimumVersion", "lockfile"],
      (r) => {
        if (r.manager !== undefined && r.manager !== "pnpm")
          invalid(
            "requirements.dependencyManagement.manager",
            "only pnpm is supported",
          );
        const minimumVersion =
          r.minimumVersion === undefined ? "11.22.0" : r.minimumVersion;
        if (
          typeof minimumVersion !== "string" ||
          !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(minimumVersion) ||
          minimumVersion
            .split(".")
            .some((v) => !Number.isSafeInteger(Number(v)))
        )
          invalid(
            "requirements.dependencyManagement.minimumVersion",
            "expected an exact major.minor.patch version",
          );
        return {
          manager: "pnpm" as const,
          minimumVersion,
          lockfile: bool(
            r.lockfile,
            true,
            "requirements.dependencyManagement.lockfile",
          ),
        };
      },
    );
    const typescript = domain(
      raw.typescript,
      "requirements.typescript",
      [
        "declaredDependency",
        "strict",
        "safetyOptions",
        "includeSource",
        "includeTests",
      ],
      (r) => ({
        declaredDependency: bool(
          r.declaredDependency,
          true,
          "requirements.typescript.declaredDependency",
        ),
        strict: bool(r.strict, true, "requirements.typescript.strict"),
        safetyOptions: strings(
          r.safetyOptions,
          safetyOptions,
          safetyOptions,
          "requirements.typescript.safetyOptions",
        ),
        includeSource: bool(
          r.includeSource,
          true,
          "requirements.typescript.includeSource",
        ),
        includeTests: bool(
          r.includeTests,
          true,
          "requirements.typescript.includeTests",
        ),
      }),
    );
    const lint = domain(
      raw.lint,
      "requirements.lint",
      ["typeAware", "includeSource", "includeTests"],
      (r) => ({
        typeAware: bool(r.typeAware, true, "requirements.lint.typeAware"),
        includeSource: bool(
          r.includeSource,
          true,
          "requirements.lint.includeSource",
        ),
        includeTests: bool(
          r.includeTests,
          true,
          "requirements.lint.includeTests",
        ),
      }),
    );
    const formatting = domain(
      raw.formatting,
      "requirements.formatting",
      ["checkOnly"],
      (r) => ({
        checkOnly: bool(r.checkOnly, true, "requirements.formatting.checkOnly"),
      }),
    );
    const testing = domain(
      raw.testing,
      "requirements.testing",
      ["nonWatch", "failOnNoTests", "coverage"],
      (r) => ({
        nonWatch: bool(r.nonWatch, true, "requirements.testing.nonWatch"),
        failOnNoTests: bool(
          r.failOnNoTests,
          true,
          "requirements.testing.failOnNoTests",
        ),
        coverage: domain(
          r.coverage,
          "requirements.testing.coverage",
          ["includeUntested", "minimum"],
          (c) => {
            const min = object(
              c.minimum === undefined ? {} : c.minimum,
              "requirements.testing.coverage.minimum",
              [...metrics],
            );
            const minimum = {} as Record<(typeof metrics)[number], number>;
            for (const metric of metrics) {
              const value = min[metric] === undefined ? 90 : min[metric];
              if (
                typeof value !== "number" ||
                !Number.isFinite(value) ||
                value < 0 ||
                value > 100
              )
                invalid(
                  `requirements.testing.coverage.minimum.${metric}`,
                  "expected a finite number in 0..100",
                );
              minimum[metric] = value;
            }
            return {
              includeUntested: bool(
                c.includeUntested,
                true,
                "requirements.testing.coverage.includeUntested",
              ),
              minimum,
            };
          },
        ),
      }),
    );
    const available: Capability[] = [];
    if (typescript.enabled) available.push("typecheck");
    if (lint.enabled) available.push("lint");
    if (formatting.enabled) available.push("formatting");
    if (testing.enabled) {
      available.push("test");
      if (testing.coverage.enabled) available.push("coverage");
    }
    const qualityGate = domain(
      raw.qualityGate,
      "requirements.qualityGate",
      ["capabilities", "propagateFailures"],
      (r) => {
        const selected =
          r.capabilities === undefined
            ? [...available]
            : strings(
                r.capabilities,
                available,
                capabilities,
                "requirements.qualityGate.capabilities",
              );
        if (selected.some((c) => !available.includes(c)))
          invalid(
            "requirements.qualityGate.capabilities",
            "references a disabled capability",
          );
        return {
          capabilities: selected,
          propagateFailures: bool(
            r.propagateFailures,
            true,
            "requirements.qualityGate.propagateFailures",
          ),
        };
      },
    );
    const ci = domain(
      raw.ci,
      "requirements.ci",
      ["pullRequest", "mainPush", "frozenInstall", "qualityGate", "coverage"],
      (r) => {
        const gate = bool(
          r.qualityGate,
          qualityGate.enabled,
          "requirements.ci.qualityGate",
        );
        const coverage = bool(
          r.coverage,
          available.includes("coverage"),
          "requirements.ci.coverage",
        );
        if (gate && !qualityGate.enabled)
          invalid("requirements.ci.qualityGate", "qualityGate is disabled");
        if (coverage && !available.includes("coverage"))
          invalid("requirements.ci.coverage", "coverage is disabled");
        return {
          pullRequest: bool(r.pullRequest, true, "requirements.ci.pullRequest"),
          mainPush: bool(r.mainPush, true, "requirements.ci.mainPush"),
          frozenInstall: bool(
            r.frozenInstall,
            true,
            "requirements.ci.frozenInstall",
          ),
          qualityGate: gate,
          coverage,
        };
      },
    );
    return {
      ok: true,
      requirements: {
        dependencyManagement,
        typescript,
        lint,
        formatting,
        testing,
        qualityGate,
        ci,
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.detail };
    throw error;
  }
}
