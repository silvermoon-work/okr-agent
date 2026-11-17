# Project Guidelines

## Development

- This project uses pnpm workspaces and Turborepo. Keep executable apps under
  `apps/` and reusable packages under `packages/`.
- Use the exact development Node in `.node-version` and pnpm in the root
  `packageManager`. Package runtime ranges remain independent.
- Install dependencies with `pnpm install`.
- Run `pnpm check` before submitting changes.
- Keep shared third-party versions in the pnpm catalog and internal workspace
  dependencies on `workspace:*`.
- Name every workspace package, including the private root, under
  `@silvermoon-work/*`. Keep imports, workspace dependencies, release mappings,
  and documentation consistent when renaming packages.
- Development-tool packages use `@silvermoon-work/devtool.<name>`.
  `devtool.publish-gate` is an independent npm candidate, not yet a replacement
  for the fixed publisher or a root dependency. First publish it through the
  existing workflow; only then adopt a pinned published development dependency.
  Keep publication authorization separate from Trusted Publisher setup.
- Keep workspace build, test, test-coverage, lint-package and typecheck
  responsibilities aligned with `turbo.json`. Turbo reads workspace membership
  and dependency order; do not duplicate that graph in a custom scheduler. Run
  whole-repository ESLint and Prettier once from the root.

## Engineering simplification and Check policy boundary

- This consuming repository deliberately uses direct package commands rather
  than the old fixed `node scripts/<same-name>.mjs` interface. The user
  explicitly approved this engineering experiment. The unchanged standard
  `AGENTS.md` and TypeScript Check assets still describe the older interface:
  this is an open policy conflict, not a claim that the Check Idea has been
  accepted or that this repository passes that Check. Do not copy the repository
  changes into Check author code, tests, references or assets to conceal the
  conflict.
- Simple member commands call standard tools directly, including short fail-fast
  command chains. SDK and ipfsaw builds use rimraf then tsc to remove stale
  modules; ipfsaw then runs its functional browser-runtime and Task/CAR build
  script, which cannot be replaced by TypeScript compilation alone. The web host
  uses Vite's CLI with loopback host, port 4173 and strict port selection. Vite
  uses standard config discovery rather than the former wrappers' disabled
  config loading; no Vite config is currently present. Keep scripts only for
  logic not adequately expressed by standard tool commands and configuration. Do
  not restore copied command/delivery libraries in every member. Extracting the
  fixed publisher into a shared development dependency is deferred; leave its
  implementation and release entries unchanged in this round.
- Root `check` directly chains pnpm commands with `&&` and stops at the first
  failure: format-check, build, typecheck, whole-repository lint, package
  test-coverage, then npm package lint. Root configuration TypeScript is checked
  explicitly, in addition to Turbo's member typechecks. Whole-repository ESLint
  covers root configuration, remaining maintenance scripts, member source and
  tests; there is no separate duplicate `check-scripts` pass.
- Root build/typecheck/test/test-coverage use Turbo. Tests and typechecks depend
  on upstream builds; package lint depends on its own build. Shared TypeScript,
  Vitest, Node selection and build-helper inputs invalidate caches. Build
  outputs include the entire `dist/` (including CARs and browser renderers);
  coverage restores `coverage/`. Root test/coverage invocations keep one active
  workspace at a time, preserving the old scheduler's resource bound for
  process/timing-sensitive tests while retaining dependency ordering and
  caching. Build/typecheck remain parallel where dependencies permit. Native,
  smoke, dev and demo tasks are not cached. Release commands are not Turbo tasks
  and remain explicit single-package entries using the unchanged fixed publisher
  and its dependencies.
- Root `lint-package` directly runs `turbo run lint-package`; each member
  declaring the command runs it after its own build. Only npm delivery members
  currently declare `lint-package: publint`. Daily package lint deliberately
  does not enumerate or cross-check package-local `deliverable.yaml`. The fixed
  release publisher separately validates the delivery list and runs publint on
  the exact selected tarball; this simplification does not change release scope.
- Member commands operate in their own working directory. Shared Vitest is
  passed explicitly with `--root . --config ../../vitest.config.ts`; no hidden
  root discovery or graph reconstruction occurs inside a member command. Direct
  `pnpm --filter <package> test` does not build dependencies. Use
  `pnpm exec turbo run test --filter=<package>` for dependency-aware execution.
- Root `clean` calls rimraf with quoted, opt-in globs for `dist`, `coverage` and
  `.turbo` at the root and directly under `apps/*` and `packages/*`. This fixed
  layout includes children without package manifests; it does not enumerate pnpm
  membership or recursively match nested outputs. Output directory links are
  removed without deleting their targets, not rejected in a preflight. The
  layout itself must be trusted: redirected `apps`, `packages` or member
  directories are not validated. Dependency directories, pnpm stores and other
  worktrees outside the matched layout are not cleanup targets.
- CI continues to call `pnpm check` after frozen installation. Required jobs,
  compatibility matrix and publisher verification identities are unchanged. The
  existing consumer-minimum/full-development-tool matrix mismatch remains a
  separate discussion; this migration does not raise minimum Node versions.

## Skills

- Manage project skills with `npx skills`.
- Keep all project skills under `.agent/skills/<skill-name>/`, with each skill's
  `SKILL.md` in its directory.

## Silvermoon

- Use the device-level Silvermoon CLI and personal skill registration, not a
  project dependency or repository-local Silvermoon skill.
- Project content defaults to Simplified Chinese (`zh-CN`).
- Start with `silvermoon whats-next --audience agent --language zh-CN` and
  follow its reported next action.
- Validate metadata with
  `silvermoon check --worktree --audience agent --language zh-CN` before staging
  and `silvermoon check --staged --audience agent --language zh-CN` before
  committing.

## Publishing

- Keep repository release knowledge here, not in a project skill. See
  [README](../README.md#publish-one-package) for setup and commands.
- Release one explicitly declared package with `<full-npm-name>@<version>` tags.
  Never batch-publish workspaces or automatically release dependencies.
- Register each actual npm delivery in its own `deliverable.yaml` with
  `type: npm`; derive its path from the package location and name/version from
  its manifest. Manual `PACKAGE_INPUT` uses the full npm name including scope.
  Remove legacy root `silvermoon.yaml`; do not maintain parallel target sources.
  Keep the root, apps, and preset core example private and unregistered for npm.
  Historical example mappings do not authorize delivery.
- Require the tag's package identity and exact version to match both the tagged
  commit's manifest and the packed manifest, including prerelease suffixes.
- Publish stable versions to `latest` and prerelease versions to `rc`.
  Prerelease versions must use `x.y.z-rc.n`, with `n` starting at `0` and
  increasing by one for each subsequent prerelease of the same target version.
- Publish only commits reachable from main with successful exact-commit main
  push CI. Keep the versioned CI aggregate and verifier arguments aligned.
- Build the selected package and its dependencies, then pack the selected
  package once with lifecycle hooks disabled. Validate and publish that same
  tarball.
- Internal runtime and peer dependencies must have matching versions already on
  npm. Publish missing dependencies separately before tagging the dependent
  package.
- Use npm Trusted Publishing, not stored tokens. Manual workflow runs are dry
  runs only. Never push release tags or publish without explicit authorization.
- Release tags are immutable. Retry a failed pre-publication run without moving
  its tag; an existing npm version must block publication.

## Normalization and targeted validation

- `.silvermoon/` contains lifecycle metadata and historical/generated deployment
  evidence, not current runtime or maintenance source. It is intentionally
  excluded from formatting and linting so new tool releases do not rewrite or
  reinterpret accepted world revisions. This exclusion does not apply to source,
  tests, scripts, workflows or required configuration outside that tree.

- The previous root guidance was moved here before restoring the complete
  standard AGENTS.md; its project-specific conventions remain in force.
- `pnpm test` is a single non-coverage run; use `pnpm test-coverage` for
  coverage. Both aggregate only real workspace package tests through Turbo. The
  root has no independent test suite: the user explicitly approved deleting its
  engineering and synthetic legacy-release regressions, their runner and the
  now-unused legacy validator. Automated root graph/cache/failure/cleanup
  regressions and synthetic legacy-validator coverage are no longer retained. Do
  not recreate them in an artificial maintenance workspace or move them into
  Check author packages. Existing package tests and coverage gates remain.
  Validate root cleanup changes with isolated manual fixtures, including output
  directory link-target safety, without deleting real build outputs.
- Default toolchain tests use controlled tools and isolated configuration, not
  ambient npm/pnpm/nrm installations. Real installed-tool checks are explicit
  `native-test`/`smoke` actions and the manual cross-platform native workflow.
- Coverage thresholds are project-owned policy, not a universal Check minimum.
  Global thresholds are 90% for branches, functions, lines and statements in
  every code workspace, enforced by the shared Vitest configuration. Keep
  coverage enabled, include untouched source, declare all four finite thresholds
  within 0..100, and propagate real gate failures. Raise these project
  thresholds as meaningful behavior coverage and source-map attribution improve;
  do not remove source or weaken tests to meet them. Mock unit tests cover
  external dependencies and failure paths without requiring live services or
  personal configuration. Historical CAR results do not certify this policy. The
  supervising session owns the separate Check revision and supplies its new CID
  for independent validation; do not modify this worktree's author source or
  standard assets to simulate that integration.
- The publisher workflow filename is `publish-npm.yaml`, not `npm-publish.yaml`.
  `npm-publish.mjs` is only the shared implementation library name. npm Trusted
  Publisher bindings are configured per package against the exact workflow
  filename, so a rename silently breaks previously authorized packages even
  though the workflow body still passes locally and in a manual dispatch dry
  run. A release tag push validates that binding for real; keep the repository
  workflow, the Check standard asset and its enforced path identical.
- Workflow standards use `actions/checkout@v7`, `actions/setup-node@v7` and
  `pnpm/action-setup@v6`, whose own Action runtime is Node 24. Keep the Check
  assets, actual workflows and publisher's exact CI verifier aligned. This does
  not change the project's development Node or consumer compatibility matrix.
- For a focused TypeScript test, run
  `pnpm --filter <package> exec vitest run --root . --config ../../vitest.config.ts test/<file>.test.ts`.
  Direct member commands accept tool arguments; prefer a member command for a
  focused selection rather than the aggregate root test commands.
- The user explicitly authorized raising the SDK's consumer minimum in this
  normalization round: `>=22.13` became `>=22.15.0`, matching the parsed minimum
  of the other applicable code packages. This intentionally tightens the SDK's
  compatibility promise; no other package range was narrowed. The candidate CI
  removed the obsolete 22.13.0 entry and retains 22.15.0 and 24.11.1 with the
  fixed jobs and aggregate protections unchanged. The fixed profile still runs
  full development checks on the matrix, not separate consumer runtime probes.
  This is not a verified consumer compatibility result or a merge-ready CI
  claim; any further minimum change requires explicit authorization.
- Keep Check author source, tests, references and standard assets unchanged
  while normalizing the consuming repository, except for an exact explicitly
  authorized supervisor baseline delta. The supervisor's 19-file
  `check-policy-followup.patch` was integrated without removing normalization
  regressions; it is not permission for additional rule changes. Escalate
  unsupported behavior or actual coverage gaps to the supervising session rather
  than weakening checks.
- The accepted `project-deliverables` Idea explicitly authorizes the scoped
  Check/standard/publisher evolution for root `silvermoon.yaml` and the matching
  consumer migration. This supersedes the earlier normalization-only source
  freeze for that change, not the quality or publishing protections. Cloudflare
  platform checks and deployment remain a separate phase.
- The user subsequently authorized migrating that root delivery list to each
  package's `deliverable.yaml`, containing its delivery `type`, across the gate,
  fixed publisher, workflow, Check standard and consumers. Full manifest npm
  names replace separately configured IDs, and new release tags use
  `<name>@<version>`. This supersedes the root-list location and old tag format;
  historical tags and published artifacts remain unchanged.
