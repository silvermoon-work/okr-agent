# @silvermoon-work/silvermoon

The current source implements the approved flat-folder lifecycle; building does
not publish, install, replace a personal skill, migrate Ideas or record
acceptance. Historical rc.1 repaired primary URL/Git context handling; rc.2
added explicit device/project onboarding; rc.3 added fail-closed pre-commit
readiness. Published versions and historical CARs keep their original contracts.

## Lifecycle contract

New Ideas contain `.silvermoon/i/<id>/events.jsonl` and seven flat sibling
folders:

| Checkpoint / folder | Title      | Default acceptance |
| ------------------- | ---------- | ------------------ |
| requirements        | 需求规格   | consensus          |
| research-scope      | 调研范围   | consensus          |
| technical-spec      | 技术规格   | consensus          |
| test-scope          | 测试范围   | consensus          |
| test-spec           | 测试规格   | delegated          |
| implementation      | 实现交付物 | delegated          |
| deployment          | 部署交付物 | consensus          |

No new idea.json, ledger, nested worlds or separate user-acceptance checkpoint.
Folders must be safe, readable and measurable. Creation supplies `Spec.md`
prompts, not mandatory templates or machine content-completeness gates.

`revision` is the **actual owning folder Git tree ID**. `upstream` is the
**actual direct predecessor folder tree ID**, or null for requirements. No
synthetic material/upstream trees, dependency closures, custom hashes or refs.
Committed snapshots use raw ls-tree object IDs/modes and verify the measured
tree. Index/worktree candidates use ordinary Git blob/tree encoding and modes;
Windows and core.fileMode=false preserve tracked index executable modes. Events
are outside the folder trees, so event-only commits do not change material
revisions.

Events are created, submit, accept, setAlias, setLanguage, abandon and resume;
no event id/version. Submit has exactly at/type/object/revision/upstream. Accept
has the same tuple plus authority=user|delegate. The matching upstream prevents
reuse of an old accept for unchanged local content in a new context. Line order
governs history, not timestamps. Identical tuple resubmission is idempotent and
retains matching acceptance. A changed folder or invalid predecessor/ancestor
stops at the first owning submit/accept/synchronization step. There are no
rollback, completion or synchronization events.

Optional strict project configuration:

```yaml
version: 2
primaryRepository: owner/repository
primaryBranch: main
preferredLanguage: zh-CN
checkpointAcceptance:
  test-spec: delegated
  implementation: delegated
```

Only the seven checkpoint keys and consensus/delegated values are accepted;
missing entries use the defaults. Consensus recognizes user only; delegated
recognizes user/delegate. Tightening naturally invalidates delegate acceptance
without rewriting it. Policy is not operational authorization or authentication.
Content language precedence is Idea → project → user → en-US; canonical BCP 47
tags and existing credential-free GitHub primary URL normalization remain.

### Check boundary and Agent responsibility

**Check observes event state, current folder revision/direct upstream,
acceptance policy, history/protocol, standardization and synchronization only.
It does not judge tests, CI, report truth, case completeness, tested code or
declared commit/path binding.** A passing Check is not proof of real-world
outcomes.

Implementation supporting submission material records which TEST CASES were
added/deleted/modified and which commit they were submitted to. Before delegated
acceptance, the Agent verifies passing local tests or CI including that commit.
These are prompts/material, not a tracked-declaration Schema, scope-path
contract, test process or CI predicate. Details belong in implementation
supporting files, not event bodies.

Deployment prompts require Agent self-testing of the actual deployed result,
then explicit USER hands-on acceptance through deployment accept. No separate
user-acceptance checkpoint, fixed report Schema or machine “all cases pass”
gate. Reports and attachments are optional same-folder supporting material.

### Immutable created-first Schema and history

The first unique created row declares idea, at, eventSchemaCid and optional
language; no bootstrap file. A fixed minimal bounded reader discovers identity
and trust, then validates the **entire** log, including created, against the
known trusted self-contained Draft 2020-12 Schema. Unknown CID fails without
fallback, implicit migration, remote refs or substitution of execution identity.

Schema identity uses RFC 8785 JCS UTF-8 without BOM/newline, SHA-256 and CIDv1
raw/base32. Serialization follows the RFC's ECMAScript primitive rules and
UTF-16 key ordering, rejects non-I-JSON values and is checked against RFC
vectors. The build emits exact `dist/event-schema.json` and `event-schema.cid`;
Idea and commit CARs contain `resources/schemas/events.json` offline. Report
checkCid is the separate execution identity.

Events are bounded canonical UTF-8/LF with a final newline, at most 1 MiB/4096
rows; snapshots retain the 16 MiB/2048-file bound. Preserve immutable created
identity and primary's exact original byte prefix. Invalid encoding, extra
fields, links, unsafe paths, conflicts, cancellation and concurrent changes
cannot silently pass. Creation uses an exclusive operation-owned lock, safe
exclusive directory writes, fsync and content/mode/HEAD revalidation. IDs remain
UTC YYYYMMDDHHmm plus four cryptographic hex characters; exclusive creation
retries at most 16 collisions without overwriting existing Ideas.

Historical idea.json/checkCid/id/version and old paired/inline events remain
readable/checkable under their original isolated data/evidence contract. New
navigation requires explicit migration; this turn adds no migration, conversion,
old event writes or historical CID changes. The old library append helper now
fails read-only rather than advancing historical Ideas. Historical reference
definitions remain separately retained. Archived `.silvermoon/ideas` is not
scanned; there is no implicit guidance or repository skill execution.

## Commands

```text
silvermoon check-setup --audience agent
silvermoon check-project --audience agent
silvermoon create-idea --language zh-CN --json
silvermoon check-idea <idea> --audience agent
silvermoon check-changes [--worktree | --staged | --commit <full-sha>] [--allow-delete <idea-id>] --audience agent
silvermoon get-reference <cid>
silvermoon list-ideas --all --state requirements --query literal --sort oldest --limit 10 --json
```

Setup requires no Git project; Project uses the shared four prerequisites plus
the effective fail-closed pre-commit hook check. Checks never install/execute a
hook or change Git content. Creation reuses Project preflight and revalidates
under lock. Idea requires an explicit ID/alias and follows global → repository →
branch → silvermoon-folder → idea-folder → the seven folders above (12 total).
The generated [Idea Spec](../../docs/silvermoon-single-checker.yaml) and runtime
share canonical documentation/factories; no duplicate runtime state model
exists.

check-changes is an independent snapshot/history Task, allowing unfinished
Ideas, dirty worktrees, detached HEAD or missing upstream. Default is worktree
against HEAD; staged uses index against HEAD; exact commit uses its first
parent. Only changed Ideas are fully checked. Whole deletion requires
independently authorized repeatable allow-delete; partial deletion remains
invalid. Events are edited directly preserving canonical bytes; no event
mutation CLI.

Inventory reads current local metadata without fetch/hygiene. It explicitly
reports local fresh=false context; unavailable/disagreeing primary tracking
gives unknown status, not fabricated completion. Historical inventory keeps
original semantics; current flat observation never reads historical test
evidence. Canonical ID navigation scopes identity/history reads to the selected
Idea.

JSON and audience are exclusive. Both readable audiences render `pass` on
success and checkpoint/Rule problems plus exact bounded offline documentation on
gaps. JSON report remains
`{schema:"silvermoon/v2",checkCid,target,result,documents}`. Errors use stderr
`{error:{code,message}}`. Exit 0 covers normal Idea gaps; invalid
snapshot/readiness or execution faults use 1; usage uses 2. get-reference
preserves exact existing CIDs; unavailable content does not fall back. Report
documentation is inert and grants no permission.

The Host selects four independent Task CARs; it never decides lifecycle state.
Idea/Project transport is `{target,runtime,refresh?}`, Setup/commit is
`{target,runtime}`. Explicit runtime/userHome Git context is async-local,
noninteractive and isolated; no ambient tokens, arbitrary GIT_* or NODE_OPTIONS
are forwarded. refresh may fetch primary, never pull/merge/rebase/push. Global
installation/personal canonical skill links need separate authorization.

## Checkpoint authoring and build

Canonical standardization definitions live in src/checkpoints subdirectories;
new progression definitions/factories share `src/checkpoints/flat.ts`.
`src/checkpoints/catalog.ts` composes each independent Task and retains original
historical definitions separately. `src/specifications.ts` owns Task
descriptions and strict business Target schemas. Four generated Specs are
preview snapshots:

```text
pnpm --filter @silvermoon-work/silvermoon generate-specs
pnpm exec prettier --write "docs/silvermoon-*.yaml"
pnpm exec turbo run build --filter=@silvermoon-work/check.silvermoon
pnpm check
```

CLI and private author use the same existing Check Builder helper, producing
Idea/commit/Project/Setup CAR/bindings without upload or publication. The CLI
bin keeps executable permissions after rebuilding. npm release still requires
exact version/SHA authorization, successful exact-main CI and Trusted
Publishing; prepublishOnly remains `publish-gate check`. Historical CARs stay
immutable.

## Test isolation

Default test/test-coverage/root check never initialize real Git repositories,
launch Git, child CLIs or real Task Engine workers. Prepared object/mode/blob
snapshots and controlled filesystem/device/host boundaries exercise real
protocol/history logic; offline CAR resources are verified without worker
execution. test/no-native.ts fails closed on unmocked execution. All source
remains included with the four global 90% coverage thresholds.

Retained native regressions stay separate under native-test, outside default CI,
with owned fixtures, explicit opt-in and a ten-minute outer bound:

```text
pnpm exec turbo run native-test --filter=@silvermoon-work/silvermoon
```

They are historical compatibility regressions, not certification of the new
contract. Do not run them in default tests or this implementation task. No
native compatibility claim follows from mock unit checks. Use the root's exact
Node/pnpm and effective configured registry; do not implicitly upgrade/install.
