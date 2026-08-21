---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Stop using `JSON.stringify` to decide whether a structured preview or a transfer selection changed. Those comparisons now walk the known shape and stop at the first difference, so key order and dropped `undefined` members no longer produce a false answer.
