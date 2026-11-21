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

Checkpoint implementation and canonical documentation live together under
`silvermoon/src/checkpoints/`. The shared build helper composes each Task's Spec
in a read-only overlay from those definitions and the actual Target schema; it
does not copy definitions into this author workspace. The four
`docs/silvermoon-*.yaml` files are generated preview snapshots. See the CLI
README's checkpoint authoring section for the refresh command. Every delivered
CAR remains self-contained, including its Task overview and checkpoint files.

The current [Idea Check Spec](../../docs/silvermoon-single-checker.yaml)
implements v2 paired submit/signOff confirmations, direct predecessor revisions,
exact implementation commit verification, a cumulative append-only deployment
report, and a thirteenth user-acceptance checkpoint. The Check never performs
automated tests, manual E2E operations or user acceptance itself: it validates
their recorded versions, strict structures, append-only history and
synchronization. Old v1 events remain readable without being migrated into v2
acceptance.

See the [Events guide](../../docs/silvermoon-events.md) for all eight event
types and current/historical field distinctions. The original
[design candidate](../../docs/silvermoon-idea-check-candidate.yaml) is archived
design history, not the generated runtime Spec.
