import type { AssetProvider, AssetRef, AssetUploadOptions } from "@pen/types";

export function memoryAssets(): AssetProvider {
  const store = new Map<string, { blob: Blob; ref: AssetRef }>();

  return {
    async upload(
      file: File | Blob,
      options?: AssetUploadOptions,
    ): Promise<AssetRef> {
      const id = crypto.randomUUID();
      const url =
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : `blob:memory/${id}`;
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
