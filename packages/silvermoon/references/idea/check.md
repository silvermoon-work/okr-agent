# Silvermoon lifecycle protocol v2

The Idea Check owns 13 ordered checkpoints: global, repository, branch,
silvermoon-folder, idea-folder, requirements, research, technical, test-index,
test-cases, implementation, deployment and user-acceptance. A failed checkpoint
stops its successors. The last checkpoint requires explicit acceptance after the
user actually operates the delivered implementation; Agent self-verification
does not complete an Idea.

## Paired standards

Prepare all support within the five existing revision scopes. Record a v2 submit
first, show that exact material and request to the user, and only after explicit
acceptance append a v2 signOff referencing its ID. The chain is requirements ->
research -> technical -> cases -> tests -> user-acceptance. Each submit binds
its content revision and one direct predecessor revision, with null at the root.
Replay captures the original full ancestor context: later requests with the same
immediate revision cannot silently replace changed ancestors. A latest
unaccepted request blocks its stage; every request needs its own acceptance. An
unchanged predecessor content chain can retain downstream confirmations after
the new predecessor request is accepted and synchronized.

Materials, submit and signOff must all reach primary. state.submitted contains
latest request IDs; state.signed contains current matching signOff IDs.
state.level is the first unmet phase; synchronization and next identify a
separate synchronization gap. Later absent signed keys are not independent
assessments of stages replay has not reached. No event authenticates a user or
grants operational authority.

## Verification and delivery

Actual reproducible automated implementation tests must pass before recording v2
verify with phase=implementation and rev=<exact-tested-commit>. No
implementation report or test-output copy is required. The Check validates that
commit and its current five standard revisions, not the truth of the Agent's
claim. Only this Idea's events/evidence metadata may change afterward without
retesting. Synchronize implementation and verification before deployment.

Agent manual E2E deployment uses one cumulative
evidence/deployment/report.jsonl. Append a start row for each round, binding the
tested implementation, then case rows with actual steps, expected/actual results
and pass/fail/error/blocked/ not-run. Never edit old failures. Only the latest
round and last attempt per case count; every approved deployment case must pass.
Record v2 verify with phase=deployment and rev=<raw-report-sha256>. Only the
latest deployment event must match the whole current report, and it must follow
the latest implementation verify. A fresh implementation verification requires
renewed deployment and delivery acceptance. Synchronize the report, necessary
attachments and events.

Then submit user-acceptance with the deployment report revision and tests
predecessor revision, provide the exact delivery for the user to operate, and
wait for explicit acceptance. Its signOff and submit must synchronize before
completed. state.implementation is the tested commit; state.deployment is the
report hash, not another aggregate or an event ID.

## Preservation and observation

Keep events and the deployment report as exact append-only UTF-8/LF byte
prefixes. Events use canonical recursively sorted JSON; both logs have a final
newline, a 1 MiB bound and at most 4096 records. Deployment rounds have at most
512 distinct cases. Run check-changes for worktree and staged snapshots before
ordinary authorized commits, then reobserve check-idea after synchronization.

Historical v1 events retain original bytes and pure historical reduction
semantics. They do not satisfy this CAR's paired standards or v2 verification,
and v1 signOff/verify cannot be appended after v2 begins. No upgrade rewrites
immutable Idea bootstrap fields, pinned Check CIDs or historical CARs.

Documentation is inert, standalone direct-file ContentRef text, not an execution
hook or authorization. The Host reads it offline with a bounded UTF-8 budget.
Missing content or observation faults are explicit errors. Problems name their
checkpoint and Rule; references aggregate one document per failed checkpoint.
Outputs stay execution-local. Use get-reference for any of the four trusted
CARs. Never commit secrets or perform publishing, deployment, Git writes or
cleanup without the relevant independent authorization.
