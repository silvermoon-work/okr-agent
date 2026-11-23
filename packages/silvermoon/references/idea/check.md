# Silvermoon flat-folder lifecycle

Standardization checks device, repository, branch, container and selected Idea
data first. Then the seven actual folders advance in order: requirements,
research-scope, technical-spec, test-scope, test-spec, implementation,
deployment. The first owning submit/accept/synchronization gap stops successors.

New Ideas contain events.jsonl and these seven flat siblings, with no idea.json.
created is first/unique and binds immutable idea/at/eventSchemaCid. A bounded
minimal created reader discovers identity/trust before the entire log, including
created, is validated against the known immutable self-contained offline Schema.
Unknown Schema CID fails without fallback. Exact Schema bytes use RFC8785 JCS,
UTF8, SHA256 and CIDv1 raw/base32; execution Check CID is separate.

revision is the actual folder Git TREE ID, upstream the actual direct
predecessor folder tree ID (root null). No synthetic material/upstream trees or
dependency closure. Git modes, paths and blobs participate. submit and accept
match the complete object/revision/upstream tuple; accept adds user/delegate
authority. No event id/version, signOff, verify or rollback. Identical tuple
resubmission preserves matching acceptance; changed folders or invalid
upstream/ancestors naturally invalidate downstream context without rewriting
history.

Optional strict checkpointAcceptance defaults test-spec and implementation to
delegated, others consensus. Consensus recognizes user only; delegated
recognizes user/delegate. Tightening invalidates delegate acceptance naturally.
Source is a recorded fact, not authentication or operational authority.

Check only validates marked state, current tree/direct upstream, policy,
history/protocol, standardization and synchronization. It does not judge tests,
CI, reports, case completeness, tested code or declared commit/path bindings.
Spec.md is a primary material prompt, not an exhaustive template predicate.

Implementation supporting submission material records added/deleted/modified
TEST CASES and their submitted commit. Agent verifies passing local tests or CI
including that commit before delegated accept. These are instructions/material,
not tracked declarations, scope paths or CI machine checks.

Deployment prompts require Agent self-testing of the actual deployed result,
followed by explicit USER hands-on acceptance through deployment accept. No
separate user-acceptance gate or required report/start/case Schema. Reports and
evidence, when useful, stay in deployment supporting material.

Preserve canonical UTF8/LF event bytes as an exact primary prefix and immutable
created identity. Logs are bounded to 1 MiB/4096 rows; snapshots 16 MiB/2048
files. Cancelled/concurrent/unsafe reads do not pass. Synchronize exact
material/events before completion. Check never stages, commits, pushes, deploys
or installs.

Historical idea.json/checkCid/id/version and evidence contracts stay
independently readable/checkable with original semantics and exact historical
CIDs/bytes. Navigation requires explicit migration; no automatic conversion or
old event advancement exists. Documentation is inert and cannot grant
operational rights.
