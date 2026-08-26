# v5 Phases: The Unification Waves

Status: adopted 2026-08-26. Six waves, two coordinated releases. Wave files under `waves/` are the work orders; this document is the map. Sizing: S ≈ days, M ≈ a week, L ≈ two weeks of focused work.

## The Graph

```text
wave 0 (evidence and net)
   ├──→ wave 1 (one channel) ──→ wave 2 (one preview) ──→ wave 3 (routing and loop) ──→ release 0.5
   └──→ wave 4 (field-editor spine) ─────────────────────────────────────┐
                                                                          └──→ wave 5 (hosts and release) ──→ release 0.6
```

Wave 4 depends only on wave 0 and may run in parallel with waves 1–3: it touches `@input/pen-dom` and conformance while waves 1–3 touch `@input/pen-ai` and document-ops. Wave 5 depends on both arms (it declares the matrix over what survives, and re-measures the react binding after the AI teardown).

Ordering inside the AI arm is load-bearing: the XML edit channel goes first (wave 1); the buffered markdown preview and selection-rewrite presentation migrate second (wave 2), because the generation-execution path consumes the planner's preview parsing and must be off it before the planner lane is deleted (wave 3). Reversing waves 2 and 3 would strand the preview on deleted plumbing.

## The Waves

| Wave | Name               | Rules discharged                | Size | Packages touched                                           |
| ---- | ------------------ | ------------------------------- | ---- | ---------------------------------------------------------- |
| 0    | Evidence and net   | none (baselines, registry, map) | S    | `spec/`, `scripts/`, evidence only                         |
| 1    | One channel        | UC1, UC2 (partial UC9)          | L    | `pen-ai`, presets, playground, examples, docs              |
| 2    | One preview        | RS1–RS6                         | M    | `pen-ai`, `pen-dom` (styles), playground, binding docs     |
| 3    | Routing and loop   | UC3–UC8, UC9 (release 0.5)      | L    | `pen-ai`, document-ops, types (if vocab exports move)      |
| 4    | Field-editor spine | FE1–FE5, FE7, FE8               | L    | `pen-dom`, conformance                                     |
| 5    | Hosts and release  | HB1–HB7, FE6 (release 0.6)      | M    | docs, examples, presets, transports, bindings, conformance |

## Releases

- **0.5** ships after wave 3: one coordinated minor across the published packages the AI arm touched, one migration note covering the channel teardown (`editChannel` gone, strategies gone, fallback gone, planner exports gone, staleness change). Per API7: breaking is legal in a minor, no deprecation window, hosts pin the previous minor if they need the XML channel.
- **0.6** ships after wave 5: spine consolidation (no public API change expected from FE; the release exists so hosts pick up the scheduler wiring and any binding manifest changes) plus the declared host contract (matrix, presets declaration, transport tiers).
- Changesets accumulate per wave as usual; the release waves verify one coherent version bump and note, not many partial ones.

## Standing Gates

Every wave, in addition to its own gates:

- `pnpm build && pnpm typecheck && pnpm test` green at wave close.
- Conformance suite green for any wave touching `pen-dom` or presentation (`waves 2, 4, 5`).
- `pnpm check:instruments` green — instruments stay honest while the tree changes under them.
- `node scripts/coverage-rules.mjs` — v5 families report (not fail) until claimed; the report shrinks monotonically per wave.
- `node scripts/v3-gates.mjs --waves-dir spec-v5/waves --scope-lint` — gate hygiene for this train's own wave files.
- api-report checks pass; any barrel diff carries its regenerated report in the same PR (HB7).
- Size-limit baseline: waves 1–3 must shrink or hold `@input/pen-ai`'s budget; a growth diff needs a stated reason in the PR.

## Working Agreements In Force

WA1–WA10 inherited (see `00-concept.md` §8), WA11 added. Per-wave teeth: WA9 (a wave that ships a winner and keeps its loser is failed at review) and WA11 (deletion PRs land before refactor PRs in the same area) are checked explicitly in every wave's exit review.
