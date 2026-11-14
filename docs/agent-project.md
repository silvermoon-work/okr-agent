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
- Keep workspace build, lint, test, test-coverage, lint-package and typecheck
  responsibilities aligned with `turbo.json`. The fixed root commands discover
  members and dependencies from the workspace manifests; Turbo remains available
  for cached builds and targeted workspace actions.

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
- Release one explicitly mapped package with `<package-id>-v<version>` tags.
  Never batch-publish workspaces or automatically release dependencies.
- Register each actual npm delivery in root `silvermoon.yaml` with its exact
  `path`, `type: npm` and existing `packageId`; read name/version from the
  manifest. Keep the root, apps, and preset core example private and
  unregistered for npm. Historical example mappings do not authorize delivery.
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
  excluded from formatting so new formatter releases do not rewrite accepted
  world revisions. This exclusion does not apply to source, tests, scripts,
  workflows or required configuration outside that tree.

- The previous root guidance was moved here before restoring the complete
  standard AGENTS.md; its project-specific conventions remain in force.
- `pnpm check` uses the fixed scheduler: format-check, dependency-ordered build,
  types, lint, coverage, `test-release`, package lint, and `check-scripts`.
  `pnpm test` is a single non-coverage run; use `pnpm test-coverage` for
  coverage.
- A non-code aggregate root is not built again by the per-project check plan;
  its `pnpm build` remains the explicit Turbo aggregate action. Each member is
  built once in dependency order. Keep the standard command asset and installed
  workspace copies in sync when changing this behavior.
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
- `pnpm test-release` preserves the original JavaScript release regressions.
  `scripts/lib/legacy-release.mjs` is historical metadata/artifact validation,
  not a publishing entry or the trusted publisher. No workflow invokes it.
- The only publishing entries are `pnpm release` and `pnpm release-dry-run`,
  used by `.github/workflows/npm-publish.yaml`. Their shared fixed core reads
  the root deliverables list; it never batch-publishes.
- Workflow standards use `actions/checkout@v7`, `actions/setup-node@v7` and
  `pnpm/action-setup@v6`, whose own Action runtime is Node 24. Keep the Check
  assets, actual workflows and publisher's exact CI verifier aligned. This does
  not change the project's development Node or consumer compatibility matrix.
- For a focused TypeScript test, run
  `pnpm --filter <package> exec vitest run --root . --config ../../vitest.config.ts test/<file>.test.ts`.
  Fixed standard entries intentionally reject extra arguments.
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
