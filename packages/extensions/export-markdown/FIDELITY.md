# Markdown export fidelity (IOP3)

Pen markdown is GitHub-flavored Markdown for blocks with a standard representation, plus Pen-specific constructs for the rest. A non-Pen reader sees GFM for headings, lists, code, tables, images, and emphasis. Subdocument and toggle become HTML comments or raw HTML.

Generated from `src/fidelityTable.ts` and asserted by `src/__tests__/iop3Fidelity.test.ts`. Do not edit by hand.

| Kind | Type | Fidelity | Notes |
| --- | --- | --- | --- |
| block | paragraph | full |  |
| block | heading | full |  |
| block | bulletListItem | full |  |
| block | numberedListItem | full |  |
| block | checkListItem | full |  |
| block | codeBlock | full |  |
| block | image | degraded | caption dropped; hostile src omitted (SEC1) |
| block | table | full | GFM pipe-table; tables without a header row fall back to HTML |
| block | divider | full |  |
| block | callout | degraded | blockquote with Note/Warning/Error prefix |
| block | toggle | degraded | raw HTML details (Pen-specific) |
| block | blockquote | full |  |
| block | subdocument | dropped | comment marker only; nested document dropped |
| mark | bold | full |  |
| mark | italic | full |  |
| mark | underline | degraded | raw <u> HTML |
| mark | strikethrough | full |  |
| mark | highlight | degraded | ==text== (not CommonMark) |
| mark | textColor | dropped |  |
| mark | backgroundColor | dropped |  |
| mark | link | full | hostile href omitted (SEC1) |
| mark | code | full |  |
| inline-node | mention | dropped | non-string inserts omitted |
| inline-node | inlineApp | dropped | non-string inserts omitted |
