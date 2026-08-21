---
"@input/pen-vue": patch
"@input/pen-preset-default": patch
---

Make the styling references in shipped docs resolve for someone who installed the package.

`@input/pen-vue` had a HOST6 `STYLING.md` in the repository but left it out of `files`, so it never reached the tarball — and its one cross-reference was `../react/STYLING.md`, a path that only exists in a monorepo checkout. The file now ships, and both it and the `@input/pen-preset-default` README name `STYLING.md` and the package that carries it instead of linking through workspace directories. Same for the preset README's root-README and `examples/` links.

No content changed, only the way the docs point at each other.
