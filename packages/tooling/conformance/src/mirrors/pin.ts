import type { GeometryReader as SourceGeometryReader } from "@input/pen-dom";
import type { GeometryReader as MirrorGeometryReader } from "./geometryReader";

type Missing<Source, Mirror> = Exclude<keyof Source, keyof Mirror>;
type Extra<Source, Mirror> = Exclude<keyof Mirror, keyof Source>;
type Shared<Source, Mirror> = keyof Source & keyof Mirror;
type Disagree<Source, Mirror> = {
	[K in Shared<Source, Mirror>]: [Source[K]] extends [Mirror[K]]
		? [Mirror[K]] extends [Source[K]]
			? never
			: K
		: K;
}[Shared<Source, Mirror>];

/**
 * Bidirectional pin: missing keys, extra keys, and field-type
 * disagreement each produce a distinct error shape that names the
 * mirror and the field. Assign `{ mirror, ok: true }` only when exact.
 */
export type PinResult<Name extends string, Source, Mirror> = [Missing<
	Source,
	Mirror
>] extends [never]
	? [Extra<Source, Mirror>] extends [never]
		? [Disagree<Source, Mirror>] extends [never]
			? { readonly mirror: Name; readonly ok: true }
			: { readonly mirror: Name; readonly typeDisagree: Disagree<Source, Mirror> }
		: { readonly mirror: Name; readonly extra: Extra<Source, Mirror> }
	: { readonly mirror: Name; readonly missing: Missing<Source, Mirror> };

export const geometryReaderPin: PinResult<
	"GeometryReader",
	SourceGeometryReader,
	MirrorGeometryReader
> = {
	mirror: "GeometryReader",
	ok: true,
};
