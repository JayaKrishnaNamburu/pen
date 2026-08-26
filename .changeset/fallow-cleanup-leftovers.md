---
"@input/pen-react": patch
---

Drop the unused `columnType` prop from `TableCellContent`. Vue never had it, and the React table renderer never passed it.
