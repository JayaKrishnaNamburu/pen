import type { PendingBlock } from "@pen/core";

export interface InlineMark {
  type: string;
  props?: Record<string, unknown>;
  start: number;
  end: number;
}

export interface BlockMapping {
  mdastType: string;
  blockType: string;
  propsFromNode?: (node: unknown) => Record<string, unknown>;
}

export type { PendingBlock };

// mdast node types (minimal interface for type safety)

export interface MdastNode {
  type: string;
  children?: MdastNode[];
  value?: string;
  url?: string;
  alt?: string;
  title?: string | null;
  depth?: number;
  lang?: string | null;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
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
