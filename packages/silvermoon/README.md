# @silvermoon-work/silvermoon

`0.1.0-rc.1` repairs the published `0.1.0-rc.0` candidate's legacy primary URL
compatibility and missing Git execution context in the Check Worker. The new
version is not published merely by building/testing, and does not replace a
global legacy binary or skill.

The CLI hosts the exact Check CAR in a real Task Engine. Each observation owns a
fresh `MemoryStore`, Engine and offline `IpfsStore`; target identity does not
contain mutable revisions or a random nonce. A domain reducer shared by the
Check, writer and replay is the only lifecycle implementation. The Host renders
`pass/documentation/problems`; it never decides a second lifecycle.

The
[Idea-rooted checker-tree design draft](../../docs/silvermoon-single-checker.yaml)
uses Check Bundle Spec v1.0 for ipfsaw preview. One Idea entry owns a
progressive chain of internal checkers: device/repository prerequisites, Idea
observation, five consensus gates with per-gate synchronization, implementation,
deployment and terminal synchronization. This is one business entry, not one
registered checker or three independent lifecycles. It is not implemented; the
current Check still uses Device → Project → Idea.

## Commands

```text
silvermoon whats-next [idea] --audience agent
silvermoon create-idea --language zh-CN --json
silvermoon list-ideas --all --state requirements --query literal --sort oldest --limit 10 --json
silvermoon check [--worktree | --staged | --commit <full-sha> | --remote] --audience agent
silvermoon event replay <idea> [--cursor <cursor>] --json
silvermoon event append <idea> --input event.json --expected-digest sha256:… --expected-primary <full-sha> [--confirm-human-decision] --json
```

`--root <directory>` selects a Git root; audience is `human|agent`. JSON and
audience are exclusive. Both readable audiences render the same report; there is
no interactive TUI. Observation `--language`, old `reference`, and `migrate` are
intentionally unsupported (usage error), never aliases for new semantics.
Creation `--language` remains a content-language override. `list-ideas` also
supports inclusive RFC3339 `--created-after` / `--created-before`, repeatable
state filters, and `--all`; default hides abandoned/completed Ideas.

Exit codes: `0` successful command/observation (including normal lifecycle
gaps), `1` invalid snapshot or execution/data/concurrency/cancellation fault,
`2` invalid command/options. JSON navigation/snapshot output is
`{schema:"silvermoon/v1",checkCid,target,result,documents}`. The result is the
unmodified Check result; documents are bounded offline UTF-8 reads of its direct
ContentRefs. Creation, inventory and event commands return domain objects.
Errors go to stderr as `{error:{code,message}}`; no command reports partial
success after a content/Engine fault. JSON v1 deliberately breaks the legacy
four-projection report shape.

Inventory and replay resolve the actual configured local remote-tracking primary
snapshot without fetching or requiring a clean worktree, upstream branch or
primary ancestry. Both use the same validated tested-subject context as the
Check, so committed evidence remains applicable when only this Idea's files
changed afterward. Their `observation` is explicitly
`{scope:"local",fresh:false,...}`: it records HEAD and the tracked primary
tip/ref/remote. Missing, invalid or disagreeing tracking context produces
`state.level:"unknown"` and
`observation.primary:{status:"unavailable",diagnostic}`, never a fabricated
synchronization or completion. `--state unknown` can select these entries. They
do not certify network freshness or repository hygiene; only `whats-next`
authorizes advancement. `check --remote` inspects the fetched primary snapshot
even when local HEAD is behind or dirty.

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

The business `Target` is `{userHome, repoRoot?, idea?}`. `userHome` is the
user's home, not the Silvermoon config directory; project/device navigation may
omit Idea/repository identity. Config, primary, language and Idea facts are read
from these roots, never supplied as asserted readiness. An Idea requires a
repository.

The Check request separates `{target, operation, runtime}`. Operation contains
lifecycle/snapshot selection and refresh policy. Runtime identifies the current
CLI entry, host executable search path and optional SSH agent socket: these
cannot be inferred from a home directory. `Report.target` contains only the
business Target. `observe(target, {operation, runtime})` supplies defaults from
the authorized running host; direct Check callers supply the explicit request.
There is no arbitrary environment map or repository allowlist.

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
  `revision`, `upstream` and `decision:"confirmed"`. The upstream map contains
  **exactly all preceding gate revisions** in that order. Recorded upstream
  decisions must already exist. The writer also requires the exact current gate
  and `--confirm-human-decision`. This flag is recorder attestation, not
  authentication or a substitute for an actual decision.
- `verify`: a unique `batch` described below; Agent verification is not another
  human signoff.

The Check returns current full revisions and event/primary digests in the
Problem brief. To sign Requirements, for example, use the actual observed values
in an event with `object:"requirements"`, `upstream:{}` and
`decision:"confirmed"`. Never compute approval from prose, silence or Git.

Humans review and sign the exact **draft first**. Until matching bytes AND that
event are committed/synchronized to primary, the state is `synchronization`, not
the next gate. Any signed supplement change rolls back to its gate and
invalidates dependent vectors. Even implementation/deployment plan “minor
refinements” require re-signoff. Independent indexes stay stable while bodies
are filled. All five signoffs are required; there are no waivers or human
implementation/deployment result gates.

### Git and transaction guard checks

The Check follows **Device → Project → Idea**, never three siblings. Project
requires a real HEAD/local branch, upstream matching configured repository and
branch, a refreshed primary tip ancestral to HEAD, append-only primary event
history, and immutable bootstrap identity. GitHub HTTPS/SSH identities are
recognized without accepting credential-bearing URLs. Unknown/mixed worktree
changes block routing; only the current gate's Idea draft/event paths are
allowed. Creation requires clean synchronized HEAD. No command stages, commits,
pushes, cleans or rewrites history; fetch is the only navigation Git side
effect. Snapshot checks validate structure without requiring completion.

Append requires exact `expected-digest` of raw existing JSONL plus freshly
observed `expected-primary`. A single exclusive `.silvermoon/.new.lock`
serializes new writers. The writer validates the whole candidate, fsyncs a
same-filesystem replacement, rereads project bytes/HEAD, then atomically
renames. The lock is removed only if still operation-owned. A
conflict/cancellation is explicit; nothing silently overwrites another decision.
Identical retries are idempotent only for the same final event on the exact
supplied prior prefix. Replay cursors bind an exact event-count/digest prefix,
never approval.

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

CLI build compiles ESM/declarations/maps, then uses the existing Check Builder
and upstream Task Builder to produce `dist/check.car` and `dist/check.json`.
Private author depends on CLI and invokes that same build helper; CLI never
depends on author. The Check bundles the shared domain implementation, not a
legacy Guide or global JavaScript module. Neither build publishes or uploads.
`prepublishOnly` is exactly `publish-gate check`; `deliverable.yaml` opts into
npm. Exact version/SHA authorization, successful main-push CI and Trusted
Publisher readiness are separate release prerequisites.
