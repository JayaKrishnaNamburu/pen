interface TabsProps<Value extends string> {
	items: { value: Value; label: string }[];
	active: Value;
	onChange: (value: Value) => void;
}

/**
 * A row of tabs, ported from Input's `Tabs`.
 *
 * There is no track. The tabs sit bare and the selected one gets a pill behind
 * it, which slides when the selection moves. Input animates that pill with
 * framer-motion's shared layout, so it can travel between tabs of different
 * widths; here the tabs are equal width, so the pill's offset is one
 * multiplication and CSS can animate it.
 *
 * Pair it with an element that has `role="tabpanel"` and
 * `aria-labelledby={tabId(active)}`.
 */
export function Tabs<Value extends string>({
	items,
	active,
	onChange,
}: TabsProps<Value>) {
	const activeIndex = items.findIndex((item) => item.value === active);

	const tabItems = items.map((item) => (
		<button
			key={item.value}
			id={tabId(item.value)}
			type="button"
			role="tab"
			className="tab"
			aria-selected={item.value === active}
			onClick={() => onChange(item.value)}
		>
			{item.label}
		</button>
	));

	return (
		<div className="tabs" role="tablist">
			<span
				className="tab-selector"
				style={{
					width: `${100 / items.length}%`,
					transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
				}}
			/>
			{tabItems}
		</div>
	);
}

export function tabId(value: string): string {
	return `tab-${value}`;
}
