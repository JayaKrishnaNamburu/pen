import type { ComponentPropsWithoutRef } from "react";

/**
 * The card, ported from Input's `Tile`.
 *
 * A filled surface with a generous radius and no border. What reads as an edge
 * is `--input-shadow-default` painted by an overlay pseudo-element: a soft drop
 * shadow plus a 1px inset hairline, thickening on `:focus-within`. The overlay
 * sits above the content and ignores the pointer, so a card wrapping a text
 * field keeps its crisp edge while the field inside it stays clickable — that is
 * the whole reason Input draws it this way rather than with `border`.
 *
 * Input's tile also turns translucent and blurs under the macOS client. That
 * variant is not here.
 */
function TileSurface({
	className,
	...divProps
}: ComponentPropsWithoutRef<"div">) {
	return <div className={joinTileClasses(className)} {...divProps} />;
}

/**
 * A tile you can press.
 *
 * Input makes these by putting `onClick` on the tile div. This one is a real
 * `<button>`, so it answers the keyboard too.
 */
function TileButton({
	className,
	...buttonProps
}: ComponentPropsWithoutRef<"button">) {
	return (
		<button
			type="button"
			className={joinTileClasses(className, "tile-interactive")}
			{...buttonProps}
		/>
	);
}

function joinTileClasses(...names: (string | undefined)[]): string {
	return ["tile", ...names.filter(Boolean)].join(" ");
}

export const Tile = Object.assign(TileSurface, { Button: TileButton });
