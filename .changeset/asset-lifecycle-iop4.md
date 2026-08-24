---
"@input/pen-types": patch
"@input/pen-dom": patch
"@input/pen-assets-memory": patch
"@input/pen-interop": patch
---

Wire `maxSize` and `onProgress` through to the asset provider instead of leaving them as decoration. Oversize and provider failures now emit `asset-upload-failed` (naming the limit and actual size when relevant) and insert no image block. HTML `<img>` remote src is an explicit import option (default `keep`). `PenPersistence` and `AssetProvider` members are each either called by Pen or marked host-implemented.
