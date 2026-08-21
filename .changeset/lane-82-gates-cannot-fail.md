---
---

Delete the spent CH1/CH4 inventories and pin F22 dead bindings so a ticked finding cannot come back without failing CI.

`ts-nocheck-inventory` and `this-any-inventory` always exited 0 at zero hits; CH1 and CH4 already block through `health-gates.yml`. The F22 script fails if `hasWarnedAboutWithoutOption` returns or the streaming accumulators stop being written.
