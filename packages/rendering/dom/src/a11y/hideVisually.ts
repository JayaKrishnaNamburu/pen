/**
 * Clip-hide for AT-management nodes (AX2 live region, AX1 focus sink).
 * Clipping is what keeps a focused sink from painting a host
 * `:focus-visible` ring, so `clip` ships alongside its `clip-path`
 * successor rather than being replaced by it.
 */
export function hideVisually(element: HTMLElement): void {
	element.style.position = "absolute";
	element.style.width = "1px";
	element.style.height = "1px";
	element.style.padding = "0";
	element.style.margin = "-1px";
	element.style.overflow = "hidden";
	element.style.clip = "rect(0 0 0 0)";
	element.style.clipPath = "inset(50%)";
	element.style.whiteSpace = "nowrap";
	element.style.border = "0";
}
