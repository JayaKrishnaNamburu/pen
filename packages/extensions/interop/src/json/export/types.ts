export interface PenMarkJSON {
  type: string;
  start: number;
  end: number;
  props?: Record<string, unknown>;
}

export interface PenInlineTextSegmentJSON {
  type: "text";
  text: string;
  attributes?: Record<string, unknown>;
}

export interface PenInlineNodeSegmentJSON {
  type: "node";
  nodeType: string;
  props?: Record<string, unknown>;
}

export type PenInlineSegmentJSON =
  | PenInlineTextSegmentJSON
  | PenInlineNodeSegmentJSON;

export interface PenInlineContentJSON {
  text: string;
  marks?: PenMarkJSON[];
  segments?: PenInlineSegmentJSON[];
}

export interface PenBlockJSON {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: PenInlineContentJSON;
  children?: PenBlockJSON[];
}

export interface PenDocumentJSON {
  version: 1;
  metadata?: Record<string, unknown>;
  blocks: PenBlockJSON[];
}

export type PenJsonExportExtraOptions = Record<string, unknown> & {
  metadata?: Record<string, unknown>;
};
