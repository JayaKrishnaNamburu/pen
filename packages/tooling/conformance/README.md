# @input/pen-conformance

Private Playwright harness for spec-v2 conformance. Never published.

- `harness/` — Vite app: one v1-preset editor, fixture loader, `window.__penConformance`
- `src/` — scenario DSL, standing assertions, rule-coverage and lint scripts
- `scenarios/` — scripted journeys (hello-world, harness self-test)
- `suites/` — selection, input, IME, geometry, bidi, overlays (filled by later waves)
- `fixtures/` — documents plus the diagnostics allowlist
- `fixtures/hostile/` — Wave S.0 attacker corpus (`window.__xssProbe` canary)

```bash
pnpm --filter @input/pen-conformance run test:chromium
pnpm --filter @input/pen-conformance run test:matrix
pnpm --filter @input/pen-conformance run test:axe
pnpm --filter @input/pen-conformance run test:ax3
pnpm --filter @input/pen-conformance run coverage:rules
```
