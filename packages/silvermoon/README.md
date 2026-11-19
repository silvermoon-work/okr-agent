# @silvermoon-work/silvermoon

`0.1.0-rc.2` adds explicit device and project onboarding through `check-setup`
and `check-project`, sharing readiness checks with Idea navigation and creation.
Global runtime and personal skill replacement still require separate
authorization; building or publishing does not switch an existing device. CLI
readiness tests use a controlled legacy PATH command so a linked development
installation does not change their expected prerequisites.

`0.1.0-rc.1` repairs the published `0.1.0-rc.0` candidate's legacy primary URL
compatibility and missing Git execution context in the Check Worker. The new
version is not published merely by building/testing, and does not replace a
global legacy binary or skill.

The CLI hosts the exact Check CAR in a real Task Engine. Each observation owns a
fresh `MemoryStore`, Engine and offline `IpfsStore`; target identity does not
contain mutable revisions or a random nonce. A domain reducer shared by the
Check, writer and replay is the only lifecycle implementation. The Host renders
`pass/documentation/problems/references`; it never decides a second lifecycle.

The [Idea checkpoint design](../../docs/silvermoon-single-checker.yaml) uses
Check Bundle Spec v1.0 for ipfsaw preview. The built-in Check executes the same
12 ordered checkpoints: `global`, `repository`, `branch`, `silvermoon-folder`,
`idea-folder`, `requirements`, `research`, `technical`, `test-index`,
`test-cases`, `implementation` and `deployment`. The first states are
“全局 Silvermoon 已正确配置”, “仓库在可继续推进的状态”, “分支在可继续推进状态”,
“Silvermoon 数据目录有效” and “Idea 数据有效”. The five consensus states are
“需求／调研／技术／用例索引／测试共识已确认并同步”, followed by
“实现验收已通过并同步” and “部署验收已通过并同步”. Each checkpoint owns coded
rules and one complete document. The first failing checkpoint stops execution;
no tree or child expansion is returned. Lifecycle Problem briefs include the
reduced current `level` and optional `next` together with revision facts.
Successful outputs are shared only within the current execution through
`outputOf`. Repository advancement requires every change committed and HEAD
synchronized with primary; Idea draft/event exceptions are no longer accepted.

Checkpoint IDs name their subject, while titles name the attained state. Every
Rule ID begins with its owning checkpoint ID and is unique within its Task.
Checkpoint naming does not rename existing files or historical event/reducer
phases: `research` matches its event/state key directly, while `test-index` and
`test-cases` inspect the existing `cases` and `tests` phases respectively.

Implementation and deployment each require actual verification evidence,
matching `verify` events and synchronization to the configured primary (for
example `origin/main`). Implementation code, evidence and events must be
committed and synchronized before deployment can pass its prerequisites.
Deployment verifies that accepted implementation, records its own evidence and
events, then synchronizes them before the Task can pass. Each phase rechecks a
clean worktree and HEAD against the observed primary tip; a local event or a
successful push command is not sufficient. There is no separate completion
checkpoint; reducer inconsistency remains an explicit execution error.

The [commit Check Task](../../docs/silvermoon-commit-check.yaml) independently
attains “候选快照有效” then “候选修改符合约束”, validating the candidate and its
changes relative to HEAD (for staged or worktree candidates), or its first
parent (for committed snapshots). It does not reuse the Idea readiness pipeline.
Only changed Ideas are selected, with their full candidate and baseline data
validated; unchanged Idea contents are not parsed. New Ideas must satisfy the
protocol. Existing identities are immutable and existing event bytes must remain
an exact prefix. Whole deletion requires repeatable `--allow-delete <idea-id>`;
partial deletion or an exception naming a retained/unknown Idea fails. For a
commit hook, run `silvermoon check-changes --staged --audience agent`; no hook
is installed automatically. Valid unapproved Ideas, dirty worktrees, detached
HEAD and absent upstream tracking do not by themselves invalidate a candidate.

All four Specs declare the Task's scope in its root `description` and checked
parameters once in `parameter.schema`, without `preconditions`. Each
checkpoint's `description` briefly states what is checked and guaranteed; its
separate `instructions` tell the Agent how to read replay-derived facts, prepare
materials, request review, record explicit events and iterate when not approved.
Its Rules define the exact acceptance criteria. Its `output` documents facts
available to later checkpoints in this execution, not a JSON output constraint.
The Builder generates Task and checkpoint documents from these Specs in the CAR;
the authored Task documents under `references/idea` and `references/commit` and
`references/project` / `references/setup` remain supplementary guidance rather
than duplicate checkpoint definitions.

The delivered Idea CAR is exercised in a real Task Engine through all five
consensus gates, implementation verification and deployment verification. Each
gap returns its owning checkpoint/Rule and the Spec-generated instructions;
uncommitted verification events block progression until synchronized. The
independent commit CAR is also executed against a staged index while unrelated
worktree changes remain present. Invalid Idea data is a Rule violation, whereas
Git-context, concurrent-edit and internal observation faults remain execution
errors rather than invalid-data reports.

`silvermoon check-idea <idea> --json` uses the shared reducer, combining full
valid event history with current revisions, evidence, tested subjects and
observed primary facts. `level` in a lifecycle Problem brief is the first unmet
domain phase, not a phase already passed; `signed` holds matching signoff event
IDs, while `implementation` and `deployment` are accepted batch collection
digests. Earlier readiness failures return their own diagnostics rather than
fabricating a reduced state. A passing Idea Check establishes completion. Each
consensus instruction contains its actual signOff JSON shape and exact upstream
vector; verification instructions contain phase-specific verify templates.
Placeholders must be replaced with current observed facts, and a event never
substitutes for the user's real approval.

Repository acceptance covers the Git root, attached branch and clean worktree;
branch acceptance covers project configuration, primary existence, upstream and
synchronization. Silvermoon layout acceptance covers only ordinary safe
`.silvermoon`, bounded `config.yaml` and optional-before-first-Idea `i`
containers, never all Idea contents. Canonical selected-Idea observations read
that Idea's files and compare only its own identity/history with primary. Alias
discovery and explicit inventory/snapshot operations can inspect broader
metadata; unrelated Idea protocol errors do not become canonical-ID navigation
prerequisites.

## Commands

```text
silvermoon check-setup --audience agent
silvermoon check-project [--root <directory>] --audience agent
silvermoon create-idea --language zh-CN --json
silvermoon check-idea <idea> --audience agent
silvermoon check-changes [--worktree | --staged | --commit <full-sha>] [--allow-delete <idea-id>] --audience agent
silvermoon get-reference <cid>
silvermoon list-ideas --all --state requirements --query literal --sort oldest --limit 10 --json
```

These are the seven command entries. `check-idea` requires an Idea ID or alias;
device and project onboarding use explicit commands rather than bare Idea
navigation. `check-setup` requires no Git repository and does not discover or
read a project; it checks global installation, personal skill and user config
only. It rejects `--root`. `check-project` checks the same four prerequisite
checkpoints used by the Idea Task, including a clean worktree, upstream and
primary synchronization, not merely project configuration. Missing project
configuration is a readiness gap with repair guidance, not automatic setup.
Neither command creates an Idea, installs software, links a skill or initializes
a project.

`create-idea` executes the shared Project Task before writing; its four shared
checkpoints check global/repository/branch/layout readiness. Failures return the
Check report with exit 1 and no scaffold. No command appends events: edit
`events.jsonl` directly, preserving its exact prefix and canonical JSONL, then
run `check-changes` before staging/committing. Creation still writes the initial
`created` event. Library writer/replay helpers remain available.

`check-changes` defaults to the worktree against HEAD. `--staged` checks only
the index against HEAD; an exact `--commit` checks against its first parent.
Unborn/adoption snapshots validate newly introduced metadata without an old
Silvermoon baseline. No check installs a hook or performs a Git write.
`get-reference` reads only reference files from the four trusted bundled CARs
through the Engine's IPFS store adapter, without executing a Check or fetching.
Unavailable CIDs fail explicitly. Text output is the original UTF-8 content;
`--json` returns `{cid,content}`. Upgrading cannot silently substitute a
different document for an unavailable historical CID.

`--root <directory>` selects a Git root; audience is `human|agent`. JSON and
audience are exclusive. Both readable audiences render the same report; there is
no interactive TUI. Observation `--language`, old `reference`, and `migrate` are
intentionally unsupported (usage error), never aliases for new semantics.
Creation `--language` remains a content-language override. `list-ideas` also
supports inclusive RFC3339 `--created-after` / `--created-before`, repeatable
state filters, and `--all`; default hides abandoned/completed Ideas.

Exit codes: `0` successful command/observation (including normal lifecycle
gaps), `1` invalid snapshot or execution/data/concurrency/cancellation fault,
`2` invalid command/options. Setup/project readiness gaps also exit `1`;
`check-idea` lifecycle gaps remain normal observations with exit `0`. JSON
navigation/snapshot/readiness output is
`{schema:"silvermoon/v2",checkCid,target,result,documents}`. The result is the
unmodified Check result; documents are bounded offline UTF-8 reads of its direct
ContentRefs. Creation and inventory return domain objects. Errors go to stderr
as `{error:{code,message}}`; no command reports partial success after a
content/Engine fault. JSON v2 uses checkpoint-scoped references, not the old
per-problem document/source envelope. Older CARs remain immutable; an
unsupported historical report fails explicitly rather than being reinterpreted.

Inventory resolves the actual configured local remote-tracking primary snapshot
without fetching or requiring a clean worktree, upstream branch or primary
ancestry. Both use the same validated tested-subject context as the Check, so
committed evidence remains applicable when only this Idea's files changed
afterward. Their `observation` is explicitly `{scope:"local",fresh:false,...}`:
it records HEAD and the tracked primary tip/ref/remote. Missing, invalid or
disagreeing tracking context produces `state.level:"unknown"` and
`observation.primary:{status:"unavailable",diagnostic}`, never a fabricated
synchronization or completion. `--state unknown` can select these entries. They
do not certify network freshness or repository hygiene; use `check-idea` for
advancement.

## Configuration and installation boundary

Existing `.silvermoon/config.yaml` fields retain their v2 meaning:

```yaml
version: 2
primaryRepository: owner/repository
primaryBranch: main
preferredLanguage: zh-CN
```

Existing credential-free GitHub HTTPS or Git SSH primary URLs are also accepted
and normalized only in memory to `owner/repository`; the shared file is never
rewritten. Unknown fields, URL credentials, other hosts, query/fragment
suffixes, invalid YAML/languages, future versions and noncanonical BCP47 are
rejected. Optional user configuration is `~/.config/silvermoon/config.yaml`,
retaining `version: 1` and optional `preferredLanguage`. Versionless
`{preferredLanguage}` (or `{}`) remains accepted for compatibility; explicit
invalid/future versions and unknown fields are rejected. Content precedence is
Idea override → project → user → `en-US`. Changing shared project config can
affect the old tool too; the new CLI does not rewrite it.

Device readiness checks the actual scoped package/bin, first PATH command, and a
personal `.agents/skills/silvermoon` or `.copilot/skills/silvermoon` link to
this installation's `skills/silvermoon`. A copied/stale skill is not ready.
Snapshot checks intentionally omit device readiness. No registry update probe,
project dependency, optional project-skill scan or prompt execution is involved.
Install/link only with separate authorization; never switch the legacy tool as a
side effect of building this source.

The Idea `Target` is `{userHome, repoRoot, idea}`, with all fields required. The
Project Task has a strict `{userHome, repoRoot}` Target and rejects an Idea
selector; the Setup Task requires only `{userHome}` and rejects project context.
`userHome` is the user's home, not the Silvermoon config directory. Config,
primary, language and Idea facts are read from these roots, never supplied as
asserted readiness. Omitting an Idea no longer selects a shorter lifecycle
pipeline.

Each checkpoint accepts its Target and execution-local checkpoint context.
Lifecycle targets require `userHome`, `repoRoot` and `idea`; project targets
require `userHome` and `repoRoot`; setup targets require only `userHome`; commit
targets contain `userHome`, required `repoRoot`, optional `allowDelete` and
`snapshot` (`HEAD`, `staged`, `worktree` or an exact commit SHA). Neither schema
accepts an operation, runtime, stage, approval flag or caller-asserted
readiness. The shared reducer derives the current gate, exact signoffs and
rollbacks from events and current content. No checkpoint records progress merely
because it was invoked.

The Host selects four independent Task CARs before execution. Idea navigation
uses `dist/check.car` / `check.json`, built from `check.build.yaml` and
`references/idea`; new Ideas continue pinning this CAR. Commit validation uses
`dist/commit-check.car` / `commit-check.json`, built from
`commit-check.build.yaml` and `references/commit`. Its independent
`commit-snapshot` and `commit-history` checkpoints never require device
readiness, a clean worktree, upstream synchronization or lifecycle completion.

Project readiness uses `dist/project-check.car` / `project-check.json`, built
from `project-check.build.yaml`, the
[Project Spec](../../docs/silvermoon-project-check.yaml) and
`references/project`. The Project Task and Idea Task use the same
`prerequisiteCheckpoints` factory for global, repository, branch and layout
rules, with each Task's own strict Target schema. Project always stops after
these four checkpoints; the Idea Task always continues with its required Idea.
Successful preflight does not create files or authorize later writes: the writer
still locks, refreshes primary and revalidates the candidate before creating the
scaffold. New Ideas pin the Idea CAR, never the Project CAR.

Device readiness uses `dist/setup-check.car` / `setup-check.json`, built from
`setup-check.build.yaml`, the
[Setup Spec](../../docs/silvermoon-setup-check.yaml) and `references/setup`. Its
sole global checkpoint comes from the same `environmentCheckpoint` factory used
by Project and Idea checks. It does not invoke Git or query primary/registry, so
it works outside a project.

Library consumers import lifecycle checkpoints from
`@silvermoon-work/silvermoon/check` and commit checkpoints from the separate
`@silvermoon-work/silvermoon/commit-check` export. Project checkpoints are
available from `@silvermoon-work/silvermoon/project-check`; Setup checkpoints
come from `@silvermoon-work/silvermoon/setup-check`. The former creation-only
Task has been replaced by Project; no duplicate creation CAR is built.

`operation.refresh` is the existing API name for the fetch policy: when enabled,
the branch checkpoint checks the remote branch with `ls-remote`, fetches the
configured primary and uses `FETCH_HEAD`. When disabled it uses the local
remote-tracking snapshot without claiming network freshness. It never pulls,
merges, rebases or moves the local branch.

Rule IDs name requirements, such as `repository-worktree-clean`,
`branch-primary-synchronized` and `requirements-consensus-confirmed`; a Problem
identifies the violated rule and describes the actual failure in its brief.
Checkpoint IDs and event/reducer phase values remain separate: the
`requirements` phase is checked by the `requirements-consensus-confirmed` rule.
Low-level execution error codes are not Rule IDs.

The Idea and Project Task transports are `{target, runtime, refresh?}`; the
Setup and commit Task transports are `{target, runtime}`. No Task accepts an
operation selector. These envelopes are host/Worker boundaries, not checkpoint
Targets. Runtime identifies the actual CLI entry, host executable search path
and optional SSH agent socket, which cannot be inferred from a home directory.
The Task Engine's isolated Worker does not inherit these host facts; this change
does not invent an out-of-band environment capability or silently fall back to
ambient state. `Report.target` remains the business Target; commit reports
include the selected snapshot and required repository root.
`observe(target, {operation, runtime})` and existing CLI snapshot options are
preserved as Host dispatch options. The Host selects Project/Setup CARs only for
explicit `operation.mode="project"` / `"setup"`, never from a missing Idea
selector. It maps `operation.refresh` to the Idea or Project transport's
optional top-level `refresh`, never to a business Target or the Setup/commit
transport. `check-project` and creation preflight always use the default fresh
observation; explicit library `refresh:false` observes tracked primary only and
never falls back from a failed fetch. Missing required identity is an explicit
input error; unavailable pinned artifacts never fall back to another CAR. There
is no arbitrary environment map or repository allowlist.

Git reads its user/SSH configuration under `userHome` and runs in `repoRoot`.
Repository operations use an async-local runtime scope, not mutation of
`process.env`; concurrent checks cannot replace one another's context. Tokens,
arbitrary `GIT_*`, `NODE_OPTIONS` and the full host environment are not
forwarded. Engine Worker isolation and Git's
noninteractive/hook/external-protocol protections remain.

## Minimum viable protocol (version 1)

Only new `.silvermoon/i/<id>` is read. `.silvermoon/ideas` is untouched archival
data, never scanned or validated. `.silvermoon/guidance` is not consumed. There
is no ledger or migration/fallback path. IDs are UTC `YYYYMMDDHHmm` + two
cryptographic bytes as four lowercase Hex characters. Dates are strict;
exclusive directory creation retries at most 16 times. Same-minute IDs have a
stable ASCII tie-break, not creation order. Clock rollback is allowed and does
not authorize facts; cross-branch ID collisions must be repaired explicitly.

```text
idea.json                         immutable version/id/checkCid/createdAt
events.jsonl                      canonical JSON, UTF-8, LF, final newline
requirements/Spec.md              entire requirements/ tree is signed
technical/research.md             independently signed question index
technical/Spec.md                 all technical/ except research.md is signed
tests/cases.json                  independently signed machine-readable index
tests/Spec.md                     all tests/ except cases.json is signed
evidence/implementation/*         unsigned, phase-specific evidence
evidence/deployment/*
```

All trees include every support file, including plans and refinements. Revision
is `sha256:` of canonical JSON of ASCII-path-sorted `[path,sha256(raw-bytes)]`
pairs, scoped exactly as above. Index hashes are independent of body changes.
Raw bytes are not newline-normalized by the CLI. Configure Git LF attributes for
event files; a different physical event byte sequence is a different digest.
Bootstrap and the first `created` event must agree exactly. New Idea CID is
fixed at creation; CLI upgrades only affect new Ideas. The shipped CAR root must
match `dist/check.json`. This host trusts its bundled CID only; historical
unavailable, untrusted or unsupported CIDs fail explicitly. The library Host can
receive an explicit caller-owned trusted artifact list, never project
instructions, guessed gateways or an implicit latest fallback.

Example test index:

```json
{
  "version": 1,
  "cases": [
    {
      "id": "I-01",
      "phase": "implementation",
      "environment": "local",
      "subject": "git-head"
    },
    {
      "id": "D-01",
      "phase": "deployment",
      "environment": "staging",
      "subject": "implementation"
    }
  ]
}
```

Both phases are mandatory. One batch covers all cases in its phase for one exact
environment. Every required environment must have a current passing batch; a new
failed retry invalidates an earlier passing batch for that environment. The
index specifies scope, while Test Spec describes prerequisites, operations,
expectations and required proof. Nonempty files are structural checks, not
semantic approval.

### Events and revisions

Every event has `version:1`, a unique 32-lowercase-Hex request `id`, and
canonical ISO `at`. JSON object keys are recursively ASCII-sorted. Supported
types:

- `created`: `idea`, `checkCid`, optional canonical `language`; first/only.
- `setAlias`: lowercase portable `alias` or `null`; unique in the new inventory.
- `setLanguage`: canonical `language` or `null` to return to inherited content.
- `abandon`: nonempty `reason`; `resume`: explicit reversal. No intervening
  lifecycle facts while abandoned.
- `signOff`: `object` = `requirements|research|technical|cases|tests`,
  `revision` and `upstream`; the event type itself records explicit
  confirmation. New writes omit `decision`. Readers retain compatibility with
  historical `decision:"confirmed"` without stripping it or rewriting event
  bytes; other decision values remain invalid. New writes with that legacy field
  fail explicitly rather than silently normalizing the input. The upstream map
  contains **exactly all preceding gate revisions** in that order. Recorded
  upstream decisions must already exist. Record only the exact current gate
  after a real explicit human decision; an event is not authentication.
- `verify`: a unique `batch` described below; Agent verification is not another
  human signoff.

The Check returns current full revisions and event/primary digests in the
Problem brief. To sign Requirements, for example, use the actual observed values
in an event with `type:"signOff"`, `object:"requirements"` and `upstream:{}`.
Never compute approval from prose, silence or Git.

Humans review and sign the exact **draft first**. Until matching bytes AND that
event are committed/synchronized to primary, the state is `synchronization`, not
the next gate. Any signed supplement change rolls back to its gate and
invalidates dependent vectors. Even implementation/deployment plan “minor
refinements” require re-signoff. Independent indexes stay stable while bodies
are filled. All five signoffs are required; there are no waivers or human
implementation/deployment result gates.

### Git and transaction guard checks

The Idea Task follows environment → repository → branch → silvermoon-layout →
selected Idea. Repository acceptance requires a valid Git root, local branch and
clean worktree. Branch acceptance requires valid project configuration, matching
upstream and HEAD equal to the observed primary tip. Layout acceptance requires
safe metadata containers, not valid contents for every Idea. Identity and
append-only history checks apply only to the selected Idea during observation.
The separate commit Task validates a candidate without these readiness
requirements or a remote baseline. GitHub HTTPS/SSH identities remain
credential-free.

Creation requires clean synchronized HEAD. Writers permit only the current
phase's Idea draft/event paths when recording facts; subsequent Idea advancement
still requires committing and synchronizing them. No command stages, commits,
pushes, cleans or rewrites history; fetch is the only navigation Git side
effect.

The retained library append helper requires exact `expected-digest` of raw
existing JSONL plus freshly observed `expected-primary`; these are not CLI
options. A single exclusive `.silvermoon/.new.lock` serializes new writers. The
writer validates the whole candidate, fsyncs a same-filesystem replacement,
rereads project bytes/HEAD, then atomically renames. The lock is removed only if
still operation-owned. A conflict/cancellation is explicit; nothing silently
overwrites another decision. Identical retries are idempotent only for the same
final event on the exact supplied prior prefix. Replay cursors bind an exact
event-count/digest prefix, never approval.

Locks contain PID/token. After a crash, inspect whether the owning process is
still running and preserve any `.event-*` replacement before explicit manual
recovery; never blindly remove a lock. External editors do not participate in
this lock: read/stat/content/HEAD revalidation catches observed changes, not a
claim of OS-global atomic isolation from an editor at the final rename instant.
Links, redirected roots, nonregular files, unsafe paths and conflicts fail.
Capacity: 2048 files / 16 MiB per snapshot; 1 MiB / 4096 events per Idea; 512
cases/results, 64 evidence refs/result and 64 distinct tested subjects.

### Evidence batches

A `verify` event's `batch` has `id`, `phase`, all five `revisions`, exact Git
commit `subject`, exact `environment`, and one `results` entry per required
phase/environment case:
`{case:"I-01",result:"pass|fail|error",evidence:[{path:"evidence/implementation/run.txt",digest:"sha256:…"}]}`.
Deployment additionally requires `implementation` = SHA256 of canonical JSON of
the current implementation batches ordered by environment. Only fully passing,
current, nonempty, hash-matching batches across every required environment
satisfy a phase; failures may be retained as facts but never completion. New
batches bind current HEAD. Later commits that only add this Idea's
evidence/events do not stale tested code; any other tracked change since the
subject does. A new implementation batch invalidates deployment bound to the old
one. Final events/evidence must themselves be clean and synchronized for
terminal Pass.

Proof remains a traceable Agent claim: this mechanical Check does not execute an
LLM, prove logs truthful or grant operational permission. Keep secrets out;
store concise redacted durable evidence, not secrets or assumed-permanent
external links. A `completed` flag alone is unsupported.

## Build and validate

Use the root's exact Node/pnpm and active configured registry:

```text
pnpm exec turbo run build --filter=@silvermoon-work/check.silvermoon
pnpm --filter @silvermoon-work/silvermoon typecheck
pnpm --filter @silvermoon-work/silvermoon test-coverage
pnpm --filter @silvermoon-work/check.silvermoon test-coverage
pnpm --filter @silvermoon-work/silvermoon lint-package
pnpm check
```

The lifecycle integration runs the real checkpoints, writers and reducer against
an owned local worktree and bare primary, including local fetch/push, all five
signoffs, evidence and revision rollback. It uses the library's exact
`localRemote` host authorization, not a fake GitHub remote or SSH transport.
This override is not exposed as a CLI option, Task input or project setting;
ordinary primary identity validation remains unchanged. Legacy GitHub URL
normalization is tested separately without Git or network. Independent CLI and
real Engine/CAR tests retain their own execution and document-binding coverage.

CLI build compiles ESM/declarations/maps, then uses the existing Check Builder
and upstream Task Builder to produce all four CAR/binding pairs: `check`,
`project-check`, `setup-check` and `commit-check`. Private author depends on CLI
and invokes that same build helper; CLI never depends on author. The Check
bundles the shared domain implementation, not a legacy Guide or global
JavaScript module. Neither build publishes or uploads. `prepublishOnly` is
exactly `publish-gate check`; `deliverable.yaml` opts into npm. Exact
version/SHA authorization, successful main-push CI and Trusted Publisher
readiness are separate release prerequisites.
