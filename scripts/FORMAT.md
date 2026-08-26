# Format scope

`pnpm lint` runs Prettier format check plus turbo / root eslint. That
sentence in `AGENTS.md` is literally true and covers **no TypeScript
source**.

This is deliberate:

- **Prettier** owns docs and config. The path list lives in
  `scripts/lint-format.mjs` (`FORMAT_PATHS`) and is the same explicit
  list the root `lint:format` script used to inline: root markdown,
  package manifests, workflow YAML, spec trees. `packages/**/*.ts` is
  absent on purpose.
- **ESLint** owns TypeScript / JavaScript source style. Zero of the
  published packages define a format script. `turbo.json` does not
  mention Prettier.

Do not add source globs to `FORMAT_PATHS` while large refactors are in flight.
A first-time Prettier pass across ~38 packages is a review-killing
diff, not a quality win. Sequence that reformat for a quiet tree.

`.editorconfig` already pins this (`indent_style = tab` for `*`,
spaces for `*.{json,yml,yaml,md}`). The root `package.json`
`"prettier"` key repeats the TypeScript / JavaScript half so a
Prettier invocation that does not read editorconfig cannot convert
source tabs to the 2-space default. Docs and the config files in
`FORMAT_PATHS` stay on Prettier's defaults plus editorconfig.
