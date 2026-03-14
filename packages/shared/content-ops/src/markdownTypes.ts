import type { MarkdownNode } from "@pen/types";
import type { PendingBlock } from "./blocks";

export interface InlineMark {
  type: string;
  props?: Record<string, unknown>;
  start: number;
  end: number;
}

export type { PendingBlock };

export interface MdastNode extends MarkdownNode {
  children?: MdastNode[];
}

export interface MdastRoot {
  type: "root";
  children: MdastNode[];
}

export interface MdastList extends MdastNode {
  type: "list";
  ordered?: boolean;
  start?: number | null;
  children: MdastListItem[];
}

export interface MdastListItem extends MdastNode {
  type: "listItem";
  checked?: boolean | null;
}

export interface MdastTable extends MdastNode {
  type: "table";
  children: MdastTableRow[];
}

export interface MdastTableRow extends MdastNode {
  type: "tableRow";
  children: MdastTableCell[];
}

export interface MdastTableCell extends MdastNode {
  type: "tableCell";
}
