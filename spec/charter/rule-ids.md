# Rule-ID Registry

Authoring gate for new specs and new claimed rules. Check this table before adopting a family prefix. `scripts/claimed-scope.txt` points here.

This registry **records** collisions and **reserves** families. It does not renumber anything: a rule ID is a permanent citation, so a family that has lost its owning document keeps its row, and a retired member keeps its number rather than being recycled to close a coverage line.

Status:

- **live** — still governs product code or an executing train.
- **retired** — a named member, or the confinement it described, no longer has a subject. The family row stays so the token is reserved.
- **record-only** — evidence, findings, process, or resolved-decision labels. Not a `coverage:rules` test-name family. Do not claim them.

## How A Family Becomes Visible

`scripts/coverage-rules.mjs` derives every family from definition lines matching `DEFINITION_LINE_RE` (`^[-*]\s+([A-Z]+)\d+\s*[.—–]`) across the spec roots — `spec` for durable rules, `spec-v5` for the executing train. There is no hand-maintained inventory list to keep in sync: writing a definition line is what puts a family in scope. A family listed here whose members are not written as definition lines is invisible to the gate, which is why the record-only rows below say so explicitly.

Reserving a family here does not claim it. Do not append an ID to `scripts/claimed-scope.txt` until a test name actually claims it — the coverage gate fails any listed ID with no claiming test.

## Census Commands

Families and collisions below are measured on this tree, not copied from a handed list. Regenerate rather than trust.

```bash
# family → owning file, exactly as coverage-rules derives it
rg -o '^[-*]\s+([A-Z]+)[0-9]+\s*[.—–]' -r '$1' spec spec-v5 --glob '*.md' | sort -u

# the gate's own view: derived families, claimed scope, unlisted IDs
node scripts/coverage-rules.mjs

# claimed-scope leading tokens (comments stripped by the checker)
rg -o '^[A-Z]+' scripts/claimed-scope.txt | sort -u
```

## Families

First column is the bare prefix so a check of the form `\|\s*FAMILY\s*\|` matches.

| family | owning document                     | status      | known collisions                                                                                                                                                              |
| ------ | ----------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S      | `spec/rules/selection.md`           | live        | Wave S was a different namespace                                                                                                                                              |
| A      | `spec/rules/selection.md`           | live        |                                                                                                                                                                               |
| N      | `spec/rules/selection.md`           | live        |                                                                                                                                                                               |
| P      | `spec/rules/selection.md`           | live        | Wave P was a different namespace                                                                                                                                              |
| O      | `spec/rules/selection.md`           | live        |                                                                                                                                                                               |
| T      | `spec/rules/selection.md`           | live        | Wave T was a different namespace                                                                                                                                              |
| C      | `spec/rules/selection.md`           | live        | IME rules; Wave C was a different namespace                                                                                                                                   |
| R      | `spec/rules/facets.md`              | live        | **two meanings, same token**: `selection.md` R1–R3 are reader-window admissibility rules; `facets.md` R1–R7 are facet resolution rules. Not renamed                            |
| SM     | `spec/rules/facets.md`              | live        |                                                                                                                                                                               |
| D      | `spec/rules/commands.md`            | live        | command dispatch. The v3 design-defect labels that shared this token are gone with their tree, so `COLLISION D` no longer fires                                                |
| K      | `spec/rules/commands.md`            | live        |                                                                                                                                                                               |
| B      | `spec/rules/commands.md`            | live        |                                                                                                                                                                               |
| ST     | `spec/rules/pipeline.md`            | live        |                                                                                                                                                                               |
| OP     | `spec/rules/pipeline.md`            | live        | prefix of OPB; coverage matches a complete letter-run, so `OPB1` is not `OP1`                                                                                                 |
| OPB    | `spec/rules/pipeline.md`            | live        |                                                                                                                                                                               |
| PR     | `spec/rules/pipeline.md`            | live        |                                                                                                                                                                               |
| AN     | `spec/rules/anchors.md`             | live        |                                                                                                                                                                               |
| AS     | `spec/rules/anchors.md`             | live        |                                                                                                                                                                               |
| OB     | `spec/rules/observation.md`         | live        |                                                                                                                                                                               |
| INT    | `spec/rules/observation.md`         | live        | `I` is a prefix of `INT`; complete letter-run, so `INT1` is not `I1`                                                                                                          |
| SCH    | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| G      | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| OV     | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| DIR    | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| BR     | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| M      | `spec/rules/dom.md`                 | live        | bidi motion; Wave M was a different namespace                                                                                                                                 |
| RI     | `spec/rules/dom.md`                 | live        |                                                                                                                                                                               |
| EM     | `spec/rules/empty-blocks.md`        | live        | EM4 retired 2026-08-24 (stamp-2 remote heal deleted). EM1–EM3 and EM5–EM8 stay. Do not reuse EM4                                                                              |
| I      | `spec/rules/architecture.md`        | live        | shared invariant family, one meaning throughout. Retired members: I2, I3 (mapping), I11 (two-seam sentinel). Do not reuse them                                                 |
| API    | `spec/rules/api.md`                 | live        |                                                                                                                                                                               |
| SF     | `spec/rules/api.md`                 | live        | package surface consolidation                                                                                                                                                 |
| CS     | `spec/rules/api.md`                 | live        | internal structure of `@input/pen-core` and `@input/pen-dom`. CS5 is explicitly not a finished contract                                                                        |
| SEC    | `spec/rules/security.md`            | live        |                                                                                                                                                                               |
| AX     | `spec/rules/accessibility.md`       | live        |                                                                                                                                                                               |
| CH     | `spec/rules/reliability.md`         | live        | code health and test reliability                                                                                                                                              |
| HOST   | `spec/rules/host.md`                | live        |                                                                                                                                                                               |
| LOC    | `spec/rules/localization.md`        | live        |                                                                                                                                                                               |
| DOC    | `spec/rules/documentation.md`       | live        |                                                                                                                                                                               |
| DUR    | `spec/rules/durability.md`          | live        |                                                                                                                                                                               |
| COL    | `spec/rules/collaboration.md`       | live        |                                                                                                                                                                               |
| AIB    | `spec/rules/ai.md`                  | live        | AI boundary                                                                                                                                                                   |
| IOP    | `spec/rules/interop.md`             | live        |                                                                                                                                                                               |
| SCALE  | `spec/rules/scale.md`               | live        |                                                                                                                                                                               |
| PG     | `spec/rules/scale.md`               | live        | anchor performance contract                                                                                                                                                   |
| EC     | `spec/packages/extensions/ai.md`    | live        | edit channel. Not a member of the reserved `E` token — complete letter-run, so `EC1` is not `E1`                                                                              |
| UC     | `spec-v5/01-channel.md`             | live        | reserved 2026-08-26 (v5 unification train). Claim with tests per wave                                                                                                          |
| RS     | `spec-v5/02-review-surface.md`      | live        | reserved 2026-08-26. Not a member of the live `R` family — `RS1` is not `R1`                                                                                                  |
| FE     | `spec-v5/03-field-editors.md`       | live        | reserved 2026-08-26. Not a member of the reserved `F` token — `FE1` is not `F1`                                                                                               |
| HB     | `spec-v5/04-hosts-and-bindings.md`  | live        | reserved 2026-08-26                                                                                                                                                           |
| WA     | `spec-v5/00-concept.md`             | record-only | working agreements. `PROCESS_PREFIXES` in `coverage-rules.mjs` — excluded from derivation, not a test-name obligation                                                          |
| E      | (none — token reserved)             | record-only | was the v2 evidence catalog E1–E10. The owning document is gone; the token stays reserved so a new family cannot silently collide with `EC`                                    |
| F      | (none — token reserved)             | record-only | was the v1 audit-finding series F1–F59. Token reserved; `FE` is a separate family                                                                                             |
| W      | (none — token reserved)             | record-only | was the Wordgard adoption list W1–W9. Token reserved                                                                                                                          |
| RD     | (none — token reserved)             | record-only | was resolved-decision labels, defined twice with different contents across two trains. Never reuse `RD` for a product rule                                                     |
| TR     | (none — token reserved)             | record-only | was the v4 train work orders. Executed; token reserved                                                                                                                        |
| GA     | (none — token reserved)             | record-only | was the v4 instrument gates. Token reserved                                                                                                                                   |
| RC     | (none — token reserved)             | record-only | was the v4 record protocol. Token reserved                                                                                                                                    |
| DL     | (none — token reserved)             | record-only | was the v4 scaffolding deletion list. Executed; token reserved                                                                                                                |

## Collisions (measured)

1. **R1–R3 versus R1–R7.** `spec/rules/selection.md` R1–R3 are reader-window admissibility rules; `spec/rules/facets.md` R1–R7 are facet provider and combine rules. Same token, two meanings, both live. A test named `R1` is ambiguous, so name the subject as well as the ID. Not renamed, because a rule ID is a permanent citation.

2. **Complete letter-runs, not containment.** `OP` versus `OPB`, `I` versus `INT`, `E` versus `EC`, `R` versus `RS`, and `F` versus `FE` are distinct families. Coverage matching extracts a complete letter-run followed by digits, so `OPB1` never matches `OP`, and a test naming `EC1` does not claim `E1`. Do not replace that matcher with a `startsWith` check.

3. **Wave letters versus rule letters.** The historical wave trains used bare letters (Wave S, Wave P, Wave C, Wave M, Wave T, Wave D, Wave E, Wave F) that overlap rule prefixes. Those trains are closed and their documents are gone, so the overlap is no longer live; it is recorded here because the letters remain reserved.

4. **Retired members are not recycled.** I2, I3, I11, and EM4 named behavior that no longer has a subject. Their numbers stay burned. Reusing one to close a coverage line would make an old citation resolve to a new rule, which is the one thing a stable ID must never do.

Reserved for new specs: do not start a new family whose prefix is already a row in this table.
