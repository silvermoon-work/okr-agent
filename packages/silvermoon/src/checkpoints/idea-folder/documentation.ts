import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "idea-folder",
  title: "Idea 数据与版本已标准化",
  description:
    "Validate trusted created-first flat events, append-only identity/history and the actual seven folder trees.",
  instructions: `Read only the selected Idea. New layout:
.silvermoon/i/<id>/events.jsonl plus requirements, research-scope, technical-spec,
test-scope, test-spec, implementation, deployment. No idea.json or nested worlds.

Read the bounded first created row's idea, at, eventSchemaCid and optional language,
then validate the ENTIRE log, including created, against the exact offline trusted
self-contained Draft 2020-12 Schema. Unknown CID fails without fallback.
Schema bytes use RFC 8785 JCS, UTF-8 without BOM/newline, SHA-256 and CIDv1 raw/base32.
Check execution CID is separate from data Schema identity.

Events have no id/version. Only created, submit, accept, setAlias, setLanguage,
abandon and resume exist. submit = at,type,object,revision,upstream.
accept adds authority=user|delegate and must match the same complete tuple.
Root upstream is null; each later upstream is the actual direct predecessor folder
Git tree ID. revision is the actual owning folder Git tree ID, including Git modes
and blobs. Never construct material/upstream composite trees or dependency closures.
Line order, not timestamps, controls history. Identical tuple submit is idempotent
and preserves matching acceptance. A changed folder or invalid predecessor stops at
the first owning submit/accept/synchronization step. No rollback or event IDs.

Optional strict project checkpointAcceptance accepts only the seven checkpoint IDs
with consensus/delegated values. Defaults delegate test-spec and implementation;
all others are consensus. Consensus recognizes user only; delegated recognizes
user or delegate. Tightening policy naturally invalidates delegate acceptance.
Acceptance source is a recorded fact, not authentication or inferred authorization.

Check validates data safety, current revisions/upstream, event state, acceptance
policy, history/protocol, standardization and synchronization ONLY. It never judges
tests, CI, report truth, case completeness, tested code or commit/path declarations.
Required material folders must be safe, readable and measurable; Spec.md is a prompt,
not an exhaustive template gate. Implementation submission details belong in supporting
material: added/deleted/modified TEST CASES and submitted commit. Before delegated accept,
the Agent verifies passing local tests or CI including that commit. Deployment requires
Agent self-test of the actual deployed result followed by explicit USER hands-on accept;
there is no separate user-acceptance checkpoint.

Preserve immutable created identity and exact UTF-8 event prefix against primary.
Events are bounded to 1 MiB/4096 LF-terminated canonical rows; total data remains bounded.
Do not truncate history, rewrite decisions, convert legacy records or substitute CIDs.
Historical idea.json/checkCid/id/version logs remain readable/checkable under their
original isolated contract; navigation and writes require explicit migration.
Unexpected I/O, cancellation and concurrent snapshot changes are execution errors.`,
  rules: [
    {
      code: "idea-folder-identity-immutable",
      description:
        "Created idea, at and eventSchemaCid preserve primary identity; created is first and unique.",
    },
    {
      code: "idea-folder-event-history-append-only",
      description:
        "Preserve primary events as an exact original UTF-8 byte prefix, appending complete canonical LF rows only.",
    },
    {
      code: "idea-folder-data-valid",
      description:
        "Trusted immutable Schema, safe flat layout, bounded canonical history and direct actual Git folder trees are valid. No evidence or semantic content predicates.",
    },
    {
      code: "idea-folder-active",
      description:
        "Explicit abandonment requires an authorized resume, never automatic recovery.",
    },
  ],
  output: {
    description: "One reduction shared by ordered progression checkpoints.",
    fields: [
      {
        name: "state",
        description:
          "Seven actual folder revisions, current submitted/accepted tuples and authorities, effective acceptanceModes, first owning level and submit/accept/synchronization step. Completed only after all recognized accepts and primary synchronization.",
      },
      {
        name: "brief",
        description:
          "Controlled state, event digest, primary and execution Check CID, not raw material or a claim that tests/deployment succeeded.",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
