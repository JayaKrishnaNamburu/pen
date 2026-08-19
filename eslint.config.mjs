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

      // SEC8: no dynamic code, so Pen stays functional under `script-src 'self'`.
      "no-eval": "error",
      "no-new-func": "error",
      "no-implied-eval": "error",
    },
  },
  {
    // Deliberately permissive baseline. Each entry names the wave that owns the cleanup and
    // earns its promotion to "error"; promoting one before that only creates noise.
    rules: {
      // Wave H step H.2 (CH1): 50 files still carry `@ts-nocheck`. Promoted to "error" when
      // the AI extension is de-mixined, which is also what removes most of the two rules below.
      "@typescript-eslint/ban-ts-comment": "warn",
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
      // Not a style nit here: the current findings are `let` bindings initialized and then never
      // written (dead warn-once flags in core, dead streaming accumulators inside the
      // `@ts-nocheck` region). Autofixing them to `const` would make broken code look
      // deliberate, so they stay visible until H.2/H.6 resolve the underlying logic.
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
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
