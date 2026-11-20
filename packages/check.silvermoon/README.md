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

The
[Idea Check design candidate](../../docs/silvermoon-idea-check-candidate.yaml)
adds user hands-on acceptance after deployment and Agent verification. It
separates Agent `submit` from user-triggered `signOff`: each version-2 submit
contains `object`, `revision` and one `upstream` content revision (`null` for
requirements), and its version-2 signoff contains only the referenced `submit`
ID. The chain is requirements → research → technical → cases → tests →
user-acceptance. Each predecessor must already be confirmed and synchronized; a
new submission requires its own explicit user signal, but merely changing a
predecessor's submit ID does not invalidate downstream submissions when its
content revision and full dependency context are unchanged. Any ancestor content
change invalidates dependent submissions and confirmations transitively. Replay
derives each submission's original content chain from the then-confirmed
predecessor; a later submission with the same revision but different ancestors
cannot silently replace that context. User acceptance submits the current
deployment report revision, with the tested implementation bound inside that
report. Materials and both events must reach primary before passing the
corresponding gate. It also proposes small version-2 `verify` events containing
only `phase` and one `rev` beyond the common event fields, with no generic
environment parameter. Implementation runs reproducible automated tests and
records the exact passing commit, without a report. Deployment requires
Agent-led manual E2E tests and one append-only
`evidence/deployment/report.jsonl` under the Idea root. Each round appends a
`start` record binding the implementation, then one `case` record per manual
attempt with steps, expected and actual outcomes, and result. Retries append
records rather than editing failures; the last result per case in the latest
round must cover all deployment cases and pass. No overall result is duplicated.
The event records the entire file's raw-byte SHA-256. The fixed report preserves
its existing byte prefix; neither lifecycle nor commit checks may allow
rewriting it. Only the latest deployment event must match the current full
report; new appended records invalidate an old verification until a matching
event is added. Candidate case indexes use version 2 with only `id` and `phase`
per case. Historical version-1 inline batches remain unchanged and readable, but
do not substitute for the new automated and manual acceptance steps. This is a
Spec-only proposal, not the generated runtime preview: the simplified
verification protocol and case index, paired submission/signoff events, reducer
state and thirteenth checkpoint are not implemented or included in any CAR. Keep
it separate from `generate-specs` until the runtime change is authorized and
implemented.

See the [Events guide](../../docs/silvermoon-events.md) for the seven current
event types and candidate eighth type `submit`, field meanings, JSON/JSONL
examples, and the distinction between current inline verification batches and
the candidate simplified verification protocol.
