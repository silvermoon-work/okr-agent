# @silvermoon-work/check.silvermoon

Private CAR author workspace; never an npm delivery. It consumes the shared
Silvermoon Check implementation and existing Check Builder. Build:

```text
pnpm exec turbo run build --filter=@silvermoon-work/check.silvermoon
```

Outputs are `dist/check.car` and `dist/check.json` with an exact immutable root
CID. CLI and author share `silvermoon/scripts/lib/build-car.mjs`; there is no
CLI→author dependency cycle. The CLI's own build packages its exact CAR so
normal builds and npm delivery do not depend on an out-of-graph side effect.
`verifyArtifact` validates full CAR integrity and binding using the real
upstream reader.

Protocol, revision scopes, five signoffs, host trust, evidence, concurrency and
Git boundaries are documented in the CLI README. Both use the same domain
reducer and SDK `createCheckCallback` ordered checkpoints, not a copy of the old
Potential Guide. The Task entry dispatches lifecycle and snapshot observations
and supplies execution dependencies. Checkpoints read prior successful outputs
through their execution-local context. References are bundled once per
checkpoint, not per rule. Building never uploads, publishes, links global
binaries or replaces skills.
