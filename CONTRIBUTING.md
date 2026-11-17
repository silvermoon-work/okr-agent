# Contributing

Install the pinned pnpm release through Corepack or pnpm itself, then install
dependencies:

```sh
corepack enable
pnpm install
```

Before opening a pull request, run:

```sh
pnpm check
```

The root gate runs formatting, dependency-ordered builds, root and member types,
whole-repository typed lint, package coverage and publint. Lint includes root
configuration and maintenance scripts. Use `pnpm test` for a single test run,
`pnpm test-coverage` for coverage. Both aggregate only real workspace package
tests; the root has no independent test suite. The user-approved deletion of the
root engineering and synthetic legacy-release suite removes that regression
coverage rather than relocating it. Validate root cleanup changes manually in
isolated fixtures, including link-target safety, never against real build
outputs. Turbo owns dependency ordering and caching; direct member commands do
not build dependencies. For a dependency-aware focused action use
`pnpm exec turbo run test --filter=<package>`. To select one test after building
dependencies, use `pnpm --filter <package> test test/<file>.test.ts`.

Coverage includes untested source. Every code workspace must meet the shared 90%
thresholds for statements, branches, functions and lines. Add focused mock unit
tests for uncovered behavior rather than excluding source or weakening the gate.

Default tests use mocked external results and controlled filesystem/process
fixtures. They must not depend on personal configuration, live services or
ambient npm/pnpm/nrm installations. Native tool compatibility is a separate,
explicit validation: use the `Native toolchain compatibility` manual workflow,
or run the toolchain workspace's `native-test` and `smoke` actions after
building it. Do not remove native compatibility coverage or turn unknown tools
into success to make the default gate pass.

Project-specific agent guidance is in
[docs/agent-project.md](docs/agent-project.md), including the explicitly
approved conflict between direct engineering commands and the older fixed-entry
Check policy.

Keep each test with the real workspace package it tests; do not create an
aggregate-root or artificial maintenance-package suite. Add or update package
tests for package behavior changes. Keep public exports in `src/index.ts`, and
treat changes to those exports as API changes.

Register actual external deliverables in root `silvermoon.yaml`; npm items use
their existing `packageId` for tag identity. Do not infer delivery from private
flags, Wrangler files or old preset mappings. Keep the core example private and
unregistered for npm. Daily `pnpm lint-package` uses member script declarations
through Turbo, not the delivery list; only npm delivery members should declare
`lint-package: publint`. Each npm delivery member has
`prepublishOnly: publish-gate check`, using the root's exact published registry
development dependency rather than candidate workspace source. The workflow
selects one registered package, builds its dependencies and uses standard
`pnpm publish` with the gate's explicit native configuration. The gate checks
release context, not tarball bytes; the former custom publisher is removed. Do
not copy command/delivery libraries into each member.
