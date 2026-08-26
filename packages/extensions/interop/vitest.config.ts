import { defineConfig } from "vitest/config";

// CH9 (spec/rules/reliability.md): explicit suite timeout. This config
// replaces the root one rather than extending it, so the package was running
// on Vitest's 5000ms default — the budget the root config already rejects as
// unchosen.
//
// The IOP5 bounds suites prove the ingest caps by actually reaching them: the
// node-count cases parse INGEST_MAX_NODE_COUNT + 3 = 10,003 blocks. Idle here
// that is 355ms (HTML) and 1042ms (markdown); on a loaded CI runner the same
// three cases measured 8232ms, 10732ms, and 14179ms. The default was failing
// them for the machine they landed on rather than for anything they assert.
//
// 30s matches @input/pen-bench and leaves roughly 2x over the worst measured
// run. The CH9 half-budget rule still holds by an order of magnitude: the
// slowest case idle is 1042ms against a 15s half-budget.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    projects: ["."],
    testTimeout: 30_000,
  },
});
