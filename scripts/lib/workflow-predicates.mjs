// Pure, author-owned predicates shared by Check and the trusted publisher.
import { valid, prerelease } from "semver";

export function isNodeVersions(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 8 &&
    new Set(value).size === value.length &&
    value.every(
      (node) =>
        typeof node === "string" && valid(node) === node && !prerelease(node),
    )
  );
}

const obj = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const expression = (value) =>
  typeof value === "string"
    ? value.replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, "").trim()
    : value;
const show = (value) => JSON.stringify(value) ?? "undeclared";
const unconditional = (value) =>
  value === undefined ||
  value === true ||
  ["true", "success()", "always()"].includes(expression(value));
const conditionalStatus = (value) =>
  value === false || expression(value) === "false" ? "mismatch" : "unconfirmed";

export function workflowPredicates(workflow, kind = "quality", native = []) {
  const failures = [];
  const fail = (path, predicate, value, status = "mismatch") =>
    failures.push({
      status,
      brief: `${path}: ${predicate}; observed ${show(value)}`,
    });
  const expect = (condition, path, predicate, value, status) => {
    if (!condition) fail(path, predicate, value, status);
  };
  const timeout = (job, path) =>
    expect(
      Number.isInteger(job["timeout-minutes"]) &&
        job["timeout-minutes"] > 0 &&
        job["timeout-minutes"] <= 360,
      `${path}.timeout-minutes`,
      "explicit positive integer timeout in 1..360",
      job["timeout-minutes"],
      typeof job["timeout-minutes"] === "string" &&
        job["timeout-minutes"].includes("${{")
        ? "unconfirmed"
        : "mismatch",
    );
  const concurrency = (value, path) => {
    const c = obj(value);
    const group = c.group;
    // Every main run has a distinct group, including pending runs. PR groups
    // share only within the same workflow/event/PR.
    const terms =
      typeof group === "string"
        ? [...group.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)].map((m) => m[1])
        : [];
    expect(
      terms.length === 3 &&
        terms.includes("github.workflow") &&
        terms.includes("github.event_name") &&
        terms.some((term) =>
          [
            "github.event.pull_request.number || github.run_id",
            "github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id",
          ].includes(term),
        ),
      `${path}.group`,
      "workflow/event/PR isolation and unique main run_id (pending replacement also matters)",
      group,
      typeof group === "string" && group.includes("${{")
        ? terms.every((term) =>
            [
              "github.workflow",
              "github.event_name",
              "github.ref",
              "github.ref_name",
              "github.run_id",
            ].includes(term),
          )
          ? "mismatch"
          : "unconfirmed"
        : "mismatch",
    );
    expect(
      c["cancel-in-progress"] === true ||
        expression(c["cancel-in-progress"]) ===
          "github.event_name == 'pull_request'",
      `${path}.cancel-in-progress`,
      "outdated same-PR runs cancel",
      c["cancel-in-progress"],
    );
  };
  const triggers = () => {
    const on = workflow.on;
    const events = Array.isArray(on)
      ? Object.fromEntries(on.map((event) => [event, null]))
      : typeof on === "string"
        ? { [on]: null }
        : obj(on);
    for (const event of ["push", "pull_request"]) {
      expect(
        Object.hasOwn(events, event),
        `on.${event}`,
        "automatic main push and full PR coverage",
        events[event],
      );
      const trigger = obj(events[event]);
      for (const field of ["paths", "paths-ignore", "branches-ignore"])
        if (trigger[field] !== undefined)
          fail(
            `on.${event}.${field}`,
            "full coverage cannot be proved from filters",
            trigger[field],
            "unconfirmed",
          );
      if (trigger.branches !== undefined)
        expect(
          Array.isArray(trigger.branches) &&
            (event === "push"
              ? trigger.branches.some((b) => ["main", "*", "**"].includes(b))
              : trigger.branches.some((b) => ["*", "**"].includes(b))) &&
            !trigger.branches.some(
              (b) => typeof b !== "string" || b.startsWith("!"),
            ),
          `on.${event}.branches`,
          "main push / all PR branches covered",
          trigger.branches,
          "unconfirmed",
        );
      if (
        event === "push" &&
        trigger.tags !== undefined &&
        trigger.branches === undefined
      )
        fail("on.push", "tags-only push does not cover main", trigger);
      if (event === "pull_request" && trigger.types !== undefined)
        expect(
          Array.isArray(trigger.types) &&
            ["opened", "synchronize", "reopened"].every((type) =>
              trigger.types.includes(type),
            ),
          "on.pull_request.types",
          "all default PR lifecycle events covered",
          trigger.types,
        );
    }
    if (kind === "native")
      expect(
        Object.hasOwn(events, "workflow_dispatch"),
        "on.workflow_dispatch",
        "manual native compatibility also available",
        events,
      );
  };
  const environment = (value, path) => {
    if (
      value !== undefined &&
      (typeof value !== "object" || value === null || Array.isArray(value))
    )
      fail(
        path,
        "required environment overrides cannot be proved from dynamic/non-object env",
        value,
        "unconfirmed",
      );
    for (const [key, entry] of Object.entries(obj(value)))
      if (
        /^(?:CI|PATH|NODE_OPTIONS|NODE_PATH|NODE_ENV|BASH_ENV|ENV|SHELLOPTS|PNPM_.*|COREPACK_.*|npm_config_.*|NPM_CONFIG_.*|GITHUB_ENV|GITHUB_PATH|NODE_AUTH_TOKEN|NPM_TOKEN)$/.test(
          key,
        ) &&
        !(key === "CI" && (entry === true || entry === "true"))
      )
        fail(
          `${path}.${key}`,
          "required tool/install/check behavior must not be overridden",
          entry,
          "unconfirmed",
        );
  };
  const scope = (job, path, aggregate = false) => {
    timeout(job, path);
    if (kind !== "publisher") {
      const permissions = job.permissions ?? workflow.permissions;
      expect(
        obj(permissions).contents === "read",
        `${path}.permissions.contents`,
        "required checkout with least-privilege contents: read",
        permissions,
      );
    }
    if (!aggregate && !unconditional(job.if))
      fail(
        `${path}.if`,
        "required job must not be skipped",
        job.if,
        conditionalStatus(job.if),
      );
    if (
      job["continue-on-error"] !== undefined &&
      job["continue-on-error"] !== false
    )
      fail(
        `${path}.continue-on-error`,
        "required failure must propagate",
        job["continue-on-error"],
        job["continue-on-error"] === true ? "mismatch" : "unconfirmed",
      );
    if (!aggregate && job.needs !== undefined)
      fail(
        `${path}.needs`,
        "required job cannot depend on potentially skipped extension jobs",
        job.needs,
        "unconfirmed",
      );
    if (job.uses !== undefined)
      fail(
        `${path}.uses`,
        "required local steps must be provable",
        job.uses,
        "unconfirmed",
      );
    if (job.container !== undefined)
      fail(
        `${path}.container`,
        "required runtime semantics not proved for container",
        job.container,
        "unconfirmed",
      );
    environment(workflow.env, "env");
    environment(job.env, `${path}.env`);
    for (const [value, source] of [
      [workflow.defaults, "defaults"],
      [job.defaults, `${path}.defaults`],
    ]) {
      const run = obj(obj(value).run);
      for (const key of ["shell", "working-directory"])
        if (
          run[key] !== undefined &&
          !(key === "working-directory" && run[key] === ".") &&
          !(key === "shell" && ["bash", "sh"].includes(run[key]))
        )
          fail(
            `${source}.run.${key}`,
            "required command execution semantics",
            run[key],
            "unconfirmed",
          );
    }
    if (job.concurrency !== undefined)
      if (kind !== "publisher") {
        concurrency(job.concurrency, `${path}.concurrency`);
        expect(
          obj(job.concurrency).group !== obj(workflow.concurrency).group &&
            !Object.entries(obj(workflow.jobs)).some(
              ([id, raw]) =>
                `jobs.${id}` !== path &&
                obj(obj(raw).concurrency).group === obj(job.concurrency).group,
            ),
          `${path}.concurrency.group`,
          "required jobs must not cancel their workflow or sibling jobs",
          obj(job.concurrency).group,
        );
      }
  };
  const stepScope = (step, path, conditional) => {
    if (
      conditional === undefined
        ? !unconditional(step.if)
        : expression(step.if) !== conditional
    )
      fail(
        `${path}.if`,
        "required step execution condition",
        step.if,
        conditionalStatus(step.if),
      );
    if (
      step["continue-on-error"] !== undefined &&
      step["continue-on-error"] !== false
    )
      fail(
        `${path}.continue-on-error`,
        "required step failure must propagate",
        step["continue-on-error"],
        step["continue-on-error"] === true ? "mismatch" : "unconfirmed",
      );
    environment(step.env, `${path}.env`);
    if (
      step["working-directory"] !== undefined &&
      step["working-directory"] !== "."
    )
      fail(
        `${path}.working-directory`,
        "required command executes at repository root",
        step["working-directory"],
        "unconfirmed",
      );
    if (
      step.shell !== undefined &&
      !["bash", "sh", "pwsh"].includes(step.shell)
    )
      fail(
        `${path}.shell`,
        "supported command shell",
        step.shell,
        "unconfirmed",
      );
  };
  const extensionEffects = (
    job,
    path,
    required,
    limit,
    publication = false,
  ) => {
    const steps = Array.isArray(job.steps) ? job.steps : [];
    for (let i = 0; i < steps.length; i++) {
      if (required.has(i) || (!publication && i > limit)) continue;
      const step = obj(steps[i]);
      const source = `${path}.steps[${i}]`;
      const benign =
        typeof step.run === "string" &&
        !step.run.includes("${{") &&
        /^echo(?:\s+(?:[A-Za-z0-9_./:-]+|'[^'\\\r\n]*'|"[^"\\$`\r\n]*"))*\s*$/.test(
          step.run.trim(),
        ) &&
        (step.shell === undefined ||
          ["bash", "sh", "pwsh"].includes(step.shell));
      if (benign) environment(step.env, `${source}.env`);
      else if (step.run !== undefined || step.uses !== undefined)
        fail(
          source,
          publication
            ? "extension effects on verified publication/workspace cannot be proved; only literal logging extensions are supported in this protected job"
            : "extension effects on subsequent required command inputs/configuration/environment cannot be proved; only literal logging extensions are supported before the required result",
          step.run ?? step.uses,
          "unconfirmed",
        );
    }
  };
  const setup = (job, path, node, commands, publisher = false) => {
    scope(job, path);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    let checkout = -1,
      selectedNode = -1,
      pnpm = -1,
      caches = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = obj(steps[i]);
      const p = `${path}.steps[${i}]`;
      const settings = obj(step.with);
      if (
        typeof step.uses === "string" &&
        /^(?:actions\/checkout|actions\/setup-node|pnpm\/action-setup)@/.test(
          step.uses,
        )
      ) {
        stepScope(step, p);
        if (step.uses.startsWith("actions/checkout@")) {
          expect(
            step.uses === "actions/checkout@v7",
            `${p}.uses`,
            "approved pinned actions/checkout@v7",
            step.uses,
          );
          checkout = i;
          for (const key of [
            "ref",
            "repository",
            "path",
            "sparse-checkout",
            "sparse-checkout-cone-mode",
          ])
            if (settings[key] !== undefined)
              fail(
                `${p}.with.${key}`,
                "checkout must supply the full current repository",
                settings[key],
                "unconfirmed",
              );
          if (publisher) {
            expect(
              settings["fetch-depth"] === 0,
              `${p}.with.fetch-depth`,
              "full history for exact main ancestry",
              settings["fetch-depth"],
            );
            expect(
              settings["persist-credentials"] === false,
              `${p}.with.persist-credentials`,
              "no persisted GitHub credentials",
              settings["persist-credentials"],
            );
          }
        } else if (step.uses.startsWith("actions/setup-node@")) {
          expect(
            step.uses === "actions/setup-node@v7",
            `${p}.uses`,
            "approved pinned setup-node@v7",
            step.uses,
          );
          selectedNode = i;
          expect(
            node === ".node-version"
              ? settings["node-version-file"] === node &&
                  settings["node-version"] === undefined
              : settings["node-version"] === node &&
                  settings["node-version-file"] === undefined,
            `${p}.with`,
            "declared project/matrix Node selection without override",
            settings,
          );
          if (settings.cache === "pnpm") caches++;
        } else {
          expect(
            step.uses === "pnpm/action-setup@v6",
            `${p}.uses`,
            "approved pinned pnpm/action-setup@v6",
            step.uses,
          );
          pnpm = i;
          expect(
            settings.version === undefined &&
              (settings.package_json_file === undefined ||
                settings.package_json_file === "package.json") &&
              (settings.run_install === undefined ||
                settings.run_install === false),
            `${p}.with`,
            "root packageManager and no implicit non-frozen install",
            settings,
          );
          if (settings.cache === true) caches++;
        }
      }
      if (
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/cache@")
      ) {
        const cachePath = settings.path;
        const unrelated =
          typeof cachePath === "string" &&
          cachePath
            .split(/\r?\n/)
            .every(
              (entry) =>
                /^[a-zA-Z0-9_./-]+$/.test(entry) &&
                !entry.startsWith("/") &&
                !entry.split("/").includes("..") &&
                !/pnpm|store/i.test(entry),
            );
        if (!unrelated)
          fail(
            `${p}.uses`,
            "pnpm store must use one cache system; cannot prove this additional cache is unrelated",
            cachePath,
            "unconfirmed",
          );
      }
      if (
        typeof step.run === "string" &&
        /\bGITHUB_(?:ENV|PATH)\b|::(?:set-env|add-path)::/.test(step.run)
      )
        fail(
          `${p}.run`,
          "extension step must not mutate required process environment/tool path",
          step.run,
          "unconfirmed",
        );
    }
    expect(
      checkout >= 0 && selectedNode > checkout && pnpm > checkout,
      path,
      "checkout before project Node and pnpm selection",
      job.steps,
    );
    expect(
      caches === 1,
      `${path}.steps`,
      "exactly one enabled pnpm store cache; cache hits never skip install/check",
      caches,
    );
    let previous = Math.max(checkout, selectedNode, pnpm);
    let complete = true;
    const required = new Set([checkout, selectedNode, pnpm]);
    for (const [command, condition] of commands) {
      const index = steps.findIndex((raw, i) => {
        const run = obj(raw).run;
        return (
          i > previous &&
          typeof run === "string" &&
          (run.trim() === command ||
            (command === "pnpm check" && run.trim() === "pnpm run check") ||
            (command === "pnpm install --frozen-lockfile" &&
              /^pnpm install (?:--(?:frozen-lockfile|prefer-offline|silent|reporter=(?:append-only|default|ndjson|silent))(?:\s+|$))+$/.test(
                run.trim(),
              ) &&
              run.split(/\s+/).includes("--frozen-lockfile")))
        );
      });
      expect(
        index >= 0,
        `${path}.steps.run`,
        `unconditional ordered ${command}`,
        steps.map((s) => obj(s).run),
      );
      if (index >= 0) {
        required.add(index);
        stepScope(obj(steps[index]), `${path}.steps[${index}]`, condition);
        previous = index;
      } else complete = false;
    }
    if (complete) extensionEffects(job, path, required, previous, publisher);
  };
  const jobs = obj(workflow.jobs);
  if (kind === "publisher") {
    const events = obj(workflow.on);
    expect(
      Array.isArray(obj(events.push).tags) &&
        obj(events.push).tags.includes("*-v*"),
      "on.push.tags",
      "package-id version release tags covered",
      events.push,
    );
    expect(
      obj(obj(obj(events.workflow_dispatch).inputs).package).required ===
        true &&
        obj(obj(obj(events.workflow_dispatch).inputs).package).type ===
          "string",
      "on.workflow_dispatch.inputs.package",
      "explicit single package dry-run input",
      events.workflow_dispatch,
    );
    expect(
      !Object.keys(events).some(
        (event) => !["push", "workflow_dispatch"].includes(event),
      ),
      "on",
      "publication only on tag push; manual runs dry-run only",
      events,
    );
    const job = obj(jobs.publish);
    const publishingConcurrency = obj(job.concurrency ?? workflow.concurrency);
    expect(
      typeof publishingConcurrency.group === "string" &&
        /\$\{\{\s*github\.ref\s*\}\}/.test(publishingConcurrency.group) &&
        publishingConcurrency["cancel-in-progress"] === false,
      "concurrency",
      "serialize immutable release tags without cancelling active publication",
      publishingConcurrency,
    );
    expect(
      job.environment === "npm" || obj(job.environment).name === "npm",
      "jobs.publish.environment",
      "protected npm OIDC environment",
      job.environment,
    );
    for (const [key, value] of [
      ["contents", "read"],
      ["actions", "read"],
      ["id-token", "write"],
    ])
      expect(
        obj(job.permissions)[key] === value,
        `jobs.publish.permissions.${key}`,
        "trusted publishing and exact CI access",
        obj(job.permissions)[key],
      );
    expect(
      expression(obj(job.env).GITHUB_TOKEN) === "github.token" &&
        expression(obj(job.env).PACKAGE_INPUT) === "inputs.package",
      "jobs.publish.env",
      "ephemeral GitHub token and explicit package input",
      job.env,
    );
    for (const [key, value] of Object.entries({
      ...obj(workflow.env),
      ...obj(job.env),
    }))
      if (/TOKEN|AUTH/i.test(key) && key !== "GITHUB_TOKEN")
        fail(`jobs.publish.env.${key}`, "no stored publishing token", value);
    setup(
      job,
      "jobs.publish",
      ".node-version",
      [
        ["pnpm install --frozen-lockfile"],
        ["npm install --global npm@11.21.0"],
        ["pnpm release", "github.event_name == 'push'"],
        ["pnpm release-dry-run", "github.event_name == 'workflow_dispatch'"],
      ],
      true,
    );
    for (const [name, raw] of Object.entries(jobs))
      for (const [i, rawStep] of (Array.isArray(obj(raw).steps)
        ? obj(raw).steps
        : []
      ).entries()) {
        const step = obj(rawStep);
        if (
          typeof step.run === "string" &&
          /\b(?:pnpm release|npm publish)\b/.test(step.run) &&
          !(
            name === "publish" &&
            ["pnpm release", "pnpm release-dry-run"].includes(step.run.trim())
          )
        )
          fail(
            `jobs.${name}.steps[${i}].run`,
            "all publication calls must use protected verified release entry",
            step.run,
            "unconfirmed",
          );
      }
    return failures;
  }
  triggers();
  concurrency(workflow.concurrency, "concurrency");
  if (kind === "native") {
    for (const name of native) {
      const platforms = new Set();
      for (const [id, raw] of Object.entries(jobs)) {
        const job = obj(raw);
        if (
          !Array.isArray(job.steps) ||
          !job.steps.some(
            (step) => obj(step).run === `pnpm --filter ${name} native-test`,
          )
        )
          continue;
        const matrix = obj(obj(job.strategy).matrix);
        const os =
          job["runs-on"] === "${{ matrix.os }}" ? matrix.os : [job["runs-on"]];
        expect(
          Array.isArray(os) &&
            os.every(
              (value) => typeof value === "string" && !value.includes("${{"),
            ),
          `jobs.${id}.runs-on`,
          "finite native operating-system coverage",
          os,
          "unconfirmed",
        );
        if (Array.isArray(os))
          for (const platform of os) platforms.add(platform);
        for (const [axis, values] of Object.entries(matrix))
          expect(
            !["include", "exclude"].includes(axis) &&
              Array.isArray(values) &&
              values.length > 0 &&
              values.every(
                (value) => typeof value === "string" && !value.includes("${{"),
              ),
            `jobs.${id}.strategy.matrix.${axis}`,
            "complete finite native matrix without filtered/dynamic entries",
            values,
            "unconfirmed",
          );
        setup(job, `jobs.${id}`, ".node-version", [
          ["pnpm install --frozen-lockfile"],
          [`pnpm --filter ${name}... build`],
          [`pnpm --filter ${name} native-test`],
          [`pnpm --filter ${name} smoke`],
        ]);
      }
      expect(
        ["ubuntu-latest", "windows-latest"].every((os) => platforms.has(os)),
        "jobs.native",
        "complete Ubuntu and Windows native execution",
        [...platforms],
      );
    }
    return failures;
  }
  for (const [id, name, node] of [
    ["check", "Quality default", ".node-version"],
    [
      "compatibility",
      "Node.js ${{ matrix.node-version }}",
      "${{ matrix.node-version }}",
    ],
  ]) {
    const job = obj(jobs[id]);
    expect(
      id === "compatibility"
        ? /^Node\.js \$\{\{\s*matrix\.node-version\s*\}\}$/.test(job.name ?? "")
        : job.name === name,
      `jobs.${id}.name`,
      "stable publisher required-check identity",
      job.name,
    );
    expect(
      job["runs-on"] === "ubuntu-latest",
      `jobs.${id}.runs-on`,
      "supported quality execution runtime",
      job["runs-on"],
      "unconfirmed",
    );
    if (id === "check" && job.strategy !== undefined)
      fail(
        `jobs.${id}.strategy`,
        "single default quality identity",
        job.strategy,
        "unconfirmed",
      );
    setup(job, `jobs.${id}`, node, [
      ["pnpm install --frozen-lockfile"],
      ["pnpm check"],
    ]);
  }
  const matrix = obj(obj(obj(jobs.compatibility).strategy).matrix);
  expect(
    isNodeVersions(matrix["node-version"]),
    "jobs.compatibility.strategy.matrix.node-version",
    "2..8 unique exact stable Node versions",
    matrix["node-version"],
    typeof matrix["node-version"] === "string" &&
      matrix["node-version"].includes("${{")
      ? "unconfirmed"
      : "mismatch",
  );
  for (const key of Object.keys(matrix))
    if (key !== "node-version")
      fail(
        `jobs.compatibility.strategy.matrix.${key}`,
        "publisher identities require one complete Node axis (additional job matrices are free)",
        matrix[key],
        "unconfirmed",
      );
  const aggregate = obj(jobs["release-verification"]);
  scope(aggregate, "jobs.release-verification", true);
  expect(
    aggregate["runs-on"] === "ubuntu-latest",
    "jobs.release-verification.runs-on",
    "supported bash failure guard runtime",
    aggregate["runs-on"],
    "unconfirmed",
  );
  expect(
    aggregate.name === "Release verification (v1)",
    "jobs.release-verification.name",
    "stable versioned publisher aggregate identity",
    aggregate.name,
  );
  expect(
    Array.isArray(aggregate.needs) &&
      ["check", "compatibility"].every((id) => aggregate.needs.includes(id)),
    "jobs.release-verification.needs",
    "complete required job/matrix failure propagation",
    aggregate.needs,
  );
  expect(
    expression(aggregate.if) === "always()",
    "jobs.release-verification.if",
    "aggregate runs even after dependency failure/skip",
    aggregate.if,
  );
  const guard = (Array.isArray(aggregate.steps) ? aggregate.steps : []).find(
    (raw) => {
      const step = obj(raw);
      return (
        typeof step.run === "string" &&
        /^if \[ "\$CHECK_RESULT" != success \] \|\| \[ "\$COMPATIBILITY_RESULT" != success \]; then\n(?: {2}echo "[^"\\$`]*"\n)? {2}exit 1\nfi\s*$/.test(
          step.run,
        )
      );
    },
  );
  expect(
    guard !== undefined,
    "jobs.release-verification.steps",
    "literal guard fails unless both required results are success",
    aggregate.steps,
    "unconfirmed",
  );
  if (guard) {
    stepScope(obj(guard), "jobs.release-verification.guard");
    expect(
      guard.shell === undefined || ["bash", "sh"].includes(guard.shell),
      "jobs.release-verification.guard.shell",
      "bash-compatible result guard",
      guard.shell,
      "unconfirmed",
    );
    expect(
      guard.name === "Confirm required checks succeeded",
      "jobs.release-verification.guard.name",
      "stable publisher aggregate step identity",
      guard.name,
    );
    expect(
      aggregate.steps.filter((raw) => obj(raw).name === guard.name).length ===
        1,
      "jobs.release-verification.steps.name",
      "unique publisher aggregate step identity",
      aggregate.steps,
    );
    expect(
      obj(guard.env).CHECK_RESULT === "${{ needs.check.result }}" &&
        obj(guard.env).COMPATIBILITY_RESULT ===
          "${{ needs.compatibility.result }}",
      "jobs.release-verification.guard.env",
      "guard reads actual required job results",
      guard.env,
    );
    const guardIndex = aggregate.steps.indexOf(guard);
    extensionEffects(
      aggregate,
      "jobs.release-verification",
      new Set([guardIndex]),
      guardIndex,
    );
  }
  return failures;
}
