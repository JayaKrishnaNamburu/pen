---
"@input/pen-core": minor
---

Number observable commits from 1 by keeping document construction out of the commit stream (OB6)

Creating an editor previously emitted a commit for its initial paragraph. No host
could subscribe before the constructor returned, so that commit was unobservable —
but it still consumed an id, and hosts saw their first `apply` arrive as commit 2
with a gap they never received.

The pending-migration pass, the document-profile write, and the initial paragraph
now all land before the pipeline's dispatch callback and the CRDT observer are
wired, so none of them produces a `CommitEvent`. A host's first `apply` is commit 1,
and a freshly created editor is handed over in the same state as a loaded one: no
`lastChangeSummary`, next commit 1.

`rebindActiveScope` carried a second copy of the same construction sequence and is
brought in line, which also fixes an ordering bug there: it persisted the document
profile before running pending migrations, and persisting refreshes the format
stamp, so a stamp-2 document would have been marked current and never migrated.
