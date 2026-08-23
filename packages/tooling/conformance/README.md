# @input/pen-conformance

Private Playwright harness for spec-v2 conformance. Never published.

## Two gates, not one

`pnpm --filter @input/pen-conformance test` is **Node host locks only** (`src/hosts/*.test.js`). It does not start a browser and it does not run `scenarios/` or `suites/`. A green `pnpm test` is not conformance. The Playwright gate is `test:chromium` / `test:matrix` (CI job `conformance-engine` in `.github/workflows/conformance.yml`).

Standing DOM↔authority has three results: **matched** (checked and equal), **mismatch** (checked and unequal), **unchecked** (could not check — unfocused or non-text). Unchecked is not success. `caretCacheHolds` fails when `missingCount > 0`, not only when `staleCount > 0`.

Standing assertions (`assertStandingDiagnostics`, `assertStandingDomMatchesAuthority`), axe analyzers (`analyzeEditorSurface`, `analyzeEditorWcag22Aa`), `harness/src/geometry.ts`, and most of `harness/src/session.ts` are **Playwright-only**. Their extractable predicates live in Node (`standingFilter`, `axeFormat`, `domAuthorityCompare`, `geometryCompare`, `serialize`). The wrappers themselves need a page.

`domAuthorityCompare` compares the live DOM selection to `editor.selection`. That name is not `authorityCompare`. Wave 1 GATE 1.11 is the recorded-trace replay in `harness/src/authorityCompare.ts` (`pnpm --filter @input/pen-conformance test -- --test-name-pattern authorityCompare`, and `pnpm --filter @input/pen-conformance run test:chromium -- --grep authorityCompare`). The committed corpus is split/merge/remove with mapPoint algebra landings; a live copy-split that stays on the source must mismatch, not pass.

The scenario gate is a separate command:

```bash
pnpm --filter @input/pen-conformance run test:chromium
pnpm --filter @input/pen-conformance run test:matrix
pnpm --filter @input/pen-conformance run test:axe
pnpm --filter @input/pen-conformance run test:ax3
pnpm --filter @input/pen-conformance run test:ax6
pnpm --filter @input/pen-conformance run test:scale5
pnpm --filter @input/pen-conformance run test:host4
pnpm --filter @input/pen-conformance run coverage:rules
```

- `harness/` — Vite app: one v1-preset editor, fixture loader, `window.__penConformance`
- `src/` — scenario DSL, standing assertions, rule-coverage and lint scripts
- `scenarios/` — scripted journeys (hello-world, harness self-test, wave suites)
- `suites/` — selection (live I4/P1/S3/S5/S6), input (K1/K2/K4/B1/B2), ime (C1–C4 plus `MANUAL.md`), bidi (M2/M3/DIR2), overlays (O1/O2), geometry (G2). Other live wiring stays in `scenarios/` and `harness-live.spec.ts`.
- `fixtures/` — documents plus the diagnostics allowlist
- `fixtures/hostile/` — Wave S.0 attacker corpus (`window.__xssProbe` canary)

## Known defects (2026-08-23)

Staffing the empty `input` / `ime` / `bidi` / `geometry` / `overlays` directories found **six product defects**, plus one entry that turned out not to be a product defect at all (see K2 below). The suite did not get worse; it got honest — it previously reported 106/106 on three engines while testing none of these paths, so that figure measured coverage we did not have.

**Five of the six were fixed the same day, and that is the argument for the staffing rather than a footnote to it.** K1: unbound owned navigation keys now `preventDefault`. M3: `Home`/`End` are bound on macOS and resolve the visual line edge through an injected measure. C2: the EditContext path defers remote deltas while composing, which the contenteditable path already did. Both C3 entries: the `Date.now() < 50` plus rAF gate is replaced by the composition event sequence itself. Each fix deleted its own annotation as its last step, so the count below is the count of live annotations. **C1 is the one still open.**

Each scenario still asserts what the spec requires and carries `knownDefect`, which marks it expected-to-fail. `conformance-chromium` is not `continue-on-error`, and a job that is permanently red is one nobody can act on — that is how a blocking engine sat red for a week unnoticed. When a defect is fixed, Playwright reports the scenario as **unexpectedly passing** and the job goes red until the annotation is deleted. Removing the annotation is the fix's last step.

Re-verify rather than trust: an expected-failure also absorbs a failure for the _wrong_ reason, so every entry records its observed symptom verbatim in the annotation.

**K2 was that wrong reason, and it is the first measured instance of the cost this section warns about.** It was recorded as "nested toggle child never mounts", routed to the toggle renderer and `useParentIdChildBlockIds`. Both were correct. The `nested-toggle` fixture put the child in a TestBlock `children` array, which `populateYDoc` writes as a layout `Y.Array` and does **not** add to `blockOrder` — while toggles nest as siblings in `blockOrder` carrying a `parentId` prop, which is what `parentIdTree` filters on. The hook returned `[]` correctly and the open toggle rendered its empty state. The fixture had the `parentId` prop set right and nested the block anyway; the nesting won.

Two things kept it recoverable. The verbatim symptom named `hasBody:false` alongside a populated `blockIds`, which is what made the fixture the suspect rather than the renderer. And the annotation is a marker, not a mute — the scenario kept asserting the spec throughout, so nothing had to be un-weakened to re-check it. The fixture-shape lock now rejects `children:` for this fixture by name, so the shape cannot come back silently.

| Rule | Scenario                                               | Route                                           |
| ---- | ------------------------------------------------------ | ----------------------------------------------- |
| C1   | CDP composition is committed, not cancelled, by Escape | `editContextBackendInput.ts` `handleTextUpdate` |

C1 is not a key-handling defect, which is where its first route pointed. Two things have to be true for Escape to cancel, and neither is: the CDP `Escape` keydown never reaches the page probe, because the IME layer consumes it before dispatch; and `textupdate` has already written the composed text into the authority by the time `textformatupdate` opens the composing session, so there is no uncommitted state left for a cancel to discard. `keyHandling.ts` would never see the event, and would have nothing to undo if it did.

The candidate fix is in `editContextBackendInput.ts`: hold `handleTextUpdate`'s apply until the end of the same turn, and once `textformatupdate` has opened composing, apply or drop it on `compositionend` according to commit versus cancel. That is sequence tracking rather than a timer, matching the C3 fix. It was not shipped because C4's `insertText` commit path has to stay green and a wrong deferral regresses ordinary EditContext typing — so it needs its own lane with the backends quiet, not a tail-end change.

`window.__penConformance.isCollapsed()` is the official `@input/pen-core` helper over the live editor selection. Do not read a live `selection.isCollapsed` property; Wave 5.1 is removing it. The serialized DTO field is a snapshot computed at serialize time, not that live property.
