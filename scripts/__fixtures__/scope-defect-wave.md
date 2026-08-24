# Scope-defect fixture — known-bad gates for the checker red-proof

- GATE 96.1 [test]: `pnpm --filter @input/pen-core test -- -t "THIS_NAME_MATCHES_NOTHING_XYZ"`
  expect: exit 0
- GATE 96.2 [test]: `pnpm --filter @input/pen-conformance test -- --test-name-pattern THIS_NAME_MATCHES_NOTHING_XYZ`
  expect: exit 0
- GATE 96.3 [grep]: `rg -n "img|src" packages/extensions/import-html/src/convert*.ts`
  expect: exit 1
- GATE 96.4 [script]: `test -f scripts/v3-gates.mjs`
  expect: exit 0
- GATE 96.5 [test]: `pnpm exec vitest run --config packages/tooling/conformance/vitest.nightly.ts -- an-fuzz-does-not-exist`
  expect: exit 0
