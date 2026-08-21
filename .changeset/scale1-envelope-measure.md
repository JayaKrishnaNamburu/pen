---
"@input/pen-bench": patch
---

Measure the SCALE1 envelope axes that the published table currently only declares.

`@input/pen-test` already grades sizes. This adds a fixture ladder and a median-of-21 keystroke harness for those same axes, and commits the numbers in `baselines/envelope.json` so the existing table can be fed instead of guessed.
