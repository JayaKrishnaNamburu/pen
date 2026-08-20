import type { BlockA11ySpec, BlockSchema } from "@input/pen-types";

export type BlockSchemaWithA11y<
	S = BlockSchema,
	Props = Record<string, unknown>,
> = S & {
	readonly a11y: Readonly<BlockA11ySpec<Props>>;
};

function freezeA11ySpec<Props>(
	spec: BlockA11ySpec<Props>,
): Readonly<BlockA11ySpec<Props>> {
	const copy: BlockA11ySpec<Props> = { label: spec.label };
	if (spec.roleDescription !== undefined) {
		copy.roleDescription = spec.roleDescription;
	}
	return Object.freeze(copy);
}

export function attachA11y<S extends object, Props>(
	schema: S,
	spec: BlockA11ySpec<Props>,
): BlockSchemaWithA11y<Omit<S, "a11y">, Props> {
	return {
		...schema,
		a11y: freezeA11ySpec(spec),
	};
}

export const withA11y = attachA11y;
