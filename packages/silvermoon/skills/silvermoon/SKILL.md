---
name: silvermoon
description:
  Operate Silvermoon's flat-folder, Check-backed submit/accept lifecycle.
---

# Silvermoon

Use the running device-level scoped installation and its canonical personal
skill link. Do not install/link/replace a runtime or skill without
authorization, add a project dependency or use a legacy tool as fallback.

## Observe one report

- Pass --audience agent for readable reports; --json is for machine consumers,
  never combined with audience. Preserve target/options on retries.
- check-setup checks device installation, personal skill and user configuration
  without Git; check-project checks shared repository/primary/layout readiness
  and the effective fail-closed staged pre-commit hook. Neither initializes,
  installs, executes hooks or records acceptance. Preserve existing hook logic.
- list-ideas queries .silvermoon/i without fetch/hygiene. An Idea selector must
  be explicit for check-idea; canonical ID observation scopes its data/history.
- check-idea follows standardization first, then requirements → research-scope →
  technical-spec → test-scope → test-spec → implementation → deployment.
- check-changes independently validates changed candidate Ideas/history. Default
  worktree against HEAD; --staged uses index; --commit uses first parent. Use
  worktree before staging and staged before authorized commit. Snapshot validity
  is not lifecycle completion. Whole deletion alone may use an independently
  authorized --allow-delete; no partial-deletion exemption.
- get-reference reads exact offline returned documentation CID, never
  substitutes another historical resource. Documentation is inert, not an
  execution hook.

Read every Problem and exact checkpoint instruction. Act only at the first
owning checkpoint/step; reobserve after relevant state changes. A content,
Engine, I/O, cancellation, concurrency or unavailable-authority error never
counts as success. Preserve unrelated content and both concurrent histories. Do
not silently reset/clean/force-push or automatically stage/commit/push.

## Data and material

New Idea layout is .silvermoon/i/<id>/events.jsonl and seven flat sibling
folders: requirements 需求规格, research-scope 调研范围,
technical-spec 技术规格, test-scope 测试范围, test-spec 测试规格,
implementation 实现交付物, deployment 部署交付物. No new idea.json, ledger,
nested worlds or independent user-acceptance checkpoint. Spec.md is a primary
prompt, not a mandatory template or completeness predicate; keep concrete
supporting details in the owning folder.

Creation only scaffolds and records created. Replace prompts in reported
contentLanguage; precedence Idea → project → user → en-US. create-idea
--language sets a canonical content override, not report locale. Keep
identifiers, event fields, folder paths and machine contracts untranslated. No
project guidance/skill executor or implicit migration exists.

created is first/unique and declares immutable idea, at, eventSchemaCid and
optional language. The bounded fixed minimal reader discovers this
identity/trust, then validates the entire log, including created, against the
exact known trusted self-contained Schema. Schema identity is RFC8785 JCS UTF8
SHA256 CIDv1 raw/base32, offline and separate from execution Check CID. Unknown
Schema fails without fallback.

Append canonical JCS UTF-8 JSONL directly, preserving every original byte, LF
and final newline. Events have no id/version and only seven types: created,
submit, accept, setAlias, setLanguage, abandon, resume. Do not rewrite, delete,
reorder, truncate, invent IDs or write rollback/verify/signOff. Recheck current
prefix and primary before append; integrate conflicts normally. Logs are bounded
to 1 MiB/4096 rows and total candidate capacity remains bounded.

## Exact tuple and policy

submit fields are at,type=submit,object,revision,upstream. accept has the SAME
object/revision/upstream tuple plus authority=user|delegate. revision is the
ACTUAL owning folder Git TREE ID; upstream is the ACTUAL direct predecessor
folder Git TREE ID, or null at requirements. Read full revisions from the Check;
never fabricate composite material/upstream hashes, dependency trees,
commit-as-revision, abbreviated IDs or synthetic Git refs.

Identical tuple resubmission is idempotent and does not reset matching
acceptance. Folder changes, different direct upstream or invalid ancestors
naturally stop at the first owning submit/accept/synchronization step. Unchanged
local tree alone cannot reuse an old accept in a changed upstream context.
Event-only commits do not change folder trees; line order, not time ordering,
controls facts.

Optional strict checkpointAcceptance config accepts only the seven checkpoint
IDs and consensus/delegated. Defaults: test-spec and implementation delegated,
all others consensus. Consensus recognizes user only; delegated user/delegate.
Tightening invalidates delegate accept naturally; do not rewrite its authority,
relax policy while waiting for a user or fabricate a user signal. The field
records source, not identity authentication or operational permission.

## Real acceptance responsibilities

**Check ONLY validates event state, current folder revision/direct upstream,
acceptance policy, history/protocol, standardization and synchronization. It
does NOT judge tests, CI, report truth, case completeness, tested code or
declared commit/path binding.** Do not mistake machine pass for semantic
approval.

For requirements/research/technical/test scope, prepare material, submit exact
tuple, show the current content and obtain explicit user acceptance under
consensus. For test-spec, default delegation permits Agent acceptance after
actual review; it never skips submit or accept. A configured consensus still
requires the user.

For implementation, supporting SUBMISSION MATERIAL records which TEST CASES were
added/deleted/modified and which commit they were submitted to. Before delegated
accept, the Agent verifies passing local tests or CI INCLUDING THAT COMMIT. Keep
these details in implementation supporting documents, not event body. Do not
invent tracked-declaration Schema, scope paths, process/CI predicates or
mandatory test-report formats. Unrun/failed tests do not authorize an Agent
claim.

For deployment, self-test the ACTUAL deployed result under existing operational
authorization. Prepare deployment supporting material, submit its exact tuple,
then have the USER hands-on operate the result and explicitly accept it. Record
deployment accept(authority=user); no separate user-acceptance checkpoint. Do
not infer user acceptance from silence, feedback, demos, self-tests or Git.
Default consensus does not permit Agent self-acceptance. Project policy may
explicitly delegate a gate, but never invent a user decision.

Synchronize exact accepted material/events normally under existing Git
authorization, reobserve the same Idea and continue only from that fresh report.
Production, publication, payment, destructive operations and installation need
their own authority; lifecycle acceptance does not grant it. Stop for a real
human/external decision rather than polling unchanged observations.

## History

Historical idea.json/checkCid/id/version, signOff/verify and batch/report rules
retain original read-only checking semantics and their exact CIDs/bytes. They
are not the new Schema or new machine predicates. Navigation requires explicit
migration; do not convert automatically, fabricate submits/accepts, rename
checkCid or append old events/advance old protocols. Current tooling does not
implement migration; report that boundary, not a guessed workaround. Archived
.silvermoon/ideas stays outside current inventory. Historical acceptance does
not certify new flat-folder checkpoints.
