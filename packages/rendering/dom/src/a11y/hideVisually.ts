/** Clip-hide for AT-management nodes (AX2 live region, AX1 focus sink). */
export function hideVisually(element: HTMLElement): void {
	element.style.position = "absolute";
	element.style.width = "1px";
	element.style.height = "1px";
	element.style.padding = "0";
	element.style.margin = "-1px";
	element.style.overflow = "hidden";
	element.style.clip = "rect(0 0 0 0)";
	element.style.whiteSpace = "nowrap";
	element.style.border = "0";
}
