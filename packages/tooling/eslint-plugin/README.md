# @input/pen-eslint-plugin

Pen's custom ESLint rules. Private to the workspace; consumed by the root `eslint.config.mjs`.

This package is plain ESM JavaScript with no build step so ESLint can load it directly. Relative imports therefore carry `.js` extensions, which Node ESM requires — this is the documented exception to the extensionless-import convention in `.cursor/rules/pen-import-path-conventions.mdc`, not a mistake to fix.

## Rules

| Rule                              | Spec rule | Status  | Owning wave                                                                 |
| --------------------------------- | --------- | ------- | --------------------------------------------------------------------------- |
| `no-html-injection-sinks`         | SEC2      | shipped | Wave H (Wave S still owns the named test and export-package concatenation) |
| `no-bare-random-uuid`             | HOST4     | shipped | Wave E.1                                                                    |
| `no-module-scope-browser-globals` | HOST2     | shipped | Wave E.2                                                                    |

Rules that need no custom code are configured directly in the root config: the dynamic-code ban (SEC8) uses core `no-eval` / `no-new-func` / `no-implied-eval`. Wave S owns the SEC8-named test and the CSP scenario.

## Rules the waves still owe

Each of these is claimed by a wave in `spec-v2/waves/`. They are listed here rather than committed as no-op stubs on purpose: a registered rule that reports nothing invites hosts to enable it and believe they are protected. A wave adds its rule file, registers it in `src/index.js`, turns it on in the root config, and ships its tests in the same change. The ESLint rule replaces the grep script; it does not ship beside it.

Until that lands, the invariant is a grep script (or a report-only inventory). Either form satisfies the wave's lint deliverable (`spec-v2/waves/README.md` §Shared Verification Commands). Root scripts under `scripts/no-*.mjs` have matching `.github/workflows/` jobs.

| Rule                                    | Spec rule | ESLint owner                         | Current form                                                                                         |
| --------------------------------------- | --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `no-new-slots`                          | SM3       | Wave E.2 (Wave 1 shipped the grep)   | grep — `scripts/no-new-slots.mjs`                                                                    |
| `no-unscheduled-measure`                | SCH1–SCH3 | Wave 3                               | grep — `scripts/no-unscheduled-measure.mjs`                                                          |
| `no-selection-timers`                   | S4        | Wave 5                               | grep — `packages/tooling/conformance/src/lints/s4-no-selection-timers.mjs` (not a CI workflow)       |
| `no-bidi-override`                      | DIR1–DIR3 | Wave 6                               | grep — `scripts/no-bidi-override.mjs`                                                                |
| `no-aria-hidden-visible`                | AX4, AX7  | Wave X                               | grep — `scripts/no-aria-hidden-visible.mjs`                                                          |
| `no-unstyled-focus`                     | AX5       | Wave X                               | grep — `scripts/no-unstyled-focus.mjs`                                                               |
| `no-pen-deep-imports`                   | API4      | Wave P                               | grep — `scripts/no-pen-deep-imports.mjs`                                                             |
| `no-framework-free-modules-in-renderers`| API6      | Wave E.2 (Wave P shipped inventory)  | report-only — `scripts/renderer-inventory.mjs` (`--strict` is not CI)                                |
