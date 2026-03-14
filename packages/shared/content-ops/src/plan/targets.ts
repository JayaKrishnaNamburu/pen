import type {
  DatabaseViewState,
  DocumentProfile,
  FlowBlockCapability,
  TableColumnSchema,
} from "@pen/types";

export const STRUCTURED_TARGET_KINDS = [
  "block",
  "table",
  "database",
] as const;

export type StructuredTargetKind =
  (typeof STRUCTURED_TARGET_KINDS)[number];

export const TARGET_EDITABILITIES = [
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

export interface DatabaseTargetDescriptor extends BaseTargetDescriptor {
  kind: "database";
  rowCount: number;
  columns: TableColumnSchema[];
  views: DatabaseViewState[];
  activeViewId: string | null;
}

export type StructuredTargetDescriptor =
  | BlockTargetDescriptor
  | TableTargetDescriptor
  | DatabaseTargetDescriptor;
