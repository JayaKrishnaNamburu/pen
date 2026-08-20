# HOST1 RSC fixture

`page.tsx` is a React Server Component that imports `PenEditor` from `@input/pen-react`. A full Next.js App Router build is not vendored here; HOST1 is the published `"use client"` directive on every exports-map entry, which is what makes that import legal.

```bash
pnpm --filter @input/pen-react build
node packages/rendering/react/fixtures/rsc/assert-client-boundary.mjs
```

To replay this file in a Next app, copy `page.tsx` to `app/page.tsx` and install the built workspace artifact of `@input/pen-react`. The App Router build should not report "cannot use hooks in a Server Component".
