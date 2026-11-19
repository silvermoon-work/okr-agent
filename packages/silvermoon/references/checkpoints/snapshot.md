# Invalid snapshot

## snapshot

Repair the reported structural, identity, event, regular-path, language or
capacity error in the selected snapshot. `check` defaults to committed HEAD;
`--worktree`, `--staged`, `--commit` and `--remote` select distinct snapshots.
Incomplete consensus and pending evidence can still be valid snapshots. Never
commit a candidate whose applicable snapshot check fails. No archive or guidance
files are parsed by snapshot validation.
