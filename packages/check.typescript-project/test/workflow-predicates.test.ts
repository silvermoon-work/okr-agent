import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { workflowPredicates } from "../assets/workflow-predicates.mjs";
import { dataYaml, record } from "../src/files.js";
import { workflow } from "./fixture.js";

interface Publisher {
  workflowMatrix(source: string): string[];
}
const publisher = (await import(
  new URL("../assets/npm-publish.mjs", import.meta.url).href
)) as Publisher;
const quality = () => dataYaml(workflow);
const job = (w: Record<string, unknown>, id = "check") =>
  record(record(w.jobs)[id]);
const steps = (w: Record<string, unknown>, id = "check") =>
  job(w, id).steps as Record<string, unknown>[];

it("Check and publisher share predicates, allowing extra names/jobs/metadata/benign steps and chosen timeout", () => {
  const w = quality();
  w.name = "Project quality";
  w.env = { GREETING: "hello", CI: "true" };
  w.metadata = { arbitrary: true };
  record(w.jobs).notify = {
    if: "failure()",
    "continue-on-error": true,
    env: { NODE_ENV: "notification-only" },
    steps: [{ run: "echo notify" }],
  };
  job(w)["timeout-minutes"] = 29;
  job(w).if = "${{ true }}";
  steps(w)[3]!.run = "pnpm install --prefer-offline --frozen-lockfile";
  job(w, "compatibility")["timeout-minutes"] = 360;
  steps(w).splice(3, 0, {
    name: "Metadata",
    run: "echo ready",
    if: "always()",
  });
  steps(w).push({
    uses: "actions/cache@v5",
    with: { path: ".turbo", key: "build-output" },
  });
  expect(workflowPredicates(w)).toEqual([]);
  expect(publisher.workflowMatrix(JSON.stringify(w))).toEqual([
    "22.15.0",
    "24.11.0",
  ]);
});

it.each([
  [
    "shell init override",
    (w: Record<string, unknown>) => {
      w.env = { BASH_ENV: "skip.sh" };
    },
  ],
  [
    "guard shell command injection",
    (w: Record<string, unknown>) => {
      const guard = steps(w, "release-verification")[0]!;
      guard.run = String(guard.run).replace(
        'echo "::error::Every required validation job and matrix must succeed."',
        "echo ok; exit 0",
      );
    },
  ],
  [
    "guard wrong shell",
    (w: Record<string, unknown>) => {
      steps(w, "release-verification")[0]!.shell = "pwsh";
    },
  ],
  [
    "missing cache",
    (w: Record<string, unknown>) => {
      delete record(steps(w)[2]!.with).cache;
    },
  ],
  [
    "missing timeout",
    (w: Record<string, unknown>) => {
      delete job(w)["timeout-minutes"];
    },
  ],
  [
    "invalid timeout",
    (w: Record<string, unknown>) => {
      job(w)["timeout-minutes"] = 361;
    },
  ],
  [
    "missing concurrency",
    (w: Record<string, unknown>) => {
      delete w.concurrency;
    },
  ],
  [
    "branch-only pending replacement",
    (w: Record<string, unknown>) => {
      w.concurrency = {
        group: "${{ github.workflow }}-${{ github.ref }}",
        "cancel-in-progress": false,
      };
    },
  ],
  [
    "masked check",
    (w: Record<string, unknown>) => {
      steps(w)[4]!["continue-on-error"] = true;
    },
  ],
  [
    "cache-hit install skip",
    (w: Record<string, unknown>) => {
      steps(w)[3]!.if = "steps.cache.outputs.cache-hit != 'true'";
    },
  ],
  [
    "job skip",
    (w: Record<string, unknown>) => {
      job(w).if = "false";
    },
  ],
  [
    "overriding Node env",
    (w: Record<string, unknown>) => {
      w.env = { NODE_OPTIONS: "--import malicious.mjs" };
    },
  ],
  [
    "working directory override",
    (w: Record<string, unknown>) => {
      job(w).defaults = { run: { "working-directory": "other" } };
    },
  ],
  [
    "aggregate mask",
    (w: Record<string, unknown>) => {
      job(w, "release-verification")["continue-on-error"] = true;
    },
  ],
  [
    "aggregate skip",
    (w: Record<string, unknown>) => {
      job(w, "release-verification").if = "success()";
    },
  ],
  [
    "filtered matrix",
    (w: Record<string, unknown>) => {
      record(record(job(w, "compatibility").strategy).matrix).exclude = [
        { "node-version": "22.15.0" },
      ];
    },
  ],
  [
    "duplicate cache",
    (w: Record<string, unknown>) => {
      record(steps(w)[1]!.with).cache = "pnpm";
    },
  ],
  [
    "checkout override",
    (w: Record<string, unknown>) => {
      steps(w)[0]!.with = { ref: "main" };
    },
  ],
])(
  "rejects applicable predicate violation consistently: %s",
  (_name, mutate) => {
    const w = quality();
    mutate(w);
    const failures = workflowPredicates(w);
    expect(failures.length).toBeGreaterThan(0);
    expect(
      failures.every((failure) => failure.brief.includes("observed")),
    ).toBe(true);
    expect(() => publisher.workflowMatrix(JSON.stringify(w))).toThrow(
      failures[0]!.brief,
    );
  },
);

it("accepts supported safe PR/main concurrency variants and alternative single cache", () => {
  const w = quality();
  w.concurrency = {
    group:
      "${{ github.event_name }}-${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
    "cancel-in-progress": true,
  };
  delete record(steps(w)[2]!.with).cache;
  record(steps(w)[1]!.with).cache = "pnpm";
  expect(workflowPredicates(w)).toEqual([]);
});
it("reports unsupported dynamic behavior only at the applicable predicate", () => {
  const w = quality();
  job(w)["timeout-minutes"] = "${{ inputs.timeout }}";
  const failures = workflowPredicates(w);
  expect(failures).toEqual([
    expect.objectContaining({
      status: "unconfirmed",
      brief: expect.stringContaining("jobs.check.timeout-minutes") as unknown,
    }),
  ]);
});
it.each([
  "node mutate-package-config.mjs",
  'echo "{}" > package.json',
  'echo "BASH_ENV=skip.sh" >> "$GITHUB_ENV"',
])("does not assume arbitrary extension effects are harmless: %s", (run) => {
  const w = quality();
  steps(w).splice(4, 0, { run });
  const failures = workflowPredicates(w);
  expect(
    failures.some(
      (failure) =>
        failure.status === "unconfirmed" &&
        failure.brief.includes("steps[4]") &&
        failure.brief.includes("extension effects"),
    ),
  ).toBe(true);
  expect(() => publisher.workflowMatrix(JSON.stringify(w))).toThrow(
    "extension effects",
  );
});
it("scopes extension effects before the required result, including the aggregate guard", () => {
  const w = quality();
  steps(w).push({ run: "node post-check-notify.mjs", if: "always()" });
  expect(workflowPredicates(w)).toEqual([]);
  steps(w, "release-verification").unshift({
    run: "node change-shell-init.mjs",
  });
  expect(
    workflowPredicates(w).some(
      (failure) =>
        failure.brief.includes("jobs.release-verification.steps[0]") &&
        failure.brief.includes("extension effects"),
    ),
  ).toBe(true);
});

it("publisher workflow permits benign extensions but protects publication condition and tokens", async () => {
  const w = record(
    parse(
      await readFile(
        new URL("../assets/npm-publish.yaml", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
  w.name = "custom publishing";
  record(w.jobs).notify = { steps: [{ run: "echo done" }] };
  const publish = job(w, "publish");
  publish["timeout-minutes"] = 42;
  expect(workflowPredicates(w, "publisher")).toEqual([]);
  (publish.steps as Record<string, unknown>[]).push({
    run: "node unknown-publish-extension.mjs",
  });
  expect(
    workflowPredicates(w, "publisher").some((f) =>
      f.brief.includes("verified publication/workspace"),
    ),
  ).toBe(true);
  (publish.steps as Record<string, unknown>[]).pop();
  (publish.steps as Record<string, unknown>[])[6]!.if = "always()";
  publish.env = {
    ...record(publish.env),
    NPM_TOKEN: "${{ secrets.NPM_TOKEN }}",
  };
  expect(
    workflowPredicates(w, "publisher").some((f) =>
      f.brief.includes("no stored"),
    ),
  ).toBe(true);
  expect(
    workflowPredicates(w, "publisher").some((f) =>
      f.brief.includes("execution condition"),
    ),
  ).toBe(true);
});
