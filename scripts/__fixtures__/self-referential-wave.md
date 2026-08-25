# Self-referential wave — used by the runner self-test

A wave file whose gate runs the runner on itself. Without the cycle guard this
fixture does not fail, it forks forever: every level parses the same gate and
spawns another runner. The red-proof is that running the runner on this file
terminates and exits nonzero.

- GATE 99.1 [script]: `node scripts/v3-gates.mjs scripts/__fixtures__/self-referential-wave.md`
  expect: exit 0
  The gate claims success so the fixture is only red because of the guard: the
  child finds this file already on the gate stack and exits 1.
