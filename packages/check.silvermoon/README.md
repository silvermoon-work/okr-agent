# @silvermoon-work/check.silvermoon

Private CAR author workspace; never an npm delivery. It consumes the shared
Silvermoon Check implementation and existing Check Builder. Build:

```text
pnpm exec turbo run build --filter=@silvermoon-work/check.silvermoon
```

Outputs are `dist/check.car` / `dist/check.json` for Idea navigation and
`dist/commit-check.car` / `dist/commit-check.json` for commit validation, each
with its own exact immutable root CID. CLI and author share
`silvermoon/scripts/lib/build-car.mjs`; there is no CLI→author dependency cycle.
The CLI's own build packages its exact CAR so normal builds and npm delivery do
not depend on an out-of-graph side effect. `verifyArtifact` validates full CAR
integrity and binding using the real upstream reader.

Protocol, revision scopes, five signoffs, host trust, evidence, concurrency and
Git boundaries are documented in the CLI README. Both use the same domain
reducer and SDK `createCheckCallback` ordered checkpoints, not a copy of the old
Potential Guide. Separate Task entries and contracts execute independent Idea
and commit checkpoint lists; the Host selects the appropriate CAR, not a Task
mode switch. Commit validation never requires device readiness, worktree
hygiene, upstream synchronization or lifecycle completion. Each CAR bundles only
its `references/idea` or `references/commit` subtree at `resources/references/`.
Checkpoints read prior successful outputs through their execution-local context.
References are bundled once per checkpoint, not per rule. Building never
uploads, publishes, links global binaries or replaces skills.
