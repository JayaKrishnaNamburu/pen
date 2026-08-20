import js from "@eslint/js";
import pen from "@input/pen-eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

// CH2 (spec-v2/09-reliability-testing.md): this config is the host the waves mount
// their invariants on. It starts permissive on purpose — rules that would demand mass
// edits are warnings until the wave that owns the cleanup lands, so the error set stays
// meaningful and the gate stays green.

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.d.ts",
      "playground/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { pen },
    rules: {
			"pen/no-html-injection-sinks": "error",

      // HOST4: crypto.randomUUID is secure-context-only, so it throws on plain-HTTP origins
      // and on Safari < 15.4. generateId owns the feature test and fallback (F24).
      "pen/no-bare-random-uuid": "error",

      // SEC8: no dynamic code, so Pen stays functional under `script-src 'self'`.
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",

      // LOC3: every Intl constructor and localeCompare takes an explicit locale.
      "pen/no-implicit-locale": "error",
    },
  },
  {
    // LOC1: library chrome copy comes from the catalog. Tests and playground
    // hosts may keep literals. Disable a site with an eslint-disable comment
    // that names why the string is not user copy (allowlist).
    files: [
      "packages/rendering/react/src/**/*.{ts,tsx}",
      "packages/rendering/vue/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-user-facing-literals": "error",
    },
  },
  {
    // LOC4: word logic in editing/search/selection uses the shared segmenter.
    // `textSegmentation.ts` is the HOST4 whitespace-fallback home and is
    // excluded below. Regex-mode search may pass user `\b` through a variable;
    // literals stay banned. Disable a site with a comment naming the exception.
    files: [
      "packages/rendering/dom/src/field-editor/**/*.{ts,tsx}",
      "packages/extensions/search/src/**/*.{ts,tsx}",
      "packages/core/src/selection/**/*.{ts,tsx}",
      "packages/core/src/editor/textSegmentation.ts",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      "pen/no-ascii-word-boundaries": "error",
    },
  },
  {
    files: ["packages/core/src/editor/textSegmentation.ts"],
    rules: {
      // HOST4 sub-floor fallback: word ops degrade to whitespace runs here only.
      "pen/no-ascii-word-boundaries": "off",
    },
  },
  {
    // LOC5: matching paths fold through foldAndNormalize. Keyboard `event.key`
    // and `navigator.platform` are allowlisted in the rule. Disable a site with
    // a comment naming why it is not user-copy matching.
    files: [
      "packages/rendering/react/src/**/*.{ts,tsx}",
      "packages/extensions/search/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-bare-case-folding": "error",
    },
  },
  {
    // HOST2: published modules must import in Node without DOM globals. Function
    // bodies may touch the browser; module scope may not. Docs, the playground,
    // and the conformance harness are hosts — their entrypoints mount on `document`.
    files: ["packages/**"],
    ignores: ["packages/docs/**", "packages/tooling/conformance/**"],
    rules: {
      "pen/no-module-scope-browser-globals": "error",
    },
  },
  {
    // Deliberately permissive baseline. Each entry names the wave that owns the cleanup and
    // earns its promotion to "error"; promoting one before that only creates noise.
    rules: {
      // Wave H step H.2 (CH1): `@ts-nocheck` is gone. Remaining `@ts-expect-error`
      // sites must keep an adjacent tracked-issue description.
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      // Concentrated in the mechanically split `PartN` files and their test counterparts
      // (Wave H steps H.2/H.3); the count is the burn-down metric for that work.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Wave H step H.6 (F21) reviews these: each is a value computed and then discarded, or
      // an expression evaluated for no effect — bug-shaped, but each needs intent to resolve.
      "no-useless-assignment": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      // Not a style nit here: leftover `let` bindings that are never written. Autofixing
      // them to `const` would make dead logic look deliberate. Stay warn until the
      // remaining unused-binding debt is gone — do not promote with ban-ts-comment.
      "prefer-const": "warn",
      // Wave P (API5) decomposes the handle/interface merging these flag.
      "@typescript-eslint/no-unsafe-declaration-merging": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      // Wave H step H.6 sweeps silent catches; until then an empty catch is a warning, not a stop.
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/*.bench.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // HOST4 protects shipped runtime code. Tests run in Node, where `crypto.randomUUID`
      // is unconditional, and their fixture ids are not a portability surface.
      "pen/no-bare-random-uuid": "off",
      // HOST2 protects published module graphs. Tests are allowed to read document/window
      // at file scope when they build a jsdom fixture.
      "pen/no-module-scope-browser-globals": "off",
      // LOC3 is a library-runtime rule. Fixtures may sort with the environment locale.
      "pen/no-implicit-locale": "off",
    },
  },
  {
    files: [
      "packages/tooling/test/**",
      "playground/**",
      "packages/docs/**",
      "scripts/**",
    ],
    rules: {
      "pen/no-implicit-locale": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
