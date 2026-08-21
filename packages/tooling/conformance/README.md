# @input/pen-conformance

Private Playwright harness for spec-v2 conformance. Never published.

## Two gates, not one

`pnpm --filter @input/pen-conformance test` is **Node host locks only** (`src/hosts/*.test.js`). It does not start a browser and it does not run `scenarios/` or `suites/`. A green `pnpm test` is not conformance. The Playwright gate is `test:chromium` / `test:matrix` (CI job `conformance-engine` in `.github/workflows/conformance.yml`).

Standing DOM↔authority has three results: **matched** (checked and equal), **mismatch** (checked and unequal), **unchecked** (could not check — unfocused or non-text). Unchecked is not success. `caretCacheHolds` fails when `missingCount > 0`, not only when `staleCount > 0`.

Standing assertions (`assertStandingDiagnostics`, `assertStandingDomMatchesAuthority`), axe analyzers (`analyzeEditorSurface`, `analyzeEditorWcag22Aa`), `harness/src/geometry.ts`, and most of `harness/src/session.ts` are **Playwright-only**. Their extractable predicates live in Node (`standingFilter`, `axeFormat`, `authorityCompare`, `geometryCompare`, `serialize`). The wrappers themselves need a page.

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
- `suites/` — selection, input, IME, geometry, bidi, overlays (mostly `.gitkeep`; live wiring is `harness-live.spec.ts`)
- `fixtures/` — documents plus the diagnostics allowlist
- `fixtures/hostile/` — Wave S.0 attacker corpus (`window.__xssProbe` canary)

`window.__penConformance.isCollapsed()` is the official `@input/pen-core` helper over the live editor selection. Do not read a live `selection.isCollapsed` property; Wave 5.1 is removing it. The serialized DTO field is a snapshot computed at serialize time, not that live property.
