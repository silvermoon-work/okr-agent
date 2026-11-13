import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { discover, plan } from "../scripts/lib/commands.mjs";

test("the real root gate keeps release regressions and script lint in its execution plan", () => {
  const projects = discover(resolve("."));
  const tasks = plan(projects, "check");
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
