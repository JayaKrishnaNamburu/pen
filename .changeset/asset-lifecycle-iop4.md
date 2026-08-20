---
"@input/pen-types": patch
"@input/pen-dom": patch
"@input/pen-assets-memory": patch
"@input/pen-import-html": patch
---

Wire the asset upload lifecycle: enforce and forward `maxSize`/`onProgress`, report oversize and provider failures with `asset-upload-failed`, and make HTML `<img>` remote-src handling an explicit import option (default `keep`).
