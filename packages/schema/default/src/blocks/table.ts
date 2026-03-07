import { defineBlock, prop } from "@pen/types";

export const table = defineBlock("table", {
  props: {
    hasHeaderRow: prop
      .boolean()
      .default(false)
      .describe("First row is a header"),
    hasHeaderColumn: prop
      .boolean()
      .default(false)
      .describe("First column is a header"),
    columnWidths: prop
      .array(prop.number())
      .optional()
      .describe("Column widths in pixels"),
  },
  content: "table",
  fieldEditor: "table",
  display: {
    title: "Table",
    description: "Data table with rows and columns",
    group: "advanced",
    aliases: ["grid", "spreadsheet"],
  },
  serialize: {
    toMarkdown: () => "[table]",
    toHTML: () => "<table></table>",
  },
});
