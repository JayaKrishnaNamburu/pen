export interface BlockA11ySpec<Props = Record<string, unknown>> {
	label: string | ((props: Props) => string);
	roleDescription?: string;
}

/** Surface label for `pen.a11yLabel`: `aria-label` string or `aria-labelledby` id. */
export type A11yLabel = string | { readonly labelledBy: string };

export function isA11yLabelledBy(
	value: A11yLabel,
): value is { readonly labelledBy: string } {
	return typeof value === "object" && value !== null && "labelledBy" in value;
}

export interface EditorAnnouncer {
	announce(
		message: string,
		priority?: "polite" | "assertive",
		key?: string,
	): void;
}
