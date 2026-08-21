---
"@input/pen-dom": patch
---

Clip overlapping bidi run boxes so WebKit's extra zero-width Range.getClientRects at a direction boundary cannot inflate a later LTR slice into a spanning union.
