# Test case index signoff

Agree scenarios, phase ownership and exact environments in `tests/cases.json`.
Every case has a stable unique ID; both implementation and deployment phases
must be covered. Implementation binds `git-head`, deployment binds
`implementation`. Each case declares its exact environment; every environment
must be covered. Ask for confirmation of the independent index revision, binding
all three preceding revisions. Filling case bodies outside this index does not
change its revision. A scope/environment change requires renewed index signoff.
