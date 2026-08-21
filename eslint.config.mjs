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
    // SEC5: exporters and schema toHTML must not concatenate unescaped
    // document content into markup. Disable a site with a comment naming
    // SEC5, "already-serialized", "clamped", or "justified".
    files: [
      "packages/extensions/export-html/src/**/*.{ts,tsx}",
      "packages/extensions/export-xml/src/**/*.{ts,tsx}",
      "packages/schema/default/src/**/*.{ts,tsx}",
      "packages/rendering/dom/src/utils/clipboardSerialization.ts",
      "packages/rendering/dom/src/utils/tableCellClipboard.ts",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      "pen/no-unescaped-markup-concat": "error",
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
    // AX4 / AX5: rendering packages own surface semantics. Tests may assert
    // aria-hidden and outline. Overlay / focus-sink / decorative exceptions
    // need an adjacent comment naming AX7, "focus sink", or "Justified".
    files: ["packages/rendering/**/*.{ts,tsx,js,jsx}"],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-aria-hidden-visible": "error",
      "pen/no-unstyled-focus": "error",
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
    // LOC5: matching paths fold through foldAndNormalize. Identifier folds
    // (MIME, attribute names, shortcut patterns, markdown keys, regex-captured
    // tokens) and single-character display casing are allowlisted in the rule.
    // Globs follow Wave L's package list (`spec-v2/waves/wave-l-localization.md`).
    files: [
      "packages/types/src/**/*.{ts,tsx}",
      "packages/core/src/**/*.{ts,tsx}",
      "packages/schema/default/src/**/*.{ts,tsx}",
      "packages/rendering/dom/src/**/*.{ts,tsx}",
      "packages/rendering/react/src/**/*.{ts,tsx}",
      "packages/rendering/vue/src/**/*.{ts,tsx}",
      "packages/extensions/search/src/**/*.{ts,tsx}",
      "packages/extensions/ai/src/**/*.{ts,tsx}",
      "packages/extensions/ai-suggestions/src/**/*.{ts,tsx}",
      "packages/extensions/ai-autocomplete/src/**/*.{ts,tsx}",
      "packages/extensions/document-ops/src/**/*.{ts,tsx}",
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
    // API6: renderer modules without a framework import belong in pen-dom.
    // Re-export stubs are the P.6 end state. Disable or allowlist with API6
    // and a reason (`scripts/renderer-framework-free-allowlist.json`).
    files: [
      "packages/rendering/react/src/**/*.{ts,tsx}",
      "packages/rendering/vue/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-framework-free-modules-in-renderers": "error",
    },
  },
  {
    // HOST4: above-floor APIs need a feature test or an allowlist entry
    // that names the fallback and user-visible degradation.
    files: [
      "packages/*/src/**/*.{ts,tsx,js,jsx}",
      "packages/*/*/src/**/*.{ts,tsx,js,jsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-above-floor-api": "error",
    },
  },
  {
    // Wave 7.1: v1 Extension.keyBindings / inputRules / decorations move to
    // facet providers. Error on packages that never declared them (or already
    // migrated) so they cannot regress. The remaining decorations riders stay
    // warn: collectDecorations still iterates Extension.decorations, so moving
    // them to decorationsFacet.of() would drop them from getDecorations()
    // until that collector reads the facet. Promoting those to error is what
    // Wave 7.1 waits on.
    files: [
      "packages/*/src/**/*.{ts,tsx}",
      "packages/*/*/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-v1-extension-fields": "error",
    },
  },
  {
    files: [
      "packages/extensions/ai/src/**/*.{ts,tsx}",
      "packages/extensions/ai-suggestions/src/**/*.{ts,tsx}",
      "packages/extensions/ai-autocomplete/src/**/*.{ts,tsx}",
      "packages/extensions/multiplayer/src/**/*.{ts,tsx}",
      "packages/extensions/search/src/**/*.{ts,tsx}",
      "packages/tooling/bench/src/**/*.{ts,tsx}",
    ],
    ignores: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "pen/no-v1-extension-fields": "warn",
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
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
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
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**",
      "**/*.bench.ts",
    ],
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
