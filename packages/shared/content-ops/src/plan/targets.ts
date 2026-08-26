import type {
  DocumentProfile,
  FlowBlockCapability,
  TableColumnSchema,
} from "@input/pen-types";

const STRUCTURED_TARGET_KINDS = [
  "block",
  "table",
] as const;

export type StructuredTargetKind =
  (typeof STRUCTURED_TARGET_KINDS)[number];

const TARGET_EDITABILITIES = [
  "editable",
  "read-only",
  "unsupported",
] as const;

export type TargetEditability = (typeof TARGET_EDITABILITIES)[number];

interface BaseTargetDescriptor {
  kind: StructuredTargetKind;
  blockId: string;
  blockType: string;
  documentProfile: DocumentProfile;
  editability: TargetEditability;
}

export interface BlockTargetDescriptor extends BaseTargetDescriptor {
  kind: "block";
  flowCapability: FlowBlockCapability | null;
  supportsTextContent: boolean;
  supportsChildren: boolean;
  propSchemaKeys: string[];
}

export interface TableTargetDescriptor extends BaseTargetDescriptor {
  kind: "table";
  rowCount: number;
  columnCount: number;
  columns: TableColumnSchema[];
}

export type StructuredTargetDescriptor =
  | BlockTargetDescriptor
  | TableTargetDescriptor;
