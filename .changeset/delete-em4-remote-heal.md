---
"@input/pen-core": patch
---

Delete the EM4 stamp-2 remote heal (`stripForeignSentinel`, `NormalizationEngine.healForeignSentinels`, and the observer hook that ran it on every remote commit). It existed to heal lone-`\u200B` texts written by stamp-2 clients inside this unpublished tree during the 0.3 train; there are no such writers left, and no published peer can send one. Empty blocks store `""` (format stamp 3), documents below that stamp are migrated on load, and the `sentinel-stripped` diagnostic is retired with the rule.
