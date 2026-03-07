import type { DocumentRange } from "./documentRange.js";

export interface TextSelection {
  type: "text";
  anchor: { blockId: string; offset: number };
  focus: { blockId: string; offset: number };

  readonly isCollapsed: boolean;
  readonly isMultiBlock: boolean;
  readonly blockRange: string[];

  toRange(): DocumentRange;
}

export interface BlockSelection {
  type: "block";
  readonly blockIds: readonly string[];
}

export interface AppSelection {
  type: "app";
  appId: string;
}

export interface CellSelection {
  type: "cell";
  blockId: string;
  anchor: { row: number; col: number };
  head: { row: number; col: number };
}

export type SelectionState =
  | TextSelection
  | BlockSelection
  | AppSelection
  | CellSelection
  | null;
