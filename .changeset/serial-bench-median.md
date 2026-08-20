---
"@input/pen-bench": patch
---

Judge critical performance budgets on the median of 50 samples instead of P95.

The previous P95 gate failed when the package shared a runner with the parallel test graph. Critical targets now use the median; P95 and Max stay in the report as trend data only.
