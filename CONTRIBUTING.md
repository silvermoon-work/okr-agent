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
whole-repository typed lint, coverage, the JavaScript release/engineering
regressions and publint. Lint includes root configuration and maintenance
scripts. Use `pnpm test` for a single test run, `pnpm test-coverage` for
coverage, and `pnpm test-release` for the release/engineering regressions. Turbo
owns dependency ordering and caching; direct member commands do not build
dependencies. For a dependency-aware focused action use
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
Check policy. Keep root AGENTS.md, Check author assets and the fixed publisher
core unchanged; this experiment is not Check policy acceptance.

Add or update tests for every behavior change. Keep public exports in
`src/index.ts`, and treat changes to those exports as API changes.

Register actual external deliverables in root `silvermoon.yaml`; npm items use
their existing `packageId` for tag identity. Do not infer delivery from private
flags, Wrangler files or old preset mappings. Keep the core example private and
unregistered for npm. The consuming repository reuses the publisher's existing
`deliverables.mjs` parser for npm package lint; do not create another target
list or copy command/delivery libraries into each member.
