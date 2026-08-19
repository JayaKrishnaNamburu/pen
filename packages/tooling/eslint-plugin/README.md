# @input/pen-eslint-plugin

Pen's custom ESLint rules. Private to the workspace; consumed by the root `eslint.config.mjs`.

This package is plain ESM JavaScript with no build step so ESLint can load it directly. Relative imports therefore carry `.js` extensions, which Node ESM requires — this is the documented exception to the extensionless-import convention in `.cursor/rules/pen-import-path-conventions.mdc`, not a mistake to fix.

## Rules

| Rule                      | Spec rule | Status  |
| ------------------------- | --------- | ------- |
| `no-html-injection-sinks` | SEC2      | shipped |

## Rules the waves still owe

Each of these is claimed by a wave in `spec-v2/waves/`. They are listed here rather than committed as no-op stubs on purpose: a registered rule that reports nothing invites hosts to enable it and believe they are protected. A wave adds its rule file, registers it in `src/index.js`, turns it on in the root config, and ships its tests in the same change.

| Rule                                                            | Spec rule  | Owning wave |
| --------------------------------------------------------------- | ---------- | ----------- |
| `no-new-slots`                                                  | SM3        | Wave 1      |
| `no-unscheduled-measure`                                        | SCH1–SCH3  | Wave 3      |
| `no-selection-timers`                                           | S4         | Wave 5      |
| `no-bidi-override`                                              | DIR1–DIR3  | Wave 6      |
| `no-aria-hidden-visible`, `no-unstyled-focus`                   | AX5, AX7   | Wave X      |
| `no-pen-deep-imports`, `no-framework-free-modules-in-renderers` | API4, API6 | Wave P      |

Rules that need no custom code are configured directly in the root config: the dynamic-code ban (SEC8) uses core `no-eval` / `no-new-func` / `no-implied-eval`.
