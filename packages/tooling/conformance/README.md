# @input/pen-conformance

Private Playwright harness for spec-v2 conformance. Never published.

- `harness/` — Vite app: one v1-preset editor, fixture loader, `window.__penConformance`
- `src/` — scenario DSL, standing assertions, rule-coverage and lint scripts
- `scenarios/` — scripted journeys (hello-world, harness self-test)
- `suites/` — selection, input, IME, geometry, bidi, overlays (filled by later waves)
- `fixtures/` — documents plus the diagnostics allowlist

```bash
pnpm --filter @input/pen-conformance run test:chromium
pnpm --filter @input/pen-conformance run test:matrix
pnpm --filter @input/pen-conformance run coverage:rules
```
