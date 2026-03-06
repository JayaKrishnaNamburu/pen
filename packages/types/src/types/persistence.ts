export interface PenPersistence {
  loadDocument(docId: string): Promise<Uint8Array | null>;
  saveSnapshot(docId: string, state: Uint8Array): Promise<void>;
  appendUpdate(docId: string, update: Uint8Array): Promise<void>;
  getUpdates(docId: string, since?: Uint8Array): Promise<Uint8Array[]>;
  compact(docId: string): Promise<void>;
  saveVersionSnapshot(
    docId: string,
    snapshot: Uint8Array,
    metadata: VersionMetadata,
  ): Promise<void>;
  listVersions(
    docId: string,
    options?: { limit?: number; before?: string },
  ): Promise<VersionEntry[]>;
  loadVersion(
    docId: string,
    versionId: string,
  ): Promise<{ state: Uint8Array; snapshot: Uint8Array }>;
}

export interface VersionMetadata {
  label?: string;
  trigger: "auto" | "manual" | "ai-generation" | "import";
  clientId: number;
  timestamp: number;
}

export interface VersionEntry {
  id: string;
  metadata: VersionMetadata;
  createdAt: number;
}

export interface AssetRef {
  id: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface AssetUploadOptions {
  mimeType?: string;
  maxSize?: number;
  onProgress?: (progress: number) => void;
}

export interface AssetProvider {
  upload(file: File | Blob, options?: AssetUploadOptions): Promise<AssetRef>;
  resolve(ref: AssetRef): string;
  delete(ref: AssetRef): Promise<void>;
}
