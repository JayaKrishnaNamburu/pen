---
"@input/pen-core": patch
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-content-ops": patch
---

Remove the dead `shouldFallbackMixedSelectionToBlock` export. Mixed text/structural reads already stay text selections (T2 / N2); the constant-false policy function had no remaining callers with a job.
