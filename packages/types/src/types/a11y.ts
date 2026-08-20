export interface BlockA11ySpec<Props = Record<string, unknown>> {
	label: string | ((props: Props) => string);
	roleDescription?: string;
}
