# v5 Waves: Execution Protocol

Work orders for the v5 unification train (`../05-phases.md` is the map). The protocol is inherited from the v3/v4/better-ai trains, with their recorded lessons applied:

- Wave files contain **work and gates, no status prose**. Execution state lives in PRs and the tree, not in the spec (WA2). When a wave completes, its file gains only a dated completion line at the top.
- Gates use the machine-extractable format: `- GATE <wave>.<n> [kind]: command` followed by an indented `expect:` line. Kinds are `script`, `grep`, `test`, `bench`. Check hygiene with `node scripts/v3-gates.mjs --waves-dir spec-v5/waves --scope-lint`.
- Gate lessons already paid for by earlier trains, applied here: gates name test **files**, never `-t`/positional name filters (a filter matching nothing exits 0 and the gate cannot fail); gate numbers are `<wave>.<n>` with no letter suffixes; a gate whose command cannot fail is a defect in the wave file, not a passing gate.
- A gate that names a test file which does not exist yet is **expected to fail before the wave lands** — that is the point. Entry gates must pass before starting; exit gates must pass to close.
- Every wave states its package boundary ("Packages touched"). Work outside the boundary belongs to another wave; finding some is a stop-and-replan signal, not a license to expand.
- Deletion lists are explicit file paths where knowable, so `git log --diff-filter=D` can be checked against the wave after the fact (WA5 posture).
- WA11 (subtract before you shape) is checked at PR granularity inside each wave: deletions land first.

| Wave | File                           |
| ---- | ------------------------------ |
| 0    | `wave-0-evidence-and-net.md`   |
| 1    | `wave-1-one-channel.md`        |
| 2    | `wave-2-one-preview.md`        |
| 3    | `wave-3-routing-and-loop.md`   |
| 4    | `wave-4-field-editor-spine.md` |
| 5    | `wave-5-hosts-and-release.md`  |
