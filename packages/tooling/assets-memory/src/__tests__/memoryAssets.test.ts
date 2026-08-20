import { describe, expect, it } from "vitest";
import { memoryAssets } from "../index";

describe("AC 20 — memoryAssets", () => {
  it("upload returns a valid AssetRef", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob, { mimeType: "text/plain" });

    expect(ref.id).toBeTruthy();
    expect(ref.url).toBeTruthy();
    expect(ref.mimeType).toBe("text/plain");
    expect(ref.size).toBe(blob.size);
  });

  it("resolve returns a usable URL", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob);

    const url = provider.resolve(ref);
    expect(url).toBeTruthy();
    expect(typeof url).toBe("string");
  });

  it("resolve returns ref.url for unknown ref", () => {
    const provider = memoryAssets();
    const fakeRef = {
      id: "unknown-id",
      url: "https://example.com/file.txt",
      mimeType: "text/plain",
      size: 100,
    };
    expect(provider.resolve(fakeRef)).toBe("https://example.com/file.txt");
  });

  it("delete removes from store", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const ref = await provider.upload(blob);

    await provider.delete(ref);

    expect(provider.resolve(ref)).toBe(ref.url);
  });

  it("IOP4 observes onProgress during upload", async () => {
    const provider = memoryAssets();
    const blob = new Blob(["hello"], { type: "text/plain" });
    const progress: number[] = [];
    await provider.upload(blob, {
      onProgress: (p) => {
        progress.push(p);
      },
    });
    expect(progress).toEqual([0, 1]);
  });

  it("IOP4 rejects oversize uploads naming the limit and actual size", async () => {
    const provider = memoryAssets({ maxSize: 4 });
    const blob = new Blob(["hello-world"], { type: "text/plain" });

    await expect(provider.upload(blob, { maxSize: 4 })).rejects.toThrow(
      /11.*maxSize 4/,
    );
  });
});
