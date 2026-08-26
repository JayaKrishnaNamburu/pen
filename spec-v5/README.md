# Pen v5 Specs

This spec set defines the unification train that follows v2 (redesign), v3 (distillation), v4 (strike the scaffolding), and the better-ai set (the edit channel). Those trains each ended with a winner proven and its loser left standing: the tool edit channel won its corpus and the XML channel is still the library default; the preview decoration became the honest streaming surface and five older presentation paths still run beside it; the field-editor spine carries three backends that re-implement each other's wiring; the React binding grew ten times the Vue binding without anyone deciding that. v5 is one sentence: **keep one of each, and finish the three mechanisms left half-wired.**

v5 changes behavior where the evidence already decided it (the edit channel, the preview surface) and consolidates without redesign everywhere else. It adds no new features. Its six waves are: record the owed evidence and build the regression net, delete the losing edit channel, collapse the presentation paths, shrink the routing matrix and the loop, extract the field-editor spine, and declare the host contract.

## How To Read This

In order. The concept document carries the evidence; the numbered documents carry the normative rules; the wave files carry the runnable work orders.

| Doc                        | Defines                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `00-concept.md`            | Why v5: the five debts (measured), the deferral ledger inherited from prior sets, resolved decisions, non-goals, working agreements   |
| `01-channel.md`            | One edit channel: coexistence teardown, tool consolidation, staleness, loop boundaries, route shapes, question intent (UC1–UC9)      |
| `02-review-surface.md`     | One preview surface: presentation consolidation, posture totality, marker semantics, the styling contract (RS1–RS6)                  |
| `03-field-editors.md`      | One field-editor spine: shared backend wiring, gestures, frame authority, cell parity, doc truth (FE1–FE8)                           |
| `04-hosts-and-bindings.md` | The host contract: capability parity, e2e coverage, theme, barrel hygiene, transports, recipes (HB1–HB7)                             |
| `05-phases.md`             | Plan of record: waves 0–5, dependency graph, release mapping                                                                          |
| `waves/`                   | Per-wave work orders with runnable gates; `waves/README.md` is the execution protocol                                                 |

Precedence:

- Where this set and a v2/v3/v4 document disagree about _what to do next_, this set wins once adopted. Where they disagree about _what a kept mechanism is_, the owning train's document wins; v5 does not respecify selection, the apply pipeline, anchors, ops, or empty blocks.
- Where this set and `spec-better-ai/` disagree about the **semantics** of the edit channel, `spec-better-ai/01-edit-channel.md` wins — the `EC` rules stay in force. This set owns the **teardown of the coexistence** those rules were written inside (the flag, the XML channel, the fallback, the planner) and executes the deferrals that set recorded. An EC rule whose text assumes the coexistence (notably `EC12`) is amended with a dated correction in the same PR that removes it, per that set's own convention.

## Conventions

- Normative rules carry stable IDs in four new families — `UC` (channel), `RS` (review surface), `FE` (field editors), `HB` (hosts and bindings) — reserved in `spec/charter/rule-ids.md` per v4 `03-record.md` RC2. All four were checked against the full registry: none collides; `FE` is not a member of the record-only `F` family and `RS` is not a member of the live `R` family, because coverage matching is a complete letter-run (`FE1` is not `F1`, the same distinction the registry records for `OP`/`OPB` and `EC`/`E`).
- No new-family ID is appended to `scripts/claimed-scope.txt` at authoring time. Families join claimed scope in the PRs where their claiming tests land, the same posture v4 and better-ai took.
- `spec-v5` joins `SPEC_ROOTS` and `DERIVED_SPEC_ROOTS` in `scripts/coverage-rules.mjs` in the authoring PR, so unclaimed v5 rules are **reported** (not failed) from day one and cannot be silently forgotten — the same adoption the v4 train performed for itself.
- Gates use the v3 gate format, machine-extractable by the existing runner (`scripts/v3-gates.mjs`). Gate lessons inherited from better-ai's execution: gates name test **files**, never `-t` name filters; gate numbers are `<wave>.<n>` with no letter suffixes.
- Working agreements WA1–WA10 are inherited from `spec-v3/00-concept.md`, `spec-v4/00-concept.md`, and `spec-better-ai/00-concept.md` and govern this set unchanged. WA8 ("no redesign under the broom") applies to waves 4–5 in full; waves 1–3 are design-executing waves for decisions the better-ai set already measured, which is the same fence better-ai itself drew. This set adds WA11 (`00-concept.md`).
- Versioning stays `spec-v2/14-api-and-packaging.md` API7: `0.x`, no deprecation windows, breaking changes are minors. Waves 1–3 ship one coordinated 0.5; waves 4–5 ship one coordinated 0.6.
- Every number in `00-concept.md` was produced by a command against this tree on the stated date. Regenerate rather than trust.
