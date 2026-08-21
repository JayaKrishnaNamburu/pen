---
"@input/pen-bench": patch
---

Gate SCALE2's eight no-op decorating extensions against the same-run shipped-stack median, and run the SCALE1 envelope measurement compare in the isolated bench job.

The plus8 bench already existed as an absolute 50ms budget. SCALE2 asks for a relative check: adding eight no-op decorating extensions must stay within `max(base × 2, base + 15ms)` of the 1000-block shipped stack measured in the same run. `bench.yml` now also runs `bench:envelope` so a drifted `baselines/envelope.json` fails the job instead of only living in a local script.
