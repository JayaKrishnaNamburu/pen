---
"@input/pen-export-xml": patch
---

Admit exported href and src values through the SEC1 URL policy.

XML export now omits `href`/`src` when the policy rejects a value, so hostile schemes never appear as URL attributes or props.
