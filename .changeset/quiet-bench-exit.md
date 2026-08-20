---
"@input/pen-bench": patch
---

Await bench editor teardown after each suite, and exit the CLI after a successful serial run, so leftover timers cannot keep the CH8 job alive.
