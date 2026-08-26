---
"@input/pen-dom": patch
---

Give the three field-editor backends one lifecycle spine (FE1, FE2). `BackendAttachment` owns every listener, observer, and subscription a backend holds while attached, so teardown is one `release()` instead of a hand-mirrored block of `removeEventListener` calls per backend — the shape that had let listeners survive a detach. Clipboard and drag, which were identical in all three backends, bind once through `bindBackendTransferEvents`, and the inline-decoration lookup duplicated between two of them moves to `inlineDecorationsForBlock`. No input behavior changes: the conformance selection, IME, input, geometry, overlay, and bidi suites pass unchanged on Chromium, Firefox, and WebKit.

`DomScheduler` is now the only owner of `requestAnimationFrame` in production DOM code (FE3), and the field editor feeds every commit to the root scheduler (FE4), so geometry caches follow the document on all three hosts rather than only under the vanilla mount. Two next-paint callbacks that were selection retries in disguise are gone under the S4 fence.

`pen-dom` no longer re-exports `REVIEW_SURFACE_CLASSES`, `REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES`, or `REVIEW_SURFACE_CUSTOM_PROPERTIES`; import them from `@input/pen-types`, which is where RS4 exports the vocabulary once. `PEN_REVIEW_STYLESHEET` is unchanged.
