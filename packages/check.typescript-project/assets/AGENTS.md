# Agent maintenance convention

Read [project-specific guidance](docs/agent-project.md), README.md and
CONTRIBUTING.md before changing the project. Project guidance supplements these
rules; it does not override them.

## Safe maintenance

- Inspect the worktree and preserve unrelated changes and custom content.
- Use the root .node-version and the exact packageManager from package.json.
  Install with pnpm install; CI uses pnpm install --frozen-lockfile.
- Keep .node-version on the highest stable official release marked LTS and still
  supported by the current official schedule. Require index and schedule
  evidence no older than one hour; never fall back to stale or conflicting
  facts. Package runtime ranges may be wider but must include this developer
  Node; consumer minimum environments need not run all development tools.
- Keep third-party development tools on compatible stable versions, update
  declarations and the corresponding lockfile importers together, and verify
  Node and peer compatibility. Never install or upgrade implicitly during
  inspection.
- Keep strict TypeScript and type-aware lint enabled for all applicable source
  and tests. Preserve formatting checks, single-run tests and coverage of
  untested source with all four global thresholds at least 90.
- Use typecheck, lint, format-check, test and test-coverage for read-only
  checks. Use format only for intentional formatting changes. Use applicable
  build and lint-package for deliverable validation.
- Use colon-free package script names and exactly node scripts/<same-name>.mjs
  without arguments. Keep a one-to-one mapping with top-level .mjs entries;
  shared implementations belong in scripts/lib/. Ordinary entry implementations
  are unrestricted; interface compliance alone does not prove execution.
- Run the root check before submitting changes. Use the documented targeted
  checks while developing. Do not hide failures, remove tests, weaken gates or
  exclude code to obtain success.
- Keep workspace membership, shared tooling, scripts, PR/main-push CI and
  documentation consistent. Never execute untrusted configuration, hooks or
  commands merely to inspect a project.
- Separate configuration location from execution scope. Shared Vitest
  configuration runs in each code package with explicit --root and --config;
  configuration reuse alone does not establish a multi-project test runner.
- Protect secrets, dependency directories, generated output, coverage and caches
  with gitignore without ignoring required source, configuration, workflows or
  lockfiles.
- Keep this entire AGENTS.md identical to the supplied standard. Put
  project-specific additions only in docs/agent-project.md; preserve existing
  custom guidance there before restoring this file.

## Conditional npm delivery

These rules apply only to packages intentionally delivered to npm, not private
applications or aggregate roots.

- Maintain explicit package identity, license, source links, ESM import and type
  exports, package.json export, delivery allowlist, source maps and declaration
  maps. Build and validate the selected package with publint.
- Keep non-release workspaces private. Explicitly opt in one mapped package at a
  time; never recursively publish workspaces or automatically release
  dependencies.
- Publish only an explicitly authorized exact version and commit. Stable x.y.z
  uses latest; x.y.z-rc.n uses rc, starting at rc.0 and increasing continuously
  for that target version.
- Verify unique tag/package mapping, main ancestry and existing successful
  exact-SHA main-push CI including every required matrix and aggregate check.
  Missing or uncertain evidence blocks publication; do not rerun release-local
  full CI as a substitute.
- Reject private packages, placeholder identities, existing versions and
  unavailable internal runtime/peer dependency versions. Registry failures are
  not proof that a version is absent.
- Use npm Trusted Publishing with an explicit environment and id-token
  permission, never stored npm tokens.
- Use the supplied fixed release/release-dry-run entries and fixed shared
  publisher implementation without changes. Read identity/version from the
  selected manifest, topology from the workspace and matrix from the real CI.
  Reuse an existing explicit package ID/tag mapping for multiple targets; never
  introduce duplicate release descriptions. CI invokes pnpm release or pnpm
  release-dry-run, never an internal Node file or naked npm publish.
- Explicitly build the selected package and dependencies, pack the selected
  package once with lifecycle hooks disabled, validate its exact name/version
  and publish that same tarball. Never mutate the tarball after validation.
- Manual workflow dispatch is dry-run only. Do not publish, move release tags,
  change dist-tags or upload artifacts remotely without explicit authorization.
