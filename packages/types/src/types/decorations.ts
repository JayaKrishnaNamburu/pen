import type { Unsubscribe } from "./utility";

export type Decoration =
  | InlineDecoration
  | BlockDecoration
  | AppDecoration;

export interface InlineDecoration {
  type: "inline";
  blockId: string;
  from: number;
  to: number;
  attributes: Record<string, string | number | boolean>;
  key?: string;
}

export interface BlockDecoration {
  type: "block";
  blockId: string;
  attributes: Record<string, string | number | boolean>;
  position?: "before" | "after" | "wrap";
}

export interface AppDecoration {
  type: "app";
  blockId: string;
  offset: number;
  component: unknown;
  key: string;
}

export interface DecorationSet {
  readonly decorations: readonly Decoration[];
  readonly generation: number;

  forBlock(blockId: string): readonly Decoration[];
  inlineForBlock(blockId: string): readonly InlineDecoration[];

  equals(other: DecorationSet): boolean;
  map(mapping: PositionMapping): DecorationSet;
}

export interface PositionMapping {
  readonly affectedBlocks: readonly string[];
  mapOffset(blockId: string, offset: number): number;
}
