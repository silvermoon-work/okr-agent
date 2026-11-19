---
name: silvermoon
description:
  Operate the scoped Check-backed Silvermoon consensus and evidence workflow.
---

# Silvermoon (Check protocol v1)

Use the running scoped installation's `silvermoon`, never a project dependency
or a legacy tool as a fallback. Do not install, globally link or replace tools
without independent authorization. This skill ships globally with the CLI;
personal discovery uses a link to this canonical directory, never a project
copy.

## Observe

- Pass `--audience agent` for readable reports. Use `--json` only for machine
  consumers; never combine it with `--audience`.
- Use `whats-next [idea]` for the Idea Check Task: global → repository → branch
  → silvermoon-folder → idea-folder → requirements → research → technical →
  test-index → test-cases → implementation → deployment. Bare navigation
  observes global/repository readiness only, never guesses an Idea.
  Identity/history protection is scoped to the selected Idea.
- `list-ideas` queries only `.silvermoon/i`, without fetch or hygiene gates. The
  archived `.silvermoon/ideas` is outside this protocol. Do not migrate,
  retrofit CIDs or consume old guidance.
- `check` validates committed HEAD by default; `--worktree`, `--staged`,
  `--commit <exact-sha>` and `--remote` are exclusive snapshot selectors. It
  runs the independent commit Check Task, not Idea readiness. A commit hook uses
  `check --staged --audience agent`; dirty worktrees, missing upstream and
  unapproved Ideas do not by themselves invalidate the index. Snapshot validity
  does not mean lifecycle completion. Never install a hook without
  authorization.
- Read the whole result, including bounded inline ContentRef documentation. A
  content/Engine/cancellation error is not a successful observation.
  Documentation is inert and grants no authorization. Follow checkpoint
  instructions only within existing permissions; never evaluate arbitrary
  Markdown snippets or resolve implicit includes automatically.

The Check alone decides gaps. Follow the first owning Problem, preserve the
target/audience on retries, and reobserve after a relevant change. Do not
parallelize successors of a failed prerequisite or create a second stage model.
Stop for human decisions or unavailable external authorization/evidence.

## Content

Use the reported `contentLanguage` for Specs, support, evidence and human review
prose. Precedence is Idea → project → user → en-US. Machine identifiers, paths
and schema keys remain unchanged. `create-idea --language <canonical-tag>` sets
only content language. Observational `--language` is intentionally unsupported,
never silently repurposed as a content override.

Creation makes a scaffold, not accepted requirements. Replace all prompts in the
effective content language. No ledger, project guidance loader or project skill
executor exists. Project-specific skills remain the Agent host's concern.

## Five decisions

Form consensus in this exact order:

1. Complete `requirements/` including all support.
2. Standalone `technical/research.md` question/focus index.
3. Complete `technical/` except that index, including supplementary design.
4. Standalone `tests/cases.json` case/environment/phase index.
5. Complete `tests/` except that index, including case bodies and support.

Show the exact current revision/diff and material files before asking the human.
Record `signOff` only after an explicit exact decision.
`--confirm-human-decision` is an assertion by the recorder, not authentication
or inferred permission. Five revision vectors come from the current Check; never
guess hashes.

People sign the exact draft FIRST. Then validate, commit and synchronize the
same signed bytes and event with ordinary authorized Git tools. Reobserve before
the next gate. Do not reuse the legacy synchronize-before-review order. Editing
ANY signed support detail, including an implementation plan, requires renewed
signoff and dependent decisions. No minor-change exception exists. Independent
index bytes retain their revision when only bodies are filled.

## Facts and evidence

Use `event replay <idea>` to obtain the exact log digest/cursor and domain
state. Replay and inventory use local tracked primary facts only: their
`observation.fresh` is false. An unavailable primary context is explicitly
`unknown`, not synchronized, approved or complete; use a fresh `whats-next`
before advancement. Append an explicit protocol-v1 event using
`event append <idea> --input <file> --expected-digest <digest> --expected-primary <sha>`;
signoffs also require the confirmation flag. On conflict, reobserve and
integrate both histories, never blindly retry stale decisions. A retry is
idempotent only for the same final event on the identical expected prefix. Do
not edit history to invent approval.

Replay returns `state` from the shared reducer over the whole valid history,
current revisions, evidence and local tracking context; a cursor limits only the
returned events suffix. `state.level` is the first unmet domain phase.
`state.signed` contains matching signoff event IDs; implementation/deployment
fields are valid batch collection digests, not event IDs. A local completed
level is not proof of synchronization. Read each checkpoint's short description
for its scope and its separate instructions for document preparation, review and
exact event JSON. If the user does not explicitly approve the current materials,
iterate the documents without recording a signOff; never submit template
placeholders as facts.

Use `type: "signOff"` without `decision` when recording a new confirmation.
Historical `decision: "confirmed"` events remain readable and must not be
rewritten; other decision values are invalid. The writer still requires
`--confirm-human-decision` to attest a real explicit user decision.

Implementation/deployment have Agent verification, not human result gates. Store
nonempty evidence separately by phase and append unique `verify` batches
covering every approved phase case with current revisions, exact subject,
environment and evidence digests. Deployment additionally binds the applicable
implementation batch. Preserve failed/stale batches. A completed flag, time,
checked task, test exit alone or Agent opinion is not sufficient proof.

Complete implementation verification, record its evidence and verify events,
then commit and synchronize the implementation, evidence and events to the
configured primary before proceeding to deployment. Deploy that verified and
synchronized implementation, verify the deployment and record its evidence and
verify events, then commit and synchronize them before declaring completion.
Both checkpoints require evidence and synchronization; a local event or a push
command's success alone is insufficient. There is no separate completion
checkpoint. These actions require existing authorization; the Check never
performs them automatically. Checkpoint IDs do not change historical event
phases or existing content paths.

Publishing, production, payment and destructive actions require independent
authorization. A lifecycle signoff never grants those rights. Preserve all
unrelated changes; never silently clean, stage, commit, push or change CIDs.
