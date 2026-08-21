# @input/pen-eslint-plugin

Pen's custom ESLint rules. Private to the workspace; consumed by the root `eslint.config.mjs`.

This package is plain ESM JavaScript with no build step so ESLint can load it directly. Relative imports therefore carry `.js` extensions, which Node ESM requires — this is the documented exception to the extensionless-import convention in `.cursor/rules/pen-import-path-conventions.mdc`, not a mistake to fix.

## Rules

| Rule                                     | Spec rule | Status  | Owning wave                                                                                                                                   |
| ---------------------------------------- | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-html-injection-sinks`                | SEC2      | shipped | Wave H (Wave S owns the named test)                                                                                                           |
| `no-unescaped-markup-concat`             | SEC5      | shipped | Wave S. Export packages, schema `toHTML`, and clipboard HTML. Adjacent comment naming SEC5 / already-serialized / clamped / justified.        |
| `no-above-floor-api`                     | HOST4     | shipped | Wave E.5. Allowlist: `scripts/above-floor-api-allowlist.json` (fallback + degradation required).                                              |
| `no-bare-random-uuid`                    | HOST4     | shipped | Wave E.1                                                                                                                                      |
| `no-framework-free-modules-in-renderers` | API6      | shipped | Wave P.6 / E.2. Re-export stubs stay. Allowlist: `scripts/renderer-framework-free-allowlist.json`.                                            |
| `no-module-scope-browser-globals`        | HOST2     | shipped | Wave E.2                                                                                                                                      |
| `no-user-facing-literals`                | LOC1      | shipped | Wave L.8. Allowlist: `eslint-disable-next-line` with a reason.                                                                                |
| `no-ascii-word-boundaries`               | LOC4      | shipped | Wave L.8. `textSegmentation.ts` is the HOST4 fallback allowlist.                                                                              |
| `no-bare-case-folding`                   | LOC5      | shipped | Wave L.8. Identifier folds and display casing are allowlisted in-rule.                                                                        |
| `no-implicit-locale`                     | LOC3      | shipped | Wave L.8. Tests, playground, docs, and root `scripts/` are allowlisted.                                                                       |
| `no-aria-hidden-visible`                 | AX4, AX7  | shipped | Wave X. Overlay / focus-sink / decorative sites need an adjacent comment naming AX7, "focus sink", or "Justified".                            |
| `no-unstyled-focus`                      | AX5       | shipped | Wave X. `outline: none` is allowed only with a nearby `:focus-visible` ring.                                                                  |
| `no-v1-extension-fields`                 | Wave 7.1  | shipped | Wave 7.1. Flags `Extension.keyBindings` / `inputRules` / `decorations` declarations. Schema `keyBindings` and local `const` names stay quiet. |

Rules that need no custom code are configured directly in the root config: the dynamic-code ban (SEC8) uses core `no-eval` / `no-new-func` / `no-implied-eval`. Wave S owns the SEC8-named test and the CSP scenario.

## Rules the waves still owe

Each of these is claimed by a wave in `spec-v2/waves/`. They are listed here rather than committed as no-op stubs on purpose: a registered rule that reports nothing invites hosts to enable it and believe they are protected. A wave adds its rule file, registers it in `src/index.js`, turns it on in the root config, and ships its tests in the same change. The ESLint rule replaces the grep script; it does not ship beside it.

Until that lands, the invariant is a grep script (or a report-only inventory). Either form satisfies the wave's lint deliverable (`spec-v2/waves/README.md` §Shared Verification Commands). Root scripts under `scripts/no-*.mjs` have matching `.github/workflows/` jobs.

| Rule                     | Spec rule | ESLint owner                       | Current form                                                                                   |
| ------------------------ | --------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `no-new-slots`           | SM3       | Wave E.2 (Wave 1 shipped the grep) | grep — `scripts/no-new-slots.mjs`                                                              |
| `no-unscheduled-measure` | SCH1–SCH3 | Wave 3                             | grep — `scripts/no-unscheduled-measure.mjs`                                                    |
| `no-selection-timers`    | S4        | Wave 5                             | grep — `packages/tooling/conformance/src/lints/s4-no-selection-timers.mjs` (not a CI workflow) |
| `no-bidi-override`       | DIR1–DIR3 | Wave 6                             | grep — `scripts/no-bidi-override.mjs`                                                          |
| `no-pen-deep-imports`    | API4      | Wave P                             | grep — `scripts/no-pen-deep-imports.mjs`                                                       |
