# @silvermoon-work/check.silvermoon

Private CAR author workspace; never an npm delivery. It consumes the shared
Silvermoon Check implementation and existing Check Builder. Build:

```text
pnpm exec turbo run build --filter=@silvermoon-work/check.silvermoon
```

Outputs are `dist/check.car` / `dist/check.json` for Idea navigation,
`dist/project-check.car` / `dist/project-check.json` for project readiness,
`dist/setup-check.car` / `dist/setup-check.json` for device readiness and
`dist/commit-check.car` / `dist/commit-check.json` for commit validation, each
with its own exact immutable root CID. CLI and author share
`silvermoon/scripts/lib/build-car.mjs`; there is no CLI→author dependency cycle.
The CLI's own build packages its exact CAR so normal builds and npm delivery do
not depend on an out-of-graph side effect. `verifyArtifact` validates full CAR
integrity and binding using the real upstream reader.

`silvermoon check-idea <idea>` executes the Idea CAR with a required repository
and Idea selector; `check-project` and `create-idea` use the same Project CAR,
with creation writing only after it passes. Both Project and Idea reuse the same
four prerequisite checkpoint implementations, not an implicit no-Idea branch.
The Project Task additionally checks the effective pre-commit hook for a
fail-closed staged `check-changes` command; it never installs or executes hooks.
`check-setup` runs the global checkpoint in its own Setup CAR without a Git
repository. `silvermoon check-changes` executes the commit CAR for changed
Ideas, with explicit `--allow-delete` exceptions for whole deletions.
`silvermoon get-reference <cid>` reads reference files from any of the four CARs
through the Engine's IPFS adapter without executing a Task. Events are edited
directly; no event command is exposed.

Protocol, revision scopes, five signoffs, host trust, evidence, concurrency and
Git boundaries are documented in the CLI README. They use shared domain logic
and SDK `createCheckCallback` ordered checkpoints, not a copy of the old
Potential Guide. Separate Task entries and contracts execute independent Idea,
setup, project and commit checkpoint lists; the Host selects the appropriate
CAR, not a Task mode switch. Commit validation never requires device readiness,
worktree hygiene, upstream synchronization or lifecycle completion. Each CAR
bundles only its `references/idea`, `references/setup`, `references/project` or
`references/commit` subtree at `resources/references/`. Checkpoints read prior
successful outputs through their execution-local context. References are bundled
once per checkpoint, not per rule. Building never uploads, publishes, links
global binaries or replaces skills.
