# Implementation evidence

Implement and verify the agreed Test Spec. Do not alter signed standards or
plans without renewed signoff. Record an append-only `verify` batch with the
entire five-revision vector, current exact Git HEAD subject, exact environment,
and a passing result plus nonempty file evidence/digest for every required
implementation case. Store evidence under `evidence/implementation/`. Logs
support a verifiable claim; an Agent `completed` flag is not evidence. Commit
subsequent evidence/event changes separately; source changes since the tested
commit invalidate its applicability. No human result gate exists.
