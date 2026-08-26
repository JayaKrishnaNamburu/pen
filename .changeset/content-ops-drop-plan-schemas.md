---
"@input/pen-content-ops": minor
---

Stop publishing normalizePlanRecord, normalizePlanSteps, and PlanRecord. They coerced unknown JSON-plan payloads for the retired structured planner and had no remaining caller.
