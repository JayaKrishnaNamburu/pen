import type { AssetProvider, AssetRef, AssetUploadOptions } from "@input/pen-types";
import { generateId } from "@input/pen-types";

export interface MemoryAssetsOptions {
  /**
   * Maximum accepted upload size in bytes. Exposed as
   * {@link AssetProvider.maxSize} and used as the default when `upload` omits
   * {@link AssetUploadOptions.maxSize}.
   */
  maxSize?: number;
  /**
   * Failure double (IOP4). When set, `upload` rejects with this error after
   * the size check and does not store.
   */
  rejectUpload?: Error;
  /**
   * Mid-transfer failure double. Invokes `onProgress(0)` then rejects
   * without storing.
   */
  rejectAfterProgress?: Error;
  /**
   * Override the stored URL. Used to simulate a provider that returns a
   * malformed or hostile URL. `resolve` does not admit URLs — hosts and
   * importers must apply SEC1 themselves.
   */
  uploadUrl?: string;
}

/**
 * In-memory `AssetProvider` test double. Not a production store.
 *
 * `upload` implements both {@link AssetUploadOptions} members: it enforces
 * `options.maxSize ?? config.maxSize` (throws `File size <n> exceeds maxSize
 * <limit>` and does not store) and invokes `onProgress` at `0` then `1`.
 * There are no intermediate ticks — the write is in-memory.
 *
 * `delete` is implemented for host/test use. Pen never calls
 * {@link AssetProvider.delete}; hosts own reference counting.
 */
export function memoryAssets(config: MemoryAssetsOptions = {}): AssetProvider {
  const store = new Map<string, { blob: Blob; ref: AssetRef }>();

  return {
    maxSize: config.maxSize,

    async upload(
      file: File | Blob,
      options?: AssetUploadOptions,
    ): Promise<AssetRef> {
      const maxSize = options?.maxSize ?? config.maxSize;
      if (maxSize != null && file.size > maxSize) {
        throw new Error(
          `File size ${file.size} exceeds maxSize ${maxSize}`,
        );
      }
      if (config.rejectUpload) {
        throw config.rejectUpload;
      }

      options?.onProgress?.(0);
      if (config.rejectAfterProgress) {
        throw config.rejectAfterProgress;
      }
      const id = generateId();
      const url =
        config.uploadUrl ??
        (typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : `blob:memory/${id}`);
      const ref: AssetRef = {
        id,
        url,
        mimeType:
          options?.mimeType ??
          (file as File).type ??
          "application/octet-stream",
        size: file.size,
      };
      store.set(id, { blob: file, ref });
      options?.onProgress?.(1);
      return ref;
    },

    resolve(ref: AssetRef): string {
      return store.get(ref.id)?.ref.url ?? ref.url;
    },

    async delete(ref: AssetRef): Promise<void> {
      const entry = store.get(ref.id);
      if (entry) {
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(entry.ref.url);
        }
        store.delete(ref.id);
      }
    },
  };
}
