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

The root gate runs formatting, dependency-ordered builds, types, typed lint,
coverage, the JavaScript release regressions, publint and maintenance-script
lint. Use `pnpm test` for a single test run, `pnpm test-coverage` for coverage,
and `pnpm test-release` for the release regressions. Standard entries accept no
extra arguments; use a workspace's
`pnpm exec vitest run --root . --config ../../vitest.config.ts test/<file>.test.ts`
for a focused test.

Default tests use mocked external results and controlled filesystem/process
fixtures. They must not depend on personal configuration, live services or
ambient npm/pnpm/nrm installations. Native tool compatibility is a separate,
explicit validation: use the `Native toolchain compatibility` manual workflow,
or run the toolchain workspace's `native-test` and `smoke` actions after
building it. Do not remove native compatibility coverage or turn unknown tools
into success to make the default gate pass.

Project-specific agent guidance is in
[docs/agent-project.md](docs/agent-project.md). Keep the fixed root AGENTS.md
and standard command cores unchanged.

Add or update tests for every behavior change. Keep public exports in
`src/index.ts`, and treat changes to those exports as API changes.
