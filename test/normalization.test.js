import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import test from "node:test";
import { discover, plan } from "../scripts/lib/commands.mjs";

test("the real root gate keeps release regressions and script lint in its execution plan", () => {
  const projects = discover(resolve("."));
  const tasks = plan(projects, "check");
  assert.equal(
    tasks.filter((task) => task.args.join(" ") === "run build").length,
    projects.filter(
      (project) => project.directory !== "." && project.manifest.scripts?.build,
    ).length,
  );
  assert.ok(
    !tasks.some(
      (task) => task.directory === "." && task.args.join(" ") === "run build",
    ),
  );
  const release = tasks.findIndex(
    (task) =>
      task.directory === "." && task.args.join(" ") === "run test-release",
  );
  const maintenance = tasks.findIndex(
    (task) =>
      task.directory === "." && task.args.join(" ") === "run check-scripts",
  );
  const coverage = tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.args.includes("--coverage.enabled=true"));
  assert.equal(
    coverage.length,
    projects.filter((project) => project.code).length,
  );
  assert.ok(coverage.every(({ index }) => index < release));
  assert.ok(maintenance > release);
  for (const project of projects.filter(
    (project) => project.manifest.private !== true,
  )) {
    assert.ok(
      tasks.some(
        (task) =>
          task.directory === project.directory &&
          task.args.join(" ") === "exec publint",
      ),
      `Missing package lint for ${project.manifest.name}`,
    );
  }
});
test("the publisher installs pnpm before setup-node initializes its pnpm cache", () => {
  const workflow = parse(
    readFileSync(".github/workflows/npm-publish.yaml", "utf8"),
  );
  const steps = workflow.jobs.publish.steps;
  const pnpm = steps.findIndex((step) => step.uses === "pnpm/action-setup@v4");
  const cache = steps.findIndex(
    (step) =>
      step.uses === "actions/setup-node@v4" && step.with?.cache === "pnpm",
  );
  assert.ok(pnpm >= 0 && cache > pnpm);
});
