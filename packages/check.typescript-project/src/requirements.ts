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

/** Internal policy, never derived from business input. */
export function fixedRequirements() {
  return {
    dependencyManagement: { enabled: true, lockfile: true },
    typescript: {
      enabled: true,
      declaredDependency: true,
      strict: true,
      safetyOptions: [...safetyOptions],
      includeSource: true,
      includeTests: true,
    },
    lint: {
      enabled: true,
      typeAware: true,
      includeSource: true,
      includeTests: true,
    },
    formatting: { enabled: true, checkOnly: true },
    testing: {
      enabled: true,
      nonWatch: true,
      failOnNoTests: true,
      coverage: {
        enabled: true,
        includeUntested: true,
        minimum: { branches: 90, functions: 90, lines: 90, statements: 90 },
      },
    },
    qualityGate: {
      enabled: true,
      capabilities: [...capabilities],
      propagateFailures: true,
    },
    ci: {
      enabled: true,
      pullRequest: true,
      mainPush: true,
      frozenInstall: true,
      qualityGate: true,
      coverage: true,
    },
  };
}
export type Requirements = ReturnType<typeof fixedRequirements>;
