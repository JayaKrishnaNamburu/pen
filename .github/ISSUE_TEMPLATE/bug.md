---
name: Bug report
about: Something in Pen behaves differently from what the specs or docs describe
labels: bug
---

## What happened

<!-- Observed behavior, and what you expected instead. -->

## Package and version

<!-- e.g. @input/pen-core 0.0.1, @input/pen-dom 0.0.1. List every Pen package involved. -->

## Reproduction

<!--
A failing test is the fastest path to a fix. Most of Pen is testable headlessly
via `createHeadlessEditor()`; if the bug reproduces there, paste that test.
Otherwise a minimal repo or a `playground/` fixture.
-->

## Does it reproduce headlessly?

- [ ] Yes — headless, no DOM involved
- [ ] No — needs a real browser
- [ ] Not sure

<!--
This matters more than it looks. Selection, IME, clipboard and geometry cannot be
represented in jsdom, so a browser-only bug is triaged against the conformance
harness rather than the unit suites.
-->

## Browser and OS

<!--
Only if it needs a browser. Name the engine (Chromium / WebKit / Firefox), not
just the browser — engine-specific behavior is common in this area, and Pen's
CI currently blocks on Chromium only.
-->

## Diagnostics

<!--
Pen prefers emitting a `diagnostic` event over throwing. Attach any diagnostic
codes you saw — they usually name the subsystem directly.
-->
