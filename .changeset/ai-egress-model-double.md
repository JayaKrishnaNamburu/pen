---
"@input/pen-ai": patch
"@input/pen-test": patch
"@input/pen-core": patch
"@input/pen-types": patch
---

Export the recording model double from `@input/pen-test` and add the `pen.aiEgress` facet so every outbound model call can be inspected, redacted, or refused without throwing.
