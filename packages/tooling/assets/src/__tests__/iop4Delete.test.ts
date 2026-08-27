import { describe, expect, it } from "vitest";
import { memoryAssets } from "../index";

describe("IOP4 AssetProvider.delete is host-owned", () => {
  it("exists on the memory provider", () => {
    const provider = memoryAssets();
    expect(typeof provider.delete).toBe("function");
  });

  it("implements delete without unused-asset GC across documents", async () => {
    const provider = memoryAssets();
    const ref = await provider.upload(new Blob(["shared"], { type: "text/plain" }), {
      mimeType: "text/plain",
    });

    // Two documents can share this provider. Dropping the block in one is
    // not a delete — the host owns reference counting.
    expect(provider.resolve({ ...ref, url: "not-stored" })).toBe(ref.url);

    await provider.delete(ref);
    expect(provider.resolve({ ...ref, url: "not-stored" })).toBe("not-stored");
  });
});
